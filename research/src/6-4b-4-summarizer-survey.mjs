import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'cf77b524445be3550c942a795d7c992e64d0e4b0';
const WORKER = join(ROOT, 'research/src/6-4b-4-summarizer-worker.mjs');
const NPM = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const OUTPUT = resolve(process.argv[2] || join(ROOT, 'research/results/6-4b-4-summarizer-survey.json'));
const LOGS = join(ROOT, '.artifacts', `6-4b-4-survey-${Date.now()}`);
const CAP = 'const candidateLines = artifact.sourceMap.slice(0, 6);';
const SUCCESS = '...commonFields(artifact, estimateTextTokens(summary), [], null),';
const OMIT = new Set(['generatedAt', 'environment', 'latencyMs', 'suiteLatencyMs', 'medianLatencyMs', 'p95LatencyMs']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = file => digest(readFileSync(file));
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
mkdirSync(LOGS, { recursive: true });

function run(file, args, cwd, label) {
  let result;
  try {
    result = { code: 0, stdout: execFileSync(file, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: '1' } }), stderr: '' };
  } catch (error) {
    result = { code: error.status ?? -1, stdout: String(error.stdout || ''), stderr: String(error.stderr || error.message), signal: error.signal, error: error.code };
  }
  writeFileSync(join(LOGS, `${label}.log`), result.stdout + result.stderr);
  console.log(`${label}: exit ${result.code}`);
  return result;
}
function requireSuccess(result, label) {
  assert.equal(result.code, 0, `${label} failed; see local log`);
  return result;
}
function killTree(child) {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { child.kill(); }
  } else child.kill('SIGKILL');
}
function npm(args, cwd, label) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [NPM, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, 600000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      writeFileSync(join(LOGS, `${label}.log`), stdout + stderr);
      console.log(`${label}: exit ${code}${timedOut ? ' timeout' : ''}`);
      resolveRun({ code: timedOut ? -1 : code, signal, timedOut, stdout, stderr });
    });
  });
}
function parseReport(text) {
  const start = text.indexOf('{');
  assert(start >= 0, 'missing JSON report');
  return JSON.parse(text.slice(start));
}
function normalize(value, snapshot, temp) {
  if (typeof value === 'string') {
    let text = value.replace(/\x1b\[[0-9;]*m/g, '').replaceAll('\\', '/');
    for (const [path, label] of [[snapshot, '<snapshot>'], [temp, '<temp>'], [ROOT, '<repo>']]) {
      if (path) text = text.replaceAll(path.replaceAll('\\', '/'), label);
    }
    return text.replace(/[A-Z]:\/Users\/[^/\s"']+/gi, '<user>');
  }
  if (Array.isArray(value)) return value.map(item => normalize(item, snapshot, temp));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item, snapshot, temp)]));
  return value;
}
function stableDiff(a, b, path = '') {
  if (OMIT.has(path.split('.').at(-1))) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => stableDiff(a[key], b[key], path ? `${path}.${key}` : key));
  }
  return Object.is(a, b) ? [] : [{ path, baseline: a ?? null, candidate: b ?? null }];
}
function testEvidence(file) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const failed = [], skipped = [], suiteErrors = [], identities = [];
  for (const suite of report.testResults) {
    for (const test of suite.assertionResults || []) {
      identities.push(`${suite.name.replaceAll('\\', '/').split('/tests/').at(-1)}::${test.fullName}`);
      const location = test.failureMessages.join('\n').match(/\/tests\/[^:\n]+:(\d+):(\d+)/);
      const row = { file: suite.name, name: test.fullName, status: test.status, location: test.location ?? (location ? { line: Number(location[1]), column: Number(location[2]) } : null), failureMessages: test.failureMessages };
      if (test.status === 'failed') failed.push(row);
      if (['pending', 'todo', 'skipped', 'disabled'].includes(test.status)) skipped.push(row);
    }
    if (suite.message || suite.testExecError || (suite.status === 'failed' && !suite.assertionResults?.length)) {
      suiteErrors.push({ file: suite.name, message: suite.message || '', error: suite.testExecError ?? null });
    }
  }
  assert.equal(report.numTotalTests, report.numPassedTests + report.numFailedTests + report.numPendingTests + report.numTodoTests);
  assert.equal(identities.length, report.numTotalTests);
  return { total: report.numTotalTests, identitiesSha256: digest(JSON.stringify(identities.sort())), passed: report.numPassedTests, failedCount: report.numFailedTests, skippedCount: report.numPendingTests, todo: report.numTodoTests, failedSuites: report.numFailedTestSuites, success: report.success, failed, skipped, suiteErrors, unhandledErrors: report.unhandledErrors ?? [], snapshot: report.snapshot };
}
function patch(snapshot, variant) {
  const file = join(snapshot, 'src/core/artifacts.ts');
  const before = readFileSync(file, 'utf8');
  assert.equal(before.split(CAP).length, 2);
  let after = before.replace(CAP, 'const candidateLines = artifact.sourceMap;');
  if (variant === 'B') {
    assert.equal(after.split(SUCCESS).length, 2);
    after = after.replace(SUCCESS, '...commonFields(artifact, estimateTextTokens(summary), selectedLines.length < artifact.sourceMap.length ? ["summary_truncated"] : [], null),');
  }
  writeFileSync(file, after);
  const afterLines = after.split('\n');
  return { beforeSha256: digest(before), afterSha256: digest(after), changes: before.split('\n').flatMap((line, index) => line === afterLines[index] ? [] : [{ line: index + 1, before: line, after: afterLines[index] }]) };
}
function product(row) {
  const { summary, sourceMap, estimatedTokens, fallbackReason, warnings, meaningGate } = row;
  return { summary, sourceMap, estimatedTokens, fallbackReason, warnings, meaningGate };
}
function compareMatrix(variants) {
  const rows = [];
  const [base, a, b] = ['BASE', 'A', 'B'].map(key => variants[key].matrix.cases);
  assert.equal(base.length, a.length); assert.equal(a.length, b.length);
  for (let index = 0; index < base.length; index++) {
    assert.equal(base[index].id, a[index].id); assert.equal(a[index].id, b[index].id);
    assert.equal(base[index].inputSha256, a[index].inputSha256); assert.equal(a[index].inputSha256, b[index].inputSha256);
    const extraWarning = a[index].fallbackReason === null && a[index].selectedLineCount < a[index].inputLines;
    const expected = product(a[index]);
    expected.warnings = extraWarning ? [...expected.warnings, 'summary_truncated'] : expected.warnings;
    assert.deepEqual(product(b[index]), expected, `B warning-only difference: ${a[index].id}`);
    const nonCapBound = base[index].inputLines <= 6 || base[index].selectedLineCount < 6;
    if (nonCapBound) assert.deepEqual(product(base[index]), product(a[index]), `non-cap-bound equality: ${a[index].id}`);
    rows.push({ id: a[index].id, nonCapBound, baseEqualsA: JSON.stringify(product(base[index])) === JSON.stringify(product(a[index])), warningAdded: extraWarning, warningOnlyDifferenceVerified: true });
  }
  return rows;
}
async function diagnostic(snapshot, fixtures, kind, budget) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=512', WORKER, 'diagnostic', snapshot, fixtures, kind, String(budget)], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timeout = false, phase = 'startup/indexing';
    let timer;
    const kill = () => {
      timeout = true;
      killTree(child);
    };
    timer = setTimeout(kill, 15000);
    child.stdout.on('data', data => {
      stdout += data;
      if (phase === 'startup/indexing' && stdout.includes('"type":"index-ready"')) {
        clearTimeout(timer); phase = 'summary-and-result'; timer = setTimeout(kill, 15000);
      }
    });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      try {
      const events = [], malformedLines = [];
      for (const line of stdout.trim().split(/\r?\n/).filter(Boolean)) {
        try { events.push(JSON.parse(line)); } catch { malformedLines.push(line.slice(0, 200)); }
      }
      const result = events.find(event => event.type === 'result');
      if (result) { result.summarySha256 = digest(result.summary); delete result.summary; }
      const status = timeout ? 'timeout_censored' : /heap out of memory|allocation failed/i.test(stderr) ? 'oom' : code === 0 && result && !malformedLines.length ? 'completed' : 'crash';
      console.log(`diagnostic ${kind}/${budget}: ${status}`);
      resolveResult({ kind, budget, status, timeoutPhase: timeout ? phase : null, timeoutLimitMs: 15000, heapLimitMiB: 512, code, signal, events, malformedLines, stderr: stderr.slice(-2000), counters: 'derived from completed selected prefix; fit calls and sum of UTF-16 prefix lengths, not instrumented timing' });
      } catch (error) { reject(error); }
    });
  });
}
function cleanup(temp) {
  const actual = realpathSync(temp), parent = realpathSync(tmpdir()), rel = relative(parent, actual);
  assert(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
  assert.equal(dirname(actual).toLowerCase(), parent.toLowerCase());
  assert(basename(actual).startsWith('tco-6-4b-4-'));
  rmSync(actual, { recursive: true, force: true });
  return !existsSync(actual);
}

async function main() {
  assert(existsSync(NPM), 'npm CLI not found; invoke through npm or set npm_execpath');
  const trackedOutput = requireSuccess(run('git', ['ls-files', '-z'], ROOT, 'tracked'), 'git ls-files').stdout;
  const tracked = trackedOutput.split('\0').filter(Boolean).filter(file => !file.startsWith('research/results/6-4b-4-'));
  const before = tracked.map(file => ({ file, sha256: hash(join(ROOT, file)) }));
  const temp = mkdtempSync(join(tmpdir(), 'tco-6-4b-4-'));
  const fixtures = join(temp, 'fixtures'); mkdirSync(fixtures);
  const result = { schema: 'summarizer-impact/v1', status: 'incomplete', run_metadata: { startedAt: new Date().toISOString(), node: process.version, platform: process.platform, osRelease: release(), arch: process.arch, base: BASE, npmVersion: requireSuccess(run(process.execPath, [NPM, '--version'], ROOT, 'npm-version'), 'npm version').stdout.trim(), runnerSha256: hash(fileURLToPath(import.meta.url)), workerSha256: hash(WORKER) }, variants: {}, comparison: {}, diagnostics: [] };
  let failure;
  try {
    for (const variant of ['BASE', 'A', 'B']) {
      const snapshot = join(temp, variant); mkdirSync(snapshot);
      const archive = join(snapshot, 'source.tar');
      requireSuccess(run('git', ['archive', '--format=tar', BASE, '-o', archive], ROOT, `${variant}-archive`), 'archive');
      requireSuccess(run('tar', ['-xf', archive, '-C', snapshot], ROOT, `${variant}-extract`), 'extract');
      const transform = variant === 'BASE' ? null : patch(snapshot, variant);
      requireSuccess(await npm(['ci', '--ignore-scripts'], snapshot, `${variant}-install`), 'install');
      requireSuccess(await npm(['run', 'build'], snapshot, `${variant}-build`), 'build');
      requireSuccess(await npm(['run', 'typecheck'], snapshot, `${variant}-typecheck`), 'typecheck');
      const evidence = {};
      for (const [name, selection] of [['targeted', ['tests/core.test.ts']], ['full', []]]) {
        const report = join(snapshot, `${name}.json`);
        const call = await npm(['test', '--', ...selection, '--reporter=json', `--outputFile=${report}`], snapshot, `${variant}-${name}`);
        evidence[name] = { exit: call.code, ...testEvidence(report) };
        assert.equal(evidence[name].suiteErrors.length, 0, 'collection/setup errors prevent attribution');
        assert.equal(evidence[name].unhandledErrors.length, 0);
        assert.equal(evidence[name].failed.length, evidence[name].failedCount);
        assert.equal(call.code, evidence[name].failedCount ? 1 : 0);
        if (variant === 'BASE') assert.equal(call.code, 0, 'baseline must pass');
      }
      const benchmarkCall = await npm(['run', 'benchmark'], snapshot, `${variant}-benchmark`);
      const benchmark = parseReport(benchmarkCall.stdout);
      if (variant === 'BASE') assert.equal(benchmarkCall.code, 0);
      const matrixCall = requireSuccess(run(process.execPath, [WORKER, 'matrix', snapshot, fixtures], ROOT, `${variant}-matrix`), 'matrix');
      const matrix = JSON.parse(matrixCall.stdout);
      assert(Object.values(matrix.invariants).every(Boolean));
      const modules = Object.fromEntries(['dist/src/core/artifacts.js', 'dist/src/core/token-estimator.js', 'dist/src/core/policy.js', 'dist/benchmarks/run.js'].map(file => [file, hash(join(snapshot, file))]));
      const record = { transform, sourceSha256: hash(join(snapshot, 'src/core/artifacts.ts')), compiledSha256: modules['dist/src/core/artifacts.js'], lockfileSha256: hash(join(snapshot, 'package-lock.json')), modules, buildExit: 0, typecheckExit: 0, ...evidence, benchmark: { exit: benchmarkCall.code, report: benchmark }, matrix };
      result.variants[variant] = normalize(record, snapshot, temp);
    }
    const { BASE: base, A: a, B: b } = result.variants;
    assert.notEqual(base.compiledSha256, a.compiledSha256); assert.notEqual(a.compiledSha256, b.compiledSha256);
    assert.equal(base.lockfileSha256, a.lockfileSha256); assert.equal(a.lockfileSha256, b.lockfileSha256);
    for (const file of Object.keys(base.modules).filter(file => file !== 'dist/src/core/artifacts.js')) {
      assert.equal(base.modules[file], a.modules[file]); assert.equal(a.modules[file], b.modules[file]);
    }
    assert.equal(base.full.identitiesSha256, a.full.identitiesSha256); assert.equal(a.full.identitiesSha256, b.full.identitiesSha256);
    const identities = rows => rows.map(row => `${row.file}::${row.name}`).sort();
    for (const candidate of [a, b]) assert.deepEqual(identities(candidate.full.skipped), identities(base.full.skipped));
    result.comparison.matrix = compareMatrix(result.variants);
    result.comparison.benchmark = { aVsBase: stableDiff(base.benchmark.report, a.benchmark.report), bVsBase: stableDiff(base.benchmark.report, b.benchmark.report), bVsA: stableDiff(a.benchmark.report, b.benchmark.report), excludedFields: [...OMIT] };
    const aIds = identities(a.full.failed), bIds = identities(b.full.failed);
    result.comparison.failures = { aVsBase: aIds, bVsBase: bIds, bOnly: bIds.filter(id => !aIds.includes(id)) };
    for (const kind of ['blank', 'short', 'semantic-blank', 'semantic-short', 'prose-short']) {
      for (const budget of [2000, 50000]) result.diagnostics.push(normalize(await diagnostic(join(temp, 'A'), fixtures, kind, budget), join(temp, 'A'), temp));
    }
    result.status = 'complete';
  } catch (error) {
    failure = error; result.status = 'failed'; result.error = normalize(String(error.stack), null, temp);
  } finally {
    const safeHash = file => { try { return hash(file); } catch { return null; } };
    const after = before.map(row => ({ ...row, afterSha256: safeHash(join(ROOT, row.file)) }));
    result.preservation = { trackedFiles: after.length, beforeManifestSha256: digest(JSON.stringify(before)), afterManifestSha256: digest(JSON.stringify(after.map(row => ({ file: row.file, sha256: row.afterSha256 })))), changed: after.filter(row => row.sha256 !== row.afterSha256) };
    try { result.tempCleanup = cleanup(temp); } catch (error) { result.tempCleanup = false; result.cleanupError = String(error.message); failure ||= error; }
    result.run_metadata.finalRunnerSha256 = safeHash(fileURLToPath(import.meta.url));
    result.run_metadata.finalWorkerSha256 = safeHash(WORKER);
    if (result.run_metadata.runnerSha256 !== result.run_metadata.finalRunnerSha256 || result.run_metadata.workerSha256 !== result.run_metadata.finalWorkerSha256) failure ||= new Error('runner or worker changed during survey');
    result.run_metadata.finishedAt = new Date().toISOString();
    if (result.preservation.changed.length) { result.status = 'failed'; failure ||= new Error('protected tracked files changed'); }
    if (failure) result.status = 'failed';
    if (existsSync(OUTPUT)) writeFileSync(join(LOGS, 'previous-output.json'), readFileSync(OUTPUT));
    mkdirSync(dirname(OUTPUT), { recursive: true }); json(OUTPUT, result);
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ status: result.status, result: relative(ROOT, OUTPUT), failures: result.comparison.failures, preservation: result.preservation }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
