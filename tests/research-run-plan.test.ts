import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ResearchDataset } from "../src/research/dataset.js";
import { auditPilotDataset } from "../src/research/pilot.js";
import { prepareResearchRun } from "../src/research/run-plan.js";
import { fingerprintDataset } from "../src/research/scoring.js";

const arms = ["full_source", "optimized", "fixed_chunk", "gold_reference"];
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function demo(): ResearchDataset {
  return JSON.parse(readFileSync("docs/research/datasets/format-demo.json", "utf8"));
}
function seed(): ResearchDataset {
  return JSON.parse(readFileSync("docs/research/datasets/development-seed.json", "utf8"));
}
function configuration(data = demo()): Record<string, unknown> {
  return { schemaVersion: 1, runId: "synthetic-preview", datasetSha256: fingerprintDataset(data),
    split: "development", arms: [...arms], attemptsPerTask: 3, scheduleAlgorithm: "sha256-rank-v1",
    seed: "0".repeat(64), execution: null, evidence: null };
}
function execution(): Record<string, unknown> {
  return { provider: "synthetic", modelSnapshot: "private-model-canary", endpoint: "responses",
    tokenizerId: "synthetic-tokenizer", tokenizerVersion: "1", priceVersion: "synthetic-price",
    inputTokenLimit: 100, outputTokenLimit: 20, requestTimeoutMs: 1000, runTimeoutMs: 10000,
    spendCapMicrousd: 1000000, concurrency: 1, automaticRetries: 0, decodingSha256: "a".repeat(64) };
}
function evidence(): Record<string, unknown> {
  return Object.fromEntries(["accessApproval", "spendApproval", "uploadApproval", "dataReview",
    "modelQualification", "armPreparation", "gradingPlan", "analysisPlan"].map(key =>
    [key, { id: "private-evidence-canary", sha256: "b".repeat(64) }]));
}
function fullPilot(): ResearchDataset {
  const base = demo();
  const categories = ["numeric", "negation", "actor_action", "causal", "temporal", "exact"] as const;
  base.records = categories.flatMap((category, c) => Array.from({ length: 20 }, (_, i) => {
    const text = `Synthetic family ${c}-${i}.`;
    return (["en", "ko"] as const).map(language => ({ ...structuredClone(demo().records[0]),
      id: `task-${c}-${i}-${language}`, familyId: `family-${c}-${i}`, category, language,
      split: i < 12 ? "train" as const : i < 16 ? "development" as const : "test" as const,
      source: { text, sha256: digest(text), provenance: "synthetic", license: "CC0" },
      rubric: category === "exact" ? { kind: "exact" as const, instructions: "synthetic", hiddenCheckId: "synthetic" }
        : { kind: "semantic" as const, instructions: "synthetic" },
    }));
  }).flat());
  return base;
}
function reversedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedObject);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedObject(item)]));
  }
  return value;
}

describe("research run planning", () => {
  it("keeps the public seed blocked while enumerating every slot once", () => {
    const data = seed();
    const report = prepareResearchRun(data, configuration(data));
    expect(report.slots).toHaveLength(288);
    expect(report.preflight).toEqual({ configurationComplete: false, pilotStructureSatisfied: false,
      evidenceReferencesPresent: false, preflightPassed: false, dispatchAllowed: false, issues: [
        { code: "missing_evidence_reference", path: "evidence" },
        { code: "pilot_structure", path: "dataset.pilotStructure" },
        { code: "unresolved_execution", path: "execution" },
      ] });
    const keys = report.slots.map(slot => `${slot.taskId}/${slot.arm}/${slot.attempt}`);
    expect(new Set(keys).size).toBe(288);
    for (const task of data.records) for (const arm of arms) for (const attempt of [1, 2, 3]) {
      expect(keys).toContain(`${task.id}/${arm}/${attempt}`);
    }
    expect(report.slots.map(slot => slot.ordinal)).toEqual(Array.from({ length: 288 }, (_, i) => i + 1));
  });

  it("matches pre-implementation known-answer ranking and digest vectors", () => {
    const report = prepareResearchRun(demo(), configuration());
    expect(report.slots.map(slot => slot.arm)).toEqual([
      "full_source", "optimized", "fixed_chunk", "gold_reference",
      "fixed_chunk", "optimized", "full_source", "gold_reference",
      "fixed_chunk", "full_source", "optimized", "gold_reference",
    ]);
    expect(report.manifest).toEqual({ schemaVersion: 1,
      datasetSha256: "cc2ccec43f9a00db51c87ec433acae512c25f5727da0ee6902abc521f63abe85",
      configSha256: "b9a12230f20b0f4496f26ed6859548a4f74b49e977724cf84b19c45729f40a8a",
      scheduleSha256: "ccce243d58ce28350bc6077390b89a889c5885ccd53d2deeff50c72a38c0cd8a",
      manifestSha256: "278ebbe7955c47bebd3a0d972da8fd5aa49994c5474272bbd2b5021392f0fc00" });
    expect(Object.keys(report)).toEqual(["manifest", "slots", "preflight"]);
    expect(Object.keys(report.manifest)).toEqual(["schemaVersion", "datasetSha256", "configSha256", "scheduleSha256", "manifestSha256"]);
    expect(Object.keys(report.preflight)).toEqual(["configurationComplete", "pilotStructureSatisfied", "evidenceReferencesPresent", "preflightPassed", "dispatchAllowed", "issues"]);
    for (const issue of report.preflight.issues) expect(Object.keys(issue)).toEqual(["code", "path"]);
    expect(Object.keys(report.slots[0])).toEqual(["ordinal", "familyId", "taskId", "language", "category", "arm", "attempt"]);
  });

  it("ranks multiple families by the seeded hash and preserves language order", () => {
    const data = seed(); const report = prepareResearchRun(data, configuration(data));
    expect([...new Set(report.slots.map(slot => slot.familyId))]).toEqual([
      "pressure-alarm", "booking-deadline", "sample-sequence", "dispatch-handoff", "clamp-guard",
      "battery-threshold", "consent-boundary", "maintenance-roles", "cache-location", "queue-limit",
      "backup-retention", "delivery-delay",
    ]);
    for (let i = 0; i < report.slots.length; i += 24) {
      expect(report.slots.slice(i, i + 12).every(slot => slot.language === "en")).toBe(true);
      expect(report.slots.slice(i + 12, i + 24).every(slot => slot.language === "ko")).toBe(true);
    }
  });

  it.each(["development", "test"])("preflights complete synthetic data for %s without granting authority", split => {
    const data = fullPilot();
    const report = prepareResearchRun(data, { ...configuration(data), split, execution: execution(), evidence: evidence() });
    expect(report.slots).toHaveLength(576);
    expect(report.preflight).toEqual({ configurationComplete: true, pilotStructureSatisfied: true,
      evidenceReferencesPresent: true, preflightPassed: true, dispatchAllowed: false, issues: [] });
    expect(report.slots.every(slot => data.records.find(task => task.id === slot.taskId)?.split === split)).toBe(true);
  });

  it.each(["omit", "duplicate"])("detects %s bilingual partners beyond the existing auditor", mode => {
    const data = fullPilot();
    if (mode === "omit") data.records.splice(1, 1);
    else data.records.push({ ...data.records[0], id: "duplicate-language" });
    expect(auditPilotDataset(data).meetsPilotStructure).toBe(true);
    const report = prepareResearchRun(data, { ...configuration(data), execution: execution(), evidence: evidence() });
    expect(report.preflight.issues).toEqual([{ code: "bilingual_pairing", path: "dataset.bilingualPairs" }]);
    expect(report.preflight.pilotStructureSatisfied).toBe(false);
  });

  it("reports each unresolved execution and evidence field with sorted safe paths", () => {
    const settings = Object.fromEntries(Object.keys(execution()).map(key => [key, null]));
    const refs = Object.fromEntries(Object.keys(evidence()).map(key => [key, null]));
    const report = prepareResearchRun(demo(), { ...configuration(), execution: settings, evidence: refs });
    const paths = report.preflight.issues.map(issue => `${issue.code}:${issue.path}`);
    expect(paths).toEqual([
      "bilingual_pairing:dataset.bilingualPairs",
      "missing_evidence_reference:evidence.accessApproval",
      "missing_evidence_reference:evidence.analysisPlan",
      "missing_evidence_reference:evidence.armPreparation",
      "missing_evidence_reference:evidence.dataReview",
      "missing_evidence_reference:evidence.gradingPlan",
      "missing_evidence_reference:evidence.modelQualification",
      "missing_evidence_reference:evidence.spendApproval",
      "missing_evidence_reference:evidence.uploadApproval",
      "pilot_structure:dataset.pilotStructure",
      "unresolved_execution:execution.automaticRetries",
      "unresolved_execution:execution.concurrency",
      "unresolved_execution:execution.decodingSha256",
      "unresolved_execution:execution.endpoint",
      "unresolved_execution:execution.inputTokenLimit",
      "unresolved_execution:execution.modelSnapshot",
      "unresolved_execution:execution.outputTokenLimit",
      "unresolved_execution:execution.priceVersion",
      "unresolved_execution:execution.provider",
      "unresolved_execution:execution.requestTimeoutMs",
      "unresolved_execution:execution.runTimeoutMs",
      "unresolved_execution:execution.spendCapMicrousd",
      "unresolved_execution:execution.tokenizerId",
      "unresolved_execution:execution.tokenizerVersion",
    ]);
    expect(report.preflight.configurationComplete).toBe(false);
    expect(report.preflight.evidenceReferencesPresent).toBe(false);
  });

  it.each(Object.keys(configuration()))("rejects an omitted envelope field %s", key => {
    const config = configuration(); delete config[key];
    expect(() => prepareResearchRun(demo(), config)).toThrow(/^invalid_configuration$/);
  });
  it.each(Object.keys(execution()))("rejects an omitted execution field %s", key => {
    const settings = execution(); delete settings[key];
    expect(() => prepareResearchRun(demo(), { ...configuration(), execution: settings })).toThrow(/^invalid_configuration$/);
  });
  it.each(Object.keys(evidence()))("rejects an omitted evidence field %s", key => {
    const refs = evidence(); delete refs[key];
    expect(() => prepareResearchRun(demo(), { ...configuration(), evidence: refs })).toThrow(/^invalid_configuration$/);
  });
  it.each([
    { split: "train" }, { arms: [...arms].reverse() }, { arms: [...arms, "extra"] },
    { attemptsPerTask: 4 }, { scheduleAlgorithm: "other" }, { seed: "A".repeat(64) },
    { runId: " padded " }, { datasetSha256: "x" }, { private_key: "canary" },
    { execution: { ...execution(), private_key: "canary" } },
    { evidence: { ...evidence(), private_key: "canary" } },
    { evidence: { ...evidence(), accessApproval: { id: "x", sha256: "b".repeat(64), secret: "canary" } } },
  ])("rejects schema drift without disclosing values %j", patch => {
    expect(() => prepareResearchRun(demo(), { ...configuration(), ...patch })).toThrow(/^invalid_configuration$/);
  });
  it.each(["seed", "datasetSha256", "decodingSha256", "evidenceSha256"])("rejects a trailing newline in %s", field => {
    const config = configuration();
    const malformed = "a".repeat(64) + "\n";
    if (field === "decodingSha256") config.execution = { ...execution(), decodingSha256: malformed };
    else if (field === "evidenceSha256") config.evidence = { ...evidence(), accessApproval: { id: "synthetic", sha256: malformed } };
    else config[field] = malformed;
    expect(() => prepareResearchRun(demo(), config)).toThrow(/^invalid_configuration$/);
  });
  it.each([
    { inputTokenLimit: 0 }, { outputTokenLimit: -1 }, { spendCapMicrousd: 0.5 },
    { spendCapMicrousd: Number.MAX_SAFE_INTEGER + 1 }, { inputTokenLimit: Infinity },
    { runTimeoutMs: 100 }, { requestTimeoutMs: NaN }, { concurrency: 2 }, { automaticRetries: 1 },
    { provider: "UPPER" }, { modelSnapshot: " padded " }, { tokenizerVersion: "" },
    { decodingSha256: "B".repeat(64) }, { automaticRetries: "0" },
  ])("rejects invalid execution settings %j", patch => {
    expect(() => prepareResearchRun(demo(), { ...configuration(), execution: { ...execution(), ...patch } })).toThrow(/^invalid_configuration$/);
  });

  it("applies validation precedence and dataset consistency errors", () => {
    expect(() => prepareResearchRun({}, {})).toThrow(/^invalid_configuration$/);
    expect(() => prepareResearchRun({}, configuration())).toThrow(/^invalid_dataset$/);
    const data = demo(); const config = configuration(data);
    data.records[0].answerKey = "changed";
    expect(() => prepareResearchRun(data, config)).toThrow(/^dataset_fingerprint_mismatch$/);
    const conflict = demo(); conflict.records.push({ ...conflict.records[0], id: "variant", category: "numeric" });
    expect(() => prepareResearchRun(conflict, { ...configuration(conflict), split: "test" })).toThrow(/^family_category_conflict$/);
    expect(() => prepareResearchRun(demo(), { ...configuration(), split: "test" })).toThrow(/^empty_split$/);
    const invalid = demo(); invalid.records[0].source.text += "changed";
    expect(() => prepareResearchRun(invalid, configuration())).toThrow(/^invalid_dataset$/);
  });

  it("preserves canonical ordering without mutating caller data or invoking serialization hooks", () => {
    const data = seed(); const config = { ...configuration(data), execution: execution(), evidence: evidence() };
    const before = JSON.stringify({ data, config });
    const expected = prepareResearchRun(data, config);
    const hook = vi.fn(() => { throw new Error("private-hook-canary"); });
    for (const value of [data, data.records[0], data.records[0].source, config, config.execution, config.evidence]) {
      Object.defineProperty(value, "toJSON", { value: hook });
    }
    expect(prepareResearchRun(data, config)).toEqual(expected);
    expect(prepareResearchRun(reversedObject(data), reversedObject(config))).toEqual(expected);
    expect(hook).not.toHaveBeenCalled();
    expect(JSON.stringify({ data: reversedObject(reversedObject(data)), config: reversedObject(reversedObject(config)) })).toBe(before);
  });

  it("binds revised seed and configuration even if schedule bytes happen not to change", () => {
    const config = configuration(); const original = prepareResearchRun(demo(), config);
    for (const patch of [{ seed: "1".repeat(64) }, { runId: "other-preview" }, { execution: execution() }]) {
      const revised = prepareResearchRun(demo(), { ...config, ...patch });
      expect(revised.manifest.configSha256).not.toBe(original.manifest.configSha256);
      expect(revised.manifest.manifestSha256).not.toBe(original.manifest.manifestSha256);
    }
    const data = seed(); const first = prepareResearchRun(data, configuration(data)); data.records.reverse();
    const reordered = prepareResearchRun(data, configuration(data));
    expect(reordered.slots).toEqual(first.slots);
    expect(reordered.manifest.datasetSha256).not.toBe(first.manifest.datasetSha256);
  });

  it("does not disclose private content, execution metadata or evidence references", () => {
    const data = demo(); const task = data.records[0];
    task.question = "private-question-canary"; task.answerKey = "private-answer-canary";
    task.requiredFacts = ["private-fact-canary"]; task.rubric.instructions = "private-rubric-canary";
    task.source.text = "private-source-canary"; task.source.sha256 = digest(task.source.text);
    const report = prepareResearchRun(data, { ...configuration(data), execution: execution(), evidence: evidence() });
    expect(JSON.stringify(report)).not.toContain("private-");
    expect(report.preflight.dispatchAllowed).toBe(false);
  });

  it.each([8333, 8334])("bounds allocation for %i task records", count => {
    const data = demo(); const task = data.records[0];
    data.records = Array.from({ length: count }, (_, i) => ({ ...task, id: `variant-${i}` }));
    if (count === 8334) expect(() => prepareResearchRun(data, configuration(data))).toThrow(/^slot_limit_exceeded$/);
    else expect(prepareResearchRun(data, configuration(data)).slots).toHaveLength(99996);
  });
});
