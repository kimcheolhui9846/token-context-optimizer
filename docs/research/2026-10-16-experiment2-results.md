# 실험 2 held-out 결과: 단일 질의의 영역 선택과 원본 재요청

이 부록은 단일 질의에서 질문에 맞춘 영역 선택과 보수적 원본 재요청이 정확도와 입력 토큰에 미치는 영향을 보고한다. 결과는 36개 family, 네 입력 조건, A–E 다섯 arm과 D′ 탐색 arm으로 구성된 held-out 실행에서 얻었다. 분석 단위는 source family이며, 각 family의 네 조건 평균을 이용한 짝 비교와 family 단위 bootstrap을 사용했다. 모든 수치는 결과 원문에서 그대로 옮겼으며, 이 부록에서 재계산하거나 새로 반올림하지 않았다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):7-17, [E2-1][E2-2][E2-4])

## 실행과 고정 설계

실행일은 2026-10-16이며, held-out 호출 전 하네스와 분석은 `dbf4f6b`에서 동결되었다. 36개 family는 영역당 12개이며, 각 family에는 한 질문과 네 조건(clean, JPEG q50, 1024 축소, 1024 축소+JPEG)이 있다. 계획된 slot은 720개였다. slots와 families의 SHA-256은 각각 축약 표기 `36ae3dec…efba12`, `71e2648f…f006c313`로 기록되어 있다. family 단위 bootstrap은 10,000회, seed 20261016, percentile 95%로 수행되었고 `not_started`와 실패는 0이었다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):3-11, [E2-1]–[E2-4])

GPT-4o 호출은 731회(계획 720회와 재요청 11회), 정가 비용은 `$1.188`이었다. Haiku 호출은 736회(계획 720회와 재요청 16회), 정가 비용은 `$0.641`이었다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):16-17, [E2-5])

arm A는 원본, B는 긴 변 1536과 JPEG q75, C는 질의 인식 선택, D는 C와 같은 입력의 별도 fresh 첫 호출 뒤 판독 불가 응답에 대해 원본을 1회 재요청, E는 정답 영역 crop 진단이다. D′는 개정 전 규칙을 적용한 탐색 arm이다. (출처: [`research/plans/2026-10-16-experiment2-preregistration-draft.md`](../../research/plans/2026-10-16-experiment2-preregistration-draft.md):86-102, [E2-12]–[E2-17])

## 가설 판정

개정 1에서는 Task 34에서 평가 프로토콜의 D 정의와 primary 대비가 바뀌었기 때문에, 개정 전 H1=D−C를 H1(primary)=D−A로 전환했다. held-out 호출 전에는 결과가 0개였고, 개정된 D를 calibration에서 다시 점검했다. 개정 1은 창 없음 처리를 C와 같은 전체 축소 입력으로 고정하고, UNREADABLE 때 배정 variant를 새 호출로 한 번 재요청하며, D의 첫 호출을 C와 별도 fresh 호출로 정의했다. 따라서 H1(primary)은 D−A의 95% 신뢰구간 하한이 −5%p보다 크고 D의 평균 입력 토큰이 A보다 작은 경우 지지한다. H2(D−C)와 H3(C−B)는 기술 통계로만 보고한다. (출처: [`research/plans/2026-10-16-experiment2-preregistration-draft.md`](../../research/plans/2026-10-16-experiment2-preregistration-draft.md):79-104, [E2-7]–[E2-9])

| 가설 | GPT-4o | 판정 | Haiku | 판정 |
|---|---|---|---|---|
| H1(primary), D−A | −6.9%p [−15.3, 0.7], 토큰 635 대 824 | 지지 안 됨 | −4.2%p [−13.2, 3.5], 토큰 765 대 1,361 | 지지 안 됨 |
| H2, D−C | +6.3%p [1.4, 12.5] | 기술 통계 | +9.0%p [2.8, 16.7] | 기술 통계 |
| H3, C−B | −11.8%p [−22.9, −2.1] | 기술 통계 | −13.9%p [−25.0, −3.5] | 기술 통계 |

출처: [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):7-9, [`research/results/exp2-heldout/haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md):7-9, [E2-7]–[E2-9].

GPT-4o와 Haiku 모두 D의 입력 토큰은 A보다 적었지만, H1 정확도 구간의 하한은 사전 등록한 −5%p 기준보다 낮았다. 따라서 두 공급자에서 사전 등록한 비열등 기준을 충족하지 못했다. 이는 비열등성을 입증하지 못했다는 뜻이며, −5%p 이상 열등하다는 입증은 아니다. 두 H1 구간은 모두 0을 포함한다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):28-29, [E2-7][E2-10][E2-11])

## arm별 기술 통계

다음 정확도는 네 조건에 대한 family 평균이며, 비용은 호출당 정가다. D의 평균 입력 토큰과 호출당 비용은 재요청이 발생한 배정 slot에서 실제 두 호출을 포함한 값이다. (출처: [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):15-20, [`research/results/exp2-heldout/haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md):15-20, [E2-12]–[E2-17])

| arm | 의미 | GPT-4o 정확도 | 입력 토큰 | 호출당 비용 | Haiku 정확도 | 입력 토큰 | 호출당 비용 |
|---|---|---:|---:|---:|---:|---:|---:|
| A | 원본 | 85.4% | 824 | $0.00210 | 81.3% | 1,361 | $0.00140 |
| B | 1536 + q75 | 84.0% | 824 | $0.00210 | 81.9% | 1,361 | $0.00140 |
| C | 질의 인식 선택 | 72.2% | 572 | $0.00146 | 68.1% | 621 | $0.00067 |
| D | C + 재요청 1회 | 78.5% | 635 | $0.00162 | 77.1% | 765 | $0.00082 |
| E | 정답 영역(crop 진단) | 89.6% | 374 | $0.00097 | 82.6% | 129 | $0.00016 |
| D′ | 개정 전 규칙(탐색) | 79.2% | 629 | $0.00161 | 76.4% | 765 | $0.00082 |

출처: [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):15-20, [`research/results/exp2-heldout/haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md):15-20, 대조표 [E2-12]–[E2-17].

## 조건별 기술 통계

가설 판정은 네 조건 평균만 사용한다. 아래 조건별 값은 기술 통계다. 각 행의 정확도 순서는 A / C / D다.

| 조건 | GPT-4o A / C / D | GPT-4o D−A | Haiku A / C / D | Haiku D−A |
|---|---|---|---|---|
| clean | 88.9 / 83.3 / 88.9% | +0.0%p [−11.1, 11.1] | 88.9 / 80.6 / 88.9% | +0.0%p [−11.1, 11.1] |
| JPEG q50 | 88.9 / 83.3 / 88.9% | +0.0%p [−11.1, 11.1] | 88.9 / 80.6 / 88.9% | +0.0%p [−11.1, 11.1] |
| 1024 축소 | 91.7 / 63.9 / 75.0% | −16.7%p [−30.6, −5.6] | 75.0 / 58.3 / 69.4% | −5.6%p [−16.7, 5.6] |
| 1024 + JPEG | 72.2 / 58.3 / 61.1% | −11.1%p [−22.2, −2.8] | 72.2 / 52.8 / 61.1% | −11.1%p [−22.2, −2.8] |

출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):47-50, [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):24-27, [`research/results/exp2-heldout/haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md):24-27, 대조표 [E2-18]–[E2-21].

## 재요청 관찰

D의 재요청률은 GPT-4o가 `11/144`, Haiku가 `16/144`였다. 조건별 재요청 수는 각각 GPT-4o `2 / 2 / 4 / 3`, Haiku `3 / 3 / 5 / 5`이며, 순서는 clean / JPEG / 1024 / 1024+JPEG이고 각 조건의 분모는 36이다. 재요청 뒤 정답은 GPT-4o `9/11`, Haiku `13/16`이었다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):59-61, [E2-22][E2-23])

D와 C의 정오가 다른 slot은 GPT-4o 9개, Haiku 13개였고, 모두 D 정답·C 오답이며 재요청 slot이었다. 첫 호출의 UNREADABLE 응답 수(A / C / D)는 GPT-4o `0 / 10 / 11`, Haiku `0 / 16 / 16`이었다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):62-66, [E2-24][E2-25])

C 오답 중 표지 없는 오답은 GPT-4o `30/40`, Haiku `30/46`이었다. 따라서 UNREADABLE 표지가 모든 선택기 오답을 포착했다고 해석하지 않는다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):66, 83, [E2-26])

## 탐색 관찰

D′는 D와 비슷했다. GPT-4o 정확도는 D′ 79.2%, D 78.5%였고, Haiku는 D′ 76.4%, D 77.1%였다. calibration에서 관찰된 GPT-4o D′ 우세는 held-out에서 재현되지 않았다. D′−A는 GPT-4o −6.3%p [−15.3, 0.7], Haiku −4.9%p [−13.2, 2.1]이었고, D′−C는 각각 +6.9%p [0.7, 13.9], +8.3%p [0.7, 16.7]이었다. 이 값들은 탐색 결과이며 가설 판정에 쓰지 않는다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):74-75, [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):11, [`research/results/exp2-heldout/haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md):11, [E2-27][E2-28])

레이아웃별 D−A는 GPT-4o에서 기존 −4.2%p [−11.1, 4.2], v2 −9.7%p [−25.0, 4.2]였고, Haiku에서 기존 +5.6%p [0.0, 13.9], v2 −13.9%p [−29.2, −1.4]였다. 선택기가 창을 찾은 경우 근거를 덮은 비율은 v2 `30/48(62.5%)`, 기존 `38/50(76%)`였다. (출처: [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):29-30, [`research/results/exp2-heldout/haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md):29-30, [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):80, [E2-29][E2-30])

영역별로 차트의 A 정확도는 두 공급자에서 95.8%였고, GPT-4o 차트의 D 정확도는 83.3%였다. C는 GPT-4o에서 A 대비 토큰을 31% 줄였으며, 원자료의 평균 입력 토큰은 C 572, A 824였다. B의 토큰은 A와 같았다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):80-82, [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):15-16, [E2-31][E2-32])

## 사전 등록 이탈과 한계

사전 등록 이탈은 없었다. 실행 조건, 동결 커밋, 생성물 해시와 분석 절차를 사전 등록대로 유지했으며, `not_started`와 실패는 0이었다. 실행 래퍼의 마지막 `tail -1 파일1 파일2`가 이 환경에서 잘못된 옵션으로 종료 코드 1을 냈지만, 실제 실행은 두 공급자 모두 720/720 정상 종료했다. 이 래퍼 종료 코드는 결과 slot의 실패로 세지 않았다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):3-11, 87, [E2-4][E2-6])

한계는 합성 이미지 세 영역, 36개 family, 두 모델이라는 점이다. 선택기는 연구용 OCR 창 selector이며 제품의 `crop_image_artifact`는 호출자가 영역을 제공하는 도구다. v2 레이아웃은 실험 3 held-out에서 모델에 노출되었고 selector는 그 뒤 바뀌지 않았다. 채점은 content-match이므로 정답 문자열이 설명문 안에 있어도 정답으로 센다. D의 arm별 입력 토큰과 호출당 비용은 재요청이 발생한 slot에서 실제 두 호출을 포함한 평균이다. 실험 3의 캐시 할인과 세션 비용은 이 단일 질의 결과에 적용하지 않는다. (출처: [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md):7-17, 80-96, [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md):15-20, [`research/results/exp2-heldout/haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md):15-20, [E2-2][E2-5])

## 그림과 재현

그림 5는 arm별 정확도와 입력 토큰, 그림 6은 조건별 정확도를 나타낸다. 그림 파일과 설명은 [`../../research/figures/exp2/README.md`](../../research/figures/exp2/README.md):19-29 및 [`../../research/figures/exp2/heldout/`](../../research/figures/exp2/heldout/)에 있다. (출처: 그림 README:13, 19-29)

결과 파일 목록은 [`../../research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md)에 기록되어 있다. 원자료는 README, 각 공급자의 `responses.jsonl`, `graded.jsonl`, `summary.*`, `exp2-analysis.*`이다. 실험 프로토콜은 [`../../research/plans/2026-10-16-experiment2-preregistration-draft.md`](../../research/plans/2026-10-16-experiment2-preregistration-draft.md) §8과 [`../../docs/research/image-first-evaluation-protocol.md`](../../docs/research/image-first-evaluation-protocol.md)에서 확인할 수 있다. (출처: README:3-17, [E2-1])

## 출처 대조표

| ID 범위 | 원문 출처 |
|---|---|
| E2-1–E2-6 | [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md) `:3-17`, `:87` |
| E2-7–E2-9 | [`research/results/exp2-heldout/gpt4o/exp2-analysis.md`](../../research/results/exp2-heldout/gpt4o/exp2-analysis.md) `:7-9`; [`haiku/exp2-analysis.md`](../../research/results/exp2-heldout/haiku/exp2-analysis.md) `:7-9` |
| E2-10–E2-11 | [`research/results/exp2-heldout/README.md`](../../research/results/exp2-heldout/README.md) `:28-29` |
| E2-12–E2-17 | 양 공급자 `exp2-analysis.md` `:15-20` |
| E2-18–E2-21 | README `:47-50`; 양 공급자 분석 `:24-27` |
| E2-22–E2-26 | README `:59-66`, `:83` |
| E2-27–E2-32 | README `:74-75`, `:80-84`; 양 공급자 분석 `:11`, `:29-32` |

사전 등록 원문은 [`../../research/plans/2026-10-16-experiment2-preregistration-draft.md`](../../research/plans/2026-10-16-experiment2-preregistration-draft.md) §8이다. 수치의 위치와 ID는 [`../../research/plans/2026-10-18-task38-number-sheet.md`](../../research/plans/2026-10-18-task38-number-sheet.md) §2에 대조되어 있다.
