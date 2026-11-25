// ko-header-column: pure rules of research/plans/2026-11-25-ko-header-column-protocol.md (W4 4.2, scoring 5, verdict 5.9).
// No file, Git or OCR access here. K0/K1 (#147), W1 (#150), W2 (#151) and W3 with scan.units (#152) come from the fixed blobs
// and are passed in. The independent check (tools/ko-header-column/recount.py) re-implements this from RECOUNT_SPEC.md.

export class ValidationError extends Error {}
const fail = (msg) => { throw new ValidationError(msg); };

export const SIDES = ["L", "R"];
export const HEADERS = ["normal", "blank", "dup"];
export const ANS = ["same", "below"];
export const KINDS = ["library", "sports", "culture"];
export const QTYPES = ["time", "count", "pages"];
export const SLOTS = [0, 1, 2];
export const CELLS = SIDES.flatMap((s) => HEADERS.flatMap((h) => ANS.map((a) => `${s}-${h}-${a}`)));
export const W1_REASONS = ["widened", "not_wider", "no_candidate", "k0_branch", "unmatched", "error"];
export const W2_REASONS = ["inherit", "cut", "no_cut", "hit_outside_w1"];
export const W3_REASONS = ["error", "unmatched", "not_applicable", "qtype_none", "qtype_multiple", "no_valid_hit_word", "no_candidate", "multiple_candidates", "candidate_outside_w2", "applied"];
export const W4_REASONS = ["error", "unmatched", "not_applicable", "qtype_none", "qtype_multiple", "no_valid_hit_word", "question_unparsed", "question_type_mismatch",
  "header_none", "header_multiple", "header_duplicate", "header_no_match", "no_target_candidate", "multiple_target_candidates", "target_outside_w2", "applied"];
const W4_MATCHED = W4_REASONS.slice(2);
export const HEADER_CLASSES = ["target_header", "comp_header", "other_item", "undetermined"];
export const CANDIDATE_CLASSES = ["target_value", "comp_value", "other_record_value", "other_record_comp", "other_item", "undetermined"];
export const EXPOSURE_KEYS = ["targetHeader", "compHeader", "compValue", "targetValue"];
const WIN = ["w1", "w2", "w3", "w4"];

// ------------------------------------------------------------------ text (RECOUNT_SPEC 4.1)
// Unicode White_Space code points (numbers, so no escape in this file can be rewritten by a tool).
const WHITE_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
/** NFKC, then every Unicode White_Space code point removed (same as the fixed #152 squash). */
export const squash = (s) => [...String(s).normalize("NFKC")].filter((ch) => !WHITE_SPACE.has(ch.codePointAt(0))).join("");
/** NFKC, every run of White_Space code points -> one U+0020, both ends trimmed of U+0020. */
export function fold(s) {
  const out = [];
  let space = false;
  for (const ch of String(s).normalize("NFKC")) {
    if (WHITE_SPACE.has(ch.codePointAt(0))) space = true;
    else { if (space && out.length) out.push(" "); space = false; out.push(ch); }
  }
  return out.join("");
}

const QUESTION = /^(?<record>.+)의 (?<field>[가-힣]+(?: [가-힣]+)* ?(?<suffix>시각|인원|분량))(?<josa>은|는) 몇 (?<unit>시|명|쪽)인가요[?]$/u;
const SUFFIX_TYPE = { 시각: "time", 인원: "count", 분량: "pages" };
const UNIT_TYPE = { 시: "time", 명: "count", 쪽: "pages" };
const TYPE_SUFFIX = { time: "시각", count: "인원", pages: "분량" };
/** { record, field, qtype } of a registered question form, or null. */
export function parseQuestion(q) {
  const f = fold(q);
  if (f.split("의 ").length !== 2) return null;
  const m = QUESTION.exec(f);
  if (!m) return null;
  const t = SUFFIX_TYPE[m.groups.suffix];
  if (t !== UNIT_TYPE[m.groups.unit]) return null;
  return { record: m.groups.record, field: m.groups.field, qtype: t };
}

// ------------------------------------------------------------------ exact decimals (RECOUNT_SPEC 4.0)
/** JSON.parse that keeps every number as its JSON source text. */
export const parseExact = (text) => JSON.parse(String(text), (k, v, ctx) => (typeof v === "number" ? ctx.source : v));

const NUM = /^-?(?:0|[1-9][0-9]*)(?:[.]([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/;
const isNumToken = (v) => (typeof v === "string" && NUM.test(v)) || (typeof v === "number" && Number.isSafeInteger(v));
/** Exact value { n: BigInt, k } = n / 10^k of a JSON number token (or a safe integer). */
function dec(v) {
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) fail(`W4 needs exact number text, got ${v}`);
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
const absd = (a) => ({ n: a.n < 0n ? -a.n : a.n, k: a.k });
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

/** A valid word: box of 4 JSON numbers with w > 0, h > 0, and a string text whose squash is not empty. */
function validWord(word) {
  const b = word?.box;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(isNumToken)) return null;
  if (typeof word.text !== "string") return null;
  const text = squash(word.text);
  if (text === "") return null;
  const [x, y, w, h] = b.map(dec);
  if (cmp(w, ZERO) <= 0 || cmp(h, ZERO) <= 0) return null;
  return { x0: x, y0: y, x1: add(x, w), y1: add(y, h), w, h, text, raw: b.map(tokText) };
}
/** Box of 4 JSON numbers with w > 0, h > 0 (text not required): exact { x0, y0, x1, y1 } or null. */
function boxOnly(b) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every(isNumToken)) return null;
  const [x, y, w, h] = b.map(dec);
  if (cmp(w, ZERO) <= 0 || cmp(h, ZERO) <= 0) return null;
  return { x0: x, y0: y, x1: add(x, w), y1: add(y, h), w, h };
}

// ------------------------------------------------------------------ bands
const copyBand = (b) => ({ left: b.left, top: b.top, width: b.width, height: b.height });
const sameBand = (a, b) => Boolean(a) && Boolean(b) && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
const bandBottom = (b) => b.top + b.height;
/** union [x0, y0, x1, y1] (text) inside the integer window W, equal edges inside. */
function unionInside(union, w) {
  const [x0, y0, x1, y1] = union.map(dec);
  return cmp(dec(w.left), x0) <= 0 && cmp(dec(w.top), y0) <= 0 && cmp(x1, dec(w.left + w.width)) <= 0 && cmp(y1, dec(bandBottom(w))) <= 0;
}

// ------------------------------------------------------------------ W4 header line (RECOUNT_SPEC 4.3)
const HANGUL = /^[가-힣]+$/u;
function groupLine(words) {
  const ws = words.map((w, i) => ({ ...validWord(w), idx: i }));
  ws.sort((a, b) => cmp(a.x0, b.x0) || cmp(a.x1, b.x1) || a.idx - b.idx);
  const groups = [];
  let cur = null;
  ws.forEach((w, j) => {
    if (j > 0) {
      const p = ws[j - 1];
      const gap = sub(w.x0, p.x1);
      if (cmp(gap, twice(dmax(p.h, w.h))) > 0) cur = null;
    }
    if (!cur) { cur = []; groups.push(cur); }
    cur.push(w);
  });
  return groups.map((g) => {
    const x0 = g.map((w) => w.x0).reduce(dmin), y0 = g.map((w) => w.y0).reduce(dmin);
    const x1 = g.map((w) => w.x1).reduce(dmax), y1 = g.map((w) => w.y1).reduce(dmax);
    return { words: g.map((w) => w.idx), boxes: g.map((w) => w.raw), text: g.map((w) => w.text).join(""), box: [x0, y0, x1, y1].map(decStr) };
  });
}
function qualify(groups, suffix) {
  if (groups.length !== 3) return "group_count";
  if (!HANGUL.test(groups[0].text)) return "first_not_hangul";
  const tail = new RegExp(`^[가-힣]+${suffix}$`, "u");
  if (!tail.test(groups[1].text) || !tail.test(groups[2].text)) return "value_group_suffix";
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const [ax0, , ax1] = groups[a].box.map(dec), [bx0, , bx1] = groups[b].box.map(dec);
    if (cmp(sub(dmin(ax1, bx1), dmax(ax0, bx0)), ZERO) > 0) return "x_overlap";
  }
  return null;
}

/**
 * W4 for one page (RECOUNT_SPEC 4). question: registered question; lines: frozen OCR lines with numbers as JSON source text;
 * k1: frozen K1 record; r: fixed W2 result { reason, w1, w2, w2Reason }; w3: fixed #152 W3 result (qtypes, validHits, scan).
 * Returns { w4Reason, w4From, w4, w4CutPixels, w4Diag }. Nothing else (id, variant, gold, render) is an input.
 */
export function w4Rule(question, lines, k1, r, w3) {
  if (!r || typeof r !== "object") fail("W2 result missing");
  if (r.reason === "error" || r.reason === "unmatched") return { w4Reason: r.reason, w4From: null, w4: null, w4CutPixels: null, w4Diag: null };
  const { w1, w2 } = r;
  if (!w1 || !w2) fail("matched page without W1/W2");
  if (!w3 || typeof w3 !== "object") fail("W3 result missing");
  // diagnostics, as far as the input allows
  const parsed = parseQuestion(question);
  let anchor = null;
  if (Array.isArray(w3.validHits) && w3.validHits.length) {
    if (!Array.isArray(lines)) fail("OCR lines missing");
    const line = lines[k1?.lineIndex];
    if (!line || !Array.isArray(line.words)) fail(`K1 line ${k1?.lineIndex} missing`);
    for (const j of w3.validHits) {
      const b = boxOnly(line.words[j]?.box);
      if (!b) fail(`valid hit ${j} has no valid box`);
      anchor = anchor === null ? b.y0 : dmin(anchor, b.y0);
    }
  }
  let diagLines = null, qualified = null, header = null, assign = null, counts = null, chosen = null;
  if (anchor !== null && parsed) {
    const suffix = TYPE_SUFFIX[parsed.qtype];
    diagLines = lines.map((line, i) => {
      if (!line || !Array.isArray(line.words)) fail(`OCR line ${i} words`);
      let why = "eligible";
      if (i === k1.lineIndex) why = "k1_line";
      else if (!line.words.length) why = "no_words";
      else if (line.words.some((w) => !validWord(w))) why = "invalid_word";
      else if (line.words.some((w) => cmp(validWord(w).y1, anchor) > 0)) why = "below_anchor";
      if (why !== "eligible") return { line: i, why, groups: null, failure: null };
      const groups = groupLine(line.words);
      return { line: i, why, groups, failure: qualify(groups, suffix) };
    });
    qualified = diagLines.filter((l) => l.why === "eligible" && l.failure === null).map((l) => l.line);
    if (qualified.length === 1) {
      const hl = diagLines[qualified[0]];
      const want = squash(parsed.field);
      const match = [hl.groups[1].text === want, hl.groups[2].text === want];
      const one = match[0] !== match[1];
      header = { line: hl.line, match, target: one ? (match[0] ? 1 : 2) : null, comp: one ? (match[0] ? 2 : 1) : null };
      if (header.target !== null && w3.scan) {
        const T = hl.groups[header.target].box.map(dec), C = hl.groups[header.comp].box.map(dec);
        const hT = sub(T[3], T[1]), hC = sub(C[3], C[1]);
        assign = w3.scan.units.map((u, k) => {
          const x0 = dec(u.union[0]);
          const dT = absd(sub(x0, T[0])), dC = absd(sub(x0, C[0]));
          let column = null, why;
          const c = cmp(dT, dC);
          if (c < 0) { if (cmp(dT, hT) <= 0) { column = "target"; why = "nearest"; } else why = "too_far"; }
          else if (c > 0) { if (cmp(dC, hC) <= 0) { column = "comp"; why = "nearest"; } else why = "too_far"; }
          else why = "tie";
          return { unit: k, line: u.line, first: u.first, last: u.last, x0: decStr(x0), dTarget: decStr(dT), dComp: decStr(dC), column, why };
        });
        counts = { target: assign.filter((a) => a.column === "target").length, comp: assign.filter((a) => a.column === "comp").length, unassigned: assign.filter((a) => a.column === null).length };
        chosen = counts.target === 1 ? assign.find((a) => a.column === "target").unit : null;
      }
    }
  }
  const w4Diag = { question: parsed, anchorY: anchor === null ? null : decStr(anchor), lines: diagLines, qualified, header, assign, counts, chosen };
  // decision (first reason wins)
  let reason;
  if (r.w2Reason !== "cut") reason = "not_applicable";
  else if (!Array.isArray(w3.qtypes)) fail("W3 qtypes missing");
  else if (w3.qtypes.length === 0) reason = "qtype_none";
  else if (w3.qtypes.length > 1) reason = "qtype_multiple";
  else if (!Array.isArray(w3.validHits)) fail("cut page without valid hits");
  else if (w3.validHits.length === 0) reason = "no_valid_hit_word";
  else if (!parsed) reason = "question_unparsed";
  else if (parsed.qtype !== w3.qtypes[0]) reason = "question_type_mismatch";
  else if (qualified.length === 0) reason = "header_none";
  else if (qualified.length > 1) reason = "header_multiple";
  else if (header.match[0] && header.match[1]) reason = "header_duplicate";
  else if (!header.match[0] && !header.match[1]) reason = "header_no_match";
  else {
    if (!w3.scan) fail("header selected but the fixed W3 gave no scan");
    if (counts.target === 0) reason = "no_target_candidate";
    else if (counts.target > 1) reason = "multiple_target_candidates";
    else if (!unionInside(w3.scan.units[chosen].union, w2)) reason = "target_outside_w2";
    else reason = "applied";
  }
  const w4 = copyBand(reason === "applied" ? w2 : w1);
  const out = { w4Reason: reason, w4From: reason === "applied" ? "w2" : "w1", w4, w4CutPixels: (w1.height - w4.height) * w1.width, w4Diag };
  if (!(sameBand(w4, w1) || sameBand(w4, w2))) fail("W4 is neither W1 nor W2");
  if (!(w4.top <= w2.top && bandBottom(w4) >= bandBottom(w2) && w4.top >= w1.top && bandBottom(w4) <= bandBottom(w1))) fail("W2 inside W4 inside W1 broken");
  if ((reason === "applied") !== (out.w4From === "w2")) fail("applied iff W4 = W2");
  return out;
}

// ------------------------------------------------------------------ prediction validation (RECOUNT_SPEC 5.1)
const bandOk = (b, W, H) => Boolean(b) && typeof b === "object" && [b.left, b.top, b.width, b.height].every(Number.isInteger) && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0 && b.left + b.width <= W && b.top + b.height <= H;

/** W4 part of a prediction row. The W1-W3 part is checked by the fixed #152 validatePrediction (passed in). */
export function validatePrediction(p, fixedValidate = null) {
  if (fixedValidate) {
    try { fixedValidate(p); } catch (err) { fail(`fixed #152 validation: ${String(err?.message || err)}`); }
  }
  const id = p.id;
  if (p.state === "matched") {
    if (!bandOk(p.w4, p.width, p.height)) fail(`${id}: w4 is not a positive window inside the page`);
    if (!W4_MATCHED.includes(p.w4Reason)) fail(`${id}: w4Reason ${p.w4Reason}`);
    if ((p.w2Reason !== "cut") !== (p.w4Reason === "not_applicable")) fail(`${id}: w4Reason ${p.w4Reason} with w2Reason ${p.w2Reason}`);
    if (p.w4Reason === "applied") { if (p.w4From !== "w2" || !sameBand(p.w4, p.w2)) fail(`${id}: applied W4 must be W2`); }
    else if (p.w4From !== "w1" || !sameBand(p.w4, p.w1)) fail(`${id}: held W4 must be W1`);
    if (p.w4CutPixels !== (p.w1.height - p.w4.height) * p.w1.width) fail(`${id}: w4CutPixels ${p.w4CutPixels}`);
    const d = p.w4Diag;
    if (!d || typeof d !== "object") fail(`${id}: w4Diag missing`);
    const R = p.w4Reason;
    if (["header_none", "header_multiple", "header_duplicate", "header_no_match", "no_target_candidate", "multiple_target_candidates", "target_outside_w2", "applied"].includes(R)) {
      if (!Array.isArray(d.qualified)) fail(`${id}: ${R} without qualified lines`);
      if (R === "header_none" && d.qualified.length !== 0) fail(`${id}: header_none with qualified lines`);
      if (R === "header_multiple" && d.qualified.length < 2) fail(`${id}: header_multiple with < 2 lines`);
      if (!["header_none", "header_multiple"].includes(R)) {
        if (d.qualified.length !== 1 || !d.header) fail(`${id}: ${R} needs one header line`);
        const [a, b] = d.header.match;
        if (R === "header_duplicate" && !(a && b)) fail(`${id}: header_duplicate match`);
        if (R === "header_no_match" && (a || b)) fail(`${id}: header_no_match match`);
        if (!["header_duplicate", "header_no_match"].includes(R)) {
          if (a === b || !d.counts) fail(`${id}: ${R} needs one target header and counts`);
          const t = d.counts.target;
          if (R === "no_target_candidate" && t !== 0) fail(`${id}: no_target_candidate with ${t}`);
          if (R === "multiple_target_candidates" && t < 2) fail(`${id}: multiple_target_candidates with ${t}`);
          if (R === "target_outside_w2" || R === "applied") {
            if (t !== 1 || !Number.isInteger(d.chosen) || !p.scan?.units?.[d.chosen]) fail(`${id}: ${R} needs one chosen unit`);
            const inside = unionInside(p.scan.units[d.chosen].union, p.w2);
            if ((R === "applied") !== inside) fail(`${id}: ${R} with chosen unit ${inside ? "inside" : "outside"} W2`);
          }
        }
      }
    }
  } else if (p.state === "unmatched" || p.state === "error") {
    for (const k of ["w4", "w4From", "w4CutPixels", "w4Diag"]) if (p[k] !== null) fail(`${id}: ${p.state} row carries ${k}`);
    if (p.w4Reason !== p.state) fail(`${id}: ${p.state} row w4Reason ${p.w4Reason}`);
  } else fail(`${id}: state ${JSON.stringify(p.state)}`);
  return true;
}

// ------------------------------------------------------------------ replay (protocol 4.3)
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
export const sameJson = (a, b) => canon(a) === canon(b);

/**
 * One prediction row: the fixed #152 buildPrediction (K1 re-check, W1, W2, W3 with scan.units), then W4 on its output.
 * input: { id, question, pngSha256, width, height, ocrRow, ocrLinesExact, k1Row }; fixed: { w1Rule, w2lib, w3lib }.
 */
export function buildPrediction(input, recomputeK1, { w1Rule, w2lib, w3lib }) {
  let base;
  try {
    base = w3lib.buildPrediction(input, recomputeK1, { w1Rule, w2lib });
  } catch (err) {
    throw new ValidationError(`fixed #152 prediction: ${String(err?.message || err)}`);
  }
  const r = { reason: base.reason, w1: base.w1, w2: base.w2, w2Reason: base.w2Reason };
  const w3 = { qtypes: base.qtypes, validHits: base.validHits, scan: base.scan };
  const lines = input.ocrRow.status === "ok" ? input.ocrLinesExact : null;
  const pred = { ...base, ...w4Rule(input.question, lines, input.k1Row.k1, r, w3) };
  validatePrediction(pred, w3lib.validatePrediction);
  return pred;
}

// ------------------------------------------------------------------ exposure and gold attribution (RECOUNT_SPEC 5.2, 5.3)
/** "full" | "partial" | "none" (zero intersection area, touching included) | null (no window). Integer ink [l, t, r, b). */
export function exposure([l, t, r, b], band) {
  if (!band) return null;
  const R = band.left + band.width, B = band.top + band.height;
  if (l >= band.left && t >= band.top && r <= R && b <= B) return "full";
  const ix = Math.min(r, R) - Math.max(l, band.left), iy = Math.min(b, B) - Math.max(t, band.top);
  return ix > 0 && iy > 0 ? "partial" : "none";
}
const itemExposure = (page, item, band) => {
  if (!band) return null;
  const ink = item ? page.items[item]?.ink : null;
  return ink ? exposure(ink, band) : "source_missing";
};

/**
 * Rendered item of a set of OCR word boxes ([x, y, w, h] tokens): every word centre lies in exactly one item cell (half-open)
 * and it is the same item for all words, and the words' bounding box meets that item's ink with positive area. Otherwise null.
 */
export function attribute(boxes, page) {
  if (!Array.isArray(boxes) || !boxes.length) return null;
  const entries = Object.entries(page.items);
  const ex = boxes.map(boxOnly);
  if (ex.some((b) => !b)) return null;
  const assigned = ex.map((b) => {
    const cx2 = add(b.x0, b.x1), cy2 = add(b.y0, b.y1); // 2 x centre, exact
    const hit = entries.filter(([, it]) => {
      const [c0, c1, c2, c3] = it.cell.map((v) => twice(dec(v)));
      return cmp(c0, cx2) <= 0 && cmp(cx2, c2) < 0 && cmp(c1, cy2) <= 0 && cmp(cy2, c3) < 0;
    });
    return hit.length === 1 ? hit[0][0] : null;
  });
  const item = assigned.every((a) => a !== null && a === assigned[0]) ? assigned[0] : null;
  if (item === null) return null;
  const [l, t, r, b] = page.items[item].ink.map(dec);
  const x0 = ex.map((e) => e.x0).reduce(dmin), y0 = ex.map((e) => e.y0).reduce(dmin);
  const x1 = ex.map((e) => e.x1).reduce(dmax), y1 = ex.map((e) => e.y1).reduce(dmax);
  const ix = sub(dmin(r, x1), dmax(l, x0)), iy = sub(dmin(b, y1), dmax(t, y0));
  return cmp(ix, ZERO) > 0 && cmp(iy, ZERO) > 0 ? item : null;
}
export function headerClass(item, page) {
  if (item === null) return "undetermined";
  if (page.targetHeaderItem !== null && item === page.targetHeaderItem) return "target_header";
  if (item === page.compHeaderItem) return "comp_header";
  return "other_item";
}
export function candidateClass(item, page) {
  if (item === null) return "undetermined";
  if (item === page.valueItem) return "target_value";
  if (item === page.compValueItem) return "comp_value";
  if (page.otherValueItems.includes(item)) return "other_record_value";
  if (page.recordCompItems.includes(item)) return "other_record_comp";
  return "other_item";
}

// ------------------------------------------------------------------ scoring (protocol 5, RECOUNT_SPEC 5.4)
const transition = (a, b) => (a && b ? "keptSuccess" : b ? "recovered" : a ? "lost" : "bothFail");
const tally = (xs) => ({ full: xs.filter((x) => x === "full").length, partial: xs.filter((x) => x === "partial").length, none: xs.filter((x) => x === "none").length });

/** One page (prediction validated beforehand): fixed scoreKey for W1-W4, transitions, J, exposures, reading events, attribution. */
export function scorePage(pred, page, scoreKey) {
  if (!pred || pred.id !== page.id) fail(`score: prediction ${pred?.id} does not join page ${page.id}`);
  const status = pred.state === "error" ? "error" : "ok";
  const matched = pred.state === "matched";
  const geo = { width: page.width, height: page.height };
  const one = (band) => {
    const s = scoreKey({ status, matched: status === "ok" ? matched : null, band }, geo, page.parts);
    return { state: s.state, strict: s.strict, evidence: s.evidence, fullPage: s.fullPage, area: matched ? band.width * band.height : null };
  };
  const w = Object.fromEntries(WIN.map((k) => [k, one(pred[k])]));
  const stage = pred.state === "error" ? "error" : pred.state === "unmatched" ? "unmatched" : pred.branch === "hangul" ? "hangul" : "k0";
  const t12 = transition(w.w1.strict, w.w2.strict), t13 = transition(w.w1.strict, w.w3.strict), t14 = transition(w.w1.strict, w.w4.strict), t34 = transition(w.w3.strict, w.w4.strict);
  for (const [t, k] of [[t12, "w2"], [t13, "w3"], [t14, "w4"]]) {
    if (t === "recovered" && !(w.w1.fullPage === true && w[k].fullPage !== true)) fail(`${page.id}: ${k} recovery without a full-page W1`);
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
      return { item, ...Object.fromEntries(WIN.map((k) => [k, exposure(ink, pred[k])])) };
    });
    const fromFull = (k) => tally(items.filter((i) => i.w1 === "full").map((i) => i[k]));
    others = { n: items.length, ...Object.fromEntries(WIN.map((k) => [k, tally(items.map((i) => i[k]))])), fromW1Full2: fromFull("w2"), fromW1Full3: fromFull("w3"), fromW1Full4: fromFull("w4"), items };
  }
  const opportunity = matched && w.w1.strict && pred.w2Reason === "cut" && others.w1.full >= 1;
  const exp = matched ? Object.fromEntries(WIN.map((k) => [k, {
    targetHeader: itemExposure(page, page.targetHeaderItem, pred[k]), compHeader: itemExposure(page, page.compHeaderItem, pred[k]),
    compValue: itemExposure(page, page.compValueItem, pred[k]), targetValue: itemExposure(page, page.valueItem, pred[k]),
  }])) : null;
  let reading = null;
  if (matched && page.header === "normal") {
    const e1 = (k) => exp[k].targetHeader === "none" && exp[k].compValue === "full";
    const e2 = (k) => ["partial", "none"].includes(exp[k].targetHeader) && ["partial", "full"].includes(exp[k].compValue);
    reading = {
      e1: Object.fromEntries(WIN.map((k) => [k, e1(k)])), e2: Object.fromEntries(WIN.map((k) => [k, e2(k)])),
      headerLost: Object.fromEntries(["w2", "w3", "w4"].map((k) => [k, exp.w1.targetHeader === "full" && exp[k].targetHeader === "none" && exp[k].compValue === "full"])),
    };
  }
  let attribution = null;
  if (pred.w4Reason === "applied") {
    const d = pred.w4Diag;
    const hl = d.lines.find((l) => l.line === d.header.line);
    const hItem = attribute(hl.groups[d.header.target].boxes, page);
    const cItem = attribute(pred.scan.units[d.chosen].boxes, page);
    const hc = headerClass(hItem, page), cc = candidateClass(cItem, page);
    const outcome = hc === "target_header" && cc === "target_value" ? "correct"
      : (hc !== "undetermined" && hc !== "target_header") || (cc !== "undetermined" && cc !== "target_value") ? "wrong" : "undetermined";
    attribution = { header: { item: hItem, class: hc }, candidate: { item: cItem, class: cc }, outcome };
  }
  return {
    id: page.id, key: page.key, source: page.source, kind: page.kind, content: page.content, side: page.side, header: page.header, ans: page.ans, cell: page.cell,
    qtype: page.qtype, slot: page.slot, stage, reason: pred.reason, w2Reason: pred.w2Reason, w3Reason: pred.w3Reason, w4Reason: pred.w4Reason, w4From: pred.w4From,
    w1: w.w1, w2: w.w2, w3: w.w3, w4: w.w4, t12, t13, t14, t34,
    lostParts2: lost(t12, pred.w2), lostParts3: lost(t13, pred.w3), lostParts4: lost(t14, pred.w4), prevented34: t13 === "lost" && t14 !== "lost",
    cutPixels2: pred.cutPixels, cutPixels3: pred.w3CutPixels, cutPixels4: pred.w4CutPixels,
    candidateCount: pred.scan ? pred.scan.count : null, counts: pred.w4Diag ? pred.w4Diag.counts : null, attribution, others, opportunity,
    event2: opportunity && w.w2.strict && others.fromW1Full2.none >= 1, event3: opportunity && w.w3.strict && others.fromW1Full3.none >= 1,
    event4: opportunity && w.w4.strict && others.fromW1Full4.none >= 1,
    exposure: exp, reading, textIdentifiable: page.header === "normal", error: pred.state === "error",
  };
}

// ------------------------------------------------------------------ summary (RECOUNT_SPEC 6)
const distinct = (rows) => new Set(rows.map((r) => r.source)).size;
const isMatched = (r) => r.stage === "k0" || r.stage === "hangul";
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
/** Mean area reduction in %p, 100 * sum(cut) / (A * pages), as a reduced fraction of decimal strings; null for no page. */
function meanPp(px, A) {
  if (!px.length) return null;
  let num = 100n * px.reduce((a, b) => a + BigInt(b), 0n), den = BigInt(A) * BigInt(px.length);
  const g = gcd(num, den) || 1n;
  num /= g; den /= g;
  return { num: num.toString(), den: den.toString() };
}
/** Round half away from zero to two decimals, always two digits. */
export function ppText(f) {
  if (f === null || f === undefined) return null;
  const num = BigInt(f.num), den = BigInt(f.den);
  const neg = (num < 0n) !== (den < 0n);
  const an = num < 0n ? -num : num, ad = den < 0n ? -den : den;
  const v = (an * 200n + ad) / (2n * ad); // floor(|x| * 100 + 1/2)
  return `${neg ? "-" : ""}${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`;
}

function group(rows, A) {
  const c = (f) => rows.filter(f).length;
  const valid = rows.filter(isMatched);
  const tr = (k) => ({ recovered: c((r) => r[k] === "recovered"), lost: c((r) => r[k] === "lost"), keptSuccess: c((r) => r[k] === "keptSuccess"), bothFail: c((r) => r[k] === "bothFail") });
  const w1s = c((r) => r.w1.strict), w3s = c((r) => r.w3.strict);
  const L = (k) => { const rs = rows.filter((r) => r[k] === "lost"); return { count: rs.length, denom: w1s, sources: distinct(rs) }; };
  const L3 = L("t13");
  const prev = rows.filter((r) => r.prevented34), nl = rows.filter((r) => r.t34 === "lost"), rc = rows.filter((r) => r.t34 === "recovered");
  const ev = (k) => { const rs = rows.filter((r) => r[k]); return { count: rs.length, sources: distinct(rs) }; };
  const applied = rows.filter((r) => r.attribution);
  const cnt = (xs, keys) => Object.fromEntries(keys.map((k) => [k, xs.filter((x) => x === k).length]));
  const expo = Object.fromEntries(WIN.map((k) => [k, Object.fromEntries(EXPOSURE_KEYS.map((e) => [e, cnt(valid.map((r) => r.exposure[k][e]), ["full", "partial", "none", "source_missing"])]))]));
  const rd = rows.filter((r) => r.reading);
  const change = (e, k) => {
    const nw = rd.filter((r) => r.reading[e][k] && !r.reading[e].w1), ex = rd.filter((r) => r.reading[e][k] && r.reading[e].w1), rs = rd.filter((r) => !r.reading[e][k] && r.reading[e].w1);
    return { new: nw.length, newSources: distinct(nw), existing: ex.length, existingSources: distinct(ex), resolved: rs.length, resolvedSources: distinct(rs) };
  };
  const ap = rows.filter((r) => r.w4Reason === "applied" && isMatched(r));
  return {
    n: rows.length, error: c((r) => r.stage === "error"), unmatched: c((r) => r.stage === "unmatched"), matched: valid.length,
    strict: Object.fromEntries(WIN.map((k) => [k, c((r) => r[k].strict)])),
    fullPage: Object.fromEntries(WIN.map((k) => [k, c((r) => r[k].fullPage === true)])),
    t12: tr("t12"), t13: tr("t13"), t14: tr("t14"), t34: tr("t34"),
    L2: L("t12"), L3, L4: L("t14"),
    prevented34: { count: prev.length, of: L3.count, sources: distinct(prev) },
    newLoss34: { count: nl.length, of: w3s, sources: distinct(nl) },
    recovered34: { count: rc.length, of: rows.length - w3s, sources: distinct(rc) },
    cut: c((r) => r.w2Reason === "cut"), applied: c((r) => r.w4Reason === "applied"),
    w4Reason: Object.fromEntries(W4_REASONS.map((k) => [k, c((r) => r.w4Reason === k)])),
    opportunity: ev("opportunity"), event2: ev("event2"), event3: ev("event3"), event4: ev("event4"),
    attribution: {
      applied: applied.length, correct: applied.filter((r) => r.attribution.outcome === "correct").length,
      wrong: applied.filter((r) => r.attribution.outcome === "wrong").length, undetermined: applied.filter((r) => r.attribution.outcome === "undetermined").length,
      header: cnt(applied.map((r) => r.attribution.header.class), HEADER_CLASSES), candidate: cnt(applied.map((r) => r.attribution.candidate.class), CANDIDATE_CLASSES),
    },
    exposure: expo,
    reading: {
      pages: rd.length,
      e1: Object.fromEntries(WIN.map((k) => [k, rd.filter((r) => r.reading.e1[k]).length])), e2: Object.fromEntries(WIN.map((k) => [k, rd.filter((r) => r.reading.e2[k]).length])),
      change: { e1: Object.fromEntries(["w2", "w3", "w4"].map((k) => [k, change("e1", k)])), e2: Object.fromEntries(["w2", "w3", "w4"].map((k) => [k, change("e2", k)])) },
      headerLost: Object.fromEntries(["w2", "w3", "w4"].map((k) => { const rs = rd.filter((r) => r.reading.headerLost[k]); return [k, { count: rs.length, sources: distinct(rs) }]; })),
    },
    area: { pages: valid.length, w2: meanPp(valid.map((r) => r.cutPixels2), A), w3: meanPp(valid.map((r) => r.cutPixels3), A), w4: meanPp(valid.map((r) => r.cutPixels4), A), appliedPages: ap.length, w4Applied: meanPp(ap.map((r) => r.cutPixels4), A) },
  };
}

export const GROUP_ROWS = [
  ["전체", (g) => g.total], ["W2 cut", (g) => g.cut], ["W4 applied", (g) => g.applied],
  ...SIDES.map((k) => [`side ${k}`, (g) => g.side[k]]), ...HEADERS.map((k) => [`header ${k}`, (g) => g.header[k]]), ...ANS.map((k) => [`ans ${k}`, (g) => g.ans[k]]),
  ...SIDES.map((k) => [`normal ${k}`, (g) => g.normalSide[k]]), ...CELLS.map((k) => [`cell ${k}`, (g) => g.cell[k]]),
  ...KINDS.map((k) => [`kind ${k}`, (g) => g.kind[k]]), ...QTYPES.map((k) => [`qtype ${k}`, (g) => g.qtype[k]]), ...SLOTS.map((k) => [`slot ${k}`, (g) => g.slot[k]]),
];

/** All registered aggregates (RECOUNT_SPEC 6) from score rows in id order; preds (same order, optional) adds window invariants. */
export function summarizeScores(rows, { pageArea, preds = null }) {
  const A = pageArea;
  const by = (f) => rows.filter(f);
  const n = (f) => by(f).length;
  const stages = {
    pages: rows.length, error: n((r) => r.stage === "error"), normal: rows.length - n((r) => r.stage === "error"),
    unmatched: n((r) => r.stage === "unmatched"), k0Matched: n((r) => r.stage === "k0"), hangulMatched: n((r) => r.stage === "hangul"),
    w1Reason: Object.fromEntries(W1_REASONS.map((k) => [k, n((r) => r.reason === k)])), w2Reason: Object.fromEntries(W2_REASONS.map((k) => [k, n((r) => r.w2Reason === k)])),
    w3Reason: Object.fromEntries(W3_REASONS.map((k) => [k, n((r) => r.w3Reason === k)])), w4Reason: Object.fromEntries(W4_REASONS.map((k) => [k, n((r) => r.w4Reason === k)])),
  };
  // design order of the sources: kind (library, sports, culture), then content number; ties keep first appearance
  const sources = [...new Set(rows.map((r) => r.source))].map((s, i) => [s, rows.find((r) => r.source === s), i])
    .sort((a, b) => KINDS.indexOf(a[1].kind) - KINDS.indexOf(b[1].kind) || a[1].content - b[1].content || a[2] - b[2]).map(([s]) => s);
  const gby =(keys, f) => Object.fromEntries(keys.map((k) => [k, group(by((r) => f(r, k)), A)]));
  const groups = {
    total: group(rows, A), cut: group(by((r) => r.w2Reason === "cut"), A), applied: group(by((r) => r.w4Reason === "applied"), A),
    side: gby(SIDES, (r, k) => r.side === k), header: gby(HEADERS, (r, k) => r.header === k), ans: gby(ANS, (r, k) => r.ans === k),
    normalSide: gby(SIDES, (r, k) => r.header === "normal" && r.side === k), cell: gby(CELLS, (r, k) => r.cell === k),
    kind: gby(KINDS, (r, k) => r.kind === k), qtype: gby(QTYPES, (r, k) => r.qtype === k), slot: gby(SLOTS, (r, k) => r.slot === k),
    w4Reason: gby(W4_REASONS, (r, k) => r.w4Reason === k), source: gby(sources, (r, k) => r.source === k),
  };
  const ids = (f) => by(f).map((r) => r.id);
  const newE1W4 = (r) => Boolean(r.reading && r.reading.e1.w4 && !r.reading.e1.w1);
  const lists = {
    t13Lost: ids((r) => r.t13 === "lost"), t14Lost: ids((r) => r.t14 === "lost"), prevented34: ids((r) => r.prevented34), newLoss34: ids((r) => r.t34 === "lost"), recovered34: ids((r) => r.t34 === "recovered"),
    applied: ids((r) => r.w4Reason === "applied"), appliedNormal: ids((r) => r.w4Reason === "applied" && r.header === "normal"), appliedBlankDup: ids((r) => r.w4Reason === "applied" && r.header !== "normal"),
    attributionWrong: ids((r) => r.attribution?.outcome === "wrong"), attributionUndetermined: ids((r) => r.attribution?.outcome === "undetermined"),
    opportunity: ids((r) => r.opportunity), event4: ids((r) => r.event4), readingNewE1W4: ids(newE1W4), headerLostW4: ids((r) => Boolean(r.reading?.headerLost.w4)),
    errors: ids((r) => r.stage === "error"), unmatched: ids((r) => r.stage === "unmatched"),
  };
  const sideMismatch = [];
  for (const s of sources) for (const h of HEADERS) for (const a of ANS) {
    const L = rows.find((r) => r.source === s && r.header === h && r.ans === a && r.side === "L"), R = rows.find((r) => r.source === s && r.header === h && r.ans === a && r.side === "R");
    if (!L || !R) continue;
    const f = { w4Reason: (r) => r.w4Reason, w4Strict: (r) => r.w4.strict, event4: (r) => r.event4, outcome: (r) => r.attribution?.outcome ?? null };
    const fields = Object.keys(f).filter((k) => f[k](L) !== f[k](R));
    if (fields.length) sideMismatch.push({ source: s, header: h, ans: a, L: L.id, R: R.id, fields });
  }
  const conc = (pred) => {
    const per = sources.map((s) => [s, n((r) => r.source === s && pred(r))]);
    const total = per.reduce((a, [, k]) => a + k, 0);
    let top = null, topCount = 0;
    for (const [s, k] of per) if (k > topCount) { top = s; topCount = k; }
    return { total, topSource: total ? top : null, topCount };
  };
  const concentration = { event4: conc((r) => r.event4), applied: conc((r) => r.w4Reason === "applied"), L4: conc((r) => r.t14 === "lost") };
  const sourceTable = sources.map((s) => {
    const rs = by((r) => r.source === s);
    const cells = Object.fromEntries(CELLS.map((k) => {
      const r = rs.find((x) => x.cell === k);
      if (!r) return [k, null];
      return [k, { id: r.id, stage: r.stage, w4Reason: r.w4Reason, s: WIN.map((w) => (r[w].strict ? "S" : "F")).join(""), t14: r.t14, counts: r.counts, outcome: r.attribution?.outcome ?? null, event4: r.event4, newE1W4: newE1W4(r) }];
    }));
    return { source: s, kind: rs[0].kind, qtype: rs[0].qtype, slot: rs[0].slot, cells };
  });
  const valid = by(isMatched);
  const idset = (f) => new Set(by(f).map((r) => r.id));
  const subset = (a, b) => [...a].every((x) => b.has(x));
  let w4InW1W2 = null, nested = null, appliedIsW2 = null;
  if (preds) {
    checkIdSet(preds, rows.map((r) => r.id));
    const mp = preds.filter((p) => p.state === "matched");
    w4InW1W2 = mp.filter((p) => sameBand(p.w4, p.w1) || sameBand(p.w4, p.w2)).length;
    nested = mp.filter((p) => p.w4.left === p.w1.left && p.w4.width === p.w1.width && p.w4.top <= p.w2.top && bandBottom(p.w4) >= bandBottom(p.w2) && p.w4.top >= p.w1.top && bandBottom(p.w4) <= bandBottom(p.w1)).length;
    appliedIsW2 = mp.every((p) => (p.w4Reason === "applied") === (p.w4From === "w2") && (p.w4Reason !== "applied" || sameBand(p.w4, p.w2)));
  }
  const invariants = {
    checked: valid.length, w4InW1W2, nested,
    lost4SubsetLost2: subset(idset((r) => r.t14 === "lost"), idset((r) => r.t12 === "lost")),
    events4SubsetEvents2: subset(idset((r) => r.event4), idset((r) => r.event2)),
    appliedIsW2,
    recoveredNotFullPage: rows.filter((r) => ["t12", "t13", "t14"].some((t, i) => r[t] === "recovered" && !(r.w1.fullPage === true && r[WIN[i + 1]].fullPage !== true))).length,
  };
  return { invariants, stages, groups, lists, sideMismatch, concentration, sourceTable, verdict: verdictOf(groups) };
}

// ------------------------------------------------------------------ verdict (RECOUNT_SPEC 7)
export function verdictOf(groups) {
  const t = groups.total, nb = groups.header.normal;
  const G1 = { L4: t.L4.count, pass: t.L4.count === 0 };
  const G2 = { blank: groups.header.blank.applied, dup: groups.header.dup.applied, pass: groups.header.blank.applied === 0 && groups.header.dup.applied === 0 };
  const G3 = { L: groups.normalSide.L.event4.sources, R: groups.normalSide.R.event4.sources, pass: groups.normalSide.L.event4.sources >= 2 && groups.normalSide.R.event4.sources >= 2 };
  const at = nb.attribution;
  const G4 = { denom: at.applied, denomL: groups.normalSide.L.attribution.applied, denomR: groups.normalSide.R.attribution.applied, correct: at.correct, wrong: at.wrong, undetermined: at.undetermined,
    status: at.applied === 0 ? "not_applicable" : at.correct === at.applied && at.wrong === 0 && at.undetermined === 0 ? "pass" : "fail" };
  const failed = [["G1", G1.pass], ["G2", G2.pass], ["G3", G3.pass], ["G4", G4.status === "pass"]].filter(([, p]) => !p).map(([k]) => k);
  const geometry = failed.length ? "fail" : "pass";
  const ch = nb.reading.change.e1.w4;
  const reading = { comparable: nb.reading.pages, newE1: ch.new, newE1Sources: ch.newSources, status: nb.reading.pages === 0 ? "not_evaluable" : ch.new >= 1 ? "loss" : "no_loss" };
  const FINAL = { "pass|no_loss": "followup_possible", "pass|loss": "geometry_ok_reading_worse", "fail|no_loss": "geometry_fail", "fail|loss": "both_unfavorable",
    "pass|not_evaluable": "geometry_pass_reading_not_evaluable", "fail|not_evaluable": "geometry_fail_reading_not_evaluable" };
  return { G1, G2, G3, G4, geometry, failed, reading, final: FINAL[`${geometry}|${reading.status}`] };
}

// ------------------------------------------------------------------ public tables (RECOUNT_SPEC 10)
const fmt = (v) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "S" : "F") : String(v));
const line = (cells) => `| ${cells.map(fmt).join(" | ")} |`;
const sep = (k) => `|${"---|".repeat(k)}`;
const frac = (a, b) => `${a}/${b}`;
const ABBR = { correct: "C", wrong: "W", undetermined: "U" };
const fpnm = (x) => `${x.full}/${x.partial}/${x.none}/${x.source_missing}`;
const fpn = (x) => `${x.full}/${x.partial}/${x.none}`;

function sourceCell(c) {
  if (!c) return null;
  if (c.stage === "error") return "error";
  if (c.stage === "unmatched") return "unmatched";
  let s = `${c.s} ${c.w4Reason} ${c.counts ? `t${c.counts.target}c${c.counts.comp}u${c.counts.unassigned}` : "-"} ${c.outcome ? ABBR[c.outcome] : "-"}`;
  if (c.event4) s += " J";
  if (c.newE1W4) s += " E1";
  return s;
}

/** The public tables as lists of markdown lines, keyed by table name. */
export function renderTables(summary) {
  const g = summary.groups, st = summary.stages, v = summary.verdict;
  const H = (cells) => [line(cells), sep(cells.length)];
  const rowsOf = (f) => GROUP_ROWS.map(([name, sel]) => line([name, ...f(sel(g))]));
  const stages = [...H(["항목", "쪽수"]), ...[
    ["등록 쪽", st.pages], ["기술 오류", st.error], ["정상 처리(미매치 포함)", st.normal], ["정상 미매치", st.unmatched], ["K0 매치", st.k0Matched], ["한글 매치", st.hangulMatched],
    ["W1 widened", st.w1Reason.widened], ["W1 not_wider", st.w1Reason.not_wider], ["W1 no_candidate", st.w1Reason.no_candidate], ["W1 k0_branch", st.w1Reason.k0_branch],
    ["W2 cut", st.w2Reason.cut], ["W2 no_cut", st.w2Reason.no_cut], ["W2 hit_outside_w1", st.w2Reason.hit_outside_w1], ["W2 inherit", st.w2Reason.inherit],
    ...W3_REASONS.map((k) => [`W3 ${k}`, st.w3Reason[k]]), ...W4_REASONS.map((k) => [`W4 ${k}`, st.w4Reason[k]]),
  ].map(line)];
  const groups = [...H(["그룹", "n", "오류", "미매치", "매치", "W1 엄격", "W2 엄격", "W3 엄격", "W4 엄격", "W2 cut", "W4 적용", "L2/W1 성공", "L3/W1 성공", "L4/W1 성공", "L4 원본", "L3 중 W4 예방", "W3→W4 새 손실", "W3→W4 회복", "공통 기회", "J2", "J3", "J4", "J4 원본"]),
    ...rowsOf((b) => [b.n, b.error, b.unmatched, b.matched, b.strict.w1, b.strict.w2, b.strict.w3, b.strict.w4, b.cut, b.applied, frac(b.L2.count, b.L2.denom), frac(b.L3.count, b.L3.denom), frac(b.L4.count, b.L4.denom), b.L4.sources,
      frac(b.prevented34.count, b.prevented34.of), frac(b.newLoss34.count, b.newLoss34.of), frac(b.recovered34.count, b.recovered34.of), b.opportunity.count, b.event2.count, b.event3.count, b.event4.count, b.event4.sources])];
  const reasons = [...H(["그룹", ...W4_REASONS]), ...rowsOf((b) => W4_REASONS.map((k) => b.w4Reason[k]))];
  const attribution = [...H(["그룹", "적용", "정답", "오선택", "미확정", "표제 목표", "표제 경쟁", "표제 기타", "표제 미확정", "후보 목표", "후보 경쟁", "후보 타 레코드 값", "후보 타 레코드 경쟁", "후보 기타", "후보 미확정"]),
    ...rowsOf((b) => { const a = b.attribution; return [a.applied, a.correct, a.wrong, a.undetermined, ...HEADER_CLASSES.map((k) => a.header[k]), ...CANDIDATE_CLASSES.map((k) => a.candidate[k])]; })];
  const exposureT = [...H(["행", "목표 표제 f/p/n/m", "경쟁 표제 f/p/n/m", "경쟁 값 f/p/n", "목표 값 f/p/n"]),
    ...HEADERS.flatMap((h) => WIN.map((k) => { const e = g.header[h].exposure[k]; return line([`header ${h} W${k.slice(1)}`, fpnm(e.targetHeader), fpnm(e.compHeader), fpn(e.compValue), fpn(e.targetValue)]); }))];
  const READ_ROWS = [["header normal", g.header.normal], ...SIDES.map((k) => [`normal ${k}`, g.normalSide[k]]), ...CELLS.filter((k) => k.includes("-normal-")).map((k) => [`cell ${k}`, g.cell[k]])];
  const nsrc = (c) => `${c.new} (${c.newSources})`;
  const reading = [...H(["그룹", "비교 쪽", "E1 W1", "E1 W4", "E1 W4 새(원본)", "E1 W4 기존", "E1 W4 해소", "E2 W1", "E2 W4", "E2 W4 새(원본)", "E2 W4 기존", "E2 W4 해소", "표제 소실 W2", "표제 소실 W3", "표제 소실 W4(원본)", "E1 W2 새", "E1 W3 새"]),
    ...READ_ROWS.map(([name, b]) => { const r = b.reading, c1 = r.change.e1.w4, c2 = r.change.e2.w4; return line([name, r.pages, r.e1.w1, r.e1.w4, nsrc(c1), c1.existing, c1.resolved, r.e2.w1, r.e2.w4, nsrc(c2), c2.existing, c2.resolved,
      r.headerLost.w2.count, r.headerLost.w3.count, `${r.headerLost.w4.count} (${r.headerLost.w4.sources})`, r.change.e1.w2.new, r.change.e1.w3.new]); })];
  const area = [...H(["그룹", "매치", "W2 평균 %p", "W3 평균 %p", "W4 평균 %p", "W4 적용 쪽", "W4 적용 평균 %p"]),
    ...rowsOf((b) => { const a = b.area; return [a.pages, ppText(a.w2), ppText(a.w3), ppText(a.w4), a.appliedPages, ppText(a.w4Applied)]; })];
  const sources = [...H(["원본", "유형", "목표 슬롯", ...CELLS]), ...summary.sourceTable.map((s) => line([s.source, s.qtype, s.slot, ...CELLS.map((k) => sourceCell(s.cells[k]))]))];
  const pf = (b) => (b ? "pass" : "fail");
  const verdict = [...H(["조건", "값", "판정"]),
    line(["G1 전체 L4 = 0", `L4 ${v.G1.L4}`, pf(v.G1.pass)]),
    line(["G2 공란·중복 적용 0", `공란 ${v.G2.blank} / 중복 ${v.G2.dup}`, pf(v.G2.pass)]),
    line(["G3 정상 L·R 각각 J4 원본 ≥ 2", `L ${v.G3.L} / R ${v.G3.R}`, pf(v.G3.pass)]),
    line(["G4 정상 적용 귀속 100%", `정답 ${v.G4.correct}/${v.G4.denom} (L ${v.G4.denomL}, R ${v.G4.denomR}), 오선택 ${v.G4.wrong}, 미확정 ${v.G4.undetermined}`, v.G4.status]),
    line(["기하 필요조건", v.failed.length ? `미달 ${v.failed.join(", ")}` : "미달 없음", v.geometry]),
    line(["읽기 근거(정상, W1 대비 새 E1)", `새 E1 ${v.reading.newE1} (원본 ${v.reading.newE1Sources}) / 비교 쪽 ${v.reading.comparable}`, v.reading.status]),
    line(["최종", "—", v.final])];
  return { stages, groups, reasons, attribution, exposure: exposureT, reading, area, sources, verdict };
}

const BLOCK = /<!-- khc:table (\S+) -->\n([^]*?)\n<!-- \/khc:table -->/g;
const cellsOf = (l) => l.trim().replace(/^[|]/, "").replace(/[|]$/, "").split("|").map((x) => x.trim());

/** Cell-by-cell comparison of the marked tables in a markdown text with the tables rendered from the summary. */
export function checkTables(markdown, summary) {
  const want = renderTables(summary);
  const text = String(markdown).split("\r\n").join("\n");
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
