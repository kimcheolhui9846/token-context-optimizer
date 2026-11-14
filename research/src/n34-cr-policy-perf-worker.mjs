// N-34 timing child (plan PR #115 @4a5b390 section 8.4). One fresh hidden process per
// calibration or attempt. Imports four dist copies (B1, B2 = BASE; C1, C2 = CAND), builds the
// preregistered inputs in-process, checks public outputs outside the timed region, runs the
// parent's fixed schedule and prints exactly one JSON line. Verdicts are computed by the parent.
// G-C rows: B1/B2 use the LF substitute input (row.ref), C1/C2 use the CR input (row.cand).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { makeInput, o1View, o2View, runO1, runO2 } from './n34-cr-policy-perf-inputs.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = { type: config.op, node: process.version, v8: process.versions.v8, samples: [], digests: {} };
const record = (label, arm, ms) => out.samples.push({ order: out.samples.length, label, arm, ms });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

try {
  const arms = {};
  for (const [name, dir] of Object.entries(config.modules)) {
    arms[name] = {
      policy: await import(pathToFileURL(join(dir, 'src/core/policy.js')).href),
      artifacts: await import(pathToFileURL(join(dir, 'src/core/artifacts.js')).href),
    };
  }
  const row = config.row;
  const role = arm => (arm.startsWith('C') ? 'cand' : 'ref');
  const inputs = { cand: makeInput(row.cand, config.size) };
  inputs.ref = row.ref === row.cand ? inputs.cand : makeInput(row.ref, config.size);
  const paths = {};
  if (row.op === 'O2') {
    mkdirSync(config.workDir);
    for (const key of ['cand', 'ref']) {
      paths[key] = join(config.workDir, `${key}-${key === 'cand' ? row.cand : row.ref}.txt`);
      if (key === 'ref' && row.ref === row.cand) { paths.ref = paths.cand; continue; }
      writeFileSync(paths[key], inputs[key], { encoding: 'utf8', flag: 'wx' });
    }
  }
  async function call(arm) {
    const mod = arms[arm];
    if (row.op === 'O1') return runO1(mod, inputs[role(arm)]);
    const result = await runO2(mod, paths[role(arm)], config.workDir);
    if (result.record.byteLength !== config.size) throw new Error(`${arm}: byteLength ${result.record.byteLength} != ${config.size}`);
    return result;
  }
  const view = result => (row.op === 'O1' ? o1View(result) : o2View(result));
  async function sample(arm, k) {
    const started = performance.now();
    for (let i = 0; i < k; i++) await call(arm);
    return performance.now() - started;
  }

  if (config.op === 'calibrate') {
    // K = 1, 2, 4, ...; at each K, 5 batch samples of B1 then 5 of C1. Stop at the smallest K where
    // both minima are >= minSampleMs (maxK 1024). Calibration samples are never used for verdicts.
    out.steps = [];
    let k = 1;
    for (;;) {
      const step = { k, base: [], candidate: [] };
      out.steps.push(step);
      for (let i = 0; i < config.calibrationSamples; i++) step.base.push(await sample('B1', k));
      for (let i = 0; i < config.calibrationSamples; i++) step.candidate.push(await sample('C1', k));
      if (Math.min(...step.base) >= config.minSampleMs && Math.min(...step.candidate) >= config.minSampleMs) { out.k = k; break; }
      if (k >= config.maxK) throw new Error(`calibration exceeded maxK ${config.maxK}`);
      k *= 2;
    }
  } else if (config.op === 'attempt') {
    // Correctness outside timing: public output digest of every copy.
    for (const arm of Object.keys(arms)) { const v = view(await call(arm)); out.digests[arm] = digest(v); out.views ??= {}; out.views[arm] = v; }
    for (const entry of config.schedule) record(entry.label, entry.arm, await sample(entry.arm, config.k));
  } else {
    throw new Error(`unknown op ${config.op}`);
  }
  out.status = 'completed';
} catch (error) {
  out.status = 'error';
  out.error = { name: error?.name, message: String(error?.message) };
}
process.stdout.write(JSON.stringify(out) + '\n');
