PR: [#25 (Draft)](https://github.com/kimcheolhui9846/token-context-optimizer/pull/25) | Branch: codex/task-25-policy-redos | Base: main 5828f02840304067e8d345969ffc7c1a981650ec

# Task 25 — F-03 classifier ReDoS

## PR #25 re-review correction checkpoint
- This follow-up changes tests, evidence and documentation only; `policy.ts`, its bundle, dependencies, frozen oracle body and all 120 expected classifications remain unchanged from `e51af55`. Fixture provenance gains the base LF hash without regenerating expected results.
- [Regression evidence](../../research/evidence/task-25/revision-tests.json): newly covered group 1 rules #13/#16/#17 each hit the actual five-second frozen-oracle timeout at 400,000 characters; current predicates pass. Added all eight requested witnesses and two true punctuation-removal recipes. Those two recipes are GREEN characterization in both versions, not original-code RED; current scans are slower on those inputs.
- [Exception observations](../../research/evidence/task-25/exception-probes-2026-10-04T13-45-25.351Z.json): newly discovered pre-existing Major, **outside this Task; separate user decision required**. Current hex/digits classifiers throw at 10 MiB and return at 1/5 MiB. The unchanged isolated hex regex returns with 5 million `a` characters plus `g`, and throws with 6 million plus `g`. At 10 million UTF-16 code units (28 million UTF-8 bytes), the U+3000/newline recipe throws in main's frozen classifier but returns in the current classifier. No runtime repair is included.
- Fresh targeted check: 207 passed across six files (16.07 s). Full gate: 780 passed, one existing FIFO skip, 25 files (18.93 s), followed by build → typecheck → smoke:mcp → validate:plugin → benchmark → diff check, all exit 0. Parent-local logs: `.artifacts/task25-verification/revision-pre-push/`.
- Scratch and tracked rebuilt bundle SHA-256 both remain `3E504807CD8EECD4F6425A4D1CA5FBF3A43701E9F97CB131B5361051BD63F46D`. Astra's independent pre-commit review is PASS WITH NOTES; push and post-push verification are pending at this checkpoint. Final delivery status is recorded in the PR; no merge.
- This revision successfully obtained separate plan and test-diff reviews from actual Claude Code `claude-opus-5`. Astra evaluated the proposed index-mapping and timeout-margin concerns against existing direct predicate witnesses and the explicitly requested five-second deadline; neither is a demonstrated blocker. Frozen expected results must not be regenerated. Loaded-CI timing variability remains a note. Gemini free-tier eligibility remains unverified and callable Copilot unavailable; their reviews were not performed. Historical DEGRADED checkpoints below describe earlier failed reviews, not this revision's successful Claude calls.
- Post-push verification of `049b82a` exposed an existing harness issue: the group 2 test ran seven child processes in one Vitest test and reached 5,917 ms, exceeding its aggregate 5,000 ms deadline. No child timeout or predicate assertion failure was reported. The full gate correctly stopped (779 passed, one failed, one FIFO skip); the failing log remains at parent `.artifacts/task25-verification/revision-post-push/`.
- The follow-up splits those seven cases into individual `it.each` tests without changing child deadlines, recipes, samples or 500 ms predicate median bounds. Targeted checks now pass 213 tests (15.29 s); the complete gate passes 786 tests plus one FIFO skip (19.00 s), followed by every remaining gate, in `revision-fixed-pre-push/`. The count increase is from separate cases, not additional runtime behavior. Final post-push verification and Astra verdict are recorded in the PR.

## Scope and approval
User approved semantic-preserving rewrites of zero-based EXACT_PATTERNS #3 #6 #7 #10 #12 #13 #14 #15 #16 #17 #18 #20 #21 #25 and punctuation/command-prefix helpers. Preserve mode, ordered reasons, warnings and lossy-compression permission for every input on which the original main classifier returns a value. F-21 and all unrelated findings remain unchanged. No input cap, search window, reason-based skipping or classifier early return.

## Scope-external exception and equivalence limit
- A separately reported original behavior at multi-million-character inputs raises `RangeError` in an unchanged `hexadecimal-word-boundary` pattern. The proposed Task changes do not address it; runtime scope is frozen pending a separate user decision.
- Reviewer-reported `hexReDoS = /\b[A-Fa-f0-9]{32,}\b/u.test('a'.repeat(6e6) + 'g')` reportedly returns normally at 5e6 and throws `RangeError` at 6e6. This is reviewer-attributed, not locally reproduced unless the separate exception probe artifact records it.
- Reviewer-reported Unicode stress case `('\u3000'.repeat(9) + '\n').repeat(1e6)` (10 million UTF-16 code units) reportedly threw `RangeError` in the original classifier and returned in the current classifier. Attribute this to the reviewer unless locally reproduced.
- Related references: pattern #23 (digits/A), #19 (`id` plus dots), #8 (paths), and #10/#12 (U+3000 whitespace). These are reviewer observations, not newly approved runtime changes.
- Task-level differential equivalence applies to inputs on which the original main classifier returns a value. It does not establish equivalent exception behavior or universal linearity for every possible input.
- The bounded ASCII family measurements at 1, 5 and 10 MiB cover only those recipes and are not a general safety guarantee. At 10 MiB, current-classifier family medians were 0.79–3.04 s in the recorded run. Claude's separate report described roughly 3–5x constant-factor slowdown on linear inputs and 0.8–3.2 s at 10 MiB; these estimates are reviewer-attributed, not local measurements. See [exception evidence](../../research/evidence/task-25/README.md#scope-external-exception-observations).
- `remaining-audit.json` exercised the original main classifier at 10,000 and 20,000 code units only; it is not evidence for multi-million-character safety.
- Local supplemental probes have now run; see the revision checkpoint above. The original historical matrix is preserved.

## Plan and delivery groups
See [approved plan](../../superpowers/plans/2026-10-01-policy-redos.md).
1. A/terminator and lazy patterns: #13/#14/#16/#17.
2. Character-run and suffix patterns: #3/#6/#7/#15/#18/#20/#21.
3. Line starts: #10/#12/#25.
4. Punctuation and command-prefix helpers.
Each group requires predicate-level and whole-output equivalence checks, operation-bound reasoning, and observed performance RED/GREEN. Separate commits, one Draft PR; user controls merge.

## Baseline evidence
- Fresh base npm.cmd test: 755 passed, one Windows FIFO skip, 20 files, 17.82 seconds.
- Original policy source SHA-256: E4503C0B2189AEC05EE8A3349788A033092E9B20F14C7D1C3F4F90734F28F8B1 (worktree bytes). Test-only oracle preserves source body with import-path adjustment and an explicit provenance comment.
- The fixture provenance retains that historical worktree-byte hash in `sourceSha256` and adds `baselineSourceSha256Lf`: `b00296dde8041ca8b952bd774c84e6af87e635eae8068e3a603dcafa47e57ad1`, independently recomputed from the base `src/core/policy.ts` bytes at `5828f02`. The 120 frozen expected entries are unchanged.
- Original classification corpus: 120 cases; characterization test passed. This is GREEN characterization, not performance RED. Expected outputs were captured before any runtime changes and must not be regenerated from the new classifier.
- Astra remaining-pattern screen: 17 cases, two sizes, five raw samples; all bounded children completed without identifying an additional superlinear case in that finite screen. It did not cover the separately reported multi-million-character exception described below.
- [Measurement evidence and reproduction](../../research/evidence/task-25/README.md). Baseline phase retained its 180-second cap and censored records; supplemental runs preserve rather than overwrite those observations. Runtime implementation has not started at this checkpoint.

## Review and execution history
- User-provided Claude review approved the expanded plan and group order; exact external review model not independently verified.
- Actual native gpt-6-astra planning/source review supplied equivalence guidance, identified harness issues, and verified their corrections. Not represented as a fresh Claude/Gemini/Copilot call.
- Luna baseline and corpus workers hit actual usage-limit errors. User-authorized fallback GPT-5.5 execution was confirmed by successful Codex CLI model responses and runtime headers; no model/config substitution.
- npm.cmd ci installed lockfile-pinned dependencies; audit reported two moderate findings. No dependency upgrade attempted in F-03 scope.

## Remaining work and gates
- [x] Complete baseline supplements and commit immutable characterization (95b7846).
- [x] Group 1 RED/GREEN and native review; committed with this checkpoint.
- [x] Group 2 recovered RED/GREEN, independent verification and Astra review; committed with this checkpoint.
- [x] Group 3 RED/GREEN and independent Astra review; committed with this checkpoint.
- [x] Group 4 RED/GREEN and independent Astra review; committed with this checkpoint.
- [x] Whole-classifier before/after matrix, large-input checks and group proofs.
- [x] Scope-external exception observations: 13 bounded probes completed and recorded in the re-review supplement above; runtime remains frozen pending a separate user decision.
- [x] Pre-PR targeted -> full test -> build -> typecheck -> smoke:mcp -> validate:plugin -> benchmark -> diff --check.
- [x] Rebuilt bundle, Draft PR and post-PR verification. Final Astra assessment is recorded in the PR after these checks; user approval is required for integration.

## Safety and boundaries
Root HANDOFF is local/ignored; shared HANDOFF/index is unchanged. Existing main checkout and all prior worktrees/user files remain preserved. No rebase, force-push, history rewriting or merge. Newly confirmed scope-external superlinear behavior or any required classification change stops implementation for user decision. Performance samples and finite differential corpora do not alone justify a universal linearity/equivalence claim.

## Group 1 implementation checkpoint
- Replaced only rules #13/#14/#16/#17; rule slots and full ordered classification loop preserved. [Proofs and raw samples](../../research/evidence/task-25/group-1.md).
- Observed performance RED: original delimiter predicate on 400,000 characters exceeded the 5-second child deadline. GREEN: targeted tests passed; native Astra independently reran 186 tests across three files, all passed.
- Native Astra source/test/proof review: PASS, no unresolved findings. Frozen oracle/corpus files unchanged from baseline commit.
- External cross-check: exact Claude model `claude-opus-5` successfully answered an availability probe; the actual scoped review timed out at 180 seconds with no parseable result. It is NOT a completed review. Gemini API-key configuration does not establish free-tier eligibility, so no potentially paid call was made. Copilot CLI absent and GitHub extensions empty. Cross-check status: DEGRADED for this checkpoint; native Astra independently reviewed the code and tests.
- Main TypeScript project check passed. Script typecheck attempted before build reported missing dist imports; the required final build-before-typecheck gate remains pending.

## Group 2 recovery and verification
- Interrupted candidate had a trace-keyword boundary regression: `traceabcdef` differed from the frozen oracle. Observed differential/helper failures before corrective edits. Removed the extra boundary and locale comparison using the approved factored-whitespace regex; simplified the HTML-tag whitespace expression.
- Added structured predicate/full-output differential cases and corrected the performance recipes to exercise missing-tail failures. Frozen oracle and 120 fixed expectations remain unchanged.
- Recovered performance RED used frozen-oracle children with 5-second limits. This happened after the inherited partial candidate existed; no claim of an untouched-worktree test-first sequence. The original immutable baseline already recorded superlinear behavior before runtime edits.
- Implementer reported 192 targeted tests passed; build then typecheck passed. Generated bundle restored to HEAD pending the final full-Task rebuild. [Proofs, raw samples and source provenance](../../research/evidence/task-25/group-2.md).
- Native Astra independent final verification pending at this record update. Exact Claude Opus 5 scoped source review requested again; no completed external review claimed yet.
- Group 3 test-only preparation is separate: original rules passed semantic/whole-object checks, while rule #10's 400,000-character isolated child exceeded 5 seconds. Its performance loop stopped at #10; no timings for #12/#25 claimed from that test run.
- Final Group2 Astra CLI review: PASS, no blocker/major; one minor proof wording issue corrected from disjoint scans to bounded overlap. Source unchanged after 192/192 independent verification. Native quota failure and successful same-model CLI recovery recorded locally.
- Second scoped Claude Opus5 review timed out at120seconds with no parseable result. External cross-check remains DEGRADED; Astra review is independently completed through OpenAI CLI, not represented as Claude.

## Group 3 verification
- Rules #10/#12 retain multiline starts but consume only horizontal leading whitespace; rule #25 uses a four-state streaming table predicate. [Equivalence arguments and raw measurements](../../research/evidence/task-25/group-3.md).
- Original #10/#12/#25 children each exceeded the 5-second deadline at 400,000 characters. All post-change samples completed at four sizes; timeouts remain explicitly censored.
- Parent fresh targeted verification: 196/196 tests across five files, 15.51 seconds. Frozen oracle, corpus and expected outputs remain unchanged.
- Independent Astra CLI review: PASS, no blocker/major. Corrected the evidence timeout label to per-child (multiple samples run in each child). Supplementary Unicode test suggestions remain nonblocking; existing differential cases and structural proof support equivalence.
- Group4 test preparation observed four semantic tests passing and two genuine 5-second performance timeouts against unchanged helpers. An earlier AST-extraction harness error was corrected before recording these RED results.

## Group 4 verification
- Replaced punctuation stripping with endpoint scans and the third technical-token predicate with a maximal-run scan plus original-string sticky suffix matching. [Equivalence, RED/GREEN and raw samples](../../research/evidence/task-25/group-4.md).
- Parent fresh targeted suite: 202/202 tests across six files, 17.07 seconds. Frozen outputs and test oracle unchanged; F-21 deliberately preserved.
- Native Luna exhausted its quota; actual `gpt-6-luna` CLI execution succeeded and implemented this group. No substitute model or configuration change.
- Astra CLI review found no runtime blocker. It found a missing cumulative deadline and source-hash drift risk in the separate large-input runner; both were corrected before execution. Follow-up checkpoint PASS, no remaining blocker. External cross-check remains DEGRADED for the previously recorded provider limits.

## Whole-Task evidence and pre-PR gate
- [Before/after comparison](../../research/evidence/task-25/comparison.json): all 12 families at three sizes, five raw samples per completed cell; all 36 full classification objects match. The immutable 120-case expected-output fixture remains unchanged from `95b7846`.
- [Large-input measurements](../../research/evidence/task-25/large-current-2026-10-04T03-04-30.270Z.json): 1/5/10 MiB, 12 families, 180 raw samples; all completed within the cumulative 180-second cap. 10 MiB family medians range from 791.05 to 3,044.44 ms. This remains synchronous work; no event-loop latency guarantee is asserted.
- Pre-PR gate: `npm.cmd test` passed 775 tests with one existing Windows FIFO skip (25 files, 20.37 seconds). `npm.cmd run build`, `typecheck`, `smoke:mcp`, `validate:plugin`, `benchmark`, and `git diff --check 5828f02` all passed in order. Logs are local under parent `.artifacts/task25-verification/pre-pr/`.
- Rebuilt tracked bundle and independently rebuilt a scratch output using the same script: SHA-256 `3E504807CD8EECD4F6425A4D1CA5FBF3A43701E9F97CB131B5361051BD63F46D` for both.
- `after.json` records HEAD `b00b503` although the measured source already contained the uncommitted Group4 change. Its raw mixed-line-ending SHA-256 `e137b032d91727a63700a7a7da82bf517d9ef2d0158bc4f0febc4798568f5ef8` normalizes CRLF to LF as `120e3ce5b27ca8f68426349845c73e21f2c870e0cb4278a6e8216173c6f4bad1`, matching the `src/core/policy.ts` Git blob at `07b0f53` and `e51af55`. The original base source LF SHA-256 is `b00296dde8041ca8b952bd774c84e6af87e635eae8068e3a603dcafa47e57ad1`.
- Source commits: Group1 `f97cefc`, Group2 `717f369`, Group3 `b00b503`, Group4 `07b0f53`; all authors/committers verified as the user. One trailing test-line space detected during staging was removed in the delivery commit without rewriting history; historical measurement hashes remain historical.
- No dependency, public API, classifier-output or unrelated finding change. Benchmark F-04/F-05 and F-21 are outside this Task. Finite measurements supplement, rather than replace, the group-specific equivalence and operation-count arguments.

## Draft PR and post-PR verification
- Draft PR #25 opened against main after push; remote head `b84f750` verified at the first post-PR check. GitHub reported OPEN, Draft and MERGEABLE. No merge performed.
- Full post-PR gate passed again: 775 tests, one existing FIFO skip, 25 files, 19.79 seconds; build, typecheck, smoke:mcp, validate:plugin, benchmark and diff check all passed. Local logs: parent `.artifacts/task25-verification/post-pr/`.
- The following documentation-only commit adds this PR link and verification record. Runtime, tests, frozen outputs and rebuilt bundle are unchanged after the post-PR gate. The final Astra review reads the latest pushed state and actual logs; its verdict and remaining notes belong in the PR/user handoff.
- User/Claude review and explicit approval remain required. External-provider review is still DEGRADED; no external PASS or next-Task approval is implied.
