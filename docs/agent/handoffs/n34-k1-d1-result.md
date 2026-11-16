# N34 K1 D1 진단 결과 (P02, 2026-11-16)

- 사용자 D1 1회 조건부 승인과 P01 PASS WITH NOTES에 따른 단 한 번의 실행이다. 재시도와 추가 64 KiB 실행은 없었다
- 명령: `node research/src/n34-k1-diag.mjs --prereg=f28b6ac75fc2240d8954d2b4b736ff32a72a25fb --output=research/results/n34-k1/diag-k1d1-1.json`
- 측정 HEAD `4c19971`, prereg `f28b6ac`(원 `8f29f19`, 보완 1 `00404de`, 보완 2 `f28b6ac`), BASE `7e732e0`, CAND `4999c1f`
- 환경: Node v24.18.0, V8 13.6.233.17, Windows 10.0.26200, i9-12900F 24 logical
- 시각: 2026-11-16 19:19:27–19:59:03 KST, 총 2,375,843 ms(75분 상한의 53%), 빌드 9,929 ms
- **exit 0, status completed**: child 6개 모두 completed·supported, notRun 0, childError 0
  - child wall 377,878–413,096 ms(12분 상한 안), 순서 a b b a a b, 재시도 없음
- 추적 파일 변경 0(1,141개), 임시 폴더 정리 완료, 실행한 child PID 6개 모두 종료
- 원자료: `research/results/n34-k1/diag-k1d1-1.json`, `diag-k1d1-1/child-{1..6}-{a,b}.jsonl`(수신 그대로)

## 1. 무결성 (저장 원자료 독립 재계산, runner 코드 미사용)
- child마다 144표본(warmup 24 + measure 120), 일정·사본·시각 순서·구간 길이가 prereg와 같다
- 강제 GC 창: a 0개, b 144개. 모두 해당 표본 t0 전, 앞 표본 t2 뒤에 있다
- digest: 사본 4개 × child 6개에서 모두 같은 값 하나다(B·C 출력 동일)
- GC 스트림 seq 연속, drain totalEvents = GC 기록 수, probe 사건과 스트림 일치, 시계 확인 통과
- 귀속: 측정 표본 720개 모두 observed, ambiguous 0. 강제 창 안 GC 사건은 b child마다 144개였고, 표본 창과 겹친 것은 없다
- 저장 요약·비교와의 불일치 0(역할별 통계, 사본 비, CPU/wall, GC 겹침, Spearman, 표본 밖·강제 창 사건 수, 10개 비교 지표)

## 2. 서술 통계 (역할별 측정 60표본, nearest-rank, ms)
| 위치 | 조건 | C wall median / p95 − median | B wall median / p95 − median | C major 겹침 비율 | B major 겹침 비율 | major 사건 수 |
|---|---|---|---|---|---|---|
| 1 | a | 2287.8 / 328.5 | 2984.4 / 296.9 | 0.517 | 0.400 | 85 |
| 2 | b | 2414.0 / 364.8 | 3139.9 / 348.0 | 1 | 1 | 302 |
| 3 | b | 2376.1 / 151.9 | 2963.2 / 318.7 | 1 | 1 | 301 |
| 4 | a | 2166.0 / 455.5 | 2860.9 / 488.8 | 0.650 | 0.433 | 99 |
| 5 | a | 2223.7 / 464.2 | 3063.4 / 430.4 | 0.433 | 0.600 | 91 |
| 6 | b | 2432.0 / 147.3 | 2999.1 / 268.2 | 1 | 1 | 302 |

- major 사건 수에는 b의 강제 GC 144개와 probe 1개가 들어 있다
- b − a, 짝 (1,2), (4,3), (5,6)

| 지표 | 차이 | 방향 |
|---|---|---|
| C wall median | +126.2, +210.1, +208.3 | 높음 |
| C wall p95 − median | +36.2, −303.6, −316.8 | 섞임 |
| B wall median | +155.5, +102.3, −64.3 | 섞임 |
| B wall p95 − median | +51.1, −170.0, −162.2 | 섞임 |
| C 사본 median 비 | +0.007, −0.124, −0.011 | 섞임 |
| B 사본 median 비 | +0.005, −0.097, −0.041 | 섞임 |
| C major 겹침 비율 | +0.483, +0.350, +0.567 | 높음 |
| B major 겹침 비율 | +0.600, +0.567, +0.400 | 높음 |
| C CPU/wall median | +0.012, +0.014, +0.040 | 높음 |
| B CPU/wall median | +0.012, +0.015, +0.011 | 높음 |

## 3. 관측 사실과 해석 한계
- 사실: 표본 직전 강제 GC를 넣은 b에서는 측정 표본 모두에 major GC가 겹쳤다(겹침 median 약 15 ms). a에서는 표본의 40–65%에 겹쳤다
- 사실: C wall median은 세 짝 모두 b가 높았다(+126–210 ms). 나머지 wall·spread·사본 비 방향은 섞였다
- 가설(확인 안 됨): 강제 full GC가 heap 크기나 다음 GC 시점을 바꿔 표본 안 major GC를 늘렸을 수 있다. 강제 GC는 heap 상태와 표본 간격을 함께 바꾸므로 b − a를 GC 이월만의 효과로 보지 않는다
- 반복 단위는 child이고 조건당 3개다. 유의성 검정, 원인 확정, 사후 기준 완화는 하지 않는다
- CPU/wall은 프로세스 전체 CPU이고 CPU 시간 해상도가 이산적이다. observer 기록 비용도 들어 있다
- 이 결과는 K1 PASS, F1 위험 해소, 공식 재현성 증명이 아니다. K1 timing INVALID, memory NOT RUN, F1 위험 미해결은 그대로다
