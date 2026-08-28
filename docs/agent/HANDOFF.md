# Codex Handoff

## Current Objective

Remediate PR #2 review findings for the `token-context-optimizer` local install workflow on branch `feature/local-install-workflow`.

## Workspace

- Path: `C:\Users\00\Desktop\codex_plugin_and_skill`
- Current branch: `feature/local-install-workflow`
- Base branch: `main`
- GitHub repo: `https://github.com/kimcheolhui9846/token-context-optimizer`
- MVP PR merged: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/1`
- MVP merge commit: `b5059774caee85c020e284a04e97f22b255162c4`
- Local install PR: `https://github.com/kimcheolhui9846/token-context-optimizer/pull/2`
- Local install commits: `2bd5189`, `bd95ea1`, `30dda09`, `3b856cd`
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
- PR handoff:
  - Committed `feat: add local plugin install workflow`.
  - Pushed `feature/local-install-workflow` to origin.
  - Opened draft PR #2 against `main`.
- PR #2 independent review completed:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Blocking remediation scope:
    - Reject non-file runtime destinations before any copy.
    - Restore existing runtime files if a later copy fails.
    - Add exact installed-tree coverage instead of trusting installer output.
    - Add marketplace registration so local install maps to Codex/ChatGPT plugin discovery.
    - Make installed verification read `plugin.json` and `.mcp.json` instead of hardcoding the bundle command.
    - Confirm `TCO_ALLOWED_ROOTS` keeps plugin-root files outside the indexing boundary.
- First PR #2 remediation completed:
  - Added RED tests for marketplace entry generation, non-file destination preflight, rollback, `.mcp.json` parsing, exact installed tree, and plugin-root denial.
  - Implemented installer marketplace registration, destination file-type preflight, runtime restore on failed copy, and shared runtime inventory.
  - Implemented verifier metadata-driven MCP launch and plugin-root denial check.
  - Updated README, design spec, implementation plan, and this handoff for marketplace-backed local install.
- PR #2 re-review completed:
  - `code-reviewer` returned `REQUEST CHANGES`.
  - `architect` returned `BLOCK`.
  - Blocking remediation scope:
    - Use the same default root rules for install and verify.
    - Keep default `CODEX_HOME` installs inside the matching marketplace root.
    - Prevent verifier from accepting `.mcp.json` configs that launch an external server instead of the installed bundle.
    - Preserve marketplace JSON on write failure and leave installs retryable.
    - Refresh handoff, plan, and PR body to current verification state.
- Re-review remediation completed locally:
  - Added RED tests for no-argument USERPROFILE install/verify parity, `CODEX_HOME` marketplace-root alignment, marketplace write-failure retryability, and external MCP server rejection.
  - Moved shared plugin root/default marketplace resolution into `scripts/plugin-runtime.mjs`.
  - Verifier now requires the configured server to launch Node with the installed `bin/token-context-optimizer.mjs` entrypoint from a cwd inside the plugin root.
  - Verifier checks launch path components for symlinks and verifies plugin-root denial reports `outside allowed roots`.
  - Marketplace updates now use same-directory temp-file replacement and preserve the original file on simulated write failure.
- Re-review remediation PR update:
  - Committed `fix: align local install verification roots` as `3b856cd`.
  - Pushed `feature/local-install-workflow` to origin.
  - Updated PR #2 body to the 107-test verification state.

## Design Summary

- Installer copies only runtime files:
  - `.codex-plugin/plugin.json`
  - `.mcp.json`
  - `bin/token-context-optimizer.mjs`
  - `skills/optimize-context/SKILL.md`
- Default destination order:
  1. `--target <path>`
  2. `TCO_PLUGIN_INSTALL_DIR`
  3. `${CODEX_HOME}\plugins\token-context-optimizer`
  4. `%USERPROFILE%\.codex\plugins\token-context-optimizer`
- Default marketplace registration:
  - Skipped when `--no-marketplace` is passed.
  - Uses `--marketplace <path>` or `TCO_PLUGIN_MARKETPLACE_PATH` when set.
  - For default installs with `CODEX_HOME`, writes `<parent-of-CODEX_HOME>\.agents\plugins\marketplace.json` so the installed plugin remains inside the marketplace root.
  - For default installs without `CODEX_HOME`, writes `%USERPROFILE%\.agents\plugins\marketplace.json`.
  - Marketplace entry points at the installed plugin with a `./`-prefixed path relative to the marketplace root.
- Verifier reads the installed manifest and declared `.mcp.json`, launches the configured `token-context-optimizer` server, indexes a temporary workspace fixture through explicit `TCO_ALLOWED_ROOTS`, and confirms plugin-root indexing is denied.

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
- PR #2 remediation RED:
  - `npm.cmd test` - 5 expected failures covering marketplace registration, metadata-driven verifier, non-file destination preflight, rollback, and plugin-root denial.
- PR #2 remediation targeted GREEN:
  - `npm.cmd test` - 103 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
- PR #2 remediation full gate:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-gate\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
- PR #2 re-review remediation RED:
  - `npm.cmd test` - 4 expected failures covering default install/verify path mismatch, default `CODEX_HOME` marketplace-root mismatch, marketplace write-failure simulation, and external MCP server verifier bypass.
- PR #2 re-review remediation targeted GREEN:
  - `npm.cmd test` - 107 tests passed.
  - `node --check scripts\install-local-plugin.mjs` - exit 0.
  - `node --check scripts\verify-installed-plugin.mjs` - exit 0.
  - `node --check scripts\plugin-runtime.mjs` - exit 0.
  - `node --check scripts\smoke-mcp.mjs` - exit 0.
- PR #2 re-review remediation full gate:
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run install:local -- --target $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer --marketplace $env:TEMP\tco-marketplace-gate\.agents\plugins\marketplace.json` - created marketplace entry with `source.path: ./.codex/plugins/token-context-optimizer`.
  - `npm.cmd run verify:installed -- --plugin-root $env:TEMP\tco-marketplace-gate\.codex\plugins\token-context-optimizer` - `ok: true`, `indexedLineCount: 2`, `deniedPluginRootIndex: true`.
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

1. Commit and push this handoff update.
2. Rerun independent `code-reviewer` and `architect` review against the latest PR #2 head.
3. If both review lanes clear, mark PR #2 ready for review.
4. Do not merge PR #2 without explicit user approval.

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
