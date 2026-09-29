# Task 기록과 검증

Codex는 구현과 검증을, Claude Code는 리뷰를 담당한다. 병합은 사용자가 수행한다.

## 기록 위치

- 루트 `HANDOFF.md`는 계속 로컬 작업 문서로 사용한다. `/HANDOFF.md`를 Git에서 무시하며 커밋하지 않는다. 이미 추적 중인 파일은 내용을 보존한 뒤 `git rm --cached -- HANDOFF.md`로 추적만 제거한다.
- 공유할 기록은 `docs/agent/handoffs/task-NN.md`에 둔다. NN은 PR 번호가 아닌 원문으로 확인한 Task 번호다. 첫 줄에 PR 번호, 브랜치, base를 적는다.
- `docs/agent/HANDOFF.md`는 공통 안내만 유지한다. 이후 PR에서는 Task 링크나 상태를 이 인덱스에 추가하지 않는다.
- 과거 기록과 실제 검증 근거를 보존하고, 현재 상태와 과거 체크포인트를 구분한다. 이동 시 상대 링크를 고치고 삭제·추가 diff를 대조해 누락을 확인한다.
- `.omx/`는 사용자 결정 전까지 커밋하지 않는다. 이 규칙은 기존 파일 삭제나 이력 재작성을 승인하지 않는다.

## 검증 순서

대상 테스트를 먼저 실행하고 전체 게이트를 실행한다. 새 체크아웃에서도 반드시 **build → typecheck** 순서를 지킨다. 연구 CLI scripts가 `dist`의 생성 모듈을 import하므로, build 전에 typecheck하면 해당 모듈이 없어 TS2307이 발생할 수 있다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
npm.cmd run benchmark
git diff --check
```

Task 18에는 PR #22의 Vitest 설정이 실제로 반영되기 전까지 전체 테스트 명령으로 `npm.cmd test -- --dir tests`를 사용한다. 대상 테스트 실행에도 `--dir tests`를 붙인다. PR #22가 main에 병합됐다는 사실만으로 기존 브랜치 설정이 바뀌지는 않는다.

커밋 후 저자와 커미터를 확인한다. 기존 커밋 이력은 재작성하지 않는다.

```powershell
git log -1 --format='%an <%ae> | %cn <%ce>'
```

공용 README에서 Task 진행 기록은 빼되, 기능·문서 안내 설명은 PR에 유지한다.

## 보류된 기존 스택 정리

2단계는 별도 승인 전까지 실행하지 않는다. 승인 후에도 미리 일괄 이전하지 않고, 병합 직전에 부모 → 자식 순서로 하나씩 처리한다.

- 각 브랜치의 루트 HANDOFF뿐 아니라 `docs/agent/HANDOFF.md`와 루트 `README.md`에 추가한 Task 기록도 해당 Task 파일로 보존한 뒤, 두 공용 파일을 당시 main 버전에 맞춘다. 기능 설명과 기록이 혼재한 경우 구간별 의미와 보존 위치를 먼저 확인한다.
- 부모 변경은 자식에서 `git merge <부모>`로 전파한다. 수동 복제, rebase, force-push는 하지 않는다. 실제 병합은 사용자 지시와 승인 범위를 따른다.
- 매번 이동 전후 삭제·추가 줄과 남은 충돌을 보고한다. 문서 분리만으로 다른 파일의 충돌이 모두 해소됐다고 주장하지 않는다.
