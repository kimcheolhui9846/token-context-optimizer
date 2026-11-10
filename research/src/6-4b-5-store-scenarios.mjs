import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const args = new Map(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => {
  const [key, ...rest] = x.slice(2).split('=');
  return [key, rest.join('=') || 'true'];
}));
const snapshotRoot = resolve(args.get('snapshot') || process.argv[2] || '.');
const k = Number(args.get('k') || 100);
const fixed = Number(args.get('fixed') || 4096);
const json = args.has('json');

const mod = await import(pathToFileURL(resolve(snapshotRoot, 'dist/src/core/artifacts.js')).href);
const { MemoryArtifactStore, queryArtifact, summarizeArtifact } = mod;
const failures = [];
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, ok: true }); }
  catch (error) { checks.push({ name, ok: false, error: error.message }); failures.push({ name, error: error.message }); }
}
function record(id, byteLength = 10) {
  const content = 'x'.repeat(byteLength);
  return { artifactId: id, path: `/fixture/${id}.txt`, sha256: '0'.repeat(64), byteLength, lineCount: 1,
    content, sourceMap: [{ line: 1, startByte: 0, endByte: byteLength, text: content, delimiter: '' }] };
}
function state(store) {
  return { keys: store.records ? [...store.records.keys()] : null, total: store.total ?? null };
}
function invariant(store) {
  if (!store.records) return;
  let total = 0;
  for (const [id, entry] of store.records) { if (!entry || !entry.record || entry.weight === undefined) return; assert.equal(id, entry.record.artifactId); assert.equal(entry.weight, weight(entry.record)); assert.ok(Number.isSafeInteger(entry.weight) && entry.weight >= 0); total += entry.weight; }
  assert.equal(store.total, total);
}
function weight(r) { return 2 * r.byteLength + k * r.sourceMap.length + fixed; }
// Check accounting after every operation without requiring a production public API.
const originalPut = MemoryArtifactStore.prototype.put, originalGet = MemoryArtifactStore.prototype.get;
MemoryArtifactStore.prototype.put = function (r) { originalPut.call(this, r); invariant(this); };
MemoryArtifactStore.prototype.get = function (id) { const value = originalGet.call(this, id); invariant(this); return value; };

check('initial LRU eviction', () => {
  const a = record('a', 10), b = record('b', 10);
  const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(a) + 1 });
  s.put(a); invariant(s); s.put(b); invariant(s); assert.equal(s.get('a'), undefined); invariant(s); assert.equal(s.get('b'), b); invariant(s);
});
check('get promotion', () => {
  const a = record('a', 10), b = record('b', 10), c = record('c', 10);
  const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(a) * 2 + 1 });
  s.put(a); invariant(s); s.put(b); invariant(s); assert.equal(s.get('a'), a); invariant(s); s.put(c); invariant(s); assert.equal(s.get('a'), a); invariant(s); assert.equal(s.get('b'), undefined); invariant(s);
});
check('get miss unchanged', () => {
  const s = new MemoryArtifactStore({ maxEstimatedBytes: 10000 }); const a = record('a'); s.put(a); const before = state(s);
  assert.equal(s.get('missing'), undefined); assert.deepEqual(state(s), before);
});
check('same ID replacement updates weights', () => {
  const a = record('same', 10), b = record('same', 100);
  const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(a) + 10 }); s.put(a); s.put(b);
  assert.equal(s.get('same'), b); assert.equal(s.total, weight(b));
});
check('same ID replacement supports shrink and grow', () => {
  const small = record('same', 10), large = record('same', 100);
  const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(large) + 1 });
  s.put(large); s.put(small); assert.equal(s.total, weight(small));
  s.put(large); assert.equal(s.total, weight(large)); assert.equal(s.get('same'), large);
});
check('re-put promotes', () => {
  const a = record('a'), b = record('b'), c = record('c'); const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(a) * 2 + 1 });
  s.put(a); s.put(b); s.put(a); s.put(c); assert.equal(s.get('a'), a); assert.equal(s.get('b'), undefined);
});
check('oversized entry evicts existing entries but remains', () => {
  const a = record('a', 10), huge = record('huge', 1000); const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(a) });
  s.put(a); s.put(huge); assert.equal(s.get('a'), undefined); assert.equal(s.get('huge'), huge); assert.equal(s.total, weight(huge));
});
function missingStore() {
  const a = record('missing'), b = record('retained'); const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(a) + 1 });
  s.put(a); invariant(s); s.put(b); invariant(s);
  return [s, a];
}
check('query missing ID preserves exact error', () => {
  const [s, a] = missingStore(); assert.throws(() => queryArtifact({ artifactId: a.artifactId, query: 'x', maxTokens: 10, store: s }), (error) => error.message === `Artifact not indexed: ${a.artifactId}`);
});
check('summary missing ID preserves exact error', () => {
  const [s, a] = missingStore(); assert.throws(() => summarizeArtifact({ artifactId: a.artifactId, maxTokens: 10, store: s }), (error) => error.message === `Artifact not indexed: ${a.artifactId}`);
});
for (const value of [0, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100']) check(`invalid constructor ${typeof value}:${String(value)}`, () => assert.throws(() => new MemoryArtifactStore({ maxEstimatedBytes: value }), /maxEstimatedBytes/));
check('same ID never double counts observable capacity', () => {
  const a = record('a'), b = record('b'); const s = new MemoryArtifactStore({ maxEstimatedBytes: weight(a) + weight(b) });
  s.put(a); s.put(a); s.put(b); assert.equal(s.get('a'), a); assert.equal(s.get('b'), b);
});
check('oversized empty and same ID replacement', () => {
  const s = new MemoryArtifactStore({ maxEstimatedBytes: 1 }), a = record('a'), b = record('a', 100);
  s.put(a); assert.equal(s.get('a'), a); s.put(b); assert.equal(s.get('a'), b); assert.equal(s.records.size, 1);
});
check('zero argument and maximum safe limit accepted', () => {
  for (const s of [new MemoryArtifactStore(), new MemoryArtifactStore({ maxEstimatedBytes: Number.MAX_SAFE_INTEGER })]) {
    const a = record('a'); s.put(a); assert.equal(s.get('a'), a);
  }
});

const result = { schema: '6-4b-5-store-scenarios/v1', snapshotRoot, k, fixed, checks, failures, pass: failures.length === 0 };
if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
else for (const item of checks) process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.error ? `: ${item.error}` : ''}\n`);
process.exitCode = failures.length ? 1 : 0;
