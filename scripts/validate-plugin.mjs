import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertCanonicalMcpConfig,
  assertPluginManifestContract,
  parseJsonObjectRejectingDuplicateKeys,
} from "./plugin-runtime.mjs";

const root = process.cwd();
const manifestPath = join(root, ".codex-plugin", "plugin.json");
const manifest = parseJsonObjectRejectingDuplicateKeys(
  await readFile(manifestPath, "utf8"),
  "plugin.json",
);
const mcpPath = join(root, ".mcp.json");
const mcpConfig = parseJsonObjectRejectingDuplicateKeys(
  await readFile(mcpPath, "utf8"),
  ".mcp.json",
);
assertPluginManifestContract(manifest, "plugin.json");
await access(join(root, manifest.skills));
await access(join(root, manifest.mcpServers));

const server = assertCanonicalMcpConfig(mcpConfig, ".mcp.json");
await access(join(root, server.args[0]));

const serialized = JSON.stringify(manifest);
if (serialized.includes("[TODO")) {
  throw new Error("plugin.json contains placeholder text");
}

console.log("plugin manifest ok");
