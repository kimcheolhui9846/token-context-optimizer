// Crop padding replay runner (protocol sections 5-8). Usage:
//   node src/crop-padding-replay-run.mjs --input <prep>/input --original-sha <prep>/original-sha.json --out <new dir> [--bundle <mjs>] [--tmp <dir>]
// <prep> comes from `node src/mcp-view-comparison-prepare.mjs --stage originals --out <prep>` (#141 preparer, base 41fc769).
// Reads only the input folder (assignment.json, questions.json, images/original/), the original SHA table, Git blob ids
// and the base-commit R09 freeze manifest, and the bundle. Never reads gold, scores or #141 results.
// For each padding it starts a fresh stdio bundle process over a fresh, empty allowed root.
// Writes raw.jsonl, conditions.jsonl, input-check.json (deterministic) and run-meta.json (timing, environment).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BASE_COMMIT, assertInputPath, checkPairs, pngIhdr, sha256, verifyFrozenInputs } from "./mcp-view-comparison-lib.mjs";
import { BUNDLE_BLOB, FROZEN_LIB_BLOB, FROZEN_LIB_PATH, PADDINGS, PRODUCT_COMMIT, initFailedRow, keyOf, padRequest, runCropRow } from "./crop-padding-replay-lib.mjs";
import { minimalEnv, startServer } from "./crop-padding-replay-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const input = arg("--input");
const shaFile = arg("--original-sha");
const out = arg("--out");
const bundle = resolve(arg("--bundle") ?? join(here, "..", "..", "bin", "token-context-optimizer.mjs"));
const tmpBase = arg("--tmp") ?? tmpdir();
if (!/node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "") && !process.argv.includes("--allow-no-guard")) throw new Error("offline guard missing: set NODE_OPTIONS=--require=<tools/d03/guard/node-netguard.cjs> (or pass --allow-no-guard for a non-measurement check)");
if (!input || !shaFile || !out) throw new Error("--input, --original-sha and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
assertInputPath(input);
assertInputPath(shaFile);
const git = (args, enc = "utf8") => execFileSync("git", args, { cwd: here, encoding: enc, maxBuffer: 64 * 1024 * 1024 });

// ---------------------------------------------------------------- code identity (before reading inputs)
const libBlob = git(["hash-object", join(here, "mcp-view-comparison-lib.mjs")]).trim();
if (libBlob !== FROZEN_LIB_BLOB) throw new Error(`frozen library blob ${libBlob} is not ${FROZEN_LIB_BLOB}`);
if (git(["rev-parse", `${PRODUCT_COMMIT}:${FROZEN_LIB_PATH}`]).trim() !== FROZEN_LIB_BLOB) throw new Error("frozen library differs at the product commit");
const bundleBlob = git(["hash-object", bundle]).trim();
if (bundleBlob !== BUNDLE_BLOB) throw new Error(`bundle blob ${bundleBlob} is not the registered ${BUNDLE_BLOB}`);
if (git(["rev-parse", `${PRODUCT_COMMIT}:bin/token-context-optimizer.mjs`]).trim() !== BUNDLE_BLOB) throw new Error("bundle differs at the product commit");

// ---------------------------------------------------------------- input folder allow-list and frozen inputs
const top = readdirSync(input).sort();
for (const name of top) assertInputPath(name);
if (top.join() !== "assignment.json,images,questions.json") throw new Error(`input entries not allowed: ${top.join(",")}`);
if (readdirSync(join(input, "images")).join() !== "original") throw new Error("images/ must hold only original/");
const readInput = (...parts) => readFileSync(join(input, ...parts.map(assertInputPath)));
const assignment = JSON.parse(readInput("assignment.json").toString("utf8"));
const questionsBytes = readInput("questions.json");
const originalSha = JSON.parse(readFileSync(shaFile, "utf8"));
const frozenInputs = verifyFrozenInputs({ assignment, questionsBytes, expectedOriginal: originalSha });

const H = "research/results/r09-bilingual/heldout";
const freeze = JSON.parse(git(["cat-file", "blob", git(["rev-parse", `${BASE_COMMIT}:${H}/freeze-manifest.json`]).trim()]));
const questions = JSON.parse(questionsBytes.toString("utf8")).questions;
const images = assignment.images;
const ids = images.map((im) => im.id);

// ---------------------------------------------------------------- independent pre-run checks (section 5)
if (ids.length !== 48 || new Set(ids).size !== 48) throw new Error(`expected 48 distinct ids, got ${ids.length}`);
if (checkPairs(images) !== 24) throw new Error("expected 24 pairs");
const tally = (f) => images.reduce((o, im) => ((o[f(im)] = (o[f(im)] || 0) + 1), o), {});
const byLangAnchor = tally((im) => `${im.lang}|${im.anchor}`);
if (Object.keys(byLangAnchor).sort().join() !== "en|code,en|nl,ko|code,ko|nl" || Object.values(byLangAnchor).some((n) => n !== 12)) throw new Error(`language x anchor denominators ${JSON.stringify(byLangAnchor)}`);
if (questions.map((q) => q.id).join() !== ids.join()) throw new Error("questions and assignment ids differ");
if (Object.keys(assignment.caller).sort().join() !== ids.slice().sort().join()) throw new Error("caller ids differ from the assignment");
if (Object.keys(originalSha).sort().join() !== ids.slice().sort().join()) throw new Error("original SHA table ids differ from the assignment");
const names = readdirSync(join(input, "images", "original")).sort();
if (names.join() !== ids.map((id) => `${id}.png`).sort().join()) throw new Error(`images/original does not hold exactly the ${ids.length} assigned files`);
const inputCheck = { product: PRODUCT_COMMIT, base: BASE_COMMIT, bundleBlob, frozenLibBlob: libBlob, frozenInputs, ids: ids.length, pairs: 24, byLangAnchor: Object.fromEntries(Object.entries(byLangAnchor).sort()), matched: 0, unmatched: 0, images: {} };
for (const im of images) {
  const q = questions.find((x) => x.id === im.id);
  if (q.file !== `${im.id}.png`) throw new Error(`question file ${im.id}`);
  const registered = freeze.inputs[`images/${q.file}`];
  if (!registered || originalSha[im.id] !== registered) throw new Error(`original SHA of ${im.id} differs from the R09 freeze manifest`);
  const bytes = readInput("images", "original", `${im.id}.png`);
  if (sha256(bytes) !== originalSha[im.id]) throw new Error(`original bytes of ${im.id} differ from the SHA table`);
  const h = pngIhdr(bytes);
  if (h.bitDepth !== 8 || h.colorType !== 0 || h.interlace !== 0 || h.width !== im.page.width || h.height !== im.page.height) throw new Error(`original format ${im.id}`);
  const c = assignment.caller[im.id];
  padRequest(c, im.page, 0); // throws on an illegal band or a band without match
  inputCheck[c.matched ? "matched" : "unmatched"]++;
  inputCheck.images[im.id] = { originalSha256: originalSha[im.id], freezeManifest: "match", width: h.width, height: h.height, ihdr: "bd8 ct0 il0", intent: c.matched ? "matched" : "unmatched" };
}
if (inputCheck.matched !== 36 || inputCheck.unmatched !== 12) throw new Error(`expected 36 matched and 12 unmatched, got ${inputCheck.matched}/${inputCheck.unmatched}`);

// ---------------------------------------------------------------- conditions
mkdirSync(out, { recursive: true });
const started = Date.now();
const rows = [];
const condLines = [];
const timing = [];
const guardOptions = process.env.NODE_OPTIONS ?? "";
for (const p of PADDINGS) {
  const t0 = Date.now();
  const root = mkdtempSync(join(tmpBase, "cpr-root-"));
  try {
    if (readdirSync(root).length) throw new Error("allowed root not empty");
    for (const im of images) copyFileSync(join(input, "images", "original", `${im.id}.png`), join(root, `${im.id}.png`));
    const env = { ...minimalEnv(), TCO_ALLOWED_ROOTS: root };
    if (guardOptions) env.NODE_OPTIONS = guardOptions;
    if (process.env.D03_NET_LOG) env.D03_NET_LOG = process.env.D03_NET_LOG;
    if (process.env.D03_STEP !== undefined) env.D03_STEP = `${process.env.D03_STEP}:p${p}`;
    const client = await startServer({ command: process.execPath, args: [bundle], env });
    const tools = client.initOk ? await client.listTools() : null;
    for (const im of images) {
      const caller = assignment.caller[im.id];
      const base = { key: keyOf(p, im.id), p, id: im.id, pairId: im.pairId, lang: im.lang, anchor: im.anchor, doctype: im.doctype, layout: im.layout, band: caller.band, page: im.page };
      const row = client.initOk
        ? await runCropRow({ client, p, image: { id: im.id, file: join(root, `${im.id}.png`), page: im.page, expectedSha: originalSha[im.id] }, caller, allowedRoot: root })
        : initFailedRow({ caller, page: im.page, p });
      rows.push({ ...base, ...row });
    }
    const counts = client.counts();
    const exit = await client.close();
    condLines.push({ p, initialize: client.initOk ? "ok" : "failed", serverInfo: client.serverInfo, toolsList: tools, mcpRequests: counts.requests, mcpResponses: counts.responses, notifications: counts.notifications, initializeRequests: counts.initialize, toolsListRequests: counts.toolsList, toolCalls: counts.toolCalls, exit: { code: exit.code, signal: exit.signal }, stderrBytes: exit.stderrBytes, stderrSha256: exit.stderrSha256 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  timing.push({ p, ms: Date.now() - t0 });
  console.log(`p${p}: ${rows.filter((r) => r.p === p && r.outcome === "ok").length}/${images.length} ok`);
}
const keys = rows.map((r) => r.key);
if (keys.length !== 192 || new Set(keys).size !== 192) throw new Error(`expected 192 distinct keys, got ${keys.length}`);

writeFileSync(join(out, "raw.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
writeFileSync(join(out, "conditions.jsonl"), `${condLines.map((c) => JSON.stringify(c)).join("\n")}\n`);
writeFileSync(join(out, "input-check.json"), `${JSON.stringify(inputCheck, null, 1)}\n`);
writeFileSync(join(out, "run-meta.json"), `${JSON.stringify({
  node: process.version, platform: `${process.platform}-${process.arch}`, sharp: sharp.versions.sharp, vips: sharp.versions.vips,
  runnerCommit: git(["rev-parse", "HEAD"]).trim(), runnerTreeClean: git(["status", "--porcelain", "--", "src"]).trim() === "",
  bundleBlob, bundleWorkingCopySha256: sha256(readFileSync(bundle)), bundleWorkingCopyBytes: statSync(bundle).size,
  offlineGuard: /node-netguard\.cjs/.test(guardOptions), startedAt: new Date(started).toISOString(), totalMs: Date.now() - started, timing,
}, null, 1)}\n`);
