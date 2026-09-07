# Offline Research Scoring Plan

**Goal:** Protect evaluation references from model inputs and make run accounting explicit.
**Architecture:** Pure validated projections/aggregations; read-only CLI; no model calls.
**Stack:** Existing Node crypto, Zod, TypeScript and Vitest.

- [x] Write failing tests in `tests/research-scoring.test.ts` for field allowlisting,
  fingerprint mismatch, duplicate/out-of-plan runs, failed/missing/ungraded runs,
  fact/contradiction/exact gates, unknown costs and all-run latency statistics.
- [x] Implement `buildModelInputs`, `fingerprintDataset` and `scoreEvaluation` in
  `src/research/scoring.ts`; reject invalid inputs without echoing submitted values.
- [x] Add real compiled-entrypoint tests before implementing `scripts/score-research.mjs`
  and `score:research`; include a synthetic ledger for the existing format demo.
- [x] Document ledger format and metric definitions in `docs/research/scoring.md`.
- [ ] Resolve independent test/code review findings with focused regressions.
- [x] Run full test/build/typecheck/MCP/plugin/benchmark/dataset/scoring/diff checks.
- [ ] Record merge evidence and new feature evidence in HANDOFF; commit/push/open PR.
