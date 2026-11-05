import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, canonical, manifestHash, outputHash, PROTOCOL, schedule, SCHEMA, SEEDS, sha256, VARIANTS } from "./analyze-n17-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "docs/research/evidence/n17");
const manifestPath = resolve(evidence, "manifest.json");
const baselineCommit = "46939f3913e2c16bbe9bbc402974208e86eb99d6";
const size = 10 * 1024 * 1024;
const lf = text => text.replaceAll("\r\n", "\n");
const rel = path => relative(root, path).replaceAll("\\", "/");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
const environment = () => ({ node: process.version, v8: process.versions.v8, platform: platform(), release: release(), arch: process.arch, cpu: cpus()[0]?.model });
const unknown = { mode: "unknown", reasons: ["insufficient_semantic_signal"], warnings: ["lossy_compression_not_allowed"] };
const semantic = { mode: "semantic", reasons: ["natural_language"], warnings: [] };
const exact = reason => ({ mode: "exact", reasons: [reason], warnings: ["lossy_compression_not_allowed"] });
const outputs = (base, current = base) => ({ A: base, "A-prime": base, B: current });
export const RECIPES = [
  { id: "ko-repeated-space", kind: "worst", prefix: "", unit: "비밀 번호 ", expectedOutputs: outputs(unknown) },
  ...[["space", " "], ["tab", "\t"], ["nbsp", "\u00a0"], ["wide", "\u3000"], ["lf", "\n"], ["mixed", " \t\u00a0\u3000\n"]]
    .map(([name, unit]) => ({ id: `ko-label-${name}`, kind: "worst", prefix: "비밀번호", unit, expectedOutputs: outputs(unknown) })),
  { id: "english-credential", kind: "representative", literal: "password: hunter2", expectedOutputs: outputs(exact("secret")) },
  { id: "natural-language", kind: "representative", literal: "We should review the proposed schedule before the next meeting.", expectedOutputs: outputs(semantic) },
  { id: "numeric", kind: "representative", literal: "1234", expectedOutputs: outputs(exact("numeric_or_table")) },
  { id: "code", kind: "representative", literal: "const value = true;", expectedOutputs: outputs(exact("code_syntax")) },
  { id: "ko-positive-literal", kind: "oracle", literal: "회의실 비밀번호: hunter2 이니까 접속할 때 참고해 주세요.", expectedOutputs: outputs(semantic, exact("secret")) },
];
export function recipeInput(recipe) {
  if (recipe.literal !== undefined) return Buffer.from(recipe.literal, "utf8");
  const prefix = Buffer.from(recipe.prefix, "utf8"), unit = Buffer.from(recipe.unit, "utf8");
  const bytes = Buffer.alloc(size, 0x20);
  prefix.copy(bytes);
  const end = prefix.length + Math.floor((size - prefix.length) / unit.length) * unit.length;
  bytes.fill(unit, prefix.length, end);
  return bytes;
}
function recipesManifest() {
  return RECIPES.map(recipe => {
    const bytes = recipeInput(recipe);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { id: recipe.id, kind: recipe.kind, bytes: bytes.length, inputSha256: sha256(bytes),
      expectedOutputs: recipe.expectedOutputs,
      expectedOutputHashes: Object.fromEntries(VARIANTS.map(v => [v, outputHash(recipe.expectedOutputs[v])])) };
  });
}
const artifactPaths = {
  source: "src/core/policy.ts", types: "src/core/types.ts", tsconfig: "tsconfig.json",
  lockfile: "package-lock.json", build: "dist/src/core/policy.js", bundle: "bin/token-context-optimizer.mjs",
  runner: "scripts/measure-n17-policy.mjs", analyzer: "scripts/analyze-n17-policy.mjs",
  evidenceTests: "tests/n17-policy-evidence.test.ts", package: "package.json",
  compiler: "node_modules/typescript/lib/typescript.js", compilerCli: "node_modules/typescript/lib/tsc.js",
};
function artifactFingerprints() {
  return Object.fromEntries(Object.entries(artifactPaths).map(([key, path]) => [key, {
    path, normalization: key === "build" || key === "compiler" || key === "compilerCli" ? "bytes" : "LF",
    sha256: sha256(key === "build" || key === "compiler" || key === "compilerCli"
      ? readFileSync(resolve(root, path)) : lf(readFileSync(resolve(root, path), "utf8"))),
  }]));
}
function compilePolicy(name, source, types) {
  const dir = resolve(root, ".artifacts/n17-policy", name);
  mkdirSync(resolve(dir, "src"), { recursive: true });
  writeFileSync(resolve(dir, "package.json"), '{"type":"module"}\n');
  writeFileSync(resolve(dir, "src/policy.ts"), lf(source));
  writeFileSync(resolve(dir, "src/types.ts"), lf(types));
  writeFileSync(resolve(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true,
    esModuleInterop: true, skipLibCheck: true, types: [], rootDir: "src", outDir: "dist",
  }, include: ["src/**/*.ts"] }));
  execFileSync(process.execPath, [resolve(root, artifactPaths.compilerCli), "-p", resolve(dir, "tsconfig.json")],
    { cwd: root, windowsHide: true, stdio: "pipe" });
  return { path: rel(resolve(dir, "dist/policy.js")), sourceSha256: sha256(lf(source)),
    buildSha256: sha256(readFileSync(resolve(dir, "dist/policy.js"))) };
}
function prepare() {
  assert(!existsSync(manifestPath), "manifest already exists; refusing overwrite");
  git(["merge-base", "--is-ancestor", baselineCommit, "HEAD"]);
  for (const [key, file] of Object.entries(artifactPaths)) {
    if (["build", "compiler", "compilerCli"].includes(key)) continue;
    assert.equal(git(["ls-files", "--error-unmatch", file]).trim(), file);
    assert.equal(git(["status", "--porcelain", "--", file]).trim(), "", `commit inputs first: ${file}`);
  }
  const baseline = git(["show", `${baselineCommit}:src/core/policy.ts`]);
  const types = git(["show", `${baselineCommit}:src/core/types.ts`]);
  const A = compilePolicy("A", baseline, types), ap = compilePolicy("A-prime", baseline, types);
  assert.equal(A.buildSha256, ap.buildSha256, "baseline builds differ");
  const Bcheck = compilePolicy("B-check", readFileSync(resolve(root, artifactPaths.source), "utf8"), readFileSync(resolve(root, artifactPaths.types), "utf8"));
  assert.equal(Bcheck.buildSha256, sha256(readFileSync(resolve(root, artifactPaths.build))), "B dist does not match compiled current source");
  const manifest = { schema: SCHEMA, version: 1, baselineCommit, productCommit: git(["rev-parse", "HEAD"]).trim(),
    baselinePolicyBlob: git(["rev-parse", `${baselineCommit}:src/core/policy.ts`]).trim(),
    protocol: PROTOCOL, seeds: SEEDS, environment: environment(), artifacts: artifactFingerprints(),
    variants: { A, "A-prime": ap, B: { ...Bcheck, path: artifactPaths.build } },
    recipes: recipesManifest(), createdAt: new Date().toISOString(),
    notes: ["Single classifier call per cell; small inputs are noise-sensitive.", "No forced GC; natural runtime GC is retained.", "Drift is diagnostic only.",
      "Six-block bootstrap CI is descriptive, not an error-probability guarantee.", "No timing occurs during prepare; source/build provenance is compiled and verified."],
  };
  manifest.manifestSha256 = manifestHash(manifest);
  mkdirSync(evidence, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ prepared: rel(manifestPath), digest: manifest.manifestSha256, recipes: manifest.recipes.length }));
}

function loadManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.manifestSha256, manifestHash(manifest), "manifest digest mismatch");
  assert.equal(git(["status", "--porcelain", "--", rel(manifestPath)]).trim(), "", "manifest must be committed before measurement");
  assert.equal(git(["ls-files", "--error-unmatch", rel(manifestPath)]).trim(), rel(manifestPath));
  assert.equal(git(["hash-object", rel(manifestPath)]).trim(), git(["rev-parse", `HEAD:${rel(manifestPath)}`]).trim(), "manifest blob differs");
  git(["merge-base", "--is-ancestor", manifest.productCommit, "HEAD"]);
  assert.equal(manifest.baselineCommit, baselineCommit);
  assert.equal(manifest.baselinePolicyBlob, git(["rev-parse", `${baselineCommit}:src/core/policy.ts`]).trim());
  assert.deepEqual(manifest.protocol, PROTOCOL);
  assert.deepEqual(manifest.seeds, SEEDS);
  assert.deepEqual(manifest.environment, environment(), "environment changed after preparation");
  assert.deepEqual(manifest.artifacts, artifactFingerprints(), "source/build/bundle/script/compiler changed after preparation");
  assert.deepEqual(manifest.recipes, recipesManifest(), "input/oracle recipe changed");
  const paths = VARIANTS.map(v => resolve(root, manifest.variants[v].path));
  assert.equal(new Set(paths).size, 3, "variants must have independent module paths");
  for (const variant of VARIANTS) {
    const info = manifest.variants[variant];
    assert.equal(info.buildSha256, sha256(readFileSync(resolve(root, info.path))), `${variant} build bytes changed`);
  }
  assert.equal(manifest.variants.A.buildSha256, manifest.variants["A-prime"].buildSha256);
  assert.equal(manifest.variants.A.sourceSha256, sha256(lf(git(["show", `${baselineCommit}:src/core/policy.ts`]))));
  assert.equal(manifest.variants.B.sourceSha256, manifest.artifacts.source.sha256);
  assert.equal(manifest.variants.B.buildSha256, manifest.artifacts.build.sha256);
  return manifest;
}
async function modulesFor(manifest) {
  return Object.fromEntries(await Promise.all(VARIANTS.map(async variant => [variant,
    await import(pathToFileURL(resolve(root, manifest.variants[variant].path)).href)])));
}
async function check() {
  const manifest = loadManifest(), modules = await modulesFor(manifest);
  for (const recipe of RECIPES) {
    const input = recipeInput(recipe).toString("utf8");
    for (const variant of VARIANTS)
      assert.deepEqual(modules[variant].classifyContext(input), recipe.expectedOutputs[variant], `${recipe.id}/${variant} literal output`);
  }
  console.log(JSON.stringify({ checked: true, recipes: RECIPES.length, variants: 3, timed: false }));
}
function artifactStart(manifest, attempt) {
  return { schema: SCHEMA, version: 1, attempt, complete: false,
    manifestPath: rel(manifestPath), manifestSha256: manifest.manifestSha256,
    manifestCommit: git(["log", "-1", "--format=%H", "--", rel(manifestPath)]).trim(),
    startedAt: new Date().toISOString(), environment: environment(),
    artifactHashes: Object.fromEntries(Object.entries(manifest.artifacts).map(([key, item]) => [key, item.sha256])),
    variantHashes: manifest.variants, warmupSamples: [], samples: [], analysis: null };
}
export function retryAllowed(manifest, prior) {
  if (!prior || prior.attempt !== 1 || prior.manifestSha256 !== manifest.manifestSha256) return false;
  const verdict = analyze(manifest, prior);
  if (prior.analysis != null && canonical(prior.analysis) !== canonical(verdict)) return false;
  return verdict.status === "INVALID" && verdict.retryEligible;
}
async function measure(attempt) {
  assert([1, 2].includes(attempt), "only attempt 1 and one INVALID retry are permitted");
  const manifest = loadManifest();
  const path = resolve(evidence, `measurement-attempt-${attempt}.json`);
  assert(!existsSync(path), "attempt already exists; evidence cannot be overwritten");
  if (attempt === 2) {
    const prior = JSON.parse(readFileSync(resolve(evidence, "measurement-attempt-1.json"), "utf8"));
    assert(retryAllowed(manifest, prior), "prior attempt is not eligible for a full retry");
  } else assert(!existsSync(resolve(evidence, "measurement-attempt-2.json")), "attempt sequence already exists");
  const artifact = artifactStart(manifest, attempt);
  writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n", { flag: "wx" });
  const save = () => writeFileSync(path, JSON.stringify(artifact, null, 2) + "\n");
  try {
    const modules = await modulesFor(manifest);
    for (const recipe of manifest.recipes) {
      const definition = RECIPES.find(r => r.id === recipe.id);
      const bytes = recipeInput(definition);
      assert.equal(sha256(bytes), recipe.inputSha256);
      const input = bytes.toString("utf8"), orders = schedule();
      console.log(JSON.stringify({ attempt, recipe: recipe.id, state: "running" }));
      for (const phase of ["warmup", "measurement"]) {
        const count = phase === "warmup" ? 12 : 36, offset = phase === "warmup" ? 0 : 12;
        const target = phase === "warmup" ? artifact.warmupSamples : artifact.samples;
        for (let round = 0; round < count; round++) {
          for (const [position, variant] of orders[offset + round].entries()) {
            const started = process.hrtime.bigint();
            const output = modules[variant].classifyContext(input);
            const elapsedNs = Number(process.hrtime.bigint() - started);
            const fingerprint = manifest.variants[variant];
            target.push({ recipeId: recipe.id, phase, round, block: Math.floor(round / 6), position, variant,
              elapsedNs, inputSha256: recipe.inputSha256, sourceSha256: fingerprint.sourceSha256,
              buildSha256: fingerprint.buildSha256, output, outputHash: outputHash(output) });
          }
          // Persist outside a complete paired round; no hash or filesystem work is timed.
          save();
        }
      }
      console.log(JSON.stringify({ attempt, recipe: recipe.id, state: "recorded" }));
    }
    // A concurrent source/build change must invalidate the evidence rather than silently pass.
    loadManifest();
    artifact.complete = true;
    artifact.finishedAt = new Date().toISOString();
  } catch (error) {
    artifact.error = error instanceof Error ? error.message : String(error);
    artifact.complete = false;
  }
  artifact.analysis = analyze(manifest, artifact);
  save();
  const summary = { attempt, path: rel(path), status: artifact.analysis.status,
    retryEligible: artifact.analysis.retryEligible, recipes: artifact.analysis.recipes };
  console.log(JSON.stringify(summary));
  process.exitCode = summary.status === "INVALID" ? 3 : summary.status === "FAIL" ? 2 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  if (mode === "--prepare" && process.argv.length === 3) prepare();
  else if (mode === "--check" && process.argv.length === 3) await check();
  else if (mode === "--measure" && process.argv.length === 4) await measure(Number(process.argv[3]));
  else throw new Error("usage: node scripts/measure-n17-policy.mjs --prepare|--check|--measure <1|2>");
}
