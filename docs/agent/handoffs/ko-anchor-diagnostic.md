# 핸드오프: 한국어 자연어 질문의 영역 선택 실패 진단

- Task: `ko-anchor-diagnostic` (Orca task_ff8d31f67935). Tier E. #141 후속 후보 3.
- 브랜치: `claude/ko-anchor-diagnostic`, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`
- 프로토콜: `research/plans/2026-11-24-ko-anchor-diagnostic-protocol.md` (첫 커밋 = 등록 커밋)
- 역할: PM Codex Astra, 연구 작성자 Claude Code Opus 5.5, 독립 Python 검산은 별도 하위 에이전트, 마일스톤 검토 harness-opus-review.

## 상태

| 단계 | 상태 |
|---|---|
| 사전등록·핸드오프 커밋, Draft PR | 진행 중 |
| 분석 코드·시험 | 대기 |
| 기준 재생 96장, 블라인드 수집, 채점 | 대기 |
| 결정성 2회, 독립 Python 검산 | 대기 |
| npm 7단계, Opus 마일스톤 검토, Argon | 대기 |

## 경계

- 제품, 8쪽 논문, WBS, 기존 실험 파일은 읽기 전용.
- #145(Draft)는 병합하거나 쌓지 않고 Git 객체 `708d9946ae091180a1b716baadfdd73fcfe5a19b`로만 읽는다.
- 네트워크 없는 측정(`node-netguard.cjs`), 연구 API 비용 0원.
