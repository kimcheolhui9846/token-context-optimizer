import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildModelInputs, fingerprintDataset, scoreEvaluation } from "../src/research/scoring.js";

function dataset() {
  return JSON.parse(readFileSync("docs/research/datasets/format-demo.json", "utf8"));
}

function run(patch: Record<string, unknown> = {}) {
  return { taskId: "negation-en-1", arm: "baseline", attempt: 1, status: "completed",
    latencyMs: 10, costUsd: 0.01,
    judgment: { graderId: "human-adjudication-demo", coveredFacts: [true], contradiction: false, exactCheckPassed: null },
    ...patch };
}

function evaluation(data = dataset(), runs = [run()]) {
  return { schemaVersion: 1, datasetSha256: fingerprintDataset(data), split: "development", arms: ["baseline"], attemptsPerTask: 1, runs };
}

describe("research scoring", () => {
  it("projects only allowed fields into model inputs", () => {
    const data = dataset();
    data.records[0].answerKey = "private-answer-canary";
    data.records[0].rubric.instructions = "private-rubric-canary";
    data.records[0].requiredFacts = ["private-fact-canary"];
    data.records[0].prohibitedContradictions = ["private-contradiction-canary"];
    data.records[0].acceptableParaphrases = ["private-paraphrase-canary"];
    data.records[0].source.provenance = "private-provenance-canary";
    data.records[0].source.license = "private-license-canary";
    data.records[0].familyId = "private-family-canary";
    const inputs = buildModelInputs(data, "development");
    expect(inputs).toEqual([{ id: "negation-en-1", language: "en", sourceText: "Operators must not delete source excerpts.", question: "What must operators avoid?" }]);
    expect(JSON.stringify(inputs)).not.toContain("private-");
    expect(buildModelInputs(data, "test")).toEqual([]);
  });

  it("rejects invalid datasets and split names at the projection boundary", () => {
    expect(() => buildModelInputs({}, "test")).toThrow();
    expect(() => buildModelInputs(dataset(), "invalid")).toThrow();
  });

  it("rejects a ledger after its dataset answer key changes", () => {
    const data = dataset();
    const ledger = evaluation(data);
    data.records[0].answerKey = "A different adjudication key.";
    expect(() => scoreEvaluation(data, ledger)).toThrow("dataset_fingerprint_mismatch");
  });

  it("counts a fully judged successful run", () => {
    expect(scoreEvaluation(dataset(), evaluation()).arms[0]).toMatchObject({ arm: "baseline", planned: 1, submitted: 1, missing: 0, ungraded: 0,
      successes: 1, failures: 0, complete: true, successRate: 1, totalCostUsd: 0.01, costPerSuccessUsd: 0.01,
      latencySampleCount: 1, medianLatencyMs: 10, p95LatencyMs: 10 });
  });

  it("keeps missing and failed attempts in the planned denominator and all known latencies", () => {
    const ledger = { ...evaluation(dataset(), [run(), run({ attempt: 2, status: "timeout", judgment: null, costUsd: 0.02, latencyMs: 100 })]), attemptsPerTask: 3 };
    expect(scoreEvaluation(dataset(), ledger).arms[0]).toMatchObject({ planned: 3, submitted: 2, missing: 1,
      successes: 1, failures: 1, complete: false, successRate: 1 / 3,
      totalCostUsd: null, costPerSuccessUsd: null, latencySampleCount: 2, p95LatencyMs: 100 });
  });

  it("includes failed calls in cost per success", () => {
    const ledger = { ...evaluation(dataset(), [run(), run({ attempt: 2, status: "error", judgment: null, costUsd: 0.02 })]), attemptsPerTask: 2 };
    expect(scoreEvaluation(dataset(), ledger).arms[0]).toMatchObject({ successRate: 0.5, totalCostUsd: 0.03, costPerSuccessUsd: 0.03 });
  });

  it("does not treat absent judgments or unknown telemetry as zero", () => {
    expect(scoreEvaluation(dataset(), evaluation(dataset(), [run({ judgment: null, costUsd: null, latencyMs: null })])).arms[0]).toMatchObject({ ungraded: 1, complete: false, successRate: null, totalCostUsd: null,
      costPerSuccessUsd: null, latencySampleCount: 0, medianLatencyMs: null, p95LatencyMs: null });
  });

  it.each([
    { coveredFacts: [false], contradiction: false },
    { coveredFacts: [true], contradiction: true },
  ])("fails incomplete or contradictory judgments: %j", (patch) => {
    const judgment = { ...run().judgment, ...patch };
    expect(scoreEvaluation(dataset(), evaluation(dataset(), [run({ judgment })])).arms[0]).toMatchObject({ successes: 0, failures: 1, successRate: 0, costPerSuccessUsd: null });
  });

  it("requires the exact check to pass for exact tasks", () => {
    const data = dataset();
    data.records[0].category = "exact";
    data.records[0].rubric = { kind: "exact", instructions: "Run hidden check separately.", hiddenCheckId: "check-1" };
    for (const passed of [false, true]) {
      const item = run({ judgment: { graderId: "test", coveredFacts: [true], contradiction: false, exactCheckPassed: passed } });
      expect(scoreEvaluation(data, evaluation(data, [item])).arms[0].successes).toBe(passed ? 1 : 0);
    }
    expect(() => scoreEvaluation(data, evaluation(data))).toThrow("judgment_shape");
  });

  it.each([{ taskId: "not-in-dataset" }, { arm: "not-declared" }, { attempt: 2 }])("rejects out-of-plan runs: %j", (patch) => {
    expect(() => scoreEvaluation(dataset(), evaluation(dataset(), [run(patch)]))).toThrow("out_of_plan");
  });

  it("rejects duplicate runs instead of overwriting a failure", () => {
    expect(() => scoreEvaluation(dataset(), evaluation(dataset(), [run({ status: "error", judgment: null }), run()]))).toThrow("duplicate_run");
  });

  it("rejects an existing task from another split", () => {
    const data = dataset();
    const text = "The test partition has a separate source.";
    data.records.push({ ...data.records[0], id: "test-only-task", familyId: "test-only-family", split: "test",
      source: { ...data.records[0].source, text, sha256: createHash("sha256").update(text).digest("hex") } });
    const ledger = evaluation(data, [run({ taskId: "test-only-task" })]);
    expect(() => scoreEvaluation(data, ledger)).toThrow("out_of_plan");
  });

  it.each([{ arms: ["baseline", "baseline"] }, { attemptsPerTask: 0 }, { split: "test" }])("rejects invalid or empty evaluation plans: %j", (patch) => {
    expect(() => scoreEvaluation(dataset(), { ...evaluation(), ...patch })).toThrow();
  });

  it.each([
    { costUsd: -1 }, { latencyMs: Infinity }, { status: "success" },
    { status: "error" }, { judgment: { graderId: "test", coveredFacts: [], contradiction: false, exactCheckPassed: null } },
  ])("rejects invalid measurements or judgments: %j", (patch) => {
    expect(() => scoreEvaluation(dataset(), evaluation(dataset(), [run(patch)]))).toThrow();
  });

  it("reports each declared arm including arms without submissions", () => {
    expect(scoreEvaluation(dataset(), { ...evaluation(), arms: ["baseline", "optimizer"] }).arms[1]).toMatchObject({ arm: "optimizer", planned: 1, submitted: 0,
      missing: 1, complete: false, successRate: 0, totalCostUsd: null });
  });

  it("uses a two-task two-arm two-attempt plan without dropping empty slots", () => {
    const data = dataset();
    data.records.push({ ...data.records[0], id: "task-2" });
    const ledger = { ...evaluation(data, [run(), run({ taskId: "task-2", arm: "optimizer", status: "error", judgment: null })]),
      arms: ["baseline", "optimizer"], attemptsPerTask: 2 };
    const report = scoreEvaluation(data, ledger);
    expect(report.arms.map((arm) => [arm.planned, arm.submitted, arm.missing, arm.successRate])).toEqual([[4, 1, 3, 0.25], [4, 1, 3, 0]]);
  });

  it("does not publish cost per success while some outcomes are ungraded", () => {
    const ledger = { ...evaluation(dataset(), [run(), run({ attempt: 2, judgment: null })]), attemptsPerTask: 2 };
    expect(scoreEvaluation(dataset(), ledger).arms[0]).toMatchObject({ totalCostUsd: 0.02, costPerSuccessUsd: null, successRate: null, latencySampleCount: 2 });
  });

  it("rejects nonfinite total cost even when individual costs are finite", () => {
    const ledger = { ...evaluation(dataset(), [run({ costUsd: 1e308 }), run({ attempt: 2, costUsd: 1e308 })]), attemptsPerTask: 2 };
    expect(() => scoreEvaluation(dataset(), ledger)).toThrow("cost_overflow");
  });
});

describe("research scoring CLI", () => {
  let root: string;
  let cli: string;
  const exec = promisify(execFile);
  beforeAll(async () => {
    await mkdir(resolve(".artifacts"), { recursive: true });
    root = await mkdtemp(join(resolve(".artifacts"), "scoring-test-"));
    await mkdir(join(root, "scripts"));
    cli = join(root, "scripts", "score-research.mjs");
    await copyFile(resolve("scripts/score-research.mjs"), cli);
    await copyFile(resolve("scripts/plugin-runtime.mjs"), join(root, "scripts", "plugin-runtime.mjs"));
    await exec(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "-p", resolve("tsconfig.json"), "--outDir", join(root, "dist")]);
  });
  afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
  async function invoke(args: string[]) {
    try {
      return { ...(await exec(process.execPath, [cli, ...args])), code: 0 };
    } catch (error) {
      const result = error as { stdout: string; stderr: string; code: number };
      return { stdout: result.stdout, stderr: result.stderr, code: result.code };
    }
  }

  it("scores the synthetic example with the real compiled entrypoint", async () => {
    const result = await invoke([resolve("docs/research/datasets/format-demo.json"), resolve("docs/research/datasets/scoring-demo.json")]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, report: { complete: true, arms: [{ successRate: 1 }] } });
    expect(result.stderr).toBe("");
  });

  it("returns a valid incomplete report for an empty ledger", async () => {
    const path = join(root, "empty.json");
    await writeFile(path, JSON.stringify(evaluation(dataset(), [])));
    const result = await invoke([resolve("docs/research/datasets/format-demo.json"), path]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, report: { complete: false, arms: [{ missing: 1, successRate: 0 }] } });
  });

  it.each(["malformed", "duplicate", "stale"])("rejects %s ledgers without exposing input", async (kind) => {
    const path = join(root, "private-path-canary.json");
    const ledger = evaluation();
    let text = '{"private-value-canary":';
    if (kind === "duplicate") text = JSON.stringify(ledger).replace('"split":"development"', '"split":"private-value-canary","split":"development"');
    if (kind === "stale") text = JSON.stringify({ ...ledger, datasetSha256: "0".repeat(64) });
    await writeFile(path, text);
    const result = await invoke([resolve("docs/research/datasets/format-demo.json"), path]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, code: "invalid_input" });
    expect(result.stdout + result.stderr).not.toMatch(/private-path-canary|private-value-canary/);
  });

  it("handles unreadable files without leaking paths", async () => {
    const result = await invoke(["private-missing-file", "private-missing-ledger"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, code: "invalid_input" });
    expect(result.stdout + result.stderr).not.toContain("private-");
  });

  it.each([[], ["one"], ["one", "two", "three"]])("rejects wrong argument counts: %j", async (...args: string[]) => {
    const result = await invoke(args);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, code: "usage" });
  });
});
