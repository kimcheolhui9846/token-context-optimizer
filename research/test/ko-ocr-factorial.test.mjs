// Hand-built tests for the Korean OCR x Hangul key factorial (protocol research/plans/2026-11-24-ko-ocr-factorial-protocol.md, section 8).
// Run: node --test test/ko-ocr-factorial.test.mjs  (from research/)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  LANG_FILES, checkLangFiles, checkFreeze, writeFreeze, contains, evidenceOf, hangulBigrams, interaction, k0Select, k1Select, keyResults,
  scoreKey, summarize, validBand, validateOcrLines, windowFromAnchor, CONDITIONS, readCohort,
} from "../src/ko-ocr-factorial-lib.mjs";
import { selectWindow } from "../src/selector.mjs";

const W = 1280, H = 960;
const word = (text, x, y, w = 60, h = 20) => ({ text, box: [x, y, w, h] });
const line = (words, confidence = 90) => {
  const x0 = Math.min(...words.map((w) => w.box[0])), y0 = Math.min(...words.map((w) => w.box[1]));
  const x1 = Math.max(...words.map((w) => w.box[0] + w.box[2])), y1 = Math.max(...words.map((w) => w.box[1] + w.box[3]));
  return { text: words.map((w) => w.text).join(" "), confidence, box: [x0, y0, x1 - x0, y1 - y0], words };
};

// ------------------------------------------------------------------ representation
test("bigrams: NFC, overlapping pairs in one run, unique and sorted", () => {
  assert.deepEqual(hangulBigrams("예산 검토 일정은 언제인가요?"), ["가요", "검토", "언제", "예산", "인가", "일정", "정은", "제인"]);
  assert.deepEqual(hangulBigrams("하하하"), ["하하"]);
  assert.deepEqual(hangulBigrams("한국".normalize("NFD")), ["한국"]);
  assert.deepEqual(hangulBigrams("SX-5134"), []);
  assert.deepEqual(hangulBigrams("암"), []);
});

test("bigrams: Latin, digits, spaces and punctuation break runs", () => {
  assert.deepEqual(hangulBigrams("가나A다라"), ["가나", "다라"]);
  assert.deepEqual(hangulBigrams("가나,다라"), ["가나", "다라"]);
  assert.deepEqual(hangulBigrams("가나 다라"), ["가나", "다라"]);
  assert.deepEqual(hangulBigrams("가1나"), []);
});

// ------------------------------------------------------------------ K1 rule
test("K1 returns the K0 result unchanged when K0 matches (Latin key kept)", () => {
  const lines = [line([word("SX-5134", 100, 400), word("08:00", 900, 400)]), line([word("예산", 100, 600), word("검토", 170, 600)])];
  const q = "SX-5134 예산 검토 일정은 언제인가요?";
  const k0 = k0Select(selectWindow, lines, q, W, H);
  assert.equal(k0.matched, true);
  const k1 = k1Select(selectWindow, lines, q, W, H, k0);
  assert.equal(k1.branch, "k0");
  assert.deepEqual({ ...k1, branch: "k0", hangulKeys: undefined }, { ...k0, hangulKeys: undefined });
  assert.deepEqual(k1.band, k0.band);
});

test("K1: Korean fallback picks the line with most distinct question bigrams; words are not joined", () => {
  const a = line([word("예산", 100, 300)], 95); // 1 distinct
  const b = line([word("예산검토", 100, 500, 120)], 80); // 예산, 산검, 검토 -> 예산, 검토 in Q = 2
  const c = line([word("예", 100, 700), word("산", 140, 700)], 99); // single syllables per word: none
  const q = "예산 검토 일정은 언제인가요?";
  const k0 = k0Select(selectWindow, [a, b, c], q, W, H);
  assert.equal(k0.matched, false);
  const k1 = k1Select(selectWindow, [a, b, c], q, W, H, k0);
  assert.equal(k1.branch, "hangul");
  assert.equal(k1.matched, true);
  assert.equal(k1.lineIndex, 1);
  assert.equal(k1.score, 2);
  assert.deepEqual(k1.hitWords, [0]);
});

test("K1 ties: higher raw confidence, then earlier line", () => {
  const q = "예산 검토";
  const l0 = line([word("예산", 100, 200)], 70.4);
  const l1 = line([word("검토", 100, 400)], 70.6);
  const l2 = line([word("예산", 100, 600)], 70.6);
  const k1 = k1Select(selectWindow, [l0, l1, l2], q, W, H, k0Select(selectWindow, [l0, l1, l2], q, W, H));
  assert.equal(k1.lineIndex, 1);
  const k1b = k1Select(selectWindow, [l1, l2], q, W, H, k0Select(selectWindow, [l1, l2], q, W, H));
  assert.equal(k1b.lineIndex, 0);
});

test("K1 duplicate bigrams in one line count once", () => {
  const q = "하하 웃음";
  const l0 = line([word("하하", 100, 200), word("하하", 200, 200)], 90);
  const l1 = line([word("하하", 100, 400), word("웃음", 200, 400)], 50);
  const k1 = k1Select(selectWindow, [l0, l1], q, W, H, k0Select(selectWindow, [l0, l1], q, W, H));
  assert.equal(k1.lineIndex, 1);
  assert.equal(k1.score, 2);
});

test("K1 stays unmatched without question bigrams or without a positive line", () => {
  const lines = [line([word("예산", 100, 200)])];
  const none1 = k1Select(selectWindow, lines, "What is it?", W, H, k0Select(selectWindow, lines, "What is it?", W, H));
  assert.equal(none1.matched, false);
  assert.equal(none1.branch, "none");
  const none2 = k1Select(selectWindow, lines, "일정 언제", W, H, k0Select(selectWindow, lines, "일정 언제", W, H));
  assert.equal(none2.matched, false);
  assert.equal(none2.branch, "none");
});

test("K1 anchor is the union of hit word boxes in the chosen line", () => {
  const q = "예산 검토 회의";
  const l = line([word("예산", 100, 300, 50, 20), word("또는", 200, 300), word("검토", 400, 290, 60, 30)]);
  const k1 = k1Select(selectWindow, [l], q, W, H, k0Select(selectWindow, [l], q, W, H));
  assert.deepEqual(k1.hitWords, [0, 2]);
  assert.deepEqual(k1.anchor, [100, 290, 360, 30]);
});

test("window geometry equals the fixed selectWindow for the same anchor (row and axis branches)", () => {
  const row = line([word("budget", 100, 300, 80), word("review", 200, 300, 80), word("12:00", 900, 300)]);
  const sel = selectWindow([row], "When is the budget review?", W, H);
  const anchor = [100, 300, 180, 20];
  const got = windowFromAnchor(row, anchor, W, H);
  assert.deepEqual(got, { axisRow: sel.axisRow, band: sel.band });
  const axisWords = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((t, i) => word(t, 100 + i * 120, 800, 40, 20));
  const axis = line(axisWords);
  const sel2 = selectWindow([axis], "What is the value for Mar?", W, H);
  assert.equal(sel2.axisRow, true);
  assert.deepEqual(windowFromAnchor(axis, axisWords[2].box, W, H), { axisRow: true, band: sel2.band });
});

test("K0 exception propagates to K1 as a technical error", () => {
  const boom = () => { throw new Error("boom"); };
  const lines = [line([word("예산", 100, 200)])];
  const k0 = k0Select(boom, lines, "예산", W, H);
  assert.equal(k0.status, "error");
  const k1 = k1Select(boom, lines, "예산", W, H, k0);
  assert.equal(k1.status, "error");
  assert.equal(k1.matched, null);
});

test("input validation: NaN, infinity and missing fields are technical errors for both keys", () => {
  const good = [line([word("예산", 100, 200)])];
  assert.equal(validateOcrLines(good), null);
  const nan = [{ ...good[0], confidence: Number.NaN }];
  assert.match(validateOcrLines(nan), /confidence/);
  const inf = [{ ...good[0], words: [{ text: "x", box: [0, 0, Infinity, 1] }] }];
  assert.match(validateOcrLines(inf), /word box/);
  const miss = [{ text: "a", confidence: 1, words: [] }];
  assert.match(validateOcrLines(miss), /line box/);
  const res = keyResults(selectWindow, nan, "예산", W, H);
  assert.equal(res.k0.status, "error");
  assert.equal(res.k1.status, "error");
  assert.equal(res.k0.error, "input_validation");
});

test("output validation and band checks", () => {
  assert.equal(validBand({ left: 0, top: 0, width: 10, height: 10 }, W, H), true);
  assert.equal(validBand({ left: 0, top: 0, width: 0, height: 10 }, W, H), false);
  assert.equal(validBand({ left: 1275, top: 0, width: 10, height: 10 }, W, H), false);
  assert.equal(validBand({ left: 0.5, top: 0, width: 10, height: 10 }, W, H), false);
});

// ------------------------------------------------------------------ scoring
test("half-open containment with zero margin", () => {
  const band = { left: 100, top: 100, width: 100, height: 50 };
  assert.equal(contains([100, 100, 200, 150], band), true);
  assert.equal(contains([99, 100, 200, 150], band), false);
  assert.equal(contains([100, 100, 201, 150], band), false);
  assert.equal(contains([100, 100, 200, 151], band), false);
});

test("evidence all/partial/none and strict success excludes full-page windows", () => {
  const parts = [[100, 100, 150, 120], [300, 100, 350, 120]];
  assert.equal(evidenceOf({ left: 0, top: 0, width: 400, height: 200 }, parts), "all");
  assert.equal(evidenceOf({ left: 0, top: 0, width: 200, height: 200 }, parts), "partial");
  assert.equal(evidenceOf({ left: 500, top: 0, width: 200, height: 200 }, parts), "none");
  const page = { width: W, height: H };
  const ok = scoreKey({ status: "ok", matched: true, band: { left: 0, top: 0, width: 400, height: 200 } }, page, parts);
  assert.equal(ok.state, "matched_strict");
  const full = scoreKey({ status: "ok", matched: true, band: { left: 0, top: 0, width: W, height: H } }, page, parts);
  assert.equal(full.state, "matched_not_strict");
  assert.equal(full.fullPage, true);
  const un = scoreKey({ status: "ok", matched: false, band: null }, page, parts);
  assert.equal(un.state, "unmatched");
  assert.equal(un.fallback, true);
  assert.equal(un.strict, false);
  const err = scoreKey({ status: "error", matched: null, band: null }, page, parts);
  assert.equal(err.state, "technical_error");
  assert.equal(err.strict, false);
});

// ------------------------------------------------------------------ summary and contrasts
function fakeRows() {
  // 2 datasets sharing one ID; one primary (baseline unmatched) and one control (baseline strict) row each.
  const cohort = [
    { dataset: "r09", id: "same-id", baselineMatched: false, baselineStrict: false, cell: "ko/nl" },
    { dataset: "fcp", id: "same-id", baselineMatched: false, baselineStrict: false, cell: "ko/nl" },
    { dataset: "r09", id: "c1", baselineMatched: true, baselineStrict: true, cell: "en/code" },
    { dataset: "fcp", id: "c1", baselineMatched: true, baselineStrict: true, cell: "en/code" },
  ];
  const state = { O0K0: ["unmatched", "unmatched", "matched_strict", "matched_strict"], O0K1: ["unmatched", "unmatched", "matched_strict", "matched_strict"], O1K0: ["unmatched", "unmatched", "matched_strict", "unmatched"], O1K1: ["matched_strict", "technical_error", "matched_strict", "unmatched"] };
  const rows = [];
  for (const cond of CONDITIONS) cohort.forEach((c, i) => rows.push({ cond, dataset: c.dataset, id: c.id, cell: c.cell, baselineMatched: c.baselineMatched, baselineStrict: c.baselineStrict, state: state[cond][i], matched: state[cond][i].startsWith("matched") ? true : state[cond][i] === "unmatched" ? false : null, strict: state[cond][i] === "matched_strict", evidence: state[cond][i] === "matched_strict" ? "all" : null }));
  return rows;
}

test("summary keeps two datasets with the same ID apart, separates errors and keeps denominators", () => {
  const s = summarize(fakeRows());
  const t = s.conditions.O1K1.total;
  assert.equal(t.n, 4);
  assert.equal(t.technicalError, 1);
  assert.equal(t.primary.n, 2);
  assert.equal(t.primary.matched, 1);
  assert.equal(t.primary.strict, 1);
  assert.equal(t.primary.technicalError, 1);
  assert.equal(t.control.n, 2);
  assert.equal(t.control.matchedToUnmatched, 1);
  assert.equal(t.control.baselineStrict, 2);
  assert.equal(t.control.strictToFail, 1);
  assert.equal(s.conditions.O1K1.r09.primary.strict, 1);
  assert.equal(s.conditions.O1K1.fcp.primary.technicalError, 1);
  assert.equal(s.conditions.O0K0.total.byCell["ko/nl"].n, 2);
});

test("empty denominators are kept as zero, not dropped", () => {
  const rows = fakeRows().filter((r) => r.baselineMatched);
  const s = summarize(rows);
  assert.equal(s.conditions.O0K0.total.primary.n, 0);
  assert.equal(s.conditions.O0K0.total.primary.strictPct, null);
});

test("interaction sign: losses are negated so positive means improvement", () => {
  const s = summarize(fakeRows());
  const ix = interaction(s);
  // strict recovery /primary: O1K1 1, O1K0 0, O0K1 0, O0K0 0 -> +1
  assert.equal(ix.strictRecovery.interaction.count, 1);
  // matched->unmatched losses: O1K1 1, O1K0 1, O0K1 0, O0K0 0 -> negated: (-1 - -1) - (0 - 0) = 0
  assert.equal(ix.matchedToUnmatched.interaction.count, 0);
  assert.equal(ix.strictRecovery.qualified, true); // a technical error sits in the primary denominator
  assert.equal(ix.strictRecovery.technicalErrors, 1);
});

// ------------------------------------------------------------------ guards
const tmp = () => mkdtempSync(join(tmpdir(), "kof-test-"));
const sha = (b) => createHash("sha256").update(b).digest("hex");

test("language file guard stops on a missing file or a wrong hash", () => {
  const dir = tmp();
  try {
    assert.throws(() => checkLangFiles(dir, ["eng"]), /missing/);
    writeFileSync(join(dir, "eng.traineddata"), "not the model");
    assert.throws(() => checkLangFiles(dir, ["eng"]), /size|sha/);
    assert.equal(LANG_FILES.kor.bytes, 2208378);
    assert.equal(LANG_FILES.eng.sha256, "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("freeze detects a tampered predictions file", () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, "predictions.jsonl"), "{\"a\":1}\n");
    writeFileSync(join(dir, "ocr.jsonl"), "{\"b\":1}\n");
    writeFreeze(dir);
    assert.doesNotThrow(() => checkFreeze(dir));
    writeFileSync(join(dir, "predictions.jsonl"), "{\"a\":2}\n");
    assert.throws(() => checkFreeze(dir), /predictions\.jsonl/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cohort file matches the #146 replay rule (96 rows, 36/12 per dataset)", () => {
  const rows = readCohort();
  assert.equal(rows.length, 96);
  for (const ds of ["r09", "fcp"]) {
    assert.equal(rows.filter((r) => r.dataset === ds && r.baselineMatched).length, 36);
    assert.equal(rows.filter((r) => r.dataset === ds && !r.baselineMatched).length, 12);
  }
  assert.equal(new Set(rows.map((r) => `${r.dataset}/${r.id}`)).size, 96);
  assert.equal(sha(readFileSync(new URL("../results/ko-ocr-factorial/cohort.jsonl", import.meta.url)).toString("utf8").replace(/\r\n/g, "\n")), "86ccac534bacaeb6b4ca463fe7f5de41a5b33f68cc534f2002c417e35e6b2eb3");
});
