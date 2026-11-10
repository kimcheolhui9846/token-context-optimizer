import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getHeapStatistics } from 'node:v8';

const request = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { MemoryArtifactStore, indexArtifact } = await import(pathToFileURL(resolve('dist/src/core/artifacts.js')));
const { MemoryImageArtifactStore } = await import(pathToFileURL(resolve('dist/src/core/image-artifacts.js')));
assert.equal(typeof global.gc, 'function', 'requires --expose-gc');
async function collect() {
  for (let i = 0; i < 3; i++) { global.gc(); await new Promise(setImmediate); }
}
const snapshot = () => ({ ...process.memoryUsage(), maxRSSKiB: process.resourceUsage().maxRSS });
function clearRegexState() { /small-control/u.test('small-control'); }
function describeText(store) {
  const rows = [];
  for (const record of store.records.values()) {
    assert.equal(record.lineCount, record.sourceMap.length);
    rows.push({ byteLength: record.byteLength, lineCount: record.sourceMap.length,
      utf16Length: record.content.length, sha256: record.sha256 });
  }
  return rows;
}
async function warmText() {
  const store = new MemoryArtifactStore();
  await indexArtifact({ path: request.warmPath, allowedRoots: request.allowedRoots, store });
}
function imageRecord(index, tolerant) {
  const hex = index.toString(16);
  return { artifactId: `image_${hex.padStart(16, '0')}`, path: `image-fixtures/image-${hex}.png`,
    sha256: hex.padStart(64, '0'), byteLength: 68, width: 1, height: 1, bitDepth: 8,
    format: 'png', mimeType: 'image/png', channels: 3,
    validationProfile: tolerant ? 'png-rgb8-tolerant-v1' : 'png-rgb8-static-v1',
    ...(tolerant ? { ignoredChunks: ['tEXt', 'gAMA'], alpha: 'none' } : {}) };
}
function fillImages(store, count, tolerant) {
  for (let i = 0; i < count; i++) store.put(imageRecord(i, tolerant));
}
function warmImages(tolerant) {
  const store = new MemoryImageArtifactStore(); fillImages(store, 32, tolerant);
}
async function measureText() {
  await warmText(); clearRegexState(); await collect();
  let store = new MemoryArtifactStore(); const baseline = snapshot();
  for (const path of request.paths) {
    // Only the store retains the result; fixture bytes live in the parent process.
    await indexArtifact({ path, allowedRoots: request.allowedRoots, store });
  }
  await collect(); const retained = snapshot();
  const records = describeText(store); // Primitive metadata, collected after retained snapshot.
  assert.equal(records.length, request.paths.length);
  store = null; clearRegexState(); await collect();
  return { baseline, retained, released: snapshot(), count: records.length, records };
}
async function measureImages() {
  const tolerant = request.profile === 'tolerant';
  warmImages(tolerant); clearRegexState(); await collect();
  let store = new MemoryImageArtifactStore(); const baseline = snapshot();
  fillImages(store, request.count, tolerant);
  await collect(); const retained = snapshot(); assert.equal(store.size, request.count);
  store = null; clearRegexState(); await collect();
  return { baseline, retained, released: snapshot(), count: request.count,
    metadata: { profile: request.profile, pixelsRetained: false, ignoredChunksPerRecord: tolerant ? 2 : 0,
      uniqueId: true, uniquePath: true, uniqueSha: true, method: 'synthetic valid metadata put; not image decode/index' } };
}
try {
  assert(['text', 'image'].includes(request.kind));
  const row = await (request.kind === 'text' ? measureText() : measureImages());
  const total = item => item.heapUsed + item.external;
  row.retainedDelta = total(row.retained) - total(row.baseline);
  row.releasedDelta = total(row.released) - total(row.baseline);
  row.recoveredBytes = total(row.retained) - total(row.released);
  row.perRecordBytes = row.count ? row.retainedDelta / row.count : null;
  row.perRecordReleasedBytes = row.count ? row.releasedDelta / row.count : null;
  row.runtime = { node: process.version, v8: process.versions.v8, flags: process.execArgv,
    pointerCompression: process.config.variables.v8_enable_pointer_compression ?? null,
    heapSizeLimit: getHeapStatistics().heap_size_limit };
  process.stdout.write(JSON.stringify(row) + '\n');
} catch (error) { console.error(error.stack); process.exitCode = 1; }
