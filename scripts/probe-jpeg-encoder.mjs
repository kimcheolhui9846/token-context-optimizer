// @ts-check
// Task 33 raw jpeg-js encoder probe (parent CLI). Research-only harness; product code is untouched.
// Usage: node scripts/probe-jpeg-encoder.mjs [--output <file>]
//        node scripts/probe-jpeg-encoder.mjs --validate-evidence <file>
// Importing this module never starts the probe. Workers run strictly one at a time.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { DECODE_OPTIONS, PATTERNS, PATTERN_LAYOUT, isDirectRun, makeRgb, makeRgba, sanitizeError, sha256 } from './probe-jpeg-worker.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const WORKER_PATH = path.join(SCRIPT_DIR, 'probe-jpeg-worker.mjs');
export const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'docs', 'research', 'evidence', 'task-33', 'jpeg-encoder-results.json');
const VALIDATOR_REL = ['dist', 'src', 'core', 'jpeg-validation.js'];
const ARTIFACT_REL = ['.artifacts', 'task-33-probe'];
export const SCHEMA_VERSION = 1;
export const WATCHDOG_MS = 120_000;
const KILL_CONFIRM_MS = 15_000;
export const ENCODED_LIMIT_BYTES = 10 * 1024 * 1024;
const RUN_ID_RE = /^[A-Za-z0-9-]{8,80}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
export const ENCODE_STATUSES = ['ENCODED', 'ENCODE_ERROR', 'TIMEOUT', 'CRASH', 'NOT_RUN'];
export const VALIDATION_STATUSES = ['PASS', 'REJECT', 'ERROR', 'TIMEOUT', 'NOT_RUN'];
export const REDECODE_STATUSES = ['PASS', 'DECODE_ERROR', 'DIMENSION_MISMATCH', 'ERROR', 'TIMEOUT', 'NOT_RUN'];
export const MEMORY_STATUSES = ['MEASURED', 'NOT_MEASURED'];
export const PROCESS_OUTCOMES = ['OK', 'TIMEOUT', 'CRASH'];
const PARSE_STATUSES = ['PARSED', 'ERROR'];
const DETERMINISM = ['IDENTICAL', 'DIVERGENT', 'INCOMPLETE'];
export const DIMENSIONS = [[1, 1], [7, 7], [8, 8], [9, 9], [15, 17], [17, 15], [1024, 769], [1536, 1025], [2048, 1536], [1536, 2048], [2528, 2528], [2528, 17]];
const QUALITIES = [50, 75];
const PATTERN_IDS = ['G', 'C'];
const Q75_MAX_LONG_SIDE = 1536;
const PROCESSES_PER_CELL = 3;
const ENCODES_PER_PROCESS = 3;

export const LIMITS = {
  qualities: QUALITIES,
  patterns: PATTERN_IDS,
  dimensions: DIMENSIONS.map(([width, height]) => ({ width, height })),
  q75MaxLongSide: Q75_MAX_LONG_SIDE,
  processesPerCell: PROCESSES_PER_CELL,
  encodesPerProcess: ENCODES_PER_PROCESS,
  plannedCells: 40,
  plannedProcesses: 120,
  plannedEncodes: 360,
  watchdogMsPerWorker: WATCHDOG_MS,
  encodedDiagnosticLimitBytes: ENCODED_LIMIT_BYTES,
  decodeOptions: { ...DECODE_OPTIONS },
  timing: 'performance.now() around the single encode/validate/decode call; excludes input generation, hashing and file writes',
  memory: 'process.resourceUsage().maxRSS KiB is the worker lifetime high-water incl. startup/import/input/output/GC; not encoder-only',
};

export const NOT_PROBED = [
  { item: 'q50 JPEG -> decode -> q75 re-encode chain', status: 'NOT_PROBED', reason: 'only raw synthetic RGB -> q50 or q75 is measured' },
  { item: 'cross-runtime (other Node/V8 versions) determinism', status: 'NOT_PROBED', reason: 'single runtime recorded in environment' },
  { item: 'sharp independent decode and DQT/bytes comparison', status: 'NOT_RUN', reason: 'out of scope (Claude research/)' },
  { item: 'independent codec or full JPEG conformance', status: 'NOT_PROBED', reason: 'encoder, validator and redecode all use jpeg-js' },
];

/** @param {any} value @returns {boolean} */
const isSha = (value) => typeof value === 'string' && SHA_RE.test(value);
/** @param {any} value @returns {number | null} */
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** @param {any[]} values @param {string[]} statuses @returns {Record<string, number>} */
function tally(values, statuses) {
  return Object.fromEntries(statuses.map((s) => [s, values.filter((v) => v === s).length]));
}

/** @returns {{layout: string, definitions: any}} */
export function patternsBlock() {
  return { layout: PATTERN_LAYOUT, definitions: PATTERNS };
}

/** @returns {Array<{cellId: string, width: number, height: number, pattern: string, quality: number, plannedRuns: number}>} */
export function makeCells() {
  const cells = [];
  for (const quality of QUALITIES) {
    for (const [width, height] of DIMENSIONS) {
      if (quality === 75 && Math.max(width, height) > Q75_MAX_LONG_SIDE) continue;
      for (const pattern of PATTERN_IDS) {
        cells.push({ cellId: `q${quality}-${pattern}-${width}x${height}`, width, height, pattern, quality, plannedRuns: PROCESSES_PER_CELL * ENCODES_PER_PROCESS });
      }
    }
  }
  return cells;
}

/** @param {Array<{cellId: string}>} cells @returns {Array<{processOrdinal: number, processId: string, cellId: string, processIndex: number}>} */
export function planProcesses(cells) {
  const out = [];
  for (const cell of cells) {
    for (let processIndex = 0; processIndex < PROCESSES_PER_CELL; processIndex++) {
      out.push({ processOrdinal: out.length, processId: `${cell.cellId}#p${processIndex}`, cellId: cell.cellId, processIndex });
    }
  }
  return out;
}

/** @param {Array<{cellId: string}>} cells @returns {Array<{runIndex: number, cellId: string, processIndex: number, repeatIndex: number}>} */
export function planRuns(cells) {
  const out = [];
  for (const cell of cells) {
    for (let processIndex = 0; processIndex < PROCESSES_PER_CELL; processIndex++) {
      for (let repeatIndex = 0; repeatIndex < ENCODES_PER_PROCESS; repeatIndex++) out.push({ runIndex: out.length, cellId: cell.cellId, processIndex, repeatIndex });
    }
  }
  return out;
}

/** @param {number} m @returns {string} */
function markerName(m) {
  /** @type {Record<number, string>} */
  const names = { 0xd8: 'SOI', 0xd9: 'EOI', 0xda: 'SOS', 0xdb: 'DQT', 0xc4: 'DHT', 0xdd: 'DRI', 0xfe: 'COM', 0xc0: 'SOF0', 0xc8: 'JPG', 0xcc: 'DAC' };
  if (names[m]) return names[m];
  if (m >= 0xe0 && m <= 0xef) return `APP${m - 0xe0}`;
  if (m >= 0xc1 && m <= 0xcf) return `SOF${m - 0xc0}`;
  if (m >= 0xd0 && m <= 0xd7) return `RST${m - 0xd0}`;
  return `0x${m.toString(16).padStart(2, '0')}`;
}

/**
 * Bounded read-only walk of header segments up to and including SOS. Never modifies bytes.
 * @param {Uint8Array} bytes
 * @returns {{reason: string | null, segments: Array<{marker: number, start: number, end: number}>}}
 */
function walkSegments(bytes) {
  /** @type {Array<{marker: number, start: number, end: number}>} */
  const segments = [];
  /** @param {string} reason */
  const stop = (reason) => ({ reason, segments });
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return stop('missing_soi');
  segments.push({ marker: 0xd8, start: 2, end: 2 });
  let p = 2;
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) return stop('expected_marker');
    while (p < bytes.length && bytes[p] === 0xff) p++;
    if (p >= bytes.length) return stop('truncated_marker');
    const marker = bytes[p++];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ marker, start: p, end: p });
      continue;
    }
    if (marker === 0xd9) {
      segments.push({ marker, start: p, end: p });
      return stop('eoi_before_sos');
    }
    if (p + 2 > bytes.length) return stop('truncated_length');
    const length = (bytes[p] << 8) | bytes[p + 1];
    if (length < 2 || p + length > bytes.length) return stop('segment_length_out_of_bounds');
    segments.push({ marker, start: p + 2, end: p + length });
    p += length;
    if (marker === 0xda) return { reason: null, segments };
  }
  return stop('no_sos');
}

/**
 * Raw DQT observation: id, precision (0=8-bit, 1=16-bit), 64 values in file (zigzag) order and
 * SHA-256 of the precision/id byte plus that table's value bytes. Not a validator.
 * @param {Uint8Array} bytes
 */
export function parseDqt(bytes) {
  /** @param {string} reason */
  const err = (reason) => ({ status: 'ERROR', reason, tables: [] });
  const walk = walkSegments(bytes);
  if (walk.reason) return err(walk.reason);
  const tables = [];
  for (const s of walk.segments) {
    if (s.marker !== 0xdb) continue;
    if (s.end === s.start) return err('empty_dqt');
    let q = s.start;
    while (q < s.end) {
      const spec = bytes[q];
      const precision = spec >> 4;
      const id = spec & 15;
      if (precision > 1) return err('invalid_precision');
      if (id > 3) return err('invalid_table_id');
      const size = precision ? 128 : 64;
      if (q + 1 + size > s.end) return err('table_length_out_of_bounds');
      const values = [];
      for (let i = 0; i < 64; i++) values.push(precision ? (bytes[q + 1 + 2 * i] << 8) | bytes[q + 2 + 2 * i] : bytes[q + 1 + i]);
      tables.push({ id, precision, values, sha256: sha256(bytes.subarray(q, q + 1 + size)) });
      q += 1 + size;
    }
  }
  if (tables.length === 0) return err('no_dqt_before_sos');
  return { status: 'PARSED', reason: null, tables };
}

/** Marker report only; the real validator is the authority for PASS. @param {Uint8Array} bytes */
export function scanMarkers(bytes) {
  const walk = walkSegments(bytes);
  const markers = walk.segments.map((s) => markerName(s.marker));
  const app0 = walk.segments.find((s) => s.marker === 0xe0);
  const app0Jfif = app0 !== undefined && app0.end - app0.start >= 5 && Buffer.from(bytes.subarray(app0.start, app0.start + 5)).toString('latin1') === 'JFIF\u0000';
  return {
    status: walk.reason ? 'ERROR' : 'PARSED',
    reason: walk.reason,
    markers,
    app0Jfif,
    metadataMarkers: markers.filter((n) => /^APP([1-9]|1[0-5])$/.test(n) || n === 'COM'),
    endsWithEoi: bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9,
  };
}

/** @param {any} maxRssKiB @param {string} reason */
export function normalizeMemory(maxRssKiB, reason) {
  const ok = Number.isInteger(maxRssKiB) && maxRssKiB > 0;
  return { maxRssKiB: ok ? maxRssKiB : null, memoryStatus: ok ? 'MEASURED' : 'NOT_MEASURED', memoryReason: ok ? null : reason };
}

/** @param {any} slot @param {string} status @param {string} reason */
function emptyRun(slot, status, reason) {
  return { ...slot, status, reason, inputSha256: null, inputRgbSha256: null, inputMatches: null, outputSha256: null, byteLength: null, encodeMs: null, rssBeforeBytes: null, rssAfterBytes: null, maxRssKiB: null, memoryStatus: 'NOT_MEASURED', memoryReason: 'no_observation' };
}

/**
 * Converts one encode worker's streamed records + termination into the 3 planned run records.
 * Completed records survive TIMEOUT/CRASH; the interrupted slot gets the outcome, later slots NOT_RUN.
 * @param {Array<{runIndex: number, cellId: string, processIndex: number, repeatIndex: number}>} planned
 * @param {{inputSha256: string, inputRgbSha256?: string}} cell
 * @param {{outcome: string, reason?: string | null, progress?: any[]}} worker
 */
export function accountProcess(planned, cell, worker) {
  /** @type {Map<number, any>} */
  const byRepeat = new Map();
  for (const rec of worker.progress ?? []) {
    const r = rec?.repeatIndex;
    if (!Number.isInteger(r) || r < 0 || r >= planned.length || byRepeat.has(r)) throw new Error('protocol_violation repeatIndex');
    if (r !== byRepeat.size) throw new Error('protocol_violation order');
    if (rec.status === 'ENCODED') {
      if (!isSha(rec.inputSha256) || !isSha(rec.outputSha256) || !Number.isInteger(rec.byteLength) || rec.byteLength <= 0 || typeof rec.encodeMs !== 'number' || !(rec.encodeMs >= 0)) throw new Error('protocol_violation record');
    } else if (rec.status !== 'ENCODE_ERROR') throw new Error('protocol_violation status');
    byRepeat.set(r, rec);
  }
  let stopped = false;
  return planned.map((slot) => {
    const rec = byRepeat.get(slot.repeatIndex);
    if (rec) {
      if (rec.status !== 'ENCODED') return emptyRun(slot, 'ENCODE_ERROR', typeof rec.reason === 'string' ? rec.reason : 'encode_error');
      return {
        ...slot, status: 'ENCODED', reason: null, inputSha256: rec.inputSha256, inputRgbSha256: rec.inputRgbSha256,
        inputMatches: rec.inputSha256 === cell.inputSha256 && rec.inputRgbSha256 === cell.inputRgbSha256,
        outputSha256: rec.outputSha256, byteLength: rec.byteLength, encodeMs: rec.encodeMs, rssBeforeBytes: num(rec.rssBeforeBytes), rssAfterBytes: num(rec.rssAfterBytes),
        ...normalizeMemory(rec.maxRssKiB, 'max_rss_unavailable'),
      };
    }
    if (stopped) return emptyRun(slot, 'NOT_RUN', 'process_ended_before_repeat');
    stopped = true;
    if (worker.outcome === 'TIMEOUT') return emptyRun(slot, 'TIMEOUT', worker.reason ?? 'watchdog_timeout');
    return emptyRun(slot, 'CRASH', worker.reason ?? (worker.outcome === 'OK' ? 'missing_record' : 'worker_crash'));
  });
}

/** Within-process (3 repeats), across fresh processes (cold repeats) and all-9 SHA comparison. @param {any[]} cellRuns */
export function determinism(cellRuns) {
  /** @param {any[]} rs */
  const classify = (rs) => {
    const shas = new Set(rs.filter((r) => r.status === 'ENCODED').map((r) => r.outputSha256));
    if (shas.size > 1) return 'DIVERGENT';
    return rs.length === 0 || rs.some((r) => r.status !== 'ENCODED') ? 'INCOMPLETE' : 'IDENTICAL';
  };
  const withinProcess = [];
  for (let p = 0; p < PROCESSES_PER_CELL; p++) withinProcess.push(classify(cellRuns.filter((r) => r.processIndex === p)));
  return {
    withinProcess,
    acrossFreshProcesses: classify(cellRuns.filter((r) => r.repeatIndex === 0)),
    allRuns: classify(cellRuns),
    distinctOutputShas: new Set(cellRuns.filter((r) => r.status === 'ENCODED').map((r) => r.outputSha256)).size,
  };
}

/** Derived summary; validateEvidence recomputes and compares it. @param {any} ev */
export function summarize(ev) {
  const cells = ev.cells ?? [];
  const runs = ev.runs ?? [];
  const processes = ev.processes ?? [];
  const outputs = ev.outputs ?? [];
  const encode = tally(runs.map((r) => r.status), ENCODE_STATUSES);
  const memory = tally(runs.map((r) => r.memoryStatus), MEMORY_STATUSES);
  const validation = tally(outputs.map((o) => o?.validation?.status), VALIDATION_STATUSES);
  const redecode = tally(outputs.map((o) => o?.redecode?.status), REDECODE_STATUSES);
  const dqt = tally(outputs.map((o) => o?.dqt?.status), PARSE_STATUSES);
  const markers = tally(outputs.map((o) => o?.markers?.status), PARSE_STATUSES);
  const inputMismatches = runs.filter((r) => r.status === 'ENCODED' && r.inputMatches !== true).length;
  const perCell = cells.map((cell) => {
    const cr = runs.filter((r) => r.cellId === cell.cellId);
    const shas = new Set(cr.filter((r) => r.status === 'ENCODED').map((r) => r.outputSha256));
    const outs = outputs.filter((o) => shas.has(o?.sha256));
    return {
      cellId: cell.cellId, plannedRuns: cell.plannedRuns,
      encoded: cr.filter((r) => r.status === 'ENCODED').length,
      inputMatched: cr.filter((r) => r.status === 'ENCODED' && r.inputMatches === true).length,
      ...determinism(cr),
      validationPass: outs.filter((o) => o.validation?.status === 'PASS').length,
      dimensionsMatched: outs.filter((o) => o.validation?.dimensionsMatch === true).length,
      redecodePass: outs.filter((o) => o.redecode?.status === 'PASS').length,
      dqtParsed: outs.filter((o) => o.dqt?.status === 'PARSED').length,
    };
  });
  const det = {
    withinProcess: tally(perCell.flatMap((c) => c.withinProcess), DETERMINISM),
    acrossFreshProcesses: tally(perCell.map((c) => c.acrossFreshProcesses), DETERMINISM),
    allRuns: tally(perCell.map((c) => c.allRuns), DETERMINISM),
  };
  const validatorDimensionMismatches = outputs.filter((o) => o?.validation?.status === 'PASS' && o.validation.dimensionsMatch !== true).length;
  const redecodeMissing = outputs.filter((o) => o?.validation?.status === 'PASS' && o?.redecode?.status === 'NOT_RUN').length;
  const over10MiB = outputs.filter((o) => o?.within10MiB !== true).length;
  const metadataMarkerOutputs = outputs.filter((o) => (o?.markers?.metadataMarkers?.length ?? 0) > 0).length;
  const app0JfifMissing = outputs.filter((o) => o?.markers?.status === 'PARSED' && o.markers.app0Jfif !== true).length;
  const plannedRuns = cells.reduce((n, c) => n + (c.plannedRuns ?? 0), 0);
  /** @type {string[]} */
  const reasons = [];
  let incomplete = false;
  /** @param {number} n @param {string} label @param {boolean} [blocks] */
  const note = (n, label, blocks = false) => {
    if (n > 0) {
      reasons.push(`${label}:${n}`);
      if (blocks) incomplete = true;
    }
  };
  note(runs.length !== plannedRuns ? 1 : 0, 'run_count_mismatch', true);
  note(processes.filter((p) => p.outcome === 'CRASH').length, 'process_crash', true);
  note(processes.filter((p) => p.outcome === 'TIMEOUT').length, 'process_timeout', true);
  note(encode.TIMEOUT, 'encode_timeout', true);
  note(encode.CRASH, 'encode_crash', true);
  note(encode.NOT_RUN, 'encode_not_run', true);
  note(outputs.length === 0 ? 1 : 0, 'no_outputs', true);
  note(validation.TIMEOUT + validation.ERROR + validation.NOT_RUN, 'validation_incomplete', true);
  note(redecodeMissing + redecode.TIMEOUT + redecode.ERROR, 'redecode_incomplete', true);
  note(encode.ENCODE_ERROR, 'encode_error');
  note(inputMismatches, 'input_mismatch');
  note(det.allRuns.DIVERGENT, 'divergent_cells');
  note(validation.REJECT, 'validator_reject');
  note(validatorDimensionMismatches, 'validator_dimension_mismatch');
  note(redecode.DECODE_ERROR, 'redecode_decode_error');
  note(redecode.DIMENSION_MISMATCH, 'redecode_dimension_mismatch');
  note(dqt.ERROR, 'dqt_parse_error');
  note(markers.ERROR, 'marker_scan_error');
  note(metadataMarkerOutputs, 'metadata_markers_present');
  note(app0JfifMissing, 'app0_jfif_absent');
  note(over10MiB, 'encoded_over_10MiB');
  note(memory.NOT_MEASURED, 'memory_not_measured');
  return {
    plannedCells: cells.length, plannedProcesses: processes.length, plannedEncodes: plannedRuns, observedRuns: runs.length,
    processOutcomes: tally(processes.map((p) => p.outcome), PROCESS_OUTCOMES),
    encode, inputMismatches, memory, determinism: det, uniqueOutputs: outputs.length, validation, redecode, dqt, markers,
    validatorDimensionMismatches, over10MiB, metadataMarkerOutputs, app0JfifMissing, perCell,
    overall: { status: incomplete ? 'INCOMPLETE' : reasons.length ? 'COMPLETE_WITH_FINDINGS' : 'ALL_PASS', reasons },
  };
}

/** @param {{runId: string, createdAt?: string, environment: any, cells: any[], processes: any[], runs: any[], outputs: any[]}} parts */
export function assembleEvidence(parts) {
  const ev = {
    schemaVersion: SCHEMA_VERSION, runId: parts.runId, createdAt: parts.createdAt ?? new Date().toISOString(), environment: parts.environment,
    patterns: patternsBlock(), limits: LIMITS, notProbed: NOT_PROBED,
    cells: parts.cells, processes: parts.processes, runs: parts.runs, outputs: parts.outputs, summary: null,
  };
  ev.summary = summarize(ev);
  return ev;
}

/** @param {any} d @param {(m: string) => void} fail @param {string} where */
function checkDqt(d, fail, where) {
  if (!d || !PARSE_STATUSES.includes(d.status) || !Array.isArray(d.tables)) return fail(`${where}.dqt shape`);
  if (d.status === 'PARSED' && d.tables.length === 0) fail(`${where}.dqt empty`);
  if (d.status === 'ERROR' && typeof d.reason !== 'string') fail(`${where}.dqt reason`);
  d.tables.forEach((/** @type {any} */ t, /** @type {number} */ j) => {
    const max = t?.precision === 1 ? 65535 : 255;
    const ok = t && Number.isInteger(t.id) && t.id >= 0 && t.id <= 3 && (t.precision === 0 || t.precision === 1) && Array.isArray(t.values)
      && t.values.length === 64 && t.values.every((/** @type {any} */ v) => Number.isInteger(v) && v >= 0 && v <= max) && isSha(t.sha256);
    if (!ok) fail(`${where}.dqt.tables[${j}]`);
  });
}

/**
 * Strict structural/count/identity validation plus derived-summary recomputation.
 * @param {any} ev
 * @param {{recomputeInputs?: boolean, artifactDir?: string, allowSynthetic?: boolean}} [opts]
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateEvidence(ev, opts = {}) {
  /** @type {string[]} */
  const errors = [];
  /** @param {string} m */
  const fail = (m) => {
    if (errors.length < 200) errors.push(m);
  };
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return { ok: false, errors: ['evidence_not_object'] };
  if (ev.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion');
  if (typeof ev.runId !== 'string' || !RUN_ID_RE.test(ev.runId)) fail('runId');
  if (typeof ev.createdAt !== 'string') fail('createdAt');
  const env = ev.environment;
  if (!env || typeof env !== 'object') fail('environment');
  else if (env.synthetic === true) {
    if (!opts.allowSynthetic) fail('synthetic_evidence');
  } else if (typeof env.node !== 'string' || typeof env.platform !== 'string' || typeof env.arch !== 'string' || typeof env.encoder?.version !== 'string' || !isSha(env.encoder?.sourceSha256)) fail('environment fields');
  if (!isDeepStrictEqual(ev.patterns, patternsBlock())) fail('patterns');
  if (!isDeepStrictEqual(ev.limits, LIMITS)) fail('limits');
  if (!isDeepStrictEqual(ev.notProbed, NOT_PROBED)) fail('notProbed');
  for (const key of ['cells', 'processes', 'runs', 'outputs']) if (!Array.isArray(ev[key])) fail(`${key} not array`);
  if (errors.length && errors.some((e) => e.endsWith('not array'))) return { ok: false, errors };
  const { cells, processes, runs, outputs } = ev;

  const expectedCells = makeCells();
  if (cells.length !== expectedCells.length) fail(`cells.length ${cells.length}`);
  /** @type {Map<string, any>} */
  const cellById = new Map();
  expectedCells.forEach((exp, i) => {
    const c = cells[i];
    if (!c) return fail(`cells[${i}] missing`);
    for (const [k, v] of Object.entries(exp)) if (c[k] !== v) fail(`cells[${i}].${k}`);
    if (!isSha(c.inputSha256)) fail(`cells[${i}].inputSha256`);
    if (!isSha(c.inputRgbSha256)) fail(`cells[${i}].inputRgbSha256`);
    if (c.inputBytes !== exp.width * exp.height * 4) fail(`cells[${i}].inputBytes`);
    cellById.set(exp.cellId, c);
  });

  const expProc = planProcesses(expectedCells);
  if (processes.length !== expProc.length) fail(`processes.length ${processes.length}`);
  expProc.forEach((exp, i) => {
    const p = processes[i];
    if (!p) return fail(`processes[${i}] missing`);
    for (const [k, v] of Object.entries(exp)) if (p[k] !== v) fail(`processes[${i}].${k}`);
    if (!PROCESS_OUTCOMES.includes(p.outcome)) fail(`processes[${i}].outcome`);
  });

  const expRuns = planRuns(expectedCells);
  if (runs.length !== expRuns.length) fail(`runs.length ${runs.length}`);
  /** @type {Map<string, {byteLengths: Set<number>, cellIds: Set<string>, runIndices: number[], firstCell: string}>} */
  const derived = new Map();
  expRuns.forEach((exp, i) => {
    const r = runs[i];
    if (!r) return fail(`runs[${i}] missing`);
    for (const [k, v] of Object.entries(exp)) if (r[k] !== v) fail(`runs[${i}].${k}`);
    if (!ENCODE_STATUSES.includes(r.status)) fail(`runs[${i}].status`);
    if (!MEMORY_STATUSES.includes(r.memoryStatus)) fail(`runs[${i}].memoryStatus`);
    else if (r.memoryStatus === 'MEASURED' ? !(Number.isInteger(r.maxRssKiB) && r.maxRssKiB > 0) : r.maxRssKiB !== null || typeof r.memoryReason !== 'string') fail(`runs[${i}].memory`);
    if (r.status === 'ENCODED') {
      if (!isSha(r.inputSha256) || !isSha(r.outputSha256) || !Number.isInteger(r.byteLength) || r.byteLength <= 0 || typeof r.encodeMs !== 'number' || !(r.encodeMs >= 0)) return fail(`runs[${i}] encoded fields`);
      const cell = cellById.get(r.cellId);
      if (!isSha(r.inputRgbSha256)) fail(`runs[${i}].inputRgbSha256`);
      if (cell && r.inputMatches !== (r.inputSha256 === cell.inputSha256 && r.inputRgbSha256 === cell.inputRgbSha256)) fail(`runs[${i}].inputMatches`);
      let d = derived.get(r.outputSha256);
      if (!d) {
        d = { byteLengths: new Set(), cellIds: new Set(), runIndices: [], firstCell: r.cellId };
        derived.set(r.outputSha256, d);
      }
      d.byteLengths.add(r.byteLength);
      d.cellIds.add(r.cellId);
      d.runIndices.push(r.runIndex);
    } else if (r.outputSha256 !== null || r.byteLength !== null || r.inputMatches !== null) fail(`runs[${i}] non-encoded carries output`);
  });

  /** @type {Set<string>} */
  const seen = new Set();
  outputs.forEach((/** @type {any} */ o, /** @type {number} */ i) => {
    const at = `outputs[${i}]`;
    if (!o || !isSha(o.sha256)) return fail(`${at}.sha256`);
    if (seen.has(o.sha256)) return fail(`${at} duplicate output`);
    seen.add(o.sha256);
    const d = derived.get(o.sha256);
    if (!d) return fail(`${at} not produced by any run`);
    if (d.byteLengths.size !== 1 || o.byteLength !== [...d.byteLengths][0]) fail(`${at} byteLength inconsistent`);
    if (o.within10MiB !== (o.byteLength <= ENCODED_LIMIT_BYTES)) fail(`${at}.within10MiB`);
    if (o.artifact !== `${o.sha256}.jpg`) fail(`${at}.artifact`);
    if (!isDeepStrictEqual(o.cellIds, [...d.cellIds].sort())) fail(`${at}.cellIds`);
    if (o.referenceCellId !== d.firstCell) fail(`${at}.referenceCellId`);
    if (!isDeepStrictEqual(o.runIndices, d.runIndices)) fail(`${at}.runIndices`);
    checkDqt(o.dqt, fail, at);
    const mk = o.markers;
    if (!mk || !PARSE_STATUSES.includes(mk.status) || !Array.isArray(mk.markers) || !Array.isArray(mk.metadataMarkers) || typeof mk.app0Jfif !== 'boolean') fail(`${at}.markers`);
    const v = o.validation;
    const rd = o.redecode;
    const cellIds = Array.isArray(o.cellIds) ? o.cellIds : [];
    if (!v || !VALIDATION_STATUSES.includes(v.status)) fail(`${at}.validation.status`);
    else if (v.status === 'PASS') {
      const match = cellIds.every((/** @type {string} */ id) => {
        const c = cellById.get(id);
        return c && v.width === c.width && v.height === c.height;
      });
      if (v.dimensionsMatch !== match) fail(`${at}.validation.dimensionsMatch`);
    } else if (v.dimensionsMatch !== null) fail(`${at}.validation.dimensionsMatch`);
    if (!rd || !REDECODE_STATUSES.includes(rd.status)) fail(`${at}.redecode.status`);
    else if (v?.status !== 'PASS' && rd.status !== 'NOT_RUN') fail(`${at} redecode ran without validator PASS`);
    else if (rd.status === 'PASS' || rd.status === 'DIMENSION_MISMATCH') {
      if (!Array.isArray(rd.comparisons) || !isDeepStrictEqual(rd.comparisons.map((/** @type {any} */ c) => c?.cellId), cellIds)) fail(`${at}.redecode.comparisons`);
      else if ((rd.status === 'PASS') !== rd.comparisons.every((/** @type {any} */ c) => c.dimensionsMatch === true)) fail(`${at}.redecode status vs comparisons`);
    }
    if (opts.artifactDir) {
      const file = path.join(opts.artifactDir, `${o.sha256}.jpg`);
      if (!existsSync(file) || sha256(readFileSync(file)) !== o.sha256) fail(`${at} artifact missing or hash mismatch`);
    }
  });
  for (const sha of derived.keys()) if (!seen.has(sha)) fail(`missing output ${sha}`);

  if (opts.recomputeInputs && errors.length === 0) {
    /** @type {Map<string, string>} */
    const cache = new Map();
    for (const c of cells) {
      const key = `${c.width}x${c.height}-${c.pattern}`;
      if (!cache.has(key)) cache.set(key, sha256(makeRgba(c.pattern, c.width, c.height)));
      if (cache.get(key) !== c.inputSha256) fail(`cells ${c.cellId} inputSha256 recompute`);
      if (!cache.has(`${key}-rgb`)) cache.set(`${key}-rgb`, sha256(makeRgb(c.pattern, c.width, c.height)));
      if (cache.get(`${key}-rgb`) !== c.inputRgbSha256) fail(`cells ${c.cellId} inputRgbSha256 recompute`);
    }
  }
  try {
    if (!isDeepStrictEqual(ev.summary, summarize(ev))) fail('summary mismatch');
  } catch {
    fail('summary uncomputable');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Runs one hidden fresh worker: ready -> start -> progress* -> result -> ack -> exit.
 * The watchdog covers the whole lifetime including ack/exit; on timeout only this child is killed
 * and its exit is confirmed before resolving.
 * @param {any} job
 * @param {{timeoutMs?: number, onProgress?: (record: any) => void}} [options]
 * @returns {Promise<{outcome: string, reason: string | null, exitCode: number | null, signal: string | null, progress: any[], result: any, elapsedMs: number}>}
 */
export function runWorker(job, options = {}) {
  const timeoutMs = options.timeoutMs ?? WATCHDOG_MS;
  return new Promise((resolve, reject) => {
    const started = performance.now();
    /** @type {any[]} */
    const progress = [];
    /** @type {any} */
    let resultMessage = null;
    /** @type {string | null} */
    let reason = null;
    let timedOut = false;
    let settled = false;
    /** @type {NodeJS.Timeout | undefined} */
    let killTimer;
    const child = spawn(process.execPath, [WORKER_PATH], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    const watchdog = setTimeout(() => {
      timedOut = true;
      reason = 'watchdog_timeout';
      child.kill();
      killTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('worker_exit_unconfirmed_after_kill'));
        }
      }, KILL_CONFIRM_MS);
    }, timeoutMs);
    /** @param {number | null} code @param {string | null} signal */
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (killTimer) clearTimeout(killTimer);
      const ok = !timedOut && resultMessage?.ok === true && code === 0 && reason === null;
      const outcome = timedOut ? 'TIMEOUT' : ok ? 'OK' : 'CRASH';
      if (!ok && reason === null) reason = resultMessage ? (resultMessage.ok ? `exit_code_${code}` : String(resultMessage.error)) : `exit_without_result_${code ?? signal}`;
      resolve({ outcome, reason: ok ? null : reason, exitCode: code, signal, progress, result: ok ? resultMessage.result : null, elapsedMs: performance.now() - started });
    };
    /** @param {any} message */
    const send = (message) => {
      try {
        child.send(message, (error) => {
          if (error && reason === null) reason = 'ipc_send_failed';
        });
      } catch {
        if (reason === null) reason = 'ipc_send_failed';
      }
    };
    child.on('message', (/** @type {any} */ m) => {
      if (settled) return;
      if (m?.type === 'progress') {
        progress.push(m.record);
        options.onProgress?.(m.record);
      } else if (timedOut) {
        return;
      } else if (m?.type === 'ready') send({ type: 'start', job });
      else if (m?.type === 'result' && resultMessage === null) {
        resultMessage = m;
        send({ type: 'ack' });
      } else if (reason === null) reason = 'protocol_violation';
    });
    child.once('error', (error) => {
      if (reason === null) reason = `spawn_error ${sanitizeError(error)}`;
      if (child.pid === undefined) finish(null, null);
    });
    child.once('exit', (code, signal) => finish(code, signal));
  });
}

/** @param {string} cwd */
function gitInfo(cwd) {
  /** @param {string[]} args */
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim();
  try {
    return { head: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0 };
  } catch {
    return { head: null, dirty: null };
  }
}

/** Node/OS/arch/CPU model only (no hostname or user paths). @param {string} [repoRoot] */
export function collectEnvironment(repoRoot = REPO_ROOT) {
  const req = createRequire(path.join(repoRoot, 'package.json'));
  const pkg = JSON.parse(readFileSync(req.resolve('jpeg-js/package.json'), 'utf8'));
  /** @type {any} */
  let lock = null;
  try {
    lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')).packages?.['node_modules/jpeg-js'] ?? null;
  } catch {
    lock = null;
  }
  const validatorPath = path.join(repoRoot, ...VALIDATOR_REL);
  return {
    node: process.version, v8: process.versions.v8, platform: process.platform, osRelease: os.release(), arch: process.arch,
    cpuModel: os.cpus()[0]?.model?.trim() ?? null,
    encoder: { package: 'jpeg-js', version: pkg.version, entry: 'jpeg-js/lib/encoder.js', sourceSha256: sha256(readFileSync(req.resolve('jpeg-js/lib/encoder.js'))), lockVersion: lock?.version ?? null, lockIntegrity: lock?.integrity ?? null },
    git: gitInfo(repoRoot),
    validatorBuild: { path: VALIDATOR_REL.join('/'), sha256: existsSync(validatorPath) ? sha256(readFileSync(validatorPath)) : null },
  };
}

const VALIDATION_EMPTY = { code: null, reason: null, width: null, height: null, validationProfile: null, dimensionsMatch: null, ms: null, rssBeforeBytes: null, rssAfterBytes: null, maxRssKiB: null, memoryStatus: 'NOT_MEASURED', memoryReason: 'no_observation' };
const REDECODE_EMPTY = { reason: null, width: null, height: null, rgbLength: null, decodedRgbSha256: null, decodedRepresentation: null, ms: null, comparisons: null, rssBeforeBytes: null, rssAfterBytes: null, maxRssKiB: null, memoryStatus: 'NOT_MEASURED', memoryReason: 'no_observation' };

/** @param {string} file @param {string} sha @param {string} validatorPath @param {any[]} cellsFor */
async function validateOutput(file, sha, validatorPath, cellsFor) {
  const w = await runWorker({ mode: 'validate', file, expectedSha256: sha, validatorPath });
  if (w.outcome !== 'OK') return { ...VALIDATION_EMPTY, status: w.outcome === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', reason: w.reason };
  const r = w.result ?? {};
  const known = VALIDATION_STATUSES.includes(r.status);
  const status = known ? r.status : 'ERROR';
  return {
    ...VALIDATION_EMPTY, status, code: r.code ?? null, reason: known ? r.reason ?? null : 'unexpected_worker_status',
    width: num(r.width), height: num(r.height), validationProfile: r.validationProfile ?? null,
    dimensionsMatch: status === 'PASS' ? cellsFor.every((c) => c.width === r.width && c.height === r.height) : null,
    ms: num(r.ms), rssBeforeBytes: num(r.rssBeforeBytes), rssAfterBytes: num(r.rssAfterBytes), ...normalizeMemory(r.maxRssKiB, 'max_rss_unavailable'),
  };
}

/** @param {string} file @param {string} sha @param {any[]} cellsFor */
async function redecodeOutput(file, sha, cellsFor) {
  const comparisons = cellsFor.map((c) => ({ cellId: c.cellId, width: c.width, height: c.height, pattern: c.pattern }));
  const w = await runWorker({ mode: 'redecode', file, expectedSha256: sha, comparisons });
  if (w.outcome !== 'OK') return { ...REDECODE_EMPTY, status: w.outcome === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', reason: w.reason };
  const r = w.result ?? {};
  const known = REDECODE_STATUSES.includes(r.status);
  return {
    ...REDECODE_EMPTY, status: known ? r.status : 'ERROR', reason: known ? r.reason ?? null : 'unexpected_worker_status',
    width: num(r.width), height: num(r.height), rgbLength: num(r.rgbLength), decodedRgbSha256: r.decodedRgbSha256 ?? null,
    decodedRepresentation: r.decodedRepresentation ?? null, ms: num(r.ms), comparisons: r.comparisons ?? null,
    rssBeforeBytes: num(r.rssBeforeBytes), rssAfterBytes: num(r.rssAfterBytes), ...normalizeMemory(r.maxRssKiB, 'max_rss_unavailable'),
  };
}

/** One fresh validator worker per unique SHA; redecode only after validator PASS. */
/** @param {any[]} cells @param {any[]} runs @param {string} runDir @param {string} validatorPath @param {(m: string) => void} log */
async function evaluateOutputs(cells, runs, runDir, validatorPath, log) {
  const cellById = new Map(cells.map((c) => [c.cellId, c]));
  /** @type {Map<string, {byteLength: number, cellIds: Set<string>, runIndices: number[], referenceCellId: string}>} */
  const groups = new Map();
  for (const r of runs) {
    if (r.status !== 'ENCODED') continue;
    let g = groups.get(r.outputSha256);
    if (!g) {
      g = { byteLength: r.byteLength, cellIds: new Set(), runIndices: [], referenceCellId: r.cellId };
      groups.set(r.outputSha256, g);
    }
    g.cellIds.add(r.cellId);
    g.runIndices.push(r.runIndex);
  }
  const outputs = [];
  let n = 0;
  for (const [sha, g] of groups) {
    const file = path.join(runDir, `${sha}.jpg`);
    const cellIds = [...g.cellIds].sort();
    const cellsFor = cellIds.map((id) => cellById.get(id));
    /** @type {Buffer | null} */
    let bytes = null;
    try {
      bytes = readFileSync(file);
    } catch {
      bytes = null;
    }
    const artifactOk = bytes !== null && sha256(bytes) === sha;
    const markers = artifactOk && bytes ? scanMarkers(bytes) : { status: 'ERROR', reason: 'artifact_unavailable', markers: [], app0Jfif: false, metadataMarkers: [], endsWithEoi: false };
    const dqt = artifactOk && bytes ? parseDqt(bytes) : { status: 'ERROR', reason: 'artifact_unavailable', tables: [] };
    bytes = null;
    const validation = artifactOk ? await validateOutput(file, sha, validatorPath, cellsFor) : { ...VALIDATION_EMPTY, status: 'ERROR', reason: 'artifact_unavailable' };
    const redecode = validation.status === 'PASS' ? await redecodeOutput(file, sha, cellsFor) : { ...REDECODE_EMPTY, status: 'NOT_RUN', reason: `validator_${validation.status.toLowerCase()}` };
    outputs.push({ sha256: sha, byteLength: g.byteLength, within10MiB: g.byteLength <= ENCODED_LIMIT_BYTES, artifact: `${sha}.jpg`, cellIds, referenceCellId: g.referenceCellId, runIndices: g.runIndices, markers, dqt, validation, redecode });
    log(`[task33] output ${++n}/${groups.size} ${sha.slice(0, 12)} validate=${validation.status} redecode=${redecode.status}`);
  }
  return outputs;
}

function makeRunId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
}

/**
 * Full approved probe (40 cells, 120 encoder processes, 360 encodes). Never called on import.
 * @param {{outputPath?: string, repoRoot?: string, log?: (m: string) => void}} [options]
 */
export async function runProbe(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const log = options.log ?? ((/** @type {string} */ m) => process.stderr.write(`${m}\n`));
  const output = path.resolve(options.outputPath ?? DEFAULT_OUTPUT);
  if (existsSync(output)) throw new Error('refusing_existing_evidence_path');
  const validatorPath = path.join(repoRoot, ...VALIDATOR_REL);
  if (!existsSync(validatorPath)) throw new Error('validator_build_missing (run npm run build first)');
  const environment = collectEnvironment(repoRoot);
  if (environment.encoder.version !== '0.4.4' || environment.encoder.lockVersion !== '0.4.4') throw new Error('encoder_version_mismatch');
  const runId = makeRunId();
  const artifactRoot = path.join(repoRoot, ...ARTIFACT_REL);
  const runDir = path.join(artifactRoot, runId);
  if (existsSync(runDir)) throw new Error('refusing_existing_run_folder');
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(runDir);
  const streamFile = path.join(runDir, 'runs.jsonl');
  /** @type {Map<string, string>} */
  const inputCache = new Map();
  const cells = makeCells().map((c) => {
    const key = `${c.width}x${c.height}-${c.pattern}`;
    if (!inputCache.has(key)) inputCache.set(key, sha256(makeRgba(c.pattern, c.width, c.height)));
    if (!inputCache.has(`${key}-rgb`)) inputCache.set(`${key}-rgb`, sha256(makeRgb(c.pattern, c.width, c.height)));
    return { ...c, inputSha256: inputCache.get(key), inputRgbSha256: inputCache.get(`${key}-rgb`), inputBytes: c.width * c.height * 4 };
  });
  const plan = planRuns(cells);
  const procPlan = planProcesses(cells);
  const runs = [];
  const processes = [];
  for (const proc of procPlan) {
    const cell = cells.find((c) => c.cellId === proc.cellId);
    const slots = plan.filter((r) => r.cellId === proc.cellId && r.processIndex === proc.processIndex);
    const job = { mode: 'encode', width: cell.width, height: cell.height, pattern: cell.pattern, quality: cell.quality, repeats: ENCODES_PER_PROCESS, artifactDir: runDir };
    const worker = await runWorker(job, { onProgress: (record) => appendFileSync(streamFile, `${JSON.stringify({ processId: proc.processId, ...record })}\n`) });
    const records = accountProcess(slots, cell, worker);
    runs.push(...records);
    processes.push({ ...proc, outcome: worker.outcome, exitCode: worker.exitCode, signal: worker.signal, reason: worker.reason, elapsedMs: worker.elapsedMs });
    appendFileSync(streamFile, `${JSON.stringify({ processId: proc.processId, outcome: worker.outcome, reason: worker.reason })}\n`);
    log(`[task33] encode ${proc.processOrdinal + 1}/${procPlan.length} ${proc.processId} ${worker.outcome} ${records.map((r) => r.status).join(',')}`);
  }
  const outputs = await evaluateOutputs(cells, runs, runDir, validatorPath, log);
  const evidence = assembleEvidence({ runId, environment, cells, processes, runs, outputs });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return { evidence, runDir };
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{output: string | null, validate: string | null, error: string | null}} */
  const out = { output: null, validate: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if ((a === '--output' || a === '--validate-evidence') && v && !v.startsWith('--')) {
      if (a === '--output') out.output = v;
      else out.validate = v;
      i++;
    } else out.error = 'unknown_or_incomplete_argument';
  }
  if (out.output && out.validate) out.error = 'conflicting_modes';
  return out;
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`[task33] ${args.error}; usage: --output <file> | --validate-evidence <file>\n`);
    return 2;
  }
  if (args.validate) {
    /** @type {any} */
    let ev;
    try {
      ev = JSON.parse(readFileSync(path.resolve(args.validate), 'utf8'));
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ mode: 'validate-evidence', ok: false, errors: [`unreadable_evidence ${sanitizeError(error)}`] })}\n`);
      return 1;
    }
    const dir = typeof ev?.runId === 'string' && RUN_ID_RE.test(ev.runId) ? path.join(REPO_ROOT, ...ARTIFACT_REL, ev.runId) : null;
    const artifactDir = dir && existsSync(dir) ? dir : undefined;
    const res = validateEvidence(ev, { recomputeInputs: true, artifactDir });
    const overall = res.ok ? ev.summary.overall : null;
    process.stdout.write(`${JSON.stringify({ mode: 'validate-evidence', ok: res.ok, artifactsChecked: Boolean(artifactDir), overall, errors: res.errors })}\n`);
    return res.ok && overall.status !== 'INCOMPLETE' ? 0 : 1;
  }
  const { evidence, runDir } = await runProbe({ outputPath: args.output ?? DEFAULT_OUTPUT });
  const check = validateEvidence(evidence, { recomputeInputs: false, artifactDir: runDir });
  const s = evidence.summary;
  process.stdout.write(`${JSON.stringify({ mode: 'probe', runId: evidence.runId, overall: s.overall, evidenceValid: check.ok, evidenceErrors: check.errors, encode: s.encode, uniqueOutputs: s.uniqueOutputs, validation: s.validation, redecode: s.redecode, dqt: s.dqt, determinism: s.determinism.allRuns })}\n`);
  return check.ok && s.overall.status !== 'INCOMPLETE' ? 0 : 1;
}

if (isDirectRun(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`[task33] fatal ${sanitizeError(error)}\n`);
      process.exitCode = 1;
    },
  );
}
