// S-10 (6.4b-5) required memory diagnostics D1/D2 for the bounded text artifact store.
// Definitions follow docs/agent/handoffs/6-4b-5-store-bound-plan.md ("메모리 진단") and
// the 2026-11-13 S-10 implementation request. Fixed before running; no post-hoc changes.
//
// D1: 10 MiB of empty LF lines, 10 unique IDs indexed sequentially into the default store.
//     Every step: count = 1 and total = singleton weight. M = step-1 retained,
//     S = 256 MiB + max singleton estimate. Steps 2..10 retained must be
//     <= min(S + max(64 MiB, 20% S), M + max(64 MiB, 20% M)).
// D2: 1 MiB CRLF prose ("We all like warm tea.\r\n", the 6.4b-5 'crlf' shape), 100 unique IDs.
//     Every step: total <= 256 MiB, count <= floor(budget / fixture weight),
//     total = sum of entry weights, LRU order = insertion order of the kept IDs, and
//     retained <= S + max(64 MiB, 20% S) with S = 256 MiB + fixture weight.
// Both: 3 fresh hidden child processes each, default heap, --expose-gc, GC x3 after the
// record/response references are dropped and RegExp statics are overwritten.
// OOM / stack overflow / child crash = FAIL (no heap increase, no sample removal).
// Harness self-check (validity, not product verdict): after a budget-sized empty flush
// record evicts everything, residual retained must be <= 32 MiB.
// RSS high-water (maxRSS) is informational only.
//
// Usage: node research/src/s10-store-bound-diagnostic.mjs --output=<new json path>
// Exit code: 0 only when the diagnostic passes and the harness is valid; 1 for a diagnostic
// FAIL, an invalid harness self-check or a crashed/no-JSON child (added after run1/run2,
// which were measured with the earlier parent that always exited 0; criteria unchanged).
// --worker=<path> replaces the child script; it exists only to test the exit-code
// branches with stub children and is recorded in provenance.workerOverride.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
if (!outputArg) throw new Error('--output=<path> is required');
const output = resolve(outputArg.slice('--output='.length));
if (existsSync(output)) throw new Error(`refusing to overwrite ${output}`);

const MiB = 1024 * 1024;
const BUDGET = 256 * MiB;
const REPEATS = 3;
const weightOf = (byteLength, lineCount) => 2 * byteLength + 160 * lineCount + 32768;
const sha = (data) => createHash('sha256').update(data).digest('hex');
const gitBlob = (rel) => spawnSync('git', ['rev-parse', `HEAD:${rel}`], { cwd: repo, encoding: 'utf8', windowsHide: true }).stdout.trim();

const modulePath = join(repo, 'dist', 'src', 'core', 'artifacts.js');
const workerArg = process.argv.find((arg) => arg.startsWith('--worker='));
const workerPath = workerArg ? resolve(workerArg.slice('--worker='.length)) : join(here, 's10-store-bound-diagnostic-worker.mjs');
const provenance = {
  head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8', windowsHide: true }).stdout.trim(),
  statusShort: spawnSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8', windowsHide: true }).stdout,
  sourceWorkingCopySha256: sha(readFileSync(join(repo, 'src', 'core', 'artifacts.ts'))),
  sourceHeadBlob: gitBlob('src/core/artifacts.ts'),
  distArtifactsSha256: sha(readFileSync(modulePath)),
  workerWorkingCopySha256: sha(readFileSync(workerPath)),
  parentWorkingCopySha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  workerOverride: workerArg ? workerPath : null,
  hashNote: 'sha256 values are of working-copy bytes (CRLF on this checkout); HEAD blob ids are git LF blobs',
};

function lineCountOf(content) {
  // Product rule: CR LF, lone CR and lone LF end a line; non-empty trailing text is a line.
  let count = 0;
  for (let i = 0; i < content.length; i += 1) {
    const c = content.charCodeAt(i);
    if (c === 13) { count += 1; if (content.charCodeAt(i + 1) === 10) i += 1; } else if (c === 10) count += 1;
  }
  const last = content.charCodeAt(content.length - 1);
  if (content.length > 0 && last !== 10 && last !== 13) count += 1;
  return count;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 's10-diag-'));
const series = [
  { name: 'D1', unit: '\n', bytes: 10 * MiB, count: 10, query: 'tea' },
  { name: 'D2', unit: 'We all like warm tea.\r\n', bytes: 1 * MiB, count: 100, query: 'tea' },
];
const result = { type: 's10-store-bound-diagnostic', startedAt: new Date().toISOString(), provenance, budget: BUDGET, repeats: REPEATS, series: [] };
try {
  for (const s of series) {
    const content = s.unit.repeat(Math.ceil(s.bytes / s.unit.length)).slice(0, s.bytes);
    const byteLength = Buffer.byteLength(content, 'utf8');
    const lineCount = lineCountOf(content);
    const fixtureWeight = weightOf(byteLength, lineCount);
    const dir = join(fixtureRoot, s.name);
    mkdirSync(dir);
    const files = [];
    for (let i = 0; i < s.count; i += 1) {
      const path = join(dir, `${s.name}-${String(i).padStart(3, '0')}.txt`);
      writeFileSync(path, content, 'utf8');
      files.push(path);
    }
    const S = BUDGET + fixtureWeight;
    const sLimit = S + Math.max(64 * MiB, 0.2 * S);
    const entry = { name: s.name, unit: JSON.stringify(s.unit), byteLength, lineCount, fixtureSha256: sha(content), fixtureWeight, S, sLimit, maxCount: Math.floor(BUDGET / fixtureWeight), children: [] };
    for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
      const configPath = join(fixtureRoot, `${s.name}-${repeat}.json`);
      writeFileSync(configPath, JSON.stringify({ series: s.name, repeat, module: modulePath, fixtureRoot, files, query: s.query }));
      const child = spawnSync(process.execPath, ['--expose-gc', workerPath, configPath], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * MiB });
      const line = (child.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
      let parsed;
      try { parsed = JSON.parse(line); } catch { parsed = { status: 'no_json' }; }
      parsed.exitCode = child.status; parsed.signal = child.signal;
      parsed.stderrTail = (child.stderr || '').slice(-2000);
      entry.children.push(parsed);
    }
    for (const c of entry.children) {
      const checks = [];
      const ok = c.status === 'completed' && c.exitCode === 0 && c.steps.length === s.count;
      checks.push({ name: 'completed', pass: ok });
      if (ok) {
        if (s.name === 'D1') {
          const M = c.steps[0].retainedBytes;
          const limit = Math.min(S + Math.max(64 * MiB, 0.2 * S), M + Math.max(64 * MiB, 0.2 * M));
          c.M = M; c.limit = limit;
          checks.push({ name: 'singleton each step', pass: c.steps.every((x) => x.count === 1 && x.total === fixtureWeight && x.weightSum === x.total && x.weight === fixtureWeight && x.formulaOk && x.lruOrderOk) });
          checks.push({ name: 'steps 2..10 retained <= limit', pass: c.steps.slice(1).every((x) => x.retainedBytes <= limit) });
        } else {
          c.limit = sLimit;
          checks.push({ name: 'total <= budget, count <= maxCount, total = weight sum, LRU order', pass: c.steps.every((x) => x.total <= BUDGET && x.count <= entry.maxCount && x.weightSum === x.total && x.total === x.count * fixtureWeight && x.weight === fixtureWeight && x.formulaOk && x.lruOrderOk) });
          checks.push({ name: 'retained <= S + max(64MiB, 20%S)', pass: c.steps.every((x) => x.retainedBytes <= sLimit) });
        }
        c.harnessSelfCheck = { flushCount: c.flush.count, residualBytes: c.flush.retainedBytes, pass: c.flush.count === 1 && c.flush.retainedBytes <= 32 * MiB };
      }
      c.checks = checks;
      c.pass = checks.every((x) => x.pass);
    }
    entry.pass = entry.children.every((c) => c.pass);
    entry.harnessValid = entry.children.every((c) => c.harnessSelfCheck?.pass === true);
    result.series.push(entry);
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
  result.fixtureRootRemoved = !existsSync(fixtureRoot);
}
result.finishedAt = new Date().toISOString();
result.pass = result.series.every((x) => x.pass);
result.harnessValid = result.series.every((x) => x.harnessValid);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
const fmt = (b) => (b / MiB).toFixed(1);
for (const s of result.series) {
  console.log(`${s.name} weight=${s.fixtureWeight} lines=${s.lineCount} pass=${s.pass} harnessValid=${s.harnessValid}`);
  for (const c of s.children) {
    const r = (c.steps || []).map((x) => fmt(x.retainedBytes));
    console.log(`  child${c.repeat} status=${c.status} exit=${c.exitCode} pass=${c.pass} limit=${c.limit ? fmt(c.limit) : '-'}MiB retained=[${r.length > 12 ? `${r.slice(0, 3).join(',')}..max ${fmt(Math.max(...c.steps.map((x) => x.retainedBytes)))}` : r.join(',')}] flush=${c.flush ? fmt(c.flush.retainedBytes) : '-'} maxRSS=${c.maxRssBytes ? fmt(c.maxRssBytes) : '-'}${c.error ? ` error=${c.error.name}: ${c.error.message}` : ''}`);
  }
}
console.log(`PASS=${result.pass} harnessValid=${result.harnessValid} -> ${output}`);
process.exitCode = result.pass === true && result.harnessValid === true ? 0 : 1;
