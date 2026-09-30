# Restricted JPEG Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** Implement the user-approved Task21 restricted JPEG ingest/inspect contract without changing PNG or original source bytes.

**Architecture:** A separate bounded structure/entropy validator proves exact scan consumption before invoking unmodified jpeg-js 0.4.4. Existing image reader/store remains the only source access path. Correlated PNG/JPEG records flow through the existing MCP tools and standalone bundle.

**Tech Stack:** TypeScript, Node >=22, Vitest, Zod/MCP SDK, esbuild, jpeg-js 0.4.4.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-09-21-jpeg-ingest-design.md` (all profile clauses bind this implementation).
- JPEG profile `jpeg-ycbcr8-baseline-444-v1`: SOF0/8-bit/YCbCr IDs1,2,3/H=V=1; exactly one interleaved SOS, sequential parameters 0/63/0.
- Mandatory first APP0 JFIF1.01 or1.02, length16, zero thumbnail, density unit0/1/2 and positive X/Y. Reject EXIF/ICC/Adobe/COM/other APP and progressive/arithmetic/lossless/grayscale/CMYK/multiscan/DRI/RST.
- DQT8-bit ID0..3/nonzero64 values, DHT DC/AC ID0..1; no duplicate definitions/symbols, all-ones codes or oversubscription. Nonempty incomplete trees allowed; undefined code fails.
- Exact lengths, ordering, references, SOI/EOI/physical EOF; DC<=11; AC size<=10, zero-size symbols only00/F0; exact block/MCU consumption, stuffing and all-ones terminal padding.
- Encoded10MiB, axis8192, pixels16,777,216. Codec options128MiB accounting/16.777216MP/strict/typedRGB; accounting is not RSS.
- Preserve PNG record/errors, source reader/allowlist/races/hash/identity/copies, existing five text tools and two image tools, four runtime files. No writes to source, transforms, paid/model calls, native dependency or video.
- Astra owns plan/review; primary implementation Luna, fallback GPT-5.5 only after actual Luna unavailable. Parent owns HANDOFFs, plan ledger and Git/PR. Worker owns files below, does not commit unless parent requests.
- This is one user-reviewable Task22. Internal steps do not require further approval. Review corrections within this contract are authorized.

### Task 1: Strict JPEG validation, integration and delivery evidence

**Files**
- Create `src/core/jpeg-validation.ts`, `tests/jpeg-validation.test.ts`, `tests/fixtures/jpeg/` positives/provenance and test-only helpers as needed.
- Modify `src/core/image-artifacts.ts`, `src/core/types.ts`, `src/server/index.ts`, `tests/image-artifacts.test.ts`, `tests/image-packaging.test.ts`, `scripts/smoke-mcp.mjs`, `scripts/build-bundle.mjs`, `package.json`, `package-lock.json`, generated `bin/token-context-optimizer.mjs`.
- Worker technical docs: `docs/image-artifacts.md`, README image status, `skills/optimize-context/SKILL.md`, `docs/research/image-first-paper-draft.ko.md`, `docs/research/image-first-evaluation-protocol.md`. Preserve planned transform/effectiveness status.

**Interfaces**
- `validateJpeg(bytes: Buffer): { width: number; height: number; channels: 3 }` in new module.
- Export local `JpegValidationError` with stable code; image dispatcher maps it to existing `ImageValidationError`, avoiding circular imports.
- `ImageArtifactRecord` becomes common identity fields intersected with correlated PNG/JPEG union. JPEG format/mime/channels/profile literals travel together. Existing PNG public shape remains identical.
- `indexImageArtifact` and `inspectImageArtifact` signatures unchanged; JPEG SOI selects JPEG validator, other input retains current PNG/WebP classification.

- [x] **Baseline and fixtures.** Parent observed existing image18PASS/1WindowsFIFOskip and full588PASS/1skip. Worker records own targeted baseline, builds before script typecheck. Independently encode 1x1, odd-size and multi-MCU 4:4:4 fixtures using an available non-jpeg-js encoder; record exact encoder/version/options/SHA. Check fixtures into tests, with reproducible generation instructions. Do not present System.Drawing default4:2:0 as a444 positive.

- [x] **Behavior RED.** Start with actual index API (already compiles), e.g.:

```ts
const before = await readFile(path);
const store = new MemoryImageArtifactStore();
const result = await indexImageArtifact({path, allowedRoots:[root], store});
expect(result).toMatchObject({format:"jpeg", mimeType:"image/jpeg", channels:3,
  bitDepth:8, width:17, height:9, validationProfile:"jpeg-ycbcr8-baseline-444-v1"});
expect(await inspectImageArtifact({artifactId:result.artifactId, allowedRoots:[root], store})).toEqual(result);
expect(await readFile(path)).toEqual(before);
```

Run `npm.cmd test -- --run tests/image-artifacts.test.ts`; record the observed unsupported-format failure before implementation. Missing-module collection errors are not behavioral RED. Additional focused RED cycles precede added behavior.

- [x] **Parser/entropy GREEN in small cycles.** Implement bounds-checked marker reader; validate exact JFIF/frame/table/scan payloads and table references before entropy. Canonical table parsing uses fixed-size arrays/maps bounded by16 code lengths and256symbols; reject all-ones/oversubscribed/duplicate/invalid unused symbols. No pixel-sized coefficient arrays in validator. MCU count and AC cursor rules:

```ts
const mcus = Math.ceil(width / 8) * Math.ceil(height / 8);
// Each MCU consumes blocks for components 1, 2, 3.
// For each block: DC category 0..11 then its magnitude bits.
// AC k starts at1. EOB ends block. ZRL advances16; k==64 valid, k>64 fails.
// Nonzero: k += run; require k<64, consume size bits, then k++.
// After final block: remaining bits of current byte all1; next bytes exactly FFD9/EOF.
```

Confirm semantics from T.81 AnnexB/C/F primary source. Keep helper responsibilities explicit (segments/tables/bitreader/blocks/resource/decode); avoid dense one-line parser branches. Test nonbyte-aligned and byte-aligned scan endings and FF00 handling.

- [x] **Negative matrix RED/GREEN.** Literal expected errors per named mutation: original probe junk beforeEOI, stuffedFF00 beforeEOI, trailingbytes, SOFlength1; absent/duplicate APP0/SOF/SOS, table payload lengths, undefined references, duplicate definitions, DQTzero/precision, DHTID/symbol/tree defects, DC12/AC11/illegalzero-size, invalidrun/ZRL boundary, missing magnitude bits, early marker, non-onepadding. Recognizable unsupported profile→unsupported_jpeg_profile; structural/entropy/decode mismatch→malformed_jpeg. Existing dimension/encoded errors retained. Test supported grouped tables, incomplete Huffman tree, validDC11/AC10 and odd/block boundaries; synthetic bitstreams supplement independent positive fixtures.

- [x] **Resource RED/GREEN and codec.** Pin `jpeg-js@0.4.4` with npm exact version; inspect installed type declarations/source. Derive a preallocation estimate from actual requestMemoryAllocation calls including rounded coefficient grids, table allocations, rounded component planes and two RGB buffers. For jpeg-js 0.4.4 there is no extra block column: B=ceil(w/8)*ceil(h/8), bytes=960*B+6*w*h+256*Q+sum(16+DHT symbol count). Count all defined tables; copied input and JS overhead are outside codec accounting; document formula and hand-calculated boundary assertions. Reject over128MiB before decoder call; no copied large input/pixel buffer in validation. Call:

```ts
decode(bytes, {tolerantDecoding:false,useTArray:true,formatAsRGBA:false,
  maxMemoryUsageInMB:128,maxResolutionInMP:16.777216});
```

Require matching dimensions and `data.length===width*height*3`. Mock codec only for proving no call on resource rejection and injecting exception/wrong output; production API has no test hooks. Assert failed indexing leaves store size unchanged, source hash unchanged, repeated identity and defensive copies. Exercise dimension/byte/resource limits with independently derived expected numbers.

- [x] **MCP/bundle RED/GREEN.** Correlated Zod schema (union compatible with SDK) must reject mixed PNG/JPEG fields. Exercise installed tool list schema, JPEG structured/text outputs, inspect and sanitized isError failures. Keep PNG cases. Preserve four runtime files and all existing notices, add package BSD conditions and decoder Apache2.0 attribution/full text from authoritative source as needed. Test emitted bundle notices and execute standalone smoke under actual Node22, recording version. Do not label Node24 as Node22.

- [x] **Refactor/docs/measure.** Run affected tests after local cleanup. Document exact error precedence for overlapping malformed/unsupported/resource cases; no false claim of full JPEG support. Measure a maximum accepted geometry family and just-overbudget rejection (wall time, maxRSS with runtime/OS, accounting separately); report bounded-input limits and synchronous CPU limitation. Do not describe measured values as portable safety guarantees. Update implementation status in paper/protocol without inventing model results.

- [x] **Review and handoff.** Worker report includes baseline, every observed RED/GREEN command/count, files, formula derivation, fixture provenance, Node22/bundle/license/measurement evidence and unresolved concerns. Parent reviews actual diff, requests external milestone checks and Astra SPEC/QUALITY review, resolves blocker/major findings, then commits/pushes/DraftPR against Task21. Parent reruns targeted/full tests, build/typecheck/smoke:mcp/validate:plugin/benchmark after PR, verifies current PR SHA and final Astra verdict. No merge.

**Commands:** `npm.cmd test -- --run tests/jpeg-validation.test.ts tests/image-artifacts.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts`; `npm.cmd test`; `npm.cmd run build`; `npm.cmd run typecheck`; `npm.cmd run smoke:mcp`; `npm.cmd run validate:plugin`; `npm.cmd run benchmark`; `git diff --check`.

**Acceptance:** all approved profile clauses implemented and behavior-tested; four observed codec gaps closed; original/PNG/text/bundle compatibility proven; realNode22 and resource evidence; no unresolved blocker/major; clean pushed Task branch/DraftPR/latestSHA; honest limitations and complete handoff.
