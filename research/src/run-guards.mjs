// Budget and resume guards shared by run.mjs and session-harness.mjs (fixes for the PR #33 review, 2026-10-15).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// Fixed text overhead per call (system prompt, question, message framing), counted generously.
export const TEXT_OVERHEAD_TOKENS = 200;
export const LOCATE_IMAGE_TOKENS = 85; // OpenAI detail low
export const LOCATE_MAX_TOKENS = 60;
// Worst-case image tokens of an arm-transformed crop (long side <= 1536). A crop can cost more than the whole variant:
// GPT-4o keeps a short side <= 768, so 1536x768-like strips reach ceil(1536/512) x ceil(768/512) = 6 tiles = 85 + 170*6,
// while a 2048x1536 variant is 4 tiles (PR #33 re-review, 2026-10-15). Haiku 4.5 is capped at 1568 patches.
export const MAX_CROP_IMAGE_TOKENS = { openai: 85 + 170 * 6, anthropic: 1568 };

/**
 * Upper-bound cost of one slot in USD. A C2 slot makes two calls: a detail-low locate call on the variant, and a
 * detail-high answer call on the crop. The crop can exceed the variant's own tokens, so the answer call is bounded by
 * max(variant tokens, provider worst case for an arm-transformed crop).
 */
export function estimateSlotCost({ arm, imageTokens, maxTokens, price, provider = "openai" }) {
  const call = (inTokens, outTokens) => (inTokens * price.inputPerM + outTokens * price.outputPerM) / 1e6;
  if (arm !== "C2") return call(imageTokens + TEXT_OVERHEAD_TOKENS, maxTokens);
  const cropBound = Math.max(imageTokens, MAX_CROP_IMAGE_TOKENS[provider]);
  return call(LOCATE_IMAGE_TOKENS + TEXT_OVERHEAD_TOKENS, LOCATE_MAX_TOKENS) + call(cropBound + TEXT_OVERHEAD_TOKENS, maxTokens);
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
