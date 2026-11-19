// S-10 (WBS 6.4b-5): the module-level defaultArtifactStore uses the 256 MiB estimate budget.
// Kept in its own file because vitest isolates modules per file, so this file owns a fresh
// defaultArtifactStore. Only the public get/put contract and the default (store-less)
// indexArtifact/queryArtifact/summarizeArtifact paths are observed.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  defaultArtifactStore,
  indexArtifact,
  queryArtifact,
  summarizeArtifact,
} from "../src/core/artifacts.js";
import type { ArtifactRecord } from "../src/core/types.js";

const F = 32768;
const MiB = 1024 * 1024;

function rec(id: string, weight: number): ArtifactRecord {
  return {
    artifactId: id,
    path: `/synthetic/${id}`,
    sha256: "0".repeat(64),
    byteLength: (weight - F) / 2,
    lineCount: 0,
    content: "",
    sourceMap: [],
  };
}

let dir: string | undefined;
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("S-10 defaultArtifactStore bound (RED on BASE)", () => {
  it("R15 evicts from the default store above 256 MiB, fails with the existing error and recovers by reindexing", async () => {
    defaultArtifactStore.put(rec("A", 128 * MiB));
    defaultArtifactStore.put(rec("B", 128 * MiB - F));

    dir = await mkdtemp(join(tmpdir(), "tco-store-default-"));
    const path = join(dir, "notes.txt");
    await writeFile(path, "first needle line\nsecond prose line\n", "utf8");
    // Store-less indexing goes to defaultArtifactStore; its estimate is above F, so A goes.
    const x = await indexArtifact({ path, allowedRoots: [dir] });
    expect(queryArtifact({ artifactId: x.artifactId, query: "needle", maxTokens: 200 }).excerpts).toHaveLength(1);

    // A record whose estimate equals the whole budget leaves only itself (B, then X evicted).
    defaultArtifactStore.put(rec("D", 256 * MiB));
    expect(() => queryArtifact({ artifactId: x.artifactId, query: "needle", maxTokens: 200 })).toThrow(
      new Error(`Artifact not indexed: ${x.artifactId}`),
    );
    expect(() => summarizeArtifact({ artifactId: x.artifactId, maxTokens: 200 })).toThrow(
      new Error(`Artifact not indexed: ${x.artifactId}`),
    );

    const again = await indexArtifact({ path, allowedRoots: [dir] });
    expect(again.artifactId).toBe(x.artifactId);
    expect(summarizeArtifact({ artifactId: x.artifactId, maxTokens: 200 }).artifactId).toBe(x.artifactId);
    expect(queryArtifact({ artifactId: x.artifactId, query: "needle", maxTokens: 200 }).excerpts[0].text).toContain("first needle line");
    expect({
      A: defaultArtifactStore.get("A") !== undefined,
      B: defaultArtifactStore.get("B") !== undefined,
      D: defaultArtifactStore.get("D") !== undefined,
      X: defaultArtifactStore.get(x.artifactId) === again,
    }).toEqual({ A: false, B: false, D: false, X: true });
  });
});
