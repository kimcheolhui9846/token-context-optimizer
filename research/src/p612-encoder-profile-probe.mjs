// 6.12 paper reflection probe: do the JPEG bytes the research path actually sent fit the product input profiles?
//
// 1. Experiment 2 held-out: re-create every JPEG recorded in slots-exp2-heldout.json (condition variants, arm B,
//    C/D window crops, E oracle crops) with the frozen research code, and keep only files whose SHA-256 matches the
//    recorded value. Those exact bytes are then checked with the product strict and tolerant JPEG validators.
// 2. RQ1 JPEG resend: the 7 JPEG q75 images (grid 4:3) are re-created with rq1-sweep.mjs's makeImage logic. The
//    original files were not kept (rq1-sweep-001 README), so this checks the encoder settings, not the sent bytes.
//
// Usage: node research/src/p612-encoder-profile-probe.mjs <checkout-with-dist> [--out <file>]
// Reads only; no API calls. Product code is loaded from the built dist of the given checkout.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { FAMILIES } from "./families-exp2-heldout.mjs";
import { CONDITIONS, armTransform, cropTransform } from "./transforms.mjs";

const checkout = resolve(process.argv[2] ?? ".");
const jv = await import(pathToFileURL(resolve(checkout, "dist/src/core/jpeg-validation.js")).href);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const slotsPath = new URL("../results/exp2-heldout/slots-exp2-heldout.json", import.meta.url);
const slotsFile = readFileSync(slotsPath);
const { slots } = JSON.parse(slotsFile);

// Control: the same bytes with a JFIF 1.01 APP0 segment inserted right after SOI (no other change).
const JFIF_APP0 = Buffer.from("ffe000104a46494600010100000100010000", "hex");
const hasApp0First = (b) => b[2] === 0xff && b[3] === 0xe0;
function check(bytes) {
  const out = { app0First: hasApp0First(bytes) };
  try { const m = jv.validateJpeg(bytes); out.strict = { ok: true, profile: m.profile ?? m.validationProfile ?? null }; }
  catch (e) { out.strict = { ok: false, code: e.code ?? String(e) }; }
  try {
    const m = jv.validateJpegTolerant(bytes);
    out.tolerant = { ok: true, coding: m.coding, sampling: m.sampling, ignoredSegments: m.ignoredSegments, exifOrientation: m.exifOrientation ?? null };
  } catch (e) { out.tolerant = { ok: false, code: e.code ?? String(e) }; }
  if (!out.app0First) {
    try { jv.validateJpeg(Buffer.concat([bytes.subarray(0, 2), JFIF_APP0, bytes.subarray(2)])); out.strictWithApp0 = "pass"; }
    catch (e) { out.strictWithApp0 = e.code ?? String(e); }
  }
  return out;
}
const tally = (rows, keyFn) => rows.reduce((a, r) => { const k = keyFn(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});

// --- 1. Experiment 2 held-out
const cleanCache = new Map();
const variantCache = new Map();
async function clean(familyId) {
  if (!cleanCache.has(familyId)) {
    const fam = FAMILIES.find((f) => f.id === familyId);
    const { svg } = fam.build(fam.seed);
    cleanCache.set(familyId, await sharp(Buffer.from(svg)).removeAlpha().png({ compressionLevel: 9 }).toBuffer());
  }
  return cleanCache.get(familyId);
}
async function variant(slot) {
  const key = `${slot.family}/${slot.condition}`;
  if (!variantCache.has(key)) variantCache.set(key, (await CONDITIONS[slot.condition](await clean(slot.family))).bytes);
  return variantCache.get(key);
}
const CROP = /(?:^|\s)crop (\d+)x(\d+)\+(\d+)\+(\d+)$/;
async function rebuild(slot) {
  const v = await variant(slot);
  if (slot.arm === "A") return v;
  const cropOp = slot.ops.map((o) => o.match(CROP)).find(Boolean);
  if (cropOp) {
    const [, width, height, left, top] = cropOp.map(Number);
    return (await cropTransform(v, { left, top, width, height })).bytes;
  }
  return (await armTransform(v)).bytes;
}

const unique = new Map();
for (const slot of slots) {
  if (slot.mime !== "image/jpeg") continue;
  if (!unique.has(slot.sha256)) unique.set(slot.sha256, { slot, arms: new Set(), slotCount: 0 });
  const u = unique.get(slot.sha256);
  u.arms.add(slot.arm);
  u.slotCount += 1;
}
const exp2Rows = [];
for (const [recorded, { slot, arms, slotCount }] of unique) {
  const bytes = await rebuild(slot);
  const kind = slot.arm === "A" ? `variant:${slot.condition}` : slot.ops.some((o) => CROP.test(o)) ? (slot.ops.some((o) => o.startsWith("oracle")) ? "oracle-crop" : "window-crop") : "full-frame";
  const meta = await sharp(bytes).metadata();
  exp2Rows.push({
    file: slot.file, kind, arms: [...arms].sort().join(""), slotCount, recordedSha256: recorded, reproduced: sha(bytes) === recorded,
    width: meta.width, height: meta.height, sharpChroma: meta.chromaSubsampling, sharpProgressive: meta.isProgressive, ...check(bytes),
  });
}
const matched = exp2Rows.filter((r) => r.reproduced);
const exp2 = {
  slotsSha256: sha(slotsFile),
  jpegSlots: slots.filter((s) => s.mime === "image/jpeg").length,
  uniqueJpegFiles: exp2Rows.length,
  reproducedFiles: matched.length,
  notReproduced: exp2Rows.filter((r) => !r.reproduced).map((r) => r.file),
  slotsCoveredByReproducedFiles: matched.reduce((a, r) => a + r.slotCount, 0),
  byKind: tally(exp2Rows, (r) => r.kind),
  strict: tally(matched, (r) => (r.strict.ok ? "pass" : `reject:${r.strict.code}`)),
  tolerant: tally(matched, (r) => (r.tolerant.ok ? `pass:${r.tolerant.coding}:${r.tolerant.sampling}:ignored=${r.tolerant.ignoredSegments.join("+") || "none"}` : `reject:${r.tolerant.code}`)),
  app0First: tally(matched, (r) => String(r.app0First)),
  strictWithInsertedApp0: tally(matched, (r) => r.strictWithApp0 ?? "n/a"),
  sharpChroma: tally(matched, (r) => `${r.sharpChroma}:progressive=${r.sharpProgressive}`),
  maxPixels: Math.max(...matched.map((r) => r.width * r.height)),
  tolerantRejected: matched.filter((r) => !r.tolerant.ok).map(({ file, kind, tolerant }) => ({ file, kind, tolerant })),
};

// --- 2. RQ1 JPEG resend (encoder settings only; original files not kept)
async function rq1Image(w, h) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#f4f4f4"/><g stroke="#999" stroke-width="1">${Array.from({ length: 8 }, (_, i) => `<line x1="${(w * i) / 8}" y1="0" x2="${(w * i) / 8}" y2="${h}"/>`).join("")}</g><text x="10" y="${Math.min(40, h - 4)}" font-size="${Math.max(8, Math.min(32, h / 4))}" fill="#222">${w}x${h}</text></svg>`;
  return sharp(Buffer.from(svg)).removeAlpha().jpeg({ quality: 75 }).toBuffer();
}
const rq1Rows = [];
for (const L of [256, 512, 768, 1024, 1536, 2048, 3072]) {
  const w = L, h = Math.round((L * 3) / 4);
  const bytes = await rq1Image(w, h);
  const meta = await sharp(bytes).metadata();
  rq1Rows.push({ w, h, sha256: sha(bytes), sharpChroma: meta.chromaSubsampling, sharpProgressive: meta.isProgressive, ...check(bytes) });
}
const rq1 = {
  app0First: tally(rq1Rows, (r) => String(r.app0First)),
  strictWithInsertedApp0: tally(rq1Rows, (r) => r.strictWithApp0 ?? "n/a"),
  note: "re-created with rq1-sweep.mjs makeImage logic (jpeg quality 75, no chroma option); sent bytes were not kept",
  strict: tally(rq1Rows, (r) => (r.strict.ok ? "pass" : `reject:${r.strict.code}`)),
  tolerant: tally(rq1Rows, (r) => (r.tolerant.ok ? `pass:${r.tolerant.coding}:${r.tolerant.sampling}:ignored=${r.tolerant.ignoredSegments.join("+") || "none"}` : `reject:${r.tolerant.code}`)),
  rows: rq1Rows,
};

const report = {
  schema: "p612-encoder-profile-probe/v1",
  productJpegValidationSha256: sha(readFileSync(resolve(checkout, "src/core/jpeg-validation.ts"), "utf8").replace(/\r\n/g, "\n")),
  sharp: sharp.versions.sharp, vips: sharp.versions.vips, node: process.version,
  exp2, rq1,
  // One compact row per unique file: file, kind, arms, slots, sha256, reproduced, WxH, app0First, strict, strictWithInsertedApp0, tolerant.
  exp2Files: exp2Rows.map((r) => [r.file, r.kind, r.arms, r.slotCount, r.recordedSha256, r.reproduced, `${r.width}x${r.height}`,
    r.app0First, r.strict.ok ? "pass" : r.strict.code, r.strictWithApp0 ?? "n/a", r.tolerant.ok ? `${r.tolerant.coding}:${r.tolerant.sampling}` : r.tolerant.code]),
};
const { exp2Files, ...head } = report;
const text = `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "exp2Files": [\n${exp2Files.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`;
JSON.parse(text);
const out = process.argv.indexOf("--out");
if (out > 0) writeFileSync(resolve(process.cwd(), process.argv[out + 1]), text);
else process.stdout.write(text);
