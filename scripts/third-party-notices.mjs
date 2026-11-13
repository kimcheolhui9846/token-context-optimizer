// Third-party notice collection for the shipped bundle.
//
// The installed plugin ships only bin/token-context-optimizer.mjs as code, so the license notices
// for everything esbuild puts into that file are written into its leading comment. Coverage comes
// from the esbuild metafile, not from a hand-written list:
// - every metafile input under node_modules/ names a package whose own license files are copied
//   from the installed package directory;
// - inside those inputs, prebuilt dist files can carry code that their publisher bundled from
//   other packages (rolldown/rollup `//#region ../../node_modules/.pnpm/<dir>/node_modules/<pkg>/`
//   markers). Those packages are not installed, so their license texts are kept in
//   docs/licenses/vendored/ and pinned by docs/licenses/vendored-components.json.
// Anything that cannot be attributed to an exact version and a recorded license fails the build.
// This is notice coverage only; it is not a legal compatibility review.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const bundleBuildOptions = Object.freeze({
  entryPoints: ["src/server/index.ts"],
  outfile: "bin/token-context-optimizer.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["node:*"],
});

const VENDORED_MANIFEST = "docs/licenses/vendored-components.json";
const LICENSE_FILE_PATTERN = /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/iu;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const REGION_PATTERN = /#region\s+(\S*node_modules\/\S*)/gu;
const PNPM_REGION_PATTERN = /node_modules\/\.pnpm\/([^/\s]+)\/node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//u;

// Extra attribution that a package's own LICENSE file does not carry for every file it ships.
const PACKAGE_EXTRA_NOTICES = Object.freeze({
  "jpeg-js": [
    {
      heading: "Component: jpeg-js/lib/decoder.js (Apache-2.0 attribution)\nCopyright 2011 notmasteryet",
      file: "docs/licenses/jpeg-js-decoder-Apache-2.0.txt",
    },
    {
      heading: "Component: jpeg-js/lib/encoder.js (BSD-3-Clause attribution)",
      file: "docs/licenses/jpeg-js-encoder-BSD-3-Clause.txt",
    },
  ],
});

function lf(text) {
  return text.replace(/\r\n?/gu, "\n");
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Returns the package name for a metafile input under node_modules/, otherwise null. */
export function packageNameFromInput(input) {
  const normalized = input.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("node_modules/");
  if (index < 0) return null;
  const match = normalized.slice(index + "node_modules/".length).match(/^((?:@[^/]+\/)?[^/]+)\//u);
  if (!match) throw new Error(`Cannot attribute bundled input to a package: ${input}`);
  return match[1];
}

function packageDirFromInput(input, name) {
  const normalized = input.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("node_modules/");
  return normalized.slice(0, index + "node_modules/".length + name.length);
}

/** Parses prebuilt-dist region markers that name code from other packages. Fails closed. */
export function parseVendoredMarkers(source) {
  const found = [];
  const seen = new Set();
  for (const match of source.matchAll(REGION_PATTERN)) {
    const marker = match[1];
    const pnpm = marker.match(PNPM_REGION_PATTERN);
    if (!pnpm) throw new Error(`Unattributable vendored region marker: ${marker}`);
    const [, directory, name] = pnpm;
    const prefix = `${name.replace("/", "+")}@`;
    if (!directory.startsWith(prefix)) throw new Error(`Unattributable vendored region marker: ${marker}`);
    // pnpm appends peer dependencies after "_" (ajv-formats@3.0.1_ajv@8.18.0); semver has no "_".
    const version = directory.slice(prefix.length).split("_")[0];
    if (!SEMVER_PATTERN.test(version)) throw new Error(`Unattributable vendored region marker version: ${marker}`);
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ name, version });
  }
  return found;
}

async function readVendoredManifest(rootDir) {
  const manifest = JSON.parse(await readFile(join(rootDir, VENDORED_MANIFEST), "utf8"));
  if (!Array.isArray(manifest.components)) throw new Error(`${VENDORED_MANIFEST} has no components array`);
  return manifest.components;
}

/**
 * Collects the packages and vendored components that the metafile says are in the bundle.
 * Input paths are relative to rootDir, as esbuild reports them.
 */
export async function collectThirdPartyComponents({ metafile, rootDir }) {
  const packageInputs = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    const name = packageNameFromInput(input);
    if (name === null) continue;
    const dir = packageDirFromInput(input, name);
    const entry = packageInputs.get(dir) ?? { name, dir, inputs: [] };
    entry.inputs.push(input);
    packageInputs.set(dir, entry);
  }

  const manifest = await readVendoredManifest(rootDir);
  const packages = [];
  const vendored = new Map();
  for (const { name, dir, inputs } of [...packageInputs.values()].sort((a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir))) {
    const absoluteDir = join(rootDir, dir);
    const pkgJson = JSON.parse(await readFile(join(absoluteDir, "package.json"), "utf8"));
    if (pkgJson.name !== name) throw new Error(`Package directory ${dir} declares ${pkgJson.name}, expected ${name}`);
    const licenseNames = (await readdir(absoluteDir)).filter((file) => LICENSE_FILE_PATTERN.test(file)).sort();
    if (licenseNames.length === 0) throw new Error(`Bundled package ${name}@${pkgJson.version} has no license file in ${dir}`);
    const licenseFiles = [];
    for (const file of licenseNames) licenseFiles.push({ file, text: lf(await readFile(join(absoluteDir, file), "utf8")).trim() });
    const extraNotices = [];
    for (const extra of PACKAGE_EXTRA_NOTICES[name] ?? []) {
      extraNotices.push({ heading: extra.heading, text: lf(await readFile(join(rootDir, extra.file), "utf8")).trim() });
    }
    packages.push({ name, version: pkgJson.version, license: pkgJson.license ?? null, dir: absoluteDir, licenseFiles, extraNotices });

    for (const input of inputs) {
      for (const component of parseVendoredMarkers(await readFile(join(rootDir, input), "utf8"))) {
        const key = `${component.name}@${component.version}`;
        const existing = vendored.get(key);
        if (existing) {
          if (!existing.via.includes(`${name}@${pkgJson.version}`)) existing.via.push(`${name}@${pkgJson.version}`);
          continue;
        }
        const recorded = manifest.find((item) => item.name === component.name && item.version === component.version);
        if (!recorded) throw new Error(`Vendored component ${key} (inside ${name}@${pkgJson.version}) has no recorded license in ${VENDORED_MANIFEST}`);
        const text = lf(await readFile(join(rootDir, recorded.licenseFile), "utf8"));
        if (sha256(text) !== recorded.sha256) throw new Error(`Vendored license hash mismatch for ${key}: ${recorded.licenseFile}`);
        vendored.set(key, {
          name: component.name,
          version: component.version,
          license: recorded.license,
          licenseFile: join(rootDir, recorded.licenseFile),
          text: text.trim(),
          via: [`${name}@${pkgJson.version}`],
        });
      }
    }
  }
  return { packages, vendored: [...vendored.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Renders the leading bundle comment. License texts are copied verbatim (line endings as LF). */
export function renderThirdPartyNotices({ packages, vendored }) {
  const sections = [];
  for (const pkg of packages) {
    const lines = [`Package: ${pkg.name}@${pkg.version}`, `Declared license: ${pkg.license ?? "(none declared)"}`];
    for (const file of pkg.licenseFiles) sections.push(`${lines.join("\n")}\nFile: ${file.file}\n${file.text}`);
    for (const extra of pkg.extraNotices) sections.push(`${extra.heading}\n${extra.text}`);
  }
  for (const component of vendored) {
    sections.push(
      `Component: ${component.name}@${component.version}\nDeclared license: ${component.license}\nIncluded inside: ${component.via.join(", ")} (prebuilt dist)\n${component.text}`,
    );
  }
  const body = sections.join("\n\n");
  if (body.includes("*/")) throw new Error("A license text contains a comment terminator and cannot be embedded");
  return `/*\nBundled third-party license notices\n\nThis file bundles the following third-party code. Each license text below is copied from the\ninstalled package or, for code a package bundled into its own dist files, from the exact\npublished version.\n\n${body}\n*/\n`;
}
