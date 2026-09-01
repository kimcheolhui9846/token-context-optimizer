# Semantic Degradation Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small semantic degradation fixture suite so benchmark coverage detects summaries that drop material meaning.

**Architecture:** Keep `benchmarks/run.ts` as the benchmark entry point and add focused helpers for semantic fixtures and meaning-gate evaluation. The semantic scenario should run the existing repeated-document fixture plus numeric-threshold, negation, and actor/action fixtures through the real `indexArtifact` and `summarizeArtifact` path. The benchmark result shape stays unchanged; semantic fidelity continues to report through `passedExactGate`.

**Tech Stack:** TypeScript, Vitest, Node.js 22+, existing `npm.cmd test`, `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run benchmark`, `npm.cmd run smoke:mcp`, and `npm.cmd run validate:plugin`.

## Global Constraints

- No production benchmark code before a failing test has been observed.
- No external network calls, model calls, real API telemetry, billing-cost measurement, new runtime dependencies, or new benchmark framework.
- Do not change the `ScenarioResult` JSON shape.
- Continue reporting semantic fidelity through `passedExactGate`.
- The semantic benchmark must cover numeric threshold preservation, negation preservation, actor/action preservation, and the existing success phrase.
- The semantic gate passes only when `summarizeArtifact` returns `fallbackReason: null` and every fixture's required phrases are present in the summary.
- A semantic gate failure must make `runBenchmarkReport()` return `passed: false` through the existing `benchmarkResultFailsGates` path.
- Existing token reduction, p95 latency, code editing task-gate, exact retrieval, temp cleanup, and build-log raw-token gates remain unchanged.
- Use role-specialized subagents during verification: `test-engineer` or `verifier` for test adequacy and performance risk, then `code-reviewer` and `architect` before PR handoff.

---

### Task 1: Semantic Meaning Gate Helpers

**Files:**
- Modify: `benchmarks/run.ts`
- Modify: `tests/core.test.ts`

**Interfaces:**
- Produces: `SemanticDegradationFixture`
- Produces: `buildSemanticDegradationFixtures(): SemanticDegradationFixture[]`
- Produces: `semanticSummaryPassesMeaningGate(summary, fixture): boolean`

- [ ] **Step 1: Write failing helper tests**

Add tests under `describe("benchmarks", ...)`:

```ts
it("builds semantic degradation fixtures for numeric, negation, and actor meaning", async () => {
  const { buildSemanticDegradationFixtures } = await import("../benchmarks/run.js");

  const fixtures = buildSemanticDegradationFixtures();

  expect(fixtures.map((fixture) => fixture.name)).toEqual([
    "semantic success phrase",
    "numeric threshold preservation",
    "negation preservation",
    "actor action preservation",
  ]);
  expect(fixtures.every((fixture) => fixture.requiredPhrases.length > 0)).toBe(true);
});

it("fails semantic meaning gates when required phrases are missing", async () => {
  const { buildSemanticDegradationFixtures, semanticSummaryPassesMeaningGate } = await import(
    "../benchmarks/run.js"
  );
  const fixtures = buildSemanticDegradationFixtures();

  expect(
    semanticSummaryPassesMeaningGate(
      { fallbackReason: null, summary: "Reviewers approve deployment after the latency check." },
      fixtures.find((fixture) => fixture.name === "numeric threshold preservation")!,
    ),
  ).toBe(false);
  expect(
    semanticSummaryPassesMeaningGate(
      { fallbackReason: null, summary: "Operators may delete source excerpts during cleanup." },
      fixtures.find((fixture) => fixture.name === "negation preservation")!,
    ),
  ).toBe(false);
  expect(
    semanticSummaryPassesMeaningGate(
      { fallbackReason: null, summary: "The rollout is paused until the runbook is updated." },
      fixtures.find((fixture) => fixture.name === "actor action preservation")!,
    ),
  ).toBe(false);
});

it("passes semantic meaning gates when all required phrases are present", async () => {
  const { buildSemanticDegradationFixtures, semanticSummaryPassesMeaningGate } = await import(
    "../benchmarks/run.js"
  );
  const fixture = buildSemanticDegradationFixtures().find(
    (candidate) => candidate.name === "numeric threshold preservation",
  )!;

  expect(
    semanticSummaryPassesMeaningGate(
      {
        fallbackReason: null,
        summary: "Reviewers approve deployment only when p95 latency stays below 1000 ms.",
      },
      fixture,
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "semantic degradation fixtures|semantic meaning gates"
```

Expected: FAIL because the semantic fixture helpers are not exported.

- [ ] **Step 3: Implement minimal helpers**

Add near the semantic benchmark code:

```ts
export interface SemanticDegradationFixture {
  name: string;
  source: string;
  requiredPhrases: string[];
}

export function buildSemanticDegradationFixtures(): SemanticDegradationFixture[] {
  return [
    {
      name: "semantic success phrase",
      source: "Token efficiency depends on measured task success and careful source preservation.",
      requiredPhrases: ["Token efficiency depends on measured task success"],
    },
    {
      name: "numeric threshold preservation",
      source: "Reviewers approve deployment only when p95 latency stays below 1000 ms.",
      requiredPhrases: ["p95 latency", "below 1000 ms"],
    },
    {
      name: "negation preservation",
      source: "Operators must not delete source excerpts during cleanup.",
      requiredPhrases: ["must not delete source excerpts"],
    },
    {
      name: "actor action preservation",
      source: "The release captain updates the rollback runbook before deployment.",
      requiredPhrases: ["release captain updates the rollback runbook"],
    },
  ];
}

export function semanticSummaryPassesMeaningGate(
  summary: { fallbackReason: string | null; summary: string },
  fixture: SemanticDegradationFixture,
): boolean {
  return (
    summary.fallbackReason === null &&
    fixture.requiredPhrases.every((required) => summary.summary.includes(required))
  );
}
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "semantic degradation fixtures|semantic meaning gates"
npm.cmd run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add benchmarks/run.ts tests/core.test.ts
git commit -m "test: cover semantic meaning gates"
```

### Task 2: Semantic Scenario Aggregation

**Files:**
- Modify: `benchmarks/run.ts`
- Modify: `tests/core.test.ts`
- Modify: `docs/benchmarks.md`

**Interfaces:**
- Consumes: `buildSemanticDegradationFixtures()`
- Consumes: `semanticSummaryPassesMeaningGate(summary, fixture)`
- Produces: semantic scenario failure when any semantic fixture fails.

- [ ] **Step 1: Write failing semantic scenario tests**

Add tests:

```ts
it("semantic benchmark reports all degradation fixture requirements", async () => {
  const { runSemanticDegradationBenchmarkScenario } = await import("../benchmarks/run.js");
  const dir = await mkdtemp(join(tmpdir(), "tco-semantic-bench-"));

  const result = await runSemanticDegradationBenchmarkScenario({
    dir,
    store: new MemoryArtifactStore(),
  });

  expect(result).toMatchObject({
    name: "repeated semantic document extractive summary",
    passedExactGate: true,
    taskGateRequired: false,
    passedTaskGate: null,
    warnings: [],
  });
  expect(result.rawTokens).toBeGreaterThanOrEqual(16000);
  expect(result.reductionPercent).toBeGreaterThanOrEqual(25);
});

it("semantic benchmark fails when one degradation fixture loses required meaning", async () => {
  const { runSemanticDegradationBenchmarkScenario } = await import("../benchmarks/run.js");
  const dir = await mkdtemp(join(tmpdir(), "tco-semantic-bench-failure-"));

  const result = await runSemanticDegradationBenchmarkScenario({
    dir,
    store: new MemoryArtifactStore(),
    summarize: () => ({
      fallbackReason: null,
      summary: "Token efficiency depends on measured task success.",
      estimatedTokens: 20,
      warnings: [],
    }),
  });

  expect(result.passedExactGate).toBe(false);
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "semantic benchmark"
```

Expected: FAIL because `runSemanticDegradationBenchmarkScenario` is not exported.

- [ ] **Step 3: Implement scenario aggregation**

Rename or wrap the existing semantic scenario runner as:

```ts
export async function runSemanticDegradationBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
  summarize?: typeof summarizeArtifact;
}): Promise<TimedScenarioResult>
```

Implementation requirements:

- Build one document per semantic fixture.
- Index each fixture through `indexArtifact`.
- Summarize each fixture through `summarizeArtifact` or `input.summarize`.
- Set `passedExactGate` to `true` only when every fixture passes `semanticSummaryPassesMeaningGate`.
- Set `rawTokens` to the 10-turn raw token estimate across all fixtures.
- Set `optimizedTokens` to the 10-turn summary token estimate across all fixtures.
- Merge warnings from every summary.
- Keep result `name: "repeated semantic document extractive summary"`.

Update `prepareSemanticDocumentBenchmarkScenario` to call this exported runner.

- [ ] **Step 4: Update benchmark docs**

Update `docs/benchmarks.md`:

- Say repeated semantic document uses a semantic degradation fixture suite.
- Say semantic fixture success is reported through the existing benchmark gate field.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
npm.cmd test -- --run tests/core.test.ts -t "semantic benchmark|semantic degradation fixtures|semantic meaning gates"
npm.cmd run benchmark
npm.cmd run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add benchmarks/run.ts tests/core.test.ts docs/benchmarks.md
git commit -m "feat: add semantic degradation fixtures"
```

### Task 3: Verification, Review, And PR Handoff

**Files:**
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-09-01-semantic-degradation-fixtures.md`

**Interfaces:**
- Consumes: latest verification command output and subagent review results.
- Produces: pushed branch and PR against `main`.

- [ ] **Step 1: Update handoff with local RED/GREEN evidence**

Record the branch, design spec, implementation plan, targeted RED/GREEN results, and benchmark evidence in `docs/agent/HANDOFF.md`.

- [ ] **Step 2: Run test-engineer review**

Dispatch a `test-engineer` subagent against the branch diff. Ask it to evaluate semantic fixture adequacy, flaky-test risk, and whether tests prove degradation failures.

- [ ] **Step 3: Run full gate**

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

- [ ] **Step 4: Run independent code and architecture review**

Dispatch `code-reviewer` and `architect` against the branch diff from `main`. Address any `REQUEST CHANGES` or architect `BLOCK` through TDD before PR handoff.

- [ ] **Step 5: Update docs and open PR**

Update `docs/agent/HANDOFF.md` with final verification, review status, and PR URL once created. Commit, push `feature/semantic-degradation-fixtures`, and open a PR against `main`. Do not merge without explicit user approval.
