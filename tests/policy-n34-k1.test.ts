// N-34 K1 (review_2026-11-15_n34-k1-implementation-request): hasTechnicalTokenShape and
// isShellCommandLine return false at once for an empty line. Both already returned false there,
// so the functional checks below are not RED before the change (no functional RED exists).
// "[scope]" fails before the change on purpose: it is a scope guard, not a performance result.
// Oracle: the pre-K1 policy (7e732e0) rebuilt from the current source by removing exactly the
// two guards, pinned to the 7e732e0 blob hash. Helpers and frozen baselines are not changed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyContext as publicClassify, lossyCompressionAllowed as publicLossy } from "../src/core/policy.js";
import type { ContextClassification } from "../src/core/types.js";
import { policyCorpus } from "./helpers/policy-corpus.js";

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;
const TAB = String.fromCharCode(9);
const NBSP = String.fromCharCode(0xa0);
const IDEO = String.fromCharCode(0x3000);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const NEL = String.fromCharCode(0x85);

const GUARD = "  if (line.length === 0) return false;" + LF;
const PRE_K1_BLOB_SHA256 = "a44c77d7cf5f48a89dd7f4cf111efea1324fb8a82677b4c17d412c709fb6e28a"; // git show 7e732e0:src/core/policy.ts (LF)

type Internals = {
  classifyContext(content: string): ContextClassification;
  lossyCompressionAllowed(classification: ContextClassification): boolean;
  hasTechnicalTokenShape(line: string): boolean;
  isShellCommandLine(line: string): boolean;
  containsTechnicalTokenShape(content: string): boolean;
  containsShellCommand(content: string): boolean;
  TRACE_PREFIX_SCAN: RegExp;
};

type CompilableModule = Module & { paths: string[]; _compile(source: string, filename: string): unknown };
const nodePaths = Module as typeof Module & { _nodeModulePaths(from: string): string[] };

// Same transpile path as tests/helpers/policy-test-loader.ts, but from source text.
function compilePolicy(text: string): Internals {
  const root = process.cwd();
  const sourcePath = resolve(root, "src/core/policy.ts");
  const names = ["hasTechnicalTokenShape", "isShellCommandLine", "containsTechnicalTokenShape", "containsShellCommand", "TRACE_PREFIX_SCAN"];
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const js = ts.transpileModule(`${text}${LF}export { ${names.join(", ")} };${LF}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = new Module(sourcePath) as CompilableModule;
  compiled.filename = sourcePath;
  compiled.paths = nodePaths._nodeModulePaths(root);
  compiled._compile(js, sourcePath);
  return compiled.exports as Internals;
}

const productText = readFileSync("src/core/policy.ts", "utf8").replaceAll(CRLF, LF);
const guardCount = productText.split(GUARD).length - 1;
const preK1Text = productText.replaceAll(GUARD, "");
const k1 = compilePolicy(productText);
const pre = compilePolicy(preK1Text);

describe("N-34 K1 source scope and pre-K1 oracle", () => {
  it("[scope] product has the K1 guard exactly twice (fails before K1 by design)", () => {
    expect(guardCount).toBe(2);
    const technical = productText.indexOf("function hasTechnicalTokenShape(line: string): boolean {" + LF + GUARD);
    const shell = productText.indexOf("function isShellCommandLine(line: string): boolean {" + LF + GUARD);
    expect(technical).toBeGreaterThan(0);
    expect(shell).toBeGreaterThan(0);
  });

  it("[control] product minus the guards is byte-identical to the 7e732e0 policy (LF)", () => {
    expect(createHash("sha256").update(preK1Text).digest("hex")).toBe(PRE_K1_BLOB_SHA256);
  });
});

describe("N-34 K1 predicate literals (independent of the oracle)", () => {
  const empties = [""];
  const blankNonEmpty = [" ", "  ", TAB, NBSP, IDEO, LS, PS, NEL, " " + TAB + IDEO];
  it("[control] empty line is false for both predicates in both versions", () => {
    for (const m of [pre, k1]) for (const line of empties) {
      expect(m.hasTechnicalTokenShape(line)).toBe(false);
      expect(m.isShellCommandLine(line)).toBe(false);
    }
  });

  it("[control] whitespace-only non-empty lines still take the full path and stay false", () => {
    for (const m of [pre, k1]) for (const line of blankNonEmpty) {
      expect(m.hasTechnicalTokenShape(line), JSON.stringify(line)).toBe(false);
      expect(m.isShellCommandLine(line), JSON.stringify(line)).toBe(false);
    }
    // The full path still runs hasTraceLikeValue, which resets the trace scanner to 0.
    expect(k1.hasTechnicalTokenShape("trace: abcdef123456")).toBe(true);
    expect(k1.TRACE_PREFIX_SCAN.lastIndex).toBeGreaterThan(0);
    expect(k1.hasTechnicalTokenShape(" ")).toBe(false);
    expect(k1.TRACE_PREFIX_SCAN.lastIndex).toBe(0);
  });

  it("[control] positive and negative literals agree in both versions", () => {
    const shell: Array<[string, boolean]> = [
      ["terraform plan", true], ["sudo -u root terraform plan", true], ["foo=bar systemctl stop web", true],
      ["Please read this short note before the team meeting today.", false], ["quick reminder", false],
    ];
    const technical: Array<[string, boolean]> = [
      ["trace: abcdef123456", true], ["span=0123456789 ok", true], ["see src/core/policy.ts now", true],
      ["user_id is set", true], ["run deploy after lunch", true],
      ["Please read this short note before the team meeting today.", false], ["quick reminder", false],
    ];
    for (const m of [pre, k1]) {
      for (const [line, want] of shell) expect(m.isShellCommandLine(line), line).toBe(want);
      for (const [line, want] of technical) expect(m.hasTechnicalTokenShape(line), line).toBe(want);
    }
  });
});

describe("N-34 K1 repeated call sequences", () => {
  const sequence = ["trace: abcdef123456", "", "Please read this note.", "span=0123456789 ok", "", " ", "", "trace: abcdef123456", "user_id x", ""];
  const run = (m: Internals) => {
    m.TRACE_PREFIX_SCAN.lastIndex = 0;
    const results: boolean[] = [];
    const lastIndex: number[] = [];
    for (let round = 0; round < 3; round++) for (const line of sequence) {
      results.push(m.hasTechnicalTokenShape(line));
      lastIndex.push(m.TRACE_PREFIX_SCAN.lastIndex);
    }
    return { results, lastIndex };
  };

  it("[control] trace positive -> empty -> negative -> positive (3 rounds): same results in both versions", () => {
    const want = [true, false, false, true, false, false, false, true, true, false];
    expect(run(pre).results).toEqual([...want, ...want, ...want]);
    expect(run(k1).results).toEqual([...want, ...want, ...want]);
  });

  it("[scope] the private TRACE_PREFIX_SCAN.lastIndex differs only right after empty lines (fails before K1 by design)", () => {
    const a = run(pre);
    const b = run(k1);
    // Pre-K1 resets to 0 on an empty line; K1 skips the call and keeps the previous value.
    // hasTraceLikeValue resets lastIndex on every entry, so this state is never read.
    const idx = sequence.indexOf("");
    expect(a.lastIndex[idx]).toBe(0);
    expect(b.lastIndex[idx]).toBe(b.lastIndex[idx - 1]);
    expect(b.lastIndex[idx]).toBeGreaterThan(0);
    const differing = a.lastIndex.map((v, i) => (v === b.lastIndex[i] ? -1 : i)).filter((i) => i >= 0);
    const empties = differing.every((i) => sequence[i % sequence.length] === "");
    expect(empties).toBe(true);
  });

  it("[control] classifyContext over a repeated mixed-terminator sequence: same mode/reasons/warnings and summary permission", () => {
    const docs = [
      "trace: abcdef123456" + CR + CR + "plain words",
      LF + LF + "terraform destroy the staging stack" + CRLF + CRLF,
      "Please read this short note before the team meeting today." + CR + "Everyone should bring their notes and arrive a little early.",
      CR + LF + CR + "user_id appears here" + LF + CR,
      "",
      " " + CR + IDEO + LF + NEL,
      "span=0123456789 ok" + CRLF + CR + LF + "quick reminder",
    ];
    for (let round = 0; round < 3; round++) for (const doc of docs) {
      const a = pre.classifyContext(doc);
      const b = k1.classifyContext(doc);
      expect(b, JSON.stringify(doc)).toEqual(a);
      expect(k1.lossyCompressionAllowed(b)).toBe(pre.lossyCompressionAllowed(a));
      expect(publicClassify(doc)).toEqual(b);
    }
  });
});

describe("N-34 K1 differential corpus (pre-K1 vs K1)", () => {
  const compare = (content: string): string | null => {
    const a = pre.classifyContext(content);
    const b = k1.classifyContext(content);
    const got = JSON.stringify([b, k1.lossyCompressionAllowed(b), k1.containsShellCommand(content), k1.containsTechnicalTokenShape(content)]);
    const want = JSON.stringify([a, pre.lossyCompressionAllowed(a), pre.containsShellCommand(content), pre.containsTechnicalTokenShape(content)]);
    return got === want ? null : `${JSON.stringify(content)}: want ${want} got ${got}`;
  };
  const check = (contents: Iterable<string>) => {
    let count = 0;
    let mismatches = 0;
    let first: string | null = null;
    for (const content of contents) {
      count++;
      const diff = compare(content);
      if (diff) { mismatches++; first ??= diff; }
    }
    return { count, mismatches, first };
  };

  it("[control] existing policy corpus", () => {
    const r = check(policyCorpus.map((c) => c.content));
    expect(r.count).toBe(policyCorpus.length);
    expect({ mismatches: r.mismatches, first: r.first }).toEqual({ mismatches: 0, first: null });
  });

  it("[control] exhaustive {CR, LF, space, t} strings of length 0..7 (21,845 cases)", () => {
    function* all(): Generator<string> {
      const atoms = [CR, LF, " ", "t"];
      let level = [""];
      yield "";
      for (let length = 1; length <= 7; length++) {
        const next: string[] = [];
        for (const prefix of level) for (const atom of atoms) { next.push(prefix + atom); yield prefix + atom; }
        level = next;
      }
    }
    const r = check(all());
    expect(r.count).toBe(21845);
    expect({ mismatches: r.mismatches, first: r.first }).toEqual({ mismatches: 0, first: null });
  }, 60_000);

  it("[control] seeded documents mixing prose, commands, identifiers, trace values, blanks and all terminators (20,000 cases)", () => {
    const atoms = [
      "Please read this short note before the team meeting today.", "Everyone should bring their notes and arrive a little early.",
      "terraform destroy the staging stack before lunch", "sudo -u root terraform plan", "foo=bar systemctl stop web",
      "trace: abcdef123456", "span=0123456789 ok", "request_id=zzzzzz99", "user_id is set", "see src/core/policy.ts now",
      "run deploy after lunch", "--force is never used here.", "| a | b |", "quick reminder", "x", "", " ", "  ", TAB, NBSP, IDEO,
    ];
    const seps = [LF, CRLF, CR, CR + CR, LF + LF, LF + CR, CR + CRLF, CRLF + CRLF, LS, PS, NEL];
    let state = 0x4b1e0000 >>> 0;
    const rnd = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
    function* docs(): Generator<string> {
      for (let i = 0; i < 20000; i++) {
        let s = rnd(4) === 0 ? seps[rnd(seps.length)] : "";
        const k = 1 + rnd(6);
        for (let j = 0; j < k; j++) { s += atoms[rnd(atoms.length)]; if (j < k - 1 || rnd(3) === 0) s += seps[rnd(seps.length)]; }
        yield s;
      }
    }
    const r = check(docs());
    expect(r.count).toBe(20000);
    expect({ mismatches: r.mismatches, first: r.first }).toEqual({ mismatches: 0, first: null });
  }, 60_000);

  it("[control] compiled K1 module matches the public product exports", () => {
    for (const c of policyCorpus.slice(0, 200)) {
      const b = k1.classifyContext(c.content);
      expect(publicClassify(c.content)).toEqual(b);
      expect(publicLossy(publicClassify(c.content))).toBe(k1.lossyCompressionAllowed(b));
    }
  });
});
