import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { afterEach, describe, expect, it } from "vitest";

import { indexImageArtifact, inspectImageArtifact, MemoryImageArtifactStore } from "../src/core/image-artifacts.js";
import { validateJpeg } from "../src/core/jpeg-validation.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function jpeg444(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 96;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 160;
    data[i * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width, height }, 90).data);
}

describe("JPEG artifact validation", () => {
  it("indexes a baseline 4:4:4 JPEG and re-inspects it", async () => {
    const root = await mkdtemp(join(tmpdir(), "tco-jpeg-"));
    roots.push(root);
    const path = join(root, "image.jpg");
    const bytes = jpeg444(17, 9);
    await writeFile(path, bytes);
    const before = await readFile(path);
    const store = new MemoryImageArtifactStore();
    const result = await indexImageArtifact({ path, allowedRoots: [root], store });
    expect(result).toMatchObject({
      format: "jpeg",
      mimeType: "image/jpeg",
      channels: 3,
      bitDepth: 8,
      width: 17,
      height: 9,
      validationProfile: "jpeg-ycbcr8-baseline-444-v1",
    });
    expect(await inspectImageArtifact({ artifactId: result.artifactId, allowedRoots: [root], store })).toEqual(result);
    expect(await readFile(path)).toEqual(before);
  });

  it("rejects trailing bytes and unsupported sampling without storing a record", async () => {
    const root = await mkdtemp(join(tmpdir(), "tco-jpeg-"));
    roots.push(root);
    const path = join(root, "bad.jpg");
    const valid = jpeg444(9, 9);
    const trailing = Buffer.concat([valid, Buffer.from([0x12, 0x34])]);
    await writeFile(path, trailing);
    const store = new MemoryImageArtifactStore();
    await expect(indexImageArtifact({ path, allowedRoots: [root], store })).rejects.toMatchObject({ code: "malformed_jpeg" });
    expect(store.size).toBe(0);

    const sampling = Buffer.from(valid);
    const sof = sampling.indexOf(Buffer.from([0xff, 0xc0]));
    sampling[sof + 11] = 0x22;
    await writeFile(path, sampling);
    await expect(indexImageArtifact({ path, allowedRoots: [root], store })).rejects.toMatchObject({ code: "unsupported_jpeg_profile" });
    expect(store.size).toBe(0);
  });

  it("consumes stuffed scan bytes and rejects an extra stuffed byte before EOI", () => {
    const valid = jpeg444(17, 9);
    expect(() => validateJpeg(valid)).not.toThrow();
    const eoi = valid.lastIndexOf(Buffer.from([0xff, 0xd9]));
    expect(eoi).toBeGreaterThan(0);
    const extraStuffed = Buffer.concat([valid.subarray(0, eoi), Buffer.from([0xff, 0x00]), valid.subarray(eoi)]);
    expect(() => validateJpeg(extraStuffed)).toThrowError("malformed_jpeg");
  });

  it("rejects truncated scans, zero quantizers, and undefined Huffman references", () => {
    const valid = jpeg444(9, 9);
    const eoi = valid.lastIndexOf(Buffer.from([0xff, 0xd9]));
    expect(() => validateJpeg(valid.subarray(0, eoi))).toThrowError("malformed_jpeg");
    const dqt = valid.indexOf(Buffer.from([0xff, 0xdb]));
    const zeroQuantizer = Buffer.from(valid);
    zeroQuantizer[dqt + 5] = 0;
    expect(() => validateJpeg(zeroQuantizer)).toThrowError("malformed_jpeg");
    const sos = valid.indexOf(Buffer.from([0xff, 0xda]));
    const undefinedTable = Buffer.from(valid);
    undefinedTable[sos + 6] = 0x11;
    expect(() => validateJpeg(undefinedTable)).toThrowError("malformed_jpeg");
  });
});
