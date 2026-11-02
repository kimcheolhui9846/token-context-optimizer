import { deflateSync } from "node:zlib";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JpegValidationError,
  validateJpeg,
  validateJpegTolerant,
  validateJpegTolerantWithPixels,
} from "../src/core/jpeg-validation.js";
import {
  ImageValidationError,
  MemoryImageArtifactStore,
  indexImageArtifact,
  inspectImageArtifact,
  readValidatedImageArtifact,
} from "../src/core/image-artifacts.js";
import { cropImageArtifact } from "../src/core/image-crop.js";
import { overviewImageArtifact } from "../src/core/image-overview.js";
import type { ImageArtifactRecord } from "../src/core/types.js";

const JPEG_FIXTURE = join(process.cwd(), "tests", "fixtures", "jpeg-tolerant", "hc-444-16x8-app0.jpg");
const roots = new Set<string>();
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots) await rm(root, { recursive: true, force: true }); roots.clear(); });

function codeOf(run: () => unknown): string {
  try { run(); return "none"; } catch (error) {
    if (error instanceof JpegValidationError || error instanceof ImageValidationError) return error.code;
    return "uncoded_error";
  }
}

describe("WBS 6.12 N1 decoder resource errors", () => {
  // jpeg-js 0.4.4 lib/decoder.js:740 emits the resolution form; :1071 emits
  // the memory form. The allocation wrapper at :1135 is intentionally not a
  // resource-limit match because it has a different message contract.
  const positive = [
    "maxResolutionInMP limit exceeded by 1MP",
    "maxResolutionInMP limit exceeded by 42MP",
    "maxMemoryUsageInMB limit exceeded by at least 1MB",
    "maxMemoryUsageInMB limit exceeded by at least 42MB",
  ];
  const nearMissMessages = [
    "maxResolutionInMP limit exceeded by 0MP",
    "maxResolutionInMP limit exceeded by 01MP",
    "maxResolutionInMP limit exceeded by +1MP",
    "maxResolutionInMP limit exceeded by 1.5MP",
    "maxResolutionInMP limit exceeded by 1MB",
    "maxMemoryUsageInMB limit exceeded by 1MB",
    "maxMemoryUsageInMB limit exceeded by at least 1MB\n",
    "prefix maxMemoryUsageInMB limit exceeded by at least 1MB",
    "generic decoder failure",
    "Could not allocate enough memory for the image. Required: 268435456",
  ];

  it.each(positive)("maps exact decoder message %j to jpeg_resource_limit on both tolerant paths", async (message) => {
    const bytes = await readFile(JPEG_FIXTURE);
    const spy = vi.spyOn(jpeg, "decode").mockImplementation(() => { throw new Error(message); });
    expect(codeOf(() => validateJpegTolerant(bytes))).toBe("jpeg_resource_limit");
    expect(codeOf(() => validateJpegTolerantWithPixels(bytes))).toBe("jpeg_resource_limit");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it.each(nearMissMessages.map((message) => new Error(message)))("maps non-exact Error message %j to malformed_jpeg", async (value) => {
    const bytes = await readFile(JPEG_FIXTURE);
    vi.spyOn(jpeg, "decode").mockImplementation((() => { throw value; }) as never);
    expect(codeOf(() => validateJpegTolerant(bytes))).toBe("malformed_jpeg");
    expect(codeOf(() => validateJpegTolerantWithPixels(bytes))).toBe("malformed_jpeg");
  });

  it("rejects a bare exact string and plain object as malformed_jpeg", async () => {
    const bytes = await readFile(JPEG_FIXTURE);
    for (const value of ["maxResolutionInMP limit exceeded by 1MP", { message: "maxResolutionInMP limit exceeded by 1MP" }]) {
      vi.spyOn(jpeg, "decode").mockImplementation((() => { throw value; }) as never);
      expect(codeOf(() => validateJpegTolerant(bytes))).toBe("malformed_jpeg");
      vi.restoreAllMocks();
    }
  });

  it.each([
    new Error("maxResolutionInMP limit exceeded by 1MP"),
    new RangeError("maxResolutionInMP limit exceeded by 1MP"),
    new Error("maxMemoryUsageInMB limit exceeded by at least 1MB"),
    new RangeError("maxMemoryUsageInMB limit exceeded by at least 1MB"),
  ])("maps exact Error subclasses to jpeg_resource_limit: %s", async (value) => {
    const bytes = await readFile(JPEG_FIXTURE);
    vi.spyOn(jpeg, "decode").mockImplementation((() => { throw value; }) as never);
    expect(codeOf(() => validateJpegTolerant(bytes))).toBe("jpeg_resource_limit");
  });

  it.each([...positive, ...nearMissMessages])("leaves strict decoder errors as malformed_jpeg: %j", async (message) => {
    const bytes = await readFile(JPEG_FIXTURE);
    const spy = vi.spyOn(jpeg, "decode").mockImplementation((() => { throw new Error(message); }) as never);
    expect(codeOf(() => validateJpeg(bytes))).toBe("malformed_jpeg");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, "ascii"); const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length); return out;
}
function png(): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 2;
  const scan = Buffer.from([0, 10, 20, 30, 40, 50, 60, 0, 70, 80, 90, 100, 110, 120]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]);
}
async function fixture(bytes: Buffer, name: string): Promise<{ root: string; path: string }> {
  const root = join(process.cwd(), ".artifacts", `612-followup-${name}`); roots.add(root);
  await mkdir(root, { recursive: true });
  const path = join(root, `${name}.bin`); await writeFile(path, bytes); return { root, path };
}
async function indexed(bytes: Buffer, profile: "strict" | "tolerant", name: string): Promise<{ record: ImageArtifactRecord; root: string }> {
  const f = await fixture(bytes, name); const store = new MemoryImageArtifactStore();
  return { record: await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile, store }), root: f.root };
}
function foreign(record: ImageArtifactRecord, field: string): ImageArtifactRecord {
  const copy = { ...record } as Record<string, unknown>; copy[field] = undefined; return copy as ImageArtifactRecord;
}

describe("WBS 6.12 N2 record isolation and foreign profiles", () => {
  it("clones ignoredChunks and ignoredSegments independently on put and get", async () => {
    const { record } = await indexed(await readFile(JPEG_FIXTURE), "tolerant", "isolation");
    type MixedRecord = ImageArtifactRecord & { ignoredChunks: string[]; ignoredSegments: string[] };
    const inputChunks = ["sRGB"]; const inputSegments = [...(record as Extract<ImageArtifactRecord, { validationProfile: "jpeg-ycbcr8-tolerant-v1" }>).ignoredSegments];
    const expectedChunks = [...inputChunks]; const expectedSegments = [...inputSegments];
    const mixed = { ...record, ignoredChunks: inputChunks, ignoredSegments: inputSegments } as MixedRecord;
    const store = new MemoryImageArtifactStore(); store.put(mixed);
    inputChunks.push("mutated-input"); inputSegments.push("mutated-input");
    const first = store.get(record.artifactId)! as MixedRecord;
    first.ignoredChunks.push("mutated"); first.ignoredSegments.push("mutated");
    const second = store.get(record.artifactId)! as MixedRecord;
    expect(second.ignoredChunks).toEqual(expectedChunks);
    expect(second.ignoredSegments).toEqual(expectedSegments);
  });

  const cases = [
    { name: "jpeg tolerant rejects PNG fields", bytes: readFile(JPEG_FIXTURE), profile: "tolerant" as const, fields: ["ignoredChunks", "alpha"] },
    { name: "png tolerant rejects JPEG fields", bytes: Promise.resolve(png()), profile: "tolerant" as const, fields: ["coding", "sampling", "ignoredSegments", "exifOrientation"] },
    { name: "strict JPEG rejects all tolerant fields", bytes: readFile(JPEG_FIXTURE), profile: "strict" as const, fields: ["ignoredChunks", "alpha", "coding", "sampling", "ignoredSegments", "exifOrientation"] },
    { name: "strict PNG rejects all tolerant fields", bytes: Promise.resolve(png()), profile: "strict" as const, fields: ["ignoredChunks", "alpha", "coding", "sampling", "ignoredSegments", "exifOrientation"] },
  ];
  it.each(cases)("$name across all artifact operations", async ({ name, bytes, profile, fields }) => {
    const { record, root } = await indexed(await bytes, profile, `foreign-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
    for (const field of fields) {
      const tampered = foreign(record, field); const store = { get: () => tampered, put: () => undefined };
      await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
      await expect(readValidatedImageArtifact(tampered, [root])).rejects.toMatchObject({ code: "decode_failed" });
      await expect(cropImageArtifact({ artifactId: record.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
      await expect(overviewImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
    }
  });

  it("rejects inherited and non-enumerable foreign fields across all operations", async () => {
    const { record, root } = await indexed(await readFile(JPEG_FIXTURE), "tolerant", "presence");
    for (const field of ["ignoredChunks", "alpha"]) {
      const inherited = Object.create(field === "alpha" ? { alpha: undefined } : null); Object.assign(inherited, record);
      if (field === "ignoredChunks") Object.defineProperty(inherited, field, { value: undefined, enumerable: false, configurable: true });
      const store = { get: () => inherited as ImageArtifactRecord, put: () => undefined };
      await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
      await expect(readValidatedImageArtifact(inherited as ImageArtifactRecord, [root])).rejects.toMatchObject({ code: "decode_failed" });
      await expect(cropImageArtifact({ artifactId: record.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
      await expect(overviewImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
    }
  });

  it.each([
    { name: "PNG tolerant", bytes: Promise.resolve(png()), profile: "tolerant" as const },
    { name: "PNG strict", bytes: Promise.resolve(png()), profile: "strict" as const },
  ])("rejects inherited exifOrientation on $name across all operations", async ({ name, bytes, profile }) => {
    const { record, root } = await indexed(await bytes, profile, `inherited-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
    const inherited = Object.create({ exifOrientation: undefined }); Object.assign(inherited, record);
    const store = { get: () => inherited as ImageArtifactRecord, put: () => undefined };
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
    await expect(readValidatedImageArtifact(inherited as ImageArtifactRecord, [root])).rejects.toMatchObject({ code: "decode_failed" });
    await expect(cropImageArtifact({ artifactId: record.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
    await expect(overviewImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })).rejects.toMatchObject({ code: "decode_failed" });
  });

  it("preserves path and region_empty precedence before foreign-field validation", async () => {
    const { record, root } = await indexed(await readFile(JPEG_FIXTURE), "tolerant", "precedence");
    const inherited = Object.create({ alpha: undefined }); Object.assign(inherited, record);
    const store = { get: () => inherited as ImageArtifactRecord, put: () => undefined };
    await expect(cropImageArtifact({ artifactId: record.artifactId, region: { x: 0, y: 0, width: 0, height: 1 }, allowedRoots: [root], store })).rejects.toMatchObject({ code: "region_empty" });
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [], store })).rejects.toMatchObject({ code: "path_denied" });
    const changed = Buffer.from(await readFile(JPEG_FIXTURE)); changed[changed.length - 1] ^= 1;
    const changedPath = join(root, "presence-changed.jpg"); await writeFile(changedPath, changed);
    const changedRecord = { ...inherited, path: changedPath, alpha: undefined } as ImageArtifactRecord;
    expect("alpha" in changedRecord).toBe(true);
    const changedStore = { get: () => changedRecord, put: () => undefined };
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store: changedStore })).rejects.toMatchObject({ code: "source_changed" });
    await expect(readValidatedImageArtifact(changedRecord, [root])).rejects.toMatchObject({ code: "source_changed" });
    await expect(cropImageArtifact({ artifactId: record.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [root], store: changedStore })).rejects.toMatchObject({ code: "source_changed" });
    await expect(overviewImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store: changedStore })).rejects.toMatchObject({ code: "source_changed" });
  });
});
