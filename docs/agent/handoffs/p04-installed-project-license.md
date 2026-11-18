# P04 installed project license

Tier C. [Draft PR #124](https://github.com/kimcheolhui9846/token-context-optimizer/pull/124) targets `main` after #119 (`011db6a`). Its integration baseline `8ab526b` contains #116 (`1112702`) and #118 (`8f500e4`). The license-delivery diff starts at that baseline.

## What ships

- The build reads the root `LICENSE` and embeds its complete MIT text and copyright line at the beginning of `bin/token-context-optimizer.mjs`, immediately after the shebang and the project notice heading. Project license text preserves whitespace and uses LF line endings.
- The third-party notices follow under their existing heading. From this heading through the end of the executable, the shipped bytes match the integration baseline. The lockfile and installer file list also match that baseline.
- The build helper and its TypeScript declaration accept the project license. The README identifies its location in the installed bundle.
- The regression tests in `tests/image-packaging.test.ts` and `tests/third-party-notices.test.ts` cover the real isolated installer, exactly four installed files, the unique complete license, CRLF and trailing whitespace, and comment-terminator rejection.

## Verification

- RED on the unchanged integration bundle. The new real-install test failed because the project license section was missing. The original targeted run passed after the build change. The final targeted suite passed 14/14.
- Two fresh builds and the installed executable matched the committed bundle. SHA-256 `782663cc7601ddfdf28c005e1c1dd554a81e2e03f7195ef9cb854e8824322feb`.
- Post-draft clean checkout at `a919377`: 54 test files passed, 4,471 tests passed and five skipped with the default timeout. Clean install, both builds, typecheck, MCP smoke, manifest validation, benchmark and the scoped diff check passed.
- During implementation, two existing policy tests hit their default 5-second timeout in a full run. Their isolated default run passed. The full run at a 30-second limit passed 4,470 tests with five skipped before the final whitespace test was added.
- Runtime audit returned zero. Full audit reported five high development-tool packages affected by one picomatch advisory. This task preserves the integration lock. [GitHub Advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
- Local worker evidence is in `.artifacts/p04-installed-project-license/` in the task worktree. The coordinator ran a separate clean-checkout gate after opening the draft.

## Review and approval

- Implementer — GPT-5.6 Luna.
- Claude Code Opus 5.5, initial plan — proceed with conditions, 0 blocker, 3 major, 2 minor, 1 note.
- Claude Code Opus 5.5, milestone — changes requested, 0 blocker, 1 major, 3 minor, 2 notes. The main finding was the missing TypeScript option declaration.
- Claude Code Opus 5.5, scoped re-review at `a919377` — approve, 0 blocker, 0 major, 1 minor, 3 notes. This handoff corrects the minor wording about the declaration and review notes.
- Ready and merge await user approval. #116 and #118 remain separate open drafts.
