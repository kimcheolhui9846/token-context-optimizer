import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildModelInputs, fingerprintDataset, scoreEvaluation } from "../src/research/scoring.js";
import { evaluateCore } from "../src/research/evaluation-core.js";

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
  it("returns a detached evaluation core with the exact scorer report", () => {
    const data = dataset();
    const ledger = evaluation(data);
    const core = evaluateCore(data, ledger);
    expect(core.report).toEqual(scoreEvaluation(data, ledger));
    expect(core.dataset).not.toBe(data);
    expect(core.ledger).not.toBe(ledger);
    expect(core.ledger.runs[0]).not.toBe(ledger.runs[0]);
    ledger.runs[0].judgment!.coveredFacts[0] = false;
    expect(core.ledger.runs[0].judgment!.coveredFacts).toEqual([true]);
  });

  it("pins full scorer serialization including arm and key order", () => {
    const data = dataset();
    const ledger = { ...evaluation(data), arms: ["baseline", "empty"] };
    expect(JSON.stringify(scoreEvaluation(data, ledger))).toBe(JSON.stringify({
      schemaVersion: 1, datasetSha256: fingerprintDataset(data), split: "development", complete: false, arms: [
        { arm: "baseline", planned: 1, submitted: 1, missing: 0, ungraded: 0, successes: 1, failures: 0, complete: true,
          successRate: 1, totalCostUsd: 0.01, costPerSuccessUsd: 0.01, latencySampleCount: 1, medianLatencyMs: 10, p95LatencyMs: 10 },
        { arm: "empty", planned: 1, submitted: 0, missing: 1, ungraded: 0, successes: 0, failures: 0, complete: false,
          successRate: 0, totalCostUsd: null, costPerSuccessUsd: null, latencySampleCount: 0, medianLatencyMs: null, p95LatencyMs: null },
      ],
    }));
  });

  it("keeps run validation ahead of cost aggregation", () => {
    const data = dataset();
    const ledger = { ...evaluation(data, [run({ costUsd: 1e308 }), run({ attempt: 2, costUsd: 1e308 }), run({ taskId: "unknown", attempt: 3 })]), attemptsPerTask: 3 };
    expect(() => scoreEvaluation(data, ledger)).toThrow(/^out_of_plan$/);
  });

  it("preserves floating point cost accumulation order", () => {
    const data = dataset();
    const ledger = { ...evaluation(data, [run({ costUsd: 1e16 }), run({ attempt: 2, costUsd: 1 }), run({ attempt: 3, costUsd: 1 })]), attemptsPerTask: 3 };
    expect(scoreEvaluation(data, ledger).arms[0].totalCostUsd).toBe(1e16);
    ledger.runs.reverse();
    expect(scoreEvaluation(data, ledger).arms[0].totalCostUsd).toBe(10000000000000002);
  });

  it("pins nullable telemetry, ungraded outcomes, and nearest-rank latency", () => {
    const data = dataset();
    const ledger = { ...evaluation(data, [
      run({ latencyMs: 30, costUsd: 0.01 }),
      run({ attempt: 2, status: "error", judgment: null, latencyMs: 10, costUsd: 0.02 }),
      run({ attempt: 3, judgment: null, latencyMs: 20, costUsd: null }),
    ]), attemptsPerTask: 3 };
    expect(JSON.stringify(scoreEvaluation(data, ledger))).toBe(JSON.stringify({
      schemaVersion: 1, datasetSha256: fingerprintDataset(data), split: "development", complete: false, arms: [{
        arm: "baseline", planned: 3, submitted: 3, missing: 0, ungraded: 1, successes: 1, failures: 1, complete: false,
        successRate: null, totalCostUsd: null, costPerSuccessUsd: null, latencySampleCount: 3, medianLatencyMs: 20, p95LatencyMs: 30,
      }],
    }));
  });

  it.each([
    ["invalid dataset precedes malformed ledger", () => scoreEvaluation({}, {}), "invalid_dataset"],
    ["malformed ledger precedes stale hash", () => scoreEvaluation(dataSet(), { datasetSha256: "0".repeat(64) }), "invalid_evaluation"],
    ["stale hash precedes duplicate arms", () => scoreEvaluation(dataSet(), { ...evaluation(), datasetSha256: "0".repeat(64), arms: ["baseline", "baseline"] }), "dataset_fingerprint_mismatch"],
    ["duplicate arms precede empty split", () => scoreEvaluation(dataSet(), { ...evaluation(), split: "train", arms: ["baseline", "baseline"] }), "duplicate_arm"],
    ["judgment shape precedes later out-of-plan run", () => scoreEvaluation(dataSet(), { ...evaluation(dataSet(), [run({ judgment: { ...run().judgment!, coveredFacts: [] } }), run({ attempt: 2, taskId: "unknown" })]), attemptsPerTask: 1 }), "judgment_shape"],
    ["duplicate run precedes duplicate judgment shape", () => scoreEvaluation(dataSet(), { ...evaluation(dataSet(), [run(), run({ judgment: { ...run().judgment!, coveredFacts: [] } })]), attemptsPerTask: 2 }), "duplicate_run"],
  ])("preserves validation precedence: %s", (_name, invoke, expected) => {
    expect(invoke).toThrow(expected);
  });

  function dataSet() { return dataset(); }

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
    expect(() => buildModelInputs({}, "test")).toThrow(/^invalid_dataset$/);
    expect(() => buildModelInputs(dataset(), "invalid")).toThrow(/^invalid_split$/);
  });

  it("rejects a ledger after its dataset answer key changes", () => {
    const data = dataset();
    const ledger = evaluation(data);
    data.records[0].answerKey = "A different adjudication key.";
    expect(() => scoreEvaluation(data, ledger)).toThrow("dataset_fingerprint_mismatch");
  });

  it("ignores serialization hooks when binding the full dataset", () => {
    const data = dataset();
    Object.defineProperty(data, "toJSON", { value: () => ({ fixed: true }) });
    const ledger = evaluation(data);
    data.records[0].answerKey = "changed-secret-answer";
    expect(fingerprintDataset(data)).not.toBe(ledger.datasetSha256);
    expect(() => scoreEvaluation(data, ledger)).toThrow("dataset_fingerprint_mismatch");
  });

  it("fingerprints validated content independently of object property insertion order", () => {
    const data = dataset();
    const reordered = { records: data.records, datasetId: data.datasetId, schemaVersion: data.schemaVersion };
    expect(fingerprintDataset(reordered)).toBe(fingerprintDataset(data));
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

  it.each([
    [{ arms: ["baseline", "baseline"] }, "duplicate_arm"],
    [{ attemptsPerTask: 0 }, "invalid_evaluation"],
    [{ split: "test" }, "empty_split"],
  ])("rejects invalid or empty evaluation plans: %j", (patch, expected) => {
    expect(() => scoreEvaluation(dataset(), { ...evaluation(), ...patch })).toThrow(new RegExp(`^${expected}$`));
  });

  it.each([
    [{ costUsd: -1 }, "invalid_evaluation"],
    [{ latencyMs: Infinity }, "invalid_evaluation"],
    [{ status: "success" }, "invalid_evaluation"],
    [{ status: "error" }, "judgment_shape"],
    [{ judgment: { graderId: "test", coveredFacts: [], contradiction: false, exactCheckPassed: null } }, "judgment_shape"],
  ])("rejects invalid measurements or judgments: %j", (patch, expected) => {
    expect(() => scoreEvaluation(dataset(), evaluation(dataset(), [run(patch)]))).toThrow(new RegExp(`^${expected}$`));
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
