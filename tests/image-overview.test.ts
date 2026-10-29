import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageValidationError, MemoryImageArtifactStore, indexImageArtifact, inspectImageArtifact } from "../src/core/image-artifacts.js";
import { areaAverageRgba, overviewImageArtifact } from "../src/core/image-overview.js";
import { cropImageArtifact } from "../src/core/image-crop.js";
import * as jpegValidation from "../src/core/jpeg-validation.js";
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(bytes: Buffer): number { let crc = 0xffffffff; for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
} return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const t = Buffer.from(type); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); t.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length); return out; }
function png(width: number, height: number, channels: 3 | 4, pixels?: number[]): Buffer { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 6; const values = pixels ?? Array.from({ length: width * height * channels }, (_, i) => channels === 4 && i % 4 === 3 ? 255 : i % 251); const scan = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(values.slice(y * width * channels, (y + 1) * width * channels))]))); return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]); }
const roots = new Set<string>();
async function fixture(bytes: Buffer) { const root = await mkdtemp(join(tmpdir(), "tco-overview-")); roots.add(root); const path = join(root, "image.png"); await writeFile(path, bytes); return { root, path }; }
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots)
    await rm(root, { recursive: true, force: true }); roots.clear(); });
describe("areaAverageRgba", () => {
    it("averages a 2x2 RGB checker into one opaque pixel", () => expect([...areaAverageRgba(Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0]), 2, 2, 3, 1, 1)]).toEqual([128, 128, 128, 255]));
    it("keeps a 7x5 constant RGB frame constant when reduced to 3x2", () => expect([...areaAverageRgba(new Uint8Array(7 * 5 * 3).fill(137), 7, 5, 3, 3, 2)]).toEqual(new Array(3 * 2).fill(0).flatMap(() => [137, 137, 137, 255])));
    it("uses exact integer overlap weights for nonuniform reduction", () => expect([...areaAverageRgba(Uint8Array.from([0, 0, 0, 90, 90, 90, 240, 240, 240]), 3, 1, 3, 2, 1)]).toEqual([30, 30, 30, 255, 190, 190, 190, 255]));
    it("preserves pixels and alpha on a 1:1 RGBA resample", () => expect([...areaAverageRgba(Uint8Array.from([1, 2, 3, 255, 101, 102, 103, 254]), 2, 1, 4, 2, 1)]).toEqual([1, 2, 3, 255, 101, 102, 103, 255]));
    it("keeps all-255 full-frame rounding numerators exact beyond Uint32 range", () => {
        const pixels = new Uint8Array(4096 * 4096 * 3).fill(255);
        expect([...areaAverageRgba(pixels, 4096, 4096, 3, 1, 1)]).toEqual([255, 255, 255, 255]);
    });
});
describe("overviewImageArtifact", () => {
    it("returns a deterministic q75 JPEG with source metadata and hash", async () => {
        const f = await fixture(png(2, 2, 3));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        const result = await overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store });
        expect(result.source).toEqual(source);
        expect(result.output).toMatchObject({ width: 2, height: 2, format: "jpeg", mimeType: "image/jpeg", quality: 75, resample: "area-average-v1", encoder: { name: "jpeg-js", version: "0.4.4" } });
        const bytes = Buffer.from(result.output.image, "base64");
        expect(result.output.byteLength).toBe(bytes.length);
        expect(result.output.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
        expect(result.output.validation.width).toBe(2);
        expect(store.size).toBe(1);
    });
    it("uses maxSide only when reduction is needed and handles extreme aspect ratios", async () => {
        const f = await fixture(png(8192, 1, 3));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store, maxSide: 512 })).resolves.toMatchObject({ output: { width: 512, height: 1 } });
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).resolves.toMatchObject({ output: { width: 512, height: 1 } });
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store, maxSide: undefined })).resolves.toMatchObject({ output: { width: 512, height: 1 } });
        expect(store.size).toBe(1);
    });
    it("covers constant, square, wide, and tall output dimensions", async () => {
        const cases: Array<[
            number,
            number,
            number | undefined,
            number,
            number
        ]> = [
            [7, 5, 64, 7, 5], [400, 300, undefined, 400, 300],
            [400, 300, 64, 64, 48], [64, 64, 64, 64, 64],
            [1536, 1536, 1536, 1536, 1536], [1, 8192, 512, 1, 512],
        ];
        for (const [width, height, maxSide, expectedWidth, expectedHeight] of cases) {
            const f = await fixture(png(width, height, 3, Array(width * height * 3).fill(7)));
            const store = new MemoryImageArtifactStore();
            const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
            const result = await overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store, maxSide });
            expect(result.output).toMatchObject({ width: expectedWidth, height: expectedHeight });
            expect(jpegValidation.validateJpeg(Buffer.from(result.output.image, "base64")))
                .toMatchObject({ width: expectedWidth, height: expectedHeight });
        }
    });
    it("produces identical bytes for repeated calls and equivalent RGB/RGBA inputs", async () => {
        const rgb = await fixture(png(2, 2, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
        const rgba = await fixture(png(2, 2, 4, [1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]));
        const store = new MemoryImageArtifactStore();
        const a = await indexImageArtifact({ path: rgb.path, allowedRoots: [rgb.root], store });
        const b = await indexImageArtifact({ path: rgba.path, allowedRoots: [rgba.root], profile: "tolerant", store });
        const first = await overviewImageArtifact({ artifactId: a.artifactId, allowedRoots: [rgb.root], store });
        const second = await overviewImageArtifact({ artifactId: a.artifactId, allowedRoots: [rgb.root], store });
        const other = await overviewImageArtifact({ artifactId: b.artifactId, allowedRoots: [rgba.root], store });
        expect(first.output.image).toBe(second.output.image);
        expect(first.output.image).toBe(other.output.image);
        expect(first.output.sha256).toBe(second.output.sha256);
        expect(store.size).toBe(2);
    });
    it("rejects strict RGBA alpha and does not encode after source validation failure", async () => {
        const f = await fixture(png(1, 1, 4, [1, 2, 3, 255]));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        const encode = vi.spyOn(jpeg, "encode");
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "alpha_unsupported" });
        expect(encode).not.toHaveBeenCalled();
    });
    it("accepts an indexed JPEG source", async () => {
        const bytes = Buffer.from(jpeg.encode({ data: Buffer.from([1, 2, 3, 255]), width: 1, height: 1 }, 75).data);
        const f = await fixture(bytes);
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).resolves.toMatchObject({ source: { format: "jpeg" }, output: { format: "jpeg", width: 1, height: 1 } });
    });
    it("rejects invalid input before lookup and unknown ids after input validation", async () => {
        const store = new MemoryImageArtifactStore();
        await expect(overviewImageArtifact({ artifactId: "", store })).rejects.toMatchObject({ code: "invalid_overview_input" });
        await expect(overviewImageArtifact({ artifactId: "x", maxSide: 63, store })).rejects.toMatchObject({ code: "invalid_overview_input" });
        await expect(overviewImageArtifact({ artifactId: "x", store })).rejects.toMatchObject({ code: "artifact_not_indexed" });
    });
    it.each([null, "512", 512.5, 0, 1537, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid maxSide %s", async (maxSide) => {
        await expect(overviewImageArtifact({ artifactId: "x", maxSide: maxSide as never, store: new MemoryImageArtifactStore() })).rejects.toMatchObject({ code: "invalid_overview_input" });
    });
    it("preserves tolerant opaque RGBA source and rejects nonopaque alpha", async () => {
        const opaque = await fixture(png(1, 1, 4, [1, 2, 3, 255]));
        const transparent = await fixture(png(1, 1, 4, [1, 2, 3, 254]));
        const store = new MemoryImageArtifactStore();
        const a = await indexImageArtifact({ path: opaque.path, allowedRoots: [opaque.root], profile: "tolerant", store });
        const b = await indexImageArtifact({ path: transparent.path, allowedRoots: [transparent.root], profile: "tolerant", store });
        await expect(overviewImageArtifact({ artifactId: a.artifactId, allowedRoots: [opaque.root], store })).resolves.toMatchObject({ source: a });
        await expect(overviewImageArtifact({ artifactId: b.artifactId, allowedRoots: [transparent.root], store })).rejects.toMatchObject({ code: "alpha_unsupported" });
    });
    it("maps source changes and tolerant metadata tampering to their contract errors", async () => {
        const f = await fixture(png(1, 1, 4, [1, 2, 3, 255]));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
        await writeFile(f.path, Buffer.concat([await readFile(f.path), Buffer.from([0])]));
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
        const f2 = await fixture(png(1, 1, 4, [1, 2, 3, 255]));
        const source2 = await indexImageArtifact({ path: f2.path, allowedRoots: [f2.root], profile: "tolerant", store });
        store.put({ ...source2, ignoredChunks: "bad" } as any);
        await expect(overviewImageArtifact({ artifactId: source2.artifactId, allowedRoots: [f2.root], store })).rejects.toMatchObject({ code: "decode_failed" });
    });
    it("does not mutate a custom store record", async () => {
        const f = await fixture(png(1, 1, 3));
        let record: any;
        const store = { get: () => record, put: (value: any) => { record = value; } };
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        const before = JSON.stringify(record);
        const result = await overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store });
        expect(JSON.stringify(record)).toBe(before);
        expect(result.source).not.toBe(record);
    });
    it("isolates tolerant ignored-chunk arrays returned by a custom store", async () => {
        const base = png(2, 2, 4);
        const ancillary = Buffer.concat([base.subarray(0, 33), chunk("sRGB", Buffer.from([0])), chunk("gAMA", Buffer.from([0, 0, 0, 1])), chunk("pHYs", Buffer.alloc(9)), base.subarray(33)]);
        const f = await fixture(ancillary);
        let stored: any;
        const store = { get: () => stored, put: (value: any) => { stored = value; } };
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
        const result = await overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store });
        (result.source as any).ignoredChunks.push("mutated");
        (result.source as any).ignoredChunks.reverse();
        expect(stored.ignoredChunks).toEqual(["sRGB", "gAMA", "pHYs"]);
        await expect(inspectImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).resolves.toMatchObject({ ignoredChunks: ["sRGB", "gAMA", "pHYs"] });
        const next = await overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store });
        expect(next.source).toEqual(source);
        const cropped = await cropImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store,
            region: { x: 0, y: 0, width: 1, height: 1 } });
        expect(cropped.source).toEqual(source);
        expect(await readFile(f.path)).toEqual(ancillary);
    });
    it("rejects non-string ids and denies unauthorized or deleted sources without path leakage", async () => {
        const f = await fixture(png(1, 1, 3));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        await expect(overviewImageArtifact({ artifactId: 42 as never, store })).rejects.toMatchObject({ code: "invalid_overview_input", message: "invalid_overview_input" });
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [], store })).rejects.toMatchObject({ code: "path_denied", message: "path_denied" });
        await rm(f.path, { force: true });
        const error = await overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store }).catch((value) => value);
        expect(error).toMatchObject({ code: "source_missing_or_unreadable", message: "source_missing_or_unreadable" });
        expect(String(error)).not.toContain(f.root);
    });
    it("maps encoder and output validation failures", async () => {
        const f = await fixture(png(1, 1, 3));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        vi.spyOn(jpeg, "encode").mockImplementationOnce(() => { throw new Error("encode"); });
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "encode_failed" });
        vi.spyOn(jpeg, "encode").mockReturnValueOnce({ data: Buffer.from([1, 2, 3]) } as never);
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "output_validation_failed" });
    });
    it("matches nonuniform RGB and RGBA stride before JPEG encoding", () => {
        const rgb = Uint8Array.from([3, 91, 210, 200, 7, 44, 31, 82, 190, 64, 8, 222, 9, 111, 80, 211, 144, 18]);
        const rgba = Uint8Array.from(Array.from({ length: 6 }, (_, i) => [...rgb.slice(i * 3, i * 3 + 3), 255]).flat());
        expect(areaAverageRgba(rgba, 3, 2, 4, 2, 1)).toEqual(areaAverageRgba(rgb, 3, 2, 3, 2, 1));
        expect(areaAverageRgba(rgb, 3, 2, 3, 3, 2)).toEqual(Buffer.from(rgba));
    });
    it.each([
        ["width", { width: 3 }], ["channels", { channels: 3 }],
        ["profile", { validationProfile: "invalid-profile" }],
        ["alpha", { alpha: "present" }],
        ["chunk content", { ignoredChunks: ["gAMA", "pHYs"] }],
        ["chunk order", { ignoredChunks: ["gAMA", "sRGB"] }],
        ["chunk missing", { ignoredChunks: undefined }],
        ["chunk malformed", { ignoredChunks: "sRGB" }],
    ])("rejects %s metadata tampering before alpha/encoding", async (_label, change) => {
        const base = png(2, 2, 4);
        const bytes = Buffer.concat([base.subarray(0, 33), chunk("sRGB", Buffer.from([0])),
            chunk("gAMA", Buffer.from([0, 0, 0, 1])), base.subarray(33)]);
        const f = await fixture(_label === "profile" ? base : bytes);
        const record = await indexImageArtifact({ path: f.path, profile: "tolerant", allowedRoots: [f.root], store: new MemoryImageArtifactStore() });
        const store = { get: () => ({ ...record, ...change }) as any, put: vi.fn() };
        const encode = vi.spyOn(jpeg, "encode");
        await expect(overviewImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store }))
            .rejects.toMatchObject({ code: "decode_failed", message: "decode_failed" });
        expect(encode).not.toHaveBeenCalled();
        expect(store.put).not.toHaveBeenCalled();
    });
    it("prioritizes changed bytes over alpha and never encodes denied or changed sources", async () => {
        const f = await fixture(png(1, 1, 4, [1, 2, 3, 254]));
        const other = await fixture(png(1, 1, 3));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, profile: "tolerant", allowedRoots: [f.root], store });
        const encode = vi.spyOn(jpeg, "encode");
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [other.root], store }))
            .rejects.toMatchObject({ code: "path_denied", message: "path_denied" });
        await writeFile(f.path, png(1, 1, 4, [9, 8, 7, 254]));
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store }))
            .rejects.toMatchObject({ code: "source_changed", message: "source_changed" });
        expect(encode).not.toHaveBeenCalled();
        expect(store.size).toBe(1);
    });
    it.each(["throw", "width", "height"])("sanitizes output validator %s after real encoding", async (mode) => {
        const f = await fixture(png(2, 2, 3));
        const store = new MemoryImageArtifactStore();
        const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
        const actualValidate = jpegValidation.validateJpeg;
        const encode = vi.spyOn(jpeg, "encode");
        const validate = vi.spyOn(jpegValidation, "validateJpeg").mockImplementationOnce((bytes) => {
            const result = actualValidate(bytes);
            if (mode === "throw")
                throw new Error("private dependency detail");
            return { ...result, [mode]: result[mode as "width" | "height"] + 1 };
        });
        await expect(overviewImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store }))
            .rejects.toMatchObject({ code: "output_validation_failed", message: "output_validation_failed" });
        expect(encode).toHaveBeenCalledTimes(1);
        expect(validate).toHaveBeenCalledTimes(1);
    });
});
