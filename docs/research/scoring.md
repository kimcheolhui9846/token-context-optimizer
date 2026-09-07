# Offline Research Scoring

This tool aggregates supplied adjudications; it does not judge model responses or run
a model. The [example ledger](datasets/scoring-demo.json) is synthetic test data, not
human review, provider telemetry, or an experiment result.

```powershell
npm.cmd run build
npm.cmd run score:research -- docs/research/datasets/format-demo.json docs/research/datasets/scoring-demo.json
```

Use `node scripts/score-research.mjs <dataset> <ledger>` for JSON-only stdout. Exit 0
means valid input and a computed report, including incomplete or unsuccessful evaluations.
Exit 1 returns `valid: false` and `usage` or `invalid_input` without echoing file paths
or input data. Build first. Both files use the existing duplicate-key-rejecting parser
and its character/depth limits; files are read into memory before parsing. Neither is modified.

## Protecting References

`buildModelInputs(dataset, split)` in `src/research/scoring.ts` returns only `id`,
`language`, `sourceText`, and `question` for the requested split, after dataset validation.
Never send the full manifest to a model. Authors still need to check that public fields
do not contain answer leakage; field projection cannot detect leaked answers in prose.

`fingerprintDataset(dataset)` validates and hashes `JSON.stringify(dataset)` with SHA-256.
Use its return value in the ledger's `datasetSha256`. Answer/rubric/source changes invalidate
the ledger. JSON whitespace is irrelevant after parsing, but property order and record
order matter. This is a local consistency fingerprint, not a signature or immutable
preregistration: someone editing both artifacts can recompute it. Freeze and archive the
plan and dataset independently before collection.

## Ledger V1

Only these root fields are accepted: `schemaVersion: 1`, `datasetSha256`, `split`,
`arms`, `attemptsPerTask`, `runs`. Split uses the dataset enum. There must be at least
one task in it. Arms are 1-32 unique lowercase ASCII identifiers; attemptsPerTask is 1-1000.

Each run has `taskId`, `arm`, `attempt` (one-based), `status` (`completed`, `error`,
`timeout`), `latencyMs`, `costUsd`, and `judgment`. Numeric telemetry is finite and
nonnegative, or null when unknown. Duplicate tuples and runs outside the declared plan
are errors, including tasks from another split. Unknown fields are rejected.

A completed run's judgment is null while pending, or an object with `graderId`,
`coveredFacts` (one boolean per required fact, in dataset order), `contradiction`
(boolean), and `exactCheckPassed` (boolean for exact tasks, null for semantic tasks).
Other statuses must have null judgments. The caller supplies adjudicated labels and
exact-check outcomes; this module does not verify grader identity, hidden-check execution,
response provenance, or label truth. Keep raw responses, independent raters' labels and
adjudication evidence separately as required by the evaluation protocol.

An attempt represents one planned evaluation repetition. Its cost and latency must
include all internal retries/tool calls according to the frozen run policy. Do not
overwrite failures with retry successes or silently introduce extra attempts.

## Metrics

Each arm contains these counts and metrics:

- `planned`: selected task records * attemptsPerTask. Family variants remain correlated;
  these are not independent observations for confidence intervals.
- `submitted`, `missing`, `ungraded`, `successes`, `failures`: failures are submitted
  operational or judged failures; missing and ungraded counts are separate.
- `complete`: no missing slots and no ungraded completions. Unknown telemetry can still
  exist in a complete outcome report. Root complete requires every arm to be complete.
- `successRate`: successes / planned, with missing slots conservatively unsuccessful;
  null when any completed run awaits judgment. Interpret only alongside missing/complete.
  Success needs all required facts, no contradiction, and a passed exact check if applicable.
- `totalCostUsd`: all submitted costs, including failures; null if any cost is unknown
  or any planned slot is missing. Training cost is not included in this v1 ledger.
- `costPerSuccessUsd`: total cost / successes; null for unknown totals, zero successes
  or pending judgments. It is not a token-estimate savings claim.
- `latencySampleCount`, `medianLatencyMs`, `p95LatencyMs`: nearest-rank percentiles over
  known submitted latencies, including failed calls. No samples yields null percentiles.
  Missing timings can bias these descriptive statistics; no tail-latency guarantee follows.

Metrics are per arm only. Comparative statistics, family-clustered uncertainty, category/
language strata, inter-rater agreement, model execution, and the 120-family pilot remain
separate work. See the [evaluation protocol](2026-09-07-layered-adaptation-evaluation-protocol.md).
