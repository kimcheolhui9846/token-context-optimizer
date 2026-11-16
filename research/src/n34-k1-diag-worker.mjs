// N-34 K1 D1 diagnostic child (exploratory, NOT a performance gate). One fresh hidden process per
// child, started with --expose-gc in both conditions. Protocol: docs/agent/handoffs/n34-k1-diag-prereg.md.
// Writes JSONL records synchronously to config.stream as they happen, so a partial stream survives a
// timeout or crash. Record types: start, probe, digest, forced, sample, gc, drain, end, error.
//  - a: no per-sample forced GC.  b: exactly one gc() immediately before EACH of the 144 samples
//    (first warmup included), before the pre-sample heap/CPU reads; none after the last sample.
//  - One common support probe gc() per child, before the schedule, counted separately.
// GC events are attributed later by the runner from startTime/duration (common performance clock),
// never from callback arrival time.
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { PerformanceObserver, performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { getHeapStatistics } from 'node:v8';
import { SUMMARY_MAX_TOKENS, makeInput, o2View, runO2 } from './n34-cr-policy-perf-inputs.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const fd = openSync(config.stream, 'wx');
let gcSeq = 0;
let probeCapture = null; // minimal copies of events seen during the probe wait only
const emit = record => writeSync(fd, JSON.stringify(record) + '\n');
const heap = () => { const h = getHeapStatistics(); return { used: h.used_heap_size, total: h.total_heap_size }; };
const sleep = ms => new Promise(done => setTimeout(done, ms));
const FORCED = 4; // perf_hooks.constants.NODE_PERFORMANCE_GC_FLAGS_FORCED (checked below)

function record(entry, source) {
  const flags = entry.detail?.flags ?? null;
  if (probeCapture) probeCapture.push({ startTime: entry.startTime, duration: entry.duration, flags });
  emit({ type: 'gc', seq: gcSeq++, source, startTime: entry.startTime, duration: entry.duration, kind: entry.detail?.kind ?? null, flags, arrivedAt: performance.now() });
}
const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) record(entry, 'callback'); });

try {
  const { constants } = await import('node:perf_hooks');
  emit({ type: 'start', pid: process.pid, node: process.version, v8: process.versions.v8, execArgv: process.execArgv, condition: config.condition, size: config.size,
    gcFunction: typeof globalThis.gc === 'function', forcedFlagConstant: constants.NODE_PERFORMANCE_GC_FLAGS_FORCED, timeOrigin: performance.timeOrigin, now: performance.now() });
  if (constants.NODE_PERFORMANCE_GC_FLAGS_FORCED !== FORCED) throw new Error('unexpected NODE_PERFORMANCE_GC_FLAGS_FORCED');
  const arms = {};
  for (const [name, dir] of Object.entries(config.modules)) {
    arms[name] = {
      policy: await import(pathToFileURL(join(dir, 'src/core/policy.js')).href),
      artifacts: await import(pathToFileURL(join(dir, 'src/core/artifacts.js')).href),
    };
  }
  observer.observe({ entryTypes: ['gc'] });

  // Support probe: one forced GC; wait (bounded) for an observed FORCED entry and check that its
  // startTime lies on the same clock window as performance.now() around the call.
  const probe = { type: 'probe', supported: false, clockOk: false, waitedMs: 0 };
  if (typeof globalThis.gc === 'function') {
    probeCapture = [];
    probe.before = performance.now(); globalThis.gc(); probe.after = performance.now();
    const t = performance.now();
    const forcedSeen = () => probeCapture.filter(e => (e.flags ?? 0) & FORCED);
    while (forcedSeen().length === 0 && performance.now() - t < config.probeWaitMs) { await sleep(10); for (const e of observer.takeRecords()) record(e, 'takeRecords'); }
    probe.waitedMs = performance.now() - t;
    const forced = forcedSeen();
    probe.observedEvents = probeCapture.length;
    probe.forcedEvents = forced;
    probe.supported = forced.length > 0;
    // Clock check: a FORCED event must start inside [before, after] of the gc() call on performance.now().
    probe.clockOk = forced.some(e => e.startTime >= probe.before && e.startTime <= probe.after);
    probeCapture = null;
  }
  emit(probe);

  const workDir = config.workDir;
  mkdirSync(workDir);
  const input = makeInput('F3', config.size);
  const path = join(workDir, 'cand-F3.txt');
  writeFileSync(path, input, { encoding: 'utf8', flag: 'wx' });

  // Correctness outside timing: one separate official runO2 call per copy before the schedule.
  for (const arm of Object.keys(arms)) {
    const v = o2View(await runO2(arms[arm], path, workDir));
    emit({ type: 'digest', arm, digest: createHash('sha256').update(JSON.stringify(v)).digest('hex') });
  }

  // Timed sample: same calls and order as runO2 (indexArtifact -> summarizeArtifact) with one extra
  // performance.now() between them. The result objects live only inside this function, as in runO2.
  async function timed(arm) {
    const mod = arms[arm];
    const t0 = performance.now();
    const store = new mod.artifacts.MemoryArtifactStore();
    const rec = await mod.artifacts.indexArtifact({ path, store, allowedRoots: [workDir] });
    const t1 = performance.now();
    const summary = mod.artifacts.summarizeArtifact({ artifactId: rec.artifactId, maxTokens: SUMMARY_MAX_TOKENS, store });
    const t2 = performance.now();
    const ok = rec.byteLength === config.size && typeof summary === 'object';
    return { t0, t1, t2, ok };
  }

  for (let i = 0; i < config.schedule.length; i++) {
    const { label, arm } = config.schedule[i];
    if (config.condition === 'b') { const start = performance.now(); globalThis.gc(); emit({ type: 'forced', i, start, end: performance.now() }); }
    const heapBefore = heap();
    const cpu0 = process.cpuUsage();
    const { t0, t1, t2, ok } = await timed(arm);
    const cpu = process.cpuUsage(cpu0);
    const heapAfter = heap();
    if (!ok) throw new Error(`${arm}: byteLength or summary check failed at sample ${i}`);
    emit({ type: 'sample', i, label, arm, t0, t1, t2, wallMs: t2 - t0, indexMs: t1 - t0, summarizeMs: t2 - t1, cpuUserUs: cpu.user, cpuSystemUs: cpu.system, heapBefore, heapAfter });
  }

  // Bounded drain: yield and collect until drainQuietSteps consecutive steps add no event, max drainMaxMs.
  const drainStart = performance.now();
  let quiet = 0, steps = 0;
  while (quiet < config.drainQuietSteps && performance.now() - drainStart < config.drainMaxMs) {
    const n = gcSeq;
    await sleep(config.drainStepMs);
    for (const e of observer.takeRecords()) record(e, 'takeRecords');
    steps++; quiet = gcSeq === n ? quiet + 1 : 0;
  }
  observer.disconnect();
  emit({ type: 'drain', complete: quiet >= config.drainQuietSteps, steps, drainMs: performance.now() - drainStart, totalEvents: gcSeq,
    note: 'bounded drain; not a proof that every GC event was observed' });
  emit({ type: 'end', status: 'completed', now: performance.now() });
} catch (error) {
  emit({ type: 'error', name: error?.name, message: String(error?.message) });
  emit({ type: 'end', status: 'error' });
  process.exitCode = 1;
} finally {
  closeSync(fd);
}
