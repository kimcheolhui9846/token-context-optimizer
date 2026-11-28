// ko-header-strip: registered tests (protocol research/plans/2026-11-25-ko-header-strip-protocol.md, section 10).
// Written before the implementation (RED). The modules under ../src/ko-header-strip-*.mjs do not exist yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const research = join(here, "..");
const toolDir = join(research, "tools", "ko-header-strip");
const example = JSON.parse(readFileSync(join(toolDir, "example", "example.json"), "utf8"));
const registered = JSON.parse(readFileSync(join(toolDir, "registered.json"), "utf8"));

const planMod = await import("../src/ko-header-strip-plan.mjs");
const scoreLib = await import("../src/ko-header-strip-score-lib.mjs");
const sourceMod = await import("../src/ko-header-strip-source.mjs");
const pngMod = await import("../src/ko-header-strip-png.mjs");
const { project, plan, compose, ContractError } = planMod;

const clone = (x) => JSON.parse(JSON.stringify(x));
function merge(a, b) {
  if (b === null || typeof b !== "object" || Array.isArray(b)) return clone(b);
  const out = a && typeof a === "object" && !Array.isArray(a) ? clone(a) : {};
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? merge(out[k], v) : clone(v);
  return out;
}
function rowFor(c) {
  let r = clone(example.base);
  if (c.override) r = merge(r, c.override);
  if (c.groups) c.groups.forEach((box, i) => { r.w4Diag.lines[1].groups[i].box = box; });
  return r;
}
const patchers = {
  duplicate_line_1: (r) => r.w4Diag.lines.push(clone(r.w4Diag.lines[1])),
  drop_group_3: (r) => r.w4Diag.lines[1].groups.splice(2, 1),
  header_why_below_anchor: (r) => { r.w4Diag.lines[1].why = "below_anchor"; r.w4Diag.lines[1].groups = null; },
  header_failure_x_overlap: (r) => { r.w4Diag.lines[1].failure = "x_overlap"; },
  box_nan: (r) => { r.w4Diag.lines[1].groups[0].box[0] = "NaN"; },
  box_zero_width: (r) => { r.w4Diag.lines[1].groups[0].box = ["3", "4.25", "3", "7.75"]; },
  box_x1_41: (r) => { r.w4Diag.lines[1].groups[2].box[2] = "41"; },
};
const planOf = (name) => plan(project(rowFor(example.plans.find((c) => c.name === name))));
const pick = (p) => ({ reason: p.reason, kind: p.kind, B: p.B, H: p.H, t: p.t, b: p.b, p: p.p, pieces: p.pieces, display: p.display });

test("hand-computed plans", () => {
  for (const c of example.plans) assert.deepEqual(pick(plan(project(rowFor(c)))), c.expect, c.name);
});

test("OCR and question strings do not change the plan", () => {
  const base = planOf(example.invariance.sameAs);
  const changed = plan(project(merge(rowFor(example.plans[0]), example.invariance.override)));
  assert.deepEqual(changed, base);
});

test("contract damage is a validation failure with its code", () => {
  for (const c of example.contracts) {
    let r = clone(example.base);
    if (c.override) r = merge(r, c.override);
    if (c.patch) patchers[c.patch](r);
    assert.throws(() => plan(project(r)), (e) => e instanceof ContractError && e.code === c.code, c.name);
  }
});

test("projection: only registered keys, frozen, no shared references, one argument", () => {
  const raw = rowFor(example.plans[0]);
  const p = project(raw);
  assert.deepEqual(Object.keys(p).sort(), [...registered.projectionKeys.row].sort());
  assert.deepEqual(Object.keys(p.header).sort(), [...registered.projectionKeys.header].sort());
  for (const g of p.header.groups) assert.deepEqual(Object.keys(g).sort(), [...registered.projectionKeys.group].sort());
  for (const w of [p.w1, p.w2, p.w4]) assert.deepEqual(Object.keys(w).sort(), [...registered.projectionKeys.window].sort());
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.header) && Object.isFrozen(p.header.groups) && Object.isFrozen(p.w1));
  const before = plan(p);
  raw.w4Diag.lines[1].groups[0].box[0] = "30"; raw.w4.top = 0; raw.w1.left = 9;
  assert.deepEqual(plan(p), before);
  assert.equal(JSON.stringify(p).includes("마바"), false, "no OCR text in the projection");
  assert.equal(plan.length, 1);
});

test("page id is a join key only", () => {
  const a = rowFor(example.plans[0]);
  const b = merge(a, { id: "p999" });
  const pa = plan(project(a)), pb = plan(project(b));
  assert.deepEqual(pa, pb);
});

test("assembly code does not reference registered case or fixed-22 ids", () => {
  const ids = [...registered.fixed22, ...registered.cases.map((c) => c.id)];
  for (const f of ["ko-header-strip-plan.mjs", "ko-header-strip-source.mjs", "ko-header-strip-build.mjs", "ko-header-strip-png.mjs"]) {
    const text = readFileSync(join(research, "src", f), "utf8");
    for (const id of ids) assert.equal(text.includes(id), false, `${f} mentions ${id}`);
    assert.equal(/fixed22|\bcases\b/.test(text), false, `${f} reads registered ids`);
  }
});

test("build allowlist rejects scoring, OCR and score paths", () => {
  const ok = [
    "research/results/ko-header-column/data/manifest.json",
    "research/results/ko-header-column/replay-a/predictions.jsonl",
    "research/results/ko-header-column/replay-a/freeze.json",
    "research/results/ko-header-column/data/selector/images/p000.png",
    "research/results/ko-header-column/data/selector/images/p143.png",
  ];
  for (const p of ok) assert.doesNotThrow(() => sourceMod.assertBuildAllowed(p), p);
  const bad = [
    "research/results/ko-header-column/data/scoring/gold.json",
    "research/results/ko-header-column/data/scoring/design.json",
    "research/results/ko-header-column/data/scoring/render.json",
    "research/results/ko-header-column/score-a/score.jsonl",
    "research/results/ko-header-column/score-a/summary.json",
    "research/results/ko-header-column/ocr/ocr.jsonl",
    "research/results/ko-header-column/data/selector/questions.json",
    "research/results/ko-header-column/data/selector/images/p1000.png",
    "research/results/ko-header-column/data/selector/images/../../scoring/gold.json",
  ];
  for (const p of bad) assert.throws(() => sourceMod.assertBuildAllowed(p), p);
});

test("exposure over merged source intervals", () => {
  for (const c of example.exposures) assert.equal(scoreLib.exposure(c.ink, planOf(c.plan)), c.expect, c.why);
});

test("areas and %p", () => {
  for (const c of example.areas) {
    const a = scoreLib.areaOf(planOf(c.plan));
    assert.equal(a.source, c.expect.source); assert.equal(a.separator, c.expect.separator); assert.equal(a.display, c.expect.display);
    const pp = (x) => scoreLib.fracStr(scoreLib.ppOf(x, c.pageArea));
    assert.equal(pp(c.w1Area - a.source), c.expect.w5SourceVsW1);
    assert.equal(pp(c.w1Area - a.display), c.expect.w5DisplayVsW1);
    assert.equal(pp(a.source - c.w4Area), c.expect.w5SourceVsW4);
  }
  for (const c of example.pp) assert.equal(scoreLib.ppText({ num: c.num, den: c.den }), c.expect);
  assert.deepEqual(scoreLib.meanFrac(example.meanExample.values), example.meanExample.expect);
});

test("pixel composition", () => {
  const W = 40, H = 30, src = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) src[y * W + x] = (7 * x + 13 * y) % 256;
  for (const c of example.pixels.cases) {
    const p = planOf(c.plan);
    const out = compose(p, src, W);
    const w = c.x[1] - c.x[0];
    assert.equal(out.length, w * c.rows.length);
    c.rows.forEach(([kind, v], r) => {
      for (let x = 0; x < w; x++) {
        const want = kind === "src" ? src[v * W + c.x[0] + x] : v;
        assert.equal(out[r * w + x], want, `${c.plan} row ${r} x ${x}`);
      }
    });
  }
});

test("PNG round trip: file hash and pixel hash are distinct", async () => {
  const w = 30, h = 20, raw = Buffer.alloc(w * h);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 256;
  const png = await pngMod.encodeGray(raw, w, h);
  assert.equal(png[25], 0, "colour type 0 (grey)");
  assert.equal(png[24], 8, "bit depth 8");
  const d = await pngMod.decodeGray(png);
  assert.equal(d.width, w); assert.equal(d.height, h); assert.ok(d.data.equals(raw));
  // insert a tEXt chunk before IEND: file bytes change, pixels do not
  const body = Buffer.concat([Buffer.from("tEXt"), Buffer.from("k\0v")]);
  const len = Buffer.alloc(4); len.writeUInt32BE(3);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  const withText = Buffer.concat([png.subarray(0, png.length - 12), len, body, crc, png.subarray(png.length - 12)]);
  const d2 = await pngMod.decodeGray(withText);
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  assert.notEqual(sha(withText), sha(png));
  assert.equal(pngMod.pixelSha256(d2.data), pngMod.pixelSha256(d.data));
});

test("registered fixed-22 list matches the protocol request", () => {
  assert.equal(registered.fixed22.length, 22);
  assert.equal(new Set(registered.fixed22).size, 22);
  assert.equal(registered.fixed22.join(","), "p003,p008,p011,p021,p027,p035,p038,p042,p050,p055,p063,p079,p083,p085,p086,p101,p114,p116,p117,p122,p134,p135");
  assert.deepEqual(registered.cases.map((c) => c.id), ["p003", "p050", "p031", "p067", "p070"]);
  assert.deepEqual(registered.strip.separatorLuma, [224, 224, 224, 128, 128, 224, 224, 224]);
});
