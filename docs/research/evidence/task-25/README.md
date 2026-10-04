# Task 25 policy ReDoS evidence

This directory holds process-isolated before/after timing evidence for the policy classifier. `tests/helpers/policy-baseline.ts` preserves the base policy body with its type-import path adjusted and provenance comments added. It is an immutable, test-only legacy oracle; do not import it from production code. Future intentional behavior changes require coordinated updates to the oracle and frozen outputs.

Run the approved pathological-family baseline from the repository root with:

```powershell
node docs/research/evidence/task-25/measure-policy.mjs baseline tests/helpers/policy-baseline.ts baseline.json
```

The matrix uses 10,000, 20,000, and 40,000 UTF-16 code units for each recipe. Every regular expression and helper is timed independently after one same-child warmup, with five raw samples. The full classifier runs in a separate child. Each child has a 20-second deadline and each phase has a 180-second cumulative budget. A killed child yields a censored observation; its timeout is never reported as an elapsed predicate time. UTF-8 byte counts and actual generated UTF-16 lengths are recorded with each raw observation.

The candidate families cover repeated `DROP`, semicolons, `<?a`, `<a` plus whitespace without a closing angle bracket, `trace` plus whitespace and `=`, repeated `a-`, repeated `a.`, blank-line runs, `<!a`, `<!--`, `npm` plus dots and trailing `x`, and a long `sudo` option prefix. Each sample reports every exact-pattern index separately, all private helper timings, and the full classification result. The `audit` phase accepts the same source and output arguments and uses small malformed inputs to exercise remaining rule families; Astra’s separate bounded screen is recorded in the Task handoff.

To measure a later source revision, select `after` and pass its source path and a distinct output filename, for example:

```powershell
node docs/research/evidence/task-25/measure-policy.mjs after src/core/policy.ts after.json
```

`baseline.json` and `after.json` are separate outputs. Do not replace the baseline report with later measurements. Raw samples support regression comparisons but do not prove an asymptotic bound; each changed predicate still needs a language-equivalence argument and a linear operation-bound argument.

The first full baseline attempt exposed a measurement harness bug before producing a final report: the remaining cumulative budget was a fractional `performance.now()` millisecond value, and Node rejected it as a `spawnSync` timeout. `measure-policy.mjs` now floors the child timeout and stops once less than one millisecond remains. The rerun produced `baseline.json`; it is intentionally partial-budget-censored at the 180-second phase cap. Missing classifier cells from that phase are recorded in separate `baseline-supplement-classifier-*.json` files instead of overwriting the original bounded report. Supplemental classifier runs use a 100-character same-family warmup and capture classification from the fifth timed full-size sample, avoiding an extra untimed full-size classifier call.

`baseline-supplement-classifier-censored-rerun.json` reruns the two classifier cells that `baseline.json` recorded as `timeout-censored` under the corrected child method. The original censored records remain intact in `baseline.json`.

## Implementation and comparison

- [Group 1](group-1.md): opener/terminator predicates #13/#14/#16/#17.
- [Group 2](group-2.md): token, tag and identifier predicates #3/#6/#7/#15/#18/#20/#21.
- [Group 3](group-3.md): multiline-prefix and pipe-table predicates #10/#12/#25.
- [Group 4](group-4.md): punctuation removal and command-argument helper.

[after.json](after.json) contains all 36 completed family/size cells, with five raw samples per predicate/helper/full-classifier probe on Node v24.18.0. It records the exact source hash; its HEAD preceded the Group4 commit while the measured source already included Group4. [comparison.json](comparison.json) pairs every full-classifier cell with a completed original observation and verifies the entire classification object, including ordered reasons and warnings. All 36 objects are identical. Reproduce the comparison with:

```powershell
node docs/research/evidence/task-25/compare-results.mjs
```

At 40,000 characters the semicolon recipe's full-classifier median changed from about 1,200 ms to 4.35 ms; the trace/whitespace recipe changed from about 3,035 ms to 4.75 ms. The long sudo-option control was already linear and is retained as a control, not claimed as a repaired quadratic case. Raw values, rather than rounded summaries, are authoritative. Timing changes for short/ordinary inputs are not claimed as universal speedups.

## Large current-classifier probes

```powershell
node docs/research/evidence/task-25/measure-large.mjs
```

This runner accepts no source override and measures only the current production classifier at exact ASCII lengths 1, 5 and 10 MiB, five samples per cell. It enforces a 20-second child deadline and a single 180-second cumulative phase budget, preserves partial samples/censored cells, and never runs the vulnerable oracle at these sizes. Each child hashes the exact bytes it compiled; the parent rejects differing source hashes. Timestamped outputs preserve earlier observations.

[2026-10-04 large-input results](large-current-2026-10-04T03-04-30.270Z.json): all 36 cells and 180 timed samples completed without censoring in a 173.61-second phase, on source commit `07b0f53` and Node v24.18.0. At 10 MiB the 12 family medians range from 791.05 ms to 3,044.44 ms. These are synchronous classifier timings, not a claim of zero event-loop blocking. Input lengths and all raw samples are retained in the report.

Bounded differential tests, measured growth and group-specific operation arguments support this fix. Finite samples alone are not a proof for every possible input or machine; remaining-pattern screening is separately preserved in [remaining-audit.json](remaining-audit.json). F-21's existing classification behavior is intentionally unchanged.
