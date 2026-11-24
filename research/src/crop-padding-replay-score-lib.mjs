// Crop padding replay: scoring rules (protocol sections 10-12). Pure functions; the scorer reads the files.
export const JUDGEMENTS = ["complete", "incomplete", "not_evaluable"];
const EVIDENT = ["crop_jpeg", "original_verified"];
const isInt = Number.isInteger;
const contains = (r, g) => g[0] >= r[0] && g[1] >= r[1] && g[2] <= r[2] && g[3] <= r[3];
const legalRect = (r, page) => Array.isArray(r) && r.length === 4 && r.every(isInt) && r[0] >= 0 && r[1] >= 0 && r[2] > r[0] && r[3] > r[1] && r[2] <= page.width && r[3] <= page.height;

/** Every id has a page and a non-empty list of legal half-open evidence boxes. Throws "gold input error: ..." otherwise. */
export function validateGold(gold, ids) {
  for (const id of ids) {
    const g = gold?.[id];
    if (!g || !g.page || !isInt(g.page.width) || !isInt(g.page.height)) throw new Error(`gold input error: ${id} missing`);
    if (!Array.isArray(g.parts) || g.parts.length === 0) throw new Error(`gold input error: ${id} has no evidence parts`);
    for (const part of g.parts) if (!legalRect(part?.rect, g.page)) throw new Error(`gold input error: ${id} ${part?.item} rect ${JSON.stringify(part?.rect)}`);
  }
}

/** complete | incomplete | not_evaluable with the missing evidence items. */
export function judgeRow(row, parts, page) {
  const region = row.returned?.region;
  if (row.outcome !== "ok" || !EVIDENT.includes(row.returned?.kind) || !legalRect(region, page)) return { judgement: "not_evaluable", missing: null, missingItems: [] };
  const missingItems = parts.filter((g) => !contains(region, g.rect)).map((g) => g.item);
  return { judgement: missingItems.length ? "incomplete" : "complete", missing: missingItems.length, missingItems };
}

/** Delivered area over page area with integer numerator and denominator; null for rows without a valid return. */
export function areaOf(row, page) {
  const r = row.returned?.region;
  if (row.outcome !== "ok" || !EVIDENT.includes(row.returned?.kind) || !legalRect(r, page)) return null;
  const num = (r[2] - r[0]) * (r[3] - r[1]);
  const den = page.width * page.height;
  return { num, den, ratio: num / den };
}

/** Sensitivity only: a limit_exceeded row gets its requested area; every other failure stays missing. */
export function assumedAreaOf(row, page) {
  const a = areaOf(row, page);
  if (a) return a;
  if (row.failCode !== "limit_exceeded") return null;
  const q = row.requestRect;
  const num = (q[2] - q[0]) * (q[3] - q[1]);
  const den = page.width * page.height;
  return { num, den, ratio: num / den };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

function areaStats(rows, field) {
  const vals = rows.map((r) => r[field]).filter(Boolean);
  return { valid: vals.length, missing: rows.length - vals.length, sumNum: vals.reduce((s, a) => s + a.num, 0), mean: mean(vals.map((a) => a.ratio)) };
}

function paired(rows, base, field) {
  const diffs = [];
  let missingPairs = 0;
  for (const r of rows) {
    const b = base.get(r.id);
    if (r[field] && b?.[field]) diffs.push(r[field].ratio - b[field].ratio); else missingPairs++;
  }
  const m = mean(diffs);
  return { validPairs: diffs.length, missingPairs, meanPp: m === null ? null : m * 100 };
}

/**
 * Rows carry p, id, intent, lang, anchor, pairId, outcome, failCode, returned, requestFull, judgement, area, assumedArea.
 * Per p: denominators, judgements by intent, returned kinds, failures, area means, paired change and judgement change vs p0.
 */
export function aggregate(rows, paddings) {
  const base = new Map(rows.filter((r) => r.p === paddings[0]).map((r) => [r.id, r]));
  const byP = {};
  for (const p of paddings) {
    const rs = rows.filter((r) => r.p === p);
    const matched = rs.filter((r) => r.intent === "matched");
    const intentBlock = (sub) => ({ n: sub.length, judgement: { ...zero(JUDGEMENTS), ...count(sub, (r) => r.judgement) }, returned: { ...zero(["crop_jpeg", "original_verified", "original_unverified", "none"]), ...count(sub, (r) => r.returned.kind) } });
    const change = { recovered: 0, worsened: 0, keptComplete: 0, keptIncomplete: 0, notEvaluablePairs: 0 };
    for (const r of rs) {
      const b = base.get(r.id);
      const a0 = b?.judgement;
      if (!b || a0 === "not_evaluable" || r.judgement === "not_evaluable") change.notEvaluablePairs++;
      else if (a0 === "incomplete" && r.judgement === "complete") change.recovered++;
      else if (a0 === "complete" && r.judgement === "incomplete") change.worsened++;
      else if (r.judgement === "complete") change.keptComplete++;
      else change.keptIncomplete++;
    }
    const byLangAnchor = {};
    const pairs = {};
    for (const r of rs) {
      const la = (byLangAnchor[`${r.lang}|${r.anchor}`] ||= { n: 0, ...zero(JUDGEMENTS) });
      la.n++;
      la[r.judgement]++;
      (pairs[r.pairId] ||= {})[r.lang] = r.judgement === "complete";
    }
    const pairTally = { both: 0, enOnly: 0, koOnly: 0, neither: 0 };
    for (const v of Object.values(pairs)) pairTally[v.en && v.ko ? "both" : v.en ? "enOnly" : v.ko ? "koOnly" : "neither"]++;
    const all = intentBlock(rs);
    byP[String(p)] = {
      n: rs.length,
      outcomes: { ok: rs.filter((r) => r.outcome === "ok").length, failed: rs.filter((r) => r.outcome !== "ok").length },
      failCodes: sortObj(count(rs.filter((r) => r.outcome !== "ok"), (r) => r.failCode)),
      limitExceeded: rs.filter((r) => r.failCode === "limit_exceeded").length,
      judgement: all.judgement,
      returned: all.returned,
      matchedFullPage: matched.filter((r) => r.requestFull).length,
      byIntent: { matched: intentBlock(matched), unmatched: intentBlock(rs.filter((r) => r.intent === "unmatched")) },
      area: { all: areaStats(rs, "area"), matched: areaStats(matched, "area") },
      assumedArea: { all: areaStats(rs, "assumedArea"), matched: areaStats(matched, "assumedArea") },
      pairedVsP0: { all: paired(rs, base, "area"), matched: paired(matched, base, "area") },
      changeVsP0: change,
      missingItemsTotal: rs.reduce((s, r) => s + (r.missing ?? 0), 0),
      byLangAnchor: sortObj(byLangAnchor),
      pairs: pairTally,
    };
  }
  return { byP };
}

function count(rows, f) {
  const o = {};
  for (const r of rows) o[f(r)] = (o[f(r)] || 0) + 1;
  return o;
}

/**
 * p = 0 replay of #141 (protocol section 12). newRows: p0 rows with judgement; oldRows: #141 raw rows for
 * rgb|tolerant|region; oldJudge: key -> #141 geometry; rgbDims: id -> RGB manifest dimensions.
 */
export function compare141(newRows, oldRows, oldJudge, rgbDims) {
  const old = new Map(oldRows.map((r) => [r.key.split("|")[3], r]));
  const mismatches = [];
  const map = { complete: "complete", partial: "incomplete" };
  for (const n of newRows) {
    const o = old.get(n.id);
    const miss = (field, was, now) => mismatches.push({ id: n.id, field, was, now });
    if (!o) { miss("row", null, "present"); continue; }
    const W = n.page.width;
    const H = n.page.height;
    const dimsOk = o.index?.width === W && o.index?.height === H && rgbDims[n.id]?.width === W && rgbDims[n.id]?.height === H && n.index?.width === W && n.index?.height === H;
    if (!dimsOk) miss("dims", { rgbIndex: [o.index?.width, o.index?.height], rgbManifest: [rgbDims[n.id]?.width, rgbDims[n.id]?.height] }, { grayIndex: [n.index?.width, n.index?.height], page: [W, H] });
    const q = o.crop?.requested;
    if (JSON.stringify(q && [q.x, q.y, q.width, q.height]) !== JSON.stringify([n.request.x, n.request.y, n.request.width, n.request.height])) miss("requested", q, n.request);
    if (o.returned?.kind !== n.returned.kind) miss("kind", o.returned?.kind, n.returned.kind);
    if (JSON.stringify(o.returned?.region) !== JSON.stringify(n.returned.region)) miss("region", o.returned?.region, n.returned.region);
    if ((map[oldJudge[o.key]] ?? oldJudge[o.key]) !== n.judgement) miss("judgement", oldJudge[o.key], n.judgement);
    if (n.intent === "unmatched" && (JSON.stringify(n.returned.region) !== JSON.stringify([0, 0, W, H]) || n.request.x !== 0 || n.request.y !== 0 || n.request.width !== W || n.request.height !== H)) miss("unmatched_full", null, n.returned.region);
  }
  if (old.size !== newRows.length) mismatches.push({ id: null, field: "count", was: old.size, now: newRows.length });
  return { pass: mismatches.length === 0, rows: newRows.length, mismatches };
}
