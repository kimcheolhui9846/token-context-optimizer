import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encode as encodePng } from "fast-png";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = resolve(root, ".artifacts/jpeg-tolerant-impl/measurement/attempt2-v3");
const evidenceDir = resolve(root, "docs/research/evidence/wbs-6.12c");
const manifestPath = resolve(scratch, "prepared-manifest.json");
const sentinelPath = resolve(scratch, "measurement.once");
const reportPath = resolve(evidenceDir, "measurement-attempt2.json");
const baselineCommit = "6e6b016";
const baselineRoots = {
  A: resolve(root, ".artifacts/jpeg-tolerant-impl/baseline-a"),
  "A-prime": resolve(root, ".artifacts/jpeg-tolerant-impl/baseline-a-prime"),
  B: root,
};
const warmups = 3;
const rounds = 9;
const maxBytes = 10 * 1024 * 1024;
const cropRegion = { x: 0, y: 0, width: 1024, height: 768 };
const rssIntervalMs = 10;
const strictJpeg = { width: 2048, height: 1536, quality: 90, chromaSubsampling: "4:4:4" };
const strictPng = { width: 4096, height: 4096, channels: 3 };
const tolerantMatrix = [
  { name: "accounting-below-256mib-444", width: 4096, height: 3120, chromaSubsampling: "4:4:4", progressive: false, expected: "accepted" },
  { name: "accounting-above-256mib-444", width: 4096, height: 3128, chromaSubsampling: "4:4:4", progressive: false, expected: "jpeg_resource_limit" },
  { name: "baseline-4-2-0", width: 8192, height: 2048, chromaSubsampling: "4:2:0", progressive: false, expected: "accepted" },
  { name: "twelve-mp-4-2-0", width: 4032, height: 3024, chromaSubsampling: "4:2:0", progressive: false, expected: "accepted" },
  { name: "twelve-mp-progressive", width: 4032, height: 3024, chromaSubsampling: "4:2:0", progressive: true, expected: "accepted" },
  { name: "worst-10mib-app3-com", width: 16, height: 8, worstAncillary: true, expected: "accepted" },
];
const settings = { baselineCommit, warmups, rounds, maxBytes, cropRegion, rssIntervalMs, strictJpeg, strictPng, tolerantMatrix };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const rawGit = (args) => Buffer.from(execFileSync("git", args, { cwd: root, windowsHide: true }));
const normalizeLf = (bytes) => Buffer.from(bytes.toString("utf8").replace(/\r\n?/gu, "\n"));
const scriptHashes = () => ({
  parent: sha256(readFileSync(resolve(root, "scripts/measure-jpeg-tolerant.mjs"))),
  child: sha256(readFileSync(resolve(root, "scripts/measure-jpeg-tolerant-child.mjs"))),
});
const usage = "node --expose-gc scripts/measure-jpeg-tolerant.mjs --prepare --sharp-module <external-sharp-index.mjs> | --check | --measure";
const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
const modes = ["--prepare", "--check", "--measure"].filter((mode) => argv.includes(mode));
if (modes.length !== 1 || argv.some((arg) => arg.startsWith("--") && ![...modes, "--sharp-module"].includes(arg))) {
  throw new Error("choose exactly one explicit mode");
}
const mode = modes[0];
const sharpIndex = argv.indexOf("--sharp-module");
if (mode === "--prepare" ? sharpIndex < 0 || !argv[sharpIndex + 1] : sharpIndex >= 0) {
  throw new Error("--sharp-module is required only for --prepare");
}
if (mode === "--measure" && typeof global.gc !== "function") throw new Error("--measure requires --expose-gc");

function sourcePaths() {
  const baseline = git(["ls-tree", "-r", "--name-only", baselineCommit, "src/core"]).split(/\r?\n/u).filter((p) => p.endsWith(".ts")).sort();
  const current = git(["ls-files", "--", "src/core"]).split(/\r?\n/u).filter((p) => p.endsWith(".ts")).sort();
  if (JSON.stringify(baseline) !== JSON.stringify(current)) throw new Error("core source path set differs");
  return baseline;
}
function inventory(variant, paths) {
  const variantRoot = baselineRoots[variant];
  const source = {};
  const compiled = {};
  for (const path of paths) {
    const raw = readFileSync(resolve(variantRoot, path));
    const baseline = variant === "B" ? null : rawGit(["show", baselineCommit + ":" + path]);
    const normalized = sha256(normalizeLf(raw));
    if (baseline && normalized !== sha256(normalizeLf(baseline))) throw new Error("baseline source differs from commit");
    source[path] = { normalizedSha256: normalized, checkoutBytes: raw.length };
    const builtPath = resolve(variantRoot, "dist", path.replace(/\.ts$/u, ".js"));
    if (!existsSync(builtPath)) throw new Error("missing normally built core output");
    const built = readFileSync(builtPath);
    if (variant === "B" && statSync(builtPath).mtimeMs + 1000 < statSync(resolve(variantRoot, path)).mtimeMs) {
      throw new Error("B built output predates current source");
    }
    compiled[path.replace(/\.ts$/u, ".js")] = { sha256: sha256(built), bytes: built.length };
  }
  const lockBytes = readFileSync(resolve(variantRoot, "package-lock.json"));
  const lock = JSON.parse(lockBytes.toString("utf8"));
  return {
    source, compiled,
    sourceSha256: sha256(Buffer.from(JSON.stringify(source))),
    compiledSha256: sha256(Buffer.from(JSON.stringify(compiled))),
    lockSha256: sha256(lockBytes),
    versions: {
      jpegJs: lock.packages?.["node_modules/jpeg-js"]?.version ?? null,
      fastPng: lock.packages?.["node_modules/fast-png"]?.version ?? null,
    },
  };
}
function inventories() {
  const paths = sourcePaths();
  const all = Object.fromEntries(Object.keys(baselineRoots).map((name) => [name, inventory(name, paths)]));
  if (all.A.sourceSha256 !== all["A-prime"].sourceSha256 ||
      all.A.compiledSha256 !== all["A-prime"].compiledSha256 ||
      new Set(Object.values(all).map((value) => value.lockSha256)).size !== 1 ||
      new Set(Object.values(all).map((value) => JSON.stringify(value.versions))).size !== 1 ||
      all.A.versions.jpegJs !== "0.4.4") {
    throw new Error("baseline variants or dependencies differ");
  }
  const baselineValidator = readFileSync(resolve(baselineRoots.A, "src/core/jpeg-validation.ts"));
  const currentValidator = readFileSync(resolve(root, "src/core/jpeg-validation.ts"));
  if (!normalizeLf(currentValidator).subarray(0, normalizeLf(baselineValidator).length).equals(normalizeLf(baselineValidator))) {
    throw new Error("strict JPEG validator prefix changed");
  }
  return all;
}
function environment() {
  return {
    node: process.version, v8: process.versions.v8, platform: platform(), release: release(),
    arch: process.arch, cpuModel: cpus()[0]?.model ?? null,
    baselineCommit: git(["rev-parse", baselineCommit]),
    headCommit: git(["rev-parse", "HEAD"]),
    headDirty: git(["status", "--porcelain"]).length > 0,
    sourceHashBasis: "LF-normalized checkout bytes; A and A-prime also compared with baseline commit blobs",
    buildMethod: "npm.cmd run build; normal tsc ESM dist/src/core outputs",
  };
}
function seededRgb(width, height) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3;
      data[at] = x & 255; data[at + 1] = y & 255; data[at + 2] = (x + y) & 255;
    }
  }
  return data;
}
const jfif = Buffer.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 0, 0, 1, 0, 1, 0, 0]);
async function encodeJpeg(sharp, spec) {
  const encoded = Buffer.from(await sharp(seededRgb(spec.width, spec.height), {
    raw: { width: spec.width, height: spec.height, channels: 3 },
  }).jpeg({ quality: 90, chromaSubsampling: spec.chromaSubsampling, progressive: spec.progressive ?? false,
    optimiseCoding: true, force: true }).toBuffer());
  if (encoded[0] !== 0xff || encoded[1] !== 0xd8) throw new Error("encoder did not emit JPEG");
  return encoded[2] === 0xff && encoded[3] === 0xe0
    ? encoded : Buffer.concat([encoded.subarray(0, 2), jfif, encoded.subarray(2)]);
}
function worstAncillary() {
  const core = readFileSync(resolve(root, "tests/fixtures/jpeg-tolerant/hc-444-16x8-app0.jpg"));
  const sofOffset = core.indexOf(Buffer.from([0xff, 0xc0]));
  const sosOffset = core.indexOf(Buffer.from([0xff, 0xda]));
  if (sofOffset < 2 || sosOffset < sofOffset) throw new Error("worst-case JPEG core markers missing");
  const count = Math.floor((maxBytes - core.length) / 4);
  const segments = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i += 1) {
    const at = i * 4;
    segments[at] = 0xff; segments[at + 1] = i % 2 === 0 ? 0xe3 : 0xfe;
    segments[at + 2] = 0; segments[at + 3] = 2;
  }
  return {
    bytes: Buffer.concat([core.subarray(0, sofOffset), segments, core.subarray(sofOffset)]),
    details: { coreSha256: sha256(core), coreBytes: core.length, insertionBefore: "SOF0",
      segmentCount: count, app3Count: Math.ceil(count / 2), comCount: Math.floor(count / 2),
      remainingBytes: maxBytes - core.length - count * 4 },
  };
}
function estimate444(bytes) {
  let at = 2; let width = null; let height = null; let qDefinitions = 0; let dhtBytes = 0;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) throw new Error("accounting marker alignment failed");
    while (bytes[at] === 0xff) at += 1;
    const marker = bytes[at++];
    if (marker === 0xda) break;
    const length = bytes.readUInt16BE(at);
    if (length < 2 || at + length > bytes.length) throw new Error("accounting segment bounds failed");
    const payload = bytes.subarray(at + 2, at + length);
    at += length;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      height = payload.readUInt16BE(1); width = payload.readUInt16BE(3);
      if (payload[5] !== 3 || payload[7] !== 0x11 || payload[10] !== 0x11 || payload[13] !== 0x11) {
        throw new Error("boundary sample is not 4:4:4");
      }
    } else if (marker === 0xdb) {
      let p = 0;
      while (p < payload.length) {
        const precision = payload[p] >> 4;
        p += 1 + (precision === 0 ? 64 : 128);
        qDefinitions += 1;
      }
      if (p !== payload.length) throw new Error("accounting DQT bounds failed");
    } else if (marker === 0xc4) {
      let p = 0;
      while (p < payload.length) {
        p += 1;
        if (p + 16 > payload.length) throw new Error("accounting DHT bounds failed");
        let symbols = 0;
        for (let i = 0; i < 16; i += 1) symbols += payload[p + i];
        p += 16 + symbols;
        dhtBytes += 16 + symbols;
      }
      if (p !== payload.length) throw new Error("accounting DHT bounds failed");
    }
  }
  if (!width || !height) throw new Error("accounting SOF missing");
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  return { width, height, decoderBytes: width * height * 6 + 3 * 320 * blocks + 256 * qDefinitions + dhtBytes,
    dqtDefinitions: qDefinitions, dhtAllocationBytes: dhtBytes };
}
function inputEntry(file, bytes, width, height, expected, extra = {}) {
  if (bytes.length > maxBytes) throw new Error("prepared input exceeds 10 MiB");
  return { file: rel(resolve(scratch, file)), sha256: sha256(bytes), bytes: bytes.length,
    width, height, expected, ...extra };
}
function inputPath(entry) {
  const path = resolve(root, entry.file);
  if (!path.startsWith(scratch + sep)) throw new Error("prepared input leaves scratch");
  return path;
}
async function moduleFor(variant, name) {
  return import(pathToFileURL(resolve(baselineRoots[variant], "dist/src/core", name)).href);
}
async function prepare() {
  if (existsSync(manifestPath)) throw new Error("prepared manifest already exists");
  const variantInfo = inventories();
  const env = environment();
  const sharpPath = resolve(argv[argv.indexOf("--sharp-module") + 1]);
  if (sharpPath.startsWith(root + sep)) throw new Error("sharp module must be external scratch");
  const sharp = (await import(pathToFileURL(sharpPath).href)).default;
  const sharpVersion = sharp?.versions?.sharp ?? null;
  const vipsVersion = sharp?.versions?.vips ?? null;
  if (sharpVersion !== "0.35.4") throw new Error("unexpected sharp version");
  const aJpeg = await moduleFor("A", "jpeg-validation.js");
  const bJpeg = await moduleFor("B", "jpeg-validation.js");
  const payloads = {};
  const jpegBytes = await encodeJpeg(sharp, strictJpeg);
  const pngBytes = Buffer.from(encodePng({ ...strictPng, depth: 8,
    data: seededRgb(strictPng.width, strictPng.height) }));
  aJpeg.validateJpeg(jpegBytes);
  payloads.strictJpeg = { bytes: jpegBytes,
    entry: inputEntry("strict-2048x1536-444.jpg", jpegBytes, strictJpeg.width, strictJpeg.height, "accepted") };
  payloads.strictPng = { bytes: pngBytes,
    entry: inputEntry("strict-4096x4096-rgb.png", pngBytes, strictPng.width, strictPng.height, "accepted") };
  const tolerant = {};
  for (const spec of tolerantMatrix) {
    const made = spec.worstAncillary ? worstAncillary() : { bytes: await encodeJpeg(sharp, spec), details: {} };
    const bytes = made.bytes;
    const entry = inputEntry(spec.name + ".jpg", bytes, spec.width, spec.height, spec.expected, made.details);
    if (spec.name.startsWith("accounting-")) entry.accounting = estimate444(bytes);
    let result;
    try {
      const metadata = bJpeg.validateJpegTolerant(bytes);
      result = { status: "accepted", width: metadata.width, height: metadata.height,
        coding: metadata.coding, sampling: metadata.sampling };
    } catch (error) {
      result = { status: "rejected", code: typeof error?.code === "string" ? error.code : "unexpected_error" };
    }
    if (spec.expected === "accepted"
      ? result.status !== "accepted" || result.width !== spec.width || result.height !== spec.height
      : result.status !== "rejected" || result.code !== spec.expected) {
      throw new Error("tolerant preparation validation failed: " + spec.name);
    }
    entry.preparationValidation = result;
    tolerant[spec.name] = { bytes, entry };
  }
  const limit = 256 * 1024 * 1024;
  if (tolerant["accounting-below-256mib-444"].entry.accounting.decoderBytes > limit ||
      tolerant["accounting-above-256mib-444"].entry.accounting.decoderBytes <= limit) {
    throw new Error("accounting boundary dimensions are invalid");
  }
  mkdirSync(scratch, { recursive: true });
  for (const item of [payloads.strictJpeg, payloads.strictPng, ...Object.values(tolerant)]) {
    writeFileSync(inputPath(item.entry), item.bytes, { flag: "wx" });
  }
  const aImage = await moduleFor("A", "image-artifacts.js");
  const allowedRoots = [scratch];
  const strictJpegRecord = await aImage.indexImageArtifact({ path: inputPath(payloads.strictJpeg.entry), allowedRoots,
    store: new aImage.MemoryImageArtifactStore() });
  const strictPngRecord = await aImage.indexImageArtifact({ path: inputPath(payloads.strictPng.entry), allowedRoots,
    store: new aImage.MemoryImageArtifactStore() });
  if (strictJpegRecord.validationProfile !== "jpeg-ycbcr8-baseline-444-v1" ||
      strictPngRecord.validationProfile !== "png-rgb8-static-v1" ||
      strictJpegRecord.width !== strictJpeg.width || strictJpegRecord.height !== strictJpeg.height ||
      strictPngRecord.width !== strictPng.width || strictPngRecord.height !== strictPng.height) {
    throw new Error("strict preparation validation failed");
  }
  const manifest = {
    schema: "wbs-6.12c-prepared/v3", attempt: 2, performingAccount: "sol",
    settings, scriptHashes: scriptHashes(), environment: env,
    sharp: { version: sharpVersion, libvips: vipsVersion,
      rgbFormula: "R=x mod 256; G=y mod 256; B=(x+y) mod 256",
      jpegOptions: { quality: 90, optimiseCoding: true, force: true },
      pngEncoder: "fast-png; RGB8 IHDR/IDAT/IEND" },
    variants: variantInfo,
    inputs: { strictJpeg: payloads.strictJpeg.entry, strictPng: payloads.strictPng.entry,
      tolerant: Object.fromEntries(Object.entries(tolerant).map(([name, value]) => [name, value.entry])) },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: "PREPARED", manifest: rel(manifestPath), inputs: 8 }));
}
function check() {
  if (!existsSync(manifestPath)) throw new Error("prepared manifest missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== "wbs-6.12c-prepared/v3" || manifest.attempt !== 2 ||
      JSON.stringify(manifest.settings) !== JSON.stringify(settings) ||
      JSON.stringify(manifest.scriptHashes) !== JSON.stringify(scriptHashes()) ||
      JSON.stringify(manifest.variants) !== JSON.stringify(inventories()) ||
      manifest.environment.node !== process.version ||
      manifest.environment.headCommit !== git(["rev-parse", "HEAD"])) {
    throw new Error("prepared settings, source, build, or script changed");
  }
  const entries = [manifest.inputs.strictJpeg, manifest.inputs.strictPng,
    ...tolerantMatrix.map((spec) => manifest.inputs.tolerant[spec.name])];
  if (entries.some((entry) => !entry || sha256(readFileSync(inputPath(entry))) !== entry.sha256 ||
      statSync(inputPath(entry)).size !== entry.bytes || entry.bytes > maxBytes)) {
    throw new Error("prepared input changed");
  }
  return manifest;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function waitWithTimeout(promise, ms, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(label + " timeout")), ms);
    promise.then((value) => { clearTimeout(timer); resolvePromise(value); },
      (error) => { clearTimeout(timer); rejectPromise(error); });
  });
}
function outputHash(value) {
  return sha256(Buffer.from(JSON.stringify(value)));
}
async function strictOperation(operation, variant, input, context) {
  const api = context[variant];
  if (operation === "jpegIndex" || operation === "pngIndex") {
    return api.image.indexImageArtifact({ path: inputPath(input), allowedRoots: [scratch], store: api.store });
  }
  const result = await api.crop.cropImageArtifact({ artifactId: api.indexed.artifactId,
    region: cropRegion, allowedRoots: [scratch], store: api.store });
  if (result.status !== "cropped") throw new Error("strict crop did not crop");
  return result;
}
async function strictRows(operation, input, report, save) {
  const context = {};
  for (const variant of ["A", "A-prime", "B"]) {
    const image = await moduleFor(variant, "image-artifacts.js");
    const crop = await moduleFor(variant, "image-crop.js");
    const store = new image.MemoryImageArtifactStore();
    const indexed = operation === "jpegCrop"
      ? await image.indexImageArtifact({ path: inputPath(input), allowedRoots: [scratch], store }) : null;
    context[variant] = { image, crop, store, indexed };
  }
  for (const variant of ["A", "A-prime", "B"]) {
    for (let i = 0; i < warmups; i += 1) await strictOperation(operation, variant, input, context);
  }
  const rows = Object.fromEntries(["A", "A-prime", "B"].map((name) => [name, { samples: [] }]));
  for (let round = 0; round < rounds; round += 1) {
    for (const variant of ["A", "A-prime", "B"]) {
      global.gc();
      const startedNs = process.hrtime.bigint();
      const value = await strictOperation(operation, variant, input, context);
      const elapsedNs = Number(process.hrtime.bigint() - startedNs);
      rows[variant].samples.push({ round, order: variant, elapsedNs, outputSha256: outputHash(value) });
      report.strict[operation] = rows;
      save();
    }
  }
  for (const row of Object.values(rows)) row.medianNs = median(row.samples.map((sample) => sample.elapsedNs));
  const aPrimeOverA = rows["A-prime"].medianNs / rows.A.medianNs;
  const bOverA = rows.B.medianNs / rows.A.medianNs;
  const status = aPrimeOverA < 0.97 || aPrimeOverA > 1.03 ? "INVALID" : bOverA > 1.03 ? "FAIL" : "PASS";
  report.strictGate[operation] = { status, aPrimeOverA, bOverA };
  report.strict[operation] = rows;
  save();
  if (status !== "PASS") throw new Error("strict performance gate " + operation + " " + status);
}
function startSampler(pid) {
  if (platform() !== "win32") throw new Error("Windows parent RSS sampler required");
  const ps = "$target=" + Number(pid) +
    "; while($true){ $p=Get-Process -Id $target -ErrorAction SilentlyContinue;" +
    " if($null -eq $p){break}; [Console]::Out.WriteLine(([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() + ' ' + $p.WorkingSet64.ToString()));" +
    " Start-Sleep -Milliseconds " + rssIntervalMs + " }";
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  const points = [];
  let pending = "";
  let firstResolve;
  let firstReject;
  const first = new Promise((resolvePromise, rejectPromise) => { firstResolve = resolvePromise; firstReject = rejectPromise; });
  child.stdout.on("data", (chunk) => {
    pending += chunk.toString("utf8");
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const match = /^(\d+) (\d+)$/u.exec(line.trim());
      if (!match) continue;
      points.push({ epochMs: Number(match[1]), rssBytes: Number(match[2]) });
      if (points.length === 1) firstResolve();
    }
  });
  child.once("error", firstReject);
  child.once("close", () => { if (!points.length) firstReject(new Error("RSS sampler produced no points")); });
  return { child, points, first };
}
async function tolerantChild(input) {
  const child = spawn(process.execPath, [resolve(root, "scripts/measure-jpeg-tolerant-child.mjs"),
    input.file, input.sha256, input.expected], { cwd: root, windowsHide: true,
    stdio: ["ignore", "ignore", "pipe", "ipc"] });
  child.stderr.on("data", () => {});
  let readyResolve;
  let readyReject;
  let completeResolve;
  let completeReject;
  let completed = false;
  const ready = new Promise((resolvePromise, rejectPromise) => { readyResolve = resolvePromise; readyReject = rejectPromise; });
  const complete = new Promise((resolvePromise, rejectPromise) => { completeResolve = resolvePromise; completeReject = rejectPromise; });
  child.on("message", (message) => {
    if (message?.kind === "ready") readyResolve(message);
    if (message?.kind === "complete") { completed = true; completeResolve(message); }
    if (message?.kind === "error") completeReject(new Error(message.code ?? "child error"));
  });
  child.once("error", (error) => { readyReject(error); completeReject(error); });
  child.once("close", (code) => {
    if (!completed) { readyReject(new Error("child exited before readiness")); completeReject(new Error("child exited before completion")); }
    else if (code !== 0) completeReject(new Error("child exit code " + code));
  });
  let sampler;
  try {
    const message = await waitWithTimeout(ready, 30000, "child readiness");
    if (message.pid !== child.pid) throw new Error("child PID mismatch");
    sampler = startSampler(child.pid);
    await waitWithTimeout(sampler.first, 30000, "RSS sampler readiness");
    child.send({ kind: "start" });
    const result = await waitWithTimeout(complete, 600000, "tolerant child");
    if (result.sha256 !== input.sha256 || result.byteLength !== input.bytes ||
        !Array.isArray(result.rows) || result.rows.length !== rounds) throw new Error("child evidence mismatch");
    for (const row of result.rows) {
      const accepted = input.expected === "accepted";
      if (accepted ? row.status !== "accepted" || row.validationProfile !== "jpeg-ycbcr8-tolerant-v1" ||
          row.width !== input.width || row.height !== input.height
        : row.status !== "rejected" || row.code !== input.expected) throw new Error("unexpected tolerant sample");
    }
    sampler.child.kill();
    await waitWithTimeout(new Promise((resolvePromise) => sampler.child.once("close", resolvePromise)),
      10000, "RSS sampler stop");
    const rows = result.rows.map((row) => {
      const during = sampler.points.filter((point) => point.epochMs >= row.startedAtMs && point.epochMs <= row.endedAtMs);
      return { ...row, observedPeakRssBytes: during.length ? Math.max(...during.map((point) => point.rssBytes)) : null,
        rssPointCount: during.length };
    });
    return { rows, parentRss: { collector: "PowerShell Get-Process WorkingSet64",
      intervalMs: rssIntervalMs, unit: "bytes", scope: "child process; finite sampling, not a decoder limit",
      points: sampler.points, coverage: rows.every((row) => row.rssPointCount > 0) ? "complete" : "partial" },
      medianElapsedNs: median(rows.map((row) => row.elapsedNs)),
      medianObservedPeakRssBytes: rows.every((row) => row.observedPeakRssBytes !== null)
        ? median(rows.map((row) => row.observedPeakRssBytes)) : null };
  } finally {
    if (sampler && !sampler.child.killed) sampler.child.kill();
    if (!child.killed) child.kill();
  }
}
async function measure() {
  const manifest = check();
  if (existsSync(sentinelPath)) throw new Error("measurement already attempted; no retry");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(sentinelPath, JSON.stringify({ attemptedAt: new Date().toISOString(),
    manifestSha256: sha256(readFileSync(manifestPath)) }) + "\n", { flag: "wx" });
  const report = { schema: "wbs-6.12c-measurement/v3", attempt: 2, performingAccount: "sol",
    status: "INCOMPLETE", manifest: rel(manifestPath), manifestSha256: sha256(readFileSync(manifestPath)),
    settings, environment: manifest.environment, sharp: manifest.sharp, variants: manifest.variants,
    inputs: manifest.inputs, strict: {}, strictGate: { status: "INCOMPLETE" }, tolerant: {},
    errors: [] };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  try {
    await strictRows("jpegIndex", manifest.inputs.strictJpeg, report, save);
    await strictRows("jpegCrop", manifest.inputs.strictJpeg, report, save);
    await strictRows("pngIndex", manifest.inputs.strictPng, report, save);
    report.strictGate.status = "PASS";
    save();
    for (const spec of tolerantMatrix) {
      const result = await tolerantChild(manifest.inputs.tolerant[spec.name]);
      report.tolerant[spec.name] = result;
      save();
    }
    report.status = "PASS";
    save();
    console.log(JSON.stringify({ status: report.status, evidence: rel(reportPath),
      ratios: Object.fromEntries(Object.entries(report.strictGate).filter(([key]) => key !== "status")) }));
  } catch (error) {
    report.status = report.strictGate.status === "PASS" ? "ERROR" : "STOPPED";
    report.errors.push({ code: typeof error?.message === "string" && error.message.startsWith("strict performance gate")
      ? "strict_gate_failed_or_invalid" : "measurement_error" });
    save();
    throw error;
  }
}
if (mode === "--prepare") await prepare();
if (mode === "--check") {
  const manifest = check();
  console.log(JSON.stringify({ status: "CHECK", manifest: rel(manifestPath),
    inputCount: 2 + Object.keys(manifest.inputs.tolerant).length }));
}
if (mode === "--measure") await measure();