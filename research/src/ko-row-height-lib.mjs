// ko-row-height: pure rules of research/plans/2026-11-24-ko-row-height-protocol.md (W2 rule 4.4, replay 4.5, scoring 5, tables).
// No file, Git or OCR access here. K0/K1 (#147) and W1 (#150) come from the fixed Git blobs and are passed in by the callers.
// The independent check (tools/ko-row-height/recount.py) re-implements all of this from RECOUNT_SPEC.md.

export class ValidationError extends Error {}
const fail = (msg) => { throw new ValidationError(msg); };

export const DOCTYPES = ["venue", "proof", "workshop"];
export const FORMS = ["table", "cards"];
export const VERTS = ["same", "below"];
export const SPACES = ["narrow", "wide"];
export const LAYOUTS = ["same-narrow", "same-wide", "below-narrow", "below-wide"];
const W1_REASONS = ["widened", "not_wider", "no_candidate", "k0_branch", "unmatched", "error"];
const W2_REASONS = ["inherit", "cut", "no_cut", "hit_outside_w1"];

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const copyBand = (b) => ({ left: b.left, top: b.top, width: b.width, height: b.height });
const bandOk = (b, W, H) => Boolean(b) && typeof b === "object" && [b.left, b.top, b.width, b.height].every(isInt) && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0 && b.left + b.width <= W && b.top + b.height <= H;
const sameBand = (a, b) => a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ------------------------------------------------------------------ W2 (protocol 4.4, RECOUNT_SPEC 4)
/**
 * W1 by the fixed #150 rule, then W2. Returns { reason, w0, w1, candidates, maxRight, clippedRight, addedPixels,
 * w2Reason, hitTop, hitBottom, pad, w2, cutPixels }. Broken records throw ValidationError (task verification failure).
 */
export function w2Rule(w1Rule, lines, k1, width, height) {
  let r;
  try {
    r = w1Rule(lines, k1, width, height);
  } catch (err) {
    throw new ValidationError(`W1: ${String(err?.message || err)}`);
  }
  const out = {
    reason: r.reason, w0: r.w0, w1: r.w1, candidates: r.candidates, maxRight: r.maxRight, clippedRight: r.clippedRight, addedPixels: r.addedPixels,
    w2Reason: "inherit", hitTop: null, hitBottom: null, pad: null, w2: null, cutPixels: null,
  };
  if (r.reason !== "widened") {
    if (r.w1) { out.w2 = copyBand(r.w1); out.cutPixels = 0; }
    return out;
  }
  const line = lines[k1.lineIndex];
  const hw = k1.hitWords;
  if (!Array.isArray(hw) || hw.length === 0) fail("widened page without hits");
  if (new Set(hw).size !== hw.length || !hw.every((j) => isInt(j) && j >= 0 && j < line.words.length)) fail(`hitWords ${JSON.stringify(hw)} invalid`);
  const rects = hw.map((j) => {
    const box = line.words[j]?.box;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(finite)) fail(`hit ${j} box ${JSON.stringify(box)}`);
    const [x, y, w, h] = box;
    if (!(w > 0) || !(h > 0)) fail(`hit ${j} has non-positive size ${JSON.stringify(box)}`);
    return [x, y, x + w, y + h];
  });
  const a = Math.min(...rects.map((q) => q[1])), b = Math.max(...rects.map((q) => q[3]));
  const pad = median(rects.map((q) => q[3] - q[1]));
  const w1 = r.w1, w1Top = w1.top, w1Bottom = w1.top + w1.height;
  Object.assign(out, { hitTop: a, hitBottom: b, pad });
  if (rects.some((q) => q[1] < w1Top || q[3] > w1Bottom)) {
    Object.assign(out, { w2Reason: "hit_outside_w1", w2: copyBand(w1), cutPixels: 0 });
    return out;
  }
  const top = Math.max(w1Top, Math.floor(a - pad));
  const bottom = Math.min(w1Bottom, Math.ceil(b + pad));
  if (!(top < bottom)) fail(`W2 top ${top} >= bottom ${bottom}`);
  const w2 = { left: w1.left, top, width: w1.width, height: bottom - top };
  if (!(w2.top >= w1Top && bottom <= w1Bottom)) fail("W2 not inside W1");
  if (!rects.every((q) => q[1] >= top && q[3] <= bottom)) fail("a hit is not inside W2");
  Object.assign(out, { w2Reason: top === w1Top && bottom === w1Bottom ? "no_cut" : "cut", w2, cutPixels: (w1.height - w2.height) * w1.width });
  return out;
}

// ------------------------------------------------------------------ exposure (RECOUNT_SPEC 5.2)
/** "full" | "partial" | "none" (zero intersection area, touching included) | null (no window). */
export function exposure([l, t, r, b], band) {
  if (!band) return null;
  const R = band.left + band.width, B = band.top + band.height;
  if (l >= band.left && t >= band.top && r <= R && b <= B) return "full";
  const ix = Math.min(r, R) - Math.max(l, band.left), iy = Math.min(b, B) - Math.max(t, band.top);
  return ix > 0 && iy > 0 ? "partial" : "none";
}

// ------------------------------------------------------------------ prediction validation (RECOUNT_SPEC 5.1)
export function validatePrediction(p) {
  const W = p.width, H = p.height;
  const id = p.id;
  if (p.state === "matched") {
    for (const k of ["w0", "w1", "w2"]) if (!bandOk(p[k], W, H)) fail(`${id}: ${k} is not a positive window inside the page`);
    const { w0, w1, w2 } = p;
    if (!(w1.left === w0.left && w1.top === w0.top && w1.height === w0.height && w1.width >= w0.width)) fail(`${id}: W1 does not keep W0 left/top/height`);
    if (w2.left !== w1.left || w2.width !== w1.width) fail(`${id}: W2 left/width differ from W1`);
    if (!(w2.top >= w1.top && w2.top + w2.height <= w1.top + w1.height)) fail(`${id}: W2 is not inside W1`);
    if (!W2_REASONS.includes(p.w2Reason)) fail(`${id}: w2Reason ${p.w2Reason}`);
    if ((p.reason !== "widened") !== (p.w2Reason === "inherit")) fail(`${id}: w2Reason ${p.w2Reason} with W1 reason ${p.reason}`);
    if (p.w2Reason === "cut" ? sameBand(w2, w1) : !sameBand(w2, w1)) fail(`${id}: W2 window does not match w2Reason ${p.w2Reason}`);
    if (p.cutPixels !== (w1.height - w2.height) * w1.width) fail(`${id}: cutPixels ${p.cutPixels}`);
    if ((p.w2Reason === "cut" || p.w2Reason === "no_cut") && !(finite(p.hitTop) && finite(p.hitBottom) && p.hitTop >= w2.top && p.hitBottom <= w2.top + w2.height)) fail(`${id}: hits not inside W2`);
  } else if (p.state === "unmatched" || p.state === "error") {
    if (p.w0 !== null || p.w1 !== null || p.w2 !== null || p.cutPixels !== null || p.w2Reason !== "inherit") fail(`${id}: ${p.state} row carries a window`);
  } else fail(`${id}: state ${JSON.stringify(p.state)}`);
  return true;
}

// ------------------------------------------------------------------ replay (protocol 4.5)
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
export const sameJson = (a, b) => canon(a) === canon(b);

/**
 * One prediction row from the frozen OCR row and K1 row. recomputeK1(lines, question, w, h) must return the fixed K1 for the
 * raw OCR; any difference from the stored K1 is a ValidationError. w1Rule is the fixed #150 rule.
 */
export function buildPrediction({ id, question, pngSha256, width, height, ocrRow, k1Row }, recomputeK1, w1Rule) {
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
  const r = w2Rule(w1Rule, ocrRow.status === "ok" ? ocrRow.ocrLines : null, k1, width, height);
  const state = r.reason === "error" ? "error" : r.reason === "unmatched" ? "unmatched" : "matched";
  const pred = {
    id, pngSha256, ocrSha256: ocrRow.ocrSha256 ?? null, width, height, state,
    error: state === "error" ? (ocrRow.error ?? k1.error ?? k1Row.error ?? "error") : null,
    branch: k1.branch ?? null, lineIndex: k1.lineIndex ?? null, hitWords: k1.hitWords ?? null,
    reason: r.reason, w0: r.w0, w1: r.w1, candidates: r.candidates, maxRight: r.maxRight, clippedRight: r.clippedRight, addedPixels: r.addedPixels,
    w2Reason: r.w2Reason, hitTop: r.hitTop, hitBottom: r.hitBottom, pad: r.pad, w2: r.w2, cutPixels: r.cutPixels,
  };
  validatePrediction(pred);
  return pred;
}

// ------------------------------------------------------------------ scoring (protocol 5, RECOUNT_SPEC 5.3)
const transition = (a, b) => (a && b ? "keptSuccess" : b ? "recovered" : a ? "lost" : "bothFail");
const tally = (xs) => ({ full: xs.filter((x) => x === "full").length, partial: xs.filter((x) => x === "partial").length, none: xs.filter((x) => x === "none").length });

/** One page: fixed scoreKey for W0/W1/W2, transitions, lost parts, other-value exposure and the J flags. */
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
  const w0 = one(pred.w0), w1 = one(pred.w1), w2 = one(pred.w2);
  const stage = pred.state === "error" ? "error" : pred.state === "unmatched" ? "unmatched" : pred.branch === "hangul" ? "hangul" : "k0";
  const t12 = transition(w1.strict, w2.strict);
  let lostParts = null;
  if (t12 === "lost") {
    lostParts = [];
    if (exposure(page.parts[0], pred.w2) !== "full") lostParts.push("label");
    if (exposure(page.parts[1], pred.w2) !== "full") lostParts.push("value");
  }
  let others = null;
  if (matched) {
    const items = page.otherValueItems.map((item) => {
      const ink = page.inks[item]?.ink;
      if (!ink) fail(`${page.id}: other value ${item} has no ink`);
      return { item, w0: exposure(ink, pred.w0), w1: exposure(ink, pred.w1), w2: exposure(ink, pred.w2) };
    });
    others = { n: items.length, w1: tally(items.map((i) => i.w1)), w2: tally(items.map((i) => i.w2)), fromW1Full: tally(items.filter((i) => i.w1 === "full").map((i) => i.w2)), items };
  }
  const jOpportunity = matched && w1.strict && pred.w2Reason === "cut" && others.w1.full >= 1;
  const jEvent = jOpportunity && w2.strict && others.fromW1Full.none >= 1;
  return {
    id: page.id, source: page.source, doctype: page.doctype, form: page.form, content: page.content, vert: page.vert, space: page.space, slot: page.slot,
    stage, reason: pred.reason, w2Reason: pred.w2Reason, w0, w1, w2, t01: transition(w0.strict, w1.strict), t12,
    fullPageToPartial: matched ? w1.fullPage === true && w2.fullPage !== true : null, lostParts, cutPixels: pred.cutPixels, others,
    jOpportunity, jEvent, error: pred.state === "error",
  };
}

export const pct = (c, n) => (n > 0 ? Math.round((c * 10000) / n) / 100 : null);
export const r4 = (x) => Math.round(x * 10000) / 10000;
const distinct = (rows) => new Set(rows.map((r) => r.source)).size;
const isMatched = (r) => r.stage === "k0" || r.stage === "hangul";
const EV = { all: 2, partial: 1, none: 0 };

function group(rows, A) {
  const c = (f) => rows.filter(f).length;
  const valid = rows.filter(isMatched);
  const tr = (k) => ({ recovered: c((r) => r[k] === "recovered"), lost: c((r) => r[k] === "lost"), keptSuccess: c((r) => r[k] === "keptSuccess"), bothFail: c((r) => r[k] === "bothFail") });
  const lost = rows.filter((r) => r.t12 === "lost");
  const w1s = c((r) => r.w1.strict);
  const jE = rows.filter((r) => r.jEvent), jO = rows.filter((r) => r.jOpportunity);
  const fp = rows.filter((r) => r.fullPageToPartial === true);
  const lp = (k) => lost.filter((r) => JSON.stringify(r.lostParts) === JSON.stringify(k)).length;
  const sum = (f) => valid.reduce((a, r) => a + f(r), 0);
  const o = (r) => r.others;
  const cutRows = valid.filter((r) => r.w2Reason === "cut");
  const px = valid.map((r) => r.cutPixels), pxCut = cutRows.map((r) => r.cutPixels);
  const tot = px.reduce((a, b) => a + b, 0), totCut = pxCut.reduce((a, b) => a + b, 0);
  const widened = c((r) => r.reason === "widened"), cut = c((r) => r.w2Reason === "cut");
  const L = { count: lost.length, denom: w1s, pct: pct(lost.length, w1s), sources: distinct(lost) };
  const J = { count: jE.length, opportunity: jO.length, pct: pct(jE.length, jO.length), sources: distinct(jE), opportunitySources: distinct(jO) };
  const removal = widened === 0 ? "no_opportunity_widened" : cut === 0 ? "no_opportunity_cut" : J.opportunity === 0 ? "no_opportunity_denominator"
    : J.count >= 1 ? (J.sources >= 2 ? "observed_repeated_sources" : "observed_single_source") : "not_observed";
  return {
    n: rows.length, error: c((r) => r.stage === "error"), unmatched: c((r) => r.stage === "unmatched"), matched: valid.length,
    strict: { w0: c((r) => r.w0.strict), w1: w1s, w2: c((r) => r.w2.strict) },
    fullPage: { w0: c((r) => r.w0.fullPage === true), w1: c((r) => r.w1.fullPage === true), w2: c((r) => r.w2.fullPage === true) },
    t01: tr("t01"), t12: tr("t12"), L, J,
    fullPageToPartial: { count: fp.length, recovered: fp.filter((r) => r.t12 === "recovered").length },
    lostParts: { label: lp(["label"]), value: lp(["value"]), both: lp(["label", "value"]) },
    widened, cut, noCut: c((r) => r.w2Reason === "no_cut"), hitOutside: c((r) => r.w2Reason === "hit_outside_w1"),
    others: {
      pagesW1Full: valid.filter((r) => o(r).w1.full >= 1).length, itemsW1Full: sum((r) => o(r).w1.full),
      pagesW2Full: valid.filter((r) => o(r).w2.full >= 1).length, itemsW2Full: sum((r) => o(r).w2.full),
      itemsW1Partial: sum((r) => o(r).w1.partial), itemsW2Partial: sum((r) => o(r).w2.partial),
      fromW1Full: { full: sum((r) => o(r).fromW1Full.full), partial: sum((r) => o(r).fromW1Full.partial), none: sum((r) => o(r).fromW1Full.none) },
      pagesReduced: valid.filter((r) => o(r).w2.full < o(r).w1.full).length,
      pagesReducedBothStrict: valid.filter((r) => o(r).w2.full < o(r).w1.full && r.w1.strict && r.w2.strict).length,
      pagesFullToPartialOnly: valid.filter((r) => o(r).fromW1Full.partial >= 1 && o(r).fromW1Full.none === 0).length,
      pagesFullToNone: valid.filter((r) => o(r).fromW1Full.none >= 1).length,
      pagesFullToPartialAndNone: valid.filter((r) => o(r).fromW1Full.partial >= 1 && o(r).fromW1Full.none >= 1).length,
      newlyFullW2: sum((r) => o(r).items.filter((i) => i.w2 === "full" && i.w1 !== "full").length),
      newEvidenceW2: sum((r) => Math.max(0, EV[r.w2.evidence] - EV[r.w1.evidence])),
    },
    area: {
      validPairs: valid.length, cutPixelsSum: tot,
      meanPp: valid.length ? r4((tot * 100) / (valid.length * A)) : null,
      medianPp: valid.length ? r4((median(px) * 100) / A) : null,
      maxPp: valid.length ? r4((Math.max(...px) * 100) / A) : null,
      cutPages: cutRows.length, cutPixelsSumCut: totCut,
      cutMeanPp: cutRows.length ? r4((totCut * 100) / (cutRows.length * A)) : null,
      cutMedianPp: cutRows.length ? r4((median(pxCut) * 100) / A) : null,
      cutMaxPp: cutRows.length ? r4((Math.max(...pxCut) * 100) / A) : null,
    },
    sources: distinct(rows),
    verdict: { loss: L.count > 0 ? "loss" : "no_loss", removal },
  };
}

/** All registered aggregates (protocol 5, RECOUNT_SPEC 6) from score rows in question order. */
export function summarizeScores(rows, { pageArea }) {
  const A = pageArea;
  const by = (f) => rows.filter(f);
  const stages = {
    pages: rows.length, error: by((r) => r.stage === "error").length, normal: rows.length - by((r) => r.stage === "error").length,
    unmatched: by((r) => r.stage === "unmatched").length, k0Matched: by((r) => r.stage === "k0").length, hangulMatched: by((r) => r.stage === "hangul").length,
    w1Reason: { widened: by((r) => r.reason === "widened").length, notWider: by((r) => r.reason === "not_wider").length, noCandidate: by((r) => r.reason === "no_candidate").length,
      k0Branch: by((r) => r.reason === "k0_branch").length, unmatched: by((r) => r.reason === "unmatched").length, error: by((r) => r.reason === "error").length },
    w2Reason: { inherit: by((r) => r.w2Reason === "inherit").length, cut: by((r) => r.w2Reason === "cut").length, noCut: by((r) => r.w2Reason === "no_cut").length, hitOutside: by((r) => r.w2Reason === "hit_outside_w1").length },
  };
  const sources = [...new Set(rows.map((r) => r.source))];
  const groups = {
    total: group(rows, A),
    w1Widened: group(by((r) => r.reason === "widened"), A),
    cut: group(by((r) => r.w2Reason === "cut"), A),
    layout: Object.fromEntries(LAYOUTS.map((k) => [k, group(by((r) => `${r.vert}-${r.space}` === k), A)])),
    vert: Object.fromEntries(VERTS.map((k) => [k, group(by((r) => r.vert === k), A)])),
    space: Object.fromEntries(SPACES.map((k) => [k, group(by((r) => r.space === k), A)])),
    form: Object.fromEntries(FORMS.map((k) => [k, group(by((r) => r.form === k), A)])),
    doctype: Object.fromEntries(DOCTYPES.map((k) => [k, group(by((r) => r.doctype === k), A)])),
    w2Reason: Object.fromEntries(W2_REASONS.map((k) => [k, group(by((r) => r.w2Reason === k), A)])),
    w1Reason: Object.fromEntries(W1_REASONS.map((k) => [k, group(by((r) => r.reason === k), A)])),
    source: Object.fromEntries(sources.map((k) => [k, group(by((r) => r.source === k), A)])),
  };
  const ids = (f) => by(f).map((r) => r.id);
  const lists = {
    t12Lost: ids((r) => r.t12 === "lost"), t12Recovered: ids((r) => r.t12 === "recovered"), jEvent: ids((r) => r.jEvent), jOpportunity: ids((r) => r.jOpportunity),
    fullPageToPartial: ids((r) => r.fullPageToPartial === true), cut: ids((r) => r.w2Reason === "cut"), widened: ids((r) => r.reason === "widened"),
    t01Recovered: ids((r) => r.t01 === "recovered"), t01Lost: ids((r) => r.t01 === "lost"), errors: ids((r) => r.stage === "error"), unmatched: ids((r) => r.stage === "unmatched"),
  };
  const sourceTable = sources.map((s) => {
    const rs = by((r) => r.source === s);
    const cells = Object.fromEntries(LAYOUTS.map((k) => {
      const r = rs.find((x) => `${x.vert}-${x.space}` === k);
      if (!r) return [k, null];
      return [k, {
        id: r.id, stage: r.stage, w1Reason: r.reason, w2Reason: r.w2Reason, w1Strict: r.w1.strict, w2Strict: r.w2.strict, t12: r.t12,
        w1Full: r.others ? r.others.w1.full : null, w2Full: r.others ? r.others.w2.full : null,
        fromW1FullPartial: r.others ? r.others.fromW1Full.partial : null, fromW1FullNone: r.others ? r.others.fromW1Full.none : null,
        cutPp: r.cutPixels === null ? null : r4((r.cutPixels * 100) / A),
      }];
    }));
    return { source: s, doctype: rs[0].doctype, form: rs[0].form, content: rs[0].content, slot: rs[0].slot, cells };
  });
  return { stages, groups, lists, sourceTable };
}

// ------------------------------------------------------------------ public tables (RECOUNT_SPEC 8)
const fmt = (v) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "S" : "F") : String(v));
const line = (cells) => `| ${cells.map(fmt).join(" | ")} |`;
const sep = (n) => `|${"---|".repeat(n)}`;
export const GROUP_ROWS = [
  ["전체", (g) => g.total], ["W1 widened", (g) => g.w1Widened], ["세로 제한(cut)", (g) => g.cut],
  ...LAYOUTS.map((k) => [`layout ${k}`, (g) => g.layout[k]]),
  ...VERTS.map((k) => [`vert ${k}`, (g) => g.vert[k]]), ...SPACES.map((k) => [`space ${k}`, (g) => g.space[k]]),
  ...FORMS.map((k) => [`form ${k}`, (g) => g.form[k]]), ...DOCTYPES.map((k) => [`doctype ${k}`, (g) => g.doctype[k]]),
  ...W2_REASONS.map((k) => [`W2 ${k}`, (g) => g.w2Reason[k]]),
  ...W1_REASONS.map((k) => [k === "widened" ? "W1 widened 사유" : `W1 ${k}`, (g) => g.w1Reason[k]]),
];

function sourceCell(c) {
  if (!c) return null;
  if (c.stage === "error") return "error";
  if (c.stage === "unmatched") return "unmatched";
  let s = `${c.w1Strict ? "S" : "F"}→${c.w2Strict ? "S" : "F"} ${c.w2Reason === "inherit" ? `inherit:${c.w1Reason}` : c.w2Reason} ${c.w1Full}→${c.w2Full}`;
  if (c.fromW1FullNone > 0) s += ` none${c.fromW1FullNone}`;
  if (c.fromW1FullPartial > 0) s += ` part${c.fromW1FullPartial}`;
  return s;
}

/** The public tables as lists of markdown lines, keyed by table name. */
export function renderTables(summary) {
  const g = summary.groups, st = summary.stages;
  const H = (cells) => [line(cells), sep(cells.length)];
  const stages = [...H(["항목", "쪽수"]), ...[
    ["등록 쪽", st.pages], ["기술 오류", st.error], ["정상 처리(미매치 포함)", st.normal], ["정상 미매치", st.unmatched], ["K0 매치", st.k0Matched], ["한글 매치", st.hangulMatched],
    ["W1 widened", st.w1Reason.widened], ["W1 not_wider", st.w1Reason.notWider], ["W1 no_candidate", st.w1Reason.noCandidate], ["W1 k0_branch", st.w1Reason.k0Branch],
    ["W2 cut", st.w2Reason.cut], ["W2 no_cut", st.w2Reason.noCut], ["W2 hit_outside_w1", st.w2Reason.hitOutside], ["W2 inherit", st.w2Reason.inherit],
  ].map(line)];
  const groups = [...H(["그룹", "n", "오류", "미매치", "매치", "W0 엄격", "W1 엄격", "W2 엄격", "W1 widened", "세로 제한", "L 손실/W1 성공", "L 원본", "J/기회", "J 원본", "기회 원본", "전체→부분(회복)"]),
    ...GROUP_ROWS.map(([name, f]) => { const b = f(g); return line([name, b.n, b.error, b.unmatched, b.matched, b.strict.w0, b.strict.w1, b.strict.w2, b.widened, b.cut, `${b.L.count}/${b.L.denom}`, b.L.sources, `${b.J.count}/${b.J.opportunity}`, b.J.sources, b.J.opportunitySources, `${b.fullPageToPartial.count} (${b.fullPageToPartial.recovered})`]); })];
  const others = [...H(["그룹", "W1 완전 값(쪽)", "W2 완전 값(쪽)", "W1 완전→W2 완전/일부/전혀", "감소 쪽", "감소∧둘 다 엄격", "완전→일부만", "완전→전혀≥1", "둘 다", "W2 새 완전"]),
    ...GROUP_ROWS.map(([name, f]) => { const o = f(g).others; return line([name, `${o.itemsW1Full} (${o.pagesW1Full})`, `${o.itemsW2Full} (${o.pagesW2Full})`, `${o.fromW1Full.full}/${o.fromW1Full.partial}/${o.fromW1Full.none}`, o.pagesReduced, o.pagesReducedBothStrict, o.pagesFullToPartialOnly, o.pagesFullToNone, o.pagesFullToPartialAndNone, o.newlyFullW2]); })];
  const area = [...H(["그룹", "유효 쌍", "절감 픽셀 합", "평균 %p", "중앙 %p", "최대 %p", "자른 쪽", "자른 쪽 픽셀 합", "자른 쪽 평균 %p", "자른 쪽 중앙 %p", "자른 쪽 최대 %p"]),
    ...GROUP_ROWS.map(([name, f]) => { const a = f(g).area; return line([name, a.validPairs, a.cutPixelsSum, a.meanPp, a.medianPp, a.maxPp, a.cutPages, a.cutPixelsSumCut, a.cutMeanPp, a.cutMedianPp, a.cutMaxPp]); })];
  const verdict = [...H(["그룹", "손실 판정", "제거 판정"]),
    ...[["전체", g.total], ...LAYOUTS.map((k) => [`layout ${k}`, g.layout[k]])].map(([name, b]) => line([name, b.verdict.loss, b.verdict.removal]))];
  const sources = [...H(["원본", "양식", "목표 슬롯", ...LAYOUTS]),
    ...summary.sourceTable.map((s) => line([s.source, s.form, s.slot, ...LAYOUTS.map((k) => sourceCell(s.cells[k]))]))];
  return { stages, groups, others, area, verdict, sources };
}

const BLOCK = /<!-- krh:table (\S+) -->\n([\s\S]*?)\n<!-- \/krh:table -->/g;
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
    const n = Math.max(lines.length, have.length);
    for (let i = 0; i < n; i++) {
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
