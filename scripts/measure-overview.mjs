import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, arch, platform, release } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import jpeg from "jpeg-js";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const workDir = resolve(root, ".artifacts/overview-impl/measurement");
const evidenceDir = resolve(root, "docs/research/evidence/wbs-6.12b");
const baselineCommit = "888f052";
const warmups = 3;
const samples = 9;
const maxBytes = 10 * 1024 * 1024;
const require = createRequire(import.meta.url);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const now = () => new Date().toISOString();
const timed = async (fn) => {
  const started = process.hrtime.bigint();
  const value = await fn();
  return { value, elapsedNs: Number(process.hrtime.bigint() - started) };
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const safeMessage = (error) => (error instanceof Error ? error.message : String(error)).replaceAll(root, "<worktree>");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0); typeBytes.copy(output, 4); data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}
function makePng({ width, height, rgba }) {
  const channels = rgba ? 4 : 3;
  const row = Buffer.alloc(1 + width * channels); row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    row[1 + x * channels] = x & 255;
    row[2 + x * channels] = (x * 13) & 255;
    row[3 + x * channels] = 97;
    if (rgba) row[4 + x * channels] = 255;
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) row.copy(raw, y * row.length);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = rgba ? 6 : 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

function compileCore() {
  const compiledRoot = resolve(workDir, "compiled");
  mkdirSync(resolve(compiledRoot, "core"), { recursive: true });
  writeFileSync(resolve(compiledRoot, "package.json"), '{"type":"commonjs"}\n');
  const tracked = git(["ls-files", "src/core"]).split(/\r?\n/u).filter((path) => path.endsWith(".ts"));
  const files = [...new Set([...tracked, "src/core/image-overview.ts"].filter((path) => existsSync(resolve(root, path))))];
  const fileHashes = {};
  const compiledHashes = {};
  const baselineHashes = {};
  for (const path of files) {
    const source = readFileSync(resolve(root, path));
    fileHashes[path] = { sha256: sha256(source), bytes: source.length, basis: "worktree" };
    try { const baseline = execFileSync("git", ["show", `${baselineCommit}:${path}`], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }); baselineHashes[path] = { sha256: sha256(baseline), bytes: baseline.length, basis: "git-blob" }; }
    catch { baselineHashes[path] = { sha256: null, bytes: null, basis: "absent-at-baseline" }; }
    const output = resolve(compiledRoot, path.replace(/^src[\\/]/u, "").replace(/\.ts$/u, ".js"));
    mkdirSync(dirname(output), { recursive: true });
    const javascript = ts.transpileModule(source.toString("utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    writeFileSync(output, javascript);
    compiledHashes[path] = { sha256: sha256(Buffer.from(javascript)), bytes: Buffer.byteLength(javascript), basis: "temporary-transpile" };
  }
  return {
    root: compiledRoot,
    files: fileHashes, baselineFiles: baselineHashes, compiledFiles: compiledHashes,
    sourceSha256: sha256(Buffer.concat(files.map((path) => readFileSync(resolve(root, path))))),
    overview: require(resolve(compiledRoot, "core", "image-overview.js")),
    artifacts: require(resolve(compiledRoot, "core", "image-artifacts.js")),
    jpegValidation: require(resolve(compiledRoot, "core", "jpeg-validation.js")),
  };
}

function prepareInputs() {
  mkdirSync(workDir, { recursive: true });
  const cases = [
    ["wide-rgb", 8192, 2048, false, 512, "strict"],
    ["square-rgba-opaque", 4096, 4096, true, 512, "tolerant"],
    ["horizontal-rgb", 8192, 1, false, 512, "strict"],
    ["vertical-rgb", 1, 8192, false, 512, "strict"],
    ["square-rgb", 1536, 1536, false, 1536, "strict"],
  ];
  return Object.fromEntries(cases.map(([name, width, height, rgba, caseMaxSide, profile]) => {
    const path = resolve(workDir, `${name}.png`);
    const bytes = makePng({ width, height, rgba });
    if (bytes.length > maxBytes) throw new Error(`${name} exceeds ${maxBytes} bytes: ${bytes.length}`);
    writeFileSync(path, bytes);
    return [name, { path, width, height, channels: rgba ? 4 : 3, bytes: bytes.length, sha256: sha256(bytes), maxSide: caseMaxSide, profile }];
  }));
}

function sharedCoreDiff() {
  const command = `git diff --exit-code ${baselineCommit} -- src/core/image-artifacts.ts src/core/image-crop.ts src/core/jpeg-validation.ts`;
  try {
    const stdout = git(["diff", "--exit-code", baselineCommit, "--", "src/core/image-artifacts.ts", "src/core/image-crop.ts", "src/core/jpeg-validation.ts"]);
    return { command, exit: 0, status: "PASS", stdout };
  } catch (error) {
    return { command, exit: error.status ?? 1, status: "CHANGED", stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

async function main() {
  const prepareOnly = process.argv.includes("--prepare-only");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--prepare-only");
  if (unknown.length) throw new Error(`unknown option: ${unknown.join(", ")}`);
  if (!prepareOnly && typeof global.gc !== "function") throw new Error("global.gc unavailable; run with --expose-gc");
  const sharedCore = sharedCoreDiff();
  if (sharedCore.status !== "PASS") throw new Error(`shared core changed relative to ${baselineCommit}; refusing timing`);
  mkdirSync(workDir, { recursive: true }); mkdirSync(evidenceDir, { recursive: true });
  const inputFiles = prepareInputs();
  const compiled = compileCore();
  const report = {
    schema: "wbs-6.12b-overview-measurement/v1", status: prepareOnly ? "PREPARE_ONLY" : "INCOMPLETE", measuredAt: now(),
    baselineCommit, method: { cases: 5, warmups, samples, maxSide: "per-case", fixedOrder: ["read-revalidate", "resample", "encode", "output-validation", "full-call"], globalGcRequired: true, stageProbes: "separate probes call real exported core helpers/dependencies; full-call is measured independently and is not treated as an in-call stage breakdown; temporary CommonJS transpilation only" },
    environment: { node: process.version, v8: process.versions.v8, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? null, gitHead: git(["rev-parse", "HEAD"]), gitStatus: git(["status", "--porcelain"]).split(/\r?\n/u).filter(Boolean), scriptSha256: sha256(readFileSync(resolve(here, "measure-overview.mjs"))), packageLockSha256: existsSync(resolve(root, "package-lock.json")) ? sha256(readFileSync(resolve(root, "package-lock.json"))) : null, dependencies: (() => { if (!existsSync(resolve(root, "package-lock.json"))) return {}; const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8")); return Object.fromEntries(["fast-png", "jpeg-js", "typescript", "zod", "vitest", "esbuild"].map((name) => [name, lock.packages?.[`node_modules/${name}`]?.version ?? null])); })() },
    inputs: Object.fromEntries(Object.entries(inputFiles).map(([name, input]) => [name, { ...input, path: relative(root, input.path) }])),
    source: { sha256: compiled.sourceSha256, files: compiled.files, baselineFiles: compiled.baselineFiles, compiledFiles: compiled.compiledFiles, basis: "worktree" },
    sharedCoreDiff: sharedCore,
    stages: {}, preparation: {}, failures: [], concerns: [],
  };
  const outputPath = resolve(prepareOnly ? workDir : evidenceDir, `overview-${report.measuredAt.replaceAll(":", "-")}.json`);
  if (existsSync(outputPath)) throw new Error(`refusing to overwrite evidence: ${outputPath}`);
  const save = () => writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  const { artifacts } = compiled;
  const prepare = async () => {
    for (const [name, input] of Object.entries(inputFiles)) {
      const store = new artifacts.MemoryImageArtifactStore();
      const indexed = await artifacts.indexImageArtifact({ path: input.path, allowedRoots: [workDir], store, profile: input.profile });
      if (indexed.width !== input.width || indexed.height !== input.height || indexed.channels !== input.channels) throw new Error(`${name} indexed dimensions/channels mismatch`);
      if (indexed.validationProfile !== (input.profile === "strict" ? "png-rgb8-static-v1" : "png-rgb8-tolerant-v1")) throw new Error(`${name} validation profile mismatch`);
      report.preparation[name] = { artifactId: indexed.artifactId, width: indexed.width, height: indexed.height, channels: indexed.channels, validationProfile: indexed.validationProfile, alpha: indexed.alpha ?? null, sha256: indexed.sha256, byteLength: indexed.byteLength };
    }
    save();
  };
  try { await prepare(); } catch (error) {
    report.status = "FAIL";
    report.failures.push({ phase: "prepare", message: safeMessage(error) });
    save();
    throw error;
  }
  if (prepareOnly) {
    report.status = "PREPARE_ONLY";
    save();
    process.stdout.write(`${JSON.stringify({ file: outputPath, status: report.status })}\n`);
    return;
  }
  try {
    const { overview, jpegValidation } = compiled;
    const jpegEncoder = jpeg;
    for (const [name, input] of Object.entries(inputFiles)) {
      const store = new artifacts.MemoryImageArtifactStore();
      const indexed = await artifacts.indexImageArtifact({ path: input.path, allowedRoots: [workDir], store, profile: input.profile });
      const longestSide = Math.max(input.width, input.height);
      const outputWidth = longestSide > input.maxSide ? Math.max(1, Math.round(input.width * input.maxSide / longestSide)) : input.width;
      const outputHeight = longestSide > input.maxSide ? Math.max(1, Math.round(input.height * input.maxSide / longestSide)) : input.height;
      const stageRows = Object.fromEntries(["read-revalidate", "resample", "encode", "output-validation", "full-call"].map((stage) => [stage, { samples: [], outputBytes: [], outputBase64Length: [], outputHashes: [], outputDimensions: [] }]));
      const measure = async (stage, fn, outputInfo) => {
        for (let i = 0; i < warmups; i += 1) await fn();
        for (let i = 0; i < samples; i += 1) {
          if (global.gc) global.gc();
          const result = await timed(fn); const row = stageRows[stage]; row.samples.push({ index: i, elapsedNs: result.elapsedNs });
          const info = outputInfo(result.value); row.outputBytes.push(info.bytes); row.outputBase64Length.push(info.base64Length); row.outputHashes.push(info.sha256 ?? null); row.outputDimensions.push(info.width === undefined ? null : { width: info.width, height: info.height });
        }
        const row = stageRows[stage]; row.medianNs = median(row.samples.map((sample) => sample.elapsedNs));
      };
      const pixelsResult = await artifacts.readValidatedImageArtifact(indexed, [workDir]);
      const pixels = pixelsResult.pixels;
      const rgba = overview.areaAverageRgba(pixels, indexed.width, indexed.height, indexed.channels, outputWidth, outputHeight);
      await measure("read-revalidate", () => artifacts.readValidatedImageArtifact(indexed, [workDir]), () => ({ bytes: input.bytes, base64Length: 0, sha256: indexed.sha256, width: indexed.width, height: indexed.height }));
      await measure("resample", () => overview.areaAverageRgba(pixels, indexed.width, indexed.height, indexed.channels, outputWidth, outputHeight), (value) => ({ bytes: value.length, base64Length: 0, sha256: sha256(value), width: outputWidth, height: outputHeight }));
      await measure("encode", () => jpegEncoder.encode({ data: rgba, width: outputWidth, height: outputHeight }, 75).data, (value) => ({ bytes: value.length, base64Length: Math.ceil(value.length / 3) * 4, sha256: sha256(value), width: outputWidth, height: outputHeight }));
      const encoded = jpegEncoder.encode({ data: rgba, width: outputWidth, height: outputHeight }, 75).data;
      await measure("output-validation", () => jpegValidation.validateJpeg(encoded), (value) => ({ bytes: encoded.length, base64Length: Math.ceil(encoded.length / 3) * 4, sha256: sha256(encoded), width: value.width, height: value.height }));
      await measure("full-call", () => overview.overviewImageArtifact({ artifactId: indexed.artifactId, maxSide: input.maxSide, allowedRoots: [workDir], store }), (value) => ({ bytes: value.output.byteLength, base64Length: value.output.image.length, sha256: value.output.sha256, width: value.output.width, height: value.output.height }));
      const encodeRow = stageRows.encode;
      const fullRow = stageRows["full-call"];
      if (encodeRow.outputHashes.some((hash, index) => hash !== fullRow.outputHashes[index] || encodeRow.outputBytes[index] !== fullRow.outputBytes[index] || encodeRow.outputBase64Length[index] !== fullRow.outputBase64Length[index])) throw new Error(`${name} encode/full-call output mismatch`);
      for (const [stage, row] of Object.entries(stageRows)) {
        if (row.outputDimensions.some((dimension) => dimension && (dimension.width !== outputWidth || dimension.height !== outputHeight)) && stage !== "read-revalidate") throw new Error(`${name} ${stage} output dimensions mismatch`);
        if (row.outputHashes.length > 1 && row.outputHashes.some((hash) => hash !== row.outputHashes[0])) throw new Error(`${name} ${stage} output hash mismatch across samples`);
      }
      report.stages[name] = { source: { artifactId: indexed.artifactId, width: indexed.width, height: indexed.height, channels: indexed.channels, validationProfile: indexed.validationProfile, alpha: indexed.alpha ?? null, sha256: indexed.sha256 }, requestedMaxSide: input.maxSide, profile: input.profile, output: { width: outputWidth, height: outputHeight }, timings: stageRows };
      save();
    }
    report.status = prepareOnly ? "PREPARE_ONLY" : "PASS";
    save();
    process.stdout.write(`${JSON.stringify({ file: outputPath, status: report.status })}\n`);
  } catch (error) {
    report.status = "FAIL"; report.failures.push({ message: safeMessage(error) }); save(); throw error;
  }
}
await main();
