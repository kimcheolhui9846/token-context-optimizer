# 6.4b-6 (N-33) — buildSourceMap 스택 초과 수정과 메모리 정합

Tier E. base origin/main `dd334602bbbeb3777fcfe8ea3c40c7e0a682b2ca`(#110 merge), 브랜치 `claude/n33-source-map-impl`(Orca worktree `n33-source-map-impl`), Draft PR #111. 작성 Claude Code, 최종 검토 Codex(Astra). 근거: [계획](6-4b-6-source-map-plan.md), [사전등록 §1–§10](6-4b-6-source-map-impl-prereg.md), 사용자 승인 D1–D4, R2, P1+run5(2026-11-11).
- 실행 모델 근거: 세션 transcript(jsonl)의 assistant `model` 필드가 `claude-opus-5-5` 단일 값. 하위 에이전트 미사용.
- worktree 루트 `HANDOFF.md`는 `.gitignore` 대상 로컬 파일이다(추적 안 함).

## 1. 현재 상태 (2026-11-11)

- **제품:** private `buildSourceMap`이 `scanLines` 전진 CR/LF 스캔을 **두 번** 쓴다(P1, `daaac32`). 첫 번째 스캔은 줄 수만 세고, 두 번째 스캔이 `new Array<SourceLine>(count)`를 인덱스로 채운다. 이전 단일 스캔+`push` 구현(`cb76744`)은 run4 D2 S4 retained FAIL로 대체됐다.
- **성능·메모리:** run5(사전등록 `727961c`, §9 R2 그대로)는 timing S1–S6 PASS, memory 5형태 PASS, diagnostic 정보용 완료다. 작성자 자기 검증 기준으로 최종 승인 조건(timing PASS 그리고 memory PASS)을 충족했다.
- **검증:** 전체 gate가 P1 작업 트리와 `9002cab`에서 모두 exit 0이다(test 50파일 4354 통과/5 skip). primary 검토(`codex_review/review_2026-11-11_pr111-run5.md`)는 코드와 필수 gate를 PASS로 보고, Minor N1(이 문서의 현재형 충돌)만 반환했다.
- **남은 것:** primary 최종 판정, 사용자 Ready/merge 승인(head 고정). run6·S-10·6.4b-5 착수는 미승인이다. N-33은 merge 전까지 해결로 기록하지 않는다.

## 2. 구현 요약

- 줄 규칙: 다음 CR·LF를 `indexOf`로 찾아 캐시하고, 커서가 지나간 쪽만 다시 찾는다. CR 바로 뒤 LF는 CRLF 하나로 친다. 단독 CR·LF는 각각 delimiter다. 끝 delimiter 뒤가 비면 줄을 만들지 않는다. CR·LF는 서로게이트 절반이 아니어서 code point를 자르지 않는다.
- 줄마다 `slice` + `Buffer.byteLength`로 바이트를 계산한다. delimiter는 ASCII라 길이 = 바이트 수다. 두 스캔이 같은 helper를 쓰므로 count와 fill의 경계가 같다.
- 바꾸지 않음: public API/export/schema/상한/오류 정책/estimator/policy, strict UTF-8 decode, 의존성. 범위 밖: 저장소 상한·LRU·E8 trim(S-10), 이미지/영상, 논문.
- 구현 이력: `499a7bb` charCode 단일 스캔(run1 S1 FAIL) → `cb76744` indexOf 단일 스캔+push(run4 D2 S4 FAIL) → `daaac32` P1 두 번 스캔+정확 길이 배열(run5 PASS).

## 3. RED → GREEN (`tests/source-map.test.ts` 22건, public `indexArtifact`만 사용)

| 테스트 | BASE(dd33460) | 현재 | 분류 |
|---|---|---|---|
| 10 MiB `a`+😀 끝·시작·중간 3건 | `RangeError: Maximum call stack size exceeded` | 통과 | RED |
| 전부 astral, 한글 10 MiB, ASCII 10 MiB, 1 MiB+😀 | 통과 | 통과 | 대조 |
| `too_large`(10,485,761 B), invalid UTF-8 | 통과 | 통과 | 회귀 |
| L1–L10 literal(계획 §2) | 10/10 | 10/10 | 계약 |
| differential: 9기호 길이 0–4 전수 7,381 + seed `0x6a4b6` 3,000개 vs 고정 legacy regex oracle | — | 불일치 0 | 동치 |

- 큰 입력의 기대값은 수식으로 정한다. legacy oracle은 짧은 입력에만 쓴다. 메모리 수치 단위 테스트는 넣지 않았다.
- 원자료: [red-base-vitest.txt](../../../research/results/6-4b-6-source-map-impl/red-base-vitest.txt)(BASE 3 failed/19 passed), [green-targeted-vitest.txt](../../../research/results/6-4b-6-source-map-impl/green-targeted-vitest.txt). P1 뒤에도 22건이 통과했다.

## 4. 검증 gate

| 시점 | 결과 |
|---|---|
| BASE(구현 전) | npm ci/build/test/typecheck/smoke:mcp/validate:plugin/benchmark 모두 exit 0, test 49파일 4332/5 skip |
| `fffd213`, `b40d2c2`(단일 스캔 시기) | 모두 exit 0, test 50파일 4354/5 skip |
| P1 작업 트리(빌드 전 `M src/core/artifacts.ts`), `9002cab`(run5 뒤) | 모두 exit 0, test 50파일 4354/5 skip, benchmark passed, `9002cab` 빌드 뒤 변경 0 |
| `git diff --check origin/main...HEAD` | 0. 원자료 vitest 로그는 결과 폴더 `.gitattributes`(`*.txt -whitespace`)로 바이트를 그대로 보존 |

## 5. 성능·메모리 (D1·D2·D4) — 현재 판정은 run5

원자료는 [결과 폴더](../../../research/results/6-4b-6-source-map-impl/)에 있다. 재계산할 때 timing은 `timing.shapes[].attempts[].samples`의 `measure/` 표본을 arm별 30개로 나눠 nearest-rank(median `sorted[14]`, p95 `sorted[28]`)를 구한다. memory는 `memory.runs`를 형태·arm별 3개로 나눠 median을 구한다(R = after.sum − before.sum, P = maxRSS).

run5 timing([perf-run5-timing.json](../../../research/results/6-4b-6-source-map-impl/perf-run5-timing.json), 모두 1차 시도 유효, B1 vs C1 median/p95 ms):

| 형태 | K | BASE | 후보 | 한계 | A/A 비(B, C) |
|---|---|---|---|---|---|
| S1 | 32 | 105.45 / 121.98 | 93.20 / 101.34 | 115.99 / 146.38 | 1.004, 1.001 |
| S2 | 32 | 140.62 / 157.13 | 119.18 / 135.35 | 154.68 / 188.56 | 0.982, 0.979 |
| S3 | 4 | 420.50 / 519.98 | 112.56 / 155.33 | 462.55 / 623.98 | 1.018, 0.996 |
| S4 | 2 | 493.63 / 581.03 | 110.12 / 157.67 | 542.99 / 697.24 | 0.996, 0.957 |
| S5 | 16 | 110.74 / 127.65 | 80.81 / 107.26 | 121.82 / 153.18 | 1.000, 0.958 |
| S6 | 1 | 595.04 / 767.97 | 590.56 / 695.47 | 654.55 / 921.56 | 1.020, 0.959 |

- run5 memory([perf-run5-memory.json](../../../research/results/6-4b-6-source-map-impl/perf-run5-memory.json), child 30개 모두 completed, digest 일치, MiB, BASE/후보): S1 R 1.033/1.033 P 53.1/53.1, S3 R 37.037/37.043 P 226.0/126.5, **S4 R 73.040/73.042(한계 74.501)** P 362.7/160.5, S5 R 6.106/2.988 P 61.4/56.2, M10 R 10.033/10.033 P 71.2/71.2. 모두 PASS. S4 후보 R raw는 [76590528 ×3] B, BASE와의 차이는 +2,120 B다(run4는 +2,047,256 B).
- run5 diagnostic([perf-run5-diagnostic.json](../../../research/results/6-4b-6-source-map-impl/perf-run5-diagnostic.json), 정보용, 모두 completed·digest 일치): 빈 줄 10 MiB는 후보 537.8 ms·P 826.0 vs BASE 2,265.4 ms·P 2,645.8 MiB이고 R은 둘 다 730.0 MiB(+2,136 B)다. `a`+LF 10 MiB는 후보 332.7 ms·P 457.7 vs BASE 1,326.5 ms·P 1,564.4 MiB이고 R은 둘 다 370.0 MiB(+2,952 B)다.
- K는 형태마다 §9 보정으로 다시 고르므로 run 사이 절대 시간은 비교하지 않는다. S4 후보 P가 run4 148.5 → run5 160.5 MiB로 높아졌지만(한계 431.0) 원인은 확인하지 않았다.

### 이력 (보존, 판정은 run5가 대체)

| 실행 | 사전등록 / 측정 대상 | 결과 | 원자료 |
|---|---|---|---|
| run1 | `c709812` / charCode 단일 스캔 | S1 유효 FAIL(후보 9.48 vs BASE 5.29 ms), 중단 | [perf-run1.json](../../../research/results/6-4b-6-source-map-impl/perf-run1.json) |
| run2 | `97853ec` / indexOf 단일 스캔 | S1 3시도 A/A p95 무효 → 필수 INVALID | [perf-run2.json](../../../research/results/6-4b-6-source-map-impl/perf-run2.json), [noise-analysis.jsonl](../../../research/results/6-4b-6-source-map-impl/noise-analysis.jsonl) |
| run3 | `f13d42d` / 같음, K ≥ 50 ms | S1·S2 PASS, S3 A/A 3회 무효 → 필수 INVALID | [perf-run3.json](../../../research/results/6-4b-6-source-map-impl/perf-run3.json) |
| run4 | `032b1de` / 같음, 계획 R2 | timing PASS, **memory 유효 FAIL**(S4 R 74.993 > 74.501 MiB, raw [78635664, 78635648, 78635664] B), diagnostic 완료 | [timing](../../../research/results/6-4b-6-source-map-impl/perf-run4-timing.json), [memory](../../../research/results/6-4b-6-source-map-impl/perf-run4-memory.json), [diagnostic](../../../research/results/6-4b-6-source-map-impl/perf-run4-diagnostic.json), 사전 검사 거부 로그 2개 |
| run5 | `727961c` / P1 두 번 스캔 | timing PASS, memory PASS, diagnostic 완료 | 위 run5 링크 |

- run2의 급등 표본은 arm과 무관하게 약 16–17표본 간격으로 반복됐고, 이 간격이 ABBA 주기와 맞물려 한 arm에 몰렸다. GC 원인은 추정이며 인과는 입증하지 않았다. 이 때문에 R2(고정 12-순환)로 바꿨다.
- run4 S4 FAIL 원인은 scratch 진단(`codex_review/n33-retained-recovery/`, 함수 단독·≤1 MiB, gate 아님)에서 push 배열 backing store 여유 용량으로 지지됐다. 정확한 바이트 메커니즘은 미확인이다. 이전 문구 "3회 동일 값"은 MiB 반올림 기준이라 정정했다(`c1b1592`).

## 6. 교차 확인·검토·남은 위험

- Argon(gemini-4-argon, 작성자 자기 검증): 초기 계획, run4 사전등록·milestone, retained 계획, run5 사전등록·milestone 모두 APPROVE였다(`codex_review/argon/2026-11-11_n33-*`). run5 사전등록 Nit(§9 `-diag.json` 표기)은 실제 파일명이 `-diagnostic.json`이라 채택하지 않았다.
- Astra 검토: `review_2026-11-11_pr111-n33-impl.md`(CHANGES REQUIRED, 반영 완료), `review_2026-11-11_pr111-run5.md`(코드·gate PASS, Minor N1 → 이 문서 정리로 반영).
- 남은 위험: timing PASS는 R2로 한 번 측정한 결과이고, 순번 균형이 실제 경과 시간의 균형을 뜻하지는 않는다. P1 두 번째 스캔의 비용은 S1–S6 범위에서만 확인했다. 사전등록 §9의 `-diag.json` 문구는 실제 파일명과 다르다(사전등록 원문이라 수정하지 않음).
