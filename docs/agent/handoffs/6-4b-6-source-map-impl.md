# 6.4b-6 (N-33) — buildSourceMap 순차 스캔 구현

Tier E. base origin/main `dd334602bbbeb3777fcfe8ea3c40c7e0a682b2ca`(#110 merge), 브랜치 `claude/n33-source-map-impl`(Orca worktree `n33-source-map-impl`, 시작 시 fetch 결과 base와 origin/main 일치, 끼어든 작업 없음). 작성 Claude Code, 최종 검토 Codex(Astra). 승인 범위: 구현→검증→commit/push/Draft PR. Ready/merge·6.4b-5 착수는 미승인. 근거 계획: [계획](6-4b-6-source-map-plan.md), 원본 `codex_review/review_2026-11-11_pr110-n33-plan.md`, 사용자 승인 D1–D4.
- 실행 모델 근거: 이 세션 transcript(jsonl)의 assistant `model` 필드가 `claude-opus-5-5` 단일 값. 하위 에이전트 미사용.
- worktree 루트 `HANDOFF.md`는 `.gitignore` 대상 로컬 파일로 2026-11-11 생성했다(추적 안 함).

## 1. 계획 (승인 범위)

- `src/core/artifacts.ts` private `buildSourceMap`: 전체 `matchAll` 배열 + filter/map → 한 번의 전진 CR/LF 스캔. 첫 구현(`499a7bb`)은 code unit마다 charCode, perf-run1 S1 유효 FAIL 뒤 `cb76744`에서 다음 CR·LF를 `indexOf`로 찾도록 바꿈(계획 §5 "같은 의미의 더 빠른 구현" 경로, 요청서 문구 'charCode 스캔'과 다름 — 2026-11-11 코디네이터가 같은 의미의 국소 성능 수정으로 허용). CR(13) 뒤 LF(10)는 CRLF 하나. 줄마다 `slice` + `Buffer.byteLength`, delimiter는 ASCII라 길이=바이트. 끝 delimiter 뒤가 비면 줄 없음.
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
| npm ci / build / test / typecheck / smoke:mcp / validate:plugin / benchmark | 모두 exit 0, test 49파일 4332 통과/5 skip | head `fffd213`와 `b40d2c2`(run4 기록) 기준 각각 모두 exit 0, test 50파일 4354 통과/5 skip, benchmark passed, build 뒤 bin 변경 0 |
| git diff --check | — | 원자료 vitest 로그 끝 공백으로 실패 → 결과 폴더 `.gitattributes`(`*.txt -whitespace`)로 원자료 보존, 재검사 0 |

- BASE build는 `bin/token-context-optimizer.mjs`를 줄끝만 바꿨다(빌드 전 clean 기록, 내용 diff 0) → 그 파일만 되돌림.

## 4. 성능·메모리 (D1·D2·D4)

사전등록: [prereg](6-4b-6-source-map-impl-prereg.md). 원자료 `research/results/6-4b-6-source-map-impl/perf-run*.json`(원시 표본·child 상태·환경·해시 포함). 재계산: JSON의 `timing.shapes[].attempts[].samples`를 label·arm으로 나눠 nearest-rank.

| 실행 | 사전등록 / 측정 head | 결과 |
|---|---|---|
| run1 | `c709812` / `c709812`(구현 `499a7bb` charCode) | S1 K=2, A/A 유효, 후보 median 9.48·p95 11.04 vs BASE 5.29·7.73 ms → **유효 FAIL**, 중단 |
| run2 | `97853ec` / `97853ec`(구현 `cb76744` indexOf) | S1 K=2, 3시도 모두 A/A p95 Δ 초과(블록별 한쪽 arm에 급등 표본 최대 3–4개, 6.7–10.3 ms) → **필수 INVALID**, 중단. 메모리·정보용 블록 미실행 |
| run3 | `f13d42d` / `f13d42d`(K 보정 ≥50 ms, 사용자 승인 A안) | S1 K=32 A/A 유효, 후보 median 91.01·p95 102.19 vs BASE 105.99·120.90 ms(한계 116.59·145.08) **PASS**. S2 K=16 후보 59.23·70.98 vs BASE 65.26·80.04(한계 71.79·96.05) **PASS**. S3 K=1 3시도 모두 A/A 무효(BASE median 비 2회·p95 1회, 후보 p95 1회) → **필수 INVALID**, 중단. S4–S6·메모리·D4 미실행 |
| run4 | `032b1de` / `032b1de`(계획 R2: 고정 12-순환 공유 블록, 양 arm K 보정, 블록 분리) | **timing PASS**(S1–S6 모두 1차 시도 유효·통과). **memory 유효 FAIL**(S4 retained 초과). diagnostic 정보용 완료 |

- run2 비교 블록 median(정보, 판정 아님): 후보 4.51–4.65 vs BASE 5.14–5.28 ms. INVALID라 G-T PASS로 쓰지 않는다.
- 잡음 재분석(새 측정 없음, `research/src/6-4b-6-source-map-noise.mjs` → `noise-analysis.jsonl`): 급등 표본(arm median×1.3 초과)이 arm과 무관하게 대부분 16–17표본(K=2라 약 33호출) 간격으로 반복되고(예외: run1의 3·8, run2 시도3의 13), 이 간격이 ABBA 주기 4와 맞물려 한 쌍의 같은 arm에 몰린다(예: run2 시도1 AA-base B1 3개·B2 0개, 비교 B1 3개·C1 0개). 원인은 1 MiB 문자열 반복 할당에 따른 GC 주기로 **추정**하며, raw 표본만으로 GC 인과는 입증되지 않았다.

run4 timing(`perf-run4-timing.json`, 사본당 측정 30, B1 vs C1 median/p95 ms, 한계):

| 형태 | K | BASE | 후보 | 한계 | A/A 비(B, C) |
|---|---|---|---|---|---|
| S1 | 32 | 106.64 / 119.25 | 92.39 / 105.29 | 117.31 / 143.10 | 1.013, 1.010 |
| S2 | 16 | 70.34 / 90.81 | 59.70 / 72.63 | 77.37 / 108.97 | 1.046, 1.018 |
| S3 | 2 | 244.35 / 308.37 | 68.93 / 99.82 | 268.78 / 370.05 | 0.985, 0.998 |
| S4 | 2 | 456.05 / 550.44 | 79.59 / 136.57 | 501.65 / 660.53 | 1.027, 0.995 |
| S5 | 32 | 219.72 / 254.69 | 140.75 / 168.08 | 241.69 / 305.63 | 1.003, 0.983 |
| S6 | 1 | 594.24 / 736.26 | 616.11 / 699.65 | 653.66 / 883.51 | 0.967, 0.951 |

- S6(2 KiB 파일 512개)은 후보 median이 BASE보다 3.7% 높지만 한계 안이다.
- run4 memory(`perf-run4-memory.json`, fresh child 30개 모두 completed, digest 일치, 3회 median, MiB): S1 R 1.033/1.033 P 53.0/53.2 PASS, S3 R 37.037/37.466 P 225.9/104.8 PASS, **S4 R 73.040/74.993(한계 74.501) FAIL**, P 358.1/148.5, S5 R 6.106/3.014 P 61.1/57.2 PASS, M10 R 10.033/10.033 P 71.0/71.1 PASS(값은 BASE/후보 순). S4 후보 R raw는 [78635664, 78635648, 78635664] B(BASE [76588408, 76588408, 76588408] B)로 3회 모두 한계 78120176.16 B를 넘었고, 규칙대로 재시도하지 않았다(2026-11-11 정정: 이전 문구 "3회 모두 같은 값"은 MiB 반올림 기준이었고 byte 기준으로는 16 B 차이가 있다. 재시도 결과에 대한 예측은 삭제했다. 커밋 `33b6d0f` 이전 메시지의 "identical" 표현도 같은 이유로 부정확하다).
- S4 retained 증가(약 1.95 MiB, 1,048,576줄)의 원인은 **추정**이다. 후보가 `push`로 배열을 키우면서 생기는 backing store 여유 용량일 가능성이 있다(BASE는 `map`으로 정확한 길이). 측정·검증은 하지 않았다. 제품 수정은 이번 승인 범위 밖이다.
- run4 diagnostic(`perf-run4-diagnostic.json`, 정보용, 각 1회): R1 후보 성공 20.5 ms. 빈 줄 10 MiB 후보 612.7 ms·P 1,085.6·R 763.4 vs BASE 2,546.5 ms·P 2,650.4·R 730.0. `a`+LF 10 MiB 후보 332.7 ms·P 525.5·R 380.4 vs BASE 1,435.3 ms·P 1,562.7·R 370.0. 모두 완료됐고 digest가 일치한다. retained는 S4와 같은 방향으로 후보가 더 크다.
- 처음 순차 실행에서 memory·diagnostic 호출은 커밋 전 timing 출력 때문에 작업 트리가 dirty여서 측정 전 사전 검사에서 거부됐다(`perf-run4-*-preflight-refusal-1.txt`). timing 결과를 커밋한 뒤 같은 사전등록으로 하나씩 실행했다.
- **최종 승인 조건(timing PASS 그리고 memory PASS)은 충족되지 않았다.** run5와 제품 수정은 미승인이다.
- 재계산 방법: 각 JSON의 `timing.shapes[].attempts[].samples` 중 `measure/` 라벨을 사본별로 나눠 nearest-rank를 구한다. memory는 `memory.runs`를 형태·arm별로 3개씩 모아 median을 구한다.
- run3 S3 A/A(정보, 판정 아님): BASE B1/B2 median 104.95/93.99, 132.15/122.90, 123.01/119.88 ms로 흔들렸고 후보 C1/C2는 19.34/19.70, 26.63/26.06, 29.51/30.10 ms. 비교 median은 BASE 90.36–122.56 vs 후보 19.91–32.25 ms이지만 INVALID라 G-T 판정에 쓰지 않는다.
- run3까지의 상태: S1·S2 PASS, S3 INVALID, S4–S6과 메모리 미측정. 이후 계획 R2와 run4로 이어졌다(위 표).

## 5. 교차 확인·검토·남은 위험

- Argon 초기 계획 교차 확인(`codex_review/argon/2026-11-11_n33-impl-initial-*`): gemini-4-argon APPROVE, Minor 1(메모리 digest 불일치가 invalid로 분류) → 직접 확인 뒤 반영, 확인 불가 5건은 원문으로 직접 대조.
- Astra 중간 검토 `codex_review/review_2026-11-11_pr111-n33-impl.md`(CHANGES REQUIRED): run2 보존(`fffd213`), handoff 갱신(`855189a`), diff-check(결과 폴더 `.gitattributes`로 원자료 바이트 보존, `855189a` 기준 0), root 로컬 `HANDOFF.md`(`.gitignore` 대상) 생성 반영. 남은 Major = 필수 성능·메모리 증거 미완료.
- 남은 위험: D2 S4 retained 유효 FAIL(원인 추정, 미검증). 빈 줄·`a`+LF 10 MiB에서도 retained가 후보 쪽으로 늘었다(정보용). timing PASS는 R2 프로토콜 한 번의 결과다. 순번 균형은 실제 경과 시간의 균형을 뜻하지 않는다.
- N-33은 아직 "해결"이 아니다. Ready/merge 미승인.

## 6. P1 수정 + run5 (2026-11-11 사용자 승인 "승인 그리고 다시 검토", 요청서 `codex_review/codex_paste_2026-11-11_n33-p1-run5-request.md`)

- 승인 범위: 같은 PR #111에서 P1만 적용한다. private `buildSourceMap`이 하나의 delimiter scan helper를 두 번 써서 먼저 줄 수를 세고, 정확한 길이 배열을 할당한 뒤 인덱스로 채운다. 그다음 bin 재생성, targeted·전체 gate, 사전등록 §10 커밋, run5(timing → 커밋 → memory → 커밋 → diagnostic → 커밋)를 한다. 기준은 §9 R2 그대로다.
- 근거: run4 D2 S4 retained 유효 FAIL(보존)과 scratch 진단(`codex_review/n33-retained-recovery/`, 함수 단독·3입력·≤1 MiB 관측). 진단은 public API 전체 PASS가 아니다. P1 peak가 push와 같거나 늘지 않는다고 보장하지 않는다(진단 S4 maxRSS median push 157.05 vs prealloc 157.69 MiB). 실제 회귀 여부는 run5로 판단한다.
- 제외: P2 slice 전환, public API·schema·오류·상한·의존성 변경, 기준 완화, run6, Ready/merge, S-10.
- 실행 기록(2026-11-11): handoff `5346546` → P1 제품 `daaac32`(`scanLines` 공유, count 후 `new Array<SourceLine>(count)` 인덱스 채움, bin 재생성) → 사전등록 §10 `727961c`(측정 head = 사전등록, harness `032b1de` 이후 변경 0, check-only PASS) → `perf-run5-timing.json` `ec6f182` → `perf-run5-memory.json` `7ef74b5` → `perf-run5-diagnostic.json` `9002cab`. 블록은 하나씩 순서대로 실행했고, 사전 검사 거부나 재시도는 없었다.
- RED 근거: 기존 BASE public API 3건 실패 로그와 run4 D2 S4 유효 FAIL(보존). 새 메모리 단위 테스트는 넣지 않았다. GREEN: `tests/source-map.test.ts` 22건(differential 10,381 포함) 통과.
- 전체 gate: P1 작업 트리(커밋 전, 빌드 전 상태 `M src/core/artifacts.ts`)와 최종 head `9002cab`에서 각각 npm ci·build·test(50파일 4354 통과/5 skip)·typecheck·smoke:mcp·validate:plugin·benchmark(passed) 모두 exit 0. `9002cab` 빌드 뒤 변경 0.

run5 timing(`perf-run5-timing.json`, 모두 1차 시도 유효, 사본당 측정 30, B1 vs C1 median/p95 ms):

| 형태 | K | BASE | 후보 | 한계 | A/A 비(B, C) | 판정 |
|---|---|---|---|---|---|---|
| S1 | 32 | 105.45 / 121.98 | 93.20 / 101.34 | 115.99 / 146.38 | 1.004, 1.001 | PASS |
| S2 | 32 | 140.62 / 157.13 | 119.18 / 135.35 | 154.68 / 188.56 | 0.982, 0.979 | PASS |
| S3 | 4 | 420.50 / 519.98 | 112.56 / 155.33 | 462.55 / 623.98 | 1.018, 0.996 | PASS |
| S4 | 2 | 493.63 / 581.03 | 110.12 / 157.67 | 542.99 / 697.24 | 0.996, 0.957 | PASS |
| S5 | 16 | 110.74 / 127.65 | 80.81 / 107.26 | 121.82 / 153.18 | 1.000, 0.958 | PASS |
| S6 | 1 | 595.04 / 767.97 | 590.56 / 695.47 | 654.55 / 921.56 | 1.020, 0.959 | PASS |

- K는 run4와 다른 형태가 있다(S2 16→32, S3 2→4, S5 32→16). §9 보정 규칙대로 다시 고른 값이며, 형태 사이나 run 사이의 절대 시간은 비교하지 않는다.
- run5 memory(`perf-run5-memory.json`, fresh child 30개 모두 completed, 형태별 digest 1종, 3회 median, MiB, BASE/후보): S1 R 1.033/1.033 P 53.1/53.1, S3 R 37.037/37.043 P 226.0/126.5, **S4 R 73.040/73.042(한계 74.501)** P 362.7/160.5, S5 R 6.106/2.988 P 61.4/56.2, M10 R 10.033/10.033 P 71.2/71.2. 모두 PASS. S4 후보 R raw는 [76590528, 76590528, 76590528] B(BASE median 76588408 B, 차이 +2,120 B)다. S4 후보 P는 run4 148.5 → run5 160.5 MiB로 높아졌지만 한계 431.0 MiB 안이다. run 사이 차이의 원인은 확인하지 않았다.
- run5 diagnostic(정보용, 각 1회, 모두 completed·digest 일치): R1 후보 21.2 ms. 빈 줄 10 MiB 후보 537.8 ms·P 826.0·R 730.0 vs BASE 2,265.4 ms·P 2,645.8·R 730.0 MiB(R 차이 +2,136 B). `a`+LF 10 MiB 후보 332.7 ms·P 457.7·R 370.0 vs BASE 1,326.5 ms·P 1,564.4·R 370.0 MiB(R 차이 +2,952 B).
- **판정(작성자 자기 검증): timing PASS 그리고 memory PASS → 사전등록 최종 승인 조건 충족.** Astra 최종 판정 전이며 N-33은 아직 해결로 기록하지 않는다. Ready/merge·run6·S-10은 미승인이다.
