import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const roots = new Set<string>();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type); const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return result;
}

function png(width: number, height: number, channels: 3 | 4, alpha = 255, seed = 0): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 6;
  const scan = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([
    Buffer.from([0]), Buffer.from(Array.from({ length: width * channels }, (_, x) => channels === 4 && x % 4 === 3 ? alpha : (x + y * width + seed) % 251)),
  ])));
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]);
}

async function fixture(bytes = png(2, 2, 3), name = "image.png"): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "tco-crop-boundary-")); roots.add(root);
  const path = join(root, name); await writeFile(path, bytes); return { root, path };
}

async function core(): Promise<typeof import("../src/core/image-artifacts.js") & typeof import("../src/core/image-crop.js")> {
  vi.resetModules();
  const artifacts = await import("../src/core/image-artifacts.js");
  const crop = await import("../src/core/image-crop.js");
  return { ...artifacts, ...crop };
}

afterEach(async () => {
  vi.doUnmock("node:fs/promises"); vi.resetModules();
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("crop_image_artifact boundary and source-security contract", () => {
  it("prioritizes missing artifact over empty region, but validates an indexed empty region before reading", async () => {
    const f = await fixture(); const { cropImageArtifact, indexImageArtifact } = await core();
    await expect(cropImageArtifact({ artifactId: "missing", region: { x: 0, y: 0, width: 0, height: 1 }, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "artifact_not_indexed" });
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root] });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 0, height: 1 }, allowedRoots: [] })).rejects.toMatchObject({ code: "region_empty" });
    await writeFile(f.path, "changed");
    for (const region of [{ x: 0, y: 0, width: -1, height: 1 }, { x: 0, y: 0, width: 1, height: -1 }, { x: 0, y: 0, width: 0, height: 1 }]) {
      await expect(cropImageArtifact({ artifactId: source.artifactId, region, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "region_empty" });
    }
  });

  it("reads authorization before rejecting negative coordinates", async () => {
    const f = await fixture(); const { cropImageArtifact, indexImageArtifact } = await core();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root] });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: -1, y: 0, width: 1, height: 1 }, allowedRoots: [] })).rejects.toMatchObject({ code: "path_denied" });
  });

  it.each([
    [{ x: 0.5, y: 0, width: 1, height: 1 }], [{ x: Number.NaN, y: 0, width: 1, height: 1 }],
    [{ x: Number.POSITIVE_INFINITY, y: 0, width: 1, height: 1 }], [{ x: 2 ** 53, y: 0, width: 1, height: 1 }],
    [{ x: Number.MAX_SAFE_INTEGER, y: 0, width: 1, height: 1 }],
  ])("rejects unsafe or non-finite region %#", async (region) => {
    const f = await fixture(); const { cropImageArtifact, indexImageArtifact } = await core();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root] });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "invalid_region" });
  });

  it("accepts the 1536 crop cap and rejects 1537, while allowing a large full-frame RGBA original", async () => {
    const { cropImageArtifact, indexImageArtifact } = await core();
    const rgb = await fixture(png(1537, 2, 3), "large-rgb.png");
    const source = await indexImageArtifact({ path: rgb.path, allowedRoots: [rgb.root] });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1536, height: 1 }, allowedRoots: [rgb.root] })).resolves.toMatchObject({ status: "cropped", output: { width: 1536, height: 1 } });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1537, height: 1 }, allowedRoots: [rgb.root] })).resolves.toMatchObject({ status: "rejected", code: "resize_required" });
    const rgba = await fixture(png(1537, 2, 4, 0), "large-rgba.png");
    const rgbaSource = await indexImageArtifact({ path: rgba.path, allowedRoots: [rgba.root] });
    await expect(cropImageArtifact({ artifactId: rgbaSource.artifactId, region: { x: 0, y: 0, width: 1537, height: 1 }, allowedRoots: [rgba.root] })).resolves.toMatchObject({ status: "rejected", code: "resize_required" });
    await expect(cropImageArtifact({ artifactId: rgbaSource.artifactId, region: { x: 0, y: 0, width: 1537, height: 2 }, allowedRoots: [rgba.root] })).resolves.toMatchObject({ status: "original", fullFrame: true });
  });

  it("rejects both opaque and transparent partial RGBA crops", async () => {
    const { cropImageArtifact, indexImageArtifact } = await core();
    for (const alpha of [255, 0]) {
      const f = await fixture(png(2, 2, 4, alpha), `rgba-${alpha}.png`);
      const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root] });
      await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root] })).rejects.toMatchObject({ code: "alpha_unsupported" });
    }
  });

  it("maps missing and denied sources, detects same-size source changes, and preserves the indexed record", async () => {
    const { cropImageArtifact, indexImageArtifact, inspectImageArtifact, MemoryImageArtifactStore } = await core();
    const f = await fixture(); const store = new MemoryImageArtifactStore();
    const source = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    await unlink(f.path);
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_missing_or_unreadable" });
    const replacement = await fixture(png(2, 2, 3, 255, 1), "replacement.png");
    await writeFile(f.path, await readFile(replacement.path));
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [], store })).rejects.toMatchObject({ code: "path_denied" });
    expect(store.size).toBe(1); expect(store.get(source.artifactId)).toEqual(source);
    await writeFile(f.path, await readFile(replacement.path));
    await expect(inspectImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
  });

  it("detects a same-size in-place replacement during crop read and preserves inspect mapping", async () => {
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const f = await fixture(); const base = await core(); const store = new base.MemoryImageArtifactStore();
    const source = await base.indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const original = await readFile(f.path); const replacement = png(2, 2, 3, 255, 1);
    expect(replacement.length).toBe(original.length);
    const before = await actualFs.stat(f.path); let swapped = false;
    vi.doMock("node:fs/promises", () => ({ ...actualFs, open: async (...args: Parameters<typeof actualFs.open>) => {
      const handle = await actualFs.open(...args);
      return { ...handle, stat: handle.stat.bind(handle), close: handle.close.bind(handle), read: async (...readArgs: Parameters<typeof handle.read>) => {
        const result = await handle.read(...readArgs);
        if (!swapped && result.bytesRead > 0) { swapped = true; await actualFs.writeFile(f.path, replacement); await actualFs.utimes(f.path, before.atime, before.mtime); }
        return result;
      } };
    } }));
    const { cropImageArtifact, inspectImageArtifact } = await core();
    await expect(cropImageArtifact({ artifactId: source.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_changed" });
    expect(store.size).toBe(1); expect(store.get(source.artifactId)).toEqual(source);
    await writeFile(f.path, original);
    swapped = false;
    await expect(inspectImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "source_missing_or_unreadable" });
    await writeFile(f.path, original);
    expect(await base.inspectImageArtifact({ artifactId: source.artifactId, allowedRoots: [f.root], store })).toEqual(source);
  });

  it("snapshots the input region before an asynchronous source read and never writes output files", async () => {
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const f = await fixture(); const base = await core(); const store = new base.MemoryImageArtifactStore();
    const source = await base.indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const beforeBytes = await readFile(f.path); const beforeStat = await stat(f.path); const beforeDir = await readdir(f.root);
    const region = { x: 0, y: 0, width: 1, height: 1 }; let mutated = false;
    vi.doMock("node:fs/promises", () => ({ ...actualFs, open: async (...args: Parameters<typeof actualFs.open>) => {
      const handle = await actualFs.open(...args); return { ...handle, stat: handle.stat.bind(handle), close: handle.close.bind(handle), read: async (...readArgs: Parameters<typeof handle.read>) => {
        const result = await handle.read(...readArgs); if (!mutated && result.bytesRead > 0) { mutated = true; region.width = 2; } return result;
      } };
    } }));
    const { cropImageArtifact } = await core();
    const result = await cropImageArtifact({ artifactId: source.artifactId, region, allowedRoots: [f.root], store });
    expect(result).toMatchObject({ status: "cropped", region: { x: 0, y: 0, width: 1, height: 1 }, output: { width: 1, height: 1 } });
    expect(await readFile(f.path)).toEqual(beforeBytes); expect(await stat(f.path)).toMatchObject({ size: beforeStat.size, mtimeMs: beforeStat.mtimeMs }); expect(await readdir(f.root)).toEqual(beforeDir); expect(store.size).toBe(1);
  });
});
