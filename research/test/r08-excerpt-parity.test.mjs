// Offline tests for the R08 excerpt parity comparator. Run: node --test test/r08-excerpt-parity.test.mjs
// The comparator must not report success on duplicate keys, missing or extra rows, a wrong bundle, a log whose bytes do
// not match the manifest, or a capture that drifted from the excerpt-bench row of the same run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze, normalizeResponse } from "../src/r08-excerpt-parity.mjs";

const LOG_SHA = "a".repeat(64);
const manifests = {
  heldout: { sessions: [{ id: "s1", log: { sha256: LOG_SHA }, turns: [
    { q: "What code is on node edge-9?", type: "immediate-log", answers: ["E1"], evidence: { log: 3 } },
    { q: "gist question", type: "late-gist", answers: ["x"], evidence: {} },
  ] }] },
};
const VARIANTS = ["full", "keywords", "entity"];
const excerpt = (s, e, text = `t${s}-${e}`) => ({ text, sourceMap: { path: "C:\\x\\log.txt", startLine: s, endLine: e, startByte: s * 10, endByte: e * 10, completeSpan: true } });
const response = (ranges, extra = {}) => ({ artifactId: "artifact_1", sha256: LOG_SHA, estimatedTokens: 5, confidence: "low", warnings: [], fallbackReason: null, excerpts: ranges.map(([s, e]) => excerpt(s, e)), ...extra });

function run(role, rep, { ranges = [[2, 4]], bundleSha = `${role}-sha`, mutate } = {}) {
  const capture = [{ kind: "meta", role, rep, bundleSha256: bundleSha }];
  const bench = [];
  for (const variant of VARIANTS) {
    const query = variant === "entity" ? "edge-9" : `q-${variant}`;
    capture.push({ kind: "query", split: "heldout", session: "s1", turn: 1, variant, type: "immediate-log", goldLine: 3,
      answers: ["E1"], query, applicable: true, logSha256: LOG_SHA, manifestLogSha256: LOG_SHA, indexSha256: LOG_SHA,
      response: response(ranges) });
    bench.push({ split: "heldout", session: "s1", turn: 1, type: "immediate-log", variant, query, applicable: true, goldLine: 3,
      excerpt: ranges[0], excerpts: ranges.length, goldCovered: true, answerInExcerpt: true, fallbackReason: null,
      excerptRanges: ranges, moreMatches: null, anyCovered: true, anyAnswer: true, bestScore: 2, tieCount: 1,
      goldAmongTies: true, replicaAgrees: true });
  }
  const r = { role, rep, capture, bench };
  mutate?.(r);
  return r;
}
const expectedBundles = { old: "old-sha", latest: "latest-sha" };
const base = () => [run("old", 1), run("old", 2), run("latest", 1), run("latest", 2)];

test("clean input has no failures and every key compares equal", () => {
  const rep = analyze({ manifests, expectedBundles, runs: base() });
  assert.deepEqual(rep.failures, []);
  assert.equal(rep.expectedKeys, 3);
  assert.equal(rep.pairs["old→latest"].identical, 3);
  assert.equal(rep.pairs["old→latest"].held, 0);
});

test("a duplicate key fails", () => {
  const runs = base();
  runs[0].capture.push(runs[0].capture[1]);
  assert.match(analyze({ manifests, expectedBundles, runs }).failures.join("\n"), /duplicate/);
});

test("a missing bench row fails", () => {
  const runs = base();
  runs[2].bench.pop();
  assert.match(analyze({ manifests, expectedBundles, runs }).failures.join("\n"), /missing/);
});

test("an extra key fails", () => {
  const runs = base();
  runs[3].capture.push({ ...runs[3].capture[1], session: "s9" });
  assert.match(analyze({ manifests, expectedBundles, runs }).failures.join("\n"), /extra/);
});

test("a wrong bundle hash fails", () => {
  const runs = base();
  runs[1].capture[0].bundleSha256 = "other";
  assert.match(analyze({ manifests, expectedBundles, runs }).failures.join("\n"), /bundle/);
});

test("a log whose bytes do not match the manifest fails", () => {
  const runs = base();
  runs[0].capture[2].logSha256 = "b".repeat(64);
  assert.match(analyze({ manifests, expectedBundles, runs }).failures.join("\n"), /log sha256/);
});

test("a capture that drifted from the excerpt-bench row fails", () => {
  const runs = base();
  runs[0].bench[1].query = "different";
  runs[2].bench[0].excerptRanges = [[9, 9]];
  const f = analyze({ manifests, expectedBundles, runs }).failures.join("\n");
  assert.match(f, /query differs/);
  assert.match(f, /ranges differ/);
});

test("a missing run for a role fails", () => {
  const runs = base().slice(0, 3);
  assert.match(analyze({ manifests, expectedBundles, runs }).failures.join("\n"), /latest.*2 runs/);
});

test("disagreeing repetitions hold the key instead of comparing it", () => {
  const runs = base();
  runs[3].capture[3].response = response([[5, 6]]);
  runs[3].bench[2].excerptRanges = [[5, 6]];
  const rep = analyze({ manifests, expectedBundles, runs });
  assert.deepEqual(rep.failures, []);
  assert.deepEqual(rep.unstable.latest, ["heldout/s1/1/entity"]);
  assert.equal(rep.pairs["old→latest"].held, 1);
  assert.equal(rep.pairs["old→latest"].identical, 2);
});

test("a range difference between versions is reported per key", () => {
  const runs = [run("old", 1), run("old", 2), run("latest", 1, { ranges: [[2, 4], [7, 9]] }), run("latest", 2, { ranges: [[2, 4], [7, 9]] })];
  const rep = analyze({ manifests, expectedBundles, runs });
  assert.deepEqual(rep.failures, []);
  assert.equal(rep.pairs["old→latest"].identical, 0);
  assert.equal(rep.pairs["old→latest"].firstExcerptIdentical, 3);
  assert.equal(rep.pairs["old→latest"].differences.length, 3);
});

test("normalization drops path and artifactId, maps a legacy single excerpt to position 1, marks moreMatches absent", () => {
  const a = normalizeResponse({ response: response([[1, 2]]) });
  const b = normalizeResponse({ response: { ...response([[1, 2]]), artifactId: "artifact_2", excerpts: [{ ...excerpt(1, 2), sourceMap: { ...excerpt(1, 2).sourceMap, path: "D:\\y" } }] } });
  assert.deepEqual(a, b);
  assert.equal(a.excerpts[0].position, 1);
  assert.equal(a.moreMatches, "absent");
  assert.deepEqual(normalizeResponse({ response: response([[1, 2]], { moreMatches: { count: 1, lines: [9] } }) }).moreMatches, { count: 1, lines: [9] });
  assert.deepEqual(normalizeResponse({ error: "boom" }), { error: "boom" });
});
