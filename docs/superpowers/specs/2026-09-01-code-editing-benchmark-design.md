# Code Editing Benchmark Design

## Goal

Add the benchmark plan's code editing fixture as an automated scenario so the plugin measures source-backed retrieval for exact-sensitive code-editing work, not only build logs and semantic notes.

## Scope

The scenario belongs in the existing local benchmark harness. It should create a temporary TypeScript-like project artifact, index it through the real artifact path, query for a failing test/edit target, and report a normal `ScenarioResult` entry. It does not add API telemetry, external model calls, or a new benchmark framework.

## Behavior

The benchmark output must include a third result named `code editing fixture source-backed retrieval`. The scenario must:

- Use a raw fixture large enough to make context reduction meaningful.
- Query the indexed artifact for a concrete edit target tied to `tests/math.test.ts`, `src/math.ts`, `ERR_NEGATIVE_INPUT`, and `npm test`.
- Prove the fixture is meaningful by failing its small in-process behavioral test before applying the edit.
- Pass the task gate only when an edit derived from the retrieved excerpt makes the same behavioral test pass.
- Include a negative control where an empty or stale excerpt does not make the task pass.
- Pass the exact gate only when the returned excerpt contains the exact file path, failing test name, error identifier, expected edit instruction, test command, complete span metadata, and byte offsets that reproduce the original source span.
- Reuse the existing benchmark gates: at least 25 percent token reduction, exact gate required, and per-scenario latency at most 1000 ms.

## Architecture

Keep `benchmarks/run.ts` as the benchmark entry point and factor only enough helper code to keep each scenario readable. The code editing fixture should use `MemoryArtifactStore`, `indexArtifact`, `queryArtifact`, and `estimateTextTokens`, matching the current build-log benchmark path. It should report retrieval fidelity and task success separately as `passedExactGate` and `passedTaskGate`. The fixture runner should be in-process with independent input cases, not a nested `npm` or Vitest invocation, to keep the existing 1000 ms benchmark latency gate meaningful on Windows.

## Testing

Use TDD. First add a test that runs `npm.cmd run build` and `npm.cmd run benchmark`, parses stdout JSON, and expects the third code editing scenario with exact-gate success, task-gate success, threshold-compliant metrics, and an empty warning list. Watch it fail because the scenario is absent. Then implement the minimal benchmark fixture and rerun the targeted test, benchmark, typecheck, and full suite.

## Subagent Checks

Use a `test-engineer` or `verifier` subagent during the work to independently assess the benchmark gate and performance risk. Use final independent review before PR handoff.
