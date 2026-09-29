import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

// This helper intentionally imports the build generated from committed source. Run `npm run build`
// before invoking it so the evidence is tied to the source commit being measured.
const { fingerprintDataset } = await import(
  new URL("../../../../dist/src/research/scoring.js", import.meta.url)
);
const { analyzePairedSuccess } = await import(
  new URL("../../../../dist/src/research/paired-success.js", import.meta.url)
);

const statusResult = spawnSync("git", [
  "status", "--porcelain", "--",
  "src/research",
  "docs/research/evidence/task-18/measure-paired-success.mjs",
], { cwd: repoRoot, shell: false, encoding: "utf8" });
if (statusResult.status !== 0) throw new Error("git_status_lookup_failed");
if (statusResult.stdout.trim() !== "") throw new Error("dirty_timing_inputs");

const categories = ["numeric", "negation", "actor_action", "causal", "temporal", "exact"];
const familyCount = 24;
const attemptsPerTask = 3;
const arms = ["full_source", "optimized"];

function sha256Bytes(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function makeDataset() {
  const records = [];
  for (let familyIndex = 0; familyIndex < familyCount; familyIndex += 1) {
    const category = categories[familyIndex % categories.length];
    const familyId = `timing-${category}-${String(familyIndex).padStart(2, "0")}`;
    for (const language of ["en", "ko"]) {
      const text = `Timing fixture ${category} family ${familyIndex} ${language}.`;
      records.push({
        id: `${familyId}-${language}`,
        familyId,
        split: "development",
        language,
        category,
        source: {
          text,
          sha256: sha256Bytes(text),
          provenance: "Deterministic synthetic timing fixture",
          license: "CC0-1.0",
        },
        question: "What is stated?",
        answerKey: text,
        requiredFacts: [text],
        prohibitedContradictions: ["The opposite."],
        acceptableParaphrases: [],
        rubric: category === "exact"
          ? { kind: "exact", instructions: "Check the exact synthetic fact.", hiddenCheckId: `timing-${category}` }
          : { kind: "semantic", instructions: "Check the synthetic fact." },
      });
    }
  }
  return { schemaVersion: 1, datasetId: "paired-success-timing-v1", records };
}

function makeLedger(dataset) {
  const runs = dataset.records.flatMap((record) => arms.flatMap((arm) =>
    Array.from({ length: attemptsPerTask }, (_, index) => ({
      taskId: record.id,
      arm,
      attempt: index + 1,
      status: "completed",
      latencyMs: null,
      costUsd: null,
      judgment: {
        graderId: "synthetic-timing",
        coveredFacts: [true],
        contradiction: false,
        exactCheckPassed: record.category === "exact" ? true : null,
      },
    }))
  ));
  return {
    schemaVersion: 1,
    datasetSha256: fingerprintDataset(dataset),
    split: "development",
    arms,
    attemptsPerTask,
    runs,
  };
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(percentile * sorted.length);
  return sorted[rank - 1];
}

const dataset = makeDataset();
const ledger = makeLedger(dataset);
if (new Set(dataset.records.map((record) => record.familyId)).size !== familyCount ||
    dataset.records.length !== 48 || ledger.runs.length !== 288) {
  throw new Error("timing_fixture_shape");
}

const datasetBytes = JSON.stringify(dataset);
const ledgerBytes = JSON.stringify(ledger);
const beforeBytes = JSON.stringify({ dataset, ledger });
const beforeInputSha256 = sha256Bytes(beforeBytes);

for (let warmup = 0; warmup < 5; warmup += 1) analyzePairedSuccess(dataset, ledger);
const samplesMs = [];
for (let sample = 0; sample < 20; sample += 1) {
  const started = performance.now();
  const report = analyzePairedSuccess(dataset, ledger);
  samplesMs.push(performance.now() - started);
  if (report.coverage.familyCount !== familyCount || report.coverage.planned !== 288 ||
      report.coverage.submitted !== 288 || !report.coverage.complete) {
    throw new Error("timing_report_incomplete");
  }
}

const afterInputSha256 = sha256Bytes(JSON.stringify({ dataset, ledger }));
if (beforeInputSha256 !== afterInputSha256) throw new Error("timing_input_mutated");

const commitResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  shell: false,
  encoding: "utf8",
});
if (commitResult.status !== 0) throw new Error("git_commit_lookup_failed");
const commit = commitResult.stdout.trim();
const cpu = os.cpus()[0];
const report = {
  kind: "local_paired_success_timing",
  scope: "Synthetic complete analyzer call; excludes build, file I/O, CLI startup and model execution",
  generatedAt: new Date().toISOString(),
  codeCommit: commit,
  nodeVersion: process.version,
  platform: process.platform,
  osRelease: os.release(),
  architecture: process.arch,
  cpuModel: cpu?.model ?? "unknown",
  datasetSha256: sha256Bytes(datasetBytes),
  ledgerSha256: sha256Bytes(ledgerBytes),
  fixtureRecipe: "24 bilingual development families; four per category; all 2 arms x 3 attempts completed; exact rubrics pass",
  seed: "none (deterministic construction)",
  familyCount,
  recordCount: dataset.records.length,
  slotCount: ledger.runs.length,
  warmupCount: 5,
  sampleCount: samplesMs.length,
  percentileMethod: "nearest-rank (ceil(p*n)-1 zero-based index)",
  samplesMs,
  medianMs: nearestRank(samplesMs, 0.5),
  p95Ms: nearestRank(samplesMs, 0.95),
  inputSnapshotSha256Before: beforeInputSha256,
  inputSnapshotSha256After: afterInputSha256,
};
process.stdout.write(`${JSON.stringify(report)}\n`);
