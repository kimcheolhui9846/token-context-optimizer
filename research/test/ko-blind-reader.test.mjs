// ko-blind-reader: registered tests (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, section 9).
// Mock data and test seeds only. No real seed, key or response is read here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../src/ko-blind-reader-lib.mjs";
import { lockAndScore } from "../src/ko-blind-reader-score.mjs";
import { FIXED_CODE, loadFixed } from "../src/ko-blind-reader-fixed.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(readFileSync(join(here, "..", "tools", "ko-blind-reader", "registered.json"), "utf8"));
const sha = (s) => createHash("sha256").update(s).digest("hex");

// ------------------------------------------------------------------ normalization (protocol 6.1)
test("value normalization: accepted forms", () => {
  const ok = [
    ["time", "14:30", "14:30"], ["time", "09:30", "9:30"], ["time", "14시30분", "14:30"], ["time", "14시", "14:00"],
    ["time", "１４：３０", "14:30"], ["time", " 14 : 30 ", "14:30"], ["time", "0:05", "0:05"],
    ["count", "50", "50"], ["count", "50명", "50"], ["count", "50 명", "50"], ["count", "050", "50"], ["count", "５０명", "50"],
    ["pages", "123", "123"], ["pages", "123쪽", "123"], ["pages", "0123쪽", "123"],
  ];
  for (const [t, raw, want] of ok) assert.equal(L.normalizeValue(t, raw), want, `${t} ${raw}`);
});

test("value normalization: registered boundary negatives", () => {
  const bad = [
    ["time", "14:3"], ["time", "14:300"], ["time", "24:00"], ["time", "14.30"], ["time", "오후 2시"], ["time", "2시 반"], ["time", "00:60"], ["time", ""], ["time", "14:30분"],
    ["count", "30명명"], ["count", "3O명"], ["count", "-5명"], ["count", "50쪽"], ["count", "명"], ["count", "0"], ["count", "1,200"], ["count", "12345"],
    ["pages", "50명"], ["pages", "1,200쪽"], ["pages", "0"], ["pages", "쪽"], ["pages", "12.5"],
  ];
  for (const [t, raw] of bad) assert.equal(L.normalizeValue(t, raw), null, `${t} ${JSON.stringify(raw)}`);
  assert.equal(L.normalizeValue("other", "1"), null);
});

test("normalizeValue is self-contained (inlined into the reader page)", () => {
  const f = new Function(`return (${L.normalizeValue.toString()})`)();
  assert.equal(f("time", "14시30분"), "14:30");
  assert.equal(f("pages", "1,200쪽"), null);
});

// ------------------------------------------------------------------ canonical JSON and pure SHA-256 (protocol 5.5)
test("canonical JSON sorts keys and drops whitespace", () => {
  assert.equal(L.canonicalJson({ b: 1, a: [1, { d: 2, c: "가" }], e: null, f: true }), '{"a":[1,{"c":"가","d":2}],"b":1,"e":null,"f":true}');
});

test("pure SHA-256 equals node crypto", () => {
  for (const s of ["", "abc", "가나다", "x".repeat(1000), JSON.stringify({ a: "한글 ✓" })]) assert.equal(L.sha256Hex(s), sha(s));
  const f = new Function(`return (${L.sha256Hex.toString()})`)();
  assert.equal(f("한국어"), sha("한국어"));
});

// ------------------------------------------------------------------ reader state machine (protocol 5.2-5.5)
function mockPayload(noDisplay = []) {
  const items = Array.from({ length: 18 }, (_, i) => ({ pos: i + 1, question: `질문 ${i + 1}`, qtype: ["time", "count", "pages"][i % 3], image: noDisplay.includes(i + 1) ? null : `data:image/png;base64,AAAA${i}` }));
  const body = { format: "kbr-packet-1", packetId: "kbr-0011223344556677", practice: { question: "연습", qtype: "time", image: "data:image/png;base64,BBBB" }, items };
  return { ...body, packetHash: L.packetHash(body) };
}
const run = (s, ...acts) => acts.reduce((st, a) => L.step(st, a), s);
function toItems(p, seen = "no") {
  return run(L.initState(p), { type: "selfReport", value: seen }, { type: "begin" }, { type: "toPractice" },
    { type: "practiceSet", column: "L", value: "11:40" }, { type: "practiceCheck" }, { type: "toItems" });
}
function answerAll(s, n = 18) {
  for (let i = 0; i < n; i++) {
    if (s.items[s.index].displayed) s = run(s, { type: "set", column: i % 2 ? "R" : "L", value: "12:30" });
    s = L.step(s, { type: "next" });
  }
  return s;
}

test("state: self report is required, practice is not in the response", () => {
  const p = mockPayload();
  assert.throws(() => run(L.initState(p), { type: "begin" }), (e) => e.code === "self_report");
  const s = answerAll(toItems(p));
  assert.equal(s.phase, "review");
  const f = L.finalResponse(run(s, { type: "finalizeRequest" }, { type: "finalizeConfirm" }));
  assert.equal(f.kind, "final");
  assert.equal(f.status, "completed");
  assert.equal(f.items.length, 18);
  assert.ok(!JSON.stringify(f).includes("11:40"), "practice answer must not be in the response");
  assert.equal(f.digest, L.responseDigest(f));
});

test("state: next needs column and value (or value unknown); forward only", () => {
  let s = toItems(mockPayload());
  assert.throws(() => L.step(s, { type: "next" }), (e) => e.code === "incomplete");
  s = L.step(s, { type: "set", column: "unknown" });
  assert.throws(() => L.step(s, { type: "next" }), (e) => e.code === "incomplete");
  s = run(s, { type: "set", valueUnknown: true }, { type: "next" });
  assert.equal(s.index, 1);
  assert.throws(() => L.step(s, { type: "back" }), (e) => e.code === "unknown_action");
  assert.equal(s.items[0].column, "unknown");
  assert.equal(s.items[0].valueUnknown, true);
});

test("state: current answer can change until moving on; earlier items stay fixed", () => {
  let s = toItems(mockPayload());
  s = run(s, { type: "set", column: "L", value: "1" }, { type: "set", column: "R", value: "2" }, { type: "next" });
  assert.deepEqual([s.items[0].column, s.items[0].value], ["R", "2"]);
  assert.throws(() => L.step(s, { type: "set", pos: 1, column: "L" }), (e) => e.code === "fixed");
});

test("state: skip and abort are two-step; cancel clears the request", () => {
  let s = toItems(mockPayload());
  s = L.step(s, { type: "skipRequest" });
  assert.equal(s.pending, "skip");
  s = L.step(s, { type: "cancel" });
  assert.equal(s.pending, null);
  assert.throws(() => L.step(s, { type: "skipConfirm" }), (e) => e.code === "no_request");
  s = run(s, { type: "skipRequest" }, { type: "skipConfirm" });
  assert.equal(s.items[0].skipped, true);
  assert.equal(s.index, 1);
  s = run(s, { type: "abortRequest" }, { type: "abortConfirm" });
  assert.equal(s.phase, "done");
  const f = L.finalResponse(s);
  assert.equal(f.status, "aborted");
  assert.equal(f.items.filter((x) => !x.reached).length, 17); // pos 1 skipped; the current pos 2 and later are notReached (protocol 5.2 item 7)
  assert.throws(() => L.step(s, { type: "set", column: "L" }), (e) => e.code === "locked");
  assert.throws(() => L.step(s, { type: "finalizeConfirm" }), (e) => e.code === "locked");
});

test("state: no-display items are fixed to unknown and cannot be edited", () => {
  let s = toItems(mockPayload([1]));
  assert.equal(s.items[0].displayed, false);
  assert.equal(s.items[0].column, "unknown");
  assert.equal(s.items[0].valueUnknown, true);
  assert.throws(() => L.step(s, { type: "set", column: "L" }), (e) => e.code === "fixed");
  s = L.step(s, { type: "next" });
  assert.equal(s.index, 1);
});

test("state: interim save and resume (same packet only, forward only)", () => {
  const p = mockPayload();
  let s = toItems(p, "no");
  s = run(s, { type: "set", column: "L", value: "10:10" }, { type: "next" }, { type: "set", column: "R", valueUnknown: true }, { type: "next" });
  const im = L.interimResponse(s);
  assert.equal(im.kind, "interim");
  assert.equal(im.position, 3);
  assert.equal(im.digest, L.responseDigest(im));
  const r = L.resumeState(p, JSON.parse(JSON.stringify(im)));
  assert.equal(r.phase, "item");
  assert.equal(r.index, 2);
  assert.equal(r.items[0].value, "10:10");
  assert.equal(r.adminMaterialSeen, "no");
  const other = mockPayload();
  other.packetId = "kbr-ffffffffffffffff";
  other.packetHash = L.packetHash({ ...other, packetHash: undefined });
  assert.throws(() => L.resumeState(other, im), (e) => e.code === "interim_packet");
  const bad = { ...im, items: im.items.map((x) => ({ ...x })) };
  bad.items[0].value = "11:11";
  assert.throws(() => L.resumeState(p, bad), (e) => e.code === "interim_digest");
  assert.throws(() => L.resumeState(p, { ...L.finalResponse(run(answerAll(toItems(p)), { type: "finalizeRequest" }, { type: "finalizeConfirm" })) }), (e) => e.code === "interim_kind");
});

// ------------------------------------------------------------------ response validation and scoring (protocol 6.2, 6.3)
function mockKey(p) {
  const methods = ["W1", "W4", "W5"];
  return {
    format: "kbr-key-1", packetId: p.packetId, packetHash: p.packetHash,
    items: p.items.map((it, i) => ({ pos: it.pos, method: methods[i % 3], side: i % 2 ? "R" : "L", qtype: it.qtype, answer: { time: "12:30", count: "50", pages: "123" }[it.qtype], displayed: it.image !== null })),
  };
}
function completed(p, f) {
  let s = toItems(p);
  for (let i = 0; i < 18; i++) {
    if (s.items[s.index].displayed) s = run(s, { type: "set", ...f(i, p.items[i]) });
    s = L.step(s, { type: "next" });
  }
  return L.finalResponse(run(s, { type: "finalizeRequest" }, { type: "finalizeConfirm" }));
}
const right = (i, it) => ({ column: i % 2 ? "R" : "L", value: { time: "12시30분", count: "50명", pages: "123" }[it.qtype] });

test("validation: normal, wrong version, interim, wrong packet, wrong hash, digest, duplicate and missing pos", () => {
  const p = mockPayload();
  const key = mockKey(p);
  const f = completed(p, right);
  assert.deepEqual(L.validateResponse(f, key), { ok: true });
  const re = (o) => ({ ...o, digest: L.responseDigest(o) });
  assert.equal(L.validateResponse(re({ ...f, format: "kbr-response-0" }), key).code, "format");
  assert.equal(L.validateResponse(re({ ...f, kind: "interim" }), key).code, "kind");
  assert.equal(L.validateResponse(re({ ...f, packetId: "kbr-0000000000000000" }), key).code, "packet_id");
  assert.equal(L.validateResponse(re({ ...f, packetHash: "0".repeat(64) }), key).code, "packet_hash");
  assert.equal(L.validateResponse({ ...f, status: "aborted" }, key).code, "digest");
  const dup = f.items.map((x) => ({ ...x }));
  dup[1].pos = 1;
  assert.equal(L.validateResponse(re({ ...f, items: dup }), key).code, "duplicate_pos");
  assert.equal(L.validateResponse(re({ ...f, items: f.items.slice(1) }), key).code, "items");
  const badField = f.items.map((x) => ({ ...x }));
  badField[0].column = "left";
  assert.equal(L.validateResponse(re({ ...f, items: badField }), key).code, "field");
  assert.equal(L.validateResponse(f, { ...key, format: "kbr-key-0" }).code, "key_format");
});

test("scoring: correct, confused, unknown, skipped, no display, aborted denominators", () => {
  const p = mockPayload([4]);
  const key = mockKey(p);
  const allRight = L.scoreResponse(completed(p, right), key);
  for (const m of ["W1", "W4", "W5"]) assert.equal(allRight.methods[m].assigned, 6);
  assert.equal(allRight.methods.W1.both, 5); // pos 4 (index 3, W1) has no display
  assert.equal(allRight.methods.W1.noDisplay, 1);
  assert.equal(allRight.methods.W4.both + allRight.methods.W5.both, 12);
  const confused = L.scoreResponse(completed(p, (i, it) => ({ column: i % 2 ? "L" : "R", value: right(i, it).value })), key);
  assert.equal(confused.methods.W4.valueOnly, 6);
  assert.equal(confused.methods.W4.both, 0);
  const unknown = L.scoreResponse(completed(p, () => ({ column: "unknown", valueUnknown: true })), key);
  assert.equal(unknown.methods.W5.unknownColumn, 6);
  assert.equal(unknown.methods.W5.unknownValue, 6);
  assert.equal(unknown.methods.W5.neither, 6);
  let s = toItems(p);
  s = run(s, { type: "skipRequest" }, { type: "skipConfirm" }, { type: "abortRequest" }, { type: "abortConfirm" });
  const ab = L.scoreResponse(L.finalResponse(s), key);
  assert.equal(ab.status, "aborted");
  assert.equal(ab.methods.W1.skipped, 1);
  assert.equal(ab.methods.W1.notReached + ab.methods.W4.notReached + ab.methods.W5.notReached, 17);
  assert.equal(ab.methods.W1.answered, 0);
  const seen = L.scoreResponse(completed({ ...p }, right), key);
  assert.equal(seen.blindInvalid, false);
});

test("scoring: self report yes marks the session invalid for the blind analysis", () => {
  const p = mockPayload();
  let s = toItems(p, "yes");
  s = answerAll(s);
  const f = L.finalResponse(run(s, { type: "finalizeRequest" }, { type: "finalizeConfirm" }));
  assert.equal(L.scoreResponse(f, mockKey(p)).blindInvalid, true);
});

test("submission lock: first response locked, same bytes idempotent, different response refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "kbr-lock-"));
  const p = mockPayload();
  const key = mockKey(p);
  writeFileSync(join(dir, "key.json"), JSON.stringify(key));
  const a = join(dir, "a.json"), b = join(dir, "b.json");
  writeFileSync(a, JSON.stringify(completed(p, right)));
  writeFileSync(b, JSON.stringify(completed(p, () => ({ column: "L", value: "1" }))));
  const r1 = lockAndScore({ adminDir: dir, responsePath: a });
  assert.equal(r1.ok, true);
  assert.equal(r1.lock, "new");
  const t1 = readFileSync(join(dir, "score", "score.json"), "utf8");
  const r2 = lockAndScore({ adminDir: dir, responsePath: a });
  assert.equal(r2.lock, "same");
  assert.equal(readFileSync(join(dir, "score", "score.json"), "utf8"), t1);
  const r3 = lockAndScore({ adminDir: dir, responsePath: b });
  assert.equal(r3.ok, false);
  assert.equal(r3.code, "lock_different");
  assert.equal(readFileSync(join(dir, "responses", "locked.json"), "utf8"), readFileSync(a, "utf8"));
  const dir2 = mkdtempSync(join(tmpdir(), "kbr-lock-"));
  writeFileSync(join(dir2, "key.json"), JSON.stringify(key));
  const bad = join(dir2, "bad.json");
  writeFileSync(bad, JSON.stringify({ ...completed(p, right), digest: "0".repeat(64) }));
  assert.equal(lockAndScore({ adminDir: dir2, responsePath: bad }).code, "digest");
  assert.equal(existsSync(join(dir2, "responses", "locked.json")), false);
});

// ------------------------------------------------------------------ order and balance (protocol 4.1)
function mockPlan() {
  const strata = REG.design.strataOrder;
  const methods = ["W1", "W4", "W5"];
  const sources = [];
  strata.forEach(([qtype, side], st) => methods.forEach((m, j) => sources.push({ index: sources.length, stratum: st, qtype, side, method: m, slot: [0, 1, 2][(st + j) % 3] })));
  for (const m of methods) {
    const mine = sources.filter((s) => s.method === m);
    mine.forEach((s, k) => { s.slot = [0, 0, 1, 1, 2, 2][k]; });
    const L_ = mine.filter((s) => s.side === "L"), R_ = mine.filter((s) => s.side === "R");
    L_.forEach((s, k) => { s.larger = k < 2; s.naturalFirst = k < 1; });
    R_.forEach((s, k) => { s.larger = k < 1; s.naturalFirst = k < 2; });
  }
  return { sources, order: [0, 4, 8, 9, 13, 17, 1, 5, 6, 10, 14, 15, 2, 3, 7, 11, 12, 16] };
}

test("order and balance checks accept a valid plan and catch violations", () => {
  const plan = mockPlan();
  for (const s of plan.sources) s.position = plan.order.indexOf(s.index) + 1;
  assert.deepEqual(L.checkPlan(plan), []);
  const run3 = { ...plan, order: [0, 3, 6, 9, 12, 15, 1, 4, 7, 10, 13, 16, 2, 5, 8, 11, 14, 17] };
  for (const s of run3.sources) s.position = run3.order.indexOf(s.index) + 1;
  assert.ok(L.checkPlan(run3).length > 0);
  const p2 = mockPlan();
  p2.sources[0].larger = !p2.sources[0].larger;
  for (const s of p2.sources) s.position = p2.order.indexOf(s.index) + 1;
  assert.ok(L.checkPlan(p2).some((x) => x.startsWith("larger")));
});

// ------------------------------------------------------------------ leak scan and output policy (protocol 7, 8.1)
function png(chunks) {
  const sig = Buffer.from("89504e470d0a1a0a", "hex");
  const parts = [sig];
  for (const t of chunks) {
    const len = Buffer.alloc(4);
    parts.push(len, Buffer.from(t, "latin1"), Buffer.alloc(4));
  }
  return Buffer.concat(parts);
}

test("PNG chunk scan", () => {
  assert.deepEqual(L.pngChunkTypes(png(["IHDR", "IDAT", "IEND"])), ["IHDR", "IDAT", "IEND"]);
  assert.deepEqual(L.pngChunkTypes(png(["IHDR", "tEXt", "IDAT", "IEND"])), ["IHDR", "tEXt", "IDAT", "IEND"]);
});

test("packet leak scan catches URLs, network/storage APIs, method names, canaries and PNG text chunks", () => {
  const clean = `<!DOCTYPE html><html lang="ko"><body><img alt="표 이미지" src="data:image/png;base64,${png(["IHDR", "IDAT", "IEND"]).toString("base64")}"><script>const a=1;</script></body></html>`;
  assert.deepEqual(L.scanPacketHtml(clean, { canaries: ["고서 영인본 열람"] }), []);
  const cases = [
    ['<a href="https://example.org">x</a>', "external_url"],
    ["<script>fetch('x')</script>", "network_api"],
    ["<script>localStorage.setItem('a',1)</script>", "storage_api"],
    ["<div data-m=\"W5\"></div>", "method_name"],
    ["<p>고서 영인본 열람</p>", "canary"],
    [`<img src="data:image/png;base64,${png(["IHDR", "tEXt", "IDAT", "IEND"]).toString("base64")}">`, "png_chunk"],
  ];
  for (const [frag, code] of cases) assert.ok(L.scanPacketHtml(clean.replace("<body>", `<body>${frag}`), { canaries: ["고서 영인본 열람"] }).includes(code), code);
});

test("packet images keep only critical chunks; object URLs are not external URLs (added after registration)", () => {
  const withPhys = png(["IHDR", "pHYs", "IDAT", "IEND"]);
  assert.deepEqual(L.pngChunkTypes(L.criticalChunksOnly(withPhys)), ["IHDR", "IDAT", "IEND"]);
  const clean = `<!DOCTYPE html><html><body><script>var url = URL.createObjectURL(blob);</script></body></html>`;
  assert.deepEqual(L.scanPacketHtml(clean), []);
  assert.ok(L.scanPacketHtml('<style>p{background:url(x.png)}</style>').includes("external_url"));
  assert.ok(L.scanPacketHtml(`<img src="data:image/png;base64,${withPhys.toString("base64")}">`).includes("png_chunk"));
});

test("reader page is LF only and its template part does not depend on the checkout line endings (added after registration)", async () => {
  const { readerHtml } = await import("../src/ko-blind-reader-pipeline.mjs");
  const html = readerHtml(mockPayload());
  assert.equal(html.includes("\r"), false);
  const mockPacket = readFileSync(join(here, "..", "results", "ko-blind-reader", "mock", "packet", "start.html"), "utf8");
  assert.equal(L.templatePart(html), L.templatePart(mockPacket));
});

test("safe output line refuses text, values and unknown keys (recursively)", () => {
  assert.equal(L.safeLine({ ok: true, sources: 18, sha256: "a".repeat(64), out: "D:/orca/local-research-admin/ko-blind-reader-pilot/gen" }), JSON.stringify({ ok: true, sources: 18, sha256: "a".repeat(64), out: "D:/orca/local-research-admin/ko-blind-reader-pilot/gen" }));
  assert.throws(() => L.safeLine({ ok: true, answer: "12:30" }));
  assert.throws(() => L.safeLine({ ok: true, detail: "고서 영인본 열람" }));
  assert.throws(() => L.safeLine({ ok: true, files: { nested: { question: "가" } } }));
  assert.throws(() => L.safeLine({ ok: true, applied: 5 }));
  assert.throws(() => L.safeLine({ ok: true, code: "W4" }));
});

// ------------------------------------------------------------------ fixed code and commitments (protocol 3, 8.3)
test("fixed code pins equal the registered pins and load from Git objects", async () => {
  for (const [name, spec] of Object.entries(REG.fixed.code)) {
    if (!FIXED_CODE[name]) continue;
    assert.equal(FIXED_CODE[name].blob, spec.blob, name);
    assert.equal(FIXED_CODE[name].sha256, spec.sha256, name);
  }
  const f = await loadFixed();
  for (const k of ["buildPrediction", "w4Rule", "project", "plan", "compose", "crop", "encodeGray", "decodeGray", "keyResults", "w1Rule"]) assert.equal(typeof f[k], "function", k);
});

test("commitment uses a 256-bit salt and the registered label", () => {
  const salt = randomBytes(32);
  const bytes = Buffer.from("abc");
  const want = createHash("sha256").update(Buffer.concat([salt, Buffer.from("kbr-key", "utf8"), Buffer.from([0]), bytes])).digest("hex");
  assert.equal(L.commitment(salt, "kbr-key", bytes), want);
  assert.throws(() => L.commitment(randomBytes(16), "kbr-key", bytes));
  assert.throws(() => L.commitment(salt, "other", bytes));
});
