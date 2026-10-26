import { describe, expect, it } from "vitest";
import { classifyContext } from "../src/core/policy.js";
import { classifyContext as classifyF21 } from "./helpers/policy-baseline-f21.js";

const exactSecret = { mode: "exact", reasons: ["secret"], warnings: ["lossy_compression_not_allowed"] };
const reviewSuffix = " The team agreed to keep this note for the onboarding review and preserve the original context.";

describe("F-21 URI and credential boundaries", () => {
  it("does not classify ordinary colon headings as exact", () => {
    expect(classifyContext("Note: preserve source text exactly before compression."))
      .toEqual({ mode: "semantic", reasons: ["natural_language"], warnings: [] });
    expect(classifyContext("Summary:")).toEqual({
      mode: "unknown", reasons: ["insufficient_semantic_signal"], warnings: ["lossy_compression_not_allowed"],
    });
    expect(classifyContext("Summary: preserve the original source context before compression."))
      .toEqual({ mode: "semantic", reasons: ["natural_language"], warnings: [] });
    expect(classifyContext("visual: layout guidance for the dashboard image" ).mode).toBe("visual");
  });

  it.each([
    "mailto:a@b", "urn:isbn:0451450523", "https://example.test/path", "C:\\tmp\\file.txt",
    "localhost:8080", "12:30", "http://[::1]:8080", "scheme:\u200bvalue",
  ])("keeps eligible non-whitespace URI-like candidates exact: %s", (content) => {
    expect(classifyContext(content)).toEqual(classifyF21(content));
  });

  it.each(["Note:\tvalue", "Note:\nvalue", "Note:\rvalue", "Note:\u000bvalue", "Note:\u000cvalue", "Note:\u00a0value", "Note:\u1680value", "Note:\u2000value", "Note:\u2003value", "Note:\u2028value", "Note:\u2029value", "Note:\u202fvalue", "Note:\u205fvalue", "Note:\u3000value", "Note:\ufeffvalue"])(
    "rejects a whitespace-delimited heading and continues scanning: %s", (content) => {
      expect(classifyContext(`${content} then https://example.test`)).toEqual({
        mode: "exact", reasons: ["secret", "code_or_path"], warnings: ["lossy_compression_not_allowed"],
      });
    },
  );

  it.each(["Note:\tvalue", "Note:\nvalue", "Note:\u00a0value", "Note:\u2028value", "Note:\ufeffvalue"])(
    "does not classify a whitespace-delimited heading as exact without a later URI: %s",
    (content) => expect(classifyContext(content)).toEqual(classifyF21(content)),
  );

  it.each(["data:text/plain,hello", "opaque:value", "urn:example:thing"])(
    "keeps opaque URI schemes exact: %s",
    (content) => expect(classifyContext(content)).toEqual(classifyF21(content)),
  );

  it.each([
    "passwd: hunter2", "pwd: hunter2", "Passphrase: correct horse battery staple", "Credentials: admin / hunter2",
    "Login: alice, Pass: hunter2", "Private key: MIIEvQIBADANB", "Secret answer: fluffy",
    "Recovery code: alpha bravo charlie", "access key: AKIAABCDEFGH", "API key: sk-live-abc",
    "secret key: value", "client secret: value", "credential: value", "PaSsWoRd: value",
    "secret-key: abc", "access-key: abc", "recovery-code: alpha", "passcode: value",
    "pass phrase: value", "recovery codes: value", "backup code: value", "backup codes: value",
  ].flatMap((content) => [content, `${content}${reviewSuffix}`]))("protects credential labels with the stable secret reason: %s", (content) => {
    expect(classifyContext(content)).toEqual(exactSecret);
  });

  it.each(["compass: value", "_passwd: value", "passwdSuffix: value", "Note: ordinary prose", "secret\nkey: value"])(
    "does not treat near-miss labels as credentials: %s", (content) => {
      expect(classifyContext(content)).toEqual(classifyF21(content));
    },
  );

  it("preserves reason insertion order when secret masks a heading", () => {
    expect(classifyContext("Note: preserve this text. api_key=value"))
      .toEqual({ mode: "exact", reasons: ["secret", "identifier_or_hash", "code_or_path"], warnings: ["lossy_compression_not_allowed"] });
  });
});
