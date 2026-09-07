# Research Dataset Validation Implementation Plan

**Goal:** Reject invalid research manifests and declared split leakage before evaluation.
**Architecture:** Pure Zod-backed validator plus read-only CLI; research code stays outside MCP runtime.
**Tech stack:** Existing TypeScript, Zod v4, Node crypto/fs and Vitest; no new dependencies.

## Task 1: Manifest Contract

- [x] Add `tests/research-dataset.test.ts` with a valid record builder and tests for
  shape, hashes, rubric/category consistency, ID uniqueness, family splits and source reuse.
- [x] Run `npm.cmd test -- --run tests/research-dataset.test.ts` and record RED.
- [x] Implement `validateDataset(input: unknown): DatasetValidationResult` in
  `src/research/dataset.ts`. Use strict nested schemas, then linear maps for cross-record
  checks. Diagnostics contain only trusted field paths and stable codes.
- [x] Rerun targeted tests and typecheck, record GREEN; address test-engineer feedback.

## Task 2: CLI And Usable Example

- [x] Add real-process tests: valid file returns JSON/0; malformed JSON, missing file,
  invalid record and extra arguments return JSON/1 without echoing sensitive data.
- [x] Record RED, then implement `scripts/validate-dataset.mjs` and npm script
  `validate:dataset`. Reuse the existing strict JSON parser and load the compiled validator.
  Pass only a path; no commands execute.
- [x] Add `docs/research/datasets/format-demo.json` and document the v1 fields, usage,
  normalization and validator limits in `docs/research/dataset-format.md`.
- [x] Build and run the example via `npm.cmd run validate:dataset -- docs/research/datasets/format-demo.json`.

## Task 3: Review And Handoff

- [ ] Obtain bounded independent code review including malformed data, leakage,
  diagnostics and performance complexity. Address blockers with regression tests first.
- [x] Run full test/build/typecheck/MCP smoke/plugin validation/benchmark/diff gates.
- [ ] Update handoff with RED/GREEN, review evidence and remaining research milestones.
- [ ] Commit, push `feature/research-dataset-validation`, create stacked PR against
  `feature/semantic-degradation-fixtures`; do not merge without explicit approval.
