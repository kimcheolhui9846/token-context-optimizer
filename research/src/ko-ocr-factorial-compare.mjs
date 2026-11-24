// Korean OCR x Hangul key factorial: run A / run B reproducibility (protocol 6.4).
// Usage (from research/): node src/ko-ocr-factorial-compare.mjs --a <run-a> --b <run-b> --score-a <score-a> --score-b <score-b> --out <comparison.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkFreeze, parseJsonl, pretty, sha256 } from "./ko-ocr-factorial-lib.mjs";

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
const rowsDiff = (fx, fy, keyOf) => {
  const ra = parseJsonl(readFileSync(fx, "utf8")), rb = parseJsonl(readFileSync(fy, "utf8"));
  const mb = new Map(rb.map((r) => [keyOf(r), r]));
  const diffs = [];
  for (const r of ra) {
    const o = mb.get(keyOf(r));
    if (!o) { diffs.push({ key: keyOf(r), fields: ["missing in B"] }); continue; }
    const fields = Object.keys(r).filter((k) => JSON.stringify(r[k]) !== JSON.stringify(o[k]));
    if (fields.length) diffs.push({ key: keyOf(r), fields, a: Object.fromEntries(fields.map((k) => [k, k === "ocrLines" ? "(ocr lines)" : r[k]])), b: Object.fromEntries(fields.map((k) => [k, k === "ocrLines" ? "(ocr lines)" : o[k]])) });
  }
  return { denominator: ra.length, sameRows: ra.length - diffs.length, diffs };
};
const pk = (r) => `${r.ocr}|${r.dataset}|${r.id}`;
const sk = (r) => `${r.cond}|${r.dataset}|${r.id}`;
const hk = (r) => `${r.dataset}|${r.id}`;
writeFileSync(out, pretty({
  rule: "byte identity of the deterministic files; row-level differences are listed in the original denominators (primary analysis stays run A)",
  bytes,
  predictions: rowsDiff(join(a, "predictions.jsonl"), join(b, "predictions.jsonl"), pk),
  ocr: rowsDiff(join(a, "ocr.jsonl"), join(b, "ocr.jsonl"), pk),
  score: rowsDiff(join(sa, "score.jsonl"), join(sb, "score.jsonl"), sk),
  history: rowsDiff(join(sa, "history.jsonl"), join(sb, "history.jsonl"), hk),
}));
console.log(JSON.stringify(Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, v.identical]))));
