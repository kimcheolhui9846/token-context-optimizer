// PM review fixes for the Korean OCR factorial (PR #147 review of 78ea93e):
// A/B row comparison in both directions (protocol 6.4) and the registered pre-OCR stop record (protocol 7).
// Run: node --test test/ko-ocr-factorial-review.test.mjs  (from research/)
import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { compareRows, runPreflight, writeStop } from "../src/ko-ocr-factorial-lib.mjs";

const research = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const R = join(research, "results", "ko-ocr-factorial");
const tmp = () => mkdtempSync(join(tmpdir(), "kof-review-"));
const key = (r) => `${r.k}`;

// ------------------------------------------------------------------ compareRows
test("compareRows: identical rows are reproduced", () => {
  const a = [{ k: 1, v: "x" }, { k: 2, v: "y" }];
  const r = compareRows(a, structuredClone(a), key);
  assert.equal(r.sameRows, 2);
  assert.equal(r.identical, true);
  assert.deepEqual([r.onlyInA, r.onlyInB, r.duplicatesInA, r.duplicatesInB, r.diffs], [[], [], [], [], []]);
});

test("compareRows: a duplicated row in B is reported and not counted as same", () => {
  const a = [{ k: 1, v: "x" }, { k: 2, v: "y" }];
  const r = compareRows(a, [...a, { k: 2, v: "y" }], key);
  assert.equal(r.denominator, 2);
  assert.equal(r.rowsB, 3);
  assert.equal(r.sameRows, 1);
  assert.equal(r.identical, false);
  assert.deepEqual(r.duplicatesInB, [{ key: "2", count: 2 }]);
});

test("compareRows: keys only on one side, one-sided fields and value differences are all listed", () => {
  const a = [{ k: 1, v: "x" }, { k: 2, v: "y" }, { k: 3, v: "z" }];
  const b = [{ k: 1, v: "x", extra: true }, { k: 2, v: "Y" }, { k: 4, v: "w" }];
  const r = compareRows(a, b, key);
  assert.equal(r.sameRows, 0);
  assert.deepEqual(r.onlyInA, ["3"]);
  assert.deepEqual(r.onlyInB, ["4"]);
  const d1 = r.diffs.find((d) => d.key === "1");
  assert.deepEqual(d1.fieldsOnlyInB, ["extra"]);
  const d2 = r.diffs.find((d) => d.key === "2");
  assert.deepEqual(d2.fields, ["v"]);
  assert.deepEqual([d2.a.v, d2.b.v], ["y", "Y"]);
});

test("compareRows: order-only difference keeps row content separate from byte identity", () => {
  const a = [{ k: 1 }, { k: 2 }];
  const r = compareRows(a, [{ k: 2 }, { k: 1 }], key);
  assert.equal(r.sameRows, 2);
  assert.equal(r.sameOrder, false);
  assert.equal(r.identical, false);
});

// ------------------------------------------------------------------ compare CLI on the published results (both directions)
function copyRuns() {
  const d = tmp();
  for (const f of ["run-a", "run-b", "score-a", "score-b"]) cpSync(join(R, f), join(d, f), { recursive: true });
  return d;
}
const compareCli = (d, out) => spawnSync(process.execPath, ["src/ko-ocr-factorial-compare.mjs", "--a", join(d, "run-a"), "--b", join(d, "run-b"), "--score-a", join(d, "score-a"), "--score-b", join(d, "score-b"), "--out", out], { cwd: research, encoding: "utf8" });

test("compare CLI: published runs stay reproduced with the original denominators", () => {
  const d = copyRuns();
  try {
    const out = join(d, "cmp.json");
    const p = compareCli(d, out);
    assert.equal(p.status, 0, p.stderr);
    const c = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(c.reproduced, true);
    assert.deepEqual([c.predictions.denominator, c.predictions.sameRows, c.ocr.sameRows, c.score.denominator, c.score.sameRows, c.history.sameRows], [192, 192, 192, 384, 384, 96]);
    for (const v of Object.values(c.bytes)) assert.equal(v.identical, true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("compare CLI: one duplicated score row in B is reported and the run is not reproduced", () => {
  const d = copyRuns();
  try {
    const f = join(d, "score-b", "score.jsonl");
    const last = readFileSync(f, "utf8").trim().split("\n").pop();
    appendFileSync(f, `${last}\n`);
    const out = join(d, "cmp.json");
    const p = compareCli(d, out);
    assert.equal(p.status, 1);
    const c = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(c.reproduced, false);
    assert.equal(c.bytes["score.jsonl"].identical, false);
    assert.equal(c.score.denominator, 384);
    assert.equal(c.score.rowsB, 385);
    assert.equal(c.score.sameRows, 383);
    assert.equal(c.score.duplicatesInB.length, 1);
    assert.equal(c.score.duplicatesInB[0].count, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ pre-OCR stop record
test("runPreflight collects every failing step and writeStop records it", () => {
  const problems = runPreflight([["a", () => {}], ["b", () => { throw new Error("boom"); }], ["c", () => { throw new Error("again"); }]]);
  assert.deepEqual(problems, ["b: boom", "c: again"]);
  const d = tmp();
  try {
    writeStop(d, problems);
    assert.deepEqual(JSON.parse(readFileSync(join(d, "stop.json"), "utf8")), { stopped: "before OCR", problems });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("runner without the fixed #145/#146 commits writes stop.json, exits 2 and starts no OCR", { timeout: 300000 }, () => {
  const d = tmp();
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: research, encoding: "utf8" }).trim();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: research, encoding: "utf8" }).trim();
    const clone = join(d, "repo");
    // Single-branch clone of this commit only: #145 / #146 heads are not reachable from it.
    execFileSync("git", ["init", "-q", clone]);
    execFileSync("git", ["fetch", "-q", "--no-tags", top, head], { cwd: clone });
    execFileSync("git", ["checkout", "-q", "--detach", "FETCH_HEAD"], { cwd: clone });
    const missing = spawnSync("git", ["cat-file", "-t", "708d9946ae091180a1b716baadfdd73fcfe5a19b"], { cwd: clone });
    assert.notEqual(missing.status, 0, "the clone must not hold the #145 commit");
    const cr = join(clone, "research");
    // The working-copy runner and library under test, the installed packages, and the prepared language files.
    for (const f of ["ko-ocr-factorial-run.mjs", "ko-ocr-factorial-lib.mjs"]) cpSync(join(research, "src", f), join(cr, "src", f));
    symlinkSync(join(research, "node_modules"), join(cr, "node_modules"), "junction");
    if (existsSync(join(research, ".cache", "ko-ocr-factorial"))) cpSync(join(research, ".cache", "ko-ocr-factorial"), join(cr, ".cache", "ko-ocr-factorial"), { recursive: true });
    const out = join(d, "run");
    const log = join(d, "guard.jsonl");
    const p = spawnSync(process.execPath, ["src/ko-ocr-factorial-run.mjs", "--out", out, "--non-measurement"], {
      cwd: cr, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: `--require=${join(cr, "tools", "d03", "guard", "node-netguard.cjs")}`, D03_NET_LOG: log, D03_STEP: "kof-stop-test" },
    });
    assert.equal(p.status, 2, p.stderr);
    const stop = JSON.parse(readFileSync(join(out, "stop.json"), "utf8"));
    assert.equal(stop.stopped, "before OCR");
    assert.ok(stop.problems.some((x) => x.startsWith("fixed inputs:") && x.includes("708d9946ae091180a1b716baadfdd73fcfe5a19b")), JSON.stringify(stop.problems));
    for (const f of ["predictions.jsonl", "ocr.jsonl", "freeze.json", "run-meta.json"]) assert.equal(existsSync(join(out, f)), false, f);
    const blocked = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => l.includes('"blocked"')).length : 0;
    assert.equal(blocked, 0);
  } finally {
    // Remove the node_modules junction itself first so cleanup can never follow it into the real packages.
    const link = join(d, "repo", "research", "node_modules");
    try { unlinkSync(link); } catch { /* not created */ }
    rmSync(d, { recursive: true, force: true });
  }
});
