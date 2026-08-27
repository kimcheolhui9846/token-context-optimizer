# Benchmark Plan

Run after build:

```powershell
npm.cmd run build
npm.cmd run benchmark
```

## Scenarios

- 25K-style build log: retrieve error file, line, code, and diagnostic without corrupting exact data. The scenario must generate at least 25,000 estimated raw tokens before applying retrieval.
- Repeated semantic document: compare 10-turn raw context against extractive summary reuse.
- Code editing fixture: future scenario requiring tests to pass with excerpt-based retrieval.

## Automated MVP Gates

- Each implemented scenario reduces estimated context tokens by at least 25%.
- Exact-sensitive retrieval preserves every required file, line, error code, and diagnostic string for the fixture.
- Semantic summary fixtures must retain the required semantic success phrase.
- Each scenario completes within the MVP local latency threshold.
- No product claim uses estimated savings as actual billing savings.

The benchmark command must exit non-zero when a scenario fails its exact gate, drops below 25% reduction, exercises fewer than 25,000 estimated raw tokens for the build-log case, or exceeds the MVP latency threshold.

Median successful-task cost, semantic success degradation, and relative p95 latency remain follow-up evaluation targets once real API usage telemetry and a larger fixture suite exist.
