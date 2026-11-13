// Fake stdio MCP server used only by tests/verify-installed.test.ts.
// The test copies this file over an installed bundle and replaces the CONFIG
// literal below. It answers the calls made by scripts/verify-installed-plugin.mjs
// and can be told to misbehave in one place at a time.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { delimiter, isAbsolute, relative } from "node:path";

const CONFIG = /*CONFIG*/ {} /*END*/;

const REQUIRED = [
  "estimate_context",
  "classify_context",
  "index_artifact",
  "query_artifact",
  "summarize_artifact",
  "index_image_artifact",
  "inspect_image_artifact",
  "crop_image_artifact",
  "overview_image_artifact",
];

if (CONFIG.pidFile) {
  writeFileSync(CONFIG.pidFile, String(process.pid), "utf8");
}

const pluginRoot = realpathSync(process.cwd());
const allowedRoots = (process.env.TCO_ALLOWED_ROOTS ?? "")
  .split(delimiter)
  .filter(Boolean)
  .map((root) => realpathSync(root));
const images = new Map();

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim()) handle(JSON.parse(line));
  }
});

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function rpcError(id, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message } })}\n`);
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isAllowed(path) {
  return allowedRoots.some((root) => isInside(root, path));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function handle(message) {
  if (message.id === undefined) return;
  if (message.method === "initialize") {
    reply(message.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "fake-token-context-optimizer", version: "0.1.0" },
    });
    return;
  }
  if (message.method === "tools/list") {
    const tools = "tools" in CONFIG
      ? CONFIG.tools
      : [...REQUIRED, ...(CONFIG.extraTools ?? [])].map((name) => ({ name, inputSchema: { type: "object" } }));
    reply(message.id, { tools });
    return;
  }
  if (message.method !== "tools/call") {
    rpcError(message.id, "method not found");
    return;
  }
  const { name, arguments: args } = message.params;
  if (name === "index_artifact") return indexText(message.id, args.path);
  if (name === "index_image_artifact") return indexImage(message.id, args.path);
  if (name === "overview_image_artifact") return overview(message.id, args.artifactId);
  rpcError(message.id, "tool not implemented");
}

function indexText(id, path) {
  let real;
  try {
    real = realpathSync(path);
  } catch {
    reply(id, { isError: true, content: [{ type: "text", text: "read_failure" }] });
    return;
  }
  if (!isAllowed(real)) {
    reply(id, { isError: true, content: [{ type: "text", text: "File is outside allowed roots" }] });
    return;
  }
  const text = readFileSync(real, "utf8");
  const output = { path: real, lineCount: text.split(/\r?\n/u).length };
  reply(id, { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output });
}

function indexImage(id, path) {
  const mode = CONFIG.image ?? "valid";
  const deny = CONFIG.deny ?? "valid";
  if (mode === "hang") return;
  if (mode === "rpcError") return rpcError(id, "image tools unavailable");
  if (mode === "toolError") {
    reply(id, { isError: true, content: [{ type: "text", text: "decode_failed" }] });
    return;
  }
  const real = realpathSync(path);
  if (!isAllowed(real)) {
    const inPluginRoot = isInside(pluginRoot, real);
    const allowAnyway =
      (deny === "allowOutside" && !inPluginRoot) || (deny === "allowPluginRoot" && inPluginRoot);
    if (!allowAnyway) {
      const result = { isError: true, content: [{ type: "text", text: "path_denied" }] };
      if (deny === "leakPath") result._meta = { detail: real };
      if (deny === "wrongCode") result.content[0].text = "read_failure";
      if (deny === "structured") result.structuredContent = { code: "path_denied" };
      if (deny === "rpcError") return rpcError(id, "path_denied");
      reply(id, result);
      return;
    }
  }
  const bytes = readFileSync(real);
  const isPng = bytes.length >= 24 && bytes.readUInt32BE(12) === 0x49484452;
  const record = {
    artifactId: `image_${sha256(bytes).slice(0, 16)}`,
    path: mode === "badPath" ? `${real}.other` : real,
    sha256: mode === "badHash" ? "0".repeat(64) : sha256(bytes),
    byteLength: bytes.length,
    format: "png",
    mimeType: "image/png",
    width: mode === "badWidth" ? 3 : isPng ? bytes.readUInt32BE(16) : 1,
    height: isPng ? bytes.readUInt32BE(20) : 1,
    channels: 3,
    bitDepth: 8,
    validationProfile: mode === "badProfile" ? "png-rgb8-tolerant-v1" : "png-rgb8-static-v1",
  };
  images.set(record.artifactId, record);
  reply(id, { content: [{ type: "text", text: JSON.stringify(record) }], structuredContent: record });
}

function overview(id, artifactId) {
  const mode = CONFIG.overview ?? "valid";
  if (mode === "hang") return;
  if (mode === "toolError") {
    reply(id, { isError: true, content: [{ type: "text", text: "output_validation_failed" }] });
    return;
  }
  const source = images.get(artifactId);
  if (!source) {
    reply(id, { isError: true, content: [{ type: "text", text: "unknown_artifact_id" }] });
    return;
  }
  const jpeg = mode === "notJpeg" ? Buffer.from([0x89, 0x50, 0x4e, 0x47]) : Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const output = {
    width: 2,
    height: 2,
    format: "jpeg",
    mimeType: "image/jpeg",
    byteLength: jpeg.length,
    sha256: mode === "badHash" ? "0".repeat(64) : sha256(jpeg),
    quality: 75,
    encoder: { name: "jpeg-js", version: "0.4.4" },
    resample: "area-average-v1",
    validation: {
      width: 2,
      height: 2,
      channels: 3,
      format: "jpeg",
      mimeType: "image/jpeg",
      validationProfile: "jpeg-ycbcr8-baseline-444-v1",
    },
  };
  const structured = {
    source: mode === "badSource" ? { ...source, sha256: "1".repeat(64) } : source,
    output,
  };
  const content = [{ type: "text", text: JSON.stringify(structured) }];
  if (mode !== "noImage") {
    content.push({ type: "image", data: jpeg.toString("base64"), mimeType: "image/jpeg" });
  }
  reply(id, { isError: false, content, structuredContent: structured });
}
