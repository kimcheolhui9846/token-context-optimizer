# Task 25 Group 3 Evidence

Group 3 covers frozen-oracle zero-based predicates #10, #12 and #25. It preserves the classifier's ordered rule slots and outputs.

## RED observed

- The prepared Group3 characterization records all three semantic predicate comparisons passing against the frozen oracle before the runtime change. The observed performance RED was #10 timing out on the blank-line input; this worker independently reran the original #10 child and also captured timeouts for #12 and #25.
- Original-code child: `tests/helpers/policy-lines-perf-child.mjs tests/helpers/policy-baseline.ts <index> 400000 1`, called from a parent process with `spawnSync` timeout 5,000 ms, `windowsHide: true`, UTF-8 capture, and a 1 MiB output cap. Indices #10, #12 and #25 all returned `ETIMEDOUT` / `SIGTERM`, no stdout, and were killed at the deadline. These are censored observations, not elapsed execution times.
- The exact input recipe is `"\n ".repeat(Math.ceil((size - 1) / 2)).slice(0, size - 1) + "x"`. Each 400,000-unit input is 400,000 UTF-16 code units and 400,000 UTF-8 bytes. Each child performs one small warmup, then one bounded predicate call.
- No original-code timeout result is used as a measured elapsed time. Raw observations are recorded in `group-3.json`.

## Changes and equivalence arguments

- #10 and #12 replace only their leading `/^\s*/m` with `/^[^\S\r\n\u2028\u2029]*/m`; flags and all following expression text remain unchanged. The old prefix could consume multiple line terminators before a command/keyword. With `/m`, the same expression can restart immediately after its last consumed line terminator, then consume the remaining horizontal whitespace. JavaScript multiline `^` recognizes LF, CR, U+2028 and U+2029, matching the excluded set. Each attempt now consumes only horizontal whitespace before its first non-horizontal character. In #10, the existing optional `sudo`/`doas` separator remains unchanged; its whitespace runs follow distinct command-prefix tokens and are not repeatedly revisited.
- #25 replaces `/(?:^|\n)\s*\|.+\|\s*(?:\n|$)/u` with a four-state streaming NFA. The states are: (1) leading `\s*` after a candidate start, (2) just after the opening pipe with zero body characters, (3) after at least one body character, and (4) after a possible closing pipe while consuming trailing `\s*`. Inject the leading state at input offset zero and immediately after every literal LF, because the prefix alternative is `^` or LF, not `/m`.
- From state 1, whitespace loops and `|` enters state 2. State 2 advances only on JavaScript dot characters and enters state 3, enforcing `.+`'s one-character minimum. State 3 loops on dot characters; a pipe both remains a possible body character and branches to state 4, because that pipe can either be content or the closing delimiter. State 4 loops on `\s*`, accepts at a literal LF, and accepts at actual input end. Dot characters exclude exactly LF, CR, U+2028 and U+2029; `\s*` retains JavaScript's full whitespace set. The unflagged `$` is modeled as actual end-of-input; LF after the closing pipe is handled by the explicit alternative. Identical active candidates merge into one Boolean state because they have identical future transitions. The four booleans update once per code point, so the scan is O(n) time and O(1) state.
- No public export, schema or generated bundle changed.

## GREEN and verification

- `npm.cmd test -- --run tests/policy-redos-group3.test.ts`: PASS, 1 file / 4 tests.
- `npm.cmd test -- --run tests/policy-redos-group3.test.ts tests/policy-redos-group2.test.ts tests/policy-redos.test.ts tests/policy-characterization.test.ts tests/core.test.ts`: PASS, 5 files / 196 tests.
- `npm.cmd run typecheck`: PASS. No build was run; `dist` was already present in this worktree.
- The initial sandboxed Vitest run failed because esbuild could not access the worktree config (`Access is denied`). The escalated rerun of the same combined test command passed. The denial and rerun are environment evidence, not test failures.
- Post-change raw timings are recorded at four sizes (50k, 100k, 200k and 400k) with five timed samples per size and predicate in `group-3.json`. Every sample returned false. All child processes completed below the 10-second measurement timeout.

## Provenance and review state

- Worktree: `C:\Users\00\Desktop\codex_plugin_and_skill\.artifacts\worktrees\task-25-policy-redos`
- Branch HEAD during measurement: `717f369ea61b2aba701613fab3922dbd99e9b6c2`; working tree also contains the approved Group3 source/test changes and concurrently owned files.
- Frozen oracle origin: `5828f02840304067e8d345969ffc7c1a981650ec`; exact file/source hashes are recorded in `group-3.json`.
- Runtime: Node `v24.18.0`, `win32`, `x64`.
- Source and tests are frozen and ready for independent Astra review. No Group3 commit, push, PR or external-provider review is claimed here.
