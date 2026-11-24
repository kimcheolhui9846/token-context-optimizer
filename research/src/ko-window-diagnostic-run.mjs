// ko-window-diagnostic runner (protocol research/plans/2026-11-24-ko-window-diagnostic-protocol.md).
// Usage (from research/): node src/ko-window-diagnostic-run.mjs --run a|b --out <new folder>
// Reads only pinned Git objects (source-pins.json) and the registered cohort.json. No OCR, no network, no model call.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDenominators, checkRegistered, diagnosePage, summarize } from "./ko-window-diagnostic-lib.mjs";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RESULT_DIR = join(researchDir, "results", "ko-window-diagnostic");
const PAGES = 96, COHORT = 24, PRIMARY = 20;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const gitBlobId = (b) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest("hex");
const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
const parseJsonl = (t) => String(t).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const canonText = (v) => `${JSON.stringify(v, null, 1)}\n`;

export const readPins = () => JSON.parse(readFileSync(join(RESULT_DIR, "source-pins.json"), "utf8"));

/** Bytes of a pinned object: path in the commit resolves to the pinned blob; blob id, SHA-256 and size are recomputed. */
export function pinnedBytes(commit, path, pin) {
  let type = "";
  try { type = git(["cat-file", "-t", commit], "utf8").trim(); } catch { /* below */ }
  if (type !== "commit") throw new Error(`commit ${commit} is missing; run: git fetch origin pull/148/head pull/147/head`);
  const atPath = git(["rev-parse", `${commit}:${path}`], "utf8").trim();
  if (atPath !== pin.blob) throw new Error(`${path} is blob ${atPath}, not ${pin.blob}`);
  const b = git(["cat-file", "blob", pin.blob]);
  if (gitBlobId(b) !== pin.blob || sha256(b) !== pin.sha256 || b.length !== pin.bytes) throw new Error(`${path}: bytes differ from the pin`);
  return b;
}

/** The fixed #147 library, written from its pinned blob to a Git-ignored cache and imported from there. */
export async function loadK1Library(pins = readPins()) {
  const k = pins.k1Definition;
  const bytes = pinnedBytes(k.commit, k.path, k);
  const dir = join(researchDir, ".cache", "ko-window-diagnostic");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `ko-ocr-factorial-lib.${k.blob}.mjs`);
  if (!existsSync(file) || gitBlobId(readFileSync(file)) !== k.blob) writeFileSync(file, bytes);
  if (gitBlobId(readFileSync(file)) !== k.blob) throw new Error("cached K1 library differs from its pin");
  return import(pathToFileURL(file).href);
}

/** Dependencies for diagnosePage from the fixed library: whole-K1 re-check and the per-line distinct-bigram score. */
export function k1Deps(lib) {
  return {
    recheckK1: (lines, question, w, h, k0) => lib.k1Select(null, lines, question, w, h, k0),
    lineK1Score: (line, question) => {
      const q = new Set(lib.hangulBigrams(question));
      const found = new Set();
      for (const w of line.words) for (const b of lib.hangulBigrams(w.text)) if (q.has(b)) found.add(b);
      return found.size;
    },
  };
}

/** Read, check and join everything for one run; returns { pages, summary }. Throws on any registered failure. */
export async function diagnoseRun(run, { pins = readPins(), lib } = {}) {
  if (!["a", "b"].includes(run)) throw new Error("--run must be a or b");
  const s = pins.source;
  const read = (rel) => pinnedBytes(s.commit, `${s.basePath}/${rel}`, s.files[rel]);
  const text = (rel) => read(rel).toString("utf8");
  const files = ["data/design.json", "data/render.json", "data/gold.json", "data/manifest.json", `run-${run}/predictions.jsonl`, `run-${run}/ocr.jsonl`, `run-${run}/freeze.json`, `score-${run}/score.jsonl`];
  const raw = Object.fromEntries(files.map((f) => [f, read(f)]));

  // cross-checks of the pinned raw sources: freeze.json (run files) and manifest.json (data files)
  const freeze = JSON.parse(raw[`run-${run}/freeze.json`].toString("utf8"));
  for (const f of ["predictions.jsonl", "ocr.jsonl"]) if (freeze.files?.[f] !== sha256(raw[`run-${run}/${f}`])) throw new Error(`run-${run}/${f} differs from freeze.json`);
  const manifest = JSON.parse(raw["data/manifest.json"].toString("utf8"));
  for (const f of ["design.json", "render.json", "gold.json"]) {
    const m = manifest.files?.[f], b = raw[`data/${f}`];
    if (!m || m.sha256 !== sha256(b) || m.bytes !== b.length) throw new Error(`data/${f} differs from manifest.json`);
  }

  const design = JSON.parse(raw["data/design.json"].toString("utf8")).images;
  const render = JSON.parse(raw["data/render.json"].toString("utf8")).images;
  const gold = JSON.parse(raw["data/gold.json"].toString("utf8")).gold;
  const preds = parseJsonl(raw[`run-${run}/predictions.jsonl`].toString("utf8"));
  const ocr = parseJsonl(raw[`run-${run}/ocr.jsonl`].toString("utf8"));
  const score = parseJsonl(raw[`score-${run}/score.jsonl`].toString("utf8"));
  const denominators = checkDenominators({ design, preds, ocr, score }, PAGES);

  const cohortBytes = readFileSync(join(RESULT_DIR, "cohort.json"));
  const cohort = JSON.parse(cohortBytes.toString("utf8"));
  const want = design.filter((d) => d.lang === "ko" && d.anchor === "nl").map((d) => d.id);
  if (JSON.stringify(cohort.pages.map((c) => c.id)) !== JSON.stringify(want) || want.length !== COHORT) throw new Error("cohort.json ids differ from the ko/nl pages in design order");
  if (cohort.pages.filter((c) => c.role === "primary").length !== PRIMARY) throw new Error("cohort primary count differs from 20");
  const combos = {};
  for (const c of cohort.pages) combos[`${c.doctype}/${c.layout}`] = (combos[`${c.doctype}/${c.layout}`] ?? 0) + 1;
  if (Object.keys(combos).length !== 6 || Object.values(combos).some((n) => n !== 4)) throw new Error("cohort is not 6 combinations x 4 pages");

  const by = (rows, f) => new Map(rows.map((r) => [f(r), r]));
  const dm = by(design, (r) => r.id), pm = by(preds, (r) => `${r.ocr}|${r.id}`), om = by(ocr, (r) => `${r.ocr}|${r.id}`), sm = by(score, (r) => `${r.cond}|${r.id}`);
  const deps = k1Deps(lib ?? (await loadK1Library(pins)));
  const pages = cohort.pages.map((c) => diagnosePage({ id: c.id, cohort: c, design: dm.get(c.id), render: render[c.id], gold: gold[c.id], pred: pm.get(`O1|${c.id}`), ocr: om.get(`O1|${c.id}`), score: sm.get(`O1K1|${c.id}`) }, deps));
  const registered = checkRegistered(pages);
  const summary = {
    protocol: "research/plans/2026-11-24-ko-window-diagnostic-protocol.md",
    inputs: {
      sourceCommit: s.commit,
      k1LibraryBlob: pins.k1Definition.blob,
      cohortSha256: sha256(cohortBytes),
      sha256: { design: sha256(raw["data/design.json"]), render: sha256(raw["data/render.json"]), gold: sha256(raw["data/gold.json"]), predictions: sha256(raw[`run-${run}/predictions.jsonl`]), ocr: sha256(raw[`run-${run}/ocr.jsonl`]), score: sha256(raw[`score-${run}/score.jsonl`]) },
    },
    sourceDenominators: { ...denominators, cohort: COHORT, primary: PRIMARY, control: COHORT - PRIMARY },
    registeredSplit: registered,
    ...summarize(pages),
  };
  return { pages, summary };
}

export const pagesText = (pages) => pages.map((p) => JSON.stringify(p)).join("\n") + "\n";
export const summaryText = canonText;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
  const run = arg("--run"), out = arg("--out");
  if (!run || !out) throw new Error("--run a|b and --out <new folder> are required");
  if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
  const { pages, summary } = await diagnoseRun(run);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "pages.jsonl"), pagesText(pages));
  writeFileSync(join(out, "summary.json"), summaryText(summary));
  console.log(JSON.stringify({ run, pages: pages.length, registeredSplit: summary.registeredSplit, containmentByLineClass: summary.containmentByLineClass.primary }));
}
