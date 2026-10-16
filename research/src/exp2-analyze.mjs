// Experiment 2 family-level analysis (protocol as revised by Task 34, §3, §7): primary D-A, secondary D-C and C-B, paired
// within source family. Each family's arm score is its mean over the four input conditions (one question per family), then
// differences are bootstrapped over families. Also reports per-condition paired differences, input tokens, cost, D's
// re-request rate, and the exploratory arm Dp (the pre-amendment D rule, derived in summarize.mjs).
// Pre-registration amendment 1 (2026-10-16, before any held-out call): H1 D-A CI lower > -5pp and mean input tokens
// D < A; H2 D-C descriptive; H3 C-B descriptive; Dp exploratory (no verdict).
// Usage: node src/exp2-analyze.mjs --set exp2-calibration|exp2-heldout --run-id <id>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSet } from "./env.mjs";
import { writeJson } from "./common.mjs";

const args = process.argv.slice(2);
const set = getSet(args);
const runId = args[args.indexOf("--run-id") + 1];
const runDir = join(set.dir, "runs", runId);
const B = 10_000;
const SEED = 20261016;
const MARGIN = -0.05;
const ARMS = ["A", "B", "C", "D", "E", "Dp"];
const CONDS = ["clean", "jpeg-only", "downscale-only", "combined"];
const rows = readFileSync(join(runDir, "graded.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
// Failures count as incorrect; not_started is reported and kept out of means (protocol §5).
const score = (r) => (r.outcome === "not_started" ? null : r.contentCorrect ? 1 : 0);
const notStarted = rows.filter((r) => r.outcome === "not_started").map((r) => r.key);

function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function boot(d, seed) {
  if (!d.length) return { n: 0 };
  const rnd = prng(seed);
  const xs = new Float64Array(B);
  for (let i = 0; i < B; i++) { let s = 0; for (let j = 0; j < d.length; j++) s += d[Math.floor(rnd() * d.length)]; xs[i] = s / d.length; }
  xs.sort();
  return { n: d.length, diff: d.reduce((a, b) => a + b, 0) / d.length, lo: xs[Math.floor(0.025 * B)], hi: xs[Math.ceil(0.975 * B) - 1] };
}
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function analyze(subset) {
  const fams = [...new Set(subset.map((r) => r.family))];
  // Family score per arm = mean over conditions.
  const famScore = Object.fromEntries(fams.map((f) => [f, Object.fromEntries(ARMS.map((a) => [a, mean(subset.filter((r) => r.family === f && r.arm === a).map(score))]))]));
  const pair = (x, y) => fams.map((f) => (famScore[f][x] != null && famScore[f][y] != null ? famScore[f][x] - famScore[f][y] : null)).filter((v) => v != null);
  const perCond = Object.fromEntries(CONDS.map((c) => {
    const cs = subset.filter((r) => r.condition === c);
    const pc = (x, y) => fams.map((f) => { const a = cs.find((r) => r.family === f && r.arm === x), b = cs.find((r) => r.family === f && r.arm === y); return a && b && score(a) != null && score(b) != null ? score(a) - score(b) : null; }).filter((v) => v != null);
    const d = cs.filter((r) => r.arm === "D");
    const dp = cs.filter((r) => r.arm === "Dp");
    return [c, {
      accuracy: Object.fromEntries(ARMS.map((a) => [a, mean(cs.filter((r) => r.arm === a).map(score))])),
      promptTokens: Object.fromEntries(ARMS.map((a) => [a, mean(cs.filter((r) => r.arm === a).map((r) => r.promptTokens ?? null))])),
      DminusA: boot(pc("D", "A"), SEED + 10), DminusC: boot(pc("D", "C"), SEED + 11), CminusB: boot(pc("C", "B"), SEED + 12),
      requery: { assigned: d.length, requeried: d.filter((r) => r.requeried).length },
      dp: { noWindow: dp.filter((r) => r.fallback === "no_window").length, unreadable: dp.filter((r) => r.fallback === "unreadable").length },
    }];
  }));
  return {
    families: fams.length,
    accuracy: Object.fromEntries(ARMS.map((a) => [a, mean(fams.map((f) => famScore[f][a]))])),
    promptTokens: Object.fromEntries(ARMS.map((a) => [a, mean(subset.filter((r) => r.arm === a).map((r) => r.promptTokens ?? null))])),
    costUsd: Object.fromEntries(ARMS.map((a) => [a, mean(subset.filter((r) => r.arm === a).map((r) => r.costUsd ?? null))])),
    DminusA: boot(pair("D", "A"), SEED), DminusC: boot(pair("D", "C"), SEED + 1), CminusB: boot(pair("C", "B"), SEED + 2),
    DpMinusA: boot(pair("Dp", "A"), SEED + 3), DpMinusC: boot(pair("Dp", "C"), SEED + 4),
    requery: { assigned: subset.filter((r) => r.arm === "D").length, requeried: subset.filter((r) => r.arm === "D" && r.requeried).length },
    perCond,
  };
}

const all = analyze(rows);
const verdicts = {
  H1: { comparison: "D-A", ...all.DminusA, tokensD: all.promptTokens.D, tokensA: all.promptTokens.A, pass: all.DminusA.n > 0 && all.DminusA.lo > MARGIN && all.promptTokens.D < all.promptTokens.A },
  H2: { comparison: "D-C", ...all.DminusC, pass: null },
  H3: { comparison: "C-B", ...all.CminusB, pass: null },
};
const byLayout = Object.fromEntries(["base", "v2"].map((l) => [l, analyze(rows.filter((r) => (r.layout ?? "base") === l))]).filter(([, v]) => v.families));
const byDomain = Object.fromEntries(["document", "chart", "ui"].map((d) => [d, analyze(rows.filter((r) => r.domain === d))]));
writeJson(join(runDir, "exp2-analysis.json"), { runId, set: set.name, preregistration: "amendment 1", bootstrap: { B, seed: SEED, unit: "source family" }, metric: "content-match QA success", margin: MARGIN, verdicts, notStarted, all, byLayout, byDomain });

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const pp = (h) => (h?.n ? `${h.diff >= 0 ? "+" : ""}${(h.diff * 100).toFixed(1)}%p [${(h.lo * 100).toFixed(1)}, ${(h.hi * 100).toFixed(1)}]` : "—");
const tok = (x) => (x == null ? "—" : Math.round(x).toLocaleString("en-US"));
const verdictText = (b) => (b === null ? "descriptive" : b ? "supported" : "not supported");
const lines = [
  `# ${runId} — experiment 2 family-level analysis (pre-registration amendment 1)`,
  "",
  `Set ${set.name}, ${all.families} families, content-match QA success, family bootstrap ${B.toLocaleString("en-US")} (seed ${SEED}). not_started: ${notStarted.length}.`,
  "",
  "| hypothesis | comparison | difference [95% CI] | verdict |",
  "|---|---|---|---|",
  `| H1 (primary) | D−A (margin −5%p, tokens D ${tok(verdicts.H1.tokensD)} vs A ${tok(verdicts.H1.tokensA)}) | ${pp(verdicts.H1)} | ${verdictText(verdicts.H1.pass)} |`,
  `| H2 | D−C | ${pp(verdicts.H2)} | ${verdictText(verdicts.H2.pass)} |`,
  `| H3 | C−B | ${pp(verdicts.H3)} | ${verdictText(verdicts.H3.pass)} |`,
  "",
  `D re-request rate: ${all.requery.requeried}/${all.requery.assigned}. Exploratory Dp (pre-amendment D rule, no verdict): Dp−A ${pp(all.DpMinusA)}; Dp−C ${pp(all.DpMinusC)}.`,
  "",
  "| arm | accuracy (family mean over conditions) | mean input tokens | mean cost |",
  "|---|---|---|---|",
  ...ARMS.map((a) => `| ${a} | ${pct(all.accuracy[a])} | ${tok(all.promptTokens[a])} | $${(all.costUsd[a] ?? 0).toFixed(5)} |`),
  "",
  "| condition | A | B | C | D | E | Dp | D−A | D−C | D re-requests / assigned | Dp no-window / unreadable |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  ...CONDS.map((c) => { const x = all.perCond[c]; return `| ${c} | ${ARMS.map((a) => pct(x.accuracy[a])).join(" | ")} | ${pp(x.DminusA)} | ${pp(x.DminusC)} | ${x.requery.requeried} / ${x.requery.assigned} | ${x.dp.noWindow} / ${x.dp.unreadable} |`; }),
  "",
  ...Object.entries(byLayout).map(([k, x]) => `Layout ${k} (${x.families} families): ${ARMS.map((a) => `${a} ${pct(x.accuracy[a])}`).join(", ")}; D−A ${pp(x.DminusA)}.`),
  ...Object.entries(byDomain).map(([k, x]) => `Domain ${k} (${x.families}): ${ARMS.map((a) => `${a} ${pct(x.accuracy[a])}`).join(", ")}.`),
];
writeFileSync(join(runDir, "exp2-analysis.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
