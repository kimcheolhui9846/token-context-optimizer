// Tests for the product MCP view comparison (research/plans/2026-11-23-mcp-view-comparison-protocol.md).
// Positive, negative and boundary cases for every rule the harness and scorer depend on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import {
  REPS, PROFILES, VIEWS, aggregate, assertInputPath, buildKeys, checkDenominator, checkKeys, checkPairs, compareGrayRgb, containsRect,
  decodePng8, judgeGeometry, overviewSize, pngChunks, pngIhdr, projectR09Raw, regionRect, validateProjection, verifyOriginalRef,
} from "../src/mcp-view-comparison-lib.mjs";
import { minimalEnv, startServer } from "../src/mcp-view-comparison-client.mjs";
import { initFailedRow, runRow } from "../src/mcp-view-comparison-paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const STUB = join(here, "mcp-view-comparison-stub-server.mjs");
const RUNNER = resolve(here, "..", "src", "mcp-view-comparison-run.mjs");
const sha = (b) => createHash("sha256").update(b).digest("hex");

// Minimal PNG writer for fixtures (no ancillary chunks). Filter type 0 on every row.
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, channels, pixel, extra = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 1 ? 0 : 2;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * channels);
    for (let x = 0; x < width; x++) { const v = pixel(x, y); for (let c = 0; c < channels; c++) row[1 + x * channels + c] = Array.isArray(v) ? v[c] : v; }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), ...extra, chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
const grayPx = (x, y) => (x * 31 + y * 7) % 256;

const IDS = [];
const IMAGES = [];
for (const p of ["a-code-s1", "b-nl-s1"]) for (const lang of ["en", "ko"]) {
  IDS.push(`${p}-${lang}`);
  IMAGES.push({ id: `${p}-${lang}`, pairId: p, lang, anchor: p.includes("code") ? "code" : "nl", doctype: "x", page: { width: 100, height: 80 } });
}

test("PNG chunks and IHDR are read from bytes", () => {
  const g = png(5, 3, 1, grayPx);
  assert.deepEqual(pngChunks(g).map((c) => c.type), ["IHDR", "IDAT", "IEND"]);
  assert.deepEqual(pngIhdr(g), { width: 5, height: 3, bitDepth: 8, colorType: 0, interlace: 0 });
  const withPhys = png(5, 3, 3, () => [1, 2, 3], [chunk("pHYs", Buffer.alloc(9))]);
  assert.deepEqual(pngChunks(withPhys).map((c) => c.type), ["IHDR", "pHYs", "IDAT", "IEND"]);
  assert.throws(() => pngChunks(Buffer.from("not a png")), /png_signature/);
});

test("own PNG decoder matches sharp on gray and RGB, every filter type", async () => {
  // sharp writes adaptive filters; decode its output with ours and compare raw pixels.
  const raw = Buffer.alloc(37 * 23 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 13 + (i >> 5)) % 256;
  const encoded = await sharp(raw, { raw: { width: 37, height: 23, channels: 3 } }).png({ adaptiveFiltering: true, compressionLevel: 9 }).toBuffer();
  const ours = decodePng8(encoded);
  assert.equal(ours.channels, 3);
  assert.ok(ours.data.equals(raw));
  const g = png(9, 4, 1, grayPx);
  const dg = decodePng8(g);
  assert.equal(dg.channels, 1);
  assert.equal(dg.data[2 * 9 + 3], grayPx(3, 2));
});

test("RGB derivative check: equal planes pass, one changed channel value fails", () => {
  const g = png(6, 4, 1, grayPx);
  const ok = png(6, 4, 3, (x, y) => [grayPx(x, y), grayPx(x, y), grayPx(x, y)]);
  assert.deepEqual(compareGrayRgb(g, ok), { ok: true, code: null, mismatchedPixels: 0 });
  const bad = png(6, 4, 3, (x, y) => (x === 5 && y === 3 ? [grayPx(x, y), grayPx(x, y) ^ 1, grayPx(x, y)] : [grayPx(x, y), grayPx(x, y), grayPx(x, y)]));
  assert.deepEqual(compareGrayRgb(g, bad), { ok: false, code: "pixel_mismatch", mismatchedPixels: 1 });
  const small = png(6, 3, 3, () => [0, 0, 0]);
  assert.equal(compareGrayRgb(g, small).code, "dims_mismatch");
  assert.equal(compareGrayRgb(ok, ok).code, "not_gray8");
  assert.equal(compareGrayRgb(g, g).code, "not_rgb8");
});

test("overview size: never enlarged, long side 512, half-up rounding, at least 1", () => {
  assert.deepEqual(overviewSize(1280, 960), { width: 512, height: 384 });
  assert.deepEqual(overviewSize(512, 100), { width: 512, height: 100 });
  assert.deepEqual(overviewSize(300, 200), { width: 300, height: 200 });
  assert.deepEqual(overviewSize(1025, 1), { width: 512, height: 1 });
  assert.deepEqual(overviewSize(1000, 3), { width: 512, height: 2 }); // 3*512/1000 = 1.536 -> 2
  assert.deepEqual(overviewSize(1024, 3), { width: 512, height: 2 }); // 1.5 -> 2 (half up)
});

test("geometry: half-open containment, 1px inside/outside, touching edges, invalid sizes", () => {
  const win = regionRect({ x: 10, y: 20, width: 30, height: 40 });
  assert.deepEqual(win, [10, 20, 40, 60]);
  assert.equal(containsRect(win, [10, 20, 40, 60]), true); // exactly touching every edge
  assert.equal(containsRect(win, [11, 21, 39, 59]), true); // 1px inside
  assert.equal(containsRect(win, [9, 20, 40, 60]), false); // 1px outside left
  assert.equal(containsRect(win, [10, 20, 41, 60]), false); // 1px outside right
  assert.equal(containsRect(win, [10, 20, 40, 61]), false); // 1px cut at the bottom
  const page = { width: 100, height: 80 };
  const row = (kind, region) => ({ outcome: kind === "none" ? "failed" : "ok", returned: { kind, region } });
  assert.deepEqual(judgeGeometry(row("crop_jpeg", [10, 20, 40, 60]), [[10, 20, 40, 60]], page), { geometry: "complete", missing: 0 });
  assert.deepEqual(judgeGeometry(row("crop_jpeg", [10, 20, 40, 60]), [[10, 20, 40, 60], [10, 20, 40, 62]], page), { geometry: "partial", missing: 1 });
  assert.equal(judgeGeometry(row("crop_jpeg", [10, 20, 10, 60]), [[10, 20, 11, 21]], page).geometry, "not_evaluable"); // zero width
  assert.equal(judgeGeometry(row("crop_jpeg", [10, 20, 101, 60]), [[10, 20, 11, 21]], page).geometry, "not_evaluable"); // past the page
  assert.equal(judgeGeometry(row("original_unverified", [0, 0, 100, 80]), [[1, 1, 2, 2]], page).geometry, "not_evaluable");
  assert.equal(judgeGeometry(row("none", null), [[1, 1, 2, 2]], page).geometry, "not_evaluable");
  assert.equal(judgeGeometry(row("original_verified", [0, 0, 100, 80]), [[0, 0, 100, 80]], page).geometry, "complete");
});

test("R09 projection keeps only id, matched and band", () => {
  const raw = [
    JSON.stringify({ id: "a", status: "ok", matched: true, band: { left: 0, top: 1, width: 5, height: 6 }, ocrLines: ["secret"], lineText: "x" }),
    JSON.stringify({ id: "b", status: "ok", matched: false, band: null, keys: [] }),
  ].join("\n");
  assert.deepEqual(projectR09Raw(raw), [{ id: "a", matched: true, band: { left: 0, top: 1, width: 5, height: 6 } }, { id: "b", matched: false, band: null }]);
  assert.throws(() => projectR09Raw(JSON.stringify({ id: "c", status: "error", error: "x" })), /r09_status/);
});

test("projection validation stops on missing, duplicate, extra ids and illegal bands", () => {
  const pages = Object.fromEntries(IDS.map((id) => [id, { width: 100, height: 80 }]));
  const good = IDS.map((id, i) => ({ id, matched: i % 2 === 0, band: i % 2 === 0 ? { left: 0, top: 0, width: 100, height: 10 } : null }));
  assert.equal(validateProjection(IDS, pages, good).size, 4);
  assert.throws(() => validateProjection(IDS, pages, good.slice(1)), /missing/);
  assert.throws(() => validateProjection(IDS, pages, [...good, good[0]]), /duplicate/);
  assert.throws(() => validateProjection(IDS, pages, [...good, { id: "zzz", matched: false, band: null }]), /unexpected/);
  const bad = (band) => good.map((p, i) => (i === 0 ? { ...p, band } : p));
  assert.throws(() => validateProjection(IDS, pages, bad({ left: 0, top: 0, width: 101, height: 10 })), /illegal band/);
  assert.throws(() => validateProjection(IDS, pages, bad({ left: -1, top: 0, width: 5, height: 10 })), /illegal band/);
  assert.throws(() => validateProjection(IDS, pages, bad({ left: 0, top: 0, width: 0, height: 10 })), /illegal band/);
  assert.throws(() => validateProjection(IDS, pages, bad({ left: 0.5, top: 0, width: 5, height: 10 })), /illegal band/);
  assert.throws(() => validateProjection(IDS, pages, bad(null)), /illegal band/);
  assert.throws(() => validateProjection(IDS, pages, good.map((p, i) => (i === 1 ? { ...p, band: { left: 0, top: 0, width: 1, height: 1 } } : p))), /band without match/);
});

test("pairs and keys: 2 x 2 x 3 x n keys, each once; a missing or extra key stops the run", () => {
  checkPairs(IMAGES);
  assert.throws(() => checkPairs(IMAGES.slice(1)), /pair/);
  const keys = buildKeys(IDS);
  assert.equal(keys.length, REPS.length * PROFILES.length * VIEWS.length * IDS.length);
  assert.equal(new Set(keys).size, keys.length);
  checkKeys(keys, IDS);
  assert.throws(() => checkKeys(keys.slice(1), IDS), /missing/);
  assert.throws(() => checkKeys([...keys, keys[0]], IDS), /duplicate/);
  assert.throws(() => checkKeys([...keys, "rgb|strict|region|zzz"], IDS), /unexpected/);
});

test("input path guard refuses gold, answer, score, render and design names", () => {
  for (const p of ["x/gold.json", "x/GOLD/y.png", "answers.json", "score-a/score.json", "render.json", "x/design.json"]) assert.throws(() => assertInputPath(p), /forbidden/);
  assertInputPath("input/images/original/a-code-s1-en.png");
});

test("original reference: actual open with hash check; missing, tampered, outside root, JPEG full frame all fail", async () => {
  const root = mkdtempSync(join(tmpdir(), "mvc-test-root-"));
  const outside = mkdtempSync(join(tmpdir(), "mvc-test-out-"));
  try {
    const bytes = png(4, 4, 3, () => [9, 9, 9]);
    writeFileSync(join(root, "a.png"), bytes);
    writeFileSync(join(outside, "a.png"), bytes);
    const resp = (path, extra = {}) => ({ status: "original", fullFrame: true, source: { path, format: "png", mimeType: "image/png", sha256: sha(bytes) }, ...extra });
    const ok = await verifyOriginalRef({ response: resp(join(root, "a.png")), expectedSha: sha(bytes), allowedRoot: root });
    assert.deepEqual(ok, { status: "ok", code: null, sha: "match", fileReads: 1 });
    // A reference alone is not an open: a wrong expected hash is only caught by reading the bytes.
    const mism = await verifyOriginalRef({ response: resp(join(root, "a.png")), expectedSha: "0".repeat(64), allowedRoot: root });
    assert.deepEqual(mism, { status: "failed", code: "sha_mismatch", sha: "mismatch", fileReads: 1 });
    assert.equal((await verifyOriginalRef({ response: resp(undefined), expectedSha: sha(bytes), allowedRoot: root })).code, "ref_missing");
    assert.equal((await verifyOriginalRef({ response: resp(join(outside, "a.png")), expectedSha: sha(bytes), allowedRoot: root })).code, "ref_outside_root");
    assert.equal((await verifyOriginalRef({ response: resp(join(root, "..", "a.png")), expectedSha: sha(bytes), allowedRoot: root })).code, "ref_outside_root");
    assert.equal((await verifyOriginalRef({ response: resp(join(root, "nope.png")), expectedSha: sha(bytes), allowedRoot: root })).code, "ref_unreadable");
    const jpegFull = resp(join(root, "a.png"));
    jpegFull.source = { ...jpegFull.source, format: "jpeg", mimeType: "image/jpeg" };
    const jf = await verifyOriginalRef({ response: jpegFull, expectedSha: sha(bytes), allowedRoot: root });
    assert.deepEqual(jf, { status: "failed", code: "kind_invalid", sha: null, fileReads: 0 });
    assert.equal((await verifyOriginalRef({ response: resp(join(root, "a.png"), { fullFrame: false }), expectedSha: sha(bytes), allowedRoot: root })).code, "kind_invalid");
    // No cache: change the bytes between two reads of the same reference.
    writeFileSync(join(root, "a.png"), Buffer.concat([bytes, Buffer.from([0])]));
    assert.equal((await verifyOriginalRef({ response: resp(join(root, "a.png")), expectedSha: sha(bytes), allowedRoot: root })).code, "sha_mismatch");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

// Stub MCP server: answers index/overview/crop with fixed shapes and writes its own request count on exit.
async function withStub(mode, fn) {
  const root = mkdtempSync(join(tmpdir(), "mvc-stub-"));
  const countFile = join(root, "count.json");
  const img = png(100, 80, 3, () => [7, 7, 7]);
  writeFileSync(join(root, "a.png"), img);
  const client = await startServer({ command: process.execPath, args: [STUB], env: { ...minimalEnv(), STUB_COUNT: countFile, STUB_MODE: mode, STUB_ROOT: root } });
  try {
    await fn({ client, root, img });
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
  return countFile;
}

test("client counts match the server's own count of requests, responses and notifications", async () => {
  let seen;
  const root = mkdtempSync(join(tmpdir(), "mvc-count-"));
  const countFile = join(root, "count.json");
  const client = await startServer({ command: process.execPath, args: [STUB], env: { ...minimalEnv(), STUB_COUNT: countFile, STUB_MODE: "normal", STUB_ROOT: root } });
  await client.listTools();
  await client.callTool("index_image_artifact", { path: join(root, "missing.png"), profile: "strict" });
  await client.callTool("no_such_tool", {});
  const ours = client.counts();
  await client.close();
  seen = JSON.parse(readFileSync(countFile, "utf8"));
  rmSync(root, { recursive: true, force: true });
  assert.deepEqual(ours, { requests: 4, responses: 4, notifications: 1, toolCalls: 2, initialize: 1, toolsList: 1 });
  assert.deepEqual(seen, { requests: 4, notifications: 1 });
});

const imageOf = (root, img) => ({ id: "a-code-s1-en", file: join(root, "a.png"), page: { width: 100, height: 80 }, expectedSha: sha(img) });

test("original view: reference returned and opened; read counted once", async () => {
  await withStub("normal", async ({ client, root, img }) => {
    const row = await runRow({ client, view: "original", profile: "strict", image: imageOf(root, img), allowedRoot: root, caller: null });
    assert.equal(row.outcome, "ok");
    assert.equal(row.crop.kind, "original");
    assert.equal(row.crop.purpose, "planned_original");
    assert.deepEqual(row.originalRead, { status: "ok", purpose: "planned_original", code: null, sha: "match" });
    assert.deepEqual(row.returned, { kind: "original_verified", region: [0, 0, 100, 80] });
    assert.deepEqual(row.counts, { toolCalls: 2, toolErrors: 0, fileReads: 1, plannedOriginalRequests: 1, fallbackOriginalRequests: 0, originalRefsRead: 1 });
  });
});

test("reference that does not verify is reported, not counted as evidence", async () => {
  await withStub("tampered_ref", async ({ client, root, img }) => {
    const row = await runRow({ client, view: "original", profile: "strict", image: imageOf(root, img), allowedRoot: root, caller: null });
    assert.equal(row.outcome, "failed");
    assert.equal(row.failStage, "originalRead");
    assert.equal(row.returned.kind, "original_unverified");
    assert.equal(row.counts.originalRefsRead, 0);
  });
});

test("index rejection: later tools not called and marked not_called; row stays", async () => {
  await withStub("reject_index", async ({ client, root, img }) => {
    for (const view of VIEWS) {
      const row = await runRow({ client, view, profile: "tolerant", image: imageOf(root, img), allowedRoot: root, caller: { matched: true, band: { left: 0, top: 0, width: 10, height: 10 } } });
      assert.equal(row.outcome, "failed");
      assert.equal(row.failCode, "unsupported_png_profile");
      assert.equal(row.overview.status, "not_called");
      assert.equal(row.crop.status, "not_called");
      assert.equal(row.originalRead.status, "not_called");
      assert.equal(row.counts.toolCalls, 1);
      assert.equal(row.counts.fileReads, 0);
    }
  });
});

test("region view: matched band is cropped and decoded; no match falls back to the original and reads it", async () => {
  await withStub("normal", async ({ client, root, img }) => {
    const hit = await runRow({ client, view: "region", profile: "strict", image: imageOf(root, img), allowedRoot: root, caller: { matched: true, band: { left: 10, top: 20, width: 30, height: 15 } } });
    assert.equal(hit.outcome, "ok");
    assert.deepEqual(hit.crop.requested, { x: 10, y: 20, width: 30, height: 15 });
    assert.equal(hit.crop.kind, "cropped");
    assert.equal(hit.crop.decode, "ok");
    assert.deepEqual([hit.crop.decodedWidth, hit.crop.decodedHeight], [30, 15]);
    assert.deepEqual(hit.returned, { kind: "crop_jpeg", region: [10, 20, 40, 35] });
    assert.deepEqual(hit.counts, { toolCalls: 3, toolErrors: 0, fileReads: 0, plannedOriginalRequests: 0, fallbackOriginalRequests: 0, originalRefsRead: 0 });
    const miss = await runRow({ client, view: "region", profile: "strict", image: imageOf(root, img), allowedRoot: root, caller: { matched: false, band: null } });
    assert.equal(miss.crop.purpose, "fallback_original");
    assert.deepEqual(miss.returned, { kind: "original_verified", region: [0, 0, 100, 80] });
    assert.deepEqual(miss.counts, { toolCalls: 3, toolErrors: 0, fileReads: 1, plannedOriginalRequests: 0, fallbackOriginalRequests: 1, originalRefsRead: 1 });
  });
});

test("overview view: size checked against the rule and the decoded JPEG", async () => {
  await withStub("normal", async ({ client, root, img }) => {
    const row = await runRow({ client, view: "overview", profile: "strict", image: imageOf(root, img), allowedRoot: root, caller: null });
    assert.equal(row.outcome, "ok");
    assert.deepEqual([row.overview.expectedWidth, row.overview.expectedHeight], [100, 80]);
    assert.equal(row.overview.decode, "ok");
    assert.equal(row.overview.imageSha, "match");
    assert.deepEqual(row.returned, { kind: "overview_jpeg", region: [0, 0, 100, 80] });
  });
  await withStub("bad_overview", async ({ client, root, img }) => {
    const row = await runRow({ client, view: "overview", profile: "strict", image: imageOf(root, img), allowedRoot: root, caller: null });
    assert.equal(row.outcome, "failed");
    assert.equal(row.failCode, "overview_size_mismatch");
    assert.equal(row.returned.kind, "none");
  });
});

test("aggregate keeps every row in the denominator and counts failures as failures", () => {
  const rows = [];
  for (const im of IMAGES) rows.push({ rep: "original", profile: "strict", view: "region", id: im.id, pairId: im.pairId, lang: im.lang, anchor: im.anchor, doctype: "x", outcome: "failed", failStage: "index", failCode: "unsupported_png_profile", index: { status: "error" }, returned: { kind: "none", region: null }, geometry: "not_evaluable", counts: { toolCalls: 1, toolErrors: 1, fileReads: 0, plannedOriginalRequests: 0, fallbackOriginalRequests: 0, originalRefsRead: 0 } });
  const agg = aggregate(rows);
  const cell = agg.cells["original|strict|region"];
  assert.equal(cell.n, 4);
  assert.equal(cell.failed, 4);
  assert.deepEqual(cell.failCodes, { unsupported_png_profile: 4 });
  assert.deepEqual(cell.geometry, { complete: 0, partial: 0, not_evaluable: 4 });
  assert.equal(cell.byLangAnchor["en|code"].n, 1);
  assert.deepEqual(cell.pairs, { both: 0, enOnly: 0, koOnly: 0, neither: 2 });
});

test("runner refuses an input folder holding anything outside the allow-list", () => {
  const dir = mkdtempSync(join(tmpdir(), "mvc-input-"));
  try {
    mkdirSync(join(dir, "images"));
    for (const f of ["assignment.json", "questions.json", "expected-sha.json"]) writeFileSync(join(dir, f), "{}");
    writeFileSync(join(dir, "gold.json"), "{}");
    const guard = resolve(here, "..", "tools", "d03", "guard", "node-netguard.cjs");
    const r = spawnSync(process.execPath, [RUNNER, "--input", dir, "--out", join(dir, "o")], { encoding: "utf8", windowsHide: true, env: { ...minimalEnv(), NODE_OPTIONS: `--require=${guard}` } });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /forbidden|not allowed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runner source reads no gold, score, render or design module", () => {
  for (const f of ["mcp-view-comparison-run.mjs", "mcp-view-comparison-paths.mjs", "mcp-view-comparison-client.mjs"]) {
    const src = readFileSync(resolve(here, "..", "src", f), "utf8");
    assert.doesNotMatch(src, /gold\.json|r09-score|render\.json|design\.json|mcp-view-comparison-score/);
  }
});

// ---------------------------------------------------------------- milestone review fixes (Opus 5.5, 2026-11-23)
test("review Nit 1: a file whose name starts with two dots inside the root is not outside it", async () => {
  const root = mkdtempSync(join(tmpdir(), "mvc-dots-"));
  try {
    const bytes = png(2, 2, 3, () => [1, 1, 1]);
    writeFileSync(join(root, "..a.png"), bytes);
    const r = await verifyOriginalRef({ response: { status: "original", fullFrame: true, source: { path: join(root, "..a.png"), format: "png", mimeType: "image/png" } }, expectedSha: sha(bytes), allowedRoot: root });
    assert.equal(r.status, "ok");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review Minor 1: an initialize failure records no tool call and no step", () => {
  for (const view of VIEWS) {
    const row = initFailedRow({ view, caller: { matched: true, band: { left: 0, top: 0, width: 1, height: 1 } } });
    assert.deepEqual(row.steps, []);
    assert.equal(row.outcome, "failed");
    assert.equal(row.failStage, "initialize");
    assert.equal(row.failCode, "initialize_failed");
    assert.equal(row.index.status, "not_called");
    assert.deepEqual(row.counts, { toolCalls: 0, toolErrors: 0, fileReads: 0, plannedOriginalRequests: 0, fallbackOriginalRequests: 0, originalRefsRead: 0 });
    assert.deepEqual(row.returned, { kind: "none", region: null });
  }
});

test("review Minor 1: client reports initOk false when initialize fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "mvc-init-"));
  const client = await startServer({ command: process.execPath, args: [STUB], env: { ...minimalEnv(), STUB_MODE: "fail_init", STUB_ROOT: root } });
  assert.equal(client.initOk, false);
  assert.equal(client.counts().notifications, 0);
  await client.close();
  rmSync(root, { recursive: true, force: true });
});

const SCORER = resolve(here, "..", "src", "mcp-view-comparison-score.mjs");
test("review Minor 2: scorer stops before scoring inputs when the evidence list is empty or partial", () => {
  const dir = mkdtempSync(join(tmpdir(), "mvc-ev-"));
  try {
    for (const files of [{}, { "raw.jsonl": "0" }]) {
      writeFileSync(join(dir, "evidence.json"), JSON.stringify({ files }));
      const r = spawnSync(process.execPath, [SCORER, "--run", dir, "--evidence", join(dir, "evidence.json"), "--out", join(dir, "o")], { encoding: "utf8", windowsHide: true });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /evidence must list exactly/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("review Minor 3: runner stops without the offline guard", () => {
  const env = { ...minimalEnv() };
  const r = spawnSync(process.execPath, [RUNNER, "--input", join(tmpdir(), "mvc-no-such-input"), "--out", join(tmpdir(), "mvc-no-such-out")], { encoding: "utf8", windowsHide: true, env });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /offline guard/);
});

test("review Minor 4: denominator check fixes 48 ids and every key", () => {
  const ids48 = Array.from({ length: 48 }, (_, i) => `p${Math.floor(i / 2)}-${i % 2 ? "ko" : "en"}`);
  const keys = buildKeys(ids48);
  assert.equal(checkDenominator(keys, ids48), 576);
  assert.throws(() => checkDenominator(keys.filter((k) => !k.endsWith("|p0-en")), ids48), /missing/);
  assert.throws(() => checkDenominator(buildKeys(ids48.slice(2)), ids48.slice(2)), /48 ids/);
});
