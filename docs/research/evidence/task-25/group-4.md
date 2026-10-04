# Task 25 Group 4: Shell helper redos

## Scope and invariant

Only the private punctuation-strip and command-argument predicates were changed. Classification mode, ordered reasons, warnings and the lossy-compression decision must remain identical for every input. The frozen baseline and characterization fixture are unchanged. F-21's existing `Note:` misclassification is deliberately preserved and remains a separate Task.

## Implementation and equivalence

`stripShellPunctuation` now advances a leading index across exactly ``[('"`]`` and a trailing index across exactly ``[).,;"'`]``, stopping when the indices meet, then returns one slice. The forward pass is completed before the reverse pass, matching the global replacement's non-overlapping behavior on short tokens and long punctuation runs.

`hasCommandArgumentShape` scans maximal `/[a-z0-9._-]/iu` runs by Unicode code point. It records a start only when the original `/iu` word-boundary and `[a-z]/iu` conditions hold, preserving Unicode case-fold cases such as Kelvin sign and long s. At the run end, it requires the same whitespace separator, consumes that whitespace once, and checks the original-input suffix alternatives using a sticky `/iyu` expression. The suffix expression retains its final `\b` and uses the original string so boundary semantics are not changed by slicing.

The scanner visits each input code point a constant number of times. For each candidate run end it consumes the following whitespace once; the outer scan also crosses that whitespace, giving bounded revisiting. Sticky suffix checks are anchored and contain a fixed number of alternatives. Each alternative has at most one unbounded character run before a mandatory disjoint separator or suffix; the permission alternative has two runs separated by a disjoint operator. Their backtracking is at most linear in the immediately following non-whitespace token. Different candidate run ends cannot share that following token unless they share the same preceding whitespace run, which has only one preceding maximal command run. Thus each token receives at most one suffix check plus the outer scan: O(n) total work, with constant auxiliary state. Backtracking within an anchored alternative is retained where needed for exact Boolean equivalence; repeated unanchored suffix rescanning is removed.

## RED provenance

Before implementation, the supplied Group 4 RED was observed after correcting the AST harness setup error. The four semantic checks passed; both original helper performance checks timed out with `ETIMEDOUT` at 5,000 ms on 400,000-character inputs: punctuation containing `npm` plus dots followed by `x`, and repeated `a-` missing-whitespace candidates. The harness setup error was not treated as RED.

## Checks and measurements

- Attempted: `npx vitest run tests/policy-redos-group4.test.ts`.
- Result: NOT RUN. Vitest startup failed because esbuild was denied access to `../../../../..` and could not resolve the worktree `vitest.config.ts` under the sandbox. Parent owns any permitted rerun.
- Parent rerun with permitted execution: `npm.cmd test -- --run tests/policy-redos-group4.test.ts tests/policy-redos-group3.test.ts tests/policy-redos-group2.test.ts tests/policy-redos.test.ts tests/policy-characterization.test.ts tests/core.test.ts` passed 202 tests across six files in 17.07 seconds, including both performance regressions. Local log: `.artifacts/task25-group4-independent.log`.
- [Raw post-change samples and source hashes](group-4.json): both helpers at 100,000 / 200,000 / 400,000 characters, five samples per child. Reproduce with `node tests/helpers/policy-shell-perf-child.mjs src/core/policy.ts <punctuation|commandArgument> <size> 5`, wrapped in a parent 10-second timeout. At 400,000 characters the command-argument median was 5.0897 ms; punctuation stripping returned the unchanged token with constant endpoint work after the first access. Timed regions exclude result compaction and child startup.

## Known constraints

No changes were made to Group 3 tests/evidence, large runners, frozen baseline, or characterization fixture. A newly discovered superlinear case outside the approved scope must be reported for separate approval rather than changed here.
