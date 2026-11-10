import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { indexArtifact, MemoryArtifactStore, summarizeArtifact } from "../src/core/artifacts.js";
import { classifyContext, lossyCompressionAllowed } from "../src/core/policy.js";
import { estimateTextTokens } from "../src/core/token-estimator.js";
import type { ArtifactRecord, SourceLine } from "../src/core/types.js";
import { semanticSummaryPassesMeaningGate } from "../benchmarks/run.js";

const seed = "Token efficiency depends on measured task success and careful source preservation.";
const short = "We all like warm tea.";
const late = [
  "The archive stores ordinary notes for the planning group.",
  "Members review the notes during a quiet morning meeting.",
  "The team records decisions in a shared paper journal.",
  "Everyone can suggest a correction before the meeting ends.",
  "The coordinator reads the older entries aloud to the group.",
  "Participants discuss the wording and agree on a clear version.",
  "The required observation is that the blue lantern remains beside the window.",
  "The group leaves the room after the conversation is complete.",
];
const mixed = [
  "The garden committee reviews ordinary plans during a calm afternoon.",
  "Several members bring notes and share them around the table.",
  "The group discusses the path near the old stone fountain.",
  "A volunteer reads the latest observations to everyone present.",
  "The committee compares suggestions before choosing a direction.",
  "People leave room for questions and thoughtful revisions.",
  "The report says the silver bell remains beneath the cedar tree. Other observations describe the path and the morning light.",
];
let root: string;
let sequence = 0;
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), "tco-summary-selection-")); });
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

// The synthetic helper is checked against indexArtifact for every valid UTF-8 case.
// Only unpaired-surrogate cases bypass strict UTF-8 indexing.
function synthetic(content: string, path: string): ArtifactRecord {
  const matches = [...content.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/gu)];
  let byte = 0;
  const sourceMap: SourceLine[] = matches.filter((m, i) => m[1].length > 0 || i < matches.length - 1).map((m, i) => {
    const startByte = byte, endByte = byte + Buffer.byteLength(m[1], "utf8");
    byte = endByte + Buffer.byteLength(m[2], "utf8");
    return { line: i + 1, startByte, endByte, text: m[1], delimiter: m[2] };
  });
  return { artifactId: path, path, sha256: "synthetic", byteLength: byte, lineCount: sourceMap.length, content, sourceMap };
}
async function fixture(content: string) {
  const path = join(root, `${sequence++}.txt`), store = new MemoryArtifactStore();
  const record = synthetic(content, path);
  let artifact = record;
  if (Buffer.from(content, "utf8").toString("utf8") === content) {
    await writeFile(path, content, "utf8");
    artifact = await indexArtifact({ path, store, allowedRoots: [root] });
    expect(record.sourceMap).toEqual(artifact.sourceMap);
    expect(record.byteLength).toBe(artifact.byteLength);
  } else store.put(record);
  return { artifact, summarize: (maxTokens: number) => summarizeArtifact({ artifactId: artifact.artifactId, maxTokens, store }) };
}
type Output = Pick<ReturnType<typeof summarizeArtifact>, "summary" | "sourceMap" | "estimatedTokens" | "fallbackReason" | "warnings">;
function project(result: ReturnType<typeof summarizeArtifact>): Output {
  const { summary, sourceMap, estimatedTokens, fallbackReason, warnings } = result;
  return { summary, sourceMap, estimatedTokens, fallbackReason, warnings };
}
function naive(artifact: ArtifactRecord, budget: number): Output {
  const classification = classifyContext(artifact.content);
  if (!lossyCompressionAllowed(classification)) return {
    summary: "", sourceMap: null, estimatedTokens: 0,
    fallbackReason: `${classification.mode}_content_requires_source`,
    warnings: ["lossy_summary_blocked", ...classification.warnings],
  };
  const selected: SourceLine[] = [];
  for (const line of artifact.sourceMap) {
    if (estimateTextTokens([...selected, line].map(entry => entry.text).join("\n")) > budget) break;
    selected.push(line);
  }
  if (!selected.length && artifact.sourceMap.length) return {
    summary: "", sourceMap: null, estimatedTokens: 0,
    fallbackReason: "summary_span_exceeds_budget", warnings: ["complete_summary_span_required"],
  };
  const summary = selected.map(line => line.text).join("\n");
  return { summary, estimatedTokens: estimateTextTokens(summary), fallbackReason: null,
    sourceMap: selected.length ? { path: artifact.path, startLine: selected[0].line, endLine: selected.at(-1)!.line } : null,
    warnings: selected.length && artifact.sourceMap.slice(selected.length).some(line => /\S/u.test(line.text)) ? ["summary_truncated"] : [],
  };
}

describe("budget-bound complete-line summarizer", () => {
  for (const scenario of [
    { name: "late120", lines: late, budget: 120, count: 7, tokens: 107, phrase: "blue lantern remains beside the window", gate: true, truncated: true },
    { name: "late123", lines: late, budget: 123, count: 8, tokens: 123, phrase: "blue lantern remains beside the window", gate: true, truncated: false },
    { name: "mixed124", lines: mixed, budget: 124, count: 7, tokens: 124, phrase: "silver bell remains beneath the cedar tree", gate: true, truncated: false },
    { name: "mixed120", lines: mixed, budget: 120, count: 6, tokens: 93, phrase: "silver bell remains beneath the cedar tree", gate: false, truncated: true },
  ]) it(`pins ${scenario.name} selection, estimate, warning and meaning gate`, async () => {
    const source = scenario.lines.join("\n"), { artifact, summarize } = await fixture(source);
    expect(classifyContext(source).mode).toBe("semantic");
    const result = summarize(scenario.budget);
    expect(project(result)).toEqual({ summary: scenario.lines.slice(0, scenario.count).join("\n"),
      sourceMap: { path: artifact.path, startLine: 1, endLine: scenario.count }, estimatedTokens: scenario.tokens,
      fallbackReason: null, warnings: scenario.truncated ? ["summary_truncated"] : [] });
    expect(semanticSummaryPassesMeaningGate(result, { name: scenario.name, source, requiredPhrases: [scenario.phrase] })).toBe(scenario.gate);
  });

  for (const tail of ["", " ", "\t", "\u00a0", "\u3000", "\ufeff"]) {
    it(`does not warn about omitted whitespace U+${tail.charCodeAt(0).toString(16)}`, async () => {
      const { artifact, summarize } = await fixture([seed, ...Array(40).fill(""), tail].join("\n"));
      expect(estimateTextTokens(seed + "\n\n")).toBe(21);
      expect(estimateTextTokens(seed + "\n\n\n")).toBe(22);
      const result = summarize(21);
      expect(project(result)).toEqual({ summary: seed + "\n\n", sourceMap: { path: artifact.path, startLine: 1, endLine: 3 }, estimatedTokens: 21, fallbackReason: null, warnings: [] });
      expect(artifact.lineCount).toBeGreaterThan(3);
    });
  }
  it("warns for meaningful text after a long blank tail, including zero-width space", async () => {
    for (const ending of [short, "We all like warm tea\u200b."]) {
      const source = [seed, ...Array(40).fill(""), ending].join("\n");
      expect(classifyContext(source).mode).toBe("semantic");
      const { summarize } = await fixture(source);
      expect(summarize(21).warnings).toEqual(["summary_truncated"]);
    }
    expect(/\S/u.test("\u200b")).toBe(true);
  });
  it("preserves policy and first-complete-line fallback contracts", async () => {
    for (const source of ["", "a", "The command uses npm test and numeric code 42.", "![image](photo.png)"]) {
      const { artifact, summarize } = await fixture(source);
      expect(project(summarize(120))).toEqual(naive(artifact, 120));
      expect(summarize(120).warnings).not.toContain("summary_truncated");
    }
    const { summarize } = await fixture(seed);
    expect(project(summarize(20))).toEqual({ summary: "", sourceMap: null, estimatedTokens: 0, fallbackReason: "summary_span_exceeds_budget", warnings: ["complete_summary_span_required"] });
  });
  it("supports leading blank selection at zero budget without inventing text", async () => {
    const { artifact, summarize } = await fixture("\n" + seed);
    expect(classifyContext(artifact.content).mode).toBe("semantic");
    expect(project(summarize(0))).toEqual({ summary: "", sourceMap: { path: artifact.path, startLine: 1, endLine: 1 }, estimatedTokens: 0, fallbackReason: null, warnings: ["summary_truncated"] });
  });
  it("calibrates the preregistered G3 and large-input semantic paths without timing", async () => {
    const lateFixture = await fixture(late.join("\n")), single = await fixture(seed);
    expect(lateFixture.summarize(88)).toMatchObject({ sourceMap: { startLine: 1, endLine: 6 }, estimatedTokens: 88, fallbackReason: null, warnings: ["summary_truncated"] });
    expect(single.summarize(120)).toMatchObject({ sourceMap: { startLine: 1, endLine: 1 }, fallbackReason: null, warnings: [] });
    for (const content of [seed + "\n" + Array(100001).fill("").join("\n"), Array(100000).fill(short).join("\n")]) {
      const { summarize } = await fixture(content);
      for (const budget of [2000, 50000]) expect(summarize(budget).fallbackReason).toBeNull();
    }
  }, 30000);

  it("matches the uncapped naive oracle across a nonvacuous deterministic corpus", async () => {
    const corpus: string[] = [];
    const choices = [short, seed, "We all like warm tea 한글 かな 🙂.", "", " ", "\t", "We all like warm tea \ud800.", "We all like warm tea \udc00."];
    let state = 0x6b4a19;
    for (let i = 0; i < 128; i++) {
      const lines: string[] = [];
      for (let line = 0; line < i % 51; line++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; lines.push(choices[state % choices.length]); }
      corpus.push(lines.map((text, n) => text + (n === lines.length - 1 ? "" : ["\n", "\r\n", "\r"][n % 3])).join(""));
    }
    for (let count = 0; count <= 50; count++) {
      corpus.push(Array(count).fill(short).join("\n"));
      corpus.push([seed, ...Array(count).fill(" ")].join("\n"));
    }
    corpus.push("", "a", "The command uses numeric code 42.", short.repeat(100), "\n" + short, ...["\u00a0", "\u3000", "\ufeff"].map(space => [seed, ...Array(49).fill(space)].join("\n")));
    const counts = { comparisons: 0, allFit: 0, truncated: 0, blankTail: 0, spanFallback: 0, blocked: 0, over6: 0, over32: 0, indexed: 0, synthetic: 0 };
    for (const content of corpus) {
      const { artifact, summarize } = await fixture(content);
      counts[artifact.sha256 === "synthetic" ? "synthetic" : "indexed"]++;
      const budgets = new Set<number>(Array.from({ length: 201 }, (_, i) => i));
      for (let end = 1; end <= artifact.sourceMap.length; end++) {
        const boundary = estimateTextTokens(artifact.sourceMap.slice(0, end).map(line => line.text).join("\n"));
        for (const offset of [-1, 0, 1]) budgets.add(boundary + offset);
      }
      for (const value of [NaN, Infinity, -Infinity, -1, .5, 20.5]) budgets.add(value);
      for (const budget of budgets) {
        const expected = naive(artifact, budget), actual = project(summarize(budget));
        expect(actual, `fixture ${counts.indexed + counts.synthetic}, budget ${budget}`).toEqual(expected);
        counts.comparisons++;
        const selected = actual.sourceMap?.endLine ?? 0;
        if (selected > 6) counts.over6++;
        if (selected > 32) counts.over32++;
        if (actual.fallbackReason === "summary_span_exceeds_budget") counts.spanFallback++;
        else if (actual.fallbackReason) counts.blocked++;
        else if (selected === artifact.lineCount) counts.allFit++;
        else if (actual.warnings.includes("summary_truncated")) counts.truncated++;
        else counts.blankTail++;
      }
    }
    for (const key of ["allFit", "truncated", "blankTail", "spanFallback", "blocked", "over6", "over32"] as const) expect(counts[key], key).toBeGreaterThanOrEqual(10);
    expect(counts.indexed).toBeGreaterThan(0); expect(counts.synthetic).toBeGreaterThan(0);
    console.log("SUMMARIZER_DIFFERENTIAL " + JSON.stringify({ fixtures: corpus.length, ...counts }));
  }, 60000);

  it("keeps prefix estimates monotone for 128 seeded and 10 fixed Unicode cases", () => {
    const atoms = ["", " ", "\t", "alpha", "검토 기록", "かなカナ", "🙂🙂", "\ud800", "\udc00", "ordinary prose."];
    const fixed = ["", " ", "\t", "검토 기록", "かなカナ", "🙂🙂", "\ud800", "\udc00", "a\r\nb", "a\rb"];
    const sequences: string[][] = fixed.map(text => [text.replace(/\r\n|\r/g, "\n"), text.replace(/\r\n|\r/g, "\n")]);
    let state = 0x9e3779b9;
    for (let i = 0; i < 128; i++) {
      const lines = [];
      for (let j = 0; j < i % 50 + 1; j++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; lines.push(atoms[state % atoms.length]); }
      sequences.push(lines);
    }
    for (const lines of sequences) {
      let previous = 0;
      for (let count = 0; count <= lines.length; count++) {
        const estimate = estimateTextTokens(lines.slice(0, count).join("\n"));
        expect(estimate).toBeGreaterThanOrEqual(previous); previous = estimate;
      }
    }
    expect(sequences).toHaveLength(138);
  });
});
