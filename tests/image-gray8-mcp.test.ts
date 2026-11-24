import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { afterEach, describe, expect, it } from "vitest";
import { fromAdvertisedSchema } from "./helpers/advertised-schema.js";
import { CropMcpClient, type RpcResponse } from "./helpers/crop-mcp-client.js";
import { GRAY8_PROFILE, chunk, expectedArtifactId, graySchemaVariant, grayPattern, grayPng, rgbControlPng, sha256Hex } from "./helpers/gray8-png.js";

// Packaged-server contract for tolerant 8-bit grayscale PNG (policy §7, §9 P1-P6, N1, N6, N8, R3-R5).
// Runs bin/token-context-optimizer.mjs (or TCO_MCP_BUNDLE) through a real stdio MCP client.

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tco-gray8-mcp-")); roots.push(root); return root;
}

async function withClient<T>(root: string, fn: (client: CropMcpClient) => Promise<T>): Promise<T> {
  const client = await CropMcpClient.start(undefined, root);
  try { return await fn(client); } finally { await client.close(); }
}

function ok(response: RpcResponse): any {
  expect(response.error, JSON.stringify(response.error)).toBeUndefined();
  expect(response.result?.isError, JSON.stringify(response.result?.content)).not.toBe(true);
  return response.result;
}

function expectTextOnlyError(response: RpcResponse, code: string): void {
  expect(response.error).toBeUndefined();
  const result = response.result;
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  expect(result.content[0].text).toContain(code);
}

/** Policy §7 body criteria 1-3 on the bytes the consumer actually receives; returns those bytes for criterion 4. */
function deliveredJpeg(result: any): Buffer {
  const images = result.content.filter((item: any) => item.type === "image");
  expect(images).toHaveLength(1);
  expect(images[0].mimeType).toBe("image/jpeg");
  const bytes = Buffer.from(images[0].data, "base64");
  const output = result.structuredContent.output;
  expect(sha256Hex(bytes)).toBe(output.sha256);
  expect(bytes.length).toBe(output.byteLength);
  const decoded = jpeg.decode(bytes, { useTArray: true });
  expect([decoded.width, decoded.height]).toEqual([output.width, output.height]);
  expect(output.image).toBeUndefined();
  return bytes;
}

describe("packaged MCP server: tolerant gray8 PNG", () => {
  it("advertises the gray variant as a fifth source schema in all four image tools", async () => {
    await withClient(await workspace(), async (client) => {
      const tools = await client.listTools();
      const byName = (name: string) => tools.find((tool) => tool.name === name);
      const sources = [
        byName("index_image_artifact").outputSchema,
        byName("inspect_image_artifact").outputSchema,
        byName("overview_image_artifact").outputSchema.properties.source,
        ...byName("crop_image_artifact").outputSchema.anyOf.map((variant: any) => variant.properties.source),
      ];
      for (const source of sources) {
        expect(source.anyOf.map((variant: any) => variant.properties.validationProfile.const)).toEqual([
          "png-rgb8-static-v1", "png-rgb8-tolerant-v1", "jpeg-ycbcr8-baseline-444-v1", "jpeg-ycbcr8-tolerant-v1", GRAY8_PROFILE,
        ]);
        expect(source.anyOf[4]).toEqual(graySchemaVariant);
      }
      expect(byName("index_image_artifact").inputSchema.properties.profile).toEqual({ type: "string", enum: ["strict", "tolerant"] });
      for (const name of ["index_image_artifact", "crop_image_artifact", "overview_image_artifact"]) {
        expect(byName(name).description).toMatch(/grayscale/u);
      }
    });
  });

  it("indexes, inspects, crops and overviews gray8 with delivered bytes equal to the R=G=B control", async () => {
    const root = await workspace();
    const width = 41; const height = 29;
    const pixels = grayPattern(width, height);
    const grayBytes = grayPng(width, height, {
      pixels, filters: [4, 3, 2, 1, 0],
      beforeIdat: [chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f])), chunk("tEXt", Buffer.from("Comment\0scan", "latin1"))],
    });
    const grayPath = join(root, "gray.png"); await writeFile(grayPath, grayBytes);
    const controlPath = join(root, "control.png"); await writeFile(controlPath, rgbControlPng(width, height, pixels));
    const graySha = sha256Hex(grayBytes);
    await withClient(root, async (client) => {
      const tools = await client.listTools();
      const schemaOf = (name: string) => fromAdvertisedSchema(tools.find((tool) => tool.name === name).outputSchema);

      // N1: strict, omitted or explicit, still rejects.
      expectTextOnlyError(await client.call("index_image_artifact", { path: grayPath }), "unsupported_png_profile");
      expectTextOnlyError(await client.call("index_image_artifact", { path: grayPath, profile: "strict" }), "unsupported_png_profile");

      // P1/P2 + R3: fifth schema, exact record.
      const indexed = ok(await client.call("index_image_artifact", { path: grayPath, profile: "tolerant" }));
      const canonical = await realpath(grayPath);
      const expectedRecord = {
        artifactId: expectedArtifactId(canonical, graySha, GRAY8_PROFILE), path: canonical, sha256: graySha, byteLength: grayBytes.length,
        format: "png", mimeType: "image/png", width, height, channels: 1, bitDepth: 8,
        validationProfile: GRAY8_PROFILE, ignoredChunks: ["gAMA", "tEXt"], alpha: "none",
      };
      expect(indexed.structuredContent).toStrictEqual(expectedRecord);
      expect(JSON.parse(indexed.content[0].text)).toStrictEqual(expectedRecord);
      const indexSchema = schemaOf("index_image_artifact");
      expect(indexSchema.safeParse(indexed.structuredContent).success).toBe(true);
      for (const [field, value] of [["channels", 3], ["channels", 4], ["alpha", "opaque"], ["alpha", "present"], ["ignoredChunks", "gAMA"], ["bitDepth", 16]] as const) {
        expect(indexSchema.safeParse({ ...expectedRecord, [field]: value }).success, `${field}=${value}`).toBe(false);
      }
      for (const field of ["ignoredChunks", "alpha"]) {
        const missing: Record<string, unknown> = { ...expectedRecord }; delete missing[field];
        expect(indexSchema.safeParse(missing).success).toBe(false);
      }
      expect(indexSchema.safeParse({ ...expectedRecord, coding: "baseline" }).success).toBe(false);
      const control = ok(await client.call("index_image_artifact", { path: controlPath, profile: "tolerant" })).structuredContent;
      expect(control.validationProfile).toBe("png-rgb8-tolerant-v1");

      // P4: inspect returns the same record.
      const inspected = ok(await client.call("inspect_image_artifact", { artifactId: indexed.structuredContent.artifactId }));
      expect(inspected.structuredContent).toStrictEqual(expectedRecord);
      expect(schemaOf("inspect_image_artifact").safeParse(inspected.structuredContent).success).toBe(true);

      // P5: full frame returns the original reference and no image body; open the path and hash it.
      const full = ok(await client.call("crop_image_artifact", { artifactId: expectedRecord.artifactId, region: { x: 0, y: 0, width, height } }));
      expect(full.structuredContent).toStrictEqual({ status: "original", fullFrame: true, source: expectedRecord, region: { x: 0, y: 0, width, height } });
      expect(full.content.filter((item: any) => item.type === "image")).toHaveLength(0);
      const reopened = await readFile(full.structuredContent.source.path);
      expect(sha256Hex(reopened)).toBe(full.structuredContent.source.sha256);
      expect(sha256Hex(reopened)).toBe(graySha);
      const cropSchema = schemaOf("crop_image_artifact");
      expect(cropSchema.safeParse(full.structuredContent).success).toBe(true);

      // P6: partial crops, criteria 1-4 against the control's delivered bytes.
      for (const region of [
        { x: 0, y: 0, width: 1, height: 1 }, { x: width - 1, y: height - 1, width: 1, height: 1 },
        { x: 3, y: 2, width: 17, height: 11 }, { x: 0, y: height - 5, width, height: 5 }, { x: width - 8, y: 0, width: 8, height },
      ]) {
        const g = ok(await client.call("crop_image_artifact", { artifactId: expectedRecord.artifactId, region }));
        const c = ok(await client.call("crop_image_artifact", { artifactId: control.artifactId, region }));
        expect(g.structuredContent).toMatchObject({ status: "cropped", fullFrame: false, source: expectedRecord, region });
        expect(cropSchema.safeParse(g.structuredContent).success).toBe(true);
        const grayJpeg = deliveredJpeg(g); const controlJpeg = deliveredJpeg(c);
        expect(grayJpeg.equals(controlJpeg), JSON.stringify(region)).toBe(true);
        expect(grayJpeg.length).toBe(controlJpeg.length);
      }

      // P6: overview at default, 64, 1536 (above source size).
      const overviewSchema = schemaOf("overview_image_artifact");
      for (const maxSide of [undefined, 64, 1536]) {
        const args = maxSide === undefined ? {} : { maxSide };
        const g = ok(await client.call("overview_image_artifact", { artifactId: expectedRecord.artifactId, ...args }));
        const c = ok(await client.call("overview_image_artifact", { artifactId: control.artifactId, ...args }));
        expect(g.structuredContent.source).toStrictEqual(expectedRecord);
        expect(overviewSchema.safeParse(g.structuredContent).success).toBe(true);
        expect(deliveredJpeg(g).equals(deliveredJpeg(c)), `maxSide=${maxSide}`).toBe(true);
      }

      // N6: replacing the source with the control bytes gives source_changed on every path.
      await writeFile(grayPath, rgbControlPng(width, height, pixels));
      expectTextOnlyError(await client.call("inspect_image_artifact", { artifactId: expectedRecord.artifactId }), "source_changed");
      expectTextOnlyError(await client.call("crop_image_artifact", { artifactId: expectedRecord.artifactId, region: { x: 1, y: 1, width: 2, height: 2 } }), "source_changed");
      expectTextOnlyError(await client.call("overview_image_artifact", { artifactId: expectedRecord.artifactId }), "source_changed");
      await writeFile(grayPath, grayBytes);
      expect(ok(await client.call("inspect_image_artifact", { artifactId: expectedRecord.artifactId })).structuredContent).toStrictEqual(expectedRecord);
    });
  }, 60_000);

  it("reduces a large gray8 overview identically to the control and rejects a 1537 crop with resize_required", async () => {
    const root = await workspace();
    const width = 1700; const height = 300;
    const pixels = grayPattern(width, height);
    const grayPath = join(root, "wide.png"); await writeFile(grayPath, grayPng(width, height, { pixels, filters: 2 }));
    const controlPath = join(root, "wide-control.png"); await writeFile(controlPath, rgbControlPng(width, height, pixels));
    await withClient(root, async (client) => {
      const gray = ok(await client.call("index_image_artifact", { path: grayPath, profile: "tolerant" })).structuredContent;
      const control = ok(await client.call("index_image_artifact", { path: controlPath, profile: "tolerant" })).structuredContent;
      for (const maxSide of [undefined, 64, 1536]) {
        const args = maxSide === undefined ? {} : { maxSide };
        const g = ok(await client.call("overview_image_artifact", { artifactId: gray.artifactId, ...args }));
        const c = ok(await client.call("overview_image_artifact", { artifactId: control.artifactId, ...args }));
        expect(g.structuredContent.output.width).toBe(maxSide ?? 512);
        expect(deliveredJpeg(g).equals(deliveredJpeg(c))).toBe(true);
      }
      const rejected = await client.call("crop_image_artifact", { artifactId: gray.artifactId, region: { x: 0, y: 0, width: 1537, height: 2 } });
      expect(rejected.result.isError).toBe(true);
      expect(rejected.result.structuredContent).toStrictEqual({ status: "rejected", fullFrame: false, code: "resize_required", source: gray, region: { x: 0, y: 0, width: 1537, height: 2 } });
      const g = ok(await client.call("crop_image_artifact", { artifactId: gray.artifactId, region: { x: 0, y: 0, width: 1536, height: 2 } }));
      const c = ok(await client.call("crop_image_artifact", { artifactId: control.artifactId, region: { x: 0, y: 0, width: 1536, height: 2 } }));
      expect(deliveredJpeg(g).equals(deliveredJpeg(c))).toBe(true);
    });
  }, 60_000);
});
