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
        "Return bounded source excerpts for an indexed artifact with line evidence.",
      inputSchema: z.object({
        artifactId: z.string(),
        query: z.string(),
        maxTokens: z.number().int().positive().max(2000),
        contextLines: z.number().int().min(0).max(10).optional(),
      }),
    },
    async ({ artifactId, query, maxTokens, contextLines }) => {
      const output = queryArtifact({
        artifactId,
        query,
        maxTokens,
        contextLines,
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
