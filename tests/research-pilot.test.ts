import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditPilotDataset } from "../src/research/pilot.js";
import { fingerprintDataset } from "../src/research/scoring.js";

const categories = ["numeric", "negation", "actor_action", "causal", "temporal", "exact"];
function record(index: number, category = "numeric", split = "development", language = "en") {
  const text = `Synthetic source ${index}.`;
  return { id: `task-${index}-${language}`, familyId: `family-${index}`, split, language, category,
    source: { text, sha256: createHash("sha256").update(text).digest("hex"), provenance: "Synthetic test", license: "CC0-1.0" },
    question: "What does the source say?", answerKey: text, requiredFacts: [text],
    prohibitedContradictions: ["The opposite of the source."], acceptableParaphrases: [],
    rubric: category === "exact" ? { kind: "exact", instructions: "Compare exact bytes.", hiddenCheckId: "synthetic-only" } : { kind: "semantic", instructions: "Preserve the required fact." },
  };
}
function manifest(records = [record(0)]) { return { schemaVersion: 1, datasetId: "pilot-test", records }; }
function fullManifest() {
  return manifest(categories.flatMap((category, c) => Array.from({ length: 20 }, (_, i) =>
    record(c * 20 + i, category, i < 12 ? "train" : i < 16 ? "development" : "test", i % 2 ? "ko" : "en"))));
}

describe("pilot family coverage", () => {
  it("deduplicates same-language variants within a family", () => {
    const first = record(0);
    const report = auditPilotDataset(manifest([first, { ...first, id: "variant" }]));
    expect(report).toMatchObject({ recordCount: 2, familyCount: 1, familiesByLanguage: { en: 1, ko: 0 },
      categorySplitLanguages: { numeric: { development: { en: 1, ko: 0 } } } });
  });

  it("forwards a content-bound fingerprint from the validated snapshot", () => {
    const data = manifest();
    const before = auditPilotDataset(data).datasetSha256;
    expect(before).toBe(fingerprintDataset(data));
    data.records[0].answerKey = "A revised private reference.";
    expect(auditPilotDataset(data).datasetSha256).toBe(fingerprintDataset(data));
    expect(auditPilotDataset(data).datasetSha256).not.toBe(before);
    const reordered = { records: data.records, datasetId: data.datasetId, schemaVersion: data.schemaVersion };
    Object.defineProperty(reordered, "toJSON", { value: () => ({ forged: true }) });
    expect(auditPilotDataset(reordered).datasetSha256).toBe(fingerprintDataset(data));
  });

  it.each(["en", "ko"])("keeps the consent %s canonical answer aligned with all required facts", (language) => {
    const data = JSON.parse(readFileSync("docs/research/datasets/development-seed.json", "utf8"));
    const task = data.records.find((item: { id: string }) => item.id === `consent-boundary-${language}`);
    expect(task).toBeDefined();
    expect(task.answerKey).toBe(task.requiredFacts.join(" "));
  });

  it("counts bilingual records once per family and once per language membership", () => {
    const first = record(0);
    const translated = { ...first, id: "task-0-ko", language: "ko" };
    expect(auditPilotDataset(manifest([first, translated]))).toMatchObject({ recordCount: 2, familyCount: 1,
      familiesBySplit: { train: 0, development: 1, test: 0 }, familiesByLanguage: { en: 1, ko: 1 }, meetsPilotStructure: false });
  });

  it("reports structural gaps without calling a small dataset invalid", () => {
    const report = auditPilotDataset(manifest());
    expect(report.meetsPilotStructure).toBe(false);
    expect(report.issues).toContainEqual({ code: "quota", path: "familyCount", expected: 120, actual: 1 });
    expect(report.issues).toContainEqual({ code: "quota", path: "categorySplit.numeric.train", expected: 12, actual: 0 });
  });

  it("accepts the complete per-category split and language structure", () => {
    expect(auditPilotDataset(fullManifest())).toMatchObject({ familyCount: 120, meetsPilotStructure: true,
      familiesBySplit: { train: 72, development: 24, test: 24 }, issues: [] });
  });

  it("does not inflate family quotas when translations are added", () => {
    const data = fullManifest();
    const before = auditPilotDataset(data);
    data.records.push(...data.records.map((item) => ({ ...item, id: `${item.id}-translated`, language: item.language === "en" ? "ko" : "en" })));
    const after = auditPilotDataset(data);
    expect(after.familyCount).toBe(120);
    expect(after.recordCount).toBe(240);
    expect(after.familiesBySplit).toEqual(before.familiesBySplit);
    expect(after.meetsPilotStructure).toBe(true);
  });

  it("detects missing language strata despite correct global counts", () => {
    const data = fullManifest();
    data.records.forEach((item) => { if (item.category === "causal" && item.split === "test") item.language = "en"; });
    expect(auditPilotDataset(data).issues).toContainEqual({ code: "language_coverage", path: "categorySplitLanguages.causal.test.ko", expected: 1, actual: 0 });
  });

  it("detects category/split imbalance even when global margins match", () => {
    const data = fullManifest();
    data.records[0].split = "test";
    data.records[36].split = "train";
    const report = auditPilotDataset(data);
    expect(report.familiesBySplit).toEqual({ train: 72, development: 24, test: 24 });
    expect(report.issues).toContainEqual({ code: "quota", path: "categorySplit.numeric.train", expected: 12, actual: 11 });
  });

  it("rejects inconsistent categories within one family", () => {
    const first = record(0);
    expect(() => auditPilotDataset(manifest([first, { ...first, id: "variant", category: "negation" }]))).toThrow("family_category_conflict");
  });

  it("rejects split leakage before computing coverage", () => {
    const first = record(0);
    expect(() => auditPilotDataset(manifest([first, { ...first, id: "variant", split: "test" }]))).toThrow("invalid_dataset");
  });

  it("rejects malformed manifests", () => {
    expect(() => auditPilotDataset({})).toThrow("invalid_dataset");
  });

  it("validates the authored seed as bilingual development data, not a complete pilot", () => {
    const data = JSON.parse(readFileSync("docs/research/datasets/development-seed.json", "utf8"));
    const report = auditPilotDataset(data);
    expect(report).toMatchObject({ recordCount: 24, familyCount: 12, familiesBySplit: { train: 0, development: 12, test: 0 },
      familiesByLanguage: { en: 12, ko: 12 }, meetsPilotStructure: false });
    expect(Object.values(report.familiesByCategory)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(report.issues).toContainEqual({ code: "quota", path: "familyCount", expected: 120, actual: 12 });
  });
});

describe("pilot audit CLI", () => {
  let root: string;
  let cli: string;
  const exec = promisify(execFile);
  beforeAll(async () => {
    await mkdir(resolve(".artifacts"), { recursive: true });
    root = await mkdtemp(join(resolve(".artifacts"), "pilot-test-"));
    await mkdir(join(root, "scripts"));
    cli = join(root, "scripts", "audit-pilot.mjs");
    await copyFile(resolve("scripts/audit-pilot.mjs"), cli);
    await copyFile(resolve("scripts/plugin-runtime.mjs"), join(root, "scripts", "plugin-runtime.mjs"));
    await exec(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "-p", resolve("tsconfig.json"), "--outDir", join(root, "dist")]);
  });
  afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
  async function invoke(args: string[]) {
    try { return { ...(await exec(process.execPath, [cli, ...args])), code: 0 }; }
    catch (error) {
      const result = error as { stdout: string; stderr: string; code: number };
      return { stdout: result.stdout, stderr: result.stderr, code: result.code };
    }
  }

  it("reports incomplete structure without altering the seed", async () => {
    const path = resolve("docs/research/datasets/development-seed.json");
    const before = await readFile(path, "utf8");
    const result = await invoke([path]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, report: { familyCount: 12, recordCount: 24, meetsPilotStructure: false } });
    expect(JSON.parse(result.stdout).report.datasetSha256).toBe(fingerprintDataset(JSON.parse(before)));
    expect(result.stderr).toBe("");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("reports complete structural counts through the real compiled entrypoint", async () => {
    const path = join(root, "complete.json");
    await writeFile(path, JSON.stringify(fullManifest()));
    const result = await invoke([path]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, report: { familyCount: 120, meetsPilotStructure: true, issues: [] } });
  });

  it("does not disclose private content or identifiers in successful reports", async () => {
    const data = manifest();
    data.datasetId = "private-dataset-canary";
    data.records[0].id = "private-record-canary";
    data.records[0].familyId = "private-family-canary";
    data.records[0].source.text = "private-source-canary";
    data.records[0].source.sha256 = createHash("sha256").update(data.records[0].source.text).digest("hex");
    data.records[0].source.provenance = "private-provenance-canary";
    data.records[0].answerKey = "private-answer-canary";
    const path = join(root, "private-success-path-canary.json");
    await writeFile(path, JSON.stringify(data));
    const result = await invoke([path]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).report.datasetSha256).toBe(fingerprintDataset(data));
    expect(result.stdout + result.stderr).not.toContain("private-");
  });

  it.each(["malformed", "duplicate", "invalid"])("rejects %s input without disclosing it", async (kind) => {
    const path = join(root, "private-path-canary.json");
    let text = '{"private-value-canary":';
    if (kind === "duplicate") text = JSON.stringify(manifest()).replace('"split":"development"', '"split":"private-value-canary","split":"development"');
    if (kind === "invalid") text = JSON.stringify({ private_field_canary: "private-value-canary" });
    await writeFile(path, text);
    const result = await invoke([path]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, code: "invalid_input" });
    expect(result.stdout + result.stderr).not.toMatch(/private[-_]path|private[-_]value|private_field/);
  });

  it("does not expose unreadable file paths", async () => {
    const result = await invoke([join(root, "private-missing-file")]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, code: "invalid_input" });
    expect(result.stdout + result.stderr).not.toContain("private-");
  });

  it.each([[], ["one", "two"], [" "]])("rejects invalid arguments: %j", async (...args: string[]) => {
    const result = await invoke(args);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, code: "usage" });
  });
});
