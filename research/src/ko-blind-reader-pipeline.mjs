// ko-blind-reader: pipeline (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, sections 3.1, 4.5, 5, 7, 8).
// Usage (from research/): node src/ko-blind-reader-pipeline.mjs <command> [options]
//   gate          --out <new dir>                       #153 replay and #154 rebuild, 144/144 each (3.1)
//   render        --set <gen dir> [--font <ttf>]        pinned r09 renderer on <set>/design.json -> <set>/render
//   ocr           --set <gen dir> --out <new dir>       pinned #153 OCR functions, offline guard required (4.5.3)
//   predict       --set <gen dir> --ocr <dir> --out <new dir>
//   build         --set <gen dir> --pred <dir> --practice <practice gen dir> --out <new dir>
//   packet        --set <gen dir> --build <dir> --html <new file> --key <new file>
//   qa            --set <gen dir> --build <dir> --html <file> --key <file> --out <new file> [--template-of <mock html>]
//   commit        --label <kbr-...> --file <file> --salts <new dir or existing salts dir> --public <json>
//   install-admin --admin <dir>                         scorer, recount and 채점.cmd into the admin folder (files must not exist)
//   reader-verify --dir <reader folder> --sha256 <hex>
// stdout: one safeLine JSON (paths, counts, pass/fail, SHA-256). Never texts, values, assignment, sides, visibility or scores.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import * as L from "./ko-blind-reader-lib.mjs";
import { FIXED_CODE, REG, git, gitBlobId, loadFixed, pinnedBytes, pinnedTree, researchDir } from "./ko-blind-reader-fixed.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;
const LANG_DIR = join(researchDir, ".cache", "ko-ocr-factorial");
const PAGE_TIMEOUT_MS = 180000;
const SELF = fileURLToPath(import.meta.url);
const METHODS = ["W1", "W4", "W5"];
const KIND = { W1: "w1", W4: "w4", W5: "w5" };

class Stop extends Error {
  constructor(code) { super(code); this.code = code; }
}
const stop = (code) => { throw new Stop(code); };
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const need = (k) => opt(k) ?? stop(`usage_${k.replace(/^--/, "").replace(/-/g, "_")}`);
const newDir = (p) => { if (existsSync(p)) stop("exists"); mkdirSync(p, { recursive: true }); return p; };
const newFile = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data, { flag: "wx" }); };
const slash = (p) => resolve(p).split("\\").join("/");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const strictJsonl = (text) => {
  if (text.includes("\r") || !text.endsWith("\n") || text.endsWith("\n\n")) stop("jsonl_format");
  return text.slice(0, -1).split("\n");
};
const pngSize = (bytes) => {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.subarray(12, 16).toString("latin1") !== "IHDR") stop("png");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25] };
};

// ---------------------------------------------------------------- shared steps
/** #153 buildPrediction over OCR rows; `exactText` is the ocr.jsonl text (numbers kept as JSON source for W3/W4). */
function predictAll(F, inputs, ocrText, k1Text) {
  const ocrRows = strictJsonl(ocrText).map((l) => JSON.parse(l));
  const ocrExact = strictJsonl(ocrText).map((l) => F.parseExact(l));
  const k1Rows = strictJsonl(k1Text).map((l) => JSON.parse(l));
  if (ocrRows.length !== inputs.length || k1Rows.length !== inputs.length) stop("rows");
  const recompute = (lines, q, w, h) => F.keyResults(F.selectWindow, lines, q, w, h).k1;
  return inputs.map((p, i) => {
    if (ocrRows[i].id !== p.id || ocrExact[i].id !== p.id || k1Rows[i].id !== p.id) stop("row_id");
    const { width, height } = pngSize(p.bytes);
    return F.buildPrediction({ id: p.id, question: p.question, pngSha256: sha256(p.bytes), width, height, ocrRow: ocrRows[i], ocrLinesExact: ocrExact[i].ocrLines, k1Row: k1Rows[i] },
      recompute, { w1Rule: F.w1Rule, w2lib: F.w2lib, w3lib: F.w3lib });
  });
}

/** #154 build: W1, W4, W5 for every prediction row (pinned project/plan/compose/crop/encodeGray). */
async function buildAll(F, preds, pageBytes, out) {
  const plans = preds.map((pred) => { const proj = F.project(pred); return { proj, pl: F.plan(proj) }; });
  if (out) for (const d of ["w1", "w4", "w5"]) mkdirSync(join(out, d), { recursive: true });
  const outputs = { w1: {}, w4: {}, w5: {} };
  const coords = [];
  for (const { proj, pl } of plans) {
    const file = `${proj.id}.png`;
    const bytes = pageBytes(proj.id);
    if (sha256(bytes) !== proj.pngSha256) stop("png_sha256");
    const src = await F.decodeGray(bytes);
    if (src.width !== proj.width || src.height !== proj.height) stop("png_size");
    const write = async (kind, raw, w, h) => {
      const png = await F.encodeGray(raw, w, h);
      if (out) writeFileSync(join(out, kind, file), png, { flag: "wx" });
      return { file: `${kind}/${file}`, bytes: png.length, sha256: sha256(png), width: w, height: h, pixelSha256: F.pixelSha256(raw) };
    };
    outputs.w1[proj.id] = proj.w1 ? await write("w1", F.crop(proj.w1, src.data, src.width), proj.w1.width, proj.w1.height) : null;
    outputs.w4[proj.id] = proj.w4 ? await write("w4", F.crop(proj.w4, src.data, src.width), proj.w4.width, proj.w4.height) : null;
    outputs.w5[proj.id] = pl.display ? await write("w5", F.compose(pl, src.data, src.width), pl.display.width, pl.display.height) : null;
    coords.push({
      id: proj.id, w5Reason: pl.reason, w5Kind: pl.kind, page: { width: proj.width, height: proj.height }, pngSha256: proj.pngSha256,
      w1: proj.w1, w4: proj.w4, B: pl.B, H: pl.H, t: pl.t, b: pl.b, p: pl.p, pieces: pl.pieces, display: pl.display,
    });
  }
  return { outputs, coordsText: `${coords.map((r) => JSON.stringify(r)).join("\n")}\n`, coords };
}

// ---------------------------------------------------------------- gate (3.1)
async function gate() {
  const out = newDir(need("--out"));
  const F = await loadFixed();
  const G = REG.gate;
  const c153 = REG.fixed.pr153, c154 = REG.fixed.pr154;
  const reads = [];
  const pin = (commit, spec) => { const b = pinnedBytes({ commit, ...spec }); reads.push({ path: spec.path, blob: spec.blob, sha256: sha256(b) }); return b; };
  const q = JSON.parse(pin(c153, G.pr153Questions).toString("utf8")).questions;
  const tree = pinnedTree({ commit: c153, path: G.pr153Images.path, tree: G.pr153Images.tree });
  if (q.length !== G.pages || tree.size !== G.pages) stop("gate_pages");
  const imgs = new Map(q.map((x) => {
    const blob = tree.get(x.file);
    const b = git(["cat-file", "blob", blob]);
    if (gitBlobId(b) !== blob) stop("gate_blob");
    return [x.id, b];
  }));
  const inputs = q.map((x) => ({ id: x.id, question: x.question, bytes: imgs.get(x.id) }));
  const ocrText = pin(c153, G.pr153Ocr).toString("utf8");
  const k1Text = pin(c153, G.pr153K1).toString("utf8");
  const preds = predictAll(F, inputs, ocrText, k1Text);
  const want = strictJsonl(pin(c153, G.pr153Predictions).toString("utf8"));
  let predictionsEqual = 0;
  preds.forEach((p, i) => { if (L.canonicalJson(p) === L.canonicalJson(JSON.parse(want[i]))) predictionsEqual++; });
  const predText = F.jsonl(preds);
  const { outputs, coordsText } = await buildAll(F, preds, (id) => imgs.get(id), null);
  const man = JSON.parse(pin(c154, G.pr154Manifest).toString("utf8"));
  const coordsWant = pin(c154, G.pr154Coords);
  const eq = { w1: 0, w4: 0, w5: 0 };
  for (const k of ["w1", "w4", "w5"]) for (const x of q) if (L.canonicalJson(outputs[k][x.id]) === L.canonicalJson(man.outputs[k][x.id])) eq[k]++;
  const res = {
    version: "ko-blind-reader-gate-1", pages: G.pages, pr153: c153, pr154: c154, fixedBlobs: F.blobs, reads,
    predictionsEqual, predictionsFileSha256: sha256(Buffer.from(predText)), predictionsFileEqual: sha256(Buffer.from(predText)) === G.pr153Predictions.sha256,
    w1Equal: eq.w1, w4Equal: eq.w4, w5Equal: eq.w5, coordsSha256: sha256(Buffer.from(coordsText)), coordsEqual: Buffer.from(coordsText).equals(coordsWant),
    tools: { node: process.version, ...F.sharpVersions() },
  };
  res.pass = predictionsEqual === G.pages && eq.w1 === G.pages && eq.w4 === G.pages && eq.w5 === G.pages && res.coordsEqual;
  newFile(join(out, "gate.json"), pretty(res));
  return { ok: res.pass, pass: res.pass, pages: G.pages, predictionsEqual, w1Equal: eq.w1, w4Equal: eq.w4, w5Equal: eq.w5, coordsEqual: res.coordsEqual ? 1 : 0, gateSha256: sha256(readFileSync(join(out, "gate.json"))), out: slash(out) };
}

// ---------------------------------------------------------------- render (4.5.2)
function render() {
  const set = need("--set");
  const font = opt("--font") ?? `C:/Windows/Fonts/${REG.fixed.font.file}`;
  const script = join(researchDir, "tools", "r09", "render.py");
  if (git(["hash-object", script], "utf8").trim() !== FIXED_CODE.render.blob) stop("renderer_not_pinned");
  if (sha256(readFileSync(font)) !== REG.fixed.font.sha256) stop("font_sha256");
  const out = join(set, "render");
  if (existsSync(out)) stop("exists");
  let code = 0;
  try {
    execFileSync("python", [script, "--design", join(set, "design.json"), "--font", font, "--out", out], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  } catch (e) { code = e.status ?? 1; }
  const check = readJson(join(out, "render-check.json"));
  const rj = readJson(join(out, "render.json"));
  const fontOk = rj.font.sha256 === REG.fixed.font.sha256 && rj.renderer.pillow === REG.fixed.font.renderer.pillow && rj.renderer.freetype === REG.fixed.font.renderer.freetype && rj.renderer.raqm === REG.fixed.font.renderer.raqm;
  const images = Object.keys(rj.images).length;
  return { ok: code === 0 && check.failedImages === 0 && fontOk, images, failed: check.failedImages, sha256: sha256(readFileSync(join(out, "render.json"))), out: slash(out) };
}

// ---------------------------------------------------------------- OCR (#147 runner functions, unchanged; protocol 4.5.3)
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

function coreFiles() {
  const root = join(researchDir, "node_modules", "tesseract.js-core");
  const walk = (d) => readdirSync(d).sort().flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  return Object.fromEntries(walk(root).map((f) => [f.slice(root.length + 1).split("\\").join("/"), sha256(readFileSync(f))]));
}

/** OCR-side allowlist reader: <set>/selector/questions.json and <set>/render/images/<listed file> only. */
function selectorInputs(set, log) {
  const read = (rel) => {
    const ok = rel === "selector/questions.json" || /^render\/images\/q[0-9a-f]{8}\.png$/.test(rel);
    if (!ok) stop("allowlist");
    const b = readFileSync(join(set, rel));
    if (log) log.push({ path: rel, sha256: sha256(b), bytes: b.length });
    return b;
  };
  const q = JSON.parse(read("selector/questions.json").toString("utf8")).questions;
  if (q.length !== REG.design.sources || new Set(q.map((x) => x.id)).size !== q.length) stop("questions");
  return q.map((x) => { if (x.file !== `${x.id}.png`) stop("questions"); return { id: x.id, question: x.question, bytes: read(`render/images/${x.file}`) }; });
}

async function ocr() {
  const set = need("--set");
  const out = need("--out");
  if (existsSync(out)) stop("exists");
  const F = await loadFixed();
  const problems = [];
  const guardOn = /node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "") && Boolean(process.env.D03_NET_LOG);
  if (!guardOn) problems.push("guard");
  const self = readFileSync(SELF, "utf8").replace(/\r\n/g, "\n");
  for (const name of ["newWorker", "ocrLines", "withTimeout"]) {
    const a = F.functionSource(self, name), b = F.functionSource(F.run153Source, name);
    if (!a || a !== b) problems.push(`function_${name}`);
  }
  const pkg = (n) => readJson(join(researchDir, "node_modules", n, "package.json")).version;
  const versions = { "tesseract.js": pkg("tesseract.js"), "tesseract.js-core": pkg("tesseract.js-core"), sharp: pkg("sharp") };
  if (L.canonicalJson(versions) !== L.canonicalJson(REG.fixed.ocr.engine)) problems.push("engine");
  const core = coreFiles();
  if (L.canonicalJson(core) !== L.canonicalJson(REG.fixed.ocr.engineCoreFiles)) problems.push("engine_core");
  const langFiles = REG.fixed.ocr.langFiles.map((f) => {
    const b = readFileSync(join(LANG_DIR, f.file));
    if (b.length !== f.bytes || sha256(b) !== f.sha256) problems.push(`lang_${f.lang}`);
    return { lang: f.lang, file: f.file, bytes: b.length, sha256: sha256(b) };
  });
  const lockSha = sha256(readFileSync(join(researchDir, "package-lock.json")));
  const lockBlob = git(["hash-object", join(researchDir, "package-lock.json")], "utf8").trim();
  if (lockBlob !== FIXED_CODE.researchLock.blob) problems.push("lock");
  const inputLog = [];
  const inputs = selectorInputs(set, inputLog);
  mkdirSync(out, { recursive: true });
  if (problems.length) {
    newFile(join(out, "stop.json"), pretty({ stoppedBeforeOcr: true, problems }));
    return { ok: false, code: "preflight", problems: problems.length, out: slash(out) };
  }
  const errorKind = (msg) => (/^timeout \d+ ms$/.test(msg) ? "timeout" : "worker_exception");
  const ocrRows = [], k1Rows = [], timing = [], events = [];
  const started = Date.now();
  let incomplete = null;
  let worker = await newWorker("eng+kor");
  events.push({ event: "worker_created" });
  for (const page of inputs) {
    const t0 = Date.now();
    const pngSha256 = sha256(page.bytes);
    let ocrRow, k1Row;
    try {
      const r = await withTimeout(ocrLines(worker, page.bytes), PAGE_TIMEOUT_MS);
      const res = F.keyResults(F.selectWindow, r.lines, page.question, r.width, r.height);
      ocrRow = { id: page.id, pngSha256, width: r.width, height: r.height, status: "ok", error: null, ocrSha256: sha256(Buffer.from(JSON.stringify(r.lines), "utf8")), ocrLineCount: r.lines.length, ocrLines: r.lines };
      k1Row = { id: page.id, status: res.k1.status === "ok" ? "ok" : "error", error: res.inputError ? `input_validation: ${res.inputError}` : res.k1.error, k1: res.k1 };
      if (res.inputError) k1Row.status = "error";
    } catch (err) {
      const msg = String(err?.message || err).slice(0, 200);
      const e = `${errorKind(msg)}: ${msg}`;
      ocrRow = { id: page.id, pngSha256, width: null, height: null, status: "error", error: e, ocrSha256: null, ocrLineCount: null, ocrLines: null };
      k1Row = { id: page.id, status: "error", error: e, k1: { status: "error", error: e, branch: "k0" } };
      await worker.terminate().catch(() => {});
      try {
        worker = await newWorker("eng+kor");
        events.push({ event: "worker_replaced", kind: errorKind(msg) });
      } catch (err2) {
        incomplete = { afterRow: ocrRows.length + 1 };
        events.push({ event: "worker_recreate_failed" });
        ocrRows.push(ocrRow);
        k1Rows.push(k1Row);
        break;
      }
    }
    ocrRows.push(ocrRow);
    k1Rows.push(k1Row);
    timing.push({ row: ocrRows.length, ms: Date.now() - t0 });
  }
  if (!incomplete) { await worker.terminate(); events.push({ event: "worker_terminated" }); }
  writeFileSync(join(out, "ocr.jsonl"), F.jsonl(ocrRows), { flag: "wx" });
  writeFileSync(join(out, "k1.jsonl"), F.jsonl(k1Rows), { flag: "wx" });
  const frozen = { "ocr.jsonl": sha256(readFileSync(join(out, "ocr.jsonl"))), "k1.jsonl": sha256(readFileSync(join(out, "k1.jsonl"))) };
  newFile(join(out, "freeze.json"), pretty({ hashBasis: "SHA-256 of raw file bytes", files: frozen }));
  if (incomplete) newFile(join(out, "incomplete.json"), pretty({ incomplete: true, ...incomplete, rows: ocrRows.length }));
  const step = process.env.D03_STEP || "";
  let blocked = null;
  if (process.env.D03_NET_LOG && existsSync(process.env.D03_NET_LOG)) {
    blocked = readFileSync(process.env.D03_NET_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.step === step && e.event === "blocked").length;
  }
  newFile(join(out, "guard-summary.json"), pretty({
    step, offlineGuard: guardOn, blocked, langFiles, engine: versions, engineCoreFiles: core, researchLockSha256: lockSha, researchLockBlob: lockBlob,
    selectorBlob: FIXED_CODE.selector.blob, fixedBlobs: F.blobs, functionsEqualTo153Run: ["newWorker", "ocrLines", "withTimeout"],
    executionMode: { workers: 1, pages: "sequential, image id order, once each, no retry", OMP_THREAD_LIMIT: process.env.OMP_THREAD_LIMIT ?? null },
    approvedInputs: inputLog,
    ocrOptions: { langs: "eng+kor", oem: 1, langPath: "research/.cache/ko-ocr-factorial", cachePath: "research/.cache/ko-ocr-factorial", gzip: false, cacheMethod: "readOnly", pageTimeoutMs: PAGE_TIMEOUT_MS },
  }));
  newFile(join(out, "run-meta.json"), pretty({ frozen, incomplete, node: process.version, platform: `${process.platform}-${process.arch}`, totalMs: Date.now() - started, events, timing }));
  const okRows = ocrRows.filter((r) => r.status === "ok").length;
  return { ok: !incomplete && blocked === 0, rows: ocrRows.length, failed: ocrRows.length - okRows, blocked: blocked ?? 0, sha256: frozen["ocr.jsonl"], out: slash(out) };
}

// ---------------------------------------------------------------- predict, build (4.5.4, 4.5.5)
async function predict() {
  const set = need("--set"), ocrDir = need("--ocr"), out = newDir(need("--out"));
  const F = await loadFixed();
  const log = [];
  const inputs = selectorInputs(set, log);
  const fz = readJson(join(ocrDir, "freeze.json")).files;
  const ocrText = readFileSync(join(ocrDir, "ocr.jsonl"), "utf8"), k1Text = readFileSync(join(ocrDir, "k1.jsonl"), "utf8");
  if (sha256(Buffer.from(ocrText)) !== fz["ocr.jsonl"] || sha256(Buffer.from(k1Text)) !== fz["k1.jsonl"]) stop("ocr_freeze");
  if (existsSync(join(ocrDir, "incomplete.json"))) stop("ocr_incomplete");
  const preds = predictAll(F, inputs, ocrText, k1Text);
  writeFileSync(join(out, "predictions.jsonl"), F.jsonl(preds), { flag: "wx" });
  const sha = sha256(readFileSync(join(out, "predictions.jsonl")));
  newFile(join(out, "freeze.json"), pretty({ hashBasis: "SHA-256 of raw file bytes", files: { "predictions.jsonl": sha }, ocrFreeze: fz, inputs: log, fixedBlobs: F.blobs }));
  return { ok: true, rows: preds.length, sha256: sha, out: slash(out) };
}

async function build() {
  const set = need("--set"), predDir = need("--pred"), practiceDir = need("--practice"), out = newDir(need("--out"));
  const F = await loadFixed();
  const fz = readJson(join(predDir, "freeze.json")).files;
  const text = readFileSync(join(predDir, "predictions.jsonl"), "utf8");
  if (sha256(Buffer.from(text)) !== fz["predictions.jsonl"]) stop("pred_freeze");
  const preds = strictJsonl(text).map((l) => JSON.parse(l));
  const inputs = selectorInputs(set, null);
  const byId = new Map(inputs.map((p) => [p.id, p.bytes]));
  const { outputs, coordsText } = await buildAll(F, preds, (id) => byId.get(id) ?? stop("page"), out);
  writeFileSync(join(out, "coords.jsonl"), coordsText, { flag: "wx" });
  // Practice image: the registered crop of the rendered practice page (same pinned crop and encoder).
  const pr = REG.reader.practice;
  const pbytes = readFileSync(join(practiceDir, "render", "images", "practice.png"));
  const psrc = await F.decodeGray(pbytes);
  const [x0, y0, x1, y1] = pr.crop;
  const pw = { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  const praw = F.crop(pw, psrc.data, psrc.width);
  const ppng = await F.encodeGray(praw, pw.width, pw.height);
  writeFileSync(join(out, "practice.png"), ppng, { flag: "wx" });
  const v = F.sharpVersions();
  newFile(join(out, "manifest.json"), pretty({
    version: "ko-blind-reader-build-1", predictionsSha256: fz["predictions.jsonl"], tools: { node: process.version, sharp: v.sharp, libvips: v.libvips },
    coordsSha256: sha256(Buffer.from(coordsText)), practice: { sourceSha256: sha256(pbytes), crop: pr.crop, sha256: sha256(ppng), pixelSha256: F.pixelSha256(praw) }, outputs,
  }));
  const n = Object.values(outputs).reduce((a, o) => a + Object.values(o).filter(Boolean).length, 0);
  return { ok: true, outputs: n, sha256: sha256(readFileSync(join(out, "manifest.json"))), out: slash(out) };
}

// ---------------------------------------------------------------- packet and key (5, 6)
const dataUri = (b) => `data:image/png;base64,${b.toString("base64")}`;
export function readerHtml(payload) {
  const tpl = readFileSync(join(researchDir, "tools", "ko-blind-reader", "reader.html"), "utf8").replace(/\r\n/g, "\n");
  // Function sources come from the checked-out lib file; a CRLF checkout must give the same page (LF only).
  const lib = L.INLINED.map((n) => L[n].toString()).join("\n").replace(/\r\n/g, "\n");
  const json = JSON.stringify(payload);
  if (json.includes("<") || json.includes("\u2028") || json.includes("\u2029")) stop("payload_chars");
  if (tpl.split("/*KBR_LIB*/").length !== 2 || tpl.split("__KBR_PAYLOAD__").length !== 2) stop("template");
  return tpl.replace("/*KBR_LIB*/", () => lib).replace("__KBR_PAYLOAD__", () => json);
}

function packet() {
  const set = need("--set"), buildDir = need("--build"), htmlPath = need("--html"), keyPath = need("--key");
  if (existsSync(htmlPath) || existsSync(keyPath)) stop("exists");
  const plan = readJson(join(set, "plan.json"));
  const man = readJson(join(buildDir, "manifest.json"));
  const pr = REG.reader.practice;
  const practicePng = readFileSync(join(buildDir, "practice.png"));
  if (sha256(practicePng) !== man.practice.sha256) stop("practice_sha256");
  const srcs = [...plan.sources].sort((a, b) => a.position - b.position);
  if (srcs.map((s) => s.position).join() !== Array.from({ length: srcs.length }, (_, i) => i + 1).join()) stop("positions");
  const items = [], keyItems = [];
  for (const s of srcs) {
    const o = man.outputs[KIND[s.method]][s.imageId];
    let image = null;
    if (o) {
      const b = readFileSync(join(buildDir, o.file));
      if (sha256(b) !== o.sha256) stop("output_sha256");
      image = dataUri(L.criticalChunksOnly(b));
    }
    const answer = L.normalizeValue(s.qtype, s.answer);
    if (!answer) stop("answer_form");
    items.push({ pos: s.position, question: s.question, qtype: s.qtype, image });
    keyItems.push({ pos: s.position, method: s.method, side: s.side, qtype: s.qtype, answer, displayed: image !== null });
  }
  const body = { format: "kbr-packet-1", packetId: plan.packetId, practice: { question: pr.question, qtype: "time", image: dataUri(L.criticalChunksOnly(practicePng)) }, items };
  const payload = { ...body, packetHash: L.packetHash(body) };
  const html = readerHtml(payload);
  newFile(htmlPath, html);
  const key = { format: "kbr-key-1", packetId: payload.packetId, packetHash: payload.packetHash, items: keyItems };
  newFile(keyPath, pretty(key));
  return { ok: true, items: items.length, packetSha256: sha256(readFileSync(htmlPath)), keySha256: sha256(readFileSync(keyPath)) };
}

// ---------------------------------------------------------------- QA (7)
const IHDR_GRAY8 = (b) => { const s = pngSize(b); return s.bitDepth === 8 && s.colorType === 0; };
function coverage(ink, rects) {
  // rects: source rects (non-overlapping horizontal bands of one x range or one window); ink [x0,y0,x1,y1]
  const area = (ink[2] - ink[0]) * (ink[3] - ink[1]);
  if (area <= 0) return "none";
  let cov = 0;
  for (const r of rects) {
    const w = Math.max(0, Math.min(ink[2], r[2]) - Math.max(ink[0], r[0])), h = Math.max(0, Math.min(ink[3], r[3]) - Math.max(ink[1], r[1]));
    cov += w * h;
  }
  return cov >= area ? "full" : cov > 0 ? "partial" : "none";
}

async function qa() {
  const set = need("--set"), buildDir = need("--build"), htmlPath = need("--html"), keyPath = need("--key"), outPath = need("--out");
  if (existsSync(outPath)) stop("exists");
  const F = await loadFixed();
  const plan = readJson(join(set, "plan.json"));
  const design = readJson(join(set, "design.json"));
  const rj = readJson(join(set, "render", "render.json"));
  const man = readJson(join(buildDir, "manifest.json"));
  const coords = strictJsonl(readFileSync(join(buildDir, "coords.jsonl"), "utf8")).map((l) => JSON.parse(l));
  const coordsById = new Map(coords.map((c) => [c.id, c]));
  const html = readFileSync(htmlPath, "utf8");
  const key = readJson(keyPath);
  const checks = {};
  const fail = (name) => { checks[name] = (checks[name] ?? 0) + 1; };
  const ok = (name) => { if (!(name in checks)) checks[name] = 0; };
  // order and balance (independent of generate.py)
  const planProblems = L.checkPlan(plan);
  if (planProblems.length) fail("plan"); else ok("plan");
  // ids
  const ids = plan.sources.map((s) => s.imageId);
  if (new Set(ids).size !== 18 || new Set(plan.sources.map((s) => s.index)).size !== 18) fail("ids"); else ok("ids");
  // every method output (54): 8-bit gray PNG with IHDR/IDAT/IEND only, size as planned, pixels equal an independent recomposition
  let images = 0;
  for (const s of plan.sources) {
    const c = coordsById.get(s.imageId);
    if (!c) { fail("coords"); continue; }
    const page = readFileSync(join(set, "render", "images", `${s.imageId}.png`));
    const src = await F.decodeGray(page);
    for (const m of METHODS) {
      const o = man.outputs[KIND[m]][s.imageId];
      const win = m === "W1" ? c.w1 : m === "W4" ? c.w4 : null;
      const expectNull = m === "W5" ? c.display === null : win === null;
      if (!o) { if (expectNull) ok("outputs"); else fail("outputs"); continue; }
      images++;
      const b = readFileSync(join(buildDir, o.file));
      const types = L.pngChunkTypes(b);
      if (sha256(b) !== o.sha256) fail("png_sha256"); else ok("png_sha256");
      // build outputs: 8-bit gray, IHDR first, IEND last, IDAT run, the only other chunk allowed is pHYs (no text, time or exif)
      const mid = types ? types.slice(1, -1) : [];
      if (!types || types[0] !== "IHDR" || types[types.length - 1] !== "IEND" || mid.some((x) => !["IDAT", "pHYs"].includes(x)) || !mid.includes("IDAT") || !IHDR_GRAY8(b)) fail("png_format"); else ok("png_format");
      const dec = await sharp(b).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
      if (dec.info.channels !== 1) { fail("png_decode"); continue; }
      let expW, expH, rebuilt;
      if (m === "W5") {
        expW = c.display.width; expH = c.display.height;
        rebuilt = Buffer.alloc(expW * expH);
        for (const pc of c.pieces) {
          const [, dy0, , dy1] = pc.displayRect;
          for (let r = 0; r < dy1 - dy0; r++) {
            if (pc.kind === "separator") rebuilt.fill(pc.luma[r], (dy0 + r) * expW, (dy0 + r + 1) * expW);
            else for (let x = 0; x < expW; x++) rebuilt[(dy0 + r) * expW + x] = src.data[(pc.sourceRect[1] + r) * src.width + pc.sourceRect[0] + x];
          }
        }
      } else {
        expW = win.width; expH = win.height;
        rebuilt = Buffer.alloc(expW * expH);
        for (let r = 0; r < expH; r++) for (let x = 0; x < expW; x++) rebuilt[r * expW + x] = src.data[(win.top + r) * src.width + win.left + x];
      }
      if (dec.info.width !== expW || dec.info.height !== expH || o.width !== expW || o.height !== expH) fail("png_size"); else ok("png_size");
      if (!dec.data.equals(rebuilt)) fail("png_pixels"); else ok("png_pixels");
    }
  }
  // visibility (admin only, never used for selection)
  const visibility = plan.sources.map((s) => {
    const c = coordsById.get(s.imageId);
    const inks = rj.images[s.imageId].items;
    const items = { targetLabel: s.anchorItem, targetValue: s.valueItem, compValue: s.compValueItem, targetHeader: s.targetHeaderItem, compHeader: s.compHeaderItem };
    const rects = {
      W1: c.w1 ? [[c.w1.left, c.w1.top, c.w1.left + c.w1.width, c.w1.top + c.w1.height]] : null,
      W4: c.w4 ? [[c.w4.left, c.w4.top, c.w4.left + c.w4.width, c.w4.top + c.w4.height]] : null,
      W5: c.display ? c.pieces.filter((p) => p.kind === "source").map((p) => p.sourceRect) : null,
    };
    const per = {};
    for (const m of METHODS) per[m] = rects[m] ? Object.fromEntries(Object.entries(items).map(([k, it]) => [k, coverage(inks[it].ink, rects[m])])) : null;
    return { position: s.position, imageId: s.imageId, method: s.method, w5Reason: c.w5Reason, displayed: Boolean(rects[s.method]), visibility: per };
  });
  // packet: payload shape, binding to key, leak scan with canaries, template part
  const m = /<script type="application\/json" id="kbr-payload">([\s\S]*?)<\/script>/.exec(html);
  const payload = m ? JSON.parse(m[1]) : null;
  if (!payload || Object.keys(payload).sort().join() !== "format,items,packetHash,packetId,practice") fail("payload_keys"); else ok("payload_keys");
  if (payload) {
    if (payload.items.some((it) => Object.keys(it).sort().join() !== "image,pos,qtype,question")) fail("payload_keys");
    if (L.packetHash(payload) !== payload.packetHash || payload.packetHash !== key.packetHash || payload.packetId !== key.packetId || payload.packetId !== plan.packetId) fail("binding"); else ok("binding");
    const byPos = new Map(plan.sources.map((s) => [s.position, s]));
    payload.items.forEach((it, i) => {
      const s = byPos.get(it.pos), k = key.items[i];
      if (!s || it.question !== s.question || it.qtype !== s.qtype || k.pos !== it.pos || k.method !== s.method || k.side !== s.side || k.answer !== L.normalizeValue(s.qtype, s.answer) || k.displayed !== (it.image !== null)) fail("key_items");
      else ok("key_items");
      const o = man.outputs[KIND[s.method]][s.imageId];
      const want = o ? dataUri(L.criticalChunksOnly(readFileSync(join(buildDir, o.file)))) : null;
      if (it.image !== want) fail("payload_image"); else ok("payload_image");
    });
  }
  const questions = new Set(plan.sources.map((s) => s.question));
  const canaries = new Set();
  for (const im of design.images) for (const it of im.items) if (![...questions].some((q) => q.includes(it.text))) canaries.add(it.text);
  for (const s of plan.sources) { canaries.add(s.imageId); canaries.add(s.file); }
  // registered public practice constants are part of the fixed template and payload, not item canaries
  const pr = REG.reader.practice;
  for (const x of [pr.title, pr.labelHeader, ...pr.labels, ...pr.fields, ...pr.values.target, ...pr.values.comp, ...pr.aux, ...pr.notes]) canaries.delete(x);
  canaries.add("local-research-admin");
  canaries.add("participant-packets");
  const leaks = L.scanPacketHtml(html, { canaries: [...canaries] });
  if (leaks.length) fail("leak"); else ok("leak");
  const tpl = L.templatePart(html);
  const tplSha = tpl ? sha256(Buffer.from(tpl)) : null;
  const tplOf = opt("--template-of");
  let templateEqual = null;
  if (tplOf) { templateEqual = L.templatePart(readFileSync(tplOf, "utf8")) === tpl; if (!templateEqual) fail("template"); else ok("template"); }
  const failed = Object.values(checks).reduce((a, b) => a + b, 0);
  const res = {
    version: "ko-blind-reader-qa-1", pass: failed === 0, checks, planProblems, images, leaks, canaries: canaries.size, templatePartSha256: tplSha, templateEqual,
    packetSha256: sha256(Buffer.from(html)), keySha256: sha256(readFileSync(keyPath)), manifestSha256: sha256(readFileSync(join(buildDir, "manifest.json"))), visibility,
  };
  newFile(outPath, pretty(res));
  return { ok: res.pass, pass: res.pass, images, checks: Object.keys(checks).length, failed, qaSha256: sha256(readFileSync(outPath)), out: slash(outPath) };
}

// ---------------------------------------------------------------- commitments (8.3)
function commit() {
  const label = need("--label"), file = need("--file"), saltsDir = need("--salts"), pub = need("--public");
  if (!L.COMMIT_LABELS.includes(label)) stop("label");
  const saltFile = join(saltsDir, `${label}.salt.json`);
  if (existsSync(saltFile)) stop("exists");
  const bytes = readFileSync(file);
  const salt = randomBytes(32);
  const c = L.commitment(salt, label, bytes);
  newFile(saltFile, pretty({ label, saltHex: salt.toString("hex"), file: slash(file), fileSha256: sha256(bytes), commitment: c }));
  const doc = existsSync(pub) ? readJson(pub) : { version: "ko-blind-reader-commitments-1", rule: REG.commitments.rule, items: [] };
  if (doc.items.some((x) => x.label === label)) stop("label_exists");
  doc.items.push({ label, commitment: c });
  mkdirSync(dirname(pub), { recursive: true });
  writeFileSync(pub, pretty(doc));
  return { ok: true, sha256: c, commitments: doc.items.length };
}

// ---------------------------------------------------------------- admin folder and reader folder
function installAdmin() {
  const admin = need("--admin");
  const files = [
    [join(researchDir, "src", "ko-blind-reader-score.mjs"), join(admin, "scorer", "ko-blind-reader-score.mjs")],
    [join(researchDir, "src", "ko-blind-reader-lib.mjs"), join(admin, "scorer", "ko-blind-reader-lib.mjs")],
    [join(researchDir, "tools", "ko-blind-reader", "recount.py"), join(admin, "scorer", "recount.py")],
  ];
  for (const [, to] of files) if (existsSync(to)) stop("exists");
  if (existsSync(join(admin, "채점.cmd")) || existsSync(join(admin, "README.txt"))) stop("exists");
  for (const [from, to] of files) { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to, 1); }
  const crlf = (lines) => `${lines.join("\r\n")}\r\n`;
  newFile(join(admin, "채점.cmd"), crlf([
    "@echo off",
    "rem ko-blind-reader local scorer: drag the final response file (kbr-response-*.json) onto this file",
    "if \"%~1\"==\"\" (echo usage: drag the final response file onto this file & exit /b 2)",
    "node \"%~dp0scorer\\ko-blind-reader-score.mjs\" --admin \"%~dp0.\" --response \"%~1\"",
    "if errorlevel 1 (echo FAILED) else (echo OK: see score\\score-table.md)",
    "if exist \"%~dp0score\\score.json\" python \"%~dp0scorer\\recount.py\" --response \"%~dp0responses\\locked.json\" --key \"%~dp0key.json\" --score \"%~dp0score\\score.json\" --out \"%~dp0score\\recount.json\"",
    "pause",
  ]));
  newFile(join(admin, "README.txt"), crlf([
    "ko-blind-reader-pilot 관리자 폴더 (로컬 전용, 외부 전송 금지)",
    "",
    "- 독자 판독지: D:/orca/participant-packets/ko-blind-reader-pilot/start.html (그 폴더에는 이 파일만 둔다)",
    "- 이 폴더: 시드, 생성 자료, OCR, 세 방식 출력, QA, 정답 키, 채점기. 독자가 응답을 닫기 전에는 열지 않는다.",
    "- 채점: 독자가 받은 최종 응답 파일(kbr-response-<packetId>.json)을 '채점.cmd' 위로 끌어다 놓는다.",
    "  처음 통과한 응답이 responses/locked.json으로 고정되고, 점수표는 score/score-table.md, 독립 재계산은 score/recount.json이다.",
    "  다른 응답 파일은 거부된다. 중간 저장 파일(kbr-interim-*)은 채점하지 않는다.",
    "- 점수는 사용자가 원할 때만 대화나 원고에 옮긴다.",
  ]));
  return { ok: true, files: files.length + 2, admin: slash(admin) };
}

function readerVerify() {
  const dir = need("--dir"), want = need("--sha256");
  const names = readdirSync(dir);
  const only = names.length === 1 && names[0] === "start.html" && statSync(join(dir, "start.html")).isFile();
  const sha = only ? sha256(readFileSync(join(dir, "start.html"))) : null;
  return { ok: only && sha === want, files: names.length, pass: only && sha === want, ...(sha ? { packetSha256: sha } : {}) };
}

// ---------------------------------------------------------------- main
const COMMANDS = { gate, render, ocr, predict, build, packet, qa, commit, "install-admin": installAdmin, "reader-verify": readerVerify };
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  let line;
  try {
    if (!COMMANDS[cmd]) stop("usage");
    line = { step: cmd.replace("-", "_"), ...(await COMMANDS[cmd]()) };
  } catch (e) {
    const code = e instanceof Stop ? e.code : e?.code && /^[a-z_]+$/.test(e.code) ? e.code : "error";
    line = { ok: false, step: String(cmd ?? "none").replace(/[^a-z]/g, "_").slice(0, 20) || "none", code };
    if (process.env.KBR_DEBUG === "mock") console.error(e);
  }
  let text;
  try { text = L.safeLine(line); } catch { text = L.safeLine({ ok: false, code: "output_policy" }); }
  console.log(text);
  process.exitCode = line.ok ? 0 : 1;
}
