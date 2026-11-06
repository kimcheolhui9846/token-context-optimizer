# N-27/N-30 credential implementation

- Tier E; base `0bc79590f926a38d53b11b470b23926ff9f1377e`, branch `codex/n27-n30-credential-impl`.
- Contract: [approved plan](n27-n30-credential-plan.md), including six classifier-output assertions and one E3 source assertion. No further existing expectations changed.
- Status: PASS WITH NOTES; [Draft PR #97](https://github.com/kimcheolhui9846/token-context-optimizer/pull/97). Implementation, impact, performance and post-Draft local gate complete. Ready/merge not performed.
- Product: four existing tuple-0 regexes changed in place; flags, boundaries, other tuples, fallback and reason order preserved. Design paragraph and generated bundle updated.
- Exclusions: underscore emphasis, quotes/parentheses (N-32), strike, fullwidth equals, code spans, brackets, plurals and new internal label separators.

## TDD and verification
- RED `67ed3eb`: 224 expected failures / 2,056 passes / 5 skips across the suite excluding unfinished N27 performance tests. Existing failures are only three migrated N17 cases and one E3 source test (seven assertions); 220 failures are new N27 tests.
- GREEN `510bf3e`: targeted 852 PASS; three subsequent boundary tests raise targeted count to 855 PASS. The initial full run included 51 then-uncommitted evidence tests: 2,331 PASS / 5 skips. Post-Draft full gate at `01cd0c8`: 2,334 PASS / 5 skips, 46 files; typecheck/build/`smoke:mcp`/`validate:plugin`/exact demo/`git diff --check` PASS.
- New tests freeze 468 label/form/placement outputs, nine verbatim negatives, 36 boundary placements and four underscore sentences. Expected outputs are literal tables, not runtime classifier/regex derivations.
- Frozen N27 baseline equals `0bc7959` policy except relocated type import. Differential corpus preserves old positives for all four frozen regexes; other tuple source strings unchanged.
- N27 evidence validator: 51 synthetic tests PASS, covering malformed/hash/order/output inputs, bootstrap, FAIL/INVALID precedence, one retry, 1 ms representative floor, six block medians and exact recipe units.
- Original N17 tools, evidence and evidence tests, plus historical planning impact script/JSON, remain unchanged (11 files checked against base).
- Reproduce gates: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run check:exact -- docs/research/datasets/development-seed.json docs/research/datasets/exact-response-demo.json`.

## Impact rerun
- New script `research/src/n27-n30-credential-impact-impl.mjs`; output `research/results/n27-n30/2026-11-06-implementation-impact.json`. Run from a clean built `0bc7959` checkout with `node research/src/n27-n30-credential-impact-impl.mjs --out <new-output>` (copy the script there); GREEN source intentionally fails baseline guards.
- Two separate processes produced identical bytes, SHA-256 `c9f9e16c53c9bfac343fc2405a0403e7467771c4eff0b40bcd31d6d2fef311ef`.
- PRE `27b4356`: 208 Markdown / 23,720 unique units / 9 new hits / 0 mode / 9 reasons changes.
- Base `0bc7959`: 210 / 23,939 / 17 / 2 / 16; new hits beyond PRE are plan/handoff content only. Sensitivity excluding exclusively plan/handoff provenance: 11,063 units, zero changes.
- Fixtures: 206,242 occurrences / 203,233 unique / 4 mode and reasons changes; unchanged from planning survey. Primary verifies actual GREEN source is exactly the investigated four-literal overlay.
- This is a bounded pinned-input survey, not a complete integration execution trace.

## Performance preregistration
- New N27 runner/analyzer and evidence paths preserve historical N17 artifacts. Twenty exact-10-MiB recipes: 8 new worst + 7 N17 worst + 5 representatives; 720 warmup and 2,160 measurement cells.
- A/A-prime independently compiled from `0bc7959`; B compiled from committed product source; distinct file modules with source/build/input/output hashes. Separate untimed instrumentation checks tuple #0.
- Warmup12/measured36, six measured blocks, each containing all six permutations; seeds `0x4e173001`/`0x4e173002`, 10,000 whole-block bootstrap, threshold1.03, A-prime/A band[0.97,1.03].
- BORDERLINE is boundary pass with six per-block medians of paired round ratios; no remeasurement. Representative variant median below1ms is INVALID. Priority INVALID>FAIL>BORDERLINE>PASS; local FAIL prevents retry.
- At most one identical-protocol retry after INVALID-only attempt1. Any FAIL or invalid attempt2: commit evidence, push Draft, report and stop without recipe/regex tuning.
- Tools/tests `7004539`; manifest `2c28431` committed before successful `--check` and `--measure1`. Negative control: uncommitted manifest correctly rejected. Attempt2 requires committed eligible attempt1 evidence.
- Attempt1: PASS14 / BORDERLINE6 / FAIL0 / INVALID0, overall BORDERLINE (approved boundary pass); no retry. [Twenty-recipe results, intervals and block medians](../../research/evidence/n27/result.md). Stored analysis reproduced exactly; separate Python reference reproduces all point/AA/CI/block/variant medians. Sandbox could not resolve Python; approved unsandboxed execution succeeded.

## Reviews and next step
- Claude `claude-opus-5-5`, initial plan: APPROVE WITH CHANGES, blocker0/major3/minor8; addressed by clean-baseline separate impact output, exact migration/failure inventory, and independent build provenance.
- Luna first passes were corrected after direct inspection: runtime-derived oracle replaced, wrong recipe units repaired, N17 retry/provenance safeguards restored and representative gate tested. No timing was run on rejected drafts.
- Dependency install reported seven existing advisories; no dependency changes made.
- Ready and merge require explicit user approval. Stop after this Task; no next Task implementation.
- Claude claude-opus-5-5 milestone: APPROVE WITH MINOR CHANGES, blocker0/major0/minor5/nit4. Added clean-tree measurement guard and four-star negatives for E3/Korean/API paths. Never delete or discard an attempt, including incomplete/uncommitted evidence; commit every attempt before further action.
- Review limitations accepted: runner Git guards are reviewed controls with real preregistration checks, not a temp-repository integration test. Bundle/baseline helper/impact raw data were primary-verified; only their diff/summary assertions were in this milestone packet. Build equivalence is asserted during prepare. Environment drift before any timing requires a new reviewed committed manifest; after timing, stop rather than replace it. Locally invalid A/A-prime noise may mask a point above1.03 and remains INVALID; completed valid local FAIL always prevents retry. Per-round untimed JSON saves may affect later GC/cache noise; balancing does not prove noise removal.
- Claude `claude-opus-5-5`, evidence closure: APPROVE WITH MINOR CHANGES, blocker0/major0/minor4/nit5. Supplied manifest/result/recomputed analysis only; no raw-sample re-execution. Addressed counts, source-blob chain, drift/noise and ~1–2% measured slowdown disclosures. Added whitespace readability/coverage limits to result; immutable manifest unchanged. Scratch recomputed analysis is not an independently attested artifact; committed raw evidence and its hash are authoritative.
- Primary Astra final: PASS WITH NOTES, blocker0/major0; direct scope/diff, source/helper preservation, test logs, impact bytes, raw statistics and Draft state checked. Performance is approved boundary pass, not proof of a <=3% upper confidence bound; B-only matching paths were not timed. Await user approval before Ready, merge or next Task.
