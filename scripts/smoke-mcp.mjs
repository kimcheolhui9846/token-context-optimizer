import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { validateJpeg } from "../dist/src/core/jpeg-validation.js";

import { RUNTIME_FILES, childHasExited, readOption, validateCliArgs } from "./plugin-runtime.mjs";

const args = process.argv.slice(2);
validateCliArgs(args, {
  valueOptions: ["--simulate-copy-failure-after"],
  flags: ["--simulate-child-signal-exit"],
});
const simulateCopyFailureAfter = readIntegerOption(args, "--simulate-copy-failure-after");
const simulateChildSignalExit = args.includes("--simulate-child-signal-exit");

let pluginRoot = null;
let workspaceRoot = null;
let outsideRoot = null;
let child = null;
let childStdin = null;
let buffer = "";
let stderr = "";
let consumedLines = 0;
let childError = null;

try {
  pluginRoot = await mkdtemp(join(tmpdir(), "tco-installed-plugin-"));
  workspaceRoot = await mkdtemp(join(tmpdir(), "tco-workspace-"));
  await copyRuntimeFiles(pluginRoot, simulateCopyFailureAfter);
  if (simulateChildSignalExit) {
    await writeFile(
      join(pluginRoot, "bin/token-context-optimizer.mjs"),
      "process.kill(process.pid, 'SIGTERM');\n",
      "utf8",
    );
  }

  const workspaceFile = join(workspaceRoot, "artifact.txt");
  const imageFile = join(workspaceRoot, "image.png");
  const tolerantImageFile = join(workspaceRoot, "tolerant-image.png");
  const jpegFile = join(workspaceRoot, "image.jpg");
  const malformedImageFile = join(workspaceRoot, "malformed.png");
  const malformedJpegFile = join(workspaceRoot, "malformed.jpg");
  outsideRoot = await mkdtemp(join(tmpdir(), "tco-outside-"));
  const outsideImageFile = join(outsideRoot, "outside.png");
  await writeFile(
    workspaceFile,
    "Alpha context explains the planning outcome clearly.\nBeta context explains the review outcome clearly.",
    "utf8",
  );
  const imageBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgZGJmAQAAGQAL51pGpAAAAABJRU5ErkJggg==",
    "base64",
  );
  await writeFile(imageFile, imageBytes);
  await writeFile(tolerantImageFile, addAncillaryPng(makeOpaqueRgbaPng()));
  const jpegBytes = Buffer.from("/9j/4AAQSkZJRgABAgAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAJABEDAREAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAwQGCP/EACoQAAEDAwICCwEAAAAAAAAAAAIBBAUDBhEAEgchCBMXJDY3VnR1lLTT/8QAGAEAAwEBAAAAAAAAAAAAAAAABAUHAgb/xAAvEQACAQIDBAcJAAAAAAAAAAABAgMEEQAFEgYUMXMTISI2VJLSMjU3UnSys7TB/9oADAMBAAIRAxEAPwA7Vvc1qcOZR+EDAWjFvBKNov5AOtNotRBp7iqmQU1VeaCq08ZIUVF5quJqiirMw6XMah5nXe1sosGt0cUShUUt8ik6uALEjrOEt6HLtnBTxzSzTzlI7IFswOp3BWzMAYlcEqxYE3UrxVO8Jpq0tmlEy98y9wOXm9pXjbdo93dN8hkM00BufOsCqu7O0CFVyiApFJG9PLJmL0oADVSK0hu6szRxR+2TIFXqAAHZFiow4q6Seiyeiy6goVh3hw+uXSSBF2jfWWmQl9BTSvEE3AJJL2d8PfSFy/Rb/wB9VjVm3iI/M3oww3TPPExeZ/RiQ6UHmjLfKsvx0tT3Ku7qcyp/dhx0+T/DnKub/KjFdb3iqI9sP6C0DtD7mm+pm/PT4mO1veSl5CfdLjV2n2DMf//Z", "base64");
  await writeFile(jpegFile, jpegBytes);
  await writeFile(malformedImageFile, Buffer.from("bad-png"));
  await writeFile(malformedJpegFile, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await writeFile(outsideImageFile, imageBytes);

  child = spawn(process.execPath, ["./bin/token-context-optimizer.mjs"], {
    cwd: pluginRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, TCO_ALLOWED_ROOTS: workspaceRoot },
  });
  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error("MCP smoke requires piped child stdio");
  }
  childStdin = child.stdin;
  const childStdout = child.stdout;
  const childStderr = child.stderr;

  childStdout.setEncoding("utf8");
  childStderr.setEncoding("utf8");
  child.once("error", (error) => {
    childError = error;
  });
  childStdout.on("data", (chunk) => {
    buffer += chunk;
  });
  childStderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const tolerantBytes = await readFile(tolerantImageFile);
  const tolerantHash = createHash("sha256").update(tolerantBytes).digest("hex");
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "smoke-mcp", version: "0.1.0" },
    },
  });

  await waitFor((message) => message.id === 1 && message.result);

  send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  const tools = await waitFor((message) => message.id === 2 && message.result?.tools);
  const toolNames = tools.result.tools.map((tool) => tool.name);
  for (const expected of [
    "estimate_context",
    "classify_context",
    "index_artifact",
    "query_artifact",
    "summarize_artifact",
    "index_image_artifact",
    "inspect_image_artifact",
    "crop_image_artifact",
    "overview_image_artifact",
  ]) {
    if (!toolNames.includes(expected)) {
      throw new Error(`Missing MCP tool: ${expected}`);
    }
  }
  assertImageToolSchemas(tools.result.tools);
  assertOverviewToolSchema(tools.result.tools);

  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "index_artifact",
      arguments: { path: workspaceFile },
    },
  });

  const indexed = await waitFor((message) => message.id === 3 && message.result);
  const payload = JSON.parse(indexed.result.content[0].text);
  if (payload.path !== workspaceFile || payload.lineCount !== 2) {
    throw new Error(`Installed-layout index check failed: ${JSON.stringify(payload)}`);
  }

  send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: imageFile } },
  });
  const indexedImage = await waitFor((message) => message.id === 4 && message.result);
  const imagePayload = JSON.parse(indexedImage.result.content[0].text);
  const imageHash = createHash("sha256").update(imageBytes).digest("hex");
  assertImageRecord(imagePayload, { path: imageFile, sha256: imageHash, format: "png" });
  assertStructuredMatchesText(indexedImage.result, imagePayload);
  if (imagePayload.width !== 1 || imagePayload.height !== 1 || imagePayload.channels !== 4) {
    throw new Error(`Installed-layout image index check failed: ${JSON.stringify(imagePayload)}`);
  }
  send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "inspect_image_artifact", arguments: { artifactId: imagePayload.artifactId } },
  });
  const inspectedImage = await waitFor((message) => message.id === 5 && message.result);
  const inspectPayload = JSON.parse(inspectedImage.result.content[0].text);
  assertImageRecord(inspectPayload, { path: imageFile, sha256: imageHash, format: "png" });
  assertStructuredMatchesText(inspectedImage.result, inspectPayload);
  if (inspectPayload.sha256 !== imagePayload.sha256 || createHash("sha256").update(await readFile(imageFile)).digest("hex") !== imageHash) {
    throw new Error(`Installed-layout image inspect check failed: ${JSON.stringify(inspectPayload)}`);
  }

  send({
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: tolerantImageFile, profile: "tolerant" } },
  });
  const tolerantImage = await waitFor((message) => message.id === 13 && message.result);
  const tolerantPayload = JSON.parse(tolerantImage.result.content[0].text);
  assertTolerantImageRecord(tolerantPayload, { path: tolerantImageFile, sha256: tolerantHash });
  assertStructuredMatchesText(tolerantImage.result, tolerantPayload);
  if (tolerantPayload.channels !== 4 || tolerantPayload.alpha !== "opaque" || JSON.stringify(tolerantPayload.ignoredChunks) !== '["sRGB","gAMA","pHYs"]') throw new Error("Tolerant smoke metadata mismatch");
  send({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "inspect_image_artifact", arguments: { artifactId: tolerantPayload.artifactId } } });
  const tolerantInspect = await waitFor((message) => message.id === 14 && message.result);
  assertTolerantImageRecord(JSON.parse(tolerantInspect.result.content[0].text), { path: tolerantImageFile, sha256: tolerantHash });
  send({ jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "crop_image_artifact", arguments: { artifactId: tolerantPayload.artifactId, region: { x: 0, y: 0, width: 1, height: 1 } } } });
  const tolerantCrop = await waitFor((message) => message.id === 15 && message.result);
  if (tolerantCrop.result.structuredContent?.status !== "cropped" || tolerantCrop.result.structuredContent.source.validationProfile !== "png-rgb8-tolerant-v1" || !tolerantCrop.result.content.some((item) => item.type === "image")) throw new Error("Tolerant smoke crop failed");

  const jpegHash = createHash("sha256").update(jpegBytes).digest("hex");
  send({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: jpegFile } },
  });
  const indexedJpeg = await waitFor((message) => message.id === 10 && message.result);
  const jpegPayload = JSON.parse(indexedJpeg.result.content[0].text);
  assertImageRecord(jpegPayload, { path: jpegFile, sha256: jpegHash, format: "jpeg" });
  assertStructuredMatchesText(indexedJpeg.result, jpegPayload);
  if (jpegPayload.width !== 17 || jpegPayload.height !== 9 || jpegPayload.channels !== 3) {
    throw new Error(`Installed-layout JPEG index check failed: ${JSON.stringify(jpegPayload)}`);
  }
  send({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "inspect_image_artifact", arguments: { artifactId: jpegPayload.artifactId } },
  });
  const inspectedJpeg = await waitFor((message) => message.id === 11 && message.result);
  const inspectedJpegPayload = JSON.parse(inspectedJpeg.result.content[0].text);
  assertImageRecord(inspectedJpegPayload, { path: jpegFile, sha256: jpegHash, format: "jpeg" });
  assertStructuredMatchesText(inspectedJpeg.result, inspectedJpegPayload);
  if (JSON.stringify(inspectedJpegPayload) !== JSON.stringify(jpegPayload) || createHash("sha256").update(await readFile(jpegFile)).digest("hex") !== jpegHash) {
    throw new Error(`Installed-layout JPEG inspect mismatch: ${JSON.stringify(inspectedJpegPayload)}`);
  }

  send({
    jsonrpc: "2.0",
    id: 16,
    method: "tools/call",
    params: {
      name: "overview_image_artifact",
      arguments: { artifactId: tolerantPayload.artifactId, maxSide: 64 },
    },
  });
  const overviewJpeg = await waitFor((message) => message.id === 16 && message.result);
  if (overviewJpeg.result.isError || overviewJpeg.result.content?.length !== 2) {
    throw new Error(`JPEG overview failed: ${JSON.stringify(overviewJpeg.result)}`);
  }
  const overviewPayload = JSON.parse(overviewJpeg.result.content[0].text);
  const overviewImage = overviewJpeg.result.content.find((item) => item.type === "image");
  const overviewBytes = Buffer.from(overviewImage?.data ?? "", "base64");
  const overviewValidation = validateJpeg(overviewBytes);
  assertStructuredMatchesText(overviewJpeg.result, overviewPayload);
  if (
    JSON.stringify(overviewPayload.source) !== JSON.stringify(tolerantPayload) ||
    overviewPayload.output?.width !== 2 ||
    overviewPayload.output?.height !== 2 ||
    overviewPayload.output?.quality !== 75 ||
    overviewPayload.output?.resample !== "area-average-v1" ||
    overviewPayload.output?.encoder?.name !== "jpeg-js" ||
    overviewPayload.output?.encoder?.version !== "0.4.4" ||
    overviewPayload.output?.format !== "jpeg" ||
    overviewPayload.output?.mimeType !== "image/jpeg" ||
    overviewPayload.output?.validation?.validationProfile !== "jpeg-ycbcr8-baseline-444-v1" ||
    overviewImage?.mimeType !== "image/jpeg" ||
    overviewValidation.width !== 2 ||
    overviewValidation.height !== 2 ||
    overviewValidation.validationProfile !== "jpeg-ycbcr8-baseline-444-v1" ||
    overviewPayload.output?.byteLength !== overviewBytes.length ||
    overviewPayload.output?.sha256 !== createHash("sha256").update(overviewBytes).digest("hex") ||
    Object.prototype.hasOwnProperty.call(overviewPayload.output, "image")
  ) {
    throw new Error(`JPEG overview metadata mismatch: ${JSON.stringify(overviewPayload)}`);
  }

  send({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: outsideImageFile } },
  });
  await expectToolError(6, "path_denied", [outsideImageFile, outsideRoot]);

  send({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: malformedImageFile } },
  });
  await expectToolError(7, "malformed_png", [malformedImageFile, workspaceRoot]);

  send({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "inspect_image_artifact", arguments: { artifactId: "image_unknown" } },
  });
  await expectToolError(8, "unknown_artifact_id", [workspaceRoot]);

  await writeFile(imageFile, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M8AAwMBAYF6K94AAAAASUVORK5CYII=", "base64"));
  send({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "inspect_image_artifact", arguments: { artifactId: imagePayload.artifactId } },
  });
  await expectToolError(9, "source_changed", [imageFile, workspaceRoot]);

  send({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: malformedJpegFile } },
  });
  await expectToolError(12, "malformed_jpeg", [malformedJpegFile, workspaceRoot]);

  console.log("mcp smoke ok");
} finally {
  try {
    await stopChild();
  } finally {
    await Promise.all(
      [workspaceRoot, pluginRoot, outsideRoot]
        .filter((root) => root !== null)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  }
}

function assertImageToolSchemas(tools) {
  for (const name of ["index_image_artifact", "inspect_image_artifact"]) {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool?.inputSchema || !tool?.outputSchema) {
      throw new Error(`Missing schemas for MCP tool: ${name}`);
    }
    const inputField = name === "index_image_artifact" ? "path" : "artifactId";
    if (!tool.inputSchema.properties?.[inputField]) {
      throw new Error(`Image input schema missing field for ${name}: ${inputField}`);
    }
    if (!tool.inputSchema.required?.includes(inputField)) {
      throw new Error(`Image input schema missing required field for ${name}: ${inputField}`);
    }
    assertImageOutputSchema(tool.outputSchema, name);
  }
}

function assertOverviewToolSchema(tools) {
  const tool = tools.find((candidate) => candidate.name === "overview_image_artifact");
  if (!tool?.inputSchema || !tool.outputSchema) {
    throw new Error("Missing overview_image_artifact schemas");
  }
  if (
    tool.inputSchema.additionalProperties !== false ||
    JSON.stringify(tool.inputSchema.required) !== JSON.stringify(["artifactId"]) ||
    tool.inputSchema.properties?.artifactId?.type !== "string" ||
    tool.inputSchema.properties?.maxSide?.minimum !== 64 ||
    tool.inputSchema.properties?.maxSide?.maximum !== 1536
  ) {
    throw new Error(`Unexpected overview input schema: ${JSON.stringify(tool.inputSchema)}`);
  }
  const output = tool.outputSchema;
  if (output.properties?.source === undefined || output.properties?.output === undefined) {
    throw new Error(`Unexpected overview output schema: ${JSON.stringify(output)}`);
  }
  if (output.properties.output.properties?.image !== undefined) {
    throw new Error("Overview output schema must omit base64 image data");
  }
}

function assertImageOutputSchema(output, name) {
  const schemas = output.anyOf ?? [output];
  if (schemas.length !== 3) {
    throw new Error(`Image output schema must expose three correlated strict PNG, tolerant PNG, and JPEG variants for ${name}`);
  }
  const signatures = schemas.map((schema) => `${schema.properties?.format?.const}:${schema.properties?.mimeType?.const}:${schema.properties?.validationProfile?.const}`);
  for (const expected of ["png:image/png:png-rgb8-static-v1", "jpeg:image/jpeg:jpeg-ycbcr8-baseline-444-v1"]) {
    if (!signatures.includes(expected)) {
      throw new Error(`Image output schema is missing correlated variant ${expected} for ${name}: ${JSON.stringify(signatures)}`);
    }
  }
  if (!signatures.includes("png:image/png:png-rgb8-tolerant-v1")) {
    throw new Error(`Image output schema is missing tolerant PNG variant for ${name}: ${JSON.stringify(signatures)}`);
  }
  const properties = Object.assign({}, ...schemas.map((schema) => schema.properties ?? {}));
  const required = new Set(schemas.flatMap((schema) => schema.required ?? []));
  for (const field of ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile"]) {
    if (!properties[field]) {
      throw new Error(`Image output schema missing field for ${name}: ${field}`);
    }
    if (!required.has(field)) {
      throw new Error(`Image output schema missing required field for ${name}: ${field}`);
    }
  }
}

function assertImageRecord(record, expected) {
  const expectedFields = ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile"];
  for (const field of expectedFields) {
    if (!(field in record)) {
      throw new Error(`Image record missing field: ${field}`);
    }
  }
  if (
    !record.artifactId.startsWith("image_") ||
    record.path !== expected.path ||
    record.sha256 !== expected.sha256 ||
    record.byteLength <= 0 ||
    record.format !== expected.format ||
    record.mimeType !== `image/${expected.format}` ||
    record.bitDepth !== 8 ||
    record.validationProfile !== (expected.format === "png" ? "png-rgb8-static-v1" : "jpeg-ycbcr8-baseline-444-v1")
  ) {
    throw new Error(`Unexpected image record: ${JSON.stringify(record)}`);
  }
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}

function makeOpaqueRgbaPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.from([0, 10, 20, 30, 255, 40, 50, 60, 255, 0, 70, 80, 90, 255, 100, 110, 120, 255]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0))]);
}

function addAncillaryPng(bytes) {
  const offset = 33;
  return Buffer.concat([bytes.subarray(0, offset), pngChunk("sRGB", Buffer.from([0])), pngChunk("gAMA", Buffer.alloc(4)), pngChunk("pHYs", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 1])), bytes.subarray(offset)]);
}

function assertTolerantImageRecord(record, expected) {
  if (!record.artifactId?.startsWith("image_") || record.path !== expected.path || record.sha256 !== expected.sha256 || record.format !== "png" || record.mimeType !== "image/png" || record.bitDepth !== 8 || record.validationProfile !== "png-rgb8-tolerant-v1" || !Number.isInteger(record.width) || !Number.isInteger(record.height) || ![3, 4].includes(record.channels) || !Array.isArray(record.ignoredChunks) || !["none", "opaque", "present"].includes(record.alpha)) {
    throw new Error(`Unexpected tolerant PNG record: ${JSON.stringify(record)}`);
  }
}

function assertStructuredMatchesText(result, payload) {
  if (JSON.stringify(result.structuredContent) !== JSON.stringify(payload)) {
    throw new Error(`Structured content mismatch: ${JSON.stringify(result)}`);
  }
}

async function expectToolError(id, code, forbiddenSubstrings) {
  const response = await waitFor((message) => message.id === id && (message.error || message.result));
  if (response.error) {
    throw new Error(`Expected MCP tool result error for ${code}, got JSON-RPC error: ${JSON.stringify(response.error)}`);
  }
  const result = response.result;
  if (result?.isError !== true) {
    throw new Error(`Expected result.isError true for ${code}, got ${JSON.stringify(response)}`);
  }
  if (result.structuredContent !== undefined) {
    throw new Error(`Error response unexpectedly included structured content for ${code}: ${JSON.stringify(result.structuredContent)}`);
  }
  const content = result.content;
  if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text" || content[0].text !== code) {
    throw new Error(`Expected exact sanitized error content ${code}, got ${JSON.stringify(content)}`);
  }
  if (/artifactId|sha256|byteLength|validationProfile/u.test(content[0].text)) {
    throw new Error(`Error response included artifact payload fields for ${code}: ${content[0].text}`);
  }
  const text = JSON.stringify(response);
  for (const forbidden of forbiddenSubstrings) {
    if (forbidden && text.includes(forbidden)) {
      throw new Error(`Error response leaked path detail for ${code}: ${text}`);
    }
  }
}

function send(message) {
  if (!childStdin) {
    throw new Error("MCP smoke child stdin is not available");
  }
  childStdin.write(`${JSON.stringify(message)}\n`);
}

function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolveResult, reject) => {
    const interval = setInterval(() => {
      const activeChild = child;
      if (childError) {
        clearInterval(interval);
        reject(childError);
        return;
      }
      if (!activeChild || childHasExited(activeChild)) {
        clearInterval(interval);
        reject(new Error(`MCP server exited before expected response. stderr=${stderr}`));
        return;
      }
      let lines;
      try {
        const parsed = parseCompleteJsonMessages({ buffer, consumedLines });
        consumedLines = parsed.consumedLines;
        lines = parsed.messages;
      } catch (error) {
        clearInterval(interval);
        reject(error);
        return;
      }
      const found = lines.find(predicate);
      if (found) {
        clearInterval(interval);
        resolveResult(found);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for MCP response. stderr=${stderr}`));
      }
    }, 25);
  });
}

async function copyRuntimeFiles(destination, failAfter) {
  for (const [index, relativePath] of RUNTIME_FILES.entries()) {
    await mkdir(dirname(join(destination, relativePath)), { recursive: true });
    await cp(relativePath, join(destination, relativePath));
    if (failAfter !== null && index + 1 === failAfter) {
      throw new Error("Simulated copy failure after runtime file copy");
    }
  }

  const bundle = await readFile(join(destination, "bin/token-context-optimizer.mjs"), "utf8");
  if (/(?:from|import)\s+["'][^"']*(?:node_modules|dist\/src\/server)/u.test(bundle)) {
    throw new Error("Bundled server still references development-only paths");
  }
}

function parseCompleteJsonMessages(input) {
  const lines = input.buffer.split(/\r?\n/u);
  const completeLineCount = input.buffer.endsWith("\n") ? lines.length - 1 : lines.length - 1;
  const messages = [];

  for (let index = input.consumedLines; index < completeLineCount; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) {
      continue;
    }
    try {
      messages.push(JSON.parse(line));
    } catch {
      throw new Error(`Malformed MCP stdout line: ${line}`);
    }
  }

  return { messages, consumedLines: completeLineCount };
}

function stopChild() {
  const activeChild = child;
  if (!activeChild || childHasExited(activeChild)) {
    return Promise.resolve();
  }
  return terminateChild("SIGTERM", 1000).then(async (terminated) => {
    if (terminated) {
      return;
    }
    const killed = await terminateChild("SIGKILL", 1000);
    if (!killed) {
      throw new Error("Timed out waiting for MCP server to exit after SIGKILL");
    }
  });
}

function terminateChild(signal, timeoutMs) {
  return new Promise((resolveTerminated) => {
    const activeChild = child;
    if (!activeChild || childHasExited(activeChild)) {
      resolveTerminated(true);
      return;
    }
    const timeout = setTimeout(() => {
      cleanup();
      resolveTerminated(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolveTerminated(true);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      activeChild.off("exit", onExit);
    };
    activeChild.once("exit", onExit);
    if (!activeChild.kill(signal)) {
      cleanup();
      resolveTerminated(childHasExited(activeChild));
    }
  });
}

function readIntegerOption(args, name) {
  const value = readOption(args, name);
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} requires a non-negative integer`);
  }
  return parsed;
}
