// ko-row-window: frozen data, selector-side and scoring-side inputs, and the pre-OCR checks (protocol 3.4).
// Usage (from research/):
//   node src/ko-row-window-data.mjs check --data <dir>      -> <dir>/checks.json (exit 1 when a check fails)
//   node src/ko-row-window-data.mjs manifest --data <dir>   -> <dir>/manifest.json (SHA-256 of every other file)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { researchDir } from "./ko-row-window-fixed.mjs";
import { DOCTYPES, FORMS, VERTS, GAPS, duplicateCheck, normalizeQuestion } from "./ko-row-window-lib.mjs";

export const PAGES = 48;
export const PAGE = { width: 1280, height: 960 };
export const DATA_PATH = "research/results/ko-row-window/data";
export const MANIFEST = "manifest.json";
// Set by the data-freeze commit (protocol 3.4); the runner refuses to start while these are null.
export const DATA_COMMIT = null;
export const MANIFEST_SHA256 = null;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;

// ------------------------------------------------------------------ readers
function checkedReader(manifestBytes, raw, listed, wantSha) {
  if (wantSha && sha256(manifestBytes) !== wantSha) throw new Error(`manifest.json SHA-256 ${sha256(manifestBytes)} != ${wantSha}`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const want = Object.keys(manifest.files).sort();
  if (JSON.stringify([...listed].sort()) !== JSON.stringify(want)) throw new Error("data files differ from manifest.json");
  return (rel) => {
    const m = manifest.files[rel];
    if (!m) throw new Error(`${rel} is not in manifest.json`);
    const b = raw(rel);
    if (sha256(b) !== m.sha256 || b.length !== m.bytes) throw new Error(`${rel} differs from manifest.json`);
    return b;
  };
}

/** Raw bytes of one file of the frozen data commit, checked against manifest.json (itself checked by SHA-256). */
export function frozenDataReader(commit = DATA_COMMIT, manifestSha = MANIFEST_SHA256) {
  if (!commit || !manifestSha) throw new Error("data is not frozen yet (DATA_COMMIT/MANIFEST_SHA256 unset)");
  let type = "";
  try { type = git(["cat-file", "-t", commit], "utf8").trim(); } catch { /* below */ }
  if (type !== "commit") throw new Error(`data commit ${commit} is missing`);
  const raw = (rel) => git(["cat-file", "blob", `${commit}:${DATA_PATH}/${rel}`]);
  const listed = git(["ls-tree", "-r", "--full-tree", "--name-only", `${commit}:${DATA_PATH}`], "utf8").trim().split("\n").filter((f) => f !== MANIFEST);
  return checkedReader(raw(MANIFEST), raw, listed, manifestSha);
}

const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
/** Same reader over a data folder on disk (checks before freezing, recount, fresh-clone checks). */
export function folderDataReader(dir, manifestSha = null) {
  const listed = walk(dir).map((f) => relative(dir, f).split("\\").join("/")).filter((f) => f !== MANIFEST);
  return checkedReader(readFileSync(join(dir, MANIFEST)), (rel) => readFileSync(join(dir, rel)), listed, manifestSha);
}

/** Selector side only: registered questions and PNG bytes. Never reads design.json, gold.json or render.json. */
export function readSelectorInputs(read) {
  const q = JSON.parse(read("questions.json").toString("utf8")).questions;
  if (q.length !== PAGES) throw new Error(`${q.length} questions, not ${PAGES}`);
  if (new Set(q.map((x) => x.id)).size !== PAGES) throw new Error("duplicate question ids");
  return q.map((x) => ({ id: x.id, question: x.question, bytes: read(`images/${x.file}`) }));
}

/** PNG width/height from the IHDR chunk. */
export function pngSize(bytes) {
  const sig = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== sig || bytes.subarray(12, 16).toString("latin1") !== "IHDR") throw new Error("not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Scoring side: classes, gold rects and every item's ink per page, in question order. */
export function readScoringInputs(read) {
  const design = JSON.parse(read("design.json").toString("utf8"));
  const gold = JSON.parse(read("gold.json").toString("utf8")).gold;
  const render = JSON.parse(read("render.json").toString("utf8")).images;
  const pages = design.images.map((im) => {
    const g = gold[im.id];
    if (!g || !Array.isArray(g.parts) || g.parts.length !== 2) throw new Error(`${im.id}: gold parts are not 2`);
    if (g.parts[0].item !== im.anchorItem || g.parts[1].item !== im.valueItem) throw new Error(`${im.id}: gold items`);
    for (const p of g.parts) {
      const [l, t, r, b] = p.rect;
      if (![l, t, r, b].every(Number.isInteger) || !(0 <= l && l < r && r <= im.page.width && 0 <= t && t < b && b <= im.page.height) || r - l !== p.size[0] || b - t !== p.size[1]) throw new Error(`${im.id}: bad gold rect`);
    }
    const ri = render[im.id];
    if (!ri) throw new Error(`${im.id}: render row missing`);
    for (const p of g.parts) if (JSON.stringify(ri.items[p.item]?.ink) !== JSON.stringify(p.rect)) throw new Error(`${im.id}: gold differs from render ink`);
    return {
      id: im.id, doctype: im.doctype, form: im.form, vert: im.vert, gap: im.gap, case: im.case, width: im.page.width, height: im.page.height,
      anchorItem: im.anchorItem, valueItem: im.valueItem, parts: g.parts.map((p) => p.rect), inks: ri.items,
    };
  });
  if (pages.length !== PAGES) throw new Error(`design has ${pages.length} pages`);
  return pages;
}

// ------------------------------------------------------------------ earlier sets (protocol 3.4 item 5)
export const EARLIER = [
  { source: "r09-heldout", commit: "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1", questions: { path: "research/results/r09-bilingual/heldout/questions.json", blob: "605ff760cc1c12de0a0d21076ac0b8eecb79032a" }, images: { path: "research/results/r09-bilingual/heldout/images", tree: "66bf13c62c6ae10e380558b7add188747928352b" } },
  { source: "r09-dev", commit: "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1", questions: { path: "research/results/r09-bilingual/dev/questions.json", blob: "291927f8eada02a96114630f2b989d850f2199d5" }, images: { path: "research/results/r09-bilingual/dev/images", tree: "8e59ce8fe2102edd48758d0e1033f3d4ead0a6da" } },
  { source: "fcp", commit: "708d9946ae091180a1b716baadfdd73fcfe5a19b", questions: { path: "research/results/fresh-crop-padding/frozen/selector-input/questions.json", blob: "ae578b7267ff124ecf4a0a5157f7067925b177ca" }, images: { path: "research/results/fresh-crop-padding/frozen/selector-input/images", tree: "84eb5dddb4bb37f0ff1bf62e82e523f77e7dbbca" } },
  { source: "ko-ocr-holdout-148", commit: "2ab9ed149896cc06cec387826ab99fa5bac77cda", questions: { path: "research/results/ko-ocr-holdout/data/questions.json", blob: "6e9ef62159dd9a10b48dde7d71f710338b94ddd8" }, images: { path: "research/results/ko-ocr-holdout/data/images", tree: "6566a1f901135f00a9c8fcf5c14b94516de5fdd4" } },
];
export const COHORT_149 = { commit: "fd7ba06e496437c7fc799348a95f649e85d87d7b", path: "research/results/ko-window-diagnostic/cohort.json", blob: "8a3e7f0d8879c26e20954afd704e2643a26875bd" };

function pinned(commit, path, id) {
  const at = git(["rev-parse", `${commit}:${path}`], "utf8").trim();
  if (at !== id) throw new Error(`${commit}:${path} is ${at}, not ${id}`);
  return at;
}
/** Every page of the earlier sets with its PNG SHA-256 and question (Git objects only). */
export function readEarlierSets() {
  const rows = [], counts = {};
  for (const s of EARLIER) {
    pinned(s.commit, s.questions.path, s.questions.blob);
    pinned(s.commit, s.images.path, s.images.tree);
    const qs = JSON.parse(git(["cat-file", "blob", s.questions.blob], "utf8")).questions;
    const blobs = new Map(git(["ls-tree", s.images.tree], "utf8").trim().split("\n").map((l) => { const [meta, name] = l.split("\t"); return [name, meta.split(" ")[2]]; }));
    for (const q of qs) {
      const b = blobs.get(q.file);
      if (!b) throw new Error(`${s.source}: image ${q.file} missing`);
      rows.push({ source: s.source, id: q.id, pngSha256: sha256(git(["cat-file", "blob", b])), question: q.question });
    }
    counts[s.source] = qs.length;
  }
  pinned(COHORT_149.commit, COHORT_149.path, COHORT_149.blob);
  const cohort = JSON.parse(git(["cat-file", "blob", COHORT_149.blob], "utf8")).pages.map((p) => p.id);
  return { rows, counts, cohort149: cohort };
}

// ------------------------------------------------------------------ checks (protocol 3.4)
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inside = (i, o) => i[0] >= o[0] && i[1] >= o[1] && i[2] <= o[2] && i[3] <= o[3];

export function runChecks(dir) {
  const rd = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const design = rd("design.json"), questions = rd("questions.json").questions, gold = rd("gold.json").gold, render = rd("render.json").images, rc = rd("render-check.json");
  const problems = [];
  const p = (m) => problems.push(m);
  // 1 render validity
  if (rc.failedImages !== 0) p(`render-check failedImages ${rc.failedImages}`);
  // 2 assignment
  const ims = design.images;
  if (ims.length !== PAGES) p(`${ims.length} design pages`);
  const order = [];
  DOCTYPES.forEach((d) => FORMS.forEach((f) => VERTS.forEach((v) => GAPS.forEach((g) => [0, 1].forEach((c) => order.push(`${d}-${f}-${v}-${g}-c${c}`))))));
  if (JSON.stringify(ims.map((im) => im.id)) !== JSON.stringify(order)) p("design ids/order differ from the registered grid");
  if (JSON.stringify(questions.map((q) => [q.id, q.file, q.question])) !== JSON.stringify(ims.map((im) => [im.id, im.file, im.question]))) p("questions.json differs from design.json");
  const gaps = { near: [], far: [] };
  const inkRows = [];
  ims.forEach((im) => {
    const di = DOCTYPES.indexOf(im.doctype), R = im.form === "table" ? 4 : 2;
    const j = VERTS.indexOf(im.vert) * 4 + GAPS.indexOf(im.gap) * 2 + im.case;
    if (im.slot !== (j + di) % R || im.anchorItem !== `r${im.slot}-label` || im.valueItem !== `r${im.slot}-value`) p(`${im.id}: slot`);
    const g = gold[im.id];
    if (!g || g.parts.length !== 2 || g.parts[0].item !== im.anchorItem || g.parts[1].item !== im.valueItem) { p(`${im.id}: gold parts`); return; }
    const cells = Object.fromEntries(im.items.map((it) => [it.id, it.cell]));
    const [a, v] = g.parts.map((x) => x.rect);
    for (const [x, item] of [[a, im.anchorItem], [v, im.valueItem]]) {
      if (!(x[0] < x[2] && x[1] < x[3])) p(`${im.id}: ${item} ink area`);
      if (!inside(x, [0, 0, im.page.width, im.page.height])) p(`${im.id}: ${item} ink outside page`);
      if (!inside(x, cells[item])) p(`${im.id}: ${item} ink outside its cell`);
    }
    if (overlaps(a, v)) p(`${im.id}: gold boxes overlap`);
    for (const [item, { ink }] of Object.entries(render[im.id].items)) {
      if (item !== im.anchorItem && (overlaps(ink, a))) p(`${im.id}: ${item} ink overlaps the label`);
      if (item !== im.valueItem && (overlaps(ink, v))) p(`${im.id}: ${item} ink overlaps the value`);
    }
    // 4 vertical arrangement and gap, measured on ink
    const vOverlap = Math.min(a[3], v[3]) - Math.max(a[1], v[1]);
    if (im.vert === "inline" && !(vOverlap > 0)) p(`${im.id}: inline but label/value ink rows do not overlap`);
    if (im.vert === "stacked" && !(v[1] >= a[3])) p(`${im.id}: stacked but value ink is not below the label ink`);
    const inkGap = v[0] - a[2];
    gaps[im.gap].push(inkGap);
    inkRows.push({ id: im.id, vert: im.vert, gap: im.gap, inkGap, labelInk: a, valueInk: v });
  });
  const gapStats = { nearMin: Math.min(...gaps.near), nearMax: Math.max(...gaps.near), farMin: Math.min(...gaps.far), farMax: Math.max(...gaps.far) };
  if (!(gapStats.farMin > gapStats.nearMax)) p(`far ink gaps do not all exceed near ink gaps ${JSON.stringify(gapStats)}`);
  // 3 uniqueness
  const fresh = ims.map((im) => ({ id: im.id, question: im.question, pngSha256: sha256(readFileSync(join(dir, "images", im.file))) }));
  if (new Set(fresh.map((f) => f.pngSha256)).size !== PAGES) p("PNG SHA-256 not unique");
  if (new Set(fresh.map((f) => normalizeQuestion(f.question))).size !== PAGES) p("normalized questions not unique");
  for (const f of fresh) if (render[f.id]?.sha256 !== f.pngSha256) p(`${f.id}: render.json PNG hash`);
  // 5 overlap with earlier sets
  const earlier = readEarlierSets();
  const dup = duplicateCheck(fresh, earlier.rows);
  const cohortSet = new Set(earlier.cohort149);
  const cohortRows = earlier.rows.filter((r) => r.source === "ko-ocr-holdout-148" && cohortSet.has(r.id));
  const dup149 = duplicateCheck(fresh, cohortRows.map((r) => ({ ...r, source: "ko-window-diagnostic-149-cohort" })));
  if (cohortRows.length !== 24) p(`#149 cohort resolved to ${cohortRows.length} #148 pages, not 24`);
  if (dup.imageOverlap.length) p(`PNG overlap with earlier sets: ${dup.imageOverlap.length}`);
  if (dup.questionOverlap.length) p(`question overlap with earlier sets: ${dup.questionOverlap.length}`);
  const hashes = {
    "questions.json": sha256(readFileSync(join(dir, "questions.json"))),
    "gold.json": sha256(readFileSync(join(dir, "gold.json"))),
    "design.json": sha256(readFileSync(join(dir, "design.json"))),
    answers: sha256(Buffer.from(ims.map((im) => `${im.id}\t${im.answer}`).join("\n"), "utf8")),
  };
  return {
    version: "ko-row-window-checks-1",
    ok: problems.length === 0,
    problems,
    pages: ims.length,
    grid: Object.fromEntries(["doctype", "form", "vert", "gap"].map((k) => [k, ims.reduce((m, im) => ({ ...m, [im[k]]: (m[im[k]] ?? 0) + 1 }), {})])),
    renderFailedImages: rc.failedImages,
    inkGap: gapStats,
    pages_: inkRows,
    earlier: { counts: earlier.counts, comparedPages: earlier.rows.length, imageOverlap: dup.imageOverlap, questionOverlap: dup.questionOverlap, cohort149: { pages: cohortRows.length, imageOverlap: dup149.imageOverlap.length, questionOverlap: dup149.questionOverlap.length } },
    uniqueness: { pngSha256: new Set(fresh.map((f) => f.pngSha256)).size, normalizedQuestions: new Set(fresh.map((f) => normalizeQuestion(f.question))).size },
    hashes,
  };
}

export function writeManifest(dir) {
  const files = {};
  for (const f of walk(dir).map((x) => relative(dir, x).split("\\").join("/")).filter((f) => f !== MANIFEST).sort()) {
    const b = readFileSync(join(dir, f));
    files[f] = { sha256: sha256(b), bytes: b.length };
  }
  const body = pretty({ version: "ko-row-window-manifest-1", hashBasis: "SHA-256 of raw file bytes", count: Object.keys(files).length, files });
  writeFileSync(join(dir, MANIFEST), body);
  return sha256(Buffer.from(body, "utf8"));
}

if (process.argv[1] && process.argv[1].endsWith("ko-row-window-data.mjs")) {
  const cmd = process.argv[2];
  const dir = process.argv.includes("--data") ? process.argv[process.argv.indexOf("--data") + 1] : null;
  if (!dir || !existsSync(dir)) throw new Error("--data <dir> is required");
  if (cmd === "check") {
    const out = runChecks(dir);
    const { pages_, ...rest } = out;
    writeFileSync(join(dir, "checks.json"), pretty({ ...rest, inkRows: pages_ }));
    console.log(JSON.stringify({ ok: out.ok, problems: out.problems, inkGap: out.inkGap, earlier: { counts: out.earlier.counts, image: out.earlier.imageOverlap.length, question: out.earlier.questionOverlap.length, cohort149: out.earlier.cohort149 } }));
    process.exitCode = out.ok ? 0 : 1;
  } else if (cmd === "manifest") {
    console.log(`manifest.json sha256 ${writeManifest(dir)}`);
  } else throw new Error(`unknown command ${cmd}`);
}
