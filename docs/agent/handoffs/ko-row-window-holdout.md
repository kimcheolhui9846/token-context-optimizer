# 인계: ko-row-window-holdout (같은 행 단어로 창을 오른쪽으로 넓히는 W1 대 W0, 새 한국어 48쪽)

- 날짜: 2026-11-24 · Task: Orca task_4960fef0ed60 · Tier E · #149 후속(사용자 승인)
- 작업자: Claude Code(Opus 5.5, 연구 작성자) · 계획·마일스톤 교차검토·최종 판정: Codex Astra(PM)
- 브랜치 `claude/ko-row-window-holdout`, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. #147 `c0c2f5dd…`, #148 `2ab9ed14…`, #149 `fd7ba06e…`는 Git 객체로만 읽는다.
- 프로토콜: `research/plans/2026-11-24-ko-row-window-protocol.md`. 검산 명세: `research/tools/ko-row-window/RECOUNT_SPEC.md`.

## 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 사전등록(규칙·생성기·예제·시험·스키마), Draft PR | 진행 중 | 이 커밋 |

## 경계

- 쓰기 범위: `research/` 안 이 과제 전용 파일과 이 인계서. 제품, 원고, 다른 과제 폴더, WBS, 환경 설정·설치 상태는 바꾸지 않는다.
- 로컬 CPU, 연구 API 비용 0원, GPU·유료 모델·호스팅 없음. Argon(BAZE)에 자료를 보내지 않는다("Argon 불가: 과제 지시로 외부 자료 전송 금지").
- 하위 에이전트를 쓰지 않는다(Orca 작업 지시). 생성기와 Python 검산기도 연구 작성자가 썼다(독립성 한계는 프로토콜 1절).
