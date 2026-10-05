import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { policyCorpus } from "./helpers/policy-corpus.js";
import {
  evaluatePolicyPredicate,
  loadPolicyInternals,
} from "./helpers/policy-test-loader.js";

interface CharacterizationFixture {
  entries: Array<{
    id: string;
    content: string;
    classification: { mode: string; reasons: string[]; warnings: string[] };
    lossyCompressionAllowed: boolean;
  }>;
}

const baseline = loadPolicyInternals("tests/helpers/policy-baseline.ts");
const current = loadPolicyInternals("src/core/policy.ts");
const group2PatternIndexes = [3, 6, 7, 15, 18, 20, 21] as const;

function group2DifferentialInputs(): string[] {
  const witnesses = [
    "",
    "ordinary prose",
    "a:",
    "http:",
    "http: ",
    "Note:",
    "mailto:ops@example.com",
    "sqlite:/srv/app.db",
    "1a:x",
    "_a:x",
    "éa:x",
    "a+.-:x",
    "a.b",
    "ab.c",
    "a\u{1D400}.ts",
    "ab\u{1D400}.ts",
    "a\u{10400}b.md",
    "éx.a",
    "aé.b",
    "aéé.js",
    "ab.",
    `ab.${"a".repeat(12)}`,
    `ab.${"a".repeat(13)}`,
    "ab.c_",
    "x.a",
    "x.ts",
    "x.ts:1",
    "x.ts:1:2",
    "x.ts:",
    "x.ts:1:",
    "x.tss",
    "x.TS",
    "_x.ts",
    "éx.ts",
    "<!DOCTYPE html>",
    "<!a",
    "<!a>",
    "<!-<!a>",
    "<a>",
    "</a>",
    "<a     >",
    "<a     <b",
    "<a attr=value>",
    "<a\u00a0x>",
    "<a\ufeff>",
    "<a\nx>",
    "<a",
    "request-id abcdef",
    "request_id: abcdef",
    "foo-id=",
    "foo-id abcde",
    "a-id\u00a0abcdef",
    "foo-id abcdef.",
    "ſ-id abcdef",
    "trace abcdef",
    "traceabcdef",
    "TrAcEabcdef",
    "trace abcde",
    "trace: abcdef",
    "trace = abcdef",
    "trace      =      abcdef",
    "trace = abcde",
    "trace = abcdef.",
    "ſpan abcdef",
    "session=abcdef",
    "event      abcdef",
    "eventabcdef",
    "correlation: abcdef-123",
    "token=".padEnd(64, " "),
    "a-".repeat(32),
    "a.".repeat(32),
    "<!a".repeat(32),
    "<a ".repeat(32),
    "trace".padEnd(128, " "),
    "request".padEnd(128, "-"),
    ...["", " ", "\t", ":", "=", " : ", " = "].flatMap((separator) =>
      ["", "a", "abcde", "abcdef", "abcdefg", ".....x", "......x", "...... x", "....ſx", "....Kx"].map(
        (value) => `a-id${separator}${value}`,
      ),
    ),
    ...["trace", "span", "correlation", "request", "session", "event", "ſpan", "Kevent"].flatMap((keyword) =>
      ["", " ", ":", "=", " : ", " = "].flatMap((separator) =>
        ["", "a", "abcde", "abcdef", "abcdefg", "......x", "...... x", "....ſx", "....Kx"].map(
          (value) => `${keyword}${separator}${value}`,
        ),
      ),
    ),
    ...["a", "ab", "ſ", "K", "😀a", "a😀", "xſ", "xK", "x😀"].flatMap((stem) =>
      [1, 2, 11, 12, 13].map((extensionLength) => `${stem}.${"a".repeat(extensionLength)}`),
    ),
  ];
  const alphabet = ["", " ", "\n", "\r", "\u2028", ".", "-", "_", ":", "=", "/", "<", ">", "!", "a", "A", "é", "K", "ſ", "1"];
  const generated = new Set<string>(witnesses);
  for (const left of alphabet) {
    for (const middle of alphabet) {
      for (const right of alphabet) {
        generated.add(`${left}${middle}${right}`);
      }
    }
  }
  return [...generated];
}

describe("policy ReDoS group 2 characterization", () => {
  it("keeps rule 6 equivalent on astral-letter dotted-token boundaries", () => {
    const [, baselinePredicate] = baseline.EXACT_PATTERNS[6];
    const [, currentPredicate] = current.EXACT_PATTERNS[6];
    for (const input of [
      "a\u{1D400}.ts",
      "ab\u{1D400}.ts",
      "a\u{10400}b.md",
    ]) {
      expect(evaluatePolicyPredicate(currentPredicate, input), JSON.stringify(input)).toBe(
        evaluatePolicyPredicate(baselinePredicate, input),
      );
    }
  });

  it("keeps zero-based rules 3, 6, 7, 15, 18, 20, and 21 equivalent to the frozen oracle", () => {
    for (const patternIndex of group2PatternIndexes) {
      const [baselineReason, baselinePredicate] = baseline.EXACT_PATTERNS[patternIndex];
      const [currentReason, currentPredicate] = current.EXACT_PATTERNS[patternIndex];
      expect(currentReason, `reason at ${patternIndex}`).toBe(baselineReason);
      for (const input of group2DifferentialInputs()) {
        for (let repeat = 0; repeat < 3; repeat += 1) {
          expect(
            evaluatePolicyPredicate(currentPredicate, input),
            `repeated pattern ${patternIndex} input ${JSON.stringify(input)} repeat ${repeat}`,
          ).toBe(evaluatePolicyPredicate(baselinePredicate, input));
        }
      }
    }
  });

  it("keeps duplicated helper predicates equivalent to the frozen oracle", () => {
    for (const input of group2DifferentialInputs()) {
      expect(current.hasTechnicalTokenShape(input), `line helper ${JSON.stringify(input)}`).toBe(
        baseline.hasTechnicalTokenShape(input),
      );
      expect(current.containsTechnicalTokenShape(input), `content helper ${JSON.stringify(input)}`).toBe(
        baseline.containsTechnicalTokenShape(input),
      );
    }
  });

  it("keeps structured group 2 classifications and ordered reasons unchanged", () => {
    for (const input of group2DifferentialInputs()) {
      expect(current.classifyContext(input), JSON.stringify(input)).toEqual(
        baseline.classifyContext(input),
      );
    }
  });

  it("preserves rule 21 and helper Unicode word-fold behavior", () => {
    const inputs = ["ſpanabcdef", "Keventabcdef", "xſpanabcdef", "xKeventabcdef", "traceſabcdef", "traceKabcdef", "😀traceabcdef", "traceabcdef😀"];
    const [baselinePredicate] = [baseline.EXACT_PATTERNS[21][1]];
    const [currentPredicate] = [current.EXACT_PATTERNS[21][1]];
    for (const input of inputs) {
      expect(evaluatePolicyPredicate(currentPredicate, input), input).toBe(
        evaluatePolicyPredicate(baselinePredicate, input),
      );
      expect(current.hasTechnicalTokenShape(input), input).toBe(baseline.hasTechnicalTokenShape(input));
      expect(current.classifyContext(input), input).toEqual(baseline.classifyContext(input));
    }
  });

  it("keeps the complete frozen corpus classification unchanged", () => {
    const fixture = JSON.parse(
      readFileSync(resolve("tests/fixtures/policy/characterization.json"), "utf8"),
    ) as CharacterizationFixture;
    expect(fixture.entries.map(({ id, content }) => ({ id, content }))).toEqual(policyCorpus);
    for (const entry of fixture.entries) {
      const actual = current.classifyContext(entry.content);
      expect(actual, entry.id).toEqual(entry.classification);
      expect(current.lossyCompressionAllowed(actual), entry.id).toBe(entry.lossyCompressionAllowed);
    }
  });

  it.each([
    ["3", "uri"],
    ["6", "dotted"],
    ["7", "filename"],
    ["15", "bang"],
    ["18", "tag"],
    ["20", "identifierId"],
    ["21", "trace"],
  ] as const)(
    "bounds group 2 predicate %s (%s) on large missing-tail inputs",
    (patternIndex, family) => {
      const child = spawnSync(process.execPath, [
        "tests/helpers/policy-predicate-perf-child.mjs",
        "src/core/policy.ts",
        patternIndex,
        family,
        "400000",
        "3",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });

      expect(child.error?.message ?? "", `${patternIndex}/${family} ${child.stderr}`).toBe("");
      expect(child.status, `${patternIndex}/${family} ${child.stderr}`).toBe(0);
      const report = JSON.parse(child.stdout) as { samples: Array<{ elapsedNs: number; result: boolean }> };
      const elapsedNs = report.samples.map((sample) => sample.elapsedNs).sort((left, right) => left - right);
      expect(
        report.samples.every((sample) => sample.result === report.samples[0].result),
        `${patternIndex}/${family}`,
      ).toBe(true);
      expect(report.samples.every((sample) => sample.result === false), `${patternIndex}/${family} result`).toBe(true);
      expect(elapsedNs[1], `${patternIndex}/${family}`).toBeLessThan(500_000_000);
    },
    15_000,
  );
});
