// 6.4b-6 (N-33) timing child. One fresh hidden process per calibration or attempt.
// Imports four module copies (BASE x2, candidate x2), runs the preregistered schedule and
// prints exactly one JSON line. Statistics and verdicts are computed by the parent.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const arms = {};
for (const [name, path] of Object.entries(config.modules)) arms[name] = await import(pathToFileURL(path).href);

// Streaming digest of every SourceLine field, so arms can be compared without a huge JSON string.
function sourceMapDigest(record) {
  const hash = createHash('sha256');
  for (const line of record.sourceMap) hash.update(`${line.line}|${line.startByte}|${line.endByte}|${line.delimiter.length}:${line.delimiter}|${line.text.length}:`).update(line.text);
  return hash.digest('hex');
}

// One "call" = index every file of the shape, each with a fresh MemoryArtifactStore.
async function call(arm) {
  const mod = arms[arm];
  let last;
  for (const file of config.files) {
    const record = await mod.indexArtifact({ path: file.path, store: new mod.MemoryArtifactStore(), allowedRoots: [config.fixtureRoot] });
    if (record.lineCount !== file.lineCount || record.byteLength !== file.byteLength || record.sha256 !== file.sha256) {
      throw new Error(`output check failed for ${arm}: lineCount ${record.lineCount}/${file.lineCount}, bytes ${record.byteLength}/${file.byteLength}`);
    }
    last = record;
  }
  return last;
}
async function sample(arm, k) {
  const started = performance.now();
  for (let i = 0; i < k; i++) await call(arm);
  return performance.now() - started;
}

const out = { type: config.op, node: process.version, v8: process.versions.v8, samples: [], digests: {} };
const record = (label, arm, ms) => out.samples.push({ order: out.samples.length, label, arm, ms });
try {
  if (config.op === 'calibrate') {
    // run4 (prereg section 9): K = 1, 2, 4, ...; at each K, 5 batch samples of BASE copy 1 then 5 of
    // candidate copy 1. Stop at the smallest K where both minima are >= minSampleMs. Not used for verdicts.
    out.steps = [];
    let k = 1;
    for (;;) {
      const step = { k, base: [], candidate: [] };
      out.steps.push(step);
      for (let i = 0; i < config.calibrationSamples; i++) {
        try { step.base.push(await sample('B1', k)); } catch (error) { out.failedArm = 'B1'; throw error; }
      }
      for (let i = 0; i < config.calibrationSamples; i++) {
        try { step.candidate.push(await sample('C1', k)); } catch (error) { out.failedArm = 'C1'; throw error; }
      }
      if (Math.min(...step.base) >= config.minSampleMs && Math.min(...step.candidate) >= config.minSampleMs) { out.k = k; break; }
      if (k >= config.maxK) throw new Error(`calibration exceeded maxK ${config.maxK}`);
      k *= 2;
    }
  } else if (config.op === 'attempt') {
    // Correctness first, outside timing: every file's SourceLine digest must match across all four arms.
    for (const arm of Object.keys(arms)) {
      out.digests[arm] = [];
      for (const file of config.files) {
        const mod = arms[arm];
        const r = await mod.indexArtifact({ path: file.path, store: new mod.MemoryArtifactStore(), allowedRoots: [config.fixtureRoot] });
        out.digests[arm].push(sourceMapDigest(r));
      }
    }
    // run4: run the parent's fixed schedule exactly (warmup circuits then measured circuits).
    const k = config.k;
    for (const entry of config.schedule) record(entry.label, entry.arm, await sample(entry.arm, k));
  } else {
    throw new Error(`unknown op ${config.op}`);
  }
  out.status = 'completed';
} catch (error) {
  out.status = 'error';
  out.error = { name: error?.name, message: String(error?.message) };
}
process.stdout.write(JSON.stringify(out) + '\n');
