// S-10 exit-code check only: a synthetic stand-in for s10-store-bound-diagnostic-worker.mjs.
// It does not import the product or measure memory. It emits the same JSON shape with
// fabricated, clearly synthetic numbers so the parent's verdict and exit-code branches can
// be exercised without the large D1/D2 runs. Mode comes from env S10_STUB_MODE:
//   pass    - criteria met, harness valid          -> parent exit 0
//   invalid - criteria met, flush residual 100 MiB -> harnessValid=false, exit 1
//   fail    - retained 5 GiB at every step         -> pass=false, exit 1
//   crash   - exits 3 without printing JSON        -> pass=false, exit 1
// Usage: node research/src/s10-store-bound-diagnostic.mjs --output=<new json>
//          --worker=research/src/s10-store-bound-diagnostic-stub-worker.mjs
import { readFileSync } from 'node:fs';

const MiB = 1024 * 1024;
const BUDGET = 256 * MiB;
const mode = process.env.S10_STUB_MODE;
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (mode === 'crash') process.exit(3);

const content = readFileSync(config.files[0], 'utf8');
let lineCount = 0;
for (let i = 0; i < content.length; i += 1) {
  const c = content.charCodeAt(i);
  if (c === 13) { lineCount += 1; if (content.charCodeAt(i + 1) === 10) i += 1; } else if (c === 10) lineCount += 1;
}
const last = content.charCodeAt(content.length - 1);
if (content.length > 0 && last !== 10 && last !== 13) lineCount += 1;
const byteLength = Buffer.byteLength(content, 'utf8');
const weight = 2 * byteLength + 160 * lineCount + 32768;
const maxCount = Math.max(1, Math.floor(BUDGET / weight));
const retainedBytes = mode === 'fail' ? 5 * 1024 * MiB : 100 * MiB;
const steps = config.files.map((_, index) => {
  const count = config.series === 'D1' ? 1 : Math.min(index + 1, maxCount);
  return { step: index + 1, id: `stub_${index}`, byteLength, lineCount, weight, retainedBytes, count, total: count * weight, max: BUDGET, weightSum: count * weight, formulaOk: true, lruOrderOk: true };
});
const out = {
  type: 's10-memory', synthetic: true, stubMode: mode, series: config.series, repeat: config.repeat, steps,
  flush: { count: 1, ids: ['flush'], retainedBytes: mode === 'invalid' ? 100 * MiB : 0 },
  maxRssBytes: 0, status: 'completed',
};
process.stdout.write(JSON.stringify(out) + '\n');
