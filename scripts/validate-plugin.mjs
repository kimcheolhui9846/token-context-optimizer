import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BUNDLED_SERVER_ENTRYPOINT,
  PLUGIN_MCP_SERVERS_PATH,
  PLUGIN_NAME,
  PLUGIN_SKILLS_PATH,
  REQUIRED_MCP_ENV_VARS,
} from "./plugin-runtime.mjs";

const root = process.cwd();
const manifestPath = join(root, ".codex-plugin", "plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const mcpPath = join(root, ".mcp.json");
const mcpConfig = JSON.parse(await readFile(mcpPath, "utf8"));
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

if (manifest.hooks !== undefined) {
  throw new Error("plugin.json must not declare hooks in the safe MVP");
}

if (manifest.name !== PLUGIN_NAME) {
  throw new Error(`plugin.json name must be ${PLUGIN_NAME}`);
}
if (manifest.skills !== PLUGIN_SKILLS_PATH) {
  throw new Error(`plugin.json skills must be ${PLUGIN_SKILLS_PATH}`);
}
if (manifest.mcpServers !== PLUGIN_MCP_SERVERS_PATH) {
  throw new Error(`plugin.json mcpServers must be ${PLUGIN_MCP_SERVERS_PATH}`);
}
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

const server = mcpConfig.mcpServers?.[PLUGIN_NAME];
if (!server) {
  throw new Error(`.mcp.json missing ${PLUGIN_NAME} server`);
}
if (server.command !== "node") {
  throw new Error(".mcp.json server command must be node");
}
if (!Array.isArray(server.args) || server.args[0] !== BUNDLED_SERVER_ENTRYPOINT) {
  throw new Error(".mcp.json server must launch the checked-in bundle");
}
if (server.env) {
  throw new Error(".mcp.json must not pin TCO_ALLOWED_ROOTS to the plugin directory");
}
if (
  !Array.isArray(server.env_vars) ||
  server.env_vars.length !== REQUIRED_MCP_ENV_VARS.length ||
  server.env_vars.some((key, index) => key !== REQUIRED_MCP_ENV_VARS[index])
) {
  throw new Error(".mcp.json must inherit TCO_ALLOWED_ROOTS");
}
await access(join(root, server.args[0]));

const serialized = JSON.stringify(manifest);
if (serialized.includes("[TODO")) {
  throw new Error("plugin.json contains placeholder text");
}

console.log("plugin manifest ok");
