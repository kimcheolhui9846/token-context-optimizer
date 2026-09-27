import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const licensePackages = ["fast-png", "fflate", "iobuffer", "jpeg-js"] as const;
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

async function expectedDecoderApacheNotice(): Promise<string> {
  const license = await readFile("docs/licenses/jpeg-js-decoder-Apache-2.0.txt", "utf8");
  return normalizeNotice(`Component: jpeg-js/lib/decoder.js (Apache-2.0 attribution)\nCopyright 2011 notmasteryet\n${license}`);
}

async function expectCompleteApacheLicense(text: string): Promise<void> {
  expect(text).toContain("END OF TERMS AND CONDITIONS");
  expect(text).toContain("APPENDIX: How to apply the Apache License to your work.");
  expect(text).toContain("WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND");
  expect(text).toContain("limitations under the License.");
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
    const decoderLicense = await readFile("docs/licenses/jpeg-js-decoder-Apache-2.0.txt", "utf8");
    await expectCompleteApacheLicense(decoderLicense);
    const decoderNotice = await expectedDecoderApacheNotice();
    expect(generatedBundle).toContain(decoderNotice);
    expect(installedBundle).toContain(decoderNotice);
    await expectCompleteApacheLicense(generatedBundle);
    await expectCompleteApacheLicense(installedBundle);
  });
});
