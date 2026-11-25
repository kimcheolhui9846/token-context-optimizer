// ko-header-column: frozen data, the selector-side allowlist reader, the scoring-side reader and the pre-OCR checks (protocol 3.5).
// Usage (from research/):
//   node src/ko-header-column-data.mjs assemble --from <generated dir> --data <new dir>   -> selector/ and scoring/ split
//   node src/ko-header-column-data.mjs check --data <dir>      -> <dir>/checks.json (exit 1 when a check fails)
//   node src/ko-header-column-data.mjs manifest --data <dir>   -> <dir>/manifest.json (SHA-256 of every other file)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { inflateSync } from "node:zlib";
import { researchDir } from "./ko-header-column-fixed.mjs";
import { CELLS, HEADERS, ANS, duplicateCheck, normalizeQuestion } from "./ko-header-column-lib.mjs";

export const PAGES = 144;
export const SOURCES = 12;
export const PAGE = { width: 1280, height: 960 };
export const DATA_PATH = "research/results/ko-header-column/data";
export const MANIFEST = "manifest.json";
// Set by the data-freeze commit (protocol 3.5); the runner refuses to start while these are null.
export const DATA_COMMIT = "cbb71f299c98769d886d610b1e2dbff413fbec3d";
export const MANIFEST_SHA256 = "f227f18bdb4b47553d04cee7cdeb76ad5ff94d21e45e69213c420c8ed49a0962";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;

// ------------------------------------------------------------------ selector-side allowlist (protocol 4.2, 4.5)
export class AccessDenied extends Error {}
const SELECTOR_ALLOW = /^selector[/](questions[.]json|images[/]p[0-9]{3}[.]png)$/;
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

/** Scoring side (opened only after the predictions are frozen): variant, gold rects, item cells and inks per page, in id order. */
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
    for (const v of im.otherValueItems) if (items[v]?.role !== "target_value") throw new Error(`${im.id}: other value ${v} is not a target value`);
    if (items[im.compValueItem]?.role !== "comp_value") throw new Error(`${im.id}: comp value item`);
    if (im.targetHeaderItem !== null && items[im.targetHeaderItem]?.role !== "header") throw new Error(`${im.id}: target header item`);
    if (items[im.compHeaderItem]?.role !== "header") throw new Error(`${im.id}: comp header item`);
    return {
      id: im.id, key: im.key, source: im.source, kind: im.kind, content: im.content, side: im.side, header: im.header, ans: im.ans, cell: im.cellName, qtype: im.qtype, slot: im.slot,
      width: im.page.width, height: im.page.height, anchorItem: im.anchorItem, valueItem: im.valueItem, compValueItem: im.compValueItem,
      targetHeaderItem: im.targetHeaderItem, compHeaderItem: im.compHeaderItem, otherValueItems: im.otherValueItems, recordCompItems: im.records.map((r) => r.compValueItem),
      parts: g.parts.map((p) => p.rect), items,
    };
  });
  if (pages.length !== PAGES) throw new Error(`design has ${pages.length} pages`);
  pages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  { source: "ko-row-gate-152", commit: "6865828f7f3d723243d03bea1cafad6c74af5682", questions: { path: "research/results/ko-row-gate/data/selector/questions.json", blob: "3468afb6b3485b1dd018f8a5dd02133f5d624309" }, images: { path: "research/results/ko-row-gate/data/selector/images", tree: "733f45874e58b8580d26a88603d385b13b5b783b" } },
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

// ------------------------------------------------------------------ checks (protocol 3.5)
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inside = (i, o) => i[0] >= o[0] && i[1] >= o[1] && i[2] <= o[2] && i[3] <= o[3];
export const REGISTERED_DIR = join(researchDir, "tools", "ko-header-column", "registered");
const COL_SHIFT = 260;
const TARGET_COLUMN_ITEMS = (id) => /^r[0-9]-t(val|aux)$/.test(id) || id === "h-target";
const COMP_COLUMN_ITEMS = (id) => /^r[0-9]-c(val|aux)$/.test(id) || id === "h-comp";
const ANS_ITEMS = (id) => /^r[0-9]-t(val|aux)$/.test(id);

/** Registered text and layout rules re-run on the rendered inks by the registered generator's own functions (render_check.py). */
function pythonRenderCheck(dir) {
  const script = join(researchDir, "tools", "ko-header-column", "render_check.py");
  let stdout = "";
  try {
    stdout = execFileSync("python", [script, "--data", dir], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" }, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    stdout = String(err.stdout || "");
    if (!stdout.trim()) throw new Error(`render_check.py failed: ${String(err.stderr || err.message).slice(0, 400)}`);
  }
  return JSON.parse(stdout);
}

export function runChecks(dir) {
  const rd = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const design = rd("scoring/design.json"), questions = rd("selector/questions.json").questions, gold = rd("scoring/gold.json").gold, render = rd("scoring/render.json").images, rc = rd("scoring/render-check.json");
  const problems = [];
  const p = (m) => problems.push(m);
  // 1 render validity
  if (rc.failedImages !== 0) p(`render-check failedImages ${rc.failedImages}`);
  const ims = design.images;
  // 2 assignment: generated design and questions are the registered bytes; selector questions in id order
  for (const [f, reg] of [["scoring/design.json", "design.json"], ["selector/questions.json", "questions.json"]]) {
    if (sha256(readFileSync(join(dir, f))) !== sha256(readFileSync(join(REGISTERED_DIR, reg)))) p(`${f} differs from registered/${reg}`);
  }
  if (ims.length !== PAGES) p(`${ims.length} design pages`);
  const byId = [...ims].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (JSON.stringify(questions.map((q) => [q.id, q.file, q.question])) !== JSON.stringify(byId.map((im) => [im.id, im.file, im.question]))) p("selector/questions.json differs from design.json in id order");
  if (JSON.stringify(byId.map((im) => im.id)) !== JSON.stringify(Array.from({ length: PAGES }, (_, i) => `p${String(i).padStart(3, "0")}`))) p("ids are not p000..p143");
  // 1 gold and inks
  const inksOf = {};
  ims.forEach((im) => {
    const g = gold[im.id];
    if (!g || g.parts.length !== 2 || g.parts[0].item !== im.anchorItem || g.parts[1].item !== im.valueItem) { p(`${im.id}: gold parts`); return; }
    const cells = Object.fromEntries(im.items.map((it) => [it.id, it.cell]));
    const inks = Object.fromEntries(Object.entries(render[im.id]?.items ?? {}).map(([k, v]) => [k, v.ink]));
    for (const it of im.items) if (!inks[it.id]) p(`${im.id}: ${it.id} has no ink`);
    if (im.items.some((it) => !inks[it.id])) return;
    if (Object.keys(inks).length !== im.items.length) p(`${im.id}: render has items not in the design`);
    inksOf[im.id] = inks;
    const [a, v] = g.parts.map((x) => x.rect);
    if (JSON.stringify(a) !== JSON.stringify(inks[im.anchorItem]) || JSON.stringify(v) !== JSON.stringify(inks[im.valueItem])) p(`${im.id}: gold differs from render ink`);
    const ids = Object.keys(inks);
    ids.forEach((k, i) => {
      const x = inks[k];
      if (!(x[0] < x[2] && x[1] < x[3])) p(`${im.id}: ${k} ink area`);
      if (!inside(x, [0, 0, im.page.width, im.page.height])) p(`${im.id}: ${k} ink outside the page`);
      if (!inside(x, cells[k])) p(`${im.id}: ${k} ink outside its cell`);
      for (const k2 of ids.slice(i + 1)) if (overlaps(x, inks[k2])) p(`${im.id}: inks of ${k} and ${k2} overlap`);
      for (const rl of im.rules) if (overlaps(x, rl)) p(`${im.id}: ${k} ink overlaps a rule`);
    });
  });
  // 3 uniqueness
  const fresh = ims.map((im) => ({ id: im.id, question: im.question, pngSha256: sha256(readFileSync(join(dir, "selector", "images", im.file))) }));
  if (new Set(fresh.map((x) => x.pngSha256)).size !== PAGES) p("PNG SHA-256 not unique");
  for (const x of fresh) if (render[x.id]?.sha256 !== x.pngSha256) p(`${x.id}: render.json PNG hash`);
  const qBySource = {};
  for (const im of ims) (qBySource[im.source] ??= new Set()).add(normalizeQuestion(im.question));
  const nq = ims.map((im) => normalizeQuestion(im.question));
  const qCounts = [...new Set(nq)].map((q) => nq.filter((x) => x === q).length);
  if (Object.keys(qBySource).length !== SOURCES || Object.values(qBySource).some((s) => s.size !== 1) || new Set(nq).size !== SOURCES || qCounts.some((k) => k !== 12)) p("normalized questions are not 12 distinct questions, one per source, 12 pages each");
  // 3 independent pairing on rendered inks
  const pairing = [];
  for (const src of Object.keys(qBySource)) {
    const pages = ims.filter((im) => im.source === src);
    const bad = [];
    const cellsSeen = pages.map((im) => im.cellName).sort().join(",");
    if (pages.length !== 12 || cellsSeen !== [...CELLS].sort().join(",")) bad.push("variants");
    const ref = pages[0];
    for (const im of pages) {
      for (const k of ["question", "answer", "qtype", "slot", "anchorItem", "valueItem", "compValueItem", "field", "compField"]) if (JSON.stringify(im[k]) !== JSON.stringify(ref[k])) bad.push(`${im.id} ${k}`);
      if (JSON.stringify(im.otherValueItems) !== JSON.stringify(ref.otherValueItems)) bad.push(`${im.id} otherValueItems`);
      const recs = (x) => x.items.filter((it) => it.id.startsWith("r")).map((it) => [it.id, it.role, it.text]);
      if (JSON.stringify(recs(im)) !== JSON.stringify(recs(ref))) bad.push(`${im.id} record items`);
      const want = im.header === "normal" ? [["h-label"], ["h-target", ref.field], ["h-comp", ref.compField]] : im.header === "blank" ? [["h-label"], ["h-comp", ref.compField]] : [["h-label"], ["h-target", ref.field], ["h-comp", ref.field]];
      const hs = im.items.filter((it) => it.role === "header").map((it) => (it.id === "h-label" ? [it.id] : [it.id, it.text]));
      if (JSON.stringify(hs) !== JSON.stringify(want)) bad.push(`${im.id} headers ${JSON.stringify(hs)}`);
      if (im.header === "blank") {
        const inkPx = blankCellInk(join(dir, "selector", "images", im.file), im.headerCells.target);
        if (inkPx !== 0) bad.push(`${im.id} blank target header cell has ${inkPx} dark pixels`);
      }
    }
    const inkOf = (im, id) => inksOf[im.id]?.[id];
    const base = pages.find((im) => im.cellName === "L-normal-same") ?? ref;
    for (const im of pages) {
      if (!inksOf[im.id] || !inksOf[base.id]) continue;
      for (const id of Object.keys(inksOf[im.id])) {
        const a = inkOf(base, id), b = inkOf(im, id);
        if (!a) continue; // h-target is absent in blank pages, title/header texts may differ in dup
        if (a[3] - a[1] !== b[3] - b[1] && id.startsWith("r")) bad.push(`${im.id} ${id} ink height`);
        if (!id.startsWith("r")) continue;
        const dx = TARGET_COLUMN_ITEMS(id) ? (im.side === "R" ? COL_SHIFT : 0) : COMP_COLUMN_ITEMS(id) ? (im.side === "R" ? -COL_SHIFT : 0) : 0;
        if (b[0] - a[0] !== dx || b[2] - a[2] !== dx) bad.push(`${im.id} ${id} ink x ${b[0]}-${b[2]} vs ${a[0]}-${a[2]} (dx ${dx})`);
        const sameAns = pages.find((x) => x.side === "L" && x.header === "normal" && x.ans === im.ans);
        const yRef = ANS_ITEMS(id) ? inkOf(sameAns, id) : a;
        if (yRef && (b[1] !== yRef[1] || b[3] !== yRef[3])) bad.push(`${im.id} ${id} ink y`);
      }
    }
    // L/R pairs: same source, header and ans; only value-column x differs
    for (const h of HEADERS) for (const a of ANS) {
      const L = pages.find((x) => x.side === "L" && x.header === h && x.ans === a), R = pages.find((x) => x.side === "R" && x.header === h && x.ans === a);
      if (!L || !R || !inksOf[L.id] || !inksOf[R.id]) { bad.push(`pair ${h}-${a} missing`); continue; }
      for (const id of Object.keys(inksOf[L.id])) {
        const l = inksOf[L.id][id], r = inksOf[R.id][id];
        if (!r) { bad.push(`pair ${h}-${a} ${id} missing on R`); continue; }
        const dx = TARGET_COLUMN_ITEMS(id) ? COL_SHIFT : COMP_COLUMN_ITEMS(id) ? -COL_SHIFT : 0;
        if (r[0] - l[0] !== dx || r[2] - l[2] !== dx || r[1] !== l[1] || r[3] !== l[3]) bad.push(`pair ${h}-${a} ${id}`);
      }
    }
    if (bad.length) p(`${src}: pairing ${bad.slice(0, 6).join("; ")}`);
    pairing.push({ source: src, pages: pages.map((im) => im.id), ok: bad.length === 0, problems: bad });
  }
  // 4, 5 registered text rules and layout on rendered inks
  const py = pythonRenderCheck(dir);
  for (const x of py.problems) p(`render_check: ${x}`);
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
    answers: sha256(Buffer.from(byId.map((im) => `${im.id}\t${im.answer}`).join("\n"), "utf8")),
  };
  const tally = (k) => ims.reduce((m, im) => ({ ...m, [im[k]]: (m[im[k]] ?? 0) + 1 }), {});
  const idealReasons = {};
  for (const [id, x] of Object.entries(py.ideal)) idealReasons[x.w4Reason] = (idealReasons[x.w4Reason] ?? 0) + 1;
  return {
    version: "ko-header-column-checks-1",
    ok: problems.length === 0,
    problems,
    pages: ims.length,
    sources: Object.keys(qBySource).length,
    grid: Object.fromEntries(["kind", "side", "header", "ans", "cellName", "slot", "qtype"].map((k) => [k, tally(k)])),
    renderFailedImages: rc.failedImages,
    measured: py.measured,
    idealW4Reasons: idealReasons,
    pairing,
    earlier: { counts: earlier.counts, comparedPages: earlier.rows.length, imageOverlap: dup.imageOverlap, questionOverlap: dup.questionOverlap, cohort149: { pages: cohortRows.length, imageOverlap: dup149.imageOverlap.length, questionOverlap: dup149.questionOverlap.length } },
    uniqueness: { pngSha256: new Set(fresh.map((x) => x.pngSha256)).size, normalizedQuestions: new Set(nq).size, pagesPerQuestion: [...new Set(qCounts)] },
    hashes,
    ideal: Object.fromEntries(byId.map((im) => [im.id, py.ideal[im.id] ?? null])),
  };
}

/** Dark pixels (value < 255) inside a cell of an 8-bit grayscale non-interlaced PNG (blank target-header cell must be empty). */
function blankCellInk(file, cell) {
  const px = decodeGray8(readFileSync(file));
  const [x0, y0, x1, y1] = cell;
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (px.data[y * px.width + x] < 255) n++;
  return n;
}
function decodeGray8(bytes) {
  const { width, height } = pngSize(bytes);
  if (bytes[24] !== 8 || bytes[25] !== 0 || bytes[28] !== 0) throw new Error("PNG is not 8-bit grayscale non-interlaced");
  const idat = [];
  let off = 8;
  while (off < bytes.length) {
    const len = bytes.readUInt32BE(off), type = bytes.subarray(off + 4, off + 8).toString("latin1");
    if (type === "IDAT") idat.push(bytes.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(width * height);
  let prev = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (width + 1)], row = raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), cur = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      const a = x ? cur[x - 1] : 0, b = prev[x], c = x ? prev[x - 1] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    data.set(cur, y * width);
    prev = cur;
  }
  return { width, height, data };
}

export function writeManifest(dir) {
  const files = {};
  for (const f of walk(dir).map((x) => relative(dir, x).split("\\").join("/")).filter((f) => f !== MANIFEST).sort()) {
    const b = readFileSync(join(dir, f));
    files[f] = { sha256: sha256(b), bytes: b.length };
  }
  const body = pretty({ version: "ko-header-column-manifest-1", hashBasis: "SHA-256 of raw file bytes", count: Object.keys(files).length, files });
  writeFileSync(join(dir, MANIFEST), body);
  return sha256(Buffer.from(body, "utf8"));
}

if (process.argv[1] && process.argv[1].endsWith("ko-header-column-data.mjs")) {
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
    console.log(JSON.stringify({ ok: out.ok, problemCount: out.problems.length, problems: out.problems.slice(0, 40), measured: out.measured, idealW4Reasons: out.idealW4Reasons, uniqueness: out.uniqueness, pairingOk: out.pairing.every((x) => x.ok), earlier: { counts: out.earlier.counts, image: out.earlier.imageOverlap.length, question: out.earlier.questionOverlap.length, cohort149: out.earlier.cohort149 } }));
    process.exitCode = out.ok ? 0 : 1;
  } else if (cmd === "manifest") {
    console.log(`manifest.json sha256 ${writeManifest(dir)}`);
  } else throw new Error(`unknown command ${cmd}`);
}
