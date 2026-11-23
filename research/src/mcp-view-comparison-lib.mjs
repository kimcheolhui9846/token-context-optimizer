// Product MCP view comparison: pure rules shared by the preparer, runner, scorer and tests.
// Protocol: research/plans/2026-11-23-mcp-view-comparison-protocol.md. No file names of scoring inputs live here.
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { inflateSync } from "node:zlib";

export const BASE_COMMIT = "41fc769dd5879aa10acb59153d98865b6a026200";
export const R09_RAW_BLOB = "876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318";
export const BUNDLE_BLOB = "5709a184c3e99b5e6ddc642b2f5dc736924d3578";
export const REPS = ["original", "rgb"];
export const PROFILES = ["strict", "tolerant"];
export const VIEWS = ["original", "overview", "region"];
export const OVERVIEW_MAX_SIDE = 512;
export const GEOMETRY = ["complete", "partial", "not_evaluable"];
export const EVIDENCE_FILES = ["raw.jsonl", "cells.jsonl", "input-check.json"];
export const IMAGE_COUNT = 48;
export const RETURNED_KINDS = ["original_verified", "original_unverified", "overview_jpeg", "crop_jpeg", "none"];

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ---------------------------------------------------------------- PNG (independent of Pillow and sharp)
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Chunk list [{ type, length, data }] in file order. Throws png_signature or png_truncated. */
export function pngChunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("png_signature");
  const out = [];
  let at = 8;
  while (at < buf.length) {
    if (at + 12 > buf.length) throw new Error("png_truncated");
    const length = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    if (at + 12 + length > buf.length) throw new Error("png_truncated");
    out.push({ type, length, data: buf.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === "IEND") break;
  }
  return out;
}

export function pngIhdr(buf) {
  const ihdr = pngChunks(buf)[0];
  if (!ihdr || ihdr.type !== "IHDR" || ihdr.length !== 13) throw new Error("png_ihdr");
  const d = ihdr.data;
  return { width: d.readUInt32BE(0), height: d.readUInt32BE(4), bitDepth: d[8], colorType: d[9], interlace: d[12] };
}

/** Decodes 8-bit, non-interlaced gray (type 0) or RGB (type 2) PNG. Returns { width, height, channels, data }. */
export function decodePng8(buf) {
  const h = pngIhdr(buf);
  const channels = h.colorType === 0 ? 1 : h.colorType === 2 ? 3 : 0;
  if (h.bitDepth !== 8 || !channels || h.interlace !== 0) throw new Error("png_unsupported");
  const idat = Buffer.concat(pngChunks(buf).filter((c) => c.type === "IDAT").map((c) => c.data));
  const raw = inflateSync(idat);
  const stride = h.width * channels;
  if (raw.length !== h.height * (stride + 1)) throw new Error("png_size");
  const data = Buffer.alloc(h.height * stride);
  for (let y = 0; y < h.height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[dst + x - channels] : 0;
      const b = y > 0 ? data[dst - stride + x] : 0;
      const c = x >= channels && y > 0 ? data[dst - stride + x - channels] : 0;
      let pred;
      if (f === 0) pred = 0;
      else if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else throw new Error("png_filter");
      data[dst + x] = (raw[src + x] + pred) & 255;
    }
  }
  return { width: h.width, height: h.height, channels, data };
}

/** Every RGB channel equals the gray plane, pixel by pixel. */
export function compareGrayRgb(grayBuf, rgbBuf) {
  const g = decodePng8(grayBuf);
  const c = decodePng8(rgbBuf);
  if (g.channels !== 1) return { ok: false, code: "not_gray8", mismatchedPixels: null };
  if (c.channels !== 3) return { ok: false, code: "not_rgb8", mismatchedPixels: null };
  if (g.width !== c.width || g.height !== c.height) return { ok: false, code: "dims_mismatch", mismatchedPixels: null };
  let bad = 0;
  for (let i = 0; i < g.width * g.height; i++) {
    const v = g.data[i];
    if (c.data[3 * i] !== v || c.data[3 * i + 1] !== v || c.data[3 * i + 2] !== v) bad++;
  }
  return bad ? { ok: false, code: "pixel_mismatch", mismatchedPixels: bad } : { ok: true, code: null, mismatchedPixels: 0 };
}

// ---------------------------------------------------------------- geometry (original source pixels, half-open)
export function overviewSize(width, height, maxSide = OVERVIEW_MAX_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const side = (s) => Math.max(1, Math.floor((s * maxSide) / longest + 0.5));
  return { width: side(width), height: side(height) };
}

export const regionRect = (r) => [r.x, r.y, r.x + r.width, r.y + r.height];
export const containsRect = (win, rect) => rect[0] >= win[0] && rect[1] >= win[1] && rect[2] <= win[2] && rect[3] <= win[3];
const validRect = (r, page) => Array.isArray(r) && r.length === 4 && r.every(Number.isInteger) && r[0] >= 0 && r[1] >= 0 && r[2] > r[0] && r[3] > r[1] && r[2] <= page.width && r[3] <= page.height;

/** complete | partial | not_evaluable for one row. Only verified originals, overviews and crops have a region. */
export function judgeGeometry(row, goldRects, page) {
  const kind = row.returned?.kind;
  const region = row.returned?.region;
  if (row.outcome !== "ok" || !["original_verified", "overview_jpeg", "crop_jpeg"].includes(kind) || !validRect(region, page)) return { geometry: "not_evaluable", missing: null };
  const missing = goldRects.filter((g) => !containsRect(region, g)).length;
  return { geometry: missing ? "partial" : "complete", missing };
}

// ---------------------------------------------------------------- inputs and assignment
/** Allow-listed projection of the R09 selector record: id, matched, band. */
export function projectR09Raw(text) {
  return text.split("\n").filter(Boolean).map((l) => {
    const r = JSON.parse(l);
    if (r.status !== "ok") throw new Error(`r09_status ${r.id}: ${r.status}`);
    return { id: r.id, matched: r.matched === true, band: r.band ?? null };
  });
}

const legalBand = (b, p) => b && typeof b === "object" && [b.left, b.top, b.width, b.height].every(Number.isInteger) && b.left >= 0 && b.top >= 0 && b.width > 0 && b.height > 0 && b.left + b.width <= p.width && b.top + b.height <= p.height;

/** Checks the projection covers exactly ids, once each, with a legal band iff matched. Returns Map id -> { matched, band }. */
export function validateProjection(ids, pages, projection) {
  const want = new Set(ids);
  const seen = new Map();
  for (const p of projection) {
    if (!want.has(p.id)) throw new Error(`unexpected id ${p.id}`);
    if (seen.has(p.id)) throw new Error(`duplicate id ${p.id}`);
    if (p.matched && !legalBand(p.band, pages[p.id])) throw new Error(`illegal band ${p.id}`);
    if (!p.matched && p.band !== null) throw new Error(`band without match ${p.id}`);
    seen.set(p.id, { matched: p.matched, band: p.band });
  }
  const missing = ids.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`missing ids ${missing.join(",")}`);
  return seen;
}

/** Every pair has exactly one en and one ko image with the same anchor and doctype. */
export function checkPairs(images) {
  const pairs = new Map();
  for (const im of images) {
    const p = pairs.get(im.pairId) || [];
    p.push(im);
    pairs.set(im.pairId, p);
  }
  for (const [pid, ims] of pairs) {
    const langs = ims.map((i) => i.lang).sort().join(",");
    if (langs !== "en,ko") throw new Error(`pair ${pid} has ${langs}`);
    if (ims[0].anchor !== ims[1].anchor || ims[0].doctype !== ims[1].doctype) throw new Error(`pair ${pid} differs in anchor or doctype`);
    for (const im of ims) if (im.id !== `${pid}-${im.lang}`) throw new Error(`pair ${pid} id ${im.id}`);
  }
  return pairs.size;
}

export const keyOf = (rep, profile, view, id) => `${rep}|${profile}|${view}|${id}`;
export const cellOf = (rep, profile, view) => `${rep}|${profile}|${view}`;
export const CELLS = REPS.flatMap((rep) => PROFILES.flatMap((profile) => VIEWS.map((view) => ({ rep, profile, view }))));

export function buildKeys(ids) {
  return CELLS.flatMap(({ rep, profile, view }) => ids.map((id) => keyOf(rep, profile, view, id)));
}

export function checkKeys(keys, ids) {
  const want = new Set(buildKeys(ids));
  const seen = new Set();
  for (const k of keys) {
    if (!want.has(k)) throw new Error(`unexpected key ${k}`);
    if (seen.has(k)) throw new Error(`duplicate key ${k}`);
    seen.add(k);
  }
  const missing = [...want].filter((k) => !seen.has(k));
  if (missing.length) throw new Error(`missing keys ${missing.length}: ${missing.slice(0, 3).join(",")}`);
  return seen.size;
}

/** Fixed denominator: exactly IMAGE_COUNT ids and every one of their keys, once. */
export function checkDenominator(keys, ids) {
  if (ids.length !== IMAGE_COUNT || new Set(ids).size !== IMAGE_COUNT) throw new Error(`expected ${IMAGE_COUNT} ids, got ${ids.length}`);
  return checkKeys(keys, ids);
}

const FORBIDDEN = /(gold|answer|score|render|design)/i;
export function assertInputPath(p) {
  if (FORBIDDEN.test(String(p))) throw new Error(`forbidden input path: ${p}`);
  return p;
}

// ---------------------------------------------------------------- original reference reader
const outside = (rel) => rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);

/**
 * Opens the source path an MCP response returned and checks it against a separately given expected SHA-256.
 * Inputs are only the response, the expected hash and the allowed root; no manifest path. Reads fresh bytes every call.
 */
export async function verifyOriginalRef({ response, expectedSha, allowedRoot }) {
  const fail = (code, extra = {}) => ({ status: "failed", code, sha: null, fileReads: 0, ...extra });
  const src = response?.source;
  if (response?.status !== "original" || response?.fullFrame !== true || src?.format !== "png" || src?.mimeType !== "image/png") return fail("kind_invalid");
  if (typeof src.path !== "string" || !src.path) return fail("ref_missing");
  let real;
  let rootReal;
  try {
    rootReal = await realpath(allowedRoot);
  } catch {
    return fail("root_unreadable");
  }
  try {
    real = await realpath(src.path);
  } catch {
    const rel = relative(rootReal, src.path);
    return fail(outside(rel) ? "ref_outside_root" : "ref_unreadable");
  }
  const rel = relative(rootReal, real);
  if (!rel || outside(rel)) return fail("ref_outside_root");
  try {
    if (!(await lstat(real)).isFile()) return fail("ref_unreadable");
  } catch {
    return fail("ref_unreadable");
  }
  let bytes;
  try {
    bytes = await readFile(real);
  } catch {
    return fail("ref_unreadable", { fileReads: 1 });
  }
  return sha256(bytes) === expectedSha ? { status: "ok", code: null, sha: "match", fileReads: 1 } : { status: "failed", code: "sha_mismatch", sha: "mismatch", fileReads: 1 };
}

// ---------------------------------------------------------------- aggregation (deterministic key order)
const COUNT_KEYS = ["toolCalls", "toolErrors", "fileReads", "plannedOriginalRequests", "fallbackOriginalRequests", "originalRefsRead"];
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** rows carry geometry (from the scorer). Each cell keeps all its rows; failures count as failures. */
export function aggregate(rows) {
  const cells = {};
  for (const r of rows) {
    const k = cellOf(r.rep, r.profile, r.view);
    const c = (cells[k] ||= {
      n: 0, ok: 0, failed: 0, indexAccepted: 0, failCodes: {}, failStages: {}, returned: Object.fromEntries(RETURNED_KINDS.map((x) => [x, 0])),
      geometry: Object.fromEntries(GEOMETRY.map((g) => [g, 0])), counts: Object.fromEntries(COUNT_KEYS.map((x) => [x, 0])), byLangAnchor: {}, pairs: { both: 0, enOnly: 0, koOnly: 0, neither: 0 }, _pairs: {},
    });
    c.n++;
    if (r.outcome === "ok") c.ok++; else { c.failed++; inc(c.failCodes, r.failCode); inc(c.failStages, r.failStage); }
    if (r.index?.status === "ok") c.indexAccepted++;
    c.returned[r.returned.kind]++;
    c.geometry[r.geometry]++;
    for (const x of COUNT_KEYS) c.counts[x] += r.counts[x];
    const la = (c.byLangAnchor[`${r.lang}|${r.anchor}`] ||= { n: 0, failed: 0, complete: 0, partial: 0, not_evaluable: 0 });
    la.n++;
    if (r.outcome !== "ok") la.failed++;
    la[r.geometry]++;
    (c._pairs[r.pairId] ||= {})[r.lang] = r.geometry === "complete";
  }
  for (const c of Object.values(cells)) {
    for (const p of Object.values(c._pairs)) {
      if (p.en && p.ko) c.pairs.both++; else if (p.en) c.pairs.enOnly++; else if (p.ko) c.pairs.koOnly++; else c.pairs.neither++;
    }
    delete c._pairs;
    c.failCodes = sortObj(c.failCodes);
    c.failStages = sortObj(c.failStages);
    c.byLangAnchor = sortObj(c.byLangAnchor);
  }
  const order = CELLS.map(({ rep, profile, view }) => cellOf(rep, profile, view)).filter((k) => cells[k]);
  return { cells: Object.fromEntries(order.map((k) => [k, cells[k]])) };
}
