import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { CropMcpClient } from "./helpers/crop-mcp-client.js";

it("rejects an MCP child exit during initialization instead of leaving the request pending", async () => {
  const root = await mkdtemp(join(tmpdir(), "tco-crop-client-"));
  try {
    const bundle = join(root, "exit.mjs");
    await writeFile(bundle, "process.exit(7);\n");
    await expect(CropMcpClient.start(bundle)).rejects.toThrow("MCP child exited during initialize");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 2000);
