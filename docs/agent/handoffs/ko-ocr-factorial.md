# 핸드오프: 한국어 OCR × 한글 검색 키 보존 4조건 실험

- Task: `ko-ocr-factorial` (Orca task_d794d8f4b49d). Tier E. PR #146 후속.
- 브랜치: `claude/ko-ocr-factorial`, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`
- 프로토콜: `research/plans/2026-11-24-ko-ocr-factorial-protocol.md` (등록 커밋 = 이 문서가 처음 들어간 커밋)
- 채점 전용 명단: `research/results/ko-ocr-factorial/cohort.jsonl` (96행, SHA-256 `86ccac53…6b2eb3`)
- 역할: PM Codex Astra, 연구 작성자 Claude Code Opus 5.5, 독립 Python 검산은 별도 하위 에이전트(명세만 전달), 마일스톤 검토 harness-opus-review.

## 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 사전등록·명단·핸드오프 커밋, Draft PR | 완료 | 첫 커밋 |
| RED 시험 → 연구 코드 | 대기 | |
| run A/B 실측(384 페이지 OCR), 채점, A/B 비교 | 대기 | |
| 독립 Python 검산 | 대기 | |
| 연구 회귀, npm 7단계 | 대기 | |
| Opus 마일스톤 검토, Argon 발췌 대조 | 대기 | |
| Astra 최종 판정 | 대기 | |

## 경계

- 제품, 기존 연구 파일, 기존 PR, 논문은 변경하지 않는다. 실험 수치를 WBS에 넣지 않으며 기존 필수 WBS 완료로 집계하지 않는다.
- #145·#146은 Git 객체(`708d9946…`, `cdff545c…`)로만 읽는다.
- 언어 파일은 `research/.cache/ko-ocr-factorial/`(Git 무시)에 둔다. 저장소에 모델·PNG를 추가하지 않는다.
- 측정은 `node-netguard.cjs` 오프라인 가드 아래에서만 한다. 연구 API 비용 0원.
