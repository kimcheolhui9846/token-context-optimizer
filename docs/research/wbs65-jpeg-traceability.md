# WBS 6.5 JPEG claim traceability

This audit covers numeric claims in:

- [`jpeg-runtime-validation.md`](jpeg-runtime-validation.md)
- [`jpeg-codec-feasibility.md`](jpeg-codec-feasibility.md)

Line numbers refer to the checked-out documents at `80bbcfd`. The status column
uses the requested Korean labels:

- `있음`: a committed evidence record contains the same value or observation.
- `없음`: no committed raw result for the claim was found.
- `불일치`: committed evidence exists, but it records a different run, scope, or
  value and cannot substantiate the document claim.

The committed Task 22 handoff is a textual result record, not a machine-readable
raw output. The committed Task 22 JSON is a different 1824×1824 run. The Task 21
codec probe was documented as ignored scratch; no Task 21 raw file exists in the
checked-out tree or in the old repository-root `.artifacts` scratch searched for
this audit. Historical values below are unchanged.

## Measured numeric claims

| Value | Document line | Raw committed result | Status |
|---|---|---|---|
| 2528×2528 and 2529×2529 flat RGB-128 4:4:4 fixtures | `jpeg-runtime-validation.md:60,68-69` | `docs/agent/handoffs/task-22.md:67` records square2528 and square2529 | 있음 |
| Real table cost: 580 for both fixtures | `jpeg-runtime-validation.md:68-69` | No committed raw field or result records the value 580 for these fixtures | 없음 |
| Accounting: 134,207,044 bytes; 134,845,066 bytes | `jpeg-runtime-validation.md:68-69,88` | `docs/agent/handoffs/task-22.md:67` records `accounting134207044` and `accounting134845066` | 있음 |
| Result: accepted; `jpeg_resource_limit` | `jpeg-runtime-validation.md:68-69` | `docs/agent/handoffs/task-22.md:67` records accepted for 2528 and `jpeg_resource_limit` for 2529 | 있음 |
| Wall time: 306.11 ms; 1.05 ms | `jpeg-runtime-validation.md:68-69` | `docs/research/evidence/task-22/jpeg-validator-performance.json:36,47,58` records 1240.51, 904.51, and 931.69 ms for a different 1824×1824 fixture and different timing scopes | 불일치 |
| RSS before→after: 40,996,864→190,570,496 bytes; 41,218,048→41,394,176 bytes | `jpeg-runtime-validation.md:68-69` | No committed raw result contains these before/after pairs | 없음 |
| `maxRSS`: 273,472 KiB; 40,432 KiB | `jpeg-runtime-validation.md:68-69` | The committed JSON has `maxRSSKiB` for a different 1824×1824 run, not these values | 불일치 |
| Repeated accounting: 134,207,044 bytes; 134,845,066 bytes | `jpeg-runtime-validation.md:88` | `docs/agent/handoffs/task-22.md:67` contains the same pair | 있음 |
| Repeated wall time under concurrent load: 670.60 ms; 2.38 ms | `jpeg-runtime-validation.md:88` | `docs/agent/handoffs/task-22.md:67` contains the same pair and notes concurrent load | 있음 |
| Repeated `maxRSS` under concurrent load: 272,884 KiB; 49,544 KiB | `jpeg-runtime-validation.md:88` | `docs/agent/handoffs/task-22.md:67` contains the same pair and notes concurrent load | 있음 |
| Independent gradient fixture: 8×8, 651 encoded bytes; SOF 158, first DHT 177, SOS 609, EOI 649 | `jpeg-codec-feasibility.md:9` | No committed Task 21 raw fixture, probe output, or result file was found; Task 33 encoder evidence is a different probe | 없음 |
| Normal strict/default return length: 256 bytes | `jpeg-codec-feasibility.md:13` | No committed Task 21 raw result was found | 없음 |

## Constants, formulas, and negative-control inputs

These numbers are not measured performance or resource observations. They are
formula terms, configured limits, fixture definitions, or deliberately mutated
inputs. They are separated so they are not mistaken for measured metrics.

| Value | Document line | Raw committed result | Status |
|---|---|---|---|
| `B = ceil(width/8) × ceil(height/8)`; formula terms `960`, `6`, `256`, and `sum(16+H)` | `jpeg-runtime-validation.md:18-23` | The formula is reproduced in `docs/agent/handoffs/task-22.md:60`; this is a design/accounting formula, not a measurement | 있음 |
| Component terms `768B`, `192B`, and two RGB buffers | `jpeg-runtime-validation.md:25-28` | `docs/agent/handoffs/task-22.md:60` records the same accounting formula; no raw measurement is implied | 있음 |
| Accounting limit 128 MiB = 134,217,728 bytes | `jpeg-runtime-validation.md:27,71` | `docs/agent/handoffs/task-22.md:60,67` records the 128 MiB policy and 134217728 upper limit | 있음 |
| Node `v22.23.2` | `jpeg-runtime-validation.md:50,53,60` | `docs/research/evidence/task-22/jpeg-validator-performance.json:7` records `node22: v22.23.2` | 있음 |
| Node `v24.18.0`, `jpeg-js 0.4.4`, tarball SHA-256 | `jpeg-codec-feasibility.md:7` | Task 21 was run from ignored scratch; the committed Task 33 JSON records the same version family for a different encoder run, not Task 21 provenance | 불일치 |
| Strict options `maxResolutionInMP: 1.1`, `maxMemoryUsageInMB: 16` | `jpeg-codec-feasibility.md:13` | No committed Task 21 raw result was found | 없음 |
| Mutation inputs `12 34`, `FF 00`, and removal of 5 scan bytes | `jpeg-codec-feasibility.md:20-26` | No committed Task 21 raw result was found | 없음 |
| Negative-control settings `0.000063 MP` / 63 pixels and `1 byte` memory accounting | `jpeg-codec-feasibility.md:28` | No committed Task 21 raw result was found; these are configured failure inputs, not measured ceilings | 없음 |
| Proposed 128 MiB maximum/resource discussion | `jpeg-codec-feasibility.md:34` | No raw measurement is claimed; it is a documented limitation/design statement | 없음 |

## Historical gates and model labels

These values identify historical verification or review context. They are not
JPEG runtime metrics, and this audit does not revalidate the historical gate.

| Value or label | Document line | Committed record | Status |
|---|---|---|---|
| 647 passed / 1 Windows FIFO skip / 19 files; targeted 83 passed / 1 skip; post-Draft 653 passed / 1 skip / 19 files | `jpeg-runtime-validation.md:87` | `docs/agent/handoffs/task-22.md:64,68` records the same gate counts | 있음 |
| Historical review label `claude-opus-5-5` | `jpeg-runtime-validation.md:36-39` | The document records the label; this audit does not verify model identity | 있음 (label only) |
| Historical provider labels Gemini, Copilot, and configured GPT-5.5 fallback | `jpeg-runtime-validation.md:45-46,81-82` | The document records these labels; no runtime identity proof is asserted here | 있음 (label only) |
| Final review commit `181d8c2` and date `2026-09-27` | `jpeg-runtime-validation.md:3,74,89-96` | Historical document/review metadata; not a measurement | 있음 (metadata) |

## Scope limitation

The old Task 21 codec probe cannot be reproduced by the production validator
script. The codec document describes a System.Drawing-generated 8×8 fixture and
an ignored `jpeg-js` scratch installation; the production validator measurement
script generates its own production fixtures and records a separate Task 22
measurement path. The missing Task 21 raw output must therefore remain missing;
Task 22 or Task 33 evidence must not be substituted for it.

This file is traceability documentation only. It does not alter the runtime
validation document, source, or tests. The current agent/model identity is
unverified because no runtime identity proof was performed for this task.
