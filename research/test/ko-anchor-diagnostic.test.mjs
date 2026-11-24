// Hand-built tests for the Korean anchor signal diagnostic (protocol section 7).
// Run: node --test test/ko-anchor-diagnostic.test.mjs  (from research/)
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
  SOURCES, checkSelectorFile, collect, gitBlobId, hangulBigrams, inCell, parseDataset, projectForCollector, readSources,
  replayRow, scoreRow, sourceControl, validateDataset,
} from "../src/ko-anchor-diagnostic-lib.mjs";
import { selectWindow } from "../src/selector.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8", windowsHide: true }).trim();

// ------------------------------------------------------------------ representation
test("bigrams: overlapping pairs inside one Hangul run, sorted and unique", () => {
  assert.deepEqual(hangulBigrams("예산 검토 일정은 언제인가요?"), ["가요", "검토", "언제", "예산", "인가", "일정", "정은", "제인"]);
  assert.deepEqual(hangulBigrams("하하하"), ["하하"]);
  assert.deepEqual(hangulBigrams("SX-5134"), []);
  assert.deepEqual(hangulBigrams(""), []);
});

test("bigrams: one syllable gives none; spaces, punctuation and non-Hangul break runs", () => {
  assert.deepEqual(hangulBigrams("암"), []);
  assert.deepEqual(hangulBigrams("가나 다라"), ["가나", "다라"]);
  assert.deepEqual(hangulBigrams("가나,다라"), ["가나", "다라"]);
  assert.deepEqual(hangulBigrams("가나a다라"), ["가나", "다라"]);
  // Compatibility jamo are not modern syllables.
  assert.deepEqual(hangulBigrams("ㄱㄴ"), []);
});

test("bigrams: decomposed (NFD) input equals NFC", () => {
  const nfd = "예산 검토".normalize("NFD");
  assert.notEqual(nfd, "예산 검토");
  assert.deepEqual(hangulBigrams(nfd), ["검토", "예산"]);
});

// ------------------------------------------------------------------ fixtures
const IMAGE = {
  id: "x-ko", lang: "ko", anchor: "nl", page: { width: 1280, height: 960 }, question: "예산 검토 일정은 언제인가요?", anchorItem: "r1l",
  items: [
    { id: "title", role: "title", text: "주간 일정", cell: [0, 0, 1280, 80] },
    { id: "r0l", role: "label", text: "채용 면접", cell: [100, 40, 300, 100] },
    { id: "r1l", role: "label", text: "예산 검토", cell: [100, 100, 300, 150] },
    { id: "r1v", role: "value", text: "08:00", cell: [300, 100, 500, 150] },
  ],
};
const word = (text, cx, cy, w = 20, h = 10) => ({ text, box: [cx - w / 2, cy - h / 2, w, h] });
const input = (words, extra = {}) => ({ dataset: "t", id: "x-ko", question: IMAGE.question, width: 1280, height: 960, status: "ok", ocrLines: [{ text: words.map((w) => w.text).join(" "), words }], ...extra });
const base = { keys: [], matched: false };

// ------------------------------------------------------------------ scoring categories
test("empty keys and non-Hangul OCR: absent, baseline keys empty", () => {
  const r = scoreRow(collect(input([word("AE", 150, 125), word("HE", 200, 125)])), IMAGE, base);
  assert.equal(r.category, "absent");
  assert.equal(r.baselineKeyCount, 0);
  assert.deepEqual(r.S, ["검토", "예산"]);
});

test("hand-computed positive: Hangul word in the target cell is detected as inside", () => {
  const r = scoreRow(collect(input([word("예산", 150, 125)])), IMAGE, base);
  assert.equal(r.category, "inside");
  assert.equal(r.insideWords, 1);
  assert.equal(r.alsoOutside, false);
});

test("half-open cell: left/top edge inside, right/bottom edge outside", () => {
  assert.equal(inCell([100, 100], [100, 100, 300, 150]), true);
  assert.equal(inCell([300, 120], [100, 100, 300, 150]), false);
  assert.equal(inCell([200, 150], [100, 100, 300, 150]), false);
  assert.equal(inCell([299.99, 149.99], [100, 100, 300, 150]), true);
  assert.equal(scoreRow(collect(input([word("예산", 100, 100)])), IMAGE, base).category, "inside");
  assert.equal(scoreRow(collect(input([word("예산", 300, 125)])), IMAGE, base).category, "outside_only");
  assert.equal(scoreRow(collect(input([word("예산", 200, 150)])), IMAGE, base).category, "outside_only");
});

test("outside only and simultaneous inside/outside hits", () => {
  const out = scoreRow(collect(input([word("검토", 700, 700)])), IMAGE, base);
  assert.equal(out.category, "outside_only");
  assert.equal(out.outsideWords, 1);
  const both = scoreRow(collect(input([word("검토", 700, 700), word("예산", 150, 125)])), IMAGE, base);
  assert.equal(both.category, "inside");
  assert.equal(both.alsoOutside, true);
});

test("generic question overlap is a separate column, not a target hit", () => {
  const r = scoreRow(collect(input([word("일정은", 150, 125)])), IMAGE, base);
  assert.equal(r.category, "absent");
  assert.deepEqual(r.genericOverlap, ["일정", "정은"]);
});

test("one-syllable label is not_applicable; question without the label signal is no_question_signal", () => {
  const one = { ...IMAGE, question: "암의 금액은 얼마인가요?", items: [{ id: "r1l", role: "label", text: "암", cell: [100, 100, 300, 150] }] };
  assert.equal(scoreRow(collect({ ...input([word("암", 150, 125)]), question: one.question }), one, base).category, "not_applicable");
  const none = { ...IMAGE, question: "종이 타월의 금액은?" };
  assert.equal(scoreRow(collect({ ...input([word("예산", 150, 125)]), question: none.question }), none, base).category, "no_question_signal");
});

test("technical errors: OCR status error and a malformed design are kept, not dropped", () => {
  const err = collect({ ...input([]), status: "error", ocrLines: null });
  assert.equal(scoreRow(err, IMAGE, base).category, "technical_error");
  const twoAnchors = { ...IMAGE, items: [...IMAGE.items, { ...IMAGE.items[2] }] };
  assert.equal(scoreRow(collect(input([])), twoAnchors, base).category, "technical_error");
});

// ------------------------------------------------------------------ blind collector
test("collector rejects fields outside the allowed set at every level", () => {
  assert.throws(() => collect(input([], { keys: [] })), /field row\.keys/);
  assert.throws(() => collect(input([], { band: null })), /field row\.band/);
  assert.throws(() => collect({ ...input([]), ocrLines: [{ text: "a", words: [], confidence: 90 }] }), /field line\.confidence/);
  assert.throws(() => collect({ ...input([]), ocrLines: [{ text: "a", words: [{ text: "a", box: [0, 0, 1, 1], anchorItem: "r1l" }] }] }), /field word\.anchorItem/);
});

test("projection drops stored selector output and confidences", () => {
  const rec = { id: "x-ko", status: "ok", width: 1280, height: 960, keys: ["k"], matched: true, band: { left: 0 }, score: 1, ocrLines: [{ text: "예산", confidence: 50, box: [0, 0, 1, 1], words: [{ text: "예산", box: [140, 120, 20, 10], confidence: 50 }] }] };
  const p = projectForCollector("t", { id: "x-ko", question: IMAGE.question }, rec);
  assert.deepEqual(Object.keys(p).sort(), ["dataset", "height", "id", "ocrLines", "question", "status", "width"]);
  const c = collect(p);
  assert.equal(c.syllableWords, 1);
  assert.deepEqual(c.signalWords[0].center, [150, 125]);
});

// ------------------------------------------------------------------ rendered-text control
test("rendered-text control finds the target signal inside and counts other-cell overlap", () => {
  const ctl = sourceControl("t", IMAGE);
  assert.equal(ctl.category, "inside");
  assert.equal(ctl.otherCellsWithTargetSignal, 0);
  assert.equal(ctl.otherCellsWithGeneric, 1); // title "주간 일정" shares 일정
});

// ------------------------------------------------------------------ baseline replay
test("replay: real selectWindow agrees with its own stored output; a changed field is a mismatch", () => {
  const lines = [{ text: "SX-5134 Budget review 08:00", confidence: 80, box: [80, 400, 900, 22], words: [{ text: "SX-5134", box: [80, 400, 80, 20] }, { text: "Budget", box: [260, 400, 70, 22] }, { text: "review", box: [340, 400, 70, 22] }, { text: "08:00", box: [960, 400, 60, 20] }] }];
  const q = { id: "a", question: "When is SX-5134?" };
  const sel = selectWindow(lines, q.question, 1280, 960);
  const rec = { id: "a", status: "ok", width: 1280, height: 960, keys: sel.keys, matched: sel.matched, score: sel.score, lineText: sel.lineText, confidence: sel.confidence, axisRow: sel.axisRow, band: sel.band, ocrLines: lines };
  assert.equal(replayRow(selectWindow, "fcp", q, rec).ok, true);
  assert.deepEqual(replayRow(selectWindow, "fcp", q, { ...rec, band: { ...rec.band, top: rec.band.top + 1 } }).mismatches, ["band"]);
  assert.deepEqual(replayRow(selectWindow, "fcp", q, { ...rec, keys: [...rec.keys].reverse().concat("x") }).mismatches, ["keys"]);
  assert.deepEqual(replayRow(selectWindow, "r09", q, { ...rec, matchedLine: { text: "other" } }).mismatches, ["matchedLine.text"]);
  const ko = { id: "b", question: "예산 검토 일정은 언제인가요?" };
  const um = replayRow(selectWindow, "fcp", ko, { id: "b", status: "ok", width: 1280, height: 960, keys: [], matched: false, score: 0, lineText: null, confidence: null, axisRow: null, band: null, ocrLines: lines });
  assert.equal(um.ok, true);
  assert.equal(um.kind, "unmatched");
});

test("replay: selector exception is a replay error; stored technical error is not replayed", () => {
  const boom = () => { throw new Error("boom"); };
  const r = replayRow(boom, "fcp", { id: "a", question: "q" }, { id: "a", status: "ok", width: 1, height: 1, ocrLines: [] });
  assert.equal(r.kind, "replay_error");
  assert.equal(r.ok, false);
  const t = replayRow(boom, "fcp", { id: "a", question: "q" }, { id: "a", status: "error", error: "timeout" });
  assert.equal(t.kind, "technical_error");
});

// ------------------------------------------------------------------ source integrity
test("sources: fixed blobs pass validation; tampered bytes and fields are detected", () => {
  const bytes = readSources(repo);
  for (const ds of ["r09", "fcp"]) {
    const d = parseDataset(bytes[ds]);
    assert.deepEqual(validateDataset(ds, d), []);
    const tampered = Buffer.from(bytes[ds].ocr);
    tampered[10] ^= 1;
    assert.notEqual(gitBlobId(tampered), SOURCES[ds].ocr.blob);
    const clone = () => structuredClone(d);
    let c = clone(); c.ocr[0].width += 1;
    assert.match(validateDataset(ds, c).join("\n"), /size/);
    c = clone(); c.questions[1].question += " ";
    assert.match(validateDataset(ds, c).join("\n"), /question differs/);
    c = clone(); const ko = c.design.images.find((im) => im.lang === "ko" && im.anchor === "nl"); ko.items.find((it) => it.id === ko.anchorItem).role = "value";
    assert.match(validateDataset(ds, c).join("\n"), /target role/);
    c = clone(); const im = c.design.images[0]; im.items.push({ ...im.items.find((it) => it.id === im.anchorItem) });
    assert.match(validateDataset(ds, c).join("\n"), /2 anchor items/);
    c = clone(); c.ocr.pop();
    assert.match(validateDataset(ds, c).join("\n"), /ocr rows count 47/);
  }
  const selPath = join(repo, "research/src/selector.mjs");
  assert.doesNotThrow(() => checkSelectorFile(repo, selPath));
  const tmp = mkdtempSync(join(tmpdir(), "kad-sel-"));
  try {
    const copy = join(tmp, "selector.mjs");
    writeFileSync(copy, Buffer.concat([readFileSync(selPath), Buffer.from(" ")]));
    assert.throws(() => checkSelectorFile(repo, copy), /selector blob/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ CLI: guard, determinism, result tamper
test("CLI refuses without the offline guard, verifies its own output and detects a tampered result", () => {
  const cli = join(repo, "research/src/ko-anchor-diagnostic.mjs");
  const guard = join(repo, "research/tools/d03/guard/node-netguard.cjs");
  const tmp = mkdtempSync(join(tmpdir(), "kad-"));
  try {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const noGuard = spawnSync(process.execPath, [cli, "--out", join(tmp, "x")], { env, encoding: "utf8", windowsHide: true });
    assert.notEqual(noGuard.status, 0);
    assert.match(noGuard.stderr, /offline guard missing/);
    const genv = { ...env, NODE_OPTIONS: `--require=${guard}` };
    const a = spawnSync(process.execPath, [cli, "--out", join(tmp, "a")], { env: genv, encoding: "utf8", windowsHide: true });
    assert.equal(a.status, 0, a.stderr);
    const v = spawnSync(process.execPath, [cli, "--verify", join(tmp, "a")], { env: genv, encoding: "utf8", windowsHide: true });
    assert.equal(v.status, 0, v.stdout + v.stderr);
    cpSync(join(tmp, "a"), join(tmp, "b"), { recursive: true });
    const p = join(tmp, "b", "summary.json");
    const orig = readFileSync(p, "utf8");
    const changed = orig.replace(/"denominator": (\d+)/, (_, n) => `"denominator": ${Number(n) + 1}`);
    assert.notEqual(changed, orig);
    writeFileSync(p, changed);
    const vb = spawnSync(process.execPath, [cli, "--verify", join(tmp, "b")], { env: genv, encoding: "utf8", windowsHide: true });
    assert.equal(vb.status, 1);
    assert.match(vb.stdout, /summary\.json/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
