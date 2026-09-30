import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "../../../.artifacts/task22-fixture-encoder/node_modules/sharp/dist/index.mjs";

const output = dirname(fileURLToPath(import.meta.url));
await mkdir(output, { recursive: true });
const fixtures = [["checkedin-1x1.jpg", 1, 1], ["checkedin-odd-17x9.jpg", 17, 9], ["checkedin-multimcu-17x17.jpg", 17, 17]];
for (const [name, width, height] of fixtures) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    pixels[offset] = (x * 37 + y * 11 + 17) % 256;
    pixels[offset + 1] = (x * 13 + y * 53 + 71) % 256;
    pixels[offset + 2] = (x * 97 + y * 7 + 149) % 256;
  }
  const encoded = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90, chromaSubsampling: "4:4:4", force: true }).toBuffer();
  const jfif = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const bytes = Buffer.concat([encoded.subarray(0, 2), jfif, encoded.subarray(2)]);
  await writeFile(join(output, name), bytes);
  console.log(JSON.stringify({ name, width, height, byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
}
