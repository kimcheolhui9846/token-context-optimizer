// Fresh crop padding (FCP): judgement, area and aggregation rules (protocol sections 8-9). Pure functions.
export const STATES = [1, 0, "NE"];
const VALID_KINDS = ["crop_jpeg", "original_verified"];
const isInt = Number.isInteger;
const contains = (r, g) => r[0] <= g[0] && r[1] <= g[1] && r[2] >= g[2] && r[3] >= g[3];
const legalRect = (r, page) => Array.isArray(r) && r.length === 4 && r.every(isInt) && r[0] >= 0 && r[1] >= 0 && r[2] > r[0] && r[3] > r[1] && r[2] <= page.width && r[3] <= page.height;

/** num / den, or null (N/A) when den is 0. */
export const rate = (num, den) => (den ? num / den : null);

/** Every id has a page and a non-empty list of legal half-open evidence boxes. Throws "gold input error: ..." otherwise. */
export function validateGold(gold, ids) {
  for (const id of ids) {
    const g = gold?.[id];
    if (!g || !g.page || !isInt(g.page.width) || !isInt(g.page.height)) throw new Error(`gold input error: ${id} missing`);
    if (!Array.isArray(g.parts) || g.parts.length === 0) throw new Error(`gold input error: ${id} has no evidence parts`);
    for (const part of g.parts) if (!legalRect(part?.rect, g.page)) throw new Error(`gold input error: ${id} ${part?.item} rect ${JSON.stringify(part?.rect)}`);
  }
}

const validReturn = (row, page) => row.outcome === "ok" && VALID_KINDS.includes(row.returned?.kind) && legalRect(row.returned?.region, page);

/**
 * state 1: valid crop_jpeg strictly smaller than the page holding every part; state 0: valid return missing a part, or a
 * valid whole-page return; "NE": failure or no valid return. preserved: every part inside a valid return (null for NE).
 */
export function judgeRow(row, parts, page) {
  if (!validReturn(row, page)) return { state: "NE", small: null, preserved: null, missingItems: null };
  const r = row.returned.region;
  const small = row.returned.kind === "crop_jpeg" && (r[2] - r[0]) * (r[3] - r[1]) < page.width * page.height;
  const missingItems = parts.filter((g) => !contains(r, g.rect)).map((g) => g.item);
  const preserved = missingItems.length === 0;
  return { state: small && preserved ? 1 : 0, small, preserved, missingItems };
}

/** Delivered area over page area with integer numerator and denominator; null without a valid return. */
export function areaOf(row, page) {
  if (!validReturn(row, page)) return null;
  const r = row.returned.region;
  const num = (r[2] - r[0]) * (r[3] - r[1]);
  const den = page.width * page.height;
  return { num, den, ratio: num / den };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const stateCounts = (rows) => ({ 1: rows.filter((r) => r.state === 1).length, 0: rows.filter((r) => r.state === 0).length, NE: rows.filter((r) => r.state === "NE").length });
const successBlock = (rows) => { const s = stateCounts(rows); return { success: s[1], denominator: rows.length, rate: rate(s[1], rows.length), states: s }; };
function preservedBlock(rows) {
  const yes = rows.filter((r) => r.preserved === true).length;
  return { yes, no: rows.filter((r) => r.preserved === false).length, NE: rows.filter((r) => r.preserved === null).length, denominator: rows.length, rate: rate(yes, rows.length) };
}
function areaStats(rows) {
  const vals = rows.map((r) => r.area).filter(Boolean);
  return { valid: vals.length, missing: rows.length - vals.length, sumNum: vals.reduce((s, a) => s + a.num, 0), mean: mean(vals.map((a) => a.ratio)) };
}
function strata(rows, keyOf) {
  const o = {};
  for (const r of rows) {
    const s = (o[keyOf(r)] ||= { n: 0, matched: 0, s1: 0, s0: 0, NE: 0, preserved: 0 });
    s.n++;
    if (r.intent === "matched") s.matched++;
    if (r.state === 1) s.s1++; else if (r.state === 0) s.s0++; else s.NE++;
    if (r.preserved === true) s.preserved++;
  }
  return sortObj(o);
}

/**
 * Scored rows carry p, id, pairId, lang, anchor, doctype, layout, intent (matched | unmatched | caller_error), requestFull,
 * outcome, failStage, failCode, returned.kind, state, preserved, area. The matched denominator is the run's single
 * pre-measurement assignment (intent === "matched"), the same for every padding.
 */
export function aggregate(rows, paddings) {
  const byP = {};
  for (const p of paddings) {
    const rs = rows.filter((r) => r.p === p);
    const matched = rs.filter((r) => r.intent === "matched");
    const pairs = {};
    for (const r of rs) (pairs[r.pairId] ||= {})[r.lang] = r;
    const pairTally = { both: 0, enOnly: 0, koOnly: 0, neither: 0, withNE: 0, n: 0 };
    for (const v of Object.values(pairs)) {
      pairTally.n++;
      const en = v.en?.state === 1;
      const ko = v.ko?.state === 1;
      pairTally[en && ko ? "both" : en ? "enOnly" : ko ? "koOnly" : "neither"]++;
      if (v.en?.state === "NE" || v.ko?.state === "NE") pairTally.withNE++;
    }
    const failures = {};
    for (const r of rs.filter((x) => x.outcome !== "ok")) failures[`${r.failStage}|${r.failCode}`] = (failures[`${r.failStage}|${r.failCode}`] || 0) + 1;
    byP[String(p)] = {
      n: rs.length,
      matchedDenominator: matched.length,
      unmatched: rs.filter((r) => r.intent === "unmatched").length,
      callerErrors: rs.filter((r) => r.intent === "caller_error").length,
      primary: successBlock(matched),
      all: successBlock(rs),
      preserved: { all: preservedBlock(rs), matched: preservedBlock(matched) },
      area: { all: areaStats(rs), matched: areaStats(matched) },
      returned: { crop_jpeg: 0, original_verified: 0, none: 0, ...countBy(rs, (r) => r.returned.kind) },
      matchedFull: matched.filter((r) => r.requestFull === true).length,
      unmatchedOriginal: rs.filter((r) => r.intent === "unmatched" && r.returned.kind === "original_verified").length,
      limitExceeded: rs.filter((r) => r.failCode === "limit_exceeded").length,
      failures: sortObj(failures),
      strata: { langAnchor: strata(rs, (r) => `${r.lang}|${r.anchor}`), doctype: strata(rs, (r) => r.doctype), layout: strata(rs, (r) => r.layout) },
      pairs: pairTally,
    };
  }
  const out = { byP };
  if (paddings.length === 2) {
    const [a, b] = paddings;
    const at = (p) => new Map(rows.filter((r) => r.p === p).map((r) => [r.id, r]));
    const A = at(a);
    const B = at(b);
    const change = (ids) => {
      const c = { improved: 0, worsened: 0, kept1: 0, kept0: 0, notEvaluable: 0, n: 0 };
      for (const id of ids) {
        c.n++;
        const s0 = A.get(id)?.state;
        const s1 = B.get(id)?.state;
        if (s0 === undefined || s1 === undefined || s0 === "NE" || s1 === "NE") c.notEvaluable++;
        else if (s0 === 0 && s1 === 1) c.improved++;
        else if (s0 === 1 && s1 === 0) c.worsened++;
        else if (s0 === 1) c.kept1++;
        else c.kept0++;
      }
      return c;
    };
    const areaChange = (ids) => {
      const diffs = [];
      let missingPairs = 0;
      for (const id of ids) {
        const x = A.get(id)?.area;
        const y = B.get(id)?.area;
        if (x && y) diffs.push(y.ratio - x.ratio); else missingPairs++;
      }
      const m = mean(diffs);
      return { validPairs: diffs.length, missingPairs, meanPp: m === null ? null : m * 100 };
    };
    const ids = [...A.keys()];
    const matchedIds = ids.filter((id) => A.get(id).intent === "matched");
    out.change = { from: a, to: b, matched: change(matchedIds), all: change(ids), areaMatched: areaChange(matchedIds), areaAll: areaChange(ids) };
  }
  return out;
}

function countBy(rows, f) {
  const o = {};
  for (const r of rows) o[f(r)] = (o[f(r)] || 0) + 1;
  return o;
}
