import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadPolicyInternals } from "./helpers/policy-test-loader.js";

const current = loadPolicyInternals("src/core/policy.ts", ["f21CredentialLabel"]);
const oracle = loadPolicyInternals("tests/helpers/policy-baseline-f21.ts", ["f21CredentialLabel"]);
const childScript = "tests/helpers/policy-f21-rework-child.mjs";
const APPROVED_E3_SOURCE = String.raw`\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b(?:\*{1,3}|["')”’）」』])?\s*[:=：]`;

function runChild(mode: "dense" | "throw" | "timeout", recipe = "a-", timeout = 5_000) {
  const child = spawnSync(process.execPath, [childScript, mode, "src/core/policy.ts", recipe], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  if ((child.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
    return { status: "timeout" as const };
  }
  if (child.status !== 0) return { status: "threw" as const, error: child.stderr };
  return JSON.parse(child.stdout) as {
    status: "returned";
    combined: boolean;
    e3: boolean;
    byteLength: number;
  };
}

describe("F-21 credential-label rework", () => {
  it("keeps the production E3 RegExp source and flags equal to the approved frozen literal", () => {
    expect(current.f21CredentialLabel).toBeDefined();
    expect(oracle.f21CredentialLabel).toBeDefined();
    expect(current.f21CredentialLabel?.source).toBe(APPROVED_E3_SOURCE);
    expect(current.f21CredentialLabel?.flags).toBe(oracle.f21CredentialLabel?.flags);
    expect(current.f21CredentialLabel?.flags).toBe("i");
  });

  it.each([
    "a-",
    "pass ",
    "secret ",
    "private ",
  ] as const)("returns known false results for a dense isolated 10 MiB %s no-delimiter input", (recipe) => {
    expect(runChild("dense", recipe)).toEqual({
      status: "returned",
      combined: false,
      e3: false,
      byteLength: 10 * 1024 * 1024,
    });
  }, 10_000);

  it("keeps isolated child thrown diagnostics distinct from timeout diagnostics", () => {
    expect(runChild("throw").status).toBe("threw");
    expect(runChild("timeout", "a-", 100).status).toBe("timeout");
  });
});
