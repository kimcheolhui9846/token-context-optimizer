// ko-row-window: pure rules of research/plans/2026-11-24-ko-row-window-protocol.md (W1 rule 4.4, replay 4.5, scoring 5).
// No file, Git or OCR access here. K0/K1 come from the fixed #147 library and are passed in by the callers.
// The independent check (tools/ko-row-window/recount.py) re-implements all of this from RECOUNT_SPEC.md.

export class ValidationError extends Error {}
const fail = (msg) => { throw new ValidationError(msg); };

export const DOCTYPES = ["exhibit", "costume", "lostfound"];
export const FORMS = ["table", "cards"];
export const VERTS = ["inline", "stacked"];
export const GAPS = ["near", "far"];
export const AXES = { vert: VERTS, form: FORMS, gap: GAPS, doctype: DOCTYPES };

// Registered whitespace set (RECOUNT_SPEC 4.6).
const WS = /[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu;
export const isBlankWord = (text) => String(text).normalize("NFC").replace(WS, "").length === 0;

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** OCR [x, y, w, h] -> half-open [x, y, x + w, y + h) in original page pixels, no rounding. */
export function toRect(box) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(finite)) fail(`bad box ${JSON.stringify(box)}`);
  const [x, y, w, h] = box;
  if (w < 0 || h < 0) fail(`negative box size ${JSON.stringify(box)}`);
  return [x, y, x + w, y + h];
}

/** Candidate c lies right of hit h on the same row (RECOUNT_SPEC 4.7). */
export function sameRowRight(h, c) {
  if (!(c[0] >= h[2])) return false;
  const ov = Math.min(h[3], c[3]) - Math.max(h[1], c[1]);
  return ov > 0 && ov >= 0.5 * Math.min(h[3] - h[1], c[3] - c[1]);
}

const bandOk = (b, W, H) => Boolean(b) && typeof b === "object" && [b.left, b.top, b.width, b.height].every(Number.isInteger) && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0 && b.left + b.width <= W && b.top + b.height <= H;
const copyBand = (b) => ({ left: b.left, top: b.top, width: b.width, height: b.height });

/**
 * W1 for one page (protocol 4.4, RECOUNT_SPEC 4). Returns { reason, w0, w1, hitRects, candidates, maxRight, clippedRight, addedPixels }.
 * Broken K1 records throw ValidationError (task verification failure, not a page error).
 */
export function w1Rule(lines, k1, width, height) {
  if (!k1 || typeof k1 !== "object") fail("k1 record missing");
  const none = { w0: null, w1: null, hitRects: null, candidates: null, maxRight: null, clippedRight: null, addedPixels: null };
  if (k1.status !== "ok") {
    if (k1.status !== "error") fail(`k1 status ${JSON.stringify(k1.status)}`);
    return { reason: "error", ...none };
  }
  if (k1.matched === false) return { reason: "unmatched", ...none };
  if (k1.matched !== true) fail(`k1 matched ${JSON.stringify(k1.matched)}`);
  if (!bandOk(k1.band, width, height)) fail(`k1 band invalid ${JSON.stringify(k1.band)}`);
  const w0 = copyBand(k1.band);
  if (k1.branch !== "hangul") {
    if (k1.branch !== "k0") fail(`matched k1 branch ${JSON.stringify(k1.branch)}`);
    return { reason: "k0_branch", w0, w1: copyBand(w0), hitRects: null, candidates: null, maxRight: null, clippedRight: null, addedPixels: 0 };
  }
  if (!Array.isArray(lines)) fail("OCR lines missing");
  const li = k1.lineIndex;
  if (!Number.isInteger(li) || li < 0 || li >= lines.length) fail(`lineIndex ${JSON.stringify(li)} out of range`);
  const line = lines[li];
  if (!line || line.text !== k1.lineText) fail(`lineText differs from OCR line ${li}`);
  const hw = k1.hitWords;
  if (!Array.isArray(hw) || hw.length === 0) fail("hitWords empty");
  if (new Set(hw).size !== hw.length || !hw.every((j) => Number.isInteger(j) && j >= 0 && j < line.words.length)) fail(`hitWords ${JSON.stringify(hw)} invalid`);
  const hitRects = hw.map((j) => toRect(line.words[j].box));
  const candidates = [];
  let maxRight = null;
  lines.forEach((l, i) => {
    if (!l || !Array.isArray(l.words)) fail(`OCR line ${i} words`);
    l.words.forEach((w, j) => {
      if (!w || typeof w.text !== "string") fail(`OCR line ${i} word ${j} text`);
      const c = toRect(w.box);
      if (isBlankWord(w.text)) return;
      if (hitRects.some((h) => sameRowRight(h, c))) {
        candidates.push([i, j]);
        if (maxRight === null || c[2] > maxRight) maxRight = c[2];
      }
    });
  });
  const w0Right = w0.left + w0.width;
  if (!candidates.length) return { reason: "no_candidate", w0, w1: copyBand(w0), hitRects, candidates, maxRight: null, clippedRight: null, addedPixels: 0 };
  const clippedRight = Math.min(width, Math.ceil(maxRight));
  const right = Math.max(w0Right, clippedRight);
  const w1 = { left: w0.left, top: w0.top, width: right - w0.left, height: w0.height };
  return { reason: right > w0Right ? "widened" : "not_wider", w0, w1, hitRects, candidates, maxRight, clippedRight, addedPixels: (w1.width - w0.width) * w0.height };
}

// ------------------------------------------------------------------ replay (protocol 4.5)
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
export const sameJson = (a, b) => canon(a) === canon(b);

/**
 * One prediction row from the frozen OCR row and K1 row. recomputeK1(lines, question, w, h) must return the fixed K1
 * for the raw OCR; any difference from the stored K1 is a ValidationError.
 */
export function buildPrediction({ id, question, pngSha256, width, height, ocrRow, k1Row }, recomputeK1) {
  if (!ocrRow || ocrRow.id !== id || !k1Row || k1Row.id !== id) fail(`${id}: OCR/K1 row ids do not join`);
  if (ocrRow.pngSha256 !== pngSha256) fail(`${id}: OCR row image hash differs from the frozen PNG`);
  const k1 = k1Row.k1;
  if (!k1 || typeof k1 !== "object") fail(`${id}: K1 record missing`);
  if (ocrRow.status === "ok") {
    if (ocrRow.width !== width || ocrRow.height !== height) fail(`${id}: OCR row size differs from the PNG`);
    const again = recomputeK1(ocrRow.ocrLines, question, width, height);
    if (!sameJson(again, k1)) fail(`${id}: stored K1 differs from the fixed K1 recomputed from raw OCR`);
    if (k1Row.status !== (k1.status === "ok" ? "ok" : "error")) fail(`${id}: K1 row status`);
  } else if (ocrRow.status === "error") {
    if (k1.status !== "error" || k1Row.status !== "error") fail(`${id}: OCR error row must carry a K1 error`);
  } else fail(`${id}: OCR status ${JSON.stringify(ocrRow.status)}`);
  const r = w1Rule(ocrRow.status === "ok" ? ocrRow.ocrLines : null, k1, width, height);
  const state = r.reason === "error" ? "error" : r.reason === "unmatched" ? "unmatched" : "matched";
  return {
    id, pngSha256, ocrSha256: ocrRow.ocrSha256 ?? null, width, height, state,
    error: state === "error" ? (ocrRow.error ?? k1.error ?? k1Row.error ?? "error") : null,
    branch: k1.branch ?? null, lineIndex: k1.lineIndex ?? null, hitWords: k1.hitWords ?? null,
    reason: r.reason, w0: r.w0, w1: r.w1, candidates: r.candidates, maxRight: r.maxRight, clippedRight: r.clippedRight, addedPixels: r.addedPixels,
  };
}

// ------------------------------------------------------------------ scoring (protocol 5)
const inside = ([l, t, r, b], w) => l >= w.left && t >= w.top && r <= w.left + w.width && b <= w.top + w.height;

/** One page: fixed scoreKey for W0 and W1, stage, 2x2 transition and the newly covered ink of every item. */
export function scorePage(pred, page, scoreKey) {
  if (!pred || pred.id !== page.id) fail(`score: prediction ${pred?.id} does not join page ${page.id}`);
  const status = pred.state === "error" ? "error" : "ok";
  const matched = pred.state === "matched";
  const geo = { width: page.width, height: page.height };
  const one = (band) => {
    const s = scoreKey({ status, matched: status === "ok" ? matched : null, band }, geo, page.parts);
    return { state: s.state, strict: s.strict, evidence: s.evidence, fullPage: s.fullPage, area: matched ? band.width * band.height : null };
  };
  const w0 = one(pred.w0), w1 = one(pred.w1);
  const stage = pred.state === "error" ? "error" : pred.state === "unmatched" ? "unmatched" : pred.branch === "hangul" ? "hangul" : "k0";
  const transition = w0.strict && w1.strict ? "keptSuccess" : w1.strict ? "recovered" : w0.strict ? "lost" : "bothFail";
  let newInk = null;
  if (matched) {
    newInk = { targetLabel: 0, targetValue: 0, otherValues: 0, otherLabels: 0, notes: 0, headers: 0, others: 0 };
    for (const [item, { role, ink }] of Object.entries(page.inks)) {
      if (!(inside(ink, pred.w1) && !inside(ink, pred.w0))) continue;
      const k = item === page.anchorItem ? "targetLabel" : item === page.valueItem ? "targetValue" : role === "value" ? "otherValues" : role === "label" ? "otherLabels" : role === "note" ? "notes" : role === "header" ? "headers" : "others";
      newInk[k]++;
    }
  }
  return { id: page.id, doctype: page.doctype, form: page.form, vert: page.vert, gap: page.gap, case: page.case ?? null, stage, reason: pred.reason, w0, w1, transition, error: pred.state === "error", addedPixels: pred.addedPixels, newInk };
}

export const pct = (c, n) => (n > 0 ? Math.round((c * 10000) / n) / 100 : null);
export const r4 = (x) => Math.round(x * 10000) / 10000;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const INK_KEYS = ["targetLabel", "targetValue", "otherValues", "otherLabels", "notes", "headers", "others"];

function group(rows, A) {
  const c = (f) => rows.filter(f).length;
  const valid = rows.filter((r) => r.stage === "k0" || r.stage === "hangul");
  const wid = valid.filter((r) => r.reason === "widened");
  const added = valid.map((r) => r.addedPixels), addedW = wid.map((r) => r.addedPixels);
  const sum = added.reduce((a, b) => a + b, 0), sumW = addedW.reduce((a, b) => a + b, 0);
  const t = (k) => c((r) => r.transition === k);
  const recovered = t("recovered"), lost = t("lost");
  const w0s = c((r) => r.w0.strict), net = recovered - lost;
  const newInk = Object.fromEntries(INK_KEYS.map((k) => [k, valid.reduce((a, r) => a + r.newInk[k], 0)]));
  newInk.pagesWithOtherValue = valid.filter((r) => r.newInk.otherValues > 0).length;
  return {
    n: rows.length, error: c((r) => r.stage === "error"), unmatched: c((r) => r.stage === "unmatched"), matched: valid.length,
    w0: { strict: w0s, fullPage: c((r) => r.w0.fullPage === true) },
    w1: { strict: c((r) => r.w1.strict), fullPage: c((r) => r.w1.fullPage === true) },
    transition: { recovered, lost, keptSuccess: t("keptSuccess"), bothFail: t("bothFail"), bothFailError: c((r) => r.transition === "bothFail" && r.stage === "error"), bothFailUnmatched: c((r) => r.transition === "bothFail" && r.stage === "unmatched") },
    recoveredOfW0Fail: { count: recovered, denom: rows.length - w0s, pct: pct(recovered, rows.length - w0s) },
    lostOfW0Success: { count: lost, denom: w0s, pct: pct(lost, w0s) },
    net, widened: wid.length,
    area: {
      validPairs: valid.length, addedPixelsSum: sum,
      meanPp: valid.length ? r4((sum * 100) / (valid.length * A)) : null,
      medianPp: valid.length ? r4((median(added) * 100) / A) : null,
      maxPp: valid.length ? r4((Math.max(...added) * 100) / A) : null,
      widenedPages: wid.length,
      widenedMeanPp: wid.length ? r4((sumW * 100) / (wid.length * A)) : null,
      widenedMedianPp: wid.length ? r4((median(addedW) * 100) / A) : null,
      widenedMaxPp: wid.length ? r4((Math.max(...addedW) * 100) / A) : null,
      perNewSuccess: recovered > 0 ? r4(sum / recovered) : null,
      perNet: net > 0 ? r4(sum / net) : null,
      perNetReason: net > 0 ? null : "net <= 0",
    },
    newInk,
  };
}

/** All registered aggregates (protocol 5) from score rows in question order. */
export function summarizeScores(rows, { pageArea }) {
  const hang = rows.filter((r) => r.stage === "hangul");
  const stages = {
    pages: rows.length,
    error: rows.filter((r) => r.stage === "error").length,
    unmatched: rows.filter((r) => r.stage === "unmatched").length,
    k0Matched: rows.filter((r) => r.stage === "k0").length,
    hangulMatched: hang.length,
    hangul: {
      hitsVerified: hang.length,
      withCandidates: hang.filter((r) => r.reason === "widened" || r.reason === "not_wider").length,
      widened: hang.filter((r) => r.reason === "widened").length,
      notWider: hang.filter((r) => r.reason === "not_wider").length,
      noCandidate: hang.filter((r) => r.reason === "no_candidate").length,
    },
  };
  const groups = { total: group(rows, pageArea) };
  for (const [axis, keys] of Object.entries(AXES)) groups[axis] = Object.fromEntries(keys.map((k) => [k, group(rows.filter((r) => r[axis] === k), pageArea)]));
  const ids = (f) => rows.filter(f).map((r) => r.id);
  const lists = {
    recovered: ids((r) => r.transition === "recovered"),
    lost: ids((r) => r.transition === "lost"),
    lostFullPage: ids((r) => r.transition === "lost" && r.w1.fullPage === true),
    widened: ids((r) => r.reason === "widened"),
  };
  return { stages, groups, lists };
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

// ------------------------------------------------------------------ question normalization and overlap (protocol 3.4)
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
