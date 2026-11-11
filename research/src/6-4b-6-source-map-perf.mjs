// 6.4b-6 (N-33) preregistered timing (D1) and memory (D2) gates plus D4 informational diagnostics.
// Protocol: docs/agent/handoffs/6-4b-6-source-map-impl-prereg.md. Writes one new JSON file and never
// overwrites. Every child is a fresh hidden process with a hard timeout; spawn/parse failures, missing
// runs, abnormal exits and invalid repeats are explicit FAIL/INVALID states, never an implicit PASS.
// Usage: node research/src/6-4b-6-source-map-perf.mjs --check-only
//        node research/src/6-4b-6-source-map-perf.mjs --prereg=<sha> --output=research/results/6-4b-6-source-map-impl/perf-<name>.json
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'dd334602bbbeb3777fcfe8ea3c40c7e0a682b2ca';
const RUNNER = 'research/src/6-4b-6-source-map-perf.mjs';
const PERF_WORKER = 'research/src/6-4b-6-source-map-perf-worker.mjs';
const MEM_WORKER = 'research/src/6-4b-6-source-map-mem-worker.mjs';
const PROTOCOL = 'docs/agent/handoffs/6-4b-6-source-map-impl-prereg.md';
const RESULTS_DIR = 'research/results/6-4b-6-source-map-impl';
const NPM = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const TAR = 'C:/Windows/System32/tar.exe';
const MIB = 1024 * 1024;
const LIMIT = 10 * MIB;
const SEED = 0x6a4b6;
const P = Object.freeze({
  warmups: 5, cycles: 15, samplesPerArm: 30, minSampleMs: 5, maxK: 1024, maxAttempts: 3, cooldownMs: 30000,
  timingChildTimeoutMs: 600000, memoryChildTimeoutMs: 300000, memoryRepeats: 3,
  r1DiagnosticTimeoutMs: 120000, largeDiagnosticTimeoutMs: 300000,
});
const EMOJI = String.fromCodePoint(0x1f600);

// ---------- fixtures (deterministic; expectations are counted from construction, not from BASE) ----------
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const bytesOf = text => Buffer.byteLength(text, 'utf8');
function s2Line() { // 65,535 bytes of mixed-script text, then LF
  const unit = '\uD55C\uAE00 \u4E2D\u6587 \u00E9 ' + EMOJI + ' ';
  assert.equal(bytesOf(unit), 22);
  const count = Math.floor(65535 / 22);
  return unit.repeat(count) + 'x'.repeat(65535 - count * 22) + '\n';
}
function s5Text() { // sentences with CRLF/LF/CR cycling, padded to exactly 1 MiB without a trailing delimiter
  const delimiters = ['\r\n', '\n', '\r'];
  let parts = [], used = 0, lines = 0;
  for (let i = 0; ; i++) {
    const piece = `Line ${i}: mixed delimiters keep byte offsets exact.` + delimiters[i % 3];
    if (used + bytesOf(piece) + 1 > MIB) break;
    parts.push(piece); used += bytesOf(piece); lines++;
  }
  parts.push('x'.repeat(MIB - used));
  return { text: parts.join(''), lineCount: lines + 1 };
}
const SENTENCES = [
  'The archive keeps ordinary notes for the planning group.',
  'Reviewers compare every excerpt with its original source line.',
  'Byte offsets must stay exact for each preserved line.',
  'A short sentence follows a longer one in this generated file.',
  'Indexing should not depend on how lines are distributed.',
];
function s6Files() { // 512 files of exactly 2,048 bytes: LF-separated sentences, last line padded, no trailing LF
  const next = mulberry32(SEED);
  const files = [];
  for (let f = 0; f < 512; f++) {
    let text = '', lines = 0;
    for (;;) {
      const sentence = SENTENCES[Math.floor(next() * SENTENCES.length)] + '\n';
      if (bytesOf(text) + bytesOf(sentence) + 1 > 2048) break;
      text += sentence; lines++;
    }
    text += 'y'.repeat(2048 - bytesOf(text));
    files.push({ name: `s6-${String(f).padStart(3, '0')}.txt`, text, lineCount: lines + 1 });
  }
  return files;
}
function shapes() {
  const s5 = s5Text();
  return {
    S1: [{ name: 's1.txt', text: 'abcdefghijklmnopqrstuvwxyz0123456789 '.repeat(Math.ceil(MIB / 37)).slice(0, MIB), lineCount: 1 }],
    S2: [{ name: 's2.txt', text: s2Line().repeat(16), lineCount: 16 }],
    S3: [{ name: 's3.txt', text: 'a\n'.repeat(MIB / 2), lineCount: MIB / 2 }],
    S4: [{ name: 's4.txt', text: '\n'.repeat(MIB), lineCount: MIB }],
    S5: [{ name: 's5.txt', text: s5.text, lineCount: s5.lineCount }],
    S6: s6Files(),
  };
}
const MEMORY_SHAPES = ['S1', 'S3', 'S4', 'S5', 'M10'];
function memoryFixtures(all) {
  return { S1: all.S1[0], S3: all.S3[0], S4: all.S4[0], S5: all.S5[0], M10: { name: 'm10.txt', text: 'a'.repeat(LIMIT), lineCount: 1 } };
}
function diagnosticFixtures() {
  return {
    R1: { name: 'r1.txt', text: 'a'.repeat(LIMIT - 4) + EMOJI, lineCount: 1 },
    BLANK10: { name: 'blank10.txt', text: '\n'.repeat(LIMIT), lineCount: LIMIT },
    ALF10: { name: 'alf10.txt', text: 'a\n'.repeat(LIMIT / 2), lineCount: LIMIT / 2 },
  };
}

// ---------- statistics and gates ----------
const nearest = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
function stats(values, n = P.samplesPerArm) {
  assert.equal(values.length, n, `expected ${n} samples, got ${values.length}`);
  assert(values.every(value => Number.isFinite(value) && value >= 0), 'non-finite sample');
  return { n: values.length, median: nearest(values, 0.5), p95: nearest(values, 0.95) };
}
// A/A: reference = first copy (B1 or C1); ratio = second / reference.
function aaValid(reference, second) {
  const ratio = second.median / reference.median;
  const medianOk = (ratio >= 0.95 && ratio <= 1.05) || Math.abs(second.median - reference.median) <= 0.1;
  const p95Ok = Math.abs(second.p95 - reference.p95) <= Math.max(0.2, reference.p95 * 0.2);
  return { ratio, medianDelta: second.median - reference.median, p95Delta: second.p95 - reference.p95, medianOk, p95Ok, valid: medianOk && p95Ok };
}
// D1 G-T, on K-call batch sample times.
function timeGate(base, candidate) {
  const medianLimit = Math.max(base.median * 1.10, base.median + 0.5);
  const p95Limit = Math.max(base.p95 * 1.20, base.p95 + 1);
  return { medianLimit, p95Limit, medianOk: candidate.median <= medianLimit, p95Ok: candidate.p95 <= p95Limit, pass: candidate.median <= medianLimit && candidate.p95 <= p95Limit };
}
// D2 on medians of 3 fresh children per arm.
function memoryGate(base, candidate) {
  const measurable = [base.R, base.P, candidate.R, candidate.P].every(Number.isFinite) && base.P > 0 && candidate.P > 0;
  const rLimit = base.R + Math.max(MIB, base.R * 0.02);
  const pLimit = base.P * 1.10 + 32 * MIB;
  if (!measurable) return { rLimit, pLimit, status: 'unmeasurable', pass: false };
  const pass = candidate.R <= rLimit && candidate.P <= pLimit;
  return { rLimit, pLimit, rOk: candidate.R <= rLimit, pOk: candidate.P <= pLimit, status: pass ? 'pass' : 'failed_gate', pass };
}
function checks() {
  const constant = value => stats(Array(30).fill(value));
  const ramp = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(nearest(ramp, 0.5), 15); assert.equal(nearest(ramp, 0.95), 29);
  assert.throws(() => stats(Array(29).fill(1)));
  assert.throws(() => stats([...Array(29).fill(1), NaN]));
  assert(aaValid({ median: 10, p95: 10 }, { median: 10.5, p95: 12 }).valid);
  assert(!aaValid({ median: 10, p95: 10 }, { median: 10.51, p95: 10 }).valid);
  assert(!aaValid({ median: 10, p95: 10 }, { median: 10, p95: 12.001 }).valid);
  assert(aaValid({ median: 1, p95: 1 }, { median: 1.09, p95: 1.19 }).valid); assert(!aaValid({ median: 1, p95: 1 }, { median: 1.11, p95: 1 }).valid);
  assert(timeGate(constant(10), constant(11)).pass); assert(!timeGate(constant(10), { median: 11.001, p95: 10 }).pass);
  assert(timeGate({ median: 2, p95: 2 }, { median: 2.5, p95: 3 }).pass); assert(!timeGate({ median: 2, p95: 2 }, { median: 2, p95: 3.001 }).pass);
  assert(timeGate({ median: 100, p95: 100 }, { median: 110, p95: 120 }).pass); assert(!timeGate({ median: 100, p95: 100 }, { median: 100, p95: 120.001 }).pass);
  assert(memoryGate({ R: 10 * MIB, P: 100 * MIB }, { R: 11 * MIB, P: 142 * MIB }).pass);
  assert(!memoryGate({ R: 10 * MIB, P: 100 * MIB }, { R: 11 * MIB + 1, P: 100 * MIB }).pass);
  assert(memoryGate({ R: 100 * MIB, P: 100 * MIB }, { R: 102 * MIB, P: 100 * MIB }).pass);
  assert(!memoryGate({ R: 10 * MIB, P: 100 * MIB }, { R: 10 * MIB, P: 142 * MIB + 1 }).pass);
  assert.equal(memoryGate({ R: 1, P: 0 }, { R: 1, P: 0 }).status, 'unmeasurable');
  const all = shapes();
  for (const [name, files] of Object.entries(all)) {
    const total = files.reduce((sum, file) => sum + bytesOf(file.text), 0);
    assert.equal(total, MIB, `${name} must be exactly 1 MiB`);
    for (const file of files) assert.equal(file.text.split(/\r\n|\r|\n/).filter((t, i, a) => t.length > 0 || i < a.length - 1).length, file.lineCount, `${file.name} line count`);
  }
  assert.equal(all.S6.length, 512); assert(all.S6.every(file => bytesOf(file.text) === 2048));
  for (const file of Object.values(diagnosticFixtures())) assert.equal(bytesOf(file.text), LIMIT);
  assert.equal(bytesOf(memoryFixtures(all).M10.text), LIMIT);
  for (const file of [PERF_WORKER, MEM_WORKER, PROTOCOL]) assert(existsSync(join(ROOT, file)), `${file} missing`);
  assert(existsSync(NPM) && existsSync(TAR));
}

// ---------- process helpers ----------
const digest = data => createHash('sha256').update(data).digest('hex');
const hashFile = file => digest(readFileSync(file));
const command = (exe, args, cwd = ROOT) => execFileSync(exe, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * MIB });
const git = args => command('git', args).trim();
const sleep = ms => new Promise(done => setTimeout(done, ms));
function kill(child) {
  if (child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); } catch { child.kill(); }
}
// Runs one fresh hidden child. Resolves to {status, exitCode, signal, stderrTail, message?, payload?}.
// status: completed | timeout | spawn_error | abnormal_exit | parse_error | child_error | output_mismatch
function runChild(args, timeoutMs) {
  return new Promise(done => {
    let child;
    try { child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { done({ status: 'spawn_error', message: String(error.message) }); return; }
    let stdout = '', stderr = '', timedOut = false, settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); done(value); } };
    const timer = setTimeout(() => { timedOut = true; kill(child); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    child.on('error', error => finish({ status: 'spawn_error', message: String(error.message) }));
    child.on('close', (exitCode, signal) => {
      const base = { exitCode, signal, stderrTail: stderr || undefined };
      if (timedOut) return finish({ ...base, status: 'timeout' });
      const lines = stdout.split('\n').filter(line => line.trim());
      if (exitCode !== 0) return finish({ ...base, status: /heap out of memory|allocation failed/i.test(stderr) ? 'oom' : 'abnormal_exit', stdoutTail: stdout.slice(-2000) });
      if (lines.length !== 1) return finish({ ...base, status: 'parse_error', message: `expected 1 JSON line, got ${lines.length}` });
      let payload;
      try { payload = JSON.parse(lines[0]); } catch (error) { return finish({ ...base, status: 'parse_error', message: String(error.message) }); }
      if (payload.status !== 'completed') return finish({ ...base, status: payload.status === 'output_mismatch' ? 'output_mismatch' : 'child_error', payload });
      finish({ ...base, status: 'completed', payload });
    });
  });
}
function environment() {
  const cpu = cpus();
  return { node: process.version, v8: process.versions.v8, platform: process.platform, os: release(), arch: process.arch,
    cpuModels: [...new Set(cpu.map(item => item.model))], logicalCPUs: cpu.length, totalMemBytes: totalmem(),
    powerScheme: command('powercfg', ['/GETACTIVESCHEME']).trim() };
}
async function npm(args, cwd, log) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [NPM, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } });
    let output = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; kill(child); }, 600000);
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); writeFileSync(log, output); code === 0 && !timedOut ? done() : reject(new Error(`npm ${args.join(' ')} failed (${code}, timeout=${timedOut})`)); });
  });
}

// ---------- main ----------
async function main() {
  checks();
  if (process.argv.includes('--check-only')) { console.log(JSON.stringify({ status: 'PASS', timedCalls: 0, checks: 'statistics, gates, fixtures' })); return; }
  assert.equal(process.platform, 'win32', 'validated platform is Windows');
  assert.equal(process.version, 'v24.18.0');
  const outputArg = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  assert(outputArg, '--output is required');
  const OUTPUT = resolve(ROOT, outputArg);
  assert.equal(dirname(OUTPUT), join(ROOT, RESULTS_DIR)); assert(/^perf-[a-z0-9-]+\.json$/.test(basename(OUTPUT)));
  assert(!existsSync(OUTPUT), 'refusing to overwrite previous evidence');
  assert.equal(git(['status', '--porcelain']), '', 'commit preregistration and implementation before measurement');
  const head = git(['rev-parse', 'HEAD']);
  const preregArg = process.argv.find(arg => arg.startsWith('--prereg='))?.slice(9);
  assert(preregArg, '--prereg=<committed-sha> is required');
  const prereg = git(['rev-parse', preregArg]);
  git(['merge-base', '--is-ancestor', prereg, head]);
  git(['diff', '--exit-code', prereg, head, '--', RUNNER, PERF_WORKER, MEM_WORKER, PROTOCOL, 'src']);
  assert.equal(prereg, git(['log', '-1', '--format=%H', head, '--', RUNNER, PERF_WORKER, MEM_WORKER, PROTOCOL]));
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const before = tracked.map(file => ({ file, hash: hashFile(join(ROOT, file)) }));
  const temp = mkdtempSync(join(tmpdir(), 'tco-6-4b-6-perf-'));
  const fixtureRoot = join(temp, 'fixtures'); mkdirSync(fixtureRoot);
  const logs = join(temp, 'logs'); mkdirSync(logs);
  const result = { schema: 'source-map-perf/v1', status: 'incomplete', startedAt: new Date().toISOString(), preregistrationCommit: prereg, measurementHead: head, base: BASE,
    protocol: P, seed: SEED, files: Object.fromEntries([RUNNER, PERF_WORKER, MEM_WORKER, PROTOCOL, 'src/core/artifacts.ts', 'package-lock.json'].map(file => [file, { blobSha1: git(['rev-parse', `HEAD:${file}`]), workingCopySha256: hashFile(join(ROOT, file)) }])),
    environment: environment(), snapshots: {}, fixtures: {}, timing: { shapes: [] }, memory: { runs: [], shapes: [] }, informational: [] };
  const normalized = value => JSON.parse(JSON.stringify(value).replaceAll(temp.replaceAll('\\', '\\\\'), '<temp>').replaceAll(ROOT.replaceAll('\\', '\\\\'), '<repo>'));
  const save = () => writeFileSync(OUTPUT, JSON.stringify(normalized(result), null, 2) + '\n');
  let failure;
  const stop = (status, message) => Object.assign(new Error(message), { status });
  try {
    // Snapshots: BASE and HEAD from git archive, npm ci + tsc only; A/A copies are byte copies of dist.
    const modules = {};
    for (const [variant, ref] of [['base', BASE], ['candidate', head]]) {
      const snapshot = join(temp, variant); mkdirSync(snapshot);
      const archive = join(temp, `${variant}.tar`);
      command('git', ['archive', '--format=tar', ref, '-o', archive]);
      command(TAR, ['-xf', archive, '-C', snapshot]);
      await npm(['ci', '--ignore-scripts'], snapshot, join(logs, `${variant}-ci.log`));
      command(process.execPath, [join(snapshot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], snapshot);
      cpSync(join(snapshot, 'dist'), join(snapshot, 'dist-aa'), { recursive: true });
      const core = dir => Object.fromEntries(readdirSync(join(snapshot, dir, 'src/core')).filter(f => f.endsWith('.js')).sort().map(f => [f, hashFile(join(snapshot, dir, 'src/core', f))]));
      const dist = core('dist'), copy = core('dist-aa');
      assert.deepEqual(copy, dist, 'A/A copy differs');
      result.snapshots[variant] = { ref, sourceBlobSha1: git(['rev-parse', `${ref}:src/core/artifacts.ts`]), lockfileSha256: hashFile(join(snapshot, 'package-lock.json')), distCoreSha256: dist };
      modules[variant] = [join(snapshot, 'dist/src/core/artifacts.js'), join(snapshot, 'dist-aa/src/core/artifacts.js')];
    }
    assert.equal(result.snapshots.base.lockfileSha256, result.snapshots.candidate.lockfileSha256);
    for (const file of Object.keys(result.snapshots.base.distCoreSha256)) {
      if (file === 'artifacts.js') assert.notEqual(result.snapshots.base.distCoreSha256[file], result.snapshots.candidate.distCoreSha256[file]);
      else assert.equal(result.snapshots.base.distCoreSha256[file], result.snapshots.candidate.distCoreSha256[file], `${file} differs between arms`);
    }
    const ARM_MODULES = { B1: modules.base[0], B2: modules.base[1], C1: modules.candidate[0], C2: modules.candidate[1] };
    const writeFixture = file => {
      const path = join(fixtureRoot, file.name); const bytes = Buffer.from(file.text, 'utf8');
      writeFileSync(path, bytes, { flag: 'wx' });
      return { path, name: file.name, lineCount: file.lineCount, byteLength: bytes.length, sha256: digest(bytes) };
    };
    const all = shapes();
    const timingFiles = Object.fromEntries(Object.entries(all).map(([name, files]) => [name, files.map(writeFixture)]));
    const mem = memoryFixtures(all);
    const memoryFiles = Object.fromEntries(MEMORY_SHAPES.map(name => [name, name === 'M10' ? writeFixture(mem.M10) : timingFiles[name][0]]));
    const diagnosticFiles = Object.fromEntries(Object.entries(diagnosticFixtures()).map(([name, file]) => [name, writeFixture(file)]));
    const fixtureSummary = files => ({ files: files.length, bytes: files.reduce((s, f) => s + f.byteLength, 0), lines: files.reduce((s, f) => s + f.lineCount, 0), sha256: digest(files.map(f => f.sha256).join(',')) });
    result.fixtures = { timing: Object.fromEntries(Object.entries(timingFiles).map(([n, f]) => [n, fixtureSummary(f)])), memory: { M10: fixtureSummary([memoryFiles.M10]) }, diagnostic: Object.fromEntries(Object.entries(diagnosticFiles).map(([n, f]) => [n, fixtureSummary([f])])) };
    save();
    let configCounter = 0;
    const writeConfig = config => { const path = join(temp, `config-${configCounter++}.json`); writeFileSync(path, JSON.stringify(config)); return path; };

    // ---- D1 timing gates, S1..S6 in order ----
    for (const [shape, files] of Object.entries(timingFiles)) {
      const entry = { shape, attempts: [], status: 'incomplete' }; result.timing.shapes.push(entry);
      const calibration = await runChild([join(ROOT, PERF_WORKER), writeConfig({ op: 'calibrate', modules: { B1: ARM_MODULES.B1 }, files, fixtureRoot, minSampleMs: P.minSampleMs, maxK: P.maxK })], P.timingChildTimeoutMs);
      entry.calibration = calibration;
      if (calibration.status !== 'completed') {
        // BASE failing on its own shape removes that shape from timing comparison (correctness only).
        entry.status = calibration.status === 'child_error' ? 'base_failed_excluded' : `invalid_${calibration.status}`; save();
        if (entry.status === 'base_failed_excluded') continue;
        throw stop('invalid', `${shape} calibration ${calibration.status}`);
      }
      entry.k = calibration.payload.k; save();
      for (let number = 1; number <= P.maxAttempts; number++) {
        const run = await runChild([join(ROOT, PERF_WORKER), writeConfig({ op: 'attempt', modules: ARM_MODULES, files, fixtureRoot, k: entry.k, warmups: P.warmups, cycles: P.cycles })], P.timingChildTimeoutMs);
        const attempt = { number, child: { status: run.status, exitCode: run.exitCode, signal: run.signal, stderrTail: run.stderrTail, message: run.message, error: run.payload?.error }, samples: run.payload?.samples ?? [], digests: run.payload?.digests };
        entry.attempts.push(attempt);
        if (run.status !== 'completed') { attempt.status = `invalid_${run.status}`; entry.status = attempt.status; save(); throw stop('invalid', `${shape} attempt ${number}: ${run.status}`); }
        const digests = Object.values(run.payload.digests).map(list => list.join(','));
        if (new Set(digests).size !== 1) { attempt.status = 'output_mismatch'; entry.status = 'failed_correctness'; save(); throw stop('failed_correctness', `${shape}: source map differs between arms`); }
        const values = (block, arm) => attempt.samples.filter(s => s.label.startsWith(`${block}/`) && s.arm === arm).map(s => s.ms);
        try {
          attempt.stats = {
            aaBase: { B1: stats(values('AA-base', 'B1')), B2: stats(values('AA-base', 'B2')) },
            aaCandidate: { C1: stats(values('AA-candidate', 'C1')), C2: stats(values('AA-candidate', 'C2')) },
            comparison: { B1: stats(values('comparison', 'B1')), C1: stats(values('comparison', 'C1')) },
          };
          assert.equal(attempt.samples.filter(s => s.label.startsWith('warmup/')).length, 4 * P.warmups);
        } catch (error) { attempt.status = 'invalid_missing_samples'; entry.status = attempt.status; save(); throw stop('invalid', `${shape}: ${error.message}`); }
        attempt.aa = { base: aaValid(attempt.stats.aaBase.B1, attempt.stats.aaBase.B2), candidate: aaValid(attempt.stats.aaCandidate.C1, attempt.stats.aaCandidate.C2) };
        if (!attempt.aa.base.valid || !attempt.aa.candidate.valid) {
          attempt.status = 'invalid_aa'; save();
          console.log(`${shape} attempt ${number}: invalid A/A`);
          if (number === P.maxAttempts) { entry.status = 'invalid'; save(); throw stop('invalid', `${shape}: third invalid A/A attempt`); }
          await sleep(P.cooldownMs); continue;
        }
        attempt.gate = timeGate(attempt.stats.comparison.B1, attempt.stats.comparison.C1);
        attempt.status = 'valid'; entry.selectedAttempt = number;
        entry.status = attempt.gate.pass ? 'pass' : 'failed_gate'; save();
        console.log(JSON.stringify({ shape, k: entry.k, attempt: number, status: entry.status, base: attempt.stats.comparison.B1, candidate: attempt.stats.comparison.C1 }));
        if (!attempt.gate.pass) throw stop('failed_gate', `${shape}: valid timing gate failed; no retry`);
        break;
      }
    }
    const timed = result.timing.shapes.filter(row => row.status !== 'base_failed_excluded');
    result.timing.status = timed.length > 0 && timed.every(row => row.status === 'pass') ? 'pass' : 'not_passed';
    if (result.timing.status !== 'pass') throw stop('invalid', 'no passing timing shapes');

    // ---- D2 memory gates: one fresh child at a time, arm order alternates by repeat ----
    const memChild = (arm, file, timeoutMs) => runChild(['--expose-gc', join(ROOT, MEM_WORKER), writeConfig({ module: ARM_MODULES[arm], file, fixtureRoot })], timeoutMs);
    for (let repeat = 0; repeat < P.memoryRepeats; repeat++) {
      for (const shape of MEMORY_SHAPES) {
        for (const arm of repeat % 2 === 0 ? ['B1', 'C1'] : ['C1', 'B1']) {
          const run = await memChild(arm, memoryFiles[shape], P.memoryChildTimeoutMs);
          result.memory.runs.push({ order: result.memory.runs.length, repeat, shape, arm, status: run.status, exitCode: run.exitCode, signal: run.signal, stderrTail: run.stderrTail, message: run.message, ...(run.payload ?? {}) });
          save();
        }
      }
    }
    for (const shape of MEMORY_SHAPES) {
      const pick = arm => result.memory.runs.filter(row => row.shape === shape && row.arm === arm);
      const row = { shape };
      const rowsB = pick('B1'), rowsC = pick('C1');
      const complete = rows => rows.length === P.memoryRepeats && rows.every(r => r.status === 'completed');
      if (!complete(rowsB) || !complete(rowsC)) { row.status = 'invalid_runs'; row.pass = false; result.memory.shapes.push(row); continue; }
      const digests = new Set([...rowsB, ...rowsC].map(r => r.sourceMapDigest));
      if (digests.size !== 1) { row.status = 'failed_correctness'; row.pass = false; result.memory.shapes.push(row); continue; }
      const median3 = values => nearest(values, 0.5);
      row.base = { R: median3(rowsB.map(r => r.retainedBytes)), P: median3(rowsB.map(r => r.maxRssBytes)) };
      row.candidate = { R: median3(rowsC.map(r => r.retainedBytes)), P: median3(rowsC.map(r => r.maxRssBytes)) };
      Object.assign(row, memoryGate(row.base, row.candidate));
      result.memory.shapes.push(row);
    }
    result.memory.status = result.memory.shapes.length === MEMORY_SHAPES.length && result.memory.shapes.every(row => row.pass) ? 'pass' : 'not_passed';
    save();
    if (result.memory.status !== 'pass') {
      const has = status => result.memory.shapes.some(row => row.status === status);
      throw stop(has('failed_correctness') ? 'failed_correctness' : has('failed_gate') ? 'failed_gate' : 'invalid', 'memory gate not passed');
    }
    result.mandatory = 'pass';

    // ---- D4 / plan informational diagnostics: single child at a time, never gate-bearing ----
    const plan = [
      ['R1', 'C1', P.r1DiagnosticTimeoutMs],
      ['BLANK10', 'C1', P.largeDiagnosticTimeoutMs], ['BLANK10', 'B1', P.largeDiagnosticTimeoutMs],
      ['ALF10', 'C1', P.largeDiagnosticTimeoutMs], ['ALF10', 'B1', P.largeDiagnosticTimeoutMs],
    ];
    for (const [name, arm, timeoutMs] of plan) {
      const run = await memChild(arm, diagnosticFiles[name], timeoutMs);
      result.informational.push({ name, arm, timeoutMs, status: run.status, exitCode: run.exitCode, signal: run.signal, stderrTail: run.stderrTail, message: run.message, ...(run.payload ?? {}) });
      save();
    }
    result.status = 'pass';
  } catch (error) {
    failure = error; result.status = error.status || 'error'; result.error = String(error.message);
    result.mandatory ??= 'not_passed';
  } finally {
    const finalize = action => { try { action(); } catch (error) {
      failure ||= error; if (['pass', 'incomplete'].includes(result.status)) result.status = 'error';
      (result.finalizationErrors ??= []).push(String(error.message));
    } };
    finalize(() => { result.finalEnvironment = environment(); assert.deepEqual(result.finalEnvironment, result.environment); });
    finalize(() => {
      const changed = before.filter(row => !existsSync(join(ROOT, row.file)) || hashFile(join(ROOT, row.file)) !== row.hash);
      result.preservation = { trackedFiles: before.length, changed: changed.map(row => row.file) }; assert.equal(changed.length, 0);
    });
    finalize(() => {
      const actual = realpathSync(temp);
      assert.equal(dirname(actual).toLowerCase(), realpathSync(tmpdir()).toLowerCase()); assert(basename(actual).startsWith('tco-6-4b-6-perf-'));
      rmSync(actual, { recursive: true, force: true }); result.tempCleanup = !existsSync(actual);
    });
    result.finishedAt = new Date().toISOString(); save();
  }
  console.log(JSON.stringify({ status: result.status, mandatory: result.mandatory, output: OUTPUT }));
  if (failure) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
