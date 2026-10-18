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

  it("uses deterministic region and indexed-artifact error codes", async () => {
    const f = await fixture(png(2, 2, 3)); const store = new MemoryImageArtifactStore(); const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 0, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "region_empty" });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: -1, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "region_out_of_bounds" });
    await expect(cropImageArtifact({ artifactId: "missing", region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "artifact_not_indexed" });
    expect(new ImageValidationError("region_empty").code).toBe("region_empty");
  });
});
