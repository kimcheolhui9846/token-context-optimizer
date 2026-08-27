import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const pluginRoot = await mkdtemp(join(tmpdir(), "tco-installed-plugin-"));
const workspaceRoot = await mkdtemp(join(tmpdir(), "tco-workspace-"));
await copyRuntimeFiles(pluginRoot);

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

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
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
        resolve(found);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for MCP response. stderr=${stderr}`));
      }
    }, 25);
  });
}

try {
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
  ]) {
    if (!toolNames.includes(expected)) {
      throw new Error(`Missing MCP tool: ${expected}`);
    }
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
    throw new Error(`Installed-layout index check failed: ${JSON.stringify(payload)}`);
  }

  console.log("mcp smoke ok");
} finally {
  await stopChild();
}

async function copyRuntimeFiles(destination) {
  for (const relativePath of [
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "bin/token-context-optimizer.mjs",
    "skills/optimize-context/SKILL.md",
  ]) {
    await mkdir(dirname(join(destination, relativePath)), { recursive: true });
    await cp(relativePath, join(destination, relativePath));
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
    } catch (error) {
      throw new Error(`Malformed MCP stdout line: ${line}`);
    }
  }

  return { messages, consumedLines: completeLineCount };
}

function stopChild() {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 1000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
