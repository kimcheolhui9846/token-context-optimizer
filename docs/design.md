# Token Context Optimizer Design

## Goal

Build a Codex-only plugin that improves token efficiency for local text artifacts without corrupting exact-sensitive data. The v1 product contract is measurable context reduction with source preservation, not guaranteed billing savings.

## Architecture

The plugin packages one skill and one local STDIO MCP server:

- The skill decides when optimization is safe.
- The MCP server performs deterministic, read-oriented artifact operations.
- The artifact store records UTF-8 source text, SHA-256, and line source maps.
- The installed plugin launches a checked-in bundled server from `bin/token-context-optimizer.mjs`, so it does not depend on local `dist/` or `node_modules/` being present.

The server exposes:

- `estimate_context`: heuristic text token estimates with low-confidence metadata.
- `classify_context`: `exact`, `semantic`, or `visual` policy classification.
- `index_artifact`: SHA-256 and source-map registration for a local file.
- `query_artifact`: bounded source-backed excerpts.
- `summarize_artifact`: extractive summary only when policy positively classifies the source as semantic.

## Superpowers Integration

The optimizer is a helper for Superpowers workflows, not an orchestration replacement. It should be invoked when those workflows need large external context, especially PDF notes, long logs, and repeated documents.

Integration rules:

- Brainstorming and planning may use indexed source excerpts before requirements are drafted.
- Debugging may use bounded log excerpts, but exact error lines, paths, and stack frames must be preserved.
- TDD and verification gates must receive exact command output when short enough; large output can be indexed and queried with source lines.
- Code review handoffs should include file paths and source-backed excerpts, not lossy summaries of exact implementation evidence.

## v1 Boundaries

Included:

- Codex skill.
- Local TypeScript STDIO MCP server.
- Source-preserving text indexing and retrieval.
- Tests and benchmark harness.

Excluded:

- Hooks.
- Text-to-image compression.
- Semantic cache.
- Remote HTTP MCP.
- Model prompt-cache, reasoning-token, attention, or KV-cache control.
- UI dashboard.

## Safety Invariants

Exact content always wins over compression. Code, diffs, paths, hashes, IDs, numbers, tables, secrets, errors, stack traces, commands, and line-sensitive text must not be summarized lossily. Unknown and visual content are not eligible for lossy summaries in v1. If classification is uncertain or checks fail, the workflow returns a fallback reason and leaves source lookup to Codex.

Artifact indexing is limited to configured allowed roots. The server resolves real paths, rejects paths outside those roots, enforces regular-file input, caps file size, validates strict UTF-8, and hashes the original byte buffer.

Allowed roots are supplied through `TCO_ALLOWED_ROOTS`; they are intentionally separate from the plugin installation directory. When unset, indexing is blocked rather than silently reading outside the configured workspace scope.

## Measurement

Token estimates are heuristic until actual API usage telemetry is available. Benchmark results must report raw tokens, optimized tokens, exact-gate pass/fail, warnings, and model/profile version where available.
