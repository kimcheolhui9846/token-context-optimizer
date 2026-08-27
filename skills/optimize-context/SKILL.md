---
name: optimize-context
description: Use when Codex needs to reduce token use for large local text artifacts while preserving exact data through source-backed MCP excerpts.
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
