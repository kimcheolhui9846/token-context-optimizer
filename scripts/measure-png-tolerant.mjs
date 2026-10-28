import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import { deflateSync } from "node:zlib";
import { decode } from "fast-png";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const evidenceDir = resolve(root, "docs/research/evidence/n19");
const workDir = resolve(root, ".artifacts/n19/measurement");
const baselineCommit = "4b67d72";
const maxBytes = 10 * 1024 * 1024;
const width = 4096;
const height = 4096;
const cropRegion = { x: 0, y: 0, width: 1536, height: 1536 };
const sampleCount = 9;
const warmups = 3;
const nodeRequire = createRequire(import.meta.url);

function help() {
  process.stdout.write("usage: node --expose-gc scripts/measure-png-tolerant.mjs [--prepare-only]\n" +
    "  --prepare-only  validate sources, compilation, and deterministic PNG inputs; do not time operations\n");
}
if (process.argv.includes("--help")) { help(); process.exit(0); }
const prepareOnly = process.argv.includes("--prepare-only");
if (!prepareOnly && typeof global.gc !== "function") throw new Error("global.gc unavailable; run with --expose-gc");
if (process.argv.some((arg) => arg.startsWith("--") && arg !== "--prepare-only")) throw new Error("unknown option");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const sourceFiles = (sourceKind) => (sourceKind === "current"
  ? git(["ls-files", "src/core"])
  : git(["ls-tree", "-r", "--name-only", baselineCommit, "src/core"]))
  .split(/\r?\n/u).filter(Boolean).filter((p) => p.endsWith(".ts"));
const baselineBytes = (path) => Buffer.from(execFileSync("git", ["show", `${baselineCommit}:${path}`], { cwd: root, windowsHide: true }));
const normalizeLf = (bytes) => Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"), "utf8");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); typeBytes.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}
function makePng({ rgba = false, ancillary = 0, zeroChunks = 0, iccpBytes = 0, widthValue = width, heightValue = height } = {}) {
  const channels = rgba ? 4 : 3;
  const row = Buffer.alloc(widthValue * channels + 1);
  row[0] = 0;
  for (let x = 0; x < widthValue; x += 1) { row[1 + x * channels] = x & 255; row[2 + x * channels] = (x * 13) & 255; row[3 + x * channels] = 97; if (rgba) row[4 + x * channels] = 255; }
  const raw = Buffer.alloc(row.length * heightValue);
  for (let y = 0; y < heightValue; y += 1) row.copy(raw, y * row.length);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(widthValue, 0); ihdr.writeUInt32BE(heightValue, 4); ihdr[8] = 8; ihdr[9] = rgba ? 6 : 2;
  const idat = chunk("IDAT", deflateSync(raw, { level: 9 }));
  const ancillaryChunks = [];
  for (let i = 0; i < ancillary; i += 1) ancillaryChunks.push(chunk(String.fromCharCode(97 + (i % 26), 65 + (i % 26), 88, 88), Buffer.alloc(0)));
  for (let i = 0; i < zeroChunks; i += 1) ancillaryChunks.push(chunk("caBX", Buffer.alloc(0)));
  if (iccpBytes) {
    const profile = deflateSync(Buffer.alloc(iccpBytes, 0x52));
    ancillaryChunks.push(chunk("iCCP", Buffer.concat([Buffer.from("profile\0\0", "binary"), profile])));
  }
  const output = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), ...ancillaryChunks, idat, chunk("IEND", Buffer.alloc(0))]);
  if (output.length > maxBytes) throw new Error(`generated PNG exceeds limit: ${output.length}`);
  return output;
}

function makeWorstPng() {
  const core = makePng({ widthValue: 1, heightValue: 1 });
  const coreLength = core.length;
  const zeroChunks = Math.floor((maxBytes - coreLength) / 12);
  const output = makePng({ zeroChunks, widthValue: 1, heightValue: 1 });
  return { output, coreLength, zeroChunks };
}

function scriptLocalCoreCopy(bytes) {
  const parts = [bytes.subarray(0, 8)];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR" || type === "IDAT" || type === "IEND") parts.push(bytes.subarray(offset, offset + length + 12));
    offset += length + 12;
  }
  const copied = Buffer.concat(parts);
  return copied;
}

function compileVariant(name, sourceKind) {
  const variantRoot = resolve(workDir, "compiled", name);
  mkdirSync(resolve(variantRoot, "src/core"), { recursive: true });
  writeFileSync(resolve(variantRoot, "package.json"), "{\"type\":\"commonjs\"}\n", { flag: "w" });
  const files = sourceFiles(sourceKind);
  const hashes = {};
  const normalizedHashes = {};
  const compiledHashes = {};
  for (const path of files) {
    const bytes = sourceKind === "current" ? readFileSync(resolve(root, path)) : baselineBytes(path);
    hashes[path] = { sha256: sha256(bytes), basis: sourceKind === "current" ? "worktree" : "git-blob", bytes: bytes.length };
    normalizedHashes[path] = { sha256: sha256(normalizeLf(bytes)), basis: "lf-normalized", bytes: normalizeLf(bytes).length };
    const out = resolve(variantRoot, path.replace(/^src[\\/]/u, "").replace(/\.ts$/u, ".js"));
    mkdirSync(dirname(out), { recursive: true });
    const js = ts.transpileModule(bytes.toString("utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    writeFileSync(out, js, { flag: "w" });
    compiledHashes[path] = { sha256: sha256(Buffer.from(js)), bytes: Buffer.byteLength(js) };
  }
  const entry = nodeRequire(resolve(variantRoot, "core", "image-artifacts.js"));
  const crop = nodeRequire(resolve(variantRoot, "core", "image-crop.js"));
  const sourceBytes = files.map((p) => sourceKind === "current" ? readFileSync(resolve(root, p)) : baselineBytes(p));
  return { entry, crop, hashes, normalizedHashes, compiledHashes,
    sourceSha256: sha256(Buffer.concat(sourceBytes)),
    sourceSha256LfNormalized: sha256(Buffer.concat(sourceBytes.map(normalizeLf))),
    compiledSha256: sha256(Buffer.concat(files.map((p) => readFileSync(resolve(variantRoot, p.replace(/^src[\\/]/u, "").replace(/\.ts$/u, ".js"))))) ) };
}

function writeExclusive(path, value) { if (existsSync(path)) throw new Error(`refusing to overwrite evidence: ${path}`); writeFileSync(path, value, { flag: "wx" }); }
mkdirSync(workDir, { recursive: true }); mkdirSync(evidenceDir, { recursive: true });
const timestamp = new Date().toISOString();
const outputPath = resolve(prepareOnly ? workDir : evidenceDir, `png-tolerant-${timestamp.replaceAll(":", "-")}.json`);
const inputPath = resolve(workDir, "input-rgb.png");
const tolerantPath = resolve(workDir, "input-tolerant-worst.png");
const rgbaPath = resolve(workDir, "input-rgba.png");
const rgbInput = makePng();
const worstInput = makeWorstPng();
writeFileSync(inputPath, rgbInput); writeFileSync(tolerantPath, worstInput.output); writeFileSync(rgbaPath, makePng({ rgba: true }));
const variants = {};
const report = { schema: "n19-png-tolerant-measurement/v1", status: "INCOMPLETE", measuredAt: timestamp, baselineCommit, method: { fixedOrder: ["A", "A'", "B"], samples: sampleCount, warmups, cropRegion, maxBytes, globalGcRequired: true, prepareOnly }, environment: { node: process.version, v8: process.versions.v8, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? null, gitHead: git(["rev-parse", "HEAD"]), gitStatus: git(["status", "--porcelain"]).split(/\r?\n/u).filter(Boolean) }, inputs: {}, variants: {}, strict: { index: [], crop: [] }, strictGate: { index: { status: "INCOMPLETE" }, crop: { status: "INCOMPLETE" }, status: "INCOMPLETE" }, tolerant: {}, failures: [] };
writeExclusive(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const save = () => writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
try {
  for (const [key, kind] of [["A", "baseline"], ["A'", "baseline"], ["B", "current"]]) { variants[key] = compileVariant(key === "A'" ? "A-copy" : key, kind); report.variants[key] = { sourceSha256: variants[key].sourceSha256, sourceSha256LfNormalized: variants[key].sourceSha256LfNormalized, compiledSha256: variants[key].compiledSha256, files: variants[key].hashes, normalizedFiles: variants[key].normalizedHashes, compiledFiles: variants[key].compiledHashes, basis: kind === "current" ? "worktree" : "git-blob", compiledRoot: resolve(workDir, "compiled", key === "A'" ? "A-copy" : key) }; }
  if (variants.A.compiledSha256 !== variants["A'"].compiledSha256 || JSON.stringify(variants.A.compiledHashes) !== JSON.stringify(variants["A'"].compiledHashes)) throw new Error("A/A' compiled outputs differ");
  report.inputs = { rgb: { path: inputPath, sha256: sha256(readFileSync(inputPath)), bytes: readFileSync(inputPath).length, width, height, channels: 3 }, tolerant: { path: tolerantPath, sha256: sha256(readFileSync(tolerantPath)), bytes: readFileSync(tolerantPath).length, ancillaryCount: worstInput.zeroChunks, coreBytes: worstInput.coreLength, chunkType: "caBX", chunkLength: 0 }, rgba: { path: rgbaPath, sha256: sha256(readFileSync(rgbaPath)), bytes: readFileSync(rgbaPath).length, width, height, channels: 4 } };
  report.environment.scriptSha256 = sha256(readFileSync(resolve(here, "measure-png-tolerant.mjs")));
  report.environment.childScriptSha256 = sha256(readFileSync(resolve(here, "measure-png-tolerant-child.mjs")));
  const lockPath = resolve(root, "package-lock.json");
  report.environment.packageLockSha256 = existsSync(lockPath) ? sha256(readFileSync(lockPath)) : null;
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const packageNames = ["fast-png", "jpeg-js", "typescript", "zod", "vitest", "esbuild"];
    report.environment.dependencies = Object.fromEntries(packageNames.map((name) => [name, lock.packages?.[`node_modules/${name}`]?.version ?? null]));
  }
  const iccp = resolve(workDir, "input-iccp.png");
  writeFileSync(iccp, makePng({ iccpBytes: 64 * 1024 * 1024 }));
  const prepareSmoke = async () => {
    const strictSmoke = {};
    for (const key of ["A", "A'", "B"]) {
      const api = variants[key]; const store = new api.entry.MemoryImageArtifactStore();
      const indexed = await api.entry.indexImageArtifact({ path: inputPath, allowedRoots: [workDir], store });
      const cropped = await api.crop.cropImageArtifact({ artifactId: indexed.artifactId, region: cropRegion, allowedRoots: [workDir], store });
      if (cropped.status !== "cropped" || cropped.output.width !== 1536 || cropped.output.height !== 1536) throw new Error("prepare crop shape mismatch");
      strictSmoke[key] = { index: { profile: indexed.validationProfile, alpha: indexed.alpha, channels: indexed.channels, width: indexed.width, height: indexed.height }, crop: { width: cropped.output.width, height: cropped.output.height, sha256: sha256(JSON.stringify(cropped)) } };
    }
    if (JSON.stringify(strictSmoke.A) !== JSON.stringify(strictSmoke["A'"]) || strictSmoke.A.crop.sha256 !== strictSmoke.B.crop.sha256) throw new Error("prepare strict output mismatch");
    const store = new variants.B.entry.MemoryImageArtifactStore();
    const rgba = await variants.B.entry.indexImageArtifact({ path: rgbaPath, allowedRoots: [workDir], store, profile: "tolerant" });
    const worst = await variants.B.entry.indexImageArtifact({ path: tolerantPath, allowedRoots: [workDir], store, profile: "tolerant" });
    report.prepare = { strict: strictSmoke, tolerant: { rgba: { validationProfile: rgba.validationProfile, alpha: rgba.alpha, channels: rgba.channels }, worst: { validationProfile: worst.validationProfile, ignoredChunks: worst.ignoredChunks?.length ?? 0 } } };
    if (rgba.validationProfile !== "png-rgb8-tolerant-v1" || rgba.alpha !== "opaque" || rgba.channels !== 4 || worst.validationProfile !== "png-rgb8-tolerant-v1" || JSON.stringify(worst.ignoredChunks) !== '["caBX"]') throw new Error("prepare tolerant validation failed");
    const child = (path) => spawnSync(process.execPath, [resolve(here, "measure-png-tolerant-child.mjs"), report.variants.B.compiledRoot, path, "--prepare-only"], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
    report.prepare.child = [child(inputPath), child(iccp)].map((r) => ({ status: r.status, stdout: r.stdout, stderr: r.stderr }));
    if (report.prepare.child.some((r) => r.status !== 0)) throw new Error("prepare child probe failed");
  };
  if (prepareOnly) { await prepareSmoke(); report.status = "PREPARE_ONLY"; save(); process.stdout.write(`${JSON.stringify({ file: outputPath, status: report.status })}\n`); process.exit(0); }
  const order = ["A", "A'", "B"];
  const median = (values) => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
  for (const op of ["index", "crop"]) {
    const indexed = {};
    for (const key of order) {
      const api = variants[key]; const store = new api.entry.MemoryImageArtifactStore();
      const seed = await api.entry.indexImageArtifact({ path: inputPath, allowedRoots: [workDir], store });
      indexed[key] = { api, store, artifactId: seed.artifactId };
      for (let i = 0; i < warmups; i += 1) {
        if (op === "index") await api.entry.indexImageArtifact({ path: inputPath, allowedRoots: [workDir], store });
        else await api.crop.cropImageArtifact({ artifactId: seed.artifactId, region: cropRegion, allowedRoots: [workDir], store });
      }
    }
    const rows = Object.fromEntries(order.map((key) => [key, { samples: [], outputHashes: [] }]));
    for (let i = 0; i < sampleCount; i += 1) for (const key of order) {
      const { api, store } = indexed[key]; if (global.gc) global.gc();
      const started = process.hrtime.bigint();
      const value = op === "index"
        ? await api.entry.indexImageArtifact({ path: inputPath, allowedRoots: [workDir], store })
        : await api.crop.cropImageArtifact({ artifactId: indexed[key].artifactId, region: cropRegion, allowedRoots: [workDir], store });
      const elapsedNs = Number(process.hrtime.bigint() - started);
      rows[key].samples.push({ index: i, elapsedNs }); rows[key].outputHashes.push(sha256(JSON.stringify(value)));
      report.strict[op] = order.map((variant) => ({ variant, samples: rows[variant].samples })); save();
    }
    report.strict[op] = order.map((key) => ({ variant: key, samples: rows[key].samples, medianNs: median(rows[key].samples.map((s) => s.elapsedNs)), outputSha256: rows[key].outputHashes.at(-1) }));
    const baseline = report.strict[op][0].medianNs; report.strict[op].forEach((row) => { row.ratioToA = row.medianNs / baseline; });
    const aaRatio = report.strict[op][1].ratioToA;
    if (aaRatio < 0.97 || aaRatio > 1.03) {
      report.strictGate[op] = { status: "INVALID", ratio: aaRatio };
      report.strictGate.status = "INVALID";
      throw new Error(`${op} A'/A ratio invalid: ${aaRatio}`);
    }
    if (report.strict[op][2].ratioToA > 1.03) {
      report.strictGate[op] = { status: "FAIL", ratio: report.strict[op][2].ratioToA };
      report.strictGate.status = "FAIL";
      throw new Error(`${op} B/A ratio failed: ${report.strict[op][2].ratioToA}`);
    }
    if (JSON.stringify(rows.A.outputHashes) !== JSON.stringify(rows["A'"].outputHashes) || JSON.stringify(rows.A.outputHashes) !== JSON.stringify(rows.B.outputHashes)) {
      report.strictGate[op] = { status: "FAIL", reason: "output_mismatch" };
      report.strictGate.status = "FAIL";
      throw new Error(`${op} output mismatch`);
    }
    report.strictGate[op] = { status: "PASS" };
    save();
  }
  report.strictGate.status = "PASS";
  save();
  const tolerant = variants.B.entry;
  const rgbaBytes = readFileSync(rgbaPath);
  const worstBytes = readFileSync(tolerantPath);
  const rgbaDecoded = decode(rgbaBytes);
  report.tolerant = { note: "indexSamples are product tolerant-index calls; coreCopySamples and alphaScanSamples are script-local diagnostics" };
  const tolerantSamples = async (key, path, bytes) => {
    const store = new tolerant.MemoryImageArtifactStore(); const indexSamples = []; const copySamples = [];
    report.tolerant[key] = { input: report.inputs[key === "worst" ? "tolerant" : key], indexSamples, coreCopySamples: copySamples };
    for (let i = 0; i < sampleCount; i += 1) {
      if (global.gc) global.gc(); const started = process.hrtime.bigint();
      const value = await tolerant.indexImageArtifact({ path, allowedRoots: [workDir], store, profile: "tolerant" });
      indexSamples.push({ index: i, elapsedNs: Number(process.hrtime.bigint() - started), output: { alpha: value.alpha, channels: value.channels, width: value.width, height: value.height } });
      if (global.gc) global.gc(); const copyStarted = process.hrtime.bigint(); const copied = scriptLocalCoreCopy(bytes);
      const elapsedNs = Number(process.hrtime.bigint() - copyStarted);
      copySamples.push({ index: i, elapsedNs, copiedBytes: copied.length, sha256: sha256(copied) });
      save();
    }
    return { indexSamples, coreCopySamples: copySamples };
  };
  await tolerantSamples("rgba", rgbaPath, rgbaBytes);
  await tolerantSamples("worst", tolerantPath, worstBytes);
  const alphaSamples = [];
  report.tolerant.rgba.alphaScanSamples = alphaSamples;
  for (let i = 0; i < sampleCount; i += 1) { if (global.gc) global.gc(); const started = process.hrtime.bigint(); let opaque = true; for (let offset = 3; offset < rgbaDecoded.data.length; offset += 4) if (rgbaDecoded.data[offset] !== 255) { opaque = false; break; } alphaSamples.push({ index: i, elapsedNs: Number(process.hrtime.bigint() - started), opaque, pixels: rgbaDecoded.width * rgbaDecoded.height }); }
  save();
  const child = (path) => { const r = spawnSync(process.execPath, [resolve(here, "measure-png-tolerant-child.mjs"), report.variants.B.compiledRoot, path], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 }); const result = (r.stdout ?? "").split(/\r?\n/u).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).find(Boolean); if (r.status !== 0 || !result) throw new Error(`child probe failed for ${path}: ${r.stderr ?? ""}`); return { status: r.status, result, stderr: r.stderr }; };
  const pixelChild = child(inputPath); const iccpChild = child(iccp);
  report.tolerant.iccp = { pixelPng: pixelChild, iccpPng: iccpChild, rssDeltaBytes: iccpChild.result.maxRssBytes - pixelChild.result.maxRssBytes, note: "child imports isolated compiled B and tolerant-indexes completed files; the parent generates the iCCP input" };
  report.status = "PASS"; save(); process.stdout.write(`${JSON.stringify({ file: outputPath, status: report.status })}\n`);
} catch (error) { const message = error instanceof Error ? error.message : String(error); if (report.strictGate?.status === "PASS") { report.tolerant.errors = [...(report.tolerant.errors ?? []), { message }]; report.status = "INCOMPLETE"; save(); process.exitCode = 1; } else { report.status = /ratio invalid/u.test(message) ? "INVALID" : "FAIL"; report.failures.push({ message }); save(); throw error; } }
