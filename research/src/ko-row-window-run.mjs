// ko-row-window: the single O1 OCR run and the fixed K1 record (protocol research/plans/2026-11-24-ko-row-window-protocol.md, 4.2).
// Usage (from research/): node src/ko-row-window-run.mjs --out <new dir> [--non-measurement [--limit N]]
// Reads only questions.json and PNG bytes of the frozen data commit. Never reads design.json, gold.json or render.json.
// One eng+kor worker, 48 pages once each in question order, no retry. newWorker, ocrLines and withTimeout are byte for byte
// the #147 runner functions (blob 3ddf60ab, checked by the test and by the preflight below).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { selectWindow } from "./selector.mjs";
import { FIXED, checkSelectorFile, fixedRunSource, functionSource, loadFixedLib, researchDir } from "./ko-row-window-fixed.mjs";
import { DATA_COMMIT, MANIFEST_SHA256, PAGES, frozenDataReader, readSelectorInputs } from "./ko-row-window-data.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const out = arg("--out");
const nonMeasurement = process.argv.includes("--non-measurement");
if (!out) throw new Error("--out is required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const limit = arg("--limit") ? Number(arg("--limit")) : null;
if (limit !== null && !nonMeasurement) throw new Error("--limit is only for --non-measurement wiring checks");

const LANG_DIR = join(researchDir, ".cache", "ko-ocr-factorial"); // same cache path as #147/#148 (protocol 4.1)
const LANGS = "eng+kor"; // O1, order fixed
const ENGINE_VERSION = "5.1.1";
const PAGE_TIMEOUT_MS = 180000;
const CODE_FILES = ["research/src/ko-row-window-run.mjs", "research/src/ko-row-window-fixed.mjs", "research/src/ko-row-window-data.mjs", "research/src/ko-row-window-lib.mjs", "research/src/selector.mjs"];

// ---------------------------------------------------------------- pre-OCR guard (protocol 4.2, 4.6)
const pre = { guardOn: /node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "") && Boolean(process.env.D03_NET_LOG), lib: null, commit: null, codeClean: null, versions: null, langFiles: null, inputs: null };
const g = (a) => execFileSync("git", a, { cwd: researchDir, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const pkgVersion = (name) => JSON.parse(readFileSync(join(researchDir, "node_modules", name, "package.json"), "utf8")).version;
let lib = null;
try { lib = await loadFixedLib(); } catch (err) { pre.libError = String(err?.message || err).slice(0, 300); }
const steps = [
  ["offline guard", () => { if (!pre.guardOn && !nonMeasurement) throw new Error("missing: set NODE_OPTIONS=--require=<research/tools/d03/guard/node-netguard.cjs> and D03_NET_LOG"); }],
  ["fixed #147 library", () => { if (!lib) throw new Error(pre.libError); pre.lib = FIXED.lib.blob; }],
  ["selector blob", () => { checkSelectorFile(); }],
  ["fixed OCR functions", () => {
    const want = fixedRunSource();
    const mine = readFileSync(join(researchDir, "src", "ko-row-window-run.mjs"), "utf8").replace(/\r\n/g, "\n");
    for (const n of ["newWorker", "ocrLines", "withTimeout"]) if (!functionSource(want, n) || functionSource(mine, n) !== functionSource(want, n)) throw new Error(`${n} differs from #147 run blob`);
  }],
  ["code state", () => {
    const dirty = g(["status", "--porcelain", "--", ...CODE_FILES.map((f) => `:/${f}`)]);
    pre.commit = g(["rev-parse", "HEAD"]);
    pre.codeClean = !dirty;
    if (dirty && !nonMeasurement) throw new Error(`code differs from HEAD ${pre.commit}: ${dirty.replace(/\s+/g, " ")}`);
  }],
  ["engine", () => {
    pre.versions = { "tesseract.js": pkgVersion("tesseract.js"), "tesseract.js-core": pkgVersion("tesseract.js-core"), sharp: pkgVersion("sharp") };
    if (pre.versions["tesseract.js"] !== ENGINE_VERSION || pre.versions["tesseract.js-core"] !== ENGINE_VERSION) throw new Error(`versions ${JSON.stringify(pre.versions)}`);
  }],
  ["language files", () => { pre.langFiles = lib.checkLangFiles(LANG_DIR, ["eng", "kor"]); }],
  ["frozen data", () => { pre.inputs = readSelectorInputs(frozenDataReader()).slice(0, limit ?? PAGES); }],
];
const problems = [];
for (const [name, fn] of steps) {
  try { fn(); } catch (err) { problems.push(`${name}: ${String(err?.message || err).slice(0, 300)}`); }
}
mkdirSync(out, { recursive: true });
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;
if (problems.length) {
  writeFileSync(join(out, "stop.json"), pretty({ stopped: "before OCR", problems }));
  console.error(`stopped before OCR: ${problems.join("; ")}`);
  process.exit(2);
}

// ---------------------------------------------------------------- OCR (#147 runner functions, unchanged)
async function newWorker(langs) {
  return createWorker(langs, 1, { langPath: LANG_DIR, cachePath: LANG_DIR, gzip: false, cacheMethod: "readOnly" });
}
async function ocrLines(worker, bytes) {
  const meta = await sharp(bytes).metadata();
  const scale = Math.min(4, 4096 / Math.max(meta.width, meta.height));
  const img = await sharp(bytes).resize({ width: Math.round(meta.width * scale) }).png().toBuffer();
  const { data } = await worker.recognize(img, {}, { blocks: true });
  const toBox = (bb) => [bb.x0 / scale, bb.y0 / scale, (bb.x1 - bb.x0) / scale, (bb.y1 - bb.y0) / scale];
  const lines = data.blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({
    text: l.text.trim(),
    confidence: l.confidence,
    box: toBox(l.bbox),
    words: (l.words || []).map((w) => ({ text: w.text, box: toBox(w.bbox) })),
  }));
  return { lines, width: meta.width, height: meta.height };
}
const withTimeout = (p, ms) => {
  let timer;
  return Promise.race([p.finally(() => clearTimeout(timer)), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms)))]);
};

const errorKind = (msg) => (/^timeout \d+ ms$/.test(msg) ? "timeout" : "worker_exception");
const ocrRows = [], k1Rows = [], timing = [], events = [];
const started = Date.now();
let incomplete = null;
let worker = await newWorker(LANGS);
events.push({ event: "worker_created", before: pre.inputs[0].id });
for (const page of pre.inputs) {
  const t0 = Date.now();
  const pngSha256 = lib.sha256(page.bytes);
  let ocrRow, k1Row;
  try {
    const r = await withTimeout(ocrLines(worker, page.bytes), PAGE_TIMEOUT_MS);
    const res = lib.keyResults(selectWindow, r.lines, page.question, r.width, r.height);
    const st = res.inputError ? "error" : "ok";
    ocrRow = { id: page.id, pngSha256, width: r.width, height: r.height, status: "ok", error: null, ocrSha256: lib.sha256(Buffer.from(JSON.stringify(r.lines), "utf8")), ocrLineCount: r.lines.length, ocrLines: r.lines };
    k1Row = { id: page.id, status: res.k1.status === "ok" ? "ok" : "error", error: res.inputError ? `input_validation: ${res.inputError}` : res.k1.error, k1: res.k1 };
    if (st === "error") k1Row.status = "error";
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 200);
    const e = `${errorKind(msg)}: ${msg}`;
    ocrRow = { id: page.id, pngSha256, width: null, height: null, status: "error", error: e, ocrSha256: null, ocrLineCount: null, ocrLines: null };
    k1Row = { id: page.id, status: "error", error: e, k1: { status: "error", error: e, branch: "k0" } };
    // No retry of this page. Replace the worker and continue with the next page (protocol 4.2).
    await worker.terminate().catch(() => {});
    try {
      worker = await newWorker(LANGS);
      events.push({ event: "worker_replaced", after: page.id, reason: msg });
    } catch (err2) {
      incomplete = { after: page.id, reason: String(err2?.message || err2).slice(0, 200) };
      events.push({ event: "worker_recreate_failed", ...incomplete });
      ocrRows.push(ocrRow);
      k1Rows.push(k1Row);
      break;
    }
  }
  ocrRows.push(ocrRow);
  k1Rows.push(k1Row);
  timing.push({ id: page.id, ms: Date.now() - t0 });
  console.log(`${page.id}: ${ocrRow.status} k1=${k1Row.k1.matched}/${k1Row.k1.branch}`);
}
if (!incomplete) { await worker.terminate(); events.push({ event: "worker_terminated" }); }

// ---------------------------------------------------------------- write, freeze, guard summary
writeFileSync(join(out, "ocr.jsonl"), lib.jsonl(ocrRows));
writeFileSync(join(out, "k1.jsonl"), lib.jsonl(k1Rows));
const frozen = { "ocr.jsonl": lib.sha256(readFileSync(join(out, "ocr.jsonl"))), "k1.jsonl": lib.sha256(readFileSync(join(out, "k1.jsonl"))) };
writeFileSync(join(out, "freeze.json"), pretty({ hashBasis: "SHA-256 of raw file bytes", files: frozen }));
if (incomplete) writeFileSync(join(out, "incomplete.json"), pretty({ incomplete: true, ...incomplete, rows: ocrRows.length }));
const step = process.env.D03_STEP || "";
let blocked = null, guardEvents = null;
if (process.env.D03_NET_LOG && existsSync(process.env.D03_NET_LOG)) {
  const evs = readFileSync(process.env.D03_NET_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.step === step);
  blocked = evs.filter((e) => e.event === "blocked").length;
  guardEvents = evs.filter((e) => e.event === "guard").length;
}
writeFileSync(join(out, "guard-summary.json"), pretty({
  step, offlineGuard: pre.guardOn, blocked, langFiles: pre.langFiles, engine: pre.versions, selectorBlob: FIXED.selector.blob, fixedLibBlob: pre.lib, fixedRunBlob: FIXED.run.blob, dataCommit: DATA_COMMIT, manifestSha256: MANIFEST_SHA256,
  ocrOptions: { langs: LANGS, oem: 1, langPath: "research/.cache/ko-ocr-factorial", cachePath: "research/.cache/ko-ocr-factorial", gzip: false, cacheMethod: "readOnly", pageTimeoutMs: PAGE_TIMEOUT_MS },
}));
writeFileSync(join(out, "run-meta.json"), pretty({
  codeCommit: pre.commit, codeClean: pre.codeClean, nonMeasurement, limit, frozen, incomplete, node: process.version, platform: `${process.platform}-${process.arch}`, pid: process.pid,
  guardEventsForStep: guardEvents, startedAt: new Date(started).toISOString(), totalMs: Date.now() - started, events, timing,
}));
console.log(`done: ${ocrRows.length} rows, blocked=${blocked}${incomplete ? ", INCOMPLETE" : ""}`);
if (incomplete) process.exitCode = 3;
