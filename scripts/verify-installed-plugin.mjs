import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { deflateSync } from "node:zlib";

import {
  BUNDLED_SERVER_ENTRYPOINT,
  MANAGED_RUNTIME_DIRECTORIES,
  PLUGIN_MCP_SERVERS_PATH,
  PLUGIN_NAME,
  PLUGIN_SKILLS_PATH,
  REQUIRED_MCP_ENV_VARS,
  REQUIRED_MCP_TOOL_NAMES,
  RUNTIME_FILES,
  assertCanonicalMcpConfig,
  assertPluginManifestContract,
  childHasExited,
  parseCompleteJsonMessages,
  parseJsonObjectRejectingDuplicateKeys,
  resolvePluginRoot,
  validateCliArgs,
} from "./plugin-runtime.mjs";

const args = process.argv.slice(2);
validateCliArgs(args, { valueOptions: ["--plugin-root"] });
const pluginRoot = await resolvePhysicalPluginRoot(
  resolvePluginRoot(args, process.env, "--plugin-root"),
);
await assertInstalledRuntime(pluginRoot);
const serverConfig = await readInstalledServerConfig(pluginRoot);
const launchConfig = await resolveInstalledLaunchConfig(pluginRoot, serverConfig);

const WORKSPACE_PREFIX = "tco-installed-workspace-";
const OUTSIDE_PREFIX = "tco-installed-outside-";
const STDERR_TAIL_CHARS = 2000;
const VERIFICATION_SCOPE =
  "functional smoke of the installed runtime: required tool names, text index, 2x2 PNG index and overview, " +
  "and path_denied for an outside-root image and a plugin-root file. It does not prove installation " +
  "authenticity, host cache activation, or exact release identity.";

const tempParent = resolve(tmpdir());
let workspaceRoot = null;
let outsideRoot = null;
let child = null;
let childStdin = null;
let buffer = "";
let stderr = "";
let consumedLines = 0;
let childError = null;

try {
  workspaceRoot = await mkdtemp(join(tempParent, WORKSPACE_PREFIX));
  const physicalWorkspaceRoot = await realpath(workspaceRoot);
  if (isEqualOrInsideRoot(pluginRoot, physicalWorkspaceRoot)) {
    throw new Error("Installed verification workspace must be outside the plugin root");
  }
  outsideRoot = await mkdtemp(join(tempParent, OUTSIDE_PREFIX));
  const physicalOutsideRoot = await realpath(outsideRoot);
  if (
    isEqualOrInsideRoot(pluginRoot, physicalOutsideRoot) ||
    isEqualOrInsideRoot(physicalWorkspaceRoot, physicalOutsideRoot)
  ) {
    throw new Error("Installed verification outside root must be outside the plugin root and workspace");
  }
  const imageBytes = createRgbPng2x2();
  const workspaceImage = join(workspaceRoot, "image.png");
  const outsideImage = join(outsideRoot, "outside.png");
  await writeFile(workspaceImage, imageBytes);
  await writeFile(outsideImage, imageBytes);
  const workspaceFile = join(workspaceRoot, "artifact.txt");
  await writeFile(
    workspaceFile,
    "Alpha context explains the planning outcome clearly.\nBeta context explains the review outcome clearly.",
    "utf8",
  );
  assertLaunchArgsAreStrings(launchConfig.args);

  child = spawn(launchConfig.command, launchConfig.args, {
    cwd: launchConfig.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: buildVerifierEnv(process.env, workspaceRoot),
    windowsHide: true,
  });
  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error("MCP verifier requires piped child stdio");
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
    stderr = `${stderr}${chunk}`.slice(-STDERR_TAIL_CHARS);
  });

  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "verify-installed-plugin", version: "0.1.0" },
    },
  });
  await waitFor((message) => message.id === 1 && message.result);

  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = await waitFor((message) => message.id === 2 && message.result);
  const requiredTools = assertRequiredTools(tools.result);

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
  const expectedWorkspaceFile = await realpath(workspaceFile);
  if (payload.path !== expectedWorkspaceFile || payload.lineCount !== 2) {
    throw new Error(`Installed plugin verification failed: ${JSON.stringify(payload)}`);
  }

  send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "index_artifact",
      arguments: { path: join(pluginRoot, ".codex-plugin", "plugin.json") },
    },
  });
  const denied = await waitFor((message) => message.id === 4 && message.result);
  const deniedText = denied.result?.content?.map((item) => item.text).join("\n") ?? "";
  if (denied.result?.isError !== true || !deniedText.includes("outside allowed roots")) {
    throw new Error("Installed plugin allowed indexing from the plugin root");
  }

  send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: workspaceImage, profile: "strict" } },
  });
  const indexedImage = await waitFor((message) => message.id === 5 && message.result);
  const imagePayload = assertIndexedImage(indexedImage.result, {
    path: await realpath(workspaceImage),
    sha256: sha256Hex(imageBytes),
    byteLength: imageBytes.length,
    format: "png",
    mimeType: "image/png",
    width: 2,
    height: 2,
    channels: 3,
    bitDepth: 8,
    validationProfile: "png-rgb8-static-v1",
  });

  send({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "overview_image_artifact", arguments: { artifactId: imagePayload.artifactId, maxSide: 64 } },
  });
  const overview = await waitFor((message) => message.id === 6 && message.result);
  assertOverview(overview.result, imagePayload);

  send({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: outsideImage } },
  });
  assertExactPathDenied(
    await waitFor((message) => message.id === 7 && message.result),
    "outside-root image",
    [outsideImage, await realpath(outsideImage), outsideRoot, physicalOutsideRoot],
  );

  const pluginRootFile = join(pluginRoot, ".codex-plugin", "plugin.json");
  send({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "index_image_artifact", arguments: { path: pluginRootFile } },
  });
  assertExactPathDenied(
    await waitFor((message) => message.id === 8 && message.result),
    "plugin-root file",
    [pluginRootFile, pluginRoot],
  );

  console.log(
    JSON.stringify({
      ok: true,
      pluginRoot,
      workspaceRoot,
      indexedPath: payload.path,
      indexedLineCount: payload.lineCount,
      deniedPluginRootIndex: true,
      requiredTools,
      imageIndexProfile: imagePayload.validationProfile,
      imageOverview: true,
      deniedOutsideRootImage: true,
      deniedPluginRootImage: true,
      scope: VERIFICATION_SCOPE,
    }),
  );
} finally {
  try {
    await stopChild();
  } finally {
    try {
      if (workspaceRoot) {
        await removeOwnedTempRoot(workspaceRoot, WORKSPACE_PREFIX);
      }
    } finally {
      if (outsideRoot) {
        await removeOwnedTempRoot(outsideRoot, OUTSIDE_PREFIX);
      }
    }
  }
}

/**
 * Inclusion-only check of a single tools/list response. Extra well-formed tools are allowed;
 * nextCursor is not followed, so required tools must appear in this one response.
 * @param {any} result
 */
function assertRequiredTools(result) {
  const tools = result?.tools;
  if (!Array.isArray(tools)) {
    throw new Error("Installed MCP tools/list did not return a tools array");
  }
  const seen = new Set();
  for (const tool of tools) {
    const name = tool && typeof tool === "object" && !Array.isArray(tool) ? tool.name : undefined;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Installed MCP server returned an invalid MCP tool name");
    }
    if (seen.has(name)) {
      const printable = /^[A-Za-z0-9_.-]{1,64}$/u.test(name) ? name : "(unprintable)";
      throw new Error(`Installed MCP server returned a duplicate MCP tool name: ${printable}`);
    }
    seen.add(name);
  }
  const missing = REQUIRED_MCP_TOOL_NAMES.filter((name) => !seen.has(name));
  if (missing.length > 0) {
    throw new Error(`Installed MCP server is missing required tools: ${missing.join(", ")}`);
  }
  return [...REQUIRED_MCP_TOOL_NAMES];
}

/**
 * @param {any} result
 * @param {Record<string, string | number>} expected
 */
function assertIndexedImage(result, expected) {
  const label = "Installed index_image_artifact";
  if (result?.isError === true) {
    throw new Error(`${label} returned an error result`);
  }
  const payload = parseTextPayload(result, label);
  for (const [field, value] of Object.entries(expected)) {
    if (payload[field] !== value) {
      throw new Error(`${label} metadata mismatch: ${field}`);
    }
  }
  if (typeof payload.artifactId !== "string" || !/^image_[0-9a-f]{16}$/u.test(payload.artifactId)) {
    throw new Error(`${label} metadata mismatch: artifactId`);
  }
  return payload;
}

/**
 * Basic wire/provenance consistency only. A 2x2 source stays 2x2 at maxSide 64, so this does
 * not exercise downscaling or pixel accuracy, and SOI/EOI plus a self-consistent hash is not a
 * full JPEG validation.
 * @param {any} result
 * @param {Record<string, unknown>} source
 */
function assertOverview(result, source) {
  const label = "Installed overview_image_artifact";
  if (result?.isError === true) {
    throw new Error(`${label} returned an error result`);
  }
  const content = result?.content;
  const image = Array.isArray(content) ? content[1] : undefined;
  if (
    !Array.isArray(content) ||
    content.length !== 2 ||
    image?.type !== "image" ||
    image.mimeType !== "image/jpeg" ||
    typeof image.data !== "string" ||
    image.data.length === 0
  ) {
    throw new Error(`${label} content mismatch`);
  }
  const bytes = Buffer.from(image.data, "base64");
  if (bytes.toString("base64") !== image.data) {
    throw new Error(`${label} content mismatch: image data is not canonical base64`);
  }
  const payload = parseTextPayload(result, label);
  if (content[0].text.includes(image.data)) {
    throw new Error(`${label} content mismatch: text repeats image data`);
  }
  const output = payload.output;
  if (!output || typeof output !== "object" || Object.prototype.hasOwnProperty.call(output, "image")) {
    throw new Error(`${label} metadata mismatch: output`);
  }
  const length = bytes.length;
  if (
    length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[length - 2] !== 0xff ||
    bytes[length - 1] !== 0xd9
  ) {
    throw new Error(`${label} metadata mismatch: jpeg markers`);
  }
  const checks = [
    ["output.width", output.width, 2],
    ["output.height", output.height, 2],
    ["output.format", output.format, "jpeg"],
    ["output.mimeType", output.mimeType, "image/jpeg"],
    ["output.byteLength", output.byteLength, length],
    ["output.sha256", output.sha256, sha256Hex(bytes)],
    ["output.validation.width", output.validation?.width, 2],
    ["output.validation.height", output.validation?.height, 2],
  ];
  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(`${label} metadata mismatch: ${field}`);
    }
  }
  if (JSON.stringify(payload.source) !== JSON.stringify(source)) {
    throw new Error(`${label} metadata mismatch: source`);
  }
}

/**
 * @param {any} result
 * @param {string} label
 */
function parseTextPayload(result, label) {
  const text = Array.isArray(result?.content) && result.content[0]?.type === "text" ? result.content[0].text : null;
  if (typeof text !== "string") {
    throw new Error(`${label} content mismatch`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${label} content mismatch: text is not JSON`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} content mismatch: text is not a JSON object`);
  }
  if (JSON.stringify(result.structuredContent) !== JSON.stringify(payload)) {
    throw new Error(`${label} content mismatch: structuredContent differs from text`);
  }
  return payload;
}

/**
 * Same contract as smoke-mcp expectToolError: isError, no structuredContent, exactly one text
 * item equal to the code, and no path detail anywhere in the response. The response body is
 * never copied into the error message.
 * @param {any} response
 * @param {string} label
 * @param {string[]} forbidden
 */
function assertExactPathDenied(response, label, forbidden) {
  const result = response.result;
  const content = result?.content;
  if (
    result?.isError !== true ||
    result.structuredContent !== undefined ||
    !Array.isArray(content) ||
    content.length !== 1 ||
    content[0]?.type !== "text" ||
    content[0].text !== "path_denied"
  ) {
    throw new Error(`Installed index_image_artifact ${label} was not denied with exact path_denied`);
  }
  const serialized = JSON.stringify(response);
  for (const value of forbidden) {
    if (!value) continue;
    const jsonEscaped = JSON.stringify(value).slice(1, -1);
    if (serialized.includes(value) || serialized.includes(jsonEscaped)) {
      throw new Error(`Installed index_image_artifact ${label} denial leaked path detail`);
    }
  }
}

function createRgbPng2x2() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  // Two rows, each with filter byte 0 and two RGB pixels.
  const pixels = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * @param {string} type
 * @param {Buffer} data
 */
function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}

/** @param {Buffer} bytes */
function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Removes a temp directory only when it is a direct child of the verifier temp parent with
 * the owned prefix, and only when it is a real directory rather than a link.
 * @param {string} path
 * @param {string} prefix
 */
async function removeOwnedTempRoot(path, prefix) {
  const resolved = resolve(path);
  const name = basename(resolved);
  if (dirname(resolved) !== tempParent || !name.startsWith(prefix) || name.length <= prefix.length) {
    throw new Error("Refusing to remove a verifier temp path outside the owned temp root");
  }
  let rootStat;
  try {
    rootStat = await lstat(resolved);
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("Refusing to remove a verifier temp path that is not a plain directory");
  }
  await rm(resolved, { recursive: true, force: true });
}

function send(message) {
  if (!childStdin) {
    throw new Error("MCP verifier child stdin is not available");
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
      const failed = lines.find((message) => message.error);
      if (failed) {
        clearInterval(interval);
        reject(new Error(`MCP error response: ${failed.error.message ?? JSON.stringify(failed.error)}`));
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

async function assertInstalledRuntime(root) {
  for (const requiredFile of RUNTIME_FILES) {
    const path = join(root, requiredFile);
    await rejectSymlinkedComponents(path);
    let fileStat;
    try {
      fileStat = await lstat(path);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new Error(`Installed plugin is missing runtime file: ${requiredFile}`);
      }
      throw new Error(`Unable to inspect installed runtime file: ${requiredFile}`, { cause: error });
    }
    if (!fileStat.isFile()) {
      throw new Error(`Installed plugin runtime file is not a regular runtime file: ${requiredFile}`);
    }
    if (fileStat.nlink > 1) {
      throw new Error(`Installed plugin runtime file is hard-linked and not safe to trust: ${requiredFile}`);
    }
    const physicalPath = await realpath(path);
    assertInsideRoot(root, physicalPath, "Installed runtime files must stay inside the plugin root");
  }
  await assertNoUnexpectedManagedRuntimeFiles(root);
}

async function readInstalledServerConfig(root) {
  const manifest = parseJsonObjectRejectingDuplicateKeys(
    await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8"),
    "Installed plugin.json",
  );
  assertPluginManifestContract(manifest, "Installed plugin manifest");
  const skillsPath = await resolveManifestPath(root, manifest.skills);
  if (skillsPath !== resolve(root, "skills")) {
    throw new Error("Installed plugin manifest skills must point to the installed skills directory");
  }
  const skillsStat = await lstat(skillsPath);
  if (!skillsStat.isDirectory()) {
    throw new Error("Installed plugin manifest skills path must be a directory");
  }
  const mcpPath = await resolveManifestPath(root, manifest.mcpServers);
  if (mcpPath !== resolve(root, ".mcp.json")) {
    throw new Error("Installed plugin manifest must point to the installed .mcp.json");
  }
  const mcpConfig = parseJsonObjectRejectingDuplicateKeys(
    await readFile(mcpPath, "utf8"),
    "Installed .mcp.json",
  );
  const server = selectPluginServerForUnsafeEnvInspection(mcpConfig);
  if (server.env !== undefined) {
    if (server.env && typeof server.env === "object" && !Array.isArray(server.env)) {
      for (const key of Object.keys(server.env)) {
        if (isNodeExecutionHook(key)) {
          throw new Error(`Node execution hook is not allowed in installed MCP env: ${key}`);
        }
      }
    }
    throw new Error("Configured MCP env is not allowed during installed verification");
  }
  if (
    !Array.isArray(server.env_vars) ||
    server.env_vars.length !== REQUIRED_MCP_ENV_VARS.length ||
    server.env_vars.some((key, index) => key !== REQUIRED_MCP_ENV_VARS[index])
  ) {
    throw new Error("Installed MCP env_vars must exactly inherit TCO_ALLOWED_ROOTS");
  }
  return assertCanonicalMcpConfig(mcpConfig, "Installed .mcp.json");
}

/**
 * @param {NodeJS.ProcessEnv} inheritedEnv
 * @param {string} allowedRoots
 * @returns {NodeJS.ProcessEnv}
 */
function buildVerifierEnv(inheritedEnv, allowedRoots) {
  const allowedInheritedKeys = [
    "ALLUSERSPROFILE",
    "APPDATA",
    "ComSpec",
    "HOME",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "Path",
    "PROCESSOR_ARCHITECTURE",
    "ProgramData",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "windir",
    "WINDIR",
  ];
  const env = /** @type {NodeJS.ProcessEnv} */ ({});
  for (const key of allowedInheritedKeys) {
    if (inheritedEnv[key] !== undefined && !isNodeExecutionHook(key)) {
      env[key] = inheritedEnv[key];
    }
  }
  env.TCO_ALLOWED_ROOTS = allowedRoots;
  return env;
}

function isNodeExecutionHook(key) {
  const normalized = key.toUpperCase();
  return (
    normalized === "NODE_OPTIONS" ||
    normalized === "NODE_PATH" ||
    normalized === "NPM_CONFIG_NODE_OPTIONS" ||
    normalized === "LD_PRELOAD" ||
    normalized === "LD_AUDIT" ||
    normalized === "LD_LIBRARY_PATH" ||
    normalized === "DYLD_INSERT_LIBRARIES" ||
    normalized === "DYLD_LIBRARY_PATH"
  );
}

async function resolveInstalledLaunchConfig(root, server) {
  if (server.command !== "node" && resolve(server.command) !== process.execPath) {
    throw new Error(`Installed MCP ${PLUGIN_NAME} server must launch node`);
  }

  const cwd = resolve(root, server.cwd ?? ".");
  assertInsideRoot(root, cwd, "Installed MCP cwd must stay inside the plugin root");
  await rejectSymlinkedComponents(cwd);

  const args = server.args ?? [];
  if (args.length === 0 || typeof args[0] !== "string") {
    throw new Error(`Installed MCP ${PLUGIN_NAME} server must launch the installed bundle`);
  }
  const entrypoint = resolve(cwd, args[0]);
  const installedBundle = resolve(root, BUNDLED_SERVER_ENTRYPOINT);
  if (entrypoint !== installedBundle) {
    throw new Error(`Installed MCP ${PLUGIN_NAME} server must launch the installed bundle`);
  }
  await rejectSymlinkedComponents(installedBundle);

  return {
    command: process.execPath,
    args,
    cwd,
  };
}

function assertLaunchArgsAreStrings(args) {
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new Error(`Installed MCP ${PLUGIN_NAME} server args must be strings`);
    }
  }
}

async function resolvePhysicalPluginRoot(root) {
  await rejectSymlinkedComponents(root);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) {
    throw new Error("Installed plugin root must be a directory");
  }
  return realpath(root);
}

async function resolveManifestPath(root, path) {
  if (!path.startsWith("./")) {
    throw new Error("Manifest component paths must start with ./");
  }
  const resolved = resolve(root, path);
  assertInsideRoot(root, resolved, "Manifest component paths must stay inside the plugin root");
  await rejectSymlinkedComponents(resolved);
  const physicalPath = await realpath(resolved);
  assertInsideRoot(root, physicalPath, "Manifest component paths must stay inside the plugin root");
  return resolved;
}

function assertInsideRoot(root, path, message) {
  const relativePath = relative(resolve(root), resolve(path));
  if (isParentRelativePath(relativePath) || isAbsolute(relativePath)) {
    throw new Error(message);
  }
}

function isEqualOrInsideRoot(root, path) {
  const relativePath = relative(resolve(root), resolve(path));
  return relativePath === "" || (!isParentRelativePath(relativePath) && !isAbsolute(relativePath));
}

function isParentRelativePath(relativePath) {
  return relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("..\\");
}

async function assertNoUnexpectedManagedRuntimeFiles(root) {
  const expectedFiles = new Set(RUNTIME_FILES);
  for (const managedDirectory of MANAGED_RUNTIME_DIRECTORIES) {
    await visitManagedRuntimeDirectory(root, managedDirectory, expectedFiles);
  }
}

async function visitManagedRuntimeDirectory(root, relativeDirectory, expectedFiles) {
  const absoluteDirectory = join(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`.replace(/\\/g, "/");
    const absolutePath = join(root, relativePath);
    if (entry.isDirectory()) {
      await visitManagedRuntimeDirectory(root, relativePath, expectedFiles);
    } else if (!expectedFiles.has(relativePath)) {
      throw new Error(`Unexpected managed runtime file: ${relativePath}`);
    } else {
      await rejectSymlinkedComponents(absolutePath);
    }
  }
}

async function rejectSymlinkedComponents(path) {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  const relativeParts = absolute
    .slice(parsed.root.length)
    .split(/[\\/]+/u)
    .filter(Boolean);

  let current = parsed.root;
  for (const part of relativeParts) {
    current = resolve(current, part);
    let currentStat;
    try {
      currentStat = await lstat(current);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (currentStat.isSymbolicLink()) {
      throw new Error(`Installed MCP path contains a symlinked component: ${current}`);
    }
  }
}

function selectPluginServerForUnsafeEnvInspection(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Installed MCP config must be a JSON object");
  }
  if (config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers)) {
    const server = config.mcpServers[PLUGIN_NAME];
    if (!server || typeof server !== "object" || Array.isArray(server)) {
      throw new Error(`Installed MCP config missing ${PLUGIN_NAME} server`);
    }
    return server;
  }
  throw new Error("Installed MCP config must contain a mcpServers object");
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

function isNotFoundError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
