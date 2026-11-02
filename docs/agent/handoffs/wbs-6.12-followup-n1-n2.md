# WBS 6.12 follow-up — N1/N2

- Tier C; base `410cd2f`; branch `codex/612-followup-n1-n2`.
- User approved one implementation PR, with plan first and no separate plan PR.

## Plan
- N1: inspect pinned jpeg-js 0.4.4 decoder messages; map only its memory/resolution limit errors to `jpeg_resource_limit` in tolerant decode catch. Other exceptions remain `malformed_jpeg`; strict prefix unchanged.
- N2: copy both array fields when present using one clone helper where equivalent; reject profile-specific fields outside their saved validationProfile. Preserve existing `decode_failed` and source/access error precedence.
- Acceptance: normal valid PNG/JPEG strict/tolerant records unchanged; mixed arrays cannot mutate the store; JPEG tolerant+PNG fields, PNG tolerant+JPEG fields, and strict+tolerant fields rejected.
- Tests: decoder spy for both resource messages and nonmatching exceptions; clone/store ownership; inspect/read/crop/overview mixed-field rejection and error precedence; existing normal record regression tests.
- Performance: no timing gate. N1 changes catch only; N2 copies bounded metadata arrays and checks field presence without changing decode/validation bodies. Stop/report if normal strict output/behavior changes.
- Files: src/core/jpeg-validation.ts, image-artifacts.ts, image-crop.ts, image-overview.ts; targeted tests; this handoff and image contract if clarification is needed.
- No dependency install, strict decode edits, fixture/evidence/research/paper/review changes, Ready or merge.

## Execution / checks
- [ ] Initial Claude plan cross-check and plan commit / Draft PR.
- [ ] Baseline targeted tests; Luna adds tests only; primary observes RED before authorizing implementation.
- [ ] GREEN minimum implementation and source/doc review.
- [ ] Seven checks: typecheck, target tests, full tests, build, smoke:mcp, validate:plugin, git diff --check.
- [ ] Claude milestone; resolve authorized findings; commit/push; final local verification and Astra verdict.
- Current status: plan recorded; implementation not started.

## Reviews and evidence
- #85 recheck `6c09192`: Approve; prior Major/minors addressed; output byte-identical to committed 20,605-byte JSON.
- #86 recheck `4531db9`: Approve; T2 suffix/K-6–K-8 and timing caveats corrected; non-timing result and 13 boundary cases reproduced.
- Recheck scratch evidence: .artifacts/review-85-86/{perf-recheck.json,n17-recheck.json,recheck.cjs} in the main checkout; reviewed PRs unchanged.
- Initial plan review: pending. RED/GREEN: pending. Milestone/final review: pending.
- Risks: exact external-message matching; accidentally changing metadata error precedence or valid strict record behavior.
- Next: inspect decoder source and focused test helpers, then initial cross-check.
