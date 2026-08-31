# Code Editing Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automated code editing fixture scenario to the benchmark harness with exact source-backed retrieval gates.

**Architecture:** Keep `benchmarks/run.ts` as the benchmark entry point and add one real artifact-backed scenario using the same `MemoryArtifactStore`, `indexArtifact`, `queryArtifact`, and `estimateTextTokens` path as the existing scenarios. Test the benchmark through its command-line JSON output so the test protects the public benchmark contract.

**Tech Stack:** TypeScript, Vitest, Node.js 22+, existing `npm.cmd run build`, `npm.cmd run benchmark`, and `npm.cmd test` commands.

## Global Constraints

- No production benchmark code before a failing test has been observed.
- The benchmark result name must be `code editing fixture source-backed retrieval`.
- The scenario must preserve exact strings: `tests/math.test.ts`, `src/math.ts`, `ERR_NEGATIVE_INPUT`, `rejects negative input without throwing away zero`, and `npm test`.
- The scenario must pass the existing benchmark gates: `passedExactGate: true`, `passedTaskGate: true`, reduction at least 25 percent, and latency at most 1000 ms.
- The scenario must fail its fixture behavior before applying the retrieved edit and must keep an empty/stale excerpt negative control failing.
- Do not introduce external network calls, model calls, new runtime dependencies, or a new benchmark framework.
- Keep documentation aligned with the implemented benchmark scenario.

---

### Task 1: Benchmark Contract Test

**Files:**
- Modify: `tests/core.test.ts`

**Interfaces:**
- Consumes: `npm.cmd run build` and `npm.cmd run benchmark` command output.
- Produces: A failing Vitest test named `benchmark reports code editing fixture source-backed retrieval`.

- [ ] **Step 1: Write the failing test**

Add this test near the existing project configuration command tests:

```ts
it("benchmark reports code editing fixture source-backed retrieval", async () => {
  await execFileAsync("npm.cmd", ["run", "build"], { windowsHide: true });

  const { stdout } = await execFileAsync("npm.cmd", ["run", "benchmark"], {
    windowsHide: true,
  });
  const report = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const scenario = report.results.find(
    (result: { name: string }) =>
      result.name === "code editing fixture source-backed retrieval",
  );

  expect(scenario).toMatchObject({
    passedExactGate: true,
    passedTaskGate: true,
    profileVersion: "heuristic-v1",
  });
  expect(scenario.rawTokens).toBeGreaterThanOrEqual(8000);
  expect(scenario.reductionPercent).toBeGreaterThanOrEqual(25);
  expect(scenario.latencyMs).toBeLessThanOrEqual(1000);
  expect(scenario.warnings).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "benchmark reports code editing fixture"
```

Expected: FAIL because `scenario` is `undefined`.

- [ ] **Step 3: Commit the RED test**

```powershell
git add tests/core.test.ts
git commit -m "test: require code editing benchmark scenario"
```

### Task 2: Code Editing Benchmark Scenario

**Files:**
- Modify: `benchmarks/run.ts`
- Modify: `docs/benchmarks.md`

**Interfaces:**
- Consumes: `queryArtifact(input)` and `estimateTextTokens(text)`.
- Produces: A `ScenarioResult` with `name: "code editing fixture source-backed retrieval"`.

- [ ] **Step 1: Implement minimal GREEN code**

Extend `ScenarioResult` with `passedTaskGate?: boolean` and add a scenario in `benchmarks/run.ts` that:

```ts
const codeFixture = buildCodeEditingFixture(8_000);
const codeFixtureTokens = estimateTextTokens(codeFixture);
const codeFixturePath = join(dir, "code-editing-fixture.txt");
await writeFile(codeFixturePath, codeFixture, "utf8");
const codeStart = performance.now();
const codeArtifact = await indexArtifact({
  path: codeFixturePath,
  store,
  allowedRoots: [dir],
});
const codeQuery = queryArtifact({
  artifactId: codeArtifact.artifactId,
  query:
    "tests/math.test.ts src/math.ts ERR_NEGATIVE_INPUT rejects negative input npm test",
  maxTokens: 180,
  contextLines: 6,
  store,
});
const codeLatencyMs = Math.round((performance.now() - codeStart) * 100) / 100;
results.push({
  name: "code editing fixture source-backed retrieval",
  rawTokens: codeFixtureTokens,
  optimizedTokens: codeQuery.estimatedTokens,
  reductionPercent: percentReduction(codeFixtureTokens, codeQuery.estimatedTokens),
  passedExactGate: codeQueryPassesExactGate(codeFixture, codeQuery),
  passedTaskGate:
    !runCodeEditingFixtureTests("export function normalizeInput(value: number) { return value; }")
      .passed &&
    !applyCodeEditingExcerpt(
      "export function normalizeInput(value: number) { return value; }",
      "stale excerpt",
    ).patched &&
    runCodeEditingFixtureTests(
      applyCodeEditingExcerpt(
        "export function normalizeInput(value: number) { return value; }",
        codeQuery.excerpts[0]?.text ?? "",
      ).source,
    ).passed,
  latencyMs: codeLatencyMs,
  profileVersion: "heuristic-v1",
  warnings: codeQuery.warnings,
});
```

Add helpers with these responsibilities:

```ts
function buildCodeEditingFixture(minimumTokens: number): string
```

Creates realistic repeated issue/context notes until `estimateTextTokens(...) >= minimumTokens`, then appends a compact exact-sensitive edit block containing all required strings and the replacement implementation.

```ts
function codeQueryPassesExactGate(
  fixture: string,
  query: ReturnType<typeof queryArtifact>,
): boolean
```

Checks one excerpt, `fallbackReason === null`, `completeSpan === true`, required strings, and verifies `fixture.slice(startByte, endByte) === excerpt.text`.

```ts
function applyCodeEditingExcerpt(
  source: string,
  excerpt: string,
): { source: string; patched: boolean }
```

Returns a patched source only when the excerpt contains `export function normalizeInput(value: number): number {` and `throw new Error("ERR_NEGATIVE_INPUT");`.

```ts
function runCodeEditingFixtureTests(source: string): { passed: boolean; failures: string[] }
```

Runs independent in-process cases for `-1`, `0`, and `7`. It must require negative input to throw `ERR_NEGATIVE_INPUT`, zero to remain zero, and positive input to remain unchanged.

- [ ] **Step 2: Run targeted GREEN check**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "benchmark reports code editing fixture"
npm.cmd run benchmark
npm.cmd run typecheck
```

Expected: targeted test passes; benchmark JSON includes three scenarios and `passed: true`; typecheck exits 0.

- [ ] **Step 3: Update docs**

Change `docs/benchmarks.md` so the code editing fixture is listed as implemented, and describe that it separately gates exact source-backed retrieval and task success after applying the retrieved edit.

- [ ] **Step 4: Commit GREEN implementation**

```powershell
git add benchmarks/run.ts docs/benchmarks.md
git commit -m "feat: add code editing benchmark scenario"
```

### Task 3: Verification And PR Handoff

**Files:**
- Modify: `docs/agent/HANDOFF.md`

**Interfaces:**
- Consumes: latest verification command output and independent review results.
- Produces: pushed branch and PR against `main`.

- [ ] **Step 1: Run full gate**

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

Expected: all commands exit 0, with benchmark including the code editing fixture.

- [ ] **Step 2: Run independent review**

Dispatch `code-reviewer` and `architect` against the branch diff from `main`. Address any `REQUEST CHANGES` or architect `BLOCK` before PR handoff.

- [ ] **Step 3: Update handoff and create PR**

Update `docs/agent/HANDOFF.md` with current branch, verification, review status, and PR URL once created. Commit, push `feature/code-editing-benchmark`, and open a PR against `main`. Do not merge without explicit user approval.
