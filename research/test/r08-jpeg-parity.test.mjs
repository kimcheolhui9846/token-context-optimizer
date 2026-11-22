// Offline tests for the R08 JPEG comparator. Run: node --test test/r08-jpeg-parity.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareEntry, compareProbeRows } from "../src/r08-jpeg-parity.mjs";

// p612 exp2Files row: file, kind, arms, slots, sha256, reproduced, WxH, app0First, strict, strictWithInsertedApp0, tolerant
const row = (sha, over = {}) => {
  const r = [`f-${sha}.jpg`, "full-frame", "B", 1, sha, true, "10x10", false, "unsupported_jpeg_profile", "pass", "baseline:1x1,1x1,1x1"];
  for (const [i, v] of Object.entries(over)) r[i] = v;
  return r;
};
const call = (role, id, over = {}) => ({ kind: "call", role, set: "exp2", id,
  default: { ok: false, code: "unsupported_jpeg_profile" }, tolerant: { ok: true, validationProfile: "jpeg-ycbcr8-tolerant-v1" },
  app0Default: { ok: true, validationProfile: "jpeg-ycbcr8-baseline-444-v1" }, ...over });

test("identical probe rows have no failures or differences", () => {
  const r = compareProbeRows([row("a"), row("b")], [row("b"), row("a")]);
  assert.deepEqual(r.failures, []);
  assert.equal(r.compared, 2);
  assert.equal(r.identical, 2);
});

test("duplicate, missing and extra probe rows fail", () => {
  assert.match(compareProbeRows([row("a"), row("a")], [row("a")]).failures.join("\n"), /duplicate/);
  assert.match(compareProbeRows([row("a"), row("b")], [row("a")]).failures.join("\n"), /missing/);
  assert.match(compareProbeRows([row("a")], [row("a"), row("c")]).failures.join("\n"), /extra/);
});

test("a changed validator outcome is reported per field", () => {
  const r = compareProbeRows([row("a")], [row("a", { 8: "pass" })]);
  assert.deepEqual(r.failures, []);
  assert.equal(r.identical, 0);
  assert.deepEqual(r.fieldDiffs, { strict: 1 });
});

test("a row whose bytes were not reproduced is not counted as identical", () => {
  const r = compareProbeRows([row("a")], [row("a", { 5: false })]);
  assert.equal(r.identical, 0);
  assert.equal(r.reproducedBoth, 0);
});

test("entry calls agree with the validator rows", () => {
  const r = compareEntry([call("latest", "a"), call("latest", "b")], [row("a"), row("b")], "latest");
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.agree, { default: 2, tolerant: 2, app0Default: 2 });
});

test("an entry call that disagrees with the validator is counted, and missing or duplicate calls fail", () => {
  const r = compareEntry([call("latest", "a", { default: { ok: true, validationProfile: "x" } }), call("latest", "b")], [row("a"), row("b")], "latest");
  assert.equal(r.agree.default, 1);
  assert.equal(r.disagreements.length, 1);
  assert.match(compareEntry([call("latest", "a")], [row("a"), row("b")], "latest").failures.join("\n"), /missing/);
  assert.match(compareEntry([call("latest", "a"), call("latest", "a"), call("latest", "b")], [row("a"), row("b")], "latest").failures.join("\n"), /duplicate/);
});
