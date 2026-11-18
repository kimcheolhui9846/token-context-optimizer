// N-34: the three line-based policy predicates (isPositiveSemanticText,
// containsTechnicalTokenShape, containsShellCommand) must use the same line
// terminators as the sourceMap (CRLF, lone CR, lone LF). Plan: PR #115 @4a5b390 §7.
// Checks go through the public classifyContext / indexArtifact + summarizeArtifact /
// MCP paths. Test names mark each variant: "[RED-CR]" rows fail on the pre-N-34
// policy, "[control]" rows pass before and after the change.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryArtifactStore, indexArtifact, summarizeArtifact } from "../src/core/artifacts.js";
import { classifyContext, lossyCompressionAllowed } from "../src/core/policy.js";
import { classifyContext as classifyF21 } from "./helpers/policy-baseline-f21.js";
import { classifyContext as classifyPreN34 } from "./helpers/policy-baseline-n32.js";
import { loadPolicyInternals } from "./helpers/policy-test-loader.js";
import { CropMcpClient, type RpcResponse } from "./helpers/crop-mcp-client.js";

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;
const TAB = String.fromCharCode(9);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const NEL = String.fromCharCode(0x85);
const SEPS = { LF, CRLF, CR } as const;

// Atoms copied from the analysis probe (codex_review/remediation-analysis-2026-11-12/n34/scripts/probe.cjs).
const P1 = "Please read this short note before the team meeting today.";
const P2 = "Everyone should bring their notes and arrive a little early.";
const T = "terraform destroy the staging stack before lunch without asking anyone";
const P3 = "The rest of this note describes the weekly plan in plain words.";

let root = "";
let fileSeq = 0;
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), "tco-n34-")); });
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

function cls(content: string) {
  const c = classifyContext(content);
  return { mode: c.mode, reasons: c.reasons };
}

async function indexed(content: string) {
  const store = new MemoryArtifactStore();
  const path = join(root, `case-${fileSeq++}.txt`);
  await writeFile(path, content, "utf8");
  const record = await indexArtifact({ path, store, allowedRoots: [root] });
  return { store, record };
}

async function summary(content: string, maxTokens: number) {
  const { store, record } = await indexed(content);
  const r = summarizeArtifact({ artifactId: record.artifactId, maxTokens, store });
  return {
    lineCount: record.lineCount,
    lines: record.sourceMap.map((line) => line.text),
    fallbackReason: r.fallbackReason,
    summary: r.summary,
    range: r.sourceMap ? [r.sourceMap.startLine, r.sourceMap.endLine] : null,
    warnings: r.warnings,
  };
}

// Same line structure with every terminator (CRLF, lone CR, lone LF) written as LF.
const toLf = (s: string) => s.replace(/\r\n|\r/gu, LF);
// Pre-N-34 equivalence target in the plan: only lone CR becomes LF (CRLF kept).
const loneCrToLf = (s: string) => s.replace(/\r(?!\n)/gu, LF);
const hasLoneCr = (s: string) => /\r(?!\n)/u.test(s);
const tag = (sep: string) => (sep === "CR" ? "[RED-CR]" : "[control]");

async function expectBlockedExact(content: string) {
  expect(cls(content)).toEqual({ mode: "exact", reasons: ["code_or_path"] });
  const r = await summary(content, 20);
  expect(r.fallbackReason).toBe("exact_content_requires_source");
  expect(r.summary).toBe("");
  expect(r.range).toBeNull();
  expect(r.warnings).toContain("lossy_summary_blocked");
}

async function expectSameAsLf(content: string) {
  const lf = toLf(content);
  expect(cls(content)).toEqual(cls(lf));
  const [a, b] = [await summary(content, 20), await summary(lf, 20)];
  expect(a.lines).toEqual(b.lines);
  expect({ ...a, lines: undefined }).toEqual({ ...b, lines: undefined });
}

describe("N-34 R1 reproduction (terraform middle line)", () => {
  for (const [name, sep] of Object.entries(SEPS)) {
    it(`${tag(name)} ${name}: exact[code_or_path] and summary blocked`, async () => {
      await expectBlockedExact([P1, T, P3].join(sep));
    });
  }
});

describe("N-34 R2 observed CR bypass forms match the same LF line structure", () => {
  const forms: Array<[string, string[], boolean]> = [
    // [id, lines, red] — middle lines copied from analysis probe.cjs / probe3.cjs / probe4.cjs;
    // red = pre-N-34 CR result differed from the LF result in those probes.
    ["systemctl", [P1, "systemctl stop the web service right after the morning sync.", P3], true],
    ["sudo systemctl", [P1, "sudo systemctl stop the web service right after the morning sync.", P3], true],
    ["doas terraform", [P1, "doas terraform destroy the old stack before lunch today.", P3], true],
    ["env git", [P1, "env git stash everything before the team call starts.", P3], true],
    ["env terraform", [P1, "env terraform destroy the old stack before lunch today.", P3], true],
    ["sudo env terraform", [P1, "sudo env terraform destroy the old stack before lunch today.", P3], true],
    ["foo=bar after '!'", ["Please read this short note before the team meeting today!", "foo=bar systemctl stop the web service right after the sync.", P3], true],
    ["quick reminder", [P1, "quick reminder", P3], true],
    ["five words without punctuation", [P1, "this middle line has five words but no punctuation", P3], true],
    ["command on last line", [P1, P3, T], true],
    ["sudo git", [P1, "sudo git stash everything before the team call starts.", P3], false],
    ["sudo -u root terraform", [P1, "sudo -u root terraform destroy the old stack before lunch.", P3], false],
    ["env -i systemctl", [P1, "env -i systemctl stop the web service right after the sync.", P3], false],
  ];
  for (const [id, lines, red] of forms) {
    for (const [name, sep] of Object.entries(SEPS)) {
      const label = name === "CR" && red ? "[RED-CR]" : "[control]";
      it(`${label} ${id} / ${name}`, async () => { await expectSameAsLf(lines.join(sep)); });
    }
  }
});

describe("N-34 R3 consecutive, mixed and reversed terminators", () => {
  const cases: Array<[string, string]> = [
    ["[RED-CR] consecutive CR", `${P1}${CR}${CR}${T}${CR}${CR}${P3}`],
    ["[control] mixed CRLF/CR/LF", `${P1}${CRLF}${T}${CR}${P3}${LF}`],
    ["[control] reversed LF CR", `${P1}${LF}${CR}${T}${LF}${CR}${P3}`],
    ["[control] CR CRLF", `${P1}${CR}${CRLF}${T}${CR}${CRLF}${P3}`],
  ];
  for (const [name, content] of cases) it(name, async () => { await expectBlockedExact(content); });
});

describe("N-34 R4 policy lines agree with sourceMap lines", () => {
  const structures: Array<[string, string[]]> = [["command", [P1, T, P3]], ["prose", [P1, P2, P3]]];
  const shapes: Array<[string, (lines: string[], sep: string) => string]> = [
    ["plain", (l, s) => l.join(s)],
    ["trailing separator", (l, s) => l.join(s) + s],
    ["leading separator", (l, s) => s + l.join(s)],
    ["blank line", (l, s) => [l[0], "", ...l.slice(1)].join(s)],
  ];
  for (const [sid, lines] of structures) {
    for (const [shape, make] of shapes) {
      for (const [name, sep] of Object.entries(SEPS)) {
        const label = name === "CR" && sid === "command" ? "[RED-CR]" : "[control]";
        it(`${label} ${sid} ${shape} / ${name}`, async () => {
          const content = make(lines, sep);
          await expectSameAsLf(content);
          const r = await summary(content, 400);
          if (r.range) expect(r.lines.slice(r.range[0] - 1, r.range[1]).join(LF)).toBe(r.summary);
        });
      }
    }
    it(`[control] ${sid} mixed terminators`, async () => {
      await expectSameAsLf([lines[0], lines[1], lines[2], ""].map((l, i) => l + [CRLF, CR, LF, ""][i]).join(""));
    });
  }
});

describe("N-34 R5 approved relaxation (D1-b)", () => {
  const lines = ["Please read this short note before the meeting today.", "--force is never used by our team in plain words.", P3];
  for (const [name, sep] of Object.entries(SEPS)) {
    it(`${tag(name)} ${name}: semantic, same summary range as LF`, async () => {
      const content = lines.join(sep);
      expect(cls(content)).toEqual({ mode: "semantic", reasons: ["natural_language"] });
      await expectSameAsLf(content);
      expect((await summary(content, 20)).range).toEqual([1, 1]);
    });
  }
});

describe("N-34 internal constant (auxiliary)", () => {
  it("[RED-CR] POLICY_LINE_BREAK is /\\r\\n|\\r|\\n/u", () => {
    const internals = loadPolicyInternals("src/core/policy.ts", ["POLICY_LINE_BREAK"]) as unknown as { POLICY_LINE_BREAK: RegExp };
    expect(internals.POLICY_LINE_BREAK).toBeInstanceOf(RegExp);
    expect(internals.POLICY_LINE_BREAK.source).toBe(String.raw`\r\n|\r|\n`);
    expect(internals.POLICY_LINE_BREAK.flags).toBe("u");
  });
});

// Plan A (run3, user-approved 2026-11-14): containsShellCommand / containsTechnicalTokenShape use a
// private array-free line scanner. Oracle: the previous `content.split(POLICY_LINE_BREAK).some(predicate)`
// on the same input — same line sequence, same return value, same predicate call prefix (early return),
// same exception propagation. Before the helper exists this block fails as a preparation failure; that
// is not a performance RED (the performance RED is the preserved run2 valid FAIL).
describe("N-34 run3 A: somePolicyLine equals split(POLICY_LINE_BREAK).some", () => {
  type Predicate = (line: string) => boolean;
  type Internals = { somePolicyLine: (content: string, predicate: Predicate) => boolean; POLICY_LINE_BREAK: RegExp };
  let internals: Internals;
  beforeAll(() => {
    internals = loadPolicyInternals("src/core/policy.ts", ["somePolicyLine", "POLICY_LINE_BREAK"]) as unknown as Internals;
  });

  const HIGH = String.fromCharCode(0xd83d);
  const LOW = String.fromCharCode(0xde00);
  const ALPHABET = [CR, LF, "x", " ", LS, PS, NEL, "|", HIGH + LOW, HIGH, LOW];
  const STOP = new Error("stop");

  // Returns a description of the first difference, or null.
  function differs(content: string): string | null {
    const expected = content.split(internals.POLICY_LINE_BREAK);
    const run = (fn: (p: Predicate) => boolean, decide: (call: number, line: string) => boolean) => {
      const calls: string[] = [];
      let result: unknown;
      let error: unknown;
      try {
        result = fn((line) => { calls.push(line); return decide(calls.length, line); });
      } catch (caught) {
        error = caught;
      }
      return JSON.stringify({ result, error: error === undefined ? null : String(error), same: error === STOP, calls });
    };
    const oracle = (p: Predicate) => content.split(internals.POLICY_LINE_BREAK).some(p);
    const actual = (p: Predicate) => internals.somePolicyLine(content, p);
    const n = expected.length;
    const mid = Math.floor((n - 1) / 2);
    const decisions: Array<[string, (call: number) => boolean]> = [
      ["alwaysFalse", () => false],
      ["alwaysTrue", () => true],
      ["hitFirst", (call) => call === 1],
      ["hitMiddle", (call) => call === mid + 1],
      ["hitLast", (call) => call === n],
      ["throwFirst", () => { throw STOP; }],
      ["throwMiddle", (call) => { if (call === mid + 1) throw STOP; return false; }],
    ];
    for (const [name, decide] of decisions) {
      const want = run(oracle, decide);
      const got = run(actual, decide);
      if (want !== got) return `${name} ${JSON.stringify(content)}: want ${want} got ${got}`;
    }
    return null;
  }

  function* exhaustive(maxLength: number): Generator<string> {
    const atoms = [CR, LF, "x"];
    let level = [""];
    yield "";
    for (let length = 1; length <= maxLength; length++) {
      const next: string[] = [];
      for (const prefix of level) for (const atom of atoms) { next.push(prefix + atom); yield prefix + atom; }
      level = next;
    }
  }

  it("explicit boundaries: empty, lone/consecutive/leading/trailing CR and LF, CRLF first, LS/PS/NEL, surrogates", () => {
    const cases = ["", CR, LF, CRLF, CR + CR, LF + CR, CRLF + LF, CR + CRLF, "a" + CR, CR + "a", "a" + CRLF + "b" + CR + "c" + LF,
      "a" + CR + CR + "b", LF + LF + "a" + LF, "a" + LS + "b" + PS + "c" + NEL + "d", HIGH + LOW + CR + HIGH + LF + LOW, "a" + CR + LF + LF + CR];
    for (const content of cases) expect(differs(content)).toBeNull();
    const lines: string[] = [];
    expect(internals.somePolicyLine("", (line) => { lines.push(line); return false; })).toBe(false);
    expect(lines).toEqual([""]);
  });

  it("exhaustive {CR, LF, x} strings of length 0..8 (9,841 cases)", () => {
    let count = 0;
    let first: string | null = null;
    let mismatches = 0;
    for (const content of exhaustive(8)) {
      count++;
      const diff = differs(content);
      if (diff) { mismatches++; first ??= diff; }
    }
    expect(count).toBe(9841);
    expect({ mismatches, first }).toEqual({ mismatches: 0, first: null });
  }, 60_000);

  it("seeded random strings over CR, LF, x, space, LS, PS, NEL, pipe and surrogates (200,000 cases)", () => {
    let seed = 0x34c0ffee >>> 0;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    let first: string | null = null;
    let mismatches = 0;
    for (let i = 0; i < 200000; i++) {
      const length = Math.floor(random() * 40);
      let content = "";
      for (let j = 0; j < length; j++) content += ALPHABET[Math.floor(random() * ALPHABET.length)];
      const diff = differs(content);
      if (diff) { mismatches++; first ??= diff; }
    }
    expect({ mismatches, first }).toEqual({ mismatches: 0, first: null });
  }, 60_000);
});

describe("N-34 M1 MCP (rebuilt bin)", () => {
  function result(response: RpcResponse): any {
    if (response.error) throw new Error(`MCP error: ${JSON.stringify(response.error)}`);
    return JSON.parse(response.result.content[0].text);
  }
  for (const [name, sep] of Object.entries(SEPS)) {
    it(`${tag(name)} ${name}: classify_context exact and summarize_artifact blocked`, async () => {
      const dir = await mkdtemp(join(tmpdir(), "tco-n34-mcp-"));
      const content = [P1, T, P3].join(sep);
      const path = join(dir, "note.txt");
      await writeFile(path, content, "utf8");
      const client = await CropMcpClient.start(undefined, dir);
      try {
        const c = result(await client.call("classify_context", { text: content }));
        expect(c.mode).toBe("exact");
        expect(c.reasons).toEqual(["code_or_path"]);
        const record = result(await client.call("index_artifact", { path }));
        const s = result(await client.call("summarize_artifact", { artifactId: record.artifactId, maxTokens: 20 }));
        expect(s.fallbackReason).toBe("exact_content_requires_source");
        expect(s.summary).toBe("");
        expect(s.sourceMap).toBeNull();
      } finally {
        await client.close();
        await rm(dir, { recursive: true, force: true });
      }
    }, 30_000);
  }
});

describe("N-34 controls (pass before and after)", () => {
  it("[control] G1 LF/CRLF-only seeded corpus equals the frozen F-21 oracle", () => {
    const atoms = [P1, P2, P3, T, "systemctl stop the web service now.", "Everyone should bring notes and arrive early.", "quick reminder",
      "--force is never used here in plain words.", "The NASA team joins later today, fine.", "run deploy after lunch today please.", "x", ""];
    const seps = [LF, CRLF, LF + LF, CRLF + CRLF, " "];
    let state = 0x34f21001;
    const rnd = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
    for (let i = 0; i < 1200; i++) {
      const k = 1 + rnd(5);
      let s = "";
      for (let j = 0; j < k; j++) { s += atoms[rnd(atoms.length)]; if (j < k - 1 || rnd(3) === 0) s += seps[rnd(seps.length)]; }
      expect(hasLoneCr(s)).toBe(false);
      expect(classifyContext(s), JSON.stringify(s)).toEqual(classifyF21(s));
    }
  });

  it("[control] G3 U+2028/U+2029/NEL are not policy or sourceMap line breaks", async () => {
    for (const sep of [LS, PS, NEL]) {
      const content = [P1, T, P3].join(sep);
      expect(cls(content)).toEqual({ mode: "semantic", reasons: ["natural_language"] });
      expect((await indexed(content)).record.lineCount).toBe(1);
    }
  });

  it("[control] G4 pipe table: CR unknown, LF exact[numeric_or_table] (LF-only rule kept)", () => {
    const rows = ["| name | value |", "| alpha | beta |", "| gamma | delta |"];
    expect(cls(rows.join(CR))).toEqual({ mode: "unknown", reasons: ["insufficient_semantic_signal"] });
    expect(cls(rows.join(LF))).toEqual({ mode: "exact", reasons: ["numeric_or_table"] });
  });

  it("[control] G5 pure prose joined by CR stays semantic and is summarized", async () => {
    const content = [P1, P2, P3].join(CR);
    expect(cls(content)).toEqual({ mode: "semantic", reasons: ["natural_language"] });
    const r = await summary(content, 20);
    expect(r.fallbackReason).toBeNull();
    expect(r.range).toEqual([1, 1]);
  });

  it("[control] G6 trailing / leading CR keep the pre-N-34 result", async () => {
    const trailing = await summary(`${P1}${CR}${P3}${CR}`, 20);
    expect(cls(`${P1}${CR}${P3}${CR}`).mode).toBe("semantic");
    expect([trailing.lineCount, trailing.range]).toEqual([2, [1, 1]]);
    const leading = await summary(`${CR}${P1}${CR}${P3}`, 20);
    expect(cls(`${CR}${P1}${CR}${P3}`).mode).toBe("semantic");
    expect([leading.lineCount, leading.range]).toEqual([3, [1, 2]]);
  });
});

describe("N-34 acceptance criteria 2-3 (seeded differential corpus, analysis seed)", () => {
  // Same atoms, separators, seed and generator as the analysis probe (6,000 cases).
  const atoms = [P1, P3, T, "systemctl stop the web service now.", "foo=bar systemctl stop it now.", "sudo -u root terraform plan for the team.",
    "--force is never used here in plain words.", "Everyone should bring notes and arrive early.", "quick reminder", "| a | b |",
    "The NASA team joins later today, fine.", "run deploy after lunch today please.", "today.", "x", "", "  ", TAB];
  const seps = [LF, CRLF, CR, CR + CR, LF + CR, CR + CRLF, LS, PS];
  const corpus: string[] = [];
  let state = 0x34c0ffee;
  const rnd = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
  for (let i = 0; i < 6000; i++) {
    const k = 1 + rnd(5);
    let s = "";
    for (let j = 0; j < k; j++) { s += atoms[rnd(atoms.length)]; if (j < k - 1 || rnd(3) === 0) s += seps[rnd(seps.length)]; }
    corpus.push(s);
  }
  const key = (c: { mode: string; reasons: string[] }) => JSON.stringify([c.mode, c.reasons]);

  it("[control] criterion 2: inputs without lone CR classify exactly as pre-N-34", () => {
    const noLoneCr = corpus.filter((s) => !hasLoneCr(s));
    expect(noLoneCr).toHaveLength(1834);
    for (const s of noLoneCr) expect(classifyContext(s), JSON.stringify(s)).toEqual(classifyPreN34(s));
  });

  it("[RED-CR] criterion 3: lone-CR inputs match pre-N-34(lone CR -> LF) on summary permission; other diffs are pipe-table only", () => {
    const loneCr = corpus.filter(hasLoneCr);
    expect(loneCr).toHaveLength(4166);
    let pipeReasonsOnly = 0;
    let pipeModeDiff = 0;
    const unexplained: string[] = [];
    for (const s of loneCr) {
      const cand = classifyContext(s);
      const ref = classifyPreN34(loneCrToLf(s));
      expect(lossyCompressionAllowed(cand), JSON.stringify(s)).toBe(lossyCompressionAllowed(ref));
      if (key(cand) === key(ref)) continue;
      const onlyInRef = ref.reasons.filter((r) => !cand.reasons.includes(r));
      const onlyInCand = cand.reasons.filter((r) => !ref.reasons.includes(r));
      const pipeExplained = s.includes("|") && JSON.stringify(onlyInRef) === JSON.stringify(["numeric_or_table"]) &&
        onlyInCand.every((r) => r === "insufficient_semantic_signal");
      if (!pipeExplained) unexplained.push(JSON.stringify(s));
      else if (cand.mode === ref.mode) pipeReasonsOnly++;
      else pipeModeDiff++;
    }
    console.info(`[n34] criterion 3 pipe-table-only classification diffs: reasonsOnly=${pipeReasonsOnly} modeDiff=${pipeModeDiff}`);
    expect(unexplained).toEqual([]);
    expect([pipeReasonsOnly, pipeModeDiff]).toEqual([159, 88]);
  });
});
