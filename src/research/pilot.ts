import { parseResearchDataset, type ResearchDataset } from "./dataset.js";
import { fingerprintDataset } from "./scoring.js";

const categories = ["numeric", "negation", "actor_action", "causal", "temporal", "exact"] as const;
const splits = ["train", "development", "test"] as const;
const languages = ["en", "ko"] as const;
const splitCounts = () => ({ train: 0, development: 0, test: 0 });
const languageCounts = () => ({ en: 0, ko: 0 });
type Task = ResearchDataset["records"][number];

export function auditPilotDataset(input: unknown) {
  const dataset = parseResearchDataset(input);
  const families = new Map<string, {
    category: Task["category"]; split: Task["split"]; languages: Set<Task["language"]>;
  }>();
  for (const task of dataset.records) {
    const family = families.get(task.familyId);
    if (family) {
      if (family.category !== task.category) throw new Error("family_category_conflict");
      family.languages.add(task.language);
    } else {
      families.set(task.familyId, { category: task.category, split: task.split, languages: new Set([task.language]) });
    }
  }

  const familiesBySplit = splitCounts();
  const familiesByLanguage = languageCounts();
  const familiesByCategory = Object.fromEntries(categories.map((category) => [category, 0]));
  const categorySplit = Object.fromEntries(categories.map((category) => [category, splitCounts()]));
  const categorySplitLanguages = Object.fromEntries(categories.map((category) => [category, {
    train: languageCounts(), development: languageCounts(), test: languageCounts(),
  }]));
  for (const family of families.values()) {
    familiesBySplit[family.split] += 1;
    familiesByCategory[family.category] += 1;
    categorySplit[family.category][family.split] += 1;
    for (const language of family.languages) {
      familiesByLanguage[language] += 1;
      categorySplitLanguages[family.category][family.split][language] += 1;
    }
  }

  const issues: { code: "quota" | "language_coverage"; path: string; expected: number; actual: number }[] = [];
  const quota = (path: string, expected: number, actual: number) => {
    if (expected !== actual) issues.push({ code: "quota", path, expected, actual });
  };
  quota("familyCount", 120, families.size);
  const targets = { train: 72, development: 24, test: 24 };
  const categoryTargets = { train: 12, development: 4, test: 4 };
  for (const split of splits) quota(`familiesBySplit.${split}`, targets[split], familiesBySplit[split]);
  for (const category of categories) {
    quota(`familiesByCategory.${category}`, 20, familiesByCategory[category]);
    for (const split of splits) {
      quota(`categorySplit.${category}.${split}`, categoryTargets[split], categorySplit[category][split]);
      for (const language of languages) {
        const actual = categorySplitLanguages[category][split][language];
        if (actual === 0) issues.push({ code: "language_coverage", path: `categorySplitLanguages.${category}.${split}.${language}`, expected: 1, actual });
      }
    }
  }
  return {
    schemaVersion: 1, datasetSha256: fingerprintDataset(dataset),
    recordCount: dataset.records.length, familyCount: families.size,
    familiesBySplit, familiesByCategory, familiesByLanguage, categorySplit, categorySplitLanguages,
    meetsPilotStructure: issues.length === 0, issues,
  };
}
