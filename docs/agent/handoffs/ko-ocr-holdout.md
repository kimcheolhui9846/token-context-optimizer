# 핸드오프: 새 합성 문서 96쪽에서 한국어 OCR × 한글 검색 키 4조건 재검증

- Task: `ko-ocr-holdout` (Orca task_2ca73e896573). Tier E. #147 후속.
- 브랜치: `claude/ko-ocr-holdout`, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`
- 프로토콜: `research/plans/2026-11-24-ko-ocr-holdout-protocol.md`
- 자료 작성자 지침: `research/tools/ko-ocr-holdout/AUTHOR_BRIEF.md`
- 역할: PM Codex Astra, 연구 작성자 Claude Code Opus 5.5, 자료 작성자·Python 검산 작성자는 각각 별도 하위 에이전트, 마일스톤 검토 harness-opus-review(claude-opus-5-5).

## 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 사전등록·작성자 지침·핸드오프 커밋, Draft PR | 진행중 | |
| 자료 작성 위임·동결 전 검사·자료 동결 | 대기 | |
| RED 시험 → 연구 코드 | 대기 | |
| run A/B 실측, 예측 고정, 채점, A/B 비교 | 대기 | |
| 독립 Python 검산 | 대기 | |
| 연구 회귀, 제품 npm 7단계, 새 클론 재현 | 대기 | |
| Opus 마일스톤 검토, Argon | 대기 | |
