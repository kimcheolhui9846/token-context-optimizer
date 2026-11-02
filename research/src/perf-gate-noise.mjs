// Strict performance gate noise analysis over the three WBS 6.12c timed runs.
//
// Reads the committed raw evidence (9 rounds x A, A-prime, B per strict
// operation) and compares two estimators of B/A and A-prime/A:
//   - median ratio: median(B) / median(A), the estimator the 6.12c gate used
//   - paired ratio: median over rounds of B_i / A_i (same round, same state)
// It also reports a seeded bootstrap interval, per-variant CV, early/late
// round drift, a pooled A/A-prime baseline, and how often each estimator would cross the 1.03 gate under
// resampling. No timing is measured here; the output is deterministic.
//
// Usage (from repository root): node research/src/perf-gate-noise.mjs [--out <file>]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceDir = "docs/research/evidence/wbs-6.12c";
const runs = [
  "measurement-attempt2.json",
  "measurement-attempt2-scancap.json",
  "measurement-attempt2-scancap-r2.json",
];
const GATE = 1.03;
const BOOT = 4000;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const cv = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) / m;
};
const round4 = (x) => Math.round(x * 1e4) / 1e4;

// Deterministic LCG so the bootstrap is reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bootstrap(a, b, seed) {
  const next = rng(seed);
  const n = a.length;
  const paired = [];
  const medianRatio = [];
  for (let k = 0; k < BOOT; k++) {
    const idx = Array.from({ length: n }, () => Math.floor(next() * n));
    paired.push(median(idx.map((i) => b[i] / a[i])));
    medianRatio.push(median(idx.map((i) => b[i])) / median(idx.map((i) => a[i])));
  }
  const ci = (xs) => {
    const s = [...xs].sort((x, y) => x - y);
    return [round4(s[Math.floor(0.025 * BOOT)]), round4(s[Math.floor(0.975 * BOOT) - 1])];
  };
  const over = (xs) => round4(xs.filter((x) => x > GATE).length / BOOT);
  return {
    pairedCi95: ci(paired),
    medianRatioCi95: ci(medianRatio),
    pairedOverGate: over(paired),
    medianRatioOverGate: over(medianRatio),
  };
}

function compare(a, b, seed) {
  return {
    medianRatio: round4(median(b) / median(a)),
    pairedRatio: round4(median(b.map((x, i) => x / a[i]))),
    ...bootstrap(a, b, seed),
  };
}

// Within each round the 6.12c harness always ran A, then A-prime, then B
// (scripts/measure-jpeg-tolerant.mjs:424-425 at main 8a149b0). The evidence
// "order" field holds the variant name, not the position.
const report = {
  schema: "perf-gate-noise/v1", source: evidenceDir, gate: GATE, bootstrap: BOOT,
  withinRoundOrder: ["A", "A-prime", "B"], runs: [],
};
let seed = 20261102;
for (const file of runs) {
  const j = JSON.parse(readFileSync(resolve(root, evidenceDir, file), "utf8"));
  const run = { file, settings: { warmups: j.settings.warmups, rounds: j.settings.rounds }, operations: {} };
  for (const [op, v] of Object.entries(j.strict)) {
    const get = (k) => {
      const samples = [...v[k].samples].sort((x, y) => x.round - y.round);
      return samples.map((s) => s.elapsedNs / 1e6);
    };
    const A = get("A"), Ap = get("A-prime"), B = get("B");
    const half = Math.ceil(A.length / 2);
    const drift = (xs) => round4(mean(xs.slice(half)) / mean(xs.slice(0, half)));
    run.operations[op] = {
      medianMs: { A: round4(median(A)), "A-prime": round4(median(Ap)), B: round4(median(B)) },
      cv: { A: round4(cv(A)), "A-prime": round4(cv(Ap)), B: round4(cv(B)) },
      lateOverEarlyMean: { A: drift(A), "A-prime": drift(Ap), B: drift(B) },
      aPrimeOverA: compare(A, Ap, seed++),
      bOverA: compare(A, B, seed++),
      bOverAPrime: compare(Ap, B, seed++),
      // Pooled baseline: per round, B_i / mean(A_i, A'_i).
      bOverPooled: compare(A.map((x, i) => (x + Ap[i]) / 2), B, seed++),
    };
  }
  report.runs.push(run);
}

// Cross-run spread of each estimator.
report.crossRun = {};
for (const op of Object.keys(report.runs[0].operations)) {
  const pick = (key, est) => report.runs.map((r) => r.operations[op][key][est]);
  const span = (xs) => round4(Math.max(...xs) - Math.min(...xs));
  report.crossRun[op] = {};
  for (const key of ["aPrimeOverA", "bOverA", "bOverAPrime", "bOverPooled"]) {
    report.crossRun[op][key] = {
      medianRatio: pick(key, "medianRatio"), medianRatioSpan: span(pick(key, "medianRatio")),
      pairedRatio: pick(key, "pairedRatio"), pairedRatioSpan: span(pick(key, "pairedRatio")),
    };
  }
}

const outIndex = process.argv.indexOf("--out");
const text = JSON.stringify(report, null, 2) + "\n";
if (outIndex > 0) writeFileSync(resolve(process.cwd(), process.argv[outIndex + 1]), text);
else process.stdout.write(text);
