// Minimal MCP stdio client (newline-delimited JSON-RPC 2.0) for calling the real plugin server from experiments.
// The plugin is only executed, never modified.
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { researchDir } from "./env.mjs";

export const PLUGIN_BUNDLE = resolve(researchDir, "..", "bin", "token-context-optimizer.mjs");

export async function startPlugin({ allowedRoots }) {
  const child = spawn(process.execPath, [PLUGIN_BUNDLE], {
    env: { ...process.env, TCO_ALLOWED_ROOTS: allowedRoots.join(";") },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let buffer = "";
  let nextId = 1;
  const pending = new Map();
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });
  child.stdout.on("data", (d) => {
    buffer += d.toString();
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve: ok, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else ok(msg.result);
      }
    }
  });
  const request = (method, params) => new Promise((ok, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: ok, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}; stderr: ${stderr.slice(-300)}`)); }
    }, 30_000);
  });
  const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "research-harness", version: "0.0.0" } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  return {
    serverInfo: init.serverInfo,
    async call(name, args) {
      const result = await request("tools/call", { name, arguments: args });
      if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content).slice(0, 300)}`);
      return result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? "null");
    },
    async listTools() {
      return (await request("tools/list", {})).tools.map((t) => t.name);
    },
    close() { child.kill(); },
  };
}

export const pluginDataRoot = join(researchDir, "out");
