# Codex Handoff

## Current Objective

Implement the local install workflow for `token-context-optimizer` on branch `feature/local-install-workflow`.

## Workspace

- Path: `C:\Users\00\Desktop\codex_plugin_and_skill`
- Current branch: `feature/local-install-workflow`
- Base branch: `main`
- GitHub repo: `https://github.com/kimcheolhui9846/token-context-optimizer`
- MVP PR merged: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/1`
- MVP merge commit: `b5059774caee85c020e284a04e97f22b255162c4`
- Source PDF recovery hint: use the only checked-in PDF in the repo root if the filename renders incorrectly.

## Completed Work

- Merged PR #1 into `main`.
- Created branch `feature/local-install-workflow`.
- Added design spec: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`.
- Added implementation plan: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`.
- Replaced this handoff with current branch state and next steps.
- Task 1 complete: added `scripts/install-local-plugin.mjs` and `npm.cmd run install:local`.
- Task 2 complete: added `scripts/verify-installed-plugin.mjs` and `npm.cmd run verify:installed`.
- Updated README with local install, custom target, and reboot recovery commands.
- Full gate complete for local install workflow.
- First local-install code review requested changes:
  - Reject unrelated non-empty install targets before overwriting `.mcp.json` or other runtime files.
  - Preflight all runtime sources before modifying an existing install.
  - Reject symlinked destination path components.
  - Wait for MCP child process exit after SIGTERM/SIGKILL in verifier shutdown.
  - Update stale workflow docs.
- Review fixes completed:
  - Added regression tests for conflicting targets, missing bundle partial-update prevention, and symlinked target components.
  - Installer now preflights all sources as regular files before touching the target.
  - Installer now accepts only empty targets or targets with a matching `token-context-optimizer` manifest.
  - Installer now rejects symlinked install target and runtime destination components.
  - Verifier and smoke shutdown paths now wait for child `exit` after termination signals and handle child `error`.
  - README, design spec, implementation plan, and this handoff now reflect the safety contract.
- Second local-install code review requested one blocking fix:
  - Reject symlinked or junctioned runtime destination components inside an otherwise owned target.
- Second review fix completed:
  - Added a nested `target\bin` junction regression that verifies external files are not overwritten.
  - Installer now preflights every runtime destination path before creating directories or copying files.
- Final independent review attempt:
  - Requested a `code-reviewer` subagent after staging and full verification.
  - Review did not complete because the native subagent surface returned a usage-limit error.
  - `omx code-review --help` could not run because `omx` is not on PATH in this shell.
  - Treat the branch as verified but not independently approved; open the PR for review rather than marking it merge-ready.

## Design Summary

- Installer copies only runtime files:
  - `.codex-plugin/plugin.json`
  - `.mcp.json`
  - `bin/token-context-optimizer.mjs`
  - `skills/optimize-context/SKILL.md`
- Default destination order:
  1. `--target <path>`
  2. `TCO_PLUGIN_INSTALL_DIR`
  3. `${CODEX_HOME}\plugins\local\token-context-optimizer`
  4. `%USERPROFILE%\.codex\plugins\local\token-context-optimizer`
- Verifier starts the installed bundle from the plugin root and indexes a temporary workspace fixture through explicit `TCO_ALLOWED_ROOTS`.

## Latest Verification

- Task 1 verification:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd test` - 94 tests passed.
- Task 2 verification:
  - `npm.cmd test` - 95 tests passed.
- Review-fix targeted verification:
  - `npm.cmd test` - 99 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- Review-fix full gate:
  - `npm.cmd test` - 99 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-local-install-gate` - copied runtime files.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-local-install-gate` - `ok: true`, `indexedLineCount: 2`.
- Final pre-commit targeted checks:
  - `npm.cmd test` - 99 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- Final pre-commit full gate:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-local-install-gate` - copied runtime files.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-local-install-gate` - `ok: true`, `indexedLineCount: 2`.
- Local install workflow full gate:
  - `npm.cmd test` - 95 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-local-install-gate` - copied runtime files.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-local-install-gate` - `ok: true`, `indexedLineCount: 2`.
  - `git diff --check` - exit 0.
- Pre-merge PR #1 full gate passed before merge:
  - `npm.cmd test` - 93 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.

## Next Steps

1. Stage the latest handoff and test formatting update, then run `git diff --cached --check`.
2. Commit with per-command author.
3. Push branch and open a PR against `main` with the independent-review limitation clearly called out.
4. Request or rerun independent review when subagent usage is available again.

## Recovery Commands

```powershell
cd C:\Users\00\Desktop\codex_plugin_and_skill
git status --short --branch
npm.cmd run build
npm.cmd run install:local
npm.cmd run verify:installed
npm.cmd test
```

## Stop Conditions

- Do not commit or push if any full-gate command fails.
- Do not claim completion without fresh verification output.
- Do not merge any future PR without explicit user approval.
