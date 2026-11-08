#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const BASE = "f6a9c825376d2daf72c63a3822cc839247cc73f3";
const ESTIMATOR = "src/core/token-estimator.ts";
const OLD_REGEX = String.raw`/[\u3131-\uD79D]/u`;
const NEW_REGEX = String.raw`/[\u3040-\u30FF\u3131-\uD7A3]/u`;
const OLD_LENGTH = "Math.max(text.length - cjkChars, 0)";
const NEW_LENGTH = "Math.max([...text].length - cjkChars, 0)";
const variants = [
  { id: "baseline", patch: null },
  { id: "d1a-only", patch: "d1a" },
  { id: "d2b-only", patch: "d2b" },
  { id: "combined-a-cp", patch: "combined" },
];

function args() {
  const out = { scratchRoot: null, output: null, repo: null };
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    if (key === "--scratch-root") out.scratchRoot = resolve(process.argv[++i]);
    else if (key === "--output") out.output = resolve(process.argv[++i]);
    else if (key === "--repo") out.repo = resolve(process.argv[++i]);
    else throw new Error(`unknown argument: ${key}`);
  }
  return out;
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function gitBlobSha1(bytes) { return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"); }
function git(repo, gitArgs, options = {}) {
  return execFileSync("git", ["-c", "core.autocrlf=false", ...gitArgs], {
    cwd: repo, encoding: "utf8", windowsHide: true, timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...options,
  }).trim();
}
function psQuote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function run(repo, command, commandArgs, timeout = 900_000) {
  const windows = process.platform === "win32";
  const executable = windows ? "powershell.exe" : command;
  const args = windows ? ["-NoProfile", "-NonInteractive", "-Command", `& ${psQuote(command)} ${commandArgs.map(psQuote).join(" ")}; exit $LASTEXITCODE`] : commandArgs;
  const result = spawnSync(executable, args, {
    cwd: repo, encoding: "utf8", windowsHide: true, timeout,
    maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  return { command: [command, ...commandArgs].join(" "), exitCode: result.status, timedOut: Boolean(result.error), error: result.error?.message ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
function sanitized(text, repo) {
  return text.replaceAll(repo, "<copy>").replaceAll(/([A-Za-z]:[\\/][^\s\r\n]*)/g, "<path>");
}
function scratchRef(scratch, path) { return `<scratch>/${relative(scratch, path).replaceAll("\\", "/")}`; }
function jsonFromOutput(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(stdout.slice(start, end + 1)); } catch { return null; }
}

async function trackedManifest(repo) {
  const lines = git(repo, ["ls-tree", "-r", "-z", "--full-tree", BASE]);
  const entries = [];
  for (const item of lines.split("\0")) {
    if (!item) continue;
    const tab = item.indexOf("\t");
    const [mode, type, oid] = item.slice(0, tab).split(" ");
    entries.push({ mode, type, oid, path: item.slice(tab + 1) });
  }
  return entries;
}
async function verifyTracked(repo, root, manifest) {
  const mismatches = [];
  for (const entry of manifest) {
    const path = join(root, entry.path);
    if (!existsSync(path)) { mismatches.push({ path: entry.path, reason: "missing" }); continue; }
    const bytes = await readFile(path);
    const actual = gitBlobSha1(bytes);
    if (actual !== entry.oid) mismatches.push({ path: entry.path, expected: entry.oid, actual });
  }
  return { trackedFileCount: manifest.length, mismatchCount: mismatches.length, mismatches };
}

async function materialize(repo, scratch, id, manifest) {
  await mkdir(scratch, { recursive: true });
  const copy = await mkdtemp(join(scratch, `${id}-`));
  execFileSync("git", ["-c", "core.autocrlf=false", "-c", "core.eol=lf", "clone", "--shared", "--no-checkout", repo, copy], { windowsHide: true, timeout: 120_000, stdio: "ignore" });
  git(copy, ["checkout", "--detach", BASE]);
  const before = await verifyTracked(repo, copy, manifest);
  if (before.mismatchCount !== 0 || before.trackedFileCount !== manifest.length) throw new Error(`${id}: pre-patch tracked blob verification failed`);
  return { copy, before };
}

async function patchVariant(copy, patch) {
  const path = join(copy, ESTIMATOR);
  const before = await readFile(path, "utf8");
  const sourceSha256 = sha256(Buffer.from(before));
  const regexCount = before.split(OLD_REGEX).length - 1;
  const lengthCount = before.split(OLD_LENGTH).length - 1;
  let after = before;
  const replacements = [];
  if (patch === "d1a" || patch === "combined") {
    if (regexCount !== 1) throw new Error(`expected exactly one regex literal, found ${regexCount}`);
    after = after.replace(OLD_REGEX, NEW_REGEX); replacements.push({ type: "d1a", count: 1 });
  }
  if (patch === "d2b" || patch === "combined") {
    if (lengthCount !== 1) throw new Error(`expected exactly one length expression, found ${lengthCount}`);
    after = after.replace(OLD_LENGTH, NEW_LENGTH); replacements.push({ type: "d2b", count: 1 });
  }
  if (after !== before) await writeFile(path, after, "utf8");
  return { sourceSha256Before: sourceSha256, sourceSha256After: sha256(Buffer.from(after)), replacements, regexCount, lengthCount };
}

function relativeFailurePath(file, copy) {
  const normalized = String(file ?? "").replaceAll("\\", "/");
  const prefix = copy.replaceAll("\\", "/").replace(/\/$/, "") + "/";
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized.replace(/^.*?\/(src|tests)\//, "$1/");
}
function failureSummary(test, copy) {
  const json = test.stdout ? jsonFromOutput(test.stdout) : null;
  const failures = [];
  for (const file of json?.testResults ?? []) for (const assertion of file.assertionResults ?? []) if (assertion.status === "failed") failures.push({ file: relativeFailurePath(file.name, copy), line: assertion.location?.line ?? null, title: assertion.fullName ?? assertion.title ?? "", status: assertion.status, expected: assertion.expected ?? null, actual: assertion.actual ?? null, failureMessages: (assertion.failureMessages ?? []).map((x) => sanitized(x, copy)) });
  return { count: failures.length, failures };
}
function testCounts(json) {
  if (!json) return null;
  return { pass: json.numPassedTests ?? null, fail: json.numFailedTests ?? null, skip: json.numPendingTests ?? json.numTodoTests ?? null, total: json.numTotalTests ?? null };
}
function stripBenchmark(report) {
  if (!report || typeof report !== "object") return report;
  const clone = structuredClone(report);
  delete clone.generatedAt; delete clone.environment;
  for (const result of clone.results ?? []) for (const key of ["latencyMs", "suiteLatencyMs", "medianLatencyMs", "p95LatencyMs"]) delete result[key];
  delete clone.passed;
  return clone;
}

async function main() {
  const options = args();
  const repo = options.repo ?? resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const scratch = options.scratchRoot ?? join(tmpdir(), "tco-cjk-variants");
  const output = options.output ?? resolve(repo, "research", "results", "cjk-estimator-variants.json");
  const manifest = await trackedManifest(repo);
  await mkdir(resolve(output, ".."), { recursive: true });
  const result = { schemaVersion: 1, baseCommit: BASE, environment: { node: process.version, platform: process.platform, arch: process.arch, lockfileSha256: null }, materialization: { method: "shared clone checkout at exact base commit", trackedFileCount: manifest.length }, variants: [], benchmarkComparison: null };
  const persist = async () => writeFile(output, JSON.stringify(result, null, 2) + "\n", "utf8");
  for (const variant of variants) {
    const materialized = await materialize(repo, scratch, variant.id, manifest);
    if (result.environment.lockfileSha256 === null) result.environment.lockfileSha256 = sha256(await readFile(join(materialized.copy, "package-lock.json")));
    const patch = await patchVariant(materialized.copy, variant.patch);
    const after = await verifyTracked(repo, materialized.copy, manifest);
    const unexpected = after.mismatches.filter((entry) => entry.path !== ESTIMATOR);
    if (unexpected.length !== 0) throw new Error(`${variant.id}: post-patch non-estimator tracked blob verification failed`);
    const runDir = await mkdtemp(join(scratch, `${variant.id}-run-`));
    const install = run(materialized.copy, "npm.cmd", ["ci"], 1_800_000);
    await writeFile(join(runDir, "npm-ci.log"), sanitized(`${install.stdout}\n${install.stderr}${install.error ? `\n${install.error}` : ""}`, materialized.copy), "utf8");
    if (install.exitCode !== 0 || install.timedOut || install.error) throw new Error(`${variant.id}: npm ci failed: ${install.error ?? install.stderr}`);
    const built = run(materialized.copy, "npm.cmd", ["run", "build"], 1_800_000);
    await writeFile(join(runDir, "build.log"), sanitized(`${built.stdout}\n${built.stderr}${built.error ? `\n${built.error}` : ""}`, materialized.copy), "utf8");
    if (built.exitCode !== 0 || built.timedOut || built.error) throw new Error(`${variant.id}: build failed: ${built.error ?? built.stderr}`);
    const afterBuild = await verifyTracked(repo, materialized.copy, manifest);
    const buildUnexpected = afterBuild.mismatches.filter((entry) => entry.path !== ESTIMATOR && !entry.path.startsWith("bin/"));
    const estimatorAfterBuildSha256 = sha256(await readFile(join(materialized.copy, ESTIMATOR)));
    if (buildUnexpected.length !== 0 || estimatorAfterBuildSha256 !== patch.sourceSha256After) throw new Error(`${variant.id}: post-build tracked verification failed`);
    const testPath = join(runDir, "vitest.json");
    const test = run(materialized.copy, "npm.cmd", ["run", "test", "--", "--reporter=json", `--outputFile=${testPath}`]);
    await writeFile(join(runDir, "tests.log"), sanitized(`${test.stdout}\n${test.stderr}${test.error ? `\n${test.error}` : ""}`, materialized.copy), "utf8");
    if (test.timedOut || test.error) throw new Error(`${variant.id}: test process failed: ${test.error ?? "timed out"}`);
    const testJson = existsSync(testPath) ? JSON.parse(await readFile(testPath, "utf8")) : null;
    if (!testJson) throw new Error(`${variant.id}: Vitest JSON report missing`);
    const benchmarkRuns = [];
    const benchmarkCount = variant.id === "baseline" ? 2 : 1;
    for (let i = 0; i < benchmarkCount; i += 1) benchmarkRuns.push(run(materialized.copy, "npm.cmd", ["run", "benchmark"]));
    for (let i = 0; i < benchmarkRuns.length; i += 1) await writeFile(join(runDir, `benchmark-${i + 1}.raw.log`), sanitized(`${benchmarkRuns[i].stdout}\n${benchmarkRuns[i].stderr}${benchmarkRuns[i].error ? `\n${benchmarkRuns[i].error}` : ""}`, materialized.copy), "utf8");
    const reports = benchmarkRuns.map((runResult) => jsonFromOutput(runResult.stdout));
    if (benchmarkRuns.some((runResult, index) => runResult.timedOut || runResult.error || !reports[index] || !Array.isArray(reports[index].results))) throw new Error(`${variant.id}: benchmark report missing or command failed`);
    for (let i = 0; i < benchmarkRuns.length; i += 1) {
      if (reports[i]) await writeFile(join(runDir, `benchmark-${i + 1}.json`), JSON.stringify(reports[i], null, 2) + "\n", "utf8");
    }
    result.variants.push({ id: variant.id, source: { ...patch }, trackedFiles: { before: materialized.before, after: { ...after, unexpectedMismatchCount: unexpected.length, expectedPatchedPaths: variant.patch ? [ESTIMATOR] : [] }, afterBuild: { ...afterBuild, unexpectedMismatchCount: buildUnexpected.length, allowedGeneratedPaths: afterBuild.mismatches.filter((entry) => entry.path.startsWith("bin/")).map((entry) => entry.path), estimatorSha256: estimatorAfterBuildSha256, stage: "before_tests" } }, build: { exitCode: built.exitCode, timedOut: built.timedOut }, tests: { exitCode: test.exitCode, timedOut: test.timedOut, passFailSkip: testCounts(testJson), failures: failureSummary({ ...test, stdout: JSON.stringify(testJson) }, materialized.copy), rawReportPath: scratchRef(scratch, testPath) }, benchmarks: { count: benchmarkRuns.length, runs: reports.map((report, i) => ({ exitCode: benchmarkRuns[i].exitCode, passed: report.passed ?? null, passedLatencyGate: report.results.every((x) => x.p95LatencyMs <= report.thresholds.maximumScenarioLatencyMs), rawReportPath: scratchRef(scratch, join(runDir, `benchmark-${i + 1}.json`)), rawLogPath: scratchRef(scratch, join(runDir, `benchmark-${i + 1}.raw.log`)), nonTime: stripBenchmark(report) })) } });
    await persist();
    console.log(JSON.stringify({ variant: variant.id, completed: true, testsExitCode: test.exitCode }));
  }
  if (result.variants.length) {
    const baseline = result.variants[0].benchmarks.runs[0].nonTime;
    const baselineRepeat = result.variants[0].benchmarks.runs[1]?.nonTime;
    result.benchmarkComparison = { comparedFields: "all benchmark JSON fields after removing generatedAt, environment, latency fields, and passed", baselineAAExact: JSON.stringify(baseline) === JSON.stringify(baselineRepeat), exactBaselineCandidateMatches: result.variants.slice(1).map((v) => JSON.stringify(v.benchmarks.runs[0].nonTime) === JSON.stringify(baseline)), excluded: ["generatedAt", "environment", "latencyMs", "suiteLatencyMs", "medianLatencyMs", "p95LatencyMs", "passed"] };
  }
  await persist();
  console.log(JSON.stringify({ output, variants: result.variants.length, trackedFileCount: manifest.length }));
}
main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
