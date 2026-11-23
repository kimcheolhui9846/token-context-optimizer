// Stub stdio MCP server for research/test/mcp-view-comparison.test.mjs. It mimics the response shapes of the product
// image tools and keeps its own count of the requests and notifications it received, written to STUB_COUNT when stdin
// closes. Modes (STUB_MODE): normal, reject_index, tampered_ref, bad_overview, fail_init, jpeg_for_full,
// original_with_image, original_for_partial.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const mode = process.env.STUB_MODE || "normal";
const root = process.env.STUB_ROOT;
let requests = 0;
let notifications = 0;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const ok = (id, structured, image) => send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(structured) }, ...(image ? [{ type: "image", data: image.toString("base64"), mimeType: "image/jpeg" }] : [])], structuredContent: structured } });
const fail = (id, code) => send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: code }], isError: true } });
const jpeg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 7, g: 7, b: 7 } } }).jpeg({ quality: 75 }).toBuffer();

let source = null;
async function call(id, name, args) {
  if (name === "index_image_artifact") {
    if (mode === "reject_index") return fail(id, "unsupported_png_profile");
    if (!existsSync(args.path)) return fail(id, "source_missing_or_unreadable");
    const bytes = readFileSync(args.path);
    source = { artifactId: "image_stub", path: args.path, sha256: sha(bytes), byteLength: bytes.length, format: "png", mimeType: "image/png", width: 100, height: 80, channels: 3, bitDepth: 8, validationProfile: args.profile === "tolerant" ? "png-rgb8-tolerant-v1" : "png-rgb8-static-v1" };
    return ok(id, source);
  }
  if (name === "overview_image_artifact") {
    const [w, h] = mode === "bad_overview" ? [50, 40] : [100, 80];
    const img = await jpeg(w, h);
    return ok(id, { source, output: { width: w, height: h, format: "jpeg", mimeType: "image/jpeg", byteLength: img.length, sha256: sha(img), quality: 75 } }, img);
  }
  if (name === "crop_image_artifact") {
    const r = args.region;
    const fullReq = r.x === 0 && r.y === 0 && r.width === 100 && r.height === 80;
    if (mode === "original_for_partial" && !fullReq) return ok(id, { status: "original", fullFrame: true, source, region: r });
    if (fullReq && mode === "original_with_image") return ok(id, { status: "original", fullFrame: true, source, region: r }, await jpeg(100, 80));
    if (fullReq && mode !== "jpeg_for_full") {
      let path = source.path;
      if (mode === "tampered_ref") {
        path = join(root, "b.png");
        writeFileSync(path, Buffer.from("different bytes"));
      }
      return ok(id, { status: "original", fullFrame: true, source: { ...source, path }, region: r });
    }
    const img = await jpeg(r.width, r.height);
    return ok(id, { status: "cropped", fullFrame: false, source, region: r, output: { width: r.width, height: r.height, format: "jpeg", mimeType: "image/jpeg", byteLength: img.length, sha256: sha(img), quality: 75 } }, img);
  }
  return fail(id, `unknown tool ${name}`);
}

let buffer = "";
let chain = Promise.resolve();
process.stdin.on("data", (d) => {
  buffer += d.toString();
  let at;
  while ((at = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, at).trim();
    buffer = buffer.slice(at + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id === undefined) { notifications++; continue; }
    requests++;
    chain = chain.then(async () => {
      if (msg.method === "initialize" && mode === "fail_init") return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "init failed" } });
      if (msg.method === "initialize") return send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "stub", version: "0" } } });
      if (msg.method === "tools/list") return send({ jsonrpc: "2.0", id: msg.id, result: { tools: ["index_image_artifact", "overview_image_artifact", "crop_image_artifact"].map((name) => ({ name, inputSchema: { type: "object" } })) } });
      if (msg.method === "tools/call") return call(msg.id, msg.params.name, msg.params.arguments);
      return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } });
    });
  }
});
process.stdin.on("end", async () => {
  await chain;
  if (process.env.STUB_COUNT) writeFileSync(process.env.STUB_COUNT, JSON.stringify({ requests, notifications }));
  process.exit(0);
});
