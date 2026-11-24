// Crop padding replay: padding rule and one runner row (protocol research/plans/2026-11-24-crop-padding-replay-protocol.md).
// Reads no scoring input. Reuses the frozen #141 library (blob checked by the runner) for the original reference reader.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { verifyOriginalRef } from "./mcp-view-comparison-lib.mjs";

export const PRODUCT_COMMIT = "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1";
export const BUNDLE_BLOB = "85b804990bc192d32d75560df0567bdf5a876d0b";
export const FROZEN_LIB_BLOB = "b52b38a1adcc1db1f36706291ab94e34f28a38a5";
export const FROZEN_LIB_PATH = "research/src/mcp-view-comparison-lib.mjs";
export const PADDINGS = [0, 4, 8, 16];
export const PROFILE = "tolerant";
export const EVIDENCE_FILES = ["raw.jsonl", "conditions.jsonl", "input-check.json"];
export const RETURNED_KINDS = ["crop_jpeg", "original_verified", "original_unverified", "none"];

export const keyOf = (p, id) => `p${p}|${id}`;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const isInt = Number.isInteger;

/**
 * Request for one (caller, p). Half-open source pixels; matched bands grow by p on every side and are clipped to the
 * page; unmatched rows always ask for the whole page. Throws on an illegal band or padding.
 */
export function padRequest(caller, page, p) {
  if (!isInt(p) || p < 0) throw new Error(`illegal padding ${p}`);
  const { width: W, height: H } = page;
  if (!caller.matched) {
    if (caller.band !== null) throw new Error("band without match");
    return { intent: "unmatched", request: { x: 0, y: 0, width: W, height: H }, requestRect: [0, 0, W, H], requestFull: true, pad: null, clip: null };
  }
  const b = caller.band;
  if (!b || ![b.left, b.top, b.width, b.height].every(isInt) || b.left < 0 || b.top < 0 || b.width <= 0 || b.height <= 0 || b.left + b.width > W || b.top + b.height > H) throw new Error("illegal band");
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
    crop: { status: "not_called", code: null, productStatus: null, productCode: null, fullFrame: null, region: null, imageItems: null, mime: null, byteLength: null, imageSha: null, decode: null, decodedWidth: null, decodedHeight: null, sourceSha: null },
    originalRead: { status: "not_called", code: null, sha: null },
    returned: { kind: "none", region: null },
    outcome: "ok", failStage: null, failCode: null,
  };
}

/** Row for a condition whose server failed to initialize: nothing was sent. */
export function initFailedRow({ caller, page, p }) {
  return { ...emptyRow(padRequest(caller, page, p)), outcome: "failed", failStage: "initialize", failCode: "initialize_failed" };
}

/**
 * index (tolerant) -> crop(padded request) -> validity checks. client.callTool returns
 * { ok, code, structured, images: [{ mimeType, data }] } with every image item of the raw response.
 */
export async function runCropRow({ client, p, image, caller, allowedRoot }) {
  const page = image.page;
  const req = padRequest(caller, page, p);
  const row = emptyRow(req);
  const fail = (stage, code) => { row.outcome = "failed"; row.failStage = stage; row.failCode = code; return row; };
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
    row.returned = { kind: "original_unverified", region };
    const v = await verifyOriginalRef({ response: c, expectedSha: image.expectedSha, allowedRoot });
    row.originalRead = { status: v.status, code: v.code, sha: v.sha };
    if (v.status !== "ok") { row.returned = { kind: "none", region: null }; return fail("originalRead", v.code); }
    row.returned = { kind: "original_verified", region };
    return row;
  }
  if (!(c.status === "cropped" && c.fullFrame === false)) return fail("crop", "kind_invalid");
  if (images.length !== 1) return fail("crop", "image_count");
  const img = images[0];
  row.crop.mime = img.mimeType ?? null;
  if (img.mimeType !== "image/jpeg" || c.output?.mimeType !== "image/jpeg" || typeof img.data !== "string") return fail("crop", "crop_mime");
  const bytes = Buffer.from(img.data, "base64");
  row.crop.byteLength = bytes.length === c.output.byteLength ? "match" : "mismatch";
  if (row.crop.byteLength !== "match") return fail("crop", "crop_byte_length");
  row.crop.imageSha = sha(bytes) === c.output.sha256 ? "match" : "mismatch";
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
