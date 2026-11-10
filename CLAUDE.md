# CLAUDE.md — token-context-optimizer

Claude Code가 이 저장소(모든 worktree 포함)에서 자동으로 읽는 규칙이다. 답변, 중간 상태, 리뷰는 모두 **한국어**로 쓴다.

## 경로 기준

- 이 파일에는 절대 경로를 적지 않는다. 저장소 위치가 바뀌어도 그대로 쓰기 위해서다
- **메인 checkout** = `git worktree list --porcelain`의 첫 번째 `worktree` 항목
- 다음 파일은 git이 추적하지 않는다. worktree 안에는 없으므로 메인 checkout 경로에서 읽고 쓴다
  - `codex_review/`: 리뷰, 요청서, 핸드오프, `argon/` 기록, `tools/argon_review.py`
  - `token-context-optimizer_WBS.xlsx`: 진행 관리. 커밋하지 않는다
  - `paper/`: 논문 원고
- 공동 작업 지침은 메인 checkout의 상위 폴더에 있는 `AI_COLLABORATION.md`다. 찾지 못하면 사용자에게 위치를 묻는다. 역할은 아래 "역할"이 우선한다(그 지침 §2·§14: 사용자의 최신 지시 우선)
- 메인 checkout에는 목적을 모르는 추적 안 된 파일이 남아 있을 수 있다. 그곳에서는 checkout, 정리, 코드 작업을 하지 않는다. 코드 작업은 항상 별도 worktree에서 한다
- 같은 상위 폴더의 `AGENTS.md`는 다른 프로젝트(Kaggle) 규칙서다. 이 저장소에는 적용하지 않는다
- 현재 상태, 결정 대기 항목, 이력은 `codex_review/`의 가장 최근 `HANDOFF_*.md`와 WBS를 본다. 이 파일에는 자주 바뀌는 상태를 적지 않는다

## 역할 (2026-11-10 사용자 결정)

| 주체 | 역할 |
|---|---|
| 사용자 | 결정 항목 결정, merge·Ready·설치·외부 공개 승인 |
| Codex (Astra) | **PM**: Task 계획·요청서, 결정 항목과 권장안 정리, Claude 산출물의 최종 검토·승인 판정 |
| Claude Code | **개발자**: 요청서대로 작성·구현·테스트·측정, Draft PR, 자기 검증, WBS 갱신 |

- 같은 에이전트가 자기 산출물을 최종 판정하지 않는다
- 요청서 없이 새 구현을 시작하지 않는다. 요청서 범위 밖은 바꾸지 않는다

### Task 흐름

1. Astra가 요청서를 쓴다. 정책이 바뀌는 일은 "계획 PR → 사용자 결정 → 구현 PR"로 나눈다
2. Claude가 Task마다 새 worktree와 브랜치 `claude/<task>`를 만든다. 순서는 테스트 먼저(RED) → 구현 → 전체 검증이다. **Draft PR은 첫 커밋 직후에 열고** 이후 커밋을 그 PR에 쌓는다
   - Orca에서는 독립 Task를 `orca worktree create --name <task> --no-parent`로 기본 base(origin/main)에서 만든다. 쌓는 작업(stacked)은 사용자가 요청할 때만 한다
   - Task/Dispatch ID가 붙은 프롬프트로 Orca worker가 되었으면 `orchestration` 스킬의 worker 절차(ask, worker_done)를 따른다
   - 끝난 worktree는 merge 뒤 사용자 확인을 받아 정리한다. 브랜치는 지우지 않는다
   - 사용자가 넘겨주거나 승인한 요청서에 "Draft PR까지"가 있으면 그것이 커밋·push·Draft PR 승인이다. 없으면 먼저 묻는다
   - research 실험·분석, 문서, 계획 작업도 같은 흐름을 따른다. 검토 전 결과는 논문 작업으로 넘기지 않는다
3. Claude 자기 검증: 아래 검증 명령, Argon 교차 확인, WBS 갱신, 완료 보고(AI_COLLABORATION.md §13 형식)
4. Astra 최종 판정. 지적은 `fix(review): …` 커밋으로 고치거나 근거를 들어 반박한다
5. 사용자 승인 뒤 merge한다. head를 고정한다: `gh pr merge <n> --merge --match-head-commit <sha>`. Ready도 같은 승인에 묶는다

### Opus 메인 + Sonnet/Haiku 하위 에이전트 (사용자 요청)

메인 세션(Opus)은 중간 관리자다. 연산이나 판단이 적은 일은 Agent 도구로 하위 에이전트에 맡긴다. 이 위임은 사용자가 명시적으로 요청한 운영 방식이다.

| `model` | 맡기는 일 |
|---|---|
| `haiku` | 검색·읽기·세기·형식 검사: 사용처 찾기, 로그·JSON 값 추출, 제어 문자·CRLF 검사, PR 본문과 원격 비교 |
| `sonnet` | 명세가 분명한 작성·실행: 정해진 테스트 케이스 작성, 문서 문장·표 정리, 정해진 명령으로 테스트·벤치마크 실행 후 요약, 스크립트 뼈대 |
| 메인 직접 | 핵심 구현, 디버깅, 성능·측정 설계, 수치 해석, 리뷰 판정, 하위 결과 검수, 커밋·PR·보고 |

- 읽기 전용 탐색은 `subagent_type: "Explore"` + `haiku`, 파일 수정 위임은 `general-purpose` + `sonnet`을 쓴다
- 겹치지 않는 일만 병렬로 맡긴다. 같은 파일을 두 에이전트가 동시에 고치지 않는다
- 하위 에이전트는 이 파일을 모른다. 프롬프트에 다음을 모두 넣는다
  - 목적, 정확한 경로, 금지 사항(커밋·push 금지, 지정 파일 밖 수정 금지)
  - 출력 형식
  - "추측하지 말고 확인 불가라고 적어라"
- 하위 결과는 메인이 확인한 뒤에만 사실로 쓴다. 수치는 원자료로 다시 대조하고, 수정한 파일은 diff를 직접 읽는다
- 커밋, push, PR, merge, WBS 저장, Argon 호출은 메인만 한다
- 파일 한두 개, 명령 한두 개짜리 일은 위임하지 않고 메인이 바로 한다

## 절대 규칙

- 커밋·PR 저자는 사용자 단독이다. `Co-Authored-By: Claude`, "Generated with Claude Code" 같은 줄을 넣지 않는다
- 커밋 trailer는 `Agent: claude-code`다(Codex는 `Agent: codex`)
- git 신원은 `kim cheol hui <144594976+kimcheolhui9846@users.noreply.github.com>`이다. 새 worktree에서 커밋 전에 확인한다
- 기본 브랜치에 직접 커밋하지 않는다
- 명시적 허가 없이 쓰지 않는 명령: `reset --hard`, `clean`, `checkout -- .`, `restore .`, `stash`, `rebase`, force push, 이력 변경
- 다른 에이전트의 진행을 Monitor·폴링으로 감시하지 않는다. 끝나면 사용자나 Orca 알림이 알려준다
- 비밀값(`.env*`, API 키, 외부 하네스 토큰)은 출력하거나 고치지 않는다
- 리뷰 권장안이 분명하면 다시 묻지 않고 권장안으로 진행한다. merge·설치·외부 공개는 계속 승인을 받는다

## 검증 명령 (worktree에서)

`npm ci --ignore-scripts` → `npm run build` → `npm test` → `npm run typecheck` → `npm run smoke:mcp` → `npm run validate:plugin` → `npm run benchmark`

- `npm run build`는 `bin/` 번들을 다시 만든다. autocrlf 때문에 내용이 같아도 수정됨으로 보일 수 있다. 의도한 변경이 아니면 그 파일만 되돌린다

## 기록

- 리뷰, 요청서, 핸드오프는 `codex_review/`에 둔다. 이름은 `review_<날짜>_pr<N>-<요약>.md`, `codex_paste_<날짜>_<task>.md` 형식이다
- 요청서와 전달문은 넘기는 시점의 상태로 새로 쓴다. 미리 여러 개 쌓아 두지 않는다
- 저장소 안에서는 Task별 핸드오프를 `docs/agent/handoffs/*.md`에 둔다. 루트 `HANDOFF.md`와 `docs/agent/HANDOFF.md`는 공유 파일이라 보존한다
- 리뷰 항목에는 심각도(Blocker/Major/Minor/Nit/Note), 위치, 문제, 근거, 영향, 권장 수정, 확신도를 적는다
- **WBS:** 작업을 끝낼 때마다 갱신한다
  - openpyxl로 연다(`data_only=False`). 수식 열 L–N과 대시보드 시트는 건드리지 않는다
  - 새 행은 위 행의 스타일과 수식 패턴을 복사한다
  - 구현 Task의 담당 열은 `Claude`로 적는다. 계획·판정을 한 `Astra`는 비고에 적는다. 비고는 날짜별로 ` | `로 구분해 누적한다
  - 저장 뒤 `formulas` 패키지로 다시 계산해 수식 오류가 0인지 확인한다
  - 상태 값: WBS는 완료/리뷰중/진행중/대기/사용자결정/보류, Findings는 해결/부분/리뷰중/미해결/사용자결정/확인필요다. 새 결함은 다음 `N-xx` 번호로 붙인다
- **Argon 교차 확인:** 작업이나 검토를 끝낼 때마다 `python <메인 checkout>/codex_review/tools/argon_review.py <bundle.md> <out.md> [max_tokens]`를 실행한다
  - 키는 사용자 환경변수 `BAZE_API_KEY`에서 읽는다. 출력하지 않는다
  - 묶음에는 diff와 대조할 원자료 발췌만 넣는다. 묶음과 결과는 `codex_review/argon/<날짜>_<대상>-bundle.md`, `-argon.md`로 둔다
  - 지적은 직접 확인한 뒤에만 채택한다. 호출이 실패하면 재시도하지 않고 "Argon 불가: 사유"를 적는다

## 기술 함정

- **백슬래시:** Bash heredoc 안 Python·JS의 `"\\r"`, `"\\s"`가 한 단계 풀린다. 그러면 문서에 실제 제어 문자가 들어가고 정규식이 조용히 바뀐다
  - 문서에 넣을 백슬래시는 `chr(92)`로 만든다
  - 정규식이 든 스크립트는 Write 도구와 `String.raw`로 쓴다
  - 저장 뒤 제어 문자가 0인지 확인한다
  - Write 도구도 백슬래시-u 표기를 실제 문자로 바꾼 적이 있다. 저장 뒤 grep으로 표기가 남았는지 확인한다
- **해시:** 작업 사본(CRLF)과 커밋 blob(LF)은 해시가 다르다. 증거에는 어느 쪽 기준인지 적는다
- **tar:** Git Bash의 GNU tar는 `C:` 같은 드라이브 경로를 원격 호스트로 읽는다. 임시 복사본은 `git worktree add --detach`로 만든다
- **메모리 측정:** `heapUsed + external`을 GC 뒤에 잰다. 측정 대상 객체는 살려 둔다
- **성능 게이트**
  - 허용폭, 같은 프로세스 교대(ABBA), A/A 대조, 최악 형태 입력이 있어야 한다
  - 판정은 nearest-rank median/p95로 한다
  - 표본 하나는 ms 단위 이상이어야 하고, 원시 표본을 남긴다
  - 유효 FAIL은 사후에 완화하지 않는다
  - "세 번째 A/A 무효면 중단"은 필수 게이트에만 적용한다. 정보용 블록은 필수 게이트 뒤에 둔다
