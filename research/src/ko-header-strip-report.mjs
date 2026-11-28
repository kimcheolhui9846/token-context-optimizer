// ko-header-strip: fill or check the machine tables of RESULTS.md from summary.json (RECOUNT_SPEC section 6).
// Usage: node src/ko-header-strip-report.mjs --summary <summary.json> --results <RESULTS.md> [--write]
import { readFileSync, writeFileSync } from "node:fs";
import { renderTable, tableRows } from "./ko-header-strip-score-lib.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BLOCK = /<!-- khs:table ([a-zA-Z0-9]+) -->\n([\s\S]*?)<!-- \/khs:table -->/g;

export function fill(md, summary) {
  const T = tableRows(summary);
  return md.replace(BLOCK, (_, name) => {
    if (!T[name]) throw new Error(`unknown table ${name}`);
    return `<!-- khs:table ${name} -->\n${renderTable(T[name])}\n<!-- /khs:table -->`;
  });
}

if (process.argv[1] && process.argv[1].endsWith("ko-header-strip-report.mjs")) {
  const summary = JSON.parse(readFileSync(arg("--summary"), "utf8"));
  const path = arg("--results");
  const md = readFileSync(path, "utf8");
  const filled = fill(md, summary);
  if (process.argv.includes("--write")) { writeFileSync(path, filled); console.log("written"); }
  else {
    const a = md.split("\n"), b = filled.split("\n");
    const bad = a.map((l, i) => (l !== b[i] ? i + 1 : 0)).filter(Boolean);
    console.log(JSON.stringify({ mismatches: bad.length, lines: bad.slice(0, 10) }));
    process.exit(bad.length || a.length !== b.length ? 1 : 0);
  }
}
