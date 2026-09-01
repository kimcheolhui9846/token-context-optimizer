# Benchmark Latency Percentiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-sample local benchmark latency reporting with median and p95 gates.

**Architecture:** Keep `benchmarks/run.ts` as the benchmark entry point and extract small pure helpers for percentile calculation, latency sample summarization, and result gate evaluation. Each existing scenario should run one warm-up plus 20 measured local samples by default, while preserving the current token, exact, and task-gate outputs. The command should create temporary benchmark files under the OS temp directory and clean them up in `finally`.

**Tech Stack:** TypeScript, Vitest, Node.js 22+, existing `npm.cmd test`, `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run benchmark`, `npm.cmd run smoke:mcp`, and `npm.cmd run validate:plugin`.

## Global Constraints

- No production benchmark code before a failing test has been observed.
- No external network calls, model calls, real API telemetry, billing-cost measurement, new runtime dependencies, or new benchmark framework.
- Default benchmark sampling must use one unmeasured warm-up and 20 measured samples per scenario.
- Each scenario result must keep existing fields and add `sampleCount`, `medianLatencyMs`, and `p95LatencyMs`.
- The existing `latencyMs` field must remain and mirror `medianLatencyMs`.
- Percentiles use nearest-rank calculation over sorted samples: rank is `ceil(percentile * sampleCount)`, clamped to `1..sampleCount`, then converted to a zero-based index.
- Empty sample sets and negative measured durations are invalid and must fail with clear errors.
- The existing 1000 ms latency threshold applies to `p95LatencyMs`.
- Token reduction, exact-gate, task-gate, and build-log raw-token gates remain unchanged.
- The code editing scenario must include broken, stale, and retrieved task-gate executions inside every measured sample.
- Temporary benchmark files and directories must be cleaned up in `finally`, including failure paths.
- Use role-specialized subagents during verification: `test-engineer` or `verifier` for test adequacy and performance risk, then `code-reviewer` and `architect` before PR handoff.

---

### Task 1: Percentile Helper Contract

**Files:**
- Modify: `benchmarks/run.ts`
- Modify: `tests/core.test.ts`

**Interfaces:**
- Produces: `nearestRankPercentile(values: number[], percentile: number): number`
- Produces: `summarizeLatencySamples(samples: number[]): { sampleCount: number; medianLatencyMs: number; p95LatencyMs: number; latencyMs: number }`

- [x] **Step 1: Write the failing percentile tests**

Add tests under `describe("benchmarks", ...)`:

```ts
it("calculates nearest-rank latency percentiles", async () => {
  const { nearestRankPercentile, summarizeLatencySamples } = await import("../benchmarks/run.js");

  expect(nearestRankPercentile([5, 1, 9, 3], 0.5)).toBe(3);
  expect(nearestRankPercentile([1, 2, 3, 4, 5], 0.95)).toBe(5);
  expect(nearestRankPercentile([10], 0.95)).toBe(10);
  expect(summarizeLatencySamples([8.126, 1.234, 4.555])).toEqual({
    sampleCount: 3,
    medianLatencyMs: 4.56,
    p95LatencyMs: 8.13,
    latencyMs: 4.56,
  });
});

it("rejects invalid latency sample sets", async () => {
  const { nearestRankPercentile, summarizeLatencySamples } = await import("../benchmarks/run.js");

  expect(() => nearestRankPercentile([], 0.95)).toThrow("latency samples must not be empty");
  expect(() => summarizeLatencySamples([-1, 2])).toThrow("latency samples must not be negative");
});
```

- [x] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "latency percentiles|invalid latency sample"
```

Expected: FAIL because `nearestRankPercentile` and `summarizeLatencySamples` are not exported.

- [x] **Step 3: Implement minimal helpers**

Add exported helpers in `benchmarks/run.ts`:

```ts
function roundLatencyMs(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nearestRankPercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    throw new Error("latency samples must not be empty");
  }
  if (values.some((value) => value < 0)) {
    throw new Error("latency samples must not be negative");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(percentile * sorted.length)));
  return sorted[rank - 1];
}

export function summarizeLatencySamples(samples: number[]): {
  sampleCount: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  latencyMs: number;
} {
  if (samples.some((sample) => sample < 0)) {
    throw new Error("latency samples must not be negative");
  }
  const medianLatencyMs = roundLatencyMs(nearestRankPercentile(samples, 0.5));
  const p95LatencyMs = roundLatencyMs(nearestRankPercentile(samples, 0.95));
  return {
    sampleCount: samples.length,
    medianLatencyMs,
    p95LatencyMs,
    latencyMs: medianLatencyMs,
  };
}
```

- [x] **Step 4: Run GREEN**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "latency percentiles|invalid latency sample"
npm.cmd run typecheck
```

- [x] **Step 5: Commit**

```powershell
git add benchmarks/run.ts tests/core.test.ts
git commit -m "test: cover benchmark latency percentiles"
```

### Task 2: Multi-Sample Scenario Output

**Files:**
- Modify: `benchmarks/run.ts`
- Modify: `tests/core.test.ts`
- Modify: `docs/benchmarks.md`

**Interfaces:**
- Consumes: `summarizeLatencySamples(samples)`
- Produces: `runSampledScenario(input): Promise<ScenarioResult>`
- Produces: JSON scenario results with `sampleCount`, `medianLatencyMs`, `p95LatencyMs`, and `latencyMs`.

- [x] **Step 1: Write the failing benchmark JSON contract test**

Extend `benchmark reports code editing fixture source-backed retrieval` so every result requires:

```ts
expect(
  report.results.every(
    (result) =>
      result.sampleCount === 20 &&
      result.medianLatencyMs === result.latencyMs &&
      result.p95LatencyMs >= result.medianLatencyMs &&
      result.p95LatencyMs <= 1000,
  ),
).toBe(true);
```

Also extend the report result type in that test with:

```ts
sampleCount: number;
medianLatencyMs: number;
p95LatencyMs: number;
```

- [x] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "benchmark reports code editing fixture"
```

Expected: FAIL because current JSON results do not include percentile fields.

- [x] **Step 3: Implement sampling**

Refactor each scenario into a runner that returns a single `ScenarioResult` with one measured latency. Then add:

```ts
const DEFAULT_LATENCY_SAMPLE_COUNT = 20;

async function runSampledScenario(input: {
  runOnce: () => Promise<ScenarioResult>;
  sampleCount?: number;
}): Promise<ScenarioResult> {
  await input.runOnce();
  const samples: number[] = [];
  let lastResult: ScenarioResult | null = null;
  for (let index = 0; index < (input.sampleCount ?? DEFAULT_LATENCY_SAMPLE_COUNT); index += 1) {
    lastResult = await input.runOnce();
    samples.push(lastResult.latencyMs);
  }
  if (lastResult === null) {
    throw new Error("latency samples must not be empty");
  }
  return {
    ...lastResult,
    ...summarizeLatencySamples(samples),
  };
}
```

Use this helper from `main()` for the build-log, semantic document, and code editing scenarios.

- [x] **Step 4: Update docs**

Update `docs/benchmarks.md` to say:

- Each scenario reports `sampleCount`, `medianLatencyMs`, and `p95LatencyMs`.
- `latencyMs` mirrors `medianLatencyMs` for compatibility.
- The 1000 ms gate applies to `p95LatencyMs`.

- [x] **Step 5: Run GREEN**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "benchmark reports code editing fixture"
npm.cmd run benchmark
npm.cmd run typecheck
```

- [x] **Step 6: Commit**

```powershell
git add benchmarks/run.ts tests/core.test.ts docs/benchmarks.md
git commit -m "feat: add benchmark latency percentiles"
```

### Task 3: P95 Gate And Cleanup

**Files:**
- Modify: `benchmarks/run.ts`
- Modify: `tests/core.test.ts`
- Modify: `docs/agent/HANDOFF.md`

**Interfaces:**
- Consumes: `benchmarkResultFailsGates(result)`
- Produces: p95-based failure behavior and temp cleanup evidence.

- [x] **Step 1: Write failing p95 gate tests**

Add tests:

```ts
it("uses p95 latency for benchmark failure gates", async () => {
  const { benchmarkResultFailsGates } = await import("../benchmarks/run.js");
  const result = {
    name: "repeated semantic document extractive summary",
    rawTokens: 1000,
    optimizedTokens: 100,
    reductionPercent: 90,
    passedExactGate: true,
    taskGateRequired: false,
    passedTaskGate: null,
    latencyMs: 10,
    sampleCount: 20,
    medianLatencyMs: 10,
    p95LatencyMs: 1001,
    profileVersion: "heuristic-v1",
    warnings: [],
  };

  expect(benchmarkResultFailsGates(result)).toBe(true);
  expect(benchmarkResultFailsGates({ ...result, p95LatencyMs: 1000 })).toBe(false);
});
```

- [x] **Step 2: Write failing cleanup test**

Add an exported `runBenchmarkReport(options)` test seam, then test it with a failing scenario and an injected temp root. The expected test should assert the temp directory no longer exists after the promise rejects or returns a failed report.

- [x] **Step 3: Run RED**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "p95 latency|temporary benchmark"
```

Expected: FAIL because p95 is not the gate and the cleanup seam does not exist.

- [x] **Step 4: Implement gate and cleanup**

Change `benchmarkResultFailsGates` from `result.latencyMs > 1000` to `result.p95LatencyMs > 1000`.

Move report assembly into an exported `runBenchmarkReport(options)` that creates the temp directory and removes it in `finally`:

```ts
export async function runBenchmarkReport(options?: {
  makeTempDir?: () => Promise<string>;
  removeTempDir?: (dir: string) => Promise<void>;
  scenarioRunners?: Array<(input: { dir: string; store: MemoryArtifactStore }) => Promise<ScenarioResult>>;
}): Promise<BenchmarkReport>
```

Keep `main()` responsible only for printing JSON and setting `process.exitCode`.

- [x] **Step 5: Run GREEN**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "p95 latency|temporary benchmark|benchmark reports code editing fixture"
npm.cmd run benchmark
npm.cmd run typecheck
```

- [x] **Step 6: Update handoff**

Update `docs/agent/HANDOFF.md` with:

- PR #3 and PR #4 merge commits.
- Current branch `feature/benchmark-latency-percentiles`.
- Targeted RED/GREEN evidence and latest gate status.
- Reminder that next verification uses TDD plus subagent review.

- [x] **Step 7: Commit**

```powershell
git add benchmarks/run.ts tests/core.test.ts docs/agent/HANDOFF.md
git commit -m "fix: gate benchmark latency on p95"
```

### Task 4: Verification, Review, And PR Handoff

**Files:**
- Modify: `docs/agent/HANDOFF.md`

**Interfaces:**
- Consumes: latest verification command output and subagent review results.
- Produces: pushed branch and PR against `main`.

- [x] **Step 1: Run test-engineer or verifier review**

Dispatch a `test-engineer` or `verifier` subagent with the current diff and ask for test adequacy and performance risk review. Address blocking findings through TDD.

- [ ] **Step 2: Run full gate**

Run:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
npm.cmd run benchmark
git diff --check
```

- [ ] **Step 3: Run independent code and architecture review**

Dispatch `code-reviewer` and `architect` against the branch diff from `main`. Address any `REQUEST CHANGES` or architect `BLOCK` before PR handoff.

- [ ] **Step 4: Update docs and open PR**

Update `docs/agent/HANDOFF.md` with verification, review status, and PR URL once created. Commit, push `feature/benchmark-latency-percentiles`, and open a PR against `main`. Do not merge without explicit user approval.
