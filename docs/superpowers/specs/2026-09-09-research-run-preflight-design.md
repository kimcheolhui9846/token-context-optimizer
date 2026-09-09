# Offline Research Run Preflight Design

## Status And Scope

The user approved the first slice of the three-PR proposal on 2026-09-09: run
configuration, offline preflight and reproducible scheduling. The user subsequently
approved this written design and implementation on 2026-09-09. Baseline: merged PR
#12, `2cc7ce2`; reviewed design `801c6ca`. Runtime delivery is tracked in the
[implementation plan](../plans/2026-09-09-research-run-preflight.md), on PR #13.

Follow the [experiment protocol](../../research/2026-09-07-layered-adaptation-evaluation-protocol.md#concrete-first-experiment).
The three slices are: (1) this contract and schedule, (2) a separately designed mock
runner with failure/cost accounting, and (3) a separately designed paired analysis.
This first slice does not call a provider, read credentials, upload data, load a
tokenizer, construct arm contexts, generate responses, grade, or calculate intervals.
It needs no GPU and introduces no dependency beyond existing TypeScript/Zod/Node.

## Existing Boundaries

- Reuse `parseResearchDataset` and `fingerprintDataset` from the existing research
  modules; do not change dataset schema v1 or its fingerprint semantics.
- Reuse `auditPilotDataset` for the 120-family, 72/24/24 split and category quotas.
  Separately require exactly one English and one Korean record per family, with a
  shared category and split. IDs and hashes do not establish scientific independence.
- Keep `scoreEvaluation`, exact checks, optimizer and MCP/plugin behavior unchanged.
  Schedule keys remain compatible with the scorer's `taskId`, `arm`, `attempt` tuples.
- Neither the manifest nor the schedule is a model-input or blinded-grading packet.
  Source text, questions, answers, rubrics and grader labels are absent from outputs.

## Configuration Contract

Use a strict, versioned schema and a detached validated snapshot. Reject unknown
fields at every level. Strings must be nonblank and unpadded; identifiers follow the
existing lowercase identifier convention and SHA-256 values are 64 lowercase hex
characters. No environment-derived values, timestamps or implicit model defaults.

Required envelope fields:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Literal `1`. |
| `runId` | Identifier; locally descriptive, not proof of globally unique execution. |
| `datasetSha256` | Must match `fingerprintDataset(dataset)`. |
| `split` | `development` or `test`; never `train`. |
| `arms` | Exact ordered list: `full_source`, `optimized`, `fixed_chunk`, `gold_reference`. |
| `attemptsPerTask` | Literal `3`; a new protocol/version is needed to change it. |
| `scheduleAlgorithm` | Literal `sha256-rank-v1`, defined below. |
| `seed` | Exactly 64 lowercase hex characters, supplied explicitly. |
| `execution` | Complete object below or explicit `null` for an unresolved draft. |
| `evidence` | Complete object below or explicit `null` for an unresolved draft. |

`execution` contains `provider`, `modelSnapshot`, `endpoint`, `tokenizerId`,
`tokenizerVersion`, `priceVersion`, `inputTokenLimit`, `outputTokenLimit`,
`requestTimeoutMs`, `runTimeoutMs`, `spendCapMicrousd`, `concurrency`,
`automaticRetries`, and `decodingSha256`. Provider is an identifier; model, endpoint,
tokenizer and price fields are nonblank strings. Endpoint is a logical API identifier,
not a URL to fetch. Decoding is a hash of an externally archived, reviewed configuration,
not arbitrary executable code or provider parameters interpreted by this tool.

Each execution field may explicitly be `null`; non-null limits and deadlines are
positive safe integers, with `runTimeoutMs >= requestTimeoutMs` when both are present.
The spend cap is a positive safe integer in millionths of USD, not a predicted cost.
Non-null concurrency must be `1` and automatic retries must be `0`. Wrong types,
missing keys or contradictory non-null values are invalid configuration; explicit
nulls are well-formed but unresolved. Never replace nulls with permissive defaults.

`evidence` has these required keys, each either `null` or an object containing only
an identifier `id` and a `sha256`: `accessApproval`, `spendApproval`, `uploadApproval`,
`dataReview`, `modelQualification`, `armPreparation`, `gradingPlan`, `analysisPlan`.
They reference separately retained, redacted artifacts. This tool does not open them,
verify their truth, authenticate a signer, or authorize spending. Approval artifacts
must bind the dataset, model, permitted activity and numeric budget in the later
execution workflow. A reference alone cannot establish that binding.

These records deliberately cannot represent an executable frozen provider request.
Arm preparation, exact input bytes/hashes, billing rates, supported decoding settings,
transport retry settings, rubric freeze and approval authenticity remain later gates.

## Schedule And Fingerprints

Validate configuration and dataset before allocation. Reject a fingerprint mismatch,
an empty selected split, conflicting family categories or more than 100,000 planned
slots. The slot cap is an engineering memory bound, not a research sample target.
Incomplete quotas or missing bilingual partners are preflight blockers, not reasons
to silently remove records. Such valid draft data can still receive a preview schedule.

Define ranking as SHA-256 over UTF-8 `JSON.stringify` of the arrays below. Sort by
lowercase hex digest using code-unit comparison, with identifier comparison as a
deterministic collision tie-breaker. Do not use locale-sensitive sorting or `Math.random`.

1. Rank selected families by `["sha256-rank-v1", seed, "family", familyId]`.
2. Within each family, order tasks by language (`en` then `ko`), then task ID. This
   language order is fixed, not randomized; language-order effects remain a limitation.
3. For each task, visit attempts `1`, `2`, `3`. Rank its four arms by
   `["sha256-rank-v1", seed, "arm", taskId, attempt, arm]`.
4. Emit each slot once with `ordinal` (one-based), `familyId`, `taskId`, `language`,
   `category`, `arm`, and `attempt`. No result status, cost or judgment is fabricated.

This is a versioned pseudorandom ranking schedule, not a security primitive or proof
of statistical balance. Freeze algorithm and seed before observing outcomes; do not
search seeds for favorable results. A changed seed need not produce a different
ordering on every small fixture, but must change the configuration fingerprint.

`configSha256` hashes JSON of the schema-ordered configuration snapshot;
`scheduleSha256` hashes JSON of the ordered slots. `manifestSha256` hashes a fixed-order
object containing `schemaVersion`, `datasetSha256`, `configSha256`, `scheduleSha256`.
Use the existing validated dataset digest; never promise generic canonical JSON.
Object insertion order in caller input must not affect hashes; dataset record order
remains significant under the existing dataset contract. No serialization hooks run.

## Preflight And CLI Output

The pure public boundary `prepareResearchRun(dataset, configuration)` returns exactly
`{ manifest, slots, preflight }`, with fields inserted in that order. `manifest` has
exactly `schemaVersion`, `datasetSha256`, `configSha256`, `scheduleSha256`,
`manifestSha256`, in that order. The last field is the digest of the preceding four
as defined above, not a self-referential hash. `slots` is the ordered array described
above, with each slot's fields inserted in their listed order. No configuration
values, execution metadata, evidence-reference IDs, seed or run ID are returned.
Archive the original configuration separately and match it by `configSha256`.

Validation errors are `Error` instances whose message is exactly one fixed code.
The validation order and codes are: configuration schema (`invalid_configuration`),
dataset parsing (`invalid_dataset`), dataset hash match (`dataset_fingerprint_mismatch`),
all-dataset family category consistency (`family_category_conflict`), selected split
nonempty (`empty_split`), and safe slot count at most 100,000 (`slot_limit_exceeded`).
Stop at the first failing stage. Map existing parser/auditor failures to these codes;
never pass raw parser exceptions through. No file or network access occurs here.

Preflight contains exactly `configurationComplete`, `pilotStructureSatisfied`,
`evidenceReferencesPresent`, `preflightPassed`, `dispatchAllowed`, and `issues`,
in that order. The first flag is true exactly when `execution` and every one of its
fields are non-null. The second is true exactly when the existing auditor returns
`meetsPilotStructure: true` AND every family has exactly one record in each language.
The third is true exactly when `evidence` and all eight references are non-null; it
tests reference presence, not artifact authenticity. `preflightPassed` is the
conjunction of these three flags. `dispatchAllowed` is
always literal `false`, including fully populated synthetic fixtures. Never emit a
global `researchReady` or `authorized` flag. Issues are exactly `{ code, path }`, in
that field order, drawn only from this table:

| Code | Path and emission rule |
| --- | --- |
| `unresolved_execution` | `execution` if the whole object is null; otherwise one `execution.<field>` for each null field using only the 14 fixed field names above. |
| `missing_evidence_reference` | `evidence` if the whole object is null; otherwise one `evidence.<key>` for each null reference using only the eight fixed keys above. |
| `pilot_structure` | `dataset.pilotStructure` once when the existing auditor reports false. |
| `bilingual_pairing` | `dataset.bilingualPairs` once when any family lacks exactly one English and one Korean record. |

Sort issues by code then path using code-unit comparison, deduplicate identical
code/path pairs, and return an empty array when all three flags are true. Do not echo
values, arbitrary unknown keys, family IDs in issue paths or raw parser messages.

Full-pilot structure covers all dataset splits, quotas and exact bilingual pairing,
not merely the selected split. The current 24-record/12-family development seed
therefore yields a valid 288-slot preview with `preflightPassed: false`. Previewing
test records is an offline operation, not authorization to expose a locked test set;
the tool does not substitute for access control or data-governance review.

The proposed `plan:research` CLI accepts exactly two paths: dataset and configuration.
Follow the existing research CLI pattern and duplicate-key rejecting JSON parser;
decode both inputs as fatal UTF-8. It reads only those files and emits JSON to stdout,
with no direct writes, model SDK, environment/credential reads or child processes.
CLI success is exactly `{ valid: true, report }`, where report is the public function
result; exit `0` means a valid report, even when preflight fails. Argument count errors
or blank path arguments produce `{ valid: false, code: "usage" }` and exit `1`.
Every other read/decode/parse/API failure produces
`{ valid: false, code: "invalid_input" }` and exit `1`. The CLI intentionally collapses
the public function's fixed errors; it never serializes an exception. JSON is emitted
as one compact line plus newline, with envelope fields in the order shown.
Failure JSON must not echo file paths, source content or parser exception messages.
Hashes and public scheduling identifiers are allowed output, not raw research content.

## Acceptance And Delivery

Future implementation owns `src/research/run-plan.ts`,
`scripts/plan-research.mjs`, dedicated core/CLI tests, a clearly synthetic draft
configuration and usage documentation. Add the npm script and script typing entry
where existing conventions require it. Keep the first API small; split an internal
schema helper only if implementation size makes review materially easier.

Required observed RED/GREEN cases before declaring runtime implementation complete:

- Deterministic known-answer schedule and all three digest contracts; insertion-order
  invariance, serialization-hook isolation, changed seed/config/data binding.
- Complete Cartesian coverage and unique ordinals/tuples; counts of 288 for the seed
  and 576 for each fully populated pilot evaluation split, with no training slots.
- Missing required keys, unknown nested fields, invalid limits, nonzero retries,
  alternative arms/attempts, hash mismatch, empty split and slot cap reject safely.
- Explicit unresolved fields yield actionable blockers; seed remains not pilot-ready.
  Fully populated synthetic data/config can pass preflight but never allow dispatch.
- Bilingual duplicates/omissions and category conflicts cannot pass structure checks.
- Private-field canaries never appear in output or errors; no arbitrary JSON hooks.
- Real-process CLI tests cover argument errors, duplicate keys, malformed UTF-8,
  missing files, valid-but-blocked exit semantics and deterministic JSON output.

Run targeted tests before the full test/build/typecheck/MCP smoke/plugin gate.
Use independent test/code and architecture reviewers, and address blocking findings.
Record a bounded local schedule timing sample with Node/machine/sample metadata and
rerun the existing benchmark after other test processes finish. Do not invent a new
latency threshold from one measurement or label local timing as hosted performance.

Documentation-only verification is not a TDD cycle. Keep handoff notes current, push
the reviewed feature branch and open/update its PR. Merge and paid execution each
require their own explicit approval. Written-spec approval permits implementation;
only observed implementation tests and independent review establish delivery. This
slice does not complete the deferred mock runner or paired statistical analysis.
