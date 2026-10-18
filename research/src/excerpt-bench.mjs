// Text excerpt replay bench (no model calls): does the plugin's query_artifact return the gold log line for the experiment 3
// log questions? Queries come from fixed rules, not from a model, so the bench is a baseline for Task 39 and a measured
// figure for the limitations section.
// Usage: node src/excerpt-bench.mjs [--splits heldout,calibration,dev] [--out results/excerpt-bench-001]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { outDir } from "./env.mjs";
import { startPlugin } from "./mcp-client.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const splits = opt("--splits", "heldout,calibration,dev").split(",");
const out = resolve(opt("--out", "results/excerpt-bench-001"));

// Replica of the plugin's scoring (src/core/artifacts.ts tokenize/findBestLine) used only to count ties; the bench checks that
// the replica's first best line equals the line the plugin returns.
const norm = (s) => s.normalize("NFKC").toLocaleLowerCase();
const tokenize = (s) => [...norm(s).matchAll(/[\p{L}\p{N}_./:-]+/gu)].map((m) => m[0]);
const STOP = new Set("a an and answer are as at by does for from given in is it line lines log notes of on or that the this to was what which with".split(" "));
const QUERIES = {
  full: (q) => q, // the whole question
  keywords: (q) => tokenize(q).filter((t) => !STOP.has(t.replace(/[.:?]+$/, ""))).map((t) => t.replace(/[.:?]+$/, "")).join(" "),
  entity: (q) => { const ids = tokenize(q).map((t) => t.replace(/[.:?]+$/, "")).filter((t) => /\d/.test(t)); return ids.length ? ids.join(" ") : null; },
};

const root = join(outDir, "sessions");
const plugin = await startPlugin({ allowedRoots: [root] });
const rows = [];
for (const split of splits) {
  const manifest = JSON.parse(readFileSync(join(root, split, "sessions.json"), "utf8"));
  for (const s of manifest.sessions) {
    const logPath = join(root, split, s.log.file);
    const lines = readFileSync(logPath, "utf8").split("\n");
    const { artifactId } = await plugin.call("index_artifact", { path: logPath });
    for (const [i, t] of s.turns.entries()) {
      const gold = t.evidence?.log;
      if (typeof gold !== "number") continue; // gist questions have no single evidence line
      for (const [variant, make] of Object.entries(QUERIES)) {
        const query = make(t.q);
        if (!query) { rows.push({ split, session: s.id, layout: s.layout, turn: i + 1, type: t.type, variant, query: null, applicable: false }); continue; }
        const r = await plugin.call("query_artifact", { artifactId, query, maxTokens: 400, contextLines: 1 });
        const ex = r.excerpts?.[0];
        const terms = tokenize(query);
        const scores = lines.map((l) => terms.reduce((a, term) => a + (norm(l).includes(term) ? 1 : 0), 0));
        const best = Math.max(...scores);
        const tieLines = scores.flatMap((v, k) => (v === best && best > 0 ? [k + 1] : []));
        const answerInExcerpt = Boolean(ex) && t.answers.some((a) => norm(ex.text).includes(norm(String(a))));
        rows.push({
          split, session: s.id, layout: s.layout, turn: i + 1, type: t.type, variant, query, applicable: true,
          goldLine: gold, excerpt: ex ? [ex.sourceMap.startLine, ex.sourceMap.endLine] : null, excerpts: r.excerpts?.length ?? 0,
          goldCovered: Boolean(ex) && ex.sourceMap.startLine <= gold && gold <= ex.sourceMap.endLine,
          answerInExcerpt, fallbackReason: r.fallbackReason ?? null,
          bestScore: best, tieCount: tieLines.length, goldAmongTies: tieLines.includes(gold),
          replicaAgrees: !ex || tieLines[0] === undefined || (tieLines[0] >= ex.sourceMap.startLine && tieLines[0] <= ex.sourceMap.endLine),
        });
      }
    }
  }
}
plugin.close();

// Summary by split x variant x question type. hit = the excerpt covers the gold line and contains the gold answer; for cross
// questions the answer is read from the image, so hit = the excerpt covers the evidence line.
const isHit = (r) => r.goldCovered && (r.type.startsWith("cross") || r.answerInExcerpt);
const key = (r) => `${r.split}|${r.variant}|${r.type}`;
const groups = {};
for (const r of rows.filter((x) => x.applicable)) (groups[key(r)] ??= []).push(r);
const table = Object.entries(groups).map(([k, rs]) => {
  const [split, variant, type] = k.split("|");
  return { split, variant, type, n: rs.length, hit: rs.filter(isHit).length, tie: rs.filter((r) => r.tieCount > 1).length, goldLostToTie: rs.filter((r) => r.goldAmongTies && !r.goldCovered).length, goldNotTop: rs.filter((r) => !r.goldAmongTies).length };
});
const total = (split, variant) => table.filter((x) => x.split === split && x.variant === variant).reduce((a, x) => ({ n: a.n + x.n, hit: a.hit + x.hit, tie: a.tie + x.tie, lost: a.lost + x.goldLostToTie, notTop: a.notTop + x.goldNotTop }), { n: 0, hit: 0, tie: 0, lost: 0, notTop: 0 });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "rows.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
const summary = { splits, replicaDisagreements: rows.filter((r) => r.applicable && !r.replicaAgrees).length, multiExcerptResponses: rows.filter((r) => r.excerpts > 1).length, totals: Object.fromEntries(splits.flatMap((sp) => Object.keys(QUERIES).map((v) => [`${sp}/${v}`, total(sp, v)]))), table };
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
let md = "| split | query rule | type | n | hit (gold line covered; non-cross also needs the answer in the excerpt) | ties at top | gold lost to a tie | gold not top-scored |\n|---|---|---|---|---|---|---|---|\n";
for (const x of table) md += `| ${x.split} | ${x.variant} | ${x.type} | ${x.n} | ${x.hit} | ${x.tie} | ${x.goldLostToTie} | ${x.goldNotTop} |\n`;
writeFileSync(join(out, "table.md"), md);
console.log(JSON.stringify({ replicaDisagreements: summary.replicaDisagreements, multiExcerptResponses: summary.multiExcerptResponses, totals: summary.totals }, null, 2));
