import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import * as pngCodec from "fast-png";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryImageArtifactStore, indexImageArtifact, inspectImageArtifact, ImageValidationError } from "../src/core/image-artifacts.js";
import { cropImageArtifact } from "../src/core/image-crop.js";
import { overviewImageArtifact } from "../src/core/image-overview.js";
import { validateJpeg, validateJpegTolerant } from "../src/core/jpeg-validation.js";
import type { ImageArtifactRecord } from "../src/core/types.js";

vi.mock("fast-png", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fast-png")>();
  return { ...actual, decode: vi.fn(actual.decode) };
});

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const roots = new Set<string>();
function crc32(bytes: Buffer): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const t = Buffer.from(type); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); t.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length); return out; }
function png(width: number, height: number, channels: 3 | 4): Buffer { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 6; const scan = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width * channels }, (_, x) => channels === 4 && x % 4 === 3 ? (x === 3 ? 0 : 255) : (x + y * width) % 251))]))); return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]); }
function opaqueRgbaPng(width: number, height: number, pixels: number[]): Buffer { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; const scan = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(pixels.slice(y * width * 4, (y + 1) * width * 4))]))); return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]); }
async function fixture(bytes: Buffer): Promise<{ root: string; path: string }> { const root = await mkdtemp(join(tmpdir(), "tco-crop-")); roots.add(root); const path = join(root, "image.png"); await writeFile(path, bytes); return { root, path }; }
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots) await rm(root, { recursive: true, force: true }); roots.clear(); });

describe("crop_image_artifact", () => {
  it("reports the installed JPEG encoder version", () => {
    const require = createRequire(import.meta.url);
    expect(require("jpeg-js/package.json").version).toBe("0.4.4");
  });
  it("crops validated RGB pixels, encodes q75 JPEG, and reports validation metadata", async () => {
    const f = await fixture(png(4, 3, 3)); const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const result = await cropImageArtifact({ artifactId: source.artifactId, region: { x: 1, y: 1, width: 2, height: 1 }, allowedRoots: [f.root], store });
    expect(result.status).toBe("cropped");
    if (result.status !== "cropped") throw new Error("expected cropped result");
    expect(result.region).toEqual({ x: 1, y: 1, width: 2, height: 1 });
    expect(result.output).toMatchObject({ width: 2, height: 1, format: "jpeg", mimeType: "image/jpeg", quality: 75, encoder: { name: "jpeg-js", version: "0.4.4" } });
    expect(result.output.byteLength).toBeGreaterThan(0); expect(result.output.sha256).toBe(createHash("sha256").update(Buffer.from(result.output.image, "base64")).digest("hex"));
  });

  it("returns the validated original for a full-frame crop without encoding", async () => {
    const f = await fixture(png(2, 2, 3)); const store = new MemoryImageArtifactStore(); const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const encode = vi.spyOn(jpeg, "encode").mockImplementation(() => { throw new Error("must not encode"); });
    const result = await cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 2, height: 2 }, allowedRoots: [f.root], store });
    expect(result).toEqual({ status: "original", fullFrame: true, source, region: { x: 0, y: 0, width: 2, height: 2 } });
    expect(encode).not.toHaveBeenCalled();
  });

  it("reencodes a q50 JPEG crop at q75 with deterministic bytes and correct pixels", async () => {
    const rgba = Buffer.from(Array.from({ length: 5 * 3 * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 7) % 256));
    const original = jpeg.encode({ data: rgba, width: 5, height: 3 }, 50).data;
    const f = await fixture(original);
    const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const decoded = jpeg.decode(original, { useTArray: true, tolerantDecoding: false });
    const encode = vi.spyOn(jpeg, "encode");
    const args = { artifactId: source.artifactId, region: { x: 1, y: 1, width: 3, height: 1 }, allowedRoots: [f.root], store };
    const first = await cropImageArtifact(args);
    const second = await cropImageArtifact(args);
    expect(first.status).toBe("cropped");
    if (first.status !== "cropped" || second.status !== "cropped") throw new Error("expected crops");
    expect(first.output.sha256).toBe(second.output.sha256);
    expect(first.output.image).toBe(second.output.image);
    expect(encode).toHaveBeenCalledTimes(2);
    expect(encode.mock.calls[0][1]).toBe(75);
    expect(encode.mock.calls[0][0].data).toEqual(Buffer.from(decoded.data.slice(24, 36)));
    const output = Buffer.from(first.output.image, "base64");
    const dqt = output.indexOf(Buffer.from([0xff, 0xdb]));
    expect(dqt).toBeGreaterThan(0);
    expect(output[dqt + 4]).toBe(0); // 8-bit luminance table 0.
    expect(output[dqt + 5]).toBe(8); // IJG q75 luminance DC; q50 is 16.
    expect(jpeg.decode(output).width).toBe(3);
    expect(await readFile(f.path)).toEqual(original);
    expect(store.size).toBe(1);
  });

  it("rejects a decoder buffer with the wrong element type even at the expected byte length", async () => {
    const bytes = png(2, 2, 3);
    const f = await fixture(bytes);
    const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const decoded = pngCodec.decode(bytes);
    vi.mocked(pngCodec.decode).mockReturnValueOnce({ ...decoded, data: new Uint16Array(6) } as never);
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "decode_failed" });
  });

  it("rejects a valid encoder output whose dimensions differ from the requested crop", async () => {
    const f = await fixture(png(2, 2, 3));
    const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const wrongSize = await readFile("tests/fixtures/jpeg/checkedin-odd-17x9.jpg");
    vi.spyOn(jpeg, "encode").mockReturnValueOnce({ data: wrongSize, width: 17, height: 9 });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "output_validation_failed" });
  });

  it("passes exact odd-region RGB samples to the encoder as opaque RGBA", async () => {
    const f = await fixture(png(3, 2, 3)); const store = new MemoryImageArtifactStore(); const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const encode = vi.spyOn(jpeg, "encode");
    await cropImageArtifact({ artifactId: source.artifactId, region: { x: 1, y: 0, width: 1, height: 2 }, allowedRoots: [f.root], store });
    const input = encode.mock.calls[0][0] as { data: Buffer; width: number; height: number };
    expect([input.width, input.height]).toEqual([1, 2]); expect(input.data.length).toBe(8); expect([...input.data.slice(0, 4)]).toEqual([3, 4, 5, 255]); expect([...input.data.slice(4, 8)]).toEqual([6, 7, 8, 255]);
  });

  it("maps encoder and output validation failures without changing source or store", async () => {
    const f = await fixture(png(2, 2, 3)); const store = new MemoryImageArtifactStore(); const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store }); const before = await readFile(f.path);
    vi.spyOn(jpeg, "encode").mockImplementationOnce(() => { throw new Error("codec"); });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 1, y: 1, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "encode_failed" });
    vi.spyOn(jpeg, "encode").mockReturnValueOnce({ data: Buffer.from([1, 2, 3]) } as never);
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 1, y: 1, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "output_validation_failed" });
    expect(await readFile(f.path)).toEqual(before); expect(store.get(source.artifactId)).toEqual(source);
  });

  it("rejects oversized crops and non-opaque partial RGBA crops", async () => {
    const rgb = await fixture(png(1537, 2, 3)); const rgba = await fixture(png(2, 2, 4)); const store = new MemoryImageArtifactStore();
    const a = await indexImageArtifact({ path: rgb.path, allowedRoots: [rgb.root], store });
    await expect(cropImageArtifact({ artifactId: a.artifactId, region: { x: 0, y: 1, width: 1537, height: 1 }, allowedRoots: [rgb.root], store })).resolves.toMatchObject({ status: "rejected", code: "resize_required" });
    const b = await indexImageArtifact({ path: rgba.path, allowedRoots: [rgba.root], store });
    await expect(cropImageArtifact({ artifactId: b.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [rgba.root], store })).rejects.toMatchObject({ code: "alpha_unsupported" });
  });

  it("accepts partial crops from tolerant opaque RGBA and preserves source metadata", async () => {
    const pixels = [10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255];
    const f = await fixture(opaqueRgbaPng(2, 2, pixels)); const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const result = await cropImageArtifact({ artifactId: source.artifactId, region: { x: 1, y: 0, width: 1, height: 2 }, allowedRoots: [f.root], store });
    expect(result.status).toBe("cropped");
    if (result.status !== "cropped") throw new Error("expected cropped result");
    expect(result.source).toEqual(source);
  });

  it("uses RGBA pixel stride and copies the requested nonuniform RGB samples", async () => {
    const pixels = [1, 2, 3, 255, 101, 102, 103, 255, 201, 202, 203, 255, 51, 52, 53, 255];
    const f = await fixture(opaqueRgbaPng(2, 2, pixels)); const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const encode = vi.spyOn(jpeg, "encode");
    await cropImageArtifact({ artifactId: source.artifactId, region: { x: 1, y: 0, width: 1, height: 2 }, allowedRoots: [f.root], store });
    const input = encode.mock.calls[0][0] as { data: Buffer };
    expect([...input.data]).toEqual([101, 102, 103, 255, 51, 52, 53, 255]);
  });

  it("rejects tolerant transparent RGBA and strict RGBA partial crops", async () => {
    const transparent = await fixture(png(2, 2, 4)); const store = new MemoryImageArtifactStore();
    const tolerant = await indexImageArtifact({ path: transparent.path, allowedRoots: [transparent.root], store, profile: "tolerant" });
    await expect(cropImageArtifact({ artifactId: tolerant.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [transparent.root], store })).rejects.toMatchObject({ code: "alpha_unsupported" });
    const strict = await indexImageArtifact({ path: transparent.path, allowedRoots: [transparent.root], store });
    store.put({ ...strict, alpha: "opaque" } as any);
    await expect(cropImageArtifact({ artifactId: strict.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [transparent.root], store })).rejects.toMatchObject({ code: "alpha_unsupported" });
  });

  it("isolates tolerant source arrays across original, rejected, and cropped crop results", async () => {
    const f = await fixture(opaqueRgbaPng(1537, 2, Array.from({ length: 1537 * 2 * 4 }, (_, index) => index % 4 === 3 ? 255 : index % 251)));
    let stored: any;
    const store = { get: () => stored, put: (record: any) => { stored = record; } };
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const original = await cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1537, height: 2 }, allowedRoots: [f.root], store });
    if (original.status !== "original") throw new Error("expected original");
    (original.source as Extract<typeof original.source, { validationProfile: "png-rgb8-tolerant-v1" }>).ignoredChunks.push("mutated-original");
    expect(stored.ignoredChunks).toEqual([]);
    const rejected = await cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1537, height: 1 }, allowedRoots: [f.root], store });
    if (rejected.status !== "rejected") throw new Error("expected rejected");
    (rejected.source as Extract<typeof rejected.source, { validationProfile: "png-rgb8-tolerant-v1" }>).ignoredChunks.push("mutated-rejected");
    expect(stored.ignoredChunks).toEqual([]);
    const cropped = await cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store });
    if (cropped.status !== "cropped") throw new Error("expected cropped");
    (cropped.source as Extract<typeof cropped.source, { validationProfile: "png-rgb8-tolerant-v1" }>).ignoredChunks.push("mutated-cropped");
    expect(stored.ignoredChunks).toEqual([]);
  });

  it("uses deterministic region and indexed-artifact error codes", async () => {
    const f = await fixture(png(2, 2, 3)); const store = new MemoryImageArtifactStore(); const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 0, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "region_empty" });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: -1, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "region_out_of_bounds" });
    await expect(cropImageArtifact({ artifactId: "missing", region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "artifact_not_indexed" });
    expect(new ImageValidationError("region_empty").code).toBe("region_empty");
  });

  it("reports source_changed for tolerant crop after bytes change", async () => {
    const f = await fixture(opaqueRgbaPng(2, 2, [1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]));
    const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    await writeFile(f.path, Buffer.concat([await readFile(f.path), Buffer.from([0])]));
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
  });

  it("maps tolerant crop metadata tampering to decode_failed without throwing TypeError", async () => {
    const base = opaqueRgbaPng(1, 1, [1, 2, 3, 255]);
    const f = await fixture(Buffer.concat([base.subarray(0, 33), chunk("caBX", Buffer.alloc(0)), chunk("tEXt", Buffer.from([1])), base.subarray(33)]));
    for (const mutate of [
      (value: any) => { delete value.ignoredChunks; },
      (value: any) => { value.ignoredChunks = "caBX"; },
      (value: any) => { value.ignoredChunks = ["other"]; },
      (value: any) => { value.ignoredChunks = ["tEXt", "caBX"]; },
      (value: any) => { delete value.alpha; },
      (value: any) => { value.alpha = "present"; },
    ]) {
      let stored: any;
      const store = { get: () => stored, put: (record: any) => { stored = record; } };
      const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
      mutate(stored);
      await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "decode_failed" });
    }
  });

  it("preserves tolerant crop error precedence around full-frame and resize cases", async () => {
    const f = await fixture(opaqueRgbaPng(2, 2, [1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]));
    const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0.5, y: 0, width: 1, height: 1 } as any, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "invalid_region" });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 0, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "region_empty" });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 2, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "region_out_of_bounds" });
    const tampered: any = store.get(source.artifactId); tampered.alpha = "present"; store.put(tampered);
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "decode_failed" });
    const full = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    await expect(cropImageArtifact({ artifactId: full.artifactId, region: { x: 0, y: 0, width: 2, height: 2 }, allowedRoots: [f.root], store })).resolves.toMatchObject({ status: "original" });
  });

  it("checks the final alpha byte and prioritizes resize over present alpha", async () => {
    const pixels = Array.from({ length: 1537 * 2 * 4 }, (_, index) => index % 4 === 3 ? 255 : index % 251);
    pixels[pixels.length - 1] = 254;
    const f = await fixture(opaqueRgbaPng(1537, 2, pixels));
    const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    expect(source).toMatchObject({ alpha: "present" });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1537, height: 1 }, allowedRoots: [f.root], store })).resolves.toMatchObject({ status: "rejected", code: "resize_required" });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "alpha_unsupported" });
  });

  it("preserves the strict crop metadata checks without adding a bitDepth check", async () => {
    const f = await fixture(png(2, 2, 3));
    const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    store.put({ ...source, bitDepth: 16 } as any);
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).resolves.toMatchObject({ status: "cropped" });
  });
});

// ===========================================================================
// WBS 6.12c Stage 2 (approved plan sections 4, 6.2 and 7): JPEG tolerant crop
// flows, source ownership, re-validation and re-read. Inputs are the pinned
// Stage 1 fixtures or a jpeg-js-encoded synthetic. Every decode is real.
// Spies on jpeg.encode only observe calls and keep the real encoder.
// ===========================================================================
type TolerantJpegRecord = Extract<ImageArtifactRecord, { validationProfile: "jpeg-ycbcr8-tolerant-v1" }>;
type KnownTolerantJpeg = Pick<TolerantJpegRecord, "width" | "height" | "coding" | "sampling" | "ignoredSegments" | "exifOrientation"> & { file: string };
type JpegTamper = [label: string, mutate: (record: Record<string, unknown>, original: TolerantJpegRecord) => void];
type Region = { x: number; y: number; width: number; height: number };

const TOLERANT_JPEG_PROFILE = "jpeg-ycbcr8-tolerant-v1" as const;
const STRICT_JPEG_PROFILE = "jpeg-ycbcr8-baseline-444-v1" as const;
const JPEG_TOLERANT_DIR = join(process.cwd(), "tests", "fixtures", "jpeg-tolerant");
const jpegTolerantPins = (JSON.parse(await readFile(join(JPEG_TOLERANT_DIR, "provenance.json"), "utf8")) as {
  fixtures: Array<{ file: string; sha256: string; byteLength: number }>;
}).fixtures;
const REPEAT_ORDER = ["COM", "APP15", "APP1", "APP3", "APP2", "APP14", "APP4", "APP5", "APP6", "APP7", "APP8", "APP9", "APP10", "APP11", "APP12", "APP13"];
const HC444: KnownTolerantJpeg = { file: "hc-444-16x8-app0.jpg", width: 16, height: 8, coding: "baseline", sampling: "1x1,1x1,1x1", ignoredSegments: ["APP0"], exifOrientation: null };
const MIXED: KnownTolerantJpeg = { file: "metadata-mixed.jpg", width: 32, height: 16, coding: "baseline", sampling: "2x2,1x1,1x1", ignoredSegments: ["APP1", "APP2", "APP13", "COM", "APP14"], exifOrientation: 6 };
const PLAN_DECODE = { tolerantDecoding: false, useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 256, maxResolutionInMP: 16.777216 } as const;
const STRICT_OUTPUT = { channels: 3, format: "jpeg", mimeType: "image/jpeg", validationProfile: STRICT_JPEG_PROFILE } as const;
const A7_CASES: KnownTolerantJpeg[] = [
  { file: "sharp-baseline-420-50x34.jpg", width: 50, height: 34, coding: "baseline", sampling: "2x2,1x1,1x1", ignoredSegments: [], exifOrientation: null },
  { file: "sharp-progressive-420-50x34.jpg", width: 50, height: 34, coding: "progressive", sampling: "2x2,1x1,1x1", ignoredSegments: [], exifOrientation: null },
  { file: "exif-ii-orient6.jpg", width: 32, height: 16, coding: "baseline", sampling: "2x2,1x1,1x1", ignoredSegments: ["APP1"], exifOrientation: 6 },
  { file: "hc-422v-16x32-app0.jpg", width: 16, height: 32, coding: "baseline", sampling: "1x2,1x1,1x1", ignoredSegments: ["APP0"], exifOrientation: null },
  { file: "hc-sof1-32x16.jpg", width: 32, height: 16, coding: "extended", sampling: "2x2,1x1,1x1", ignoredSegments: ["APP0"], exifOrientation: null },
];

const TOLERANT_JPEG_TAMPERS: JpegTamper[] = [
  ["width", (r, o) => { r.width = o.width + 1; }],
  ["height", (r, o) => { r.height = o.height - 1; }],
  ["channels", (r) => { r.channels = 4; }],
  ["bitDepth", (r) => { r.bitDepth = 16; }],
  ["format", (r) => { r.format = "png"; }],
  ["mimeType", (r) => { r.mimeType = "image/png"; }],
  ["validationProfile strict downgrade", (r) => { r.validationProfile = STRICT_JPEG_PROFILE; }],
  ["validationProfile png tolerant", (r) => { r.validationProfile = "png-rgb8-tolerant-v1"; }],
  ["validationProfile unknown", (r) => { r.validationProfile = "invalid-profile"; }],
  ["coding value", (r, o) => { r.coding = o.coding === "progressive" ? "baseline" : "progressive"; }],
  ["coding missing", (r) => { delete r.coding; }],
  ["sampling value", (r, o) => { r.sampling = o.sampling === "1x1,1x1,1x1" ? "2x2,1x1,1x1" : "1x1,1x1,1x1"; }],
  ["sampling missing", (r) => { delete r.sampling; }],
  ["exifOrientation value", (r, o) => { r.exifOrientation = o.exifOrientation === 6 ? 1 : 6; }],
  ["exifOrientation type", (r, o) => { r.exifOrientation = String(o.exifOrientation); }],
  ["exifOrientation missing", (r) => { delete r.exifOrientation; }],
  ["ignoredSegments value", (r, o) => { r.ignoredSegments = [...o.ignoredSegments.slice(0, -1), "APP15"]; }],
  ["ignoredSegments emptied", (r) => { r.ignoredSegments = []; }],
  ["ignoredSegments order", (r, o) => { r.ignoredSegments = [...o.ignoredSegments].reverse(); }],
  ["ignoredSegments missing", (r) => { delete r.ignoredSegments; }],
  ["ignoredSegments null", (r) => { r.ignoredSegments = null; }],
  ["ignoredSegments string", (r, o) => { r.ignoredSegments = o.ignoredSegments.join(","); }],
];

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function pinnedTolerantBytes(name: string): Promise<Buffer> {
  const bytes = await readFile(join(JPEG_TOLERANT_DIR, name));
  const pin = jpegTolerantPins.find((entry) => entry.file === name);
  expect(pin, name).toBeDefined();
  expect(bytes.length, name).toBe(pin!.byteLength);
  expect(sha256Hex(bytes), name).toBe(pin!.sha256);
  return bytes;
}

async function writeTolerantSource(bytes: Buffer): Promise<{ root: string; path: string; canonical: string; bytes: Buffer }> {
  const root = await mkdtemp(join(tmpdir(), "tco-crop-jpeg-tolerant-"));
  roots.add(root);
  const path = join(root, "source.jpg");
  await writeFile(path, bytes);
  return { root, path, canonical: await realpath(path), bytes };
}

async function tolerantJpegFixture(name: string) {
  return writeTolerantSource(await pinnedTolerantBytes(name));
}

function knownTolerantRecord(known: KnownTolerantJpeg, source: { canonical: string; bytes: Buffer }): TolerantJpegRecord {
  const sha = sha256Hex(source.bytes);
  const identity = createHash("sha256").update(`${source.canonical}\0${sha}\0${TOLERANT_JPEG_PROFILE}`).digest("hex");
  return {
    artifactId: `image_${identity.slice(0, 16)}`, path: source.canonical, sha256: sha, byteLength: source.bytes.length,
    format: "jpeg", mimeType: "image/jpeg", width: known.width, height: known.height, channels: 3, bitDepth: 8,
    validationProfile: TOLERANT_JPEG_PROFILE, coding: known.coding, sampling: known.sampling,
    ignoredSegments: [...known.ignoredSegments], exifOrientation: known.exifOrientation,
  };
}

async function fabricatedTolerantJpeg(known: KnownTolerantJpeg) {
  const fixture = await tolerantJpegFixture(known.file);
  expect(validateJpegTolerant(fixture.bytes)).toEqual({
    width: known.width, height: known.height, channels: 3, format: "jpeg", mimeType: "image/jpeg",
    validationProfile: TOLERANT_JPEG_PROFILE, coding: known.coding, sampling: known.sampling,
    ignoredSegments: [...known.ignoredSegments], exifOrientation: known.exifOrientation,
  });
  return { ...fixture, record: knownTolerantRecord(known, fixture) };
}

function tampersFor(record: TolerantJpegRecord): JpegTamper[] {
  return TOLERANT_JPEG_TAMPERS.filter(([label]) => label !== "ignoredSegments order" || record.ignoredSegments.length > 1);
}

function tamperedCopy(record: TolerantJpegRecord, mutate: JpegTamper[1]): ImageArtifactRecord {
  const copy: Record<string, unknown> = { ...record, ignoredSegments: [...record.ignoredSegments] };
  mutate(copy, record);
  return copy as unknown as ImageArtifactRecord;
}

async function outcomeCode(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => "resolved", (error: unknown) => (error as { code?: string }).code ?? `uncoded:${String(error)}`);
}

function everyDecodeFailed(tampers: JpegTamper[]): Record<string, string> {
  return Object.fromEntries(tampers.map(([label]) => [label, "decode_failed"]));
}

// Expected encoder input: decoded RGB at stored-pixel coordinates as opaque RGBA.
function regionRgba(rgb: Uint8Array, sourceWidth: number, region: Region): Buffer {
  const out = Buffer.alloc(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
    const from = ((region.y + y) * sourceWidth + region.x + x) * 3;
    const to = (y * region.width + x) * 4;
    out[to] = rgb[from]; out[to + 1] = rgb[from + 1]; out[to + 2] = rgb[from + 2]; out[to + 3] = 255;
  }
  return out;
}

function encoderInput(spy: { mock: { calls: Array<Parameters<typeof jpeg.encode>> } }, call: number): Buffer {
  return Buffer.from(spy.mock.calls[call][0].data as Uint8Array);
}

// 1600x8 jpeg-js (strict 4:4:4) image with a COM comment and the pinned EXIF
// orientation-6 APP1 payload from exif-ii-orient6.jpg; jpeg-js writes APP0, COM, APP1.
async function wideSyntheticTolerantJpeg(): Promise<Buffer> {
  const width = 1600; const height = 8;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    rgba[i] = (x * 7 + y * 13) % 256; rgba[i + 1] = (x * 3) % 256; rgba[i + 2] = (y * 29 + x) % 256; rgba[i + 3] = 255;
  }
  const exifSource = await pinnedTolerantBytes("exif-ii-orient6.jpg");
  expect(exifSource.readUInt16BE(2)).toBe(0xffe1);
  const exifBuffer = Buffer.from(exifSource.subarray(6, 4 + exifSource.readUInt16BE(4)));
  expect(exifBuffer.subarray(0, 6).toString("latin1")).toBe("Exif\0\0");
  return Buffer.from(jpeg.encode({ data: rgba, width, height, comments: ["wbs-6.12c stage2 synthetic"], exifBuffer } as Parameters<typeof jpeg.encode>[0], 90).data);
}

describe("WBS 6.12c JPEG tolerant crop (Stage 2)", () => {
  it.each(A7_CASES)("A7 tolerant $file: index -> inspect -> crop -> overview in stored-pixel coordinates without rotation", async (known) => {
    const f = await tolerantJpegFixture(known.file);
    const store = new MemoryImageArtifactStore();
    const expected = knownTolerantRecord(known, f);
    const args = { allowedRoots: [f.root], store };
    expect(await indexImageArtifact({ path: f.path, profile: "tolerant", ...args })).toStrictEqual(expected);
    await expect(inspectImageArtifact({ artifactId: expected.artifactId, ...args })).resolves.toStrictEqual(expected);
    const decoded = jpeg.decode(f.bytes, PLAN_DECODE);
    expect([decoded.width, decoded.height, decoded.data.length]).toEqual([known.width, known.height, known.width * known.height * 3]);
    // EXIF orientation is not applied: the transposed frame is out of bounds.
    await expect(cropImageArtifact({ artifactId: expected.artifactId, region: { x: 0, y: 0, width: known.height, height: known.width }, ...args })).rejects.toMatchObject({ code: "region_out_of_bounds" });
    const encode = vi.spyOn(jpeg, "encode");
    const region = { x: known.width - 7, y: known.height - 5, width: 7, height: 5 };
    const cropped = await cropImageArtifact({ artifactId: expected.artifactId, region, ...args });
    if (cropped.status !== "cropped") throw new Error(`expected cropped, got ${cropped.status}`);
    expect(cropped.source).toStrictEqual(expected);
    expect(cropped.region).toEqual(region);
    expect(encoderInput(encode, 0)).toEqual(regionRgba(decoded.data, known.width, region));
    expect(cropped.output.validation).toEqual({ width: 7, height: 5, ...STRICT_OUTPUT });
    expect(validateJpeg(Buffer.from(cropped.output.image, "base64"))).toEqual(cropped.output.validation);
    const overview = await overviewImageArtifact({ artifactId: expected.artifactId, ...args });
    expect(overview.source).toStrictEqual(expected);
    expect(overview.output.validation).toEqual({ width: known.width, height: known.height, ...STRICT_OUTPUT });
    expect(encoderInput(encode, 1)).toEqual(regionRgba(decoded.data, known.width, { x: 0, y: 0, width: known.width, height: known.height }));
    expect(validateJpeg(Buffer.from(overview.output.image, "base64"))).toEqual(overview.output.validation);
    expect(encode).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(1);
    expect(await readFile(f.path)).toEqual(f.bytes);
  });

  it("A8 repeats-with-app0.jpg: the full first-seen ignoredSegments array reaches index, inspect, crop original/cropped and overview sources", async () => {
    const known: KnownTolerantJpeg = { file: "repeats-with-app0.jpg", width: 32, height: 16, coding: "baseline", sampling: "2x2,1x1,1x1", ignoredSegments: ["APP0", ...REPEAT_ORDER], exifOrientation: 3 };
    const f = await tolerantJpegFixture(known.file);
    const store = new MemoryImageArtifactStore();
    const expected = knownTolerantRecord(known, f);
    const args = { artifactId: expected.artifactId, allowedRoots: [f.root], store };
    expect(await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" })).toStrictEqual(expected);
    await expect(inspectImageArtifact(args)).resolves.toStrictEqual(expected);
    const original = await cropImageArtifact({ ...args, region: { x: 0, y: 0, width: 32, height: 16 } });
    expect(original).toMatchObject({ status: "original", fullFrame: true });
    expect(original.source).toStrictEqual(expected);
    const cropped = await cropImageArtifact({ ...args, region: { x: 4, y: 4, width: 8, height: 8 } });
    expect(cropped).toMatchObject({ status: "cropped" });
    expect(cropped.source).toStrictEqual(expected);
    expect((await overviewImageArtifact(args)).source).toStrictEqual(expected);
    expect(store.size).toBe(1);
  });

  it("ownership and resize: a 1600x8 jpeg-js synthetic with COM and EXIF APP1 isolates tolerant source arrays across original, rejected and cropped results of a reference-returning store", async () => {
    const bytes = await wideSyntheticTolerantJpeg();
    const f = await writeTolerantSource(bytes);
    const order = ["APP0", "COM", "APP1"];
    const expected = knownTolerantRecord({ file: "synthetic", width: 1600, height: 8, coding: "baseline", sampling: "1x1,1x1,1x1", ignoredSegments: order, exifOrientation: 6 }, f);
    let stored: any;
    const store = { get: () => stored, put: (record: ImageArtifactRecord) => { stored = record; } };
    const args = { artifactId: expected.artifactId, allowedRoots: [f.root], store };
    expect(await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" })).toStrictEqual(expected);
    const mutateSource = (source: ImageArtifactRecord, tag: string) => {
      const segments = (source as TolerantJpegRecord).ignoredSegments;
      expect(segments, tag).not.toBe(stored.ignoredSegments);
      segments.push(tag);
      segments.reverse();
      expect(stored.ignoredSegments, tag).toEqual(order);
    };
    const original = await cropImageArtifact({ ...args, region: { x: 0, y: 0, width: 1600, height: 8 } });
    expect(original).toMatchObject({ status: "original", fullFrame: true });
    expect(original.source).toStrictEqual(expected);
    mutateSource(original.source, "mutated-original");
    const rejected = await cropImageArtifact({ ...args, region: { x: 0, y: 0, width: 1537, height: 1 } });
    expect(rejected).toMatchObject({ status: "rejected", code: "resize_required", fullFrame: false });
    expect(rejected.source).toStrictEqual(expected);
    mutateSource(rejected.source, "mutated-rejected");
    await expect(cropImageArtifact({ ...args, region: { x: 1599, y: 0, width: 2, height: 1 } })).rejects.toMatchObject({ code: "region_out_of_bounds" });
    const encode = vi.spyOn(jpeg, "encode");
    const region = { x: 1590, y: 0, width: 10, height: 8 };
    const cropped = await cropImageArtifact({ ...args, region });
    if (cropped.status !== "cropped") throw new Error(`expected cropped, got ${cropped.status}`);
    expect(cropped.source).toStrictEqual(expected);
    expect(encoderInput(encode, 0)).toEqual(regionRgba(jpeg.decode(bytes, PLAN_DECODE).data, 1600, region));
    expect(cropped.output.validation).toEqual({ width: 10, height: 8, ...STRICT_OUTPUT });
    expect(validateJpeg(Buffer.from(cropped.output.image, "base64"))).toEqual(cropped.output.validation);
    mutateSource(cropped.source, "mutated-cropped");
    await expect(inspectImageArtifact(args)).resolves.toStrictEqual(expected);
    expect(stored).toStrictEqual(expected);
    expect(await readFile(f.path)).toEqual(bytes);
  });

  it("metadata tamper on a fabricated tolerant record for strict-supported hc-444-16x8-app0.jpg: crop reports decode_failed for every field without encoding, while the untampered record crops", async () => {
    const f = await fabricatedTolerantJpeg(HC444);
    const tampers = tampersFor(f.record);
    const encode = vi.spyOn(jpeg, "encode");
    const codes: Record<string, string> = {};
    for (const [label, mutate] of tampers) {
      const tampered = tamperedCopy(f.record, mutate);
      const put = vi.fn();
      codes[label] = await outcomeCode(cropImageArtifact({ artifactId: f.record.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store: { get: () => tampered, put } }));
      expect(put, label).not.toHaveBeenCalled();
    }
    expect(codes).toEqual(everyDecodeFailed(tampers));
    expect(encode).not.toHaveBeenCalled();
    const control = await cropImageArtifact({ artifactId: f.record.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store: { get: () => f.record, put: vi.fn() } });
    expect(control).toMatchObject({ status: "cropped", source: knownTolerantRecord(HC444, f) });
    expect(await readFile(f.path)).toEqual(f.bytes);
  });

  it("metadata tamper on an indexed metadata-mixed.jpg record: crop reports decode_failed for every field including ignoredSegments order without encoding", async () => {
    const f = await tolerantJpegFixture(MIXED.file);
    let stored: any;
    const store = { get: () => stored, put: (record: ImageArtifactRecord) => { stored = record; } };
    const original = knownTolerantRecord(MIXED, f);
    expect(await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" })).toStrictEqual(original);
    const tampers = tampersFor(original);
    const encode = vi.spyOn(jpeg, "encode");
    const codes: Record<string, string> = {};
    for (const [label, mutate] of tampers) {
      stored = tamperedCopy(original, mutate);
      codes[label] = await outcomeCode(cropImageArtifact({ artifactId: original.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store }));
    }
    expect(codes).toEqual(everyDecodeFailed(tampers));
    expect(encode).not.toHaveBeenCalled();
    expect(sha256Hex(await readFile(f.path))).toBe(original.sha256);
  });

  it("re-read: crop of an indexed tolerant JPEG replaced by a valid re-encoded JPEG at the same path is source_changed without encoding", async () => {
    const f = await tolerantJpegFixture("sharp-progressive-420-50x34.jpg");
    const store = new MemoryImageArtifactStore();
    const indexed = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    expect(indexed).toMatchObject({ validationProfile: TOLERANT_JPEG_PROFILE, coding: "progressive" });
    const rgba = jpeg.decode(f.bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false });
    const replacement = Buffer.from(jpeg.encode({ data: rgba.data, width: rgba.width, height: rgba.height }, 90).data);
    expect(sha256Hex(replacement)).not.toBe(indexed.sha256);
    expect(validateJpegTolerant(replacement)).toMatchObject({ width: 50, height: 34, validationProfile: TOLERANT_JPEG_PROFILE });
    await writeFile(f.path, replacement);
    const encode = vi.spyOn(jpeg, "encode");
    await expect(cropImageArtifact({ artifactId: indexed.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed", message: "source_changed" });
    await expect(cropImageArtifact({ artifactId: indexed.artifactId, region: { x: 0, y: 0, width: 50, height: 34 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
    expect(encode).not.toHaveBeenCalled();
    expect(store.get(indexed.artifactId)).toStrictEqual(indexed);
  });
});
