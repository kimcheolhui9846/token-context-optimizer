// 6.4b-6 (N-33) post-hoc noise analysis of committed perf-run1/run2 raw samples (read-only, no new timing).
// Spike = non-warmup sample > 1.3 x that arm's median within the attempt. Reports spike order/arm and gaps,
// and how many spikes each arm of each A/A pair received (p95 at n=30 is the 2nd largest value).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../results/6-4b-6-source-map-impl');
for (const run of ['perf-run1', 'perf-run2']) {
  const result = JSON.parse(readFileSync(join(DIR, `${run}.json`), 'utf8'));
  for (const shape of result.timing.shapes) for (const attempt of shape.attempts) {
    const samples = attempt.samples.filter(s => !s.label.startsWith('warmup/'));
    const byArm = {};
    for (const s of samples) (byArm[s.arm] ??= []).push(s.ms);
    const median = Object.fromEntries(Object.entries(byArm).map(([arm, v]) => [arm, [...v].sort((a, b) => a - b)[Math.ceil(v.length / 2) - 1]]));
    const spikes = samples.filter(s => s.ms > median[s.arm] * 1.3);
    const perBlock = {};
    for (const s of spikes) { const key = `${s.label.split('/')[0]}:${s.arm}`; perBlock[key] = (perBlock[key] ?? 0) + 1; }
    console.log(JSON.stringify({ run, shape: shape.shape, k: shape.k, attempt: attempt.number, status: attempt.status, nonWarmup: samples.length,
      spikes: spikes.length, spikeOrders: spikes.map(s => `${s.order}:${s.arm}`), gaps: spikes.slice(1).map((s, i) => s.order - spikes[i].order),
      spikesPerBlockArm: perBlock, spikeMs: spikes.map(s => +s.ms.toFixed(2)), armMedians: Object.fromEntries(Object.entries(median).map(([a, m]) => [a, +m.toFixed(3)])) }));
  }
}
