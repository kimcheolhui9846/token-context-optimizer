import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { policyCorpus } from "./helpers/policy-corpus.js";
import { evaluatePolicyPredicate, loadPolicyInternals } from "./helpers/policy-test-loader.js";

const baseline = loadPolicyInternals("tests/helpers/policy-baseline.ts");
const current = loadPolicyInternals("src/core/policy.ts");
const childScript = "tests/helpers/policy-large-input-child.mjs";
const sixMiB = 6_000_000;
const largeBytes = 10 * 1024 * 1024;
// These are zero-based indexes into the private EXACT_PATTERNS table.
const patternIndexes = [2, 8, 19, 21, 23] as const;

function smallDifferentialInputs(): string[] {
  const inputs = new Set(policyCorpus.map(({ content }) => content));
  // Explicit rule-8 overlap witnesses; these preserve the baseline's delimiter semantics.
  for (const input of [
    "a/.!",
    "a/b.?",
    "a/b./",
    "a/b.c!",
    "a/..!?",
    "a/b]",
    "/a",
    "a//b",
    "id=abcd....",
    "id=abcd.",
    "id=abcd..",
    "trace=abcdef....",
    "trace=abcdef.",
    "trace=abcdef..",
  ]) inputs.add(input);
  const boundaries = ["", "x", " ", "\t", "\n", "\r\n", "\u2028", "\u2029", "\u00a0", "\u3000", "!", ".", ":"];
  const unicode = ["ſ", "K", "한", "𝔘", "\uD800"];
  const separators = ["", " ", "\t", ":", "=", " : ", " = "];
  const traceNames = ["trace", "span", "correlation", "request", "session", "event", "ſpan"];
  const iuKeywords = ["sha256", "sha", "hash", "id", "ſha"];
  for (const left of boundaries) {
    for (const right of boundaries) {
      for (const length of [7, 8, 9]) inputs.add(`${left}Bearer ${"A".repeat(length)}${right}`);
      for (const length of [3, 4, 5]) inputs.add(`${left}id=${"a".repeat(length)}${right}`);
      for (const length of [31, 32, 33]) inputs.add(`${left}${"a".repeat(length)}${right}`);
      for (const path of [".", "./a", "../a", "/a", "a/a", "x/a", "a/", "a//a", "a/a."]) {
        for (const terminator of ["", " ", "\n", ")", ",", ";", ":", ".", "!"]) {
          inputs.add(`${left}${path}${terminator}${right}`);
        }
      }
      for (const separator of separators) {
        for (const length of [5, 6, 7]) {
          for (const name of traceNames) inputs.add(`${left}${name}${separator}${"a".repeat(length)}${right}`);
        }
        for (const name of iuKeywords) {
          for (const value of ["abcd", "abcde", "K", "ſ"]) inputs.add(`${left}${name}${separator}${value}${right}`);
        }
      }
      for (const character of unicode) {
        inputs.add(`${left}Bearer ${character}${"A".repeat(8)}${right}`);
        inputs.add(`${left}trace${character}=${"a".repeat(6)}${right}`);
        inputs.add(`${left}${character}${"a".repeat(32)}${right}`);
      }
    }
  }
  const alphabet = ["", " ", "a", "A", "0", "_", "/", ":", "=", "-", "\\", "\n", "\r", "\u2028", "\u2029"];
  let frontier = [""];
  for (let length = 0; length <= 3; length += 1) {
    for (const value of frontier) inputs.add(value);
    frontier = frontier.flatMap((prefix) => alphabet.map((character) => prefix + character));
  }
  let state = 0x25f03;
  const atoms = ["Bearer ", "id=", "trace=", "span=", "a", "A", "0", "/a", "_", " ", "!", "\r\n", "\u2028", "\u2029", "ſ", "K", "한", "𝔘", "\uD800"];
  for (let sample = 0; sample < 256; sample += 1) {
    let value = "";
    for (let index = 0; index < 24 + (sample % 40); index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      value += atoms[state % atoms.length];
    }
    inputs.add(value);
  }
  return [...inputs];
}

function runChild(mode: "large-calls" | "fault" | "artifacts", fault?: string): any {
  const child = spawnSync(
    process.execPath,
    [childScript, mode, "src/core/policy.ts", ...(fault ? [fault] : [])],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: mode === "fault" ? 5_000 : 20_000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  expect(child.error?.message ?? "", child.stderr).toBe("");
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout);
}

describe("large-input policy scanner", () => {
  it("keeps six representative operations sequential in one isolated child", () => {
    const report = runChild("large-calls");
    expect(report.byteLength).toEqual([sixMiB, largeBytes, sixMiB, sixMiB, sixMiB, largeBytes]);
    expect(report.utf16Length).toEqual(report.byteLength);
    expect(report.outcomes).toHaveLength(6);
    expect(report.outcomes.every(({ status }: { status: string }) => status === "returned")).toBe(true);
    expect(report.outcomes.map(({ name }: { name: string }) => name)).toEqual([
      "bearer", "path", "identifier", "trace", "hex", "classify",
    ]);
    expect(report.outcomes.slice(0, 5).map(({ value }: { value: unknown }) => value)).toEqual(
      [true, true, true, true, true],
    );
    expect(report.outcomes[5].value).toEqual(baseline.classifyContext("xx/a/a/a"));
  }, 25_000);

  it.each([
    ["range-stack", "returned", "", "Maximum call stack size exceeded"],
    ["range-other", "threw", "RangeError", "synthetic range failure"],
    ["error", "threw", "Error", "synthetic failure"],
    ["type-error", "threw", "TypeError", "synthetic type failure"],
    ["error-stack", "threw", "Error", "Maximum call stack size exceeded"],
    ["type-error-stack", "threw", "TypeError", "Maximum call stack size exceeded"],
  ] as const)("handles injected %s through the real wrapper", (fault, status, errorName, message) => {
    const report = runChild("fault", fault);
    expect(report.status).toBe(status);
    if (status === "returned") {
      expect(report.value).toEqual({
        mode: "exact",
        reasons: ["classification_resource_limit"],
        warnings: ["lossy_compression_not_allowed", "classification_resource_limit"],
      });
    } else {
      expect(report.error).toEqual({ name: errorName, message });
    }
  }, 5_000);

  it("keeps representative predicates and classifications equivalent on small inputs", () => {
    const inputs = smallDifferentialInputs();
    const counts = { predicateCells: 0, predicateReturned: 0, classificationCells: 0, classificationReturned: 0, currentThrownCells: 0, oracleThrownCells: 0 };
    const returned = <T>(call: () => T, side: "current" | "oracle"): { returned: true; value: T } | { returned: false } => {
      try {
        return { returned: true, value: call() };
      } catch {
        counts[side === "current" ? "currentThrownCells" : "oracleThrownCells"] += 1;
        return { returned: false };
      }
    };
    for (const patternIndex of patternIndexes) {
      const [baselineReason, baselinePredicate] = baseline.EXACT_PATTERNS[patternIndex];
      const [currentReason, currentPredicate] = current.EXACT_PATTERNS[patternIndex];
      expect(currentReason).toBe(baselineReason);
      for (const input of inputs) {
        counts.predicateCells += 1;
        const actual = returned(() => evaluatePolicyPredicate(currentPredicate, input), "current");
        const expected = returned(() => evaluatePolicyPredicate(baselinePredicate, input), "oracle");
        if (expected.returned) expect(actual.returned).toBe(true);
        if (!actual.returned || !expected.returned) continue;
        counts.predicateReturned += 1;
        expect(actual.value, `${patternIndex}:${JSON.stringify(input)}`).toBe(expected.value);
      }
    }
    for (const input of inputs) {
      counts.classificationCells += 1;
      const actual = returned(() => current.classifyContext(input), "current");
      const expected = returned(() => baseline.classifyContext(input), "oracle");
      if (expected.returned) expect(actual.returned).toBe(true);
      if (!actual.returned || !expected.returned) continue;
      counts.classificationReturned += 1;
      expect(actual.value, JSON.stringify(input)).toEqual(expected.value);
    }
    expect(counts.currentThrownCells).toBe(0);
    console.info(`[policy-large-input] differential returned cells: ${JSON.stringify(counts)}`);
  }, 25_000);

  it("keeps the complete frozen corpus classification unchanged", () => {
    for (const { content } of policyCorpus) {
      const actual = current.classifyContext(content);
      expect(actual).toEqual(baseline.classifyContext(content));
      expect(current.lossyCompressionAllowed(actual)).toBe(baseline.lossyCompressionAllowed(actual));
    }
  });

  it("indexes and summarizes an exact 10 MiB Bearer artifact in an isolated child", () => {
    const report = runChild("artifacts");
    expect(report.byteLength).toBe(largeBytes);
    expect(report.cleanedUp).toBe(true);
    expect(report.summary.summary).toBe("");
    expect(report.summary.warnings).toContain("lossy_summary_blocked");
    expect(report.summary.warnings).toContain("lossy_compression_not_allowed");
  }, 25_000);
});
