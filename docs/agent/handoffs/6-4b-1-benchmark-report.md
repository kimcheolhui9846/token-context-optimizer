# 6.4b-1 — Benchmark report

- Tier E; base `cb7d882`; branch `codex/6-4b-1-benchmark-report`.
- Approved F-23 decision (2026-11-08): preserve prose source/phrases, rename fixture, pin numeric exact behavior separately.
- Scope: `benchmarks/run.ts`, benchmark tests in `tests/core.test.ts`, `docs/benchmarks.md`, this handoff.
- Plan: RED/GREEN → report compatibility check → independent milestone → commit/push/Draft → final local gates/Astra.
- Preserve policy, summarizer, estimator, thresholds, other scenarios, dependencies and research. No Ready/merge.

## Acceptance
- F-23: only fixture label and three existing test references renamed; one literal unit test covers numeric sentence/80-line classification and real summary refusal.
- F-24: nearest-rank median (lower middle for even n), p95 (rank19 for20),0.01ms rounding,1warmup/20measured;1000ms unchanged loose upper bound.
- S-06: semantic-only optional suite sum; sum four existing rounded fixture durations then round; aggregate measured lower median; exclude warmup; no latest-sample leak.
- S-07: capture environment once outside timed loops; Git shell-free at repository root, hidden/timeout; commit and dirty independently null on failure.

## Evidence
- Baseline:207 PASS/2SKIP targeted;3238PASS/5SKIP full; typecheck/build/benchmark/smoke/plugin/exact/diff PASS.
- Baseline semantic:58000raw/3950optimized/93.2%; all gates PASS.
- Initial build prerequisite absent:3 MCP tests failed before bootstrap build; rerun passed without product edits.
- Prior numeric probe: exact/numeric_or_table, empty summary, exact_content_requires_source; user approved revised treatment.
- RED: original feature failures recorded in prose only; erroneous numeric reason assertion excluded. Raw corrective RED: latency100 vs expected40; restored max behavior and GREEN28 benchmark tests.
- Current tests replayed against base:20PASS/8expectedFAIL; numeric refusal/evenmedian PASS. This is post-implementation evidence, not historical RED.
- GREEN:213PASS/2SKIP targeted;3244PASS/5baseline-identical SKIP full; all repository gates PASS.
- Before/after: all three scenario names/tokens/reductions/gates unchanged; semantic58000→3950/93.2%. suiteLatencyMs only semantic.
- Compiled collector from different cwd uses correct repo; real missing Git gives nulls. Bundle has228CRLF bytes vs Git blob; LF content identical, repeat build raw SHA b7986926b47b7cf25b3c3d7018916480547361426ec40fbee738bf1a7ed65647 identical.
- Draft-after final gates at c9b0a85:213targeted/3244full PASS,5baseline-identical SKIP; typecheck/build/benchmark/smoke/plugin/exact/diff PASS.
- Final benchmark environment:c9b0a85904a11cf6c408d31274a32d91f66fc34f,dirty=false,Nodev24.18.0/win32/x64. Semantic93.2%,latency median3.25ms,p953.62ms,suite median11.38ms; no performance improvement claim.

## Reviews
- Claude Opus5.5, initial, REQUIRED FIXES,0blocker/1major/4minor/5note; real collector failure coverage major included in implementation.
- Wrong legacy-packet review discarded; corrected initial call verified model `claude-opus-5-5`.
- Claude Opus5.5, milestone, REQUIRED FIXES,0blocker/1major/4minor/4note; bundle major answered with canonical equality/repeat build; temp cleanup already handled by wrapper+afterEach; whitespace/docs corrected.
- Claude Opus5.5, scoped, PASS,0blocker/0major/0minor/5note; all milestone findings closed with code/evidence.
- Primary Astra final: PASS WITH NOTES; directly checked scope/source,diff/tests,report invariants,review resolutions,Git/push/Draft. Original RED prose-only evidence limitation remains disclosed.

## Status and limits
- Completed implementation commit c9b0a85 pushed; [Draft PR #101](https://github.com/kimcheolhui9846/token-context-optimizer/pull/101) open/unmerged. This final record update changes documentation only.
- Timings are local synthetic observations, not controlled before/after performance evidence.
- Existing npm audit7 findings observed; no dependency changes authorized.
- Git/root lookup requires project tree containing package.json; Git metadata is optional.
- Changed existing expectations: only3fixture-name references. Existing latency40 retained; suite100 is additional.
- Next: user review/approval only. Ready/merge/nextTask not performed.
