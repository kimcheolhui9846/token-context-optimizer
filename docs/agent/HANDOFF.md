# Codex Handoff

## Current Objective

PR #13 and PR #14 were merged in dependency order after explicit user approval
on 2026-09-10. Integration and post-merge review are complete. This branch,
`docs/research-post-merge-review`, records the outcome only; it changes no runtime
or tests and is subject to the normal PR flow. No further merge is authorized.

## Merge And Integration Review (2026-09-10)

- [PR #13](https://github.com/kimcheolhui9846/token-context-optimizer/pull/13):
  reviewed head `138a0f1`, merge `eba3fa8b386dc59e93973cf24dbea2de04d067c0`
  at 18:34 KST. The merged tree exactly matched that head.
- After verifying PR #13 was merged, PR #14 was retargeted to `main`. Its
  comparison retained exactly the intended 15-file mock-runner slice.
- [PR #14](https://github.com/kimcheolhui9846/token-context-optimizer/pull/14):
  head `9dc93a0`, merge `4e9b7c562b7f08fc24e79e615f68b467cbf8eeda`
  at 20:56 KST. Its merged tree exactly matched the pre-merge tested head.
  No force push, conflict edit, branch deletion or provider call occurred.
- Pre-merge at 18:29 KST: 210 targeted and all 570 tests passed, followed by
  build, typecheck, MCP smoke, plugin validation and benchmark. GitHub reported
  no CI checks; local gates are evidence, not a claim of hosted CI coverage.
- Post-merge at 20:56-20:57 KST on `4e9b7c5`: 210 targeted and all 570 tests
  passed again; build, typecheck, MCP smoke, plugin validation and benchmark
  passed. Existing benchmark p95: exact 1.26 ms, semantic 1.38 ms, code 0.76 ms
  (20 samples each). These descriptive local timings are not model measurements.
- Both demo CLI forms returned identical valid reports: 288 completed slots,
  virtual 288 ms, settled 1152 microUSD, remaining 848 microUSD and held 0.
  All three input hashes were preserved; preflight and dispatch stayed false.
- Independent post-merge `code-reviewer` Popper inspected 13 integration files,
  ancestry/tree comparisons and focused diagnostics: APPROVE, zero findings.
  Independent `architect` Pauli confirmed preserved planner/mock/scorer authority
  boundaries: CLEAR. Neither reran the test suite; fresh gates above are
  controller-owned. Final integration synthesis: APPROVE, no identified defect.
- Review limitations: no real provider behavior, cancellation/billing behavior,
  human grading, paired statistical analysis or scientific outcomes were tested.
  The [readiness checklist](../research/2026-09-07-layered-adaptation-evaluation-protocol.md#readiness-and-acceptance)
  remains the source of required experiment gates.

## Previous Checkpoint: Mock Runner PR Handoff

The offline mock-runner implementation is complete and PR #14 has been pushed
and updated for review, not merged. Final whole-branch review at `4b61277`
returned architect CLEAR and two code-review findings; fix `b290748` resolved
the stale next steps and two missing boundary characterizations without changing
runtime. Scoped code re-review returned both ADDRESSED, SPEC PASS / QUALITY
APPROVE / overall APPROVE; scoped architect review retained CLEAR.
Fresh controller verification on 2026-09-10 at 16:30 KST passed 116 mock tests,
all 570 tests, build, typecheck, MCP smoke, plugin validation and benchmark.
Both demo CLI forms subsequently matched and preserved input hashes. Existing
benchmark p95 was exact 1.43 ms, semantic 1.45 ms, code 0.83 ms; the separately
archived mock timing remains median 1.71 ms / p95 3.29 ms. These are local software
measurements, not model results. This final bookkeeping is documentation-only.
Do not repeat completed implementation tasks. The chronological checkpoints
below retain earlier counts and superseded pending states for provenance.

Current branch: `docs/research-mock-runner-design`, based on PR #13 head
`138a0f198d3ffa2e7fc0f98a84188a1628ff7dd9`. The user approved documenting the
deterministic virtual-time mock runner on 2026-09-09. The
[written specification](../superpowers/specs/2026-09-09-research-mock-runner-design.md)
defines strict scenario binding, deadline precedence, reservation/settlement rules,
unknown-cost stops and explicit not-started slots. The user subsequently approved
the written specification and requested the
[implementation plan](../superpowers/plans/2026-09-09-research-mock-runner.md).
Its four tasks cover strict parsing, simulation, CLI, and docs/performance evidence.
The interrupted planning task resumed on 2026-09-09 at 23:12 KST. This is an
implementation slice: the user approved subagent-driven execution after plan
commit `ac655c0`. Baseline at 23:17 KST passed 94 targeted and all 454 existing
tests. Task 1 (scenario parser) is complete at `07ea414`: 45 behavioral RED,
45 GREEN, typecheck and 499 total tests passed; independent test-engineer returned
SPEC PASS / QUALITY APPROVE. The leaf Git approval stalled, so main performed
the commit without modifying the implementation. Task 2 (simulator) is complete
at `0d1916d`: initial 2 RED/GREEN, 18-case boundary expansion with 10 RED then all
GREEN, and 11 additional contract characterizations brought coverage to 29 tests.
The implementer hit its usage limit after reporting all 528 tests passing; on
2026-09-10 at 09:59 KST main freshly reran 188 targeted/528 total tests, typecheck
and build, all passing. Independent test-engineer returned SPEC PASS / QUALITY
APPROVE with no findings. Task 3 (CLI) is complete at `dce86a2`, with cleanup fix
`8822223`: inert CLI RED 12 failures/23 passes, then GREEN 35 process tests.
Independent review found a Windows-only fixture cleanup guard; POSIX RED 1/5,
then GREEN 5/5 and 40 CLI tests after correction. Scoped re-review returned
ADDRESSED, SPEC PASS / QUALITY APPROVE with no new breakage.

Main freshly ran 114 mock tests, all 568 tests, build/typecheck/MCP/plugin gates
and the existing benchmark at 10:19-10:20 KST on 2026-09-10. All passed.
Existing benchmark p95: exact 1.34 ms, semantic 1.42 ms, code 0.94 ms (20 samples
each). Separate simulator evidence at core `0d1916d` records 20 in-memory calls:
median 1.71 ms, p95 3.29 ms; raw data is in
`docs/research/evidence/2026-09-10-mock-run-local.json`. These are local software
timings, not hosted-model or empirical research results.

Task 4's writer hit a usage limit without writing a report or changing the draft.
Main resumed document finalization on 2026-09-10 at 15:43 KST, retaining the
prepared demo/evidence. Fresh build, direct CLI and npm alias passed with 288
completed slots, virtual 288 ms, cost 1152 microUSD, remaining 848 microUSD and
unchanged input files; preflight and dispatch flags remain false. Final independent
whole-branch reviews and PR transport remain required before completion.
Resume gate at 15:45-15:46 KST passed 114 mock tests, all 568 tests, typecheck,
MCP smoke, plugin validation and benchmark again; fresh build and both demo CLI
forms also passed. No runtime/test changes occurred in this docs-recovery phase.
No model access, upload, spending or merge is authorized.

The implementation PR is stacked on `docs/research-run-preflight-design`; PR #13 remains a
separate prerequisite and must not be merged without explicit approval. Determine
live PR state with GitHub rather than assuming it from these notes.
PR: https://github.com/kimcheolhui9846/token-context-optimizer/pull/14
Specification commit: `e043f61`. Independent architect review returned CLEAR with
no blocking design ambiguity; this is not implementation or provider approval.

Plan self-review maps every spec section to a task and pins exact interfaces,
deadline/cost boundaries and independent expected values. A bounded test-engineer
consultation identified existing CLI patterns for compiled isolation, malformed
UTF-8 controls, escaped duplicate keys, redaction and byte preservation. These are
planning inputs, not a full implementation review or new test results. The baseline
scenario digest was computed independently with Node crypto before runtime work.

Planning-resume verification at 23:14 KST: 94 targeted and all 454 existing tests
passed again, followed sequentially by build, typecheck, MCP smoke, plugin validation
and benchmark. Existing benchmark p95: exact retrieval 1.26 ms, semantic summary
1.37 ms, code fixture 0.87 ms (20 samples each); not mock-runner performance.
Seventeen local documentation links and 13 embedded code-snippet syntax checks
passed. Snippet syntax checks are not type checks or execution of a new runner.
At that planning checkpoint all 33 implementation/start-gate checkboxes were
unchecked. No runtime files changed in that planning slice, and `git diff --check` passed.

Docs-only verification on 2026-09-09 at 19:01 KST: 94 targeted run-plan/CLI tests
and all 454 existing tests passed, plus build, typecheck, MCP smoke, plugin validation
and benchmark. Existing benchmark p95: exact retrieval 1.32 ms, semantic summary
1.52 ms, code fixture 0.95 ms (20 samples each). These are not mock-runner timings.
Thirteen local documentation links resolved; the new spec has no TODO/TBD/FIXME
placeholders, and `git diff --check` passed. No new TDD cycle is claimed for prose.

## Previous Slice: Run Preflight

PR #12 was merged with explicit user approval as `2cc7ce2`. Its verified head was
`e2046ac`; merged content matched that head and all 360 tests passed after integration.
The prior merge evidence is retained in the
[PR comment](https://github.com/kimcheolhui9846/token-context-optimizer/pull/12#issuecomment-5588747971).

Previous branch: `docs/research-run-preflight-design`. On 2026-09-09 the user approved
the written specification and requested implementation of offline run configuration,
preflight and reproducible scheduling. Implementation, the full gate and independent
branch reviews are complete. Work is tracked under
`docs/superpowers/plans/2026-09-09-research-run-preflight.md`; plan commit `157550d`.
No paid inference, training, data upload, credential access or merge is authorized.

Specification: `docs/superpowers/specs/2026-09-09-research-run-preflight-design.md`.
The mock runner and paired analysis remain separate subsequent design/PR scopes.
Pull request: https://github.com/kimcheolhui9846/token-context-optimizer/pull/13
Reviewed specification commit: `801c6ca`. PR #13 is updated with this first
implementation slice; explicit merge approval remains pending.

## Run Preflight Implementation (2026-09-09)

- Fresh baseline: all 360 tests passed at `749e065` before implementation.
- Main owns docs and package/script integration. The first executor hit a usage
  limit; a resumed executor paused after a failed large patch and deleting the old
  test, with no commands running. Both were closed. Main recovered the core inline;
  no interrupted-agent output was counted as completion or approval.
- Core TDD: original test RED, then expanded 71/71 RED against callable stub at
  11:22 KST, 71/71 GREEN after implementation. Known-answer digest vectors were
  generated independently with Node crypto before production code.
- Core `c6b9084`, boundary tests `148d0fc`, review precision fixes `abd3cba`.
  Five additional post-GREEN boundary characterizations brought coverage to 76;
  these additions are not described as new RED/GREEN implementation cycles.
- Independent test-engineer: SPEC PASS, initially QUALITY REQUEST CHANGES for
  complete output-key and issue-path assertions. Both strengthened without runtime
  changes; reviewer returned QUALITY APPROVE. Core 76 tests and typecheck/build pass;
  integrated core/pilot/scorer 133 passed before the five extra characterizations.
- Task 2 executor committed only CLI and process tests as `14f390a`. Observed RED:
  17 failures and one input-preservation pass against an inert CLI. Two subsequent
  failures came from CRLF-sensitive duplicate-key test construction; corrected to
  minified JSON without changing production code. Final 18 CLI tests and typecheck
  passed. UTF-8 fixtures keep lossy-decoded inputs otherwise valid to isolate decoding.
- Main independently reran 94 core/CLI tests, then all 454 tests; all passed.
  Build, typecheck, MCP smoke, plugin validation and existing benchmark gates passed.
  CLI example returns 288 slots, preflight false and dispatchAllowed false; the seed
  audit still reports valid schema and meetsPilotStructure false.
- Link/dataset/timing checks passed: 23 local links, eight anchors, demo fingerprint,
  and raw-sample percentile arithmetic. Existing semantic benchmark p95 1.39 ms,
  exact-log 1.27 ms, code-fixture 0.82 ms (20 samples each); local evidence only.
- Scheduler local sample at code `148d0fc`: 20 iterations, one warm-up, 288 slots;
  median 1.46 ms, p95 2.34 ms. Raw samples/Node/OS/CPU metadata are archived in
  `docs/research/evidence/2026-09-09-run-preflight-local.json`. Not hosted performance.
- Local execution ledger and task reports are under
  `.superpowers/sdd/2026-09-09-research-run-preflight/` while work is active.
- Existing feature checkout is used in place; no new worktree or model access.
- Resume verification at 18:13 KST on `5b9797d`: 94 targeted and all 454 tests passed
  again, plus build/typecheck/MCP/plugin gates. Existing benchmark also passed;
  semantic p95 1.55 ms, exact-log 1.46 ms, code-fixture 0.99 ms (20 samples each).
  The npm `plan:research` example was executed successfully as well as the direct CLI.
- Final independent review of `2cc7ce2..5b9797d`: code-reviewer reported Task 2 SPEC
  PASS / QUALITY APPROVE and overall APPROVE, with zero findings across 15 files.
  Reviewer independently reran 18 CLI tests and compiler diagnostics successfully.
  Architect returned CLEAR, no unresolved/parked concerns. Unchecked evidence refs
  must not become sufficient authorization in the future runner.
- All task implementers/reviewers are closed after review. No mock runner,
  spending enforcement, provider execution or family-paired analysis was added.

## Run Preflight Design (2026-09-09)

- Prior read-only architect exploration recommended manifest/preflight/schedule first,
  reusing dataset validation/fingerprinting and pilot auditing without changing scorer
  semantics. That recommendation was scope advice, not runtime approval.
- The new specification separates syntactic completeness and referenced evidence from
  actual model access, authentic approval and execution safety. `dispatchAllowed`
  remains false even for fully populated synthetic fixtures.
- Proposed schedule freezes SHA-256 ranking and explicit seed, preserves scorer slot
  keys, and never emits model answers, rubric content or invented outcome records.
- Fresh regression verification: 62 targeted pilot/scoring tests and all 360 tests
  passed; build, typecheck, MCP smoke and plugin validation passed. Link assertions
  checked 10 local links, three anchors, count arithmetic and no spec placeholders.
  The first inline Node assertion command failed from PowerShell argument quoting;
  the corrected stdin-based check passed. This was not a product test failure.
- Seed audit still reports valid schema, 24 records / 12 development families and
  `meetsPilotStructure: false`. The old merged head/content comparison is empty.
- Existing benchmark gates passed after the regression processes finished: semantic
  p95 1.44 ms, exact-log p95 1.64 ms, code-fixture p95 1.02 ms; 20 samples per case,
  Node v24.18.0 on Windows. These are existing local engineering measurements, not
  measurements of the proposed scheduler or hosted model performance.
- Independent code reviewer initially requested explicit public/CLI output contracts.
  Added exact fields/order, flag formulas, safe issue vocabulary/order, API error
  precedence and CLI envelopes. Reviewer reread the revision and returned `APPROVE`
  with zero remaining findings. Architect returned `CLEAR` before and after this
  clarification, with no actionable blocker. Neither reviewer claimed runtime tests.
- Main reran all 360 tests after the clarification; all passed. Updated assertions
  passed for 10 local links, three anchors, 14 execution fields and count arithmetic.
- At design handoff, written-spec approval was still required. The user subsequently
  approved it; the implementation section above records the resumed task. Merge
  approval is separate and remains pending.

## README And Protocol Review (2026-09-08)

- README now links the paper outline, model evidence and detailed protocol/readiness
  checklist, distinguishing research software from measured model outcomes.
- Protocol clarifies four initial context arms, an exact bilingual sampling proposal,
  576 slots per development/pilot-test split, planned-slot failure accounting,
  grading/clustered-analysis requirements, deferred layer studies and unresolved gates.
- The historical source register remains dated; current implementation baseline is
  `edf1901`, not a frozen experimental manifest. The manuscript does not yet exist.
- The seed remains 24 records / 12 development families with no train/test families.
  Human independence/provenance review is required; IDs are not proof of independence.
- Main verification: 62 targeted pilot/scoring tests and all 360 tests passed; build,
  typecheck, MCP smoke, plugin validation and seed validation passed. Node assertions
  checked 17 relative links, six anchors, all count arithmetic and absent manuscript.
  Actual auditor: `meetsPilotStructure: false`, splits 0/12/0 as documented.
- Benchmark rerun after the full test process completed: all gates passed; local
  semantic p95 1.31 ms (20 samples). Descriptive local engineering evidence only,
  not hosted latency, a controlled speedup comparison or experimental model results.
- The first independent review attempts stopped at the usage limit without verdicts;
  neither counts as approval. Resumed on 2026-09-09 with fresh critic/verifier agents.
- Resume verification: 62 targeted tests and all 360 tests passed again; build,
  typecheck, MCP smoke and plugin validation passed. Node rechecked 17 relative links,
  six anchors, count arithmetic, seed split/cardinality and the absent manuscript.
- Independent verifier returned `PASS` after actual-file/link/anchor/arithmetic/seed
  and scorer/auditor consistency checks; no runtime tests claimed by that reviewer.
- Critic independently reran 62 pilot/scoring tests and accepted the concrete protocol,
  but requested two paper-plan corrections: remove an obsolete merge step and replace
  ambiguous combined-variant language with separate controlled studies. Both corrected;
  critic reopened the revised paper plan and returned `APPROVE` with no new findings.
  Main reran all 360 tests after those corrections; all passed. This is documentation
  review, not a new TDD cycle or proof that live experiments are ready.

## Model Selection Preparation (2026-09-08)

- Merged: https://github.com/kimcheolhui9846/token-context-optimizer/pull/10
- Fresh pre-merge verification: 77 targeted and all 360 tests passed; build/typecheck,
  MCP smoke/plugin validation/exact demo/benchmark passed. Semantic local p95:
  2.13 ms. GitHub had no configured status checks. Merge matched verified head
  `bc195708dc161cc6055bf1f74d046d06f750896d`; post-merge content diff was empty.
- Prior research documents had not selected a concrete experimental model ID.
  New decision record: `docs/research/2026-09-08-experiment-model-selection.md`.
- Recommended primary: `gpt-4.1-mini-2025-04-14`; optional exploratory replication:
  `gpt-5.6-luna`. Sources were opened on 2026-09-08; snapshot control, costs and
  capability/access limitations are documented, not inferred from agent models.
- Hosted SFT remains conditional on existing account access; otherwise defer or
  separately specify a fixed `gpt-oss-20b` base/adapter comparison after feasibility.
- Remaining gates: independent dataset, approved access/budget, offline runner
  design and TDD implementation, frozen manifest and blinded human grading.
- Documentation verification: all 360 tests passed again after the edits; build,
  typecheck, MCP smoke and plugin validation passed. Main verified five relative
  research links and all three illustrative cost calculations with Node assertions.
  Changes are Markdown only; no new runtime behavior or TDD cycle is claimed.
- Independent architect reviewed the actual four-file delta and six official source
  pages: `APPROVE`, architectural status `CLEAR`, no blocking findings. Approval
  covers methods/evidence only, not live capability, account access or model outcomes.
- Independent verifier returned `PASS` after checking the staged Markdown-only
  delta, five resolved local links, all cost arithmetic, and actual seed cardinality
  (24 records, 12 families, one English/Korean pair each). No live-result claim found.
- No credentials inspected, model calls, data uploads or training jobs performed.

## Registered Exact Checks (2026-09-08)

- Approved spec and plan: `docs/superpowers/specs/2026-09-08-research-exact-checks-design.md`
  and `docs/superpowers/plans/2026-09-08-research-exact-checks.md`.
- Baseline: 283 tests passed before implementation. Plan commit `08698eb`;
  core implementation/tests commit `514d570`.
- Main owns `src/research/exact-checks.ts`, immutable `exact-registry.ts`, core tests,
  documentation and config. Native executor owns only CLI and CLI test files.
- Core TDD: 47 behavioral tests failed against the empty-result stub; then GREEN.
  One test's expected error was corrected because `__proto__` violates the existing
  identifier format and is invalid input, not a valid unknown task ID.
- Added three corrupt-registry evidence tests. Removing the source-fidelity guard
  caused all three to fail; restoring it produced 50/50 GREEN. Build/typecheck passed.
- Local comparator timing spot check: 24 seed records, 26-byte guard response, one
  warm-up and 20 single calls; median 0.528 ms, p95 1.654 ms. Node v24.18.0, Windows
  x64. Includes validation/snapshots/fingerprints/comparison, excludes file I/O and
  model execution. Descriptive engineering evidence only, not a performance gate.
- CLI worker observed 11 failures and nine passing cases against an inert CLI stub,
  then all 20 real-process CLI tests passed. Main reran combined 70 tests to GREEN.
- Initial integrated gate: all 353 tests passed; build/typecheck/MCP smoke/plugin
  validation/seed validation/scoring demo/pilot audit/exact demo/benchmark passed.
  Semantic local benchmark p95: 1.55 ms. Exact demo is synthetic, not a model output.
- Main review found malformed-UTF-8 fixtures also failed schema validation, masking
  a possible lossy-decoder regression. Worker strengthened otherwise-valid JSON
  fixtures; disabling fatal decoding caused exactly two failures (exit 0 instead of
  1), restoring it passed both and the full 20 CLI tests. Main inspected the fix.
- Post-hardening: main reran 70 targeted tests and all 353 tests to GREEN; build,
  typecheck, MCP smoke, plugin validation and exact demo passed again.
- Code/spec/security reviewer returned `APPROVE` with zero findings after reading
  actual branch files, rerunning 70 tests/typecheck/demo and reproducing registry hashes.
- Test review requested complete metadata-drift coverage and pinned CRLF source
  evidence. Added five valid drift mutations and two CR-retention fixtures. Removing
  the record guard and normalizing CRLF caused all seven new tests to fail; restoring
  production code byte-for-byte produced 77 targeted tests GREEN.
- Final main gate: all 360 tests passed; build/typecheck/MCP smoke/plugin validation,
  seed validation/scoring demo/pilot audit/exact demo/benchmark/diff checks passed.
  Semantic local p95: 1.56 ms. Scoped test re-review approved the additions after
  reading actual tests and rerunning 57 core tests; no production changes remained.
  The CLI review remains approved. Main reran all 360 tests on resume, also GREEN.
- Implementation commits: `514d570` (core), `4b38f8b` (CLI/docs), `3cf1777` (review
  test coverage). All are pushed. PR #10 title/body now describe the implementation
  and verification evidence, and its draft flag was removed. The user subsequently
  approved merging PR #10; integration evidence is recorded above.
- No model or training job has run. Public excerpt checking does not replace human
  adjudication. Follow-up: curate/freeze independent pilot families and held-out checks,
  then establish approved model access/budget and blinded outcome grading.

## Integration And Next Design (2026-09-08)

- Merged PR: https://github.com/kimcheolhui9846/token-context-optimizer/pull/9
- Before merging: 24 targeted tests and all 283 tests passed; build/typecheck/MCP
  smoke/plugin validation/seed validation/pilot audit/scoring demo/benchmark passed.
  Semantic local benchmark p95: 1.45 ms. GitHub had no configured status checks.
- Merge was constrained to verified head `2a23f3c79641f382dda4bf32f85a56c5cb3d6370`.
  Main fast-forwarded to `6c836de`; `git diff 2a23f3c HEAD --stat` was empty.
  Post-merge main verification: 283 tests passed.
- Proposed design: `docs/superpowers/specs/2026-09-08-research-exact-checks-design.md`.
  Prefer registered exact-excerpt checks for the two existing seed task families,
  with dataset/response binding and no arbitrary candidate execution.
- The `hiddenCheckId` schema field does not make checked-in development checks secret.
  This proposed feature must not be described as held-out or human outcome evaluation.
- Architect design review requested clarification of a data-only registry, exact
  output fields, fatal UTF-8 decoding, source-line fidelity and seed documentation.
  The proposal now specifies those boundaries. Descriptive timing remains to honor
  the user's periodic performance-check request; it is not a new performance gate.
  Architect follow-up accepted the revision intent as conditional `CLEAR` from the
  supplied summary, without reopening the revised file. Do not claim independent
  verification of the final spec or implementation from that response.
  At that design checkpoint implementation had not started; the user subsequently
  approved proceeding and the implementation evidence is recorded above.

## Pilot Coverage And Development Seed (2026-09-08)

- PR #8 pre-merge verification: 38 scoring tests and the full 259-test gate passed;
  build/typecheck/MCP smoke/plugin validation/dataset and scoring demos/benchmark passed.
  Semantic local p95 was 1.27 ms. Main fast-forwarded to `46931d6`; its tree matched
  tested PR head `1e460b3` (`git diff 1e460b3 HEAD --stat` empty at integration).
- Spec/plan: `docs/superpowers/specs/2026-09-08-pilot-coverage-design.md` and
  `docs/superpowers/plans/2026-09-08-pilot-coverage.md`.
- Added `src/research/pilot.ts`, read-only `scripts/audit-pilot.mjs` / `audit:pilot`,
  and real compiled-entrypoint tests. Audits count families without inflating totals
  for translations, enforce category consistency, and report structural quota gaps.
- Dataset/card: `docs/research/datasets/development-seed.json` and
  `docs/research/development-seed.md`. There are 24 English/Korean records in 12
  development-only families, two per category. No training/test families are included.
- TDD evidence: nine core tests failed against the stub, then passed; eight CLI tests
  failed against its stub, then all 18 targeted tests passed including seed integrity.
- Initial full gate: 277 tests passed; build/typecheck/MCP smoke/plugin validation,
  seed validation, scoring demo, pilot audit and benchmark exited 0. Seed audit reports
  `meetsPilotStructure: false`, as intended. Semantic local benchmark p95: 1.65 ms.
- Auditor performance spot check: 1,000 same-family seed variants with unique IDs
  (12 families), one warm-up and 20 timed calls; median 13.90 ms, p95 15.72 ms.
  Node v24.18.0, Windows x64; includes validation/snapshot/fingerprinting/aggregation,
  excludes file I/O/CLI startup/model execution. Diagnostic only, not a comparative claim.
- A prior test-review agent failed on usage limits. Fresh native code-reviewer,
  test-engineer and analyst content reviews found a consent answer/rubric mismatch
  and missing fingerprint, same-language deduplication and successful-output privacy
  coverage. Two consent regressions failed before remediation, then passed after
  both questions/answers were expanded to cover approved and unapproved actions.
  Added the coverage and included the CLI in script typechecking. Scoped test review
  returned `APPROVED` and independently reran all 283 tests and typecheck. Content
  re-review confirmed the blocker resolved with no remaining content findings;
  code re-review returned `APPROVE`, with no remaining original-finding blockers.
  Build before script typechecking because the research CLI imports compiled modules.
- Final post-remediation gate: 24 targeted tests and all 283 tests passed;
  build/typecheck/MCP smoke/plugin validation/seed validation/scoring demo/audit/benchmark
  passed. Semantic local p95: 2.46 ms. Final seed fingerprint:
  `c29ea2176fa160732dd74ad8b4ae0ae5e547eaaa427a6e165ba0759444d55c35`.
- No hosted model, training, paid inference or outcome scoring ran. Seed exact-check
  references are pending executors. Agent review is not blinded human ground truth.
- Next research work: curate/freeze a genuinely independent pilot, implement verified
  exact-check execution, and establish approved model access/budget and human grading.

## Integration And Scoring (2026-09-08)

- PR #6 merged as `2c231e9`; PR #7 retargeted to main and merged as `9c26b12`.
- Before merging, the main agent ran PR #6's 182 tests and full gate, then PR #7's 221 tests and full gate. Both passed. GitHub had no configured CI checks.
- Local main fast-forwarded to `9c26b12`; its tree matched tested PR #7 exactly (`git diff 680d892 HEAD --stat` empty). Post-merge 221 tests passed.
- New branch: `feature/research-scoring-harness`, based on `9c26b12`.
- Pull request: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/8`.
- Spec/plan: `docs/superpowers/specs/2026-09-08-research-scoring-design.md`, `docs/superpowers/plans/2026-09-08-research-scoring.md`.
- Implementation: `src/research/scoring.ts`, `scripts/score-research.mjs`; usage: `docs/research/scoring.md`.
- Model input projection explicitly allowlists public fields. Ledger aggregation is bound to a full dataset fingerprint and accounts for missing, failed and ungraded slots and unknown telemetry.
- No model or fine-tuning job ran. `scoring-demo.json` contains synthetic labels, not empirical results.
- TDD RED: 23 core assertions failed against the initial stubs; GREEN: all passed.
- CLI RED: 9 real compiled-entrypoint cases failed against the CLI stub; GREEN: 35 targeted tests passed including added accounting coverage.
- Final local full gate after fingerprint remediation: 259 tests passed; build/typecheck/MCP smoke/plugin validation/dataset demo/scoring demo/benchmark passed. Semantic benchmark p95: 1.50 ms.
- Final local scoring spot check: 1,000 task records and 1,000 synthetic run judgments; one warm-up, 20 measurements; median 8.24 ms, p95 10.15 ms. Includes dataset validation/snapshot/fingerprinting/aggregation; excludes file I/O and model execution. No comparative performance claim.
- Independent test review requested a direct existing-task/wrong-split regression. Added it; 36 targeted tests passed and scoped review returned `PASS`.
- Code review found a programmatic `toJSON` fingerprint bypass. Two RED regressions reproduced it and property-order sensitivity. Added a detached validated schema snapshot shared by projection/fingerprinting/scoring; GREEN: 38 targeted tests. Scoped code re-review returned `CLEAR`/`APPROVE` and independently reran the 38 targeted tests and TypeScript diagnostics.

## Current Research Dataset Validator Work

- Branch: `feature/research-dataset-validation`; base commit `90a4370`.
- Pull request: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/7`.
- Spec: `docs/superpowers/specs/2026-09-07-research-dataset-validation-design.md`.
- Plan: `docs/superpowers/plans/2026-09-07-research-dataset-validation.md`.
- Format and limits: `docs/research/dataset-format.md`; runnable example: `docs/research/datasets/format-demo.json`.
- Pure validator: `src/research/dataset.ts`; CLI: `scripts/validate-dataset.mjs`.
- TDD RED: 23 validation assertions failed against the initial all-valid stub.
- TDD GREEN: 26 schema/identity tests passed; an initial test assumed exactly one schema diagnostic and was corrected to allow all invalid fields to be reported.
- CLI RED: 6 real-process assertions failed against the all-valid CLI stub. The first esbuild invocation was sandbox-blocked; the approved retry exposed the intended behavior failures.
- CLI GREEN and test-review coverage additions: 39 targeted tests passed, including escaped duplicate JSON members, canary diagnostics, exact Korean/CRLF/BOM hashes and nonadjacent family leakage.
- Final full gate on 2026-09-07 after entrypoint remediation: 221 tests passed; build, typecheck, MCP smoke, plugin validation and benchmark exited 0. Semantic local benchmark p95: 2.06 ms; exact/task gates passed.
- `npm.cmd run validate:dataset -- docs/research/datasets/format-demo.json` exited 0 and returned `valid: true`.
- Local performance spot check: one warm-up, 20 runs of 1,000 same-family format-demo variants with unique IDs; pure validator median 4.09 ms, p95 5.73 ms. Excludes file reading and CLI startup; diagnostic evidence only, not a regression budget or LLM measurement.
- Initial test-engineer review clarified normalization, split identity, source hashes, shape and diagnostic confidentiality; implementation and tests cover these boundaries.
- Test-engineer found a CLI linkage coverage blocker: source substitution bypassed production imports. Tests now copy the unchanged CLI/parser and run real project `tsc` into an isolated directory. Negative control with `--noEmit` caused 9 CLI failures; normal emission passed all 39 targeted tests. Scoped re-review: `PASS`.
- Independent code/spec/security/performance review: `APPROVE`, no blockers; reviewer also ran 39 targeted tests and TypeScript diagnostics.

## Current Semantic Degradation Fixture Work

### Paper Protocol Follow-Up (2026-09-07)

- Added `docs/research/2026-09-07-layered-adaptation-evaluation-protocol.md` with five opened official sources and a proposed controlled evaluation design.
- The protocol separates instruction content, skill delivery, context optimization, MCP transport, plugin packaging, and fine-tuning contrasts. No hosted model experiment or training job has run.
- Official SFT documentation now reports no new-user access during platform wind-down; account eligibility remains unverified.
- Fresh gate: 182 tests passed; build, typecheck, MCP smoke, plugin validation and benchmark exited 0. Semantic local p95 was 1.58 ms; this is regression evidence, not a hosted performance result.
- Documentation-only follow-up: no runtime changes or new unit tests.
- Independent architect review identified three methods blockers (matched context controls, operational analysis units, training variance). All were addressed; scoped re-review returned `CLEAR`.

- Branch: `feature/semantic-degradation-fixtures`
- Base branch: `main`
- Base commit: `036a8ea5781a8c3cfc1193c6ed0b8c3d0ea28e18`
- Design spec: `docs/superpowers/specs/2026-09-01-semantic-degradation-fixtures-design.md`
- Implementation plan: `docs/superpowers/plans/2026-09-01-semantic-degradation-fixtures.md`
- Paper preparation plan: `docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md`
- Pull request: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/6`
- Local commits:
  - `cc3e927 docs: design semantic degradation fixtures`
  - `cf52f71 docs: plan semantic degradation fixtures`
  - `bc33ac7 test: cover semantic meaning gates`
  - `6d4b150 feat: add semantic degradation fixtures`
- TDD evidence:
  - RED: `npm.cmd test -- --run tests/core.test.ts -t "semantic degradation fixtures|semantic meaning gates"` failed because `buildSemanticDegradationFixtures` was not exported.
  - GREEN: same targeted command passed with 3 tests and `npm.cmd run typecheck` exited 0.
  - RED: `npm.cmd test -- --run tests/core.test.ts -t "semantic benchmark"` failed because `runSemanticDegradationBenchmarkScenario` was not exported.
  - GREEN: `npm.cmd test -- --run tests/core.test.ts -t "semantic benchmark|semantic degradation fixtures|semantic meaning gates"` passed 5 tests.
- Full local gate on 2026-09-07:
  - `npm.cmd test` - 181 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `passed: true`; semantic fixture suite `rawTokens: 58000`, `optimizedTokens: 3950`, `reductionPercent: 93.2`, `p95LatencyMs: 6.65`, `passedExactGate: true`, warnings `[]`.
  - `git diff --check` - exit 0.
- Review state:
  - Initial `test-engineer` lane failed before review because the native subagent surface hit usage limits.
  - `code-reviewer` returned `APPROVE` with no blocking findings.
  - `architect` returned `BLOCK`: semantic scenario latency measured fixture-suite setup and aggregate runtime, unlike the prepared build-log and code-editing scenarios.
  - Architect remediation RED: `npm.cmd test -- --run tests/core.test.ts -t "maximum fixture latency"` failed because semantic latency ignored the injected `now` clock and returned aggregate wall-clock latency.
  - Architect remediation GREEN: `npm.cmd test -- --run tests/core.test.ts -t "semantic benchmark|semantic degradation fixtures|semantic meaning gates|maximum fixture latency"` passed 6 tests.
  - Architect remediation GREEN: `npm.cmd run typecheck` exited 0.
  - Architect remediation GREEN: `npm.cmd run build` exited 0.
  - Architect remediation GREEN: `npm.cmd run benchmark` returned `passed: true`; semantic fixture suite `rawTokens: 58000`, `optimizedTokens: 3950`, `reductionPercent: 93.2`, `p95LatencyMs: 1.44`, `passedExactGate: true`, warnings `[]`.
  - Scoped architect re-review after `10d2652` returned `CLEAR`; no new architecture blocker was found.
- Final full gate after scoped re-review on 2026-09-07:
  - `npm.cmd test` - 182 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `passed: true`; semantic fixture suite `rawTokens: 58000`, `optimizedTokens: 3950`, `reductionPercent: 93.2`, `p95LatencyMs: 1.32`, `passedExactGate: true`, warnings `[]`.
  - `git diff --check` - exit 0.

## Workspace

- Path: `C:\Users\00\Desktop\codex_plugin_and_skill`
- Current branch: `feature/research-scoring-harness`
- Base branch: `main`
- GitHub repo: `https://github.com/kimcheolhui9846/token-context-optimizer`
- MVP PR merged: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/1`
- MVP merge commit: `b5059774caee85c020e284a04e97f22b255162c4`
- Local install PR: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/2`
- Local install PR #2 merged at `cbc67d57015623bfe8487a33ac1d435985a1617a`.
- Code editing benchmark PR: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/3`
- Code editing benchmark PR #3 merged at `db17ea9b4d06f428e34d211a72b6c0f7387de199`.
- TDD/subagent verification policy PR: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/4`
- TDD/subagent verification policy PR #4 merged at `229fb3782794d31c3cd12c16f62cc6d190bff751`.
- Benchmark latency percentile PR: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/5`
- Key code editing benchmark commits include design/plan `1d04b2e`, RED test `b38f57a`, GREEN implementation `1dcb26b`, false-positive remediation `ef927b2`, task-gate accounting `93182d3`, review hardening `39817bc`, and review handoff refresh `ebd167e`. Use `git log --oneline main..HEAD` for the complete current branch tip.
- Local install remediation commits include `2bd5189`, `bd95ea1`, `30dda09`, `3b856cd`, `0cce2a1`, `587240e`, `b329b2d`, `d183297`, `5d91f29`, `0c89042`, `c0567d6`, `c580694`, `1f035fb`, `655037f`, metadata handoff commit `cf983a3`, hooks remediation commit `641dea2`, canonical MCP commit `4c50dd8`, raw MCP duplicate-key commits `31836ef` and `e63d8b7`, manifest/marketplace/workspace boundary commit `533c984`, containment remediation commit `7f0e4b9`, handoff refresh commit `36c20b6`, verifier-evidence commit `1ea0bc2`, signal-exit commit `3a4376e`, manifest/lifecycle contract commit `08033e6`, and stale-state docs refresh commit `bfd23d0`. PR #2 is merged; use live git/GitHub commands for the current branch and new PR state.
- Source PDF recovery hint: use the only checked-in PDF in the repo root if the filename renders incorrectly.

## Completed Work

- Merged PR #2 into `main` and fast-forwarded local `main`.
- Created branch `feature/code-editing-benchmark`.
- Added design spec: `docs/superpowers/specs/2026-09-01-code-editing-benchmark-design.md`.
- Added implementation plan: `docs/superpowers/plans/2026-09-01-code-editing-benchmark.md`.
- Added RED benchmark contract test; initial targeted run failed because the code editing scenario was absent.
- Added code editing benchmark scenario with exact retrieval and task-success gates.
- Intermediate `test-engineer` review found a HIGH false-positive risk in hardcoded patching; remediation now extracts the replacement implementation from the retrieved excerpt and covers stale, wrong, and correct excerpt cases.
- Final `code-reviewer` COMMENT found that code editing latency excluded task-gate execution and `docs/benchmarks.md` omitted the task-gate exit condition. Commit `93182d3` added latency accounting coverage, measures after task-gate execution, and documents task-gate failures as non-zero benchmark exits.
- Final `architect` WATCH found malformed byte bounds could be accepted and task-gate failure policy lacked direct regression coverage. Commit `39817bc` rejects invalid byte bounds, extracts benchmark failure policy into a tested helper, executes the stale patch source as a negative task-gate control, and includes that execution in latency accounting.
- Scoped re-review after `39817bc` passed: `code-reviewer` returned APPROVE, and `architect` returned CLEAR.
- Full gate before PR handoff: `npm.cmd test` 169 passed, `npm.cmd run build` exit 0, `npm.cmd run typecheck` exit 0, `npm.cmd run smoke:mcp` exit 0 (`mcp smoke ok`), `npm.cmd run validate:plugin` exit 0 (`plugin manifest ok`), `npm.cmd run benchmark` passed with code editing `rawTokens: 8094`, `optimizedTokens: 227`, `reductionPercent: 97.2`, `passedExactGate: true`, `taskGateRequired: true`, `passedTaskGate: true`, latency under the 1000 ms threshold, warnings `[]`, and `git diff --check` exit 0.
- Current operating rule: all future feature work and bug fixes should use TDD RED/GREEN cycles, targeted checks before full gates, and role-specialized subagent review for test adequacy, performance risk, code/spec/security, and architecture when the subagent surface is available.
- Created branch `feature/benchmark-latency-percentiles` from updated `main`.
- Added design spec: `docs/superpowers/specs/2026-09-01-benchmark-latency-percentiles-design.md`.
- Added implementation plan: `docs/superpowers/plans/2026-09-01-benchmark-latency-percentiles.md`.
- Task 1 RED/GREEN complete:
  - RED: `npm.cmd test -- --run tests/core.test.ts -t "latency percentiles|invalid latency sample"` failed because `nearestRankPercentile` was not exported.
  - GREEN: same targeted test passed with 2 tests, and `npm.cmd run typecheck` exited 0.
  - Commit: `cf8f60f test: cover benchmark latency percentiles`.
- Task 2/3 local RED/GREEN complete:
  - RED: benchmark JSON contract test failed because percentile fields were missing.
  - RED: p95 gate and cleanup tests failed because p95 was not used for failure gates and `runBenchmarkReport` did not exist.
  - GREEN: targeted benchmark contract test passed, p95/cleanup targeted tests passed, `npm.cmd run typecheck` exited 0, and `npm.cmd run benchmark` returned `passed: true` with 20 samples per scenario.
  - Latest benchmark evidence: build-log p95 `2.05` ms, semantic document p95 `1.47` ms, code editing p95 `0.8` ms, all below the 1000 ms threshold.
- First subagent review against `988eef3`:
  - `test-engineer` returned `REQUEST CHANGES`: add failure-path cleanup coverage, lock warm-up/sample call counts, and reduce flaky full benchmark assertions inside unit tests.
  - `code-reviewer` returned `COMMENT` with the same cleanup and sampling-count evidence gaps.
- Review remediation RED/GREEN:
  - RED: deterministic injected benchmark report test failed because `runBenchmarkReport` ignored `scenarioRunners`; failure cleanup test failed because the injected failure never ran.
  - RED: sample functional-gate invariant test failed because earlier exact/reduction failures were overwritten by the final measured sample.
  - GREEN: `npm.cmd test -- --run tests/core.test.ts -t "any measured functional gate|latency percentile fields|one warm-up|every default latency sample|report generation fails|required task gate"` passed 6 tests, `npm.cmd run typecheck` exited 0, and `npm.cmd run benchmark` returned `passed: true`.
  - Latest remediation benchmark evidence: build-log p95 `2.08` ms, semantic document p95 `2.22` ms, code editing p95 `0.9` ms, all below the 1000 ms threshold.
- First architect review against `988eef3` returned `BLOCK` on stale handoff/plan next-step state, plus WATCH items for the sample-result boundary and functional gate aggregation.
- Architect remediation:
  - `TimedScenarioResult` is exported to make the single-sample versus aggregate-result boundary explicit.
  - `runSampledScenario` now aggregates measured functional fields conservatively: any exact failure fails the aggregate, any required task-gate failure fails the aggregate, reduction uses the worst measured reduction, and warnings are unioned.
  - Benchmark threshold constants are centralized for report metadata and gate evaluation.
- Latest full gate after review remediation:
  - `npm.cmd test` - 176 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `passed: true`, build-log p95 `1.66` ms, semantic document p95 `1.71` ms, code editing p95 `0.94` ms.
  - `git diff --check` - exit 0.
- Scoped re-review after `a985b6a`:
  - `test-engineer` returned `PASS`; failure cleanup, warm-up exclusion, default sampling counts, and deterministic report assertions were accepted.
  - `code-reviewer` returned `COMMENT`; prior test findings were resolved and only stale handoff next-step wording remained.
  - `architect` returned `BLOCK` only on stale handoff next-step wording; runtime remediation claims were resolved.
  - This handoff refresh removes the stale commit/review-package/full-gate next-step wording and leaves only live transport handoff steps.
- Final documentation re-review:
  - `code-reviewer` returned `APPROVE` for the handoff/plan status refresh at `f2f6b1f`.
  - `architect` returned `CLEAR` after `7acb950`; the stale objective blocker is resolved.
  - Final finishing test: `npm.cmd test` - 176 tests passed.
- PR handoff:
  - Pushed `feature/benchmark-latency-percentiles` to origin.
  - Opened PR #5 against `main`: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/5`.
- Merged PR #1 into `main`.
- Created branch `feature/local-install-workflow`.
- Added design spec: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`.
- Added implementation plan: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`.
- Replaced this handoff with current branch state and next steps.
- Task 1 complete: added `scripts/install-local-plugin.mjs` and `npm.cmd run install:local`.
- Task 2 complete: added `scripts/verify-installed-plugin.mjs` and `npm.cmd run verify:installed`.
- Updated README with local install, custom target, and reboot recovery commands.
- Full gate complete for local install workflow.
- First local-install code review requested changes:
  - Reject unrelated non-empty install targets before overwriting `.mcp.json` or other runtime files.
  - Preflight all runtime sources before modifying an existing install.
  - Reject symlinked destination path components.
  - Wait for MCP child process exit after SIGTERM/SIGKILL in verifier shutdown.
  - Update stale workflow docs.
- Review fixes completed:
  - Added regression tests for conflicting targets, missing bundle partial-update prevention, and symlinked target components.
  - Installer now preflights all sources as regular files before touching the target.
  - Installer now accepts only empty targets or targets with a matching `token-context-optimizer` manifest.
  - Installer now rejects symlinked install target and runtime destination components.
  - Verifier and smoke shutdown paths now wait for child `exit` after termination signals and handle child `error`.
  - README, design spec, implementation plan, and this handoff now reflect the safety contract.
- Second local-install code review requested one blocking fix:
  - Reject symlinked or junctioned runtime destination components inside an otherwise owned target.
- Second review fix completed:
  - Added a nested `target\bin` junction regression that verifies external files are not overwritten.
  - Installer now preflights every runtime destination path before creating directories or copying files.
- Final independent review attempt:
  - Requested a `code-reviewer` subagent after staging and full verification.
  - Review did not complete because the native subagent surface returned a usage-limit error.
  - `omx code-review --help` could not run because `omx` is not on PATH in this shell.
  - Treat the branch as verified but not independently approved; open the PR for review rather than marking it merge-ready.
- PR handoff:
  - Committed `feat: add local plugin install workflow`.
  - Pushed `feature/local-install-workflow` to origin.
  - Opened draft PR #2 against `main`.
- PR #2 independent review completed:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Blocking remediation scope:
    - Reject non-file runtime destinations before any copy.
    - Restore existing runtime files if a later copy fails.
    - Add exact installed-tree coverage instead of trusting installer output.
    - Add marketplace registration so local install maps to Codex/ChatGPT plugin discovery.
    - Make installed verification read `plugin.json` and `.mcp.json` instead of hardcoding the bundle command.
    - Confirm `TCO_ALLOWED_ROOTS` keeps plugin-root files outside the indexing boundary.
- First PR #2 remediation completed:
  - Added RED tests for marketplace entry generation, non-file destination preflight, rollback, `.mcp.json` parsing, exact installed tree, and plugin-root denial.
  - Implemented installer marketplace registration, destination file-type preflight, runtime restore on failed copy, and shared runtime inventory.
  - Implemented verifier metadata-driven MCP launch and plugin-root denial check.
  - Updated README, design spec, implementation plan, and this handoff for marketplace-backed local install.
- PR #2 re-review completed:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Blocking remediation scope:
    - Use the same default root rules for install and verify.
    - Keep default `CODEX_HOME` installs inside the matching marketplace root.
    - Prevent verifier from accepting `.mcp.json` configs that launch an external server instead of the installed bundle.
    - Preserve marketplace JSON on write failure and leave installs retryable.
    - Refresh handoff, plan, and PR body to current verification state.
- Re-review remediation completed locally:
  - Added RED tests for no-argument USERPROFILE install/verify parity, `CODEX_HOME` marketplace-root alignment, marketplace write-failure retryability, and external MCP server rejection.
  - Moved shared plugin root/default marketplace resolution into `scripts/plugin-runtime.mjs`.
  - Verifier now requires the configured server to launch Node with the installed `bin/token-context-optimizer.mjs` entrypoint from a cwd inside the plugin root.
  - Verifier checks launch path components for symlinks and verifies plugin-root denial reports `outside allowed roots`.
  - Marketplace updates now use same-directory temp-file replacement and preserve the original file on simulated write failure.
- Re-review remediation PR update:
  - Committed `fix: align local install verification roots` as `3b856cd`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 107-test verification state.
- Final re-review attempt:
  - Spawned `code-reviewer` and `architect` review lanes against PR #2 head `0cce2a1`.
  - Both lanes failed before returning review evidence because the native subagent surface hit the usage limit.
  - PR #2 remains draft and must not be treated as independently approved.
- Final review completed after usage reset:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Remaining remediation scope:
    - Reject custom installs that omit both `--marketplace` and `--no-marketplace`.
    - Prevent verifier from approving an external implementation through `NODE_OPTIONS`, `NODE_PATH`, or related Node execution hooks.
    - Refresh handoff, plan, and PR body after the final remediation.
- Final review remediation completed locally:
  - Added RED tests for custom target discovery intent and verifier rejection of configured Node execution hooks.
  - Installer now requires custom `--target` or `TCO_PLUGIN_INSTALL_DIR` installs to pass `--marketplace` or `--no-marketplace`.
  - Verifier now uses a constrained child environment, strips inherited Node execution hooks, and rejects configured `NODE_OPTIONS`, `NODE_PATH`, and `npm_config_node_options`.
  - Added RED/GREEN coverage for non-regular installed runtime files so verifier no longer accepts directories or symlinks in required runtime slots.
- Final review remediation PR update:
  - Committed `fix: harden local install verification` as `b329b2d`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 110-test verification state.
- Post-final independent review completed against `b329b2d`:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Remaining remediation scope:
    - Require standard `mcpServers` in installed `.mcp.json`; remove direct and `mcp_servers` fallback acceptance.
    - Prevent caller-cwd runtime source substitution and linked source components.
    - Reject hard-linked runtime destinations before copy.
    - Reject configured MCP `env`, including platform loader execution hooks.
    - Surface JSON-RPC error responses instead of discarding them until timeout.
    - Refresh handoff, plan, and PR body after remediation.
- Post-final review boundary remediation completed locally:
  - Added RED tests for direct/snake-case MCP maps, loader env hooks, JSON-RPC error surfacing, hard-linked runtime destinations, and linked caller-cwd source files.
  - Installer now copies from the checked-in repository root, validates physical source containment, and rejects hard-linked destinations.
  - Verifier now canonicalizes plugin root, validates runtime and manifest physical containment, accepts only standard `mcpServers`, rejects configured MCP `env`, strips inherited Node and loader hooks, and fails immediately on JSON-RPC errors.
- Boundary remediation PR update:
  - Committed `fix: close install boundary gaps` as `d183297`.
  - Pushed `feature/local-install-workflow` to origin.
- Boundary remediation handoff update:
  - Committed `docs: record boundary remediation handoff` as `5d91f29`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 116-test verification state.
- Independent review completed against `5d91f29`:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Remaining remediation scope:
    - Validate `env_vars`, allow only `TCO_ALLOWED_ROOTS`, and reject configured `env` even when empty or null.
    - Reject unknown, duplicate, and positional CLI arguments before defaulting.
    - Include runtime scripts in typecheck via `checkJs`.
    - Clean up verifier temporary workspaces.
    - Require custom installs to choose a CLI marketplace mode; inherited `TCO_PLUGIN_MARKETPLACE_PATH` is not consent.
- CLI/env metadata remediation completed locally:
  - Added RED tests for inherited marketplace env with custom targets, `TCO_PLUGIN_INSTALL_DIR` custom targets, conflicting marketplace modes, unsafe `env_vars`, empty/null configured `env`, unknown installer/verifier CLI options, and verifier temp cleanup.
  - Added shared CLI argument validation in `scripts/plugin-runtime.mjs`.
  - Installer now requires custom installs to use exactly one CLI marketplace mode and applies inherited marketplace paths only to default installs.
  - Verifier now rejects configured `env`, allowlists `env_vars` to `TCO_ALLOWED_ROOTS`, strips inherited Node and loader execution hooks, cleans up temporary workspaces, and passes script-level `checkJs`.
  - Added `tsconfig.scripts.json` and wired `npm.cmd run typecheck` to check runtime scripts.
- CLI/env metadata remediation PR update:
  - Committed `fix: validate install cli and env metadata` as `0c89042`.
  - Pushed `feature/local-install-workflow` to origin.
- CLI/env metadata handoff update:
  - Committed `docs: record cli env remediation handoff` as `c0567d6`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 125-test and JS typecheck state.
- Independent review completed against `c0567d6`:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Remaining remediation scope:
    - Require the installed manifest MCP reference to point at the installed `.mcp.json`.
    - Reject array-valued marketplace `interface` metadata instead of treating arrays as valid objects.
    - Re-throw non-ENOENT filesystem inspection failures instead of masking them as missing files.
    - Reject stale or foreign files inside managed runtime directories on owned installs and installed verification.
    - Clean verifier temporary workspaces even when setup fails before JSON-RPC protocol initialization.
- Installed runtime ownership remediation completed locally:
  - Added RED/GREEN tests for array marketplace interface normalization, stale managed files in owned targets and verifier roots, alternate manifest-declared MCP files, and verifier cleanup on setup failures.
  - Installer and verifier now share the managed runtime directory inventory and reject unexpected files under `.codex-plugin`, `bin`, and `skills`.
  - Verifier now requires the installed manifest to point at the installed `.mcp.json`, validates launch args inside the cleanup scope, and always removes its temporary workspace.
  - Installer and verifier now treat only `ENOENT` as missing-file inspection; other filesystem failures are surfaced with cause.
- Installed runtime ownership remediation PR update:
  - Committed `fix: close installed runtime ownership gaps` as `c580694`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 130-test verification state.
- Independent review attempt against `c580694`:
  - Spawned `code-reviewer` agent `01a048f2-6b29-7dc3-85bc-fb58a22603dd` and `architect` agent `01a048f2-6bd9-7300-955d-8a912b058d92`.
  - Both lanes errored with native subagent usage limit before returning evidence: retry after 4:32 AM.
  - The agents were closed after the failure.
  - PR #2 remains draft and must not be treated as independently approved.
- Independent review completed against `1f035fb`:
  - `architect` returned `BLOCK`.
  - Replacement `code-reviewer` returned `REQUEST CHANGES`; the first code-reviewer lane timed out without evidence and was closed.
  - Remaining remediation scope:
    - Validate installed manifest `skills` and reject manifest `hooks`.
    - Require installed MCP `env_vars` to be exactly `["TCO_ALLOWED_ROOTS"]` instead of synthesizing a valid environment for broken metadata.
    - Reject hard-linked installed runtime files in the verifier.
- Installed metadata contract remediation completed locally:
  - Added RED/GREEN tests for installed manifest `skills` drift, manifest `hooks`, missing/empty/duplicate `env_vars`, and hard-linked installed `.mcp.json` or bundle files.
  - Added shared runtime metadata constants in `scripts/plugin-runtime.mjs`.
  - Verifier now requires exact `skills`, exact installed `.mcp.json`, no manifest hooks, exact `env_vars: ["TCO_ALLOWED_ROOTS"]`, and non-hard-linked runtime files.
  - Source validator now uses the same runtime metadata constants.
- Installed metadata contract remediation PR update:
  - Committed `fix: validate installed metadata contract` as `655037f`.
  - Pushed `feature/local-install-workflow` to origin.
  - PR #2 body update and independent re-review were completed after handoff commit `cf983a3`.
- Independent re-review completed against `cf983a3`:
  - `code-reviewer` returned `COMMENT`; no blocking code/spec/security issue remained.
  - `architect` returned `BLOCK`.
  - Remaining remediation scope:
    - Treat implicit `hooks/hooks.json` as part of the effective Codex discovery graph.
    - Add `hooks` as a zero-file managed namespace so owned refreshes and installed verification reject implicit hook files.
    - Address non-blocking review hygiene: clean up test temp fixtures and include `scripts/validate-plugin.mjs` in script typecheck.
- Implicit hooks namespace remediation completed locally:
  - Added RED/GREEN tests for installer and verifier rejection of implicit `hooks/hooks.json` files.
  - Added `hooks` to `MANAGED_RUNTIME_DIRECTORIES` without adding any runtime hook files.
  - Added test temp-root cleanup with `afterEach` and included `scripts/validate-plugin.mjs` in `tsconfig.scripts.json`.
- Implicit hooks namespace remediation PR update:
  - Committed `fix: reject implicit hook namespace` as `641dea2`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 136-test verification state.
- Reset independent review completed against PR #2 head `641dea2` plus uncommitted test work:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Remaining remediation scope:
    - Enforce complete canonical ownership of `.mcp.json`, including exactly one `mcpServers` map, exactly one `token-context-optimizer` server, exact launch fields, and no unknown executable metadata.
    - Reuse that canonical descriptor assertion in source validation, installer preflight, and installed verification.
    - Make `smoke-mcp.mjs` remove temporary install/workspace roots on success and setup failure.
    - Collapse duplicate marketplace `token-context-optimizer` entries to one canonical entry.
    - Refresh stale handoff, plan, README, and design documentation.
- Canonical MCP descriptor and cleanup remediation completed locally:
  - Added RED/GREEN tests for sibling MCP servers, noncanonical launch metadata, source validator descriptor mutations, installer source descriptor preflight, duplicate marketplace identities, smoke cleanup on success, smoke cleanup on simulated setup failure, and exact repository `.mcp.json` equality.
  - Added `CANONICAL_MCP_SERVER`, `CANONICAL_MCP_CONFIG`, and `assertCanonicalMcpConfig` in `scripts/plugin-runtime.mjs`.
  - Source validation, installer preflight, and installed verification now share the canonical descriptor assertion.
  - Installed verification preserves specific unsafe `env` / `env_vars` diagnostics, then enforces the full canonical descriptor before launch.
  - Marketplace updates now leave unrelated entries intact and rewrite duplicate `token-context-optimizer` entries into one canonical local entry.
  - `smoke-mcp.mjs` now cleans both temporary roots in a top-level `finally` and supports `--simulate-copy-failure-after` for cleanup regression coverage.
- Canonical MCP descriptor remediation PR update:
  - Committed `fix: enforce canonical mcp descriptor` as `4c50dd8`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 143-test verification state.
- Independent re-review completed against `4c50dd8`:
  - `architect` returned `WATCH` with no blocker; it recommended future consolidation of canonical descriptor representations and manifest contract checks.
  - `code-reviewer` returned `REQUEST CHANGES`.
  - Remaining remediation scope:
    - Reject duplicate raw JSON object members before `.mcp.json` semantic validation so duplicate `mcpServers`, server names, or launch fields cannot be collapsed by `JSON.parse`.
    - Set `TMPDIR` as well as `TEMP` and `TMP` in smoke cleanup subprocess tests.
    - Refresh handoff state after pushed head `4c50dd8`.
- Raw MCP duplicate-key remediation completed locally:
  - Added RED/GREEN tests for duplicate top-level `mcpServers`, duplicate `token-context-optimizer` server keys, and duplicate launch fields across source validation, installer preflight, and installed verification.
  - Added `parseJsonObjectRejectingDuplicateKeys` in `scripts/plugin-runtime.mjs`.
  - `scripts/validate-plugin.mjs`, `scripts/install-local-plugin.mjs`, and `scripts/verify-installed-plugin.mjs` now reject duplicate raw `.mcp.json` object members before running canonical descriptor validation.
  - Smoke cleanup subprocess tests now set `TEMP`, `TMP`, and `TMPDIR` to the dedicated temp parent.
- Raw MCP duplicate-key remediation PR update:
  - Committed `fix: reject duplicate mcp descriptor keys` as `31836ef`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 146-test verification state.
- Raw MCP duplicate-key handoff update:
  - Committed `docs: record duplicate key remediation handoff` as `e63d8b7`.
  - Pushed `feature/local-install-workflow` to origin.
- Independent re-review completed against `e63d8b7`:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Remaining remediation scope:
    - Reject duplicate raw JSON object members in `plugin.json` for source validation, target ownership, and installed verification.
    - Reject duplicate raw marketplace JSON members before rewriting the shared registry.
    - Reject verifier temporary workspaces that are equal to or contained by the plugin root.
    - Expand installer duplicate raw MCP coverage and refresh stale handoff/plan state.
- Manifest, marketplace, and workspace boundary remediation completed locally:
  - Added RED/GREEN tests for duplicate raw plugin manifest `name`, `skills`, and `mcpServers` members in source validation and installed verification.
  - Added tests for duplicate raw target ownership manifests, duplicate raw marketplace `plugins` members, all three duplicate raw MCP forms in installer preflight, verifier rejection/cleanup when temp roots point inside the plugin root, and direct parser coverage for escaped-equivalent keys, nested duplicates, and excessive nesting depth.
  - Source validation, installer source preflight, installer target ownership preflight, installed verification, and marketplace rewriting now use `parseJsonObjectRejectingDuplicateKeys` for trust-bearing JSON.
  - The duplicate-key parser now has size and nesting-depth bounds.
  - Installed verification now canonicalizes its temporary workspace and rejects it before launch if it is inside the plugin root.

## Design Summary

- Installer copies only runtime files:
  - `.codex-plugin/plugin.json`
  - `.mcp.json`
  - `bin/token-context-optimizer.mjs`
  - `skills/optimize-context/SKILL.md`
- Default destination order:
  1. `--target <path>`
  2. `TCO_PLUGIN_INSTALL_DIR`
  3. `${CODEX_HOME}\plugins\token-context-optimizer`
  4. `%USERPROFILE%\.codex\plugins\token-context-optimizer`
- Default marketplace registration:
  - Skipped when `--no-marketplace` is passed.
  - Uses `--marketplace <path>` or `TCO_PLUGIN_MARKETPLACE_PATH` when set.
  - For default installs with `CODEX_HOME`, writes `<parent-of-CODEX_HOME>\.agents\plugins\marketplace.json` so the installed plugin remains inside the marketplace root.
  - For default installs without `CODEX_HOME`, writes `%USERPROFILE%\.agents\plugins\marketplace.json`.
  - Marketplace entry points at the installed plugin with a `./`-prefixed path relative to the marketplace root.
- Owned installs reject unexpected files inside managed runtime directories: `.codex-plugin`, `bin`, `hooks`, and `skills`.
- Verifier reads the installed manifest with duplicate-key rejection, requires `skills` to point at `./skills/`, rejects manifest `hooks`, requires the manifest MCP reference to point at the installed `.mcp.json`, rejects duplicate raw JSON object members in `.mcp.json`, requires a canonical descriptor with exactly one `mcpServers` map and one exact `token-context-optimizer` server, launches only that installed bundle, indexes a temporary workspace fixture through explicit `TCO_ALLOWED_ROOTS` only after proving that fixture is outside the plugin root, cleans that fixture up, and confirms plugin-root indexing is denied.
- Verifier requires every installed runtime entry and manifest path to be a regular, non-hard-linked physical file inside the plugin root before launching the MCP server, and rejects unexpected files inside managed runtime directories.

## Latest Verification

- Task 1 verification:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd test` - 94 tests passed.
- Task 2 verification:
  - `npm.cmd test` - 95 tests passed.
- Review-fix targeted verification:
  - `npm.cmd test` - 99 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- Review-fix full gate:
  - `npm.cmd test` - 99 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-local-install-gate` - copied runtime files.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-local-install-gate` - `ok: true`, `indexedLineCount: 2`.
- Final pre-commit targeted checks:
  - `npm.cmd test` - 99 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- Final pre-commit full gate:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-local-install-gate` - copied runtime files.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-local-install-gate` - `ok: true`, `indexedLineCount: 2`.
- PR #2 remediation RED:
  - `npm.cmd test` - 5 expected failures covering marketplace registration, metadata-driven verifier, non-file destination preflight, rollback, and plugin-root denial.
- PR #2 remediation targeted GREEN:
  - `npm.cmd test` - 103 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
- PR #2 remediation full gate:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-gate\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
- PR #2 re-review remediation RED:
  - `npm.cmd test` - 4 expected failures covering default install/verify path mismatch, default `CODEX_HOME` marketplace-root mismatch, marketplace write-failure simulation, and external MCP server verifier bypass.
- PR #2 re-review remediation targeted GREEN:
  - `npm.cmd test` - 107 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- PR #2 re-review remediation full gate:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-gate\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
- PR #2 final review remediation RED:
  - `npm.cmd test` - 2 expected failures before final review remediation, covering custom target discovery intent and configured Node execution hooks.
  - `npm.cmd test -- --run tests/core.test.ts -t "verifier rejects non-regular installed runtime files"` - expected failure before runtime file-type hardening.
- PR #2 final review remediation targeted GREEN:
  - `npm.cmd test -- --run tests/core.test.ts -t "verifier rejects non-regular installed runtime files"` - 1 test passed.
  - `npm.cmd test` - 110 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- PR #2 final review remediation full gate:
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-final-gate-20260828-1853\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-final-gate-20260828-1853\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-final-gate-20260828-1853\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 post-final review remediation RED:
  - `npm.cmd test -- --run tests/core.test.ts -t "verifier rejects direct MCP server maps|verifier rejects snake-case MCP server maps|verifier rejects loader execution hooks|verifier surfaces JSON-RPC errors|rejects hard-linked runtime destinations|rejects linked runtime source components"` - 6 expected failures before boundary remediation.
- PR #2 post-final review remediation targeted GREEN:
  - `npm.cmd test -- --run tests/core.test.ts -t "verifier rejects direct MCP server maps|verifier rejects snake-case MCP server maps|verifier rejects loader execution hooks|verifier surfaces JSON-RPC errors|rejects hard-linked runtime destinations|uses fixed repository runtime sources"` - 6 tests passed.
  - `npm.cmd test` - 116 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- PR #2 post-final review remediation full gate:
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-final-gate-20260828-1916\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-final-gate-20260828-1916\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-final-gate-20260828-1916\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
- PR #2 latest review remediation RED:
  - `npm.cmd test -- --run tests/core.test.ts -t "inherited marketplace paths as custom target consent|TCO_PLUGIN_INSTALL_DIR custom targets|conflicting marketplace cli modes|inherited marketplace paths for default installs only|unsafe env_vars|empty or null|unknown cli options"` - 7 expected failures before CLI/env metadata remediation.
  - `npx.cmd tsc --allowJs --checkJs --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --types node scripts\install-local-plugin.mjs scripts\verify-installed-plugin.mjs scripts\plugin-runtime.mjs scripts\smoke-mcp.mjs` - 6 expected diagnostics before JS check hardening.
- PR #2 latest review remediation targeted GREEN:
  - `npm.cmd test -- --run tests/core.test.ts -t "cleans up verifier|inherited marketplace paths as custom target consent|TCO_PLUGIN_INSTALL_DIR custom targets|conflicting marketplace cli modes|inherited marketplace paths for default installs only|unsafe env_vars|empty or null|unknown cli options"` - 9 tests passed.
  - `npm.cmd run typecheck` - exit 0 and now includes `tsconfig.scripts.json`.
  - `npm.cmd test` - 125 tests passed.
- PR #2 latest review remediation partial full gate:
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-final-gate-20260828-2349\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-final-gate-20260828-2349\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-final-gate-20260828-2349\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
- PR #2 installed runtime ownership remediation RED/GREEN:
  - RED before implementation: targeted tests failed for array marketplace interface metadata, stale managed install files, alternate manifest-declared MCP file, stale managed verifier files, and verifier setup-failure cleanup.
  - `npm.cmd test -- --run tests/core.test.ts -t "normalizes array marketplace|stale managed|manifest to point at .mcp.json|setup failures"` - 5 tests passed.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
- PR #2 installed runtime ownership remediation full gate:
  - `npm.cmd test` - 130 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-ownership-gate-20260829-0013\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-ownership-gate-20260829-0013\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-ownership-gate-20260829-0013\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 installed metadata contract remediation RED/GREEN:
  - RED before implementation: targeted tests failed because verifier returned `ok: true` for manifest `skills` drift, manifest `hooks`, missing/empty/duplicate `env_vars`, and hard-linked installed runtime files.
  - `npm.cmd test -- --run tests/core.test.ts -t "bundled skills directory|declare hooks|exactly inherit TCO_ALLOWED_ROOTS|hard-linked installed runtime"` - 4 tests passed.
  - Follow-up targeted check: `npm.cmd test -- --run tests/core.test.ts -t "outside the installed bundle|manifest to point at .mcp.json|bundled skills directory|declare hooks|exactly inherit TCO_ALLOWED_ROOTS|hard-linked installed runtime"` - 6 tests passed.
- PR #2 installed metadata contract remediation full gate:
  - `npm.cmd test` - 134 tests passed.
  - `npm.cmd run typecheck` - exit 0.
  - Initial parallel `npm.cmd run build` failed because Windows locked `bin\token-context-optimizer.mjs` while the test suite was reading/installing it; sequential rerun passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-contract-gate-20260829-1106\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-contract-gate-20260829-1106\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-contract-gate-20260829-1106\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 implicit hooks namespace remediation RED/GREEN:
  - RED before implementation: targeted tests failed because installer and verifier returned success when `hooks/hooks.json` existed in an owned install.
  - `npm.cmd test -- --run tests/core.test.ts -t "implicit hook files|implicit installed hook files"` - 2 tests passed.
  - `npm.cmd run typecheck` - exit 0 and now includes `scripts/validate-plugin.mjs`.
- PR #2 implicit hooks namespace remediation full gate:
  - `npm.cmd test` - 136 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-hooks-gate-20260829-1119\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-hooks-gate-20260829-1119\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-hooks-gate-20260829-1119\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 canonical MCP descriptor remediation RED:
  - `npm.cmd test -- --run tests/core.test.ts -t "sibling servers|noncanonical installed MCP launch metadata|smoke MCP temporary roots"` - 3 expected failures before implementation.
  - `npm.cmd test -- --run tests/core.test.ts -t "duplicate marketplace|noncanonical MCP descriptors|installer rejects noncanonical|smoke MCP temporary roots"` - 5 expected failures before implementation.
- PR #2 canonical MCP descriptor remediation targeted GREEN:
  - `npm.cmd test -- --run tests/core.test.ts -t "duplicate marketplace|sibling servers|noncanonical installed MCP launch metadata|noncanonical MCP descriptors|installer rejects noncanonical|smoke MCP temporary roots|env_vars|Node execution hooks|configured env"` - 11 tests passed.
  - `npm.cmd test -- --run tests/core.test.ts -t "launch outside|noncanonical MCP descriptors|installer rejects noncanonical|smoke MCP temporary roots|duplicate marketplace"` - 6 tests passed.
  - `npm.cmd test -- --run tests/core.test.ts` - 143 tests passed.
  - `npm.cmd run typecheck` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\validate-plugin.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- PR #2 canonical MCP descriptor remediation full gate:
  - `npm.cmd test` - 143 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-canonical-gate-20260829-1150\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-canonical-gate-20260829-1150\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-canonical-gate-20260829-1150\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 raw MCP duplicate-key remediation RED:
  - `npm.cmd test -- --run tests/core.test.ts -t "duplicate raw|smoke MCP temporary roots"` - 3 expected failures before implementation for source validator, installer preflight, and installed verifier duplicate raw-key acceptance; smoke cleanup tests passed with `TEMP`, `TMP`, and `TMPDIR`.
- PR #2 raw MCP duplicate-key remediation targeted GREEN:
  - `npm.cmd test -- --run tests/core.test.ts -t "duplicate raw|noncanonical MCP descriptors|noncanonical installed MCP launch metadata|smoke MCP temporary roots|env_vars|configured env"` - 10 tests passed.
  - `npm.cmd run typecheck` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\validate-plugin.mjs` - exit 0.
- PR #2 raw MCP duplicate-key remediation full gate:
  - `npm.cmd test` - 146 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-raw-duplicate-gate-20260829-1654\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-raw-duplicate-gate-20260829-1654\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-raw-duplicate-gate-20260829-1654\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 manifest/marketplace/workspace boundary remediation RED:
  - `npm.cmd test -- --run tests/core.test.ts -t "duplicate raw plugin manifest|target ownership manifests|marketplace members|temporary workspaces inside|duplicate raw source MCP"` - 4 expected failures before implementation, covering source manifest duplicate acceptance, target ownership duplicate acceptance, marketplace duplicate acceptance, and verifier contained workspace acceptance.
- PR #2 manifest/marketplace/workspace boundary remediation targeted GREEN:
  - `npm.cmd test -- --run tests/core.test.ts -t "duplicate raw plugin manifest|target ownership manifests|marketplace members|temporary workspaces inside|duplicate raw source MCP|duplicate raw installed plugin manifest"` - 6 tests passed.
  - `npm.cmd test -- --run tests/core.test.ts -t "escaped-equivalent|duplicate raw plugin manifest|target ownership manifests|marketplace members|temporary workspaces inside"` - 5 tests passed.
  - `npm.cmd run typecheck` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\validate-plugin.mjs` - exit 0.
- PR #2 manifest/marketplace/workspace boundary remediation full gate:
  - `npm.cmd test` - 152 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-manifest-boundary-gate-20260829-1717\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-manifest-boundary-gate-20260829-1717\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-manifest-boundary-gate-20260829-1717\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 latest independent re-review against `533c984`:
  - `architect` returned `BLOCK` only on stale handoff/plan state that still said commit/push remained pending.
  - `code-reviewer` returned no Critical issues, but Important findings for verifier containment of `..`-prefixed child names and installer-specific trust-boundary coverage.
- PR #2 containment and installer coverage remediation targeted RED/GREEN:
  - RED: `npm.cmd test -- --run tests/core.test.ts -t "dot-dot-prefixed|duplicate raw source plugin manifests|symlinked runtime source|hard-linked runtime sources"` failed because verifier accepted a workspace under `pluginRoot\..temp`.
  - GREEN: same command passed with 4 tests after fixing verifier parent-segment detection and adding installer-specific duplicate manifest, symlink source, and hardlink source coverage.
- PR #2 containment and installer coverage remediation full gate:
  - `npm.cmd test` - 156 tests passed.
  - `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-containment-gate-20260829-2158\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-containment-gate-20260829-2158\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-containment-gate-20260829-2158\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - `git diff --check` - exit 0.
- PR #2 final review-readiness follow-up against `36c20b6`:
  - `code-reviewer` returned `REQUEST CHANGES` with no Critical/High runtime findings.
  - `architect` returned `WATCH` with no architectural blocker; the watch items were staged-source versus host-cache verification scope, duplicated filesystem policy helpers, and source-manifest semantic validation during installer preflight.
  - Remaining remediation scope: refresh stale handoff objective, strengthen verifier cleanup failure coverage so failure occurs after workspace creation, add direct regression evidence that ambient `NODE_OPTIONS`, `NODE_PATH`, and `npm_config_node_options` do not reach the launched MCP child, and reuse the trust-bearing source `plugin.json` semantic contract during installer preflight.
  - RED evidence: ambient hook regression failed when verifier child env filtering was intentionally disabled; setup-failure cleanup regression failed when verifier workspace cleanup was intentionally disabled.
  - RED evidence: `npm.cmd test -- --run tests/core.test.ts -t "noncanonical source plugin manifests"` failed because the installer accepted noncanonical source manifests before copying.
  - Targeted GREEN: `npm.cmd test -- --run tests/core.test.ts -t "noncanonical source plugin manifests|ambient Node execution hooks|setup failures"` - 4 tests passed.
  - Targeted GREEN: `npm.cmd run typecheck` - exit 0.
  - Full gate: `npm.cmd test` - 158 tests passed.
  - Full gate: `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - Full gate: `npm.cmd run typecheck` - exit 0.
  - Full gate: `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - Full gate: `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - Full gate: `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - Full gate: `npm.cmd run install:local -- --target $env:TEMP\tco-readiness-gate-20260831-2008\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-readiness-gate-20260831-2008\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - Full gate: `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-readiness-gate-20260831-2008\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - Full gate: `git diff --check` - exit 0.
- PR #2 follow-up re-review against `1ea0bc2`:
  - `code-reviewer` returned `REQUEST CHANGES` with no Critical/High issues.
  - `architect` returned `WATCH` with no architectural blocker; the remaining watch items were duplicated filesystem policy helpers, staged-root verification scope, and the now-remediated ambient-hook evidence gap.
  - Remaining remediation scope: treat signal-terminated MCP children as exited in verifier and smoke lifecycle checks, make ambient-hook regression observe `NODE_OPTIONS`, `NODE_PATH`, and `npm_config_node_options` inside the installed test bundle rather than through a PATH shim, and refresh handoff/plan after push state changes.
  - RED evidence: `npm.cmd test -- --run tests/core.test.ts -t "signal-terminated child|ambient Node execution hooks"` failed before implementation because `childHasExited` was missing and the first ambient-hook instrumentation put code before a shebang.
  - Targeted GREEN: `npm.cmd test -- --run tests/core.test.ts -t "signal-terminated child|ambient Node execution hooks|setup failures"` - 4 tests passed.
  - Targeted GREEN: `npm.cmd run typecheck` - exit 0.
  - Full gate: `npm.cmd test` - 159 tests passed.
  - Full gate: `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - Full gate: `npm.cmd run typecheck` - exit 0.
  - Full gate: `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - Full gate: `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - Full gate: `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - Full gate: `npm.cmd run install:local -- --target $env:TEMP\tco-signal-gate-20260831-2025\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-signal-gate-20260831-2025\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - Full gate: `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-signal-gate-20260831-2025\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
- PR #2 follow-up re-review against `3a4376e`:
  - `code-reviewer` returned `REQUEST CHANGES` with no Critical/High issues.
  - Remaining remediation scope: mark `3a4376e` push/PR update as complete in handoff and plan, move complete trust-bearing manifest validation into shared `assertPluginManifestContract`, add installer and verifier regressions for incomplete manifests, and make signal-exit regressions exercise verifier and smoke lifecycle call sites directly.
  - RED evidence: `npm.cmd test -- --run tests/core.test.ts -t "incomplete source plugin manifests|incomplete installed plugin manifests|smoke MCP fails promptly|verifier fails promptly"` failed because incomplete manifests were accepted and smoke did not expose a signal-exit fixture.
  - Targeted GREEN: `npm.cmd test -- --run tests/core.test.ts -t "incomplete source plugin manifests|incomplete installed plugin manifests|smoke MCP fails promptly|verifier fails promptly|signal-terminated child"` - 5 tests passed.
  - Targeted GREEN: `npm.cmd run typecheck` - exit 0.
  - Full gate: `npm.cmd test` - 163 tests passed.
  - Full gate: `npm.cmd run build` - exit 0; bundled `bin\token-context-optimizer.mjs` 771.1kb.
  - Full gate: `npm.cmd run typecheck` - exit 0.
  - Full gate: `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - Full gate: `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - Full gate: `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - Full gate: `npm.cmd run install:local -- --target $env:TEMP\tco-manifest-lifecycle-gate-20260901-0059\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-manifest-lifecycle-gate-20260901-0059\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - Full gate: `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-manifest-lifecycle-gate-20260901-0059\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
  - Full gate: `git diff --check` - exit 0.
- PR #2 `08033e6` re-review state:
  - Remediation was committed as `08033e6`, pushed to `feature/local-install-workflow`, and PR #2 body was updated to the 163-test verification state.
  - Fresh `code-reviewer` re-review against `08033e6` returned `COMMENT`: no Critical/High or runtime correctness issue remained; the only issue was stale handoff/plan wording that still said commit/push were pending.
  - The `08033e6` architect lane was superseded by the later docs-refresh review recorded below.
- PR #2 docs-only refresh against `bfd23d0`:
  - Stale push-status wording was removed from this handoff and the implementation plan.
  - Transport state is intentionally resolved through live git/GitHub commands instead of committed next-step prose.
  - Fresh `architect` review against `bfd23d0` returned `WATCH` with no BLOCK; the only documentation concern was the now-removed volatile push-state wording.
- Local install workflow full gate:
  - `npm.cmd test` - 95 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-local-install-gate` - copied runtime files.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-local-install-gate` - `ok: true`, `indexedLineCount: 2`.
  - `git diff --check` - exit 0.
- Pre-merge PR #1 full gate passed before merge:
  - `npm.cmd test` - 93 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.

## Next Steps

1. Review the documentation-only merge record in `docs/research-post-merge-review`;
   use live git/GitHub state on resume. PR #13 and PR #14 are already merged and
   their implementation tasks must not be repeated.
2. Select and approve the next bounded experiment-preparation scope from the
   protocol readiness checklist. Offline family-paired analysis design/testing
   can be prepared separately from paid execution; it is not implemented here.
3. Complete dataset curation/freeze, model/access/data/spend approvals, live-runner
   safeguards, and blinded human-rater assignment before collection. Subagents
   review software; they do not replace human outcome judgments.
4. Keep future runtime changes under TDD, targeted/full gates and independent
   code/architecture review. No real inference, training or upload ran here.
5. Do not merge any PR without explicit user approval.

## Recovery Commands

```powershell
cd C:\Users\00\Desktop\codex_plugin_and_skill
git status --short --branch
npm.cmd run build
npm.cmd run install:local
npm.cmd run verify:installed
npm.cmd test
```

## Stop Conditions

- Do not commit or push if any full-gate command fails.
- Do not claim completion without fresh verification output.
- Do not merge any future PR without explicit user approval.
