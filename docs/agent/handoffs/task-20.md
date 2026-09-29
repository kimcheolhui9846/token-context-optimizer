PR #19 (`codex/task-20-png-ingest`) was originally stacked on PR #18 / Task 19 at `990aa9f` and is being rebased onto `main` at `85ff7b1` after PR #18 was approved and merged.

# Task 20 Handoff Archive

## Scope

- Original parent: `990aa9f8fa875aafeaaa6fbf38fdfcc5b1e094a9`.
- Original Task 20 head: `856a417158ffa259b39153efbc140a8900e24993`.
- Branch: `codex/task-20-png-ingest`.
- This file preserves the Task 20 handoff deltas that used to live in `HANDOFF.md`, `docs/agent/HANDOFF.md`, and `README.md` before the branch was merged with `main`.
- The inherited Task 19 root HANDOFF archive remains in [task-19.md](task-19.md); that file already preserves the previous root 90-line record from PR #18.

## Merge Resolution Notes

- `HANDOFF.md` is not restored. The Task 20-specific root handoff additions are preserved below as literal raw diff text.
- `docs/agent/HANDOFF.md` is restored to the `main` version. The Task 20-specific shared handoff additions and deletions are preserved below as literal raw diff text.
- `README.md` keeps the product-facing Task 20 wording: restricted PNG validation, indexing, and inspection are implemented; image transformation, OCR, selection, guard/model evaluation, and video remain planned. No JPEG support is claimed at this stage.
- Markdown links inside raw diff fences are historical text and are intentionally not live links.

## Preservation Counts

- `HANDOFF.md`: +79 / -0 from `990aa9f..856a417`.
- `docs/agent/HANDOFF.md`: +25 / -2 from `990aa9f..856a417`.
- `README.md`: +5 / -3 from `990aa9f..856a417`.

## Raw Diff: HANDOFF.md

```diff
diff --git a/HANDOFF.md b/HANDOFF.md
index 1c7afc1..e9ad707 100644
--- a/HANDOFF.md
+++ b/HANDOFF.md
@@ -1,5 +1,84 @@
 # HANDOFF

+## Task 20 — PNG 입력과 원본 보존 (2026-09-20)
+
+### 1. 목적 / 승인 / 범위
+- 사용자: Task 19 검토 승인 및 다음 진행, 중단 후 재개 지시.
+- 목적: 논문 이미지 파일럿의 canonical PNG 입력을 위한 M1a 최소 구현. 논문 우선, 기존 배포 구조 보존.
+- 범위: 제한된 정적 PNG 검증/index/inspect, 원본 bytes/hash/path/dimensions/format 추적, 경로·크기·pixel 제한, MCP 계약 및 독립 설치 검증, 논문 구현 상태 갱신.
+- 제외: JPEG/WEBP/APNG/영상, resize/crop/OCR/선택/guard, 모델 호출/과금/실험 성능 주장, native runtime 배포 개편, PR merge. M1 전체 완료로 표현하지 않음.
+- base: 승인된 Task 19 `990aa9f8fa875aafeaaa6fbf38fdfcc5b1e094a9`, `origin/codex/task-19-image-paper-first`; 별도 worktree / `codex/task-20-png-ingest`. Draft PR #19가 이 base로 OPEN. Task 18 원본 dirty checkout 보존.
+
+### 2. 계획 / 검증 기준
+- [x] 기존 코드/실제 배포/승인된 논문 로드맵 읽기 전용 확인 및 Task Git 격리.
+- [x] Astra 실행 복구 및 PNG-first M1a 범위 검토. native sharp는 현재 단일 bundle/four-file installer와 충돌하므로 이 Task에서 추가하지 않음.
+- [x] bundle 가능한 PNG validation 경로, 자원 제한과 명시적 오류 계약 결정; 초기 cross-check.
+- [x] 실패 회귀 RED → GREEN → 범위 내 정리/회귀 검사. 최초 missing-module RED 후 행동 RED 누락은 아래 공개 기록.
+- [x] malformed/CRC/truncation/oversize/pixels/APNG/경로탈출/원본 무변경/메타데이터 사본/실제 설치 MCP 검증(Windows FIFO 제외).
+- [x] 논문/README/핸드오프 상태를 실제 지원 범위와 일치시킴.
+- [x] 독립 검토, commit/push/Draft PR, post-Draft 프로젝트 gate, 최종 Astra 리뷰.
+
+### 3–4. 결정 / 위험
+- 새 기능은 text artifact store/API와 분리. 기존 동작/설치 계약 보존.
+- 원본 보존은 write-free indexing과 hash 추적이며 외부 파일을 영구 보관/불변으로 만드는 기능은 아님.
+- 원본 PNG 파일 크기와 header/pixel 제한만으로 decode 안전성을 주장하지 않음. 압축 해제와 decoder 메모리/CPU 한계를 확인하고 제한을 문서화.
+- 원문 자료나 credential을 외부 검토에 보내지 않고 비민감 설계 발췌만 사용.
+
+### 5–7. 모델 / 오류 / 검토 기록
+- 이전 시도에서 Astra와 dependency-expert가 quota로 중단됨. 재개 후 Astra 실제 분석 응답 확인. 구현 모델은 실행 시 Luna 우선, 실제 불가 시에만 GPT-5.5.
+- 초기 Astra 계획 검토 PASS WITH NOTES: partial M1a 제한 프로필, 전체 PNG 구조/CRC/압축 입력 소비 검증, 독립 fixture 및 설치 bundle 검사, 최대 메모리 한계 명시를 수용 기준으로 확인.
+- 초기 Claude: 정확한 `claude-opus-5` 호출 요청이 조직 구독 접근 비활성 오류로 실패, 실제 모델 목록 비어 있음. Gemini: 두 API 키 환경 변수 존재 여부만 확인했으며 부재; 무료 API 접근/quota 미확립으로 미수행. Copilot: launcher가 `Cannot find GitHub Copilot CLI`로 실패. **Cross-check status: DEGRADED**; native Astra 검토를 외부 검토 성공으로 계산하지 않음.
+- `npm.cmd ci --ignore-scripts` 성공. baseline `npm.cmd test -- --run tests/core.test.ts`: 182 PASS. 기존 audit moderate 2건은 vitest/@vitest/mocker 개발 의존성, 제시된 fix가 major upgrade여서 이번 이미지 기능 범위에서 임의 업그레이드하지 않음.
+- Luna (`gpt-5.6-luna`) 실제 완료 응답 확인. 최초 RED는 missing-module collection 실패이며 계획된 compiling-stub 행동 RED는 수행되지 않음. 이 절차 차이를 숨기거나 행동 실패로 표현하지 않는다. 첫 구현 이미지 7 / 전체 577 PASS는 worker 보고; 주 에이전트가 core+image 189 PASS를 03:54 직접 확인.
+- 첫 마일스톤 Astra 검토 CHANGES REQUIRED(상세 검토 진행): 경로/파일 재확인, 제한·실패 케이스와 설치 MCP schema/structuredContent 검사 누락 보완 필요. 같은 Task 안에서 새 회귀 테스트의 실제 실패를 먼저 확인하고 수정할 예정.
+- 03:54 외부 제공자 재확인: 정확한 Claude 모델 요청은 동일 조직 접근 오류와 models=[]; Gemini API 키 부재/무료 사용 미확립, Copilot CLI unavailable. 마일스톤 외부 검토 미수행, DEGRADED 유지.
+- 문서 8개 strict UTF-8/fence와 local link 29개 검사 PASS; 수정된 skill의 `quick_validate.py` PASS. 최종 구현에 맞춰 오류 계약을 추가한 뒤 다시 확인한다.
+- Astra 최종 첫 마일스톤 verdict: SPEC/QUALITY CHANGES REQUIRED. major 5개: regular-file 확인 전 open의 FIFO blocking, 읽기 후 pathname identity 재확인 누락, 보안 경계 테스트 부족, 원본 무변경/identity/copy 테스트 증명 부족, 설치 MCP schema/structured/error 검사 부족. minor: `..name` 정상 자식 거절, fixture cleanup 누락, 손상 구조/미지원 프로필 구분, chunk type ASCII masking, 오류 문서 누락, 조밀한 코드 가독성.
+- 위 항목을 Luna fix round 1에 통합 전달. 승인된 제한 PNG 계약 안의 국소 수정/검증이며 새로운 변환 기능이나 공개 영상 동작을 추가하지 않음. 최초 missing-module RED 절차 차이도 유지 기록.
+- `npm.cmd audit --omit=dev --json`: runtime vulnerabilities 0. 전체 baseline moderate 2개는 위에 기록한 기존 개발 도구 항목.
+- fix round 1 중 Luna가 실제 usage limit으로 중단(표시된 재개 시각 08:39). 진행 중 변경은 보존하고 사용자 지정 대체 모델 `gpt-5.5` worker에 동일 파일 소유권/남은 결함/계획과 검증 기록을 전달했다. 대체 모델의 성공 여부는 응답과 산출물로 확인한다. Task/브랜치/PR 범위를 새로 시작하지 않음.
+- Astra 추가 패키징 검토에서 신규 fast-png/fflate/iobuffer의 LICENSE 전문이 배포 bundle에 누락된 major 확인. 네 runtime 파일 구조를 바꾸지 않고 build에서 설치된 LICENSE 원문을 읽어 bundle 주석에 포함하는 최소 수정과 회귀 검사를 같은 round에 추가했다. 기존 의존성 전체 감사/임의 라이선스 해석은 범위 밖. `scripts/build-bundle.mjs` 및 필요한 신규 packaging test를 worker 소유 범위에 추가.
+- GPT-5.5 실제 수정 완료 응답 확인(09:00 전). 이미지16 PASS/Windows FIFO1 skip, core 포함198 PASS, build/typecheck/smoke PASS를 보고. 주 에이전트가 09:00 이미지3 suites 16 PASS/1 skip 및 `npm.cmd run smoke:mcp` PASS 직접 재확인. 현재 Astra scoped 재검토 중이며 아직 Task 완료가 아님.
+- RED 근거: 신규 dependency license 누락 검사의 실제 실패 후 bundle 고지 포함으로 GREEN. worker는 same-size 변경 regression의 초기 test-hook 접근과 최종 mock 접근을 구분해 보고했으며 public `beforeOpen` 옵션은 최종 API에서 제거. 최초 RED 절차 차이는 위 기록대로 유지한다.
+- 설치 smoke에서 Windows `node:constants`의 named `O_NOFOLLOW` export 부재로 server boot 실패를 발견; `node:fs`의 constants 객체 사용으로 수정하고 build/typecheck/설치 smoke 재통과. source-only Vitest 통과를 설치 runtime 검증으로 대체하지 않음.
+- Round1 Astra re-review CHANGES REQUIRED: reader/플랫폼 flags/LICENSE와 cleanup 등은 해결. 기존 수용 기준의 잔여 검사(실재 sibling/traversal, CRC를 통과하는 손상 압축/overflow, 정확한 오류 및 failed-store, 원본 사전 hash/반복ID/copy-on-put·return, post-read replacement), 잘못된 IHDR 분류, MCP isError·양쪽 schema 검사 보완을 round2로 전달. 오류 문서는 현재 inspect의 의도된 remapping을 정확히 기록하도록 주 에이전트가 수정.
+- Round2 완료: 새 회귀에서 custom store.put이 반환 record를 변조하는 문제와 IHDR 오류 분류 2건의 실제 RED를 확인한 후 복사 전달/구조 오류 분류를 수정. 실제 sibling/traversal, CRC-correct 손상/overflow, pre/post 원본 비교, copy/반복 ID, post-read rename, strict MCP error와 required schema 검사를 보완. worker targeted200 PASS/Windows FIFO1 skip, build/typecheck/smoke PASS.
+- Astra round2 독립 직접 검토: **SPEC PASS / QUALITY PASS WITH NOTES**, 기존 must-fix 5개 모두 해결, 미해결 blocker/major 없음. 남은 note: 초기 behavioral RED 절차 차이, Windows에서 FIFO 미실행, 외부 검토 DEGRADED, 일부 parser의 조밀한 서식. 이는 scoped review이며 최종 Git/PR 리뷰 전.
+- 2026-09-20 23:45 사용자 재개 지시. 이전 주 에이전트 전체 검사 session은 `Unknown process id`로 결과를 회수할 수 없어 성공으로 기록하지 않고 targeted부터 새로 실행한다. 변경/브랜치 보존 확인; 새 Task/중복 PR 생성 없이 진행.
+
+### 8–11. 현재 상태 / 후속 승인
+- Task 20 완료, 최종 **PASS WITH NOTES**, 사용자 검토 대기. [구현 계획](docs/superpowers/plans/2026-09-20-png-ingest.md)에 따라 Luna와 승인된 GPT-5.5 대체 구현, 주 에이전트 문서/Git, 독립 Astra 검토로 진행했다. Task 19 이력은 아래 보존.
+- 다음 Task와 merge는 별도 사용자 승인 필요.
+
+### Pre-PR 최신 검증 (2026-09-20 23:45–23:46 KST)
+- `npm.cmd test -- --run tests/image-artifacts.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts tests/core.test.ts`: **200 PASS / 1 skipped**.
+- `npm.cmd test`: **588 PASS / 1 skipped / 14 files**. skipped는 POSIX FIFO: Windows에서 NOT RUN. 실제 Windows directory/junction/path replacement 검사는 실행됨.
+- `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`: 모두 PASS.
+- 기존 text benchmark 3 scenarios × 20 samples PASS; p95 1.52/1.47/0.97ms. 이미지 성능·모델·실제 비용 실험은 NOT RUN(범위 밖).
+- 재개 후 외부 milestone 검토 요청: Claude 정확한 `claude-opus-5`는 동일 조직 접근 오류(models=[]), Gemini 무료 API 접근 미확립, Copilot CLI unavailable. **Cross-check status: DEGRADED** 유지.
+- 자체 리뷰: text API·four-file 배포 계약 보존; source 무변경과 범위/오류/설치 근거 확보. 한계는 synchronous decoder/여러 최대 약64MiB 버퍼/metadata entry cap 없음/OS race-proof sandbox 아님. 초기 RED 절차 차이와 일부 조밀한 parser 서식은 공개된 note; 미해결 blocker/major 없음.
+- 변경 파일: 이미지 core/types/server, 독립 image/race/package 테스트 3개, dependency/lockfile, bundle build 및 MCP smoke와 재생성 bundle, README/skill/design/이미지 계약/논문·protocol/계획/양쪽 handoff. 기존 파일 삭제/기존 연구 코드 수정 없음.
+
+### Draft PR 및 post-Draft 검증 (2026-09-20 23:48–23:49 KST)
+- 구현 커밋 `b9b1f10e40bf29d6af02863bb9185400db9ef578` / `feat: add validated PNG image artifacts`, upstream push 성공.
+- [Draft PR #19](https://github.com/kimcheolhui9846/token-context-optimizer/pull/19): OPEN / Draft, base `codex/task-19-image-paper-first`, head `codex/task-20-png-ingest`, 해당 SHA 일치 확인. PR #18 및 #19 merge 미수행.
+- PR 생성 후 targeted200 PASS/1 Windows FIFO skip, 전체588 PASS/1 skip/14 files. build/typecheck/installed MCP smoke/plugin validation/benchmark 모두 다시 PASS.
+- text benchmark 3×20, p95 1.52/1.48/1.06ms; 이미지 모델 결과 아님. 문서9개/로컬링크31개 PASS. 재빌드 bundle의 커밋 대비 내용 diff 없음.
+- `gh pr checks 19`: no checks reported. Hosted CI 성공을 주장하지 않으며 로컬 gate가 관찰된 증거다. 별도 lint/format script 없음; typecheck·diff 검사 실행.
+- pre-commit 우회 없음. hooksPath 및 활성 non-sample hook 없음. 원래 Task18은 `26e22e4` / HANDOFF dirty 및 paired-success 소스·테스트 untracked 그대로 보존 확인.
+- broad pre-transport Astra review PASS WITH NOTES; 이 post-Draft 기록을 push한 다음 최신 PR/SHA/작업 트리/최종 요구사항을 별도 확인한다.
+
+### 최종 Astra Review / 승인 게이트
+- **PASS WITH NOTES**. Astra는 `9a612fabf37a0efc699a970daee05152f23b098e` 실제 diff/HEAD/upstream/clean tree, PR #19 OPEN Draft/base/latest SHA, 요구사항·호환성·테스트·문서·수정된 지적을 직접 확인했다. post-Draft gate 결과는 주 에이전트의 관찰과 HANDOFF 근거로 검토했으며 별도 재실행했다고 주장하지 않음.
+- 미해결 blocker/major 없음. retained notes: 초기 행동 RED 누락(후속 regression RED와 구분), Windows FIFO NOT RUN, 외부 cross-check DEGRADED, synchronous decode와 여러 약64MiB 버퍼/metadata count 제한 없음, filesystem sandbox 한계, 일부 조밀한 parser 서식.
+- `git ls-remote` 첫 조회는 sandbox network connect 실패; 허용된 escalation 재실행 성공. 원격 main `4e9b7c5`, Task19 `990aa9f`, Task20 `9a612fa` 확인. 이후 변경은 이 최종 판정·계획 완료 상태만 기록하며 push 후 최신 SHA/PR/clean state를 다시 확인한다.
+- 전달 결과: 제한 PNG input/inspect(M1a), 원본 보존·경로/오류/패키징 검증, 연구 초안과 구현 상태 일치. JPEG/WEBP/그 외 PNG, 변환/OCR/guard/hosted/video, 이미지 모델 실험은 미구현·미실행이며 다음 승인 Task 범위.
+- **다음 Task로 진행하지 않고 사용자 검토 및 승인을 기다린다.** PR #18/#19 merge 미수행. 다음 작업자는 이 섹션과 Draft PR #19, 원래 dirty Task18 보존 상태를 먼저 확인한다.
+
+---
+
+## Task 19 archive
+
 ## Task 19 — 논문 우선 이미지 연구 초안과 실험 설계 (2026-09-19)

 ### 1. 작업 개요
```

## Raw Diff: docs/agent/HANDOFF.md

```diff
diff --git a/docs/agent/HANDOFF.md b/docs/agent/HANDOFF.md
index 8d01f1a..6a17622 100644
--- a/docs/agent/HANDOFF.md
+++ b/docs/agent/HANDOFF.md
@@ -2,6 +2,29 @@

 ## Current Objective

+Task 20 (2026-09-20) follows the user's approval of Task 19 and implements partial
+M1a restricted PNG ingestion and inspection. See the [input contract](../image-artifacts.md)
+and [root HANDOFF](../../HANDOFF.md) for active implementation and validation state.
+The branch is `codex/task-20-png-ingest`, based on Task 19 `990aa9f`, with stacked
+Draft PR #19 against `codex/task-19-image-paper-first`. The original dirty
+Task 18 checkout remains separate and untouched. Image transformation, OCR,
+selection/guard, model evaluation and video remain planned. No merge is authorized.
+The implementation and scoped Astra review are complete (SPEC PASS / QUALITY
+PASS WITH NOTES). Fresh pre-PR verification on 2026-09-20 passed 200 targeted
+and 588 total tests, with one POSIX FIFO case skipped on Windows, plus build,
+typecheck, installed MCP smoke, plugin validation and the existing text benchmark.
+[Draft PR #19](https://github.com/kimcheolhui9846/token-context-optimizer/pull/19)
+is OPEN against the Task 19 branch. The same local gate passed again after the
+PR opened at 23:48–23:49 KST: 200 targeted / 588 total passing, one Windows FIFO
+skip, plus build/typecheck/smoke/plugin/benchmark. No hosted CI checks are reported.
+Final Astra review returned **PASS WITH NOTES** after checking the actual diff,
+PR/latest commit and clean worktree. Only final review bookkeeping follows that
+verdict. Task 20 awaits user approval before the next Task; neither PR is merged.
+The initial behavioral RED deviation, Windows FIFO skip, external DEGRADED review
+and runtime resource limits remain disclosed in root HANDOFF.
+
+## Task 19 Delivery Checkpoint
+
 Task 19 (2026-09-19) prioritizes an image-first Korean paper draft, a primary-source
 register, and an image evaluation protocol linked to minimum plugin capabilities.
 See [root HANDOFF](../../HANDOFF.md) for current review, validation, Git/PR state,
@@ -13,8 +36,8 @@ against `main`. Post-Draft checks on 2026-09-19 passed 39 targeted and 570 total
 tests, build, typecheck, MCP smoke, plugin validation, and existing text benchmark.
 These checks establish regression coverage, not empirical image performance.
 Final native Astra review returned PASS WITH NOTES; external cross-check remains
-DEGRADED and source verification is abstract-level. Task 19 awaits user approval
-before the next implementation Task. The final evidence record is in root HANDOFF.
+DEGRADED and source verification is abstract-level. The user approved the next
+implementation Task after this delivery. The final evidence record is in root HANDOFF.
 The Task 18 dirty checkout is preserved separately; its uncompleted implementation
 is neither included nor claimed complete here. No merge is authorized.

```

## Raw Diff: README.md

```diff
diff --git a/README.md b/README.md
index 8aadaeb..8c38789 100644
--- a/README.md
+++ b/README.md
@@ -5,8 +5,10 @@ Codex plugin and local STDIO MCP server for safer token-efficient context handli
 The MVP indexes local UTF-8 text artifacts, records SHA-256 and line source maps, returns bounded source-backed excerpts, and blocks lossy summaries for exact-sensitive content.

 The current research direction is **image context optimization first**, with paper
-writing taking priority over feature development. Image processing is planned; the
-text MVP above is the implemented capability. Video extension follows image
+writing taking priority over feature development. Alongside the text MVP,
+[restricted PNG ingest and inspection](docs/image-artifacts.md) provides the first
+input-validation slice (M1a). Image transformation, OCR, selection, guard and model
+evaluation remain planned. Video extension follows image
 implementation, evaluation, and explicit user approval.

 ## Development
@@ -28,7 +30,7 @@ npm.cmd run benchmark

 Build before packaging the plugin because `.mcp.json` points to the checked-in bundle at `bin/token-context-optimizer.mjs`.

-Set `TCO_ALLOWED_ROOTS` to one or more workspace roots separated by `;` before using `index_artifact`. The server intentionally separates the plugin install directory from the files Codex is allowed to index.
+Set `TCO_ALLOWED_ROOTS` to one or more workspace roots separated by `;` before using `index_artifact` or the image tools. The server intentionally separates the plugin install directory from the files Codex is allowed to index.

 ## Local Install

```
