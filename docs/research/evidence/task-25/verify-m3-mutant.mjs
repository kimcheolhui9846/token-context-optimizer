import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const policyPath = resolve(root, "src/core/policy.ts");
const source = readFileSync(policyPath, "utf8");
const helperStart = source.indexOf("function hasDottedTokenShape");
const helperEnd = source.indexOf("\nfunction hasKnownFilename", helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error("could not isolate hasDottedTokenShape");

const helper = source.slice(helperStart, helperEnd);
const mutation = "index += char.length;";
if (helper.split(mutation).length - 1 !== 1) {
  throw new Error("expected exactly one target advance in hasDottedTokenShape");
}
const mutatedHelper = helper.replace(mutation, "index += 1;");
const mutant = source.slice(0, helperStart) + mutatedHelper + source.slice(helperEnd);
const tempPolicyPath = resolve(tmpdir(), "task25-m3-mutant-" + process.pid + ".ts");
const tempTestPath = resolve(root, "tests/policy-redos-group2-m3-" + process.pid + ".test.ts");
let createdPolicy = false;
let createdTest = false;

try {
  writeFileSync(tempPolicyPath, mutant, { flag: "wx" });
  createdPolicy = true;
  const test = readFileSync(resolve(root, "tests/policy-redos-group2.test.ts"), "utf8");
  const currentSource = 'const current = loadPolicyInternals("src/core/policy.ts");';
  if (test.split(currentSource).length - 1 !== 1) {
    throw new Error("expected one production source loader in group 2 test");
  }
  writeFileSync(
    tempTestPath,
    test.replace(currentSource, "const current = loadPolicyInternals(" + JSON.stringify(tempPolicyPath) + ");"),
    { flag: "wx" },
  );
  createdTest = true;

  const vitestCli = resolve(root, "node_modules/vitest/vitest.mjs");
  const command = [process.execPath, vitestCli, "run", "tests/" + basename(tempTestPath)];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
    timeout: 45_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  const output = (result.stdout || "") + (result.stderr || "");
  const expectedFailure =
    result.status !== 0 &&
    !result.error &&
    output.includes("FAIL  tests/" + basename(tempTestPath) + " > policy ReDoS group 2 characterization > keeps rule 6 equivalent on astral-letter dotted-token boundaries") &&
    output.includes("expected false to be true");
  if (!expectedFailure) throw new Error("M3 differential did not fail as expected:\n" + output);

  const report = {
    phase: "isolated M3 mutation verification",
    measuredAt: new Date().toISOString(),
    node: process.version,
    gitHead: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).stdout.trim(),
    mutation: {
      target: "hasDottedTokenShape",
      replacement: "index += char.length; -> index += 1;",
      replacementsInTargetHelper: 1,
      productionSourceWritten: false,
    },
    command: command.join(" "),
    result: {
      expected: "Vitest exits nonzero on the direct rule 6 differential assertion",
      exitCode: result.status,
      signal: result.signal,
      timeout: false,
      output,
    },
    witnesses: [
      "a\u{1D400}.ts",
      "ab\u{1D400}.ts",
      "a\u{10400}b.md",
    ],
    firstWitnessFailure: { witness: "a\u{1D400}.ts", expected: true, received: false },
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    mutantSha256: createHash("sha256").update(mutant).digest("hex"),
  };
  writeFileSync(
    resolve(root, "docs/research/evidence/task-25/m3-mutant-verification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  process.stdout.write(JSON.stringify({ exitCode: result.status, detected: true }));
} finally {
  if (createdTest) rmSync(tempTestPath);
  if (createdPolicy) rmSync(tempPolicyPath);
}
