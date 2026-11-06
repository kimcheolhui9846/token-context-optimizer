import { describe, expect, it } from "vitest";
import { classifyContext } from "../src/core/policy.js";
import { classifyContext as classifyBaseline } from "./helpers/policy-baseline-n17.js";
import { loadPolicyInternals } from "./helpers/policy-test-loader.js";

const currentInternals = loadPolicyInternals("src/core/policy.ts");
const baselineInternals = loadPolicyInternals("tests/helpers/policy-baseline-n17.ts");

const exactSecret = {
  mode: "exact",
  reasons: ["secret"],
  warnings: ["lossy_compression_not_allowed"],
} as const;
const semantic = { mode: "semantic", reasons: ["natural_language"], warnings: [] } as const;
const unknown = {
  mode: "unknown",
  reasons: ["insufficient_semantic_signal"],
  warnings: ["lossy_compression_not_allowed"],
} as const;

const labels = [
  ["비밀번호", "비밀 번호", "비밀\t번호"], ["비번"], ["패스워드", "패스 워드", "패스\t워드"],
  ["인증키", "인증 키", "인증\t키"], ["개인키", "개인 키", "개인\t키"],
  ["비밀키", "비밀 키", "비밀\t키"], ["시크릿키", "시크릿 키", "시크릿\t키"],
  ["액세스키", "액세스 키", "액세스\t키"], ["api키", "api 키", "api\t키"],
  ["복구코드", "복구 코드", "복구\t코드"], ["백업코드", "백업 코드", "백업\t코드"],
  ["인증토큰", "인증 토큰", "인증\t토큰"], ["접근토큰", "접근 토큰", "접근\t토큰"],
  ["액세스토큰", "액세스 토큰", "액세스\t토큰"], ["암호"], ["토큰"],
  ["보안코드", "보안 코드", "보안\t코드"],
];

const separators = [":", "=", "："];

describe("N-17 Korean credential labels", () => {
  it.each(labels.flatMap((forms) => forms.flatMap((label) => separators.map((separator) => [label, separator]))))
    ("protects standalone label %s%s", (label, separator) => {
      const content = `${label}${separator} hunter2`;
      expect(classifyContext(content)).toEqual(exactSecret);
      expect(classifyBaseline(content)).not.toEqual(exactSecret);
    });

  it.each(["**비밀번호**: hunter2", "password：hunter2"])("protects the newly approved positive literal %s", (content) => {
    expect(classifyContext(content)).toEqual(exactSecret);
    expect(classifyContext(`회의실 ${content} 이니까 접속할 때 참고해 주세요.`)).toEqual(exactSecret);
  });

  it.each(labels.flatMap((forms) => forms.flatMap((label) => separators.map((separator) => [label, separator]))))
    ("protects an in-sentence label %s%s", (label, separator) => {
      const content = `회의실 ${label}${separator} hunter2 이니까 접속할 때 참고해 주세요.`;
      expect(classifyContext(content)).toEqual(exactSecret);
      expect(classifyBaseline(content)).not.toEqual(exactSecret);
    });

  it.each([
    ["암호화: hunter2", unknown, semantic], ["토큰화: hunter2", unknown, semantic],
    ["비밀번호 변경: hunter2", unknown, semantic], ["비밀번호는 hunter2", unknown, semantic],
    ["비밀번호＝hunter2", unknown, semantic], ["password＝hunter2", unknown, semantic],
    ["비밀_번호: hunter2", unknown, semantic],
    ["비밀-번호: hunter2", unknown, semantic], ["API-키: hunter2", unknown, unknown],
    ["v2api 키: hunter2", unknown, semantic], ["`비밀번호`: hunter2", unknown, unknown],
  ])("keeps an approved negative outside the Korean label contract: %s", (content, standalone, sentence) => {
    expect(classifyContext(content)).toEqual(standalone);
    expect(classifyContext(`회의실 ${content} 이니까 접속할 때 참고해 주세요.`)).toEqual(sentence);
  });

  it.each([
    "비밀번호\u00a0:", "비밀번호\u3000:", "비밀번호\n:", "비밀번호\r\n:",
    "비밀번호\u2028:", "비밀번호\u2029:", "비밀번호\ufeff:",
  ])("uses JavaScript whitespace only after a label: %s", (label) => {
    const content = `회의실 ${label} hunter2 이니까 접속할 때 참고해 주세요.`;
    expect(classifyContext(content)).toEqual(exactSecret);
    expect(classifyBaseline(content)).not.toEqual(exactSecret);
  });

  it.each(["비밀\u00a0번호:", "비밀\u3000번호:", "비밀\n번호:", "비밀번호\u200b:"])(
    "does not allow non-ASCII or line-break label separators: %s",
    (content) => expect(classifyContext(content)).toEqual(unknown),
  );

  it.each([
    ["인증_토큰:", exactSecret, exactSecret], ["인증-토큰:", exactSecret, exactSecret], ["API-키:", unknown, unknown],
    ["개인_키:", unknown, semantic], ["비밀_번호:", unknown, semantic], ["보안_코드:", unknown, semantic],
    ["입력토큰:", exactSecret, exactSecret], ["비밀번호\u00a0:", exactSecret, exactSecret], ["비밀번호\u3000:", exactSecret, exactSecret],
    ["**비밀번호**:", exactSecret, exactSecret], ["비밀번호  :", exactSecret, exactSecret], ["비밀  번호:", unknown, semantic],
    ["password\u00a0:", exactSecret, exactSecret],
  ])("checks the approved 13-boundary literal: %s", (content, standalone, sentence) => {
    expect(classifyContext(`${content} hunter2`)).toEqual(standalone);
    expect(classifyContext(`회의실 ${content} hunter2 이니까 접속할 때 참고해 주세요.`)).toEqual(sentence);
  });

  it.each([
    ["카카오api 키: hunter2", exactSecret],
    ["API 키: hunter2", exactSecret],
    ["aPi 키: hunter2", exactSecret],
    ["my_api 키: hunter2", {
      mode: "exact",
      reasons: ["secret", "identifier_or_hash", "code_or_path"],
      warnings: ["lossy_compression_not_allowed"],
    }],
  ])("keeps the approved api lookbehind boundary: %s", (content, expected) => {
    expect(classifyContext(content)).toEqual(expected);
  });

  it.each(["xapi 키: hunter2", "1api 키: hunter2"])(
    "rejects an ASCII alphanumeric api prefix: %s",
    (content) => expect(classifyContext(content)).toEqual(unknown),
  );

  it.each(["password: hunter2", "password: hunter2 이니까 접속할 때 참고해 주세요."])(
    "preserves the English credential literal: %s",
    (content) => expect(classifyContext(content)).toEqual(exactSecret),
  );

  it("preserves reason order when Korean secret and numeric rules both match", () => {
    expect(classifyContext("회의실 비밀번호: 1234 이니까 접속할 때 참고해 주세요.")).toEqual({
      mode: "exact",
      reasons: ["secret", "numeric_or_table"],
      warnings: ["lossy_compression_not_allowed"],
    });
  });

  it("preserves tuple count, reason slots, and nonzero indexes", () => {
    expect(currentInternals.EXACT_PATTERNS).toHaveLength(baselineInternals.EXACT_PATTERNS.length);
    currentInternals.EXACT_PATTERNS.forEach(([reason], index) => {
      expect(reason, `tuple reason #${index}`).toBe(baselineInternals.EXACT_PATTERNS[index][0]);
    });
  });

  it.each(["비밀번호:", "비밀번호=", "비밀번호："])("protects a label with no value: %s", (label) => {
    expect(classifyContext(label)).toEqual(exactSecret);
  });

  it.each([
    "비밀번호변경: hunter2", "비밀  번호: hunter2", "비밀번호\u200b: hunter2",
  ])("does not overprotect a non-contract compound or internal form: %s", (content) => {
    expect(classifyContext(content)).toEqual(unknown);
  });

  it.each(["계정비밀번호: hunter2", "카카오api 키: hunter2"])(
    "protects an approved compound without a Hangul boundary: %s",
    (content) => expect(classifyContext(content)).toEqual(exactSecret),
  );

  it("rejects decomposed NFD label text as a literal Korean label", () => {
    const content = `${"비밀번호".normalize("NFD")}: hunter2`;
    expect(classifyContext(content)).toEqual(unknown);
  });

  it("keeps mixed code and secret reasons in insertion order", () => {
    expect(classifyContext("비밀번호: hunter2\nconst value = 1;")).toEqual({
      mode: "exact",
      reasons: ["secret", "code_syntax", "numeric_or_table"],
      warnings: ["lossy_compression_not_allowed"],
    });
  });
});
