// ko-row-gate: replay A/B comparison (protocol research/plans/2026-11-24-ko-row-gate-protocol.md, 4.5).
// Usage (from research/): node src/ko-row-gate-compare.mjs --a <results dir> --out <file>
// <results dir> holds replay-a, replay-b, score-a, score-b. Both replays read the same frozen OCR; this checks determinism,
// it is not an independent OCR repetition.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixedLib } from "./ko-row-gate-fixed.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const dir = arg("--a"), out = arg("--out");
if (!dir || !out) throw new Error("--a and --out are required");
const lib = await loadFixedLib();
const FILES = [["replay", "predictions.jsonl"], ["replay", "inputs.json"], ["replay", "freeze.json"], ["score", "score.jsonl"], ["score", "summary.json"]];
const files = {}, rows = {};
let identical = true;
for (const [kind, f] of FILES) {
  const a = readFileSync(join(dir, `${kind}-a`, f)), b = readFileSync(join(dir, `${kind}-b`, f));
  const same = a.equals(b);
  identical &&= same;
  files[`${kind}/${f}`] = { a: lib.sha256(a), b: lib.sha256(b), sameBytes: same };
  if (f.endsWith(".jsonl")) {
    const c = lib.compareRows(lib.parseJsonl(a.toString("utf8")), lib.parseJsonl(b.toString("utf8")), (r) => r.id);
    rows[`${kind}/${f}`] = c;
    identical &&= c.identical;
  }
}
writeFileSync(out, `${JSON.stringify({ version: "ko-row-gate-ab-1", basis: "both replays read the same frozen OCR; determinism check, not an independent OCR repetition", reproduced: identical, files, rows }, null, 1)}\n`);
console.log(`reproduced: ${identical}`);
process.exitCode = identical ? 0 : 1;
