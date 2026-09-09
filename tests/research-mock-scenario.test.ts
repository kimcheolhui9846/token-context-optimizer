import { describe, expect, it } from "vitest";
import { parseMockScenario } from "../src/research/mock-scenario.js";

function fixture() {
  return {
    schemaVersion: 1,
    kind: "research_mock_scenario",
    manifestSha256: "a".repeat(64),
    limits: {
      requestTimeoutMs: 10,
      runTimeoutMs: 100,
      spendCapMicrousd: 100,
      concurrency: 1,
      automaticRetries: 0,
    },
    outcomes: [2, 1].map(ordinal => ({
      ordinal,
      status: "completed",
      durationMs: 1,
      reservedCostMicrousd: 10,
      settledCostMicrousd: 4,
    })),
  };
}

function expectInvalid(input: unknown): void {
  expect(() => parseMockScenario(input)).toThrow(/^invalid_mock_scenario$/);
}

function reversedObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedObject);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedObject(item)]));
  }
  return value;
}

describe("mock scenario", () => {
  it("sorts a detached canonical snapshot", () => {
    const input = fixture();
    const before = structuredClone(input);
    const parsed = parseMockScenario(input);

    expect(parsed.outcomes.map(item => item.ordinal)).toEqual([1, 2]);
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "kind", "manifestSha256", "limits", "outcomes"]);
    expect(Object.keys(parsed.limits)).toEqual([
      "requestTimeoutMs", "runTimeoutMs", "spendCapMicrousd", "concurrency", "automaticRetries",
    ]);
    expect(Object.keys(parsed.outcomes[0])).toEqual([
      "ordinal", "status", "durationMs", "reservedCostMicrousd", "settledCostMicrousd",
    ]);

    parsed.limits.requestTimeoutMs = 9;
    parsed.outcomes[0].durationMs = 9;
    expect(input).toEqual(before);
  });

  it("canonicalizes reversed key insertion order", () => {
    const parsed = parseMockScenario(reversedObject(fixture()));

    expect(Object.keys(parsed)).toEqual(["schemaVersion", "kind", "manifestSha256", "limits", "outcomes"]);
    expect(Object.keys(parsed.limits)).toEqual([
      "requestTimeoutMs", "runTimeoutMs", "spendCapMicrousd", "concurrency", "automaticRetries",
    ]);
    expect(Object.keys(parsed.outcomes[0])).toEqual([
      "ordinal", "status", "durationMs", "reservedCostMicrousd", "settledCostMicrousd",
    ]);
  });

  it.each(["schemaVersion", "kind", "manifestSha256", "limits", "outcomes"])(
    "requires envelope key %s",
    key => {
      const input = fixture();
      Reflect.deleteProperty(input, key);
      expectInvalid(input);
    },
  );

  it.each(["requestTimeoutMs", "runTimeoutMs", "spendCapMicrousd", "concurrency", "automaticRetries"])(
    "requires limit key %s",
    key => {
      const input = fixture();
      Reflect.deleteProperty(input.limits, key);
      expectInvalid(input);
    },
  );

  it.each(["ordinal", "status", "durationMs", "reservedCostMicrousd", "settledCostMicrousd"])(
    "requires outcome key %s",
    key => {
      const input = fixture();
      Reflect.deleteProperty(input.outcomes[0], key);
      expectInvalid(input);
    },
  );

  it.each([
    ["envelope", (input: ReturnType<typeof fixture>) => Object.assign(input, { extra: true })],
    ["limits", (input: ReturnType<typeof fixture>) => Object.assign(input.limits, { extra: true })],
    ["outcome", (input: ReturnType<typeof fixture>) => Object.assign(input.outcomes[0], { extra: true })],
  ])("rejects an unknown key at the %s level", (_level, mutate) => {
    const input = fixture();
    mutate(input);
    expectInvalid(input);
  });

  it("accepts null settlement but rejects a missing settlement", () => {
    const nullable = fixture();
    nullable.outcomes[0].settledCostMicrousd = null as unknown as number;
    expect(parseMockScenario(nullable).outcomes[1].settledCostMicrousd).toBeNull();

    const missing = fixture();
    Reflect.deleteProperty(missing.outcomes[0], "settledCostMicrousd");
    expectInvalid(missing);
  });

  it.each([
    ["requestTimeoutMs", (input: ReturnType<typeof fixture>, value: unknown) => Object.assign(input.limits, { requestTimeoutMs: value })],
    ["runTimeoutMs", (input: ReturnType<typeof fixture>, value: unknown) => Object.assign(input.limits, { runTimeoutMs: value })],
    ["spendCapMicrousd", (input: ReturnType<typeof fixture>, value: unknown) => Object.assign(input.limits, { spendCapMicrousd: value })],
    ["ordinal", (input: ReturnType<typeof fixture>, value: unknown) => Object.assign(input.outcomes[0], { ordinal: value })],
  ])("rejects invalid positive integer values for %s", (_field, mutate) => {
    for (const value of ["3", -1, 0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const input = fixture();
      mutate(input, value);
      expectInvalid(input);
    }
  });

  it.each([
    ["durationMs", (input: ReturnType<typeof fixture>, value: unknown) => Object.assign(input.outcomes[0], { durationMs: value })],
    ["reservedCostMicrousd", (input: ReturnType<typeof fixture>, value: unknown) => Object.assign(input.outcomes[0], { reservedCostMicrousd: value })],
    ["settledCostMicrousd", (input: ReturnType<typeof fixture>, value: unknown) => Object.assign(input.outcomes[0], { settledCostMicrousd: value })],
  ])("rejects invalid nonnegative integer values for %s", (_field, mutate) => {
    for (const value of ["3", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const input = fixture();
      mutate(input, value);
      expectInvalid(input);
    }
  });

  it("accepts zero costs and duration while rejecting zero limits", () => {
    const zeroCosts = fixture();
    Object.assign(zeroCosts.outcomes[0], {
      durationMs: 0,
      reservedCostMicrousd: 0,
      settledCostMicrousd: 0,
    });
    expect(parseMockScenario(zeroCosts).outcomes[1]).toMatchObject({
      durationMs: 0,
      reservedCostMicrousd: 0,
      settledCostMicrousd: 0,
    });

    for (const key of ["requestTimeoutMs", "runTimeoutMs", "spendCapMicrousd"] as const) {
      const zeroLimit = fixture();
      zeroLimit.limits[key] = 0;
      expectInvalid(zeroLimit);
    }
  });

  it.each([
    ["schema version", (input: ReturnType<typeof fixture>) => Object.assign(input, { schemaVersion: 2 })],
    ["kind", (input: ReturnType<typeof fixture>) => Object.assign(input, { kind: "other" })],
    ["short hash", (input: ReturnType<typeof fixture>) => Object.assign(input, { manifestSha256: "a".repeat(63) })],
    ["uppercase hash", (input: ReturnType<typeof fixture>) => Object.assign(input, { manifestSha256: "A".repeat(64) })],
    ["status", (input: ReturnType<typeof fixture>) => Object.assign(input.outcomes[0], { status: "pending" })],
    ["concurrency", (input: ReturnType<typeof fixture>) => Object.assign(input.limits, { concurrency: 2 })],
    ["retry count", (input: ReturnType<typeof fixture>) => Object.assign(input.limits, { automaticRetries: 1 })],
    ["string concurrency", (input: ReturnType<typeof fixture>) => Object.assign(input.limits, { concurrency: "1" })],
    ["string retry count", (input: ReturnType<typeof fixture>) => Object.assign(input.limits, { automaticRetries: "0" })],
  ])("rejects invalid %s", (_case, mutate) => {
    const input = fixture();
    mutate(input);
    expectInvalid(input);
  });

  it("accepts both outcome statuses", () => {
    const input = fixture();
    input.outcomes[0].status = "error";
    expect(parseMockScenario(input).outcomes.map(item => item.status)).toEqual(["completed", "error"]);
  });

  it("requires run timeout to cover request timeout", () => {
    const input = fixture();
    input.limits.requestTimeoutMs = 101;
    expectInvalid(input);

    input.limits.runTimeoutMs = 101;
    expect(parseMockScenario(input).limits.runTimeoutMs).toBe(101);
  });

  it.each([0, 100000, 100001])("enforces the outcome count boundary at %i", count => {
    const input = fixture();
    input.outcomes = Array.from({ length: count }, (_, index) => ({
      ordinal: index + 1,
      status: "completed",
      durationMs: 0,
      reservedCostMicrousd: 0,
      settledCostMicrousd: null as unknown as number,
    }));

    if (count === 100001) expectInvalid(input);
    else expect(parseMockScenario(input).outcomes).toHaveLength(count);
  });

  it("accepts a total settlement at the exact safe integer maximum", () => {
    const input = fixture();
    input.outcomes[0].settledCostMicrousd = Number.MAX_SAFE_INTEGER - 4;
    expect(parseMockScenario(input).outcomes).toHaveLength(2);
  });

  it("rejects total settlement overflow even for unreachable outcomes", () => {
    const input = fixture();
    input.outcomes[0].settledCostMicrousd = Number.MAX_SAFE_INTEGER;
    expectInvalid(input);
  });
});
