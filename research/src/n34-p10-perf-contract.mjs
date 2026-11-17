// P10 harness contract (docs/agent/handoffs/n34-p10-prereg.md; plan PR #123 sections 6-7).
// Pure helpers with no side effects on import: run budget, per-stage raw checks, informational and
// mandatory verdicts, the F1 disposition table, owned-process kill rules, the run3 copy guard, the
// raw-only commit chain between blocks and the final receipt. Process, git and file access are passed
// in by the caller (research/src/n34-p10-perf.mjs) so that tests can use fakes.
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ROWS } from './n34-cr-policy-perf-inputs.mjs';

const MIN = 60_000, HOUR = 60 * MIN;
const TAB = String.fromCharCode(9);
export const sha256 = data => createHash('sha256').update(data).digest('hex');

// ---------- preregistered values (U3, plan 6.1) ----------
export const P10 = Object.freeze({
  schema: 'n34-p10-perf/v1',
  runId: 'p10run1',
  base: '5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3',
  candProduct: '4999c1f14b229d8c856200d49fdacd2d4611dc81',
  srcNumstat: ['21', '3', 'src/core/policy.ts'].join(TAB),
  resultsDir: 'research/results/n34-p10',
  blocks: Object.freeze(['timing', 'memory', 'info']),
  capMs: Object.freeze({ timing: 10 * HOUR, memory: 1 * HOUR, info: 4 * HOUR }),
  reserveMs: 10 * MIN,
  steps: Object.freeze({ cmd: 600_000, cal: 1_800_000, att: 1_800_000, cool: 30_000, mem: 600_000, kill: 10_000 }),
  selfCheck: Object.freeze({ capMs: 10 * MIN, reserveMs: MIN, faultChildMs: MIN }),
});
export const NEEDS = Object.freeze({ row: P10.steps.cal + P10.steps.att, attempt: P10.steps.att, retry: P10.steps.cool + P10.steps.att, memoryChild: P10.steps.mem });
export const officialOutput = block => `${P10.resultsDir}/perf-${P10.runId}-${block}.json`;
export const MANDATORY_KEYS = Object.freeze(ROWS.map(r => r.key));
// Informational rows: the G-C rows on the same input (cand = ref), as in run3.
export const INFO_ROWS = Object.freeze(ROWS.filter(r => r.gate === 'G-C').map(r => Object.freeze({ ...r, ref: r.cand, key: `${r.key}:same-input` })));
export const INFO_KEYS = Object.freeze(INFO_ROWS.map(r => r.key));
export const F1_INFO_KEYS = Object.freeze(['O1/F1:same-input', 'O2/F1:same-input']);
export const EXIT = Object.freeze({ pass: 0, completed_informational: 0, self_check_completed: 0, failed_correctness: 3, failed_gate: 4, invalid: 5 });
export const exitCodeFor = status => EXIT[status] ?? 1;

// ---------- run budget (plan 6.1) ----------
// D = t0 + C, Dwork = D - R. Work steps use remainingWork, finalization uses remainingTotal: R is
// subtracted once. A step timeout is budget-limited only when the remaining budget is strictly smaller
// than the step's own cap (m-1); at equality it is the step's own cap.
export class BudgetExpired extends Error {
  constructor(message) { super(message); this.name = 'BudgetExpired'; }
}
export function createBudget({ capMs, reserveMs, now }) {
  if (!(capMs > 0 && reserveMs >= 0 && reserveMs < capMs)) throw new Error('invalid budget');
  const t0 = now();
  const workEnd = capMs - reserveMs;
  const b = {
    capMs, reserveMs, workDeadlineMs: workEnd,
    elapsedMs: () => now() - t0,
    remainingWorkMs: () => Math.max(0, workEnd - (now() - t0)),
    remainingTotalMs: () => Math.max(0, capMs - (now() - t0)),
    canStart: needMs => b.remainingWorkMs() >= needMs,
    workTimeout(capStepMs, what = 'step') {
      const remaining = b.remainingWorkMs();
      if (remaining <= 0) throw new BudgetExpired(`${what}: work budget spent before start`);
      return remaining < capStepMs ? { ms: Math.max(1, Math.floor(remaining)), budgetLimited: true } : { ms: capStepMs, budgetLimited: false };
    },
    // Finalization step timeout; null when nothing is left (never a zero = unlimited timeout).
    finalTimeout(capStepMs) {
      const remaining = b.remainingTotalMs();
      if (remaining <= 0) return null;
      return remaining < capStepMs ? { ms: Math.max(1, Math.floor(remaining)), budgetLimited: true } : { ms: capStepMs, budgetLimited: false };
    },
  };
  return b;
}
export const isTimeoutError = error => error?.code === 'ETIMEDOUT' || error?.timedOut === true;
export function runBudgeted(budget, capStepMs, fn, what = 'step') {
  const { ms, budgetLimited } = budget.workTimeout(capStepMs, what);
  try { return fn(ms); } catch (error) {
    if (budgetLimited && isTimeoutError(error)) throw new BudgetExpired(`${what}: stopped at the work budget`);
    throw error;
  }
}
// Times are elapsed ms from t0. The file's values are cut off before the final save; the receipt
// carries the time after the final save and hash (n-2).
export function budgetRecord(budget, { workEndMs, finalStartMs, finalEndMs }) {
  const finalizationMs = finalEndMs - finalStartMs;
  return {
    capMs: budget.capMs, reserveMs: budget.reserveMs, workDeadlineMs: budget.workDeadlineMs,
    workEndMs, finalStartMs, finalEndMs, cutoff: 'before_final_save',
    workOverrunMs: Math.max(0, workEndMs - budget.workDeadlineMs),
    finalizationMs, finalizationOverReserveMs: Math.max(0, finalizationMs - budget.reserveMs),
    capOverrunMs: Math.max(0, finalEndMs - budget.capMs),
  };
}

// ---------- raw completeness (K1 functions, extended to the plan 6.4 stage table) ----------
const has = (value, ...keys) => value != null && keys.every(key => value[key] !== undefined);
export const CHILD_FIELDS = Object.freeze(['status', 'wallMs', 'startedAt', 'finishedAt', 'nodeArgs', 'pid']);
const ATTEMPT_STATES = Object.freeze(['output_mismatch', 'invalid_samples', 'invalid_aa', 'valid']);
export function childViolations(child, where) {
  return has(child, ...CHILD_FIELDS) ? [] : [`${where}:child`];
}
// Stage reached -> required fields. Fields of later stages may be absent; a missing field of the
// reached stage is a violation.
export function timingRawViolations(entry) {
  if (!has(entry, 'key', 'op', 'gate', 'cand', 'ref', 'attempts', 'status')) return ['row'];
  if (entry.status === 'notRun') return entry.reason ? [] : ['notRun:reason'];
  if (!has(entry, 'calibration')) return ['row'];
  const v = [];
  v.push(...childViolations(entry.calibration.child, 'calibration'));
  const calibrated = entry.calibration.child?.status === 'completed';
  if (calibrated && !(Array.isArray(entry.calibration.steps) && entry.calibration.steps.length > 0 && entry.calibration.k !== undefined)) v.push('calibration:steps');
  if (!calibrated && entry.attempts.length) v.push('calibration:attempts_without_calibration');
  let validNumber;
  for (const a of entry.attempts) {
    const where = `attempt${a.number}`;
    if (a.number === undefined) v.push('attempt:number');
    v.push(...childViolations(a.child, where));
    if (a.child?.status !== 'completed') continue;
    if (!ATTEMPT_STATES.includes(a.status)) { v.push(`${where}:status`); continue; }
    if (!a.digests || Object.keys(a.digests).length !== 4) v.push(`${where}:digests`);
    if (!a.views || Object.keys(a.views).length !== 4) v.push(`${where}:views`);
    if (a.status === 'invalid_samples') { if (!Array.isArray(a.samples)) v.push(`${where}:samples`); continue; }
    if (!Array.isArray(a.samples) || a.samples.length !== 144 || !a.samples.every(s => has(s, 'order', 'label', 'arm', 'ms'))) v.push(`${where}:samples`);
    if (a.status === 'output_mismatch') continue;
    if (!has(a, 'stats', 'aa', 'gate', 'ratioC1toB1Median')) v.push(`${where}:stats`);
    if (a.status === 'valid') validNumber = a.number;
  }
  if (validNumber !== undefined ? entry.selectedAttempt !== validNumber : entry.selectedAttempt !== undefined) v.push('selectedAttempt');
  return v;
}
export function memoryRawViolations(run) {
  const v = childViolations(run, `${run.key}/${run.arm}/${run.repeat}`);
  if (!has(run, 'key', 'repeat', 'arm', 'inputId')) v.push('identity');
  if (run.status === 'completed' && !has(run, 'retainedBytes', 'maxRssBytes', 'elapsedMs', 'before', 'after', 'outputDigest', 'view')) v.push(`${run.key}/${run.arm}/${run.repeat}:payload`);
  return v;
}
// K1 rule: the gap is always recorded; only a would-be pass becomes invalid.
export function applyRawCheck(row, violations) {
  row.rawViolations = violations;
  row.rawComplete = violations.length === 0;
  if (!row.rawComplete && row.status === 'pass') { row.statusBeforeRaw = 'pass'; row.status = 'invalid'; row.reason = `raw_incomplete: ${violations.join(',')}`; }
  return row;
}

// ---------- informational rows and block (plan 6.4, 7.2) ----------
export function infoVerdict(entry) {
  if (entry.status === 'notRun') return 'N';
  if (entry.calibration?.child?.status !== 'completed') return 'I(run)';
  const a = entry.attempts?.[0];
  if (!a) return 'I(run)'; // calibration stop condition not met
  if (a.child?.status !== 'completed') return 'I(run)';
  if (a.status === 'output_mismatch') return 'C';
  if (a.status === 'invalid_aa') return 'I(aa)';
  if (a.status === 'valid') return a.gate?.pass ? 'V' : 'X';
  return 'I(raw)';
}
// Only V becomes I(raw) on a raw gap; C, X, I(aa), I(run) keep their verdict beside the gap.
export function finalizeInfoRow(entry) {
  const row = { ...entry, informational: true };
  const violations = timingRawViolations(row);
  row.rawViolations = violations;
  row.rawComplete = violations.length === 0;
  row.verdict = infoVerdict(row);
  if (!row.rawComplete && row.verdict === 'V') { row.verdictBeforeRaw = 'V'; row.verdict = 'I(raw)'; }
  return row;
}
export function infoBlockStatus({ rows, bodyError = false, finalizationFailed = false }) {
  if (bodyError) return 'error';
  const keys = rows.map(r => r.key);
  if (rows.length !== INFO_KEYS.length || !INFO_KEYS.every(k => keys.filter(x => x === k).length === 1)) return 'error';
  if (rows.some(r => ['I(run)', 'I(raw)', 'N'].includes(r.verdict) || r.rawComplete !== true)) return 'error';
  if (finalizationFailed) return 'error';
  return 'completed_informational';
}
// Integrity failures are never a performance risk to accept (plan 7.2): any C row, identity or prior
// raw violations, snapshot assertion failures, environment change, tracked file change.
export function infoIntegrity({ rows, integrityErrors = [] }) {
  const reasons = [...rows.filter(r => r.verdict === 'C').map(r => `C:${r.key}`), ...integrityErrors];
  return { failure: reasons.length > 0, reasons };
}
// J4 (plan 7.3), first match wins. j2Pass = timing and memory blocks verified pass.
export function disposition({ j2Pass, info }) {
  if (!j2Pass) return 'D-3';
  if (!info) return 'D-2';
  if (info.integrityFailure) return 'D-4';
  const f1 = F1_INFO_KEYS.map(k => info.verdicts?.[k]);
  if (info.status !== 'completed_informational' || f1.includes('I(aa)')) return 'D-2';
  if (f1.every(v => v === 'V')) return 'D-0';
  if (f1.every(v => v === 'V' || v === 'X')) return 'D-1';
  return 'D-2';
}

// ---------- mandatory block (plan 6.3) ----------
export function mandatoryBlockStatus({ rows, expectedKeys = MANDATORY_KEYS, bodyError = false, finalizationFailed = false }) {
  if (rows.some(r => r.status === 'failed_correctness')) return 'failed_correctness';
  if (rows.some(r => r.status === 'failed_gate')) return 'failed_gate';
  if (rows.some(r => ['invalid', 'ref_failed', 'notRun'].includes(r.status))) return 'invalid';
  if (bodyError) return 'error';
  const keys = rows.map(r => r.key);
  const complete = rows.length === expectedKeys.length && expectedKeys.every(k => keys.filter(x => x === k).length === 1) && rows.every(r => r.status === 'pass');
  if (!complete) return 'invalid';
  if (finalizationFailed) return 'error';
  return 'pass';
}

// ---------- owned processes (execution supplement M-2) ----------
// Only a ChildProcess object this runner spawned, registered with a safe positive pid, whose
// exitCode and signalCode are both null and for which no error/exit/close was seen, may be killed.
// The check and the taskkill call run synchronously with no yield in between. A pid restored from a
// file or any other object is never killed. The lifecycle premise (exit state set before the handle closes,
// supplement M-2) is checked for the fixed runtime only; when it is not confirmed nothing is killed (fail closed).
export function createOwnership({ execFileSync, lifecycleConfirmed = false }) {
  const owned = new Map();
  const own = {
    lifecycleConfirmed,
    register(child, info = {}) {
      if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return null;
      const rec = { pid: child.pid, ...info, spawnEventSeen: false, spawnError: false, exitSeen: false, closeObserved: false, kills: [] };
      owned.set(child, rec);
      child.once('spawn', () => { rec.spawnEventSeen = true; });
      child.once('error', () => { rec.spawnError = true; });
      child.once('exit', () => { rec.exitSeen = true; });
      child.once('close', () => { rec.closeObserved = true; });
      return rec;
    },
    record: child => owned.get(child),
    killBlocker(child) {
      const rec = owned.get(child);
      if (!rec) return 'not_owned';
      if (!lifecycleConfirmed) return 'lifecycle_unconfirmed';
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || child.pid !== rec.pid) return 'bad_pid';
      if (child.exitCode !== null) return 'exit_code_set';
      if (child.signalCode !== null) return 'signal_code_set';
      if (rec.spawnError) return 'spawn_error';
      if (rec.exitSeen) return 'exit_seen';
      if (rec.closeObserved) return 'close_seen';
      return null;
    },
    kill(child, timeoutMs) {
      const rec = owned.get(child);
      const blocker = own.killBlocker(child);
      if (blocker) { rec?.kills.push({ method: 'none', ok: false, skipped: blocker }); return false; }
      if (!(timeoutMs > 0)) { rec.kills.push({ method: 'none', ok: false, skipped: 'no_budget' }); return false; }
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: timeoutMs });
        rec.kills.push({ method: 'taskkill', ok: true, timeoutMs });
        return true;
      } catch (error) {
        rec.kills.push({ method: 'taskkill', ok: false, timeoutMs, error: String(error?.message).slice(0, 200) });
        const again = own.killBlocker(child);
        if (again) { rec.kills.push({ method: 'none', ok: false, skipped: again }); return false; }
        try { const ok = child.kill(); rec.kills.push({ method: 'child.kill', ok: Boolean(ok) }); return Boolean(ok); } catch (e) { rec.kills.push({ method: 'child.kill', ok: false, error: String(e?.message).slice(0, 200) }); return false; }
      }
    },
    leftovers: () => [...owned.values()].filter(r => !r.closeObserved).map(r => r.pid),
    // Block end (plan 6.2): try the same ownership kill on every owned child that has not closed.
    killUnclosed: timeoutMs => [...owned.entries()].filter(([, r]) => !r.closeObserved).map(([child, r]) => ({ pid: r.pid, killed: own.kill(child, timeoutMs) })),
    records: () => [...owned.values()],
  };
  return own;
}
// Cleanup evidence: every owned child must have closed, and a child that needed a kill counts as cleaned
// only after a successful taskkill /T on it (a child.kill fallback ends the root only, so descendants stay
// unconfirmed). Any violation makes the block non-PASS.
export function cleanupViolations(records) {
  const v = [];
  for (const r of records) {
    if (!r.closeObserved) v.push(`no_close:${r.pid}`);
    if (r.kills.length && !r.kills.some(k => k.method === 'taskkill' && k.ok)) v.push(`tree_kill_unconfirmed:${r.pid}`);
  }
  return v;
}

// ---------- run3 copy guard (execution supplement M-1; K1 copyDelta precedent) ----------
// LF-normalised line LCS of the P10 runner against the unchanged run3 runner. Every added or changed
// line must carry a P10 marker or lie inside a P10 open/close block; removed run3 lines are pinned.
export function copyDelta(run3Raw, selfRaw) {
  const lf = text => text.replaceAll('\r\n', '\n');
  const run3Text = lf(run3Raw), a = run3Text.split('\n'), b = lf(selfRaw).split('\n');
  const width = b.length + 1, dp = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i * width + j] = a[i] === b[j] ? dp[(i + 1) * width + j + 1] + 1 : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
  }
  const removed = [], added = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && (i === a.length || dp[i * width + j + 1] >= dp[(i + 1) * width + j])) added.push(j++);
    else removed.push(a[i++]);
  }
  const [OPEN, CLOSE, LINE] = ['// P10' + '>', 'P10' + '<', '// P10'];
  let inBlock = false;
  const marked = b.map(line => { if (line.includes(OPEN)) inBlock = true; const m = inBlock || line.includes(LINE); if (line.includes(CLOSE)) inBlock = false; return m; });
  return { run3Sha256: sha256(run3Text), removed, removedSha256: sha256(removed.join('\n')), unmarkedAdded: added.filter(n => !marked[n]).map(n => `${n + 1}: ${b[n]}`), addedCount: added.length };
}

// ---------- receipts, refusals, outputs ----------
const RECEIPT_PREFIX = 'P10-Receipt: ';
export const formatReceipt = receipt => RECEIPT_PREFIX + JSON.stringify(receipt);
export function parseReceipts(message) {
  const lines = String(message).split('\n').map(l => l.trimEnd()).filter(l => l.startsWith(RECEIPT_PREFIX));
  if (lines.length !== 1) throw new Error(`expected exactly one P10-Receipt line, got ${lines.length}`);
  try { return [JSON.parse(lines[0].slice(RECEIPT_PREFIX.length))]; } catch (error) { throw new Error(`unreadable receipt: ${error.message}`); }
}
export const refusal = ({ phase, reasonCode, integrityFailure, expected, actual }) => ({ status: 'refused', phase, reasonCode, integrityFailure: Boolean(integrityFailure), expected, actual, exitCode: 1 });
// n-3: self-check output lives outside the repository and never uses an official name or folder.
export function selfCheckOutputViolations(path, root) {
  const v = [];
  if (!isAbsolute(path)) return ['not_absolute'];
  const rel = relative(resolve(root), resolve(path));
  if (!rel.startsWith('..') && !isAbsolute(rel)) v.push('inside_repository');
  if (!/^selfcheck-[a-z0-9-]+[.]json$/.test(basename(path))) v.push('name');
  if (resolve(path).replaceAll('\\', '/').includes(P10.resultsDir)) v.push('official_folder');
  return v;
}

// ---------- raw-only commit chain (plan 6.5, supplement n-2/m-6/m-7) ----------
// `to` must be exactly one commit on top of `from` whose only change adds `path`, with exactly one
// receipt naming the same file hash, block, pass status, exit 0 and no cap overrun.
export function verifyRawOnlyCommit({ git, readBlob, from, to, path, block }) {
  const reasons = [];
  let receipt = null, doc = null;
  const parents = git(['rev-list', '--parents', '-n', '1', to]).split(' ').filter(Boolean);
  if (parents.length !== 2 || parents[1] !== from) reasons.push('not_single_child_commit');
  if (git(['rev-list', '--count', `${from}..${to}`]) !== '1') reasons.push('commit_count');
  const changes = git(['diff', '--name-status', '--no-renames', from, to]);
  if (changes !== `A${TAB}${path}`) reasons.push(`changes:${changes.split('\n').length}`);
  let blob = null;
  try { blob = readBlob(to, path); } catch { reasons.push('blob_missing'); }
  try { [receipt] = parseReceipts(git(['log', '-1', '--format=%B', to])); } catch (error) { reasons.push(`receipt:${error.message}`); }
  if (blob && receipt) {
    if (receipt.receipt !== 'p10' || receipt.run !== P10.runId || receipt.block !== block || receipt.output !== path) reasons.push('receipt_identity');
    if (receipt.sha256 !== sha256(blob)) reasons.push('receipt_sha256');
    if (receipt.status !== 'pass' || receipt.exitCode !== 0) reasons.push('receipt_status');
    if (receipt.capOverrunMs !== 0) reasons.push('receipt_cap_overrun');
  }
  if (blob) { try { doc = JSON.parse(blob.toString('utf8')); } catch { reasons.push('raw_unreadable'); } }
  if (doc && receipt && (doc.status !== receipt.status || doc.exitCode !== receipt.exitCode)) reasons.push('receipt_file_mismatch');
  return { reasons, receipt, doc };
}
// m-7: a prior block is accepted only when its stored verdicts survive the validators again, every
// success condition holds and its identity matches the current block. A hand-written 'pass' is not enough.
export function validatePriorBlock(doc, { block, expected, timingFinal, memoryOutcome }) {
  const r = [];
  if (!doc) return ['prior_missing'];
  if (doc.schema !== P10.schema || doc.run !== P10.runId || doc.block !== block) r.push('prior_identity');
  if (doc.status !== 'pass' || doc.exitCode !== 0) r.push('prior_status');
  const keys = (doc.rows ?? []).map(x => x.key);
  if (keys.length !== MANDATORY_KEYS.length || !MANDATORY_KEYS.every((k, i) => keys[i] === k)) r.push('prior_rows');
  if (!(doc.rows ?? []).every(x => x.status === 'pass' && x.rawComplete === true)) r.push('prior_row_status');
  if (block === 'timing') {
    const again = (doc.rows ?? []).map(x => timingFinal(structuredClone(x)));
    if (!again.every(x => x.status === 'pass' && x.rawComplete)) r.push('prior_raw_recheck');
    if (mandatoryBlockStatus({ rows: again }) !== 'pass') r.push('prior_block_recheck');
  } else {
    const out = memoryOutcome(structuredClone(doc.runs ?? []));
    if (out.status !== 'pass' || !isDeepStrictEqual(out.rows.map(x => [x.key, x.status]), (doc.rows ?? []).map(x => [x.key, x.status]))) r.push('prior_raw_recheck');
    if ((doc.runs ?? []).length !== 108) r.push('prior_runs');
  }
  if ((doc.finalizationErrors ?? []).length) r.push('prior_finalization');
  if ((doc.leftoverPids ?? []).length || doc.tempCleanup !== true) r.push('prior_cleanup');
  if ((doc.preservation?.changed ?? ['?']).length) r.push('prior_preservation');
  if (doc.budget?.capOverrunMs !== 0) r.push('prior_cap_overrun');
  if (!isDeepStrictEqual(doc.finalEnvironment, doc.environment)) r.push('prior_environment_changed');
  for (const field of ['preregistrationCommit', 'base', 'candidateProduct', 'files', 'inputs', 'protocol', 'p10', 'environment']) {
    if (!isDeepStrictEqual(doc[field], expected[field])) r.push(`identity:${field}`);
  }
  return r;
}
// Snapshot identity after the build: everything except the per-block ref of the candidate.
export function snapshotIdentity(snapshots) {
  return Object.fromEntries(Object.entries(snapshots ?? {}).map(([k, v]) => [k, { ...v, ref: k === 'candidate' ? '<measurementHead>' : v.ref }]));
}
