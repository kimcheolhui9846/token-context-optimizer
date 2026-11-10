import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, release, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'c8580e91c0c1e077453290c7080e0dc671e519d7';
const RUNNER = 'research/src/6-4b-4-summarizer-perf.mjs';
const WORKER = 'research/src/6-4b-4-summarizer-perf-worker.mjs';
const PROTOCOL = 'docs/agent/handoffs/6-4b-4-summarizer-perf-prereg.md';
const OUTPUT = resolve(ROOT, process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'research/results/6-4b-4-summarizer-perf.json');
const NPM = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const TAR = 'C:/Windows/System32/tar.exe';
const TIMEOUT = 15000;
const SEED = 'Token efficiency depends on measured task success and careful source preservation.';
const TEXTS = {
  blank: SEED + '\n' + Array(100001).fill('').join('\n'),
  prose: Array(100000).fill('We all like warm tea.').join('\n'),
  late: [
    'The archive stores ordinary notes for the planning group.',
    'Members review the notes during a quiet morning meeting.',
    'The team records decisions in a shared paper journal.',
    'Everyone can suggest a correction before the meeting ends.',
    'The coordinator reads the older entries aloud to the group.',
    'Participants discuss the wording and agree on a clear version.',
    'The required observation is that the blue lantern remains beside the window.',
    'The group leaves the room after the conversation is complete.',
  ].join('\n'),
  single: SEED,
};
const CASES = [
  { name: 'blank', budget: 2000, gate: 'G1' }, { name: 'prose', budget: 2000, gate: 'G1' },
  { name: 'blank', budget: 50000, gate: 'G2' }, { name: 'prose', budget: 50000, gate: 'G2' },
  { name: 'late', budget: 88, gate: 'G3' }, { name: 'single', budget: 120, gate: 'G3' },
];
const digest = data => createHash('sha256').update(data).digest('hex');
const hash = file => digest(readFileSync(file));
const command = (exe, args, cwd = ROOT) => execFileSync(exe, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
const git = args => command('git', args).trim();
const sleep = ms => new Promise(done => setTimeout(done, ms));
const nearest = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
function stats(values) {
  assert.equal(values.length, 30);
  assert(values.every(value => Number.isFinite(value) && value >= 0));
  return { n: values.length, median: nearest(values, .5), p95: nearest(values, .95) };
}
function aa(first, second) {
  const ratio = second.median / first.median;
  return ((ratio >= .9 && ratio <= 1.1) || Math.abs(second.median - first.median) <= .1)
    && Math.abs(second.p95 - first.p95) <= Math.max(.2, .2 * first.p95);
}
function gate(kind, base, optimized) {
  const floor = kind === 'G1' ? 25 : kind === 'G2' ? 100 : .1;
  const ratio = kind === 'G2' ? .2 : .1;
  const medianLimit = Math.max(floor, ratio * base.median);
  const p95Limit = Math.max(floor, ratio * base.p95);
  const medianDelta = optimized.median - base.median, p95Delta = optimized.p95 - base.p95;
  return { kind, medianDelta, p95Delta, medianLimit, p95Limit, pass: (kind === 'G2' || medianDelta <= medianLimit) && p95Delta <= p95Limit };
}
function checks() {
  const constant = value => stats(Array(30).fill(value));
  assert.equal(nearest(Array.from({ length: 30 }, (_, i) => i + 1), .5), 15);
  assert.equal(nearest(Array.from({ length: 30 }, (_, i) => i + 1), .95), 29);
  assert(aa(constant(0), constant(.1))); assert(!aa(constant(10), constant(12)));
  assert(aa({ median: 10, p95: 10 }, { median: 11, p95: 12 }));
  assert(!aa({ median: 10, p95: 10 }, { median: 11, p95: 12.001 }));
  for (const [kind, threshold] of [['G1', 25], ['G2', 100], ['G3', 10]]) {
    assert(gate(kind, constant(100), constant(100 + threshold)).pass);
    assert(!gate(kind, constant(100), constant(100 + threshold + .001)).pass);
  }
  assert(gate('G2', { median: 100, p95: 100 }, { median: 1000, p95: 200 }).pass);
  assert(!gate('G1', { median: 100, p95: 100 }, { median: 100, p95: 126 }).pass);
  assert(!gate('G3', { median: 1, p95: 100 }, { median: 1, p95: 111 }).pass);
  assert.equal(TEXTS.blank.split('\n').length, 100002);
  assert.equal(TEXTS.prose.split('\n').length, 100000);
  const coreTests = readFileSync(join(ROOT, 'tests/core.test.ts'), 'utf8');
  const lateTest = coreTests.slice(coreTests.indexOf('it("preserves late required prose'));
  const linesBlock = lateTest.match(/const lines = \[([\s\S]*?)\n    \];/);
  assert(linesBlock, 'late acceptance fixture not found');
  const testLines = [...linesBlock[1].matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0]));
  assert.equal(digest(testLines.join('\n')), digest(TEXTS.late), 'perf/test late fixture drift');
  assert(existsSync(join(ROOT, WORKER)) && existsSync(NPM) && existsSync(TAR));
}
function environment() {
  const cpu = cpus();
  const powerDetails = JSON.parse(command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$p = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes'; $b = @(Get-CimInstance -ClassName Win32_Battery -ErrorAction Stop); [ordered]@{ activeScheme=$p.ActivePowerScheme; overlayAC=$p.ActiveOverlayAcPowerScheme; overlayDC=$p.ActiveOverlayDcPowerScheme; batteryStatus=@($b | ForEach-Object { $_.BatteryStatus }) } | ConvertTo-Json -Compress"]));
  return { node: process.version, platform: process.platform, os: release(), arch: process.arch,
    cpuModels: [...new Set(cpu.map(item => item.model))], logicalCPUs: cpu.length,
    powerScheme: command('powercfg', ['/GETACTIVESCHEME']).trim(), powerDetails };
}
function kill(child) {
  if (child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); }
  catch { child.kill(); }
}
async function npm(args, cwd, log) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [NPM, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } });
    let output = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; kill(child); }, 600000);
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); writeFileSync(log, output); if (code === 0 && !timedOut) done(); else reject(new Error(`npm ${args.join(' ')} failed (${code}, timeout=${timedOut})`)); });
  });
}

// One persistent process/store per variant; the parent allows only one active call.
class Worker {
  constructor(snapshot, fixtureRoot) {
    this.pending = null; this.sequence = 0; this.buffer = ''; this.stderr = ''; this.dead = false;
    this.child = spawn(process.execPath, ['--max-old-space-size=512', join(ROOT, WORKER), snapshot, fixtureRoot], { cwd: ROOT, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8'); this.child.stderr.setEncoding('utf8');
    this.ready = this.wait('startup/indexing', null);
    this.child.stderr.on('data', data => { this.stderr = (this.stderr + data).slice(-4000); });
    this.child.stdout.on('data', data => {
      this.buffer += data;
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          assert(this.pending, 'unexpected worker output');
          assert(event.type === 'ready' ? this.pending.id === null : event.id === this.pending.id, 'worker response ID mismatch');
          if (event.type === 'error') throw new Error(event.message);
          this.settle(null, event);
        } catch (error) { this.fail(error); }
      }
    });
    this.child.on('error', error => this.fail(error));
    this.child.on('close', (code, signal) => {
      this.dead = true;
      if (this.pending) this.settle(Object.assign(new Error(`worker exit ${code}/${signal}`), { status: /heap out of memory|allocation failed/i.test(this.stderr) ? 'oom' : 'crash' }));
    });
  }
  settle(error, event) {
    const pending = this.pending; if (!pending) return;
    clearTimeout(pending.timer); this.pending = null;
    if (error) { error.phase ??= pending.phase; pending.reject(error); } else pending.resolve(event);
  }
  fail(error) { this.dead = true; this.settle(error); kill(this.child); }
  wait(phase, id) {
    assert(!this.pending, 'concurrent request prohibited');
    return new Promise((resolveRequest, reject) => {
      this.pending = { phase, id, resolve: resolveRequest, reject,
        timer: setTimeout(() => this.fail(Object.assign(new Error('worker phase deadline'), { status: 'timeout_censored', phase })), TIMEOUT) };
    });
  }
  request(input) {
    assert(!this.dead, 'worker unavailable');
    const id = String(++this.sequence), promise = this.wait(input.op === 'index' ? 'startup/indexing' : 'summary-and-result', id);
    this.child.stdin.write(JSON.stringify({ ...input, id }) + '\n');
    return promise;
  }
  close() { kill(this.child); }
}

function projection(event, reference = false) {
  return { summarySha256: event.summarySha256, sourceMap: event.sourceMap, estimatedTokens: event.estimatedTokens,
    fallbackReason: event.fallbackReason, warnings: reference ? event.expectedWarnings : event.warnings };
}
async function main() {
  checks();
  if (process.argv.includes('--check-only')) { console.log(JSON.stringify({ status: 'PASS', timedCalls: 0, statisticalBoundaryChecks: true, fixtureChecks: true })); return; }
  assert.equal(process.platform, 'win32', 'validated platform is Windows');
  assert.equal(process.version, 'v24.18.0');
  assert(!existsSync(OUTPUT), 'refusing to overwrite previous evidence');
  assert.equal(dirname(OUTPUT), join(ROOT, 'research/results'));
  assert(/^6-4b-4-.*\.json$/.test(basename(OUTPUT)));
  assert.equal(git(['status', '--porcelain']), '', 'commit preregistration and implementation before measurement');
  const head = git(['rev-parse', 'HEAD']);
  const preregArgument = process.argv.find(arg => arg.startsWith('--prereg='))?.slice(9);
  assert(preregArgument, '--prereg=<committed-sha> is required');
  const prereg = git(['rev-parse', preregArgument]);
  git(['merge-base', '--is-ancestor', prereg, head]);
  git(['diff', '--exit-code', prereg, head, '--', RUNNER, WORKER, PROTOCOL]);
  assert.equal(prereg, git(['log', '-1', '--format=%H', head, '--', RUNNER, WORKER, PROTOCOL]));
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const before = tracked.map(file => ({ file, hash: hash(join(ROOT, file)) }));
  const temp = mkdtempSync(join(tmpdir(), 'tco-6-4b-4-perf-'));
  const logs = join(ROOT, '.artifacts', 'summarizer-perf-' + Date.now()); mkdirSync(logs, { recursive: true });
  const fixtureRoot = join(temp, 'fixtures'); mkdirSync(fixtureRoot);
  const workers = {}, snapshots = {};
  const result = { schema: 'summarizer-perf/v1', status: 'incomplete', startedAt: new Date().toISOString(), preregistrationCommit: prereg, measurementHead: head, base: BASE,
    files: Object.fromEntries([RUNNER, WORKER, PROTOCOL, 'src/core/artifacts.ts', 'package-lock.json'].map(file => [file, hash(join(ROOT, file))])),
    environment: environment(), protocol: { warmups: 5, cycles: 15, samplesPerArm: 30, innerRepeats: 1, heapLimitMiB: 512, phaseTimeoutMs: TIMEOUT, maxAttempts: 3, cooldownMs: 30000 },
    snapshots: {}, indexing: {}, comparisons: [], classifyOnly: [], referenceStress: [] };
  const normalized = value => JSON.parse(JSON.stringify(value).replaceAll(temp.replaceAll('\\', '\\\\'), '<temp>').replaceAll(ROOT.replaceAll('\\', '\\\\'), '<repo>'));
  const save = () => { mkdirSync(dirname(OUTPUT), { recursive: true }); writeFileSync(OUTPUT, JSON.stringify(normalized(result), null, 2) + '\n'); };
  let failure;
  try {
    for (const [name, text] of Object.entries(TEXTS)) writeFileSync(join(fixtureRoot, name + '.txt'), text, 'utf8');
    for (const variant of ['base', 'reference', 'optimized']) {
      const snapshot = join(temp, variant); snapshots[variant] = snapshot; mkdirSync(snapshot);
      const archive = join(temp, variant + '.tar');
      command('git', ['archive', '--format=tar', variant === 'optimized' ? head : BASE, '-o', archive]);
      command(TAR, ['-xf', archive, '-C', snapshot]);
      let transform = null;
      if (variant === 'reference') {
        const file = join(snapshot, 'src/core/artifacts.ts'), source = readFileSync(file, 'utf8');
        const oldLine = 'const candidateLines = artifact.sourceMap.slice(0, 6);', newLine = 'const candidateLines = artifact.sourceMap;';
        assert.equal(source.split(oldLine).length, 2); writeFileSync(file, source.replace(oldLine, newLine));
        transform = { oldLine, newLine, beforeSha256: digest(source), afterSha256: hash(file) };
      }
      for (const args of [['ci', '--ignore-scripts'], ['run', 'build'], ['run', 'typecheck']]) await npm(args, snapshot, join(logs, variant + '-' + args[0] + '-' + args[1] + '.log'));
      const modules = Object.fromEntries(['dist/src/core/artifacts.js', 'dist/src/core/token-estimator.js', 'dist/src/core/policy.js', 'dist/benchmarks/run.js'].map(file => [file, hash(join(snapshot, file))]));
      result.snapshots[variant] = { sourceSha256: hash(join(snapshot, 'src/core/artifacts.ts')), lockfileSha256: hash(join(snapshot, 'package-lock.json')), modules, transform };
      console.log('prepared ' + variant);
    }
    for (const variant of ['reference', 'optimized']) {
      assert.equal(result.snapshots.base.lockfileSha256, result.snapshots[variant].lockfileSha256);
      for (const file of Object.keys(result.snapshots.base.modules).filter(file => !file.endsWith('/artifacts.js'))) assert.equal(result.snapshots.base.modules[file], result.snapshots[variant].modules[file]);
    }
    assert.equal(new Set(Object.values(result.snapshots).map(row => row.modules['dist/src/core/artifacts.js'])).size, 3);
    for (const variant of Object.keys(snapshots)) {
      const worker = workers[variant] = new Worker(snapshots[variant], fixtureRoot); await worker.ready;
      result.indexing[variant] = {};
      for (const name of Object.keys(TEXTS)) {
        const event = await worker.request({ op: 'index', name: name + '.txt' }); result.indexing[variant][name] = event;
        assert.equal(event.inputSha256, digest(TEXTS[name]));
        assert.equal(event.indexLines, name === 'blank' ? 100001 : name === 'prose' ? 100000 : name === 'late' ? 8 : 1);
        assert.equal(event.classificationMode, 'semantic');
      }
    }
    save();
    const outputs = new Map();
    async function sample(variant, testCase, raw, label) {
      try {
        const event = await workers[variant].request({ op: 'summary', name: testCase.name + '.txt', budget: testCase.budget });
        assert(Number.isFinite(event.elapsedMs) && event.elapsedMs >= 0);
        assert.equal(event.fallbackReason, null);
        const key = variant + '/' + testCase.name + '/' + testCase.budget;
        const stable = projection(event, variant === 'reference');
        if (outputs.has(key)) assert.deepEqual(stable, outputs.get(key)); else outputs.set(key, stable);
        if (variant === 'optimized') assert.deepEqual(event.warnings, event.expectedWarnings);
        if (testCase.gate === 'G3') {
          assert.equal(event.selectedLineCount, testCase.name === 'late' ? 6 : 1);
          const baseOutput = outputs.get('base/' + testCase.name + '/' + testCase.budget);
          const optimizedOutput = outputs.get('optimized/' + testCase.name + '/' + testCase.budget);
          if (baseOutput && optimizedOutput) assert.deepEqual({ ...baseOutput, warnings: [] }, { ...optimizedOutput, warnings: [] });
        }
        if (testCase.budget === 2000 && outputs.has('optimized/' + testCase.name + '/2000') && outputs.has('reference/' + testCase.name + '/2000')) assert.deepEqual(outputs.get('optimized/' + testCase.name + '/2000'), outputs.get('reference/' + testCase.name + '/2000'));
        raw.push({ order: raw.length, label, variant, status: 'completed', ...event });
        return event.elapsedMs;
      } catch (error) {
        raw.push({ order: raw.length, label, variant, status: error.status || 'error', phase: error.phase || null, message: String(error.message) });
        if (variant === 'optimized' && ['timeout_censored', 'oom'].includes(error.status)) error.status = 'failed_gate';
        save(); throw error;
      }
    }
    async function abba(first, second, testCase, raw, label) {
      const arms = [[], []];
      for (let cycle = 0; cycle < 15; cycle++) for (const arm of [0, 1, 1, 0]) arms[arm].push(await sample(arm ? second : first, testCase, raw, `${label}/${cycle}/${arm}`));
      return { first: stats(arms[0]), second: stats(arms[1]) };
    }
    async function compare(testCase, candidate) {
      const comparison = { ...testCase, candidate, attempts: [], status: 'incomplete' }; result.comparisons.push(comparison);
      try {
      for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber++) {
        const attempt = { number: attemptNumber, raw: [], aa: {}, status: 'incomplete' }; comparison.attempts.push(attempt);
        for (const variant of ['base', candidate]) for (let i = 0; i < 5; i++) await sample(variant, testCase, attempt.raw, 'warmup/' + i);
        for (const variant of ['base', candidate]) {
          const block = await abba(variant, variant, testCase, attempt.raw, 'AA/' + variant);
          attempt.aa[variant] = { ...block, valid: aa(block.first, block.second) };
        }
        if (!Object.values(attempt.aa).every(row => row.valid)) {
          attempt.status = 'invalid_aa'; save(); console.log(`${testCase.name}/${testCase.budget}/${candidate} attempt${attemptNumber}: invalid AA`);
          if (attemptNumber === 3) { comparison.status = 'invalid_aa'; throw Object.assign(new Error('third invalid A/A block'), { status: 'invalid_aa' }); }
          await sleep(30000); continue;
        }
        const measured = await abba('base', candidate, testCase, attempt.raw, 'comparison');
        attempt.stats = { base: measured.first, [candidate]: measured.second }; attempt.status = 'valid';
        attempt.gate = candidate === 'optimized' ? gate(testCase.gate, measured.first, measured.second) : null;
        comparison.selectedAttempt = attemptNumber;
        comparison.status = candidate === 'reference' ? 'informational' : attempt.gate && !attempt.gate.pass ? 'failed_gate' : 'pass'; save();
        console.log(JSON.stringify({ case: testCase.name, budget: testCase.budget, candidate, status: comparison.status, stats: attempt.stats, gate: attempt.gate }));
        if (comparison.status === 'failed_gate') throw Object.assign(new Error('valid performance gate failed; no retry'), { status: 'failed_gate' });
        return;
      }
      } catch (error) {
        comparison.status = error.status || 'error';
        if (comparison.attempts.at(-1).status === 'incomplete') comparison.attempts.at(-1).status = comparison.status;
        throw error;
      }
    }
    for (const testCase of CASES) await compare(testCase, 'optimized');
    for (const testCase of CASES.filter(row => row.gate === 'G1')) await compare(testCase, 'reference');
    for (const name of Object.keys(TEXTS)) {
      const control = { name, raw: [], warmups: [] }; result.classifyOnly.push(control);
      for (let i = 0; i < 35; i++) {
        const event = await workers.base.request({ op: 'classify', name: name + '.txt' });
        (i < 5 ? control.warmups : control.raw).push(event);
      }
      control.stats = stats(control.raw.map(event => event.elapsedMs)); save();
    }
    for (const name of ['blank', 'prose']) {
      if (workers.reference.dead) {
        workers.reference = new Worker(snapshots.reference, fixtureRoot); await workers.reference.ready;
        await workers.reference.request({ op: 'index', name: name + '.txt' });
      }
      const diagnostic = { name, budget: 50000, timeoutMs: TIMEOUT, informational: true, warmups: 0 }; result.referenceStress.push(diagnostic);
      try { diagnostic.result = await workers.reference.request({ op: 'summary', name: name + '.txt', budget: 50000 }); diagnostic.status = 'completed'; }
      catch (error) { diagnostic.status = error.status || 'error'; diagnostic.phase = error.phase; diagnostic.message = error.message; }
      save();
    }
    result.correctness = { optimizedReference2000: 'passed with approved D2 normalization of reference warnings', projections: Object.fromEntries(outputs) };
    result.status = 'pass';
  } catch (error) { failure = error; result.status = error.status || 'error'; result.error = String(error.message); }
  finally {
    for (const worker of Object.values(workers)) worker.close();
    const mandatory = result.comparisons.filter(row => row.candidate === 'optimized');
    result.mandatory = { status: mandatory.length === CASES.length && mandatory.every(row => row.status === 'pass') ? 'pass' : 'not_passed',
      gates: mandatory.map(row => ({ name: row.name, budget: row.budget, status: row.status, verdict: row.attempts.find(attempt => attempt.number === row.selectedAttempt)?.gate ?? null })) };
    const finalize = action => { try { action(); } catch (error) {
      failure ||= error; if (['pass', 'incomplete'].includes(result.status)) result.status = 'error';
      (result.finalizationErrors ??= []).push(String(error.message));
    } };
    finalize(() => {
      result.finalEnvironment = environment(); assert.deepEqual(result.finalEnvironment, result.environment);
    });
    finalize(() => {
      const changed = before.filter(row => !existsSync(join(ROOT, row.file)) || hash(join(ROOT, row.file)) !== row.hash);
      result.preservation = { trackedFiles: before.length, changed: changed.map(row => row.file), manifestSha256: digest(JSON.stringify(before)) }; assert.equal(changed.length, 0);
    });
    finalize(() => {
      for (const [file, expected] of Object.entries(result.files)) assert.equal(hash(join(ROOT, file)), expected);
    });
    finalize(() => {
      const actual = realpathSync(temp), parent = realpathSync(tmpdir());
      assert.equal(dirname(actual).toLowerCase(), parent.toLowerCase()); assert(basename(actual).startsWith('tco-6-4b-4-perf-'));
      rmSync(actual, { recursive: true, force: true }); result.tempCleanup = !existsSync(actual);
    });
    result.finishedAt = new Date().toISOString(); save();
  }
  console.log(JSON.stringify({ status: result.status, output: OUTPUT }));
  if (failure) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
