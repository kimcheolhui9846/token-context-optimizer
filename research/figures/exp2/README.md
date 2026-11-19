# 실험 2(RQ2) 그림

- 작성: Claude Code, 2026-10-16
- 형식: `../README.md`(PR #36)와 같다.
  - 반단 7.0 cm. 파일 폭 = 지정 폭이므로 100% 크기로 넣는다.
  - 글자 7 pt, 최소 6 pt
  - Okabe-Ito 색 + 표식 모양·채움
- 만드는 법(`research/`에서)
  ```
  python figures/exp2_figures.py --gpt4o results/<gpt4o run> --haiku results/<haiku run> --tag <이름>
  ```
- 입력은 `summarize.mjs`가 쓴 `graded.jsonl`(arm A–E와 탐색 arm Dp)이다. 출력은 `figures/exp2/<tag>/`다.
- 오차 막대는 각 arm family 평균의 bootstrap 95% 구간(10,000회, seed 20261016)이다. **기술 통계**다. 사전 등록 판정은 각 실행의 `exp2-analysis.md`에 있다.
- `calibration-v2/`: calibration v2(12 family)로 그림 코드를 점검한 결과다. 논문에는 held-out 그림을 쓴다.
- 점 라벨 위치(`OFFSET`)는 calibration에서 맞췄다. held-out에서 겹치면 라벨 위치만 고친다. 데이터·분석은 건드리지 않는다.
- 2026-11-13(논문 검토 P2): 그림 5의 x축을 질의당 단위로 바로잡았다. x는 `graded.jsonl`의 `promptTokens` 평균이며, D 행은 첫 호출과 재요청 호출의 입력 토큰을 합산한 질의당 값이다. 예: held-out GPT-4o D는 91,438토큰 ÷ 144질의 = 634.99(호출 155회로 나누면 589.92), Haiku D는 110,139 ÷ 144 = 764.85(호출 160회 기준 688.37). 점·오차막대 좌표는 바뀌지 않았다(`results/paper-review-fixes/`).
  - 라벨이 다른 표식·오차막대·범례에 겹치거나 캔버스를 벗어나면 `place_labels`가 정해진 후보 위치 중 첫 빈자리로 옮긴다. A·B와 D·D′는 x가 같거나 가까워 표식 자체가 겹칠 수 있다. 정확한 값은 논문 표 2와 각 실행의 `exp2-analysis.md`에 있다.

## 설명 문안 (국문 / 영문)

**그림 5.** arm별 정확도(family 평균)와 재요청을 포함한 질의당 평균 총 입력 토큰. 오차 막대는 family bootstrap 95% 구간이다(기술 통계).
- A 원본, B 1536 축소+JPEG q75, C 질의 인식 영역 선택, D C + 판독 불가 시 원본 1회 재요청, E 정답 영역 crop(진단용), D′ 개정 전 규칙(탐색)

**Fig. 5.** Accuracy (family mean) versus mean total input tokens per query (including re-requests) for each arm. Error bars are family-bootstrap 95% intervals (descriptive).
- A original, B 1536-px downscale with JPEG q75, C query-aware region selection, D C plus one re-request of the original when the answer is unreadable, E evidence-region crop (diagnostic), D′ pre-amendment rule (exploratory)

**그림 6.** 입력 조건별 정확도(A, C, D, D′). 1024는 긴 변 1024 축소, 1024+JPEG는 축소 뒤 JPEG q50이다.
- 두 선이 겹치면 두 arm의 정확도가 같다는 뜻이다.

**Fig. 6.** Accuracy by input condition for A, C, D and D′. "1024" is a 1024-px long-side downscale; "1024+JPEG" adds JPEG q50.
- Overlapping lines mean equal accuracy.
