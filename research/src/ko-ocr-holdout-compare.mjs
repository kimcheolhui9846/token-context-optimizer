// ko-ocr-holdout: run A / run B reproducibility (protocol 6.4), with the fixed #147 compareRows.
// Usage (from research/): node src/ko-ocr-holdout-compare.mjs --a <run-a> --b <run-b> --score-a <score-a> --score-b <score-b> --out <comparison.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixedLib } from "./ko-ocr-holdout-fixed.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [a, b, sa, sb, out] = ["--a", "--b", "--score-a", "--score-b", "--out"].map(arg);
if (!a || !b || !sa || !sb || !out) throw new Error("--a, --b, --score-a, --score-b and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const lib = await loadFixedLib();
lib.checkFreeze(a);
lib.checkFreeze(b);

const files = [[a, b, "predictions.jsonl"], [a, b, "ocr.jsonl"], [a, b, "guard-summary.json"], [sa, sb, "score.jsonl"], [sa, sb, "summary.json"]];
const bytes = {};
for (const [x, y, f] of files) {
  const hx = lib.sha256(readFileSync(join(x, f))), hy = lib.sha256(readFileSync(join(y, f)));
  bytes[f] = { a: hx, b: hy, identical: hx === hy };
}
const load = (f) => lib.parseJsonl(readFileSync(f, "utf8"));
const rowsDiff = (fx, fy, keyOf) => lib.compareRows(load(fx), load(fy), keyOf, { hideFields: ["ocrLines"] });
const pk = (r) => `${r.ocr}|${r.id}`;
const sk = (r) => `${r.cond}|${r.id}`;
const rows = {
  predictions: rowsDiff(join(a, "predictions.jsonl"), join(b, "predictions.jsonl"), pk),
  ocr: rowsDiff(join(a, "ocr.jsonl"), join(b, "ocr.jsonl"), pk),
  score: rowsDiff(join(sa, "score.jsonl"), join(sb, "score.jsonl"), sk),
};
const strip = (s) => { const o = JSON.parse(s); delete o.inputs; return JSON.stringify(o); };
const summaryValueSame = strip(readFileSync(join(sa, "summary.json"), "utf8")) === strip(readFileSync(join(sb, "summary.json"), "utf8"));
const reproduced = Object.values(bytes).every((v) => v.identical) && Object.values(rows).every((r) => r.identical) && summaryValueSame;
writeFileSync(out, lib.pretty({
  rule: "byte identity of the deterministic files; rows compared by key in both directions (keys only in A or B, duplicates, one-sided fields, differing values, order) in run A's denominators; primary analysis stays run A",
  reproduced,
  bytes,
  summaryValueSameIgnoringInputHashes: summaryValueSame,
  ...rows,
}));
console.log(JSON.stringify({ reproduced, ...Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, v.identical])) }));
if (!reproduced) process.exitCode = 1;
