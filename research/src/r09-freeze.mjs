// R09: freeze manifest (pre-registration). Hashes the held-out inputs, the code and the pinned assets.
// Usage: node src/r09-freeze.mjs --dir <held-out dir> [--check <freeze-manifest.json>]
// With --check, recomputes every input hash and exits 1 on any difference (run before the measurement).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { researchDir } from "./env.mjs";
import { sha256 } from "./r09-design.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const dir = arg("--dir");
if (!dir) throw new Error("--dir is required");
const fileHash = (p) => sha256(readFileSync(p));
const inputs = {};
for (const f of ["design.json", "questions.json", "token-manifest.json", "gold.json", "render.json", "render-check.json"]) inputs[f] = fileHash(join(dir, f));
for (const f of readdirSync(join(dir, "images")).sort()) inputs[`images/${f}`] = fileHash(join(dir, "images", f));
const blob = (p) => execFileSync("git", ["hash-object", p], { cwd: researchDir, encoding: "utf8" }).trim();
const code = Object.fromEntries(["src/selector.mjs", "src/r09-design.mjs", "src/r09-lib.mjs", "src/r09-build.mjs", "src/r09-run.mjs", "src/r09-score.mjs", "src/r09-freeze.mjs", "tools/r09/render.py", "tools/r09/recount.py", "package-lock.json", "tools/d03/guard/node-netguard.cjs"].map((p) => [p, blob(p)]));
const manifest = {
  study: "R09 bilingual evidence-region selection",
  inputs,
  code,
  assets: {
    ocr: { file: "eng.traineddata (research/.cache, copied read-only from the R02 immutable research copy)", sha256: "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747" },
    font: { file: "NotoSansKR-VF.ttf (installed system font, not redistributed)", sha256: "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0" },
    libraries: { sharp: "0.35.4", "tesseract.js": "5.1.1", pillow: "12.3.0", fonttools: "4.63.0" },
  },
};
const check = arg("--check");
if (check) {
  const frozen = JSON.parse(readFileSync(check, "utf8"));
  const diffs = [];
  for (const sec of ["inputs", "code"]) for (const [k, v] of Object.entries(frozen[sec])) if (manifest[sec][k] !== v) diffs.push(`${sec}/${k}`);
  for (const sec of ["inputs", "code"]) for (const k of Object.keys(manifest[sec])) if (!(k in frozen[sec])) diffs.push(`${sec}/${k} (new)`);
  console.log(JSON.stringify({ checked: Object.keys(frozen.inputs).length + Object.keys(frozen.code).length, diffs }));
  if (diffs.length) process.exit(1);
} else {
  writeFileSync(join(dir, "freeze-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(JSON.stringify({ inputs: Object.keys(inputs).length, code: Object.keys(code).length }));
}
