# N-34 K1 성능 사전 등록 (incremental, 2단계 실측 전)

- 요청서: `codex_review/review_2026-11-15_n34-k1-implementation-request.md`. Task handoff: `n34-k1-empty-line.md`
- 상태: **미실측.** 2단계 실행은 PM preflight와 실행권 전달 뒤에만 한다. 이 문서는 실측 전에 고정한다
- 하네스
  - `research/src/n34-k1-perf.mjs`: run3 runner의 검토용 사본. 바뀐 줄마다 K1 표시를 붙였다
  - `research/src/n34-k1-perf-rows.mjs`: K1 전용 행 정의
  - 입력·worker는 run3 파일을 그대로 쓴다: `n34-cr-policy-perf-inputs.mjs`, `-worker.mjs`, `-mem-worker.mjs`
  - 기존 run3 runner·worker·prereg·raw는 바꾸지 않는다
- 결과 위치: `research/results/n34-k1/`(run3 결과와 분리)

## 1. 질문과 비교 대상
- 질문: 검증된 pre-K1 정책(`7e732e0`) 대비 K1이 **같은 입력에서 더하는 영향**
  - main `5d668f9` 대비 정보용 F1 위험(run3 1.642/1.391)과 섞지 않는다. 서로 다른 실행의 비율을 곱하지 않는다
- BASE(B1·B2): git archive `7e732e0`. CAND(C1·C2): 측정 HEAD
  - 두 dist는 각각 npm ci + tsc로 만든다. A/A 사본은 dist를 바이트 복사한 것이다
- snapshot 검사
  - `git diff --numstat 7e732e0 HEAD -- src` = `2 0 src/core/policy.ts`
  - dist/src/core에서 다른 파일은 `policy.js`뿐이어야 한다
  - lockfile이 같아야 한다

## 2. 행 (18, 고정 순서, 모두 cand = ref)
- O1 `F3, F4, F5, F6L, F7L, F1, F2, F6, F7` 뒤에 O2를 같은 순서로 둔다. gate 표시는 `K1-same`이다
- run3 G-C 참조 매핑(F1→F4, F2→F5, F6→F6L, F7→F7L)은 재사용하지 않는다
- check-only가 확인하는 것
  - 고유 18행, 정확한 순서, 모든 행의 cand = ref
  - 음성 대조: run3 ROWS의 G-C 8행, F1→F4 치환, 순서 바꿈, 중복, 누락을 모두 거부한다
- 입력: run3 `makeInput` 9종, 10,485,760 bytes
  - 입력 생성·재사용 전략은 양쪽 조건에서 같다(run3 worker 그대로)
    - same-input이면 `makeInput` 결과 하나를 4 arm이 소스 수준에서 재사용한다
    - O2는 파일 경로 하나를 같이 쓴다
  - 이것은 소스 수준 전략이다. 문자열의 물리 저장 공유 여부는 주장하지 않는다
- 새 dummy·GC 설정·heap 증액은 없다

## 3. timing 블록 (run3 규칙 그대로)
- 행마다 보정 child 1개 + attempt child 최대 3개. 모든 child는 fresh hidden process(`windowsHide: true`)다
- 보정: K = 1, 2, 4 … 순으로 B1·C1 5묶음씩 잰다. 두 최솟값이 모두 50 ms 이상이 되는 가장 작은 K에서 멈춘다(최대 1024)
- attempt
  - circuit `ABCDBDCADACB`, `ADACDBDCBABC`를 교대한다. warmup 2 + measure 10 circuit, 표본 144개, arm당 측정 30개
  - 통계: nearest-rank median = 정렬[14], p95 = 정렬[28]
- 출력 동치: attempt마다 timed 구간 밖에서 4 arm의 공개 view digest가 모두 같아야 한다. 다르면 `failed_correctness`
- A/A: B2/B1과 C2/C1 각각 판정한다
  - median 비 0.95–1.05 또는 차이 ≤ 0.1 ms
  - p95 차이 ≤ max(0.2 ms, p95 × 0.2)
  - 무효이면 30 s 쉬고 다시 시도한다(최대 3회). 세 번째도 무효이면 그 행은 `invalid`이고 블록을 중단한다
- gate(N-33 D1, REF = B1, CAND = C1)
  - median ≤ max(B1 × 1.10, B1 + 0.5 ms)
  - p95 ≤ max(B1 p95 × 1.20, B1 p95 + 1 ms)
- 중단
  - pass가 아닌 첫 행에서 멈춘다. 유효 FAIL은 재시도하지 않고 임계도 완화하지 않는다
  - 멈춘 뒤 실행하지 않은 행은 `notRun`에 기록한다
- 블록 pass 조건: 18행이 정확히 한 번씩 있고 모두 pass
  - 그 밖의 우선순위: failed_correctness > failed_gate > invalid

## 4. memory 블록 (run3 정의 그대로)
- 18행 × {B1, C1} × 3회 = **child 108개**. 모두 `--expose-gc` fresh child이고 한 번에 하나씩 돈다
- 순서: 짝수 회는 BASE→CAND, 홀수 회는 CAND→BASE
- 지표
  - R: 호출 전후 GC 뒤 `heapUsed + external` 차이(결과 객체 유지)의 3회 중앙값
  - P: max RSS의 3회 중앙값
- gate
  - C.R ≤ B.R + max(1 MiB, B.R × 0.02)
  - C.P ≤ B.P × 1.10 + 32 MiB
- 실패 처리
  - CAND OOM·timeout·RangeError는 `failed_gate`
  - REF 실패는 `ref_failed`
  - spawn·parse 실패는 `invalid`
  - digest 불일치는 `failed_correctness`
- timing child에는 메모리·GC 계측을 넣지 않는다

## 5. 원자료 보존 (누락 = 해당 행 invalid)
- child마다 보존하는 것: status·exitCode·signal·wallMs, **startedAt·finishedAt**, **nodeArgs**(플래그), stderr 끝부분
- 보정: steps 전체와 K
- attempt: samples(`order, label, arm, ms`) 144개, digests·views 4개, stats, A/A, gate, 비율
- memory run: R·P·elapsed, before/after, digest, view
- 블록 수준
  - BASE·CAND snapshot(ref, policy blob, lockfile, dist 해시)
  - prereg·측정 HEAD
  - 하네스·worker·prereg·`policy.ts`·lockfile 해시, 환경(Node, V8, OS, CPU, 전원 계획)
  - 시작·종료 시각
- `timingRawViolations` / `memoryRawViolations`
  - 저장 전에 판정하고, 하나라도 빠지면 그 행을 `raw_incomplete` → invalid로 만든다
  - check-only가 합성 레코드로 양성 대조와 필드 제거 음성 대조를 먼저 확인한다
- 실패·무효·미실행도 그대로 남긴다. 결과를 본 뒤 attempt를 고르거나, 합산하거나, 최선값만 보고하지 않는다

## 6. F1 관찰 기준 (정보, gate 아님)
- O1/F1·O2/F1의 C1/B1 median 비를 그대로 보고한다
  - ≤ 0.95: 개선 관찰
  - 0.95–1.05: 차이 없음 범위
  - 1.05 초과: 증가 관찰. 증가는 gate로 따로 판정된다
- 한 번의 실행은 관찰 1회다. 재현을 주장하려면 별도 승인을 받아 같은 명령으로 새 파일에 다시 측정해야 한다
- **main 대비 F1 위험 해소는 이 측정으로 주장하지 않는다.** 그러려면 같은 F1에 대한 K1 대 main 직접 비교를 따로 등록하고 기록해야 한다(이번 범위 밖)

## 7. 실행 명령 (2단계, PM 실행권 뒤)
```
node research/src/n34-k1-perf.mjs --check-only
node research/src/n34-k1-perf.mjs --prereg=<prereg sha> --block=timing --output=research/results/n34-k1/perf-k1run1-timing.json
node research/src/n34-k1-perf.mjs --prereg=<prereg sha> --block=memory --output=research/results/n34-k1/perf-k1run1-memory.json
```
- 실행 전제
  - 작업 트리 clean, Node `v24.18.0`, Windows
  - `--prereg`은 하네스 파일을 마지막으로 바꾼 커밋이어야 한다
  - 덮어쓰기는 거부된다
- 순서: timing → memory. 블록마다 raw를 바로 커밋한다
- 예상 시간(run3 기준): timing 약 3.8시간(18행, 행당 6–17분), memory 약 5–10분, snapshot 빌드 블록당 수 분
  - A/A 재시도가 있으면 해당 행 시간이 최대 3배다
  - PC를 독점하므로 다른 무거운 작업을 하지 않는다
- 종료 코드: 0 pass, 3 failed_correctness, 4 failed_gate, 5 invalid, 1 기타 오류

## 8. 한계
- 한 PC, 한 번의 실행이다. 블록 간 비교와 run3 수치 비교는 서술용이다
- K1 뒤에도 남는 것: 10M자 문자 스캔(`somePolicyLine`), 빈 줄마다의 콜백 호출과 `slice`. 개선 크기는 실측 전에는 알 수 없다
