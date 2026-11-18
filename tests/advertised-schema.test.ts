import { describe, expect, it } from "vitest";
import { fromAdvertisedSchema, withoutRedundantObjectType } from "./helpers/advertised-schema.js";

const variantA = { type: "object", properties: { k: { const: "a" } }, required: ["k"], additionalProperties: false };
const variantB = { type: "object", properties: { k: { const: "b" }, x: { type: "number" } }, required: ["k", "x"], additionalProperties: false };

describe("advertised tools/list schema oracle", () => {
  it("keeps anyOf meaning for an object node: accepted only when one variant accepts", () => {
    const schema = fromAdvertisedSchema({ type: "object", $schema: "https://json-schema.org/draft/2020-12/schema", anyOf: [variantA, variantB] });
    expect(schema.safeParse({ k: "a" }).success).toBe(true);
    expect(schema.safeParse({ k: "b", x: 1 }).success).toBe(true);
    // Fields of variant B on a variant-A record: every variant rejects it.
    expect(schema.safeParse({ k: "a", x: 1 }).success).toBe(false);
    expect(schema.safeParse({ k: "c" }).success).toBe(false);
    expect(schema.safeParse("a").success).toBe(false);
  });

  it("rewrites nested object+anyOf nodes and leaves other schemas unchanged", () => {
    const nested = { type: "object", properties: { source: { type: "object", anyOf: [variantA, variantB] } }, required: ["source"], additionalProperties: false };
    expect(withoutRedundantObjectType(nested)).toEqual({ ...nested, properties: { source: { anyOf: [variantA, variantB] } } });
    expect(fromAdvertisedSchema(nested).safeParse({ source: { k: "a", x: 1 } }).success).toBe(false);
    expect(withoutRedundantObjectType(variantA)).toEqual(variantA);
  });

  it("refuses shapes where dropping the outer type would change meaning", () => {
    expect(() => withoutRedundantObjectType({ type: "object", anyOf: [variantA, { type: "string" }] })).toThrow(/every variant/u);
    expect(() => withoutRedundantObjectType({ type: "object", anyOf: [variantA], properties: {} })).toThrow(/extra keywords/u);
  });
});
