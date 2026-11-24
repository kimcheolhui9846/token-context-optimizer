// ko-row-window: replay of the frozen OCR into W0/W1 predictions (protocol research/plans/2026-11-24-ko-row-window-protocol.md, 4.3-4.5).
// Usage (from research/): node src/ko-row-window-replay.mjs --ocr <ocr dir> --out <new dir>
// Reads only questions.json, PNG bytes (size and hash) of the frozen data commit and the frozen OCR folder.
// Never reads design.json, gold.json or render.json. Writes predictions.jsonl (48 lines) and freeze.json.
// Exit 3 = task verification failure (hash, id, K1 replay or record mismatch): writes invalid.json and no predictions.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { selectWindow } from "./selector.mjs";
import { checkSelectorFile, loadFixedLib } from "./ko-row-window-fixed.mjs";
import { PAGES, frozenDataReader, pngSize, readSelectorInputs } from "./ko-row-window-data.mjs";
import { ValidationError, buildPrediction, checkIdSet } from "./ko-row-window-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const ocrDir = arg("--ocr"), out = arg("--out");
if (!ocrDir || !out) throw new Error("--ocr and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;

const lib = await loadFixedLib();
const parse = (f) => {
  const text = readFileSync(join(ocrDir, f), "utf8");
  if (text.includes("\r")) throw new ValidationError(`${f} has CR`);
  return lib.parseJsonl(text);
};
mkdirSync(out, { recursive: true });
try {
  checkSelectorFile();
  const fz = JSON.parse(readFileSync(join(ocrDir, "freeze.json"), "utf8")).files;
  for (const f of ["ocr.jsonl", "k1.jsonl"]) {
    const got = lib.sha256(readFileSync(join(ocrDir, f)));
    if (fz?.[f] !== got) throw new ValidationError(`${f} SHA-256 ${got} differs from freeze.json`);
  }
  if (existsSync(join(ocrDir, "incomplete.json"))) throw new ValidationError("the OCR run is incomplete (incomplete.json)");
  const inputs = readSelectorInputs(frozenDataReader());
  const ids = inputs.map((p) => p.id);
  const ocrRows = parse("ocr.jsonl"), k1Rows = parse("k1.jsonl");
  checkIdSet(ocrRows, ids);
  checkIdSet(k1Rows, ids);
  const recompute = (lines, q, w, h) => lib.keyResults(selectWindow, lines, q, w, h).k1;
  const preds = inputs.map((p, i) => {
    const { width, height } = pngSize(p.bytes);
    return buildPrediction({ id: p.id, question: p.question, pngSha256: lib.sha256(p.bytes), width, height, ocrRow: ocrRows[i], k1Row: k1Rows[i] }, recompute);
  });
  if (preds.length !== PAGES) throw new ValidationError(`${preds.length} predictions`);
  writeFileSync(join(out, "predictions.jsonl"), lib.jsonl(preds));
  const sha = lib.sha256(readFileSync(join(out, "predictions.jsonl")));
  writeFileSync(join(out, "freeze.json"), pretty({ hashBasis: "SHA-256 of raw file bytes", files: { "predictions.jsonl": sha }, ocrFreeze: fz }));
  const reasons = preds.reduce((m, r) => ({ ...m, [r.reason]: (m[r.reason] ?? 0) + 1 }), {});
  console.log(`done: ${preds.length} predictions ${JSON.stringify(reasons)} sha256 ${sha}`);
} catch (err) {
  const verification = err instanceof ValidationError;
  writeFileSync(join(out, "invalid.json"), pretty({ verificationFailure: verification, message: String(err?.message || err).slice(0, 500) }));
  console.error(`${verification ? "verification failure" : "error"}: ${err?.message || err}`);
  process.exitCode = 3;
}
