// S-10 (6.4b-5) memory diagnostic child. One fresh hidden process per series x repeat, run
// with --expose-gc and no heap flags (default heap). Prints exactly one JSON line.
// Each step indexes a fresh unique-ID copy of the fixture into the product
// defaultArtifactStore, runs query and summary on it (the MCP path), then drops the record
// and response references, overwrites the legacy RegExp statics, runs GC three times and
// measures R = (heapUsed + external) minus the same quantity before the first step.
// Store state is observed read-only through the private Map at runtime (never via get(),
// which would promote). Only primitives are kept between steps.
// run2 fix: every measurement first waits one macrotask. In run1 the D1 harness self-check
// failed because the top-level await kept the last resolved indexArtifact value (the record)
// reachable until the next macrotask; a scratch probe showed 730 MiB right after the flush
// and 0.0 MiB one setTimeout tick later. Criteria are unchanged.
import { readFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const gc3 = () => { globalThis.gc(); globalThis.gc(); globalThis.gc(); };
const level = () => { const m = process.memoryUsage(); return { heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers, sum: m.heapUsed + m.external }; };
const weightOf = (byteLength, lineCount) => 2 * byteLength + 160 * lineCount + 32768;
// Replace RegExp.input / RegExp.$_ / lastMatch, which can otherwise pin the last matched
// artifact text after classifyContext or query tokenization.
const resetRegExpStatics = () => { /x/.exec('x'); 'x'.replace(/x/, 'x'); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const out = { type: 's10-memory', series: config.series, repeat: config.repeat, node: process.version, v8: process.versions.v8, heapSizeLimit: getHeapStatistics().heap_size_limit, steps: [] };
try {
  if (typeof globalThis.gc !== 'function') throw new Error('--expose-gc is required');
  const mod = await import(pathToFileURL(config.module).href);
  const store = mod.defaultArtifactStore;
  const observe = () => {
    const entries = store.entries; // private TS field; read-only Map iteration, no get()
    let weightSum = 0; let formulaOk = true; const ids = [];
    for (const [id, entry] of entries) {
      ids.push(id); weightSum += entry.weight;
      if (entry.weight !== weightOf(entry.record.byteLength, entry.record.lineCount)) formulaOk = false;
    }
    return { count: entries.size, total: store.totalEstimatedBytes, max: store.maxEstimatedBytes, weightSum, formulaOk, ids };
  };
  await tick();
  gc3();
  const baseline = level();
  out.baseline = baseline;
  const insertedIds = [];
  for (let step = 0; step < config.files.length; step += 1) {
    const started = performance.now();
    let record = await mod.indexArtifact({ path: config.files[step], allowedRoots: [config.fixtureRoot] });
    const indexMs = performance.now() - started;
    const id = `${record.artifactId}`;
    const fields = { byteLength: record.byteLength, lineCount: record.lineCount, sha256: `${record.sha256}` };
    let query = mod.queryArtifact({ artifactId: id, query: config.query, maxTokens: 200 });
    let summary = mod.summarizeArtifact({ artifactId: id, maxTokens: 200 });
    const responses = { queryExcerpts: query.excerpts.length, queryFallback: query.fallbackReason, summaryFallback: summary.fallbackReason };
    record = null; query = null; summary = null;
    resetRegExpStatics();
    await tick();
    gc3();
    const after = level();
    insertedIds.push(id);
    const view = observe();
    const expectedOrder = insertedIds.slice(insertedIds.length - view.count);
    out.steps.push({
      step: step + 1, id, ...fields, weight: weightOf(fields.byteLength, fields.lineCount), indexMs, ...responses,
      after, retainedBytes: after.sum - baseline.sum,
      count: view.count, total: view.total, max: view.max, weightSum: view.weightSum, formulaOk: view.formulaOk,
      lruOrderOk: view.ids.length === expectedOrder.length && view.ids.every((value, index) => value === expectedOrder[index]),
    });
  }
  // Harness self-check: a synthetic empty record whose estimate equals the budget evicts
  // everything else. If the script still held fixture records or responses, the residual
  // would stay near the series retained size.
  const max = store.maxEstimatedBytes;
  store.put({ artifactId: 'flush', path: '/flush', sha256: '0'.repeat(64), byteLength: (max - 32768) / 2, lineCount: 0, content: '', sourceMap: [] });
  resetRegExpStatics();
  await tick();
  gc3();
  const flushed = level();
  const flushView = observe();
  out.flush = { count: flushView.count, ids: flushView.ids, retainedBytes: flushed.sum - baseline.sum };
  out.maxRssBytes = process.resourceUsage().maxRSS * 1024;
  out.status = 'completed';
} catch (error) {
  out.status = 'error';
  out.error = { name: error?.name, message: String(error?.message) };
  out.maxRssBytes = process.resourceUsage().maxRSS * 1024;
}
process.stdout.write(JSON.stringify(out) + '\n');
