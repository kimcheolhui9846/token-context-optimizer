// Counting stdio MCP client for the fresh crop padding study (copied from #144 research/src/crop-padding-replay-client.mjs,
// a read-only reference that is not merged). Same transport as the #141 client, but callTool returns every
// image item of the raw response (not only the first) and the structured body of an error result. No retries.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export const REQUEST_TIMEOUT_MS = 30000;
export { minimalEnv } from "./mcp-view-comparison-client.mjs";

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
  const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fresh-crop-padding", version: "0.0.0" } });
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
    /** -> { ok, code, structured, images: [{ mimeType, data }] } with every image item of the raw content array. */
    async callTool(name, args) {
      counts.toolCalls++;
      const r = await request("tools/call", { name, arguments: args });
      if (r.timeout) return { ok: false, code: "timeout", structured: null, images: [] };
      if (r.error) return { ok: false, code: `rpc_${r.error.code}`, structured: null, images: [] };
      const res = r.result;
      const content = Array.isArray(res.content) ? res.content : [];
      const images = content.filter((c) => c.type === "image").map((c) => ({ mimeType: c.mimeType, data: c.data }));
      const structured = res.structuredContent ?? null;
      if (res.isError) {
        let code = structured && typeof structured.code === "string" ? structured.code : content[0]?.text ?? "";
        try { const j = JSON.parse(code); if (j && typeof j.code === "string") code = j.code; } catch { /* bare code */ }
        return { ok: false, code: /^[a-z0-9_]{1,64}$/.test(code) ? code : "tool_error_text", structured, images };
      }
      return { ok: true, code: null, structured, images };
    },
    counts: () => ({ ...counts }),
    async close() {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 5000);
      const exit = await exited;
      clearTimeout(timer);
      const err = Buffer.concat(stderr);
      return { ...exit, stderrSha256: createHash("sha256").update(err).digest("hex"), stderrBytes: err.length };
    },
  };
}
