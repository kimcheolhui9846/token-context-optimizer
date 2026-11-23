# R09 결과 요약 (heldout)

자동 생성: `src/r09-score.mjs`. 성공 = 일치 + 페이지보다 작은 창 + 금표준 전부 포함(반개방, 0px).

## 집합 code (쌍 12)

| 언어 | 성공 | 작은 창 전체 포함 | 작은 창 부분 누락 | 일치 후 전체 | 불일치 전체 | 기술 실패 | 최종 근거 보존/관측 | 평균 면적비(관측) |
|---|---|---|---|---|---|---|---|---|
| EN | 12/12 | 12 | 0 | 0 | 0 | 0 | 12/12 | 0.2593 |
| KO | 11/12 | 11 | 1 | 0 | 0 | 0 | 11/12 | 0.2147 |

2×2: 양쪽 성공 11, EN만 1, KO만 0, 양쪽 실패 0. KO−EN = (0 − 1) / 12 = -8.3%.
기술 결측: EN만 0, KO만 0, 동시 0. 완전 쌍 12: KO−EN -8.3%. 결측 상·하한: -8.3% ~ -8.3%.

## 집합 nl (쌍 12)

| 언어 | 성공 | 작은 창 전체 포함 | 작은 창 부분 누락 | 일치 후 전체 | 불일치 전체 | 기술 실패 | 최종 근거 보존/관측 | 평균 면적비(관측) |
|---|---|---|---|---|---|---|---|---|
| EN | 12/12 | 12 | 0 | 0 | 0 | 0 | 12/12 | 0.2584 |
| KO | 0/12 | 0 | 0 | 0 | 12 | 0 | 12/12 | 1 |

2×2: 양쪽 성공 0, EN만 12, KO만 0, 양쪽 실패 0. KO−EN = (0 − 12) / 12 = -100.0%.
기술 결측: EN만 0, KO만 0, 동시 0. 완전 쌍 12: KO−EN -100.0%. 결측 상·하한: -100.0% ~ -100.0%.

## 집합 all (쌍 24)

| 언어 | 성공 | 작은 창 전체 포함 | 작은 창 부분 누락 | 일치 후 전체 | 불일치 전체 | 기술 실패 | 최종 근거 보존/관측 | 평균 면적비(관측) |
|---|---|---|---|---|---|---|---|---|
| EN | 24/24 | 24 | 0 | 0 | 0 | 0 | 24/24 | 0.2588 |
| KO | 11/24 | 11 | 1 | 0 | 12 | 0 | 23/24 | 0.6073 |

2×2: 양쪽 성공 11, EN만 13, KO만 0, 양쪽 실패 0. KO−EN = (0 − 13) / 24 = -54.2%.
기술 결측: EN만 0, KO만 0, 동시 0. 완전 쌍 24: KO−EN -54.2%. 결측 상·하한: -54.2% ~ -54.2%.

## 계층 (문서형 × 앵커 × 언어)

| 문서형 | 앵커 | 언어 | n | 성공 | 부분 누락 | 일치 후 전체 | 불일치 전체 | 기술 실패 |
|---|---|---|---|---|---|---|---|---|
| schedule | code | en | 4 | 4 | 0 | 0 | 0 | 0 |
| schedule | code | ko | 4 | 4 | 0 | 0 | 0 | 0 |
| schedule | nl | en | 4 | 4 | 0 | 0 | 0 | 0 |
| schedule | nl | ko | 4 | 0 | 0 | 0 | 4 | 0 |
| invoice | code | en | 4 | 4 | 0 | 0 | 0 | 0 |
| invoice | code | ko | 4 | 4 | 0 | 0 | 0 | 0 |
| invoice | nl | en | 4 | 4 | 0 | 0 | 0 | 0 |
| invoice | nl | ko | 4 | 0 | 0 | 0 | 4 | 0 |
| status | code | en | 4 | 4 | 0 | 0 | 0 | 0 |
| status | code | ko | 4 | 3 | 1 | 0 | 0 | 0 |
| status | nl | en | 4 | 4 | 0 | 0 | 0 | 0 |
| status | nl | ko | 4 | 0 | 0 | 0 | 4 | 0 |

## 이미지별 원시 결과

| 이미지 | 범주 | 면적비 | 키 | 일치 줄 | 신뢰도 | 출처 | 누락 |
|---|---|---|---|---|---|---|---|
| schedule-table-code-s1-en | window_complete | 0.259831 | sx-5134 | SX-5134 Hiring panel Birch Studio 08:00 | 95 | code |  |
| schedule-table-code-s1-ko | window_complete | 0.220887 | sx-5134 | SX-5134 AE HE HA] AFRC/L 08:00 | 67 | code |  |
| schedule-table-code-s2-en | window_complete | 0.263471 | sx-8805 | SX-8805 Design critique Birch Studio 14:30 | 96 | code |  |
| schedule-table-code-s2-ko | window_complete | 0.21741 | sx-8805 | SX-8805 CX! Tot HX] ARC/L 14:30 | 43 | code |  |
| schedule-table-nl-s1-en | window_complete | 0.259831 | budget review | SX-6993 Budget review Pine Hall 12:10 | 95 | label |  |
| schedule-table-nl-s1-ko | no_match_full | 1 | (없음) |  | - | - |  |
| schedule-table-nl-s2-en | window_complete | 0.259831 | hiring panel | SX-2509 Hiring panel Elm Room 10:00 | 95 | label |  |
| schedule-table-nl-s2-ko | no_match_full | 1 | (없음) |  | - | - |  |
| schedule-cards-code-s1-en | window_complete | 0.263685 | sx-2176 | SX-1150 Hiring panel SX-2176 Customer forum | 94 | code |  |
| schedule-cards-code-s1-ko | window_complete | 0.208748 | sx-2176 | SX-1150 Meg HA SX-2176 1728 ZED) | 53 | code |  |
| schedule-cards-code-s2-en | window_complete | 0.257926 | sx-2384 | SX-2384 Customer forum SX-6461 Vendor briefing | 95 | code |  |
| schedule-cards-code-s2-ko | window_complete | 0.212795 | sx-2384 | SX-2384 17H ZHEtS/ SX-6461 HHA HES | 42 | code |  |
| schedule-cards-nl-s1-en | window_complete | 0.251579 | design critique | SX-9874 Design critique SX-5991 Payroll audit | 94 | label |  |
| schedule-cards-nl-s1-ko | no_match_full | 1 | (없음) |  | - | - |  |
| schedule-cards-nl-s2-en | window_complete | 0.250843 | safety drill | SX-8417 Budget review SX-6298 Safety drill | 93 | label |  |
| schedule-cards-nl-s2-ko | no_match_full | 1 | (없음) |  | - | - |  |
| invoice-table-code-s1-en | window_complete | 0.250256 | kt-9600 | KT-9600 Wall clock Nara Metal 516,400 | 96 | code |  |
| invoice-table-code-s1-ko | window_complete | 0.250256 | kt-9600 | KT-9600 HAA Ligt=% 516,400 | 70 | code |  |
| invoice-table-code-s2-en | window_complete | 0.26925 | kt-2159 | KT-2159 Steel bracket Daon Supply 673,200 | 94 | code |  |
| invoice-table-code-s2-ko | window_complete | 0.326042 | kt-2159 | KT-2159 dE Egj3l Ct==4t 673,200 | 48 | code |  |
| invoice-table-nl-s1-en | window_complete | 0.26925 | paper towels | KT-7268 Paper towels Nara Metal 755,600 | 95 | label |  |
| invoice-table-nl-s1-ko | no_match_full | 1 | (없음) |  | - | - |  |
| invoice-table-nl-s2-en | window_complete | 0.262793 | water filter | KT-6482 Water filter Hanbit Trading 27,300 | 95 | label |  |
| invoice-table-nl-s2-ko | no_match_full | 1 | (없음) |  | - | - |  |
| invoice-cards-code-s1-en | window_complete | 0.248917 | kt-6012 | KT-4954 Glass panel KT-6012 Wall clock | 94 | code |  |
| invoice-cards-code-s1-ko | window_complete | 0.196541 | kt-6012 | KT-4954 S2/ od KT-6012 HAA | 62 | code |  |
| invoice-cards-code-s2-en | window_complete | 0.252637 | kt-7414 | KT-7414 Toner cartridge KT-3647 Copper cable | 90 | code |  |
| invoice-cards-code-s2-ko | window_complete | 0.205796 | kt-7414 | KT-7414 HE PII=EIPN KT-3647 +2 A/0/& | 33 | code |  |
| invoice-cards-nl-s1-en | window_complete | 0.253695 | office chair | KT-6321 Office chair KT-3202 Filing cabinet | 95 | label |  |
| invoice-cards-nl-s1-ko | no_match_full | 1 | (없음) |  | - | - |  |
| invoice-cards-nl-s2-en | window_complete | 0.255766 | paper towels | KT-5410 Filing cabinet KT-4847 Paper towels | 93 | label |  |
| invoice-cards-nl-s2-ko | no_match_full | 1 | (없음) |  | - | - |  |
| status-table-code-s1-en | window_complete | 0.252848 | px-2149 | PX-2149 Cache cluster Delayed 10 | 93 | code |  |
| status-table-code-s1-ko | window_complete | 0.214818 | px-2149 | PX-2149 Al 22{ AH X/ 10 | 52 | code |  |
| status-table-code-s2-en | window_complete | 0.281799 | px-7880 | PX-7880 Login service Normal 73 | 96 | code |  |
| status-table-code-s2-ko | window_complete | 0.211422 | px-7880 | PX-7880 2701 MH/A RA 73 | 63 | code |  |
| status-table-nl-s1-en | window_complete | 0.252848 | login service | PX-7225 Login service Paused 13 | 95 | label |  |
| status-table-nl-s1-ko | no_match_full | 1 | (없음) |  | - | - |  |
| status-table-nl-s2-en | window_complete | 0.281799 | audit logger | PX-1597 Audit logger Normal 86 | 96 | label |  |
| status-table-nl-s2-ko | no_match_full | 1 | (없음) |  | - | - |  |
| status-cards-code-s1-en | window_complete | 0.261759 | px-5336 | PX-1886 Backup storage PX-5336 Billing gateway | 95 | code |  |
| status-cards-code-s1-ko | window_partial | 0.109802 | px-5336 | PX-1886 HHO Xf REA PX-5336 Z/ H0/ ESO] | 42 | code | r3v |
| status-cards-code-s2-en | window_complete | 0.24904 | px-3474 | PX-3474 Login service PX-8258 Sensor feed | 94 | code |  |
| status-cards-code-s2-ko | window_complete | 0.201622 | px-3474 | PX-3474 270] MH/A PX-8258 MA 4 | 52 | code |  |
| status-cards-nl-s1-en | window_complete | 0.246501 | backup storage | PX-5387 Backup storage PX-6163 Clock sync | 95 | label |  |
| status-cards-nl-s1-ko | no_match_full | 1 | (없음) |  | - | - |  |
| status-cards-nl-s2-en | window_complete | 0.256194 | login service | PX-6591 Clock sync PX-6481 Login service | 94 | label |  |
| status-cards-nl-s2-ko | no_match_full | 1 | (없음) |  | - | - |  |
