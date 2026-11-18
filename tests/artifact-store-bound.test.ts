// S-10 (WBS 6.4b-5): estimated-bytes soft bound for the text artifact store.
// Every case observes the store only through the public get/put contract (plus
// indexArtifact/queryArtifact/summarizeArtifact). Observation get() calls come after the
// last put of a case, because a get hit promotes the entry (it is part of the contract).
// IDs C*/R* follow codex_paste_2026-11-12_s10-analysis.md section 3 (as corrected).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MemoryArtifactStore,
  indexArtifact,
  queryArtifact,
  summarizeArtifact,
} from "../src/core/artifacts.js";
import type { ArtifactRecord } from "../src/core/types.js";

const F = 32768;
const MiB = 1024 * 1024;

// Approved estimate: 2 * byteLength + 160 * lineCount + 32768 bytes.
function weightOf(record: Pick<ArtifactRecord, "byteLength" | "lineCount">): number {
  return 2 * record.byteLength + 160 * record.lineCount + F;
}

// Synthetic record whose approved estimate is exactly `weight` (weight - F must be even).
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

function bounded(maxEstimatedBytes: number): MemoryArtifactStore {
  // The options parameter is new in S-10; the cast keeps this file loadable on BASE.
  const Ctor = MemoryArtifactStore as unknown as new (options?: unknown) => MemoryArtifactStore;
  return new Ctor({ maxEstimatedBytes });
}

function construct(...args: unknown[]): MemoryArtifactStore {
  const Ctor = MemoryArtifactStore as unknown as new (...a: unknown[]) => MemoryArtifactStore;
  return new Ctor(...args);
}

function hits(store: MemoryArtifactStore, ids: string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, store.get(id) !== undefined]));
}

const dirs = new Set<string>();
afterEach(async () => {
  await Promise.all([...dirs].map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.clear();
});

async function fixtureDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tco-store-bound-"));
  dirs.add(dir);
  return dir;
}

async function writeFixture(dir: string, name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content, "utf8");
  return path;
}

describe("S-10 controls (pass on BASE too)", () => {
  it("C1 keeps the zero-argument constructor and returns the stored object", () => {
    const store = new MemoryArtifactStore();
    const a = rec("A", F);
    store.put(a);
    expect(store.get("A")).toBe(a);
  });

  it("C2 returns undefined from an empty store", () => {
    expect(new MemoryArtifactStore().get("x")).toBeUndefined();
  });

  it("C3 does not re-enter overridable get/put while promoting or evicting", () => {
    const calls = { put: 0, get: 0 };
    class CountingStore extends MemoryArtifactStore {
      override put(record: ArtifactRecord): void {
        calls.put += 1;
        super.put(record);
      }
      override get(artifactId: string): ArtifactRecord | undefined {
        calls.get += 1;
        return super.get(artifactId);
      }
    }
    const Ctor = CountingStore as unknown as new (options?: unknown) => CountingStore;
    const store = new Ctor({ maxEstimatedBytes: 2 * F });
    const a = rec("A", F);
    store.put(a);
    store.put(rec("B", F));
    expect(store.get("A")).toBe(a);
    store.put(rec("C", F));
    store.put(rec("D", 10 * F));
    store.get("none");
    expect(calls).toEqual({ put: 4, get: 2 });
  });

  it("R6 lighter same-ID replacement is not double counted", () => {
    const store = bounded(3 * F);
    store.put(rec("A", 2 * F));
    store.put(rec("B", F));
    const a2 = rec("A", F);
    store.put(a2);
    store.put(rec("C", F));
    expect(hits(store, ["A", "B", "C"])).toEqual({ A: true, B: true, C: true });
    expect(store.get("A")).toBe(a2);
  });

  it("R8 keeps records whose estimates sum exactly to the default 256 MiB budget", () => {
    const store = new MemoryArtifactStore();
    store.put(rec("A", 128 * MiB));
    store.put(rec("B", 128 * MiB - F));
    store.put(rec("C", F));
    expect(hits(store, ["A", "B", "C"])).toEqual({ A: true, B: true, C: true });
  });

  it("R11 keeps an oversized record put into an empty store", () => {
    const store = bounded(2 * F);
    const big = rec("BIG", 10 * F);
    store.put(big);
    expect(store.get("BIG")).toBe(big);
  });

  it("R18 accepts the default forms, 1 and MAX_SAFE_INTEGER", () => {
    const accepted = [
      construct(),
      construct(undefined),
      construct({}),
      construct({ maxEstimatedBytes: undefined }),
      construct({ maxEstimatedBytes: 1 }),
      construct({ maxEstimatedBytes: Number.MAX_SAFE_INTEGER }),
    ];
    for (const store of accepted) {
      const a = rec("A", F);
      store.put(a);
      expect(store.get("A")).toBe(a);
    }
  });

  it("R20a keeps two real indexed records when the bound equals their estimate sum", async () => {
    const dir = await fixtureDir();
    const first = await writeFixture(dir, "first.txt", "alpha needle\nsecond line\r\nthird\n");
    const second = await writeFixture(dir, "second.txt", "beta needle\n\nlast line without newline");
    const probe = new MemoryArtifactStore();
    const r1 = await indexArtifact({ path: first, store: probe, allowedRoots: [dir] });
    const r2 = await indexArtifact({ path: second, store: probe, allowedRoots: [dir] });
    const store = bounded(weightOf(r1) + weightOf(r2));
    await indexArtifact({ path: first, store, allowedRoots: [dir] });
    await indexArtifact({ path: second, store, allowedRoots: [dir] });
    expect(hits(store, [r1.artifactId, r2.artifactId])).toEqual({ [r1.artifactId]: true, [r2.artifactId]: true });
  });
});

describe("S-10 bound policy (RED on BASE)", () => {
  it("R1 evicts the oldest record once the estimate exceeds the bound", () => {
    const store = bounded(3 * F);
    for (const id of ["A", "B", "C", "D"]) store.put(rec(id, F));
    expect(hits(store, ["A", "B", "C", "D"])).toEqual({ A: false, B: true, C: true, D: true });
  });

  it("R2 promotes a record on a get hit", () => {
    const store = bounded(2 * F);
    store.put(rec("A", F));
    store.put(rec("B", F));
    store.get("A");
    store.put(rec("C", F));
    expect(hits(store, ["A", "B", "C"])).toEqual({ A: true, B: false, C: true });
  });

  it("R3 leaves the order unchanged on a get miss", () => {
    const store = bounded(2 * F);
    store.put(rec("A", F));
    store.put(rec("B", F));
    expect(store.get("none")).toBeUndefined();
    store.put(rec("C", F));
    expect(hits(store, ["A", "B", "C"])).toEqual({ A: false, B: true, C: true });
  });

  it("R4 promotes a record re-put under the same ID", () => {
    const store = bounded(3 * F);
    for (const id of ["A", "B", "C"]) store.put(rec(id, F));
    store.put(rec("A", F));
    store.put(rec("D", F));
    expect(hits(store, ["A", "B", "C", "D"])).toEqual({ A: true, B: false, C: true, D: true });
  });

  it("R5 a heavier same-ID replacement evicts only the next oldest record", () => {
    const store = bounded(3 * F);
    for (const id of ["A", "B", "C"]) store.put(rec(id, F));
    const a2 = rec("A", 2 * F);
    store.put(a2);
    expect(hits(store, ["A", "B", "C"])).toEqual({ A: true, B: false, C: true });
    expect(store.get("A")).toBe(a2);
  });

  it("R7 evicts several records for one large put", () => {
    const store = bounded(4 * F);
    for (const id of ["A", "B", "C", "D"]) store.put(rec(id, F));
    store.put(rec("E", 3 * F));
    expect(hits(store, ["A", "B", "C", "D", "E"])).toEqual({ A: false, B: false, C: false, D: true, E: true });
  });

  it("R9 evicts when the estimate exceeds the default 256 MiB budget by 2 bytes", () => {
    const store = new MemoryArtifactStore();
    store.put(rec("A", 128 * MiB));
    store.put(rec("B", 128 * MiB - F));
    store.put(rec("C", F + 2));
    expect(hits(store, ["A", "B", "C"])).toEqual({ A: false, B: true, C: true });
  });

  it("R10 evicts at one byte over an odd custom bound", () => {
    const store = bounded(2 * F + 1);
    store.put(rec("A", F));
    store.put(rec("B", F + 2));
    expect(hits(store, ["A", "B"])).toEqual({ A: false, B: true });
  });

  it("R12 an oversized record evicts every other record and stays as a singleton", () => {
    const store = bounded(2 * F);
    store.put(rec("A", F));
    store.put(rec("B", F));
    store.put(rec("BIG", 10 * F));
    expect(hits(store, ["A", "B", "BIG"])).toEqual({ A: false, B: false, BIG: true });
  });

  it("R13 the next put after a singleton evicts the singleton again", () => {
    const store = bounded(2 * F);
    store.put(rec("A", F));
    store.put(rec("B", F));
    store.put(rec("BIG", 10 * F));
    store.put(rec("N", F));
    expect(hits(store, ["BIG", "N"])).toEqual({ BIG: false, N: true });
  });

  it("R14 a same-ID record growing past the bound becomes the singleton", () => {
    const store = bounded(2 * F);
    store.put(rec("A", F));
    store.put(rec("B", F));
    const a2 = rec("A", 10 * F);
    store.put(a2);
    expect(hits(store, ["A", "B"])).toEqual({ A: true, B: false });
    expect(store.get("A")).toBe(a2);
  });

  it("R16/R17 an evicted ID fails query and summary with the existing error and recovers by reindexing", async () => {
    const dir = await fixtureDir();
    const first = await writeFixture(dir, "first.txt", "alpha needle\nmore prose here\n");
    const second = await writeFixture(dir, "second.txt", "beta needle\nother prose here\n");
    const store = bounded(1);
    const r1 = await indexArtifact({ path: first, store, allowedRoots: [dir] });
    const r2 = await indexArtifact({ path: second, store, allowedRoots: [dir] });

    expect(() => queryArtifact({ artifactId: r1.artifactId, query: "needle", maxTokens: 200, store })).toThrow(
      new Error(`Artifact not indexed: ${r1.artifactId}`),
    );
    expect(() => summarizeArtifact({ artifactId: r1.artifactId, maxTokens: 200, store })).toThrow(
      new Error(`Artifact not indexed: ${r1.artifactId}`),
    );
    expect(queryArtifact({ artifactId: r2.artifactId, query: "needle", maxTokens: 200, store }).excerpts).toHaveLength(1);

    const again = await indexArtifact({ path: first, store, allowedRoots: [dir] });
    expect(again.artifactId).toBe(r1.artifactId);
    const result = queryArtifact({ artifactId: r1.artifactId, query: "needle", maxTokens: 200, store });
    expect(result.excerpts[0].text).toContain("alpha needle");
    expect(() => summarizeArtifact({ artifactId: r2.artifactId, maxTokens: 200, store })).toThrow(
      new Error(`Artifact not indexed: ${r2.artifactId}`),
    );
  });

  it("R18 rejects invalid constructor options with explicit errors", () => {
    const optionsError = "MemoryArtifactStore options must be an object";
    for (const arg of [null, 0, 1, "x", true, [], [1]]) {
      expect(() => construct(arg)).toThrow(new Error(optionsError));
    }
    const limitError = "maxEstimatedBytes must be a positive safe integer";
    for (const value of [null, 0, -1, -F, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53, "1", {}]) {
      expect(() => construct({ maxEstimatedBytes: value })).toThrow(new Error(limitError));
    }
  });

  it("R19 rejects invalid records before changing entries, order or accounting", () => {
    const fieldError = "Artifact record byteLength and lineCount must be non-negative safe integers";
    const weightError = "Artifact record estimated weight must be a safe integer";
    const store = bounded(2 * F);
    const a = rec("A", F);
    store.put(a);
    store.put(rec("B", F));

    const bad: Array<[Partial<ArtifactRecord>, string]> = [
      [{ byteLength: Number.NaN }, fieldError],
      [{ byteLength: -1 }, fieldError],
      [{ byteLength: 0.5 }, fieldError],
      [{ byteLength: Number.POSITIVE_INFINITY }, fieldError],
      [{ byteLength: 2 ** 53 }, fieldError],
      [{ byteLength: "1" as unknown as number }, fieldError],
      [{ lineCount: -1 }, fieldError],
      [{ lineCount: 1.5 }, fieldError],
      [{ lineCount: undefined as unknown as number }, fieldError],
      [{ byteLength: 2 ** 52 }, weightError],
      [{ byteLength: Number.MAX_SAFE_INTEGER }, weightError],
      [{ lineCount: Number.MAX_SAFE_INTEGER }, weightError],
    ];
    for (const [patch, message] of bad) {
      // Same ID as the oldest entry: a rejected put must neither remove nor promote it.
      expect(() => store.put({ ...rec("A", F), ...patch })).toThrow(new Error(message));
      expect(() => store.put({ ...rec("X", F), ...patch })).toThrow(new Error(message));
    }

    // Accounting unchanged: one more F record evicts exactly the oldest (A), not more.
    store.put(rec("C", F));
    expect(hits(store, ["A", "B", "C", "X"])).toEqual({ A: false, B: true, C: true, X: false });
  });

  it("R19b a rejected same-ID put keeps the original object", () => {
    const store = bounded(3 * F);
    const a = rec("A", F);
    store.put(a);
    store.put(rec("B", F));
    expect(() => store.put({ ...rec("A", F), byteLength: -2 })).toThrow();
    expect(store.get("A")).toBe(a);
  });

  it("R20b evicts the first real indexed record when the bound is one below their estimate sum", async () => {
    const dir = await fixtureDir();
    const first = await writeFixture(dir, "first.txt", "alpha needle\nsecond line\r\nthird\n");
    const second = await writeFixture(dir, "second.txt", "beta needle\n\nlast line without newline");
    const probe = new MemoryArtifactStore();
    const r1 = await indexArtifact({ path: first, store: probe, allowedRoots: [dir] });
    const r2 = await indexArtifact({ path: second, store: probe, allowedRoots: [dir] });
    const store = bounded(weightOf(r1) + weightOf(r2) - 1);
    await indexArtifact({ path: first, store, allowedRoots: [dir] });
    const kept = await indexArtifact({ path: second, store, allowedRoots: [dir] });
    expect(hits(store, [r1.artifactId, r2.artifactId])).toEqual({ [r1.artifactId]: false, [r2.artifactId]: true });
    expect(store.get(r2.artifactId)).toBe(kept);
  });
});
