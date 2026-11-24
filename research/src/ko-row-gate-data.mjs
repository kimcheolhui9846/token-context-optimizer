// ko-row-gate: frozen data, the selector-side allowlist reader, the scoring-side reader and the pre-OCR checks (protocol 3.5).
// Usage (from research/):
//   node src/ko-row-gate-data.mjs assemble --from <generated dir> --data <new dir>   -> selector/ and scoring/ split
//   node src/ko-row-gate-data.mjs check --data <dir>      -> <dir>/checks.json (exit 1 when a check fails)
//   node src/ko-row-gate-data.mjs manifest --data <dir>   -> <dir>/manifest.json (SHA-256 of every other file)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { researchDir } from "./ko-row-gate-fixed.mjs";
import { DOCTYPES, FORMS, ANS, DEC, LAYOUTS, QTYPES, duplicateCheck, normalizeQuestion, questionTypes, grammarMatch } from "./ko-row-gate-lib.mjs";

export const PAGES = 48;
export const SOURCES = 12;
export const PAGE = { width: 1280, height: 960 };
export const DATA_PATH = "research/results/ko-row-gate/data";
export const MANIFEST = "manifest.json";
// Set by the data-freeze commit (protocol 3.5); the runner refuses to start while these are null.
export const DATA_COMMIT = "3f27fb96c215faee53af8530f6e6489363007f2f";
export const MANIFEST_SHA256 = "53222cc618f3d8f6295da2414c129e85474505e4282b4f2930ceba4b10151e69";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;

// ------------------------------------------------------------------ selector-side allowlist (protocol 4.2, 4.5)
export class AccessDenied extends Error {}
const SELECTOR_ALLOW = /^selector\/(questions\.json|images\/[A-Za-z0-9_-]+(?:-[A-Za-z0-9_]+)*\.png)$/;
/**
 * The only data reader the OCR runner and the replay get: questions and PNG bytes under selector/. Any other path (scoring/,
 * gold, design, render, score, "..") throws AccessDenied. Every accepted read is appended to log as { path, sha256, bytes }.
 */
export function selectorView(read, log = []) {
  return (rel) => {
    const p = String(rel);
    if (!SELECTOR_ALLOW.test(p) || p.split("/").includes("..")) throw new AccessDenied(`selector side may not read ${p}`);
    const b = read(p);
    log.push({ path: p, sha256: sha256(b), bytes: b.length });
    return b;
  };
}

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
/** Same reader over a data folder on disk (recount, fresh-clone checks). */
export function folderDataReader(dir, manifestSha = null) {
  const listed = walk(dir).map((f) => relative(dir, f).split("\\").join("/")).filter((f) => f !== MANIFEST);
  return checkedReader(readFileSync(join(dir, MANIFEST)), (rel) => readFileSync(join(dir, rel)), listed, manifestSha);
}

/** Selector side only, through selectorView: registered questions and PNG bytes. */
export function readSelectorInputs(view) {
  const q = JSON.parse(view("selector/questions.json").toString("utf8")).questions;
  if (q.length !== PAGES) throw new Error(`${q.length} questions, not ${PAGES}`);
  if (new Set(q.map((x) => x.id)).size !== PAGES) throw new Error("duplicate question ids");
  return q.map((x) => ({ id: x.id, question: x.question, bytes: view(`selector/images/${x.file}`) }));
}

/** PNG width/height from the IHDR chunk. */
export function pngSize(bytes) {
  const sig = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== sig || bytes.subarray(12, 16).toString("latin1") !== "IHDR") throw new Error("not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Scoring side (opened only after the predictions are frozen): classes, gold rects, item cells and inks per page. */
export function readScoringInputs(read) {
  const design = JSON.parse(read("scoring/design.json").toString("utf8"));
  const gold = JSON.parse(read("scoring/gold.json").toString("utf8")).gold;
  const render = JSON.parse(read("scoring/render.json").toString("utf8")).images;
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
    const items = {};
    for (const it of im.items) {
      const r = ri.items[it.id];
      if (!r || r.role !== it.role) throw new Error(`${im.id}: ${it.id} not rendered with role ${it.role}`);
      items[it.id] = { role: it.role, cell: it.cell, ink: r.ink };
    }
    for (const v of im.otherValueItems) if (items[v]?.role !== "value") throw new Error(`${im.id}: other value ${v} is not a value`);
    if (items[im.decoyItem]?.role !== "decoy") throw new Error(`${im.id}: decoy item`);
    return {
      id: im.id, source: im.source, doctype: im.doctype, form: im.form, content: im.content, ans: im.ans, dec: im.dec, layout: im.layout, qtype: im.qtype, slot: im.slot,
      width: im.page.width, height: im.page.height, anchorItem: im.anchorItem, valueItem: im.valueItem, decoyItem: im.decoyItem,
      parts: g.parts.map((p) => p.rect), otherValueItems: im.otherValueItems, items,
    };
  });
  if (pages.length !== PAGES) throw new Error(`design has ${pages.length} pages`);
  return pages;
}

// ------------------------------------------------------------------ assembly (protocol 3.5)
export const SELECTOR_FILES = ["questions.json"];
export const SCORING_FILES = ["design.json", "gold.json", "render.json", "render-check.json"];
/** Split the generator + renderer output folder into data/selector and data/scoring. The target must not exist. */
export function assemble(from, data) {
  if (existsSync(data)) throw new Error(`--data must not exist yet: ${data}`);
  mkdirSync(join(data, "selector", "images"), { recursive: true });
  mkdirSync(join(data, "scoring"), { recursive: true });
  for (const f of SELECTOR_FILES) copyFileSync(join(from, f), join(data, "selector", f));
  for (const f of SCORING_FILES) copyFileSync(join(from, f), join(data, "scoring", f));
  const q = JSON.parse(readFileSync(join(from, "questions.json"), "utf8")).questions;
  for (const x of q) copyFileSync(join(from, "images", x.file), join(data, "selector", "images", x.file));
  const extra = readdirSync(join(from, "images")).filter((f) => !q.some((x) => x.file === f));
  if (extra.length) throw new Error(`unexpected images ${extra.join(", ")}`);
  return { questions: q.length };
}

// ------------------------------------------------------------------ earlier sets (protocol 3.5 item 6)
export const EARLIER = [
  { source: "r09-heldout", commit: "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1", questions: { path: "research/results/r09-bilingual/heldout/questions.json", blob: "605ff760cc1c12de0a0d21076ac0b8eecb79032a" }, images: { path: "research/results/r09-bilingual/heldout/images", tree: "66bf13c62c6ae10e380558b7add188747928352b" } },
  { source: "r09-dev", commit: "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1", questions: { path: "research/results/r09-bilingual/dev/questions.json", blob: "291927f8eada02a96114630f2b989d850f2199d5" }, images: { path: "research/results/r09-bilingual/dev/images", tree: "8e59ce8fe2102edd48758d0e1033f3d4ead0a6da" } },
  { source: "fcp", commit: "708d9946ae091180a1b716baadfdd73fcfe5a19b", questions: { path: "research/results/fresh-crop-padding/frozen/selector-input/questions.json", blob: "ae578b7267ff124ecf4a0a5157f7067925b177ca" }, images: { path: "research/results/fresh-crop-padding/frozen/selector-input/images", tree: "84eb5dddb4bb37f0ff1bf62e82e523f77e7dbbca" } },
  { source: "ko-ocr-holdout-148", commit: "2ab9ed149896cc06cec387826ab99fa5bac77cda", questions: { path: "research/results/ko-ocr-holdout/data/questions.json", blob: "6e9ef62159dd9a10b48dde7d71f710338b94ddd8" }, images: { path: "research/results/ko-ocr-holdout/data/images", tree: "6566a1f901135f00a9c8fcf5c14b94516de5fdd4" } },
  { source: "ko-row-window-150", commit: "b108e2f0983bf096b4ddfc5d204a4d99cd6d8535", questions: { path: "research/results/ko-row-window/data/questions.json", blob: "402169cc68fe34e4cbe7d76f1f1b9ff43750087c" }, images: { path: "research/results/ko-row-window/data/images", tree: "7830bc5ff95c191ea83edbae15516eaa0fb04f04" } },
  { source: "ko-row-height-151", commit: "d75f54555101125a35dc8aeac8c06e5b29929593", questions: { path: "research/results/ko-row-height/data/selector/questions.json", blob: "ee9739587ea1af7fac19271aee2d0656ff281b9f" }, images: { path: "research/results/ko-row-height/data/selector/images", tree: "88c66c60d9a57a00a636f252786d36f3cd597c3b" } },
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
    const blobs = new Map(git(["ls-tree", "--full-tree", s.images.tree], "utf8").trim().split("\n").map((l) => { const [meta, name] = l.split("\t"); return [name, meta.split(" ")[2]]; }));
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

// ------------------------------------------------------------------ checks (protocol 3.2, 3.4, 3.5)
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inside = (i, o) => i[0] >= o[0] && i[1] >= o[1] && i[2] <= o[2] && i[3] <= o[3];
const PRINTABLE = [16, 16, 1264, 944];
const SAME_TOP_DIFF = 8, OTHER_TOP = [32, 48], RECORD_GAP = [12, 40];
/** W3 same-row condition on two [x0, y0, x1, y1] integer ink boxes (protocol 3.2). */
const sameRowRight = (h, u) => u[0] >= h[2] && 2 * Math.max(0, Math.min(u[3], h[3]) - Math.max(u[1], h[1])) >= Math.min(u[3] - u[1], h[3] - h[1]);
const SWAPPING = ["valueItem", "auxAItem", "decoyItem", "auxBItem"];
const IDEAL = { "same-same": ["valueItem", "decoyItem"], "same-other": ["valueItem"], "below-same": ["decoyItem"], "below-other": [] };

export function runChecks(dir) {
  const rd = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const design = rd("scoring/design.json"), questions = rd("selector/questions.json").questions, gold = rd("scoring/gold.json").gold, render = rd("scoring/render.json").images, rc = rd("scoring/render-check.json");
  const problems = [];
  const p = (m) => problems.push(m);
  // 1 render validity
  if (rc.failedImages !== 0) p(`render-check failedImages ${rc.failedImages}`);
  // 2 assignment
  const ims = design.images;
  if (ims.length !== PAGES) p(`${ims.length} design pages`);
  const order = [];
  DOCTYPES.forEach((d) => FORMS.forEach((f) => [0, 1].forEach((c) => ANS.forEach((a) => DEC.forEach((e) => order.push(`${d}-${f}-c${c}-${a}-${e}`))))));
  if (JSON.stringify(ims.map((im) => im.id)) !== JSON.stringify(order)) p("design ids/order differ from the registered grid");
  if (JSON.stringify(questions.map((q) => [q.id, q.file, q.question])) !== JSON.stringify(ims.map((im) => [im.id, im.file, im.question]))) p("selector/questions.json differs from design.json");
  const rows = [];
  const measured = { sameTopDiff: [], otherTopDiff: [], recordGap: [] };
  ims.forEach((im) => {
    const d = DOCTYPES.indexOf(im.doctype), f = FORMS.indexOf(im.form), c = im.content;
    const slot = (d + f + c) % 3;
    const qtype = QTYPES[(2 * d + f + c) % 3];
    if (im.slot !== slot || im.qtype !== qtype || im.anchorItem !== `r${slot}-label` || im.valueItem !== `r${slot}-value` || im.decoyItem !== `r${slot}-decoy` || im.source !== `${im.doctype}-${im.form}-c${c}` || im.layout !== `${im.ans}-${im.dec}`) p(`${im.id}: slot/type/source/layout`);
    if (JSON.stringify(im.otherValueItems) !== JSON.stringify([0, 1, 2].filter((s) => s !== slot).map((s) => `r${s}-value`))) p(`${im.id}: otherValueItems`);
    // 5 types and grammar
    if (JSON.stringify(questionTypes(im.question)) !== JSON.stringify([im.qtype])) p(`${im.id}: question types ${JSON.stringify(questionTypes(im.question))}`);
    const texts = {};
    for (const it of im.items) {
      texts[it.id] = it.text;
      const isVal = it.role === "value" || it.role === "decoy";
      if (isVal && !grammarMatch(im.qtype, it.text)) p(`${im.id}: ${it.id} does not match the ${im.qtype} grammar`);
      if (!isVal && QTYPES.some((t) => grammarMatch(t, it.text))) p(`${im.id}: ${it.id} matches a value grammar`);
    }
    const six = im.records.flatMap((r) => [texts[r.valueItem], texts[r.decoyItem]]);
    if (new Set(six).size !== 6) p(`${im.id}: designated values and decoys are not 6 distinct texts`);
    const g = gold[im.id];
    if (!g || g.parts.length !== 2 || g.parts[0].item !== im.anchorItem || g.parts[1].item !== im.valueItem) { p(`${im.id}: gold parts`); return; }
    const cells = Object.fromEntries(im.items.map((it) => [it.id, it.cell]));
    const inks = Object.fromEntries(Object.entries(render[im.id]?.items ?? {}).map(([k, v]) => [k, v.ink]));
    for (const it of im.items) if (!inks[it.id]) p(`${im.id}: ${it.id} has no ink`);
    if (im.items.some((it) => !inks[it.id])) return;
    const [a, v] = g.parts.map((x) => x.rect);
    if (JSON.stringify(a) !== JSON.stringify(inks[im.anchorItem]) || JSON.stringify(v) !== JSON.stringify(inks[im.valueItem])) p(`${im.id}: gold differs from render ink`);
    const ids = Object.keys(inks);
    ids.forEach((k, i) => {
      const x = inks[k];
      if (!(x[0] < x[2] && x[1] < x[3])) p(`${im.id}: ${k} ink area`);
      if (!inside(x, PRINTABLE)) p(`${im.id}: ${k} ink outside the printable area`);
      if (!inside(x, cells[k])) p(`${im.id}: ${k} ink outside its cell`);
      for (const k2 of ids.slice(i + 1)) if (overlaps(x, inks[k2])) p(`${im.id}: inks of ${k} and ${k2} overlap`);
      for (const rl of im.rules) if (overlaps(x, rl)) p(`${im.id}: ${k} ink overlaps a rule`);
    });
    // 4 measured layout on rendered inks
    const outer = [];
    for (const r of im.records) {
      const la = inks[r.labelItem];
      for (const k of ["valueItem", "auxAItem", "decoyItem", "auxBItem", "noteItem"]) {
        const b = inks[r[k]];
        const onA = cells[r[k]][1] === r.lineA[0];
        if (onA) {
          measured.sameTopDiff.push(b[1] - la[1]);
          if (!(Math.abs(b[1] - la[1]) <= SAME_TOP_DIFF && sameRowRight(la, b))) p(`${im.id}: ${r[k]} not on the label line`);
        } else {
          measured.otherTopDiff.push(b[1] - la[1]);
          if (!(b[1] >= la[3] && b[1] - la[1] >= OTHER_TOP[0] && b[1] - la[1] <= OTHER_TOP[1])) p(`${im.id}: ${r[k]} not one line below the label`);
          if (sameRowRight(la, b)) p(`${im.id}: ${r[k]} counts as the label row although it is on line B`);
        }
      }
      const bs = ["labelItem", "valueItem", "auxAItem", "decoyItem", "auxBItem", "noteItem"].map((k) => inks[r[k]]);
      outer.push([Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[3]))]);
    }
    const gaps = outer.slice(1).map((o, i) => o[0] - outer[i][1]);
    for (const gp of gaps) if (!(gp >= RECORD_GAP[0] && gp <= RECORD_GAP[1])) p(`${im.id}: record ink gap ${gp} outside [${RECORD_GAP}]`);
    measured.recordGap.push(...gaps);
    const tr = im.records[im.slot];
    const la = inks[tr.labelItem];
    const ideal = ["valueItem", "decoyItem"].filter((k) => sameRowRight(la, inks[tr[k]]));
    if (JSON.stringify(ideal) !== JSON.stringify(IDEAL[im.layout])) p(`${im.id}: ideal same-row candidates ${JSON.stringify(ideal)}`);
    for (const r of im.records) if (r.slot !== im.slot) for (const k of ["valueItem", "decoyItem"]) if (sameRowRight(la, inks[r[k]])) p(`${im.id}: ${r[k]} of another record is on the target label row`);
    const h = la[3] - la[1];
    const band = [Math.floor(la[1] - h), Math.ceil(la[3] + h)];
    const inBand = (k) => inks[tr[k]][1] >= band[0] && inks[tr[k]][3] <= band[1];
    rows.push({ id: im.id, source: im.source, layout: im.layout, slot: im.slot, qtype: im.qtype, labelInk: la, valueInk: inks[tr.valueItem], decoyInk: inks[tr.decoyItem],
      idealSameRow: ideal.map((k) => (k === "valueItem" ? "value" : "decoy")), referenceBand: band, valueInBand: inBand("valueItem"), decoyInBand: inBand("decoyItem"),
      recordOuter: outer, recordInkGaps: gaps, otherValueInks: im.otherValueItems.map((k) => inks[k]) });
  });
  const range = (xs) => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);
  const measuredRanges = { sameTopDiff: range(measured.sameTopDiff), otherTopDiff: range(measured.otherTopDiff), recordGap: range(measured.recordGap) };
  const bandByLayout = Object.fromEntries(LAYOUTS.map((k) => [k, { pages: rows.filter((r) => r.layout === k).length, valueInBand: rows.filter((r) => r.layout === k && r.valueInBand).length, decoyInBand: rows.filter((r) => r.layout === k && r.decoyInBand).length }]));
  // 3 uniqueness and pairing
  const fresh = ims.map((im) => ({ id: im.id, question: im.question, pngSha256: sha256(readFileSync(join(dir, "selector", "images", im.file))) }));
  if (new Set(fresh.map((x) => x.pngSha256)).size !== PAGES) p("PNG SHA-256 not unique");
  for (const x of fresh) if (render[x.id]?.sha256 !== x.pngSha256) p(`${x.id}: render.json PNG hash`);
  const qBySource = {};
  for (const im of ims) (qBySource[im.source] ??= new Set()).add(normalizeQuestion(im.question));
  const nq = ims.map((im) => normalizeQuestion(im.question));
  const qCounts = [...new Set(nq)].map((q) => nq.filter((x) => x === q).length);
  if (Object.keys(qBySource).length !== SOURCES || Object.values(qBySource).some((s) => s.size !== 1) || new Set(nq).size !== SOURCES || qCounts.some((k) => k !== 4)) p("normalized questions are not 12 distinct questions, one per source, 4 pages each");
  const pairing = [];
  for (const src of Object.keys(qBySource)) {
    const pages = ims.filter((im) => im.source === src);
    const swap = (im) => new Set(im.records.flatMap((r) => SWAPPING.map((k) => r[k])));
    const sig = (im) => {
      const inks = render[im.id]?.items ?? {};
      const sw = swap(im);
      return JSON.stringify({ q: im.question, a: im.answer, qtype: im.qtype, anchor: im.anchorItem, value: im.valueItem, decoy: im.decoyItem, others: im.otherValueItems,
        items: im.items.map((it) => { const k = inks[it.id]?.ink; return [it.id, it.role, it.text, k ? [k[0], k[2], k[3] - k[1], sw.has(it.id) ? null : k[1]] : null]; }) });
    };
    const layouts = pages.map((im) => im.layout).sort().join(",");
    const ok = pages.length === 4 && layouts === [...LAYOUTS].sort().join(",") && pages.every((im) => sig(im) === sig(pages[0]));
    if (!ok) p(`${src}: the 4 pages are not a valid pair set`);
    pairing.push({ source: src, pages: pages.map((im) => im.id), ok });
  }
  // 6 overlap with earlier sets
  const earlier = readEarlierSets();
  const dup = duplicateCheck(fresh, earlier.rows);
  const cohortSet = new Set(earlier.cohort149);
  const cohortRows = earlier.rows.filter((r) => r.source === "ko-ocr-holdout-148" && cohortSet.has(r.id));
  const dup149 = duplicateCheck(fresh, cohortRows.map((r) => ({ ...r, source: "ko-window-diagnostic-149-cohort" })));
  if (cohortRows.length !== 24) p(`#149 cohort resolved to ${cohortRows.length} #148 pages, not 24`);
  if (dup.imageOverlap.length) p(`PNG overlap with earlier sets: ${dup.imageOverlap.length}`);
  if (dup.questionOverlap.length) p(`question overlap with earlier sets: ${dup.questionOverlap.length}`);
  const hashes = {
    "selector/questions.json": sha256(readFileSync(join(dir, "selector", "questions.json"))),
    "scoring/gold.json": sha256(readFileSync(join(dir, "scoring", "gold.json"))),
    "scoring/design.json": sha256(readFileSync(join(dir, "scoring", "design.json"))),
    answers: sha256(Buffer.from(ims.map((im) => `${im.id}\t${im.answer}`).join("\n"), "utf8")),
  };
  const tally = (k) => ims.reduce((m, im) => ({ ...m, [im[k]]: (m[im[k]] ?? 0) + 1 }), {});
  return {
    version: "ko-row-gate-checks-1",
    ok: problems.length === 0,
    problems,
    pages: ims.length,
    sources: Object.keys(qBySource).length,
    grid: Object.fromEntries(["doctype", "form", "content", "ans", "dec", "layout", "slot", "qtype"].map((k) => [k, tally(k)])),
    renderFailedImages: rc.failedImages,
    measured: measuredRanges,
    referenceBand: bandByLayout,
    pairing,
    earlier: { counts: earlier.counts, comparedPages: earlier.rows.length, imageOverlap: dup.imageOverlap, questionOverlap: dup.questionOverlap, cohort149: { pages: cohortRows.length, imageOverlap: dup149.imageOverlap.length, questionOverlap: dup149.questionOverlap.length } },
    uniqueness: { pngSha256: new Set(fresh.map((x) => x.pngSha256)).size, normalizedQuestions: new Set(nq).size, pagesPerQuestion: [...new Set(qCounts)] },
    hashes,
    inkRows: rows,
  };
}

export function writeManifest(dir) {
  const files = {};
  for (const f of walk(dir).map((x) => relative(dir, x).split("\\").join("/")).filter((f) => f !== MANIFEST).sort()) {
    const b = readFileSync(join(dir, f));
    files[f] = { sha256: sha256(b), bytes: b.length };
  }
  const body = pretty({ version: "ko-row-gate-manifest-1", hashBasis: "SHA-256 of raw file bytes", count: Object.keys(files).length, files });
  writeFileSync(join(dir, MANIFEST), body);
  return sha256(Buffer.from(body, "utf8"));
}

if (process.argv[1] && process.argv[1].endsWith("ko-row-gate-data.mjs")) {
  const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
  const cmd = process.argv[2];
  const dir = arg("--data");
  if (!dir) throw new Error("--data <dir> is required");
  if (cmd === "assemble") {
    const from = arg("--from");
    if (!from || !existsSync(from)) throw new Error("--from <generated dir> is required");
    console.log(JSON.stringify(assemble(from, dir)));
  } else if (cmd === "check") {
    const out = runChecks(dir);
    writeFileSync(join(dir, "checks.json"), pretty(out));
    console.log(JSON.stringify({ ok: out.ok, problems: out.problems, measured: out.measured, referenceBand: out.referenceBand, uniqueness: out.uniqueness, pairingOk: out.pairing.every((x) => x.ok), earlier: { counts: out.earlier.counts, image: out.earlier.imageOverlap.length, question: out.earlier.questionOverlap.length, cohort149: out.earlier.cohort149 } }));
    process.exitCode = out.ok ? 0 : 1;
  } else if (cmd === "manifest") {
    console.log(`manifest.json sha256 ${writeManifest(dir)}`);
  } else throw new Error(`unknown command ${cmd}`);
}
