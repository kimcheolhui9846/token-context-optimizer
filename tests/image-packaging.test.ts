import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const licensePackages = ["fast-png", "fflate", "iobuffer"] as const;
const runtimeFiles = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "bin/token-context-optimizer.mjs",
  "skills/optimize-context/SKILL.md",
] as const;
const temporaryRoots = new Set<string>();

afterEach(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

function normalizeNotice(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

async function expectedLicenseNotice(packageName: string): Promise<string> {
  const license = await readFile(join("node_modules", packageName, "LICENSE"), "utf8");
  return normalizeNotice(`Package: ${packageName}\n${license}`);
}

describe("image dependency bundle notices", () => {
  it("embeds complete license notices in the generated and installed bundle", async () => {
    const generatedBundle = normalizeNotice(await readFile("bin/token-context-optimizer.mjs", "utf8"));
    const installRoot = await mkdtemp(join(tmpdir(), "tco-license-install-"));
    temporaryRoots.add(installRoot);
    for (const relativePath of runtimeFiles) {
      await mkdir(dirname(join(installRoot, relativePath)), { recursive: true });
      await cp(relativePath, join(installRoot, relativePath));
    }
    const installedBundle = normalizeNotice(await readFile(join(installRoot, "bin/token-context-optimizer.mjs"), "utf8"));

    for (const packageName of licensePackages) {
      const expected = await expectedLicenseNotice(packageName);
      expect(generatedBundle).toContain(expected);
      expect(installedBundle).toContain(expected);
    }
  });
});
