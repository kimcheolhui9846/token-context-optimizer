import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export type ReadBoundedFileInput = {
  path: string;
  allowedRoots: string[];
  maxBytes: number;
};
export type FileSnapshot = {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  isRegularFile: boolean;
};
export type BoundedFileResult = {
  bytes: Buffer;
  canonicalPath: string;
  snapshot: FileSnapshot;
};
export type ReadBoundedFileErrorCode =
  | "empty_roots" | "denied" | "read_failure" | "changed" | "non_regular" | "too_large";

const messages: Record<ReadBoundedFileErrorCode, string> = {
  empty_roots: "No allowed roots are configured; set TCO_ALLOWED_ROOTS",
  denied: "File is outside allowed roots",
  read_failure: "File cannot be read",
  changed: "File changed while reading",
  non_regular: "Path is not a regular file",
  too_large: "File exceeds maxBytes limit",
};

export class ReadBoundedFileError extends Error {
  readonly code: ReadBoundedFileErrorCode;
  readonly size?: number;

  constructor(code: ReadBoundedFileErrorCode, size?: number) {
    super(size === undefined ? messages[code] : `${messages[code]}: ${size}`);
    this.name = "ReadBoundedFileError";
    this.code = code;
    this.size = size;
  }
}

const isInside = (root: string, candidate: string): boolean => {
  const child = relative(root, candidate);
  return !isAbsolute(child) && (child === "" || (!child.startsWith(`..${sep}`) && child !== ".."));
};
const snap = (value: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number; isFile(): boolean }): FileSnapshot => ({
  dev: value.dev, ino: value.ino, size: value.size, mtimeMs: value.mtimeMs,
  ctimeMs: value.ctimeMs, isRegularFile: value.isFile(),
});
const same = (a: FileSnapshot, b: FileSnapshot): boolean =>
  a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs && a.isRegularFile === b.isRegularFile;
const tryRealpath = async (path: string) => {
  try { return { ok: true as const, path: await realpath(path) }; }
  catch (error) { return { ok: false as const, error }; }
};
const tryLstat = async (path: string) => {
  try { return { ok: true as const, stat: await lstat(path) }; }
  catch (error) { return { ok: false as const, error }; }
};
const errno = (error: unknown, code: string): boolean =>
  (error as NodeJS.ErrnoException)?.code === code;

async function classifyPath(originalPath: string, roots: string[]): Promise<string> {
  const canonicalRoots = (await Promise.all(roots.map(async (root) => (await tryRealpath(resolve(root))).path))).filter((root): root is string => root !== undefined);
  if (canonicalRoots.length === 0) throw new ReadBoundedFileError("denied");
  const target = await tryRealpath(originalPath);
  if (target.ok) {
    if (canonicalRoots.some((root) => isInside(root, target.path))) return target.path;
    throw new ReadBoundedFileError("denied");
  }
  let cursor = originalPath;
  while (true) {
    const ancestor = await tryRealpath(cursor);
    if (ancestor.ok) {
      if (canonicalRoots.some((root) => isInside(root, ancestor.path))) throw new ReadBoundedFileError("read_failure");
      throw new ReadBoundedFileError("denied");
    }
    const listed = await tryLstat(cursor);
    if (listed.ok || !errno(listed.error, "ENOENT")) throw new ReadBoundedFileError("denied");
    const parent = dirname(cursor);
    if (parent === cursor) throw new ReadBoundedFileError("denied");
    cursor = parent;
  }
}

export async function readBoundedFile(input: ReadBoundedFileInput): Promise<BoundedFileResult> {
  if (input.allowedRoots.length === 0) throw new ReadBoundedFileError("empty_roots");
  const originalPath = resolve(input.path);
  const canonicalPath = await classifyPath(originalPath, input.allowedRoots);
  let pathBefore: FileSnapshot;
  try { pathBefore = snap(await stat(canonicalPath)); } catch { throw new ReadBoundedFileError("read_failure"); }
  if (!pathBefore.isRegularFile) throw new ReadBoundedFileError("non_regular");
  if (pathBefore.size > input.maxBytes) throw new ReadBoundedFileError("too_large", pathBefore.size);
  let handle: FileHandle | undefined;
  try {
    const flags = constants.O_RDONLY | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    handle = await open(canonicalPath, flags);
    const before = snap(await handle.stat());
    if (!before.isRegularFile) throw new ReadBoundedFileError("non_regular");
    if (before.size > input.maxBytes) throw new ReadBoundedFileError("too_large", before.size);
    if (!same(pathBefore, before)) throw new ReadBoundedFileError("changed");
    const bytes = Buffer.alloc(before.size + 1);
    let total = 0;
    while (total <= before.size) {
      const result = await handle.read(bytes, total, before.size - total + 1, total);
      if (result.bytesRead === 0) break;
      if (result.bytesRead > before.size - total) throw new ReadBoundedFileError("changed");
      total += result.bytesRead;
    }
    const after = snap(await handle.stat());
    let pathAfter: FileSnapshot;
    try { pathAfter = snap(await stat(canonicalPath)); } catch { throw new ReadBoundedFileError("changed"); }
    const canonicalAfter = await tryRealpath(originalPath);
    const resolvedCanonicalAfter = await tryRealpath(canonicalPath);
    if (!canonicalAfter.ok || !resolvedCanonicalAfter.ok || canonicalAfter.path !== canonicalPath || resolvedCanonicalAfter.path !== canonicalPath || !same(before, after) || !same(pathBefore, pathAfter) || total !== before.size) throw new ReadBoundedFileError("changed");
    return { bytes: bytes.subarray(0, total), canonicalPath, snapshot: after };
  } catch (error) {
    if (error instanceof ReadBoundedFileError) throw error;
    throw new ReadBoundedFileError("read_failure");
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* preserve the primary result */ }
    }
  }
}
