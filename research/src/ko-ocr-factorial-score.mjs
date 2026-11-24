// Korean OCR x Hangul key factorial: scorer (protocol section 6). Runs only after the run folder is frozen.
// Usage (from research/): node src/ko-ocr-factorial-score.mjs --run <run dir> --out <new score dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONDITIONS, DATASETS, REPLAY, SOURCES, checkFreeze, interaction, jsonl, parseJsonl, pretty, readCohort, readFixedBlob, repoRoot, scoreKey, sha256, summarize,
} from "./ko-ocr-factorial-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const run = arg("--run");
const out = arg("--out");
if (!run || !out) throw new Error("--run and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const repo = repoRoot();

// 1. Predictions must match their frozen hashes before any scoring-side file is opened.
const frozen = checkFreeze(run);
const preds = parseJsonl(readFileSync(join(run, "predictions.jsonl"), "utf8"));
const ocrRows = parseJsonl(readFileSync(join(run, "ocr.jsonl"), "utf8"));

// 2. Cohort list against the #146 replay blob.
const cohort = readCohort();
const replayBytes = readFixedBlob(repo, REPLAY.commit, REPLAY);
if (sha256(replayBytes) !== REPLAY.sha256) throw new Error("replay.jsonl SHA-256 differs");
const replay = parseJsonl(replayBytes.toString("utf8"));
if (replay.length !== 96 || cohort.length !== 96) throw new Error("cohort or replay is not 96 rows");
replay.forEach((r, i) => {
  const c = cohort[i];
  if (c.dataset !== r.dataset || c.id !== r.id || c.baselineMatched !== r.matched || r.status !== "ok" || r.ok !== true) throw new Error(`cohort row ${i} differs from replay`);
});
const ck = (ds, id) => `${ds}|${id}`;
if (new Set(cohort.map((c) => ck(c.dataset, c.id))).size !== 96) throw new Error("duplicate (dataset, id) in cohort");

// 3. Scoring-side sources.
const classes = new Map(), gold = new Map(), history = new Map();
for (const ds of DATASETS) {
  const src = SOURCES[ds];
  const cls = JSON.parse(readFixedBlob(repo, src.commit, src.classes).toString("utf8")).images;
  for (const im of cls) classes.set(ck(ds, im.id), { lang: im.lang, anchor: im.anchor, page: im.page, sha256: im.sha256 ?? null });
  const g = JSON.parse(readFixedBlob(repo, src.commit, src.gold).toString("utf8")).gold;
  for (const [id, v] of Object.entries(g)) {
    if (!Array.isArray(v.parts) || v.parts.length !== 2) throw new Error(`${ds}/${id}: ${v.parts?.length} gold parts, not 2`);
    for (const p of v.parts) {
      const [l, t, r, b] = p.rect;
      if (![l, t, r, b].every(Number.isInteger) || r - l !== p.size[0] || b - t !== p.size[1] || !(l < r && t < b)) throw new Error(`${ds}/${id}: bad gold rect`);
    }
    gold.set(ck(ds, id), v.parts.map((p) => p.rect));
  }
  for (const h of parseJsonl(readFixedBlob(repo, src.commit, src.history).toString("utf8"))) history.set(ck(ds, h.id), h);
}
for (const c of cohort) {
  const k = ck(c.dataset, c.id);
  if (!classes.has(k) || !gold.has(k) || !history.has(k)) throw new Error(`${k}: missing class, gold or history`);
  const isKoNl = classes.get(k).lang === "ko" && classes.get(k).anchor === "nl";
  if (isKoNl === c.baselineMatched) throw new Error(`${k}: baseline unmatched set differs from KO/nl`);
  if (history.get(k).matched !== c.baselineMatched) throw new Error(`${k}: history matched differs from cohort`);
}

// 4. Predictions layout: per OCR condition, 96 rows in cohort order.
const predMap = new Map();
for (const ocr of ["O0", "O1"]) {
  const rows = preds.filter((p) => p.ocr === ocr);
  if (rows.length !== 96) throw new Error(`${ocr}: ${rows.length} prediction rows, not 96`);
  rows.forEach((p, i) => {
    if (p.dataset !== cohort[i].dataset || p.id !== cohort[i].id) throw new Error(`${ocr} row ${i} out of cohort order`);
    const cl = classes.get(ck(p.dataset, p.id));
    if (cl.sha256 && p.pngSha256 !== cl.sha256) throw new Error(`${p.dataset}/${p.id}: PNG SHA differs from index`);
    if (p.status === "ok" && (p.width !== cl.page.width || p.height !== cl.page.height)) throw new Error(`${p.dataset}/${p.id}: size differs from design`);
    predMap.set(`${ocr}|${ck(p.dataset, p.id)}`, p);
  });
}
if (preds.length !== 192) throw new Error(`${preds.length} prediction rows, not 192`);

// 5. Baseline strict success from the historical run A window (protocol 3.2).
const baseline = new Map();
for (const c of cohort) {
  const k = ck(c.dataset, c.id);
  const h = history.get(k);
  const s = scoreKey({ status: h.status, matched: h.matched, band: h.band }, classes.get(k).page, gold.get(k));
  baseline.set(k, s);
}

// 6. Score rows: 4 conditions x 96, cohort order.
const scoreRows = [];
for (const cond of CONDITIONS) {
  const ocr = cond.slice(0, 2), key = cond.endsWith("K0") ? "k0" : "k1";
  for (const c of cohort) {
    const k = ck(c.dataset, c.id);
    const p = predMap.get(`${ocr}|${k}`);
    const kr = p.status === "ok" ? p[key] : { ...p[key], status: "error" };
    const s = scoreKey(kr, classes.get(k).page, gold.get(k));
    const cl = classes.get(k);
    scoreRows.push({
      cond, dataset: c.dataset, id: c.id, cell: `${cl.lang}/${cl.anchor}`, cohort: c.baselineMatched ? "control" : "primary", baselineMatched: c.baselineMatched,
      baselineStrict: baseline.get(k).strict, baselineEvidence: baseline.get(k).evidence, branch: kr.branch ?? null, ...s, error: kr.status === "ok" ? null : (kr.error ?? p.error ?? "error"),
    });
  }
}

// 7. Historical comparison of O0K0 (protocol 6.3).
const nul = (v) => (v === undefined ? null : v);
const same = (a, b) => JSON.stringify(nul(a)) === JSON.stringify(nul(b));
const ocrMap = new Map(ocrRows.map((r) => [`${r.ocr}|${ck(r.dataset, r.id)}`, r]));
const historyRows = cohort.map((c) => {
  const k = ck(c.dataset, c.id);
  const h = history.get(k), p = predMap.get(`O0|${k}`), o = ocrMap.get(`O0|${k}`);
  const k0 = p.k0;
  const fields = ["keys", "matched", "score", "lineText", "confidence", "axisRow", "band"];
  const diff = p.status === "ok" && k0.status === "ok" ? fields.filter((f) => !same(k0[f], h[f])) : ["technical_error"];
  const now = scoreRows.find((r) => r.cond === "O0K0" && r.dataset === c.dataset && r.id === c.id);
  return {
    dataset: c.dataset, id: c.id, selectionSame: diff.length === 0, diff,
    ocrIdentical: o && o.ocrLines ? JSON.stringify(o.ocrLines) === JSON.stringify(h.ocrLines) : false,
    baselineStrict: baseline.get(k).strict, nowStrict: now.strict, strictSame: baseline.get(k).strict === now.strict && now.state !== "technical_error",
  };
});

// 8. Summary.
const summary = summarize(scoreRows);
const ix = interaction(summary);
const lineTexts = (r) => (r && r.ocrLines ? JSON.stringify(r.ocrLines.map((l) => l.text)) : null);
let ocrTextDiff = 0, ocrTextCompared = 0;
for (const c of cohort) {
  const a = ocrMap.get(`O0|${ck(c.dataset, c.id)}`), b = ocrMap.get(`O1|${ck(c.dataset, c.id)}`);
  if (lineTexts(a) === null || lineTexts(b) === null) continue;
  ocrTextCompared++;
  if (lineTexts(a) !== lineTexts(b)) ocrTextDiff++;
}
const branches = {};
for (const ocr of ["O0", "O1"]) {
  branches[ocr] = {};
  for (const ds of [...DATASETS, "total"]) {
    const rows = preds.filter((p) => p.ocr === ocr && (ds === "total" || p.dataset === ds));
    branches[ocr][ds] = { k0: 0, hangul: 0, none: 0, error: 0 };
    for (const p of rows) branches[ocr][ds][p.status === "ok" && p.k1.status === "ok" ? p.k1.branch : "error"]++;
  }
}
const baseCount = (ds) => {
  const rows = cohort.filter((c) => ds === "total" || c.dataset === ds);
  const st = (c) => baseline.get(ck(c.dataset, c.id));
  return { n: rows.length, matched: rows.filter((c) => c.baselineMatched).length, strictAmongMatched: rows.filter((c) => c.baselineMatched && st(c).strict).length, strictAmongUnmatched: rows.filter((c) => !c.baselineMatched && st(c).strict).length, strict: rows.filter((c) => st(c).strict).length };
};
const histCount = (ds) => {
  const rows = historyRows.filter((r) => ds === "total" || r.dataset === ds);
  return { n: rows.length, selectionSame: rows.filter((r) => r.selectionSame).length, ocrIdentical: rows.filter((r) => r.ocrIdentical).length, strictSame: rows.filter((r) => r.strictSame).length };
};
const out1 = {
  inputs: { predictionsSha256: frozen["predictions.jsonl"], ocrSha256: frozen["ocr.jsonl"], cohortSha256: sha256(Buffer.from(jsonl(cohort))), replayBlob: REPLAY.blob },
  denominators: { pages: 96, primary: cohort.filter((c) => !c.baselineMatched).length, control: cohort.filter((c) => c.baselineMatched).length, baselineStrictControl: baseCount("total").strictAmongMatched },
  baseline: { r09: baseCount("r09"), fcp: baseCount("fcp"), total: baseCount("total"), registeredExpectation: { strictAmongMatched: 70, r09: 35, fcp: 35 } },
  history: { r09: histCount("r09"), fcp: histCount("fcp"), total: histCount("total") },
  ocrLineTextDiff: { compared: ocrTextCompared, differ: ocrTextDiff },
  k1Branches: branches,
  ...summary,
  interaction: ix,
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "score.jsonl"), jsonl(scoreRows));
writeFileSync(join(out, "history.jsonl"), jsonl(historyRows));
writeFileSync(join(out, "summary.json"), pretty(out1));
console.log(JSON.stringify({ baseline: out1.baseline.total, history: out1.history.total, strictRecoveryInteraction: ix.strictRecovery.interaction }));
