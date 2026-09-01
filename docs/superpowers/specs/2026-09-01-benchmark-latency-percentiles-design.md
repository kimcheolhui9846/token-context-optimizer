# Benchmark Latency Percentiles Design

## Goal

Add local multi-sample benchmark latency reporting so benchmark gates are based on stable median and p95 measurements instead of one timing sample.

## Scope

This is a local heuristic benchmark improvement only. It does not add API telemetry, billing-cost measurement, external model calls, remote services, new dependencies, or a general benchmark framework.

## Benchmark Contract

The benchmark command should still print one JSON report and exit non-zero when any scenario fails a gate. Each scenario result must keep the existing fields and add:

- `sampleCount`: number of measured latency samples.
- `medianLatencyMs`: median latency in milliseconds.
- `p95LatencyMs`: nearest-rank p95 latency in milliseconds.

The existing `latencyMs` field remains for backward compatibility and should mirror `medianLatencyMs`.

## Sampling Rules

- Run one unmeasured warm-up for each scenario before collecting samples.
- Collect 20 measured latency samples per scenario by default.
- The sample runner must include the same work that the current scenario timing includes: fixture creation/indexing plus retrieval or summarization. The code editing scenario must include broken, stale, and retrieved task-gate executions inside every measured sample.
- Percentiles use nearest-rank calculation over sorted samples: rank is `ceil(percentile * sampleCount)`, clamped to `1..sampleCount`, then converted to a zero-based index.
- Empty sample sets are invalid and must fail with a clear error.
- Negative measured durations are invalid and must fail with a clear error.

## Gates

- The existing 1000 ms per-scenario latency threshold applies to `p95LatencyMs`.
- Token reduction, exact-gate, task-gate, and build-log raw-token gates remain unchanged.
- The benchmark command exits non-zero when any scenario p95 exceeds the threshold.

## Runtime And Cleanup

The benchmark should remain local and fast. The default 20 measured samples plus warm-up per scenario should keep `npm.cmd run benchmark` comfortably under 30 seconds on the current development machine.

Temporary benchmark files and directories should be created under the OS temp directory and cleaned up in `finally`, including failure paths.

## Testing And Review

Use TDD. Add failing tests before production code for percentile calculation, scenario sampling output shape, p95 gate failure behavior, negative duration rejection, and temporary directory cleanup. Run targeted tests first, then the full project gate.

Use role-specialized subagents during verification: a `test-engineer` or `verifier` for test adequacy and performance risk, then `code-reviewer` and `architect` before PR handoff.
