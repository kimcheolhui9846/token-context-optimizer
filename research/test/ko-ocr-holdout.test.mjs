// ko-ocr-holdout tests (protocol research/plans/2026-11-24-ko-ocr-holdout-protocol.md, section 8).
// Run from research/: node --test test/ko-ocr-holdout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectWindow } from "../src/selector.mjs";
import { FIXED, extractFixedLib, fixedRunSource, functionSource, loadFixedLib, verifyFixedFile } from "../src/ko-ocr-holdout-fixed.mjs";
import { baselineGroups, primaryOf, summarize, scoreRows as buildScoreRows } from "../src/ko-ocr-holdout-lib.mjs";
import { buildManifest, checkData, expectedGrid, normQuestion, slotOf, verifyManifest } from "../src/ko-ocr-holdout-data.mjs";

const fixed = await loadFixedLib();
const tmp = () => mkdtempSync(join(tmpdir(), "koh-"));
const line = (text, conf, box, words) => ({ text, confidence: conf, box, words });

// ------------------------------------------------------------------ fixed objects
test("adapter writes the #147 lib blob byte for byte and refuses a changed copy", () => {
  const path = extractFixedLib();
  assert.equal(verifyFixedFile(path), FIXED.lib.blob);
  const d = tmp();
  const bad = join(d, "lib.mjs");
  writeFileSync(bad, `${readFileSync(path, "utf8")}\n// changed\n`);
  assert.throws(() => verifyFixedFile(bad), /blob/);
});

test("adapter keyResults is the fixed function: K0 match kept by K1, Hangul fallback, empty Hangul key set", () => {
  const W = 1280, H = 960;
  const codeLine = line("RP-4821 spine reglue", 90, [100, 200, 400, 30], [{ text: "RP-4821", box: [100, 200, 120, 30] }, { text: "spine", box: [230, 200, 80, 30] }, { text: "reglue", box: [320, 200, 90, 30] }]);
  const koLine = line("책등 재접착 RP-9", 80, [100, 500, 300, 30], [{ text: "책등", box: [100, 500, 60, 30] }, { text: "재접착", box: [170, 500, 90, 30] }]);
  const a = fixed.keyResults(selectWindow, [codeLine, koLine], "When is RP-4821 due?", W, H);
  assert.equal(a.k0.matched, true);
  assert.equal(a.k1.branch, "k0");
  assert.deepEqual(a.k1.band, a.k0.band);
  const b = fixed.keyResults(selectWindow, [codeLine, koLine], "책등 재접착의 완료 예정일은 언제인가요?", W, H);
  assert.equal(b.k0.matched, false);
  assert.equal(b.k1.branch, "hangul");
  assert.equal(b.k1.lineIndex, 1);
  assert.deepEqual(b.k1.hitWords, [0, 1]);
  const c = fixed.keyResults(selectWindow, [codeLine], "What is it?", W, H);
  assert.equal(c.k0.matched, false);
  assert.equal(c.k1.branch, "none");
  const bad = fixed.keyResults(selectWindow, [{ ...codeLine, confidence: Number.NaN }], "When is RP-4821 due?", W, H);
  assert.equal(bad.k0.status, "error");
  assert.equal(bad.k1.status, "error");
});

test("OCR functions in the runner are the #147 run blob functions, byte for byte", () => {
  const blob = fixedRunSource();
  const mine = readFileSync(new URL("../src/ko-ocr-holdout-run.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  for (const name of ["newWorker", "ocrLines", "withTimeout"]) {
    const want = functionSource(blob, name);
    assert.ok(want.length > 40, name);
    assert.equal(functionSource(mine, name), want, name);
  }
});

// ------------------------------------------------------------------ data checks
test("grid and slot rule: 96 pages, every combo uses slots 0-3 once, en/ko share the slot", () => {
  const g = expectedGrid();
  assert.equal(g.length, 96);
  for (let c = 0; c < 12; c++) {
    const slots = g.filter((x) => x.combo === c && x.lang === "en").map((x) => x.slot).sort();
    assert.deepEqual(slots, [0, 1, 2, 3]);
  }
  assert.equal(slotOf(0, 0), 0);
  assert.equal(slotOf(3, 1), 0);
  assert.equal(slotOf(2, 11), 1);
  for (let i = 0; i < 96; i += 2) assert.equal(g[i].slot, g[i + 1].slot);
  assert.equal(g.filter((x) => x.lang === "ko" && x.anchor === "nl").length, 24);
});

test("question normalization finds duplicates after NFC and whitespace folding", () => {
  assert.equal(normQuestion("  책등  재접착?\t"), "책등 재접착?");
  assert.equal(normQuestion("가"), "가");
  const r = checkData({ design: { images: [] }, questions: { questions: [] }, renderCheck: { failedImages: 0 }, gold: { gold: {} }, images: new Map() });
  assert.ok(r.problems.some((p) => /96/.test(p)));
});

test("manifest verification reports missing, extra and changed files", () => {
  const d = tmp();
  mkdirSync(join(d, "images"));
  writeFileSync(join(d, "a.json"), "{}\n");
  writeFileSync(join(d, "images", "p.png"), "x");
  const m = buildManifest(d);
  assert.equal(m.count, 2);
  assert.equal(verifyManifest(d, m).ok, true);
  writeFileSync(join(d, "images", "p.png"), "y");
  writeFileSync(join(d, "extra.txt"), "z");
  const r = verifyManifest(d, { ...m, files: { ...m.files, "gone.json": { sha256: "0", bytes: 1 } }, count: 3 });
  assert.deepEqual(r.changed, ["images/p.png"]);
  assert.deepEqual(r.extra, ["extra.txt"]);
  assert.deepEqual(r.missing, ["gone.json"]);
  assert.equal(r.ok, false);
});

// ------------------------------------------------------------------ scoring
const page = { width: 1000, height: 800 };
const parts = [[100, 100, 200, 130], [500, 100, 600, 130]];
const ok = (band) => ({ status: "ok", matched: true, band, branch: "k0" });
const classes = (id) => ({ id, lang: id.endsWith("-ko") ? "ko" : "en", anchor: id.includes("-nl-") ? "nl" : "code", doctype: id.split("-")[0], layout: id.split("-")[1], page });

test("fixed scoreKey: half-open containment, zero margin, all/partial/none, full page is not strict", () => {
  const exact = fixed.scoreKey(ok({ left: 100, top: 100, width: 500, height: 30 }), page, parts);
  assert.equal(exact.strict, true);
  const short = fixed.scoreKey(ok({ left: 100, top: 100, width: 499, height: 30 }), page, parts);
  assert.equal(short.evidence, "partial");
  assert.equal(fixed.scoreKey(ok({ left: 700, top: 0, width: 100, height: 100 }), page, parts).evidence, "none");
  const full = fixed.scoreKey(ok({ left: 0, top: 0, width: 1000, height: 800 }), page, parts);
  assert.equal(full.strict, false);
  assert.equal(full.fullPage, true);
  assert.equal(fixed.scoreKey({ status: "error" }, page, parts).state, "technical_error");
  assert.equal(fixed.scoreKey({ status: "ok", matched: false }, page, parts).state, "unmatched");
});

function fakeRun(rowsByCond) {
  // rowsByCond: { O0K0: { id: state }, ... } -> score rows through the lib
  const out = [];
  for (const [cond, m] of Object.entries(rowsByCond)) {
    for (const [id, st] of Object.entries(m)) {
      const s = { technical_error: { state: "technical_error", matched: null, strict: false, evidence: null }, unmatched: { state: "unmatched", matched: false, strict: false, evidence: null }, strict: { state: "matched_strict", matched: true, strict: true, evidence: "all" }, partial: { state: "matched_not_strict", matched: true, strict: false, evidence: "partial" } }[st];
      out.push({ cond, id, ...s });
    }
  }
  return out;
}

test("baseline groups M/C/E/S from run A O0K0 with sum checks; errors stay in the denominator", () => {
  const ids = ["repair-slip-nl-s101-ko", "repair-slip-nl-s101-en", "repair-slip-code-s101-ko", "repair-slip-code-s101-en"];
  const base = fakeRun({ O0K0: { [ids[0]]: "unmatched", [ids[1]]: "strict", [ids[2]]: "partial", [ids[3]]: "technical_error" } }).filter((r) => r.cond === "O0K0");
  const g = baselineGroups(base, ids.length);
  assert.deepEqual(g.counts, { M: 1, C: 2, E: 1, S: 1 });
  assert.equal(g.byId.get(ids[0]).group, "M");
  assert.equal(g.byId.get(ids[3]).group, "E");
  assert.throws(() => baselineGroups(base, 5), /sum/);
  assert.equal(primaryOf(classes(ids[0])), true);
  assert.equal(primaryOf(classes(ids[1])), false);
});

test("summary: transitions use M, C, S denominators; empty denominators are null; same pair languages are separate rows", () => {
  const ids = ["repair-slip-nl-s101-ko", "repair-slip-nl-s101-en", "rental-intake-code-s211-ko", "rental-intake-code-s211-en"];
  const states = {
    O0K0: { [ids[0]]: "unmatched", [ids[1]]: "strict", [ids[2]]: "strict", [ids[3]]: "partial" },
    O0K1: { [ids[0]]: "partial", [ids[1]]: "strict", [ids[2]]: "strict", [ids[3]]: "partial" },
    O1K0: { [ids[0]]: "unmatched", [ids[1]]: "unmatched", [ids[2]]: "technical_error", [ids[3]]: "strict" },
    O1K1: { [ids[0]]: "strict", [ids[1]]: "strict", [ids[2]]: "partial", [ids[3]]: "partial" },
  };
  const rows = buildScoreRows(fakeRun(states), (id) => classes(id), baselineGroups(fakeRun({ O0K0: states.O0K0 }), 4));
  assert.equal(rows.length, 16);
  const s = summarize(rows);
  const t1 = s.transitions.O1K1;
  assert.deepEqual([t1.M, t1.unmatchedToMatched, t1.unmatchedToStrict], [1, 1, 1]);
  assert.deepEqual([t1.C, t1.matchedToUnmatched, t1.S, t1.strictToFail, t1.notStrictC, t1.newStrict], [3, 0, 2, 1, 1, 0]);
  assert.deepEqual(t1.lostStrictIds, [ids[2]]);
  const t2 = s.transitions.O1K0;
  assert.deepEqual([t2.matchedToUnmatched, t2.matchedErrors, t2.strictToFail, t2.strictErrors, t2.newStrict], [1, 1, 1, 1, 1]);
  assert.deepEqual(t2.newStrictIds, [ids[3]]);
  const k = s.primary.O1K1;
  assert.deepEqual([k.n, k.M, k.C, k.E, k.recoveredMatch, k.recoveredStrict, k.strict], [1, 1, 0, 0, 1, 1, 1]);
  assert.equal(s.primary.O0K1.recoveredStrictPct, 0);
  assert.equal(s.conditions.O0K0.byCell["ko/code"].n, 1);
  assert.equal(s.conditions.O0K0.byDoctype.greenhouse.n, 0);
  assert.equal(s.conditions.O0K0.byDoctype.greenhouse.strictPct, null);
  assert.equal(s.conditions.O1K0.total.technicalError, 1);
  // no baseline-unmatched rows -> M = 0 -> null rates
  const none = summarize(buildScoreRows(fakeRun({ O0K0: { [ids[1]]: "strict" }, O0K1: { [ids[1]]: "strict" }, O1K0: { [ids[1]]: "strict" }, O1K1: { [ids[1]]: "strict" } }), (id) => classes(id), baselineGroups(fakeRun({ O0K0: { [ids[1]]: "strict" } }), 1)));
  assert.equal(none.transitions.O1K1.unmatchedToMatchedPct, null);
  assert.equal(none.primary.O1K1.recoveredMatchPct, null);
});

test("frozen predictions: a changed byte is detected before scoring", () => {
  const d = tmp();
  writeFileSync(join(d, "predictions.jsonl"), "{}\n");
  writeFileSync(join(d, "ocr.jsonl"), "{}\n");
  fixed.writeFreeze(d);
  assert.doesNotThrow(() => fixed.checkFreeze(d));
  writeFileSync(join(d, "predictions.jsonl"), "{} \n");
  assert.throws(() => fixed.checkFreeze(d), /differs/);
});

test("runner stops before OCR without the offline guard and writes stop.json", () => {
  const out = join(tmp(), "run");
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.D03_NET_LOG;
  const r = spawnSync(process.execPath, ["src/ko-ocr-holdout-run.mjs", "--out", out], { cwd: new URL("..", import.meta.url), env, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 2, r.stderr);
  const stop = JSON.parse(readFileSync(join(out, "stop.json"), "utf8"));
  assert.ok(stop.problems.some((p) => p.startsWith("offline guard")));
  assert.equal(existsSync(join(out, "predictions.jsonl")), false);
});

test("README reproduction refers to files that exist", () => {
  const readme = readFileSync(new URL("../results/ko-ocr-holdout/README.md", import.meta.url), "utf8");
  for (const f of ["src/ko-ocr-holdout-run.mjs", "src/ko-ocr-holdout-score.mjs", "src/ko-ocr-holdout-compare.mjs", "src/ko-ocr-holdout-data.mjs", "tools/ko-ocr-holdout/recount.py", "tools/ko-ocr-holdout/design.py", "tools/r09/render.py"]) {
    assert.ok(readme.includes(f), f);
    assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), f);
  }
});
