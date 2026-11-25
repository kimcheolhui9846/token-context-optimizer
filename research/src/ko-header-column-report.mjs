// ko-header-column: public result tables (RECOUNT_SPEC.md 10).
// Usage (from research/):
//   node src/ko-header-column-report.mjs --score <score dir> --results <RESULTS.md> --write   -> fills every <!-- khc:table NAME --> block
//   node src/ko-header-column-report.mjs --score <score dir> --results <RESULTS.md>           -> checks every cell (exit 1 on a mismatch)
// The tables are rendered from summary.json only; the prose around the blocks is left untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkTables, renderTables } from "./ko-header-column-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const scoreDir = arg("--score"), results = arg("--results");
if (!scoreDir || !results) throw new Error("--score and --results are required");
const summary = JSON.parse(readFileSync(join(scoreDir, "summary.json"), "utf8"));
const text = readFileSync(results, "utf8").replace(/\r\n/g, "\n");
if (process.argv.includes("--write")) {
  const tables = renderTables(summary);
  const seen = new Set();
  const next = text.replace(/<!-- khc:table (\S+) -->\n[\s\S]*?<!-- \/khc:table -->/g, (m, name) => {
    if (!tables[name]) throw new Error(`unknown table ${name}`);
    seen.add(name);
    return `<!-- khc:table ${name} -->\n${tables[name].join("\n")}\n<!-- /khc:table -->`;
  });
  const missing = Object.keys(tables).filter((n) => !seen.has(n));
  if (missing.length) throw new Error(`RESULTS.md has no block for ${missing.join(", ")}`);
  writeFileSync(results, next);
}
const mismatches = checkTables(readFileSync(results, "utf8"), summary);
console.log(JSON.stringify({ tables: Object.keys(renderTables(summary)).length, mismatches: mismatches.length, first: mismatches.slice(0, 5) }));
process.exitCode = mismatches.length ? 1 : 0;
