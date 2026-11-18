# N-34 자원 gate run2 사전등록 (측정 전 고정)

- 근거: 사용자 2026-11-13 run2 A안 승인(`codex_review/review_2026-11-13_n34-run2-approved.md`, 상세 `review_2026-11-13_n34-run2-proposal.md`). run1 사전등록 `docs/agent/handoffs/n34-cr-line-policy-prereg.md`(커밋 `982046c`)는 그대로 보존한다. 이 문서는 그 문서를 대체하는 run2 protocol이며, 아래 "바뀌는 것" 외에는 run1 문서의 조항을 한 글자도 바꾸지 않고 그대로 따른다.
- 하네스: `research/src/n34-cr-policy-perf.mjs`(부모, schema `n34-cr-policy-perf/v2`). 입력 `-perf-inputs.mjs`, 시간 child `-perf-worker.mjs`, 메모리 child `-perf-mem-worker.mjs`는 run1과 같은 파일이며 바꾸지 않는다. 결과를 보기 전에 커밋한다.
- run1 원자료(`research/results/n34-cr-policy/perf-run1-timing.json`, 작업 사본 sha256 `45e2dc3b505fda3cc955fbc414cc445a143f4fc55756c32c191fb0542c5ccbfa`)는 INVALID로 영구 보존한다. run2 표본과 합치거나 run1 통과 행으로 대체하지 않는다.

## 바뀌는 것: 시간 gate 순서(run1 문서 §8.4의 12-순환 한 줄만)
- 순환 두 개를 번갈아 쓴다. 원 순환 `A B C D B D C A D A C B`, 그리고 그 역순을 왼쪽으로 2칸 회전한 `A D A C D B D C B A B C`. A=B1, B=B2, C=C2, D=C1이다.
- warmup 2순환(24)과 측정 10순환(120)은 각 block을 원 순환부터 시작한다(c번째 순환 = 원 순환 if c 짝수, 회전 순환 if c 홀수). 시도 하나는 144표본이다.
- 하네스 `--check-only`가 강제하는 불변조건(위치 = 시도 안 표본 순서 0–143의 홀짝):
  - 사본별 warmup 6, 홀짝 3/3. 사본별 측정 30, 홀짝 15/15.
  - 서로 다른 사본 간 유향 전이 12종 각 10회, 같은 사본 연속(self) 0. 정의: 측정 표본 120개 각각으로 들어오는 전이이며, 첫 측정 표본의 직전 warmup 표본을 포함한다.
  - 측정 구간 안 전이 119개만 세면 C>A(C2>B1) 9회, 나머지 11종은 각 10회다.
- 음성/양성 control(`--check-only`):
  - 원 순환만 반복하면 홀짝 검사에서 실패해야 한다(전이·self·개수는 통과).
  - 원 순환과 단순 역순 `B C A D A C D B D C B A`를 번갈아 쓰면 전이·self 검사에서 실패해야 한다(홀짝·개수는 통과).
  - 승인 순환은 모든 검사를 통과해야 한다.
- 실행 이름은 `run2`다. 결과 파일은 `perf-run2-timing.json`, `perf-run2-memory.json`, `perf-run2-info.json`이며 self-check는 `selfcheck-run2.json`이다.

## 바뀌지 않는 것(run1 문서 그대로)
- 입력 9종·10,485,760 B, 연산 O1·O2, G-R/G-C 비교, 18행과 행 순서. snapshot 빌드와 `policy.js`만 다르다는 단언.
- K 보정(K=1부터 2배, B1·C1 각 5묶음 최솟값 ≥ 50 ms, maxK 1024), 시간 밖 correctness digest.
- n=30 nearest-rank median=`sorted[14]`, p95=`sorted[28]`. A/A 기준, 시도 최대 3회, 30 s cooldown. 세 번째 무효면 필수 INVALID로 중단.
- 판정 CAND=C1/REF=B1과 시간 임계. 첫 비PASS 행에서 블록 중단. child timeout 1,800 s.
- 메모리 gate: 3회 × 18행 × arm 2 = 108 child, `--expose-gc`만(기본 heap), 짝·홀 반복 순서, timeout 600 s, R·P 정의와 임계, 행 분류 우선순위, 블록 상태.
- 정보용 블록은 같은 run 이름의 두 필수 블록이 모두 pass한 뒤에만 실행한다. 부모 exit code, 실행 거부 조건, 기록 항목, 금지 사항도 그대로다.
- **최종 승인 = run2 시간 블록 pass 그리고 run2 메모리 블록 pass.**

## 한계(측정 전 기록)
- 이 순서는 주기 2(홀짝)와 직전 사본 전이만 균형한다. mod 4 위상 노출(C2 [0,0,15,15], 나머지 [10,10,5,5])과 2칸 떨어진 쌍(lag-2 5–15)은 균형하지 않는다.
- 15/15에서는 `sorted[14]` 중앙값이 두 표본 군집의 경계에 놓일 수 있어, 교대가 깨지면 민감하다.
- run1의 교대 원인(GC, OS 등)은 확인되지 않았다. 이 변경은 원인 확정·무편향·run2 통과를 보장하지 않는다.

## 실행·보존
- 측정 전(1단계): `--check-only`, `--self-check --output=research/results/n34-cr-policy/selfcheck-run2.json`, 표준 npm 7단계. 1단계에서 10 MiB 실측은 하지 않는다.
- 측정(2단계, primary 실행권 전달 뒤): `node research/src/n34-cr-policy-perf.mjs --prereg=<이 문서와 하네스를 마지막으로 바꾼 커밋> --block=timing --output=research/results/n34-cr-policy/perf-run2-timing.json`. 시간 블록이 pass하면 `--block=memory … perf-run2-memory.json`, 두 블록이 모두 pass하면 `--block=info … perf-run2-info.json`.
- run2도 무효나 실패면 기존 기준대로 종료한다. run3 자동 실행, 유효 FAIL 재시도, 필수→정보용 강등, heap 증액, 임계 변경은 하지 않는다.
