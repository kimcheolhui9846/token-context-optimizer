# Token Context Optimizer Design

## Goal

Build a Codex-only plugin that improves token efficiency for local text artifacts without corrupting exact-sensitive data. The v1 product contract is measurable context reduction with source preservation, not guaranteed billing savings.

The image-first research extension registers and inspects PNG/JPEG artifacts with original SHA-256 metadata.
Strict defaults remain `png-rgb8-static-v1` and `jpeg-ycbcr8-baseline-444-v1`; passing `profile: "tolerant"`
to `index_image_artifact` opts into `png-rgb8-tolerant-v1` or `jpeg-ycbcr8-tolerant-v1` for the source format.
`crop_image_artifact` uses a caller-selected rectangle, while `overview_image_artifact` produces a bounded
whole-image preview; neither performs OCR or automatic region selection. See the [image contract](image-artifacts.md)
for supported profiles and crop/overview limits. The image experiments ran on a separate research harness;
see the [research documents index](research/README.md). Format support outside these profiles belongs to a later contract.

## Architecture

The plugin packages one skill and one local STDIO MCP server:

- The skill decides when optimization is safe.
- The MCP server performs deterministic, read-oriented artifact operations.
- The artifact store records UTF-8 source text, SHA-256, and line source maps.
- A separate image store records validated PNG/JPEG metadata and original SHA-256; it retains no pixels.
- The installed plugin launches a checked-in bundled server from `bin/token-context-optimizer.mjs`, so it does not depend on local `dist/` or `node_modules/` being present.

The server exposes:

- `estimate_context`: heuristic text token estimates with low-confidence metadata.
- `classify_context`: `exact`, `semantic`, `visual`, or `unknown` policy classification.
- `index_artifact`: SHA-256 and source-map registration for a local file.
- `query_artifact`: bounded source-backed excerpts.
- `summarize_artifact`: extractive summary only when policy positively classifies the source as semantic.
- `index_image_artifact`: validate supported PNG/JPEG with strict defaults or opt into tolerant validation with `profile: "tolerant"`, and register original metadata without writing the source.
- `inspect_image_artifact`: reauthorize the original path and verify its identity/hash in the current session.
- `crop_image_artifact`: crop a caller-selected region from supported RGB PNG, tolerant fully opaque RGBA PNG, or supported JPEG as a quality-75 JPEG; full-frame requests return the original reference without encoding, including RGBA sources.
- `overview_image_artifact`: encode a whole-image overview of supported RGB PNG, tolerant fully opaque RGBA PNG, or supported JPEG as quality-75 JPEG with `maxSide` default 512 (64–1536), without enlargement, automatic evidence selection, or a readability guarantee.

## Superpowers Integration

The optimizer is a helper for Superpowers workflows, not an orchestration replacement. It should be invoked when those workflows need large external context, especially PDF notes, long logs, and repeated documents.

Integration rules:

- Brainstorming and planning may use indexed source excerpts before requirements are drafted.
- Debugging may use bounded log excerpts, but exact error lines, paths, and stack frames must be preserved.
- All future feature work and bug fixes must follow TDD: write the failing test first, observe the expected RED failure, implement the smallest GREEN change, then refactor only while tests stay green.
- Verification is a separate gate from implementation. Run targeted checks first, then the project full gate before PR handoff.
- Use role-specialized subagents during testing and verification when the surface is available: `test-engineer` or `verifier` for test adequacy and performance risk, `code-reviewer` for code/spec/security, and `architect` for boundary and long-term design review.
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
- Inline text requests larger than the 10 MiB STDIO message limit (see README "Tool Behavior").

## Safety Invariants

Exact content always wins over compression. Code, diffs, paths, hashes, IDs, numbers, tables, secrets, errors, stack traces, commands, and line-sensitive text must not be summarized lossily. Unknown and visual content are not eligible for lossy summaries in v1. If classification is uncertain or checks fail, the workflow returns a fallback reason and leaves source lookup to Codex.

The Korean credential labels are `비밀·번호`, `비번`, `패스·워드`, `인증·키`, `개인·키`, `비밀·키`, `시크릿·키`, `액세스·키`, `api·키`, `복구·코드`, `백업·코드`, `인증·토큰`, `접근·토큰`, `액세스·토큰`, `암호`, `토큰`, and `보안·코드`. Each `·` permits zero or one ASCII space/tab. A label followed by zero through three ASCII stars, optional JavaScript whitespace, and `:`, `=`, or fullwidth colon `：` is exact, even without a value. Only `api` rejects an immediately preceding ASCII letter/digit; Korean and underscore prefixes are allowed. Other Korean labels have no left boundary.

The N-27/K-7/N-30 extension changes the four existing regexes within tuple #0, preserving their flags and left boundaries. English labels also accept fullwidth colon `：`. All four regexes allow zero through three closing ASCII stars between the label and optional JavaScript whitespace before `:`, `=`, or `：`. Opening and closing stars need not match; this is conservative credential protection rather than Markdown parsing. Narrative forms, underscore emphasis, quote/parenthesis forms (N-32), strikethrough, fullwidth equals `＝`, code spans, brackets, plural forms, and new internal hyphen/underscore forms (K-8) remain outside this rule. Existing T2 suffix matches such as `인증_토큰:` still count. Numeric values are protected by the separate numeric rule; unsupported label forms can still be exact or unknown through other rules.

Artifact indexing is limited to configured allowed roots. The server resolves real paths, rejects paths outside those roots, enforces regular-file input, caps file size, and hashes the original byte buffer. Text indexing validates strict UTF-8. Image indexing validates supported PNG/JPEG with strict defaults or opt-in tolerant validation, using bounded PNG inflation and PNG/JPEG structural and decoded-shape checks. Strict and tolerant image paths enforce a 10 MiB encoded-input cap, an 8,192-pixel axis cap, and a 16,777,216-pixel image cap; JPEG decoder allocation accounting is limited to 128 MiB in strict mode and 256 MiB in tolerant mode. These limits do not guarantee an overall process-memory or wall-clock bound.

Allowed roots are supplied through `TCO_ALLOWED_ROOTS`; they are intentionally separate from the plugin installation directory. The server blocks indexing when `TCO_ALLOWED_ROOTS` is unset or empty: text indexing returns `No allowed roots are configured; set TCO_ALLOWED_ROOTS`, while image tools retain their `path_denied` response. When roots are omitted from a direct API call, the current working directory remains the default; callers that need another workspace must configure `allowedRoots` explicitly.

## Measurement

Token estimates are heuristic until actual API usage telemetry is available. Benchmark results must report raw tokens, optimized tokens, exact-gate pass/fail, warnings, and model/profile version where available.
