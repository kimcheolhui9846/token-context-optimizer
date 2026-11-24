// ko-window-diagnostic: rules of research/plans/2026-11-24-ko-window-diagnostic-protocol.md on small synthetic pages.
// Run from research/: node --test test/ko-window-diagnostic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isBlank, xywhToXyxy, bandToXyxy, xyxyToBand, centerItems, positiveOverlap, deficitOf, containmentOf,
  wordRecord, lineRecord, triggerRecord, diagnosePage, DiagnosticError, checkDenominators, checkRegistered, comparePages, summarize,
} from "../src/ko-window-diagnostic-lib.mjs";

// ------------------------------------------------------------------ fixture
const W = 1000, H = 600;
const ITEMS = [
  { id: "hdr", role: "header", text: "코드 / 제목", cell: [0, 20, 400, 60] },
  { id: "lab", role: "label", text: "과수원 지도첩", cell: [0, 100, 400, 150] },
  { id: "val", role: "value", text: "2027-02-26", cell: [500, 100, 800, 150] },
  { id: "oth", role: "other", text: "완료", cell: [500, 300, 800, 350] },
];
const LAB_INK = [10, 110, 200, 130];
const VAL_INK = [510, 112, 600, 128];
const word = (text, box) => ({ text, box });
const line = (text, box, words, confidence = 90) => ({ text, box, confidence, words });
const LINES = [
  line("코드 / 제목 예정일", [10, 25, 600, 20], [word("코드", [10, 25, 40, 20]), word("예정일", [450, 25, 60, 20])]),
  line("과수원 지도첩 2027-02-26", [12, 112, 590, 16], [word("과수원", [12, 112, 60, 16]), word("지도첩", [80, 112, 60, 16]), word("2027-02-26", [510, 112, 90, 16])]),
  line("완료", [510, 305, 40, 20], [word("완료", [510, 305, 40, 20])]),
];
const K1 = { status: "ok", error: null, branch: "hangul", matched: true, score: 2, lineIndex: 1, lineText: LINES[1].text, lineBox: LINES[1].box, hitWords: [0, 1], band: { left: 0, top: 100, width: 700, height: 40 } };
function page(over = {}) {
  const k1 = { ...K1, ...(over.k1 || {}) };
  const lines = over.lines || LINES;
  return {
    id: "p1",
    cohort: { id: "p1", doctype: "repair", layout: "slip", role: "control", strict: true, evidence: "all", branch: "hangul", state: "matched_strict", ...(over.cohort || {}) },
    design: { id: "p1", lang: "ko", anchor: "nl", doctype: "repair", layout: "slip", page: { width: W, height: H }, question: "과수원 지도첩의 완료 예정일은?", anchorItem: "lab", valueItem: "val", items: over.items || ITEMS },
    render: { items: { lab: { ink: LAB_INK }, val: { ink: VAL_INK }, hdr: { ink: [10, 25, 90, 45] }, oth: { ink: [510, 305, 550, 325] }, ...(over.renderItems || {}) } },
    gold: { parts: over.goldParts || [{ item: "lab", rect: LAB_INK, size: [190, 20] }, { item: "val", rect: VAL_INK, size: [90, 16] }] },
    pred: { ocr: "O1", id: "p1", status: "ok", width: W, height: H, k0: { status: "ok", matched: false }, k1, ...(over.pred || {}) },
    ocr: { ocr: "O1", id: "p1", status: "ok", ocrLines: lines },
    score: { cond: "O1K1", id: "p1", state: "matched_strict", strict: true, evidence: "all", ...(over.score || {}) },
  };
}
// K1 re-check stub: returns the stored K1 unless told otherwise; line score = number of hit-like Hangul words.
const sameK1 = (stored) => () => ({ ...stored });
const lineScore = (l) => l.words.filter((w) => /[가-힣]{2}/u.test(w.text)).length;
const run = (p, recheck) => diagnosePage(p, { recheckK1: recheck || sameK1(p.pred.k1), lineK1Score: lineScore });

// ------------------------------------------------------------------ geometry
test("xywh -> half-open xyxy keeps fractional pixels and rejects bad boxes", () => {
  assert.deepEqual(xywhToXyxy([553.125, 100, 112.1875, 22.1875]), [553.125, 100, 665.3125, 122.1875]);
  for (const bad of [[1, 2, 3], [0, 0, NaN, 1], [0, 0, Infinity, 1], [0, 0, -1, 1], [0, 0, 1, -0.5], "x", null]) assert.throws(() => xywhToXyxy(bad));
});

test("band xywh <-> xyxy round trip without rounding, page bounds and positive size", () => {
  const b = { left: 0, top: 25, width: 1280, height: 248 };
  const x = bandToXyxy(b, 1280, 960);
  assert.deepEqual(x, [0, 25, 1280, 273]);
  assert.deepEqual(xyxyToBand(x), b);
  assert.deepEqual(xyxyToBand(bandToXyxy({ left: 1.5, top: 2.25, width: 3.5, height: 4 }, 10, 10)), { left: 1.5, top: 2.25, width: 3.5, height: 4 });
  for (const bad of [{ left: 0, top: 0, width: 0, height: 5 }, { left: -1, top: 0, width: 5, height: 5 }, { left: 0, top: 0, width: 11, height: 5 }, { left: 0, top: 6, width: 5, height: 5 }, { left: NaN, top: 0, width: 1, height: 1 }, null])
    assert.throws(() => bandToXyxy(bad, 10, 10));
});

test("word centre uses half-open cells: left/top edge inside, right/bottom edge outside", () => {
  const cells = [{ id: "a", cell: [0, 0, 10, 10] }, { id: "b", cell: [10, 0, 20, 10] }];
  assert.deepEqual(centerItems([0, 0, 0, 0], cells), ["a"]); // centre (0,0): left/top edge of a
  assert.deepEqual(centerItems([8, 2, 4, 2], cells), ["b"]); // centre x = 10: right edge of a, left edge of b
  assert.deepEqual(centerItems([18, 8, 4, 4], cells), []); // centre x = 20: right edge of b
  assert.deepEqual(centerItems([2, 8, 2, 4], cells), []); // centre y = 10: bottom edge
  assert.deepEqual(centerItems([2, 8, 2, 3.999], cells), ["a"]);
  assert.deepEqual(centerItems([5, 5, 0, 0], [{ id: "a", cell: [0, 0, 10, 10] }, { id: "c", cell: [4, 4, 6, 6] }]), ["a", "c"]);
});

test("positive-area overlap: zero-area touch is not overlap, straddling box is", () => {
  assert.equal(positiveOverlap([0, 0, 10, 10], [10, 0, 20, 10]), false);
  assert.equal(positiveOverlap([0, 0, 10, 10], [0, 10, 10, 20]), false);
  assert.equal(positiveOverlap([0, 0, 10, 10], [10, 10, 20, 20]), false);
  assert.equal(positiveOverlap([0, 0, 10.5, 10], [10, 0, 20, 10]), true);
  assert.equal(positiveOverlap([5, 5, 5, 9], [0, 0, 10, 10]), false); // zero-width box
});

test("containment: exact fit, one pixel short on each side, required expansion is the per-side max", () => {
  const band = [10, 20, 110, 220];
  assert.deepEqual(deficitOf([10, 20, 110, 220], band), { left: 0, top: 0, right: 0, bottom: 0 });
  assert.deepEqual(deficitOf([9, 20, 110, 220], band), { left: 1, top: 0, right: 0, bottom: 0 });
  assert.deepEqual(deficitOf([10, 19, 110, 220], band), { left: 0, top: 1, right: 0, bottom: 0 });
  assert.deepEqual(deficitOf([10, 20, 111, 220], band), { left: 0, top: 0, right: 1, bottom: 0 });
  assert.deepEqual(deficitOf([10, 20, 110, 221], band), { left: 0, top: 0, right: 0, bottom: 1 });
  assert.equal(containmentOf(true, true), "both");
  assert.equal(containmentOf(true, false), "anchorOnly");
  assert.equal(containmentOf(false, true), "valueOnly");
  assert.equal(containmentOf(false, false), "neither");
});

test("blank words: registered whitespace set only", () => {
  for (const t of ["", " ", "\t\n", "\u00a0\u3000", "\ufeff", "\u2028"]) assert.equal(isBlank(t), true, JSON.stringify(t));
  for (const t of ["a", " 가 ", "\u200b", "-"]) assert.equal(isBlank(t), false, JSON.stringify(t));
});

// ------------------------------------------------------------------ words and lines
const ctx = { items: ITEMS, anchorItem: "lab", anchorInk: LAB_INK };
test("strict anchor cue needs centre in the anchor cell and ink overlap", () => {
  const cue = wordRecord(word("과수원", [12, 112, 60, 16]), 0, ctx);
  assert.equal(cue.assigned, "lab");
  assert.equal(cue.strictAnchorCue, true);
  assert.equal(cue.anchorBoundary, false);
  const noInk = wordRecord(word("지도", [300, 135, 40, 10]), 1, ctx); // centre in lab cell, below/right of the ink
  assert.equal(noInk.assigned, "lab");
  assert.equal(noInk.strictAnchorCue, false);
  assert.equal(noInk.anchorBoundary, true);
  const straddle = wordRecord(word("첩2027", [390, 112, 140, 16]), 2, ctx); // centre x = 460: no cell; box enters the lab cell
  assert.equal(straddle.assigned, null);
  assert.deepEqual(straddle.cellItems, []);
  assert.equal(straddle.anchorCellOverlap, true);
  assert.equal(straddle.anchorBoundary, true);
  const intoVal = wordRecord(word("첩2027", [380, 112, 260, 16]), 3, ctx); // centre x = 510: value cell, box also in lab cell
  assert.equal(intoVal.assigned, "val");
  assert.equal(intoVal.anchorBoundary, true);
  assert.equal(intoVal.strictAnchorCue, false);
});

test("selected line classes: anchor cue (mixed), other item only, undetermined", () => {
  const w = (l) => l.words.map((x, i) => wordRecord(x, i, ctx));
  const a = lineRecord(w(LINES[1]), ITEMS, "lab");
  assert.equal(a.lineClass, "anchorCue");
  assert.equal(a.lineMixed, true);
  assert.deepEqual(a.lineItems, [{ item: "lab", role: "label" }, { item: "val", role: "value" }]);
  const b = lineRecord(w(LINES[0]), ITEMS, "lab"); // header word + unassigned word
  assert.equal(b.lineClass, "otherItemOnly");
  assert.equal(b.lineMixed, false);
  assert.equal(b.lineUnassignedWords, 1);
  const onlyUnassigned = lineRecord([wordRecord(word("예정일", [450, 25, 60, 20]), 0, ctx)], ITEMS, "lab");
  assert.equal(onlyUnassigned.lineClass, "undetermined");
  const straddleLine = lineRecord([wordRecord(word("첩2027", [380, 112, 260, 16]), 0, ctx), wordRecord(word("완료", [510, 305, 40, 20]), 1, ctx)], ITEMS, "lab");
  assert.equal(straddleLine.lineClass, "undetermined"); // a word overlaps the anchor cell but is no strict cue
});

test("mixed line with the anchor present but only another word hit", () => {
  const recs = LINES[1].words.map((x, i) => wordRecord(x, i, ctx));
  const t = triggerRecord(recs, [2], { anchorItem: "lab", anchorText: "과수원 지도첩", items: ITEMS });
  assert.equal(t.hitAnchorCue, false);
  assert.equal(t.hitOtherItem, true);
  assert.equal(t.triggerSource, "otherOnly");
  assert.deepEqual(t.hitItems, [{ word: 2, item: "val", role: "value" }]);
  assert.equal(t.hitTextInAnchorText, false);
  const both = triggerRecord(recs, [0, 2], { anchorItem: "lab", anchorText: "과수원 지도첩", items: ITEMS });
  assert.equal(both.triggerSource, "both");
  assert.equal(both.hitTextInAnchorText, true);
});

// ------------------------------------------------------------------ whole page
test("anchor and value on different lines: value-side line selected, cue found on another line", () => {
  const lines = [
    LINES[0],
    line("과수원 지도첩", [12, 112, 140, 16], [word("과수원", [12, 112, 60, 16]), word("지도첩", [80, 112, 60, 16])]),
    line("2027-02-26 완료", [510, 112, 200, 16], [word("2027-02-26", [510, 112, 90, 16]), word("완료", [610, 112, 40, 16])]),
  ];
  const p = page({ lines, k1: { lineIndex: 2, lineText: lines[2].text, lineBox: lines[2].box, hitWords: [1], score: 1 } });
  const r = run(p);
  assert.equal(r.lineClass, "otherItemOnly");
  assert.equal(r.triggerSource, "otherOnly");
  assert.deepEqual(r.cueLines, [{ lineIndex: 1, k1Score: 2 }]);
  assert.equal(r.otherLineCue, true);
});

test("page record: band check, containment and deficits against both gold rects", () => {
  const r = run(page());
  assert.equal(r.lineClass, "anchorCue");
  assert.equal(r.anchorContained, true);
  assert.equal(r.valueContained, true);
  assert.equal(r.containment, "both");
  const short = run(page({ k1: { band: { left: 11, top: 100, width: 588, height: 40 } }, score: { evidence: "none", strict: false, state: "matched_not_strict" }, cohort: { evidence: "none", strict: false, role: "primary", state: "matched_not_strict" } }));
  assert.equal(short.containment, "neither");
  assert.deepEqual(short.anchorDeficit, { left: 1, top: 0, right: 0, bottom: 0 });
  assert.deepEqual(short.valueDeficit, { left: 0, top: 0, right: 1, bottom: 0 });
  assert.deepEqual(short.requiredExpansion, { left: 1, top: 0, right: 1, bottom: 0 });
  assert.equal(short.otherLineCue, false); // the selected line holds the cue
});

test("blank words are excluded from classes and counted; a blank hit word is counted", () => {
  const lines = [LINES[0], line("과수원  완료", [12, 112, 600, 16], [word("과수원", [12, 112, 60, 16]), word(" ", [80, 112, 5, 16]), word("2027", [510, 112, 40, 16])])];
  const r = run(page({ lines, k1: { lineIndex: 1, lineText: lines[1].text, lineBox: lines[1].box, hitWords: [1], score: 1 } }));
  assert.equal(r.lineBlankWords, 1);
  assert.equal(r.hitBlank, 1);
  assert.equal(r.triggerSource, "neither");
  assert.equal(r.words[1].blank, true);
  assert.equal(r.words[1].assigned, null);
});

test("validation failures never drop a page", () => {
  const bad = [
    page({ k1: { lineIndex: 7 } }),
    page({ k1: { lineIndex: 1.5 } }),
    page({ k1: { lineIndex: -1 } }),
    page({ k1: { hitWords: [] } }),
    page({ k1: { hitWords: [1, 0] } }),
    page({ k1: { hitWords: [0, 0] } }),
    page({ k1: { hitWords: [0, 9] } }),
    page({ k1: { lineText: "다른 줄" } }),
    page({ k1: { lineBox: [0, 0, 1, 1] } }),
    page({ k1: { branch: "k0" } }),
    page({ k1: { status: "error" } }),
    page({ pred: { status: "error" } }),
    page({ pred: { width: 999 } }),
    page({ goldParts: [{ item: "lab", rect: LAB_INK, size: [190, 20] }] }),
    page({ goldParts: [{ item: "lab", rect: LAB_INK, size: [190, 20] }, { item: "oth", rect: VAL_INK, size: [90, 16] }] }),
    page({ goldParts: [{ item: "lab", rect: [10, 110, 201, 130], size: [191, 20] }, { item: "val", rect: VAL_INK, size: [90, 16] }] }),
    page({ score: { evidence: "partial" } }),
    page({ score: { strict: false } }),
    page({ cohort: { role: "primary" } }),
    page({ cohort: { evidence: "none" } }),
    page({ k1: { band: { left: 0, top: 100, width: 1001, height: 40 } } }),
    page({ lines: [LINES[0], line(LINES[1].text, LINES[1].box, [word("과수원", [12, 112, NaN, 16])])] }),
    page({ items: [...ITEMS, { id: "lab", role: "label", text: "x", cell: [0, 0, 1, 1] }] }),
  ];
  bad.forEach((p, i) => assert.throws(() => run(p), (e) => e instanceof DiagnosticError && e.message.startsWith("p1: "), `case ${i}`));
});

test("stored K1 must equal the fixed K1 recomputation", () => {
  const p = page();
  assert.throws(() => run(p, () => ({ ...p.pred.k1, hitWords: [0] })), /K1/);
  assert.throws(() => run(p, () => ({ ...p.pred.k1, band: { ...p.pred.k1.band, width: 699 } })), /K1/);
});

// ------------------------------------------------------------------ denominators, registration, comparison, summary
test("denominators: unique keys and full counts, else failure", () => {
  const ids = ["a", "b"];
  const ok = {
    design: ids.map((id) => ({ id })),
    preds: ids.flatMap((id) => [{ ocr: "O0", id }, { ocr: "O1", id }]),
    ocr: ids.flatMap((id) => [{ ocr: "O0", id }, { ocr: "O1", id }]),
    score: ids.flatMap((id) => ["O0K0", "O0K1", "O1K0", "O1K1"].map((cond) => ({ cond, id }))),
  };
  assert.deepEqual(checkDenominators(ok, 2), { pages: 2, predictions: 4, ocr: 4, score: 8 });
  assert.throws(() => checkDenominators({ ...ok, preds: [...ok.preds.slice(1), ok.preds[1]] }, 2));
  assert.throws(() => checkDenominators({ ...ok, ocr: ok.ocr.slice(1) }, 2));
  assert.throws(() => checkDenominators({ ...ok, score: [...ok.score.slice(1), { cond: "O9K9", id: "a" }] }, 2));
  assert.throws(() => checkDenominators({ ...ok, design: [{ id: "a" }, { id: "a" }] }, 2));
});

test("registered existing split is checked", () => {
  const rows = (n, c) => Array.from({ length: n }, () => ({ containment: c }));
  const good = [...rows(15, "anchorOnly"), ...rows(3, "valueOnly"), ...rows(2, "neither"), ...rows(4, "both")];
  assert.doesNotThrow(() => checkRegistered(good));
  assert.throws(() => checkRegistered([...rows(14, "anchorOnly"), ...rows(4, "valueOnly"), ...rows(2, "neither"), ...rows(4, "both")]));
});

test("comparison catches swapped per-page classes even when marginals are equal", () => {
  const a = [{ id: "x", lineClass: "anchorCue", n: 1 }, { id: "y", lineClass: "otherItemOnly", n: 2 }];
  assert.equal(comparePages(a, structuredClone(a)).identical, true);
  const swapped = [{ id: "x", lineClass: "otherItemOnly", n: 1 }, { id: "y", lineClass: "anchorCue", n: 2 }];
  const c = comparePages(a, swapped);
  assert.equal(c.identical, false);
  assert.deepEqual(c.diffs.map((d) => d.key), ["x", "y"]);
  const extra = comparePages(a, [...structuredClone(a), { id: "z" }]);
  assert.deepEqual(extra.onlyInB, ["z"]);
  assert.equal(extra.identical, false);
  const dup = comparePages(a, [a[0], a[0], a[1]]);
  assert.deepEqual(dup.duplicatesInB, ["x"]);
  assert.equal(comparePages(a, [a[1], a[0]]).sameOrder, false);
  assert.equal(comparePages(a, [{ ...a[0], extra: 1 }, a[1]]).identical, false);
});

test("summary cross-tabs keep primary and control apart", () => {
  const rows = [
    { role: "primary", doctype: "repair", layout: "slip", containment: "anchorOnly", lineClass: "anchorCue", lineMixed: true, triggerSource: "anchorOnly", otherLineCue: false, cueLines: [{ lineIndex: 1, k1Score: 2 }], k1Score: 2, requiredExpansion: { left: 0, top: 0, right: 3, bottom: 0 } },
    { role: "primary", doctype: "repair", layout: "intake", containment: "neither", lineClass: "otherItemOnly", lineMixed: false, triggerSource: "otherOnly", otherLineCue: true, cueLines: [{ lineIndex: 4, k1Score: 1 }], k1Score: 2, requiredExpansion: { left: 0, top: 5, right: 0, bottom: 0 } },
    { role: "control", doctype: "rental", layout: "intake", containment: "both", lineClass: "anchorCue", lineMixed: false, triggerSource: "anchorOnly", otherLineCue: false, cueLines: [{ lineIndex: 0, k1Score: 3 }], k1Score: 3, requiredExpansion: { left: 0, top: 0, right: 0, bottom: 0 } },
  ];
  const s = summarize(rows);
  assert.equal(s.denominators.all, 3);
  assert.equal(s.denominators.primary, 2);
  assert.equal(s.containmentByLineClass.primary.anchorOnly.anchorCue, 1);
  assert.equal(s.containmentByLineClass.primary.neither.otherItemOnly, 1);
  assert.equal(s.containmentByLineClass.control.both.anchorCue, 1);
  assert.equal(s.containmentByLineClass.all.both.anchorCue, 1);
  assert.equal(s.otherLineCue.primary.selectedWithoutCue, 1);
  assert.equal(s.otherLineCue.primary.cueOnOtherLine, 1);
  assert.equal(s.otherLineCue.primary.otherCueScoreLower, 1);
  assert.equal(s.deficitSides.primary.right, 1);
  assert.equal(s.deficitSides.primary.top, 1);
  assert.equal(s.byLayout.slip.n, 1);
  assert.equal(s.byDoctypeLayout["repair/intake"].lineClass.otherItemOnly, 1);
});
