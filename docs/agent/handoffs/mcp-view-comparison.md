# 제품 MCP 원본·개요·영역 보기 비교

- Tier E. 기준 `origin/main` `41fc769`. 2026-11-23 승인된 첫 후속 과제다(사용자: "권장안대로 가보자 그리고 추가적으로 개선안 있으면 계속 찾아보고")
- Orca Task `task_0580dbf92206`. 연구 담당 Claude Code, PM Codex(Astra)
- 범위: 검토용 Draft PR까지. 실험 API 비용 0원
  - 다음은 범위 밖이다: 연구 API 지출, 논문 송부, Ready, merge, 설치, 전역 설정
  - D04는 계속 사용자 직접 송부 보류다
- 프로토콜: [research/plans/2026-11-23-mcp-view-comparison-protocol.md](../../../research/plans/2026-11-23-mcp-view-comparison-protocol.md)

## 소유 경로

- `research/plans/*mcp-view-comparison*.md`
- `research/src/mcp-view-comparison*`
- `research/tools/mcp-view-comparison*`
- `research/test/mcp-view-comparison*`
- `research/results/mcp-view-comparison/**`
- `docs/agent/handoffs/mcp-view-comparison.md`

다음은 읽기만 한다: 기존 R09 자료, 제품, 과거 연구, 제출본, WBS.

## 검토 구분

| 검토 | 주체 | 상태 |
|---|---|---|
| 계획 검토 | Claude Opus 5.5(`harness-opus-review`) | 1차 CHANGES REQUIRED, 재심 PASS WITH NOTES(Task 요청서 기준) |
| 마일스톤 검토 | Claude Opus 5.5, 독립 | 예정 |
| 프로젝트 교차 확인 | Argon(gemini-4-argon) | 예정 |
| 최종 판정 | PM Astra | 예정 |

## 진행

- [x] 인계 기록과 프로토콜(표 스키마·호출 흐름) 커밋. 실행 전
- [ ] 테스트 RED → 하네스·측정 코드 GREEN
- [ ] 실행 A·B, LF 사본 실행 C, Python 독립 검산
- [ ] 결과 보고, 전체 게이트, 마일스톤 검토, Argon
