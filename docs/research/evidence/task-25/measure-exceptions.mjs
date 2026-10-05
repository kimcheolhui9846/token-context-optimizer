import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire, default as Module } from "node:module";
import { platform, release, arch } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const runnerPath = fileURLToPath(import.meta.url);
const currentPath = resolve(root, "src/core/policy.ts");
const baselinePath = resolve(root, "tests/helpers/policy-baseline.ts");
const require = createRequire(import.meta.url);
const sizes = [1, 5, 10].map((mib) => mib * 1024 * 1024);
const timeoutMs = 10_000;
const cumulativeBudgetMs = 120_000;
const timestamp = new Date().toISOString().replaceAll(":", "-");
const outputPath = resolve(here, `exception-probes-${timestamp}.json`);

if (process.argv[2] === "--child") {
  runChild();
} else {
  runParent();
}

function sourceInfo(path, relative) {
  const bytes = readFileSync(path);
  return {
    path: relative,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}

function runParent() {
  if (existsSync(outputPath)) throw new Error(`refusing to overwrite ${outputPath}`);
  const jobs = [];
  for (const family of ["hex", "digits", "u3000-newline"]) {
    for (const targetUtf8Bytes of sizes) jobs.push({ revision: "current", family, targetUtf8Bytes });
  }
  jobs.push(
    { revision: "baseline-regex", family: "hex-regex", targetUtf8Bytes: 5_000_001 },
    { revision: "baseline-regex", family: "hex-regex", targetUtf8Bytes: 6_000_001 },
    { revision: "baseline", family: "u3000-reviewer-case", targetUtf8Bytes: 28_000_000 },
    { revision: "current", family: "u3000-reviewer-case", targetUtf8Bytes: 28_000_000 },
  );

  const report = {
    phase: "scope-external-exception-observations",
    measuredAt: new Date().toISOString(),
    environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
    source: {
      current: sourceInfo(currentPath, "src/core/policy.ts"),
      baseline: sourceInfo(baselinePath, "tests/helpers/policy-baseline.ts"),
      gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    },
    method: {
      targetUtf8Bytes: "exact, with UTF-16 code units and actual UTF-8 bytes recorded per outcome",
      oneSamplePerJob: true,
      childTimeoutMs: timeoutMs,
      cumulativeBudgetMs,
      timeoutOutcome: "timeout-censored; distinct from a thrown exception",
      childOperationElapsedNs: "only classify/regex invocation, including thrown calls",
      childWallMs: "parent-observed child process wall time, including startup and compilation",
      constructionAndCompilationTimed: false,
      baselineFullClassifierCases: ["single reviewer-reported U+3000 case only"],
    },
    jobs: [],
  };

  function writePartial() {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  const started = performance.now();
  for (const job of jobs) {
    const expectedSource = job.revision === "current" ? report.source.current :
      job.revision === "baseline" ? report.source.baseline : null;
    const allowedPairs = {
      current: new Set(["hex", "digits", "u3000-newline", "u3000-reviewer-case"]),
      baseline: new Set(["u3000-reviewer-case"]),
      "baseline-regex": new Set(["hex-regex"]),
    };
    if (!allowedPairs[job.revision]?.has(job.family)) {
      throw new Error(`invalid revision/family pair: ${job.revision}/${job.family}`);
    }
    const remaining = Math.floor(cumulativeBudgetMs - (performance.now() - started));
    if (remaining <= 0) {
      report.jobs.push({ ...job, status: "not-run-budget-exhausted" });
      writePartial();
      continue;
    }
    const childStart = performance.now();
    const expectedSha256 = expectedSource?.sha256 ?? "none";
    const result = spawnSync(process.execPath, [runnerPath, "--child", job.revision, job.family, String(job.targetUtf8Bytes), expectedSha256], {
      cwd: root,
      encoding: "utf8",
      timeout: Math.min(timeoutMs, remaining),
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const childWallMs = performance.now() - childStart;
    let child;
    let metadata;
    for (const line of result.stdout.split(/\r?\n/u).filter(Boolean)) {
      try {
        const record = JSON.parse(line);
        if (record.record === "metadata") metadata = record.metadata;
        else if (record.record === "outcome") child = record;
      } catch { /* Ignore incomplete records from terminated children. */ }
    }
    let status = child?.outcome ?? "error";
    if (result.error?.code === "ETIMEDOUT") status = "timeout-censored";
    else if (result.status !== 0 && status !== "threw") status = "error";
    report.jobs.push({
      ...job,
      status,
      childWallMs,
      ...(metadata ?? { revision: job.revision, family: job.family, targetUtf8Bytes: job.targetUtf8Bytes, source: expectedSource?.path, sourceSha256: expectedSha256 }),
      ...(child ? {
        childOperationElapsedNs: child.childOperationElapsedNs,
        detail: child.detail,
      } : {}),
      ...((result.error || result.status !== 0) && status !== "threw" ? { error: result.error?.message ?? result.stderr.trim() } : {}),
      ...(status === "timeout-censored" ? { timeoutMs: Math.min(timeoutMs, remaining), signal: result.signal } : {}),
    });
    writePartial();
    process.stdout.write(`${job.revision}/${job.family}/${job.targetUtf8Bytes}: ${status}\n`);
  }
  report.budget = { elapsedMs: performance.now() - started, cumulativeBudgetMs };
  writePartial();
  process.stdout.write(`${outputPath}\n`);
}

function runChild() {
  const [, , , revision, family, targetText, expectedSha256] = process.argv;
  const targetUtf8Bytes = Number(targetText);
  if (!Number.isSafeInteger(targetUtf8Bytes) || targetUtf8Bytes <= 0 || targetUtf8Bytes > 28_000_000) {
    throw new Error("usage: measure-exceptions.mjs --child <revision> <family> <targetUtf8Bytes<=28000000>");
  }

  const allowedPairs = {
    current: new Set(["hex", "digits", "u3000-newline", "u3000-reviewer-case"]),
    baseline: new Set(["u3000-reviewer-case"]),
    "baseline-regex": new Set(["hex-regex"]),
  };
  if (!allowedPairs[revision]?.has(family)) throw new Error(`invalid revision/family pair: ${revision}/${family}`);

  let sourcePath;
  let relative;
  if (revision === "current") {
    sourcePath = currentPath;
    relative = "src/core/policy.ts";
  } else if (revision === "baseline") {
    sourcePath = baselinePath;
    relative = "tests/helpers/policy-baseline.ts";
  }

  const sourceBytes = sourcePath ? readFileSync(sourcePath) : null;
  const sourceSha256 = sourceBytes && createHash("sha256").update(sourceBytes).digest("hex");
  if (sourceSha256 !== (expectedSha256 === "none" ? null : expectedSha256)) {
    throw new Error(`source hash mismatch for ${revision}: expected ${expectedSha256}, got ${sourceSha256}`);
  }
  let classify;
  if (sourceBytes) {
    const source = `${sourceBytes.toString("utf8")}\nexports.__task25Probe = classifyContext;\n`;
    const ts = require("typescript");
    const compiledSource = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const compiled = new Module(sourcePath);
    compiled.filename = sourcePath;
    compiled.paths = Module._nodeModulePaths(root);
    compiled._compile(compiledSource, sourcePath);
    classify = compiled.exports.__task25Probe;
  }

  const input = makeInput(family, targetUtf8Bytes);
  const utf16CodeUnits = input.length;
  const utf8Bytes = Buffer.byteLength(input, "utf8");
  const metadata = { revision, family, targetUtf8Bytes, utf16CodeUnits, utf8Bytes, source: relative, sourceSha256 };
  process.stdout.write(`${JSON.stringify({ record: "metadata", metadata })}\n`);
  let detail;
  let outcome = "returned";
  let errorDetail;
  const operationStarted = process.hrtime.bigint();
  try {
    if (revision === "baseline-regex") {
      const hexReDoS = /\b[A-Fa-f0-9]{32,}\b/u;
      detail = { returned: hexReDoS.test(input) };
    } else {
      const result = classify(input);
      detail = { returned: true, mode: result.mode, reasons: result.reasons, warnings: result.warnings };
    }
  } catch (error) {
    outcome = "threw";
    errorDetail = { name: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : String(error) };
  }
  const childOperationElapsedNs = (process.hrtime.bigint() - operationStarted).toString();
  process.stdout.write(`${JSON.stringify({ record: "outcome", outcome, childOperationElapsedNs, detail: outcome === "threw" ? errorDetail : detail })}\n`);
}

function makeInput(family, targetBytes) {
  if (family === "hex-regex") return "a".repeat(targetBytes - 1) + "g";
  if (family === "hex") return "a".repeat(targetBytes - 1) + "g";
  if (family === "digits") return "1".repeat(targetBytes - 1) + "a";
  if (family === "u3000-reviewer-case") return ("\u3000".repeat(9) + "\n").repeat(1_000_000);
  if (family === "u3000-newline") {
    const unit = "\u3000".repeat(9) + "\n";
    const repetitions = Math.floor(targetBytes / 28);
    const remainder = targetBytes - repetitions * 28;
    return unit.repeat(repetitions) + "\u3000".repeat(Math.floor(remainder / 3)) + "x".repeat(remainder % 3);
  }
  throw new Error(`unknown input family: ${family}`);
}
