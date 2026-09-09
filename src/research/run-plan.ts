import { createHash } from "node:crypto";
import { parseResearchDataset, type ResearchDataset } from "./dataset.js";
import { auditPilotDataset } from "./pilot.js";
import { fingerprintDataset } from "./scoring.js";
import { parseRunConfiguration, type RunConfiguration } from "./run-plan-schema.js";

type Task = ResearchDataset["records"][number];
type Arm = RunConfiguration["arms"][number];
type Slot = {
  ordinal: number; familyId: string; taskId: string; language: Task["language"];
  category: Task["category"]; arm: Arm; attempt: number;
};
type Issue = {
  code: "unresolved_execution" | "missing_evidence_reference" | "pilot_structure" | "bilingual_pairing";
  path: string;
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");

function rank<T extends string>(items: T[], key: (item: T) => unknown): T[] {
  return items.map(item => ({ item, hash: digest(key(item)) }))
    .sort((a, b) => compare(a.hash, b.hash) || compare(a.item, b.item)).map(entry => entry.item);
}

function groupFamilies(data: ResearchDataset) {
  const families = new Map<string, Task[]>();
  for (const task of data.records) {
    const family = families.get(task.familyId);
    if (family) {
      if (family[0].category !== task.category) throw new Error("family_category_conflict");
      family.push(task);
    } else families.set(task.familyId, [task]);
  }
  return families;
}

function schedule(families: Map<string, Task[]>, config: RunConfiguration): Slot[] {
  const slots: Slot[] = [];
  const eligible = [...families.keys()].filter(id => families.get(id)![0].split === config.split);
  const ordered = rank(eligible, id => [config.scheduleAlgorithm, config.seed, "family", id]);
  for (const familyId of ordered) {
    const tasks = [...families.get(familyId)!].sort((a, b) => compare(a.language, b.language) || compare(a.id, b.id));
    for (const task of tasks) for (let attempt = 1; attempt <= config.attemptsPerTask; attempt++) {
      const arms = rank(config.arms, arm => [config.scheduleAlgorithm, config.seed, "arm", task.id, attempt, arm]);
      for (const arm of arms) {
        slots.push({ ordinal: slots.length + 1, familyId: task.familyId, taskId: task.id,
          language: task.language, category: task.category, arm, attempt });
      }
    }
  }
  return slots;
}

function preflight(data: ResearchDataset, families: Map<string, Task[]>, config: RunConfiguration) {
  const issues: Issue[] = [];
  const unresolved = (value: Record<string, unknown> | null, path: string, code: Issue["code"]) => {
    if (value === null) issues.push({ code, path });
    else for (const [key, item] of Object.entries(value)) if (item === null) issues.push({ code, path: `${path}.${key}` });
    return value !== null && Object.values(value).every(item => item !== null);
  };
  const configurationComplete = unresolved(config.execution, "execution", "unresolved_execution");
  const evidenceReferencesPresent = unresolved(config.evidence, "evidence", "missing_evidence_reference");
  const quotaSatisfied = auditPilotDataset(data).meetsPilotStructure;
  const paired = [...families.values()].every(tasks => tasks.length === 2 &&
    tasks.some(task => task.language === "en") && tasks.some(task => task.language === "ko"));
  if (!quotaSatisfied) issues.push({ code: "pilot_structure", path: "dataset.pilotStructure" });
  if (!paired) issues.push({ code: "bilingual_pairing", path: "dataset.bilingualPairs" });
  const pilotStructureSatisfied = quotaSatisfied && paired;
  // Schema-owned keys and one issue per field make duplicates impossible here.
  issues.sort((a, b) => compare(a.code, b.code) || compare(a.path, b.path));
  return { configurationComplete, pilotStructureSatisfied, evidenceReferencesPresent,
    preflightPassed: configurationComplete && pilotStructureSatisfied && evidenceReferencesPresent,
    dispatchAllowed: false as const, issues };
}

export function prepareResearchRun(input: unknown, configuration: unknown) {
  const config = parseRunConfiguration(configuration);
  let data: ResearchDataset;
  try {
    data = parseResearchDataset(input);
  } catch {
    throw new Error("invalid_dataset");
  }
  const datasetSha256 = fingerprintDataset(data);
  if (config.datasetSha256 !== datasetSha256) throw new Error("dataset_fingerprint_mismatch");
  const families = groupFamilies(data);
  const taskCount = data.records.reduce((count, task) => count + Number(task.split === config.split), 0);
  if (taskCount === 0) throw new Error("empty_split");
  const planned = taskCount * config.arms.length * config.attemptsPerTask;
  if (!Number.isSafeInteger(planned) || planned > 100000) throw new Error("slot_limit_exceeded");
  const slots = schedule(families, config);
  const binding = { schemaVersion: 1 as const, datasetSha256, configSha256: digest(config), scheduleSha256: digest(slots) };
  return { manifest: { ...binding, manifestSha256: digest(binding) }, slots, preflight: preflight(data, families, config) };
}
