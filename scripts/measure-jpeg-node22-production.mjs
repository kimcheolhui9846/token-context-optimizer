import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const node22 = process.argv[2] ?? ".artifacts/node22/node-v22.23.2-win-x64/node.exe";
const sharpModule = process.argv[3] ?? ".artifacts/task22-fixture-encoder/node_modules/sharp/dist/index.mjs";
const root = process.cwd();
const out = join(root, ".artifacts", "node22-boundary");
const validator = join(root, "dist", "src", "core", "jpeg-validation.js");
const { default: sharp } = await import(pathToFileURL(resolve(root, sharpModule)).href);

const jfif = Buffer.from([
  0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x02, 0x00,
  0x00, 0x01, 0x00, 0x01,
  0x00, 0x00,
]);

await mkdir(out, { recursive: true });
await writeFile(join(out, "child.mjs"), childSource(pathToFileURL(validator).href), "utf8");

for (const size of [2528, 2529]) {
  const raw = Buffer.alloc(size * size * 3, 128);
  const encoded = await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", force: true })
    .toBuffer();
  const bytes = Buffer.concat([encoded.subarray(0, 2), jfif, encoded.subarray(2)]);
  const path = join(out, `${size}.jpg`);
  await writeFile(path, bytes);
  const tables = tableCost(bytes);
  const accounting = 960 * Math.ceil(size / 8) * Math.ceil(size / 8) + 6 * size * size + tables.tableCost;
  const result = spawnSync(resolve(root, node22), [join(out, "child.mjs"), path], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log(JSON.stringify({
    size,
    ...tables,
    accounting,
    accountingLimit: 128 * 1024 * 1024,
    child: result.stdout.trim(),
    childStderr: result.stderr.trim(),
    exitCode: result.status,
  }));
}

const highEntropyWidth = 1824;
const highEntropyHeight = 1824;
const highEntropySeed = 0x1a2b3c4d;
const highEntropyRaw = Buffer.alloc(highEntropyWidth * highEntropyHeight * 3);
let highEntropyState = highEntropySeed;
for (let i = 0; i < highEntropyRaw.length; i++) {
  highEntropyState = (Math.imul(highEntropyState, 1664525) + 1013904223) >>> 0;
  highEntropyRaw[i] = highEntropyState >>> 24;
}
const highEntropyJpeg = await sharp(highEntropyRaw, {
  raw: { width: highEntropyWidth, height: highEntropyHeight, channels: 3 },
})
  .jpeg({ quality: 100, chromaSubsampling: "4:4:4", force: true })
  .toBuffer();
const highEntropyEncoded = Buffer.concat([
  highEntropyJpeg.subarray(0, 2),
  jfif,
  highEntropyJpeg.subarray(2),
]);
const highEntropyPath = join(out, "high-entropy-1824.jpg");
await writeFile(highEntropyPath, highEntropyEncoded);
const highEntropyTables = tableCost(highEntropyEncoded);
const highEntropyAccounting = 960 * Math.ceil(highEntropyWidth / 8) * Math.ceil(highEntropyHeight / 8) +
  6 * highEntropyWidth * highEntropyHeight + highEntropyTables.tableCost;
const highEntropyResult = spawnSync(resolve(root, node22), [join(out, "child.mjs"), highEntropyPath], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
console.log(JSON.stringify({
  name: "high-entropy",
  encoder: { sharp: sharp.versions?.sharp ?? "unknown", vips: sharp.versions?.vips ?? "unknown" },
  width: highEntropyWidth,
  height: highEntropyHeight,
  seed: highEntropySeed,
  quality: 100,
  byteLength: highEntropyEncoded.length,
  ...highEntropyTables,
  accounting: highEntropyAccounting,
  accountingLimit: 128 * 1024 * 1024,
  child: highEntropyResult.stdout.trim(),
  childStderr: highEntropyResult.stderr.trim(),
  exitCode: highEntropyResult.status,
}));

function childSource(validatorUrl) {
  return `
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { validateJpeg } from ${JSON.stringify(validatorUrl)};

const path = process.argv[2];
const bytes = await readFile(path);
const rssBefore = process.memoryUsage().rss;
const start = performance.now();
let status = "accepted";
let error = null;
let metadata = null;
try {
  metadata = validateJpeg(bytes);
} catch (caught) {
  status = "rejected";
  error = caught?.code ?? caught?.message ?? String(caught);
}
const validationMs = performance.now() - start;
const sha256 = createHash("sha256").update(bytes).digest("hex");
console.log(JSON.stringify({
  node: process.version,
  status,
  error,
  metadata,
  byteLength: bytes.length,
  sha256,
  wallMs: Number(validationMs.toFixed(2)),
  wallMsScope: "validateJpeg only; excludes SHA-256 calculation",
  rssBefore,
  rssAfter: process.memoryUsage().rss,
  maxRSS: process.resourceUsage().maxRSS,
}));
`;
}

function tableCost(bytes) {
  let offset = 2;
  let quantizationTables = 0;
  let huffmanCost = 0;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (marker === 0xdb) {
      let p = offset + 2;
      while (p < end) {
        const info = bytes[p++];
        p += (info >> 4) === 0 ? 64 : 128;
        quantizationTables += 1;
      }
    }
    if (marker === 0xc4) {
      let p = offset + 2;
      while (p < end) {
        p += 1;
        const counts = bytes.subarray(p, p + 16);
        p += 16;
        const symbols = counts.reduce((sum, value) => sum + value, 0);
        huffmanCost += 16 + symbols;
        p += symbols;
      }
    }
    offset = end;
  }
  return {
    quantizationTables,
    huffmanCost,
    tableCost: quantizationTables * 256 + huffmanCost,
  };
}
