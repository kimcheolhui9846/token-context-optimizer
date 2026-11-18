import { fromJSONSchema } from "zod/v4";

// Test oracle for the JSON Schemas a client sees in tools/list.
//
// zod 4.5.0 through at least 4.6.7 converts a node that has both `type: "object"` and `anyOf`
// into a validator that accepts objects every `anyOf` variant rejects (zod 4.4.3 rejected them).
// The image tools advertise exactly that shape. When every variant is itself `type: "object"`,
// the outer `type` adds nothing, so it is dropped before conversion and the advertised schema
// keeps its meaning: valid only if at least one variant accepts. Any other combination is left
// to fail loudly rather than be reinterpreted.
type JsonSchema = Record<string, unknown>;

function isObject(value: unknown): value is JsonSchema {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function withoutRedundantObjectType(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutRedundantObjectType);
  if (!isObject(schema)) return schema;
  const copy: JsonSchema = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, withoutRedundantObjectType(value)]));
  if (copy.type === "object" && Array.isArray(copy.anyOf)) {
    const siblings = Object.keys(copy).filter((key) => !["type", "anyOf", "$schema"].includes(key));
    if (siblings.length > 0) throw new Error(`Unsupported object+anyOf schema with extra keywords: ${siblings.join(", ")}`);
    if (!copy.anyOf.every((variant) => isObject(variant) && variant.type === "object")) {
      throw new Error("Unsupported object+anyOf schema: every variant must be type object");
    }
    delete copy.type;
  }
  return copy;
}

export function fromAdvertisedSchema(schema: unknown): ReturnType<typeof fromJSONSchema> {
  return fromJSONSchema(withoutRedundantObjectType(schema) as Parameters<typeof fromJSONSchema>[0]);
}
