# 6.4b-6 (N-33) — buildSourceMap 순차 스캔 구현

Tier E. base origin/main `dd334602bbbeb3777fcfe8ea3c40c7e0a682b2ca`(#110 merge), 브랜치 `claude/n33-source-map-impl`(Orca worktree `n33-source-map-impl`, 시작 시 fetch 결과 base와 origin/main 일치, 끼어든 작업 없음). 작성 Claude Code, 최종 검토 Codex(Astra). 승인 범위: 구현→검증→commit/push/Draft PR. Ready/merge·6.4b-5 착수는 미승인. 근거 계획: [계획](6-4b-6-source-map-plan.md), 원본 `codex_review/review_2026-11-11_pr110-n33-plan.md`, 사용자 승인 D1–D4.
- 실행 모델 근거: 이 세션 transcript(jsonl)의 assistant `model` 필드가 `claude-opus-5-5` 단일 값. 하위 에이전트 미사용.
- 이 worktree 루트에는 `HANDOFF.md`가 없다(공유 파일, 새로 만들지 않음).

## 1. 계획 (승인 범위)

- `src/core/artifacts.ts` private `buildSourceMap`: 전체 `matchAll` 배열 + filter/map → 한 번의 전진 CR/LF 스캔. 첫 구현(`499a7bb`)은 code unit마다 charCode, perf-run1 S1 유효 FAIL 뒤 `cb76744`에서 다음 CR·LF를 `indexOf`로 찾도록 바꿈(계획 §5 "같은 의미의 더 빠른 구현" 경로, 요청서 문구 'charCode 스캔'과 다름 — Astra 판정 대상). CR(13) 뒤 LF(10)는 CRLF 하나. 줄마다 `slice` + `Buffer.byteLength`, delimiter는 ASCII라 길이=바이트. 끝 delimiter 뒤가 비면 줄 없음.
- 바꾸지 않음: public API/export/schema/상한/오류 정책/estimator/policy, strict UTF-8 decode. 범위 밖: 저장소 상한·LRU·E8 trim, 이미지/영상, 논문, 의존성.

## 2. RED → GREEN (tests/source-map.test.ts, public `indexArtifact`만 사용)

| 테스트 | BASE(dd33460) | 후보 | 분류 |
|---|---|---|---|
| R1 `a`×10,485,756+😀 (10,485,760 B) | `RangeError: Maximum call stack size exceeded` @ `buildSourceMap` | 통과 | RED |
| 😀+`a`×10,485,756 (시작) | 같은 RangeError | 통과 | RED |
| `a`×5,242,878+😀+`a`×5,242,878 (중간) | 같은 RangeError | 통과 | RED |
| 😀×2,621,440 (전부 astral) | 통과 | 통과 | 대조 |
| `가`×3,495,253+`a` (10,485,760 B) | 통과 | 통과 | 대조 |
| ASCII 10 MiB, `a`×1,048,572+😀 | 통과 | 통과 | 대조 |
| 10,485,761 B → `too_large`, `61 FF 62` → `Artifact must be valid UTF-8 text` | 통과 | 통과 | 회귀 |
| L1–L10 literal(계획 §2) | 10/10 | 10/10 | 계약 |
| differential: 9기호 알파벳 길이 0–4 전수 7,381 + seed `0x6a4b6` mulberry32 3,000개(≤512기호) vs 고정 legacy regex oracle | (자기 대조, 무의미) | 불일치 0 | 동치 |

- 큰 입력 기대값은 수학식(1줄, `[1,0,bytes,text===content,""]`). legacy oracle은 짧은 입력에만. 새 구현을 테스트에 복제하지 않음.
- 원자료: `research/results/6-4b-6-source-map-impl/red-base-vitest.txt`(BASE에서 3 failed/19 passed), `green-targeted-vitest.txt`(source-map+core+query-artifact-boundaries+query-artifact-mcp+summarizer-selection 5파일 1351 통과/2 skip). ANSI 제거, 경로는 `<repo>`로 치환.

## 3. 검증 gate

| 단계 | BASE 기준(구현 전, 새 테스트 미포함) | 후보(Draft 뒤) |
|---|---|---|
| npm ci / build / test / typecheck / smoke:mcp / validate:plugin / benchmark | 모두 exit 0, test 49파일 4332 통과/5 skip | head `fffd213`(perf-run2 기록) 기준 모두 exit 0, test 50파일 4354 통과/5 skip, benchmark passed, build 뒤 bin 변경 0 |
| git diff --check | — | 원자료 vitest 로그 끝 공백으로 실패 → 결과 폴더 `.gitattributes`(`*.txt -whitespace`)로 원자료 보존, 재검사 0 |

- BASE build는 `bin/token-context-optimizer.mjs`를 줄끝만 바꿨다(빌드 전 clean 기록, 내용 diff 0) → 그 파일만 되돌림.

## 4. 성능·메모리 (D1·D2·D4)

사전등록: [prereg](6-4b-6-source-map-impl-prereg.md). 원자료 `research/results/6-4b-6-source-map-impl/perf-run*.json`(원시 표본·child 상태·환경·해시 포함). 재계산: JSON의 `timing.shapes[].attempts[].samples`를 label·arm으로 나눠 nearest-rank.

| 실행 | 사전등록 / 측정 head | 결과 |
|---|---|---|
| run1 | `c709812` / `c709812`(구현 `499a7bb` charCode) | S1 K=2, A/A 유효, 후보 median 9.48·p95 11.04 vs BASE 5.29·7.73 ms → **유효 FAIL**, 중단 |
| run2 | `97853ec` / `97853ec`(구현 `cb76744` indexOf) | S1 K=2, 3시도 모두 A/A p95 Δ 초과(BASE·후보 각 1–2개 표본 7–8 ms 급등) → **필수 INVALID**, 중단. 메모리·정보용 블록 미실행 |

- run2 비교 블록 median(정보, 판정 아님): 후보 4.51–4.65 vs BASE 5.14–5.28 ms. INVALID라 G-T PASS로 쓰지 않는다.
- **D1·D2 필수 gate는 아직 PASS 아님.** 다음 단계(새 사전등록)는 코디네이터 결정 대기.

## 5. 교차 확인·검토·남은 위험

- Argon 초기 계획 교차 확인(`codex_review/argon/2026-11-11_n33-impl-initial-*`): gemini-4-argon APPROVE, Minor 1(메모리 digest 불일치가 invalid로 분류) → 직접 확인 뒤 반영, 확인 불가 5건은 원문으로 직접 대조.
- Astra 최종 검토 전이며 N-33은 아직 "해결"이 아니다.
