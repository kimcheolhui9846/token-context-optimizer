import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const childPath = resolve(here, "measure-f21-policy-large-child.mjs");
const sizes = [1, 5, 10].map((mib) => mib * 1024 * 1024);
const sampleCount = 5;
const childTimeoutMs = 20_000;
const cumulativeBudgetMs = 900_000;
const task25Families = ["drop", "semicolon", "php_opener", "tag_space", "trace_spaces_equals", "hyphen", "dot", "blanklines", "bang_letter", "html_comment", "npm_dots_x", "command_prefix"];
const e3Recipes = ["boundary-near-misses", "repeated-valid-start-misses", "internal-gap-miss", "tab-gap-miss", "trailing-gap-miss", "trailing-js-whitespace-miss", "old-label-gap-miss", "internal-gap-hit", "late-label-hit", "hyphen-hit", "hyphen-miss", "no-keyword-text"];
const uriRecipes = ["bare-colon", "colon-space", "colon-nonspace", "double-slash", "rejected-headings-late-valid"];
if (process.argv.length !== 2) throw new Error("This runner takes no arguments");
const timestamp = new Date().toISOString();
const outputPath = resolve(root, `docs/research/evidence/f21/${timestamp.replaceAll(":", "-")}.json`);
if (existsSync(outputPath)) throw new Error(`refusing to overwrite ${outputPath}`);
const sourcePath = resolve(root, "src/core/policy.ts");
const currentBytes = readFileSync(sourcePath);
const baselineBytes = Buffer.from(execFileSync("git", ["show", "6e308c9:src/core/policy.ts"], { cwd: root, windowsHide: true }));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = {
  schema: "f21-policy-large-measurement/v1",
  measuredAt: timestamp,
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
  provenance: {
    currentSource: { path: "src/core/policy.ts", sha256: sha256(currentBytes), gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim() },
    baselineSource: { reconstructedFrom: "git show 6e308c9:src/core/policy.ts", sha256: sha256(baselineBytes), note: "The worktree source was already changed before this worker measured; baseline is reconstructed from the immutable base commit." },
    script: { path: "scripts/measure-f21-policy-large.mjs", sha256: sha256(readFileSync(resolve(here, "measure-f21-policy-large.mjs"))) },
    childScript: { path: "scripts/measure-f21-policy-large-child.mjs", sha256: sha256(readFileSync(childPath)) },
  },
  method: { task25Recipes: task25Families, sizesBytes: sizes, samplesPerCell: sampleCount, childTimeoutMs, cumulativeBudgetMs, windowsHide: true, startupAndTypeScriptCompilationOutsideTimedRegion: true, fixedExpectedBooleans: true, historicalRegexOnLargeInputs: false, noConcurrentTestOrBuild: true },
  task25: [], e3: [], uri: [], failures: [],
};
function run(variant, suite, recipe, size) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [childPath, variant, suite, recipe, String(size), String(sampleCount)], { cwd: root, encoding: "utf8", timeout: childTimeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const elapsedMs = performance.now() - started;
  const records = result.stdout.split(/\r?\n/u).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const record = records.find((item) => item.type === "result") ?? null;
  let status = result.error?.code === "ETIMEDOUT" ? "timeout-censored" : result.status === 0 && record ? "complete" : "error";
  let error = result.error?.message ?? result.stderr.trim();
  const expectedHash = variant === "baseline" ? report.provenance.baselineSource.sha256 : report.provenance.currentSource.sha256;
  if (status === "complete" && record.sourceSha256 !== expectedHash) { status = "source-mismatch"; error = `child source hash ${record.sourceSha256} != ${expectedHash}`; }
  if (status === "complete" && (record.sampleCount !== sampleCount || record.samples?.length !== sampleCount || (suite === "e3" && record.combinedSamples?.length !== sampleCount))) { status = "sample-count-mismatch"; error = `child sample count ${record.sampleCount} != ${sampleCount}`; }
  if (status === "complete" && suite !== "task25") {
    const allSamples = [...record.samples, ...record.combinedSamples];
    if (allSamples.some((sample) => sample.actual !== sample.expected)) { status = "expected-mismatch"; error = "child fixed-boolean assertion mismatch"; }
  }
  const probe = { variant, suite, recipe, size, status, elapsedMs, result: record, ...(status !== "complete" ? { error } : {}) };
  if (status !== "complete") report.failures.push(probe);
  return probe;
}
const phaseStarted = performance.now();
function savePartial() { mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`); }
function add(probe) { report[probe.suite].push(probe); savePartial(); }
for (const variant of ["baseline", "current"]) for (const recipe of task25Families) for (const size of sizes) {
  if (performance.now() - phaseStarted >= cumulativeBudgetMs) { add({ variant, suite: "task25", recipe, size, status: "not-run-budget-exhausted", result: null }); continue; }
  add(run(variant, "task25", recipe, size));
  process.stdout.write(`${variant} task25 ${recipe} ${size}: ${report.task25.at(-1).status}\n`);
}
for (const suiteRecipes of [["e3", e3Recipes], ["uri", uriRecipes]]) for (const recipe of suiteRecipes[1]) for (const size of sizes) for (const variant of ["current"]) {
  if (performance.now() - phaseStarted >= cumulativeBudgetMs) { add({ variant, suite: suiteRecipes[0], recipe, size, status: "not-run-budget-exhausted", result: null }); continue; }
  add(run(variant, suiteRecipes[0], recipe, size));
  process.stdout.write(`${variant} ${suiteRecipes[0]} ${recipe} ${size}: ${report[suiteRecipes[0]].at(-1).status}\n`);
}
const medianMs = (probe) => probe.result.samples.map((sample) => sample.elapsedNs / 1e6).sort((a, b) => a - b)[2];
report.task25Comparison10MiB = task25Families.map((recipe) => {
  const before = report.task25.find((p) => p.recipe === recipe && p.size === sizes[2] && p.variant === "baseline");
  const after = report.task25.find((p) => p.recipe === recipe && p.size === sizes[2] && p.variant === "current");
  if (before.status !== "complete" || after.status !== "complete") return { recipe, status: "NOT RUN" };
  const beforeMs = medianMs(before), afterMs = medianMs(after);
  return { recipe, beforeMs, afterMs, deltaPercent: (afterMs / beforeMs - 1) * 100, status: afterMs <= beforeMs ? "PASS" : "REGRESSION" };
});
report.budget = { elapsedMs: performance.now() - phaseStarted, cumulativeBudgetMs };
report.coverage = Object.fromEntries(["task25", "e3", "uri"].map((suite) => [suite, { expected: report[suite].length, complete: report[suite].filter((p) => p.status === "complete").length, incomplete: report[suite].filter((p) => p.status !== "complete").length }]));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${outputPath}\n`);

if (Object.values(report.coverage).some((suite) => suite.incomplete) || report.task25Comparison10MiB.some((row) => row.status !== "PASS")) process.exitCode = 1;
