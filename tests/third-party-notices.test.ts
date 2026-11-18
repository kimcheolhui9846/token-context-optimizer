import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build, type Metafile } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bundleBuildOptions,
  collectThirdPartyComponents,
  parseVendoredMarkers,
  packageNameFromInput,
  renderThirdPartyNotices,
} from "../scripts/third-party-notices.mjs";

const bundlePath = "bin/token-context-optimizer.mjs";
const temporaryRoots = new Set<string>();
let metafile: Metafile;

beforeAll(async () => {
  const result = await build({ ...bundleBuildOptions, write: false, metafile: true, logLevel: "silent" });
  metafile = result.metafile;
}, 60_000);

afterAll(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

function normalize(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function lf(text: string): string {
  return text.replace(/\r\n?/gu, "\n");
}

// Independent of the helper: package names from esbuild's `// node_modules/...` source comments
// in the committed bundle, and vendored `.pnpm` regions in the bundled SDK dist files.
async function independentlyObservedComponents(): Promise<{ packages: Set<string>; vendored: Set<string> }> {
  const bundle = await readFile(bundlePath, "utf8");
  const packages = new Set<string>();
  for (const match of bundle.matchAll(/^\/\/ (?:.*\/)?node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//gmu)) packages.add(match[1]!);
  const vendored = new Set<string>();
  for (const input of Object.keys(metafile.inputs)) {
    if (!input.includes("node_modules/")) continue;
    const source = await readFile(input, "utf8");
    for (const match of source.matchAll(/#region \S*node_modules\/\.pnpm\/[^/\s]+\/node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//gu)) vendored.add(match[1]!);
  }
  return { packages, vendored };
}

async function installedBundle(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "tco-notice-install-"));
  temporaryRoots.add(target);
  const result = spawnSync(process.execPath, ["scripts/install-local-plugin.mjs", "--target", target, "--no-marketplace"], {
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.status, result.stderr.slice(-2000)).toBe(0);
  return readFile(join(target, bundlePath), "utf8");
}

describe("third-party notices in the shipped bundle", () => {
  it("covers every node_modules package and vendored component the bundle actually contains", async () => {
    const components = await collectThirdPartyComponents({ metafile, rootDir: "." });
    const observed = await independentlyObservedComponents();
    expect(new Set(components.packages.map((p) => p.name))).toEqual(observed.packages);
    expect(new Set(components.vendored.map((v) => v.name))).toEqual(observed.vendored);
    // The SDK, zod and the image libraries must all be present; vendored SDK code must not be missed.
    for (const name of ["@modelcontextprotocol/server", "@modelcontextprotocol/core", "zod", "fast-png", "fflate", "iobuffer", "jpeg-js"]) {
      expect(observed.packages).toContain(name);
    }
    expect(observed.vendored.size).toBeGreaterThan(0);

    const bundles = { generated: normalize(await readFile(bundlePath, "utf8")), installed: normalize(await installedBundle()) };
    // A notice counts only when the exact-version heading is directly followed by the original text.
    const missing: string[] = [];
    const expectNotice = (label: string, heading: string, original: string) => {
      for (const [where, text] of Object.entries(bundles)) {
        const at = text.indexOf(heading);
        const textAt = at < 0 ? -1 : text.indexOf(original, at);
        if (at < 0 || textAt < 0 || textAt - at > heading.length + 400) missing.push(`${where}: ${label}`);
      }
    };
    for (const pkg of components.packages) {
      const pkgJson = JSON.parse(await readFile(join(pkg.dir, "package.json"), "utf8")) as { version: string };
      expect(pkg.version).toBe(pkgJson.version);
      expect(pkg.licenseFiles.length).toBeGreaterThan(0);
      for (const file of pkg.licenseFiles) {
        const original = normalize(await readFile(join(pkg.dir, file.file), "utf8"));
        expectNotice(`${pkg.name}@${pkg.version} ${file.file}`, normalize(`Package: ${pkg.name}@${pkg.version}`), original);
      }
    }
    for (const component of components.vendored) {
      const original = normalize(await readFile(component.licenseFile, "utf8"));
      expectNotice(`${component.name}@${component.version} (vendored)`, normalize(`Component: ${component.name}@${component.version}`), original);
    }
    expect(missing).toEqual([]);
  }, 120_000);

  it("pins every vendored license text to its recorded hash and exact version", async () => {
    const manifest = JSON.parse(await readFile("docs/licenses/vendored-components.json", "utf8")) as {
      components: { name: string; version: string; licenseFile: string; sha256: string; integrity: string }[];
    };
    expect(manifest.components.length).toBeGreaterThan(0);
    for (const entry of manifest.components) {
      const text = lf(await readFile(entry.licenseFile, "utf8"));
      expect(createHash("sha256").update(text, "utf8").digest("hex"), entry.licenseFile).toBe(entry.sha256);
      expect(entry.integrity).toMatch(/^sha512-/u);
      expect(entry.licenseFile).toContain(`${entry.name.replace("/", "+")}-${entry.version}`);
    }
    const listed = (await readdir("docs/licenses/vendored")).map((file) => `docs/licenses/vendored/${file}`).sort();
    expect(listed).toEqual(manifest.components.map((entry) => entry.licenseFile).sort());
  });
});

describe("third-party notice helper", () => {
  it("parses pnpm vendored markers including peer suffixes and scoped names", () => {
    const source = [
      "//#region ../../node_modules/.pnpm/content-type@1.0.5/node_modules/content-type/index.js",
      "//#region ../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.18.0/node_modules/ajv-formats/dist/index.js",
      "//#region ../../node_modules/.pnpm/@cfworker+json-schema@4.1.1/node_modules/@cfworker/json-schema/dist/esm/index.js",
      "//#region ../core-internal/src/shared/stdio.ts",
    ].join("\n");
    expect(parseVendoredMarkers(source)).toEqual([
      { name: "content-type", version: "1.0.5" },
      { name: "ajv-formats", version: "3.0.1" },
      { name: "@cfworker/json-schema", version: "4.1.1" },
    ]);
  });

  it("fails closed on a node_modules region it cannot attribute to an exact version", () => {
    expect(() => parseVendoredMarkers("//#region ../../node_modules/left-pad/index.js")).toThrow(/vendored/u);
    expect(() => parseVendoredMarkers("//#region ../../node_modules/.pnpm/weird/node_modules/other/index.js")).toThrow(/vendored/u);
  });

  it("classifies metafile inputs without counting project code or builtins as packages", () => {
    expect(packageNameFromInput("node_modules/zod/v4/core/schemas.js")).toBe("zod");
    expect(packageNameFromInput("node_modules/@modelcontextprotocol/server/dist/stdio.mjs")).toBe("@modelcontextprotocol/server");
    expect(packageNameFromInput("node_modules/a/node_modules/@s/b/x.js")).toBe("@s/b");
    expect(packageNameFromInput("src/server/index.ts")).toBeNull();
  });

  async function fixtureRoot(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "tco-notice-fixture-"));
    temporaryRoots.add(root);
    for (const [relativePath, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, relativePath)), { recursive: true });
      await writeFile(join(root, relativePath), content, "utf8");
    }
    return root;
  }

  function fakeMetafile(inputs: string[]): Metafile {
    return { inputs: Object.fromEntries(inputs.map((input) => [input, { bytes: 1, imports: [] }])), outputs: {} } as unknown as Metafile;
  }

  it("refuses to build when a vendored component has no recorded license", async () => {
    const root = await fixtureRoot({
      "node_modules/sdk-like/package.json": JSON.stringify({ name: "sdk-like", version: "1.0.0", license: "MIT" }),
      "node_modules/sdk-like/LICENSE": "sdk-like license text",
      "node_modules/sdk-like/dist/x.mjs": "//#region ../../node_modules/.pnpm/mystery@9.9.9/node_modules/mystery/index.js\nexport const x = 1;\n",
      "docs/licenses/vendored-components.json": JSON.stringify({ components: [] }),
    });
    await expect(collectThirdPartyComponents({ metafile: fakeMetafile(["node_modules/sdk-like/dist/x.mjs"]), rootDir: root })).rejects.toThrow(
      /mystery@9\.9\.9.*no recorded license/u,
    );
  });

  it("refuses to build when a recorded vendored license is for another version", async () => {
    const root = await fixtureRoot({
      "node_modules/sdk-like/package.json": JSON.stringify({ name: "sdk-like", version: "1.0.0", license: "MIT" }),
      "node_modules/sdk-like/LICENSE": "sdk-like license text",
      "node_modules/sdk-like/dist/x.mjs": "//#region ../../node_modules/.pnpm/mystery@9.9.9/node_modules/mystery/index.js\n",
      "docs/licenses/vendored/mystery-9.9.8-LICENSE.txt": "mystery license",
      "docs/licenses/vendored-components.json": JSON.stringify({
        components: [{ name: "mystery", version: "9.9.8", license: "MIT", licenseFile: "docs/licenses/vendored/mystery-9.9.8-LICENSE.txt", sha256: "0" }],
      }),
    });
    await expect(collectThirdPartyComponents({ metafile: fakeMetafile(["node_modules/sdk-like/dist/x.mjs"]), rootDir: root })).rejects.toThrow(
      /no recorded license/u,
    );
  });

  it("refuses to build when a recorded vendored license text does not match its hash", async () => {
    const root = await fixtureRoot({
      "node_modules/sdk-like/package.json": JSON.stringify({ name: "sdk-like", version: "1.0.0", license: "MIT" }),
      "node_modules/sdk-like/LICENSE": "sdk-like license text",
      "node_modules/sdk-like/dist/x.mjs": "//#region ../../node_modules/.pnpm/mystery@9.9.9/node_modules/mystery/index.js\n",
      "docs/licenses/vendored/mystery-9.9.9-LICENSE.txt": "edited license",
      "docs/licenses/vendored-components.json": JSON.stringify({
        components: [{ name: "mystery", version: "9.9.9", license: "MIT", licenseFile: "docs/licenses/vendored/mystery-9.9.9-LICENSE.txt", sha256: "0".repeat(64) }],
      }),
    });
    await expect(collectThirdPartyComponents({ metafile: fakeMetafile(["node_modules/sdk-like/dist/x.mjs"]), rootDir: root })).rejects.toThrow(
      /hash mismatch/u,
    );
  });

  it("refuses to build when a bundled package ships no license file", async () => {
    const root = await fixtureRoot({
      "node_modules/no-license-pkg/package.json": JSON.stringify({ name: "no-license-pkg", version: "2.0.0", license: "MIT" }),
      "node_modules/no-license-pkg/index.js": "export const y = 2;\n",
      "docs/licenses/vendored-components.json": JSON.stringify({ components: [] }),
    });
    await expect(collectThirdPartyComponents({ metafile: fakeMetafile(["node_modules/no-license-pkg/index.js", "src/app.ts"]), rootDir: root })).rejects.toThrow(
      /no-license-pkg.*no license file/u,
    );
  });

  it("never lets license text close the banner comment", () => {
    expect(() =>
      renderThirdPartyNotices({
        packages: [{ name: "x", version: "1.0.0", license: "MIT", dir: ".", licenseFiles: [{ file: "LICENSE", text: "evil */ code" }], extraNotices: [] }],
        vendored: [],
      }),
    ).toThrow(/comment terminator/u);
  });
});
