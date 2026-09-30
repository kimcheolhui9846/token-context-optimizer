# Task 22 Handoff Archive

## Scope

- Original parent: `7ee618d67e89b26fcc8107170e1722d37711b1aa`.
- Original Task 22 head: `d17cc57`.
- This archive preserves the Task 22 additions carried in the original root/shared handoffs and README before migration to the main version.
- Runtime implementation, tests, package/bundle/license changes, research documents, and other Task 22 files remain in the parent migration scope; this archive is record preservation only.
- Task 19, Task 20, and Task 21 archives remain inherited and unchanged.

## Merge Resolution Notes

- `HANDOFF.md` is not restored. Its Task 22 additions are preserved below as literal raw diff text.
- `docs/agent/HANDOFF.md` is restored to the exact `main` version. Its Task 22 additions are preserved below as literal raw diff text.
- The README delta is preserved below exactly as a raw diff block; no unrelated README change is introduced.
- The raw diff is historical evidence. Trailing whitespace is trimmed from each archived line while blank lines are retained.

## Preservation Counts

- `HANDOFF.md`: +124 / -0 from `7ee618d..d17cc57`.
- `docs/agent/HANDOFF.md`: +29 / -0 from `7ee618d..d17cc57`.
- `README.md`: +6 / -1 from `7ee618d..d17cc57`.

## Raw Diff: HANDOFF.md, docs/agent/HANDOFF.md, README.md

```diff
diff --git a/HANDOFF.md b/HANDOFF.md
index c45ca69..260df3f 100644
--- a/HANDOFF.md
+++ b/HANDOFF.md
@@ -1,5 +1,115 @@
 # HANDOFF

+## Task 22 — restricted JPEG runtime (2026-09-27)
+
+This section is current; checkpoint records below are historical.
+
+### 1. 작업 개요
+- 목적: 승인된 JFIF/4:4:4 baseline JPEG index/inspect를 PNG와 함께 지원한다. 논문 우선, 이미지 이후 영상 원칙 유지.
+- 범위: 독립 구조/Huffman/entropy 검증, 원본·경로·hash·store 계약, 메모리 예산, MCP/배포/fixture/기술 문서.
+- 제외: 이미지 변환·OCR·모델 평가·영상·native runtime 의존성·PR merge.
+- branch codex/task-22-jpeg-runtime; base Task21 7ee618d67e89b26fcc8107170e1722d37711b1aa. 원래 Task18 dirty worktree 보존.
+- 현재 상태: JFIF 결함 수정 후 Astra SPEC/QUALITY PASS WITH NOTES. commit d9dc91b push 및 Draft PR21 OPEN 완료. post-Draft gate PASS, 최종 Astra PASS WITH NOTES (181d8c2 직접 검토). Task22 완료, 사용자 다음 Task 승인 대기.
+
+### 2. 작업 계획
+- [x] 승인 설계/격리/초기 HANDOFF/계획 및 provider checkpoint.
+- [x] 제한 JPEG 구현, 독립 fixture, entropy·resource·MCP·license 검증.
+- [x] 실제 Node22 실행, 생산 의존성 감사, pre-PR project gate.
+- [x] JFIF major 수정 재검토, commit/push/Draft PR, post-Draft gate.
+- [x] 최종 Astra Git/PR 검토 및 완료 보고 준비.
+
+### 3. 변경 사항
+- jpeg-validation.ts, image record/dispatcher/MCP schema, jpeg-js0.4.4 pin/lock, generated bundle.
+- 합성 entropy/table/메모리 경계와 sharp 독립 fixture, provenance/generator, source/identity/schema 테스트.
+- build notices, MCP smoke, Node22 production measurement script, 입력 계약과 논문 구현 상태 문서.
+- 구현 계획의 extra block column 오기를 실제 codec 소스에 맞게 수정. 승인 범위는 유지.
+
+### 4. 주요 의사결정
+- 원본 codec을 수정하지 않고, 전체 scan 소비를 독립 검증한 뒤 strict RGB decode한다.
+- codec accounting = 960*ceil(w/8)*ceil(h/8)+6*w*h+256*Q+sum(16+H); unused tables 포함, 128MiB 초과 거절. RSS 보장은 아님.
+- sharp는 fixture 생성용 ignored scratch 의존성이다. 실제 runtime native dependency 추가 없음.
+
+### 5. 테스트 및 검증
+- 2026-09-27 pre-PR: image/JPEG 8 suites 77 PASS / Windows FIFO 1 skip; full 19 suites 647 PASS / 1 skip.
+- npm.cmd run build / typecheck / validate:plugin PASS. 실제 Node22.23.2 scripts/smoke-mcp.mjs PASS. benchmark passed=true (기존 text benchmark이며 이미지 효과 증거 아님).
+- npm.cmd audit --omit=dev --json: production vulnerabilities 0. 최초 sandbox network 실패 후 동일 명령 허용된 retry 성공.
+- 실제 Node22 production validator 계측: flat RGB square2528 accepted, accounting134207044; square2529 jpeg_resource_limit, accounting134845066. 상한134217728. 이번 측정670.60/2.38ms, maxRSS272884/49544 KiB. 동시 테스트 부하가 있었으며 portable worst-case 보장 아님.
+- JFIF 수정 후 관련8suites 83 PASS/1skip 및 실제 Node22 smoke PASS. 2026-09-27 17:50 KST post-Draft: targeted83PASS/1skip, full653PASS/1skip/19files, build/typecheck/actualNode22smoke/validate:plugin/benchmark PASS. gh pr checks: no checks reported. [상세 검증](docs/research/jpeg-runtime-validation.md).
+
+### 6. 오류 및 해결 기록
+- 초기 entropy byte-count stub, resource 과소 산정, 구조/error mapping 및 부정확한 테스트 증거 발견 후 수정.
+- synthetic DHT descriptor, ZRL overflow, grouped tables, 실제 MCU boundary, profile/schema와 독립 fixture 회귀를 직접 대조하고 보완.
+- Luna 사용량 제한 실제 발생 후 지정된 GPT-5.5 fallback으로 진행; reset 후 Luna 실행 재확인. 모델 선택은 native launch metadata, 실제 도구 실행으로 확인.
+- 작업자의 Node22 absent 주장은 실제 version/smoke 실행으로 반증. Apache 다운로드가 중단되어 기존 TypeScript package의 완전한 Apache2 license를 사용하는 안전한 로컬 경로로 보완.
+- Astra 재현 major: ASCII decoding이 high bits를 제거하여 변조 JFIF identifier를 수락. 정확한 byte 비교와 5개 high-bit/1개 wrong-letter RED 회귀 수정 완료.
+
+### 7. 다중 모델 교차 검토
+- Claude: initial exact claude-opus-5 실제 응답 성공. 최소 비민감 계획 요약 검토이며 source audit 아님. strict options/accounting/구조/license 의견을 실제 코드에 대조하여 채택; base64 조언은 path-only API라 비적용.
+- Claude milestone: source excerpt 검토 두 번(제한된 sandbox/retry) 시간 초과, 모델 응답 없음. 검토 미수행.
+- Gemini: 무료 API 접근 미확립/API key presence false; 미수행. Copilot: launcher가 CLI unavailable 보고; 미수행.
+- Initial provider Claude Code Opus5; milestone Cross-check status: DEGRADED. Native Astra는 별도 내부 독립 검토이며 외부 provider로 계산하지 않음.
+- Astra precommit SPEC/QUALITY: 최초 JFIF major 재현 후 정확한 byte 비교·회귀 테스트 수정; scoped 재검토 PASS WITH NOTES. 미해결 blocker/major 없음. protocol M1 표의 stale status minor 최종 정리.
+
+- 최종 actual Astra는181d8c224997607f097df004dd5db37dc8b48196의 diff/HEAD=upstream/clean worktree/PR21 OPEN Draft/base/latest SHA/PR 설명과 기록된 post-Draft evidence를 직접 대조하여 PASS WITH NOTES. 테스트를 직접 재실행했다고 주장하지 않음. no hosted checks 확인. 미해결 blocker/major 없음.
+
+### 8. 자체 리뷰
+- source reader/PNG 계약 유지, 정확한 entropy 소비와 bounded allocation을 분리. 실패 store 불변, correlated schema, 네 runtime 파일 검증.
+- synchronous CPU/RSS overhead와 제한된 JPEG 호환성은 남음. flat family 계측은 모든 입력의 최대 시간/메모리 증명이 아님.
+
+### 9. 남은 작업
+- [x] 최종 Astra Git/PR 검토 결과 기록. 다음 Task는 사용자 승인 대기.
+- 이미지 변형 생성·모델 평가·영상은 후속 승인 Task이며 이번 완료로 주장하지 않음.
+
+### 10. 사용자 승인 필요 사항
+- 기존 Task21 설계 및 Task22 구현 승인은 유효. 현재 결함 수정에 추가 승인 불필요.
+- merge 승인 없음. 완료 보고 후 다음 Task는 사용자 검토·승인 대기.
+
+### Git / PR 증거
+- [Draft PR21](https://github.com/kimcheolhui9846/token-context-optimizer/pull/21): OPEN/Draft, base codex/task-21-jpeg-ingest; d9dc91bc3d3761a72d54ebca07a0f2035d0e1b9b 원격 반영 확인. post-Draft 기록181d8c2도 원격/PR 일치 확인. 최종 리뷰 기록만 후속 문서 commit.
+- 원래 Task18 HANDOFF dirty 및 paired-success 두 untracked 파일 보존을 다시 확인. Merge 미수행.
+
+### 11. 최종 요약
+- 구현 및 precommit Astra review 완료. Draft PR21과 post-Draft gate 완료. 최종 Astra Git/PR review PASS WITH NOTES; 완료 보고 후 사용자 승인 대기.
+- 다음 작업자는 현재 section, task plan, 검증 기록, 최신 Git/PR 상태를 먼저 대조한다.
+
+## Archived checkpoints
+# HANDOFF
+
+## Task 22 — 승인된 제한 JPEG runtime 구현 (2026-09-21)
+
+### 1. 목적 / 범위 / 승인
+- 사용자가 Task21의 제한 4:4:4/JFIF 프로필 및 독립 entropy 검증기 설계를 `승인`함. 해당 설계의 구현 계획/TDD/runtime 지원을 진행한다.
+- [승인 설계](docs/superpowers/specs/2026-09-21-jpeg-ingest-design.md): jpeg-ycbcr8-baseline-444-v1, 독립 구조·entropy 검사 후 unmodified jpeg-js0.4.4 decode, 원본 보존 및 기존 PNG/MCP/네 파일 배포 호환성.
+- 제외: encoding/resize/OCR/guard/모델 실험/영상/native 배포 변경/무관한 리팩터링/PR merge.
+- branch `codex/task-22-jpeg-runtime`, base Task21 `7ee618d67e89b26fcc8107170e1722d37711b1aa`, 별도 worktree. 원래 Task18 dirty와 Task19–21 보존.
+
+### 2. 계획 / 검증
+- [x] 적용 지침·기존 상태 확인, 안전한 Git 격리, root HANDOFF 첫 산출물.
+- [x] 실제 Astra 분석/구체적 구현 계획 및 초기 외부 교차검토 시도(DEGRADED).
+- [ ] 실제 Luna(불가 시 GPT-5.5) baseline/행동 RED/GREEN/REFACTOR, 독립 fixture·적대적 entropy/resource/API/package 검증.
+- [ ] 문서/논문 상태 동기화, milestone 외부 검토와 Astra 직접 검토, 문제 수정 및 재검증.
+- [ ] commit/push/Draft PR/post-Draft project gate/최종 Astra 리뷰 및 사용자 보고.
+
+### 3–4. 결정 / 위험
+- strict decoder 옵션만으로 충분하지 않다는 Task21 재현 결과를 해결하는 독립 검증 경계가 필수. Huffman/bit stuffing/padding/정확한 MCU 소비와 decode 전 자원 산정을 입증한다.
+- codec128MiB accounting cap은 RSS 보장이 아니며 최대 geometry 이하에서도 거절 가능. synchronous CPU/JS overhead, 라이선스 배포 검증 필요.
+- 구현 파일과 공유 문서의 소유권을 분리한다. root/agent HANDOFF 및 Git/PR은 주 에이전트 관리.
+
+### 5–7. 실행 / 오류 / 교차 검토
+- git fetch와 worktree add는 sandbox lock/FETCH_HEAD 거절 후 동일 명령 escalation 재실행 성공. 기존 변경을 stash/reset하지 않음.
+- 모델·외부 제공자 실제 실행 및 테스트 결과는 이번 Task 증거로 기록 예정. 이전 Task 결과를 신규 실행 성공으로 표시하지 않음.
+- Astra 실제 계획 분석 완료, Luna 실제 읽기 전용 준비 응답 확인. [구현 계획](docs/superpowers/plans/2026-09-21-jpeg-runtime.md)에 프로필·entropy·자원·독립 fixture·Node22/배포 수용 기준 기록. subagent-driven-development/TDD 스킬 적용, 모델 역할은 사용자 Harness 준수.
+- 초기 외부 검토: Claude exact `claude-opus-5` 호출 조직 접근 비활성(models=[]), Gemini key 존재false 및 무료API 접근 미확립, Copilot launcher Cannot find GitHub Copilot CLI. Cross-check status: DEGRADED. Astra를 외부 검토로 계산하지 않음.
+- baseline: `npm.cmd ci --ignore-scripts` PASS; image3 suites 18PASS/1WindowsFIFOskip; `npm.cmd test` 588PASS/1skip/14files. Luna 초기 typecheck는 dist/src/research build artifact 부재로 실패; 주 에이전트 `npm.cmd run build` 후 `npm.cmd run typecheck` 모두 PASS. 코드 결함 수정 없이 선행 빌드로 해결.
+
+### 8–11. 현재 상태 / 다음 단계
+- 구현 계획 작성 중. 사용자 설계 승인은 유효하며 재요청하지 않음. merge 승인 없음.
+- 과거 Task21 기록은 아래 보존한다.
+
+---
+
+## Task 21 archive
+
 ## Task 21 — JPEG 입력 확장 계약과 실행 가능성 (2026-09-21)

 ### 1. 목적 / 요구 / 범위
@@ -221,3 +331,17 @@
 - 이번 Task 파일: 새 논문/프로토콜/출처 3문서와 루트 HANDOFF, README·기존 handoff·역사적 paper/protocol 안내 4문서. 삭제 파일, runtime/test/dependency 변경 없음.
 - 다음 후보: 사용자 검토 후 연구 질문·평가 조건을 확정하고 이를 검증할 이미지 ingest/원본 보존부터 별도 Task로 설계·구현. 논문과 개발의 충돌 시 논문 우선; 영상은 이미지 검증과 별도 승인 후.
 - 승인 게이트: **다음 Task로 진행하지 않고 사용자 검토 및 승인을 기다린다.** Merge 미수행.
+
+### Task22 resumed 2026-09-26
+- User requested continuation and fresh Claude availability check. Existing Task22 remains incomplete; original Task18 changes preserved.
+- Actual native Astra checkpoint ran: entropy byte-count stub is a blocker; resource formula, structural checks, error mapping and missing acceptance tests are major findings. Luna assigned completion in the existing isolated branch; no new Task or merge.
+- Corrected factual plan error: installed jpeg-js0.4.4 has no extra block column; exact codec accounting formula recorded in plan. This implements the approved resource contract, without a scope change.
+
+
+- Resumed initial external checkpoint: actual Claude CLI response is_error=false/modelUsage claude-opus-5. First legacy50s attempt timed out; corrected minimal-prompt call succeeded (response collected later). One escalated bounded retry was already in flight. Gemini free API key/access unavailable; Copilot launcher unavailable. Provider: Claude Code Opus5 (summary-only plan review, not source audit).
+- Claude findings adjudication: strict pinned codec options/accounting/structure/source invariance and license checks are already required, assigned for code verification. Base64 precheck is inapplicable (path-only API); store holds metadata, not source buffers; incomplete Huffman policy is already explicit allow-nonempty. Synchronous blocking is documented rather than introducing an unapproved worker architecture. Native Astra code findings remain open until tests and review pass.
+
+### Task22 model interruption and resume
+- Both active Luna workers returned an actual usage-limit error before remaining fixes/measurement were delivered. Per user model hierarchy, a worker with exact requested model gpt-5.5 was dispatched; actual execution result remains to be checked. No model/config was silently substituted.
+- Native Astra successfully resumed read-only review after this interruption. It confirmed repaired full-MCU resource tests and identified an AC table descriptor error in one synthetic test family (1 means DC1; AC0 must be 0x10). Correction assigned to fallback implementer.
+- Parent fresh npm.cmd run build PASS and actual Node22.23.2 scripts/smoke-mcp.mjs PASS. Worker claim Node22 executable absent is contradicted by direct execution and must be corrected in delivery documentation.
diff --git a/README.md b/README.md
index 8c38789..67f9ac5 100644
--- a/README.md
+++ b/README.md
@@ -6,11 +6,16 @@ The MVP indexes local UTF-8 text artifacts, records SHA-256 and line source maps

 The current research direction is **image context optimization first**, with paper
 writing taking priority over feature development. Alongside the text MVP,
-[restricted PNG ingest and inspection](docs/image-artifacts.md) provides the first
+[restricted PNG/JPEG ingest and inspection](docs/image-artifacts.md) provides the first
 input-validation slice (M1a). Image transformation, OCR, selection, guard and model
 evaluation remain planned. Video extension follows image
 implementation, evaluation, and explicit user approval.

+The JPEG profile is intentionally narrow: baseline 8-bit YCbCr JFIF with 4:4:4
+sampling. Independent checked-in fixtures and their encoder provenance are under
+`tests/fixtures/jpeg/`; fixture validation does not claim image quality or hosted
+model performance.
+
 ## Development

 ```powershell
diff --git a/docs/agent/HANDOFF.md b/docs/agent/HANDOFF.md
index ad3bf15..cbc8d75 100644
--- a/docs/agent/HANDOFF.md
+++ b/docs/agent/HANDOFF.md
@@ -1,3 +1,32 @@
+# Codex Handoff — Task22 current (2026-09-27)
+
+Restricted baseline 4:4:4/JFIF JPEG ingestion is implemented alongside PNG.
+See [root handoff](../../HANDOFF.md), [runtime evidence](../research/jpeg-runtime-validation.md)
+and [plan](../superpowers/plans/2026-09-21-jpeg-runtime.md).
+Branch `codex/task-22-jpeg-runtime`, base Task21 `7ee618d`.
+Native Astra precommit SPEC/QUALITY PASS WITH NOTES after the exact-JFIF fix;
+no unresolved blocker/major. Targeted83PASS/1WindowsFIFOskip and realNode22smokePASS.
+Draft [PR21](https://github.com/kimcheolhui9846/token-context-optimizer/pull/21) is OPEN against Task21; d9dc91b pushed. Post-Draft full653PASS/1skip, targeted83PASS/1skip, build/typecheck/actualNode22smoke/plugin/textbenchmarkPASS. Final Astra directly reviewed 181d8c2, HEAD/upstream/clean tree and exact Draft PR SHA: PASS WITH NOTES, no unresolved blocker/major. Task22 is complete; only final review bookkeeping follows. Wait for user approval before the next Task.
+Claude Opus5 initial plan review succeeded; milestone external review DEGRADED.
+Paper experiments/transforms/video remain planned. No merge is authorized.
+
+## Historical checkpoints
+# Codex Handoff
+
+## Current Objective — Task 22 (resumed 2026-09-26)
+
+Task21 design was approved. Implement the restricted JPEG runtime in
+`codex/task-22-jpeg-runtime`, based on `7ee618d`, in this isolated worktree.
+See [implementation plan](../superpowers/plans/2026-09-21-jpeg-runtime.md)
+and [root HANDOFF](../../HANDOFF.md). Implementation is incomplete: Astra
+identified missing entropy decoding, resource accounting and structural/error
+checks, and incomplete fixtures/tests. Luna owns corrections within the approved
+contract. Parent owns handoffs, reviews, Git and PR. No Task22 commit or PR yet.
+Node22.23.2 official archive hash was verified and its executable ran successfully;
+standalone JPEG smoke remains pending. Claude availability is being rechecked.
+Paper-first and image-before-video priorities remain; no merge is authorized.
+
+## Task 21 archive
 # Codex Handoff

 ## Current Objective
```

## Task 22 review-fix checkpoint (2026-09-30)
- Original records preserved verbatim in normalized diff blocks: root HANDOFF +124/-0, shared HANDOFF +29/-0, README +6/-1. Shared HANDOFF and inherited Task 19/20/21 records match main. Live-link check: 23 passed.
- Main merged without rebase or history rewriting; approved root deletion and image-contract conflict resolution only. Root HANDOFF remains local and ignored.
- F-34: two tracked OMX artifacts removed from the index, retained locally with unchanged SHA-256; `/.omx/` ignored. No historical commits rewritten.
- F-13: per-bit Huffman lookup uses a Map; synchronous parsing and resource ceilings remain. Seeded 9,712,482-byte input and reproducible Node 22 measurements are in [performance evidence](../../research/evidence/task-22/jpeg-validator-performance.json). Single observations are not portable latency bounds.
- S-01 RED: real jpeg-js seed-4 output was rejected as malformed_jpeg before the fix. GREEN: exactly one terminal stuffed FF byte is accepted only at an MCU byte boundary; partial-padding plus an extra pair, repeated pairs and altered pairs are rejected. Follow-up negative tests are characterization coverage, not claimed original RED.
- F-14 RED: packaging verification exposed missing Adobe attribution. Exact pinned encoder BSD notice is now retained in docs/licenses and generated/installed bundles; the regression also checks source wording. Test-development formatting mismatches were corrected before GREEN.
- F-08/F-28: PNG/JPEG capability, APP0 immediately after SOI, paper status and historical validation wording corrected. F-15 trusted-writer/ABA limitation preserved verbatim. F-06/F-07/F-29/S-14 remain deferred.
- Pre-push gate: npm.cmd test = 755 passed, 1 Windows FIFO skip, 20 files; build then typecheck, smoke:mcp, validate:plugin and benchmark passed. JPEG-specific suites: 70 passed. Packaging: 1 passed.
- Scratch rebuild used the same build script with only its output path changed; SHA-256 matched the production bundle: FA7B6FF00CE4EE546A3FB307FC1E4710B7EF2ACACBE3CC9720C1F605564FB3B5.
- Actual independent native-model checkpoint: Codex CLI gpt-6-astra, read-only, no blocker/major; minor padding wording and timing-boundary fixes requested. This is not an external Claude review. User's Claude review remains the merge gate. No fresh Claude/Gemini/Copilot review was performed in this continuation; external cross-check status DEGRADED.
- New commits use kim cheol hui <144594976+kimcheolhui9846@users.noreply.github.com> as author and committer. PR #21 remains Draft; final push/post-PR verification pending at this checkpoint. No PR #21 merge.

## Post-push verification (2026-09-30)
- PR #21 updated to base main and remains OPEN/Draft at d1237be23f4d4b680c39208a5f15cc8041bceee7; parent gh query succeeded. Post-update npm.cmd test: 755 passed, one Windows FIFO skip, 20 files (20.89 s). Build -> typecheck, smoke:mcp, validate:plugin and benchmark all exited 0.
- Corrected measurement boundary stops before SHA-256. Fresh validator-only Node 22 observation: 931.69 ms for 9,712,482 bytes. Historical timings include hashing and are labelled accordingly; no speedup percentage inferred.
- Final gpt-6-astra content review: PASS WITH NOTES, no blocker/major. Its read-only subprocess could not access GitHub, so remote state was independently verified by the parent. No external Claude/Gemini/Copilot milestone call; DEGRADED external cross-check, user Claude review still pending.
- Parent merge-tree(origin/main, HEAD): exit 0, tree 295bfcd940da3d6d15bb8ad00d2414a92dad0c9c. Worktree clean before this evidence-only update; no root HANDOFF or .omx tracked. Bundle hash unchanged after the post-PR build. Added commits have user author/committer; older Codex-authored history is deliberately not rewritten.
- Remaining limitations: synchronous CPU work, decoder accounting is not total RSS, single-run timings, F-15 ABA/trusted-writer assumption; deferred paper findings unchanged. No #21 merge. User review/approval required before the next Task.

### Main-relative file inventory
```text
.gitignore
README.md
bin/token-context-optimizer.mjs
docs/agent/handoffs/task-22.md
docs/design.md
docs/image-artifacts.md
docs/licenses/jpeg-js-BSD-3-Clause.txt
docs/licenses/jpeg-js-decoder-Apache-2.0.txt
docs/licenses/jpeg-js-encoder-BSD-3-Clause.txt
docs/research/evidence/task-22/jpeg-validator-performance.json
docs/research/image-first-evaluation-protocol.md
docs/research/image-first-paper-draft.ko.md
docs/research/jpeg-runtime-validation.md
docs/superpowers/plans/2026-09-21-jpeg-runtime.md
package-lock.json
package.json
scripts/build-bundle.mjs
scripts/measure-jpeg-node22-production.mjs
scripts/smoke-mcp.mjs
skills/optimize-context/SKILL.md
src/core/image-artifacts.ts
src/core/jpeg-validation.ts
src/core/types.ts
src/server/index.ts
tests/fixtures/jpeg/checkedin-1x1.jpg
tests/fixtures/jpeg/checkedin-multimcu-17x17.jpg
tests/fixtures/jpeg/checkedin-odd-17x9.jpg
tests/fixtures/jpeg/generate-fixtures.mjs
tests/fixtures/jpeg/provenance.json
tests/helpers/jpeg-synthetic.ts
tests/image-artifacts.test.ts
tests/image-packaging.test.ts
tests/jpeg-entropy.test.ts
tests/jpeg-fixtures.test.ts
tests/jpeg-resource.test.ts
tests/jpeg-synthetic.test.ts
tests/jpeg-validation.test.ts
```
