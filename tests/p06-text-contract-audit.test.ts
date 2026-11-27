import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
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
let relativeRoot = "";
let sequence = 0;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "tco-p06-contract-"));
  const relativeRootParent = join(process.cwd(), ".artifacts");
  await mkdir(relativeRootParent, { recursive: true });
  relativeRoot = await mkdtemp(join(relativeRootParent, "p06-rel-"));
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  const relativeRootParent = join(process.cwd(), ".artifacts");
  if (
    relativeRoot &&
    relativeRoot.startsWith(`${relativeRootParent}${sep}`)
  ) {
    await rm(relativeRoot, { recursive: true, force: true });
  }
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
    const path = join(relativeRoot, "stable.txt");
    await writeFile(path, bytes);
    const store = new MemoryArtifactStore();
    const canonicalPath = await realpath(path);
    const expected = expectedIdentity(canonicalPath, bytes);

    const absolute = await indexArtifact({ path, store, allowedRoots: [relativeRoot] });
    const relativePath = relative(process.cwd(), path);
    expect(isAbsolute(relativePath)).toBe(false);
    expect(relativePath.startsWith("..")).toBe(false);
    const relativeRecord = await indexArtifact({ path: relativePath, store, allowedRoots: [relativeRoot] });

    const currentRootRecord = await indexArtifact({ path: relativePath, store });
    expect(currentRootRecord.artifactId).toBe(expected.artifactId);
    expect(absolute.artifactId).toBe(expected.artifactId);
    expect(absolute.sha256).toBe(expected.sha256);
    expect(absolute.byteLength).toBe(bytes.byteLength);
    expect(relativeRecord.artifactId).toBe(expected.artifactId);
    expect(relativeRecord.sha256).toBe(expected.sha256);
    expect(relativeRecord.path).toBe(canonicalPath);
  });

  it.skipIf(process.platform !== "win32")("T1-3 observes Windows case-only path normalization", async (context) => {
    const bytes = Buffer.from("same harmless case fixture", "utf8");
    const originalPath = join(relativeRoot, "CaseOnly.txt");
    const alternatePath = join(relativeRoot, "caseonly.txt");
    await writeFile(originalPath, bytes);
    try {
      await realpath(alternatePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return context.skip("This Windows directory distinguishes filename case");
    }
    const store = new MemoryArtifactStore();

    const original = await indexArtifact({ path: originalPath, store, allowedRoots: [relativeRoot] });
    const alternate = await indexArtifact({ path: alternatePath, store, allowedRoots: [relativeRoot] });

    expect(alternate.sha256).toBe(original.sha256);
    expect(alternate.artifactId).toBe(original.artifactId);
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

  it("T1-4 cites indexed text snapshots across same-path edits and clears them on STDIO restart", async () => {
    const firstLine = "Intake complete.";
    const oldQuote = "Bluebird shipped.";
    const newQuote = "Bluebird pending.";
    const path = await fixture("snapshot.txt", Buffer.from(`${firstLine}\n${oldQuote}\nEnd.\n`, "utf8"));
    const canonicalPath = await realpath(path);
    const originalBytes = await readFile(canonicalPath);
    const originalSha = expectedIdentity(canonicalPath, originalBytes).sha256;
    const queryArgs = { query: "Bluebird", maxTokens: 200, contextLines: 0 };

    async function expectQuery(
      client: CropMcpClient,
      artifactId: string,
      bytes: Buffer,
      quote: string,
      line = 2,
      startByte = 17,
    ) {
      const { structuredContent: result } = structuredResult(await client.call("query_artifact", {
        ...queryArgs,
        artifactId,
      }));
      expect(result).toMatchObject({
        artifactId,
        sha256: expectedIdentity(canonicalPath, bytes).sha256,
        fallbackReason: null,
        warnings: [],
      });
      expect(result.excerpts).toHaveLength(1);
      const [excerpt] = result.excerpts;
      expect(excerpt).toMatchObject({
        text: quote,
        sourceMap: {
          path: canonicalPath,
          startLine: line,
          endLine: line,
          startByte,
          endByte: startByte + Buffer.byteLength(quote, "utf8"),
          completeSpan: true,
        },
      });
      expectOriginalBytes(bytes, excerpt.sourceMap.startByte, excerpt.sourceMap.endByte, excerpt.text);
    }

    let oldId: string;
    let newId: string;
    let currentBytes: Buffer;
    const client = await CropMcpClient.start(undefined, root);
    try {
      const { structuredContent: before } = structuredResult(await client.call("index_artifact", {
        path: canonicalPath,
      }));
      expect(before).toMatchObject({ path: canonicalPath, sha256: originalSha });
      oldId = before.artifactId;

      await writeFile(canonicalPath, Buffer.from(`${firstLine}\n${newQuote}\nEnd.\n`, "utf8"));
      currentBytes = await readFile(canonicalPath);
      const currentSha = expectedIdentity(canonicalPath, currentBytes).sha256;
      expect(currentSha).not.toBe(originalSha);

      await expectQuery(client, oldId, originalBytes, oldQuote);
      const { structuredContent: summary } = structuredResult(await client.call("summarize_artifact", {
        artifactId: oldId,
        maxTokens: 200,
      }));
      expect(summary).toMatchObject({
        artifactId: oldId,
        sha256: originalSha,
        summary: "",
        sourceMap: null,
        fallbackReason: "unknown_content_requires_source",
      });

      const { structuredContent: after } = structuredResult(await client.call("index_artifact", {
        path: canonicalPath,
      }));
      expect(after).toMatchObject({ path: canonicalPath, sha256: currentSha });
      newId = after.artifactId;
      expect(newId).not.toBe(oldId);
      await expectQuery(client, newId, currentBytes, newQuote);
    } finally {
      await client.close();
    }

    const restarted = await CropMcpClient.start(undefined, root);
    try {
      for (const artifactId of [oldId, newId]) {
        for (const [tool, args] of [
          ["query_artifact", queryArgs],
          ["summarize_artifact", { maxTokens: 200 }],
        ] as const) {
          const response = resultOf(await restarted.call(tool, { ...args, artifactId }));
          expect(response.isError).toBe(true);
          expect(response.content[0].text).toContain(`Artifact not indexed: ${artifactId}`);
        }
      }

      const reopenedBytes = await readFile(canonicalPath);
      expect(reopenedBytes).toEqual(currentBytes);
      const { structuredContent: recovered } = structuredResult(await restarted.call("index_artifact", {
        path: canonicalPath,
      }));
      expect(recovered).toMatchObject({
        path: canonicalPath,
        sha256: expectedIdentity(canonicalPath, reopenedBytes).sha256,
      });
      await expectQuery(restarted, recovered.artifactId, reopenedBytes, newQuote);

      await writeFile(canonicalPath, Buffer.concat([Buffer.from("새 메모.\n", "utf8"), reopenedBytes]));
      const prefixedBytes = await readFile(canonicalPath);
      const prefixedSha = expectedIdentity(canonicalPath, prefixedBytes).sha256;
      expect(prefixedSha).not.toBe(recovered.sha256);
      const { structuredContent: prefixed } = structuredResult(await restarted.call("index_artifact", {
        path: canonicalPath,
      }));
      expect(prefixed).toMatchObject({ path: canonicalPath, sha256: prefixedSha });
      expect(prefixed.artifactId).not.toBe(recovered.artifactId);
      await expectQuery(restarted, recovered.artifactId, reopenedBytes, newQuote, 2, 17);
      await expectQuery(restarted, prefixed.artifactId, prefixedBytes, newQuote, 3, 29);

      await rm(canonicalPath);
      await expect(readFile(canonicalPath)).rejects.toMatchObject({ code: "ENOENT" });
      const unreadable = resultOf(await restarted.call("index_artifact", { path: canonicalPath }));
      expect(unreadable.isError).toBe(true);
      expect(unreadable.content[0].text).toContain("File cannot be read");
      await expectQuery(restarted, prefixed.artifactId, prefixedBytes, newQuote, 3, 29);
    } finally {
      await restarted.close();
    }
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
  const lines = [
    "Plain intro line.",
    "A Ｆｏｏ entry here.",
    "It has cafe\u0301 detail.",
    "Unrelated closing words.",
  ];

  it("T3-1 matches an NFKC compatibility-only term and returns its original byte span", async () => {
    const content = lines.join("\n");
    const path = await fixture("nfkc-query.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    const source = await readFile(path);
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "foo",
      maxTokens: 20,
      contextLines: 0,
      store,
    });
    const excerpt = result.excerpts[0];

    expect(result.excerpts).toHaveLength(1);
    expect(excerpt.text).toBe(lines[1]);
    expect(excerpt.sourceMap.startLine).toBe(2);
    expect(excerpt.sourceMap.endLine).toBe(2);
    const secondStart = Buffer.byteLength(`${lines[0]}\n`, "utf8");
    expect(excerpt.sourceMap.startByte).toBe(secondStart);
    expect(excerpt.sourceMap.endByte).toBe(secondStart + Buffer.byteLength(lines[1], "utf8"));
    expectOriginalBytes(source, excerpt.sourceMap.startByte, excerpt.sourceMap.endByte, lines[1]);
    expect(result.fallbackReason).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("T3-2 matches a combining-accent term and returns its original byte span", async () => {
    const content = lines.join("\n");
    const path = await fixture("accent-query.txt", content);
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    const source = await readFile(path);
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "café",
      maxTokens: 20,
      contextLines: 0,
      store,
    });
    const excerpt = result.excerpts[0];

    expect(result.excerpts).toHaveLength(1);
    expect(excerpt.text).toBe(lines[2]);
    expect(excerpt.sourceMap.startLine).toBe(3);
    expect(excerpt.sourceMap.endLine).toBe(3);
    const thirdStart = Buffer.byteLength(`${lines[0]}\n${lines[1]}\n`, "utf8");
    expect(excerpt.sourceMap.startByte).toBe(thirdStart);
    expect(excerpt.sourceMap.endByte).toBe(thirdStart + Buffer.byteLength(lines[2], "utf8"));
    expectOriginalBytes(source, excerpt.sourceMap.startByte, excerpt.sourceMap.endByte, lines[2]);
    expect(result.fallbackReason).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("T3-3 distinguishes absent and empty queries at a nonzero budget", async () => {
    const path = await fixture("query-controls.txt", lines.join("\n"));
    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path, store, allowedRoots: [root] });

    const absent = queryArtifact({
      artifactId: artifact.artifactId,
      query: "absent",
      maxTokens: 20,
      contextLines: 0,
      store,
    });
    const empty = queryArtifact({
      artifactId: artifact.artifactId,
      query: "",
      maxTokens: 20,
      contextLines: 0,
      store,
    });

    expect(absent.excerpts).toEqual([]);
    expect(absent.fallbackReason).toBe("no_query_match");
    expect(absent.warnings).toEqual(["query_terms_not_found"]);
    expect(empty.excerpts).toEqual([]);
    expect(empty.fallbackReason).toBe("no_query_terms");
    expect(empty.warnings).toEqual(["query_has_no_searchable_terms"]);
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
        estimatedTokens: 3,
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

  it("T4-3 compares both tool budget limits with the direct API on ordinary text", async () => {
    const content = "The quiet garden group records ordinary plans for a calm morning meeting.";
    const path = await fixture("budget-limits.txt", content);
    const store = new MemoryArtifactStore();
    const { artifactId } = await indexArtifact({ path, store, allowedRoots: [root] });
    const direct = { artifactId, maxTokens: 2001, store };
    expect(queryArtifact({ ...direct, query: "garden" }).excerpts[0].text).toBe(content);
    expect(summarizeArtifact(direct).summary).toBe(content);

    const client = await CropMcpClient.start(undefined, root);
    try {
      const indexed = structuredResult(await client.call("index_artifact", { path }));
      for (const name of ["query_artifact", "summarize_artifact"]) {
        const args = { artifactId: indexed.structuredContent.artifactId, ...(name === "query_artifact" ? { query: "garden" } : {}) };
        for (const maxTokens of [1, 2000]) {
          const output = structuredResult(await client.call(name, { ...args, maxTokens }));
          expect(output.structuredContent.artifactId).toBe(args.artifactId);
          expect(output.structuredContent.estimatedTokens).toBeLessThanOrEqual(maxTokens);
        }
        for (const maxTokens of [0, 2001]) {
          const response = await client.call(name, { ...args, maxTokens });
          expect(response.error ?? response.result?.isError).toBeTruthy();
        }
      }
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

  it("T5-2 keeps an allowed semantic summary tied to indexed bytes after a same-path edit", async () => {
    const content = "The quiet garden group records ordinary plans for a calm morning meeting.";
    const path = await fixture("ordinary-mcp.txt", Buffer.from(content + "\n", "utf8"));
    const canonicalPath = await realpath(path);
    const originalSha = expectedIdentity(canonicalPath, await readFile(canonicalPath)).sha256;
    const client = await CropMcpClient.start(undefined, root);
    try {
      const classified = structuredResult(await client.call("classify_context", { text: content }));
      const indexed = structuredResult(await client.call("index_artifact", { path: canonicalPath }));
      await writeFile(canonicalPath, Buffer.from(content.replace("morning", "afternoon") + "\n", "utf8"));
      const editedSha = expectedIdentity(canonicalPath, await readFile(canonicalPath)).sha256;
      expect(editedSha).not.toBe(originalSha);
      const summarized = structuredResult(await client.call("summarize_artifact", {
        artifactId: indexed.structuredContent.artifactId,
        maxTokens: 200,
      }));

      expect(classified.structuredContent).toStrictEqual({
        mode: "semantic",
        reasons: ["natural_language"],
        warnings: [],
      });
      expect(indexed.structuredContent.sha256).toBe(originalSha);
      expect(summarized.structuredContent).toMatchObject({
        artifactId: indexed.structuredContent.artifactId,
        sha256: originalSha,
        summary: content,
        sourceMap: { path: canonicalPath, startLine: 1, endLine: 1 },
        fallbackReason: null,
        warnings: [],
      });
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
      const nullValue = await client.call("estimate_context", {
        text: "a",
        maxTokens: null,
      });
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
      expect(nullValue.error ?? nullValue.result?.isError).toBeTruthy();
      expect(rejected.error ?? rejected.result?.isError).toBeTruthy();
    } finally {
      await client.close();
    }
  });
});
