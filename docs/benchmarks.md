# Benchmark Plan

Run after build:

```powershell
npm.cmd run build
npm.cmd run benchmark
```

## Scenarios

- 25K-style build log: retrieve error file, line, code, and diagnostic without corrupting exact data. The scenario must generate at least 25,000 estimated raw tokens before applying retrieval.
- Repeated semantic document: compare 10-turn raw context against extractive summary reuse across a semantic degradation fixture suite for success phrase, numeric threshold, negation, and actor/action preservation.
- Code editing fixture: source-backed retrieval of an exact edit target, error identifier, failing test name, and test command. The scenario separately gates exact excerpt fidelity and task success after applying the retrieved edit.

## Automated MVP Gates

- Each implemented scenario reduces estimated context tokens by at least 25%.
- Exact-sensitive retrieval preserves every required file, line, error code, and diagnostic string for the fixture.
- Semantic summary fixtures report fidelity through the existing exact-gate field and must retain every required phrase for each semantic degradation fixture.
- Each scenario runs one warm-up and 20 measured local samples; `latencyMs` mirrors the median sample, and `p95LatencyMs` must stay within the MVP local latency threshold. The semantic fixture suite reports the maximum single-fixture index-plus-summary latency for each sample, not total suite setup time.
- No product claim uses estimated savings as actual billing savings.

The benchmark command must exit non-zero when a scenario fails its exact gate, fails its task gate, drops below 25% reduction, exercises fewer than 25,000 estimated raw tokens for the build-log case, or exceeds the MVP p95 latency threshold.

Median successful-task cost, semantic success degradation, and relative hosted/API latency remain follow-up evaluation targets once real API usage telemetry and a larger fixture suite exist.
