// @ts-check
// Task 33 JPEG probe worker. One job per fresh process: encode | validate | redecode.
// IPC order: worker ready -> parent start -> worker progress* -> worker result -> parent ack -> worker exits.
// Encode mode loads only jpeg-js/lib/encoder.js (the package root would also load the decoder).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const localRequire = createRequire(import.meta.url);

/** Strict decode options, identical to src/core/jpeg-validation.ts. */
export const DECODE_OPTIONS = Object.freeze({ tolerantDecoding: false, useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 128, maxResolutionInMP: 16.777216 });

export const PATTERN_LAYOUT = 'origin (0,0) top-left; x=column, y=row; row-major; RGB 3 bytes/pixel; encoder input RGBA 4 bytes/pixel with A=255';

/** Lossless synthetic source formulas (probe-only; not document/chart representative). */
export const PATTERNS = {
  G: { R: '(17x+3y) mod 256', G: '(5x+11y) mod 256', B: '(13x+7y) mod 256' },
  C: { R: '((floor((x+3)/8)+floor((y+5)/8)) mod 2)*255', G: '255-R', B: '(x+y) mod 256' },
};

/** @param {Uint8Array} bytes @returns {string} */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {string} pattern @param {number} x @param {number} y @returns {number[]} */
export function patternPixel(pattern, x, y) {
  if (pattern === 'G') return [(17 * x + 3 * y) % 256, (5 * x + 11 * y) % 256, (13 * x + 7 * y) % 256];
  if (pattern === 'C') {
    const r = ((Math.floor((x + 3) / 8) + Math.floor((y + 5) / 8)) % 2) * 255;
    return [r, 255 - r, (x + y) % 256];
  }
  throw new Error('unknown_pattern');
}

/** @param {string} pattern @param {number} width @param {number} height @param {3 | 4} channels @returns {Buffer} */
function makePixels(pattern, width, height, channels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error('invalid_dimensions');
  const out = Buffer.alloc(width * height * channels);
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = patternPixel(pattern, x, y);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      if (channels === 4) out[i + 3] = 255;
      i += channels;
    }
  }
  return out;
}

/** @param {string} pattern @param {number} width @param {number} height @returns {Buffer} */
export function makeRgb(pattern, width, height) {
  return makePixels(pattern, width, height, 3);
}

/** @param {string} pattern @param {number} width @param {number} height @returns {Buffer} */
export function makeRgba(pattern, width, height) {
  return makePixels(pattern, width, height, 4);
}

/** maxRSS (KiB) is the process lifetime high-water mark; null when unavailable or 0. @returns {{maxRssKiB: number | null, rssBytes: number}} */
export function memorySnapshot() {
  const maxRss = process.resourceUsage().maxRSS;
  return { maxRssKiB: Number.isInteger(maxRss) && maxRss > 0 ? maxRss : null, rssBytes: process.memoryUsage().rss };
}

/** Error summary without paths, stacks or environment. @param {unknown} error @returns {string} */
export function sanitizeError(error) {
  const e = /** @type {any} */ (error);
  const name = typeof e?.name === 'string' && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'Error';
  const code = typeof e?.code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(e.code) ? `[${e.code}]` : '';
  const raw = typeof e?.message === 'string' ? e.message : '';
  const message = raw.length <= 160 && !/[\\/]/.test(raw) ? raw : '<redacted>';
  return `${name}${code} ${message}`.trim();
}

/** Store raw bytes unchanged as <sha>.jpg; identical bytes dedupe, different bytes under one name fail. @param {string} dir @param {string} sha @param {Buffer} bytes */
export function writeArtifact(dir, sha, bytes) {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('invalid_sha');
  const file = path.join(dir, `${sha}.jpg`);
  if (existsSync(file)) {
    if (!readFileSync(file).equals(bytes)) throw new Error('artifact_conflict');
    return;
  }
  const tmp = path.join(dir, `${sha}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes, { flag: 'wx' });
  renameSync(tmp, file);
}

/** @param {any} data @returns {Buffer} */
function toBuffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Reference-only lossy pixel error versus each associated cell's regenerated RGB (no exactness required).
 * @param {{width: number, height: number, data: ArrayLike<number>}} decoded
 * @param {Array<{cellId: string, width: number, height: number, pattern: string}>} comparisons
 */
export function compareDecoded(decoded, comparisons) {
  const results = comparisons.map((c) => {
    const dimensionsMatch = decoded.width === c.width && decoded.height === c.height && decoded.data.length === c.width * c.height * 3;
    if (!dimensionsMatch) return { cellId: c.cellId, dimensionsMatch: false, mae: null, maxAbs: null };
    const ref = makeRgb(c.pattern, c.width, c.height);
    const sums = [0, 0, 0];
    const maxAbs = [0, 0, 0];
    for (let i = 0; i < ref.length; i++) {
      const d = Math.abs(decoded.data[i] - ref[i]);
      const ch = i % 3;
      sums[ch] += d;
      if (d > maxAbs[ch]) maxAbs[ch] = d;
    }
    const n = c.width * c.height;
    return { cellId: c.cellId, dimensionsMatch: true, mae: sums.map((s) => Math.round((s / n) * 1e6) / 1e6), maxAbs };
  });
  return { status: results.every((r) => r.dimensionsMatch) ? 'PASS' : 'DIMENSION_MISMATCH', comparisons: results };
}

/** @param {any} job @param {(message: any) => Promise<void>} send */
async function runEncode(job, send) {
  const { width, height, pattern, quality, repeats, artifactDir } = job;
  if (!Number.isInteger(quality) || quality < 1 || quality > 100 || !Number.isInteger(repeats) || repeats < 1 || typeof artifactDir !== 'string') throw new Error('invalid_encode_job');
  const encode = localRequire('jpeg-js/lib/encoder.js');
  const rgba = makeRgba(pattern, width, height); // input allocation finishes before any clock
  const inputRgbSha256 = sha256(makeRgb(pattern, width, height));
  for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
    const inputSha256 = sha256(rgba);
    const rssBeforeBytes = process.memoryUsage().rss;
    let encoded = null;
    let failure = null;
    const t0 = performance.now();
    try {
      encoded = encode({ data: rgba, width, height }, quality); // no comments/exifBuffer keys
    } catch (error) {
      failure = error;
    }
    const encodeMs = performance.now() - t0;
    const mem = memorySnapshot(); // before output hash/write
    if (failure || !encoded) {
      await send({ type: 'progress', record: { repeatIndex, status: 'ENCODE_ERROR', reason: sanitizeError(failure ?? new Error('no_output')), inputSha256, encodeMs, maxRssKiB: mem.maxRssKiB } });
      continue;
    }
    let bytes = toBuffer(encoded.data);
    encoded = null;
    const outputSha256 = sha256(bytes);
    writeArtifact(artifactDir, outputSha256, bytes);
    const record = { repeatIndex, status: 'ENCODED', reason: null, inputSha256, inputRgbSha256, outputSha256, byteLength: bytes.length, encodeMs, maxRssKiB: mem.maxRssKiB, rssBeforeBytes, rssAfterBytes: mem.rssBytes };
    bytes = null;
    await send({ type: 'progress', record });
  }
  return { mode: 'encode', repeats };
}

/** @param {any} job */
async function runValidate(job) {
  const { validateJpeg } = await import(pathToFileURL(job.validatorPath).href);
  const bytes = readFileSync(job.file);
  const base = { status: 'ERROR', code: null, reason: null, width: null, height: null, validationProfile: null, ms: null, maxRssKiB: null, rssBeforeBytes: null, rssAfterBytes: null };
  if (sha256(bytes) !== job.expectedSha256) return { ...base, reason: 'artifact_hash_mismatch' };
  const rssBeforeBytes = process.memoryUsage().rss;
  let out;
  const t0 = performance.now();
  try {
    const r = validateJpeg(bytes);
    out = { ...base, status: 'PASS', width: r.width, height: r.height, validationProfile: r.validationProfile };
  } catch (error) {
    const e = /** @type {any} */ (error);
    out = e?.name === 'JpegValidationError' && typeof e.code === 'string' ? { ...base, status: 'REJECT', code: e.code } : { ...base, reason: sanitizeError(error) };
  }
  const ms = performance.now() - t0;
  const mem = memorySnapshot();
  return { ...out, ms, maxRssKiB: mem.maxRssKiB, rssBeforeBytes, rssAfterBytes: mem.rssBytes };
}

/** @param {any} job */
async function runRedecode(job) {
  const decode = localRequire('jpeg-js/lib/decoder.js');
  const bytes = readFileSync(job.file);
  const base = { status: 'ERROR', reason: null, width: null, height: null, rgbLength: null, decodedRgbSha256: null, decodedRepresentation: null, ms: null, comparisons: null, maxRssKiB: null, rssBeforeBytes: null, rssAfterBytes: null };
  if (sha256(bytes) !== job.expectedSha256) return { ...base, reason: 'artifact_hash_mismatch' };
  const rssBeforeBytes = process.memoryUsage().rss;
  let decoded = null;
  let failure = null;
  const t0 = performance.now();
  try {
    decoded = decode(bytes, { ...DECODE_OPTIONS });
  } catch (error) {
    failure = error;
  }
  const ms = performance.now() - t0;
  const mem = memorySnapshot();
  const measured = { ms, maxRssKiB: mem.maxRssKiB, rssBeforeBytes, rssAfterBytes: mem.rssBytes };
  if (failure || !decoded) return { ...base, ...measured, status: 'DECODE_ERROR', reason: sanitizeError(failure ?? new Error('no_output')) };
  const cmp = compareDecoded(decoded, job.comparisons);
  return {
    ...base, ...measured, status: cmp.status, width: decoded.width, height: decoded.height, rgbLength: decoded.data.length,
    decodedRgbSha256: sha256(toBuffer(decoded.data)), decodedRepresentation: 'RGB8 interleaved row-major (jpeg-js decode formatAsRGBA:false)', comparisons: cmp.comparisons,
  };
}

/** @param {any} job @param {(message: any) => Promise<void>} send */
export async function runJob(job, send) {
  if (job?.mode === 'encode') return runEncode(job, send);
  if (job?.mode === 'validate') return runValidate(job);
  if (job?.mode === 'redecode') return runRedecode(job);
  throw new Error('unknown_mode');
}

/** @param {string} metaUrl @returns {boolean} */
export function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  const a = path.resolve(process.argv[1]);
  const b = fileURLToPath(metaUrl);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isDirectRun(import.meta.url) && typeof process.send === 'function') {
  /** @param {any} message @returns {Promise<void>} */
  const send = (message) => new Promise((resolve) => {
    process.send?.(message, undefined, undefined, () => resolve(undefined));
  });
  let started = false;
  process.on('disconnect', () => process.exit(0));
  process.on('message', async (/** @type {any} */ message) => {
    if (message?.type === 'start' && !started) {
      started = true;
      let reply;
      try {
        reply = { type: 'result', ok: true, result: await runJob(message.job, send) };
      } catch (error) {
        reply = { type: 'result', ok: false, error: sanitizeError(error) };
      }
      await send(reply);
    } else if (message?.type === 'ack') {
      process.disconnect();
    }
  });
  void send({ type: 'ready' });
}
