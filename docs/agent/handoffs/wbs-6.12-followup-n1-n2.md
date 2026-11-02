# WBS 6.12 follow-up — N1/N2

- Tier C; base `410cd2f`; branch `codex/612-followup-n1-n2`.
- User approved one implementation PR, with plan first and no separate plan PR.

## Plan
- N1: inspect pinned jpeg-js 0.4.4 decoder messages; map only its memory/resolution limit errors to `jpeg_resource_limit` in tolerant decode catch. Other exceptions remain `malformed_jpeg`; strict prefix unchanged.
- N2: copy both array fields when present using one clone helper where equivalent; reject profile-specific fields outside their saved validationProfile. Preserve existing `decode_failed` and source/access error precedence.
- N1 recognition: Error instances only; entire message must equal either `maxResolutionInMP limit exceeded by NMP` or `maxMemoryUsageInMB limit exceeded by at least NMB`, with N a positive decimal integer. Reject prefix/suffix/newline/zero/non-Error near misses. Keep accounting precheck and decoded-shape checks unchanged.
- N2 field sets: PNG = ignoredChunks/alpha; JPEG = coding/sampling/ignoredSegments/exifOrientation. At entry to validateForRecord, reject fields present via `in` outside their owning profile, before decoder dispatch but after the existing path/read/hash gates. Strict metadata comparisons otherwise stay unchanged.
- Clone only the two known arrays, independently, preserving non-array values and absent keys/key order. Retain each known profile field present via `in` (including inherited/non-enumerable) on the cloned snapshot for consistent presence semantics. Valid registered records have only own fields; strict registration adds no tolerant fields.
- Preserve existing array spread semantics; arbitrary custom iterators/proxy getters and live-store concurrency redesign are outside this bounded fix. Test ordinary own and inherited foreign fields, undefined-valued keys, and existing error precedence.
- Acceptance: normal valid PNG/JPEG strict/tolerant records unchanged; mixed arrays cannot mutate the store; JPEG tolerant+PNG fields, PNG tolerant+JPEG fields, and strict+tolerant fields rejected.
- Tests: decoder spy for both resource messages and nonmatching exceptions; clone/store ownership; inspect/read/crop/overview mixed-field rejection and error precedence; existing normal record regression tests.
- Performance: no timing gate. N1 changes catch only; N2 copies bounded metadata arrays and checks field presence without changing decode/validation bodies. Stop/report if normal strict output/behavior changes.
- Files: src/core/jpeg-validation.ts, image-artifacts.ts, image-crop.ts, image-overview.ts; targeted tests; this handoff and image contract if clarification is needed.
- No dependency install, strict decode edits, fixture/evidence/research/paper/review changes, Ready or merge.

## Execution / checks
- [x] Initial Claude plan cross-check and plan commit / Draft PR #88 (ee73ba0, clarified eefcca2).
- [x] Baseline targeted tests; Luna adds tests only; primary observed RED (13 failed / 27 passed) before authorizing implementation.
- [x] GREEN minimum implementation and source review; final regression file 42/42 passes.
- [x] Seven checks: typecheck, target tests, full tests, build, smoke:mcp, validate:plugin, git diff --check.
- [ ] Claude milestone; resolve authorized findings; commit/push; final local verification and Astra verdict.
- Current status: implementation, seven checks and Claude milestone PASS; final commit/push pending.

## Reviews and evidence
- #85 recheck `6c09192`: Approve; document Major/minors addressed; output byte-identical to committed 20,605-byte JSON. Minor PR-body sync note: its summary still says 1.3%, while corrected document says 1.33 percentage points; also omit no longer exhaustive two-cause wording.
- #86 recheck `4531db9`: Approve; T2 suffix/K-6–K-8 and timing caveats corrected; non-timing result and 13 boundary cases reproduced.
- Recheck scratch evidence: .artifacts/review-85-86/{perf-recheck.json,n17-recheck.json,recheck.cjs} in the main checkout; reviewed PRs unchanged.
- Claude Opus 5.5 initial plan: CHANGES REQUIRED, blocker 0 / major 2 / minor 4; exact matching and shared guard placement clarified above.
- Claude Opus 5.5 scoped plan recheck: PASS, blocker 0 / major 0 / minor 5 / note 5; integer/near-miss/non-enumerable tests adopted. PNG-to-JPEG profile tampering with PNG fields intentionally becomes decode_failed. Existing same-profile sparse PNG metadata and live-store concurrency are deferred outside N2 foreign-field scope.
- Baseline: 277 passed / 2 skipped; primary RED: 13 failed / 27 passed; final GREEN targeted: 319 passed / 2 skipped. Full suite: 1349 passed / 5 skipped across 39 files.
- Claude Opus 5.5 milestone: PASS, blocker 0 / major 0 / minor 3 / note 5; three test minors fixed (source_changed simultaneous foreign field, strict spy reached, inherited JPEG fields on PNG profiles). Primary verified fixes; Tier C needs no minor-only re-review. Review was supplied-diff analysis, not reviewer-executed tests.
- Optional regex cleanup not adopted: runtime probe confirms the regex already rejects final LF; explicit match equality retained as a harmless full-message invariant. Two error-table rows now describe N1/N2 behavior.
- Logs (main checkout): .artifacts/612-followup-{baseline,red,green,typecheck,full,build,smoke,plugin}.log. Build stderr is esbuild progress; process exit 0. All seven checks PASS.
- Source changes: tolerant catch maps exact pinned Error messages (jpeg-js/lib/decoder.js:740,1071); common validateForRecord rejects foreign profile fields with decode_failed; cloneImageArtifactRecord copies both arrays and retains known field presence for crop/overview snapshots.
- Existing crop regression updated: genuine strict RGBA still alpha_unsupported; strict record with injected alpha now decode_failed, as required by N2. No normal strict behavior change.
- Risks: exact external-message matching; accidentally changing metadata error precedence or valid strict record behavior.
- Normal strict/tolerant PNG/JPEG metadata/key order/full-frame/crop/overview output matches 25,932-byte baseline exactly (SHA-256 da2704a25e2fd5ee53f88b156669d730092c7cc8810fcc5a865078a1e0e9fc99); frozen strict JPEG prefix preserved. Runtime bundle included.
- #89 at 1f16120: Approve; temporary clean install/build/probe reproduces 458 JPEG hashes / 648 slots, JSON identical excluding node. APP0-only control and protocol/source claims confirmed. Temporary worktree removed; report .artifacts/review-89-REVIEW.md. Previously sent PDF not independently checked.
