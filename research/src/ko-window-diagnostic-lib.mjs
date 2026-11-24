// ko-window-diagnostic: pure rules of research/plans/2026-11-24-ko-window-diagnostic-protocol.md (sections 3-7).
// No file or Git access here. The K1 re-check and the line K1 score are passed in (fixed #147 library in the runner).

export class DiagnosticError extends Error {}
const fail = (id, msg) => { throw new DiagnosticError(id ? `${id}: ${msg}` : msg); };

export const CONTAINMENTS = ["both", "anchorOnly", "valueOnly", "neither"];
export const LINE_CLASSES = ["anchorCue", "otherItemOnly", "undetermined"];
export const TRIGGERS = ["anchorOnly", "otherOnly", "both", "neither"];
export const SIDES = ["left", "top", "right", "bottom"];
export const REGISTERED_SPLIT = { anchorOnly: 15, valueOnly: 3, neither: 2, both: 4 };
export const CONDITIONS = ["O0K0", "O0K1", "O1K0", "O1K1"];

// Registered whitespace set (protocol 4).
const WS = /[\u0009-\u000d \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu;
export const stripWs = (t) => String(t).normalize("NFC").replace(WS, "");
export const isBlank = (t) => stripWs(t).length === 0;

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);

/** OCR [x, y, w, h] -> half-open [x0, y0, x1, y1) in original page pixels, no rounding. */
export function xywhToXyxy(box) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(finite)) fail(null, `bad box ${JSON.stringify(box)}`);
  const [x, y, w, h] = box;
  if (w < 0 || h < 0) fail(null, `negative box size ${JSON.stringify(box)}`);
  return [x, y, x + w, y + h];
}

/** Stored band (left, top, width, height; scale 1, offset 0) -> [L, T, R, B]. */
export function bandToXyxy(band, width, height) {
  if (!band || typeof band !== "object") fail(null, "band missing");
  const { left, top, width: w, height: h } = band;
  if (![left, top, w, h].every(finite)) fail(null, `band not finite ${JSON.stringify(band)}`);
  if (!(w > 0 && h > 0)) fail(null, `band size not positive ${JSON.stringify(band)}`);
  if (left < 0 || top < 0 || left + w > width || top + h > height) fail(null, `band outside page ${JSON.stringify(band)}`);
  return [left, top, left + w, top + h];
}
export const xyxyToBand = ([l, t, r, b]) => ({ left: l, top: t, width: r - l, height: b - t });

/** Ids of cells whose half-open area holds the box centre. Compared as 2x + w against 2l to avoid a halving step. */
export function centerItems(box, cells) {
  const [x, y, w, h] = box;
  const cx2 = 2 * x + w, cy2 = 2 * y + h;
  return cells.filter(({ cell: [l, t, r, b] }) => 2 * l <= cx2 && cx2 < 2 * r && 2 * t <= cy2 && cy2 < 2 * b).map((c) => c.id);
}

/** Positive-area intersection of two half-open rectangles. */
export const positiveOverlap = (a, b) => Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);

/** Pixels by which [l, t, r, b] sticks out of the band [L, T, R, B] on each side. */
export const deficitOf = ([l, t, r, b], [L, T, R, B]) => ({ left: Math.max(0, L - l), top: Math.max(0, T - t), right: Math.max(0, r - R), bottom: Math.max(0, b - B) });
const isZero = (d) => SIDES.every((s) => d[s] === 0);

export function containmentOf(anchorIn, valueIn) {
  if (anchorIn && valueIn) return "both";
  if (anchorIn) return "anchorOnly";
  if (valueIn) return "valueOnly";
  return "neither";
}

// ------------------------------------------------------------------ words, lines, trigger
/** Position facts of one OCR word (protocol 4). */
export function wordRecord(word, index, { items, anchorItem, anchorInk }) {
  if (!word || typeof word.text !== "string") fail(null, `word ${index} text`);
  const xyxy = xywhToXyxy(word.box);
  const blank = isBlank(word.text);
  const anchorCell = items.find((it) => it.id === anchorItem).cell;
  const cellItems = blank ? [] : centerItems(word.box, items);
  const assigned = cellItems.length === 1 ? cellItems[0] : null;
  const anchorCellOverlap = !blank && positiveOverlap(xyxy, anchorCell);
  const anchorInkOverlap = !blank && positiveOverlap(xyxy, anchorInk);
  const strictAnchorCue = assigned === anchorItem && anchorInkOverlap;
  return { index, text: word.text, xyxy, blank, cellItems, assigned, anchorCellOverlap, anchorInkOverlap, strictAnchorCue, anchorBoundary: !strictAnchorCue && (anchorCellOverlap || anchorInkOverlap) };
}

/** Class of the selected line (protocol 5, applied in order a, b, c). */
export function lineRecord(records, items, anchorItem) {
  const live = records.filter((r) => !r.blank);
  const roleOf = new Map(items.map((it) => [it.id, it.role]));
  const seen = [];
  for (const r of live) if (r.assigned && !seen.includes(r.assigned)) seen.push(r.assigned);
  let lineClass = "undetermined";
  if (live.some((r) => r.strictAnchorCue)) lineClass = "anchorCue";
  else if (!live.some((r) => r.anchorCellOverlap) && live.some((r) => r.assigned && r.assigned !== anchorItem)) lineClass = "otherItemOnly";
  return {
    lineClass,
    lineMixed: seen.length >= 2,
    lineItems: seen.map((id) => ({ item: id, role: roleOf.get(id) })),
    lineWordCount: records.length,
    lineBlankWords: records.length - live.length,
    lineAnchorBoundaryWords: live.filter((r) => r.anchorBoundary).length,
    lineUnassignedWords: live.filter((r) => r.cellItems.length === 0).length,
    lineAmbiguousWords: live.filter((r) => r.cellItems.length >= 2).length,
  };
}

/** Facts of the words K1 actually hit (protocol 5). */
export function triggerRecord(records, hitWords, { anchorItem, anchorText, items }) {
  const roleOf = new Map(items.map((it) => [it.id, it.role]));
  const hits = hitWords.map((j) => records[j]);
  const live = hits.filter((r) => !r.blank);
  const hitAnchorCue = live.some((r) => r.strictAnchorCue);
  const hitOtherItem = live.some((r) => r.assigned && r.assigned !== anchorItem);
  const triggerSource = hitAnchorCue ? (hitOtherItem ? "both" : "anchorOnly") : hitOtherItem ? "otherOnly" : "neither";
  const anchorFlat = stripWs(anchorText);
  return {
    hitAnchorCue,
    hitOtherItem,
    triggerSource,
    hitItems: live.filter((r) => r.assigned).map((r) => ({ word: r.index, item: r.assigned, role: roleOf.get(r.assigned) })),
    hitUnassigned: live.filter((r) => r.cellItems.length === 0).length,
    hitAmbiguous: live.filter((r) => r.cellItems.length >= 2).length,
    hitAnchorBoundary: live.filter((r) => r.anchorBoundary).length,
    hitBlank: hits.length - live.length,
    hitTextInAnchorText: live.some((r) => anchorFlat.includes(stripWs(r.text))),
  };
}

// ------------------------------------------------------------------ page
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const sameJson = (a, b) => canon(a) === canon(b);
const rectOk = (r) => Array.isArray(r) && r.length === 4 && r.every(isInt) && r[0] < r[2] && r[1] < r[3];

function checkLines(id, lines) {
  if (!Array.isArray(lines)) fail(id, "ocrLines not an array");
  lines.forEach((l, i) => {
    if (!l || typeof l.text !== "string" || !finite(l.confidence) || !Array.isArray(l.words)) fail(id, `OCR line ${i} malformed`);
    try { xywhToXyxy(l.box); l.words.forEach((w) => { if (!w || typeof w.text !== "string") throw new Error("word text"); xywhToXyxy(w.box); }); } catch (e) { fail(id, `OCR line ${i}: ${e.message}`); }
  });
}

/**
 * One cohort page from its joined records. Throws DiagnosticError on any registered validation failure (protocol 3).
 * p = { id, cohort, design, render, gold, pred, ocr, score }; deps = { recheckK1(lines, question, w, h, k0), lineK1Score(line, question) }.
 */
export function diagnosePage(p, { recheckK1, lineK1Score }) {
  const { id, cohort, design: d, render, gold, pred, ocr, score } = p;
  if (!d || d.id !== id || d.lang !== "ko" || d.anchor !== "nl") fail(id, "design row is not this ko/nl page");
  const W = d.page?.width, H = d.page?.height;
  if (!isInt(W) || !isInt(H) || W <= 0 || H <= 0) fail(id, "page size");
  const items = d.items;
  if (!Array.isArray(items) || new Set(items.map((it) => it.id)).size !== items.length) fail(id, "design item ids not unique");
  for (const it of items) if (!rectOk(it.cell)) fail(id, `item ${it.id} cell`);
  const anchor = items.find((it) => it.id === d.anchorItem), value = items.find((it) => it.id === d.valueItem);
  if (!anchor || !value || d.anchorItem === d.valueItem) fail(id, "anchorItem/valueItem missing");

  // gold rects = render ink of the two design items
  const parts = gold?.parts;
  if (!Array.isArray(parts) || parts.length !== 2) fail(id, "gold parts are not 2");
  const byItem = new Map(parts.map((g) => [g.item, g]));
  if (byItem.size !== 2 || !byItem.has(d.anchorItem) || !byItem.has(d.valueItem)) fail(id, "gold items differ from anchorItem/valueItem");
  for (const g of parts) {
    if (!rectOk(g.rect) || !Array.isArray(g.size) || g.rect[2] - g.rect[0] !== g.size[0] || g.rect[3] - g.rect[1] !== g.size[1]) fail(id, `gold rect ${g.item}`);
    if (!sameJson(render?.items?.[g.item]?.ink, g.rect)) fail(id, `gold rect ${g.item} differs from render ink`);
  }
  const anchorInk = byItem.get(d.anchorItem).rect, valueInk = byItem.get(d.valueItem).rect;

  // stored selection record
  if (!pred || pred.id !== id || pred.ocr !== "O1" || pred.status !== "ok") fail(id, "prediction row not ok");
  if (pred.width !== W || pred.height !== H) fail(id, "prediction size differs from design");
  if (!ocr || ocr.id !== id || ocr.ocr !== "O1") fail(id, "OCR row missing");
  const lines = ocr.ocrLines;
  checkLines(id, lines);
  const k1 = pred.k1;
  if (!k1 || k1.status !== "ok" || k1.branch !== "hangul" || k1.matched !== true) fail(id, "K1 is not an ok Hangul match");
  if (!isInt(k1.lineIndex) || k1.lineIndex < 0 || k1.lineIndex >= lines.length) fail(id, `lineIndex ${k1.lineIndex} out of range`);
  const line = lines[k1.lineIndex];
  if (k1.lineText !== line.text || !sameJson(k1.lineBox, line.box)) fail(id, "lineText/lineBox differ from the OCR line");
  const hw = k1.hitWords;
  if (!Array.isArray(hw) || hw.length === 0 || !hw.every((j, i) => isInt(j) && j >= 0 && j < line.words.length && (i === 0 || j > hw[i - 1]))) fail(id, `bad hitWords ${JSON.stringify(hw)}`);
  const again = recheckK1(lines, d.question, W, H, pred.k0);
  if (!sameJson(JSON.parse(JSON.stringify(again)), k1)) fail(id, `stored K1 differs from the fixed K1 recomputation: stored ${canon(k1)} recomputed ${canon(again)}`);
  if (lineK1Score(line, d.question) !== k1.score) fail(id, "K1 line score differs from the stored score");

  // window against both gold rects
  let bandXyxy;
  try { bandXyxy = bandToXyxy(k1.band, W, H); } catch (e) { fail(id, e.message); }
  const anchorDeficit = deficitOf(anchorInk, bandXyxy), valueDeficit = deficitOf(valueInk, bandXyxy);
  const anchorContained = isZero(anchorDeficit), valueContained = isZero(valueDeficit);
  const containment = containmentOf(anchorContained, valueContained);
  const requiredExpansion = Object.fromEntries(SIDES.map((s) => [s, Math.max(anchorDeficit[s], valueDeficit[s])]));
  const evidence = containment === "both" ? "all" : containment === "neither" ? "none" : "partial";
  const strict = containment === "both" && k1.band.width * k1.band.height < W * H;
  if (!score || score.id !== id || score.cond !== "O1K1") fail(id, "score row missing");
  if (score.evidence !== evidence || score.strict !== strict || score.state !== (strict ? "matched_strict" : "matched_not_strict")) fail(id, `score row (${score.evidence}, ${score.strict}) differs from recomputed (${evidence}, ${strict})`);
  if (!cohort || cohort.id !== id || cohort.doctype !== d.doctype || cohort.layout !== d.layout || cohort.strict !== strict || cohort.evidence !== evidence || cohort.state !== score.state || cohort.branch !== k1.branch || cohort.role !== (strict ? "control" : "primary")) fail(id, "cohort row differs from the score row");

  // words and lines
  const ctx = { items, anchorItem: d.anchorItem, anchorInk };
  const perLine = lines.map((l) => l.words.map((w, j) => wordRecord(w, j, ctx)));
  const words = perLine[k1.lineIndex];
  const cueLines = perLine.flatMap((recs, i) => (recs.some((r) => r.strictAnchorCue) ? [{ lineIndex: i, k1Score: lineK1Score(lines[i], d.question) }] : []));
  return {
    id, doctype: d.doctype, layout: d.layout, role: cohort.role, strict, evidence, containment, anchorContained, valueContained,
    anchorDeficit, valueDeficit, requiredExpansion, band: k1.band, bandXyxy, anchorInk, valueInk, anchorItem: d.anchorItem, valueItem: d.valueItem,
    lineIndex: k1.lineIndex, lineText: line.text,
    ...lineRecord(words, items, d.anchorItem),
    hitWords: hw,
    ...triggerRecord(words, hw, { anchorItem: d.anchorItem, anchorText: anchor.text, items }),
    k1Score: k1.score,
    cueLines,
    otherLineCue: cueLines.some((c) => c.lineIndex !== k1.lineIndex),
    words,
  };
}

// ------------------------------------------------------------------ denominators and registration
function uniqueKeys(rows, keyOf, label) {
  const seen = new Set();
  for (const r of rows) { const k = keyOf(r); if (seen.has(k)) fail(null, `${label}: duplicate key ${k}`); seen.add(k); }
  return seen;
}
/** Key uniqueness and full counts of design (n), predictions/OCR (2n) and score (4n) rows (protocol 2). */
export function checkDenominators({ design, preds, ocr, score }, n) {
  const ids = uniqueKeys(design, (r) => r.id, "design");
  if (ids.size !== n) fail(null, `design has ${ids.size} pages, not ${n}`);
  const full = (rows, field, values, label) => {
    const keys = uniqueKeys(rows, (r) => `${r[field]}|${r.id}`, label);
    if (rows.length !== values.length * n) fail(null, `${label} has ${rows.length} rows, not ${values.length * n}`);
    for (const v of values) for (const id of ids) if (!keys.has(`${v}|${id}`)) fail(null, `${label} misses ${v}|${id}`);
    return rows.length;
  };
  return { pages: n, predictions: full(preds, "ocr", ["O0", "O1"], "predictions"), ocr: full(ocr, "ocr", ["O0", "O1"], "ocr"), score: full(score, "cond", CONDITIONS, "score") };
}

export function checkRegistered(rows) {
  const got = Object.fromEntries(CONTAINMENTS.map((c) => [c, rows.filter((r) => r.containment === c).length]));
  if (CONTAINMENTS.some((c) => got[c] !== REGISTERED_SPLIT[c])) fail(null, `containment split ${canon(got)} differs from the registered ${canon(REGISTERED_SPLIT)}`);
  return got;
}

// ------------------------------------------------------------------ comparison (both directions, every field)
export function comparePages(rowsA, rowsB, key = "id") {
  const group = (rows) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  const ga = group(rowsA), gb = group(rowsB);
  const diffs = [];
  let sameRows = 0;
  for (const [k, ra] of ga) {
    const rb = gb.get(k);
    if (!rb || ra.length !== 1 || rb.length !== 1) continue;
    const a = ra[0], b = rb[0];
    const fieldsOnlyInA = Object.keys(a).filter((f) => !(f in b));
    const fieldsOnlyInB = Object.keys(b).filter((f) => !(f in a));
    const fields = Object.keys(a).filter((f) => f in b && !sameJson(a[f], b[f]));
    if (!fieldsOnlyInA.length && !fieldsOnlyInB.length && !fields.length) sameRows++;
    else diffs.push({ key: k, fields, fieldsOnlyInA, fieldsOnlyInB });
  }
  const dups = (g) => [...g].filter(([, v]) => v.length > 1).map(([k]) => k);
  const order = (rows) => rows.map((r) => r[key]).join("\n");
  const out = {
    rowsA: rowsA.length, rowsB: rowsB.length, sameRows,
    sameOrder: order(rowsA) === order(rowsB),
    onlyInA: [...ga.keys()].filter((k) => !gb.has(k)),
    onlyInB: [...gb.keys()].filter((k) => !ga.has(k)),
    duplicatesInA: dups(ga), duplicatesInB: dups(gb), diffs,
  };
  out.identical = out.sameOrder && sameRows === rowsA.length && rowsA.length === rowsB.length && !diffs.length;
  return out;
}

// ------------------------------------------------------------------ summary (protocol 7)
const tally = (rows, keys, f) => Object.fromEntries(keys.map((k) => [k, rows.filter((r) => f(r) === k).length]));
const cross = (rows, rk, rf, ck, cf) => Object.fromEntries(rk.map((k) => [k, tally(rows.filter((r) => rf(r) === k), ck, cf)]));
function block(rows) {
  return {
    n: rows.length,
    primary: rows.filter((r) => r.role === "primary").length,
    control: rows.filter((r) => r.role === "control").length,
    containment: tally(rows, CONTAINMENTS, (r) => r.containment),
    lineClass: tally(rows, LINE_CLASSES, (r) => r.lineClass),
    triggerSource: tally(rows, TRIGGERS, (r) => r.triggerSource),
  };
}
function otherCue(rows) {
  const without = rows.filter((r) => r.lineClass !== "anchorCue");
  const o = { selectedWithoutCue: without.length, cueOnOtherLine: 0, noCueAnywhere: 0, otherCueScoreLower: 0, otherCueScoreEqual: 0, otherCueScoreHigher: 0 };
  for (const r of without) {
    const others = r.cueLines.filter((c) => c.lineIndex !== r.lineIndex);
    if (!others.length) { o.noCueAnywhere++; continue; }
    o.cueOnOtherLine++;
    const best = Math.max(...others.map((c) => c.k1Score));
    if (best < r.k1Score) o.otherCueScoreLower++; else if (best === r.k1Score) o.otherCueScoreEqual++; else o.otherCueScoreHigher++;
  }
  return o;
}
const sides = (rows, f) => Object.fromEntries(SIDES.map((s) => [s, rows.filter((r) => (f(r)?.[s] ?? 0) > 0).length]));

export function summarize(rows) {
  const groups = { primary: rows.filter((r) => r.role === "primary"), control: rows.filter((r) => r.role === "control"), all: rows };
  const per = (f) => Object.fromEntries(Object.entries(groups).map(([g, rs]) => [g, f(rs)]));
  const keysOf = (f) => [...new Set(rows.map(f))].sort();
  const byKey = (f) => Object.fromEntries(keysOf(f).map((k) => [k, block(rows.filter((r) => f(r) === k))]));
  return {
    denominators: { all: rows.length, primary: groups.primary.length, control: groups.control.length },
    containment: per((rs) => tally(rs, CONTAINMENTS, (r) => r.containment)),
    containmentByLineClass: per((rs) => cross(rs, CONTAINMENTS, (r) => r.containment, LINE_CLASSES, (r) => r.lineClass)),
    containmentByTrigger: per((rs) => cross(rs, CONTAINMENTS, (r) => r.containment, TRIGGERS, (r) => r.triggerSource)),
    lineClassByTrigger: per((rs) => cross(rs, LINE_CLASSES, (r) => r.lineClass, TRIGGERS, (r) => r.triggerSource)),
    lineClassByMixed: per((rs) => cross(rs, LINE_CLASSES, (r) => r.lineClass, ["mixed", "notMixed"], (r) => (r.lineMixed ? "mixed" : "notMixed"))),
    hitTextInAnchorTextByTrigger: per((rs) => cross(rs, TRIGGERS, (r) => r.triggerSource, ["true", "false"], (r) => String(r.hitTextInAnchorText === true))),
    otherLineCue: per(otherCue),
    deficitSides: per((rs) => sides(rs, (r) => r.requiredExpansion)),
    anchorDeficitSides: per((rs) => sides(rs, (r) => r.anchorDeficit)),
    valueDeficitSides: per((rs) => sides(rs, (r) => r.valueDeficit)),
    byLayout: byKey((r) => r.layout),
    byDoctype: byKey((r) => r.doctype),
    byDoctypeLayout: byKey((r) => `${r.doctype}/${r.layout}`),
  };
}
