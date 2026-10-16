import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const outDir = join(researchDir, "out");
export const cacheDir = join(researchDir, ".cache");

// Development sets. dev1 keeps the original out/ layout so pilot-001 stays reproducible.
const SETS = {
  dev1: { dir: outDir, families: "./families.mjs", arms: ["A", "B", "E"] },
  dev2: { dir: join(outDir, "dev2"), families: "./families-dev2.mjs", arms: ["A", "B", "C", "D", "E"] },
  // C1R and C2R are derived in summarize.mjs (response-based fallback), not separate slots.
  dev3: { dir: join(outDir, "dev3"), families: "./families-dev3.mjs", arms: ["A", "C1", "C2", "E"], derived: ["C1R", "C2R"] },
  // Experiment 2 (RQ2): protocol arms A, B, C (query-aware window selector, no guard; no match -> B), E (oracle).
  // D (selector + guard + original fallback) is derived in summarize.mjs from A and C: fallback when the selector finds no
  // window or C answers UNREADABLE; its cost includes the C call (when made) and the A call used as the fallback.
  "exp2-calibration": { dir: join(outDir, "exp2-calibration"), families: "./families-exp2-calibration.mjs", arms: ["A", "B", "C", "E"], derived: ["D"], selectorArm: "window" },
  "exp2-heldout": { dir: join(outDir, "exp2-heldout"), families: "./families-exp2-heldout.mjs", arms: ["A", "B", "C", "E"], derived: ["D"], selectorArm: "window" },
};
export function getSet(argv = process.argv) {
  const name = argv.includes("--set") ? argv[argv.indexOf("--set") + 1] : "dev1";
  if (!SETS[name]) throw new Error(`unknown set ${name}`);
  return { name, ...SETS[name] };
}

// The key file lives in the main checkout's research/ so that worktrees never hold a copy.
function candidateEnvFiles() {
  const files = [];
  if (process.env.RESEARCH_ENV_FILE) files.push(process.env.RESEARCH_ENV_FILE);
  files.push(join(researchDir, ".env.local"));
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: researchDir, encoding: "utf8" }).trim();
    files.push(join(dirname(common), "research", ".env.local"));
  } catch {
    // not a git checkout; rely on the explicit candidates
  }
  return files;
}

export function loadEnv() {
  const file = candidateEnvFiles().find((f) => existsSync(f));
  const values = {};
  if (file) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const at = line.indexOf("=");
      values[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  const apiKey = process.env.OPENAI_API_KEY || values.OPENAI_API_KEY || "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY || values.ANTHROPIC_API_KEY || "";
  const budget = Number(process.env.RESEARCH_BUDGET_USD || values.RESEARCH_BUDGET_USD || "0");
  return { apiKey, anthropicKey, budgetUsd: Number.isFinite(budget) ? budget : 0, envFileFound: Boolean(file) };
}
