# Offline Research Mock Runs

The CLI runs entirely offline with explicit synthetic outcomes and virtual time.
It does not invoke a model or authorize spending, uploads or experiments.

## Inputs And Command

The simulator consumes a dataset, the original run configuration, and a separate
synthetic scenario. It reconstructs the [prepared plan](run-planning.md), verifies
the scenario's manifest binding and complete ordinal coverage, then visits slots
sequentially using virtual time. No model SDK or callback is involved.

Build and run the checked-in public-seed example:

```powershell
npm.cmd run build
npm.cmd run mock:research -- docs/research/datasets/development-seed.json docs/research/datasets/run-plan-demo.json docs/research/datasets/mock-run-demo.json
```

For JSON-only stdout, use
`node scripts/mock-research.mjs <dataset> <configuration> <scenario>` after building.
All three paths are required and must be nonblank. Files are read only, using fatal
UTF-8 decoding and the shared duplicate-key rejecting JSON parser. Missing/unknown
fields and coercions are rejected. BOM-prefixed JSON is rejected, not normalized.

The scenario has one outcome per planned ordinal, even for events that a budget or
deadline will prevent from starting. Its virtual limits are hypothetical; they do
not overwrite the original configuration, validate provider pricing or grant access.
Archive all three input files alongside results. Hashes bind content, not signatures.

## Report Meaning

The report is explicitly `kind: research_mock_report`, `mockOnly: true`, with
`dispatchAllowed: false`. The original preflight is preserved. A blocked preflight
does not prevent a synthetic test; a passing one does not authorize real execution.

Exactly one result entry is retained per planned slot. A started slot can be
`completed`, `error` or `timeout`. Unstarted slots have `status: not_started` and
null start time, latency, reservation and settlement. They are not invented errors.
There are no answers, judgments, grading packets or empirical accuracy estimates.

The 288-slot public-seed example uses one virtual millisecond and four
microUSD settlement per event, with ten microUSD reserved per event. Its expected
summary is 288 completed slots, virtual elapsed 288 ms, settled cost 1,152 microUSD,
remaining budget 848 microUSD and zero held reservation. These are synthetic values,
not paid requests or independent experimental observations. The seed remains short
of the complete pilot dataset.

## Stopping Rules

| Reason | Interpretation |
| --- | --- |
| `schedule_exhausted` | All mock events were reached without a stopping condition; not a completed graded experiment. |
| `run_timeout` | Overall virtual deadline reached; tied request/run deadlines use this reason. |
| `request_timeout` | Request deadline reached before the run deadline. |
| `budget_exhausted` | Next reservation exceeds remaining known budget; that slot never starts. |
| `unknown_cost` | A reached event has unknown settlement; retain its reservation and stop. |
| `reservation_exceeded` | Observed synthetic settlement exceeds its reservation; retain the actual amount, release reservation and stop. |

A deadline wins equality with an event duration. The late event's declared cost is
not observable; a timeout has unknown settlement even when the scenario contains a
late known value. Unknown cost never becomes zero. `knownSettledCostMicrousd` sums
observed known settlements; total `settledCostMicrousd` and remaining budget become
null when any started settlement is unknown. Held reservation is not confirmed spend
or a claim that provider billing stopped. Known-cost error events count toward spend
and continue without retries. A final-slot stop remains `termination: stopped`.

Exit 0 returns `{ valid: true, report }`, including intentionally stopped runs.
Wrong arguments exit 1 with `{ valid: false, code: "usage" }`; other failures exit
1 with `{ valid: false, code: "invalid_input" }`. Output is one compact JSON line,
with no input-bearing diagnostics on stderr.

## Limits

The report is not accepted as an [evaluation ledger](scoring.md). The scorer uses
USD and its own missing-run and grading semantics; no implicit conversion or export
is provided. Virtual-time tests do not validate SDK retries, network cancellation,
real billing, authentic approvals, human grading or scientific outcomes.

Input files are loaded before parser limits apply. The 100,000-slot limit bounds
schedule allocation, not file size or total process memory. Local timings, once
measured, must identify the code revision and raw samples and exclude file I/O and
CLI startup; they do not describe hosted-model latency.

## Local Timing Evidence

The [2026-09-10 sample](evidence/2026-09-10-mock-run-local.json) records one warm-up
and 20 measured in-memory calls on the 288-slot example, at core commit `0d1916d`.
Nearest-rank median was 1.71 ms and p95 was 3.29 ms. The raw artifact includes
unrounded samples, runtime/OS/CPU metadata and input bindings. It measures
validation, planning, hashing and simulated accounting, excluding file I/O and CLI
startup. This is descriptive local evidence, not a regression threshold, portable
latency guarantee, or hosted-model performance result.

See the [approved contract](../superpowers/specs/2026-09-09-research-mock-runner-design.md)
for canonical field order, numeric bounds, validation precedence and exact accounting.
