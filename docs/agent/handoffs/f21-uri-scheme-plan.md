# F-21 URI scheme — phase 1 handoff

- Tier E: measured impact survey and implementation plan only.
- Base: main `5559330`; branch: `codex/f21-uri-scheme-plan`.
- Scope: lane-split-f21 brief and referenced f21-plan brief; no phase-2 authorization.
- Plan: inventory existing inputs, simulate E-1/E-2, preserve full results, propose TDD/oracle/performance gates, single commit/push/Draft PR, stop.
- Deliverables: [plan](../../superpowers/plans/2026-10-24-f21-uri-scheme.md), [raw JSON](../../research/evidence/f21/2026-10-24T10-31-03-266Z.json), `scripts/analyze-f21-uri-impact.mjs`.
- Existing [project handoff](../HANDOFF.md) remains unchanged; root ignored `HANDOFF.md` tracks local delivery state.

## Results and decision
- 177,535 source rows; 174,661 unique repository inputs; 34 synthetic examples counted separately.
- URI matches 11,382: URI-only 5,078; other exact reasons 6,277; same-secret masking 27.
- Mode changes (a/b/c): 5,077 / 1,754 / 5,075; semantic changes: 1 / 1 / 1.
- Recommended b/secret: 1,753 exact→unknown; 2,087 still-exact reason changes; 3,841 complete-result changes.
- E-2 uri adds 4 / 7,515 / 8 changed result arrays, no additional mode changes.
- Recommend E-1 (나): immediate defined non-JS-whitespace suffix; E-2 retain secret. Decisions pending.
- Historical oracle/120 fixtures remain immutable; future explicit versioned expectation overlay is proposed.
- Risks: intended lossy boundary change, residual key:value false positives, public-label compatibility, finite inventory coverage.

## Validation and review
- RED: not applicable to phase-1 planning; no product behavior or tests changed. Phase-2 RED cases are specified in the plan.
- `npm.cmd ci`: existing lockfile dependencies installed; no package changes.
- `node scripts/analyze-f21-uri-impact.mjs`: PASS; frozen120/corpus match, bounded candidate regex checks and forbidden diff assertions.
- `node .artifacts/run-gates.mjs pre-pr`: PASS; build, tests, typecheck, smoke:mcp, validate:plugin all exit 0.
- Tests: 33 files, 874 passed, 1 skipped (875 total).
- Final delivery checks: syntax, JSON source hashes/row counts, whitespace and allowed-file diff; post-Draft gate results are reported in PR/final report to preserve the requested single commit.
- Early survey OR-condition/input-inventory errors were corrected before final evidence; exploratory outputs are retained in ignored scratch.
- Provider: native executor/explorer/writer, draft stage, DEGRADED due to usage limits; exact delegated model unverified. Primary Codex completed the draft under explicit fallback permission.
- Independent Claude: initial task brief supplied; plan review pending after delivery as requested. No completed independent cross-check is claimed.
- Primary final review: phase-1 evidence and scope only; E-1/E-2, implementation and Claude plan approval remain pending.
- NOT RUN: phase-2 TDD, before/after performance measurements and retrieval benchmark; no production change exists to evaluate.

## Stop / next owner
- One `Agent: codex` commit, push and Draft PR against main; no Ready or merge.
- No edits to src/tests, existing evidence/oracle, research/, codex_review/, or paper/.
- Await Claude plan review, user E-1/E-2 decision and the separate phase-2 handoff.
- Do not start lane tasks 2–4.
