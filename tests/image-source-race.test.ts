import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  mkdtemp,
  mkdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const temporaryRoots = new Set<string>();

afterEach(async () => {
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

function png(rows: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

async function fixture(bytes: Buffer): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "tco-image-race-"));
  temporaryRoots.add(root);
  const path = join(root, "image.png");
  await writeFile(path, bytes);
  return { root, path };
}

describe("image source race checks", () => {
  it("rejects same-size in-place overwrite between path stat and file open", async () => {
    const original = png(Buffer.from([0, 1, 2, 3]));
    const replacement = png(Buffer.from([0, 9, 8, 7]));
    expect(replacement.length).toBe(original.length);
    expect(createHash("sha256").update(replacement).digest("hex")).not.toBe(createHash("sha256").update(original).digest("hex"));
    const f = await fixture(original);
    const canonical = await realpath(f.path);
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let swapped = false;
    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      stat: async (path: Parameters<typeof actualFs.stat>[0], options?: Parameters<typeof actualFs.stat>[1]) => {
        const result = await actualFs.stat(path, options);
        if (!swapped && String(path) === canonical) {
          swapped = true;
          await actualFs.writeFile(f.path, replacement);
          await actualFs.utimes(f.path, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
        }
        return result;
      },
    }));
    const { indexImageArtifact } = await import("../src/core/image-artifacts.js");

    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "source_changed" });
  });

  it("rejects same-path replacement after the source bytes are read", async () => {
    const original = png(Buffer.from([0, 1, 2, 3]));
    const replacement = png(Buffer.from([0, 9, 8, 7]));
    expect(replacement.length).toBe(original.length);
    const f = await fixture(original);
    const backup = join(f.root, "old-image.png");
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const stableTime = new Date(Math.floor(Date.now() / 1000) * 1000 - 2000);
    await actualFs.utimes(f.path, stableTime, stableTime);
    const before = await actualFs.stat(f.path);
    let swapped = false;
    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      open: async (...args: Parameters<typeof actualFs.open>) => {
        const handle = await actualFs.open(...args);
        return {
          ...handle,
          stat: handle.stat.bind(handle),
          close: handle.close.bind(handle),
          read: async (...readArgs: Parameters<typeof handle.read>) => {
            const result = await handle.read(...readArgs);
            if (!swapped && result.bytesRead > 0) {
              swapped = true;
              await actualFs.rename(f.path, backup);
              await actualFs.writeFile(f.path, replacement);
              await actualFs.utimes(f.path, before.atime, before.mtime);
              const after = await actualFs.stat(f.path);
              expect(after.size).toBe(before.size);
              expect(after.mtimeMs).toBe(before.mtimeMs);
              expect(after.ino).not.toBe(before.ino);
            }
            return result;
          },
        };
      },
    }));
    const { indexImageArtifact, MemoryImageArtifactStore } = await import("../src/core/image-artifacts.js");
    const store = new MemoryImageArtifactStore();

    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
    expect(store.size).toBe(0);
  });

  it.skipIf(process.platform !== "win32")("rejects an intermediate directory junction replacement", async () => {
    const original = png(Buffer.from([0, 1, 2, 3]));
    const replacement = png(Buffer.from([0, 9, 8, 7]));
    const f = await fixture(original);
    const sourceDir = join(f.root, "source-dir");
    const sourceBackup = join(f.root, "source-dir-old");
    const outside = await mkdtemp(join(tmpdir(), "tco-image-junction-outside-"));
    temporaryRoots.add(outside);
    const replacementDir = join(outside, "replacement");
    await mkdir(sourceDir);
    await mkdir(replacementDir);
    await rename(f.path, join(sourceDir, "image.png"));
    await writeFile(join(replacementDir, "image.png"), replacement);
    const sourcePath = join(sourceDir, "image.png");
    const canonical = await realpath(sourcePath);
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let swapped = false;
    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      stat: async (path: Parameters<typeof actualFs.stat>[0], options?: Parameters<typeof actualFs.stat>[1]) => {
        const result = await actualFs.stat(path, options);
        if (!swapped && String(path) === canonical) {
          swapped = true;
          await actualFs.rename(sourceDir, sourceBackup);
          await actualFs.symlink(replacementDir, sourceDir, "junction");
        }
        return result;
      },
    }));
    const { indexImageArtifact } = await import("../src/core/image-artifacts.js");

    await expect(indexImageArtifact({ path: sourcePath, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "source_changed" });
  });

  it("rejects same-file byte replacement even when the original mtime is restored", async () => {
    const original = png(Buffer.from([0, 1, 2, 3]));
    const replacement = png(Buffer.from([0, 9, 8, 7]));
    expect(replacement.length).toBe(original.length);
    const f = await fixture(original);
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const stableTime = new Date(Math.floor(Date.now() / 1000) * 1000 - 2000);
    await actualFs.utimes(f.path, stableTime, stableTime);
    const before = await actualFs.stat(f.path);
    let swapped = false;
    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      open: async (...args: Parameters<typeof actualFs.open>) => {
        const handle = await actualFs.open(...args);
        return {
          ...handle,
          stat: handle.stat.bind(handle),
          close: handle.close.bind(handle),
          read: async (...readArgs: Parameters<typeof handle.read>) => {
            const result = await handle.read(...readArgs);
            if (!swapped && result.bytesRead > 0) {
              swapped = true;
              await actualFs.writeFile(f.path, replacement);
              await actualFs.utimes(f.path, before.atime, before.mtime);
              const after = await actualFs.stat(f.path);
              expect(after.size).toBe(before.size);
              expect(after.dev).toBe(before.dev);
              expect(after.ino).toBe(before.ino);
              expect(after.mtimeMs).toBe(before.mtimeMs);
              expect(after.ctimeMs).not.toBe(before.ctimeMs);
            }
            return result;
          },
        };
      },
    }));
    const { indexImageArtifact } = await import("../src/core/image-artifacts.js");

    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "source_changed" });
  });
});
