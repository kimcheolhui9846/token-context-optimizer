import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyze, canonical, CAMPAIGN, manifestHash, outputHash, PROTOCOL, schedule, SCHEMA, SEEDS, sha256, VARIANTS } from "./analyze-n17-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "docs/research/evidence/n17");
const originalManifestPath = resolve(evidence, "manifest.json");
const manifestPath = resolve(evidence, "manifest-attempt-2.json");
const baselineCommit = "46939f3913e2c16bbe9bbc402974208e86eb99d6";
const parentEvidenceCommit = "48cbaf1d23b2b1de2fca353a5c9ad96e21150414";
const size = 10 * 1024 * 1024;
const lf = text => text.replaceAll("\r\n", "\n");
const rel = path => relative(root, path).replaceAll("\\", "/");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const gitBytes = args => execFileSync("git", args, { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const environment = () => ({ node: process.version, v8: process.versions.v8, platform: platform(), release: release(), arch: process.arch, cpu: cpus()[0]?.model });
const unknown = { mode: "unknown", reasons: ["insufficient_semantic_signal"], warnings: ["lossy_compression_not_allowed"] };
const semantic = { mode: "semantic", reasons: ["natural_language"], warnings: [] };
const exact = reason => ({ mode: "exact", reasons: [reason], warnings: ["lossy_compression_not_allowed"] });
const outputs = (base, current = base) => ({ A: base, "A-prime": base, B: current });
const repeated = (id, unit, expectedOutputs) => ({ id, kind: "representative", prefix: "", unit, generator: { version: 1, unit, padding: "ascii-space" }, expectedOutputs });
export const RECIPES = [
  { id: "ko-repeated-space", kind: "worst", prefix: "", unit: "비밀 번호 ", expectedOutputs: outputs(unknown) },
  ...[["space", " "], ["tab", "\t"], ["nbsp", "\u00a0"], ["wide", "\u3000"], ["lf", "\n"], ["mixed", " \t\u00a0\u3000\n"]]
    .map(([name, unit]) => ({ id: `ko-label-${name}`, kind: "worst", prefix: "비밀번호", unit, expectedOutputs: outputs(unknown) })),
  repeated("ko-prose-10mib", "회의실에서 다음 일정과 검토 결과를 함께 정리합니다.\n", outputs(semantic)),
  repeated("en-prose-10mib", "We should review the proposed schedule before the next meeting and share the summary with everyone.\n", outputs(semantic)),
  repeated("code-10mib", "const value = true;\n", outputs(exact("code_syntax"))),
  repeated("markdown-10mib", "# Project notes\n\nWe should review the proposed schedule before the next meeting.\n\n", outputs(unknown)),
  repeated("ko-credential-10mib", "회의실 비밀번호: hunter2 이니까 접속할 때 참고해 주세요. ", outputs(semantic, exact("secret"))),
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
export function recipesManifest() {
  return RECIPES.map(recipe => {
    const bytes = recipeInput(recipe);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { id: recipe.id, kind: recipe.kind, bytes: bytes.length, inputSha256: sha256(bytes), ...(recipe.generator ? { generator: recipe.generator } : {}),
      expectedOutputs: recipe.expectedOutputs,
      expectedOutputHashes: Object.fromEntries(VARIANTS.map(v => [v, outputHash(recipe.expectedOutputs[v])])) };
  });
}
const originalLiteralIds = ["english-credential", "natural-language", "numeric", "code", "ko-positive-literal"];
function median(values) {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function originalLiteralEvidence() {
  const original = JSON.parse(readFileSync(resolve(evidence, "measurement-attempt-1.json"), "utf8"));
  return original.analysis.recipes.filter(r => originalLiteralIds.includes(r.recipeId)).map(r => ({
    id: r.recipeId, medianNs: Object.fromEntries(VARIANTS.map(variant => [variant,
      median(original.samples.filter(row => row.recipeId === r.recipeId && row.variant === variant).map(row => row.elapsedNs))])),
    ci: r.bootstrap?.ci, aaRatio: r.aaRatio,
  }));
}
export function validateCampaignParent(manifest, parentManifest, parentRawHashes) {
  const campaign = manifest?.campaign;
  const requiredRawKeys = ["manifest.json", "measurement-attempt-1.json", "result.md"];
  if (!campaign || campaign.firstAttempt !== 2 || campaign.maxAttempt !== 3
      || campaign.parentCommit !== parentEvidenceCommit
      || !parentManifest || manifest.protocol === undefined || manifest.seeds === undefined) return false;
  if (!parentRawHashes || JSON.stringify(Object.keys(parentRawHashes).sort()) !== JSON.stringify(requiredRawKeys)
      || JSON.stringify(Object.keys(campaign.originalRawSha256 ?? {}).sort()) !== JSON.stringify(requiredRawKeys)
      || campaign.originalManifestSha256 !== parentRawHashes["manifest.json"]
      || parentManifest.manifestSha256 !== manifestHash(parentManifest)
      || !Object.entries(parentRawHashes).every(([file, hash]) => campaign.originalRawSha256?.[file] === hash)) return false;
  if (JSON.stringify(manifest.protocol) !== JSON.stringify(parentManifest.protocol)
      || JSON.stringify(manifest.seeds) !== JSON.stringify(parentManifest.seeds)) return false;
  const worst = recipes => recipes.filter(r => r.kind === "worst").map(({ id, bytes, inputSha256, expectedOutputHashes }) => ({ id, bytes, inputSha256, expectedOutputHashes }));
  return JSON.stringify(worst(manifest.recipes ?? [])) === JSON.stringify(worst(parentManifest.recipes ?? []));
}
function verifyParentEvidence(manifest) {
  const parentFiles = ["manifest.json", "measurement-attempt-1.json", "result.md"];
  assert.equal(manifest.campaign.parentCommit, parentEvidenceCommit);
  assert.equal(manifest.campaign.originalManifestSha256, sha256(readFileSync(originalManifestPath)));
  for (const file of parentFiles) {
    const actual = readFileSync(resolve(evidence, file));
    const expected = gitBytes(["show", `${parentEvidenceCommit}:docs/research/evidence/n17/${file}`]);
    assert.equal(sha256(actual), sha256(expected), `parent evidence changed: ${file}`);
    assert.equal(manifest.campaign.originalRawSha256[file], sha256(actual), `parent evidence hash mismatch: ${file}`);
  }
  const parentManifest = JSON.parse(readFileSync(originalManifestPath, "utf8"));
  const parentRawHashes = Object.fromEntries(parentFiles.map(file => [file, sha256(readFileSync(resolve(evidence, file)))]));
  assert(validateCampaignParent(manifest, parentManifest, parentRawHashes), "campaign parent validation failed");
  assert.deepEqual(manifest.originalLiteralEvidence, originalLiteralEvidence(), "original literal evidence changed");
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
async function prepare() {
  assert(existsSync(originalManifestPath), "original manifest missing");
  assert(!existsSync(manifestPath), "campaign manifest already exists; refusing overwrite");
  git(["merge-base", "--is-ancestor", baselineCommit, "HEAD"]);
  git(["merge-base", "--is-ancestor", parentEvidenceCommit, "HEAD"]);
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
  const oracleModules = { A: await import(pathToFileURL(resolve(root, A.path)).href), "A-prime": await import(pathToFileURL(resolve(root, ap.path)).href), B: await import(pathToFileURL(resolve(root, Bcheck.path)).href) };
  for (const recipe of RECIPES) {
    const input = recipeInput(recipe).toString("utf8");
    for (const variant of VARIANTS) assert.deepEqual(oracleModules[variant].classifyContext(input), recipe.expectedOutputs[variant], `${recipe.id}/${variant} oracle mismatch`);
  }
  const originalRaw = readFileSync(originalManifestPath);
  const parentFiles = ["manifest.json", "measurement-attempt-1.json", "result.md"];
  for (const file of parentFiles) {
    assert.equal(git(["cat-file", "-e", `${parentEvidenceCommit}:docs/research/evidence/n17/${file}`]), "", `parent evidence missing: ${file}`);
    assert.equal(sha256(readFileSync(resolve(evidence, file))), sha256(gitBytes(["show", `${parentEvidenceCommit}:docs/research/evidence/n17/${file}`])), `parent evidence changed: ${file}`);
  }
  const manifest = { schema: SCHEMA, version: 1, baselineCommit, productCommit: git(["rev-parse", "HEAD"]).trim(),
    campaign: { ...CAMPAIGN, parentCommit: parentEvidenceCommit, originalManifestSha256: sha256(originalRaw), originalRawSha256: Object.fromEntries(parentFiles.map(file => [file, sha256(readFileSync(resolve(evidence, file)))])), reason: "attempt-1 FAIL 뒤 구현 변경 + 대표 입력 측정 설계 결함 수리. 게이트 기준 불변" },
    baselinePolicyBlob: git(["rev-parse", `${baselineCommit}:src/core/policy.ts`]).trim(),
    protocol: PROTOCOL, seeds: SEEDS, environment: environment(), artifacts: artifactFingerprints(),
    variants: { A, "A-prime": ap, B: { ...Bcheck, path: artifactPaths.build } },
    recipes: recipesManifest(), originalLiteralEvidence: originalLiteralEvidence(), createdAt: new Date().toISOString(),
    notes: ["Single classifier call per cell; small inputs are noise-sensitive.", "No forced GC; natural runtime GC is retained.", "Drift is diagnostic only.",
      "Six-block bootstrap CI is descriptive, not an error-probability guarantee.", "No timing occurs during prepare; source/build provenance is compiled and verified."],
  };
  const parentManifest = JSON.parse(originalRaw);
  const parentRawHashes = Object.fromEntries(parentFiles.map(file => [file, sha256(readFileSync(resolve(evidence, file)))]));
  assert(validateCampaignParent(manifest, parentManifest, parentRawHashes), "campaign parent validation failed");
  assert.deepEqual(manifest.originalLiteralEvidence, originalLiteralEvidence(), "original literal evidence changed");
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
  git(["merge-base", "--is-ancestor", parentEvidenceCommit, "HEAD"]);
  assert.equal(manifest.baselineCommit, baselineCommit);
  verifyParentEvidence(manifest);
  assert.deepEqual(manifest.campaign && { firstAttempt: manifest.campaign.firstAttempt, maxAttempt: manifest.campaign.maxAttempt }, CAMPAIGN);
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
export function attemptRange(attempt, campaign = CAMPAIGN) {
  if (!Number.isInteger(attempt) || !campaign || campaign.firstAttempt !== CAMPAIGN.firstAttempt || campaign.maxAttempt !== CAMPAIGN.maxAttempt) return null;
  return attempt === CAMPAIGN.firstAttempt || attempt === CAMPAIGN.maxAttempt ? { first: CAMPAIGN.firstAttempt, last: CAMPAIGN.maxAttempt } : null;
}
export function retryAllowed(manifest, prior) {
  const campaign = manifest?.campaign;
  if (campaign !== undefined && (!campaign || campaign.firstAttempt !== 2 || campaign.maxAttempt !== 3)) return false;
  const firstAttempt = campaign ? campaign.firstAttempt : 1;
  if (!prior || prior.attempt !== firstAttempt || prior.manifestSha256 !== manifest.manifestSha256) return false;
  const verdict = analyze(manifest, prior);
  if (prior.analysis != null && canonical(prior.analysis) !== canonical(verdict)) return false;
  return verdict.status === "INVALID" && verdict.retryEligible;
}
async function measure(attempt) {
  assert(attemptRange(attempt), "only attempts 2 and 3 are permitted for the new campaign");
  const manifest = loadManifest();
  const path = resolve(evidence, `measurement-attempt-${attempt}.json`);
  assert(!existsSync(path), "attempt already exists; evidence cannot be overwritten");
  assert(manifest.campaign?.firstAttempt === 2 && manifest.campaign?.maxAttempt === 3, "validated campaign metadata required");
  if (attempt === 2) assert(!existsSync(resolve(evidence, "measurement-attempt-3.json")), "attempt sequence already exists");
  else {
    assert(existsSync(resolve(evidence, "measurement-attempt-2.json")), "attempt two is required before attempt three");
    const priorPath = resolve(evidence, "measurement-attempt-2.json");
    assert.equal(git(["ls-files", "--error-unmatch", rel(priorPath)]).trim(), rel(priorPath), "prior attempt must be tracked");
    assert.equal(git(["status", "--porcelain", "--", rel(priorPath)]).trim(), "", "prior attempt must be clean");
    assert.equal(git(["hash-object", rel(priorPath)]).trim(), git(["rev-parse", `HEAD:${rel(priorPath)}`]).trim(), "prior attempt blob differs");
    const prior = JSON.parse(readFileSync(resolve(evidence, "measurement-attempt-2.json"), "utf8"));
    assert.equal(prior.manifestPath, rel(manifestPath), "prior attempt manifest path differs");
    assert(retryAllowed(manifest, prior), "prior attempt is not eligible for a retry");
  }
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
  if (mode === "--prepare" && process.argv.length === 3) await prepare();
  else if (mode === "--check" && process.argv.length === 3) await check();
  else if (mode === "--measure2" && process.argv.length === 3) await measure(2);
  else if (mode === "--measure3" && process.argv.length === 3) await measure(3);
  else throw new Error("usage: node scripts/measure-n17-policy.mjs --prepare|--check|--measure2|--measure3");
}
