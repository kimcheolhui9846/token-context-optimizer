// 6.4b-6 (N-33) memory child. One fresh hidden process per arm x shape x repeat, run with
// --expose-gc and no heap flags (default heap). Prints exactly one JSON line.
// R = (heapUsed + external) after indexing with the record kept alive and 3 GCs, minus the same
//     quantity measured the same way before reading the file (arrayBuffers is inside external).
// P = process.resourceUsage().maxRSS, the process high-water mark (not an exact indexing peak).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = { type: 'memory', node: process.version, v8: process.versions.v8 };
const gc3 = () => { globalThis.gc(); globalThis.gc(); globalThis.gc(); };
const level = () => { const m = process.memoryUsage(); return { heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers, sum: m.heapUsed + m.external }; };
try {
  if (typeof globalThis.gc !== 'function') throw new Error('--expose-gc is required');
  const mod = await import(pathToFileURL(config.module).href);
  gc3();
  const before = level();
  const store = new mod.MemoryArtifactStore();
  const started = performance.now();
  const record = await mod.indexArtifact({ path: config.file.path, store, allowedRoots: [config.fixtureRoot] });
  out.elapsedMs = performance.now() - started;
  globalThis.keep = { store, record }; // keep the record alive through the after-GC level
  gc3();
  const after = level();
  out.before = before; out.after = after;
  out.retainedBytes = after.sum - before.sum;
  out.maxRssBytes = process.resourceUsage().maxRSS * 1024;
  out.lineCount = record.lineCount; out.byteLength = record.byteLength; out.sha256 = record.sha256;
  out.outputCheck = record.lineCount === config.file.lineCount && record.byteLength === config.file.byteLength && record.sha256 === config.file.sha256 && store.get(record.artifactId) === record;
  const hash = createHash('sha256');
  for (const line of record.sourceMap) hash.update(`${line.line}|${line.startByte}|${line.endByte}|${line.delimiter.length}:${line.delimiter}|${line.text.length}:`).update(line.text);
  out.sourceMapDigest = hash.digest('hex');
  out.status = out.outputCheck ? 'completed' : 'output_mismatch';
} catch (error) {
  out.status = 'error';
  out.error = { name: error?.name, message: String(error?.message) };
  out.maxRssBytes = process.resourceUsage().maxRSS * 1024;
}
process.stdout.write(JSON.stringify(out) + '\n');
