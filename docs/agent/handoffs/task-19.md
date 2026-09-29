PR: #18 | Branch: codex/task-19-image-paper-first | Base: main (6c2b05e)

# Task 19 migration archive

This archive preserves the Task 19 documentation-only handoff state that originally lived in the repository root and the raw migration diffs used to move durable notes under `docs/agent/handoffs/`.

## Migration normalization

- Original root `HANDOFF.md` was archived from `990aa9f:HANDOFF.md`; it contains 90 lines before normalization.
- Because this archive now lives at `docs/agent/handoffs/task-19.md`, the original root link `docs/agent/HANDOFF.md` is normalized to `../HANDOFF.md`.
- Raw diff blocks below are literal `git diff 4e9b7c5..990aa9f` output and keep their original paths/text.
- Preservation counts: root `HANDOFF.md` 90 lines; `README.md` +25/-28; `docs/agent/HANDOFF.md` +22/-0.
- Fallback implementer surface: configured GPT-5.5 task agent; no separate shell-level model probe is available in this runtime.

## Archived original root HANDOFF.md

# HANDOFF

## Task 19 — 논문 우선 이미지 연구 초안과 실험 설계 (2026-09-19)

### 1. 작업 개요
- 사용자 요구: 논문 작성과 플러그인 개발 병행, 충돌하면 논문 우선. 앞선 이미지 우선·승인 후 영상 확장 방향 유지.
- 이번 전달 범위: 한국어 논문 초안, 검증된 1차 문헌 표, 이미지 실험 프로토콜과 최소 플러그인 개발 연결표, 문서 탐색/핸드오프 정리.
- 제외: 실행 코드/의존성 변경, 영상 구현, 실제 모델 실험·과금·데이터셋 업로드, 실험 결과/우월성 주장, PR merge.
- 기준: `origin/main` / `4e9b7c562b7f08fc24e79e615f68b467cbf8eeda`, 원격 fetch 후 확인. 전용 브랜치 `codex/task-19-image-paper-first`, 이 분리 worktree 사용.
- 기존 Task 18 브랜치의 HANDOFF.md 및 paired-success 미완료 소스/테스트는 보존. 미완료 Task 18을 이번 작업에 포함하지 않는다.
- 이 루트 HANDOFF가 첫 작업 문서. 이전 이력: [기존 핸드오프](../HANDOFF.md).

### 2. 계획 / 수용 기준
- [x] 적용 지침/실제 저장소/기존 연구 상태 확인 및 Git 격리.
- [x] 별도 native `gpt-6-astra` 초기 계획 검토 PASS WITH NOTES. 현재 런타임은 UTF-8 텍스트 처리이며 이미지 backend 없음.
- [x] 1차 문헌의 제목/연도/URL/지원 주장/전이 한계 확인. 3편은 공식 초록 검색 색인만 확인한 한계 명시.
- [x] Luna 초안 작성 후 usage limit으로 중단; 지정된 대체 GPT-5.5가 3문서 보완 및 실제 완료 응답. 구현 상태·제안 방법·미측정 결과 분리.
- [x] 이미지 원본 family 분할, arm 통제, 변환 설정, fallback, 채점/실패 분모, paired 분석, 실제 usage와 bytes 구별, pilot/확증 실험 gate 정의.
- [x] 각 개발 항목을 논문 증거 요구와 연결. 영상은 후속 범위.
- [x] 문서 링크/주장/범위 검증 및 프로젝트 gate, Draft PR, post-PR 재검증, Astra 최종 리뷰.

### 3–4. 변경 및 결정
- 논문에 필요한 연구 질문과 실험 설계를 우선 고정하고 기능 개발은 후속 사용자 승인 Task에서 수행한다.
- 기존 텍스트 연구 자료는 삭제하지 않고 별도 과거 연구로 연결. 텍스트 테스트/benchmark/mock 결과를 이미지 효과로 전용하지 않는다.
- 제출처/마감일 질문은 대기 중이며 미지정이면 한국어 연구용 Markdown 초안을 기본으로 한다.
- RED: 순수 문서 작성이므로 코드 failing test는 해당 없음. 위 수용 기준과 근거/링크 검증을 편집 전 정의했다.

### 5–6. 검증 및 오류 기록
- 격리 worktree 생성 첫 시도는 ref lock 권한 오류; 동일 명령의 승인된 escalation으로 성공.
- 초기 targeted baseline `npm.cmd test -- --run tests/research-dataset.test.ts`: 30 PASS / 9 skipped / suite FAIL. 격리 worktree에 local node_modules/typescript/bin/tsc가 없어 CLI suite 준비 실패. 원본 코드 오류로 단정하지 않는다. lockfile 기반 의존성 설치 후 재실행 예정.
- `npm.cmd ci --ignore-scripts`로 lockfile 의존성 설치 후 동일 targeted baseline 39/39 PASS. 코드/lockfile 변경 없음. 초기 실패 원인 확인 및 환경 복구 완료. 문서/프로젝트 최종 결과는 후속 기록한다.

### 7. 교차 검토
- Astra: 실제 native `gpt-6-astra` 호출 및 응답 확인. 초기 범위 검토 PASS WITH NOTES; 외부 제공자 리뷰가 아님.
- Claude Opus 5: 초기 비민감 계획 검토를 정확한 `claude-opus-5`로 요청했으나 조직이 Claude Code 구독 접근을 비활성화했다는 오류로 실패. 실제 모델 사용 목록은 비어 있음; 다른 버전/API 키/유료 접근으로 대체하지 않음. 첫 CLI 시도는 variadic MCP 옵션이 prompt를 소비하여 모델 호출 전 실패했고 인자 경계를 수정하여 위 접근 오류를 확인.
- Gemini: launcher 있음, GEMINI_API_KEY/GOOGLE_API_KEY 환경값 존재 여부만 확인하여 둘 다 없음. 무료 API 모델/quota 미확립으로 검토 미수행; 유료 fallback 없음.
- Copilot: launcher 실행 결과 `Cannot find GitHub Copilot CLI`; 검토 미수행.
- 민감 정보/전체 저장소/전역 설정을 외부 검토에 보내지 않는다.

### 8. 자체 리뷰 / 위험
- 위험: 개발 완성도를 논문 결과로 오인, 이미지 미지원 기능의 구현 주장, 데이터 누수, 변환 비용 누락, 영상 범위 혼입.
- 보완: 독립 문헌 검증과 Astra 실제 산출물 리뷰, 원본/source-family/usage 추적을 실험 설계에 포함.

### 9–11. 현재 상태 / 승인 / 다음 작업
- 현재 상태: Task 19 완료, 최종 Astra PASS WITH NOTES, 사용자 승인 대기. 실제 이미지 결과 표는 작성하지 않는다.
- 다음 실제 플러그인 구현 Task와 모든 merge는 사용자 승인 전 착수하지 않는다.
- 최종 Git/PR/검증/미해결 검토 공백은 완료 시 갱신한다.

- 초기 Cross-check status: DEGRADED. 별도 Astra 검토로 보완하며 외부 제공자 성공으로 계산하지 않음.

### 중간 검증 및 문헌 기록
- 2026-09-19 pre-PR: `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS; `npm.cmd test` 570 PASS / 11 files; `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark` 모두 PASS.
- 기존 text benchmark 3 scenarios x 20 samples 통과. 이미지/hosted 실험은 NOT RUN, 이번 Task 범위 밖이며 아직 구현되지 않음.
- native Luna (`gpt-5.6-luna`, worker) 문서 작성 중. 별도 Astra 방법론 검토: 36개 family를 paired 분석 단위로 유지, guard contrast D-C, oracle 누수 차단, assigned-source 동일성, 실패/미실행 구분 권고를 전달.
- 문헌 6편: ChartQA/ScreenQA ACL 공식 초록과 MetaCompress arXiv:2603.21701v1 초록은 직접 접근. DocVQA/TextVQA/QuietPrune은 공식 CVF 초록의 검색 색인만 확인; CVF 직접 열람403으로 전체 본문 열람을 주장하지 않음. 연구자가 최초 요약에서 접근 방식을 충분히 구분하지 않아 재질의하고 문헌 표에 정정하도록 전달.
- 기존 본문 보존, 현재 README와 옛 paper/protocol 상단에 연구 방향 변경 및 과거 텍스트 연구 구분 표시.

### 재개 기록 (2026-09-19 22:13 KST)
- 사용자 재개 지시에 따라 같은 Task 19 / 브랜치 / worktree에서 계속한다. 새 Task나 중복 PR을 만들지 않는다.
- Luna 첫 작성이 usage limit으로 중단됐으나 3개 초안 파일은 보존돼 있다. 지정된 대체 모델 `gpt-5.5` worker에 이 3개 문서만 소유권을 부여하고 국소 일관성 수정/검증을 요청했다. 실제 완료 여부는 응답과 diff로 확인한다.
- 재개 targeted 검사 `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS.
- 마일스톤 외부 검토: 정확한 `claude-opus-5` 비민감 요약 검토를 다시 시도했으나 조직 구독 접근 비활성 오류, models=[]로 실제 모델 호출 미수행. Gemini 키 환경 부재 및 무료 API 미확립, Copilot launcher CLI unavailable을 재확인. Cross-check status: DEGRADED 유지.
- 빌드가 만든 bundle의 Git 정규화 diff가 없음(exit 0)을 확인하고 해당 파일만 원래 worktree 표현으로 복구했다. 문서만 전달하며 원본 Task 18 변경은 그대로 보존한다.

### 마일스톤 내용 검토와 수정
- GPT-5.5 worker 실제 완료 응답과 3개 문서 원문을 직접 확인. 범위 내 변환 순서·oracle 접근·D-C 대비·문헌 접근 방식 수정 완료.
- Astra 첫 마일스톤 판정 CHANGES REQUIRED: major 1건(clean pixels 전면 금지가 clean 조건과 충돌), minor 1건(retry를 별도 slot으로 표현해 primary 분모 모호), minor 1건(핸드오프 상태 갱신 필요).
- 동일 승인 범위에서 주 에이전트가 국소 수정: clean 조건에는 배정된 clean 입력 허용; 손상 조건의 비배정 clean counterpart는 숨김; full original/fallback은 배정된 variant로 정의. retry는 보조 attempt이며 비용/호출 수에만 추가하고 primary 720/production576 분모 및 원래 실패 판정 유지.
- 8문서 strict UTF-8/코드 fence/local link 검증 및 staged diff 검사 PASS. 원격 문헌 전체 본문 또는 실험 재현을 검증했다고 주장하지 않음.
- Astra 수정 재검토: 내용 판정 PASS WITH NOTES, 미해결 blocker/major 없음. 외부 검토 DEGRADED, 초록 수준 출처 확인, 모든 이미지 기능/결과 미구현·미측정이라는 제한 유지. Draft PR/post-PR 및 최종 transport gate는 아직 진행 예정.

### Draft PR 및 post-PR 검증 (2026-09-19 22:20–22:21 KST)
- 내용 커밋 `1589c3bdc0de1a8d7b4579d23b835e2c62b4eefe` / `docs: draft image-first paper and evaluation protocol` push 성공.
- [Draft PR #18](https://github.com/kimcheolhui9846/token-context-optimizer/pull/18), base `main`, head `codex/task-19-image-paper-first`, OPEN / Draft 확인. PR 번호와 Task 번호는 별개다. Merge 미수행.
- PR 생성 후 targeted `npm.cmd test -- --run tests/research-dataset.test.ts`: 39/39 PASS (22:20).
- PR 생성 후 `npm.cmd test`: 570/570 PASS / 11 files (22:20).
- PR 생성 후 `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`: 모두 PASS.
- 기존 benchmark 3 scenarios x 20 samples, p95 exact 1.92ms / semantic 2.27ms / code 1.23ms. 기존 text fixture 회귀 증거이며 image/hosted 결과 아님.
- 문서 8개 UTF-8/fence/local link 34개 및 staged `git diff --cached --check` PASS. runtime/tests/dependencies 변경 없음. pre-commit 우회 옵션 사용하지 않았으며 설정된 hooksPath/활성 hook 파일 없음.
- 이미지/실제 API 실험, 신규 이미지 TDD: NOT RUN — 기능 구현 전 연구 문서 Task 범위 밖. 별도 lint/format script는 package.json에 없음.
- 남은 작업: 이 검증 기록을 같은 PR에 push, 최종 Astra가 실제 diff/PR/latest commit/검증/위험 확인, 사용자 승인 대기.

### 최종 Astra Review Result / 승인 대기
- 최종 판정: **PASS WITH NOTES**. Astra가 `965177c`의 실제 8문서 diff, HANDOFF, PR 설명/OPEN Draft 상태/latest SHA, clean worktree, 원래 Task 18 보존 상태와 관찰된 post-Draft 검증 근거를 확인했다. 미해결 blocker/major 없음.
- 원격 `main`은 `4e9b7c5`, Task 브랜치는 `965177c`임을 `git ls-remote`로도 확인. 최종 판정 기록만 추가한 후 동일 PR의 최신 SHA까지 재확인한다.
- `gh pr checks 18`: no checks reported. Hosted CI 통과를 주장하지 않으며 위 로컬 검증이 실제 증거다.
- 제한: Cross-check status DEGRADED; 문헌은 초록 수준(3편 검색 색인); 제출처/마감일 미지정; 이미지 구현·dataset·실험 결과 없음. 이 결과는 논문 연구 초안/평가 설계 전달 완료이며 논문 실험 또는 플러그인 기능 완성을 뜻하지 않는다.
- 이번 Task 파일: 새 논문/프로토콜/출처 3문서와 루트 HANDOFF, README·기존 handoff·역사적 paper/protocol 안내 4문서. 삭제 파일, runtime/test/dependency 변경 없음.
- 다음 후보: 사용자 검토 후 연구 질문·평가 조건을 확정하고 이를 검증할 이미지 ingest/원본 보존부터 별도 Task로 설계·구현. 논문과 개발의 충돌 시 논문 우선; 영상은 이미지 검증과 별도 승인 후.
- 승인 게이트: **다음 Task로 진행하지 않고 사용자 검토 및 승인을 기다린다.** Merge 미수행.

## Raw diff: HANDOFF.md

```diff
diff --git a/HANDOFF.md b/HANDOFF.md
new file mode 100644
index 0000000..1c7afc1
--- /dev/null
+++ b/HANDOFF.md
@@ -0,0 +1,90 @@
+# HANDOFF
+
+## Task 19 — 논문 우선 이미지 연구 초안과 실험 설계 (2026-09-19)
+
+### 1. 작업 개요
+- 사용자 요구: 논문 작성과 플러그인 개발 병행, 충돌하면 논문 우선. 앞선 이미지 우선·승인 후 영상 확장 방향 유지.
+- 이번 전달 범위: 한국어 논문 초안, 검증된 1차 문헌 표, 이미지 실험 프로토콜과 최소 플러그인 개발 연결표, 문서 탐색/핸드오프 정리.
+- 제외: 실행 코드/의존성 변경, 영상 구현, 실제 모델 실험·과금·데이터셋 업로드, 실험 결과/우월성 주장, PR merge.
+- 기준: `origin/main` / `4e9b7c562b7f08fc24e79e615f68b467cbf8eeda`, 원격 fetch 후 확인. 전용 브랜치 `codex/task-19-image-paper-first`, 이 분리 worktree 사용.
+- 기존 Task 18 브랜치의 HANDOFF.md 및 paired-success 미완료 소스/테스트는 보존. 미완료 Task 18을 이번 작업에 포함하지 않는다.
+- 이 루트 HANDOFF가 첫 작업 문서. 이전 이력: [기존 핸드오프](docs/agent/HANDOFF.md).
+
+### 2. 계획 / 수용 기준
+- [x] 적용 지침/실제 저장소/기존 연구 상태 확인 및 Git 격리.
+- [x] 별도 native `gpt-6-astra` 초기 계획 검토 PASS WITH NOTES. 현재 런타임은 UTF-8 텍스트 처리이며 이미지 backend 없음.
+- [x] 1차 문헌의 제목/연도/URL/지원 주장/전이 한계 확인. 3편은 공식 초록 검색 색인만 확인한 한계 명시.
+- [x] Luna 초안 작성 후 usage limit으로 중단; 지정된 대체 GPT-5.5가 3문서 보완 및 실제 완료 응답. 구현 상태·제안 방법·미측정 결과 분리.
+- [x] 이미지 원본 family 분할, arm 통제, 변환 설정, fallback, 채점/실패 분모, paired 분석, 실제 usage와 bytes 구별, pilot/확증 실험 gate 정의.
+- [x] 각 개발 항목을 논문 증거 요구와 연결. 영상은 후속 범위.
+- [x] 문서 링크/주장/범위 검증 및 프로젝트 gate, Draft PR, post-PR 재검증, Astra 최종 리뷰.
+
+### 3–4. 변경 및 결정
+- 논문에 필요한 연구 질문과 실험 설계를 우선 고정하고 기능 개발은 후속 사용자 승인 Task에서 수행한다.
+- 기존 텍스트 연구 자료는 삭제하지 않고 별도 과거 연구로 연결. 텍스트 테스트/benchmark/mock 결과를 이미지 효과로 전용하지 않는다.
+- 제출처/마감일 질문은 대기 중이며 미지정이면 한국어 연구용 Markdown 초안을 기본으로 한다.
+- RED: 순수 문서 작성이므로 코드 failing test는 해당 없음. 위 수용 기준과 근거/링크 검증을 편집 전 정의했다.
+
+### 5–6. 검증 및 오류 기록
+- 격리 worktree 생성 첫 시도는 ref lock 권한 오류; 동일 명령의 승인된 escalation으로 성공.
+- 초기 targeted baseline `npm.cmd test -- --run tests/research-dataset.test.ts`: 30 PASS / 9 skipped / suite FAIL. 격리 worktree에 local node_modules/typescript/bin/tsc가 없어 CLI suite 준비 실패. 원본 코드 오류로 단정하지 않는다. lockfile 기반 의존성 설치 후 재실행 예정.
+- `npm.cmd ci --ignore-scripts`로 lockfile 의존성 설치 후 동일 targeted baseline 39/39 PASS. 코드/lockfile 변경 없음. 초기 실패 원인 확인 및 환경 복구 완료. 문서/프로젝트 최종 결과는 후속 기록한다.
+
+### 7. 교차 검토
+- Astra: 실제 native `gpt-6-astra` 호출 및 응답 확인. 초기 범위 검토 PASS WITH NOTES; 외부 제공자 리뷰가 아님.
+- Claude Opus 5: 초기 비민감 계획 검토를 정확한 `claude-opus-5`로 요청했으나 조직이 Claude Code 구독 접근을 비활성화했다는 오류로 실패. 실제 모델 사용 목록은 비어 있음; 다른 버전/API 키/유료 접근으로 대체하지 않음. 첫 CLI 시도는 variadic MCP 옵션이 prompt를 소비하여 모델 호출 전 실패했고 인자 경계를 수정하여 위 접근 오류를 확인.
+- Gemini: launcher 있음, GEMINI_API_KEY/GOOGLE_API_KEY 환경값 존재 여부만 확인하여 둘 다 없음. 무료 API 모델/quota 미확립으로 검토 미수행; 유료 fallback 없음.
+- Copilot: launcher 실행 결과 `Cannot find GitHub Copilot CLI`; 검토 미수행.
+- 민감 정보/전체 저장소/전역 설정을 외부 검토에 보내지 않는다.
+
+### 8. 자체 리뷰 / 위험
+- 위험: 개발 완성도를 논문 결과로 오인, 이미지 미지원 기능의 구현 주장, 데이터 누수, 변환 비용 누락, 영상 범위 혼입.
+- 보완: 독립 문헌 검증과 Astra 실제 산출물 리뷰, 원본/source-family/usage 추적을 실험 설계에 포함.
+
+### 9–11. 현재 상태 / 승인 / 다음 작업
+- 현재 상태: Task 19 완료, 최종 Astra PASS WITH NOTES, 사용자 승인 대기. 실제 이미지 결과 표는 작성하지 않는다.
+- 다음 실제 플러그인 구현 Task와 모든 merge는 사용자 승인 전 착수하지 않는다.
+- 최종 Git/PR/검증/미해결 검토 공백은 완료 시 갱신한다.
+
+- 초기 Cross-check status: DEGRADED. 별도 Astra 검토로 보완하며 외부 제공자 성공으로 계산하지 않음.
+
+### 중간 검증 및 문헌 기록
+- 2026-09-19 pre-PR: `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS; `npm.cmd test` 570 PASS / 11 files; `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark` 모두 PASS.
+- 기존 text benchmark 3 scenarios x 20 samples 통과. 이미지/hosted 실험은 NOT RUN, 이번 Task 범위 밖이며 아직 구현되지 않음.
+- native Luna (`gpt-5.6-luna`, worker) 문서 작성 중. 별도 Astra 방법론 검토: 36개 family를 paired 분석 단위로 유지, guard contrast D-C, oracle 누수 차단, assigned-source 동일성, 실패/미실행 구분 권고를 전달.
+- 문헌 6편: ChartQA/ScreenQA ACL 공식 초록과 MetaCompress arXiv:2603.21701v1 초록은 직접 접근. DocVQA/TextVQA/QuietPrune은 공식 CVF 초록의 검색 색인만 확인; CVF 직접 열람403으로 전체 본문 열람을 주장하지 않음. 연구자가 최초 요약에서 접근 방식을 충분히 구분하지 않아 재질의하고 문헌 표에 정정하도록 전달.
+- 기존 본문 보존, 현재 README와 옛 paper/protocol 상단에 연구 방향 변경 및 과거 텍스트 연구 구분 표시.
+
+### 재개 기록 (2026-09-19 22:13 KST)
+- 사용자 재개 지시에 따라 같은 Task 19 / 브랜치 / worktree에서 계속한다. 새 Task나 중복 PR을 만들지 않는다.
+- Luna 첫 작성이 usage limit으로 중단됐으나 3개 초안 파일은 보존돼 있다. 지정된 대체 모델 `gpt-5.5` worker에 이 3개 문서만 소유권을 부여하고 국소 일관성 수정/검증을 요청했다. 실제 완료 여부는 응답과 diff로 확인한다.
+- 재개 targeted 검사 `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS.
+- 마일스톤 외부 검토: 정확한 `claude-opus-5` 비민감 요약 검토를 다시 시도했으나 조직 구독 접근 비활성 오류, models=[]로 실제 모델 호출 미수행. Gemini 키 환경 부재 및 무료 API 미확립, Copilot launcher CLI unavailable을 재확인. Cross-check status: DEGRADED 유지.
+- 빌드가 만든 bundle의 Git 정규화 diff가 없음(exit 0)을 확인하고 해당 파일만 원래 worktree 표현으로 복구했다. 문서만 전달하며 원본 Task 18 변경은 그대로 보존한다.
+
+### 마일스톤 내용 검토와 수정
+- GPT-5.5 worker 실제 완료 응답과 3개 문서 원문을 직접 확인. 범위 내 변환 순서·oracle 접근·D-C 대비·문헌 접근 방식 수정 완료.
+- Astra 첫 마일스톤 판정 CHANGES REQUIRED: major 1건(clean pixels 전면 금지가 clean 조건과 충돌), minor 1건(retry를 별도 slot으로 표현해 primary 분모 모호), minor 1건(핸드오프 상태 갱신 필요).
+- 동일 승인 범위에서 주 에이전트가 국소 수정: clean 조건에는 배정된 clean 입력 허용; 손상 조건의 비배정 clean counterpart는 숨김; full original/fallback은 배정된 variant로 정의. retry는 보조 attempt이며 비용/호출 수에만 추가하고 primary 720/production576 분모 및 원래 실패 판정 유지.
+- 8문서 strict UTF-8/코드 fence/local link 검증 및 staged diff 검사 PASS. 원격 문헌 전체 본문 또는 실험 재현을 검증했다고 주장하지 않음.
+- Astra 수정 재검토: 내용 판정 PASS WITH NOTES, 미해결 blocker/major 없음. 외부 검토 DEGRADED, 초록 수준 출처 확인, 모든 이미지 기능/결과 미구현·미측정이라는 제한 유지. Draft PR/post-PR 및 최종 transport gate는 아직 진행 예정.
+
+### Draft PR 및 post-PR 검증 (2026-09-19 22:20–22:21 KST)
+- 내용 커밋 `1589c3bdc0de1a8d7b4579d23b835e2c62b4eefe` / `docs: draft image-first paper and evaluation protocol` push 성공.
+- [Draft PR #18](https://github.com/kimcheolhui9846/token-context-optimizer/pull/18), base `main`, head `codex/task-19-image-paper-first`, OPEN / Draft 확인. PR 번호와 Task 번호는 별개다. Merge 미수행.
+- PR 생성 후 targeted `npm.cmd test -- --run tests/research-dataset.test.ts`: 39/39 PASS (22:20).
+- PR 생성 후 `npm.cmd test`: 570/570 PASS / 11 files (22:20).
+- PR 생성 후 `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`: 모두 PASS.
+- 기존 benchmark 3 scenarios x 20 samples, p95 exact 1.92ms / semantic 2.27ms / code 1.23ms. 기존 text fixture 회귀 증거이며 image/hosted 결과 아님.
+- 문서 8개 UTF-8/fence/local link 34개 및 staged `git diff --cached --check` PASS. runtime/tests/dependencies 변경 없음. pre-commit 우회 옵션 사용하지 않았으며 설정된 hooksPath/활성 hook 파일 없음.
+- 이미지/실제 API 실험, 신규 이미지 TDD: NOT RUN — 기능 구현 전 연구 문서 Task 범위 밖. 별도 lint/format script는 package.json에 없음.
+- 남은 작업: 이 검증 기록을 같은 PR에 push, 최종 Astra가 실제 diff/PR/latest commit/검증/위험 확인, 사용자 승인 대기.
+
+### 최종 Astra Review Result / 승인 대기
+- 최종 판정: **PASS WITH NOTES**. Astra가 `965177c`의 실제 8문서 diff, HANDOFF, PR 설명/OPEN Draft 상태/latest SHA, clean worktree, 원래 Task 18 보존 상태와 관찰된 post-Draft 검증 근거를 확인했다. 미해결 blocker/major 없음.
+- 원격 `main`은 `4e9b7c5`, Task 브랜치는 `965177c`임을 `git ls-remote`로도 확인. 최종 판정 기록만 추가한 후 동일 PR의 최신 SHA까지 재확인한다.
+- `gh pr checks 18`: no checks reported. Hosted CI 통과를 주장하지 않으며 위 로컬 검증이 실제 증거다.
+- 제한: Cross-check status DEGRADED; 문헌은 초록 수준(3편 검색 색인); 제출처/마감일 미지정; 이미지 구현·dataset·실험 결과 없음. 이 결과는 논문 연구 초안/평가 설계 전달 완료이며 논문 실험 또는 플러그인 기능 완성을 뜻하지 않는다.
+- 이번 Task 파일: 새 논문/프로토콜/출처 3문서와 루트 HANDOFF, README·기존 handoff·역사적 paper/protocol 안내 4문서. 삭제 파일, runtime/test/dependency 변경 없음.
+- 다음 후보: 사용자 검토 후 연구 질문·평가 조건을 확정하고 이를 검증할 이미지 ingest/원본 보존부터 별도 Task로 설계·구현. 논문과 개발의 충돌 시 논문 우선; 영상은 이미지 검증과 별도 승인 후.
+- 승인 게이트: **다음 Task로 진행하지 않고 사용자 검토 및 승인을 기다린다.** Merge 미수행.
```

## Raw diff: README.md

```diff
diff --git a/README.md b/README.md
index 1cfd388..8aadaeb 100644
--- a/README.md
+++ b/README.md
@@ -4,6 +4,11 @@ Codex plugin and local STDIO MCP server for safer token-efficient context handli

 The MVP indexes local UTF-8 text artifacts, records SHA-256 and line source maps, returns bounded source-backed excerpts, and blocks lossy summaries for exact-sensitive content.

+The current research direction is **image context optimization first**, with paper
+writing taking priority over feature development. Image processing is planned; the
+text MVP above is the implemented capability. Video extension follows image
+implementation, evaluation, and explicit user approval.
+
 ## Development

 ```powershell
@@ -101,34 +106,26 @@ record the boundaries and verification process.

 ## Paper And Experiment Plan

-Research status at merged baseline `edf1901` (2026-09-08): design and offline tooling
-exist; the paper draft, live model results and fine-tuning experiment do not yet exist.
-That baseline's engineering gate passed 360 tests. This is not evidence of LLM accuracy,
-hosted latency, billing savings, or a causal benefit from TDD/subagent review.
-
-The proposed paper studies **layered adaptation**: weight changes through fine-tuning,
-workflow instructions through skills, tool access through MCP, and distribution through
-plugins. These are different interventions, not four interchangeable models to rank.
-The [paper plan](docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md)
-covers background, the framework, this implementation, evaluation and limitations.
-Background/design can be drafted now; results require real traces and blinded grading.
-Related-work comparison and novelty assessment are still incomplete.
-
-| Experiment item | Proposed design / current status |
-| --- | --- |
-| First comparison | Full source vs optimizer-selected context; add fixed-chunk context with the same token budget and a gold-evidence diagnostic reference. |
-| Model | Recommended `gpt-4.1-mini-2025-04-14`; access is unverified. Optional `gpt-5.6-luna` replication and same-base fine-tuning remain conditional. See [model evidence](docs/research/2026-09-08-experiment-model-selection.md). |
-| Data | Target 120 independently curated families, split 72 train / 24 development / 24 test. The concrete proposal uses one English and one Korean record per family. Current seed: 24 records in 12 development families, no train/test data; independence is not established by counting IDs. |
-| Evaluation size | Per development or pilot-test split: 24 families x 2 languages x 4 arms x 3 attempts = 576 planned evaluation slots per model. Repeats/translations are correlated, not 576 independent tasks. |
-| Outcomes | Family-paired task success, contradictions and exact fidelity; actual usage/cost and end-to-end latency. Two blinded human raters for semantic outcomes. |
-| Other layers | Separate instruction/skill, MCP transport, plugin installation and fine-tuning contrasts. Host/input equivalence and appropriate analysis units are required. |
-| Execution gate | Frozen data/rubrics/configuration, authorized model access and spending/data upload, tested runner and grading arrangements. No paid inference or training is authorized by this README. |
-
-The [detailed protocol](docs/research/2026-09-07-layered-adaptation-evaluation-protocol.md#concrete-first-experiment)
-defines arms, counts, missing-data handling, analysis and stop conditions. The
-[readiness checklist](docs/research/2026-09-07-layered-adaptation-evaluation-protocol.md#readiness-and-acceptance)
-distinguishes implemented tooling from remaining work. Pilot findings guide design;
-confirmatory claims require a separately sized and untouched dataset.
+Start with the [Korean image-first paper draft](docs/research/image-first-paper-draft.ko.md),
+the [image evaluation protocol and development roadmap](docs/research/image-first-evaluation-protocol.md),
+and the [primary-source register](docs/research/image-first-sources.md).
+
+The draft proposes artifact-aware external image processing for document, chart,
+and UI questions. It contains no measured image results. The protocol links each
+planned plugin capability to the evidence needed by the paper; stable experiment
+requirements can guide development while writing continues. If priorities conflict,
+the paper's research question and evaluation requirements take precedence.
+
+Image bytes, internal visual tokens, provider-reported usage, and monetary cost are
+different measurements. Neither existing text tests nor future image fixture tests
+alone establish hosted answer quality or billing savings. Model selection, access,
+data rights, privacy, and budget must be settled before hosted experiments.
+
+The earlier [layered-adaptation paper plan](docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md)
+and [text experiment protocol](docs/research/2026-09-07-layered-adaptation-evaluation-protocol.md)
+remain historical, separate research records. Their model recommendations, dataset
+sizes, mock traces, and engineering results are not image-study evidence. Existing
+text functionality and regression checks remain in place.

 ## Superpowers Use

```

## Raw diff: docs/agent/HANDOFF.md

```diff
diff --git a/docs/agent/HANDOFF.md b/docs/agent/HANDOFF.md
index 44ce55b..8d01f1a 100644
--- a/docs/agent/HANDOFF.md
+++ b/docs/agent/HANDOFF.md
@@ -2,6 +2,28 @@

 ## Current Objective

+Task 19 (2026-09-19) prioritizes an image-first Korean paper draft, a primary-source
+register, and an image evaluation protocol linked to minimum plugin capabilities.
+See [root HANDOFF](../../HANDOFF.md) for current review, validation, Git/PR state,
+and [paper draft](../research/image-first-paper-draft.ko.md) for the research entry.
+This is documentation only: the runtime remains text-only, image results are
+unmeasured, and video development waits for image validation and user approval.
+The document package is delivered through [Draft PR #18](https://github.com/kimcheolhui9846/token-context-optimizer/pull/18)
+against `main`. Post-Draft checks on 2026-09-19 passed 39 targeted and 570 total
+tests, build, typecheck, MCP smoke, plugin validation, and existing text benchmark.
+These checks establish regression coverage, not empirical image performance.
+Final native Astra review returned PASS WITH NOTES; external cross-check remains
+DEGRADED and source verification is abstract-level. Task 19 awaits user approval
+before the next implementation Task. The final evidence record is in root HANDOFF.
+The Task 18 dirty checkout is preserved separately; its uncompleted implementation
+is neither included nor claimed complete here. No merge is authorized.
+
+## Historical Checkpoint Before Task 19
+
+The following record predates the verified merge of PR #14 into `main` at
+`4e9b7c562b7f08fc24e79e615f68b467cbf8eeda`, the base of Task 19. Its pending-merge
+language is retained as history rather than the current PR state.
+
 The offline mock-runner implementation is complete and PR #14 has been pushed
 and updated for review, not merged. Final whole-branch review at `4b61277`
 returned architect CLEAR and two code-review findings; fix `b290748` resolved
```

## Phase-2 migration checkpoint (2026-09-29)

- User approved the image-stack plan and the README conflict resolution. Main was merged, without rebase or force-push. README retains image research navigation, identifies layered adaptation as the earlier text proposal, preserves the exact six-line literature paragraph restored by PR #24, and retains implemented paired-success diagnostic guidance.
- The original root/shared/README history above is archival: its old pending Task 18 state and gate counts are not current status. PR #23 and #24 are now merged. The current shared HANDOFF is identical to main; root HANDOFF stays local and ignored after removal from the index.
- Normalization: original root relative link relocated; trailing spaces (including blank context lines in raw diffs) stripped. Added/deleted content is preserved. Raw-diff links are historical literal text, not live navigation.
- RED: not applicable to this documentation-only migration. Acceptance checks cover original-line conservation, live links, exact literature paragraph, five original research files unchanged, and no runtime/test/dependency delta against main.
- Pre-push gate: npm.cmd test — 665 passed, 12 files, 22.50s. npm.cmd run build, typecheck, smoke:mcp, validate:plugin, benchmark — all exit 0; benchmark passed all three scenarios. Build preceded typecheck. PNG/JPEG-specific tests do not exist in this documentation stage; no image experiment was run.
- Provider evidence: initial plan review was supplied by the user as Claude Code review; exact model unverified. Primary Luna implementation agent stopped on usage limit. The configured GPT-5.5 fallback produced the README/archive edits before session interruption; no final agent verdict was received. Astra inspected the actual artifacts. No new external milestone review claimed; Claude review remains the user's next checkpoint. Gemini free eligibility and Copilot callable access were not established in this stage (NOT RUN); cross-check status DEGRADED for the migration milestone.
- Deferred scope: F-06, F-07, F-29 and S-14 await a separate paper Task after stack merges. F-15 and applicable F-28 belong to PR #19; F-13/F-14/S-01 and F-08/applicable F-28 to PR #21. F-34 is approved for PR #21: untrack the two .omx artifacts, retain local copies, add /.omx/. None of those later changes is implemented here.
- Remaining: final archive/link checks, commit/push to existing Draft PR #18, post-update gate and merge-tree report, user/Claude review. Do not merge #18 or proceed to #19 without the next approval.

## Final migration verification (2026-09-29)

- Migration commit: 87e2d7a, pushed to existing OPEN Draft PR #18, base main. Author and committer both kim cheol hui <144594976+kimcheolhui9846@users.noreply.github.com>.
- Independent Astra artifact check: normalized full original root archive and full shared/README diffs matched; root 90 lines, shared +22/-0, README +25/-28. 19 live local links passed. Five original research documents unchanged; current literature paragraph exact. Current shared HANDOFF equals main. Root HANDOFF exists locally, is ignored and untracked; no .omx files tracked in this PR.
- Post-push gate on 87e2d7a: npm.cmd test 665/665, 12 files, 22.68s; npm.cmd run build -> typecheck -> smoke:mcp -> validate:plugin -> benchmark all exit 0. Benchmark passed true for all three scenarios. PowerShell labels esbuild stderr as NativeCommandError in captured build log; native build exit was 0 and the generated bundle hash matches main (0db862473085dba796bc38e4c74299df6e16e4d1).
- git merge-tree --write-tree origin/main HEAD: exit 0, no conflicts (main 6c2b05e).
- git merge-tree --write-tree HEAD codex/task-20-png-ingest: exit 1; root HANDOFF modify/delete and shared docs/agent/HANDOFF.md content conflicts only. README auto-merges. This is a preview; the child branch was not modified. Resolve its own record migration in the next approved stage, never revive tracked root HANDOFF.
- Main-relative changed files: README.md; docs/agent/handoffs/task-19.md; docs/research/2026-09-07-layered-adaptation-evaluation-protocol.md; docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md; docs/research/image-first-evaluation-protocol.md; docs/research/image-first-paper-draft.ko.md; docs/research/image-first-sources.md. No runtime, tests, scripts, package or bundle changes.
- Astra verdict: PASS WITH NOTES for approved record migration; milestone external cross-check remains DEGRADED/pending user-run Claude review. No claim that deferred paper findings or future PNG/JPEG fixes are resolved. No PR merge or next Task performed. Subsequent evidence-only commit records these observed results; only documentation checks need repeating for that appendix.
