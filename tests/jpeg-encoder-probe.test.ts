import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The untyped MJS harness is exercised only through child Node processes (no static import).
const root = fileURLToPath(new URL('..', import.meta.url));
const parentScript = path.join(root, 'scripts', 'probe-jpeg-encoder.mjs');
const workerScript = path.join(root, 'scripts', 'probe-jpeg-worker.mjs');
const validatorPath = path.join(root, 'dist', 'src', 'core', 'jpeg-validation.js');
const sha = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const TIMEOUT = 60_000;

function runEval(body: string, input: unknown = null): any {
  const code = [
    `const P = await import(${JSON.stringify(pathToFileURL(parentScript).href)});`,
    `const W = await import(${JSON.stringify(pathToFileURL(workerScript).href)});`,
    `const { readFileSync } = await import('node:fs');`,
    `const { join } = await import('node:path');`,
    `const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);`,
    `const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));`,
    `const out = await (async () => {`,
    body,
    `})();`,
    `process.stdout.write(JSON.stringify(out));`,
  ].join('\n');
  const stdout = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    cwd: root, input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}
const call = (fn: string, ...args: unknown[]): any => runEval(`return P[${JSON.stringify(fn)}](...input);`, args);

function px(p: string, x: number, y: number): number[] {
  if (p === 'G') return [(17 * x + 3 * y) % 256, (5 * x + 11 * y) % 256, (13 * x + 7 * y) % 256];
  const r = ((Math.floor((x + 3) / 8) + Math.floor((y + 5) / 8)) % 2) * 255;
  return [r, 255 - r, (x + y) % 256];
}
function pixels(p: string, w: number, h: number, ch: 3 | 4): Buffer {
  const b = Buffer.alloc(w * h * ch);
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, bl] = px(p, x, y);
      b[i] = r;
      b[i + 1] = g;
      b[i + 2] = bl;
      if (ch === 4) b[i + 3] = 255;
      i += ch;
    }
  }
  return b;
}

describe('task33 probe matrix', () => {
  it('plans exactly 40 cells, 120 fresh processes and 360 encodes with q75 capped at long side 1536', () => {
    const r = runEval(`const cells = P.makeCells(); return { cells, runs: P.planRuns(cells), procs: P.planProcesses(cells), limits: P.LIMITS };`);
    expect(r.cells).toHaveLength(40);
    expect(new Set(r.cells.map((c: any) => c.cellId)).size).toBe(40);
    const q50 = r.cells.filter((c: any) => c.quality === 50);
    const q75 = r.cells.filter((c: any) => c.quality === 75);
    expect(q50).toHaveLength(24);
    expect(q75).toHaveLength(16);
    expect(q75.every((c: any) => Math.max(c.width, c.height) <= 1536)).toBe(true);
    expect(new Set(q75.map((c: any) => `${c.width}x${c.height}`))).toEqual(new Set(['1x1', '7x7', '8x8', '9x9', '15x17', '17x15', '1024x769', '1536x1025']));
    for (const dims of ['2048x1536', '1536x2048', '2528x2528', '2528x17']) {
      expect(q50.filter((c: any) => `${c.width}x${c.height}` === dims)).toHaveLength(2);
    }
    expect(r.cells.every((c: any) => c.plannedRuns === 9)).toBe(true);
    expect(r.procs).toHaveLength(120);
    expect(r.runs).toHaveLength(360);
    expect(r.runs.map((x: any) => x.runIndex)).toEqual(Array.from({ length: 360 }, (_, i) => i));
    for (const c of r.cells) {
      const cr = r.runs.filter((x: any) => x.cellId === c.cellId);
      expect(cr).toHaveLength(9);
      expect(new Set(cr.map((x: any) => `${x.processIndex}/${x.repeatIndex}`)).size).toBe(9);
    }
    expect(r.limits.plannedEncodes).toBe(360);
    expect(r.limits.q75MaxLongSide).toBe(1536);
  }, TIMEOUT);

  it('generates deterministic RGBA (alpha 255) and RGB exactly from the documented formulas', () => {
    const r = runEval(`return {
      G: W.makeRgba('G', 9, 9).toString('base64'),
      C: W.makeRgba('C', 9, 9).toString('base64'),
      rgbC: W.makeRgb('C', 15, 17).toString('base64'),
      twice: [W.sha256(W.makeRgba('G', 17, 15)), W.sha256(W.makeRgba('G', 17, 15))],
    };`);
    expect(Buffer.from(r.G, 'base64').equals(pixels('G', 9, 9, 4))).toBe(true);
    expect(Buffer.from(r.C, 'base64').equals(pixels('C', 9, 9, 4))).toBe(true);
    expect(Buffer.from(r.rgbC, 'base64').equals(pixels('C', 15, 17, 3))).toBe(true);
    const alpha = Buffer.from(r.G, 'base64').filter((_, i) => i % 4 === 3);
    expect(alpha.every((v) => v === 255)).toBe(true);
    expect(r.twice[0]).toBe(r.twice[1]);
    expect(r.twice[0]).toBe(sha(pixels('G', 17, 15, 4)));
  }, TIMEOUT);
});

describe('task33 DQT parser and marker scan', () => {
  const seg = (m: number, payload: Buffer): Buffer => Buffer.concat([Buffer.from([0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
  const soi = Buffer.from([0xff, 0xd8]);
  const jfif = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sos = seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0]));
  const eoi = Buffer.from([0x00, 0xff, 0xd9]);
  const t0 = Array.from({ length: 64 }, (_, i) => i + 1);
  const t1 = Array.from({ length: 64 }, (_, i) => 256 + i * 3);
  const dqtPayload = Buffer.from([0x00, ...t0, 0x11, ...t1.flatMap((v) => [v >> 8, v & 255])]);

  it('parses 8-bit and 16-bit tables, hashes precision/id byte plus table bytes, and never mutates input', () => {
    const good = Buffer.concat([soi, seg(0xe0, jfif), seg(0xdb, dqtPayload), sos, eoi]);
    const withApp1 = Buffer.concat([soi, seg(0xe0, jfif), seg(0xe1, Buffer.from('Exif')), seg(0xdb, dqtPayload), sos, eoi]);
    const overrun = Buffer.concat([soi, Buffer.from([0xff, 0xdb, 0x00, 0x50, 1, 2, 3, 4])]);
    const tableOverrun = Buffer.concat([soi, seg(0xdb, Buffer.from([0x10, ...t0])), sos, eoi]);
    const badPrecision = Buffer.concat([soi, seg(0xdb, Buffer.from([0x20, ...t0])), sos, eoi]);
    const badId = Buffer.concat([soi, seg(0xdb, Buffer.from([0x04, ...t0])), sos, eoi]);
    const noSoi = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const items = [good, withApp1, overrun, tableOverrun, badPrecision, badId, noSoi].map((b) => b.toString('base64'));
    const out = runEval(`return input.map((b64) => {
      const b = Buffer.from(b64, 'base64');
      const before = Buffer.from(b);
      const dqt = P.parseDqt(b);
      const markers = P.scanMarkers(b);
      return { dqt, markers, unchanged: before.equals(b) };
    });`, items);
    expect(out.every((x: any) => x.unchanged)).toBe(true);
    const [g, a1, ov, tov, bp, bid, ns] = out;
    expect(g.dqt.status).toBe('PARSED');
    expect(g.dqt.tables).toEqual([
      { id: 0, precision: 0, values: t0, sha256: sha(dqtPayload.subarray(0, 65)) },
      { id: 1, precision: 1, values: t1, sha256: sha(dqtPayload.subarray(65, 65 + 129)) },
    ]);
    expect(g.markers.markers).toEqual(['SOI', 'APP0', 'DQT', 'SOS']);
    expect(g.markers.app0Jfif).toBe(true);
    expect(g.markers.metadataMarkers).toEqual([]);
    expect(g.markers.endsWithEoi).toBe(true);
    expect(a1.markers.metadataMarkers).toEqual(['APP1']);
    expect(a1.dqt.status).toBe('PARSED');
    expect(ov.dqt).toMatchObject({ status: 'ERROR', reason: 'segment_length_out_of_bounds', tables: [] });
    expect(tov.dqt).toMatchObject({ status: 'ERROR', reason: 'table_length_out_of_bounds' });
    expect(bp.dqt).toMatchObject({ status: 'ERROR', reason: 'invalid_precision' });
    expect(bid.dqt).toMatchObject({ status: 'ERROR', reason: 'invalid_table_id' });
    expect(ns.dqt).toMatchObject({ status: 'ERROR', reason: 'missing_soi' });
    expect(ns.markers.status).toBe('ERROR');
  }, TIMEOUT);
});

describe('task33 accounting, determinism and redecode comparison', () => {
  it('does not report completion when a worker crashes after streaming every repeat', () => {
    const r = call('summarize', { cells: [], runs: [], outputs: [], processes: [{ outcome: 'CRASH' }] });
    expect(r.overall.status).toBe('INCOMPLETE');
    expect(r.overall.reasons).toContain('process_crash:1');
  });
  it('keeps completed slots on timeout/crash, marks null memory NOT_MEASURED and flags input/hash divergence', () => {
    const r = runEval(`
      const slots = [0, 1, 2].map((i) => ({ runIndex: i, cellId: 'c', processIndex: 0, repeatIndex: i }));
      const cell = { inputSha256: 'a'.repeat(64) };
      const rec = (i, extra = {}) => ({ repeatIndex: i, status: 'ENCODED', reason: null, inputSha256: 'a'.repeat(64), outputSha256: 'b'.repeat(64), byteLength: 10, encodeMs: 1, maxRssKiB: 100, rssBeforeBytes: 1, rssAfterBytes: 2, ...extra });
      const tryCall = (fn) => { try { fn(); return 'no-throw'; } catch (e) { return e.message; } };
      const run = (p, rep, s) => ({ cellId: 'c', processIndex: p, repeatIndex: rep, status: 'ENCODED', outputSha256: s });
      const nine = (mut) => { const rs = []; for (let p = 0; p < 3; p++) for (let rep = 0; rep < 3; rep++) rs.push(run(p, rep, 'b'.repeat(64))); mut(rs); return rs; };
      return {
        timeout: P.accountProcess(slots, cell, { outcome: 'TIMEOUT', reason: 'watchdog_timeout', progress: [rec(0)] }),
        crash: P.accountProcess(slots, cell, { outcome: 'CRASH', reason: null, progress: [] }),
        okMissing: P.accountProcess(slots, cell, { outcome: 'OK', reason: null, progress: [rec(0)] }),
        nullMem: P.accountProcess(slots, cell, { outcome: 'OK', progress: [rec(0, { maxRssKiB: null }), rec(1, { maxRssKiB: 0 }), rec(2)] }),
        mismatch: P.accountProcess(slots, cell, { outcome: 'OK', progress: [rec(0), rec(1, { inputSha256: 'c'.repeat(64) }), rec(2)] }),
        encodeError: P.accountProcess(slots, cell, { outcome: 'OK', progress: [rec(0), { repeatIndex: 1, status: 'ENCODE_ERROR', reason: 'Error boom', encodeMs: 0, rssBeforeBytes: 11, rssAfterBytes: 22, maxRssKiB: 33 }, rec(2)] }),
        dup: tryCall(() => P.accountProcess(slots, cell, { outcome: 'OK', progress: [rec(0), rec(0)] })),
        gap: tryCall(() => P.accountProcess(slots, cell, { outcome: 'OK', progress: [rec(1)] })),
        identical: P.determinism(nine(() => {})),
        withinDiverge: P.determinism(nine((rs) => { rs[5].outputSha256 = 'd'.repeat(64); })),
        coldDiverge: P.determinism(nine((rs) => { rs[6].outputSha256 = 'd'.repeat(64); rs[7].outputSha256 = 'd'.repeat(64); rs[8].outputSha256 = 'd'.repeat(64); })),
        partial: P.determinism(nine((rs) => { rs[8].status = 'TIMEOUT'; rs[8].outputSha256 = null; })),
      };
    `);
    expect(r.timeout.map((x: any) => x.status)).toEqual(['ENCODED', 'TIMEOUT', 'NOT_RUN']);
    expect(r.timeout[0]).toMatchObject({ outputSha256: 'b'.repeat(64), byteLength: 10, memoryStatus: 'MEASURED', maxRssKiB: 100, inputMatches: true });
    expect(r.timeout[1]).toMatchObject({ reason: 'watchdog_timeout', outputSha256: null, memoryStatus: 'NOT_MEASURED' });
    expect(r.crash.map((x: any) => x.status)).toEqual(['CRASH', 'NOT_RUN', 'NOT_RUN']);
    expect(r.okMissing.map((x: any) => x.status)).toEqual(['ENCODED', 'CRASH', 'NOT_RUN']);
    expect(r.okMissing[1].reason).toBe('missing_record');
    expect(r.nullMem.map((x: any) => x.memoryStatus)).toEqual(['NOT_MEASURED', 'NOT_MEASURED', 'MEASURED']);
    expect(r.nullMem[0]).toMatchObject({ maxRssKiB: null, memoryReason: 'max_rss_unavailable', status: 'ENCODED' });
    expect(r.mismatch.map((x: any) => x.inputMatches)).toEqual([true, false, true]);
    expect(r.encodeError[1]).toMatchObject({ status: 'ENCODE_ERROR', reason: 'Error boom', outputSha256: null, encodeMs: 0, rssBeforeBytes: 11, rssAfterBytes: 22, maxRssKiB: 33, memoryStatus: 'MEASURED' });
    expect(r.dup).toContain('protocol_violation');
    expect(r.gap).toContain('protocol_violation');
    expect(r.identical).toMatchObject({ withinProcess: ['IDENTICAL', 'IDENTICAL', 'IDENTICAL'], acrossFreshProcesses: 'IDENTICAL', allRuns: 'IDENTICAL', distinctOutputShas: 1 });
    expect(r.withinDiverge).toMatchObject({ withinProcess: ['IDENTICAL', 'DIVERGENT', 'IDENTICAL'], acrossFreshProcesses: 'IDENTICAL', allRuns: 'DIVERGENT', distinctOutputShas: 2 });
    expect(r.coldDiverge).toMatchObject({ withinProcess: ['IDENTICAL', 'IDENTICAL', 'IDENTICAL'], acrossFreshProcesses: 'DIVERGENT', allRuns: 'DIVERGENT' });
    expect(r.partial).toMatchObject({ withinProcess: ['IDENTICAL', 'IDENTICAL', 'INCOMPLETE'], allRuns: 'INCOMPLETE' });
  }, TIMEOUT);

  it('detects decoded dimension mismatches and reports reference-only pixel error', () => {
    const ref = Array.from(pixels('G', 9, 9, 3));
    const shifted = ref.map((v) => (v === 255 ? 254 : v + 1));
    const r = runEval(`return {
      mixed: W.compareDecoded({ width: 9, height: 9, data: input.ref }, [{ cellId: 'a', width: 9, height: 9, pattern: 'G' }, { cellId: 'b', width: 9, height: 8, pattern: 'G' }]),
      shifted: W.compareDecoded({ width: 9, height: 9, data: input.shifted }, [{ cellId: 'a', width: 9, height: 9, pattern: 'G' }]),
      shortData: W.compareDecoded({ width: 9, height: 9, data: input.ref.slice(3) }, [{ cellId: 'a', width: 9, height: 9, pattern: 'G' }]),
    };`, { ref, shifted });
    expect(r.mixed.status).toBe('DIMENSION_MISMATCH');
    expect(r.mixed.comparisons[0]).toEqual({ cellId: 'a', dimensionsMatch: true, mae: [0, 0, 0], maxAbs: [0, 0, 0] });
    expect(r.mixed.comparisons[1]).toMatchObject({ cellId: 'b', dimensionsMatch: false, mae: null });
    expect(r.shifted.status).toBe('PASS');
    expect(r.shifted.comparisons[0].mae).toEqual([1, 1, 1]);
    expect(r.shifted.comparisons[0].maxAbs).toEqual([1, 1, 1]);
    expect(r.shortData.status).toBe('DIMENSION_MISMATCH');
  }, TIMEOUT);
});

describe('task33 evidence validation', () => {
  function buildParts(base: any): any {
    const cells = base.cells.map((c: any) => ({ ...c, inputSha256: sha(`input:${c.cellId}`), inputRgbSha256: sha(`rgb:${c.cellId}`), inputBytes: c.width * c.height * 4 }));
    const byId = new Map<string, any>(cells.map((c: any) => [c.cellId, c]));
    const runs = base.runs.map((r: any) => ({
      ...r, status: 'ENCODED', reason: null, inputSha256: byId.get(r.cellId).inputSha256, inputRgbSha256: byId.get(r.cellId).inputRgbSha256, inputMatches: true, outputSha256: sha(`out:${r.cellId}`),
      byteLength: 1000, encodeMs: 1.5, rssBeforeBytes: 1, rssAfterBytes: 2, maxRssKiB: 4096, memoryStatus: 'MEASURED', memoryReason: null,
    }));
    const processes = base.procs.map((p: any) => ({ ...p, outcome: 'OK', exitCode: 0, signal: null, reason: null, elapsedMs: 10 }));
    const mem = { maxRssKiB: 1, memoryStatus: 'MEASURED', memoryReason: null, rssBeforeBytes: 1, rssAfterBytes: 1 };
    const outputs = cells.map((c: any) => {
      const s = sha(`out:${c.cellId}`);
      return {
        sha256: s, byteLength: 1000, within10MiB: true, artifact: `${s}.jpg`, cellIds: [c.cellId], referenceCellId: c.cellId,
        runIndices: runs.filter((r: any) => r.cellId === c.cellId).map((r: any) => r.runIndex),
        markers: { status: 'PARSED', reason: null, markers: ['SOI', 'APP0', 'DQT', 'SOF0', 'DHT', 'SOS'], app0Jfif: true, metadataMarkers: [], endsWithEoi: true },
        dqt: { status: 'PARSED', reason: null, tables: [{ id: 0, precision: 0, values: Array(64).fill(1), sha256: sha('table') }] },
        validation: { status: 'PASS', code: null, reason: null, width: c.width, height: c.height, validationProfile: 'jpeg-ycbcr8-baseline-444-v1', dimensionsMatch: true, ms: 1, ...mem },
        redecode: {
          status: 'PASS', reason: null, width: c.width, height: c.height, rgbLength: c.width * c.height * 3, decodedRgbSha256: sha('decoded'), decodedRepresentation: 'RGB8', ms: 1,
          comparisons: [{ cellId: c.cellId, dimensionsMatch: true, mae: [0, 0, 0], maxAbs: [0, 0, 0] }], ...mem,
        },
      };
    });
    return { runId: 'synthetic-test-fixture', createdAt: '2026-10-14T00:00:00.000Z', environment: { synthetic: true }, cells, processes, runs, outputs };
  }
  const reject = (o: any): void => {
    o.validation = { ...o.validation, status: 'REJECT', code: 'unsupported_jpeg_profile', width: null, height: null, validationProfile: null, dimensionsMatch: null };
  };
  const notRun = (o: any): void => {
    o.redecode = { ...o.redecode, status: 'NOT_RUN', reason: 'validator_reject', width: null, height: null, rgbLength: null, decodedRgbSha256: null, comparisons: null };
  };
  const hasError = (res: any, text: string): boolean => res.errors.some((e: string) => e.includes(text));

  it('accepts complete evidence and rejects missing, duplicate, inconsistent, tampered or dishonest records', () => {
    const base = runEval(`const cells = P.makeCells(); return { cells, runs: P.planRuns(cells), procs: P.planProcesses(cells) };`);
    const parts = buildParts(base);
    const assembled = call('assembleEvidence', parts);
    const items: Array<{ ev: any; assemble?: boolean; strict?: boolean }> = [];
    items.push({ ev: assembled });
    const missing = structuredClone(assembled);
    missing.runs.pop();
    items.push({ ev: missing });
    const duplicate = structuredClone(assembled);
    duplicate.outputs.push(structuredClone(duplicate.outputs[0]));
    items.push({ ev: duplicate });
    const inconsistent = structuredClone(assembled);
    inconsistent.runs[1].byteLength = 999;
    items.push({ ev: inconsistent });
    const stale = structuredClone(assembled);
    reject(stale.outputs[0]);
    notRun(stale.outputs[0]);
    items.push({ ev: stale });
    const truthful = structuredClone(parts);
    reject(truthful.outputs[0]);
    notRun(truthful.outputs[0]);
    items.push({ ev: truthful, assemble: true });
    const redecodeAfterReject = structuredClone(parts);
    reject(redecodeAfterReject.outputs[0]);
    items.push({ ev: redecodeAfterReject, assemble: true });
    const lyingInput = structuredClone(parts);
    lyingInput.runs[0].inputSha256 = 'f'.repeat(64);
    items.push({ ev: lyingInput, assemble: true });
    const incomplete = structuredClone(parts);
    for (const i of [0, 1, 2]) {
      Object.assign(incomplete.runs[i], { status: i === 0 ? 'TIMEOUT' : 'NOT_RUN', reason: 'x', inputSha256: null, inputMatches: null, outputSha256: null, byteLength: null, encodeMs: null, rssBeforeBytes: null, rssAfterBytes: null, maxRssKiB: null, memoryStatus: 'NOT_MEASURED', memoryReason: 'no_observation' });
    }
    incomplete.processes[0].outcome = 'TIMEOUT';
    incomplete.outputs[0].runIndices = incomplete.outputs[0].runIndices.filter((n: number) => n > 2);
    items.push({ ev: incomplete, assemble: true });
    items.push({ ev: assembled, strict: true });

    const out = runEval(`return input.map((x) => {
      const ev = x.assemble ? P.assembleEvidence(x.ev) : x.ev;
      return { res: P.validateEvidence(ev, { allowSynthetic: !x.strict }), summary: ev.summary };
    });`, items);
    const [valid, miss, dup, inc, stl, tru, rar, lie, part, strict] = out;

    expect(valid.res).toEqual({ ok: true, errors: [] });
    expect(valid.summary.overall).toEqual({ status: 'ALL_PASS', reasons: [] });
    expect(valid.summary).toMatchObject({ plannedCells: 40, plannedProcesses: 120, plannedEncodes: 360, uniqueOutputs: 40 });
    expect(valid.summary.encode.ENCODED).toBe(360);
    expect(valid.summary.determinism.allRuns.IDENTICAL).toBe(40);

    expect(miss.res.ok).toBe(false);
    expect(hasError(miss.res, 'runs.length')).toBe(true);
    expect(hasError(dup.res, 'duplicate output')).toBe(true);
    expect(hasError(inc.res, 'byteLength inconsistent')).toBe(true);
    expect(hasError(stl.res, 'summary mismatch')).toBe(true);

    expect(tru.res).toEqual({ ok: true, errors: [] });
    expect(tru.summary.overall.status).toBe('COMPLETE_WITH_FINDINGS');
    expect(tru.summary.overall.reasons).toContain('validator_reject:1');
    expect(tru.summary.validation.REJECT).toBe(1);
    expect(tru.summary.redecode.NOT_RUN).toBe(1);

    expect(hasError(rar.res, 'redecode ran without validator PASS')).toBe(true);
    expect(hasError(lie.res, 'runs[0].inputMatches')).toBe(true);

    expect(part.res).toEqual({ ok: true, errors: [] });
    expect(part.summary.overall.status).toBe('INCOMPLETE');
    expect(part.summary.overall.reasons).toEqual(expect.arrayContaining(['encode_timeout:1', 'encode_not_run:2', 'memory_not_measured:3']));
    expect(part.summary.perCell[0].allRuns).toBe('INCOMPLETE');

    expect(hasError(strict.res, 'synthetic_evidence')).toBe(true);
  }, TIMEOUT);

  it('rejects forged redecode dimensions, RGB length, comparison flags, and DQT', () => {
    const base = runEval(`const cells = P.makeCells(); return { cells, runs: P.planRuns(cells), procs: P.planProcesses(cells) };`);
    const assembled = call('assembleEvidence', buildParts(base));
    const results = ['dimensions', 'rgbLength', 'comparison'].map((kind) => {
      const ev = structuredClone(assembled);
      if (kind === 'dimensions') ev.outputs[0].redecode.width += 1;
      if (kind === 'rgbLength') ev.outputs[0].redecode.rgbLength += 1;
      if (kind === 'comparison') ev.outputs[0].redecode.comparisons[0].dimensionsMatch = false;
      ev.summary = call('summarize', ev);
      return call('validateEvidence', ev, { allowSynthetic: true });
    });
    expect(results.every((x: any) => x.ok === false)).toBe(true);
    const truthfulMismatch = structuredClone(assembled);
    truthfulMismatch.outputs[0].redecode = { ...truthfulMismatch.outputs[0].redecode, status: 'DIMENSION_MISMATCH', width: truthfulMismatch.outputs[0].redecode.width + 1 };
    truthfulMismatch.outputs[0].redecode.comparisons[0].dimensionsMatch = false;
    truthfulMismatch.summary = call('summarize', truthfulMismatch);
    expect(call('validateEvidence', truthfulMismatch, { allowSynthetic: true }).ok).toBe(true);
  }, TIMEOUT);

  it('compares recorded DQT against the artifact while preserving its file SHA', () => {
    const artifactDir = mkdtempSync(path.join(os.tmpdir(), 'task33-dqt-'));
    try {
      const observed = runEval(`const w = await P.runWorker({ mode: 'encode', width: 1, height: 1, pattern: 'G', quality: 50, repeats: 1, artifactDir: input.dir }); const rec = w.progress[0]; const bytes = readFileSync(join(input.dir, rec.outputSha256 + '.jpg')); return { sha256: rec.outputSha256, byteLength: bytes.length, dqt: P.parseDqt(bytes), markers: P.scanMarkers(bytes) };`, { dir: artifactDir });
      const base = runEval(`const cells = P.makeCells(); return { cells, runs: P.planRuns(cells), procs: P.planProcesses(cells) };`);
      const parts = buildParts(base);
      for (const r of parts.runs.filter((x: any) => x.cellId === parts.cells[0].cellId)) Object.assign(r, { outputSha256: observed.sha256, byteLength: observed.byteLength });
      Object.assign(parts.outputs[0], { sha256: observed.sha256, byteLength: observed.byteLength, artifact: `${observed.sha256}.jpg`, dqt: observed.dqt, markers: observed.markers });
      const valid = call('assembleEvidence', parts);
      const tampered = structuredClone(valid);
      tampered.outputs[0].dqt.tables[0].values[0] += 1;
      tampered.outputs[0].dqt.tables[0].sha256 = sha(Buffer.from([0, ...tampered.outputs[0].dqt.tables[0].values]));
      tampered.summary = call('summarize', tampered);
      expect(call('validateEvidence', valid, { allowSynthetic: true })).toEqual({ ok: true, errors: [] });
      const result = call('validateEvidence', tampered, { allowSynthetic: true, artifactDir });
      expect(result.ok).toBe(false);
      expect(result.errors.some((e: string) => e.includes('dqt'))).toBe(true);
      writeFileSync(path.join(artifactDir, `${observed.sha256}.jpg`), Buffer.from('corrupted'));
      const shaResult = call('validateEvidence', valid, { allowSynthetic: true, artifactDir });
      expect(shaResult.errors.some((e: string) => e.includes('outputs[0] artifact missing or hash mismatch'))).toBe(true);
    } finally {
      rmSync(artifactDir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('CLI rejects bad arguments and synthetic evidence with non-zero exit and JSON-only stdout', () => {
    const bad = spawnSync(process.execPath, [parentScript, '--bogus'], { cwd: root, encoding: 'utf8', windowsHide: true });
    expect(bad.status).toBe(2);
    expect(bad.stdout).toBe('');
    const base = runEval(`const cells = P.makeCells(); return { cells, runs: P.planRuns(cells), procs: P.planProcesses(cells) };`);
    const ev = call('assembleEvidence', buildParts(base));
    const dir = mkdtempSync(path.join(os.tmpdir(), 'task33-evidence-test-'));
    try {
      const file = path.join(dir, 'evidence.json');
      writeFileSync(file, JSON.stringify(ev));
      const res = spawnSync(process.execPath, [parentScript, '--validate-evidence', file], { cwd: root, encoding: 'utf8', windowsHide: true });
      expect(res.status).toBe(1);
      const parsed = JSON.parse(res.stdout.trim());
      expect(parsed.ok).toBe(false);
      expect(parsed.errors).toContain('synthetic_evidence');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);
});

describe('task33 real worker integration (small inputs only)', () => {
  it('encodes 1x1 and 9x9 in fresh workers, preserves raw bytes, validates/redecodes, and enforces the watchdog', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'task33-probe-test-'));
    const hasValidator = existsSync(validatorPath);
    try {
      const out = runEval(`
        const results = [];
        for (const [w, h] of [[1, 1], [9, 9]]) {
          const enc = await P.runWorker({ mode: 'encode', width: w, height: h, pattern: 'C', quality: 50, repeats: 3, artifactDir: input.dir });
          const outSha = enc.progress[0] && enc.progress[0].outputSha256;
          const file = outSha ? join(input.dir, outSha + '.jpg') : null;
          const bytes = file ? readFileSync(file) : null;
          const res = { w, h, outcome: enc.outcome, reason: enc.reason, progress: enc.progress, fileSha: bytes ? W.sha256(bytes) : null, fileLength: bytes ? bytes.length : null, dqt: bytes ? P.parseDqt(bytes) : null, markers: bytes ? P.scanMarkers(bytes) : null, validation: null, redecode: null };
          if (input.validator && file) {
            const v = await P.runWorker({ mode: 'validate', file, expectedSha256: outSha, validatorPath: input.validator });
            res.validation = { outcome: v.outcome, result: v.result };
            if (v.result && v.result.status === 'PASS') {
              const d = await P.runWorker({ mode: 'redecode', file, expectedSha256: outSha, comparisons: [{ cellId: 'test', width: w, height: h, pattern: 'C' }] });
              res.redecode = { outcome: d.outcome, result: d.result };
            }
          }
          results.push(res);
        }
        const t = await P.runWorker({ mode: 'encode', width: 1, height: 1, pattern: 'G', quality: 50, repeats: 3, artifactDir: input.dir }, { timeoutMs: 1 });
        return { results, timeout: { outcome: t.outcome, progress: t.progress.length, reason: t.reason } };
      `, { dir, validator: hasValidator ? validatorPath : null });
      for (const r of out.results) {
        expect(r.outcome).toBe('OK');
        expect(r.progress.map((p: any) => p.status)).toEqual(['ENCODED', 'ENCODED', 'ENCODED']);
        const expectedInput = sha(pixels('C', r.w, r.h, 4));
        expect(r.progress.every((p: any) => p.inputSha256 === expectedInput)).toBe(true);
        const expectedRgb = sha(pixels('C', r.w, r.h, 3));
        expect(r.progress.every((p: any) => p.inputRgbSha256 === expectedRgb)).toBe(true);
        expect(r.progress.every((p: any) => p.maxRssKiB === null || (Number.isInteger(p.maxRssKiB) && p.maxRssKiB > 0))).toBe(true);
        expect(r.fileSha).toBe(r.progress[0].outputSha256);
        expect(r.fileLength).toBe(r.progress[0].byteLength);
        expect(r.dqt.status).toBe('PARSED');
        expect(r.dqt.tables.length).toBeGreaterThan(0);
        expect(r.dqt.tables.every((t: any) => t.precision === 0 && t.values.length === 64)).toBe(true);
        expect(r.markers.markers[0]).toBe('SOI');
        if (hasValidator) {
          expect(r.validation.outcome).toBe('OK');
          expect(['PASS', 'REJECT']).toContain(r.validation.result.status);
          if (r.validation.result.status === 'PASS') {
            expect(r.validation.result).toMatchObject({ width: r.w, height: r.h });
            expect(r.redecode.outcome).toBe('OK');
            expect(r.redecode.result.status).toBe('PASS');
            expect(r.redecode.result.comparisons[0].dimensionsMatch).toBe(true);
            expect(r.redecode.result.comparisons[0].mae).toHaveLength(3);
            expect(r.redecode.result.rgbLength).toBe(r.w * r.h * 3);
          } else {
            expect(typeof r.validation.result.code).toBe('string');
            expect(r.redecode).toBeNull();
          }
        }
      }
      expect(out.timeout).toMatchObject({ outcome: 'TIMEOUT', progress: 0, reason: 'watchdog_timeout' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);
});
