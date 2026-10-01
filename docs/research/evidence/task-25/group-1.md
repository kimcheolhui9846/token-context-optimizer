# Task 25 group 1 evidence

Scope: zero-based rules #13, #14, #16, and #17 only. Frozen oracle, corpus, baseline, handoff, and plan files were not changed during this runtime step.

## RED

`npm.cmd test -- --run tests/policy-redos.test.ts` was run against the original regex implementation before runtime edits. The differential and frozen-corpus tests passed, and the large delimiter predicate test failed by child timeout after 5 seconds with `ETIMEDOUT`. That failure was an actual predicate timing failure through `tests/helpers/policy-predicate-perf-child.mjs`, not a module-load or usage error.

## GREEN

After replacing the four approved predicates, `npm.cmd test -- --run tests/policy-redos.test.ts` passed 3/3 tests. `npm.cmd test -- --run tests/policy-characterization.test.ts tests/core.test.ts` passed 183/183 tests.

Post-fix raw predicate timing evidence is in `group-1.json`. Each row uses a 400,000 UTF-16 code unit hostile input, five timed samples, a same-family small warmup, and a 20 second child timeout.

Metadata:

- HEAD during measurement: `95b78469d38694860a37b716c79f39e426e3dcf2`
- Source: `src/core/policy.ts`
- Source SHA-256 during measurement: `44e37c89272dbffa0552fb1e0eeeed0ab47ed2866bec299e19cad42db7ef4558`
- Source dirty: `true`

| Rule | Family | Median ns | Median ms |
| --- | --- | ---: | ---: |
| #13 | sql-keyword-sequence | 371200 | 0.371 |
| #14 | delimiter-syntax-tail | 819000 | 0.819 |
| #16 | php-block | 367400 | 0.367 |
| #17 | html-comment | 559000 | 0.559 |

## Equivalence Arguments

- #13 SQL keyword sequence: the original accepts when a full leading SQL keyword is followed by a later full trailing SQL keyword. The replacement finds the earliest leading keyword with the original `/u` ASCII word-boundary semantics, then scans the original string for any trailing keyword whose start is at or after the leading match end. A later leading keyword cannot create a witness that the earliest leading keyword would not also witness.
- #14 delimiter syntax tail: the original accepts when `[{};]` is followed by `=>`, `=`, `(`, `)`, or `.`. Since `=>` contains `=`, scanning for a later `=`, `(`, `)`, or `.` after the earliest delimiter preserves the Boolean language.
- #16 PHP block: the original accepts when a complete `<?` plus ASCII-letter opener has a later `?>`. If any later opener has a closer, that closer is also later than the earliest complete opener.
- #17 HTML comment: the original accepts when `<!--` has a later `-->`. If any later opener has a closer, that closer is also later than the earliest opener.

## Linear Operation Bounds

- #13 SQL keyword sequence: at most one full scan by `SQL_LEADING_KEYWORD` until the first leading match, followed by one full scan by `SQL_TRAILING_KEYWORD` over the original string. Each regex has fixed finite alternatives and no nested quantified suffix, so the bound is O(n) in input length.
- #14 delimiter syntax tail: one `search(/[{};]/u)` finds the earliest delimiter or reports none, then a single index-increment loop scans each remaining UTF-16 code unit at most once for `=`, `(`, `)`, or `.`. The bound is O(n).
- #16 PHP block: one global fixed-opener regex scan finds the earliest complete `<?` plus ASCII-letter opener, then one `indexOf("?>", start)` scans forward for the closer. The bound is O(n).
- #17 HTML comment: one `indexOf("<!--")` scans for the earliest opener, then one `indexOf("-->", opener + 4)` scans forward for the closer. The bound is O(n).

## Reproduction Commands

Run from the repository root:

```powershell
node tests/helpers/policy-predicate-perf-child.mjs src/core/policy.ts 13 sql 400000 5
node tests/helpers/policy-predicate-perf-child.mjs src/core/policy.ts 14 delimiter 400000 5
node tests/helpers/policy-predicate-perf-child.mjs src/core/policy.ts 16 php 400000 5
node tests/helpers/policy-predicate-perf-child.mjs src/core/policy.ts 17 comment 400000 5
npm.cmd test -- --run tests/policy-redos.test.ts
npm.cmd test -- --run tests/policy-characterization.test.ts tests/core.test.ts
node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit
```

The group-1 differential test compares the private predicates against the frozen oracle on explicit SQL boundary cases, Unicode adjacency, CR/U+2028/U+2029 separators, PHP/comment overlap cases, repeated same-input calls, alternating positive/negative calls, generated short strings, and the complete frozen corpus at full-classifier level.
