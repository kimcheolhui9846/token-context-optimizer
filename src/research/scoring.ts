import { parseResearchDataset } from "./dataset.js";
import { digestValidatedDataset, evaluateCore, isEvaluationSplit } from "./evaluation-core.js";

export function buildModelInputs(input: unknown, split: string) {
  const dataset = parseResearchDataset(input);
  if (!isEvaluationSplit(split)) throw new Error("invalid_split");
  return dataset.records.filter((record) => record.split === split).map((record) => ({
    id: record.id, language: record.language, sourceText: record.source.text, question: record.question,
  }));
}

export function fingerprintDataset(input: unknown): string {
  return digestValidatedDataset(parseResearchDataset(input));
}

export function scoreEvaluation(input: unknown, evaluation: unknown) {
  return evaluateCore(input, evaluation).report;
}
