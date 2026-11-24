// FCP: summarize the offline guard log and freeze the deterministic run outputs before scoring (protocol 6.4-6.5).
// Usage: node src/fcp-freeze-run.mjs --run <run dir> --guard-log <D03_NET_LOG file> --step <step prefix, e.g. fcp-a>
// The guard log itself stays outside the repository (it holds process ids); only per-step counts are kept.
// A step with no guard load, or any blocked attempt, marks the run as an instrumentation defect (exit 1 after writing).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PADDINGS, RUN_EVIDENCE_FILES, sha256 } from "./fcp-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [run, log, step] = ["--run", "--guard-log", "--step"].map(arg);
if (!run || !log || !step) throw new Error("--run, --guard-log and --step are required");
for (const f of ["guard-summary.json", "evidence.json"]) if (existsSync(join(run, f))) throw new Error(`${f} already exists`);

export const guardSteps = (prefix) => [`${prefix}-collect`, `${prefix}-run`, ...PADDINGS.map((p) => `${prefix}-run:p${p}`)];
const events = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const steps = {};
for (const s of guardSteps(step)) steps[s] = { guardLoads: 0, distinctPids: 0, blocked: 0 };
const pids = {};
const unknown = { guardLoads: 0, blocked: 0 };
for (const e of events) {
  const s = steps[e.step];
  if (!s) { unknown[e.event === "guard" ? "guardLoads" : "blocked"]++; continue; }
  if (e.event === "guard") { s.guardLoads++; (pids[e.step] ||= new Set()).add(e.pid); } else s.blocked++;
}
for (const [k, s] of Object.entries(steps)) s.distinctPids = pids[k]?.size ?? 0;
const blocked = Object.values(steps).reduce((a, s) => a + s.blocked, 0) + unknown.blocked;
const missing = Object.entries(steps).filter(([, s]) => s.guardLoads === 0).map(([k]) => k);
const summary = {
  steps, otherSteps: unknown, blocked, stepsWithoutGuard: missing, instrumentDefect: blocked > 0 || missing.length > 0,
  note: "guardLoads counts guard preload events per step label; a worker thread that loads the guard logs its own event under its process id",
};
writeFileSync(join(run, "guard-summary.json"), `${JSON.stringify(summary, null, 1)}\n`);
const files = Object.fromEntries(RUN_EVIDENCE_FILES.map((f) => [f, sha256(readFileSync(join(run, f)))]));
writeFileSync(join(run, "evidence.json"), `${JSON.stringify({ hashBasis: "SHA-256 of raw file bytes", files }, null, 1)}\n`);
console.log(JSON.stringify({ blocked, stepsWithoutGuard: missing, files }));
if (summary.instrumentDefect) process.exit(1);
