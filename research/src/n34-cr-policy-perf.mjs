// N-34 preregistered resource gates (plan PR #115 @4a5b390 section 8; protocol
// docs/agent/handoffs/n34-cr-line-policy-prereg.md). Mandatory blocks: timing (8.4) and memory (8.5).
// Informational block (after both mandatory blocks pass): CAND(X) vs BASE(X) on the G-C inputs.
// Every child is a fresh hidden process with a hard timeout. Spawn/parse failures, missing samples,
// abnormal exits and invalid repeats are explicit states, never an implicit PASS. Writes one new
// JSON file per invocation and never overwrites.
// Usage:
//   node research/src/n34-cr-policy-perf.mjs --check-only
//   node research/src/n34-cr-policy-perf.mjs --self-check --output=research/results/n34-cr-policy/selfcheck-<name>.json
//   node research/src/n34-cr-policy-perf.mjs --prereg=<sha> --block=timing|memory|info --output=research/results/n34-cr-policy/perf-<run>-<block>.json
// Exit codes: 0 pass (or completed self-check / informational), 3 failed_correctness, 4 failed_gate,
// 5 invalid, 1 any other error.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPARISONS, INPUTS, ROWS, SIZE, makeInput } from './n34-cr-policy-perf-inputs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA = 'n34-cr-policy-perf/v1';
const BASE = '5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3'; // origin/main at task start = plan base
const RUNNER = 'research/src/n34-cr-policy-perf.mjs';
const INPUTS_MODULE = 'research/src/n34-cr-policy-perf-inputs.mjs';
const PERF_WORKER = 'research/src/n34-cr-policy-perf-worker.mjs';
const MEM_WORKER = 'research/src/n34-cr-policy-perf-mem-worker.mjs';
const PROTOCOL = 'docs/agent/handoffs/n34-cr-line-policy-prereg.md';
const HARNESS_FILES = [RUNNER, INPUTS_MODULE, PERF_WORKER, MEM_WORKER, PROTOCOL];
const RESULTS_DIR = 'research/results/n34-cr-policy';
const NPM = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const TAR = 'C:/Windows/System32/tar.exe';
const MIB = 1024 * 1024;
const TEMP_PREFIX = 'tco-n34-perf-';
const P = Object.freeze({
  circuits: Object.freeze(['ABCDBDCADACB']), circuitMap: Object.freeze({ A: 'B1', B: 'B2', C: 'C2', D: 'C1' }), warmupCircuits: 2, measureCircuits: 10,
  calibrationSamples: 5, samplesPerArm: 30, minSampleMs: 50, maxK: 1024, maxAttempts: 3, cooldownMs: 30000,
  timingChildTimeoutMs: 1800000, memoryChildTimeoutMs: 600000, memoryRepeats: 3,
  gateArms: Object.freeze({ candidate: 'C1', reference: 'B1' }),
});
const EXIT = Object.freeze({ pass: 0, completed_informational: 0, self_check_completed: 0, failed_correctness: 3, failed_gate: 4, invalid: 5 });

// ---------- statistics and gates ----------
const nearest = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
function stats(values, n = P.samplesPerArm) {
  assert.equal(values.length, n, `expected ${n} samples, got ${values.length}`);
  assert(values.every(value => Number.isFinite(value) && value >= 0), 'non-finite sample');
  const sorted = [...values].sort((a, b) => a - b);
  return { n: values.length, median: sorted[14], p95: sorted[28] }; // n = 30: nearest-rank
}
// A/A: reference = first copy (B1 or C1); ratio = second / reference.
function aaValid(reference, second) {
  const ratio = second.median / reference.median;
  const medianOk = (ratio >= 0.95 && ratio <= 1.05) || Math.abs(second.median - reference.median) <= 0.1;
  const p95Ok = Math.abs(second.p95 - reference.p95) <= Math.max(0.2, reference.p95 * 0.2);
  return { ratio, medianDelta: second.median - reference.median, p95Delta: second.p95 - reference.p95, medianOk, p95Ok, valid: medianOk && p95Ok };
}
// N-33 D1 thresholds. REF = B1, CAND = C1 (fixed before measurement).
function timeGate(reference, candidate) {
  const medianLimit = Math.max(reference.median * 1.10, reference.median + 0.5);
  const p95Limit = Math.max(reference.p95 * 1.20, reference.p95 + 1);
  return { medianLimit, p95Limit, medianOk: candidate.median <= medianLimit, p95Ok: candidate.p95 <= p95Limit, pass: candidate.median <= medianLimit && candidate.p95 <= p95Limit };
}
// N-33 D2 thresholds on medians of 3 fresh children per arm.
function memoryGate(reference, candidate) {
  const measurable = [reference.R, reference.P, candidate.R, candidate.P].every(Number.isFinite) && reference.P > 0 && candidate.P > 0;
  const rLimit = reference.R + Math.max(MIB, reference.R * 0.02);
  const pLimit = reference.P * 1.10 + 32 * MIB;
  if (!measurable) return { rLimit, pLimit, status: 'unmeasurable', pass: false };
  const pass = candidate.R <= rLimit && candidate.P <= pLimit;
  return { rLimit, pLimit, rOk: candidate.R <= rLimit, pOk: candidate.P <= pLimit, status: pass ? 'pass' : 'failed_gate', pass };
}
// Circuit c of each block (warmup, measure) uses circuits[c % circuits.length], so both blocks
// start with the first circuit.
function schedule(circuits = P.circuits) {
  const armsOf = circuit => [...circuit].map(letter => P.circuitMap[letter]);
  const list = [];
  for (let c = 0; c < P.warmupCircuits; c++) for (const arm of armsOf(circuits[c % circuits.length])) list.push({ label: `warmup/${c}`, arm });
  for (let c = 0; c < P.measureCircuits; c++) for (const arm of armsOf(circuits[c % circuits.length])) list.push({ label: `measure/${c}`, arm });
  return list;
}
// pairs: transitions into every measured sample, including the one from the last warmup sample (120).
// innerPairs: transitions with both samples measured (119). parity: [even, odd] index in the attempt.
function scheduleFacts(list) {
  const count = filter => list.filter(filter).reduce((m, e) => ({ ...m, [e.arm]: (m[e.arm] ?? 0) + 1 }), {});
  const pairs = {}, innerPairs = {};
  let self = 0;
  list.forEach((entry, index) => {
    if (!entry.label.startsWith('measure/')) return;
    const prev = list[index - 1];
    if (prev.arm === entry.arm) self++;
    const key = `${prev.arm}>${entry.arm}`; pairs[key] = (pairs[key] ?? 0) + 1;
    if (prev.label.startsWith('measure/')) innerPairs[key] = (innerPairs[key] ?? 0) + 1;
  });
  const parity = block => list.reduce((m, e, i) => { if (e.label.startsWith(block)) (m[e.arm] ??= [0, 0])[i % 2]++; return m; }, {});
  return { total: list.length, warmupPerCopy: count(e => e.label.startsWith('warmup/')), measuredPerCopy: count(e => e.label.startsWith('measure/')),
    warmupParity: parity('warmup/'), measuredParity: parity('measure/'), pairs, innerPairs, self };
}
// run2 schedule invariants (approved plan A). Returns the list of violated invariants.
const COPIES = Object.freeze(['B1', 'B2', 'C1', 'C2']);
function scheduleViolations(list) {
  const f = scheduleFacts(list), violations = [];
  if (f.total !== 144 || list.filter(e => e.label.startsWith('measure/')).length !== 120) violations.push('total');
  for (const copy of COPIES) {
    if (f.warmupPerCopy[copy] !== 6) violations.push(`warmupCount:${copy}`);
    if (f.measuredPerCopy[copy] !== 30) violations.push(`measuredCount:${copy}`);
    if (String(f.warmupParity[copy]) !== '3,3') violations.push(`warmupParity:${copy}`);
    if (String(f.measuredParity[copy]) !== '15,15') violations.push(`measuredParity:${copy}`);
  }
  const distinct = Object.entries(f.pairs).filter(([key]) => key.split('>')[0] !== key.split('>')[1]);
  if (distinct.length !== 12 || !distinct.every(([, n]) => n === 10)) violations.push('transitions');
  if (f.self !== 0) violations.push('self');
  return violations;
}
const SCHEDULE_CONTROLS = Object.freeze({ originalOnly: Object.freeze(['ABCDBDCADACB']), simpleReverse: Object.freeze(['ABCDBDCADACB', 'BCADACDBDCBA']) });
function calibrationDone(baseValues, candidateValues) {
  return baseValues.length === P.calibrationSamples && candidateValues.length === P.calibrationSamples
    && baseValues.every(Number.isFinite) && candidateValues.every(Number.isFinite)
    && Math.min(...baseValues) >= P.minSampleMs && Math.min(...candidateValues) >= P.minSampleMs;
}

// ---------- child status classification ----------
// runChild status: completed | timeout | spawn_error | oom | abnormal_exit | parse_error | child_error
// Timing block (section 8.4): any non-completed child is INVALID (four copies share one child, so a
// crash cannot be attributed to an arm).
const timingChildVerdict = run => (run.status === 'completed' ? 'completed' : 'invalid');
// Memory block (section 8.5): CAND OOM / timeout / RangeError where REF completed = failed_gate
// (no retry); REF failure = ref_failed (no verdict, needs a new user decision); spawn/parse/missing
// and any other abnormal state = invalid.
const isResourceFailure = run => run.status === 'oom' || run.status === 'timeout' || (run.status === 'child_error' && run.error?.name === 'RangeError');
function memoryRow(refRuns, candRuns) {
  const row = { refRuns: refRuns.length, candRuns: candRuns.length };
  if (refRuns.length !== P.memoryRepeats || candRuns.length !== P.memoryRepeats) return { ...row, status: 'invalid', reason: 'missing_runs', pass: false };
  if ([...refRuns, ...candRuns].some(r => r.status === 'spawn_error' || r.status === 'parse_error')) return { ...row, status: 'invalid', reason: 'spawn_or_parse', pass: false };
  if (refRuns.some(r => r.status !== 'completed')) {
    return { ...row, status: refRuns.some(isResourceFailure) ? 'ref_failed' : 'invalid', reason: refRuns.map(r => r.status).join(','), pass: false };
  }
  if (candRuns.some(isResourceFailure)) return { ...row, status: 'failed_gate', reason: `candidate_resource_failure:${candRuns.map(r => r.status === 'child_error' ? r.error?.name : r.status).join(',')}`, pass: false };
  if (candRuns.some(r => r.status !== 'completed')) return { ...row, status: 'invalid', reason: candRuns.map(r => r.status).join(','), pass: false };
  if (new Set([...refRuns, ...candRuns].map(r => r.outputDigest)).size !== 1) return { ...row, status: 'failed_correctness', reason: 'output_digest_mismatch', pass: false };
  const median3 = values => nearest(values, 0.5);
  const reference = { R: median3(refRuns.map(r => r.retainedBytes)), P: median3(refRuns.map(r => r.maxRssBytes)) };
  const candidate = { R: median3(candRuns.map(r => r.retainedBytes)), P: median3(candRuns.map(r => r.maxRssBytes)) };
  return { ...row, reference, candidate, ...memoryGate(reference, candidate) };
}
// Block status priority: failed_correctness > failed_gate > invalid. pass only if every one of the
// 18 preregistered rows exists exactly once and passed.
function blockStatus(rows) {
  const keys = rows.map(r => r.key);
  const complete = rows.length === ROWS.length && ROWS.every(r => keys.filter(k => k === r.key).length === 1);
  if (complete && rows.every(r => r.status === 'pass')) return 'pass';
  if (rows.some(r => r.status === 'failed_correctness')) return 'failed_correctness';
  if (rows.some(r => r.status === 'failed_gate')) return 'failed_gate';
  return 'invalid';
}
const exitCodeFor = status => EXIT[status] ?? 1;

function checks() {
  const constant = value => stats(Array(30).fill(value));
  const ramp = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(stats(ramp).median, 15); assert.equal(stats(ramp).p95, 29);
  assert.equal(nearest(ramp, 0.5), 15); assert.equal(nearest(ramp, 0.95), 29);
  assert.throws(() => stats(Array(29).fill(1))); assert.throws(() => stats(Array(31).fill(1)));
  assert.throws(() => stats([...Array(29).fill(1), NaN])); assert.throws(() => stats([...Array(29).fill(1), Infinity]));
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
  assert.equal(memoryGate({ R: 1, P: 1 }, { R: NaN, P: 1 }).status, 'unmeasurable');
  // schedule: negative controls first (they must fail the invariants), then the approved schedule
  const original = scheduleViolations(schedule(SCHEDULE_CONTROLS.originalOnly));
  assert(original.includes('measuredParity:C2') && original.includes('warmupParity:C2'), 'control: original-only must fail parity');
  assert(!original.includes('transitions') && !original.includes('self') && !original.some(v => v.includes('Count')), 'control: original-only fails parity only');
  const reverse = scheduleViolations(schedule(SCHEDULE_CONTROLS.simpleReverse));
  assert(reverse.includes('transitions') && reverse.includes('self'), 'control: simple reverse must fail transition/self');
  assert(!reverse.some(v => v.includes('Parity') || v.includes('Count')), 'control: simple reverse keeps parity and counts');
  assert.deepEqual(P.circuits, ['ABCDBDCADACB', 'ADACDBDCBABC'], 'approved circuits (plan A)');
  const list = schedule(), facts = scheduleFacts(list);
  assert.deepEqual(scheduleViolations(list), [], 'approved schedule invariants');
  assert.equal(list.slice(0, 24).map(e => e.arm).join(','), 'B1,B2,C2,C1,B2,C1,C2,B1,C1,B1,C2,B2,B1,C1,B1,C2,C1,B2,C1,C2,B2,B1,B2,C2');
  assert.equal(list.slice(24, 36).map(e => e.arm).join(','), 'B1,B2,C2,C1,B2,C1,C2,B1,C1,B1,C2,B2');
  const inner = Object.entries(facts.innerPairs);
  assert.equal(inner.reduce((sum, [, n]) => sum + n, 0), 119);
  assert.deepEqual(inner.filter(([, n]) => n !== 10), [['C2>B1', 9]], 'inner measured transitions: C>A 9, others 10');
  const five = v => Array(5).fill(v);
  assert(calibrationDone(five(50), five(50))); assert(!calibrationDone(five(49.999), five(80))); assert(!calibrationDone(five(80), [80, 80, 80, 80, 49.999]));
  assert(!calibrationDone(five(80), five(80).slice(1))); assert(!calibrationDone(five(80), [80, 80, 80, 80, NaN]));
  // classification and aggregation
  for (const status of ['timeout', 'spawn_error', 'oom', 'abnormal_exit', 'parse_error', 'child_error']) assert.equal(timingChildVerdict({ status }), 'invalid');
  const ok = (d = 'x', R = MIB, Pm = 100 * MIB) => ({ status: 'completed', outputDigest: d, retainedBytes: R, maxRssBytes: Pm });
  const three = run => [run, run, run];
  assert.equal(memoryRow(three(ok()), three(ok())).status, 'pass');
  assert.equal(memoryRow(three(ok()), [ok(), { status: 'oom' }, ok()]).status, 'failed_gate');
  assert.equal(memoryRow(three(ok()), [ok(), { status: 'timeout' }, ok()]).status, 'failed_gate');
  assert.equal(memoryRow(three(ok()), [ok(), { status: 'child_error', error: { name: 'RangeError' } }, ok()]).status, 'failed_gate');
  assert.equal(memoryRow(three(ok()), [ok(), { status: 'child_error', error: { name: 'Error' } }, ok()]).status, 'invalid');
  assert.equal(memoryRow(three(ok()), [ok(), { status: 'abnormal_exit' }, ok()]).status, 'invalid');
  assert.equal(memoryRow([ok(), { status: 'oom' }, ok()], three(ok())).status, 'ref_failed');
  assert.equal(memoryRow([ok(), { status: 'parse_error' }, ok()], three(ok())).status, 'invalid');
  assert.equal(memoryRow(three(ok()), [ok(), { status: 'spawn_error' }, ok()]).status, 'invalid');
  assert.equal(memoryRow(three(ok()), three(ok()).slice(1)).status, 'invalid');
  assert.equal(memoryRow(three(ok()), [ok(), ok('y'), ok()]).status, 'failed_correctness');
  assert.equal(memoryRow(three(ok()), three(ok('x', 3 * MIB))).status, 'failed_gate');
  assert.equal(memoryRow(three(ok('x', MIB, 0)), three(ok())).status, 'unmeasurable');
  const rows = status => ROWS.map(r => ({ key: r.key, status }));
  assert.equal(blockStatus(rows('pass')), 'pass'); assert.equal(blockStatus([]), 'invalid'); assert.equal(blockStatus(rows('pass').slice(1)), 'invalid');
  assert.equal(blockStatus([...rows('pass'), { key: ROWS[0].key, status: 'pass' }]), 'invalid');
  assert.equal(blockStatus([...rows('pass').slice(1), { key: ROWS[0].key, status: 'ref_failed' }]), 'invalid');
  assert.equal(blockStatus([...rows('pass').slice(2), { key: ROWS[0].key, status: 'failed_gate' }, { key: ROWS[1].key, status: 'failed_correctness' }]), 'failed_correctness');
  assert.equal(blockStatus([...rows('pass').slice(2), { key: ROWS[0].key, status: 'failed_gate' }, { key: ROWS[1].key, status: 'invalid' }]), 'failed_gate');
  assert.deepEqual(['pass', 'failed_correctness', 'failed_gate', 'invalid', 'error', 'incomplete'].map(exitCodeFor), [0, 3, 4, 5, 1, 1]);
  // preregistered inputs: exact size, no pipe, LF-substitute relationships
  assert.equal(SIZE, 10485760);
  const built = Object.fromEntries(Object.keys(INPUTS).map(id => [id, makeInput(id)]));
  for (const [id, text] of Object.entries(built)) { assert.equal(Buffer.byteLength(text, 'utf8'), SIZE, `${id} size`); assert(!text.includes('|'), `${id} has a pipe`); }
  assert.equal(INPUTS.F6.unit.length, 7); assert.equal(Math.floor(SIZE / 7), 1497965); assert.equal(SIZE % 7, 5);
  assert.equal(INPUTS.F7.unit.length, 184); assert.equal(Math.floor(SIZE / 184), 56987); assert.equal(SIZE % 184, 152);
  const loneCrToLf = s => s.replace(/\r(?!\n)/gu, '\n');
  for (const c of COMPARISONS) {
    if (c.gate === 'G-R') { assert.equal(c.ref, c.cand); assert(!/\r(?!\n)/u.test(built[c.cand]), `${c.id} has lone CR`); }
    else assert.equal(loneCrToLf(built[c.cand]), built[c.ref], `${c.id}: ref must be the lone-CR->LF substitute`);
  }
  assert.equal(built.F7.replaceAll('\r', '\n'), built.F7L);
  assert.deepEqual(ROWS.map(r => r.key), ['O1', 'O2'].flatMap(op => ['F3', 'F4', 'F5', 'F6L', 'F7L', 'F1', 'F2', 'F6', 'F7'].map(id => `${op}/${id}`)));
  for (const file of HARNESS_FILES) assert(existsSync(join(ROOT, file)), `${file} missing`);
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
const OOM_PATTERN = /FATAL ERROR[^\n]*heap|heap out of memory|Allocation failed/i;
function runChild(args, timeoutMs, exe = process.execPath) {
  return new Promise(done => {
    let child;
    try { child = spawn(exe, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { done({ status: 'spawn_error', message: String(error.message) }); return; }
    let stdout = '', stderr = '', timedOut = false, settled = false, sawOom = false;
    const started = Date.now();
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); done({ ...value, wallMs: Date.now() - started }); } };
    const timer = setTimeout(() => { timedOut = true; kill(child); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { const joined = stderr.slice(-400) + data; if (OOM_PATTERN.test(joined)) sawOom = true; stderr = (stderr + data).slice(-4000); });
    child.on('error', error => finish({ status: 'spawn_error', message: String(error.message) }));
    child.on('close', (exitCode, signal) => {
      const base = { exitCode, signal, stderrTail: stderr || undefined };
      if (timedOut) return finish({ ...base, status: 'timeout' });
      const lines = stdout.split('\n').filter(line => line.trim());
      if (exitCode !== 0) return finish({ ...base, status: sawOom ? 'oom' : 'abnormal_exit', stdoutTail: stdout.slice(-2000) || undefined });
      if (lines.length !== 1) return finish({ ...base, status: 'parse_error', message: `expected 1 JSON line, got ${lines.length}` });
      let payload;
      try { payload = JSON.parse(lines[0]); } catch (error) { return finish({ ...base, status: 'parse_error', message: String(error.message) }); }
      if (payload.status !== 'completed') return finish({ ...base, status: 'child_error', payload });
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
// BASE and CAND snapshots from git archive; npm ci --ignore-scripts + tsc only. A/A copies are byte
// copies of dist. dist/src/core/*.js may differ only in policy.js; lockfiles must be identical.
async function buildSnapshots(temp, head, logs) {
  const snapshots = {}, dirs = {};
  for (const [variant, ref] of [['base', BASE], ['candidate', head]]) {
    const snapshot = join(temp, variant); mkdirSync(snapshot);
    const archive = join(temp, `${variant}.tar`);
    command('git', ['archive', '--format=tar', ref, '-o', archive]);
    command(TAR, ['-xf', archive, '-C', snapshot]);
    await npm(['ci', '--ignore-scripts'], snapshot, join(logs, `${variant}-ci.log`));
    command(process.execPath, [join(snapshot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], snapshot);
    cpSync(join(snapshot, 'dist'), join(snapshot, 'dist-aa'), { recursive: true });
    const core = dir => Object.fromEntries(readdirSync(join(snapshot, dir, 'src/core')).filter(f => f.endsWith('.js')).sort().map(f => [f, hashFile(join(snapshot, dir, 'src/core', f))]));
    const dist = core('dist');
    assert.deepEqual(core('dist-aa'), dist, 'A/A copy differs');
    snapshots[variant] = { ref, policyBlobSha1: git(['rev-parse', `${ref}:src/core/policy.ts`]), lockfileSha256: hashFile(join(snapshot, 'package-lock.json')), distCoreSha256: dist };
    dirs[variant] = [join(snapshot, 'dist'), join(snapshot, 'dist-aa')];
  }
  assert.equal(snapshots.base.lockfileSha256, snapshots.candidate.lockfileSha256, 'lockfile differs between arms');
  assert.deepEqual(Object.keys(snapshots.base.distCoreSha256), Object.keys(snapshots.candidate.distCoreSha256));
  for (const file of Object.keys(snapshots.base.distCoreSha256)) {
    if (file === 'policy.js') assert.notEqual(snapshots.base.distCoreSha256[file], snapshots.candidate.distCoreSha256[file], 'policy.js must differ');
    else assert.equal(snapshots.base.distCoreSha256[file], snapshots.candidate.distCoreSha256[file], `${file} differs between arms`);
  }
  return { snapshots, modules: { B1: dirs.base[0], B2: dirs.base[1], C1: dirs.candidate[0], C2: dirs.candidate[1] } };
}

// ---------- block procedures ----------
function makeContext(temp) {
  let counter = 0;
  return {
    config: value => { const path = join(temp, `config-${counter++}.json`); writeFileSync(path, JSON.stringify(value)); return path; },
    workDir: () => join(temp, `work-${counter++}`),
  };
}
const childRecord = run => ({ status: run.status, exitCode: run.exitCode, signal: run.signal, wallMs: run.wallMs, stderrTail: run.stderrTail, message: run.message, error: run.payload?.error });

// One timing row: calibration child, then up to 3 attempt children. Returns the row entry.
async function timingRow(row, ctx, modules, options) {
  const entry = { key: row.key, op: row.op, gate: row.gate, cand: row.cand, ref: row.ref, attempts: [], status: 'incomplete' };
  const calibration = await runChild([join(ROOT, PERF_WORKER), ctx.config({ op: 'calibrate', modules: { B1: modules.B1, C1: modules.C1 }, row, size: options.size, workDir: ctx.workDir(), minSampleMs: P.minSampleMs, maxK: P.maxK, calibrationSamples: P.calibrationSamples })], P.timingChildTimeoutMs);
  entry.calibration = { child: childRecord(calibration), steps: calibration.payload?.steps, k: calibration.payload?.k };
  if (timingChildVerdict(calibration) !== 'completed') return { ...entry, status: 'invalid', reason: `calibration ${calibration.status}` };
  const lastStep = calibration.payload.steps.at(-1);
  if (lastStep.k !== calibration.payload.k || !calibrationDone(lastStep.base, lastStep.candidate)) return { ...entry, status: 'invalid', reason: 'calibration stop condition not met' };
  entry.k = calibration.payload.k;
  const SCHEDULE = schedule();
  for (let number = 1; number <= options.maxAttempts; number++) {
    const run = await runChild([join(ROOT, PERF_WORKER), ctx.config({ op: 'attempt', modules, row, size: options.size, workDir: ctx.workDir(), k: entry.k, schedule: SCHEDULE })], P.timingChildTimeoutMs);
    const attempt = { number, child: childRecord(run), samples: run.payload?.samples ?? [], digests: run.payload?.digests, views: run.payload?.views };
    entry.attempts.push(attempt);
    if (timingChildVerdict(run) !== 'completed') return { ...entry, status: 'invalid', reason: `attempt ${number} ${run.status}` };
    if (new Set(Object.values(run.payload.digests)).size !== 1 || Object.keys(run.payload.digests).length !== 4) {
      attempt.status = 'output_mismatch'; return { ...entry, status: 'failed_correctness', reason: 'public output differs between arms' };
    }
    try {
      assert.equal(attempt.samples.length, SCHEDULE.length);
      attempt.samples.forEach((s, i) => { assert.equal(s.label, SCHEDULE[i].label); assert.equal(s.arm, SCHEDULE[i].arm); });
      const values = arm => attempt.samples.filter(s => s.label.startsWith('measure/') && s.arm === arm).map(s => s.ms);
      attempt.stats = { B1: stats(values('B1')), B2: stats(values('B2')), C1: stats(values('C1')), C2: stats(values('C2')) };
    } catch (error) { attempt.status = 'invalid_samples'; return { ...entry, status: 'invalid', reason: `attempt ${number}: ${error.message}` }; }
    attempt.aa = { base: aaValid(attempt.stats.B1, attempt.stats.B2), candidate: aaValid(attempt.stats.C1, attempt.stats.C2) };
    attempt.gate = timeGate(attempt.stats[P.gateArms.reference], attempt.stats[P.gateArms.candidate]);
    attempt.ratioC1toB1Median = attempt.stats.C1.median / attempt.stats.B1.median;
    if (!attempt.aa.base.valid || !attempt.aa.candidate.valid) {
      attempt.status = 'invalid_aa';
      options.log(`${row.key} attempt ${number}: invalid A/A`);
      if (number === options.maxAttempts) return { ...entry, status: 'invalid', reason: `attempt ${number}: invalid A/A (final)` };
      await sleep(options.cooldownMs); continue;
    }
    attempt.status = 'valid'; entry.selectedAttempt = number;
    return { ...entry, status: attempt.gate.pass ? 'pass' : 'failed_gate', reason: attempt.gate.pass ? undefined : 'valid timing gate failed; no retry' };
  }
  return { ...entry, status: 'invalid', reason: 'no attempt' };
}

async function memoryRun(row, arm, repeat, ctx, modules, size) {
  const role = arm.startsWith('C') ? 'cand' : 'ref';
  const inputId = row[role];
  const run = await runChild(['--expose-gc', join(ROOT, MEM_WORKER), ctx.config({ module: modules[arm], op: row.op, inputId, size, workDir: ctx.workDir() })], P.memoryChildTimeoutMs);
  const p = run.payload ?? {};
  return { key: row.key, repeat, arm, inputId, ...childRecord(run), retainedBytes: p.retainedBytes, maxRssBytes: p.maxRssBytes, elapsedMs: p.elapsedMs,
    before: p.before, after: p.after, lineCount: p.lineCount, outputDigest: p.outputDigest, view: p.view };
}
function memoryRowsFrom(runs, rows) {
  return rows.map(row => {
    const pick = arm => runs.filter(r => r.key === row.key && r.arm === arm);
    return { key: row.key, op: row.op, gate: row.gate, cand: row.cand, ref: row.ref, ...memoryRow(pick('B1'), pick('C1')) };
  });
}

// ---------- self-check: fault injection + small synthetic end-to-end ----------
async function selfCheck(result, temp, head, logs, save) {
  const node = code => ['-e', code];
  const faults = [
    ['exit1', node('process.exit(1)'), 'abnormal_exit'],
    ['noOutput', node(''), 'parse_error'],
    ['twoLines', node('console.log("{}");console.log("{}")'), 'parse_error'],
    ['badJson', node('console.log("nope")'), 'parse_error'],
    ['errorStatus', node('console.log(JSON.stringify({status:"error",error:{name:"RangeError",message:"x"}}))'), 'child_error'],
    ['fakeOom', node('process.stderr.write("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n");process.exit(134)'), 'oom'],
    ['realOom', ['--max-old-space-size=16', '-e', 'const a=[];for(;;)a.push(new Array(1e5).fill(1))'], 'oom'],
    ['timeout', node('setTimeout(()=>{},60000)'), 'timeout', 2000],
  ];
  result.selfCheck = { faults: [] };
  for (const [name, args, expected, timeoutMs] of faults) {
    const run = await runChild(args, timeoutMs ?? 60000);
    result.selfCheck.faults.push({ name, expected, actual: run.status, exitCode: run.exitCode, timingVerdict: timingChildVerdict(run), exitCodeIfBlock: exitCodeFor(timingChildVerdict(run) === 'completed' ? 'pass' : 'invalid') });
  }
  const spawnFail = await runChild([], 5000, join(temp, 'missing-node.exe'));
  result.selfCheck.faults.push({ name: 'spawnError', expected: 'spawn_error', actual: spawnFail.status });
  save();
  for (const f of result.selfCheck.faults) assert.equal(f.actual, f.expected, `fault ${f.name}`);
  for (const f of result.selfCheck.faults.filter(f => f.timingVerdict !== undefined && f.actual !== 'completed')) assert.equal(f.exitCodeIfBlock, 5);
  // Small synthetic run through the real snapshot, worker and aggregation paths (not a gate).
  const { snapshots, modules } = await buildSnapshots(temp, head, logs);
  result.snapshots = snapshots; save();
  const ctx = makeContext(temp);
  const size = 64 * 1024;
  const pickRows = ['O1/F2', 'O1/F5', 'O1/F6', 'O2/F2', 'O2/F7'].map(key => ROWS.find(r => r.key === key));
  result.selfCheck.size = size;
  result.selfCheck.timing = [];
  for (const row of pickRows) {
    const entry = await timingRow(row, ctx, modules, { size, maxAttempts: 1, cooldownMs: 0, log: () => {} });
    result.selfCheck.timing.push({ ...entry, attempts: entry.attempts.map(a => ({ ...a, samples: a.samples.length })) });
    save();
  }
  result.selfCheck.memoryRuns = [];
  for (let repeat = 0; repeat < P.memoryRepeats; repeat++) for (const row of pickRows) for (const arm of repeat % 2 === 0 ? ['B1', 'C1'] : ['C1', 'B1']) {
    result.selfCheck.memoryRuns.push(await memoryRun(row, arm, repeat, ctx, modules, size)); save();
  }
  result.selfCheck.memoryRows = memoryRowsFrom(result.selfCheck.memoryRuns, pickRows);
  // Harness acceptance: every child completed, outputs matched, calibration and samples complete.
  // Gate verdicts at this tiny size are recorded only; they are not the preregistered gate.
  for (const t of result.selfCheck.timing) {
    assert(['pass', 'failed_gate', 'invalid'].includes(t.status), `${t.key} status ${t.status}`);
    assert.equal(t.calibration.child.status, 'completed', `${t.key} calibration`);
    const a = t.attempts[0];
    assert.equal(a.child.status, 'completed', `${t.key} attempt child`); assert.equal(a.samples, 144, `${t.key} samples`);
    assert.equal(new Set(Object.values(a.digests)).size, 1, `${t.key} digests`); assert(a.stats && a.stats.B1.n === 30, `${t.key} stats`);
  }
  for (const m of result.selfCheck.memoryRuns) assert.equal(m.status, 'completed', `${m.key} ${m.arm} memory child`);
  for (const r of result.selfCheck.memoryRows) assert(['pass', 'failed_gate'].includes(r.status), `${r.key} memory row ${r.status}`);
  return 'self_check_completed';
}

// ---------- main ----------
async function main() {
  checks();
  if (process.argv.includes('--check-only')) {
    console.log(JSON.stringify({ status: 'PASS', timedCalls: 0, checks: 'statistics, gates, schedule, schedule controls, calibration, classification, aggregation, inputs', circuits: P.circuits, schedule: scheduleFacts(schedule()),
      controls: Object.fromEntries(Object.entries(SCHEDULE_CONTROLS).map(([name, circuits]) => [name, { circuits, violations: scheduleViolations(schedule(circuits)) }])) }));
    return;
  }
  const SELF = process.argv.includes('--self-check');
  const BLOCK = SELF ? 'selfcheck' : process.argv.find(arg => arg.startsWith('--block='))?.slice(8);
  assert(SELF || ['timing', 'memory', 'info'].includes(BLOCK), '--block=timing|memory|info or --self-check is required');
  assert.equal(process.platform, 'win32', 'validated platform is Windows');
  assert.equal(process.version, 'v24.18.0');
  const outputArg = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
  assert(outputArg, '--output is required');
  const OUTPUT = resolve(ROOT, outputArg);
  assert.equal(dirname(OUTPUT), join(ROOT, RESULTS_DIR));
  if (SELF) assert(/^selfcheck-[a-z0-9-]+\.json$/.test(basename(OUTPUT)), 'self-check output must be selfcheck-<name>.json');
  else { assert(/^perf-[a-z0-9]+-(timing|memory|info)\.json$/.test(basename(OUTPUT))); assert(basename(OUTPUT).endsWith(`-${BLOCK}.json`), 'output name must end with -<block>.json'); }
  assert(!existsSync(OUTPUT), 'refusing to overwrite previous evidence');
  assert.equal(git(['status', '--porcelain']), '', 'commit preregistration and implementation before running');
  const head = git(['rev-parse', 'HEAD']);
  let prereg = null;
  if (!SELF) {
    const preregArg = process.argv.find(arg => arg.startsWith('--prereg='))?.slice(9);
    assert(preregArg, '--prereg=<committed-sha> is required');
    prereg = git(['rev-parse', preregArg]);
    git(['merge-base', '--is-ancestor', prereg, head]);
    git(['diff', '--exit-code', prereg, head, '--', ...HARNESS_FILES, 'src']);
    assert.equal(prereg, git(['log', '-1', '--format=%H', head, '--', ...HARNESS_FILES]), '--prereg must be the last commit that touched the harness or protocol');
  }
  if (BLOCK === 'info') {
    const run = basename(OUTPUT).replace(/-info\.json$/, '');
    for (const block of ['timing', 'memory']) {
      const file = join(ROOT, RESULTS_DIR, `${run}-${block}.json`);
      assert(existsSync(file), `informational block runs only after ${block} (${basename(file)})`);
      assert.equal(JSON.parse(readFileSync(file, 'utf8')).status, 'pass', `informational block runs only after a passing ${block} block`);
    }
  }
  mkdirSync(dirname(OUTPUT), { recursive: true });
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const before = tracked.map(file => ({ file, hash: existsSync(join(ROOT, file)) ? hashFile(join(ROOT, file)) : null }));
  const temp = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  const logs = join(temp, 'logs'); mkdirSync(logs);
  const result = { schema: SCHEMA, block: BLOCK, status: 'incomplete', startedAt: new Date().toISOString(), preregistrationCommit: prereg, measurementHead: head, base: BASE,
    protocol: P, inputs: Object.fromEntries(Object.entries(INPUTS).map(([id, spec]) => [id, { kind: spec.kind, unitBytes: spec.unit.length, count: Math.floor(SIZE / spec.unit.length), padBytes: SIZE % spec.unit.length, sha256: digest(makeInput(id)) }])),
    files: Object.fromEntries([...HARNESS_FILES, 'src/core/policy.ts', 'package-lock.json'].map(file => [file, { blobSha1: git(['rev-parse', `HEAD:${file}`]), workingCopySha256: hashFile(join(ROOT, file)) }])),
    environment: environment(), schedule: scheduleFacts(schedule()), snapshots: {}, rows: [], runs: [] };
  const normalized = value => JSON.parse(JSON.stringify(value).replaceAll(temp.replaceAll('\\', '\\\\'), '<temp>').replaceAll(ROOT.replaceAll('\\', '\\\\'), '<repo>'));
  const save = () => writeFileSync(OUTPUT, JSON.stringify(normalized(result), null, 2) + '\n');
  const log = message => console.log(message);
  let failure;
  try {
    save();
    if (SELF) {
      result.status = await selfCheck(result, temp, head, logs, save);
    } else {
      const { snapshots, modules } = await buildSnapshots(temp, head, logs);
      result.snapshots = snapshots; save();
      const ctx = makeContext(temp);
      if (BLOCK === 'timing') {
        // Section 8.4. Stop at the first row that is not a pass (valid FAIL: no retry, no relaxation).
        for (const row of ROWS) {
          const entry = await timingRow(row, ctx, modules, { size: SIZE, maxAttempts: P.maxAttempts, cooldownMs: P.cooldownMs, log });
          result.rows.push(entry); save();
          const sel = entry.attempts.find(a => a.number === entry.selectedAttempt);
          log(JSON.stringify({ key: entry.key, k: entry.k, status: entry.status, reason: entry.reason, reference: sel?.stats?.B1, candidate: sel?.stats?.C1 }));
          if (entry.status !== 'pass') break;
        }
        result.status = blockStatus(result.rows);
      } else if (BLOCK === 'memory') {
        // Section 8.5. One child at a time; even repeats BASE->CAND, odd repeats CAND->BASE.
        for (let repeat = 0; repeat < P.memoryRepeats; repeat++) for (const row of ROWS) for (const arm of repeat % 2 === 0 ? ['B1', 'C1'] : ['C1', 'B1']) {
          const run = await memoryRun(row, arm, repeat, ctx, modules, SIZE);
          result.runs.push(run); save();
          log(JSON.stringify({ key: run.key, repeat, arm, status: run.status, R: run.retainedBytes, P: run.maxRssBytes }));
        }
        result.rows = memoryRowsFrom(result.runs, ROWS);
        result.status = blockStatus(result.rows);
        result.refFailedRows = result.rows.filter(r => r.status === 'ref_failed').map(r => r.key);
      } else {
        // Informational only (never gate-bearing): CAND(X) vs BASE(X) on the G-C inputs, one attempt.
        const infoRows = ROWS.filter(r => r.gate === 'G-C').map(r => ({ ...r, ref: r.cand, key: `${r.key}:same-input` }));
        for (const row of infoRows) {
          const entry = await timingRow(row, ctx, modules, { size: SIZE, maxAttempts: 1, cooldownMs: 0, log });
          const a = entry.attempts[0];
          result.rows.push({ key: row.key, k: entry.k, child: a?.child ?? entry.calibration?.child, stats: a?.stats, aa: a?.aa, ratioC1toB1Median: a?.ratioC1toB1Median, informationalStatus: entry.status, reason: entry.reason });
          save();
        }
        result.status = result.rows.every(r => r.child?.status === 'completed') ? 'completed_informational' : 'error';
      }
    }
    if (!['pass', 'completed_informational', 'self_check_completed'].includes(result.status)) failure = new Error(`block status ${result.status}`);
  } catch (error) {
    failure = error; result.status = 'error'; result.error = String(error.stack ?? error.message);
  } finally {
    const finalize = action => { try { action(); } catch (error) {
      failure ||= error; if (['pass', 'incomplete', 'completed_informational', 'self_check_completed'].includes(result.status)) result.status = 'error';
      (result.finalizationErrors ??= []).push(String(error.message));
    } };
    finalize(() => { result.finalEnvironment = environment(); assert.deepEqual(result.finalEnvironment, result.environment); });
    finalize(() => {
      const changed = before.filter(row => row.hash !== (existsSync(join(ROOT, row.file)) ? hashFile(join(ROOT, row.file)) : null));
      result.preservation = { trackedFiles: before.length, changed: changed.map(row => row.file) }; assert.equal(changed.length, 0);
    });
    finalize(() => {
      const actual = realpathSync(temp);
      assert.equal(dirname(actual).toLowerCase(), realpathSync(tmpdir()).toLowerCase()); assert(basename(actual).startsWith(TEMP_PREFIX));
      rmSync(actual, { recursive: true, force: true }); result.tempCleanup = !existsSync(actual);
    });
    result.finishedAt = new Date().toISOString(); result.exitCode = failure ? exitCodeFor(result.status) : 0; save();
  }
  console.log(JSON.stringify({ block: BLOCK, status: result.status, exitCode: result.exitCode, output: OUTPUT }));
  process.exitCode = result.exitCode;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
