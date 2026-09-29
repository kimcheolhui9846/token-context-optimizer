import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MemoryImageArtifactStore,
  indexImageArtifact,
  inspectImageArtifact,
} from "../src/core/image-artifacts.js";

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
    await expectIndexRejects(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "unsupported_image_format");
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
    await expect(inspectImageArtifact({ artifactId: restoredRecord.artifactId, allowedRoots: [restored.root], store })).rejects.toMatchObject({ code: "source_missing_or_unreadable" });
  });
});
