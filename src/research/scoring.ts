import { createHash } from "node:crypto";
import * as z from "zod/v4";
import { validateDataset, type ResearchDataset } from "./dataset.js";

const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).refine((value) => value === value.trim());
const splitSchema = z.enum(["train", "development", "test"]);
const measurement = z.number().finite().nonnegative().nullable();
const evaluationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  datasetSha256: z.string().length(64).regex(/^[0-9a-f]{64}$/),
  split: splitSchema,
  arms: z.array(identifier).min(1).max(32),
  attemptsPerTask: z.number().int().min(1).max(1000),
  runs: z.array(z.strictObject({
    taskId: identifier,
    arm: identifier,
    attempt: z.number().int().positive(),
    status: z.enum(["completed", "error", "timeout"]),
    latencyMs: measurement,
    costUsd: measurement,
    judgment: z.strictObject({
      graderId: identifier,
      coveredFacts: z.array(z.boolean()),
      contradiction: z.boolean(),
      exactCheckPassed: z.boolean().nullable(),
    }).nullable(),
  })),
});

function requireDataset(input: unknown): ResearchDataset {
  if (!validateDataset(input).valid) throw new Error("invalid_dataset");
  return input as ResearchDataset;
}

function digest(dataset: ResearchDataset): string {
  return createHash("sha256").update(JSON.stringify(dataset), "utf8").digest("hex");
}

export function buildModelInputs(input: unknown, split: string) {
  const dataset = requireDataset(input);
  if (!splitSchema.safeParse(split).success) throw new Error("invalid_split");
  return dataset.records.filter((record) => record.split === split).map((record) => ({
    id: record.id, language: record.language, sourceText: record.source.text, question: record.question,
  }));
}

export function fingerprintDataset(input: unknown): string {
  return digest(requireDataset(input));
}

export function scoreEvaluation(input: unknown, evaluation: unknown) {
  const dataset = requireDataset(input);
  const parsed = evaluationSchema.safeParse(evaluation);
  if (!parsed.success) throw new Error("invalid_evaluation");
  const ledger = parsed.data;
  if (ledger.datasetSha256 !== digest(dataset)) throw new Error("dataset_fingerprint_mismatch");
  if (new Set(ledger.arms).size !== ledger.arms.length) throw new Error("duplicate_arm");
  const tasks = new Map(dataset.records.filter((record) => record.split === ledger.split).map((record) => [record.id, record]));
  if (tasks.size === 0) throw new Error("empty_split");
  const planned = tasks.size * ledger.attemptsPerTask;
  if (!Number.isSafeInteger(planned)) throw new Error("plan_overflow");
  const groups = new Map(ledger.arms.map((arm) => [arm, [] as typeof ledger.runs]));
  const seen = new Set<string>();
  for (const run of ledger.runs) {
    const task = tasks.get(run.taskId);
    const group = groups.get(run.arm);
    if (!task || !group || run.attempt > ledger.attemptsPerTask) throw new Error("out_of_plan");
    const key = JSON.stringify([run.taskId, run.arm, run.attempt]);
    if (seen.has(key)) throw new Error("duplicate_run");
    seen.add(key);
    if (run.judgment !== null) {
      if (run.status !== "completed" || run.judgment.coveredFacts.length !== task.requiredFacts.length ||
        (task.category === "exact") !== (run.judgment.exactCheckPassed !== null)) {
        throw new Error("judgment_shape");
      }
    }
    group.push(run);
  }

  const arms = ledger.arms.map((arm) => {
    const runs = groups.get(arm)!;
    let successes = 0;
    let ungraded = 0;
    let cost = 0;
    let unknownCost = false;
    const latencies: number[] = [];
    for (const run of runs) {
      if (run.costUsd === null) unknownCost = true;
      else cost += run.costUsd;
      if (run.latencyMs !== null) latencies.push(run.latencyMs);
      if (run.status === "completed") {
        if (run.judgment === null) ungraded += 1;
        else if (run.judgment.coveredFacts.every(Boolean) && !run.judgment.contradiction && run.judgment.exactCheckPassed !== false) successes += 1;
      }
    }
    if (!Number.isFinite(cost)) throw new Error("cost_overflow");
    latencies.sort((a, b) => a - b);
    const missing = planned - runs.length;
    const totalCostUsd = unknownCost || missing > 0 ? null : cost;
    return {
      arm, planned, submitted: runs.length, missing, ungraded, successes,
      failures: runs.length - successes - ungraded,
      complete: missing === 0 && ungraded === 0,
      successRate: ungraded > 0 ? null : successes / planned,
      totalCostUsd,
      costPerSuccessUsd: totalCostUsd !== null && successes > 0 && ungraded === 0 ? totalCostUsd / successes : null,
      latencySampleCount: latencies.length,
      medianLatencyMs: latencies.length ? latencies[Math.ceil(latencies.length * 0.5) - 1] : null,
      p95LatencyMs: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
    };
  });
  return { schemaVersion: 1, datasetSha256: ledger.datasetSha256, split: ledger.split, complete: arms.every((arm) => arm.complete), arms };
}
