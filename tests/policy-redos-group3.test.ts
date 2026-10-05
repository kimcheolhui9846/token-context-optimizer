import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadPolicyInternals, evaluatePolicyPredicate } from "./helpers/policy-test-loader.js";

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
const group3PatternIndexes = [10, 12, 25] as const;

const whitespace = ["", " ", "\t", "\v", "\f", "\u00a0", "\u1680", "\u2003", "\u202f", "\u3000"];
const lineTerminators = ["\n", "\r", "\r\n", "\u2028", "\u2029"];
const starts = ["", "sudo ", "doas ", "sudo -u root ", "doas -- foo "];
const commands = ["npm", "node", "git", "pnpm", "python", "make", "terraform"];
const codeKeywords = ["import", "export", "const", "return", "function", "interface", "while"];

function group3DifferentialInputs(): string[] {
  const inputs = new Set<string>([
    "",
    "ordinary prose",
    "sudo npm install",
    "doas git status",
    "sudo -u root node app.js",
    "doas -- make test",
    "sudo nope",
    "doas",
    "npm",
    "npmx",
    "npm1",
    "npm_",
    "npmé",
    "x\nnpm test",
    "x\r\nnpm test",
    "x\rnpm test",
    "x\u2028npm test",
    "x\u2029npm test",
    "\u00a0\tconst value = 1",
    "\u2028\u2003return value",
    "|x|",
    "||",
    "|||",
    "| |",
    "|x||",
    "||x|",
    "|x|\n",
    "|x|\r",
    "|x|\r\n",
    "|x|\u2028",
    "|x|\u2029",
    "x\n|a|\n",
    "x\r|a|\r",
    "x\r\n|a|\r\n",
    "x\u2028|a|\u2028",
    "x\u2029|a|\u2029",
    "|a\nb|",
    "|a\rb|",
    "|a\u2028b|",
    "|a\u2029b|",
    "|a\r\nb|",
    "|a|\nend",
    "|a| \nend",
    "|a| \r\nend",
    "prefix\n|a|\nsuffix",
    "prefix\n \t|a| \t\nsuffix",
  ]);

  for (const prefix of whitespace) {
    for (const lineTerminator of lineTerminators) {
      for (const start of starts) {
        for (const command of commands) {
          inputs.add(`${prefix}${lineTerminator}${start}${command} test`);
          inputs.add(`x${lineTerminator}${prefix}${start}${command} test`);
          inputs.add(`${prefix}${lineTerminator}${start}unknown`);
        }
      }
      for (const keyword of codeKeywords) {
        inputs.add(`${prefix}${lineTerminator}${keyword} value`);
        inputs.add(`x${lineTerminator}${prefix}${keyword} value`);
        inputs.add(`${prefix}${lineTerminator}${keyword}é`);
      }
    }
  }

  const tableSegments = ["", "x", "|", "||", "|||", "a\nb", "a\rb", "a\r\nb", "a\u2028b", "a\u2029b"];
  for (const before of ["", "x", "\n", "\r", "\r\n", "\u2028", "\u2029"]) {
    for (const after of ["", "x", "\n", "\r", "\r\n", "\u2028", "\u2029", " \n", " \r\n"]) {
      for (const segment of tableSegments) {
        inputs.add(`${before}|${segment}|${after}`);
        inputs.add(`${before}||${segment}||${after}`);
      }
    }
  }

  // Exhaust short strings over line, whitespace, command, keyword, and pipe classes.
  const alphabet = ["\n", "\r", "\u2028", "\u2029", " ", "\t", "|", "x", "s", "u", "d", "o", "n", "p", "m", "i", "t"];
  let frontier = [""];
  for (let length = 0; length < 4; length += 1) {
    const next: string[] = [];
    for (const prefix of frontier) {
      inputs.add(prefix);
      for (const char of alphabet) next.push(prefix + char);
    }
    frontier = next;
  }
  for (const input of frontier) inputs.add(input);

  // Deterministic long mixed-token samples exercise interactions beyond the short exhaustive set.
  let seed = 0x25c0ffee;
  const pieces = [...whitespace.slice(1), ...lineTerminators, ...starts, ...commands, ...codeKeywords, "|", "||", "|||", "x", "é"];
  for (let sample = 0; sample < 256; sample += 1) {
    let value = "";
    const count = 24 + (sample % 40);
    for (let index = 0; index < count; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      value += pieces[seed % pieces.length];
    }
    inputs.add(value);
  }
  return [...inputs];
}

describe("policy ReDoS group 3 characterization", () => {
  it("keeps rules 10, 12, and 25 individually equivalent to the frozen oracle", () => {
    const inputs = group3DifferentialInputs();
    for (const patternIndex of group3PatternIndexes) {
      const [baselineReason, baselinePredicate] = baseline.EXACT_PATTERNS[patternIndex];
      const [currentReason, currentPredicate] = current.EXACT_PATTERNS[patternIndex];
      expect(currentReason, `reason at ${patternIndex}`).toBe(baselineReason);
      for (const input of inputs) {
        expect(
          evaluatePolicyPredicate(currentPredicate, input),
          `rule ${patternIndex}, input ${JSON.stringify(input)}`,
        ).toBe(evaluatePolicyPredicate(baselinePredicate, input));
      }
    }
  });

  it("preserves rule 25's LF boundaries, dot exclusions, and intervening-character requirement", () => {
    const predicate = current.EXACT_PATTERNS[25][1];
    for (const value of ["|||", "|x|", "|\n|", "|\r|", "|\u2028|", "|\u2029|", "|\r\n|"]) {
      expect(evaluatePolicyPredicate(predicate, value), JSON.stringify(value)).toBe(
        evaluatePolicyPredicate(baseline.EXACT_PATTERNS[25][1], value),
      );
    }
    expect(evaluatePolicyPredicate(predicate, "|x|")).toBe(true);
    expect(evaluatePolicyPredicate(predicate, "|||\n")).toBe(true);
    expect(evaluatePolicyPredicate(predicate, "||")).toBe(false);
    expect(evaluatePolicyPredicate(predicate, "|x\ny|")).toBe(false);
    expect(evaluatePolicyPredicate(predicate, "x\r|a|\r")).toBe(false);
    expect(evaluatePolicyPredicate(predicate, "x\n|a|\n")).toBe(true);
  });

  it("preserves complete frozen classifications for the corpus and group 3 inputs", () => {
    const fixture = JSON.parse(
      readFileSync(resolve("tests/fixtures/policy/characterization.json"), "utf8"),
    ) as CharacterizationFixture;
    for (const entry of fixture.entries) {
      expect(current.classifyContext(entry.content), entry.id).toEqual(entry.classification);
      expect(current.lossyCompressionAllowed(current.classifyContext(entry.content)), entry.id).toBe(
        entry.lossyCompressionAllowed,
      );
      expect(current.classifyContext(entry.content), `oracle ${entry.id}`).toEqual(
        baseline.classifyContext(entry.content),
      );
    }
    for (const input of group3DifferentialInputs()) {
      expect(current.classifyContext(input), JSON.stringify(input)).toEqual(baseline.classifyContext(input));
    }
  });

  it("bounds the isolated blank-line negative predicates on 400,000 characters", () => {
    for (const patternIndex of group3PatternIndexes) {
      const child = spawnSync(process.execPath, [
        "tests/helpers/policy-lines-perf-child.mjs",
        "src/core/policy.ts",
        String(patternIndex),
        "400000",
        "5",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      expect(child.error?.message ?? "", `rule ${patternIndex}: ${child.stderr}`).toBe("");
      expect(child.status, `rule ${patternIndex}: ${child.stderr}`).toBe(0);
      const report = JSON.parse(child.stdout) as {
        patternIndex: number;
        utf16Length: number;
        samples: Array<{ elapsedNs: number; result: boolean }>;
      };
      expect(report.patternIndex).toBe(patternIndex);
      expect(report.utf16Length).toBe(400_000);
      expect(report.samples).toHaveLength(5);
      expect(report.samples.every((sample) => sample.result === false)).toBe(true);
      const elapsedNs = report.samples.map(({ elapsedNs: elapsed }) => elapsed).sort((a, b) => a - b);
      expect(elapsedNs[2], `rule ${patternIndex} median`).toBeLessThan(500_000_000);
    }
  }, 15_000);
});
