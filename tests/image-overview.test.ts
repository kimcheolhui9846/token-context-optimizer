import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageValidationError, MemoryImageArtifactStore, indexImageArtifact, inspectImageArtifact } from "../src/core/image-artifacts.js";
import { areaAverageRgba, overviewImageArtifact } from "../src/core/image-overview.js";
import { cropImageArtifact } from "../src/core/image-crop.js";
import * as jpegValidation from "../src/core/jpeg-validation.js";
import type { ImageArtifactRecord } from "../src/core/types.js";
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

// ===========================================================================
// WBS 6.12c Stage 2 (approved plan sections 4, 6.2 and 7): JPEG tolerant
// overview flows, source ownership, re-validation and re-read. Inputs are the
// pinned Stage 1 fixtures. Every decode is real; jpeg.encode spies only observe.
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
async function tolerantJpegFixture(name: string): Promise<{ root: string; path: string; canonical: string; bytes: Buffer }> {
    const bytes = await readFile(join(JPEG_TOLERANT_DIR, name));
    const pin = jpegTolerantPins.find((entry) => entry.file === name);
    expect(pin, name).toBeDefined();
    expect(bytes.length, name).toBe(pin!.byteLength);
    expect(sha256Hex(bytes), name).toBe(pin!.sha256);
    const root = await mkdtemp(join(tmpdir(), "tco-overview-jpeg-tolerant-"));
    roots.add(root);
    const path = join(root, "source.jpg");
    await writeFile(path, bytes);
    return { root, path, canonical: await realpath(path), bytes };
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
    expect(jpegValidation.validateJpegTolerant(fixture.bytes)).toEqual({
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
    for (let y = 0; y < region.height; y++)
        for (let x = 0; x < region.width; x++) {
            const from = ((region.y + y) * sourceWidth + region.x + x) * 3;
            const to = (y * region.width + x) * 4;
            out[to] = rgb[from]; out[to + 1] = rgb[from + 1]; out[to + 2] = rgb[from + 2]; out[to + 3] = 255;
        }
    return out;
}
function encoderInput(spy: { mock: { calls: Array<Parameters<typeof jpeg.encode>> } }, call: number): Buffer {
    return Buffer.from(spy.mock.calls[call][0].data as Uint8Array);
}
describe("WBS 6.12c JPEG tolerant overview (Stage 2)", () => {
    it.each(A7_CASES)("A7 tolerant $file: index -> inspect -> overview -> crop in stored-pixel coordinates without rotation", async (known) => {
        const f = await tolerantJpegFixture(known.file);
        const store = new MemoryImageArtifactStore();
        const expected = knownTolerantRecord(known, f);
        const args = { artifactId: expected.artifactId, allowedRoots: [f.root], store };
        expect(await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" })).toStrictEqual(expected);
        await expect(inspectImageArtifact(args)).resolves.toStrictEqual(expected);
        const decoded = jpeg.decode(f.bytes, PLAN_DECODE);
        expect([decoded.width, decoded.height, decoded.data.length]).toEqual([known.width, known.height, known.width * known.height * 3]);
        const encode = vi.spyOn(jpeg, "encode");
        const overview = await overviewImageArtifact({ ...args, maxSide: 64 });
        expect(overview.source).toStrictEqual(expected);
        // Images are never enlarged and EXIF orientation is not applied.
        expect(overview.output).toMatchObject({ width: known.width, height: known.height, format: "jpeg", mimeType: "image/jpeg", quality: 75, resample: "area-average-v1" });
        expect(encoderInput(encode, 0)).toEqual(regionRgba(decoded.data, known.width, { x: 0, y: 0, width: known.width, height: known.height }));
        expect(overview.output.validation).toEqual({ width: known.width, height: known.height, ...STRICT_OUTPUT });
        expect(jpegValidation.validateJpeg(Buffer.from(overview.output.image, "base64"))).toEqual(overview.output.validation);
        const region = { x: known.width - 6, y: 1, width: 5, height: known.height - 2 };
        const cropped = await cropImageArtifact({ ...args, region });
        if (cropped.status !== "cropped")
            throw new Error(`expected cropped, got ${cropped.status}`);
        expect(cropped.source).toStrictEqual(expected);
        expect(encoderInput(encode, 1)).toEqual(regionRgba(decoded.data, known.width, region));
        expect(cropped.output.validation).toEqual({ width: 5, height: known.height - 2, ...STRICT_OUTPUT });
        expect(jpegValidation.validateJpeg(Buffer.from(cropped.output.image, "base64"))).toEqual(cropped.output.validation);
        await expect(cropImageArtifact({ ...args, region: { x: 0, y: 0, width: known.height, height: known.width } })).rejects.toMatchObject({ code: "region_out_of_bounds" });
        expect(encode).toHaveBeenCalledTimes(2);
        expect(store.size).toBe(1);
        expect(await readFile(f.path)).toEqual(f.bytes);
    });
    it("ownership: overview source ignoredSegments for metadata-mixed.jpg are detached from a reference-returning store, and later inspect/overview/crop see the stored order", async () => {
        const f = await tolerantJpegFixture(MIXED.file);
        const expected = knownTolerantRecord(MIXED, f);
        let stored: any;
        const store = { get: () => stored, put: (record: ImageArtifactRecord) => { stored = record; } };
        const args = { artifactId: expected.artifactId, allowedRoots: [f.root], store };
        expect(await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" })).toStrictEqual(expected);
        const mutateSource = (source: ImageArtifactRecord, tag: string) => {
            const segments = (source as TolerantJpegRecord).ignoredSegments;
            expect(segments, tag).not.toBe(stored.ignoredSegments);
            segments.push(tag);
            segments.reverse();
            expect(stored.ignoredSegments, tag).toEqual(MIXED.ignoredSegments);
        };
        const first = await overviewImageArtifact(args);
        expect(first.source).toStrictEqual(expected);
        mutateSource(first.source, "mutated-overview");
        await expect(inspectImageArtifact(args)).resolves.toStrictEqual(expected);
        const second = await overviewImageArtifact(args);
        expect(second.source).toStrictEqual(expected);
        mutateSource(second.source, "mutated-second-overview");
        const original = await cropImageArtifact({ ...args, region: { x: 0, y: 0, width: 32, height: 16 } });
        expect(original).toMatchObject({ status: "original", source: expected });
        mutateSource(original.source, "mutated-original");
        const cropped = await cropImageArtifact({ ...args, region: { x: 16, y: 0, width: 16, height: 16 } });
        expect(cropped).toMatchObject({ status: "cropped", source: expected });
        mutateSource(cropped.source, "mutated-cropped");
        expect(stored).toStrictEqual(expected);
        expect(await readFile(f.path)).toEqual(f.bytes);
    });
    it("metadata tamper on a fabricated tolerant record for strict-supported hc-444-16x8-app0.jpg: overview reports decode_failed for every field without encoding, while the untampered record renders", async () => {
        const f = await fabricatedTolerantJpeg(HC444);
        const tampers = tampersFor(f.record);
        const encode = vi.spyOn(jpeg, "encode");
        const codes: Record<string, string> = {};
        for (const [label, mutate] of tampers) {
            const tampered = tamperedCopy(f.record, mutate);
            const put = vi.fn();
            codes[label] = await outcomeCode(overviewImageArtifact({ artifactId: f.record.artifactId, allowedRoots: [f.root], store: { get: () => tampered, put } }));
            expect(put, label).not.toHaveBeenCalled();
        }
        expect(codes).toEqual(everyDecodeFailed(tampers));
        expect(encode).not.toHaveBeenCalled();
        const control = await overviewImageArtifact({ artifactId: f.record.artifactId, allowedRoots: [f.root], store: { get: () => f.record, put: vi.fn() } });
        expect(control.source).toStrictEqual(knownTolerantRecord(HC444, f));
        expect(control.output).toMatchObject({ width: 16, height: 8, validation: { width: 16, height: 8, ...STRICT_OUTPUT } });
        expect(await readFile(f.path)).toEqual(f.bytes);
    });
    it("metadata tamper on an indexed metadata-mixed.jpg record: overview reports decode_failed for every field including ignoredSegments order without encoding", async () => {
        const f = await tolerantJpegFixture(MIXED.file);
        const store = new MemoryImageArtifactStore();
        const original = knownTolerantRecord(MIXED, f);
        expect(await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" })).toStrictEqual(original);
        const tampers = tampersFor(original);
        const encode = vi.spyOn(jpeg, "encode");
        const codes: Record<string, string> = {};
        for (const [label, mutate] of tampers) {
            store.put(tamperedCopy(original, mutate));
            codes[label] = await outcomeCode(overviewImageArtifact({ artifactId: original.artifactId, allowedRoots: [f.root], store }));
        }
        expect(codes).toEqual(everyDecodeFailed(tampers));
        expect(encode).not.toHaveBeenCalled();
        expect(store.size).toBe(1);
        expect(sha256Hex(await readFile(f.path))).toBe(original.sha256);
    });
    it("re-read: overview of an indexed tolerant JPEG replaced by a valid re-encoded JPEG at the same path is source_changed without encoding", async () => {
        const f = await tolerantJpegFixture("sharp-baseline-420-50x34.jpg");
        const store = new MemoryImageArtifactStore();
        const indexed = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
        expect(indexed).toMatchObject({ validationProfile: TOLERANT_JPEG_PROFILE, sampling: "2x2,1x1,1x1" });
        const rgba = jpeg.decode(f.bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false });
        const replacement = Buffer.from(jpeg.encode({ data: rgba.data, width: rgba.width, height: rgba.height }, 90).data);
        expect(sha256Hex(replacement)).not.toBe(indexed.sha256);
        expect(jpegValidation.validateJpegTolerant(replacement)).toMatchObject({ width: 50, height: 34, validationProfile: TOLERANT_JPEG_PROFILE });
        await writeFile(f.path, replacement);
        const encode = vi.spyOn(jpeg, "encode");
        await expect(overviewImageArtifact({ artifactId: indexed.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed", message: "source_changed" });
        expect(encode).not.toHaveBeenCalled();
        expect(store.size).toBe(1);
        expect(store.get(indexed.artifactId)).toStrictEqual(indexed);
    });
});
