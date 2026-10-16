// Query-aware region selector (arm C) and guard (arm D) for the thin slice.
// Inputs are only the question text and the assigned variant pixels (via OCR); no gold answer or evidence box.
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { cacheDir } from "./env.mjs";

export const SELECTOR = {
  ocr: "tesseract.js 5.1.1 eng, image upscaled so the long side is 4096 px (at most 4x)",
  band: "full width, height max(25% of image height, 6 x matched line height), centered on the matched line",
  guard: "fallback to the assigned original when no OCR line matches a question keyword or the matched line confidence < 60",
  minConfidence: 60,
};
const STOP = new Set("what which when where who how much many the and for are was were with from that this into onto shown show written according answer number value label labeled labelled noted under screen image chart line card item bottom top next turned does there their your have has".split(" "));

export async function createOcr() {
  const worker = await createWorker("eng", 1, { cachePath: cacheDir });
  return {
    async lines(bytes) {
      const meta = await sharp(bytes).metadata();
      const scale = Math.min(4, 4096 / Math.max(meta.width, meta.height));
      const img = await sharp(bytes).resize({ width: Math.round(meta.width * scale) }).png().toBuffer();
      const { data } = await worker.recognize(img, {}, { blocks: true });
      const toBox = (bb) => [bb.x0 / scale, bb.y0 / scale, (bb.x1 - bb.x0) / scale, (bb.y1 - bb.y0) / scale];
      return data.blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({
        text: l.text.trim(),
        confidence: l.confidence,
        box: toBox(l.bbox),
        words: (l.words || []).map((w) => ({ text: w.text, box: toBox(w.bbox) })),
      }));
    },
    terminate: () => worker.terminate(),
  };
}

const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9\- ]/g, " ").split(/\s+/).filter(Boolean);
export const keywords = (question) => [...new Set(tokens(question).filter((t) => t.length >= 3 && !STOP.has(t)))];

function score(line, keys) {
  const words = tokens(line.text);
  return keys.filter((k) => words.some((w) => w === k || (k.length >= 4 && (w.startsWith(k) || k.startsWith(w)) && w.length >= 4))).length;
}

export function select(lines, question, width, height) {
  const keys = keywords(question);
  let best = null;
  for (const line of lines) {
    const s = score(line, keys);
    if (s > 0 && (!best || s > best.score || (s === best.score && line.confidence > best.line.confidence))) best = { score: s, line };
  }
  if (!best) return { matched: false, keys };
  const lh = best.line.box[3];
  const bandH = Math.min(height, Math.round(Math.max(0.25 * height, 6 * lh)));
  const cy = best.line.box[1] + lh / 2;
  const top = Math.max(0, Math.min(height - bandH, Math.round(cy - bandH / 2)));
  return {
    matched: true,
    keys,
    score: best.score,
    lineText: best.line.text,
    confidence: Math.round(best.line.confidence),
    band: { left: 0, top, width, height: bandH },
  };
}

export const guardFallback = (sel) => !sel.matched || sel.confidence < SELECTOR.minConfidence;

export function covers(band, box) {
  return box[0] >= band.left && box[1] >= band.top && box[0] + box[2] <= band.left + band.width && box[1] + box[3] <= band.top + band.height;
}

// C1 (pilot-003): a 2D window around the matched words instead of a full-width band.
// Axis-like rows (many words, matched words narrow) get a vertical column; other rows get a window that extends
// right (values after labels) and down (values under labels). Yes/no words are not used as keywords.
export const SELECTOR_C1 = {
  ocr: SELECTOR.ocr,
  keywords: "question tokens of length >= 3 minus stop words and on/off/yes",
  window: "axis row (>= 8 words of mean length <= 4, matched words < 25% of row width): column of width max(3 x matched width, 6 x line height), from 75% of image height above to 6 line heights below; otherwise row window from 4 line heights left of the row to 8 line heights right of it, 3 line heights above to 6 below; minimum 256 x 128",
};
const YESNO = new Set(["off", "yes"]);

export function selectWindow(lines, question, width, height) {
  const keys = keywords(question).filter((k) => !YESNO.has(k));
  const matchWord = (w) => keys.some((k) => { const t = tokens(w)[0] || ""; return t === k || (k.length >= 4 && t.length >= 4 && (t.startsWith(k) || k.startsWith(t))); });
  let best = null;
  for (const line of lines) {
    const sc = score(line, keys);
    if (sc > 0 && (!best || sc > best.score || (sc === best.score && line.confidence > best.line.confidence))) best = { score: sc, line };
  }
  if (!best) return { matched: false, keys };
  const line = best.line;
  const hits = line.words.filter((w) => matchWord(w.text));
  const anchor = hits.length ? hits.map((w) => w.box).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0] + a[2], b[0] + b[2]) - Math.min(a[0], b[0]), Math.max(a[1] + a[3], b[1] + b[3]) - Math.min(a[1], b[1])]) : line.box;
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
  const grow = (a, b, min, max) => { const need = min - (b - a); return need > 0 ? [a - need / 2, b + need / 2] : [a, b]; };
  [x0, x1] = grow(x0, x1, 256, width);
  [y0, y1] = grow(y0, y1, 128, height);
  const left = Math.max(0, Math.floor(x0)), top = Math.max(0, Math.floor(y0));
  const right = Math.min(width, Math.ceil(x1)), bottom = Math.min(height, Math.ceil(y1));
  return { matched: true, keys, score: best.score, lineText: line.text, confidence: Math.round(line.confidence), axisRow, band: { left, top, width: right - left, height: bottom - top } };
}
