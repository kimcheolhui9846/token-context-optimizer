// FCP: shared pre-measurement checks of the frozen selector input (protocol sections 5-6). Reads only
// freeze-manifest.json (hash strings) and selector-input/; never the oracle folder.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { assertInputPath, pngIhdr } from "./mcp-view-comparison-lib.mjs";
import { IMAGE_COUNT, SELECTOR_INPUT_FILES, sha256 } from "./fcp-lib.mjs";

/** File committed at HEAD and unchanged in the working copy (same rule as runCodeState). */
export function committedFile(path) {
  const dir = dirname(resolve(path));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let prefix;
  try { prefix = git("rev-parse", "--show-prefix").trim(); } catch { return { commit: null, head: null, work: null, status: "not a git work tree", clean: false }; }
  let head = null;
  try { head = git("rev-parse", "--verify", "--quiet", `HEAD:${prefix}${basename(path)}`).trim() || null; } catch { head = null; }
  const work = git("hash-object", resolve(path)).trim();
  const status = git("status", "--porcelain", "--untracked-files=all", "--", basename(path)).replace(/\n$/, "");
  return { commit: git("rev-parse", "HEAD").trim(), head, work, status, clean: head !== null && head === work && status === "" };
}

/**
 * Verifies the frozen selector input against the committed freeze manifest and returns
 * { manifestSha, manifestBlob, questions, index, images: [{ id, file, path, page, sha256, ... }], check }.
 * Throws on any difference. allowUncommitted only for non-measurement checks.
 */
export function loadSelectorInput(frozenDir, { allowUncommitted = false } = {}) {
  const manifestPath = join(frozenDir, "freeze-manifest.json");
  const state = committedFile(manifestPath);
  if (!state.clean && !allowUncommitted) throw new Error("freeze-manifest.json is not committed unchanged at HEAD");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const sel = join(frozenDir, "selector-input");
  assertInputPath(sel);
  const top = readdirSync(sel).sort();
  if (top.join() !== SELECTOR_INPUT_FILES.join()) throw new Error(`selector-input entries not allowed: ${top.join(",")}`);
  const read = (rel) => {
    assertInputPath(rel);
    const bytes = readFileSync(join(sel, rel));
    const want = manifest.files[`selector-input/${rel}`];
    if (!want || sha256(bytes) !== want) throw new Error(`selector-input/${rel} differs from the freeze manifest`);
    return bytes;
  };
  const questions = JSON.parse(read("questions.json").toString("utf8")).questions;
  const index = JSON.parse(read("index.json").toString("utf8")).images;
  const names = readdirSync(join(sel, "images")).sort();
  const registered = Object.keys(manifest.files).filter((k) => k.startsWith("selector-input/images/")).map((k) => k.slice("selector-input/images/".length)).sort();
  if (names.join() !== registered.join() || names.length !== IMAGE_COUNT) throw new Error("selector-input/images does not hold exactly the registered files");
  if (questions.map((q) => q.id).join() !== index.map((i) => i.id).join()) throw new Error("questions and index ids differ");
  if (new Set(index.map((i) => i.id)).size !== IMAGE_COUNT) throw new Error("ids are not distinct");
  const images = index.map((im) => {
    const q = questions.find((x) => x.id === im.id);
    if (q.file !== im.file || im.file !== `${im.id}.png`) throw new Error(`file of ${im.id}`);
    const bytes = read(`images/${im.file}`);
    if (sha256(bytes) !== im.sha256) throw new Error(`index SHA of ${im.id}`);
    const h = pngIhdr(bytes);
    if (h.bitDepth !== 8 || h.colorType !== 0 || h.interlace !== 0 || h.width !== im.page.width || h.height !== im.page.height) throw new Error(`PNG format ${im.id}`);
    return { ...im, question: q.question, path: join(sel, "images", im.file) };
  });
  const tally = (f) => images.reduce((o, im) => ((o[f(im)] = (o[f(im)] || 0) + 1), o), {});
  const byLangAnchor = tally((im) => `${im.lang}|${im.anchor}`);
  if (Object.keys(byLangAnchor).sort().join() !== "en|code,en|nl,ko|code,ko|nl" || Object.values(byLangAnchor).some((n) => n !== 12)) throw new Error(`language x anchor ${JSON.stringify(byLangAnchor)}`);
  const pairs = tally((im) => im.pairId);
  if (Object.keys(pairs).length !== 24 || Object.values(pairs).some((n) => n !== 2)) throw new Error("expected 24 EN/KO pairs");
  return {
    manifestSha: sha256(manifestBytes),
    manifestBlob: state.work,
    manifestCommitted: state.clean,
    questions,
    images,
    check: { images: images.length, pairs: 24, byLangAnchor: Object.fromEntries(Object.entries(byLangAnchor).sort()), filesChecked: 2 + images.length },
  };
}
