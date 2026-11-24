// Crop padding replay: hand-computed cases (protocol research/plans/2026-11-24-crop-padding-replay-protocol.md).
// Written before the harness (RED). Pure rules, one row of the runner against a fake client, and the scorer rules.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { PADDINGS, keyOf, padRequest, runCropRow } from "../src/crop-padding-replay-lib.mjs";
import { aggregate, areaOf, compare141, judgeRow, validateGold } from "../src/crop-padding-replay-score-lib.mjs";

const PAGE = { width: 100, height: 80 };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const tmpDirs = [];
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });

describe("padRequest", () => {
  const band = { left: 10, top: 20, width: 30, height: 15 };
  test("paddings are 0, 4, 8, 16 and keys are p-first", () => {
    assert.deepEqual(PADDINGS, [0, 4, 8, 16]);
    assert.equal(keyOf(8, "a-en"), "p8|a-en");
  });
  test("p = 0 keeps the caller band", () => {
    const r = padRequest({ matched: true, band }, PAGE, 0);
    assert.deepEqual(r.request, { x: 10, y: 20, width: 30, height: 15 });
    assert.deepEqual(r.requestRect, [10, 20, 40, 35]);
    assert.equal(r.intent, "matched");
    assert.equal(r.requestFull, false);
    assert.deepEqual(r.pad, { left: 0, top: 0, right: 0, bottom: 0 });
    assert.deepEqual(r.clip, { left: 0, top: 0, right: 0, bottom: 0 });
  });
  test("p = 4 grows each side by 4 inside the page", () => {
    const r = padRequest({ matched: true, band }, PAGE, 4);
    assert.deepEqual(r.requestRect, [6, 16, 44, 39]);
    assert.deepEqual(r.request, { x: 6, y: 16, width: 38, height: 23 });
  });
  test("left and top clip at 0 and record the clipped amount", () => {
    const r = padRequest({ matched: true, band: { left: 2, top: 1, width: 10, height: 10 } }, PAGE, 8);
    assert.deepEqual(r.requestRect, [0, 0, 20, 19]);
    assert.deepEqual(r.pad, { left: 2, top: 1, right: 8, bottom: 8 });
    assert.deepEqual(r.clip, { left: 6, top: 7, right: 0, bottom: 0 });
  });
  test("right and bottom clip at W and H", () => {
    const r = padRequest({ matched: true, band: { left: 80, top: 60, width: 17, height: 18 } }, PAGE, 4);
    assert.deepEqual(r.requestRect, [76, 56, 100, 80]);
    assert.deepEqual(r.pad, { left: 4, top: 4, right: 3, bottom: 2 });
    assert.deepEqual(r.clip, { left: 0, top: 0, right: 1, bottom: 2 });
  });
  test("a matched band that grows to the whole page is a full request with matched intent", () => {
    const r = padRequest({ matched: true, band: { left: 3, top: 3, width: 94, height: 74 } }, PAGE, 4);
    assert.deepEqual(r.request, { x: 0, y: 0, width: 100, height: 80 });
    assert.equal(r.requestFull, true);
    assert.equal(r.intent, "matched");
  });
  test("unmatched always asks for the whole page, whatever p", () => {
    for (const p of PADDINGS) {
      const r = padRequest({ matched: false, band: null }, PAGE, p);
      assert.deepEqual(r.request, { x: 0, y: 0, width: 100, height: 80 });
      assert.equal(r.intent, "unmatched");
      assert.equal(r.requestFull, true);
      assert.equal(r.pad, null);
      assert.equal(r.clip, null);
    }
  });
  test("illegal bands and paddings throw", () => {
    assert.throws(() => padRequest({ matched: true, band: { left: 0, top: 0, width: 0, height: 5 } }, PAGE, 0));
    assert.throws(() => padRequest({ matched: true, band: { left: 90, top: 0, width: 20, height: 5 } }, PAGE, 0));
    assert.throws(() => padRequest({ matched: true, band: { left: 1.5, top: 0, width: 2, height: 5 } }, PAGE, 0));
    assert.throws(() => padRequest({ matched: true, band }, PAGE, -1));
    assert.throws(() => padRequest({ matched: false, band }, PAGE, 0));
  });
});

// ---------------------------------------------------------------- one runner row against a fake client
async function jpeg(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg({ quality: 75 }).toBuffer();
}
function fakeClient(cropResult, indexOverride = {}) {
  const calls = [];
  return {
    calls,
    async callTool(name, args) {
      calls.push({ name, args });
      if (name === "index_image_artifact") return { ok: true, code: null, structured: { artifactId: "img_x", validationProfile: "png-gray8-tolerant-v1", width: 100, height: 80, sha256: "S", ...indexOverride }, images: [] };
      return cropResult(args);
    },
  };
}
const IMAGE = { id: "a-ko", file: "a-ko.png", page: PAGE, expectedSha: "S" };
const MATCHED = { matched: true, band: { left: 10, top: 20, width: 30, height: 15 } };

describe("runCropRow", () => {
  const croppedOk = async (args, extra = {}) => {
    const r = args.region;
    const bytes = await jpeg(r.width, r.height);
    return {
      ok: true, code: null,
      structured: { status: "cropped", fullFrame: false, region: r, source: { sha256: "S" }, output: { width: r.width, height: r.height, byteLength: bytes.length, sha256: sha(bytes), mimeType: "image/jpeg" }, ...extra },
      images: [{ mimeType: "image/jpeg", data: bytes.toString("base64") }],
    };
  };
  test("a valid partial crop is crop_jpeg with the padded region", async () => {
    const client = fakeClient((a) => croppedOk(a));
    const row = await runCropRow({ client, p: 4, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(row.outcome, "ok");
    assert.deepEqual(row.returned, { kind: "crop_jpeg", region: [6, 16, 44, 39] });
    assert.deepEqual(client.calls[0].args, { path: "a-ko.png", profile: "tolerant" });
    assert.deepEqual(client.calls[1].args.region, { x: 6, y: 16, width: 38, height: 23 });
    assert.equal(row.crop.imageItems, 1);
    assert.equal(row.crop.byteLength, "match");
    assert.equal(row.crop.decodedWidth, 38);
  });
  test("two image items fail with image_count", async () => {
    const client = fakeClient(async (a) => { const r = await croppedOk(a); r.images.push(r.images[0]); return r; });
    const row = await runCropRow({ client, p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(row.outcome, "failed");
    assert.equal(row.failCode, "image_count");
    assert.equal(row.returned.kind, "none");
  });
  test("wrong MIME, byte length, SHA and size fail", async () => {
    const mime = await runCropRow({ client: fakeClient(async (a) => { const r = await croppedOk(a); r.images[0].mimeType = "image/png"; return r; }), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(mime.failCode, "crop_mime");
    const len = await runCropRow({ client: fakeClient(async (a) => { const r = await croppedOk(a); r.structured.output.byteLength += 1; return r; }), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(len.failCode, "crop_byte_length");
    const hash = await runCropRow({ client: fakeClient(async (a) => { const r = await croppedOk(a); r.structured.output.sha256 = "0"; return r; }), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(hash.failCode, "crop_image_sha_mismatch");
    const size = await runCropRow({ client: fakeClient(async (a) => { const bytes = await jpeg(a.region.width + 1, a.region.height); return { ok: true, code: null, structured: { status: "cropped", fullFrame: false, region: a.region, source: { sha256: "S" }, output: { width: a.region.width, height: a.region.height, byteLength: bytes.length, sha256: sha(bytes), mimeType: "image/jpeg" } }, images: [{ mimeType: "image/jpeg", data: bytes.toString("base64") }] }; }), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(size.failCode, "crop_size_mismatch");
  });
  test("a returned region other than the request fails", async () => {
    const row = await runCropRow({ client: fakeClient(async (a) => croppedOk(a, { region: { ...a.region, x: a.region.x + 1 } })), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(row.failCode, "crop_region_mismatch");
  });
  test("a product size rejection is limit_exceeded, kept as a failed row, no retry", async () => {
    const client = fakeClient(async (a) => ({ ok: false, code: "resize_required", structured: { status: "rejected", code: "resize_required", fullFrame: false, region: a.region, source: { sha256: "S" } }, images: [] }));
    const row = await runCropRow({ client, p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(row.outcome, "failed");
    assert.equal(row.failCode, "limit_exceeded");
    assert.equal(row.crop.productStatus, "rejected");
    assert.equal(row.crop.productCode, "resize_required");
    assert.equal(client.calls.length, 2);
  });
  test("an index error ends the row before any crop", async () => {
    const client = { calls: [], async callTool(name) { this.calls.push(name); return { ok: false, code: "unsupported_png_profile", structured: null, images: [] }; } };
    const row = await runCropRow({ client, p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(row.failStage, "index");
    assert.equal(row.crop.status, "not_called");
    assert.equal(client.calls.length, 1);
  });
  test("an index response with another size or hash fails", async () => {
    const dims = await runCropRow({ client: fakeClient((a) => croppedOk(a), { width: 99 }), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(dims.failCode, "source_dims_mismatch");
    const hash = await runCropRow({ client: fakeClient((a) => croppedOk(a), { sha256: "T" }), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(hash.failCode, "source_sha_mismatch");
  });
  test("a full request needs an image-free original reference that reopens to the expected SHA", async () => {
    const root = mkdtempSync(join(tmpdir(), "cpr-test-"));
    tmpDirs.push(root);
    const bytes = Buffer.from("png bytes");
    const file = join(root, "a-ko.png");
    writeFileSync(file, bytes);
    const image = { ...IMAGE, file, expectedSha: sha(bytes) };
    const orig = (extra = {}, images = []) => fakeClient(async (a) => ({ ok: true, code: null, structured: { status: "original", fullFrame: true, region: a.region, source: { sha256: sha(bytes), path: file, format: "png", mimeType: "image/png" }, ...extra }, images }), { sha256: sha(bytes) });
    const ok = await runCropRow({ client: orig(), p: 16, image, caller: { matched: false, band: null }, allowedRoot: root });
    assert.equal(ok.outcome, "ok");
    assert.deepEqual(ok.returned, { kind: "original_verified", region: [0, 0, 100, 80] });
    assert.equal(ok.intent, "unmatched");
    const withBody = await runCropRow({ client: orig({}, [{ mimeType: "image/jpeg", data: "AA==" }]), p: 0, image, caller: { matched: false, band: null }, allowedRoot: root });
    assert.equal(withBody.failCode, "kind_invalid");
    const outside = await runCropRow({ client: orig({ source: { sha256: sha(bytes), path: join(tmpdir(), "nope.png"), format: "png", mimeType: "image/png" } }), p: 0, image, caller: { matched: false, band: null }, allowedRoot: root });
    assert.equal(outside.outcome, "failed");
    assert.equal(outside.failStage, "originalRead");
    assert.equal(outside.returned.kind, "none");
  });
  test("a partial request answered by an original reference is kind_invalid", async () => {
    const row = await runCropRow({ client: fakeClient(async (a) => ({ ok: true, code: null, structured: { status: "original", fullFrame: true, region: a.region, source: { sha256: "S" } }, images: [] })), p: 0, image: IMAGE, caller: MATCHED, allowedRoot: tmpdir() });
    assert.equal(row.failCode, "kind_invalid");
  });
});

// ---------------------------------------------------------------- scorer rules
const gold1 = { page: PAGE, parts: [{ item: "c", rect: [10, 20, 20, 30] }, { item: "v", rect: [30, 25, 41, 35] }] };
const okRow = (region, kind = "crop_jpeg", extra = {}) => ({ outcome: "ok", failCode: null, returned: { kind, region }, ...extra });

describe("judgeRow", () => {
  test("half-open edges: touching the right edge is inside, one pixel past is not", () => {
    assert.deepEqual(judgeRow(okRow([10, 20, 41, 35]), gold1.parts, PAGE), { judgement: "complete", missing: 0, missingItems: [] });
    assert.deepEqual(judgeRow(okRow([10, 20, 40, 35]), gold1.parts, PAGE), { judgement: "incomplete", missing: 1, missingItems: ["v"] });
    assert.deepEqual(judgeRow(okRow([11, 20, 40, 35]), gold1.parts, PAGE), { judgement: "incomplete", missing: 2, missingItems: ["c", "v"] });
  });
  test("failures and unverified originals are not evaluable", () => {
    assert.equal(judgeRow({ outcome: "failed", failCode: "x", returned: { kind: "none", region: null } }, gold1.parts, PAGE).judgement, "not_evaluable");
    assert.equal(judgeRow(okRow([0, 0, 100, 80], "original_unverified"), gold1.parts, PAGE).judgement, "not_evaluable");
    assert.equal(judgeRow(okRow([0, 0, 100, 80], "original_verified"), gold1.parts, PAGE).judgement, "complete");
  });
});

describe("validateGold", () => {
  const ids = ["a"];
  test("a good entry passes", () => { assert.doesNotThrow(() => validateGold({ a: gold1 }, ids)); });
  test("missing, empty and inverted entries are input errors", () => {
    assert.throws(() => validateGold({}, ids), /gold/);
    assert.throws(() => validateGold({ a: { page: PAGE, parts: [] } }, ids), /gold/);
    assert.throws(() => validateGold({ a: { page: PAGE } }, ids), /gold/);
    assert.throws(() => validateGold({ a: { page: PAGE, parts: [{ item: "c", rect: [20, 20, 10, 30] }] } }, ids), /gold/);
    assert.throws(() => validateGold({ a: { page: PAGE, parts: [{ item: "c", rect: [10, 30, 20, 30] }] } }, ids), /gold/);
    assert.throws(() => validateGold({ a: { page: PAGE, parts: [{ item: "c", rect: [10, 20, 101, 30] }] } }, ids), /gold/);
  });
});

describe("areaOf", () => {
  test("integer numerator and denominator; original is 1; failure is null", () => {
    assert.deepEqual(areaOf(okRow([10, 20, 40, 35]), PAGE), { num: 450, den: 8000, ratio: 450 / 8000 });
    assert.deepEqual(areaOf(okRow([0, 0, 100, 80], "original_verified"), PAGE), { num: 8000, den: 8000, ratio: 1 });
    assert.equal(areaOf({ outcome: "failed", failCode: "image_count", returned: { kind: "none", region: null } }, PAGE), null);
  });
});

describe("aggregate", () => {
  // Two ids: a (matched) incomplete at p0, complete at p4; b (unmatched) original at both.
  const mk = (p, id, intent, judgement, num, failCode = null) => ({ p, id, intent, lang: id === "a" ? "ko" : "en", anchor: "code", pairId: "x", outcome: failCode ? "failed" : "ok", failCode, returned: { kind: failCode ? "none" : intent === "matched" ? "crop_jpeg" : "original_verified", region: null }, requestFull: intent === "unmatched", judgement, area: num === null ? null : { num, den: 8000, ratio: num / 8000 }, assumedArea: null });
  const rows = [mk(0, "a", "matched", "incomplete", 400), mk(0, "b", "unmatched", "complete", 8000), mk(4, "a", "matched", "complete", 800), mk(4, "b", "unmatched", "complete", 8000)];
  const agg = aggregate(rows, [0, 4]);
  test("counts per p, by intent, with the unmatched share separated", () => {
    assert.deepEqual(agg.byP["0"].judgement, { complete: 1, incomplete: 1, not_evaluable: 0 });
    assert.deepEqual(agg.byP["0"].byIntent.matched.judgement, { complete: 0, incomplete: 1, not_evaluable: 0 });
    assert.deepEqual(agg.byP["4"].byIntent.unmatched.judgement, { complete: 1, incomplete: 0, not_evaluable: 0 });
  });
  test("mean area ratio and paired change in percentage points", () => {
    assert.equal(agg.byP["0"].area.all.mean, (0.05 + 1) / 2);
    assert.equal(agg.byP["0"].area.matched.mean, 0.05);
    assert.equal(agg.byP["4"].area.all.valid, 2);
    assert.equal(agg.byP["4"].pairedVsP0.all.validPairs, 2);
    assert.ok(Math.abs(agg.byP["4"].pairedVsP0.all.meanPp - 2.5) < 1e-12);
    assert.ok(Math.abs(agg.byP["4"].pairedVsP0.matched.meanPp - 5) < 1e-12);
  });
  test("recovered, worsened and kept against p0", () => {
    assert.deepEqual(agg.byP["4"].changeVsP0, { recovered: 1, worsened: 0, keptComplete: 1, keptIncomplete: 0, notEvaluablePairs: 0 });
  });
  test("a failed row keeps the denominator and is missing in area", () => {
    const r2 = [mk(0, "a", "matched", "complete", 400), mk(0, "b", "unmatched", "complete", 8000), mk(4, "a", "matched", "not_evaluable", null, "image_count"), mk(4, "b", "unmatched", "complete", 8000)];
    const g = aggregate(r2, [0, 4]);
    assert.equal(g.byP["4"].n, 2);
    assert.equal(g.byP["4"].area.all.valid, 1);
    assert.equal(g.byP["4"].area.all.missing, 1);
    assert.equal(g.byP["4"].pairedVsP0.all.validPairs, 1);
    assert.equal(g.byP["4"].pairedVsP0.all.missingPairs, 1);
    assert.equal(g.byP["4"].changeVsP0.notEvaluablePairs, 1);
  });
});

describe("compare141", () => {
  const newRow = { id: "a", intent: "matched", request: { x: 10, y: 20, width: 30, height: 15 }, returned: { kind: "crop_jpeg", region: [10, 20, 40, 35] }, index: { width: 100, height: 80 }, page: PAGE, judgement: "incomplete" };
  const oldRow = { key: "rgb|tolerant|region|a", crop: { requested: { x: 10, y: 20, width: 30, height: 15 } }, returned: { kind: "crop_jpeg", region: [10, 20, 40, 35] }, index: { width: 100, height: 80 } };
  test("same request, kind, region, judgement and dims pass", () => {
    const c = compare141([newRow], [oldRow], { "rgb|tolerant|region|a": "partial" }, { a: { width: 100, height: 80 } });
    assert.equal(c.pass, true);
    assert.equal(c.mismatches.length, 0);
  });
  test("any difference fails the replay and names the field", () => {
    const c = compare141([{ ...newRow, judgement: "complete" }], [oldRow], { "rgb|tolerant|region|a": "partial" }, { a: { width: 100, height: 80 } });
    assert.equal(c.pass, false);
    assert.equal(c.mismatches[0].field, "judgement");
    const d = compare141([newRow], [oldRow], { "rgb|tolerant|region|a": "partial" }, { a: { width: 101, height: 80 } });
    assert.equal(d.pass, false);
    assert.equal(d.mismatches[0].field, "dims");
  });
});
