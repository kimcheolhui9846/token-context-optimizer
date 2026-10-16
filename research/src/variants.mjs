// Build the four input conditions from each clean PNG, then the arm inputs for every question
// (A, B, E for dev1; A, B, C, D, E for dev2, where C/D use the OCR selector and guard in selector.mjs).
// Values follow the image-first protocol: stress 1024 / q50, arm transform 1536 / q75, target JPEG 4:4:4 baseline.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { getSet } from "./env.mjs";
import { SELECTOR, SELECTOR_C1, covers, createOcr, guardFallback, select, selectWindow } from "./selector.mjs";
import { readJson, sha256, writeJson } from "./common.mjs";
import { ARM_TRANSFORM, CONDITIONS, JPEG_OPTS, STRESS, armTransform, cropTransform } from "./transforms.mjs";

export const ORACLE_PAD_CLEAN_PX = 48;

function scaledBox(evidence, scale, width, height) {
  const pad = ORACLE_PAD_CLEAN_PX;
  const x0 = Math.max(0, Math.floor((evidence[0] - pad) * scale));
  const y0 = Math.max(0, Math.floor((evidence[1] - pad) * scale));
  const x1 = Math.min(width, Math.ceil((evidence[0] + evidence[2] + pad) * scale));
  const y1 = Math.min(height, Math.ceil((evidence[1] + evidence[3] + pad) * scale));
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}

async function describe(bytes, mime) {
  const m = await sharp(bytes).metadata();
  return { mime, width: m.width, height: m.height, channels: m.channels, bytes: bytes.length, sha256: sha256(bytes) };
}

function save(rel, bytes) {
  const file = join(outDir, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, bytes);
  return rel;
}

const set = getSet();
const outDir = set.dir;
const withSelector = set.arms.includes("C");
const withWindow = set.arms.includes("C1");
const ocr = withSelector || withWindow ? await createOcr() : null;
const { families } = readJson(join(outDir, "families.json"));
const slots = [];
for (const fam of families) {
  const clean = readFileSync(join(outDir, fam.clean.file));
  for (const [condition, make] of Object.entries(CONDITIONS)) {
    const v = await make(clean);
    const ext = v.mime === "image/png" ? "png" : "jpg";
    const variantFile = save(`variants/${fam.id}/${condition}.${ext}`, v.bytes);
    const variant = { file: variantFile, ops: v.ops, ...(await describe(v.bytes, v.mime)) };
    const scale = variant.width / fam.clean.width;
    const armB = await armTransform(v.bytes);
    const fileB = set.arms.includes("B") || withSelector || withWindow ? save(`arms/${fam.id}/${condition}/B.jpg`, armB.bytes) : null;
    const lines = ocr ? await ocr.lines(v.bytes) : null;
    for (const q of fam.questions) {
      const box = scaledBox(q.evidence, scale, variant.width, variant.height);
      const crop = await sharp(v.bytes).extract(box).toBuffer();
      const armE = await armTransform(crop);
      const fileE = save(`arms/${fam.id}/${condition}/E-${q.id}.jpg`, armE.bytes);
      const base = { family: fam.id, domain: fam.domain, question: q.id, smallText: q.smallText, condition, variant: variantFile };
      slots.push({ ...base, arm: "A", file: variantFile, ops: [], ...(await describe(v.bytes, v.mime)) });
      if (set.arms.includes("B")) slots.push({ ...base, arm: "B", file: fileB, ops: armB.ops, ...(await describe(armB.bytes, "image/jpeg")) });
      slots.push({ ...base, arm: "E", file: fileE, ops: [`oracle crop ${box.width}x${box.height}+${box.left}+${box.top}`, ...armE.ops], ...(await describe(armE.bytes, "image/jpeg")) });
      if (withSelector) {
        const q2 = fam.questions.find((x) => x.id === q.id);
        const sel = select(lines, q2.text, variant.width, variant.height);
        const evidenceInVariant = q.evidence.map((n) => n * scale);
        const selection = { ...sel, evidenceCovered: sel.matched ? covers(sel.band, evidenceInVariant) : true };
        let fileC, armC;
        if (sel.matched) {
          armC = await armTransform(await sharp(v.bytes).extract(sel.band).toBuffer());
          armC.ops = [`select band ${sel.band.width}x${sel.band.height}+0+${sel.band.top}`, ...armC.ops];
          fileC = save(`arms/${fam.id}/${condition}/C-${q.id}.jpg`, armC.bytes);
        } else {
          armC = { bytes: armB.bytes, ops: ["select: no match -> full frame", ...armB.ops] };
          fileC = fileB;
        }
        slots.push({ ...base, arm: "C", file: fileC, ops: armC.ops, selection, ...(await describe(armC.bytes, "image/jpeg")) });
        if (guardFallback(sel)) slots.push({ ...base, arm: "D", file: variantFile, ops: ["guard fallback -> assigned original"], selection, fallback: true, ...(await describe(v.bytes, v.mime)) });
        else slots.push({ ...base, arm: "D", file: fileC, ops: ["guard accept", ...armC.ops], selection, fallback: false, ...(await describe(armC.bytes, "image/jpeg")) });
      }
      // Evaluation-only geometry: never sent to the model or used by a selector.
      const evidenceInVariant = q.evidence.map((n) => n * scale);
      if (withWindow) {
        const sel = selectWindow(lines, q.text, variant.width, variant.height);
        const selection = { ...sel, evidenceCovered: sel.matched ? covers(sel.band, evidenceInVariant) : true };
        const out = sel.matched ? await cropTransform(v.bytes, sel.band) : { bytes: armB.bytes, ops: ["select: no match -> full frame", ...armB.ops] };
        const fileC1 = sel.matched ? save(`arms/${fam.id}/${condition}/C1-${q.id}.jpg`, out.bytes) : fileB;
        slots.push({ ...base, arm: "C1", file: fileC1, ops: out.ops, selection, ...(await describe(out.bytes, "image/jpeg")) });
      }
      // C2 is built at run time: a low-detail locate call on the variant, then crop and the arm transform.
      if (set.arms.includes("C2")) slots.push({ ...base, arm: "C2", file: variantFile, ops: ["two-stage: low-detail locate on variant, crop, arm transform"], evidenceInVariant, ...(await describe(v.bytes, v.mime)) });
    }
    console.log(`${fam.id} ${condition}: ${variant.width}x${variant.height} ${variant.bytes} bytes`);
  }
}

writeJson(join(outDir, "slots.json"), {
  purpose: `thin-slice development set ${set.name}; arms ${set.arms.join(", ")}`,
  set: set.name,
  arms: set.arms,
  selector: withSelector ? SELECTOR : null,
  selectorC1: withWindow ? SELECTOR_C1 : null,
  stress: STRESS,
  armTransform: ARM_TRANSFORM,
  oraclePadCleanPx: ORACLE_PAD_CLEAN_PX,
  jpeg: JPEG_OPTS("<q>"),
  resize: "sharp default kernel (lanczos3), fit inside, no enlargement",
  slots,
});
console.log(`${slots.length} slots`);
if (ocr) await ocr.terminate();
