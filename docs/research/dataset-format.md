# Research Dataset Format V1

Validate a local JSON manifest after building:

```powershell
npm.cmd run build
npm.cmd run validate:dataset -- docs/research/datasets/format-demo.json
```

For machine-only JSON stdout, use `node scripts/validate-dataset.mjs <path>` directly
(npm prints its own script banner). Exactly one path is required. The validator returns
`{ "valid": true, "issues": [] }` and exit 0 for valid data, otherwise `valid: false`,
diagnostics and exit 1. Input files are not modified; hidden checks are never executed.

The [format demo](datasets/format-demo.json) is one synthetic development record. It is
not the proposed 120-family pilot, an evaluation result, or a frozen training dataset.

## Manifest And Records

The root contains only `schemaVersion: 1`, `datasetId`, and a nonempty `records` array.
IDs (`datasetId`, `id`, `familyId`, `hiddenCheckId`) use lowercase ASCII letters/digits,
start with a letter or digit, and may contain `.`, `_`, `-`. No trimming is performed.

| Record field | Contract |
| --- | --- |
| `id` | Globally unique record identifier |
| `familyId` | Shared by translations, paraphrases and variants; one split per family |
| `split` | `train`, `development`, or `test` |
| `language` | `en` or `ko` |
| `category` | `numeric`, `negation`, `actor_action`, `causal`, `temporal`, or `exact` |
| `source` | Object with nonblank `text`, `provenance`, `license` and lowercase 64-hex `sha256` |
| `question`, `answerKey` | Nonblank text |
| `requiredFacts`, `prohibitedContradictions` | Nonempty arrays of nonblank text |
| `acceptableParaphrases` | Array of nonblank text; empty is permitted |
| `rubric` | `kind: semantic` and nonblank `instructions`; exact records instead require `kind: exact`, instructions and `hiddenCheckId` |

Unknown fields are rejected at every object level. No coercion or automatic cleanup
occurs. `hiddenCheckId` is only a reference for a future scoring harness; a nonblank
license/provenance string does not establish that rights or source claims are valid.

## Source Identity And Leakage

`source.sha256` hashes the UTF-8 encoding of the decoded `source.text` exactly, including
BOM, whitespace and line endings. It does not hash the JSON string's escape notation.
For example, `"a"` and `"\u0061"` encode the same decoded text.

Duplicate-source detection separately applies Unicode NFC and converts CRLF or CR to LF.
It preserves BOM, trailing whitespace, final newlines and indentation. Normalized-identical
sources must share one family even within a split. Family identifiers are compared exactly;
same-family variants within the same split are allowed, but their record IDs must differ.

This catches declared family leakage and narrowly normalized duplicates only. Authors must
group translations/paraphrases and manually inspect near duplicates, shared answer leakage
and source lineage. Changing a BOM or trailing whitespace can evade source duplicate checks;
the validator must not be cited as a complete deduplication or semantic-leakage detector.

## Diagnostics And Limits

Schema failures return `schema` with a field path; valid-shaped records are then checked
for `rubric_category_mismatch`, `source_hash_mismatch`, `duplicate_id`,
`family_split_leakage`, and `source_family_conflict`. Paths use zero-based record indexes.
Schema errors stop cross-record checks until the shape is corrected. No diagnostic
includes submitted values, identifiers, unknown property names or filesystem paths.

CLI-only codes are `usage`, `read_error` and `invalid_json` with root path `$`.
The shared parser rejects duplicate members, including escaped aliases, malformed JSON,
more than 1,048,576 characters, and more than 128 nesting levels. Keep files small;
the CLI currently reads the file into memory before this parser limit is checked.

`valid: true` certifies only this format and these consistency checks. It does not certify
120 families, a 60/20/20 balance, language/category balance, truthful answers, rubric quality,
available hidden checks, independent scoring, or readiness for model training. Keep answer
keys/rubrics out of model inputs when building the future scoring harness. See the
[evaluation protocol](2026-09-07-layered-adaptation-evaluation-protocol.md) for research controls.
