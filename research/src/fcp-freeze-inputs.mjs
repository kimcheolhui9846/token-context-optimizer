// FCP input freeze (protocol section 5). Compares two independent generations byte for byte, checks render quality,
// PNG format and page-SHA duplicates against R09, then writes the frozen selector input, the oracle and the manifest.
// Usage: node src/fcp-freeze-inputs.mjs --gen1 <dir> --gen2 <dir> --out <new frozen dir>
// Each <dir> = `node src/fcp-build.mjs --out <dir>` + `python tools/r09/render.py --design <dir>/design.json --font F --out <dir>`.
// Does not run OCR, the selector or the product.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pngIhdr } from "./mcp-view-comparison-lib.mjs";
import { FONT, pageShaCheck, selectorIndexOf } from "./fcp-design.mjs";
import { IMAGE_COUNT, OCR_SHA256, PRODUCT_COMMIT, sha256 } from "./fcp-lib.mjs";

export const GENERATED = ["dedup-check.json", "design.json", "gold.json", "questions.json", "render-check.json", "render.json", "token-manifest.json"];
export const ORACLE_FILES = ["design.json", "gold.json", "render.json", "render-check.json", "token-manifest.json", "dedup-check.json"];
export const FREEZE_CODE = [
  "src/fcp-design.mjs", "src/fcp-build.mjs", "src/fcp-freeze-inputs.mjs", "src/fcp-lib.mjs", "src/r09-design.mjs", "src/selector.mjs",
  "tools/r09/render.py", "package-lock.json", "tools/d03/guard/node-netguard.cjs",
];
export const R09_PAGE_COUNT = 52; // R09 dev 4 + held-out 48
const R09_IMAGE_DIRS = ["research/results/r09-bilingual/dev/images", "research/results/r09-bilingual/heldout/images"];

const here = dirname(fileURLToPath(import.meta.url));
const researchDir = join(here, "..");
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [g1, g2, out] = ["--gen1", "--gen2", "--out"].map(arg);
if (!g1 || !g2 || !out) throw new Error("--gen1, --gen2 and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const git = (args, enc = "utf8") => execFileSync("git", args, { cwd: researchDir, encoding: enc, maxBuffer: 256 * 1024 * 1024 });

// ---------------------------------------------------------------- two generations, byte for byte
const listing = (d) => [...readdirSync(d).filter((f) => f !== "images").sort(), ...readdirSync(join(d, "images")).sort().map((f) => `images/${f}`)];
const l1 = listing(g1);
const l2 = listing(g2);
if (l1.join() !== l2.join()) throw new Error(`generations list different files:\n${l1.join(",")}\n${l2.join(",")}`);
const top = l1.filter((f) => !f.startsWith("images/"));
if (top.join() !== GENERATED.join()) throw new Error(`unexpected generated files: ${top.join(",")}`);
const pngs = l1.filter((f) => f.startsWith("images/"));
if (pngs.length !== IMAGE_COUNT || pngs.some((f) => !f.endsWith(".png"))) throw new Error(`expected ${IMAGE_COUNT} PNG files`);
const genHashes = {};
const differ = [];
for (const f of l1) {
  const a = sha256(readFileSync(join(g1, f)));
  const b = sha256(readFileSync(join(g2, f)));
  genHashes[f] = a;
  if (a !== b) differ.push(f);
}
if (differ.length) throw new Error(`generations differ: ${differ.join(", ")}`);

// ---------------------------------------------------------------- render quality, PNG format, design/question consistency
const design = JSON.parse(readFileSync(join(g1, "design.json"), "utf8"));
const renderCheck = JSON.parse(readFileSync(join(g1, "render-check.json"), "utf8"));
if (renderCheck.failedImages !== 0) throw new Error(`render check failed for ${renderCheck.failedImages} images`);
const gold = JSON.parse(readFileSync(join(g1, "gold.json"), "utf8")).gold;
const shaById = {};
for (const im of design.images) {
  const bytes = readFileSync(join(g1, "images", im.file));
  const h = pngIhdr(bytes);
  if (h.bitDepth !== 8 || h.colorType !== 0 || h.interlace !== 0 || h.width !== im.page.width || h.height !== im.page.height) throw new Error(`PNG format ${im.id}`);
  if (!gold[im.id] || gold[im.id].parts.length !== 2) throw new Error(`gold parts of ${im.id}`);
  shaById[im.id] = sha256(bytes);
}
const dedup = JSON.parse(readFileSync(join(g1, "dedup-check.json"), "utf8"));
if (dedup.designProblems.length || dedup.violations.length) throw new Error("text-level duplicate check has violations");

// ---------------------------------------------------------------- page SHA duplicates against R09 (Git blobs)
const olderShas = {};
for (const dir of R09_IMAGE_DIRS) {
  for (const line of git(["ls-tree", "--full-tree", `${PRODUCT_COMMIT}:${dir}`]).split("\n").filter(Boolean)) {
    const [, , blob, name] = line.split(/\s+/);
    olderShas[`${dir}/${name}`] = sha256(git(["cat-file", "blob", blob], "buffer"));
  }
}
// ls-tree lists relative to the working directory unless --full-tree; an empty comparison set must never pass.
if (Object.keys(olderShas).length !== R09_PAGE_COUNT) throw new Error(`expected ${R09_PAGE_COUNT} R09 pages to compare, got ${Object.keys(olderShas).length}`);
const pageCheck = pageShaCheck(shaById, olderShas);
if (pageCheck.violations.length) throw new Error(`page SHA duplicates: ${pageCheck.violations.join("; ")}`);

// ---------------------------------------------------------------- write frozen folders
const sel = join(out, "selector-input");
const ora = join(out, "oracle");
mkdirSync(join(sel, "images"), { recursive: true });
mkdirSync(ora, { recursive: true });
copyFileSync(join(g1, "questions.json"), join(sel, "questions.json"));
writeFileSync(join(sel, "index.json"), `${JSON.stringify(selectorIndexOf(design, shaById), null, 1)}\n`);
for (const im of design.images) copyFileSync(join(g1, "images", im.file), join(sel, "images", im.file));
for (const f of ORACLE_FILES) copyFileSync(join(g1, f), join(ora, f));
const files = {};
for (const f of ["questions.json", "index.json"]) files[`selector-input/${f}`] = sha256(readFileSync(join(sel, f)));
for (const im of design.images) files[`selector-input/images/${im.file}`] = sha256(readFileSync(join(sel, "images", im.file)));
for (const f of ORACLE_FILES) files[`oracle/${f}`] = sha256(readFileSync(join(ora, f)));
const code = Object.fromEntries(FREEZE_CODE.map((p) => [p, git(["hash-object", p]).trim()]));
const manifest = {
  study: "FCP fresh crop padding 0 vs 4 (research/plans/2026-11-24-fresh-crop-padding-protocol.md)",
  design: design.version,
  hashBasis: "SHA-256 of raw file bytes; code entries are Git blob ids (git hash-object)",
  files,
  generation: { runs: 2, filesCompared: l1.length, identical: true, hashes: genHashes },
  renderCheck: { failedImages: renderCheck.failedImages, renderer: renderCheck.renderer, font: { file: renderCheck.font.file, sha256: renderCheck.font.sha256, version: renderCheck.font.version } },
  pageCheck,
  code,
  assets: {
    font: { file: FONT.file, sha256: FONT.sha256 },
    ocr: { file: "eng.traineddata (research/.cache)", sha256: OCR_SHA256 },
    libraries: { sharp: "0.35.4", "tesseract.js": "5.1.1", pillow: renderCheck.renderer.pillow },
  },
};
writeFileSync(join(out, "freeze-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(JSON.stringify({ files: Object.keys(files).length, generationIdentical: true, renderFailed: 0, pageViolations: 0 }));
