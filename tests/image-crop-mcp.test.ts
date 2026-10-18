import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fromJSONSchema } from "zod/v4";
import { validateJpeg } from "../src/core/jpeg-validation.js";
import { CropMcpClient, type RpcResponse } from "./helpers/crop-mcp-client.js";
import { deflateSync } from "node:zlib";

const baseline = JSON.parse(await readFile("tests/fixtures/task36-base-tools.json", "utf8")) as { tools: any[] };
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
      expect(tools.map((tool) => tool.name)).toEqual([...baseline.tools.map((tool: any) => tool.name), "crop_image_artifact"]);
      for (const expected of baseline.tools) expect(tools.find((tool) => tool.name === expected.name)).toEqual(expected);
      const crop = tools.find((tool) => tool.name === "crop_image_artifact");
      expect(crop.description).toMatch(/caller.*region/i);
      expect(crop.description).toMatch(/overview/i);
      expect(crop.inputSchema.additionalProperties).toBe(false);
      expect(crop.inputSchema.required).toEqual(["artifactId", "region"]);
      expect(crop.inputSchema.properties.region.additionalProperties).toBe(false);
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
