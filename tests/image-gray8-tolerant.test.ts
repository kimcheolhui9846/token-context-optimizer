import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { afterEach, describe, expect, it } from "vitest";

import {
  MemoryImageArtifactStore,
  indexImageArtifact,
  inspectImageArtifact,
  readValidatedImageArtifact,
} from "../src/core/image-artifacts.js";
import type { ImageArtifactStore } from "../src/core/image-artifacts.js";
import { cropImageArtifact } from "../src/core/image-crop.js";
import { areaAverageRgba, overviewImageArtifact } from "../src/core/image-overview.js";
import { validateJpeg } from "../src/core/jpeg-validation.js";
import type { ImageArtifactRecord } from "../src/core/types.js";
import {
  GRAY8_PROFILE,
  PNG_SIGNATURE,
  chunk,
  expectedArtifactId,
  grayPattern,
  grayPng,
  ihdr,
  rgbControlPng,
  sha256Hex,
} from "./helpers/gray8-png.js";

const roots = new Set<string>();

async function fixture(bytes: Buffer, name = "gray.png"): Promise<{ root: string; path: string; canonical: string }> {
  const root = await mkdtemp(join(tmpdir(), "tco-gray8-"));
  roots.add(root);
  const path = join(root, name);
  await writeFile(path, bytes);
  return { root, path, canonical: await realpath(path) };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => "resolved", (error: { code?: string }) => error.code ?? String(error));
}

async function tolerantCode(bytes: Buffer): Promise<string> {
  const f = await fixture(bytes);
  const store = new MemoryImageArtifactStore();
  const code = await codeOf(indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" }));
  if (code !== "resolved") expect(store.size).toBe(0);
  return code;
}

/** Store that returns exactly what was put, so tampered or sparse records reach the core unchanged. */
class RawStore implements ImageArtifactStore {
  readonly records = new Map<string, ImageArtifactRecord>();
  get(artifactId: string): ImageArtifactRecord | undefined { return this.records.get(artifactId); }
  put(record: ImageArtifactRecord): void { this.records.set(record.artifactId, record); }
}

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.clear();
});

describe("gray8 tolerant ingestion (P1-P4, P7)", () => {
  it("P1: accepts metadata-free gray8 only in tolerant mode with the exact record and identity", async () => {
    const bytes = grayPng(5, 3);
    const f = await fixture(bytes);
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const sha = sha256Hex(bytes);
    expect(record).toStrictEqual({
      artifactId: expectedArtifactId(f.canonical, sha, GRAY8_PROFILE),
      path: f.canonical,
      sha256: sha,
      byteLength: bytes.length,
      format: "png",
      mimeType: "image/png",
      width: 5,
      height: 3,
      channels: 1,
      bitDepth: 8,
      validationProfile: GRAY8_PROFILE,
      ignoredChunks: [],
      alpha: "none",
    });
    expect(Object.keys(record)).toEqual([
      "artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile", "ignoredChunks", "alpha",
    ]);
    expect(store.size).toBe(1);
  });

  it("N1: strict (omitted and explicit) still rejects gray8 with unsupported_png_profile", async () => {
    const f = await fixture(grayPng(5, 3));
    const store = new MemoryImageArtifactStore();
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], store })).rejects.toMatchObject({ code: "unsupported_png_profile" });
    await expect(indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "strict" })).rejects.toMatchObject({ code: "unsupported_png_profile" });
    expect(store.size).toBe(0);
  });

  it.each([
    ["P2a gAMA, pHYs, tEXt", [chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])), chunk("pHYs", Buffer.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])), chunk("tEXt", Buffer.from("Comment\0hi", "latin1"))], [] as Buffer[], ["gAMA", "pHYs", "tEXt"]],
    ["P2b sRGB only", [chunk("sRGB", Buffer.from([0]))], [] as Buffer[], ["sRGB"]],
    ["P2c iCCP only", [chunk("iCCP", Buffer.concat([Buffer.from("gray\0", "latin1"), Buffer.from([0]), deflateSync(Buffer.from("not a real profile"))]))], [] as Buffer[], ["iCCP"]],
    ["first-occurrence order with repeats, case kept, after IDAT", [chunk("tEXt", Buffer.from("a\0b")), chunk("caBX", Buffer.from([1])), chunk("tEXt", Buffer.from("c\0d"))], [chunk("zzZz", Buffer.from([2])), chunk("caBX", Buffer.from([3]))], ["tEXt", "caBX", "zzZz"]],
  ])("%s: records ignored chunks without applying them", async (_name, before, after, expected) => {
    const pixels = grayPattern(6, 4);
    const bytes = grayPng(6, 4, { pixels, beforeIdat: before, afterIdat: after });
    const f = await fixture(bytes);
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    expect(record).toMatchObject({ validationProfile: GRAY8_PROFILE, channels: 1, alpha: "none", sha256: sha256Hex(bytes), byteLength: bytes.length });
    expect((record as { ignoredChunks: string[] }).ignoredChunks).toStrictEqual(expected);
    const decoded = await readValidatedImageArtifact(record, [f.root]);
    expect([...decoded.pixels]).toEqual([...pixels]);
  });

  it("P3: indexing the same file twice gives the same artifactId", async () => {
    const f = await fixture(grayPng(4, 4));
    const store = new MemoryImageArtifactStore();
    const first = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const second = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    expect(second).toStrictEqual(first);
    expect(store.size).toBe(1);
  });

  it("P4: inspect returns the same record and the store clones ignoredChunks on put and get", async () => {
    const f = await fixture(grayPng(4, 2, { beforeIdat: [chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])), chunk("tEXt", Buffer.from("k\0v"))] }));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" }) as Extract<ImageArtifactRecord, { validationProfile: "png-gray8-tolerant-v1" }>;
    (record.ignoredChunks as string[]).push("mutated");
    const stored = store.get(record.artifactId) as typeof record;
    expect(stored.ignoredChunks).toStrictEqual(["gAMA", "tEXt"]);
    (stored.ignoredChunks as string[]).reverse();
    const again = store.get(record.artifactId) as typeof record;
    expect(again.ignoredChunks).toStrictEqual(["gAMA", "tEXt"]);
    expect(again.ignoredChunks).not.toBe(stored.ignoredChunks);
    const inspected = await inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [f.root], store });
    expect(inspected).toStrictEqual({ ...record, ignoredChunks: ["gAMA", "tEXt"] });

    const putSource = { ...again, ignoredChunks: ["gAMA", "tEXt"] };
    store.put(putSource);
    putSource.ignoredChunks.push("late");
    expect((store.get(record.artifactId) as typeof record).ignoredChunks).toStrictEqual(["gAMA", "tEXt"]);
  });

  it("P7: accepts axis and total-pixel boundaries", async () => {
    for (const [width, height] of [[1, 1], [8192, 1], [1, 8192], [4096, 4096], [8192, 2048]] as const) {
      const bytes = grayPng(width, height, { pixels: new Uint8Array(width * height).fill(77) });
      const f = await fixture(bytes);
      const store = new MemoryImageArtifactStore();
      const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
      expect(record).toMatchObject({ width, height, channels: 1, validationProfile: GRAY8_PROFILE });
    }
  }, 120_000);
});

describe("gray8 row filters decode to independently known samples", () => {
  const cases: Array<[string, number, number, number | number[]]> = [
    ["filter 0 None", 7, 5, 0],
    ["filter 1 Sub", 7, 5, 1],
    ["filter 2 Up", 7, 5, 2],
    ["filter 3 Average", 7, 5, 3],
    ["filter 4 Paeth", 7, 5, 4],
    ["mixed rows", 9, 10, [0, 1, 2, 3, 4, 4, 3, 2, 1, 0]],
    ["width 1, every filter", 1, 5, [0, 1, 2, 3, 4]],
    ["height 1 Up/Average/Paeth with no previous row", 9, 1, 4],
    ["height 1 Average", 9, 1, 3],
    ["height 1 Up", 9, 1, 2],
  ];
  it.each(cases)("%s", async (_name, width, height, filters) => {
    const pixels = grayPattern(width, height);
    const f = await fixture(grayPng(width, height, { pixels, filters }));
    const store = new MemoryImageArtifactStore();
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const decoded = await readValidatedImageArtifact(record, [f.root]);
    expect(decoded.pixels.length).toBe(width * height);
    expect([...decoded.pixels]).toEqual([...pixels]);
  });
});

describe("gray8 tolerant rejections keep existing codes (N2-N5)", () => {
  it.each([
    ["bit depth 1", { bitDepth: 1 }],
    ["bit depth 2", { bitDepth: 2 }],
    ["bit depth 4", { bitDepth: 4 }],
    ["bit depth 16", { bitDepth: 16 }],
    ["color type 3 palette", { colorType: 3, beforeIdat: [chunk("PLTE", Buffer.from([0, 0, 0]))] }],
    ["color type 4 gray+alpha", { colorType: 4 }],
    ["Adam7 interlace", { interlace: 1 }],
    ["compression method 1", { compression: 1 }],
    ["filter method 1", { filterMethod: 1 }],
    ["tRNS gray key", { beforeIdat: [chunk("tRNS", Buffer.from([0, 5]))] }],
    ["PLTE on gray", { beforeIdat: [chunk("PLTE", Buffer.from([0, 0, 0]))] }],
    ["acTL", { beforeIdat: [chunk("acTL", Buffer.alloc(8))] }],
    ["fcTL", { beforeIdat: [chunk("fcTL", Buffer.alloc(26))] }],
    ["fdAT", { afterIdat: [chunk("fdAT", Buffer.alloc(4))] }],
    ["unknown critical chunk", { beforeIdat: [chunk("ABCD", Buffer.from([1]))] }],
  ])("N2 %s -> unsupported_png_profile", async (_name, options) => {
    expect(await tolerantCode(grayPng(3, 2, options))).toBe("unsupported_png_profile");
  });

  it("N2: a lowercase unknown ancillary is accepted while the critical variant is rejected", async () => {
    expect(await tolerantCode(grayPng(3, 2, { beforeIdat: [chunk("aBCD", Buffer.from([1]))] }))).toBe("resolved");
    expect(await tolerantCode(grayPng(3, 2, { beforeIdat: [chunk("ABCD", Buffer.from([1]))] }))).toBe("unsupported_png_profile");
  });

  it("N3: structural, CRC, stream and filter faults are malformed_png", async () => {
    const width = 4; const height = 3;
    const pixels = grayPattern(width, height);
    const valid = grayPng(width, height, { pixels });
    const scan = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(pixels.subarray(y * width, (y + 1) * width))])));
    const badFilter = Buffer.from(scan); badFilter[(width + 1) * 1] = 5;
    const streamWithTail = Buffer.concat([deflateSync(scan), Buffer.from([0, 1, 2])]);
    const ihdrEnd = 8 + 25;
    const badIdatCrc = Buffer.from(valid); badIdatCrc.writeUInt32BE((badIdatCrc.readUInt32BE(valid.length - 16) ^ 1) >>> 0, valid.length - 16);
    const compressed = deflateSync(scan);
    const split = Buffer.concat([
      PNG_SIGNATURE, ihdr(width, height, 8, 0),
      chunk("IDAT", compressed.subarray(0, 4)), chunk("tEXt", Buffer.from("a\0b")), chunk("IDAT", compressed.subarray(4)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const cases: Array<[string, Buffer]> = [
      ["IHDR CRC", Buffer.concat([valid.subarray(0, ihdrEnd - 4), Buffer.from([0, 0, 0, 0]), valid.subarray(ihdrEnd)])],
      ["ancillary CRC", grayPng(width, height, { pixels, beforeIdat: [chunk("tEXt", Buffer.from("a\0b"), true)] })],
      ["IDAT CRC", badIdatCrc],
      ["truncated chunk", valid.subarray(0, valid.length - 6)],
      ["invalid filter byte", grayPng(width, height, { scan: badFilter })],
      ["inflate too short", grayPng(width, height, { scan: scan.subarray(0, scan.length - 1) })],
      ["inflate too long", grayPng(width, height, { scan: Buffer.concat([scan, Buffer.from([0])]) })],
      ["compressed trailing bytes", grayPng(width, height, { idatData: streamWithTail })],
      ["ancillary between IDAT chunks", split],
    ];
    for (const [name, bytes] of cases) expect(`${name}:${await tolerantCode(bytes)}`).toBe(`${name}:malformed_png`);
  });

  it("N3: split IDAT chunks without interruption are accepted", async () => {
    const pixels = grayPattern(16, 8);
    const f = await fixture(grayPng(16, 8, { pixels, idatCount: 3 }));
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store: new MemoryImageArtifactStore(), profile: "tolerant" });
    expect([...(await readValidatedImageArtifact(record, [f.root])).pixels]).toEqual([...pixels]);
  });

  it("N4: dimension and encoded-size limits reject one condition at a time", async () => {
    const uniform = (width: number, height: number) => grayPng(width, height, { pixels: new Uint8Array(width * height) });
    expect(await tolerantCode(uniform(8193, 1))).toBe("image_dimensions_exceeded");
    expect(await tolerantCode(uniform(1, 8193))).toBe("image_dimensions_exceeded");
    expect(await tolerantCode(uniform(4096, 4097))).toBe("image_dimensions_exceeded");
    const oversized = grayPng(2, 2, { beforeIdat: [chunk("tEXt", Buffer.alloc(10 * 1024 * 1024, 0x41))] });
    expect(oversized.length).toBeGreaterThan(10 * 1024 * 1024);
    expect(await tolerantCode(oversized)).toBe("encoded_size_exceeded");
  }, 120_000);

  it("keeps the branch order: size, chunk structure/CRC, IHDR dimensions, profile, stream", async () => {
    const huge = grayPng(2, 2, { bitDepth: 16, beforeIdat: [chunk("tEXt", Buffer.alloc(10 * 1024 * 1024, 0x41))] });
    expect(await tolerantCode(huge)).toBe("encoded_size_exceeded");
    const gray16 = grayPng(8193, 1, { bitDepth: 16 });
    expect(await tolerantCode(gray16)).toBe("image_dimensions_exceeded");
    const ihdrBadCrc = Buffer.from(grayPng(3, 2, { bitDepth: 16 }));
    ihdrBadCrc.writeUInt32BE(0, 8 + 25 - 4);
    expect(await tolerantCode(ihdrBadCrc)).toBe("malformed_png");
    const badFilterGray16 = grayPng(2, 1, { bitDepth: 16, scan: Buffer.from([9, 0, 0, 0, 0]) });
    expect(await tolerantCode(badFilterGray16)).toBe("unsupported_png_profile");
    const trnsThenBadStream = grayPng(2, 1, { beforeIdat: [chunk("tRNS", Buffer.from([0, 1]))], scan: Buffer.from([9, 0, 0]) });
    expect(await tolerantCode(trnsThenBadStream)).toBe("unsupported_png_profile");
  });

  it("N5: 32 distinct ignored chunk types are accepted and a 33rd is rejected; repeats do not count", async () => {
    const types = Array.from({ length: 33 }, (_, index) => `x${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}A`);
    const chunks = (count: number) => types.slice(0, count).map((type) => chunk(type, Buffer.from([1])));
    const f = await fixture(grayPng(2, 2, { beforeIdat: [...chunks(32), ...chunks(32)] }));
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store: new MemoryImageArtifactStore(), profile: "tolerant" });
    expect((record as { ignoredChunks: string[] }).ignoredChunks).toStrictEqual(types.slice(0, 32));
    expect(await tolerantCode(grayPng(2, 2, { beforeIdat: chunks(33) }))).toBe("unsupported_png_profile");
  });
});

describe("gray8 views match the R=G=B control (P5, P6, N8)", () => {
  async function pair(width: number, height: number, withMetadata = true) {
    const pixels = grayPattern(width, height);
    const grayBytes = grayPng(width, height, {
      pixels,
      filters: [1, 2, 3, 4, 0],
      beforeIdat: withMetadata ? [chunk("gAMA", Buffer.from([0, 0, 0x27, 0x10])), chunk("iCCP", Buffer.concat([Buffer.from("g\0", "latin1"), Buffer.from([0]), deflateSync(Buffer.from("x"))]))] : [],
    });
    const grayFixture = await fixture(grayBytes, "gray.png");
    const controlFixture = await fixture(rgbControlPng(width, height, pixels), "control.png");
    const store = new MemoryImageArtifactStore();
    const gray = await indexImageArtifact({ path: grayFixture.path, allowedRoots: [grayFixture.root], store, profile: "tolerant" });
    const control = await indexImageArtifact({ path: controlFixture.path, allowedRoots: [controlFixture.root], store, profile: "tolerant" });
    expect(control.validationProfile).toBe("png-rgb8-tolerant-v1");
    return { gray, control, grayFixture, controlFixture, store, grayBytes };
  }

  function expectJpeg(output: { image: string; byteLength: number; sha256: string; width: number; height: number }) {
    const bytes = Buffer.from(output.image, "base64");
    expect(bytes.length).toBe(output.byteLength);
    expect(sha256Hex(bytes)).toBe(output.sha256);
    const decoded = jpeg.decode(bytes, { useTArray: true });
    expect([decoded.width, decoded.height]).toEqual([output.width, output.height]);
    expect(validateJpeg(bytes)).toMatchObject({ width: output.width, height: output.height, channels: 3, validationProfile: "jpeg-ycbcr8-baseline-444-v1" });
    return bytes;
  }

  it("P5: full-frame crop returns the original reference whose bytes hash to the source SHA", async () => {
    const { gray, grayFixture, store, grayBytes } = await pair(9, 6);
    const result = await cropImageArtifact({ artifactId: gray.artifactId, region: { x: 0, y: 0, width: 9, height: 6 }, allowedRoots: [grayFixture.root], store });
    expect(result).toStrictEqual({ status: "original", fullFrame: true, source: gray, region: { x: 0, y: 0, width: 9, height: 6 } });
    const reopened = await readFile(result.source.path);
    expect(sha256Hex(reopened)).toBe(result.source.sha256);
    expect(sha256Hex(reopened)).toBe(sha256Hex(grayBytes));
  });

  it("P6: partial crops, including edges and single pixels, are byte-identical to the control", async () => {
    const width = 37; const height = 23;
    const { gray, control, grayFixture, controlFixture, store } = await pair(width, height);
    const regions = [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: width - 1, y: height - 1, width: 1, height: 1 },
      { x: 5, y: 3, width: 10, height: 7 },
      { x: 0, y: 0, width, height: 1 },
      { x: 0, y: 0, width: 1, height },
      { x: 20, y: 10, width: width - 20, height: height - 10 },
      { x: 0, y: 0, width: width - 1, height },
    ];
    for (const region of regions) {
      const g = await cropImageArtifact({ artifactId: gray.artifactId, region, allowedRoots: [grayFixture.root], store });
      const c = await cropImageArtifact({ artifactId: control.artifactId, region, allowedRoots: [controlFixture.root], store });
      if (g.status !== "cropped" || c.status !== "cropped") throw new Error(`expected cropped for ${JSON.stringify(region)}`);
      expect(g.source).toStrictEqual(gray);
      const grayJpeg = expectJpeg(g.output);
      const controlJpeg = expectJpeg(c.output);
      expect(grayJpeg.equals(controlJpeg)).toBe(true);
      expect([g.output.width, g.output.height]).toEqual([region.width, region.height]);
    }
  });

  it("P6: overviews at 512, 64, 1536 and a maxSide above the source are byte-identical to the control", async () => {
    for (const [width, height, sides] of [
      [700, 301, [undefined, 64, 1536]],
      [1601, 97, [1536, 512]],
      [37, 23, [64, 512]],
    ] as const) {
      const { gray, control, grayFixture, controlFixture, store } = await pair(width, height);
      for (const maxSide of sides) {
        const g = await overviewImageArtifact({ artifactId: gray.artifactId, maxSide, allowedRoots: [grayFixture.root], store });
        const c = await overviewImageArtifact({ artifactId: control.artifactId, maxSide, allowedRoots: [controlFixture.root], store });
        expect(g.source).toStrictEqual(gray);
        expect([g.output.width, g.output.height]).toEqual([c.output.width, c.output.height]);
        expect(expectJpeg(g.output).equals(expectJpeg(c.output))).toBe(true);
      }
    }
  }, 60_000);

  it("area averaging one gray channel equals averaging the R=G=B expansion", () => {
    for (const [W, H, w, h] of [[7, 5, 3, 2], [9, 4, 9, 4], [13, 11, 4, 7], [64, 3, 5, 1], [1, 9, 1, 2]] as const) {
      const gray = grayPattern(W, H);
      const rgb = new Uint8Array(W * H * 3);
      for (let index = 0; index < gray.length; index++) rgb.fill(gray[index], index * 3, index * 3 + 3);
      const fromGray = areaAverageRgba(gray, W, H, 1, w, h);
      expect(fromGray.length).toBe(w * h * 4);
      expect(fromGray.equals(areaAverageRgba(rgb, W, H, 3, w, h))).toBe(true);
    }
  });

  it("N8: a partial region side of 1537 returns resize_required; 1536 is cropped", async () => {
    const f = await fixture(grayPng(1600, 2, { pixels: new Uint8Array(3200).fill(9) }));
    const store = new MemoryImageArtifactStore();
    const gray = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    await expect(cropImageArtifact({ artifactId: gray.artifactId, region: { x: 0, y: 0, width: 1537, height: 2 }, allowedRoots: [f.root], store }))
      .resolves.toMatchObject({ status: "rejected", code: "resize_required", fullFrame: false });
    await expect(cropImageArtifact({ artifactId: gray.artifactId, region: { x: 0, y: 0, width: 1536, height: 2 }, allowedRoots: [f.root], store }))
      .resolves.toMatchObject({ status: "cropped", output: { width: 1536, height: 2 } });
  });
});

describe("gray8 revalidation (N6, N7) and existing-profile regressions (R1, R2)", () => {
  async function indexed(beforeIdat: Buffer[] = [chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])), chunk("tEXt", Buffer.from("k\0v"))]) {
    const pixels = grayPattern(6, 5);
    const bytes = grayPng(6, 5, { pixels, beforeIdat });
    const f = await fixture(bytes);
    const record = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store: new MemoryImageArtifactStore(), profile: "tolerant" });
    return { f, record, pixels, bytes };
  }

  async function allThree(record: ImageArtifactRecord, root: string, store: ImageArtifactStore): Promise<string[]> {
    return [
      await codeOf(inspectImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })),
      await codeOf(cropImageArtifact({ artifactId: record.artifactId, region: { x: 1, y: 1, width: 2, height: 2 }, allowedRoots: [root], store })),
      await codeOf(overviewImageArtifact({ artifactId: record.artifactId, allowedRoots: [root], store })),
    ];
  }

  it("N6: replacing the source with the R=G=B control or another gray image gives source_changed everywhere", async () => {
    for (const replacement of ["control", "gray"] as const) {
      const { f, record, pixels } = await indexed();
      const store = new RawStore(); store.put(record);
      expect(await allThree(record, f.root, store)).toEqual(["resolved", "resolved", "resolved"]);
      const other = new Uint8Array(pixels); other[0] ^= 1;
      await writeFile(f.path, replacement === "control" ? rgbControlPng(6, 5, pixels) : grayPng(6, 5, { pixels: other, beforeIdat: [chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])), chunk("tEXt", Buffer.from("k\0v"))] }));
      expect(await allThree(record, f.root, store)).toEqual(["source_changed", "source_changed", "source_changed"]);
    }
  });

  type Mutation = (record: Record<string, unknown>) => void;
  const sparse = (): string[] => { const array: string[] = []; array.length = 2; array[1] = "tEXt"; return array; };
  const tampers: Array<[string, Mutation]> = [
    ["channels 3", (r) => { r.channels = 3; }],
    ["channels 4", (r) => { r.channels = 4; }],
    ["alpha opaque", (r) => { r.alpha = "opaque"; }],
    ["alpha present", (r) => { r.alpha = "present"; }],
    ["alpha undefined", (r) => { r.alpha = undefined; }],
    ["alpha missing", (r) => { delete r.alpha; }],
    ["ignoredChunks missing", (r) => { delete r.ignoredChunks; }],
    ["ignoredChunks reordered", (r) => { r.ignoredChunks = ["tEXt", "gAMA"]; }],
    ["ignoredChunks different", (r) => { r.ignoredChunks = ["gAMA", "zTXt"]; }],
    ["ignoredChunks fewer", (r) => { r.ignoredChunks = ["gAMA"]; }],
    ["ignoredChunks extra", (r) => { r.ignoredChunks = ["gAMA", "tEXt", "pHYs"]; }],
    ["ignoredChunks empty", (r) => { r.ignoredChunks = []; }],
    ["ignoredChunks sparse hole", (r) => { r.ignoredChunks = sparse(); }],
    ["ignoredChunks string", (r) => { r.ignoredChunks = "gAMA"; }],
    ["width", (r) => { r.width = 7; }],
    ["height", (r) => { r.height = 4; }],
    ["bitDepth", (r) => { r.bitDepth = 16; }],
    ["format jpeg", (r) => { r.format = "jpeg"; r.mimeType = "image/jpeg"; }],
    ["mimeType", (r) => { r.mimeType = "image/jpeg"; }],
    ["profile png-rgb8-tolerant-v1", (r) => { r.validationProfile = "png-rgb8-tolerant-v1"; }],
    ["profile png-rgb8-static-v1 with tolerant fields", (r) => { r.validationProfile = "png-rgb8-static-v1"; }],
    ["JPEG coding field", (r) => { r.coding = "baseline"; }],
    ["JPEG sampling field", (r) => { r.sampling = "1x1,1x1,1x1"; }],
    ["JPEG ignoredSegments field", (r) => { r.ignoredSegments = []; }],
    ["JPEG exifOrientation field", (r) => { r.exifOrientation = null; }],
  ];

  it.each(tampers)("N7 %s -> decode_failed in inspect, crop and overview", async (_name, mutate) => {
    const { f, record } = await indexed();
    const tampered = { ...record, ignoredChunks: [...(record as { ignoredChunks: string[] }).ignoredChunks] } as Record<string, unknown>;
    mutate(tampered);
    const store = new RawStore(); store.put(tampered as ImageArtifactRecord);
    expect(await allThree(tampered as ImageArtifactRecord, f.root, store)).toEqual(["decode_failed", "decode_failed", "decode_failed"]);
  });

  it("N7: an untampered record in the raw store passes all three paths", async () => {
    const { f, record } = await indexed();
    const store = new RawStore(); store.put(record);
    expect(await allThree(record, f.root, store)).toEqual(["resolved", "resolved", "resolved"]);
  });

  it("N7: existing-profile tamper results are unchanged (channels 1 on RGB records)", async () => {
    const pixels = grayPattern(6, 5);
    const f = await fixture(rgbControlPng(6, 5, pixels), "control.png");
    const strictRecord = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store: new MemoryImageArtifactStore() });
    const tolerantRecord = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store: new MemoryImageArtifactStore(), profile: "tolerant" });
    const strictStore = new RawStore(); strictStore.put({ ...strictRecord, channels: 1 } as unknown as ImageArtifactRecord);
    const tolerantStore = new RawStore(); tolerantStore.put({ ...tolerantRecord, channels: 1 } as unknown as ImageArtifactRecord);
    expect(await allThree(strictRecord, f.root, strictStore)).toEqual(["resolved", "decode_failed", "decode_failed"]);
    expect(await allThree(tolerantRecord, f.root, tolerantStore)).toEqual(["decode_failed", "decode_failed", "decode_failed"]);
  });

  it("R2: the R=G=B control keeps png-rgb8 profiles and the existing identity rule", async () => {
    const pixels = grayPattern(6, 5);
    const bytes = rgbControlPng(6, 5, pixels);
    const f = await fixture(bytes, "control.png");
    const store = new MemoryImageArtifactStore();
    const strict = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store });
    const tolerant = await indexImageArtifact({ path: f.path, allowedRoots: [f.root], store, profile: "tolerant" });
    const sha = sha256Hex(bytes);
    expect(strict).toStrictEqual({ artifactId: expectedArtifactId(f.canonical, sha, null), path: f.canonical, sha256: sha, byteLength: bytes.length, format: "png", mimeType: "image/png", width: 6, height: 5, channels: 3, bitDepth: 8, validationProfile: "png-rgb8-static-v1" });
    expect(tolerant).toStrictEqual({ ...strict, artifactId: expectedArtifactId(f.canonical, sha, "png-rgb8-tolerant-v1"), validationProfile: "png-rgb8-tolerant-v1", ignoredChunks: [], alpha: "none" });
  });
});
