// R09 scoring rules (pre-registered). Rectangles are half-open [x0, x1) x [y0, y1) in original page pixels.
// The selector never sees anything here: gold parts and answers are used only in this scoring step.

export const CATEGORIES = ["window_complete", "window_partial", "matched_full", "no_match_full", "tech_error"];

/** Outward rounding of a real-valued rectangle: floor the top-left, ceil the bottom-right. */
export const outwardRect = ([x0, y0, x1, y1]) => [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];

/** True when rect lies inside win, both half-open [x0, y0, x1, y1]. Zero tolerance. */
export const containsRect = (win, rect) => rect[0] >= win[0] && rect[1] >= win[1] && rect[2] <= win[2] && rect[3] <= win[3];

const isInt = (n) => Number.isInteger(n);

/** Validates a selector band (after its own padding) against the page; returns the window rectangle or null. */
function windowOf(band, page) {
  if (!band || ![band.left, band.top, band.width, band.height].every(isInt)) return null;
  if (band.width <= 0 || band.height <= 0 || band.left < 0 || band.top < 0) return null;
  if (band.left + band.width > page.width || band.top + band.height > page.height) return null;
  return [band.left, band.top, band.left + band.width, band.top + band.height];
}

/**
 * One image outcome. rec = { status: "ok" | "error", matched, band }. goldParts = [{ item, rect }].
 * success = matched, a real window strictly smaller than the page, and every gold part inside it.
 * evidencePreserved = the final region sent on the existing path (window, or the full frame) holds every gold part;
 * null for technical failures (not observed).
 */
export function classify(rec, goldParts, page) {
  const full = page.width * page.height;
  if (rec.status !== "ok") return { category: "tech_error", reason: rec.error || "error", success: false, evidencePreserved: null, areaRatio: null, missingParts: null };
  if (!rec.matched) return { category: "no_match_full", success: false, evidencePreserved: true, areaRatio: 1, missingParts: [] };
  const win = windowOf(rec.band, page);
  if (!win) return { category: "tech_error", reason: "invalid_output", success: false, evidencePreserved: null, areaRatio: null, missingParts: null };
  const area = (win[2] - win[0]) * (win[3] - win[1]);
  const missingParts = goldParts.filter((g) => !containsRect(win, g.rect)).map((g) => g.item);
  if (area >= full) return { category: "matched_full", success: false, evidencePreserved: missingParts.length === 0, areaRatio: 1, missingParts };
  const complete = missingParts.length === 0;
  return { category: complete ? "window_complete" : "window_partial", success: complete, evidencePreserved: complete, areaRatio: area / full, missingParts };
}

/** Checks that the raw records are exactly the expected image ids, once each. Returns a Map id -> record. */
export function alignRecords(expectedIds, records) {
  const want = new Set(expectedIds);
  const seen = new Map();
  for (const r of records) {
    if (!want.has(r.id)) throw new Error(`unexpected record ${r.id}`);
    if (seen.has(r.id)) throw new Error(`duplicate record ${r.id}`);
    seen.set(r.id, r);
  }
  const missing = expectedIds.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`missing records: ${missing.join(", ")}`);
  return seen;
}

const table0 = () => ({ both: 0, enOnly: 0, koOnly: 0, neither: 0 });
function addCell(t, en, ko) {
  if (en && ko) t.both++;
  else if (en) t.enOnly++;
  else if (ko) t.koOnly++;
  else t.neither++;
}

/**
 * Paired KO-EN statistics over a fixed set of pair ids. outcomes: id -> { success, category }.
 * Technical failures count as failures in the fixed denominator and are also reported separately; the complete-pair
 * table drops any pair with a technical failure; bounds set each unobserved success to 0/1 to minimise / maximise KO-EN.
 */
export function pairStats(pairIds, outcomes) {
  const t = table0();
  const ct = table0();
  const missing = { enOnly: 0, koOnly: 0, both: 0 };
  let lo = 0;
  let hi = 0;
  const en = { success: 0, tech: 0 };
  const ko = { success: 0, tech: 0 };
  for (const p of pairIds) {
    const e = outcomes[`${p}-en`];
    const k = outcomes[`${p}-ko`];
    if (!e) throw new Error(`no outcome for ${p}-en`);
    if (!k) throw new Error(`no outcome for ${p}-ko`);
    const eT = e.category === "tech_error";
    const kT = k.category === "tech_error";
    const eS = !eT && e.success;
    const kS = !kT && k.success;
    en.success += eS ? 1 : 0;
    ko.success += kS ? 1 : 0;
    en.tech += eT ? 1 : 0;
    ko.tech += kT ? 1 : 0;
    addCell(t, eS, kS);
    if (!eT && !kT) addCell(ct, eS, kS);
    else if (eT && kT) missing.both++;
    else if (eT) missing.enOnly++;
    else missing.koOnly++;
    const pairDiff = (kv, ev) => Number(kv) - Number(ev);
    lo += pairDiff(kT ? 0 : kS, eT ? 1 : eS);
    hi += pairDiff(kT ? 1 : kS, eT ? 0 : eS);
  }
  const n = pairIds.length;
  const cn = ct.both + ct.enOnly + ct.koOnly + ct.neither;
  return {
    n,
    en: { ...en, rate: en.success / n },
    ko: { ...ko, rate: ko.success / n },
    table: t,
    diff: (t.koOnly - t.enOnly) / n,
    missing,
    complete: { n: cn, table: ct, diff: cn ? (ct.koOnly - ct.enOnly) / cn : null },
    bounds: { min: lo / n, max: hi / n },
  };
}
