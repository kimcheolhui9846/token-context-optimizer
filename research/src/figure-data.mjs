// Export per-session held-out metrics for the paper figures, using the frozen scoring (session-score.mjs) so the figures and the
// pre-registered analysis share one scoring rule. Reads the committed results in results/s3-heldout; writes figures/data/.
// Usage: node src/figure-data.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { researchDir } from "./env.mjs";
import { correct } from "./session-score.mjs";

const out = join(researchDir, "figures", "data");
mkdirSync(out, { recursive: true });
const rows = [];
for (const provider of ["gpt4o", "haiku"]) {
  const dir = join(researchDir, "results", "s3-heldout", provider);
  const config = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
  const price = config.price;
  const cache = config.cache;
  const calls = readFileSync(join(dir, "calls.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const f of readdirSync(dir).filter((x) => /\.S\d\.json$/.test(x))) {
    const r = JSON.parse(readFileSync(join(dir, f), "utf8"));
    // Same call selection as session-summarize.mjs: only the attempt that produced the result file.
    const mine = calls.filter((x) => x.session === r.session && x.condition === r.condition && (!r.attemptId || x.attemptId === r.attemptId));
    const sum = (k) => mine.reduce((a, x) => a + (x.usage[k] || 0), 0);
    const prompt = sum("prompt"), cached = sum("cached"), cacheWrite = sum("cacheWrite"), completion = sum("completion");
    const out = (completion * price.outputPerM) / 1e6;
    const acc = (ts) => (ts.length ? ts.filter((t) => correct(t.answer, t.gold)).length / ts.length : null);
    rows.push({
      provider, session: r.session, layout: r.session.endsWith("-v2") ? "v2" : "base", condition: r.condition,
      accuracy: acc(r.turns), lateRecall: acc(r.turns.filter((t) => t.type.startsWith("late"))),
      promptTokens: prompt, listCostUsd: (prompt * price.inputPerM) / 1e6 + out,
      cacheCostUsd: ((prompt - cached - cacheWrite + cached * cache.readFactor + cacheWrite * cache.writeFactor) * price.inputPerM) / 1e6 + out,
    });
  }
}
writeFileSync(join(out, "heldout-sessions.json"), `${JSON.stringify({ source: "results/s3-heldout (session-score.mjs scoring)", rows }, null, 1)}\n`);
console.log(`${rows.length} session rows`);
