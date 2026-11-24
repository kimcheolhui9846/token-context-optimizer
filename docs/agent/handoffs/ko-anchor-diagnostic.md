# 핸드오프: 한국어 자연어 질문의 영역 선택 실패 진단

- Task: `ko-anchor-diagnostic` (Orca task_ff8d31f67935). Tier E. #141 후속 후보 3.
- 브랜치: `claude/ko-anchor-diagnostic`, Draft PR #146, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`
- 프로토콜: `research/plans/2026-11-24-ko-anchor-diagnostic-protocol.md` (등록 커밋 `b8ade65`, 이후 규칙 변경 없음)
- 역할: PM Codex Astra, 연구 작성자 Claude Code Opus 5.5, 독립 Python 검산은 별도 하위 에이전트(Sonnet 5.5, 명세만 전달), 마일스톤 검토 harness-opus-review.

## 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 사전등록·핸드오프 커밋, Draft PR | 완료 | `b8ade65`, PR #146 |
| 분석 코드·시험 | 완료 | `66c9a25`(측정), 검토 수정 후 대상 시험 19/19 |
| 기준 재생 96장, 블라인드 수집, 채점 | 완료 | 재생 96/96 일치, KO/nl 24/24 `absent`, 원문 대조 24/24 `inside` |
| 결정성 2회, 독립 Python 검산 | 완료 | 6개 파일 바이트 동일(수정 뒤 재실행도 동일), `recount.py` 종료 0, 검산기 시험 38/38 |
| 연구 전체 시험, npm 7단계 | 완료 | 152/152, 7단계 통과 |
| Argon 지정 발췌 대조 | 완료 | APPROVE, 지적 없음 (`codex_review/argon/2026-11-24_ko-anchor-diagnostic-*.md`) |
| Opus 마일스톤 검토 | 완료 | PASS WITH NOTES(Blocker·Major 0). m-1·m-2·m-3·n-1 반영, N-1~N-3은 기록 |
| Astra 최종 판정 | 대기 | |

## 결과 요약

- 한국어 질문 24개 모두 대상 표지 신호(S = T)를 갖지만 기준 선택기 키는 24/24 빈 배열.
- 저장된 영어 OCR 단어 5,548개 중 한글 음절 단어 0개. KO/nl 24장 모두 `absent`.
- 사전 고정 규칙에 따른 좁히기: 후속은 한국어 OCR과 질문 키 보존을 함께 평가해야 한다. 미실행 방법의 복구율은 말하지 않는다.
- 상세: `research/results/ko-anchor-diagnostic/RESULTS.md`, 재현: 같은 폴더 `README.md`.

## 경계와 메모

- 제품, 8쪽 논문, WBS, 기존 실험 파일은 읽기 전용이었다(WBS 갱신 안 함).
- #145(Draft)는 병합하거나 쌓지 않고 Git 객체 `708d9946ae091180a1b716baadfdd73fcfe5a19b`로만 읽었다.
- 네트워크 없는 측정(`node-netguard.cjs`, 차단 0회), 연구 API 비용 0원.
- 분석 코드는 시험보다 먼저 초안을 썼다(엄밀한 RED 순서가 아님). 시험은 측정 전 코드 커밋 `66c9a25`에 함께 들어갔다.
- `cde396c`에 `__pycache__`가 실수로 들어가 `0163de2`에서 지웠다.
- 저장 OCR 상태 오류 행이 없어 `technical_error` 경로는 합성 오류 행 시험으로만 확인했다. Opus m-1·m-2 뒤 오류 행 의미를 두 구현에 같게 확정했다(재생 `ok: null`, 수집·원문 대조 예외는 행 단위 `technical_error`). 출력 바이트는 그대로다.
- 독립 Python 검산자는 JS 코드를 보지 않았지만, 출력 스키마(필드 이름·직렬화)는 명세로 받았다(Opus N-1). 재생의 `score`·`lineText`·`confidence` 일치는 JS 재생만이 근거다.
- (Q − T)에는 `월의`, `암의`처럼 표지 낱말+조사 조합도 들어간다(Opus N-3). OCR 겹침 0건이라 해석에는 영향이 없다.
