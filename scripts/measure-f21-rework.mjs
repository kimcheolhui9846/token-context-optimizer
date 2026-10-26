import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const childPath = resolve(root, "scripts/measure-f21-rework-child.mjs");
const immutableRecipePath = resolve(root, "docs/research/evidence/task-25/measure-large-child.mjs");
const mode = process.argv[2];
if (!new Set(["gate", "record"]).has(mode) || process.argv.length !== 3) throw new Error("usage: node scripts/measure-f21-rework.mjs <gate|record>");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const timestamp = new Date().toISOString();
const evidenceDir = resolve(root, "docs/research/evidence/f21");
mkdirSync(evidenceDir, { recursive: true });
const outputPath = resolve(evidenceDir, `f21-rework-${mode}-${timestamp.replaceAll(":", "-")}.json`);
if (existsSync(outputPath)) throw new Error(`refusing to overwrite existing evidence: ${outputPath}`);
const currentSource = readFileSync(resolve(root, "src/core/policy.ts"));
const baselineSource = Buffer.from(execFileSync("git", ["show", "6e308c9:src/core/policy.ts"], { cwd: root, windowsHide: true }));
const scriptBytes = readFileSync(fileURLToPath(import.meta.url));
const childBytes = readFileSync(childPath);
const recipeBytes = readFileSync(immutableRecipePath);
const limits = mode === "gate" ? { childTimeoutMs: 180_000, overallTimeoutMs: 1_800_000 } : { childTimeoutMs: 20_000, overallTimeoutMs: null };
const task25Recipes = ["drop", "semicolon", "php_opener", "tag_space", "trace_spaces_equals", "hyphen", "dot", "blanklines", "bang_letter", "html_comment", "npm_dots_x", "command_prefix"];
const immutableRecipeText = recipeBytes.toString("utf8");
if (!task25Recipes.every((name) => immutableRecipeText.includes(`"${name}"`))) throw new Error("immutable Task 25 helper is missing a required recipe");
const e3Recipes = ["boundary-near-misses", "repeated-valid-start-misses", "internal-gap-miss", "tab-gap-miss", "trailing-gap-miss", "trailing-js-whitespace-miss", "old-label-gap-miss", "internal-gap-hit", "late-label-hit", "hyphen-hit", "hyphen-miss", "no-keyword-text", "dense-a-hyphen", "dense-pass-space", "dense-secret-space", "dense-private-space"];
const uriRecipes = ["bare-colon", "colon-space", "colon-nonspace", "double-slash", "rejected-headings-late-valid"];
const sizes = mode === "gate" ? [10 * 1024 * 1024] : [1 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024];
const overallStarted = performance.now();
const report = {
  schema: "f21-rework-measurement/v1", mode, measuredAt: timestamp,
  limits, rationale: "posthoc change approved 2026-10-25",
  environment: { node: process.version, v8: process.versions.v8, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? null },
  source: { baseline: { git: "6e308c9", sha256: sha256(baselineSource) }, current: { path: "src/core/policy.ts", sha256: sha256(currentSource), gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim() } },
  runner: { path: "scripts/measure-f21-rework.mjs", sha256: sha256(scriptBytes), childPath: "scripts/measure-f21-rework-child.mjs", childSha256: sha256(childBytes), immutableTask25RecipePath: "docs/research/evidence/task-25/measure-large-child.mjs", immutableTask25RecipeSha256: sha256(recipeBytes) },
  method: mode === "gate" ? { task25Recipes, sizeBytes: sizes, samplesPerCell: 9, warmupPerVariant: 1, orders: ["baseline,bcopy,current", "current,bcopy,baseline"], rationale: "dot3.4s*3*10~100s+margin", timing: "classifier operation only; compile/input construction excluded" } : { task25Recipes, e3Recipes, uriRecipes, sizesBytes: sizes, samplesPerCell: 5, warmupPerVariant: 1, regexAloneSizesBytes: [10, 40, 100].map((mib) => mib * 1024 * 1024), timing: "target operation only; child startup/compile/input construction excluded" },
  results: [], failures: [], status: "INCOMPLETE",
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
const save = () => writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const progress = (value) => process.stderr.write(`${JSON.stringify({ type: "progress", ...value })}\n`);
function parseChild(variant, recipe, size, sampleCount, suite = mode) {
  const started = performance.now();
  const child = spawnSync(process.execPath, [childPath, suite, variant, recipe, String(size), String(sampleCount)], { cwd: root, encoding: "utf8", timeout: limits.childTimeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const elapsedMs = performance.now() - started;
  const records = (child.stdout ?? "").split(/\r?\n/u).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const result = records.find((item) => item.type === "result") ?? null;
  const partialSamples = records.filter((item) => item.type === "sample");
  const base = { variant, recipe, size, elapsedMs, exitCode: child.status, signal: child.signal, timeout: child.error?.code === "ETIMEDOUT" };
  if (base.timeout) return { ...base, status: "timeout", partial: result };
  if (child.error || child.status !== 0 || !result) {
    const error = child.error?.message ?? (child.stderr ?? "").trim().slice(0, 2000);
    const status = /RangeError/u.test(error) ? "range-error" : /expected mismatch/u.test(error) ? "expected-mismatch" : "incomplete";
    return { ...base, status, error, partial: result, partialSamples };
  }
  if (result.sourceSha256 !== report.source[variant === "current" ? "current" : "baseline"].sha256 || result.sampleCount !== sampleCount || result.samples?.length !== sampleCount || (suite === "record" && e3Recipes.includes(recipe) && result.combinedSamples?.length !== sampleCount)) return { ...base, status: "source-or-sample-mismatch", result, partialSamples };
  return { ...base, status: "complete", result };
}
function add(row, suite = mode) { report.results.push({ suite, ...row }); if (row.status !== "complete") report.failures.push({ suite, ...row }); save(); progress({ suite, variant: row.variant, recipe: row.recipe, size: row.size, status: row.status }); }
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; }
function outputsEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

if (mode === "gate") {
  let gateIncomplete = false;
  for (const recipe of task25Recipes) {
    const remainingMs = limits.overallTimeoutMs - (performance.now() - overallStarted);
    if (remainingMs <= 0) { gateIncomplete = true; report.results.push({ suite: "gate", recipe, size: sizes[0], status: "not-run-budget" }); save(); continue; }
    const child = spawnSync(process.execPath, [childPath, "gate", "all", recipe, String(sizes[0]), "9"], { cwd: root, encoding: "utf8", timeout: Math.min(limits.childTimeoutMs, remainingMs), maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const records = (child.stdout ?? "").split(/\r?\n/u).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    const result = records.find((item) => item.type === "result") ?? null;
    const partialSamples = records.filter((item) => item.type === "sample");
    if (child.error?.code === "ETIMEDOUT" || child.status !== 0 || !result) { gateIncomplete = true; report.results.push({ suite: "gate", recipe, size: sizes[0], status: child.error?.code === "ETIMEDOUT" ? "timeout-not-run" : "incomplete", partial: result, partialSamples }); save(); continue; }
    const expectedHashes = { baseline: report.source.baseline.sha256, bcopy: report.source.baseline.sha256, current: report.source.current.sha256 };
    const hashesMatch = Object.entries(expectedHashes).every(([key, value]) => result.sourceSha256?.[key] === value);
    if (!hashesMatch || result.sampleCount !== 9 || result.samples?.length !== 27) { gateIncomplete = true; report.results.push({ suite: "gate", recipe, size: sizes[0], status: "incomplete", result }); save(); continue; }
    const samplesByVariant = Object.fromEntries(["baseline", "bcopy", "current"].map((key) => [key, result.samples.filter((sample) => sample.variant === key)]));
    const b = median(samplesByVariant.baseline.map((sample) => sample.elapsedNs));
    const bc = median(samplesByVariant.bcopy.map((sample) => sample.elapsedNs));
    const c = median(samplesByVariant.current.map((sample) => sample.elapsedNs));
    const allOutputsEqual = result.samples.every((sample) => outputsEqual(sample.output, samplesByVariant.baseline.find((base) => base.index === sample.index)?.output));
    report.results.push({ suite: "gate-summary", recipe, size: sizes[0], baselineMedianNs: b, bcopyMedianNs: bc, currentMedianNs: c, aaRatio: bc / b, currentRatio: c / b, allOutputsEqual });
    save();
  }
  const summaries = report.results.filter((row) => row.suite === "gate-summary");
  const invalid = summaries.some((row) => row.aaRatio < 0.97 || row.aaRatio > 1.03);
  const mismatch = summaries.some((row) => !row.allOutputsEqual);
  report.status = gateIncomplete || summaries.length !== task25Recipes.length ? "INCOMPLETE" : invalid ? "INVALID" : mismatch || summaries.some((row) => row.currentRatio > 1.03) ? "FAIL" : "PASS";
  report.exitCodeMeaning = { "0": "PASS", "2": "FAIL", "3": "INVALID or incomplete" };
} else {
  for (const variant of ["baseline", "current"]) for (const recipe of task25Recipes) for (const size of [1, 5].map((mib) => mib * 1024 * 1024)) add(parseChild(variant, recipe, size, 5, "record"), "task25");
  for (const recipe of e3Recipes) for (const size of sizes) add(parseChild("current", recipe, size, 5, "record"), "e3");
  for (const recipe of uriRecipes) for (const size of sizes) add(parseChild("current", recipe, size, 5, "record"), "uri");
  for (const recipe of ["space-tail", "tab-tail", "vertical-tab-tail"]) for (const size of [10, 40, 100].map((mib) => mib * 1024 * 1024)) add(parseChild("current", recipe, size, 5, "record"), "regex-alone");
  const incomplete = report.failures.some((row) => row.status === "incomplete" || row.status === "source-or-sample-mismatch");
  const measurementFailure = report.failures.some((row) => ["timeout", "range-error", "expected-mismatch"].includes(row.status));
  report.status = incomplete ? "INCOMPLETE" : measurementFailure ? "FAIL" : "PASS";
  report.exitCodeMeaning = { "0": "PASS", "2": "FAIL", "3": "INCOMPLETE/setup error" };
}
report.finishedAt = new Date().toISOString();
save();
process.stdout.write(`${JSON.stringify({ file: outputPath, status: report.status, failures: report.failures.length })}\n`);
process.exitCode = report.status === "PASS" ? 0 : report.status === "FAIL" ? 2 : 3;
