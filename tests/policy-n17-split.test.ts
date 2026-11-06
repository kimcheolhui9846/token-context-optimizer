import { describe, expect, it } from "vitest";
import {
  evaluatePolicyPredicate,
  loadPolicyInternals,
} from "./helpers/policy-test-loader.js";

const internals = loadPolicyInternals("src/core/policy.ts", [
  "KOREAN_CREDENTIAL_LABEL",
  "KOREAN_API_CREDENTIAL_LABEL",
]) as ReturnType<typeof loadPolicyInternals> & {
  KOREAN_CREDENTIAL_LABEL: RegExp;
  KOREAN_API_CREDENTIAL_LABEL: RegExp;
};

// Fixed copy of the single regex from HEAD 48cbaf1, including api in-place.
const baselineKoreanCredentialLabel =
  /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|(?<![A-Za-z0-9])api[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\s*[:=：]/i;

const koreanLabels = [
  "비밀번호",
  "비번",
  "패스워드",
  "인증키",
  "개인키",
  "비밀키",
  "시크릿키",
  "액세스키",
  "복구코드",
  "백업코드",
  "인증토큰",
  "접근토큰",
  "액세스토큰",
  "암호",
  "토큰",
  "보안코드",
  "비밀 번호",
  "비밀\t번호",
  "패스 워드",
  "패스\t워드",
  "인증 키",
  "인증\t키",
];
const koreanNegativeLabels = ["비밀번호변경", "비밀_번호", "비밀-번호"];
const koreanCompoundLabels = ["계정비밀번호", "안전토큰"];
const delimiters = ["", ":", "=", "：", "＝", " is ", "는 "];
const whitespace = ["", " ", "\t", "\n", "\u00a0", "\u3000", "\ufeff"];
const contexts = ["", "한글", "a", "_"];
const narratives = ["", " 그리고 계속합니다."];

function matrixInputs(label: string): string[] {
  return delimiters.flatMap((delimiter) =>
    whitespace.flatMap((gap) =>
      contexts.flatMap((context) =>
        narratives.map(
          (narrative) => `${context}${label}${gap}${delimiter} hunter2${narrative}`,
        ),
      ),
    ),
  );
}

describe("N-17 Korean credential regex split", () => {
  it("keeps both split constants case-insensitive", () => {
    expect(internals.KOREAN_CREDENTIAL_LABEL.flags).toBe("i");
    expect(internals.KOREAN_API_CREDENTIAL_LABEL.flags).toBe("i");
  });

  it.each([
    ["positive", koreanLabels],
    ["negative", koreanNegativeLabels],
    ["compound", koreanCompoundLabels],
  ])("preserves %s Korean branch booleans across the delimiter matrix", (_kind, labels) => {
    for (const label of labels) {
      for (const content of matrixInputs(label)) {
        for (const variant of [content, content.normalize("NFD")]) {
          const expected = baselineKoreanCredentialLabel.test(variant);
          const actual =
            evaluatePolicyPredicate(internals.KOREAN_CREDENTIAL_LABEL, variant) ||
            evaluatePolicyPredicate(internals.KOREAN_API_CREDENTIAL_LABEL, variant);
          expect(actual, `${JSON.stringify(variant)} (NFC/NFD)`).toBe(expected);
          expect(
            evaluatePolicyPredicate(internals.EXACT_PATTERNS[0][1], variant),
            `tuple-0 wiring: ${JSON.stringify(variant)} (NFC/NFD)`,
          ).toBe(expected);
          expect(
            evaluatePolicyPredicate(internals.KOREAN_CREDENTIAL_LABEL, variant) ||
              evaluatePolicyPredicate(internals.KOREAN_API_CREDENTIAL_LABEL, variant),
            `split constants repeat: ${JSON.stringify(variant)} (NFC/NFD)`,
          ).toBe(expected);
        }
      }
    }
  });

  it.each([
    "api키",
    "api 키",
    "api\t키",
    "API 키",
    "aPi 키",
    "xapi 키",
    "1api 키",
    "my_api 키",
    "카카오api 키",
  ])("preserves the API lookbehind branch: %s", (label) => {
    for (const content of matrixInputs(label)) {
      for (const variant of [content, content.normalize("NFD")]) {
        const expected = baselineKoreanCredentialLabel.test(variant);
        const actual =
          evaluatePolicyPredicate(internals.KOREAN_CREDENTIAL_LABEL, variant) ||
          evaluatePolicyPredicate(internals.KOREAN_API_CREDENTIAL_LABEL, variant);
        expect(actual, `${JSON.stringify(variant)} (NFC/NFD)`).toBe(expected);
        expect(
          evaluatePolicyPredicate(internals.EXACT_PATTERNS[0][1], variant),
          `tuple-0 wiring: ${JSON.stringify(variant)} (NFC/NFD)`,
        ).toBe(expected);
        expect(
          evaluatePolicyPredicate(internals.KOREAN_CREDENTIAL_LABEL, variant) ||
            evaluatePolicyPredicate(internals.KOREAN_API_CREDENTIAL_LABEL, variant),
          `split constants repeat: ${JSON.stringify(variant)} (NFC/NFD)`,
        ).toBe(expected);
      }
    }
  });
});
