// Product MCP view comparison runner (protocol sections 5-7). Usage:
//   node src/mcp-view-comparison-run.mjs --input <isolated input dir> --out <new dir> [--bundle <bin/...mjs>] [--tmp <dir>]
// Reads only the isolated input folder (assignment.json, questions.json, expected-sha.json, images/{original,rgb}/)
// and the bundle. For each of the 12 cells it starts a fresh stdio bundle process over a fresh, empty allowed root.
// Writes raw.jsonl (one row per key), cells.jsonl (one line per cell), input-check.json (all deterministic) and
// run-meta.json (timing and environment, not deterministic). Public records hold no paths, pixels or credentials.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BUNDLE_BLOB, CELLS, REPS, assertInputPath, buildKeys, cellOf, checkKeys, checkPairs, compareGrayRgb, keyOf, pngChunks, pngIhdr, sha256 } from "./mcp-view-comparison-lib.mjs";
import { minimalEnv, startServer } from "./mcp-view-comparison-client.mjs";
import { initFailedRow, runRow } from "./mcp-view-comparison-paths.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const input = arg("--input");
const out = arg("--out");
const bundle = resolve(arg("--bundle") ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "token-context-optimizer.mjs"));
const tmpBase = arg("--tmp") ?? tmpdir();
if (!/node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "") && !process.argv.includes("--allow-no-guard")) throw new Error("offline guard missing: set NODE_OPTIONS=--require=<tools/d03/guard/node-netguard.cjs> (or pass --allow-no-guard for a non-measurement check)");
if (!input || !out) throw new Error("--input and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);

// ---------------------------------------------------------------- input folder allow-list
const TOP = ["assignment.json", "expected-sha.json", "images", "questions.json"];
const top = readdirSync(input).sort();
for (const name of top) assertInputPath(name);
if (top.join() !== TOP.join()) throw new Error(`input entries not allowed: ${top.filter((n) => !TOP.includes(n)).join(",") || "(missing entries)"}`);
const readInput = (...parts) => readFileSync(join(input, ...parts.map(assertInputPath)));
const assignment = JSON.parse(readInput("assignment.json").toString("utf8"));
const expected = JSON.parse(readInput("expected-sha.json").toString("utf8"));
const questions = JSON.parse(readInput("questions.json").toString("utf8")).questions;
const images = assignment.images;
const ids = images.map((im) => im.id);

// ---------------------------------------------------------------- pre-run checks (any failure stops before a server starts)
checkPairs(images);
checkKeys(buildKeys(ids), ids);
if (questions.map((q) => q.id).join() !== ids.join()) throw new Error("questions and assignment ids differ");
const imgDirs = readdirSync(join(input, "images")).sort();
if (imgDirs.join() !== REPS.slice().sort().join()) throw new Error(`images/ entries not allowed: ${imgDirs.join(",")}`);
const inputCheck = { ids: ids.length, images: {} };
for (const rep of REPS) {
  const names = readdirSync(join(input, "images", rep)).sort();
  const want = ids.map((id) => `${id}.png`).sort();
  if (names.join() !== want.join()) throw new Error(`images/${rep} does not hold exactly the ${ids.length} assigned files`);
}
for (const im of images) {
  const gray = readInput("images", "original", `${im.id}.png`);
  const rgb = readInput("images", "rgb", `${im.id}.png`);
  if (sha256(gray) !== expected.original[im.id]) throw new Error(`original sha mismatch ${im.id}`);
  if (sha256(rgb) !== expected.rgb[im.id]) throw new Error(`rgb sha mismatch ${im.id}`);
  const gh = pngIhdr(gray);
  if (gh.bitDepth !== 8 || gh.colorType !== 0 || gh.width !== im.page.width || gh.height !== im.page.height) throw new Error(`original format changed ${im.id}`);
  const rh = pngIhdr(rgb);
  const rgbChunks = [...new Set(pngChunks(rgb).map((c) => c.type))];
  if (rh.bitDepth !== 8 || rh.colorType !== 2 || rh.interlace !== 0 || rgbChunks.join() !== "IHDR,IDAT,IEND") throw new Error(`rgb format ${im.id}`);
  const cmp = compareGrayRgb(gray, rgb);
  if (!cmp.ok) throw new Error(`rgb pixels differ from the original ${im.id}: ${cmp.code}`);
  inputCheck.images[im.id] = { originalSha256: expected.original[im.id], rgbSha256: expected.rgb[im.id], width: gh.width, height: gh.height, originalIhdr: { bitDepth: gh.bitDepth, colorType: gh.colorType }, rgbIhdr: { bitDepth: rh.bitDepth, colorType: rh.colorType }, rgbChunks, pixelCheck: "equal" };
}

// Bundle identity: Git blob id (line-ending independent), checked before any run.
const bundleBlob = execFileSync("git", ["hash-object", bundle], { cwd: dirname(bundle), encoding: "utf8" }).trim();
if (bundleBlob !== BUNDLE_BLOB) throw new Error(`bundle blob ${bundleBlob} is not the registered ${BUNDLE_BLOB}`);
inputCheck.bundleBlob = bundleBlob;

// ---------------------------------------------------------------- cells
mkdirSync(out, { recursive: true });
const started = Date.now();
const rows = [];
const cellLines = [];
const timing = [];
const guardOptions = process.env.NODE_OPTIONS ?? "";
for (const { rep, profile, view } of CELLS) {
  const cell = cellOf(rep, profile, view);
  const t0 = Date.now();
  const root = mkdtempSync(join(tmpBase, "mvc-root-"));
  try {
    if (readdirSync(root).length) throw new Error("allowed root not empty");
    for (const im of images) copyFileSync(join(input, "images", rep, `${im.id}.png`), join(root, `${im.id}.png`));
    const env = { ...minimalEnv(), TCO_ALLOWED_ROOTS: root };
    if (guardOptions) env.NODE_OPTIONS = guardOptions;
    if (process.env.D03_NET_LOG) env.D03_NET_LOG = process.env.D03_NET_LOG;
    if (process.env.D03_STEP !== undefined) env.D03_STEP = `${process.env.D03_STEP}:${cell}`;
    const client = await startServer({ command: process.execPath, args: [bundle], env });
    const tools = client.initOk ? await client.listTools() : null;
    for (const im of images) {
      const base = { key: keyOf(rep, profile, view, im.id), rep, profile, view, id: im.id, pairId: im.pairId, lang: im.lang, anchor: im.anchor, doctype: im.doctype, layout: im.layout };
      if (!client.initOk) {
        rows.push({ ...base, ...initFailedRow({ view, caller: assignment.caller[im.id] }) });
        continue;
      }
      const row = await runRow({ client, view, profile, image: { id: im.id, file: join(root, `${im.id}.png`), page: im.page, expectedSha: expected[rep][im.id] }, allowedRoot: root, caller: assignment.caller[im.id] });
      rows.push({ ...base, ...row });
    }
    const counts = client.counts();
    const exit = await client.close();
    cellLines.push({ cell, rep, profile, view, initialize: client.initOk ? "ok" : "failed", serverInfo: client.serverInfo, toolsList: tools, mcpRequests: counts.requests, mcpResponses: counts.responses, notifications: counts.notifications, initializeRequests: counts.initialize, toolsListRequests: counts.toolsList, toolCalls: counts.toolCalls, exit: { code: exit.code, signal: exit.signal }, stderrBytes: exit.stderrBytes, stderrSha256: exit.stderrSha256 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  timing.push({ cell, ms: Date.now() - t0 });
  console.log(`${cell}: ${rows.filter((r) => `${r.rep}|${r.profile}|${r.view}` === cell && r.outcome === "ok").length}/${images.length} ok`);
}
checkKeys(rows.map((r) => r.key), ids);

writeFileSync(join(out, "raw.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
writeFileSync(join(out, "cells.jsonl"), `${cellLines.map((c) => JSON.stringify(c)).join("\n")}\n`);
writeFileSync(join(out, "input-check.json"), `${JSON.stringify(inputCheck, null, 1)}\n`);
writeFileSync(join(out, "run-meta.json"), `${JSON.stringify({
  node: process.version, platform: `${process.platform}-${process.arch}`, sharp: sharp.versions.sharp, vips: sharp.versions.vips,
  bundleBlob, bundleWorkingCopySha256: sha256(readFileSync(bundle)), bundleWorkingCopyBytes: statSync(bundle).size,
  offlineGuard: /node-netguard\.cjs/.test(guardOptions), startedAt: new Date(started).toISOString(), totalMs: Date.now() - started, timing,
}, null, 1)}\n`);
