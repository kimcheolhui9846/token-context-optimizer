// Offline tests for the budget and resume guards. Run: node --test test/
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkResume, configFingerprint, estimateSlotCost } from "../src/run-guards.mjs";

const price = { inputPerM: 2.5, outputPerM: 10 };

test("C2 estimate covers both calls and exceeds a single-call slot", () => {
  const single = estimateSlotCost({ arm: "C1", imageTokens: 765, maxTokens: 40, price });
  const twoStage = estimateSlotCost({ arm: "C2", imageTokens: 765, maxTokens: 40, price });
  assert.ok(twoStage > single);
  // locate call: (85 + 200) in, 60 out
  assert.equal(Number((twoStage - single).toFixed(9)), Number((((85 + 200) * 2.5 + 60 * 10) / 1e6).toFixed(9)));
});

test("C2 estimate bounds the pilot-003 case the PR #33 review cited (actual $0.003145)", () => {
  // Largest variant in dev3 is 2048x1536 -> 765 GPT-4o image tokens; pilot-003 used max_tokens 40.
  const est = estimateSlotCost({ arm: "C2", imageTokens: 765, maxTokens: 40, price });
  assert.ok(est >= 0.003145, `estimate ${est} below observed cost`);
});

test("fingerprint ignores key order and changes with any field", () => {
  const a = configFingerprint({ model: "m", provider: "openai", inputs: "x" });
  assert.equal(a, configFingerprint({ inputs: "x", provider: "openai", model: "m" }));
  assert.notEqual(a, configFingerprint({ model: "m", provider: "anthropic", inputs: "x" }));
});

test("resume is refused when settings differ or the stored config predates the guard", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  const path = join(dir, "config.json");
  assert.equal(checkResume(path, "f1"), "new");
  writeFileSync(path, JSON.stringify({ fingerprint: "f1" }));
  assert.equal(checkResume(path, "f1"), "resume");
  assert.throws(() => checkResume(path, "f2"), /different settings/);
  writeFileSync(path, JSON.stringify({ runId: "old" }));
  assert.throws(() => checkResume(path, "f1"), /no fingerprint/);
});
