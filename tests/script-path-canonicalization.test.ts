import { execFile } from "node:child_process";
import { mkdtemp, realpath, rmdir, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execFileAsync = promisify(execFile);

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
  );
}

async function removeJunction(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error &&
        (error.code === "ENOTDIR" || error.code === "EINVAL" || error.code === "EPERM")) {
      await unlink(path);
      return;
    }
    throw error;
  }
}

async function removeOwnedDirectory(path: string, tempRoot: string): Promise<void> {
  const resolvedPath = await realpath(path);
  if (!isInside(tempRoot, resolvedPath) || resolvedPath === tempRoot) {
    throw new Error(`Refusing to remove path outside test temp root: ${path}`);
  }
  await rm(path, { recursive: true, force: true });
}

async function withJunction<T>(run: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  const resolvedTempRoot = await realpath(tmpdir());
  let physicalRoot: string | undefined;
  let junctionParent: string | undefined;
  let junction: string | undefined;
  let junctionCreated = false;
  let originalError: unknown;
  try {
    physicalRoot = await mkdtemp(join(tmpdir(), "tco-f19-physical-"));
    junctionParent = await mkdtemp(join(tmpdir(), "tco-f19-junction-parent-"));
    junction = join(junctionParent, "tmp-link");
    await symlink(physicalRoot, junction, "junction");
    junctionCreated = true;
    const resolvedPhysical = await realpath(physicalRoot);
    const resolvedJunction = await realpath(junction);
    expect(resolvedPhysical).toBe(resolvedJunction);
    expect(isInside(resolvedTempRoot, resolvedPhysical)).toBe(true);
    expect(isInside(resolvedTempRoot, resolvedJunction)).toBe(true);
    return await run({ ...process.env, TMP: junction, TEMP: junction, TMPDIR: junction });
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    try {
      if (junctionCreated && junction) {
        await removeJunction(junction);
      }
      if (junctionParent) {
        await removeOwnedDirectory(junctionParent, resolvedTempRoot);
      }
      if (physicalRoot) {
        await removeOwnedDirectory(physicalRoot, resolvedTempRoot);
      }
    } catch (cleanupError) {
      if (originalError === undefined) {
        throw cleanupError;
      }
    }
  }
}

it("canonicalizes the smoke workspace path when TMP resolves through a junction", async () => {
  await withJunction(async (env) => {
    await expect(execFileAsync(process.execPath, ["scripts/smoke-mcp.mjs"], {
      cwd: resolve("."),
      env,
      windowsHide: true,
    })).resolves.toBeDefined();
  });
});

it("canonicalizes the installed verifier workspace path when TMP resolves through a junction", async () => {
  await withJunction(async (env) => {
    const target = await mkdtemp(join(tmpdir(), "tco-f19-installed-"));
    try {
      await execFileAsync(process.execPath, [
        "scripts/install-local-plugin.mjs",
        "--target",
        target,
        "--no-marketplace",
      ], { cwd: resolve("."), env, windowsHide: true });
      await expect(execFileAsync(process.execPath, [
        "scripts/verify-installed-plugin.mjs",
        "--plugin-root",
        target,
      ], { cwd: resolve("."), env, windowsHide: true })).resolves.toBeDefined();
    } finally {
      const resolvedTempRoot = await realpath(tmpdir());
      await removeOwnedDirectory(target, resolvedTempRoot);
    }
  });
});
