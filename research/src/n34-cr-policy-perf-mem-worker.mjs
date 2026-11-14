// N-34 memory child (plan PR #115 @4a5b390 section 8.5). One fresh hidden process per
// comparison x arm x repeat, run with --expose-gc only (default heap). Prints exactly one JSON line.
// Order: import module -> build input (O2: write the file) -> 3 GCs -> before -> one operation ->
// keep the result (O2: record and store) alive -> 3 GCs -> after.
// R = (heapUsed + external) after - before. P = process.resourceUsage().maxRSS * 1024, the process
// high-water mark (not the exact heap peak at the split).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { makeInput, o1View, o2View, runO1, runO2 } from './n34-cr-policy-perf-inputs.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = { type: 'memory', node: process.version, v8: process.versions.v8 };
const gc3 = () => { globalThis.gc(); globalThis.gc(); globalThis.gc(); };
const level = () => { const m = process.memoryUsage(); return { heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers, sum: m.heapUsed + m.external }; };
try {
  if (typeof globalThis.gc !== 'function') throw new Error('--expose-gc is required');
  const mod = {
    policy: await import(pathToFileURL(join(config.module, 'src/core/policy.js')).href),
    artifacts: await import(pathToFileURL(join(config.module, 'src/core/artifacts.js')).href),
  };
  const input = makeInput(config.inputId, config.size);
  let path;
  if (config.op === 'O2') {
    mkdirSync(config.workDir);
    path = join(config.workDir, `${config.inputId}.txt`);
    writeFileSync(path, input, { encoding: 'utf8', flag: 'wx' });
  }
  globalThis.keepInput = input;
  gc3();
  const before = level();
  const started = performance.now();
  let view;
  if (config.op === 'O1') {
    const result = runO1(mod, input);
    out.elapsedMs = performance.now() - started;
    globalThis.keep = result;
    view = o1View(result);
  } else {
    const result = await runO2(mod, path, config.workDir);
    out.elapsedMs = performance.now() - started;
    globalThis.keep = result; // record, store and summary stay alive through the after level
    view = o2View(result);
    out.lineCount = result.record.lineCount; out.byteLength = result.record.byteLength;
    if (result.record.byteLength !== config.size) throw new Error(`byteLength ${result.record.byteLength} != ${config.size}`);
  }
  gc3();
  const after = level();
  out.before = before; out.after = after;
  out.retainedBytes = after.sum - before.sum;
  out.maxRssBytes = process.resourceUsage().maxRSS * 1024;
  out.view = view;
  out.outputDigest = createHash('sha256').update(JSON.stringify(view)).digest('hex');
  out.status = 'completed';
} catch (error) {
  out.status = 'error';
  out.error = { name: error?.name, message: String(error?.message) };
  out.maxRssBytes = process.resourceUsage().maxRSS * 1024;
}
process.stdout.write(JSON.stringify(out) + '\n');
