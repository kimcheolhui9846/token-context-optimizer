# Offline Research Mock Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic offline simulator and CLI for timeout, reservation and unknown-cost accounting, without executing models.

**Architecture:** Reconstruct the existing prepared plan, validate and canonicalize a strictly bound synthetic scenario, then reduce ordered slots using virtual time and integer microUSD. Return a separate mock report, never a scoring ledger. The CLI is only a three-file input/output wrapper.

**Tech Stack:** Existing Node.js >=22, TypeScript, Zod v4, Vitest and Node crypto; no new dependencies.

## Global Constraints

- Source of truth: [approved specification](../specs/2026-09-09-research-mock-runner-design.md). The user approved written-spec review and requested this plan on 2026-09-09, then approved subagent-driven implementation after plan commit `ac655c0`.
- `dispatchAllowed` is always `false`; `mockOnly` is always `true`.
- `concurrency` is literal `1`; `automaticRetries` is literal `0`.
- No providers, credentials, network access, wall-clock timers, model outputs or grading in the simulator.
- No provider-shaped callback, SDK adapter, retries, crash recovery, tokenization, arm preparation, generated answers, grading, scoring-ledger export, paired statistics or fine-tuning.
- At most 100,000 outcomes; strict keys, no coercion, safe integer arithmetic, no input mutation.
- Existing preflight and scorer contracts stay unchanged. Synthetic limits never modify the original execution configuration.
- Use `apply_patch` for manual edits; do not revert unrelated changes or modify global Codex configuration.
- Observe targeted behavioral RED before production changes, then GREEN and refactoring. A missing import alone is not the behavioral evidence: after first import failure, use a callable throwing stub and observe the intended assertions fail before implementing behavior.
- Use literal expectations, not the simulator or its parser to calculate expected values. Setup may use the existing scheduler solely to create valid manifest bindings.
- Keep execution sequential across shared files. Native agents must use installed roles. Missing independent review is not approval.
- PR #14 is stacked on PR #13; no merging or retargeting until the prerequisite actually merges with explicit user approval.

## File Map And Ownership

| Task | Files | Responsibility |
| --- | --- | --- |
| 1 | Create `src/research/mock-scenario.ts`, `tests/research-mock-scenario.test.ts` | Strict parsing, numeric safety and canonical ordering. |
| 2 | Create `src/research/mock-run.ts`, `tests/research-mock-run.test.ts` | Plan binding, state transitions, report and accounting. |
| 3 | Create `scripts/mock-research.mjs`, `tests/research-mock-run-cli.test.ts`; modify `package.json` scripts and `tsconfig.scripts.json` include | CLI contract and checked script integration. |
| 4 | Create `docs/research/mock-running.md`, `docs/research/datasets/mock-run-demo.json`, `docs/research/evidence/2026-09-09-mock-run-local.json`; modify README, handoff and this checklist | Reproducible usage, measurements, final gate and PR handoff. |

Do not edit existing test files just to export helpers. A small local fixture in each
new suite avoids widening existing ownership. Task 4 runs after runtime commits so
timing evidence names the measured code revision. If execution occurs on another
date, use that actual date in the evidence filename and documentation.

## Start Gate

- [x] Read current branch/status, local AGENTS instructions if any, this plan and the spec. Check PR #13/#14 live state. Keep the current checkout unless the user approves a new worktree; use the relevant worktree skill at execution time.
- [x] Run `npm.cmd test -- --run tests/research-run-plan.test.ts tests/research-run-plan-cli.test.ts`, then `npm.cmd test`. Baseline at plan creation is 94 targeted / 454 total; record actual execution results rather than assuming those counts.
- [x] Main owns task orchestration/docs; use `executor` for bounded runtime tasks, `test-engineer` for test adequacy, then `code-reviewer` and `architect` for final reviews. Never have two implementers write the same files.

### Task 1: Strict Synthetic Scenario Parser

**Files:** `src/research/mock-scenario.ts`; `tests/research-mock-scenario.test.ts`.

**Interfaces:** Consumes `unknown`. Produces `parseMockScenario(input: unknown): MockScenario` and exported `MockScenario` type. Parser checks only shape, canonicalization and total numeric safety; manifest matching and exact slot coverage belong to Task 2. Empty outcomes are shape-valid but will fail nonempty plan coverage.

- [x] **Write failing parser tests with a detached fixture.**

```ts
import { describe, expect, it } from "vitest";
import { parseMockScenario } from "../src/research/mock-scenario.js";
function fixture() {
  return { schemaVersion: 1, kind: "research_mock_scenario", manifestSha256: "a".repeat(64),
    limits: { requestTimeoutMs: 10, runTimeoutMs: 100, spendCapMicrousd: 100,
      concurrency: 1, automaticRetries: 0 },
    outcomes: [2, 1].map(ordinal => ({ ordinal, status: "completed", durationMs: 1,
      reservedCostMicrousd: 10, settledCostMicrousd: 4 })) };
}
describe("mock scenario", () => {
  it("sorts a detached canonical snapshot", () => {
    const input = fixture(); const before = structuredClone(input);
    const parsed = parseMockScenario(input);
    expect(parsed.outcomes.map(item => item.ordinal)).toEqual([1, 2]);
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "kind", "manifestSha256", "limits", "outcomes"]);
    expect(Object.keys(parsed.outcomes[0])).toEqual(["ordinal", "status", "durationMs", "reservedCostMicrousd", "settledCostMicrousd"]);
    parsed.outcomes[0].durationMs = 9;
    expect(input).toEqual(before);
  });
  it("rejects total settlement overflow even for unreachable outcomes", () => {
    const input = fixture();
    input.outcomes[0].settledCostMicrousd = Number.MAX_SAFE_INTEGER;
    expect(() => parseMockScenario(input)).toThrow("invalid_mock_scenario");
  });
  it.each(["3", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid duration %s", value => {
    const input = fixture();
    Object.assign(input.outcomes[0], { durationMs: value });
    expect(() => parseMockScenario(input)).toThrow("invalid_mock_scenario");
  });
});
```

- [x] Run `npm.cmd test -- --run tests/research-mock-scenario.test.ts`. After the import failure, create only a callable stub throwing `Error("not_implemented")`; rerun and record behavioral assertion failures before the implementation below.
- [x] Implement the strict parser using this shape and safe subtraction before addition.

```ts
import * as z from "zod/v4";
const nonnegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = nonnegative.min(1);
const schema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.literal("research_mock_scenario"),
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  limits: z.strictObject({ requestTimeoutMs: positive, runTimeoutMs: positive,
    spendCapMicrousd: positive, concurrency: z.literal(1), automaticRetries: z.literal(0)
  }).refine(value => value.runTimeoutMs >= value.requestTimeoutMs),
  outcomes: z.array(z.strictObject({ ordinal: positive,
    status: z.enum(["completed", "error"]), durationMs: nonnegative,
    reservedCostMicrousd: nonnegative, settledCostMicrousd: nonnegative.nullable()
  })).max(100000),
});
export type MockScenario = z.infer<typeof schema>;
export function parseMockScenario(input: unknown): MockScenario {
  try {
    const value = schema.parse(input);
    let sum = 0;
    for (const outcome of value.outcomes) {
      if (outcome.settledCostMicrousd === null) continue;
      if (outcome.settledCostMicrousd > Number.MAX_SAFE_INTEGER - sum) throw new Error();
      sum += outcome.settledCostMicrousd;
    }
    value.outcomes.sort((a, b) => a.ordinal - b.ordinal);
    return value;
  } catch { throw new Error("invalid_mock_scenario"); }
}
```

- [x] Add table-driven RED/GREEN increments for every required key/unknown key at each object level, null-vs-missing settlement, all numeric fields, zero limits versus zero costs, invalid hash/kind/status, concurrency/retry literals, 100000/100001 entries, reversed key insertion order and safe sum at the exact maximum. Use this mutation pattern, enumerating keys explicitly from the spec:

```ts
it.each(["requestTimeoutMs", "runTimeoutMs", "spendCapMicrousd", "concurrency", "automaticRetries"])("requires limit %s", key => {
  const input = fixture();
  Reflect.deleteProperty(input.limits, key);
  expect(() => parseMockScenario(input)).toThrow("invalid_mock_scenario");
});
```

- [x] Rerun parser suite and `npm.cmd run typecheck`; request test-engineer review of validation boundaries and fixed key order. Commit only after GREEN: `git add -- src/research/mock-scenario.ts tests/research-mock-scenario.test.ts`, then `git commit -m "feat: validate synthetic research scenarios"`.

### Task 2: Deterministic Sequential Simulator

**Files:** `src/research/mock-run.ts`; `tests/research-mock-run.test.ts`.

**Interfaces:** Consumes `parseMockScenario(input: unknown): MockScenario` and existing `prepareResearchRun(dataset: unknown, configuration: unknown)`. Produces `simulateResearchRun(dataset: unknown, configuration: unknown, scenario: unknown): MockRunReport`, and exported `MockRunReport = ReturnType<typeof simulateResearchRun>`. Infer the function return rather than annotating it with its own alias. Report field names/order and primitive types are the spec's Output And Accounting contract; preserve literal tags with `as const`.

- [x] Write the first full traversal and timeout tests. This fixture binds inputs with an existing known-answer manifest, not the simulator.

```ts
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { simulateResearchRun } from "../src/research/mock-run.js";
function fixture() {
  const data = JSON.parse(readFileSync("docs/research/datasets/format-demo.json", "utf8"));
  const config = { schemaVersion: 1, runId: "synthetic-preview",
    datasetSha256: "cc2ccec43f9a00db51c87ec433acae512c25f5727da0ee6902abc521f63abe85",
    split: "development", arms: ["full_source", "optimized", "fixed_chunk", "gold_reference"],
    attemptsPerTask: 3, scheduleAlgorithm: "sha256-rank-v1", seed: "0".repeat(64), execution: null, evidence: null };
  const scenario = { schemaVersion: 1, kind: "research_mock_scenario",
    manifestSha256: "278ebbe7955c47bebd3a0d972da8fd5aa49994c5474272bbd2b5021392f0fc00",
    limits: { requestTimeoutMs: 10, runTimeoutMs: 100, spendCapMicrousd: 100,
      concurrency: 1, automaticRetries: 0 },
    outcomes: Array.from({ length: 12 }, (_, i) => ({ ordinal: i + 1,
      status: "completed", durationMs: 1, reservedCostMicrousd: 10,
      settledCostMicrousd: 4 as number | null })) };
  return { data, config, scenario };
}
it("exhausts the synthetic schedule with exact accounting", () => {
  const { data, config, scenario } = fixture();
  const result = simulateResearchRun(data, config, scenario);
  expect(result.summary).toEqual({ termination: "schedule_exhausted", stopReason: "schedule_exhausted",
    plannedSlots: 12, startedSlots: 12, notStartedSlots: 0, completedSlots: 12,
    errorSlots: 0, timeoutSlots: 0, virtualElapsedMs: 12, knownSettledCostMicrousd: 48,
    settledCostMicrousd: 48, heldReservationMicrousd: 0, remainingBudgetMicrousd: 52,
    budgetExceeded: false });
  expect(result.mockOnly).toBe(true); expect(result.dispatchAllowed).toBe(false);
});
it("request timeout ignores late known cost and leaves later slots untouched", () => {
  const { data, config, scenario } = fixture();
  scenario.outcomes[0].durationMs = 10;
  const result = simulateResearchRun(data, config, scenario);
  expect(result.summary).toEqual({ termination: "stopped", stopReason: "request_timeout",
    plannedSlots: 12, startedSlots: 1, notStartedSlots: 11, completedSlots: 0,
    errorSlots: 0, timeoutSlots: 1, virtualElapsedMs: 10, knownSettledCostMicrousd: 0,
    settledCostMicrousd: null, heldReservationMicrousd: 10, remainingBudgetMicrousd: null,
    budgetExceeded: false });
  expect(result.slots[0]).toMatchObject({ status: "timeout", startedAtMs: 0,
    latencyMs: 10, reservedCostMicrousd: 10, settledCostMicrousd: null });
  for (const slot of result.slots.slice(1)) expect(slot).toMatchObject({ status: "not_started",
    startedAtMs: null, latencyMs: null, reservedCostMicrousd: null, settledCostMicrousd: null });
});
```

- [x] Run `npm.cmd test -- --run tests/research-mock-run.test.ts`, introduce only a callable throwing stub after the import failure, then record behavioral RED.
- [x] Implement plan reconstruction before parsing, exact binding, then initialize one not-started record per slot. Use this validation and typed accumulator boundary:

```ts
const prepared = prepareResearchRun(dataset, configuration);
const parsed = parseMockScenario(scenario);
if (parsed.manifestSha256 !== prepared.manifest.manifestSha256) throw new Error("mock_manifest_mismatch");
if (parsed.outcomes.length !== prepared.slots.length ||
    parsed.outcomes.some((entry, i) => entry.ordinal !== prepared.slots[i].ordinal)) {
  throw new Error("mock_slot_coverage_mismatch");
}
type Status = "not_started" | "completed" | "error" | "timeout";
const slots = prepared.slots.map(slot => ({ ...slot, status: "not_started" as Status,
  startedAtMs: null as number | null, latencyMs: null as number | null,
  reservedCostMicrousd: null as number | null, settledCostMicrousd: null as number | null }));
type Reason = "schedule_exhausted" | "run_timeout" | "budget_exhausted" |
  "request_timeout" | "unknown_cost" | "reservation_exceeded";
let stopReason: Reason = "schedule_exhausted";
let elapsed = 0, knownCost = 0, held = 0;
let unknownCost = false;
const limits = parsed.limits;
```

- [x] Implement only transitions required by each RED increment, using this ordered loop as the complete target behavior. Import `createHash` from Node crypto and the two existing APIs, without I/O dependencies.

```ts
for (let i = 0; i < slots.length; i++) {
  if (elapsed >= limits.runTimeoutMs) { stopReason = "run_timeout"; break; }
  const outcome = parsed.outcomes[i];
  if (outcome.reservedCostMicrousd > limits.spendCapMicrousd - knownCost) {
    stopReason = "budget_exhausted"; break;
  }
  const slot = slots[i];
  slot.startedAtMs = elapsed;
  slot.reservedCostMicrousd = outcome.reservedCostMicrousd;
  held = outcome.reservedCostMicrousd;
  const remaining = limits.runTimeoutMs - elapsed;
  const deadline = Math.min(limits.requestTimeoutMs, remaining);
  if (outcome.durationMs >= deadline) {
    slot.status = "timeout"; slot.latencyMs = deadline; elapsed += deadline;
    unknownCost = true;
    stopReason = remaining <= limits.requestTimeoutMs ? "run_timeout" : "request_timeout";
    break;
  }
  slot.status = outcome.status; slot.latencyMs = outcome.durationMs;
  elapsed += outcome.durationMs;
  slot.settledCostMicrousd = outcome.settledCostMicrousd;
  if (outcome.settledCostMicrousd === null) { unknownCost = true; stopReason = "unknown_cost"; break; }
  knownCost += outcome.settledCostMicrousd; held = 0;
  if (outcome.settledCostMicrousd > outcome.reservedCostMicrousd) { stopReason = "reservation_exceeded"; break; }
}
const completed = slots.filter(slot => slot.status === "completed").length;
const errors = slots.filter(slot => slot.status === "error").length;
const timeouts = slots.filter(slot => slot.status === "timeout").length;
const started = completed + errors + timeouts;
return { schemaVersion: 1 as const, kind: "research_mock_report" as const,
  mockOnly: true as const, dispatchAllowed: false as const, manifest: prepared.manifest,
  scenarioSha256: createHash("sha256").update(JSON.stringify(parsed), "utf8").digest("hex"),
  preflight: prepared.preflight,
  summary: { termination: stopReason === "schedule_exhausted" ? "schedule_exhausted" as const : "stopped" as const,
    stopReason, plannedSlots: slots.length, startedSlots: started, notStartedSlots: slots.length - started,
    completedSlots: completed, errorSlots: errors, timeoutSlots: timeouts, virtualElapsedMs: elapsed,
    knownSettledCostMicrousd: knownCost, settledCostMicrousd: unknownCost ? null : knownCost,
    heldReservationMicrousd: held, remainingBudgetMicrousd: unknownCost ? null : Math.max(0, limits.spendCapMicrousd - knownCost),
    budgetExceeded: knownCost > limits.spendCapMicrousd }, slots };
```

- [x] Add independent RED/GREEN cases using this exact first-slot table, resetting the fixture each row. Columns override request/run/cap, then first outcome duration/reservation/settlement. Assert reason, elapsed, known spend, aggregate spend and started count literally; also assert all remaining slots are untouched for stopped rows.

| Request/run/cap | Duration/reserve/settle | Reason | Elapsed / known / aggregate / started |
| --- | --- | --- | --- |
| 10/100/100 | 11/10/4 | request_timeout | 10 / 0 / null / 1 |
| 10/10/100 | 10/10/4 | run_timeout | 10 / 0 / null / 1 |
| 10/100/9 | 1/10/4 | budget_exhausted | 0 / 0 / 0 / 0 |
| 10/100/100 | 1/10/null | unknown_cost | 1 / 0 / null / 1 |
| 10/100/100 | 1/10/11 | reservation_exceeded | 1 / 11 / 11 / 1 |
| 10/100/10 | 1/10/11 | reservation_exceeded | 1 / 11 / 11 / 1 |

```ts
it.each([
  [10, 100, 100, 11, 10, 4, "request_timeout", 10, 0, null, 1],
  [10, 10, 100, 10, 10, 4, "run_timeout", 10, 0, null, 1],
  [10, 100, 9, 1, 10, 4, "budget_exhausted", 0, 0, 0, 0],
  [10, 100, 100, 1, 10, null, "unknown_cost", 1, 0, null, 1],
  [10, 100, 100, 1, 10, 11, "reservation_exceeded", 1, 11, 11, 1],
  [10, 100, 10, 1, 10, 11, "reservation_exceeded", 1, 11, 11, 1],
] as const)("accounts for request=%s run=%s cap=%s duration=%s reserve=%s settle=%s",
  (request, run, cap, duration, reserve, settle, reason, elapsed, known, aggregate, started) => {
    const { data, config, scenario } = fixture();
    Object.assign(scenario.limits, { requestTimeoutMs: request, runTimeoutMs: run, spendCapMicrousd: cap });
    Object.assign(scenario.outcomes[0], { durationMs: duration, reservedCostMicrousd: reserve, settledCostMicrousd: settle });
    const report = simulateResearchRun(data, config, scenario);
    expect(report.summary).toMatchObject({ stopReason: reason, virtualElapsedMs: elapsed,
      knownSettledCostMicrousd: known, settledCostMicrousd: aggregate, startedSlots: started });
  });
```

- [x] Complete the boundary matrix: first duration 9 yields full completion at elapsed20; all zero-duration/zero-cost outcomes traverse all12 at elapsed0; all reserve=settle=4 with cap48 exhaust at cost48; cap47 starts11 then budget-stops at cost44. Error at slot1 with known cost4 still starts12, completed11/error1. Error with unknown cost stops immediately. With request10/run10, first duration9 and second duration1, slot2 times out at elapsed10 with known4 and aggregate null. A timeout/null/over-reservation on ordinal12 remains `stopped`, not exhausted. Use the same fixture/table pattern with literal values.
- [x] Assert input preservation, ordinal uniqueness/order, no extra report/summary/slot keys, repeated byte-identical serialization and unchanged preflight. Add combined invalid-input cases that pin error precedence, malformed unreachable entries, duplicate/missing/extra ordinals, reversed scenario/object ordering and MAX_SAFE_INTEGER boundaries. Test a safe settlement sum of MAX with zero-cost later events; reject MAX+1 even if unreachable.
- [x] Pin the Task 2 baseline `scenarioSha256` to `324e0ef9082ac08079c3227b1fd181d7c979eee1ec3187915450ef341f47afa2`. This value was independently calculated during planning with Node crypto and literal scenario construction, before any mock implementation. Never derive the expected digest with `parseMockScenario` or `simulateResearchRun`. Use a fully synthetic 120-family paired fixture with complete synthetic config/evidence to prove preflight true still leaves dispatch false. Reuse the construction pattern in `tests/research-run-plan.test.ts:37` locally without exporting/changing that file.
- [x] Check imports/source and invoke under throwing spies for `fetch`, `setTimeout`, `setInterval` and `Date.now`, restoring spies in `finally`; assert the simulator still returns the literal baseline. Inspect for environment/credential, child-process and grading access. Do not call this proof of real SDK behavior.
- [x] Run `npm.cmd test -- --run tests/research-mock-scenario.test.ts tests/research-mock-run.test.ts tests/research-run-plan.test.ts tests/research-scoring.test.ts` and typecheck/build. Test-engineer reviews independent expectations and every stop path. Commit `feat: simulate offline research run accounting` with only Task 2 files.

The pre-start run-limit guard is defensive: reachable successful events always end
strictly before the deadline, and a timeout already stops the loop. Cover its public
invariant with the two-slot run-timeout case above; do not fabricate an inaccessible
internal state or weaken deadline tie semantics to obtain branch coverage.

### Task 3: Read-Only Three-Input CLI

**Files:** `scripts/mock-research.mjs`, `tests/research-mock-run-cli.test.ts`, `package.json`, `tsconfig.scripts.json`.

**Interfaces:** Consumes compiled `simulateResearchRun` from `../dist/src/research/mock-run.js` and `parseJsonObjectRejectingDuplicateKeys` from `./plugin-runtime.mjs`. Produces exit0 `{ valid: true, report }` or exit1 fixed usage/invalid_input envelope, exactly one compact newline-terminated JSON object, empty stderr. Stopped simulations are valid, not process errors.

- [x] Create an isolated compiled process-test harness using `execFile(process.execPath, ...)` with `promisify`, no shell interpolation. In `beforeAll`, use `mkdtemp` below `.artifacts`, copy the CLI and shared JSON parser into its scripts folder, and run local `typescript/bin/tsc -p tsconfig.json --outDir <fixture>/dist`. In `afterAll`, remove only that verified temporary root. Use the existing run-plan CLI test lifecycle as the template; no root `dist` reuse.
- [x] Use the format-demo/config/scenario inputs from Task 2, written as JSON under that test root. Define local `invoke(args: string[])` returning `{stdout,stderr,code}` from both resolved and rejected execFile results. Pin this first process behavior before implementing the wrapper:

```ts
const result = await invoke([datasetPath, configurationPath, scenarioPath]);
expect(result.code).toBe(0);
expect(result.stderr).toBe("");
const envelope = JSON.parse(result.stdout);
expect(result.stdout).toBe(JSON.stringify(envelope) + "\n");
expect(Object.keys(envelope)).toEqual(["valid", "report"]);
expect(envelope.valid).toBe(true);
expect(envelope.report.summary).toMatchObject({ stopReason: "schedule_exhausted",
  plannedSlots: 12, startedSlots: 12, virtualElapsedMs: 12, settledCostMicrousd: 48 });
```

- [x] Run `npm.cmd test -- --run tests/research-mock-run-cli.test.ts`. After missing-file setup failure, create an inert CLI that only prints `{"valid":false,"code":"invalid_input"}` and sets exit1; rerun to observe behavioral failures before adding real input handling.
- [x] Implement the complete narrow wrapper below, then add `"mock:research": "node scripts/mock-research.mjs"` to npm scripts and `"scripts/mock-research.mjs"` to the script typecheck include list.

```js
import { readFile } from "node:fs/promises";
import { simulateResearchRun } from "../dist/src/research/mock-run.js";
import { parseJsonObjectRejectingDuplicateKeys } from "./plugin-runtime.mjs";
async function main(args) {
  if (args.length !== 3 || args.some(arg => !arg.trim())) return { valid: false, code: "usage" };
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const dataset = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[0])));
    const config = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[1])));
    const scenario = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[2])));
    return { valid: true, report: simulateResearchRun(dataset, config, scenario) };
  } catch { return { valid: false, code: "invalid_input" }; }
}
const result = await main(process.argv.slice(2));
console.log(JSON.stringify(result));
process.exitCode = result.valid ? 0 : 1;
```

- [x] Add per-input negative process tests: unreadable path, malformed JSON, duplicate raw member (literal and escaped-equivalent keys, including nested objects), invalid schema, UTF-8 BOM and malformed UTF-8; plus zero/one/two/four args and a blank in each position. Build duplicate-key text from minified JSON rather than newline-sensitive replacement. Use exact envelope assertions, for example:

```ts
expect(await invoke([])).toEqual({ stdout: '{"valid":false,"code":"usage"}\n', stderr: "", code: 1 });
expect(await invoke([datasetPath, configurationPath, "private-missing-canary.json"]))
  .toEqual({ stdout: '{"valid":false,"code":"invalid_input"}\n', stderr: "", code: 1 });
```

- [x] For decoder-isolation tests, inject malformed bytes `[0xc3,0x28]` into an unconstrained dataset question or otherwise-valid configuration `modelSnapshot`; update the dependent dataset fingerprint and manifest binding for the lossy-decoded control, then prove that control reaches the simulator successfully. Feed the original malformed bytes to the CLI and require invalid_input. In the strict scenario there is no arbitrary text field: malformed bytes in a kind/hash will also violate schema after lossy decoding. Keep that as a malformed-input rejection test, explicitly not a decoder-isolation claim. Do not invent a permissive decoder that strips invalid bytes. Build bytes with this marker-replacement pattern:

```ts
const text = JSON.stringify(configurationWithMarker);
const bytes = Buffer.from(text);
const offset = bytes.indexOf("utf8-marker");
if (offset < 0) throw new Error("missing_utf8_marker");
const malformed = Buffer.concat([bytes.subarray(0, offset), Buffer.from([0xc3, 0x28]),
  bytes.subarray(offset + Buffer.byteLength("utf8-marker"))]);
const lossyControl = JSON.parse(malformed.toString("utf8"));
```

`configurationWithMarker` is the otherwise-valid configuration fixture with a
complete execution object using `modelSnapshot: "utf8-marker"`; use the execution
fixture at `tests/research-run-plan-cli.test.ts:15`. Rebind the scenario using
`prepareResearchRun(dataset, lossyControl)` before asserting successful control
simulation, then write the original `malformed` bytes as the configuration file.
- [x] Assert manifest mismatch and missing/duplicate/out-of-plan outcomes collapse to invalid_input. Run a valid deliberate timeout scenario and assert exit0 with request_timeout and 11 not-started slots. Read all three fixture files before/after successful and rejected invocations and compare buffers. Check canary text and paths never appear in stdout/stderr.
- [x] Run CLI suite, all research mock suites, `npm.cmd run typecheck`, and build. Request independent process-boundary review; commit Task 3 files as `feat: expose offline research mock CLI`.

### Task 4: Reproducible Demo, Documentation And Final Evidence

**Files:** Usage/demo/evidence/README/handoff/plan paths from File Map. No production changes in this task unless a failing test identifies a scoped defect, in which case return to the owning task and its review.

**Interfaces:** Existing compiled simulator and CLI, the public 24-record development seed, and `run-plan-demo.json`. Produces documented synthetic demo and descriptive local timing evidence, not a new runtime API.

- [x] Create the 288-outcome demo with the literal binding and values below; mechanically expand every outcome into the JSON file using `apply_patch`. JSON has no comments or generated answer content.

```js
const demo = { schemaVersion: 1, kind: "research_mock_scenario",
  manifestSha256: "b0383f51bf3214683702919b73f41ae0b7c522d0a94ee671c07d550745da6767",
  limits: { requestTimeoutMs: 10, runTimeoutMs: 1000, spendCapMicrousd: 2000,
    concurrency: 1, automaticRetries: 0 },
  outcomes: Array.from({ length: 288 }, (_, i) => ({ ordinal: i + 1, status: "completed",
    durationMs: 1, reservedCostMicrousd: 10, settledCostMicrousd: 4 })) };
```

- [x] Build, run direct CLI and `npm.cmd run mock:research -- docs/research/datasets/development-seed.json docs/research/datasets/run-plan-demo.json docs/research/datasets/mock-run-demo.json`. Assert exhausted, 288 started/completed, elapsed288, cost1152, remaining848, held0, preflightfalse and dispatchfalse. Confirm the input files remain byte-identical.
- [x] Document those commands and expected values in `docs/research/mock-running.md`, with all six stop reasons, unknown-cost/held-reservation meaning, strict separation from scorer and real approvals, build prerequisite, fatal UTF-8/duplicate-key handling and input-memory limitation. Replace README's "command does not exist" paragraph only after that command actually works. Update handoff with actual completed task/review/verification status.
- [x] Measure after committing the runtime; keep this external measurement code outside the simulator. Read the three JSON files before measuring, run one warm-up, then 20 calls. Check outputs after each timed call, not inside the timed interval. Record samples without rounding before percentiles:

```js
const samplesMs = [];
simulateResearchRun(dataset, configuration, scenario);
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  const result = simulateResearchRun(dataset, configuration, scenario);
  samplesMs.push(performance.now() - start);
  if (result.summary.startedSlots !== 288 || result.summary.settledCostMicrousd !== 1152) throw new Error("invalid_benchmark_fixture");
}
const ordered = [...samplesMs].sort((a, b) => a - b);
const medianMs = ordered[Math.ceil(0.5 * ordered.length) - 1];
const p95Ms = ordered[Math.ceil(0.95 * ordered.length) - 1];
```

Inputs in this measurement are JSON.parse results from the three demo paths; import
the compiled simulator, `performance` from `node:perf_hooks`, and OS metadata from
`node:os`. Capture `git rev-parse HEAD` outside timing. Archive codeCommit,
generatedAt, nodeVersion, platform, osRelease, architecture, cpuModel,
datasetSha256/configSha256/manifestSha256/scenarioSha256, warmupCount1,
sampleCount20, samplesMs, medianMs and p95Ms with `apply_patch`. Independently
recalculate percentiles and validate links. Never invent a latency threshold or
claim model performance from these samples.

- [x] Run targeted mock suites, then the full gate sequentially: `npm.cmd test`; `npm.cmd run build`; `npm.cmd run typecheck`; `npm.cmd run smoke:mcp`; `npm.cmd run validate:plugin`; `npm.cmd run benchmark`; both demo CLI forms; `git diff --check`. Wait for each command to finish before build/test mutations overlap.
- [ ] Request final `code-reviewer` and `architect` reviews against the prerequisite head to current implementation head. Give each the spec, plan, exact diff and fresh evidence. Resolve blocking findings, rerun affected targeted checks and full gate after runtime fixes, and record actual reviewed commits/verdicts.
- [ ] Verify only intended files changed, update checkboxes truthfully, commit docs/evidence, push the feature branch and update PR #14's title/body for implementation. Keep base on PR #13 until it is actually merged; no merge without explicit approval. Report remaining real-experiment work separately.

## Plan Self-Review And Handoff

- Spec coverage: parser/validation/canonicalization -> Task1; binding/transitions/output/authority -> Task2; JSON/process boundary -> Task3; docs/performance/review/delivery -> Task4.
- Boundary precision: timeout wins equality; no late known settlement; reservation drift is retained rather than clamped; a final-slot stop stays stopped; impossible public states are not fabricated for coverage.
- Interface consistency: only `parseMockScenario`, `MockScenario`, `simulateResearchRun`, `MockRunReport` and existing named APIs cross task boundaries.
- Planning status at `ac655c0`: all implementation checkboxes remained unchecked; writing the plan executed no new runtime tests or measurements. Subsequent implementation progress is recorded in the task checkboxes and handoff.
- Recommended execution: subagent-driven, one bounded implementer per task plus independent test/spec/quality reviews. Inline execution remains available with the same gates.
