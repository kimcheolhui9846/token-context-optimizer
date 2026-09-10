import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprintDataset } from "../src/research/scoring.js";

const datasetPath = resolve("docs/research/datasets/development-seed.json");
const demoConfigPath = resolve("docs/research/datasets/run-plan-demo.json");
const invalid = (code: "usage" | "invalid_input") => ({ valid: false, code });

function execution() {
  return {
    provider: "synthetic",
    modelSnapshot: "private-model-canary",
    endpoint: "responses",
    tokenizerId: "synthetic-tokenizer",
    tokenizerVersion: "1",
    priceVersion: "synthetic-price",
    inputTokenLimit: 100,
    outputTokenLimit: 20,
    requestTimeoutMs: 1000,
    runTimeoutMs: 10000,
    spendCapMicrousd: 1000000,
    concurrency: 1,
    automaticRetries: 0,
    decodingSha256: "a".repeat(64),
  };
}

function replaceMarkerWithMalformedUtf8(source: string, marker: string) {
  const bytes = Buffer.from(source);
  const markerIndex = bytes.indexOf(marker);
  if (markerIndex === -1) throw new Error("missing malformed UTF-8 marker");
  return Buffer.concat([
    bytes.subarray(0, markerIndex),
    Buffer.from([0xc3, 0x28]),
    bytes.subarray(markerIndex + Buffer.byteLength(marker)),
  ]);
}

describe("research run planning CLI", () => {
  let root: string;
  let cli: string;
  const exec = promisify(execFile);

  beforeAll(async () => {
    await mkdir(resolve(".artifacts"), { recursive: true });
    root = await mkdtemp(join(resolve(".artifacts"), "run-plan-cli-test-"));
    await mkdir(join(root, "scripts"));
    cli = join(root, "scripts", "plan-research.mjs");
    await copyFile(resolve("scripts/plan-research.mjs"), cli);
    await copyFile(resolve("scripts/plugin-runtime.mjs"), join(root, "scripts", "plugin-runtime.mjs"));
    await exec(process.execPath, [
      resolve("node_modules/typescript/bin/tsc"),
      "-p",
      resolve("tsconfig.json"),
      "--outDir",
      join(root, "dist"),
    ]);
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function invoke(args: string[]) {
    try {
      return { ...(await exec(process.execPath, [cli, ...args])), code: 0 };
    } catch (error) {
      const result = error as { stdout: string; stderr: string; code: number };
      return { stdout: result.stdout, stderr: result.stderr, code: result.code };
    }
  }

  async function writeConfig(name: string, value: unknown) {
    const path = join(root, name);
    await writeFile(path, JSON.stringify(value));
    return path;
  }

  it("emits the exact valid seed preview deterministically through the compiled entrypoint", async () => {
    const first = await invoke([datasetPath, demoConfigPath]);
    const second = await invoke([datasetPath, demoConfigPath]);

    expect(first.code).toBe(0);
    expect(first.stderr).toBe("");
    expect(second).toEqual(first);
    const envelope = JSON.parse(first.stdout);
    expect(first.stdout).toBe(JSON.stringify(envelope) + "\n");
    expect(Object.keys(envelope)).toEqual(["valid", "report"]);
    expect(envelope.valid).toBe(true);
    expect(Object.keys(envelope.report)).toEqual(["manifest", "slots", "preflight"]);
    expect(envelope.report.manifest).toEqual({
      schemaVersion: 1,
      datasetSha256: "c29ea2176fa160732dd74ad8b4ae0ae5e547eaaa427a6e165ba0759444d55c35",
      configSha256: "6b8ed9251fd73d5581d2b3665445f3a1787e354e3d98064baaf0c6214ce2d511",
      scheduleSha256: "819521b9b9eb23e2966493df7768133f3b75055266405619fdc7956d910d64aa",
      manifestSha256: "b0383f51bf3214683702919b73f41ae0b7c522d0a94ee671c07d550745da6767",
    });
    expect(envelope.report.slots).toHaveLength(288);
    expect(envelope.report.slots[0]).toEqual({
      ordinal: 1,
      familyId: "pressure-alarm",
      taskId: "pressure-alarm-en",
      language: "en",
      category: "causal",
      arm: "gold_reference",
      attempt: 1,
    });
    expect(envelope.report.slots.at(-1)).toEqual({
      ordinal: 288,
      familyId: "delivery-delay",
      taskId: "delivery-delay-ko",
      language: "ko",
      category: "causal",
      arm: "optimized",
      attempt: 3,
    });
    expect(envelope.report.preflight).toEqual({
      configurationComplete: false,
      pilotStructureSatisfied: false,
      evidenceReferencesPresent: false,
      preflightPassed: false,
      dispatchAllowed: false,
      issues: [
        { code: "missing_evidence_reference", path: "evidence" },
        { code: "pilot_structure", path: "dataset.pilotStructure" },
        { code: "unresolved_execution", path: "execution" },
      ],
    });
  });

  it("does not alter either input file", async () => {
    const datasetBefore = await readFile(datasetPath);
    const configBefore = await readFile(demoConfigPath);
    const result = await invoke([datasetPath, demoConfigPath]);
    expect(result.code).toBe(0);
    expect(await readFile(datasetPath)).toEqual(datasetBefore);
    expect(await readFile(demoConfigPath)).toEqual(configBefore);
  });

  it.each([
    [],
    ["one"],
    ["one", "two", "three"],
    [" ", "two"],
    ["one", "\t"],
  ])("rejects arguments that are not two nonblank paths: %j", async (...args: string[]) => {
    const result = await invoke(args);
    expect(result).toEqual({ stdout: JSON.stringify(invalid("usage")) + "\n", stderr: "", code: 1 });
  });

  it.each(["dataset", "configuration"])("collapses an unreadable %s path", async target => {
    const missing = join(root, `private-missing-${target}-path-canary.json`);
    const result = await invoke(target === "dataset" ? [missing, demoConfigPath] : [datasetPath, missing]);
    expect(result).toEqual({ stdout: JSON.stringify(invalid("invalid_input")) + "\n", stderr: "", code: 1 });
    expect(result.stdout + result.stderr).not.toContain("private-");
  });

  it.each(["dataset", "configuration"])("collapses malformed JSON in the %s file", async target => {
    const malformedPath = join(root, `private-malformed-${target}-path-canary.json`);
    await writeFile(malformedPath, '{"private-malformed-value-canary":');
    const result = await invoke(target === "dataset"
      ? [malformedPath, demoConfigPath]
      : [datasetPath, malformedPath]);
    expect(result).toEqual({ stdout: JSON.stringify(invalid("invalid_input")) + "\n", stderr: "", code: 1 });
    expect(result.stdout + result.stderr).not.toContain("private-");
  });

  it.each([
    ["dataset raw", "dataset", '"source":{"text":"private-duplicate-canary","text":'],
    ["dataset escaped", "dataset", '"source":{"text":"private-duplicate-canary","te\\u0078t":'],
    ["configuration raw", "configuration", '"execution":{"provider":"private-duplicate-canary","provider":'],
    ["configuration escaped", "configuration", '"execution":{"provider":"private-duplicate-canary","pro\\u0076ider":'],
  ])("rejects nested %s duplicate JSON keys", async (_name, target, replacement) => {
    const datasetText = JSON.stringify(JSON.parse(readFileSync(datasetPath, "utf8")));
    const config = JSON.parse(readFileSync(demoConfigPath, "utf8"));
    config.execution = execution();
    const configText = JSON.stringify(config);
    const localDatasetPath = join(root, `duplicate-${_name}-dataset.json`);
    const localConfigPath = join(root, `duplicate-${_name}-configuration.json`);
    await writeFile(localDatasetPath, target === "dataset"
      ? datasetText.replace('"source":{"text":', replacement)
      : datasetText);
    await writeFile(localConfigPath, target === "configuration"
      ? configText.replace('"execution":{"provider":', replacement)
      : configText);
    const result = await invoke([localDatasetPath, localConfigPath]);
    expect(result).toEqual({ stdout: JSON.stringify(invalid("invalid_input")) + "\n", stderr: "", code: 1 });
    expect(result.stdout + result.stderr).not.toContain("private-duplicate-canary");
  });

  it("rejects malformed UTF-8 inside an otherwise-valid dataset", async () => {
    const marker = "MALFORMED_UTF8_DATASET_MARKER";
    const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
    dataset.records[0].source.provenance = `prefix-${marker}-suffix`;
    const malformedBytes = replaceMarkerWithMalformedUtf8(JSON.stringify(dataset), marker);
    const lossyDataset = JSON.parse(new TextDecoder("utf-8").decode(malformedBytes));
    const config = JSON.parse(readFileSync(demoConfigPath, "utf8"));
    config.datasetSha256 = fingerprintDataset(lossyDataset);
    const localDatasetPath = join(root, "malformed-utf8-dataset.json");
    await writeFile(localDatasetPath, malformedBytes);
    const localConfigPath = await writeConfig("malformed-utf8-dataset-config.json", config);

    const result = await invoke([localDatasetPath, localConfigPath]);
    expect(result).toEqual({ stdout: JSON.stringify(invalid("invalid_input")) + "\n", stderr: "", code: 1 });
  });

  it("rejects malformed UTF-8 inside an otherwise-valid configuration", async () => {
    const marker = "MALFORMED_UTF8_CONFIG_MARKER";
    const config = JSON.parse(readFileSync(demoConfigPath, "utf8"));
    config.execution = { ...execution(), modelSnapshot: `prefix-${marker}-suffix` };
    const malformedBytes = replaceMarkerWithMalformedUtf8(JSON.stringify(config), marker);
    const localConfigPath = join(root, "malformed-utf8-configuration.json");
    await writeFile(localConfigPath, malformedBytes);

    const result = await invoke([datasetPath, localConfigPath]);
    expect(result).toEqual({ stdout: JSON.stringify(invalid("invalid_input")) + "\n", stderr: "", code: 1 });
  });

  it("collapses malformed configuration and fingerprint mismatch without disclosure", async () => {
    const malformedPath = await writeConfig("private-invalid-config-path-canary.json", {
      ...JSON.parse(readFileSync(demoConfigPath, "utf8")),
      private_key: "private-invalid-config-value-canary",
    });
    const mismatchPath = await writeConfig("private-mismatch-config-path-canary.json", {
      ...JSON.parse(readFileSync(demoConfigPath, "utf8")),
      datasetSha256: "0".repeat(64),
    });

    for (const path of [malformedPath, mismatchPath]) {
      const result = await invoke([datasetPath, path]);
      expect(result).toEqual({ stdout: JSON.stringify(invalid("invalid_input")) + "\n", stderr: "", code: 1 });
      expect(result.stdout + result.stderr).not.toContain("private-");
      expect(result.stdout + result.stderr).not.toContain("dataset_fingerprint_mismatch");
    }
  });
});
