// R09 replay check (pre-measurement amendment 1). Feeds each saved selector result through the existing physical
// transform path and checks the output. Separate from the primary metric: it never changes a category or denominator.
//   matched   -> transforms.mjs cropTransform(original, band)  (crop, <=1536 fit, JPEG q75)
//   no match  -> transforms.mjs armTransform(original)         (full frame, <=1536 fit, JPEG q75)
//   technical failure -> not replayed (counted as such)
// Usage: node src/r09-replay.mjs --questions <questions.json> --images <dir> --raw <raw.jsonl> --out <dir>
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ARM_TRANSFORM, armTransform, cropTransform } from "./transforms.mjs";

/** Expected output size: the region scaled to fit inside ARM_TRANSFORM.longSide without enlargement. */
export function expectedSize(w, h, longSide = ARM_TRANSFORM.longSide) {
  const s = Math.min(1, longSide / Math.max(w, h));
  return s === 1 ? { width: w, height: h } : { width: Math.round(w * s), height: Math.round(h * s) };
}

export async function replayOne(rec, original) {
  if (rec.status !== "ok") return { id: rec.id, path: "not_replayed", valid: null };
  const meta = await sharp(original).metadata();
  const region = rec.matched ? rec.band : { left: 0, top: 0, width: meta.width, height: meta.height };
  const out = rec.matched ? await cropTransform(original, rec.band) : await armTransform(original);
  const got = await sharp(out.bytes).metadata();
  const want = expectedSize(region.width, region.height);
  const valid = got.format === "jpeg" && got.width === want.width && got.height === want.height && out.bytes.length > 0;
  return { id: rec.id, path: rec.matched ? "cropTransform" : "armTransform", ops: out.ops, format: got.format, width: got.width, height: got.height, expected: want, bytes: out.bytes.length, sha256: createHash("sha256").update(out.bytes).digest("hex"), valid };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
  const [qF, imgDir, rawF, out] = ["--questions", "--images", "--raw", "--out"].map(arg);
  if (!qF || !imgDir || !rawF || !out) throw new Error("--questions, --images, --raw and --out are required");
  const files = new Map(JSON.parse(readFileSync(qF, "utf8")).questions.map((q) => [q.id, q.file]));
  const raw = readFileSync(rawF, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const rows = [];
  for (const rec of raw) rows.push(await replayOne(rec, readFileSync(join(imgDir, files.get(rec.id)))));
  const count = (f) => rows.filter(f).length;
  const summary = { records: rows.length, cropTransform: count((r) => r.path === "cropTransform"), armTransform: count((r) => r.path === "armTransform"), notReplayed: count((r) => r.path === "not_replayed"), valid: count((r) => r.valid === true), invalid: count((r) => r.valid === false) };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "replay.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  writeFileSync(join(out, "replay-summary.json"), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(JSON.stringify(summary));
  if (summary.invalid) process.exit(1);
}
