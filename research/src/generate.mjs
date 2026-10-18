// Render the development families to clean RGB PNGs (channels 3, no re-encoding afterwards).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { getSet } from "./env.mjs";
import { sha256, writeJson } from "./common.mjs";

const set = getSet();
const outDir = set.dir;
const { FAMILIES } = await import(set.families);
const cleanDir = join(outDir, "clean");
mkdirSync(cleanDir, { recursive: true });

const families = [];
for (const fam of FAMILIES) {
  const { svg, questions } = fam.build(fam.seed);
  const png = await sharp(Buffer.from(svg)).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.channels !== 3 || Math.max(meta.width, meta.height) !== 2048) {
    throw new Error(`${fam.id}: unexpected clean image ${meta.width}x${meta.height} channels ${meta.channels}`);
  }
  const file = join(cleanDir, `${fam.id}.png`);
  writeFileSync(file, png);
  families.push({
    id: fam.id,
    domain: fam.domain,
    layout: fam.layout ?? "base",
    seed: fam.seed,
    clean: { file: `clean/${fam.id}.png`, width: meta.width, height: meta.height, channels: meta.channels, bytes: png.length, sha256: sha256(png) },
    questions,
  });
  console.log(`${fam.id}: ${meta.width}x${meta.height} ${png.length} bytes`);
}

writeJson(join(outDir, "families.json"), {
  purpose: `thin-slice development set ${set.name}; not calibration, not held-out`,
  set: set.name,
  sharp: sharp.versions.sharp,
  vips: sharp.versions.vips,
  families,
});
