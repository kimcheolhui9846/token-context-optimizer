# F-21 evidence index

The R-2 gate was changed with user approval on 2026-10-25 **after the first FAIL**. The original evidence is retained byte-for-byte; superseded and discarded runs are not acceptance evidence. This rework targets regression removal (회귀 제거).

The new 10 MiB gate uses one child per recipe, separately compiled B/B-copy/C, one warmup and nine alternating rounds. A/A must be 0.97-1.03 for every recipe before C/B <=1.03 is judged. One complete retry is allowed after INVALID. Limits: 180 seconds/child, 1,800 seconds/run. Record-only cells have no ratio gate.

| File | Role |
|---|---|
| [2026-10-24T10-31-03-266Z.json](2026-10-24T10-31-03-266Z.json) | Original planning survey (already on main). |
| [2026-10-25T03-01-33-014Z.json](2026-10-25T03-01-33-014Z.json) | Revised b+E-3 planning survey (already on main). |
| [2026-10-25T08-12-57.786Z.json](2026-10-25T08-12-57.786Z.json) | Discarded attempt: overlapping workloads or exhausted budget; no acceptance claim. Concurrency metadata was not reliable. |
| [2026-10-25T08-16-16.176Z.json](2026-10-25T08-16-16.176Z.json) | Discarded attempt: overlapping workloads or exhausted budget; no acceptance claim. Concurrency metadata was not reliable. |
| [2026-10-25T08-19-17.164Z.json](2026-10-25T08-19-17.164Z.json) | Discarded attempt: overlapping workloads or exhausted budget; no acceptance claim. Concurrency metadata was not reliable. |
| [2026-10-25T12-22-04.768Z.json](2026-10-25T12-22-04.768Z.json) | Original strict gate FAIL; superseded judgment method, preserved result. |
| [audit-2026-10-25T12-29-04.086Z.json](audit-2026-10-25T12-29-04.086Z.json) | Behavior and frozen-scope audit. |
| [validation-2026-10-25T12-44-38.672Z.json](validation-2026-10-25T12-44-38.672Z.json) | Original implementation validation before Draft PR. |
| [validation-post-draft-2026-10-25T12-49-45.507Z.json](validation-post-draft-2026-10-25T12-49-45.507Z.json) | Original validation after Draft PR. |
| README.md | Role index and gate-change disclosure. |



| New file | Role |
|---|---|
| [f21-rework-gate-2026-10-26T01-00-46.380Z.json](f21-rework-gate-2026-10-26T01-00-46.380Z.json) | Attempt 1: PASS; all 12 A/A controls valid; no retry. Summary medians/ratios and equality results. |
| [f21-rework-record-2026-10-26T01-11-04.888Z.json](f21-rework-record-2026-10-26T01-11-04.888Z.json) | Record-only PASS: 48 Task25, 48 E3 (wrapper and combined), 15 URI, 9 regex-alone cells; raw samples retained. |
| [validation-rework-2026-10-26T01-15-31.639Z.json](validation-rework-2026-10-26T01-15-31.639Z.json) | Rework validation logs, previous failed test output, source hash and preserved-scope checks. |

## Measurement limitations
- The gate child emits ordered samples, but the parent retains only completed-cell medians/ratios/equality summaries. Successful gate raw samples are not in this JSON; no retrospective reconstruction is claimed.
- The URI recipe named `rejected-headings-late-valid` actually generates a long eligible run followed by `mailto:x`, not repeated rejected headings. Its PASS supports only that generated input. The existing URI tests and earlier evidence remain separate.
- E3 production and oracle share the same regex; the regex-wrapper calls are measured, not an independent algorithm. Finite timing probes are not universal complexity proofs.
