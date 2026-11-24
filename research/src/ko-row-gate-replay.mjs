// ko-row-gate: replay of the frozen OCR into W0/W1/W2/W3 predictions (protocol research/plans/2026-11-24-ko-row-gate-protocol.md, 4.3-4.5).
// Usage (from research/): node src/ko-row-gate-replay.mjs --ocr <ocr dir> --out <new dir>
// Data access goes only through the selector-side allowlist reader (selector/questions.json, selector/images/*.png); the frozen
// OCR folder is read for ocr.jsonl, k1.jsonl and freeze.json. Writes predictions.jsonl (48 lines), freeze.json and inputs.json
// (every input actually opened, with its SHA-256). Exit 3 = task verification failure: writes invalid.json and no predictions.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { selectWindow } from "./selector.mjs";
import { FIXED, checkSelectorFile, loadFixedLib, loadFixedW1, loadFixedW2 } from "./ko-row-gate-fixed.mjs";
import { DATA_COMMIT, MANIFEST_SHA256, PAGES, frozenDataReader, pngSize, readSelectorInputs, selectorView } from "./ko-row-gate-data.mjs";
import { ValidationError, buildPrediction, checkIdSet, parseExact } from "./ko-row-gate-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const ocrDir = arg("--ocr"), out = arg("--out");
if (!ocrDir || !out) throw new Error("--ocr and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;

const lib = await loadFixedLib();
const { w1Rule } = await loadFixedW1();
const w2lib = await loadFixedW2();
const dataLog = [], ocrLog = [];
const OCR_ALLOW = new Set(["freeze.json", "ocr.jsonl", "k1.jsonl"]);
const readOcr = (f) => {
  if (!OCR_ALLOW.has(f)) throw new Error(`replay may not read ${f} from the OCR folder`);
  const b = readFileSync(join(ocrDir, f));
  ocrLog.push({ path: `ocr/${f}`, sha256: lib.sha256(b), bytes: b.length });
  return b;
};
const texts = {};
const parse = (f) => {
  const text = readOcr(f).toString("utf8");
  if (text.includes("\r")) throw new ValidationError(`${f} has CR`);
  texts[f] = text;
  return lib.parseJsonl(text);
};
/** Same JSONL with every number kept as its JSON source text (W3 exact comparisons, RECOUNT_SPEC 4.0). */
const parseExactJsonl = (text) => {
  if (!text.endsWith("\n") || text.endsWith("\n\n")) throw new ValidationError("JSONL must end with exactly one newline");
  return text.slice(0, -1).split("\n").map((l) => parseExact(l));
};
mkdirSync(out, { recursive: true });
try {
  checkSelectorFile();
  const fz = JSON.parse(readOcr("freeze.json").toString("utf8")).files;
  const ocrRows = parse("ocr.jsonl"), k1Rows = parse("k1.jsonl");
  const ocrExact = parseExactJsonl(texts["ocr.jsonl"]);
  if (ocrExact.length !== ocrRows.length) throw new ValidationError("exact OCR rows differ in number");
  for (const f of ["ocr.jsonl", "k1.jsonl"]) {
    const got = ocrLog.find((e) => e.path === `ocr/${f}`).sha256;
    if (fz?.[f] !== got) throw new ValidationError(`${f} SHA-256 ${got} differs from freeze.json`);
  }
  if (existsSync(join(ocrDir, "incomplete.json"))) throw new ValidationError("the OCR run is incomplete (incomplete.json)");
  const inputs = readSelectorInputs(selectorView(frozenDataReader(), dataLog));
  const ids = inputs.map((p) => p.id);
  checkIdSet(ocrRows, ids);
  checkIdSet(k1Rows, ids);
  const recompute = (lines, q, w, h) => lib.keyResults(selectWindow, lines, q, w, h).k1;
  const preds = inputs.map((p, i) => {
    const { width, height } = pngSize(p.bytes);
    if (ocrExact[i].id !== p.id) throw new ValidationError(`${p.id}: exact OCR row id`);
    return buildPrediction({ id: p.id, question: p.question, pngSha256: lib.sha256(p.bytes), width, height, ocrRow: ocrRows[i], ocrLinesExact: ocrExact[i].ocrLines, k1Row: k1Rows[i] }, recompute, { w1Rule, w2lib });
  });
  if (preds.length !== PAGES) throw new ValidationError(`${preds.length} predictions`);
  writeFileSync(join(out, "predictions.jsonl"), lib.jsonl(preds));
  const sha = lib.sha256(readFileSync(join(out, "predictions.jsonl")));
  writeFileSync(join(out, "inputs.json"), pretty({
    version: "ko-row-gate-inputs-1", note: "every input the replay opened; data reads went through the selector-side allowlist",
    dataCommit: DATA_COMMIT, manifestSha256: MANIFEST_SHA256, fixed: { k1Lib: FIXED.lib.blob, w1Lib: FIXED.w1.blob, w2Lib: FIXED.w2.blob, selector: FIXED.selector.blob },
    data: dataLog, ocr: ocrLog,
  }));
  writeFileSync(join(out, "freeze.json"), pretty({ hashBasis: "SHA-256 of raw file bytes", files: { "predictions.jsonl": sha, "inputs.json": lib.sha256(readFileSync(join(out, "inputs.json"))) }, ocrFreeze: fz }));
  const count = (k) => preds.reduce((m, r) => ({ ...m, [r[k]]: (m[r[k]] ?? 0) + 1 }), {});
  console.log(`done: ${preds.length} predictions W1 ${JSON.stringify(count("reason"))} W2 ${JSON.stringify(count("w2Reason"))} W3 ${JSON.stringify(count("w3Reason"))} sha256 ${sha}`);
} catch (err) {
  const verification = err instanceof ValidationError;
  writeFileSync(join(out, "invalid.json"), pretty({ verificationFailure: verification, message: String(err?.message || err).slice(0, 500) }));
  console.error(`${verification ? "verification failure" : "error"}: ${err?.message || err}`);
  process.exitCode = 3;
}
