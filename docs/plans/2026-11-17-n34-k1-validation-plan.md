# N34 K1 공식 검증·F1 위험 판정 계획 초안 (P10 계획 단계, 2026-11-17)

- 상태: **primary 최종 PASS WITH NOTES(@`47c290e`), 사용자 U1–U4 권장안 채택(2026-11-17).** 채택은 실행 승인이 아니다. 후속 구현·synthetic 검증은 승인되어 PR #119에서 진행한다. 공식 측정 1회 실행·F1 기준 변경·위험 수용·Ready·merge는 미승인이다
  - 아래 본문은 채택 시점의 계획 그대로다. 이 갱신은 상태·채택 기록만 바꿨다
  - 사용자 A(2026-11-16)로 승인된 것은 경로 확정(K1 유지)과 이 계획의 준비까지다. D1의 1회 승인은 P02에서 소진됐다
  - DQ1(2026-11-17)은 main 순차 통합으로 결정됐다. merge 승인이 아니다
- 이 문서는 새 측정·진단·시뮬레이션 없이 기존 원자료 필드와 검토된 문서 값만 인용한다. "구현 예정"은 현재 N34 성능 runner에 없는 기능이다
- 작성: Claude Code(`claude-opus-5-5`). 작성자 자기 검증은 독립 검토가 아니며, 최종 판정은 primary가 한다
- Task handoff: [p10-k1-validation-plan.md](../agent/handoffs/p10-k1-validation-plan.md). 상위: [P03 결정 자료][p03], [품질 계획 P10·§5.1·§7][plan]

## 0. 요약
- 질문: K1 제품 코드를 main과 직접 비교하는 공식 run 1회를 **어떤 프로토콜로** 하고, 같은 입력 F1 결과를 **어떻게 처분할지** 실행 전에 정한다
- 권장 초안: **P-1 run3 측정 논리 그대로 + 운영 보강**(BASE main·CAND K1, 블록 운영 예산 집행(수용 상한), 정보용 원자료 완비, 블록 간 신원 대조)
  - 승인된 N34 자원 gate가 묻는 것은 공개 호출 1회의 시간(median·p95)이다. P-1은 그 질문을 바꾸지 않는다
  - 알려진 위험: 같은 K1 CAND 코드에서 O2/F3 A/A가 3/3 무효였다(O-3). 다시 INVALID면 재실행하지 않고 중단·재결정한다
- 정책 선택지: **P-2 고정 묶음 표본**은 질문을 "4연속 호출 합"으로 바꾸는 별도 정책 선택이다. 기본 권장이 아니다(§9)
- 별도 설계가 필요한 경로: P-3 child 단위 반복, K 하한 8, B 철회는 이 문서에 완비된 실행안이 없다(§3, §10)
- 판정은 넷으로 기록한다(§2): J1 A/A 유효성, J2 공식 timing·memory, J3 정보용 행·블록, J4 F1 최종 처분
- S-2 권장(§7): F1 same-input은 **정보용 유지 + 실행 전 승인된 처분표**
- 실행 권한 제안: 공식 run 1회(timing → memory → 정보용 각 1회 호출). 사전등록 A/A 재시도 외 재실행 없음

## 1. 근거 고정
| 대상 | 값 | 비고 |
|---|---|---|
| main | `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3` | 이 Task base, run3 BASE |
| K1 제품 후보 | [`4999c1f`][c-4999] | K1 run1 CAND. main 대비 `policy.ts` +21/−3, `bin` +17/−3(numstat 직접 확인) |
| pre-K1 | [`7e732e0`][c-7e73] | run3 CAND 코드와 같음(P03 §1) |
| PR #119 head | [`fd93c54`][c-fd93] | `4999c1f..fd93c54`의 `src`·`bin`·`package.json`·`package-lock.json` diff 0줄(직접 확인). 그 사이 22 commit은 문서·측정 도구·raw다 |
| PR #121 / #122 | [`32e2ba6`][plan] / [`cfd4e30`][p03] | 품질 계획 / P03 결정 |
| 기존 protocol | [run1][prereg1] ← [run2][prereg2] ← [run3][prereg3], [K1 증분][k1-prereg] | run3는 run2·run1 조항을 상속한다 |
| 시간 예산 선례 | [D1 보완 1 §1][d1-amend], [`n34-k1-diag.mjs` L282–L331][d1-budget] | 전역 마감 시각, 단계 timeout = min(단계 상한, 남은 예산), child 시작 조건. N34 성능 runner에는 없다 |

- **제품 코드 후보와 측정 도구를 구분한다.** CAND는 `4999c1f` 제품 코드(`src`·`package*`)다. P10 runner·worker·prereg는 그 위에 더하는 측정 도구 commit이며 제품 코드를 바꾸지 않는다
- 측정 대상은 기존과 같이 각 snapshot의 `tsc` 산출 `dist`다. 배포 `bin` 번들은 성능 run이 아니라 7단계 gate로 확인한다

### 1.1 이 계획이 기대는 관측 사실
| # | 사실 | 출처 |
|---|---|---|
| O-1 | run3(BASE main, CAND pre-K1): timing 18행 PASS(2026-11-14 11:12–15:01 UTC), memory 108 child PASS(15:02–15:07), 정보용 8행 완료(15:07–16:56) | [`perf-run3-timing.json`][r3t], [`-memory`][r3m], [`-info`][r3i]의 `startedAt`·`finishedAt` |
| O-2 | run3 정보용 same-input F1: O1 비 1.642342, O2 비 1.390836, 둘 다 `failed_gate` 표기(정보용 한계 초과), A/A 유효 | [`perf-run3-info.json`][r3i] |
| O-3 | K1 run1(BASE pre-K1, CAND K1): O1 9행 pass, O2/F3 CAND A/A 3회 무효 → INVALID(exit 5), O2 8행 notRun, memory NOT RUN | [`perf-k1run1-timing.json`][k1t] |
| O-4 | K1 run1 O2/F3 A/A: C2/C1 median 비 1.122 / 0.888 / 0.869(기준 0.95–1.05 밖), p95 조건은 3회 모두 통과. BASE 비 1.020 / 1.002 / 1.023 | 같은 파일 `attempts[].aa` |
| O-5 | run3 O2/F3 CAND A/A 비 0.974(유효). PM 사후 서술 기준으로 C 사본 lo 개수 15/22, 경계값 | 같은 run3 파일, PM 비추적 분석 `n34-k1-analysis/analysis.md` F4 |
| O-6 | 모든 행의 보정 K = 1(run3 18행, K1 run1 10행). 호출 1회가 이미 50 ms를 크게 넘는다 | 두 timing 파일 `rows[].k` |
| O-7 | PM 사후 서술: K1 run1 O2/F3 CAND의 두 무리 간격(hi 중앙 − lo 중앙) 345–389 ms, CAND median 약 2.05 s와 2.30–2.35 s | PM 분석 F1·F2(판정 기준 아님) |
| O-8 | D1(1회): b − a C wall median +126.2/+210.1/+208.3 ms, 나머지 방향 섞임. 강제 GC는 heap 상태와 간격을 함께 바꾼다 | [D1 결과][d1] |
| O-9 | run3 정보용 블록은 행마다 `key, k, child, stats, aa, ratioC1toB1Median, informationalStatus, reason`만 저장한다. 보정 단계·표본·digest·view·시도 번호는 없다 | [run3 runner L528][info-save] |
| O-10 | 시도 child의 digest 4개가 다르면 A/A·통계 전에 `failed_correctness`를 돌려준다. 정보용 블록도 같은 함수를 쓴다 | [run3 runner L348–L350][r3-digest] |

- 해석 경계(유지): K1 timing INVALID·memory NOT RUN·F1 미해결. run3 PASS와 O-2 비율은 **pre-K1 대 main**의 기존 결과이며 K1에 승계하지 않는다. D1은 원인 확정·유의성·GC 중립성·공식 PASS·memory 대체의 근거가 아니다. K1 증분 prereg §6의 0.95/1.05 구간은 서술용 분류값이며 통계적 동등성이나 main 대비 F1 허용 기준이 아니다

## 2. 판정의 분리
| 판정 | 정의 | 결과값 |
|---|---|---|
| J1 A/A 측정 유효성 | 시도마다 B2/B1, C2/C1이 각각 median 비 0.95–1.05(또는 차 ≤ 0.1 ms)이고 p95 차의 절댓값 ≤ max(0.2 ms, 참조 p95 × 0.20). 필수 행은 최대 3시도, 정보용 행은 1시도 | 유효 / 무효. 필수 행 3회째 무효 = 행 INVALID |
| J2 공식 필수 성능 | timing 블록 `pass`(18행 모두 pass) **그리고** memory 블록 `pass`. 블록 상태에는 마무리 검사(§6.3)가 포함된다 | PASS / failed_correctness / failed_gate / INVALID / error / `ref_failed` 포함 비PASS |
| J3 정보용 기록 | (a) 정보용 행 8개 각각의 판정 (b) 정보용 블록 상태와 수용 조건(§7.2) | 행: §7.2의 V/X/C/I(aa·run·raw)/N. 블록: 수용 / 측정 미완·운영 실패 / 무결성 실패 / 미실행 |
| J4 F1 최종 처분 | J2와 J3를 §7.3 우선순위로 합친 처분 | D-0 / D-1 / D-2 / D-3 / D-4 |

- J1은 J2·J3의 전제다. J1 무효 행의 비율은 기록하되 해석하지 않는다
- J3는 J2를 뒤집지 않는다. 위험을 자동으로 수용하지도 않는다. 네 기록은 결과 파일과 보고에 따로 남긴다

### 2.1 F1 입력 매핑 (main을 BASE 코드로 쓰는 것 ≠ 같은 입력 비교)
| 비교 | CAND 사본 C1·C2 | BASE 사본 B1·B2 | 지위 | 기존 명세 |
|---|---|---|---|---|
| 공식 G-C F1 | K1 코드, 입력 F1(CR 10 MiB) | main 코드, 입력 **F4**(LF 10 MiB) | 필수 gate | [`perf-inputs.mjs` L41][inputs-f1] `{ id: 'F1', cand: 'F1', ref: 'F4', gate: 'G-C' }`, [run1 prereg][prereg1] G-C 정의 |
| same-input F1 | K1 코드, 입력 F1 | main 코드, 입력 **F1** | 정보용(현행) | [run3 runner L524][info-rows] `ref: r.cand`, key `…:same-input` |
| (참고) K1 run1 F1 | K1 코드, F1 | pre-K1 코드, F1 | 증분 run, P10 아님 | [`n34-k1-perf-rows.mjs` L11][k1-rows] `cand: id, ref: id` |

- 공식 PASS는 F1에 대해 "K1이 CR을 나누는 비용이 main의 LF 처리 비용 대비 한계 안"만 보장한다. main은 단독 CR을 줄로 나누지 않으므로, same-input F1은 서로 다른 작업량의 비교다
- 현행 정보용 블록은 같은 run 이름의 timing·memory가 모두 pass한 뒤에만 실행된다([run3 runner L473–L478][info-gate]). 정보용 판정 표기는 필수와 같은 수치를 쓰되 1시도·재시도 없음이다

## 3. 대안 비교 (같은 축)
| 축 | **P-1 run3 측정 논리 + 운영 보강(권장 초안)** | P-2 고정 묶음 표본(정책 선택지) | P-3 child 단위 반복(별도 설계 필요) |
|---|---|---|---|
| 측정 보존 | 입력·행·순서·사본·교대·K 보정·n·순위·A/A·임계·3시도·memory·정보용 판정 전부 | P-1과 같음. 표본 정의만 바뀜 | 입력·행·사본·child 안 교대·memory |
| 변경 | BASE=main, CAND=K1 고정, 새 run 이름·결과 폴더, 운영 보강 4가지(§5–§6) | P-1 + 실효 K = max(4, 보정 K), 시도 child timeout 7,200 s, 묶음 안 호출 시각 기록 | 행마다 사전등록 child 여러 개 전부 실행, child 간 집계로 판정·A/A 재정의 |
| 질문·추정 대상 | 기존과 같음: 한 child 안 교대 조건의 **공개 호출 1회** wall time, 사본별 nearest-rank median·p95. 표본 간 독립을 가정하지 않는다 | **다름**: 같은 사본 실효 K회 연속 호출 합의 median·p95. 호출 1회 꼬리(p95) 보장을 포기한다 | 다름: child별 median 비의 집계 |
| 관측 근거 | O-1 run3 PASS, O-6 | O-4·O-7: 무효의 모양이 사본 median이 두 무리 중 어느 쪽에 놓이느냐와 일치 | 반복 단위를 프로세스로 두는 일반 원칙 |
| 가설(미확인) | 이번 run에서 두 무리 비율이 경계에서 벗어날 수 있다. 근거는 없다 | 묶음 합에서 한 호출의 무리 차이는 약 Δ/(K·T)로 작아진다. Δ 345–389 ms, T 2.05–2.35 s, K=4 → 약 3.7–4.8%. 이는 한 호출 차이의 크기 산술이며 A/A median 차이의 상한·확률·효과 증거가 아니다 | child 간 변동이 child 안 무리 효과보다 작다 |
| 정책 | 기존 정책 안(측정 판정 동일). 운영 보강은 S-3 운영값 | 추정 대상 변경 → **별도 정책 승인 필요** | A/A·판정 집계·반복 단위 변경 → 큰 정책 변경 |
| 자원 | 블록 운영 예산 C 10 h / 1 h / 4 h 제안(§6.1, 수용 상한). run3 실측 3.8 h + 5 min + 1.8 h | 운영 예산 C 24 h / 2 h / 10 h 제안. 검증된 소요 없음 | 미정(설계 없음) |
| 회귀 위험 | K1 run1과 같은 CAND 코드에서 O2/F3 A/A 3/3 무효(O-3). 재발 가능 | 효과 미검증, 시간 약 4배, 다시 INVALID 가능 | 미정 |
| 실패·무효 시 | 중단, 사용자 재결정(B 기본, P03 §6.1) | 같음 | 같음 |
| 이 문서의 완성도 | 실행 전 prereg로 옮길 수 있는 수치·절차를 §5–§8에 적었다 | §4 표와 §6.1의 차이만 적었다. 정책 승인 뒤 같은 형식으로 prereg에 옮긴다 | timeout·예산·A/A 집계·오류 처리가 없다. 고르면 별도 설계·검토·승인이 필요하다 |

- 검토 후 제외한 변경
  - 표본 수 증가·홀수화만: rank median이 두 무리 사이를 오가는 구조(O-7)는 n을 바꿔도 남는다. 해결로 주장하지 않는다
  - 표본 전 강제 GC: D1에서 heap 상태와 간격을 함께 바꿨다(O-8). 중립적 수정이 아니다
  - BASE·CAND를 서로 다른 프로세스로 분리: 같은 프로세스 교대 원칙과 충돌하고 startup·cache·GC 조건이 arm마다 달라진다. 자동으로 유효해지지 않는다
  - P-2에서 O2 행에만 K 하한 적용: 행마다 추정 대상이 달라진다
  - K 하한 8: 한 호출 차이 산술을 줄이는 것은 통과 여유의 증거가 아니다. 예산·timeout도 정하지 않았다. 고르면 별도 설계다

## 4. 기존 프로토콜 대 권장안·선택지
| 요소 | 기존(run3, 상속 포함) | 권장 P-1 | P-2 선택 시 | P-1 측정 동등성 | 정책 변경 | 추정 대상 변화 |
|---|---|---|---|---|---|---|
| BASE / CAND | main `5d668f9` / 측정 HEAD(pre-K1) | main `5d668f9` / 측정 HEAD(제품 코드 = `4999c1f`) | P-1과 같음 | 코드만 바뀜 | 아니오(A 선택 범위) | 아니오 |
| 입력·행·순서 | 9입력, 18행, O1 → O2, G-C 매핑 | 같음 | 같음 | 같음 | 아니오 | 아니오 |
| correctness digest | 시간 밖, 사본 4개 공개 view 동일 | 같음 | 같음 | 같음 | 아니오 | 아니오 |
| child·사본 수명 | 시도마다 fresh hidden child 1개, 사본 4개 import | 같음 | 같음 | 같음 | 아니오 | 아니오 |
| 교대 순서 | `ABCDBDCADACB` / `ADACDBDCBABC` 교대, warmup 2 + 측정 10 순환 = 144표본 | 같음 | 같음 | 같음 | 아니오 | 아니오 |
| K | 보정 K: K=1부터 2배, B1·C1 각 5묶음 최솟값 ≥ 50 ms인 최소 K, maxK 1024(관측 K=1) | 같음 | 보정 K는 같은 규칙. **실효 K = max(4, 보정 K)**로 표본을 만든다. 보정 K가 8이면 실효 K도 8 | 같음 | P-2만 예 | P-2만 예 |
| 표본·타이머 | 표본 = 실효 K회 호출 전후 `performance.now()` 2개의 차 | 같음 | 표본마다 시각 K+1개 기록(시작, 호출 경계 K−1개, 끝). 판정값 = 끝 − 시작. 안쪽 시각 K−1개를 읽고 저장하는 비용이 측정 구간에 들어가며, 모든 사본에 같은 횟수로 들어가지만 크기는 측정하지 않았다 | 같음 | P-2만 예 | P-2만 예 |
| n·순위 | 사본당 30, median=`sorted[14]`, p95=`sorted[28]` | 같음 | 형식 같음, 대상 다름 | 같음 | P-2만 예 | P-2만 예 |
| A/A·성능 임계 | §2 J1, median ≤ max(×1.10, +0.5 ms), p95 ≤ max(×1.20, +1 ms) | 같음 | 수치 같음. 대상이 바뀌어 **같은 판정 아님** | 같음 | P-2만 예 | P-2만 예 |
| 시도·cooldown | 최대 3, 30 s, 3회째 무효 = INVALID 중단 | 같음, 단 예산 규칙(§6.1) 안에서 | 같음 | 같음(예산 부족 시 행 invalid) | 운영값 | 아니오 |
| child timeout | 보정·시도 1,800 s | 같음 | 보정 1,800 s, 시도 7,200 s | 같음 | 운영값 | 아니오 |
| memory | 108 child, `--expose-gc`만, 600 s | 같음 | 같음 | 같음 | 아니오 | 아니오 |
| 정보용 측정 | 필수 두 블록 pass 뒤, G-C 4입력 same-input × O1·O2, 1시도 | 같음 | 실효 K 규칙 적용 | 같음 | 아니오 | P-2만 예 |
| 정보용 원자료 | O-9의 요약 필드만 | **전체 timing 행 형식**(§6.4, 구현 예정) | 같음 | 기록 강화 | 아니오 | 아니오 |
| 시간 예산 | child timeout만, 블록 전체 상한 없음 | **블록 운영 예산 C와 단계 진입·timeout 집행**(§6.1, 구현 예정, 수용 상한) | 같음, 수치만 다름 | 측정 같음 | 운영값(S-3) | 아니오 |
| 블록 간 신원 | 같은 run 이름의 이전 블록 `status`만 확인 | **run·prereg·하네스·제품 tree·snapshot·입력·protocol·환경 대조**(§6.5, 구현 예정) | 같음 | 기록 강화 | 아니오 | 아니오 |
| 잔류 프로세스 | 기록 없음 | child pid·시작 시각 기록과 종료 확인(§6.2, 구현 예정) | 같음 | 기록 강화 | 아니오 | 아니오 |

- P-1의 운영 보강은 pass 기준을 바꾸지 않는다. 다만 예산이 모자라면 실행되지 않은 행이 생기고 블록이 INVALID가 될 수 있다. 이 상한은 S-3 결정이다

## 5. 권장 초안 P-1의 실행 절차
### 5.1 tree·환경
- BASE: `git archive 5d668f9` → 임시 폴더 → `npm ci --ignore-scripts` → `tsc`(기존 방법, [`buildSnapshots`][k1-build])
- CAND: 측정 HEAD. `git diff --numstat 5d668f9 HEAD -- src` = `21 3 src/core/policy.ts`, `dist/src/core`에서 다른 파일은 `policy.js`뿐, lockfile 동일. 다르면 실행 거부(기존 검사 형식, 기대값만 새로)
- 측정 HEAD의 제품 코드는 `4999c1f`와 같아야 한다. `git diff 4999c1f HEAD -- src package.json package-lock.json` 0줄을 runner가 확인한다(구현 예정)
- main이 그사이 바뀐 경우: §8.3. BASE를 조용히 바꾸지 않는다
- 환경: Windows, Node `v24.18.0`, 같은 PC. 기록 항목은 기존 `environment()`(Node·V8·OS·arch·CPU 모델·논리 CPU 수·총 메모리·전원 계획)이다

### 5.2 블록과 순서
| 블록 | 단위 | 수 | 진입 조건 |
|---|---|---|---|
| timing(필수) | 행마다 보정 child 1 + 시도 child ≤ 3 | 18행 | 사용자 1회 실행 승인, prereg 동결, primary preflight PASS |
| memory(필수) | child 1개 = (행, arm, 반복) | 108 | 같은 run의 timing `pass`와 신원 일치(§6.5) |
| 정보용 | 행마다 보정 child 1 + 시도 child 1 | 8행 | 같은 run의 timing·memory 모두 `pass`와 신원 일치 |

- 순서: timing → memory → 정보용. timing은 첫 비PASS 행에서 멈춘다(기존). memory는 108 child를 모두 시도한다(기존, 예산 안에서)
- 블록마다 raw를 바로 commit한다. 이 commit은 그 블록의 결과 파일 하나를 추가할 뿐이다(§6.5)
- 결과 파일: run ID `p10run1`에서 도출한 정확한 이름 3개(§6.5). 덮어쓰기 거부(기존)

### 5.3 시도 child 안 (timing·정보용 공통, 기존 worker와 같음)
1. 사본 4개(B1·B2 = BASE dist, C1·C2 = CAND dist 바이트 복사) import
2. 입력 생성(필수 G-C 행은 C에 X, B에 LF(X); 정보용은 모두 X), O2는 시간 밖에서 파일 쓰기
3. 사본마다 공개 view digest 1회. 4개가 다르면 A/A·통계 전에 `failed_correctness`(O-10)
4. 144표본(warmup 24 + 측정 120). 표본 하나 = 같은 사본 보정 K회 연속 호출
5. 사본당 측정 30개로 median·p95 → A/A → gate. 필수 행은 무효면 30 s 뒤 새 child(최대 3, §6.1 예산 안에서)

### 5.4 행·블록 판정 (기존 규칙)
- timing 행: child 비완료 → invalid, digest 불일치 → failed_correctness, 표본 이상 → invalid, A/A 3회째 무효 → invalid, 유효 → pass 또는 failed_gate. 그 뒤 원자료 검사로 pass만 invalid가 될 수 있다([`applyRawCheck`][k1-raw])
- memory 행 우선순위: 실행 수 부족(`missing_runs`) → invalid → spawn/parse → invalid → REF 자원 실패 → `ref_failed` → REF 기타 → invalid → CAND OOM·timeout·RangeError → failed_gate → CAND 기타 → invalid → digest 불일치 → failed_correctness → 임계([memoryRow][k1-mem])
  - 반복이 덜 끝난 행은 먼저 `missing_runs`로 invalid다. 끝난 반복만 보고 새 FAIL을 추정하지 않는다
- 블록 상태: 18행이 정확히 한 번씩 모두 pass일 때만 `pass`. 아니면 failed_correctness > failed_gate > invalid
- 마무리 검사(환경 동일·추적 파일 불변·임시 폴더 정리) 실패는 `pass`·`incomplete`·`completed_informational`·`self_check_completed`를 `error`로 바꾸고, 이미 판정된 failed_correctness·failed_gate·invalid는 그대로 두고 `finalizationErrors`에 따로 남긴다([기존 finalize][k1-final])
- 블록 본문의 예외(snapshot 명령 실패, snapshot 동일성 단언 실패 등)는 기존 `catch`에서 `error`(exit 1)가 된다

## 6. 시간 예산·실패 처리·원자료
### 6.1 블록 운영 예산 (구현 예정, D1 방식 이식)
- 정의는 블록마다 하나이고, 마무리 예비 R은 한 번만 뺀다
  - t0 = runner 시작 단조 시각, C = 블록 운영 예산(아래 표), D = t0 + C, R = 10분, Dwork = D − R
  - remainingWork = max(0, Dwork − now), remainingTotal = max(0, D − now)
  - 작업 단계(preflight 명령, snapshot, 보정, 시도, cooldown, memory child)는 remainingWork만 쓴다. 마무리 단계(소유 child 종료, raw 저장, 환경·추적 파일 검사, 임시 폴더 삭제, 잔류 확인)는 remainingTotal만 쓴다
- 단계 상한은 선택한 프로토콜 값을 prereg에 고정한다

| 기호 | 단계 | P-1 | P-2 |
|---|---|---|---|
| Tcmd | 명령 하나(`git`·`powercfg`·`git archive`·`tar`·`npm ci`·`tsc`) | 600 s | 600 s |
| Tcal | 보정 child | 1,800 s | 1,800 s |
| Tatt | 시도 child | 1,800 s | 7,200 s |
| Tcool | A/A 무효 뒤 cooldown(필수 행만, 정보용은 1시도) | 30 s | 30 s |
| Tmem | memory child | 600 s | 600 s |
| Tkill | 소유 PID 트리 종료 | 10 s | 10 s |

- 진입 조건과 timeout(작업 단계)
  - 명령: remainingWork > 0일 때만 시작한다. timeout = min(Tcmd, remainingWork)
  - 행 시작(보정 child): remainingWork ≥ Tcal + Tatt. 아니면 그 행과 뒤 행은 `notRun(budget)`
  - 시도 child: remainingWork ≥ Tatt일 때만 시작하고 timeout은 Tatt 그대로다. 진입 조건 때문에 시작한 child를 예산으로 자르지 않아도 Dwork 안에 끝난다
  - 재시도: remainingWork ≥ Tcool + Tatt일 때만 cooldown 뒤 다음 시도로 간다. 아니면 그 행은 `invalid(budget_before_retry)`
  - memory child: remainingWork ≥ Tmem. 아니면 남은 child는 `notRun(budget)`이고, 반복이 모자란 행은 기존 규칙대로 `missing_runs` invalid다
- 마무리 단계: 각 단계 timeout = min(그 단계 상한, remainingTotal). remainingTotal이 0이어도 raw 저장은 시도하고 결과를 기록한다
- snapshot 빌드가 remainingWork 부족으로 끝나지 않으면 모든 행이 `notRun(build_incomplete)`이고 블록은 invalid(exit 5)다
  - 이는 P10 구현 예정 규칙이다. 기존 K1 runner에서는 같은 상황이 예외 → `error`(exit 1)이고, D1에서는 `partial`(exit 2)이었다
  - 예산이 아닌 빌드 실패는 기존대로 `error`(exit 1)다
- 종료 한계: 동기 명령(`git`·`tar`·`tsc`·`powercfg`)은 timeout이 되면 직접 띄운 프로세스만 끝난다. `npm`과 child는 기록한 PID 트리를 `taskkill /PID <pid> /T /F`(Tkill)로 끝낸다. 이미지 이름으로 종료하지 않는다(D1 보완 1 §1의 한계와 같음)

#### C는 운영·수용 상한이다 (hard wall 아님)
- 집행되는 것: 단계 진입 거부, 명령·child timeout. 정상 경로의 작업은 Dwork 안에 끝나도록 짜여 있다
- 집행되지 않는 것: 동기 파일 작업(JSON 저장, 해시, 임시 폴더 삭제), OS 지연, 프로세스 종료 지연. runner는 이 작업을 중간에 끊지 않는다. 그래서 C는 "넘지 않는다"를 보장하는 벽이 아니다. **넘으면 비PASS로 처리하는 수용 상한**이다
- 시간 기록(ms, 단조 시계)
  - `workOverrunMs` = max(0, 작업 종료 − Dwork): 작업이 마무리 예비를 침범한 양
  - `finalizationMs` = 마무리 종료 − 마무리 시작, `finalizationOverReserveMs` = max(0, finalizationMs − R): 마무리 자체가 R보다 오래 걸린 양
  - `capOverrunMs` = max(0, 마무리 종료 − D): 총 예산 C를 넘은 양
- 수용 규칙: **`capOverrunMs` > 0이면 블록 비PASS**다. 필수 블록 `pass`와 정보용 `completed_informational`만 `error`(exit 1)로 바꾸고, 이미 판정된 실패 상태는 그대로 둔다(§6.3, §7.2)
  - `workOverrunMs`나 `finalizationOverReserveMs`가 0보다 커도 `capOverrunMs`가 0이면 기록만 한다
  - 초과가 하나라도 있으면 원인과 실제 시간을 보고하고, 운영자가 잔류 프로세스·임시 폴더 상태를 확인해 기록한다
- 엄밀한 hard wall(별도 watchdog 프로세스 등)이 필요하면 별도 설계·승인 대상이다. 이 계획은 그것을 추가하지 않는다
- 전원 차단·OS 중단에서는 저장과 정리를 보장하지 않는다(§6.2)

| 블록 | 예산이 없을 때 단계 상한으로 본 구성상 최대 | **제안 운영 예산 C(S-3, R 포함)** | 과거 실측(검증된 P10 소요 아님) |
|---|---|---|---|
| P-1 timing | 행마다 Tcal + 3 × Tatt + 2 × Tcool = 7,260 s, 18행 36.3 h | **10 h** | run3 3.8 h(O-1) |
| P-1 memory | Tmem × 108 = 18 h | **1 h** | run3 약 5 min |
| P-1 정보용 | (Tcal + Tatt) × 8 = 8 h | **4 h** | run3 1.8 h |
| P-2 timing / memory / 정보용 | 행마다 1,800 + 3 × 7,200 + 60 = 23,460 s, 18행 117.3 h / 18 h / (1,800 + 7,200) s × 8 = 20 h | 24 h / 2 h / 10 h | 없음 |
| snapshot 빌드 | 명령마다 Tcmd | 각 블록 C 안 | 수 분(K1 prereg §7) |

- 용어를 하나로 쓴다
  - **운영 예산 C**: runner 시작부터 마무리 종료까지. P-1 합계 15 h
  - **운영 창**: 사용자가 PC를 비워 두는 시간. 블록마다 C + 30분(실행 전 확인, 실행 뒤 잔류 확인 포함)을 제안한다
- C와 운영 창에 들어가지 않는 시간: 블록 사이 대기·사용자 유휴, raw commit, 독립 재계산, 7단계 gate

### 6.2 부모 중단·잔류 프로세스
- child를 띄우는 즉시 pid와 시작 시각을 결과 파일에 저장한다(구현 예정)
- 블록 끝에 기록된 pid가 모두 종료됐는지 확인한다. 남아 있으면 그 PID 트리만 종료하고 `leftoverPids`로 기록한다. 잔류는 블록 수용 실패다(§6.3)
- 부모가 중단되면(사용자·크래시·전원) 결과 파일은 `status: incomplete`로 남는다. 운영자가 결과 파일의 pid 목록을 읽어 **같은 PID이고 프로세스 시작 시각이 기록과 맞는 node 프로세스만** 종료하고 기록한다. 임시 폴더는 접두사·위치 확인 뒤 지운다. 재개하지 않고 같은 이름을 다시 쓰지 않는다

### 6.3 블록 결과 우선순위 (필수 블록)
| 순서 | 상황 | 행 기록 | 블록 상태·exit |
|---|---|---|---|
| 1 | 판정된 행 중 failed_correctness가 있음 | 그대로 | failed_correctness, 3 |
| 2 | 판정된 행 중 failed_gate가 있음 | 그대로 | failed_gate, 4 |
| 3 | invalid 행(child 실패·A/A 3회 무효·원자료 누락·`missing_runs`·`budget_before_retry`), notRun(budget·build_incomplete), 또는 memory `ref_failed` 행이 있음 | 사유별로 그대로. `ref_failed` 행은 상태와 사유(REF child 상태 목록)를 유지 | invalid, 5. `refFailedRows`에 행 목록 |
| 4 | 위가 없고 블록 본문 예외(예산 외 snapshot·명령 실패, 단언 실패) | 저장된 행까지 | error, 1(기존 `catch`). `error`에 원인 |
| 5 | 위가 없고 마무리 검사 실패·`capOverrunMs` > 0·잔류 pid | 행은 pass | error, 1. `finalizationErrors`·`leftoverPids`·시간 기록에 원인 |
| 6 | 부모 중단 | 저장된 행까지 | 파일에 `incomplete`가 남음(처분상 INVALID, 중단). 재개 없음 |
| 7 | 모두 아님 | 18행 pass | pass, 0 |

- 예산은 이미 판정된 행의 상태를 덮지 않는다. memory에서 앞 행이 failed_gate·failed_correctness로 끝났으면 뒤 child가 예산으로 notRun이어도 블록 상태는 1·2번이 우선이다
- `ref_failed`는 REF(main) 쪽 자원 실패라 판정이 없는 행이다(기존 [memoryRow][k1-mem], [blockStatus][k1-block], [memoryOutcome][k1-memout])
  - 더 높은 실패가 없으면 블록은 invalid(exit 5)다. failed_gate나 failed_correctness가 함께 있으면 블록 상태는 그쪽이고, `refFailedRows`와 각 행의 사유는 그대로 남는다
  - 어느 경우든 J2 비PASS → D-3이다. 보고에는 블록 상태와 함께 "REF 실패 행: 새 사용자 결정 필요"를 올린다
- 외부 원인 추정(백신 검사, 업데이트 등)만으로 INVALID·FAIL을 지우거나 재분류하지 않는다

### 6.4 단계별 원자료 (구현 예정, K1 `timingRawViolations` 기준 확장)
- 정보용 행도 필수 timing 행과 같은 형식으로 저장한다. 요약만 남기는 O-9 방식을 쓰지 않는다
- 행 공통 필드(항상 필수): `key, op, gate(원 행 값 G-C), cand, ref(=cand), informational: true, calibration.child, attempts(배열, 비어 있을 수 있음), status, reason, rawViolations, rawComplete`
- `child` 기록 필드: `status, exitCode, signal, wallMs, startedAt, finishedAt, nodeArgs, pid, stderrTail`
- worker가 낸 **원시 자료**와 부모가 단계마다 계산하는 **파생 자료**를 나눈다
  - 원시: `calibration.steps`(각 K와 B1·C1 5개 ms)·`calibration.k`, 시도의 `samples`(정확히 144개, 각 `order, label, arm, ms`, P-2이면 `stampsMs` K+1개 추가), `digests`·`views`(사본 4개)
  - 파생: `stats`(사본 4개의 n=30·median·p95), `aa`, `gate`, `ratioC1toB1Median`, `selectedAttempt`

| 도달 단계(시도 상태) | 필수 | 그 단계에서 계산하지 않아 없어도 되는 것 | 정보용 행 판정 |
|---|---|---|---|
| 보정 child 비완료 | 공통 | `calibration.steps`·`k`, 시도(attempts = []) | I(run) |
| 보정 완료, 정지 조건 미충족 | 공통 + `steps`·`k` | 시도(attempts = []) | I(run) |
| 시도 child 비완료 | 위 + 시도 `number`·`child` | 그 시도의 원시·파생 전부 | I(run) |
| 시도 완료, digest 불일치(`output_mismatch`) | 위 + `samples`·`digests`·`views` | 파생 전부 | C |
| 시도 완료, 표본 순서·개수 오류(`invalid_samples`) | 위 + `digests`·`views`, `samples`는 받은 그대로 | 파생 전부 | I(raw) |
| A/A 무효(`invalid_aa`) | 위 + `samples` 144개 + `stats`·`aa`·`gate`·`ratioC1toB1Median` | `selectedAttempt` | I(aa) |
| 유효(`valid`) | 위 전부 + `selectedAttempt` = 1 | 없음 | V 또는 X |

- `selectedAttempt`는 정확성·표본·A/A가 모두 유효할 때만 생긴다. 보정 실패처럼 시도가 없는 행에는 없다
- "없어도 되는 것"의 부재는 손실이 아니다. 그 단계에서 계산하지 않았기 때문이다. 손실은 도달한 단계의 필수 항목이 빠진 경우뿐이다
- 판정 보존(K1 [`applyRawCheck`][k1-raw]와 같은 원칙)
  - 필수 항목이 빠지면 `rawViolations`에 적고 `rawComplete` = false다
  - 행 판정은 **V만** `I(raw)`로 바뀐다(기존: pass만 invalid). 이미 판정된 C·X·I(aa)·I(run)은 그대로 두고 빠진 항목만 옆에 기록한다. C를 I(raw)로 덮지 않는다
- 필수 timing 행도 같은 단계 표를 쓴다. 기존 [`timingRawViolations`][k1-rawv]가 이미 `output_mismatch`·`invalid_samples`에서 파생 필드 부재를 허용한다. 필수 행은 시도가 최대 3개이고, 판정 이름이 pass·failed_gate·failed_correctness·invalid다
- 정보용 블록 수준: 필수 블록과 같은 `files`·`snapshots`·`inputs`·`protocol`·`environment`·`preservation`·`tempCleanup`·`finalizationErrors`·`budget`(§6.1 시간 기록 포함)

### 6.5 블록 간 신원과 앞 블록 원자료 불변 (구현 예정)
- run ID는 prereg에 `p10run1`로 고정한다. 결과 파일 이름은 run ID에서만 나온다
  - timing `research/results/n34-p10/perf-p10run1-timing.json`
  - memory `research/results/n34-p10/perf-p10run1-memory.json`
  - 정보용 `research/results/n34-p10/perf-p10run1-info.json`
  - `--output`이 블록에 맞는 이 이름과 다르면 실행을 거부한다. 파일이 이미 있으면 덮어쓰지 않는다(기존)
- 블록마다 시작 HEAD를 `measurementHead`로 기록한다. 자기 결과 파일은 그 HEAD에 아직 없고, 블록이 끝난 뒤 raw commit 하나로 추가된다. 그래서 블록마다 HEAD가 다른 것은 정상이다
- memory·정보용은 시작 전에 앞 블록 파일과 다음이 모두 같은지 확인한다. 다르면 실행을 거부한다
  - run ID, schema, `preregistrationCommit`, 하네스·prereg 파일 blob 해시(`files`)
  - BASE ref와 BASE snapshot(`policyBlobSha1`, `lockfileSha256`, `distCoreSha256`)
  - CAND 제품 tree: `HEAD:src` tree 해시, `package.json`·`package-lock.json` blob, CAND snapshot 해시
  - 입력 sha256(`inputs`), protocol 상수(`protocol`), 환경(`environment` 전체)
- 앞 블록 HEAD와 현재 HEAD 사이에 허용하는 변경은 아래뿐이다. Ht·Hm·Hi는 timing·memory·정보용 블록의 `measurementHead`다
  - memory 시작: `Ht..Hm`이 정확히 commit 1개이고, 그 commit의 `git diff --name-status`가 `A research/results/n34-p10/perf-p10run1-timing.json` 한 줄
  - 정보용 시작: `Ht..Hm` 조건을 다시 확인하고, `Hm..Hi`도 정확히 commit 1개이며 `A research/results/n34-p10/perf-p10run1-memory.json` 한 줄
  - 앞 블록 파일 불변: 현재 HEAD의 앞 블록 결과 파일 blob이 그 파일을 추가한 commit의 blob과 같고, 작업 사본이 깨끗하다(기존 dirty 거부)
- 거부: 앞 블록 raw의 수정(M)·삭제(D)·rename(R), 다른 run의 결과 파일 추가, 문서·하네스·제품 변경, raw commit 외의 commit. 문서 수정은 run이 끝난 뒤 한다

## 7. F1 same-input 처분 (S-2)
### 7.1 정보용 유지 대 필수 기준 신설
| 축 | **S2-a 정보용 유지 + 사전 처분표(권장)** | S2-b same-input F1을 필수 gate로 추가 |
|---|---|---|
| 정책 | 승인된 N34 매핑(P03 F-15, §2.1) 유지. 처분 절차만 새로 승인 | **정책 변경.** G-C 정의(CR 작업 대 LF 작업) 위에 새 필수 행 2개 |
| 기준 | run3 정보용 표기와 같은 수치(median ≤ ×1.10, p95 ≤ ×1.20)를 "정보용 한계"로 기록 | 같은 수치를 필수로 쓰면 main이 하지 않는 CR 분할 작업에 10% 한계를 거는 셈이다. 다른 수치는 근거가 없다 |
| 재시도 | 1시도 | 필수 행이 되면 A/A 3시도 규칙을 받는다 |
| 결과가 나쁠 때 | 공식 PASS 유지, 사용자 명시적 수용 또는 중단·재결정 | 유효 FAIL → 경로 종료(B 기본) |
| 장점 | 기존 승인과 일관, 위험 판단을 사용자에게 명시적으로 남김 | 자동 판정, 해석 여지 적음 |
| 단점 | 사용자 판단이 결과 뒤에 남는다(선택적 사전 수준으로 완화) | pre-K1이 1.64/1.39였던 입력이라 근거 없는 기준으로 K1을 떨어뜨릴 수 있다 |

- 권장: S2-a. 선택적으로 사용자가 실행 **전에** "수용할 수 있는 same-input F1 비의 상한"을 적어 둘 수 있다. 어느 쪽도 이 문서가 정하지 않는다

### 7.2 정보용 행 판정과 블록 상태
| 행 판정 | 조건(§6.4 단계 표) |
|---|---|
| V | 유효 시도, 정보용 한계 안, 원자료 완비 |
| X | 유효 시도, 정보용 한계 초과(`failed_gate` 표기) |
| C | digest 불일치(`failed_correctness`, O-10). A/A·비율은 계산되지 않는다 |
| I(aa) | 시도 완료, 정확성·표본 정상, A/A 무효 |
| I(run) | 보정 child 실패 또는 정지 조건 미충족, 시도 child 실패 |
| I(raw) | 시도 완료지만 표본 순서·개수 오류, 또는 V가 될 행의 필수 원자료 누락 |
| N | 실행되지 않음: 블록 미실행, 예산 `N(budget)`, 부모 중단 뒤 미도달 |

- 정보용 블록은 행 하나가 실패해도 다음 행을 계속한다(run3와 같음). 그래서 행 판정은 다른 행에 영향을 주지 않는다
- **정보용 블록 상태**(구현 예정, run3 규칙 확장). 위에서부터 처음 맞는 것 하나다
  1. 부모 중단: 파일에 `incomplete`가 남는다
  2. 본문 예외: `error`, exit 1
  3. 어느 행이든 I(run)·I(raw)·N이거나 `rawComplete` = false: `error`, exit 1. run3도 child가 완료되지 않은 행이 있으면 `error`였다
  4. 마무리 검사 실패·`capOverrunMs` > 0·잔류 pid: `error`, exit 1
  5. 그 밖: `completed_informational`, exit 0. 행에 C·X·I(aa)가 있어도 블록 exit는 0이다. 처분은 §7.3이 따로 정한다
- 실패 원인 두 갈래(J3 기록)
  - **무결성 실패**: 어느 행이든 C, §6.5 신원·앞 블록 원자료 불변 위반, snapshot 동일성 단언 실패, 환경 변화, 추적 파일 변경. 성능 위험 수용으로 넘기지 않는다
  - **측정 미완·운영 실패**: 블록 상태가 `completed_informational`이 아니고 원인이 무결성 실패가 아닌 경우. child 실패, 원자료 누락, 예산 notRun, 부모 중단, 임시 폴더 정리 실패, 잔류 pid, C 초과가 여기에 든다
- **정보용 블록 수용**(D-0·D-1의 전제): 블록 상태 `completed_informational`이고 무결성 실패가 없다

### 7.3 F1 최종 처분 (우선순위 순)
| 처분 | 조건 | 다음 단계 |
|---|---|---|
| D-3 | J2가 PASS가 아님(정보용은 미실행) | 중단. 사용자 재결정, B를 기본 후속으로 올린다(P03 §6.1). 필수 G-C F1 행(CR 대 LF)의 유효 FAIL이면 P03 §5의 C 전환 조건도 함께 올린다. 비PASS 원인(측정·정리·중단·예산·`ref_failed`)은 §6.3 기록 그대로 보고한다 |
| D-4 | J2 PASS이고 정보용 무결성 실패(어느 행이든 C 포함, §7.2) | 중단. 원인 조사와 사용자 재결정. **위험 수용 대상이 아니다.** 출력 차이가 의도된 N34 동작 차이로 확인되면 그 행은 같은 작업 비교가 아니라고 기록하고, 처분은 사용자가 다시 정한다 |
| D-2 | J2 PASS, 무결성 실패 없음, 그리고 (a) 정보용 블록이 수용되지 않음(측정 미완·운영 실패) 또는 (b) F1 두 행 중 하나라도 I(aa) | 사용자 명시적 선택: (a) 미확인 범위를 적은 위험 수용. pre-K1 run3 비율은 K1 값이 아니므로 대신 쓰지 않는다 (b) 중단·재결정 (c) 별도 승인을 받은 새 측정(새 prereg·새 run ID). 측정된 X가 있으면 함께 적는다 |
| D-1 | J2 PASS, 블록 수용, F1 두 행이 V·X이고 X가 하나 이상 | 사용자 명시적 선택: (a) 측정 비율을 적은 위험 수용 (b) 중단·재결정(B 철회 또는 C). 자동 재실행 없음 |
| D-0 | J2 PASS, 블록 수용, F1 두 행 모두 V | 측정한 corpus·PC·Node 범위의 관찰로 기록. 일반 성능 보장이나 "위험 해소"로 쓰지 않는다. P10 완료 조건(§8.2)으로 진행 |

- 처분은 위에서부터 처음 맞는 것 하나다. 같은 입력 상태는 처분이 하나뿐이다
- 비-F1 6행(F2·F6·F7 × O1·O2)이 처분에 주는 영향
  - C → 무결성 실패 → D-4
  - I(run)·I(raw)·N → 블록 상태 `error` → 블록 비수용 → D-2
  - X·I(aa) → 블록 상태와 처분을 바꾸지 않는다. 행 값과 사유를 보고에 기록한다
- F1 행: C → D-4, I(run)·I(raw)·N → 블록 비수용 → D-2, I(aa) → F1 값이 없으므로 D-2
- 이 정합안은 primary 재검토 권장안을 따른 것이다. 비-F1 X·I(aa)를 처분 사유로 쓰지 않는 근거는 S-2의 처분 대상이 P03에서 미해결로 남은 F1 위험이라는 데 있다. 비-F1 X도 처분 사유로 삼을지는 U2(S-2)에서 사용자가 바꿀 수 있다. 이 문서는 정하지 않는다
- 어떤 경우도 조용히 완료로 처리하지 않는다. D-1·D-2 수용 기록에는 측정 범위, 미측정 범위, 남는 위험을 함께 적는다

## 8. 후속 구현·검증·통합
### 8.1 순서 (각 단계는 별도 승인 경계)
1. 사용자: 이 계획의 프로토콜(U1), S-2(U2), S-3(U3), 구현 범위(U4) 결정. **계획 채택은 실행 승인이 아니다**
2. PM: 구현 요청서(파일·검사·금지 범위) → 사용자 구현 승인
3. Claude: 새 runner·worker 사본(구현 예정 이름 `research/src/n34-p10-perf.mjs`, P-2 선택 시 `n34-p10-perf-worker.mjs`)과 prereg 문서. 기존 run3·K1·D1 하네스·raw는 바꾸지 않는다. 제품 코드 변경 없음
4. RED → GREEN: §8.4 검사를 먼저 실패시키고 통과시킨다
5. 회귀: `--check-only`, `--self-check`(64 KiB 합성, gate 아님), 프로젝트 7단계 gate(build 전후 `git status` 기록)
6. prereg 동결 commit → primary preflight
7. 사용자 1회 실행 승인(S-3 운영 창 포함) → 실행(§5–§6) → raw commit
8. primary 독립 raw 재계산 → J1–J3 판정 → J4 처분(§7.3), 필요하면 사용자 결정
9. §8.3 결합 후보 검증 → Ready·merge 승인 → 반영 뒤 동등성 재검증

### 8.2 P10 완료 조건 (품질 계획 P10 기준 연결)
- J2 PASS, 7단계 gate, primary 판정, §7.3 처분 기록
- #119: 종료 gate 뒤 §8.3 절차로 merge, 또는 경로가 바뀌면 되돌림·close 기록
- #115: #119 처분 뒤 계획과 실제 구현 기록이 맞는지 확인하고 merge 또는 흡수·close 기록. K1·P10 하네스는 #115 이후 추가된 변경이므로 승인 기록을 연결한다
- 이 계획 PR은 P10의 계획 단계 산출물이다. 제출·merge만으로 P10 완료로 세지 않는다
- N34 격리 검증은 P08 최종 제품 통합 검증(최종 번들·runtime·결합 audit)을 대신하지 않는다

### 8.3 main 순차 통합과 결합 후보 (DQ1 결정됨, 품질 계획 §5.1)
1. 기준 main head와 승인된 #119 head SHA를 요청서에 고정한다
2. Orca CLI가 관리하는 별도 후보 공간(공유 branch·main 아님, 사용자 checkout 밖)에서 정해진 순서로 결합하고 충돌 해결 diff를 기록한다
3. 후보 SHA에서 전체 gate, 결합 lock·audit, 교차 계약 검사를 실행한다
4. 사용자 Ready·merge 승인 뒤 head 고정 merge(`--match-head-commit`). 반영 뒤 main tree와 후보 tree를 비교하고, 다르면 차이를 기록하고 반영 head에서 다시 검증한다
5. 기준 main·PR head·후보 SHA·반영 head 관계를 표로 남긴다
- **BASE 고정과 main 이동:** DQ1 순서는 #119를 종료 gate 뒤에 둔다. 그 전에 다른 PR이 main에 들어오면 main ≠ `5d668f9`이다
  - prereg 시점에 `git diff 5d668f9 origin/main -- src package.json package-lock.json`이 0줄이면 BASE `5d668f9`로 진행한다
  - 0줄이 아니면 실행하지 않고 사용자에게 돌아간다. 특히 #113(S10 저장소 상한)은 O2가 쓰는 `MemoryArtifactStore` 경로를 바꿀 수 있다
  - run 뒤 merge 전에 main이 바뀌면 성능 근거의 범위는 "K1 대 `5d668f9`"다. 바뀐 파일이 O1·O2 경로(`policy.ts`, `artifacts.ts`, 저장소·요약 경로)에 닿으면 근거 적용 범위를 사용자가 다시 정한다
- 지금은 결합·cherry-pick·merge·Ready를 하지 않는다

### 8.4 미래 검사 목록 (지금 만들거나 실행하지 않음)
| 범주 | 현재 코드로 확인되는 것(K1 runner·D1 runner) | 구현할 검사(각 경우의 행·블록·exit·처분 기대값 포함) |
|---|---|---|
| 행·매핑 | 18행 고유·순서, run3 G-C 매핑 거부 음성 대조 | 필수 행 = run3 G-C 매핑(F1→F4 등) 양성, same-input 치환 음성. 정보용 = `ref = cand` 양성, F4 치환 음성 |
| snapshot | src numstat·`policy.js`만 다름·lockfile 동일 | BASE `5d668f9`, numstat `21 3`, 제품 코드 = `4999c1f` |
| 순서 | 홀짝 15/15, 전이 12종 각 10, self 0, 음성 control 2종 | 같은 검사 재사용 |
| 원자료 | timing·memory `applyRawCheck` 양성·음성, `output_mismatch`·`invalid_samples`의 파생 필드 부재 허용, exit code 경로 | §6.4 단계 표의 각 단계 양성(없어도 되는 필드 부재 허용). 도달 단계 필수 항목 제거 → `rawViolations` 기록, V만 I(raw), C·X·I(aa)·I(run) 판정 유지. 보정 실패·시도 없음·C·I(aa)에서 `selectedAttempt` 없음. 정보용 정상 raw만으로 median·p95·A/A·비율 독립 재계산 |
| R1 처분 | `blockStatus`, memory 우선순위, `refFailedRows` | 정보용(F1 V/V 기준): 비-F1 X → `completed_informational`·0·D-0. 비-F1 I(aa) → `completed_informational`·0·D-0. 비-F1 I(run)·I(raw)·N 각각 → `error`·1·D-2. 비-F1 C → `completed_informational`·0·D-4. F1 C → D-4. F1 I(aa) + 나머지 V → `completed_informational`·0·D-2. 환경 변화 → `error`·1·D-4. 임시 폴더 정리 실패 → `error`·1·D-2. memory: `ref_failed` 단독 → 행 `ref_failed`, 블록 invalid·5, `refFailedRows` = [그 행], D-3. `ref_failed` + failed_gate → failed_gate·4, `refFailedRows` 유지, D-3. `ref_failed` + failed_correctness → failed_correctness·3, D-3. 앞 행 failed_gate·failed_correctness 뒤 예산 notRun → 4·3 유지, D-3. 실패 없이 예산 notRun → invalid·5, D-3. 부모 중단 → `incomplete`, 필수면 D-3, 정보용이면 블록 비수용·D-2 |
| R2 예산 | D1: 마감 시각·`min(상한, 남은 예산)`·child 시작 조건(가짜 시계 검사) | 가짜 시계로 경계 확인: 행 시작 remainingWork = Tcal + Tatt 양성, 1 ms 부족 → `notRun(budget)`. 시도·memory child 진입 경계. 재시도 직전 Tcool + Tatt 부족 → `budget_before_retry`. 명령 timeout = min(Tcmd, remainingWork). 마무리 timeout은 remainingTotal(R 중복 차감 없음). Tatt를 선택 프로토콜(P-1 1,800 s, P-2 7,200 s) prereg 값에서 읽음. `capOverrunMs` > 0 → pass·`completed_informational`만 error, `workOverrunMs`·`finalizationOverReserveMs`만 > 0 → 기록만. snapshot 예산 부족 → `build_incomplete`·invalid·5. 부모 중단 파일 `incomplete`. 소유 PID만 종료(다른 pid·시작 시각 불일치 거부) |
| R3 신원 | 덮어쓰기 거부, dirty 거부 | 정상: 앞 블록 결과 파일 `A` 한 줄 raw commit 1개 뒤 시작 허용. 거부: 앞 블록 raw 수정(M)·삭제(D)·rename(R), 다른 run 결과 파일 추가, raw commit 외 commit 추가(문서·하네스·제품), `--output` 이름이 run ID 도출 이름과 다름, 다른 run·prereg·하네스·제품 tree·snapshot·입력·protocol·환경 블록 혼입 |
| 진입 | 덮어쓰기 거부, memory는 timing pass 뒤, dirty 거부, prereg = 마지막 하네스 commit | 정보용은 timing·memory pass와 신원 일치 뒤 |
| 실패 주입 | 비정상 종료·출력 없음·2줄·잘못된 JSON·오류 상태·모의/실제 OOM·timeout·spawn 실패 | 같은 주입 + 작은 운영 예산 C, 정보용 child 실패 → 행 I(run)·블록 `error`·D-2 |
| P-2 선택 시 | 보정 정지 조건 | 실효 K = max(4, 보정 K) 경계(보정 1·4·8, maxK 초과), 시각 K+1개, 판정값 = 끝 − 시작, 단조 증가 |

## 9. 권고의 근거·반대 근거·선택이 바뀔 조건
- **P-1을 권장하는 이유(primary N1 검토를 받아들임)**
  - 승인된 N34 gate가 묻는 것은 공개 호출 1회의 시간이다. 사용자는 artifact마다 `classifyContext`·`indexArtifact`를 한 번 부른다. 그래서 호출 1회 median·p95가 목적에 맞는 추정 대상이다
  - P-2의 이점으로 든 것은 A/A 안정성뿐이었다. 묶음 합(처리량)을 물어야 할 제품상의 이유는 찾지 못했다. 산술 3.7–4.8%도 효과 증거가 아니다
  - 질문을 바꿔 통과 가능성을 높이는 것보다, 승인된 질문을 한 번 정직하게 재는 편이 기존 결과(run1–run3)와 비교할 수 있다
- **반대 근거(P-1을 약하게 만드는 사실)**
  - 같은 K1 CAND 코드에서 O2/F3 CAND A/A가 3/3 무효였다(O-3). run3 O2/F3도 경계값이었다(O-5). P-1은 A/A 불안정에 대응하지 않는다
  - 그래서 P-1은 약 5.7 h(과거 실측 합) 뒤 INVALID로 끝나 B 기본으로 돌아갈 가능성이 작지 않다. 확률은 추정하지 않았다
  - P03 §5는 primary가 "O2 A/A 대응이 설득력 없음"으로 판정하면 B로 바뀐다고 적었다. P-1은 그 대응을 하지 않는다는 점을 숨기지 않는다
- **선택이 바뀌는 조건**
  - 사용자가 묶음 처리량을 제품 질문으로 명시하고, 호출 1회 꼬리 보장을 포기하며, 과거 run과 비교할 수 없음을 받아들임 → P-2(별도 정책 승인)
  - INVALID 위험을 줄이는 것이 시간보다 중요하고 별도 설계·검토를 기다릴 수 있음 → P-3 또는 다른 측정 설계(별도 계획)
  - 추가 측정 없이 끝내려 함 → B(별도 철회·위험 수용 계획과 승인)
  - 사용자가 비울 수 있는 운영 창이 P-1 운영 예산 C(합계 15 h) + 블록마다 30분보다 짧음 → C 조정 또는 B

## 10. 사용자 결정 (2026-11-17 채택 기록)
| ID | 결정 | 이 문서에서 바로 채택 가능한 선택지 | 별도 설계·승인이 필요한 경로 | 권장 초안 | 상태 |
|---|---|---|---|---|---|
| U1 | 프로토콜 | P-1, P-2(추정 대상 변경 정책 승인과 함께) | P-3, K 하한 8, 다른 측정 설계, B 철회 | P-1 | **채택(2026-11-17): P-1** |
| U2 = S-2 | F1 same-input 지위·위험 수준 | S2-a 정보용 + §7.3 처분표(선택적 사전 수용 상한) | S2-b 필수 기준 신설(정책 변경) | S2-a | **채택(2026-11-17): S2-a, 사전 위험 수용 없음** |
| U3 = S-3 | 시간·시도 예산 | P-1: 블록 운영 예산 C 10 h / 1 h / 4 h(운영·수용 상한, hard wall 아님), R 10분(C 안), 운영 창 C + 30분, A/A 최대 3시도 유지 | 3시도 규칙 변경(정책), hard wall watchdog(별도 설계) | 제안값 | **채택(2026-11-17): 제안값** |
| U4 | 후속 구현 범위·위치 | #119 branch에 runner 사본·prereg 추가(K1·D1 선례) | 새 PR(별도 결정) | #119, 제품 코드 변경 없음 | **채택(2026-11-17): #119, 제품 `4999c1f` 유지** |
| DQ1 | 통합 방식 | main 순차 통합 | — | — | **결정됨(2026-11-17)** |
| — | 구현 실행, 측정 1회 실행, Ready, merge | — | — | — | 구현·synthetic 검증 승인(2026-11-17, PR #119). 측정 1회 실행·Ready·merge는 각각 별도 승인 |

## 11. 한계
- 모든 성능 근거는 한 PC(i9-12900F), Node v24.18.0, 고정 corpus다. 좋은 결과도 그 범위의 관찰이며 일반 성능 보장이 아니다
- §3의 백분율은 기존 보고값으로 한 산술이며 확률이나 효과 추정이 아니다. 새 통계·시뮬레이션은 만들지 않았다
- O2 두 무리의 원인은 미확인이다(GC 가설 포함). 권장 P-1은 그 원인에 대응하지 않는다
- §6의 예산 집행·신원·원자료 보강은 D1 runner의 선례와 K1 runner 검사를 근거로 한 설계이며, N34 성능 runner에서는 구현·검증 전이다
- 운영 예산 C는 동기 파일 작업·OS 지연을 끊지 않으므로 hard wall이 아니다. 넘으면 비PASS로 처리하는 수용 상한이다(§6.1)

[plan]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/32e2ba6830ebf4cbb6800b22f52948171793349c/docs/plans/2026-11-16-quality-completion.md
[p03]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/cfd4e30971e5c784ccca22b77b7e09bee0dc75bc/docs/plans/2026-11-16-n34-k1-decision.md
[c-4999]: https://github.com/kimcheolhui9846/token-context-optimizer/commit/4999c1f14b229d8c856200d49fdacd2d4611dc81
[c-7e73]: https://github.com/kimcheolhui9846/token-context-optimizer/commit/7e732e0e07a1977dbf0c754319fd3a726924621e
[c-fd93]: https://github.com/kimcheolhui9846/token-context-optimizer/commit/fd93c543114fc80a111533cb64ef99e13a282932
[prereg1]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/docs/agent/handoffs/n34-cr-line-policy-prereg.md
[prereg2]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/docs/agent/handoffs/n34-cr-line-policy-prereg-run2.md
[prereg3]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/docs/agent/handoffs/n34-cr-line-policy-prereg-run3.md
[k1-prereg]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/docs/agent/handoffs/n34-k1-prereg.md
[d1]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/docs/agent/handoffs/n34-k1-d1-result.md
[d1-amend]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/docs/agent/handoffs/n34-k1-diag-prereg-amendment-1.md
[d1-budget]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-diag.mjs#L282-L331
[r3t]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-cr-policy/perf-run3-timing.json
[r3m]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-cr-policy/perf-run3-memory.json
[r3i]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-cr-policy/perf-run3-info.json
[k1t]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-k1/perf-k1run1-timing.json
[inputs-f1]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf-inputs.mjs#L41
[info-rows]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf.mjs#L524
[info-gate]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf.mjs#L473-L478
[info-save]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf.mjs#L528
[r3-digest]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf.mjs#L348-L350
[k1-rows]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf-rows.mjs#L11
[k1-raw]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L204-L209
[k1-rawv]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L178-L193
[k1-block]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L159-L168
[k1-memout]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L215-L219
[k1-mem]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L144-L158
[k1-build]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L442-L467
[k1-final]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L678-L693
