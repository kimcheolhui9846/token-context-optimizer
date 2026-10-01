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
const group1PatternIndexes = [13, 14, 16, 17] as const;

function group1DifferentialInputs(): string[] {
  const witnesses = [
    "",
    "ordinary prose",
    "SELECT FROM WHERE",
    "SELECT FROM",
    "DROP ".repeat(6),
    "SELECT alpha FROM beta WHERE active",
    "SELECTFROM WHERE",
    "FROMSELECT WHERE",
    "SELECT FROM_table WHERE_value",
    "SELECT FROM1 WHERE2",
    "SELECT FROM한 WHEREß",
    "éFROM FROMé",
    "ſFROM FROMK",
    "_FROM FROM_",
    "😀FROM FROM😀",
    "\uD800FROM FROM\uDC00",
    "FROM\rFROM",
    "FROM\u2028FROM",
    "FROM\u2029FROM",
    "; =>",
    "; ".repeat(12),
    "{ value",
    "= ;",
    "<?php ?>",
    "<?a <?b",
    "<?a ".repeat(12),
    "<!-- comment -->",
    "<!-->",
    "<!-- >",
    "<!--->",
    "<!--".repeat(12),
    "<!-- comment",
    "<?a?>",
    "<?a ?>",
  ];
  const alphabet = ["", " ", "\n", ";", "=", "(", ")", ".", "<", "!", "-", "?", "A", "a", "FROM", "WHERE"];
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

describe("policy ReDoS group 1 characterization", () => {
  it("keeps zero-based rules 13, 14, 16, and 17 equivalent to the frozen oracle", () => {
    for (const patternIndex of group1PatternIndexes) {
      const [baselineReason, baselinePredicate] = baseline.EXACT_PATTERNS[patternIndex];
      const [currentReason, currentPredicate] = current.EXACT_PATTERNS[patternIndex];
      expect(currentReason, `reason at ${patternIndex}`).toBe(baselineReason);
      for (const input of group1DifferentialInputs()) {
        for (let repeat = 0; repeat < 3; repeat += 1) {
          expect(
            evaluatePolicyPredicate(currentPredicate, input),
            `repeated pattern ${patternIndex} input ${JSON.stringify(input)} repeat ${repeat}`,
          ).toBe(evaluatePolicyPredicate(baselinePredicate, input));
        }
        expect(
          evaluatePolicyPredicate(currentPredicate, input),
          `pattern ${patternIndex} input ${JSON.stringify(input)}`,
        ).toBe(evaluatePolicyPredicate(baselinePredicate, input));
      }
      const alternating = ["SELECT FROM WHERE", "ordinary prose", "; =>", ";", "<?a?>", "<?a", "<!-- comment -->", "<!-->"];
      for (const input of alternating) {
        expect(
          evaluatePolicyPredicate(currentPredicate, input),
          `alternating pattern ${patternIndex} input ${JSON.stringify(input)}`,
        ).toBe(evaluatePolicyPredicate(baselinePredicate, input));
      }
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

  it("bounds the delimiter predicate on a large missing-tail input", () => {
    const child = spawnSync(process.execPath, [
      "tests/helpers/policy-predicate-perf-child.mjs",
      "src/core/policy.ts",
      "14",
      "delimiter",
      "400000",
      "3",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    expect(child.error?.message ?? "", child.stderr).toBe("");
    expect(child.status, child.stderr).toBe(0);
    const report = JSON.parse(child.stdout) as { samples: Array<{ elapsedNs: number; result: boolean }> };
    const elapsedNs = report.samples.map((sample) => sample.elapsedNs).sort((left, right) => left - right);
    expect(report.samples.every((sample) => sample.result === false)).toBe(true);
    expect(elapsedNs[1]).toBeLessThan(500_000_000);
  });
});
