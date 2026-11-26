# 완료 작업의 로컬 체크아웃 정리

- Tier D. [계획 PR #159](https://github.com/kimcheolhui9846/token-context-optimizer/pull/159)에서 검토한 두 시점 중 사용자가 검증·푸시가 끝난 Draft도 포함하도록 결정했다.
- CLAUDE.md의 기존 병합 후 조항을 한 곳의 작업 종료 절차로 바꾸고 Codex용 AGENTS.md에서 같은 절로 연결했다.
- 원격 SHA, 작업 종료 상태, 로컬 변경·ignored 자료, 세션·잠금·자식 관계를 확인하고 정상 제거한다. 사용자 자료·브랜치·PR을 보존한다.
- 실제 적용 점검으로 #156·#157·#158의 원격 HEAD, 로컬 고유 기록 보관, 체크아웃 제거·브랜치 존속을 확인했다.
- 문서 전용 변경으로 git diff --check, 지침·링크 직접 확인을 사용한다.
