// Budget and resume guards shared by run.mjs and session-harness.mjs (fixes for the PR #33 review, 2026-10-15).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// Fixed text overhead per call (system prompt, question, message framing), counted generously.
export const TEXT_OVERHEAD_TOKENS = 200;
export const LOCATE_IMAGE_TOKENS = 85; // OpenAI detail low
export const LOCATE_MAX_TOKENS = 60;

/**
 * Upper-bound cost of one slot in USD. A C2 slot makes two calls: a detail-low locate call on the variant and a
 * detail-high answer call on a crop that is never larger than the transformed variant, so the second call is bounded
 * by the variant's own image tokens.
 */
export function estimateSlotCost({ arm, imageTokens, maxTokens, price }) {
  const call = (inTokens, outTokens) => (inTokens * price.inputPerM + outTokens * price.outputPerM) / 1e6;
  const answer = call(imageTokens + TEXT_OVERHEAD_TOKENS, maxTokens);
  if (arm !== "C2") return answer;
  return call(LOCATE_IMAGE_TOKENS + TEXT_OVERHEAD_TOKENS, LOCATE_MAX_TOKENS) + answer;
}

export const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Stable fingerprint of everything that must not change between the first start and a resume of one run id. */
export function configFingerprint(fields) {
  const sorted = Object.keys(fields).sort().reduce((o, k) => ((o[k] = fields[k]), o), {});
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

/**
 * Refuse to resume a run whose stored fingerprint differs from the current one, so results from different models,
 * providers, prompts or inputs never mix under one run id. Returns "new" or "resume".
 */
export function checkResume(configPath, fingerprint) {
  if (!existsSync(configPath)) return "new";
  const stored = JSON.parse(readFileSync(configPath, "utf8"));
  if (!stored.fingerprint) throw new Error(`run config ${configPath} has no fingerprint (created before the resume guard); use a new --run-id`);
  if (stored.fingerprint !== fingerprint) throw new Error(`run config ${configPath} was created with different settings or inputs; use a new --run-id`);
  return "resume";
}
