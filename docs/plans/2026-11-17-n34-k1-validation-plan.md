# N34 K1 공식 검증·F1 위험 판정 계획 초안 (P10 계획 단계, 2026-11-17)

- 상태: **사용자 검토용 제안 초안.** 채택·구현·사전검증·측정·F1 기준 변경·위험 수용·Ready·merge는 모두 미승인이다
  - 사용자 A(2026-11-16)로 승인된 것은 경로 확정(K1 유지)과 이 계획의 준비까지다. D1의 1회 승인은 P02에서 소진됐다
  - DQ1(2026-11-17)은 main 순차 통합으로 결정됐다. merge 승인이 아니다
- 이 문서는 새 측정·진단·시뮬레이션 없이 기존 원자료 필드와 검토된 문서 값만 인용한다. 표의 "구현 예정"은 현재 runner에 없는 기능이다
- 작성: Claude Code(`claude-opus-5-5`). 작성자 자기 검증은 독립 검토가 아니며, 최종 판정은 primary가 한다
- Task handoff: [p10-k1-validation-plan.md](../agent/handoffs/p10-k1-validation-plan.md). 상위: [P03 결정 자료][p03], [품질 계획 P10·§5.1·§7][plan]

## 0. 요약
- 질문: K1 제품 코드를 main과 직접 비교하는 공식 run 1회를 **어떤 프로토콜로** 하고, 같은 입력 F1 결과를 **어떻게 처분할지** 실행 전에 정한다
- 대안(§3): P-1 run3 프로토콜 그대로, **P-2 고정 묶음 표본(K 하한 4)**, P-3 child 단위 반복
- 권장 초안: **P-2.** O2 A/A 무효의 관측 구조(사본 median이 두 무리 사이를 오감)에 직접 대응하는 가장 작은 변경이다
  - 다만 추정 대상이 "호출 1회 시간"에서 "같은 사본 4연속 호출 합"으로 바뀐다. **별도 정책 승인 대상이다**(§4)
  - 효과는 미검증이다. 파일럿을 하지 않으므로 첫 증거가 공식 run 자체다(§9 반대 근거)
- 세 판정을 분리한다(§2): (1) A/A 측정 유효성 (2) 공식 필수 timing·memory (3) same-input F1 위험 처분
- S-2 권장(§7): F1 same-input은 **정보용 유지 + 실행 전 승인된 처분표**. 필수 기준 신설은 대안으로만 비교한다
- 실행 권한 제안: 공식 run 1회(timing → memory → info 각 1회 호출). 사전등록 A/A 재시도 외 재실행 없음

## 1. 근거 고정
| 대상 | 값 | 비고 |
|---|---|---|
| main | `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3` | 이 Task base, run3 BASE |
| K1 제품 후보 | [`4999c1f`][c-4999] | K1 run1 CAND. main 대비 `policy.ts` +21/−3, `bin` +17/−3(numstat 직접 확인) |
| pre-K1 | [`7e732e0`][c-7e73] | run3 CAND 코드와 같음(P03 §1) |
| PR #119 head | [`fd93c54`][c-fd93] | `4999c1f..fd93c54`의 `src`·`bin`·`package.json`·`package-lock.json` diff 0줄(직접 확인). 그 사이 22 commit은 문서·측정 도구·raw다 |
| PR #121 / #122 | [`32e2ba6`][plan] / [`cfd4e30`][p03] | 품질 계획 / P03 결정 |
| 기존 protocol | [run1][prereg1] ← [run2][prereg2] ← [run3][prereg3], [K1 증분][k1-prereg] | run3는 run2·run1 조항을 상속한다 |

- **제품 코드 후보와 측정 도구를 구분한다.** 이 계획의 CAND는 `4999c1f` 제품 코드(`src`·`package*`)다. P10 runner·worker·prereg는 그 위에 더하는 측정 도구 commit이며 제품 코드를 바꾸지 않는다
- 측정 대상은 기존과 같이 각 snapshot의 `tsc` 산출 `dist`다. 배포 `bin` 번들은 성능 run이 아니라 7단계 gate로 확인한다

### 1.1 이 계획이 기대는 관측 사실 (P03 F-번호와 같은 자료)
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

- 해석 경계(유지): K1 timing INVALID·memory NOT RUN·F1 미해결. run3 PASS와 O-2 비율은 **pre-K1 대 main**의 기존 결과이며 K1에 승계하지 않는다. D1은 원인 확정·유의성·GC 중립성·공식 PASS·memory 대체의 근거가 아니다. K1 증분 prereg §6의 0.95/1.05 구간은 서술용 분류값이며 통계적 동등성이나 main 대비 F1 허용 기준이 아니다

## 2. 세 판정의 분리
| 판정 | 정의 | 범위 | 결과값 |
|---|---|---|---|
| J1 A/A 측정 유효성 | 행·시도마다 B2/B1, C2/C1이 각각 median 비 0.95–1.05(또는 차 ≤ 0.1 ms)이고 p95 차의 절댓값 ≤ max(0.2 ms, 참조 p95 × 0.20) | 필수 timing 행: 최대 3시도. 정보용 행: 1시도 | 유효 / 무효. 필수 행 3회째 무효 = 행 INVALID |
| J2 공식 필수 성능 | timing 18행 모두 pass **그리고** memory 18행 모두 pass | G-R 5입력 + G-C 4입력 × O1·O2 | PASS / failed_gate / failed_correctness / INVALID(+ memory `ref_failed`) |
| J3 F1 same-input 처분 | J2 PASS 뒤 정보용 블록의 O1/F1·O2/F1 same-input 결과를 실행 전 승인된 표(§7.2)로 처분 | 정보용 8행 중 F1 2행. 나머지 6행은 기록만 | 처분 D-0 / D-1 / D-2 / D-3 |

- J1은 J2·J3의 전제다. J1 무효 행의 비율은 기록하되 해석하지 않는다
- J3의 정보용 결과는 J2를 뒤집지 않는다. 위험을 자동으로 수용하지도 않는다

### 2.1 F1 입력 매핑 (main을 BASE 코드로 쓰는 것 ≠ 같은 입력 비교)
| 비교 | CAND 사본 C1·C2 | BASE 사본 B1·B2 | 지위 | 기존 명세 |
|---|---|---|---|---|
| 공식 G-C F1 | K1 코드, 입력 F1(CR 10 MiB) | main 코드, 입력 **F4**(LF 10 MiB) | 필수 gate | [`perf-inputs.mjs` L41][inputs-f1] `{ id: 'F1', cand: 'F1', ref: 'F4', gate: 'G-C' }`, [run1 prereg][prereg1] G-C 정의 |
| same-input F1 | K1 코드, 입력 F1 | main 코드, 입력 **F1** | 정보용(현행) | [run3 runner L524][info-rows] `ref: r.cand`, key `…:same-input` |
| (참고) K1 run1 F1 | K1 코드, F1 | pre-K1 코드, F1 | 증분 run, P10 아님 | [`n34-k1-perf-rows.mjs` L11][k1-rows] `cand: id, ref: id` |

- 공식 PASS는 F1에 대해 "K1이 CR을 나누는 비용이 main의 LF 처리 비용 대비 한계 안"만 보장한다. main은 단독 CR을 줄로 나누지 않으므로, same-input F1은 서로 다른 작업량의 비교다
- 현행 정보용 블록은 같은 run 이름의 timing·memory가 모두 pass한 뒤에만 실행된다([run3 runner L473–L478][info-gate]). 정보용 판정 표기는 필수와 같은 수치를 쓰되 1시도·재시도 없음이다

## 3. 대안 비교 (같은 축)
| 축 | P-1 run3 그대로 | **P-2 고정 묶음 표본(권장 초안)** | P-3 child 단위 반복 |
|---|---|---|---|
| 보존 | 입력·행·순서·사본·교대·K 보정·n·순위·A/A·임계·재시도·memory·정보용 전부 | P-1과 같음. 단 표본 정의만 바뀜 | 입력·행·사본·교대(child 내부)·memory |
| 변경 | BASE=main, CAND=K1 고정, 새 run 이름·결과 폴더, 운영 상한(§6) | P-1 + **K = max(4, 보정 K)**, attempt child timeout 1,800 → 7,200 s, 묶음 안 호출별 시각 기록(정보용) | 행마다 사전등록 child 5개를 모두 실행(재시도 아님), 행 판정 = child별 C1/B1 median 비의 중앙값, A/A도 child 간 집계로 재정의 |
| 관측 근거 | O-1(run3 PASS), O-6 | O-4·O-7: 무효의 모양이 "사본 median이 약 350 ms 떨어진 두 무리 중 어느 쪽에 놓이느냐"와 일치 | 반복 단위를 프로세스로 두는 일반 원칙 |
| 가설(미확인) | 이번에는 두 무리 비율이 경계에서 벗어날 수 있다 | 무리 배정이 호출 단위로 섞이면 묶음 합에서 한 호출 차이는 약 Δ/(K·T)로 줄어든다. 산술: Δ 345–389 ms, T 2.05–2.35 s, K=4 → 약 3.7–4.8%(A/A 한계 5% 안이지만 여유가 작다) | child 간 변동이 child 안 무리 효과보다 작다 |
| 호환성·정책 | 기존 정책 안. **논리적으로 run3와 같은 판정** | 추정 대상 변경 → **별도 정책 승인 필요**. A/A 수치는 같지만 같은 판정이 아니다(§4) | A/A·판정 집계·반복 단위 변경 → **큰 정책 변경** |
| 반복 단위 / 추정 대상 | child 1개 안 교대 조건의 호출 1회 wall time, 사본별 nearest-rank median·p95. 표본 간 독립을 가정하지 않는다 | child 1개 안 교대 조건의 **4연속 호출 합**, 사본별 median·p95 | child 5개 각각의 median 비, 그 중앙값 |
| 회귀·자원 위험 | K1 run1과 같은 CAND 코드에서 O2/F3 A/A가 3/3 무효였다(O-3) | 시간 약 4배. per-call 꼬리(p95) 감지력이 약해진다. 효과 미검증 | 시간 약 5배, child 간 집계 규칙 신설 |
| 필요한 증거 | 새 runner 사본(BASE·CAND·info 블록), check-only·self-check | P-1 + K 하한·호출 시각·timeout 검사 | P-1 + 집계·A/A 재정의 검사, 새 정책 문서 |
| 실패·무효 시 | 중단, 사용자 재결정(B 기본, P03 §6.1) | 같음 | 같음 |
| 기존 시간 참고 | run3 timing 3.8 h + memory 5 min + info 1.8 h(O-1, 과거 실측) | 검증된 소요 없음(§6 추정) | 검증된 소요 없음 |

- 검토 후 제외한 변경
  - 표본 수 증가·홀수화만: rank median이 두 무리 사이를 오가는 구조(O-7)는 n을 바꿔도 남는다. 해결로 주장하지 않는다
  - 표본 전 강제 GC: D1에서 heap 상태와 간격을 함께 바꿨다(O-8). 중립적 수정이 아니다
  - BASE·CAND를 서로 다른 프로세스로 분리: 같은 프로세스 교대 원칙과 충돌하고 startup·cache·GC 조건이 arm마다 달라진다. 자동으로 유효해지지 않는다
  - O2 행에만 K 하한 적용: 비용은 줄지만 행마다 추정 대상이 달라진다. 균일 적용을 기본으로 둔다

## 4. 기존 프로토콜 대 권장 변경 (P-2)
| 요소 | 기존(run3, 상속 포함) | P-2 제안 | 논리적 동등성 | 정책 변경 | 추정 대상 변화 |
|---|---|---|---|---|---|
| BASE / CAND | main `5d668f9` / 측정 HEAD(pre-K1) | main `5d668f9` / 측정 HEAD(제품 코드 = `4999c1f`) | 코드만 바뀜(K1 run1과 다른 BASE) | 아니오(A 선택 범위) | 아니오 |
| 입력·행·순서 | 9입력, 18행, O1 → O2 | 같음 | 같음 | 아니오 | 아니오 |
| correctness digest | 시간 밖, 사본 4개 공개 view 동일 | 같음 | 같음 | 아니오 | 아니오 |
| child·사본 수명 | 시도마다 fresh hidden child 1개, 사본 4개 import | 같음 | 같음 | 아니오 | 아니오 |
| 교대 순서 | `ABCDBDCADACB` / `ADACDBDCBABC` 교대, warmup 2 + 측정 10 순환 | 같음 | 같음 | 아니오 | 아니오 |
| K | 최솟값 ≥ 50 ms인 최소 K(관측 K=1) | **K = max(4, 보정 K)**, maxK 1024 | **다름** | **예** | **예**: 호출 1회 → 4연속 합 |
| 표본 수·순위 | 사본당 30, median=`sorted[14]`, p95=`sorted[28]` | 같음(대상은 묶음 합) | 형식 같음, 대상 다름 | 예(위와 묶임) | 예 |
| 타이머 경계 | 묶음 전후 `performance.now()` | 같음 + 묶음 안 호출 경계 시각 K−1개 기록(정보용, 구현 예정) | 판정값 정의는 같음. 측정 구간 안 호출이 K−1개 늘어난다 | 아니오 | 아니오 |
| A/A 기준 | 0.95–1.05 또는 ≤ 0.1 ms, p95 max(0.2 ms, ×0.20) | 수치 같음 | **같은 판정 아님**: 호출 단위 안정성은 더 이상 검사하지 않는다 | 예 | 예 |
| 시도·cooldown | 최대 3, 30 s, 3회째 무효 = INVALID 중단 | 같음 | 같음 | 아니오 | 아니오 |
| 성능 임계 | median ≤ max(×1.10, +0.5 ms), p95 ≤ max(×1.20, +1 ms) | 수치 같음 | 같은 수치, 다른 대상 | 예(위와 묶임) | 예 |
| child timeout | 보정·시도 1,800 s | 보정 1,800 s, **시도 7,200 s** | 상한만 바뀜 | 운영값(S-3) | 아니오 |
| memory | 108 child, `--expose-gc`만, 600 s | 같음 | 같음 | 아니오 | 아니오 |
| 정보용 | 필수 두 블록 pass 뒤, G-C 4입력 same-input × O1·O2, 1시도 | 같음 + K 규칙 동일 적용, raw 완전성 검사 추가(구현 예정) | 측정 같음, 기록 강화 | 아니오 | K 규칙만 |
| 원자료 완전성 | K1 runner `applyRawCheck`(timing·memory만) | timing·memory·정보용 모두 | 기록 강화 | 아니오 | 아니오 |
| 운영 상한 | child timeout만, 블록 전체 상한 없음 | 블록 상한·잔류 프로세스 검사(§6, 구현 예정) | 측정 같음 | 운영값(S-3) | 아니오 |

- 요약: P-2는 "K 하한 4" 하나로 표본 정의를 바꾼다. 같은 A/A·임계 수치를 쓰지만 **대상 양이 바뀌므로 기존 판정과 같은 판정이라고 하지 않는다.** 이 점을 승인받지 못하면 P-1이 정책 범위 안의 대안이다

## 5. 권장 초안 P-2의 실행 절차 (수치 고정 제안)
### 5.1 tree·환경
- BASE: `git archive 5d668f9` → 임시 폴더 → `npm ci --ignore-scripts` → `tsc`(기존 방법)
- CAND: 측정 HEAD. `git diff --numstat 5d668f9 HEAD -- src` = `21 3 src/core/policy.ts`, `dist/src/core`에서 다른 파일은 `policy.js`뿐, lockfile 동일. 다르면 실행 거부(기존 검사 형식, 기대값만 새로)
- 측정 HEAD의 제품 코드(`src`·`package*`)는 `4999c1f`와 같아야 한다. `git diff 4999c1f HEAD -- src package.json package-lock.json` 0줄을 runner가 확인한다(구현 예정)
- main이 그사이 바뀐 경우: §8.3. BASE를 조용히 바꾸지 않는다
- 환경: Windows, Node `v24.18.0`, 같은 PC. Node·V8·OS·CPU·전원 계획 GUID를 블록 시작·끝에 기록하고 같아야 한다(기존). 블록 사이 값도 같아야 다음 블록을 시작한다(구현 예정)

### 5.2 블록과 순서
| 블록 | 단위 | 수 | 진입 조건 |
|---|---|---|---|
| timing(필수) | 행마다 보정 child 1 + 시도 child ≤ 3 | 18행 | 사용자 1회 실행 승인, prereg 동결, primary preflight PASS |
| memory(필수) | child 1개 = (행, arm, 반복) | 108 | 같은 run의 timing `pass`(18행 모두 pass) |
| 정보용 | 행마다 보정 child 1 + 시도 child 1 | 8행 | 같은 run의 timing·memory 모두 `pass` |

- 순서: timing → memory → 정보용. 첫 비PASS 행에서 timing을 멈춘다(기존). 블록마다 raw를 바로 commit한다
- 결과 파일(구현 예정 이름): `research/results/n34-p10/perf-p10run1-{timing,memory,info}.json`. 덮어쓰기 거부(기존)

### 5.3 시도 child 안 (timing·정보용 공통)
1. 사본 4개(B1·B2 = BASE dist, C1·C2 = CAND dist 바이트 복사) import
2. 입력 생성(G-C 필수 행은 C에 X, B에 LF(X)), O2는 시간 밖에서 파일 쓰기
3. 사본마다 공개 view digest 1회. 4개가 다르면 `failed_correctness`
4. 144표본(warmup 24 + 측정 120). 표본 하나 = 같은 사본 K회 연속 호출, K = max(4, 보정 K)
5. 사본당 측정 30개로 median·p95 → A/A → gate. 무효면 30 s 뒤 새 child(최대 3)

### 5.4 판정
- J1·J2 수치는 §4 표의 "같음" 항목 그대로다. CAND=C1, REF=B1 고정
- memory 행 분류 우선순위(기존): 실행 수 부족·spawn/parse → INVALID → REF 자원 실패 → `ref_failed`(판정 불가, 새 사용자 결정) → REF 기타 → INVALID → CAND OOM·timeout·RangeError → `failed_gate` → CAND 기타 → INVALID → digest 불일치 → `failed_correctness` → 임계
- 블록 상태(기존): 18행이 정확히 한 번씩 모두 pass일 때만 `pass`. 아니면 failed_correctness > failed_gate > invalid

## 6. 자원 상한·중단·원자료
### 6.1 구성값 기반 최대 예산 (측정 결과 아님)
| 블록 | child 상한 | 구성상 최대(블록 상한 없을 때) | 제안 블록 상한(S-3, 구현 예정) | 점 추정(검증 안 됨) |
|---|---|---|---|---|
| P-1 timing | 보정 1,800 s + 시도 3 × 1,800 s + cooldown 2 × 30 s = 7,260 s/행 | 18행 × 7,260 s = 36.3 h | 8 h | run3 실측 3.8 h(O-1) |
| P-2 timing | 1,800 + 3 × 7,200 + 60 = 23,460 s/행 | 117.3 h | **24 h** | run3 시도 시간 × 4로 약 15 h. 재시도 행마다 그 행 시간이 더해진다 |
| memory(공통) | 600 s × 108 | 18 h | **2 h** | run3 실측 약 5 min |
| P-1 정보용 | (1,800 + 1,800) × 8 | 8 h | 4 h | run3 실측 1.8 h |
| P-2 정보용 | (1,800 + 7,200) × 8 | 20 h | **10 h** | 약 7 h |
| snapshot 빌드 | 기존 runner 명령별 600 s timeout | 블록마다 | 블록 상한에 포함 | 수 분(K1 prereg §7) |

- P-2 블록 상한 합계 36 h가 계획상 최대 PC 독점 시간이다. 점 추정 합계는 약 22 h다. 둘 다 과거 프로토콜(K=1) 값에서 계산한 것이며 P-2의 검증된 소요 시간이 아니다
- 블록 사이에는 PC를 다른 용도로 써도 된다. 다음 블록 시작 전 환경 지문 동일을 확인한다(§5.1)
- 블록 상한 초과(구현 예정): 진행 중 child 트리를 `taskkill /T /F`로 끝내고, 그 행을 `invalid`(사유 `block_wall_cap`)로 기록하고, raw를 저장하고 exit 5로 끝낸다. 남은 행은 notRun이다

### 6.2 실행 권한과 시도 규칙
- 권장 권한: 공식 run 1회 = timing 1회 호출, (pass이면) memory 1회, (둘 다 pass이면) 정보용 1회
- 허용되는 반복은 필수 timing 행의 사전등록 A/A 재시도(최대 3시도, 30 s)뿐이다. 이 규칙을 바꾸려면 별도 정책 결정이다
- 금지: 유효 FAIL 재실행, 여러 run 중 최선 선택, 무효 뒤 임의 재개·이어 붙이기, 다른 run과 표본 합산·비율 곱, GC 시간 제외, 사후 임계 완화·필수→정보용 강등, heap 증액
- 정보용 행은 1시도다. A/A 무효여도 재시도하지 않는다

### 6.3 실패 상태와 우선순위
| 상황 | 기록 | 블록 결과 | 출처 |
|---|---|---|---|
| child timeout·spawn_error·oom·abnormal_exit·parse_error·child_error(timing) | 행 `invalid`, child 기록 유지 | INVALID, exit 5 | 기존 `timingChildVerdict` [L136–L139][k1-verdict] |
| digest 불일치 | 행 `failed_correctness` | exit 3 | 기존 |
| A/A 3회째 무효 | 행 `invalid` | exit 5 | 기존 [timingRow][k1-row] |
| 유효 gate 초과 | 행 `failed_gate`, 재시도 없음 | exit 4 | 기존 |
| 원자료 누락 | pass였던 행만 `invalid`(`statusBeforeRaw: pass`), 다른 판정은 상태·사유 유지 | exit 5 또는 기존 코드 | 기존 [applyRawCheck][k1-raw]. 정보용 적용은 구현 예정 |
| 블록 상한 초과 | 행 `invalid`(`block_wall_cap`) | exit 5 | 구현 예정 |
| 부모 중단(전원·사용자·크래시) | 행마다 저장된 파일이 `status: incomplete`로 남음 | INVALID(중단). 재개 없음, 같은 이름 재사용 거부 | 저장 방식은 기존, 처분은 이 계획 |
| 마무리 실패(환경 변화·추적 파일 변경·임시 폴더 정리) | pass였으면 `error`, `finalizationErrors` | 공식 PASS 아님 | 기존 `finalize` |
| 잔류 child 프로세스 | pid 목록과 잔류 여부 기록 | pass → INVALID | 구현 예정 |
| 정보용 child 실패 | 행 기록, 블록 `error` | exit 1. F1은 §7.2의 INVALID | 기존 run3 동작 |

- 외부 원인 추정(백신 검사, 업데이트 등)만으로 INVALID·FAIL을 지우거나 재분류하지 않는다

### 6.4 종료 확인과 보존 (실행 시 운영 절차)
- 실행 전: `git status --porcelain` 0줄, 다른 node 프로세스 목록 기록, 동시 부하 금지 확인(npm·benchmark·WBS 재계산·렌더·다른 worker의 무거운 작업)
- 실행 후: 부모 exit code를 그대로 기록, 기록된 child pid가 모두 종료됐는지 `tasklist`로 확인, 임시 폴더 정리·추적 파일 해시 불변 결과(기존 `preservation`·`tempCleanup`) 확인
- raw는 실패·무효·중단 파일을 포함해 바로 commit한다. 작업 사본(CRLF) sha256과 blob 기준을 구분해 적는다
- primary가 저장된 raw만으로 median·p95·A/A·gate·F1 비율을 독립 재계산한다(runner 코드 미사용)

## 7. F1 same-input 처분 (S-2)
### 7.1 정보용 유지 대 필수 기준 신설
| 축 | **S2-a 정보용 유지 + 사전 처분표(권장)** | S2-b same-input F1을 필수 gate로 추가 |
|---|---|---|
| 정책 | 승인된 N34 매핑(P03 F-15, §2.1) 유지. 처분 절차만 새로 승인 | **정책 변경.** G-C 정의(CR 작업 대 LF 작업) 위에 새 필수 행 2개 |
| 기준 | run3 정보용 표기와 같은 수치(median ≤ ×1.10, p95 ≤ ×1.20)를 "정보용 한계"로 기록 | 같은 수치를 필수로 쓰면 main이 하지 않는 CR 분할 작업에 10% 한계를 거는 셈이다. 다른 수치는 근거가 없다 |
| 재시도 | 1시도 | 필수 행이 되면 A/A 3시도 규칙을 받는다 |
| 결과가 나쁠 때 | 공식 PASS 유지, 사용자 명시적 수용 또는 중단·재결정 | 유효 FAIL → 경로 종료(B 기본) |
| 장점 | 기존 승인과 일관, 위험 판단을 사용자에게 명시적으로 남김 | 자동 판정, 해석 여지 적음 |
| 단점 | 사용자 판단이 결과 뒤에 남는다(아래 선택적 사전 수준으로 완화) | pre-K1이 1.64/1.39였던 입력이라 근거 없는 기준으로 K1을 떨어뜨릴 수 있다. 기준을 결과 전에 새로 정해야 한다 |

- 권장: S2-a. 선택적으로 사용자가 실행 **전에** "수용할 수 있는 same-input F1 비의 상한"을 적어 둘 수 있다. 적지 않으면 초과 시 결과를 본 뒤 명시적으로 결정한다. 어느 쪽도 이 문서가 정하지 않는다

### 7.2 결과표 (공식 J2와 F1 정보용의 조합)
- F1 정보 상태(O1·O2 각각): V = A/A 유효이고 정보용 한계 안, X = A/A 유효이고 한계 초과, I = A/A 무효·child 실패·원자료 누락, N = 실행 안 됨
- J2가 PASS가 아니면 정보용 블록은 실행되지 않는다(O1·O2 모두 N) → **D-3**

| J2 PASS일 때 행 O1, 열 O2 | V | X | I | N |
|---|---|---|---|---|
| V | D-0 | D-1 | D-2 | D-2 |
| X | D-1 | D-1 | D-2(+X 기록) | D-2(+X 기록) |
| I | D-2 | D-2(+X 기록) | D-2 | D-2 |
| N | D-2 | D-2(+X 기록) | D-2 | D-2 |

| 처분 | 의미 | 다음 단계 |
|---|---|---|
| D-0 | 측정한 corpus·PC·Node 범위에서 F1 same-input이 정보용 한계 안으로 관찰됨 | 비율과 범위를 기록. 일반 성능 보장이나 "위험 해소"로 쓰지 않는다. P10 완료 조건(§8.2)으로 진행 |
| D-1 | 측정된 초과 | 사용자 명시적 선택: (a) 측정 비율을 적은 위험 수용 (b) 중단·재결정(B 철회 또는 C). 자동 재실행 없음 |
| D-2 | 하나 이상 미확인 | 사용자 명시적 선택: (a) 미확인 범위를 적은 위험 수용. pre-K1 run3 비율은 K1 값이 아니므로 대신 쓰지 않는다 (b) 중단·재결정 (c) 별도 승인을 받은 새 측정(새 prereg·새 run 이름). 어느 것도 자동이 아니다 |
| D-3 | J2 INVALID·FAIL·failed_correctness·ref_failed | 중단. 사용자 재결정, B를 기본 후속으로 올린다(P03 §6.1). 필수 G-C F1 행(CR 대 LF)의 유효 FAIL이면 P03 §5의 C 전환 조건도 함께 올린다 |

- F2·F6·F7 same-input 6행은 기록만 한다. 이 표의 처분 대상이 아니다
- 어떤 칸도 조용히 완료로 처리하지 않는다. D-1·D-2 수용 기록에는 측정 범위, 미측정 범위, 남는 위험을 함께 적는다

## 8. 후속 구현·검증·통합
### 8.1 순서 (각 단계는 별도 승인 경계)
1. 사용자: 이 계획의 프로토콜(U1), S-2(U2), S-3(U3), 구현 범위(U4) 결정. **계획 채택은 실행 승인이 아니다**
2. PM: 구현 요청서(파일·검사·금지 범위) → 사용자 구현 승인
3. Claude: 새 runner·worker 사본(구현 예정 이름 `research/src/n34-p10-perf.mjs`, `n34-p10-perf-worker.mjs`)과 prereg 문서. 기존 run3·K1·D1 하네스·raw는 바꾸지 않는다. 제품 코드 변경 없음
4. RED → GREEN: §8.4 검사를 먼저 실패시키고 통과시킨다
5. 회귀: `--check-only`, `--self-check`(64 KiB 합성, gate 아님), 프로젝트 7단계 gate(build 전후 `git status` 기록)
6. prereg 동결 commit → primary preflight
7. 사용자 1회 실행 승인(S-3 시간 창 포함) → 실행(§5–§6) → raw commit
8. primary 독립 raw 재계산 → J1·J2 판정 → J3 처분(§7.2), 필요하면 사용자 결정
9. §8.3 결합 후보 검증 → Ready·merge 승인 → 반영 뒤 동등성 재검증

### 8.2 P10 완료 조건 (품질 계획 P10 기준 연결)
- J2 PASS, 7단계 gate, primary 판정, §7.2 처분 기록
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
| 범주 | 현재 코드로 확인되는 것(K1 runner) | 구현할 검사 |
|---|---|---|
| 행·매핑 | 18행 고유·순서, run3 G-C 매핑 거부 음성 대조 | 필수 행 = run3 G-C 매핑(F1→F4 등) 양성, same-input 치환 음성. 정보용 = `ref = cand` 양성, F4 치환 음성 |
| snapshot | src numstat·`policy.js`만 다름·lockfile 동일 | BASE `5d668f9`, numstat `21 3`, 제품 코드 = `4999c1f` |
| 순서 | 홀짝 15/15, 전이 12종 각 10, self 0, 음성 control 2종 | 같은 검사 재사용 |
| K | 보정 정지 조건 | K = max(4, 보정 K) 경계: 보정 1·4·8, maxK 초과 |
| 타이머 | — | 호출 경계 시각 K개, 표본 ms = 마지막 − 처음, 단조 증가 |
| 원자료 | timing·memory `applyRawCheck` 양성·음성, exit code 경로 | 정보용 적용, 호출 시각·pid 필드 누락 → pass만 invalid |
| outcome | `exitCodeFor`, `blockStatus`, memory 우선순위 | 블록 상한 초과 → invalid·exit 5·kill·raw 저장, 잔류 pid → invalid, 중단 파일 `incomplete` 처분 |
| 실패 주입 | 비정상 종료·출력 없음·2줄·잘못된 JSON·오류 상태·모의/실제 OOM·timeout·spawn 실패 | 같은 주입 + 작은 블록 상한 주입, 정보용 child 실패 → 블록 error |
| 진입 | 덮어쓰기 거부, memory는 timing pass 뒤, dirty 거부, prereg = 마지막 하네스 commit | 정보용은 timing·memory pass 뒤, 블록 간 환경 지문 동일 |

## 9. 권고의 반대 근거와 선택이 바뀔 조건
- 가장 강한 반대 근거
  - **P-2는 사실상 A/A를 통과하기 쉽게 만든다.** 수치는 같아도 호출 단위의 불안정은 더 이상 무효로 잡히지 않는다. 결과를 본 뒤 측정을 바꾼다는 인상을 줄 수 있다
    - 완화: K1 대 main 데이터는 아직 없다. 변경은 실행 전에 고정하고 모든 행·사본에 대칭으로 적용한다. 그래도 추정 대상 변경임은 숨기지 않는다
  - **효과가 미검증이다.** 산술 여유는 5% 한계에 3.7–4.8%로 작다(§3). 무리 배정이 시간상 묶여 있으면 묶음이 도움이 되지 않을 수 있다. 파일럿을 하지 않으므로 P-2의 약 15–22 h가 다시 INVALID로 끝날 수 있다
  - P-1은 정책 변경이 없고 run3와 직접 같은 판정이다. 시간도 약 4분의 1이다
- 선택이 바뀌는 조건
  - 사용자가 추정 대상 변경을 승인하지 않음 → P-1(높은 INVALID 위험을 알고 진행) 또는 B
  - S-3 시간 창이 P-2 블록 상한(합계 36 h)보다 짧음 → P-1 또는 B
  - 여유를 더 원함 → K 하한 8(산술상 한 호출 차이 약 1.8–2.4%, 시간 약 2배)
  - primary preflight가 P-2의 근거를 설득력 없다고 판정 → P-1 또는 B(P03 §5의 B 전환 조건)
  - 반복 단위를 프로세스로 두는 것이 더 중요하다고 판단 → P-3(큰 정책 변경, 시간 약 5배)

## 10. 사용자 결정 (이 문서는 정하지 않음)
| ID | 결정 | 선택지 | 권장 초안 | 상태 |
|---|---|---|---|---|
| U1 | 프로토콜 선택·채택 | P-1 / P-2(K 4 또는 8) / P-3 / B로 전환 | P-2, K 하한 4, 추정 대상 변경 정책 승인 포함 | 사용자 결정 필요 |
| U2 = S-2 | F1 same-input 지위·위험 수준 | S2-a 정보용 + 처분표(선택적 사전 수용 상한) / S2-b 필수 기준 신설 | S2-a, §7.2 처분표 | 사용자 결정 필요 |
| U3 = S-3 | PC 독점 시간·시도 예산 | §6.1 블록 상한(P-2: 24 h + 2 h + 10 h), A/A 최대 3시도 유지 | 표의 제안값 | 사용자 결정 필요 |
| U4 | 후속 구현 범위·위치 | #119 branch에 runner·worker 사본·prereg 추가(K1·D1 선례) / 새 PR | #119, 제품 코드 변경 없음 | 사용자 결정 필요 |
| DQ1 | 통합 방식 | main 순차 통합 | — | **결정됨(2026-11-17)** |
| — | 구현 실행, 측정 1회 실행, Ready, merge | — | — | 각각 별도 승인 |

## 11. 한계
- 모든 성능 근거는 한 PC(i9-12900F), Node v24.18.0, 고정 corpus다. 좋은 결과도 그 범위의 관찰이며 일반 성능 보장이 아니다
- §3·§9의 백분율은 기존 보고값으로 한 산술이며 확률이나 효과 추정이 아니다. 새 통계·시뮬레이션은 만들지 않았다
- O2 두 무리의 원인은 미확인이다(GC 가설 포함). P-2는 원인을 확정하지 않고 측정 단위로 대응한다

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
[r3t]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-cr-policy/perf-run3-timing.json
[r3m]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-cr-policy/perf-run3-memory.json
[r3i]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-cr-policy/perf-run3-info.json
[k1t]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/results/n34-k1/perf-k1run1-timing.json
[inputs-f1]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf-inputs.mjs#L41
[info-rows]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf.mjs#L524
[info-gate]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-cr-policy-perf.mjs#L473-L478
[k1-rows]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf-rows.mjs#L11
[k1-verdict]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L136-L139
[k1-row]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L479-L523
[k1-raw]: https://github.com/kimcheolhui9846/token-context-optimizer/blob/fd93c543114fc80a111533cb64ef99e13a282932/research/src/n34-k1-perf.mjs#L204-L209
