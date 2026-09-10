import * as z from "zod/v4";

const unpadded = z.string().refine(value => value.trim().length > 0 && value === value.trim());
const identifier = unpadded.regex(/^[a-z0-9][a-z0-9._-]*$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const execution = z.strictObject({
  provider: identifier.nullable(),
  modelSnapshot: unpadded.nullable(),
  endpoint: unpadded.nullable(),
  tokenizerId: unpadded.nullable(),
  tokenizerVersion: unpadded.nullable(),
  priceVersion: unpadded.nullable(),
  inputTokenLimit: positiveInteger.nullable(),
  outputTokenLimit: positiveInteger.nullable(),
  requestTimeoutMs: positiveInteger.nullable(),
  runTimeoutMs: positiveInteger.nullable(),
  spendCapMicrousd: positiveInteger.nullable(),
  concurrency: z.literal(1).nullable(),
  automaticRetries: z.literal(0).nullable(),
  decodingSha256: sha256.nullable(),
}).refine(value => value.requestTimeoutMs === null || value.runTimeoutMs === null ||
  value.runTimeoutMs >= value.requestTimeoutMs);
const reference = z.strictObject({ id: identifier, sha256 }).nullable();
const evidence = z.strictObject({
  accessApproval: reference,
  spendApproval: reference,
  uploadApproval: reference,
  dataReview: reference,
  modelQualification: reference,
  armPreparation: reference,
  gradingPlan: reference,
  analysisPlan: reference,
});
const configurationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: identifier,
  datasetSha256: sha256,
  split: z.enum(["development", "test"]),
  arms: z.tuple([z.literal("full_source"), z.literal("optimized"), z.literal("fixed_chunk"), z.literal("gold_reference")]),
  attemptsPerTask: z.literal(3),
  scheduleAlgorithm: z.literal("sha256-rank-v1"),
  seed: sha256,
  execution: execution.nullable(),
  evidence: evidence.nullable(),
});

export type RunConfiguration = z.infer<typeof configurationSchema>;

export function parseRunConfiguration(input: unknown): RunConfiguration {
  try {
    return configurationSchema.parse(input);
  } catch {
    throw new Error("invalid_configuration");
  }
}
