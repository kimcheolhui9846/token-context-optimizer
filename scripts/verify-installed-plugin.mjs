import { spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, parse, relative, resolve } from "node:path";

import {
  BUNDLED_SERVER_ENTRYPOINT,
  MANAGED_RUNTIME_DIRECTORIES,
  PLUGIN_MCP_SERVERS_PATH,
  PLUGIN_NAME,
  PLUGIN_SKILLS_PATH,
  REQUIRED_MCP_ENV_VARS,
  RUNTIME_FILES,
  assertCanonicalMcpConfig,
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

let workspaceRoot = null;
let child = null;
let childStdin = null;
let buffer = "";
let stderr = "";
let consumedLines = 0;
let childError = null;

try {
  workspaceRoot = await mkdtemp(join(tmpdir(), "tco-installed-workspace-"));
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
    stderr += chunk;
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
  const tools = await waitFor((message) => message.id === 2 && message.result?.tools);
  const toolNames = tools.result.tools.map((tool) => tool.name);
  if (!toolNames.includes("index_artifact")) {
    throw new Error("Installed MCP server did not expose index_artifact");
  }

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

  console.log(
    JSON.stringify({
      ok: true,
      pluginRoot,
      workspaceRoot,
      indexedPath: payload.path,
      indexedLineCount: payload.lineCount,
      deniedPluginRootIndex: true,
    }),
  );
} finally {
  try {
    await stopChild();
  } finally {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }
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
      if (!activeChild || activeChild.exitCode !== null) {
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
  const manifest = JSON.parse(await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8"));
  if (manifest.name !== PLUGIN_NAME) {
    throw new Error(`Installed plugin manifest name must be ${PLUGIN_NAME}`);
  }
  if (manifest.hooks !== undefined) {
    throw new Error("Installed plugin manifest must not declare hooks");
  }
  if (manifest.skills !== PLUGIN_SKILLS_PATH) {
    throw new Error(`Installed plugin manifest skills must point to ${PLUGIN_SKILLS_PATH}`);
  }
  const skillsPath = await resolveManifestPath(root, manifest.skills);
  if (skillsPath !== resolve(root, "skills")) {
    throw new Error("Installed plugin manifest skills must point to the installed skills directory");
  }
  const skillsStat = await lstat(skillsPath);
  if (!skillsStat.isDirectory()) {
    throw new Error("Installed plugin manifest skills path must be a directory");
  }
  if (typeof manifest.mcpServers !== "string" || manifest.mcpServers.length === 0) {
    throw new Error("Installed plugin manifest must point to bundled MCP servers");
  }
  if (manifest.mcpServers !== PLUGIN_MCP_SERVERS_PATH) {
    throw new Error(`Installed plugin manifest must point to the installed .mcp.json (${PLUGIN_MCP_SERVERS_PATH})`);
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
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(message);
  }
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
  if (!activeChild || activeChild.exitCode !== null) {
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
    if (!activeChild || activeChild.exitCode !== null) {
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
      resolveTerminated(activeChild.exitCode !== null);
    }
  });
}

function isNotFoundError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
