import { dirname, resolve } from "node:path";

export const PLUGIN_NAME = "token-context-optimizer";

export const RUNTIME_FILES = Object.freeze([
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "bin/token-context-optimizer.mjs",
  "skills/optimize-context/SKILL.md",
]);

export const MANAGED_RUNTIME_DIRECTORIES = Object.freeze([
  ".codex-plugin",
  "bin",
  "hooks",
  "skills",
]);

export const BUNDLED_SERVER_ENTRYPOINT = "./bin/token-context-optimizer.mjs";
export const PLUGIN_SKILLS_PATH = "./skills/";
export const PLUGIN_MCP_SERVERS_PATH = "./.mcp.json";
export const REQUIRED_MCP_ENV_VARS = Object.freeze(["TCO_ALLOWED_ROOTS"]);
export const CANONICAL_MCP_SERVER = Object.freeze({
  command: "node",
  args: Object.freeze([BUNDLED_SERVER_ENTRYPOINT]),
  cwd: ".",
  env_vars: REQUIRED_MCP_ENV_VARS,
});
export const CANONICAL_MCP_CONFIG = Object.freeze({
  mcpServers: Object.freeze({
    [PLUGIN_NAME]: CANONICAL_MCP_SERVER,
  }),
});

export function resolvePluginRoot(args, env, optionName) {
  const rootArg = readOption(args, optionName);
  if (rootArg) {
    return resolve(rootArg);
  }
  if (env.TCO_PLUGIN_INSTALL_DIR) {
    return resolve(env.TCO_PLUGIN_INSTALL_DIR);
  }
  if (env.CODEX_HOME) {
    return resolve(env.CODEX_HOME, "plugins", PLUGIN_NAME);
  }
  if (env.USERPROFILE) {
    return resolve(env.USERPROFILE, ".codex", "plugins", PLUGIN_NAME);
  }
  if (env.HOME) {
    return resolve(env.HOME, ".codex", "plugins", PLUGIN_NAME);
  }
  throw new Error(`Cannot resolve plugin root. Set ${optionName} or TCO_PLUGIN_INSTALL_DIR.`);
}

export function resolveDefaultMarketplacePath(env) {
  if (env.CODEX_HOME) {
    return resolve(dirname(resolve(env.CODEX_HOME)), ".agents", "plugins", "marketplace.json");
  }
  if (env.USERPROFILE) {
    return resolve(env.USERPROFILE, ".agents", "plugins", "marketplace.json");
  }
  if (env.HOME) {
    return resolve(env.HOME, ".agents", "plugins", "marketplace.json");
  }
  throw new Error("Cannot resolve marketplace path. Set --marketplace or --no-marketplace.");
}

export function readOption(args, name) {
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

export function validateCliArgs(args, config) {
  const valueOptions = new Set(config.valueOptions ?? []);
  const flags = new Set(config.flags ?? []);
  const seen = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    if (!valueOptions.has(arg) && !flags.has(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (seen.has(arg)) {
      throw new Error(`Duplicate option: ${arg}`);
    }
    seen.add(arg);
    if (valueOptions.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
    }
  }
}

export function assertCanonicalMcpConfig(config, context = ".mcp.json") {
  if (!isPlainObject(config)) {
    throw new Error(`${context} canonical MCP config must be a JSON object`);
  }
  assertExactKeys(config, ["mcpServers"], `${context} canonical MCP config`);

  const serverMap = config.mcpServers;
  if (!isPlainObject(serverMap)) {
    throw new Error(`${context} canonical MCP config must contain a mcpServers object`);
  }
  const serverNames = Object.keys(serverMap);
  if (serverNames.length !== 1 || serverNames[0] !== PLUGIN_NAME) {
    throw new Error(`${context} canonical MCP config must contain exactly one ${PLUGIN_NAME} server`);
  }

  const server = serverMap[PLUGIN_NAME];
  if (!isPlainObject(server)) {
    throw new Error(`${context} canonical MCP ${PLUGIN_NAME} server must be a JSON object`);
  }
  assertExactKeys(
    server,
    ["command", "args", "cwd", "env_vars"],
    `${context} canonical MCP ${PLUGIN_NAME} server`,
  );
  if (server.command !== CANONICAL_MCP_SERVER.command) {
    throw new Error(`${context} canonical MCP ${PLUGIN_NAME} command must be node`);
  }
  if (!arraysEqual(server.args, CANONICAL_MCP_SERVER.args)) {
    throw new Error(
      `${context} canonical MCP ${PLUGIN_NAME} args must exactly launch installed bundle ${BUNDLED_SERVER_ENTRYPOINT}`,
    );
  }
  if (server.cwd !== CANONICAL_MCP_SERVER.cwd) {
    throw new Error(`${context} canonical MCP ${PLUGIN_NAME} cwd must be .`);
  }
  if (!arraysEqual(server.env_vars, CANONICAL_MCP_SERVER.env_vars)) {
    throw new Error(`${context} canonical MCP ${PLUGIN_NAME} env_vars must exactly inherit TCO_ALLOWED_ROOTS`);
  }
  return server;
}

export function parseJsonObjectRejectingDuplicateKeys(source, context = "JSON") {
  rejectDuplicateJsonObjectKeys(source, context);
  return JSON.parse(source);
}

function assertExactKeys(value, expectedKeys, context) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (!arraysEqual(actual, expected)) {
    throw new Error(`${context} must contain exactly keys: ${expected.join(", ")}`);
  }
}

function arraysEqual(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectDuplicateJsonObjectKeys(source, context) {
  const maxLength = 1024 * 1024;
  const maxDepth = 128;
  if (source.length > maxLength) {
    throw new Error(`${context} is too large to validate safely`);
  }
  let index = 0;

  parseValue(0);
  skipWhitespace();

  function parseValue(depth) {
    if (depth > maxDepth) {
      throw new Error(`${context} exceeds maximum JSON nesting depth`);
    }
    skipWhitespace();
    const char = source[index];
    if (char === "{") {
      parseObject(depth + 1);
      return;
    }
    if (char === "[") {
      parseArray(depth + 1);
      return;
    }
    if (char === "\"") {
      parseString();
      return;
    }
    skipPrimitive();
  }

  function parseObject(depth) {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (source[index] === "}") {
      index += 1;
      return;
    }

    while (index < source.length) {
      skipWhitespace();
      if (source[index] !== "\"") {
        return;
      }
      const key = parseString();
      if (keys.has(key)) {
        throw new Error(`${context} contains duplicate JSON object member: ${key}`);
      }
      keys.add(key);

      skipWhitespace();
      if (source[index] !== ":") {
        return;
      }
      index += 1;
      parseValue(depth);
      skipWhitespace();

      if (source[index] === "}") {
        index += 1;
        return;
      }
      if (source[index] !== ",") {
        return;
      }
      index += 1;
    }
  }

  function parseArray(depth) {
    index += 1;
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      return;
    }

    while (index < source.length) {
      parseValue(depth);
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      if (source[index] !== ",") {
        return;
      }
      index += 1;
    }
  }

  function parseString() {
    const start = index;
    index += 1;
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "\"") {
        index += 1;
        return JSON.parse(source.slice(start, index));
      }
      index += 1;
    }
    return "";
  }

  function skipPrimitive() {
    while (index < source.length && !/[\s,\]}]/u.test(source[index])) {
      index += 1;
    }
  }

  function skipWhitespace() {
    while (index < source.length && /\s/u.test(source[index])) {
      index += 1;
    }
  }
}
