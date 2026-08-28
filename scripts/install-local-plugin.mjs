import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, parse, join, relative, resolve } from "node:path";

import {
  PLUGIN_NAME,
  RUNTIME_FILES,
  readOption,
  resolveDefaultMarketplacePath,
  resolvePluginRoot,
} from "./plugin-runtime.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const target = resolvePluginRoot(args, process.env, "--target");
const marketplacePath = resolveMarketplacePath(args, process.env);
const simulateCopyFailureAfter = readIntegerOption(args, "--simulate-copy-failure-after");
const simulateMarketplaceWriteFailure = args.includes("--simulate-marketplace-write-failure");

await preflightSources();
await preflightTarget(target);
await preflightDestinationPaths(target);
if (marketplacePath) {
  await preflightMarketplace(marketplacePath);
}

const snapshots = await snapshotRuntimeDestinations(target);
let marketplaceEntry = null;
try {
  for (const [index, runtimeFile] of RUNTIME_FILES.entries()) {
    const source = join(sourceRoot, runtimeFile);
    const destination = join(target, runtimeFile);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
    if (simulateCopyFailureAfter !== null && index + 1 === simulateCopyFailureAfter) {
      throw new Error("Simulated copy failure after runtime file copy");
    }
  }
  if (marketplacePath) {
    marketplaceEntry = await updateMarketplace(marketplacePath, target, {
      simulateWriteFailure: simulateMarketplaceWriteFailure,
    });
  }
} catch (error) {
  await restoreRuntimeDestinations(target, snapshots);
  throw error;
}

console.log(
  JSON.stringify({
    ok: true,
    target,
    copiedFiles: RUNTIME_FILES,
    ...(marketplacePath ? { marketplacePath, marketplaceEntry } : {}),
  }),
);

async function preflightSources() {
  for (const runtimeFile of RUNTIME_FILES) {
    const source = join(sourceRoot, runtimeFile);
    await rejectSymlinkedComponents(source, "Runtime source contains a symlinked path component");
    let fileStat;
    try {
      fileStat = await lstat(source);
    } catch {
      throw new Error(`Missing runtime file. Run npm.cmd run build first: ${runtimeFile}`);
    }
    if (!fileStat.isFile()) {
      throw new Error(`Runtime source is not a regular file: ${runtimeFile}`);
    }
    if (fileStat.nlink > 1) {
      throw new Error(`Runtime source is hard-linked and not safe to copy: ${runtimeFile}`);
    }
    const physicalSource = await realpath(source);
    if (!isInsideRoot(sourceRoot, physicalSource)) {
      throw new Error(`Runtime source escapes repository root: ${runtimeFile}`);
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
    if (manifest.name === PLUGIN_NAME) {
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
    const destination = join(path, runtimeFile);
    await rejectSymlinkedComponents(destination);
    await assertExistingDestinationIsFile(destination);
    await assertExistingParentsAreDirectories(path, runtimeFile);
  }
}

async function assertExistingDestinationIsFile(path) {
  let currentStat;
  try {
    currentStat = await lstat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (!currentStat.isFile()) {
    throw new Error(`Runtime destination is not a regular file: ${path}`);
  }
  if (currentStat.nlink > 1) {
    throw new Error(`Runtime destination is hard-linked and not safe to overwrite: ${path}`);
  }
}

async function assertExistingParentsAreDirectories(root, runtimeFile) {
  const parts = runtimeFile.split(/[\\/]+/u).filter(Boolean);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    let currentStat;
    try {
      currentStat = await lstat(current);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (!currentStat.isDirectory()) {
      throw new Error(`Runtime destination parent is not a directory: ${current}`);
    }
  }
}

async function snapshotRuntimeDestinations(path) {
  const snapshots = [];
  for (const runtimeFile of RUNTIME_FILES) {
    const destination = join(path, runtimeFile);
    try {
      snapshots.push({
        path: destination,
        existed: true,
        content: await readFile(destination),
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        snapshots.push({ path: destination, existed: false, content: null });
        continue;
      }
      throw error;
    }
  }
  return snapshots;
}

async function restoreRuntimeDestinations(root, snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.existed) {
      await writeFile(snapshot.path, snapshot.content);
    } else {
      await rm(snapshot.path, { force: true });
      await removeEmptyParents(root, dirname(snapshot.path));
    }
  }
}

async function removeEmptyParents(root, start) {
  const absoluteRoot = resolve(root);
  let current = resolve(start);
  while (current !== absoluteRoot && isInsideRoot(absoluteRoot, current)) {
    try {
      await rmdir(current);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTEMPTY" || error.code === "EPERM")
      ) {
        return;
      }
      throw error;
    }
    current = dirname(current);
  }
}

async function preflightMarketplace(path) {
  await rejectSymlinkedComponents(path);
  await assertExistingDestinationIsFile(path);
}

async function updateMarketplace(path, pluginRoot, options) {
  const marketplaceRoot = resolveMarketplaceRoot(path);
  const sourcePath = toMarketplaceSourcePath(marketplaceRoot, pluginRoot);
  let marketplace;
  try {
    marketplace = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      marketplace = {
        name: "personal",
        interface: { displayName: "Personal" },
        plugins: [],
      };
    } else {
      throw error;
    }
  }

  if (!marketplace || typeof marketplace !== "object" || Array.isArray(marketplace)) {
    throw new Error("Marketplace file must contain a JSON object");
  }
  if (typeof marketplace.name !== "string" || marketplace.name.length === 0) {
    marketplace.name = "personal";
  }
  if (!marketplace.interface || typeof marketplace.interface !== "object") {
    marketplace.interface = { displayName: "Personal" };
  }
  if (typeof marketplace.interface.displayName !== "string") {
    marketplace.interface.displayName = marketplace.name;
  }
  if (!Array.isArray(marketplace.plugins)) {
    throw new Error("Marketplace file plugins field must be an array");
  }

  const entry = {
    name: PLUGIN_NAME,
    source: {
      source: "local",
      path: sourcePath,
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category: "Productivity",
  };
  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin?.name === PLUGIN_NAME);
  if (existingIndex === -1) {
    marketplace.plugins.push(entry);
  } else {
    marketplace.plugins[existingIndex] = entry;
  }

  await writeJsonFileAtomically(path, `${JSON.stringify(marketplace, null, 2)}\n`, options);
  return entry;
}

async function writeJsonFileAtomically(path, content, options) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(tempPath, content, "utf8");
    if (options?.simulateWriteFailure) {
      throw new Error("Simulated marketplace write failure");
    }
    await rename(tempPath, path);
  } finally {
    await rm(tempPath, { force: true });
  }
}

function resolveMarketplaceRoot(path) {
  const pluginsDir = dirname(path);
  const agentsDir = dirname(pluginsDir);
  if (basename(path) === "marketplace.json" && basename(pluginsDir) === "plugins" && basename(agentsDir) === ".agents") {
    return dirname(agentsDir);
  }
  return dirname(path);
}

function toMarketplaceSourcePath(marketplaceRoot, pluginRoot) {
  const relativePath = relative(marketplaceRoot, pluginRoot).replace(/\\/g, "/");
  if (!relativePath || !isInsideRoot(marketplaceRoot, pluginRoot)) {
    throw new Error("Marketplace source.path must stay inside the marketplace root");
  }
  return `./${relativePath}`;
}

function isInsideRoot(root, path) {
  const relativePath = relative(resolve(root), resolve(path));
  return relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !relativePath.startsWith(`..${"\\"}`) && !isAbsolute(relativePath);
}

async function rejectSymlinkedComponents(path, message = "Install target contains a symlinked path component") {
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
      throw new Error(`${message}: ${current}`);
    }
  }
}

function resolveMarketplacePath(args, env) {
  if (args.includes("--no-marketplace")) {
    return null;
  }
  const marketplaceArg = readOption(args, "--marketplace");
  if (marketplaceArg) {
    return resolve(marketplaceArg);
  }
  if (env.TCO_PLUGIN_MARKETPLACE_PATH) {
    return resolve(env.TCO_PLUGIN_MARKETPLACE_PATH);
  }
  if (readOption(args, "--target") || env.TCO_PLUGIN_INSTALL_DIR) {
    throw new Error("Custom install targets require --marketplace or --no-marketplace.");
  }
  return resolveDefaultMarketplacePath(env);
}

function readIntegerOption(args, name) {
  const value = readOption(args, name);
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} requires a non-negative integer`);
  }
  return parsed;
}
