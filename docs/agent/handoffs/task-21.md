PR: #20 | Branch: codex/task-21-jpeg-ingest | Base: main (7898ed6), incorporated with git merge

# Task 21 Handoff Archive

## Scope

- Original parent: `856a417158ffa259b39153efbc140a8900e24993`.
- Original Task 21 head: `7ee618d67e89b26fcc8107170e1722d37711b1aa`.
- This archive preserves the Task 21 additions that were carried in the root and shared handoff files before the migration to the main version.
- Task 21 is a JPEG codec feasibility/design delivery. JPEG runtime support remains unimplemented; F29 and implementation are outside this migration.
- Task 19 and Task 20 archives remain inherited and unchanged.

## Merge Resolution Notes

- `HANDOFF.md` is not restored. Its Task 21 additions are preserved below as literal raw diff text.
- `docs/agent/HANDOFF.md` is restored to the exact `main` version. Its Task 21 additions are preserved below as literal raw diff text.
- The raw diff is historical evidence. Trailing whitespace is trimmed from each archived line; Markdown links inside the fences are intentionally not live links.

## Preservation Counts

- `HANDOFF.md`: +54 / -0 from `856a417..7ee618d`.
- `docs/agent/HANDOFF.md`: +19 / -0 from `856a417..7ee618d`.
- `README.md`: unchanged.

## Raw Diff: HANDOFF.md

```diff
diff --git a/HANDOFF.md b/HANDOFF.md
index e9ad707..c45ca69 100644
--- a/HANDOFF.md
+++ b/HANDOFF.md
@@ -1,5 +1,59 @@
 # HANDOFF
+## Task 21 — JPEG 입력 확장 계약과 실행 가능성 (2026-09-21)
+
+### 1. 목적 / 요구 / 범위
+- 사용자가 Task20 검토 완료 및 다음 Task 진행을 승인함. 논문 우선, 이미지 이후 영상 확장 원칙 유지.
+- 목표: 논문 JPEG-only/combined 조건의 선행 기능인 M1b 제한 JPEG ingest/inspect의 구체적 계약과 검증 경로를 확정한다.
+- 우선 조사: strict decode/entropy 소비, 자원 제한, JFIF/EXIF/ICC 처리, 기존 PNG/API/네 runtime 파일 계약 호환성. 라이브 모델/데이터 업로드/영상/원본 쓰기/PR merge는 제외.
+- base `856a417158ffa259b39153efbc140a8900e24993` / `origin/codex/task-20-png-ingest`; branch `codex/task-21-jpeg-ingest`; 별도 worktree. Task18 dirty와 Task19/20 branch/PR 보존.
+- 설계 확정 전 runtime/의존성 변경 없음. 최종 구현 여부는 실제 codec 검증과 검토 가능한 설계 승인 경계에 따라 결정한다.
+
+### 2. 계획 / 수용 기준
+- [x] 적용 지침/기존 소스/논문/PR 상태 확인 및 Git 격리. root HANDOFF를 첫 산출물로 갱신.
+- [x] Astra 실제 요구 분석: JPEG 입력 우선 권고; PNG 변환은 쓰기/보간/provenance 계약 추가, manifest만으로는 입력 갭 해결 불가.
+- [x] codec 공식 소스와 최소 독립 재현으로 strict 한계 확인. 최대 자원/신규 배포 호환성은 후속 구현 gate로 구분.
+- [x] 구체적 프로필/오류/형식별 record/MCP/회귀 기준 설계 및 초기 외부 교차검토 시도(DEGRADED).
+- [x] 검토 결과·모델·실행 명령·미검증 항목 기록, milestone 검토 및 프로젝트 gate.
+- [x] Task별 commit/push/Draft PR/post-Draft gate/최종 Astra 리뷰; 다음 Task는 사용자 승인 후.
+
+### 3–4. 결정 / 위험
+- 기존 두 image MCP 도구와 PNG record를 유지하고 JPEG만 구분된 프로필로 확장하는 방안 우선.
+- EXIF/ICC/Adobe metadata와 progressive/CMYK 등의 폭넓은 지원, native 배포 개편은 이번 최소 범위에 포함하지 않음.
+- decoder가 pixels를 반환했다는 사실만으로 완전한 JPEG 검증을 주장하지 않음. `jpeg-js` v0.4.4 strict 옵션만으로 전체 소비 계약을 충족하지 못함을 실제 재현함. 독립 entropy 검증기 방식은 승인 전 제안이며 아직 구현/안전성 증명되지 않음.
+
+### 5–7. 검증 / 오류 / 교차 검토
+- Git fetch와 worktree 생성은 첫 sandbox 권한 오류 후 동일 명령 escalation 재실행 성공. 기존 파일을 stash/reset하지 않음.
+- Astra 요구 분석 호출 성공. 외부 provider와 구현 모델은 이번 Task 실행 시 새로 확인한다. 이전 성공/실패를 새 호출 성공으로 표현하지 않음.
+- 코드 구현 전 설계/조사 단계: RED는 아직 해당 없음; 재현 probe의 관찰과 코드 TDD를 구분한다.
+
+### 8–11. 상태 / 다음 단계 / 승인
+- 재개 후 실제 Astra 분석 응답 확인: Task21을 설계·실행 가능성 산출물로 권고. 독립 entropy 검증 없는 strict wrapper는 완료 기준을 충족하지 못함.
+- [설계 제안](docs/superpowers/specs/2026-09-21-jpeg-ingest-design.md)과 [codec 실험 결과](docs/research/jpeg-codec-feasibility.md) 작성. production 코드/의존성 변경 없음. 문서 작업이므로 RED 비해당; 수용 검사는 근거 대조·링크·범위 일관성·기존 프로젝트 gate로 정의함.
+- 초기 외부 재확인: Claude `claude-opus-5` 호출은 조직 subscription access 비활성 오류(models=[]), Gemini key 존재 false/free API 사용 미확립으로 미수행, Copilot launcher는 Cannot find GitHub Copilot CLI. **Cross-check status: DEGRADED**. native Astra 응답을 외부 제공자 검토로 계산하지 않음.
+- `npm.cmd ci --ignore-scripts` 성공 후 초기 image baseline 18 PASS / Windows FIFO 1 skip. 재개 후 codec probe 성공: strict에서도 EOI 전/후 junk와 잘못된 SOF length 수락 재현; 8가지 입력 관찰과 작은 자원 제한 오류 기록. 구현 TDD나 최대 입력 안전성 증거는 아님.
+- milestone Astra: 설계 산출물 PASS WITH NOTES, blocker/major 없음. 정확한 probe script/fixture가 PR에 없는 재현성 한계와 외부 검토 공백을 명시.
+- pre-PR gate: targeted 18 PASS/1 Windows FIFO skip; full 588 PASS/1 skip/14 files. build/typecheck/smoke:mcp/validate:plugin/benchmark 모두 PASS. text benchmark 결과이며 이미지 효과 아님. production diff 없음.
+- 진행 중: 설계 검증 완료 후 Git/PR 전달 및 최종 검토. 사용자는 다음 Task 진행을 승인했으며 PR merge는 승인하지 않음.
+- runtime 변경 전 남은 계약을 실제 근거로 정리한다. 조사로 요구되는 추가 설계/범위 선택은 구체적 산출물을 준비한 뒤 제시한다.
+- 과거 Task20 기록은 아래 보존하고 현재 상태는 위 섹션을 기준으로 한다.
+
+### Draft PR / post-Draft 검증
+- commit `f8be67c643a5e09e9c489e6c2cadec075befdb82` push 성공. Draft PR #20은 `codex/task-20-png-ingest`를 base로 OPEN/Draft였으며 PR18/19/20 merge 미수행.
+- PR 생성 후 targeted 18 PASS/1 Windows FIFO skip; full 588 PASS/1 skip/14 files.
+- build, typecheck, smoke:mcp, validate:plugin, benchmark 모두 PASS. text benchmark이며 이미지 모델/효과/최대 JPEG 자원 검증은 NOT RUN.
+- 외부 교차검토는 Claude 조직 접근 오류, Gemini free API 미확립, Copilot CLI unavailable로 DEGRADED. UTF-8 문서/로컬 링크와 `git diff --check` PASS.
+- 자체 리뷰: strict false-accept 관찰과 제안 계약을 구분하며 기존 runtime·원본·의존성을 보존한다. 취약한 입력 검사/자원 상한은 아직 구현되지 않았으므로 안전성 완료 주장을 하지 않는다.
+- 남은 사용자 결정: 제한 4:4:4/JFIF 프로필과 독립 entropy 검증기 방식 승인. 이번 문서 전달에서 JPEG runtime을 구현했다고 보고하지 않음.
+- 최종 Astra 리뷰 **PASS WITH NOTES**: 실제 diff/HEAD/upstream/PR/문서·요구사항을 직접 확인. blocker/major 없음. 테스트는 기록 대조이며 reviewer가 재실행했다고 주장하지 않음.
+- 최종 상태: Task21 설계·조사 전달 완료, 사용자 설계 승인 대기. 영상과 JPEG runtime 구현은 미수행. Task18 dirty HANDOFF/paired-success untracked 파일은 보존.
```

## Raw Diff: docs/agent/HANDOFF.md

```diff
diff --git a/docs/agent/HANDOFF.md b/docs/agent/HANDOFF.md
index 6a17622..ad3bf15 100644
--- a/docs/agent/HANDOFF.md
+++ b/docs/agent/HANDOFF.md
@@ -2,6 +2,25 @@
 ## Current Objective
+Task 20 was approved by the user. Active Task 21 is the restricted JPEG design and codec feasibility delivery on `codex/task-21-jpeg-ingest`, based on Task 20 `856a417`. See the proposed design, probe evidence, and root HANDOFF.
+JPEG runtime support is not implemented. The proposed independent entropy validator requires design approval before implementation. Existing PNG support, paper-first priority and subsequent video work remain unchanged. No merge is authorized.
+Draft PR #20 is OPEN against the Task20 branch. Post-Draft image tests passed 18 with one Windows FIFO skip; the full suite passed 588 with one skip, plus build, typecheck, installed MCP smoke, plugin validation and text benchmark.
+External review is DEGRADED; native Astra design milestone passed with notes. Final Astra review of `61205b1` returned PASS WITH NOTES after directly checking the diff, clean tree, upstream and Draft PR/latest SHA. Only review bookkeeping follows that verdict. Task21 is complete as a design delivery and awaits user approval of the restricted profile and independent entropy-validator approach.

 ## Task 20 archive
```

## Verification

- This migration is documentation-only; RED is not applicable.
- The shared handoff is restored byte-for-byte to `origin/main`.
- JPEG runtime, F29, and the Task 21 research/design documents are not changed by this archive migration.
## Exact normalized raw diff

```diff
+diff --git a/HANDOFF.md b/HANDOFF.md
index e9ad707..c45ca69 100644
--- a/HANDOFF.md
+++ b/HANDOFF.md
@@ -1,5 +1,59 @@
 # HANDOFF

+## Task 21 — JPEG 입력 확장 계약과 실행 가능성 (2026-09-21)
+
+### 1. 목적 / 요구 / 범위
+- 사용자가 Task20 검토 완료 및 다음 Task 진행을 승인함. 논문 우선, 이미지 이후 영상 확장 원칙 유지.
+- 목표: 논문 JPEG-only/combined 조건의 선행 기능인 M1b 제한 JPEG ingest/inspect의 구체적 계약과 검증 경로를 확정한다.
+- 우선 조사: strict decode/entropy 소비, 자원 제한, JFIF/EXIF/ICC 처리, 기존 PNG/API/네 runtime 파일 계약 호환성. 라이브 모델/데이터 업로드/영상/원본 쓰기/PR merge는 제외.
+- base `856a417158ffa259b39153efbc140a8900e24993` / `origin/codex/task-20-png-ingest`; branch `codex/task-21-jpeg-ingest`; 별도 worktree. Task18 dirty와 Task19/20 branch/PR 보존.
+- 설계 확정 전 runtime/의존성 변경 없음. 최종 구현 여부는 실제 codec 검증과 검토 가능한 설계 승인 경계에 따라 결정한다.
+
+### 2. 계획 / 수용 기준
+- [x] 적용 지침/기존 소스/논문/PR 상태 확인 및 Git 격리. root HANDOFF를 첫 산출물로 갱신.
+- [x] Astra 실제 요구 분석: JPEG 입력 우선 권고; PNG 변환은 쓰기/보간/provenance 계약 추가, manifest만으로는 입력 갭 해결 불가.
+- [x] codec 공식 소스와 최소 독립 재현으로 strict 한계 확인. 최대 자원/신규 배포 호환성은 후속 구현 gate로 구분.
+- [x] 구체적 프로필/오류/형식별 record/MCP/회귀 기준 설계 및 초기 외부 교차검토 시도(DEGRADED).
+- [x] 검토 결과·모델·실행 명령·미검증 항목 기록, milestone 검토 및 프로젝트 gate.
+- [x] Task별 commit/push/Draft PR/post-Draft gate/최종 Astra 리뷰; 다음 Task는 사용자 승인 후.
+
+### 3–4. 결정 / 위험
+- 기존 두 image MCP 도구와 PNG record를 유지하고 JPEG만 구분된 프로필로 확장하는 방안 우선.
+- EXIF/ICC/Adobe metadata와 progressive/CMYK 등의 폭넓은 지원, native 배포 개편은 이번 최소 범위에 포함하지 않음.
+- decoder가 pixels를 반환했다는 사실만으로 완전한 JPEG 검증을 주장하지 않음. `jpeg-js` v0.4.4 strict 옵션만으로 전체 소비 계약을 충족하지 못함을 실제 재현함. 독립 entropy 검증기 방식은 승인 전 제안이며 아직 구현/안전성 증명되지 않음.
+
+### 5–7. 검증 / 오류 / 교차 검토
+- Git fetch와 worktree 생성은 첫 sandbox 권한 오류 후 동일 명령 escalation 재실행 성공. 기존 파일을 stash/reset하지 않음.
+- Astra 요구 분석 호출 성공. 외부 provider와 구현 모델은 이번 Task 실행 시 새로 확인한다. 이전 성공/실패를 새 호출 성공으로 표현하지 않음.
+- 코드 구현 전 설계/조사 단계: RED는 아직 해당 없음; 재현 probe의 관찰과 코드 TDD를 구분한다.
+
+### 8–11. 상태 / 다음 단계 / 승인
+- 재개 후 실제 Astra 분석 응답 확인: Task21을 설계·실행 가능성 산출물로 권고. 독립 entropy 검증 없는 strict wrapper는 완료 기준을 충족하지 못함.
+- [설계 제안](docs/superpowers/specs/2026-09-21-jpeg-ingest-design.md)과 [codec 실험 결과](docs/research/jpeg-codec-feasibility.md) 작성. production 코드/의존성 변경 없음. 문서 작업이므로 RED 비해당; 수용 검사는 근거 대조·링크·범위 일관성·기존 프로젝트 gate로 정의함.
+- 초기 외부 재확인: Claude `claude-opus-5` 호출은 조직 subscription access 비활성 오류(models=[]), Gemini key 존재 false/free API 사용 미확립으로 미수행, Copilot launcher는 Cannot find GitHub Copilot CLI. **Cross-check status: DEGRADED**. native Astra 응답을 외부 제공자 검토로 계산하지 않음.
+- `npm.cmd ci --ignore-scripts` 성공 후 초기 image baseline 18 PASS / Windows FIFO 1 skip. 재개 후 `node .artifacts/task21-codec-probe/probe.cjs` 성공: strict에서도 EOI 전/후 junk와 잘못된 SOF length 수락 재현; 8가지 입력 관찰과 작은 자원 제한 오류 기록. 구현 TDD나 최대 입력 안전성 증거는 아님.
+- milestone Astra: 설계 산출물 PASS WITH NOTES, blocker/major 없음. minor(profile literal, Huffman 정책, stale 진행 상태) 반영. 정확한 probe script/fixture가 PR에 없는 재현성 한계 명시. 외부 검토 공백과 parser/자원 증명은 후속 gate.
+- pre-PR gate 2026-09-21 10:19–10:20 KST: targeted 18 PASS/1 Windows FIFO skip; full 588 PASS/1 skip/14 files. build/typecheck/smoke:mcp/validate:plugin/benchmark 모두 PASS. text benchmark 3×20 결과이며 이미지 효과 아님. production diff 없음.
+- 진행 중: 설계 검증 완료 후 Git/PR 전달 및 최종 검토. 사용자는 다음 Task 진행을 승인했으며 PR merge는 승인하지 않음.
+- runtime 변경 전 남은 계약을 실제 근거로 정리한다. 조사로 요구되는 추가 설계/범위 선택은 구체적 산출물을 준비한 뒤 제시한다.
+- 과거 Task20 기록은 아래 보존하고 현재 상태는 위 섹션을 기준으로 한다.
+
+### Draft PR / post-Draft 검증
+- commit `f8be67c643a5e09e9c489e6c2cadec075befdb82` push 성공. [Draft PR #20](https://github.com/kimcheolhui9846/token-context-optimizer/pull/20), OPEN/Draft, base `codex/task-20-png-ingest`; PR18/19/20 merge 미수행.
+- 2026-09-21 10:22 KST PR 생성 후 `npm.cmd test -- --run tests/image-artifacts.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts`: 18 PASS/1 Windows FIFO skip. `npm.cmd test`: 588 PASS/1 skip/14 files.
+- 같은 post-Draft 실행에서 `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark` 모두 PASS. text benchmark 3×20, p95 1.42/1.61/1.03ms. 이미지 모델/효과/최대 JPEG 자원 검증 NOT RUN(설계 범위 밖).
+- milestone 외부 교차검토 재시도도 Claude 조직 접근 오류(models=[]), Gemini free API 접근 미확립, Copilot CLI unavailable로 DEGRADED. Astra 독립 설계 검토와 실제 회귀 검증으로 문서 산출물 위험을 확인했으나 외부 검토 공백은 남음.
+- UTF-8 문서4개/로컬 링크15개 PASS; 첫 node inline 검사는 PowerShell quoting으로 SyntaxError여서 성공 처리하지 않고 PowerShell 검사를 다시 실행함. `git diff --check` PASS. build 후 bundle Git blob hash는 HEAD와 동일 `1b139e039463622d361aad3706ebcf0de0328fe6`; 내용 변경 없음.
+- 자체 리뷰: strict false-accept 관찰과 제안 계약을 구분하며 기존 runtime·원본·의존성 보존. 취약한 입력 검사/자원 상한은 아직 구현되지 않았으므로 안전성 완료 주장을 하지 않음. 정확한 probe 재현물은 로컬 scratch에만 있다는 전달 한계를 명시함.
+- 남은 사용자 결정: 설계 문서의 제한 4:4:4/JFIF 프로필과 독립 entropy 검증기 방식 승인. 이후 구현 계획/TDD로 진행하며 이번 문서 전달에서 JPEG runtime을 구현했다고 보고하지 않음.
+- 최종 Astra 리뷰 **PASS WITH NOTES**: `61205b1fdd779c34c67e0cc7863b008087a2b2f5`의 실제 4문서 diff(158 additions), HEAD/upstream 일치, clean worktree, PR20 OPEN/Draft/base/latest SHA와 문서·요구사항을 직접 확인. blocker/major 없음. 테스트는 주 에이전트가 실행했고 reviewer는 기록을 대조했으며 재실행했다고 주장하지 않음. 이 판정/체크리스트 기록만 후속 행정 커밋으로 추가함.
+- 최종 상태: Task21 설계·조사 전달 완료, 사용자 설계 승인 대기. PR 설명에 post-Draft 완료 반영. 영상과 JPEG runtime 구현은 미수행. 원래 Task18 dirty HANDOFF/paired-success 두 untracked 파일 보존을 직접 재확인.
+
+---
+
+## Task 20 archive
+# HANDOFF
+
 ## Task 20 — PNG 입력과 원본 보존 (2026-09-20)

 ### 1. 목적 / 승인 / 범위
diff --git a/docs/agent/HANDOFF.md b/docs/agent/HANDOFF.md
index 6a17622..ad3bf15 100644
--- a/docs/agent/HANDOFF.md
+++ b/docs/agent/HANDOFF.md
@@ -2,6 +2,25 @@

 ## Current Objective

+Task 20 was approved by the user. Active Task 21 is the restricted JPEG
+design and codec feasibility delivery on `codex/task-21-jpeg-ingest`, based on
+Task 20 `856a417`. See the [proposed design](../superpowers/specs/2026-09-21-jpeg-ingest-design.md),
+[probe evidence](../research/jpeg-codec-feasibility.md), and [root HANDOFF](../../HANDOFF.md).
+JPEG runtime support is not implemented. The proposed independent entropy
+validator requires design approval before implementation. Existing PNG support,
+paper-first priority and subsequent video work remain unchanged. No merge is authorized.
+Draft [PR #20](https://github.com/kimcheolhui9846/token-context-optimizer/pull/20)
+is OPEN against the Task20 branch. Post-Draft image tests passed 18 with one
+Windows FIFO skip; the full suite passed 588 with one skip, plus build,
+typecheck, installed MCP smoke, plugin validation and text benchmark.
+External review is DEGRADED; native Astra design milestone passed with notes.
+Final Astra review of `61205b1` returned PASS WITH NOTES after directly checking
+the diff, clean tree, upstream and Draft PR/latest SHA. Only review bookkeeping
+follows that verdict. Task21 is complete as a design delivery and awaits user
+approval of the restricted profile and independent entropy-validator approach.
+
+## Task 20 archive
+
 Task 20 (2026-09-20) follows the user's approval of Task 19 and implements partial
 M1a restricted PNG ingestion and inspection. See the [input contract](../image-artifacts.md)
 and [root HANDOFF](../../HANDOFF.md) for active implementation and validation state.
```
