// ko-window-diagnostic: run A vs run B, every page key and value in both directions, plus the summaries.
// Usage (from research/): node src/ko-window-diagnostic-compare.mjs --a <run A out> --b <run B out> --out <file>
// Exit 1 when anything differs (the difference is written, never hidden).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { comparePages } from "./ko-window-diagnostic-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [a, b, out] = ["--a", "--b", "--out"].map(arg);
if (!a || !b || !out) throw new Error("--a, --b and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const rows = (d) => readFileSync(join(d, "pages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const bytes = (d, f) => readFileSync(join(d, f));
const pages = comparePages(rows(a), rows(b));
const sa = JSON.parse(bytes(a, "summary.json")), sb = JSON.parse(bytes(b, "summary.json"));
const keysA = Object.keys(sa), keysB = Object.keys(sb);
const summary = {
  sameBytes: bytes(a, "summary.json").equals(bytes(b, "summary.json")),
  keysOnlyInA: keysA.filter((k) => !(k in sb)),
  keysOnlyInB: keysB.filter((k) => !(k in sa)),
  differingKeys: keysA.filter((k) => k in sb && JSON.stringify(sa[k]) !== JSON.stringify(sb[k])),
};
const result = {
  pagesSameBytes: bytes(a, "pages.jsonl").equals(bytes(b, "pages.jsonl")),
  pages,
  summary,
  reproduced: pages.identical && summary.keysOnlyInA.length === 0 && summary.keysOnlyInB.length === 0 && summary.differingKeys.length === 0,
};
writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ reproduced: result.reproduced, rows: [pages.rowsA, pages.rowsB], sameRows: pages.sameRows, diffs: pages.diffs.length }));
if (!result.reproduced) process.exitCode = 1;
