// R09 bilingual evidence-region study: geometry, outcome classes, pair tables and design invariants. Offline.
import assert from "node:assert/strict";
import { test } from "node:test";
import { alignRecords, classify, containsRect, outwardRect, pairStats } from "../src/r09-lib.mjs";
import { buildDesign, buildDevDesign, checkDesign, questionsOf } from "../src/r09-design.mjs";

const page = { width: 1000, height: 800 };
const gold = [{ item: "a", rect: [100, 200, 150, 220] }, { item: "v", rect: [400, 200, 460, 222] }];
const ok = (band) => ({ status: "ok", matched: true, band });

test("outward rounding: floor top-left, ceil bottom-right", () => {
  assert.deepEqual(outwardRect([10.2, 20.9, 30.1, 40.0]), [10, 20, 31, 40]);
  assert.deepEqual(outwardRect([10, 20, 30, 40]), [10, 20, 30, 40]);
});

test("half-open containment: exact boundary passes, 1px cut on any side fails", () => {
  const r = [100, 200, 150, 220];
  assert.equal(containsRect([100, 200, 150, 220], r), true);
  assert.equal(containsRect([101, 200, 150, 220], r), false);
  assert.equal(containsRect([100, 201, 150, 220], r), false);
  assert.equal(containsRect([100, 200, 149, 220], r), false);
  assert.equal(containsRect([100, 200, 150, 219], r), false);
});

test("small window holding every gold part is the only primary success", () => {
  const c = classify(ok({ left: 50, top: 150, width: 500, height: 100 }), gold, page);
  assert.equal(c.category, "window_complete");
  assert.equal(c.success, true);
  assert.equal(c.evidencePreserved, true);
  assert.equal(c.areaRatio, (500 * 100) / (1000 * 800));
});

test("boundary-exact window succeeds; a window 1px short on the right is a partial miss", () => {
  const exact = classify(ok({ left: 100, top: 200, width: 360, height: 22 }), gold, page);
  assert.equal(exact.category, "window_complete");
  const cut = classify(ok({ left: 100, top: 200, width: 359, height: 22 }), gold, page);
  assert.equal(cut.category, "window_partial");
  assert.equal(cut.success, false);
  assert.equal(cut.evidencePreserved, false);
  assert.deepEqual(cut.missingParts, ["v"]);
});

test("full-frame results never count as primary success but keep the evidence", () => {
  const noMatch = classify({ status: "ok", matched: false }, gold, page);
  assert.equal(noMatch.category, "no_match_full");
  assert.equal(noMatch.success, false);
  assert.equal(noMatch.evidencePreserved, true);
  assert.equal(noMatch.areaRatio, 1);
  const padded = classify(ok({ left: 0, top: 0, width: 1000, height: 800 }), gold, page);
  assert.equal(padded.category, "matched_full");
  assert.equal(padded.success, false);
  assert.equal(padded.evidencePreserved, true);
});

test("errors and invalid outputs are technical failures, kept apart from no-match", () => {
  const err = classify({ status: "error", error: "timeout" }, gold, page);
  assert.equal(err.category, "tech_error");
  assert.equal(err.success, false);
  assert.equal(err.evidencePreserved, null);
  for (const band of [{ left: 0, top: 0, width: 0, height: 10 }, { left: 990, top: 0, width: 20, height: 10 }, { left: 1.5, top: 0, width: 20, height: 10 }]) {
    assert.equal(classify(ok(band), gold, page).category, "tech_error");
  }
});

test("alignRecords refuses missing, extra or duplicated image records", () => {
  const ids = ["p1-en", "p1-ko"];
  assert.doesNotThrow(() => alignRecords(ids, [{ id: "p1-en" }, { id: "p1-ko" }]));
  assert.throws(() => alignRecords(ids, [{ id: "p1-en" }]), /missing/);
  assert.throws(() => alignRecords(ids, [{ id: "p1-en" }, { id: "p1-ko" }, { id: "p2-en" }]), /unexpected/);
  assert.throws(() => alignRecords(ids, [{ id: "p1-en" }, { id: "p1-en" }, { id: "p1-ko" }]), /duplicate/);
});

const outcome = (success, tech = false) => ({ success, category: tech ? "tech_error" : success ? "window_complete" : "no_match_full" });

test("pair statistics: KO-EN over the fixed denominator, 2x2 table, missing as failure plus bounds", () => {
  const pairs = ["a", "b", "c", "d"];
  const out = {
    "a-en": outcome(true), "a-ko": outcome(true),
    "b-en": outcome(true), "b-ko": outcome(false),
    "c-en": outcome(false), "c-ko": outcome(false, true),
    "d-en": outcome(false, true), "d-ko": outcome(false, true),
  };
  const s = pairStats(pairs, out);
  assert.equal(s.n, 4);
  assert.deepEqual(s.table, { both: 1, enOnly: 1, koOnly: 0, neither: 2 });
  assert.equal(s.diff, (0 - 1) / 4);
  assert.deepEqual(s.missing, { enOnly: 0, koOnly: 1, both: 1 });
  assert.equal(s.complete.n, 2);
  assert.deepEqual(s.complete.table, { both: 1, enOnly: 1, koOnly: 0, neither: 0 });
  // min: missing KO -> 0, missing EN -> 1; max: missing KO -> 1, missing EN -> 0.
  // c: EN 0, KO missing -> min 0 / max +1. d: both missing -> min -1 / max +1.
  assert.equal(s.bounds.min, (-1 + 0 - 1) / 4);
  assert.equal(s.bounds.max, (-1 + 1 + 1) / 4);
  assert.equal(s.en.success, 2);
  assert.equal(s.ko.success, 1);
});

test("pair statistics refuse a pair with a missing language outcome", () => {
  assert.throws(() => pairStats(["a"], { "a-en": outcome(true) }), /a-ko/);
});

test("held-out design: 24 pairs, 48 images, fixed keys, no answer exposure", () => {
  const d = buildDesign("heldout");
  assert.equal(d.images.length, 48);
  assert.equal(d.pairs.length, 24);
  assert.deepEqual(checkDesign(d, { expectedPairs: 24 }), []);
  const per = (k, v) => d.pairs.filter((p) => p[k] === v).length;
  assert.equal(per("anchor", "code"), 12);
  assert.equal(per("doctype", "invoice"), 8);
  assert.deepEqual(buildDesign("heldout"), d, "design is deterministic");
  const q = questionsOf(d);
  assert.deepEqual(Object.keys(q.questions[0]).sort(), ["file", "id", "question"]);
});

test("design check catches a broken pair, an exposed answer and a Korean ASCII leak", () => {
  const d = buildDesign("heldout");
  const broken = structuredClone(d);
  broken.images = broken.images.filter((im) => im.id !== d.images[1].id);
  assert.ok(checkDesign(broken, { expectedPairs: 24 }).some((p) => /languages/.test(p)));
  const leak = structuredClone(d);
  const ko = leak.images.find((im) => im.lang === "ko" && im.anchor === "nl");
  ko.question = `${ko.question} total`;
  assert.ok(checkDesign(leak).some((p) => /ASCII keys/.test(p)));
  const exposed = structuredClone(d);
  exposed.images[0].question += ` ${exposed.images[0].answer}`;
  assert.ok(checkDesign(exposed).some((p) => /exposes answer/.test(p)));
});

test("dev fixture is separate: different doc type, layout and page size", () => {
  const dev = buildDevDesign();
  assert.deepEqual(checkDesign(dev, { expectedPairs: 2 }), []);
  assert.ok(dev.images.every((im) => im.doctype === "loan" && im.layout === "list"));
  assert.notDeepEqual(dev.page, buildDesign("heldout").page);
});
