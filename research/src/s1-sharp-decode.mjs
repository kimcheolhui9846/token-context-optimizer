// s-1 (Task 33 follow-up, Claude): decode the Task 33 jpeg-js probe outputs with an independent decoder (sharp/libvips with its bundled mozjpeg decoder)
// and compare with the jpeg-js decode and with the encoder input pattern.
// Usage: node src/s1-sharp-decode.mjs --probe-root <task-33 worktree> [--out results/s1-sharp-decode]
// The probe worktree is read only: its evidence JSON, artifacts, pattern generator and jpeg-js decoder are imported, never written.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const probeRoot = resolve(opt("--probe-root", "../../task-33-transform-probe"));
const outRel = opt("--out", "results/s1-sharp-decode");

const evidencePath = join(probeRoot, "docs", "research", "evidence", "task-33", "jpeg-encoder-results.json");
const evidenceBytes = readFileSync(evidencePath);
const ev = JSON.parse(evidenceBytes);
const artifactRoot = join(probeRoot, ".artifacts", "task-33-probe");
const artifactDir = join(artifactRoot, readdirSync(artifactRoot).find((d) => readdirSync(join(artifactRoot, d)).some((f) => f.endsWith(".jpg"))));
const worker = await import(pathToFileURL(join(probeRoot, "scripts", "probe-jpeg-worker.mjs")).href);
const probeRequire = createRequire(join(probeRoot, "package.json"));
const jpegDecode = probeRequire("jpeg-js/lib/decoder.js");
const jpegJsVersion = JSON.parse(readFileSync(probeRequire.resolve("jpeg-js/package.json"), "utf8")).version;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const cellById = new Map(ev.cells.map((c) => [c.cellId, c]));

// Pixel difference statistics between two RGB buffers of the same size.
function diff(a, b) {
  let max = 0, sum = 0, sq = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
    sum += d;
    sq += d * d;
  }
  const mse = sq / a.length;
  return { maxAbs: max, meanAbs: sum / a.length, psnrDb: mse === 0 ? null : 10 * Math.log10((255 * 255) / mse) };
}

const rows = [];
for (const o of ev.outputs) {
  const bytes = readFileSync(join(artifactDir, o.artifact));
  const row = { sha256: o.sha256, cellIds: o.cellIds, shaMatches: sha(bytes) === o.sha256 };
  // jpeg-js decode with the probe's strict options (same decoder family as the validator).
  const js = jpegDecode(bytes, worker.DECODE_OPTIONS);
  const jsRgb = Buffer.from(js.data);
  // Independent decode: sharp (libvips + mozjpeg), forced to 3-channel sRGB.
  const sh = await sharp(bytes, { failOn: "error" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  row.sharp = { width: sh.info.width, height: sh.info.height, channels: sh.info.channels };
  row.cells = o.cellIds.map((id) => {
    const c = cellById.get(id);
    const dimsOk = sh.info.width === c.width && sh.info.height === c.height && js.width === c.width && js.height === c.height;
    const source = worker.makeRgb(c.pattern, c.width, c.height);
    const sourceRgb = Buffer.from(source.rgb ?? source);
    const rgbHashOk = sha(sourceRgb) === c.inputRgbSha256;
    return {
      cellId: id, width: c.width, height: c.height, quality: c.quality, pattern: c.pattern, dimsOk, sourceRgbHashOk: rgbHashOk,
      sharpVsJpegJs: dimsOk ? diff(sh.data, jsRgb) : null,
      sharpVsSource: dimsOk && rgbHashOk ? diff(sh.data, sourceRgb) : null,
      jpegJsVsSource: dimsOk && rgbHashOk ? diff(jsRgb, sourceRgb) : null,
    };
  });
  rows.push(row);
}

const cells = rows.flatMap((r) => r.cells);
const summary = {
  outputs: rows.length,
  cells: cells.length,
  shaMatches: rows.filter((r) => r.shaMatches).length,
  sharpDecoded: rows.length,
  dimsOk: cells.filter((c) => c.dimsOk).length,
  sourceRgbHashOk: cells.filter((c) => c.sourceRgbHashOk).length,
  sharpVsJpegJsMaxAbs: Math.max(...cells.map((c) => c.sharpVsJpegJs?.maxAbs ?? -1)),
  sharpVsJpegJsIdentical: cells.filter((c) => c.sharpVsJpegJs?.maxAbs === 0).length,
};
const out = resolve(outRel);
mkdirSync(out, { recursive: true });
const environment = { node: process.version, sharp: sharp.versions, jpegJs: jpegJsVersion, evidenceSha256: sha(evidenceBytes), evidenceRunId: ev.runId };
writeFileSync(join(out, "results.json"), `${JSON.stringify({ purpose: "s-1 independent decode of Task 33 probe outputs", environment, summary, rows }, null, 2)}\n`);
console.log(JSON.stringify({ environment, summary }, null, 2));
const fmt = (d) => (d ? `${d.maxAbs} / ${d.meanAbs.toFixed(3)} / ${d.psnrDb == null ? "∞" : d.psnrDb.toFixed(2)}` : "—");
let md = "| cell | sharp vs jpeg-js (max / mean / PSNR dB) | sharp vs source | jpeg-js vs source |\n|---|---|---|---|\n";
for (const c of cells) md += `| ${c.cellId} | ${fmt(c.sharpVsJpegJs)} | ${fmt(c.sharpVsSource)} | ${fmt(c.jpegJsVsSource)} |\n`;
writeFileSync(join(out, "table.md"), md);
