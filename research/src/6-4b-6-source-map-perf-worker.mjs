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
    // BASE only: smallest power of two K whose minimum of 5 batch samples is >= 5 ms.
    out.steps = [];
    let k = 1;
    for (;;) {
      const values = [];
      for (let i = 0; i < 5; i++) values.push(await sample('B1', k));
      out.steps.push({ k, values });
      if (Math.min(...values) >= config.minSampleMs) { out.k = k; break; }
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
    const k = config.k;
    for (const arm of ['B1', 'B2', 'C1', 'C2']) for (let i = 0; i < config.warmups; i++) record(`warmup/${i}`, arm, await sample(arm, k));
    for (const [block, first, second] of [['AA-base', 'B1', 'B2'], ['AA-candidate', 'C1', 'C2'], ['comparison', 'B1', 'C1']]) {
      for (let cycle = 0; cycle < config.cycles; cycle++) {
        for (const arm of [first, second, second, first]) record(`${block}/${cycle}`, arm, await sample(arm, k));
      }
    }
  } else {
    throw new Error(`unknown op ${config.op}`);
  }
  out.status = 'completed';
} catch (error) {
  out.status = 'error';
  out.error = { name: error?.name, message: String(error?.message) };
}
process.stdout.write(JSON.stringify(out) + '\n');
