import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MemoryArtifactStore,
  indexArtifact,
  queryArtifact,
  summarizeArtifact,
} from "../src/core/artifacts.js";
import { estimateTextTokens } from "../src/core/token-estimator.js";

interface ScenarioResult {
  name: string;
  rawTokens: number;
  optimizedTokens: number;
  reductionPercent: number;
  passedExactGate: boolean;
  passedTaskGate?: boolean;
  latencyMs: number;
  profileVersion: string;
  warnings: string[];
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "tco-bench-"));
  const results: ScenarioResult[] = [];

  const buildLog = buildLargeBuildLog(25_000);
  const buildLogTokens = estimateTextTokens(buildLog);
  const buildLogPath = join(dir, "build.log");
  await writeFile(buildLogPath, buildLog, "utf8");
  const store = new MemoryArtifactStore();
  const buildStart = performance.now();
  const artifact = await indexArtifact({ path: buildLogPath, store, allowedRoots: [dir] });
  const query = queryArtifact({
    artifactId: artifact.artifactId,
    query: "TS2304 missingValue src/index.ts",
    maxTokens: 80,
    contextLines: 1,
    store,
  });
  const buildLatencyMs = Math.round((performance.now() - buildStart) * 100) / 100;
  results.push({
    name: "25K-style build log exact retrieval",
    rawTokens: buildLogTokens,
    optimizedTokens: query.estimatedTokens,
    reductionPercent: percentReduction(buildLogTokens, query.estimatedTokens),
    passedExactGate:
      query.excerpts.length === 1 &&
      query.excerpts[0].text.includes("src/index.ts:12:5") &&
      query.excerpts[0].text.includes("TS2304") &&
      query.excerpts[0].text.includes("Cannot find name 'missingValue'."),
    latencyMs: buildLatencyMs,
    profileVersion: "heuristic-v1",
    warnings: query.warnings,
  });

  const doc = Array.from(
    { length: 80 },
    () => "Token efficiency depends on measured task success and careful source preservation.",
  ).join("\n");
  const docPath = join(dir, "notes.md");
  await writeFile(docPath, doc, "utf8");
  const docStart = performance.now();
  const docArtifact = await indexArtifact({ path: docPath, store, allowedRoots: [dir] });
  const summary = summarizeArtifact({
    artifactId: docArtifact.artifactId,
    maxTokens: 120,
    store,
  });
  const docLatencyMs = Math.round((performance.now() - docStart) * 100) / 100;
  results.push({
    name: "repeated semantic document extractive summary",
    rawTokens: estimateTextTokens(doc) * 10,
    optimizedTokens: summary.estimatedTokens * 10,
    reductionPercent: percentReduction(estimateTextTokens(doc) * 10, summary.estimatedTokens * 10),
    passedExactGate:
      summary.fallbackReason === null &&
      summary.summary.includes("Token efficiency depends on measured task success"),
    latencyMs: docLatencyMs,
    profileVersion: "heuristic-v1",
    warnings: summary.warnings,
  });

  const codeFixture = buildCodeEditingFixture(8_000);
  const codeFixtureTokens = estimateTextTokens(codeFixture);
  const codeFixturePath = join(dir, "code-editing-fixture.txt");
  await writeFile(codeFixturePath, codeFixture, "utf8");
  const codeStart = performance.now();
  const codeArtifact = await indexArtifact({
    path: codeFixturePath,
    store,
    allowedRoots: [dir],
  });
  const codeQuery = queryArtifact({
    artifactId: codeArtifact.artifactId,
    query:
      "tests/math.test.ts src/math.ts ERR_NEGATIVE_INPUT rejects negative input npm test",
    maxTokens: 180,
    contextLines: 6,
    store,
  });
  const brokenSource = [
    "export function normalizeInput(value: number): number {",
    "  return value;",
    "}",
  ].join("\n");
  const stalePatch = applyCodeEditingExcerpt(brokenSource, "stale excerpt");
  const retrievedPatch = applyCodeEditingExcerpt(
    brokenSource,
    codeQuery.excerpts[0]?.text ?? "",
  );
  const codeLatencyMs = Math.round((performance.now() - codeStart) * 100) / 100;
  results.push({
    name: "code editing fixture source-backed retrieval",
    rawTokens: codeFixtureTokens,
    optimizedTokens: codeQuery.estimatedTokens,
    reductionPercent: percentReduction(codeFixtureTokens, codeQuery.estimatedTokens),
    passedExactGate: codeQueryPassesExactGate(codeFixture, codeQuery),
    passedTaskGate:
      !runCodeEditingFixtureTests(brokenSource).passed &&
      !stalePatch.patched &&
      retrievedPatch.patched &&
      runCodeEditingFixtureTests(retrievedPatch.source).passed,
    latencyMs: codeLatencyMs,
    profileVersion: "heuristic-v1",
    warnings: codeQuery.warnings,
  });

  const failed = results.filter(
    (result) =>
      !result.passedExactGate ||
      result.passedTaskGate === false ||
      result.reductionPercent < 25 ||
      result.latencyMs > 1000 ||
      (result.name === "25K-style build log exact retrieval" && result.rawTokens < 25_000),
  );

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        thresholds: {
          minimumReductionPercent: 25,
          maximumScenarioLatencyMs: 1000,
          exactGateRequired: true,
        },
        results,
        passed: failed.length === 0,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function percentReduction(rawTokens: number, optimizedTokens: number): number {
  if (rawTokens === 0) {
    return 0;
  }
  return Math.round((1 - optimizedTokens / rawTokens) * 1000) / 10;
}

function buildLargeBuildLog(minimumTokens: number): string {
  const lines = ["Compiling workspace"];
  let index = 0;
  while (estimateTextTokens(lines.join("\n")) < minimumTokens) {
    lines.push(`info line ${index}: cache hit for package token-context-optimizer`);
    index += 1;
  }
  lines.push("src/index.ts:12:5 - error TS2304");
  lines.push("Cannot find name 'missingValue'.");
  return lines.join("\n");
}

function buildCodeEditingFixture(minimumTokens: number): string {
  const lines = [
    "Code editing fixture context",
    "Repository: token-context-optimizer",
    "Task: apply the retrieved exact source-backed edit and then run npm test.",
  ];
  let index = 0;
  while (estimateTextTokens(lines.join("\n")) < minimumTokens) {
    lines.push(
      `context note ${index}: preserve file paths, test names, command text, and exact error identifiers when preparing code edits.`,
    );
    index += 1;
  }
  lines.push(
    [
      "EDIT_TARGET tests/math.test.ts src/math.ts ERR_NEGATIVE_INPUT npm test",
      "Failing test: rejects negative input without throwing away zero.",
      "Replace src/math.ts implementation with:",
      "export function normalizeInput(value: number): number {",
      '  if (value < 0) throw new Error("ERR_NEGATIVE_INPUT");',
      "  return value;",
      "}",
    ].join("\n"),
  );
  return lines.join("\n");
}

function codeQueryPassesExactGate(
  fixture: string,
  query: ReturnType<typeof queryArtifact>,
): boolean {
  if (query.fallbackReason !== null || query.excerpts.length !== 1) {
    return false;
  }

  const excerpt = query.excerpts[0];
  const requiredStrings = [
    "tests/math.test.ts",
    "src/math.ts",
    "ERR_NEGATIVE_INPUT",
    "rejects negative input without throwing away zero",
    "npm test",
  ];

  return (
    excerpt.sourceMap.completeSpan &&
    requiredStrings.every((required) => excerpt.text.includes(required)) &&
    fixture.slice(excerpt.sourceMap.startByte, excerpt.sourceMap.endByte) === excerpt.text
  );
}

function applyCodeEditingExcerpt(
  source: string,
  excerpt: string,
): { source: string; patched: boolean } {
  const replacement = [
    "export function normalizeInput(value: number): number {",
    '  if (value < 0) throw new Error("ERR_NEGATIVE_INPUT");',
    "  return value;",
    "}",
  ].join("\n");
  if (
    !excerpt.includes("src/math.ts") ||
    !excerpt.includes("export function normalizeInput(value: number): number {") ||
    !excerpt.includes("ERR_NEGATIVE_INPUT") ||
    !excerpt.includes('throw new Error("ERR_NEGATIVE_INPUT")')
  ) {
    return { source, patched: false };
  }

  return {
    source: source.replace(
      /export function normalizeInput\(value: number\): number \{\n  return value;\n\}/u,
      replacement,
    ),
    patched: true,
  };
}

function runCodeEditingFixtureTests(source: string): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  let normalizeInput: (value: number) => number;

  try {
    normalizeInput = compileNormalizeInput(source);
  } catch (error) {
    return { passed: false, failures: [`compile failed: ${String(error)}`] };
  }

  try {
    normalizeInput(-1);
    failures.push("negative input did not throw");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ERR_NEGATIVE_INPUT") {
      failures.push("negative input threw the wrong error");
    }
  }

  if (normalizeInput(0) !== 0) {
    failures.push("zero input was not preserved");
  }
  if (normalizeInput(7) !== 7) {
    failures.push("positive input was not preserved");
  }

  return { passed: failures.length === 0, failures };
}

function compileNormalizeInput(source: string): (value: number) => number {
  const javaScriptSource = source.replace(
    "export function normalizeInput(value: number): number",
    "function normalizeInput(value)",
  );
  const factory = new Function(`${javaScriptSource}\nreturn normalizeInput;`);
  const candidate = factory();
  if (typeof candidate !== "function") {
    throw new Error("normalizeInput was not compiled");
  }
  return candidate as (value: number) => number;
}

await main();
