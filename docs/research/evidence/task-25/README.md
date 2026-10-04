# Task 25 policy ReDoS evidence

## PR #25 re-review supplement

[Regression evidence](revision-tests.json) records actual five-second frozen-oracle timeouts for rules #13/#16/#17 at 400,000 characters and completed current-source samples. Eight additional differential witnesses cover the requested boundaries. The two new real punctuation-stripping recipes pass for both versions; they are characterization/performance coverage, not original-code RED, and the current scan is slower on those particular inputs.

[Exception probes](exception-probes-2026-10-04T13-45-25.351Z.json) locally confirm a **newly discovered, pre-existing, out-of-scope Major issue requiring a separate user decision**: current hex and numeric classifier inputs return at 1/5 MiB but throw `RangeError` at 10 MiB. The unchanged isolated hex regex returns at 5,000,001 bytes and throws at 6,000,001 bytes. U+3000/newline inputs return at exact 1/5/10 MiB UTF-8 sizes. The separate 10,000,000-code-unit U+3000/newline case is 28,000,000 UTF-8 bytes: the frozen main classifier throws and the current classifier returns. These are single observations per job, not performance medians. Node version, source hashes, byte/code-unit counts, operation timing and whole-child wall time are preserved separately; no runtime fix is included.

Historical observations and reviewer-attributed cases below are retained; this supplement establishes which cases were reproduced locally. Twelve successful ASCII recipes do not establish that arbitrary 10 MiB inputs return safely.

The supplemental `baseline-regex` jobs execute the literal `/\b[A-Fa-f0-9]{32,}\b/u` copied from the unchanged hexadecimal predicate in `5828f02:src/core/policy.ts`; they do **not** execute the whole original classifier. Their `sourceSha256: null` is intentional. The baseline LF source hash is `b00296dde8041ca8b952bd774c84e6af87e635eae8068e3a603dcafa47e57ad1`; the literal and raw outcomes remain available in the runner and report. Only the separate `baseline/u3000-reviewer-case` job invokes the frozen whole classifier.

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

[after.json](after.json) contains all 36 completed family/size cells, with five raw samples per predicate/helper/full-classifier probe on Node v24.18.0. It records HEAD `b00b503` before the Group4 commit while its measured source already contained the uncommitted Group4 changes. The raw source SHA-256 is `e137b032d91727a63700a7a7da82bf517d9ef2d0158bc4f0febc4798568f5ef8`; normalizing its CRLF line endings to LF gives `120e3ce5b27ca8f68426349845c73e21f2c870e0cb4278a6e8216173c6f4bad1`, matching the SHA-256 of source contents read from `07b0f53` and `e51af55`. This explains the recorded hash pair without rewriting the historical report. [comparison.json](comparison.json) pairs every full-classifier cell with a completed original observation and verifies the entire classification object, including ordered reasons and warnings. All 36 objects are identical. Reproduce the comparison with:

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

Bounded differential tests, measured growth and group-specific operation arguments support this fix for inputs where the original main classifier returns a value. They do not establish equivalent exception behavior or universal linearity for every possible input or machine. The original classifier has a separately reported multi-million-character `RangeError` in an unchanged pattern; Task 25 did not authorize changing it. Remaining-pattern screening is separately preserved in [remaining-audit.json](remaining-audit.json). F-21's existing classification behavior is intentionally unchanged.

## Scope-external exception observations

The following are reviewer observations unless a future local probe artifact records an outcome. They did not authorize runtime changes:

- `hexReDoS = /\b[A-Fa-f0-9]{32,}\b/u.test('a'.repeat(6e6) + 'g')` reportedly returns normally at 5e6 and throws `RangeError` at 6e6. The `RangeError` is in an unchanged pattern.
- `('\u3000'.repeat(9) + '\n').repeat(1e6)` (10 million UTF-16 code units) reportedly throws `RangeError` in the original classifier and returns in the current classifier.
- Related reviewer reports identify pattern #23 (digits/A), #19 (`id` and dots), #8 (paths), and #10/#12 (U+3000 whitespace). These remain observations rather than expanded Task scope.
- The separate large-input matrix contains ASCII recipes at 1, 5 and 10 MiB. Its medians are evidence for those exact recipes only, not a general safety guarantee. The recorded 10 MiB current-classifier medians span 0.79–3.04 seconds. Claude separately reported roughly 3–5x constant-factor slowdown on linear inputs and 0.8–3.2 seconds at 10 MiB; those estimates are attributed to that reviewer.
- `remaining-audit.json` exercises the original main classifier at 10,000 and 20,000 code units; it gives no multi-million-character assurance.

An opt-in bounded runner is provided in `measure-exceptions.mjs` and is invoked from the repository root with `node docs/research/evidence/task-25/measure-exceptions.mjs`. It writes a timestamped partial report and distinguishes `returned`, `threw`, and `timeout-censored`; the runner's presence does not claim any probe outcome.
