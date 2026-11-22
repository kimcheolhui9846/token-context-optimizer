// R08: call the plugin's real entry point, index_image_artifact, on the experiment 2 held-out JPEG bytes and on the checked-in
// JPEG fixtures, with the default profile (strict) and with profile "tolerant" (no model calls).
// Usage: node src/r08-jpeg-entry.mjs --bundle <role>=<plugin .mjs> [--bundle ...] --files <empty dir> --out <file.jsonl>
//   [--fixtures <dir>,<dir>]
// Experiment 2 bytes are re-created with the frozen research code exactly as src/p612-encoder-profile-probe.mjs does; a
// file is used only when its SHA-256 equals the slot manifest value, so drift in this copy shrinks the denominator instead
// of changing the bytes. For each matched file a control copy with a JFIF APP0 segment inserted after SOI is also called
// with the default profile. D re-requests resend the same family/question/condition A slot; their JPEG events are counted
// from the stored responses and mapped to matched hashes.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { FAMILIES } from "./families-exp2-heldout.mjs";
import { CONDITIONS, armTransform, cropTransform } from "./transforms.mjs";
import { startPlugin } from "./mcp-client.mjs";

const args = process.argv.slice(2);
const all = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const bundles = all("--bundle").map((s) => { const at = s.indexOf("="); return { role: s.slice(0, at), path: resolve(s.slice(at + 1)) }; });
const filesDir = resolve(opt("--files"));
const out = resolve(opt("--out"));
const fixtureDirs = opt("--fixtures", "../tests/fixtures/jpeg,../tests/fixtures/jpeg-tolerant").split(",").map((d) => resolve(d));
if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
if (existsSync(filesDir) && readdirSync(filesDir).length) throw new Error(`${filesDir} is not empty`);
mkdirSync(filesDir, { recursive: true });

const sha = (b) => createHash("sha256").update(b).digest("hex");
const slotsFile = readFileSync(new URL("../results/exp2-heldout/slots-exp2-heldout.json", import.meta.url));
const { slots } = JSON.parse(slotsFile);
const JFIF_APP0 = Buffer.from("ffe000104a46494600010100000100010000", "hex");

// --- frozen research rebuild (copy of p612-encoder-profile-probe.mjs)
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
for (const slot of slots) if (slot.mime === "image/jpeg" && !unique.has(slot.sha256)) unique.set(slot.sha256, slot);
const files = [];
for (const [recorded, slot] of unique) {
  const bytes = await rebuild(slot);
  if (sha(bytes) !== recorded) { files.push({ set: "exp2", id: recorded, matched: false }); continue; }
  const path = join(filesDir, `${recorded}.jpg`);
  const app0 = join(filesDir, `${recorded}.app0.jpg`);
  writeFileSync(path, bytes, { flag: "wx" });
  writeFileSync(app0, Buffer.concat([bytes.subarray(0, 2), JFIF_APP0, bytes.subarray(2)]), { flag: "wx" });
  files.push({ set: "exp2", id: recorded, matched: true, path, app0 });
}
for (const dir of fixtureDirs) {
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".jpg")).sort()) {
    const path = join(dir, name);
    files.push({ set: `fixture:${dir.split(/[\\/]/).pop()}`, id: name, matched: true, path, sha256: sha(readFileSync(path)) });
  }
}

// D re-request JPEG events (stored responses), mapped to the A slot hash.
const requery = {};
for (const model of ["gpt4o", "haiku"]) {
  const p = new URL(`../results/exp2-heldout/${model}/responses.jsonl`, import.meta.url);
  const rows = readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const events = rows.filter((r) => r.requeried && r.requery?.file);
  const jpeg = events.filter((r) => r.requery.file.endsWith(".jpg"));
  const aSha = jpeg.map((r) => slots.find((s) => s.arm === "A" && s.file === r.requery.file)?.sha256);
  requery[model] = { requeried: rows.filter((r) => r.requeried).length, withFile: events.length, jpegEvents: jpeg.length,
    jpegInMatchedSet: aSha.filter((h) => h && files.some((f) => f.set === "exp2" && f.id === h && f.matched)).length };
}

const call = async (plugin, a) => {
  try {
    const r = await plugin.call("index_image_artifact", a);
    return { ok: true, format: r.format ?? null, validationProfile: r.validationProfile ?? null, width: r.width ?? null, height: r.height ?? null };
  } catch (e) {
    const msg = String(e?.message ?? e);
    // mcp-client throws "<tool> failed: <content JSON>"; the error text of the tool result is the code or message.
    const text = msg.match(/"text":"((?:[^"\\]|\\.)*)"/)?.[1] ?? null;
    return { ok: false, code: text?.match(/^[a-z]+(?:_[a-z0-9]+)+$/)?.[0] ?? null, text: text?.slice(0, 200) ?? null, message: msg.slice(0, 240) };
  }
};
const records = [{ kind: "meta", node: process.version, platform: `${process.platform}-${process.arch}`, sharp: sharp.versions.sharp, vips: sharp.versions.vips,
  slotsSha256: sha(slotsFile), jpegSlots: slots.filter((s) => s.mime === "image/jpeg").length, uniqueJpeg: unique.size,
  matched: files.filter((f) => f.set === "exp2" && f.matched).length, requery,
  bundles: bundles.map((b) => ({ role: b.role, sha256: sha(readFileSync(b.path)) })) }];
for (const b of bundles) {
  const plugin = await startPlugin({ allowedRoots: [filesDir, ...fixtureDirs], bundle: b.path });
  const tools = await plugin.listTools();
  records.push({ kind: "tools", role: b.role, tools });
  for (const f of files) {
    if (!f.matched) continue;
    const rec = { kind: "call", role: b.role, set: f.set, id: f.id };
    rec.default = await call(plugin, { path: f.path });
    rec.tolerant = await call(plugin, { path: f.path, profile: "tolerant" });
    if (f.app0) rec.app0Default = await call(plugin, { path: f.app0 });
    records.push(rec);
  }
  plugin.close();
}
writeFileSync(out, records.map((r) => JSON.stringify(r)).join("\n") + "\n", { flag: "wx" });
console.log(JSON.stringify({ out, ...records[0] }));
