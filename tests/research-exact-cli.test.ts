import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprintDataset } from "../src/research/scoring.js";

const datasetPath = resolve("docs/research/datasets/development-seed.json");
const datasetSha256 = "c29ea2176fa160732dd74ad8b4ae0ae5e547eaaa427a6e165ba0759444d55c35";
const responseText = "src/cache.ts:17:4 ERR_CACHE_MISS";
const responseSha256 = createHash("sha256").update(responseText).digest("hex");
const invalid = (code: string) => ({
  datasetSha256: null,
  responseSha256: null,
  checkVersion: null,
  passed: null,
  codes: [code],
});

function envelope(patch: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    datasetSha256,
    taskId: "cache-location-en",
    responseText,
    ...patch,
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

describe("registered exact check CLI", () => {
  let root: string;
  let cli: string;
  let envelopePath: string;
  const exec = promisify(execFile);

  beforeAll(async () => {
    await mkdir(resolve(".artifacts"), { recursive: true });
    root = await mkdtemp(join(resolve(".artifacts"), "exact-cli-test-"));
    await mkdir(join(root, "scripts"));
    cli = join(root, "scripts", "check-exact.mjs");
    envelopePath = join(root, "response.json");
    await copyFile(resolve("scripts/check-exact.mjs"), cli);
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

  async function invokeWith(datasetFile: string, response: unknown) {
    await writeFile(envelopePath, JSON.stringify(response));
    return invoke([datasetFile, envelopePath]);
  }

  it("reports a correct response through the real compiled entrypoint", async () => {
    const result = await invokeWith(datasetPath, envelope());
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      datasetSha256,
      responseSha256,
      checkVersion: "seed-cache-location-v1",
      passed: true,
      codes: [],
    });
    expect(result.stderr).toBe("");
  });

  it("returns exit zero for a valid response mismatch", async () => {
    const wrong = "src/cache.ts:18:4 ERR_CACHE_MISS";
    const result = await invokeWith(datasetPath, envelope({ responseText: wrong }));
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      datasetSha256,
      responseSha256: createHash("sha256").update(wrong).digest("hex"),
      checkVersion: "seed-cache-location-v1",
      passed: false,
      codes: ["response_mismatch"],
    });
    expect(result.stderr).toBe("");
  });

  it("forwards invalid, unknown, fingerprint, and registry-drift results", async () => {
    const malformed = await invokeWith(datasetPath, {});
    expect(malformed.code).toBe(1);
    expect(JSON.parse(malformed.stdout)).toEqual(invalid("invalid_input"));

    const unknown = await invokeWith(datasetPath, envelope({ taskId: "missing" }));
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.stdout)).toEqual(invalid("unsupported_task"));

    const fingerprintMismatch = await invokeWith(datasetPath, envelope({ datasetSha256: "0".repeat(64) }));
    expect(fingerprintMismatch.code).toBe(1);
    expect(JSON.parse(fingerprintMismatch.stdout)).toEqual(invalid("dataset_fingerprint_mismatch"));

    const drifted = JSON.parse(readFileSync(datasetPath, "utf8"));
    const task = drifted.records.find((item: { id: string }) => item.id === "cache-location-en");
    task.answerKey = "private-drift-canary";
    const driftedPath = join(root, "drifted.json");
    await writeFile(driftedPath, JSON.stringify(drifted));
    const result = await invokeWith(driftedPath, envelope({ datasetSha256: fingerprintDataset(drifted) }));
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(invalid("registry_drift"));
    expect(result.stdout + result.stderr).not.toContain("private-drift-canary");
  });

  it("does not alter either input file", async () => {
    await writeFile(envelopePath, JSON.stringify(envelope()));
    const datasetBefore = await readFile(datasetPath);
    const envelopeBefore = await readFile(envelopePath);
    const result = await invoke([datasetPath, envelopePath]);
    expect(result.code).toBe(0);
    expect(await readFile(datasetPath)).toEqual(datasetBefore);
    expect(await readFile(envelopePath)).toEqual(envelopeBefore);
  });

  it("does not disclose valid or invalid input values and paths", async () => {
    const validPath = join(root, "private-valid-response-path-canary.json");
    await writeFile(validPath, JSON.stringify(envelope({ responseText: "private-valid-value-canary" })));
    const valid = await invoke([datasetPath, validPath]);
    expect(valid.code).toBe(0);
    expect(valid.stdout + valid.stderr).not.toContain("private-");

    const invalidPath = join(root, "private-invalid-response-path-canary.json");
    await writeFile(invalidPath, '{"private-invalid-value-canary":');
    const malformed = await invoke([datasetPath, invalidPath]);
    expect(malformed.code).toBe(1);
    expect(JSON.parse(malformed.stdout)).toEqual(invalid("invalid_input"));
    expect(malformed.stdout + malformed.stderr).not.toContain("private-");

    const unreadable = await invoke([datasetPath, join(root, "private-missing-path-canary")]);
    expect(unreadable.code).toBe(1);
    expect(JSON.parse(unreadable.stdout)).toEqual(invalid("invalid_input"));
    expect(unreadable.stdout + unreadable.stderr).not.toContain("private-");
  });

  it.each([
    ["dataset raw", "dataset", '"schemaVersion":1,"schemaVersion":1'],
    ["dataset escaped", "dataset", '"schemaVersion":1,"schema\\u0056ersion":1'],
    ["envelope raw", "envelope", '"taskId":"private-duplicate-canary","taskId":"cache-location-en"'],
    ["envelope escaped", "envelope", '"taskId":"private-duplicate-canary","task\\u0049d":"cache-location-en"'],
  ])("rejects %s duplicate JSON keys", async (_name, target, duplicate) => {
    const datasetText = JSON.stringify(JSON.parse(readFileSync(datasetPath, "utf8")));
    const envelopeText = JSON.stringify(envelope());
    const localDatasetPath = join(root, `duplicate-dataset-${target}-${_name}.json`);
    const localEnvelopePath = join(root, `duplicate-envelope-${target}-${_name}.json`);
    await writeFile(localDatasetPath, target === "dataset"
      ? datasetText.replace('"schemaVersion":1', duplicate)
      : datasetText);
    await writeFile(localEnvelopePath, target === "envelope"
      ? envelopeText.replace('"taskId":"cache-location-en"', duplicate)
      : envelopeText);
    const result = await invoke([localDatasetPath, localEnvelopePath]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(invalid("invalid_input"));
    expect(result.stdout + result.stderr).not.toContain("private-duplicate-canary");
  });

  it("rejects malformed UTF-8 inside an otherwise-valid response envelope", async () => {
    const marker = "MALFORMED_UTF8_ENVELOPE_MARKER";
    const localEnvelopePath = join(root, "malformed-utf8-envelope.json");
    const malformedBytes = replaceMarkerWithMalformedUtf8(
      JSON.stringify(envelope({ responseText: `prefix-${marker}-suffix` })),
      marker,
    );
    await writeFile(localEnvelopePath, malformedBytes);
    const result = await invoke([datasetPath, localEnvelopePath]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(invalid("invalid_input"));
  });

  it("rejects malformed UTF-8 inside an otherwise-valid unrelated dataset field", async () => {
    const marker = "MALFORMED_UTF8_DATASET_MARKER";
    const data = JSON.parse(readFileSync(datasetPath, "utf8"));
    const unrelated = data.records.find((item: { category: string }) => item.category !== "exact");
    unrelated.source.provenance = `prefix-${marker}-suffix`;
    const malformedBytes = replaceMarkerWithMalformedUtf8(JSON.stringify(data), marker);
    const lossyDataset = JSON.parse(new TextDecoder("utf-8").decode(malformedBytes));
    const localDatasetPath = join(root, "malformed-utf8-dataset.json");
    await writeFile(localDatasetPath, malformedBytes);

    const result = await invokeWith(localDatasetPath, envelope({ datasetSha256: fingerprintDataset(lossyDataset) }));
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(invalid("invalid_input"));
  });

  it.each(["dataset", "envelope"])("preserves and rejects a BOM in the %s file", async (target) => {
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);
    const datasetBytes = await readFile(datasetPath);
    const envelopeBytes = Buffer.from(JSON.stringify(envelope()));
    const localDatasetPath = join(root, `bom-${target}-dataset.json`);
    const localEnvelopePath = join(root, `bom-${target}-envelope.json`);
    await writeFile(localDatasetPath, target === "dataset" ? Buffer.concat([bom, datasetBytes]) : datasetBytes);
    await writeFile(localEnvelopePath, target === "envelope" ? Buffer.concat([bom, envelopeBytes]) : envelopeBytes);
    const result = await invoke([localDatasetPath, localEnvelopePath]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(invalid("invalid_input"));
  });

  it("rejects a decoded lone surrogate", async () => {
    const result = await invokeWith(datasetPath, envelope({ responseText: "\uD800" }));
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(invalid("invalid_input"));
  });

  it("enforces the response UTF-8 byte cap", async () => {
    const atLimit = await invokeWith(datasetPath, envelope({ responseText: "a".repeat(65_536) }));
    expect(atLimit.code).toBe(0);
    expect(JSON.parse(atLimit.stdout)).toMatchObject({ passed: false, codes: ["response_mismatch"] });

    const overLimit = await invokeWith(datasetPath, envelope({ responseText: "a".repeat(65_537) }));
    expect(overLimit.code).toBe(1);
    expect(JSON.parse(overLimit.stdout)).toEqual(invalid("invalid_input"));
  });

  it.each([
    [],
    ["one"],
    ["one", "two", "three"],
    [" ", "two"],
    ["one", "\t"],
  ])("rejects arguments that are not two nonblank paths: %j", async (...args: string[]) => {
    const result = await invoke(args);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(invalid("usage"));
  });
});
