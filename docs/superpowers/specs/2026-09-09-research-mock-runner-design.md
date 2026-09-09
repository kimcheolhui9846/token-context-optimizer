# Offline Research Mock Runner Design

## Status And Scope

On 2026-09-09 the user approved documenting the deterministic virtual-time option.
This document specifies the second slice after [run preflight](2026-09-09-research-run-preflight-design.md).
The user subsequently approved the written specification and requested the
[implementation plan](../plans/2026-09-09-research-mock-runner.md). Plan execution
approval remains a separate gate; no runner implementation, paid execution or
merge is authorized by this document.
The design branch depends on PR #13, at `138a0f198d3ffa2e7fc0f98a84188a1628ff7dd9`.

Goal: exercise sequential execution accounting and stopping decisions without
providers, credentials, network access, wall-clock timers, model outputs or grading.
The current 24-record development seed is enough for software tests, not pilot
readiness or empirical claims. No GPU is needed for this offline slice.

## Decision

Use a pure synchronous simulator with explicit synthetic outcomes, integer virtual
milliseconds and integer microUSD. Equal inputs produce equal outputs. This is
smaller and more reproducible than a fake asynchronous provider, which would add
timer/cancellation behavior without proving real provider billing or cancellation.

Do not add a provider-shaped callback, SDK adapter, retries, crash recovery,
tokenization, arm preparation, generated answers, grading, scoring-ledger export,
paired statistics or fine-tuning. Existing preflight and scorer contracts stay unchanged.

## Components And Input Boundary

Proposed API: `simulateResearchRun(dataset, configuration, scenario)`, with three
unknown inputs. A strict scenario parser owns its types and fixed validation errors.
The simulator calls `prepareResearchRun(dataset, configuration)` to reconstruct the
manifest and ordered slots; caller-supplied reports are not trusted execution inputs.

The scenario is a strict object with these required fields in canonical order:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Literal `1`. |
| `kind` | Literal `research_mock_scenario`. |
| `manifestSha256` | Lowercase 64-character SHA-256 matching the reconstructed plan. |
| `limits` | Strict object described below; explicitly synthetic, not provider configuration. |
| `outcomes` | One strict outcome per slot, at most 100,000 entries. |

Limits, all required and in this order: `requestTimeoutMs`, `runTimeoutMs`,
`spendCapMicrousd`, `concurrency`, `automaticRetries`. Timeouts and cap are positive
safe integers; run timeout is at least request timeout; concurrency is literal 1
and automatic retries literal 0. These limits need not match real execution fields
in the original configuration: they are a separate hypothetical scenario, never
an amendment to that configuration or its preflight report.

Every outcome has required fields in this order: `ordinal`, `status`, `durationMs`,
`reservedCostMicrousd`, `settledCostMicrousd`. Ordinal is a positive safe integer;
status is `completed` or `error`; duration and reservation are nonnegative safe
integers; settled cost is a nonnegative safe integer or explicit `null`.
Duration is the virtual delay before that event would become observable. The
settlement is known only if the event is reached before both deadlines.

Reject missing/duplicate/out-of-plan ordinals, extra keys, coercions, missing keys,
unsafe numbers and invalid enums. Require full coverage even for outcomes that will
not be reached. Missing scenario definitions are invalid input, not runtime errors.
Canonicalize outcomes by ordinal, so caller array order does not affect results.
Validate that the sum of all non-null settlements is a safe integer before running;
this deliberately conservative bound also covers unreachable outcomes. Do not sum
all reservations: concurrency one means there is only one active reservation.

Validation order: existing `prepareResearchRun` errors first; then
`invalid_mock_scenario` for shape or numeric constraints; then
`mock_manifest_mismatch`; then `mock_slot_coverage_mismatch`. No submitted values,
file paths, source text or exception internals appear in errors. Parsing detaches
schema-owned values, and neither API mutates its inputs.

## State Transitions

Virtual elapsed time and known settled spend start at zero. Visit slots in existing
ordinal order exactly once. No real invocation happens; "started" below means only
a transition inside the simulation.

Before starting each slot:

1. If elapsed time is at the run limit, stop with `run_timeout`.
2. Otherwise compare its reservation with cap minus known settled spend. If the
   reservation exceeds available budget, stop with `budget_exhausted`.
3. Otherwise reserve that amount and start the slot. Exact budget equality is
   allowed; a zero reservation is also allowed. It does not certify real free usage.

Let remaining run time be run limit minus elapsed time. The slot deadline is the
smaller of request timeout and remaining run time. Compare durations to this value
before adding them, avoiding unsafe addition. Deadline wins ties:

- If duration is at least the slot deadline, record `timeout`, advance by that
  deadline, retain its reservation, mark settlement unknown and stop. Reason is
  `run_timeout` when remaining time is less than or equal to request timeout;
  otherwise reason is `request_timeout`. A tied run/request deadline is a run timeout.
  Ignore the late event's declared settlement: it was not observable before timeout.
- Otherwise record the declared completed/error event and advance by its duration.
  A `null` settlement retains the reservation and stops with `unknown_cost`.
- A known settlement releases the reservation and adds to known spend, including
  error-event costs. If settlement exceeds the reservation, stop with
  `reservation_exceeded`, even when total spend is below the cap. Record the actual
  synthetic amount without clamping, including when it exceeds the cap.
- Otherwise continue. Known-cost error events do not trigger automatic retries or
  stop later slots. Error is an execution outcome, not a claim about answer quality.

The first applicable rule fixes the stop reason. Reaching an event does not retroactively
turn it into a timeout or error because reconciliation stops the run. Any stopping
condition on the final slot still counts as a stopped simulation. Only traversing
all slots without a stop condition produces `schedule_exhausted`.

Undispatched slots remain explicitly `not_started`, with null start time, latency,
reservation and settlement. They are neither failures nor fabricated timeout events.
After any stop, all remaining slots stay not started. There is no retry/resume loop.

## Output And Accounting

Return a strict, deterministic report with these top-level keys in order:
`schemaVersion` (1), `kind` (`research_mock_report`), `mockOnly` (true),
`dispatchAllowed` (false), `manifest`, `scenarioSha256`, `preflight`, `summary`, `slots`.
Manifest and preflight are the unchanged prepared report values. A false preflight
does not block a synthetic scenario, and a true one does not grant real authority.

`scenarioSha256` is SHA-256 over UTF-8 JSON of the parsed scenario, using the field
orders above and ordinal-sorted outcomes. Archive the original dataset, configuration
and scenario separately. Hashes bind reproducible content, not signatures or approvals.

Summary fields in order:

| Field | Meaning |
| --- | --- |
| `termination` | `schedule_exhausted` or `stopped`; neither means a graded experiment is complete. |
| `stopReason` | One of the six reasons defined by the transition rules, including `schedule_exhausted`. |
| `plannedSlots`, `startedSlots`, `notStartedSlots` | Counts; planned equals started plus not started. |
| `completedSlots`, `errorSlots`, `timeoutSlots` | Counts; their sum equals started. |
| `virtualElapsedMs` | Sum of simulated started-slot latencies, bounded by run timeout. |
| `knownSettledCostMicrousd` | Sum of observed non-null settlements for started slots only. |
| `settledCostMicrousd` | Same sum if every started slot has known settlement, otherwise null; zero if none started. |
| `heldReservationMicrousd` | The single unresolved started-slot reservation, or zero. |
| `remainingBudgetMicrousd` | Null if any started settlement is unknown; otherwise max(0, cap minus known spend). |
| `budgetExceeded` | Known settled spend is greater than cap; unknown spend is not claimed safe. |

The six stop reasons are `schedule_exhausted`, `run_timeout`, `budget_exhausted`,
`request_timeout`, `unknown_cost` and `reservation_exceeded`.

Each output slot copies the prepared slot keys in their existing order and appends
`status`, `startedAtMs`, `latencyMs`, `reservedCostMicrousd`, `settledCostMicrousd`.
Status is `completed`, `error`, `timeout` or `not_started`. There is exactly one
record per planned slot, in ordinal order, even after an early stop.
For a started slot, start time, latency and reservation are nonnegative safe integers;
settlement is a nonnegative safe integer or null. A timeout has null settlement.
All four appended telemetry fields are null for a not-started slot.

These costs describe started mock events, not the hypothetical cost of all planned
slots. No unknown amount becomes zero; known sums and retained reservations are not
assertions that timeout billing stopped. No model answers, judgments, source content,
provider telemetry or fabricated accuracy appear in the report.

The report is intentionally not a v1 evaluation ledger. The existing scorer accepts
USD and infers missing slots from absent runs; it does not accept `not_started` or
synthetic provenance. A future explicit adapter would need its own reviewed contract.

## CLI Boundary

Proposed command after build: `node scripts/mock-research.mjs <dataset> <configuration> <scenario>`;
npm alias: `mock:research`. Exactly three nonblank arguments are required. Read only
those files with the existing fatal UTF-8 and duplicate-key rejecting JSON parser.
Do not write files, read environment credentials, start child processes or load providers.

Emit one compact JSON line and no input-bearing diagnostics: exit 0 with
`{ valid: true, report }`, including deliberately stopped simulations; exit 1 with
`{ valid: false, code: "usage" }` for arguments, or
`{ valid: false, code: "invalid_input" }` for all other input failures.
Existing parser limits apply after file reading; slot bounds do not bound input-file
memory. Streaming and a general file-size limit remain outside this slice.

## TDD And Review Acceptance

Use literal, independently calculated expectations rather than calling production
helpers to generate expected transitions or digests. Observe targeted behavioral RED
before each runtime increment, then GREEN and refactoring with the tests still green.

Required coverage:

- Strict input validation, manifest/ordinal binding, canonical hashes, no mutation,
  identical repeated outputs, complete ordered slots and fixed field order.
- Known-cost completion and error continuation, concurrency one and no retries.
- Durations just below/equal/above request and run deadlines, tied deadlines,
  zero duration, a deadline reached before the next slot and final-slot stops.
- Reservation just below/equal/above available budget, zero reservation,
  settlement below/equal/above reservation, and settlement exceeding total cap.
- Unknown completion/error cost, forced unknown timeout cost despite a late known
  cost, held reservations, no later starts, and no fabricated not-started telemetry.
- Preflight false and true both preserve false dispatch authority; no empirical
  grading or scorer export; full counts reconcile after every stopping path.
- Numeric safety at MAX_SAFE_INTEGER, unreachable malformed outcomes rejected,
  CLI malformed UTF-8/duplicate keys/argument errors, input preservation and error redaction.

Assign disjoint implementation scopes where useful. A test-engineer independently
reviews test adequacy; code-reviewer and architect review the final implementation.
Blocking findings require fixes and renewed evidence, not merely a reviewer label.
Do not describe documentation-only checks as TDD or new runner tests.

After targeted checks, the full gate is `npm.cmd test`, `npm.cmd run build`,
`npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`,
`npm.cmd run benchmark`, plus the mock CLI fixtures and `git diff --check`.
Keep README, usage documentation and handoff synchronized with implementation status.

After implementation, record one warm-up and 20 measured simulator calls on a
fixed 288-slot seed scenario. Archive raw elapsed samples, nearest-rank median/p95,
Node/OS/CPU metadata and measured code commit. Exclude CLI startup and file I/O.
This wall-clock performance measurement is external to the virtual-time core; it is
local engineering evidence, not model latency or a portable performance guarantee.

## Delivery Gates

1. Document the approved direction and self-review this specification.
2. Publish a docs-only PR against `docs/research-run-preflight-design`; do not merge PR #13.
3. Obtain user review of the written specification before writing an implementation plan.
4. Implement only after the subsequent planning gate, with TDD and independent review.
5. Retarget a dependent PR to main only after its prerequisite has actually merged
   and its comparison has been checked. All merges require explicit user approval.

This document's approval never grants API access, spending, uploads, GPU rental,
fine-tuning, human grading or permission to claim experimental results.
