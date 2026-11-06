import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEMA = "n17-policy-performance/v1";
export const VARIANTS = ["A", "A-prime", "B"];
export const SEEDS = { shuffle: 0x4e173001, bootstrap: 0x4e173002 };
export const CAMPAIGN = Object.freeze({ firstAttempt: 2, maxAttempt: 3 });
export const PROTOCOL = {
  warmupRounds: 12, warmupBlocks: 2, measuredRounds: 36, measuredBlocks: 6,
  roundsPerBlock: 6, callsPerRound: 3, iterations: 1,
  threshold: 1.03, aaLower: 0.97, aaUpper: 1.03,
  bootstrapResamples: 10000, bootstrapBlocksPerDraw: 6,
  quantiles: [0.025, 0.975], percentile: "type-7",
  drift: { warmupHalf: 6, measuredHalf: 18, statistic: "arithmetic-mean", diagnosticOnly: true },
  shuffleReset: "per-recipe; warmup followed by measurement",
};
export const PERMUTATIONS = [
  ["A", "A-prime", "B"], ["A", "B", "A-prime"], ["A-prime", "A", "B"],
  ["A-prime", "B", "A"], ["B", "A", "A-prime"], ["B", "A-prime", "A"],
];
export function canonical(value) {
  return JSON.stringify(value, function (_key, item) {
    return item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item;
  });
}
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const outputHash = value => sha256(canonical(value));
export function manifestHash(manifest) {
  const { manifestSha256: _ignored, ...body } = manifest;
  return outputHash(body);
}
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const hashValid = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const positive = v => typeof v === "number" && Number.isFinite(v) && v > 0;
const equal = (a, b) => canonical(a) === canonical(b);

export function mulberry32(seed) {
  return () => {
    let n = seed += 0x6d2b79f5;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
export function schedule() {
  const random = mulberry32(SEEDS.shuffle), rows = [];
  for (let block = 0; block < PROTOCOL.warmupBlocks + PROTOCOL.measuredBlocks; block++) {
    const permutations = PERMUTATIONS.map(order => [...order]);
    for (let i = permutations.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [permutations[i], permutations[j]] = [permutations[j], permutations[i]];
    }
    rows.push(...permutations);
  }
  return rows;
}
export function median(values) {
  if (!values.length || values.some(v => !Number.isFinite(v))) throw new Error("finite median samples required");
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function type7(values, q) {
  if (!values.length || !Number.isFinite(q) || q < 0 || q > 1) throw new Error("invalid percentile input");
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * q;
  return sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1);
}
export function bootstrapMedian(blocks, draws = PROTOCOL.bootstrapResamples, seed = SEEDS.bootstrap) {
  if (blocks.length !== 6 || blocks.some(b => !Array.isArray(b) || b.length !== 6 || b.some(v => !positive(v))))
    throw new Error("six complete blocks of six positive ratios required");
  if (!Number.isInteger(draws) || draws < 1) throw new Error("positive bootstrap draws required");
  const random = mulberry32(seed), estimates = [];
  for (let i = 0; i < draws; i++) {
    const sample = [];
    for (let j = 0; j < 6; j++) sample.push(...blocks[Math.floor(random() * 6)]);
    estimates.push(median(sample));
  }
  return { pointEstimate: median(blocks.flat()), draws, ci: PROTOCOL.quantiles.map(q => type7(estimates, q)) };
}

export function analyze(manifest, artifact) {
  const problems = [];
  const fail = (message, recipeId = null) => problems.push({ recipeId, message });
  if (!object(manifest) || !object(artifact)) return {
    schema: SCHEMA, status: "INVALID", retryEligible: false, recipes: [], errors: ["manifest and artifact objects required"],
  };
  if (manifest.schema !== SCHEMA || artifact.schema !== SCHEMA || manifest.version !== 1 || artifact.version !== 1) fail("schema/version mismatch");
  if (!equal(manifest.protocol, PROTOCOL) || !equal(manifest.seeds, SEEDS)) fail("protocol/seed mismatch");
  if (!hashValid(manifest.manifestSha256) || manifest.manifestSha256 !== manifestHash(manifest)
      || artifact.manifestSha256 !== manifest.manifestSha256) fail("manifest digest mismatch");
  const campaign = manifest.campaign;
  const campaignValid = campaign === undefined
    || (object(campaign) && campaign.firstAttempt === 2 && campaign.maxAttempt === 3);
  if (!campaignValid) fail("invalid campaign metadata");
  const attempts = campaignValid && campaign ? [CAMPAIGN.firstAttempt, CAMPAIGN.maxAttempt] : [1, 2];
  if (!attempts.includes(artifact.attempt) || artifact.complete !== true) fail("incomplete or invalid attempt");
  if (!object(manifest.environment) || !equal(manifest.environment, artifact.environment)) fail("environment mismatch");
  if (!object(manifest.artifacts) || !Object.keys(manifest.artifacts).length || !object(artifact.artifactHashes)) fail("artifact hashes missing");
  else for (const [key, item] of Object.entries(manifest.artifacts)) {
    if (!hashValid(item?.sha256) || artifact.artifactHashes[key] !== item.sha256) fail(`artifact hash mismatch: ${key}`);
  }
  if (!object(manifest.variants) || !equal(manifest.variants, artifact.variantHashes)) fail("variant fingerprints missing or mismatched");
  for (const variant of VARIANTS) {
    const item = manifest.variants?.[variant];
    if (!hashValid(item?.sourceSha256) || !hashValid(item?.buildSha256)) fail(`invalid variant fingerprint: ${variant}`);
  }
  if (manifest.variants?.A?.sourceSha256 !== manifest.variants?.["A-prime"]?.sourceSha256
      || manifest.variants?.A?.buildSha256 !== manifest.variants?.["A-prime"]?.buildSha256) fail("baseline copies differ");
  const recipes = Array.isArray(manifest.recipes) ? manifest.recipes : [];
  if (!recipes.length || recipes.some(r => !object(r) || typeof r.id !== "string" || !r.id)
      || new Set(recipes.map(r => r?.id)).size !== recipes.length) fail("invalid or duplicate recipe IDs");
  const safeRecipes = recipes.filter(r => object(r) && typeof r.id === "string");
  const recipeIds = new Set(safeRecipes.map(r => r.id));
  for (const recipe of safeRecipes) {
    if (!hashValid(recipe.inputSha256) || !Number.isSafeInteger(recipe.bytes) || recipe.bytes < 1) fail("invalid input fingerprint", recipe.id);
    for (const variant of VARIANTS) {
      const expected = recipe.expectedOutputs?.[variant], digest = recipe.expectedOutputHashes?.[variant];
      if (!object(expected) || !["exact", "unknown", "semantic", "visual"].includes(expected.mode)
          || !Array.isArray(expected.reasons) || !Array.isArray(expected.warnings)
          || !hashValid(digest) || digest !== outputHash(expected)) fail(`literal oracle missing/mismatched: ${variant}`, recipe.id);
    }
    if (!equal(recipe.expectedOutputs?.A, recipe.expectedOutputs?.["A-prime"])) fail("baseline oracle differs", recipe.id);
  }
  const phases = [
    { name: "warmup", rows: artifact.warmupSamples, count: 12, offset: 0 },
    { name: "measurement", rows: artifact.samples, count: 36, offset: 12 },
  ];
  const orders = schedule();
  for (const phase of phases) {
    if (!Array.isArray(phase.rows)) { fail(`${phase.name} samples missing`); phase.rows = []; }
    for (const row of phase.rows) if (!object(row) || !recipeIds.has(row.recipeId)) fail(`${phase.name}: unknown recipe or malformed row`);
    for (const recipe of safeRecipes) {
      const rows = phase.rows.filter(row => object(row) && row.recipeId === recipe.id);
      if (rows.length !== phase.count * 3) fail(`${phase.name}: sample count mismatch`, recipe.id);
      const seen = new Set();
      for (const row of rows) {
        const coordinate = `${row.round}/${row.position}`;
        if (seen.has(coordinate)) fail(`${phase.name}: duplicate sample`, recipe.id);
        seen.add(coordinate);
        const coordinatesValid = Number.isInteger(row.round) && row.round >= 0 && row.round < phase.count
          && Number.isInteger(row.position) && row.position >= 0 && row.position < 3;
        if (!coordinatesValid || row.block !== Math.floor(row.round / 6) || row.phase !== phase.name
            || (coordinatesValid && row.variant !== orders[phase.offset + row.round][row.position])) fail(`${phase.name}: order/block/phase mismatch`, recipe.id);
        if (!positive(row.elapsedNs)) fail(`${phase.name}: non-positive/non-finite timing`, recipe.id);
        if (row.inputSha256 !== recipe.inputSha256) fail(`${phase.name}: input hash mismatch`, recipe.id);
        const fingerprint = manifest.variants?.[row.variant];
        if (!fingerprint || row.sourceSha256 !== fingerprint.sourceSha256 || row.buildSha256 !== fingerprint.buildSha256) fail(`${phase.name}: source/build hash mismatch`, recipe.id);
        if (!object(row.output) || row.outputHash !== outputHash(row.output)
            || row.outputHash !== recipe.expectedOutputHashes?.[row.variant]) fail(`${phase.name}: full output oracle/hash mismatch`, recipe.id);
      }
    }
  }
  const globalInvalid = problems.some(p => p.recipeId === null);
  const results = safeRecipes.map(recipe => {
    const local = problems.filter(p => p.recipeId === recipe.id).map(p => p.message);
    const rows = phases[1].rows.filter(r => object(r) && r.recipeId === recipe.id);
    const warmup = phases[0].rows.filter(r => object(r) && r.recipeId === recipe.id);
    const ratios = [], aa = [];
    for (let round = 0; round < 36; round++) {
      const cells = rows.filter(r => r.round === round);
      const values = Object.fromEntries(cells.map(r => [r.variant, r.elapsedNs]));
      if (cells.length === 3 && VARIANTS.every(v => positive(values[v]))) {
        ratios.push(values.B / ((values.A + values["A-prime"]) / 2)); aa.push(values["A-prime"] / values.A);
      }
    }
    const pointEstimate = ratios.length === 36 && ratios.every(positive) ? median(ratios) : null;
    const aaRatio = aa.length === 36 && aa.every(positive) ? median(aa) : null;
    const bootstrap = ratios.length === 36 && ratios.every(positive)
      ? bootstrapMedian(Array.from({ length: 6 }, (_, i) => ratios.slice(i * 6, (i + 1) * 6))) : null;
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const drift = Object.fromEntries(VARIANTS.map(variant => {
      const values = list => list.filter(r => r.variant === variant).sort((a, b) => a.round - b.round).map(r => r.elapsedNs);
      const w = values(warmup), m = values(rows);
      return [variant, w.length === 12 && m.length === 36 && [...w, ...m].every(positive) ? {
        warmupBackFront: mean(w.slice(6)) / mean(w.slice(0, 6)),
        measuredBackFront: mean(m.slice(18)) / mean(m.slice(0, 18)),
      } : null];
    }));
    if (aaRatio === null || aaRatio < PROTOCOL.aaLower || aaRatio > PROTOCOL.aaUpper) local.push("paired A-prime/A outside validity band");
    if (!positive(pointEstimate) || !bootstrap) local.push("paired ratios incomplete or non-finite");
    const localStatus = local.length ? "INVALID"
      : pointEstimate > PROTOCOL.threshold ? "FAIL" : bootstrap.ci[1] > PROTOCOL.threshold ? "BORDERLINE" : "PASS";
    const status = globalInvalid ? "INVALID" : localStatus;
    return { recipeId: recipe.id, pointEstimate, aaRatio, bootstrap, drift, status, localStatus, reasons: [...new Set(local)] };
  });
  const status = globalInvalid || !results.length ? "INVALID"
    : ["INVALID", "FAIL", "BORDERLINE", "PASS"].find(s => results.some(r => r.status === s));
  return { schema: SCHEMA, status, retryEligible: status === "INVALID"
    && campaignValid
    && artifact.attempt === (campaign ? CAMPAIGN.firstAttempt : 1)
    && !results.some(r => r.localStatus === "FAIL"),
    recipes: results, errors: [...new Set(problems.map(p => `${p.recipeId ?? "global"}: ${p.message}`))] };
}
export function validateArtifact(manifest, artifact) { return analyze(manifest, artifact).errors; }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("usage: node scripts/analyze-n17-policy.mjs <attempt.json>");
  const artifact = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(artifact.manifestPath), "utf8"));
  const result = analyze(manifest, artifact);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "INVALID" ? 3 : result.status === "FAIL" ? 2 : 0;
}
