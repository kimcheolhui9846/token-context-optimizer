import { spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, parse, relative, resolve } from "node:path";

import {
  BUNDLED_SERVER_ENTRYPOINT,
  PLUGIN_NAME,
  RUNTIME_FILES,
  resolvePluginRoot,
} from "./plugin-runtime.mjs";

const pluginRoot = await resolvePhysicalPluginRoot(
  resolvePluginRoot(process.argv.slice(2), process.env, "--plugin-root"),
);
await assertInstalledRuntime(pluginRoot);
const serverConfig = await readInstalledServerConfig(pluginRoot);
const launchConfig = await resolveInstalledLaunchConfig(pluginRoot, serverConfig);

const workspaceRoot = await mkdtemp(join(tmpdir(), "tco-installed-workspace-"));
const workspaceFile = join(workspaceRoot, "artifact.txt");
await writeFile(
  workspaceFile,
  "Alpha context explains the planning outcome clearly.\nBeta context explains the review outcome clearly.",
  "utf8",
);

const child = spawn(launchConfig.command, launchConfig.args, {
  cwd: launchConfig.cwd,
  stdio: ["pipe", "pipe", "pipe"],
  env: buildVerifierEnv(process.env, workspaceRoot),
});

let buffer = "";
let stderr = "";
let consumedLines = 0;
let childError = null;

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.once("error", (error) => {
  childError = error;
});
child.stdout.on("data", (chunk) => {
  buffer += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

try {
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
  await stopChild();
}

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolveResult, reject) => {
    const interval = setInterval(() => {
      if (childError) {
        clearInterval(interval);
        reject(childError);
        return;
      }
      if (child.exitCode !== null) {
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
    } catch {
      throw new Error(`Installed plugin is missing runtime file: ${requiredFile}`);
    }
    if (!fileStat.isFile()) {
      throw new Error(`Installed plugin runtime file is not a regular runtime file: ${requiredFile}`);
    }
    const physicalPath = await realpath(path);
    assertInsideRoot(root, physicalPath, "Installed runtime files must stay inside the plugin root");
  }
}

async function readInstalledServerConfig(root) {
  const manifest = JSON.parse(await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8"));
  if (manifest.name !== PLUGIN_NAME) {
    throw new Error(`Installed plugin manifest name must be ${PLUGIN_NAME}`);
  }
  if (typeof manifest.mcpServers !== "string" || manifest.mcpServers.length === 0) {
    throw new Error("Installed plugin manifest must point to bundled MCP servers");
  }
  const mcpPath = await resolveManifestPath(root, manifest.mcpServers);
  const mcpConfig = JSON.parse(await readFile(mcpPath, "utf8"));
  const serverMap = selectServerMap(mcpConfig);
  const server = serverMap[PLUGIN_NAME];
  if (!server || typeof server !== "object") {
    throw new Error(`Installed MCP config missing ${PLUGIN_NAME} server`);
  }
  if (typeof server.command !== "string" || server.command.length === 0) {
    throw new Error(`Installed MCP ${PLUGIN_NAME} server missing command`);
  }
  if (server.args !== undefined && !Array.isArray(server.args)) {
    throw new Error(`Installed MCP ${PLUGIN_NAME} server args must be an array`);
  }
  if (server.cwd !== undefined && typeof server.cwd !== "string") {
    throw new Error(`Installed MCP ${PLUGIN_NAME} server cwd must be a string`);
  }
  if (server.env !== undefined && (typeof server.env !== "object" || Array.isArray(server.env))) {
    throw new Error(`Installed MCP ${PLUGIN_NAME} server env must be an object`);
  }
  for (const key of Object.keys(server.env ?? {})) {
    if (isNodeExecutionHook(key)) {
      throw new Error(`Node execution hook is not allowed in installed MCP env: ${key}`);
    }
    throw new Error(`Configured MCP env is not allowed during installed verification: ${key}`);
  }
  return server;
}

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
  const env = {};
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

function selectServerMap(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Installed MCP config must be a JSON object");
  }
  if (config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers)) {
    return config.mcpServers;
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
  if (child.exitCode !== null) {
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
    if (child.exitCode !== null) {
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
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
    if (!child.kill(signal)) {
      cleanup();
      resolveTerminated(child.exitCode !== null);
    }
  });
}
