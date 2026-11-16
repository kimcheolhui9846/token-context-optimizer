// N-34 K1 D1 diagnostic runner (exploratory, NOT a performance gate).
// Approval: codex_review/review_2026-11-16_n34-k1-d1-approval.md (user approved 2026-11-16).
// Protocol: docs/agent/handoffs/n34-k1-diag-prereg.md. Separate from the official K1 timing/memory
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
import { constants as PERF } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA = 'n34-k1-diag/v1';
const BASE = '7e732e0e07a1977dbf0c754319fd3a726924621e';
const CAND = '4999c1f14b229d8c856200d49fdacd2d4611dc81';
const RUNNER = 'research/src/n34-k1-diag.mjs';
const WORKER = 'research/src/n34-k1-diag-worker.mjs';
const INPUTS_MODULE = 'research/src/n34-cr-policy-perf-inputs.mjs';
const PROTOCOL = 'docs/agent/handoffs/n34-k1-diag-prereg.md';
const HARNESS_FILES = [RUNNER, WORKER, INPUTS_MODULE, PROTOCOL];
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
// Validates one child's parsed stream against the approved design. condition 'a' | 'b'.
export function childOutcome({ condition, exit, records, problems, expected = schedule() }) {
  const reasons = [];
  const by = type => records.filter(r => r.type === type);
  const samples = by('sample'), forced = by('forced'), gc = by('gc');
  const start = by('start')[0], probe = by('probe')[0], drain = by('drain')[0], end = by('end')[0], digests = by('digest');
  if (exit.status !== 'exited' || exit.exitCode !== 0) reasons.push(`process:${exit.status}:${exit.exitCode}`);
  if (problems.length) reasons.push(`stream:${problems.map(p => p.problem).join(',')}`);
  if (!start) reasons.push('missing:start');
  if (!end || end.status !== 'completed') reasons.push('missing:end');
  if (samples.length !== expected.length) reasons.push(`samples:${samples.length}`);
  samples.forEach((s, i) => {
    const missing = SAMPLE_FIELDS.filter(f => s[f] === undefined || s[f] === null);
    if (missing.length) reasons.push(`sample${i}:missing:${missing.join('/')}`);
    if (s.i !== i || s.label !== expected[i]?.label || s.arm !== expected[i]?.arm) reasons.push(`sample${i}:order`);
  });
  if (digests.length !== 4 || new Set(digests.map(d => d.digest)).size !== 1) reasons.push('digest');
  if (condition === 'a' && forced.length !== 0) reasons.push(`forced:${forced.length}`);
  if (condition === 'b') {
    if (forced.length !== expected.length) reasons.push(`forced:${forced.length}`);
    forced.forEach((f, i) => { const s = samples[i]; if (f.i !== i || !s || !(f.end <= s.t0)) reasons.push(`forced${i}:position`); });
  }
  let observation;
  if (!probe || probe.supported !== true) observation = 'unsupported';
  else if (!drain || drain.complete !== true || probe.clockOk !== true) observation = 'incomplete';
  else observation = 'supported';
  const status = reasons.length === 0 ? 'completed' : (exit.status === 'timeout' ? 'timeout' : 'invalid');
  return { status, reasons, observation, counts: { samples: samples.length, forced: forced.length, gcEvents: gc.length } };
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
// ==== PURE FUNCTIONS END ====

// ---------- descriptive summaries (no verdicts) ----------
const r3 = v => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000);
function desc(values, perCopy) {
  if (!values.length) return null;
  const median = nearestRank(values, 0.5), p95 = nearestRank(values, 0.95);
  return { n: values.length, median: r3(median), p95: r3(p95), spread: r3(p95 - median), rankNote: perCopy ? 'sorted[14]/sorted[28]' : 'sorted[29]/sorted[56]' };
}
export function childSummary(records, outcome) {
  const samples = records.filter(r => r.type === 'sample');
  const gc = records.filter(r => r.type === 'gc').map(e => ({ ...e, kindName: GC_KIND[e.kind] ?? 'other' }));
  const forced = records.filter(r => r.type === 'forced');
  const attrib = samples.map(s => ({ s, a: attributeSample(s, gc, forced, outcome.observation) }));
  const measured = attrib.filter(x => x.s.label.startsWith('measure/'));
  const roles = { B: ['B1', 'B2'], C: ['C1', 'C2'] };
  const out = { copies: {}, roles: {}, attribution: {} };
  for (const arm of ['B1', 'B2', 'C1', 'C2']) {
    const m = measured.filter(x => x.s.arm === arm);
    out.copies[arm] = { wall: desc(m.map(x => x.s.wallMs), true), index: desc(m.map(x => x.s.indexMs), true), summarize: desc(m.map(x => x.s.summarizeMs), true) };
  }
  for (const [role, [one, two]] of Object.entries(roles)) {
    const m = measured.filter(x => x.s.arm === one || x.s.arm === two);
    const walls = m.map(x => x.s.wallMs);
    const observed = m.filter(x => x.a.status === 'observed');
    const majors = observed.map(x => x.a.overlapMs.major);
    const cpu = m.map(x => cpuWallRatio(x.s.cpuUserUs, x.s.cpuSystemUs, x.s.wallMs)).filter(v => v !== null);
    const m1 = out.copies[one].wall?.median, m2 = out.copies[two].wall?.median;
    const allObserved = observed.length === m.length;
    out.roles[role] = {
      wall: desc(walls, false), index: desc(m.map(x => x.s.indexMs), false), summarize: desc(m.map(x => x.s.summarizeMs), false),
      copyMedianRatio: m1 && m2 ? r3(m2 / m1) : null, cpuWall: desc(cpu, false),
      gc: { attributionStatus: Object.fromEntries(['observed', 'ambiguous', 'unobserved', 'incomplete'].map(k => [k, m.filter(x => x.a.status === k).length])),
        majorOverlapFraction: allObserved ? r3(majors.filter(v => v > 0).length / majors.length) : null,
        majorOverlap: allObserved ? desc(majors, false) : null, majorOverlapSumMs: allObserved ? r3(majors.reduce((a, b) => a + b, 0)) : null,
        nullReason: allObserved ? null : 'not_all_samples_observed_unambiguous' },
      spearmanWallMajor: allObserved ? spearman(walls, majors) : { value: null, reason: 'not_all_samples_observed_unambiguous' },
      clusters: largestGap(walls),
    };
  }
  out.attribution = attrib.map(x => ({ i: x.s.i, status: x.a.status, crossoverEvents: x.a.crossoverEvents, overlapMs: x.a.overlapMs, phaseMajorMs: x.a.phaseMajorMs, startedInSample: x.a.startedInSample }));
  out.gcEventsBetweenSamples = gc.filter(e => !samples.some(s => clip(eventInterval(e), [s.t0, s.t2]))).length;
  out.gcEventsInForcedWindows = gc.filter(e => forced.some(f => clip(eventInterval(e), [f.start, f.end]))).length;
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
    const s = schedule(), recs = [{ type: 'start' }, { type: 'probe', supported: true, clockOk: true }];
    for (const arm of ['B1', 'B2', 'C1', 'C2']) recs.push({ type: 'digest', arm, digest: 'x' });
    s.forEach((e, i) => {
      const t0 = 100 * i + 10;
      if (condition === 'b') recs.push({ type: 'forced', i, start: t0 - 8, end: t0 - 2 });
      recs.push({ type: 'sample', i, label: e.label, arm: e.arm, t0, t1: t0 + 5, t2: t0 + 9, wallMs: 9, indexMs: 5, summarizeMs: 4, cpuUserUs: 1, cpuSystemUs: 1, heapBefore: {}, heapAfter: {} });
    });
    recs.push({ type: 'drain', complete: true }, { type: 'end', status: 'completed' });
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
  } finally { safeRemove(temp, tmpdir(), TEMP_PREFIX); }
  return results;
}

// ---------- process helpers ----------
const digest = data => createHash('sha256').update(data).digest('hex');
const hashFile = file => digest(readFileSync(file));
const command = (exe, args, cwd = ROOT) => execFileSync(exe, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * MIB });
const git = args => command('git', args).trim();
// Kills only our own child process tree (by its PID) on timeout.
function killOwnChild(child) {
  if (child.exitCode !== null) return;
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); } catch { child.kill(); }
}
export function runChild(args, timeoutMs) {
  return new Promise(done => {
    const started = Date.now(), startedAt = new Date(started).toISOString();
    let child, stderr = '', timedOut = false, settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); done({ ...value, startedAt, finishedAt: new Date().toISOString(), wallMs: Date.now() - started, nodeArgs: args.filter(a => a.startsWith('--')) }); } };
    try { child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (error) { done({ status: 'spawn_error', message: String(error.message), startedAt, finishedAt: startedAt, wallMs: 0 }); return; }
    const timer = setTimeout(() => { timedOut = true; killOwnChild(child); }, timeoutMs);
    child.stderr.setEncoding('utf8'); child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
    child.on('error', error => finish({ status: 'spawn_error', message: String(error.message) }));
    child.on('close', (exitCode, signal) => finish({ status: timedOut ? 'timeout' : 'exited', exitCode, signal, stderrTail: stderr || undefined }));
  });
}
function environment() {
  const cpu = cpus();
  return { node: process.version, v8: process.versions.v8, platform: process.platform, os: release(), arch: process.arch,
    cpuModels: [...new Set(cpu.map(item => item.model))], logicalCPUs: cpu.length, totalMemBytes: totalmem(),
    powerSchemeGuid: (command('powercfg', ['/GETACTIVESCHEME']).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) ?? [null])[0] };
}
function npm(args, cwd, log) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [NPM, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } });
    let output = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killOwnChild(child); }, 600000);
    child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); writeFileSync(log, output); code === 0 && !timedOut ? done() : reject(new Error(`npm ${args.join(' ')} failed (${code}, timeout=${timedOut})`)); });
  });
}
// Same snapshot method as the official K1 harness: git archive -> npm ci --ignore-scripts -> tsc,
// A/A copies are byte copies of dist. CAND is the fixed SHA, not the current HEAD.
async function buildSnapshots(temp, logs) {
  const snapshots = {}, dirs = {};
  for (const [variant, ref] of [['base', BASE], ['candidate', CAND]]) {
    const snapshot = join(temp, variant); mkdirSync(snapshot);
    const archive = join(temp, `${variant}.tar`);
    command('git', ['archive', '--format=tar', ref, '-o', archive]);
    command(TAR, ['-xf', archive, '-C', snapshot]);
    await npm(['ci', '--ignore-scripts'], snapshot, join(logs, `${variant}-ci.log`));
    command(process.execPath, [join(snapshot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], snapshot);
    cpSync(join(snapshot, 'dist'), join(snapshot, 'dist-aa'), { recursive: true });
    const core = d => Object.fromEntries(readdirSync(join(snapshot, d, 'src/core')).filter(f => f.endsWith('.js')).sort().map(f => [f, hashFile(join(snapshot, d, 'src/core', f))]));
    const dist = core('dist');
    assert.deepEqual(core('dist-aa'), dist, 'A/A copy differs');
    snapshots[variant] = { ref, policyBlobSha1: git(['rev-parse', `${ref}:src/core/policy.ts`]), lockfileSha256: hashFile(join(snapshot, 'package-lock.json')), distCoreSha256: dist };
    dirs[variant] = [join(snapshot, 'dist'), join(snapshot, 'dist-aa')];
  }
  assert.equal(snapshots.base.lockfileSha256, snapshots.candidate.lockfileSha256, 'lockfile differs between arms');
  assert.equal(git(['diff', '--numstat', BASE, CAND, '--', 'src']), ['2', '0', 'src/core/policy.ts'].join(String.fromCharCode(9)), 'src delta must be the two K1 guards');
  for (const file of Object.keys(snapshots.base.distCoreSha256))
    if (file !== 'policy.js') assert.equal(snapshots.base.distCoreSha256[file], snapshots.candidate.distCoreSha256[file], `${file} differs between arms`);
  return { snapshots, modules: { B1: dirs.base[0], B2: dirs.base[1], C1: dirs.candidate[0], C2: dirs.candidate[1] } };
}

async function main() {
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
  assert.equal(git(['status', '--porcelain']), '', 'commit preregistration and implementation before running');
  const head = git(['rev-parse', 'HEAD']);
  const preregArg = process.argv.find(a => a.startsWith('--prereg='))?.slice(9);
  assert(preregArg, '--prereg=<committed-sha> is required');
  const prereg = git(['rev-parse', preregArg]);
  git(['merge-base', '--is-ancestor', prereg, head]);
  git(['diff', '--exit-code', prereg, head, '--', ...HARNESS_FILES]);
  assert.equal(prereg, git(['log', '-1', '--format=%H', head, '--', ...HARNESS_FILES]), '--prereg must be the last commit that touched the diagnostic harness or protocol');
  const order = CHECK ? D.checkOrder : D.order;
  const size = CHECK ? D.checkSize : D.mainSize;
  const runnerStart = Date.now();
  mkdirSync(STREAM_DIR);
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const before = tracked.map(file => ({ file, hash: existsSync(join(ROOT, file)) ? hashFile(join(ROOT, file)) : null }));
  const temp = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  const logs = join(temp, 'logs'); mkdirSync(logs);
  const result = { schema: SCHEMA, mode: CHECK ? 'check-run' : 'main', status: 'incomplete', startedAt: new Date(runnerStart).toISOString(), preregistrationCommit: prereg, measurementHead: head,
    base: BASE, candidate: CAND, design: { ...D, size, order }, files: Object.fromEntries([...HARNESS_FILES, 'package-lock.json'].map(f => [f, { blobSha1: git(['rev-parse', `HEAD:${f}`]), workingCopySha256: hashFile(join(ROOT, f)) }])),
    environment: environment(), snapshots: {}, children: [], notRun: [] };
  const normalized = value => JSON.parse(JSON.stringify(value).replaceAll(temp.replaceAll('\\', '\\\\'), '<temp>').replaceAll(ROOT.replaceAll('\\', '\\\\'), '<repo>'));
  const save = () => writeFileSync(OUTPUT, JSON.stringify(normalized(result), null, 1) + '\n');
  let failure;
  try {
    save();
    const { snapshots, modules } = await buildSnapshots(temp, logs);
    result.snapshots = snapshots; result.buildMs = Date.now() - runnerStart; save();
    for (let p = 0; p < order.length; p++) {
      const position = p + 1, condition = order[p];
      const name = `child-${position}-${condition}`;
      const elapsed = Date.now() - runnerStart;
      if (!canStartChild(elapsed)) { result.notRun.push({ position, condition, elapsedMs: elapsed }); save(); continue; }
      const stream = join(STREAM_DIR, `${name}.jsonl`);
      const workDir = join(temp, `work-${position}`);
      const configPath = join(temp, `${name}.json`);
      writeFileSync(configPath, JSON.stringify({ condition, modules, size, schedule: schedule(), workDir, stream, k: D.k,
        probeWaitMs: D.probeWaitMs, drainStepMs: D.drainStepMs, drainQuietSteps: D.drainQuietSteps, drainMaxMs: D.drainMaxMs }));
      const exit = await runChild([...D.nodeArgs, join(ROOT, WORKER), configPath], D.childTimeoutMs);
      const text = existsSync(stream) ? readFileSync(stream, 'utf8') : '';
      const { records, problems } = parseJsonl(text);
      const outcome = childOutcome({ condition, exit, records, problems });
      const entry = { position, condition, name, stream: `${name}.jsonl`, streamSha256: digest(text), exit, problems, ...outcome };
      entry.summary = childSummary(records, outcome);
      result.children.push(entry); save();
      console.log(JSON.stringify({ position, condition, status: entry.status, observation: entry.observation, counts: entry.counts, wallMs: exit.wallMs }));
    }
    result.comparisons = CHECK ? null : comparisons(result.children);
    result.status = result.children.length === order.length && result.children.every(c => c.status === 'completed') ? 'completed' : 'partial';
  } catch (error) {
    failure = error; result.status = 'error'; result.error = String(error.stack ?? error.message);
  } finally {
    const finalize = action => { try { action(); } catch (error) { failure ||= error; (result.finalizationErrors ??= []).push(String(error.message)); } };
    finalize(() => { result.finalEnvironment = environment(); });
    finalize(() => {
      const changed = before.filter(row => row.hash !== (existsSync(join(ROOT, row.file)) ? hashFile(join(ROOT, row.file)) : null));
      result.preservation = { trackedFiles: before.length, changed: changed.map(row => row.file) }; assert.equal(changed.length, 0);
    });
    finalize(() => { result.tempCleanup = safeRemove(temp, tmpdir(), TEMP_PREFIX); });
    result.finishedAt = new Date().toISOString(); result.totalMs = Date.now() - runnerStart; result.exitCode = failure ? 1 : result.status === 'completed' ? 0 : 2; save();
  }
  console.log(JSON.stringify({ mode: result.mode, status: result.status, exitCode: result.exitCode, output: OUTPUT }));
  process.exitCode = result.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
