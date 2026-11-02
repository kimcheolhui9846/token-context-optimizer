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
  const tolerantJpegFile = join(workspaceRoot, "tolerant-image.jpg");
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
  const tolerantJpegBytes = makeTolerantJpeg();
  await writeFile(tolerantJpegFile, tolerantJpegBytes);
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
  assertCropSourceSchemas(tools.result.tools);

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

  const tolerantJpegHash = createHash("sha256").update(tolerantJpegBytes).digest("hex");
  const tolerantJpegExpected = { path: tolerantJpegFile, sha256: tolerantJpegHash, byteLength: tolerantJpegBytes.length };
  send({ jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: "index_image_artifact", arguments: { path: tolerantJpegFile, profile: "tolerant" } } });
  const tolerantJpegIndex = await waitFor((message) => message.id === 17 && (message.error || message.result));
  const tolerantJpegResult = assertTextOnlyResult(tolerantJpegIndex, "Tolerant JPEG index");
  const tolerantJpegPayload = JSON.parse(tolerantJpegResult.content[0].text);
  assertTolerantJpegRecord(tolerantJpegPayload, tolerantJpegExpected);
  assertStructuredMatchesText(tolerantJpegResult, tolerantJpegPayload);

  send({ jsonrpc: "2.0", id: 18, method: "tools/call", params: { name: "inspect_image_artifact", arguments: { artifactId: tolerantJpegPayload.artifactId } } });
  const tolerantJpegInspect = assertTextOnlyResult(await waitFor((message) => message.id === 18 && (message.error || message.result)), "Tolerant JPEG inspect");
  const tolerantJpegInspectPayload = JSON.parse(tolerantJpegInspect.content[0].text);
  assertTolerantJpegRecord(tolerantJpegInspectPayload, tolerantJpegExpected);
  assertStructuredMatchesText(tolerantJpegInspect, tolerantJpegInspectPayload);
  if (JSON.stringify(tolerantJpegInspectPayload) !== JSON.stringify(tolerantJpegPayload)) {
    throw new Error(`Tolerant JPEG inspect mismatch: ${JSON.stringify(tolerantJpegInspectPayload)}`);
  }

  send({ jsonrpc: "2.0", id: 19, method: "tools/call", params: { name: "overview_image_artifact", arguments: { artifactId: tolerantJpegPayload.artifactId, maxSide: 64 } } });
  const tolerantJpegOverview = await waitFor((message) => message.id === 19 && (message.error || message.result));
  assertEncodedImageResult(tolerantJpegOverview, "Tolerant JPEG overview", tolerantJpegPayload, 32, 16);
  if (tolerantJpegOverview.result.structuredContent.output.resample !== "area-average-v1") {
    throw new Error(`Tolerant JPEG overview resample mismatch: ${JSON.stringify(tolerantJpegOverview.result.structuredContent)}`);
  }

  send({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "crop_image_artifact", arguments: { artifactId: tolerantJpegPayload.artifactId, region: { x: 8, y: 0, width: 16, height: 8 } } } });
  const tolerantJpegCrop = await waitFor((message) => message.id === 20 && (message.error || message.result));
  assertEncodedImageResult(tolerantJpegCrop, "Tolerant JPEG crop", tolerantJpegPayload, 16, 8);
  if (tolerantJpegCrop.result.structuredContent.status !== "cropped") {
    throw new Error(`Tolerant JPEG crop status mismatch: ${JSON.stringify(tolerantJpegCrop.result.structuredContent)}`);
  }
  if (createHash("sha256").update(await readFile(tolerantJpegFile)).digest("hex") !== tolerantJpegHash) {
    throw new Error("Tolerant JPEG source bytes changed during smoke");
  }

  send({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "index_image_artifact", arguments: { path: tolerantJpegFile } } });
  await expectToolError(21, "unsupported_jpeg_profile", [tolerantJpegFile, workspaceRoot]);

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
  assertImageOutputSchema(output.properties.source, "overview_image_artifact source");
}

function assertCropSourceSchemas(tools) {
  const tool = tools.find((candidate) => candidate.name === "crop_image_artifact");
  const variants = tool?.outputSchema?.anyOf ?? [];
  if (variants.length !== 3) {
    throw new Error(`Unexpected crop output schema variants: ${JSON.stringify(tool?.outputSchema)}`);
  }
  for (const variant of variants) {
    assertImageOutputSchema(variant.properties?.source ?? {}, `crop_image_artifact ${variant.properties?.status?.const} source`);
  }
}

function assertImageOutputSchema(output, name) {
  const schemas = output.anyOf ?? [output];
  if (schemas.length !== 4) {
    throw new Error(`Image output schema must expose four correlated strict PNG, tolerant PNG, strict JPEG, and tolerant JPEG variants for ${name}`);
  }
  const signatures = schemas.map((schema) => `${schema.properties?.format?.const}:${schema.properties?.mimeType?.const}:${schema.properties?.validationProfile?.const}`);
  const expectedSignatures = [
    "png:image/png:png-rgb8-static-v1",
    "png:image/png:png-rgb8-tolerant-v1",
    "jpeg:image/jpeg:jpeg-ycbcr8-baseline-444-v1",
    "jpeg:image/jpeg:jpeg-ycbcr8-tolerant-v1",
  ];
  if (JSON.stringify(signatures) !== JSON.stringify(expectedSignatures)) {
    throw new Error(`Image output schema correlated variants mismatch for ${name}: ${JSON.stringify(signatures)}`);
  }
  assertTolerantJpegSchema(schemas[3], name);
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

function assertTolerantJpegSchema(schema, name) {
  const properties = schema.properties ?? {};
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const required = ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile", "coding", "sampling", "ignoredSegments", "exifOrientation"];
  const orientation = properties.exifOrientation?.anyOf ?? [];
  const orientationInteger = orientation.find((item) => item?.type === "integer");
  if (
    schema.additionalProperties !== false ||
    !same([...(schema.required ?? [])].sort(), [...required].sort()) ||
    !same(Object.keys(properties).sort(), [...required].sort()) ||
    properties.channels?.const !== 3 ||
    properties.bitDepth?.const !== 8 ||
    !same(properties.coding?.enum, ["baseline", "extended", "progressive"]) ||
    !same(properties.sampling?.enum, ["1x1,1x1,1x1", "2x1,1x1,1x1", "1x2,1x1,1x1", "2x2,1x1,1x1"]) ||
    properties.ignoredSegments?.type !== "array" ||
    properties.ignoredSegments?.items?.type !== "string" ||
    orientation.length !== 2 ||
    orientationInteger?.minimum !== 1 ||
    orientationInteger?.maximum !== 8 ||
    !orientation.some((item) => item?.type === "null")
  ) {
    throw new Error(`Unexpected tolerant JPEG schema variant for ${name}: ${JSON.stringify(schema)}`);
  }
}

function assertTolerantJpegRecord(record, expected) {
  const keys = ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile", "coding", "sampling", "ignoredSegments", "exifOrientation"];
  if (
    JSON.stringify(Object.keys(record ?? {}).sort()) !== JSON.stringify([...keys].sort()) ||
    !record.artifactId?.startsWith("image_") ||
    record.path !== expected.path ||
    record.sha256 !== expected.sha256 ||
    record.byteLength !== expected.byteLength ||
    record.format !== "jpeg" ||
    record.mimeType !== "image/jpeg" ||
    record.width !== 32 ||
    record.height !== 16 ||
    record.channels !== 3 ||
    record.bitDepth !== 8 ||
    record.validationProfile !== "jpeg-ycbcr8-tolerant-v1" ||
    record.coding !== "baseline" ||
    record.sampling !== "2x2,1x1,1x1" ||
    JSON.stringify(record.ignoredSegments) !== '["APP1","APP2","APP13","COM","APP14"]' ||
    record.exifOrientation !== 6
  ) {
    throw new Error(`Unexpected tolerant JPEG record: ${JSON.stringify(record)}`);
  }
}

function assertTextOnlyResult(response, label) {
  const result = response.result;
  if (response.error || result?.isError || result?.content?.length !== 1 || result.content[0]?.type !== "text") {
    throw new Error(`${label} failed: ${JSON.stringify(response)}`);
  }
  return result;
}

function assertEncodedImageResult(response, label, source, width, height) {
  const result = response.result;
  if (response.error || result?.isError || result?.content?.length !== 2 || result.content[0]?.type !== "text") {
    throw new Error(`${label} failed: ${JSON.stringify(response)}`);
  }
  const payload = JSON.parse(result.content[0].text);
  assertStructuredMatchesText(result, payload);
  const image = result.content[1];
  const bytes = Buffer.from(image?.type === "image" ? image.data ?? "" : "", "base64");
  const validation = validateJpeg(bytes);
  if (
    image?.type !== "image" ||
    image.mimeType !== "image/jpeg" ||
    result.content[0].text.includes(image.data) ||
    JSON.stringify(payload.source) !== JSON.stringify(source) ||
    Object.prototype.hasOwnProperty.call(payload.output ?? {}, "image") ||
    payload.output?.width !== width ||
    payload.output?.height !== height ||
    payload.output?.format !== "jpeg" ||
    payload.output?.mimeType !== "image/jpeg" ||
    payload.output?.quality !== 75 ||
    payload.output?.byteLength !== bytes.length ||
    payload.output?.sha256 !== createHash("sha256").update(bytes).digest("hex") ||
    validation.width !== width ||
    validation.height !== height ||
    validation.validationProfile !== "jpeg-ycbcr8-baseline-444-v1"
  ) {
    throw new Error(`${label} metadata mismatch: ${JSON.stringify(payload)}`);
  }
}

// Synthetic 32x16 4:2:0 constant-128 JPEG with APP1 EXIF II orientation 6, synthetic APP2 ICC marker,
// APP13, COM and APP14 Adobe transform 1. Byte-identical to the checked-in
// tests/fixtures/jpeg-tolerant/metadata-mixed.jpg (provenance.json: parent hc-420-32x16-noapp0.jpg plus one
// insert at offset 2); rebuilt here so packaged smoke does not read test fixture paths.
function makeTolerantJpeg() {
  const hex = (text) => Buffer.from(text, "hex");
  const singleSymbolDht = (classAndId) => Buffer.from([classAndId, 1, ...new Array(15).fill(0), 0]);
  const parent = Buffer.concat([
    hex("ffd8"),
    hex("ffdb004300"), Buffer.alloc(64, 1),
    hex("ffc00011080010002003012200021100031100"),
    hex("ffc40026"), singleSymbolDht(0x00), singleSymbolDht(0x10),
    hex("ffda000c03010002000300003f00"),
    hex("000000"),
    hex("ffd9"),
  ]);
  const metadata = hex(
    "ffe1002245786966000049492a0008000000010012010300010000000600000000000000" +
    "ffe200324943435f50524f46494c4500010153594e5448455449432d4943432d4d41524b45522d4e4f542d412d50524f46494c45" +
    "ffed001950686f746f73686f7020332e300053594e544845544943" +
    "fffe002473796e74686574696320746f6c6572616e74206669787475726520636f6d6d656e74" +
    "ffee000e41646f626500640000000001",
  );
  const bytes = Buffer.concat([parent.subarray(0, 2), metadata, parent.subarray(2)]);
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  if (parent.length !== 149 || digest(parent) !== "df4975e370a2115757bcdba28e26b17f728b22f70041b34aa37b4f0e82b0d0dd") {
    throw new Error("Synthetic tolerant JPEG parent does not match recorded provenance");
  }
  if (bytes.length !== 318 || digest(bytes) !== "ee73d0517bbe3186184a57253c1645dd63b998df9d066b8cb58636acaa12335c") {
    throw new Error("Synthetic tolerant JPEG does not match recorded provenance");
  }
  return bytes;
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
