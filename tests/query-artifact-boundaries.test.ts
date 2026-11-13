import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryArtifactStore, indexArtifact, queryArtifact, type ArtifactStore } from "../src/core/artifacts.js";
import * as tokenEstimator from "../src/core/token-estimator.js";

async function query(content: string, options: Partial<Parameters<typeof queryArtifact>[0]> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "tco-query-boundary-"));
  fixtureDirs.add(dir);
  const path = join(dir, "fixture.txt");
  await writeFile(path, content, "utf8");
  const store = new MemoryArtifactStore();
  const artifact = await indexArtifact({ path, store, allowedRoots: [dir] });
  return { artifact, path, result: queryArtifact({ artifactId: artifact.artifactId, query: "needle", maxTokens: 400, contextLines: 0, store, ...options }) };
}

const fixtureDirs = new Set<string>();
afterEach(async () => {
  await Promise.all([...fixtureDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  fixtureDirs.clear();
});

describe("query artifact boundary behavior", () => {
  it("uses five excerpts by default and caps omitted metadata at twenty lines", async () => {
    const lines = Array.from({ length: 78 }, (_, index) => `needle ${index + 1}`);
    const { result } = await query(lines.join("\n"));
    expect(result.excerpts).toHaveLength(5);
    expect(result.moreMatches).toEqual({ count: 73, lines: Array.from({ length: 20 }, (_, index) => index + 6) });
  });

  it("handles hundreds of thousands of indexed lines without argument-spread failure", async () => {
    const content = Array.from({ length: 300_000 }, () => "needle").join("\n");
    const { result } = await query(content, { maxTokens: 100 });
    expect(result.excerpts).toHaveLength(5);
    expect(result.moreMatches).toEqual({ count: 299_995, lines: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25] });
  });

  it("guards the dense-match performance regression with a bounded context budget", async () => {
    const content = Array.from({ length: 300_000 }, () => "needle").join("\n");
    const estimate = tokenEstimator.estimateTextTokens;
    const estimateSpy = vi.spyOn(tokenEstimator, "estimateTextTokens").mockImplementation(estimate);
    let result: ReturnType<typeof queryArtifact>;
    let largeRenderCalls: Array<[string]>;
    try {
      ({ result } = await query(content, { contextLines: 2, maxTokens: 100 }));
      largeRenderCalls = estimateSpy.mock.calls.filter(([text]) => text.length > 100);
    } finally {
      estimateSpy.mockRestore();
    }
    expect(largeRenderCalls.length).toBeGreaterThan(0);
    expect(largeRenderCalls.length).toBeLessThan(1_000);
    expect(result.excerpts).toHaveLength(1);
    expect(result.estimatedTokens).toBe(100);
    expect(result.excerpts[0].sourceMap.startLine).toBe(1);
    expect(result.excerpts[0].sourceMap.endLine).toBe(57);
    expect(result.moreMatches).toEqual({
      count: 299_943,
      lines: Array.from({ length: 20 }, (_, index) => index + 58),
    });
  });

  it("accepts the maximum excerpt count and reports exact global budget use", async () => {
    const { result } = await query("needle\nsmall\nneedle\nsmall", { maxExcerpts: 20, maxTokens: 4 });
    expect(result.excerpts).toHaveLength(2);
    expect(result.estimatedTokens).toBe(4);
  });

  it("keeps the first legacy context when later ties are starved by the budget", async () => {
    const lines = Array.from({ length: 35 }, (_, index) => `context ${index + 1}`);
    lines[10] = "needle first";
    lines[29] = "needle second";
    const firstText = lines.slice(0, 21).join("\n");
    const { result } = await query(lines.join("\n"), { contextLines: 10, maxTokens: Math.ceil(firstText.length / 4) });
    expect(result.excerpts[0].sourceMap.startLine).toBe(1);
    expect(result.excerpts[0].sourceMap.endLine).toBe(21);
    expect(result.moreMatches).toEqual({ count: 1, lines: [30] });
  });

  it("continues after an oversized first anchor to a shorter later anchor", async () => {
    const long = `needle ${"x".repeat(600)}`;
    const { result } = await query(`${long}\nneedle`, { maxTokens: 4, maxExcerpts: 2 });
    expect(result.excerpts).toHaveLength(1);
    expect(result.excerpts[0].sourceMap.startLine).toBe(2);
    expect(result.fallbackReason).toBeNull();
  });

  it("skips an oversized later anchor and accepts a shorter following anchor", async () => {
    const long = `needle ${"x".repeat(600)}`;
    const { result } = await query(`needle\n${long}\nneedle`, {
      contextLines: 0,
      maxTokens: 4,
      maxExcerpts: 3,
    });
    expect(result.excerpts.map((excerpt) => excerpt.sourceMap.startLine)).toEqual([1, 3]);
    expect(result.moreMatches).toEqual({ count: 1, lines: [2] });
  });

  it("refuses all oversized ties and reports every omitted anchor", async () => {
    const long = `needle ${"x".repeat(600)}`;
    const { result } = await query(Array.from({ length: 6 }, () => long).join("\n"), {
      contextLines: 0,
      maxTokens: 4,
    });
    expect(result.excerpts).toEqual([]);
    expect(result.estimatedTokens).toBe(0);
    expect(result.warnings).toEqual(["complete_span_required"]);
    expect(result.fallbackReason).toBe("source_span_exceeds_budget");
    expect(result.moreMatches).toEqual({ count: 6, lines: [1, 2, 3, 4, 5, 6] });
  });

  it("refuses an oversized first anchor in explicit single-span mode", async () => {
    const { result } = await query(`needle ${"x".repeat(600)}\nneedle`, { maxTokens: 4, maxExcerpts: 1 });
    expect(result.excerpts).toEqual([]);
    expect(result.fallbackReason).toBe("source_span_exceeds_budget");
    expect(result.moreMatches).toEqual({ count: 2, lines: [1, 2] });
  });

  it("preserves strict legacy shapes for unique best, no terms, no match, and empty source", async () => {
    const unique = await query("needle\nneedle exact\nother", { query: "needle exact", maxTokens: 20 });
    expect(unique.result).toStrictEqual({
      artifactId: unique.artifact.artifactId,
      sha256: unique.artifact.sha256,
      estimatedTokens: 3,
      confidence: "low",
      warnings: [],
      fallbackReason: null,
      excerpts: [{ text: "needle exact", sourceMap: { path: unique.artifact.path, startLine: 2, endLine: 2, startByte: 7, endByte: 19, completeSpan: true } }],
    });
    const longUnique = await query(`needle ${"x".repeat(600)}`, { maxTokens: 4 });
    expect(longUnique.result).toStrictEqual({
      artifactId: longUnique.artifact.artifactId,
      sha256: longUnique.artifact.sha256,
      estimatedTokens: 0,
      confidence: "low",
      warnings: ["complete_span_required"],
      fallbackReason: "source_span_exceeds_budget",
      excerpts: [],
    });
    const noTerms = await query("alpha", { query: "!!!" });
    expect(noTerms.result).toEqual(expect.objectContaining({ excerpts: [], fallbackReason: "no_query_terms" }));
    expect(noTerms.result).not.toHaveProperty("moreMatches");
    const noMatch = await query("alpha", { query: "missing" });
    expect(noMatch.result).toEqual(expect.objectContaining({ excerpts: [], fallbackReason: "no_query_match" }));
    expect(noMatch.result).not.toHaveProperty("moreMatches");
    const empty = await query("", { query: "missing" });
    expect(empty.result).toEqual(expect.objectContaining({ excerpts: [], fallbackReason: "no_query_match" }));
    expect(empty.result).not.toHaveProperty("moreMatches");
  });

  it("rejects invalid maxExcerpts values including null", async () => {
    const values = [0, 21, 1.5, null, "1"];
    for (const value of values) {
      await expect(query("needle", { maxExcerpts: value as never })).rejects.toThrow(/maxExcerpts/);
    }
  });

  it("preserves Unicode, BOM, CRLF/CR delimiters and source immutability", async () => {
    const content = "\uFEFFbefore\r\nneedle café\rneedle after";
    const { artifact, path, result } = await query(content, { contextLines: 1 });
    expect(result.excerpts[0].text).toBe(content);
    expect(result.excerpts[0].sourceMap.startByte).toBe(0);
    expect(result.excerpts[0].sourceMap.endByte).toBe(Buffer.byteLength(content));
    expect(artifact.content).toBe(content);
    await expect(readFile(path, "utf8")).resolves.toBe(content);
  });

  it("counts duplicate query terms in the existing score model", async () => {
    const { result } = await query("needle\nother extra", { query: "needle needle other extra" });
    expect(result.excerpts.map((excerpt) => excerpt.sourceMap.startLine)).toEqual([1, 2]);
  });

  it("merges overlapping context windows but keeps adjacent spans separate", async () => {
    const bridged = await query("a\nneedle\nb\nneedle\nc", { contextLines: 1, maxTokens: 20 });
    expect(bridged.result.excerpts).toHaveLength(1);
    expect(bridged.result.excerpts[0].sourceMap.startLine).toBe(1);
    expect(bridged.result.excerpts[0].sourceMap.endLine).toBe(5);

    const adjacent = await query("needle\nneedle\nend", { contextLines: 0, maxTokens: 20 });
    expect(adjacent.result.excerpts).toHaveLength(2);
    expect(adjacent.result.excerpts.map((excerpt) => excerpt.sourceMap.startLine)).toEqual([1, 2]);
  });

  it("keeps original delimiter bytes between adjacent excerpts", async () => {
    const content = "needle\r\nneedle\rneedle";
    const { result } = await query(content, { contextLines: 0, maxTokens: 20 });
    expect(result.excerpts).toHaveLength(3);
    const source = Buffer.from(content, "utf8");
    for (const excerpt of result.excerpts) {
      const { startByte, endByte } = excerpt.sourceMap;
      expect(source.subarray(startByte, endByte).toString("utf8")).toBe(excerpt.text);
    }
    expect(source.subarray(result.excerpts[0].sourceMap.endByte, result.excerpts[1].sourceMap.startByte).toString("utf8")).toBe("\r\n");
    expect(source.subarray(result.excerpts[1].sourceMap.endByte, result.excerpts[2].sourceMap.startByte).toString("utf8")).toBe("\r");
  });

  it("merges overlapping windows into one continuous excerpt before the first anchor", async () => {
    const { result } = await query("x\nx\nx\nneedle\nneedle\nx\nx", {
      contextLines: 3,
      maxTokens: 4,
    });
    expect(result.excerpts).toHaveLength(1);
    expect(result.excerpts[0].sourceMap.startLine).toBe(3);
    expect(result.excerpts[0].sourceMap.endLine).toBe(5);
  });

  it("allows a later anchor to merge after the excerpt cap and reports only the final omission", async () => {
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`);
    for (const index of [1, 5, 7, 11]) lines[index] = `needle ${index + 1}`;
    const { result } = await query(lines.join("\n"), { contextLines: 1, maxExcerpts: 2, maxTokens: 40 });
    expect(result.excerpts.map((excerpt) => [excerpt.sourceMap.startLine, excerpt.sourceMap.endLine])).toEqual([[1, 3], [5, 9]]);
    expect(result.moreMatches).toEqual({ count: 1, lines: [12] });
  });

  it("allows a rounded-cost overlap when no nominal budget remains", async () => {
    const { result } = await query("aaaax\n\nx", { query: "x", contextLines: 1, maxTokens: 2 });
    expect(result.excerpts).toHaveLength(1);
    expect(result.excerpts[0].text).toBe("aaaax\n\nx");
    expect(result).not.toHaveProperty("moreMatches");
  });
});

// N-35/N-36 query contract (plan PR #117, docs/superpowers/plans/2026-11-13-query-contract-n35-n36.md).
// Non-ASCII text is built from code points so the source carries no escape that a tool could unfold.
const cp = (...points: number[]) => String.fromCodePoint(...points);
const HINDI = cp(0x939, 0x93f, 0x928, 0x94d, 0x926, 0x940);
const HINDI_DISTRACTOR = `${cp(0x928, 0x926, 0x940)} ${cp(0x939, 0x935, 0x93e)} ${cp(0x928, 0x926, 0x940)}`;
const HINDI_TARGET = `${HINDI} ${cp(0x92d, 0x93e, 0x937, 0x93e)}`;
const CONTEXT_ERROR = /^contextLines must be a non-negative safe integer$/;

// Six distractors separated by five non-matching lines (1, 7, ..., 31), then the target on line 37.
// The spacing keeps default context windows from merging, so a missed target cannot be hidden by
// an accidental span merge.
function spacedHindiFixture(): string {
  const lines: string[] = [];
  for (let distractor = 0; distractor < 6; distractor += 1) {
    lines.push(HINDI_DISTRACTOR, "filler", "filler", "filler", "filler", "filler");
  }
  lines.push(HINDI_TARGET);
  return lines.join("\n");
}

function lineSpans(result: ReturnType<typeof queryArtifact>): Array<[number, number]> {
  return result.excerpts.map((excerpt) => [excerpt.sourceMap.startLine, excerpt.sourceMap.endLine]);
}

class CountingStore implements ArtifactStore {
  readonly inner = new MemoryArtifactStore();
  gets = 0;
  puts = 0;
  get(artifactId: string) {
    this.gets += 1;
    return this.inner.get(artifactId);
  }
  put(record: Parameters<ArtifactStore["put"]>[0]) {
    this.puts += 1;
    this.inner.put(record);
  }
}

describe("N-35 combining-mark query terms", () => {
  it("T35-1 keeps a Hindi query whole so a spaced target is not pushed into moreMatches", async () => {
    const { result } = await query(spacedHindiFixture(), { query: HINDI, contextLines: undefined });
    expect(lineSpans(result)).toEqual([[35, 37]]);
    expect(result).not.toHaveProperty("moreMatches");
    expect(result.fallbackReason).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("T35-2 finds the Hindi target with zero context and a single excerpt", async () => {
    const { result } = await query(spacedHindiFixture(), { query: HINDI, contextLines: 0, maxExcerpts: 1 });
    expect(lineSpans(result)).toEqual([[37, 37]]);
    expect(result).not.toHaveProperty("moreMatches");
    expect(result.fallbackReason).toBeNull();
  });

  it("T35-3 ranks Hindi targets above leading distractors and omits only the second target", async () => {
    const lines = [
      ...Array.from({ length: 6 }, () => HINDI_DISTRACTOR),
      "filler", "filler", "filler", "filler", "filler",
      HINDI_TARGET,
      "filler", "filler", "filler", "filler", "filler",
      HINDI_TARGET,
    ];
    const { result } = await query(lines.join("\n"), { query: HINDI, contextLines: undefined, maxExcerpts: 1 });
    expect(lineSpans(result)).toEqual([[10, 14]]);
    expect(result.moreMatches).toEqual({ count: 1, lines: [18] });
  });

  it("T35-4 keeps Thai and non-composing Latin marks inside the term", async () => {
    const thai = cp(0xe01, 0xe34, 0xe19);
    const thaiDistractor = cp(0xe01, 0xe32, 0xe19, 0xe32);
    const thaiResult = await query(`${thaiDistractor}\nfiller\n${thai}`, { query: thai });
    expect(lineSpans(thaiResult.result)).toEqual([[3, 3]]);
    expect(thaiResult.result).not.toHaveProperty("moreMatches");
    const latin = `q${cp(0x307)}x`;
    const latinResult = await query(`q then x\nfiller\n${latin}`, { query: latin });
    expect(lineSpans(latinResult.result)).toEqual([[3, 3]]);
    expect(latinResult.result).not.toHaveProperty("moreMatches");
  });

  it("T35-6 no longer matches unvoweled Arabic text from a query with harakat (accepted recall change D6)", async () => {
    const voweled = cp(0x643, 0x64e, 0x62a, 0x64e, 0x628, 0x64e);
    const { result } = await query(`${cp(0x643, 0x62a, 0x628)}\nfiller`, { query: voweled });
    expect(result.excerpts).toEqual([]);
    expect(result.fallbackReason).toBe("no_query_match");
    expect(result).not.toHaveProperty("moreMatches");
  });

  it("C35-1 leaves ASCII paths, identifiers, Hangul, Han and composed Latin queries unchanged", async () => {
    const hangul = cp(0xac80, 0xc0c9, 0xc5b4);
    const han = cp(0x6f22, 0x5b57);
    const content = [
      "alpha",
      "see src/core/artifacts.ts:555 for queryArtifact_v2",
      "other src/core line",
      `${cp(0xd55c, 0xad6d, 0xc5b4)} ${hangul} ${cp(0xc608, 0xc2dc)}`,
      `${han} ${cp(0xd45c, 0xae30)}`,
      `a caf${cp(0xe9)} menu`,
      "filler",
    ].join("\n");
    const cases: Array<[string, Array<[number, number]>]> = [
      ["src/core/artifacts.ts:555", [[2, 2]]],
      ["queryArtifact_v2", [[2, 2]]],
      ["src/core queryArtifact_v2", [[2, 2]]],
      [hangul, [[4, 4]]],
      [han, [[5, 5]]],
      [`caf${cp(0xe9)}`, [[6, 6]]],
      [`cafe${cp(0x301)}`, [[6, 6]]],
    ];
    for (const [text, spans] of cases) {
      const { result } = await query(content, { query: text });
      expect(lineSpans(result), text).toEqual(spans);
      expect(result, text).not.toHaveProperty("moreMatches");
      expect(result.fallbackReason, text).toBeNull();
    }
  });

  it("C35-2 keeps a stand-alone combining mark query as no_query_terms", async () => {
    const { result } = await query("alpha\nbeta", { query: cp(0x301) });
    expect(result.excerpts).toEqual([]);
    expect(result.fallbackReason).toBe("no_query_terms");
  });

  it("C35-3 does not turn an emoji variation selector into its own term", async () => {
    const selector = cp(0xfe0f);
    const content = [`ok${selector} one`, `ok${selector} two`, `ok${selector} three`, "an error line"].join("\n");
    const { result } = await query(content, { query: `${cp(0x2764)}${selector} error` });
    expect(lineSpans(result)).toEqual([[4, 4]]);
    expect(result).not.toHaveProperty("moreMatches");
  });
});

describe("N-36 direct contextLines contract", () => {
  const sevenLines = ["l1", "l2", "l3", "needle", "l5", "l6", "l7"].join("\n");

  it("T36-1 rejects non-integer, negative, non-finite, unsafe, non-number and null contextLines exactly", async () => {
    const { artifact } = await query(sevenLines);
    const store = new MemoryArtifactStore();
    store.put(artifact);
    const values = [1.5, 0.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1", true, null];
    for (const value of values) {
      expect(
        () => queryArtifact({ artifactId: artifact.artifactId, query: "needle", maxTokens: 400, contextLines: value as never, store }),
        String(value),
      ).toThrow(CONTEXT_ERROR);
    }
  });

  it("T36-2 validates contextLines before looking up the artifact", () => {
    const store = new MemoryArtifactStore();
    expect(() => queryArtifact({ artifactId: "artifact_missing", query: "needle", maxTokens: 400, contextLines: -1, store })).toThrow(CONTEXT_ERROR);
  });

  it("T36-3 does not touch the store when contextLines is invalid", async () => {
    const { artifact } = await query(sevenLines);
    const store = new CountingStore();
    store.put(artifact);
    store.gets = 0;
    store.puts = 0;
    for (const value of [-1, 1.5]) {
      expect(() => queryArtifact({ artifactId: artifact.artifactId, query: "needle", maxTokens: 400, contextLines: value, store }), String(value)).toThrow(CONTEXT_ERROR);
    }
    expect(store.gets).toBe(0);
    expect(store.puts).toBe(0);
  });

  it("C36-1 keeps omitted, zero, negative zero and large safe-integer contextLines results", async () => {
    const { artifact } = await query(sevenLines);
    const store = new MemoryArtifactStore();
    store.put(artifact);
    const base = { artifactId: artifact.artifactId, query: "needle", maxTokens: 400, store };
    expect(lineSpans(queryArtifact(base))).toEqual([[2, 6]]);
    expect(lineSpans(queryArtifact({ ...base, contextLines: undefined }))).toEqual([[2, 6]]);
    const cases: Array<[number, [number, number]]> = [
      [0, [4, 4]],
      [-0, [4, 4]],
      [10, [1, 7]],
      [11, [1, 7]],
      [1000, [1, 7]],
      [Number.MAX_SAFE_INTEGER, [1, 7]],
    ];
    for (const [contextLines, span] of cases) {
      expect(lineSpans(queryArtifact({ ...base, contextLines })), String(contextLines)).toEqual([span]);
    }
  });

  it("C36-3 keeps the maxExcerpts error ahead of the contextLines error", () => {
    const store = new MemoryArtifactStore();
    expect(() => queryArtifact({ artifactId: "artifact_missing", query: "needle", maxTokens: 400, maxExcerpts: 0, contextLines: -1, store })).toThrow(/^maxExcerpts must be an integer from 1 to 20$/);
  });

  // T36-4 (bounded MemoryArtifactStore LRU order) depends on S-10 (#113), which is not on this
  // branch base. It is written and run only after S-10 is merged into main.
});
