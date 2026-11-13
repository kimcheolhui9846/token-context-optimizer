import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classifyContext } from "../src/core/policy.js";
import { classifyContext as baseline } from "./helpers/policy-baseline-n32.js";
import { evaluatePolicyPredicate, loadPolicyInternals } from "./helpers/policy-test-loader.js";

type Classification = ReturnType<typeof classifyContext>;

// Output codes are hand-authored aliases for complete classification records.
// 0=exact/secret, 1=unknown, 2=semantic, 3=exact/identifier+code,
// 4=secret+identifier+code; 5=code_syntax; 6=secret+code_syntax;
// 7=code_syntax+identifier+code; 8=secret+code_syntax+identifier+code.
// No output literal is produced by a classifier.
const OUTPUTS: readonly Classification[] = [
  { mode: "exact", reasons: ["secret"], warnings: ["lossy_compression_not_allowed"] },
  { mode: "unknown", reasons: ["insufficient_semantic_signal"], warnings: ["lossy_compression_not_allowed"] },
  { mode: "semantic", reasons: ["natural_language"], warnings: [] },
  { mode: "exact", reasons: ["identifier_or_hash", "code_or_path"], warnings: ["lossy_compression_not_allowed"] },
  { mode: "exact", reasons: ["secret", "identifier_or_hash", "code_or_path"], warnings: ["lossy_compression_not_allowed"] },
  { mode: "exact", reasons: ["code_syntax"], warnings: ["lossy_compression_not_allowed"] },
  { mode: "exact", reasons: ["secret", "code_syntax"], warnings: ["lossy_compression_not_allowed"] },
  { mode: "exact", reasons: ["code_syntax", "identifier_or_hash", "code_or_path"], warnings: ["lossy_compression_not_allowed"] },
  { mode: "exact", reasons: ["secret", "code_syntax", "identifier_or_hash", "code_or_path"], warnings: ["lossy_compression_not_allowed"] },
] as const;

const forms = [
  ["plain-colon", (l: string) => `${l}:`], ["fullwidth-colon", (l: string) => `${l}：`],
  ["space-fullwidth", (l: string) => `${l} ：`], ["bold-out", (l: string) => `**${l}**:`],
  ["bold-in", (l: string) => `**${l}:**`], ["bold-out-fw", (l: string) => `**${l}**：`],
  ["italic-star", (l: string) => `*${l}*:`], ["bold-italic", (l: string) => `***${l}***:`],
  ["bold-space", (l: string) => `**${l}** :`], ["bold-us", (l: string) => `__${l}__:`],
  ["italic-us", (l: string) => `_${l}_:`], ["strike", (l: string) => `~~${l}~~:`],
  ["code-span", (l: string) => `\`${l}\`:`], ["dquote", (l: string) => `"${l}":`],
  ["squote", (l: string) => `'${l}':`], ["paren", (l: string) => `(${l}):`],
  ["bracket", (l: string) => `[${l}]:`], ["equals-bold", (l: string) => `**${l}**=`],
  ["dquote-space", (l: string) => `"${l}" :`], ["dquote-fw", (l: string) => `"${l}"：`],
  ["dquote-equals", (l: string) => `"${l}"=`], ["json-open", (l: string) => `{"${l}":`],
  ["dquote-bold", (l: string) => `**"${l}"**:`], ["paren-fw", (l: string) => `(${l})：`],
  ["curly-dquote", (l: string) => `“${l}”:`], ["curly-squote", (l: string) => `‘${l}’:`],
  ["fw-paren", (l: string) => `（${l}）:`], ["corner", (l: string) => `「${l}」:`],
  ["double-corner", (l: string) => `『${l}』:`], ["dquote-unopened", (l: string) => `${l}":`],
  ["paren-unopened", (l: string) => `${l}):`],
] as const;

// Hand-authored output/tuple literals: before is f612; after follows approved U3.
// Columns: language, label, before31, after31, beforeTuple31, afterTuple31.
const matrix = [
  ["en","password","00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 12 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","Password","00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 12 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","api key","00 00 00 00 00 00 00 00 00 33 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 33 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","API_KEY","44 44 44 44 44 44 44 44 44 11 11 33 33 33 33 33 33 44 33 33 33 37 33 33 33 33 33 33 33 33 33","44 44 44 44 44 44 44 44 44 11 11 33 33 44 44 44 33 44 44 44 44 48 33 44 44 44 44 44 44 44 44","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","token","00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 12 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","secret","00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 12 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","passphrase","00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 12 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","pass","00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 12 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","recovery codes","00 00 00 00 00 00 00 00 00 33 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 33 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["en","client secret","00 00 00 00 00 00 00 00 00 33 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 33 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["ko","비밀번호","00 00 00 00 00 00 00 00 00 11 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 11 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["ko","암호","00 00 00 00 00 00 00 00 00 11 12 12 11 12 12 12 11 00 12 12 12 15 12 12 12 12 12 12 12 12 12","00 00 00 00 00 00 00 00 00 11 12 12 11 00 00 00 11 00 00 00 00 06 12 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
  ["ko","API 키","00 00 00 00 00 00 00 00 00 11 11 11 11 11 11 11 11 00 11 11 11 15 11 11 11 11 11 11 11 11 11","00 00 00 00 00 00 00 00 00 11 11 11 11 00 00 00 11 00 00 00 00 06 11 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 00 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 00 00","11 11 11 11 11 11 11 11 11 00 00 00 00 11 11 11 00 11 11 11 11 11 00 11 11 11 11 11 11 11 11"],
] as const;

const sentence = (lang: string, token: string) => lang === "en"
  ? `Guest wifi ${token} hunter2 is taped under the desk for visitors.`
  : `회의실 ${token} hunter2 이니까 접속할 때 참고해 주세요.`;
const cases = matrix.flatMap(([lang, label, beforeCodes, afterCodes, beforeBits, afterBits]) => forms.flatMap(([name, make], i) => {
  const token = make(label);
  return [token + " hunter2", sentence(lang, token)].map((content, placement) => ({
    id: `${lang}/${label}/${name}/${placement === 0 ? "standalone" : "sentence"}`, content,
    before: OUTPUTS[Number(beforeCodes.split(" ")[i][placement])],
    after: OUTPUTS[Number(afterCodes.split(" ")[i][placement])],
    beforeTuple: beforeBits.split(" ")[i][placement] === "1",
    afterTuple: afterBits.split(" ")[i][placement] === "1",
  }));
}));
const expectedRedIds = cases.filter(c => JSON.stringify(c.before) !== JSON.stringify(c.after)).map(c => c.id);

describe("N-32 quoted-label literal matrix", () => {
  const frozen = loadPolicyInternals("tests/helpers/policy-baseline-n32.ts");
  const current = loadPolicyInternals("src/core/policy.ts");
  it("has 806 independent outputs and 390 approved new positive placements", () => {
    expect(forms).toHaveLength(31); expect(matrix).toHaveLength(13); expect(cases).toHaveLength(806);
    for (const [, , before, after, beforeBits, afterBits] of matrix) {
      expect(before).toMatch(/^[0-8]{2}( [0-8]{2}){30}$/);
      expect(after).toMatch(/^[0-8]{2}( [0-8]{2}){30}$/);
      expect(beforeBits).toMatch(/^[01]{2}( [01]{2}){30}$/);
      expect(afterBits).toMatch(/^[01]{2}( [01]{2}){30}$/);
    }
    const changedForms = ["dquote", "squote", "paren", "dquote-space", "dquote-fw", "dquote-equals", "json-open", "paren-fw", "curly-dquote", "curly-squote", "fw-paren", "corner", "double-corner", "dquote-unopened", "paren-unopened"];
    expect([...new Set(cases.filter(c => c.beforeTuple !== c.afterTuple).map(c => c.id.split("/")[2]))].sort()).toEqual([...changedForms].sort());
    for (const c of cases) if (!changedForms.includes(c.id.split("/")[2])) {
      expect(c.after).toEqual(c.before); expect(c.afterTuple).toBe(c.beforeTuple);
    }
    expect(expectedRedIds).toHaveLength(390);
    expect(cases.filter(c => !c.beforeTuple && c.afterTuple)).toHaveLength(390);
  });
  it.each(cases)("literal $id", ({ content, before, after, beforeTuple, afterTuple }) => {
    expect(baseline(content)).toEqual(before);
    expect(evaluatePolicyPredicate(frozen.EXACT_PATTERNS[0][1], content)).toBe(beforeTuple);
    expect(classifyContext(content)).toEqual(after);
    expect(evaluatePolicyPredicate(current.EXACT_PATTERNS[0][1], content)).toBe(afterTuple);
  });
});

const extraCurrent = loadPolicyInternals("src/core/policy.ts");
// Accepted overprotection and deliberately unsupported overlaps.
// Every expected record below is hand-authored from the predesign semantics and
// frozen N-27 boundary contract; no classifier output was used to generate it.
const n32ExtraUnknown = {
  mode: "unknown", reasons: ["insufficient_semantic_signal"],
  warnings: ["lossy_compression_not_allowed"],
} as const;
const n32ExtraSemantic = {
  mode: "semantic", reasons: ["natural_language"], warnings: [],
} as const;
const n32ExtraCode = {
  mode: "exact", reasons: ["identifier_or_hash", "code_or_path"],
  warnings: ["lossy_compression_not_allowed"],
} as const;
const n32ExtraSecret = {
  mode: "exact", reasons: ["secret"],
  warnings: ["lossy_compression_not_allowed"],
} as const;

const n32PredesignNegatives = [
  ["The \"password manager\" app keeps every login safe across devices.", n32ExtraSemantic],
  ["The \"token-based\": approach scales better for many clients.", n32ExtraSemantic],
  ["A \"passport\": issued by the state department for travel abroad.", n32ExtraSemantic],
  ["Our \"passwords\": rotate them every ninety days according to policy.", n32ExtraSemantic],
  ["The (token bucket): a classic rate limiter for public endpoints.", n32ExtraSemantic],
  ["It's the password's owner who must rotate it, not the admin team.", n32ExtraSemantic],
  ["The \"secret sauce\": always test with real data before release.", { mode: "exact", reasons: ["code_or_path"], warnings: ["lossy_compression_not_allowed"] }],
  ["The **password manager** keeps every login safe across your devices.", n32ExtraSemantic],
  ["Use a **token-based** approach: it scales better for many clients.", n32ExtraSemantic],
  ["We stored it in my__password__: wait, that name was never used here.", n32ExtraCode],
  ["The password_hash: value is computed on the server and never shown.", n32ExtraCode],
  ["Remember this **secret** of the trade: always test with real data.", { mode: "exact", reasons: ["code_or_path"], warnings: ["lossy_compression_not_allowed"] }],
  ["The **token-based** flow: every client refreshes its session hourly.", n32ExtraCode],
  ["A **passport**: issued by the state department for travel abroad.", n32ExtraSemantic],
  ["Our **passwords**: rotate them every ninety days according to policy.", n32ExtraSemantic],
  ["**Secret Santa**: draw names at the party and keep them to yourself.", n32ExtraSemantic],
] as const;

describe("N-32 predesign negatives and overprotection", () => {
  it.each(n32PredesignNegatives)("preserves negative literal %s", (content, expected) => {
    expect(classifyContext(content)).toEqual(expected);
    expect(evaluatePolicyPredicate(extraCurrent.EXACT_PATTERNS[0][1], content)).toBe(false);
  });

  const n32Overprotection = [
    "The \"token\": field in the response describes how billing is counted.",
    "Each \"secret\": entry in the config schema is optional for now.",
    "We call this the (token): the smallest unit the model reads at once.",
    "He whispered 'I forgot my password': then he left the room quietly.",
    "Type it again (your password): the form will remember the rest.",
    "응답의 \"토큰\": 항목은 과금 방식을 설명하는 필드입니다.",
    "Results were \"pass\": yes and \"fail\": no for this run.",
    "Set \"token\": null when the user logs out of the app.",
  ] as const;
  it.each(n32Overprotection)("records accepted overprotection: %s", content => {
    expect(classifyContext(content)).toEqual(n32ExtraSecret);
    expect(evaluatePolicyPredicate(extraCurrent.EXACT_PATTERNS[0][1], content)).toBe(true);
  });
});

const n32CodeExamples = [
  "def login(password):", "def verify(token):", "(token) => token",
  ".map((pass) => pass)", "(secret)===x",
] as const;
describe("N-32 accepted code examples and overlap forms", () => {
  it.each(n32CodeExamples)("classifies accepted code example as secret: %s", content => {
    expect(classifyContext(content)).toEqual(n32ExtraSecret);
    expect(evaluatePolicyPredicate(extraCurrent.EXACT_PATTERNS[0][1], content)).toBe(true);
  });
  it("retains TypeScript return-type syntax alongside the accepted secret match", () => {
    expect(evaluatePolicyPredicate(extraCurrent.EXACT_PATTERNS[0][1], "verify(token): Promise<boolean>")).toBe(true);
    expect(classifyContext("verify(token): Promise<boolean>")).toEqual({ mode: "exact", reasons: ["secret", "code_syntax"], warnings: ["lossy_compression_not_allowed"] });
  });
  const n32OverlapUnsupported = [
    '**"password"**: hunter2', '"**password**": hunter2', '("password"): hunter2', "('password'): hunter2", '"(password)": hunter2',
  ] as const;
  it.each(n32OverlapUnsupported)("preserves unprotected overlap: %s", content => {
    expect(classifyContext(content)).toEqual(n32ExtraUnknown);
    expect(evaluatePolicyPredicate(extraCurrent.EXACT_PATTERNS[0][1], content)).toBe(false);
  });
});


const n32FrozenRegexes = [
  /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\*{0,3}\s*[:=：]/iu,
  /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\*{0,3}\s*[:=：]/i,
  /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\*{0,3}\s*[:=：]/i,
  /(?<![A-Za-z0-9])api[ \t]?키\*{0,3}\s*[:=：]/i,
];

describe("N-32 frozen N-27 differential and residual limits", () => {
  const frozen = loadPolicyInternals("tests/helpers/policy-baseline-n32.ts");
  const current = loadPolicyInternals("src/core/policy.ts");
  it("preserves flags, tuple order, other predicates and all frozen positives", () => {
    expect(n32FrozenRegexes.map(r => r.flags)).toEqual(["iu", "i", "i", "i"]);
    expect(current.EXACT_PATTERNS.map(([r]) => r)).toEqual(frozen.EXACT_PATTERNS.map(([r]) => r));
    expect(current.EXACT_PATTERNS.slice(1).map(([,p]) => p.toString())).toEqual(frozen.EXACT_PATTERNS.slice(1).map(([,p]) => p.toString()));
    const inputs = cases.map(c => c.content);
    for (const label of ["password","api_key","passwd","pwd","passphrase","pass","passcode","pass phrase","credentials","private key","recovery codes","secret answer","backup codes","비밀번호","비번","인증키","토큰","API 키"])
      for (const prefix of ["", "Guest wifi ", "_", "a", "카카오"])
        for (const closing of ["", "*", "**", "***"])
          for (const gap of ["", " ", "\t", "\n", "\u00a0", "\u3000"])
            for (const sep of [":", "=", "："]) inputs.push(prefix+label+closing+gap+sep+" hunter2");
    const hits = [0,0,0,0];
    for (const input of inputs) for (const [i, old] of n32FrozenRegexes.entries()) if (old.test(input)) {
      hits[i]++;
      expect(evaluatePolicyPredicate(current.EXACT_PATTERNS[0][1], input), input).toBe(true);
    }
    expect(hits.every(n=>n>0)).toBe(true);
  });
  it.each(['__password__:', '_password_:', '~~password~~:', '\u0060password\u0060:', '[password]:', 'password＝', 'passwords:', '\\"password\\":'])
    ("keeps residual unsupported form %s", token => {
      const input = token + " hunter2";
      expect(classifyContext(input)).toEqual(n32ExtraUnknown);
      expect(evaluatePolicyPredicate(current.EXACT_PATTERNS[0][1], input)).toBe(false);
    });
});

const n32ApprovedRegexes = [
  /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b(?:\*{1,3}|["')”’）」』])?\s*[:=：]/iu,
  /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b(?:\*{1,3}|["')”’）」』])?\s*[:=：]/i,
  /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)(?:\*{1,3}|["')”’）」』])?\s*[:=：]/i,
  /(?<![A-Za-z0-9])api[ \t]?키(?:\*{1,3}|["')”’）」』])?\s*[:=：]/i,
];

describe("N-32 product source invariants", () => {
  it("checks actual product regex sources/flags and exact N-32 suffix + approved N-34 line-break delta", () => {
    const current = loadPolicyInternals("src/core/policy.ts", ["f21CredentialLabel", "KOREAN_CREDENTIAL_LABEL", "KOREAN_API_CREDENTIAL_LABEL"]) as ReturnType<typeof loadPolicyInternals> & {
      f21CredentialLabel: RegExp; KOREAN_CREDENTIAL_LABEL: RegExp; KOREAN_API_CREDENTIAL_LABEL: RegExp;
    };
    expect(current.EXACT_PATTERNS[0][1].toString()).toContain(n32ApprovedRegexes[0].toString());
    for (const [i, actual] of [current.f21CredentialLabel, current.KOREAN_CREDENTIAL_LABEL, current.KOREAN_API_CREDENTIAL_LABEL].entries()) {
      expect(actual.source).toBe(n32ApprovedRegexes[i + 1].source);
      expect(actual.flags).toBe(n32ApprovedRegexes[i + 1].flags);
    }
    const lf = (text: string) => text.replaceAll("\r\n", "\n");
    const product = lf(readFileSync("src/core/policy.ts", "utf8"));
    const frozen = lf(readFileSync("tests/helpers/policy-baseline-n32.ts", "utf8"))
      .replace(/^\/\/ Frozen from[^\n]*\n/, "")
      .replace('from "../../src/core/types.js"', 'from "./types.js"');
    expect(createHash("sha256").update(frozen).digest("hex")).toBe("308043afc87102079a8b8a082199afaf26301d88f8253ffb349e0d7b1ba7174e");
    const oldSuffix = "\\*{0,3}";
    const newSuffix = "(?:\\*{1,3}|[\"')”’）」』])?";
    expect(frozen.split(oldSuffix)).toHaveLength(5);
    expect(product.split(newSuffix)).toHaveLength(5);
    const n32 = frozen.replaceAll(oldSuffix, newSuffix);
    // N-34 approved delta (plan PR #115 @4a5b390 section 6): one private constant after COMMANDS,
    // and exactly the three line splits switched to it. Any other source change still fails.
    const n34Delta = (text: string) => {
      const anchor = '  "terraform",\n]);\n\n';
      expect(text.split(anchor)).toHaveLength(2);
      const constant = "// Same line terminators as scanLines in artifacts.ts: CRLF, lone CR, lone LF.\n" +
        String.raw`const POLICY_LINE_BREAK = /\r\n|\r|\n/u;` + "\n\n";
      const withConstant = text.replace(anchor, anchor + constant);
      const oldSplit = String.raw`.split(/\r?\n/u)`;
      expect(withConstant.split(oldSplit)).toHaveLength(4);
      return withConstant.replaceAll(oldSplit, ".split(POLICY_LINE_BREAK)");
    };
    expect(product).toBe(n34Delta(n32));
    expect(product.split(String.raw`split(/\r?\n/u)`)).toHaveLength(1);
    expect(product.split("POLICY_LINE_BREAK")).toHaveLength(5);
  });
});
