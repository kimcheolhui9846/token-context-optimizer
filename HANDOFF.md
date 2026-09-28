# HANDOFF

## Task 23 — Isolate Vitest discovery (2026-09-28)

### 1. Objective and scope
- Operator: Codex. User authorized proceeding on the 2026-09-27 Claude review.
- Deliver F-02: ordinary test discovery must exclude nested `.artifacts` worktrees while preserving Vitest defaults and ordinary project tests.
- F-16: remeasure the current Task 18 checkout and record a checkout-specific correction here. Its dirty source and handoff files remain untouched; this PR does not complete Task 18.
- Excluded: runtime fixes, benchmark/research redesign, dependency changes, history rewriting, merges, and other review findings.
- Base: `main` / `origin/main` `4e9b7c562b7f08fc24e79e615f68b467cbf8eeda`; branch `codex/task-23-test-isolation` in an isolated worktree.
- Preserve original dirty Task 18 and Task 19–22 worktrees. Historical project record: [docs/agent/HANDOFF.md](docs/agent/HANDOFF.md).

### 2. Plan and acceptance
- [x] Inspect instructions, dirty state, refs and review; successful native Astra planning response and Luna preparation response.
- [x] Reproduce root discovery: `node node_modules/vitest/vitest.mjs list tests/core.test.ts --filesOnly` lists five copies; adding `--dir tests` lists one.
- [x] Luna adds `vitest.config.ts`: `defineConfig({ test: { exclude: [...configDefaults.exclude, "**/.artifacts/**"] } })` from `vitest/config`.
- [x] Observe artifact sentinel discovery before the fix and exclusion after; preserve ordinary root test discovery.
- [x] Run targeted checks then full tests, typecheck, build, smoke, plugin validation and benchmark.
- [x] Record Task 18 isolated checkout measurements without inventing historical RED evidence.
- [ ] Commit task-only files, push, open Draft PR, rerun local gate and obtain final Astra review.
- Acceptance: no `.artifacts` tests in default collection; existing defaults retained; no runtime/dependency/WIP changes; accurate evidence and review limitations.

### 3–4. Changes and decisions
- First work product: this handoff. Root agent owns handoff files; Luna owns config only.
- A permanent exclusion is preferred to moving existing worktrees or requiring every caller to remember CLI flags.
- A broad `tests/**` include restriction is avoided to preserve normal Vitest discovery outside that directory.
- F-01 local identity is currently `Codex`; use the user identity stated in the supplied review for this Task's new commit without rewriting history or shared Git configuration.

### 5–6. Validation and error evidence
- RED is a discovery regression, not a fabricated runtime unit-test failure. The observed five-versus-one file listing demonstrates contamination.
- Root Task 18 handoff still has stale current-stub language, followed by later implementation and manual-exclusion PASS entries. Latest counts require fresh measurement.
- GitHub read initially failed due sandbox network access; approved elevated retry succeeded. Open PR stacks confirmed unchanged, Task 18 has no PR.
- Luna discovery check: `node C:/Users/00/Desktop/codex_plugin_and_skill/node_modules/vitest/vitest.mjs list --filesOnly` from Task 23 collected 12 files before config, including `.artifacts/discovery-probe/artifact-sentinel.test.ts`, and 11 after config without the sentinel. `run tests/core.test.ts`: 182 PASS. No permanent test added for this small configuration change; the observed discovery regression is the acceptance check.
- Controller `npm.cmd test -- --reporter=basic`: first attempt failed loading config because sandbox denied ancestor-directory access; approved elevated identical retry passed 570 tests / 11 files. Raw local output: `.artifacts/pre-pr-tests-retry.log`.
- Initial `npm.cmd run typecheck` before build failed TS2307 for four script imports from absent `dist/`. Fresh worktree requires build first; no source correction needed.
- `npm.cmd run build`, then `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`: each exit 0. Benchmark reports `passed: true`; this is existing software gate evidence, not validation of the research claims questioned in F-04/F-05.
- Task 18 snapshot (original checkout, 2026-09-28): `npm.cmd test -- --dir tests tests/research-paired-success.test.ts tests/research-scoring.test.ts tests/research-pilot.test.ts`: 153 PASS / 3 files (80 analyzer, 49 scoring, 24 pilot); `npm.cmd test -- --dir tests --reporter=dot`: 661 PASS / 12 files; `npm.cmd run typecheck`: exit 0. These are current dirty-checkout measurements, not original RED evidence or Task 18 completion. Earlier 76/78/659 counts describe earlier snapshots and must not be relabeled current.
- Post-Draft validation and final Astra review pending.

### 7. Cross-check
- Initial checkpoint: user-supplied Claude Code review `C:/Users/00/Desktop/codex_review_feedback_2026-09-27.md`, F-02/F-16. Exact Claude model is not established by that report; do not label it Opus 5 or a fresh Task 23 review.
- Claude: no new call; existing Task 18 instruction records user-directed separate-terminal review instead of automatic Claude calls.
- Gemini: API-key environment absent; free access/quota not established; review not performed.
- GitHub Copilot: `gh copilot --version` reports CLI not installed; declined installation; review not performed.
- Fresh external cross-check status: DEGRADED. Native Astra planning is supplementary, not an external-provider substitute.
- Native Astra pre-PR spec/quality review: PASS WITH NOTES, no blocker/major. Directly inspected config, diff, both handoffs and saved test/benchmark outputs. Notes: F-16 remains partial, generated bundle status must not enter commit, final post-Draft gate/review pending. Provider availability remains unchanged at this milestone; no new external review performed.

### 8. Self-review
- Minimal test-discovery configuration has no intended product behavior impact. Review risk: default patterns must remain intact and artifact exclusion must be verified against actual collection.

### 9. Remaining work
- Pre-PR implementation and gates complete; PR and final review pending.
- Task 18's own completion and in-place historical handoff reconciliation remain in its existing delivery unit.
- Other F/S findings remain outside this Task.

### 10. Authorization
- Proceed approval received. No merge, force-push, history rewrite or next-Task implementation authorized by this delivery.

### 11. Final summary
- In progress; no completion claim.
