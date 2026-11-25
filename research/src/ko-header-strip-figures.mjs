// ko-header-strip: registered figure cases (protocol section 8). Outside the assembly code: copies the original page and
// the built W1/W4/W5 PNGs at full resolution and stacks W1, W4, W5 into one comparison PNG (grey 160 bars, 16 px).
// Usage: node src/ko-header-strip-figures.mjs --build <dir with w1/w4/w5> --out <new dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeGray, encodeGray, sha256 } from "./ko-header-strip-png.mjs";
import { REGISTERED, git } from "./ko-header-strip-source.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const BAR = 16, BAR_LUMA = 160;

const build = arg("--build"), out = arg("--out");
if (!build || !out) { console.error("usage: --build <dir> --out <new dir>"); process.exit(2); }
if (existsSync(out)) { console.error(`refusing: ${out} exists`); process.exit(2); }
mkdirSync(out);
const index = [];
for (const { id, why } of REGISTERED.cases) {
  const page = git(["cat-file", "blob", `${REGISTERED.source.commit}:${REGISTERED.source.imageTree.path}/${id}.png`]);
  writeFileSync(join(out, `${id}-page.png`), page);
  const parts = [];
  for (const k of ["w1", "w4", "w5"]) {
    const png = readFileSync(join(build, k, `${id}.png`));
    writeFileSync(join(out, `${id}-${k}.png`), png);
    parts.push(await decodeGray(png));
  }
  const W = Math.max(...parts.map((p) => p.width));
  const rows = [];
  parts.forEach((p, i) => {
    if (i) for (let r = 0; r < BAR; r++) rows.push(Buffer.alloc(W, BAR_LUMA));
    for (let y = 0; y < p.height; y++) { const row = Buffer.alloc(W, 255); p.data.copy(row, 0, y * p.width, (y + 1) * p.width); rows.push(row); }
  });
  const sheet = await encodeGray(Buffer.concat(rows), W, rows.length);
  writeFileSync(join(out, `${id}-compare.png`), sheet);
  index.push({ id, why, files: [`${id}-page.png`, `${id}-w1.png`, `${id}-w4.png`, `${id}-w5.png`, `${id}-compare.png`], compareSha256: sha256(sheet), compare: { width: W, height: rows.length, order: ["W1", "W4", "W5"], barLuma: BAR_LUMA, barHeight: BAR } });
}
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 1) + "\n");
console.log(`figures: ${index.length} cases`);
