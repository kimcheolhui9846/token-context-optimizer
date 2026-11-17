// P10 harness tests (node:test). Offline: no product timing, no 10 MiB measurement.
// Run: node --test research/test/n34-p10-perf.test.mjs
// Covers the contract helper (budget, raw stages, verdicts, dispositions, ownership, copy guard,
// raw-only commit chain, receipts) and the real runner orchestration with a fake clock, fake
// processes and a fake git, plus one small real process-tree kill fixture.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as C from '../src/n34-p10-perf-contract.mjs';
import * as R from '../src/n34-p10-perf.mjs';
import { ROWS } from '../src/n34-cr-policy-perf-inputs.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TAB = String.fromCharCode(9);
const MIB = 1024 * 1024;
const S = C.P10.steps;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const without = (object, key) => { const copy = { ...object }; delete copy[key]; return copy; };

// ---------- A. budget ----------
test('budget: request example, reserve subtracted once', () => {
  let t = 0;
  const b = C.createBudget({ capMs: 3_600_000, reserveMs: 600_000, now: () => t });
  t = 600_000;
  assert.equal(b.remainingWorkMs(), 2_400_000);
  assert.equal(b.remainingTotalMs(), 3_000_000);
  t = 3_000_000; assert.equal(b.remainingWorkMs(), 0); assert.equal(b.remainingTotalMs(), 600_000);
  t = 4_000_000; assert.equal(b.remainingWorkMs(), 0); assert.equal(b.remainingTotalMs(), 0);
});

test('budget: preregistered constants', () => {
  assert.deepEqual(C.P10.steps, { cmd: 600_000, cal: 1_800_000, att: 1_800_000, cool: 30_000, mem: 600_000, kill: 10_000 });
  assert.deepEqual(C.P10.capMs, { timing: 36_000_000, memory: 3_600_000, info: 14_400_000 });
  assert.equal(C.P10.reserveMs, 600_000);
  assert.deepEqual(C.NEEDS, { row: S.cal + S.att, attempt: S.att, retry: S.cool + S.att, memoryChild: S.mem });
  assert.deepEqual(C.P10.blocks, ['timing', 'memory', 'info']);
  assert.equal(C.officialOutput('timing'), 'research/results/n34-p10/perf-p10run1-timing.json');
});

test('budget: entry boundaries (exact passes, 1 ms short fails) and no new command at 0', () => {
  const cap = 10 * 3_600_000, reserve = 600_000;
  for (const need of Object.values(C.NEEDS)) {
    let t = 0;
    const b = C.createBudget({ capMs: cap, reserveMs: reserve, now: () => t });
    t = cap - reserve - need; assert.equal(b.canStart(need), true, `exact ${need}`);
    t += 1; assert.equal(b.canStart(need), false, `1 ms short ${need}`);
  }
  let t = 0;
  const b = C.createBudget({ capMs: 1000, reserveMs: 100, now: () => t });
  t = 900;
  let started = 0;
  assert.throws(() => C.runBudgeted(b, S.cmd, () => { started++; }, 'git'), C.BudgetExpired);
  assert.equal(started, 0, 'no command starts with remainingWork 0');
});

test('budget: timeout cause (m-1): strict < is budget-limited, equality is the individual cap', () => {
  let t = 0;
  const b = C.createBudget({ capMs: 2000, reserveMs: 0, now: () => t });
  t = 1000;
  assert.deepEqual(b.workTimeout(1000, 'x'), { ms: 1000, budgetLimited: false });
  assert.deepEqual(b.workTimeout(1001, 'x'), { ms: 1000, budgetLimited: true });
  const timeoutError = Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' });
  assert.throws(() => C.runBudgeted(b, 5000, () => { throw timeoutError; }, 'tsc'), C.BudgetExpired, 'budget-limited timeout');
  assert.throws(() => C.runBudgeted(b, 1000, () => { throw timeoutError; }, 'tsc'), error => !(error instanceof C.BudgetExpired) && error.code === 'ETIMEDOUT', 'individual cap timeout stays an error');
  assert.throws(() => C.runBudgeted(b, 5000, () => { throw new Error('exit 2'); }, 'tsc'), error => !(error instanceof C.BudgetExpired), 'other failure stays an error');
  t = 1990; assert.deepEqual(b.finalTimeout(S.kill), { ms: 10, budgetLimited: true });
  t = 2000; assert.equal(b.finalTimeout(S.kill), null, 'nothing left: no zero (= unlimited) timeout');
});

test('budget: overrun record separates work, finalization and cap', () => {
  let t = 0;
  const b = C.createBudget({ capMs: 10_000, reserveMs: 1_000, now: () => t });
  assert.deepEqual(C.budgetRecord(b, { workEndMs: 9_500, finalStartMs: 9_500, finalEndMs: 9_900 }).capOverrunMs, 0);
  const r1 = C.budgetRecord(b, { workEndMs: 9_500, finalStartMs: 9_500, finalEndMs: 9_900 });
  assert.deepEqual([r1.workOverrunMs, r1.finalizationMs, r1.finalizationOverReserveMs, r1.capOverrunMs], [500, 400, 0, 0]);
  const r2 = C.budgetRecord(b, { workEndMs: 8_000, finalStartMs: 8_000, finalEndMs: 9_500 });
  assert.deepEqual([r2.workOverrunMs, r2.finalizationOverReserveMs, r2.capOverrunMs], [0, 500, 0]);
  const r3 = C.budgetRecord(b, { workEndMs: 9_000, finalStartMs: 9_000, finalEndMs: 10_250 });
  assert.equal(r3.capOverrunMs, 250);
});

// ---------- B. raw stages and verdicts ----------
const child = (status = 'completed') => ({ status, exitCode: status === 'completed' ? 0 : 1, signal: null, wallMs: 1, startedAt: 't0', finishedAt: 't1', nodeArgs: [], pid: 4242 });
const samples = () => R.schedule().map((s, order) => ({ order, label: s.label, arm: s.arm, ms: 1 }));
const four = value => ({ B1: value, B2: value, C1: value, C2: value });
const attemptAt = (stage, number = 1) => {
  const base = { number, child: child() };
  if (stage === 'child_failed') return { number, child: child('timeout'), samples: [] };
  const done = { ...base, samples: samples(), digests: four('d'), views: four({}) };
  if (stage === 'output_mismatch') return { ...done, digests: { ...four('d'), C2: 'e' }, status: 'output_mismatch' };
  if (stage === 'invalid_samples') return { ...done, samples: samples().slice(1), status: 'invalid_samples' };
  const derived = { ...done, stats: four({ n: 30, median: 1, p95: 1 }), aa: { base: { valid: stage !== 'invalid_aa' }, candidate: { valid: true } }, gate: { pass: stage !== 'valid_fail' }, ratioC1toB1Median: 1 };
  if (stage === 'invalid_aa') return { ...derived, status: 'invalid_aa' };
  return { ...derived, status: 'valid' };
};
const infoEntry = stage => {
  const row = { key: 'O1/F1:same-input', op: 'O1', gate: 'G-C', cand: 'F1', ref: 'F1', informational: true, attempts: [] };
  if (stage === 'calibration_failed') return { ...row, calibration: { child: child('timeout') }, status: 'invalid', reason: 'calibration timeout' };
  const calibration = { child: child(), steps: [{ k: 1, base: [60, 60, 60, 60, 60], candidate: [60, 60, 60, 60, 60] }], k: 1 };
  if (stage === 'calibration_unmet') return { ...row, calibration, status: 'invalid', reason: 'calibration stop condition not met' };
  const a = attemptAt(stage);
  const status = { child_failed: 'invalid', output_mismatch: 'failed_correctness', invalid_samples: 'invalid', invalid_aa: 'invalid', valid: 'pass', valid_fail: 'failed_gate' }[stage];
  return { ...row, calibration, k: 1, attempts: [a], status, ...(a.status === 'valid' ? { selectedAttempt: 1 } : {}) };
};
const STAGES = { calibration_failed: 'I(run)', calibration_unmet: 'I(run)', child_failed: 'I(run)', output_mismatch: 'C', invalid_samples: 'I(raw)', invalid_aa: 'I(aa)', valid: 'V', valid_fail: 'X' };

test('raw stages: every stage is complete with its allowed absences', () => {
  for (const [stage, verdict] of Object.entries(STAGES)) {
    const entry = infoEntry(stage);
    assert.deepEqual(C.timingRawViolations(entry), [], `${stage} complete`);
    assert.equal(C.infoVerdict(entry), verdict, `${stage} verdict`);
  }
  assert.equal(C.infoVerdict({ key: 'O1/F1:same-input', status: 'notRun', reason: 'budget', attempts: [] }), 'N');
});

test('raw stages: removing a required field is recorded; only V becomes I(raw)', () => {
  const removals = {
    calibration_unmet: e => ({ ...e, calibration: without(e.calibration, 'steps') }),
    child_failed: e => ({ ...e, attempts: [{ ...e.attempts[0], child: without(e.attempts[0].child, 'pid') }] }),
    output_mismatch: e => ({ ...e, attempts: [without(e.attempts[0], 'views')] }),
    invalid_samples: e => ({ ...e, attempts: [without(e.attempts[0], 'digests')] }),
    invalid_aa: e => ({ ...e, attempts: [without(e.attempts[0], 'stats')] }),
    valid_fail: e => ({ ...e, attempts: [without(e.attempts[0], 'gate')] }),
    valid: e => ({ ...e, attempts: [{ ...e.attempts[0], samples: e.attempts[0].samples.slice(1) }] }),
  };
  for (const [stage, remove] of Object.entries(removals)) {
    const row = C.finalizeInfoRow(remove(infoEntry(stage)));
    assert.equal(row.rawComplete, false, `${stage}: gap recorded`);
    assert(row.rawViolations.length > 0, `${stage}: violations listed`);
    const expected = stage === 'valid' ? 'I(raw)' : STAGES[stage];
    assert.equal(row.verdict, expected, `${stage}: verdict ${expected}`);
  }
  const noSelected = C.finalizeInfoRow(without(infoEntry('valid'), 'selectedAttempt'));
  assert.equal(noSelected.verdict, 'I(raw)', 'valid attempt without selectedAttempt');
  assert.deepEqual(C.timingRawViolations({ ...infoEntry('invalid_aa'), selectedAttempt: 1 }).includes('selectedAttempt'), true, 'selectedAttempt only for a valid attempt');
});

test('raw stages: mandatory applyRawCheck turns only a would-be pass into invalid', () => {
  const pass = { ...infoEntry('valid'), key: 'O1/F1', status: 'pass' };
  const gap = e => ({ ...e, attempts: [without(e.attempts[0], 'views')] });
  let r = C.applyRawCheck(gap(pass), C.timingRawViolations(gap(pass)));
  assert.deepEqual([r.status, r.statusBeforeRaw, r.rawComplete], ['invalid', 'pass', false]);
  const fg = { ...infoEntry('valid_fail'), key: 'O1/F1', status: 'failed_gate', reason: 'valid timing gate failed; no retry' };
  r = C.applyRawCheck(gap(fg), C.timingRawViolations(gap(fg)));
  assert.deepEqual([r.status, r.reason, r.rawComplete], ['failed_gate', 'valid timing gate failed; no retry', false]);
});

test('n-1: run3 info rule accepts child-completed invalid rows; P10 does not', () => {
  for (const stage of ['calibration_unmet', 'invalid_samples']) {
    const entry = infoEntry(stage);
    const a = entry.attempts[0];
    const run3Child = a?.child ?? entry.calibration?.child;
    assert.equal(run3Child.status, 'completed', `${stage}: run3 sees a completed child`);
    const rows = C.INFO_KEYS.map(key => C.finalizeInfoRow({ ...infoEntry('valid'), key }));
    rows[2] = C.finalizeInfoRow({ ...entry, key: C.INFO_KEYS[2] });
    assert.equal(C.infoBlockStatus({ rows }), 'error', `${stage}: P10 block is error`);
  }
});

// ---------- J3/J4 dispositions ----------
const infoRows = (change = {}) => C.INFO_KEYS.map(key => C.finalizeInfoRow({ ...infoEntry(change[key] ?? 'valid'), key }));
const verdicts = rows => Object.fromEntries(rows.map(r => [r.key, r.verdict]));
const dispose = (rows, { j2Pass = true, finalizationFailed = false, integrityErrors = [] } = {}) => {
  const status = C.infoBlockStatus({ rows, finalizationFailed });
  const integrity = C.infoIntegrity({ rows, integrityErrors });
  return { status, exitCode: C.exitCodeFor(status), disposition: C.disposition({ j2Pass, info: { status, integrityFailure: integrity.failure, verdicts: verdicts(rows) } }) };
};
const NON_F1 = 'O1/F2:same-input', F1A = 'O1/F1:same-input', F1B = 'O2/F1:same-input';

test('dispositions: plan 8.4 R1 matrix', () => {
  assert.deepEqual(C.INFO_KEYS, ['O1/F1', 'O1/F2', 'O1/F6', 'O1/F7', 'O2/F1', 'O2/F2', 'O2/F6', 'O2/F7'].map(k => `${k}:same-input`));
  assert.deepEqual(dispose(infoRows()), { status: 'completed_informational', exitCode: 0, disposition: 'D-0' });
  assert.deepEqual(dispose(infoRows({ [NON_F1]: 'valid_fail' })), { status: 'completed_informational', exitCode: 0, disposition: 'D-0' });
  assert.deepEqual(dispose(infoRows({ [NON_F1]: 'invalid_aa' })), { status: 'completed_informational', exitCode: 0, disposition: 'D-0' });
  for (const stage of ['calibration_failed', 'invalid_samples']) assert.deepEqual(dispose(infoRows({ [NON_F1]: stage })), { status: 'error', exitCode: 1, disposition: 'D-2' }, stage);
  const notRun = infoRows(); notRun[1] = C.finalizeInfoRow({ key: NON_F1, status: 'notRun', reason: 'budget', attempts: [] });
  assert.deepEqual(dispose(notRun), { status: 'error', exitCode: 1, disposition: 'D-2' }, 'N');
  const gap = infoRows(); gap[3] = { ...gap[3], rawComplete: false };
  assert.deepEqual(dispose(gap).disposition, 'D-2', 'rawComplete false');
  assert.deepEqual(dispose(infoRows({ [NON_F1]: 'output_mismatch' })), { status: 'completed_informational', exitCode: 0, disposition: 'D-4' });
  assert.equal(dispose(infoRows({ [F1A]: 'output_mismatch' })).disposition, 'D-4');
  assert.deepEqual(dispose(infoRows({ [F1B]: 'invalid_aa' })), { status: 'completed_informational', exitCode: 0, disposition: 'D-2' });
  assert.deepEqual(dispose(infoRows({ [F1A]: 'valid_fail' })), { status: 'completed_informational', exitCode: 0, disposition: 'D-1' });
  assert.deepEqual(dispose(infoRows(), { finalizationFailed: true, integrityErrors: ['environment_changed'] }), { status: 'error', exitCode: 1, disposition: 'D-4' });
  assert.deepEqual(dispose(infoRows(), { finalizationFailed: true }), { status: 'error', exitCode: 1, disposition: 'D-2' }, 'temp cleanup failure');
  assert.equal(dispose(infoRows(), { j2Pass: false }).disposition, 'D-3');
  assert.equal(C.disposition({ j2Pass: false, info: null }), 'D-3', 'J2 not established keeps D-3 (m-3)');
  assert.equal(C.disposition({ j2Pass: true, info: { status: 'incomplete', integrityFailure: false, verdicts: {} } }), 'D-2', 'parent abort of info');
});

test('mandatory block priority (plan 6.3) and exit codes', () => {
  const keys = ROWS.map(r => r.key);
  const rows = status => keys.map(key => ({ key, status }));
  const st = (rs, extra = {}) => C.mandatoryBlockStatus({ rows: rs, expectedKeys: keys, ...extra });
  assert.equal(st(rows('pass')), 'pass');
  const set = (rs, i, status) => rs.map((r, j) => (j === i ? { ...r, status } : r));
  assert.equal(st(set(rows('pass'), 4, 'ref_failed')), 'invalid');
  assert.equal(st(set(set(rows('pass'), 4, 'ref_failed'), 6, 'failed_gate')), 'failed_gate');
  assert.equal(st(set(set(rows('pass'), 4, 'ref_failed'), 6, 'failed_correctness')), 'failed_correctness');
  assert.equal(st(set(set(rows('pass'), 2, 'failed_gate'), 9, 'notRun')), 'failed_gate', 'budget notRun does not hide an earlier failed_gate');
  assert.equal(st(set(set(rows('pass'), 2, 'failed_correctness'), 9, 'notRun')), 'failed_correctness');
  assert.equal(st(set(rows('pass'), 9, 'notRun')), 'invalid');
  assert.equal(st(rows('pass').slice(0, 5), { bodyError: true }), 'error');
  assert.equal(st([...rows('pass').slice(0, 5), { key: keys[5], status: 'failed_gate' }], { bodyError: true }), 'failed_gate');
  assert.equal(st(rows('pass'), { finalizationFailed: true }), 'error');
  assert.equal(st(set(rows('pass'), 1, 'failed_gate'), { finalizationFailed: true }), 'failed_gate');
  assert.equal(st(rows('pass').slice(1)), 'invalid');
  assert.deepEqual(['pass', 'completed_informational', 'self_check_completed', 'failed_correctness', 'failed_gate', 'invalid', 'error', 'incomplete'].map(C.exitCodeFor), [0, 0, 0, 3, 4, 5, 1, 1]);
});

test('m-2 memory: a complete row keeps its CAND OOM failure; an incomplete row is missing_runs', () => {
  const ok = (key, repeat, arm) => ({ key, repeat, arm, inputId: 'F3', ...child(), retainedBytes: MIB, maxRssBytes: 100 * MIB, elapsedMs: 1, before: {}, after: {}, outputDigest: 'x', view: {} });
  const oom = r => ({ ...r, status: 'oom', retainedBytes: undefined, maxRssBytes: undefined, outputDigest: undefined, view: undefined });
  const runs = [];
  for (let repeat = 0; repeat < 3; repeat++) for (const row of ROWS) for (const arm of ['B1', 'C1']) {
    if (repeat === 2 && ROWS.indexOf(row) >= 9) continue; // budget ran out in repeat 2 at row 9
    runs.push(ok(row.key, repeat, arm));
  }
  const at = (key, repeat, arm, f) => runs.forEach((r, i) => { if (r.key === key && r.repeat === repeat && r.arm === arm) runs[i] = f(r); });
  at(ROWS[1].key, 0, 'C1', oom); // complete row
  at(ROWS[12].key, 0, 'C1', oom); // incomplete row
  const out = R.memoryOutcome(runs);
  const row = key => out.rows.find(r => r.key === key);
  assert.equal(row(ROWS[1].key).status, 'failed_gate');
  assert.deepEqual([row(ROWS[12].key).status, row(ROWS[12].key).reason], ['invalid', 'missing_runs']);
  assert.equal(out.status, 'failed_gate');
  assert.equal(C.exitCodeFor(out.status), 4);
  assert(runs.some(r => r.key === ROWS[12].key && r.status === 'oom'), 'OOM raw kept');
});

// ---------- ownership (M-2) ----------
class FakeChild extends EventEmitter {
  constructor(pid) { super(); this.pid = pid; this.exitCode = null; this.signalCode = null; this.killed = 0; }
  kill() { this.killed++; return true; }
}
test('ownership: no kill for unowned, bad pid, spawn error, exit/signal codes, exit or close seen', () => {
  const calls = [];
  const exec = (...args) => { calls.push(args); return ''; };
  const own = C.createOwnership({ execFileSync: exec });
  const cases = [];
  cases.push(['unregistered', new FakeChild(10)]);
  const bad = new FakeChild(-1); assert.equal(own.register(bad, {}), null, 'bad pid not registered'); cases.push(['bad pid', bad]);
  const spawnErr = new FakeChild(11); own.register(spawnErr, {}); spawnErr.emit('error', new Error('x')); cases.push(['spawn error', spawnErr]);
  const exitCode = new FakeChild(12); own.register(exitCode, {}); exitCode.exitCode = 0; cases.push(['exitCode', exitCode]);
  const signal = new FakeChild(13); own.register(signal, {}); signal.signalCode = 'SIGTERM'; cases.push(['signalCode', signal]);
  const exited = new FakeChild(14); own.register(exited, {}); exited.emit('exit', 0, null); cases.push(['exit seen', exited]);
  const closed = new FakeChild(15); own.register(closed, {}); closed.emit('close', 0, null); cases.push(['close seen', closed]);
  for (const [name, c] of cases) { assert.equal(own.kill(c, 1000), false, name); assert.equal(c.killed, 0, name); }
  assert.equal(calls.length, 0, 'no taskkill at all');
  const restored = { pid: 16, exitCode: null, signalCode: null };
  assert.equal(own.kill(restored, 1000), false, 'a pid restored from a file is never killed');
  const live = new FakeChild(17); own.register(live, {});
  assert.equal(own.kill(live, 0), false, 'no zero timeout');
  assert.equal(own.kill(live, 1000), true);
  assert.deepEqual(calls, [['taskkill', ['/PID', '17', '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 1000 }]]);
  assert.deepEqual(own.leftovers().sort(), [11, 12, 13, 14, 17].sort(), 'only close ends ownership');
});

test('ownership: taskkill failure falls back to child.kill only while still owned and live', () => {
  const own = C.createOwnership({ execFileSync: () => { throw new Error('taskkill failed'); } });
  const live = new FakeChild(21); own.register(live, {});
  assert.equal(own.kill(live, 500), true);
  assert.equal(live.killed, 1);
  const rec = own.record(live);
  assert.deepEqual(rec.kills.map(k => [k.method, k.ok]), [['taskkill', false], ['child.kill', true]]);
});

test('ownership: real root + grandchild timeout fixture is killed and closed', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tco-p10-test-'));
  try {
    const pidFile = join(dir, 'grandchild.pid');
    const code = `const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], { windowsHide: true, stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid)); setTimeout(()=>{}, 60000);`;
    R.setRuntime({});
    const started = Date.now();
    const run = await R.runChild(['-e', code], 3000);
    assert.equal(run.status, 'timeout');
    assert(Date.now() - started < 30_000);
    assert.equal(run.closeObserved, true, 'root close observed');
    assert(Number.isSafeInteger(run.pid) && run.pid > 0);
    assert.equal(run.kills[0].method, 'taskkill'); assert.equal(run.kills[0].ok, true);
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    let alive = true;
    for (let i = 0; i < 50 && alive; i++) { try { process.kill(grandchild, 0); await new Promise(r => setTimeout(r, 100)); } catch { alive = false; } }
    assert.equal(alive, false, 'grandchild ended with the tree kill');
    assert.deepEqual(R.ownershipLeftovers(), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- copy guard (M-1) ----------
test('copy guard: runner matches the pinned run3 delta; negative controls fail', () => {
  const run3 = readFileSync(join(REPO, 'research/src/n34-cr-policy-perf.mjs'), 'utf8');
  const self = readFileSync(join(REPO, 'research/src/n34-p10-perf.mjs'), 'utf8');
  const guard = R.copyGuard();
  assert.deepEqual(guard.violations, [], 'actual runner');
  const lines = self.replaceAll('\r\n', '\n').split('\n');
  const unmarked = [...lines.slice(0, 30), 'const sneaky = 1;', ...lines.slice(30)].join('\n');
  assert(R.copyGuard({ selfText: unmarked }).violations.some(v => v.startsWith('unmarked')), 'unmarked added line');
  const keep = 'function aaValid(reference, second) {';
  assert(lines.includes(keep));
  const dropped = lines.filter(l => l !== '  const ratio = second.median / reference.median;').join('\n');
  assert(R.copyGuard({ selfText: dropped }).violations.includes('removed_lines_changed'), 'removed run3 line');
  assert(R.copyGuard({ run3Text: run3 + '\n// changed\n' }).violations.includes('run3_source_changed'), 'run3 source changed');
});

// ---------- C. raw-only commit chain (temp git repo) ----------
const gitIn = dir => (args, opts = {}) => execFileSync('git', ['-c', 'user.name=p10-fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args], { cwd: dir, windowsHide: true, encoding: opts.encoding ?? 'utf8' });
function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'tco-p10-git-'));
  const g = gitIn(dir);
  g(['init', '-q', '-b', 'fixture']);
  mkdirSync(join(dir, 'research/results/n34-p10'), { recursive: true });
  writeFileSync(join(dir, 'harness.mjs'), 'x\n');
  g(['add', '.']); g(['commit', '-q', '-m', 'prereg']);
  return { dir, g, head: () => g(['rev-parse', 'HEAD']).trim() };
}
const commitRaw = (repo, block, { content, receipt, extraFile, message } = {}) => {
  const path = C.officialOutput(block);
  const text = content ?? JSON.stringify({ block, status: 'pass' }) + '\n';
  writeFileSync(join(repo.dir, path), text);
  if (extraFile) writeFileSync(join(repo.dir, extraFile), 'y\n');
  repo.g(['add', '.']);
  const r = receipt ?? { receipt: 'p10', run: 'p10run1', block, output: path, sha256: sha256(text), status: 'pass', exitCode: 0, elapsedMs: 1, capMs: C.P10.capMs[block], capOverrunMs: 0 };
  repo.g(['commit', '-q', '-m', message ?? `research(n34-p10): ${block} raw\n\n${C.formatReceipt(r)}\n\nAgent: claude-code`]);
  return repo.head();
};
const verify = (repo, from, to, block) => C.verifyRawOnlyCommit({
  git: args => repo.g(args).trim(), readBlob: (commit, path) => repo.g(['cat-file', 'blob', `${commit}:${path}`], { encoding: 'buffer' }), from, to, path: C.officialOutput(block), block });

test('raw chain: exact Ht -> Hm and Hm -> Hi raw-only commits pass', () => {
  const repo = fixtureRepo();
  try {
    const ht = repo.head();
    const hm = commitRaw(repo, 'timing');
    assert.deepEqual(verify(repo, ht, hm, 'timing').reasons, []);
    const hi = commitRaw(repo, 'memory');
    assert.deepEqual(verify(repo, hm, hi, 'memory').reasons, []);
  } finally { rmSync(repo.dir, { recursive: true, force: true }); }
});

test('raw chain: every deviation is refused', () => {
  const cases = {
    modify: repo => { const hm = commitRaw(repo, 'timing'); writeFileSync(join(repo.dir, C.officialOutput('timing')), '{}\n'); repo.g(['commit', '-qam', 'edit']); return [hm, repo.head(), 'memory']; },
    extraCommit: repo => { const ht = repo.head(); commitRaw(repo, 'timing'); writeFileSync(join(repo.dir, 'doc.md'), 'd\n'); repo.g(['add', '.']); repo.g(['commit', '-q', '-m', 'docs']); return [ht, repo.head(), 'timing']; },
    otherFileInRaw: repo => { const ht = repo.head(); return [ht, commitRaw(repo, 'timing', { extraFile: 'harness.mjs' }), 'timing']; },
    otherRun: repo => { const ht = repo.head(); const p = 'research/results/n34-p10/perf-p10run2-timing.json'; writeFileSync(join(repo.dir, p), '{}\n'); repo.g(['add', '.']); repo.g(['commit', '-q', '-m', 'x']); return [ht, repo.head(), 'timing']; },
    deleteRaw: repo => { commitRaw(repo, 'timing'); const hm = repo.head(); repo.g(['rm', '-q', C.officialOutput('timing')]); repo.g(['commit', '-q', '-m', 'rm']); return [hm, repo.head(), 'memory']; },
    renameRaw: repo => { commitRaw(repo, 'timing'); const hm = repo.head(); repo.g(['mv', C.officialOutput('timing'), C.officialOutput('memory')]); repo.g(['commit', '-q', '-m', 'mv']); return [hm, repo.head(), 'memory']; },
    noReceipt: repo => { const ht = repo.head(); return [ht, commitRaw(repo, 'timing', { message: 'raw without receipt' }), 'timing']; },
    forgedSha: repo => { const ht = repo.head(); return [ht, commitRaw(repo, 'timing', { receipt: { receipt: 'p10', run: 'p10run1', block: 'timing', output: C.officialOutput('timing'), sha256: '0'.repeat(64), status: 'pass', exitCode: 0, elapsedMs: 1, capMs: C.P10.capMs.timing, capOverrunMs: 0 } }), 'timing']; },
    failedExit: repo => { const ht = repo.head(); const text = '{"status":"pass"}\n'; return [ht, commitRaw(repo, 'timing', { content: text, receipt: { receipt: 'p10', run: 'p10run1', block: 'timing', output: C.officialOutput('timing'), sha256: sha256(text), status: 'pass', exitCode: 1, elapsedMs: 1, capMs: C.P10.capMs.timing, capOverrunMs: 0 } }), 'timing']; },
    capOverrun: repo => { const ht = repo.head(); const text = '{"status":"pass"}\n'; return [ht, commitRaw(repo, 'timing', { content: text, receipt: { receipt: 'p10', run: 'p10run1', block: 'timing', output: C.officialOutput('timing'), sha256: sha256(text), status: 'pass', exitCode: 0, elapsedMs: 1, capMs: C.P10.capMs.timing, capOverrunMs: 5 } }), 'timing']; },
    wrongBlock: repo => { const ht = repo.head(); return [ht, commitRaw(repo, 'timing'), 'memory']; },
  };
  for (const [name, make] of Object.entries(cases)) {
    const repo = fixtureRepo();
    try {
      const [from, to, block] = make(repo);
      assert(verify(repo, from, to, block).reasons.length > 0, name);
    } finally { rmSync(repo.dir, { recursive: true, force: true }); }
  }
});

test('receipts: format and parse one line; duplicates and garbage are rejected', () => {
  const r = { receipt: 'p10', run: 'p10run1', block: 'timing', output: C.officialOutput('timing'), sha256: 'a'.repeat(64), status: 'pass', exitCode: 0, elapsedMs: 1, capMs: 1, capOverrunMs: 0 };
  const line = C.formatReceipt(r);
  assert(line.startsWith('P10-Receipt: ') && !line.includes('\n'));
  assert.deepEqual(C.parseReceipts(`title\n\n${line}\n\nAgent: claude-code`), [r]);
  assert.throws(() => C.parseReceipts(`${line}\n${line}`), /exactly one/);
  assert.throws(() => C.parseReceipts('P10-Receipt: {nope'), /receipt/);
  assert.throws(() => C.parseReceipts('no receipt'), /exactly one/);
});

test('refusal: one JSON line with exit 1 and no secrets or absolute paths', () => {
  const r = C.refusal({ phase: 'preflight', reasonCode: 'output_exists', integrityFailure: false, expected: 'absent', actual: 'present' });
  assert.deepEqual(r, { status: 'refused', phase: 'preflight', reasonCode: 'output_exists', integrityFailure: false, expected: 'absent', actual: 'present', exitCode: 1 });
});

test('self-check output: must be outside the repository and never an official name or folder', () => {
  const outside = join(tmpdir(), 'p10-sc', 'selfcheck-a.json');
  assert.deepEqual(C.selfCheckOutputViolations(outside, REPO), []);
  assert(C.selfCheckOutputViolations(join(REPO, 'research/results/n34-p10/selfcheck-a.json'), REPO).length > 0);
  assert(C.selfCheckOutputViolations(join(tmpdir(), 'p10-sc', 'perf-p10run1-timing.json'), REPO).length > 0);
  assert(C.selfCheckOutputViolations('relative/selfcheck-a.json', REPO).length > 0);
});

// ---------- D. real runner orchestration with fake processes, clock and git ----------
const BASE = C.P10.base, CAND = C.P10.candProduct;
function fakeWorld({ attemptMs = 60_000, calibrationMs = 30_000, memoryMs = 5_000, npmMs = 1_000, buildError, slowFinalSaveMs = 0, failFinalSave = false, cMedian = 100, digestMismatch, preBuildAdvanceMs = 0 } = {}) {
  const world = { t: 0, lines: [], commits: {}, saves: 0, taskkills: [] };
  const root = mkdtempSync(join(tmpdir(), 'tco-p10-root-'));
  const tmpRoot = mkdtempSync(join(tmpdir(), 'tco-p10-tmp-'));
  for (const file of [...R.HARNESS_FILES, 'src/core/policy.ts', 'package.json', 'package-lock.json']) { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), `placeholder ${file}\n`); }
  world.root = root; world.tmpRoot = tmpRoot;
  world.prereg = 'a'.repeat(40); world.head = world.prereg;
  const rawBlob = (commit, path) => world.commits[commit]?.files?.[path];
  const git = args => {
    const a = args.join(' ');
    if (a === 'status --porcelain') return '';
    if (a === 'rev-parse HEAD') return world.head;
    if (args[0] === 'rev-parse' && /^[0-9a-f]{40}$/.test(args[1])) return args[1];
    if (args[0] === 'rev-parse' && args[1].includes(':')) { const [c, p] = args[1].split(':'); const ref = c === 'HEAD' ? world.head : c; const blob = rawBlob(ref, p) ?? Object.values(world.commits).find(x => x.files?.[p])?.files[p]; return blob ? sha256(blob) : `blob-${p}`; }
    if (args[0] === 'merge-base') return '';
    if (args[0] === 'diff' && args.includes('--exit-code')) return '';
    if (args[0] === 'diff' && args.includes('--numstat')) return ['21', '3', 'src/core/policy.ts'].join(TAB);
    if (args[0] === 'diff' && args[1] === CAND) return '';
    if (args[0] === 'diff' && args.includes('--name-status')) { const c = world.commits[args.at(-1)]; return c ? `A${TAB}${c.path}` : ''; }
    if (args[0] === 'log' && args.includes('--format=%H')) return world.prereg;
    if (args[0] === 'log' && args.includes('--format=%B')) return world.commits[args.at(-1)]?.message ?? '';
    if (args[0] === 'rev-list' && args.includes('--parents')) { const c = world.commits[args.at(-1)]; return c ? `${args.at(-1)} ${c.parent}` : args.at(-1); }
    if (args[0] === 'rev-list' && args.includes('--count')) { const [from, to] = args.at(-1).split('..'); return world.commits[to]?.parent === from ? '1' : '0'; }
    if (args[0] === 'ls-files') { world.t += preBuildAdvanceMs; return ''; }
    if (args[0] === 'archive') { if (buildError) throw buildError; return ''; }
    throw new Error(`fake git: unexpected ${a}`);
  };
  const execFileSync = (exe, args, opts = {}) => {
    if (exe === 'git' && args[0] === 'cat-file') { const [c, p] = args[2].split(':'); return Buffer.from(rawBlob(c, p) ?? ''); }
    if (exe === 'git') { const out = git(args); return opts.encoding ? out : Buffer.from(out); }
    if (exe.endsWith('tar.exe')) { const dir = args[args.indexOf('-C') + 1]; writeFileSync(join(dir, 'package-lock.json'), 'lock\n'); return ''; }
    if (exe === 'powercfg') return 'Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)';
    if (exe === 'taskkill') { world.taskkills.push(args); return ''; }
    if (exe === process.execPath && String(args[0]).endsWith('tsc')) {
      const core = join(opts.cwd, 'dist/src/core'); mkdirSync(core, { recursive: true });
      writeFileSync(join(core, 'artifacts.js'), 'same\n');
      writeFileSync(join(core, 'policy.js'), opts.cwd.endsWith('candidate') ? 'cand\n' : 'base\n');
      return '';
    }
    throw new Error(`fake exec: unexpected ${exe} ${args.join(' ')}`);
  };
  let pid = 1000;
  const spawnFake = (exe, args) => {
    const c = new FakeChild(++pid);
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdout.setEncoding = () => {}; c.stderr.setEncoding = () => {};
    let payload = null, ms = npmMs;
    const script = String(args.find(arg => String(arg).endsWith('.mjs')) ?? '');
    if (script.endsWith('perf-worker.mjs')) {
      const config = JSON.parse(readFileSync(args.at(-1), 'utf8'));
      if (config.op === 'calibrate') { ms = calibrationMs; payload = { status: 'completed', steps: [{ k: 1, base: [60, 60, 60, 60, 60], candidate: [60, 60, 60, 60, 60] }], k: 1 }; }
      else {
        ms = attemptMs;
        const digests = { B1: 'd', B2: 'd', C1: 'd', C2: digestMismatch ? 'e' : 'd' };
        payload = { status: 'completed', digests, views: { B1: {}, B2: {}, C1: {}, C2: {} }, samples: config.schedule.map((s, order) => ({ order, label: s.label, arm: s.arm, ms: s.arm.startsWith('C') ? cMedian : 100 })) };
      }
    } else if (script.endsWith('mem-worker.mjs')) { ms = memoryMs; payload = { status: 'completed', retainedBytes: MIB, maxRssBytes: 100 * MIB, elapsedMs: 1, before: {}, after: {}, outputDigest: 'x', view: {} }; }
    setImmediate(() => {
      world.t += ms;
      if (payload) c.stdout.emit('data', JSON.stringify(payload) + '\n');
      c.exitCode = 0; c.emit('exit', 0, null); c.emit('close', 0, null);
    });
    return c;
  };
  world.runtime = {
    now: () => world.t, spawn: spawnFake, execFileSync, sleep: async ms => { world.t += ms; },
    stdout: line => world.lines.push(line), root, tmpRoot, platform: 'win32', nodeVersion: 'v24.18.0',
    writeOutput: (path, text) => {
      world.saves++;
      const final = Boolean(JSON.parse(text).finishedAt);
      if (failFinalSave && final) throw new Error('disk full (fake)');
      if (slowFinalSaveMs && final && !world.slowed) { world.slowed = true; world.t += slowFinalSaveMs; }
      writeFileSync(path, text);
    },
  };
  world.cleanup = () => { rmSync(root, { recursive: true, force: true }); rmSync(tmpRoot, { recursive: true, force: true }); };
  world.receipt = () => C.parseReceipts(world.lines.filter(l => l.startsWith('P10-Receipt: ')).join('\n'))[0];
  world.read = block => JSON.parse(readFileSync(join(root, C.officialOutput(block)), 'utf8'));
  world.commit = block => {
    const path = C.officialOutput(block), text = readFileSync(join(root, path), 'utf8');
    const sha = String(Object.keys(world.commits).length + 2).repeat(40).slice(0, 40);
    world.commits[sha] = { parent: world.head, path, files: { [path]: text }, message: `raw\n\n${C.formatReceipt(world.receipt())}\n` };
    for (const c of Object.values(world.commits)) Object.assign(world.commits[sha].files, c.files);
    world.head = sha; world.lines = [];
    return sha;
  };
  return world;
}
const runFake = async (world, block, extra = {}) => { R.setRuntime(world.runtime); return R.runBlock({ mode: block, output: C.officialOutput(block), prereg: world.prereg, checks: false, ...extra }); };

test('runner: timing -> memory -> info through the real orchestration, chain and receipts', async () => {
  const world = fakeWorld();
  try {
    let out = await runFake(world, 'timing');
    assert.deepEqual([out.status, out.exitCode], ['pass', 0]);
    const timing = world.read('timing');
    assert.equal(timing.rows.length, 18); assert(timing.rows.every(r => r.rawComplete && r.status === 'pass'));
    assert.equal(timing.budget.capOverrunMs, 0); assert.equal(timing.budget.capMs, C.P10.capMs.timing);
    assert(timing.children.every(c => c.closeObserved), 'every owned child closed');
    const receipt = world.receipt();
    assert.equal(receipt.sha256, sha256(readFileSync(join(world.root, C.officialOutput('timing')))));
    assert.deepEqual([receipt.status, receipt.exitCode, receipt.block], ['pass', 0, 'timing']);
    world.commit('timing');
    out = await runFake(world, 'memory');
    assert.deepEqual([out.status, out.exitCode], ['pass', 0]);
    assert.equal(world.read('memory').runs.length, 108);
    world.commit('memory');
    out = await runFake(world, 'info');
    assert.deepEqual([out.status, out.exitCode], ['completed_informational', 0]);
    const info = world.read('info');
    assert.equal(info.rows.length, 8);
    assert(info.rows.every(r => r.verdict === 'V' && r.rawComplete && r.attempts[0].samples.length === 144 && r.calibration.steps.length === 1 && r.selectedAttempt === 1));
    assert.deepEqual([info.disposition, info.integrity.failure], ['D-0', false]);
  } finally { world.cleanup(); }
});

test('runner: memory refuses without the exact timing raw commit; info refuses a hand-edited pass', async () => {
  const world = fakeWorld();
  try {
    await runFake(world, 'timing');
    let out = await runFake(world, 'memory');
    assert.equal(out.status, 'refused'); assert.equal(out.exitCode, 1);
    assert(!existsSync(join(world.root, C.officialOutput('memory'))), 'official name not consumed');
    const refusal = JSON.parse(world.lines.at(-1));
    assert.deepEqual([refusal.status, refusal.integrityFailure, refusal.exitCode], ['refused', true, 1]);
    // a forged pass: timing file says pass but a row lost its samples
    const path = join(world.root, C.officialOutput('timing'));
    const doc = JSON.parse(readFileSync(path, 'utf8')); doc.rows[3].attempts[0].samples = [];
    writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
    const forged = C.officialOutput('timing');
    const text = readFileSync(path, 'utf8');
    world.lines = [C.formatReceipt({ receipt: 'p10', run: 'p10run1', block: 'timing', output: forged, sha256: sha256(text), status: 'pass', exitCode: 0, elapsedMs: 1, capMs: C.P10.capMs.timing, capOverrunMs: 0 })];
    world.commit('timing');
    out = await runFake(world, 'memory');
    assert.equal(out.status, 'refused');
    assert(JSON.parse(world.lines.at(-1)).reasonCode.includes('prior'), 'validator re-run rejects the forged pass');
  } finally { world.cleanup(); }
});

test('runner: timing start HEAD must equal --prereg (m-6) and existing output is refused', async () => {
  const world = fakeWorld();
  try {
    world.head = 'b'.repeat(40);
    let out = await runFake(world, 'timing');
    assert.deepEqual([out.status, JSON.parse(world.lines.at(-1)).reasonCode], ['refused', 'head_not_prereg']);
    world.head = world.prereg;
    await runFake(world, 'timing');
    out = await runFake(world, 'timing');
    assert.deepEqual([out.status, JSON.parse(world.lines.at(-1)).reasonCode], ['refused', 'output_exists'], 'no overwrite, no resume');
    out = await R.runBlock({ mode: 'timing', output: 'research/results/n34-p10/perf-other-timing.json', prereg: world.prereg, checks: false });
    assert.deepEqual([out.status, JSON.parse(world.lines.at(-1)).reasonCode], ['refused', 'output_name']);
  } finally { world.cleanup(); }
});

test('runner: budget notRun rows make the timing block invalid 5 after the last started row', async () => {
  const world = fakeWorld({ calibrationMs: 29 * 60_000, attemptMs: 29 * 60_000 }); // 58 min per row on the fake clock
  try {
    const out = await runFake(world, 'timing');
    const doc = world.read('timing');
    assert.deepEqual([out.status, out.exitCode], ['invalid', 5]);
    const started = doc.rows.filter(r => r.status === 'pass').length;
    assert(started >= 1 && started < 18);
    assert(doc.rows.slice(started).every(r => r.status === 'notRun' && r.reason === 'budget'));
    assert.equal(doc.rows.length, 18);
    assert.equal(doc.budget.capOverrunMs, 0);
  } finally { world.cleanup(); }
});

test('runner: build stopped by the budget is build_incomplete/invalid 5; other build errors are error 1', async () => {
  // the preflight (fake ls-files) spends all but 5 s of the work budget: the git archive timeout is budget-limited
  let world = fakeWorld({ buildError: Object.assign(new Error('git archive ETIMEDOUT'), { code: 'ETIMEDOUT' }), preBuildAdvanceMs: C.P10.capMs.timing - C.P10.reserveMs - 5_000 });
  try {
    const out = await runFake(world, 'timing');
    const doc = world.read('timing');
    assert.deepEqual([out.status, out.exitCode, doc.build.status], ['invalid', 5, 'build_incomplete']);
    assert(doc.rows.every(r => r.status === 'notRun' && r.reason === 'build_incomplete'));
  } finally { world.cleanup(); }
  world = fakeWorld({ buildError: Object.assign(new Error('git archive ETIMEDOUT'), { code: 'ETIMEDOUT' }) });
  try {
    const out = await runFake(world, 'timing');
    assert.deepEqual([out.status, out.exitCode], ['error', 1], 'individual Tcmd timeout');
  } finally { world.cleanup(); }
});

test('runner: correctness failure keeps priority 3 and stops the timing block', async () => {
  const world = fakeWorld({ digestMismatch: true });
  try {
    const out = await runFake(world, 'timing');
    const doc = world.read('timing');
    assert.deepEqual([out.status, out.exitCode, doc.rows.length, doc.rows[0].status], ['failed_correctness', 3, 1, 'failed_correctness']);
    assert.equal(doc.notRun.length, 17);
  } finally { world.cleanup(); }
});

test('runner (n-2): a slow final save past C turns pass into error 1 and is saved again', async () => {
  const world = fakeWorld({ slowFinalSaveMs: 11 * 3_600_000 });
  try {
    const out = await runFake(world, 'timing');
    assert.deepEqual([out.status, out.exitCode], ['error', 1]);
    const doc = world.read('timing');
    assert.equal(doc.status, 'error');
    assert(doc.finalizationErrors.some(e => e.includes('cap_overrun_after_save')));
    const receipt = world.receipt();
    assert.deepEqual([receipt.status, receipt.exitCode], ['error', 1]);
    assert(receipt.capOverrunMs > 0);
    assert.equal(receipt.sha256, sha256(readFileSync(join(world.root, C.officialOutput('timing')))));
  } finally { world.cleanup(); }
});

test('runner (n-2): a failed final save never prints a success receipt', async () => {
  const world = fakeWorld({ failFinalSave: true });
  try {
    const out = await runFake(world, 'timing');
    assert.equal(out.exitCode, 1);
    const receipt = world.receipt();
    assert.deepEqual([receipt.status, receipt.exitCode, receipt.sha256], ['error', 1, null]);
    assert.equal(receipt.saveFailed, true);
  } finally { world.cleanup(); }
});

test('runner: partial raw is saved as incomplete while the block runs (parent abort evidence)', async () => {
  const world = fakeWorld();
  try {
    let seen = null;
    const original = world.runtime.writeOutput;
    world.runtime.writeOutput = (path, text) => { original(path, text); const doc = JSON.parse(text); if (!seen && doc.rows.length === 2) seen = doc; };
    await runFake(world, 'timing');
    assert.equal(seen.status, 'incomplete');
    assert.equal(seen.rows.length, 2);
    assert.equal(seen.children.length >= 4, true, 'child pid records saved before the end');
  } finally { world.cleanup(); }
});

test('runner: check-only and node --test never start a product measurement', () => {
  const out = execFileSync(process.execPath, [join(REPO, 'research/src/n34-p10-perf.mjs'), '--check-only'], { cwd: REPO, windowsHide: true, encoding: 'utf8' });
  const result = JSON.parse(out.trim().split('\n').at(-1));
  assert.deepEqual([result.status, result.timedCalls], ['PASS', 0]);
  assert.deepEqual(result.copyGuard.violations, []);
});
