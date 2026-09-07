# Offline Research Scoring Design

Continue the reviewed evaluation protocol after merged PRs #6 and #7. This change
provides model-input projection and aggregation of externally adjudicated run records.
It does not run a model, execute hidden checks, judge semantic truth, or complete a pilot.

## Inputs And Boundaries

`buildModelInputs(dataset, split)` validates the existing dataset and emits only id,
language, sourceText and question for that split, using an explicit allowlist. Reference
answers, facts, prohibited contradictions, provenance, family metadata and rubrics are
not model inputs. The source/question themselves still require author leakage review.

`fingerprintDataset(dataset)` computes SHA-256 of JSON.stringify on the validated input
object. This freezes field ordering and record ordering as well as content; reordering
object keys requires regenerating the fingerprint. No claim of canonical JSON is made.

Evaluation v1 fields: schemaVersion, datasetSha256, split, arms, attemptsPerTask and runs.
Arms are unique lowercase identifiers (1-32); attemptsPerTask is an integer 1-1000.
Runs contain taskId, arm, attempt (one-based), status (completed/error/timeout), latencyMs,
costUsd and judgment. Telemetry is nonnegative finite numbers or null. Duplicate or
out-of-plan tuples are rejected. Fingerprints must match and the selected split must
contain tasks. A judgment has graderId, coveredFacts boolean array, contradiction boolean,
and exactCheckPassed boolean/null. It is allowed only for completed runs. Fact vector
length must match the task; exact tasks require an exact-check boolean, semantic tasks null.

## Accounting

Per arm, planned = selected task count * attemptsPerTask. Missing slots are counted
explicitly and keep complete=false; operational failures count as failures. Ungraded
completed runs keep successRate=null; otherwise successRate=successes/planned, a
conservative planned-slot rate treating missing slots as unsuccessful. No submitted-only
denominator is used. Complete requires no missing slots and no ungraded completions.
Success requires every fact covered, no contradiction, and a passed exact check when
applicable. This trusts external judgments and does not certify their accuracy.

All submitted run costs, including failures and retries represented as planned attempts,
contribute. Unknown cost or missing slots makes totalCostUsd/costPerSuccessUsd null;
zero successes also makes costPerSuccessUsd null. Latency p50/p95 uses all submitted
known latencies, reports its sample count, and is descriptive, not a comparative test.
Report counts and aggregate metrics only; do not echo answer keys or grader metadata.

The read-only `score:research` CLI takes dataset and ledger paths, rejects duplicate
JSON members via the existing parser, and emits JSON. Invalid input exits 1; valid
but incomplete/unsuccessful evaluations exit 0 with explicit report fields.

## Delivery

Use existing TypeScript/Zod/Vitest. Implement `src/research/scoring.ts`,
`scripts/score-research.mjs`, dedicated tests and a clearly synthetic ledger example.
Targeted TDD precedes independent review and the full gate. Open a new PR against main;
the approval to merge PRs #6/#7 does not auto-merge this new feature.
