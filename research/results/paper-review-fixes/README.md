# 논문 검토 지적 재검증 (paper-review-fixes, 2026-11-13)

- 작성: Claude Code (claude-opus-5-5). 계획과 진행은 `docs/agent/handoffs/paper-review-fixes.md`
- 커밋된 결과 파일만 읽는다. 모델 호출, 재채점, 원자료 변경은 없다
- 실행(`research/`에서): `python results/paper-review-fixes/verify.py --out results/paper-review-fixes/verify.json`
  - matplotlib 3.11.1, numpy 2.5.1(기존 그림 환경과 같음)
  - 실패 항목이 있으면 종료 코드 1이다
- `verify.json`은 이 Task가 저장한 출력이다. 그림 임시 폴더 경로는 실행마다 달라 넣지 않았다

## 1. 실험 3 재집계 (`results/s3-heldout`)

호출은 결과 파일의 `attemptId`와 같은 시도만 센다. `session-summarize.mjs`의 선택 규칙과 같다.

| 항목 | GPT-4o | Haiku 4.5 |
|---|---|---|
| 결과 파일 / 기록 호출 / 유효 호출 | 120 / 1,460 / 1,453 | 120 / 1,589 / 1,589 |
| 제외 호출 | 중단된 시도 1개(`heldout-document-review-4` S2)의 7건 | 0 |
| 일반 답변 `max_tokens` | 60 | S0·S1·S4 60, S2·S3 512 |
| compact 요약 `max_tokens` | 400 | 400 |
| 도구 왕복 상한 | 3 | 3 |
| 종료 사유 필드 | 없음(1,453건 모두) | `stopReason` |
| compact 요약 `max_tokens` 종료 | 판정 불가. 완료 토큰 최대 213 < 400 | S1 24/48(턴3 9, 턴6 15), S3 1/48(턴6) |
| 일반 답변 `max_tokens` 종료 | 판정 불가. 완료 토큰 60인 응답 S2 18, S3 22 | S1 2/192(턴4) |
| 저장된 요약문(`turns[].summary`) | S1 48, S3 48, 빈 값 0 | S1 48, S3 48, 빈 값 0 |
| 세션별 조건 실행 순서 | 24세션 모두 S0→S1→S2→S3→S4 | 같음 |

- 출력 한도 근거: `src/session-harness.mjs:28-29,80,142-144,211`, `src/session-anthropic.mjs:17-20,52,134`, 두 `config.json`
- 실행 순서 근거: `src/session-harness.mjs:19,238-239`(세션 바깥, 조건 안쪽 반복)와 `calls.jsonl` 순서
- 원 리뷰(`review_2026-11-11_paper-draft-astra.md` P1)와 다른 점
  - "저장된 결과파일에는 요약문이 없다" → 요약문은 저장돼 있다. 요약에서 빠진 정답 값을 대조하는 분석은 하지 않았다
  - "중단된 GPT-4o 시도 7건" → 중단된 시도는 1개이고, 그 시도의 호출이 7건이다

세션 평균 비용(`summary.json`, USD, S0 대비 절감률은 반올림 전 값으로 계산):

| 조건 | GPT-4o 정확도 / 늦은 회상 | GPT-4o 정가 / 캐시 | 캐시 절감 | Haiku 정확도 / 늦은 회상 | Haiku 정가 / 캐시 | 캐시 절감 |
|---|---|---|---|---|---|---|
| S0 | 89.6% / 93.1% | 0.0850419 / 0.0517752 | 기준 | 90.1% / 93.1% | 0.0464118 / 0.0148425 | 기준 |
| S1 | 40.1% / 13.9% | 0.0429784 / 0.0294384 | 43.1% | 79.2% / 72.2% | 0.0267964 / 0.0114457 | 22.9% |
| S2 | 84.9% / 84.7% | 0.0608204 / 0.0470404 | 9.1% | 77.1% / 70.8% | 0.0617387 / 0.0543823 | −266.4% |
| S3 | 83.9% / 81.9% | 0.0614721 / 0.0499388 | 3.5% | 74.5% / 73.6% | 0.0652558 / 0.0553304 | −272.8% |

S1·S3 비용은 기술 통계다. 사전 등록 가설(H4)은 S2만 다룬다.

## 2. 실험 2 그림 x좌표 (`results/exp2-heldout`)

| 공급자 | D 질의 | D 입력 토큰 합 | 재요청 | API 호출 | 질의당(그림 x) | 호출당 |
|---|---:|---:|---:|---:|---:|---:|
| GPT-4o | 144 | 91,438 | 11 | 155 | 634.986 | 589.923 |
| Haiku 4.5 | 144 | 110,139 | 16 | 160 | 764.854 | 688.369 |

D 행의 `promptTokens`는 첫 호출과 재요청 호출의 합이다(`src/run.mjs:268`, `src/summarize.mjs:33`). 그래서 x축은 "Mean total input tokens per query (including re-requests)"가 맞다.

## 3. 그림 검증

- 대상: `figures/exp2/{heldout,calibration-v2}/fig5_exp2_accuracy_vs_tokens`(논문 그림 2와 calibration 점검본), 비교용으로 `figures/fig2_heldout_accuracy_vs_tokens`(논문 그림 3)
- 방법: base 커밋(`5d668f9`)의 생성기와 작업 트리의 생성기를 같은 데이터로 실행한다. 모든 오차막대 점의 (x, y, 하한, 상한)과 캔버스 크기를 비교한다. 라벨 상자가 다른 라벨·표식·오차막대·범례와 겹치거나 캔버스를 벗어나는지 화면 좌표로 계산한다
- 결과
  - 좌표·캔버스(7.0 × 5.6 cm) 동일
  - base: heldout 라벨 겹침 3건(Haiku C·D가 GPT-4o 오차막대를 가로지름), calibration 3건
  - 수정 후: 0건
  - 논문 그림 3은 base부터 라벨 겹침 0건이다. S0·S4 표식은 x가 거의 같아 겹치지만 좌표를 옮길 수 없으므로 생성기와 그림을 바꾸지 않았다
- 재현성: 생성기를 다시 실행하면 PNG는 바이트 단위로 같다. PDF는 길이가 같고 생성 시각(CreationDate)만 다르다. fig6은 코드가 바뀌지 않았으므로 재생성으로 바뀐 PDF 날짜를 되돌렸다
- 시각 확인: heldout·calibration PNG, heldout PDF를 600 dpi로 렌더링한 이미지. 두 줄 x축 제목이 캔버스 안에 들어간다
- 남은 점: calibration 그림에서 GPT-4o B 오차막대가 범례를 지난다. 데이터 위치 그대로이며 논문에는 쓰지 않는 그림이다
- 최종 2단 제출본(HWP·PDF)에 넣은 크기의 확인은 하지 못했다. 메인 checkout의 `paper/`에 제출 파일이 없다

## 4. RED/GREEN

같은 `verify.py`를 base 커밋의 임시 worktree에서 실행하면 4건이 실패한다.

- 그림 x축 문구
- 라벨 겹침
- 원고 그림 2 단위
- README 단위

작업 트리에서는 18건이 모두 통과한다. 재집계 9건은 데이터가 같으므로 두 상태 모두 통과한다.
