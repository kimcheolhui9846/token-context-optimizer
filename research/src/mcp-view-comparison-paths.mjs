// One row of the product MCP view comparison: index -> view path, with provenance, decode and reference checks.
// Protocol section 6. A failed step ends the row; later steps stay not_called. No retries.
// The caller input for the region view is only { matched, band } from the R09 projection.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { OVERVIEW_MAX_SIDE, overviewSize, regionRect, verifyOriginalRef } from "./mcp-view-comparison-lib.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");

async function decodeJpeg(image) {
  if (!image || image.mimeType !== "image/jpeg" || typeof image.data !== "string") return { decode: "failed", bytes: null };
  const bytes = Buffer.from(image.data, "base64");
  try {
    const { info } = await sharp(bytes, { failOn: "error" }).raw().toBuffer({ resolveWithObject: true });
    const meta = await sharp(bytes).metadata();
    if (meta.format !== "jpeg") return { decode: "failed", bytes };
    return { decode: "ok", bytes, width: info.width, height: info.height };
  } catch {
    return { decode: "failed", bytes };
  }
}

/** A row with every step not_called; filled in by runRow or kept as is for an initialize failure. */
function emptyRow(view, caller) {
  return {
    caller: view === "region" ? { matched: caller.matched, band: caller.band } : null,
    steps: [],
    index: { status: "not_called", code: null, validationProfile: null, ignoredChunks: null, width: null, height: null, sourceSha: null },
    overview: { status: "not_called", code: null, width: null, height: null, expectedWidth: null, expectedHeight: null, decode: null, decodedWidth: null, decodedHeight: null, imageSha: null, sourceSha: null },
    crop: { status: "not_called", code: null, purpose: null, requested: null, kind: null, fullFrame: null, region: null, decode: null, decodedWidth: null, decodedHeight: null, imageSha: null, sourceSha: null },
    originalRead: { status: "not_called", purpose: null, code: null, sha: null },
    returned: { kind: "none", region: null },
    counts: { toolCalls: 0, toolErrors: 0, fileReads: 0, plannedOriginalRequests: 0, fallbackOriginalRequests: 0, originalRefsRead: 0 },
    outcome: "ok", failStage: null, failCode: null,
  };
}

/** Row for a cell whose server failed to initialize: no tool call was sent, so no step and zero counts. */
export function initFailedRow({ view, caller }) {
  return { ...emptyRow(view, caller), outcome: "failed", failStage: "initialize", failCode: "initialize_failed" };
}

export async function runRow({ client, view, profile, image, allowedRoot, caller }) {
  const row = emptyRow(view, caller);
  const fail = (stage, code) => { row.outcome = "failed"; row.failStage = stage; row.failCode = code; return row; };
  const call = async (tool, args) => {
    const r = await client.callTool(tool, args);
    row.counts.toolCalls++;
    if (!r.ok) row.counts.toolErrors++;
    row.steps.push({ seq: row.steps.length + 1, tool, status: r.ok ? "ok" : "error", code: r.ok ? null : r.code });
    return r;
  };
  const srcSha = (s) => (s?.sha256 === image.expectedSha ? "match" : "mismatch");
  const page = image.page;

  // 1. index
  const ix = await call("index_image_artifact", { path: image.file, profile });
  if (!ix.ok) { row.index = { ...row.index, status: "error", code: ix.code }; return fail("index", ix.code); }
  const s = ix.structured;
  row.index = { status: "ok", code: null, validationProfile: s?.validationProfile ?? null, ignoredChunks: s?.ignoredChunks ?? null, width: s?.width ?? null, height: s?.height ?? null, sourceSha: srcSha(s) };
  if (row.index.sourceSha !== "match") return fail("index", "source_sha_mismatch");
  if (s.width !== page.width || s.height !== page.height) return fail("index", "source_dims_mismatch");
  const artifactId = s.artifactId;

  // 2. overview (overview and region views)
  if (view === "overview" || view === "region") {
    const want = overviewSize(page.width, page.height, OVERVIEW_MAX_SIDE);
    const ov = await call("overview_image_artifact", { artifactId, maxSide: OVERVIEW_MAX_SIDE });
    row.overview.expectedWidth = want.width;
    row.overview.expectedHeight = want.height;
    if (!ov.ok) { row.overview = { ...row.overview, status: "error", code: ov.code }; return fail("overview", ov.code); }
    const out = ov.structured?.output;
    const d = await decodeJpeg(ov.image);
    row.overview = {
      ...row.overview, status: "ok", width: out?.width ?? null, height: out?.height ?? null, decode: d.decode, decodedWidth: d.width ?? null, decodedHeight: d.height ?? null,
      imageSha: d.bytes && sha(d.bytes) === out?.sha256 ? "match" : "mismatch", sourceSha: srcSha(ov.structured?.source),
    };
    if (row.overview.sourceSha !== "match") return fail("overview", "source_sha_mismatch");
    if (row.overview.imageSha !== "match") return fail("overview", "overview_image_sha_mismatch");
    if (d.decode !== "ok") return fail("overview", "overview_decode_failed");
    if (d.width !== out.width || d.height !== out.height || out.width !== want.width || out.height !== want.height) return fail("overview", "overview_size_mismatch");
    if (view === "overview") {
      row.returned = { kind: "overview_jpeg", region: [0, 0, page.width, page.height] };
      return row;
    }
  }

  // 3. crop: planned original (original view), selector region or fallback original (region view)
  const full = { x: 0, y: 0, width: page.width, height: page.height };
  let purpose;
  let requested;
  if (view === "original") { purpose = "planned_original"; requested = full; row.counts.plannedOriginalRequests++; }
  else if (caller.matched) { purpose = "selector_region"; requested = { x: caller.band.left, y: caller.band.top, width: caller.band.width, height: caller.band.height }; }
  else { purpose = "fallback_original"; requested = full; row.counts.fallbackOriginalRequests++; }
  row.crop.purpose = purpose;
  row.crop.requested = requested;
  const cr = await call("crop_image_artifact", { artifactId, region: requested });
  if (!cr.ok) { row.crop = { ...row.crop, status: "error", code: cr.code }; return fail("crop", cr.code); }
  const c = cr.structured;
  const rect = c?.region ? regionRect(c.region) : null;
  row.crop = { ...row.crop, status: "ok", kind: c?.status ?? null, fullFrame: c?.fullFrame ?? null, region: rect, sourceSha: srcSha(c?.source) };
  if (row.crop.sourceSha !== "match") return fail("crop", "source_sha_mismatch");
  if (!rect || rect.join() !== regionRect(requested).join()) return fail("crop", "crop_region_mismatch");

  if (c.status === "original") {
    row.returned = { kind: "original_unverified", region: rect };
    const v = await verifyOriginalRef({ response: c, expectedSha: image.expectedSha, allowedRoot });
    row.counts.fileReads += v.fileReads;
    row.originalRead = { status: v.status, purpose, code: v.code, sha: v.sha };
    if (v.status !== "ok") return fail("originalRead", v.code);
    row.counts.originalRefsRead++;
    row.returned = { kind: "original_verified", region: rect };
    return row;
  }
  if (c.status !== "cropped" || c.fullFrame !== false) return fail("crop", "kind_invalid");
  const d = await decodeJpeg(cr.image);
  row.crop = { ...row.crop, decode: d.decode, decodedWidth: d.width ?? null, decodedHeight: d.height ?? null, imageSha: d.bytes && sha(d.bytes) === c.output?.sha256 ? "match" : "mismatch" };
  if (row.crop.imageSha !== "match") return fail("crop", "crop_image_sha_mismatch");
  if (d.decode !== "ok") return fail("crop", "crop_decode_failed");
  if (d.width !== requested.width || d.height !== requested.height || c.output.width !== requested.width || c.output.height !== requested.height) return fail("crop", "crop_size_mismatch");
  row.returned = { kind: "crop_jpeg", region: rect };
  return row;
}
