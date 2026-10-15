# 논문 그림 (대한전자공학회 논문지 형식)

- 작성: Claude Code, 2026-10-16
- 형식 근거: `../plans/2026-10-15-ieie-journal-format.md`
  - 그림 폭: 반단 7 cm, 전단 14 cm
  - 설명은 그림 아래에 국문·영문 병기
  - 영문은 sentence case
- 그림 안 글자는 영문 7 pt(눈금 6.5 pt, 범례 6 pt)다. 반단 폭에서 읽히는 크기다.
- 색: Okabe-Ito(색각 이상 친화). 흑백 인쇄에서도 구분되도록 채움·빗금·표식 모양을 함께 쓴다.
- 출력: 벡터 PDF와 600 dpi PNG. hwp 양식에는 PNG를 넣는다.

## 만드는 법 (`research/`에서)

```
node src/figure-data.mjs          # held-out 세션별 지표 → figures/data/heldout-sessions.json
python figures/make_figures.py    # matplotlib 3.11.1, numpy 2.5.1
```

- `figure-data.mjs`는 동결된 채점 규칙(`session-score.mjs`)과 `session-summarize.mjs`의 호출 선택 규칙을 그대로 쓴다.
  - 조건별 평균(정확도, 입력 토큰, 정가·캐시 비용)이 `results/s3-heldout/*/summary.json`과 10개 조건 모두 일치하는 것을 확인했다.
- 입력은 커밋된 결과 파일뿐이다. 모델 호출은 없다.
- 오차 막대: 각 조건 평균의 세션 bootstrap 95% 구간(10,000회, seed 20261015). **기술 통계**다.
  - 사전 등록한 짝지은 검정(H1–H3)은 `results/s3-heldout/*/analysis.md`에 있다.
  - 그림의 구간을 가설 판정으로 쓰지 않는다.

## 그림 목록과 설명 문안 (국문 / 영문)

| 파일 | 폭 | 근거 데이터 |
|---|---|---|
| `fig1_rq1_billed_tokens` | 전단 14 cm | `results/rq1-sweep-001/rows.jsonl`(PNG 격자 49장) |
| `fig2_heldout_accuracy_vs_tokens` | 반단 7 cm | `figures/data/heldout-sessions.json` |
| `fig3_heldout_late_recall` | 반단 7 cm | 같음 |
| `fig4_heldout_cost_list_vs_cache` | 반단 7 cm | 같음 |

**그림 1.** 긴 변 길이와 종횡비에 따른 청구 이미지 토큰.
- 왼쪽 GPT-4o(detail high), 오른쪽 Claude Haiku 4.5. 공급자 청구값의 실측이다.
- GPT-4o는 타일 규칙 때문에 계단식으로 변하고, 1:1과 4:3은 같은 값이다.
- Haiku는 1,568 토큰 상한 아래에서 넓이에 따라 늘고, 상한 이상에서는 일정하다.
- Haiku 값에는 이미지당 고정 3토큰이 포함된다.

**Fig. 1.** Billed image tokens by long side and aspect ratio.
- Left: GPT-4o (detail high). Right: Claude Haiku 4.5. Values are measured from provider billing.
- GPT-4o follows a step pattern from its tile rule, and 1:1 and 4:3 coincide.
- Haiku grows with area below its 1,568-token cap and stays flat above it.
- Haiku values include a fixed 3 tokens per image.

**그림 2.** held-out 24세션의 조건별 세션 평균 정확도와 세션당 평균 입력 토큰. 오차 막대는 세션 bootstrap 95% 구간이다(기술 통계).
- S0 전체 유지, S1 compact 모사, S2 플러그인, S3 플러그인+compact, S4 1536 축소 유지

**Fig. 2.** Mean session accuracy versus mean input tokens per session for each condition on 24 held-out sessions. Error bars are session-bootstrap 95% intervals (descriptive).
- S0 keep all, S1 simulated compaction, S2 plugin, S3 plugin with compaction, S4 keep all with 1536-px resize

**그림 3.** 조건별 늦은 회상 문항 정확도(held-out 24세션). 오차 막대는 세션 bootstrap 95% 구간이다.

**Fig. 3.** Late-recall accuracy by condition on 24 held-out sessions. Error bars are session-bootstrap 95% intervals.

**그림 4.** 조건별 세션당 비용(미국 센트). 정가 기준과 프롬프트 캐시 반영 기준을 함께 보인다.
- GPT-4o 캐시 입력은 0.5배다(공식 가격표 확인, 2026-10-15).
- Haiku는 캐시 읽기 0.1배, 쓰기 1.25배다.

**Fig. 4.** Cost per session by condition, in US cents, at list price and with prompt caching.
- GPT-4o cached input is billed at 0.5× (official price table, checked 2026-10-15).
- Haiku cache reads are billed at 0.1× and cache writes at 1.25×.

## 표로 둘 것 (그림으로 만들지 않음)

- 가설 판정 표(H1–H4, 차이와 95% CI): `results/s3-heldout/README.md` §1. 숫자를 정확히 읽어야 하므로 표가 낫다.
- 회계식 일치 요약(66/66 등): `results/rq1-sweep-001/README.md` §1
- 8면 목표 기준으로 그림 4개와 표 2–3개를 권장한다. 최종 배치는 Task 38에서 정한다.
