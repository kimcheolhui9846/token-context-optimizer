import { cp, lstat, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, parse, join, resolve } from "node:path";

const RUNTIME_FILES = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "bin/token-context-optimizer.mjs",
  "skills/optimize-context/SKILL.md",
];

const target = resolveInstallTarget(process.argv.slice(2), process.env);

await preflightSources();
await preflightTarget(target);
await preflightDestinationPaths(target);

for (const runtimeFile of RUNTIME_FILES) {
  const destination = join(target, runtimeFile);
  await mkdir(dirname(destination), { recursive: true });
  await cp(runtimeFile, destination);
}

console.log(
  JSON.stringify({
    ok: true,
    target,
    copiedFiles: RUNTIME_FILES,
  }),
);

async function preflightSources() {
  for (const runtimeFile of RUNTIME_FILES) {
    let fileStat;
    try {
      fileStat = await stat(runtimeFile);
    } catch {
      throw new Error(`Missing runtime file. Run npm.cmd run build first: ${runtimeFile}`);
    }
    if (!fileStat.isFile()) {
      throw new Error(`Runtime source is not a regular file: ${runtimeFile}`);
    }
  }
}

async function preflightTarget(path) {
  await rejectSymlinkedComponents(path);

  let entries;
  try {
    entries = await readdir(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (entries.length === 0) {
    return;
  }

  const manifestPath = join(path, ".codex-plugin", "plugin.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.name === "token-context-optimizer") {
      return;
    }
  } catch {
    throw new Error(
      "Install target is not empty and does not contain a readable token-context-optimizer manifest.",
    );
  }

  throw new Error("Install target belongs to a different plugin.");
}

async function preflightDestinationPaths(path) {
  for (const runtimeFile of RUNTIME_FILES) {
    await rejectSymlinkedComponents(join(path, runtimeFile));
  }
}

async function rejectSymlinkedComponents(path) {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  const relativeParts = absolute
    .slice(parsed.root.length)
    .split(/[\\/]+/u)
    .filter(Boolean);

  let current = parsed.root;
  for (const part of relativeParts) {
    current = resolve(current, part);
    let currentStat;
    try {
      currentStat = await lstat(current);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (currentStat.isSymbolicLink()) {
      throw new Error(`Install target contains a symlinked path component: ${current}`);
    }
  }
}

function resolveInstallTarget(args, env) {
  const targetArg = readOption(args, "--target");
  if (targetArg) {
    return resolve(targetArg);
  }
  if (env.TCO_PLUGIN_INSTALL_DIR) {
    return resolve(env.TCO_PLUGIN_INSTALL_DIR);
  }
  if (env.CODEX_HOME) {
    return resolve(env.CODEX_HOME, "plugins", "local", "token-context-optimizer");
  }
  if (env.USERPROFILE) {
    return resolve(env.USERPROFILE, ".codex", "plugins", "local", "token-context-optimizer");
  }
  throw new Error("Cannot resolve install target. Set --target or TCO_PLUGIN_INSTALL_DIR.");
}

function readOption(args, name) {
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
