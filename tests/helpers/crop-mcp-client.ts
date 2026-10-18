import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type RpcResponse = { result?: any; error?: any; id?: number };

export class CropMcpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly responses = new Map<number, (response: RpcResponse) => void>();
  private readonly timers = new Map<number, NodeJS.Timeout>();
  private nextId = 1;
  private buffer = "";
  private closed = false;

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.consume(chunk));
    child.stderr.resume();
    child.on("error", () => { /* request-scoped listeners reject pending calls */ });
  }

  static async start(bundle = process.env.TCO_MCP_BUNDLE ?? "bin/token-context-optimizer.mjs", allowedRoot?: string): Promise<CropMcpClient> {
    const child = spawn(process.execPath, [bundle], {
      cwd: process.cwd(),
      env: { ...process.env, ...(allowedRoot ? { TCO_ALLOWED_ROOTS: allowedRoot } : {}) },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const client = new CropMcpClient(child);
    try {
      await client.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "crop-image-contract-test", version: "1" },
      });
      client.notify("notifications/initialized", {});
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  async listTools(): Promise<any[]> {
    const response = await this.request("tools/list", {});
    if (response.error) throw new Error(`tools/list failed: ${JSON.stringify(response.error)}`);
    return response.result?.tools ?? [];
  }

  async call(name: string, args: unknown): Promise<RpcResponse> {
    return this.request("tools/call", { name, arguments: args });
  }

  notify(method: string, params: unknown): void {
    if (!this.closed) this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.child.stdin.end();
    if (!this.child.killed) this.child.kill();
    await new Promise<void>((resolve) => {
      if (this.child.exitCode !== null) resolve();
      else this.child.once("exit", () => resolve());
      setTimeout(resolve, 500);
    });
  }

  private request(method: string, params: unknown): Promise<RpcResponse> {
    const id = this.nextId++;
    let rejectRequest: (error: Error) => void;
    const promise = new Promise<RpcResponse>((resolve, reject) => {
      rejectRequest = reject;
      const timer = setTimeout(() => {
        this.responses.delete(id);
        this.timers.delete(id);
        reject(new Error(`MCP ${method} request timed out`));
      }, 5000);
      this.timers.set(id, timer);
      this.responses.set(id, (response) => { clearTimeout(timer); resolve(response); });
    });
    const rejectPending = (error: Error) => {
      this.responses.delete(id);
      const timer = this.timers.get(id);
      if (timer) clearTimeout(timer);
      this.timers.delete(id);
      rejectRequest(error);
    };
    const onChildFailure = (error: Error) => rejectPending(new Error(`MCP child failed during ${method}: ${error.message}`));
    this.child.once("error", onChildFailure);
    const onChildExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (!this.closed && this.responses.has(id)) rejectPending(new Error(`MCP child exited during ${method}: code=${code} signal=${signal ?? "none"}`));
    };
    this.child.once("exit", onChildExit);
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return promise.finally(() => {
      this.child.removeListener("error", onChildFailure);
      this.child.removeListener("exit", onChildExit);
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/u);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as RpcResponse;
        if (typeof message.id === "number") {
          const resolve = this.responses.get(message.id);
          if (resolve) {
            this.responses.delete(message.id);
            const timer = this.timers.get(message.id);
            if (timer) clearTimeout(timer);
            this.timers.delete(message.id);
            resolve(message);
          }
        }
      } catch {
        // Stdio servers must emit one JSON-RPC object per line; ignore partial noise.
      }
    }
  }
}
