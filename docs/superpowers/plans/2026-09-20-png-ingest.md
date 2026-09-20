# Restricted PNG Ingest Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for this one Task's implementation and review. Parent owns Git, HANDOFF and research-status docs.

**Goal:** Add M1a validated, original-preserving ingest/inspection for canonical static RGB/RGBA PNG fixtures used by the image paper.

**Architecture:** A separate metadata-only image store and two MCP tools. A bounded reader and restrictive PNG preflight run before `fast-png` decoding. Existing text paths, single-file ESM bundle and four-file installer remain intact.

**Tech Stack:** Existing Node >=22 / TypeScript / Vitest / esbuild; pin JavaScript-only `fast-png` 8.0.0. No native binaries or external runtime assets.

## Global constraints and decision evidence

- Approved base: Task19 `990aa9f`; feature `codex/task-20-png-ingest`, stacked Draft PR against `codex/task-19-image-paper-first`. Do not merge either PR or touch dirty Task18.
- Paper priority: this implements only partial M1a, no measured image-model results. JPEG/WEBP/other PNG profiles and all optimization/hosted/video functions remain planned.
- Supported bytes: PNG signature, one IHDR of length13 first, bit depth8, color type2 or6, compression0/filter0/interlace0; only IHDR, contiguous IDAT, final empty IEND accepted. Unknown/ancillary/APNG chunks are unsupported even when otherwise valid PNG. No trailing bytes.
- Limits: encoded10MiB; axis8192; pixels16,777,216. Limits are engineering ceilings, not quality guarantees. No client-controlled MCP overrides.
- Read a regular file only through a bounded read (cap+1), with canonical allowed-root checks and file identity/size rechecks where practical. Empty allowlist denies all. Never write source or reveal raw bytes/ancillary metadata/error paths through failures. Not an adversarial OS filesystem sandbox.
- Validate chunk boundaries/order/CRC across the complete captured buffer. Validate decompression before `fast-png`: concatenate bounded IDAT, `inflateSync` with `maxOutputLength` equal to `(width*channels+1)*height`; require exact output length, row filter0..4 and complete compressed-stream consumption. Reject extra streams or compressed suffixes. Confirm Node's `info`/engine consumption behavior with a real fixture test.
- Then `decode(bytes,{checkCrc:true})`; assert dimensions/channels/bit depth and discard decoded pixels. More than one bounded buffer exists; peak memory exceeds encoded10MiB and may include multiple approximately64MiB buffers. Do not inflate compressed metadata; rejecting all ancillary chunks enforces this boundary.
- Official evidence checked by dependency reviewer: [fast-png package/API](https://github.com/image-js/fast-png), [decoder](https://github.com/image-js/fast-png/blob/main/src/png_decoder.ts), [Node zlib](https://nodejs.org/api/zlib.html), [PNG specification](https://www.w3.org/TR/png-3/). `fast-png` alone has no safe output cap. [Sharp packaging](https://sharp.pixelplumbing.com/install/) would require external native assets, outside this slice.

## Interfaces and ownership

Implementer owns `src/core/image-artifacts.ts`, image types in `src/core/types.ts`, `src/server/index.ts`, `tests/image-artifacts.test.ts`, `scripts/smoke-mcp.mjs`, package manifests/lock and rebuilt `bin/token-context-optimizer.mjs`. May add `tests/image-mcp.test.ts` for real protocol/install coverage and independent test fixtures. Do not rewrite existing text implementation/tests or installer contracts.

Parent owns this plan, root/legacy handoffs, README, skill instructions and research manuscript/protocol implementation-status wording. Share outcomes; do not race on these files.

```ts
interface ImageArtifactRecord {
  artifactId: string;
  path: string;
  sha256: string;
  byteLength: number;
  format: "png";
  mimeType: "image/png";
  width: number;
  height: number;
  channels: 3 | 4;
  bitDepth: 8;
  validationProfile: "png-rgb8-static-v1";
}
```

- `MemoryImageArtifactStore`: metadata only, defensive copies on put/get; no insertion on validation failure. Store remains session-local.
- `indexImageArtifact({path,allowedRoots,store?})`: async validated record, distinct `image_` identity derived from canonical path plus original SHA256. Hash and decode the same captured bytes.
- `inspectImageArtifact({artifactId,allowedRoots,store?})`: async reauthorize recorded path, bounded reread and rehash; reject changed/missing/newly unauthorized source. Indexing is a validated snapshot, not a backup/immutability service.
- MCP `index_image_artifact({path})` and `inspect_image_artifact({artifactId})`: same fields in JSON text and structuredContent with explicit output schema; use `TCO_ALLOWED_ROOTS`, preserve the existing five tools.
- Stable sanitized errors distinguish denied path, nonregular file, encoded-size excess, axis/pixel excess, unsupported image/profile, malformed PNG, unknown ID, source changed and read failure. Document the actual error names chosen. Do not forward dependency/filesystem exception details.

## Work package 1 — RED

- [x] Run baseline targeted existing tests before changes; record result.
- [x] Write real behavior tests before functional implementation. Use at least one independently fixed PNG byte vector with known dimensions/hash, plus controlled chunks built with Node zlib or an independent fixture generator. Do not use fast-png as both sole encoder and decoder oracle.
- [ ] **Recorded deviation:** Observe missing-feature RED; if module absence prevents behavioral assertions, provide only a compiling throwing stub and rerun behavior RED before implementation. Record exact chronology honestly.
- [x] Cover valid RGB and RGBA hashes/original unchanged; stable identity, distinct path identity; defensive store copies; failed indexing leaves store empty.
- [x] Cover deny-all, outside root, traversal/sibling-prefix, directory, missing file and escaping symlink/junction; encoded-size and dimension/pixel rejection before allocation.
- [x] Cover bad signature, CRC, truncated/missing/reordered chunks, broken IDAT/filter, exact inflated-size mismatch, over-expansion, extra/concatenated zlib stream, APNG/ancillary/palette/grayscale/interlace rejection.
- [x] Inspect covers unknown ID, changed source, removed file and allowlist revocation. Never return source pixels/EXIF in metadata.

## Work package 2 — GREEN and packaging

- [x] Install exact `fast-png@8.0.0` without unrelated updates; implement minimum validated reader/preflight/decode/store/API behavior.
- [x] Run the new targeted suite and existing core tests, then typecheck/build.
- [x] Add MCP smoke through the actual bundle and a temporary installed layout containing only the four runtime files. Ensure no nearby node_modules fallback, verify tool schemas/structured JSON, PNG index/inspect and unchanged source hash, denied roots and explicit errors. Clean only the test-created directory.
- [x] Preserve plugin manifests/installer contract. Rebuilt bundle is an intentional deliverable; no code-generation timestamp or unrelated dependency churn.
- [x] Review follow-up: preserve complete LICENSE notices for the three new bundled packages in a generated bundle banner (`scripts/build-bundle.mjs` plus focused packaging assertion); preserve the shebang and four-file install layout.

The compiling-stub behavioral RED step above was not performed in the first pass. Later license/store/structure regressions supplied separate observed RED/GREEN evidence; this does not retroactively satisfy that step.

## Work package 3 — evidence and release gate

- [x] Parent updates public capability statements: supported restricted profile vs deferred formats, limits/peak-memory/canonical-source caveats, usage and error contract. Mark partial M1a implemented, leave all later research work and empirical results planned.
- [x] Independent Astra review actual diff/tests/docs and resolve blocker/major within scope. External providers attempted separately with privacy/model/quota restrictions; missing external review is DEGRADED, not a substitute success.
- [x] Targeted then full `npm.cmd test`, build, typecheck, smoke:mcp, validate:plugin, benchmark and diff/document checks. No image benchmark claims from existing text benchmark.
- [x] Commit scoped files, push, create one Draft PR against approved Task19 branch. Run project gate again after PR, record exact results, verify latest commit/PR and Astra final verdict. Stop for user approval before the next Task.
