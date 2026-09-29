# Offline paired-success analysis

`analyzePairedSuccess` is a pure, offline diagnostic for the selected
`development` or `test` split. It compares the declared `optimized` arm with
the declared `full_source` arm using family-paired success counts. It does not
run a model, grade a response, contact a provider, write a ledger, or authorize
dispatch.

## API and import path

The source module exports the function directly:

```ts
import { analyzePairedSuccess } from "./src/research/paired-success.js";

const report = analyzePairedSuccess(dataset, evaluation);
```

Both arguments are accepted as `unknown` at the public boundary. The function
validates the dataset and the v1 evaluation ledger, rejects unknown fields, and
does not mutate or trust caller-owned objects. After `npm.cmd run build`, the
compiled module is `dist/src/research/paired-success.js`. There is no CLI or
additional adapter for this analysis; the existing scorer CLI remains a
per-arm scoring interface.

The ledger must use `attemptsPerTask: 3`, include both `full_source` and
`optimized`, and carry `datasetSha256` equal to the validated dataset
fingerprint. The selected split must be `development` or `test`. A family must
have exactly two records: one `en` and one `ko`, with the same category.

## Validation order

Shared dataset and ledger validation/classification runs first, preserving the
scorer's fixed error codes and precedence. Analysis-specific checks then run in
this order:

1. `train` throws `unsupported_analysis_split`.
2. Missing either named contrast arm throws `missing_contrast_arm`.
3. An attempts count other than three throws `unsupported_analysis_attempts`.
4. If `selected task count × 3 × declared arm count` is unsafe or exceeds
   `100000`, the function throws `analysis_capacity_exceeded`.
5. Any family in the selected split that is not exactly bilingual and same-category throws
   `invalid_analysis_family`.

Additional valid arms are allowed. They still contribute planned slots and must
be complete, so a missing or ungraded slot in an extra arm makes the whole
report incomplete. Operational `error` and `timeout` runs count as submitted
binary failures; they do not count as missing. A completed run with a null
judgment is ungraded.

Coverage reports `complete`, `familyCount`, and totals for `planned`, `submitted`,
`missing`, and `ungraded` across all declared arms, plus one row per arm. Each
row repeats those five counts with its arm name; `planned = submitted + missing`,
and `ungraded` is a subset of submitted completed slots.

The `100000` check is an analysis allocation limit. It does not change the
general dataset or scorer limits, and it is evaluated before family output is
constructed.

## Report and arithmetic

The report has these top-level flags and metadata:

```json
{
  "schemaVersion": 1,
  "kind": "research_paired_success_report",
  "analysisVersion": "family-paired-success-v1",
  "diagnosticOnly": true,
  "researchEligible": false,
  "dispatchAllowed": false
}
```

It also contains the validated dataset fingerprint, selected split, the fixed
contrast (`referenceArm: "full_source"`, `comparisonArm: "optimized"`),
`attemptsPerTask: 3`, `coverage`, `pointEstimate`, and `families`.

For each family, `referenceSuccesses` and `comparisonSuccesses` are integers
from 0 through 6. Rates divide those counts by 6, and the family difference is
`(comparisonSuccesses - referenceSuccesses) / 6`. The overall point estimate
accumulates the integer differences first and divides by `6 × familyCount`.
Zero differences are serialized as positive zero. It is a proportion
difference in `[-1, 1]`, not a percentage-point claim or a p-value.

For example, two families with full-source successes `[3, 6]` and optimized
successes `[6, 0]` have family differences `+0.5` and `-1`; therefore the
overall point estimate is the literal `-0.25`:

```ts
const report = analyzePairedSuccess(dataset, ledger);
report.pointEstimate === -0.25;
// Expected family differences: [0.5, -1]
```

The example assumes two correctly paired families, three attempts per task,
and complete adjudication for both declared arms. A report with any missing or
ungraded slot has `pointEstimate: null` and `families: []`, while coverage and
`familyCount` remain available. This is intentional withholding of partial
estimates, not evidence that there are zero families. Complete family rows are
sorted by ASCII `familyId`; coverage arm rows are sorted by ASCII arm ID.

## Diagnostic and replay limits

All reports are diagnostic-only, including a complete full-pilot report. The
analyzer cannot establish real versus synthetic execution, model or provider
access, grader identity, label truth, hidden-check execution, spend approval,
or response provenance. It does not attest to research eligibility or create a
preregistration. The v1 ledger has no execution-provenance attestation and
this slice adds no ledger hash.

The report intentionally excludes response text, questions, references,
rubrics, grader IDs, and telemetry. Family IDs and the dataset fingerprint are
traceability metadata; they are not anonymous or automatically safe for public
disclosure. Keep research-private inputs and adjudication evidence under the
appropriate access controls.

For replay, archive the exact dataset bytes, exact evaluation ledger, and the
analyzer version/source used. `datasetSha256` binds the validated dataset
snapshot only; it does not bind the ledger. A caller who edits both artifacts
can recompute the dataset hash, so the hash is not a signature or immutable
collection record. Bootstrap intervals, p-values, noninferiority/equivalence,
category/language effects, telemetry comparisons, rater agreement, and a new
analysis CLI remain future inferential work.
