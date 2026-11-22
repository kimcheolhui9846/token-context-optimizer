// R08: write the comparator config and the committed reference files for a scratch folder (no model calls).
// Usage (from research/): node src/r08-parity-config.mjs --scratch <S> [--rev HEAD]
// Writes <S>/committed/* with `git show <rev>:<path>` (LF bytes of the committed blobs) and <S>/parity-config.json that
// points at the fixed scratch layout used by docs/research/r08-research-product-parity.md §5:
//   <S>/bundles/<role>.mjs, <S>/runs/bench-<role>-<rep>/rows.jsonl, <S>/runs/capture-<role>-<rep>.jsonl
// Refuses to overwrite an existing config or committed file.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const S = resolve(opt("--scratch"));
const rev = opt("--rev", "HEAD");
if (!opt("--scratch")) throw new Error("missing --scratch");

// Bundle SHA-256 of the raw Git blobs (docs §1), in version order.
export const EXPECTED_BUNDLES = {
  exp3: "30b76db869c8e53a11cbd87200091e07fe986de89f4c5954b7796894b5376ae4",
  pre002: "1267f3de364b4b2ac73f3acea8e683897af075196c925412eea9fac22bbb22b4",
  post002: "98c707dab49072f8b210fe9ba3fe2cf9dde863844803666d68dbc632a25175fd",
  latest: "6265b9b4bb650c947a9ec6cd6f83b9215d0e75fd63a5e4b8a0093e6891c76fa8",
};
const COMMITTED = {
  heldout: "research/results/s3-heldout/sessions-heldout.json",
  calibration: "research/results/s3-cal-001/sessions-calibration.json",
  dev: "research/results/s3-dev-002/sessions-dev.json",
  eb001: "research/results/excerpt-bench-001/rows.jsonl",
  eb002: "research/results/excerpt-bench-002/rows.jsonl",
  p612: "research/results/p612/2026-11-02.json",
};

mkdirSync(join(S, "committed"), { recursive: true });
const out = {};
for (const [name, path] of Object.entries(COMMITTED)) {
  const file = join(S, "committed", `${name}${path.endsWith(".jsonl") ? ".jsonl" : ".json"}`);
  if (existsSync(file)) throw new Error(`refusing to overwrite ${file}`);
  writeFileSync(file, execFileSync("git", ["show", `${rev}:${path}`], { maxBuffer: 64 * 1024 * 1024 }), { flag: "wx" });
  out[name] = file;
}
const roles = Object.keys(EXPECTED_BUNDLES);
const config = {
  sessions: "out/sessions",
  committedManifests: { heldout: out.heldout, calibration: out.calibration, dev: out.dev },
  expectedBundles: EXPECTED_BUNDLES,
  reps: [1, 2],
  runs: [1, 2].flatMap((rep) => roles.map((role) => ({ role, rep, capture: join(S, "runs", `capture-${role}-${rep}.jsonl`), bench: join(S, "runs", `bench-${role}-${rep}`, "rows.jsonl") }))),
  stored: [
    { name: "excerpt-bench-001 vs exp3", rows: out.eb001, role: "exp3" },
    { name: "excerpt-bench-001 vs pre002", rows: out.eb001, role: "pre002" },
    { name: "excerpt-bench-002 vs post002", rows: out.eb002, role: "post002" },
    { name: "excerpt-bench-002 vs latest", rows: out.eb002, role: "latest" },
  ],
};
const cfg = join(S, "parity-config.json");
writeFileSync(cfg, JSON.stringify(config, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ config: cfg, committed: out }));
