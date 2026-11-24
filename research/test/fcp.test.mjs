// Fresh crop padding (FCP) harness tests. Hand-computed coordinates and mocked product responses only: no study page,
// OCR result or crop is used here (protocol section 5, last bullet; section 11).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { EXPECTED_PROFILE, PADDINGS, keyOf, padRequest, runCropRow } from "../src/fcp-lib.mjs";
import { aggregate, areaOf, judgeRow, rate, validateGold } from "../src/fcp-score-lib.mjs";
import { CARD, DOCTYPES, TABLE, TARGET_SLOT, buildDesign, checkDesign, dedupCheck, selectorIndexOf } from "../src/fcp-design.mjs";
import { DOCTYPES as R09_DOCTYPES, buildDesign as buildR09, buildDevDesign as buildR09Dev } from "../src/r09-design.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const page = { width: 100, height: 80 };
const match = (left, top, width, height) => ({ status: "ok", matched: true, band: { left, top, width, height } });
const nomatch = { status: "ok", matched: false, band: null };
const callerError = { status: "error", error: "timeout 180000 ms", matched: null, band: null };

// ------------------------------------------------------------------ padding rule
test("registered paddings are exactly 0 and 4", () => assert.deepEqual(PADDINGS, [0, 4]));

test("p = 0 returns the caller band unchanged", () => {
  const r = padRequest(match(10, 20, 30, 15), page, 0);
  assert.equal(r.intent, "matched");
  assert.deepEqual(r.request, { x: 10, y: 20, width: 30, height: 15 });
  assert.deepEqual(r.requestRect, [10, 20, 40, 35]);
  assert.equal(r.requestFull, false);
  assert.deepEqual(r.pad, { left: 0, top: 0, right: 0, bottom: 0 });
  assert.deepEqual(r.clip, { left: 0, top: 0, right: 0, bottom: 0 });
});

test("p = 4 grows every side by 4 inside the page", () => {
  const r = padRequest(match(10, 20, 30, 15), page, 4);
  assert.deepEqual(r.requestRect, [6, 16, 44, 39]);
  assert.deepEqual(r.request, { x: 6, y: 16, width: 38, height: 23 });
  assert.deepEqual(r.pad, { left: 4, top: 4, right: 4, bottom: 4 });
  assert.deepEqual(r.clip, { left: 0, top: 0, right: 0, bottom: 0 });
});

test("p = 4 is clipped at all four page edges and records the clipped amount", () => {
  const r = padRequest(match(2, 1, 95, 77), page, 4);
  assert.deepEqual(r.requestRect, [0, 0, 100, 80]);
  assert.deepEqual(r.pad, { left: 2, top: 1, right: 3, bottom: 2 });
  assert.deepEqual(r.clip, { left: 2, top: 3, right: 1, bottom: 2 });
  assert.equal(r.requestFull, true, "matched band grown to the whole page");
  assert.equal(r.intent, "matched");
});

test("unmatched rows ask for the whole page at every padding", () => {
  for (const p of PADDINGS) {
    const r = padRequest(nomatch, page, p);
    assert.equal(r.intent, "unmatched");
    assert.deepEqual(r.requestRect, [0, 0, 100, 80]);
    assert.equal(r.requestFull, true);
    assert.equal(r.pad, null);
  }
});

test("selector technical errors make no request", () => {
  const r = padRequest(callerError, page, 4);
  assert.equal(r.intent, "caller_error");
  assert.equal(r.request, null);
  assert.equal(r.requestRect, null);
});

test("illegal bands and paddings throw", () => {
  assert.throws(() => padRequest(match(-1, 0, 10, 10), page, 0));
  assert.throws(() => padRequest(match(95, 0, 10, 10), page, 0));
  assert.throws(() => padRequest(match(0, 0, 0, 10), page, 0));
  assert.throws(() => padRequest(match(0.5, 0, 10, 10), page, 0));
  assert.throws(() => padRequest({ status: "ok", matched: false, band: { left: 0, top: 0, width: 1, height: 1 } }, page, 0));
  assert.throws(() => padRequest(match(0, 0, 10, 10), page, -1));
  assert.equal(keyOf(4, "x-en"), "p4|x-en");
});

// ------------------------------------------------------------------ product response checks (mock client)
const tmpRoot = () => mkdtempSync(join(tmpdir(), "fcp-test-"));
async function jpeg(w, h) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer();
}
/** Mock client replaying scripted responses in order, recording the calls. */
function mockClient(responses) {
  const calls = [];
  return { calls, async callTool(tool, args) { calls.push({ tool, args }); return responses.shift(); } };
}
const indexOk = (expectedSha, over = {}) => ({ ok: true, code: null, images: [], structured: { artifactId: "a1", width: 100, height: 80, sha256: expectedSha, validationProfile: EXPECTED_PROFILE, ...over } });
async function cropOk(rect, over = {}, imgOver = {}) {
  const bytes = await jpeg(rect[2] - rect[0], rect[3] - rect[1]);
  const structured = { status: "cropped", fullFrame: false, region: { x: rect[0], y: rect[1], width: rect[2] - rect[0], height: rect[3] - rect[1] }, source: { sha256: "S" }, output: { mimeType: "image/jpeg", byteLength: bytes.length, sha256: sha(bytes), width: rect[2] - rect[0], height: rect[3] - rect[1] }, ...over };
  return { ok: true, code: null, structured, images: [{ mimeType: "image/jpeg", data: bytes.toString("base64"), ...imgOver }] };
}
const image = (root) => ({ id: "t-en", file: join(root, "t-en.png"), page, expectedSha: "S" });

test("valid partial crop is crop_jpeg with JPEG hash, bytes and decoded size kept", async () => {
  const root = tmpRoot();
  try {
    const crop = await cropOk([6, 16, 44, 39]);
    const client = mockClient([indexOk("S"), crop]);
    const row = await runCropRow({ client, p: 4, image: image(root), caller: match(10, 20, 30, 15), allowedRoot: root });
    assert.equal(row.outcome, "ok");
    assert.equal(row.returned.kind, "crop_jpeg");
    assert.deepEqual(row.returned.region, [6, 16, 44, 39]);
    assert.deepEqual(client.calls.map((c) => c.tool), ["index_image_artifact", "crop_image_artifact"]);
    assert.equal(client.calls[0].args.profile, "tolerant");
    assert.deepEqual(client.calls[1].args.region, { x: 6, y: 16, width: 38, height: 23 });
    assert.equal(row.crop.jpegSha256, crop.structured.output.sha256);
    assert.equal(row.crop.jpegBytes, crop.structured.output.byteLength);
    assert.equal(row.crop.decodedWidth, 38);
    assert.equal(row.crop.decodedHeight, 23);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("crop response failures are kept as failed rows with their code", async () => {
  const root = tmpRoot();
  const caller = match(10, 20, 30, 15);
  const rect = [10, 20, 40, 35];
  const run = async (crop) => runCropRow({ client: mockClient([indexOk("S"), crop]), p: 0, image: image(root), caller, allowedRoot: root });
  try {
    const two = await cropOk(rect);
    two.images.push(two.images[0]);
    assert.equal((await run(two)).failCode, "image_count");
    assert.equal((await run(await cropOk(rect, {}, { mimeType: "image/png" }))).failCode, "crop_mime");
    const len = await cropOk(rect);
    len.structured.output.byteLength += 1;
    assert.equal((await run(len)).failCode, "crop_byte_length");
    const hash = await cropOk(rect);
    hash.structured.output.sha256 = "0".repeat(64);
    assert.equal((await run(hash)).failCode, "crop_image_sha_mismatch");
    const size = await cropOk(rect);
    size.structured.output.width += 1;
    assert.equal((await run(size)).failCode, "crop_size_mismatch");
    const region = await cropOk(rect, { region: { x: 11, y: 20, width: 30, height: 15 } });
    assert.equal((await run(region)).failCode, "crop_region_mismatch");
    const src = await cropOk(rect, { source: { sha256: "T" } });
    assert.equal((await run(src)).failCode, "source_sha_mismatch");
    const asOriginal = { ok: true, code: null, images: [], structured: { status: "original", fullFrame: true, region: { x: 10, y: 20, width: 30, height: 15 }, source: { sha256: "S" } } };
    const r = await run(asOriginal);
    assert.equal(r.failCode, "kind_invalid", "an original answer to a partial request is a contract violation, not a fallback");
    assert.equal(r.returned.kind, "none");
    const limit = { ok: false, code: "resize_required", images: [], structured: { status: "rejected", code: "resize_required" } };
    const l = await run(limit);
    assert.equal(l.failCode, "limit_exceeded");
    assert.equal(l.crop.productCode, "resize_required");
    for (const row of [r, l]) assert.equal(row.outcome, "failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("index checks: source hash, dimensions and validation profile", async () => {
  const root = tmpRoot();
  const run = async (ix) => runCropRow({ client: mockClient([ix]), p: 0, image: image(root), caller: match(10, 20, 30, 15), allowedRoot: root });
  try {
    assert.equal((await run(indexOk("X"))).failCode, "source_sha_mismatch");
    assert.equal((await run(indexOk("S", { width: 99 }))).failCode, "source_dims_mismatch");
    assert.equal((await run(indexOk("S", { validationProfile: "png-strict-v1" }))).failCode, "validation_profile_mismatch");
    const err = await run({ ok: false, code: "unsupported_image", images: [], structured: null });
    assert.equal(err.failStage, "index");
    assert.equal(err.crop.status, "not_called");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("whole-page answers are verified by re-reading the original under the allowed root", async () => {
  const root = tmpRoot();
  try {
    const png = Buffer.from("not really a png but hashed bytes");
    writeFileSync(join(root, "t-en.png"), png);
    const good = sha(png);
    const img = { id: "t-en", file: join(root, "t-en.png"), page, expectedSha: good };
    const full = (path) => ({ ok: true, code: null, images: [], structured: { status: "original", fullFrame: true, region: { x: 0, y: 0, width: 100, height: 80 }, source: { sha256: good, format: "png", mimeType: "image/png", path } } });
    const ok = await runCropRow({ client: mockClient([indexOk(good), full(join(root, "t-en.png"))]), p: 4, image: img, caller: nomatch, allowedRoot: root });
    assert.equal(ok.returned.kind, "original_verified");
    assert.deepEqual(ok.returned.region, [0, 0, 100, 80]);
    const missing = await runCropRow({ client: mockClient([indexOk(good), full(join(root, "gone.png"))]), p: 4, image: img, caller: nomatch, allowedRoot: root });
    assert.equal(missing.outcome, "failed");
    assert.equal(missing.failStage, "originalRead");
    assert.equal(missing.returned.kind, "none");
    const withImage = full(join(root, "t-en.png"));
    withImage.images = [{ mimeType: "image/png", data: "" }];
    assert.equal((await runCropRow({ client: mockClient([indexOk(good), withImage]), p: 4, image: img, caller: nomatch, allowedRoot: root })).failCode, "kind_invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("caller technical error rows never call the product", async () => {
  const client = mockClient([]);
  const row = await runCropRow({ client, p: 4, image: { id: "t", file: "x", page, expectedSha: "S" }, caller: callerError, allowedRoot: "." });
  assert.equal(client.calls.length, 0);
  assert.equal(row.outcome, "failed");
  assert.equal(row.failStage, "caller");
  assert.equal(row.failCode, "caller_error");
  assert.equal(row.intent, "caller_error");
  assert.equal(row.returned.kind, "none");
});

// ------------------------------------------------------------------ judgement
const parts = [{ item: "a", rect: [20, 30, 30, 40] }, { item: "v", rect: [50, 30, 60, 41] }];
const okRow = (kind, region) => ({ outcome: "ok", returned: { kind, region } });

test("half-open containment: boundary equality passes, 1px over fails", () => {
  assert.equal(judgeRow(okRow("crop_jpeg", [20, 30, 60, 41]), parts, page).state, 1);
  for (const r of [[21, 30, 60, 41], [20, 31, 60, 41], [20, 30, 59, 41], [20, 30, 60, 40]]) {
    const j = judgeRow(okRow("crop_jpeg", r), parts, page);
    assert.equal(j.state, 0, JSON.stringify(r));
    assert.equal(j.preserved, false);
    assert.equal(j.missingItems.length, 1);
  }
});

test("verified whole-page return is state 0 but preserves evidence; small window must be strictly smaller", () => {
  const full = judgeRow(okRow("original_verified", [0, 0, 100, 80]), parts, page);
  assert.deepEqual([full.state, full.small, full.preserved], [0, false, true]);
  const cropFull = judgeRow(okRow("crop_jpeg", [0, 0, 100, 80]), parts, page);
  assert.equal(cropFull.state, 0, "a crop as large as the page is not a small window");
  assert.equal(cropFull.preserved, true);
});

test("failed or unverified rows are not evaluable", () => {
  for (const row of [{ outcome: "failed", returned: { kind: "none", region: null } }, okRow("none", null), okRow("crop_jpeg", null), okRow("crop_jpeg", [0, 0, 101, 80])]) {
    const j = judgeRow(row, parts, page);
    assert.equal(j.state, "NE");
    assert.equal(j.preserved, null);
  }
});

test("area keeps integer numerator and denominator; missing for invalid returns", () => {
  assert.deepEqual(areaOf(okRow("crop_jpeg", [20, 30, 60, 41]), page), { num: 440, den: 8000, ratio: 0.055 });
  assert.equal(areaOf({ outcome: "failed", returned: { kind: "none", region: null } }, page), null);
  assert.equal(rate(0, 0), null);
  assert.equal(rate(1, 4), 0.25);
});

test("gold input errors stop scoring", () => {
  const ok = { x: { page, parts } };
  validateGold(ok, ["x"]);
  assert.throws(() => validateGold({}, ["x"]), /gold input error/);
  assert.throws(() => validateGold({ x: { page, parts: [] } }, ["x"]), /gold input error/);
  assert.throws(() => validateGold({ x: { page, parts: [{ item: "a", rect: [5, 5, 5, 6] }] } }, ["x"]), /gold input error/);
  assert.throws(() => validateGold({ x: { page, parts: [{ item: "a", rect: [5, 5, 6, 81] }] } }, ["x"]), /gold input error/);
  assert.throws(() => validateGold({ x: { page, parts: [{ item: "a", rect: [5, 5, 6.5, 8] }] } }, ["x"]), /gold input error/);
});

// ------------------------------------------------------------------ aggregation (hand counts)
/** Scored row helper: id, pair, lang, intent, state at p, area num. */
function sr(p, id, lang, intent, state, num, extra = {}) {
  const preserved = state === "NE" ? null : extra.preserved ?? state === 1;
  const kind = state === "NE" ? "none" : extra.kind ?? (intent === "unmatched" ? "original_verified" : "crop_jpeg");
  return {
    p, id, pairId: id.replace(/-(en|ko)$/, ""), lang, anchor: extra.anchor ?? "code", doctype: extra.doctype ?? "schedule", layout: extra.layout ?? "table",
    intent, requestFull: extra.requestFull ?? intent === "unmatched", outcome: state === "NE" ? "failed" : "ok", failStage: extra.failStage ?? (state === "NE" ? "crop" : null), failCode: extra.failCode ?? (state === "NE" ? "timeout" : null),
    returned: { kind }, state, preserved, area: num === null ? null : { num, den: 8000, ratio: num / 8000 },
  };
}

test("aggregate: primary metric, change table, area change and pairs by hand", () => {
  // a: matched 0 -> 1 (improved), b: matched 1 -> 1, c: matched 1 -> 0 (worsened), d: unmatched, e: matched product error at p4,
  // f: selector technical error (never matched).
  const rows = [
    sr(0, "a-en", "en", "matched", 0, 800), sr(4, "a-en", "en", "matched", 1, 1000),
    sr(0, "a-ko", "ko", "matched", 1, 800), sr(4, "a-ko", "ko", "matched", 1, 1200),
    sr(0, "c-en", "en", "matched", 1, 400), sr(4, "c-en", "en", "matched", 0, 600),
    sr(0, "d-ko", "ko", "unmatched", 0, 8000, { preserved: true }), sr(4, "d-ko", "ko", "unmatched", 0, 8000, { preserved: true }),
    sr(0, "e-en", "en", "matched", 1, 200), sr(4, "e-en", "en", "matched", "NE", null),
    sr(0, "f-ko", "ko", "caller_error", "NE", null, { failStage: "caller", failCode: "caller_error" }), sr(4, "f-ko", "ko", "caller_error", "NE", null, { failStage: "caller", failCode: "caller_error" }),
  ];
  const g = aggregate(rows, [0, 4]);
  const p0 = g.byP["0"];
  const p4 = g.byP["4"];
  assert.equal(p0.n, 6);
  assert.equal(p0.matchedDenominator, 4);
  assert.equal(p0.callerErrors, 1);
  assert.deepEqual(p0.primary, { success: 3, denominator: 4, rate: 0.75, states: { 1: 3, 0: 1, NE: 0 } });
  assert.deepEqual(p4.primary, { success: 2, denominator: 4, rate: 0.5, states: { 1: 2, 0: 1, NE: 1 } });
  assert.deepEqual(p4.all, { success: 2, denominator: 6, rate: 2 / 6, states: { 1: 2, 0: 2, NE: 2 } });
  assert.deepEqual(p4.preserved.all, { yes: 3, no: 1, NE: 2, denominator: 6, rate: 0.5 });
  assert.deepEqual(p4.preserved.matched, { yes: 2, no: 1, NE: 1, denominator: 4, rate: 0.5 });
  assert.deepEqual(g.change.matched, { improved: 1, worsened: 1, kept1: 1, kept0: 0, notEvaluable: 1, n: 4 });
  // area: p4 matched valid a-en 1000, a-ko 1200, c-en 600 -> mean 2800/3/8000; missing 1 (e-en)
  assert.equal(p4.area.matched.valid, 3);
  assert.equal(p4.area.matched.missing, 1);
  assert.equal(p4.area.matched.sumNum, 2800);
  assert.ok(Math.abs(p4.area.matched.mean - 2800 / 3 / 8000) < 1e-12);
  // paired change: a-en +200, a-ko +400, c-en +200 -> mean 800/3/8000 * 100 pp; e-en missing at p4
  assert.equal(g.change.areaMatched.validPairs, 3);
  assert.equal(g.change.areaMatched.missingPairs, 1);
  assert.ok(Math.abs(g.change.areaMatched.meanPp - (800 / 3 / 8000) * 100) < 1e-12);
  // all 48-style: d-ko (0 change) adds a pair, f-ko missing
  assert.equal(g.change.areaAll.validPairs, 4);
  assert.equal(g.change.areaAll.missingPairs, 2);
  // pairs at p4: a both; c-en only (no ko row), d-ko only (no en row) -> counted by present rows
  assert.deepEqual(p4.pairs, { both: 1, enOnly: 0, koOnly: 0, neither: 4, withNE: 2, n: 5 });
  assert.equal(p4.returned.none, 2);
  assert.equal(p4.unmatchedOriginal, 1);
  assert.equal(p4.matchedFull, 0);
  assert.deepEqual(p4.failures, { "caller|caller_error": 1, "crop|timeout": 1 });
});

test("aggregate: all unmatched or all technical errors give a zero matched denominator and N/A rates", () => {
  const unmatched = [sr(0, "a-en", "en", "unmatched", 0, 8000, { preserved: true }), sr(4, "a-en", "en", "unmatched", 0, 8000, { preserved: true })];
  const u = aggregate(unmatched, [0, 4]);
  assert.deepEqual(u.byP["4"].primary, { success: 0, denominator: 0, rate: null, states: { 1: 0, 0: 0, NE: 0 } });
  assert.equal(u.byP["4"].area.matched.mean, null);
  assert.equal(u.change.areaMatched.meanPp, null);
  assert.deepEqual(u.change.matched, { improved: 0, worsened: 0, kept1: 0, kept0: 0, notEvaluable: 0, n: 0 });
  const errs = [0, 4].map((p) => sr(p, "a-en", "en", "caller_error", "NE", null, { failStage: "caller", failCode: "caller_error" }));
  const e = aggregate(errs, [0, 4]);
  assert.equal(e.byP["0"].matchedDenominator, 0);
  assert.equal(e.byP["0"].primary.rate, null);
  assert.deepEqual(e.byP["0"].all, { success: 0, denominator: 1, rate: 0, states: { 1: 0, 0: 0, NE: 1 } });
  assert.equal(e.byP["0"].area.all.mean, null);
  assert.equal(e.byP["0"].area.all.missing, 1);
});

test("aggregate: matched band grown to the whole page is counted as a full conversion with state 0", () => {
  const rows = [sr(0, "a-en", "en", "matched", 1, 7000), sr(4, "a-en", "en", "matched", 0, 8000, { kind: "original_verified", requestFull: true, preserved: true })];
  const g = aggregate(rows, [0, 4]);
  assert.equal(g.byP["4"].matchedFull, 1);
  assert.equal(g.byP["4"].returned.original_verified, 1);
  assert.deepEqual(g.change.matched, { improved: 0, worsened: 1, kept1: 0, kept0: 0, notEvaluable: 0, n: 1 });
  assert.deepEqual(g.byP["4"].preserved.matched, { yes: 1, no: 0, NE: 0, denominator: 1, rate: 1 });
});

test("aggregate: strata by language x anchor, doctype and layout", () => {
  const rows = [
    sr(0, "a-en", "en", "matched", 1, 100, { anchor: "code", doctype: "invoice", layout: "cards" }),
    sr(0, "b-ko", "ko", "unmatched", 0, 8000, { anchor: "nl", doctype: "status", layout: "table", preserved: true }),
  ];
  const s = aggregate(rows, [0]).byP["0"].strata;
  assert.deepEqual(s.langAnchor["en|code"], { n: 1, matched: 1, s1: 1, s0: 0, NE: 0, preserved: 1 });
  assert.deepEqual(s.langAnchor["ko|nl"], { n: 1, matched: 0, s1: 0, s0: 1, NE: 0, preserved: 1 });
  assert.deepEqual(s.doctype.invoice, { n: 1, matched: 1, s1: 1, s0: 0, NE: 0, preserved: 1 });
  assert.deepEqual(s.layout.table, { n: 1, matched: 0, s1: 0, s0: 1, NE: 0, preserved: 1 });
});

// ------------------------------------------------------------------ design (text level; no rendering)
test("design: 24 pairs, 48 registered ids, R09 design checks pass", () => {
  const d = buildDesign();
  assert.equal(d.pairs.length, 24);
  assert.equal(d.images.length, 48);
  assert.equal(new Set(d.images.map((i) => i.id)).size, 48);
  assert.deepEqual(checkDesign(d, { expectedPairs: 24 }), []);
  for (const doc of ["schedule", "invoice", "status"]) for (const layout of ["table", "cards"]) for (const anchor of ["code", "nl"]) for (const v of [1, 2]) for (const lang of ["en", "ko"]) assert.ok(d.images.some((i) => i.id === `${doc}-${layout}-${anchor}-v${v}-${lang}`));
});

test("design: pre-registered target slots and geometry", () => {
  assert.deepEqual(TARGET_SLOT, { table: { code: { 1: 0, 2: 0 }, nl: { 1: 4, 2: 3 } }, cards: { code: { 1: 3, 2: 2 }, nl: { 1: 5, 2: 6 } } });
  assert.deepEqual(TABLE.x, [90, 270, 660, 960, 1190]);
  assert.deepEqual([TABLE.headerY, TABLE.rowH], [190, 66]);
  assert.deepEqual([CARD.x0, CARD.w, CARD.y0, CARD.h, CARD.gap, CARD.labelW, CARD.lines, CARD.half], [[60, 680], 540, 165, 160, 30, 160, [30, 80, 130], 24]);
  const d = buildDesign();
  for (const p of d.pairs) assert.equal(p.target, TARGET_SLOT[p.layout][p.anchor][p.variant]);
});

test("design: new vocabulary and code prefixes do not overlap R09", () => {
  for (const doc of ["schedule", "invoice", "status"]) {
    const old = new Set([...R09_DOCTYPES[doc].labels, ...R09_DOCTYPES[doc].others].flat());
    for (const w of [...DOCTYPES[doc].labels, ...DOCTYPES[doc].others].flat()) assert.ok(!old.has(w), `${doc}: ${w}`);
    assert.notEqual(DOCTYPES[doc].prefix, R09_DOCTYPES[doc].prefix);
  }
});

test("design: dedup check passes against R09 and flags planned shared structure", () => {
  const d = buildDesign();
  const report = dedupCheck(d, [buildR09("heldout"), buildR09Dev()]);
  assert.deepEqual(report.violations, []);
  assert.equal(report.counts.newCodes, 192);
  assert.ok(report.shared.length > 0, "planned shared structure is listed, not failed");
  // A synthetic duplicate is caught.
  const clone = JSON.parse(JSON.stringify(d));
  clone.images[1].items = clone.images[0].items;
  assert.ok(dedupCheck(clone, []).violations.some((v) => /content/.test(v)));
});

test("design: selector index carries no answer, code, item text or geometry", () => {
  const idx = selectorIndexOf(buildDesign(), null);
  const keys = new Set(idx.images.flatMap((i) => Object.keys(i)));
  for (const k of ["answer", "code", "items", "rules", "goldItems", "anchorItem", "question"]) assert.ok(!keys.has(k), k);
});
