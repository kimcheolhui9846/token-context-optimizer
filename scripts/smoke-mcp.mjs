import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
  const malformedImageFile = join(workspaceRoot, "malformed.png");
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
  await writeFile(malformedImageFile, Buffer.from("bad-png"));
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
  ]) {
    if (!toolNames.includes(expected)) {
      throw new Error(`Missing MCP tool: ${expected}`);
    }
  }
  assertImageToolSchemas(tools.result.tools);

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
  assertImageRecord(imagePayload, { path: imageFile, sha256: imageHash });
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
  assertImageRecord(inspectPayload, { path: imageFile, sha256: imageHash });
  assertStructuredMatchesText(inspectedImage.result, inspectPayload);
  if (inspectPayload.sha256 !== imagePayload.sha256 || createHash("sha256").update(await readFile(imageFile)).digest("hex") !== imageHash) {
    throw new Error(`Installed-layout image inspect check failed: ${JSON.stringify(inspectPayload)}`);
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

function assertImageOutputSchema(output, name) {
  for (const field of ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile"]) {
    if (!output.properties?.[field]) {
      throw new Error(`Image output schema missing field for ${name}: ${field}`);
    }
    if (!output.required?.includes(field)) {
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
    record.format !== "png" ||
    record.mimeType !== "image/png" ||
    record.bitDepth !== 8 ||
    record.validationProfile !== "png-rgb8-static-v1"
  ) {
    throw new Error(`Unexpected image record: ${JSON.stringify(record)}`);
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
