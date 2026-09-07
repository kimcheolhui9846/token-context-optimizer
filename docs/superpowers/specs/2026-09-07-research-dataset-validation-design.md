# Research Dataset Validation Design

Implement the next milestone of the reviewed layered-adaptation protocol: a local,
read-only validator for a versioned JSON dataset. It validates metadata and declared
split boundaries, not semantic truth, executable checks, or experiment readiness.

## Contract

Manifest: `schemaVersion: 1`, `datasetId`, nonempty `records`. Each record has `id`,
`familyId`, `split` (train/development/test), `language` (en/ko), `category`
(numeric/negation/actor_action/causal/temporal/exact), `source` (text, sha256,
provenance, license), `question`, `answerKey`, `requiredFacts`,
`prohibitedContradictions`, `acceptableParaphrases`, and `rubric`.

IDs use lowercase ASCII letters/digits with dots, underscores and hyphens. All text
fields are nonblank. Fact and contradiction lists are nonempty; paraphrases may be
empty. Semantic rubrics have `kind: semantic` and instructions; exact rubrics have
`kind: exact`, instructions and a nonblank `hiddenCheckId` (reference only, never run).
Only exact records accept an exact rubric. Unknown properties are rejected.

Source SHA-256 is calculated on exact UTF-8 source text. Duplicate detection separately
normalizes NFC and CRLF/CR line endings to LF; it does not collapse code whitespace.
Record IDs are globally unique; one family belongs to one split; the same normalized
source cannot be relabeled as a different family even within one split. Translations
and paraphrases must be assigned the same family by dataset authors; automatic semantic
near-duplicate detection is outside this version.

Return JSON `{ valid, issues }` with stable diagnostic codes and field paths, without
echoing source, answers, unknown property names or identifiers. CLI takes exactly one
JSON file path and exits 0 only for a valid manifest, otherwise 1 (including read/parse
errors). Reuse the existing duplicate-key-rejecting JSON parser, including its
1,048,576-character and 128-level nesting limits. No uploads, model calls, scoring or writes.

## Implementation Boundaries

Use existing Zod v4 and TypeScript/Vitest. Keep research logic in `src/research/` and
dedicated tests in `tests/research-dataset.test.ts`. Add `validate:dataset` after build.
The CLI lives in `scripts/validate-dataset.mjs` beside the shared JSON parser and loads
the compiled validator; tests bundle current source to avoid stale build results.
Do not wire research data or answer keys into the distributable MCP server.
Publish a small synthetic example clearly labeled as a format demo, not the 120-family
pilot, and document manual leakage and scoring review requirements.

## Acceptance

TDD covers valid semantic/exact records, malformed and unknown fields, blank metadata,
hash mismatches, duplicate IDs, split leakage, normalized duplicate sources, valid
same-family variants, CLI success/error exit codes and non-disclosure. Targeted checks
precede the full project gate and independent test/code review. Use a stacked PR against
`feature/semantic-degradation-fixtures` while PR #6 remains unmerged.
