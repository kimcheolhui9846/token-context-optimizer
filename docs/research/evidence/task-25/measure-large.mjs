import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform, release, arch } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 2) {
  throw new Error("measure-large.mjs takes no arguments; it measures only current src/core/policy.ts");
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const sourceRelative = "src/core/policy.ts";
const sourcePath = resolve(root, sourceRelative);
const childPath = resolve(here, "measure-large-child.mjs");
const families = [
  "drop",
  "semicolon",
  "php_opener",
  "tag_space",
  "trace_spaces_equals",
  "hyphen",
  "dot",
  "blanklines",
  "bang_letter",
  "html_comment",
  "npm_dots_x",
  "command_prefix",
];
const sizes = [1 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024];
const sampleCount = 5;
const childTimeoutMs = 20_000;
const cumulativeBudgetMs = 180_000;
const timestamp = new Date().toISOString().replaceAll(":", "-");
const outputPath = resolve(here, `large-current-${timestamp}.json`);
if (existsSync(outputPath)) throw new Error(`refusing to overwrite ${outputPath}`);

const report = {
  phase: "current-classifier-large-only",
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
  source: {
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    path: sourceRelative,
    gitBlob: execFileSync("git", ["hash-object", sourcePath], { cwd: root, encoding: "utf8" }).trim(),
    sha256: createHash("sha256").update(readFileSync(sourcePath)).digest("hex"),
  },
  method: {
    currentProductionClassifierOnly: true,
    baselineOrOracleAllowed: false,
    families,
    sizesUtf16CodeUnitsAndExpectedUtf8Bytes: sizes,
    rawTimedSamplesPerProbe: sampleCount,
    warmup: "one 100-unit same-recipe classification in each child, excluded from timings",
    childTimeoutMs,
    cumulativeBudgetMs,
    timeoutIsCensored: true,
    inputClass: "ASCII only; exact UTF-16 code-unit and UTF-8 byte lengths",
    timedRegion: "classifyContext(input) only; process startup, TS compilation and input construction are excluded",
  },
  probes: [],
};

function writePartial() {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const phaseStartedAt = performance.now();
for (const family of families) {
  for (const size of sizes) {
    const remainingMs = Math.floor(cumulativeBudgetMs - (performance.now() - phaseStartedAt));
    if (remainingMs <= 0) {
      report.probes.push({ family, size, status: "not-run-budget-exhausted", samples: [] });
      writePartial();
      continue;
    }
    const effectiveTimeoutMs = Math.min(childTimeoutMs, remainingMs);
    const phaseStarted = performance.now();
    const result = spawnSync(process.execPath, [childPath, family, String(size), String(sampleCount)], {
      cwd: root,
      encoding: "utf8",
      timeout: effectiveTimeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const phaseElapsedMs = performance.now() - phaseStarted;
    const parsed = [];
    for (const line of result.stdout.split(/\r?\n/u).filter(Boolean)) {
      try { parsed.push(JSON.parse(line)); } catch { /* Preserve complete JSON lines from killed children only. */ }
    }
    const metadata = parsed.find((record) => record.type === "metadata") ?? null;
    const samples = parsed.filter((record) => record.type === "sample");
    let status = "complete";
    let error;
    if (result.error?.code === "ETIMEDOUT") status = "timeout-censored";
    else if (result.status !== 0) {
      status = "error";
      error = result.error?.message ?? result.stderr.trim();
    } else if (samples.length !== sampleCount || !metadata) {
      status = "incomplete";
      error = "child exited successfully without the requested metadata and all samples";
    }
    if (metadata && metadata.sourceSha256 !== report.source.sha256) {
      status = "source-mismatch";
      error = "child compiled source differs from the parent's initial source hash";
    }

    report.probes.push({
      family,
      size,
      status,
      phaseElapsedMs,
      metadata,
      samples,
      ...(error ? { error } : {}),
      ...(status === "timeout-censored" ? { timeoutMs: effectiveTimeoutMs, signal: result.signal } : {}),
    });
    writePartial();
    process.stdout.write(`${family} ${size}: ${status}, samples=${samples.length}/${sampleCount}, phase=${Math.round(phaseElapsedMs)}ms\n`);
  }
}

report.budget = { elapsedMs: performance.now() - phaseStartedAt, cumulativeBudgetMs };
report.coverage = {
  expectedProbes: families.length * sizes.length,
  completedProbes: report.probes.filter((probe) => probe.status === "complete").length,
  incomplete: report.probes.filter((probe) => probe.status !== "complete").map(({ family, size, status }) => ({ family, size, status })),
  status: report.probes.every((probe) => probe.status === "complete") ? "complete" : "partial-or-censored",
};
writePartial();
process.stdout.write(`${outputPath}\n`);
