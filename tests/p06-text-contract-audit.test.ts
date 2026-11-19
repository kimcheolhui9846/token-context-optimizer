import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  indexArtifact,
  MemoryArtifactStore,
  queryArtifact,
  summarizeArtifact,
} from "../src/core/artifacts.js";
import { classifyContext } from "../src/core/policy.js";
import { estimateContext } from "../src/core/token-estimator.js";
import { CropMcpClient, type RpcResponse } from "./helpers/crop-mcp-client.js";

let root = "";
let sequence = 0;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "tco-p06-contract-"));
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function fixture(name: string, content: string | Buffer): Promise<string> {
  const path = join(root, `${sequence++}-${name}`);
  await writeFile(path, content);
  return path;
}

function expectedIdentity(canonicalPath: string, bytes: Buffer): { artifactId: string; sha256: string } {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const identityHash = createHash("sha256")
    .update(`${canonicalPath}\0${sha256}`, "utf8")
    .digest("hex");
  return { artifactId: `artifact_${identityHash.slice(0, 16)}`, sha256 };
}

function expectOriginalBytes(source: Buffer, startByte: number, endByte: number, text: string): void {
  expect(source.subarray(startByte, endByte).toString("utf8")).toBe(text);
}

function resultOf(response: RpcResponse): any {
  if (response.error) throw new Error(`MCP error: ${JSON.stringify(response.error)}`);
  return response.result;
}

function structuredResult(response: RpcResponse): any {
  const result = resultOf(response);
  const text = result.content?.[0]?.text;
  return { structuredContent: result.structuredContent, text: text === undefined ? undefined : JSON.parse(text) };
}

describe("P06 T1 artifact identity and original-byte contracts", () => {
  it("T1-1 returns the independently computed identity for absolute and relative reindexing", async () => {
    const bytes = Buffer.from("same harmless notes\n", "utf8");
    const path = await fixture("stable.txt", bytes);
    const store = new MemoryArtifactStore();
    const canonicalPath = await realpath(path);
    const expected = expectedIdentity(canonicalPath, bytes);

    const absolute = await indexArtifact({ path, store, allowedRoots: [root] });
    const relativePath = relative(process.cwd(), path);
    const relativeRecord = await indexArtifact({ path: relativePath, store, allowedRoots: [root] });

    expect(absolute.artifactId).toBe(expected.artifactId);
    expect(absolute.sha256).toBe(expected.sha256);
    expect(absolute.byteLength).toBe(bytes.byteLength);
    expect(relativeRecord.artifactId).toBe(expected.artifactId);
    expect(relativeRecord.sha256).toBe(expected.sha256);
    expect(relativeRecord.path).toBe(canonicalPath);
  });

  it("T1-2 gives a new identity when bytes change and keeps same-content paths distinct", async () => {
    const firstBytes = Buffer.from("before", "utf8");
    const firstPath = await fixture("first.txt", firstBytes);
    const secondPath = await fixture("second.txt", firstBytes);
    const store = new MemoryArtifactStore();
    const first = await indexArtifact({ path: firstPath, store, allowedRoots: [root] });
    const second = await indexArtifact({ path: secondPath, store, allowedRoots: [root] });

    expect(first.sha256).toBe(second.sha256);
    expect(first.artifactId).not.toBe(second.artifactId);
    expect(first.artifactId).toBe(expectedIdentity(await realpath(firstPath), firstBytes).artifactId);
    expect(second.artifactId).toBe(expectedIdentity(await realpath(secondPath), firstBytes).artifactId);

    const changedBytes = Buffer.from("after", "utf8");
    await writeFile(firstPath, changedBytes);
    const changed = await indexArtifact({ path: firstPath, store, allowedRoots: [root] });
    expect(changed.sha256).toBe(expectedIdentity(await realpath(firstPath), changedBytes).sha256);
    expect(changed.artifactId).toBe(expectedIdentity(await realpath(firstPath), changedBytes).artifactId);
    expect(changed.artifactId).not.toBe(first.artifactId);
  });
});

describe("P06 T2 source maps and summary line boundaries", () => {
  it.each([
    ["CRLF", "\r\n"],
    ["lone CR", "\r"],
  ])("T2-1 preserves %s source bytes while summaries render selected lines with LF", async (_label, delimiter) => {
    const lines = [
      "Calm notes describe a quiet morning meeting.",
      "The group records ordinary plans beside the garden.",
    ];
    const content = lines.join(delimiter);
    const path = await fixture("line-boundary.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    const source = await readFile(path);
    const firstBytes = Buffer.byteLength(lines[0], "utf8");
    const secondStart = firstBytes + Buffer.byteLength(delimiter, "utf8");

    expect(artifact.sourceMap.map((line) => [line.line, line.startByte, line.endByte, line.delimiter])).toEqual([
      [1, 0, firstBytes, delimiter],
      [2, secondStart, source.byteLength, ""],
    ]);
    expectOriginalBytes(source, artifact.sourceMap[0].startByte, artifact.sourceMap[0].endByte, lines[0]);
    expectOriginalBytes(source, artifact.sourceMap[1].startByte, artifact.sourceMap[1].endByte, lines[1]);

    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 200, store });
    expect(summary.summary).toBe(lines.join("\n"));
    expect(summary.sourceMap).toMatchObject({ path: artifact.path, startLine: 1, endLine: 2 });
    expect(summary.warnings).toEqual([]);
    expect(summary.fallbackReason).toBeNull();
  });

  it.each([
    ["CRLF", "\r\n"],
    ["lone CR", "\r"],
  ])("T2-2 excludes whitespace-only %s tail lines without summary_truncated", async (_label, delimiter) => {
    const first = "Calm notes fill a blue plan.";
    const content = [first, " ", "\t"].join(delimiter);
    const path = await fixture("whitespace-tail.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });

    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 7, store });
    expect(summary.summary).toBe(first);
    expect(summary.sourceMap).toMatchObject({ startLine: 1, endLine: 1 });
    expect(summary.warnings).toEqual([]);
    expect(summary.fallbackReason).toBeNull();
  });

  it.each([
    ["CRLF", "\r\n"],
    ["lone CR", "\r"],
  ])("T2-3 marks a meaningful %s tail as summary_truncated after omitted whitespace", async (_label, delimiter) => {
    const first = "Calm notes fill a blue plan.";
    const content = [first, " ", "\t", "Later notes describe another ordinary observation."].join(delimiter);
    const path = await fixture("meaningful-tail.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });

    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 7, store });
    expect(summary.summary).toBe(first);
    expect(summary.sourceMap).toMatchObject({ startLine: 1, endLine: 1 });
    expect(summary.warnings).toEqual(["summary_truncated"]);
    expect(summary.fallbackReason).toBeNull();
  });

  it("T2-4 reports a complete Unicode query span against literal original Buffer offsets", async () => {
    const delimiter = "\r";
    const lines = ["앞🙂", "e\u0301", "終"];
    const content = lines.join(delimiter);
    const path = await fixture("unicode-source-map.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    const source = await readFile(path);
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "終",
      maxTokens: 20,
      contextLines: 0,
      store,
    });
    const excerpt = result.excerpts[0];

    expect(artifact.sourceMap.map((line) => [line.line, line.startByte, line.endByte, line.text, line.delimiter])).toEqual([
      [1, 0, Buffer.byteLength(lines[0], "utf8"), lines[0], delimiter],
      [2, Buffer.byteLength(`${lines[0]}${delimiter}`, "utf8"), Buffer.byteLength(`${lines[0]}${delimiter}${lines[1]}`, "utf8"), lines[1], delimiter],
      [3, Buffer.byteLength(`${lines[0]}${delimiter}${lines[1]}${delimiter}`, "utf8"), source.byteLength, lines[2], ""],
    ]);
    expect(excerpt.text).toBe(lines[2]);
    expect(excerpt.sourceMap).toMatchObject({ startLine: 3, endLine: 3, completeSpan: true });
    expectOriginalBytes(source, excerpt.sourceMap.startByte, excerpt.sourceMap.endByte, lines[2]);
    expect(result.warnings).toEqual([]);
    expect(result.fallbackReason).toBeNull();
  });
});

describe("P06 T3 normalized Unicode query tracking", () => {
  it("T3-1 returns original text and bytes when NFKC changes query length", async () => {
    const content = "A Ｆｏｏ entry has cafe\u0301 detail.";
    const path = await fixture("nfkc-query.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    const source = await readFile(path);
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "foo café",
      maxTokens: 50,
      contextLines: 0,
      store,
    });
    const excerpt = result.excerpts[0];

    expect(result.excerpts).toHaveLength(1);
    expect(excerpt.text).toBe(content);
    expect(excerpt.sourceMap.startLine).toBe(1);
    expectOriginalBytes(source, excerpt.sourceMap.startByte, excerpt.sourceMap.endByte, content);
    expect(result.fallbackReason).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});

describe("P06 T4 budget metadata and normal entry points", () => {
  it("T4-1 keeps warnings empty and fallbackReason null on direct partial success", async () => {
    const content = "needle first\nfiller\nneedle second";
    const path = await fixture("partial-query.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "needle",
      maxTokens: 3,
      contextLines: 0,
      maxExcerpts: 1,
      store,
    });

    expect(result.excerpts.map((excerpt) => excerpt.text)).toEqual(["needle first"]);
    expect(result.estimatedTokens).toBe(3);
    expect(result.moreMatches).toEqual({ count: 1, lines: [3] });
    expect(result.warnings).toEqual([]);
    expect(result.fallbackReason).toBeNull();
  });

  it("T4-2 observes the same partial-success contract through built STDIO MCP", async () => {
    const path = await fixture("partial-mcp.txt", "needle first\nfiller\nneedle second");
    const client = await CropMcpClient.start(undefined, root);
    try {
      const indexed = structuredResult(await client.call("index_artifact", { path }));
      const output = structuredResult(await client.call("query_artifact", {
        artifactId: indexed.structuredContent.artifactId,
        query: "needle",
        maxTokens: 3,
        contextLines: 0,
        maxExcerpts: 1,
      }));

      expect(output.structuredContent).toMatchObject({
        warnings: [],
        fallbackReason: null,
        moreMatches: { count: 1, lines: [3] },
      });
      expect(output.structuredContent.excerpts).toHaveLength(1);
      expect(output.structuredContent.excerpts[0].text).toBe("needle first");
      expect(output.text).toStrictEqual(output.structuredContent);
    } finally {
      await client.close();
    }
  });
});

describe("P06 T5 policy classification and allowed summary", () => {
  it("T5-1 treats a harmless ordinary note as semantic and keeps its summary source-backed", async () => {
    const content = "The quiet garden group records ordinary plans for a calm morning meeting.";
    const classification = classifyContext(content);
    const path = await fixture("ordinary-note.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 200, store });

    expect(classification).toStrictEqual({ mode: "semantic", reasons: ["natural_language"], warnings: [] });
    expect(summary.summary).toBe(content);
    expect(summary.sourceMap).toMatchObject({ path: artifact.path, startLine: 1, endLine: 1 });
    expect(summary.warnings).toEqual([]);
    expect(summary.fallbackReason).toBeNull();
  });

  it("T5-2 exposes the same harmless semantic policy through built STDIO MCP", async () => {
    const content = "The quiet garden group records ordinary plans for a calm morning meeting.";
    const path = await fixture("ordinary-mcp.txt", content);
    const client = await CropMcpClient.start(undefined, root);
    try {
      const classified = structuredResult(await client.call("classify_context", { text: content }));
      const indexed = structuredResult(await client.call("index_artifact", { path }));
      const summarized = structuredResult(await client.call("summarize_artifact", {
        artifactId: indexed.structuredContent.artifactId,
        maxTokens: 200,
      }));

      expect(classified.structuredContent).toStrictEqual({
        mode: "semantic",
        reasons: ["natural_language"],
        warnings: [],
      });
      expect(summarized.structuredContent.summary).toBe(content);
      expect(summarized.structuredContent.fallbackReason).toBeNull();
      expect(summarized.structuredContent.warnings).toEqual([]);
      expect(summarized.text).toStrictEqual(summarized.structuredContent);
    } finally {
      await client.close();
    }
  });
});

describe("P06 T6 estimate and budget metadata", () => {
  it("T6-1 matches literal heuristic-v1 expectations for empty, whitespace and short Unicode inputs", () => {
    const warning = ["heuristic_estimate_not_billing_usage"];
    expect(estimateContext({ text: "" })).toStrictEqual({
      estimatedTokens: 0,
      maxTokens: null,
      fitsBudget: true,
      profileVersion: "heuristic-v1",
      confidence: "low",
      warnings: warning,
    });
    expect(estimateContext({ text: "  " })).toMatchObject({ estimatedTokens: 1, maxTokens: null, fitsBudget: true });
    expect(estimateContext({ text: "가🙂" })).toMatchObject({ estimatedTokens: 2, maxTokens: null, fitsBudget: true });
    expect(estimateContext({ text: "a", maxTokens: 0 })).toMatchObject({ estimatedTokens: 1, maxTokens: 0, fitsBudget: false });
    expect(estimateContext({ text: "a", maxTokens: null })).toMatchObject({ estimatedTokens: 1, maxTokens: null, fitsBudget: true });
  });

  it("T6-2 keeps estimate omission/null semantics and rejects zero at built STDIO MCP schema", async () => {
    const client = await CropMcpClient.start(undefined, root);
    try {
      const omitted = structuredResult(await client.call("estimate_context", { text: "가🙂" }));
      const rejected = await client.call("estimate_context", { text: "a", maxTokens: 0 });

      expect(omitted.structuredContent).toStrictEqual({
        estimatedTokens: 2,
        maxTokens: null,
        fitsBudget: true,
        profileVersion: "heuristic-v1",
        confidence: "low",
        warnings: ["heuristic_estimate_not_billing_usage"],
      });
      expect(omitted.text).toStrictEqual(omitted.structuredContent);
      expect(rejected.error ?? rejected.result?.isError).toBeTruthy();
    } finally {
      await client.close();
    }
  });
});
