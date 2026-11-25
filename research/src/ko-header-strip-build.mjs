// ko-header-strip: build W1, W4 and W5 PNGs, coords.jsonl, manifest.json and inputs.json from the pinned #153 objects
// (protocol sections 4.1, 4.3, 5). Reads only the registered build allowlist; no gold, design, render, score or OCR text.
// Usage: node src/ko-header-strip-build.mjs --out <new dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ContractError, IntegrityError, compose, crop, plan, project } from "./ko-header-strip-plan.mjs";
import { decodeGray, encodeGray, pixelSha256, sha256, sharpVersions } from "./ko-header-strip-png.mjs";
import { REGISTERED, assertBuildAllowed, checkCommit, checkIds, git, imageEntries, makeReader, parseJsonl, readPinned, researchDir } from "./ko-header-strip-source.mjs";

const SRC = REGISTERED.source;
const CODE = ["ko-header-strip-build.mjs", "ko-header-strip-plan.mjs", "ko-header-strip-png.mjs", "ko-header-strip-source.mjs"];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Ordered keys of one coords row (RECOUNT_SPEC section 4). */
export function coordsRow(proj, pl) {
  return {
    id: proj.id, w5Reason: pl.reason, w5Kind: pl.kind, page: { width: proj.width, height: proj.height }, pngSha256: proj.pngSha256,
    w1: proj.w1, w4: proj.w4, B: pl.B, H: pl.H, t: pl.t, b: pl.b, p: pl.p, pieces: pl.pieces, display: pl.display,
  };
}

export async function build(out) {
  checkCommit();
  const reader = makeReader(assertBuildAllowed);
  const manifest = JSON.parse(readPinned(reader, "manifest").toString("utf8"));
  const predBytes = readPinned(reader, "predictions");
  const freeze = JSON.parse(readPinned(reader, "freeze").toString("utf8"));
  if (freeze.files["predictions.jsonl"] !== SRC.files.predictions.sha256) throw new IntegrityError("integrity_pin", "freeze predictions hash differs");
  const preds = parseJsonl(predBytes, "predictions.jsonl");
  checkIds(preds, "predictions.jsonl");
  const imgKeys = Object.keys(manifest.files).filter((k) => k.startsWith("selector/images/"));
  if (imgKeys.length !== 144) throw new IntegrityError("integrity_png", `manifest lists ${imgKeys.length} images`);
  const tree = imageEntries();
  if (tree.size !== 144) throw new IntegrityError("integrity_png", `image tree has ${tree.size} entries`);

  // Projection and plan for every row first: contract damage stops the run before any image is written.
  const plans = preds.map((pred) => { const proj = project(pred); return { proj, pl: plan(proj) }; });

  mkdirSync(out, { recursive: false });
  for (const d of ["w1", "w4", "w5"]) mkdirSync(join(out, d));
  const outputs = { w1: {}, w4: {}, w5: {} };
  const coords = [];
  for (const { proj, pl } of plans) {
    const file = `${proj.id}.png`;
    const m = manifest.files[`selector/images/${file}`];
    if (!m || !tree.has(file)) throw new IntegrityError("integrity_png", `${file} missing from manifest or tree`);
    const bytes = reader.readPath(`${SRC.imageTree.path}/${file}`, { blob: tree.get(file), sha256: m.sha256 });
    if (bytes.length !== m.bytes || sha256(bytes) !== proj.pngSha256) throw new IntegrityError("integrity_png", `${file}: bytes or prediction pngSha256 differ`);
    const src = await decodeGray(bytes);
    if (src.width !== proj.width || src.height !== proj.height) throw new IntegrityError("integrity_png", `${file}: ${src.width}x${src.height} != prediction size`);
    const write = async (kind, raw, w, h) => {
      const png = await encodeGray(raw, w, h);
      writeFileSync(join(out, kind, file), png);
      return { file: `${kind}/${file}`, bytes: png.length, sha256: sha256(png), width: w, height: h, pixelSha256: pixelSha256(raw) };
    };
    outputs.w1[proj.id] = proj.w1 ? await write("w1", crop(proj.w1, src.data, src.width), proj.w1.width, proj.w1.height) : null;
    outputs.w4[proj.id] = proj.w4 ? await write("w4", crop(proj.w4, src.data, src.width), proj.w4.width, proj.w4.height) : null;
    outputs.w5[proj.id] = pl.display ? await write("w5", compose(pl, src.data, src.width), pl.display.width, pl.display.height) : null;
    coords.push(coordsRow(proj, pl));
  }
  const coordsText = coords.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(join(out, "coords.jsonl"), coordsText);
  const v = sharpVersions();
  writeFileSync(join(out, "manifest.json"), JSON.stringify({
    version: "ko-header-strip-manifest-1",
    source: { commit: SRC.commit, imageTree: SRC.imageTree.tree, predictionsSha256: SRC.files.predictions.sha256 },
    tools: { node: process.version, sharp: v.sharp, libvips: v.libvips },
    coordsSha256: sha256(Buffer.from(coordsText)),
    outputs,
  }, null, 1) + "\n");
  const code = Object.fromEntries(CODE.map((f) => [f, sha256(readFileSync(join(researchDir, "src", f)))]));
  writeFileSync(join(out, "inputs.json"), JSON.stringify({
    version: "ko-header-strip-inputs-1",
    head: git(["rev-parse", "HEAD"], "utf8").trim(),
    code: Object.fromEntries(Object.entries(code).map(([f, h]) => [`research/src/${f}`, h])),
    reads: reader.log,
  }, null, 1) + "\n");
  return { coords, outputs };
}

if (process.argv[1] && process.argv[1].endsWith("ko-header-strip-build.mjs")) {
  const out = arg("--out");
  if (!out) { console.error("usage: --out <new dir>"); process.exit(2); }
  if (existsSync(out)) { console.error(`refusing: ${out} exists`); process.exit(2); }
  try {
    const { coords } = await build(out);
    const count = {};
    for (const r of coords) count[r.w5Reason] = (count[r.w5Reason] || 0) + 1;
    console.log(`done: 144 rows ${JSON.stringify(count)} coords ${sha256(readFileSync(join(out, "coords.jsonl"))).slice(0, 12)} manifest ${sha256(readFileSync(join(out, "manifest.json"))).slice(0, 12)}`);
  } catch (e) {
    if (e instanceof ContractError || e instanceof IntegrityError) {
      if (!existsSync(out)) mkdirSync(out);
      writeFileSync(join(out, "stop.json"), JSON.stringify({ code: e.code, message: e.message }, null, 1) + "\n");
      console.error(`stop: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}
