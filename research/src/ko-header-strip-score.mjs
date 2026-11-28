// ko-header-strip: first scoring after the W5 build is committed and pushed (protocol 4.2 step 4, section 6, 7).
// Usage: node src/ko-header-strip-score.mjs --build <build dir> --out <new dir>
// Opens #153 design/gold/render (hash-checked against the pinned manifest) and the #153 score rows only here.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTERED, checkCommit, checkIds, git, makeReader, parseJsonl, readPinned } from "./ko-header-strip-source.mjs";
import { referenceDiff, scorePage, summarize } from "./ko-header-strip-score-lib.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const SRC = REGISTERED.source;
const PUBLISHED = "research/results/ko-header-strip/build-a";
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };

function headBlob(path) {
  try { return git(["show", `HEAD:${path}`]); } catch { return null; }
}

export function scoreAll(buildDir, startedUtc) {
  checkCommit();
  const coordsBytes = readFileSync(join(buildDir, "coords.jsonl"));
  const manifestBytes = readFileSync(join(buildDir, "manifest.json"));
  const headCoords = headBlob(`${PUBLISHED}/coords.jsonl`), headManifest = headBlob(`${PUBLISHED}/manifest.json`);
  const buildMatchesHead = !!headCoords && !!headManifest && headCoords.equals(coordsBytes) && headManifest.equals(manifestBytes);
  const coords = parseJsonl(coordsBytes, "coords.jsonl");
  checkIds(coords, "coords.jsonl");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));

  const reader = makeReader(() => true);
  const dataManifest = JSON.parse(readPinned(reader, "manifest").toString("utf8"));
  const preds = parseJsonl(readPinned(reader, "predictions"), "predictions.jsonl");
  const summary153 = JSON.parse(readPinned(reader, "summary").toString("utf8"));
  const scoring = (name, key) => JSON.parse(reader.readPath(SRC.scoringFiles[name], { sha256: dataManifest.files[key].sha256 }).toString("utf8"));
  const design = scoring("design", "scoring/design.json");
  const gold = scoring("gold", "scoring/gold.json");
  const render = scoring("render", "scoring/render.json");
  const ref = parseJsonl(reader.readPath(SRC.scoringFiles.score, {}), "score.jsonl");
  checkIds(ref, "#153 score.jsonl");

  const designById = new Map(design.images.map((d) => [d.id, d]));
  const fixed = new Set(REGISTERED.fixed22);
  const rows = [], refBad = [];
  coords.forEach((c, i) => {
    const d = designById.get(c.id), ink = render.images[c.id].items, g = gold.gold[c.id];
    if (!d || preds[i].id !== c.id || ref[i].id !== c.id) throw new Error(`${c.id}: join failed`);
    for (const part of g.parts) if (JSON.stringify(ink[part.item].ink) !== JSON.stringify(part.rect)) throw new Error(`${c.id}: gold ${part.item} differs from render ink`);
    if (g.parts.map((p) => p.item).join() !== [d.anchorItem, d.valueItem].join()) throw new Error(`${c.id}: gold parts are not anchor+value`);
    const row = scorePage(c, d, ink, preds[i], ref[i], fixed);
    const bad = referenceDiff(row, ref[i]);
    if (bad.length) refBad.push({ id: c.id, fields: bad });
    rows.push(row);
  });

  const applied = preds.filter((p) => p.w4Reason === "applied").map((p) => p.id);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const j4 = rows.filter((r) => r.event4).map((r) => r.id);
  const newE1W4 = rows.filter((r) => r.reading && r.reading.e1.w4 && !r.reading.e1.w1).map((r) => r.id);
  const fixed22Equal = [applied, summary153.lists.applied, summary153.lists.event4, summary153.lists.readingNewE1W4, j4, newE1W4].every((l) => same(l, REGISTERED.fixed22));
  const w1KeptPixelMismatch = preds.filter((p) => p.w4Reason !== "applied").map((p) => p.id).filter((id) => {
    const a = manifest.outputs.w1[id], b = manifest.outputs.w5[id];
    return !a || !b || a.pixelSha256 !== b.pixelSha256 || a.width !== b.width || a.height !== b.height;
  });
  const sources = design.sources.map((s) => s.source);
  const summary = summarize(rows, {
    fixed22: REGISTERED.fixed22, sources, w1KeptPixelMismatch, pageArea: coords[0].page.width * coords[0].page.height,
    buildCommit: git(["rev-parse", "HEAD"], "utf8").trim(), coordsSha256: sha256(coordsBytes), startedUtc,
    checks: { referenceW1W4: refBad.length === 0, fixed22Equal, buildMatchesHead, manifestCoords: manifest.coordsSha256 === sha256(coordsBytes) },
  });
  return { rows, summary, refBad, reads: reader.log, buildMatchesHead };
}

if (process.argv[1] && process.argv[1].endsWith("ko-header-strip-score.mjs")) {
  const startedUtc = new Date().toISOString();
  const build = arg("--build"), out = arg("--out");
  if (!build || !out) { console.error("usage: --build <dir> --out <new dir>"); process.exit(2); }
  if (existsSync(out)) { console.error(`refusing: ${out} exists`); process.exit(2); }
  const { rows, summary, refBad, reads, buildMatchesHead } = scoreAll(build, startedUtc);
  mkdirSync(out);
  writeFileSync(join(out, "score.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  writeFileSync(join(out, "score-meta.json"), JSON.stringify({ startedUtc, head: summary.buildCommit, buildMatchesHead, referenceMismatches: refBad, reads }, null, 1) + "\n");
  const v = summary.verdict, t = summary.groups.total;
  console.log(`done: strict W1 ${t.strict.w1} W4 ${t.strict.w4} W5 ${t.strict.w5} /144; L5 ${t.L5.count}/${t.L5.denom}; J4 ${t.J4} J5 ${t.J5} kept ${t.J4kept.count}; reexposed ${t.reexposed.items}; fixed22 E1 W5 ${v.C2.fixedE1W5} fourItems ${v.C2.fourItems}/${v.C2.of}; verdict ${v.status} ${JSON.stringify(v.failed)}`);
  if (refBad.length) { console.error(`reference mismatches: ${JSON.stringify(refBad.slice(0, 5))}`); process.exit(1); }
}
