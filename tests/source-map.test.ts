// 6.4b-6 (N-33): buildSourceMap must not overflow the stack for in-limit UTF-8 input,
// and must keep every SourceLine field identical to the previous regex implementation.
// All checks go through the public indexArtifact path (decision D3); no new exports.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryArtifactStore, indexArtifact } from "../src/core/artifacts.js";
import type { ArtifactRecord, SourceLine } from "../src/core/types.js";

const LIMIT = 10 * 1024 * 1024; // indexArtifact default maxBytes
const MIB = 1024 * 1024;
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);
const BOM = String.fromCodePoint(0xfeff);
const EMOJI = String.fromCodePoint(0x1f600); // 4 UTF-8 bytes, 2 UTF-16 units
const ACUTE = String.fromCodePoint(0x0301); // combining mark, 2 UTF-8 bytes
const E_ACUTE = String.fromCodePoint(0xe9); // precomposed, 2 UTF-8 bytes
const GA = String.fromCodePoint(0xac00); // Hangul, 3 UTF-8 bytes
const ZHONG = String.fromCodePoint(0x4e2d);
const WEN = String.fromCodePoint(0x6587);

// Frozen copy of the BASE (dd33460) implementation. Oracle for SHORT inputs only;
// it is the code that overflows on large astral input, so never feed it big strings.
function legacyBuildSourceMap(content: string): SourceLine[] {
  const matches = [...content.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/gu)];
  let byteCursor = 0;
  return matches
    .filter((match, index) => match[1].length > 0 || index < matches.length - 1)
    .map((match, index) => {
      const text = match[1];
      const delimiter = match[2];
      const lineBytes = Buffer.byteLength(text, "utf8");
      const sourceLine = { line: index + 1, startByte: byteCursor, endByte: byteCursor + lineBytes, text, delimiter };
      byteCursor += lineBytes + Buffer.byteLength(delimiter, "utf8");
      return sourceLine;
    });
}

let dir = "";
let counter = 0;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tco-source-map-"));
});
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function indexContent(content: string | Buffer, path = join(dir, `f${counter++}.txt`)): Promise<ArtifactRecord> {
  await writeFile(path, content);
  return indexArtifact({ path, store: new MemoryArtifactStore(), allowedRoots: [dir] });
}

const tuple = (line: SourceLine) => [line.line, line.startByte, line.endByte, line.text, line.delimiter];

// Mathematical expectation for a big input with no CR/LF: one line spanning all bytes.
async function expectSingleLine(content: string): Promise<void> {
  const bytes = Buffer.byteLength(content, "utf8");
  expect(bytes).toBeLessThanOrEqual(LIMIT);
  const record = await indexContent(content);
  expect(record.byteLength).toBe(bytes);
  expect(record.lineCount).toBe(1);
  expect(record.sourceMap.length).toBe(1);
  const [first] = record.sourceMap;
  expect([first.line, first.startByte, first.endByte, first.delimiter]).toEqual([1, 0, bytes, ""]);
  expect(first.text === content).toBe(true);
  expect(record.content === content).toBe(true);
}

describe("N-33 large in-limit input (public indexArtifact)", () => {
  it("R1: indexes exactly 10 MiB of ASCII ending in an astral emoji", async () => {
    await expectSingleLine("a".repeat(LIMIT - 4) + EMOJI);
  }, 60_000);

  it("control: indexes exactly 10 MiB of ASCII", async () => {
    await expectSingleLine("a".repeat(LIMIT));
  }, 60_000);

  it("control: indexes 1 MiB of ASCII ending in an astral emoji", async () => {
    await expectSingleLine("a".repeat(MIB - 4) + EMOJI);
  }, 60_000);

  it("boundary: 10 MiB line starting with an astral emoji", async () => {
    await expectSingleLine(EMOJI + "a".repeat(LIMIT - 4));
  }, 60_000);

  it("boundary: 10 MiB line with an astral emoji in the middle", async () => {
    const half = (LIMIT - 4) / 2;
    await expectSingleLine("a".repeat(half) + EMOJI + "a".repeat(half));
  }, 60_000);

  it("boundary: 10 MiB made only of astral emoji", async () => {
    await expectSingleLine(EMOJI.repeat(LIMIT / 4));
  }, 60_000);

  it("boundary: 10 MiB Hangul line (3-byte characters)", async () => {
    const count = Math.floor(LIMIT / 3); // 3,495,253 chars = 10,485,759 bytes
    await expectSingleLine(GA.repeat(count) + "a".repeat(LIMIT - count * 3));
  }, 60_000);

  it("keeps the existing too_large rejection one byte over the limit", async () => {
    await expect(indexContent("a".repeat(LIMIT + 1))).rejects.toMatchObject({
      name: "ReadBoundedFileError",
      code: "too_large",
    });
  }, 60_000);

  it("keeps the existing invalid UTF-8 rejection", async () => {
    await expect(indexContent(Buffer.from([0x61, 0xff, 0x62]))).rejects.toThrow("Artifact must be valid UTF-8 text");
  });
});

describe("N-33 literal source-map contract (plan L1-L10)", () => {
  const cases: Array<[string, string, unknown[]]> = [
    ["L1 empty", "", []],
    ["L2 no newline", "a", [[1, 0, 1, "a", ""]]],
    ["L3 trailing LF", "a" + LF, [[1, 0, 1, "a", LF]]],
    ["L4 consecutive LF", "a" + LF + LF, [[1, 0, 1, "a", LF], [2, 2, 2, "", LF]]],
    ["L5 lone CRLF", CR + LF, [[1, 0, 0, "", CR + LF]]],
    ["L6 mixed", "a" + CR + LF + "b" + CR + "c" + LF + "d", [
      [1, 0, 1, "a", CR + LF], [2, 3, 4, "b", CR], [3, 5, 6, "c", LF], [4, 7, 8, "d", ""],
    ]],
    ["L7 LF then CR", LF + CR, [[1, 0, 0, "", LF], [2, 1, 1, "", CR]]],
    ["L8 BOM and multibyte", BOM + GA + LF + EMOJI, [[1, 0, 6, BOM + GA, LF], [2, 7, 11, EMOJI, ""]]],
    ["L9 combining and NUL", "e" + ACUTE + NUL + CR + CR + LF, [[1, 0, 4, "e" + ACUTE + NUL, CR], [2, 5, 5, "", CR + LF]]],
    ["L10 CJK with CR", ZHONG + WEN + CR, [[1, 0, 6, ZHONG + WEN, CR]]],
  ];
  for (const [name, input, expected] of cases) {
    it(name, async () => {
      const record = await indexContent(input);
      expect(record.sourceMap.map(tuple)).toEqual(expected);
      expect(record.lineCount).toBe(expected.length);
      expect(record.content).toBe(input);
    });
  }
});

// Differential against the frozen legacy oracle, through public indexArtifact.
// Generator and seed are fixed so the input set is reproducible.
const ALPHABET = ["a", E_ACUTE, GA, EMOJI, ACUTE, NUL, BOM, CR, LF];
const SEED = 0x6a4b6;
const RANDOM_CASES = 3000;
const RANDOM_MAX_LENGTH = 512;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function exhaustiveInputs(maxLength: number): string[] {
  let level = [""];
  const all = [""];
  for (let length = 1; length <= maxLength; length++) {
    level = level.flatMap((prefix) => ALPHABET.map((symbol) => prefix + symbol));
    all.push(...level);
  }
  return all;
}

function randomInputs(): string[] {
  const next = mulberry32(SEED);
  const inputs: string[] = [];
  for (let i = 0; i < RANDOM_CASES; i++) {
    const length = Math.floor(next() * (RANDOM_MAX_LENGTH + 1));
    let text = "";
    for (let j = 0; j < length; j++) text += ALPHABET[Math.floor(next() * ALPHABET.length)];
    inputs.push(text);
  }
  return inputs;
}

async function differential(inputs: string[], label: string): Promise<void> {
  const path = join(dir, `differential-${label}.txt`);
  const mismatches: string[] = [];
  for (const input of inputs) {
    const record = await indexContent(input, path);
    const expected = legacyBuildSourceMap(input);
    if (
      record.content !== input ||
      record.lineCount !== expected.length ||
      JSON.stringify(record.sourceMap) !== JSON.stringify(expected)
    ) {
      mismatches.push(JSON.stringify(input));
      if (mismatches.length >= 5) break;
    }
  }
  expect(mismatches).toEqual([]);
}

describe("N-33 differential against the legacy regex oracle", () => {
  it("generator sizes are fixed", () => {
    expect(exhaustiveInputs(4).length).toBe(7381);
    const random = randomInputs();
    expect(random.length).toBe(RANDOM_CASES);
    expect(random.every((text) => [...text].length <= RANDOM_MAX_LENGTH)).toBe(true);
  });

  it("matches on every input over the 9-symbol alphabet up to length 4 (7,381 inputs)", async () => {
    await differential(exhaustiveInputs(4), "exhaustive");
  }, 300_000);

  it("matches on 3,000 seeded random inputs up to 512 symbols", async () => {
    await differential(randomInputs(), "random");
  }, 300_000);
});
