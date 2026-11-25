// ko-header-column: registered tests (protocol research/plans/2026-11-25-ko-header-column-protocol.md, 6).
// Written before the implementation (RED). Hand-computed cases: research/tools/ko-header-column/example/example.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as lib from "../src/ko-header-column-lib.mjs";
import * as fixed from "../src/ko-header-column-fixed.mjs";
import * as data from "../src/ko-header-column-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tools = resolve(here, "..", "tools", "ko-header-column");
const exText = readFileSync(join(tools, "example", "example.json"), "utf8");
const ex = JSON.parse(exText);
const exExact = lib.parseExact(exText);
ex.w4.forEach((c, i) => { c.linesExact = exExact.w4[i].lines; });

const w3lib = await fixed.loadFixedW3();
const k1lib = await fixed.loadFixedLib();

// ------------------------------------------------------------------ fixed objects
test("fixed blobs: #147 lib, #150 W1, #151 W2, #152 W3 match commit path, blob id and SHA-256", () => {
  const want = {
    lib: ["c0c2f5dd4178df3e02595176525cf88b2eaf68c2", "d882b6640fcafabcc62e14ebfd571749d88f4bf6"],
    w1: ["b108e2f0983bf096b4ddfc5d204a4d99cd6d8535", "6c23fc168ccdd833d87a7fc095005e0b71b64638"],
    w2: ["d75f54555101125a35dc8aeac8c06e5b29929593", "c2b0ad873bc6e149c4daf805df085f67bf3e26d6"],
    w3: ["6865828f7f3d723243d03bea1cafad6c74af5682", "fcf06458a360c8977c596cff465a7ad1b7b1867c"],
  };
  for (const [k, [commit, blob]] of Object.entries(want)) {
    assert.equal(fixed.FIXED[k].commit, commit);
    assert.equal(fixed.FIXED[k].blob, blob);
    const file = fixed.extractFixed(k);
    assert.equal(fixed.verifyFixedFile(file, blob), blob);
  }
  assert.equal(fixed.FIXED.w3.sha256, "a3fb4b70f9f4ef80110d8b9f1aeb3bb4e1810f39150f7e901ce5a242bbbcf547");
  assert.throws(() => fixed.fixedBlob({ ...fixed.FIXED.w3, sha256: "0".repeat(64) }), /SHA-256/);
});

test("OCR functions of the runner are the #147 runner functions byte for byte", () => {
  const want = fixed.fixedRunSource();
  const mine = readFileSync(resolve(here, "..", "src", "ko-header-column-run.mjs"), "utf8");
  for (const n of ["newWorker", "ocrLines", "withTimeout"]) {
    assert.ok(fixed.functionSource(want, n).length > 0);
    assert.equal(fixed.functionSource(mine, n), fixed.functionSource(want, n), n);
  }
});

// ------------------------------------------------------------------ question parser and fixed question types
test("parser: registered and boundary questions; fixed #152 questionTypes agree", () => {
  for (const p of ex.parser) {
    assert.deepEqual(lib.parseQuestion(p.q), p.expect, p.why + ": " + p.q);
    assert.deepEqual(w3lib.questionTypes(p.q), p.qtypes, p.q);
  }
});

test("12 registered questions: one fixed #152 type and one parsed field", () => {
  const design = JSON.parse(readFileSync(join(tools, "registered", "design.json"), "utf8"));
  assert.equal(design.sources.length, 12);
  for (const s of design.sources) {
    assert.deepEqual(w3lib.questionTypes(s.question), [s.qtype]);
    assert.deepEqual(lib.parseQuestion(s.question), { record: s.labels[s.slot], field: s.field, qtype: s.qtype });
  }
});

// ------------------------------------------------------------------ W3 scan from the fixed blob, then W4
const runW4 = (c) => {
  const w3 = w3lib.w3Rule(c.question, c.linesExact, c.k1, c.r);
  return { w3, w4: lib.w4Rule(c.question, c.linesExact, c.k1, c.r, w3) };
};
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

test("fixed #152 w3Rule exposes scan.units with original word indices (hand-computed)", () => {
  for (const c of ex.w4) {
    const { w3 } = runW4(c);
    if (c.expect.w3Reason) assert.equal(w3.w3Reason, c.expect.w3Reason, c.name);
    if (c.expect.scan) assert.deepEqual(w3.scan, c.expect.scan, c.name);
  }
});

test("W4 hand-computed cases (RECOUNT_SPEC 4)", () => {
  for (const c of ex.w4) {
    const { w4 } = runW4(c);
    const e = c.expect;
    assert.equal(w4.w4Reason, e.w4Reason, c.name);
    if ("w4From" in e) assert.equal(w4.w4From, e.w4From, c.name);
    if ("w4CutPixels" in e) assert.equal(w4.w4CutPixels, e.w4CutPixels, c.name);
    if ("w4" in e) assert.equal(w4.w4, e.w4, c.name);
    const d = w4.w4Diag;
    if ("anchorY" in e) assert.equal(d.anchorY, e.anchorY, c.name);
    if ("question" in e) assert.equal(d ? d.question : null, e.question, c.name);
    if ("qualified" in e) assert.deepEqual(d.qualified, e.qualified, c.name);
    if ("lineWhy" in e) assert.deepEqual(d.lines.map((l) => l.why), e.lineWhy, c.name);
    if ("line0Failure" in e) assert.equal(d.lines[0].failure, e.line0Failure, c.name);
    if ("groups0" in e) assert.deepEqual(d.lines[0].groups.map((g) => pick(g, ["words", "text", "box"])), e.groups0, c.name);
    if ("header" in e) assert.deepEqual(d.header, e.header, c.name);
    if ("assign" in e) assert.deepEqual(d.assign.map((a) => pick(a, ["unit", "column", "why", "dTarget", "dComp"])), e.assign, c.name);
    if ("counts" in e) assert.deepEqual(d.counts, e.counts, c.name);
    if ("chosen" in e) assert.equal(d.chosen, e.chosen, c.name);
    if (w4.w4) {
      const b = c.r.w2Reason === "cut" && w4.w4Reason === "applied" ? c.r.w2 : c.r.w1;
      assert.deepEqual(w4.w4, b, `${c.name}: W4 is W1 or W2`);
    }
  }
});

test("W4 inputs: five arguments only, no page id", () => {
  assert.equal(lib.w4Rule.length, 5);
});

// ------------------------------------------------------------------ exposure, attribution, display rounding
test("exposure: full / partial / none (touching) / null", () => {
  for (const c of ex.exposure) assert.equal(lib.exposure(c.ink, c.band), c.expect, c.why);
});

test("gold attribution: cell centres (half-open), one item, positive ink intersection", () => {
  for (const c of ex.attribute) {
    const page = structuredClone(ex.attributePage);
    if (c.pageWithoutTargetHeader) { delete page.items["h-target"]; page.targetHeaderItem = null; }
    const boxes = c.boxes.map((b) => b.map(String));
    const item = lib.attribute(boxes, page);
    assert.equal(item, c.expect, c.why);
    if (c.header) assert.equal(lib.headerClass(item, page), c.header, c.why);
    if (c.candidate) assert.equal(lib.candidateClass(item, page), c.candidate, c.why);
  }
});

test("area %p display: round half away from zero at two decimals", () => {
  for (const c of ex.pp) assert.equal(lib.ppText({ num: String(c.num), den: String(c.den) }), c.expect);
});

// ------------------------------------------------------------------ scoring and verdict on the 4-page example
test("scoring example: rows, totals and verdict (RECOUNT_SPEC 5-7)", () => {
  const s = ex.scoring;
  const rows = s.pages.map((pg, i) => lib.scorePage(s.predictions[i], pg, k1lib.scoreKey));
  for (const r of rows) {
    const e = s.expectRows[r.id];
    assert.deepEqual([r.w1.strict, r.w2.strict, r.w3.strict, r.w4.strict], e.strict, r.id);
    for (const k of ["t12", "t13", "t14", "t34", "opportunity", "event2", "event3", "event4", "prevented34", "lostParts3", "stage"]) if (k in e) assert.deepEqual(r[k], e[k], `${r.id} ${k}`);
    if (e.exposureW4) assert.deepEqual(r.exposure.w4, e.exposureW4, r.id);
    if (e.exposureW1) assert.deepEqual(r.exposure.w1, e.exposureW1, r.id);
    if ("reading" in e) assert.deepEqual(r.reading, e.reading, r.id);
    if ("attribution" in e) assert.deepEqual(r.attribution, e.attribution, r.id);
  }
  const sum = lib.summarizeScores(rows, { pageArea: s.pageArea });
  const t = sum.groups.total, et = s.expectTotal;
  for (const k of ["n", "error", "matched", "strict", "L2", "L3", "L4", "prevented34", "newLoss34", "recovered34", "cut", "applied", "opportunity", "event2", "event3", "event4"]) assert.deepEqual(t[k], et[k], k);
  assert.deepEqual(pick(t.attribution, ["applied", "correct", "wrong", "undetermined"]), et.attribution);
  assert.equal(t.reading.pages, et.reading.pages);
  assert.deepEqual(pick(t.reading.change.e1.w4, ["new", "newSources", "existing", "resolved"]), et.reading.e1W4);
  assert.equal(t.reading.change.e1.w2.new, et.reading.e1W2New);
  assert.equal(t.reading.change.e1.w3.new, et.reading.e1W3New);
  assert.deepEqual(t.reading.headerLost.w4, et.reading.headerLostW4);
  for (const k of ["w2", "w3", "w4", "w4Applied"]) {
    assert.deepEqual(t.area[k], et.area[k], k);
    assert.equal(lib.ppText(t.area[k]), et.areaText[k], k);
  }
  assert.equal(t.area.appliedPages, et.area.appliedPages);
  const v = sum.verdict, ev = s.expectVerdict;
  assert.equal(v.G1.pass, ev.G1);
  assert.equal(v.G2.pass, ev.G2);
  assert.deepEqual(pick(v.G3, ["L", "R", "pass"]), ev.G3);
  assert.deepEqual(pick(v.G4, ["denom", "correct", "status"]), ev.G4);
  assert.equal(v.geometry, ev.geometry);
  assert.deepEqual(pick(v.reading, ["comparable", "newE1", "status"]), ev.reading);
  assert.equal(v.final, ev.final);
  // public tables: render, check, and catch a single tampered cell
  const tables = lib.renderTables(sum);
  const md = Object.entries(tables).map(([k, ls]) => `<!-- khc:table ${k} -->\n${ls.join("\n")}\n<!-- /khc:table -->`).join("\n\n");
  assert.deepEqual(lib.checkTables(md, sum), []);
  const bad = md.replace(/\| 전체 \| 4 \|/, "| 전체 | 5 |");
  assert.notEqual(bad, md);
  assert.ok(lib.checkTables(bad, sum).length >= 1);
});

// ------------------------------------------------------------------ ids and the selector-side reader
test("id sets: duplicate, missing, extra and order are refused", () => {
  const ids = ["p000", "p001", "p002"];
  assert.ok(lib.checkIdSet(ids.map((id) => ({ id })), ids));
  assert.throws(() => lib.checkIdSet([{ id: "p000" }, { id: "p000" }, { id: "p002" }], ids), /duplicate/);
  assert.throws(() => lib.checkIdSet([{ id: "p000" }, { id: "p001" }], ids), /missing/);
  assert.throws(() => lib.checkIdSet([...ids, "p009"].map((id) => ({ id })), [...ids]), /unexpected/);
  assert.throws(() => lib.checkIdSet([{ id: "p001" }, { id: "p000" }, { id: "p002" }], ids), /order/);
});

test("selector-side reader refuses scoring paths", () => {
  const view = data.selectorView(() => Buffer.from("x"));
  assert.equal(view("selector/questions.json").toString(), "x");
  assert.equal(view("selector/images/p012.png").toString(), "x");
  for (const p of ["scoring/gold.json", "scoring/design.json", "scoring/render.json", "selector/../scoring/gold.json", "checks.json", "selector/images/a b.png"]) {
    assert.throws(() => view(p), data.AccessDenied, p);
  }
});

// ------------------------------------------------------------------ registered design regenerates byte for byte
test("design.py regenerates the registered design.json and questions.json", () => {
  const out = mkdtempSync(join(tmpdir(), "khc-design-"));
  execFileSync("python", [join(tools, "design.py"), "--out", out], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const f of ["design.json", "questions.json"]) assert.ok(readFileSync(join(out, f)).equals(readFileSync(join(tools, "registered", f))), f);
});
