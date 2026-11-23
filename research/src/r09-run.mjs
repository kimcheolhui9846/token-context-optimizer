// R09 selector run. Inputs: questions.json (id, file, question) and the original PNG pixels only.
// No answer, code, gold box or design file is read here. Usage:
//   node src/r09-run.mjs --questions <questions.json> --images <dir> --out <dir>
// Writes <out>/raw.jsonl (deterministic per-image records) and <out>/run-meta.json (timing and environment, not
// deterministic). Pre-registered: one CPU tesseract worker, images in question order, no retry; an exception, a
// timeout of TIMEOUT_MS per image or an invalid selector output is a technical failure kept in raw.jsonl.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { SELECTOR_C1, createOcr, selectWindow } from "./selector.mjs";

export const TIMEOUT_MS = 180000;
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const qFile = arg("--questions");
const imgDir = arg("--images");
const out = arg("--out");
if (!qFile || !imgDir || !out) throw new Error("--questions, --images and --out are required");
const { questions, version, set } = JSON.parse(readFileSync(qFile, "utf8"));
mkdirSync(out, { recursive: true });

const withTimeout = (p, ms) => {
  let timer;
  return Promise.race([p.finally(() => clearTimeout(timer)), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms)))]);
};
const validBand = (b, w, h) => b && [b.left, b.top, b.width, b.height].every(Number.isInteger) && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0 && b.left + b.width <= w && b.top + b.height <= h;

let ocr = await createOcr();
const lines = [];
const timing = [];
const started = Date.now();
for (const q of questions) {
  const t0 = Date.now();
  let rec;
  try {
    const bytes = readFileSync(join(imgDir, q.file));
    const meta = await sharp(bytes).metadata();
    const ocrLines = await withTimeout(ocr.lines(bytes), TIMEOUT_MS);
    const sel = selectWindow(ocrLines, q.question, meta.width, meta.height);
    // Every OCR line the frozen rule scores above zero, with its score and confidence (ties are kept, not resolved here).
    const candidates = ocrLines
      .map((l, index) => ({ index, text: l.text, confidence: l.confidence, box: l.box, score: selectWindow([l], q.question, meta.width, meta.height).score || 0 }))
      .filter((c) => c.score > 0);
    // Same order and tie rule as selectWindow: higher score, then strictly higher confidence; the first line wins ties.
    let pick = null;
    for (const c of candidates) if (!pick || c.score > pick.score || (c.score === pick.score && c.confidence > pick.confidence)) pick = c;
    const matchedLine = sel.matched && pick ? ocrLines[pick.index] : null;
    const tiedWithPick = pick ? candidates.filter((c) => c !== pick && c.score === pick.score).length : 0;
    rec = { id: q.id, status: "ok", width: meta.width, height: meta.height, keys: sel.keys, matched: sel.matched, score: sel.score ?? 0, lineText: sel.lineText ?? null, confidence: sel.confidence ?? null, axisRow: sel.axisRow ?? null, band: sel.band ?? null, matchedLine: matchedLine ? { index: pick.index, text: matchedLine.text, box: matchedLine.box, words: matchedLine.words } : null, tiedWithPick, candidates, ocrLineCount: ocrLines.length, ocrLines };
    if (sel.matched && !validBand(sel.band, meta.width, meta.height)) rec = { ...rec, status: "error", error: "invalid_output" };
  } catch (err) {
    rec = { id: q.id, status: "error", error: String(err.message || err).slice(0, 200) };
    if (/^timeout/.test(rec.error)) {
      await ocr.terminate().catch(() => {});
      ocr = await createOcr();
    }
  }
  lines.push(JSON.stringify(rec));
  timing.push({ id: q.id, ms: Date.now() - t0 });
  console.log(`${q.id}: ${rec.status} ${rec.matched ? `matched ${JSON.stringify(rec.band)}` : rec.error || "no match"}`);
}
await ocr.terminate();
writeFileSync(join(out, "raw.jsonl"), `${lines.join("\n")}\n`);
writeFileSync(join(out, "run-meta.json"), `${JSON.stringify({ design: version, set, selector: SELECTOR_C1, timeoutMs: TIMEOUT_MS, node: process.version, platform: `${process.platform}-${process.arch}`, startedAt: new Date(started).toISOString(), totalMs: Date.now() - started, timing }, null, 1)}\n`);
