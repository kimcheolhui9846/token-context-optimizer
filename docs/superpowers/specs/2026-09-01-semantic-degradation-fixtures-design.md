# Semantic Degradation Fixtures Design

## Goal

Add a small semantic degradation fixture suite so local benchmark coverage detects summaries that drop material meaning, not only summaries that include one success phrase.

## Scope

This is a local heuristic benchmark and test-harness improvement only. It does not add API telemetry, billing-cost measurement, external model calls, remote services, new dependencies, or a new benchmark framework.

## Behavior

The semantic benchmark should validate multiple source-backed meaning requirements:

- Numeric threshold preservation: the summary must keep a material threshold value and unit.
- Negation preservation: the summary must keep a prohibition or negative condition as negative.
- Actor/action preservation: the summary must keep who is responsible for a required action.
- Existing success phrase preservation: the current semantic success phrase remains covered.

Each fixture should define:

- `name`: stable fixture identifier.
- `source`: UTF-8 text to index and summarize.
- `requiredPhrases`: exact phrases that must appear in the extractive summary.

The semantic gate should pass only when `summarizeArtifact` returns no fallback reason and every fixture's required phrases are present in its summary. A failure should make the semantic benchmark scenario fail its gate and make `npm.cmd run benchmark` exit non-zero through the existing benchmark failure path.

## Architecture

Keep `benchmarks/run.ts` as the benchmark entry point. Extract a focused semantic fixture helper near the existing semantic scenario:

- `buildSemanticDegradationFixtures()`
- `semanticSummaryPassesMeaningGate(summary, fixture)`
- `runSemanticDocumentBenchmarkScenario(...)` should iterate the fixture suite and aggregate the semantic result conservatively.

Do not change the `ScenarioResult` shape. Continue using `passedExactGate` as the existing gate field for semantic fixture success, because the benchmark report currently has only exact/task/latency/reduction gates. Document that semantic fixtures use the gate field as source-backed semantic fidelity, not exact-sensitive byte preservation.

## Testing

Use TDD. First add RED tests that prove:

- A semantic summary missing a numeric threshold phrase fails the meaning gate.
- A semantic summary missing a negation phrase fails the meaning gate.
- A semantic summary missing an actor/action phrase fails the meaning gate.
- The benchmark semantic scenario reports failure when any semantic fixture fails.

Then implement the helper and scenario aggregation minimally. Run targeted tests before the full gate. Use role-specialized subagents for test adequacy, code review, and architecture review before PR handoff.

## Documentation

Update `docs/benchmarks.md` to describe the semantic degradation fixture suite and clarify that semantic fixture success is reported through the existing benchmark gate field.
