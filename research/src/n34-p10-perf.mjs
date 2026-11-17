// P10> N-34 K1 validation, P-1 runner (plan PR #123 docs/plans/2026-11-17-n34-k1-validation-plan.md sections
// 5-8; execution supplement M-1/M-2; preregistration docs/agent/handoffs/n34-p10-prereg.md).
// Copy of the run3 runner research/src/n34-cr-policy-perf.mjs. The statistics, gates, schedule, calibration,
// timing row, memory row, inputs and workers are unchanged; every added or changed line carries a P10
// marker and --check-only pins the run3 lines removed (copy guard). New: run budget (D = t0 + C, R once),
// per-stage raw records (K1 rules), owned-process kills only, informational verdicts and the F1
// disposition, raw-only commit chain between blocks, final save receipt, refusals before any output.
// Usage:
//   node research/src/n34-p10-perf.mjs --check-only
//   node research/src/n34-p10-perf.mjs --self-check --output=<absolute path outside the repository>/selfcheck-<name>.json
//   node research/src/n34-p10-perf.mjs --prereg=<sha> --block=timing|memory|info --output=research/results/n34-p10/perf-p10run1-<block>.json
// Exit codes: 0 pass (or completed self-check / informational), 3 failed_correctness, 4 failed_gate,
// 5 invalid, 1 error, refusal or incomplete. P10<
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPARISONS, INPUTS, ROWS, SIZE, makeInput } from './n34-cr-policy-perf-inputs.mjs';
import { EventEmitter } from 'node:events'; // P10
import { pathToFileURL } from 'node:url'; // P10
import { isDeepStrictEqual } from 'node:util'; // P10
import * as C from './n34-p10-perf-contract.mjs'; // P10

let ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'); // P10 (setRuntime may point it at a test root)
const REPO_ROOT = ROOT; // P10
const SCHEMA = C.P10.schema; // P10
const BASE = '5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3'; // origin/main at task start = plan base
const RUNNER = 'research/src/n34-p10-perf.mjs'; // P10
const CONTRACT = 'research/src/n34-p10-perf-contract.mjs'; // P10
const TESTS = 'research/test/n34-p10-perf.test.mjs'; // P10
const PREREG = 'docs/agent/handoffs/n34-p10-prereg.md'; // P10
const RUN3_RUNNER = 'research/src/n34-cr-policy-perf.mjs'; // P10
const INPUTS_MODULE = 'research/src/n34-cr-policy-perf-inputs.mjs';
const PERF_WORKER = 'research/src/n34-cr-policy-perf-worker.mjs';
const MEM_WORKER = 'research/src/n34-cr-policy-perf-mem-worker.mjs';
const PROTOCOL = 'docs/agent/handoffs/n34-cr-line-policy-prereg-run3.md';
const PROTOCOL_RUN2 = 'docs/agent/handoffs/n34-cr-line-policy-prereg-run2.md';
const PROTOCOL_RUN1 = 'docs/agent/handoffs/n34-cr-line-policy-prereg.md';
const HARNESS_FILES = [RUNNER, CONTRACT, TESTS, PREREG, RUN3_RUNNER, INPUTS_MODULE, PERF_WORKER, MEM_WORKER, PROTOCOL, PROTOCOL_RUN2, PROTOCOL_RUN1]; // P10
const RESULTS_DIR = C.P10.resultsDir; // P10
const NPM = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const TAR = 'C:/Windows/System32/tar.exe';
const MIB = 1024 * 1024;
const TEMP_PREFIX = 'tco-n34-p10-'; // P10
const P = Object.freeze({
  circuits: Object.freeze(['ABCDBDCADACB', 'ADACDBDCBABC']), circuitMap: Object.freeze({ A: 'B1', B: 'B2', C: 'C2', D: 'C1' }), warmupCircuits: 2, measureCircuits: 10,
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

// P10> raw completeness (K1 rules through the contract helper). A would-be pass with a raw gap becomes
// invalid; a validated failure keeps its status and the gap is recorded beside it. The memory block uses
// the plan 6.3 priority (failed_correctness > failed_gate > invalid > error > pass).
const timingFinal = entry => C.applyRawCheck(entry, C.timingRawViolations(entry));
function memoryOutcome(runs) {
  const rows = memoryRowsFrom(runs, ROWS).map(row => C.applyRawCheck(row, runs.filter(r => r.key === row.key).flatMap(C.memoryRawViolations)));
  const status = C.mandatoryBlockStatus({ rows });
  return { rows, status, exitCode: exitCodeFor(status), refFailedRows: rows.filter(r => r.status === 'ref_failed').map(r => r.key), rawIncompleteRows: rows.filter(r => !r.rawComplete).map(r => r.key) };
}
// Primary r1 R1 (supplement m-7): a prior pass is re-derived from its raw data with the run3 definitions above
// (row mapping, calibration stop condition, attempt order, schedule, samples, statistics, A/A, gate; memory run
// order and rows). The thresholds and verdict rules are the ones the block itself used. Returns violations.
function timingDerivedStatus(entry, at) {
  const cal = entry.calibration, last = Array.isArray(cal?.steps) ? cal.steps.at(-1) : undefined;
  if (cal?.child?.status !== 'completed') return 'invalid';
  if (!last || last.k !== cal.k || !calibrationDone(last.base, last.candidate)) return 'invalid';
  if (entry.k !== cal.k) at('k');
  if (!Array.isArray(entry.attempts)) { at('attempts'); return 'invalid'; }
  if (entry.attempts.length > P.maxAttempts) at('attempt_count');
  const SCHEDULE = schedule();
  for (const [index, a] of entry.attempts.entries()) {
    const number = index + 1, isLast = index === entry.attempts.length - 1;
    const stop = status => { if (!isLast) at(`attempt${number}_after_stop`); return status; };
    if (a?.number !== number) at(`attempt${number}_number`);
    if (a?.child?.status !== 'completed') return stop('invalid');
    const digests = a.digests ?? {};
    if (new Set(Object.values(digests)).size !== 1 || Object.keys(digests).length !== 4) { if (a.status !== 'output_mismatch') at(`attempt${number}_status`); return stop('failed_correctness'); }
    let derived;
    try {
      assert.equal(a.samples.length, SCHEDULE.length);
      a.samples.forEach((s, i) => { assert.equal(s.order, i); assert.equal(s.label, SCHEDULE[i].label); assert.equal(s.arm, SCHEDULE[i].arm); });
      const values = arm => a.samples.filter(s => s.label.startsWith('measure/') && s.arm === arm).map(s => s.ms);
      derived = { B1: stats(values('B1')), B2: stats(values('B2')), C1: stats(values('C1')), C2: stats(values('C2')) };
    } catch { if (a.status !== 'invalid_samples') at(`attempt${number}_status`); return stop('invalid'); }
    const aa = { base: aaValid(derived.B1, derived.B2), candidate: aaValid(derived.C1, derived.C2) };
    const gate = timeGate(derived[P.gateArms.reference], derived[P.gateArms.candidate]);
    if (!isDeepStrictEqual(a.stats, json(derived))) at(`attempt${number}_stats`);
    if (!isDeepStrictEqual(a.aa, json(aa))) at(`attempt${number}_aa`);
    if (!isDeepStrictEqual(a.gate, json(gate))) at(`attempt${number}_gate`);
    if (!isDeepStrictEqual(a.ratioC1toB1Median, json(derived.C1.median / derived.B1.median))) at(`attempt${number}_ratio`);
    if (!aa.base.valid || !aa.candidate.valid) {
      if (a.status !== 'invalid_aa') at(`attempt${number}_status`);
      if (isLast) return 'invalid'; // last allowed attempt, or no retry within the budget
      continue;
    }
    if (a.status !== 'valid') at(`attempt${number}_status`);
    if (entry.selectedAttempt !== number) at('selectedAttempt');
    return stop(gate.pass ? 'pass' : 'failed_gate');
  }
  return 'invalid';
}
function timingRederive(entry, row) {
  if (!row) return ['row_extra'];
  const v = [];
  const at = what => v.push(`${row.key}:${what}`);
  for (const field of ['key', 'op', 'gate', 'cand', 'ref']) if (entry?.[field] !== row[field]) at(`mapping_${field}`);
  if (entry?.status === 'notRun') return v; // a notRun row is refused by the pass condition
  const derived = timingDerivedStatus(entry ?? {}, at);
  if (derived !== entry?.status) at(`status_${entry?.status}_derived_${derived}`);
  return v;
}
const memoryRunPlan = () => {
  const plan = [];
  for (let repeat = 0; repeat < P.memoryRepeats; repeat++) for (const row of ROWS) for (const arm of repeat % 2 === 0 ? ['B1', 'C1'] : ['C1', 'B1']) plan.push([row.key, repeat, arm, row[arm.startsWith('C') ? 'cand' : 'ref']]);
  return plan;
};
function priorRederive(block, doc) {
  const v = [];
  if (!isDeepStrictEqual(doc.schedule, json(scheduleFacts(schedule())))) v.push('schedule');
  if (block === 'timing') doc.rows.forEach((entry, index) => v.push(...timingRederive(entry, ROWS[index])));
  else {
    if (!isDeepStrictEqual(doc.runs.map(r => [r?.key, r?.repeat, r?.arm, r?.inputId]), memoryRunPlan())) v.push('run_order');
    const out = json(memoryOutcome(structuredClone(doc.runs)));
    if (!isDeepStrictEqual(out.rows, doc.rows) || out.status !== doc.status || !isDeepStrictEqual(out.refFailedRows, doc.refFailedRows) || !isDeepStrictEqual(out.rawIncompleteRows, doc.rawIncompleteRows)) v.push('memory_rows');
  }
  return v.map(reason => `rederive:${reason}`);
}
// Copy guard pins (supplement M-1): run3 runner bytes (LF) and the run3 lines this runner removes.
const RUN3_SHA256 = '61866e8def9604cb41eee908593420c86f0d413cc53cb9d8a0b27e9448e1eee9';
const REMOVED_SHA256 = '6b49bb89f6c94850a714d73d5f3a732121e2f0c166c8101b832604f822dced5e';
function copyGuard({ run3Text, selfText } = {}) {
  const delta = C.copyDelta(run3Text ?? readFileSync(join(REPO_ROOT, RUN3_RUNNER), 'utf8'), selfText ?? readFileSync(fileURLToPath(import.meta.url), 'utf8'));
  const violations = [];
  if (delta.run3Sha256 !== RUN3_SHA256) violations.push('run3_source_changed');
  if (delta.removedSha256 !== REMOVED_SHA256) violations.push('removed_lines_changed');
  violations.push(...delta.unmarkedAdded.map(line => `unmarked ${line}`));
  return { run3Sha256: delta.run3Sha256, removedSha256: delta.removedSha256, removedCount: delta.removed.length, addedCount: delta.addedCount, unmarkedAdded: delta.unmarkedAdded, violations };
}
// P10<
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

// P10> P10 checks (check-only and before every block): copy guard, P vs preregistered step limits, the
// mandatory row mapping and informational rows with negative controls, official names, self-check names.
const OUTPUT_NAME = /^perf-p10run1-(timing|memory|info)[.]json$/;
function p10Checks() {
  const guard = copyGuard();
  assert.deepEqual(guard.violations, [], 'copy guard (M-1)');
  const S = C.P10.steps;
  assert.equal(P.timingChildTimeoutMs, S.cal); assert.equal(P.timingChildTimeoutMs, S.att); assert.equal(P.memoryChildTimeoutMs, S.mem);
  assert.equal(P.cooldownMs, S.cool); assert.equal(P.maxAttempts, 3); assert.equal(P.memoryRepeats, 3);
  const mapping = rows => Object.fromEntries(rows.filter(r => r.gate === 'G-C').map(r => [`${r.op}/${r.cand}`, r.ref]));
  const expected = Object.fromEntries(['O1', 'O2'].flatMap(op => [['F1', 'F4'], ['F2', 'F5'], ['F6', 'F6L'], ['F7', 'F7L']].map(([cand, ref]) => [`${op}/${cand}`, ref])));
  assert.deepEqual(mapping(ROWS), expected, 'run3 G-C mapping');
  assert.notDeepEqual(mapping(ROWS.map(r => (r.cand === 'F1' ? { ...r, ref: 'F5' } : r))), expected, 'control: swapped reference must fail');
  assert.notDeepEqual(mapping(C.INFO_ROWS), expected, 'control: informational rows are not the mandatory mapping');
  assert(C.INFO_ROWS.every(r => r.ref === r.cand && r.key.endsWith(':same-input')) && C.INFO_ROWS.length === 8);
  assert.deepEqual(C.F1_INFO_KEYS.filter(k => C.INFO_KEYS.includes(k)), ['O1/F1:same-input', 'O2/F1:same-input']);
  for (const block of C.P10.blocks) assert(OUTPUT_NAME.test(basename(C.officialOutput(block))) && dirname(C.officialOutput(block)) === RESULTS_DIR);
  assert(!OUTPUT_NAME.test('perf-p10run2-timing.json') && !OUTPUT_NAME.test('selfcheck-p10.json'), 'control: other names');
  assert(C.selfCheckOutputViolations(join(ROOT, C.officialOutput('timing')), ROOT).length > 0, 'control: official file as self-check output');
  assert.equal(C.exitCodeFor('refused'), 1);
  return { copyGuard: guard, mapping: expected, infoKeys: C.INFO_KEYS, outputs: C.P10.blocks.map(C.officialOutput), steps: S, needs: C.NEEDS, capMs: C.P10.capMs, reserveMs: C.P10.reserveMs };
}
// P10<
// ---------- process helpers ----------
const digest = data => createHash('sha256').update(data).digest('hex');
const hashFile = file => digest(readFileSync(file));
// P10> runtime boundaries. Tests inject now/spawn/exec/sleep/stdout/roots through setRuntime (no CLI flag or
// environment variable). Work steps use the remaining work budget, finalization the remaining total.
const realRuntime = () => ({ now: () => performance.now(), wallNow: () => new Date(), spawn, execFileSync, sleep: ms => new Promise(done => setTimeout(done, ms)),
  stdout: line => console.log(line), root: REPO_ROOT, tmpRoot: tmpdir(), platform: process.platform, nodeVersion: process.version, writeOutput: (path, text) => writeFileSync(path, text) });
let RT = realRuntime();
// Kills need the fixed runtime whose child lifecycle was checked (M-2); otherwise ownership never kills.
const newOwnership = () => C.createOwnership({ execFileSync: (...args) => RT.execFileSync(...args), lifecycleConfirmed: process.platform === 'win32' && process.version === 'v24.18.0' });
let OWN = newOwnership();
let BUDGET = null, PHASE = 'work', ON_SPAWN = null;
const SPAWN_SAVE_ERRORS = [];
function setRuntime(overrides = {}) { RT = { ...realRuntime(), ...overrides }; ROOT = RT.root; OWN = newOwnership(); BUDGET = null; PHASE = 'work'; ON_SPAWN = null; }
// Plan 6.2: the pid and parent-observed spawn times are saved as soon as a child is spawned.
const spawned = () => { try { ON_SPAWN?.(); } catch (error) { SPAWN_SAVE_ERRORS.push(String(error.message).slice(0, 200)); } };
const ownershipLeftovers = () => OWN.leftovers();
function stepTimeout(capMs, what) {
  if (!BUDGET) return { ms: capMs, budgetLimited: false };
  if (PHASE !== 'final') return BUDGET.workTimeout(capMs, what);
  const t = BUDGET.finalTimeout(capMs);
  if (!t) throw new Error(`${what}: finalization budget spent`);
  return t;
}
function command(exe, args, cwd = ROOT) {
  const { ms, budgetLimited } = stepTimeout(C.P10.steps.cmd, basename(exe));
  try { return RT.execFileSync(exe, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: ms, maxBuffer: 64 * MIB }); }
  catch (error) { if (budgetLimited && PHASE !== 'final' && C.isTimeoutError(error)) throw new C.BudgetExpired(`${basename(exe)} stopped at the work budget`); throw error; }
}
// P10<
const git = args => command('git', args).trim();
const readBlob = (commit, path) => RT.execFileSync('git', ['cat-file', 'blob', `${commit}:${path}`], { cwd: ROOT, windowsHide: true, timeout: stepTimeout(C.P10.steps.cmd, 'git').ms, maxBuffer: 256 * MIB }); // P10
const sleep = ms => RT.sleep(ms); // P10
const kill = child => OWN.kill(child, BUDGET ? Math.min(C.P10.steps.kill, BUDGET.remainingTotalMs()) : C.P10.steps.kill); // P10 owned live child only (M-2)
const OOM_PATTERN = /FATAL ERROR[^\n]*heap|heap out of memory|Allocation failed/i;
// P10> runChild: run3 classification unchanged. Adds the K1 stamps, the owned pid and lifecycle as seen by the
// parent, the kill record, and a bounded wait for close after a kill (a missing close is reported, never assumed).
function runChild(args, timeoutMs, exe = process.execPath) {
  return new Promise(done => {
    const t = stepTimeout(timeoutMs, 'child');
    const nodeArgs = args.filter(arg => String(arg).startsWith('--'));
    const startedMono = RT.now(), startedAt = RT.wallNow().toISOString();
    const stamp = { startedAt, nodeArgs, timeoutMs: t.ms, budgetLimited: t.budgetLimited };
    let child;
    try { child = RT.spawn(exe, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { done({ status: 'spawn_error', message: String(error.message), ...stamp, finishedAt: startedAt, wallMs: 0, pid: null, closeObserved: false, kills: [] }); return; }
    const rec = OWN.register(child, { spawnedAt: startedAt, spawnedMonoMs: startedMono, spawnReturnedAt: RT.wallNow().toISOString(), spawnReturnedMonoMs: RT.now(), script: basename(String(args.find(arg => String(arg).endsWith('.mjs')) ?? exe)), nodeArgs });
    let stdout = '', stderr = '', timedOut = false, settled = false, sawOom = false, closeTimer;
    const finish = value => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(closeTimer);
      done({ ...value, ...stamp, finishedAt: RT.wallNow().toISOString(), wallMs: RT.now() - startedMono, pid: Number.isSafeInteger(child.pid) ? child.pid : null, closeObserved: rec?.closeObserved ?? false, kills: rec ? rec.kills.map(k => ({ ...k })) : [] });
    };
    const timer = setTimeout(() => { timedOut = true; kill(child); closeTimer = setTimeout(() => finish({ status: 'timeout', closeMissing: true }), C.P10.steps.kill); }, t.ms);
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
    spawned();
  });
}
// P10<
function environment() {
  const cpu = cpus();
  return { node: process.version, v8: process.versions.v8, platform: process.platform, os: release(), arch: process.arch,
    cpuModels: [...new Set(cpu.map(item => item.model))], logicalCPUs: cpu.length, totalMemBytes: totalmem(),
    powerScheme: command('powercfg', ['/GETACTIVESCHEME']).trim() };
}
// P10> npm: owned child, budgeted timeout. A timeout cut by the work budget is BudgetExpired (build_incomplete).
// Primary r1 R5: a failed log write in the close callback rejects the promise instead of escaping as an uncaught
// exception; the promise settles once, and a budget-limited timeout keeps its BudgetExpired cause.
async function npm(args, cwd, log) {
  const t = stepTimeout(C.P10.steps.cmd, 'npm');
  return new Promise((done, reject) => {
    let child;
    const spawnedAt = RT.wallNow().toISOString(), spawnedMonoMs = RT.now();
    try { child = RT.spawn(process.execPath, [NPM, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } }); } catch (error) { reject(error); return; }
    OWN.register(child, { spawnedAt, spawnedMonoMs, spawnReturnedAt: RT.wallNow().toISOString(), spawnReturnedMonoMs: RT.now(), script: `npm ${args.join(' ')}`, nodeArgs: [] });
    let output = '', timedOut = false, closeTimer;
    const timer = setTimeout(() => { timedOut = true; kill(child); closeTimer = setTimeout(() => reject(new Error(`npm ${args.join(' ')}: no close after the kill`)), C.P10.steps.kill); }, t.ms);
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    spawned();
    child.on('close', code => {
      clearTimeout(timer); clearTimeout(closeTimer);
      let logError = null;
      try { writeFileSync(log, output); } catch (error) { logError = error; }
      const logNote = logError ? `; log not written: ${logError.message}` : '';
      if (code === 0 && !timedOut && !logError) done();
      else if (timedOut && t.budgetLimited) reject(new C.BudgetExpired(`npm ${args.join(' ')} stopped at the work budget${logNote}`));
      else reject(new Error(code === 0 && !timedOut ? `npm ${args.join(' ')}: completed${logNote}` : `npm ${args.join(' ')} failed (${code}, timeout=${timedOut})${logNote}`, logError ? { cause: logError } : undefined));
    });
  });
}
// P10<
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

// P10> Primary r1 R3: the assertions in buildSnapshots are its snapshot integrity checks (A/A copy, lockfile,
// dist/core file set and differences); it has no other assertion. They are reported by type as IntegrityError.
async function buildChecked(temp, head, logs) {
  try { return await buildSnapshots(temp, head, logs); }
  catch (error) { if (error instanceof assert.AssertionError) throw new C.IntegrityError('snapshot_integrity', String(error.message).slice(0, 300)); throw error; }
}
// P10<
// ---------- block procedures ----------
function makeContext(temp) {
  let counter = 0;
  return {
    config: value => { const path = join(temp, `config-${counter++}.json`); writeFileSync(path, JSON.stringify(value)); return path; },
    workDir: () => join(temp, `work-${counter++}`),
  };
}
const childRecord = run => ({ status: run.status, exitCode: run.exitCode, signal: run.signal, wallMs: run.wallMs, startedAt: run.startedAt, finishedAt: run.finishedAt, nodeArgs: run.nodeArgs, pid: run.pid ?? null, timeoutMs: run.timeoutMs, budgetLimited: run.budgetLimited, closeObserved: run.closeObserved, closeMissing: run.closeMissing, kills: run.kills, stderrTail: run.stderrTail, message: run.message, error: run.payload?.error }); // P10 K1 stamps + owned pid (M-2)

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
    if (number === 1 && options.budget && !options.budget.canStart(C.NEEDS.attempt)) return { ...entry, status: 'notRun', reason: 'budget_before_attempt' }; // P10 entry gate (plan 6.1)
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
      if (options.budget && !options.budget.canStart(C.NEEDS.retry)) return { ...entry, status: 'invalid', reason: `attempt ${number}: invalid A/A; budget_before_retry` }; // P10 entry gate (plan 6.1)
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

// P10> self-check: fault injection through the real runChild (including an owned root + grandchild tree killed
// on timeout), ownership refusals, raw-stage controls, then a small 64 KiB synthetic run through the real
// snapshot, worker, timing, informational and memory paths (not a gate). Global budget 10 min (reserve
// 1 min); each fault child is bounded at 60 s. Entry gates of the official blocks are not used here.
function ownershipControls() {
  const calls = [];
  const own = C.createOwnership({ execFileSync: (exe, args) => { calls.push([exe, ...args]); return ''; }, lifecycleConfirmed: true });
  const unconfirmed = C.createOwnership({ execFileSync: (exe, args) => { calls.push([exe, ...args]); return ''; } });
  const fake = pid => Object.assign(new EventEmitter(), { pid, exitCode: null, signalCode: null, killed: 0, kill() { this.killed++; return true; } });
  const refused = {};
  refused.unregistered = own.kill(fake(10), 1000);
  refused.badPidRegistered = own.register(fake(-1), {}) !== null;
  const spawnError = fake(11); own.register(spawnError, {}); spawnError.emit('error', new Error('spawn')); refused.spawnError = own.kill(spawnError, 1000);
  const exitCode = fake(12); own.register(exitCode, {}); exitCode.exitCode = 0; refused.exitCode = own.kill(exitCode, 1000);
  const signal = fake(13); own.register(signal, {}); signal.signalCode = 'SIGTERM'; refused.signalCode = own.kill(signal, 1000);
  const exited = fake(14); own.register(exited, {}); exited.emit('exit', 0, null); refused.exitSeen = own.kill(exited, 1000);
  const closed = fake(15); own.register(closed, {}); closed.emit('close', 0, null); refused.closeSeen = own.kill(closed, 1000);
  refused.pidFromFile = own.kill({ pid: 16, exitCode: null, signalCode: null }, 1000);
  const unconfirmedLive = fake(18); unconfirmed.register(unconfirmedLive, {}); refused.lifecycleUnconfirmed = unconfirmed.kill(unconfirmedLive, 1000);
  const live = fake(17); own.register(live, {});
  refused.zeroTimeout = own.kill(live, 0);
  const liveKilled = own.kill(live, 1000);
  return { refused, liveKilled, taskkillCalls: calls };
}
function rawControls() {
  const child = { status: 'completed', exitCode: 0, signal: null, wallMs: 1, startedAt: 't0', finishedAt: 't1', nodeArgs: [], pid: 1 };
  const samples = schedule().map((s, order) => ({ order, label: s.label, arm: s.arm, ms: 1 }));
  const four = value => ({ B1: value, B2: value, C1: value, C2: value });
  const attempt = { number: 1, child, samples, digests: four('d'), views: four({}), stats: four({}), aa: {}, gate: { pass: true }, ratioC1toB1Median: 1, status: 'valid' };
  const row = { key: 'O1/F1:same-input', op: 'O1', gate: 'G-C', cand: 'F1', ref: 'F1', calibration: { child, steps: [{}], k: 1 }, k: 1, attempts: [attempt], status: 'pass', selectedAttempt: 1 };
  const verdict = entry => C.finalizeInfoRow(entry).verdict;
  return {
    complete: verdict(row),
    missingSample: verdict({ ...row, attempts: [{ ...attempt, samples: samples.slice(1) }] }),
    mismatchMissingViews: verdict({ ...row, attempts: [{ ...attempt, status: 'output_mismatch', views: undefined }], selectedAttempt: undefined, status: 'failed_correctness' }),
    invalidAa: verdict({ ...row, attempts: [{ ...attempt, status: 'invalid_aa' }], selectedAttempt: undefined, status: 'invalid' }),
    calibrationUnmet: verdict({ ...row, attempts: [], selectedAttempt: undefined, status: 'invalid' }),
    mandatoryGap: C.applyRawCheck({ ...row, key: 'O1/F1', attempts: [{ ...attempt, views: undefined }] }, C.timingRawViolations({ ...row, attempts: [{ ...attempt, views: undefined }] })).status,
  };
}
async function selfCheck(result, temp, head, logs, save) {
  const node = code => ['-e', code];
  const pidFile = join(temp, 'grandchild.pid');
  const tree = `const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], { windowsHide: true, stdio: 'ignore' }); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid)); setTimeout(()=>{}, 60000);`;
  const faults = [
    ['exit1', node('process.exit(1)'), 'abnormal_exit'],
    ['noOutput', node(''), 'parse_error'],
    ['twoLines', node('console.log("{}");console.log("{}")'), 'parse_error'],
    ['badJson', node('console.log("nope")'), 'parse_error'],
    ['errorStatus', node('console.log(JSON.stringify({status:"error",error:{name:"RangeError",message:"x"}}))'), 'child_error'],
    ['fakeOom', node('process.stderr.write("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory");process.exit(134)'), 'oom'],
    ['realOom', ['--max-old-space-size=16', '-e', 'const a=[];for(;;)a.push(new Array(1e5).fill(1))'], 'oom'],
    ['treeTimeout', node(tree), 'timeout', 3000],
  ];
  result.selfCheck = { faults: [] };
  for (const [name, args, expected, timeoutMs] of faults) {
    const run = await runChild(args, timeoutMs ?? C.P10.selfCheck.faultChildMs);
    result.selfCheck.faults.push({ name, expected, actual: run.status, exitCode: run.exitCode, pid: run.pid, closeObserved: run.closeObserved, kills: run.kills, wallMs: run.wallMs,
      timingVerdict: timingChildVerdict(run), exitCodeIfBlock: exitCodeFor(timingChildVerdict(run) === 'completed' ? 'pass' : 'invalid') });
    save();
  }
  // The grandchild pid read from the file is used only to check that the tree kill ended it; it is never killed.
  const grandchild = Number(readFileSync(pidFile, 'utf8'));
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  let grandchildAlive = alive(grandchild);
  for (let i = 0; i < 50 && grandchildAlive; i++) { await sleep(100); grandchildAlive = alive(grandchild); }
  result.selfCheck.tree = { grandchildAliveAfterKill: grandchildAlive };
  const spawnFail = await runChild([], 5000, join(temp, 'missing-node.exe'));
  result.selfCheck.faults.push({ name: 'spawnError', expected: 'spawn_error', actual: spawnFail.status, pid: spawnFail.pid });
  result.selfCheck.ownership = ownershipControls();
  result.selfCheck.raw = rawControls();
  save();
  for (const f of result.selfCheck.faults) assert.equal(f.actual, f.expected, `fault ${f.name}`);
  for (const f of result.selfCheck.faults.filter(f => f.timingVerdict !== undefined)) assert.equal(f.exitCodeIfBlock, 5);
  const treeFault = result.selfCheck.faults.find(f => f.name === 'treeTimeout');
  assert(treeFault.closeObserved && treeFault.kills[0]?.method === 'taskkill' && treeFault.kills[0].ok, 'owned tree kill with close observed');
  assert.equal(grandchildAlive, false, 'grandchild ended with the tree kill');
  assert.equal(spawnFail.pid, null);
  const o = result.selfCheck.ownership;
  assert(Object.values(o.refused).every(value => value === false) && o.liveKilled === true, 'ownership refusals');
  assert.deepEqual(o.taskkillCalls, [['taskkill', '/PID', '17', '/T', '/F']], 'only the owned live child is killed');
  assert.deepEqual(result.selfCheck.raw, { complete: 'V', missingSample: 'I(raw)', mismatchMissingViews: 'C', invalidAa: 'I(aa)', calibrationUnmet: 'I(run)', mandatoryGap: 'invalid' });
  // Small synthetic run through the real snapshot, worker and aggregation paths (not a gate).
  const { snapshots, modules } = await buildSnapshots(temp, head, logs);
  result.snapshots = snapshots; save();
  const ctx = makeContext(temp);
  const size = 64 * 1024;
  const pickRows = ['O1/F2', 'O1/F5', 'O1/F6', 'O2/F2', 'O2/F7'].map(key => ROWS.find(r => r.key === key));
  const options = { size, maxAttempts: 1, cooldownMs: 0, log: () => {} };
  result.selfCheck.size = size;
  result.selfCheck.timing = [];
  for (const row of pickRows) { result.selfCheck.timing.push(timingFinal(await timingRow(row, ctx, modules, options))); save(); }
  result.selfCheck.info = [];
  for (const row of C.INFO_ROWS.filter(r => C.F1_INFO_KEYS.includes(r.key))) { result.selfCheck.info.push(C.finalizeInfoRow(await timingRow(row, ctx, modules, options))); save(); }
  result.selfCheck.memoryRuns = [];
  for (let repeat = 0; repeat < P.memoryRepeats; repeat++) for (const row of pickRows) for (const arm of repeat % 2 === 0 ? ['B1', 'C1'] : ['C1', 'B1']) {
    result.selfCheck.memoryRuns.push(await memoryRun(row, arm, repeat, ctx, modules, size)); save();
  }
  result.selfCheck.memoryRows = memoryRowsFrom(result.selfCheck.memoryRuns, pickRows).map(row => C.applyRawCheck(row, result.selfCheck.memoryRuns.filter(r => r.key === row.key).flatMap(C.memoryRawViolations)));
  // Harness acceptance: every child completed with its pid and close, outputs matched, raw complete.
  // Gate verdicts at this tiny size are recorded only; they are not the preregistered gate.
  for (const t of result.selfCheck.timing) {
    assert(['pass', 'failed_gate', 'invalid'].includes(t.status), `${t.key} status ${t.status}`);
    assert.equal(t.calibration.child.status, 'completed', `${t.key} calibration`);
    const a = t.attempts[0];
    assert.equal(a.child.status, 'completed', `${t.key} attempt child`); assert.equal(a.samples.length, 144, `${t.key} samples`);
    assert.equal(new Set(Object.values(a.digests)).size, 1, `${t.key} digests`); assert(a.stats && a.stats.B1.n === 30, `${t.key} stats`);
    assert.equal(t.rawComplete, true, `${t.key} raw ${t.rawViolations}`);
  }
  for (const r of result.selfCheck.info) assert(['V', 'X', 'I(aa)'].includes(r.verdict) && r.rawComplete, `${r.key} informational ${r.verdict}`);
  for (const m of result.selfCheck.memoryRuns) { assert.equal(m.status, 'completed', `${m.key} ${m.arm} memory child`); assert(Number.isSafeInteger(m.pid) && m.closeObserved, `${m.key} ${m.arm} owned child`); }
  for (const r of result.selfCheck.memoryRows) assert(['pass', 'failed_gate'].includes(r.status) && r.rawComplete, `${r.key} memory row ${r.status}`);
  return 'self_check_completed';
}
// P10<

// P10> one block per invocation (plan 6.2-6.5; supplement m-3, m-5, m-6, m-7, n-2, n-3). Exported for the
// real-flow tests with injected boundaries; in a real run the CLI entry guard below is the only caller.
const BS = String.fromCharCode(92), NUL = String.fromCharCode(0);
const json = value => JSON.parse(JSON.stringify(value));
let INPUTS_ID = null;
const inputsIdentity = () => (INPUTS_ID ??= Object.fromEntries(Object.entries(INPUTS).map(([id, spec]) => [id, { kind: spec.kind, unitBytes: spec.unit.length, count: Math.floor(SIZE / spec.unit.length), padBytes: SIZE % spec.unit.length, sha256: digest(makeInput(id)) }])));
function identityOf(head, prereg, environmentNow) {
  const blob = path => git(['rev-parse', `${head}:${path}`]);
  return json({ preregistrationCommit: prereg, base: BASE,
    candidateProduct: { commit: C.P10.candProduct, srcTree: blob('src'), packageJson: blob('package.json'), packageLock: blob('package-lock.json'), srcNumstat: C.P10.srcNumstat },
    files: Object.fromEntries([...HARNESS_FILES, 'src/core/policy.ts', 'package.json', 'package-lock.json'].map(file => [file, blob(file)])),
    inputs: inputsIdentity(), protocol: P, p10: C.P10, environment: environmentNow });
}
const tryGit = args => { try { return git(args); } catch (error) { if (error instanceof C.BudgetExpired) throw error; return null; } };
const parentOf = commit => tryGit(['rev-list', '--parents', '-n', '1', commit])?.split(' ').filter(Boolean)[1] ?? null;
const notRunRow = (row, reason) => ({ key: row.key, op: row.op, gate: row.gate, cand: row.cand, ref: row.ref, attempts: [], status: 'notRun', reason });
const PASSING = Object.freeze(['pass', 'completed_informational', 'self_check_completed']);

async function runBlock({ mode, output, prereg: preregArg, checks: runChecks = true }) {
  OWN = newOwnership(); BUDGET = null; PHASE = 'work'; ON_SPAWN = null; SPAWN_SAVE_ERRORS.length = 0;
  const self = mode === 'selfcheck';
  let disposition = null;
  const refuse = (reasonCode, integrityFailure, expected, actual) => {
    const r = { ...C.refusal({ phase: 'preflight', reasonCode, integrityFailure, expected, actual }), ...(mode === 'info' ? { disposition: disposition ?? 'D-3' } : {}) };
    RT.stdout(JSON.stringify(r)); BUDGET = null;
    return r;
  };
  if (!self && !C.P10.blocks.includes(mode)) return refuse('block', false, 'timing|memory|info or --self-check', String(mode));
  const limits = self ? C.P10.selfCheck : { capMs: C.P10.capMs[mode], reserveMs: C.P10.reserveMs };
  BUDGET = C.createBudget({ capMs: limits.capMs, reserveMs: limits.reserveMs, now: RT.now }); // t0: the block starts here
  const startedAt = RT.wallNow().toISOString();
  // ---- preflight: every refusal happens before the output file exists (m-3)
  if (RT.platform !== 'win32') return refuse('platform', false, 'win32', RT.platform);
  if (RT.nodeVersion !== 'v24.18.0') return refuse('node_version', false, 'v24.18.0', RT.nodeVersion);
  if (runChecks) { try { checks(); p10Checks(); } catch (error) { return refuse('checks', false, 'PASS', String(error.message).slice(0, 300)); } }
  let OUTPUT;
  if (self) {
    const v = typeof output === 'string' ? C.selfCheckOutputViolations(output, ROOT) : ['missing'];
    if (v.length) return refuse('output_name', false, 'absolute path outside the repository named selfcheck-<name>.json', v.join(','));
    OUTPUT = resolve(output);
  } else {
    const rel = String(output ?? '').replaceAll(BS, '/');
    if (rel !== C.officialOutput(mode)) return refuse('output_name', false, C.officialOutput(mode), rel);
    OUTPUT = join(ROOT, rel);
  }
  if (existsSync(OUTPUT)) return refuse('output_exists', false, 'absent', 'present');
  if (git(['status', '--porcelain']) !== '') return refuse('dirty_tree', true, 'clean', 'changes');
  const head = git(['rev-parse', 'HEAD']);
  let prereg = null;
  if (!self) {
    if (!preregArg) return refuse('prereg_missing', false, '--prereg=<sha>', 'absent');
    prereg = tryGit(['rev-parse', preregArg]);
    if (!prereg) return refuse('prereg_unknown', true, 'commit', String(preregArg));
    if (tryGit(['merge-base', '--is-ancestor', prereg, head]) === null) return refuse('prereg_not_ancestor', true, 'ancestor of HEAD', head);
    if (tryGit(['diff', '--exit-code', prereg, head, '--', ...HARNESS_FILES, 'src']) === null) return refuse('harness_changed', true, 'no change', 'changed');
    const last = git(['log', '-1', '--format=%H', head, '--', ...HARNESS_FILES]);
    if (last !== prereg) return refuse('prereg_not_last_harness_commit', true, prereg, last);
    if (mode === 'timing' && head !== prereg) return refuse('head_not_prereg', true, prereg, head); // m-6: Ht = prereg
  }
  const numstat = git(['diff', '--numstat', BASE, head, '--', 'src']);
  if (numstat !== C.P10.srcNumstat) return refuse('src_numstat', true, C.P10.srcNumstat, numstat);
  const productDiff = git(['diff', C.P10.candProduct, head, '--name-only', '--', 'src', 'package.json', 'package-lock.json', 'bin']);
  if (productDiff !== '') return refuse('product_changed', true, 'no change from the CAND product', `${productDiff.split('\n').length} files`);
  const tracked = git(['ls-files', '-z']).split(NUL).filter(Boolean);
  const before = tracked.map(file => ({ file, hash: existsSync(join(ROOT, file)) ? hashFile(join(ROOT, file)) : null }));
  const identity = identityOf(head, prereg, json(environment()));
  // ---- prior blocks: exact raw-only commit chain, receipt, validators re-run, identity (m-6, m-7, n-2)
  const prior = {};
  if (mode === 'memory' || mode === 'info') {
    const hm = mode === 'memory' ? head : parentOf(head);
    const chain = mode === 'memory' ? [['timing', prereg, head]] : [['timing', prereg, hm], ['memory', hm, head]];
    const identityReasons = [];
    for (const [block, from, to] of chain) {
      let v, reasons;
      try { v = to ? C.verifyRawOnlyCommit({ git, readBlob, from, to, path: C.officialOutput(block), block }) : { reasons: ['no_parent'] }; }
      catch (error) { v = { reasons: [`exception:${String(error.message).slice(0, 200)}`] }; }
      if (v.reasons.length) return refuse('prior_chain', true, `${block}: one raw-only commit with a passing receipt`, `${block}: ${v.reasons.join(',')}`);
      try { reasons = C.validatePriorBlock(v.doc, { block, expected: identity, timingFinal, memoryOutcome, rederive: priorRederive }); }
      catch (error) { reasons = [`prior_validation_exception:${String(error.message).slice(0, 200)}`]; }
      const blockReasons = reasons.filter(r => !r.startsWith('identity:'));
      if (blockReasons.length) return refuse('prior_block_invalid', true, `${block}: verified pass`, `${block}: ${blockReasons.join(',')}`);
      identityReasons.push(...reasons.map(r => `${block}:${r}`));
      prior[block] = { commit: to, receipt: v.receipt, doc: v.doc };
    }
    if (identityReasons.length) { disposition = 'D-4'; return refuse('identity_mismatch', true, 'same identity as the prior blocks', identityReasons.join(',')); }
  }
  // ---- the output exists from here on; a parent abort leaves it 'incomplete'
  mkdirSync(dirname(OUTPUT), { recursive: true });
  const temp = mkdtempSync(join(RT.tmpRoot, TEMP_PREFIX));
  const logs = join(temp, 'logs'); mkdirSync(logs);
  const result = { schema: SCHEMA, run: C.P10.runId, block: mode, status: 'incomplete', startedAt, ...identity, measurementHead: head,
    budgetPlan: { capMs: limits.capMs, reserveMs: limits.reserveMs, steps: C.P10.steps, needs: C.NEEDS },
    priorBlocks: Object.fromEntries(Object.entries(prior).map(([block, p]) => [block, { commit: p.commit, receipt: p.receipt }])),
    preflight: { srcNumstat: numstat, productDiffFiles: 0, trackedFiles: before.length },
    schedule: scheduleFacts(schedule()), build: null, snapshots: {}, rows: [], runs: [], integrityErrors: [], finalizationErrors: [], children: [] };
  const escaped = path => path.replaceAll(BS, BS + BS);
  const normalized = value => JSON.parse(JSON.stringify(value).replaceAll(escaped(temp), '<temp>').replaceAll(escaped(ROOT), '<repo>'));
  const save = () => { result.children = OWN.records(); RT.writeOutput(OUTPUT, JSON.stringify(normalized(result), null, 2) + '\n'); };
  const log = message => RT.stdout(message);
  let bodyError = false;
  try {
    save();
    ON_SPAWN = save;
    if (self) result.status = await selfCheck(result, temp, head, logs, save);
    else {
      let built = null;
      try { built = await buildChecked(temp, head, logs); result.build = { status: 'completed' }; }
      catch (error) {
        if (error instanceof C.IntegrityError) result.integrityErrors.push(`${error.code}: ${error.message}`);
        if (!(error instanceof C.BudgetExpired)) { result.build = { status: 'error' }; throw error; }
        result.build = { status: 'build_incomplete', reason: error.message };
      }
      if (!built) {
        const plan = mode === 'info' ? C.INFO_ROWS : ROWS;
        result.rows = plan.map(r => (mode === 'info' ? C.finalizeInfoRow : timingFinal)(notRunRow(r, 'build_incomplete')));
      } else {
        result.snapshots = built.snapshots; save();
        for (const [block, p] of Object.entries(prior)) if (!isDeepStrictEqual(C.snapshotIdentity(p.doc.snapshots), C.snapshotIdentity(json(built.snapshots)))) result.integrityErrors.push(`snapshot_identity:${block}`);
        if (mode === 'memory' && result.integrityErrors.length) throw new Error(`snapshots differ from the timing block: ${result.integrityErrors.join(',')}`);
        const ctx = makeContext(temp);
        if (mode === 'timing') {
          // Plan 6.3: stop at the first row that is not a pass (valid FAIL: no retry, no relaxation).
          for (const [index, row] of ROWS.entries()) {
            if (!BUDGET.canStart(C.NEEDS.row)) { result.rows.push(...ROWS.slice(index).map(r => timingFinal(notRunRow(r, 'budget')))); save(); break; }
            const entry = timingFinal(await timingRow(row, ctx, built.modules, { size: SIZE, maxAttempts: P.maxAttempts, cooldownMs: P.cooldownMs, log, budget: BUDGET }));
            result.rows.push(entry);
            if (entry.status === 'notRun') result.rows.push(...ROWS.slice(index + 1).map(r => timingFinal(notRunRow(r, 'budget'))));
            save();
            const sel = entry.attempts.find(a => a.number === entry.selectedAttempt);
            log(JSON.stringify({ key: entry.key, k: entry.k, status: entry.status, reason: entry.reason, reference: sel?.stats?.B1, candidate: sel?.stats?.C1 }));
            if (entry.status !== 'pass') break;
          }
        } else if (mode === 'memory') {
          // One child at a time; even repeats BASE->CAND, odd repeats CAND->BASE (repeat first, m-2).
          memory: for (let repeat = 0; repeat < P.memoryRepeats; repeat++) for (const row of ROWS) for (const arm of repeat % 2 === 0 ? ['B1', 'C1'] : ['C1', 'B1']) {
            if (!BUDGET.canStart(C.NEEDS.memoryChild)) { result.budgetStop = { repeat, key: row.key, arm }; break memory; }
            const run = await memoryRun(row, arm, repeat, ctx, built.modules, SIZE);
            result.runs.push(run); save();
            log(JSON.stringify({ key: run.key, repeat, arm, status: run.status, R: run.retainedBytes, P: run.maxRssBytes }));
          }
        } else {
          // Informational only (never gate-bearing): CAND(X) vs BASE(X) on the G-C inputs, one attempt.
          for (const [index, row] of C.INFO_ROWS.entries()) {
            if (!BUDGET.canStart(C.NEEDS.row)) { result.rows.push(...C.INFO_ROWS.slice(index).map(r => C.finalizeInfoRow(notRunRow(r, 'budget')))); save(); break; }
            result.rows.push(C.finalizeInfoRow(await timingRow(row, ctx, built.modules, { size: SIZE, maxAttempts: 1, cooldownMs: 0, log, budget: BUDGET })));
            save();
          }
        }
      }
    }
  } catch (error) {
    bodyError = true; result.error = String(error.stack ?? error.message).slice(0, 4000);
    if (error instanceof C.BudgetExpired) result.budgetExpired = true;
  }
  if (mode === 'memory' && result.build?.status === 'completed') {
    const outcome = memoryOutcome(result.runs);
    if (result.runs.length || !bodyError) { result.rows = outcome.rows; result.refFailedRows = outcome.refFailedRows; result.rawIncompleteRows = outcome.rawIncompleteRows; }
  } else if (mode === 'memory' && result.build?.status === 'build_incomplete') result.rows = ROWS.map(r => notRunRow(r, 'build_incomplete'));
  // ---- finalization: uses the remaining total budget (R once)
  ON_SPAWN = null;
  const workEndMs = BUDGET.elapsedMs();
  PHASE = 'final';
  const finalize = (code, action) => { try { action(); } catch (error) { result.finalizationErrors.push(`${code}: ${String(error.message).slice(0, 300)}`); } };
  finalize('environment', () => {
    result.finalEnvironment = json(environment());
    if (!isDeepStrictEqual(result.finalEnvironment, result.environment)) { result.integrityErrors.push('environment_changed'); throw new Error('environment changed'); }
  });
  finalize('preservation', () => {
    const changed = before.filter(row => row.hash !== (existsSync(join(ROOT, row.file)) ? hashFile(join(ROOT, row.file)) : null));
    result.preservation = { trackedFiles: before.length, changed: changed.map(row => row.file) };
    if (changed.length) { result.integrityErrors.push('tracked_files_changed'); throw new Error(`${changed.length} tracked files changed`); }
  });
  finalize('temp_cleanup', () => {
    const actual = realpathSync(temp);
    assert.equal(dirname(actual).toLowerCase(), realpathSync(RT.tmpRoot).toLowerCase()); assert(basename(actual).startsWith(TEMP_PREFIX));
    rmSync(actual, { recursive: true, force: true }); result.tempCleanup = !existsSync(actual);
    if (!result.tempCleanup) throw new Error('temp directory left');
  });
  finalize('owned_processes', () => {
    const unclosed = OWN.leftovers();
    if (unclosed.length) result.blockEndKills = OWN.killUnclosed(() => BUDGET.finalTimeout(C.P10.steps.kill)?.ms ?? 0); // primary r1 M1
    result.leftoverPids = unclosed;
    result.cleanupViolations = C.cleanupViolations(OWN.records());
    if (result.cleanupViolations.length) throw new Error(`owned process cleanup not confirmed: ${result.cleanupViolations.join(',')}`);
  });
  finalize('spawn_saves', () => { if (SPAWN_SAVE_ERRORS.length) { result.spawnSaveErrors = [...SPAWN_SAVE_ERRORS]; throw new Error(`${SPAWN_SAVE_ERRORS.length} saves at spawn failed`); } });
  result.budget = C.budgetRecord(BUDGET, { workEndMs, finalStartMs: workEndMs, finalEndMs: BUDGET.elapsedMs() });
  if (result.budget.capOverrunMs > 0) result.finalizationErrors.push(`cap_overrun: ${result.budget.capOverrunMs}`);
  const finalizationFailed = result.finalizationErrors.length > 0;
  const setInfo = () => {
    result.integrity = C.infoIntegrity({ rows: result.rows, integrityErrors: result.integrityErrors });
    result.verdicts = Object.fromEntries(result.rows.map(r => [r.key, r.verdict]));
    result.disposition = C.disposition({ j2Pass: true, info: { status: result.status, integrityFailure: result.integrity.failure, verdicts: result.verdicts } });
  };
  if (self) result.status = !bodyError && !finalizationFailed && result.status === 'self_check_completed' ? 'self_check_completed' : 'error';
  else if (mode === 'info') { result.status = C.infoBlockStatus({ rows: result.rows, bodyError, finalizationFailed }); setInfo(); }
  else result.status = C.mandatoryBlockStatus({ rows: result.rows, bodyError, finalizationFailed });
  if (mode === 'timing') result.notRun = ROWS.map(r => r.key).filter(key => !result.rows.some(r => r.key === key && r.status !== 'notRun'));
  if (mode === 'timing') result.rawIncompleteRows = result.rows.filter(r => !r.rawComplete).map(r => r.key);
  result.exitCode = C.exitCodeFor(result.status);
  result.finishedAt = RT.wallNow().toISOString();
  // ---- final save, hash and receipt; the save and hash count inside C (supplement n-2)
  const finalSave = () => { save(); return digest(readFileSync(OUTPUT)); };
  const receiptFor = (sha256, elapsedMs, extra = {}) => ({ receipt: 'p10', run: C.P10.runId, block: mode, output: self ? basename(OUTPUT) : C.officialOutput(mode), sha256, status: result.status, exitCode: result.exitCode,
    elapsedMs: Math.ceil(elapsedMs), capMs: limits.capMs, capOverrunMs: Math.max(0, Math.ceil(elapsedMs - limits.capMs)), errors: [...(bodyError ? ['body'] : []), ...result.finalizationErrors.map(e => e.split(':')[0])], ...extra });
  let receipt;
  try {
    let sha = finalSave();
    let elapsed = BUDGET.elapsedMs();
    if (elapsed > limits.capMs) {
      const overrun = Math.ceil(elapsed - limits.capMs);
      result.budget.capOverrunAfterSaveMs = overrun; result.budget.capOverrunMs = Math.max(result.budget.capOverrunMs, overrun);
      result.finalizationErrors.push(`cap_overrun_after_save: ${overrun}`);
      if (PASSING.includes(result.status)) { result.status = 'error'; result.exitCode = 1; }
      if (mode === 'info') setInfo();
      sha = finalSave();
      elapsed = BUDGET.elapsedMs();
    }
    receipt = receiptFor(sha, elapsed);
  } catch (error) {
    receipt = receiptFor(null, BUDGET.elapsedMs(), { status: 'error', exitCode: 1, saveFailed: true, saveError: String(error.message).slice(0, 200) });
  }
  RT.stdout(C.formatReceipt(receipt));
  RT.stdout(JSON.stringify({ block: mode, status: receipt.status, exitCode: receipt.exitCode, output: receipt.output, ...(mode === 'info' ? { disposition: result.disposition } : {}) }));
  PHASE = 'work';
  return { status: receipt.status, exitCode: receipt.exitCode, receipt };
}

async function main() {
  const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (process.argv.includes('--check-only')) {
    checks();
    const p10 = p10Checks();
    console.log(JSON.stringify({ status: 'PASS', timedCalls: 0, checks: 'run3 statistics, gates, schedule, schedule controls, calibration, classification, aggregation, inputs; P10 copy guard, step limits, row mapping controls, outputs', circuits: P.circuits, schedule: scheduleFacts(schedule()),
      controls: Object.fromEntries(Object.entries(SCHEDULE_CONTROLS).map(([name, circuits]) => [name, { circuits, violations: scheduleViolations(schedule(circuits)) }])), ...p10 }));
    return;
  }
  const self = process.argv.includes('--self-check');
  const out = await runBlock({ mode: self ? 'selfcheck' : arg('block'), output: arg('output'), prereg: arg('prereg') });
  process.exitCode = out.exitCode;
}
export { HARNESS_FILES, copyGuard, memoryOutcome, ownershipLeftovers, runBlock, runChild, schedule, setRuntime, timingFinal };
// Entry guard (m-5): importing this module never runs main.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
// P10<
