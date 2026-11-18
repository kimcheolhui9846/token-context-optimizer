// N-34 K1 D1 diagnostic runner (exploratory, NOT a performance gate).
// Approval: codex_review/review_2026-11-16_n34-k1-d1-approval.md (user approved 2026-11-16).
// Protocol: docs/agent/handoffs/n34-k1-diag-prereg.md (frozen) + amendment-1 (frozen) + amendment-2. Separate from the official K1 timing/memory
// protocol (n34-k1-perf.mjs, n34-k1-prereg.md), whose files and raw are not touched.
//
// Modes
//   --check-only                                  synthetic checks of the pure functions below
//   --check-run --prereg=<sha> --output=research/results/n34-k1/diagcheck-<name>.json
//        one 64 KiB support check: children a1, b1 only (same 144-sample schedule)
//   --prereg=<sha> --output=research/results/n34-k1/diag-<name>.json
//        the main D1: 10 MiB, children a1 b1 b2 a2 a3 b3 (run only after primary preflight)
// Every child writes JSONL records directly to <output stem>/child-<pos>-<cond>.jsonl as it goes.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { constants as PERF, performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA = 'n34-k1-diag/v1';
const BASE = '7e732e0e07a1977dbf0c754319fd3a726924621e';
const CAND = '4999c1f14b229d8c856200d49fdacd2d4611dc81';
const RUNNER = 'research/src/n34-k1-diag.mjs';
const WORKER = 'research/src/n34-k1-diag-worker.mjs';
const INPUTS_MODULE = 'research/src/n34-cr-policy-perf-inputs.mjs';
const PROTOCOL = 'docs/agent/handoffs/n34-k1-diag-prereg.md'; // frozen at 8f29f19
const AMENDMENT = 'docs/agent/handoffs/n34-k1-diag-prereg-amendment-1.md'; // preflight fix: integrity + budget (frozen at 00404de)
const AMENDMENT2 = 'docs/agent/handoffs/n34-k1-diag-prereg-amendment-2.md'; // P01: GC/probe/drain cross-integrity, rankNote
const HARNESS_FILES = [RUNNER, WORKER, INPUTS_MODULE, PROTOCOL, AMENDMENT, AMENDMENT2];
const RESULTS_DIR = 'research/results/n34-k1';
const NPM = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const TAR = 'C:/Windows/System32/tar.exe';
const MIB = 1024 * 1024;
const MIN = 60 * 1000;
const TEMP_PREFIX = 'tco-n34-k1-diag-';
export const D = Object.freeze({
  input: 'F3', op: 'O2', k: 1, mainSize: 10 * MIB, checkSize: 64 * 1024,
  circuits: Object.freeze(['ABCDBDCADACB', 'ADACDBDCBABC']), circuitMap: Object.freeze({ A: 'B1', B: 'B2', C: 'C2', D: 'C1' }),
  warmupCircuits: 2, measureCircuits: 10, samplesPerChild: 144, measuredPerCopy: 30,
  order: Object.freeze(['a', 'b', 'b', 'a', 'a', 'b']), checkOrder: Object.freeze(['a', 'b']),
  pairs: Object.freeze([[1, 2], [4, 3], [5, 6]]), // (a position, b position), difference b - a
  nodeArgs: Object.freeze(['--expose-gc']),
  capMs: 75 * MIN, childTimeoutMs: 12 * MIN,
  probeWaitMs: 1000, drainStepMs: 100, drainQuietSteps: 2, drainMaxMs: 2000,
  modeGapMs: 100, modeMinSide: 10,
});
export const GC_KIND = Object.freeze({ [PERF.NODE_PERFORMANCE_GC_MAJOR]: 'major', [PERF.NODE_PERFORMANCE_GC_MINOR]: 'minor', [PERF.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental', [PERF.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb' });
export const GC_FLAG_FORCED = PERF.NODE_PERFORMANCE_GC_FLAGS_FORCED;
const KINDS = ['major', 'minor', 'incremental', 'weakcb', 'other'];

// ==== PURE FUNCTIONS BEGIN ====
// Official schedule shape: circuit c of each block uses circuits[c % 2]; warmup 2 + measure 10 circuits.
export function schedule() {
  const list = [];
  for (const [block, n] of [['warmup', D.warmupCircuits], ['measure', D.measureCircuits]])
    for (let c = 0; c < n; c++) for (const letter of D.circuits[c % D.circuits.length]) list.push({ label: `${block}/${c}`, arm: D.circuitMap[letter] });
  return list;
}
// Nearest rank: sorted[ceil(n*p) - 1].
export function nearestRank(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.ceil(s.length * p) - 1];
}
// Intersection of [s, e] with window [ws, we]; null when the overlap has zero length.
export function clip([s, e], [ws, we]) {
  const lo = Math.max(s, ws), hi = Math.min(e, we);
  return hi > lo ? [lo, hi] : null;
}
// Length of the union of intervals (overlapping or duplicated intervals counted once).
export function unionLength(intervals) {
  const sorted = intervals.filter(Boolean).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]);
  let total = 0, cur = null;
  for (const [a, b] of sorted) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}
export const eventInterval = e => [e.startTime, e.startTime + e.duration];
// CPU/wall, dimensionless: (user us + system us) / (1000 * wall ms). Process-wide CPU.
export function cpuWallRatio(userUs, systemUs, wallMs) {
  if (![userUs, systemUs, wallMs].every(Number.isFinite) || wallMs <= 0) return null;
  return (userUs + systemUs) / (1000 * wallMs);
}
// GC attribution for one sample. observation: 'supported' | 'unsupported' | 'incomplete'.
// Values stay null (never a clean 0) unless observation is supported and the sample is unambiguous.
export function attributeSample(sample, events, forcedWindows, observation) {
  const win = [sample.t0, sample.t2], phases = { index: [sample.t0, sample.t1], summarize: [sample.t1, sample.t2] };
  const touching = events.filter(e => clip(eventInterval(e), win));
  const crossover = touching.filter(e => forcedWindows.some(f => clip(eventInterval(e), [f.start, f.end])));
  const out = { status: null, crossoverEvents: crossover.map(e => e.seq), overlapMs: null, phaseMajorMs: null, startedInSample: null };
  if (observation !== 'supported') { out.status = observation === 'unsupported' ? 'unobserved' : 'incomplete'; return out; }
  if (crossover.length) { out.status = 'ambiguous'; return out; }
  out.status = 'observed';
  out.overlapMs = Object.fromEntries(KINDS.map(k => [k, unionLength(touching.filter(e => e.kindName === k).map(e => clip(eventInterval(e), win)))]));
  out.overlapMs.any = unionLength(touching.map(e => clip(eventInterval(e), win)));
  const majors = touching.filter(e => e.kindName === 'major');
  out.phaseMajorMs = Object.fromEntries(Object.entries(phases).map(([k, w]) => [k, unionLength(majors.map(e => clip(eventInterval(e), w)))]));
  out.startedInSample = Object.fromEntries(KINDS.map(k => [k, touching.filter(e => e.kindName === k && e.startTime >= sample.t0 && e.startTime < sample.t2).length]));
  return out;
}
// Spearman rank correlation with average ranks for ties. Returns { value, reason }.
export function spearman(x, y) {
  if (x.length !== y.length) return { value: null, reason: 'length_mismatch' };
  if (x.some(v => !Number.isFinite(v)) || y.some(v => !Number.isFinite(v))) return { value: null, reason: 'missing_values' };
  if (x.length < 3) return { value: null, reason: 'too_few' };
  const rank = v => { const idx = v.map((val, i) => [val, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0;
    while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  if (sxx === 0) return { value: null, reason: 'zero_variance_x' };
  if (syy === 0) return { value: null, reason: 'zero_variance_y' };
  return { value: sxy / Math.sqrt(sxx * syy), reason: null };
}
// Auxiliary cluster description only (largest gap). Never used to invalidate continuous statistics.
export function largestGap(values) {
  if (values.length < 2) return { gapMs: null, below: values.length, above: 0, modes: 'no-separated-modes' };
  const s = [...values].sort((a, b) => a - b);
  let best = 1;
  for (let i = 2; i < s.length; i++) if (s[i] - s[i - 1] > s[best] - s[best - 1]) best = i;
  const gapMs = s[best] - s[best - 1], below = best, above = s.length - best;
  return { gapMs, boundary: (s[best] + s[best - 1]) / 2, below, above, modes: gapMs >= D.modeGapMs && below >= D.modeMinSide && above >= D.modeMinSide ? 'separated' : 'no-separated-modes' };
}
// JSONL parser that never normalizes a damaged stream: every problem is listed.
export function parseJsonl(text) {
  const records = [], problems = [];
  if (!text) return { records, problems, endsWithNewline: true };
  const endsWithNewline = text.endsWith('\n');
  const lines = text.split('\n');
  if (endsWithNewline) lines.pop();
  lines.forEach((line, i) => {
    const last = i === lines.length - 1;
    if (!line.trim()) { problems.push({ line: i, problem: 'blank_line' }); return; }
    try { records.push(JSON.parse(line)); } catch { problems.push({ line: i, problem: last && !endsWithNewline ? 'truncated_last_line' : 'parse_error' }); }
  });
  if (!endsWithNewline && !problems.some(p => p.problem === 'truncated_last_line')) problems.push({ line: lines.length - 1, problem: 'missing_final_newline' });
  return { records, problems, endsWithNewline };
}
const SAMPLE_FIELDS = ['i', 'label', 'arm', 't0', 't1', 't2', 'wallMs', 'indexMs', 'summarizeMs', 'cpuUserUs', 'cpuSystemUs', 'heapBefore', 'heapAfter'];
const RECORD_TYPES = new Set(['start', 'probe', 'digest', 'forced', 'sample', 'gc', 'drain', 'end', 'error']);
const ARMS = ['B1', 'B2', 'C1', 'C2'];
const EPS = 1e-6;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isCount = v => Number.isInteger(v) && v >= 0;
const isHeap = h => isObj(h) && isNum(h.used) && h.used >= 0 && isNum(h.total) && h.total >= 0;
const isDigest = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
// Integrity problems of one sample (preflight fix R2): structure, finite values, ranges, time relations.
export function sampleProblems(s, i, expected = schedule(), prev = null) {
  if (!isObj(s)) return ['record'];
  const p = [];
  const missing = SAMPLE_FIELDS.filter(f => s[f] === undefined || s[f] === null);
  if (missing.length) p.push(`missing:${missing.join('/')}`);
  if (s.i !== i || s.label !== expected[i]?.label || s.arm !== expected[i]?.arm) p.push('order');
  const present = f => s[f] !== undefined && s[f] !== null;
  for (const f of ['t0', 't1', 't2']) if (present(f) && !isNum(s[f])) p.push(`value:${f}`);
  for (const f of ['wallMs', 'indexMs', 'summarizeMs']) if (present(f) && !(isNum(s[f]) && s[f] >= 0)) p.push(`value:${f}`);
  for (const f of ['cpuUserUs', 'cpuSystemUs']) if (present(f) && !isCount(s[f])) p.push(`value:${f}`);
  for (const f of ['heapBefore', 'heapAfter']) if (present(f) && !isHeap(s[f])) p.push(`value:${f}`);
  if ([s.t0, s.t1, s.t2].every(isNum)) {
    if (!(s.t0 <= s.t1 && s.t1 <= s.t2) || (isObj(prev) && isNum(prev.t2) && s.t0 < prev.t2)) p.push('time_order');
    if ([s.wallMs, s.indexMs, s.summarizeMs].every(isNum)
      && (Math.abs(s.wallMs - (s.t2 - s.t0)) > EPS || Math.abs(s.indexMs - (s.t1 - s.t0)) > EPS || Math.abs(s.summarizeMs - (s.t2 - s.t1)) > EPS)) p.push('derived_mismatch');
  }
  return p;
}
// Problems of one GC event record; k is its position among GC records (the worker numbers them 0, 1, ...).
export function gcProblems(e, k) {
  if (!isObj(e)) return ['record'];
  const p = [];
  if (e.seq !== k) p.push('seq');
  if (!(isNum(e.startTime) && e.startTime >= 0)) p.push('startTime');
  if (!(isNum(e.duration) && e.duration >= 0)) p.push('duration');
  if (!Number.isInteger(e.kind) || !(e.kind in GC_KIND)) p.push('kind');
  if (!isCount(e.flags)) p.push('flags');
  if (!isNum(e.arrivedAt)) p.push('arrivedAt');
  return p;
}
// Validates one child's parsed stream against the approved design. condition 'a' | 'b'.
// reasons (measurement/structure) -> invalid; observationReasons (GC/probe/drain metadata) -> incomplete, values null.
export function childOutcome({ condition, exit, records, problems, expected = schedule() }) {
  const reasons = [], observationReasons = [];
  const valid = [];
  for (const r of records) {
    if (!isObj(r) || typeof r.type !== 'string') { reasons.push('record:invalid'); continue; }
    if (!RECORD_TYPES.has(r.type)) { reasons.push(`record:unknown_type:${r.type}`); continue; }
    valid.push(r);
  }
  const by = type => valid.filter(r => r.type === type);
  const samples = by('sample'), forced = by('forced'), gc = by('gc'), starts = by('start'), probes = by('probe'), drains = by('drain'), ends = by('end'), digests = by('digest');
  if (exit.status !== 'exited' || exit.exitCode !== 0) reasons.push(`process:${exit.status}:${exit.exitCode}`);
  if (problems.length) reasons.push(`stream:${problems.map(p => p.problem).join(',')}`);
  if (by('error').length) reasons.push('record:error');
  if (!starts.length) reasons.push('missing:start');
  else if (starts.length !== 1 || records[0] !== starts[0] || starts[0].condition !== condition) reasons.push('start');
  if (!ends.length || ends.at(-1).status !== 'completed') reasons.push('missing:end');
  if (ends.length > 1 || (ends.length === 1 && records.at(-1) !== ends[0])) reasons.push('end:position');
  if (samples.length !== expected.length) reasons.push(`samples:${samples.length}`);
  samples.forEach((s, i) => { for (const p of sampleProblems(s, i, expected, samples[i - 1])) reasons.push(`sample${i}:${p}`); });
  if (digests.length !== 4 || ARMS.some(arm => digests.filter(d => d.arm === arm).length !== 1) || !digests.every(d => isDigest(d.digest))
    || new Set(digests.map(d => d.digest)).size !== 1) reasons.push('digest');
  if (condition === 'a' && forced.length !== 0) reasons.push(`forced:${forced.length}`);
  if (condition === 'b') {
    if (forced.length !== expected.length) reasons.push(`forced:${forced.length}`);
    forced.forEach((f, k) => {
      if (f.i !== k || !isNum(f.start) || !isNum(f.end) || f.start > f.end) { reasons.push(`forced${k}:value`); return; }
      const s = samples[k], prev = samples[k - 1];
      if (!s || !isNum(s.t0) || !(f.end <= s.t0) || (prev && !(isNum(prev.t2) && f.start >= prev.t2))) reasons.push(`forced${k}:position`);
    });
  }
  let observation;
  const probe = probes[0];
  if (!probes.length || (probes.length === 1 && probe.supported === false)) observation = 'unsupported';
  else {
    if (probes.length !== 1) observationReasons.push('probe:count');
    if (probe.supported !== true) observationReasons.push('probe:supported');
    if (typeof probe.clockOk !== 'boolean') observationReasons.push('probe:clockOk_value');
    else if (!probe.clockOk) observationReasons.push('probe:clock');
    if (!isNum(probe.before) || !isNum(probe.after) || probe.before > probe.after) observationReasons.push('probe:window');
    const forcedList = Array.isArray(probe.forcedEvents) ? probe.forcedEvents : [];
    const forcedValid = forcedList.length > 0 && forcedList.every(e => isObj(e) && isNum(e.startTime) && isNum(e.duration) && e.duration >= 0 && isCount(e.flags) && (e.flags & GC_FLAG_FORCED) !== 0);
    if (!forcedValid) observationReasons.push('probe:forcedEvents');
    // Cross-integrity with the worker (P01). The worker attaches the observer synchronously right before the
    // probe capture starts and writes the probe record synchronously right after it ends, and every captured
    // entry is also written as a GC record. So the GC records before the probe record are exactly the capture.
    const probeAt = records.indexOf(probe);
    const captured = records.slice(0, probeAt).filter(r => isObj(r) && r.type === 'gc');
    if (!isCount(probe.observedEvents) || probe.observedEvents !== captured.length) observationReasons.push('probe:observedEvents');
    const view = e => JSON.stringify({ startTime: e?.startTime, duration: e?.duration, flags: e?.flags });
    const streamForced = captured.filter(e => isCount(e.flags) && (e.flags & GC_FLAG_FORCED) !== 0).map(view);
    if (forcedList.length !== streamForced.length || forcedList.some((e, k) => view(e) !== streamForced[k])) observationReasons.push('probe:stream_mismatch');
    if (probe.clockOk === true && forcedValid && isNum(probe.before) && isNum(probe.after)
      && !forcedList.some(e => e.startTime >= probe.before && e.startTime <= probe.after)) observationReasons.push('probe:clock_contradiction');
    if (drains.length !== 1) observationReasons.push(`drain:count:${drains.length}`);
    else {
      const d = drains[0];
      if (typeof d.complete !== 'boolean') observationReasons.push('drain:complete_value');
      else if (!d.complete) observationReasons.push('drain:incomplete');
      if (!isCount(d.steps) || !(isNum(d.drainMs) && d.drainMs >= 0)) observationReasons.push('drain:value');
      // worker: complete means drainQuietSteps consecutive quiet steps were taken
      else if (d.complete === true && d.steps < D.drainQuietSteps) observationReasons.push('drain:steps_below_quiet');
      // worker: totalEvents is the number of GC records it wrote; a lost or extra record is a contradiction
      if (!Number.isSafeInteger(d.totalEvents) || d.totalEvents < 0) observationReasons.push('drain:totalEvents_value');
      else if (d.totalEvents !== gc.length) observationReasons.push(`drain:totalEvents_mismatch:${d.totalEvents}/${gc.length}`);
    }
    gc.forEach((e, k) => { for (const p of gcProblems(e, k)) observationReasons.push(`gc${k}:${p}`); });
    observation = observationReasons.length ? 'incomplete' : 'supported';
  }
  const status = reasons.length === 0 ? 'completed' : (exit.status === 'timeout' ? 'timeout' : 'invalid');
  return { status, reasons, observation, observationReasons, counts: { samples: samples.length, forced: forced.length, gcEvents: gc.length } };
}
// Whether the next child may start: remaining time since runner start must be >= one child timeout.
export function canStartChild(elapsedMs, capMs = D.capMs, childTimeoutMs = D.childTimeoutMs) {
  return capMs - elapsedMs >= childTimeoutMs;
}
const dir = d => (d === null ? 'unavailable' : d < 0 ? 'lower' : d > 0 ? 'higher' : 'tied');
// b - a for the approved pairs; values: position (1-based) -> number | null.
export function pairDirections(values) {
  const diffs = D.pairs.map(([a, b]) => (Number.isFinite(values[a]) && Number.isFinite(values[b]) ? values[b] - values[a] : null));
  const dirs = diffs.map(dir);
  const overall = dirs.includes('unavailable') ? 'unavailable' : new Set(dirs).size === 1 ? dirs[0] : 'mixed';
  return { diffs, directions: dirs, overall };
}
// Refuse to overwrite any existing path.
export function refuseOverwrite(path) {
  if (existsSync(path)) throw new Error(`refusing to overwrite ${path}`);
}
// Remove an owned temporary directory: real path must sit directly under the allowed root with our prefix.
export function safeRemove(path, allowedRoot, prefix) {
  const actual = realpathSync(path);
  if (dirname(actual).toLowerCase() !== realpathSync(allowedRoot).toLowerCase()) throw new Error(`not under allowed root: ${actual}`);
  if (!basename(actual).startsWith(prefix)) throw new Error(`not an owned temp dir: ${actual}`);
  rmSync(actual, { recursive: true, force: true });
  return !existsSync(actual);
}
// ---- global run budget (preflight fix R1) ----
// One monotonic deadline from runner start. Every subprocess step gets min(its own timeout, remaining);
// once remaining is 0 no new step starts. A step stopped by the budget-limited timeout is BudgetExpired.
export class BudgetExpired extends Error {
  constructor(message) { super(message); this.name = 'BudgetExpired'; }
}
export function createDeadline(capMs, now = () => performance.now()) {
  const start = now();
  const d = {
    capMs,
    elapsed: () => now() - start,
    remaining: () => Math.max(0, capMs - (now() - start)),
    expired: () => now() - start >= capMs,
    timeoutFor(individualMs, what = 'step') {
      const remaining = d.remaining();
      if (remaining <= 0) throw new BudgetExpired(`${what}: global ${capMs} ms budget expired before start`);
      return remaining < individualMs ? { ms: Math.max(1, Math.floor(remaining)), budgetLimited: true } : { ms: individualMs, budgetLimited: false };
    },
  };
  return d;
}
const isTimeoutError = error => error?.code === 'ETIMEDOUT' || error?.timedOut === true;
export function runBudgeted(deadline, individualMs, fn, what = 'step') {
  const { ms, budgetLimited } = deadline.timeoutFor(individualMs, what);
  try { return fn(ms); } catch (error) {
    if (budgetLimited && isTimeoutError(error)) throw new BudgetExpired(`${what}: stopped at the global budget`);
    throw error;
  }
}
// Build, then children in order. Build stopped by the budget -> every child notRun(build_incomplete).
// A child starts only with >= one child timeout remaining, and gets min(child timeout, remaining).
// A child that throws is recorded and later children still run; other build errors propagate.
export async function executeRun({ deadline, order, build, runOne, onNotRun = () => {} }) {
  const out = { build: { status: 'not_started' }, started: [], notRun: [], childErrors: [] };
  let modules = null;
  try { modules = await build(); out.build = { status: 'completed', elapsedMs: deadline.elapsed() }; } catch (error) {
    if (!(error instanceof BudgetExpired)) throw error;
    out.build = { status: 'budget_expired', message: error.message, elapsedMs: deadline.elapsed() };
  }
  for (let p = 0; p < order.length; p++) {
    const position = p + 1, condition = order[p], elapsedMs = deadline.elapsed(), remainingMs = deadline.remaining();
    const reason = !modules ? 'build_incomplete' : !canStartChild(elapsedMs, deadline.capMs) ? 'budget' : null;
    if (reason) { const item = { position, condition, reason, elapsedMs, remainingMs }; out.notRun.push(item); onNotRun(item); continue; }
    out.started.push(position);
    try { await runOne(position, condition, Math.min(D.childTimeoutMs, Math.floor(remainingMs)), modules); } catch (error) {
      out.childErrors.push({ position, condition, message: String(error?.message) });
    }
  }
  return out;
}
// ==== PURE FUNCTIONS END ====

// ---------- descriptive summaries (no verdicts) ----------
const r3 = v => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000);
// rankNote states the 0-based nearest-rank indexes for the actual n (n 30 -> [14]/[28], n 60 -> [29]/[56]).
function desc(values) {
  if (!values.length) return null;
  const n = values.length, median = nearestRank(values, 0.5), p95 = nearestRank(values, 0.95);
  return { n, median: r3(median), p95: r3(p95), spread: r3(p95 - median), rankNote: `sorted[${Math.ceil(n * 0.5) - 1}]/sorted[${Math.ceil(n * 0.95) - 1}]` };
}
export function childSummary(records, outcome) {
  try { return childSummaryUnsafe(records, outcome); } catch (error) { // never lose the child entry over a damaged record
    return { error: String(error?.message) };
  }
}
function childSummaryUnsafe(records, outcome) {
  const expected = schedule();
  const objects = records.filter(isObj);
  const rawSamples = objects.filter(r => r.type === 'sample');
  // Only samples that pass the integrity checks enter statistics; damaged ones are listed, never coerced.
  const excludedSamples = [], samples = [];
  rawSamples.forEach((s, k) => { if (sampleProblems(s, k, expected, rawSamples[k - 1]).length) excludedSamples.push(isNum(s.i) ? s.i : k); else samples.push(s); });
  const observation = outcome.observation;
  const rawGc = objects.filter(r => r.type === 'gc');
  const gc = rawGc.filter((e, k) => gcProblems(e, k).length === 0).map(e => ({ ...e, kindName: GC_KIND[e.kind] }));
  const forced = objects.filter(r => r.type === 'forced' && isNum(r.start) && isNum(r.end));
  const attrib = samples.map(s => ({ s, a: attributeSample(s, gc, forced, observation) }));
  const measured = attrib.filter(x => x.s.label.startsWith('measure/'));
  const roles = { B: ['B1', 'B2'], C: ['C1', 'C2'] };
  // A summary of a child that is not completed is diagnostic only: comparisons() never uses it.
  const out = { scope: outcome.status === 'completed' ? 'completed' : 'partial_diagnostic_only', excludedSamples, copies: {}, roles: {}, attribution: {} };
  for (const arm of ARMS) {
    const m = measured.filter(x => x.s.arm === arm);
    out.copies[arm] = { wall: desc(m.map(x => x.s.wallMs)), index: desc(m.map(x => x.s.indexMs)), summarize: desc(m.map(x => x.s.summarizeMs)) };
  }
  for (const [role, [one, two]] of Object.entries(roles)) {
    const m = measured.filter(x => x.s.arm === one || x.s.arm === two);
    const walls = m.map(x => x.s.wallMs);
    const observed = m.filter(x => x.a.status === 'observed');
    const majors = observed.map(x => x.a.overlapMs.major);
    const cpu = m.map(x => cpuWallRatio(x.s.cpuUserUs, x.s.cpuSystemUs, x.s.wallMs)).filter(v => v !== null);
    const m1 = out.copies[one].wall?.median, m2 = out.copies[two].wall?.median;
    const allObserved = m.length > 0 && observed.length === m.length;
    out.roles[role] = {
      wall: desc(walls), index: desc(m.map(x => x.s.indexMs)), summarize: desc(m.map(x => x.s.summarizeMs)),
      copyMedianRatio: m1 && m2 ? r3(m2 / m1) : null, cpuWall: desc(cpu),
      gc: { attributionStatus: Object.fromEntries(['observed', 'ambiguous', 'unobserved', 'incomplete'].map(k => [k, m.filter(x => x.a.status === k).length])),
        majorOverlapFraction: allObserved ? r3(majors.filter(v => v > 0).length / majors.length) : null,
        majorOverlap: allObserved ? desc(majors) : null, majorOverlapSumMs: allObserved ? r3(majors.reduce((a, b) => a + b, 0)) : null,
        nullReason: allObserved ? null : 'not_all_samples_observed_unambiguous' },
      spearmanWallMajor: allObserved ? spearman(walls, majors) : { value: null, reason: 'not_all_samples_observed_unambiguous' },
      clusters: largestGap(walls),
    };
  }
  out.attribution = attrib.map(x => ({ i: x.s.i, status: x.a.status, crossoverEvents: x.a.crossoverEvents, overlapMs: x.a.overlapMs, phaseMajorMs: x.a.phaseMajorMs, startedInSample: x.a.startedInSample }));
  const counted = observation === 'supported';
  out.gcEventsBetweenSamples = counted ? gc.filter(e => !samples.some(s => clip(eventInterval(e), [s.t0, s.t2]))).length : null;
  out.gcEventsInForcedWindows = counted ? gc.filter(e => forced.some(f => clip(eventInterval(e), [f.start, f.end]))).length : null;
  return out;
}
const METRICS = [['C', 'wall', 'median'], ['C', 'wall', 'spread'], ['B', 'wall', 'median'], ['B', 'wall', 'spread'], ['C', 'copyMedianRatio'], ['B', 'copyMedianRatio'],
  ['C', 'gc', 'majorOverlapFraction'], ['B', 'gc', 'majorOverlapFraction'], ['C', 'cpuWall', 'median'], ['B', 'cpuWall', 'median']];
function comparisons(children) {
  const pick = (child, path) => path.slice(1).reduce((v, k) => (v == null ? null : v[k]), child?.summary?.roles?.[path[0]]);
  return METRICS.map(path => {
    const values = {};
    for (const c of children) values[c.position] = c.status === 'completed' ? pick(c, path) : null;
    return { metric: path.join('.'), ...pairDirections(values) };
  });
}

// ---------- synthetic checks ----------
export function syntheticChecks() {
  const results = [];
  const check = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (error) { results.push({ name, ok: false, detail: String(error.message).slice(0, 300) }); } };
  const near = (a, b, eps = 1e-9) => assert(Math.abs(a - b) < eps, `${a} != ${b}`);
  const ev = (seq, start, dur, kindName = 'major') => ({ seq, startTime: start, duration: dur, kindName });
  check('schedule 144 / 30 measured per copy', () => {
    const s = schedule(); assert.equal(s.length, 144);
    for (const arm of ['B1', 'B2', 'C1', 'C2']) assert.equal(s.filter(x => x.arm === arm && x.label.startsWith('measure/')).length, 30);
    assert.equal(s.filter(x => x.label.startsWith('warmup/')).length, 24);
    assert.deepEqual(s.slice(0, 12).map(x => x.arm), ['B1', 'B2', 'C2', 'C1', 'B2', 'C1', 'C2', 'B1', 'C1', 'B1', 'C2', 'B2']);
    assert.deepEqual(s.slice(12, 24).map(x => x.arm), ['B1', 'C1', 'B1', 'C2', 'C1', 'B2', 'C1', 'C2', 'B2', 'B1', 'B2', 'C2']);
  });
  check('nearest rank 30 and 60', () => {
    const v30 = Array.from({ length: 30 }, (_, i) => 30 - i), v60 = Array.from({ length: 60 }, (_, i) => i + 1);
    assert.equal(nearestRank(v30, 0.5), 15); assert.equal(nearestRank(v30, 0.95), 29);
    assert.equal(nearestRank(v60, 0.5), 30); assert.equal(nearestRank(v60, 0.95), 57);
    assert.equal(nearestRank([], 0.5), null);
  });
  check('clip and union with duplicates', () => {
    assert.deepEqual(clip([0, 10], [8, 22]), [8, 10]); assert.equal(clip([10, 12], [0, 10]), null); assert.equal(clip([3, 3], [0, 10]), null);
    near(unionLength([clip([0, 10], [8, 22]), clip([5, 15], [8, 22]), clip([20, 25], [8, 22])]), 9);
    near(unionLength([[1, 3], [1, 3]]), 2); near(unionLength([[0, 2], [2, 5]]), 5); near(unionLength([]), 0); near(unionLength([null, [1, 4]]), 3);
  });
  check('cpu us to ms ratio', () => {
    near(cpuWallRatio(1500, 500, 4), 0.5); near(cpuWallRatio(8000, 0, 2), 4); assert.equal(cpuWallRatio(1, 1, 0), null); assert.equal(cpuWallRatio(null, 1, 2), null);
  });
  check('attribution: union, phases, kinds', () => {
    const s = { t0: 0, t1: 6, t2: 10 };
    const a = attributeSample(s, [ev(1, 4, 4), ev(2, 5, 1), ev(3, 9, 5, 'minor'), ev(4, -3, 1)], [], 'supported');
    assert.equal(a.status, 'observed'); near(a.overlapMs.major, 4); near(a.overlapMs.minor, 1); near(a.overlapMs.any, 5);
    near(a.phaseMajorMs.index, 2); near(a.phaseMajorMs.summarize, 2);
    assert.equal(a.startedInSample.major, 2); assert.equal(a.startedInSample.minor, 1);
  });
  check('attribution: clean zero only when supported and unambiguous', () => {
    const s = { t0: 0, t1: 6, t2: 10 };
    const z = attributeSample(s, [], [], 'supported'); assert.equal(z.status, 'observed'); assert.equal(z.overlapMs.major, 0);
    const u = attributeSample(s, [], [], 'unsupported'); assert.equal(u.status, 'unobserved'); assert.equal(u.overlapMs, null);
    const inc = attributeSample(s, [ev(1, 1, 1)], [], 'incomplete'); assert.equal(inc.status, 'incomplete'); assert.equal(inc.overlapMs, null);
  });
  check('attribution: forced-window crossover is ambiguous, forced-only is not', () => {
    const s = { t0: 0, t1: 6, t2: 10 };
    const cross = attributeSample(s, [ev(7, -3, 5)], [{ start: -5, end: -1 }], 'supported');
    assert.equal(cross.status, 'ambiguous'); assert.deepEqual(cross.crossoverEvents, [7]); assert.equal(cross.overlapMs, null);
    const only = attributeSample(s, [ev(8, -4, 2)], [{ start: -5, end: -1 }], 'supported');
    assert.equal(only.status, 'observed'); assert.equal(only.overlapMs.major, 0);
  });
  check('spearman: perfect, inverse, ties, zero variance, missing', () => {
    near(spearman([1, 2, 3, 4], [10, 20, 30, 40]).value, 1); near(spearman([1, 2, 3, 4], [40, 30, 20, 10]).value, -1);
    near(spearman([1, 2, 2, 3], [1, 2, 3, 4]).value, 4.5 / Math.sqrt(22.5));
    assert.deepEqual(spearman([1, 2, 3, 4], [5, 5, 5, 5]), { value: null, reason: 'zero_variance_y' });
    assert.deepEqual(spearman([2, 2, 2], [1, 2, 3]), { value: null, reason: 'zero_variance_x' });
    assert.deepEqual(spearman([1, 2], [1, 2]), { value: null, reason: 'too_few' });
    assert.deepEqual(spearman([1, null, 3], [1, 2, 3]), { value: null, reason: 'missing_values' });
  });
  check('largest gap is auxiliary', () => {
    const g = largestGap([...Array(10).fill(100), ...Array(10).fill(300)]); assert.equal(g.modes, 'separated'); near(g.gapMs, 200); assert.equal(g.below, 10);
    assert.equal(largestGap(Array.from({ length: 60 }, (_, i) => i + 1)).modes, 'no-separated-modes');
    assert.equal(largestGap([...Array(9).fill(100), ...Array(11).fill(300)]).modes, 'no-separated-modes');
  });
  check('jsonl: truncated last line, mid parse error, blank, empty', () => {
    const t = parseJsonl('{"a":1}\n{"b":2}\n{"c":');
    assert.equal(t.records.length, 2); assert.deepEqual(t.problems, [{ line: 2, problem: 'truncated_last_line' }]);
    const m = parseJsonl('{"a":1}\nnot json\n{"b":2}\n'); assert.equal(m.records.length, 2); assert.deepEqual(m.problems, [{ line: 1, problem: 'parse_error' }]);
    assert.deepEqual(parseJsonl('{"a":1}\n\n').problems, [{ line: 1, problem: 'blank_line' }]);
    assert.deepEqual(parseJsonl('{"a":1}').problems, [{ line: 0, problem: 'missing_final_newline' }]);
    assert.deepEqual(parseJsonl(''), { records: [], problems: [], endsWithNewline: true });
  });
  const fullChild = condition => {
    const s = schedule(), recs = [{ type: 'start', condition }, { type: 'gc', seq: 0, source: 'callback', startTime: 1.5, duration: 0.2, kind: 4, flags: 4, arrivedAt: 2.5 },
      { type: 'probe', supported: true, clockOk: true, before: 1, after: 2, waitedMs: 3, observedEvents: 1, forcedEvents: [{ startTime: 1.5, duration: 0.2, flags: 4 }] }];
    for (const arm of ['B1', 'B2', 'C1', 'C2']) recs.push({ type: 'digest', arm, digest: 'a'.repeat(64) });
    s.forEach((e, i) => {
      const t0 = 100 * i + 10;
      if (condition === 'b') recs.push({ type: 'forced', i, start: t0 - 8, end: t0 - 2 });
      recs.push({ type: 'sample', i, label: e.label, arm: e.arm, t0, t1: t0 + 5, t2: t0 + 9, wallMs: 9, indexMs: 5, summarizeMs: 4, cpuUserUs: 1, cpuSystemUs: 1, heapBefore: { used: 1, total: 2 }, heapAfter: { used: 1, total: 2 } });
    });
    recs.push({ type: 'drain', complete: true, steps: 2, drainMs: 200, totalEvents: 1 }, { type: 'end', status: 'completed' });
    return recs;
  };
  const ok = { status: 'exited', exitCode: 0 };
  check('child: complete a and b', () => {
    const a = childOutcome({ condition: 'a', exit: ok, records: fullChild('a'), problems: [] }); assert.equal(a.status, 'completed', a.reasons.join(';')); assert.equal(a.observation, 'supported');
    const b = childOutcome({ condition: 'b', exit: ok, records: fullChild('b'), problems: [] }); assert.equal(b.status, 'completed', b.reasons.join(';')); assert.equal(b.counts.forced, 144);
  });
  check('child: forced count/position, a with forced', () => {
    const b = fullChild('b'); b.splice(b.findIndex(r => r.type === 'forced' && r.i === 70), 1);
    assert.equal(childOutcome({ condition: 'b', exit: ok, records: b, problems: [] }).status, 'invalid');
    const late = fullChild('b'); late.find(r => r.type === 'forced' && r.i === 3).end = 1e9;
    assert(childOutcome({ condition: 'b', exit: ok, records: late, problems: [] }).reasons.includes('forced3:position'));
    assert(childOutcome({ condition: 'a', exit: ok, records: fullChild('b'), problems: [] }).reasons.includes('forced:144'));
  });
  check('child: missing sample, missing field, order, digest', () => {
    const miss = fullChild('a'); miss.splice(miss.findIndex(r => r.type === 'sample' && r.i === 143), 1);
    assert(childOutcome({ condition: 'a', exit: ok, records: miss, problems: [] }).reasons.includes('samples:143'));
    const field = fullChild('a'); delete field.find(r => r.type === 'sample' && r.i === 5).cpuUserUs;
    assert(childOutcome({ condition: 'a', exit: ok, records: field, problems: [] }).reasons.includes('sample5:missing:cpuUserUs'));
    const order = fullChild('a'); order.find(r => r.type === 'sample' && r.i === 0).arm = 'C1';
    assert(childOutcome({ condition: 'a', exit: ok, records: order, problems: [] }).reasons.includes('sample0:order'));
    const dig = fullChild('a'); dig.find(r => r.type === 'digest').digest = 'y';
    assert(childOutcome({ condition: 'a', exit: ok, records: dig, problems: [] }).reasons.includes('digest'));
  });
  check('child: unsupported and incomplete observation keep wall data', () => {
    const un = fullChild('a'); un.find(r => r.type === 'probe').supported = false;
    const o = childOutcome({ condition: 'a', exit: ok, records: un, problems: [] }); assert.equal(o.status, 'completed'); assert.equal(o.observation, 'unsupported');
    const dr = fullChild('a'); dr.find(r => r.type === 'drain').complete = false;
    assert.equal(childOutcome({ condition: 'a', exit: ok, records: dr, problems: [] }).observation, 'incomplete');
    const clk = fullChild('a'); clk.find(r => r.type === 'probe').clockOk = false;
    assert.equal(childOutcome({ condition: 'a', exit: ok, records: clk, problems: [] }).observation, 'incomplete');
    const sum = childSummary(un, o); assert.equal(sum.roles.C.gc.majorOverlapFraction, null); assert.equal(sum.roles.C.wall.n, 60); assert.equal(sum.roles.C.spearmanWallMajor.value, null);
  });
  check('child: timeout, abnormal exit, damaged stream, partial output', () => {
    const part = fullChild('a').slice(0, 50);
    const t = childOutcome({ condition: 'a', exit: { status: 'timeout', exitCode: null }, records: part, problems: [{ line: 50, problem: 'truncated_last_line' }] });
    assert.equal(t.status, 'timeout'); assert(t.counts.samples > 0 && t.counts.samples < 144);
    assert.equal(childOutcome({ condition: 'a', exit: { status: 'exited', exitCode: 1 }, records: fullChild('a'), problems: [] }).status, 'invalid');
    assert.equal(childOutcome({ condition: 'a', exit: ok, records: fullChild('a'), problems: [{ line: 3, problem: 'parse_error' }] }).status, 'invalid');
  });
  check('time budget: 75 min cap, 12 min child', () => {
    assert.equal(canStartChild(0), true); assert.equal(canStartChild(63 * MIN), true); assert.equal(canStartChild(63 * MIN + 1), false); assert.equal(canStartChild(80 * MIN), false);
  });
  check('pairs: (1,2), (4,3), (5,6) b - a', () => {
    const p = pairDirections({ 1: 10, 2: 8, 3: 13, 4: 12, 5: 11, 6: 11 });
    assert.deepEqual(p.diffs, [-2, 1, 0]); assert.deepEqual(p.directions, ['lower', 'higher', 'tied']); assert.equal(p.overall, 'mixed');
    assert.equal(pairDirections({ 1: 5, 2: 4, 3: 1, 4: 2, 5: 9, 6: 8 }).overall, 'lower');
    assert.equal(pairDirections({ 1: 5, 2: 5, 3: 2, 4: 2, 5: 9, 6: 9 }).overall, 'tied');
    assert.equal(pairDirections({ 1: 5, 2: null, 3: 1, 4: 2, 5: 9, 6: 8 }).overall, 'unavailable');
  });
  check('comparisons pick metrics by position and skip non-completed children', () => {
    const child = (position, median, status = 'completed') => ({ position, status, summary: { roles: { C: { wall: { median } }, B: {} } } });
    const rows = comparisons([child(1, 10), child(2, 8), child(3, 13), child(4, 12), child(5, 11), child(6, 11)]);
    const c = rows.find(r => r.metric === 'C.wall.median'); assert.deepEqual(c.diffs, [-2, 1, 0]); assert.equal(c.overall, 'mixed');
    assert.equal(rows.find(r => r.metric === 'B.wall.median').overall, 'unavailable');
    const inv = comparisons([child(1, 10), child(2, 8, 'invalid'), child(3, 13), child(4, 12), child(5, 11), child(6, 11)]);
    assert.deepEqual(inv.find(r => r.metric === 'C.wall.median').directions, ['unavailable', 'higher', 'tied']);
  });
  check('overwrite refusal and owned temp removal', () => {
    const t = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    const wrongPrefix = mkdtempSync(join(tmpdir(), 'tco-other-'));
    try {
      const f = join(t, 'x.json'); writeFileSync(f, '{}');
      assert.throws(() => refuseOverwrite(f)); refuseOverwrite(join(t, 'absent.json'));
      const foreign = mkdtempSync(join(t, 'other-'));
      assert.throws(() => safeRemove(foreign, tmpdir(), TEMP_PREFIX)); assert(existsSync(foreign));
      assert.throws(() => safeRemove(wrongPrefix, tmpdir(), TEMP_PREFIX)); assert(existsSync(wrongPrefix));
      assert.equal(safeRemove(t, tmpdir(), TEMP_PREFIX), true);
    } finally { // test-owned dirs are removed even when an assertion (or a RED stub) fails
      for (const d of [t, wrongPrefix]) rmSync(d, { recursive: true, force: true });
    }
  });
  // ---- preflight fix R1: global 75 min budget (fake clock, no subprocess) ----
  const fakeClock = () => { const c = { t: 0 }; c.now = () => c.t; return c; };
  check('R1 deadline: timeout is min(individual, remaining); expired refuses to start', () => {
    const c = fakeClock(), dl = createDeadline(75 * MIN, c.now);
    assert.deepEqual(dl.timeoutFor(10 * MIN), { ms: 10 * MIN, budgetLimited: false });
    c.t = 70 * MIN; assert.deepEqual(dl.timeoutFor(10 * MIN), { ms: 5 * MIN, budgetLimited: true });
    assert.equal(dl.remaining(), 5 * MIN); assert.equal(dl.elapsed(), 70 * MIN);
    c.t = 75 * MIN; assert.equal(dl.expired(), true); assert.equal(dl.remaining(), 0);
    assert.throws(() => dl.timeoutFor(10 * MIN), BudgetExpired);
    c.t = 80 * MIN; assert.equal(dl.remaining(), 0); assert.throws(() => dl.timeoutFor(1), BudgetExpired);
  });
  check('R1 runBudgeted: cumulative 8 build steps stop at 75 min, no start after expiry', () => {
    const c = fakeClock(), dl = createDeadline(75 * MIN, c.now), given = [];
    // a fake step that needs `takes` ms; it is killed at its timeout like execFileSync (code ETIMEDOUT)
    const step = takes => runBudgeted(dl, 10 * MIN, ms => {
      given.push(ms);
      if (takes > ms) { c.t += ms; const e = new Error('spawnSync ETIMEDOUT'); e.code = 'ETIMEDOUT'; throw e; }
      c.t += takes; return 'ok';
    }, 'fake');
    for (let k = 0; k < 7; k++) assert.equal(step(594000), 'ok'); // 7 x 9.9 min = 69.3 min, each under its own 10 min
    assert.throws(() => step(594000), BudgetExpired); // 8th step only gets the 5.7 min left
    assert.deepEqual(given, [600000, 600000, 600000, 600000, 600000, 600000, 600000, 342000]); // timeouts given: own 10 min, then the 5.7 min left
    assert.equal(c.t, 75 * MIN);
    assert.throws(() => step(1), BudgetExpired); assert.equal(given.length, 8); // never started
  });
  check('R1 runBudgeted: own 10 min timeout is not reported as budget expiry', () => {
    const c = fakeClock(), dl = createDeadline(75 * MIN, c.now);
    const err = (() => { try { runBudgeted(dl, 10 * MIN, ms => { c.t += ms; const e = new Error('t'); e.code = 'ETIMEDOUT'; throw e; }, 'fake'); } catch (e) { return e; } })();
    assert(!(err instanceof BudgetExpired)); assert.equal(err.code, 'ETIMEDOUT');
    const other = (() => { try { c.t = 70 * MIN; runBudgeted(dl, 10 * MIN, () => { throw new Error('exit 1'); }, 'fake'); } catch (e) { return e; } })();
    assert(!(other instanceof BudgetExpired)); assert.equal(other.message, 'exit 1');
  });

  // ---- preflight fix R2: record integrity ----
  const HEX = 'a'.repeat(64);
  const fullChildV = (condition, gcEvents = []) => {
    const recs = fullChild(condition); // already holds the probe GC record (seq 0)
    const extra = gcEvents.map((e, k) => ({ type: 'gc', seq: k + 1, source: 'callback', flags: 0, arrivedAt: e.startTime + 50, ...e }));
    const drain = recs.find(r => r.type === 'drain');
    recs.splice(recs.indexOf(drain), 0, ...extra);
    drain.totalEvents = recs.filter(r => r.type === 'gc').length;
    return recs;
  };
  const sample = (recs, i) => recs.find(r => r.type === 'sample' && r.i === i);
  check('R2 valid fixture stays completed/supported', () => {
    for (const cond of ['a', 'b']) {
      const o = childOutcome({ condition: cond, exit: ok, records: fullChildV(cond), problems: [] });
      assert.equal(o.status, 'completed', o.reasons.join(';')); assert.equal(o.observation, 'supported', (o.observationReasons ?? []).join(';'));
    }
  });
  check('R2 sample values: string, non-finite, negative, fraction, heap, time order, derived mismatch -> invalid', () => {
    const cases = [
      [r => { r.wallMs = 'bad'; }, 'sample24:value:wallMs'],
      [r => { r.t1 = Infinity; }, 'sample24:value:t1'],
      [r => { r.cpuUserUs = -1; }, 'sample24:value:cpuUserUs'],
      [r => { r.cpuSystemUs = 1.5; }, 'sample24:value:cpuSystemUs'],
      [r => { r.heapAfter = { used: 1 }; }, 'sample24:value:heapAfter'],
      [r => { r.heapBefore = 'x'; }, 'sample24:value:heapBefore'],
      [r => { r.t1 = r.t0 - 1; r.indexMs = 0; r.summarizeMs = r.t2 - r.t1; }, 'sample24:time_order'],
      [r => { r.t0 -= 95; r.t1 -= 95; r.t2 -= 95; }, 'sample24:time_order'], // starts before sample 23 ended
      [r => { r.wallMs = 8; }, 'sample24:derived_mismatch'],
      [r => { r.indexMs = 4; }, 'sample24:derived_mismatch'],
    ];
    for (const [mutate, reason] of cases) {
      const recs = fullChildV('a'); mutate(sample(recs, 24));
      const o = childOutcome({ condition: 'a', exit: ok, records: recs, problems: [] });
      assert.equal(o.status, 'invalid', reason); assert(o.reasons.includes(reason), `${reason} not in ${o.reasons.join(';')}`);
      const s = childSummary(recs, o); // must not throw; the damaged sample is excluded, the rest kept
      assert.deepEqual(s.excludedSamples, [24], reason); assert.equal(s.roles.B.wall.n, 59); assert.equal(s.roles.C.wall.n, 60);
    }
  });
  check('R2 forced, digest and control records -> invalid', () => {
    const run = (cond, mutate) => { const recs = fullChildV(cond); mutate(recs); return childOutcome({ condition: cond, exit: ok, records: recs, problems: [] }); };
    const forced = (recs, i) => recs.find(r => r.type === 'forced' && r.i === i);
    assert(run('b', r => { const f = forced(r, 5); f.start = f.end + 1; }).reasons.includes('forced5:value'));
    assert(run('b', r => { forced(r, 5).start = 'x'; }).reasons.includes('forced5:value'));
    assert(run('b', r => { forced(r, 5).start = sample(r, 4).t2 - 1; }).reasons.includes('forced5:position'));
    assert(run('a', r => { r.find(x => x.type === 'digest').digest = 'z'.repeat(64); }).reasons.includes('digest'));
    assert(run('a', r => { r.filter(x => x.type === 'digest').forEach(x => { x.digest = 'XYZ'; }); }).reasons.includes('digest'));
    assert(run('a', r => { r.filter(x => x.type === 'digest')[3].arm = 'B1'; }).reasons.includes('digest'));
    assert(run('a', r => { r[0].condition = 'b'; }).reasons.includes('start'));
    assert(run('a', r => { r.splice(5, 0, { type: 'end', status: 'completed' }); }).reasons.includes('end:position'));
    assert(run('a', r => { r.splice(5, 0, null); }).reasons.includes('record:invalid'));
    assert(run('a', r => { r.splice(5, 0, { type: 'mystery' }); }).reasons.includes('record:unknown_type:mystery'));
    assert(run('a', r => { r.splice(5, 0, { type: 'error', message: 'x' }); }).reasons.includes('record:error'));
    for (const cond of ['a', 'b']) assert.equal(run(cond, () => {}).status, 'completed');
  });
  check('R2 GC metadata: missing/bad kind, flags, times, seq -> incomplete and null, wall kept', () => {
    const mutations = { kindNull: e => { e.kind = null; }, flagsNull: e => { e.flags = null; }, kindUnknown: e => { e.kind = 99; }, startString: e => { e.startTime = 'x'; },
      durationNegative: e => { e.duration = -1; }, seqDuplicate: e => { e.seq = 0; }, arrivedMissing: e => { delete e.arrivedAt; }, flagsFraction: e => { e.flags = 0.5; } };
    for (const [name, mutate] of Object.entries(mutations)) {
      const recs = fullChildV('a', [{ startTime: sample(fullChild('a'), 24).t0 + 1, duration: 1, kind: 4 }]);
      mutate(recs.find(r => r.type === 'gc' && r.seq === 1));
      const o = childOutcome({ condition: 'a', exit: ok, records: recs, problems: [] });
      assert.equal(o.status, 'completed', name); assert.equal(o.observation, 'incomplete', name); assert(o.observationReasons.length > 0, name);
      const s = childSummary(recs, o);
      assert.equal(s.attribution[24].status, 'incomplete', name); assert.equal(s.attribution[24].overlapMs, null, name);
      assert.equal(s.roles.B.gc.majorOverlapFraction, null, name); assert.equal(s.roles.B.wall.n, 60, name);
    }
  });
  check('R2 valid GC metadata kept: union per kind and phase', () => {
    const t0 = sample(fullChild('a'), 24).t0; // 2410; t1 = 2415, t2 = 2419
    const recs = fullChildV('a', [{ startTime: t0 + 1, duration: 2, kind: 4 }, { startTime: t0 + 2, duration: 2, kind: 4 }, { startTime: t0 + 8, duration: 3, kind: 1 }]);
    const o = childOutcome({ condition: 'a', exit: ok, records: recs, problems: [] });
    assert.equal(o.status, 'completed'); assert.equal(o.observation, 'supported', (o.observationReasons ?? []).join(';'));
    const a = childSummary(recs, o).attribution[24];
    assert.equal(a.status, 'observed'); near(a.overlapMs.major, 3); near(a.overlapMs.minor, 1); near(a.overlapMs.any, 4);
    near(a.phaseMajorMs.index, 3); near(a.phaseMajorMs.summarize, 0);
    assert.equal(childSummary(recs, o).roles.B.gc.majorOverlapFraction, 0.017); // 1 of 60
  });

  // ---- P01-R1: GC stream, probe and drain must agree with each other (worker invariants) ----
  check('P01 fixtures carry the worker facts: probe GC before probe record, totalEvents = GC records', () => {
    for (const cond of ['a', 'b']) {
      const r = fullChild(cond), g = r.filter(x => x.type === 'gc');
      assert.equal(r.find(x => x.type === 'drain').totalEvents, g.length); assert(r.indexOf(g[0]) < r.findIndex(x => x.type === 'probe'));
      const o = childOutcome({ condition: cond, exit: ok, records: r, problems: [] });
      assert.equal(o.status, 'completed'); assert.equal(o.observation, 'supported', (o.observationReasons ?? []).join(';'));
      const z = childSummary(r, o).attribution.filter(x => x.status === 'observed' && x.overlapMs.major === 0).length;
      assert.equal(z, 144, 'clean zero overlap stays observed when the stream is consistent');
    }
  });
  check('P01 GC count and loss: all/last GC removed, totalEvents wrong/missing/bad -> incomplete and null', () => {
    const t0 = sample(fullChild('a'), 24).t0;
    const mk = () => fullChildV('a', [{ startTime: t0 + 1, duration: 2, kind: 4 }, { startTime: t0 + 3, duration: 1, kind: 1 }]);
    const drain = r => r.find(x => x.type === 'drain');
    const cases = {
      removeAllGc: r => { for (let i = r.length - 1; i >= 0; i--) if (r[i].type === 'gc') r.splice(i, 1); },
      removeLastGc: r => { r.splice(r.findLastIndex(x => x.type === 'gc'), 1); },
      totalPlusOne: r => { drain(r).totalEvents += 1; },
      totalMinusOne: r => { drain(r).totalEvents -= 1; },
      totalMissing: r => { delete drain(r).totalEvents; },
      totalNegative: r => { drain(r).totalEvents = -1; },
      totalFraction: r => { drain(r).totalEvents = 2.5; },
      totalString: r => { drain(r).totalEvents = '3'; },
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const r = mk(); mutate(r);
      const o = childOutcome({ condition: 'a', exit: ok, records: r, problems: [] });
      assert.equal(o.status, 'completed', name); assert.equal(o.observation, 'incomplete', name);
      const s = childSummary(r, o);
      assert.equal(s.attribution[24].overlapMs, null, name); assert.equal(s.roles.B.gc.majorOverlapFraction, null, name); assert.equal(s.roles.B.wall.n, 60, name);
    }
    const good = mk(), og = childOutcome({ condition: 'a', exit: ok, records: good, problems: [] });
    assert.equal(og.observation, 'supported'); near(childSummary(good, og).attribution[24].overlapMs.major, 2);
  });
  check('P01 drain: complete with fewer than the quiet steps -> incomplete; two steps -> supported', () => {
    const run = steps => { const r = fullChildV('a'); r.find(x => x.type === 'drain').steps = steps; return childOutcome({ condition: 'a', exit: ok, records: r, problems: [] }).observation; };
    assert.equal(run(0), 'incomplete'); assert.equal(run(1), 'incomplete'); assert.equal(run(D.drainQuietSteps), 'supported'); assert.equal(run(7), 'supported');
    const slow = fullChildV('a'); slow.find(x => x.type === 'drain').drainMs = 5000; // OS delay is not invalidated by a new upper bound
    assert.equal(childOutcome({ condition: 'a', exit: ok, records: slow, problems: [] }).observation, 'supported');
  });
  check('P01 probe forced events: flags, FORCED bit, window, stream match, counts -> incomplete', () => {
    const probe = r => r.find(x => x.type === 'probe');
    const cases = {
      flagsZero: r => { probe(r).forcedEvents.forEach(e => { e.flags = 0; }); },
      flagsMissing: r => { probe(r).forcedEvents.forEach(e => { delete e.flags; }); },
      outsideWindow: r => { const p = probe(r); p.forcedEvents.forEach(e => { e.startTime = p.after + 100; }); },
      notInStream: r => { probe(r).forcedEvents[0].startTime = 1.6; }, // inside [1, 2] but no such GC record
      streamDiffers: r => { r.find(x => x.type === 'gc' && x.seq === 0).duration = 0.3; },
      duplicated: r => { const p = probe(r); p.forcedEvents.push({ ...p.forcedEvents[0] }); },
      emptyForced: r => { probe(r).forcedEvents = []; },
      observedCountWrong: r => { probe(r).observedEvents = 2; },
      observedCountMissing: r => { delete probe(r).observedEvents; },
      clockFlagContradicts: r => { probe(r).forcedEvents[0].startTime = 0.5; r.find(x => x.type === 'gc' && x.seq === 0).startTime = 0.5; }, // consistent stream, clockOk true but outside window
      probeGcAfterProbe: r => { const g = r.find(x => x.type === 'gc' && x.seq === 0); r.splice(r.indexOf(g), 1); r.splice(r.indexOf(probe(r)) + 1, 0, g); },
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const r = fullChildV('a'); mutate(r);
      const o = childOutcome({ condition: 'a', exit: ok, records: r, problems: [] });
      assert.equal(o.observation, 'incomplete', name); assert.equal(o.status, 'completed', `${name}: ${o.reasons.join(';')}`);
      assert.equal(childSummary(r, o).attribution[24].overlapMs, null, name);
    }
    const two = fullChildV('a'); // two GC records in the probe window, one forced: still consistent
    two.splice(1, 0, { type: 'gc', seq: 0, source: 'callback', startTime: 1.1, duration: 0.1, kind: 1, flags: 0, arrivedAt: 2.4 });
    two.filter(x => x.type === 'gc').forEach((g, k) => { g.seq = k; });
    probe(two).observedEvents = 2; two.find(x => x.type === 'drain').totalEvents = two.filter(x => x.type === 'gc').length;
    assert.equal(childOutcome({ condition: 'a', exit: ok, records: two, problems: [] }).observation, 'supported');
    const un = fullChildV('a'); Object.assign(probe(un), { supported: false, clockOk: false, forcedEvents: [], observedEvents: 0 });
    un.splice(un.findIndex(x => x.type === 'gc'), 1); un.find(x => x.type === 'drain').totalEvents = 0;
    assert.equal(childOutcome({ condition: 'a', exit: ok, records: un, problems: [] }).observation, 'unsupported');
  });
  // ---- P01-M1: rank description follows the actual n; partial summaries are marked diagnostic only ----
  check('P01 rankNote uses the actual n; partial summary is diagnostic and excluded from comparisons', () => {
    const r = fullChildV('a');
    const cs = r.filter(x => x.type === 'sample' && x.label.startsWith('measure/') && x.arm.startsWith('C')).slice(0, 2);
    for (const x of cs) x.wallMs = 'bad';
    const o = childOutcome({ condition: 'a', exit: ok, records: r, problems: [] }); assert.equal(o.status, 'invalid');
    const s = childSummary(r, o);
    assert.equal(s.roles.C.wall.n, 58); assert.equal(s.roles.C.wall.rankNote, 'sorted[28]/sorted[55]');
    const short = cs.map(x => x.arm);
    for (const arm of ['C1', 'C2']) {
      const n = 30 - short.filter(a => a === arm).length;
      assert.equal(s.copies[arm].wall.n, n); assert.equal(s.copies[arm].wall.rankNote, n === 29 ? 'sorted[14]/sorted[27]' : 'sorted[14]/sorted[28]');
    }
    assert.equal(s.roles.B.wall.rankNote, 'sorted[29]/sorted[56]'); assert.equal(s.copies.B1.wall.rankNote, 'sorted[14]/sorted[28]');
    assert.equal(s.scope, 'partial_diagnostic_only');
    const okSum = childSummary(fullChildV('a'), childOutcome({ condition: 'a', exit: ok, records: fullChildV('a'), problems: [] }));
    assert.equal(okSum.scope, 'completed'); assert.equal(okSum.roles.C.wall.rankNote, 'sorted[29]/sorted[56]');
    // nearest-rank values on a known n = 58 set: 1..58 -> median 29 (index 28), p95 56 (index 55)
    assert.equal(nearestRank(Array.from({ length: 58 }, (_, i) => i + 1), 0.5), 29); assert.equal(nearestRank(Array.from({ length: 58 }, (_, i) => i + 1), 0.95), 56);
    const row = comparisons([1, 2, 3, 4, 5, 6].map(position => ({ position, status: position === 2 ? 'invalid' : 'completed', summary: position === 2 ? s : okSum })))
      .find(x => x.metric === 'C.wall.median');
    assert.equal(row.directions[0], 'unavailable');
  });
  check('R2 probe and drain metadata -> incomplete, missing probe -> unsupported', () => {
    const obs = mutate => { const recs = fullChildV('a'); mutate(recs); return childOutcome({ condition: 'a', exit: ok, records: recs, problems: [] }); };
    const probe = r => r.find(x => x.type === 'probe'), drain = r => r.find(x => x.type === 'drain');
    for (const [name, m] of Object.entries({
      clockString: r => { probe(r).clockOk = 'yes'; }, beforeString: r => { probe(r).before = 'x'; }, windowReversed: r => { probe(r).after = probe(r).before - 1; },
      twoProbes: r => { r.splice(2, 0, { ...probe(r) }); }, drainStepsMissing: r => { delete drain(r).steps; }, drainMissing: r => { r.splice(r.indexOf(drain(r)), 1); },
      drainCompleteString: r => { drain(r).complete = 'true'; } })) {
      const o = obs(m); assert.equal(o.observation, 'incomplete', name); assert.equal(o.status, 'completed', `${name}: ${o.reasons.join(';')}`);
    }
    const none = obs(r => { r.splice(r.indexOf(probe(r)), 1); }); assert.equal(none.observation, 'unsupported');
  });
  return results;
}

// ---------- process-level synthetic checks (fake modules, no product code) ----------
const FAKE_ARTIFACTS = [
  'export class MemoryArtifactStore { constructor() { this.m = new Map(); } put(r) { this.m.set(r.artifactId, r); } get(id) { return this.m.get(id); } }',
  'export async function indexArtifact({ path, store }) { const { readFile } = await import("node:fs/promises"); const b = await readFile(path); const junk = Array.from({ length: 20000 }, (_, i) => ({ i })); const r = { artifactId: "a1", byteLength: b.byteLength, junk }; store.put(r); return r; }',
  'export function summarizeArtifact({ artifactId, store }) { const r = store.get(artifactId); return { summary: "", sourceMap: null, fallbackReason: "fake", warnings: [], confidence: 0, estimatedTokens: r ? 0 : -1 }; }',
].join(String.fromCharCode(10));
export async function processChecks() {
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (error) { results.push({ name, ok: false, detail: String(error.message).slice(0, 300) }); } };
  const temp = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  try {
    const mod = join(temp, 'fake'); mkdirSync(join(mod, 'src/core'), { recursive: true });
    writeFileSync(join(mod, 'src/core/artifacts.js'), FAKE_ARTIFACTS); writeFileSync(join(mod, 'src/core/policy.js'), 'export const fake = true;');
    const modules = { B1: mod, B2: mod, C1: mod, C2: mod };
    let n = 0;
    const runFake = async (condition, nodeArgs, preStream) => {
      const stream = join(temp, `s${n}.jsonl`), configPath = join(temp, `c${n}.json`), workDir = join(temp, `w${n++}`);
      if (preStream) writeFileSync(stream, 'existing');
      writeFileSync(configPath, JSON.stringify({ condition, modules, size: 64, schedule: schedule(), workDir, stream, k: 1, probeWaitMs: D.probeWaitMs, drainStepMs: D.drainStepMs, drainQuietSteps: D.drainQuietSteps, drainMaxMs: D.drainMaxMs }));
      const exit = await runChild([...nodeArgs, join(ROOT, WORKER), configPath], 60000);
      const text = readFileSync(stream, 'utf8');
      const parsed = parseJsonl(preStream ? '' : text);
      return { exit, text, ...parsed, outcome: childOutcome({ condition, exit, records: parsed.records, problems: parsed.problems }) };
    };
    await check('runChild timeout kills own child', async () => {
      const r = await runChild(['-e', 'setTimeout(() => {}, 20000)'], 500);
      assert.equal(r.status, 'timeout'); assert(r.wallMs < 15000, `wall ${r.wallMs}`);
    });
    await check('fake worker a: 144 samples, 0 forced, probe supported', async () => {
      const r = await runFake('a', ['--expose-gc']);
      assert.equal(r.outcome.status, 'completed', r.outcome.reasons.join(';')); assert.equal(r.outcome.counts.forced, 0); assert.equal(r.outcome.observation, 'supported');
      const s = childSummary(r.records, r.outcome); assert.equal(s.roles.C.wall.n, 60);
    });
    await check('fake worker b: 144 forced, each before its sample', async () => {
      const r = await runFake('b', ['--expose-gc']);
      assert.equal(r.outcome.status, 'completed', r.outcome.reasons.join(';')); assert.equal(r.outcome.counts.forced, 144);
      assert(r.records.filter(x => x.type === 'gc').length >= 145, 'forced and probe GC events observed');
    });
    await check('fake worker without --expose-gc: a unsupported, b invalid', async () => {
      const a = await runFake('a', []); assert.equal(a.outcome.observation, 'unsupported'); assert.equal(a.outcome.status, 'completed');
      const b = await runFake('b', []); assert.equal(b.outcome.status, 'invalid'); assert(b.records.some(x => x.type === 'error'));
    });
    await check('worker refuses an existing stream file', async () => {
      const r = await runFake('a', ['--expose-gc'], true);
      assert.notEqual(r.exit.exitCode, 0); assert.equal(r.text, 'existing');
    });
    // ---- preflight fix R1: executeRun with a fake clock (no subprocess) ----
    const fakeClock = () => { const c = { t: 0 }; c.now = () => c.t; return c; };
    const fakeRun = async ({ buildSteps, buildTakes, childTakes }) => {
      const c = fakeClock(), dl = createDeadline(75 * MIN, c.now), started = [], timeouts = [];
      const build = async () => {
        for (let k = 0; k < buildSteps; k++) runBudgeted(dl, 10 * MIN, ms => { if (buildTakes > ms) { c.t += ms; const e = new Error('t'); e.code = 'ETIMEDOUT'; throw e; } c.t += buildTakes; }, `step${k}`);
        return { fake: true };
      };
      const runOne = async (position, condition, timeoutMs) => { started.push(position); timeouts.push(timeoutMs); c.t += Math.min(childTakes, timeoutMs); };
      const out = await executeRun({ deadline: dl, order: D.order, build, runOne });
      return { out, started, timeouts, t: c.t };
    };
    await check('R1 executeRun: build hits the budget -> no child starts, all notRun build_incomplete', async () => {
      const r = await fakeRun({ buildSteps: 8, buildTakes: 594000, childTakes: 1 });
      assert.equal(r.out.build.status, 'budget_expired'); assert.deepEqual(r.started, []); assert.equal(r.t, 75 * MIN);
      assert.deepEqual(r.out.notRun.map(x => [x.position, x.reason]), [[1, 'build_incomplete'], [2, 'build_incomplete'], [3, 'build_incomplete'], [4, 'build_incomplete'], [5, 'build_incomplete'], [6, 'build_incomplete']]);
    });
    await check('R1 executeRun: child start boundary at exactly 12 min remaining', async () => {
      const edge = await fakeRun({ buildSteps: 7, buildTakes: 9 * MIN, childTakes: 1 }); // build 63 min -> 12 min left
      assert.equal(edge.out.build.status, 'completed'); assert.deepEqual(edge.started, [1]); assert.deepEqual(edge.timeouts, [12 * MIN]);
      assert.deepEqual(edge.out.notRun.map(x => x.reason), ['budget', 'budget', 'budget', 'budget', 'budget']);
      const over = await fakeRun({ buildSteps: 7, buildTakes: 9 * MIN + 1, childTakes: 1 }); // 12 min - 7 ms left
      assert.deepEqual(over.started, []); assert.equal(over.out.notRun.length, 6);
    });
    await check('R1 executeRun: children stop starting when less than 12 min remain', async () => {
      const fit = await fakeRun({ buildSteps: 0, buildTakes: 0, childTakes: 12 * MIN }); // starts at 0,12,...,60
      assert.deepEqual(fit.started, [1, 2, 3, 4, 5, 6]); assert.equal(fit.t, 72 * MIN); assert.deepEqual(fit.out.notRun, []);
      const slow = await fakeRun({ buildSteps: 1, buildTakes: 5 * MIN, childTakes: 12 * MIN }); // children start at 5,17,29,41,53; 6th would start at 65 min
      assert.deepEqual(slow.started, [1, 2, 3, 4, 5]); assert.deepEqual(slow.out.notRun.map(x => [x.position, x.reason]), [[6, 'budget']]);
      assert.equal(slow.t, 65 * MIN); assert.deepEqual(slow.timeouts, [12 * MIN, 12 * MIN, 12 * MIN, 12 * MIN, 12 * MIN]);
    });
    await check('R1 executeRun: a failing child does not stop later children; other build errors propagate', async () => {
      const c = fakeClock(), dl = createDeadline(75 * MIN, c.now), started = [];
      const out = await executeRun({ deadline: dl, order: D.order, build: async () => ({}), runOne: async p => { started.push(p); if (p === 2) throw new Error('child boom'); } });
      assert.deepEqual(started, [1, 2, 3, 4, 5, 6]); assert.deepEqual(out.childErrors.map(x => x.position), [2]);
      await assert.rejects(executeRun({ deadline: createDeadline(75 * MIN, c.now), order: D.order, build: async () => { throw new Error('lockfile differs'); }, runOne: async () => {} }), /lockfile differs/);
    });

    // ---- preflight fix R1: real subprocesses under the budget ----
    const sleeper = join(temp, 'sleeper.mjs');
    writeFileSync(sleeper, [
      "import { writeFileSync } from 'node:fs';",
      'const [out, text] = process.argv.slice(2);',
      'if (out) writeFileSync(out, text);',
      "if (text) process.stdout.write('partial-output');",
      'setTimeout(() => {}, 20000);',
    ].join(String.fromCharCode(10)));
    await check('R1 command: expired budget -> BudgetExpired and the process never starts', async () => {
      const c = fakeClock(), dl = createDeadline(1000, c.now); c.t = 1000;
      const marker = join(temp, 'marker-command.txt');
      assert.throws(() => command(process.execPath, [sleeper, marker, 'x'], { deadline: dl }), BudgetExpired);
      assert.equal(existsSync(marker), false);
    });
    await check('R1 command: budget-limited timeout stops a real child and reports BudgetExpired', async () => {
      const dl = createDeadline(400); const t = Date.now();
      assert.throws(() => command(process.execPath, [sleeper], { deadline: dl }), BudgetExpired);
      assert(Date.now() - t < 15000, `took ${Date.now() - t}`);
    });
    await check('R1 spawnBudgeted (npm path): expired -> not started; budget timeout keeps partial log', async () => {
      const c = fakeClock(), gone = createDeadline(1000, c.now); c.t = 1000;
      const log0 = join(temp, 'spawn0.log'), marker = join(temp, 'marker-spawn.txt');
      await assert.rejects(spawnBudgeted(process.execPath, [sleeper, marker, 'x'], { cwd: temp, deadline: gone, log: log0, what: 'fake npm' }), BudgetExpired);
      assert.equal(existsSync(marker), false); assert.equal(existsSync(log0), false);
      const log1 = join(temp, 'spawn1.log'), t = Date.now();
      await assert.rejects(spawnBudgeted(process.execPath, [sleeper, join(temp, 'm1.txt'), 'x'], { cwd: temp, deadline: createDeadline(1500), log: log1, what: 'fake npm' }), BudgetExpired);
      assert(Date.now() - t < 15000); assert.equal(readFileSync(log1, 'utf8'), 'partial-output');
    });
    await check('R1 runChild: budget-limited child timeout keeps the partial JSONL as written', async () => {
      const stream = join(temp, 'partial.jsonl'), text = ['{"type":"start","condition":"a"}', '{"type":"sam'].join(String.fromCharCode(10));
      const r = await runChild([sleeper, stream, text], 600);
      assert.equal(r.status, 'timeout'); assert.equal(readFileSync(stream, 'utf8'), text);
      const p = parseJsonl(readFileSync(stream, 'utf8'));
      assert.deepEqual(p.problems, [{ line: 1, problem: 'truncated_last_line' }]);
      assert.equal(childOutcome({ condition: 'a', exit: r, records: p.records, problems: p.problems }).status, 'timeout');
    });
    await check('R1 environment: expired budget skips powercfg instead of a fresh 10 min', async () => {
      const c = fakeClock(), dl = createDeadline(1000, c.now); c.t = 1000;
      const env = environment(dl); assert.equal(env.powerSchemeGuid, null); assert.equal(env.powerSchemeStatus, 'skipped_budget_expired'); assert.equal(env.node, process.version);
    });
  } finally { safeRemove(temp, tmpdir(), TEMP_PREFIX); }
  return results;
}

// ---------- process helpers ----------
// Every subprocess runs hidden and under the run deadline (preflight fix R1): no step gets a fresh
// fixed timeout of its own once the global budget is shorter, and none starts after it is spent.
const digest = data => createHash('sha256').update(data).digest('hex');
const hashFile = file => digest(readFileSync(file));
const STEP_MS = 10 * MIN;
export function command(exe, args, { cwd = ROOT, deadline, individualMs = STEP_MS } = {}) {
  assert(deadline, 'command needs the run deadline');
  return runBudgeted(deadline, individualMs, ms => execFileSync(exe, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: ms, maxBuffer: 64 * MIB }), `${basename(exe)} ${args[0] ?? ''}`.trim());
}
const git = (args, deadline) => command('git', args, { deadline }).trim();
// Kills only our own child process tree (by its PID). Bounded at 10 s; this is cleanup, not new work.
function killOwnChild(child) {
  if (child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); } catch { child.kill(); }
}
// Async subprocess (npm path) under the deadline; output captured to `log`, including partial output on timeout.
export function spawnBudgeted(exe, args, { cwd, deadline, individualMs = STEP_MS, log, env = process.env, what = basename(exe) }) {
  return new Promise((done, reject) => {
    let budget;
    try { budget = deadline.timeoutFor(individualMs, what); } catch (error) { reject(error); return; }
    let output = '', timedOut = false, settled = false;
    const settle = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    const timer = setTimeout(() => { timedOut = true; killOwnChild(child); }, budget.ms);
    child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
    child.on('error', error => { try { writeFileSync(log, output); } catch {} settle(reject, error); });
    child.on('close', code => {
      writeFileSync(log, output);
      if (timedOut) settle(reject, budget.budgetLimited ? new BudgetExpired(`${what}: stopped at the global budget`) : new Error(`${what} timed out after ${budget.ms} ms`));
      else if (code === 0) settle(done);
      else settle(reject, new Error(`${what} failed (${code})`));
    });
  });
}
const npm = (args, cwd, log, deadline) => spawnBudgeted(process.execPath, [NPM, ...args], { cwd, deadline, log, env: { ...process.env, CI: '1' }, what: `npm ${args.join(' ')}` });
export function runChild(args, timeoutMs) {
  return new Promise(done => {
    const started = Date.now(), startedAt = new Date(started).toISOString();
    let child, stderr = '', timedOut = false, settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); done({ ...value, timeoutMs, startedAt, finishedAt: new Date().toISOString(), wallMs: Date.now() - started, nodeArgs: args.filter(a => a.startsWith('--')) }); } };
    try { child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (error) { done({ status: 'spawn_error', message: String(error.message), timeoutMs, startedAt, finishedAt: startedAt, wallMs: 0 }); return; }
    const timer = setTimeout(() => { timedOut = true; killOwnChild(child); }, timeoutMs);
    child.stderr.setEncoding('utf8'); child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
    child.on('error', error => finish({ status: 'spawn_error', message: String(error.message) }));
    child.on('close', (exitCode, signal) => finish({ status: timedOut ? 'timeout' : 'exited', exitCode, signal, stderrTail: stderr || undefined }));
  });
}
// powercfg runs only inside the remaining budget; after expiry it is skipped and recorded as such.
export function environment(deadline) {
  const cpu = cpus();
  const env = { node: process.version, v8: process.versions.v8, platform: process.platform, os: release(), arch: process.arch,
    cpuModels: [...new Set(cpu.map(item => item.model))], logicalCPUs: cpu.length, totalMemBytes: totalmem(), powerSchemeGuid: null, powerSchemeStatus: null };
  if (deadline.expired()) { env.powerSchemeStatus = 'skipped_budget_expired'; return env; }
  try {
    env.powerSchemeGuid = (command('powercfg', ['/GETACTIVESCHEME'], { deadline }).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) ?? [null])[0];
    env.powerSchemeStatus = 'read';
  } catch (error) {
    if (!(error instanceof BudgetExpired)) throw error;
    env.powerSchemeStatus = 'stopped_budget_expired';
  }
  return env;
}
// Same snapshot method as the official K1 harness: git archive -> npm ci --ignore-scripts -> tsc,
// A/A copies are byte copies of dist. CAND is the fixed SHA, not the current HEAD. All steps under the deadline.
async function buildSnapshots(temp, logs, deadline) {
  const snapshots = {}, dirs = {};
  for (const [variant, ref] of [['base', BASE], ['candidate', CAND]]) {
    const snapshot = join(temp, variant); mkdirSync(snapshot);
    const archive = join(temp, `${variant}.tar`);
    command('git', ['archive', '--format=tar', ref, '-o', archive], { deadline });
    command(TAR, ['-xf', archive, '-C', snapshot], { deadline });
    await npm(['ci', '--ignore-scripts'], snapshot, join(logs, `${variant}-ci.log`), deadline);
    command(process.execPath, [join(snapshot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: snapshot, deadline });
    cpSync(join(snapshot, 'dist'), join(snapshot, 'dist-aa'), { recursive: true });
    const core = d => Object.fromEntries(readdirSync(join(snapshot, d, 'src/core')).filter(f => f.endsWith('.js')).sort().map(f => [f, hashFile(join(snapshot, d, 'src/core', f))]));
    const dist = core('dist');
    assert.deepEqual(core('dist-aa'), dist, 'A/A copy differs');
    snapshots[variant] = { ref, policyBlobSha1: git(['rev-parse', `${ref}:src/core/policy.ts`], deadline), lockfileSha256: hashFile(join(snapshot, 'package-lock.json')), distCoreSha256: dist };
    dirs[variant] = [join(snapshot, 'dist'), join(snapshot, 'dist-aa')];
  }
  assert.equal(snapshots.base.lockfileSha256, snapshots.candidate.lockfileSha256, 'lockfile differs between arms');
  assert.equal(git(['diff', '--numstat', BASE, CAND, '--', 'src'], deadline), ['2', '0', 'src/core/policy.ts'].join(String.fromCharCode(9)), 'src delta must be the two K1 guards');
  for (const file of Object.keys(snapshots.base.distCoreSha256))
    if (file !== 'policy.js') assert.equal(snapshots.base.distCoreSha256[file], snapshots.candidate.distCoreSha256[file], `${file} differs between arms`);
  return { snapshots, modules: { B1: dirs.base[0], B2: dirs.base[1], C1: dirs.candidate[0], C2: dirs.candidate[1] } };
}

async function main() {
  // The 75 min budget starts here (runner start) and covers checks, build, children and final powercfg.
  const runnerStart = Date.now();
  const deadline = createDeadline(D.capMs);
  const results = syntheticChecks();
  if (process.argv.includes('--check-only')) results.push(...await processChecks());
  const failed = results.filter(r => !r.ok);
  if (process.argv.includes('--check-only')) {
    console.log(JSON.stringify({ status: failed.length ? 'FAIL' : 'PASS', passed: results.length - failed.length, total: results.length, failed, timedCalls: 0 }, null, 1));
    process.exitCode = failed.length ? 1 : 0;
    return;
  }
  assert.equal(failed.length, 0, 'synthetic checks must pass before any run');
  const CHECK = process.argv.includes('--check-run');
  assert.equal(process.platform, 'win32', 'validated platform is Windows');
  assert.equal(process.version, 'v24.18.0', 'Node must be v24.18.0 (no automatic install or substitute)');
  const outputArg = process.argv.find(a => a.startsWith('--output='))?.slice(9);
  assert(outputArg, '--output is required');
  const OUTPUT = resolve(ROOT, outputArg);
  assert.equal(dirname(OUTPUT), join(ROOT, RESULTS_DIR));
  assert(CHECK ? /^diagcheck-[a-z0-9-]+\.json$/.test(basename(OUTPUT)) : /^diag-[a-z0-9-]+\.json$/.test(basename(OUTPUT)), 'output must be diagcheck-<name>.json (--check-run) or diag-<name>.json');
  const STREAM_DIR = OUTPUT.replace(/\.json$/, '');
  refuseOverwrite(OUTPUT); refuseOverwrite(STREAM_DIR);
  assert.equal(git(['status', '--porcelain'], deadline), '', 'commit preregistration and implementation before running');
  const head = git(['rev-parse', 'HEAD'], deadline);
  const preregArg = process.argv.find(a => a.startsWith('--prereg='))?.slice(9);
  assert(preregArg, '--prereg=<committed-sha> is required');
  const prereg = git(['rev-parse', preregArg], deadline);
  git(['merge-base', '--is-ancestor', prereg, head], deadline);
  git(['diff', '--exit-code', prereg, head, '--', ...HARNESS_FILES], deadline);
  assert.equal(prereg, git(['log', '-1', '--format=%H', head, '--', ...HARNESS_FILES], deadline), '--prereg must be the last commit that touched the diagnostic harness or protocol');
  const order = CHECK ? D.checkOrder : D.order;
  const size = CHECK ? D.checkSize : D.mainSize;
  mkdirSync(STREAM_DIR);
  const tracked = git(['ls-files', '-z'], deadline).split('\0').filter(Boolean);
  const before = tracked.map(file => ({ file, hash: existsSync(join(ROOT, file)) ? hashFile(join(ROOT, file)) : null }));
  const temp = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  const logs = join(temp, 'logs'); mkdirSync(logs);
  const result = { schema: SCHEMA, mode: CHECK ? 'check-run' : 'main', status: 'incomplete', startedAt: new Date(runnerStart).toISOString(), preregistrationCommit: prereg, measurementHead: head,
    base: BASE, candidate: CAND, design: { ...D, size, order },
    files: Object.fromEntries([...HARNESS_FILES, 'package-lock.json'].map(f => [f, { blobSha1: git(['rev-parse', `HEAD:${f}`], deadline), workingCopySha256: hashFile(join(ROOT, f)) }])),
    environment: environment(deadline), snapshots: {}, children: [], notRun: [] };
  const normalized = value => JSON.parse(JSON.stringify(value).replaceAll(temp.replaceAll('\\', '\\\\'), '<temp>').replaceAll(ROOT.replaceAll('\\', '\\\\'), '<repo>'));
  const save = () => writeFileSync(OUTPUT, JSON.stringify(normalized(result), null, 1) + '\n');
  let failure;
  try {
    save();
    const build = async () => {
      const { snapshots, modules } = await buildSnapshots(temp, logs, deadline);
      result.snapshots = snapshots; result.buildMs = Math.round(deadline.elapsed()); save();
      return modules;
    };
    const runOne = async (position, condition, timeoutMs, modules) => {
      const name = `child-${position}-${condition}`;
      const stream = join(STREAM_DIR, `${name}.jsonl`);
      const workDir = join(temp, `work-${position}`);
      const configPath = join(temp, `${name}.json`);
      writeFileSync(configPath, JSON.stringify({ condition, modules, size, schedule: schedule(), workDir, stream, k: D.k,
        probeWaitMs: D.probeWaitMs, drainStepMs: D.drainStepMs, drainQuietSteps: D.drainQuietSteps, drainMaxMs: D.drainMaxMs }));
      const exit = await runChild([...D.nodeArgs, join(ROOT, WORKER), configPath], timeoutMs);
      const text = existsSync(stream) ? readFileSync(stream, 'utf8') : '';
      const { records, problems } = parseJsonl(text);
      const entry = { position, condition, name, stream: `${name}.jsonl`, streamSha256: digest(text), exit, problems };
      try { Object.assign(entry, childOutcome({ condition, exit, records, problems })); } catch (error) { entry.status = 'invalid'; entry.reasons = [`outcome_error:${error.message}`]; entry.observation = 'incomplete'; }
      entry.summary = childSummary(records, entry);
      result.children.push(entry); save();
      console.log(JSON.stringify({ position, condition, status: entry.status, observation: entry.observation, counts: entry.counts, wallMs: exit.wallMs }));
    };
    const run = await executeRun({ deadline, order, build, runOne, onNotRun: item => { result.notRun.push(item); save(); } });
    result.build = run.build; result.childErrors = run.childErrors;
    result.comparisons = CHECK ? null : comparisons(result.children);
    result.status = run.build.status === 'completed' && result.children.length === order.length && result.children.every(c => c.status === 'completed') ? 'completed' : 'partial';
  } catch (error) {
    failure = error; result.status = 'error'; result.error = String(error.stack ?? error.message);
  } finally {
    // Finalization: no new measurement or build work. powercfg only within the budget; local hashing and
    // removal of the owned temp dir may run past the deadline and are timed separately.
    const finalStart = Date.now();
    result.budget = { capMs: D.capMs, elapsedAtFinalizationMs: Math.round(deadline.elapsed()), expiredAtFinalization: deadline.expired() };
    const finalize = action => { try { action(); } catch (error) { failure ||= error; (result.finalizationErrors ??= []).push(String(error.message)); } };
    finalize(() => { result.finalEnvironment = environment(deadline); });
    finalize(() => {
      const changed = before.filter(row => row.hash !== (existsSync(join(ROOT, row.file)) ? hashFile(join(ROOT, row.file)) : null));
      result.preservation = { trackedFiles: before.length, changed: changed.map(row => row.file) }; assert.equal(changed.length, 0);
    });
    finalize(() => { result.tempCleanup = safeRemove(temp, tmpdir(), TEMP_PREFIX); });
    result.finalizationMs = Date.now() - finalStart; result.budget.overrunMs = Math.max(0, Math.round(deadline.elapsed() - D.capMs));
    result.finishedAt = new Date().toISOString(); result.totalMs = Date.now() - runnerStart; result.exitCode = failure ? 1 : result.status === 'completed' ? 0 : 2; save();
  }
  console.log(JSON.stringify({ mode: result.mode, status: result.status, exitCode: result.exitCode, output: OUTPUT }));
  process.exitCode = result.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
