PR: pending | Branch: `codex/task-26-benchmark-integrity` | Base: `main` (`fcbc740`)

# Task 26 — Benchmark integrity (F-04/F-05)

## Scope and approval

The user approved replacing the supplied-answer editing scenario with synthetic code-context retrieval. F-04 is addressed by truthful prefix-smoke claims and real-summarizer omission characterization; this Task does not fix the summarizer. F-05 removes supplied solution code and patch execution from the retrieval input/evaluation.

Public core/MCP behavior, dependencies, source-span validation, token/latency calculations, cleanup and generic report gates are preserved. N-01, F-21, real LLM experiments and image-paper work are excluded. The shared agent HANDOFF remains unchanged; the root HANDOFF is local and ignored.

## Plan and acceptance

See the [approved plan](../../superpowers/plans/2026-10-05-benchmark-integrity.md). The new scenario must use symptom queries, broken source/test context and plausible distractors with shared symptom vocabulary. The evaluator must reject authentic but wrong source context as well as corrupt spans. It reports retrieval fidelity, not editing success (`taskGateRequired: false`, `passedTaskGate: null`). Historical editing results are not directly comparable.

Existing prefix omission is GREEN characterization, not performance or implementation RED. New retrieval requirements require observed test failure before implementation. Neither the existing gate thresholds nor product behavior may be changed just to pass a synthetic fixture.

## Planning and availability evidence

- Baseline: `npm.cmd test -- --run tests/core.test.ts` passed 182 tests (15.34 seconds) on the base tree.
- Actual native `gpt-6-astra` produced and refined the plan. Actual Claude Code `claude-opus-5` completed the initial-plan review. Adopted shared-vocabulary distractors, unchanged-gate measurement/stop rule, null-task-gate regression checks, historical-claim audit, limitation comments and fixture-derived spans.
- Claude's approval objection came from a Korean quote becoming question marks in CLI transmission; the conversation's explicit approval and English design description resolve it. Requiring RED for an already-rejected negative control was declined because it would mislabel characterization.
- Native Luna hit a usage limit before implementation. The same actual `gpt-6-luna` successfully responded through local Codex CLI; no substitute model or shared configuration change was used.
- Gemini free-tier eligibility could not be established, so no potentially billed call was made. Copilot CLI was absent and GitHub had no installed extensions; those reviews were not performed. Neither is represented as a successful cross-check.
- Lockfile-pinned installation reported two moderate audit findings; dependency upgrades are outside this Task.

## Delivery status

Implementation and pre-push verification are complete. Commit/push, Draft PR, post-PR verification and final Astra review follow this checkpoint.

## Test-first evidence

- Luna added real-summarizer omission characterization and the new retrieval fixture contract before changing the benchmark implementation. Its first attempted run was blocked by sandboxed esbuild directory access before tests ran; that attempt is not RED.
- Root reran `npm.cmd test -- --run tests/core.test.ts`: 183 passed, one failed (15.41 seconds). The new contract failed because `buildCodeContextFixture` did not exist. The real-summarizer late-prose omission case passed as characterization. Raw local log: `.artifacts/task26-red-actual.log`.
- Targeted GREEN after the first review fixes: 185 passed (16.89 seconds). The first full gate then stopped on six CLI-suite setup failures caused by TS2352 in an incomplete test response object. A direct `tsc -p tsconfig.json --noEmit` isolated that test-only error. The 102 skipped tests in that failed run are not a successful gate; only one FIFO skip is expected in a clean run.

## Milestone review and fixes

- Actual Claude Code `claude-opus-5` and native Astra reviewed the implementation. Astra confirmed a path-comparison bug: a bare expected filename rejected the canonical absolute path returned by real retrieval. The expected path is now derived from the known fixture directory independently of query output.
- Strengthened the absence-of-repair assertions for the current fixture identifier, asserted the actual six-line summary prefix, and documented old/new scenario names and non-comparability. Setup remains outside sampled execution; obsolete patch execution is removed.
- The fixed 13-line window (`contextLines: 6`) and one-token `input`/`amount` distinction are explicit synthetic-smoke limitations. Astra rejected the claim that the expected target was derived from returned query results: it is fixed independently and the real wrong-target query is rejected. This remains no evidence of general ranking or coding quality.
- Current claim audit found old names only in explicit migration/historical explanations. Earlier `docs/superpowers/plans/` and `specs/` remain historical records; their old numerical results were not rewritten.
- The incomplete synthetic query casts were replaced by full `ReturnType<typeof queryArtifact>` objects. The compiler and subsequent ordered gate passed; no test suppression, threshold relaxation or product change was needed.

## Verified pre-push result (2026-10-06)

- Targeted `npm.cmd test -- --run tests/core.test.ts`: 185 passed (16.41 seconds).
- Full `npm.cmd test`: 790 passed, one existing Windows FIFO skip (25 files, 20.33 seconds).
- Then `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark` and `git diff --check`: all exit zero, in that order.
- Benchmark CLI reports `passed: true`; the code-context result reports exact gate true, task-gate-required false and task gate null. Its synthetic input has 8,272 estimated tokens and selected context 128; median 0.79 ms and p95 1.10 ms over 20 local samples. These values are fixture-specific, not editing success, representative retrieval quality or billing evidence. No thresholds or fixture size were retuned after a gate miss.
- Rebuilt bundle is unchanged: SHA-256 `3E504807CD8EECD4F6425A4D1CA5FBF3A43701E9F97CB131B5361051BD63F46D`. Product `src/`, dependencies, shared HANDOFF, Task 25 oracle and frozen fixture remain unchanged.
- Actual logs are preserved locally in the parent checkout at `.artifacts/task26-verification/pre-push-fixed/`; the earlier failing run remains at `pre-push/`.
- Post-PR verification and final Astra delivery verdict will be recorded in the PR and local handoff after the latest commit is pushed. No merge is authorized by this Task.
