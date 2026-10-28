import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decode as fastPngDecode } from "fast-png";
import type { TestContext } from "vitest";

import {
  ImageValidationError,
  MemoryImageArtifactStore,
  indexImageArtifact,
  inspectImageArtifact,
} from "../src/core/image-artifacts.js";
import type { ReadBoundedFileErrorCode } from "../src/core/read-bounded-file.js";

vi.mock("fast-png", async () => {
  const actual = await vi.importActual<typeof import("fast-png")>("fast-png");
  return { ...actual, decode: vi.fn(actual.decode) };
});

const decodeSpy = vi.mocked(fastPngDecode);

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const temporaryRoots = new Set<string>();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer, badCrc = false): Buffer {
  const name = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(badCrc ? 0 : crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

function chunkWithTypeBytes(typeBytes: Buffer, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

function png(width: number, height: number, channels: 3 | 4, rows?: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const scan = rows ?? Buffer.concat(Array.from({ length: height }, (_, y) =>
    Buffer.concat([Buffer.from([0]), Buffer.alloc(width * channels, y + 1)])));
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]);
}

async function fixture(bytes: Buffer): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "tco-image-"));
  temporaryRoots.add(root);
  const path = join(root, "image.png");
  await writeFile(path, bytes);
  return { root, path };
}

async function expectIndexRejects(
  bytes: Buffer,
  code: string,
): Promise<void> {
  const f = await fixture(bytes);
  const store = new MemoryImageArtifactStore();
  await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], store })).rejects.toMatchObject({ code });
  expect(store.size).toBe(0);
}

afterEach(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

describe("image artifact ingestion", () => {
  it("accepts tolerant ancillary chunks and records alpha metadata", async () => {
    const base = png(2, 1, 4, Buffer.from([0, 10, 20, 30, 255, 40, 50, 60, 255]));
    const ihdrEnd = 8 + 12 + 13;
    const bytes = Buffer.concat([
      base.subarray(0, ihdrEnd),
      chunk("sRGB", Buffer.from([0])),
      chunk("gAMA", Buffer.from([1, 2, 3])),
      chunk("pHYs", Buffer.from([1, 2, 3])),
      base.subarray(ihdrEnd),
    ]);
    const f = await fixture(bytes);
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    if (record.validationProfile !== "png-rgb8-tolerant-v1") throw new Error("expected tolerant record");
    expect(record).toMatchObject({ validationProfile: "png-rgb8-tolerant-v1", ignoredChunks: ["sRGB", "gAMA", "pHYs"], alpha: "opaque" });
    const strict = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store }).catch((error: unknown) => error);
    expect(strict).toMatchObject({ code: "unsupported_png_profile" });
  });

  it("passes only core PNG bytes to fast-png for iCCP payloads", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const profile = Buffer.concat([Buffer.from("profile\0", "ascii"), Buffer.from([0]), deflateSync(Buffer.alloc(64 * 1024 * 1024, 65))]);
    const bytes = Buffer.concat([base.subarray(0, ihdrEnd), chunk("iCCP", profile), base.subarray(ihdrEnd)]);
    const f = await fixture(bytes);
    decodeSpy.mockClear();
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" })).resolves.toMatchObject({ ignoredChunks: ["iCCP"] });
    expect(decodeSpy).toHaveBeenCalled();
    expect(decodeSpy.mock.calls.at(-1)?.[0]).toEqual(base);
  });

  it.each(["PLTE", "tRNS", "acTL", "fcTL", "fdAT", "ABCD", "caBX"])("handles tolerant chunk %s", async (type) => {
    const base = png(1, 1, 3);
    const ihdrEnd = 8 + 12 + 13;
    const bytes = Buffer.concat([base.subarray(0, ihdrEnd), chunk(type, Buffer.from([1])), base.subarray(ihdrEnd)]);
    const f = await fixture(bytes);
    const result = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" }).catch((error: unknown) => error);
    if (type === "caBX") expect(result).toMatchObject({ validationProfile: "png-rgb8-tolerant-v1", ignoredChunks: ["caBX"] });
    else expect(result).toMatchObject({ code: "unsupported_png_profile" });
  });

  it("accepts every named ancillary chunk without parsing payloads and keeps first order", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const types = ["caBX", "tEXt", "zTXt", "iTXt", "tIME", "bKGD", "cHRM", "eXIf", "tEXt"];
    const chunks = types.map((type, index) => chunk(type, index === 1 ? Buffer.from([0xff]) : index === 2 ? Buffer.from([0, 1]) : index === 3 ? Buffer.from([0, 1, 2]) : Buffer.from([index])));
    const bytes = Buffer.concat([base.subarray(0, ihdrEnd), ...chunks, base.subarray(ihdrEnd)]);
    const f = await fixture(bytes);
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" })).resolves.toMatchObject({ ignoredChunks: ["caBX", "tEXt", "zTXt", "iTXt", "tIME", "bKGD", "cHRM", "eXIf"] });
  });

  it("rejects ancillary CRC corruption, noncontiguous IDAT, and trailing bytes", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const idat = base.subarray(ihdrEnd, base.length - 12);
    const data = idat.subarray(8, idat.length - 4);
    const first = data.subarray(0, Math.max(1, Math.floor(data.length / 2)));
    const second = data.subarray(first.length);
    const cases = [
      Buffer.concat([base.subarray(0, ihdrEnd), chunk("caBX", Buffer.from([1]), true), base.subarray(ihdrEnd)]),
      Buffer.concat([base.subarray(0, ihdrEnd), chunk("IDAT", first), chunk("caBX", Buffer.alloc(0)), chunk("IDAT", second), chunk("IEND", Buffer.alloc(0))]),
      Buffer.concat([base, Buffer.from([1])]),
    ];
    for (const bytes of cases) {
      const f = await fixture(bytes);
      await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" })).rejects.toMatchObject({ code: "malformed_png" });
    }
  });

  it("keeps strict and tolerant PNG identities separate and JPEG tolerant identity strict", async () => {
    const f = await fixture(png(1, 1, 3));
    const store = new MemoryImageArtifactStore();
    const strict = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const tolerant = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    expect(tolerant.artifactId).not.toBe(strict.artifactId);
    expect(store.size).toBe(2);
    const jpegRoot = await mkdtemp(join(tmpdir(), "tco-jpeg-tolerant-")); temporaryRoots.add(jpegRoot);
    const jpegPath = join(jpegRoot, "source.jpg");
    await writeFile(jpegPath, await readFile("tests/fixtures/jpeg/checkedin-odd-17x9.jpg"));
    const jpegStrict = await indexImageArtifact({ path: jpegPath, allowedRoots: [jpegRoot], store });
    const jpegTolerant = await indexImageArtifact({ path: jpegPath, allowedRoots: [jpegRoot], store, profile: "tolerant" });
    expect(jpegTolerant.artifactId).toBe(jpegStrict.artifactId);
    expect(jpegTolerant).toEqual(jpegStrict);
    expect(store.size).toBe(3);
  });

  it("uses the exact legacy strict identity formula and stable repeated IDs", async () => {
    const f = await fixture(png(1, 1, 3));
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root] });
    const canonical = await realpath(f.path);
    const expected = `image_${createHash("sha256").update(`${canonical}\0${record.sha256}`).digest("hex").slice(0, 16)}`;
    expect(record.artifactId).toBe(expected);
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root] })).resolves.toMatchObject({ artifactId: expected });
  });

  it("rejects the 33rd ignored chunk and reports non-opaque alpha", async () => {
    const base = png(1, 1, 4, Buffer.from([0, 10, 20, 30, 254]));
    const ihdrEnd = 8 + 12 + 13;
    const chunks = Array.from({ length: 33 }, (_, index) => chunk(`ca${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`, Buffer.alloc(0)));
    const tooMany = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), ...chunks, base.subarray(ihdrEnd)]));
    await expect(indexImageArtifact({ path: tooMany.path, allowedRoots: [tooMany.root], profile: "tolerant" })).rejects.toMatchObject({ code: "unsupported_png_profile" });
    const alpha = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), chunk("caBX", Buffer.alloc(0)), base.subarray(ihdrEnd)]));
    await expect(indexImageArtifact({ path: alpha.path, allowedRoots: [alpha.root], profile: "tolerant" })).resolves.toMatchObject({ alpha: "present" });
  });

  it("accepts exactly 32 ignored chunk types and keeps tolerant IDs stable", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const chunks = Array.from({ length: 32 }, (_, index) => chunk(`c${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}X`, Buffer.alloc(0)));
    const f = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), ...chunks, base.subarray(ihdrEnd)]));
    const first = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" });
    const second = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" });
    expect((first as Extract<typeof first, { validationProfile: "png-rgb8-tolerant-v1" }>).ignoredChunks).toHaveLength(32);
    expect(second.artifactId).toBe(first.artifactId);
  });

  it("preserves tolerant structural error classes and limits", async () => {
    const base = png(1, 1, 3);
    const ihdr = base.subarray(8, 8 + 12 + 13);
    const afterIhdr = base.subarray(8 + 12 + 13);
    const iend = chunk("IEND", Buffer.alloc(0));
    const badName = Buffer.concat([signature, ihdr, chunkWithTypeBytes(Buffer.from([0, 65, 65, 65]), Buffer.alloc(0)), afterIhdr]);
    const duplicate = Buffer.concat([signature, ihdr, ihdr, afterIhdr]);
    const missingHeader = Buffer.concat([signature, afterIhdr]);
    const missingIdat = Buffer.concat([signature, ihdr, iend]);
    const truncated = base.subarray(0, base.length - 1);
    const badIend = Buffer.concat([base.subarray(0, base.length - 12), chunk("IEND", Buffer.from([1]))]);
    const unsupportedIhdr = Buffer.alloc(13); unsupportedIhdr.writeUInt32BE(1, 0); unsupportedIhdr.writeUInt32BE(1, 4); unsupportedIhdr[8] = 8; unsupportedIhdr[9] = 0;
    const unsupported = Buffer.concat([signature, chunk("IHDR", unsupportedIhdr), afterIhdr]);
    const badFilter = png(1, 1, 3, Buffer.from([5, 1, 2, 3]));
    const badInflate = Buffer.concat([signature, ihdr, chunk("IDAT", deflateSync(Buffer.from([0]))), iend]);
    for (const [bytes, code] of [
      [duplicate, "malformed_png"], [missingHeader, "malformed_png"], [missingIdat, "malformed_png"],
      [truncated, "malformed_png"], [badName, "malformed_png"], [badIend, "malformed_png"],
      [unsupported, "unsupported_png_profile"], [badFilter, "malformed_png"], [badInflate, "malformed_png"],
      [png(8193, 1, 3), "image_dimensions_exceeded"],
    ] as const) {
      const f = await fixture(bytes);
      await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" })).rejects.toMatchObject({ code });
    }
  });

  it("copies tolerant ignoredChunks through index, store put/get, and returned records", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const f = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), chunk("caBX", Buffer.from([1])), base.subarray(ihdrEnd)]));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const tolerant = record as Extract<typeof record, { validationProfile: "png-rgb8-tolerant-v1" }>;
    tolerant.ignoredChunks.push("mutated");
    const stored = store.get(record.artifactId) as typeof tolerant; expect(stored.ignoredChunks).toEqual(["caBX"]);
    stored.ignoredChunks.push("mutated");
    expect((store.get(record.artifactId) as typeof tolerant).ignoredChunks).toEqual(["caBX"]);
  });

  it("keeps Memory store put input arrays isolated from later mutation", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const f = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), chunk("caBX", Buffer.alloc(0)), base.subarray(ihdrEnd)]));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    const input = store.get(record.artifactId)!;
    if (!('ignoredChunks' in input)) throw new Error("expected tolerant record");
    store.put(input);
    input.ignoredChunks.push("mutated-input");
    expect((store.get(record.artifactId) as typeof input).ignoredChunks).toEqual(["caBX"]);
  });

  it("accepts contiguous split IDAT followed by ancillary chunks and decodes only original core bytes", async () => {
    const base = png(2, 1, 3);
    const dataLength = base.readUInt32BE(33);
    const compressed = base.subarray(41, 41 + dataLength);
    const middle = Math.floor(compressed.length / 2);
    const core = Buffer.concat([base.subarray(0, 33), chunk("IDAT", compressed.subarray(0, middle)), chunk("IDAT", compressed.subarray(middle)), chunk("IEND", Buffer.alloc(0))]);
    const f = await fixture(Buffer.concat([core.subarray(0, -12), chunk("tEXt", Buffer.from([0xff])), core.subarray(-12)]));
    decodeSpy.mockClear();
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" })).resolves.toMatchObject({ ignoredChunks: ["tEXt"], alpha: "none" });
    expect(decodeSpy.mock.calls.at(-1)![0]).toEqual(core);
  });

  it("revalidates tolerant metadata during inspect and reports metadata tampering as decode_failed", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const f = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), chunk("caBX", Buffer.alloc(0)), base.subarray(ihdrEnd)]));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    const saved = store.get(record.artifactId)!;
    if (!('ignoredChunks' in saved)) throw new Error("expected tolerant record");
    (saved as Extract<typeof saved, { validationProfile: "png-rgb8-tolerant-v1" }>).ignoredChunks = ["different"];
    store.put(saved);
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "decode_failed" });
  });

  it("maps missing, non-array, reordered, and alpha metadata tampering to decode_failed", async () => {
    const base = png(1, 1, 3, Buffer.from([0, 1, 2, 3]));
    for (const mutate of [
      (value: any) => { delete value.ignoredChunks; },
      (value: any) => { value.ignoredChunks = "caBX"; },
      (value: any) => { value.ignoredChunks = ["tEXt", "caBX"]; },
      (value: any) => { delete value.alpha; },
      (value: any) => { value.alpha = "present"; },
    ]) {
      const f = await fixture(Buffer.concat([base.subarray(0, 8 + 12 + 13), chunk("caBX", Buffer.alloc(0)), chunk("tEXt", Buffer.from([1])), base.subarray(8 + 12 + 13)]));
      const store = new MemoryImageArtifactStore();
      const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
      const tampered: any = store.get(record.artifactId);
      mutate(tampered);
      store.put(tampered);
      await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "decode_failed" });
    }
  });

  it("does not expose arrays from a reference-returning store inspect result", async () => {
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const f = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), chunk("caBX", Buffer.alloc(0)), chunk("tEXt", Buffer.from([1])), base.subarray(ihdrEnd)]));
    let stored: any;
    const store = { get: () => stored, put: (record: any) => { stored = record; } };
    const indexed = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    const inspected = await inspectImageArtifact({ artifactId: indexed.artifactId, allowedRoots: [f.root], store });
    (inspected as any).ignoredChunks.reverse();
    expect((await inspectImageArtifact({ artifactId: indexed.artifactId, allowedRoots: [f.root], store }) as any).ignoredChunks).toEqual(["caBX", "tEXt"]);
  });

  it("isolates index output from a reference-returning custom store and put input mutation", async () => {
    let stored: any;
    const store = {
      get: () => stored,
      put: (record: any) => { stored = record; record.ignoredChunks.push("mutated-in-put"); },
    };
    const base = png(1, 1, 3); const ihdrEnd = 8 + 12 + 13;
    const f = await fixture(Buffer.concat([base.subarray(0, ihdrEnd), chunk("caBX", Buffer.alloc(0)), base.subarray(ihdrEnd)]));
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    expect((record as Extract<typeof record, { validationProfile: "png-rgb8-tolerant-v1" }>).ignoredChunks).toEqual(["caBX"]);
    expect(stored.ignoredChunks).toEqual(["caBX", "mutated-in-put"]);
    (record as Extract<typeof record, { validationProfile: "png-rgb8-tolerant-v1" }>).ignoredChunks.push("mutated-after-return");
    expect(stored.ignoredChunks).toEqual(["caBX", "mutated-in-put"]);
  });

  it("reports RGB alpha none in tolerant profile", async () => {
    const f = await fixture(png(1, 1, 3));
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant" })).resolves.toMatchObject({ channels: 3, alpha: "none", ignoredChunks: [] });
  });
  it("reports source_changed for tolerant inspect after bytes change", async () => {
    const f = await fixture(png(1, 1, 3));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], profile: "tolerant", store });
    await writeFile(f.path, Buffer.concat([await readFile(f.path), Buffer.from([0])]));
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
  });
  it("indexes independent RGB and RGBA PNGs and preserves the original hash", async () => {
    const rgb = await fixture(png(2, 1, 3));
    const rgba = await fixture(png(1, 2, 4));
    const rgbBytesBefore = await readFile(rgb.path);
    const rgbaBytesBefore = await readFile(rgba.path);
    const rgbHashBefore = createHash("sha256").update(rgbBytesBefore).digest("hex");
    const rgbaHashBefore = createHash("sha256").update(rgbaBytesBefore).digest("hex");
    const store = new MemoryImageArtifactStore();
    const a = await indexImageArtifact({ path: rgb.path, allowedRoots: [rgb.root], store });
    const b = await indexImageArtifact({ path: rgba.path, allowedRoots: [rgba.root], store });
    expect(a).toMatchObject({ format: "png", mimeType: "image/png", width: 2, height: 1, channels: 3, bitDepth: 8 });
    expect(b).toMatchObject({ width: 1, height: 2, channels: 4, bitDepth: 8 });
    expect(a.sha256).toBe(rgbHashBefore);
    expect(b.sha256).toBe(rgbaHashBefore);
    expect(await readFile(rgb.path)).toEqual(rgbBytesBefore);
    expect(await readFile(rgba.path)).toEqual(rgbaBytesBefore);
    expect(a.artifactId).not.toBe(b.artifactId);
    const repeated = await indexImageArtifact({ path: rgb.path, allowedRoots: [rgb.root], store });
    expect(repeated.artifactId).toBe(a.artifactId);
    const sameBytes = await fixture(await readFile(rgb.path));
    const same = await indexImageArtifact({ path: sameBytes.path, allowedRoots: [sameBytes.root], store });
    expect(same.sha256).toBe(a.sha256);
    expect(same.artifactId).not.toBe(a.artifactId);
    expect(await readFile(rgb.path)).toEqual(await readFile(sameBytes.path));
  });

  it("keeps defensive store copies and does not insert failed records", async () => {
    const f = await fixture(Buffer.from("bad"));
    const store = new MemoryImageArtifactStore();
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "malformed_png" });
    expect(store.size).toBe(0);
    const valid = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store }).catch(() => undefined);
    expect(valid).toBeUndefined();
    const good = await fixture(png(1, 1, 3));
    const record = await indexImageArtifact({ path: good.path, allowedRoots: [good.root], store });
    const copy = store.get(record.artifactId)!;
    copy.path = "tampered";
    expect(store.get(record.artifactId)?.path).toBe(record.path);
  });

  it("defends against store put mutation and returned record mutation", async () => {
    class MutatingStore extends MemoryImageArtifactStore {
      put(record: Parameters<MemoryImageArtifactStore["put"]>[0]): void {
        super.put(record);
        record.path = "mutated-during-put";
      }
    }
    const f = await fixture(png(1, 1, 3));
    const store = new MutatingStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    expect(record.path).toBe(f.path);
    record.path = "mutated-after-return";
    expect(store.get(record.artifactId)?.path).toBe(f.path);
  });

  it("rejects empty allowlists and files outside roots with sanitized errors", async () => {
    const f = await fixture(png(1, 1, 3));
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [] })).rejects.toMatchObject({ code: "path_denied" });
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [join(f.root, "sibling")] })).rejects.toMatchObject({ code: "path_denied" });
    const siblingPrefix = `${f.root}-assets`;
    await mkdir(siblingPrefix);
    const siblingFile = join(siblingPrefix, "ok.png");
    await writeFile(siblingFile, await readFile(f.path));
    temporaryRoots.add(siblingPrefix);
    await expect(indexImageArtifact({ path: siblingFile, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "path_denied" });
    await expect(indexImageArtifact({ path: join(f.root, "..", basename(siblingPrefix), "ok.png"), allowedRoots: [f.root] })).rejects.toMatchObject({ code: "path_denied" });
    await expect(indexImageArtifact({ path: join(f.root, "missing.png"), allowedRoots: [f.root] })).rejects.toMatchObject({ code: "read_failure" });
    await expect(indexImageArtifact({ path: join(f.root, "image.png", "..", "missing.png"), allowedRoots: [f.root] })).rejects.toMatchObject({ code: "read_failure" });
  });

  it("rejects a symlink that resolves outside the allowed root", async () => {
    const f = await fixture(png(1, 1, 3));
    const outside = await fixture(png(1, 1, 3));
    if (process.platform === "win32") {
      const link = join(f.root, "escape-dir");
      await symlink(outside.root, link, "junction");
      await expect(indexImageArtifact({ path: join(link, "image.png"), allowedRoots: [f.root] })).rejects.toMatchObject({ code: "path_denied" });
    } else {
      const link = join(f.root, "escape.png");
      await symlink(outside.path, link);
      await expect(indexImageArtifact({ path: link, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "path_denied" });
    }
  });

  it("rejects directories before attempting a potentially blocking read", async () => {
    const f = await fixture(png(1, 1, 3));
    const directory = join(f.root, "directory.png");
    await mkdir(directory);
    await expect(indexImageArtifact({ path: directory, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "non_regular_file" });
  });

  it.skipIf(process.platform === "win32")("rejects a FIFO without blocking", async () => {
    const f = await fixture(png(1, 1, 3));
    const fifo = join(f.root, "pipe.png");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("mkfifo", [fifo]);
    await expect(indexImageArtifact({ path: fifo, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "non_regular_file" });
  });

  it("rejects bad CRC, ancillary chunks, APNG and unsupported profiles", async () => {
    const good = png(1, 1, 3);
    const ihdr = good.subarray(8, 33);
    const idat = good.subarray(33, good.length - 12);
    const grayscale = Buffer.from(ihdr.subarray(8, 21));
    grayscale[9] = 0;
    const sixteenBit = Buffer.from(ihdr.subarray(8, 21));
    sixteenBit[8] = 16;
    const interlaced = Buffer.from(ihdr.subarray(8, 21));
    interlaced[12] = 1;
    await expectIndexRejects(Buffer.concat([signature, chunk("IHDR", ihdr.subarray(8, -4), true), idat, chunk("IEND", Buffer.alloc(0))]), "malformed_png");
    for (const bytes of [
      Buffer.concat([signature, ihdr, chunk("tEXt", Buffer.from("x")), idat, chunk("IEND", Buffer.alloc(0))]),
      Buffer.concat([signature, ihdr, chunk("acTL", Buffer.alloc(8)), idat, chunk("IEND", Buffer.alloc(0))]),
      Buffer.concat([signature, chunk("IHDR", grayscale), idat, chunk("IEND", Buffer.alloc(0))]),
      Buffer.concat([signature, chunk("IHDR", sixteenBit), idat, chunk("IEND", Buffer.alloc(0))]),
      Buffer.concat([signature, chunk("IHDR", interlaced), idat, chunk("IEND", Buffer.alloc(0))]),
    ]) {
      await expectIndexRejects(bytes, "unsupported_png_profile");
    }
  });

  it("distinguishes unsupported file formats and malformed IHDR structure", async () => {
    await expectIndexRejects(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "malformed_jpeg");
    await expectIndexRejects(Buffer.from("RIFFxxxxWEBPbad", "ascii"), "unsupported_image_format");
    const good = png(1, 1, 3);
    const idat = good.subarray(33, good.length - 12);
    await expectIndexRejects(Buffer.concat([signature, chunk("IHDR", Buffer.alloc(12)), chunk("IEND", Buffer.alloc(0))]), "malformed_png");
    const palette = Buffer.from(good.subarray(16, 29));
    palette[9] = 3;
    await expectIndexRejects(Buffer.concat([signature, chunk("IHDR", palette), idat, chunk("IEND", Buffer.alloc(0))]), "unsupported_png_profile");
  });

  it("accepts an independently fixed PNG byte vector with its literal original hash", async () => {
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgZGJmAQAAGQAL51pGpAAAAABJRU5ErkJggg==", "base64");
    const f = await fixture(bytes);
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root] });
    expect(record).toMatchObject({ width: 1, height: 1, channels: 4, sha256: "69bf296785d54e4ec117aea10eac3a7269fc6d9fba672dc6819bdbc7817e883c" });
  });

  it("rejects truncated, trailing and unsupported filtered streams", async () => {
    const base = png(1, 1, 3);
    const compressed = deflateSync(Buffer.from([0, 1, 2, 3]));
    const header = base.subarray(0, 33);
    const withExtraStream = Buffer.concat([header, chunk("IDAT", Buffer.concat([compressed, compressed])), chunk("IEND", Buffer.alloc(0))]);
    for (const bytes of [base.subarray(0, -1), Buffer.concat([base, Buffer.from([1])]), png(1, 1, 3, Buffer.from([5, 1, 2, 3])), withExtraStream]) await expectIndexRejects(bytes, "malformed_png");
  });

  it("rejects dimensions over the configured axis and pixel ceilings", async () => {
    const axis = Buffer.from(png(1, 1, 3)); axis.writeUInt32BE(8193, 16);
    axis.writeUInt32BE(crc32(axis.subarray(12, 29)), 29);
    const pixels = Buffer.from(png(1, 1, 3)); pixels.writeUInt32BE(4097, 16); pixels.writeUInt32BE(4097, 20);
    pixels.writeUInt32BE(crc32(pixels.subarray(12, 29)), 29);
    for (const bytes of [axis, pixels]) await expectIndexRejects(bytes, "image_dimensions_exceeded");
  });

  it("rejects encoded-size excess, inflated-size mismatch, inflate overflow, and damaged compressed payloads", async () => {
    await expectIndexRejects(Buffer.alloc(10 * 1024 * 1024 + 1), "encoded_size_exceeded");
    await expectIndexRejects(png(2, 1, 3, Buffer.from([0, 1, 2, 3])), "malformed_png");
    const overflow = png(1, 1, 3, Buffer.from([0, 1, 2, 3, 4]));
    await expectIndexRejects(overflow, "malformed_png");
    const damagedPayload = Buffer.from(deflateSync(Buffer.from([0, 1, 2, 3])));
    damagedPayload[Math.max(0, damagedPayload.length - 2)] ^= 0xff;
    await expectIndexRejects(Buffer.concat([signature, png(1, 1, 3).subarray(8, 33), chunk("IDAT", damagedPayload), chunk("IEND", Buffer.alloc(0))]), "malformed_png");
  });

  it("rejects missing, reordered, duplicate critical, and wrongly sized PNG chunks", async () => {
    const good = png(1, 1, 3);
    const ihdr = good.subarray(8, 33);
    const idat = good.subarray(33, good.length - 12);
    await expectIndexRejects(Buffer.concat([signature, ihdr, chunk("IEND", Buffer.alloc(0))]), "malformed_png");
    await expectIndexRejects(Buffer.concat([signature, idat, ihdr, chunk("IEND", Buffer.alloc(0))]), "malformed_png");
    await expectIndexRejects(Buffer.concat([signature, ihdr, idat, ihdr, chunk("IEND", Buffer.alloc(0))]), "malformed_png");
    await expectIndexRejects(Buffer.concat([signature, chunk("IHDR", Buffer.alloc(12)), idat, chunk("IEND", Buffer.alloc(0))]), "malformed_png");
    await expectIndexRejects(Buffer.concat([signature, chunkWithTypeBytes(Buffer.from([0x89, 0x48, 0x44, 0x52]), Buffer.alloc(13)), idat, chunk("IEND", Buffer.alloc(0))]), "malformed_png");
  });

  it("reinspects only an unchanged, still-authorized source", async () => {
    const f = await fixture(png(1, 1, 3));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    expect((await inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store })).sha256).toBe(record.sha256);
    await writeFile(f.path, png(1, 1, 3, Buffer.from([0, 9, 8, 7])));
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
  });

  it("rejects unknown, removed, and revoked inspection sources without leaking paths", async () => {
    const f = await fixture(png(1, 1, 3));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    await expect(inspectImageArtifact({ artifactId: "image_unknown", allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "unknown_artifact_id" });
    await rm(f.path, { force: true });
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_missing_or_unreadable" });
    const restored = await fixture(png(1, 1, 3));
    const restoredRecord = await indexImageArtifact({ path: restored.path, allowedRoots: [restored.root], store });
    await expect(inspectImageArtifact({ artifactId: restoredRecord.artifactId, allowedRoots: [], store })).rejects.toMatchObject({ code: "path_denied" });
    await rm(dirname(restored.path), { recursive: true, force: true });
    await expect(inspectImageArtifact({ artifactId: restoredRecord.artifactId, allowedRoots: [restored.root], store })).rejects.toMatchObject({ code: "path_denied" });
  });
});

const capabilityErrorCodes = new Set(["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"]);
const directoryLinkType = process.platform === "win32" ? "junction" : "dir";

async function linkOrSkip(ctx: TestContext, target: string, path: string, type: "junction" | "dir" | "file"): Promise<void> {
  try {
    await symlink(target, path, type);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== undefined && capabilityErrorCodes.has(code)) {
      console.warn(`skipping ${type} link case: ${code} (platform lacks link capability or privilege)`);
      ctx.skip();
    }
    throw error;
  }
}

function serializedError(error: unknown): string {
  const value = error as Error & { code?: string };
  return JSON.stringify({ ...value, name: value.name, message: value.message, code: value.code });
}

function expectNoPaths(serialized: string[], paths: string[]): void {
  for (const text of serialized) {
    for (const path of paths) {
      expect(text).not.toContain(path);
      expect(text).not.toContain(JSON.stringify(path).slice(1, -1));
      expect(text).not.toContain(basename(path));
    }
  }
}

async function deniedError(path: string, allowedRoots: string[]): Promise<string> {
  const store = new MemoryImageArtifactStore();
  const error = await indexImageArtifact({ path, allowedRoots, store }).then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(ImageValidationError);
  expect(error).toMatchObject({ code: "path_denied", message: "path_denied" });
  expect(store.size).toBe(0);
  return serializedError(error);
}

describe("image allowed-root and link matrix", () => {
  it("denies outside existing and missing files identically without path details", async () => {
    const inside = await fixture(png(1, 1, 3));
    const outside = await fixture(png(1, 1, 3));
    const missing = join(outside.root, "missing.png");
    const existingError = await deniedError(outside.path, [inside.root]);
    const missingError = await deniedError(missing, [inside.root]);
    expect(missingError).toBe(existingError);
    expectNoPaths([existingError, missingError], [inside.root, outside.root, outside.path, missing]);
  });

  it("accepts an in-root PNG whose name starts with two dots", async () => {
    const f = await fixture(png(1, 1, 3));
    const path = join(f.root, "..notes.txt");
    await writeFile(path, png(1, 1, 3));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path, allowedRoots: [f.root], store });
    expect(record).toMatchObject({ path: await realpath(path), format: "png", width: 1, height: 1 });
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store })).resolves.toEqual(record);
  });

  it("omits a missing allowed root when another root is valid", async () => {
    const f = await fixture(png(1, 1, 3));
    const missingRoot = join(f.root, "missing-root");
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [missingRoot, f.root], store });
    expect(record.path).toBe(await realpath(f.path));
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root, missingRoot], store })).resolves.toEqual(record);
    const onlyMissing = await deniedError(f.path, [missingRoot]);
    expectNoPaths([onlyMissing], [f.root, f.path, missingRoot]);
  });

  it("denies existing and missing paths alike when the allowlist is empty", async () => {
    const f = await fixture(png(1, 1, 3));
    const missing = join(f.root, "missing.png");
    const existingError = await deniedError(f.path, []);
    const missingError = await deniedError(missing, []);
    expect(missingError).toBe(existingError);
    expectNoPaths([existingError, missingError], [f.root, f.path, missing]);
  });

  it("reports an in-root missing file as a sanitized read failure", async () => {
    const f = await fixture(png(1, 1, 3));
    const missing = join(f.root, "missing.png");
    const error = await indexImageArtifact({ path: missing, allowedRoots: [f.root], store: new MemoryImageArtifactStore() }).then(() => undefined, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(ImageValidationError);
    expect(error).toMatchObject({ code: "read_failure", message: "read_failure" });
    expectNoPaths([serializedError(error)], [f.root, missing]);
  });

  it("denies existing and missing children behind an in-root directory link to an outside root", async (ctx) => {
    const f = await fixture(png(1, 1, 3));
    const outside = await fixture(png(1, 1, 3));
    const link = join(f.root, "escape-dir");
    await linkOrSkip(ctx, outside.root, link, directoryLinkType);
    const existingError = await deniedError(join(link, "image.png"), [f.root]);
    const missingError = await deniedError(join(link, "missing.png"), [f.root]);
    expect(missingError).toBe(existingError);
    expectNoPaths([existingError, missingError], [f.root, outside.root, link]);
  });

  it("denies an in-root directory link to a missing outside directory", async (ctx) => {
    const f = await fixture(png(1, 1, 3));
    const outside = await fixture(png(1, 1, 3));
    const target = join(outside.root, "missing-dir");
    const link = join(f.root, "dangling-dir");
    await linkOrSkip(ctx, target, link, directoryLinkType);
    const childError = await deniedError(join(link, "image.png"), [f.root]);
    const linkError = await deniedError(link, [f.root]);
    expect(linkError).toBe(childError);
    expectNoPaths([childError, linkError], [f.root, outside.root, target, link]);
  });

  it("denies a self-referencing directory link cycle", async (ctx) => {
    const f = await fixture(png(1, 1, 3));
    const loop = join(f.root, "loop");
    await linkOrSkip(ctx, loop, loop, directoryLinkType);
    const linkError = await deniedError(loop, [f.root]);
    const childError = await deniedError(join(loop, "image.png"), [f.root]);
    expect(childError).toBe(linkError);
    expectNoPaths([linkError, childError], [f.root, loop]);
  });

  it("accepts a normal file under an allowed root that is itself a directory link", async (ctx) => {
    const f = await fixture(png(1, 1, 3));
    const holder = await mkdtemp(join(tmpdir(), "tco-image-root-link-"));
    temporaryRoots.add(holder);
    const rootLink = join(holder, "root-link");
    await linkOrSkip(ctx, f.root, rootLink, directoryLinkType);
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: join(rootLink, "image.png"), allowedRoots: [rootLink], store });
    expect(record.path).toBe(await realpath(f.path));
    await expect(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [rootLink], store })).resolves.toEqual(record);
  });

  it("denies in-root file symlinks to missing inside and outside targets alike", async (ctx) => {
    const f = await fixture(png(1, 1, 3));
    const outside = await fixture(png(1, 1, 3));
    const insideTarget = join(f.root, "absent.png");
    const outsideTarget = join(outside.root, "absent.png");
    const insideLink = join(f.root, "inside-missing.png");
    const outsideLink = join(f.root, "outside-missing.png");
    await linkOrSkip(ctx, insideTarget, insideLink, "file");
    await linkOrSkip(ctx, outsideTarget, outsideLink, "file");
    const insideError = await deniedError(insideLink, [f.root]);
    const outsideError = await deniedError(outsideLink, [f.root]);
    expect(outsideError).toBe(insideError);
    expectNoPaths([insideError, outsideError], [f.root, outside.root, insideTarget, outsideTarget, insideLink, outsideLink]);
  });
});

const helperMappings: Array<[ReadBoundedFileErrorCode, string, string, string]> = [
  ["empty_roots", "path_denied", "path_denied", "path_denied"],
  ["denied", "path_denied", "path_denied", "path_denied"],
  ["read_failure", "read_failure", "source_missing_or_unreadable", "source_missing_or_unreadable"],
  ["changed", "source_changed", "source_missing_or_unreadable", "source_changed"],
  ["non_regular", "non_regular_file", "source_missing_or_unreadable", "source_missing_or_unreadable"],
  ["too_large", "encoded_size_exceeded", "source_missing_or_unreadable", "source_missing_or_unreadable"],
];

describe("image bounded-reader error mapping", () => {
  it.each(helperMappings)("maps helper %s to index %s, inspect %s, and crop read %s", async (helperCode, indexCode, inspectCode, cropCode) => {
    const f = await fixture(png(1, 1, 3));
    let failure: ReadBoundedFileErrorCode | undefined;
    vi.resetModules();
    vi.doMock("../src/core/read-bounded-file.js", async () => {
      const actual = await vi.importActual<typeof import("../src/core/read-bounded-file.js")>("../src/core/read-bounded-file.js");
      return {
        ...actual,
        readBoundedFile: async (input: Parameters<typeof actual.readBoundedFile>[0]) => {
          if (failure === undefined) return actual.readBoundedFile(input);
          throw new actual.ReadBoundedFileError(failure, failure === "too_large" ? 10 * 1024 * 1024 + 1 : undefined);
        },
      };
    });
    try {
      const images = await import("../src/core/image-artifacts.js");
      const store = new images.MemoryImageArtifactStore();
      const record = await images.indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
      expect(record).toMatchObject({ format: "png", width: 1, height: 1, channels: 3 });
      failure = helperCode;
      const indexError = await images.indexImageArtifact({ path: f.path, allowedRoots: [f.root], store }).then(() => undefined, (reason: unknown) => reason);
      expect(indexError).toBeInstanceOf(images.ImageValidationError);
      expect(indexError).toMatchObject({ code: indexCode });
      const inspectError = await images.inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store }).then(() => undefined, (reason: unknown) => reason);
      expect(inspectError).toBeInstanceOf(images.ImageValidationError);
      expect(inspectError).toMatchObject({ code: inspectCode });
      const cropError = await images.readValidatedImageArtifact(record, [f.root]).then(() => undefined, (reason: unknown) => reason);
      expect(cropError).toBeInstanceOf(images.ImageValidationError);
      expect(cropError).toMatchObject({ code: cropCode });
      expect(store.size).toBe(1);
      expect(store.get(record.artifactId)).toEqual(record);
      failure = undefined;
      await expect(images.readValidatedImageArtifact(record, [f.root])).resolves.toMatchObject({ pixels: expect.any(Uint8Array) });
    } finally {
      vi.doUnmock("../src/core/read-bounded-file.js");
      vi.resetModules();
    }
  });
});
