import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { ResearchDataset } from "../src/research/dataset.js";
import { simulateResearchRun } from "../src/research/mock-run.js";
import { prepareResearchRun } from "../src/research/run-plan.js";
import { fingerprintDataset } from "../src/research/scoring.js";

function fixture() {
  const data = JSON.parse(readFileSync("docs/research/datasets/format-demo.json", "utf8"));
  const config = {
    schemaVersion: 1,
    runId: "synthetic-preview",
    datasetSha256: "cc2ccec43f9a00db51c87ec433acae512c25f5727da0ee6902abc521f63abe85",
    split: "development",
    arms: ["full_source", "optimized", "fixed_chunk", "gold_reference"],
    attemptsPerTask: 3,
    scheduleAlgorithm: "sha256-rank-v1",
    seed: "0".repeat(64),
    execution: null,
    evidence: null,
  };
  const scenario = {
    schemaVersion: 1,
    kind: "research_mock_scenario",
    manifestSha256: "278ebbe7955c47bebd3a0d972da8fd5aa49994c5474272bbd2b5021392f0fc00",
    limits: {
      requestTimeoutMs: 10,
      runTimeoutMs: 100,
      spendCapMicrousd: 100,
      concurrency: 1,
      automaticRetries: 0,
    },
    outcomes: Array.from({ length: 12 }, (_, i) => ({
      ordinal: i + 1,
      status: "completed",
      durationMs: 1,
      reservedCostMicrousd: 10,
      settledCostMicrousd: 4 as number | null,
    })),
  };
  return { data, config, scenario };
}

function expectUntouched(slots: ReturnType<typeof simulateResearchRun>["slots"], start: number): void {
  for (const slot of slots.slice(start)) {
    expect(slot).toMatchObject({
      status: "not_started",
      startedAtMs: null,
      latencyMs: null,
      reservedCostMicrousd: null,
      settledCostMicrousd: null,
    });
  }
}

function reversedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedObject);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedObject(item)]));
  }
  return value;
}

const digest = (text: string) => createHash("sha256").update(text).digest("hex");

function completeExecution(): Record<string, unknown> {
  return {
    provider: "synthetic",
    modelSnapshot: "private-model-canary",
    endpoint: "responses",
    tokenizerId: "synthetic-tokenizer",
    tokenizerVersion: "1",
    priceVersion: "synthetic-price",
    inputTokenLimit: 100,
    outputTokenLimit: 20,
    requestTimeoutMs: 1000,
    runTimeoutMs: 10000,
    spendCapMicrousd: 1000000,
    concurrency: 1,
    automaticRetries: 0,
    decodingSha256: "a".repeat(64),
  };
}

function completeEvidence(): Record<string, unknown> {
  return Object.fromEntries([
    "accessApproval", "spendApproval", "uploadApproval", "dataReview",
    "modelQualification", "armPreparation", "gradingPlan", "analysisPlan",
  ].map(key => [key, { id: "private-evidence-canary", sha256: "b".repeat(64) }]));
}

function fullPilot(): ResearchDataset {
  const { data } = fixture();
  const task = data.records[0];
  const categories = ["numeric", "negation", "actor_action", "causal", "temporal", "exact"] as const;
  data.records = categories.flatMap((category, categoryIndex) => Array.from({ length: 20 }, (_, index) => {
    const text = `Synthetic family ${categoryIndex}-${index}.`;
    return (["en", "ko"] as const).map(language => ({
      ...structuredClone(task),
      id: `task-${categoryIndex}-${index}-${language}`,
      familyId: `family-${categoryIndex}-${index}`,
      category,
      language,
      split: index < 12 ? "train" as const : index < 16 ? "development" as const : "test" as const,
      source: { text, sha256: digest(text), provenance: "synthetic", license: "CC0" },
      rubric: category === "exact"
        ? { kind: "exact" as const, instructions: "synthetic", hiddenCheckId: "synthetic" }
        : { kind: "semantic" as const, instructions: "synthetic" },
    }));
  }).flat());
  return data;
}

it("exhausts the synthetic schedule with exact accounting", () => {
  const { data, config, scenario } = fixture();
  const result = simulateResearchRun(data, config, scenario);
  expect(result.summary).toEqual({
    termination: "schedule_exhausted",
    stopReason: "schedule_exhausted",
    plannedSlots: 12,
    startedSlots: 12,
    notStartedSlots: 0,
    completedSlots: 12,
    errorSlots: 0,
    timeoutSlots: 0,
    virtualElapsedMs: 12,
    knownSettledCostMicrousd: 48,
    settledCostMicrousd: 48,
    heldReservationMicrousd: 0,
    remainingBudgetMicrousd: 52,
    budgetExceeded: false,
  });
  expect(result.mockOnly).toBe(true);
  expect(result.dispatchAllowed).toBe(false);
});

it.each([
  [10, 100, 100, 11, 10, 4, "request_timeout", 10, 0, null, 1],
  [10, 10, 100, 10, 10, 4, "run_timeout", 10, 0, null, 1],
  [10, 100, 9, 1, 10, 4, "budget_exhausted", 0, 0, 0, 0],
  [10, 100, 100, 1, 10, null, "unknown_cost", 1, 0, null, 1],
  [10, 100, 100, 1, 10, 11, "reservation_exceeded", 1, 11, 11, 1],
  [10, 100, 10, 1, 10, 11, "reservation_exceeded", 1, 11, 11, 1],
] as const)(
  "accounts for request=%s run=%s cap=%s duration=%s reserve=%s settle=%s",
  (request, run, cap, duration, reserve, settle, reason, elapsed, known, aggregate, started) => {
    const { data, config, scenario } = fixture();
    Object.assign(scenario.limits, {
      requestTimeoutMs: request,
      runTimeoutMs: run,
      spendCapMicrousd: cap,
    });
    Object.assign(scenario.outcomes[0], {
      durationMs: duration,
      reservedCostMicrousd: reserve,
      settledCostMicrousd: settle,
    });
    const report = simulateResearchRun(data, config, scenario);
    expect(report.summary).toMatchObject({
      stopReason: reason,
      virtualElapsedMs: elapsed,
      knownSettledCostMicrousd: known,
      settledCostMicrousd: aggregate,
      startedSlots: started,
    });
    expectUntouched(report.slots, started);
  },
);

it("completes after a first duration just below the request deadline", () => {
  const { data, config, scenario } = fixture();
  scenario.outcomes[0].durationMs = 9;
  const report = simulateResearchRun(data, config, scenario);
  expect(report.summary).toMatchObject({
    termination: "schedule_exhausted",
    stopReason: "schedule_exhausted",
    virtualElapsedMs: 20,
    completedSlots: 12,
    startedSlots: 12,
  });
});

it("traverses twelve zero-duration zero-cost outcomes without advancing time", () => {
  const { data, config, scenario } = fixture();
  for (const outcome of scenario.outcomes) {
    Object.assign(outcome, {
      durationMs: 0,
      reservedCostMicrousd: 0,
      settledCostMicrousd: 0,
    });
  }
  const report = simulateResearchRun(data, config, scenario);
  expect(report.summary).toMatchObject({
    termination: "schedule_exhausted",
    startedSlots: 12,
    completedSlots: 12,
    virtualElapsedMs: 0,
    knownSettledCostMicrousd: 0,
    remainingBudgetMicrousd: 100,
  });
});

it.each([
  [48, 12, 48, "schedule_exhausted"],
  [47, 11, 44, "budget_exhausted"],
] as const)("accounts for an exact reserve budget boundary at cap %s", (cap, started, known, reason) => {
  const { data, config, scenario } = fixture();
  scenario.limits.spendCapMicrousd = cap;
  for (const outcome of scenario.outcomes) {
    outcome.reservedCostMicrousd = 4;
    outcome.settledCostMicrousd = 4;
  }
  const report = simulateResearchRun(data, config, scenario);
  expect(report.summary).toMatchObject({
    stopReason: reason,
    startedSlots: started,
    knownSettledCostMicrousd: known,
    settledCostMicrousd: known,
  });
  expectUntouched(report.slots, started);
});

it("continues after an error with known cost", () => {
  const { data, config, scenario } = fixture();
  scenario.outcomes[0].status = "error";
  const report = simulateResearchRun(data, config, scenario);
  expect(report.summary).toMatchObject({
    termination: "schedule_exhausted",
    startedSlots: 12,
    completedSlots: 11,
    errorSlots: 1,
    knownSettledCostMicrousd: 48,
  });
});

it("stops after an error with unknown cost", () => {
  const { data, config, scenario } = fixture();
  scenario.outcomes[0].status = "error";
  scenario.outcomes[0].settledCostMicrousd = null;
  const report = simulateResearchRun(data, config, scenario);
  expect(report.summary).toMatchObject({
    termination: "stopped",
    stopReason: "unknown_cost",
    startedSlots: 1,
    completedSlots: 0,
    errorSlots: 1,
    knownSettledCostMicrousd: 0,
    settledCostMicrousd: null,
  });
  expectUntouched(report.slots, 1);
});

it("uses the remaining run time as the second-slot deadline", () => {
  const { data, config, scenario } = fixture();
  Object.assign(scenario.limits, { requestTimeoutMs: 10, runTimeoutMs: 10 });
  scenario.outcomes[0].durationMs = 9;
  scenario.outcomes[1].durationMs = 1;
  const report = simulateResearchRun(data, config, scenario);
  expect(report.summary).toMatchObject({
    termination: "stopped",
    stopReason: "run_timeout",
    startedSlots: 2,
    completedSlots: 1,
    timeoutSlots: 1,
    virtualElapsedMs: 10,
    knownSettledCostMicrousd: 4,
    settledCostMicrousd: null,
  });
  expect(report.slots[1]).toMatchObject({
    status: "timeout",
    startedAtMs: 9,
    latencyMs: 1,
    reservedCostMicrousd: 10,
    settledCostMicrousd: null,
  });
  expectUntouched(report.slots, 2);
});

it.each(["timeout", "unknown_cost", "reservation_exceeded"] as const)(
  "keeps ordinal twelve %s termination stopped",
  mode => {
    const { data, config, scenario } = fixture();
    if (mode === "timeout") scenario.outcomes[11].durationMs = 10;
    if (mode === "unknown_cost") scenario.outcomes[11].settledCostMicrousd = null;
    if (mode === "reservation_exceeded") scenario.outcomes[11].settledCostMicrousd = 11;
    const report = simulateResearchRun(data, config, scenario);
    expect(report.summary).toMatchObject({
      termination: "stopped",
      stopReason: mode === "timeout" ? "request_timeout" : mode,
      startedSlots: 12,
      notStartedSlots: 0,
    });
  },
);

it("request timeout ignores late known cost and leaves later slots untouched", () => {
  const { data, config, scenario } = fixture();
  scenario.outcomes[0].durationMs = 10;
  const result = simulateResearchRun(data, config, scenario);
  expect(result.summary).toEqual({
    termination: "stopped",
    stopReason: "request_timeout",
    plannedSlots: 12,
    startedSlots: 1,
    notStartedSlots: 11,
    completedSlots: 0,
    errorSlots: 0,
    timeoutSlots: 1,
    virtualElapsedMs: 10,
    knownSettledCostMicrousd: 0,
    settledCostMicrousd: null,
    heldReservationMicrousd: 10,
    remainingBudgetMicrousd: null,
    budgetExceeded: false,
  });
  expect(result.slots[0]).toMatchObject({
    status: "timeout",
    startedAtMs: 0,
    latencyMs: 10,
    reservedCostMicrousd: 10,
    settledCostMicrousd: null,
  });
  for (const slot of result.slots.slice(1)) {
    expect(slot).toMatchObject({
      status: "not_started",
      startedAtMs: null,
      latencyMs: null,
      reservedCostMicrousd: null,
      settledCostMicrousd: null,
    });
  }
});

it("emits the exact report shape, canonical digest, ordered unique slots, and unchanged preflight", () => {
  const { data, config, scenario } = fixture();
  const before = structuredClone({ data, config, scenario });
  const planned = prepareResearchRun(data, config);
  const report = simulateResearchRun(data, config, scenario);

  expect(report.scenarioSha256).toBe("324e0ef9082ac08079c3227b1fd181d7c979eee1ec3187915450ef341f47afa2");
  expect(Object.keys(report)).toEqual([
    "schemaVersion", "kind", "mockOnly", "dispatchAllowed", "manifest", "scenarioSha256",
    "preflight", "summary", "slots",
  ]);
  expect(Object.keys(report.summary)).toEqual([
    "termination", "stopReason", "plannedSlots", "startedSlots", "notStartedSlots",
    "completedSlots", "errorSlots", "timeoutSlots", "virtualElapsedMs",
    "knownSettledCostMicrousd", "settledCostMicrousd", "heldReservationMicrousd",
    "remainingBudgetMicrousd", "budgetExceeded",
  ]);
  expect(Object.keys(report.slots[0])).toEqual([
    "ordinal", "familyId", "taskId", "language", "category", "arm", "attempt", "status",
    "startedAtMs", "latencyMs", "reservedCostMicrousd", "settledCostMicrousd",
  ]);
  expect(report.slots.map(slot => slot.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(new Set(report.slots.map(slot => slot.ordinal)).size).toBe(12);
  expect(report.preflight).toEqual(planned.preflight);
  expect({ data, config, scenario }).toEqual(before);
});

it("preserves inputs and serializes byte-identically across scenario and object ordering", () => {
  const { data, config, scenario } = fixture();
  const reorderedScenario = reversedObject({ ...scenario, outcomes: [...scenario.outcomes].reverse() });
  const before = structuredClone({ data, config, scenario, reorderedScenario });
  const first = simulateResearchRun(data, config, scenario);
  const second = simulateResearchRun(reversedObject(data), reversedObject(config), reorderedScenario);
  const third = simulateResearchRun(data, config, scenario);

  expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  expect(JSON.stringify(third)).toBe(JSON.stringify(first));
  expect({ data, config, scenario, reorderedScenario }).toEqual(before);
});

it("applies planner, parser, manifest, then slot-coverage error precedence", () => {
  const { data, config, scenario } = fixture();
  expect(() => simulateResearchRun({}, {}, {})).toThrow(/^invalid_configuration$/);
  expect(() => simulateResearchRun({}, config, {})).toThrow(/^invalid_dataset$/);

  const changed = structuredClone(data);
  changed.records[0].answerKey = "changed";
  expect(() => simulateResearchRun(changed, config, {})).toThrow(/^dataset_fingerprint_mismatch$/);
  expect(() => simulateResearchRun(data, config, {})).toThrow(/^invalid_mock_scenario$/);

  const wrongManifest = { ...scenario, manifestSha256: "a".repeat(64), outcomes: [] };
  expect(() => simulateResearchRun(data, config, wrongManifest)).toThrow(/^mock_manifest_mismatch$/);

  const wrongCoverage = structuredClone(scenario);
  wrongCoverage.outcomes[1].ordinal = 1;
  expect(() => simulateResearchRun(data, config, wrongCoverage)).toThrow(/^mock_slot_coverage_mismatch$/);
});

it.each(["missing", "extra", "duplicate"] as const)("rejects %s slot coverage", mode => {
  const { data, config, scenario } = fixture();
  if (mode === "missing") scenario.outcomes.pop();
  if (mode === "extra") scenario.outcomes.push({ ...scenario.outcomes[0], ordinal: 13 });
  if (mode === "duplicate") scenario.outcomes[11].ordinal = 11;
  expect(() => simulateResearchRun(data, config, scenario)).toThrow(/^mock_slot_coverage_mismatch$/);
});

it("validates malformed unreachable outcomes before traversal", () => {
  const { data, config, scenario } = fixture();
  scenario.outcomes[0].durationMs = 10;
  Object.assign(scenario.outcomes[11], { durationMs: "1" });
  expect(() => simulateResearchRun(data, config, scenario)).toThrow(/^invalid_mock_scenario$/);
});

it("settles exactly MAX_SAFE_INTEGER with zero-cost later outcomes", () => {
  const { data, config, scenario } = fixture();
  Object.assign(scenario.limits, {
    spendCapMicrousd: Number.MAX_SAFE_INTEGER,
    runTimeoutMs: Number.MAX_SAFE_INTEGER,
  });
  for (const outcome of scenario.outcomes) {
    Object.assign(outcome, { durationMs: 0, reservedCostMicrousd: 0, settledCostMicrousd: 0 });
  }
  Object.assign(scenario.outcomes[0], {
    reservedCostMicrousd: Number.MAX_SAFE_INTEGER,
    settledCostMicrousd: Number.MAX_SAFE_INTEGER,
  });
  const report = simulateResearchRun(data, config, scenario);
  expect(report.summary).toMatchObject({
    termination: "schedule_exhausted",
    startedSlots: 12,
    knownSettledCostMicrousd: Number.MAX_SAFE_INTEGER,
    settledCostMicrousd: Number.MAX_SAFE_INTEGER,
    remainingBudgetMicrousd: 0,
    budgetExceeded: false,
  });
});

it("rejects MAX_SAFE_INTEGER plus one even when the overflow is unreachable", () => {
  const { data, config, scenario } = fixture();
  Object.assign(scenario.limits, {
    spendCapMicrousd: Number.MAX_SAFE_INTEGER,
    runTimeoutMs: Number.MAX_SAFE_INTEGER,
  });
  scenario.outcomes[0].durationMs = 10;
  scenario.outcomes[0].settledCostMicrousd = Number.MAX_SAFE_INTEGER;
  scenario.outcomes[1].settledCostMicrousd = 1;
  expect(() => simulateResearchRun(data, config, scenario)).toThrow(/^invalid_mock_scenario$/);
});

it("keeps a complete 120-family synthetic preflight offline and dispatch-blocked", () => {
  const data = fullPilot();
  const { config: baseConfig } = fixture();
  const config = {
    ...baseConfig,
    datasetSha256: fingerprintDataset(data),
    execution: completeExecution(),
    evidence: completeEvidence(),
  };
  const prepared = prepareResearchRun(data, config);
  const scenario = {
    ...fixture().scenario,
    manifestSha256: prepared.manifest.manifestSha256,
    limits: {
      requestTimeoutMs: 10,
      runTimeoutMs: 100,
      spendCapMicrousd: 100,
      concurrency: 1,
      automaticRetries: 0,
    },
    outcomes: prepared.slots.map(slot => ({
      ordinal: slot.ordinal,
      status: "completed",
      durationMs: 0,
      reservedCostMicrousd: 0,
      settledCostMicrousd: 0,
    })),
  };
  const report = simulateResearchRun(data, config, scenario);
  expect(data.records).toHaveLength(240);
  expect(report.slots).toHaveLength(576);
  expect(report.preflight).toEqual({
    configurationComplete: true,
    pilotStructureSatisfied: true,
    evidenceReferencesPresent: true,
    preflightPassed: true,
    dispatchAllowed: false,
    issues: [],
  });
  expect(report.mockOnly).toBe(true);
  expect(report.dispatchAllowed).toBe(false);
});

it("does not access network, timers, or wall-clock time", () => {
  const { data, config, scenario } = fixture();
  const spies = [
    vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("fetch-called"); }),
    vi.spyOn(globalThis, "setTimeout").mockImplementation(() => { throw new Error("setTimeout-called"); }),
    vi.spyOn(globalThis, "setInterval").mockImplementation(() => { throw new Error("setInterval-called"); }),
    vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("Date.now-called"); }),
  ];
  try {
    const report = simulateResearchRun(data, config, scenario);
    expect(report.scenarioSha256).toBe("324e0ef9082ac08079c3227b1fd181d7c979eee1ec3187915450ef341f47afa2");
    expect(report.summary).toEqual({
      termination: "schedule_exhausted",
      stopReason: "schedule_exhausted",
      plannedSlots: 12,
      startedSlots: 12,
      notStartedSlots: 0,
      completedSlots: 12,
      errorSlots: 0,
      timeoutSlots: 0,
      virtualElapsedMs: 12,
      knownSettledCostMicrousd: 48,
      settledCostMicrousd: 48,
      heldReservationMicrousd: 0,
      remainingBudgetMicrousd: 52,
      budgetExceeded: false,
    });
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});
