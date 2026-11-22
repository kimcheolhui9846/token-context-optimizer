// Offline tests for the R08 evidence check (doc §5 step 6). Run: node --test test/r08-evidence-check.test.mjs
// A checkout at another path changes only the 8 raw capture hashes; that must pass. Any other change must fail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkEvidence } from "../src/r08-evidence-check.mjs";

const caps = Object.fromEntries(["exp3", "pre002", "post002", "latest"].flatMap((r) => [1, 2].map((n) => [`capture-${r}-${n}.jsonl`, `${r}${n}`.padEnd(64, "0")])));
const benches = { "bench-exp3-1/rows.jsonl": "b".repeat(64) };
const summary = (capSha = caps) => ({ schema: "r08-excerpt-parity/v3", failures: [], pairs: { "exp3→latest": { identical: 286, firstExcerptIdentical: 297 } },
  storedComparisons: { "001-exp3": { storedRows: 297, joinedRows: 297, differingRows: 0 } }, rawSha256: { ...capSha, ...benches }, excerptKeysSha256: "k".repeat(64) });
const keys = [{ key: "a/s/1/full", goldLine: 107, latest: { h: "x" } }, { key: "a/s/1/entity", goldLine: 107, latest: { h: "y" } }];
const files = (sum = summary(), k = keys, jpeg = { schema: "r08-jpeg-parity/v3", probe: { identical: 458 } }) => ({
  "excerpt-keys.jsonl": k.map((r) => JSON.stringify(r)).join("\n") + "\n",
  "excerpt-summary.json": JSON.stringify(sum, null, 2) + "\n",
  "jpeg-summary.json": JSON.stringify(jpeg, null, 2) + "\n",
});
// A rerun at another path: every capture hash differs from the committed one and matches the new actual file.
const moved = Object.fromEntries(Object.keys(caps).map((k) => [k, "f".repeat(63) + k.length % 10]));

test("identical evidence passes", () => {
  assert.deepEqual(checkEvidence({ committed: files(), fresh: files(), captureSha: caps }), []);
});

test("a checkout at another path (only the 8 capture hashes change, matching the actual files) passes", () => {
  assert.deepEqual(checkEvidence({ committed: files(), fresh: files(summary(moved)), captureSha: moved }), []);
});

test("a CRLF working copy of the committed files passes", () => {
  const crlf = Object.fromEntries(Object.entries(files()).map(([k, v]) => [k, v.replace(/\n/g, "\r\n")]));
  assert.deepEqual(checkEvidence({ committed: crlf, fresh: files(), captureSha: caps }), []);
});

test("one changed goldLine in the first file (excerpt-keys.jsonl) fails even though later files are equal", () => {
  const bad = keys.map((r, i) => (i === 0 ? { ...r, goldLine: 108 } : r));
  const f = checkEvidence({ committed: files(), fresh: files(summary(), bad), captureSha: caps });
  assert.equal(f.length, 1);
  assert.match(f[0], /^excerpt-keys\.jsonl: .*goldLine/);
});

test("a changed figure inside the summary fails", () => {
  const sum = summary();
  sum.pairs["exp3→latest"].identical = 285;
  assert.match(checkEvidence({ committed: files(), fresh: files(sum), captureSha: caps }).join("\n"), /excerpt-summary\.json: .*identical/);
  const sum2 = summary();
  sum2.storedComparisons["001-exp3"].joinedRows = 296;
  assert.match(checkEvidence({ committed: files(), fresh: files(sum2), captureSha: caps }).join("\n"), /joinedRows/);
});

test("a capture hash that does not match the actual file fails", () => {
  const f = checkEvidence({ committed: files(), fresh: files(summary(moved)), captureSha: caps });
  assert.equal(f.length, 8);
  assert.match(f[0], /does not match the actual file/);
});

test("a changed path-independent raw hash (bench rows) still fails", () => {
  const sum = summary();
  sum.rawSha256["bench-exp3-1/rows.jsonl"] = "c".repeat(64);
  assert.match(checkEvidence({ committed: files(), fresh: files(sum), captureSha: caps }).join("\n"), /bench-exp3-1/);
});

test("a changed JPEG summary, a missing file or a missing capture hash fails", () => {
  assert.match(checkEvidence({ committed: files(), fresh: files(summary(), keys, { schema: "r08-jpeg-parity/v3", probe: { identical: 457 } }), captureSha: caps }).join("\n"), /jpeg-summary/);
  const fr = files(); delete fr["jpeg-summary.json"];
  assert.match(checkEvidence({ committed: files(), fresh: fr, captureSha: caps }).join("\n"), /jpeg-summary\.json: fresh file missing/);
  const few = { ...caps }; delete few["capture-latest-2.jsonl"];
  const sum = summary(few);
  assert.match(checkEvidence({ committed: files(), fresh: files(sum), captureSha: caps }).join("\n"), /capture hash keys differ|expected 8/);
});
