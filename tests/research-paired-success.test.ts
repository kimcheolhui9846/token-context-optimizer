import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fingerprintDataset, scoreEvaluation } from "../src/research/scoring.js";
import { analyzePairedSuccess } from "../src/research/paired-success.js";

function fixture(reference = [3, 6], comparison = [6, 0]) {
  const records = reference.flatMap((_, f) => ["en", "ko"].map((language) => {
    const text = `Synthetic family ${f}.`;
    return { id: `task-${f}-${language}`, familyId: `family-${f}`, split: "development", language, category: "numeric",
      source: { text, sha256: createHash("sha256").update(text).digest("hex"), provenance: "Synthetic arithmetic fixture", license: "CC0-1.0" },
      question: "What is stated?", answerKey: text, requiredFacts: [text], prohibitedContradictions: ["The opposite."], acceptableParaphrases: [],
      rubric: { kind: "semantic", instructions: "Check the fact." } };
  }));
  const data = { schemaVersion: 1, datasetId: "paired-test", records };
  const arms = ["full_source", "optimized"];
  const runs = records.flatMap((record, index) => arms.flatMap((arm, a) => [1, 2, 3].map((attempt) => ({ taskId: record.id, arm, attempt,
    status: "completed", latencyMs: null, costUsd: null, judgment: { graderId: "synthetic", coveredFacts: [(index % 2) * 3 + attempt <= (a ? comparison : reference)[Math.floor(index / 2)]], contradiction: false, exactCheckPassed: null } }))));
  const ledger = { schemaVersion: 1, datasetSha256: fingerprintDataset(data), split: "development", arms, attemptsPerTask: 3, runs };
  return { data, ledger };
}

type FixtureRun = ReturnType<typeof fixture>["ledger"]["runs"][number];
type MutableFixtureRun = Omit<FixtureRun, "costUsd" | "judgment"> & { costUsd: number | null; judgment: { graderId: string; coveredFacts: boolean[]; contradiction: boolean; exactCheckPassed: boolean | null } | null };
type MutableLedger = Omit<ReturnType<typeof fixture>["ledger"], "runs"> & { runs: MutableFixtureRun[] };

function capacityFixture(familyCount: number, arms = ["full_source", "optimized"]) {
  const records = Array.from({ length: familyCount }, (_, family) => ["en", "ko"].map((language) => {
    const text = `Capacity family ${family} ${language}.`;
    return { id: `capacity-${family}-${language}`, familyId: `capacity-family-${family}`, split: "development", language, category: "numeric",
      source: { text, sha256: createHash("sha256").update(text).digest("hex"), provenance: "Synthetic capacity fixture", license: "CC0-1.0" },
      question: "What is stated?", answerKey: text, requiredFacts: [text], prohibitedContradictions: ["The opposite."], acceptableParaphrases: [],
      rubric: { kind: "semantic", instructions: "Check the fact." } };
  })).flat();
  const data = { schemaVersion: 1, datasetId: "capacity-test", records };
  const ledger = { schemaVersion: 1, datasetSha256: fingerprintDataset(data), split: "development", arms, attemptsPerTask: 3, runs: [] };
  return { data, ledger };
}

function pilotFixture() {
  const categories = ["numeric", "negation", "actor_action", "causal", "temporal", "exact"] as const;
  const records = categories.flatMap((category, categoryIndex) => Array.from({ length: 20 }, (_, familyIndex) => {
    const familyId = `pilot-${category}-${familyIndex}`;
    const split = familyIndex < 12 ? "train" : familyIndex < 16 ? "development" : "test";
    return ["en", "ko"].map((language) => {
      const text = `Pilot ${category} family ${familyIndex} ${language}.`;
      return { id: `${familyId}-${language}`, familyId, split, language, category,
        source: { text, sha256: createHash("sha256").update(text).digest("hex"), provenance: "Synthetic pilot fixture", license: "CC0-1.0" },
        question: "What is stated?", answerKey: text, requiredFacts: [text], prohibitedContradictions: ["The opposite."], acceptableParaphrases: [],
        rubric: category === "exact" ? { kind: "exact", instructions: "Check the fact.", hiddenCheckId: `hidden-${categoryIndex}` } : { kind: "semantic", instructions: "Check the fact." } };
    });
  })).flat();
  const data = { schemaVersion: 1, datasetId: "pilot-test", records };
  const runs = records.filter((record) => record.split === "development").flatMap((record) => ["full_source", "optimized"].flatMap((arm) => [1, 2, 3].map((attempt) => ({
    taskId: record.id, arm, attempt, status: "completed", latencyMs: null, costUsd: null,
    judgment: { graderId: "synthetic", coveredFacts: [true], contradiction: false, exactCheckPassed: record.category === "exact" ? true : null },
  }))));
  const ledger = { schemaVersion: 1, datasetSha256: fingerprintDataset(data), split: "development", arms: ["full_source", "optimized"], attemptsPerTask: 3, runs };
  return { data, ledger };
}

describe("paired success analyzer", () => {
  it("computes the literal two-family contrast", () => {
    const { data, ledger } = fixture();
    expect(JSON.stringify(analyzePairedSuccess(data, ledger))).toBe(JSON.stringify({
      schemaVersion: 1, kind: "research_paired_success_report", analysisVersion: "family-paired-success-v1", diagnosticOnly: true,
      researchEligible: false, dispatchAllowed: false, datasetSha256: fingerprintDataset(data), split: "development",
      contrast: { referenceArm: "full_source", comparisonArm: "optimized" }, attemptsPerTask: 3,
      coverage: { complete: true, familyCount: 2, planned: 24, submitted: 24, missing: 0, ungraded: 0, arms: [
        { arm: "full_source", planned: 12, submitted: 12, missing: 0, ungraded: 0 }, { arm: "optimized", planned: 12, submitted: 12, missing: 0, ungraded: 0 },
      ] }, pointEstimate: -0.25, families: [
        { familyId: "family-0", category: "numeric", referenceSuccesses: 3, comparisonSuccesses: 6, referenceRate: 0.5, comparisonRate: 1, difference: 0.5 },
        { familyId: "family-1", category: "numeric", referenceSuccesses: 6, comparisonSuccesses: 0, referenceRate: 1, comparisonRate: 0, difference: -1 },
      ],
    }));
  });

  it.each([
    [[6], [6], 0], [[0], [0], 0], [[0], [6], 1], [[6], [0], -1],
  ])("returns the expected contrast for %j vs %j", (reference, comparison, expected) => {
    const { data, ledger } = fixture(reference, comparison);
    const result = analyzePairedSuccess(data, ledger);
    expect(result.pointEstimate).toBe(expected);
    expect(Object.is(result.pointEstimate, -0)).toBe(false);
  });

  it.each(["error", "timeout"] as const)("treats %s as a failure and null telemetry as known-valid", (status) => {
    const { data, ledger } = fixture([0, 0], [6, 6]);
    const control = analyzePairedSuccess(data, ledger);
    const changedLedger = { ...ledger, runs: ledger.runs.map((run) =>
      run.arm === "optimized" && run.taskId === "task-0-en" && run.attempt === 1
        ? { ...run, status, judgment: null }
        : run) };
    const result = analyzePairedSuccess(data, changedLedger);
    expect(result.coverage).toMatchObject({ complete: true, missing: 0, ungraded: 0 });
    expect(result).toMatchObject({ diagnosticOnly: true, researchEligible: false, dispatchAllowed: false,
      pointEstimate: 11 / 12,
      families: [
        { familyId: "family-0", referenceSuccesses: 0, comparisonSuccesses: 5, referenceRate: 0, comparisonRate: 5 / 6, difference: 5 / 6 },
        { familyId: "family-1", referenceSuccesses: 0, comparisonSuccesses: 6, referenceRate: 0, comparisonRate: 1, difference: 1 },
      ] });
    expect(result.pointEstimate).toBeLessThan(control.pointEstimate!);
  });

  it.each(["missing_contrast_arm", "unsupported_analysis_attempts", "unsupported_analysis_split"])("rejects %s", (code) => {
    const { data, ledger } = fixture();
    ledger.runs = [];
    if (code === "missing_contrast_arm") ledger.arms = ["full_source"];
    if (code === "unsupported_analysis_attempts") ledger.attemptsPerTask = 2;
    if (code === "unsupported_analysis_split") { ledger.split = "train"; ledger.runs = []; data.records = data.records.map((record) => ({ ...record, split: "train" })); ledger.datasetSha256 = fingerprintDataset(data); }
    expect(() => analyzePairedSuccess(data, ledger)).toThrowError(new RegExp(`^${code}$`));
  });

  it("applies split, arm, then attempts analysis precedence with matching hashes", () => {
    const cases = [
      { code: "unsupported_analysis_split", split: "train", arms: ["full_source"], attempts: 4 },
      { code: "missing_contrast_arm", split: "development", arms: ["full_source"], attempts: 4 },
      { code: "unsupported_analysis_attempts", split: "development", arms: ["full_source", "optimized"], attempts: 4 },
    ];
    for (const { code, split, arms, attempts } of cases) {
      const { data, ledger } = fixture();
      data.records = data.records.map((record) => ({ ...record, split }));
      ledger.split = split;
      ledger.arms = arms;
      ledger.attemptsPerTask = attempts;
      ledger.runs = [];
      ledger.datasetSha256 = fingerprintDataset(data);
      expect(() => analyzePairedSuccess(data, ledger)).toThrowError(new RegExp(`^${code}$`));
    }
  });

  it("rejects four attempts even when no runs are submitted", () => {
    const { data, ledger } = fixture();
    ledger.runs = [];
    ledger.attemptsPerTask = 4;
    expect(() => analyzePairedSuccess(data, ledger)).toThrowError(/^unsupported_analysis_attempts$/);
  });

  it("withholds families and estimate for missing or ungraded slots", () => {
    const { data, ledger } = fixture();
    ledger.runs.pop();
    const missing = analyzePairedSuccess(data, ledger);
    expect(missing).toMatchObject({ pointEstimate: null, families: [], coverage: { familyCount: 2, missing: 1 } });
    const second = fixture();
    const changedLedger = { ...second.ledger, runs: second.ledger.runs.map((run, index) => index === 0 ? { ...run, judgment: null } : run) };
    expect(analyzePairedSuccess(second.data, changedLedger)).toMatchObject({ pointEstimate: null, families: [], coverage: { ungraded: 1 } });
  });

  it("preserves permutation stability while sorting coverage arms", () => {
    const inputFamilyIds = ["full_source", "full-source", "fullsource", "full.source"];
    const expanded = fixture([6, 6, 6, 6], [6, 6, 6, 6]);
    expanded.data.records = expanded.data.records.map((record, index) => ({ ...record, familyId: inputFamilyIds[Math.floor(index / 2)] }));
    expanded.ledger.datasetSha256 = fingerprintDataset(expanded.data);
    expanded.ledger.arms.push("full-source", "full.source", "fullsource");
    expanded.ledger.runs.push(...expanded.data.records.flatMap((record) => ["full-source", "full.source", "fullsource"].flatMap((arm) => [1, 2, 3].map((attempt) => ({
      taskId: record.id, arm, attempt, status: "completed" as const, latencyMs: null, costUsd: null,
      judgment: { graderId: "synthetic", coveredFacts: [true], contradiction: false, exactCheckPassed: null },
    })) )));
    const { data, ledger } = expanded;
    ledger.arms.reverse();
    ledger.runs.reverse();
    const result = analyzePairedSuccess(data, ledger);
    const permuted = analyzePairedSuccess(data, { ...ledger, arms: [...ledger.arms].reverse(), runs: [...ledger.runs].reverse() });
    expect(result.coverage.arms.map((arm) => arm.arm)).toEqual(["full-source", "full.source", "full_source", "fullsource", "optimized"]);
    expect(result.families.map((family) => family.familyId)).toEqual(["full-source", "full.source", "full_source", "fullsource"]);
    expect(result).toEqual(permuted);
  });

  it("rejects malformed raw mock reports and preserves input", () => {
    const { data, ledger } = fixture();
    const before = JSON.stringify({ data, ledger });
    expect(() => analyzePairedSuccess(data, { schemaVersion: 1, kind: "research_mock_run_report" })).toThrow("invalid_evaluation");
    expect(JSON.stringify({ data, ledger })).toBe(before);
  });

  it("rejects unpaired families without tightening the scorer", () => {
    const { data, ledger } = fixture();
    data.records.pop();
    ledger.datasetSha256 = fingerprintDataset(data);
    ledger.runs = [];
    expect(scoreEvaluation(data, ledger).complete).toBe(false);
    expect(() => analyzePairedSuccess(data, ledger)).toThrow("invalid_analysis_family");
  });

  it("blocks analysis above the 100,000-slot capacity while accepting the boundary", () => {
    const accepted = capacityFixture(8_333);
    expect(analyzePairedSuccess(accepted.data, accepted.ledger).coverage).toMatchObject({ complete: false, planned: 99_996, familyCount: 8_333 });
    const rejected = capacityFixture(8_334);
    expect(() => analyzePairedSuccess(rejected.data, rejected.ledger)).toThrow("analysis_capacity_exceeded");
  }, 30_000);

  it("calculates capacity from the declared arm count", () => {
    const accepted = capacityFixture(5_556, ["full_source", "optimized"]);
    expect(analyzePairedSuccess(accepted.data, accepted.ledger).coverage).toMatchObject({ complete: false, planned: 66_672, familyCount: 5_556 });
    const rejected = capacityFixture(5_556, ["full_source", "optimized", "extra"]);
    expect(() => analyzePairedSuccess(rejected.data, rejected.ledger)).toThrow("analysis_capacity_exceeded");
  }, 30_000);

  it("checks attempts before capacity", () => {
    const rejected = capacityFixture(8_334);
    rejected.ledger.attemptsPerTask = 4;
    expect(() => analyzePairedSuccess(rejected.data, rejected.ledger)).toThrow(/^unsupported_analysis_attempts$/);
  }, 30_000);

  it("includes incomplete extra arms in coverage and suppresses the contrast", () => {
    const { data, ledger } = fixture();
    ledger.arms.push("extra");
    const result = analyzePairedSuccess(data, ledger);
    expect(result).toMatchObject({ pointEstimate: null, families: [], coverage: { complete: false, planned: 36, missing: 12 } });
    expect(result.coverage.arms.map((arm) => arm.arm)).toEqual(["extra", "full_source", "optimized"]);
  });

  it("suppresses the contrast when an extra declared arm has an ungraded slot", () => {
    const { data, ledger } = fixture();
    const extraRuns = data.records.flatMap((record) => [1, 2, 3].map((attempt) => ({
      taskId: record.id, arm: "extra", attempt, status: "completed", latencyMs: null, costUsd: null,
      judgment: { graderId: "synthetic", coveredFacts: [true], contradiction: false, exactCheckPassed: null },
    })));
    ledger.arms.push("extra");
    const mutableLedger = ledger as MutableLedger;
    mutableLedger.runs.push(...extraRuns as MutableFixtureRun[]);
    mutableLedger.runs[mutableLedger.runs.length - 1] = { ...mutableLedger.runs[mutableLedger.runs.length - 1], judgment: null };
    const result = analyzePairedSuccess(data, ledger);
    expect(result).toMatchObject({ pointEstimate: null, families: [], coverage: { complete: false, ungraded: 1, planned: 36, submitted: 36 } });
  });

  it.each(Array.from({ length: 7 }, (_, reference) => Array.from({ length: 7 }, (_, comparison) => [reference, comparison] as const)).flat())
  ("keeps exact integer family counts for %j vs %j", (reference, comparison) => {
    const { data, ledger } = fixture([reference], [comparison]);
    const result = analyzePairedSuccess(data, ledger);
    expect(result.families[0]).toMatchObject({ referenceSuccesses: reference, comparisonSuccesses: comparison,
      referenceRate: reference / 6, comparisonRate: comparison / 6, difference: (comparison - reference) / 6 });
    expect(result.pointEstimate).toBe((comparison - reference) / 6);
  });

  it("accepts the full bilingual six-category pilot shape while remaining diagnostic", () => {
    const { data, ledger } = pilotFixture();
    const result = analyzePairedSuccess(data, ledger);
    expect(result).toMatchObject({ diagnosticOnly: true, researchEligible: false, dispatchAllowed: false,
      split: "development", pointEstimate: 0, coverage: { complete: true, familyCount: 24, planned: 288, submitted: 288, missing: 0, ungraded: 0 } });
    expect(result.families).toHaveLength(24);
  });

  it("rejects unknown keys and preserves core validation precedence", () => {
    const { data, ledger } = fixture();
    expect(() => analyzePairedSuccess(data, { ...ledger, unknown: true })).toThrow("invalid_evaluation");
    expect(() => analyzePairedSuccess(data, { ...ledger, datasetSha256: "0".repeat(64), arms: ["full_source"] })).toThrow("dataset_fingerprint_mismatch");
  });

  it("keeps cost overflow in the shared validation path before analysis errors", () => {
    const { data, ledger } = fixture();
    data.records[1].language = "en";
    ledger.datasetSha256 = fingerprintDataset(data);
    (ledger as MutableLedger).runs = ledger.runs.map((run) => ({ ...run, costUsd: 1e308 }));
    expect(() => analyzePairedSuccess(data, ledger)).toThrow("cost_overflow");
  });

  it("keeps cost overflow ahead of train and missing-arm analysis errors", () => {
    for (const mode of ["train", "missing-arm"] as const) {
      const { data, ledger } = fixture();
      const mutable = ledger as MutableLedger;
      data.records = data.records.map((record) => ({ ...record, split: mode === "train" ? "train" : record.split }));
      if (mode === "train") ledger.split = "train";
      if (mode === "missing-arm") {
        ledger.arms = ["full_source"];
        mutable.runs = mutable.runs.filter((run) => run.arm === "full_source");
      }
      ledger.datasetSha256 = fingerprintDataset(data);
      mutable.runs = mutable.runs.map((run) => ({ ...run, costUsd: 1e308 }));
      expect(() => analyzePairedSuccess(data, ledger)).toThrow("cost_overflow");
    }
  });

  it("keeps duplicate and malformed run errors ahead of family analysis", () => {
    const cases = [
      (ledger: ReturnType<typeof fixture>["ledger"]) => ({ ...ledger, runs: [ledger.runs[0], ledger.runs[0]] }),
      (ledger: ReturnType<typeof fixture>["ledger"]) => ({ ...ledger, runs: [{ ...ledger.runs[0], judgment: { ...ledger.runs[0].judgment!, coveredFacts: [] } }] }),
    ];
    for (const makeLedger of cases) {
      const { data, ledger } = fixture();
      data.records[1].language = "en";
      ledger.datasetSha256 = fingerprintDataset(data);
      const expected = makeLedger === cases[0] ? "duplicate_run" : "judgment_shape";
      expect(() => analyzePairedSuccess(data, makeLedger(ledger))).toThrow(expected);
      expect(() => scoreEvaluation(data, makeLedger(ledger))).toThrow(expected);
    }
  });

  it("accepts scorer-valid records but rejects malformed analysis families", () => {
    const mutations = [
      (data: ReturnType<typeof fixture>["data"]) => { data.records[1].language = "en"; },
      (data: ReturnType<typeof fixture>["data"]) => { data.records.pop(); },
      (data: ReturnType<typeof fixture>["data"]) => { data.records.push({ ...data.records[0], id: "task-extra-en", familyId: "family-0" }); },
      (data: ReturnType<typeof fixture>["data"]) => { data.records[1].category = "negation"; },
    ];
    for (const mutate of mutations) {
      const { data, ledger } = fixture();
      mutate(data);
      ledger.datasetSha256 = fingerprintDataset(data);
      ledger.runs = [];
      expect(scoreEvaluation(data, ledger).complete).toBe(false);
      expect(() => analyzePairedSuccess(data, ledger)).toThrow("invalid_analysis_family");
    }
  });

  it("rejects analysis-invalid structure only after shared core errors", () => {
    const { data, ledger } = fixture();
    data.records[1].language = "en";
    ledger.datasetSha256 = fingerprintDataset(data);
    ledger.runs = [{ ...ledger.runs[0], taskId: "unknown" }];
    expect(() => analyzePairedSuccess(data, ledger)).toThrow("out_of_plan");
  });

  it("ignores nonenumerable serialization hooks but rejects enumerable unknown keys", () => {
    const { data, ledger } = fixture([0], [6]);
    Object.defineProperty(data, "toJSON", { value: () => ({ schemaVersion: 99 }), enumerable: false });
    Object.defineProperty(ledger, "toJSON", { value: () => ({ kind: "research_mock_run_report" }), enumerable: false });
    expect(analyzePairedSuccess(data, ledger).pointEstimate).toBe(1);
    expect(() => analyzePairedSuccess(data, { ...ledger, unknown: true })).toThrow("invalid_evaluation");
  });

  it("does not reuse input records or mutated returned rows across calls", () => {
    const { data, ledger } = fixture();
    const before = JSON.stringify({ data, ledger });
    const first = analyzePairedSuccess(data, ledger);
    first.families[0].familyId = "caller-mutated";
    expect(JSON.stringify({ data, ledger })).toBe(before);
    const second = analyzePairedSuccess(data, ledger);
    expect(second.families[0].familyId).toBe("family-0");
  });

  it("sorts family-1, family-10, family-2 using ASCII order", () => {
    const { data, ledger } = fixture();
    data.records = data.records.map((record) => ({ ...record, familyId: record.familyId === "family-0" ? "family-10" : "family-1" }));
    data.records.push(...["en", "ko"].map((language) => {
      const text = `Synthetic family 2 ${language}.`;
      return { ...data.records[0], id: `family-2-${language}`, familyId: "family-2", language, category: "negation", source: { ...data.records[0].source, text, sha256: createHash("sha256").update(text).digest("hex") } };
    }));
    ledger.runs = ledger.runs.filter((run) => data.records.some((record) => record.id === run.taskId));
    ledger.runs.push(...data.records.filter((record) => record.familyId === "family-2").flatMap((record) => ["full_source", "optimized"].flatMap((arm) => [1, 2, 3].map((attempt) => ({
      taskId: record.id, arm, attempt, status: "completed", latencyMs: null, costUsd: null,
      judgment: { graderId: "synthetic", coveredFacts: [arm === "optimized"], contradiction: false, exactCheckPassed: null },
    })) )));
    ledger.datasetSha256 = fingerprintDataset(data);
    expect(analyzePairedSuccess(data, ledger).families.map((family) => [family.familyId, family.category, family.referenceSuccesses, family.comparisonSuccesses, family.difference])).toEqual([
      ["family-1", "numeric", 6, 0, -1],
      ["family-10", "numeric", 3, 6, 0.5],
      ["family-2", "negation", 0, 6, 1],
    ]);
  });

  it("uses exact judgment booleans for exact families", () => {
    const { data, ledger } = fixture([0], [0]);
    data.records = data.records.map((record) => ({ ...record, category: "exact", rubric: { kind: "exact", instructions: "Check the fact.", hiddenCheckId: "check-1" } }));
    ledger.datasetSha256 = fingerprintDataset(data);
    (ledger as MutableLedger).runs = ledger.runs.map((run) => ({ ...run, judgment: { ...run.judgment!, coveredFacts: [true], exactCheckPassed: false } }));
    expect(analyzePairedSuccess(data, ledger).families[0]).toMatchObject({ referenceSuccesses: 0, comparisonSuccesses: 0 });
    (ledger as MutableLedger).runs = ledger.runs.map((run) => ({ ...run, judgment: { ...run.judgment!, coveredFacts: [true], exactCheckPassed: true } }));
    expect(analyzePairedSuccess(data, ledger).families[0]).toMatchObject({ referenceSuccesses: 6, comparisonSuccesses: 6 });
    (ledger as MutableLedger).runs[0] = { ...ledger.runs[0], judgment: { ...ledger.runs[0].judgment!, exactCheckPassed: null } };
    expect(() => analyzePairedSuccess(data, ledger)).toThrow("judgment_shape");
  });

  it("does not inspect an unrelated split family", () => {
    const { data, ledger } = fixture();
    const text = "Unrelated test family.";
    data.records.push({ ...data.records[0], id: "test-only", familyId: "test-only", split: "test", source: { ...data.records[0].source, text, sha256: createHash("sha256").update(text).digest("hex") } });
    ledger.datasetSha256 = fingerprintDataset(data);
    expect(analyzePairedSuccess(data, ledger).coverage.familyCount).toBe(2);
  });

  it("rejects a selected one-record unrelated split family", () => {
    const { data, ledger } = fixture();
    const text = "Unrelated selected test family.";
    data.records.push({ ...data.records[0], id: "test-only-selected", familyId: "test-only-selected", split: "test", source: { ...data.records[0].source, text, sha256: createHash("sha256").update(text).digest("hex") } });
    ledger.split = "test";
    ledger.runs = [];
    ledger.datasetSha256 = fingerprintDataset(data);
    expect(() => analyzePairedSuccess(data, ledger)).toThrow("invalid_analysis_family");
  });

  it("reports capacity before an invalid selected family", () => {
    const rejected = capacityFixture(8_334);
    rejected.data.records[1].language = "en";
    rejected.ledger.datasetSha256 = fingerprintDataset(rejected.data);
    expect(() => analyzePairedSuccess(rejected.data, rejected.ledger)).toThrow("analysis_capacity_exceeded");
  }, 30_000);
});
