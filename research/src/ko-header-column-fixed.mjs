// ko-header-column: adapter to the fixed objects (protocol research/plans/2026-11-25-ko-header-column-protocol.md, 4.1).
// The #147 library blob (K0/K1, scoreKey), the #150 W1, #151 W2 and #152 W3 library blobs are written byte for byte
// to a Git-ignored cache and imported from there. K0/K1/W1/W2/W3 are not re-implemented here.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIXED = {
  k1Commit: "c0c2f5dd4178df3e02595176525cf88b2eaf68c2", // #147 head
  lib: { commit: "c0c2f5dd4178df3e02595176525cf88b2eaf68c2", path: "research/src/ko-ocr-factorial-lib.mjs", blob: "d882b6640fcafabcc62e14ebfd571749d88f4bf6", sha256: "bb1d5eb608494e7f99113c11deb5085cade5bb1c67e5894122eb641af94882a0", file: "ko-ocr-factorial-lib" },
  run: { commit: "c0c2f5dd4178df3e02595176525cf88b2eaf68c2", path: "research/src/ko-ocr-factorial-run.mjs", blob: "3ddf60ab02c4195dc0441ea6d8959de52373cafc", sha256: "e6894c9e240c165b7bf28544d9f760e8844ea14c51b7314ce8d961e53cf808aa" },
  selector: { path: "research/src/selector.mjs", blob: "b3b4965b2d330907c0143fe178013aace1be8372", sha256: "a489824ffdffe2df115c8211698d8bf5996bddde250f4e188550f82b87b77db9" },
  w1Commit: "b108e2f0983bf096b4ddfc5d204a4d99cd6d8535", // #150 head
  w1: { commit: "b108e2f0983bf096b4ddfc5d204a4d99cd6d8535", path: "research/src/ko-row-window-lib.mjs", blob: "6c23fc168ccdd833d87a7fc095005e0b71b64638", sha256: "47843d641b9f3dc1706c354fc671274ea0f13984f4534809a540cc4eaf8471d3", file: "ko-row-window-lib" },
  w2Commit: "d75f54555101125a35dc8aeac8c06e5b29929593", // #151 head
  w2: { commit: "d75f54555101125a35dc8aeac8c06e5b29929593", path: "research/src/ko-row-height-lib.mjs", blob: "c2b0ad873bc6e149c4daf805df085f67bf3e26d6", sha256: "71be99cc91f7d67acb6afa9f37ede47871f57656b3d3cda8ccb5405c29b645a3", file: "ko-row-height-lib" },
  w3Commit: "6865828f7f3d723243d03bea1cafad6c74af5682", // #152 head
  w3: { commit: "6865828f7f3d723243d03bea1cafad6c74af5682", path: "research/src/ko-row-gate-lib.mjs", blob: "fcf06458a360c8977c596cff465a7ad1b7b1867c", sha256: "a3fb4b70f9f4ef80110d8b9f1aeb3bb4e1810f39150f7e901ce5a242bbbcf547", file: "ko-row-gate-lib" },
};
export const FIXED_DIR = join(researchDir, ".cache", "ko-header-column", "fixed");

const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
export const gitBlobId = (bytes) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** Bytes of a fixed blob, checked against its commit path and the recomputed blob id. */
export function fixedBlob({ commit, path, blob, sha256: want }) {
  let type = "";
  try { type = git(["cat-file", "-t", commit], "utf8").trim(); } catch { /* reported below */ }
  if (type !== "commit") throw new Error(`fixed commit ${commit} is missing; fetch it (git fetch origin pull/147/head pull/150/head pull/151/head pull/152/head)`);
  const atPath = git(["rev-parse", `${commit}:${path}`], "utf8").trim();
  if (atPath !== blob) throw new Error(`${path} at ${commit} is blob ${atPath}, not ${blob}`);
  const bytes = git(["cat-file", "blob", blob]);
  if (gitBlobId(bytes) !== blob) throw new Error(`${path}: bytes hash to blob ${gitBlobId(bytes)}, not ${blob}`);
  if (want && sha256(bytes) !== want) throw new Error(`${path}: SHA-256 ${sha256(bytes)} != ${want}`);
  return bytes;
}

/** Throws unless the file's bytes are the given blob. Returns the blob id. */
export function verifyFixedFile(file, blob) {
  const id = gitBlobId(readFileSync(file));
  if (id !== blob) throw new Error(`${file} is blob ${id}, not the fixed blob ${blob}`);
  return id;
}

/** Write a fixed library blob ("lib" = #147, "w1" = #150, "w2" = #151, "w3" = #152) to the cache, always from Git, and re-check the written bytes. */
export function extractFixed(name) {
  const spec = FIXED[name];
  if (!spec || !spec.file) throw new Error(`unknown fixed library ${name}`);
  const bytes = fixedBlob(spec);
  if (spec.sha256 && sha256(bytes) !== spec.sha256) throw new Error(`${spec.path}: SHA-256 ${sha256(bytes)} != ${spec.sha256}`);
  mkdirSync(FIXED_DIR, { recursive: true });
  const file = join(FIXED_DIR, `${spec.file}.${spec.blob}.mjs`);
  if (!existsSync(file) || gitBlobId(readFileSync(file)) !== spec.blob) writeFileSync(file, bytes);
  verifyFixedFile(file, spec.blob);
  return file;
}

const loaded = {};
/** The fixed #147 library module (keyResults, scoreKey, checkLangFiles, compareRows, sha256, jsonl, parseJsonl, ...). */
export async function loadFixedLib() {
  loaded.lib ??= await import(pathToFileURL(extractFixed("lib")).href);
  return loaded.lib;
}
/** The fixed #150 W1 library module (w1Rule, ValidationError, ...). */
export async function loadFixedW1() {
  loaded.w1 ??= await import(pathToFileURL(extractFixed("w1")).href);
  return loaded.w1;
}
/** The fixed #151 W2 library module (w2Rule, buildPrediction, validatePrediction, exposure, ValidationError, ...). */
export async function loadFixedW2() {
  loaded.w2 ??= await import(pathToFileURL(extractFixed("w2")).href);
  return loaded.w2;
}
/** The fixed #152 W3 library module (w3Rule with scan.units, buildPrediction, validatePrediction, questionTypes, squash, ...). */
export async function loadFixedW3() {
  loaded.w3 ??= await import(pathToFileURL(extractFixed("w3")).href);
  return loaded.w3;
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
