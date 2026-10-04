# Task 25 — F-03 classifier ReDoS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans after explicit user approval. This is one delivery Task; steps below are not separately numbered Tasks.

**Goal:** Replace the four reported superlinear predicates with linear-time equivalents without changing classification for any input.
**Architecture:** Preserve the ordered rule pipeline and Set insertion order. Use bounded passes for existence predicates and remove ambiguous whitespace partitioning. Test predicate semantics independently as well as complete classification, because shared reasons can mask a changed predicate.
**Tech Stack:** TypeScript, ECMAScript RegExp, Node >=22, Vitest, existing bundle tooling. No dependency/API/schema changes.
**Status:** APPROVED with expanded scope on 2026-10-01; original planning text below is supplemented by the amendment. Base main `5828f02840304067e8d345969ffc7c1a981650ec`; branch `codex/task-25-policy-redos`. No implementation or tests executed in this new worktree.

## Constraints and acceptance criteria
- Every input retains mode, reasons with exact insertion order, warnings and lossyCompressionAllowed result. No window, input truncation, early classifier return, reason-based skipping or reordered rules. Preserve all original flags and Unicode/word-boundary behavior.
- Scope is F-03. Preserve even known F-21 secret false positives (including Note:). Do not change benchmark meaning gates, paper claims, image findings or dependencies.
- Finite corpus agreement is evidence, not a universal equivalence proof. Each changed predicate needs both a language-equivalence argument and a linear operation-bound argument.
- Additional superlinear findings are reported before expanding the four-rule implementation; do not claim the whole classifier is linear if residual risks remain. If any output change seems unavoidable, stop and report before changing behavior.
- No rebase, force-push, amend or main commits. Root HANDOFF stays local/ignored; shared docs/agent/HANDOFF.md remains untouched. Draft PR after approved implementation; no merge without authorization.

## Expected files
- Modify `src/core/policy.ts`: only approved predicate implementation and minimal internal wiring.
- Create `tests/policy-redos.test.ts`: differential/characterization and performance regressions; keep existing core tests.
- Create `tests/fixtures/policy/characterization.json`: frozen original full classification objects and deterministic recipes/provenance.
- Create `tests/helpers/policy-baseline.ts`: exact original classifier oracle, source SHA and explicit legacy-test-only warning; never import into production. Run large hostile legacy inputs only in killable children.
- Create `docs/research/evidence/task-25/measure-policy.mjs`, `baseline.json`, `after.json`, `README.md`: reproducible measurement, raw samples, environment/source hashes, proofs, coverage and limits. Optional small child harness belongs in this same directory.
- Update `bin/token-context-optimizer.mjs` only through existing build.
- Create `docs/agent/handoffs/task-25.md`; maintain this plan and ignored root HANDOFF. Do not edit public exports just for test access; tests may use TypeScript transpilation with test-only appended exports for individual internal predicates, without changing production module exports.

## 1. Baseline and bounded whole-file audit (before runtime changes)
- [ ] Install pinned dependencies with npm.cmd ci, establish existing core suite and full baseline. Build before script typecheck because scripts import dist.
- [ ] Record Node, platform, git SHA and policy source SHA-256. Preserve original oracle independently of rewritten rules.
- [ ] Audit all EXACT_PATTERNS, visual/semantic checks, containsShellCommand, containsTechnicalTokenShape and their private helpers. Measure each predicate separately and classifyContext, not merely selected matches.
- [ ] Use child processes with hard deadlines, capped lengths, no unbounded main-process legacy call; log timeouts as censored observations, never fabricated elapsed times. Start small and increase only while within budget. Measurements are sequential, not concurrent with builds/tests.
- [ ] Static Astra audit candidates: #15 repeated <!a, #17 repeated <!--; #3/#6/#7/#20 repeated a- with missing required delimiter; #10/#12/#25 blank-line runs; #21 and duplicate helper long whitespace with missing value; technical command prefix repeated a-; stripShellPunctuation trailing punctuation followed by a nonpunctuation. These are UNMEASURED hypotheses, not confirmed findings.
- [ ] For any additionally measured superlinear case, report input recipe, raw timings, affected predicate/call path, output behavior and equivalent-rewrite proposal. If any additional case is confirmed, pause for a scope decision before any runtime edits, including the four originally listed replacements. Fixing only four rules is not accepted as proof of a wholly linear classifier.

## 2. Original behavior characterization (GREEN baseline, not RED)
- [ ] Inventory actual classifier inputs in tests/core.test.ts, benchmark fixture builders, source fixtures, and smoke requests; include literal and dynamically generated inputs with source locations. Do not label every unrelated binary fixture as classifier coverage.
- [ ] Run the unmodified oracle and commit full expected objects. Store large hostile inputs as deterministic recipes plus length/hash and original outputs; no private user text or secrets.
- [ ] Include empty/unknown/visual/semantic, all reason categories and mixed reason order, long-prefix late positives, missing closers, multiple openers, CR/LF/CRLF/U+2028/U+2029, Unicode whitespace, ASCII vs non-ASCII letters, astral characters and isolated surrogate code units.
- [ ] SQL witnesses: FROM, WHERE, FROM FROM, WHERE FROM, SELECTFROM, SELECT FROM, FROMSELECT, newline-separated keywords, keyword followed/preceded by underscore/digit/non-ASCII letter; preserve uppercase-only behavior and prevent self-overlap.
- [ ] Individual-predicate differential tests: bounded exhaustive short strings over representative character classes plus seeded generated multi-token strings. Compare original and new truth values even when another rule already adds code_syntax.
- [ ] Full classifier compares exact arrays and warnings, including cases where code_or_path is added before/after code_syntax via helpers. Freeze F-21 behavior deliberately.

## 3. Performance RED
- [ ] Add isolated regression tests for DROP repetitions, semicolons, repeated <?a, and <a followed by whitespace with no >. Include hundreds-of-KB inputs; record UTF-16 length and encoded bytes separately.
- [ ] Prepare 3 sizes (50/100/200 KiB-equivalent characters) for evidence, plus a 400 KiB semicolon CSV end-to-end case. Keep exact recipe/rounding in the results.
- [ ] Measure startup separately; child reports only predicate/classifier elapsed time. Warm up on small inputs, collect at least 5 timed samples per completed size, record every sample and median, use identical recipes/Node/environment before and after.
- [ ] Hard limit: 20 seconds per evidence child, 180 seconds cumulative per phase before reporting partial/censored evidence. Never leave a hung child. RED CI regression uses a generous bounded execution budget selected and frozen from baseline; optionally median doubling ratio <3 only when measurements exceed timer-noise floor. Do not divide microsecond samples or claim noisy ratios prove complexity.
- [ ] Observe original-code failure first. Separate true performance RED from existing GREEN semantic characterization. If timing cannot distinguish old/new robustly, report before choosing a weaker assertion.

## 4. Minimal equivalent replacements
Preserve each predicate at its original zero-based slot/reason; a RegExp-or-predicate internal representation is acceptable without public API changes.

- [ ] #13: get earliest full A keyword match. Find a full B keyword whose start is >= A.end (or last B start with the same comparison). Scan B on the original string using a fresh/state-reset global regex so slicing does not alter left word-boundary context. A and B can share FROM/WHERE; a single occurrence cannot satisfy both. No repeated suffix scan per A.
  Proof: if any A has a later B, the earliest A ends no later than that A; conversely a B after the earliest A directly witnesses the original expression. Keyword alternatives are finite/non-overlapping full words. Two linear scans.
- [ ] #14: earliest delimiter matching `[{};]`, then find =, (, ) or . after that delimiter. The original => alternative is subsumed by =. Do not start the suffix at A.start.
  Proof: earliest-A/later-B witness as above; fixed character scans are linear.
- [ ] #16: earliest complete opener matching /<\?[A-Za-z]/u, then indexOf('?>', opener.index + opener[0].length). A later opener cannot rescue a missing closer after the earliest one; no repeated suffix search.
- [ ] #18: replace `(?:\s+[^<>]*)?` with `(?:\s[^<>]*)?`, retaining all other source/flags. Every whitespace is included in [^<>], so language is unchanged. Inspect repeated malformed candidates and tag-name boundaries to confirm total scanned intervals are bounded, not just one-match complexity.
- [ ] No broad regex cleanup. Run individual and full-object equivalence suites after each replacement. Mismatch is a stop condition, not a snapshot-update opportunity.

## 5. GREEN, integration safety and measurements
- [ ] Confirm frozen corpus is byte-for-byte unchanged; compare complete objects on all original corpus recipes plus new differential corpus. Do not regenerate expectations from new implementation.
- [ ] Add summarizeArtifact and MCP classify_context regression coverage using existing transport/test infrastructure where needed: exact content remains lossily unsummarizable, errors and output shape unchanged. Existing callers need no implementation edits.
- [ ] Run same raw timing matrix against old and new source revisions. Record commit/blob/file hashes and dirty status as appropriate; no invented future commit SHA. Re-run stable compiled source after commit if exact revision evidence is required.
- [ ] Supplement measured growth with operation-bound explanation; a Map/regex mutation may preserve semantics, so timing/structural complexity evidence is distinct from output tests.

## 6. Ordered verification, delivery and review
- [ ] Gate in required order: targeted tests -> npm.cmd test -> npm.cmd run build -> npm.cmd run typecheck -> npm.cmd run smoke:mcp -> npm.cmd run validate:plugin -> npm.cmd run benchmark -> git diff --check.
- [ ] Verify generated bundle corresponds to source and contains unchanged dependency notices. Record independent scratch rebuild/hash equality.
- [ ] Inspect scoped diff, update Task handoff and evidence, verify author/committer kim cheol hui <144594976+kimcheolhui9846@users.noreply.github.com>. Commit/push Task branch and create one Draft PR against main. No code commit or PR in this planning-only turn.
- [ ] After PR opens, run final local gate and actual Astra final review. Resolve in-scope blocker/major; report external provider availability honestly and keep user Claude review as next approval gate.

## Initial planning review and current boundary
Actual native gpt-6-astra planning audit inspected the source and confirmed the equivalence approach plus additional static risks. No runtime performance probes or implementation were performed. External provider review is not claimed; this plan is submitted for the user's Claude review. User approval is required before step 1 implementation setup/measurement begins.

## Approved scope amendment — 2026-10-01
- User/Claude approved the process and expanded runtime scope to zero-based rules #3 #6 #7 #10 #12 #13 #14 #15 #16 #17 #18 #20 #21 #25 plus punctuation removal/command-prefix helper paths. Earlier four-rule stop wording is superseded only for these approved cases.
- Reproduce user-provided timings on original 5828f02 and retain raw observations. Newly confirmed cases outside this expanded scope still stop all runtime edits for user decision.
- Four atomic implementation groups, each with equivalence/linear-operation argument, differential tests and observed performance RED/GREEN: (1) #13/#14/#16/#17, (2) #3/#6/#7/#15/#18/#20/#21, (3) #10/#12/#25, (4) punctuation and command-prefix helpers. One Task branch and Draft PR.
- Entire classifier before/after timings must cover every pathological family at three sizes. Large post-fix near-10MiB probes have hard child deadlines; original vulnerable runs are bounded/censored rather than allowed to hang. Do not call the whole classifier linear without complete measurements plus per-group arguments.
- Test oracle is strictly test-only. Future intentional behavior changes such as F-21 require explicit, coordinated updates to the oracle and frozen expectations. No such change is allowed now.
- Runtime editing is held until original characterization is frozen and remaining-pattern audit is assessed. Parent owns shared plan/HANDOFF and commits; disjoint baseline/corpus workers preserve one another's files. No simultaneous production-file edits.

## Expanded implementation proof notes (Astra source review)
- Keep predicates at their original array slots, preserve all reason insertions, and update duplicated technical-token predicates consistently.
- Group 1: earliest complete opener plus later terminator; SQL uses full original-string boundaries and distinct non-overlapping A/B occurrences; => is subsumed by =.
- Group 2: URI can scan maximal scheme-character runs and track eligible ASCII-letter boundary starts; trailing optional payload is Boolean-redundant. Dotted token needs stem length >=2 and extension length1..12; repeated extension groups are existentially redundant because a dot after the first extension already supplies the final boundary. Filename optional numeric location is Boolean-redundant; retain finite-extension endpoint boundaries. Identifier suffix needs a constant-size streaming state machine that merges candidates and checks every possible value endpoint, including punctuation. #21 factors whitespace as \s*(?:[:=]\s*)?; /iu classes and boundaries retain U+017F/U+212A behavior. #15 opener+later>; #18 disjoint angle-delimited scans after removing whitespace partition ambiguity.
- Group 3: initial /^\s*/m for #10/#12 can become /^[^\S\r\n\u2028\u2029]*/m: any old match can restart after its last leading line terminator. #25 needs a fixed streaming automaton; LF-only start/end alternatives, JS dot exclusions and real end semantics must remain distinct from /m.
- Group 4: strip punctuation by left/right indices and one slice; command-prefix and suffix candidates need bounded state tracking, including final /iu boundary after slash or assignment-ending alternatives. Do not normalize by lowercase to emulate /iu.
- These are proof obligations/design guidance, not evidence of completed implementation or measured complexity. Each proposed simplification is accepted only after independent-predicate differential tests and full-object checks.

## Execution checkpoint — 2026-10-04
The original checklists above preserve the approved planning snapshot. Current execution status and exact commands/results are maintained in [Task 25 handoff](../../agent/handoffs/task-25.md) and [evidence index](../../research/evidence/task-25/README.md).
- All four implementation groups completed in separate commits with independent Astra review. Group2's inherited partial implementation required a corrective differential RED; its chronology is explicitly recorded rather than presented as an uninterrupted test-first sequence.
- The final comparable before/after matrix uses the bounded 10k/20k/40k baseline sizes, not the earlier proposed 50k/100k/200k set. All 36 classifier cells include five raw samples and unchanged full outputs. Additional predicate probes cover hundreds of thousands of characters; current-only whole-classifier probes cover 1/5/10 MiB. No vulnerable near-10MiB baseline is attempted.
- Frozen oracle and 120 expected outputs remain unchanged. Pre-PR full gate passed (775 tests, one existing skip), and the rebuilt bundle matches an independent scratch rebuild.
- External provider review is DEGRADED: two exact Claude Opus5 reviews timed out; Gemini free-tier eligibility is unverified; Copilot callable access is unavailable. Successful Astra reviews are separately identified as OpenAI model reviews.
- Draft PR, post-PR gate and final Astra assessment are the remaining delivery checks at this checkpoint. User approval remains required before the next Task or merge.
