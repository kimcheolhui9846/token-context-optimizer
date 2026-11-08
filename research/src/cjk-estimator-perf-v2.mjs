#!/usr/bin/env node
// One-shot preregistered runner: each block measures AB/BA first, then the A/A
// control with the same order, warmups, samples, and batch. No retries,
// randomization, or forced GC. Power plan, effective overlay, AC and saver are read.
// Approved preregistration: docs/agent/handoffs/6-4b-3-cjk-estimator-plan.md.
// Fixed order per input size: six alternating AB/BA blocks. Each block runs
// A/B warmups and samples, then independently loaded A/A warmups and samples.
// Ratios use pooled 120 samples (60 per order stratum); p95 is nearest rank.
// A/A bounds are abs(ratio of aggregate statistics - 1), not paired ratios.
// No timing pilots, retries, selection, explicit GC, or threshold rounding.
// --self-test uses synthetic numbers and generated inputs, never estimator timing.
import { createHash } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpus, EOL, platform, release, arch, homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "../..");
const SOURCE_PATH = resolve(ROOT, "src/core/token-estimator.ts");
const OUTPUT_PATH = resolve(ROOT, "research/results/cjk-estimator-perf-v2.json");
const BASE = "c9e816eeeeb8015f723c1b3e4ff825e42993b105";
const TARGETS = [
  ["ascii", "a"],
  ["kana", "かなカナ"],
  ["hangul", "가힣"],
  ["astral", "𠀀🙂"],
  ["mixed", "aかな漢가𠀀🙂 "],
];
const SIZES = [1024, 10 * 1024 * 1024];
const BLOCKS = 6;
const WARMUPS = 5;
const SAMPLES = 60;
const BATCHES = { 1024: 1000, 10485760: 1 };
const ORDERS = ["AB", "BA", "AB", "BA", "AB", "BA"];
const REQUIRED_NODE = "v24.18.0";
const THRESHOLDS = { medianRatio: 1.05, p95Ratio: 1.10, strataMedianRatio: 1.05, aaMedianDeviation: 0.03, aaP95Deviation: 0.05 };
class InconclusiveError extends Error {}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const median = (values) => {
  if (!values.length) throw new InconclusiveError("median requires samples");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const nearestP95 = (values) => {
  if (!values.length) throw new InconclusiveError("p95 requires samples");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((95 * sorted.length) / 100) - 1];
};
const ratio = (numerator, denominator) => numerator / denominator;
const now = () => process.hrtime.bigint();

function gitShow(path) {
  return execFileSync("git", ["show", `${BASE}:${path}`], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
}

function sourceProvenance() {
  const baseline = gitShow("src/core/token-estimator.ts");
  const current = require("node:fs").readFileSync(SOURCE_PATH, "utf8");
  const oldRegex = "/[\\u3131-\\uD79D]/u";
  const newRegex = "/[\\u3040-\\u30FF\\u3131-\\uD7A3]/u";
  const normalize = (text) => text.replace(/\r\n/gu, "\n");
  const normalizedBaseline = normalize(baseline);
  const normalizedCurrent = normalize(current);
  if (normalizedCurrent !== normalizedBaseline.replace(oldRegex, newRegex)) throw new Error("source differs beyond the preregistered regex patch");
  const oldLines = normalizedBaseline.split("\n");
  const newLines = normalizedCurrent.split("\n");
  if (oldLines.length !== newLines.length) throw new Error("source patch changes line count");
  const differences = [];
  for (let index = 0; index < oldLines.length; index++) {
    if (oldLines[index] !== newLines[index]) differences.push(index);
  }
  if (differences.length !== 1) throw new Error(`expected one source-line change, got ${differences.length}`);
  const index = differences[0];
  const expected = oldLines[index].replace(oldRegex, newRegex);
  if (expected !== newLines[index]) throw new Error("source change is not the preregistered regex patch");
  return {
    baseCommit: BASE,
    headAtRun: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim(),
    currentSourceState: "working-tree",
    workingTreeStatusDigest: sha256(execFileSync("git", ["status", "--porcelain", "--", "src/core/token-estimator.ts"], { cwd: ROOT, encoding: "utf8", windowsHide: true })),
    baseSourceSha256Raw: sha256(baseline),
    currentSourceSha256Raw: sha256(current),
    baseSourceSha256Normalized: sha256(normalizedBaseline),
    currentSourceSha256Normalized: sha256(normalizedCurrent),
    baseSourceBlob: execFileSync("git", ["rev-parse", `${BASE}:src/core/token-estimator.ts`], { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim(),
    currentSourceBlob: execFileSync("git", ["hash-object", "--", "src/core/token-estimator.ts"], { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim(),
    changedLines: differences.length,
    patchProof: "only estimator CJK regex changed",
    baseline,
    current,
    normalizedBaseline,
    normalizedCurrent,
  };
}

function transpile(source) {
  const ts = require("typescript");
  const settings = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
  return { settings: { module: "CommonJS", target: "ES2022", typescript: ts.version }, code: ts.transpileModule(source, { compilerOptions: settings }).outputText };
}

function prepare() {
  if (process.version !== REQUIRED_NODE) throw new Error(`preflight requires ${REQUIRED_NODE}`);
  const initialPower = powerPlan();
  if (initialPower === null) throw new Error("preflight power plan unavailable (no measurement attempted)");
  const provenance = sourceProvenance();
  const base = transpile(provenance.normalizedBaseline);
  const current = transpile(provenance.normalizedCurrent);
  const oldEmitted = "/[\\u3131-\\uD79D]/u";
  const newEmitted = "/[\\u3040-\\u30FF\\u3131-\\uD7A3]/u";
  if (base.code.split(oldEmitted).length - 1 !== 1) throw new Error("expected one old emitted regex");
  if (base.code.split(newEmitted).length - 1 !== 0) throw new Error("baseline emitted regex unexpectedly contains new range");
  if (current.code !== base.code.replace(oldEmitted, newEmitted)) throw new Error("emitted JS differs beyond the preregistered regex patch");
  const a = loadEstimator(base, "A");
  const b = loadEstimator(current, "B");
  const aa = loadEstimator(base, "AA1");
  const aa2 = loadEstimator(base, "AA2");
  const preparedInputs = TARGETS.flatMap(([id, pattern]) => SIZES.map((size) => {
    const text = makeInput(pattern, size);
    assertInput(text, size, `${id}/${size}`);
    const expected = expectedChecksums(id, pattern, size);
    return { id, pattern, size, text, inputUtf8Sha256: sha256(Buffer.from(text, "utf8")), patternSha256: sha256(Buffer.from(pattern, "utf8")), ...expected };
  }));
  const functional = [["aaaa", 1, 1], ["かなかな", 1, 4], ["가힣", 2, 2], ["힣힣힣힣", 1, 4], ["🙂🙂🙂🙂", 2, 2]];
  for (const [text, before, after] of functional) {
    if (a(text) !== before || b(text) !== after || aa(text) !== before || aa2(text) !== before) throw new Error("functional estimator preflight failed");
  }
  return { provenance, base, current, a, b, aa, aa2, preparedInputs, initialPower };
}

// Independent expected counts for the five fixed unit strings; no regex mirror.
function expectedChecksums(id, pattern, size) {
  const repeats = Math.floor(size / Buffer.byteLength(pattern));
  const padding = size % Buffer.byteLength(pattern);
  const counts = { ascii: [0, 0], kana: [0, 4], hangul: [1, 2], astral: [0, 0], mixed: [2, 4] }[id];
  const words = id === "mixed" ? repeats + (padding > 0 ? 1 : 0) : 1;
  const utf16 = pattern.length * repeats + padding;
  const values = counts.map(count => Math.max(1, words, Math.ceil((utf16 - count * repeats) / 4) + count * repeats) * BATCHES[size]);
  return { expectedA: values[0], expectedB: values[1], expectedAA: values[0] };
}

function loadEstimator(compiled, role) {
  const module = { exports: {} };
  vm.runInNewContext(compiled.code, { module, exports: module.exports, require, console }, { filename: `token-estimator.${role}.js` });
  if (typeof module.exports.estimateTextTokens !== "function") throw new Error("transpiled estimator export missing");
  return module.exports.estimateTextTokens;
}

const POWER_QUERY = "$ErrorActionPreference = 'Stop'\nAdd-Type -TypeDefinition @'\nusing System;\nusing System.Runtime.InteropServices;\npublic static class CjkPower {\n  [StructLayout(LayoutKind.Sequential)] public struct Status {\n    public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag;\n    public uint BatteryLifeTime, BatteryFullLifeTime;\n  }\n  [DllImport(\"kernel32.dll\", SetLastError=true)]\n  [return: MarshalAs(UnmanagedType.Bool)]\n  public static extern bool GetSystemPowerStatus(out Status status);\n  [DllImport(\"powrprof.dll\")]\n  public static extern uint PowerGetEffectiveOverlayScheme(out Guid guid);\n}\n'@\n$state = New-Object CjkPower+Status\nif (-not [CjkPower]::GetSystemPowerStatus([ref]$state)) { throw 'GetSystemPowerStatus failed' }\n$overlay = [Guid]::Empty\n$overlayResult = [CjkPower]::PowerGetEffectiveOverlayScheme([ref]$overlay)\nif ($overlayResult -ne 0) { throw 'PowerGetEffectiveOverlayScheme failed' }\n$planText = powercfg /getactivescheme\nif ($LASTEXITCODE -ne 0) { throw 'powercfg failed' }\n$plan = [regex]::Match(($planText -join ''), '[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}').Value.ToLowerInvariant()\nif (-not $plan -or $state.ACLineStatus -eq 255) { throw 'power state unknown' }\n[ordered]@{plan=$plan; overlay=$overlay.ToString(); acLineStatus=[int]$state.ACLineStatus; batterySaver=[int]$state.SystemStatusFlag} | ConvertTo-Json -Compress\n";
function powerPlan() {
  try {
    const raw = execFileSync("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", POWER_QUERY], { encoding: "utf8", windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
    const state = JSON.parse(raw);
    if (![0, 1].includes(state.acLineStatus) || !state.plan || !state.overlay) return null;
    return JSON.stringify(state);
  } catch { return null; }
}

function environment(powerStart) {
  return {
    node: process.version,
    v8: process.versions.v8,
    execArgv: process.execArgv,
    nodeOptionsPresent: Boolean(process.env.NODE_OPTIONS),
    lockfileSha256: sha256(readFileSync(resolve(ROOT, "package-lock.json"))),
    os: { platform: platform(), release: release(), arch: arch() },
    cpu: { model: cpus()[0]?.model ?? "unknown", count: cpus().length },
    powerPlanStart: powerStart,
  };
}

function makeInput(pattern, size) {
  const seed = Buffer.from(pattern, "utf8");
  const repeats = Math.floor(size / seed.length);
  const remainder = size - repeats * seed.length;
  return pattern.repeat(repeats) + "a".repeat(remainder);
}

function assertInput(text, expectedBytes, id) {
  if (Buffer.byteLength(text, "utf8") !== expectedBytes) throw new Error(`input size mismatch for ${id}`);
  if (Buffer.from(text, "utf8").toString("utf8") !== text) throw new Error(`UTF-8 roundtrip mismatch for ${id}`);
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && (index + 1 >= text.length || text.charCodeAt(index + 1) < 0xdc00 || text.charCodeAt(index + 1) > 0xdfff)) throw new Error(`dangling high surrogate for ${id}`);
    if (code >= 0xdc00 && code <= 0xdfff && (index === 0 || text.charCodeAt(index - 1) < 0xd800 || text.charCodeAt(index - 1) > 0xdbff)) throw new Error(`dangling low surrogate for ${id}`);
  }
}

function measure(estimator, text, batch) {
  const start = now();
  let result = 0;
  for (let index = 0; index < batch; index++) result += estimator(text);
  const elapsedNs = Number(now() - start);
  if (!Number.isFinite(result)) throw new Error("estimator returned a non-finite value");
  if (!Number.isFinite(elapsedNs) || elapsedNs <= 0) throw new InconclusiveError("non-positive or invalid timing sample");
  return { elapsedNs, result };
}

function runPair(a, b, text, batch, block, sample, order, warmup = false, expectedA = undefined, expectedB = undefined) {
  const values = {};
  for (const variant of order) values[variant] = measure(variant === "A" ? a : b, text, batch);
  if (expectedA !== undefined && (values.A.result !== expectedA || values.B.result !== expectedB)) throw new Error("estimator checksum mismatch");
  return { block, sample, order, warmup, A: values.A.elapsedNs, B: values.B.elapsedNs, checksumA: values.A.result, checksumB: values.B.result };
}

function summarizePair(aValues, bValues) {
  if (aValues.some((value) => !Number.isFinite(value) || value <= 0) || bValues.some((value) => !Number.isFinite(value) || value <= 0)) throw new InconclusiveError("non-positive or invalid timing sample");
  const p95A = nearestP95(aValues);
  const p95B = nearestP95(bValues);
  return {
    count: aValues.length,
    medianA: median(aValues),
    medianB: median(bValues),
    medianRatio: ratio(median(bValues), median(aValues)),
    p95A,
    p95B,
    p95Ratio: ratio(p95B, p95A),
  };
}

function strata(samples) {
  const result = {};
  for (const order of ["AB", "BA"]) {
    const subset = samples.filter((sample) => sample.order === order && !sample.warmup);
    result[order] = summarizePair(subset.map((sample) => sample.A), subset.map((sample) => sample.B));
  }
  return result;
}

function summarizeControl(samples) {
  const values = samples.filter((sample) => !sample.warmup);
  const aValues = values.map((sample) => sample.A);
  const bValues = values.map((sample) => sample.B);
  if (aValues.some((value) => !Number.isFinite(value) || value <= 0) || bValues.some((value) => !Number.isFinite(value) || value <= 0)) throw new InconclusiveError("non-positive or invalid A/A timing sample");
  return {
    count: values.length,
    medianAbsoluteDeviation: Math.abs(ratio(median(bValues), median(aValues)) - 1),
    p95AbsoluteDeviation: Math.abs(ratio(nearestP95(bValues), nearestP95(aValues)) - 1),
  };
}

function summarizeSamples(samples, control) {
  const measured = samples.filter((sample) => !sample.warmup);
  if (measured.length !== 360 || control.filter((sample) => !sample.warmup).length !== 360) throw new InconclusiveError("expected 360 A/B and 360 A/A samples");
  const pooled360 = summarizePair(measured.map((sample) => sample.A), measured.map((sample) => sample.B));
  const strata180 = strata(samples);
  if (strata180.AB.count !== 180 || strata180.BA.count !== 180) throw new InconclusiveError("expected 180 AB and 180 BA samples");
  const controlAA = summarizeControl(control);
  if (![pooled360.medianRatio, pooled360.p95Ratio, strata180.AB.medianRatio, strata180.BA.medianRatio, controlAA.medianAbsoluteDeviation, controlAA.p95AbsoluteDeviation].every(Number.isFinite)) throw new InconclusiveError("non-finite performance ratio");
  return {
    pooled360,
    strata180,
    controlAA,
    thresholds: THRESHOLDS,
    acceptance: {
      medianRatio: pooled360.medianRatio <= THRESHOLDS.medianRatio,
      p95Ratio: pooled360.p95Ratio <= THRESHOLDS.p95Ratio,
      strataMedianRatio: Object.values(strata180).every((value) => value.medianRatio <= THRESHOLDS.strataMedianRatio),
      aaBound: controlAA.medianAbsoluteDeviation <= THRESHOLDS.aaMedianDeviation && controlAA.p95AbsoluteDeviation <= THRESHOLDS.aaP95Deviation,
    },
  };
}

function writeCheckpoint(fd, report) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + EOL, "utf8");
  // The output file is created with O_EXCL before timing starts. Checkpoints update
  // only this run's owned descriptor, so an existing result can never be replaced.
  writeSync(fd, bytes, 0, bytes.length, 0);
  require("node:fs").ftruncateSync(fd, bytes.length);
  fsyncSync(fd);
}

function syntheticSelfTest() {
  const synthetic = Array.from({ length: 360 }, (_, index) => ({
    block: Math.floor(index / 60), sample: index % 60, order: ORDERS[Math.floor(index / 60)], warmup: false,
    A: 100 + (index % 5), B: 102 + (index % 5),
  }));
  const summary = summarizeSamples(synthetic, synthetic.map((sample) => ({ ...sample, B: sample.A })));
  if (summary.pooled360.count !== 360 || summary.strata180.AB.count !== 180 || summary.strata180.BA.count !== 180) throw new Error("synthetic sample count invariant failed");
  if (summary.pooled360.medianRatio <= 1 || summary.pooled360.p95Ratio <= 1) throw new Error("synthetic ratio invariant failed");
  if (summary.controlAA.medianAbsoluteDeviation !== 0 || summary.controlAA.p95AbsoluteDeviation !== 0) throw new Error("synthetic A/A invariant failed");
  const known = summarizePair([1, 2, 3, 4], [2, 4, 6, 8]);
  if (known.medianRatio !== 2 || known.p95Ratio !== 2) throw new Error("known median/p95 invariant failed");
  const biased = summarizeControl([{ A: 100, B: 110, warmup: false }, { A: 100, B: 110, warmup: false }]);
  if (biased.medianAbsoluteDeviation <= THRESHOLDS.aaMedianDeviation) throw new Error("A/A aggregate deviation invariant failed");
  for (const invalid of [[NaN, 1], [Infinity, 1], [undefined, 1], [0, 1]]) {
    try { summarizePair(invalid, [1, 1]); throw new Error("invalid sample was accepted"); } catch (error) { if (!(error instanceof InconclusiveError)) throw error; }
  }
  const strataBias = summarizePair([1, 1], [1, 2]);
  if (strataBias.medianRatio <= 1) throw new Error("strata bias invariant failed");
  const biasedStrata = strata(Array.from({ length: 360 }, (_, index) => ({ order: index < 180 ? "AB" : "BA", warmup: false, A: 1, B: index < 180 ? 1 : 2 })));
  if (biasedStrata.AB.medianRatio !== 1 || biasedStrata.BA.medianRatio !== 2) throw new Error("strata-specific bias invariant failed");
  for (const [id, pattern] of TARGETS) for (const size of SIZES) assertInput(makeInput(pattern, size), size, `${id}/${size}`);
  const knownChecksums = { ascii: [256000, 256000], kana: [86000, 341000], hangul: [214000, 341000], astral: [128000, 128000], mixed: [187000, 256000] };
  for (const [id, pattern] of TARGETS) {
    const expected = expectedChecksums(id, pattern, 1024);
    if (expected.expectedA !== knownChecksums[id][0] || expected.expectedB !== knownChecksums[id][1]) throw new Error(`independent checksum invariant failed: ${id}`);
  }
  return { passed: true, mode: "self-test", syntheticSamples: 360, note: "no estimator or target-input timing executed" };
}

function run() {
  const prepared = prepare();
  const { provenance, base, current, a, b, aa, aa2, preparedInputs } = prepared;
  const powerStart = powerPlan();
  const report = {
    schema: "cjk-estimator-perf/v2",
    v1Reference: { path: "research/results/cjk-estimator-perf.json", sha256: "1ddcf612cd5e862b70441602d0d9b463e58cbe673279da4b62b42bb6f1b0b948", status: "INCONCLUSIVE", encoding: "raw-worktree-bytes" },
    preregistration: { units: 5, sizesBytes: SIZES, blocks: BLOCKS, warmups: WARMUPS, samples: SAMPLES, batches: BATCHES, orders: ORDERS, noRetries: true },
    source: {
      baseCommit: provenance.baseCommit, headAtRun: provenance.headAtRun, currentSourceState: provenance.currentSourceState,
      workingTreeStatusDigest: provenance.workingTreeStatusDigest,
      baseSourceSha256Raw: provenance.baseSourceSha256Raw, currentSourceSha256Raw: provenance.currentSourceSha256Raw,
      baseSourceSha256Normalized: provenance.baseSourceSha256Normalized, currentSourceSha256Normalized: provenance.currentSourceSha256Normalized,
      baseSourceBlob: provenance.baseSourceBlob, currentSourceBlob: provenance.currentSourceBlob,
      patchProof: provenance.patchProof, transpiler: base.settings,
      moduleOrigins: ["token-estimator.A.js", "token-estimator.B.js", "token-estimator.AA1.js", "token-estimator.AA2.js"],
      baseEmittedSha256: sha256(base.code), currentEmittedSha256: sha256(current.code),
    },
    environment: { ...environment(powerStart), requiredNode: REQUIRED_NODE, nodeVersionMatch: process.version === REQUIRED_NODE, powerStateEncoding: "canonical JSON of plan GUID, effective overlay GUID, AC line status and battery saver; checked at each block boundary" },
    preflightPowerState: prepared.initialPower,
    runnerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    runnerSha256Normalized: sha256(readFileSync(fileURLToPath(import.meta.url), "utf8").replace(/\r\n/gu, "\n")),
    runnerGitBlob: execFileSync("git", ["hash-object", "--", "research/src/cjk-estimator-perf.mjs"], { cwd: ROOT, encoding: "utf8", windowsHide: true }).trim(),
    inputGeneratorSha256: sha256(makeInput.toString()),
    units: [], status: "RUNNING", terminalRunningInterpretation: "FAIL (crash/OOM or incomplete checkpoint)", hasFailure: false, stopReasons: [],
  };
  report.inputs = preparedInputs.map(({ id, size, inputUtf8Sha256, patternSha256, expectedA, expectedB, expectedAA }) => ({ id, sizeBytes: size, inputUtf8Sha256, patternSha256, expectedA, expectedB, expectedAA }));
  const fd = openSync(OUTPUT_PATH, "wx");
  try {
    writeCheckpoint(fd, report);
    if (process.version !== REQUIRED_NODE) {
      report.status = "INCONCLUSIVE";
      report.stopReasons.push(`Node ${REQUIRED_NODE} required; found ${process.version}`);
    } else if (powerStart === null) {
      report.status = "INCONCLUSIVE";
      report.stopReasons.push("power plan unavailable before measurement");
    } else measurement: for (const [id] of TARGETS) {
      const unit = { id, patternSha256: report.inputs.find((input) => input.id === id).patternSha256, sizes: [] };
      report.units.push(unit);
      for (const size of SIZES) {
        const prepared = preparedInputs.find((input) => input.id === id && input.size === size);
        const text = prepared.text;
        const batch = BATCHES[size];
        const sizeRecord = { sizeBytes: size, inputUtf8Sha256: prepared.inputUtf8Sha256, batch, blocks: [] };
        unit.sizes.push(sizeRecord);
        for (let block = 0; block < BLOCKS; block++) {
          const order = ORDERS[block];
          const samples = [];
          const control = [];
          const blockRecord = { block, order, samples, controlSamples: control };
          const blockPowerStart = powerPlan();
          blockRecord.powerPlanStart = blockPowerStart;
          sizeRecord.blocks.push(blockRecord);
          writeCheckpoint(fd, report);
          if (blockPowerStart === null || blockPowerStart !== powerStart) throw new InconclusiveError("power plan unavailable or changed before block");
          for (let sample = 0; sample < WARMUPS; sample++) samples.push(runPair(a, b, text, batch, block, sample, order, true, prepared.expectedA, prepared.expectedB));
          for (let sample = 0; sample < SAMPLES; sample++) samples.push(runPair(a, b, text, batch, block, sample, order, false, prepared.expectedA, prepared.expectedB));
          for (let sample = 0; sample < WARMUPS; sample++) control.push(runPair(aa, aa2, text, batch, block, sample, order, true, prepared.expectedAA, prepared.expectedAA));
          for (let sample = 0; sample < SAMPLES; sample++) control.push(runPair(aa, aa2, text, batch, block, sample, order, false, prepared.expectedAA, prepared.expectedAA));
          const blockPowerEnd = powerPlan();
          blockRecord.powerPlanEnd = blockPowerEnd;
          if (blockPowerStart === null || blockPowerEnd === null || blockPowerStart !== blockPowerEnd) {
            report.status = report.hasFailure ? "FAIL" : "INCONCLUSIVE";
            report.stopReasons.push(`${id}/${size}/block-${block}: power plan unavailable or changed`);
          }
          writeCheckpoint(fd, report);
          if (report.status !== "RUNNING") break measurement;
        }
        const samples = sizeRecord.blocks.flatMap((block) => block.samples);
        const control = sizeRecord.blocks.flatMap((block) => block.controlSamples);
        sizeRecord.summary = summarizeSamples(samples, control);
        sizeRecord.verdict = !sizeRecord.summary.acceptance.aaBound ? "INCONCLUSIVE" : Object.values(sizeRecord.summary.acceptance).every(Boolean) ? "PASS" : "FAIL";
        writeCheckpoint(fd, report);
        if (sizeRecord.verdict === "FAIL") { report.hasFailure = true; report.stopReasons.push(`${id}/${size}: performance threshold failed`); }
        if (sizeRecord.verdict === "INCONCLUSIVE") {
          report.status = report.hasFailure ? "FAIL" : "INCONCLUSIVE";
          report.stopReasons.push(`${id}/${size}: A/A control bound exceeded after fully sampling the first failing input size`);
          writeCheckpoint(fd, report);
          break measurement;
        }
      }
    }
    const powerEnd = powerPlan();
    report.environment.powerPlanEnd = powerEnd;
    report.environment.powerPlanChanged = powerStart !== null && powerEnd !== null && powerStart !== powerEnd;
    if (powerStart === null || powerEnd === null || report.environment.powerPlanChanged) {
      report.status = report.hasFailure ? "FAIL" : "INCONCLUSIVE";
      report.stopReasons.push(powerStart === null || powerEnd === null ? "power plan unavailable" : "power plan changed during measurement");
    } else if (report.status === "RUNNING") {
      report.status = report.stopReasons.length ? "FAIL" : "PASS";
    }
    writeCheckpoint(fd, report);
  } catch (error) {
    report.status = error instanceof InconclusiveError && !report.hasFailure ? "INCONCLUSIVE" : "FAIL";
    report.error = (error instanceof Error ? error.message : String(error)).replaceAll(ROOT, "<repo>").replaceAll(ROOT.replaceAll("/", "\\"), "<repo>").replaceAll(homedir(), "<home>");
    report.stopReasons.push(report.error);
    report.environment.powerPlanEnd = powerPlan();
    report.environment.powerPlanChanged = report.environment.powerPlanEnd === null || report.environment.powerPlanStart !== report.environment.powerPlanEnd;
    try { writeCheckpoint(fd, report); } catch { /* preserve the original failure */ }
  } finally {
    closeSync(fd);
  }
  return report;
}

if (process.argv.includes("--self-test")) {
  const prepared = prepare();
  process.stdout.write(JSON.stringify({ ...syntheticSelfTest(), pipeline: { passed: true, transpiler: prepared.base.settings, emittedParity: true, functional: true } }) + EOL);
} else if (process.argv.includes("--preflight")) {
  const prepared = prepare();
  process.stdout.write(JSON.stringify({ passed: true, mode: "preflight", powerState: prepared.initialPower, source: { base: prepared.provenance.baseCommit, headAtRun: prepared.provenance.headAtRun }, inputs: prepared.preparedInputs.map(({ id, size, inputUtf8Sha256 }) => ({ id, sizeBytes: size, inputUtf8Sha256 })), note: "no output artifact created and no timing executed" }) + EOL);
} else {
  const result = run();
  process.stdout.write(JSON.stringify(result, null, 2) + EOL);
  if (result.status !== "PASS") process.exitCode = 1;
}
