import { createHash } from "node:crypto";
import * as z from "zod/v4";

const nonblank = z.string().refine((value) => value.trim().length > 0);
const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/)
  .refine((value) => value === value.trim());
const rubricSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("semantic"), instructions: nonblank }),
  z.strictObject({ kind: z.literal("exact"), instructions: nonblank, hiddenCheckId: identifier }),
]);

const datasetSchema = z.strictObject({
  schemaVersion: z.literal(1),
  datasetId: identifier,
  records: z.array(z.strictObject({
    id: identifier,
    familyId: identifier,
    split: z.enum(["train", "development", "test"]),
    language: z.enum(["en", "ko"]),
    category: z.enum(["numeric", "negation", "actor_action", "causal", "temporal", "exact"]),
    source: z.strictObject({
      text: nonblank,
      sha256: z.string().length(64).regex(/^[0-9a-f]{64}$/),
      provenance: nonblank,
      license: nonblank,
    }),
    question: nonblank,
    answerKey: nonblank,
    requiredFacts: z.array(nonblank).min(1),
    prohibitedContradictions: z.array(nonblank).min(1),
    acceptableParaphrases: z.array(nonblank),
    rubric: rubricSchema,
  })).min(1),
});

export type ResearchDataset = z.infer<typeof datasetSchema>;
export type DatasetValidationIssue = {
  code: "schema" | "rubric_category_mismatch" | "source_hash_mismatch" |
    "duplicate_id" | "family_split_leakage" | "source_family_conflict";
  path: string;
};
export type DatasetValidationResult = { valid: boolean; issues: DatasetValidationIssue[] };

export function parseResearchDataset(input: unknown): ResearchDataset {
  // Validate consistency on a detached schema snapshot, never on serialization hooks.
  const parsed = datasetSchema.safeParse(input);
  if (!parsed.success || !validateDataset(parsed.data).valid) throw new Error("invalid_dataset");
  return parsed.data;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function validateDataset(input: unknown): DatasetValidationResult {
  const parsed = datasetSchema.safeParse(input);
  if (!parsed.success) {
    // Zod messages can contain submitted values or unknown keys; return paths only.
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({ code: "schema", path: issue.path.join(".") || "$" })),
    };
  }

  const issues: DatasetValidationIssue[] = [];
  const ids = new Set<string>();
  const familySplits = new Map<string, string>();
  const sourceFamilies = new Map<string, string>();
  parsed.data.records.forEach((record, index) => {
    const add = (code: DatasetValidationIssue["code"], field: string) => {
      issues.push({ code, path: `records.${index}.${field}` });
    };
    if ((record.category === "exact") !== (record.rubric.kind === "exact")) {
      add("rubric_category_mismatch", "rubric.kind");
    }
    if (sha256(record.source.text) !== record.source.sha256) {
      add("source_hash_mismatch", "source.sha256");
    }
    if (ids.has(record.id)) add("duplicate_id", "id");
    ids.add(record.id);

    const split = familySplits.get(record.familyId);
    if (split !== undefined && split !== record.split) add("family_split_leakage", "split");
    if (split === undefined) familySplits.set(record.familyId, record.split);

    const normalizedHash = sha256(record.source.text.normalize("NFC").replace(/\r\n?/g, "\n"));
    const family = sourceFamilies.get(normalizedHash);
    if (family !== undefined && family !== record.familyId) add("source_family_conflict", "familyId");
    if (family === undefined) sourceFamilies.set(normalizedHash, record.familyId);
  });
  return { valid: issues.length === 0, issues };
}
