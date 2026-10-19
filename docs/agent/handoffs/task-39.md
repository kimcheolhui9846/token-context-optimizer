# Task 39 — query_artifact multi-match

## Status / scope
- Tier C: Claude plan and milestone, npm gate, primary direct final review.
- Status: PASS WITH NOTES; Draft PR #45 delivered and post-PR gate PASS (2026-10-19).
- Base c2237ca23ae3f96d63ac2794ce34ecfd557a1415; branch codex/task-39-query-multi-match.
- Worktree .artifacts/worktrees/task-39-query-multi-match; unrelated work preserved.
- origin/main 32772ea differs only in research/plans/2026-10-18-ieee-references.md; no product overlap.
- Scope src/, tests/, README, this handoff; generated bin/token-context-optimizer.mjs explicitly approved.
- Protected research/, docs/research/, codex_review/, paper/, package/config/dependencies; no research rerun.
- Delivery: push and Draft PR(main), post-PR npm gate, direct final review; no Ready, merge or Task40.

## Approved plan / contract
- All six recommendations approved 2026-10-19 after Claude plan review.
- Default multiple excerpts; optional maxExcerpts integer1..20/default5, validated core and MCP.
- Positive highest-score ties only, file order; existing normalization and duplicate-term scoring unchanged.
- moreMatches?: {count, lines}: exact uncovered tied-anchor count and first20 one-based lines; absent when none.
- Unique-best/no-terms/no-match full responses equal legacy, including oversized unique refusal.
- maxExcerpts=1 retains legacy first span/refusal; multiple ties may add omission metadata.
- Approved context-first greedy preserves first fitting legacy span; overlap may expand it. First context may exhaust budget, leaving later ties only as metadata.
- Default mode skips oversized anchors and tries later ties; no-fit multi-tie returns legacy refusal plus metadata.
- Merge overlaps, not adjacency; preserve complete lines, original delimiters, UTF-8 offsets, source path/hash; no source writes.
- Global sum of excerpt estimates <=maxTokens; metadata outside estimatedTokens, not a provider-token guarantee.
- Existing excerpts element shape preserved; seven other full tool definitions including crop unchanged; no outputSchema.

## Implementation / verification
- [x] Baseline, RED feature regressions, GREEN implementation, local refactor and documentation.
- src/core/artifacts.ts: iterative tied-score collection, bounded spans, omission metadata, cached accepted cost.
- src/server/index.ts: optional maxExcerpts and query description; existing transport retained.
- tests/core.test.ts: distant34/136 anchors and independent exact byte-offset assertions.
- tests/query-artifact-boundaries.test.ts: caps/omissions, overlap, oversized anchors, legacy, Unicode, delimiters, immutability, dense-input regression.
- tests/query-artifact-mcp.test.ts, crop schema test, task39-base-tools.json: real bundled MCP and full schema compatibility.
- README and generated bundle updated. No dependencies or config changed.
- Baseline core185/185 PASS. RED core2 missing-feature failures; base MCP9 failures/11 passes; 300k-line spread RangeError reproduced.
- Latest focused core/boundary/query-MCP/crop-MCP:225/225 PASS.
- Latest gate: npm run build/typecheck, npm test, npm run validate:plugin/smoke:mcp PASS;32 files,864 passed,1 existing skipped.
- Exact compiled base/current differential:392 unique-best/fallback budget/context combinations,0 mismatches.
- Repeat bundle SHA256 equal:b4b8312eb6c667c7003e4c01a00f4e4d77187880430fe7f7ce609301c537e2dc.
- Eight-tool fixture from base bundle blob ee96bff47706e52930ec90ab1f066465cd8c71fe; fixture SHA256 dd9e249e2c4a3454adae3419f3a8d16d0466d6b84e040f931385e44937f239e3.
- Seven non-query schemas equal; query permits only description/maxExcerpts additions. git diff --check PASS; protected/package/lock/config diff empty.

## Review corrections
- Major M1: cached accepted cost and cheap disjoint-anchor rejection avoid repeatedly rendering accepted text after budget exhaustion.
- Dense regression:300k lines/context2/budget100 => one span1..57,299943 omissions; real passthrough estimator spy bounds long-text calls below1000.
- Minor M3: disjoint-only precheck preserves rounded-cost overlap with zero remaining budget; aaaax/newline/newline/x at2 tokens passes.
- Other minors: precise README refusal/partial/metadata semantics; exact delimiter gaps/distant offsets and oversized later/all-oversized cases.
- No demonstrated fixture for bridging two earlier spans under monotonic greedy windows; no claim of such coverage. Overlap and post-cap merging tested directly.
- Sandbox esbuild directory denial resolved by escalated same build; spy test typing corrected before fresh full gate.

## Independent review
- Claude Code claude-opus-5-5 / plan / APPROVE WITH CHANGES / B0 M1 minor7 note4.
- Claude Code claude-opus-5-5 / scoped plan closure / RESOLVED for user presentation / B0 M0 minor0 note1; greedy trade-off approved.
- Claude Code claude-opus-5-5 / milestone / APPROVE WITH CHANGES / B0 M1 minor3 note6; corrections below.
- Claude Code claude-opus-5-5 / scoped milestone closure / APPROVE / B0 M0 minor2 note4; cached-cost and rounding fixes accepted.
- Scoped minor1 fixed: spy calls captured before restore and positive count asserted; focused test/typecheck PASS. Minor2 bounded overlap-loop optimization deferred as optional.
- Exact model execution succeeded; Luna implemented; Claude did not implement. No usage/cost fields recorded.

## Remaining / risks
- [x] Scoped Major closure, commit/push/Draft PR, post-PR gate and primary final review.
- Approved greedy context allocation may omit more anchors than an anchor-first strategy.
- Token estimator covers excerpt text only; optional memory/type cleanup notes not required for this fix.
- Claude owns separate research rerun; no post-change claim of entity24/24 or33/33/full-keywords99/99.
- Benchmark implementation commit: 68fe59dea179563f209da9d48282d42ba3ceeeea; later delivery-note commits do not alter the bundle.
- PR: https://github.com/kimcheolhui9846/token-context-optimizer/pull/45 (OPEN/Draft, base main, mergeable; no merge performed).
- Post-PR build/typecheck/full test/validate:plugin/smoke:mcp/diff-check PASS;864 passed,1 existing skipped. Bundle unchanged by rebuild.
- Primary direct final review: PASS WITH NOTES; actual source/test/schema diffs, local logs, scope and PR head checked; no unresolved blocker/major. Remaining optional bounded overlap optimization and separate Claude research rerun noted.
- Final delivery-note commit checked separately with diff --check; no product changes after post-PR gate. Wait for user approval before Task40.
