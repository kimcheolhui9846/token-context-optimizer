import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CropMcpClient, type RpcResponse } from "./helpers/crop-mcp-client.js";

const baseTools = JSON.parse(await readFile("tests/fixtures/task39-base-tools.json", "utf8")).tools as any[];
const queryDescription = "Return bounded source excerpts for an indexed artifact with line evidence. By default, include up to five excerpts around positive highest-score ties in file order; maxExcerpts can select 1-20 excerpts. Shared excerpt text counts once toward the token budget, and omitted matches are reported in moreMatches.";
const tolerantSchemaVariant = { type: "object", properties: { artifactId: { type: "string" }, path: { type: "string" }, sha256: { type: "string" }, byteLength: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 }, format: { type: "string", const: "png" }, mimeType: { type: "string", const: "image/png" }, width: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 }, height: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 }, channels: { anyOf: [{ type: "number", const: 3 }, { type: "number", const: 4 }] }, bitDepth: { type: "number", const: 8 }, validationProfile: { type: "string", const: "png-rgb8-tolerant-v1" }, ignoredChunks: { type: "array", items: { type: "string" } }, alpha: { type: "string", enum: ["none", "opaque", "present"] } }, required: ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile", "ignoredChunks", "alpha"], additionalProperties: false };
function withTolerantSchema(value: any): any { if (Array.isArray(value)) return value.map(withTolerantSchema); if (!value || typeof value !== "object") return value; const copy = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withTolerantSchema(item)])); if (Array.isArray(copy.anyOf) && copy.anyOf.some((item: any) => item?.properties?.validationProfile?.const === "png-rgb8-static-v1")) { const index = copy.anyOf.findIndex((item: any) => item?.properties?.validationProfile?.const === "png-rgb8-static-v1"); copy.anyOf.splice(index + 1, 0, tolerantSchemaVariant); } return copy; }

async function fixture(text: string): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "tco-query-mcp-"));
  const path = join(root, "artifact.txt");
  await writeFile(path, text, "utf8");
  return { root, path };
}

function resultOf(response: RpcResponse): any {
  if (response.error) throw new Error(`MCP error: ${JSON.stringify(response.error)}`);
  return response.result;
}

async function indexed(client: CropMcpClient, path: string): Promise<any> {
  return JSON.parse(resultOf(await client.call("index_artifact", { path })).content[0].text);
}

describe("query_artifact MCP contract", () => {
  it("advertises bounded optional maxExcerpts and keeps the legacy tool fields", async () => {
    const client = await CropMcpClient.start();
    try {
      const tools = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        ...baseTools.map((tool) => tool.name),
        "overview_image_artifact",
      ]);
      const query = tools.find((tool) => tool.name === "query_artifact");
      expect(query).toBeDefined();
      expect(query.inputSchema.properties).toMatchObject({
        artifactId: { type: "string" },
        query: { type: "string" },
        maxTokens: { type: "integer", exclusiveMinimum: 0, maximum: 2000 },
        contextLines: { type: "integer", minimum: 0, maximum: 10 },
        maxExcerpts: { type: "integer", minimum: 1, maximum: 20 },
      });
      expect(query.inputSchema.required).toEqual(["artifactId", "query", "maxTokens"]);
      expect(Object.prototype.hasOwnProperty.call(query, "outputSchema")).toBe(false);
      expect(query.description).toMatch(/highest-score ties/i);
      expect(query.description).toMatch(/moreMatches/i);
      expect(query.description).toMatch(/shared.*text.*budget/i);
      for (const expected of baseTools) {
        const actual = tools.find((tool) => tool.name === expected.name);
        if (expected.name === "query_artifact") {
          expect(actual).toStrictEqual({
            ...expected,
            description: queryDescription,
            inputSchema: {
              ...expected.inputSchema,
              properties: {
                ...expected.inputSchema.properties,
                maxExcerpts: { type: "integer", minimum: 1, maximum: 20 },
              },
            },
          });
        } else if (expected.name === "index_image_artifact" || expected.name === "inspect_image_artifact") {
          if (expected.name === "inspect_image_artifact") {
            expect(actual).toEqual({ ...expected, outputSchema: withTolerantSchema(expected.outputSchema) });
            continue;
          }
          expect(actual).toEqual({ ...expected, description: "Validate and index a restricted static PNG or baseline 4:4:4 JPEG without retaining pixels. PNG validation defaults to strict; use profile tolerant to accept bounded ancillary chunks.", inputSchema: { ...expected.inputSchema, properties: { ...expected.inputSchema.properties, profile: { type: "string", enum: ["strict", "tolerant"] } } }, outputSchema: withTolerantSchema(expected.outputSchema) });
        } else if (expected.name === "crop_image_artifact") {
          expect(actual).toEqual({
            ...expected,
            description:
              "Crop a validated RGB PNG, tolerant fully opaque RGBA PNG, or supported JPEG image using a caller-chosen region and encode it as a quality-75 JPEG. Use overview_image_artifact to obtain an overview before choosing a region in original-image pixels. Full-frame regions return the original reference without encoding, including RGBA sources.",
            outputSchema: withTolerantSchema(expected.outputSchema),
          });
        } else {
          expect(actual).toStrictEqual(expected);
        }
      }
    } finally {
      await client.close();
    }
  });

  it.each([0, 21, 1.5, null, "5"])("rejects invalid maxExcerpts %p at the MCP boundary", async (maxExcerpts) => {
    const f = await fixture("needle\nother\n");
    const client = await CropMcpClient.start(undefined, f.root);
    try {
      const source = await indexed(client, f.path);
      const response = await client.call("query_artifact", {
        artifactId: source.artifactId,
        query: "needle",
        maxTokens: 100,
        maxExcerpts,
      });
      expect(response.error ?? response.result?.isError).toBeTruthy();
    } finally {
      await client.close();
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("defaults to five tied excerpts and reports the omitted sixth anchor", async () => {
    const f = await fixture("needle 1\nseparator\nneedle 2\nseparator\nneedle 3\nseparator\nneedle 4\nseparator\nneedle 5\nseparator\nneedle 6\n");
    const client = await CropMcpClient.start(undefined, f.root);
    try {
      const source = await indexed(client, f.path);
      const response = resultOf(await client.call("query_artifact", { artifactId: source.artifactId, query: "needle", maxTokens: 100, contextLines: 0 }));
      expect(response.structuredContent.excerpts).toHaveLength(5);
      expect(response.structuredContent.moreMatches).toStrictEqual({ count: 1, lines: [11] });
      expect(JSON.parse(response.content[0].text)).toStrictEqual(response.structuredContent);
    } finally {
      await client.close();
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("explicit maxExcerpts controls omission metadata and permits twenty excerpts", async () => {
    const f = await fixture("needle 1\nseparator\nneedle 2\nseparator\nneedle 3\nseparator\nneedle 4\nseparator\nneedle 5\nseparator\nneedle 6\n");
    const client = await CropMcpClient.start(undefined, f.root);
    try {
      const source = await indexed(client, f.path);
      const one = resultOf(await client.call("query_artifact", { artifactId: source.artifactId, query: "needle", maxTokens: 100, contextLines: 0, maxExcerpts: 1 }));
      expect(one.structuredContent.excerpts).toHaveLength(1);
      expect(one.structuredContent.moreMatches).toStrictEqual({ count: 5, lines: [3, 5, 7, 9, 11] });
      expect(JSON.parse(one.content[0].text)).toStrictEqual(one.structuredContent);
      const twenty = resultOf(await client.call("query_artifact", { artifactId: source.artifactId, query: "needle", maxTokens: 100, contextLines: 0, maxExcerpts: 20 }));
      expect(twenty.structuredContent.excerpts).toHaveLength(6);
      expect(Object.prototype.hasOwnProperty.call(twenty.structuredContent, "moreMatches")).toBe(false);
      expect(JSON.parse(twenty.content[0].text)).toStrictEqual(twenty.structuredContent);
    } finally {
      await client.close();
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("keeps the unique-best query output compatible with the base behavior", async () => {
    const f = await fixture("before\nneedle unique\nafter\n");
    const client = await CropMcpClient.start(undefined, f.root);
    try {
      const source = await indexed(client, f.path);
      const response = resultOf(await client.call("query_artifact", {
        artifactId: source.artifactId,
        query: "needle",
        maxTokens: 400,
        contextLines: 1,
      }));
      const output = JSON.parse(response.content[0].text);
      expect(output).toStrictEqual({
        artifactId: source.artifactId,
        sha256: "1ffdc8a6bc54cb899e0e06f8cda9481a44e4e84c648bbdcfea84c002d19c89de",
        estimatedTokens: 7,
        confidence: "low",
        warnings: [],
        fallbackReason: null,
        excerpts: [{
          text: "before\nneedle unique\nafter",
          sourceMap: {
            path: f.path,
            startLine: 1,
            endLine: 3,
            startByte: 0,
            endByte: 26,
            completeSpan: true,
          },
        }],
      });
    } finally {
      await client.close();
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["missing", "query_terms_not_found", "no_query_match"],
    ["   ", "query_has_no_searchable_terms", "no_query_terms"],
  ])("keeps the %s fallback response exact", async (query, warning, fallbackReason) => {
    const f = await fixture("alpha beta\n");
    const client = await CropMcpClient.start(undefined, f.root);
    try {
      const source = await indexed(client, f.path);
      const response = resultOf(await client.call("query_artifact", { artifactId: source.artifactId, query, maxTokens: 100, contextLines: 0 }));
      expect(response.structuredContent).toStrictEqual({
        artifactId: source.artifactId,
        sha256: "87de0dca21b2429312a4b9a9150097c67d3eb2dc2167e862e1055a531b52d248",
        estimatedTokens: 0,
        confidence: "low",
        warnings: [warning],
        fallbackReason,
        excerpts: [],
      });
      expect(JSON.parse(response.content[0].text)).toStrictEqual(response.structuredContent);
    } finally {
      await client.close();
      await rm(f.root, { recursive: true, force: true });
    }
  });
});

describe('MCP path redaction', () => {

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

  it('redacts outside existing and missing paths with identical errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'mcp-outside-'));
    const existing = join(outside, 'secret.json');
    const missing = join(outside, 'missing.json');
    try {
      await writeFile(existing, '{}');
      const client = await CropMcpClient.start(undefined, root);
      try {
        const a = resultOf(await client.call('index_artifact', { path: existing }));
        const b = resultOf(await client.call('index_artifact', { path: missing }));
        expect(a.isError).toBe(true); expect(b.isError).toBe(true);
        expect(a.content[0].text).toContain('File is outside allowed roots');
        expect(a.content[0].text).toBe(b.content[0].text);
        await redact(a, [existing, outside, root]); await redact(b, [missing, outside, root]);
      } finally { await client.close(); }
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });

  it('redacts an in-root missing path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-root-'));
    const missing = join(root, 'missing.json');
    try {
      const client = await CropMcpClient.start(undefined, root);
      try {
        const result = resultOf(await client.call('index_artifact', { path: missing }));
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('File cannot be read');
        await redact(result, [missing, root]);
      } finally { await client.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('reports empty configured roots exactly', async () => {
    const client = await CropMcpClient.start(undefined, ';');
    try {
      const result = resultOf(await client.call('index_artifact', { path: 'anything.json' }));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No allowed roots are configured; set TCO_ALLOWED_ROOTS');
    } finally { await client.close(); }
  });

  it('rejects traversal through an outside directory link', async (ctx) => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'mcp-outside-'));
    const child = join(outside, 'child.json');
    const link = join(root, 'linked');
    try {
      await writeFile(child, '{}');
      await linkDir(ctx, outside, link);
      const client = await CropMcpClient.start(undefined, root);
      try {
        for (const path of [join(link, 'child.json'), join(link, 'missing.json')]) {
          const result = resultOf(await client.call('index_artifact', { path }));
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain('File is outside allowed roots');
          await redact(result, [path, link, outside, child, root]);
        }
      } finally { await client.close(); }
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });

  it('rejects a link to a missing outside target directory', async (ctx) => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'mcp-outside-'));
    const target = join(outside, 'missing-target');
    const link = join(root, 'linked');
    try {
      await linkDir(ctx, target, link);
      const client = await CropMcpClient.start(undefined, root);
      try {
        const path = join(link, 'child.json');
        const result = resultOf(await client.call('index_artifact', { path }));
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('File is outside allowed roots');
        await redact(result, [path, link, target, outside, root]);
      } finally { await client.close(); }
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
});
