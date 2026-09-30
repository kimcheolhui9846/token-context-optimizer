import jpeg from "jpeg-js";
import { describe, expect, it, vi } from "vitest";
import { validateJpeg } from "../src/core/jpeg-validation.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexImageArtifact, MemoryImageArtifactStore } from "../src/core/image-artifacts.js";
import { syntheticJpeg } from "./helpers/jpeg-synthetic.js";

function sample(): Buffer {
  const data = Buffer.alloc(17 * 9 * 4, 128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return Buffer.from(jpeg.encode({ data, width: 17, height: 9 }, 90).data);
}

function withGeometry(bytes: Buffer, width: number, height: number): Buffer {
  const result = Buffer.from(bytes);
  const sof = result.indexOf(Buffer.from([0xff, 0xc0]));
  result.writeUInt16BE(height, sof + 5);
  result.writeUInt16BE(width, sof + 7);
  return result;
}

function accountingBytes(width: number, height: number, tableCost: number): number {
  return 960 * Math.ceil(width / 8) * Math.ceil(height / 8) + 6 * width * height + tableCost;
}

function huffmanTable(spec: number, counts: number[], symbols: number[]): Buffer {
  return Buffer.from([spec, ...counts, ...symbols]);
}

function replaceDht(bytes: Buffer, payload: Buffer): Buffer {
  const start = bytes.indexOf(Buffer.from([0xff, 0xc4]));
  const length = bytes.readUInt16BE(start + 2);
  const replacement = Buffer.from([0xff, 0xc4, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
  return Buffer.concat([bytes.subarray(0, start), replacement, bytes.subarray(start + 2 + length)]);
}

function dhtPayloadWithUnusedTables(extraAcSymbols: number[]): Buffer {
  const requiredDc0 = huffmanTable(0, [1, ...Array(15).fill(0)], [0]);
  const requiredAc0 = huffmanTable(0x10, [1, ...Array(15).fill(0)], [0]);
  const unusedDc1 = huffmanTable(1, [0, 0, 0, 12, ...Array(12).fill(0)], Array.from({ length: 12 }, (_, i) => i));
  const unusedAc1 = huffmanTable(0x11, [0, extraAcSymbols.length, ...Array(14).fill(0)], extraAcSymbols);
  return Buffer.concat([requiredDc0, requiredAc0, unusedDc1, unusedAc1]);
}

describe("JPEG resource and geometry limits", () => {
  it("rejects an axis over the bounded geometry before codec execution", () => {
    expect(() => validateJpeg(withGeometry(sample(), 8193, 9))).toThrowError("image_dimensions_exceeded");
  });

  it("rejects a just-over-budget allocation estimate before entropy traversal", () => {
    const decode = vi.spyOn(jpeg, "decode");
    try {
      expect(() => validateJpeg(withGeometry(sample(), 3000, 3000))).toThrowError("jpeg_resource_limit");
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it("accepts geometry below the accounting ceiling when the scan remains exact", () => {
    expect(() => validateJpeg(sample())).not.toThrow();
  });

  it("uses the strict decoder options and the exact input bytes", () => {
    const bytes = sample();
    const decode = vi.spyOn(jpeg, "decode");
    try {
      validateJpeg(bytes);
      expect(decode).toHaveBeenCalledWith(bytes, {
        tolerantDecoding: false,
        useTArray: true,
        formatAsRGBA: false,
        maxMemoryUsageInMB: 128,
        maxResolutionInMP: 16.777216,
      });
    } finally {
      decode.mockRestore();
    }
  });

  it.each([
    ["throws", () => { throw new Error("codec failure"); }],
    ["wrong width", () => ({ width: 16, height: 9, data: new Uint8Array(17 * 9 * 3) })],
    ["wrong height", () => ({ width: 17, height: 8, data: new Uint8Array(17 * 9 * 3) })],
    ["wrong RGB length", () => ({ width: 17, height: 9, data: new Uint8Array(17 * 9 * 3 - 1) })],
  ])("maps codec %s to malformed_jpeg", (_name, result) => {
    const decode = vi.spyOn(jpeg, "decode").mockImplementation(result as never);
    try {
      expect(() => validateJpeg(sample())).toThrowError("malformed_jpeg");
    } finally {
      decode.mockRestore();
    }
  });

  it("accepts the full-entropy 2528 boundary and rejects 2529 before entropy", () => {
    const oneQuantizerAndTwoOneSymbolHuffmanTables = 256 + (16 + 1) * 2;
    const under = accountingBytes(2528, 2528, oneQuantizerAndTwoOneSymbolHuffmanTables);
    const over = accountingBytes(2529, 2529, oneQuantizerAndTwoOneSymbolHuffmanTables);
    expect(under).toBe(134206754);
    expect(over).toBe(134844776);
    const decode = vi.spyOn(jpeg, "decode").mockReturnValue({ width: 2528, height: 2528, data: Buffer.alloc(2528 * 2528 * 3) });
    try {
      expect(() => validateJpeg(syntheticJpeg({ width: 2528, height: 2528, mcuCount: 99856 }))).not.toThrow();
      expect(decode).toHaveBeenCalledTimes(1);
      decode.mockClear();
      expect(() => validateJpeg(syntheticJpeg({ width: 2529, height: 2529, mcuCount: 100000 }))).toThrowError("jpeg_resource_limit");
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it("counts unused quantization tables at 256 bytes each", () => {
    const width = 808;
    const height = 7905;
    const baseWithoutTables = accountingBytes(width, height, 0);
    const oneQuantizerAndTwoOneSymbolHuffmanTables = 256 + (16 + 1) * 2;
    const fourQuantizersAndTwoOneSymbolHuffmanTables = 4 * 256 + (16 + 1) * 2;
    const incorrect192ByteQuantizerAccounting = 4 * 192 + (16 + 1) * 2;
    expect(baseWithoutTables).toBe(134216880);
    expect(baseWithoutTables + oneQuantizerAndTwoOneSymbolHuffmanTables).toBe(134217170);
    expect(baseWithoutTables + fourQuantizersAndTwoOneSymbolHuffmanTables).toBe(134217938);
    expect(baseWithoutTables + incorrect192ByteQuantizerAccounting).toBe(134217682);
    expect(baseWithoutTables + oneQuantizerAndTwoOneSymbolHuffmanTables).toBeLessThan(128 * 1024 * 1024);
    expect(baseWithoutTables + fourQuantizersAndTwoOneSymbolHuffmanTables).toBeGreaterThan(128 * 1024 * 1024);
    expect(baseWithoutTables + incorrect192ByteQuantizerAccounting).toBeLessThan(128 * 1024 * 1024);
    const decode = vi.spyOn(jpeg, "decode").mockReturnValue({ width, height, data: Buffer.alloc(width * height * 3) });
    try {
      expect(() => validateJpeg(syntheticJpeg({ width, height, mcuCount: 99889 }))).not.toThrow();
      expect(decode).toHaveBeenCalledTimes(1);
      decode.mockClear();
      expect(() => validateJpeg(syntheticJpeg({ width, height, mcuCount: 99889, quantTableIds: [0, 1, 2, 3] }))).toThrowError("jpeg_resource_limit");
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it("counts unused Huffman tables and accepts an estimate exactly at the cap", () => {
    const width = 808;
    const height = 7905;
    const exactCapTableCost = 3 * 256 + (16 + 1) * 2 + (16 + 12) + (16 + 2);
    const overCapTableCost = 3 * 256 + (16 + 1) * 2 + (16 + 12) + (16 + 3);
    expect(accountingBytes(width, height, exactCapTableCost)).toBe(128 * 1024 * 1024);
    expect(accountingBytes(width, height, overCapTableCost)).toBe(128 * 1024 * 1024 + 1);
    const decode = vi.spyOn(jpeg, "decode").mockReturnValue({ width, height, data: Buffer.alloc(width * height * 3) });
    try {
      const exact = replaceDht(
        syntheticJpeg({ width, height, mcuCount: 99889, quantTableIds: [0, 1, 2] }),
        dhtPayloadWithUnusedTables([0, 1]),
      );
      expect(() => validateJpeg(exact)).not.toThrow();
      expect(decode).toHaveBeenCalledTimes(1);
      decode.mockClear();
      const over = replaceDht(
        syntheticJpeg({ width, height, mcuCount: 99889, quantTableIds: [0, 1, 2] }),
        dhtPayloadWithUnusedTables([0, 1, 2]),
      );
      expect(() => validateJpeg(over)).toThrowError("jpeg_resource_limit");
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it("leaves the store and source bytes unchanged when resource validation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "tco-jpeg-resource-"));
    try {
      const path = join(root, "large.jpg");
      const bytes = syntheticJpeg({ width: 2529, height: 2529 });
      await writeFile(path, bytes);
      const before = await readFile(path);
      const store = new MemoryImageArtifactStore();
      await expect(indexImageArtifact({ path, allowedRoots: [root], store })).rejects.toMatchObject({ code: "jpeg_resource_limit" });
      expect(store.size).toBe(0);
      expect(await readFile(path)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
