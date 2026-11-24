// ko-ocr-holdout: scorer (protocol section 6). Runs only on frozen run folders.
// Usage (from research/): node src/ko-ocr-holdout-score.mjs --run <run dir> --baseline-run <run A dir> --out <new score dir>
// Baseline groups always come from run A's O0K0 (for run A, --baseline-run is run A itself).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixedLib } from "./ko-ocr-holdout-fixed.mjs";
import { CONDITIONS, DATASET, MANIFEST_SHA256, PAGES, PRIMARY_PAGES, baselineGroups, frozenDataReader, primaryOf, readScoringInputs, scoreRows, summarize } from "./ko-ocr-holdout-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [run, baseRun, out] = ["--run", "--baseline-run", "--out"].map(arg);
if (!run || !baseRun || !out) throw new Error("--run, --baseline-run and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const lib = await loadFixedLib();

// 1. Frozen predictions first; only then the scoring-side files are opened.
const frozen = lib.checkFreeze(run);
const baseFrozen = lib.checkFreeze(baseRun);
const preds = lib.parseJsonl(readFileSync(join(run, "predictions.jsonl"), "utf8"));
const basePreds = lib.parseJsonl(readFileSync(join(baseRun, "predictions.jsonl"), "utf8"));
const ocrRows = lib.parseJsonl(readFileSync(join(run, "ocr.jsonl"), "utf8"));

// 2. Scoring-side inputs from the frozen data commit.
const { classes, rects, order } = readScoringInputs(frozenDataReader());

// 3. Prediction layout: per OCR condition, 96 rows in registered order.
function predMap(rows, label) {
  if (rows.length !== 2 * PAGES) throw new Error(`${label}: ${rows.length} prediction rows, not ${2 * PAGES}`);
  const m = new Map();
  for (const ocr of ["O0", "O1"]) {
    const rs = rows.filter((p) => p.ocr === ocr);
    if (rs.length !== PAGES) throw new Error(`${label} ${ocr}: ${rs.length} rows`);
    rs.forEach((p, i) => {
      if (p.dataset !== DATASET || p.id !== order[i]) throw new Error(`${label} ${ocr} row ${i} out of registered order`);
      const cl = classes.get(p.id);
      if (p.status === "ok" && (p.width !== cl.page.width || p.height !== cl.page.height)) throw new Error(`${p.id}: size differs from design`);
      m.set(`${ocr}|${p.id}`, p);
    });
  }
  return m;
}
const pm = predMap(preds, "run");
const bm = predMap(basePreds, "baseline run");

const score = (p, key) => {
  const kr = p.status === "ok" ? p[key] : { ...p[key], status: "error" };
  const s = lib.scoreKey(kr, classes.get(p.id).page, rects.get(p.id));
  return { branch: kr.branch ?? null, ...s, error: kr.status === "ok" ? null : (kr.error ?? p.error ?? "error") };
};

// 4. Baseline groups from run A O0K0 (protocol 6.2).
const baseRows = order.map((id) => ({ cond: "O0K0", id, ...score(bm.get(`O0|${id}`), "k0") }));
const baseline = baselineGroups(baseRows, PAGES);
const primIds = order.filter((id) => primaryOf(classes.get(id)));
if (primIds.length !== PRIMARY_PAGES) throw new Error(`primary group has ${primIds.length} pages, not ${PRIMARY_PAGES}`);
const pc = { M: 0, C: 0, E: 0, S: 0 };
for (const id of primIds) { const b = baseline.byId.get(id); pc[b.group]++; if (b.strict) pc.S++; }
if (pc.M + pc.C + pc.E !== PRIMARY_PAGES) throw new Error("primary baseline sum differs from 24");

// 5. Score rows: 4 conditions x 96, registered order.
const scored = [];
for (const cond of CONDITIONS) {
  const ocr = cond.slice(0, 2), key = cond.endsWith("K0") ? "k0" : "k1";
  for (const id of order) scored.push({ cond, id, ...score(pm.get(`${ocr}|${id}`), key) });
}
const rows = scoreRows(scored, (id) => classes.get(id), baseline);

// 6. Summary.
const ocrMap = new Map(ocrRows.map((r) => [`${r.ocr}|${r.id}`, r]));
const lineTexts = (r) => (r && r.ocrLines ? JSON.stringify(r.ocrLines.map((l) => l.text)) : null);
let compared = 0, differ = 0;
for (const id of order) {
  const a = lineTexts(ocrMap.get(`O0|${id}`)), b = lineTexts(ocrMap.get(`O1|${id}`));
  if (a === null || b === null) continue;
  compared++;
  if (a !== b) differ++;
}
const branches = {};
for (const ocr of ["O0", "O1"]) {
  branches[ocr] = { k0: 0, hangul: 0, none: 0, error: 0 };
  for (const id of order) { const p = pm.get(`${ocr}|${id}`); branches[ocr][p.status === "ok" && p.k1.status === "ok" ? p.k1.branch : "error"]++; }
}
const errorsByKind = {};
for (const p of preds) if (p.status !== "ok") { const k = String(p.error).split(":")[0]; errorsByKind[k] = (errorsByKind[k] ?? 0) + 1; }
const summary = {
  inputs: { predictionsSha256: frozen["predictions.jsonl"], ocrSha256: frozen["ocr.jsonl"], baselinePredictionsSha256: baseFrozen["predictions.jsonl"], dataManifestSha256: MANIFEST_SHA256 },
  denominators: { pages: PAGES, primaryPages: PRIMARY_PAGES },
  baseline: { ...baseline.counts, primary: pc },
  ...summarize(rows),
  ocrLineTextDiff: { compared, differ },
  k1Branches: branches,
  pageErrors: errorsByKind,
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "score.jsonl"), lib.jsonl(rows));
writeFileSync(join(out, "summary.json"), lib.pretty(summary));
console.log(JSON.stringify({ baseline: summary.baseline, totalStrict: Object.fromEntries(CONDITIONS.map((c) => [c, summary.conditions[c].total.strict])), primary: Object.fromEntries(CONDITIONS.map((c) => [c, [summary.primary[c].recoveredMatch, summary.primary[c].recoveredStrict, summary.primary[c].M]])) }));
