// ko-row-gate: registered tests (protocol research/plans/2026-11-24-ko-row-gate-protocol.md, 6).
// Written before the implementation (RED). The shared hand-computed example is research/tools/ko-row-gate/example/example.json.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  researchDir, FIXED, extractFixed, verifyFixedFile, loadFixedLib, loadFixedW1, loadFixedW2, fixedRunSource, functionSource,
} from "../src/ko-row-gate-fixed.mjs";
import {
  ValidationError, squash, questionTypes, grammarMatch, parseExact, decStr, w3Rule, exposure, classifyCandidate,
  validatePrediction, buildPrediction, scorePage, summarizeScores, renderTables, checkTables, checkIdSet, diffRows,
  normalizeQuestion, duplicateCheck,
} from "../src/ko-row-gate-lib.mjs";
import { selectorView, AccessDenied, EARLIER } from "../src/ko-row-gate-data.mjs";

const EX_TEXT = readFileSync(join(researchDir, "tools", "ko-row-gate", "example", "example.json"), "utf8");
const EX = JSON.parse(EX_TEXT); // ordinary numbers (K1, W1, W2, scoring)
const EXX = parseExact(EX_TEXT); // numbers kept as their JSON source text (W3, RECOUNT_SPEC 4.0)
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const W3_KEYS = ["qtypes", "validHits", "scan", "w3Reason", "w3From", "w3", "w3CutPixels"];
const DEF = { reason: "widened", w1: { left: 0, top: 0, width: 400, height: 200 }, w2: { left: 0, top: 0, width: 400, height: 60 }, w2Reason: "cut" };
const rOf = (c) => (c.r === "DEF" ? structuredClone(DEF) : structuredClone(c.r));
const predOf = (name) => EX.scoring.pages.find((p) => p.pred.id === name).pred;

/** Score row -> the hand-computed projection used in example.json. */
function project(row) {
  return {
    stage: row.stage, strict: { w1: row.w1.strict, w2: row.w2.strict, w3: row.w3.strict }, t12: row.t12, t13: row.t13,
    fullPageToPartial2: row.fullPageToPartial2, fullPageToPartial3: row.fullPageToPartial3, lostParts2: row.lostParts2, lostParts3: row.lostParts3,
    prevented: row.prevented, cutPixels2: row.cutPixels2, cutPixels3: row.cutPixels3, candidateCount: row.candidateCount, uniqueCandidate: row.uniqueCandidate,
    othersW1: row.others ? row.others.w1 : null, fromW1Full2: row.others ? row.others.fromW1Full2 : null, fromW1Full3: row.others ? row.others.fromW1Full3 : null,
    opportunity: row.opportunity, event2: row.event2, event3: row.event3, error: row.error,
  };
}
async function rows() {
  const { scoreKey } = await loadFixedLib();
  return EX.scoring.pages.map((p) => scorePage(p.pred, p.page, scoreKey));
}

test("squash, question types and the strict value grammar", () => {
  for (const c of EX.squash) assert.equal(squash(c.in), c.out, c.why);
  for (const c of EX.qtypes) assert.deepEqual(questionTypes(c.q), c.out, c.q);
  for (const [t, s, ok] of EX.grammar) assert.equal(grammarMatch(t, s), ok, `${t} ${s}`);
});

test("exact decimals: JSON number source text is kept; decStr prints exact values", () => {
  const x = parseExact('{"a": [0.1, 1e2, -0, 3.50], "b": "0.1"}');
  assert.deepEqual(x, { a: ["0.1", "1e2", "-0", "3.50"], b: "0.1" });
  assert.equal(decStr("120"), "120");
  assert.equal(decStr("0.30"), "0.3");
  assert.equal(decStr("1e2"), "100");
  assert.equal(decStr("-0"), "0");
  assert.equal(decStr("38.4375"), "38.4375");
  assert.equal(decStr("3.50"), "3.5");
});

test("W3 rule: every hand-computed case (exact decimals, shared-hit condition, breaks, reasons)", () => {
  assert.ok(EX.w3.length >= 30);
  EX.w3.forEach((c, i) => {
    const got = w3Rule(c.q, c.lines === null ? null : EXX.w3[i].lines, c.k1, rOf(c));
    assert.deepEqual(pick(got, W3_KEYS), c.expect, c.name);
  });
});

test("W3 rule: the decision uses only question, OCR lines, K1 and the fixed W2 result", () => {
  assert.equal(w3Rule.length, 4);
  for (const c of EX.w3) {
    if (!c.lines) continue;
    const r = rOf(c);
    const out = w3Rule(c.q, EXX.w3[EX.w3.indexOf(c)].lines, c.k1, r);
    if (out.w3 === null) continue;
    const same = (a, b) => a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
    assert.ok(same(out.w3, r.w1) || same(out.w3, r.w2), `${c.name}: W3 is W1 or W2`);
    assert.ok(out.w3.top <= r.w2.top && out.w3.top + out.w3.height >= r.w2.top + r.w2.height, `${c.name}: W2 inside W3`);
    assert.ok(out.w3.top >= r.w1.top && out.w3.top + out.w3.height <= r.w1.top + r.w1.height, `${c.name}: W3 inside W1`);
  }
});

test("pipeline: fixed #150 W1 and #151 W2 then W3 on hand-computed pages", async () => {
  const { w1Rule } = await loadFixedW1();
  const { w2Rule } = await loadFixedW2();
  EX.pipeline.forEach((c, i) => {
    const r = w2Rule(w1Rule, c.lines, c.k1, c.width, c.height);
    assert.deepEqual(pick(r, ["reason", "w1", "w2Reason", "w2", "cutPixels"]), pick(c.expect, ["reason", "w1", "w2Reason", "w2", "cutPixels"]), c.name);
    const w3 = w3Rule(c.q, EXX.pipeline[i].lines, c.k1, r);
    assert.deepEqual(pick(w3, ["w3Reason", "w3From", "w3", "w3CutPixels"]), pick(c.expect, ["w3Reason", "w3From", "w3", "w3CutPixels"]), c.name);
  });
});

test("exposure: touching edges have zero intersection, one pixel row is partial, equal edges are inside", () => {
  for (const c of EX.exposure) assert.equal(exposure(c.ink, c.band), c.expect, c.name);
});

test("candidate classification: centres in one half-open item cell and a positive ink intersection", () => {
  for (const c of EX.classify) assert.deepEqual(classifyCandidate(c.cand, EX.classifyPage), c.expect, c.name);
});

test("prediction validation: W1/W2 by the fixed rule, W3 reason, source window and scan consistency", () => {
  for (const p of EX.scoring.pages) assert.doesNotThrow(() => validatePrediction(p.pred), p.pred.id);
  for (const c of EX.predictionInvalid) {
    const bad = { ...structuredClone(predOf(c.base)), ...structuredClone(c.patch) };
    assert.throws(() => validatePrediction(bad), ValidationError, c.name);
  }
});

test("scoring: hand-computed rows (applied target, applied decoy loss, prevented W2 loss, hold, n/a, error, unmatched, full-page recovery)", async () => {
  const r = await rows();
  EX.scoring.pages.forEach((p, i) => assert.deepEqual(project(r[i]), p.expect, p.page.id));
  assert.equal(r[7].t13, "recovered");
  assert.equal(r[7].fullPageToPartial3, true, "the only recovery is W1 full page -> partial window");
});

test("summary: totals, layout verdicts and areas, lists, invariants", async () => {
  const s = summarizeScores(await rows(), { pageArea: EX.scoring.pageArea });
  for (const [k, v] of Object.entries(EX.scoring.total)) assert.deepEqual(s.groups.total[k], v, `total.${k}`);
  for (const [layout, want] of Object.entries(EX.scoring.layoutVerdicts)) {
    for (const [k, v] of Object.entries(want)) assert.deepEqual(s.groups.layout[layout][k], v, `${layout}.${k}`);
  }
  assert.deepEqual(s.lists, EX.scoring.lists);
  assert.equal(s.invariants.lost3SubsetLost2, true);
  assert.equal(s.invariants.events3SubsetEvents2, true);
  assert.equal(s.invariants.newlyFullW3, 0);
  assert.equal(s.invariants.newEvidenceW3, 0);
  assert.equal(s.invariants.recoveredNotFullPage, 0);
});

test("public tables: rendered cells are checked one by one; a changed cell is found", async () => {
  const s = summarizeScores(await rows(), { pageArea: EX.scoring.pageArea });
  const tables = renderTables(s);
  assert.deepEqual(tables.sources, EX.scoring.sourcesTable);
  assert.equal(tables.groups[2], EX.scoring.groupsTotalRow);
  const md = Object.entries(tables).map(([name, lines]) => `<!-- krg:table ${name} -->\n${lines.join("\n")}\n<!-- /krg:table -->`).join("\n\ntext\n\n");
  assert.deepEqual(checkTables(md, s), []);
  const bad = md.replace("| 전체 | 8 |", "| 전체 | 9 |");
  assert.notEqual(bad, md);
  const found = checkTables(bad, s);
  assert.equal(found.length, 1);
  assert.equal(found[0].table, "groups");
  assert.ok(checkTables(md.replace("<!-- krg:table area -->", "<!-- krg:table areaX -->"), s).length > 0, "missing table");
  assert.ok(checkTables(md.replace("SFF applied c1 D", "SFF applied c1 T"), s).length > 0, "source cell");
});

test("ID sets: duplicates, missing and extra ids and order are rejected", () => {
  const ids = ["a", "b", "c"];
  assert.doesNotThrow(() => checkIdSet([{ id: "a" }, { id: "b" }, { id: "c" }], ids));
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "a" }, { id: "c" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "b" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], ids), ValidationError);
  assert.throws(() => checkIdSet([{ id: "b" }, { id: "a" }, { id: "c" }], ids), ValidationError, "order differs");
});

test("row comparison catches tampers that keep every marginal total", async () => {
  const r = await rows();
  assert.deepEqual(diffRows(r, r), []);
  const t = structuredClone(r);
  [t[0].t13, t[1].t13] = [t[1].t13, t[0].t13]; // keptSuccess <-> lost: totals by swap unchanged
  assert.deepEqual(diffRows(r, t).map((d) => d.id), ["p1", "p2"]);
  const u = structuredClone(r);
  u[0].uniqueCandidate.class = "intended_decoy";
  u[1].uniqueCandidate.class = "target_value";
  assert.deepEqual(diffRows(r, u).map((d) => d.id), ["p1", "p2"]);
});

test("replay: fixed #151 buildPrediction joins OCR/K1/image; W3 fields follow; ids do not change the decision", async () => {
  const { w1Rule } = await loadFixedW1();
  const w2lib = await loadFixedW2();
  const c = EX.pipeline[0];
  const linesExact = EXX.pipeline[0].lines;
  const base = { id: "p", question: c.q, pngSha256: "x", width: c.width, height: c.height,
    ocrRow: { id: "p", pngSha256: "x", width: c.width, height: c.height, status: "ok", error: null, ocrSha256: "y", ocrLines: c.lines },
    ocrLinesExact: linesExact, k1Row: { id: "p", status: "ok", error: null, k1: c.k1 } };
  const same = () => structuredClone(c.k1);
  const pred = buildPrediction(base, same, { w1Rule, w2lib });
  assert.equal(pred.reason, "widened");
  assert.equal(pred.w2Reason, "cut");
  assert.equal(pred.w3Reason, "applied");
  assert.deepEqual(pred.w3, c.expect.w3);
  assert.deepEqual(Object.keys(pred), ["id", "pngSha256", "ocrSha256", "width", "height", "state", "error", "branch", "lineIndex", "hitWords", "reason", "w0", "w1", "candidates", "maxRight", "clippedRight", "addedPixels", "w2Reason", "hitTop", "hitBottom", "pad", "w2", "cutPixels", "qtypes", "validHits", "scan", "w3Reason", "w3From", "w3", "w3CutPixels"]);
  assert.doesNotThrow(() => validatePrediction(pred));
  const otherId = "lecture-table-c0-below-same";
  const renamed = buildPrediction({ ...base, id: otherId, ocrRow: { ...base.ocrRow, id: otherId }, k1Row: { ...base.k1Row, id: otherId } }, same, { w1Rule, w2lib });
  assert.deepEqual({ ...renamed, id: "p" }, pred, "a page id does not change any decision");
  assert.throws(() => buildPrediction(base, () => ({ ...c.k1, hitWords: [1] }), { w1Rule, w2lib }), ValidationError, "recomputed K1 differs");
  assert.throws(() => buildPrediction({ ...base, ocrRow: { ...base.ocrRow, id: "other" } }, same, { w1Rule, w2lib }), ValidationError, "id join");
  assert.throws(() => buildPrediction({ ...base, pngSha256: "z" }, same, { w1Rule, w2lib }), ValidationError, "image hash");
  const e = "timeout: timeout 180000 ms";
  const err = buildPrediction({ ...base, ocrRow: { ...base.ocrRow, status: "error", error: e, ocrLines: null }, ocrLinesExact: null,
    k1Row: { id: "p", status: "error", error: e, k1: { status: "error", error: e, branch: "k0" } } }, same, { w1Rule, w2lib });
  assert.equal(err.state, "error");
  assert.equal(err.w3, null);
  assert.equal(err.w3Reason, "error");
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
  assert.deepEqual(log.map((x) => x.path), ["selector/questions.json", "selector/images/a.png"]);
  assert.ok(log.every((x) => /^[0-9a-f]{64}$/.test(x.sha256)));
});

test("fixed objects: #147 library, #150 W1 and #151 W2 written byte for byte from Git; a changed copy is refused", () => {
  assert.equal(FIXED.lib.blob, "d882b6640fcafabcc62e14ebfd571749d88f4bf6");
  assert.equal(FIXED.w1.blob, "6c23fc168ccdd833d87a7fc095005e0b71b64638");
  assert.equal(FIXED.w1.sha256, "47843d641b9f3dc1706c354fc671274ea0f13984f4534809a540cc4eaf8471d3");
  assert.equal(FIXED.w2.commit, "d75f54555101125a35dc8aeac8c06e5b29929593");
  assert.equal(FIXED.w2.blob, "c2b0ad873bc6e149c4daf805df085f67bf3e26d6");
  assert.equal(FIXED.w2.sha256, "71be99cc91f7d67acb6afa9f37ede47871f57656b3d3cda8ccb5405c29b645a3");
  assert.equal(FIXED.selector.blob, "b3b4965b2d330907c0143fe178013aace1be8372");
  for (const name of ["lib", "w1", "w2"]) {
    const f = extractFixed(name);
    assert.equal(verifyFixedFile(f, FIXED[name].blob), FIXED[name].blob, name);
  }
  const dir = mkdtempSync(join(tmpdir(), "krg-"));
  const bad = join(dir, "w2.mjs");
  writeFileSync(bad, Buffer.concat([readFileSync(extractFixed("w2")), Buffer.from("\n")]));
  assert.throws(() => verifyFixedFile(bad, FIXED.w2.blob));
});

test("OCR functions of the runner are the #147 runner functions byte for byte", () => {
  const want = fixedRunSource();
  const mine = readFileSync(join(researchDir, "src", "ko-row-gate-run.mjs"), "utf8");
  for (const n of ["newWorker", "ocrLines", "withTimeout"]) {
    assert.ok(functionSource(want, n).length > 0, n);
    assert.equal(functionSource(mine, n), functionSource(want, n), n);
  }
});

test("question normalization, duplicate check, and the earlier sets include #151", () => {
  assert.equal(normalizeQuestion("  가  나\u3000다 "), "가 나 다");
  assert.equal(normalizeQuestion("\u1100\u1161"), "가");
  const r = duplicateCheck(
    [{ id: "n1", pngSha256: "aa", question: "가 나?" }, { id: "n2", pngSha256: "bb", question: "다라?" }],
    [{ source: "old", id: "o1", pngSha256: "bb", question: " 가  나? " }],
  );
  assert.deepEqual(r.imageOverlap, [{ id: "n2", source: "old", other: "o1" }]);
  assert.deepEqual(r.questionOverlap, [{ id: "n1", source: "old", other: "o1" }]);
  const s151 = EARLIER.find((e) => e.commit === "d75f54555101125a35dc8aeac8c06e5b29929593");
  assert.ok(s151, "#151 data is an earlier set");
  assert.equal(s151.questions.blob, "ee9739587ea1af7fac19271aee2d0656ff281b9f");
  assert.equal(s151.images.tree, "88c66c60d9a57a00a636f252786d36f3cd597c3b");
  for (const c of ["0fb30531aabaa9f55b8c9fdc34ee9d03042936c1", "708d9946ae091180a1b716baadfdd73fcfe5a19b", "2ab9ed149896cc06cec387826ab99fa5bac77cda", "b108e2f0983bf096b4ddfc5d204a4d99cd6d8535"]) {
    assert.ok(EARLIER.some((e) => e.commit === c), c);
  }
});

test("README reproduction commands name files that exist", () => {
  const readme = join(researchDir, "results", "ko-row-gate", "README.md");
  assert.ok(existsSync(readme));
  const text = readFileSync(readme, "utf8");
  for (const f of ["src/ko-row-gate-run.mjs", "src/ko-row-gate-replay.mjs", "src/ko-row-gate-score.mjs", "src/ko-row-gate-compare.mjs", "src/ko-row-gate-data.mjs", "src/ko-row-gate-report.mjs", "tools/ko-row-gate/design.py", "tools/ko-row-gate/recount.py"]) {
    assert.ok(text.includes(f), f);
    assert.ok(existsSync(join(researchDir, f)), f);
  }
});
