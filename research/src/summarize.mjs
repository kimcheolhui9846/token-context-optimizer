// Grade responses by normalized exact match and summarize accuracy, tokens and bytes per condition x arm.
// Usage: node src/summarize.mjs [--set dev1|dev2] [--run-id <id>]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSet } from "./env.mjs";
import { readJson, writeJson } from "./common.mjs";

const args = process.argv.slice(2);
const runId = args.includes("--run-id") ? args[args.indexOf("--run-id") + 1] : "pilot-001";
const set = getSet(args);
const outDir = set.dir;
const runDir = join(outDir, "runs", runId);

export const normalize = (s) => String(s).toLowerCase().replace(/^(the answer is|answer:)\s*/, "").replace(/[\s,$"'`.*]/g, "").replace(/region$/, "");

const families = Object.fromEntries(readJson(join(outDir, "families.json")).families.map((f) => [f.id, f]));
const { slots } = readJson(join(outDir, "slots.json"));
const latest = new Map();
for (const line of readFileSync(join(runDir, "responses.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const rec = JSON.parse(line);
  if (rec.status === "ok" || !latest.has(rec.key)) latest.set(rec.key, rec);
}

const graded = slots.map((s) => {
  const key = `${s.family}/${s.question}/${s.condition}/${s.arm}`;
  const rec = latest.get(key);
  const gold = families[s.family].questions.find((q) => q.id === s.question).answers;
  if (!rec) return { key, ...s, outcome: "not_started" };
  if (rec.status !== "ok") return { key, ...s, outcome: "failure", correct: false };
  const correct = gold.some((g) => normalize(g) === normalize(rec.answer));
  // Content match: the gold value appears inside the answer (extra label words allowed, e.g. "Ref. code: X").
  const contentCorrect = correct || gold.some((g) => normalize(rec.answer).includes(normalize(g)));
  return { key, ...s, outcome: "answered", correct, contentCorrect, locate: rec.locate, twoStage: rec.twoStage, answer: rec.answer, gold: gold[0], promptTokens: rec.usage?.prompt_tokens, predictedImageTokens: rec.predictedImageTokens, latencyMs: rec.latencyMs, costUsd: rec.costUsd };
});

const CONDS = ["clean", "jpeg-only", "downscale-only", "combined"];
// Response-based fallback (pilot-003, fixed before the run): when the selector arm answers UNREADABLE, the answer
// and tokens of the same slot's A call are used as the re-request to the original; tokens are the sum of both calls.
// Experiment 2 arm D (protocol §3-§4, Task 34 decision): selector + guard + original fallback, derived from C and A.
// The guard falls back before any C call when the selector finds no window (cost = A only); when C answers UNREADABLE,
// the A call is the re-request to the assigned original (cost = C + A). Otherwise D is C.
if ((set.derived || []).includes("D") && set.selectorArm === "window") {
  for (const r of graded.filter((x) => x.arm === "C")) {
    const a = graded.find((x) => x.arm === "A" && x.family === r.family && x.question === r.question && x.condition === r.condition);
    const key = r.key.replace(/[^/]+$/, "D");
    const noMatch = !r.selection?.matched;
    const unreadable = r.outcome === "answered" && /unreadable/i.test(r.answer || "");
    if (!a) { graded.push({ ...r, arm: "D", key, outcome: "not_started" }); continue; }
    if (noMatch) graded.push({ ...a, arm: "D", key, selection: r.selection, fallback: "no_window", promptTokens: a.promptTokens, costUsd: a.costUsd });
    else if (unreadable) graded.push({ ...r, arm: "D", key, fallback: "unreadable", outcome: a.outcome, correct: a.correct, contentCorrect: a.contentCorrect, answer: a.answer, promptTokens: (r.promptTokens || 0) + (a.promptTokens || 0), bytes: r.bytes + a.bytes, costUsd: (r.costUsd || 0) + (a.costUsd || 0) });
    else graded.push({ ...r, arm: "D", key, fallback: null });
  }
}
for (const derived of (set.derived || []).filter((d) => d !== "D")) {
  const baseArm = derived.replace(/R$/, "");
  for (const r of graded.filter((x) => x.arm === baseArm)) {
    const a = graded.find((x) => x.arm === "A" && x.family === r.family && x.question === r.question && x.condition === r.condition);
    const retry = r.outcome === "answered" && /unreadable/i.test(r.answer || "");
    const key = r.key.replace(/[^/]+$/, derived);
    graded.push(retry && a
      ? { ...r, arm: derived, key, retried: true, correct: a.correct, contentCorrect: a.contentCorrect, answer: a.answer, promptTokens: (r.promptTokens || 0) + (a.promptTokens || 0), bytes: r.bytes + a.bytes, costUsd: (r.costUsd || 0) + (a.costUsd || 0) }
      : { ...r, arm: derived, key, retried: false });
  }
}
const ARMS = [...set.arms, ...(set.derived || [])];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// Runtime failures count as incorrect in the assigned denominator; not_started slots are reported separately.
function cell(rows) {
  const assigned = rows.filter((r) => r.outcome !== "not_started");
  return {
    n: rows.length,
    notStarted: rows.length - assigned.length,
    correct: assigned.filter((r) => r.correct).length,
    accuracy: assigned.length ? assigned.filter((r) => r.correct).length / assigned.length : null,
    contentAccuracy: assigned.length ? assigned.filter((r) => r.contentCorrect).length / assigned.length : null,
    meanPromptTokens: mean(assigned.filter((r) => r.promptTokens).map((r) => r.promptTokens)),
    meanBytes: mean(rows.map((r) => r.bytes)),
  };
}
const table = {};
for (const c of CONDS) for (const a of ARMS) table[`${c}/${a}`] = cell(graded.filter((r) => r.condition === c && r.arm === a));
const byArm = Object.fromEntries(ARMS.map((a) => [a, cell(graded.filter((r) => r.arm === a))]));
const bySmall = {};
for (const a of ARMS) for (const small of [true, false]) bySmall[`${a}/${small ? "small" : "normal"}`] = cell(graded.filter((r) => r.arm === a && r.smallText === small));
const byDomain = {};
for (const a of ARMS) for (const d of ["document", "chart", "ui"]) byDomain[`${a}/${d}`] = cell(graded.filter((r) => r.arm === a && r.domain === d));

// Accounting check: observed prompt tokens minus the tile-rule prediction (the rest is text + message overhead).
const answered = graded.filter((r) => r.promptTokens && !r.twoStage && set.arms.includes(r.arm));
const overheads = answered.map((r) => r.promptTokens - r.predictedImageTokens);
const accounting = { n: answered.length, overheadMin: Math.min(...overheads), overheadMax: Math.max(...overheads), distinctOverheads: [...new Set(overheads)].sort((a, b) => a - b) };
// Selector and guard (dev2): evidence coverage of C's selection, D fallback rate per condition, paired D-C.
const selector = {};
if (ARMS.includes("C")) {
  for (const c of CONDS) {
    const cs = graded.filter((r) => r.condition === c && r.arm === "C");
    const ds = graded.filter((r) => r.condition === c && r.arm === "D");
    const pairKey = (r) => `${r.family}/${r.question}`;
    const dByKey = new Map(ds.map((r) => [pairKey(r), r]));
    const diffs = cs.filter((r) => dByKey.has(pairKey(r))).map((r) => (dByKey.get(pairKey(r)).contentCorrect ? 1 : 0) - (r.contentCorrect ? 1 : 0));
    selector[c] = {
      matched: cs.filter((r) => r.selection?.matched).length,
      evidenceCoveredAmongMatched: cs.filter((r) => r.selection?.matched && r.selection?.evidenceCovered).length,
      dFallback: ds.filter((r) => r.fallback).length,
      dAssigned: ds.length,
      dMinusCContent: mean(diffs),
    };
  }
}
// Window selector (C1) and two-stage locate (C2): how often the chosen region contains the evidence box.
const regions = {};
for (const c of CONDS) {
  const c1 = graded.filter((r) => r.condition === c && r.arm === "C1");
  const c2 = graded.filter((r) => r.condition === c && r.arm === "C2" && r.locate);
  const retries = Object.fromEntries((set.derived || []).map((d) => [d, graded.filter((r) => r.condition === c && r.arm === d && r.retried).length]));
  if (c1.length || c2.length) {
    regions[c] = {
      n: c1.length || c2.length,
      c1Matched: c1.filter((r) => r.selection?.matched).length,
      c1Covered: c1.filter((r) => r.selection?.matched && r.selection?.evidenceCovered).length,
      c2Boxed: c2.filter((r) => !r.locate.fallback).length,
      c2Covered: c2.filter((r) => !r.locate.fallback && r.locate.evidenceCovered).length,
      retries,
    };
  }
}
const totals = { calls: latest.size, costUsd: [...latest.values()].reduce((a, r) => a + (r.costUsd || 0), 0) };
const errors = graded.filter((r) => r.outcome === "answered" && !r.correct).map((r) => ({ key: r.key, gold: r.gold, answer: r.answer, contentCorrect: r.contentCorrect }));

writeJson(join(runDir, "summary.json"), { runId, set: set.name, table, selector, regions, byArm, bySmall, byDomain, accounting, totals, errors });
// Per-slot grading (including derived arms) for family-level analyses (exp2-analyze.mjs).
writeFileSync(join(runDir, "graded.jsonl"), graded.map((r) => JSON.stringify({ key: r.key, family: r.family, domain: r.domain, layout: r.layout, question: r.question, smallText: r.smallText, condition: r.condition, arm: r.arm, outcome: r.outcome, correct: r.correct, contentCorrect: r.contentCorrect, answer: r.answer, promptTokens: r.promptTokens, costUsd: r.costUsd, bytes: r.bytes, fallback: r.fallback ?? null, matched: r.selection?.matched ?? null, evidenceCovered: r.selection?.evidenceCovered ?? null })).join("\n") + "\n");

const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const fmt = (x) => (x == null ? "—" : Math.round(x).toLocaleString("en-US"));
const perCell = graded.filter((r) => r.arm === "A").length / CONDS.length;
let md = `# ${runId} summary${set.name === "dev1" ? "" : ` (${set.name})`}\n\nExploratory development run. ${perCell} slots per cell${set.name === "dev1" ? " (6 families x 2 questions)" : ""}; no significance claims.\n\n`;
md += "Accuracy cells are strict exact match / content match.\n\n";
md += `| condition | ${ARMS.map((a) => `${a} acc`).join(" | ")} | ${ARMS.map((a) => `${a} tokens`).join(" | ")} | ${ARMS.map((a) => `${a} bytes`).join(" | ")} |\n|${"---|".repeat(1 + ARMS.length * 3)}\n`;
for (const c of CONDS) {
  const t = (a) => table[`${c}/${a}`];
  md += `| ${c} | ${ARMS.map((a) => `${pct(t(a).accuracy)} / ${pct(t(a).contentAccuracy)}`).join(" | ")} | ${ARMS.map((a) => fmt(t(a).meanPromptTokens)).join(" | ")} | ${ARMS.map((a) => fmt(t(a).meanBytes)).join(" | ")} |\n`;
}
md += `\nContent accuracy, small text vs normal: ${ARMS.map((a) => `${a} ${pct(bySmall[`${a}/small`].contentAccuracy)} / ${pct(bySmall[`${a}/normal`].contentAccuracy)}`).join(", ")}\n`;
md += `\nContent accuracy by domain: ${ARMS.map((a) => `${a}: ${["document", "chart", "ui"].map((d) => `${d} ${pct(byDomain[`${a}/${d}`].contentAccuracy)}`).join(", ")}`).join("; ")}\n`;
if (Object.keys(selector).length) {
  md += "\n| condition | C matched | evidence covered (of matched) | D fallback / assigned | mean D-C (content) |\n|---|---|---|---|---|\n";
  for (const c of CONDS) {
    const x = selector[c];
    md += `| ${c} | ${x.matched} | ${x.evidenceCoveredAmongMatched} | ${x.dFallback} / ${x.dAssigned} | ${x.dMinusCContent == null ? "—" : x.dMinusCContent.toFixed(3)} |\n`;
  }
}
if (Object.keys(regions).length) {
  md += "\n| condition | C1 matched | C1 covered | C2 boxed | C2 covered | retries C1R | retries C2R |\n|---|---|---|---|---|---|---|\n";
  for (const c of CONDS) {
    const x = regions[c];
    md += `| ${c} | ${x.c1Matched}/${x.n} | ${x.c1Covered} | ${x.c2Boxed}/${x.n} | ${x.c2Covered} | ${x.retries.C1R ?? "—"} | ${x.retries.C2R ?? "—"} |\n`;
  }
}
md += `\nAccounting: prompt tokens minus tile-rule image prediction ranged ${accounting.overheadMin}..${accounting.overheadMax} (values: ${accounting.distinctOverheads.join(", ")}).\n`;
md += `\nCalls ${totals.calls}, cost $${totals.costUsd.toFixed(4)}.\n\n## Strict mismatches\n\n| slot | gold | answer | content match |\n|---|---|---|---|\n`;
for (const e of errors) md += `| ${e.key} | ${e.gold} | ${String(e.answer).replace(/\|/g, "/")} | ${e.contentCorrect ? "yes" : "no"} |\n`;
writeFileSync(join(runDir, "summary.md"), md);
console.log(md);
