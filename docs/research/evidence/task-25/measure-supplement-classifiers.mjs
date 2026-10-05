import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const [sourceRelative = "tests/helpers/policy-baseline.ts", outputName = "baseline-supplement-classifiers.json", ...families] =
  process.argv.slice(2);
if (families.length === 0) {
  throw new Error("usage: measure-supplement-classifiers.mjs <source> <output> <family...>");
}

const sizes = [10_000, 20_000, 40_000];
const timeoutMs = 20_000;
const cumulativeBudgetMs = 180_000;
const sourcePath = resolve(root, sourceRelative);
const outputPath = resolve(here, outputName);
const report = {
  kind: "baseline-supplement-classifiers",
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
  source: {
    path: sourceRelative,
    sha256: createHash("sha256").update(readFileSync(sourcePath)).digest("hex"),
  },
  method: {
    reason: "supplement classifier cells that baseline.json marked not-run-budget-exhausted",
    sizesUtf16CodeUnits: sizes,
    rawTimedSamplesPerProbe: 5,
    childTimeoutMs: timeoutMs,
    cumulativeBudgetMs,
    timeoutIsCensored: true,
  },
  groups: [],
  budget: { elapsedMs: 0, exhausted: false },
};

let cumulativeMs = 0;
const started = performance.now();

function writePartial() {
  report.budget.elapsedMs = Math.round(cumulativeMs);
  report.budget.exhausted = cumulativeMs >= cumulativeBudgetMs;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

function median(values) {
  return values.length ? values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
}

function runClassifier(family, size) {
  const remaining = cumulativeBudgetMs - cumulativeMs;
  if (remaining < 1) return { status: "not-run-budget-exhausted" };
  const childTimeoutMs = Math.floor(Math.min(timeoutMs, remaining));
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [
    resolve(here, "measure-child.mjs"),
    "classifier",
    family,
    String(size),
    sourceRelative,
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: childTimeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const wallMs = performance.now() - startedAt;
  cumulativeMs += wallMs;
  if (result.error?.code === "ETIMEDOUT") return { status: "timeout-censored", wallMs, partialStdout: result.stdout };
  if (result.status !== 0) return { status: "error", wallMs, error: result.error?.message ?? result.stderr.trim(), partialStdout: result.stdout };
  const value = JSON.parse(result.stdout);
  return { status: "complete", wallMs, value, medianElapsedNs: median(value.samples.map((sample) => sample.elapsedNs)) };
}

for (const family of families) {
  const group = { family, sizes: [] };
  report.groups.push(group);
  for (const size of sizes) {
    const classifier = runClassifier(family, size);
    group.sizes.push({ size, classifier });
    writePartial();
    process.stdout.write(`${family} ${size}: classifier=${classifier.status}; cumulative=${Math.round(cumulativeMs)}ms\n`);
  }
}

report.budget.elapsedMs = Math.round(Math.max(cumulativeMs, performance.now() - started));
report.budget.exhausted ||= cumulativeMs >= cumulativeBudgetMs;
report.coverage = {
  status: report.groups.every((group) => group.sizes.every((entry) => entry.classifier.status !== "not-run-budget-exhausted"))
    ? "complete-or-censored"
    : "partial-budget-censored",
  unmeasured: report.groups.flatMap((group) =>
    group.sizes
      .filter((entry) => entry.classifier.status === "not-run-budget-exhausted")
      .map((entry) => `${group.family}/${entry.size}/classifier:${entry.classifier.status}`),
  ),
};
writePartial();
process.stdout.write(`${outputPath}\n`);
