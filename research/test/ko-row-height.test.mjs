// ko-row-height: registered tests (protocol research/plans/2026-11-24-ko-row-height-protocol.md, 6).
// Written before the implementation (RED). The shared hand-computed example is research/tools/ko-row-height/example/example.json.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { researchDir, FIXED, extractFixed, verifyFixedFile, loadFixedLib, loadFixedW1, fixedRunSource, functionSource } from "../src/ko-row-height-fixed.mjs";
import {
  ValidationError, w2Rule, exposure, validatePrediction, buildPrediction, scorePage, summarizeScores,
  renderTables, checkTables, checkIdSet, diffRows, normalizeQuestion, duplicateCheck,
} from "../src/ko-row-height-lib.mjs";
import { selectorView, AccessDenied } from "../src/ko-row-height-data.mjs";

const EX = JSON.parse(readFileSync(join(researchDir, "tools", "ko-row-height", "example", "example.json"), "utf8"));
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const W2_KEYS = ["reason", "w0", "w1", "w2Reason", "hitTop", "hitBottom", "pad", "w2", "cutPixels"];
const ROW_KEYS = ["stage", "reason", "w2Reason", "w0", "w1", "w2", "t01", "t12", "fullPageToPartial", "lostParts", "cutPixels", "others", "jOpportunity", "jEvent", "error"];

test("W2 rule: every hand-computed example case (with the fixed #150 W1)", async () => {
  const { w1Rule } = await loadFixedW1();
  for (const c of EX.w2) {
    const got = w2Rule(w1Rule, c.lines, c.k1, c.width, c.height);
    assert.deepEqual(pick(got, W2_KEYS), c.expect, c.name);
  }
});

test("W2 rule: W2 inside W1, same left and width, top < bottom, every hit inside W2", async () => {
  const { w1Rule } = await loadFixedW1();
  for (const c of EX.w2) {
    const r = w2Rule(w1Rule, c.lines, c.k1, c.width, c.height);
    if (!r.w1) { assert.equal(r.w2, null, c.name); continue; }
    assert.equal(r.w2.left, r.w1.left, c.name);
    assert.equal(r.w2.width, r.w1.width, c.name);
    assert.ok(r.w2.height > 0, c.name);
    assert.ok(r.w2.top >= r.w1.top && r.w2.top + r.w2.height <= r.w1.top + r.w1.height, c.name);
    if (r.w2Reason === "cut" || r.w2Reason === "no_cut") assert.ok(r.hitTop >= r.w2.top && r.hitBottom <= r.w2.top + r.w2.height, c.name);
    assert.equal(r.cutPixels, (r.w1.height - r.w2.height) * r.w1.width, c.name);
  }
});

test("W2 rule: broken hit records on widened pages are validation failures", async () => {
  const { w1Rule } = await loadFixedW1();
  for (const c of EX.w2Invalid) assert.throws(() => w2Rule(w1Rule, c.lines, c.k1, c.width, c.height), ValidationError, c.name);
});

test("exposure: touching edges have zero intersection, one pixel row is partial, equal edges are inside", () => {
  for (const c of EX.exposure) assert.equal(exposure(c.ink, c.band), c.expect, c.name);
});

test("prediction validation: narrowed positive window, same left/width, W2 inside W1, reason and pixel consistency", () => {
  for (const p of EX.scoring.pages) assert.doesNotThrow(() => validatePrediction(p.pred), p.pred.id);
  for (const c of EX.predictionInvalid) assert.throws(() => validatePrediction(c.pred), ValidationError, c.name);
});

test("scoring: hand-computed rows (strict full-page exception, full page -> partial, value lost with another record removed)", async () => {
  const { scoreKey } = await loadFixedLib();
  for (const p of EX.scoring.pages) {
    const row = scorePage(p.pred, p.page, scoreKey);
    assert.deepEqual(pick(row, ROW_KEYS), p.expect, p.page.id);
  }
});

test("summary: stages, total, layout group verdict, zero-denominator group, lists, source table", async () => {
  const { scoreKey } = await loadFixedLib();
  const rows = EX.scoring.pages.map((p) => scorePage(p.pred, p.page, scoreKey));
  const s = summarizeScores(rows, { pageArea: EX.scoring.pageArea });
  assert.deepEqual(s.stages, EX.scoring.expectStages);
  assert.deepEqual(s.groups.total, EX.scoring.expectTotal);
  for (const g of [EX.scoring.expectLayoutGroup, EX.scoring.expectEmptyGroup]) {
    const [axis, key] = g.key;
    assert.deepEqual(s.groups[axis][key], g.value, g.key.join("/"));
  }
  assert.deepEqual(s.lists, EX.scoring.expectLists);
  assert.deepEqual(s.sourceTable, EX.scoring.expectSourceTable);
});

test("public tables: rendered cells are checked one by one; a changed cell is found", async () => {
  const { scoreKey } = await loadFixedLib();
  const rows = EX.scoring.pages.map((p) => scorePage(p.pred, p.page, scoreKey));
  const s = summarizeScores(rows, { pageArea: EX.scoring.pageArea });
  const tables = renderTables(s);
  assert.deepEqual(tables.sources, EX.scoring.expectSourcesTable);
  const md = Object.entries(tables).map(([name, lines]) => `<!-- krh:table ${name} -->\n${lines.join("\n")}\n<!-- /krh:table -->`).join("\n\ntext\n\n");
  assert.deepEqual(checkTables(md, s), []);
  const bad = md.replace("| 전체 | 6 |", "| 전체 | 7 |");
  assert.notEqual(bad, md);
  const found = checkTables(bad, s);
  assert.equal(found.length, 1);
  assert.equal(found[0].table, "groups");
  assert.ok(checkTables(md.replace("<!-- krh:table area -->", "<!-- krh:table areaX -->"), s).length > 0, "missing table");
});

test("ID sets: duplicates, missing and extra ids are rejected", () => {
  const ids = ["a", "b", "c"];
  assert.doesNotThrow(() => checkIdSet([{ id: "a" }, { id: "b" }, { id: "c" }], ids));
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "a" }, { id: "c" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "b" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "b" }, { id: "a" }, { id: "c" }], ids), ValidationError, "order differs");
});

test("row comparison catches tampers that keep every marginal total", async () => {
  const { scoreKey } = await loadFixedLib();
  const rows = EX.scoring.pages.map((p) => scorePage(p.pred, p.page, scoreKey));
  const t = structuredClone(rows);
  [t[1].t12, t[2].t12] = [t[2].t12, t[1].t12]; // lost <-> recovered: totals unchanged
  assert.deepEqual(diffRows(rows, rows), []);
  assert.deepEqual(diffRows(rows, t).map((d) => d.id), ["S2", "S3"]);
  const u = structuredClone(rows); // partial -> none on one item, none -> partial on another: sums unchanged
  u[0].others.items[1].w2 = "none";
  u[1].others.items[0].w2 = "partial";
  assert.deepEqual(diffRows(rows, u).map((d) => d.id), ["S1", "S2"]);
});

test("replay: stored K1 must equal the fixed K1 recomputed from raw OCR; ids and image hash join", async () => {
  const { w1Rule } = await loadFixedW1();
  const c = EX.w2[0];
  const base = { id: "p", question: "q", pngSha256: "x", width: c.width, height: c.height,
    ocrRow: { id: "p", pngSha256: "x", width: c.width, height: c.height, status: "ok", error: null, ocrSha256: "y", ocrLines: c.lines },
    k1Row: { id: "p", status: "ok", error: null, k1: c.k1 } };
  const same = () => structuredClone(c.k1);
  const pred = buildPrediction(base, same, w1Rule);
  assert.equal(pred.reason, "widened");
  assert.equal(pred.w2Reason, "cut");
  assert.deepEqual(pred.w2, c.expect.w2);
  assert.doesNotThrow(() => validatePrediction(pred));
  assert.throws(() => buildPrediction(base, () => ({ ...c.k1, hitWords: [1] }), w1Rule), ValidationError, "recomputed K1 differs");
  assert.throws(() => buildPrediction({ ...base, ocrRow: { ...base.ocrRow, id: "other" } }, same, w1Rule), ValidationError, "id join");
  assert.throws(() => buildPrediction({ ...base, pngSha256: "z" }, same, w1Rule), ValidationError, "image hash");
  const err = buildPrediction({ ...base, ocrRow: { ...base.ocrRow, status: "error", error: "timeout: timeout 180000 ms", ocrLines: null },
    k1Row: { id: "p", status: "error", error: "timeout: timeout 180000 ms", k1: { status: "error", error: "timeout: timeout 180000 ms", branch: "k0" } } }, same, w1Rule);
  assert.equal(err.state, "error");
  assert.equal(err.w2, null);
  assert.equal(err.w2Reason, "inherit");
});

test("selector-side reader: only questions and PNGs; design, gold, render, score paths are refused", () => {
  const log = [];
  const files = { "selector/questions.json": Buffer.from("{}"), "selector/images/a.png": Buffer.from("png"), "scoring/gold.json": Buffer.from("gold") };
  const read = selectorView((rel) => files[rel], log);
  assert.equal(read("selector/questions.json").toString(), "{}");
  assert.equal(read("selector/images/a.png").toString(), "png");
  for (const bad of ["scoring/gold.json", "scoring/design.json", "scoring/render.json", "selector/../scoring/gold.json", "score-a/score.jsonl", "selector/images/../../scoring/gold.json", "gold.json", "selector/questions.json.bak"]) {
    assert.throws(() => read(bad), AccessDenied, bad);
  }
  assert.deepEqual(log.map((e) => e.path), ["selector/questions.json", "selector/images/a.png"]);
  assert.ok(log.every((e) => /^[0-9a-f]{64}$/.test(e.sha256)));
});

test("fixed objects: #147 library and #150 W1 written byte for byte from Git; a changed copy is refused", () => {
  const lib = extractFixed("lib");
  assert.equal(verifyFixedFile(lib, FIXED.lib.blob), FIXED.lib.blob);
  const w1 = extractFixed("w1");
  assert.equal(verifyFixedFile(w1, FIXED.w1.blob), FIXED.w1.blob);
  assert.equal(FIXED.w1.blob, "6c23fc168ccdd833d87a7fc095005e0b71b64638");
  assert.equal(FIXED.lib.blob, "d882b6640fcafabcc62e14ebfd571749d88f4bf6");
  const dir = mkdtempSync(join(tmpdir(), "krh-"));
  const bad = join(dir, "w1.mjs");
  writeFileSync(bad, Buffer.concat([readFileSync(w1), Buffer.from("\n")]));
  assert.throws(() => verifyFixedFile(bad, FIXED.w1.blob));
});

test("OCR functions of the runner are the #147 runner functions byte for byte", () => {
  const want = fixedRunSource();
  const mine = readFileSync(join(researchDir, "src", "ko-row-height-run.mjs"), "utf8");
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
  const readme = join(researchDir, "results", "ko-row-height", "README.md");
  assert.ok(existsSync(readme));
  const text = readFileSync(readme, "utf8");
  for (const f of ["src/ko-row-height-run.mjs", "src/ko-row-height-replay.mjs", "src/ko-row-height-score.mjs", "src/ko-row-height-compare.mjs", "src/ko-row-height-data.mjs", "src/ko-row-height-report.mjs", "tools/ko-row-height/design.py", "tools/ko-row-height/recount.py"]) {
    assert.ok(text.includes(f), f);
    assert.ok(existsSync(join(researchDir, f)), f);
  }
});
