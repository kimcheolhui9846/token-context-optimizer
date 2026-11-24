// ko-ocr-holdout: inputs from the frozen data commit, baseline groups and the summary (protocol sections 3.4, 5, 6).
// No OCR and no key rule here: key results and row scoring come from the fixed #147 library (ko-ocr-holdout-fixed.mjs).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { researchDir } from "./ko-ocr-holdout-fixed.mjs";
import { ANCHORS, DOCTYPES, LANGS, LAYOUTS, MANIFEST } from "./ko-ocr-holdout-data.mjs";

export const LANG_DIR = join(researchDir, ".cache", "ko-ocr-factorial"); // same cache path as #147 (protocol 4.1)
export const DATA_COMMIT = "936baefb0d6832a757d913466a84ae4039fc2ebb"; // data freeze commit (before any OCR)
export const DATA_PATH = "research/results/ko-ocr-holdout/data";
export const MANIFEST_SHA256 = "c8de050507bccad3f030a84c893f0be67cd874b98f78045d35d8e0c7cc350f5a";
export const DATASET = "holdout";
export const PAGES = 96;
export const PRIMARY_PAGES = 24;
export const CONDITIONS = ["O0K0", "O0K1", "O1K0", "O1K1"];
export const PAIRS = [["O0K0", "O0K1"], ["O1K0", "O1K1"], ["O0K0", "O1K0"], ["O0K1", "O1K1"], ["O0K0", "O1K1"]];

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });

/** Raw bytes of one file of the frozen data commit, checked against manifest.json (itself checked by SHA-256). */
export function frozenDataReader(commit = DATA_COMMIT) {
  let type = "";
  try { type = git(["cat-file", "-t", commit], "utf8").trim(); } catch { /* below */ }
  if (type !== "commit") throw new Error(`data commit ${commit} is missing`);
  const raw = (rel) => git(["cat-file", "blob", `${commit}:${DATA_PATH}/${rel}`]);
  const mbytes = raw(MANIFEST);
  if (sha256(mbytes) !== MANIFEST_SHA256) throw new Error(`manifest.json SHA-256 ${sha256(mbytes)} != ${MANIFEST_SHA256}`);
  const manifest = JSON.parse(mbytes.toString("utf8"));
  const listed = git(["ls-tree", "-r", "--full-tree", "--name-only", `${commit}:${DATA_PATH}`], "utf8").trim().split("\n").filter((f) => f !== MANIFEST);
  const want = Object.keys(manifest.files).sort();
  if (JSON.stringify(listed.sort()) !== JSON.stringify(want)) throw new Error("data commit files differ from manifest.json");
  return (rel) => {
    const m = manifest.files[rel];
    if (!m) throw new Error(`${rel} is not in manifest.json`);
    const b = raw(rel);
    if (sha256(b) !== m.sha256 || b.length !== m.bytes) throw new Error(`${rel} differs from manifest.json`);
    return b;
  };
}

/** Selector-side input only: registered questions and PNG bytes. Never reads design.json or gold.json. */
export function readSelectorInputs(read = frozenDataReader()) {
  const q = JSON.parse(read("questions.json").toString("utf8")).questions;
  if (q.length !== PAGES) throw new Error(`${q.length} questions, not ${PAGES}`);
  if (new Set(q.map((x) => x.id)).size !== PAGES) throw new Error("duplicate question ids");
  return q.map((x) => ({ dataset: DATASET, id: x.id, question: x.question, bytes: read(`images/${x.file}`) }));
}

/** Scoring-side input: classes from design.json and two gold rects per page from gold.json. */
export function readScoringInputs(read = frozenDataReader()) {
  const design = JSON.parse(read("design.json").toString("utf8"));
  const gold = JSON.parse(read("gold.json").toString("utf8")).gold;
  const classes = new Map(), rects = new Map();
  for (const im of design.images) {
    classes.set(im.id, { id: im.id, pairId: im.pairId, lang: im.lang, anchor: im.anchor, doctype: im.doctype, layout: im.layout, page: im.page });
    const g = gold[im.id];
    if (!g || !Array.isArray(g.parts) || g.parts.length !== 2) throw new Error(`${im.id}: ${g?.parts?.length} gold parts, not 2`);
    for (const p of g.parts) {
      const [l, t, r, b] = p.rect;
      if (![l, t, r, b].every(Number.isInteger) || r - l !== p.size[0] || b - t !== p.size[1] || !(l < r && t < b)) throw new Error(`${im.id}: bad gold rect`);
    }
    rects.set(im.id, g.parts.map((p) => p.rect));
  }
  if (classes.size !== PAGES) throw new Error(`design has ${classes.size} pages`);
  return { classes, rects, order: design.images.map((x) => x.id) };
}

export const primaryOf = (cl) => cl.lang === "ko" && cl.anchor === "nl";
const pct = (c, n) => (n > 0 ? Math.round((c * 10000) / n) / 100 : null);

/** Baseline groups from run A's O0K0 rows (protocol 6.2): M unmatched, C matched, E error, S strict within C. */
export function baselineGroups(o0k0Rows, n = PAGES) {
  if (o0k0Rows.length !== n) throw new Error(`baseline has ${o0k0Rows.length} rows, not ${n} (sum check)`);
  const byId = new Map();
  const counts = { M: 0, C: 0, E: 0, S: 0 };
  for (const r of o0k0Rows) {
    const group = r.state === "technical_error" ? "E" : r.state === "unmatched" ? "M" : "C";
    const strict = group === "C" && r.strict === true;
    counts[group]++;
    if (strict) counts.S++;
    byId.set(r.id, { group, strict });
  }
  if (byId.size !== n || counts.M + counts.C + counts.E !== n) throw new Error(`baseline sum M+C+E = ${counts.M + counts.C + counts.E}, not ${n}`);
  return { byId, counts };
}

/** Decorate scored rows (cond, id, state, matched, strict, evidence, ...) with classes and the baseline group. */
export function scoreRows(scored, classOf, baseline) {
  return scored.map((r) => {
    const cl = classOf(r.id);
    const b = baseline.byId.get(r.id);
    if (!cl || !b) throw new Error(`${r.id}: no class or baseline`);
    return { ...r, doctype: cl.doctype, layout: cl.layout, cell: `${cl.lang}/${cl.anchor}`, primary: primaryOf(cl), baselineGroup: b.group, baselineStrict: b.strict };
  });
}

function block(rows) {
  const c = (f) => rows.filter(f).length;
  const strict = c((r) => r.strict === true);
  return {
    n: rows.length,
    technicalError: c((r) => r.state === "technical_error"),
    matched: c((r) => r.matched === true),
    unmatched: c((r) => r.state === "unmatched"),
    strict,
    strictPct: pct(strict, rows.length),
    evidenceAll: c((r) => r.evidence === "all"),
    evidencePartial: c((r) => r.evidence === "partial"),
    evidenceNone: c((r) => r.evidence === "none"),
    fullPage: c((r) => r.fullPage === true),
  };
}
const byKeys = (rows, keys, f) => Object.fromEntries(keys.map((k) => [k, block(rows.filter((r) => f(r) === k))]));

function transitions(rows) {
  const M = rows.filter((r) => r.baselineGroup === "M");
  const C = rows.filter((r) => r.baselineGroup === "C");
  const E = rows.filter((r) => r.baselineGroup === "E");
  const S = C.filter((r) => r.baselineStrict);
  const NS = C.filter((r) => !r.baselineStrict);
  const err = (g) => g.filter((r) => r.state === "technical_error").length;
  const t = {
    M: M.length,
    unmatchedToMatched: M.filter((r) => r.matched === true).length,
    unmatchedToStrict: M.filter((r) => r.strict === true).length,
    unmatchedErrors: err(M),
    C: C.length,
    matchedToUnmatched: C.filter((r) => r.state === "unmatched").length,
    matchedErrors: err(C),
    S: S.length,
    strictToFail: S.filter((r) => r.state === "unmatched" || r.state === "matched_not_strict").length,
    strictErrors: err(S),
    notStrictC: NS.length,
    newStrict: NS.filter((r) => r.strict === true).length,
    E: E.length,
    baselineErrorNowStrict: E.filter((r) => r.strict === true).length,
    lostStrictIds: S.filter((r) => r.state === "unmatched" || r.state === "matched_not_strict").map((r) => r.id).sort(),
    newStrictIds: NS.filter((r) => r.strict === true).map((r) => r.id).sort(),
    recoveredStrictIds: M.filter((r) => r.strict === true).map((r) => r.id).sort(),
  };
  t.unmatchedToMatchedPct = pct(t.unmatchedToMatched, t.M);
  t.unmatchedToStrictPct = pct(t.unmatchedToStrict, t.M);
  t.matchedToUnmatchedPct = pct(t.matchedToUnmatched, t.C);
  t.strictToFailPct = pct(t.strictToFail, t.S);
  t.newStrictPct = pct(t.newStrict, t.notStrictC);
  return t;
}

function primaryBlock(rows) {
  const p = rows.filter((r) => r.primary);
  const M = p.filter((r) => r.baselineGroup === "M");
  const o = {
    n: p.length,
    M: M.length,
    C: p.filter((r) => r.baselineGroup === "C").length,
    E: p.filter((r) => r.baselineGroup === "E").length,
    recoveredMatch: M.filter((r) => r.matched === true).length,
    recoveredStrict: M.filter((r) => r.strict === true).length,
    recoveredErrors: M.filter((r) => r.state === "technical_error").length,
    strict: p.filter((r) => r.strict === true).length,
    matched: p.filter((r) => r.matched === true).length,
    unmatched: p.filter((r) => r.state === "unmatched").length,
    technicalError: p.filter((r) => r.state === "technical_error").length,
  };
  o.recoveredMatchPct = pct(o.recoveredMatch, o.M);
  o.recoveredStrictPct = pct(o.recoveredStrict, o.M);
  o.strictPct = pct(o.strict, o.n);
  return o;
}

function pairTable(rows, from, to, field) {
  const a = new Map(rows.filter((r) => r.cond === from).map((r) => [r.id, r]));
  const t = { n: 0, both: 0, fromOnly: 0, toOnly: 0, neither: 0, technicalError: 0 };
  for (const r of rows.filter((x) => x.cond === to)) {
    const f = a.get(r.id);
    t.n++;
    if (!f || f.state === "technical_error" || r.state === "technical_error") { t.technicalError++; continue; }
    const x = field === "strict" ? f.strict === true : f.matched === true;
    const y = field === "strict" ? r.strict === true : r.matched === true;
    if (x && y) t.both++; else if (x) t.fromOnly++; else if (y) t.toOnly++; else t.neither++;
  }
  return t;
}

/** All registered aggregates (protocol 6.3) from decorated score rows of the four conditions. */
export function summarize(rows) {
  const conditions = {}, primary = {}, trans = {};
  for (const cond of CONDITIONS) {
    const rc = rows.filter((r) => r.cond === cond);
    conditions[cond] = {
      total: block(rc),
      byDoctype: byKeys(rc, DOCTYPES, (r) => r.doctype),
      byLayout: byKeys(rc, LAYOUTS, (r) => r.layout),
      byDoctypeLayout: byKeys(rc, DOCTYPES.flatMap((d) => LAYOUTS.map((l) => `${d}/${l}`)), (r) => `${r.doctype}/${r.layout}`),
      byCell: byKeys(rc, LANGS.flatMap((l) => ANCHORS.map((a) => `${l}/${a}`)), (r) => r.cell),
    };
    primary[cond] = primaryBlock(rc);
    trans[cond] = transitions(rc);
  }
  const pairs = {};
  for (const [from, to] of PAIRS) {
    const sub = rows.filter((r) => r.cond === from || r.cond === to);
    pairs[`${from}->${to}`] = {};
    for (const [grp, f] of [["primary", (r) => r.primary], ["total", () => true]]) {
      const g = sub.filter(f);
      pairs[`${from}->${to}`][grp] = { strict: pairTable(g, from, to, "strict"), matched: pairTable(g, from, to, "matched") };
    }
  }
  return { conditions, primary, transitions: trans, pairs };
}
