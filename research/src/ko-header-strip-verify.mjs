// ko-header-strip: verification path 1 (protocol 5.4). Re-decodes every written PNG and compares it with pixels
// rebuilt from the source page using only the coords pieces (not the build's compose()). Also re-derives coords
// from the predictions and checks the manifest file and pixel hashes.
// Usage: node src/ko-header-strip-verify.mjs --build <dir> --out <verify.json> [--w5-only]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { plan, project } from "./ko-header-strip-plan.mjs";
import { decodeGray } from "./ko-header-strip-png.mjs";
import { REGISTERED, assertBuildAllowed, checkCommit, checkIds, imageEntries, makeReader, parseJsonl, readPinned } from "./ko-header-strip-source.mjs";
import { coordsRow } from "./ko-header-strip-build.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const LUMA = REGISTERED.strip.separatorLuma;

/** Expected output pixels from pieces, written independently of compose(). */
function expectFromPieces(c, src, W) {
  const out = [];
  for (const pc of c.pieces) {
    if (pc.kind === "separator") {
      if (pc.displayRect[3] - pc.displayRect[1] !== LUMA.length || JSON.stringify(pc.luma) !== JSON.stringify(LUMA)) throw new Error(`${c.id}: separator differs from registration`);
      for (const v of pc.luma) out.push(Buffer.alloc(c.display.width, v));
    } else {
      const [x0, y0, x1, y1] = pc.sourceRect;
      for (let y = y0; y < y1; y++) out.push(src.subarray(y * W + x0, y * W + x1));
    }
  }
  return Buffer.concat(out);
}
function structure(c) {
  const bad = [];
  const src = c.pieces.filter((p) => p.kind === "source");
  for (let i = 1; i < src.length; i++) if (src[i].sourceRect[1] < src[i - 1].sourceRect[3]) bad.push("source rows overlap or out of order");
  if (new Set(src.map((p) => `${p.sourceRect[0]},${p.sourceRect[2]}`)).size > 1) bad.push("x ranges differ");
  let y = 0;
  for (const p of c.pieces) { if (p.displayRect[1] !== y) bad.push("display rows not contiguous"); y = p.displayRect[3]; }
  if (c.display && y !== c.display.height) bad.push("display height");
  if (c.B && src.some((p) => p.displayRect[0] !== p.sourceRect[0] - c.B[0])) bad.push("display x != source x - B.left");
  return bad;
}

export async function verify(buildDir, w5Only) {
  checkCommit();
  const reader = makeReader(assertBuildAllowed);
  const manifest153 = JSON.parse(readPinned(reader, "manifest").toString("utf8"));
  const preds = parseJsonl(readPinned(reader, "predictions"), "predictions.jsonl");
  const coords = parseJsonl(readFileSync(join(buildDir, "coords.jsonl")), "coords.jsonl");
  checkIds(coords, "coords.jsonl");
  const man = JSON.parse(readFileSync(join(buildDir, "manifest.json"), "utf8"));
  const tree = imageEntries();
  const problems = [];
  const counts = { coordsRows: 0, w1: 0, w4: 0, w5: 0, w1FilesChecked: 0, w4FilesChecked: 0, w5KeptEqualW1: 0 };
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i], pred = preds[i];
    const derived = coordsRow(project(pred), plan(project(pred)));
    if (JSON.stringify(derived) !== JSON.stringify(c)) problems.push({ id: c.id, what: "coords differ from re-derived plan" });
    else counts.coordsRows++;
    for (const s of structure(c)) problems.push({ id: c.id, what: s });
    const file = `${c.id}.png`;
    const bytes = reader.readPath(`${REGISTERED.source.imageTree.path}/${file}`, { blob: tree.get(file), sha256: manifest153.files[`selector/images/${file}`].sha256 });
    const src = await decodeGray(bytes);
    const expect = {
      w1: c.w1 ? expectFromPieces({ ...c, pieces: [{ kind: "source", sourceRect: [c.w1.left, c.w1.top, c.w1.left + c.w1.width, c.w1.top + c.w1.height] }], display: c.w1 }, src.data, src.width) : null,
      w4: c.w4 ? expectFromPieces({ ...c, pieces: [{ kind: "source", sourceRect: [c.w4.left, c.w4.top, c.w4.left + c.w4.width, c.w4.top + c.w4.height] }], display: c.w4 }, src.data, src.width) : null,
      w5: c.display ? expectFromPieces(c, src.data, src.width) : null,
    };
    for (const k of ["w1", "w4", "w5"]) {
      const e = man.outputs[k][c.id];
      if (!expect[k]) { if (e !== null) problems.push({ id: c.id, what: `${k} manifest entry for no output` }); continue; }
      if (!e || e.pixelSha256 !== sha256(expect[k])) { problems.push({ id: c.id, what: `${k} manifest pixel hash` }); continue; }
      const path = join(buildDir, e.file);
      if (!existsSync(path)) { if (k === "w5" || !w5Only) problems.push({ id: c.id, what: `${k} file missing` }); else counts[k]++; continue; }
      const png = readFileSync(path);
      if (png.length !== e.bytes || sha256(png) !== e.sha256) { problems.push({ id: c.id, what: `${k} file hash` }); continue; }
      const d = await decodeGray(png);
      if (d.width !== e.width || d.height !== e.height || !d.data.equals(expect[k])) { problems.push({ id: c.id, what: `${k} pixels` }); continue; }
      counts[k]++; if (k !== "w5") counts[`${k}FilesChecked`]++;
    }
    if (pred.w4Reason !== "applied" && c.display && man.outputs.w5[c.id].pixelSha256 === man.outputs.w1[c.id].pixelSha256
      && man.outputs.w5[c.id].width === c.w1.width && man.outputs.w5[c.id].height === c.w1.height) counts.w5KeptEqualW1++;
  }
  const coordsSha = sha256(readFileSync(join(buildDir, "coords.jsonl")));
  if (man.coordsSha256 !== coordsSha) problems.push({ id: null, what: "manifest coordsSha256" });
  return { ok: problems.length === 0, counts, problems, coordsSha256: coordsSha };
}

if (process.argv[1] && process.argv[1].endsWith("ko-header-strip-verify.mjs")) {
  const build = arg("--build"), out = arg("--out");
  if (!build || !out) { console.error("usage: --build <dir> --out <file> [--w5-only]"); process.exit(2); }
  if (existsSync(out)) { console.error(`refusing: ${out} exists`); process.exit(2); }
  const r = await verify(build, process.argv.includes("--w5-only"));
  writeFileSync(out, JSON.stringify(r, null, 1) + "\n");
  console.log(JSON.stringify({ ok: r.ok, counts: r.counts, problems: r.problems.length }));
  process.exit(r.ok ? 0 : 1);
}
