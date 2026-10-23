# N-01 implementation handoff

- Tier E: code/tests and measured performance evidence.
- Status: CHANGES REQUIRED (dot performance gate); Draft delivery in progress. Base main b909294; branch codex/n01-scanner-impl.
- Scope: policy predicates 0-based #2/#8/#19/#21/#23, narrow wrapper, new tests, generated bundle and fresh timestamp evidence.
- Preserved: classifications/reason order/F-21; no artifacts.ts/server/schema/package/dependency/research/paper/frozen-oracle/pre-task-evidence changes.
- Initial plan: user-provided Claude review of 8c3b998, APPROVE, blocker0 / major0 / minor1 (m-3 incorporated).
- Model routing: executor calls succeeded; exact model identity unverified, DEGRADED per explicit task allowance. Primary Codex reviewed directly; no independent-review substitution claim.
- RED: six target RangeError/Maximum call stack size exceeded outcomes, including whole classifier plus10MiB repeated path. Vitest failed on return-status assertion, not setup/timeout.
- GREEN:42 targeted tests/6files;874 full-suite pass/1skip. New file10tests. Differential342285 predicate +68457 classification returned cells, zero throws; corpus120 preserved.
- Review correction: dot prefix delimiter semantics; regressions included. Only true RangeError+exact message falls back;5other fault types rethrow.
- Integration:10MiB Bearer artifact -> empty summary and required blocking warnings; actual indexed byte length and cleanup checked.
- Gate: npm test/build/typecheck/smoke:mcp/validate:plugin and diff check pass. Suite21.378s -> 21.428s (+0.050s, limit+30s).
- Performance:36/36cells x5 before/after. First implementation regressed all12; optimized rerun11/12 nonregressing. Dot2975.7511 ->3014.7988ms (+1.31%); historical3044.4367ms. Strict gate FAIL; no tolerance introduced.
- New large matrix195/195 returns (13recipes x3sizes x5); zero throws/timeouts/fallbacks; max wall5.122s.
- MCP fresh servers: small controls pass,10MiB times out,20MiB write EOF; existing SDK stdio buffer10MiB plus JSON overhead explains transport constraint. No transport support claim or server change.
- Evidence: [final summary](../../research/evidence/n01/implementation-summary-2026-10-23T15-43-12.648Z.json), [comparison](../../research/evidence/n01/performance-comparison-2026-10-23T13-00-37.370Z.json), [fresh MCP](../../research/evidence/n01/mcp-large-2026-10-23T15-40-49.857Z.json). Earlier summaries/pilot reflect intermediate states, not final acceptance.
- Reproduce new matrix: extract runner.source from implementation-large JSON to .artifacts/measure-n01.mjs, verify runner.sha256, run from repo root. Task25 runner remains unchanged. Replay creates new timestamp evidence.
- Final independent Claude implementation review is pending in the user's session per task instructions. Primary final review: CHANGES REQUIRED for dot performance criterion; correctness/scope gates pass.
- Remaining: commit/push/DraftPR, post-Draft gate, final Git/PR verification. Do not mark Ready/merge or start next Task. User judgment required for remaining performance failure; no scope expansion applied.
