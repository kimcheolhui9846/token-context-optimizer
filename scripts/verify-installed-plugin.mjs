import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REQUIRED_FILES = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "bin/token-context-optimizer.mjs",
  "skills/optimize-context/SKILL.md",
];

const pluginRoot = resolvePluginRoot(process.argv.slice(2), process.env);
await assertInstalledRuntime(pluginRoot);

const workspaceRoot = await mkdtemp(join(tmpdir(), "tco-installed-workspace-"));
const workspaceFile = join(workspaceRoot, "artifact.txt");
await writeFile(
  workspaceFile,
  "Alpha context explains the planning outcome clearly.\nBeta context explains the review outcome clearly.",
  "utf8",
);

const child = spawn(process.execPath, ["./bin/token-context-optimizer.mjs"], {
  cwd: pluginRoot,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, TCO_ALLOWED_ROOTS: workspaceRoot },
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

  console.log(
    JSON.stringify({
      ok: true,
      pluginRoot,
      workspaceRoot,
      indexedPath: payload.path,
      indexedLineCount: payload.lineCount,
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
  for (const requiredFile of REQUIRED_FILES) {
    try {
      await access(join(root, requiredFile));
    } catch {
      throw new Error(`Installed plugin is missing runtime file: ${requiredFile}`);
    }
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

function resolvePluginRoot(args, env) {
  const pluginRootArg = readOption(args, "--plugin-root");
  if (pluginRootArg) {
    return resolve(pluginRootArg);
  }
  if (env.TCO_PLUGIN_INSTALL_DIR) {
    return resolve(env.TCO_PLUGIN_INSTALL_DIR);
  }
  if (env.CODEX_HOME) {
    return resolve(env.CODEX_HOME, "plugins", "local", "token-context-optimizer");
  }
  if (env.USERPROFILE) {
    return resolve(env.USERPROFILE, ".codex", "plugins", "local", "token-context-optimizer");
  }
  throw new Error("Cannot resolve plugin root. Set --plugin-root or TCO_PLUGIN_INSTALL_DIR.");
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
