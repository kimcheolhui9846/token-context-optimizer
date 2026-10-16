# 실험 2 calibration (exp2-cal-gpt4o, exp2-cal-haiku)

- 실행: 2026-10-16, Claude Code. 계획: `../../plans/2026-10-16-experiment2-plan.md`. 사용자 결정 D1–D6 승인
- 세트: `exp2-calibration`. 12 family(영역당 4), family당 질문 1개, 입력 조건 4개
  - 호출 arm은 A·B·C·E(192 slot)이고, D는 파생이다.
  - slots.json SHA-256 `1d906d357e3ad2eb…`(각 `config.json`)
- 모델
  - `gpt-4o-2024-11-20`(detail high): 192회, 실패 0, $0.322
  - `claude-haiku-4-5-20251001`: 192회, 실패 0, $0.174
- 원자료: 각 폴더의 `responses.jsonl`, `graded.jsonl`(D 포함), `summary.*`, `exp2-analysis.*`(초안 분석)
  - Haiku 원자료는 `../exp2-cal-haiku/`에 있다.
- **calibration은 탐색용이다.** 수치는 사전 등록 설계에만 쓴다. 조정은 하지 않았다(D6).

## 결과 요약 (content-match, family 평균, 12 family)

| arm | GPT-4o 정확도 | 입력 토큰 | Haiku 정확도 | 입력 토큰 |
|---|---|---|---|---|
| A 원본 | 79.2% | 823 | 77.1% | 1,360 |
| B 1536/q75 | 68.8% | 823 | 75.0% | 1,360 |
| C 선택기 | 75.0% | 593 | 66.7% | 606 |
| D 선택기 + guard + fallback | 85.4% | 593 | 75.0% | 674 |
| E oracle | 83.3% | 384 | 77.1% | 134 |

| family 짝 차이(bootstrap 95%, n=12) | GPT-4o | Haiku |
|---|---|---|
| D−C(프로토콜 primary) | +10.4%p [0.0, 25.0] | +8.3%p [−2.1, 20.8] |
| C−B | +6.3%p [−4.2, 20.8] | −8.3%p [−25.0, 8.3] |
| D−A | +6.3%p [0.0, 18.8] | −2.1%p [−14.6, 10.4] |

## 점검과 관찰

- **D 비용 계상 확인**
  - no-window D는 A 토큰과 같다.
  - GPT-4o는 B 토큰도 A와 같다. RQ1 타일 규칙에서 2048 → 1536 축소의 절감이 0%이기 때문이다. 그래서 D와 C의 평균 토큰이 같게 나왔다.
  - unreadable D는 C + A다. 예: Haiku 157 + 1,093 = 1,250
- **D의 fallback 발생(48 slot당)**
  - GPT-4o: no-window 15, unreadable 0
  - Haiku: no-window 15, unreadable 3
- **GPT-4o는 UNREADABLE을 한 번도 답하지 않았다.** C 오답은 12건이다. 응답 기반 fallback은 GPT-4o에서 작동하지 않았다. GPT-4o에서 D가 C보다 나은 것은 전부 "창 없음 → 원본" 규칙 덕이다.
  - 이것은 pilot-003(GPT-4o는 판독 불가를 표시함, 16/16)과 다르다. 그때는 C1 창이 근거를 놓친 경우였다. 이번에는 창이 근거를 덮지 못한 일치 사례(8건)에서 모델이 다른 값을 읽고 답했다.
  - held-out에서 그대로 확인할 사항으로 사전 등록에 적는다.
- 창이 일치했지만 근거를 덮지 못한 경우: GPT-4o·Haiku 각 8/33(같은 이미지 입력이므로 같다)
- stress 조건(downscale-only, combined)에서는 oracle E도 50–75%다. 1024 축소로 작은 글자 해상도가 사라진다. 이 조건은 D5에 따라 형식 검증만 하고 값은 바꾸지 않는다.
- 스크립트 실행 중 종료 코드 1이 났다. 두 실행 모두 192/192를 마친 뒤였고, 실패한 호출은 없다(`responses.jsonl`의 status 전부 ok).
