// Product MCP view comparison preparer (protocol sections 4, 5, 9). Reads only Git blobs of the base commit, so the
// input bytes do not depend on the working copy's line endings. Two stages:
//   node src/mcp-view-comparison-prepare.mjs --stage originals --out <new dir>
//     -> <out>/input/{assignment.json, questions.json, images/original/*.png}, <out>/prepare-report.json
//   node src/mcp-view-comparison-prepare.mjs --stage finalize --out <dir> --rgb-manifest <rgb-manifest.json>
//     -> <out>/input/expected-sha.json after checking input/images/rgb against the manifest
// Scoring inputs are never read here. The R09 selector record is projected to id, matched and band.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE_COMMIT, R09_RAW_BLOB, buildKeys, checkKeys, checkPairs, pngIhdr, projectR09Raw, sha256, validateProjection } from "./mcp-view-comparison-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const stage = arg("--stage");
const out = arg("--out");
if (!out || !["originals", "finalize"].includes(stage)) throw new Error("--stage originals|finalize and --out are required");

const H = "research/results/r09-bilingual/heldout";
const git = (args, enc = "utf8") => execFileSync("git", args, { encoding: enc, maxBuffer: 64 * 1024 * 1024 });
const blobId = (path) => git(["rev-parse", `${BASE_COMMIT}:${path}`]).trim();
const blob = (path) => git(["cat-file", "blob", blobId(path)], "buffer");
const write = (p, s) => writeFileSync(p, s);

if (stage === "originals") {
  if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
  if (git(["cat-file", "-t", BASE_COMMIT]).trim() !== "commit") throw new Error("base commit missing");
  const freeze = JSON.parse(blob(`${H}/freeze-manifest.json`).toString("utf8"));

  // R09 selector code identity (it read only questions and pixels).
  const codeCheck = {};
  for (const f of ["src/r09-run.mjs", "src/selector.mjs"]) {
    const id = blobId(`research/${f}`);
    if (id !== freeze.code[f]) throw new Error(`R09 code ${f} blob ${id} differs from its freeze manifest`);
    codeCheck[f] = id;
  }

  // Manifest projection: ids, pairs, language, anchor, doctype, layout, seed, page. Nothing else is kept.
  const designBytes = blob(`${H}/design.json`);
  if (sha256(designBytes) !== freeze.inputs["design.json"]) throw new Error("design manifest differs from its freeze manifest");
  const design = JSON.parse(designBytes.toString("utf8"));
  const images = design.images.map((im) => ({ id: im.id, pairId: im.pairId, lang: im.lang, anchor: im.anchor, doctype: im.doctype, layout: im.layout, seed: im.seed, file: im.file, page: { width: im.page.width, height: im.page.height } }));
  const ids = images.map((im) => im.id);
  if (ids.length !== 48 || new Set(ids).size !== 48) throw new Error(`expected 48 distinct ids, got ${ids.length}`);
  const pairCount = checkPairs(images);
  if (pairCount !== 24) throw new Error(`expected 24 pairs, got ${pairCount}`);
  const keyCount = checkKeys(buildKeys(ids), ids);

  const questionsBytes = blob(`${H}/questions.json`);
  if (sha256(questionsBytes) !== freeze.inputs["questions.json"]) throw new Error("questions differ from their freeze manifest");
  const questions = JSON.parse(questionsBytes.toString("utf8")).questions;
  if (questions.map((q) => q.id).join() !== ids.join()) throw new Error("questions and manifest ids differ");
  for (const q of questions) if (q.file !== images.find((im) => im.id === q.id).file) throw new Error(`question file ${q.id}`);

  // R09 selector record: blob id fixed, projection allow-listed, checked before any run.
  const rawPath = `${H}/run-a/raw.jsonl`;
  if (blobId(rawPath) !== R09_RAW_BLOB) throw new Error(`R09 record blob is not ${R09_RAW_BLOB}`);
  const projection = projectR09Raw(blob(rawPath).toString("utf8"));
  const pages = Object.fromEntries(images.map((im) => [im.id, im.page]));
  const caller = Object.fromEntries([...validateProjection(ids, pages, projection)].sort(([a], [b]) => ids.indexOf(a) - ids.indexOf(b)));

  // Originals: 8-bit grayscale PNG only, hash fixed by the freeze manifest.
  mkdirSync(join(out, "input", "images", "original"), { recursive: true });
  const original = {};
  const ihdr = {};
  for (const im of images) {
    const bytes = blob(`${H}/images/${im.file}`);
    const s = sha256(bytes);
    if (s !== freeze.inputs[`images/${im.file}`]) throw new Error(`original ${im.id} differs from its freeze manifest`);
    const h = pngIhdr(bytes);
    if (h.bitDepth !== 8 || h.colorType !== 0) throw new Error(`investigation input changed: ${im.id} is bit depth ${h.bitDepth}, color type ${h.colorType}`);
    if (h.width !== im.page.width || h.height !== im.page.height) throw new Error(`original ${im.id} size differs from the manifest`);
    write(join(out, "input", "images", "original", `${im.id}.png`), bytes);
    original[im.id] = s;
    ihdr[`${h.width}x${h.height} bd${h.bitDepth} ct${h.colorType} il${h.interlace}`] = (ihdr[`${h.width}x${h.height} bd${h.bitDepth} ct${h.colorType} il${h.interlace}`] || 0) + 1;
  }
  write(join(out, "input", "questions.json"), questionsBytes);
  write(join(out, "input", "assignment.json"), `${JSON.stringify({ base: BASE_COMMIT, images: images.map(({ file, ...rest }) => rest), caller }, null, 1)}\n`);
  write(join(out, "original-sha.json"), `${JSON.stringify(original, null, 1)}\n`);

  const tally = (f) => images.reduce((o, im) => ((o[f(im)] = (o[f(im)] || 0) + 1), o), {});
  const matched = Object.values(caller).filter((c) => c.matched).length;
  write(join(out, "prepare-report.json"), `${JSON.stringify({
    base: BASE_COMMIT,
    blobs: { design: blobId(`${H}/design.json`), questions: blobId(`${H}/questions.json`), freezeManifest: blobId(`${H}/freeze-manifest.json`), r09Record: R09_RAW_BLOB },
    r09SelectorCode: { ...codeCheck, matchesFreezeManifest: true, inputsRead: "questions.json (id, file, question) and original pixels, per r09-run.mjs header and the R09 preregistration" },
    images: ids.length, pairs: pairCount, keys: keyCount,
    byLang: tally((im) => im.lang), byAnchor: tally((im) => im.anchor), byLangAnchor: tally((im) => `${im.lang}|${im.anchor}`), byDoctype: tally((im) => im.doctype), byLayout: tally((im) => im.layout),
    originalIhdr: ihdr, originalShaMatchesFreezeManifest: ids.length,
    projection: { fields: ["id", "matched", "band"], matched, unmatched: ids.length - matched, matchedByLangAnchor: tally((im) => (caller[im.id].matched ? `${im.lang}|${im.anchor}` : "unmatched")) },
  }, null, 1)}\n`);
  console.log(`prepared ${ids.length} images, ${pairCount} pairs, ${keyCount} keys, ${matched} matched`);
} else {
  const manifestFile = arg("--rgb-manifest");
  if (!manifestFile) throw new Error("--rgb-manifest is required");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const original = JSON.parse(readFileSync(join(out, "original-sha.json"), "utf8"));
  const ids = Object.keys(original);
  const dir = join(out, "input", "images", "rgb");
  const names = readdirSync(dir).sort();
  if (names.join() !== ids.map((id) => `${id}.png`).sort().join()) throw new Error("rgb folder does not hold exactly the original ids");
  if (Object.keys(manifest.images).sort().join() !== ids.slice().sort().join()) throw new Error("rgb manifest ids differ");
  const rgb = {};
  for (const id of ids) {
    const m = manifest.images[id];
    if (m.originalSha256 !== original[id]) throw new Error(`rgb manifest links ${id} to another original`);
    const s = sha256(readFileSync(join(dir, `${id}.png`)));
    if (s !== m.rgbSha256) throw new Error(`rgb ${id} sha ${s} differs from the manifest`);
    rgb[id] = s;
  }
  write(join(out, "input", "expected-sha.json"), `${JSON.stringify({ original, rgb }, null, 1)}\n`);
  console.log(`expected-sha.json written for ${ids.length} ids`);
}
