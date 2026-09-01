import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  MemoryArtifactStore,
  indexArtifact,
  queryArtifact,
  summarizeArtifact,
} from "../src/core/artifacts.js";
import { estimateTextTokens } from "../src/core/token-estimator.js";

export interface ScenarioResult {
  name: string;
  rawTokens: number;
  optimizedTokens: number;
  reductionPercent: number;
  passedExactGate: boolean;
  taskGateRequired: boolean;
  passedTaskGate: boolean | null;
  latencyMs: number;
  sampleCount: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  profileVersion: string;
  warnings: string[];
}

export interface BenchmarkReport {
  generatedAt: string;
  thresholds: {
    minimumReductionPercent: number;
    maximumScenarioLatencyMs: number;
    exactGateRequired: boolean;
  };
  results: ScenarioResult[];
  passed: boolean;
}

interface TimedScenarioResult {
  name: string;
  rawTokens: number;
  optimizedTokens: number;
  reductionPercent: number;
  passedExactGate: boolean;
  taskGateRequired: boolean;
  passedTaskGate: boolean | null;
  latencyMs: number;
  profileVersion: string;
  warnings: string[];
}

const DEFAULT_LATENCY_SAMPLE_COUNT = 20;

async function main(): Promise<void> {
  const report = await runBenchmarkReport();

  console.log(
    JSON.stringify(
      report,
      null,
      2,
    ),
  );

  if (!report.passed) {
    process.exitCode = 1;
  }
}

export async function runBenchmarkReport(input: { tmpRoot?: string } = {}): Promise<BenchmarkReport> {
  const dir = await mkdtemp(join(input.tmpRoot ?? tmpdir(), "tco-bench-"));

  try {
    const store = new MemoryArtifactStore();
    const buildLogScenario = await prepareBuildLogBenchmarkScenario({ dir, store });
    const semanticDocumentScenario = await prepareSemanticDocumentBenchmarkScenario({ dir, store });
    const codeEditingScenario = await prepareCodeEditingBenchmarkScenario({ dir, store });
    const results: ScenarioResult[] = [
      await runSampledScenario({
        runOnce: buildLogScenario,
      }),
      await runSampledScenario({
        runOnce: semanticDocumentScenario,
      }),
      await runSampledScenario({
        runOnce: codeEditingScenario,
      }),
    ];
    const failed = results.filter(benchmarkResultFailsGates);

    return {
      generatedAt: new Date().toISOString(),
      thresholds: {
        minimumReductionPercent: 25,
        maximumScenarioLatencyMs: 1000,
        exactGateRequired: true,
      },
      results,
      passed: failed.length === 0,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function percentReduction(rawTokens: number, optimizedTokens: number): number {
  if (rawTokens === 0) {
    return 0;
  }
  return Math.round((1 - optimizedTokens / rawTokens) * 1000) / 10;
}

function roundLatencyMs(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nearestRankPercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    throw new Error("latency samples must not be empty");
  }
  if (values.some((value) => value < 0)) {
    throw new Error("latency samples must not be negative");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(percentile * sorted.length)));
  return sorted[rank - 1];
}

export function summarizeLatencySamples(samples: number[]): {
  sampleCount: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  latencyMs: number;
} {
  if (samples.some((sample) => sample < 0)) {
    throw new Error("latency samples must not be negative");
  }
  const medianLatencyMs = roundLatencyMs(nearestRankPercentile(samples, 0.5));
  const p95LatencyMs = roundLatencyMs(nearestRankPercentile(samples, 0.95));
  return {
    sampleCount: samples.length,
    medianLatencyMs,
    p95LatencyMs,
    latencyMs: medianLatencyMs,
  };
}

export async function runSampledScenario(input: {
  runOnce: () => Promise<TimedScenarioResult>;
  sampleCount?: number;
  warmupCount?: number;
}): Promise<ScenarioResult> {
  const sampleCount = input.sampleCount ?? DEFAULT_LATENCY_SAMPLE_COUNT;
  const warmupCount = input.warmupCount ?? 1;
  let latestResult: TimedScenarioResult | null = null;

  for (let index = 0; index < warmupCount; index += 1) {
    latestResult = await input.runOnce();
  }

  const latencySamples: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    latestResult = await input.runOnce();
    latencySamples.push(latestResult.latencyMs);
  }

  if (latestResult === null) {
    throw new Error("benchmark scenario must run at least once");
  }

  return {
    ...latestResult,
    ...summarizeLatencySamples(latencySamples),
  };
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

async function prepareBuildLogBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
}): Promise<() => Promise<TimedScenarioResult>> {
  const buildLog = buildLargeBuildLog(25_000);
  const buildLogTokens = estimateTextTokens(buildLog);
  const buildLogPath = join(input.dir, "build.log");
  await writeFile(buildLogPath, buildLog, "utf8");

  return () =>
    runBuildLogBenchmarkScenario({
      dir: input.dir,
      store: input.store,
      buildLogTokens,
      buildLogPath,
    });
}

async function runBuildLogBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
  buildLogTokens: number;
  buildLogPath: string;
}): Promise<TimedScenarioResult> {
  const buildStart = performance.now();
  const artifact = await indexArtifact({
    path: input.buildLogPath,
    store: input.store,
    allowedRoots: [input.dir],
  });
  const query = queryArtifact({
    artifactId: artifact.artifactId,
    query: "TS2304 missingValue src/index.ts",
    maxTokens: 80,
    contextLines: 1,
    store: input.store,
  });
  const buildLatencyMs = roundLatencyMs(performance.now() - buildStart);

  return {
    name: "25K-style build log exact retrieval",
    rawTokens: input.buildLogTokens,
    optimizedTokens: query.estimatedTokens,
    reductionPercent: percentReduction(input.buildLogTokens, query.estimatedTokens),
    passedExactGate:
      query.excerpts.length === 1 &&
      query.excerpts[0].text.includes("src/index.ts:12:5") &&
      query.excerpts[0].text.includes("TS2304") &&
      query.excerpts[0].text.includes("Cannot find name 'missingValue'."),
    taskGateRequired: false,
    passedTaskGate: null,
    latencyMs: buildLatencyMs,
    profileVersion: "heuristic-v1",
    warnings: query.warnings,
  };
}

async function prepareSemanticDocumentBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
}): Promise<() => Promise<TimedScenarioResult>> {
  const doc = Array.from(
    { length: 80 },
    () => "Token efficiency depends on measured task success and careful source preservation.",
  ).join("\n");
  const docTokens = estimateTextTokens(doc);
  const docPath = join(input.dir, "notes.md");
  await writeFile(docPath, doc, "utf8");

  return () =>
    runSemanticDocumentBenchmarkScenario({
      dir: input.dir,
      store: input.store,
      docTokens,
      docPath,
    });
}

async function runSemanticDocumentBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
  docTokens: number;
  docPath: string;
}): Promise<TimedScenarioResult> {
  const docStart = performance.now();
  const docArtifact = await indexArtifact({
    path: input.docPath,
    store: input.store,
    allowedRoots: [input.dir],
  });
  const summary = summarizeArtifact({
    artifactId: docArtifact.artifactId,
    maxTokens: 120,
    store: input.store,
  });
  const docLatencyMs = roundLatencyMs(performance.now() - docStart);

  return {
    name: "repeated semantic document extractive summary",
    rawTokens: input.docTokens * 10,
    optimizedTokens: summary.estimatedTokens * 10,
    reductionPercent: percentReduction(input.docTokens * 10, summary.estimatedTokens * 10),
    passedExactGate:
      summary.fallbackReason === null &&
      summary.summary.includes("Token efficiency depends on measured task success"),
    taskGateRequired: false,
    passedTaskGate: null,
    latencyMs: docLatencyMs,
    profileVersion: "heuristic-v1",
    warnings: summary.warnings,
  };
}

export function benchmarkResultFailsGates(result: ScenarioResult): boolean {
  return (
    !result.passedExactGate ||
    (result.taskGateRequired && result.passedTaskGate !== true) ||
    result.reductionPercent < 25 ||
    result.p95LatencyMs > 1000 ||
    (result.name === "25K-style build log exact retrieval" && result.rawTokens < 25_000)
  );
}

export async function runCodeEditingBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
  now?: () => number;
  runTests?: typeof runCodeEditingFixtureTests;
}): Promise<TimedScenarioResult> {
  const codeFixture = buildCodeEditingFixture(8_000);
  const codeFixtureTokens = estimateTextTokens(codeFixture);
  const codeFixturePath = join(input.dir, "code-editing-fixture.txt");
  await writeFile(codeFixturePath, codeFixture, "utf8");
  return runPreparedCodeEditingBenchmarkScenario({
    codeFixture,
    codeFixturePath,
    codeFixtureTokens,
    dir: input.dir,
    now: input.now,
    runTests: input.runTests,
    store: input.store,
  });
}

async function prepareCodeEditingBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
}): Promise<() => Promise<TimedScenarioResult>> {
  const codeFixture = buildCodeEditingFixture(8_000);
  const codeFixtureTokens = estimateTextTokens(codeFixture);
  const codeFixturePath = join(input.dir, "code-editing-fixture.txt");
  await writeFile(codeFixturePath, codeFixture, "utf8");

  return () =>
    runPreparedCodeEditingBenchmarkScenario({
      codeFixture,
      codeFixturePath,
      codeFixtureTokens,
      dir: input.dir,
      store: input.store,
    });
}

async function runPreparedCodeEditingBenchmarkScenario(input: {
  codeFixture: string;
  codeFixturePath: string;
  codeFixtureTokens: number;
  dir: string;
  store: MemoryArtifactStore;
  now?: () => number;
  runTests?: typeof runCodeEditingFixtureTests;
}): Promise<TimedScenarioResult> {
  const now = input.now ?? (() => performance.now());
  const runTests = input.runTests ?? runCodeEditingFixtureTests;
  const codeStart = now();
  const codeArtifact = await indexArtifact({
    path: input.codeFixturePath,
    store: input.store,
    allowedRoots: [input.dir],
  });
  const codeQuery = queryArtifact({
    artifactId: codeArtifact.artifactId,
    query:
      "tests/math.test.ts src/math.ts ERR_NEGATIVE_INPUT rejects negative input npm test",
    maxTokens: 240,
    contextLines: 6,
    store: input.store,
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
  const brokenResult = runTests(brokenSource);
  const staleResult = runTests(stalePatch.source);
  const retrievedResult = runTests(retrievedPatch.source);
  const codeLatencyMs = Math.round((now() - codeStart) * 100) / 100;

  return {
    name: "code editing fixture source-backed retrieval",
    rawTokens: input.codeFixtureTokens,
    optimizedTokens: codeQuery.estimatedTokens,
    reductionPercent: percentReduction(input.codeFixtureTokens, codeQuery.estimatedTokens),
    passedExactGate: codeQueryPassesExactGate(input.codeFixture, codeQuery),
    taskGateRequired: true,
    passedTaskGate:
      !brokenResult.passed &&
      !stalePatch.patched &&
      !staleResult.passed &&
      retrievedPatch.patched &&
      retrievedResult.passed,
    latencyMs: codeLatencyMs,
    profileVersion: "heuristic-v1",
    warnings: codeQuery.warnings,
  };
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

export function codeQueryPassesExactGate(
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
    "export function normalizeInput(value: number): number {",
    'throw new Error("ERR_NEGATIVE_INPUT")',
  ];
  const fixtureBuffer = Buffer.from(fixture, "utf8");
  const { startByte, endByte } = excerpt.sourceMap;

  if (
    !Number.isInteger(startByte) ||
    !Number.isInteger(endByte) ||
    startByte < 0 ||
    startByte >= endByte ||
    endByte > fixtureBuffer.length
  ) {
    return false;
  }

  return (
    excerpt.sourceMap.completeSpan &&
    requiredStrings.every((required) => excerpt.text.includes(required)) &&
    fixtureBuffer.subarray(startByte, endByte).toString("utf8") === excerpt.text
  );
}

export function applyCodeEditingExcerpt(
  source: string,
  excerpt: string,
): { source: string; patched: boolean } {
  const replacement = extractNormalizeInputImplementation(excerpt);
  if (!excerpt.includes("src/math.ts") || replacement === null) {
    return { source, patched: false };
  }

  const patchedSource = source.replace(
    /export function normalizeInput\(value: number\): number \{\n  return value;\n\}/u,
    replacement,
  );
  return {
    source: patchedSource,
    patched: patchedSource !== source,
  };
}

export function runCodeEditingFixtureTests(source: string): { passed: boolean; failures: string[] } {
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

  try {
    if (normalizeInput(0) !== 0) {
      failures.push("zero input was not preserved");
    }
  } catch {
    failures.push("zero input threw unexpectedly");
  }
  try {
    if (normalizeInput(7) !== 7) {
      failures.push("positive input was not preserved");
    }
  } catch {
    failures.push("positive input threw unexpectedly");
  }

  return { passed: failures.length === 0, failures };
}

function extractNormalizeInputImplementation(excerpt: string): string | null {
  const normalized = excerpt.replace(/\r\n?/gu, "\n");
  const match = normalized.match(
    /export function normalizeInput\(value: number\): number \{\n[\s\S]*?\n\}/u,
  );
  if (!match || !match[0].includes("ERR_NEGATIVE_INPUT")) {
    return null;
  }
  return match[0];
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
