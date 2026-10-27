import { constants } from "node:fs";
import { mkdir, mkdtemp as createTempDir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readBoundedFile } from "../src/core/read-bounded-file.js";

const temporaryRoots = new Set<string>();
async function mkdtemp(prefix: string): Promise<string> {
  const root = await createTempDir(prefix);
  temporaryRoots.add(root);
  return root;
}
afterEach(async () => {
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

const makeFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "read-bounded-file-"));
  await writeFile(join(root, "inside.txt"), "hello");
  return root;
};

describe("readBoundedFile", () => {
  it("reads a regular file under a canonical allowed root", async () => {
    const root = await makeFixture();
    try {
      const result = await readBoundedFile({
        path: join(root, "inside.txt"),
        allowedRoots: [root],
        maxBytes: 10,
      });
      expect(result.bytes).toEqual(Buffer.from("hello"));
      expect(result.canonicalPath).toBe(await realpath(join(root, "inside.txt")));
      expect(result.snapshot.isRegularFile).toBe(true);
      expect(result.snapshot.size).toBe(5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("denies a missing path outside the allowed root without revealing existence", async () => {
    const root = await makeFixture();
    const outside = join(root, "..", "outside-missing.txt");
    try {
      await expect(readBoundedFile({ path: outside, allowedRoots: [root], maxBytes: 10 }))
        .rejects.toMatchObject({ code: "denied", message: "File is outside allowed roots" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns the configured error for empty roots before target I/O", async () => {
    await expect(readBoundedFile({ path: "does-not-exist", allowedRoots: [], maxBytes: 10 }))
      .rejects.toMatchObject({ code: "empty_roots", message: "No allowed roots are configured; set TCO_ALLOWED_ROOTS" });
  });

  it("accepts a filename beginning with .. when it is inside the root", async () => {
    const root = await makeFixture();
    const path = join(root, "..notes.txt");
    await writeFile(path, "ok");
    try {
      await expect(readBoundedFile({ path, allowedRoots: [root], maxBytes: 10 }))
        .resolves.toMatchObject({ bytes: Buffer.from("ok") });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an already oversized file with its exact byte count", async () => {
    const root = await makeFixture();
    const path = join(root, "inside.txt");
    try {
      await expect(readBoundedFile({ path, allowedRoots: [root], maxBytes: 3 }))
        .rejects.toMatchObject({ code: "too_large", size: 5, message: "File exceeds maxBytes limit: 5" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a directory as non-regular", async () => {
    const root = await makeFixture();
    const dir = join(root, "directory");
    await mkdir(dir);
    try {
      await expect(readBoundedFile({ path: dir, allowedRoots: [root], maxBytes: 10 }))
        .rejects.toMatchObject({ code: "non_regular", message: "Path is not a regular file" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("denies an in-root symlink that resolves outside the root", async (ctx) => {
    const root = await makeFixture();
    const outside = await mkdtemp(join(tmpdir(), "read-bounded-outside-"));
    const link = join(root, "link.txt");
    await writeFile(join(outside, "target.txt"), "outside");
    try {
      try {
        await symlink(join(outside, "target.txt"), link);
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) {
          ctx.skip(`symlink capability unavailable: ${(error as NodeJS.ErrnoException).code}`);
        }
        throw error;
      }
      await expect(readBoundedFile({ path: link, allowedRoots: [root], maxBytes: 20 }))
        .rejects.toMatchObject({ code: "denied", message: "File is outside allowed roots" });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

type FakeStat = { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number; isFile: () => boolean };
const fakeStat = (overrides: Partial<FakeStat> = {}): FakeStat => ({
  dev: 1, ino: 2, size: 3, mtimeMs: 4, ctimeMs: 5, isFile: () => true, ...overrides,
});

async function loadReader(overrides: Record<string, unknown>) {
  vi.resetModules();
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.doMock("node:fs/promises", () => ({ ...actual, ...overrides }));
  return import("../src/core/read-bounded-file.js");
}

describe("readBoundedFile deterministic safety matrix", () => {
  it("omits invalid roots, accepts a valid root, and does not perform target I/O for all-invalid roots", async () => {
    const root = resolve("C:/allowed");
    const badRoot = resolve("C:/bad");
    const realpath = vi.fn(async (path: string) => {
      if (path === badRoot) throw Object.assign(new Error(), { code: "ENOENT" });
      return path === root ? root : `${root}/file.txt`;
    });
    const lstat = vi.fn(); const stat = vi.fn(async () => fakeStat());
    const handle = { stat: vi.fn().mockResolvedValue(fakeStat()), read: vi.fn()
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 3, buffer }))
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() };
    const open = vi.fn(async () => handle);
    const reader = await loadReader({ realpath, lstat, stat, open });
    await expect(reader.readBoundedFile({ path: `${root}/file.txt`, allowedRoots: [badRoot, root], maxBytes: 10 })).resolves.toMatchObject({ bytes: Buffer.from([0, 0, 0]) });
    expect(open).toHaveBeenCalled();
    vi.resetModules();
    const deniedRealpath = vi.fn(async () => { throw Object.assign(new Error(), { code: "ENOENT" }); });
    const deniedLstat = vi.fn(async () => { throw Object.assign(new Error(), { code: "ENOENT" }); });
    const deniedOpen = vi.fn(); const deniedStat = vi.fn();
    const denied = await loadReader({ realpath: deniedRealpath, lstat: deniedLstat, stat: deniedStat, open: deniedOpen });
    await expect(denied.readBoundedFile({ path: `${root}/missing`, allowedRoots: [badRoot], maxBytes: 10 })).rejects.toMatchObject({ code: "denied" });
    expect(deniedRealpath).toHaveBeenCalledExactlyOnceWith(badRoot);
    expect(deniedLstat).not.toHaveBeenCalled();
    expect(deniedOpen).not.toHaveBeenCalled(); expect(deniedStat).not.toHaveBeenCalled();
  });

  it.each(["EACCES", "EPERM", "ELOOP", "ENOTDIR"])("denies non-ENOENT lstat error %s", async (code) => {
    const root = resolve("C:/allowed");
    const reader = await loadReader({
      realpath: vi.fn(async (path: string) => { if (path !== root) throw Object.assign(new Error(), { code: "ENOENT" }); return root; }),
      lstat: vi.fn(async () => { throw Object.assign(new Error(), { code }); }), open: vi.fn(), stat: vi.fn(),
    });
    await expect(reader.readBoundedFile({ path: `${root}/missing`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "denied" });
  });

  it.each(["dev", "ino", "size", "mtimeMs", "ctimeMs"])("classifies %s handle-after mismatch as changed", async (field) => {
    const root = resolve("C:/allowed"); const before = fakeStat(); const after = fakeStat({ [field]: 99 });
    const handle = { stat: vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after), read: vi.fn()
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 3, buffer }))
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() };
    const reader = await loadReader({
      realpath: vi.fn(async () => root), stat: vi.fn(async () => before), lstat: vi.fn(), open: vi.fn(async () => handle),
    });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "changed" });
    expect(handle.stat).toHaveBeenCalledTimes(2);
    expect(handle.close).toHaveBeenCalled();

    const stableHandle = { stat: vi.fn().mockResolvedValue(before), read: vi.fn()
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 3, buffer }))
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() };
    const stableReader = await loadReader({
      realpath: vi.fn(async () => root), stat: vi.fn(async () => before), lstat: vi.fn(),
      open: vi.fn(async () => stableHandle),
    });
    await expect(stableReader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 }))
      .resolves.toMatchObject({ bytes: Buffer.from([0, 0, 0]) });
    expect(stableHandle.stat).toHaveBeenCalledTimes(2);
  });

  it.each(["dev", "ino", "size", "mtimeMs", "ctimeMs"])("classifies %s handle-before mismatch before reading", async (field) => {
    const root = resolve("C:/allowed"); const path = fakeStat(); const opened = fakeStat({ [field]: 99 });
    const handle = { stat: vi.fn().mockResolvedValue(opened), read: vi.fn(), close: vi.fn() };
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => path), lstat: vi.fn(), open: vi.fn(async () => handle) });
    const expected = field === "size" ? "too_large" : "changed";
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: expected });
    expect(handle.read).not.toHaveBeenCalled();
  });

  it.each(["dev", "ino", "size", "mtimeMs", "ctimeMs"])("classifies %s path-after mismatch as changed", async (field) => {
    const root = resolve("C:/allowed"); const base = fakeStat(); const changed = fakeStat({ [field]: 99 });
    const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn()
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 3, buffer }))
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() };
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn().mockResolvedValueOnce(base).mockResolvedValueOnce(changed), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "changed" });
  });

  it("does not read after a pre-read snapshot mismatch and suppresses close failure", async () => {
    const root = "C:/allowed"; const pathBefore = fakeStat(); const handleBefore = fakeStat({ ino: 9 });
    const handle = { stat: vi.fn().mockResolvedValue(handleBefore), read: vi.fn(), close: vi.fn().mockRejectedValue(new Error("close")) };
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => pathBefore), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "changed" });
    expect(handle.read).not.toHaveBeenCalled(); expect(handle.close).toHaveBeenCalled();
  });

  it("uses an opened-size-plus-one probe to classify growth, including an empty file", async () => {
    const root = resolve("C:/allowed"); const base = fakeStat({ size: 0 });
    const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn(async (_buffer: Buffer, _offset: number, length: number) => ({ bytesRead: length, buffer: _buffer })), close: vi.fn() };
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "changed" });
    expect(handle.read).toHaveBeenCalledWith(expect.any(Buffer), 0, 1, 0);
  });

  it("denies a broken link whose lstat succeeds and rejects canonical-path drift", async () => {
    const root = resolve("C:/allowed");
    const broken = await loadReader({ realpath: vi.fn(async (path: string) => { if (path === root) return root; throw Object.assign(new Error(), { code: "ENOENT" }); }), lstat: vi.fn(async () => fakeStat()), stat: vi.fn(), open: vi.fn() });
    await expect(broken.readBoundedFile({ path: `${root}/broken`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "denied" });
    const base = fakeStat(); const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn(), close: vi.fn() };
    handle.read = vi.fn()
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 3, buffer }))
      .mockImplementationOnce(async (buffer: Buffer) => ({ bytesRead: 0, buffer }));
    const drift = await loadReader({ realpath: vi.fn().mockResolvedValueOnce(root).mockResolvedValueOnce(`${root}/file`).mockResolvedValueOnce(`${root}/other`).mockResolvedValueOnce(`${root}/file`), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(drift.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "changed" });
  });

  it("performs short reads to EOF using an opened-size-plus-one buffer", async () => {
    const root = resolve("C:/allowed"); const base = fakeStat({ size: 3 }); const calls: number[] = [];
    const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn(async (buffer: Buffer, offset: number, length: number) => {
      calls.push(buffer.length); if (calls.length <= 3) { buffer[offset] = 65 + calls.length - 1; return { bytesRead: 1, buffer }; } return { bytesRead: 0, buffer };
    }), close: vi.fn() };
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).resolves.toMatchObject({ bytes: Buffer.from("ABC") });
    expect(calls).toEqual([4, 4, 4, 4]);
  });

  it("maps pre-stat and handle-before oversize to too_large, but growth to changed", async () => {
    const root = resolve("C:/allowed"); const large = fakeStat({ size: 4 }); const base = fakeStat({ size: 3 });
    const open = vi.fn(); const pre = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => large), lstat: vi.fn(), open });
    await expect(pre.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "too_large", size: 4 });
    expect(open).not.toHaveBeenCalled();
    const handle = { stat: vi.fn().mockResolvedValue(large), read: vi.fn(), close: vi.fn() };
    const opened = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(opened.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "too_large", size: 4 });
    const validMismatch = { stat: vi.fn().mockResolvedValue(fakeStat({ size: 4 })), read: vi.fn(), close: vi.fn() };
    const mismatch = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => validMismatch) });
    await expect(mismatch.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 10 })).rejects.toMatchObject({ code: "changed" });
    const growing = { stat: vi.fn().mockResolvedValueOnce(base).mockResolvedValueOnce(fakeStat({ size: 4 })), read: vi.fn(async (buffer: Buffer) => ({ bytesRead: 4, buffer })), close: vi.fn() };
    const growth = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => growing) });
    await expect(growth.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "changed" });
  });

  it.each(["original", "canonical"])("classifies %s path re-resolution failure as changed", async (kind) => {
    const root = resolve("C:/allowed"); const base = fakeStat({ size: 0 });
    const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() };
    const realpath = kind === "original"
      ? vi.fn().mockResolvedValueOnce(root).mockResolvedValueOnce(`${root}/file`).mockRejectedValueOnce(new Error())
      : vi.fn().mockResolvedValueOnce(root).mockResolvedValueOnce(`${root}/file`).mockResolvedValueOnce(`${root}/file`).mockRejectedValueOnce(new Error());
    const reader = await loadReader({ realpath, stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "changed" });
  });

  it("maps post-read stat and generic I/O failures without leaking details", async () => {
    const root = resolve("C:/allowed"); const base = fakeStat({ size: 0 });
    const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() };
    const postStat = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn().mockResolvedValueOnce(base).mockRejectedValueOnce(new Error("secret")), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(postStat.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "changed", message: "File changed while reading" });
    for (const phase of ["open", "stat", "read", "handleStat"] as const) {
      const failure = new Error("private path"); const fakeHandle = { stat: vi.fn().mockRejectedValue(failure), read: vi.fn().mockRejectedValue(failure), close: vi.fn() };
      const reader = await loadReader({ realpath: vi.fn(async () => root), stat: phase === "stat" ? vi.fn().mockRejectedValue(failure) : vi.fn(async () => base), lstat: vi.fn(), open: phase === "open" ? vi.fn().mockRejectedValue(failure) : vi.fn(async () => ({ ...fakeHandle, stat: phase === "handleStat" ? fakeHandle.stat : vi.fn().mockResolvedValue(base) })) });
      await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "read_failure", message: "File cannot be read" });
    }
  });

  it("suppresses close failure after a successful bytes-plus-EOF read", async () => {
    const root = resolve("C:/allowed"); const base = fakeStat({ size: 0 });
    const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn().mockRejectedValue(new Error("close detail")) };
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).resolves.toMatchObject({ bytes: Buffer.alloc(0) });
  });

  it("rejects a non-regular handle before reading and still closes it", async () => {
    const root = resolve("C:/allowed"); const base = fakeStat(); const handle = { stat: vi.fn().mockResolvedValue({ ...base, isFile: () => false }), read: vi.fn(), close: vi.fn() };
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => handle) });
    await expect(reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "non_regular" });
    expect(handle.read).not.toHaveBeenCalled(); expect(handle.close).toHaveBeenCalled();
  });

  it("uses platform-safe open flags", async () => {
    const root = resolve("C:/allowed"); const base = fakeStat({ size: 0 }); const handle = { stat: vi.fn().mockResolvedValue(base), read: vi.fn(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() }; const open = vi.fn(async (..._args: unknown[]) => handle);
    const reader = await loadReader({ realpath: vi.fn(async () => root), stat: vi.fn(async () => base), lstat: vi.fn(), open });
    await reader.readBoundedFile({ path: `${root}/file`, allowedRoots: [root], maxBytes: 3 });
    const flags = open.mock.calls[0][1] as number;
    expect(flags & (constants.O_WRONLY | constants.O_RDWR)).toBe(0);
    if (process.platform === "win32") expect(flags).toBe(constants.O_RDONLY);
    else expect(flags & ((constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))).toBe((constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  });

  it("detects original and canonical path drift independently", async () => {
    const root = resolve("C:/allowed"); const file = `${root}/file`; const other = `${root}/other`; const base = fakeStat({ size: 0 });
    const make = (paths: string[]) => loadReader({ realpath: vi.fn().mockResolvedValueOnce(root).mockResolvedValueOnce(file).mockResolvedValueOnce(paths[0]).mockResolvedValueOnce(paths[1]), stat: vi.fn(async () => base), lstat: vi.fn(), open: vi.fn(async () => ({ stat: vi.fn().mockResolvedValue(base), read: vi.fn(async (buffer: Buffer) => ({ bytesRead: 0, buffer })), close: vi.fn() })) });
    const original = await make([other, file]); await expect(original.readBoundedFile({ path: file, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "changed" });
    const canonical = await make([file, other]); await expect(canonical.readBoundedFile({ path: file, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "changed" });
  });

  it("does not perform any filesystem calls for empty roots and rejects cross-drive candidates", async () => {
    const calls = { realpath: vi.fn(), lstat: vi.fn(), stat: vi.fn(), open: vi.fn() };
    const reader = await loadReader(calls);
    await expect(reader.readBoundedFile({ path: "C:/file", allowedRoots: [], maxBytes: 3 })).rejects.toMatchObject({ code: "empty_roots" });
    expect(calls.realpath).not.toHaveBeenCalled(); expect(calls.lstat).not.toHaveBeenCalled(); expect(calls.stat).not.toHaveBeenCalled(); expect(calls.open).not.toHaveBeenCalled();
    const cross = await loadReader({ realpath: vi.fn(async (path: string) => path === resolve("C:/allowed") ? resolve("C:/allowed") : resolve("D:/outside")), lstat: vi.fn(), stat: vi.fn(), open: vi.fn() });
    await expect(cross.readBoundedFile({ path: "D:/outside", allowedRoots: ["C:/allowed"], maxBytes: 3 })).rejects.toMatchObject({ code: "denied" });
  });

  it("classifies the allowed root itself as non-regular", async () => {
    const root = await mkdtemp(join(tmpdir(), "read-bounded-root-"));
    try { await expect(readBoundedFile({ path: root, allowedRoots: [root], maxBytes: 3 })).rejects.toMatchObject({ code: "non_regular" }); }
    finally { await rm(root, { recursive: true, force: true }); }
  });

  it("reads a valid file through a Windows junction allowed root when supported", async (ctx) => {
    if (process.platform !== "win32") { ctx.skip("Windows junction test requires win32"); return; }
    const parent = await mkdtemp(join(tmpdir(), "read-bounded-junction-")); const target = join(parent, "target"); const junction = join(parent, "allowed-junction");
    await mkdir(target); const file = join(target, "file.txt"); await writeFile(file, "junction");
    try {
      try {
        await symlink(target, junction, "junction");
      } catch (error) {
        const errno = error as NodeJS.ErrnoException;
        const capabilityCodes = ["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"];
        if (!capabilityCodes.includes(errno.code ?? "")) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`junction capability unavailable: ${errno.code ?? "unknown"}: ${reason}`);
        ctx.skip(`junction capability unavailable: ${errno.code ?? "unknown"}: ${reason}`);
        return;
      }
      await expect(readBoundedFile({ path: join(junction, "file.txt"), allowedRoots: [junction], maxBytes: 20 })).resolves.toMatchObject({ bytes: Buffer.from("junction") });
    } finally { await rm(parent, { recursive: true, force: true }); }
  });
});
