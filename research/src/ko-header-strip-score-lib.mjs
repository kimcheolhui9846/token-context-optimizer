// ko-header-strip: scoring after the W5 build is frozen (protocol section 6, 7; RECOUNT_SPEC sections 5, 6).
// Exposure counts only original source rows; separator rows are never evidence.

// ---- exact fractions ----
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
export function frac(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new RangeError("zero denominator");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const fadd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const ppOf = (pixels, pageArea) => frac(100n * BigInt(pixels), BigInt(pageArea));
export const fracStr = (f) => (f.d === 1n ? f.n.toString() : `${f.n}/${f.d}`);
const parseFrac = (s) => { const [a, b = "1"] = String(s).split("/"); return frac(BigInt(a), BigInt(b)); };
/** Arithmetic mean of exact values (strings "a" or "a/b", or {n, d}) as {num, den}. */
export function meanFrac(values) {
  if (values.length === 0) return null;
  let s = frac(0n);
  for (const v of values) s = fadd(s, typeof v === "object" ? v : parseFrac(v));
  const m = frac(s.n, s.d * BigInt(values.length));
  return { num: m.n.toString(), den: m.d.toString() };
}
/** Public-table rounding: floor(x*100 + 1/2)/100 on |x|, sign kept, two decimals. */
export function ppText(f) {
  if (f === null) return "—";
  const x = frac(BigInt(f.num), BigInt(f.den));
  const neg = x.n < 0n, a = neg ? -x.n : x.n;
  const c = (200n * a + x.d) / (2n * x.d); // floor(100*a/d + 1/2)
  const s = `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

// ---- intervals and exposure ----
/** Source pieces of a plan (or a window) -> {L, R, intervals} with touching/overlapping y intervals merged. */
export function sourceUnion(pl) {
  const src = pl.pieces.filter((p) => p.kind === "source");
  if (src.length === 0) return null;
  const L = src[0].sourceRect[0], R = src[0].sourceRect[2];
  if (src.some((p) => p.sourceRect[0] !== L || p.sourceRect[2] !== R)) throw new Error("source pieces differ in x range");
  const iv = src.map((p) => [p.sourceRect[1], p.sourceRect[3]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [a, b] of iv) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  return { L, R, intervals: merged };
}
export const windowPlan = (w) => (w ? { pieces: [{ kind: "source", sourceRect: [w.left, w.top, w.left + w.width, w.top + w.height] }] } : { pieces: [] });

/** full / partial / none / source_missing of an ink box against a plan's source union. */
export function exposure(ink, pl) {
  if (ink === null || ink === undefined) return "source_missing";
  const u = sourceUnion(pl);
  if (!u) return null;
  const [x0, y0, x1, y1] = ink;
  const inX = u.L <= x0 && x1 <= u.R;
  if (inX && u.intervals.some(([a, c]) => a <= y0 && y1 <= c)) return "full";
  const ox = Math.min(x1, u.R) - Math.max(x0, u.L);
  if (ox > 0 && u.intervals.some(([a, c]) => Math.min(y1, c) - Math.max(y0, a) > 0)) return "partial";
  return "none";
}

/** Source-unique, separator and display pixel counts of a plan. */
export function areaOf(pl) {
  const u = sourceUnion(pl);
  const source = u ? (u.R - u.L) * u.intervals.reduce((s, [a, c]) => s + (c - a), 0) : 0;
  const separator = pl.pieces.filter((p) => p.kind === "separator").reduce((s, p) => s + (p.displayRect[2] - p.displayRect[0]) * (p.displayRect[3] - p.displayRect[1]), 0);
  const display = pl.display ? pl.display.width * pl.display.height : 0;
  return { source, separator, display };
}

/** Output rectangle of an ink box that lies fully inside one source piece, else null. */
export function placement(ink, pl) {
  if (!ink) return null;
  for (const p of pl.pieces) {
    if (p.kind !== "source") continue;
    const [sx0, sy0, sx1, sy1] = p.sourceRect, [dx0, dy0] = p.displayRect;
    if (sx0 <= ink[0] && ink[2] <= sx1 && sy0 <= ink[1] && ink[3] <= sy1) return [ink[0] - sx0 + dx0, ink[1] - sy0 + dy0, ink[2] - sx0 + dx0, ink[3] - sy0 + dy0];
  }
  return null;
}
export function xAligned(row) {
  if (!row.B) return null;
  return row.pieces.filter((p) => p.kind === "source").every((p) => p.displayRect[0] === p.sourceRect[0] - row.B[0] && p.displayRect[2] - p.displayRect[0] === p.sourceRect[2] - p.sourceRect[0]);
}
function rowsOutside(pl, w1) {
  const u = sourceUnion(pl);
  if (!u || !w1) return 0;
  const lo = w1.top, hi = w1.top + w1.height;
  return u.intervals.reduce((s, [a, c]) => s + Math.max(0, Math.min(c, lo) - a) + Math.max(0, c - Math.max(a, hi)), 0);
}

// ---- one page ----
const ITEMS = ["anchor", "targetValue", "targetHeader", "compHeader", "compValue"];
const trans = (a, b) => (a && b ? "keptSuccess" : !a && b ? "recovered" : a && !b ? "lost" : "bothFail");

/**
 * Score one page. `c` = coords row, `d` = design image row, `ink` = render items of the page,
 * `pred` = #153 prediction row (w2Reason), `ref` = #153 score row (W1/W4 reference and attribution).
 */
export function scorePage(c, d, ink, pred, ref, fixedIds) {
  const pageArea = c.page.width * c.page.height;
  const inkOf = (item) => (item ? ink[item].ink : null);
  const boxes = {
    anchor: inkOf(d.anchorItem), targetValue: inkOf(d.valueItem), targetHeader: inkOf(d.targetHeaderItem),
    compHeader: inkOf(d.compHeaderItem), compValue: inkOf(d.compValueItem),
  };
  const plans = { w1: windowPlan(c.w1), w4: windowPlan(c.w4), w5: c.display ? c : { pieces: [] } };
  const shown = { w1: !!c.w1, w4: !!c.w4, w5: !!c.display };
  const exp = {}, strict = {}, area = { page: pageArea };
  for (const k of ["w1", "w4", "w5"]) {
    exp[k] = shown[k] ? Object.fromEntries(ITEMS.map((it) => [it, exposure(boxes[it], plans[k])])) : null;
    const a = shown[k] ? areaOf(plans[k]).source : 0;
    strict[k] = shown[k] && a > 0 && a < pageArea && exp[k].anchor === "full" && exp[k].targetValue === "full";
  }
  area.w1 = shown.w1 ? c.w1.width * c.w1.height : 0;
  area.w4 = shown.w4 ? c.w4.width * c.w4.height : 0;
  const a5 = shown.w5 ? areaOf(c) : { source: 0, separator: 0, display: 0 };
  area.w5Source = a5.source; area.w5Separator = a5.separator; area.w5Display = a5.display;
  const others = d.otherValueItems.map((item) => ({ item, w1: exposure(inkOf(item), plans.w1), w4: exposure(inkOf(item), plans.w4), w5: shown.w5 ? exposure(inkOf(item), plans.w5) : null }));
  const reexposed = others.filter((o) => o.w1 === "full" && o.w4 === "none" && (o.w5 === "partial" || o.w5 === "full")).length;
  const opportunity = shown.w1 && strict.w1 && pred.w2Reason === "cut" && others.some((o) => o.w1 === "full");
  const event = (k) => opportunity && strict[k] && others.some((o) => o.w1 === "full" && o[k] === "none");
  const e1 = (k) => exp[k].targetHeader === "none" && exp[k].compValue === "full";
  const e2 = (k) => ["partial", "none"].includes(exp[k].targetHeader) && ["partial", "full"].includes(exp[k].compValue);
  const reading = d.header === "normal" && shown.w1 && shown.w4 && shown.w5
    ? { e1: { w1: e1("w1"), w4: e1("w4"), w5: e1("w5") }, e2: { w1: e2("w1"), w4: e2("w4"), w5: e2("w5") } } : null;
  const applied = c.w4 && pred.w4Reason === "applied";
  const attribution = ref.attribution ? ref.attribution.outcome : null;
  const xa = applied ? xAligned(c) : null;
  const fourItems = applied ? ["targetHeader", "compHeader", "targetValue", "compValue"].every((it) => exp.w5[it] === "full") && xa === true && attribution === "correct" : null;
  const place = applied ? Object.fromEntries(["targetHeader", "compHeader", "targetValue", "compValue"].map((it) => [it, placement(boxes[it], c)])) : null;
  return {
    id: c.id, key: d.key, source: d.source, side: d.side, header: d.header, ans: d.ans, cell: d.cellName, fixed22: fixedIds.has(c.id),
    w4Reason: pred.w4Reason, w5Reason: c.w5Reason, w5Kind: c.w5Kind, strict, area, sourceOutsideW1Rows: shown.w5 ? rowsOutside(c, c.w1) : 0,
    t15: trans(strict.w1, strict.w5), t45: trans(strict.w4, strict.w5), exposure: exp, others: { items: others, reexposed },
    opportunity, event4: event("w4"), event5: event("w5"), reading, attribution, xAligned: xa, fourItems, placement: place,
  };
}

/** The #153 reference values that the generalised scorer must reproduce for W1 and W4. */
export function referenceDiff(row, ref) {
  const bad = [];
  for (const k of ["w1", "w4"]) {
    if (ref[k].strict !== row.strict[k]) bad.push(`${k}.strict`);
    if (ref[k].area !== row.area[k]) bad.push(`${k}.area`);
    for (const it of ["targetHeader", "compHeader", "compValue", "targetValue"]) if (ref.exposure[k][it] !== row.exposure[k][it]) bad.push(`${k}.${it}`);
  }
  ref.others.items.forEach((o, i) => {
    const r = row.others.items[i];
    if (!r || r.item !== o.item || r.w1 !== o.w1 || r.w4 !== o.w4) bad.push(`others.${o.item}`);
  });
  if (ref.opportunity !== row.opportunity) bad.push("opportunity");
  if (ref.event4 !== row.event4) bad.push("event4");
  if (ref.reading && (ref.reading.e1.w1 !== row.reading.e1.w1 || ref.reading.e1.w4 !== row.reading.e1.w4 || ref.reading.e2.w1 !== row.reading.e2.w1 || ref.reading.e2.w4 !== row.reading.e2.w4)) bad.push("reading");
  return bad;
}

// ---- summary ----
export const REASONS = ["upstream_error", "upstream_unmatched", "w4_not_applied", "header_outside_body_width", "header_below_body", "merged_contained", "merged", "two_bands"];
export const CELLS = ["L", "R"].flatMap((s) => ["normal", "blank", "dup"].flatMap((h) => ["same", "below"].map((a) => `${s}-${h}-${a}`)));
const srcCount = (rows) => new Set(rows.map((r) => r.source)).size;

export function groupBlock(rows) {
  const n = rows.length;
  const cnt = (f) => rows.filter(f).length;
  const shownRows = rows.filter((r) => r.w5Kind !== null);
  const lost = rows.filter((r) => r.t15 === "lost");
  const re = rows.filter((r) => r.others.reexposed > 0);
  const rd = rows.filter((r) => r.reading);
  const rc = (f) => rd.filter(f).length;
  const ap = rows.filter((r) => r.fourItems !== null);
  const mean = (f) => (n ? meanFrac(rows.map(f)) : null);
  const pa = (r) => r.area.page;
  return {
    n, shown: shownRows.length,
    strict: { w1: cnt((r) => r.strict.w1), w4: cnt((r) => r.strict.w4), w5: cnt((r) => r.strict.w5) },
    L5: { count: lost.length, denom: cnt((r) => r.strict.w1), sources: srcCount(lost) },
    t45: Object.fromEntries(["keptSuccess", "recovered", "lost", "bothFail"].map((k) => [k, cnt((r) => r.t45 === k)])),
    opportunity: cnt((r) => r.opportunity), J4: cnt((r) => r.event4), J5: cnt((r) => r.event5),
    J5Sources: srcCount(rows.filter((r) => r.event5)),
    J4kept: { count: cnt((r) => r.event4 && r.event5), of: cnt((r) => r.event4) },
    reexposed: { items: rows.reduce((s, r) => s + r.others.reexposed, 0), pages: re.length, sources: srcCount(re) },
    reading: {
      pages: rd.length,
      e1: { w1: rc((r) => r.reading.e1.w1), w4: rc((r) => r.reading.e1.w4), w5: rc((r) => r.reading.e1.w5) },
      e2: { w1: rc((r) => r.reading.e2.w1), w4: rc((r) => r.reading.e2.w4), w5: rc((r) => r.reading.e2.w5) },
      newE1W1: rc((r) => r.reading.e1.w5 && !r.reading.e1.w1), newE1W4: rc((r) => r.reading.e1.w5 && !r.reading.e1.w4),
      newE2W1: rc((r) => r.reading.e2.w5 && !r.reading.e2.w1), newE2W4: rc((r) => r.reading.e2.w5 && !r.reading.e2.w4),
      resolvedE1W4: rc((r) => r.reading.e1.w4 && !r.reading.e1.w5),
      newE1W1Sources: srcCount(rd.filter((r) => r.reading.e1.w5 && !r.reading.e1.w1)),
    },
    fourItems: { count: ap.filter((r) => r.fourItems).length, of: ap.length },
    area: {
      w4VsW1: mean((r) => ppOf(r.area.w1 - r.area.w4, pa(r))),
      w5SourceVsW1: mean((r) => ppOf(r.area.w1 - r.area.w5Source, pa(r))),
      w5DisplayVsW1: mean((r) => ppOf(r.area.w1 - r.area.w5Display, pa(r))),
      w5SourceVsW4: mean((r) => ppOf(r.area.w5Source - r.area.w4, pa(r))),
      displayGtW1: cnt((r) => r.area.w5Display > r.area.w1),
      sourceOutsideW1: cnt((r) => r.sourceOutsideW1Rows > 0),
    },
  };
}

export function summarize(rows, ctx) {
  const by = (f) => rows.filter(f);
  const fixed = new Set(ctx.fixed22);
  const groups = { total: groupBlock(rows), fixed22: groupBlock(by((r) => fixed.has(r.id))), other122: groupBlock(by((r) => !fixed.has(r.id))) };
  for (const k of REASONS) groups[`reason ${k}`] = groupBlock(by((r) => r.w5Reason === k));
  for (const s of ["L", "R"]) groups[`side ${s}`] = groupBlock(by((r) => r.side === s));
  for (const h of ["normal", "blank", "dup"]) groups[`header ${h}`] = groupBlock(by((r) => r.header === h));
  for (const a of ["same", "below"]) groups[`ans ${a}`] = groupBlock(by((r) => r.ans === a));
  for (const c of CELLS) groups[`cell ${c}`] = groupBlock(by((r) => r.cell === c));
  for (const s of ctx.sources) groups[`source ${s}`] = groupBlock(by((r) => r.source === s));
  const ids = (f) => rows.filter(f).map((r) => r.id);
  const lists = {
    fixed22Applied: ids((r) => r.w4Reason === "applied"), j4: ids((r) => r.event4), j5: ids((r) => r.event5),
    newE1W4: ids((r) => r.reading && r.reading.e1.w4 && !r.reading.e1.w1), e1W5: ids((r) => r.reading && r.reading.e1.w5),
    reexposedPages: ids((r) => r.others.reexposed > 0), w1KeptPixelMismatch: ctx.w1KeptPixelMismatch,
    fourItemsFail: ids((r) => r.fourItems === false),
  };
  const transitions = {};
  for (const r of rows) for (const o of r.others.items) { const k = `${o.w1}/${o.w4}/${o.w5}`; transitions[k] = (transitions[k] || 0) + 1; }
  const sortedTransitions = Object.fromEntries(Object.entries(transitions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const compValue = Object.fromEntries(["w1", "w4", "w5"].map((k) => [k, Object.fromEntries(["full", "partial", "none"].map((v) => [v, rows.filter((r) => r.exposure[k] && r.exposure[k].compValue === v).length]))]));
  const exposureTable = Object.fromEntries(["normal", "blank", "dup"].map((h) => [h, Object.fromEntries(["w1", "w4", "w5"].map((k) => [k,
    Object.fromEntries(["targetHeader", "compHeader", "compValue", "targetValue"].map((it) => [it, Object.fromEntries(["full", "partial", "none", "source_missing"].map((v) => [v,
      rows.filter((r) => r.header === h && r.exposure[k] && r.exposure[k][it] === v).length]))]))]))]));
  const pairs = [];
  for (const s of ctx.sources) for (const h of ["normal", "blank", "dup"]) for (const a of ["same", "below"]) {
    const L = rows.find((r) => r.source === s && r.header === h && r.ans === a && r.side === "L");
    const R = rows.find((r) => r.source === s && r.header === h && r.ans === a && r.side === "R");
    const f = (r) => ({ w5Reason: r.w5Reason, strict: r.strict.w5, e1: r.reading ? r.reading.e1.w5 : null, fourItems: r.fourItems });
    const fl = f(L), fr = f(R);
    const fields = Object.keys(fl).filter((k) => fl[k] !== fr[k]);
    if (fields.length) pairs.push({ source: s, header: h, ans: a, L: L.id, R: R.id, fields });
  }
  const T = groups.total, F = groups.fixed22, N = groups["header normal"];
  const notApplied = rows.filter((r) => r.w4Reason !== "applied");
  const C1 = { L5: T.L5.count, w1KeptMatch: notApplied.length - ctx.w1KeptPixelMismatch.length, of: notApplied.length };
  C1.pass = C1.of > 0 && C1.L5 === 0 && C1.w1KeptMatch === C1.of;
  const C2 = { fixedE1W5: F.reading.e1.w5, fourItems: F.fourItems.count, of: F.n, newE1W1: N.reading.newE1W1, newE2W1: N.reading.newE2W1, normalPages: N.reading.pages };
  C2.pass = C2.of > 0 && C2.normalPages > 0 && C2.fixedE1W5 === 0 && C2.fourItems === C2.of && C2.newE1W1 === 0 && C2.newE2W1 === 0;
  const C3 = { J4: T.J4, J4kept: T.J4kept.count, reexposedItems: T.reexposed.items };
  C3.pass = C3.J4 > 0 && C3.J4kept === C3.J4 && C3.reexposedItems === 0;
  const C4 = { checks: ctx.checks };
  C4.pass = Object.values(ctx.checks).every((v) => v === true);
  const failed = [["C1", C1], ["C2", C2], ["C3", C3], ["C4", C4]].filter(([, c]) => !c.pass).map(([k]) => k);
  const notEval = C1.of === 0 || C2.of === 0 || C2.normalPages === 0 || C3.J4 === 0;
  const reasonRows = ["total", "fixed22", "other122", "header normal", "header blank", "header dup"].map((group) => {
    const sel = group === "total" ? rows : group === "fixed22" ? by((r) => fixed.has(r.id)) : group === "other122" ? by((r) => !fixed.has(r.id)) : by((r) => r.header === group.slice(7));
    return { group, counts: Object.fromEntries(REASONS.map((x) => [x, sel.filter((r) => r.w5Reason === x).length])) };
  });
  const fixedRows = rows.filter((r) => fixed.has(r.id)).map((r) => ({
    id: r.id, key: r.key, w5Reason: r.w5Reason,
    targetHeader: r.exposure.w5 ? r.exposure.w5.targetHeader : null, compHeader: r.exposure.w5 ? r.exposure.w5.compHeader : null,
    targetValue: r.exposure.w5 ? r.exposure.w5.targetValue : null, compValue: r.exposure.w5 ? r.exposure.w5.compValue : null,
    place: r.placement ? r.placement.targetHeader : null, fourItems: r.fourItems === true,
    e1w4: !!(r.reading && r.reading.e1.w4), e1w5: !!(r.reading && r.reading.e1.w5),
  }));
  return {
    version: "ko-header-strip-summary-1", buildCommit: ctx.buildCommit, coordsSha256: ctx.coordsSha256, scoreStartedUtc: ctx.startedUtc, pageArea: ctx.pageArea,
    groups, reasonRows, fixedRows, lists, transitions: sortedTransitions, compValue, exposureTable, pairs,
    verdict: { C1, C2, C3, C4, status: notEval ? "not_evaluable" : failed.length ? "fail" : "pass", failed },
  };
}

// ---- public tables ----
const cell = (v) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "S" : "F") : String(v));
const ratio = (a, b) => `${a}/${b}`;
export function tableRows(summary) {
  const g = summary.groups;
  const rowNames = ["total", "fixed22", "other122", "side L", "side R", "header normal", "header blank", "header dup", "ans same", "ans below",
    ...CELLS.map((c) => `cell ${c}`), ...Object.keys(g).filter((k) => k.startsWith("source "))];
  const label = (k) => (k === "total" ? "전체" : k === "fixed22" ? "고정 22" : k === "other122" ? "그 밖 122" : k);
  const T = {};
  T.groups = [["그룹", "n", "W5 표시", "W1 엄격", "W4 엄격", "W5 엄격", "L5/W1 성공", "L5 원본", "공통 기회", "J4", "J5", "J5 원본", "J4 유지", "재노출 항목", "재노출 쪽", "4항목/적용"],
    ...rowNames.map((k) => { const b = g[k]; return [label(k), b.n, b.shown, b.strict.w1, b.strict.w4, b.strict.w5, ratio(b.L5.count, b.L5.denom), b.L5.sources, b.opportunity, b.J4, b.J5, b.J5Sources, ratio(b.J4kept.count, b.J4kept.of), b.reexposed.items, b.reexposed.pages, ratio(b.fourItems.count, b.fourItems.of)].map(cell); })];
  T.reasons = [["그룹", ...REASONS], ...summary.reasonRows.map((r) => [label(r.group), ...REASONS.map((x) => r.counts[x])].map(cell))];
  const readRows = ["header normal", "fixed22", "cell L-normal-same", "cell L-normal-below", "cell R-normal-same", "cell R-normal-below"];
  T.reading = [["그룹", "비교 쪽", "E1 W1", "E1 W4", "E1 W5", "E1 W5 새(W1 기준)", "E1 W5 새(W4 기준)", "E1 W4→W5 해소", "E2 W1", "E2 W4", "E2 W5", "E2 W5 새(W1 기준)", "E2 W5 새(W4 기준)"],
    ...readRows.map((k) => { const r = g[k].reading; return [label(k), r.pages, r.e1.w1, r.e1.w4, r.e1.w5, r.newE1W1, r.newE1W4, r.resolvedE1W4, r.e2.w1, r.e2.w4, r.e2.w5, r.newE2W1, r.newE2W4].map(cell); })];
  T.area = [["그룹", "쪽", "W4 감소 %p", "W5 원본 감소 %p", "W5 표시 감소 %p", "W5 원본 − W4 증가 %p", "표시 > W1 쪽", "W1 밖 원본 행 쪽"],
    ...["total", "fixed22", "other122", ...Object.keys(g).filter((k) => k.startsWith("source "))].map((k) => { const b = g[k]; return [label(k), b.n, ppText(b.area.w4VsW1), ppText(b.area.w5SourceVsW1), ppText(b.area.w5DisplayVsW1), ppText(b.area.w5SourceVsW4), b.area.displayGtW1, b.area.sourceOutsideW1].map(cell); })];
  T.transitions = [["W1/W4/W5", "항목 수"], ...Object.entries(summary.transitions).map(([k, v]) => [k, v].map(cell))];
  T.compValue = [["창", "full", "partial", "none"], ...["w1", "w4", "w5"].map((k) => [k.toUpperCase(), summary.compValue[k].full, summary.compValue[k].partial, summary.compValue[k].none].map(cell))];
  const fpnm = (o, m) => `${o.full}/${o.partial}/${o.none}${m ? `/${o.source_missing}` : ""}`;
  T.exposure = [["행", "목표 표제 f/p/n/m", "경쟁 표제 f/p/n/m", "경쟁 값 f/p/n", "목표 값 f/p/n"],
    ...["normal", "blank", "dup"].flatMap((h) => ["w1", "w4", "w5"].map((k) => { const e = summary.exposureTable[h][k]; return [`${h} ${k.toUpperCase()}`, fpnm(e.targetHeader, true), fpnm(e.compHeader, true), fpnm(e.compValue), fpnm(e.targetValue)]; }))];
  T.fixed22 = [["ID", "키", "W5 사유", "목표 표제", "경쟁 표제", "목표 값", "경쟁 값", "목표 표제 출력 위치", "4항목", "E1 W4→W5"],
    ...summary.fixedRows.map((r) => [r.id, r.key, r.w5Reason, r.targetHeader, r.compHeader, r.targetValue, r.compValue, r.place ? `[${r.place.join(",")}]` : "—", r.fourItems ? "S" : "F", `${r.e1w4 ? "E1" : "-"}→${r.e1w5 ? "E1" : "-"}`].map(cell))];
  const v = summary.verdict;
  T.verdict = [["조건", "값", "판정"],
    ["C1", `L5 ${v.C1.L5}, W1 유지 일치 ${v.C1.w1KeptMatch}/${v.C1.of}`, v.C1.pass ? "통과" : "미달"],
    ["C2", `고정 22 W5 E1 ${v.C2.fixedE1W5}, 4항목 ${v.C2.fourItems}/${v.C2.of}, 정상 ${v.C2.normalPages}쪽 새 E1 ${v.C2.newE1W1}·새 E2 ${v.C2.newE2W1}(W1 기준)`, v.C2.pass ? "통과" : "미달"],
    ["C3", `J4 유지 ${v.C3.J4kept}/${v.C3.J4}, 재노출 항목 ${v.C3.reexposedItems}`, v.C3.pass ? "통과" : "미달"],
    ["C4(채점기)", Object.entries(v.C4.checks).map(([k, x]) => `${k} ${x ? "S" : "F"}`).join(", "), v.C4.pass ? "통과" : "미달"],
    ["판정", v.failed.length ? `미달 ${v.failed.join(",")}` : "미달 없음", v.status]];
  return T;
}
export const renderTable = (rows) => rows.map((r, i) => `| ${r.join(" | ")} |${i === 0 ? `\n|${r.map(() => "---").join("|")}|` : ""}`).join("\n");
