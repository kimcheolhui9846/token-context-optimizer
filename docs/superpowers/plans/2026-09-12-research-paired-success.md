# Offline Family-Paired Success Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure diagnostic `analyzePairedSuccess(dataset, evaluation)` function while preserving every existing scorer contract.

**Architecture:** Extract the current scorer validation, classification and aggregation into one internal evaluation core. The public scorer returns the unchanged core report; the analyzer consumes detached core state and applies its additional eligibility, coverage and integer-count arithmetic rules. The core never imports the analyzer or public scoring module.

**Tech Stack:** Existing TypeScript ESM, Zod v4 and Vitest; Node >=22.0.0; no new dependency.

## Global Constraints

- The [written specification](../specs/2026-09-10-research-paired-success-design.md) is authoritative.
- Accept two `unknown` inputs.
- Keep every existing `scoreEvaluation` input, error, output field/order and CLI behavior unchanged.
- A single success predicate must serve both paths.
- No new runtime dependency is necessary for integer counts and averaging in this slice.
- Return positive zero for a zero difference.
- When incomplete, `pointEstimate` is null and `families` is empty.
- Never use locale-dependent sorting, timers or randomness.
- All reports are diagnostic-only and never certify research eligibility.
- No CLI, bootstrap, CI/p-values, telemetry comparison, protocol changes, provider calls, training, upload, spend or merge.

## Delivery Boundary And Roles

Task 17 delivers this plan only. The user resumed after completed Task 16 on
2026-09-12; that advances to implementation planning. Runtime execution requires
the next explicit approval. The three work packages below are internal milestones
of one subsequent user-reviewable implementation Task, not automatic authority to
advance through separate Harness Tasks. Astra owns planning and final evidence
review; select native `worker` with runtime-supported `gpt-5.6-luna`, falling back
only to `gpt-5.5` if unavailable. Verify a successful suitable-role call at execution
time; stop under the Harness if neither implementer can run. Do not substitute the
read-only exploration role. Separate reviewers have no writable ownership.

At execution, inspect live status/base/PRs again. Create a dedicated Task branch
from the approved plan head; use a separate worktree for dirty state. Update root
HANDOFF.md before code edits, preserving its history and linking the older handoff.
Use the Claude Opus 5 / verified-free Gemini / callable Copilot hierarchy at the
initial and milestone checkpoints. Native reviews are supplementary and must not
be mislabeled as external reviews. A missing external provider alone is DEGRADED.

## File Map And Dependency Direction

| File | Action / responsibility |
| --- | --- |
| `src/research/evaluation-core.ts` | Create: existing schemas, validated digest, split check, complete validation/aggregation, classified detached runs. |
| `src/research/scoring.ts` | Modify: retain three public exports/import paths; delegate scorer to core. |
| `src/research/paired-success.ts` | Create: analyzer-specific validation and report only. |
| `tests/research-scoring.test.ts` | Extend existing private helpers with exact compatibility/error precedence characterizations. |
| `tests/research-paired-success.test.ts` | Create: independent synthetic fixtures and analyzer acceptance matrix. |
| `docs/research/paired-success.md` | Create: actual API, diagnostic limits, replay and examples. |
| `docs/research/scoring.md`, `README.md` | Add concise links to analyzer documentation, preserving scorer usage. |
| `docs/research/evidence/2026-09-12-paired-success-local.json` | Create during execution only: committed-source timing metadata and raw samples; use actual execution date if later. |
| `HANDOFF.md`, `docs/agent/HANDOFF.md` | Controller-owned status, review and observed test evidence. |

Existing `dataset.ts`, pilot rules, scripts, package manifests and research protocol
need no changes. Current scoring consumers include pilot, run-plan, exact-checks
and `scripts/score-research.mjs`; keep their imports intact. Dependency direction:
scoring → evaluation-core → dataset; paired-success → evaluation-core → dataset.

## Work Package 1: Preserve And Extract The Evaluation Core

**Interfaces:** `scoreEvaluation(input: unknown, evaluation: unknown)`,
`fingerprintDataset(input: unknown): string`, and `buildModelInputs(input: unknown,
split: string)` retain inferred return types and current public paths. New internal
exports are `evaluateCore(input: unknown, evaluation: unknown)`,
`digestValidatedDataset(dataset: ResearchDataset): string`, and
`isEvaluationSplit(split: string): boolean`.

- [ ] Run the baseline before editing:

```powershell
npm.cmd test -- --run tests/research-scoring.test.ts tests/research-pilot.test.ts
npm.cmd test
```

- [ ] Add exact scorer compatibility tests using its existing `dataset`, `run`
  and `evaluation` helpers. Run them against the unmodified scorer first. Example:

```typescript
it("pins full scorer serialization including arm and key order", () => {
  const data = dataset();
  const ledger = { ...evaluation(data), arms: ["baseline", "empty"] };
  const expected = {
    schemaVersion: 1, datasetSha256: fingerprintDataset(data),
    split: "development", complete: false, arms: [
      { arm: "baseline", planned: 1, submitted: 1, missing: 0,
        ungraded: 0, successes: 1, failures: 0, complete: true,
        successRate: 1, totalCostUsd: 0.01, costPerSuccessUsd: 0.01,
        latencySampleCount: 1, medianLatencyMs: 10, p95LatencyMs: 10 },
      { arm: "empty", planned: 1, submitted: 0, missing: 1,
        ungraded: 0, successes: 0, failures: 0, complete: false,
        successRate: 0, totalCostUsd: null, costPerSuccessUsd: null,
        latencySampleCount: 0, medianLatencyMs: null, p95LatencyMs: null },
    ],
  };
  expect(JSON.stringify(scoreEvaluation(data, ledger))).toBe(JSON.stringify(expected));
});
it("keeps run validation ahead of cost aggregation", () => {
  const data = dataset();
  const ledger = { ...evaluation(data, [
    run({ costUsd: 1e308 }), run({ attempt: 2, costUsd: 1e308 }),
    run({ taskId: "unknown", attempt: 3 }),
  ]), attemptsPerTask: 3 };
  expect(() => scoreEvaluation(data, ledger)).toThrow(/^out_of_plan$/);
});
it("preserves floating point cost accumulation order", () => {
  const data = dataset();
  const ledger = { ...evaluation(data, [
    run({ costUsd: 1e16 }), run({ attempt: 2, costUsd: 1 }),
    run({ attempt: 3, costUsd: 1 }),
  ]), attemptsPerTask: 3 };
  expect(scoreEvaluation(data, ledger).arms[0].totalCostUsd).toBe(1e16);
  ledger.runs.reverse();
  expect(scoreEvaluation(data, ledger).arms[0].totalCostUsd).toBe(10000000000000002);
});
```

- [ ] Add multi-invalid cases with fixed exact error assertions: invalid dataset
  plus malformed ledger → `invalid_dataset`; malformed ledger plus stale hash →
  `invalid_evaluation`; stale hash plus duplicate arms →
  `dataset_fingerprint_mismatch`; duplicate arms plus empty split → `duplicate_arm`;
  earlier schema-valid judgment with `coveredFacts: []` (task requires one fact)
  plus later out-of-plan run → `judgment_shape`; duplicate second run carrying
  that same schema-valid wrong-length judgment → `duplicate_run`. Missing a
  required judgment key instead fails ledger parsing with `invalid_evaluation`.
  Keep original ledger order. Extend the full JSON assertion to nullable telemetry,
  ungraded outcomes and nearest-rank latency, using existing literal expectations.
  These initially green characterizations are compatibility evidence, not new RED.

- [ ] Add a core-contract test importing the new `evaluateCore`; observe its
  missing-module/export RED before extraction. Assert its `.report` exactly equals
  the pinned scorer report and that its dataset/ledger/run snapshots are distinct
  from caller objects. Change a caller nested covered fact after the call and
  assert the detached core judgment still contains the original value.

- [ ] Move the existing schemas and score body without reordering validation or
  sums. Rename `digest` to `digestValidatedDataset`. Export split checking as
  `splitSchema.safeParse(split).success`. Add these internal types/classifier:

```typescript
export type EvaluationLedger = z.infer<typeof evaluationSchema>;
export type EvaluationRun = EvaluationLedger["runs"][number];
export type OutcomeClass = "success" | "failure" | "ungraded";
function classifyOutcome(run: EvaluationRun): OutcomeClass {
  if (run.status !== "completed") return "failure";
  if (run.judgment === null) return "ungraded";
  return run.judgment.coveredFacts.every(Boolean) &&
    !run.judgment.contradiction && run.judgment.exactCheckPassed !== false
    ? "success" : "failure";
}
```

  Inside the original per-arm aggregation loop, call this predicate once per run
  and append `{ run, outcome }` to an internal `classifiedRuns` array. Use that
  same outcome to increment existing success/ungraded counters. All run validation
  must already have finished before this loop, as in the old scorer. Return
  `{ dataset, ledger, tasks, classifiedRuns, report }`, where `tasks` remains the
  selected task Map and `report` is the original literal report object. In scoring,
  keep projection parsing, use the core split check/digest, and delegate:

```typescript
export function scoreEvaluation(input: unknown, evaluation: unknown) {
  return evaluateCore(input, evaluation).report;
}
```

- [ ] Run scorer/pilot tests, all tests and typecheck. Request independent review
  of exact JSON, precedence, snapshot behavior, absence of cyclic imports and
  unchanged callers. Resolve authorized findings; commit only the extraction and
  its tests/docs. No analyzer validation belongs in this core.

## Work Package 2: Pure Analyzer With Independent Oracles

**Consumes:** `evaluateCore` and its inferred return type, no raw reparsing.
**Produces:** `analyzePairedSuccess(input: unknown, evaluation: unknown)` exported
from `src/research/paired-success.ts`. Return type can be inferred from one report
literal with literal metadata (`as const`); define local `FamilyRow` from the seven
fields in the spec and a local bucket with selected records plus integer
reference/comparison counts. Do not export a new ledger schema.

- [ ] Create fixture helpers in the new test file. These fixtures are synthetic
  arithmetic inputs, never scientific evidence. Keep them local to this test file:

```typescript
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fingerprintDataset, scoreEvaluation } from "../src/research/scoring.js";
import { analyzePairedSuccess } from "../src/research/paired-success.js";

function fixture(reference = [3, 6], comparison = [6, 0]) {
  const records = reference.flatMap((_, f) => ["en", "ko"].map(language => {
    const text = `Synthetic family ${f}.`;
    return { id: `task-${f}-${language}`, familyId: `family-${f}`,
      split: "development", language, category: "numeric",
      source: { text, sha256: createHash("sha256").update(text).digest("hex"),
        provenance: "Synthetic arithmetic fixture", license: "CC0-1.0" },
      question: "What is stated?", answerKey: text, requiredFacts: [text],
      prohibitedContradictions: ["The opposite."], acceptableParaphrases: [],
      rubric: { kind: "semantic", instructions: "Check the fact." } };
  }));
  const data = { schemaVersion: 1, datasetId: "paired-test", records };
  const arms = ["full_source", "optimized"];
  const runs = records.flatMap((record, index) => arms.flatMap((arm, a) =>
    [1, 2, 3].map(attempt => ({ taskId: record.id, arm, attempt,
      status: "completed", latencyMs: null, costUsd: null,
      judgment: { graderId: "synthetic", coveredFacts: [
        (index % 2) * 3 + attempt <= (a ? comparison : reference)[Math.floor(index / 2)],
      ], contradiction: false, exactCheckPassed: null },
    }))));
  const ledger = { schemaVersion: 1, datasetSha256: fingerprintDataset(data),
    split: "development", arms, attemptsPerTask: 3, runs };
  return { data, ledger };
}
```

- [ ] Add this full literal output oracle, run the new test and observe RED:

```typescript
it("computes the literal two-family contrast", () => {
  const { data, ledger } = fixture();
  const expected = {
    schemaVersion: 1, kind: "research_paired_success_report",
    analysisVersion: "family-paired-success-v1", diagnosticOnly: true,
    researchEligible: false, dispatchAllowed: false,
    datasetSha256: fingerprintDataset(data), split: "development",
    contrast: { referenceArm: "full_source", comparisonArm: "optimized" },
    attemptsPerTask: 3,
    coverage: { complete: true, familyCount: 2, planned: 24,
      submitted: 24, missing: 0, ungraded: 0, arms: [
        { arm: "full_source", planned: 12, submitted: 12, missing: 0, ungraded: 0 },
        { arm: "optimized", planned: 12, submitted: 12, missing: 0, ungraded: 0 },
      ] },
    pointEstimate: -0.25, families: [
      { familyId: "family-0", category: "numeric", referenceSuccesses: 3,
        comparisonSuccesses: 6, referenceRate: 0.5, comparisonRate: 1, difference: 0.5 },
      { familyId: "family-1", category: "numeric", referenceSuccesses: 6,
        comparisonSuccesses: 0, referenceRate: 1, comparisonRate: 0, difference: -1 },
    ],
  };
  expect(JSON.stringify(analyzePairedSuccess(data, ledger))).toBe(JSON.stringify(expected));
});
```

- [ ] Implement validation after `const core = evaluateCore(input, evaluation)`:
  reject train; require both contrast arms; require 3 attempts; check capacity;
  only then build family buckets and validate selected records. Use fixed errors
  in spec order. Capacity arithmetic is:

```typescript
const plannedPerArm = core.tasks.size * 3;
const totalPlanned = plannedPerArm * core.ledger.arms.length;
if (!Number.isSafeInteger(plannedPerArm) || !Number.isSafeInteger(totalPlanned) ||
    totalPlanned > 100_000) throw new Error("analysis_capacity_exceeded");
```

  Every bucket must have length 2, language Set `{en, ko}` and one category.
  Throw `invalid_analysis_family` otherwise. Do not inspect unrelated split
  families beyond the existing dataset validation. No slot array is necessary.

- [ ] Project coverage from the core report: for each arm copy only `arm`,
  `planned`, `submitted`, `missing`, `ungraded` in that order; sort the copy by
  `a.arm < b.arm ? -1 : a.arm > b.arm ? 1 : 0`. Sum every declared arm, including
  extra arms. Complete iff summed missing and ungraded are zero. Incomplete reports
  still contain validated familyCount, but no family rows or point estimate.

- [ ] For complete reports, traverse `classifiedRuns`; only `outcome ===
  "success"` increments a family contrast count, using `tasks.get(run.taskId)`.
  Ignore extra-arm successes for arithmetic only. Sort family entries by ASCII
  identifier and emit the seven ordered keys in the literal above. Accumulate
  integer `(comparisonSuccesses - referenceSuccesses)` before one division by
  `6 * familyCount`; assign `0` explicitly when numerator is zero. Emit all root
  keys in the spec's order; do not include raw data or core state.

- [ ] Run targeted GREEN, then introduce each additional acceptance case below
  before implementing any missing behavior. Record observed failures and passes;
  a case already green is characterization, not a fabricated RED cycle.

```powershell
npm.cmd test -- --run tests/research-paired-success.test.ts
npm.cmd test -- --run tests/research-scoring.test.ts tests/research-pilot.test.ts tests/research-paired-success.test.ts
npm.cmd run typecheck
```

| Case / construction | Required assertion |
| --- | --- |
| `fixture([6],[6])`, `fixture([0],[0])`, `fixture([0],[6])`, `fixture([6],[0])` | Estimates 0, 0, 1, -1; `Object.is(pointEstimate, -0)` false for zeros. |
| Each integer pair 0..6 in one family | Point estimate `(comparison-reference)/6`; both integer success counters exact. |
| Convert a failed judgment run to error or timeout, judgment null | Still complete, failure is zero; no missing/ungraded increase. |
| Delete one run; separately set one completed judgment null | pointEstimate null, families empty, familyCount retained; respective missing/ungraded is 1. Use an explicitly typed nullable run copy for mutation. |
| Declare extra arm with no runs; separately fill it but leave one ungraded | Entire contrast suppressed; root coverage includes that arm. |
| Null cost/latency; known-cost overflow | Nulls keep a complete estimate; overflow throws `cost_overflow` even if split/arms also fail analyzer rules. |
| Remove optimized and its runs; attempts 2/4 with runs empty; train with matching record splits/hash | `missing_contrast_arm`, `unsupported_analysis_attempts`, `unsupported_analysis_split` respectively. |
| Set second record language en; remove second record; add third uniquely identified record; change second category to negation | `invalid_analysis_family`; first assert general dataset/scorer still accept these inputs with rebound hash and empty runs. |
| Stale hash, duplicate/out-of-plan runs, malformed judgments, unknown keys | Exactly the same core error as scorer; include simultaneous analyzer-invalid structure to assert shared path first. |
| Nonenumerable `toJSON` hooks on dataset/ledger; enumerable unknown key separately | Hooks cannot forge binding/outputs; unknown keys rejected by existing schema. |
| Reverse runs and arms with nullable telemetry | Byte-identical analyzer JSON; scorer retains its own declared order. |
| Save JSON before call; mutate returned rows afterward | Input JSON unchanged; new call returns original output. Never reuse caller objects as trusted data. |
| Family IDs `family-2`, `family-10`, `family-1` with rebound hash | ASCII ordering `family-1`, `family-10`, `family-2`; category differences preserved. |
| Make one family exact with matching exact rubric/hiddenCheckId and boolean exact judgments | exact false fails; exact true can succeed; wrong null shape throws. |
| Wrong raw object `{schemaVersion:1,kind:"research_mock_run_report"}` as ledger | `invalid_evaluation`, no implicit adapter. |
| Add unrelated single-record test family to development fixture with unique source/hash | Development analyzer remains valid; selected test family would fail pairing. |

- [ ] Build capacity fixtures without materializing runs: generate the same valid
  paired record structure for 8,333 then 8,334 families, two arms, 3 attempts,
  runs `[]`. Expected slots are 99,996 accepted/incomplete vs 100,008 throwing
  `analysis_capacity_exceeded`. Do not use `fixture` above at this scale because
  it eagerly builds runs. Add a third unique record above the ceiling to combine
  a family defect with excess capacity; capacity must win. Preserve the core
  `plan_overflow` guard, but do not allocate an impossible JS array merely to reach
  that safe-integer overflow path; document this reachability limit.

- [ ] Build a separate full pilot-shaped fixture: each of six categories has 20
  distinct bilingual families (12 train, 4 development, 4 test), 240 records total.
  Give exact-category records exact rubrics and matching judgment booleans.
  Development has 24 families / 48 records / 288 slots for two arms, all complete;
  assert diagnosticOnly true, researchEligible false and dispatchAllowed false.
  Check a small one-family fixture has the same flags. Do not change the existing
  pilot test helper that deliberately uses only one record per family.

- [ ] Request independent test/code and architecture reviews; fix in-scope defects
  and rerun affected tests, full suite and typecheck. Commit analyzer and tests.

## Work Package 3: Documentation, Evidence And Delivery

**Interfaces:** document the actual inferred API and stable spec output. No new
runtime export barrel, npm command or adapter is needed.

- [ ] Write `docs/research/paired-success.md` with import path, two unknown inputs,
  ordered error rules, literal -0.25 example, incomplete extra-arm behavior,
  100,000-slot bound and diagnostic/provenance limitations. Link it from existing
  scoring docs and README. State replay requires the exact dataset, ledger and
  analyzer version; dataset hash alone does not bind the ledger. Do not publish
  research-private inputs or call family IDs anonymous.
- [ ] Update controller-owned root and legacy handoffs with real RED/GREEN,
  changed files, reviewer findings and unresolved limits. No empirical claim follows
  from synthetic fixtures or compatibility tests.
- [ ] After a source commit, measure a synthetic complete 24-family/288-slot
  analyzer call using a local harness outside the pure analyzer. Run 5 warmups,
  then 20 measured calls using `performance.now()`, retaining all samples. Record
  commit SHA, dataset and ledger SHA-256 (exact serialized bytes), fixture recipe,
  Node version, OS/architecture/CPU metadata, warmup count, sample count and raw
  milliseconds. Calculate descriptive median/p95 using a stated nearest-rank
  convention. No new performance threshold or optimization is authorized.
- [ ] Run the full gate after targeted tests. These commands exist today:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
npm.cmd run benchmark
git diff --check
```

  There are no dedicated lint/format scripts currently; report that accurately.
  Build has previously needed approved escalation for esbuild ancestor-directory
  access. Retry that identical command with escalation if the restriction recurs;
  do not change source or dependencies to mask the sandbox failure.

- [ ] At milestone review, attempt every eligible external provider under the
  hierarchy and use separate native test/code/architecture review as available.
  Resolve blocker/major findings within approval or obtain a concrete scope-change
  decision. Missing external review is explicitly DEGRADED, never multi-model
  agreement. Preserve tests, logs and reviewer identity/actual selected model.
- [ ] Inspect final diff and commit Task-only files. Push with upstream tracking
  and create one Draft PR against the actual prerequisite branch, with Summary,
  acceptance criteria, TDD, tests, cross-check findings, risks/docs and approval
  gate. Do not merge. Rerun targeted and full gates after the Draft opens; if fixes
  occur, commit/push on the same branch and verify PR head matches local HEAD.
- [ ] Astra directly inspects final diff, documentation, logs, branch/push and
  Draft state, reports the Harness Review Result and waits for user approval.

## Plan Acceptance Mapping

| Spec acceptance | Plan location |
| --- | --- |
| 1 literal arithmetic/output | Work package 2 full expected JSON. |
| 2 extremes/zero/partial/category | 0..6 oracle table and exact-category fixture. |
| 3 missing/ungraded/extra arm | Coverage implementation and matrix. |
| 4 telemetry/overflow | Shared accumulation characterization and matrix. |
| 5 split/arm/attempt/family | Validation order and malformed-family matrix. |
| 6 strict input and precedence | Work package 1 multi-invalid characterization plus analyzer matrix. |
| 7 determinism/snapshot/mock | Order, hook, mutation and raw mock cases. |
| 8 small/pilot/capacity | Explicit 24-family selected pilot and 8,333/8,334 fixtures. |
| 9 scorer/caller compatibility | Extracted core contract, full JSON, CLI-containing suite and all project gates. |

This plan contains instructions and example tests, not executed analyzer code.
Task 17's actual validation and review evidence lives in root HANDOFF.md.
