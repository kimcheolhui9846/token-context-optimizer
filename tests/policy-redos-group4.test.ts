import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

import type { ContextClassification } from "../src/core/types.js";

type PolicyPredicate = RegExp | ((content: string) => boolean);
type TestPolicyInternals = {
  EXACT_PATTERNS: Array<[string, PolicyPredicate]>;
  classifyContext(content: string): ContextClassification;
  lossyCompressionAllowed(classification: ContextClassification): boolean;
  hasTechnicalTokenShape(line: string): boolean;
  containsTechnicalTokenShape(content: string): boolean;
  isShellCommandLine(line: string): boolean;
  stripShellPunctuation(token: string): string;
  looksLikeCommandOrAssignment(token: string): boolean;
  hasCommandArgumentShape?: (content: string) => boolean;
};

type CharacterizationFixture = {
  entries: Array<{
    id: string;
    content: string;
    classification: ContextClassification;
    lossyCompressionAllowed: boolean;
  }>;
};

const require = createRequire(import.meta.url);
const ts = require("typescript");
const moduleWithNodePaths = Module as typeof Module & {
  _nodeModulePaths(from: string): string[];
};
const baseline = loadTestPolicy("tests/helpers/policy-baseline.ts");
const current = loadTestPolicy("src/core/policy.ts");
const baselineCommandArgument = readLegacyCommandArgumentPredicate("tests/helpers/policy-baseline.ts");
const currentCommandArgument = current.hasCommandArgumentShape
  ? current.hasCommandArgumentShape
  : readLegacyCommandArgumentPredicate("src/core/policy.ts");

function loadTestPolicy(sourceRelative: string): TestPolicyInternals {
  const root = process.cwd();
  const sourcePath = resolve(root, sourceRelative);
  const source = readFileSync(sourcePath, "utf8");
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hasCommandArgumentShape = file.statements.some(
    (statement: any) => ts.isFunctionDeclaration(statement) && statement.name?.text === "hasCommandArgumentShape",
  );
  const privateExports = [
    "EXACT_PATTERNS",
    "hasTechnicalTokenShape",
    "containsTechnicalTokenShape",
    "isShellCommandLine",
    "stripShellPunctuation",
    "looksLikeCommandOrAssignment",
  ];
  if (hasCommandArgumentShape) privateExports.push("hasCommandArgumentShape");
  const instrumented = `${source}\nexport { ${privateExports.join(", ")} };\n`;
  const js = ts.transpileModule(instrumented, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = new Module(sourcePath) as Module & { paths: string[]; _compile(text: string, filename: string): unknown };
  compiled.filename = sourcePath;
  compiled.paths = moduleWithNodePaths._nodeModulePaths(root);
  compiled._compile(js, sourcePath);
  return compiled.exports as unknown as TestPolicyInternals;
}

function readLegacyCommandArgumentPredicate(sourceRelative: string): RegExp {
  const sourcePath = resolve(process.cwd(), sourceRelative);
  const source = readFileSync(sourcePath, "utf8");
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const helper = file.statements.find(
    (statement: any) => ts.isFunctionDeclaration(statement) && statement.name?.text === "hasTechnicalTokenShape",
  );
  if (!helper?.body) throw new Error(`missing hasTechnicalTokenShape in ${sourceRelative}`);
  let commandArgument: any;
  const visit = (node: any): void => {
    if (ts.isArrayLiteralExpression(node)) commandArgument = node.elements[2];
    ts.forEachChild(node, visit);
  };
  visit(helper.body);
  if (!commandArgument || !ts.isRegularExpressionLiteral(commandArgument)) {
    throw new Error(`expected the original third helper predicate to remain a regex in ${sourceRelative}`);
  }
  return runInNewContext(commandArgument.getText(file)) as RegExp;
}

function predicateTest(predicate: PolicyPredicate, content: string): boolean {
  return typeof predicate === "function" ? predicate(content) : predicate.test(content);
}

function group4Inputs(): string[] {
  const inputs = new Set<string>([
    "",
    "npm",
    "npm.",
    "npm,",
    "npm;",
    "npm)",
    "(npm)",
    "('npm')",
    "\"npm\"",
    "`npm`",
    "npm).",
    "npm...x",
    "env npm test",
    "env FOO=bar npm test",
    "env --ignore-environment FOO=bar npm test",
    "env -i PATH=/usr/bin git status",
    "sudo -u root npm install",
    "sudo --user=alice node app.js",
    "doas -- git status",
    "doas -u root make test",
    "sudo",
    "sudo -u",
    "doas -- unknown",
    "NAME=value npm test",
    "NAME= npm test",
    "NAME=value unknown",
    "thing tool/ſ",
    "thing tool/K",
    "thing tool/λ",
    "thing NAME=ſ",
    "thing NAME=K",
    "thing NAME=λ",
    "thing tool/",
    "thing NAME=",
    "😀 thing tool/ſ",
    "xthing tool/ſ",
    "run npm test",
    "run very.long-command --flag=value",
    "foo apply",
    "foo upgrade",
    "foo chmod",
    "foo ./",
    "foo ../../",
    "foo C:\\",
    "echo hello",
    "printf hello",
    "curl https://example.test",
    "git status\r\nnpm test",
    "sudo\nnode app.js",
    "env\tFOO=bar\tgit status",
  ]);

  const punctuation = ["", "(", "'", "\"", "`", ")", "]", ".", ",", ";", ":", "'`)", "(\"'"];
  const commandWords = ["npm", "node", "git", "pnpm", "python", "make", "terraform", "unknown"];
  const separators = ["", " ", "\t", "\n"];
  const wrappers = ["", "(", "'", "\"", "`", "('", "\"("];
  const closers = ["", ")", "]", ",", ";", "'", "\"", "`", ").,", ".", ":"];
  for (const command of commandWords) {
    for (const wrapper of wrappers) {
      for (const closer of closers) {
        inputs.add(`${wrapper}${command}${closer}`);
        inputs.add(`env ${wrapper}${command}${closer} arg`);
        inputs.add(`sudo -u root ${wrapper}${command}${closer}`);
      }
    }
    for (const separator of separators) {
      inputs.add(`env${separator}FOO=bar${separator}${command}${separator}arg`);
      inputs.add(`sudo${separator}-u${separator}root${separator}${command}${separator}arg`);
      inputs.add(`doas${separator}--${separator}${command}`);
    }
  }

  const endings = ["/", "=", "/ſ", "/K", "/λ", "=ſ", "=K", "=λ", "/😀", "=😀"];
  for (const head of ["tool", "NAME", "foo.bar", "x-y"]) {
    for (const ending of endings) {
      inputs.add(`program ${head}${ending}`);
      inputs.add(`env ${head}${ending} command`);
    }
  }

  // Seeded token concatenations cover longer context without depending on ambient randomness.
  let seed = 0x4c0ffee;
  const pieces = [...punctuation, ...commandWords, ...separators, "env", "sudo", "doas", "-u", "--", "FOO=bar", "tool/ſ", "NAME=K", "apply", "unknown"];
  for (let sample = 0; sample < 300; sample += 1) {
    let input = "";
    const count = 18 + (sample % 32);
    for (let index = 0; index < count; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      input += pieces[seed % pieces.length];
    }
    inputs.add(input);
  }
  return [...inputs];
}

describe("policy ReDoS group 4 characterization", () => {
  it("keeps punctuation stripping identical to the frozen implementation", () => {
    const cases = [
      "npm",
      "('npm')",
      "\"`(npm),;\"`",
      "...npm...",
      ")".repeat(32),
      `npm${".".repeat(64)}x`,
      `("'${"`".repeat(16)}npm${")".repeat(16)}`,
      ".npm.",
      "npm.x",
      "npm/",
      "NAME=value)",
      "=", 
    ];
    for (const token of [...cases, ...group4Inputs()]) {
      expect(current.stripShellPunctuation(token), JSON.stringify(token)).toBe(
        baseline.stripShellPunctuation(token),
      );
    }
  });

  it("keeps the isolated private command-argument predicate equivalent to the frozen regex", () => {
    for (const input of group4Inputs()) {
      expect(predicateTest(currentCommandArgument, input), JSON.stringify(input)).toBe(
        predicateTest(baselineCommandArgument, input),
      );
    }
  });

  it("preserves /iu word-boundary behavior after slash and assignment alternatives", () => {
    const positives = ["program tool/ſ", "program tool/K", "program NAME=ſ", "program NAME=K"];
    const negatives = ["program tool/λ", "program NAME=λ", "program tool/", "program NAME="];
    for (const input of positives) expect(predicateTest(currentCommandArgument, input), input).toBe(true);
    for (const input of negatives) expect(predicateTest(currentCommandArgument, input), input).toBe(false);
  });

  it("preserves shell-command parsing and full classifications", () => {
    for (const input of group4Inputs()) {
      expect(current.isShellCommandLine(input), `shell ${JSON.stringify(input)}`).toBe(
        baseline.isShellCommandLine(input),
      );
      expect(current.looksLikeCommandOrAssignment(input), `token ${JSON.stringify(input)}`).toBe(
        baseline.looksLikeCommandOrAssignment(input),
      );
      expect(current.hasTechnicalTokenShape(input), `line ${JSON.stringify(input)}`).toBe(
        baseline.hasTechnicalTokenShape(input),
      );
      expect(current.containsTechnicalTokenShape(input), `content ${JSON.stringify(input)}`).toBe(
        baseline.containsTechnicalTokenShape(input),
      );
      expect(current.classifyContext(input), JSON.stringify(input)).toEqual(baseline.classifyContext(input));
    }

    const fixture = JSON.parse(
      readFileSync(resolve("tests/fixtures/policy/characterization.json"), "utf8"),
    ) as CharacterizationFixture;
    for (const entry of fixture.entries) {
      const actual = current.classifyContext(entry.content);
      expect(actual, entry.id).toEqual(entry.classification);
      expect(actual, `oracle ${entry.id}`).toEqual(baseline.classifyContext(entry.content));
      expect(current.lossyCompressionAllowed(actual), entry.id).toBe(entry.lossyCompressionAllowed);
    }
  });

  it("bounds punctuation stripping on long trailing punctuation followed by a non-punctuation", () => {
    const child = spawnSync(process.execPath, [
      "tests/helpers/policy-shell-perf-child.mjs",
      "src/core/policy.ts",
      "punctuation",
      "400000",
      "5",
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 5_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    expect(child.error?.message ?? "", child.stderr).toBe("");
    expect(child.status, child.stderr).toBe(0);
    const report = JSON.parse(child.stdout) as {
      utf16Length: number;
      samples: Array<{ elapsedNs: number; result: { length: number; prefix: string; suffix: string } }>;
    };
    expect(report.utf16Length).toBe(400_000);
    expect(report.samples).toHaveLength(5);
    expect(report.samples.every(({ result }) => result.length === 400_000 && result.prefix === "npm" && result.suffix === "x")).toBe(true);
    const times = report.samples.map(({ elapsedNs }) => elapsedNs).sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(500_000_000);
  });

  it("bounds the isolated command-argument predicate on repeated missing-whitespace candidates", () => {
    const child = spawnSync(process.execPath, [
      "tests/helpers/policy-shell-perf-child.mjs",
      "src/core/policy.ts",
      "commandArgument",
      "400000",
      "5",
    ], { cwd: process.cwd(), encoding: "utf8", timeout: 5_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    expect(child.error?.message ?? "", child.stderr).toBe("");
    expect(child.status, child.stderr).toBe(0);
    const report = JSON.parse(child.stdout) as { utf16Length: number; samples: Array<{ elapsedNs: number; result: boolean }> };
    expect(report.utf16Length).toBe(400_000);
    expect(report.samples).toHaveLength(5);
    expect(report.samples.every(({ result }) => result === false)).toBe(true);
    const times = report.samples.map(({ elapsedNs }) => elapsedNs).sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(500_000_000);
  });
});
