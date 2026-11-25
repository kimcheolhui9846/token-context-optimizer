// ko-blind-reader: adapter to the pinned #153 and #154 code (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, section 3).
// Each pinned blob is read with `git cat-file`, checked against its commit path, blob id and SHA-256, written byte for byte
// to a Git-ignored cache and imported from there. Nothing of K0/K1/W1-W5 is re-implemented here.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REG = JSON.parse(readFileSync(join(researchDir, "tools", "ko-blind-reader", "registered.json"), "utf8"));
export const FIXED_CODE = REG.fixed.code;
export const CACHE = join(researchDir, ".cache", "ko-blind-reader", "fixed");

export const git = (args, enc) => execFileSync("git", args, { cwd: researchDir, encoding: enc, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export const gitBlobId = (bytes) => createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");

/** Bytes of a pinned Git object path, checked against the blob id (re-hashed) and SHA-256 when given. */
export function pinnedBytes({ commit, path, blob, sha256: want }) {
  let type = "";
  try { type = git(["cat-file", "-t", commit], "utf8").trim(); } catch { /* below */ }
  if (type !== "commit") throw new Error(`pinned commit ${commit.slice(0, 12)} is missing; run: ${REG.fixed.fetch}`);
  const at = git(["rev-parse", `${commit}:${path}`], "utf8").trim();
  if (at !== blob) throw new Error(`${path} at ${commit.slice(0, 12)} is ${at}, not ${blob}`);
  const bytes = git(["cat-file", "blob", blob]);
  if (gitBlobId(bytes) !== blob) throw new Error(`${path}: bytes hash to another blob id`);
  if (want && sha256(bytes) !== want) throw new Error(`${path}: SHA-256 differs from the pin`);
  return bytes;
}

/** Tree entries {name -> blob id} of a pinned tree. */
export function pinnedTree({ commit, path, tree }) {
  const at = git(["rev-parse", `${commit}:${path}`], "utf8").trim();
  if (at !== tree) throw new Error(`${path} at ${commit.slice(0, 12)} is tree ${at}, not ${tree}`);
  return new Map(git(["ls-tree", "--full-tree", tree], "utf8").trim().split("\n").map((l) => { const [meta, name] = l.split("\t"); return [name, meta.split(" ")[2]]; }));
}

function extract(name, sub) {
  const spec = FIXED_CODE[name];
  const bytes = pinnedBytes(spec);
  const base = spec.path.split("/").pop().replace(/\.mjs$/, "");
  const dir = join(CACHE, sub, "src");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${base}.${spec.blob}.mjs`);
  if (!existsSync(file) || gitBlobId(readFileSync(file)) !== spec.blob) writeFileSync(file, bytes);
  if (gitBlobId(readFileSync(file)) !== spec.blob) throw new Error(`${file} is not the pinned blob`);
  return file;
}

/** The work tree selector.mjs must be the pinned blob (git hash-object: checked-in form). */
export function checkSelectorFile() {
  const id = git(["hash-object", join(researchDir, "src", "selector.mjs")], "utf8").trim();
  if (id !== FIXED_CODE.selector.blob) throw new Error("selector.mjs is not the pinned blob");
  return id;
}

let loaded = null;
/** All pinned functions: #153 lib and fixed loaders (K1 #147, W1 #150, W2 #151, W3 #152), #154 plan and PNG, K0 selector. */
export async function loadFixed() {
  if (loaded) return loaded;
  const f153 = await import(pathToFileURL(extract("fixed153", "pr153")).href);
  const lib153 = await import(pathToFileURL(extract("lib153", "pr153")).href);
  const plan154 = await import(pathToFileURL(extract("plan154", "pr154")).href);
  const png154 = await import(pathToFileURL(extract("png154", "pr154")).href);
  const k1 = await f153.loadFixedLib();
  const w1 = await f153.loadFixedW1();
  const w2lib = await f153.loadFixedW2();
  const w3lib = await f153.loadFixedW3();
  checkSelectorFile();
  const { selectWindow } = await import(pathToFileURL(join(researchDir, "src", "selector.mjs")).href);
  const run153Source = pinnedBytes(FIXED_CODE.run153).toString("utf8").replace(/\r\n/g, "\n");
  loaded = {
    buildPrediction: lib153.buildPrediction, w4Rule: lib153.w4Rule, parseExact: lib153.parseExact, validatePrediction: lib153.validatePrediction, ValidationError: lib153.ValidationError,
    keyResults: k1.keyResults, checkLangFiles: k1.checkLangFiles, jsonl: k1.jsonl, parseJsonl: k1.parseJsonl, k1sha256: k1.sha256,
    w1Rule: w1.w1Rule, w2lib, w3lib, selectWindow,
    project: plan154.project, plan: plan154.plan, compose: plan154.compose, crop: plan154.crop, ContractError: plan154.ContractError, IntegrityError: plan154.IntegrityError,
    decodeGray: png154.decodeGray, encodeGray: png154.encodeGray, pixelSha256: png154.pixelSha256, sharpVersions: png154.sharpVersions,
    functionSource: f153.functionSource, fixedRunSource: f153.fixedRunSource, run153Source,
    blobs: Object.fromEntries(Object.entries(FIXED_CODE).map(([k, v]) => [k, v.blob])),
  };
  return loaded;
}
