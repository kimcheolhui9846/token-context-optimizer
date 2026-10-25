# IEIE 투고본 그림·표 설명 국영문 병기안

- 작성: Claude Code, 2026-10-21
- 기준 원고: PR #51 head `eb14f68`(`docs/research/image-first-paper-draft.ko.md`). #51의 그림 번호 정리(전달문 `codex_paste_2026-10-21_pr51-n3-fignum.md`) 뒤 번호를 쓴다.
- 근거: IEIE 형식 메모(`2026-10-15-ieie-journal-format.md` 규정 5·6·9–10), 분량 문서 §1·§3.3
  - 그림·표 설명은 국문 줄 다음에 영문 줄을 둔다. 그림 설명은 그림 아래, 표 설명은 표 위에 둔다.
  - 표기는 "그림 1." / "Fig. 1.", "표 1." / "Table 1."이다. 설명 끝 마침표는 지운다.
  - 영문은 sentence case다(고유명사 예외).
- 이 문서는 조판 1회차에서 hwp에 옮길 문안이다. 원고 Markdown의 설명은 바꾸지 않는다. 원고의 `[출처: …]` 메모는 조판 때 지운다.

## 1. 번호 대응

본문에 처음 나오는 순서로 번호를 매긴다. 저장소 그림 파일 이름은 그대로 둔다.

| 투고본 | 장 | 원고 `eb14f68` 번호 | 파일 |
|---|---|---|---|
| 표 1 | II | 표 1 | (Markdown 표) |
| 그림 1 | IV | 그림 1 | `research/figures/fig1_rq1_billed_tokens.pdf` |
| 표 2 | V | 표 2 | (Markdown 표) |
| 그림 2 | V | 그림 5 | `research/figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.pdf` |
| 표 3 | VI | 표 3 | (Markdown 표) |
| 그림 3 | VI | 그림 2 | `research/figures/fig2_heldout_accuracy_vs_tokens.pdf` |
| 그림 4 | VI | 그림 3 | `research/figures/fig3_heldout_late_recall.pdf` |

- 분량 문서 §4의 표 실측은 `afb5104` 번호로 적혀 있다. 그때의 표 1·2가 지금의 표 2·3이다.
- 그림 파일 fig4(비용 정가·캐시)와 fig6(조건별 정확도)은 결정 T3에 따라 투고본에 넣지 않는다. 그 내용은 표 3과 실험 2 부록이 대신한다.

## 2. 설명 문안

국문은 원고 설명에서 끝 마침표와 출처 메모만 뺐다. 영문은 국문을 옮겼다.

**표 1**
- 표 1. 관련 연구와 본 연구의 개입 위치 비교
- Table 1. Comparison of related work and this study by point of intervention

**그림 1**
- 그림 1. GPT-4o와 Haiku 4.5의 공급자 청구 이미지 토큰 실측
- Fig. 1. Measured provider-billed image tokens for GPT-4o and Haiku 4.5

**표 2**
- 표 2. 실험 2 사전 등록 가설 판정. 괄호는 family 단위 짝 bootstrap 95% CI다
- Table 2. Preregistered hypothesis tests in experiment 2. Brackets give family-level paired bootstrap 95% CIs

**그림 2**
- 그림 2. 실험 2 held-out arm별 family 평균 정확도와 입력 토큰. 오차 막대는 기술 통계인 family bootstrap 95% 구간이다
- Fig. 2. Family-mean accuracy and mean input tokens per call for each arm on the held-out set of experiment 2. Error bars are descriptive family-bootstrap 95% intervals

**표 3**
- 표 3. 실험 3 가설 판정과 S0/S2 세션당 비용(USD) 패널. 괄호는 세션 단위 짝 bootstrap 95% CI다. Haiku H4는 형식상 성립하지만 S2 비용은 S0보다 높다. 절감률은 반올림 전 세션 평균 비용으로 계산했다(2026-10-25 추가, 투고 전 점검 P-1)
- Table 3. Hypothesis tests in experiment 3 with a panel of cost per session (USD) for S0 and S2. Brackets give session-level paired bootstrap 95% CIs. Haiku H4 holds formally, but S2 costs more than S0. Saving rates are computed from unrounded mean session costs

**그림 3**
- 그림 3. held-out 24세션의 조건별 세션 평균 정확도와 세션당 평균 입력 토큰. 오차 막대는 기술 통계인 세션 bootstrap 95% 구간이다
- Fig. 3. Mean session accuracy and mean input tokens per session by condition on 24 held-out sessions. Error bars are descriptive session-bootstrap 95% intervals

**그림 4**
- 그림 4. held-out 24세션의 조건별 늦은 회상 정확도. 오차 막대는 기술 통계인 세션 bootstrap 95% 구간이다
- Fig. 4. Late-recall accuracy by condition on 24 held-out sessions. Error bars are descriptive session-bootstrap 95% intervals

## 3. 용어

- 영문 용어는 원고 English Abstract를 따른다.
  - S2 원본 보존 발췌 = source-preserving retrieval
  - S1 compact 모사 = simulated compaction
  - 늦은 회상 = late recall
  - 공급자 청구 토큰 = provider-billed tokens
- 그림 안의 조건·arm 표기는 기호뿐이다. 그림 3은 S0–S4 점 라벨(`make_figures.py` L98), 그림 4는 S0–S3 x축 눈금(L121), 그림 2는 A–E·D′ 점 라벨(`exp2_figures.py` L90)이다. 범례는 공급자명(GPT-4o, Claude Haiku 4.5)이다. 조건 이름 사전 `COND_LABEL`은 그림에 쓰이지 않는다. 그래서 그림 파일은 다시 만들지 않는다. 기호의 뜻은 V장·VI장 본문에 있다(2026-10-21 PR #52 Codex 검토로 정정).
- `research/figures/README.md`의 그림 2 설명에 남은 "S2 플러그인"·"S2 plugin"은 이번에 원고 용어로 고쳤다.

## 4. 분량 영향

- 영문 설명 줄은 분량 문서 §2.1의 그림 규칙(국영문 설명 2줄)과 표 규칙(설명·간격 3줄)에 이미 들어 있다.
- 표 3과 그림 2–4의 영문 설명은 반단 폭에서 2–3줄이 될 수 있다. 조판 1회차 실측 때 확인한다.

## 5. 남은 것

- 조판 1회차에서 hwp에 옮기고 설명 줄 수를 잰다.
- 표 셀 안의 국문(표 1의 "매체·개입 위치" 등)은 국문 논문이므로 그대로 둔다. 심사 의견에서 요구가 있으면 그때 영문을 더한다.
