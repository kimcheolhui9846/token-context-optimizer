# F-21 URI scheme — phase 1 handoff

- Tier E: measured impact survey and implementation plan only.
- Base: main `5559330`; branch: `codex/f21-uri-scheme-plan`.
- Scope: latest f21-plan-revision brief, C-1/C-2; same PR61, no phase-2 authorization. Then read-only PR60 review, no comments.
- Plan: inventory existing inputs, simulate E-1/E-2, preserve full results, propose TDD/oracle/performance gates, single commit/push/Draft PR, stop.
- Deliverables: [plan](../../superpowers/plans/2026-10-24-f21-uri-scheme.md), [raw JSON](../../research/evidence/f21/2026-10-24T10-31-03-266Z.json), `scripts/analyze-f21-uri-impact.mjs`.
- Revision evidence: [b+E-3 JSON](../../research/evidence/f21/2026-10-25T03-01-33-014Z.json); original JSON unchanged.
- Existing [project handoff](../HANDOFF.md) remains unchanged; root ignored `HANDOFF.md` tracks local delivery state.

## Results and decision
- 177,535 source rows; 174,661 unique repository inputs; 34 synthetic examples counted separately.
- URI matches 11,382: URI-only 5,078; other exact reasons 6,277; same-secret masking 27.
- Mode changes (a/b/c): 5,077 / 1,754 / 5,075; semantic changes: 1 / 1 / 1.
- Recommended b/secret: 1,753 exact→unknown; 2,087 still-exact reason changes; 3,841 complete-result changes.
- E-2 uri adds 4 / 7,515 / 8 changed result arrays, no additional mode changes.
- E-1 (나) and E-2 secret selected conditional on E-3. Extend tuple #0 with 13 fixed credential labels, ASCII boundaries/case, space/tab between words, trailing JS whitespace before colon/equals; preserve old #0 via OR. No tuple renumbering.
- C-2 adopted: independent small-input policy-baseline-f21.ts oracle; explicit overlay only for changed characterization rows. Historical oracle/120 fixtures remain immutable.
- Risks: intended lossy boundary change, residual key:value false positives, public-label compatibility, finite inventory coverage.
- Re-measured b+E-3: same repository mode/full-result changes as b (1,754 / 3,841), semantic 1, newly exact vs current/b both 0. No repository new-exact example exists.
- Review 20: b semantic8/unknown12 → b+E-3 exact secret20. Separate examples API KEY =, credentials =, passwd = hunter, secret answer = fluffy: current unknown→exact.
- Prototype: 7 recipes × 1/5/10 MiB × 5 samples × 2 predicates, no RangeError; combined #0 10MiB medians 36.52–363.44ms. Full production performance remains phase2.

## Validation and review
- RED: not applicable to phase-1 planning; no product behavior or tests changed. Phase-2 RED cases are specified in the plan.
- `npm.cmd ci`: existing lockfile dependencies installed; no package changes.
- `node scripts/analyze-f21-uri-impact.mjs`: PASS; frozen120/corpus match, bounded candidate regex checks and forbidden diff assertions.
- `node .artifacts/run-gates.mjs pre-pr`: PASS; build, tests, typecheck, smoke:mcp, validate:plugin all exit 0.
- Tests: 33 files, 874 passed, 1 skipped (875 total).
- Revision: survey execution, syntax, source/script hashes, raw-row counts, exact 20 payload probes: PASS. revision-pre-push five npm gates: PASS (874 passed,1 skipped).
- Final delivery checks: syntax, JSON source hashes/row counts, whitespace and allowed-file diff; post-Draft gate results are reported in PR/final report to preserve the requested single commit.
- Early survey OR-condition/input-inventory errors were corrected before final evidence; exploratory outputs are retained in ignored scratch.
- Provider: native executor/explorer/writer, draft stage, DEGRADED due to usage limits; exact delegated model unverified. Primary Codex completed the draft under explicit fallback permission.
- Revision provider: native executor role produced a partial draft; exact runtime model unverified, routing DEGRADED. Primary corrected probe masking, regex escaping, invalid new-exact examples and performance path; intermediate JSON retained in ignored scratch, excluded from delivery.
- Independent Claude: supplied PR61 plan review, CHANGES REQUESTED, 1 major C-1 and 1 minor C-2. This revision addresses both; Claude re-review remains pending.
- Primary final review: revised phase-1 evidence and scope only; implementation and Claude re-review remain pending.
- NOT RUN: phase-2 TDD, before/after performance measurements and retrieval benchmark; no production change exists to evaluate.

## Stop / next owner
- One additional `Agent: codex` revision commit and push to existing Draft PR61; no Ready or merge.
- No edits to src/tests, existing evidence/oracle, research/, codex_review/, or paper/.
- Await Claude re-review and the separate phase-2 handoff. The single semantic transition in repository evidence reflects absent credential-in-prose coverage; keyword-free Wifi labels remain unprotected.
- Do not start lane tasks 2–4.
