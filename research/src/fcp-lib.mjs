// Fresh crop padding (FCP): padding rule, one product row, code-state check. Reads no scoring input.
// Protocol: research/plans/2026-11-24-fresh-crop-padding-protocol.md (sections 6.2-6.3).
// Adapted from #144 research/src/crop-padding-replay-lib.mjs (read-only reference, not merged): same padding rule and
// response checks; adds selector technical-error rows and keeps JPEG hash, byte count and decoded size per row.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { verifyOriginalRef } from "./mcp-view-comparison-lib.mjs";

export const PRODUCT_COMMIT = "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1";
export const BUNDLE_BLOB = "85b804990bc192d32d75560df0567bdf5a876d0b";
export const SELECTOR_BLOB = "b3b4965b2d330907c0143fe178013aace1be8372";
export const OCR_SHA256 = "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";
export const PADDINGS = [0, 4];
export const PROFILE = "tolerant";
export const EXPECTED_PROFILE = "png-gray8-tolerant-v1";
export const SELECTOR_TIMEOUT_MS = 180000;
export const IMAGE_COUNT = 48;
// Modules each measurement process loads from research/src (checked against HEAD before measuring).
export const COLLECT_CODE_FILES = ["fcp-collect.mjs", "fcp-inputs.mjs", "fcp-lib.mjs", "selector.mjs", "env.mjs", "mcp-view-comparison-lib.mjs"];
export const RUN_CODE_FILES = ["fcp-run.mjs", "fcp-inputs.mjs", "fcp-lib.mjs", "fcp-client.mjs", "mcp-view-comparison-lib.mjs", "mcp-view-comparison-client.mjs"];
export const RUN_EVIDENCE_FILES = ["caller.jsonl", "raw.jsonl", "conditions.jsonl", "input-check.json", "guard-summary.json"];
export const RETURNED_KINDS = ["crop_jpeg", "original_verified", "none"];
// Selector input folder: exactly these entries (protocol section 5).
export const SELECTOR_INPUT_FILES = ["images", "index.json", "questions.json"];

export const keyOf = (p, id) => `p${p}|${id}`;
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const isInt = Number.isInteger;

/** True when band is integer, positive and inside the page (half-open). */
export const validBand = (b, w, h) => !!b && [b.left, b.top, b.width, b.height].every(isInt) && b.width > 0 && b.height > 0 && b.left >= 0 && b.top >= 0 && b.left + b.width <= w && b.top + b.height <= h;

/**
 * State of the given files of directory `dir` against HEAD (from #144 PM fix): per file the HEAD blob, the working-copy
 * blob and porcelain status. clean only when every file is tracked, unchanged and has no status.
 */
export function runCodeState(dir, files) {
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const commit = git("rev-parse", "HEAD").trim();
  const prefix = git("rev-parse", "--show-prefix").trim();
  const out = {};
  for (const f of files.slice().sort()) {
    let head = null;
    try { head = git("rev-parse", "--verify", "--quiet", `HEAD:${prefix}${f}`).trim() || null; } catch { head = null; }
    const work = git("hash-object", join(dir, f)).trim();
    const status = git("status", "--porcelain", "--untracked-files=all", "--", f).replace(/\n$/, "");
    out[f] = { head, work, status };
  }
  const clean = Object.values(out).every((x) => x.head !== null && x.work === x.head && x.status === "");
  return { commit, prefix, clean, files: out };
}

/**
 * Request for one (caller, p). caller = { status, matched, band } from caller.jsonl.
 * - status !== "ok": selector technical error, no request.
 * - unmatched: whole page.
 * - matched: band grown by p on every side, clipped to the page; pad = actual growth, clip = p - pad.
 */
export function padRequest(caller, page, p) {
  if (!isInt(p) || p < 0) throw new Error(`illegal padding ${p}`);
  const { width: W, height: H } = page;
  if (caller.status !== "ok") return { intent: "caller_error", request: null, requestRect: null, requestFull: null, pad: null, clip: null };
  if (!caller.matched) {
    if (caller.band !== null && caller.band !== undefined) throw new Error("band without match");
    return { intent: "unmatched", request: { x: 0, y: 0, width: W, height: H }, requestRect: [0, 0, W, H], requestFull: true, pad: null, clip: null };
  }
  const b = caller.band;
  if (!validBand(b, W, H)) throw new Error("illegal band");
  const x0 = b.left;
  const y0 = b.top;
  const x1 = b.left + b.width;
  const y1 = b.top + b.height;
  const r = [Math.max(0, x0 - p), Math.max(0, y0 - p), Math.min(W, x1 + p), Math.min(H, y1 + p)];
  const pad = { left: x0 - r[0], top: y0 - r[1], right: r[2] - x1, bottom: r[3] - y1 };
  const clip = { left: p - pad.left, top: p - pad.top, right: p - pad.right, bottom: p - pad.bottom };
  return {
    intent: "matched", request: { x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1] }, requestRect: r,
    requestFull: r[0] === 0 && r[1] === 0 && r[2] === W && r[3] === H, pad, clip,
  };
}

async function decodeJpeg(bytes) {
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.format !== "jpeg") return { decode: "failed" };
    const { info } = await sharp(bytes, { failOn: "error" }).raw().toBuffer({ resolveWithObject: true });
    return { decode: "ok", width: info.width, height: info.height };
  } catch {
    return { decode: "failed" };
  }
}

function emptyRow(req) {
  return {
    ...req,
    steps: [],
    index: { status: "not_called", code: null, validationProfile: null, width: null, height: null, sourceSha: null },
    crop: { status: "not_called", code: null, productStatus: null, productCode: null, fullFrame: null, region: null, imageItems: null, mime: null, byteLength: null, imageSha: null, decode: null, decodedWidth: null, decodedHeight: null, sourceSha: null, jpegSha256: null, jpegBytes: null },
    originalRead: { status: "not_called", code: null, sha: null },
    returned: { kind: "none", region: null },
    outcome: "ok", failStage: null, failCode: null,
  };
}

/** Row for a condition whose server failed to initialize: nothing was sent. */
export function initFailedRow({ caller, page, p }) {
  const req = padRequest(caller, page, p);
  if (req.intent === "caller_error") return { ...emptyRow(req), outcome: "failed", failStage: "caller", failCode: "caller_error" };
  return { ...emptyRow(req), outcome: "failed", failStage: "initialize", failCode: "initialize_failed" };
}

/**
 * caller error -> no call. Otherwise index (tolerant) -> crop(padded request) -> validity checks.
 * client.callTool returns { ok, code, structured, images: [{ mimeType, data }] } with every image item of the response.
 */
export async function runCropRow({ client, p, image, caller, allowedRoot }) {
  const page = image.page;
  const req = padRequest(caller, page, p);
  const row = emptyRow(req);
  const fail = (stage, code) => { row.outcome = "failed"; row.failStage = stage; row.failCode = code; return row; };
  if (req.intent === "caller_error") return fail("caller", "caller_error");
  const call = async (tool, args) => {
    const r = await client.callTool(tool, args);
    row.steps.push({ seq: row.steps.length + 1, tool, status: r.ok ? "ok" : "error", code: r.ok ? null : r.code });
    return r;
  };
  const srcSha = (s) => (s?.sha256 === image.expectedSha ? "match" : "mismatch");

  const ix = await call("index_image_artifact", { path: image.file, profile: PROFILE });
  if (!ix.ok) { row.index = { ...row.index, status: "error", code: ix.code }; return fail("index", ix.code); }
  const s = ix.structured;
  row.index = { status: "ok", code: null, validationProfile: s?.validationProfile ?? null, width: s?.width ?? null, height: s?.height ?? null, sourceSha: srcSha(s) };
  if (row.index.sourceSha !== "match") return fail("index", "source_sha_mismatch");
  if (s.width !== page.width || s.height !== page.height) return fail("index", "source_dims_mismatch");
  if (s.validationProfile !== EXPECTED_PROFILE) return fail("index", "validation_profile_mismatch");

  const cr = await call("crop_image_artifact", { artifactId: s.artifactId, region: req.request });
  const c = cr.structured;
  const images = Array.isArray(cr.images) ? cr.images : [];
  row.crop = { ...row.crop, status: cr.ok ? "ok" : "error", code: cr.ok ? null : cr.code, productStatus: c?.status ?? null, productCode: c?.code ?? null, fullFrame: c?.fullFrame ?? null, imageItems: images.length };
  if (!cr.ok) {
    if (c?.status === "rejected" && c?.code === "resize_required") return fail("crop", "limit_exceeded");
    return fail("crop", cr.code);
  }
  const region = c?.region && [c.region.x, c.region.y, c.region.width, c.region.height].every(isInt) ? [c.region.x, c.region.y, c.region.x + c.region.width, c.region.y + c.region.height] : null;
  row.crop.region = region;
  row.crop.sourceSha = srcSha(c?.source);
  if (row.crop.sourceSha !== "match") return fail("crop", "source_sha_mismatch");
  if (!region || region.join() !== req.requestRect.join()) return fail("crop", "crop_region_mismatch");

  if (req.requestFull) {
    if (!(c.status === "original" && c.fullFrame === true && images.length === 0)) return fail("crop", "kind_invalid");
    const v = await verifyOriginalRef({ response: c, expectedSha: image.expectedSha, allowedRoot });
    row.originalRead = { status: v.status, code: v.code, sha: v.sha };
    if (v.status !== "ok") return fail("originalRead", v.code);
    row.returned = { kind: "original_verified", region };
    return row;
  }
  // Partial request: an original answer violates the product contract and is a failure, not a fallback.
  if (!(c.status === "cropped" && c.fullFrame === false)) return fail("crop", "kind_invalid");
  if (images.length !== 1) return fail("crop", "image_count");
  const img = images[0];
  row.crop.mime = img.mimeType ?? null;
  if (img.mimeType !== "image/jpeg" || c.output?.mimeType !== "image/jpeg" || typeof img.data !== "string") return fail("crop", "crop_mime");
  const bytes = Buffer.from(img.data, "base64");
  row.crop.jpegBytes = bytes.length;
  row.crop.jpegSha256 = sha256(bytes);
  row.crop.byteLength = bytes.length === c.output.byteLength ? "match" : "mismatch";
  if (row.crop.byteLength !== "match") return fail("crop", "crop_byte_length");
  row.crop.imageSha = row.crop.jpegSha256 === c.output.sha256 ? "match" : "mismatch";
  if (row.crop.imageSha !== "match") return fail("crop", "crop_image_sha_mismatch");
  const d = await decodeJpeg(bytes);
  row.crop = { ...row.crop, decode: d.decode, decodedWidth: d.width ?? null, decodedHeight: d.height ?? null };
  if (d.decode !== "ok") return fail("crop", "crop_decode_failed");
  const w = req.request.width;
  const h = req.request.height;
  if (d.width !== w || d.height !== h || c.output.width !== w || c.output.height !== h) return fail("crop", "crop_size_mismatch");
  row.returned = { kind: "crop_jpeg", region };
  return row;
}
