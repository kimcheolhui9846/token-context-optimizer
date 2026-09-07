import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateDataset } from "../src/research/dataset.js";

function record(id = "task-1", familyId = "family-1", text = "Operators must not delete source excerpts.") {
  return {
    id, familyId, split: "train", language: "en", category: "negation",
    source: { text, sha256: createHash("sha256").update(text).digest("hex"), provenance: "Author-created synthetic example", license: "CC0-1.0" },
    question: "What must operators avoid?", answerKey: "Deleting source excerpts.",
    requiredFacts: ["Operators must not delete source excerpts."],
    prohibitedContradictions: ["Operators may delete source excerpts."],
    acceptableParaphrases: [], rubric: { kind: "semantic", instructions: "Preserve the prohibition and actor." },
  };
}

function manifest(records: unknown[] = [record()]) {
  return { schemaVersion: 1, datasetId: "format-demo", records };
}

describe("research dataset validation", () => {
  it("accepts declared same-family variants within one split", () => {
    expect(validateDataset(manifest([record(), record("task-2")]))).toEqual({ valid: true, issues: [] });
  });

  it("accepts exact records with a hidden check reference", () => {
    const item = { ...record(), category: "exact", rubric: { kind: "exact", instructions: "Compare source bytes and run the hidden check separately.", hiddenCheckId: "check-1" } };
    expect(validateDataset(manifest([item])).valid).toBe(true);
  });

  it.each([null, {}, { ...manifest(), schemaVersion: 2 }, manifest([])])("rejects malformed manifests", (value) => {
    const result = validateDataset(value);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "schema" })]));
  });

  it.each([
    { split: "validation" }, { language: "fr" }, { category: "unknown" },
    { id: " task-1" }, { familyId: "Family-1" }, { question: " \n" },
    { answerKey: "" }, { requiredFacts: [] }, { prohibitedContradictions: [" "] },
    { acceptableParaphrases: [""] }, { rubric: { kind: "semantic", instructions: "" } },
  ])("rejects invalid record fields: %j", (patch) => {
    expect(validateDataset(manifest([{ ...record(), ...patch }])).valid).toBe(false);
  });

  it("rejects blank source metadata", () => {
    for (const key of ["text", "provenance", "license"]) {
      const item = record();
      expect(validateDataset(manifest([{ ...item, source: { ...item.source, [key]: " " } }])).valid).toBe(false);
    }
  });

  it("does not echo unknown keys or private record values in schema diagnostics", () => {
    const result = validateDataset(manifest([{ ...record(), private_key_marker: "private_value_marker" }]));
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/private_key_marker|private_value_marker/);
  });

  it("rejects a category and rubric mismatch", () => {
    expect(validateDataset(manifest([{ ...record(), category: "exact" }])).valid).toBe(false);
    expect(validateDataset(manifest([{ ...record(), rubric: { kind: "exact", instructions: "Check", hiddenCheckId: "check-1" } }])).valid).toBe(false);
  });

  it("rejects changed source text with an unchanged hash", () => {
    const item = record();
    item.source.text = "Operators may delete source excerpts.";
    expect(validateDataset(manifest([item])).issues).toContainEqual({ code: "source_hash_mismatch", path: "records.0.source.sha256" });
  });

  it.each([
    ["\ud55c\uae00\r\n", "2b014c0b5634a9e3da04ad895a7deebf4e18f924d5e52a3bb10aea4431bed5d8"],
    ["\ufeffsource\n", "1dce75f49319dd1146ec02e5a7c27fe637698cf0d448479628363222bfc4e7b7"],
  ])("validates exact UTF-8 hash vectors: %j", (text, hash) => {
    const item = record("task-1", "family-1", text);
    item.source.sha256 = hash;
    expect(validateDataset(manifest([item])).valid).toBe(true);
    item.source.text = text + " ";
    expect(validateDataset(manifest([item])).issues).toContainEqual({ code: "source_hash_mismatch", path: "records.0.source.sha256" });
  });

  it("rejects unknown nested properties and malformed source hashes", () => {
    const item = record();
    for (const source of [{ ...item.source, unknown: true }, { ...item.source, sha256: "not-a-digest" }]) {
      expect(validateDataset(manifest([{ ...item, source }])).valid).toBe(false);
    }
    expect(validateDataset(manifest([{ ...item, rubric: { ...item.rubric, hiddenCheckId: "extra" } }])).valid).toBe(false);
  });

  it("rejects duplicate record IDs", () => {
    expect(validateDataset(manifest([record(), record()])).issues).toContainEqual({ code: "duplicate_id", path: "records.1.id" });
  });

  it("rejects translated or paraphrased families assigned across splits", () => {
    const variant = { ...record("task-2", "family-1", "Do not remove the source excerpts."), split: "test" };
    expect(validateDataset(manifest([record(), variant])).issues).toContainEqual({ code: "family_split_leakage", path: "records.1.split" });
  });

  it.each(["train", "test"])("rejects relabeled normalized source duplicates in %s", (split) => {
    const first = record("task-1", "family-1", "Cafe\u0301\r\nDo not delete.");
    const second = { ...record("task-2", "family-2", "Caf\u00e9\nDo not delete."), split };
    expect(validateDataset(manifest([first, second])).issues).toContainEqual({ code: "source_family_conflict", path: "records.1.familyId" });
  });

  it("does not collapse meaningful indentation in distinct sources", () => {
    const second = { ...record("task-2", "family-2", "if ready:\n  run()"), split: "test" };
    expect(validateDataset(manifest([record("task-1", "family-1", "if ready:\n    run()"), second])).valid).toBe(true);
  });

  it("finds nonadjacent family leakage in a larger manifest", () => {
    const records = Array.from({ length: 1000 }, (_, i) => record(`task-${i}`, `family-${i}`, `Source ${i}.`));
    records.push({ ...record("task-final", "family-0", "A translated variant."), split: "test" });
    expect(validateDataset(manifest(records))).toEqual({
      valid: false, issues: [{ code: "family_split_leakage", path: "records.1000.split" }],
    });
  });
});

describe("research dataset CLI", () => {
  let root: string;
  let cli: string;
  const exec = promisify(execFile);

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "tco-dataset-test-"));
    cli = join(root, "validate.mjs");
    await build({
      entryPoints: [resolve("scripts/validate-dataset.mjs")], outfile: cli,
      bundle: true, platform: "node", format: "esm",
      plugins: [{
        name: "current-dataset-source",
        setup(builder) {
          builder.onResolve({ filter: /^\.\.\/dist\/src\/research\/dataset\.js$/ }, () => ({ path: resolve("src/research/dataset.ts") }));
        },
      }],
    });
  });
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function run(args: string[]) {
    try {
      const result = await exec(process.execPath, [cli, ...args]);
      return { ...result, code: 0 };
    } catch (error) {
      const result = error as { stdout: string; stderr: string; code: number };
      return { stdout: result.stdout, stderr: result.stderr, code: result.code };
    }
  }

  it("validates the checked-in format demo through the real process", async () => {
    const result = await run([resolve("docs/research/datasets/format-demo.json")]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ valid: true, issues: [] });
    expect(result.stderr).toBe("");
  });

  it("rejects invalid records without changing the file", async () => {
    const path = join(root, "invalid.json");
    const input = JSON.stringify(manifest([record(), record()]));
    await writeFile(path, input);
    const result = await run([path]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: false });
    expect(JSON.parse(result.stdout).issues).toContainEqual({ code: "duplicate_id", path: "records.1.id" });
    expect(await readFile(path, "utf8")).toBe(input);
  });

  it("does not disclose malformed JSON content", async () => {
    const path = join(root, "malformed.json");
    await writeFile(path, '{"private_value_marker":');
    const result = await run([path]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, issues: [{ code: "invalid_json", path: "$" }] });
    expect(result.stdout + result.stderr).not.toContain("private_value_marker");
  });

  it.each(['"split":"test","split":"train"', '"sp\\u006cit":"test","split":"train"'])("rejects duplicate JSON members: %s", async (replacement) => {
    const path = join(root, "duplicate-keys.json");
    await writeFile(path, JSON.stringify(manifest()).replace('"split":"train"', replacement));
    const result = await run([path]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, issues: [{ code: "invalid_json", path: "$" }] });
  });

  it("never echoes submitted data in schema failure diagnostics", async () => {
    const path = join(root, "canary.json");
    const privateValue = "private-data-canary";
    const input = manifest([{ id: privateValue, familyId: privateValue, split: privateValue,
      language: privateValue, category: privateValue, source: { text: privateValue,
        sha256: privateValue, provenance: privateValue, license: privateValue },
      question: privateValue, answerKey: privateValue, requiredFacts: [privateValue],
      prohibitedContradictions: [privateValue], acceptableParaphrases: [privateValue],
      rubric: { kind: privateValue, instructions: privateValue, [privateValue]: privateValue },
    }]);
    await writeFile(path, JSON.stringify(input));
    const result = await run([path]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).valid).toBe(false);
    expect(result.stdout + result.stderr).not.toContain(privateValue);
  });

  it("returns a machine-readable failure for unreadable paths", async () => {
    const result = await run([join(root, "private_path_marker.json")]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, issues: [{ code: "read_error", path: "$" }] });
    expect(result.stdout + result.stderr).not.toContain("private_path_marker");
  });

  it.each([[], ["one", "two"]])("rejects missing or extra arguments: %j", async (...args: string[]) => {
    const result = await run(args);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ valid: false, issues: [{ code: "usage", path: "$" }] });
  });
});
