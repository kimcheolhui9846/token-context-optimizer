# Pilot Coverage Implementation Plan

**Goal:** Audit pilot structure without counting translations as independent families.
**Architecture:** Validated family aggregation plus read-only CLI and development-only seed.
**Stack:** Existing Node/TypeScript/Vitest and dataset/scoring helpers; no new dependencies.

- [x] Write failing unit tests for family aggregation, quota gaps, cross-category family
  conflicts, empty language strata, translation invariance and complete target structure.
- [x] Implement `auditPilotDataset` in `src/research/pilot.ts`; preserve base validation.
- [x] Author `docs/research/datasets/development-seed.json` with 12 bilingual families;
  derive exact source hashes, inspect content independently and validate the actual artifact.
- [x] Add real compiled CLI tests before implementing `scripts/audit-pilot.mjs` and
  npm `audit:pilot`; keep invalid content out of diagnostics.
- [x] Document seed provenance, structural targets, current gaps, primary comparison,
  manual curation limits and pending exact-check references in the dataset card.
- [x] Resolve independent test/code/content review findings and run the full gate.
- [x] Update HANDOFF with PR #8 merge and new evidence; commit/push/open a new PR.

PR: https://github.com/kimcheolhui9846/token-context-optimizer/pull/9 (approval required before merge).
