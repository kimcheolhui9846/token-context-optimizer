# WBS 6.5 JPEG claim traceability

This audit covers numeric claims in:

- [`jpeg-runtime-validation.md`](jpeg-runtime-validation.md)
- [`jpeg-codec-feasibility.md`](jpeg-codec-feasibility.md)

Line numbers refer to the checked-out documents at `80bbcfd`. The status column
uses the requested Korean labels:

- `있음`: a committed evidence record contains the same value or observation.
- `없음`: no committed raw result for the claim was found.
- `불일치`: a raw record for the same observation contradicts the document.
  An unrelated run is not a mismatch; no such same-record mismatch was found.

The committed Task 22 handoff is corroborating prose, not a raw result. The
committed Task 22 JSON is a different 1824×1824 run and does not mismatch the
flat claims below because it is not the same record. The Task 21 codec probe was
documented as ignored scratch; no Task 21 raw file exists in the checked-out tree
or in the old repository-root `.artifacts` scratch searched for this audit.
Historical values below are unchanged.

Fresh sequential production evidence is present in the
[`wbs65-flat-2026-10-24T05-18-19.377Z.json`](evidence/task-22/wbs65-flat-2026-10-24T05-18-19.377Z.json)
file, committed with this task. It is referenced only as a new
observation; it does not recover or replace historical raw results.

## Measured numeric claims

| Value | Document line | Raw committed result | Status |
|---|---|---|---|
| 2528×2528 and 2529×2529 flat RGB-128 4:4:4 fixtures | `jpeg-runtime-validation.md:60,68-69` | No historical raw result. Fresh JSON `...wbs65-flat-2026-10-24T05-18-19.377Z.json:30,60` records new sequential fixtures; the handoff is prose corroboration only | 없음 |
| Real table cost: 580 for both fixtures | `jpeg-runtime-validation.md:68-69` | No historical raw result. Fresh JSON `...wbs65-flat-2026-10-24T05-18-19.377Z.json:33,63` records 580 for a new observation | 없음 |
| Accounting: 134,207,044 bytes; 134,845,066 bytes | `jpeg-runtime-validation.md:68-69,88` | No historical raw result. Fresh JSON `...wbs65-flat-2026-10-24T05-18-19.377Z.json:34,64` records the same accounting values for a new observation; the handoff only corroborates historical prose | 없음 |
| Result: accepted; `jpeg_resource_limit` | `jpeg-runtime-validation.md:68-69` | No historical raw result. Fresh JSON `...wbs65-flat-2026-10-24T05-18-19.377Z.json:38,68-69` records the same outcomes for a new observation | 없음 |
| Wall time: 306.11 ms; 1.05 ms | `jpeg-runtime-validation.md:68-69` | No historical raw result. Fresh JSON `...wbs65-flat-2026-10-24T05-18-19.377Z.json:50,73` records new 302.53 and 0.76 ms observations; historical values are unchanged | 없음 |
| RSS before→after: 40,996,864→190,570,496 bytes; 41,218,048→41,394,176 bytes | `jpeg-runtime-validation.md:68-69` | No historical raw result. Fresh JSON `...wbs65-flat-2026-10-24T05-18-19.377Z.json:52-53,75-76` records different sequential pairs | 없음 |
| `maxRSS`: 273,472 KiB; 40,432 KiB | `jpeg-runtime-validation.md:68-69` | No historical raw result. Fresh JSON `...wbs65-flat-2026-10-24T05-18-19.377Z.json:54,77` records different 269,376 and 46,560 KiB observations | 없음 |
| Repeated accounting: 134,207,044 bytes; 134,845,066 bytes | `jpeg-runtime-validation.md:88` | No historical raw result; `docs/agent/handoffs/task-22.md:67` is prose corroboration only | 없음 |
| Repeated wall time under concurrent load: 670.60 ms; 2.38 ms | `jpeg-runtime-validation.md:88` | No historical raw result; `docs/agent/handoffs/task-22.md:67` is prose corroboration only and the fresh JSON explicitly does not recreate concurrent load | 없음 |
| Repeated `maxRSS` under concurrent load: 272,884 KiB; 49,544 KiB | `jpeg-runtime-validation.md:88` | No historical raw result; `docs/agent/handoffs/task-22.md:67` is prose corroboration only and the fresh JSON reports different sequential observations | 없음 |
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
| Node `v24.18.0`, `jpeg-js 0.4.4`, tarball SHA-256 | `jpeg-codec-feasibility.md:7` | Task 21 was run from ignored scratch; the committed Task 33 JSON records the same version family for a different encoder run, not Task 21 provenance | 없음 |
| Strict options `maxResolutionInMP: 1`, `maxMemoryUsageInMB: 16` | `jpeg-codec-feasibility.md:13` | No committed Task 21 raw result was found | 없음 |
| Mutation inputs `12 34`, `FF 00`, SOF/DHT length `1`, and removal of 5 scan bytes | `jpeg-codec-feasibility.md:20-26` | No committed Task 21 raw result was found | 없음 |
| Negative-control settings `0.000063 MP` / 63 pixels and `1 byte` memory accounting | `jpeg-codec-feasibility.md:28` | No committed Task 21 raw result was found; these are configured failure inputs, not measured ceilings | 없음 |
| Proposed 128 MiB maximum/resource discussion | `jpeg-codec-feasibility.md:34` | No raw measurement is claimed; it is a documented limitation/design statement | 없음 |

## Historical gates and model labels

These values identify historical verification or review context. They are not
JPEG runtime metrics, and this audit does not revalidate the historical gate.

| Value or label | Document line | Committed record | Status |
|---|---|---|---|
| 647 passed / 1 Windows FIFO skip / 19 files; targeted 83 passed / 1 skip; post-Draft 653 passed / 1 skip / 19 files | `jpeg-runtime-validation.md:87` | `docs/agent/handoffs/task-22.md:64,68` records the same gate counts | 있음 |
| Historical review label `claude-opus-5` | `jpeg-runtime-validation.md:36-39` | The document records the label; this audit does not verify model identity | 있음 |
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
validation document, source, or tests. Model routing and review status are recorded in the task handoff.

## Additional provenance and new observations

| Value | Document location | Raw result / source | Status |
|---|---|---|---|
| Node archive SHA-256 `1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97` | `jpeg-runtime-validation.md:50-53` | [Fresh official manifest/archive comparison](evidence/task-22/wbs65-flat-2026-10-24T05-18-19.377Z.json), `nodeArchive`; same hash, fresh verification, not historical download recovery | 있음 |
| Gradient RGB `(30+10x,60+10y,120)`, fixture SHA-256 `7d7db20f927304cb7bcdd509cd1512b6e54c39c424fc553831afa22925a19575` | `jpeg-codec-feasibility.md:9` | Historical fixture/raw output unavailable; generating another fixture would not recover the original | 없음 |
| 0 production vulnerabilities in historical audit | `jpeg-runtime-validation.md:78` | Historical prose only; this task does not reproduce a time-dependent old advisory database | 없음 |
| Fresh flat2528/2529:302.53/0.76ms; maxRSS269376/46560KiB | new runtime section | [Fresh raw result](evidence/task-22/wbs65-flat-2026-10-24T05-18-19.377Z.json) | 있음 |
| Seeded square 1889²: 10432234 encoded bytes, 75332937 accounting bytes, median 947.56ms, maxRSS median 226444KiB | new runtime section | [Five raw samples and search](evidence/task-22/wbs65-jpeg-measure-20261024T052826Z.json) | 있음 |

The historical flat measurements and Task 21 codec probe remain missing as raw
records; the fresh measurements close forward traceability, not historical recovery.
