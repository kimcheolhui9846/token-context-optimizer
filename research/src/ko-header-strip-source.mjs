// ko-header-strip: pinned reads of the #153 Git objects (protocol sections 3 and 4.1).
// Build-side reads go through assertBuildAllowed; every read is logged with its blob and SHA-256.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IntegrityError } from "./ko-header-strip-plan.mjs";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoDir = resolve(researchDir, "..");
export const REGISTERED = JSON.parse(readFileSync(join(researchDir, "tools", "ko-header-strip", "registered.json"), "utf8"));
const SRC = REGISTERED.source;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const gitBlobId = (bytes) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
export const git = (args, enc) => execFileSync("git", args, { cwd: repoDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });

const IMG = new RegExp(`^${SRC.imageTree.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/p[0-9]{3}\\.png$`);
const FIXED_ALLOWED = new Set(REGISTERED.buildAllowlist.filter((p) => !p.includes("#")));

/** Throws unless a build-side read is on the registered allowlist. */
export function assertBuildAllowed(path) {
  if (typeof path !== "string" || path.includes("..") || path.includes("\\")) throw new IntegrityError("integrity_pin", `build may not read ${path}`);
  if (FIXED_ALLOWED.has(path) || IMG.test(path)) return path;
  throw new IntegrityError("integrity_pin", `build may not read ${path}`);
}

export function checkCommit() {
  let type = "";
  try { type = git(["cat-file", "-t", SRC.commit], "utf8").trim(); } catch { /* below */ }
  if (type !== "commit") throw new IntegrityError("integrity_pin", `#153 commit ${SRC.commit} missing; run: ${SRC.fetch}`);
}

/** Reader that records every read. `allow` is applied before any Git access. */
export function makeReader(allow) {
  const log = [];
  const readPath = (path, want) => {
    allow(path);
    const blob = git(["rev-parse", `${SRC.commit}:${path}`], "utf8").trim();
    const bytes = git(["cat-file", "blob", blob]);
    if (gitBlobId(bytes) !== blob) throw new IntegrityError("integrity_pin", `${path}: bytes hash to ${gitBlobId(bytes)}, not ${blob}`);
    const sha = sha256(bytes);
    if (want.blob && want.blob !== blob) throw new IntegrityError("integrity_pin", `${path}: blob ${blob} != ${want.blob}`);
    if (want.sha256 && want.sha256 !== sha) throw new IntegrityError("integrity_pin", `${path}: SHA-256 ${sha} != ${want.sha256}`);
    log.push({ path, blob, sha256: sha, bytes: bytes.length });
    return bytes;
  };
  return { log, readPath };
}

/** Pinned file by its registered key (manifest, predictions, freeze, ...). */
export function readPinned(reader, key) {
  const f = SRC.files[key];
  if (!f) throw new IntegrityError("integrity_pin", `no pin ${key}`);
  return reader.readPath(f.path, f);
}

/** The 144 image entries of the pinned tree, checked against the tree id. */
export function imageEntries() {
  const tree = git(["rev-parse", `${SRC.commit}:${SRC.imageTree.path}`], "utf8").trim();
  if (tree !== SRC.imageTree.tree) throw new IntegrityError("integrity_pin", `image tree ${tree} != ${SRC.imageTree.tree}`);
  const out = new Map();
  for (const line of git(["ls-tree", tree], "utf8").split("\n").filter(Boolean)) {
    const m = /^100644 blob ([0-9a-f]{40})\t(p[0-9]{3}\.png)$/.exec(line);
    if (!m) throw new IntegrityError("integrity_pin", `unexpected tree entry ${line}`);
    out.set(m[2], m[1]);
  }
  return out;
}

/** Strict JSONL: LF only, one final newline, no blank lines. */
export function parseJsonl(bytes, name) {
  const s = bytes.toString("utf8");
  if (s.includes("\r") || !s.endsWith("\n") || s.endsWith("\n\n")) throw new IntegrityError("integrity_output", `${name}: not strict LF JSONL`);
  return s.slice(0, -1).split("\n").map((l) => JSON.parse(l));
}

export const expectedIds = (n = 144) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(3, "0")}`);
export function checkIds(rows, name) {
  const ids = rows.map((r) => r.id);
  const want = expectedIds();
  if (new Set(ids).size !== ids.length) throw new IntegrityError("integrity_id", `${name}: duplicate ids`);
  if (ids.length !== want.length || ids.some((id, i) => id !== want[i])) throw new IntegrityError("integrity_id", `${name}: ids are not p000..p143 in order`);
}
