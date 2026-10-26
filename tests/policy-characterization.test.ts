import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyContext, lossyCompressionAllowed } from "../src/core/policy.js";
import { classifyContext as classifyHistorical } from "./helpers/policy-baseline.js";
import { classifyContext as classifyF21 } from "./helpers/policy-baseline-f21.js";
import { policyCorpus } from "./helpers/policy-corpus.js";
import { assertF21OverlayComplete, classifyF21Expectation } from "./helpers/policy-f21-expectations.js";

interface CharacterizationFixture {
  provenance: { baselineCommit: string; sourceSha256: string };
  entries: Array<{
    id: string;
    content: string;
    classification: { mode: string; reasons: string[]; warnings: string[] };
    lossyCompressionAllowed: boolean;
  }>;
}

describe("policy characterization", () => {
  it("preserves the historical oracle and matches the explicit F-21 overlay, including array order", async () => {
    const fixture = JSON.parse(
      await readFile(resolve("tests/fixtures/policy/characterization.json"), "utf8"),
    ) as CharacterizationFixture;
    expect(fixture.provenance).toMatchObject({
      baselineCommit: "5828f02840304067e8d345969ffc7c1a981650ec",
      sourceSha256: "E4503C0B2189AEC05EE8A3349788A033092E9B20F14C7D1C3F4F90734F28F8B1",
    });
    expect(fixture.entries).toHaveLength(120);
    expect(fixture.entries.map(({ id, content }) => ({ id, content }))).toEqual(policyCorpus);
    for (const { id, content, classification } of fixture.entries) {
      expect(classifyHistorical(content), `historical ${id}`).toEqual(classification);
      expect(classifyF21(content), `F-21 oracle ${id}`).toEqual(classifyF21Expectation(id, content));
      const actual = classifyContext(content);
      expect(actual, id).toEqual(classifyF21Expectation(id, content));
      expect(lossyCompressionAllowed(actual), id).toBe(classifyF21Expectation(id, content).mode === "semantic");
    }
    assertF21OverlayComplete();
  });
});
