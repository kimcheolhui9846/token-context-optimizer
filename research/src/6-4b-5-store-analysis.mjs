import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const input = new URL('research/results/6-4b-5-store-memory.json', root);
const output = new URL('research/results/6-4b-5-store-analysis.json', root);
assert(!existsSync(output), 'refuse overwrite');
const raw = readFileSync(input), data = JSON.parse(raw), rows = data.text.filter(row => row.status === 'completed');
const candidates = [];
for (const k of [72, 110, 128, 160]) for (const fixed of [0, 4096, 32768]) {
  const ratios = rows.map(row => {
    const record = row.observation.records[0], actual = row.observation.perRecordBytes;
    const estimate = 2 * record.byteLength + k * record.lineCount + fixed;
    return { name: row.name, size: row.size, mode: row.mode, repeat: row.repeat, actual, estimate, ratio: actual / estimate,
      selection: row.size >= 1048576 || row.mode === 'batch100' };
  });
  candidates.push({ k, fixed, maximumRawRatio: Math.max(...ratios.map(row => row.ratio)),
    maximumSelectionRatio: Math.max(...ratios.filter(row => row.selection).map(row => row.ratio)),
    underestimated: ratios.filter(row => row.ratio > 1), ratios });
}
const result = {
  schema: '6-4b-5-store-analysis/v1', sourceSha256: createHash('sha256').update(raw).digest('hex'),
  note: 'Post-measurement analysis adds F=32768 because preregistered F=4096 underestimates observed oneEmoji 1MiB. This is a provisional fit, not independent validation or a universal bound. Failed 10MiB oneEmoji remains unresolved; not imputed.',
  candidates, failures: data.text.filter(row => row.status !== 'completed').map(({ name, size, repeat, status }) => ({ name, size, repeat, status })),
  text: data.textSummary, images: data.imageSummary, noiseFloor: data.noiseFloor,
  defaultHeap: data.defaultHeap.map(row => ({ name: row.name, status: row.status, heapSizeLimit: row.observation?.runtime.heapSizeLimit,
    retainedBytes: row.observation?.retainedDelta, maxRSSKiB: row.observation?.retained.maxRSSKiB })),
  mandatorySevenCompleted: data.text.filter(row => ['ascii1','empty','short40','long400','cjk','crlf','single'].includes(row.name)).every(row => row.status === 'completed'),
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(output), candidates: candidates.map(({ k, fixed, maximumRawRatio, maximumSelectionRatio }) => ({ k, fixed, maximumRawRatio, maximumSelectionRatio })), failures: result.failures, images: result.images, defaultHeap: result.defaultHeap }));
