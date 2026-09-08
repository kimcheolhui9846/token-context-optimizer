import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { checkExactResponse } from "../src/research/exact-checks.js";
import { fingerprintDataset } from "../src/research/scoring.js";
import { parseResearchDataset, type ResearchDataset } from "../src/research/dataset.js";

const seed = (): ResearchDataset => JSON.parse(readFileSync("docs/research/datasets/development-seed.json", "utf8"));
const datasetHash = "c29ea2176fa160732dd74ad8b4ae0ae5e547eaaa427a6e165ba0759444d55c35";
const log = "src/cache.ts:17:4 ERR_CACHE_MISS";
const guard = "  if (value < 0) return 0;";
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const envelope = (taskId = "cache-location-en", responseText = log, datasetSha256 = datasetHash) =>
  ({ schemaVersion: 1, datasetSha256, taskId, responseText });
const invalid = (code: string) => ({ datasetSha256: null, responseSha256: null, checkVersion: null, passed: null, codes: [code] });

describe("registered exact excerpt checks", () => {
  it.each([
    ["cache-location-en", log, "seed-cache-location-v1"],
    ["cache-location-ko", log, "seed-cache-location-v1"],
    ["clamp-guard-en", guard, "seed-clamp-guard-v1"],
    ["clamp-guard-ko", guard, "seed-clamp-guard-v1"],
  ])("accepts the pinned excerpt for %s with content-bound evidence", (id, response, version) => {
    expect(checkExactResponse(seed(), envelope(id, response))).toEqual({ datasetSha256: datasetHash,
      responseSha256: hash(response), checkVersion: version, passed: true, codes: [] });
  });

  it.each([
    ["cache-location-en", "src/cache.ts:18:4 ERR_CACHE_MISS"],
    ["cache-location-en", "src/cache.ts:17:5 ERR_CACHE_MISS"],
    ["cache-location-en", "src/cache.ts:17:4 ERR_OTHER"],
    ["cache-location-en", `\uFEFF${log}`],
    ["cache-location-en", `${log}\n`],
    ["cache-location-en", `${log}\r\n`],
    ["cache-location-en", `\x60\x60\x60\n${log}\n\x60\x60\x60`],
    ["cache-location-en", `Answer: ${log}`],
    ["clamp-guard-en", "  if (value <= 0) return 0;"],
    ["clamp-guard-en", guard.trim()],
    ["clamp-guard-en", `\t${guard.trim()}`],
    ["clamp-guard-en", ""],
  ])("reports a valid mismatch without normalizing %s: %j", (id, response) => {
    expect(checkExactResponse(seed(), envelope(id, response))).toEqual({ datasetSha256: datasetHash,
      responseSha256: hash(response), checkVersion: id.startsWith("cache") ? "seed-cache-location-v1" : "seed-clamp-guard-v1",
      passed: false, codes: ["response_mismatch"] });
  });

  it("rejects a fingerprint mismatch before task evaluation", () => {
    expect(checkExactResponse(seed(), envelope(undefined, undefined, "0".repeat(64))))
      .toEqual(invalid("dataset_fingerprint_mismatch"));
  });

  it.each(["missing", "battery-threshold-en", "constructor"])("rejects unsupported task %s", (id) => {
    expect(checkExactResponse(seed(), envelope(id))).toEqual(invalid("unsupported_task"));
  });

  it("rejects an unknown checker ID even on a known task", () => {
    const data = seed();
    const task = data.records.find((t) => t.id === "cache-location-en")!;
    if (task.rubric.kind === "exact") task.rubric.hiddenCheckId = "unknown-check";
    expect(checkExactResponse(data, envelope(task.id, log, fingerprintDataset(data))))
      .toEqual(invalid("unsupported_task"));
  });

  it("does not authorize a new task by copying a registered checker ID", () => {
    const data = seed();
    const task = data.records.find((t) => t.id === "cache-location-en")!;
    task.id = "copied-task";
    expect(checkExactResponse(data, envelope(task.id, log, fingerprintDataset(data))))
      .toEqual(invalid("unsupported_task"));
  });

  it.each(["answerKey", "question", "requiredFacts", "rubric", "source", "provenance", "language",
    "familyId", "split", "license", "prohibitedContradictions", "acceptableParaphrases"])(
    "rejects %s drift even with a recomputed dataset fingerprint", (field) => {
      const data = seed();
      const task = data.records.find((t) => t.id === "cache-location-en")!;
      if (field === "answerKey") task.answerKey = "private-answer-canary";
      if (field === "question") task.question = "private-question-canary";
      if (field === "requiredFacts") task.requiredFacts = ["private-fact-canary"];
      if (field === "rubric") task.rubric.instructions = "private-rubric-canary";
      if (field === "source") { task.source.text += "\nprivate-source-canary"; task.source.sha256 = hash(task.source.text); }
      if (field === "provenance") task.source.provenance = "private-provenance-canary";
      if (field === "language") task.language = "ko";
      if (field === "license") task.source.license = "private-license-canary";
      if (field === "prohibitedContradictions") task.prohibitedContradictions = ["private-contradiction-canary"];
      if (field === "acceptableParaphrases") task.acceptableParaphrases = ["private-paraphrase-canary"];
      if (field === "familyId" || field === "split") {
        for (const sibling of data.records.filter((t) => t.familyId === task.familyId)) {
          if (field === "familyId") sibling.familyId = "private-family-canary";
          else sibling.split = "test";
        }
      }
      const result = checkExactResponse(data, envelope(task.id, task.answerKey, fingerprintDataset(data)));
      expect(result).toEqual(invalid("registry_drift"));
      expect(JSON.stringify(result)).not.toContain("private-");
    });

  it.each([{}, null, { ...envelope(), extra: "private-canary" }, { ...envelope(), schemaVersion: 2 },
    { ...envelope(), responseText: 123 }, { ...envelope(), taskId: " cache-location-en" },
    { ...envelope(), taskId: "__proto__" }])(
    "rejects malformed envelopes %j", (input) => {
      expect(checkExactResponse(seed(), input)).toEqual(invalid("invalid_input"));
    });

  it("rejects malformed datasets without reflecting submitted values", () => {
    expect(checkExactResponse({ private: "private-canary" }, envelope())).toEqual(invalid("invalid_input"));
  });

  it.each(["\uD800", "\uDC00", `prefix\uD800suffix`])("rejects unpaired surrogate %j", (text) => {
    expect(checkExactResponse(seed(), envelope(undefined, text))).toEqual(invalid("invalid_input"));
  });

  it.each(["a".repeat(65536), "\u00E9".repeat(32768), "\uD83D\uDE00".repeat(16384)])(
    "accepts the byte limit as a valid mismatch %#", (text) => {
      expect(checkExactResponse(seed(), envelope(undefined, text))).toMatchObject({ passed: false,
        responseSha256: hash(text), codes: ["response_mismatch"] });
    });

  it.each(["a".repeat(65537), "\u00E9".repeat(32769)])("rejects over-limit UTF-8 bytes %#", (text) => {
    expect(checkExactResponse(seed(), envelope(undefined, text))).toEqual(invalid("invalid_input"));
  });

  it("uses detached schema order rather than caller serialization hooks", () => {
    const data = seed();
    const reordered = { records: data.records.map((t) => Object.fromEntries(Object.entries(t).reverse())),
      datasetId: data.datasetId, schemaVersion: data.schemaVersion };
    Object.defineProperty(reordered, "toJSON", { value: () => ({ forged: true }) });
    const input = envelope();
    Object.defineProperty(input, "toJSON", { value: () => ({ forged: true }) });
    expect(checkExactResponse(reordered, input)).toEqual(checkExactResponse(data, envelope()));
    expect(checkExactResponse(reordered, input).passed).toBe(true);
  });

  it("leaves the dataset and envelope unchanged", () => {
    const data = seed();
    const input = envelope();
    const before = JSON.stringify([data, input]);
    expect(checkExactResponse(data, input).passed).toBe(true);
    expect(JSON.stringify([data, input])).toBe(before);
  });

  it.each(["excerpt", "sourceLine", "sourceSha256"])("fails closed on corrupt registry %s evidence", async (field) => {
    vi.resetModules();
    // Corrupt only registry data; exercise the real comparator and dataset validator.
    vi.doMock("../src/research/exact-registry.js", async () => {
      const actual = await vi.importActual<typeof import("../src/research/exact-registry.js")>("../src/research/exact-registry.js");
      return { EXACT_CHECK_REGISTRY: actual.EXACT_CHECK_REGISTRY.map((entry) => ({ ...entry,
        ...(field === "excerpt" ? { excerpt: "private-registry-canary" } : {}),
        ...(field === "sourceLine" ? { sourceLine: 99 } : {}),
        ...(field === "sourceSha256" ? { sourceSha256: "0".repeat(64) } : {}),
      })) };
    });
    try {
      const { checkExactResponse: check } = await import("../src/research/exact-checks.js");
      expect(check(seed(), envelope())).toEqual(invalid("source_fidelity_failure"));
    } finally {
      vi.doUnmock("../src/research/exact-registry.js");
      vi.resetModules();
    }
  });

  it.each([false, true])("retains source CR bytes when the pinned excerpt includes CR: %s", async (includeCR) => {
    const data = seed();
    const task = data.records.find((t) => t.id === "cache-location-en")!;
    task.source.text = task.source.text.replace(/\n/g, "\r\n");
    task.source.sha256 = hash(task.source.text);
    data.records = [task];
    const snapshot = parseResearchDataset(data);
    const excerpt = includeCR ? `${log}\r` : log;
    vi.resetModules();
    vi.doMock("../src/research/exact-registry.js", () => ({ EXACT_CHECK_REGISTRY: [{
      hiddenCheckId: "seed-cache-location-v1", checkVersion: "crlf-test-only",
      records: { [task.id]: hash(JSON.stringify(snapshot.records[0])) },
      sourceSha256: task.source.sha256, sourceLine: 1, excerpt,
    }] }));
    try {
      const { checkExactResponse: check } = await import("../src/research/exact-checks.js");
      const result = check(data, envelope(task.id, excerpt, fingerprintDataset(data)));
      if (includeCR) expect(result).toMatchObject({ passed: true, codes: [], responseSha256: hash(excerpt) });
      else expect(result).toEqual(invalid("source_fidelity_failure"));
    } finally {
      vi.doUnmock("../src/research/exact-registry.js");
      vi.resetModules();
    }
  });
});
