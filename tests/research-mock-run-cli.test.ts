import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, posix, resolve, win32 } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareResearchRun } from "../src/research/run-plan.js";
import { fingerprintDataset } from "../src/research/scoring.js";

const invalid = (code: "usage" | "invalid_input") => ({ valid: false, code });
const temporaryRootPrefix = "mock-research-cli-test-";

function isOwnedTemporaryRoot(candidate: string, artifacts: string): boolean {
  const path = candidate.includes("\\") || artifacts.includes("\\") ? win32 : posix;
  return path.dirname(candidate) === artifacts && path.basename(candidate).startsWith(temporaryRootPrefix);
}

function execution(modelSnapshot = "private-model-canary") {
  return {
    provider: "synthetic",
    modelSnapshot,
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

function fixture() {
  const dataset = JSON.parse(readFileSync("docs/research/datasets/format-demo.json", "utf8"));
  const configuration = {
    schemaVersion: 1,
    runId: "synthetic-preview",
    datasetSha256: "cc2ccec43f9a00db51c87ec433acae512c25f5727da0ee6902abc521f63abe85",
    split: "development",
    arms: ["full_source", "optimized", "fixed_chunk", "gold_reference"],
    attemptsPerTask: 3,
    scheduleAlgorithm: "sha256-rank-v1",
    seed: "0".repeat(64),
    execution: null,
    evidence: null,
  };
  const scenario = {
    schemaVersion: 1,
    kind: "research_mock_scenario",
    manifestSha256: "278ebbe7955c47bebd3a0d972da8fd5aa49994c5474272bbd2b5021392f0fc00",
    limits: {
      requestTimeoutMs: 10,
      runTimeoutMs: 100,
      spendCapMicrousd: 100,
      concurrency: 1,
      automaticRetries: 0,
    },
    outcomes: Array.from({ length: 12 }, (_, index) => ({
      ordinal: index + 1,
      status: "completed",
      durationMs: 1,
      reservedCostMicrousd: 10,
      settledCostMicrousd: 4,
    })),
  };
  return { dataset, configuration, scenario };
}

function replaceMarkerWithMalformedUtf8(source: string, marker: string) {
  const bytes = Buffer.from(source);
  const offset = bytes.indexOf(marker);
  if (offset < 0) throw new Error("missing_utf8_marker");
  return Buffer.concat([
    bytes.subarray(0, offset),
    Buffer.from([0xc3, 0x28]),
    bytes.subarray(offset + Buffer.byteLength(marker)),
  ]);
}

it.each([
  ["POSIX child", "/repo/.artifacts/mock-research-cli-test-abc123", "/repo/.artifacts", true],
  ["Windows child", String.raw`C:\repo\.artifacts\mock-research-cli-test-abc123`, String.raw`C:\repo\.artifacts`, true],
  ["outside root", "/repo/elsewhere/mock-research-cli-test-abc123", "/repo/.artifacts", false],
  ["sibling root", "/repo/.artifacts-sibling/mock-research-cli-test-abc123", "/repo/.artifacts", false],
  ["wrong prefix", "/repo/.artifacts/other-test-abc123", "/repo/.artifacts", false],
] as const)("recognizes only owned temporary roots for %s", (_name, candidate, artifacts, expected) => {
  expect(isOwnedTemporaryRoot(candidate, artifacts)).toBe(expected);
});

describe("research mock run CLI", () => {
  let root: string;
  let cli: string;
  let datasetPath: string;
  let configurationPath: string;
  let scenarioPath: string;
  const exec = promisify(execFile);

  beforeAll(async () => {
    await mkdir(resolve(".artifacts"), { recursive: true });
    root = await mkdtemp(join(resolve(".artifacts"), "mock-research-cli-test-"));
    await mkdir(join(root, "scripts"));
    cli = join(root, "scripts", "mock-research.mjs");
    await copyFile(resolve("scripts/mock-research.mjs"), cli);
    await copyFile(resolve("scripts/plugin-runtime.mjs"), join(root, "scripts", "plugin-runtime.mjs"));
    await exec(process.execPath, [
      resolve("node_modules/typescript/bin/tsc"),
      "-p",
      resolve("tsconfig.json"),
      "--outDir",
      join(root, "dist"),
    ]);

    const { dataset, configuration, scenario } = fixture();
    datasetPath = await writeJson("dataset.json", dataset);
    configurationPath = await writeJson("configuration.json", configuration);
    scenarioPath = await writeJson("scenario.json", scenario);
  });

  afterAll(async () => {
    const artifacts = resolve(".artifacts");
    if (root && isOwnedTemporaryRoot(resolve(root), artifacts)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function invoke(args: string[]) {
    try {
      return { ...(await exec(process.execPath, [cli, ...args])), code: 0 };
    } catch (error) {
      const result = error as { stdout: string; stderr: string; code: number };
      return { stdout: result.stdout, stderr: result.stderr, code: result.code };
    }
  }

  async function writeJson(name: string, value: unknown) {
    const path = join(root, name);
    await writeFile(path, JSON.stringify(value));
    return path;
  }

  async function expectInvalid(args: string[]) {
    const result = await invoke(args);
    expect(result).toEqual({ stdout: JSON.stringify(invalid("invalid_input")) + "\n", stderr: "", code: 1 });
    expect(result.stdout + result.stderr).not.toContain("private-");
  }

  it("emits the exact compact successful envelope through the isolated compiled entrypoint", async () => {
    const result = await invoke([datasetPath, configurationPath, scenarioPath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);
    expect(result.stdout).toBe(JSON.stringify(envelope) + "\n");
    expect(Object.keys(envelope)).toEqual(["valid", "report"]);
    expect(envelope.valid).toBe(true);
    expect(envelope.report.summary).toMatchObject({
      stopReason: "schedule_exhausted",
      plannedSlots: 12,
      startedSlots: 12,
      virtualElapsedMs: 12,
      settledCostMicrousd: 48,
    });
  });

  it.each([
    [],
    ["one"],
    ["one", "two"],
    ["one", "two", "three", "four"],
    [" ", "two", "three"],
    ["one", "\t", "three"],
    ["one", "two", "\r\n"],
  ])("rejects arguments that are not three nonblank paths: %j", async (...args: string[]) => {
    expect(await invoke(args)).toEqual({
      stdout: JSON.stringify(invalid("usage")) + "\n",
      stderr: "",
      code: 1,
    });
  });

  it.each(["dataset", "configuration", "scenario"] as const)("collapses an unreadable %s path", async target => {
    const paths = [datasetPath, configurationPath, scenarioPath];
    paths[{ dataset: 0, configuration: 1, scenario: 2 }[target]] = join(root, `private-missing-${target}-canary.json`);
    await expectInvalid(paths);
  });

  it.each(["dataset", "configuration", "scenario"] as const)("collapses malformed JSON in the %s", async target => {
    const malformed = join(root, `private-malformed-${target}-canary.json`);
    await writeFile(malformed, '{"private-malformed-value-canary":');
    const paths = [datasetPath, configurationPath, scenarioPath];
    paths[{ dataset: 0, configuration: 1, scenario: 2 }[target]] = malformed;
    await expectInvalid(paths);
  });

  it.each([
    ["dataset raw", "dataset", '"source":{"text":"private-duplicate-canary","text":'],
    ["dataset escaped", "dataset", '"source":{"text":"private-duplicate-canary","te\\u0078t":'],
    ["configuration raw", "configuration", '"execution":{"provider":"private-duplicate-canary","provider":'],
    ["configuration escaped", "configuration", '"execution":{"provider":"private-duplicate-canary","pro\\u0076ider":'],
    ["scenario raw", "scenario", '"limits":{"requestTimeoutMs":10,"requestTimeoutMs":'],
    ["scenario escaped", "scenario", '"limits":{"requestTimeoutMs":10,"requestTimeout\\u004ds":'],
  ] as const)("rejects nested duplicate keys in the %s", async (_name, target, replacement) => {
    const { dataset, configuration, scenario } = fixture();
    configuration.execution = execution() as never;
    const source = {
      dataset: JSON.stringify(dataset),
      configuration: JSON.stringify(configuration),
      scenario: JSON.stringify(scenario),
    }[target];
    const marker = {
      dataset: '"source":{"text":',
      configuration: '"execution":{"provider":',
      scenario: '"limits":{"requestTimeoutMs":',
    }[target];
    const duplicate = source.replace(marker, replacement);
    expect(duplicate).not.toBe(source);
    const path = join(root, `private-duplicate-${_name.replace(" ", "-")}-canary.json`);
    await writeFile(path, duplicate);
    const paths = [datasetPath, configurationPath, scenarioPath];
    paths[{ dataset: 0, configuration: 1, scenario: 2 }[target]] = path;
    await expectInvalid(paths);
  });

  it.each(["dataset", "configuration", "scenario"] as const)("collapses invalid %s schema", async target => {
    const { dataset, configuration, scenario } = fixture();
    const invalidValues = {
      dataset: { ...dataset, private_invalid_dataset_canary: true },
      configuration: { ...configuration, private_invalid_configuration_canary: true },
      scenario: { ...scenario, private_invalid_scenario_canary: true },
    };
    const path = await writeJson(`private-invalid-${target}-canary.json`, invalidValues[target]);
    const paths = [datasetPath, configurationPath, scenarioPath];
    paths[{ dataset: 0, configuration: 1, scenario: 2 }[target]] = path;
    await expectInvalid(paths);
  });

  it.each(["dataset", "configuration", "scenario"] as const)("rejects a UTF-8 BOM in the %s", async target => {
    const source = await readFile({ dataset: datasetPath, configuration: configurationPath, scenario: scenarioPath }[target]);
    const path = join(root, `private-bom-${target}-canary.json`);
    await writeFile(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), source]));
    const paths = [datasetPath, configurationPath, scenarioPath];
    paths[{ dataset: 0, configuration: 1, scenario: 2 }[target]] = path;
    await expectInvalid(paths);
  });

  it("rejects malformed UTF-8 in a dataset after proving the lossy-decoded control is otherwise valid", async () => {
    const { dataset, configuration, scenario } = fixture();
    dataset.records[0].question = "utf8-marker";
    const malformed = replaceMarkerWithMalformedUtf8(JSON.stringify(dataset), "utf8-marker");
    const lossyControl = JSON.parse(malformed.toString("utf8"));
    configuration.datasetSha256 = fingerprintDataset(lossyControl);
    scenario.manifestSha256 = prepareResearchRun(lossyControl, configuration).manifest.manifestSha256;
    const controlDatasetPath = await writeJson("lossy-control-dataset.json", lossyControl);
    const controlConfigurationPath = await writeJson("lossy-control-dataset-configuration.json", configuration);
    const controlScenarioPath = await writeJson("lossy-control-dataset-scenario.json", scenario);
    expect((await invoke([controlDatasetPath, controlConfigurationPath, controlScenarioPath])).code).toBe(0);

    const malformedPath = join(root, "private-malformed-utf8-dataset-canary.json");
    await writeFile(malformedPath, malformed);
    await expectInvalid([malformedPath, controlConfigurationPath, controlScenarioPath]);
  });

  it("rejects malformed UTF-8 in configuration after proving the lossy-decoded control is otherwise valid", async () => {
    const { dataset, configuration, scenario } = fixture();
    configuration.execution = execution("utf8-marker") as never;
    const malformed = replaceMarkerWithMalformedUtf8(JSON.stringify(configuration), "utf8-marker");
    const lossyControl = JSON.parse(malformed.toString("utf8"));
    scenario.manifestSha256 = prepareResearchRun(dataset, lossyControl).manifest.manifestSha256;
    const controlConfigurationPath = await writeJson("lossy-control-configuration.json", lossyControl);
    const controlScenarioPath = await writeJson("lossy-control-configuration-scenario.json", scenario);
    expect((await invoke([datasetPath, controlConfigurationPath, controlScenarioPath])).code).toBe(0);

    const malformedPath = join(root, "private-malformed-utf8-configuration-canary.json");
    await writeFile(malformedPath, malformed);
    await expectInvalid([datasetPath, malformedPath, controlScenarioPath]);
  });

  it("rejects malformed UTF-8 in scenario without treating schema failure as decoder isolation", async () => {
    const { scenario } = fixture();
    scenario.kind = "utf8-marker";
    const malformed = replaceMarkerWithMalformedUtf8(JSON.stringify(scenario), "utf8-marker");
    const path = join(root, "private-malformed-utf8-scenario-canary.json");
    await writeFile(path, malformed);
    await expectInvalid([datasetPath, configurationPath, path]);
  });

  it.each(["manifest mismatch", "missing outcome", "duplicate outcome", "out-of-plan outcome"] as const)(
    "collapses %s to invalid_input",
    async mode => {
      const { scenario } = fixture();
      if (mode === "manifest mismatch") scenario.manifestSha256 = "a".repeat(64);
      if (mode === "missing outcome") scenario.outcomes.pop();
      if (mode === "duplicate outcome") scenario.outcomes[11].ordinal = 11;
      if (mode === "out-of-plan outcome") scenario.outcomes[11].ordinal = 13;
      const path = await writeJson(`private-${mode.replaceAll(" ", "-")}-canary.json`, scenario);
      await expectInvalid([datasetPath, configurationPath, path]);
    },
  );

  it("returns a stopped request timeout report as a successful process", async () => {
    const { scenario } = fixture();
    scenario.outcomes[0].durationMs = 11;
    const path = await writeJson("request-timeout-scenario.json", scenario);
    const result = await invoke([datasetPath, configurationPath, path]);
    const envelope = JSON.parse(result.stdout);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(envelope.valid).toBe(true);
    expect(envelope.report.summary).toMatchObject({
      termination: "stopped",
      stopReason: "request_timeout",
      startedSlots: 1,
      notStartedSlots: 11,
      timeoutSlots: 1,
    });
  });

  it("preserves all input bytes for successful and rejected invocations", async () => {
    const successPaths = [datasetPath, configurationPath, scenarioPath];
    const successBefore = await Promise.all(successPaths.map(path => readFile(path)));
    expect((await invoke(successPaths)).code).toBe(0);
    expect(await Promise.all(successPaths.map(path => readFile(path)))).toEqual(successBefore);

    const { scenario } = fixture();
    scenario.manifestSha256 = "f".repeat(64);
    const rejectedScenarioPath = await writeJson("private-preservation-rejected-canary.json", scenario);
    const rejectedPaths = [datasetPath, configurationPath, rejectedScenarioPath];
    const rejectedBefore = await Promise.all(rejectedPaths.map(path => readFile(path)));
    await expectInvalid(rejectedPaths);
    expect(await Promise.all(rejectedPaths.map(path => readFile(path)))).toEqual(rejectedBefore);
  });
});
