// R09 replay check: saved selector results go through the existing transform path. Offline.
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { expectedSize, replayOne } from "../src/r09-replay.mjs";

const page = await sharp({ create: { width: 1280, height: 960, channels: 3, background: "#ffffff" } }).png().toBuffer();

test("expected size fits inside 1536 without enlargement", () => {
  assert.deepEqual(expectedSize(1280, 960), { width: 1280, height: 960 });
  assert.deepEqual(expectedSize(3072, 1000), { width: 1536, height: 500 });
});

test("matched -> cropTransform JPEG of the window size; no match -> armTransform full frame; errors not replayed", async () => {
  const crop = await replayOne({ id: "a", status: "ok", matched: true, band: { left: 10, top: 20, width: 400, height: 128 } }, page);
  assert.equal(crop.path, "cropTransform");
  assert.equal(crop.valid, true);
  assert.deepEqual([crop.width, crop.height, crop.format], [400, 128, "jpeg"]);
  const full = await replayOne({ id: "b", status: "ok", matched: false }, page);
  assert.equal(full.path, "armTransform");
  assert.deepEqual([full.width, full.height, full.valid], [1280, 960, true]);
  const err = await replayOne({ id: "c", status: "error", error: "timeout" }, page);
  assert.deepEqual([err.path, err.valid], ["not_replayed", null]);
  const again = await replayOne({ id: "a", status: "ok", matched: true, band: { left: 10, top: 20, width: 400, height: 128 } }, page);
  assert.equal(again.sha256, crop.sha256, "replay output is byte-stable");
});
