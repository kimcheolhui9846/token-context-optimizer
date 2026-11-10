import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const input = new URL(option('input') || 'research/results/6-4b-5-store-memory.json', root);
const output = new URL(option('output') || 'research/results/6-4b-5-store-analysis.json', root);
assert(output.href.startsWith(new URL('research/results/6-4b-5-', root).href) && /^6-4b-5-[\w-]+\.json$/.test(output.pathname.split('/').at(-1)));
assert(!existsSync(output), 'refuse overwrite');
const raw = readFileSync(input), data = JSON.parse(raw);
const extraPath = option('mixed-input'), extraRaw = extraPath ? readFileSync(new URL(extraPath, root)) : null;
const extra = extraRaw ? JSON.parse(extraRaw) : null;
if (extra) {
  assert.equal(extra.base, data.base);
  for (const key of ['node', 'v8', 'platform', 'pointerCompression', 'childFlags']) assert.deepEqual(extra.environment[key], data.environment[key], key);
  for (const [file, hash] of Object.entries(data.files).filter(([file]) => file.startsWith('dist/') || file.startsWith('src/') || file === 'package-lock.json')) assert.equal(extra.files[file], hash, file);
}
const rows = [...data.text, ...(extra?.text || [])].filter(row => row.status === 'completed');
const candidates = [];
for (const k of [72, 110, 128, 160]) for (const fixed of [0, 4096, 32768]) {
  const ratios = rows.map(row => {
    const record = row.observation.records[0], actual = row.observation.perRecordBytes;
    const estimate = 2 * record.byteLength + k * record.lineCount + fixed;
    return { name: row.name, size: row.size, mode: row.mode, repeat: row.repeat, actual, estimate, ratio: actual / estimate,
      recovered: row.observation.recoveredBytes / row.observation.count,
      recoveredRatio: row.observation.recoveredBytes / row.observation.count / estimate,
      selection: row.size >= 1048576 || row.mode === 'batch100' };
  });
  candidates.push({ k, fixed, maximumRawRatio: Math.max(...ratios.map(row => row.ratio)),
    maximumSelectionRatio: Math.max(...ratios.filter(row => row.selection).map(row => row.ratio)),
    maximumRecoveredRatio: Math.max(...ratios.map(row => row.recoveredRatio)),
    underestimated: ratios.filter(row => row.ratio > 1), ratios });
}
const result = {
  schema: '6-4b-5-store-analysis/v2', sourceSha256: createHash('sha256').update(raw).digest('hex'),
  scriptSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  mixedSourceSha256: extraRaw ? createHash('sha256').update(extraRaw).digest('hex') : null,
  note: 'Post-measurement analysis adds F=32768 because preregistered F=4096 underestimates observed oneEmoji 1MiB. This is a provisional fit, not independent validation or a universal bound. Failed 10MiB oneEmoji remains unresolved; not imputed.',
  candidates, failures: [...data.text, ...(extra?.text || [])].filter(row => row.status !== 'completed').map(({ name, size, repeat, status }) => ({ name, size, repeat, status })),
  text: [...data.textSummary, ...(extra?.textSummary || [])], images: data.imageSummary, noiseFloor: [...data.noiseFloor, ...(extra?.noiseFloor || [])],
  defaultHeap: data.defaultHeap.map(row => ({ name: row.name, status: row.status, heapSizeLimit: row.observation?.runtime.heapSizeLimit,
    retainedBytes: row.observation?.retainedDelta, maxRSSKiB: row.observation?.retained.maxRSSKiB })),
  mandatorySevenCompleted: data.text.filter(row => ['ascii1','empty','short40','long400','cjk','crlf','single'].includes(row.name)).every(row => row.status === 'completed'),
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(output), candidates: candidates.map(({ k, fixed, maximumRawRatio, maximumSelectionRatio }) => ({ k, fixed, maximumRawRatio, maximumSelectionRatio })), failures: result.failures, images: result.images, defaultHeap: result.defaultHeap }));
