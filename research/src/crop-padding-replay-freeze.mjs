// Freezes the deterministic crop padding replay outputs before scoring. Usage:
//   node src/crop-padding-replay-freeze.mjs --run <run dir> --out <evidence.json>
// The scorer refuses to read gold unless these hashes still match.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./mcp-view-comparison-lib.mjs";
import { EVIDENCE_FILES } from "./crop-padding-replay-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const run = arg("--run");
const out = arg("--out");
if (!run || !out) throw new Error("--run and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const files = Object.fromEntries(EVIDENCE_FILES.map((f) => [f, sha256(readFileSync(join(run, f)))]));
writeFileSync(out, `${JSON.stringify({ hashBasis: "SHA-256 of raw file bytes", files }, null, 1)}\n`);
console.log(JSON.stringify(files));
