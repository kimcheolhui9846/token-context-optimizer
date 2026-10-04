PR: pending | Branch: codex/task-25-policy-redos | Base: main 5828f02840304067e8d345969ffc7c1a981650ec

# Task 25 — F-03 classifier ReDoS

## Scope and approval
User approved semantic-preserving rewrites of zero-based EXACT_PATTERNS #3 #6 #7 #10 #12 #13 #14 #15 #16 #17 #18 #20 #21 #25 and punctuation/command-prefix helpers. Preserve mode, ordered reasons, warnings and lossy-compression permission for every input. F-21 and all unrelated findings remain unchanged. No input cap, search window, reason-based skipping or classifier early return.

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
- Original classification corpus: 120 cases; characterization test passed. This is GREEN characterization, not performance RED. Expected outputs were captured before any runtime changes and must not be regenerated from the new classifier.
- Astra remaining-pattern screen: 17 cases, two sizes, five raw samples; all bounded children completed and no new out-of-scope superlinear case was identified. Finite screening is not universal complexity proof.
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
- [x] Pre-PR targeted -> full test -> build -> typecheck -> smoke:mcp -> validate:plugin -> benchmark -> diff --check.
- [ ] Rebuilt bundle, Draft PR, post-PR verification and final Astra review.

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
- Source commits: Group1 `f97cefc`, Group2 `717f369`, Group3 `b00b503`, Group4 `07b0f53`; all authors/committers verified as the user. One trailing test-line space detected during staging was removed in the delivery commit without rewriting history; historical measurement hashes remain historical.
- No dependency, public API, classifier-output or unrelated finding change. Benchmark F-04/F-05 and F-21 are outside this Task. Finite measurements supplement, rather than replace, the group-specific equivalence and operation-count arguments.
