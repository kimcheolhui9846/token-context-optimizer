# 6-4b-4 Summarizer Performance Preregistration

## Scope and provenance

This preregisters the base-vs-optimized performance comparison for the approved
summarizer implementation. Base is exact commit `c8580e91c0c1e077453290c7080e0dc671e519d7`;
optimized is the current committed implementation. A reference snapshot removes
only `const candidateLines = artifact.sourceMap.slice(0, 6);` in favor of the
uncapped source map and is informational at budget 2000.

Frozen optimized implementation: `231084b7e2f79074f664ff502bd4a03c362f2038`.
Git blob IDs: `src/core/artifacts.ts` = `e4a24bf60fd4053128b576d3d5b6a7aebd141ab0`;
`bin/token-context-optimizer.mjs` = `b6a5b76c041944ed4a1382518dcbc98453a052ee`.
Source SHA-256 = `16cd7686a10642bf870dc51b16535e743041cbcaa4dce56ea1d20f0c3a1bf0af`;
local rebuilt bundle SHA-256 = `8984ff6d47f2ecb978d98ee558b4b52a786efb864415c0da33382d357c4b322f`.
The optimized arm must retain these Git blobs; compiled snapshot hashes are also recorded.

The runner records the exact HEAD, source/worker/runner/compiled-module and
lockfile SHA-256 values, normalized snapshot paths, Node version, OS, CPU model
and logical count, `powercfg /GETACTIVESCHEME`, registry AC/DC overlay GUIDs and
Win32_Battery status values (empty on a machine without reported batteries). It refuses a dirty worktree,
existing output, or provenance mismatch. Windows extraction uses
`C:\Windows\System32\tar.exe` explicitly. Temporary directories are direct
children of the OS temp directory with a `tco-6-4b-4-` prefix and are validated
before cleanup.

## Fixtures and calls

Inputs are fixed: the semantic seed sentence followed by 100,000 indexed empty lines
(100,001 source-map lines total; one extra LF accounts for final-terminator semantics);
`We all like warm tea.` repeated 100,000 LF-delimited times; an eight-line late
semantic fixture with budget 88; and the one-line semantic seed with budget 120.
Large comparisons use budgets 2,000 and 50,000. Every implementation is loaded
and indexed in its own `MemoryArtifactStore`; indexing and file I/O are reported
separately. Timed calls are serial core public `summarizeArtifact` calls only.

Each arm receives five warmups. Each implementation first has a separate A/A
block, then the comparison uses 15 ABBA cycles (30 samples per arm/variant,
K=1 per call). Each call has a 15-second startup/index and individual-call
timeout; timeout phase, raw status, and no fabricated duration are retained.
There is no concurrent CPU work or power-mode change.

## Gates, invalidation, and stopping

Nearest-rank median is `sorted[ceil(.5*n)-1]`; p95 is
`sorted[ceil(.95*n)-1]`. For A (the first ABBA arm) and B, A/A passes exactly when
`(median_B / median_A in [0.9, 1.1] OR abs(median_B - median_A) <= 0.1 ms)`
AND `abs(p95_B - p95_A) <= max(0.2 ms, 0.2 * p95_A)`.
An invalid A/A retains the full attempt,
waits 30 seconds, and retries the whole comparison at most twice; a third
invalid attempt stops the overall report. A valid gate failure does not retry.

G1 (large budget 2000) requires optimized median and p95 overhead each to be within
`max(25 ms, 10% of the corresponding base statistic)`. G2 (budget 50000)
requires p95 overhead at most `max(100 ms, 20% base p95)` and no optimized timeout/OOM; its median is reported but not gated. G3 (late/single small
fixtures) requires both median and p95 within `max(0.1 ms, 10% base)`. Classify-
only controls use five warmups and 30 samples, report raw statistics only, and
have no verdict or subtraction. Reference 50000 is a bounded diagnostic only;
completed calls are recorded honestly and censored calls are not assigned a
duration or ratio.

## Output and differences from #105

Raw sample order, durations, statuses, hashes, normalized source maps, selected
line counts, estimates, fallback reasons, warnings, and correctness projections
are retained in a new result file; no product bundle or historical survey is
modified. This protocol makes the G3 base comparison explicit, separates
selector/control cost from total public-call cost, uses per-call K=1 as approved,
and requires provenance/clean-tree fail-closed checks. Percentile differences are
total-call regression bounds, not estimates of selector-only cost.

## Exact execution order and reproduction

- PowerShell, Node `v24.18.0`: `node research/src/6-4b-4-summarizer-perf.mjs --check-only`
  checks synthetic statistical boundaries and fixture definitions without timed public calls.
- After committing implementation, scripts and this protocol, run
  `node research/src/6-4b-4-summarizer-perf.mjs --prereg=<committed-sha>`. The recorded `preregistrationCommit`
  must be the last commit touching runner/worker/protocol, an ancestor of `measurementHead`,
  with identical versions of those files. The option is required; the worktree must be clean. Existing output is
  refused. A new `--output=research/results/6-4b-4-<name>.json` is only for a
  separately authorized amendment or non-measurement setup failure, not retrying
  a valid failure or exhausted A/A attempts.
- Prepare independent base/reference/optimized archives and locked installs/builds;
  reference transformation and hashes are recorded. Each persistent worker owns
  a separate store indexed from the same shared fixture files. All calls are serial.
- Mandatory comparison order: blank2000, prose2000, blank50000, prose50000,
  late88, single120. Each attempt has five warmups per implementation, then
  separate base A/A and candidate A/A blocks, then the base/candidate ABBA block
  if both A/A controls are valid. Each A/A block also uses15 ABBA cycles and30
  samples per arm. There is no batching (K=1).
- An invalid A/A skips that attempt's comparison block. Retry repeats warmups and
  both A/A blocks after30 seconds; all attempts remain in the raw result. Third
  invalid A/A or any valid mandatory gate failure stops the entire run.
- After mandatory gates: information-only base/reference comparisons for blank2000
  and prose2000 use the same A/A protocol; next classify-only on blank/prose/late/single
  (five warmups,30 samples each); last, one bounded reference50000 call per large fixture.
  A reference timeout is censored; a completed reference is recorded as completed,
  even though the request anticipated timeout. No duration is invented.
- Correctness compares optimized/reference2000 hashes, source maps, estimates and
  fallback, normalizing only reference warnings to the approved D2 rule outside timing.
  Raw reference warnings are retained. Each variant's repeated projections must be stable.
- G3 late88 must select exactly6 lines in both variants; single120 selects1.
  Non-warning fields must match base/optimized. Late text is hash-checked against
  the current core acceptance test; the intentional late88 warning difference is
  retained in raw projections (base[], optimized[summary_truncated]).
- An optimized G2 timeout/OOM is a failed gate with its raw resource/deadline status
  retained; optimized G1/G3 resource failures likewise cannot pass. Finalization
  errors never erase an earlier failed/invalid verdict. Mandatory verdicts are recorded
  separately even if an informational reference block subsequently invalidates the run.
- Untimed unit tests calibrate late88, single120 and both large fixtures/budgets before
  preregistration. A correctness assertion failure stops the run and cannot be relabeled
  a valid performance failure or silently retried; any measurement-affecting repair
  requires an explicit amendment and preserves the original evidence.
- Startup and each indexing request have15 seconds; each individual summary/control
  request has15 seconds. A whole multi-sample block is not limited to15 seconds.
  Worker heap is512 MiB. Indexing reports file I/O plus index construction outside timing.
- Environment identity (Node,OS,CPU models/logical count,active power scheme) and all
  original tracked-file hashes must match after the run. Raw checkpoints are saved
  after blocks and on errors; no incomplete result is a PASS. Unrun controls are identifiable
  by the non-pass overall status and empty remaining arrays.

No results or pass claims are recorded here. Formal timing must occur only after
this document and the runner are reviewed and committed.
