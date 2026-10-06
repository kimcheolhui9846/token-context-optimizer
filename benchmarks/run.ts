import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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

export interface TimedScenarioResult {
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

export interface SemanticDegradationFixture {
  name: string;
  source: string;
  requiredPhrases: string[];
}

export interface PreparedSemanticDegradationFixture {
  fixture: SemanticDegradationFixture;
  docPath: string;
  rawTokens: number;
}

const DEFAULT_LATENCY_SAMPLE_COUNT = 20;
const MINIMUM_REDUCTION_PERCENT = 25;
const MAXIMUM_SCENARIO_LATENCY_MS = 1000;

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

export async function runBenchmarkReport(
  input: {
    sampleCount?: number;
    scenarioRunners?: Array<() => Promise<TimedScenarioResult>>;
    tmpRoot?: string;
    warmupCount?: number;
  } = {},
): Promise<BenchmarkReport> {
  const dir = await mkdtemp(join(input.tmpRoot ?? tmpdir(), "tco-bench-"));

  try {
    const store = new MemoryArtifactStore();
    const scenarioRunners =
      input.scenarioRunners ??
      [
        await prepareBuildLogBenchmarkScenario({ dir, store }),
        await prepareSemanticDocumentBenchmarkScenario({ dir, store }),
        await prepareCodeContextBenchmarkScenario({ dir, store }),
      ];
    const results: ScenarioResult[] = [];
    for (const runOnce of scenarioRunners) {
      results.push(
        await runSampledScenario({
          runOnce,
          sampleCount: input.sampleCount,
          warmupCount: input.warmupCount,
        }),
      );
    }
    const failed = results.filter(benchmarkResultFailsGates);

    return {
      generatedAt: new Date().toISOString(),
      thresholds: {
        minimumReductionPercent: MINIMUM_REDUCTION_PERCENT,
        maximumScenarioLatencyMs: MAXIMUM_SCENARIO_LATENCY_MS,
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
  const measuredResults: TimedScenarioResult[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    latestResult = await input.runOnce();
    measuredResults.push(latestResult);
    latencySamples.push(latestResult.latencyMs);
  }

  if (latestResult === null) {
    throw new Error("benchmark scenario must run at least once");
  }

  return {
    ...summarizeMeasuredScenarioResults(measuredResults),
    ...summarizeLatencySamples(latencySamples),
  };
}

function summarizeMeasuredScenarioResults(results: TimedScenarioResult[]): TimedScenarioResult {
  if (results.length === 0) {
    throw new Error("latency samples must not be empty");
  }
  const latestResult = results[results.length - 1];
  return {
    ...latestResult,
    rawTokens: Math.min(...results.map((result) => result.rawTokens)),
    optimizedTokens: Math.max(...results.map((result) => result.optimizedTokens)),
    reductionPercent: Math.min(...results.map((result) => result.reductionPercent)),
    passedExactGate: results.every((result) => result.passedExactGate),
    taskGateRequired: results.some((result) => result.taskGateRequired),
    passedTaskGate: results.some((result) => result.taskGateRequired)
      ? results.every((result) => !result.taskGateRequired || result.passedTaskGate === true)
      : null,
    warnings: [...new Set(results.flatMap((result) => result.warnings))],
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

export function buildSemanticDegradationFixtures(): SemanticDegradationFixture[] {
  return [
    {
      name: "semantic success phrase",
      source: "Token efficiency depends on measured task success and careful source preservation.",
      requiredPhrases: ["Token efficiency depends on measured task success"],
    },
    {
      name: "numeric threshold preservation",
      source: "Reviewers approve launch only when latency stays below one thousand milliseconds.",
      requiredPhrases: ["latency", "below one thousand milliseconds"],
    },
    {
      name: "negation preservation",
      source: "Operators must not delete source excerpts during cleanup.",
      requiredPhrases: ["must not delete source excerpts"],
    },
    {
      name: "actor action preservation",
      source: "The shift captain updates the readiness notes before opening hour.",
      requiredPhrases: ["shift captain updates the readiness notes"],
    },
  ];
}

export function semanticSummaryPassesMeaningGate(
  summary: { fallbackReason: string | null; summary: string },
  fixture: SemanticDegradationFixture,
): boolean {
  return (
    summary.fallbackReason === null &&
    fixture.requiredPhrases.every((required) => summary.summary.includes(required))
  );
}

type SemanticSummarizer = (input: Parameters<typeof summarizeArtifact>[0]) => {
  fallbackReason: string | null;
  summary: string;
  estimatedTokens: number;
  warnings: string[];
};

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
  const preparedFixtures = await prepareSemanticDegradationFixtureDocuments(input.dir);

  return () =>
    runSemanticDegradationBenchmarkScenario({
      dir: input.dir,
      store: input.store,
      preparedFixtures,
    });
}

export async function runSemanticDegradationBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
  now?: () => number;
  preparedFixtures?: PreparedSemanticDegradationFixture[];
  summarize?: SemanticSummarizer;
}): Promise<TimedScenarioResult> {
  const now = input.now ?? (() => performance.now());
  const summarize = input.summarize ?? summarizeArtifact;
  const preparedFixtures =
    input.preparedFixtures ?? (await prepareSemanticDegradationFixtureDocuments(input.dir));
  const fixtureRuns: Array<{
    fixture: SemanticDegradationFixture;
    rawTokens: number;
    summary: ReturnType<SemanticSummarizer>;
    latencyMs: number;
  }> = [];
  for (const preparedFixture of preparedFixtures) {
    const fixtureStart = now();
    const docArtifact = await indexArtifact({
      path: preparedFixture.docPath,
      store: input.store,
      allowedRoots: [input.dir],
    });
    const summary = summarize({
      artifactId: docArtifact.artifactId,
      maxTokens: 120,
      store: input.store,
    });
    fixtureRuns.push({
      fixture: preparedFixture.fixture,
      rawTokens: preparedFixture.rawTokens,
      summary,
      latencyMs: roundLatencyMs(now() - fixtureStart),
    });
  }
  const docLatencyMs = Math.max(...fixtureRuns.map((fixtureRun) => fixtureRun.latencyMs));
  const rawTokens = fixtureRuns.reduce((sum, fixtureRun) => sum + fixtureRun.rawTokens, 0) * 10;
  const optimizedTokens =
    fixtureRuns.reduce((sum, fixtureRun) => sum + fixtureRun.summary.estimatedTokens, 0) * 10;

  return {
    // Repeating identical phrases tests prefix retention only; it is not broad
    // semantic preservation evidence or representative compression behavior.
    name: "repeated semantic prefix phrase-retention smoke",
    rawTokens,
    optimizedTokens,
    reductionPercent: percentReduction(rawTokens, optimizedTokens),
    passedExactGate: fixtureRuns.every((fixtureRun) =>
      semanticSummaryPassesMeaningGate(fixtureRun.summary, fixtureRun.fixture),
    ),
    taskGateRequired: false,
    passedTaskGate: null,
    latencyMs: docLatencyMs,
    profileVersion: "heuristic-v1",
    warnings: fixtureRuns.flatMap((fixtureRun) => fixtureRun.summary.warnings),
  };
}

async function prepareSemanticDegradationFixtureDocuments(
  dir: string,
): Promise<PreparedSemanticDegradationFixture[]> {
  const preparedFixtures = [];
  for (const [index, fixture] of buildSemanticDegradationFixtures().entries()) {
    const doc = Array.from({ length: 80 }, () => fixture.source).join("\n");
    const docPath = join(dir, `semantic-${index}.md`);
    await writeFile(docPath, doc, "utf8");
    preparedFixtures.push({
      fixture,
      docPath,
      rawTokens: estimateTextTokens(doc),
    });
  }
  return preparedFixtures;
}

export function benchmarkResultFailsGates(result: ScenarioResult): boolean {
  return (
    !result.passedExactGate ||
    (result.taskGateRequired && result.passedTaskGate !== true) ||
    result.reductionPercent < MINIMUM_REDUCTION_PERCENT ||
    result.p95LatencyMs > MAXIMUM_SCENARIO_LATENCY_MS ||
    (result.name === "25K-style build log exact retrieval" && result.rawTokens < 25_000)
  );
}

export interface CodeContextFixture {
  source: string;
  expectedExcerpt: string;
  expectedSourceMap: {
    path: string;
    startLine: number;
    endLine: number;
    startByte: number;
    endByte: number;
    completeSpan: true;
  };
  distractorExcerpt: string;
  distractorSourceMap: CodeContextFixture["expectedSourceMap"];
}

const CODE_CONTEXT_EXPECTED_LINES = [
  "tests/input.test.ts",
  'it("rejects negative input and preserves zero", () => {',
  '  expect(() => parseInput(-1)).toThrow("ERR_INVALID_INPUT");',
  "});",
  "Command: npm test",
  "AssertionError: expected the function to throw ERR_INVALID_INPUT",
  "Observed failure: negative input did not throw; zero remains unchanged.",
  "src/input.ts",
  "export function parseInput(value: number): number {",
  "  return value;",
  "}",
  "The failing test and implementation are adjacent in this fixture.",
  "The observed failure is reproducible with the listed test command.",
];

const CODE_CONTEXT_DISTRACTOR_LINES = [
  "tests/amount.test.ts",
  'it("rejects negative amount and preserves zero", () => {',
  '  expect(() => parseAmount(-1)).toThrow("ERR_INVALID_INPUT");',
  "});",
  "Command: npm test",
  "AssertionError: expected the function to throw ERR_INVALID_INPUT",
  "Observed failure: negative amount did not throw; zero remains unchanged.",
  "src/amount.ts",
  "export function parseAmount(value: number): number {",
  "  return value;",
  "}",
  "The failing test and implementation are adjacent in this fixture.",
  "The observed failure is reproducible with the listed test command.",
];

export function buildCodeContextQuery(): string {
  return "negative input did not throw zero remains unchanged expected function to throw npm test";
}

export function buildCodeContextFixture(
  minimumTokens: number,
  sourcePath = "code-context-fixture.txt",
): CodeContextFixture {
  const lines = [
    "Code context retrieval fixture",
    "Repository context: a small TypeScript project with related input helpers.",
  ];
  let index = 0;
  while (estimateTextTokens(lines.join("\n")) < minimumTokens) {
    lines.push(
      "context note " + index + ": nearby declarations, comments, and tests provide surrounding source context for inspection.",
    );
    index += 1;
  }

  const prefix = lines.join("\n") + "\n";
  const expectedExcerpt = CODE_CONTEXT_EXPECTED_LINES.join("\n");
  const separator = "\n\nRelated implementation with a similar test symptom:\n";
  const distractorExcerpt = CODE_CONTEXT_DISTRACTOR_LINES.join("\n");
  const source = prefix + distractorExcerpt + separator + expectedExcerpt;
  const expectedStart = source.indexOf(expectedExcerpt);
  const expectedPrefix = source.slice(0, expectedStart);
  const expectedStartByte = Buffer.byteLength(expectedPrefix, "utf8");
  const expectedEndByte = expectedStartByte + Buffer.byteLength(expectedExcerpt, "utf8");
  const expectedStartLine = expectedPrefix.split("\n").length;
  const distractorStart = source.indexOf(distractorExcerpt);
  const distractorStartByte = Buffer.byteLength(source.slice(0, distractorStart), "utf8");
  const distractorStartLine = source.slice(0, distractorStart).split("\n").length;

  return {
    source,
    expectedExcerpt,
    expectedSourceMap: {
      path: sourcePath,
      startLine: expectedStartLine,
      endLine: expectedStartLine + CODE_CONTEXT_EXPECTED_LINES.length - 1,
      startByte: expectedStartByte,
      endByte: expectedEndByte,
      completeSpan: true,
    },
    distractorExcerpt,
    distractorSourceMap: {
      path: sourcePath,
      startLine: distractorStartLine,
      endLine: distractorStartLine + CODE_CONTEXT_DISTRACTOR_LINES.length - 1,
      startByte: distractorStartByte,
      endByte: distractorStartByte + Buffer.byteLength(distractorExcerpt, "utf8"),
      completeSpan: true,
    },
  };
}

export async function runCodeContextBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
  now?: () => number;
}): Promise<TimedScenarioResult> {
  const fixturePath = join(input.dir, "code-context-fixture.txt");
  const sourcePath = join(await realpath(input.dir), "code-context-fixture.txt");
  const fixture = buildCodeContextFixture(8_000, sourcePath);
  await writeFile(fixturePath, fixture.source, "utf8");
  return runPreparedCodeContextBenchmarkScenario({ ...input, fixture, fixturePath });
}

async function runPreparedCodeContextBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
  now?: () => number;
  fixture: CodeContextFixture;
  fixturePath: string;
}): Promise<TimedScenarioResult> {
  const fixtureTokens = estimateTextTokens(input.fixture.source);
  const now = input.now ?? (() => performance.now());
  const startedAt = now();
  const artifact = await indexArtifact({
    path: input.fixturePath,
    store: input.store,
    allowedRoots: [input.dir],
  });
  const query = queryArtifact({
    artifactId: artifact.artifactId,
    query: buildCodeContextQuery(),
    maxTokens: 240,
    contextLines: 6,
    store: input.store,
  });

  return {
    name: "code context fixture source-backed retrieval",
    rawTokens: fixtureTokens,
    optimizedTokens: query.estimatedTokens,
    reductionPercent: percentReduction(fixtureTokens, query.estimatedTokens),
    passedExactGate: codeQueryPassesExactGate(input.fixture, query),
    taskGateRequired: false,
    passedTaskGate: null,
    latencyMs: roundLatencyMs(now() - startedAt),
    profileVersion: "heuristic-v1",
    warnings: query.warnings,
  };
}

async function prepareCodeContextBenchmarkScenario(input: {
  dir: string;
  store: MemoryArtifactStore;
}): Promise<() => Promise<TimedScenarioResult>> {
  const fixturePath = join(input.dir, "code-context-fixture.txt");
  const sourcePath = join(await realpath(input.dir), "code-context-fixture.txt");
  const fixture = buildCodeContextFixture(8_000, sourcePath);
  await writeFile(fixturePath, fixture.source, "utf8");
  return () =>
    runPreparedCodeContextBenchmarkScenario({ ...input, fixture, fixturePath });
}

export function codeQueryPassesExactGate(
  fixture: CodeContextFixture,
  query: ReturnType<typeof queryArtifact>,
): boolean {
  if (query.fallbackReason !== null || query.excerpts.length !== 1) {
    return false;
  }

  const excerpt = query.excerpts[0];
  const fixtureBuffer = Buffer.from(fixture.source, "utf8");
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
    excerpt.sourceMap.path === fixture.expectedSourceMap.path &&
    excerpt.sourceMap.startLine === fixture.expectedSourceMap.startLine &&
    excerpt.sourceMap.endLine === fixture.expectedSourceMap.endLine &&
    startByte === fixture.expectedSourceMap.startByte &&
    endByte === fixture.expectedSourceMap.endByte &&
    excerpt.text === fixture.expectedExcerpt &&
    fixtureBuffer.subarray(startByte, endByte).toString("utf8") === excerpt.text
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
