---
name: optimize-context
description: Use for source-backed excerpts from large local text artifacts or for validating and tracking supported local PNG/JPEG originals through MCP.
---

# Optimize Context

Use this skill before loading large logs, documents, or repeated text into context. The goal is lower successful-task cost, not guaranteed compression.

## Safety Policy

Classify the input first:

- `exact`: code, diffs, paths, hashes, IDs, numbers, tables, secrets, stack traces, errors, commands, and line-sensitive text.
- `semantic`: natural language where extractive summaries are acceptable.
- `visual`: images, screenshots, charts, and layout inspection.

For `exact` content, do not use lossy summaries or text-to-image conversion. Use `index_artifact` and `query_artifact`, cite the source lines, and fail open to the original artifact when unsure.

For `semantic` content, prefer `query_artifact` first. Use `summarize_artifact` only when the answer does not depend on exact wording, identifiers, or numeric values.

## MCP Workflow

1. Use `estimate_context` to check the approximate raw size.
2. Use `classify_context` on representative text before reducing context.
3. Use `index_artifact` for local UTF-8 text files.
4. Use `query_artifact` with a small `maxTokens` budget for task-specific excerpts.
5. Use `summarize_artifact` only for semantic content.

Treat all token estimates as low-confidence planning signals unless backed by actual API usage telemetry.

## PNG and JPEG Input Workflow

For a local image, use `index_image_artifact({path})` to validate a supported PNG or JPEG
and record its canonical path, original SHA-256, byte size and dimensions. Use
`inspect_image_artifact({artifactId})` in the same server session to reauthorize
the path and check that the source still matches. Set `TCO_ALLOWED_ROOTS` to the
allowed workspace roots; an empty allowlist denies image access.

The supported profile is static, noninterlaced, 8-bit RGB/RGBA PNG containing only
IHDR, IDAT and IEND chunks. Metadata-bearing PNGs, palette/grayscale/interlaced
PNG, APNG, and WEBP remain unsupported; JPEG is limited to baseline 4:4:4 JFIF. Limits are 10 MiB encoded, 8192 pixels
per axis and 16,777,216 total pixels. Keep an unsupported original unchanged;
these tools do not convert it automatically.

Image records contain metadata, not pixels or OCR. Indexing does not modify or
back up the original. The record is session-local and inspection fails if the
source changed or became inaccessible. Indexing and inspection do not crop or
resize images. Use `overview_image_artifact({artifactId, maxSide?})` for a
whole-image, product-side orientation overview (default maxSide 512, range
64–1536, never enlarged; invalid maxSide values are rejected, not clamped),
then use `crop_image_artifact` for an explicit,
caller-chosen crop in original-image pixels. The overview uses integer
`area-average-v1`, not the research harness's `sharp`/`lanczos3` resampler; it
does not select evidence, estimate image tokens, or demonstrate cost savings, and
does not guarantee readability of exact values. Supported
overview inputs are RGB PNG, tolerant fully opaque RGBA PNG, and supported JPEG;
strict RGBA and non-opaque tolerant RGBA return `alpha_unsupported`. The crop
tool does not select evidence, generate an overview, estimate image tokens or
demonstrate cost savings. It retains its own 1536-pixel limit, full-frame exception, coordinate rules,
and existing alpha/resize errors. Full-frame crop requests return an original
reference, not image bytes. A 1:1 overview is still q75 re-encoded JPEG, not an
original reference and not a `resize_required` response.

## Compaction Integration

Use these rules when preparing a compaction or summary handoff and when resuming
from one. They complement the existing safety policy and workflow gates; they do
not guarantee recall, accuracy, or cost savings. The Stop Conditions below take
priority when evidence is incomplete.

1. **Index large sources before compaction.** For large local UTF-8 logs/documents,
   use `index_artifact` and load task-specific excerpts. For supported local
   PNG/JPEG sources, use `index_image_artifact` to record the original; image indexing
   returns metadata, not pixels or OCR. Keep the authorized original available. For
   small inputs, follow rule 7.
2. **Carry source references into the handoff.** When the host offers a compaction
   instruction or you write a summary handoff, request a list of artifact IDs, short
   titles, original paths and SHA-256 values; include crop regions when relevant.
   Example: "List the artifact IDs and source references needed to retrieve the
   evidence again." IDs are session-local, not persistent backups. If an ID is
   unavailable, re-index the authorized original and compare its hash with the
   recorded source; treat a changed hash as a new version. Do not assume a particular
   host preserves this list automatically.
3. **Recheck exact values after compaction.** Retrieve the source evidence again
   before answering numbers, codes, identifiers, times or table cells; a compacted
   summary alone is not evidence. Use `query_artifact` for text or read the original
   directly under the Stop Conditions. For images, revalidate with
   `inspect_image_artifact` and view the authorized original or a caller-chosen crop.
   If the source cannot be recovered, state that the value is unverified.
4. **Coordinate supported image-history pruning with compaction.** If the host
   workflow already supports removing prior tool-returned images and that removal is
   authorized, prefer batching it at a compaction point over pruning every turn.
   Retain text references to the original and any crop region; keep source files
   intact. Editing history may reduce prompt-cache reuse, so list-price token
   reductions may not fully translate to billed savings. The batch effect was not
   measured independently; see the [research design and limitations](https://github.com/kimcheolhui9846/token-context-optimizer/blob/49c6cc685c022b9e508d406561878ea732824d62/research/plans/2026-10-16-compact-skill-rules.md).
5. **Verify that the crop shows the field.** A missing field can lead to an incorrect
   answer without an unreadable warning. Use `crop_image_artifact({artifactId,
   region: {x, y, width, height}})` only with a caller-chosen in-bounds rectangle
   in original-image pixels. It does not select evidence or generate an overview,
   and has no overview option. Partial crops support RGB PNG or supported JPEG,
   plus tolerant PNG whose alpha is fully opaque; strict RGBA and non-opaque
   tolerant RGBA return `alpha_unsupported`. Partial crops must be at
   most 1536 pixels per side; full-frame requests return an original reference
   without image bytes. If the requested field is not visible, or the question
   concerns the whole image (largest, count, layout), view an
   `overview_image_artifact` result, an existing overview or the authorized original; an overview may
   still be too small
   to read exact values. See the [image contract](https://github.com/kimcheolhui9846/token-context-optimizer/blob/49c6cc685c022b9e508d406561878ea732824d62/docs/image-artifacts.md#mcp-crop-use) for supported profiles and limits. The overview evidence is exploratory, not a general accuracy guarantee; see the research link in rule 4.
6. **Query with the field and identifier.** Prefer context words such as "posted
   invoice INV-123 batch" to an identifier alone. By default, `query_artifact` returns
   up to five excerpts around positive highest-score ties in file order, within the
   shared token budget. `maxExcerpts` accepts 1–20; uncovered ties appear in
   `moreMatches` as an exact count and up to 20 line numbers. Check all returned
   excerpts for the required field. If it is missing, `fallbackReason` is non-null,
   or a warning is returned, follow the Stop Conditions and read the source directly;
   `moreMatches` line numbers are not the missing evidence. These limits do not
   guarantee all relevant lines are returned.
7. **Read small inputs directly.** Read artifacts directly when they fit comfortably,
   especially in short sessions; report short fresh verification output directly.
   For small `exact` inputs, direct source reading is the exception to the Safety
   Policy's index/query workflow; its prohibition on lossy summaries still applies.
   Tool overhead can outweigh savings, and effects depend on the provider, cache and
   workload. Keep the existing Superpowers verification gates.

## Superpowers Integration

This skill may run inside Superpowers workflows as a context-loading helper. It does not replace their gates.

- During `superpowers:brainstorming` or `superpowers:writing-plans`, use this skill for large source documents, logs, or prior notes before drafting requirements.
- During `superpowers:systematic-debugging`, use `query_artifact` for large logs, but preserve exact error lines and stack frames.
- During `superpowers:test-driven-development`, never summarize tests, diffs, or compiler errors lossily.
- During `superpowers:requesting-code-review`, pass source-backed excerpts plus file paths, not free-form summaries of exact evidence.
- During `superpowers:verification-before-completion`, report fresh command output directly when it is short; index and query only when output is too large to fit usefully.

## Stop Conditions

Stop optimizing and read the source directly when:

- The task needs byte-for-byte content.
- Any warning says lossy compression is blocked.
- The returned excerpt omits a required line, number, identifier, or table cell.
- The optimized path would require more turns than direct source lookup.
