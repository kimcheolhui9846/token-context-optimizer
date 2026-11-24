// ko-row-window: registered tests (protocol research/plans/2026-11-24-ko-row-window-protocol.md, 7).
// Written before the implementation (RED). The shared hand-computed example is research/tools/ko-row-window/example/example.json.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { researchDir, loadFixedLib, verifyFixedFile, extractFixedLib, fixedRunSource, functionSource, FIXED } from "../src/ko-row-window-fixed.mjs";
import { ValidationError, w1Rule, sameRowRight, isBlankWord, buildPrediction, scorePage, summarizeScores, checkIdSet, diffRows, normalizeQuestion, duplicateCheck } from "../src/ko-row-window-lib.mjs";

const EX = JSON.parse(readFileSync(join(researchDir, "tools", "ko-row-window", "example", "example.json"), "utf8"));
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const W1_KEYS = ["reason", "candidates", "maxRight", "clippedRight", "w0", "w1", "addedPixels"];

test("W1 rule: every hand-computed example case", () => {
  for (const c of EX.w1) {
    const got = w1Rule(c.lines, c.k1, c.width, c.height);
    assert.deepEqual(pick(got, W1_KEYS), c.expect, c.name);
  }
});

test("W1 rule: W1 contains W0, left/top/height unchanged, right never smaller", () => {
  for (const c of EX.w1) {
    const { w0, w1 } = w1Rule(c.lines, c.k1, c.width, c.height);
    if (!w0) { assert.equal(w1, null, c.name); continue; }
    assert.equal(w1.left, w0.left, c.name);
    assert.equal(w1.top, w0.top, c.name);
    assert.equal(w1.height, w0.height, c.name);
    assert.ok(w1.width >= w0.width, c.name);
    assert.ok(w1.left + w1.width <= c.width, c.name);
  }
});

test("W1 rule: broken K1 records are validation failures, not page errors", () => {
  for (const c of EX.w1Invalid) assert.throws(() => w1Rule(c.lines, c.k1, c.width, c.height), ValidationError, c.name);
});

test("same-row test: half-open, 50% of the smaller height, left edge may touch", () => {
  const h = [10, 50, 50, 70];
  assert.equal(sameRowRight(h, [50, 50, 60, 70]), true, "left touch");
  assert.equal(sameRowRight(h, [49.999, 50, 60, 70]), false, "overlaps the hit horizontally");
  assert.equal(sameRowRight(h, [60, 60, 70, 80]), true, "exactly half");
  assert.equal(sameRowRight(h, [60, 60.001, 70, 80.001]), false, "just below half");
  assert.equal(sameRowRight(h, [60, 70, 70, 90]), false, "rows touch, zero overlap");
  assert.equal(sameRowRight(h, [60, 55, 70, 60]), true, "small word inside the row: half of its own height");
  assert.equal(isBlankWord(" \u3000\t"), true);
  assert.equal(isBlankWord("가"), false);
});

test("scoring: hand-computed rows, stages, totals, zero-denominator group and lists", async () => {
  const fixed = await loadFixedLib();
  const rows = EX.scoring.pages.map((p) => scorePage(p.pred, p.page, fixed.scoreKey));
  EX.scoring.pages.forEach((p, i) => {
    assert.deepEqual(pick(rows[i], ["stage", "w0", "w1", "transition", "error", "newInk"]), p.expect, p.page.id);
  });
  const s = summarizeScores(rows, { pageArea: EX.scoring.pageArea });
  assert.deepEqual(s.stages, EX.scoring.expectStages);
  assert.deepEqual(s.groups.total, EX.scoring.expectTotal);
  const [axis, key] = EX.scoring.expectEmptyGroup.key;
  assert.deepEqual(s.groups[axis][key], EX.scoring.expectEmptyGroup.value);
  assert.deepEqual(s.lists, EX.scoring.expectLists);
});

test("ID sets: duplicates, missing and extra ids are rejected", () => {
  const ids = ["a", "b", "c"];
  assert.doesNotThrow(() => checkIdSet([{ id: "a" }, { id: "b" }, { id: "c" }], ids));
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "a" }, { id: "c" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "b" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "b" }, { id: "a" }, { id: "c" }], ids), ValidationError, "order differs");
});

test("row comparison catches a tamper that keeps every marginal total", async () => {
  const fixed = await loadFixedLib();
  const rows = EX.scoring.pages.map((p) => scorePage(p.pred, p.page, fixed.scoreKey));
  const t = rows.map((r) => ({ ...r }));
  // swap the transitions of a recovered and a lost page: totals of recovered/lost are unchanged
  [t[0].transition, t[2].transition] = [t[2].transition, t[0].transition];
  assert.deepEqual(diffRows(rows, rows), []);
  assert.deepEqual(diffRows(rows, t).map((d) => d.id), ["S1", "S3"]);
});

test("replay: stored K1 must equal the fixed K1 recomputed from raw OCR", () => {
  const c = EX.w1[0];
  const base = { id: "p", question: "q", pngSha256: "x", width: c.width, height: c.height,
    ocrRow: { id: "p", pngSha256: "x", width: c.width, height: c.height, status: "ok", error: null, ocrSha256: "y", ocrLines: c.lines },
    k1Row: { id: "p", status: "ok", error: null, k1: c.k1 } };
  const same = () => JSON.parse(JSON.stringify(c.k1));
  const pred = buildPrediction(base, same);
  assert.equal(pred.reason, "widened");
  assert.deepEqual(pred.w1, c.expect.w1);
  assert.throws(() => buildPrediction(base, () => ({ ...c.k1, hitWords: [1] })), ValidationError, "recomputed K1 differs");
  assert.throws(() => buildPrediction({ ...base, ocrRow: { ...base.ocrRow, id: "other" } }, same), ValidationError, "id join");
  assert.throws(() => buildPrediction({ ...base, pngSha256: "z" }, same), ValidationError, "image hash");
  const err = buildPrediction({ ...base, ocrRow: { ...base.ocrRow, status: "error", error: "timeout: timeout 180000 ms", ocrLines: null },
    k1Row: { id: "p", status: "error", error: "timeout: timeout 180000 ms", k1: { status: "error", error: "timeout: timeout 180000 ms", branch: "k0" } } }, same);
  assert.equal(err.state, "error");
  assert.equal(err.w0, null);
  assert.equal(err.w1, null);
});

test("fixed #147 library: written byte for byte from the Git object; a changed copy is refused", () => {
  const file = extractFixedLib();
  assert.equal(verifyFixedFile(file), FIXED.lib.blob);
  const dir = mkdtempSync(join(tmpdir(), "krw-"));
  const bad = join(dir, "lib.mjs");
  writeFileSync(bad, Buffer.concat([readFileSync(file), Buffer.from("\n")]));
  assert.throws(() => verifyFixedFile(bad));
});

test("OCR functions of the runner are the #147 runner functions byte for byte", () => {
  const want = fixedRunSource();
  const mine = readFileSync(join(researchDir, "src", "ko-row-window-run.mjs"), "utf8");
  for (const n of ["newWorker", "ocrLines", "withTimeout"]) {
    assert.ok(functionSource(want, n).length > 0, n);
    assert.equal(functionSource(mine, n), functionSource(want, n), n);
  }
});

test("question normalization and duplicate check against earlier sets", () => {
  assert.equal(normalizeQuestion("  가  나\u3000다 "), "가 나 다");
  assert.equal(normalizeQuestion("\u1100\u1161"), "가");
  const r = duplicateCheck(
    [{ id: "n1", pngSha256: "aa", question: "가 나?" }, { id: "n2", pngSha256: "bb", question: "다라?" }],
    [{ source: "old", id: "o1", pngSha256: "bb", question: " 가  나? " }],
  );
  assert.deepEqual(r.imageOverlap, [{ id: "n2", source: "old", other: "o1" }]);
  assert.deepEqual(r.questionOverlap, [{ id: "n1", source: "old", other: "o1" }]);
});

test("README reproduction commands name files that exist", () => {
  const readme = join(researchDir, "results", "ko-row-window", "README.md");
  assert.ok(existsSync(readme));
  const text = readFileSync(readme, "utf8");
  for (const f of ["src/ko-row-window-run.mjs", "src/ko-row-window-replay.mjs", "src/ko-row-window-score.mjs", "src/ko-row-window-compare.mjs", "src/ko-row-window-data.mjs", "tools/ko-row-window/design.py", "tools/ko-row-window/recount.py"]) {
    assert.ok(text.includes(f), f);
    assert.ok(existsSync(join(researchDir, f)), f);
  }
});
