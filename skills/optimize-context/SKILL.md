---
name: optimize-context
description: Use for source-backed excerpts from large local text artifacts or for validating and tracking supported local PNG originals through MCP.
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

## PNG Input Workflow

For a local image, use `index_image_artifact({path})` to validate a supported PNG
and record its canonical path, original SHA-256, byte size and dimensions. Use
`inspect_image_artifact({artifactId})` in the same server session to reauthorize
the path and check that the source still matches. Set `TCO_ALLOWED_ROOTS` to the
allowed workspace roots; an empty allowlist denies image access.

The supported profile is static, noninterlaced, 8-bit RGB/RGBA PNG containing only
IHDR, IDAT and IEND chunks. Metadata-bearing PNGs, palette/grayscale/interlaced
PNG, APNG, JPEG and WEBP are unsupported. Limits are 10 MiB encoded, 8192 pixels
per axis and 16,777,216 total pixels. Keep an unsupported original unchanged;
these tools do not convert it automatically.

Image records contain metadata, not pixels or OCR. Indexing does not modify or
back up the original. The record is session-local and inspection fails if the
source changed or became inaccessible. These tools do not resize, crop, select
evidence, estimate image tokens or demonstrate cost savings. For visual analysis,
use an available image-viewing tool on the authorized original.

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
