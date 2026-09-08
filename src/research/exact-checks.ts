export type ExactCheckResult = {
  datasetSha256: string | null;
  responseSha256: string | null;
  checkVersion: string | null;
  passed: boolean | null;
  codes: string[];
};

const envelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  datasetSha256: z.string().regex(/^[0-9a-f]{64}$/).length(64),
  taskId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).refine((text) => text === text.trim()),
  responseText: z.string().max(65536),
});

function invalid(code: string): ExactCheckResult {
  return { datasetSha256: null, responseSha256: null, checkVersion: null, passed: null, codes: [code] };
}

function hash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function checkExactResponse(input: unknown, envelope: unknown): ExactCheckResult {
  try {
    const parsed = envelopeSchema.safeParse(envelope);
    if (!parsed.success) return invalid("invalid_input");
    const response = parsed.data;
    // Unicode mode treats valid surrogate pairs as scalars, leaving only unpaired halves.
    if (/[\uD800-\uDFFF]/u.test(response.responseText) || Buffer.byteLength(response.responseText, "utf8") > 65536) {
      return invalid("invalid_input");
    }
    const dataset = parseResearchDataset(input);
    const datasetSha256 = fingerprintDataset(dataset);
    if (datasetSha256 !== response.datasetSha256) return invalid("dataset_fingerprint_mismatch");
    const task = dataset.records.find((record) => record.id === response.taskId);
    if (!task || task.category !== "exact" || task.rubric.kind !== "exact") return invalid("unsupported_task");
    const checkId = task.rubric.hiddenCheckId;
    const entry = EXACT_CHECK_REGISTRY.find((item) => item.hiddenCheckId === checkId);
    if (!entry || !Object.hasOwn(entry.records, task.id)) return invalid("unsupported_task");
    const records: Readonly<Record<string, string>> = entry.records;
    if (hash(JSON.stringify(task)) !== records[task.id]) return invalid("registry_drift");

    const sourceLine = task.source.text.split("\n")[entry.sourceLine];
    const excerpt = Buffer.from(entry.excerpt, "utf8");
    if (task.source.sha256 !== entry.sourceSha256 || sourceLine === undefined ||
      !Buffer.from(sourceLine, "utf8").equals(excerpt)) return invalid("source_fidelity_failure");
    const passed = Buffer.from(response.responseText, "utf8").equals(excerpt);
    return { datasetSha256, responseSha256: hash(response.responseText), checkVersion: entry.checkVersion,
      passed, codes: passed ? [] : ["response_mismatch"] };
  } catch {
    return invalid("invalid_input");
  }
}
import { createHash } from "node:crypto";
import * as z from "zod/v4";
import { parseResearchDataset } from "./dataset.js";
import { fingerprintDataset } from "./scoring.js";
import { EXACT_CHECK_REGISTRY } from "./exact-registry.js";
