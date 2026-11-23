// Counting stdio MCP client (newline-delimited JSON-RPC 2.0) for the product MCP view comparison.
// Every request sent is counted, including failed ones. Tool errors are returned as data, never thrown. No retries.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export const REQUEST_TIMEOUT_MS = 30000;

/** The few variables a Node child needs on Windows and POSIX. No keys, tokens or proxies are passed on. */
export const MINIMAL_ENV_NAMES = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "windir", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE"];
export function minimalEnv(source = process.env) {
  return Object.fromEntries(MINIMAL_ENV_NAMES.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
}

/** Starts the server with exactly the given env (nothing inherited) and runs initialize + notifications/initialized. */
export async function startServer({ command, args = [], env = {}, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const counts = { requests: 0, responses: 0, notifications: 0, toolCalls: 0, initialize: 0, toolsList: 0 };
  const pending = new Map();
  const stderr = [];
  let buffer = "";
  let nextId = 1;
  const exited = new Promise((ok) => child.on("exit", (code, signal) => ok({ code, signal })));
  child.stderr.on("data", (d) => stderr.push(d));
  child.stdout.on("data", (d) => {
    buffer += d.toString();
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && pending.has(msg.id)) {
        counts.responses++;
        const done = pending.get(msg.id);
        pending.delete(msg.id);
        done(msg);
      }
    }
  });
  child.stdin.on("error", () => {});
  const request = (method, params) => new Promise((ok) => {
    const id = nextId++;
    counts.requests++;
    const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); ok({ timeout: true }); } }, timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); ok(msg); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const notify = (method) => { counts.notifications++; child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`); };

  counts.initialize++;
  const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-view-comparison", version: "0.0.0" } });
  const initOk = !!init.result;
  if (initOk) notify("notifications/initialized");

  return {
    initOk,
    serverInfo: init.result?.serverInfo ?? null,
    async listTools() {
      counts.toolsList++;
      const r = await request("tools/list", {});
      return r.result ? r.result.tools.map((t) => t.name) : null;
    },
    /** -> { ok: true, structured, image } | { ok: false, code } with code from the tool, the RPC error or a timeout. */
    async callTool(name, args) {
      counts.toolCalls++;
      const r = await request("tools/call", { name, arguments: args });
      if (r.timeout) return { ok: false, code: "timeout" };
      if (r.error) return { ok: false, code: `rpc_${r.error.code}` };
      const res = r.result;
      if (res.isError) {
        const text = res.content?.[0]?.text ?? "";
        // Product tool errors are a bare code; a rejected crop carries a JSON body with its code.
        let code = text;
        try { const j = JSON.parse(text); if (j && typeof j.code === "string") code = j.code; } catch { /* bare code */ }
        return { ok: false, code: /^[a-z0-9_]{1,64}$/.test(code) ? code : "tool_error_text" };
      }
      const img = res.content?.find((c) => c.type === "image");
      return { ok: true, structured: res.structuredContent ?? null, image: img ? { data: img.data, mimeType: img.mimeType } : null };
    },
    counts: () => ({ ...counts }),
    async close() {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 5000);
      const exit = await exited;
      clearTimeout(timer);
      return { ...exit, stderrSha256: createHash("sha256").update(Buffer.concat(stderr)).digest("hex"), stderrBytes: Buffer.concat(stderr).length };
    },
  };
}
