// Korean OCR x Hangul key factorial: run A / run B reproducibility (protocol 6.4).
// Usage (from research/): node src/ko-ocr-factorial-compare.mjs --a <run-a> --b <run-b> --score-a <score-a> --score-b <score-b> --out <comparison.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkFreeze, compareRows, parseJsonl, pretty, sha256 } from "./ko-ocr-factorial-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [a, b, sa, sb, out] = ["--a", "--b", "--score-a", "--score-b", "--out"].map(arg);
if (!a || !b || !sa || !sb || !out) throw new Error("--a, --b, --score-a, --score-b and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
checkFreeze(a);
checkFreeze(b);

const files = [[a, b, "predictions.jsonl"], [a, b, "ocr.jsonl"], [a, b, "guard-summary.json"], [sa, sb, "score.jsonl"], [sa, sb, "history.jsonl"], [sa, sb, "summary.json"]];
const bytes = {};
for (const [x, y, f] of files) {
  const hx = sha256(readFileSync(join(x, f))), hy = sha256(readFileSync(join(y, f)));
  bytes[f] = { a: hx, b: hy, identical: hx === hy };
}
const load = (f) => parseJsonl(readFileSync(f, "utf8"));
const rowsDiff = (fx, fy, keyOf) => compareRows(load(fx), load(fy), keyOf, { hideFields: ["ocrLines"] });
const pk = (r) => `${r.ocr}|${r.dataset}|${r.id}`;
const sk = (r) => `${r.cond}|${r.dataset}|${r.id}`;
const hk = (r) => `${r.dataset}|${r.id}`;
const rows = {
  predictions: rowsDiff(join(a, "predictions.jsonl"), join(b, "predictions.jsonl"), pk),
  ocr: rowsDiff(join(a, "ocr.jsonl"), join(b, "ocr.jsonl"), pk),
  score: rowsDiff(join(sa, "score.jsonl"), join(sb, "score.jsonl"), sk),
  history: rowsDiff(join(sa, "history.jsonl"), join(sb, "history.jsonl"), hk),
};
const summaryValueSame = JSON.stringify(JSON.parse(readFileSync(join(sa, "summary.json"), "utf8"))) === JSON.stringify(JSON.parse(readFileSync(join(sb, "summary.json"), "utf8")));
const reproduced = Object.values(bytes).every((v) => v.identical) && Object.values(rows).every((r) => r.identical) && summaryValueSame;
writeFileSync(out, pretty({
  rule: "byte identity of the deterministic files; rows are compared by key in both directions (keys only in A or B, duplicates, one-sided fields, differing values) in the original denominators (primary analysis stays run A)",
  reproduced,
  bytes,
  summaryValueSame,
  ...rows,
}));
console.log(JSON.stringify({ reproduced, ...Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, v.identical])) }));
if (!reproduced) process.exitCode = 1;
