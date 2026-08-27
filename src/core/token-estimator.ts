import type { TokenEstimate } from "./types.js";

const PROFILE_VERSION = "heuristic-v1";

export function estimateTextTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const cjkChars = [...text].filter((char) => /[\u3131-\uD79D]/u.test(char)).length;
  const nonCjkChars = Math.max(text.length - cjkChars, 0);
  const wordishTokens = text.trim().split(/\s+/u).filter(Boolean).length;
  const charEstimate = Math.ceil(nonCjkChars / 4) + cjkChars;

  return Math.max(1, Math.ceil(Math.max(wordishTokens, charEstimate)));
}

export function estimateContext(input: {
  text: string;
  maxTokens?: number | null;
}): TokenEstimate {
  const estimatedTokens = estimateTextTokens(input.text);
  const maxTokens = input.maxTokens ?? null;

  return {
    estimatedTokens,
    maxTokens,
    fitsBudget: maxTokens === null ? true : estimatedTokens <= maxTokens,
    profileVersion: PROFILE_VERSION,
    confidence: "low",
    warnings: ["heuristic_estimate_not_billing_usage"],
  };
}
