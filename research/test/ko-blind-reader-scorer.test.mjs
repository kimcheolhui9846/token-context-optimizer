// ko-blind-reader: scorer milestone fixes (Opus review of 130be80: M1, m1, m2, m3) and LF/CRLF reproduction comparison.
// Mock data and temporary folders only. No real seed, key, packet or response is read here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../src/ko-blind-reader-lib.mjs";
import { lockAndScore, selfCheck } from "../src/ko-blind-reader-score.mjs";
import { readerHtml } from "../src/ko-blind-reader-pipeline.mjs";
import { compareEvidence, lockVariants } from "../src/ko-blind-reader-repro.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const research = join(here, "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const SCORER = join(research, "src", "ko-blind-reader-score.mjs");

// ------------------------------------------------------------------ mock fixtures
function mockPayload(noDisplay = []) {
  const items = Array.from({ length: 18 }, (_, i) => ({ pos: i + 1, question: `모의 질문 ${i + 1}`, qtype: ["time", "count", "pages"][i % 3], image: noDisplay.includes(i + 1) ? null : `data:image/png;base64,AAAA${i}` }));
  const body = { format: "kbr-packet-1", packetId: "kbr-0011223344556677", practice: { question: "연습", qtype: "time", image: "data:image/png;base64,BBBB" }, items };
  return { ...body, packetHash: L.packetHash(body) };
}
function mockKey(p) {
  return {
    format: "kbr-key-1", packetId: p.packetId, packetHash: p.packetHash,
    items: p.items.map((it, i) => ({ pos: it.pos, method: ["W1", "W4", "W5"][i % 3], side: i % 2 ? "R" : "L", qtype: it.qtype, answer: { time: "12:30", count: "50", pages: "123" }[it.qtype], displayed: it.image !== null })),
  };
}
const run = (s, ...acts) => acts.reduce((st, a) => L.step(st, a), s);
function toItems(p, seen = "no") {
  return run(L.initState(p), { type: "selfReport", value: seen }, { type: "begin" }, { type: "toPractice" },
    { type: "practiceSet", column: "L", value: "11:40" }, { type: "practiceCheck" }, { type: "toItems" });
}
const right = (i, it) => ({ column: i % 2 ? "R" : "L", value: { time: "12시30분", count: "50명", pages: "123" }[it.qtype] });
function completed(p, f = right, seen = "no") {
  let s = toItems(p, seen);
  for (let i = 0; i < 18; i++) {
    if (s.items[s.index].displayed) s = run(s, { type: "set", ...f(i, p.items[i]) });
    s = L.step(s, { type: "next" });
  }
  return L.finalResponse(run(s, { type: "finalizeRequest" }, { type: "finalizeConfirm" }));
}
function aborted(p) {
  let s = toItems(p);
  s = run(s, { type: "set", column: "L", value: "1" }, { type: "next" }, { type: "skipRequest" }, { type: "skipConfirm" }, { type: "set", column: "R" });
  return L.finalResponse(run(s, { type: "abortRequest" }, { type: "abortConfirm" }));
}
/** A complete mock admin folder: frozen packet, salts, commitments (mock), answer-free packet record, key. */
function makeAdmin(p = mockPayload()) {
  const dir = mkdtempSync(join(tmpdir(), "kbr-admin-"));
  const html = Buffer.from(readerHtml(p));
  const key = Buffer.from(`${JSON.stringify(mockKey(p), null, 1)}\n`);
  mkdirSync(join(dir, "packet"));
  mkdirSync(join(dir, "salts"));
  writeFileSync(join(dir, "packet", "start.html"), html);
  writeFileSync(join(dir, "key.json"), key);
  const salts = { "kbr-packet": randomBytes(32), "kbr-key": randomBytes(32) };
  for (const [label, s] of Object.entries(salts)) writeFileSync(join(dir, "salts", `${label}.salt.json`), JSON.stringify({ label, saltHex: s.toString("hex") }));
  const commitments = { packet: L.commitment(salts["kbr-packet"], "kbr-packet", html), key: L.commitment(salts["kbr-key"], "kbr-key", key) };
  const record = L.buildPacketRecord({ html, commitments, source: { kind: "mock-test" } });
  writeFileSync(join(dir, "packet-record.json"), `${JSON.stringify(record, null, 1)}\n`);
  return { dir, p, html, key, record };
}
function writeResp(dir, name, obj) {
  const f = join(dir, name);
  writeFileSync(f, typeof obj === "string" ? obj : `${JSON.stringify(obj, null, 1)}\n`);
  return f;
}
const re = (o) => ({ ...o, digest: L.responseDigest(o) });

// ------------------------------------------------------------------ packet record (M1, m2)
test("packet record holds no answers and binds the frozen file bytes and the payload hash separately", () => {
  const { record, html, p } = makeAdmin(mockPayload([4]));
  const text = JSON.stringify(record);
  for (const k of ["answer", "side", "method", "question"]) assert.ok(!text.includes(`"${k}"`), k);
  assert.equal(record.format, "kbr-packet-record-1");
  assert.equal(record.packetId, p.packetId);
  assert.equal(record.packetHash, p.packetHash);
  assert.equal(record.packetFile.sha256, sha(html));
  assert.notEqual(record.packetFile.sha256, record.packetHash);
  assert.match(record.packetFile.scope, /raw bytes/);
  assert.match(record.payloadScope, /canonical JSON/);
  assert.equal(record.n, 18);
  assert.deepEqual(record.items[3], { pos: 4, displayed: false });
});

test("self check verifies record, frozen packet and both commitments without a response", () => {
  const a = makeAdmin();
  assert.deepEqual(selfCheck({ adminDir: a.dir }).ok, true);
  writeFileSync(join(a.dir, "packet", "start.html"), Buffer.concat([a.html, Buffer.from(" ")]));
  assert.equal(selfCheck({ adminDir: a.dir }).code, "packet_file");
  const b = makeAdmin();
  writeFileSync(join(b.dir, "key.json"), Buffer.concat([b.key, Buffer.from(" ")]));
  assert.equal(selfCheck({ adminDir: b.dir }).code, "key_commitment");
});

// ------------------------------------------------------------------ M1: response checked against the record before the key is opened
test("an invalid response is refused without the key (key file absent) and without a lock", () => {
  const a = makeAdmin();
  unlinkSync(join(a.dir, "key.json"));
  const f = completed(a.p);
  const cases = [
    [{ ...f, digest: "0".repeat(64) }, "digest"],
    [re({ ...f, format: "kbr-response-0" }), "format"],
    [re({ ...f, kind: "interim" }), "kind"],
    [re({ ...f, packetId: "kbr-ffffffffffffffff" }), "packet_id"],
    [re({ ...f, packetHash: "0".repeat(64) }), "packet_hash"],
    [re({ ...f, items: f.items.slice(1) }), "items"],
  ];
  for (const [resp, code] of cases) {
    const r = lockAndScore({ adminDir: a.dir, responsePath: writeResp(a.dir, "r.json", resp) });
    assert.equal(r.code, code, code);
    assert.equal(existsSync(join(a.dir, "responses", "locked.json")), false, code);
  }
  // a valid response is locked first; only then is the (missing) key needed
  const ok = lockAndScore({ adminDir: a.dir, responsePath: writeResp(a.dir, "ok.json", f) });
  assert.equal(ok.code, "key_missing");
  assert.equal(existsSync(join(a.dir, "responses", "locked.json")), true);
  assert.equal(existsSync(join(a.dir, "score", "score.json")), false);
});

test("a damaged packet record or frozen packet stops before the response is read", () => {
  const a = makeAdmin();
  const rec = JSON.parse(readFileSync(join(a.dir, "packet-record.json"), "utf8"));
  rec.items[0].displayed = false;
  writeFileSync(join(a.dir, "packet-record.json"), JSON.stringify(rec));
  assert.equal(lockAndScore({ adminDir: a.dir, responsePath: join(a.dir, "nope.json") }).code, "packet_record");
  const b = makeAdmin();
  writeFileSync(join(b.dir, "packet", "start.html"), "x");
  assert.equal(lockAndScore({ adminDir: b.dir, responsePath: join(b.dir, "nope.json") }).code, "packet_file");
});

// ------------------------------------------------------------------ m1: only states the registered UI can produce
test("responses made by the reader state machine are valid: completed, aborted, self report yes, no display, skip", () => {
  const p = mockPayload([4]);
  const record = L.buildPacketRecord({ html: Buffer.from(readerHtml(p)), commitments: { packet: "0".repeat(64), key: "0".repeat(64) }, source: { kind: "mock-test" } });
  for (const r of [completed(p), completed(p, right, "yes"), aborted(p), completed(p, () => ({ column: "unknown", valueUnknown: true }))]) {
    assert.deepEqual(L.validateResponseRecord(r, record), { ok: true });
  }
  const s = run(toItems(p), { type: "abortRequest" }, { type: "abortConfirm" });
  assert.deepEqual(L.validateResponseRecord(L.finalResponse(s), record), { ok: true });
});

test("the mock browser response (real UI download) stays valid", () => {
  const resp = JSON.parse(readFileSync(join(research, "results", "ko-blind-reader", "mock-browser", "response.json"), "utf8"));
  const html = readFileSync(join(research, "results", "ko-blind-reader", "mock", "packet", "start.html"));
  const record = L.buildPacketRecord({ html, commitments: { packet: "0".repeat(64), key: "0".repeat(64) }, source: { kind: "mock-test" } });
  assert.deepEqual(L.validateResponseRecord(resp, record), { ok: true });
});

test("states the UI cannot produce are refused as field", () => {
  const p = mockPayload([4]);
  const record = L.buildPacketRecord({ html: Buffer.from(readerHtml(p)), commitments: { packet: "0".repeat(64), key: "0".repeat(64) }, source: { kind: "mock-test" } });
  const f = completed(p);
  const bad = (mut) => { const r = JSON.parse(JSON.stringify(f)); mut(r); return L.validateResponseRecord(re(r), record).code; };
  assert.equal(bad((r) => { Object.assign(r.items[0], { column: null, value: null, valueUnknown: false }); }), "field");
  assert.equal(bad((r) => { Object.assign(r.items[0], { column: "L", value: "1", valueUnknown: true }); }), "field");
  assert.equal(bad((r) => { Object.assign(r.items[0], { column: "L", value: "  ", valueUnknown: false }); }), "field");
  assert.equal(bad((r) => { Object.assign(r.items[0], { reached: false, skipped: true, column: null, value: null }); }), "field");
  assert.equal(bad((r) => { Object.assign(r.items[0], { skipped: true }); }), "field");
  assert.equal(bad((r) => { Object.assign(r.items[3], { column: "L", value: "1", valueUnknown: false }); }), "field");
  assert.equal(bad((r) => { r.position = 5; }), "field");
  assert.equal(bad((r) => { r.items[17].reached = false; r.items[17].column = null; r.items[17].value = null; r.items[17].valueUnknown = false; }), "field");
  const a = aborted(p);
  const r2 = JSON.parse(JSON.stringify(a));
  r2.items[5].reached = true;
  assert.equal(L.validateResponseRecord(re(r2), record).code, "field");
});

// ------------------------------------------------------------------ m2: key and packet bound to the commitments
test("a key that differs from its commitment is not used; the locked response stays", () => {
  const a = makeAdmin();
  const k = JSON.parse(a.key.toString("utf8"));
  k.items[0].answer = "13:30";
  writeFileSync(join(a.dir, "key.json"), `${JSON.stringify(k, null, 1)}\n`);
  const r = lockAndScore({ adminDir: a.dir, responsePath: writeResp(a.dir, "a.json", completed(a.p)) });
  assert.equal(r.code, "key_commitment");
  assert.equal(r.lock, "new");
  assert.equal(existsSync(join(a.dir, "score", "score.json")), false);
  const last = JSON.parse(readFileSync(join(a.dir, "score", "last-run.json"), "utf8"));
  assert.deepEqual([last.ok, last.code], [false, "key_commitment"]);
});

test("score.json records which hash scope each integrity check used", () => {
  const a = makeAdmin();
  const r = lockAndScore({ adminDir: a.dir, responsePath: writeResp(a.dir, "a.json", completed(a.p)) });
  assert.equal(r.ok, true);
  const s = JSON.parse(readFileSync(join(a.dir, "score", "score.json"), "utf8"));
  assert.equal(s.integrity.packetFile.sha256, sha(a.html));
  assert.equal(s.integrity.packetFile.commitmentOk, true);
  assert.equal(s.integrity.packetPayload.packetHash, a.p.packetHash);
  assert.equal(s.integrity.key.commitmentOk, true);
  assert.match(s.integrity.response.digestScope, /self-consistency/);
  assert.equal(s.integrity.response.sha256, r.responseSha256);
});

// ------------------------------------------------------------------ m3: lock, retry, partial failure, output
test("first valid response is locked no-clobber; same bytes retry; a different response is refused", () => {
  const a = makeAdmin();
  const fa = writeResp(a.dir, "a.json", completed(a.p));
  const fb = writeResp(a.dir, "b.json", completed(a.p, () => ({ column: "L", value: "1" })));
  const r1 = lockAndScore({ adminDir: a.dir, responsePath: fa });
  assert.deepEqual([r1.ok, r1.lock], [true, "new"]);
  const t1 = readFileSync(join(a.dir, "score", "score.json"), "utf8");
  const r2 = lockAndScore({ adminDir: a.dir, responsePath: fa });
  assert.deepEqual([r2.ok, r2.lock], [true, "same"]);
  assert.equal(readFileSync(join(a.dir, "score", "score.json"), "utf8"), t1);
  const r3 = lockAndScore({ adminDir: a.dir, responsePath: fb });
  assert.deepEqual([r3.ok, r3.code], [false, "lock_different"]);
  assert.equal(readFileSync(join(a.dir, "responses", "locked.json"), "utf8"), readFileSync(fa, "utf8"));
  assert.equal(JSON.parse(readFileSync(join(a.dir, "score", "last-run.json"), "utf8")).ok, false);
  assert.equal(readFileSync(join(a.dir, "score", "score.json"), "utf8"), t1);
});

test("a competing lock written between the check and the link wins; the late response is refused", () => {
  const a = makeAdmin();
  const fa = writeResp(a.dir, "a.json", completed(a.p));
  const fb = writeResp(a.dir, "b.json", completed(a.p, () => ({ column: "L", value: "1" })));
  const r = lockAndScore({ adminDir: a.dir, responsePath: fa, faults: { beforeLink: () => { mkdirSync(join(a.dir, "responses"), { recursive: true }); writeFileSync(join(a.dir, "responses", "locked.json"), readFileSync(fb)); } } });
  assert.equal(r.code, "lock_different");
  assert.equal(readFileSync(join(a.dir, "responses", "locked.json"), "utf8"), readFileSync(fb, "utf8"));
  assert.equal(readdirSync(join(a.dir, "responses")).filter((n) => n.endsWith(".tmp")).length, 0);
});

test("a failure after the lock leaves a consistent state, and retrying the same file recovers the result", () => {
  const a = makeAdmin();
  const fa = writeResp(a.dir, "a.json", completed(a.p));
  const r1 = lockAndScore({ adminDir: a.dir, responsePath: fa, faults: { afterLock: () => { throw new Error("simulated crash 모의 질문 1 12:30"); } } });
  assert.deepEqual([r1.ok, r1.code], [false, "io"]);
  assert.equal(existsSync(join(a.dir, "score", "score.json")), false);
  assert.equal(JSON.parse(readFileSync(join(a.dir, "score", "last-run.json"), "utf8")).ok, false);
  // a crash between locked.json and locked.sha256 is also recovered
  unlinkSync(join(a.dir, "responses", "locked.sha256"));
  const r2 = lockAndScore({ adminDir: a.dir, responsePath: fa });
  assert.deepEqual([r2.ok, r2.lock], [true, "same"]);
  assert.equal(readFileSync(join(a.dir, "responses", "locked.sha256"), "utf8").slice(0, 64), sha(readFileSync(fa)));
  assert.equal(JSON.parse(readFileSync(join(a.dir, "score", "last-run.json"), "utf8")).ok, true);
  // a lock whose recorded hash disagrees with its bytes is corruption, not a retry
  writeFileSync(join(a.dir, "responses", "locked.sha256"), `${"0".repeat(64)}  locked.json\n`);
  assert.equal(lockAndScore({ adminDir: a.dir, responsePath: fa }).code, "lock_corrupt");
});

test("check-only mode validates and reports the response SHA-256 without a lock or the key", () => {
  const a = makeAdmin();
  unlinkSync(join(a.dir, "key.json"));
  const f = writeResp(a.dir, "a.json", completed(a.p));
  const r = lockAndScore({ adminDir: a.dir, responsePath: f, checkOnly: true });
  assert.deepEqual([r.ok, r.lock, r.responseSha256], [true, "none", sha(readFileSync(f))]);
  assert.equal(existsSync(join(a.dir, "responses")), false);
  assert.equal(existsSync(join(a.dir, "score")), false);
});

test("scorer CLI stdout is one safe line in every scenario and never carries questions, answers or error text", () => {
  const a = makeAdmin();
  const resp = completed(a.p);
  const files = {
    ok: writeResp(a.dir, "ok.json", resp),
    other: writeResp(a.dir, "other.json", completed(a.p, () => ({ column: "L", value: "1" }))),
    digest: writeResp(a.dir, "digest.json", { ...resp, digest: "0".repeat(64) }),
    json: writeResp(a.dir, "json.json", "{ not json 모의 질문 1"),
  };
  const lines = [];
  const cli = (args) => {
    try { return execFileSync(process.execPath, [SCORER, "--admin", a.dir, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return String(e.stdout); }
  };
  for (const f of [files.digest, files.json, files.ok, files.ok, files.other]) lines.push(cli(["--response", f]));
  lines.push(cli(["--response", files.ok, "--check-only"]));
  lines.push(cli(["--self-check"]));
  lines.push(cli([]));
  for (const out of lines) {
    const ls = out.trim().split("\n");
    assert.equal(ls.length, 1, out);
    assert.doesNotThrow(() => L.safeLine(JSON.parse(ls[0])));
    for (const canary of ["모의 질문", "12:30", "12시30분", "50명", "simulated", "Error", "at "]) assert.ok(!ls[0].includes(canary), `${canary} in ${ls[0]}`);
  }
});

test("score command files: failure never points at an old score table, and recount runs only after success", () => {
  const dir = mkdtempSync(join(tmpdir(), "kbr-cmd-"));
  const files = L.adminCommandFiles();
  const score = files["채점.cmd"], check = files["응답확인.cmd"];
  const failBranch = score.split(/\r\n/).filter((l) => /FAILED|실패/.test(l));
  assert.ok(failBranch.length > 0);
  for (const l of failBranch) assert.ok(!/score-table|score\\score/.test(l), l);
  const recountLine = score.split(/\r\n/).findIndex((l) => l.includes("recount.py"));
  const okGate = score.split(/\r\n/).findIndex((l) => /errorlevel 1 goto/.test(l));
  assert.ok(okGate >= 0 && okGate < recountLine);
  assert.ok(check.includes("--check-only"));
  assert.ok(!check.includes("recount.py"));
  assert.ok(files["README.txt"].includes("응답확인.cmd"));
  rmSync(dir, { recursive: true });
});

// ------------------------------------------------------------------ reproduction: LF / CRLF checkouts
test("pinned research lock: LF blob bytes give the registered SHA-256, the CRLF conversion the other raw hash", () => {
  const v = lockVariants();
  assert.equal(v.blob, "6b103b97c99527975958a7cb0fd023e0dc134cf0");
  assert.equal(v.lf, "df4a66b38c983e555beafc0910fef781b2ede8ffc9e3c95eca45ac6e5a86fe1e");
  assert.equal(v.crlf, "863462f3b6a519485d65cece049098dc20a5ad27fdd118464394213cd60f7534");
});

test("evidence comparison: only stdout paths and the raw lock line-ending variant may differ, and both are reported", () => {
  const exp = mkdtempSync(join(tmpdir(), "kbr-exp-")), work = mkdtempSync(join(tmpdir(), "kbr-work-"));
  const v = lockVariants();
  const guard = (lock) => `${JSON.stringify({ step: "s", researchLockSha256: lock, researchLockBlob: v.blob, langFiles: [1] }, null, 1)}\n`;
  const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
  put(exp, "ocr/guard-summary.json", guard(v.crlf));
  put(exp, "a.json", "{}\n");
  put(exp, "stdout.jsonl", "C:/x\n");
  writeFileSync(join(exp, "SHA256SUMS"), ["a.json", "ocr/guard-summary.json", "stdout.jsonl"].map((f) => `${sha(readFileSync(join(exp, f)))}  ${f}`).join("\n") + "\n");
  put(work, "ocr/guard-summary.json", guard(v.lf));
  put(work, "a.json", "{}\n");
  put(work, "stdout.jsonl", "D:/y\n");
  const ok = compareEvidence(exp, work);
  assert.deepEqual([ok.ok, ok.equal, ok.differ, ok.lockExpected, ok.lockWork, ok.excluded], [true, 2, 0, "crlf", "lf", 1]);
  put(work, "ocr/guard-summary.json", guard("1".repeat(64)));
  assert.equal(compareEvidence(exp, work).ok, false);
  put(work, "ocr/guard-summary.json", guard(v.lf).replace("[\n  1\n ]", "[\n  2\n ]"));
  assert.equal(compareEvidence(exp, work).ok, false);
  put(work, "ocr/guard-summary.json", guard(v.lf));
  put(work, "a.json", "{\"x\":1}\n");
  assert.equal(compareEvidence(exp, work).differ, 1);
});
