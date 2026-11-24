// Korean OCR x Hangul key factorial (protocol research/plans/2026-11-24-ko-ocr-factorial-protocol.md).
// Pure functions shared by the runner, the scorer, the comparison and the tests. No OCR, no network here.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LANG_DIR = join(researchDir, ".cache", "ko-ocr-factorial");
export const COHORT_FILE = join(researchDir, "results", "ko-ocr-factorial", "cohort.jsonl");

export const SELECTOR_BLOB = "b3b4965b2d330907c0143fe178013aace1be8372";
export const BASE_COMMIT = "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1";
export const FCP_COMMIT = "708d9946ae091180a1b716baadfdd73fcfe5a19b";
export const DIAG_COMMIT = "cdff545c3eb31bee3099ec4a62cb7b637975b4c7";
export const ENGINE_VERSION = "5.1.1";
export const PAGE_TIMEOUT_MS = 180000;

// Uncompressed traineddata from @tesseract.js-data/<lang>@1.0.0, 4.0.0_best_int (protocol 4.1).
export const LANG_FILES = {
  eng: { sha256: "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747", bytes: 5199098 },
  kor: { sha256: "ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992", bytes: 2208378 },
};
export const OCR_CONDITIONS = { O0: "eng", O1: "eng+kor" };
export const CONDITIONS = ["O0K0", "O0K1", "O1K0", "O1K1"];
export const DATASETS = ["r09", "fcp"];

// Fixed Git objects (protocol 3.1). selector-side: questions + images only. scoring-side: the rest.
export const SOURCES = {
  r09: {
    commit: BASE_COMMIT,
    questions: { path: "research/results/r09-bilingual/heldout/questions.json", blob: "605ff760cc1c12de0a0d21076ac0b8eecb79032a" },
    images: { path: "research/results/r09-bilingual/heldout/images", tree: "66bf13c62c6ae10e380558b7add188747928352b" },
    classes: { path: "research/results/r09-bilingual/heldout/design.json", blob: "dc3307818cba423b3fc2eade8ed7f2116593f788" },
    gold: { path: "research/results/r09-bilingual/heldout/gold.json", blob: "5d6c277d4c9cd55e4a101252fce8032294a21ae9" },
    history: { path: "research/results/r09-bilingual/heldout/run-a/raw.jsonl", blob: "876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318" },
  },
  fcp: {
    commit: FCP_COMMIT,
    questions: { path: "research/results/fresh-crop-padding/frozen/selector-input/questions.json", blob: "ae578b7267ff124ecf4a0a5157f7067925b177ca" },
    images: { path: "research/results/fresh-crop-padding/frozen/selector-input/images", tree: "84eb5dddb4bb37f0ff1bf62e82e523f77e7dbbca" },
    classes: { path: "research/results/fresh-crop-padding/frozen/selector-input/index.json", blob: "75109569a3c310127f4dbe4d8551c259aa537cba" },
    gold: { path: "research/results/fresh-crop-padding/frozen/oracle/gold.json", blob: "eb43d6009cc77b0d86bfb9275ff891477db3d25f" },
    history: { path: "research/results/fresh-crop-padding/run-a/caller.jsonl", blob: "d657d59d7124f68743a1e54a7eb7c62f521dbc21" },
  },
};
export const REPLAY = { commit: DIAG_COMMIT, path: "research/results/ko-anchor-diagnostic/replay.jsonl", blob: "3f0564c2a1988d70de7ed308c2cab80a2dc7e686", sha256: "9510835d4120cf181e3b879bf965446f6b01f8248102e55623f8a02c3b110204" };
export const COHORT_SHA256 = "86ccac534bacaeb6b4ca463fe7f5de41a5b33f68cc534f2002c417e35e6b2eb3";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const gitBlobId = (bytes) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
export const jsonl = (rows) => `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
export const pretty = (obj) => `${JSON.stringify(obj, null, 1)}\n`;
export const parseJsonl = (text) => String(text).replace(/\r\n/g, "\n").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const git = (repo, args, encoding) => execFileSync("git", args, { cwd: repo, encoding, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
export const repoRoot = () => git(researchDir, ["rev-parse", "--show-toplevel"], "utf8").trim();

function needCommit(repo, commit) {
  let t = "";
  try { t = git(repo, ["cat-file", "-t", commit], "utf8").trim(); } catch { /* reported below */ }
  if (t !== "commit") throw new Error(`commit ${commit} is missing; run: git fetch origin pull/145/head pull/146/head`);
}

/** Bytes of a fixed blob, checked against the commit path and the recomputed blob id. */
export function readFixedBlob(repo, commit, { path, blob }) {
  needCommit(repo, commit);
  const atPath = git(repo, ["rev-parse", `${commit}:${path}`], "utf8").trim();
  if (atPath !== blob) throw new Error(`${commit}:${path} is ${atPath}, not ${blob}`);
  const bytes = git(repo, ["cat-file", "blob", blob]);
  if (gitBlobId(bytes) !== blob) throw new Error(`${path}: bytes hash to ${gitBlobId(bytes)}, not ${blob}`);
  return bytes;
}

/** Map file name -> bytes for one fixed image tree. */
export function readFixedImages(repo, commit, { path, tree }) {
  needCommit(repo, commit);
  const atPath = git(repo, ["rev-parse", `${commit}:${path}`], "utf8").trim();
  if (atPath !== tree) throw new Error(`${commit}:${path} is ${atPath}, not ${tree}`);
  const out = new Map();
  for (const row of git(repo, ["ls-tree", tree], "utf8").trim().split("\n")) {
    const [meta, name] = row.split("\t");
    const [, type, blob] = meta.split(" ");
    if (type !== "blob") throw new Error(`${path}/${name} is not a blob`);
    const bytes = git(repo, ["cat-file", "blob", blob]);
    if (gitBlobId(bytes) !== blob) throw new Error(`${path}/${name}: blob mismatch`);
    out.set(name, bytes);
  }
  return out;
}

/** Selector-side input: questions in registered order with their PNG bytes. Reads nothing else. */
export function readSelectorInputs(repo, ds) {
  const src = SOURCES[ds];
  const q = JSON.parse(readFixedBlob(repo, src.commit, src.questions).toString("utf8")).questions;
  const images = readFixedImages(repo, src.commit, src.images);
  if (q.length !== 48) throw new Error(`${ds}: ${q.length} questions, not 48`);
  if (new Set(q.map((x) => x.id)).size !== 48) throw new Error(`${ds}: duplicate question ids`);
  return q.map((x) => {
    const bytes = images.get(x.file);
    if (!bytes) throw new Error(`${ds}: image ${x.file} missing`);
    return { dataset: ds, id: x.id, question: x.question, bytes };
  });
}

/** The scoring-only cohort list (protocol 3.2). */
export function readCohort(file = COHORT_FILE) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (sha256(Buffer.from(text, "utf8")) !== COHORT_SHA256) throw new Error("cohort.jsonl SHA-256 differs from the registered value");
  return parseJsonl(text);
}

// ------------------------------------------------------------------ language files and freeze
export function checkLangFiles(dir, langs) {
  return langs.map((lang) => {
    const want = LANG_FILES[lang];
    if (!want) throw new Error(`unknown language ${lang}`);
    const path = join(dir, `${lang}.traineddata`);
    if (!existsSync(path)) throw new Error(`language file missing: ${lang}.traineddata`);
    const bytes = readFileSync(path);
    if (bytes.length !== want.bytes) throw new Error(`${lang}.traineddata size ${bytes.length} != ${want.bytes}`);
    const got = sha256(bytes);
    if (got !== want.sha256) throw new Error(`${lang}.traineddata sha ${got} != ${want.sha256}`);
    return { lang, file: `${lang}.traineddata`, bytes: bytes.length, sha256: got };
  });
}

export const FROZEN_FILES = ["predictions.jsonl", "ocr.jsonl"];
export function writeFreeze(dir) {
  const files = Object.fromEntries(FROZEN_FILES.map((f) => [f, sha256(readFileSync(join(dir, f)))]));
  writeFileSync(join(dir, "freeze.json"), pretty({ hashBasis: "SHA-256 of raw file bytes", files }));
  return files;
}
export function checkFreeze(dir) {
  const fz = JSON.parse(readFileSync(join(dir, "freeze.json"), "utf8"));
  for (const f of FROZEN_FILES) {
    const got = sha256(readFileSync(join(dir, f)));
    if (fz.files?.[f] !== got) throw new Error(`${f} sha ${got} differs from freeze.json ${fz.files?.[f]}`);
  }
  return fz.files;
}

// ------------------------------------------------------------------ representation (protocol 4.2)
const HANGUL_RUN = /[가-힣]+/gu;
/** NFC -> maximal runs of modern Hangul syllables -> overlapping syllable bigrams -> sorted unique list. */
export function hangulBigrams(text) {
  const set = new Set();
  for (const run of String(text).normalize("NFC").match(HANGUL_RUN) || []) {
    const chars = [...run];
    for (let i = 0; i + 1 < chars.length; i++) set.add(chars[i] + chars[i + 1]);
  }
  return [...set].sort();
}

// ------------------------------------------------------------------ validation
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const box4 = (b) => Array.isArray(b) && b.length === 4 && b.every(finite);
/** null when the OCR lines are complete, else a short reason (protocol 4.2 input validation). */
export function validateOcrLines(lines) {
  if (!Array.isArray(lines)) return "lines not an array";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || typeof l !== "object") return `line ${i} not an object`;
    if (typeof l.text !== "string") return `line ${i} text`;
    if (!finite(l.confidence)) return `line ${i} confidence`;
    if (!box4(l.box)) return `line ${i} line box`;
    if (!Array.isArray(l.words)) return `line ${i} words`;
    for (let j = 0; j < l.words.length; j++) {
      const w = l.words[j];
      if (!w || typeof w.text !== "string") return `line ${i} word ${j} text`;
      if (!box4(w.box)) return `line ${i} word ${j} word box`;
    }
  }
  return null;
}
export const validBand = (b, w, h) => Boolean(b) && [b.left, b.top, b.width, b.height].every(Number.isInteger) && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0 && b.left + b.width <= w && b.top + b.height <= h;

// ------------------------------------------------------------------ key conditions
const SHAPE = { status: null, error: null, branch: null, keys: null, hangulKeys: null, matched: null, score: null, lineIndex: null, lineText: null, confidence: null, axisRow: null, lineBox: null, anchor: null, hitWords: null, band: null };
const shaped = (o) => ({ ...SHAPE, ...o });
const errMsg = (err) => String(err?.message || err).slice(0, 200);

/** Same geometry as the fixed selectWindow after the anchor is known. */
export function windowFromAnchor(line, anchor, width, height) {
  const lh = Math.max(8, line.box[3]);
  const meanLen = line.words.reduce((a, w) => a + w.text.length, 0) / Math.max(1, line.words.length);
  const axisRow = line.words.length >= 8 && meanLen <= 4 && anchor[2] < 0.25 * line.box[2];
  let x0, y0, x1, y1;
  if (axisRow) {
    const half = Math.max(1.5 * anchor[2], 3 * lh);
    const cx = anchor[0] + anchor[2] / 2;
    [x0, x1] = [cx - half, cx + half];
    [y0, y1] = [anchor[1] - 0.75 * height, anchor[1] + anchor[3] + 6 * lh];
  } else {
    [x0, x1] = [Math.min(anchor[0], line.box[0]) - 4 * lh, line.box[0] + line.box[2] + 8 * lh];
    [y0, y1] = [line.box[1] - 3 * lh, line.box[1] + line.box[3] + 6 * lh];
  }
  const grow = (a, b, min) => { const need = min - (b - a); return need > 0 ? [a - need / 2, b + need / 2] : [a, b]; };
  [x0, x1] = grow(x0, x1, 256);
  [y0, y1] = grow(y0, y1, 128);
  const left = Math.max(0, Math.floor(x0)), top = Math.max(0, Math.floor(y0));
  const right = Math.min(width, Math.ceil(x1)), bottom = Math.min(height, Math.ceil(y1));
  return { axisRow, band: { left, top, width: right - left, height: bottom - top } };
}

/** K0: the fixed selectWindow, unchanged, plus the index of the line it chose (same tie rule, recomputed per line). */
export function k0Select(selectWindow, lines, question, width, height) {
  let sel;
  try {
    sel = selectWindow(lines, question, width, height);
  } catch (err) {
    return shaped({ status: "error", error: `k0_exception: ${errMsg(err)}`, branch: "k0" });
  }
  const base = { status: "ok", error: null, branch: "k0", keys: sel.keys, matched: sel.matched, score: sel.score ?? 0 };
  if (!sel.matched) return shaped(base);
  let pick = -1, best = null;
  lines.forEach((l, i) => {
    const s = selectWindow([l], question, width, height).score || 0;
    if (s > 0 && (!best || s > best.s || (s === best.s && l.confidence > best.c))) { best = { s, c: l.confidence }; pick = i; }
  });
  const out = { ...base, lineIndex: pick >= 0 ? pick : null, lineText: sel.lineText ?? null, confidence: sel.confidence ?? null, axisRow: sel.axisRow ?? null, lineBox: pick >= 0 ? lines[pick].box : null, band: sel.band ?? null };
  if (pick < 0 || lines[pick].text !== sel.lineText || best.s !== sel.score) return shaped({ ...out, status: "error", error: "invalid_output: chosen line not recovered" });
  if (!validBand(sel.band, width, height)) return shaped({ ...out, status: "error", error: "invalid_output: band" });
  return shaped(out);
}

/** K1: K0 first; only when K0 is unmatched, the Hangul syllable-bigram fallback (protocol 4.2). */
export function k1Select(selectWindow, lines, question, width, height, k0) {
  const Q = hangulBigrams(question);
  if (k0.status !== "ok") return shaped({ status: "error", error: `k0: ${k0.error}`, branch: "k0", hangulKeys: Q });
  if (k0.matched) return shaped({ ...k0, hangulKeys: Q });
  const unmatched = shaped({ status: "ok", error: null, branch: "none", keys: k0.keys, hangulKeys: Q, matched: false, score: 0 });
  try {
    if (!Q.length) return unmatched;
    const qs = new Set(Q);
    let best = null;
    lines.forEach((l, i) => {
      const found = new Set();
      for (const w of l.words) for (const b of hangulBigrams(w.text)) if (qs.has(b)) found.add(b);
      const s = found.size;
      if (s > 0 && (!best || s > best.s || (s === best.s && l.confidence > best.line.confidence))) best = { s, line: l, i };
    });
    if (!best) return unmatched;
    const line = best.line;
    const hitWords = [];
    line.words.forEach((w, j) => { if (hangulBigrams(w.text).some((b) => qs.has(b))) hitWords.push(j); });
    const boxes = hitWords.map((j) => line.words[j].box);
    const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1]));
    const x1 = Math.max(...boxes.map((b) => b[0] + b[2])), y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
    const anchor = [x0, y0, x1 - x0, y1 - y0];
    const { axisRow, band } = windowFromAnchor(line, anchor, width, height);
    const out = { status: "ok", error: null, branch: "hangul", keys: k0.keys, hangulKeys: Q, matched: true, score: best.s, lineIndex: best.i, lineText: line.text, confidence: Math.round(line.confidence), axisRow, lineBox: line.box, anchor, hitWords, band };
    if (!validBand(band, width, height)) return shaped({ ...out, status: "error", error: "invalid_output: band" });
    return shaped(out);
  } catch (err) {
    return shaped({ status: "error", error: `k1_exception: ${errMsg(err)}`, branch: "hangul", keys: k0.keys, hangulKeys: Q });
  }
}

/** Both key conditions for one page's OCR lines. Invalid input makes both technical errors. */
export function keyResults(selectWindow, lines, question, width, height) {
  const bad = validateOcrLines(lines);
  if (bad) {
    const e = shaped({ status: "error", error: "input_validation" });
    return { inputError: bad, k0: { ...e, branch: "k0" }, k1: { ...e, branch: "k0", hangulKeys: hangulBigrams(question) } };
  }
  const k0 = k0Select(selectWindow, lines, question, width, height);
  const k1 = k1Select(selectWindow, lines, question, width, height, k0);
  return { inputError: null, k0, k1 };
}

// ------------------------------------------------------------------ scoring (protocol 6.1)
/** rect [l, t, r, b) inside the half-open band, zero margin. */
export const contains = ([l, t, r, b], band) => l >= band.left && t >= band.top && r <= band.left + band.width && b <= band.top + band.height;
export function evidenceOf(band, parts) {
  const n = parts.filter((p) => contains(p, band)).length;
  return n === parts.length ? "all" : n > 0 ? "partial" : "none";
}
export function scoreKey(key, page, parts) {
  if (key.status !== "ok") return { state: "technical_error", matched: null, fallback: null, strict: false, evidence: null, fullPage: null };
  if (!key.matched) return { state: "unmatched", matched: false, fallback: true, strict: false, evidence: null, fullPage: null };
  const area = key.band.width * key.band.height;
  const pageArea = page.width * page.height;
  const evidence = evidenceOf(key.band, parts);
  const fullPage = area >= pageArea;
  const strict = area > 0 && area < pageArea && evidence === "all";
  return { state: strict ? "matched_strict" : "matched_not_strict", matched: true, fallback: false, strict, evidence, fullPage };
}

// ------------------------------------------------------------------ summary (protocol 6.2)
export const pct = (c, n) => (n > 0 ? Math.round((c * 10000) / n) / 100 : null);

function block(rows) {
  const cnt = (f) => rows.filter(f).length;
  const prim = rows.filter((r) => !r.baselineMatched);
  const ctrl = rows.filter((r) => r.baselineMatched);
  const isErr = (r) => r.state === "technical_error";
  const bs = ctrl.filter((r) => r.baselineStrict);
  const bns = ctrl.filter((r) => !r.baselineStrict);
  const byCell = {};
  for (const r of rows) {
    byCell[r.cell] ??= { n: 0, technicalError: 0, matched: 0, unmatched: 0, strict: 0 };
    const c = byCell[r.cell];
    c.n++;
    if (isErr(r)) c.technicalError++;
    else if (r.state === "unmatched") c.unmatched++;
    else c.matched++;
    if (r.strict) c.strict++;
  }
  const primary = {
    n: prim.length,
    technicalError: prim.filter(isErr).length,
    matched: prim.filter((r) => r.matched === true).length,
    strict: prim.filter((r) => r.strict).length,
    matchedOnly: prim.filter((r) => r.state === "matched_not_strict").length,
    evidencePartial: prim.filter((r) => r.evidence === "partial").length,
    evidenceNone: prim.filter((r) => r.evidence === "none").length,
    unmatched: prim.filter((r) => r.state === "unmatched").length,
  };
  primary.matchedPct = pct(primary.matched, primary.n);
  primary.strictPct = pct(primary.strict, primary.n);
  const control = {
    n: ctrl.length,
    technicalError: ctrl.filter(isErr).length,
    matchedToUnmatched: ctrl.filter((r) => r.state === "unmatched").length,
    stillMatched: ctrl.filter((r) => r.matched === true).length,
    baselineStrict: bs.length,
    strictToFail: bs.filter((r) => r.state === "unmatched" || r.state === "matched_not_strict").length,
    strictToFailUnmatched: bs.filter((r) => r.state === "unmatched").length,
    matchedKeptLostEvidence: bs.filter((r) => r.state === "matched_not_strict").length,
    strictTechnicalError: bs.filter(isErr).length,
    baselineNotStrict: bns.length,
    newStrict: bns.filter((r) => r.strict).length,
    strict: ctrl.filter((r) => r.strict).length,
  };
  control.matchedToUnmatchedPct = pct(control.matchedToUnmatched, control.n);
  control.strictToFailPct = pct(control.strictToFail, control.baselineStrict);
  return {
    n: rows.length,
    technicalError: cnt(isErr),
    matched: cnt((r) => r.matched === true),
    unmatched: cnt((r) => r.state === "unmatched"),
    strict: cnt((r) => r.strict),
    strictPct: pct(cnt((r) => r.strict), rows.length),
    primary,
    control,
    byCell: Object.fromEntries(Object.keys(byCell).sort().map((k) => [k, byCell[k]])),
  };
}

const PAIRS = [["O0K0", "O0K1"], ["O1K0", "O1K1"], ["O0K0", "O1K0"], ["O0K1", "O1K1"], ["O0K0", "O1K1"]];
function pairTable(rows, from, to, field) {
  const key = (r) => `${r.dataset}|${r.id}`;
  const a = new Map(rows.filter((r) => r.cond === from).map((r) => [key(r), r]));
  const t = { n: 0, both: 0, fromOnly: 0, toOnly: 0, neither: 0, technicalError: 0 };
  for (const r of rows.filter((x) => x.cond === to)) {
    const f = a.get(key(r));
    t.n++;
    if (!f || f.state === "technical_error" || r.state === "technical_error") { t.technicalError++; continue; }
    const x = field === "strict" ? f.strict : f.matched === true, y = field === "strict" ? r.strict : r.matched === true;
    if (x && y) t.both++; else if (x) t.fromOnly++; else if (y) t.toOnly++; else t.neither++;
  }
  return t;
}

export function summarize(rows) {
  const conditions = {};
  for (const cond of CONDITIONS) {
    const rc = rows.filter((r) => r.cond === cond);
    conditions[cond] = { r09: block(rc.filter((r) => r.dataset === "r09")), fcp: block(rc.filter((r) => r.dataset === "fcp")), total: block(rc) };
  }
  const pairs = {};
  for (const [from, to] of PAIRS) {
    const sub = rows.filter((r) => r.cond === from || r.cond === to);
    pairs[`${from}->${to}`] = { primary: {}, control: {}, total: {} };
    for (const [grp, f] of [["primary", (r) => !r.baselineMatched], ["control", (r) => r.baselineMatched], ["total", () => true]]) {
      const g = sub.filter(f);
      pairs[`${from}->${to}`][grp] = { strict: pairTable(g, from, to, "strict"), matched: pairTable(g, from, to, "matched") };
    }
  }
  return { conditions, pairs };
}

// ------------------------------------------------------------------ interaction contrasts (protocol 6.2, final review)
const METRICS = {
  matchRecovery: { sign: 1, get: (t) => [t.primary.matched, t.primary.n, t.primary.technicalError] },
  strictRecovery: { sign: 1, get: (t) => [t.primary.strict, t.primary.n, t.primary.technicalError] },
  matchedToUnmatched: { sign: -1, get: (t) => [t.control.matchedToUnmatched, t.control.n, t.control.technicalError] },
  strictToFail: { sign: -1, get: (t) => [t.control.strictToFail, t.control.baselineStrict, t.control.strictTechnicalError] },
  totalStrict: { sign: 1, get: (t) => [t.strict, t.n, t.technicalError] },
};
export function interaction(summary) {
  const out = {};
  for (const [name, m] of Object.entries(METRICS)) {
    const raw = {};
    let errs = 0;
    for (const c of CONDITIONS) {
      const [count, denom, e] = m.get(summary.conditions[c].total);
      raw[c] = { count, denom, pct: pct(count, denom) };
      errs += e;
    }
    const denoms = new Set(CONDITIONS.map((c) => raw[c].denom));
    const denom = denoms.size === 1 ? raw.O0K0.denom : null;
    const v = (c) => m.sign * raw[c].count;
    const eff = (x) => ({ count: x, pp: denom ? pct(x, denom) : null });
    out[name] = {
      direction: m.sign === 1 ? "count is a success; positive effect = improvement" : "count is a loss; effects use the negated count, positive = improvement",
      raw,
      denom,
      kAtO0: eff(v("O0K1") - v("O0K0")),
      kAtO1: eff(v("O1K1") - v("O1K0")),
      oAtK0: eff(v("O1K0") - v("O0K0")),
      oAtK1: eff(v("O1K1") - v("O0K1")),
      interaction: eff((v("O1K1") - v("O1K0")) - (v("O0K1") - v("O0K0"))),
      technicalErrors: errs,
      qualified: errs > 0,
    };
  }
  return out;
}
