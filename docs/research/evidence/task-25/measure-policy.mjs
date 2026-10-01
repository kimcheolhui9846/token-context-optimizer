import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { platform, release, arch } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const args = process.argv.slice(2);
const phase = args[0] ?? "baseline";
const sourceRelative = args[1] ?? (phase === "after" ? "src/core/policy.ts" : "tests/helpers/policy-baseline.ts");
const outputArg = args[2];
if (!new Set(["baseline", "after", "audit"]).has(phase)) throw new Error("phase must be baseline, after, or audit");
const outputPath = outputArg ? (isAbsolute(outputArg) ? outputArg : resolve(here, outputArg)) : resolve(here, `${phase}.json`);
const timeoutMs = 20_000;
const cumulativeBudgetMs = 180_000;
const candidateFamilies = ["drop", "semicolon", "php_opener", "tag_space", "trace_spaces_equals", "hyphen", "dot", "blanklines", "bang_letter", "html_comment", "npm_dots_x", "command_prefix"];
const auditFamilies = ["secret_missing_separator", "authorization_missing_value", "private_key_near_miss", "path_missing_terminator", "path_segments", "run_command", "hash_value_near_miss", "underscore_runs", "hexadecimal_run", "uppercase_dashed_run", "number_suffix_near_miss"];
const isAudit = phase === "audit";
const families = isAudit ? auditFamilies : candidateFamilies;
const sizes = isAudit ? [2_000] : [10_000, 20_000, 40_000];
const sourcePath = resolve(root, sourceRelative);
const report = {
  phase,
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
  source: {
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    path: sourceRelative,
    gitBlob: execFileSync("git", ["hash-object", sourcePath], { cwd: root, encoding: "utf8" }).trim(),
    sha256: createHash("sha256").update(readFileSync(sourcePath)).digest("hex"),
    oracleSha256: createHash("sha256").update(readFileSync(resolve(root, "tests/helpers/policy-baseline.ts"))).digest("hex"),
  },
  method: {
    processIsolated: true,
    timedRegion: "individual regular expressions/helpers and full classifier in separate child processes; child setup and input construction excluded",
    sizesUtf16CodeUnits: sizes,
    rawTimedSamplesPerProbe: 5,
    warmupInSameChildPerProbe: 1,
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
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

function child(mode, family, size) {
  const remaining = cumulativeBudgetMs - cumulativeMs;
  if (remaining < 1) return { status: "not-run-budget-exhausted" };
  const childTimeoutMs = Math.floor(Math.min(timeoutMs, remaining));
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, [
    resolve(here, "measure-child.mjs"), mode, family, String(size), sourceRelative,
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: childTimeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const wallMs = performance.now() - startedAt;
  cumulativeMs += wallMs;
  if (mode === "predicates") {
    const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      try { parsed.push(JSON.parse(line)); } catch { /* A killed child may leave a partial final JSON line. */ }
    }
    const summary = parsed.find((item) => item.type === "summary");
    const value = {
      patterns: parsed.filter((item) => item.type === "pattern"),
      helpers: Object.fromEntries(parsed.filter((item) => item.type === "helper").map((item) => [item.key, item])),
      summary,
    };
    if (result.error?.code === "ETIMEDOUT") return { status: "timeout-censored", wallMs, value };
    if (result.status !== 0) return { status: "error", wallMs, error: result.error?.message ?? result.stderr.trim(), value };
    return { status: "complete", wallMs, value };
  }
  if (result.error?.code === "ETIMEDOUT") return { status: "timeout-censored", wallMs, partialStdout: result.stdout };
  if (result.status !== 0) return { status: "error", wallMs, error: result.error?.message ?? result.stderr.trim(), partialStdout: result.stdout };
  return { status: "complete", wallMs, value: JSON.parse(result.stdout) };
}

const skipPredicateFamilies = new Set();
const skipClassifierFamilies = new Set();
for (const family of families) {
  const familyGroup = { family, recipe: family, sizes: [] };
  report.groups.push(familyGroup);
  for (const size of sizes) {
    if (cumulativeMs >= cumulativeBudgetMs) {
      report.budget.exhausted = true;
      familyGroup.sizes.push({ size, predicates: { status: "not-run-budget-exhausted" }, classifier: { status: "not-run-budget-exhausted" } });
      continue;
    }
    const predicates = skipPredicateFamilies.has(family)
      ? { status: "not-run-after-earlier-timeout" }
      : child("predicates", family, size);
    if (predicates.status === "timeout-censored") skipPredicateFamilies.add(family);
    const classifier = skipClassifierFamilies.has(family)
      ? { status: "not-run-after-earlier-timeout" }
      : cumulativeMs < cumulativeBudgetMs ? child("classifier", family, size) : { status: "not-run-budget-exhausted" };
    if (classifier.status === "timeout-censored") skipClassifierFamilies.add(family);
    const entry = { size, predicates, classifier };
    familyGroup.sizes.push(entry);
    writePartial();
    process.stdout.write(`${phase} ${family} ${size}: predicates=${predicates.status}, classifier=${classifier.status}; cumulative=${Math.round(cumulativeMs)}ms\n`);
  }
}

report.budget.elapsedMs = Math.round(Math.max(cumulativeMs, performance.now() - started));
report.budget.exhausted ||= cumulativeMs >= cumulativeBudgetMs;
const unmeasured = [];
for (const group of report.groups) {
  for (const entry of group.sizes) {
    if (entry.predicates.status !== "complete") unmeasured.push(`${group.family}/${entry.size}/predicates:${entry.predicates.status}`);
    else {
      if (entry.predicates.value.patterns.length !== 27) unmeasured.push(`${group.family}/${entry.size}/patterns:${entry.predicates.value.patterns.length}/27`);
      if (Object.keys(entry.predicates.value.helpers).length !== 7) unmeasured.push(`${group.family}/${entry.size}/helpers:${Object.keys(entry.predicates.value.helpers).length}/7`);
    }
    if (entry.classifier.status !== "complete") unmeasured.push(`${group.family}/${entry.size}/classifier:${entry.classifier.status}`);
  }
}
report.coverage = {
  candidateFamilies,
  remainingRuleAuditFamilies: auditFamilies,
  status: unmeasured.length ? (report.budget.exhausted ? "partial-budget-censored" : "partial-or-censored") : "complete",
  unmeasured,
};
report.medianElapsedNs = (values) => values.length ? values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
for (const group of report.groups) {
  for (const entry of group.sizes) {
    for (const category of ["predicates", "classifier"]) {
      const childResult = entry[category];
      if (childResult.status === "complete") {
        const payload = childResult.value;
        if (category === "classifier") childResult.medianElapsedNs = report.medianElapsedNs(payload.samples.map((sample) => sample.elapsedNs));
        else {
          childResult.patternMediansNs = payload.patterns.map((probe) => report.medianElapsedNs(probe.samples.map((sample) => sample.elapsedNs)));
          childResult.helperMediansNs = Object.fromEntries(Object.entries(payload.helpers).map(([name, probe]) => [name, report.medianElapsedNs(probe.samples.map((sample) => sample.elapsedNs))]));
        }
      }
    }
  }
}
delete report.medianElapsedNs;
writePartial();
process.stdout.write(`${outputPath}\n`);
