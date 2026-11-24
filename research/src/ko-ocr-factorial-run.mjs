// Korean OCR x Hangul key factorial: one run (protocol section 5).
// Usage (from research/): node src/ko-ocr-factorial-run.mjs --out <new dir> [--non-measurement]
// Reads only the registered questions and PNG bytes from fixed Git objects. Never reads gold, design, index or history.
// Order: O0 r09, O0 fcp, O1 r09, O1 fcp; a fresh OCR worker per (OCR condition, dataset); 48 pages each, no retry.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { selectWindow } from "./selector.mjs";
import {
  DATASETS, ENGINE_VERSION, LANG_DIR, OCR_CONDITIONS, PAGE_TIMEOUT_MS, SELECTOR_BLOB, checkLangFiles, jsonl, keyResults, pretty, readSelectorInputs,
  repoRoot, researchDir, sha256, writeFreeze,
} from "./ko-ocr-factorial-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const out = arg("--out");
const nonMeasurement = process.argv.includes("--non-measurement");
if (!out) throw new Error("--out is required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const repo = repoRoot();

// ---------------------------------------------------------------- pre-OCR guard (protocol 4.1, 7)
const CODE_FILES = ["research/src/ko-ocr-factorial-run.mjs", "research/src/ko-ocr-factorial-lib.mjs", "research/src/selector.mjs"];
function preflight() {
  const problems = [];
  const guardOn = /node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "") && Boolean(process.env.D03_NET_LOG);
  if (!guardOn && !nonMeasurement) problems.push("offline guard missing: set NODE_OPTIONS=--require=<tools/d03/guard/node-netguard.cjs> and D03_NET_LOG");
  const g = (a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", windowsHide: true }).trim();
  const selectorBlob = g(["hash-object", join(researchDir, "src", "selector.mjs")]);
  if (selectorBlob !== SELECTOR_BLOB) problems.push(`selector blob ${selectorBlob} != ${SELECTOR_BLOB}`);
  const dirty = g(["status", "--porcelain", "--", ...CODE_FILES]);
  const commit = g(["rev-parse", "HEAD"]);
  if (dirty && !nonMeasurement) problems.push(`code differs from HEAD ${commit}: ${dirty.replace(/\s+/g, " ")}`);
  const pkgVersion = (name) => JSON.parse(readFileSync(join(researchDir, "node_modules", name, "package.json"), "utf8")).version;
  const versions = { "tesseract.js": pkgVersion("tesseract.js"), "tesseract.js-core": pkgVersion("tesseract.js-core"), sharp: pkgVersion("sharp") };
  if (versions["tesseract.js"] !== ENGINE_VERSION || versions["tesseract.js-core"] !== ENGINE_VERSION) problems.push(`engine versions ${JSON.stringify(versions)}`);
  let langFiles = null;
  try {
    langFiles = checkLangFiles(LANG_DIR, ["eng", "kor"]);
  } catch (err) {
    problems.push(String(err.message || err));
  }
  return { problems, guardOn, selectorBlob, commit, codeClean: !dirty, versions, langFiles };
}
const pre = preflight();
mkdirSync(out, { recursive: true });
if (pre.problems.length) {
  writeFileSync(join(out, "stop.json"), pretty({ stopped: "before OCR", problems: pre.problems }));
  console.error(`stopped before OCR: ${pre.problems.join("; ")}`);
  process.exit(2);
}

// ---------------------------------------------------------------- OCR (same preprocessing as the fixed createOcr)
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

// Selector-side inputs only. Read once, before any OCR.
// --limit (wiring check only) keeps the first N pages per dataset; it is refused for measurement.
const limit = arg("--limit") ? Number(arg("--limit")) : null;
if (limit !== null && !nonMeasurement) throw new Error("--limit is only for --non-measurement wiring checks");
const inputs = Object.fromEntries(DATASETS.map((ds) => [ds, readSelectorInputs(repo, ds).slice(0, limit ?? 48)]));
const preds = [];
const ocrRows = [];
const timing = [];
const events = [];
const started = Date.now();
for (const ocr of ["O0", "O1"]) {
  for (const ds of DATASETS) {
    const langs = OCR_CONDITIONS[ocr];
    let worker = await newWorker(langs);
    events.push({ ocr, dataset: ds, event: "worker_created", before: inputs[ds][0].id });
    for (const page of inputs[ds]) {
      const t0 = Date.now();
      const pngSha256 = sha256(page.bytes);
      let row;
      let lines = null;
      try {
        const r = await withTimeout(ocrLines(worker, page.bytes), PAGE_TIMEOUT_MS);
        lines = r.lines;
        const res = keyResults(selectWindow, lines, page.question, r.width, r.height);
        row = {
          ocr, dataset: ds, id: page.id, pngSha256, width: r.width, height: r.height,
          status: res.inputError ? "error" : "ok", error: res.inputError ? `input_validation: ${res.inputError}` : null,
          ocrSha256: sha256(Buffer.from(JSON.stringify(lines), "utf8")), ocrLineCount: lines.length, k0: res.k0, k1: res.k1,
        };
      } catch (err) {
        const msg = String(err?.message || err).slice(0, 200);
        const e = { status: "error", error: `ocr: ${msg}` };
        row = { ocr, dataset: ds, id: page.id, pngSha256, width: null, height: null, status: "error", error: `ocr: ${msg}`, ocrSha256: null, ocrLineCount: null, k0: { ...e, branch: "k0" }, k1: { ...e, branch: "k0" } };
        lines = null;
        // No retry of this page. Replace the worker and continue with the next page (protocol 5.1).
        await worker.terminate().catch(() => {});
        worker = await newWorker(langs);
        events.push({ ocr, dataset: ds, event: "worker_replaced", after: page.id, reason: msg });
      }
      preds.push(row);
      ocrRows.push({ ocr, dataset: ds, id: page.id, status: lines ? "ok" : "error", ocrLines: lines });
      timing.push({ ocr, dataset: ds, id: page.id, ms: Date.now() - t0 });
      console.log(`${ocr} ${ds} ${page.id}: ${row.status} k0=${row.k0.matched} k1=${row.k1.matched}/${row.k1.branch}`);
    }
    await worker.terminate();
    events.push({ ocr, dataset: ds, event: "worker_terminated" });
  }
}

// ---------------------------------------------------------------- write, freeze, guard summary
writeFileSync(join(out, "predictions.jsonl"), jsonl(preds));
writeFileSync(join(out, "ocr.jsonl"), jsonl(ocrRows));
const frozen = writeFreeze(out);
const step = process.env.D03_STEP || "";
let blocked = null, guardEvents = null;
if (process.env.D03_NET_LOG && existsSync(process.env.D03_NET_LOG)) {
  const evs = readFileSync(process.env.D03_NET_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.step === step);
  blocked = evs.filter((e) => e.event === "blocked").length;
  guardEvents = evs.filter((e) => e.event === "guard").length;
}
writeFileSync(join(out, "guard-summary.json"), pretty({
  step, offlineGuard: pre.guardOn, blocked, langFiles: pre.langFiles, engine: pre.versions, selectorBlob: pre.selectorBlob,
  ocrOptions: { oem: 1, langPath: "research/.cache/ko-ocr-factorial", cachePath: "research/.cache/ko-ocr-factorial", gzip: false, cacheMethod: "readOnly" }, conditions: OCR_CONDITIONS,
}));
writeFileSync(join(out, "run-meta.json"), pretty({
  codeCommit: pre.commit, codeClean: pre.codeClean, nonMeasurement, frozen, node: process.version, platform: `${process.platform}-${process.arch}`, pid: process.pid,
  guardEventsForStep: guardEvents, pageTimeoutMs: PAGE_TIMEOUT_MS, startedAt: new Date(started).toISOString(), totalMs: Date.now() - started, events, timing,
}));
console.log(`done: ${preds.length} rows, blocked=${blocked}`);
