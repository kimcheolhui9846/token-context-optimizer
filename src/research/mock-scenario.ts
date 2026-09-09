import * as z from "zod/v4";

const nonnegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = nonnegative.min(1);
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("research_mock_scenario"),
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  limits: z.strictObject({
    requestTimeoutMs: positive,
    runTimeoutMs: positive,
    spendCapMicrousd: positive,
    concurrency: z.literal(1),
    automaticRetries: z.literal(0),
  }).refine(value => value.runTimeoutMs >= value.requestTimeoutMs),
  outcomes: z.array(z.strictObject({
    ordinal: positive,
    status: z.enum(["completed", "error"]),
    durationMs: nonnegative,
    reservedCostMicrousd: nonnegative,
    settledCostMicrousd: nonnegative.nullable(),
  })).max(100000),
});

export type MockScenario = z.infer<typeof schema>;

export function parseMockScenario(input: unknown): MockScenario {
  try {
    const value = schema.parse(input);
    let sum = 0;
    for (const outcome of value.outcomes) {
      if (outcome.settledCostMicrousd === null) continue;
      if (outcome.settledCostMicrousd > Number.MAX_SAFE_INTEGER - sum) throw new Error();
      sum += outcome.settledCostMicrousd;
    }
    value.outcomes.sort((a, b) => a.ordinal - b.ordinal);
    return value;
  } catch {
    throw new Error("invalid_mock_scenario");
  }
}
