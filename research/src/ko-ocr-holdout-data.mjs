// ko-ocr-holdout: pre-freeze data checks and manifest (protocol research/plans/2026-11-24-ko-ocr-holdout-protocol.md, 3.4).
// No OCR and no selector here. Usage (from research/):
//   node src/ko-ocr-holdout-data.mjs same <dirA> <dirB>          all files byte-identical (determinism)
//   node src/ko-ocr-holdout-data.mjs check <dir> [--write]       checks 1-4; --write stores <dir>/checks.json
//   node src/ko-ocr-holdout-data.mjs manifest <dir> [--write]    per-file SHA-256; --write stores <dir>/manifest.json
//   node src/ko-ocr-holdout-data.mjs verify <dir>                files equal manifest.json (no missing, extra or changed file)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DOCTYPES = ["repair", "greenhouse", "rental"];
export const LAYOUTS = ["slip", "intake"];
export const ANCHORS = ["code", "nl"];
export const LANGS = ["en", "ko"];
export const SEEDS = [101, 211, 307, 401];
export const SPARE_SEEDS = [503, 601, 701, 809];
export const PAGE = { width: 1280, height: 960 };
export const CODE_PREFIX = { repair: "RP-", greenhouse: "GH-", rental: "RT-" };
export const RENDER_BLOB = "b61cd9b37803d8eb4b6b126a75301570c14ab11d";
export const FONT_SHA256 = "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0";
export const MANIFEST = "manifest.json";

// Prior sets for the overlap check (protocol 3.4 item 4). Git objects only.
export const PRIOR = {
  r09Heldout: { commit: "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1", dir: "research/results/r09-bilingual/heldout", design: "design.json" },
  r09Dev: { commit: "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1", dir: "research/results/r09-bilingual/dev", design: "design.json" },
  fcp: { commit: "708d9946ae091180a1b716baadfdd73fcfe5a19b", dir: "research/results/fresh-crop-padding/frozen/selector-input", design: "index.json" },
};

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const normQuestion = (s) => String(s).normalize("NFC").replace(/\s+/gu, " ").trim();
export const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;

/** The registered grid in registered order: combo -> seed position -> en, ko (protocol 3.1, 3.2). */
export function expectedGrid() {
  const out = [];
  let combo = 0;
  for (const doctype of DOCTYPES) for (const layout of LAYOUTS) for (const anchor of ANCHORS) {
    SEEDS.forEach((_, seedPosition) => {
      for (const lang of LANGS) out.push({ combo, doctype, layout, anchor, seedPosition, slot: (seedPosition + combo) % 4, lang });
    });
    combo++;
  }
  return out;
}
export const slotOf = (seedPosition, combo) => (seedPosition + combo) % 4;
export const comboKey = (g) => `${g.doctype}|${g.layout}|${g.anchor}|${g.seedPosition}`;
export const pageId = (g, seed) => `${g.doctype}-${g.layout}-${g.anchor}-s${seed}-${g.lang}`;

const inside = (a, c) => a[0] >= c[0] && a[1] >= c[1] && a[2] <= c[2] && a[3] <= c[3];

/**
 * Checks 1-3 (render, structure, duplicates) and 4 (prior overlap when `prior` is given).
 * Returns { problems: [string], pairProblems: { pairId: [string] }, counts }.
 * seedMap: optional { "<doctype>|<layout>|<anchor>|<seedPosition>": seed } used for spare seeds.
 */
export function checkData({ design, questions, renderCheck, gold, images, prior = null, seedMap = {} }) {
  const problems = [];
  const pairProblems = {};
  const pp = (pair, msg) => { (pairProblems[pair] ??= []).push(msg); };
  const grid = expectedGrid();
  const imgs = design?.images ?? [];
  const qs = questions?.questions ?? [];
  if (design?.font?.sha256 !== FONT_SHA256) problems.push("design font sha256 differs");
  if (imgs.length !== 96) problems.push(`design has ${imgs.length} pages, not 96`);
  if (qs.length !== 96) problems.push(`questions has ${qs.length} rows, not 96`);
  const ids = imgs.map((x) => x.id);
  if (new Set(ids).size !== ids.length) problems.push("duplicate page id");
  if (new Set(imgs.map((x) => x.file)).size !== imgs.length) problems.push("duplicate file name");
  // Grid and order.
  grid.forEach((g, i) => {
    const seed = seedMap[comboKey(g)] ?? SEEDS[g.seedPosition];
    const want = pageId(g, seed);
    const im = imgs[i], q = qs[i];
    if (!im) return;
    const pair = `${g.doctype}-${g.layout}-${g.anchor}-s${seed}`;
    if (im.id !== want) { problems.push(`page ${i}: id ${im.id}, expected ${want}`); return; }
    for (const [k, v] of Object.entries({ doctype: g.doctype, layout: g.layout, anchor: g.anchor, lang: g.lang, seed, seedPosition: g.seedPosition, combo: g.combo, slot: g.slot, pairId: pair, file: `${want}.png` })) {
      if (im[k] !== v) pp(pair, `${im.id}: ${k} ${JSON.stringify(im[k])} != ${JSON.stringify(v)}`);
    }
    if (im.page?.width !== PAGE.width || im.page?.height !== PAGE.height) pp(pair, `${im.id}: page size`);
    if (!q || q.id !== im.id || q.file !== im.file || q.question !== im.question || Object.keys(q).sort().join() !== "file,id,question") pp(pair, `${im.id}: questions.json row differs`);
    pageStructure(im, (m) => pp(pair, `${im.id}: ${m}`));
  });
  // Pair consistency en/ko.
  for (let i = 0; i + 1 < imgs.length; i += 2) {
    const [en, ko] = [imgs[i], imgs[i + 1]];
    if (!en || !ko || en.pairId !== ko.pairId) continue;
    const recs = (im) => JSON.stringify((im.records ?? []).map((r) => r.slot));
    if (en.slot !== ko.slot || en.code !== ko.code || recs(en) !== recs(ko)) pp(en.pairId, "en/ko slot, code or records differ");
    const codes = (im) => JSON.stringify(im.items.filter((t) => t.role === "code").map((t) => t.text));
    if (codes(en) !== codes(ko)) pp(en.pairId, "en/ko record codes differ");
  }
  // Render validity and gold.
  if (renderCheck?.failedImages !== 0) problems.push(`render-check failedImages ${renderCheck?.failedImages}`);
  for (const im of imgs) {
    const rc = renderCheck?.problems?.[im.id];
    if (rc && rc.length) pp(im.pairId, `${im.id}: render ${rc.join("; ")}`);
    const g = gold?.gold?.[im.id];
    if (!g || !Array.isArray(g.parts) || g.parts.length !== 2) { pp(im.pairId, `${im.id}: gold parts ${g?.parts?.length}`); continue; }
    if (g.parts[0].item !== im.anchorItem || g.parts[1].item !== im.valueItem) pp(im.pairId, `${im.id}: gold items differ from anchor/value`);
    if (g.answer !== im.answer) pp(im.pairId, `${im.id}: gold answer differs`);
    for (const p of g.parts) {
      const [l, t, r, b] = p.rect;
      const item = im.items.find((x) => x.id === p.item);
      if (![l, t, r, b].every(Number.isInteger) || !(l < r && t < b) || r - l !== p.size[0] || b - t !== p.size[1]) pp(im.pairId, `${im.id}: gold ${p.item} geometry`);
      if (l < 0 || t < 0 || r > PAGE.width || b > PAGE.height) pp(im.pairId, `${im.id}: gold ${p.item} outside page`);
      if (!item || !inside(p.rect, item.cell)) pp(im.pairId, `${im.id}: gold ${p.item} outside its cell`);
    }
  }
  // Duplicates within the set (check 3).
  const pngSha = new Map();
  for (const im of imgs) {
    const bytes = images?.get(im.file);
    if (!bytes) { problems.push(`${im.file}: image missing`); continue; }
    const s = sha256(bytes);
    if (pngSha.has(s)) pp(im.pairId, `${im.id}: PNG bytes equal ${pngSha.get(s)}`);
    else pngSha.set(s, im.id);
  }
  if (images && images.size !== imgs.length) problems.push(`images folder has ${images.size} files, design ${imgs.length}`);
  const nq = new Map();
  for (const im of imgs) {
    const k = normQuestion(im.question);
    if (nq.has(k)) pp(im.pairId, `${im.id}: question equals ${nq.get(k)}`);
    else nq.set(k, im.id);
  }
  // Prior overlap and novelty (check 4).
  const overlap = { png: [], question: [], doctype: [], layout: [] };
  if (prior) {
    for (const [s, id] of pngSha) if (prior.pngSha.has(s)) overlap.png.push(id);
    for (const [k, id] of nq) if (prior.questions.has(k)) overlap.question.push(id);
    for (const d of DOCTYPES) if (prior.doctypes.has(d)) overlap.doctype.push(d);
    for (const l of LAYOUTS) if (prior.layouts.has(l)) overlap.layout.push(l);
    for (const [k, v] of Object.entries(overlap)) if (v.length) problems.push(`prior overlap ${k}: ${v.join(", ")}`);
  }
  return {
    problems,
    pairProblems,
    counts: { pages: imgs.length, questions: qs.length, uniquePng: pngSha.size, uniqueQuestions: nq.size, priorPages: prior?.pngSha.size ?? null, priorQuestions: prior?.questions.size ?? null },
    overlap: prior ? overlap : null,
  };
}

/** Structure of one page (protocol 3.2): 4 records, unique codes/labels/values, question carries the anchor, answer = value. */
export function pageStructure(im, report) {
  const items = new Map((im.items ?? []).map((t) => [t.id, t]));
  if (items.size !== (im.items ?? []).length) report("duplicate item id");
  const recs = im.records ?? [];
  if (recs.length !== 4 || recs.map((r) => r.slot).join() !== "0,1,2,3") { report("records are not slots 0-3"); return; }
  const codes = [], labels = [], values = [];
  for (const r of recs) {
    const c = items.get(r.codeItem), l = items.get(r.labelItem), v = items.get(r.valueItem);
    if (!c || !l || !v || c.role !== "code" || l.role !== "label" || v.role !== "value") { report(`record ${r.slot} items`); return; }
    if (c.record !== r.slot || l.record !== r.slot || v.record !== r.slot) report(`record ${r.slot} item record index`);
    if (!new RegExp(`^${CODE_PREFIX[im.doctype]}\\d{4}$`).test(c.text)) report(`record ${r.slot} code format ${c.text}`);
    const others = (im.items ?? []).filter((t) => t.record === r.slot && t.role === "other");
    if (!others.length) report(`record ${r.slot} has no other field`);
    codes.push(c.text); labels.push(l.text); values.push(v.text);
  }
  for (const [name, arr] of [["code", codes], ["label", labels], ["value", values]]) if (new Set(arr).size !== 4) report(`${name}s not unique`);
  const target = recs[im.slot];
  if (!target) { report("slot outside records"); return; }
  const anchorItem = im.anchor === "code" ? target.codeItem : target.labelItem;
  if (im.anchorItem !== anchorItem || im.valueItem !== target.valueItem) report("anchor/value item is not the target record's");
  if (JSON.stringify(im.goldItems) !== JSON.stringify([anchorItem, target.valueItem])) report("goldItems");
  const anchorText = items.get(anchorItem)?.text ?? "";
  if (im.code !== items.get(target.codeItem).text || im.label !== items.get(target.labelItem).text) report("code/label fields differ from the target record");
  if (!anchorText || !String(im.question).includes(anchorText)) report("question does not carry the anchor text");
  for (const t of im.items ?? []) if (t.id !== anchorItem && t.text.includes(anchorText)) report(`anchor text is inside item ${t.id}`);
  if (im.answer !== items.get(target.valueItem).text) report("answer differs from the value item");
}

// ------------------------------------------------------------------ files
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split("\\").join("/"));
    }
  };
  walk(dir);
  return out.sort();
}
export function buildManifest(dir) {
  const files = listFiles(dir).filter((f) => f !== MANIFEST);
  return { hashBasis: "SHA-256 of raw file bytes", count: files.length, files: Object.fromEntries(files.map((f) => { const b = readFileSync(join(dir, f)); return [f, { sha256: sha256(b), bytes: b.length }]; })) };
}
/** Differences between a folder and its manifest: missing, extra, changed (by SHA-256 or size). */
export function verifyManifest(dir, manifest) {
  const have = new Set(listFiles(dir).filter((f) => f !== MANIFEST));
  const want = manifest.files ?? {};
  const missing = Object.keys(want).filter((f) => !have.has(f));
  const extra = [...have].filter((f) => !(f in want));
  const changed = Object.keys(want).filter((f) => have.has(f)).filter((f) => { const b = readFileSync(join(dir, f)); return sha256(b) !== want[f].sha256 || b.length !== want[f].bytes; });
  const countOk = manifest.count === Object.keys(want).length;
  return { ok: !missing.length && !extra.length && !changed.length && countOk, missing, extra, changed, countOk };
}
export function sameFolders(a, b) {
  const fa = listFiles(a), fb = listFiles(b);
  const onlyA = fa.filter((f) => !fb.includes(f)), onlyB = fb.filter((f) => !fa.includes(f));
  const differ = fa.filter((f) => fb.includes(f) && sha256(readFileSync(join(a, f))) !== sha256(readFileSync(join(b, f))));
  return { same: !onlyA.length && !onlyB.length && !differ.length, files: fa.length, onlyA, onlyB, differ };
}
export function readImagesDir(dir) {
  const m = new Map();
  if (!existsSync(dir)) return m;
  for (const f of readdirSync(dir).sort()) m.set(f, readFileSync(join(dir, f)));
  return m;
}

// ------------------------------------------------------------------ prior sets from Git objects
const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
export function readPrior() {
  const pngSha = new Set(), questions = new Set(), doctypes = new Set(), layouts = new Set();
  const perSet = {};
  for (const [name, p] of Object.entries(PRIOR)) {
    const q = JSON.parse(git(["show", `${p.commit}:${p.dir}/questions.json`], "utf8")).questions;
    for (const x of q) questions.add(normQuestion(x.question));
    const d = JSON.parse(git(["show", `${p.commit}:${p.dir}/${p.design}`], "utf8")).images;
    for (const x of d) { doctypes.add(x.doctype); layouts.add(x.layout); }
    const tree = git(["ls-tree", "--full-tree", `${p.commit}:${p.dir}/images`], "utf8").trim().split("\n");
    for (const row of tree) {
      const blob = row.split(/\s+/)[2];
      pngSha.add(sha256(git(["cat-file", "blob", blob])));
    }
    perSet[name] = { questions: q.length, images: tree.length };
  }
  return { pngSha, questions, doctypes, layouts, perSet };
}
export function rendererBlob() {
  return git(["hash-object", join(researchDir, "tools", "r09", "render.py")], "utf8").trim();
}

export function loadDataDir(dir) {
  const rd = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  return { design: rd("design.json"), questions: rd("questions.json"), renderCheck: rd("render-check.json"), gold: rd("gold.json"), images: readImagesDir(join(dir, "images")), seedMap: existsSync(join(dir, "seed-map.json")) ? rd("seed-map.json") : {} };
}

// ------------------------------------------------------------------ CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  const write = process.argv.includes("--write");
  if (cmd === "same") {
    const r = sameFolders(a, b);
    console.log(JSON.stringify(r));
    process.exitCode = r.same ? 0 : 1;
  } else if (cmd === "check") {
    const blob = rendererBlob();
    const data = loadDataDir(a);
    const prior = readPrior();
    const r = checkData({ ...data, prior });
    if (blob !== RENDER_BLOB) r.problems.push(`render.py blob ${blob} != ${RENDER_BLOB}`);
    const out = { protocol: "research/plans/2026-11-24-ko-ocr-holdout-protocol.md 3.4", rendererBlob: blob, seedMap: data.seedMap, prior: prior.perSet, ...r, passed: !r.problems.length && !Object.keys(r.pairProblems).length };
    if (write) writeFileSync(join(a, "checks.json"), pretty(out));
    console.log(JSON.stringify({ passed: out.passed, problems: r.problems, pairProblems: r.pairProblems, counts: r.counts }));
    process.exitCode = out.passed ? 0 : 1;
  } else if (cmd === "manifest") {
    const m = buildManifest(a);
    if (write) writeFileSync(join(a, MANIFEST), pretty(m));
    console.log(JSON.stringify({ count: m.count, sha256: sha256(Buffer.from(pretty(m))) }));
  } else if (cmd === "verify") {
    const r = verifyManifest(a, JSON.parse(readFileSync(join(a, MANIFEST), "utf8")));
    console.log(JSON.stringify(r));
    process.exitCode = r.ok ? 0 : 1;
  } else {
    console.error("usage: same <a> <b> | check <dir> [--write] | manifest <dir> [--write] | verify <dir>");
    process.exitCode = 2;
  }
}
