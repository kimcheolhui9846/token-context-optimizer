# Task 25 Group 2 Evidence

Group 2 covers zero-based predicates #3, #6, #7, #15, #18, #20 and #21, plus the duplicated technical-token helper path. This is implementation evidence for the approved equivalence scope; it does not claim that the complete classifier is linear.

## RED observed

- Before the corrective source edits in this continuation, `npm.cmd test -- --run tests/policy-redos-group2.test.ts` reported 2 failures and 2 passes. Predicate #21 and the duplicated helper both returned false for `traceabcdef`, while the frozen oracle returned true. The frozen full-corpus comparison and the then-current bounded performance test passed.
- The candidate runtime was already partially edited when this RED was recovered. This is not evidence that a newly added test failed against a completely untouched implementation.
- Frozen-oracle child command: `node tests/helpers/policy-predicate-perf-child.mjs tests/helpers/policy-baseline.ts <index> <family> 400000 1`, bounded by a parent `spawnSync` timeout of 5,000 ms. It returned `ETIMEDOUT` / `SIGTERM`, no stdout, on #3 `uri`, #6 `dotted` with `a-` repetitions ending in `!`, #7 `filename`, #15 `bang`, #18 `tag`, #20 `identifierId`, and #21 `trace`. Each timed-out child was terminated. The earlier #6 `a.` recipe completed in 0.791 ms and was a control, not RED; the recipe was corrected to repeated `a-` with no dot.
- The timed-out rows are censored at 5 seconds; those values are deadlines, not measured execution times. Raw outcomes are in `group-2.json`.

## Changes and equivalence argument

- #3 scans the original input once while tracking whether the current scheme-character run contains a legal ASCII-letter start at the original Unicode `\b` boundary; a colon succeeds only after such a start. This preserves the original scheme grammar and avoids rescanning suffixes for each candidate start.
- #6 tracks each Unicode-letter/number/underscore/hyphen stem run, its earliest ASCII-word-boundary-eligible letter or number, and the stem distance. For each dot it checks at most 12 ASCII alphanumeric extension characters and the original ASCII `\b` endpoint. This preserves the two-character stem minimum, the ASCII extension range, and Unicode boundary behavior with bounded work per input character.
- #7 tracks the earliest original ASCII `\w` boundary within each filename run, checks the same finite extension set at dots after at least one stem character, and applies the original endpoint boundary. Each dot checks the fixed extension set; no suffix is rescanned.
- #15 advances past invalid `<!` openers and tests for `>` only after the earliest opener followed by an ASCII letter. A later opener cannot provide a closer to the left of the earliest qualifying opener; each subsequent search starts after the rejected candidate.
- #18 now uses the original tag expression with `(?:\s[^<>]*)?`. This is language-equivalent to `(?:\s+[^<>]*)?` because after the required first whitespace, `[^<>]*` can consume every additional whitespace character. Angle delimiters bound the candidate scans.
- #20 uses a constant-state scan to retain possible identifier-name, `-id`/`_id`, separator, and value prefixes. It merges equivalent active prefixes, tracks the greatest value length, and checks every possible endpoint for the original `\b`. Optional separator semantics, `iu` folds, and value alphabet remain covered by differential fixtures.
- #21 uses the approved factored whitespace expression with the original keyword alternatives, value alphabet, flags and boundaries. Factoring the optional delimiter with its following whitespace preserves the language and removes ambiguous whitespace partitions. Failed value scans may overlap: for example, both keywords in `trace-span` followed by many hyphens scan the tail. The number of overlapping failed candidates is bounded by the fixed keyword lengths and six-character acceptance threshold, as detailed below.
- Both helper paths now use the same #6 and #21 predicates through the existing predicate dispatcher. The now-unused `nextCodePointIndex` helper and the old locale-based trace keyword scanner were removed.

The equivalence details above rely on these nullable and state-dominance properties of the frozen expressions:

- #3's trailing `[^\s]*` tail is nullable; once a legal scheme prefix reaches a colon, no payload character is required. The scan's legal-start bit is sufficient even when a run contains later letters.
- #6's repeated dotted-extension groups add no language: after any valid 1–12 character ASCII extension, another dot is nonword and the preceding extension character is word, so the original `\b` already succeeds before a later extension. The active stem count begins at the earliest eligible Unicode letter/number and includes its required following stem character.
- #7's optional `(?::\d+(?::\d+)?)?` location tail is nullable. If an extension is followed by a colon, the endpoint immediately after the extension already has the required word boundary, so consuming a numeric location cannot add a match.
- #20 models the optional separator with an epsilon edge from `gap1` to `gap2`. It applies the original `iu` character and boundary tests at each code-point position, retains all possible finite-prefix states, and stores the maximum active value length. At a given endpoint, a shorter value prefix cannot accept when the maximum cannot; once the maximum reaches six, every endpoint is checked for the original boundary. This is why maximum-length dominance preserves all accepted values, including punctuation endings and Unicode folds.
- #21 has bounded-length keyword alternatives and requires an `iu` boundary at each candidate start. Whitespace gaps end at the next non-whitespace character. Within a shared value run, a later keyword boundary at least six value characters after an earlier candidate makes that earlier candidate succeed. Therefore failed overlapping candidates must start within a fixed-size prefix of that value run; a disallowed character ends the shared scan. Each suffix region is scanned only a constant number of times. The bound is O(n), with bounded overlap rather than disjoint failed scans.

## GREEN and measurements

- `npm.cmd test -- --run tests/policy-redos-group2.test.ts tests/policy-redos.test.ts tests/policy-characterization.test.ts tests/core.test.ts`: PASS, 4 files / 192 tests. This includes independent predicate comparisons, structured identifier/trace/dotted-token cases, Unicode `ſ`/`K` and astral boundary witnesses, ordered full-classification comparisons, frozen corpus equality, and 400,000-character bounded false-input checks.
- `npm.cmd run build`: PASS. The command regenerated `bin/token-context-optimizer.mjs`; that generated file was restored to HEAD because bundle changes are outside this Group2 checkpoint.
- `npm.cmd run typecheck`: PASS after the build produced the `dist` files required by the script typecheck.
- A preceding typecheck before build failed only because `dist/src/research/*.js` did not exist in the fresh worktree; it passed after build.
- Post-change raw three-sample measurements at 400,000 UTF-16 code units / 400,000 UTF-8 bytes are recorded in `group-2.json` for all seven predicates. The corrected #6 `a-` repetition recipe completed in 12.548, 9.757 and 9.555 ms, with false returned on each sample.

## Provenance

- Worktree: `C:\Users\00\Desktop\codex_plugin_and_skill\.artifacts\worktrees\task-25-policy-redos`
- Branch HEAD at measurement: `f97cefc99f86f92ebc1d264587c6a61213dfb1c9`; working tree contained the inherited partial candidate and these Group2 changes.
- Frozen oracle origin: commit `5828f02840304067e8d345969ffc7c1a981650ec`; oracle file SHA-256 and measured file hashes are recorded in `group-2.json`.
- Runtime: Node `v24.18.0`, `win32`, `x64`.
- Review state: implementation and tests are frozen and ready for Astra review. No commit, push, PR, or external provider review is claimed here.
