import { createHash } from "node:crypto";
import { parseMockScenario } from "./mock-scenario.js";
import { prepareResearchRun } from "./run-plan.js";

export function simulateResearchRun(dataset: unknown, configuration: unknown, scenario: unknown) {
  const prepared = prepareResearchRun(dataset, configuration);
  const parsed = parseMockScenario(scenario);
  if (parsed.manifestSha256 !== prepared.manifest.manifestSha256) {
    throw new Error("mock_manifest_mismatch");
  }
  if (
    parsed.outcomes.length !== prepared.slots.length
    || parsed.outcomes.some((entry, i) => entry.ordinal !== prepared.slots[i].ordinal)
  ) {
    throw new Error("mock_slot_coverage_mismatch");
  }

  type Status = "not_started" | "completed" | "error" | "timeout";
  const slots = prepared.slots.map(slot => ({
    ...slot,
    status: "not_started" as Status,
    startedAtMs: null as number | null,
    latencyMs: null as number | null,
    reservedCostMicrousd: null as number | null,
    settledCostMicrousd: null as number | null,
  }));
  type Reason = "schedule_exhausted" | "run_timeout" | "budget_exhausted"
    | "request_timeout" | "unknown_cost" | "reservation_exceeded";
  let stopReason: Reason = "schedule_exhausted";
  let elapsed = 0;
  let knownCost = 0;
  let held = 0;
  let unknownCost = false;
  const limits = parsed.limits;

  for (let i = 0; i < slots.length; i++) {
    if (elapsed >= limits.runTimeoutMs) {
      stopReason = "run_timeout";
      break;
    }
    const outcome = parsed.outcomes[i];
    if (outcome.reservedCostMicrousd > limits.spendCapMicrousd - knownCost) {
      stopReason = "budget_exhausted";
      break;
    }
    const slot = slots[i];
    slot.startedAtMs = elapsed;
    slot.reservedCostMicrousd = outcome.reservedCostMicrousd;
    held = outcome.reservedCostMicrousd;
    const remaining = limits.runTimeoutMs - elapsed;
    const deadline = Math.min(limits.requestTimeoutMs, remaining);
    if (outcome.durationMs >= deadline) {
      slot.status = "timeout";
      slot.latencyMs = deadline;
      elapsed += deadline;
      unknownCost = true;
      stopReason = remaining <= limits.requestTimeoutMs ? "run_timeout" : "request_timeout";
      break;
    }
    slot.status = outcome.status;
    slot.latencyMs = outcome.durationMs;
    elapsed += outcome.durationMs;
    slot.settledCostMicrousd = outcome.settledCostMicrousd;
    if (outcome.settledCostMicrousd === null) {
      unknownCost = true;
      stopReason = "unknown_cost";
      break;
    }
    knownCost += outcome.settledCostMicrousd;
    held = 0;
    if (outcome.settledCostMicrousd > outcome.reservedCostMicrousd) {
      stopReason = "reservation_exceeded";
      break;
    }
  }

  const completed = slots.filter(slot => slot.status === "completed").length;
  const errors = slots.filter(slot => slot.status === "error").length;
  const timeouts = slots.filter(slot => slot.status === "timeout").length;
  const started = completed + errors + timeouts;
  return {
    schemaVersion: 1 as const,
    kind: "research_mock_report" as const,
    mockOnly: true as const,
    dispatchAllowed: false as const,
    manifest: prepared.manifest,
    scenarioSha256: createHash("sha256").update(JSON.stringify(parsed), "utf8").digest("hex"),
    preflight: prepared.preflight,
    summary: {
      termination: stopReason === "schedule_exhausted" ? "schedule_exhausted" as const : "stopped" as const,
      stopReason,
      plannedSlots: slots.length,
      startedSlots: started,
      notStartedSlots: slots.length - started,
      completedSlots: completed,
      errorSlots: errors,
      timeoutSlots: timeouts,
      virtualElapsedMs: elapsed,
      knownSettledCostMicrousd: knownCost,
      settledCostMicrousd: unknownCost ? null : knownCost,
      heldReservationMicrousd: held,
      remainingBudgetMicrousd: unknownCost ? null : Math.max(0, limits.spendCapMicrousd - knownCost),
      budgetExceeded: knownCost > limits.spendCapMicrousd,
    },
    slots,
  };
}

export type MockRunReport = ReturnType<typeof simulateResearchRun>;
