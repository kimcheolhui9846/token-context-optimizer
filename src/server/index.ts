#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
  artifactLabel,
  defaultArtifactStore,
  indexArtifact,
  queryArtifact,
  summarizeArtifact,
} from "../core/artifacts.js";
import { classifyContext } from "../core/policy.js";
import { estimateContext } from "../core/token-estimator.js";
import {
  defaultImageArtifactStore,
  indexImageArtifact,
  inspectImageArtifact,
} from "../core/image-artifacts.js";
import { cropImageArtifact } from "../core/image-crop.js";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "token-context-optimizer", version: "0.1.0" },
    {
      instructions:
        "Use for safe token-efficient context handling. Preserve exact data and fail open to source content.",
    },
  );

  server.registerTool(
    "estimate_context",
    {
      description:
        "Estimate text tokens with profile metadata. Estimates are not billing usage.",
      inputSchema: z.object({
        text: z.string(),
        maxTokens: z.number().int().positive().optional(),
      }),
      outputSchema: z.object({
        estimatedTokens: z.number().int(),
        maxTokens: z.number().int().nullable(),
        fitsBudget: z.boolean(),
        profileVersion: z.string(),
        confidence: z.enum(["low", "medium", "high"]),
        warnings: z.array(z.string()),
      }),
    },
    async ({ text, maxTokens }) => {
      const output = estimateContext({ text, maxTokens });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "classify_context",
    {
      description:
        "Classify context as exact, semantic, or visual before any compression.",
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({
        mode: z.enum(["exact", "semantic", "visual", "unknown"]),
        reasons: z.array(z.string()),
        warnings: z.array(z.string()),
      }),
    },
    async ({ text }) => {
      const output = classifyContext(text);
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "index_artifact",
    {
      description:
        "Index a local UTF-8 text artifact by SHA-256 and line source map.",
      inputSchema: z.object({ path: z.string().min(1) }),
      outputSchema: z.object({
        artifactId: z.string(),
        path: z.string(),
        sha256: z.string(),
        byteLength: z.number().int(),
        lineCount: z.number().int(),
        label: z.string(),
      }),
    },
    async ({ path }) => {
      const artifact = await indexArtifact({
        path,
        store: defaultArtifactStore,
        allowedRoots: getAllowedRoots(),
      });
      const output = {
        artifactId: artifact.artifactId,
        path: artifact.path,
        sha256: artifact.sha256,
        byteLength: artifact.byteLength,
        lineCount: artifact.lineCount,
        label: artifactLabel(artifact),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "query_artifact",
    {
      description:
        "Return bounded source excerpts for an indexed artifact with line evidence. By default, include up to five excerpts around positive highest-score ties in file order; maxExcerpts can select 1-20 excerpts. Shared excerpt text counts once toward the token budget, and omitted matches are reported in moreMatches.",
      inputSchema: z.object({
        artifactId: z.string(),
        query: z.string(),
        maxTokens: z.number().int().positive().max(2000),
        contextLines: z.number().int().min(0).max(10).optional(),
        maxExcerpts: z.number().int().min(1).max(20).optional(),
      }),
    },
    async ({ artifactId, query, maxTokens, contextLines, maxExcerpts }) => {
      const output = queryArtifact({
        artifactId,
        query,
        maxTokens,
        contextLines,
        maxExcerpts,
        store: defaultArtifactStore,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "summarize_artifact",
    {
      description:
        "Create a bounded extractive summary only when exact-content policy allows it.",
      inputSchema: z.object({
        artifactId: z.string(),
        maxTokens: z.number().int().positive().max(2000),
      }),
    },
    async ({ artifactId, maxTokens }) => {
      const output = summarizeArtifact({
        artifactId,
        maxTokens,
        store: defaultArtifactStore,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  const imageOutputSchema = z.union([z.object({
    artifactId: z.string(), path: z.string(), sha256: z.string(), byteLength: z.number().int(),
    format: z.literal("png"), mimeType: z.literal("image/png"), width: z.number().int(),
    height: z.number().int(), channels: z.union([z.literal(3), z.literal(4)]), bitDepth: z.literal(8),
    validationProfile: z.literal("png-rgb8-static-v1"),
  }), z.object({
    artifactId: z.string(), path: z.string(), sha256: z.string(), byteLength: z.number().int(),
    format: z.literal("png"), mimeType: z.literal("image/png"), width: z.number().int(),
    height: z.number().int(), channels: z.union([z.literal(3), z.literal(4)]), bitDepth: z.literal(8),
    validationProfile: z.literal("png-rgb8-tolerant-v1"),
    ignoredChunks: z.array(z.string()), alpha: z.enum(["none", "opaque", "present"]),
  }), z.object({
    artifactId: z.string(), path: z.string(), sha256: z.string(), byteLength: z.number().int(),
    format: z.literal("jpeg"), mimeType: z.literal("image/jpeg"), width: z.number().int(),
    height: z.number().int(), channels: z.literal(3), bitDepth: z.literal(8),
    validationProfile: z.literal("jpeg-ycbcr8-baseline-444-v1"),
  })]);

  server.registerTool(
    "index_image_artifact",
    {
      description: "Validate and index a restricted static PNG or baseline 4:4:4 JPEG without retaining pixels. PNG validation defaults to strict; use profile tolerant to accept bounded ancillary chunks.",
      inputSchema: z.object({ path: z.string().min(1), profile: z.enum(["strict", "tolerant"]).optional() }),
      outputSchema: imageOutputSchema,
    },
    async ({ path, profile }) => {
      const output = await indexImageArtifact({ path, profile, store: defaultImageArtifactStore, allowedRoots: getAllowedRoots() });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  server.registerTool(
    "inspect_image_artifact",
    {
      description: "Reauthorize and revalidate an indexed PNG or JPEG source by its stable image identity.",
      inputSchema: z.object({ artifactId: z.string().min(1) }),
      outputSchema: imageOutputSchema,
    },
    async ({ artifactId }) => {
      const output = await inspectImageArtifact({ artifactId, store: defaultImageArtifactStore, allowedRoots: getAllowedRoots() });
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    },
  );

  const regionSchema = z.strictObject({
    x: z.number().int(), y: z.number().int(),
    width: z.number().int(), height: z.number().int(),
  });
  const cropOutputSchema = z.union([
    z.object({ status: z.literal("original"), fullFrame: z.literal(true), source: imageOutputSchema, region: regionSchema }),
    z.object({ status: z.literal("rejected"), fullFrame: z.literal(false), code: z.literal("resize_required"), source: imageOutputSchema, region: regionSchema }),
    z.object({
      status: z.literal("cropped"), fullFrame: z.literal(false),
      source: imageOutputSchema, region: regionSchema,
      output: z.object({
        width: z.number().int(), height: z.number().int(),
        format: z.literal("jpeg"), mimeType: z.literal("image/jpeg"),
        byteLength: z.number().int(), sha256: z.string(), quality: z.literal(75),
        encoder: z.object({ name: z.literal("jpeg-js"), version: z.literal("0.4.4") }),
        validation: z.object({
          width: z.number().int(), height: z.number().int(), channels: z.literal(3),
          format: z.literal("jpeg"), mimeType: z.literal("image/jpeg"),
          validationProfile: z.literal("jpeg-ycbcr8-baseline-444-v1"),
        }),
      }),
    }),
  ]);
  server.registerTool(
    "crop_image_artifact",
    {
      description: "Crop a validated RGB PNG or JPEG image using a caller-chosen region and encode it as a quality-75 JPEG. The caller may use an overview it already has; this tool does not generate one. Full-frame regions return the original reference without encoding, including RGBA sources.",
      inputSchema: z.strictObject({ artifactId: z.string().min(1), region: regionSchema }),
      outputSchema: cropOutputSchema,
    },
    async ({ artifactId, region }) => {
      const result = await cropImageArtifact({ artifactId, region, store: defaultImageArtifactStore, allowedRoots: getAllowedRoots() });
      if (result.status === "rejected") return { isError: true, content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      if (result.status === "original") return { isError: false, content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      const { image, ...output } = result.output;
      const structured = { ...result, output };
      return { isError: false, content: [{ type: "text", text: JSON.stringify(structured) }, { type: "image", data: image, mimeType: "image/jpeg" }], structuredContent: structured };
    },
  );

  return server;
}

const handle = serveStdio(createServer);

const exit = async () => {
  await handle.close();
  process.exit(0);
};

process.on("SIGINT", exit);
process.on("SIGTERM", exit);

function getAllowedRoots(): string[] {
  return (process.env.TCO_ALLOWED_ROOTS ?? "")
    .split(";")
    .map((root) => root.trim())
    .filter(Boolean);
}
