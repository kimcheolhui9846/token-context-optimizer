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

  const failed = results.filter(
    (result) =>
      !result.passedExactGate ||
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

await main();
