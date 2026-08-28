import { dirname, resolve } from "node:path";

export const PLUGIN_NAME = "token-context-optimizer";

export const RUNTIME_FILES = Object.freeze([
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "bin/token-context-optimizer.mjs",
  "skills/optimize-context/SKILL.md",
]);

export const BUNDLED_SERVER_ENTRYPOINT = "./bin/token-context-optimizer.mjs";

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
