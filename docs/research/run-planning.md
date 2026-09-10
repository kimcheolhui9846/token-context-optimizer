# Offline Research Run Planning

This tool validates a configuration and produces a reproducible preview schedule.
It does not execute a model, construct arm contexts, estimate billing, grade outputs
or authorize data access. The [example configuration](datasets/run-plan-demo.json)
is a synthetic draft for the public development seed, not a frozen experiment.

```powershell
npm.cmd run build
npm.cmd run plan:research -- docs/research/datasets/development-seed.json docs/research/datasets/run-plan-demo.json
```

For JSON-only stdout, use
`node scripts/plan-research.mjs <dataset> <configuration>` after building. It reads
only those two input files and does not modify either. It uses fatal UTF-8 decoding
and the existing duplicate-key rejecting JSON parser. Files are read into memory
before the parser's character/depth limits apply; the 100,000-slot limit bounds
schedule construction, not input file size or total validation memory.

## Interpreting The Report

Exit 0 returns `{ valid: true, report }`, even if preflight is blocked. The report has
`manifest`, `slots` and `preflight`. The seed produces 288 slots: 24 records times
four context arms times three attempts. These are correlated repetitions, not 288
independent tasks or actual model calls. The current seed is not a complete pilot.

The manifest contains only schema version and dataset/configuration/schedule/manifest
hashes. Slots contain ordinal, task/family identifiers, language, category, arm and
attempt; they contain no question, source, answer, rubric, result, judgment or cost.
Neither output is a model-input packet or an arm-blinded grading packet. Scheduling
identifiers are not anonymized. Keep locked test data and scheduling metadata under
the project's existing access controls.

| Flag | Meaning |
| --- | --- |
| `configurationComplete` | All execution configuration fields are non-null; no provider capability is checked. |
| `pilotStructureSatisfied` | Existing 120-family quotas and full split/category coverage pass, plus exactly one English and one Korean record per family. Independence/provenance is not certified. |
| `evidenceReferencesPresent` | Eight non-null artifact ID/hash references are present; the tool does not open or authenticate the artifacts. |
| `preflightPassed` | All three preceding checks pass; this is not research readiness or authority. |
| `dispatchAllowed` | Always `false`, even when all other checks pass. |

Explicit nulls identify unresolved draft configuration. Missing keys, unknown fields,
wrong types or inconsistent non-null values are invalid rather than silently defaulted.
The example has unresolved execution/evidence and incomplete pilot quotas, so
`preflightPassed` is false. Resolving only the example's nulls cannot complete the
dataset or create model/spending permission.

Issues use a fixed code/path vocabulary, sorted and deduplicated. Argument mistakes
exit 1 with `{ valid: false, code: "usage" }`; other input/read/decode/validation
failures exit 1 with `{ valid: false, code: "invalid_input" }`. Errors never echo
paths or submitted content. The pure `prepareResearchRun(dataset, configuration)`
API provides more specific fixed errors as documented in the
[approved contract](../superpowers/specs/2026-09-09-research-run-preflight-design.md#preflight-and-cli-output).

## Reproducibility And Limits

The algorithm ranks families and per-task/attempt arms using SHA-256 of versioned
JSON tuples and an explicit seed. Language order within a family is fixed English
then Korean, not randomized. Freeze the seed before outcomes; do not select favorable
seeds. See the [schedule contract](../superpowers/specs/2026-09-09-research-run-preflight-design.md#schedule-and-fingerprints)
for field ordering and tie-breaks.

Hashes bind detached schema snapshots, not arbitrary caller serialization. Object
property insertion order does not matter; dataset record order does under the existing
dataset fingerprint contract. Archive dataset and original configuration separately:
the report intentionally omits execution metadata, evidence-reference IDs and the
seed. A hash is not a signature or tamper-proof preregistration; an editor can replace
inputs and recompute hashes. Run-ID uniqueness across processes is not enforced.

There are no provider SDKs, retry loops, credential reads or GPU requirements here.
Mock-runner failure accounting, authentic approval verification, request construction,
token matching, raw traces, spending enforcement and paired statistical analysis are
separate work. Collection still requires the
[protocol readiness gates](2026-09-07-layered-adaptation-evaluation-protocol.md#readiness-and-acceptance).

## Local Timing Evidence

The [2026-09-09 local sample](evidence/2026-09-09-run-preflight-local.json) records
20 calls after one warm-up on the 24-record public seed (288 slots). Median was
1.46 ms and p95 2.34 ms using nearest-rank percentiles. The artifact includes raw
samples, the measured code commit, Node version, OS and CPU metadata. This measures
validation/fingerprinting/scheduling/preflight only, excluding file I/O, CLI startup
and all model work. It is descriptive engineering evidence, not a portable latency
guarantee, regression threshold, or hosted-model experiment result.
