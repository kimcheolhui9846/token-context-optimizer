# Public Development Exact Checks

This checker compares supplied responses with four pinned development records:
English and Korean variants of `cache-location` and `clamp-guard`. It does not run
candidate code, invoke a model, grade semantic tasks or establish research outcomes.
The [demo response](datasets/exact-response-demo.json) is hand-supplied synthetic
input, not a model output. The registry and expected excerpts are public, not hidden
held-out evaluation, despite the dataset schema field name `hiddenCheckId`.

```powershell
npm.cmd run build
npm.cmd run check:exact -- docs/research/datasets/development-seed.json docs/research/datasets/exact-response-demo.json
```

Use `node scripts/check-exact.mjs <dataset> <response-envelope>` for JSON-only stdout.
Build before running the CLI or script typechecking. Neither input file is modified.

## Envelope And Result

The envelope accepts exactly these fields:

```json
{
  "schemaVersion": 1,
  "datasetSha256": "c29ea2176fa160732dd74ad8b4ae0ae5e547eaaa427a6e165ba0759444d55c35",
  "taskId": "clamp-guard-en",
  "responseText": "  if (value < 0) return 0;"
}
```

Use `fingerprintDataset` from `src/research/scoring.ts` for the dataset hash. A
mismatched fingerprint is an invalid input. Recomputing it does not authorize edited
task definitions: the checker separately pins each complete validated task record.

Every result has exactly five fields:

| Field | Valid response | Invalid input/evidence |
| --- | --- | --- |
| `datasetSha256` | Validated dataset fingerprint | null |
| `responseSha256` | SHA-256 of the exact UTF-8 response | null |
| `checkVersion` | `seed-cache-location-v1` or `seed-clamp-guard-v1` | null |
| `passed` | true for match, false for mismatch | null |
| `codes` | `[]` or `["response_mismatch"]` | One trusted code |

Exit 0 means a valid comparison, including `passed: false`. Exit 1 means invalid
input/evidence or usage. Automation must inspect `passed`, not just the exit code.
No input paths, IDs, source text, expected excerpts or response text are echoed.
Hashes are linkage evidence, not encryption or anonymization; low-entropy inputs
may be recoverable by guessing. Keep reports within the same data-access boundary.

Invalid codes are `usage`, `invalid_input`, `dataset_fingerprint_mismatch`,
`unsupported_task`, `registry_drift` and `source_fidelity_failure`. Schema, source
validation, read, JSON, Unicode and size errors map to `invalid_input`. Unknown
tasks/check IDs and non-exact tasks are unsupported. A supported task whose pinned
definition changed produces `registry_drift`. Inconsistent trusted registry/source
evidence produces `source_fidelity_failure`, never a response mismatch or a pass.

## Fidelity And Trust

`checkExactResponse(dataset, envelope)` in `src/research/exact-checks.ts` consumes
detached schema snapshots. Full record pins hash UTF-8 JSON serialization in schema
field order, including source metadata, split/language, question and all grading
fields. Caller property order and serialization hooks do not redefine those pins.
Registry data is checked in separately in `src/research/exact-registry.ts`, not loaded
from the submitted dataset. Intentional record edits require reviewed pin/version
updates; changing only an answer key cannot make an incorrect answer pass.

The registered source hash and zero-based line must match the trusted excerpt bytes.
Source lines split on LF; only the LF terminator is excluded, so CR is retained.
Response bytes must equal the excerpt, with no trimming, line-ending conversion,
Markdown stripping or extra prose. The clamp guard requires exactly two leading
spaces and `<`; the diagnostic requires its exact filename, line, column and code.
An empty response is a valid mismatch. The comparator never executes response text.

The CLI decodes both files with fatal UTF-8 validation and preserves BOMs for rejection
by the existing parser. Duplicate keys, including escaped spellings, are rejected.
Decoded response strings cannot contain unpaired surrogates and must be no larger
than 65,536 UTF-8 bytes. Complete JSON files retain the shared parser's 1,048,576
character and depth-128 limits. Files are read into memory before decoding/parsing;
these limits do not provide a pre-read byte cap or hostile-file memory isolation.

## Scoring Boundary

This is an executable comparison of public development excerpts, not an executable
behavioral test of generated programs. It supplies only exact-check evidence.
The [scoring ledger](scoring.md) still requires fact coverage, contradiction status,
grader identity and adjudication supplied independently. Do not automatically convert
a comparison report into a complete judgment or overwrite failures with successes.
Preserve raw responses and grader evidence separately, and keep the frozen model/run
protocol distinct from these engineering fixtures. No experiment ran for this feature.
