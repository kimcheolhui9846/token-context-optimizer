import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import * as pngCodec from "fast-png";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryImageArtifactStore, indexImageArtifact, ImageValidationError } from "../src/core/image-artifacts.js";
import { cropImageArtifact } from "../src/core/image-crop.js";

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
