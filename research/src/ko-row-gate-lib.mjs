// ko-row-gate: pure rules of research/plans/2026-11-24-ko-row-gate-protocol.md (W3 rule 4.4, replay 4.5, scoring 5).
// No file, Git or OCR access here. K0/K1 (#147), W1 (#150) and W2 (#151) come from the fixed blobs and are passed in.
// The independent check (tools/ko-row-gate/recount.py) re-implements all of this from tools/ko-row-gate/RECOUNT_SPEC.md.

export class ValidationError extends Error {}
const fail = (msg) => { throw new ValidationError(msg); };

export const DOCTYPES = ["lecture", "exhibit", "meeting"];
export const FORMS = ["table", "cards"];
export const ANS = ["same", "below"];
export const DEC = ["same", "other"];
export const LAYOUTS = ["same-same", "same-other", "below-same", "below-other"];
export const QTYPES = ["time", "count", "pages"];
export const W1_REASONS = ["widened", "not_wider", "no_candidate", "k0_branch", "unmatched", "error"];
export const W2_REASONS = ["inherit", "cut", "no_cut", "hit_outside_w1"];
export const W3_REASONS = ["error", "unmatched", "not_applicable", "qtype_none", "qtype_multiple", "no_valid_hit_word", "no_candidate", "multiple_candidates", "candidate_outside_w2", "applied"];
const W3_MATCHED = W3_REASONS.slice(2);
export const CLASSES = ["target_value", "intended_decoy", "other_record_value", "other_or_ambiguous"];

// ------------------------------------------------------------------ text (RECOUNT_SPEC 4.1)
// Unicode White_Space code points (written as numbers so no escape in this file can be rewritten by a tool).
const WHITE_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
/** NFKC, then every Unicode White_Space code point removed. */
export const squash = (s) => [...String(s).normalize("NFKC")].filter((ch) => !WHITE_SPACE.has(ch.codePointAt(0))).join("");

const CUES = { time: ["시각", "몇시"], count: ["몇명"], pages: ["몇쪽"] };
/** Question types by fixed substring cues on the squashed question, sorted by name. */
export function questionTypes(q) {
  const s = squash(q);
  return Object.keys(CUES).filter((t) => CUES[t].some((c) => s.includes(c))).sort();
}

const GRAMMAR = {
  time: /^(?:[0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$/,
  count: /^[1-9][0-9]{0,2}명$/,
  pages: /^[1-9][0-9]{0,2}쪽$/,
};
/** Whole-string match of the squashed text against the strict value grammar of a question type. */
export const grammarMatch = (qtype, text) => {
  if (!GRAMMAR[qtype]) fail(`unknown question type ${qtype}`);
  return GRAMMAR[qtype].test(squash(text));
};

// ------------------------------------------------------------------ exact decimals (RECOUNT_SPEC 4.0)
/** JSON.parse that keeps every number as its JSON source text. */
export const parseExact = (text) => JSON.parse(String(text), (k, v, ctx) => (typeof v === "number" ? ctx.source : v));

const NUM = /^-?(?:0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/;
const isNumToken = (v) => (typeof v === "string" && NUM.test(v)) || (typeof v === "number" && Number.isSafeInteger(v));
/** Exact value { n: BigInt, k } = n / 10^k of a JSON number token (or a safe integer). */
function dec(v) {
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) fail(`W3 needs exact number text, got ${v}`);
    return { n: BigInt(v), k: 0 };
  }
  if (v && typeof v === "object" && typeof v.n === "bigint") return v;
  const m = typeof v === "string" ? NUM.exec(v) : null;
  if (!m) fail(`not a JSON number token: ${JSON.stringify(v)}`);
  const neg = v.startsWith("-");
  const body = (neg ? v.slice(1) : v).split(/[eE]/)[0];
  const [ip, fp = ""] = body.split(".");
  let n = BigInt(ip + fp);
  let k = fp.length - (m[2] ? Number(m[2]) : 0);
  if (k < 0) { n *= 10n ** BigInt(-k); k = 0; }
  return { n: neg ? -n : n, k };
}
const scale = (a, k) => a.n * 10n ** BigInt(k - a.k);
const add = (a, b) => { const k = Math.max(a.k, b.k); return { n: scale(a, k) + scale(b, k), k }; };
const sub = (a, b) => add(a, { n: -b.n, k: b.k });
const twice = (a) => ({ n: a.n * 2n, k: a.k });
const cmp = (a, b) => { const k = Math.max(a.k, b.k); const x = scale(a, k), y = scale(b, k); return x < y ? -1 : x > y ? 1 : 0; };
const dmin = (a, b) => (cmp(a, b) <= 0 ? a : b);
const dmax = (a, b) => (cmp(a, b) >= 0 ? a : b);
const ZERO = { n: 0n, k: 0 };
/** Exact value as text: no exponent, no trailing zeros, integers without a point, -0 -> 0. */
export function decStr(v) {
  let { n, k } = dec(v);
  while (k > 0 && n % 10n === 0n) { n /= 10n; k -= 1; }
  if (k === 0) return n.toString();
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(k + 1, "0");
  return `${neg ? "-" : ""}${digits.slice(0, digits.length - k)}.${digits.slice(digits.length - k)}`;
}
const tokText = (v) => (typeof v === "number" ? String(v) : v);

/** A valid word box: 4 JSON numbers, width > 0, height > 0. Returns exact { x0, y0, x1, y1, w, h } or null. */
function wordBox(word) {
  const b = word?.box;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(isNumToken)) return null;
  const [x, y, w, h] = b.map(dec);
  if (cmp(w, ZERO) <= 0 || cmp(h, ZERO) <= 0) return null;
  return { x0: x, y0: y, x1: add(x, w), y1: add(y, h), w, h };
}
/** W3 same-row condition: u right of h (touching allowed) and 2 x vertical overlap >= smaller height. */
function sameRowRight(h, u) {
  if (cmp(u.x0, h.x1) < 0) return false;
  let ov = sub(dmin(u.y1, h.y1), dmax(u.y0, h.y0));
  if (cmp(ov, ZERO) < 0) ov = ZERO;
  return cmp(twice(ov), dmin(u.h, h.h)) >= 0;
}

// ------------------------------------------------------------------ W3 (protocol 4.4, RECOUNT_SPEC 4)
const copyBand = (b) => ({ left: b.left, top: b.top, width: b.width, height: b.height });
const sameBand = (a, b) => a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
const bandBottom = (b) => b.top + b.height;

/** Candidate units of the whole OCR (RECOUNT_SPEC 4.3) for one question type and the valid hits H. */
function enumerate(lines, qtype, hits) {
  const units = [];
  lines.forEach((line, i) => {
    if (!line || !Array.isArray(line.words)) fail(`OCR line ${i} words`);
    const words = line.words;
    for (let j = 0; j < words.length; j++) {
      const seg = [];
      for (let n = 1; n <= 3 && j + n - 1 < words.length; n++) {
        const w = words[j + n - 1];
        const box = wordBox(w);
        const text = typeof w?.text === "string" ? squash(w.text) : "";
        if (!box || text === "") break; // an invalid or empty word ends every unit through it
        if (seg.length) {
          const p = seg[seg.length - 1].box;
          const gap = sub(box.x0, p.x1);
          if (cmp(gap, ZERO) < 0 || cmp(twice(gap), dmin(p.h, box.h)) > 0) break;
        }
        seg.push({ box, text, raw: w.box });
        const t = seg.map((s) => s.text).join("");
        if (!GRAMMAR[qtype].test(t)) continue;
        const support = hits.filter((h) => seg.every((s) => sameRowRight(h.box, s.box))).map((h) => h.word).sort((a, b) => a - b);
        if (!support.length) continue;
        const x0 = seg.map((s) => s.box.x0).reduce(dmin), y0 = seg.map((s) => s.box.y0).reduce(dmin);
        const x1 = seg.map((s) => s.box.x1).reduce(dmax), y1 = seg.map((s) => s.box.y1).reduce(dmax);
        units.push({ line: i, first: j, last: j + n - 1, text: t, boxes: seg.map((s) => s.raw.map(tokText)), union: [x0, y0, x1, y1].map(decStr), support });
      }
    }
  });
  return { count: units.length, units };
}

/** C inside the integer window W (equal edges inside). */
function unionInside(union, w) {
  const [x0, y0, x1, y1] = union.map(dec);
  return cmp(dec(w.left), x0) <= 0 && cmp(dec(w.top), y0) <= 0 && cmp(x1, dec(w.left + w.width)) <= 0 && cmp(y1, dec(bandBottom(w))) <= 0;
}

/**
 * W3 for one page. question: the registered question; lines: frozen OCR lines with numbers as JSON source text (parseExact);
 * k1: frozen K1 record; r: the fixed W2 result { reason, w1, w2, w2Reason }. Returns
 * { qtypes, validHits, scan, w3Reason, w3From, w3, w3CutPixels }. Nothing else (page id, layout, gold) is an input.
 */
export function w3Rule(question, lines, k1, r) {
  if (!r || typeof r !== "object") fail("W2 result missing");
  if (r.reason === "error" || r.reason === "unmatched") {
    return { qtypes: null, validHits: null, scan: null, w3Reason: r.reason, w3From: null, w3: null, w3CutPixels: null };
  }
  const { w1, w2 } = r;
  if (!w1 || !w2) fail("matched page without W1/W2");
  if (!Array.isArray(lines)) fail("OCR lines missing");
  const qtypes = questionTypes(question);
  let validHits = null, hits = null;
  if (Array.isArray(k1?.hitWords)) {
    const line = lines[k1.lineIndex];
    if (!line || !Array.isArray(line.words)) fail(`K1 line ${k1.lineIndex} missing`);
    hits = [];
    for (const j of k1.hitWords) {
      if (!Number.isInteger(j) || j < 0 || j >= line.words.length) fail(`hit word ${j} out of range`);
      const box = wordBox(line.words[j]);
      if (box) hits.push({ word: j, box });
    }
    validHits = hits.map((h) => h.word);
  }
  const scan = hits && hits.length && qtypes.length === 1 ? enumerate(lines, qtypes[0], hits) : null;
  const keep = (w3Reason) => ({ qtypes, validHits, scan, w3Reason, w3From: "w1", w3: copyBand(w1), w3CutPixels: 0 });
  let out;
  if (r.w2Reason !== "cut") out = keep("not_applicable");
  else if (qtypes.length === 0) out = keep("qtype_none");
  else if (qtypes.length > 1) out = keep("qtype_multiple");
  else if (!hits) fail("cut page without K1 hit words");
  else if (!hits.length) out = keep("no_valid_hit_word");
  else if (scan.count === 0) out = keep("no_candidate");
  else if (scan.count > 1) out = keep("multiple_candidates");
  else if (!unionInside(scan.units[0].union, w2)) out = keep("candidate_outside_w2");
  else out = { qtypes, validHits, scan, w3Reason: "applied", w3From: "w2", w3: copyBand(w2), w3CutPixels: (w1.height - w2.height) * w1.width };
  const w3 = out.w3;
  if (!(sameBand(w3, w1) || sameBand(w3, w2))) fail("W3 is neither W1 nor W2");
  if (!(w3.top <= w2.top && bandBottom(w3) >= bandBottom(w2) && w3.top >= w1.top && bandBottom(w3) <= bandBottom(w1))) fail("W2 inside W3 inside W1 broken");
  if (out.w3CutPixels !== (w1.height - w3.height) * w1.width) fail("w3CutPixels");
  return out;
}

// ------------------------------------------------------------------ exposure and candidate classification (RECOUNT_SPEC 5.2, 5.3)
/** "full" | "partial" | "none" (zero intersection area, touching included) | null (no window). */
export function exposure([l, t, r, b], band) {
  if (!band) return null;
  const R = band.left + band.width, B = band.top + band.height;
  if (l >= band.left && t >= band.top && r <= R && b <= B) return "full";
  const ix = Math.min(r, R) - Math.max(l, band.left), iy = Math.min(b, B) - Math.max(t, band.top);
  return ix > 0 && iy > 0 ? "partial" : "none";
}

/**
 * Gold class of a unique candidate (scoring side only). cand: { boxes: [[x, y, w, h] as tokens], union: [x0, y0, x1, y1] as text };
 * page: { valueItem, decoyItem, otherValueItems, items: { id: { role, cell, ink } } }.
 */
export function classifyCandidate(cand, page) {
  const entries = Object.entries(page.items);
  const assigned = cand.boxes.map((bx) => {
    const [x, y, w, h] = bx.map(dec);
    const cx2 = add(twice(x), w), cy2 = add(twice(y), h); // 2 x centre, exact
    const hit = entries.filter(([, it]) => {
      const [c0, c1, c2, c3] = it.cell.map((v) => twice(dec(v)));
      return cmp(c0, cx2) <= 0 && cmp(cx2, c2) < 0 && cmp(c1, cy2) <= 0 && cmp(cy2, c3) < 0;
    });
    return hit.length === 1 ? hit[0][0] : null;
  });
  let item = assigned.every((a) => a !== null && a === assigned[0]) ? assigned[0] : null;
  if (item !== null) {
    const [l, t, r, b] = page.items[item].ink.map(dec);
    const [x0, y0, x1, y1] = cand.union.map(dec);
    const ix = sub(dmin(r, x1), dmax(l, x0)), iy = sub(dmin(b, y1), dmax(t, y0));
    if (!(cmp(ix, ZERO) > 0 && cmp(iy, ZERO) > 0)) item = null;
  }
  const cls = item === null ? "other_or_ambiguous" : item === page.valueItem ? "target_value" : item === page.decoyItem ? "intended_decoy"
    : page.otherValueItems.includes(item) ? "other_record_value" : "other_or_ambiguous";
  return { class: cls, item };
}

// ------------------------------------------------------------------ prediction validation (RECOUNT_SPEC 5.1)
const bandOk = (b, W, H) => Boolean(b) && typeof b === "object" && [b.left, b.top, b.width, b.height].every(Number.isInteger) && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0 && b.left + b.width <= W && b.top + b.height <= H;
const finite = (v) => typeof v === "number" && Number.isFinite(v);

export function validatePrediction(p) {
  const W = p.width, H = p.height, id = p.id;
  if (p.state === "matched") {
    for (const k of ["w0", "w1", "w2", "w3"]) if (!bandOk(p[k], W, H)) fail(`${id}: ${k} is not a positive window inside the page`);
    const { w0, w1, w2, w3 } = p;
    if (!(w1.left === w0.left && w1.top === w0.top && w1.height === w0.height && w1.width >= w0.width)) fail(`${id}: W1 does not keep W0 left/top/height`);
    if (w2.left !== w1.left || w2.width !== w1.width) fail(`${id}: W2 left/width differ from W1`);
    if (!(w2.top >= w1.top && bandBottom(w2) <= bandBottom(w1))) fail(`${id}: W2 is not inside W1`);
    if (!W2_REASONS.includes(p.w2Reason)) fail(`${id}: w2Reason ${p.w2Reason}`);
    if ((p.reason !== "widened") !== (p.w2Reason === "inherit")) fail(`${id}: w2Reason ${p.w2Reason} with W1 reason ${p.reason}`);
    if (p.w2Reason === "cut" ? sameBand(w2, w1) : !sameBand(w2, w1)) fail(`${id}: W2 window does not match w2Reason ${p.w2Reason}`);
    if (p.cutPixels !== (w1.height - w2.height) * w1.width) fail(`${id}: cutPixels ${p.cutPixels}`);
    if ((p.w2Reason === "cut" || p.w2Reason === "no_cut") && !(finite(p.hitTop) && finite(p.hitBottom) && p.hitTop >= w2.top && p.hitBottom <= bandBottom(w2))) fail(`${id}: hits not inside W2`);
    if (!W3_MATCHED.includes(p.w3Reason)) fail(`${id}: w3Reason ${p.w3Reason}`);
    if ((p.w2Reason !== "cut") !== (p.w3Reason === "not_applicable")) fail(`${id}: w3Reason ${p.w3Reason} with w2Reason ${p.w2Reason}`);
    if (p.w3Reason === "applied") {
      if (p.w3From !== "w2" || !sameBand(w3, w2)) fail(`${id}: applied W3 must be W2`);
    } else if (p.w3From !== "w1" || !sameBand(w3, w1)) fail(`${id}: held W3 must be W1`);
    if (p.w3CutPixels !== (w1.height - w3.height) * w1.width) fail(`${id}: w3CutPixels ${p.w3CutPixels}`);
    if (!Array.isArray(p.qtypes)) fail(`${id}: qtypes`);
    if (p.w3Reason === "qtype_none" && p.qtypes.length !== 0) fail(`${id}: qtype_none with types`);
    if (p.w3Reason === "qtype_multiple" && p.qtypes.length < 2) fail(`${id}: qtype_multiple with < 2 types`);
    if (p.w3Reason === "no_valid_hit_word" && !(Array.isArray(p.validHits) && p.validHits.length === 0)) fail(`${id}: no_valid_hit_word with hits`);
    const s = p.scan;
    if (s !== null && !(s && Number.isInteger(s.count) && Array.isArray(s.units) && s.units.length === s.count)) fail(`${id}: scan`);
    const needScan = ["no_candidate", "multiple_candidates", "candidate_outside_w2", "applied"].includes(p.w3Reason);
    if (needScan && !s) fail(`${id}: ${p.w3Reason} without a candidate scan`);
    if (p.w3Reason === "no_candidate" && s.count !== 0) fail(`${id}: no_candidate with ${s.count} candidates`);
    if (p.w3Reason === "multiple_candidates" && s.count < 2) fail(`${id}: multiple_candidates with ${s.count}`);
    if (p.w3Reason === "applied" && !(s.count === 1 && unionInside(s.units[0].union, w2))) fail(`${id}: applied needs one candidate inside W2`);
    if (p.w3Reason === "candidate_outside_w2" && !(s.count === 1 && !unionInside(s.units[0].union, w2))) fail(`${id}: candidate_outside_w2 needs one candidate outside W2`);
  } else if (p.state === "unmatched" || p.state === "error") {
    for (const k of ["w0", "w1", "w2", "w3", "cutPixels", "w3CutPixels", "w3From", "qtypes", "validHits", "scan"]) if (p[k] !== null) fail(`${id}: ${p.state} row carries ${k}`);
    if (p.w2Reason !== "inherit") fail(`${id}: ${p.state} row w2Reason`);
    if (p.w3Reason !== p.state) fail(`${id}: ${p.state} row w3Reason ${p.w3Reason}`);
  } else fail(`${id}: state ${JSON.stringify(p.state)}`);
  return true;
}

// ------------------------------------------------------------------ replay (protocol 4.5)
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
export const sameJson = (a, b) => canon(a) === canon(b);

/** The exact-text OCR lines must be the same document as the ordinary-number lines. */
function checkExactLines(lines, exact, id) {
  if (!Array.isArray(exact) || exact.length !== lines.length) fail(`${id}: exact OCR lines differ in length`);
  lines.forEach((l, i) => {
    const e = exact[i];
    if (!e || e.text !== l.text || !Array.isArray(e.words) || e.words.length !== l.words.length) fail(`${id}: exact OCR line ${i} differs`);
    l.words.forEach((w, j) => {
      const x = e.words[j];
      if (x.text !== w.text) fail(`${id}: exact OCR word ${i}.${j} text`);
      const a = w.box, b = x.box;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.some((v, q) => (v === null ? b[q] !== null : Number(b[q]) !== v))) fail(`${id}: exact OCR word ${i}.${j} box`);
    });
  });
}

/**
 * One prediction row. The fixed #151 buildPrediction joins the frozen OCR/K1 rows, re-checks K1 against the raw OCR and runs the
 * fixed W1 and W2; W3 follows. input: { id, question, pngSha256, width, height, ocrRow, ocrLinesExact, k1Row };
 * fixed: { w1Rule, w2lib } (the fixed #150 W1 rule and the fixed #151 module).
 */
export function buildPrediction(input, recomputeK1, { w1Rule, w2lib }) {
  const { id, question, pngSha256, width, height, ocrRow, ocrLinesExact, k1Row } = input;
  let base;
  try {
    base = w2lib.buildPrediction({ id, question, pngSha256, width, height, ocrRow, k1Row }, recomputeK1, w1Rule);
  } catch (err) {
    throw new ValidationError(`fixed #151 prediction: ${String(err?.message || err)}`);
  }
  if (ocrRow.status === "ok") checkExactLines(ocrRow.ocrLines, ocrLinesExact, id);
  const r = { reason: base.reason, w1: base.w1, w2: base.w2, w2Reason: base.w2Reason };
  const w3 = w3Rule(question, ocrRow.status === "ok" ? ocrLinesExact : null, k1Row.k1, r);
  const pred = { ...base, ...w3 };
  validatePrediction(pred);
  return pred;
}

// ------------------------------------------------------------------ scoring (protocol 5, RECOUNT_SPEC 5.4)
const transition = (a, b) => (a && b ? "keptSuccess" : b ? "recovered" : a ? "lost" : "bothFail");
const tally = (xs) => ({ full: xs.filter((x) => x === "full").length, partial: xs.filter((x) => x === "partial").length, none: xs.filter((x) => x === "none").length });

/** One page: fixed scoreKey for W1/W2/W3, transitions, lost parts, prevention, unique candidate class, other values, events. */
export function scorePage(pred, page, scoreKey) {
  if (!pred || pred.id !== page.id) fail(`score: prediction ${pred?.id} does not join page ${page.id}`);
  validatePrediction(pred);
  const status = pred.state === "error" ? "error" : "ok";
  const matched = pred.state === "matched";
  const geo = { width: page.width, height: page.height };
  const one = (band) => {
    const s = scoreKey({ status, matched: status === "ok" ? matched : null, band }, geo, page.parts);
    return { state: s.state, strict: s.strict, evidence: s.evidence, fullPage: s.fullPage, area: matched ? band.width * band.height : null };
  };
  const w1 = one(pred.w1), w2 = one(pred.w2), w3 = one(pred.w3);
  const stage = pred.state === "error" ? "error" : pred.state === "unmatched" ? "unmatched" : pred.branch === "hangul" ? "hangul" : "k0";
  const t12 = transition(w1.strict, w2.strict), t13 = transition(w1.strict, w3.strict);
  for (const [t, wx, name] of [[t12, w2, "W2"], [t13, w3, "W3"]]) {
    if (t === "recovered" && !(w1.fullPage === true && wx.fullPage !== true)) fail(`${page.id}: ${name} recovery without a full-page W1`);
  }
  const lost = (t, band) => {
    if (t !== "lost") return null;
    const out = [];
    if (exposure(page.parts[0], band) !== "full") out.push("label");
    if (exposure(page.parts[1], band) !== "full") out.push("value");
    return out;
  };
  let others = null;
  if (matched) {
    const items = page.otherValueItems.map((item) => {
      const ink = page.items[item]?.ink;
      if (!ink) fail(`${page.id}: other value ${item} has no ink`);
      return { item, w1: exposure(ink, pred.w1), w2: exposure(ink, pred.w2), w3: exposure(ink, pred.w3) };
    });
    const fromFull = (k) => tally(items.filter((i) => i.w1 === "full").map((i) => i[k]));
    others = { n: items.length, w1: tally(items.map((i) => i.w1)), w2: tally(items.map((i) => i.w2)), w3: tally(items.map((i) => i.w3)), fromW1Full2: fromFull("w2"), fromW1Full3: fromFull("w3"), items };
  }
  const opportunity = matched && w1.strict && pred.w2Reason === "cut" && others.w1.full >= 1;
  const scan = pred.scan;
  return {
    id: page.id, source: page.source, doctype: page.doctype, form: page.form, content: page.content, ans: page.ans, dec: page.dec, layout: page.layout,
    qtype: page.qtype, slot: page.slot, stage, reason: pred.reason, w2Reason: pred.w2Reason, w3Reason: pred.w3Reason, w3From: pred.w3From,
    w1, w2, w3, t12, t13,
    fullPageToPartial2: matched ? w1.fullPage === true && w2.fullPage !== true : null,
    fullPageToPartial3: matched ? w1.fullPage === true && w3.fullPage !== true : null,
    lostParts2: lost(t12, pred.w2), lostParts3: lost(t13, pred.w3), prevented: t12 === "lost" && t13 !== "lost",
    cutPixels2: pred.cutPixels, cutPixels3: pred.w3CutPixels,
    candidateCount: scan ? scan.count : null, uniqueCandidate: scan && scan.count === 1 ? classifyCandidate(scan.units[0], page) : null,
    others, opportunity, event2: opportunity && w2.strict && others.fromW1Full2.none >= 1, event3: opportunity && w3.strict && others.fromW1Full3.none >= 1,
    error: pred.state === "error",
  };
}

// ------------------------------------------------------------------ summary (RECOUNT_SPEC 6)
export const pct = (c, n) => (n > 0 ? Math.round((c * 10000) / n) / 100 : null);
export const r4 = (x) => Math.round(x * 10000) / 10000;
const distinct = (rows) => new Set(rows.map((r) => r.source)).size;
const isMatched = (r) => r.stage === "k0" || r.stage === "hangul";
const EV = { all: 2, partial: 1, none: 0 };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function areaStats(px, A) {
  const sum = px.reduce((a, b) => a + b, 0);
  if (!px.length) return { sum: 0, meanPp: null, medianPp: null, maxPp: null };
  return { sum, meanPp: r4((sum * 100) / (px.length * A)), medianPp: r4((median(px) * 100) / A), maxPp: r4((Math.max(...px) * 100) / A) };
}

function group(rows, A) {
  const c = (f) => rows.filter(f).length;
  const valid = rows.filter(isMatched);
  const tr = (k) => ({ recovered: c((r) => r[k] === "recovered"), lost: c((r) => r[k] === "lost"), keptSuccess: c((r) => r[k] === "keptSuccess"), bothFail: c((r) => r[k] === "bothFail") });
  const w1s = c((r) => r.w1.strict);
  const lost2 = rows.filter((r) => r.t12 === "lost"), lost3 = rows.filter((r) => r.t13 === "lost");
  const prev = rows.filter((r) => r.prevented), opp = rows.filter((r) => r.opportunity), e2 = rows.filter((r) => r.event2), e3 = rows.filter((r) => r.event3);
  const applied = rows.filter((r) => r.w3Reason === "applied");
  const classes = (rs) => Object.fromEntries(CLASSES.map((k) => [k, rs.filter((r) => r.uniqueCandidate && r.uniqueCandidate.class === k).length]));
  const sum = (f) => valid.reduce((a, r) => a + f(r), 0);
  const o = (r) => r.others;
  const L2 = { count: lost2.length, denom: w1s, pct: pct(lost2.length, w1s), sources: distinct(lost2) };
  const L3 = { count: lost3.length, denom: w1s, pct: pct(lost3.length, w1s), sources: distinct(lost3) };
  const prevention = L2.count === 0 ? "no_w2_loss" : prev.length === 0 ? "prevented_none" : prev.length === L2.count ? "prevented_all" : "prevented_some";
  const removal = applied.length === 0 ? "no_opportunity_applied" : opp.length === 0 ? "no_opportunity_denominator"
    : e3.length >= 1 ? (distinct(e3) >= 2 ? "observed_repeated_sources" : "observed_single_source") : "not_observed";
  return {
    n: rows.length, error: c((r) => r.stage === "error"), unmatched: c((r) => r.stage === "unmatched"), matched: valid.length,
    strict: { w1: w1s, w2: c((r) => r.w2.strict), w3: c((r) => r.w3.strict) },
    fullPage: { w1: c((r) => r.w1.fullPage === true), w2: c((r) => r.w2.fullPage === true), w3: c((r) => r.w3.fullPage === true) },
    t12: tr("t12"), t13: tr("t13"),
    recoveredFullPage: { t12: c((r) => r.t12 === "recovered" && r.w1.fullPage === true), t13: c((r) => r.t13 === "recovered" && r.w1.fullPage === true) },
    L2, L3,
    prevented: { count: prev.length, of: L2.count, sources: distinct(prev) },
    opportunity: { count: opp.length, sources: distinct(opp) }, event2: { count: e2.length, sources: distinct(e2) }, event3: { count: e3.length, sources: distinct(e3) },
    keptEvents: { count: c((r) => r.event3 && r.event2), of: e2.length },
    cut: c((r) => r.w2Reason === "cut"), applied: applied.length,
    w3Reason: Object.fromEntries(W3_REASONS.map((k) => [k, c((r) => r.w3Reason === k)])),
    uniqueClass: classes(rows), uniqueClassApplied: classes(applied),
    others: {
      itemsW1Full: sum((r) => o(r).w1.full), pagesW1Full: valid.filter((r) => o(r).w1.full >= 1).length,
      fromW1Full2: { full: sum((r) => o(r).fromW1Full2.full), partial: sum((r) => o(r).fromW1Full2.partial), none: sum((r) => o(r).fromW1Full2.none) },
      fromW1Full3: { full: sum((r) => o(r).fromW1Full3.full), partial: sum((r) => o(r).fromW1Full3.partial), none: sum((r) => o(r).fromW1Full3.none) },
      pagesW1FullToNone2: valid.filter((r) => o(r).fromW1Full2.none >= 1).length,
      pagesW1FullToNone3: valid.filter((r) => o(r).fromW1Full3.none >= 1).length,
      pagesW1FullToPartial3: valid.filter((r) => o(r).fromW1Full3.partial >= 1).length,
      newlyFullW3: sum((r) => o(r).items.filter((i) => i.w3 === "full" && i.w1 !== "full").length),
    },
    area: {
      validPairs: valid.length, w2: areaStats(valid.map((r) => r.cutPixels2), A), w3: areaStats(valid.map((r) => r.cutPixels3), A),
      appliedPages: applied.length, w3Applied: areaStats(applied.map((r) => r.cutPixels3), A),
    },
    sources: distinct(rows),
    verdict: { loss3: L3.count > 0 ? "loss" : "no_loss", loss2: L2.count > 0 ? "loss" : "no_loss", prevention, removal },
  };
}

/**
 * All registered aggregates (RECOUNT_SPEC 6) from score rows in question order. preds (same order, optional) adds the window
 * invariants that need the bands (w3InW1W2, nested); without them those two are null.
 */
export function summarizeScores(rows, { pageArea, preds = null }) {
  const A = pageArea;
  const by = (f) => rows.filter(f);
  const n = (f) => by(f).length;
  const stages = {
    pages: rows.length, error: n((r) => r.stage === "error"), normal: rows.length - n((r) => r.stage === "error"),
    unmatched: n((r) => r.stage === "unmatched"), k0Matched: n((r) => r.stage === "k0"), hangulMatched: n((r) => r.stage === "hangul"),
    w1Reason: Object.fromEntries(W1_REASONS.map((k) => [camel(k), n((r) => r.reason === k)])),
    w2Reason: { inherit: n((r) => r.w2Reason === "inherit"), cut: n((r) => r.w2Reason === "cut"), noCut: n((r) => r.w2Reason === "no_cut"), hitOutside: n((r) => r.w2Reason === "hit_outside_w1") },
    w3Reason: Object.fromEntries(W3_REASONS.map((k) => [camel(k), n((r) => r.w3Reason === k)])),
  };
  const sources = [...new Set(rows.map((r) => r.source))];
  const groups = {
    total: group(rows, A),
    cut: group(by((r) => r.w2Reason === "cut"), A),
    applied: group(by((r) => r.w3Reason === "applied"), A),
    layout: Object.fromEntries(LAYOUTS.map((k) => [k, group(by((r) => r.layout === k), A)])),
    ans: Object.fromEntries(ANS.map((k) => [k, group(by((r) => r.ans === k), A)])),
    dec: Object.fromEntries(DEC.map((k) => [k, group(by((r) => r.dec === k), A)])),
    form: Object.fromEntries(FORMS.map((k) => [k, group(by((r) => r.form === k), A)])),
    doctype: Object.fromEntries(DOCTYPES.map((k) => [k, group(by((r) => r.doctype === k), A)])),
    qtype: Object.fromEntries(QTYPES.map((k) => [k, group(by((r) => r.qtype === k), A)])),
    w3Reason: Object.fromEntries(W3_REASONS.map((k) => [k, group(by((r) => r.w3Reason === k), A)])),
    source: Object.fromEntries(sources.map((k) => [k, group(by((r) => r.source === k), A)])),
  };
  const ids = (f) => by(f).map((r) => r.id);
  const lists = {
    t12Lost: ids((r) => r.t12 === "lost"), t13Lost: ids((r) => r.t13 === "lost"), prevented: ids((r) => r.prevented),
    t12Recovered: ids((r) => r.t12 === "recovered"), t13Recovered: ids((r) => r.t13 === "recovered"),
    applied: ids((r) => r.w3Reason === "applied"), held: ids((r) => isMatched(r) && r.w3Reason !== "applied" && r.w3Reason !== "not_applicable"),
    opportunity: ids((r) => r.opportunity), event2: ids((r) => r.event2), event3: ids((r) => r.event3),
    uniqueWrong: ids((r) => r.candidateCount === 1 && r.uniqueCandidate.class !== "target_value"),
    errors: ids((r) => r.stage === "error"), unmatched: ids((r) => r.stage === "unmatched"),
  };
  const sourceTable = sources.map((s) => {
    const rs = by((r) => r.source === s);
    const cells = Object.fromEntries(LAYOUTS.map((k) => {
      const r = rs.find((x) => x.layout === k);
      if (!r) return [k, null];
      const m = isMatched(r);
      return [k, {
        id: r.id, stage: r.stage, w2Reason: r.w2Reason, w3Reason: r.w3Reason, w1Strict: r.w1.strict, w2Strict: r.w2.strict, w3Strict: r.w3.strict,
        t12: r.t12, t13: r.t13, candidateCount: r.candidateCount, uniqueClass: r.uniqueCandidate ? r.uniqueCandidate.class : null,
        w1Full: m ? r.others.w1.full : null, w3Full: m ? r.others.w3.full : null, fromW1Full3None: m ? r.others.fromW1Full3.none : null,
        cut3Pp: m ? r4((r.cutPixels3 * 100) / A) : null,
      }];
    }));
    return { source: s, doctype: rs[0].doctype, form: rs[0].form, content: rs[0].content, slot: rs[0].slot, qtype: rs[0].qtype, cells };
  });
  const valid = by(isMatched);
  const idset = (f) => new Set(by(f).map((r) => r.id));
  const subset = (a, b) => [...a].every((x) => b.has(x));
  let w3InW1W2 = null, nested = null;
  if (preds) {
    checkIdSet(preds, rows.map((r) => r.id));
    const mp = preds.filter((p) => p.state === "matched");
    w3InW1W2 = mp.filter((p) => sameBand(p.w3, p.w1) || sameBand(p.w3, p.w2)).length;
    nested = mp.filter((p) => p.w3.left === p.w1.left && p.w3.width === p.w1.width && p.w3.top <= p.w2.top && bandBottom(p.w3) >= bandBottom(p.w2) && p.w3.top >= p.w1.top && bandBottom(p.w3) <= bandBottom(p.w1)).length;
  }
  const invariants = {
    checked: valid.length, w3InW1W2, nested,
    lost3SubsetLost2: subset(idset((r) => r.t13 === "lost"), idset((r) => r.t12 === "lost")),
    events3SubsetEvents2: subset(idset((r) => r.event3), idset((r) => r.event2)),
    newlyFullW3: valid.reduce((a, r) => a + r.others.items.filter((i) => i.w3 === "full" && i.w1 !== "full").length, 0),
    newEvidenceW3: valid.reduce((a, r) => a + Math.max(0, EV[r.w3.evidence] - EV[r.w1.evidence]), 0),
    recoveredNotFullPage: rows.filter((r) => (r.t12 === "recovered" && !(r.w1.fullPage === true && r.w2.fullPage !== true)) || (r.t13 === "recovered" && !(r.w1.fullPage === true && r.w3.fullPage !== true))).length,
  };
  return { invariants, stages, groups, lists, sourceTable };
}

// ------------------------------------------------------------------ public tables (RECOUNT_SPEC 10)
const fmt = (v) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "S" : "F") : String(v));
const line = (cells) => `| ${cells.map(fmt).join(" | ")} |`;
const sep = (k) => `|${"---|".repeat(k)}`;
export const GROUP_ROWS = [
  ["전체", (g) => g.total], ["W2 cut", (g) => g.cut], ["W3 applied", (g) => g.applied],
  ...LAYOUTS.map((k) => [`layout ${k}`, (g) => g.layout[k]]),
  ...ANS.map((k) => [`ans ${k}`, (g) => g.ans[k]]), ...DEC.map((k) => [`dec ${k}`, (g) => g.dec[k]]),
  ...FORMS.map((k) => [`form ${k}`, (g) => g.form[k]]), ...DOCTYPES.map((k) => [`doctype ${k}`, (g) => g.doctype[k]]),
  ...QTYPES.map((k) => [`qtype ${k}`, (g) => g.qtype[k]]),
  ...W3_REASONS.map((k) => [`W3 ${k}`, (g) => g.w3Reason[k]]),
];
const ABBR = { target_value: "T", intended_decoy: "D", other_record_value: "O", other_or_ambiguous: "X" };
const frac = (a, b) => `${a}/${b}`;
const fpn = (x) => `${x.full}/${x.partial}/${x.none}`;

function sourceCell(c) {
  if (!c) return null;
  if (c.stage === "error") return "error";
  if (c.stage === "unmatched") return "unmatched";
  const sf = (b) => (b ? "S" : "F");
  let s = `${sf(c.w1Strict)}${sf(c.w2Strict)}${sf(c.w3Strict)} ${c.w3Reason} c${c.candidateCount ?? "-"} ${c.uniqueClass ? ABBR[c.uniqueClass] : "-"} ${c.w1Full}→${c.w3Full}`;
  if (c.fromW1Full3None > 0) s += ` none${c.fromW1Full3None}`;
  return s;
}

/** The public tables as lists of markdown lines, keyed by table name. */
export function renderTables(summary) {
  const g = summary.groups, st = summary.stages;
  const H = (cells) => [line(cells), sep(cells.length)];
  const rowsOf = (f) => GROUP_ROWS.map(([name, sel]) => line([name, ...f(sel(g))]));
  const stages = [...H(["항목", "쪽수"]), ...[
    ["등록 쪽", st.pages], ["기술 오류", st.error], ["정상 처리(미매치 포함)", st.normal], ["정상 미매치", st.unmatched], ["K0 매치", st.k0Matched], ["한글 매치", st.hangulMatched],
    ["W1 widened", st.w1Reason.widened], ["W1 not_wider", st.w1Reason.notWider], ["W1 no_candidate", st.w1Reason.noCandidate], ["W1 k0_branch", st.w1Reason.k0Branch],
    ["W2 cut", st.w2Reason.cut], ["W2 no_cut", st.w2Reason.noCut], ["W2 hit_outside_w1", st.w2Reason.hitOutside], ["W2 inherit", st.w2Reason.inherit],
    ...W3_REASONS.map((k) => [`W3 ${k}`, st.w3Reason[camel(k)]]),
  ].map(line)];
  const groups = [...H(["그룹", "n", "오류", "미매치", "매치", "W1 엄격", "W2 엄격", "W3 엄격", "W2 cut", "W3 적용", "L2 손실/W1 성공", "L3 손실/W1 성공", "L3 원본", "예방/L2", "공통 기회", "기회 원본", "W2 사건", "W3 사건", "W3 사건 원본", "W3 유지/W2 사건", "회복 W2(전체쪽)", "회복 W3(전체쪽)"]),
    ...rowsOf((b) => [b.n, b.error, b.unmatched, b.matched, b.strict.w1, b.strict.w2, b.strict.w3, b.cut, b.applied, frac(b.L2.count, b.L2.denom), frac(b.L3.count, b.L3.denom), b.L3.sources,
      frac(b.prevented.count, b.prevented.of), b.opportunity.count, b.opportunity.sources, b.event2.count, b.event3.count, b.event3.sources, frac(b.keptEvents.count, b.keptEvents.of),
      `${b.t12.recovered} (${b.recoveredFullPage.t12})`, `${b.t13.recovered} (${b.recoveredFullPage.t13})`])];
  const R = ["not_applicable", "qtype_none", "qtype_multiple", "no_valid_hit_word", "no_candidate", "multiple_candidates", "candidate_outside_w2", "applied", "error", "unmatched"];
  const reasons = [...H(["그룹", ...R]), ...rowsOf((b) => R.map((k) => b.w3Reason[k]))];
  const candidates = [...H(["그룹", "유일 후보 쪽", "목표 값", "의도 방해", "타 레코드 값", "기타/모호", "적용 중 목표 값", "적용 중 의도 방해", "적용 중 타 레코드 값", "적용 중 기타/모호"]),
    ...rowsOf((b) => [CLASSES.reduce((a, k) => a + b.uniqueClass[k], 0), ...CLASSES.map((k) => b.uniqueClass[k]), ...CLASSES.map((k) => b.uniqueClassApplied[k])])];
  const others = [...H(["그룹", "W1 완전 값(쪽)", "W1 완전→W2 완전/일부/전혀", "W1 완전→W3 완전/일부/전혀", "W2 전혀≥1 쪽", "W3 전혀≥1 쪽", "W3 일부≥1 쪽", "W3 새 완전"]),
    ...rowsOf((b) => { const o = b.others; return [`${o.itemsW1Full} (${o.pagesW1Full})`, fpn(o.fromW1Full2), fpn(o.fromW1Full3), o.pagesW1FullToNone2, o.pagesW1FullToNone3, o.pagesW1FullToPartial3, o.newlyFullW3]; })];
  const area = [...H(["그룹", "유효 쌍", "W2 평균 %p", "W2 중앙 %p", "W2 최대 %p", "W3 평균 %p", "W3 중앙 %p", "W3 최대 %p", "W3 적용 쪽", "적용 평균 %p", "적용 중앙 %p", "적용 최대 %p"]),
    ...rowsOf((b) => { const a = b.area; return [a.validPairs, a.w2.meanPp, a.w2.medianPp, a.w2.maxPp, a.w3.meanPp, a.w3.medianPp, a.w3.maxPp, a.appliedPages, a.w3Applied.meanPp, a.w3Applied.medianPp, a.w3Applied.maxPp]; })];
  const verdict = [...H(["그룹", "W3 손실 판정", "W2 손실 판정", "예방 판정", "제거 판정"]),
    ...[["전체", g.total], ...LAYOUTS.map((k) => [`layout ${k}`, g.layout[k]])].map(([name, b]) => line([name, b.verdict.loss3, b.verdict.loss2, b.verdict.prevention, b.verdict.removal]))];
  const sources = [...H(["원본", "양식", "유형", "목표 슬롯", ...LAYOUTS]),
    ...summary.sourceTable.map((s) => line([s.source, s.form, s.qtype, s.slot, ...LAYOUTS.map((k) => sourceCell(s.cells[k]))]))];
  return { stages, groups, reasons, candidates, others, area, verdict, sources };
}

const BLOCK = /<!-- krg:table (\S+) -->\n([\s\S]*?)\n<!-- \/krg:table -->/g;
const cellsOf = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());

/** Cell-by-cell comparison of the marked tables in a markdown text with the tables rendered from the summary. */
export function checkTables(markdown, summary) {
  const want = renderTables(summary);
  const text = String(markdown).replace(/\r\n/g, "\n");
  const got = {};
  const out = [];
  for (const m of text.matchAll(BLOCK)) {
    if (got[m[1]]) out.push({ table: m[1], row: null, col: null, want: "one block", got: "duplicate block" });
    got[m[1]] = m[2].split("\n");
  }
  for (const name of Object.keys(got)) if (!want[name]) out.push({ table: name, row: null, col: null, want: "no such table", got: "table" });
  for (const [name, lines] of Object.entries(want)) {
    const have = got[name];
    if (!have) { out.push({ table: name, row: null, col: null, want: "table", got: "missing" }); continue; }
    const k = Math.max(lines.length, have.length);
    for (let i = 0; i < k; i++) {
      if (lines[i] === undefined || have[i] === undefined) { out.push({ table: name, row: i, col: null, want: lines[i] ?? null, got: have[i] ?? null }); continue; }
      const a = cellsOf(lines[i]), b = cellsOf(have[i]);
      const m = Math.max(a.length, b.length);
      for (let j = 0; j < m; j++) if (a[j] !== b[j]) out.push({ table: name, row: i, col: j, want: a[j] ?? null, got: b[j] ?? null });
    }
  }
  return out;
}

// ------------------------------------------------------------------ id sets and row comparison
/** Rows must carry exactly the expected ids, once each, in the expected order. */
export function checkIdSet(rows, ids) {
  const got = rows.map((r) => r?.id);
  const seen = new Set();
  for (const id of got) { if (seen.has(id)) fail(`duplicate id ${id}`); seen.add(id); }
  const missing = ids.filter((id) => !seen.has(id));
  if (missing.length) fail(`missing ids ${missing.slice(0, 5).join(", ")}`);
  const extra = got.filter((id) => !ids.includes(id));
  if (extra.length) fail(`unexpected ids ${extra.slice(0, 5).join(", ")}`);
  if (got.join("\n") !== ids.join("\n")) fail("id order differs");
  return true;
}

/** Rows (same id order) whose fields differ: [{ id, fields }]. Catches swaps that keep every marginal total. */
export function diffRows(a, b) {
  checkIdSet(b, a.map((r) => r.id));
  const out = [];
  a.forEach((ra, i) => {
    const rb = b[i];
    const fields = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].filter((f) => !sameJson(ra[f], rb[f])).sort();
    if (fields.length) out.push({ id: ra.id, fields });
  });
  return out;
}

// ------------------------------------------------------------------ question normalization and overlap (protocol 3.5)
/** NFC, trim, inner whitespace runs -> one space. */
export const normalizeQuestion = (q) => String(q).normalize("NFC").trim().split(/\s+/u).filter(Boolean).join(" ");

/** New pages vs earlier sets: same PNG bytes or same normalized question. */
export function duplicateCheck(fresh, earlier) {
  const bySha = new Map(), byQ = new Map();
  for (const e of earlier) {
    if (!bySha.has(e.pngSha256)) bySha.set(e.pngSha256, e);
    const nq = normalizeQuestion(e.question);
    if (!byQ.has(nq)) byQ.set(nq, e);
  }
  const imageOverlap = [], questionOverlap = [];
  for (const f of fresh) {
    const s = bySha.get(f.pngSha256);
    if (s) imageOverlap.push({ id: f.id, source: s.source, other: s.id });
    const q = byQ.get(normalizeQuestion(f.question));
    if (q) questionOverlap.push({ id: f.id, source: q.source, other: q.id });
  }
  return { imageOverlap, questionOverlap };
}
