// FCP recount regression (PR #145 PM review): a selector technical-error row makes no request, so requestFull is null.
// Mock run = a copy of run A where one id is turned into a selector error; its rows come from the real runner row
// function (fcp-lib runCropRow) and are scored by the real scorer. The committed measurement files are only read.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RUN_EVIDENCE_FILES, runCropRow, sha256 } from "../src/fcp-lib.mjs";

const research = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = join(research, "results", "fresh-crop-padding");
const ID = "schedule-table-code-v1-en"; // a matched id in run A
const jsonl = (f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const writeJsonl = (f, rows) => writeFileSync(f, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
const node = (args) => spawnSync(process.execPath, args, { cwd: research, encoding: "utf8", windowsHide: true });
const recount = (run, score, out) => spawnSync("python", ["-I", join(research, "tools", "fcp-recount.py"), "--run", run, "--frozen", join(D, "frozen"), "--score", score, "--out", out], { cwd: research, encoding: "utf8", windowsHide: true });

test("recount accepts null requestFull on a selector-error row and flags false", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "fcp-recount-reg-"));
  try {
    const run = join(tmp, "run");
    mkdirSync(run);
    for (const f of RUN_EVIDENCE_FILES) copyFileSync(join(D, "run-a", f), join(run, f));
    // caller: one id becomes a technical error
    const callers = jsonl(join(run, "caller.jsonl"));
    const c = callers.find((r) => r.id === ID);
    assert.equal(c.matched, true);
    Object.assign(c, { status: "error", error: "mock_selector_error", keys: null, matched: null, score: null, lineText: null, confidence: null, axisRow: null, band: null, ocrLineCount: null, ocrLines: null });
    writeJsonl(join(run, "caller.jsonl"), callers);
    // raw: rows for that id from the real runner path (no product call is made)
    const raw = jsonl(join(run, "raw.jsonl"));
    const noCall = { async callTool() { throw new Error("product must not be called for a selector error"); } };
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      if (r.id !== ID) continue;
      const row = await runCropRow({ client: noCall, p: r.p, image: { id: ID, file: "unused", page: r.page, expectedSha: "unused" }, caller: c, allowedRoot: tmp });
      const { key, p, id, pairId, lang, anchor, doctype, layout, variant, page } = r;
      raw[i] = { key, p, id, pairId, lang, anchor, doctype, layout, variant, band: null, page, ...row };
      assert.equal(raw[i].requestFull, null);
      assert.equal(raw[i].failCode, "caller_error");
    }
    writeJsonl(join(run, "raw.jsonl"), raw);
    const ic = JSON.parse(readFileSync(join(run, "input-check.json"), "utf8"));
    ic.callerSha256 = sha256(readFileSync(join(run, "caller.jsonl")));
    ic.intents = { ...ic.intents, matched: ic.intents.matched - 1, caller_error: ic.intents.caller_error + 1 };
    ic.images[ID].intent = "caller_error";
    writeFileSync(join(run, "input-check.json"), `${JSON.stringify(ic, null, 1)}\n`);
    const files = Object.fromEntries(RUN_EVIDENCE_FILES.map((f) => [f, sha256(readFileSync(join(run, f)))]));
    writeFileSync(join(run, "evidence.json"), `${JSON.stringify({ hashBasis: "SHA-256 of raw file bytes", files }, null, 1)}\n`);

    // real scorer
    const score = join(tmp, "score");
    const s = node(["src/fcp-score.mjs", "--run", run, "--frozen", join(D, "frozen"), "--out", score, "--non-measurement"]);
    assert.equal(s.status, 0, s.stderr);
    const sj = JSON.parse(readFileSync(join(score, "score.json"), "utf8"));
    const rows = sj.perRow.filter((r) => r.id === ID);
    assert.equal(rows.length, 2);
    for (const r of rows) assert.deepEqual([r.intent, r.requestRect, r.requestFull, r.state], ["caller_error", null, null, "NE"]);
    assert.equal(sj.aggregate.byP["0"].matchedDenominator, 35);
    assert.equal(sj.aggregate.byP["0"].callerErrors, 1);

    // recount passes on the correct output
    const ok = recount(run, score, join(tmp, "ok.json"));
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.equal(JSON.parse(readFileSync(join(tmp, "ok.json"), "utf8")).mismatches.length, 0);

    // a copy with null -> false on one score row is caught
    const bad = join(tmp, "score-bad");
    mkdirSync(bad);
    const mutated = JSON.parse(readFileSync(join(score, "score.json"), "utf8"));
    mutated.perRow.find((r) => r.key === `p0|${ID}`).requestFull = false;
    writeFileSync(join(bad, "score.json"), `${JSON.stringify(mutated, null, 1)}\n`);
    const ng = recount(run, bad, join(tmp, "bad.json"));
    assert.equal(ng.status, 1, ng.stdout + ng.stderr);
    const mm = JSON.parse(readFileSync(join(tmp, "bad.json"), "utf8")).mismatches;
    assert.deepEqual(mm.map((m) => [m.key, m.field, m.recount, m.score]), [[`p0|${ID}`, "score.requestFull", null, false]]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
