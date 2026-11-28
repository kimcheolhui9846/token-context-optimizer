// ko-header-strip: byte comparison of two output trees (build A/B, score A/B). Lists every file with its SHA-256.
// Usage: node src/ko-header-strip-compare.mjs --a <dir> --b <dir> [--skip score-meta.json] --out <file>
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
function walk(root, dir = root, out = []) {
  for (const n of readdirSync(dir).sort()) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(root, p, out); else out.push(relative(root, p).split("\\").join("/")); }
  return out;
}
const a = arg("--a"), b = arg("--b"), out = arg("--out"), skip = new Set((arg("--skip") || "").split(",").filter(Boolean));
if (!a || !b || !out) { console.error("usage: --a <dir> --b <dir> --out <file>"); process.exit(2); }
if (existsSync(out)) { console.error(`refusing: ${out} exists`); process.exit(2); }
const fa = walk(a).filter((f) => !skip.has(f.split("/").pop())), fb = walk(b).filter((f) => !skip.has(f.split("/").pop()));
const all = [...new Set([...fa, ...fb])].sort();
const files = all.map((f) => { const ha = fa.includes(f) ? sha(join(a, f)) : null, hb = fb.includes(f) ? sha(join(b, f)) : null; return { file: f, a: ha, b: hb, same: ha !== null && ha === hb }; });
const r = { files: files.length, same: files.filter((f) => f.same).length, differ: files.filter((f) => !f.same).map((f) => f.file), skipped: [...skip], identical: files.every((f) => f.same) };
writeFileSync(out, JSON.stringify({ ...r, list: files }, null, 1) + "\n");
console.log(JSON.stringify(r));
process.exit(r.identical ? 0 : 1);
