import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryArtifactStore, indexArtifact, queryArtifact } from "../src/core/artifacts.js";
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
