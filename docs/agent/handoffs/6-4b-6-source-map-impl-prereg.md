# 6.4b-6 (N-33) 성능·메모리 사전등록 (구현 PR, 측정 전 커밋)

승인 D1–D4(2026-11-11)를 실행 가능한 절차로 고정한다. 이 문서·`research/src/6-4b-6-source-map-perf.mjs`·`-perf-worker.mjs`·`-mem-worker.mjs`는 후보 성능 수치를 보기 전에 한 커밋으로 등록한다. runner는 측정 head에서 이 네 파일과 `src/`가 사전등록 커밋과 같고 작업 트리가 깨끗해야 실행된다. 아래에 수치 예측은 적지 않는다.

## 1. 대상·준비

- arm: BASE = `dd334602bbbeb3777fcfe8ea3c40c7e0a682b2ca`, 후보 = 측정 head. 각각 `git archive` → 임시 폴더 → `npm ci --ignore-scripts` → `tsc -p tsconfig.json`(번들 미사용). A/A 사본은 같은 `dist`의 바이트 복사(`dist-aa`). 두 arm의 `dist/src/core/*.js`는 `artifacts.js`만 달라야 하고 lockfile 해시가 같아야 한다(아니면 중단).
- 측정 단위: public `indexArtifact` 왕복(파일 읽기·SHA·decode 포함), 호출마다 fresh `MemoryArtifactStore`.
- 환경 기록: Node `v24.18.0` 필수, V8, OS, CPU, 논리 코어, 총 메모리, 전원 계획. 시작/끝 환경이 다르면 error.
- 해시: 소스는 git blob SHA-1(HEAD 기준), 작업 사본 SHA-256(CRLF 가능)을 구분해 기록. dist core 모듈은 SHA-256.

## 2. 고정 입력 (모두 정확히 1 MiB, 기대 줄 수는 구성에서 계산)

| ID | 정의 | 줄 |
|---|---|---|
| S1 | `abcdefghijklmnopqrstuvwxyz0123456789 ` 반복, 개행 없음 | 1 |
| S2 | 22 B 단위 `한글 中文 é 😀 ` ×2,978 + `x`×19 + LF = 65,536 B, ×16 | 16 |
| S3 | `a\n` ×524,288 | 524,288 |
| S4 | `\n` ×1,048,576 | 1,048,576 |
| S5 | `Line i: mixed delimiters keep byte offsets exact.` + CRLF/LF/CR 순환, 마지막 줄 `x` 채움(끝 delimiter 없음) | 구성에서 계산 |
| S6 | 2,048 B 파일 512개: mulberry32 seed `0x6a4b6`로 5문장 중 선택해 LF로 잇고 마지막 줄 `y` 채움. 1호출 = 512파일을 각각 fresh store로 순차 색인 | 파일별 계산 |

## 3. 시간 gate (D1, 필수)

- 형태마다 fresh hidden child 1개(보정) + 시도마다 fresh hidden child 1개. child timeout 600 s. 형태 순서 S1→S6.
- **K 보정(BASE만):** K=1부터, BASE 사본1로 K호출 묶음 5개를 재고 최솟값 ≥ 5 ms면 그 K, 아니면 K×2(최대 1024, 넘으면 INVALID). K는 기록하고 그 형태의 모든 시도·arm에 같게 쓴다.
- **BASE 실패 형태:** 보정에서 BASE가 예외를 내면 `base_failed_excluded`로 기록하고 시간 비교에서 빼서 correctness 전용으로 둔다. 실패 BASE 시간은 어떤 기준에도 쓰지 않는다.
- **시도 내부 순서:** (a) 시간 밖 correctness: 네 사본(B1·B2·C1·C2) 모두 각 파일 SourceLine 전 필드 스트리밍 SHA-256이 같아야 함(다르면 failed_correctness), (b) warmup 사본마다 5표본(B1,B2,C1,C2 순), (c) A/A BASE: B1/B2 ABBA 15주기, (d) A/A 후보: C1/C2 ABBA 15주기, (e) 비교: B1/C1 ABBA 15주기. 주기 = [첫, 둘, 둘, 첫]. 블록마다 arm당 30표본. 모든 표본 호출에서 lineCount·byteLength·sha256 출력 확인(틀리면 child error).
- 통계: nearest-rank, median = `sorted[ceil(.5n)-1]`, p95 = `sorted[ceil(.95n)-1]`, n=30이 아니거나 비유한 값이면 INVALID.
- **A/A 유효(각 쌍):** 참조 arm = 첫 사본(B1 또는 C1), 비 = 둘째/참조. 중앙값 비 ∈ [0.95, 1.05] 또는 |Δmedian| ≤ 0.1 ms, **그리고** |Δp95| ≤ max(0.2 ms, 참조 p95 × 0.20).
- 무효면 30 s 뒤 새 child로 시도 전체 재실행, 최대 2회 재시도(총 3회). 세 번째 무효 = 필수 INVALID, 측정 중단(PASS 아님).
- **G-T(D1):** 비교 블록에서 후보 median ≤ max(BASE median × 1.10, BASE median + 0.5 ms), 후보 p95 ≤ max(BASE p95 × 1.20, BASE p95 + 1 ms). 표본 = K호출 묶음 시간이며 절대 하한도 그 표본 단위다. 유효 FAIL은 재시도·완화·진단 강등 없이 즉시 중단한다.
- timeout, spawn 실패, JSON 1줄이 아님/파싱 실패, 비정상 종료, OOM, 표본 누락은 모두 INVALID로 중단. 빈 집계나 exit 0을 PASS로 보지 않는다(시간 상태는 대상 형태가 1개 이상이고 모두 pass일 때만 pass).

## 4. 메모리 gate (D2, 필수, 시간 gate 통과 뒤)

- 형태: S1·S3·S4·S5(1 MiB)와 M10 = `a`×10,485,760 한 줄. arm = B1, C1.
- arm×형태×반복(3회)마다 fresh hidden child, `--expose-gc`만(heap 플래그 없음 = default heap), **한 번에 한 child**, timeout 300 s. 반복 r이 짝수면 B→C, 홀수면 C→B.
- child 절차: 모듈 import → GC 3회 → before = heapUsed+external → fresh store로 `indexArtifact` → record·store를 전역에 살려 둔 채 GC 3회 → after. **R = after − before**(arrayBuffers는 external 안이라 더하지 않음). **P = `process.resourceUsage().maxRSS`×1024**(프로세스 high-water, 정확한 색인 peak 아님). lineCount·byteLength·sha256·store 저장 확인과 SourceLine 스트리밍 SHA-256 기록.
- 형태마다 arm별 3회 nearest-rank median. 6회 모두 completed이고 digest가 하나여야 판정(아니면 invalid_runs/failed_correctness).
- **gate(D2):** R후보 ≤ R_BASE + max(1 MiB, R_BASE × 0.02), **그리고** P후보 ≤ P_BASE × 1.10 + 32 MiB. P가 0이거나 비유한이면 `unmeasurable`로 보고하며 PASS로 쓰지 않는다. 유효 FAIL은 재시도하지 않는다. 종료 사유 우선순위: failed_correctness > failed_gate > invalid.
- 사전등록 전 Argon 초기 교차 확인(APPROVE, Minor 1: 메모리 digest 불일치가 invalid로 분류되던 문제)을 반영했다. 기계 동작은 BASE 단독 사본으로만 점검했고 후보 수치는 보지 않았다.

## 5. 정보용 진단 (D4, 필수 gate 모두 통과 뒤, gate 아님)

- 메모리 child 같은 방식, 한 번에 하나, default heap. R1(`a`×10,485,756+😀) 후보 단독 timeout 120 s. 빈 줄 10 MiB(`\n`×10,485,760)와 `a`+LF 10 MiB(`a\n`×5,242,880)는 후보→BASE 각 1회, timeout 300 s.
- OOM·timeout·오류는 그대로 기록하고 숨기지 않는다. 정보용 결과는 필수 gate를 소급 무효화하지 않지만, 후보에서 실제 문제가 보이면 원인을 보고한다. M10 elapsedMs는 10 MiB ASCII 정보용 시간으로만 읽는다.

## 6. 보존·종료

- 출력: `research/results/6-4b-6-source-map-impl/perf-<이름>.json` 새 파일만(있으면 거부). 원시 표본(순서·라벨·arm·ms), child 상태·종료 코드·stderr 끝, 보정 단계, 환경, 해시, 사전등록 커밋, 측정 head, 종료 이유(`status`, `error`)를 단계마다 저장.
- 추적 파일 해시가 실행 전후 같아야 하고, 임시 폴더(`tco-6-4b-6-perf-*`)는 삭제를 확인한다.
- 제품을 다시 고치면 새 사전등록 커밋과 새 결과 파일로 다시 잰다. 이전 유효 FAIL·INVALID 결과는 지우거나 덮어쓰지 않는다.
- 실행: `node research/src/6-4b-6-source-map-perf.mjs --prereg=<이 문서 커밋> --output=research/results/6-4b-6-source-map-impl/perf-<이름>.json`. 검사만: `--check-only`.

## 7. 재사전등록 (perf-run2, 제품 수정 뒤)

- perf-run1(`research/results/6-4b-6-source-map-impl/perf-run1.json`, 사전등록 `c709812`, 측정 head `499a7bb`): S1 A/A 두 쌍 유효, 후보(charCode 루프) median 9.48 ms·p95 11.04 ms vs BASE 5.29 ms·7.73 ms(K=2) → D1 한계(5.82 ms·9.28 ms) 초과, **유효 FAIL**. 규칙대로 재시도 없이 중단했고 이 결과는 그대로 보존한다(삭제·덮어쓰기·완화 없음).
- 원인 탐색(gate 아님, `research/src/6-4b-6-source-map-explore.mjs`, `explore-after-run1.txt`): 긴 한 줄에서 code unit마다 charCodeAt 하는 루프가 native 정규식보다 느렸다.
- 제품 수정 `cb76744`: 같은 한 번의 전진 스캔과 SourceLine 의미를 유지하고, 다음 CR·LF 위치만 `indexOf`로 찾는다. targeted 테스트(RED 3건 포함 22건, differential 10,381건) 재통과.
- 이 절을 담은 커밋이 새 사전등록이다. §1–§6의 절차·임계값·입력·seed·timeout·순서는 **한 글자도 바꾸지 않는다.** 출력은 새 파일 `perf-run2.json`.

## 8. 재사전등록 (perf-run3, 2026-11-11 사용자 승인 A안)

- perf-run2(사전등록 `97853ec`): S1 3시도 모두 A/A p95 무효 → **필수 INVALID**, 보존. 커밋된 raw 표본 재분석(`noise-analysis.jsonl`, 새 측정 없음): 급등 표본이 대부분 16–17표본 간격으로 ABBA 주기와 맞물려 한 arm에 몰렸다. 원인은 GC 주기로 **추정**(인과 미입증).
- **유일한 변경:** §3 K 보정 정지 조건 "BASE 사본1 K호출 묶음 5개 최솟값 ≥ 5 ms" → **≥ 50 ms**(`P.minSampleMs` 5 → 50). K는 여전히 1부터 2배씩, maxK 1024, 두 arm 동일, 기록.
- 그대로: 표본 단위(K호출 묶음), A/A 조건, G-T·D2 임계, ABBA 15주기, warmup 5, 형태·seed, timeout, 최대 시도 3·쿨다운 30 s, 중단 규칙, D2·D4 절차. 강제 GC 추가 없음. 구현은 승인된 `indexOf` 전진 스캔(`cb76744`) 그대로.
- 유효 FAIL 또는 세 번째 A/A 무효면 재시도·증액 없이 중단하고 보고한다. 출력은 새 파일 `perf-run3.json`.

## 9. 재사전등록 (perf-run4, 2026-11-11 사용자 승인 계획 R2)

근거: run3(`f13d42d`) S3 필수 INVALID 뒤 읽기 전용 분석과 계획 R2(`codex_review/codex_paste_2026-11-11_n33-measurement-recovery-plan-v2.md`). 이 절은 §3 시간 gate의 스케줄·보정·실행 단위를 바꾸고, §4·§5를 독립 블록으로 실행하게 한다. 제품 코드(`src/`)는 바꾸지 않는다.

- **스케줄(§3 (b)–(e) 대체):** 형태·시도마다 fresh hidden child 하나에서 고정 12-순환 `A B C D B D C A D A C B`(A=B1, B=B2, D=C1, C=C2)를 warmup 2순환(24표본, 사본당 6) → 측정 10순환(120표본, 사본당 30)으로 돌린다. 표본 = K호출 묶음.
- check-only로 검증하는 사실: 측정 120, 사본당 측정 30·warmup 6, 직전쌍(측정 첫 표본의 직전 = warmup 마지막 표본, B2>B1 포함) 서로 다른 12쌍 각 10회, 같은 사본 연속 0, 측정 평균 순번 B1·B2·C1 59.3333, C2 60. 평균 순번은 순번 통계일 뿐이며 **실제 경과 시간의 균형을 뜻하지 않는다**. 2차 이월, 주기 12 근처 잡음, 비선형 드리프트는 통제하지 않는다.
- **판정 표본:** A/A(B1/B2, C1/C2)와 비교(B1/C1)를 같은 측정 120표본에서 사본별 30개로 계산한다. 시간 밖 correctness(네 사본 digest 일치), 표본마다 출력 확인, 기록 순서·라벨·사본이 스케줄과 정확히 일치하는지 확인(아니면 INVALID).
- **K 보정(§3 K 보정 대체):** K=1부터 2배씩, 각 K에서 B1 5묶음 → C1 5묶음. **두 최솟값이 모두 ≥ 50 ms**인 가장 작은 K(maxK 1024, 넘으면 INVALID). 네 사본에 같은 K, 보정 표본은 판정에 쓰지 않음. 보정 중 B1 예외는 base_failed_excluded, C1 예외는 INVALID.
- **그대로:** nearest-rank n=30(median `sorted[14]`, p95 `sorted[28]`), A/A 조건(참조=첫 사본), G-T, 최대 3시도·30 s 쿨다운·3번째 무효 INVALID, 유효 FAIL 즉시 중단, 형태 S1–S6·seed, child timeout, D2 절차·임계, D4 목록·timeout, 출력 거부·dirty 거부·추적 파일 보존·임시 폴더 정리. GC 수집·강제 GC 없음.
- **블록 분리:** `--block=timing|memory|diagnostic`, 같은 사전등록 커밋으로 `perf-run4-timing.json` → `perf-run4-memory.json` → `perf-run4-diag.json`을 순서대로 하나씩 실행한다. timing이 FAIL·INVALID여도 memory와 diagnostic은 각각 실행한다. 블록 판정: timing = S1–S6 행이 정확히 하나씩 있고 비교된 행이 모두 pass, memory = M 형태 5개 모두 pass, diagnostic = 정보용(판정 없음). **최종 승인 = timing pass 그리고 memory pass일 때만.**
- **S1–S6 전부 새로 측정.** run3 S1·S2 PASS는 이전 프로토콜의 보존 결과로만 인용하고 run4 실패를 덮지 않는다. run1–3 원자료와 v1·v2 계획은 보존한다. run5는 이번 승인 범위가 아니다.
