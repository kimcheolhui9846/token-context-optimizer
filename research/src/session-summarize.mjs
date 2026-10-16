// Summarize an experiment 3 run: accuracy by question type and condition, cumulative tokens per session (list and cache view).
// Usage: node src/session-summarize.mjs --run-id <id>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { outDir } from "./env.mjs";
import { writeJson } from "./common.mjs";

const args = process.argv.slice(2);
const runId = args.includes("--run-id") ? args[args.indexOf("--run-id") + 1] : "s3-dev-001";
const runDir = join(outDir, "session-runs", runId);
const config = JSON.parse(readFileSync(join(runDir, "config.json"), "utf8"));
// [검증 필요] OpenAI cached-input discount for gpt-4o; the summary reports this view as an assumption next to the list view.
// Price and cache factors come from the run config; older OpenAI runs without them use the original values.
const PRICE = config.price || { inputPerM: 2.5, outputPerM: 10 };
const CACHE = config.cache || { readFactor: 0.5, writeFactor: 1 };

import { correct } from "./session-score.mjs";

const results = readdirSync(runDir).filter((f) => /\.S\d\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(runDir, f), "utf8")));
const calls = readFileSync(join(runDir, "calls.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const CONDS = ["S0", "S1", "S2", "S3", "S4"].filter((c) => results.some((r) => r.condition === c));
const group = (t) => (t.startsWith("late") ? "late" : t.startsWith("immediate") ? "immediate" : t);
const GROUPS = ["immediate", "cross", "gist", "late"];

const table = {};
for (const c of CONDS) {
  const rs = results.filter((r) => r.condition === c);
  const turns = rs.flatMap((r) => r.turns);
  const acc = (ts) => (ts.length ? ts.filter((t) => correct(t.answer, t.gold)).length / ts.length : null);
  const cs = calls.filter((x) => x.condition === c && rs.some((r) => r.session === x.session));
  const perSession = rs.map((r) => {
    // Results written with an attemptId count only that attempt's calls (interrupted attempts are excluded).
    const mine = cs.filter((x) => x.session === r.session && (!r.attemptId || x.attemptId === r.attemptId));
    const prompt = mine.reduce((a, x) => a + x.usage.prompt, 0);
    const cached = mine.reduce((a, x) => a + (x.usage.cached || 0), 0);
    const cacheWrite = mine.reduce((a, x) => a + (x.usage.cacheWrite || 0), 0);
    const completion = mine.reduce((a, x) => a + x.usage.completion, 0);
    return { session: r.session, prompt, cached, cacheWrite, completion, calls: mine.length, compactions: mine.filter((x) => x.kind === "compact").length };
  });
  const mean = (k) => perSession.reduce((a, x) => a + x[k], 0) / Math.max(1, perSession.length);
  const out = (mean("completion") * PRICE.outputPerM) / 1e6;
  const listCost = (mean("prompt") * PRICE.inputPerM) / 1e6 + out;
  const plain = mean("prompt") - mean("cached") - mean("cacheWrite");
  const cacheCost = ((plain + mean("cached") * CACHE.readFactor + mean("cacheWrite") * CACHE.writeFactor) * PRICE.inputPerM) / 1e6 + out;
  table[c] = {
    sessions: rs.length,
    accuracy: acc(turns),
    byGroup: Object.fromEntries(GROUPS.map((g) => [g, acc(turns.filter((t) => group(t.type) === g))])),
    meanPromptTokens: mean("prompt"),
    meanCachedTokens: mean("cached"),
    meanCompletionTokens: mean("completion"),
    meanCalls: mean("calls"),
    meanCompactions: mean("compactions"),
    meanListCostUsd: listCost,
    meanCacheViewCostUsd: cacheCost,
    thresholdExceededTurns: turns.filter((t) => t.thresholdExceeded).length,
    toolCalls: turns.reduce((a, t) => a + (t.toolCalls || 0), 0),
    originalsRequested: turns.reduce((a, t) => a + (t.originalsRequested || 0), 0),
    unreadable: turns.filter((t) => /unreadable/i.test(t.answer || "")).length,
    perSession,
  };
}
const wrong = results.flatMap((r) => r.turns.filter((t) => !correct(t.answer, t.gold)).map((t) => ({ session: r.session, condition: r.condition, turn: t.turn, type: t.type, gold: t.gold[0], answer: t.answer })));
writeJson(join(runDir, "summary.json"), { runId, config: { split: config.split, provider: config.provider || "openai", model: config.model, compactAt: config.compactAt, price: PRICE, cache: CACHE }, table, wrong });

const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const n0 = (x) => Math.round(x).toLocaleString("en-US");
let md = `# ${runId} summary (experiment 3, split ${config.split})\n\nExploratory. Content-match scoring. Tokens are means per session over all calls (turns, tool rounds, compaction).\n\n`;
md += "| condition | sessions | accuracy | immediate | cross | gist | late recall | prompt tokens | cached | list cost | cache-view cost | calls | compactions | tool calls | originals | UNREADABLE |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
for (const c of CONDS) {
  const x = table[c];
  md += `| ${c} | ${x.sessions} | ${pct(x.accuracy)} | ${GROUPS.map((g) => pct(x.byGroup[g])).join(" | ")} | ${n0(x.meanPromptTokens)} | ${n0(x.meanCachedTokens)} | $${x.meanListCostUsd.toFixed(4)} | $${x.meanCacheViewCostUsd.toFixed(4)} | ${x.meanCalls.toFixed(1)} | ${x.meanCompactions.toFixed(1)} | ${x.toolCalls} | ${x.originalsRequested} | ${x.unreadable} |\n`;
}
md += `\nTurns whose prompt exceeded the ${config.compactAt}-token threshold (would have triggered a threshold compact): ${CONDS.map((c) => `${c} ${table[c].thresholdExceededTurns}`).join(", ")}.\n`;
md += `\nCache-view cost: cache reads at ${CACHE.readFactor}x and cache writes at ${CACHE.writeFactor}x the input price (${config.provider === "anthropic" ? "Anthropic reference" : "OpenAI, third-party sources [검증 필요]"}).\n\n## Wrong answers\n\n| session | condition | turn | type | gold | answer |\n|---|---|---|---|---|---|\n`;
for (const w of wrong) md += `| ${w.session} | ${w.condition} | ${w.turn} | ${w.type} | ${w.gold} | ${String(w.answer).replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 80)} |\n`;
writeFileSync(join(runDir, "summary.md"), md);
console.log(md);
