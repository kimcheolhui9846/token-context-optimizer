import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fromJSONSchema } from "zod/v4";
import { validateJpeg } from "../src/core/jpeg-validation.js";
import { CropMcpClient, type RpcResponse } from "./helpers/crop-mcp-client.js";
import { deflateSync } from "node:zlib";

const baseline = JSON.parse(await readFile("tests/fixtures/task39-base-tools.json", "utf8")) as { tools: any[] };
const tolerantSchemaVariant = { type: "object", properties: { artifactId: { type: "string" }, path: { type: "string" }, sha256: { type: "string" }, byteLength: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 }, format: { type: "string", const: "png" }, mimeType: { type: "string", const: "image/png" }, width: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 }, height: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 }, channels: { anyOf: [{ type: "number", const: 3 }, { type: "number", const: 4 }] }, bitDepth: { type: "number", const: 8 }, validationProfile: { type: "string", const: "png-rgb8-tolerant-v1" }, ignoredChunks: { type: "array", items: { type: "string" } }, alpha: { type: "string", enum: ["none", "opaque", "present"] } }, required: ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile", "ignoredChunks", "alpha"], additionalProperties: false };
function withTolerantSchema(value: any): any { if (Array.isArray(value)) return value.map(withTolerantSchema); if (!value || typeof value !== "object") return value; const copy = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withTolerantSchema(item)])); if (Array.isArray(copy.anyOf) && copy.anyOf.some((item: any) => item?.properties?.validationProfile?.const === "png-rgb8-static-v1")) { const index = copy.anyOf.findIndex((item: any) => item?.properties?.validationProfile?.const === "png-rgb8-static-v1"); copy.anyOf.splice(index + 1, 0, tolerantSchemaVariant); } return copy; }
const roots: string[] = [];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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
  out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

function makePng(width: number, height: number, channels: 3 | 4): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 6;
  const scan = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([
    Buffer.from([0]), Buffer.from(Array.from({ length: width * channels }, (_, x) => channels === 4 && x % 4 === 3 ? 255 : (x + y) % 251)),
  ])));
  return Buffer.concat([pngSignature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]);
}

function makeAncillaryPng(width: number, height: number, channels: 3 | 4): Buffer {
  const base = makePng(width, height, channels);
  const idat = chunk("sRGB", Buffer.from([0]));
  const gama = chunk("gAMA", Buffer.from([0, 0, 0, 0]));
  const phys = chunk("pHYs", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 1]));
  const idatOffset = base.indexOf(Buffer.from("IDAT", "ascii")) - 4;
  return Buffer.concat([base.subarray(0, idatOffset), idat, gama, phys, base.subarray(idatOffset)]);
}

async function fixture(bytes: Buffer, name = "source.png"): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "tco-mcp-crop-")); roots.push(root);
  const path = join(root, name); await writeFile(path, bytes); return { root, path };
}

async function withClient<T>(root: string, fn: (client: CropMcpClient) => Promise<T>): Promise<T> {
  const client = await CropMcpClient.start(undefined, root);
  try { return await fn(client); } finally { await client.close(); }
}

function resultOf(response: RpcResponse): any {
  if (response.error) throw new Error(`MCP error: ${JSON.stringify(response.error)}`);
  return response.result;
}

function expectTextOnlyError(result: any, code: string): void {
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  expect(result.content[0].text).toContain(code);
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("crop_image_artifact MCP contract", () => {
  it("preserves all seven original tools and advertises crop with a caller-supplied region", async () => {
    const root = await mkdtemp(join(tmpdir(), "tco-mcp-list-")); roots.push(root);
    await withClient(root, async (client) => {
      const tools = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(baseline.tools.map((tool: any) => tool.name));
      for (const expected of baseline.tools) {
        const actual = tools.find((tool) => tool.name === expected.name);
        if (expected.name === "query_artifact") {
          expect(actual).toStrictEqual({
            ...expected,
            description: "Return bounded source excerpts for an indexed artifact with line evidence. By default, include up to five excerpts around positive highest-score ties in file order; maxExcerpts can select 1-20 excerpts. Shared excerpt text counts once toward the token budget, and omitted matches are reported in moreMatches.",
            inputSchema: {
              ...expected.inputSchema,
              properties: { ...expected.inputSchema.properties, maxExcerpts: { type: "integer", minimum: 1, maximum: 20 } },
            },
          });
        } else if (expected.name === "index_image_artifact" || expected.name === "inspect_image_artifact") {
          if (expected.name === "index_image_artifact") {
            expect(actual).toEqual({ ...expected, description: "Validate and index a restricted static PNG or baseline 4:4:4 JPEG without retaining pixels. PNG validation defaults to strict; use profile tolerant to accept bounded ancillary chunks.", inputSchema: { ...expected.inputSchema, properties: { ...expected.inputSchema.properties, profile: { type: "string", enum: ["strict", "tolerant"] } } }, outputSchema: withTolerantSchema(expected.outputSchema) });
          } else {
            expect(actual).toEqual({ ...expected, outputSchema: withTolerantSchema(expected.outputSchema) });
          }
        } else if (expected.name === "crop_image_artifact") {
          expect(actual).toEqual({ ...expected, outputSchema: withTolerantSchema(expected.outputSchema) });
        } else {
          expect(actual).toEqual(expected);
        }
      }
      const crop = tools.find((tool) => tool.name === "crop_image_artifact");
      expect(crop.description).toMatch(/caller.*region/i);
      expect(crop.description).toMatch(/overview/i);
      expect(crop.inputSchema.additionalProperties).toBe(false);
      expect(crop.inputSchema.required).toEqual(["artifactId", "region"]);
      expect(crop.inputSchema.properties.region.additionalProperties).toBe(false);
    });
  });

  it("accepts an explicit tolerant profile and returns tolerant PNG metadata", async () => {
    const f = await fixture(makeAncillaryPng(1537, 2, 4));
    await withClient(f.root, async (client) => {
      const response = resultOf(await client.call("index_image_artifact", {
        path: f.path,
        profile: "tolerant",
      }));
      expect(response.structuredContent).toMatchObject({
        format: "png",
        mimeType: "image/png",
        channels: 4,
        validationProfile: "png-rgb8-tolerant-v1",
        ignoredChunks: ["sRGB", "gAMA", "pHYs"],
        alpha: "opaque",
      });
      const strict = resultOf(await client.call("index_image_artifact", { path: f.path }));
      expect(strict.isError).toBe(true);
      expect(strict.content[0].text).toContain("unsupported_png_profile");
      const cropped = resultOf(await client.call("crop_image_artifact", {
        artifactId: response.structuredContent.artifactId,
        region: { x: 0, y: 0, width: 1, height: 1 },
      }));
      expect(cropped.structuredContent.status).toBe("cropped");
      expect(cropped.structuredContent.source.ignoredChunks).toEqual(["sRGB", "gAMA", "pHYs"]);
      const inspected = resultOf(await client.call("inspect_image_artifact", { artifactId: response.structuredContent.artifactId }));
      expect(inspected.structuredContent).toEqual(response.structuredContent);
      const cropSchema = fromJSONSchema((await client.listTools()).find((tool) => tool.name === "crop_image_artifact").outputSchema);
      const original = resultOf(await client.call("crop_image_artifact", { artifactId: response.structuredContent.artifactId, region: { x: 0, y: 0, width: 1537, height: 2 } }));
      const rejected = resultOf(await client.call("crop_image_artifact", { artifactId: response.structuredContent.artifactId, region: { x: 0, y: 0, width: 1537, height: 1 } }));
      expect(original.structuredContent.status).toBe("original");
      expect(rejected.structuredContent.status).toBe("rejected");
      for (const result of [cropped, original, rejected]) {
        expect(result.structuredContent.source).toEqual(response.structuredContent);
        expect(cropSchema.safeParse(result.structuredContent).success).toBe(true);
        expect(cropSchema.safeParse({ ...result.structuredContent, source: { ...result.structuredContent.source, alpha: undefined } }).success).toBe(false);
      }
      const strictDefault = resultOf(await client.call("index_image_artifact", { path: f.path }));
      const strictExplicit = resultOf(await client.call("index_image_artifact", { path: f.path, profile: "strict" }));
      expect(strictDefault).toEqual(strictExplicit);
    });
  });

  it("keeps omitted and explicit strict identity equal for plain PNG", async () => {
    const f = await fixture(makePng(2, 2, 3));
    await withClient(f.root, async (client) => {
      const omitted = resultOf(await client.call("index_image_artifact", { path: f.path })).structuredContent;
      const explicit = resultOf(await client.call("index_image_artifact", { path: f.path, profile: "strict" })).structuredContent;
      expect(explicit).toEqual(omitted);
    });
  });

  it.each([null, 1, "relaxed"])("rejects invalid profile input %p", async (profile) => {
    const f = await fixture(makePng(1, 1, 3));
    await withClient(f.root, async (client) => {
      const response = await client.call("index_image_artifact", { path: f.path, profile });
      expect(response.error ?? response.result?.isError).toBeTruthy();
    });
  });

  it.each([
    ["RGB PNG", makePng(4, 3, 3), "source.png"],
    ["JPEG", undefined, "source.jpg"],
  ])("crops a %s and returns image bytes plus schema-valid provenance", async (_label, bytes, name) => {
    const sourceBytes = bytes ?? await readFile("tests/fixtures/jpeg/checkedin-odd-17x9.jpg");
    const f = await fixture(sourceBytes, name);
    await withClient(f.root, async (client) => {
      const indexed = resultOf(await client.call("index_image_artifact", { path: f.path })).structuredContent;
      const before = await readFile(f.path);
      const response = resultOf(await client.call("crop_image_artifact", { artifactId: indexed.artifactId, region: { x: 1, y: 1, width: 2, height: 1 } }));
      expect(response.isError).not.toBe(true);
      const structured = response.structuredContent;
      expect(structured.status).toBe("cropped");
      expect(structured.source).toEqual(indexed);
      expect(structured.region).toEqual({ x: 1, y: 1, width: 2, height: 1 });
      expect(structured.output).toMatchObject({ width: 2, height: 1, format: "jpeg", mimeType: "image/jpeg", quality: 75, encoder: { name: "jpeg-js", version: "0.4.4" } });
      expect(structured.output.image).toBeUndefined();
      const image = response.content.find((item: any) => item.type === "image");
      expect(image).toMatchObject({ mimeType: "image/jpeg" });
      const encoded = Buffer.from(image.data, "base64");
      expect(structured.output.byteLength).toBe(encoded.length);
      expect(structured.output.sha256).toBe(createHash("sha256").update(encoded).digest("hex"));
      expect(validateJpeg(encoded)).toMatchObject({ width: 2, height: 1, channels: 3, format: "jpeg", mimeType: "image/jpeg", validationProfile: "jpeg-ycbcr8-baseline-444-v1" });
      expect(fromJSONSchema((await client.listTools()).find((tool) => tool.name === "crop_image_artifact").outputSchema).safeParse(structured).success).toBe(true);
      expect(await readFile(f.path)).toEqual(before);
    });
  });

  it("returns original full-frame PNG and RGBA artifacts without output or image content", async () => {
    for (const [bytes, name, width, height] of [[makePng(2, 2, 3), "rgb.png", 2, 2], [makePng(2, 2, 4), "rgba.png", 2, 2], [makePng(1537, 2, 3), "large-rgb.png", 1537, 2], [makePng(1537, 2, 4), "large-rgba.png", 1537, 2]] as const) {
      const f = await fixture(bytes, name);
      await withClient(f.root, async (client) => {
        const indexed = resultOf(await client.call("index_image_artifact", { path: f.path })).structuredContent;
        const result = resultOf(await client.call("crop_image_artifact", { artifactId: indexed.artifactId, region: { x: 0, y: 0, width, height } }));
        expect(result.isError).not.toBe(true); expect(result.structuredContent.status).toBe("original");
        expect(result.structuredContent.source).toEqual(indexed); expect(result.structuredContent.output).toBeUndefined();
        expect(result.content).toHaveLength(1); expect(result.content[0].type).toBe("text");
        const crop = (await client.listTools()).find((tool) => tool.name === "crop_image_artifact");
        expect(fromJSONSchema(crop.outputSchema).safeParse(result.structuredContent).success).toBe(true);
      });
    }
  });

  it.each([3, 4] as const)("rejects oversized %i-channel crops with a schema-valid structured resize_required result", async (channels) => {
    const f = await fixture(makePng(1537, 2, channels));
    await withClient(f.root, async (client) => {
      const indexed = resultOf(await client.call("index_image_artifact", { path: f.path })).structuredContent;
      const result = resultOf(await client.call("crop_image_artifact", { artifactId: indexed.artifactId, region: { x: 0, y: 0, width: 1537, height: 1 } }));
      expect(result.isError).toBe(true); expect(result.content).toHaveLength(1); expect(result.content[0].type).toBe("text");
      expect(result.structuredContent).toMatchObject({ status: "rejected", code: "resize_required", fullFrame: false, source: indexed });
      const crop = (await client.listTools()).find((tool) => tool.name === "crop_image_artifact");
      expect(fromJSONSchema(crop.outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });
  });

  it("returns text-only sanitized errors and preserves source identity", async () => {
    const f = await fixture(makePng(2, 2, 3));
    await withClient(f.root, async (client) => {
      const indexed = resultOf(await client.call("index_image_artifact", { path: f.path })).structuredContent;
      for (const [region, code] of [
        [{ x: 0, y: 0, width: 0, height: 1 }, "region_empty"],
        [{ x: 1, y: 1, width: 2, height: 1 }, "region_out_of_bounds"],
      ] as const) expectTextOnlyError(resultOf(await client.call("crop_image_artifact", { artifactId: indexed.artifactId, region })), code);
      expectTextOnlyError(resultOf(await client.call("crop_image_artifact", { artifactId: "missing", region: { x: 0, y: 0, width: 1, height: 1 } })), "artifact_not_indexed");
      await writeFile(f.path, Buffer.from("changed"));
      expectTextOnlyError(resultOf(await client.call("crop_image_artifact", { artifactId: indexed.artifactId, region: { x: 0, y: 0, width: 1, height: 1 } })), "source_changed");
    });
    const rgba = await fixture(makePng(2, 2, 4));
    await withClient(rgba.root, async (client) => {
      const indexed = resultOf(await client.call("index_image_artifact", { path: rgba.path })).structuredContent;
      expectTextOnlyError(resultOf(await client.call("crop_image_artifact", { artifactId: indexed.artifactId, region: { x: 0, y: 0, width: 1, height: 1 } })), "alpha_unsupported");
    });
  });

  it("rejects fractional, unsafe, and unknown arguments at the MCP boundary", async () => {
    const f = await fixture(makePng(2, 2, 3));
    await withClient(f.root, async (client) => {
      const indexed = resultOf(await client.call("index_image_artifact", { path: f.path })).structuredContent;
      for (const args of [
        { artifactId: indexed.artifactId, region: { x: 0.5, y: 0, width: 1, height: 1 } },
        { artifactId: indexed.artifactId, region: { x: 2 ** 53, y: 0, width: 1, height: 1 } },
        { artifactId: indexed.artifactId, region: { x: 0, y: 0, width: 1, height: 1 }, extra: true },
        { artifactId: indexed.artifactId, region: { x: 0, y: 0, width: 1, height: 1, extra: true } },
      ]) {
        const response = await client.call("crop_image_artifact", args);
        expect(response.error || response.result?.isError).toBeTruthy();
        expect(JSON.stringify(response)).toMatch(/Input validation error/i);
        expect(JSON.stringify(response)).not.toMatch(/invalid_region|region_out_of_bounds/);
      }
    });
  });

  it("does not create or modify files while indexing and cropping", async () => {
    const f = await fixture(makePng(4, 3, 3));
    await withClient(f.root, async (client) => {
      const beforeBytes = await readFile(f.path); const beforeFiles = await readdir(f.root);
      const indexed = resultOf(await client.call("index_image_artifact", { path: f.path })).structuredContent;
      resultOf(await client.call("crop_image_artifact", { artifactId: indexed.artifactId, region: { x: 1, y: 1, width: 2, height: 1 } }));
      expect(await readFile(f.path)).toEqual(beforeBytes); expect(await readdir(f.root)).toEqual(beforeFiles);
    });
  });
});

describe('MCP image path redaction', () => {

  const redact = async (value: unknown, paths: string[]) => {
    const { realpath } = await import('node:fs/promises');
    const canonicalPaths = await Promise.all(paths.map(async (path) => {
      try { return await realpath(path); } catch { return path; }
    }));
    const json = JSON.stringify(value);
    for (const path of [...paths, ...canonicalPaths]) {
      expect(json).not.toContain(path);
      expect(json).not.toContain(JSON.stringify(path).slice(1, -1));
    }
  };
  const linkDir = async (ctx: import('vitest').TestContext, target: string, link: string) => {
    const { symlink } = await import('node:fs/promises');
    try { await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(code ?? '')) {
        console.log('directory-link capability unavailable: ' + code);
        ctx.skip();
      }
      throw error;
    }
  };

  it('redacts outside existing and missing image paths identically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'image-root-')); roots.push(root);
    const outside = await fixture(makePng(2, 2, 3));
    const missing = join(outside.root, 'missing.png');
    await withClient(root, async (client) => {
      const a = resultOf(await client.call('index_image_artifact', { path: outside.path }));
      const b = resultOf(await client.call('index_image_artifact', { path: missing }));
      expectTextOnlyError(a, 'path_denied'); expectTextOnlyError(b, 'path_denied');
      expect(a.content[0].text).toBe(b.content[0].text);
      await redact(a, [outside.path, outside.root, root]); await redact(b, [missing, outside.root, root]);
    });
  });

  it('rejects image directory-link traversal', async (ctx) => {
    const root = await mkdtemp(join(tmpdir(), 'image-root-')); roots.push(root);
    const outside = await fixture(makePng(2, 2, 3));
    const link = join(root, 'linked');
    await linkDir(ctx, outside.root, link);
    await withClient(root, async (client) => {
      for (const path of [join(link, 'source.png'), join(link, 'missing.png')]) {
        const result = resultOf(await client.call('index_image_artifact', { path }));
        expectTextOnlyError(result, 'path_denied');
        await redact(result, [path, link, outside.root, outside.path, root]);
      }
    });
  });

  it('rejects an image link to a missing outside target directory', async (ctx) => {
    const root = await mkdtemp(join(tmpdir(), 'image-root-')); roots.push(root);
    const outside = await mkdtemp(join(tmpdir(), 'image-outside-')); roots.push(outside);
    const target = join(outside, 'missing-target');
    const link = join(root, 'linked');
    await linkDir(ctx, target, link);
    await withClient(root, async (client) => {
      const path = join(link, 'source.png');
      const result = resultOf(await client.call('index_image_artifact', { path }));
      expectTextOnlyError(result, 'path_denied');
      await redact(result, [path, link, target, outside, root]);
    });
  });

  it('redacts deleted in-root sources from inspect and crop errors', async () => {
    const { root, path } = await fixture(makePng(2, 2, 3));
    await withClient(root, async (client) => {
      const indexed = resultOf(await client.call('index_image_artifact', { path }));
      expect(indexed.isError).not.toBe(true);
      expect(indexed.structuredContent?.artifactId).toBeDefined();
      const artifactId = indexed.structuredContent.artifactId;
      await rm(path);
      const inspect = resultOf(await client.call('inspect_image_artifact', { artifactId }));
      const crop = resultOf(await client.call('crop_image_artifact', { artifactId, region: { x: 0, y: 0, width: 1, height: 1 } }));
      expectTextOnlyError(inspect, 'source_missing_or_unreadable');
      expectTextOnlyError(crop, 'source_missing_or_unreadable');
      await redact(inspect, [path, root]); await redact(crop, [path, root]);
    });
  });
});
