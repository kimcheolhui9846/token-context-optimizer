// ko-row-window: adapter to the fixed #147 objects (protocol research/plans/2026-11-24-ko-row-window-protocol.md, 4.1).
// The #147 library blob is written byte for byte to a Git-ignored cache and imported from there; K0/K1 are not re-implemented.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXED = {
  commit: "c0c2f5dd4178df3e02595176525cf88b2eaf68c2", // #147 head
  lib: { path: "research/src/ko-ocr-factorial-lib.mjs", blob: "d882b6640fcafabcc62e14ebfd571749d88f4bf6" },
  run: { path: "research/src/ko-ocr-factorial-run.mjs", blob: "3ddf60ab02c4195dc0441ea6d8959de52373cafc" },
  selector: { path: "research/src/selector.mjs", blob: "b3b4965b2d330907c0143fe178013aace1be8372" },
};
export const FIXED_DIR = join(researchDir, ".cache", "ko-row-window", "fixed");

const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
export const gitBlobId = (bytes) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");

/** Bytes of a fixed #147 blob, checked against the commit path and the recomputed blob id. */
export function fixedBlob({ path, blob }) {
  let type = "";
  try { type = git(["cat-file", "-t", FIXED.commit], "utf8").trim(); } catch { /* reported below */ }
  if (type !== "commit") throw new Error(`#147 commit ${FIXED.commit} is missing; run: git fetch origin pull/147/head`);
  const atPath = git(["rev-parse", `${FIXED.commit}:${path}`], "utf8").trim();
  if (atPath !== blob) throw new Error(`${path} at #147 is blob ${atPath}, not ${blob}`);
  const bytes = git(["cat-file", "blob", blob]);
  if (gitBlobId(bytes) !== blob) throw new Error(`${path}: bytes hash to blob ${gitBlobId(bytes)}, not ${blob}`);
  return bytes;
}

/** Throws unless the file's bytes are the fixed #147 library blob. Returns the blob id. */
export function verifyFixedFile(file) {
  const id = gitBlobId(readFileSync(file));
  if (id !== FIXED.lib.blob) throw new Error(`${file} is blob ${id}, not the fixed blob ${FIXED.lib.blob}`);
  return id;
}

/** Write the fixed library blob to the cache (always from Git) and re-check the written bytes. */
export function extractFixedLib() {
  const bytes = fixedBlob(FIXED.lib);
  mkdirSync(FIXED_DIR, { recursive: true });
  const file = join(FIXED_DIR, `ko-ocr-factorial-lib.${FIXED.lib.blob}.mjs`);
  if (!existsSync(file) || gitBlobId(readFileSync(file)) !== FIXED.lib.blob) writeFileSync(file, bytes);
  verifyFixedFile(file);
  return file;
}

let cached = null;
/** The fixed #147 library module (keyResults, scoreKey, checkLangFiles, compareRows, sha256, jsonl, ...). */
export async function loadFixedLib() {
  if (!cached) cached = await import(pathToFileURL(extractFixedLib()).href);
  return cached;
}

/** The selector file in the work tree must be the fixed blob (git hash-object: the checked-in form). */
export function checkSelectorFile() {
  const id = git(["hash-object", join(researchDir, "src", "selector.mjs")], "utf8").trim();
  if (id !== FIXED.selector.blob) throw new Error(`selector.mjs is blob ${id}, not ${FIXED.selector.blob}`);
  return id;
}

/** Text (LF) of the fixed #147 runner. */
export const fixedRunSource = () => fixedBlob(FIXED.run).toString("utf8").replace(/\r\n/g, "\n");

/**
 * Source text of a top-level `async function <name>(`, `function <name>(` or `const <name> = ` definition, from its first
 * character to the brace that closes its body (plus a trailing `;`). Used to prove the runner's OCR functions are the fixed ones.
 */
export function functionSource(text, name) {
  const src = String(text).replace(/\r\n/g, "\n");
  let at = -1;
  for (const s of [`async function ${name}(`, `function ${name}(`, `const ${name} = `]) {
    const i = src.indexOf(`\n${s}`);
    if (i >= 0) { at = i + 1; break; }
  }
  if (at < 0) return "";
  const open = src.indexOf("{", at); // the parameters of the three functions contain no brace
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(at, src[i + 1] === ";" ? i + 2 : i + 1);
    }
  }
  return "";
}
