# Task 25 policy baseline evidence

This directory holds process-isolated timing evidence for the original policy classifier. `tests/helpers/policy-baseline.ts` is an exact copy of the base policy module with only its type-import path adjusted. It is an immutable, test-only legacy oracle; do not import it from production code. Future intentional behavior changes require coordinated updates to the oracle and frozen outputs.

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
