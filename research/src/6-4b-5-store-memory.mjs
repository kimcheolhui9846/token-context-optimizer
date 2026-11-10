import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { cpus, freemem, release, tmpdir, totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'e906015a4be6bac2904d4ee83b52ae36ab0f2e59';
const RUNNER = 'research/src/6-4b-5-store-memory.mjs', WORKER = 'research/src/6-4b-5-store-memory-worker.mjs';
const FLAGS = ['--expose-gc', '--max-old-space-size=6144'];
const SIZES = [1024, 1048576, 10485760];
const MIXED = process.argv.includes('--mixed-shapes');
const SHAPES = MIXED ? [
  ['ascii12crlfEmoji', 'abcdefghijkl\r\n'], ['crlfEmoji', 'We all like warm tea.\r\n'], ['ascii12Emoji', 'abcdefghijkl\n'],
] : [
  ['ascii1', 'a\n'], ['empty', '\n'], ['short40', 'We all like warm tea.'.padEnd(39, ' ') + '\n'],
  ['long400', 'Long source line '.padEnd(399, 'x') + '\n'], ['cjk', '한국어と中文の文章です。\n'],
  ['crlf', 'We all like warm tea.\r\n'], ['single', 'a'], ['ascii12', 'abcdefghijkl\n'],
  ['cjk1', '界\n'], ['oneEmoji', '😀'], ['ascii12crlf', 'abcdefghijkl\r\n'],
];
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(readFileSync(file));
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024 }).trim();
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const protectedPaths = ['src', 'tests', 'bin', 'benchmarks', 'scripts', 'skills', 'README.md', 'package.json', 'package-lock.json'];
function fixture(name, seed, size) {
  const bytes = Buffer.from(seed, 'utf8'), out = Buffer.alloc(size, 0x61);
  if (name === 'oneEmoji') bytes.copy(out, size - bytes.length);
  else for (let offset = 0; offset + bytes.length <= size; offset += bytes.length) bytes.copy(out, offset);
  if (MIXED) Buffer.from('😀').copy(out, size - 4);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(out);
  let delimiters = 0;
  for (let i = 0; i < out.length; i++) if (out[i] === 10) delimiters++;
  const lineCount = delimiters + (out.at(-1) === 10 ? 0 : 1);
  return { bytes: out, meta: { name, size, sha256: hash(out), lineCount, utf16Length: text.length } };
}
function checks() {
  assert.equal(process.version, 'v24.18.0'); const metadata = [];
  for (const [name, seed] of SHAPES) for (const size of SIZES) {
    const f = fixture(name, seed, size); assert.equal(f.bytes.length, size);
    const full = Math.floor(size / Buffer.byteLength(seed));
    assert.equal(f.meta.lineCount, MIXED ? f.bytes.toString('utf8').split('\n').length : seed.endsWith('\n') ? full + (size % Buffer.byteLength(seed) ? 1 : 0) : 1);
    if (MIXED) assert.equal(f.bytes.toString().split('😀').length, 2);
    if (name === 'oneEmoji') assert.equal(f.bytes.toString().split('😀').length, 2);
    metadata.push(f.meta);
  }
  assert.equal(median([3, 1, 2]), 2); return metadata;
}
function stop(child) {
  if (child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); }
  catch { child.kill(); }
}
function childRun(request, temp, sequence, flags = FLAGS) {
  const requestFile = join(temp, `request-${sequence}.json`); writeFileSync(requestFile, JSON.stringify(request));
  return new Promise(done => {
    const child = spawn(process.execPath, [...flags, join(ROOT, WORKER), requestFile], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, spawnError = null;
    const timer = setTimeout(() => { timedOut = true; stop(child); }, 180000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
    child.on('error', error => { spawnError = error.code; });
    child.on('close', code => {
      clearTimeout(timer);
      const raw = { status: timedOut ? 'timeout' : spawnError ? 'spawn_error' : code !== 0 ? (/heap out of memory|allocation failed/i.test(stderr) ? 'oom' : 'error') : 'completed', code, spawnError, stderr };
      if (raw.status === 'completed') { try { raw.observation = JSON.parse(stdout); } catch { raw.status = 'invalid_json'; raw.stdout = stdout; } }
      done(raw);
    });
  });
}
function aggregate(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => row.status === 'completed')) {
    const key = `${row.name}/${row.size}/${row.mode}`;
    const group = groups.get(key) || { name: row.name, size: row.size, mode: row.mode, samples: [] };
    group.samples.push(row.observation); groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const values = group.samples.map(row => row.perRecordBytes), records = group.samples[0].records;
    return { name: group.name, size: group.size, mode: group.mode, n: values.length,
      medianBytes: median(values), minBytes: Math.min(...values), maxBytes: Math.max(...values),
      medianReleasedBytes: median(group.samples.map(row => row.perRecordReleasedBytes)),
      maxRSSKiB: Math.max(...group.samples.map(row => row.retained.maxRSSKiB)),
      lineCount: records?.[0].lineCount ?? null, utf16Length: records?.[0].utf16Length ?? null };
  });
}
function formulas(rows) {
  const summaries = [];
  for (const k of [72, 110, 128, 160]) for (const fixed of [0, 4096]) for (const payload of ['bytes', 'utf16']) {
    const ratios = rows.filter(row => row.status === 'completed').map(row => {
      const observation = row.observation, record = observation.records[0];
      const estimate = 2 * (payload === 'bytes' ? record.byteLength : record.utf16Length) + k * record.lineCount + fixed;
      return { name: row.name, size: row.size, mode: row.mode, repeat: row.repeat,
        selection: row.size >= 1048576 || row.mode === 'batch100',
        actual: observation.perRecordBytes, estimate, actualOverEstimate: observation.perRecordBytes / estimate };
    });
    summaries.push({ k, fixed, payload, n: ratios.length, medianRatio: median(ratios.map(row => row.actualOverEstimate)),
      maxPositiveRatio: Math.max(0, ...ratios.map(row => row.actualOverEstimate)),
      selectionMaxRatio: Math.max(0, ...ratios.filter(row => row.selection).map(row => row.actualOverEstimate)),
      unresolved: rows.some(row => row.status !== 'completed'),
      underestimates: ratios.filter(row => row.actualOverEstimate > 1), ratios });
  }
  return summaries;
}
async function main() {
  const fixtures = checks();
  if (process.argv.includes('--check-only')) { console.log(JSON.stringify({ status: 'PASS', measuredChildren: 0, fixtureCells: fixtures.length })); return; }
  const output = resolve(ROOT, process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'research/results/6-4b-5-store-memory.json');
  assert.equal(dirname(output), resolve(ROOT, 'research/results')); assert(/^6-4b-5-[\w-]+\.json$/.test(basename(output)));
  assert(!existsSync(output), 'refuse overwrite'); assert.equal(git(['diff', BASE, '--', ...protectedPaths]), '', 'product changes are prohibited');
  assert.equal(git(['status', '--porcelain', '--', ...protectedPaths]), '', 'protected paths must be clean');
  const manifest = git(['ls-files', '-z']).split('\0').filter(Boolean).map(file => ({ file, sha256: fileHash(join(ROOT, file)) }));
  const temp = mkdtempSync(join(tmpdir(), 'tco-6-4b-5-memory-'));
  const result = { schema: '6-4b-5-store-memory/v3', status: 'incomplete', base: BASE, head: git(['rev-parse', 'HEAD']),
    environment: { node: process.version, v8: process.versions.v8, platform: process.platform, os: release(),
      cpu: [...new Set(cpus().map(cpu => cpu.model))], logicalCPUs: cpus().length, totalMemory: totalmem(), freeMemoryAtStart: freemem(),
      pointerCompression: process.config.variables.v8_enable_pointer_compression ?? null, childFlags: FLAGS },
    protocol: { mixedShapes: MIXED, repeats: 3, gcTurns: 3, childTimeoutMs: 180000, sizes: SIZES, smallBatch: 100, imageBatch: 10000,
      metric: 'heapUsed+external retained delta; arrayBuffers already included; maxRSSKiB is process high-water, not exact indexing heap peak' },
    files: {}, fixtures, text: [], images: [], controls: [], defaultHeap: [], startedAt: new Date().toISOString() };
  const normalize = value => JSON.parse(JSON.stringify(value).replaceAll(temp.replaceAll('\\', '\\\\'), '<temp>').replaceAll(ROOT.replaceAll('\\', '\\\\'), '<repo>'));
  const save = () => { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(normalize(result), null, 2) + '\n'); };
  let sequence = 0;
  try {
    for (const file of [RUNNER, WORKER, 'src/core/artifacts.ts', 'src/core/image-artifacts.ts', 'dist/src/core/artifacts.js', 'dist/src/core/image-artifacts.js', 'package-lock.json']) result.files[file] = fileHash(join(ROOT, file));
    for (const file of readdirSync(join(ROOT, 'dist/src'), { recursive: true, withFileTypes: true })) {
      if (file.isFile()) { const absolute = join(file.parentPath, file.name); result.files[absolute.slice(ROOT.length + 1).replaceAll('\\', '/')] = fileHash(absolute); }
    }
    const warmPath = join(temp, 'warmup.txt'); writeFileSync(warmPath, 'Warm source text.\n'); save();
    for (let repeat = 0; repeat < 3; repeat++) {
      result.controls.push({ repeat, ...await childRun({ kind: 'text', paths: [], warmPath, allowedRoots: [temp] }, temp, sequence++) }); save();
    }
    for (const [name, seed] of SHAPES) for (const size of SIZES) {
      const f = fixture(name, seed, size), path = join(temp, `${name}-${size}.txt`); writeFileSync(path, f.bytes);
      const batch = size === 1024 ? Array.from({ length: 100 }, (_, i) => { const file = join(temp, `${name}-batch-${i}.txt`); writeFileSync(file, f.bytes); return file; }) : null;
      for (const [mode, paths] of [['single', [path]], ...(batch ? [['batch100', batch]] : [])]) for (let repeat = 0; repeat < 3; repeat++) {
        const raw = await childRun({ kind: 'text', paths, warmPath, allowedRoots: [temp] }, temp, sequence++);
        result.text.push({ name, size, mode, repeat, ...raw });
        if (raw.status === 'completed') {
          assert.equal(raw.observation.count, paths.length);
          for (const record of raw.observation.records) {
            assert.equal(record.byteLength, size); assert.equal(record.lineCount, f.meta.lineCount);
            assert.equal(record.utf16Length, f.meta.utf16Length); assert.equal(record.sha256, f.meta.sha256);
          }
        }
        save(); console.log(JSON.stringify({ name, size, mode, repeat, status: raw.status, bytesPerRecord: raw.observation?.perRecordBytes }));
      }
    }
    for (const profile of (MIXED ? [] : ['strict', 'tolerant'])) for (let repeat = 0; repeat < 3; repeat++) {
      const raw = await childRun({ kind: 'image', profile, count: 10000 }, temp, sequence++);
      result.images.push({ name: profile, mode: 'metadata10000', size: 68, repeat, ...raw }); save();
      console.log(JSON.stringify({ profile, repeat, status: raw.status, bytesPerRecord: raw.observation?.perRecordBytes }));
    }
    result.textSummary = aggregate(result.text); result.imageSummary = aggregate(result.images); result.formulas = formulas(result.text);
    for (const name of (MIXED ? [] : ['ascii1', 'empty', 'crlf'])) {
      const raw = await childRun({ kind: 'text', paths: [join(temp, `${name}-10485760.txt`)], warmPath, allowedRoots: [temp] }, temp, sequence++, ['--expose-gc']);
      result.defaultHeap.push({ name, informational: true, ...raw }); save();
      console.log(JSON.stringify({ defaultHeap: name, status: raw.status }));
    }
    result.coverage = { textExpected: SHAPES.length * 12, textCompleted: result.text.filter(row => row.status === 'completed').length, imageExpected: MIXED ? 0 : 6, imageCompleted: result.images.filter(row => row.status === 'completed').length };
    result.noiseFloor = result.controls.map(row => row.observation?.retainedDelta ?? null);
    result.status = [...result.text, ...result.images, ...result.controls].every(row => row.status === 'completed') ? 'complete' : 'complete_with_failures';
  } catch (error) { result.status = 'error'; result.error = error.stack; }
  finally {
    try {
      result.preservation = { trackedFiles: manifest.length, changed: manifest.filter(row => fileHash(join(ROOT, row.file)) !== row.sha256).map(row => row.file) };
      assert.equal(result.preservation.changed.length, 0);
      for (const [file, expected] of Object.entries(result.files)) assert.equal(fileHash(join(ROOT, file)), expected);
    } catch (error) { result.status = 'error'; result.preservationError = error.message; }
    try {
      const actual = realpathSync(temp); assert.equal(dirname(actual).toLowerCase(), realpathSync(tmpdir()).toLowerCase());
      assert(basename(actual).startsWith('tco-6-4b-5-memory-')); rmSync(actual, { recursive: true, force: true }); result.tempCleanup = !existsSync(actual);
    } catch (error) { result.status = 'error'; result.cleanupError = error.message; }
    result.finishedAt = new Date().toISOString(); save();
  }
  console.log(JSON.stringify({ status: result.status, output })); if (result.status !== 'complete') process.exitCode = 1;
}
await main();
