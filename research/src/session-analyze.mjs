// Experiment 3 held-out analysis (pre-registration §1, §5): paired session-level bootstrap for H1–H3, descriptive H4.
// Usage: node src/session-analyze.mjs --run-id <id>   (run session-summarize.mjs first; this reads the same result files)
// Session accuracy = share of correct turns in that session; differences are paired by session (all conditions share sessions).
// Missing result files count as not_started and are reported, never dropped silently from the denominator of the run.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { outDir } from "./env.mjs";
import { writeJson } from "./common.mjs";
import { correct } from "./session-score.mjs";

const args = process.argv.slice(2);
const runId = args.includes("--run-id") ? args[args.indexOf("--run-id") + 1] : "s3-heldout-gpt4o";
const runDir = join(outDir, "session-runs", runId);
const config = JSON.parse(readFileSync(join(runDir, "config.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(outDir, "sessions", config.split, "sessions.json"), "utf8"));
const B = 10_000;
const SEED = 20261015;
const MARGIN = -0.05;
const CONDS = ["S0", "S1", "S2", "S3", "S4"];

// mulberry32: small deterministic PRNG so the bootstrap is reproducible from the seed alone.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const res = {};
for (const f of readdirSync(runDir).filter((x) => /\.S\d\.json$/.test(x))) {
  const r = JSON.parse(readFileSync(join(runDir, f), "utf8"));
  (res[r.session] ??= {})[r.condition] = r;
}
const calls = readFileSync(join(runDir, "calls.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const late = (t) => t.type.startsWith("late");

const sessions = manifest.sessions.map((s) => {
  const row = { id: s.id, template: s.template, layout: s.layout, cond: {} };
  for (const c of CONDS) {
    const r = res[s.id]?.[c];
    if (!r) { row.cond[c] = null; continue; }
    const mine = calls.filter((x) => x.session === s.id && x.condition === c && (!r.attemptId || x.attemptId === r.attemptId));
    const acc = (ts) => ts.filter((t) => correct(t.answer, t.gold)).length / ts.length;
    row.cond[c] = { acc: acc(r.turns), late: acc(r.turns.filter(late)), prompt: mine.reduce((a, x) => a + x.usage.prompt, 0) };
  }
  return row;
});
const notStarted = sessions.flatMap((s) => CONDS.filter((c) => !s.cond[c]).map((c) => `${s.id}.${c}`));

// Paired bootstrap over sessions that have both conditions; returns observed mean difference and percentile 95% CI.
function pairedCI(rows, a, b, key, seed) {
  const d = rows.filter((s) => s.cond[a] && s.cond[b]).map((s) => s.cond[a][key] - s.cond[b][key]);
  if (!d.length) return { n: 0 };
  const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
  const rnd = prng(seed);
  const boot = new Float64Array(B);
  for (let i = 0; i < B; i++) {
    let s = 0;
    for (let j = 0; j < d.length; j++) s += d[Math.floor(rnd() * d.length)];
    boot[i] = s / d.length;
  }
  boot.sort();
  return { n: d.length, diff: mean(d), lo: boot[Math.floor(0.025 * B)], hi: boot[Math.ceil(0.975 * B) - 1] };
}
const meanOf = (rows, c, key) => {
  const xs = rows.filter((s) => s.cond[c]).map((s) => s.cond[c][key]);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

function analyze(rows) {
  // One bootstrap stream per comparison, all derived from the registered seed.
  const h1 = pairedCI(rows, "S2", "S0", "acc", SEED);
  const h2 = pairedCI(rows, "S1", "S0", "late", SEED + 1);
  const h3 = pairedCI(rows, "S3", "S1", "late", SEED + 2);
  const tok = { S0: meanOf(rows, "S0", "prompt"), S2: meanOf(rows, "S2", "prompt") };
  return {
    sessions: rows.length,
    accuracy: Object.fromEntries(CONDS.map((c) => [c, meanOf(rows, c, "acc")])),
    lateRecall: Object.fromEntries(CONDS.map((c) => [c, meanOf(rows, c, "late")])),
    promptTokens: Object.fromEntries(CONDS.map((c) => [c, meanOf(rows, c, "prompt")])),
    H1: { ...h1, tokensS2: tok.S2, tokensS0: tok.S0, pass: h1.n > 0 && h1.lo > MARGIN && tok.S2 < tok.S0 },
    H2: { ...h2, pass: h2.n > 0 && h2.hi < 0 },
    H3: { ...h3, pass: h3.n > 0 && h3.lo > 0 },
  };
}

const all = analyze(sessions);
const byLayout = { base: analyze(sessions.filter((s) => s.layout === "base")), v2: analyze(sessions.filter((s) => s.layout === "v2")) };
// H4 (descriptive): S2 saving vs S0 in list view and cache view, from session-summarize output.
const summary = JSON.parse(readFileSync(join(runDir, "summary.json"), "utf8"));
const t = summary.table;
const H4 = t.S0 && t.S2 ? {
  listSaving: 1 - t.S2.meanListCostUsd / t.S0.meanListCostUsd,
  cacheSaving: 1 - t.S2.meanCacheViewCostUsd / t.S0.meanCacheViewCostUsd,
} : null;
if (H4) H4.holds = H4.cacheSaving < H4.listSaving;

writeJson(join(runDir, "analysis.json"), { runId, provider: config.provider || "openai", model: config.model, bootstrap: { B, seed: SEED, method: "paired session bootstrap, percentile 95%" }, margin: MARGIN, notStarted, all, byLayout, H4 });

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const pp = (x) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%p`);
const ci = (h) => (h.n ? `${pp(h.diff)} [${pp(h.lo)}, ${pp(h.hi)}]` : "—");
const verdict = (b) => (b ? "지지" : "지지 안 됨");
let md = `# ${runId} 사전 등록 분석\n\n공급자 ${config.provider || "openai"}, 모델 ${config.model}. 세션 단위 짝 bootstrap ${B.toLocaleString("en-US")}회, seed ${SEED}, percentile 95%.\n\n`;
md += `미실행(not_started): ${notStarted.length ? notStarted.join(", ") : "없음"}\n\n## 가설 판정\n\n| 가설 | 비교 | 차이 [95% CI] | 기준 | 판정 |\n|---|---|---|---|---|\n`;
md += `| H1 | S2−S0 정확도 | ${ci(all.H1)} | 하한 > ${pp(MARGIN)} 그리고 입력 토큰 S2 < S0 (${Math.round(all.H1.tokensS2 ?? 0).toLocaleString("en-US")} vs ${Math.round(all.H1.tokensS0 ?? 0).toLocaleString("en-US")}) | ${verdict(all.H1.pass)} |\n`;
md += `| H2 | S1−S0 늦은 회상 | ${ci(all.H2)} | 상한 < 0 | ${verdict(all.H2.pass)} |\n`;
md += `| H3 | S3−S1 늦은 회상 | ${ci(all.H3)} | 하한 > 0 | ${verdict(all.H3.pass)} |\n`;
md += `| H4 | S2 절감률, 캐시 대 정가 | ${H4 ? `정가 ${pct(H4.listSaving)}, 캐시 ${pct(H4.cacheSaving)}` : "—"} | 캐시 절감률 < 정가 절감률(기술 통계) | ${H4 ? (H4.holds ? "성립" : "성립 안 함") : "—"} |\n`;
md += `\n## 레이아웃별 (탐색)\n\n| 레이아웃 | 세션 | ${CONDS.map((c) => `${c} 정확도`).join(" | ")} | H1 차이 [CI] | H2 차이 [CI] | H3 차이 [CI] |\n|---|---|${CONDS.map(() => "---").join("|")}|---|---|---|\n`;
for (const [k, a] of Object.entries({ 전체: all, 기존: byLayout.base, 새: byLayout.v2 })) md += `| ${k} | ${a.sessions} | ${CONDS.map((c) => pct(a.accuracy[c])).join(" | ")} | ${ci(a.H1)} | ${ci(a.H2)} | ${ci(a.H3)} |\n`;
md += `\n늦은 회상: ${CONDS.map((c) => `${c} ${pct(all.lateRecall[c])}`).join(", ")}.\n`;
writeFileSync(join(runDir, "analysis.md"), md);
console.log(md);
