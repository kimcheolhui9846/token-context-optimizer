import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PLUGIN_MCP_SERVERS_PATH,
  PLUGIN_NAME,
  PLUGIN_SKILLS_PATH,
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
const required = [
  ["name", "string"],
  ["version", "string"],
  ["description", "string"],
  ["skills", "string"],
  ["mcpServers", "string"],
];

for (const [field, type] of required) {
  if (typeof manifest[field] !== type || manifest[field].length === 0) {
    throw new Error(`plugin.json missing ${field}`);
  }
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error("plugin.json version must be strict semver");
}

assertPluginManifestContract(manifest, "plugin.json");
await access(join(root, manifest.skills));
await access(join(root, manifest.mcpServers));

if (!manifest.interface || typeof manifest.interface !== "object") {
  throw new Error("plugin.json missing interface");
}

for (const field of [
  "displayName",
  "shortDescription",
  "longDescription",
  "developerName",
  "category",
]) {
  if (typeof manifest.interface[field] !== "string" || manifest.interface[field].length === 0) {
    throw new Error(`plugin.json interface missing ${field}`);
  }
}

if (
  !Array.isArray(manifest.interface.defaultPrompt) ||
  manifest.interface.defaultPrompt.length === 0 ||
  manifest.interface.defaultPrompt.length > 3 ||
  manifest.interface.defaultPrompt.some(
    (prompt) => typeof prompt !== "string" || prompt.length === 0 || prompt.length > 128,
  )
) {
  throw new Error("plugin.json interface.defaultPrompt must contain 1-3 short prompts");
}

const server = assertCanonicalMcpConfig(mcpConfig, ".mcp.json");
await access(join(root, server.args[0]));

const serialized = JSON.stringify(manifest);
if (serialized.includes("[TODO")) {
  throw new Error("plugin.json contains placeholder text");
}

console.log("plugin manifest ok");
