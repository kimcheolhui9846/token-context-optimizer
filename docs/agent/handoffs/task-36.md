# Task 36 — crop_image_artifact

## Status and scope
- Tier C: one initial-plan and one GREEN milestone independent Claude review; primary direct final review.
- Implementation complete; milestone reviewed, minor corrections applied; commit/push/Draft and post-PR gate pending.
- Base: main f4fa22c5993a34961777871c9dd6fa9a9b93f748; branch: codex/task-36-crop-image-tool.
- Worktree: .artifacts/worktrees/task-36-crop-image-tool. Existing checkout/user changes preserved.
- Read full codex_review/codex_task36_request_2026-10-15_crop-q75-tool.md; 2026-10-18 user update takes precedence.
- Allowed: src/, tests/, README.md, docs/image-artifacts.md, this handoff; user also approved generated bin and vitest.config.ts exclusion.
- Protected paths unchanged: research/, docs/research/, codex_review/, paper/. No dependency/package/lockfile changes.
- No resize, OCR/selector, overview generation, writer, hosted call, experiment, token estimator, Ready or merge.

## Approved decisions (2026-10-18)
1. crop_image_artifact({artifactId, region:{x,y,width,height}}): zero-based safe integer source pixels, right/bottom exclusive; strict MCP input.
2. Partial RGBA crop rejects alpha_unsupported even if all alpha=255; full-frame returns original for RGBA/large sources.
3. Reuse existing 10 MiB encoded/8192-axis/16,777,216-pixel and JPEG 128 MiB decoder-accounting limits. No new RSS/worker limit.
   Before allocation, cap both crop axes at 1536 and check safe arithmetic: RGBA crop buffer <=9,437,184 bytes (9 MiB).
   Full source decode and encoder allocations remain; this is not a total RSS/time guarantee or a Task33 measurement-based guarantee.
4. No token estimate field; q75 alone does not establish token savings.
- Additional explicit approvals: rebuild tracked bin/token-context-optimizer.mjs; add only research/** to Vitest exclude.

## Plan and delivered behavior
- [x] Isolate branch/worktree; inspect baseline and research evidence read-only; obtain plan cross-check and user approval.
- [x] RED then GREEN: shared authorized bounded snapshot, hash/metadata/pixel checks, crop, q75 encode, output JPEG validation/hash.
- [x] MCP image + provenance, status union, errors, existing seven tools' exact schema regression fixture.
- [x] Boundary/race/no-write/encoder-failure tests; approved docs and generated bundle; focused refactor and gate.
- [x] Claude milestone; address five minor findings and locally discovered test-client failure path.
- [ ] Commit with Agent: codex, push, Draft PR main, post-PR gate, direct final review and report.
- Error precedence: shape → lookup → empty → read/validate → bounds → full-frame → size → alpha → encode/output validation.
- Full-frame: original reference only, no encode/image/q75/output hash. Oversize partial: resize_required with validated source reference.
- Cropped: JPEG base64 image plus source/region/dimensions/bytes/SHA/q75/jpeg-js 0.4.4/output-validation metadata.
- Cropped/original: isError=false; resize_required: isError=true with structured content; other errors: sanitized SDK text-only error.
- Source references attest the read snapshot; later reads require revalidation. source_changed never carries a valid-source reference.
- No source writes or derived store entry. Existing inspect error mapping and seven public schemas are preserved.

## Verification and corrections
- Baseline: npm ci/build PASS. Luna first-pass core RED: three missing-function failures; base bundle MCP RED: seven failures/one pass.
- Parent RED: stale description/empty-region MCP behavior, malformed Uint16Array accepted, test-client child exit hung; corrected and revalidated.
- Targeted pre-review: 29/29 PASS. Full pre-review gate: build/typecheck/test (830 passed, one existing skip)/validate:plugin/smoke:mcp PASS.
- Full gate initially collected main's node:test research suite incorrectly; user-approved research/** exclusion resolved it without research edits.
- Review corrections: oversized RGBA partial precedence; strict schema error assertions; negative/changed-source empty regions; installed encoder version guard; docs and explicit core field snapshot.
- Test-client correction: reject pending calls on child failure and remove exit listeners; real child exit regression RED → GREEN.
- Base fixture: exact bytes from git show f4fa22c:bin/token-context-optimizer.mjs reproduce all seven original tool definitions unchanged.
- git diff --check PASS; protected-path/package/lockfile diff empty. Post-correction and post-PR gate results recorded below when available.
- Environment: sandbox access/network restrictions required approved escalated commands. Temporary ESM spy/type errors fixed before GREEN.

## Independent review
- Claude Code claude-opus-5-5 / initial plan / APPROVE WITH CHANGES / blocker 0, major 2, minor 6, note 4; SDK errors and reader mapping clarified.
- Claude Code claude-opus-5-5 / scoped plan re-review / APPROVE / blocker 0, major 0, minor 1, note 2; majors closed, empty precedence clarified.
- Claude Code claude-opus-5-5 / milestone / APPROVE WITH MINOR CHANGES / blocker 0, major 0, minor 5, note 5; all five minors addressed.
- Calls returned exit0/isError=false and exact model ID; reviewers performed static review, not tests. No cost/token fields retained in handoff.
- Milestone package included stale partial test report; actual pre-call full gate passed. Final evidence supersedes that stale report.
- No scoped milestone repeat required for minor findings under Tier C. Review notes: synchronous codec/no total RSS guarantee accepted; fixture generation helper is local ignored tooling.
- Luna executors supplied first-pass core and MCP/boundary tests; one quota interruption occurred, then primary completed bounded integration fixes.
- Primary performs final review directly; runtime does not expose a verifiable exact primary model ID. No separate Astra reviewer called.

## Remaining delivery / approval
- Final direct review must inspect final diff, tests, generated bundle, protected scope, HEAD/upstream/PR agreement and Draft state.
- Ready/merge/Task39 are not authorized. PR42/43 cross-review is deferred until Task36 delivery; no work on those branches.

- Post-correction gate: focused 32/32; build/typecheck/full test (30 files, 833 passed/1 skipped)/validate:plugin/smoke:mcp/diff check PASS.
