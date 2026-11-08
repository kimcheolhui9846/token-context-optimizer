# 6.4b-2 — Ledger-order-independent cost totals

- Tier E; base `ee53fa0`; branch `codex/6-4b-2-cost-order`.
- Approved plan: 2026-11-08 cost-order handoff; per-arm known costs numeric ascending sort then sequential addition.
- Scope: evaluation-core, research-scoring tests, scoring docs, this handoff. No research/ or historical docs/superpowers edits.
- Preserve validation order, null unknown/missing, finite overflow check, costPerSuccessUsd definition, schema/field order, ledger/classified run order.
- One approved migration: `preserves floating point cost accumulation order` → `is independent of ledger order`; first total1e16→10000000000000002; reversed total unchanged.

## Impact before implementation
- Direct core consumers:src/research/scoring.ts and paired-success.ts. Scoring CLI:scripts/score-research.mjs.
- Paired consumer outside tests:docs/research/evidence/task-18/measure-paired-success.mjs emits timing metadata; paired projection excludes costs, retains core overflow validation.
- No committed serialized totalCostUsd report found in JSON; tracked occurrences are source/tests/docs/historical plans. Demo JSON is input.
- Paper/docs/research/image-first-paper-draft.ko.md and research/plans/results/figures/data use independent research/src cost producers (run,session-harness,session-anthropic,figure-data,exp2-analyze,session-analyze). No scorer import found.
- No paper or numerical artifact regeneration indicated. External/untracked consumers outside repository evidence.
- Stop on extra existing expectation migration or unexpected paper/artifact/demo changes.

## Verification
- Baseline:136targetedPASS;3244fullPASS/5SKIP; typecheck/build/demo/smoke/plugin/exact/diff PASS.
- RED before product edits:140PASS/2expectedFAIL, both10000000000000000 vs10000000000000002; rawJSON retained.
- Permutations reorder fixed attempt/cost pairs across6orders. Null/missing/overflow/order-preservation characterizations pass baseline.
- Existing paired-success tests unchanged and passing in RED phase; no cost-output assertion added.
- GREEN:142 targeted PASS;3250 full PASS/5 SKIP; typecheck/build/demo/smoke/plugin/exact/diff PASS. Demo JSON byte-identical; exactly one existing expectation migration; protected artifacts and LF-normalized bundle unchanged.
- Demo baseline:valid=true, synthetic-demo1successfulrun, costsnull. It does not exercise non-null addition; permutation unit tests do.
- Protected Git tree IDs at base:research701683a962d7b67f288e5f0b6c5300538b9b5a0a; evidencebbd8134c32b2eea64ba3a25823aa8c8ab26bc4e0; datasetsd53046f57e23ea20ddcacb311d29fab05fa07d9c; historicaldocs6d21b4c852a4821eca2e7d8fe2715679692f577e.

## Reviews and status
- Claude Opus5.5,initial,PASS,0blocker/0major/2minor/4note; demo exact comparison and run-order assertion adopted.
- Luna tests-only stage reviewed before product stage; first permutation draft corrected to fixed run identities before final RED.
- Claude Opus 5.5, milestone, PASS conditional on bundle check, 0 blocker / 0 major / 1 minor / 5 notes.
- Minor resolved: git diff --ignore-cr-at-eol -- bin/ empty; index refresh stages no bundle change. Bundle excluded.
- Notes adopted: demo limitation, consumer list, RED names, borderline overflow rounding. Optional test deduplication deferred.
- IEEE754 rounding remains; ascending sum is deterministic for a run set, not exact arithmetic.
- Implementation commit `7654bdc` pushed; Draft PR #102 targets main `ee53fa0`. Post-Draft gates and audit PASS; Ready/merge/next Task not authorized.

- RED failures: `is independent of ledger order` and `sums every ledger permutation in ascending cost order`; actual 1e16, expected 10000000000000002.
- Plan deviations: none. The finite overflow guard is unchanged; borderline rounded totals can change under the approved summation order.

## Final review
- Post-Draft: 142 targeted PASS; 3250 full PASS / 5 existing SKIP. typecheck/build/smoke:mcp/validate:plugin/score:research/check:exact/diff PASS.
- Final audit: demo byte-identical; one existing expectation migration; protected artifacts, wrappers, package/scripts and normalized bundle unchanged.
- Primary Astra, final, PASS WITH NOTES, 0 blocker / 0 major / 0 minor; checked actual diff, RED/GREEN logs, scope, documentation and Draft head `7654bdc`. User previously confirmed session model via /model.
- Remaining notes: IEEE754 rounding and borderline overflow behavior; O(n log n) time/O(n) cost storage per arm; demo has null costs; external/untracked consumers outside impact survey.
- No additional code refactor needed. Final record-only commit follows; approval remains with user.
