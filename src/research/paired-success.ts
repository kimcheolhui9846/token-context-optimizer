import { evaluateCore } from "./evaluation-core.js";

type FamilyRow = { familyId: string; category: string; referenceSuccesses: number; comparisonSuccesses: number; referenceRate: number; comparisonRate: number; difference: number };

export function analyzePairedSuccess(input: unknown, evaluation: unknown) {
  const core = evaluateCore(input, evaluation);
  if (core.ledger.split === "train") throw new Error("unsupported_analysis_split");
  if (!core.ledger.arms.includes("full_source") || !core.ledger.arms.includes("optimized")) throw new Error("missing_contrast_arm");
  if (core.ledger.attemptsPerTask !== 3) throw new Error("unsupported_analysis_attempts");
  const plannedPerArm = core.tasks.size * 3;
  const totalPlanned = plannedPerArm * core.ledger.arms.length;
  if (!Number.isSafeInteger(plannedPerArm) || !Number.isSafeInteger(totalPlanned) || totalPlanned > 100_000) throw new Error("analysis_capacity_exceeded");

  const buckets = new Map<string, Array<(typeof core.dataset.records)[number]>>();
  for (const task of core.tasks.values()) {
    const bucket = buckets.get(task.familyId) ?? [];
    bucket.push(task);
    buckets.set(task.familyId, bucket);
  }
  for (const bucket of buckets.values()) {
    if (bucket.length !== 2 || new Set(bucket.map((task) => task.language)).size !== 2 || new Set(bucket.map((task) => task.category)).size !== 1 ||
      !bucket.some((task) => task.language === "en") || !bucket.some((task) => task.language === "ko")) throw new Error("invalid_analysis_family");
  }

  const coverageArms = core.report.arms.map(({ arm, planned, submitted, missing, ungraded }) => ({ arm, planned, submitted, missing, ungraded }))
    .sort((a, b) => a.arm < b.arm ? -1 : a.arm > b.arm ? 1 : 0);
  const coverage = { complete: coverageArms.every((arm) => arm.missing === 0 && arm.ungraded === 0), familyCount: buckets.size,
    planned: coverageArms.reduce((sum, arm) => sum + arm.planned, 0), submitted: coverageArms.reduce((sum, arm) => sum + arm.submitted, 0),
    missing: coverageArms.reduce((sum, arm) => sum + arm.missing, 0), ungraded: coverageArms.reduce((sum, arm) => sum + arm.ungraded, 0), arms: coverageArms };

  let families: FamilyRow[] = [];
  let pointEstimate: number | null = null;
  if (coverage.complete) {
    const counts = new Map<string, { category: string; referenceSuccesses: number; comparisonSuccesses: number }>();
    for (const task of core.tasks.values()) counts.set(task.familyId, { category: task.category, referenceSuccesses: 0, comparisonSuccesses: 0 });
    for (const classified of core.classifiedRuns) {
      if (classified.outcome !== "success") continue;
      const task = core.tasks.get(classified.run.taskId)!;
      const count = counts.get(task.familyId)!;
      if (classified.run.arm === "full_source") count.referenceSuccesses += 1;
      else if (classified.run.arm === "optimized") count.comparisonSuccesses += 1;
    }
    let numerator = 0;
    families = [...counts.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([familyId, count]) => {
      const differenceNumerator = count.comparisonSuccesses - count.referenceSuccesses;
      numerator += differenceNumerator;
      return { familyId, category: count.category, referenceSuccesses: count.referenceSuccesses, comparisonSuccesses: count.comparisonSuccesses,
        referenceRate: count.referenceSuccesses / 6, comparisonRate: count.comparisonSuccesses / 6, difference: differenceNumerator === 0 ? 0 : differenceNumerator / 6 };
    });
    pointEstimate = numerator === 0 ? 0 : numerator / (6 * buckets.size);
  }
  return { schemaVersion: 1 as const, kind: "research_paired_success_report" as const, analysisVersion: "family-paired-success-v1" as const,
    diagnosticOnly: true as const, researchEligible: false as const, dispatchAllowed: false as const, datasetSha256: core.ledger.datasetSha256,
    split: core.ledger.split, contrast: { referenceArm: "full_source" as const, comparisonArm: "optimized" as const }, attemptsPerTask: 3 as const,
    coverage, pointEstimate, families };
}
