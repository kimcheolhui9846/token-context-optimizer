# 6.4b-6 (N-33) — buildSourceMap 스택 초과: 계획·재현·사전등록

Tier E(새 재현 실행 결과 포함). 기준 main `82a5cd4e209a5ccc1e3215cefb923ae8e482f16c`, 브랜치 `kimcheolhui9846/n33-source-map-plan`. 작성 Claude Code(claude-opus-5-5), 최종 검토 Codex(Astra). **제품(src/·bin/)·기존 테스트 변경 없음. 구현은 이 계획 검토와 사용자 승인 뒤 별도 Task.** 6.4b-5 구현은 이 Task 뒤에 둔다.

## 1. 현상과 재현 (RED = 재현된 기존 실패, GREEN = 아직 없음)

`src/core/artifacts.ts:344–364`의 private `buildSourceMap`은 `[...content.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/gu)]`로 전체 match 배열을 만든 뒤 filter/map 한다. `indexArtifact` 기본 상한은 `10 * 1024 * 1024` B다.

- PM 재현(정규식 단위, 참고): `'a'.repeat(10485760)`은 성공, `'a'.repeat(10485756)+U+1F600`(10,485,760 B)은 `RangeError: Maximum call stack size exceeded`. 아래는 이와 별개인 public 경로 재현이다.
- public 재현: [스크립트](../../../research/src/6-4b-6-source-map-repro.mjs), [원자료](../../../research/results/6-4b-6-source-map-repro.json). 경우마다 hidden child 하나를 순차 실행, 기본 heap/stack, fresh `MemoryArtifactStore`, 자기 `mkdtemp` 폴더만 쓰고 지움(9/9 삭제 확인), 기존 출력 덮어쓰기 거부, 오류 시 재시도 없음.
- 환경: Windows 10.0.26200, Node v24.18.0, V8 13.6.233.17-node.50, i9-12900F. `artifacts.ts` blob `e4a24bf6…`, dist는 `npx tsc -p tsconfig.json`만으로 생성(번들 미생성, src/bin 차분 0).

| 경우 | UTF-8 B / UTF-16 길이 | 역할 | 결과(3회) |
|---|---|---|---|
| `a`×10,485,760 | 10,485,760 / 10,485,760 | ASCII 대조군 | 성공 3/3, 수학 기대값 일치 3/3 |
| `a`×10,485,756 + 😀 | 10,485,760 / 10,485,758 | RED | `RangeError: Maximum call stack size exceeded` 3/3, 최상위 frame `RegExpStringIterator.next` ← `buildSourceMap` ← `indexArtifact` |
| `a`×1,048,572 + 😀 | 1,048,576 / 1,048,574 | 1 MiB+emoji 대조군 | 성공 3/3, 기대값 일치 3/3 |

세 입력 모두 상한 이하(`≤ 10485760`)라 정상 상한 거부가 아니다. 기록된 elapsedMs는 정보용이며 실패한 BASE 시간은 어떤 성공 기준에도 쓰지 않는다.
정보용 사전 확인(scratch 1회, 원자료 미보존): RED 입력의 수학적 source map을 손으로 만든 기록을 store에 넣으면 BASE `queryArtifact`(maxTokens 200)는 `source_span_exceeds_budget`, `summarizeArtifact`는 `exact_content_requires_source`로 예외 없이 끝났다. 구현 뒤 public 경로로 다시 확인한다.

## 2. 보존 계약 (BASE에서 literal로 확인, 10/10 일치)

`SourceLine{line,startByte,endByte,text,delimiter}` 전 필드를 바꾸지 않는다. `endByte`는 delimiter 제외, 다음 `startByte`는 delimiter 포함. 빈 파일은 `[]`, 마지막 개행 뒤에 가짜 빈 줄 없음, 연속 개행은 실제 빈 줄, CRLF는 delimiter 하나, `\n\r`은 둘. BOM은 `decodeUtf8Strict`(`ignoreBOM: true`)가 보존해 1행 text에 들어간다.

| ID | 입력 | 기대 source map (`[line,startByte,endByte,text,delimiter]`) |
|---|---|---|
| L1 | `""` | `[]` |
| L2–L3 | `a` / `a\n` | `[1,0,1,"a",""]` / `[1,0,1,"a","\n"]` |
| L4 | `a\n\n` | `[1,0,1,"a","\n"]`,`[2,2,2,"","\n"]` |
| L5 | `\r\n` | `[1,0,0,"","\r\n"]` |
| L6 | `a\r\nb\rc\nd` | `[1,0,1,"a","\r\n"]`,`[2,3,4,"b","\r"]`,`[3,5,6,"c","\n"]`,`[4,7,8,"d",""]` |
| L7 | `\n\r` | `[1,0,0,"","\n"]`,`[2,1,1,"","\r"]` |
| L8 | BOM+`가\n😀` | `[1,0,6,"\uFEFF가","\n"]`,`[2,7,11,"😀",""]` |
| L9 | `e`+U+0301+NUL+`\r\r\n` | `[1,0,4,"e\u0301\u0000","\r"]`,`[2,5,5,"","\r\n"]` |
| L10 | `中文\r` | `[1,0,6,"中文","\r"]` |

## 3. 제안 구현 (이번 PR에서 하지 않음)

UTF-16 인덱스로 content를 한 번 순차 스캔해 `\r`/`\n`(charCode 13/10)을 찾고, `\r` 바로 뒤 `\n`이면 CRLF 하나로 묶는다. 줄마다 `content.slice(start, end)`와 `Buffer.byteLength(text,"utf8")`, delimiter 바이트(1 또는 2)로 UTF-8 offset을 누적한다. 마지막 delimiter 뒤가 빈 문자열이면 줄을 추가하지 않는다. 전체 match 배열과 filter/map 중간 배열을 없앤다. public export·API·schema·상한·오류 정책은 바꾸지 않는다. 서로게이트 쌍과 결합 문자는 개행이 아니어서 분할 대상이 아니다(strict decode라 고립 서로게이트 없음).

## 4. RED·회귀 테스트 계획 (구현 PR, RED 먼저)

- **R1(재현된 RED):** 정확히 10 MiB ASCII+끝 😀 public `indexArtifact`가 성공하고 `lineCount 1, [1,0,10485760,text===content,""]`, `byteLength 10485760`. BASE는 위 RangeError로 실패.
- 대조(BASE도 GREEN, 유지): 10 MiB ASCII, 1 MiB+emoji, NUL·제어 문자, L1–L10 literal, 다바이트 offset·개행 경계(LF/CRLF/CR/혼합, 끝 개행 유무, 연속 개행).
- 추가 경계 후보(emoji 시작/중간, 한글·CJK 10 MiB 한 줄, 다수 astral)는 RED 작성 시 BASE 결과를 먼저 확인해 RED/대조로 분류한다. 지금 RED라고 주장하지 않는다.
- 독립 oracle: (a) 위 literal, (b) BASE regex 함수를 `legacyBuildSourceMap`으로 테스트에 고정한 differential — 알파벳 {`a`,`é`,`가`,`😀`,U+0301,NUL,BOM,`\r`,`\n`} 길이 0–4 전수(7,381개) + 고정 seed 3,000개(길이 ≤512, seed·생성기 테스트에 기록). legacy는 안전한 짧은 입력에만 쓴다. (c) 큰 입력은 R1처럼 수학식으로 기대값을 적는다. 새 알고리즘을 테스트에서 다시 구현하지 않는다.
- 회귀: 10,485,761 B는 기존 `too_large`, 잘못된 UTF-8은 `Artifact must be valid UTF-8 text` 그대로. 구현 뒤 query/excerpt/summary 소비자(`artifacts.ts` :111·:197–198·:226–228·:298–319·:382·:502–505)와 tests/core·query-artifact-boundaries·query-artifact-mcp·summarizer-selection 통과.
- 검증 gate(구현 PR에서 실행, **이번 PR에서는 미실행이며 PASS가 아니다**): `npm ci --ignore-scripts` → `npm run build` → `npm test` → `npm run typecheck` → `npm run smoke:mcp` → `npm run validate:plugin` → `npm run benchmark` → `git diff --check`. build가 만든 `bin/` CRLF 차분은 의도치 않으면 해당 파일만 복구한다.

## 5. 성능 사전등록안 (수치는 후보, 사용자 승인 필요)

- 비교 대상은 **BASE가 성공하는 입력만**. R1 같은 실패 입력은 correctness/recovery 전용이며 BASE 시간과 비율을 만들지 않는다. 측정 단위는 public `indexArtifact` 왕복(파일 읽기·SHA 포함, 호출마다 fresh store). BASE/후보는 별도 archive·build를 같은 프로세스에서 교대한다.
- 필수 형태(각 1 MiB, 측정 전 BASE 1회 사전 실행으로 성공 확인, 실패 형태는 측정 전에 correctness 집합으로 옮겨 기록): S1 ASCII 한 줄, S2 다국어 긴 줄(64 KiB 줄에 한글·中文·é·😀 반복), S3 짧은 줄 밀집(`a\n`), S4 LF 빈 줄(`\n`), S5 CRLF/LF/CR 혼합 문장, S6 2 KiB 문장 파일 batch.
- 표본: 호출 K개를 묶어 표본당 ≥5 ms. K는 BASE 보정으로 측정 전에 정해 기록하고 두 arm에 같게 쓴다. arm당 warmup 5, ABBA 15주기(arm당 30표본). 중앙값 `sorted[ceil(.5n)-1]`, p95 `sorted[ceil(.95n)-1]`.
- A/A(BASE 두 사본, 후보 두 사본 각각): 중앙값 비 [0.95, 1.05] 또는 |Δ| ≤ 0.1 ms, 그리고 |Δp95| ≤ max(0.2 ms, 20%). 절대 하한은 6.4b-4 사전등록과 같게 두어 표본 ≥5 ms에서 비율 창을 느슨하게 만들지 않는다. 무효면 30초 뒤 시도 전체 재실행, 최대 2회 재시도. 세 번째 무효는 필수 gate INVALID(PASS 아님)로 멈춘다.
- **후보 임계값 G-T:** 형태마다 후보 중앙값 ≤ max(BASE×1.10, BASE+0.5 ms), p95 ≤ max(BASE×1.20, BASE+1 ms). 근거: F-21에서 3%는 잡음으로 경계 판정이 났고(research/plans/2026-11-02-perf-gate-noise.md), 단일 스캔은 match 배열 할당을 없애 BASE 이하가 예상되나 미측정이다. 0% 비회귀는 쓰지 않는다. 유효 FAIL은 재시도·강등·사후 완화하지 않고 멈춘 뒤, 같은 의미의 더 빠른 구현을 새 사전등록 커밋으로 다시 낸다.
- 정보용 블록(필수 gate 뒤, A/A 무효여도 전체를 막지 않음): 10 MiB ASCII 한 줄 BASE/후보, R1 입력의 후보 단독 완료 시간(비율 없음, child timeout 120초).
- 보존: 원시 표본 순서·시간·상태, 환경, 소스 blob 해시(blob 기준임을 표기)와 dist 작업 사본 해시, 사전등록 커밋, 종료 조건, 기존 출력 덮어쓰기 거부.

## 6. 메모리 사전등록안 (수치는 후보, 사용자 승인 필요)

- arm×형태×반복마다 fresh hidden child, `--expose-gc` 외 heap 플래그 없음(default heap), **대형 child는 한 번에 하나**. 3회 중앙값.
- 두 지표를 구분한다. P = `process.resourceUsage().maxRSS`(프로세스 high-water, 정확한 색인 peak 아님). R = 기록을 살려 둔 채 GC 3회 뒤 `heapUsed+external` − 읽기 전 같은 방식 baseline. `arrayBuffers`는 external 안에 있으므로 더하지 않는다.
- 형태: S1·S3·S4·S5 1 MiB, 10 MiB ASCII 한 줄. 후보 gate: R 후보 ≤ BASE + max(1 MiB, 2%), P 후보 ≤ BASE×1.10 + 32 MiB. R1 입력은 후보 단독 정보용(성공·기대값·P·R 기록).
- 빈 줄 10 MiB(이전 BASE maxRSS 약 2,714 MiB 보고)와 `a`+LF 10 MiB는 **이번에 실행하지 않는다.** 승인된 구현 단계의 정보용 진단으로만, 다른 대형 child 없이 단독 실행을 제안한다.

## 7. 사용자 결정 필요 · 범위 밖

- D-1 G-T 허용폭(10%/20% + 절대 하한) 채택 여부. D-2 메모리 허용폭(R 2%/1 MiB, P 10%+32 MiB). D-3 differential을 public `indexArtifact` 경유로 할지(권장, export 변경 없음), 내부 모듈 분리 export를 허용할지. D-4 구현 단계 빈 줄 10 MiB 단독 진단 실행 여부(권장: 실행, 정보용).
- 범위 밖: S-10 저장소 상한·LRU·E8 trim 삭제, estimator/policy/이미지/영상 코드, 의존성 업그레이드, 논문·기존 research 데이터. 이번 PR은 이 문서, 재현 스크립트와 그 원자료만 추가한다.
- Argon(gemini-4-argon) 교차 확인: APPROVE, 지적 0, 확인 불가 4(줄 번호·하드웨어·사전 확인·과거 수치)는 Claude가 원문·JSON env·read-bounded-file.ts:33·6.4b-5 계획으로 직접 대조. A/A 절대 하한 완화 참고 의견은 채택해 6.4b-4 값으로 맞췄다. 최종 판정은 Astra.
- 재현 명령(PowerShell, worktree): `npm ci --ignore-scripts`; `npx tsc -p tsconfig.json`; `node research/src/6-4b-6-source-map-repro.mjs --output=research/results/<새 이름>.json`.
