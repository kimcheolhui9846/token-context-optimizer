// Summarize an RQ1 accounting sweep: formula agreement per provider and the token table by size and aspect ratio.
// Usage: node src/rq1-summarize.mjs [--run-id rq1-sweep-001]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { outDir } from "./env.mjs";

const args = process.argv.slice(2);
const runId = args.includes("--run-id") ? args[args.indexOf("--run-id") + 1] : "rq1-sweep-001";
const runDir = join(outDir, "rq1-runs", runId);
const rows = readFileSync(join(runDir, "rows.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const agree = (sel) => {
  const xs = rows.map(sel);
  const bad = rows.filter((r, i) => xs[i].measured !== xs[i].predicted);
  return { n: rows.length, match: rows.length - bad.length, mismatches: bad.map((r) => ({ key: r.key, measured: sel(r).measured, predicted: sel(r).predicted })) };
};
const summary = {
  runId,
  images: rows.length,
  openaiHigh: agree((r) => r.openaiHigh),
  openaiLow: agree((r) => r.openaiLow),
  anthropic: agree((r) => r.anthropic),
  // Haiku bills a fixed per-image overhead on top of the patch formula; report the set of offsets seen.
  anthropicOffsets: [...new Set(rows.map((r) => r.anthropic.measured - r.anthropic.predicted))],
  anthropicCountVsBilled: rows.filter((r) => r.anthropic.counted !== r.anthropic.measured).map((r) => r.key),
  formatInvariant: rows.filter((r) => r.format === "jpeg").map((r) => {
    const png = rows.find((p) => p.format === "png" && p.width === r.width && p.height === r.height);
    return { size: `${r.width}x${r.height}`, same: png && png.openaiHigh.measured === r.openaiHigh.measured && png.anthropic.measured === r.anthropic.measured };
  }),
  costUsd: rows.reduce((a, r) => a + r.costUsd, 0),
};
writeFileSync(join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

let md = `# ${runId}: billed image tokens by size\n\nMeasured = prompt tokens minus a text-only baseline. Predicted = published formula (src/token-formulas.mjs).\n\n`;
md += `Formula agreement: GPT-4o high ${summary.openaiHigh.match}/${summary.images}, GPT-4o low ${summary.openaiLow.match}/${summary.images}, Haiku 4.5 ${summary.anthropic.match}/${summary.images} exact (offsets measured − predicted: ${summary.anthropicOffsets.join(", ")}). Haiku count_tokens differs from billed in ${summary.anthropicCountVsBilled.length} images.\n\n`;
md += "| group | size | format | GPT-4o high (measured / predicted) | GPT-4o low | Haiku 4.5 (measured / predicted) |\n|---|---|---|---|---|---|\n";
for (const r of rows) md += `| ${r.group} | ${r.width}x${r.height} | ${r.format} | ${r.openaiHigh.measured} / ${r.openaiHigh.predicted} | ${r.openaiLow.measured} | ${r.anthropic.measured} / ${r.anthropic.predicted} |\n`;
writeFileSync(join(runDir, "summary.md"), md);
console.log(JSON.stringify({ ...summary, openaiHigh: { ...summary.openaiHigh, mismatches: summary.openaiHigh.mismatches.slice(0, 10) } }, null, 2));
