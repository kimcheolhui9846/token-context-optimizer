# Offline Family-Paired Success Design

## Status And Scope

The user approved writing this design on 2026-09-10 after selecting point estimate
plus coverage as the next slice. This document is a specification, not an
implementation or an approved implementation plan. Written-spec approval is the
next gate. No new CLI, model invocation, training, upload or paid execution is
authorized. PR #13/#14 are merged; this docs branch is based on the separate
post-merge handoff PR #15, which must not be merged without approval.

Implement a pure offline function, `analyzePairedSuccess(dataset, evaluation)`,
in a later change. It compares only `optimized - full_source` using the existing
dataset and v1 evaluation ledger. Keep every existing `scoreEvaluation` input,
error, output field/order and CLI behavior unchanged.

This is the arithmetic/coverage foundation for the
[evaluation protocol](../../research/2026-09-07-layered-adaptation-evaluation-protocol.md#grading-and-analysis),
not its complete inferential analysis. Bootstrap, confidence intervals, p-values,
noninferiority/equivalence, category/language effect estimates, telemetry analysis,
human-rater agreement and a new CLI are explicitly deferred.

## Why This Slice

The [existing scorer](../../../src/research/scoring.ts) supplies descriptive
per-arm metrics. It may report a success rate when runs are missing, with
`complete: false`; this behavior remains valid for that existing contract and
must not be silently changed. The protocol separately requires withholding the
primary comparison when the planned run or its adjudication is incomplete.

Three approaches were considered:

1. Point estimate and coverage first: selected; isolates eligibility and arithmetic
   while retaining the existing scorer contract.
2. Include bootstrap now: deferred until resampling strata, algorithm, seed and
   quantile convention are separately specified and approved.
3. Live runner first: deferred because access, spending, upload and provider
   cancellation/billing safeguards are separate approval and implementation gates.

## Input And Validation

Accept two `unknown` inputs. There is no second ledger schema, implicit mock-report
adapter or caller-supplied family metadata. The
[dataset](../../../src/research/dataset.ts) supplies family, language, category and
split. The [ledger contract](../../research/scoring.md#ledger-v1) supplies arms,
attempts, outcomes and supplied adjudications. Strict unknown-field rejection,
schema-owned snapshots, fingerprint binding and existing validation precedence
remain intact. Caller objects are never mutated or reused as trusted snapshots.

Validation order is observable:

1. Run the existing scoring validation/classification path, including its current
   dataset, schema, fingerprint, duplicate-arm, empty-split, overflow, out-of-plan,
   duplicate-run, judgment-shape and cost-overflow behavior. Preserve existing
   fixed error codes and precedence, including ledger traversal order.
2. Reject `train` with `unsupported_analysis_split`; only development/test qualify.
3. Require both named contrast arms; otherwise `missing_contrast_arm`. Additional
   valid arms are allowed and remain part of the planned-run completeness gate.
4. Require exactly three attempts per task; otherwise `unsupported_analysis_attempts`.
5. Before constructing analysis slot/family output, require selected task count
   times three times declared arm count to be at most 100,000 using checked
   arithmetic; otherwise `analysis_capacity_exceeded`. This is an analysis
   allocation limit, not a new bound on existing scorer inputs or parser memory.
6. Each family in the selected split must contain exactly two task records, one
   `en` and one `ko`, with the same category; otherwise `invalid_analysis_family`.
   This additional analysis constraint must not tighten the general dataset API.

Invalid inputs/analysis structure throw the fixed errors above, never raw values.
Valid but missing/ungraded outcomes return an incomplete report, not an exception.
Checks on unrelated splits remain only those already owned by dataset validation.
An undersized but correctly paired selected split can yield a diagnostic estimate;
the analyzer does not require or certify the full 120-family pilot quota.

## Shared Scoring Boundary

Introduce one internal evaluation core under `src/research/` in the implementation
plan. It owns the existing strict ledger validation and per-outcome classification,
and returns detached validated data plus the existing per-arm scoring result.
`scoreEvaluation` continues exposing exactly its existing report; the analyzer
consumes the same validated/classified state rather than reparsing the raw caller
input or reverse-engineering aggregate success rates. A single success predicate
must serve both paths. Do not make the internal core depend on the new analyzer.

Keep `buildModelInputs`, `fingerprintDataset` and all current callers compatible.
Existing cost overflow and nullable telemetry handling are retained by the shared
path even though this analyzer introduces no cost/latency comparison. Refactoring
must first be covered by existing-output/error characterizations. No new runtime
dependency is necessary for integer counts and averaging in this slice.

## Coverage And Arithmetic

For every declared arm, planned slots are selected task records times three.
Coverage records planned/submitted/missing/ungraded counts using the existing
scorer rules. Root counts sum across all declared arms, not only the contrast.
`complete` requires zero missing and zero ungraded slots in every declared arm.
An incomplete extra arm also blocks the contrast; this intentionally follows the
protocol's whole-planned-run rule rather than silently selecting available arms.

- `error` and `timeout` are observed binary failures (zero), not missing outcomes.
- A completed, adjudicated outcome succeeds only if all required facts are true,
  contradiction is false and the exact check is not false, exactly as in v1.
- Completed outcomes with null judgment are ungraded, never invented failures.
- Unknown cost or latency does not block an otherwise complete success comparison.
- No missing/ungraded slots are dropped, imputed or filled from mock scenarios.

For family `f`, let `sO[f]` and `sF[f]` be successful slots in optimized and
full_source, each integer from 0 through 6 (two languages times three attempts).
The family rates are `sO[f]/6` and `sF[f]/6`, its difference is
`(sO[f] - sF[f])/6`. For `F` families the point estimate is
`sum(sO[f] - sF[f]) / (6 * F)`, giving each family equal weight. Accumulate the
integer numerator first, then divide once; do not round before serialization.
The unit is a proportion difference in [-1, 1], not percentage points or a p-value.
Return positive zero for a zero difference.

When incomplete, `pointEstimate` is null and `families` is empty. This intentionally
withholds partial family estimates as well as the overall contrast. Coverage and
familyCount remain available; an empty families array does not mean zero families.
When complete, emit every family, sorted by ASCII family identifier. Sort coverage
arms by ASCII identifier. Output is deterministic across ledger run/arm ordering
for inputs that pass validation; dataset record ordering retains its existing
fingerprint semantics. Never use locale-dependent sorting, timers or randomness.

## Output Contract

The returned object has these required keys in this insertion order, with no others:

| Key | Value |
| --- | --- |
| `schemaVersion` | Literal `1`. |
| `kind` | Literal `research_paired_success_report`. |
| `analysisVersion` | Literal `family-paired-success-v1`. |
| `diagnosticOnly` | Literal `true`. |
| `researchEligible` | Literal `false`, even with a full pilot and complete ledger. |
| `dispatchAllowed` | Literal `false`. |
| `datasetSha256` | Existing validated full-dataset fingerprint. |
| `split` | Selected development/test split. |
| `contrast` | Keys `referenceArm: full_source`, then `comparisonArm: optimized`. |
| `attemptsPerTask` | Literal `3`. |
| `coverage` | Object defined below. |
| `pointEstimate` | Complete diagnostic difference, or null. |
| `families` | Complete family rows, or empty when incomplete. |

Coverage keys in order: `complete`, `familyCount`, `planned`, `submitted`,
`missing`, `ungraded`, `arms`. Each arm row has keys `arm`, `planned`, `submitted`,
`missing`, `ungraded` in that order. `planned = submitted + missing` always;
`ungraded` counts only submitted completed slots awaiting judgment.

Family-row keys in order: `familyId`, `category`, `referenceSuccesses`,
`comparisonSuccesses`, `referenceRate`, `comparisonRate`, `difference`.
Neither response text, questions, references, rubrics, grader IDs nor telemetry
appears in this report. Family IDs and the dataset fingerprint are traceability
metadata, not anonymous/public-safe data; callers still control disclosure.

## Authority And Reproducibility

The v1 ledger has no execution-provenance attestation or frozen run-manifest binding.
The analyzer cannot prove real versus synthetic execution, grader identity, label
truth, model access or spend approval. Therefore all reports are diagnostic-only
and never certify research eligibility. It does not inspect credentials or perform
provider, network, filesystem, child-process or scoring-ledger writes.

A raw mock report is not a valid evaluation ledger and must be rejected. A caller
can supply a synthetically populated valid ledger, but that remains diagnostic;
do not fabricate attestations or silently convert mock output. Archive the exact
dataset, ledger and analyzer version for replay. DatasetSha256 alone does not bind
the ledger, and this slice adds no ledger hash or preregistration claim.

## TDD And Verification Acceptance

The later implementation plan must include observed RED/GREEN for new behavior,
targeted checks before the full gate and independent test/code/architecture review.
Documentation review and existing green characterizations are not new TDD cycles.

Required literal and invariant coverage:

1. Two bilingual families, three attempts per arm: reference successes [3, 6],
   comparison successes [6, 0], differences [0.5, -1], overall -0.25; 24 planned
   slots for two arms. Assert the full output shape and metadata.
2. All success/equal, all zero/equal, differences +1/-1 and positive zero; per-family
   partial success and category variations; use integer counts as independent oracles.
3. Known error/timeout count zero but stay complete; missing and ungraded each
   independently suppress all estimates, including an incomplete additional arm.
4. Null cost/latency leaves complete success estimates available; malformed or
   overflowing known cost still follows the existing validation error contract.
5. Missing contrast arm, attempts 2/4, train split, duplicate-language family,
   extra/missing family records and category conflict; no new general dataset ban.
6. Stale fingerprint, duplicate/out-of-plan runs, malformed judgments, unknown keys,
   serialization hooks and multi-invalid-input precedence match the shared path.
7. Run/arm reordering produces byte-identical reports; inputs remain unchanged;
   family/arm sorting is explicit; wrong raw mock-report input is rejected.
8. Correctly paired small and full-pilot fixtures both retain diagnostic-only and
   false eligibility/dispatch. Capacity just below/above the 100,000-slot ceiling
   must be exercised with realizable paired/three-attempt fixtures.
9. Existing scorer JSON/errors and every existing public caller remain unchanged
   after extraction, including cost accumulation and percentile conventions.

Full implementation gate: targeted scorer/pilot/analyzer tests, all project tests,
build, typecheck, MCP smoke, plugin validation, existing benchmark and diff checks.
Measure future analyzer timing only after code exists, with committed source,
fixture binding, runtime/machine metadata and raw repeated samples. Do not reuse
mock-runner timing as analyzer evidence or invent a performance threshold.

## Delivery Gate

The resumed documentation delivery also includes a separate
[supplied-paper review and agent-context hypothesis assessment](../../research/literature/2026-09-12/README.md).
Those proposals do not change this analyzer contract or the current experiment arms.
This design-only change adds the spec and updates handoff. Self-review checks
scope, complete interfaces, error precedence and absence of unresolved placeholders.
Independent reviewers assess the written contract, not nonexistent implementation.
Commit/push through the PR flow; do not merge this or prerequisite PR #15 without
explicit approval. Obtain user review of this written spec before writing the
implementation plan; runtime implementation is a subsequent approved workflow.
