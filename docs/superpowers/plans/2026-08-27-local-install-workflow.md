# Local Install Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable local install, marketplace registration, and installed-layout verification workflow for the Codex plugin.

**Architecture:** Create small Node scripts under `scripts/`. The installer copies only runtime plugin files, optionally registers the plugin in a local marketplace, and restores existing runtime files on copy failure. The verifier reads the installed plugin manifest and bundled MCP config, starts the configured server from the plugin root, and indexes a fixture from a separate allowed workspace.

**Tech Stack:** Node.js ESM scripts, existing TypeScript build output, Vitest for behavior coverage, GitHub PR flow.

## Global Constraints

- Do not copy `node_modules/`, `dist/`, `.git/`, source PDFs, generated artifacts, or tests into the plugin install directory.
- Default install path is `${CODEX_HOME}\plugins\token-context-optimizer` when `CODEX_HOME` is set, otherwise `%USERPROFILE%\.codex\plugins\token-context-optimizer`.
- `--target` overrides the install destination for tests and manual use.
- `TCO_PLUGIN_INSTALL_DIR` overrides the install destination when `--target` is omitted.
- Default installs must create or update a personal marketplace entry under `<parent-of-CODEX_HOME>\.agents\plugins\marketplace.json` when `CODEX_HOME` is set, otherwise `%USERPROFILE%\.agents\plugins\marketplace.json`.
- `--marketplace` or `TCO_PLUGIN_MARKETPLACE_PATH` overrides the marketplace file path.
- `--no-marketplace` disables marketplace writes for staging-only tests.
- Custom `--target` or `TCO_PLUGIN_INSTALL_DIR` installs must pass exactly one CLI marketplace mode, `--marketplace` or `--no-marketplace`; inherited marketplace environment variables are not consent for custom installs.
- Installed verification must run from the plugin root while `TCO_ALLOWED_ROOTS` points to a separate temporary workspace.
- Installed verification must read `.codex-plugin/plugin.json`, require `skills` to point at `./skills/`, reject `hooks`, and require its MCP reference to point at the installed `.mcp.json` instead of hardcoding or accepting alternate MCP files.
- Installed verification must require every installed runtime entry to be a regular, non-hard-linked file before launching the MCP server.
- Installed verification and owned-target reinstalls must reject unexpected files inside managed runtime directories: `.codex-plugin`, `bin`, `hooks`, and `skills`.
- Installed verification must require standard `mcpServers` metadata, reject configured MCP `env`, require `env_vars` to be exactly `["TCO_ALLOWED_ROOTS"]`, and must not inherit `NODE_OPTIONS`, `NODE_PATH`, `npm_config_node_options`, or platform loader execution hooks.
- Source validation, installer preflight, and installed verification must share a canonical `.mcp.json` descriptor assertion: one top-level `mcpServers` map, one `token-context-optimizer` server, exact `command`, `args`, `cwd`, and `env_vars`, and no unknown executable metadata.
- Marketplace updates must leave unrelated plugins intact while collapsing duplicate `token-context-optimizer` entries into one canonical local entry.
- Installer must preflight every runtime source from the checked-in repository root as a regular physical file before creating or modifying the target.
- Installer must reject non-empty targets unless they already contain a readable `token-context-optimizer` manifest.
- Installer must reject symlinked install target components and every existing component of each runtime destination path before copying.
- Installer must reject non-file and hard-linked runtime destinations before copying and restore existing runtime files if a later copy fails.
- Update `docs/agent/HANDOFF.md` after completing each implementation task.

---

### Task 1: Installer Script

**Files:**
- Create: `scripts/install-local-plugin.mjs`
- Modify: `package.json`
- Test: `tests/core.test.ts`

**Interfaces:**
- Produces CLI command: `node scripts/install-local-plugin.mjs --target <path>`
- Produces npm script: `npm.cmd run install:local`

- [x] **Step 1: Write the failing test**

Add a Vitest case that creates a temp target, runs:

```js
await execFile(process.execPath, [
  "scripts/install-local-plugin.mjs",
  "--target",
  target,
]);
```

Assert that exactly the runtime files exist under the target:

```js
[
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "bin/token-context-optimizer.mjs",
  "skills/optimize-context/SKILL.md",
]
```

Also assert that `node_modules`, `dist`, and `.git` do not exist under the target.

- [x] **Step 2: Verify RED**

Run:

```powershell
npm.cmd test
```

Expected: FAIL because `scripts/install-local-plugin.mjs` does not exist.

- [x] **Step 3: Implement installer**

Create `scripts/install-local-plugin.mjs` with:

```js
const runtimeFiles = [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "bin/token-context-optimizer.mjs",
  "skills/optimize-context/SKILL.md",
];
```

Resolve destination from `--target`, `TCO_PLUGIN_INSTALL_DIR`, `CODEX_HOME`, or `USERPROFILE`. Create parent folders and copy each runtime file. Print JSON with `target` and copied files.

- [x] **Step 4: Add npm script**

Add:

```json
"install:local": "node scripts/install-local-plugin.mjs"
```

- [x] **Step 5: Verify GREEN**

Run:

```powershell
npm.cmd run build
npm.cmd test
```

Expected: PASS.

### Task 2: Installed Verifier Script

**Files:**
- Create: `scripts/verify-installed-plugin.mjs`
- Modify: `package.json`
- Test: `tests/core.test.ts`

**Interfaces:**
- Consumes installed runtime files from Task 1.
- Produces CLI command: `node scripts/verify-installed-plugin.mjs --plugin-root <path>`
- Produces npm script: `npm.cmd run verify:installed`

- [x] **Step 1: Write the failing test**

Add a Vitest case that builds, installs into a temp target, then runs:

```js
await execFile(process.execPath, [
  "scripts/verify-installed-plugin.mjs",
  "--plugin-root",
  target,
]);
```

Assert stdout JSON has:

```js
{
  ok: true,
  indexedLineCount: 2
}
```

- [x] **Step 2: Verify RED**

Run:

```powershell
npm.cmd test
```

Expected: FAIL because `scripts/verify-installed-plugin.mjs` does not exist.

- [x] **Step 3: Implement verifier**

Create `scripts/verify-installed-plugin.mjs`. It must:

- Resolve plugin root from `--plugin-root`, `TCO_PLUGIN_INSTALL_DIR`, or default install path.
- Confirm required runtime files exist.
- Spawn `node ./bin/token-context-optimizer.mjs` with `cwd` set to plugin root.
- Create a temp workspace fixture outside plugin root.
- Set `TCO_ALLOWED_ROOTS` to that fixture directory.
- Call MCP `initialize`, `tools/list`, and `index_artifact`.
- Print JSON with `ok`, `pluginRoot`, `workspaceRoot`, `indexedPath`, and `indexedLineCount`.

- [x] **Step 4: Add npm script**

Add:

```json
"verify:installed": "node scripts/verify-installed-plugin.mjs"
```

- [x] **Step 5: Verify GREEN**

Run:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run install:local -- --target "$env:TEMP\tco-plan-install"
npm.cmd run verify:installed -- --plugin-root "$env:TEMP\tco-plan-install"
```

Expected: PASS.

### Task 3: Documentation And Handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`

**Interfaces:**
- Consumes npm scripts from Tasks 1 and 2.
- Produces reboot recovery instructions.

- [x] **Step 1: Update README**

Add:

```powershell
npm.cmd run build
npm.cmd run install:local
npm.cmd run verify:installed
```

Document `--target`, `--plugin-root`, `TCO_PLUGIN_INSTALL_DIR`, and `TCO_ALLOWED_ROOTS`.

- [x] **Step 2: Update handoff**

Record current branch, task status, latest verification commands, and next PR steps.

- [x] **Step 3: Run full gate**

Run:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
npm.cmd run benchmark
git diff --check
```

Expected: all exit 0.

- [ ] **Step 4: Review and PR**

Request code review. If no blocking findings, commit, push `feature/local-install-workflow`, and create a PR against `main`.

Status: implementation was committed and draft PR #2 was opened. A later independent review returned `REQUEST CHANGES` / `BLOCK`, so remediation is in progress.

### Task 4: Review Remediation

**Files:**
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `tests/core.test.ts`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`

- [x] **Step 1: Cover unrelated and partial-update install targets**

Added regressions for conflicting non-empty targets and missing runtime sources. Installer now preflights every source and refuses non-owned targets before modifying an existing install.

- [x] **Step 2: Cover symlinked destination components**

Added regressions for symlinked target ancestors and nested owned-target components such as `target\bin`. Installer now checks each runtime destination path before creating directories or copying files.

- [x] **Step 3: Cover MCP child shutdown**

Verifier and smoke scripts now wait for child process exit after `SIGTERM` or `SIGKILL` and surface child spawn errors.

- [x] **Step 4: Final gate, commit, push, and draft PR**

Ran the full verification gate, staged changes, committed, pushed, and opened draft PR #2. The PR remains draft until independent review can be rerun or another GitHub review approves the change.

- [ ] **Step 5: Independent review and ready-for-review transition**

Rerun the independent code review when subagent usage is available. If no blocking findings remain, mark PR #2 ready for review.

### Task 5: PR #2 Review Remediation

**Files:**
- Create: `scripts/plugin-runtime.mjs`
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `scripts/smoke-mcp.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`

- [x] **Step 1: RED tests for review findings**

Added tests for exact installed tree enumeration, personal marketplace entry creation, non-file runtime destination preflight, runtime rollback after simulated copy failure, verifier rejection of invalid MCP config, and plugin-root indexing denial.

- [x] **Step 2: Installer safety remediation**

Installer now supports `--marketplace`, `TCO_PLUGIN_MARKETPLACE_PATH`, and `--no-marketplace`, writes a local marketplace entry for default installs, rejects non-file runtime destinations before copying, and restores existing runtime files if copy or marketplace update fails.

- [x] **Step 3: Metadata-driven verifier**

Verifier now reads installed `plugin.json`, resolves the declared `.mcp.json`, selects the `token-context-optimizer` server from `mcpServers`, `mcp_servers`, or a direct server map, launches that configured server, and verifies plugin-root files are outside `TCO_ALLOWED_ROOTS`.

- [x] **Step 4: Shared executable runtime inventory**

Installer, verifier, and smoke harness now share `scripts/plugin-runtime.mjs` for plugin name and runtime file inventory. Tests keep an independent expected list as the oracle.

- [ ] **Step 5: Full gate, commit, push, and re-review**

Run the full verification gate, commit the remediation, push to PR #2, and rerun independent `code-reviewer` plus `architect` review lanes.

### Task 6: PR #2 Re-review Remediation

**Files:**
- Modify: `scripts/plugin-runtime.mjs`
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: RED tests for re-review blockers**

Added tests for no-argument USERPROFILE install/verify parity, default CODEX_HOME marketplace root alignment, marketplace rollback/retry after simulated write failure, and verifier rejection when `.mcp.json` points at an external working server instead of the installed bundle.

- [x] **Step 2: Shared root and marketplace resolution**

Moved plugin root resolution into `scripts/plugin-runtime.mjs`. Installer and verifier now use the same root rules. Default marketplace path follows the parent of `CODEX_HOME` when `CODEX_HOME` is set so local `source.path` remains inside the marketplace root.

- [x] **Step 3: Verifier launch constraints**

Verifier now requires the configured server to launch Node with the installed `bin/token-context-optimizer.mjs` entrypoint from a cwd inside the plugin root, checks launch path components for symlinks, and verifies the plugin-root denial error is specifically an `outside allowed roots` error.

- [x] **Step 4: Marketplace write hardening**

Marketplace updates now write a temp file in the same directory and replace the destination after a complete write. Simulated marketplace write failures preserve the original marketplace and leave the install retryable.

- [x] **Step 5: Full gate, commit, push, and PR body update**

Run the full verification gate, commit and push the re-review remediation, update PR #2 body to the 107-test state, then rerun independent review lanes.

Status: RED and GREEN cycles are complete locally. Full gate passed with 107 tests, build, typecheck, smoke, manifest validation, benchmark, marketplace install, and installed verification. Remediation commit `3b856cd` was pushed and PR #2 body was updated.

- [ ] **Step 6: Final independent re-review**

Rerun independent `code-reviewer` and `architect` review lanes against the latest PR #2 head. If both lanes clear, mark PR #2 ready for review.

Status: attempted against PR #2 head `0cce2a1`, but both native subagent review lanes failed with a usage-limit error before returning evidence. PR #2 remains draft until review can be rerun.

### Task 7: Final Review Remediation

**Files:**
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: RED tests for final blockers**

Added tests requiring custom targets to explicitly choose `--marketplace` or `--no-marketplace`, and requiring verifier rejection of configured `NODE_OPTIONS`/`NODE_PATH`.

- [x] **Step 2: Discovery intent enforcement**

Installer now rejects `--target` and `TCO_PLUGIN_INSTALL_DIR` installs unless a marketplace path or staging opt-out is supplied.

- [x] **Step 3: Verifier environment hardening**

Verifier now builds a constrained child environment, strips inherited Node execution hooks, and rejects configured `NODE_OPTIONS`, `NODE_PATH`, and `npm_config_node_options`.

- [x] **Step 4: Full gate, commit, push, PR body update, and final re-review**

Run the full gate with 110 tests, commit and push the final remediation, update PR #2, then rerun independent review lanes.

Status: final remediation was committed and pushed as `b329b2d`, and PR #2 body was updated to the 110-test state. Independent re-review against `b329b2d` returned `REQUEST CHANGES` / `BLOCK`, so Task 8 tracks the next remediation.

### Task 8: Post-Final Review Boundary Remediation

**Files:**
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: RED tests for remaining review blockers**

Added tests for unsupported direct/snake-case MCP maps, loader env hooks, JSON-RPC error surfacing, hard-linked runtime destinations, and linked caller-cwd source files.

- [x] **Step 2: Installer physical source and destination hardening**

Installer now copies from the checked-in repository root, rejects linked source components, verifies runtime sources physically remain inside that root, and rejects hard-linked runtime destinations before copy.

- [x] **Step 3: Verifier metadata and execution hardening**

Verifier now canonicalizes plugin root, requires runtime/manifest paths to physically remain inside it, accepts only standard `mcpServers` metadata, rejects configured MCP `env`, strips inherited Node and loader execution hooks, and surfaces JSON-RPC errors immediately.

- [ ] **Step 4: Full gate, commit, push, PR body update, and final re-review**

Run the full gate with 116 tests, commit and push the boundary remediation, update PR #2, then rerun independent review lanes.

Status: boundary remediation was locally implemented, verified, committed as `d183297`, pushed to PR #2, and followed by handoff commit `5d91f29`. PR body was updated to the 116-test state. Independent re-review against `5d91f29` returned `REQUEST CHANGES` / `BLOCK`, so Task 9 tracks the next remediation.

### Task 9: Final CLI And Env Metadata Remediation

**Files:**
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `scripts/plugin-runtime.mjs`
- Modify: `tests/core.test.ts`
- Modify: `package.json`
- Create: `tsconfig.scripts.json`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: RED tests for latest review blockers**

Added tests for inherited marketplace paths with custom targets, `TCO_PLUGIN_INSTALL_DIR` custom targets, conflicting marketplace modes, unsafe `env_vars`, empty/null configured `env`, unknown installer/verifier CLI options, and verifier temp cleanup.

- [x] **Step 2: CLI marketplace intent and argument parsing**

Installer now rejects unknown/duplicate/unexpected CLI arguments, requires custom installs to use exactly one CLI marketplace mode, and applies inherited `TCO_PLUGIN_MARKETPLACE_PATH` only to default installs.

- [x] **Step 3: Verifier env metadata, temp cleanup, and JS typecheck**

Verifier now rejects configured `env` whenever it is defined, validates `env_vars` with a `TCO_ALLOWED_ROOTS` allowlist, removes temporary verification workspaces, and passes script-level `checkJs`. Project `typecheck` now includes the runtime scripts through `tsconfig.scripts.json`.

- [ ] **Step 4: Full gate, commit, push, PR body update, and final re-review**

Run the full gate with 125 tests and JS-including typecheck, commit and push the remediation, update PR #2, then rerun independent review lanes.

Status: implementation, targeted verification, full gate, commit, and push are complete. Remediation was committed as `0c89042` and pushed to PR #2. PR body update and final independent re-review are pending.

### Task 10: Installed Runtime Ownership Remediation

**Files:**
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `scripts/plugin-runtime.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: RED tests for latest review blockers**

Added tests for array marketplace interface metadata, stale files surviving in owned install targets, verifier acceptance of an alternate manifest-declared MCP file, stale managed files in installed runtimes, and verifier temp cleanup on setup failures before protocol initialization.

- [x] **Step 2: Close managed runtime ownership**

Installer and verifier now share the managed runtime directory inventory and reject unexpected files under `.codex-plugin`, `bin`, and `skills` for owned installs. This keeps stale or foreign runtime files from surviving a refresh.

- [x] **Step 3: Tighten installed metadata and setup cleanup**

Verifier now requires `plugin.json` to point at the installed `.mcp.json`, validates launch args inside the cleanup scope, and removes temporary workspaces even when setup fails before JSON-RPC protocol initialization. Installer and verifier now translate missing-file inspection errors separately from other filesystem failures.

- [ ] **Step 4: Full gate, commit, push, PR body update, and independent re-review**

Run the full gate with 130 tests, commit and push the remediation, update PR #2, then rerun independent `code-reviewer` and `architect` lanes. If both lanes clear, mark PR #2 ready for review; do not merge without explicit user approval.

Status: targeted remediation verification, full local gate, commit, push, and PR body update are complete. Remediation was committed as `c580694` and PR #2 now records the 130-test verification state. Independent re-review was attempted with `code-reviewer` and `architect` lanes, but both errored with the native subagent usage limit before returning evidence. Retry the independent re-review after the usage limit resets.

### Task 11: Installed Metadata Contract Remediation

**Files:**
- Modify: `scripts/plugin-runtime.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `scripts/validate-plugin.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: Independent review findings**

Independent re-review against PR #2 head `1f035fb` returned `REQUEST CHANGES` from the code-reviewer lane and `BLOCK` from the architect lane. The remaining blocker is that installed verification did not fully prove the manifest-selected runtime contract: `skills`, `hooks`, exact `env_vars`, and hard-linked installed runtime files.

- [x] **Step 2: RED tests for installed metadata contract**

Added tests for installed manifest `skills` drift, manifest `hooks`, missing/empty/duplicate `env_vars`, and hard-linked installed `.mcp.json` or bundle files. These tests failed before implementation because the verifier returned `ok: true`.

- [x] **Step 3: Canonical verifier and source validator contract**

Added shared runtime metadata constants. The installed verifier now requires exact `skills`, exact installed `.mcp.json`, no manifest hooks, exact `env_vars: ["TCO_ALLOWED_ROOTS"]`, and non-hard-linked runtime files. The source validator now uses the same constants.

- [ ] **Step 4: Full gate, commit, push, PR body update, and independent re-review**

Run the full gate with 134 tests, commit and push the remediation, update PR #2, then rerun independent `code-reviewer` and `architect` lanes. If both lanes clear, mark PR #2 ready for review; do not merge without explicit user approval.

Status: targeted RED/GREEN verification, full local gate, commit, and push are complete. Remediation was committed as `655037f` and pushed to PR #2. PR body update and independent re-review remain next.

### Task 12: Implicit Hooks Namespace Remediation

**Files:**
- Modify: `scripts/plugin-runtime.mjs`
- Modify: `tests/core.test.ts`
- Modify: `tsconfig.scripts.json`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: Independent re-review findings**

Independent re-review against PR #2 head `cf983a3` returned `COMMENT` from the code-reviewer lane and `BLOCK` from the architect lane. The remaining blocker is that implicit `hooks/hooks.json` content could survive owned refreshes and installed verification because `hooks` was not a managed zero-file namespace.

- [x] **Step 2: RED tests for implicit hooks**

Added installer and verifier tests that create `hooks/hooks.json` inside an owned installation. Both tests failed before implementation because install refresh and installed verification returned success.

- [x] **Step 3: Hooks namespace and review hygiene fixes**

Added `hooks` to `MANAGED_RUNTIME_DIRECTORIES` without adding any runtime hook files. This makes both installer and verifier reject implicit hook content. Also added test temp-root cleanup and included `scripts/validate-plugin.mjs` in script typechecking.

- [ ] **Step 4: Full gate, commit, push, PR body update, and independent re-review**

Run the full gate with 136 tests, commit and push the remediation, update PR #2, then rerun independent `code-reviewer` and `architect` lanes. If both lanes clear, mark PR #2 ready for review; do not merge without explicit user approval.

Status: targeted RED/GREEN verification and the full local gate are complete with 136 tests passing, build/typecheck/smoke/manifest validation/benchmark passing, installed marketplace verification passing, and `git diff --check` passing. Commit, push, PR body update, and independent re-review remain next.

### Task 13: Canonical MCP Descriptor And Cleanup Remediation

**Files:**
- Modify: `scripts/plugin-runtime.mjs`
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `scripts/validate-plugin.mjs`
- Modify: `scripts/smoke-mcp.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: Independent reset review findings**

Independent review against PR #2 head `641dea2` plus the uncommitted test work returned `REQUEST CHANGES` from the code-reviewer lane and `BLOCK` from the architect lane. Blocking scope: close `.mcp.json` ownership over the complete canonical descriptor, make smoke temp cleanup failure-safe, collapse duplicate marketplace identities, and refresh stale handoff/plan docs.

- [x] **Step 2: RED tests for descriptor ownership and cleanup**

Added tests for sibling MCP servers, noncanonical launch metadata, source validator descriptor mutations, installer source descriptor preflight, duplicate marketplace entries, smoke temp cleanup on success, smoke temp cleanup on simulated setup failure, and exact repository `.mcp.json` equality. RED verification failed for the expected current-code reasons.

- [x] **Step 3: Shared canonical descriptor implementation**

Added `assertCanonicalMcpConfig` and canonical descriptor constants in `scripts/plugin-runtime.mjs`. Source validation, installer preflight, and installed verification now reuse the same structural assertion. Installed verification still preserves specific unsafe `env` and `env_vars` diagnostics before enforcing the canonical descriptor. Marketplace updates now remove duplicate plugin identities before appending one canonical entry. `smoke-mcp.mjs` now cleans plugin/workspace roots in a top-level `finally` and supports a setup-failure simulation used by tests.

- [ ] **Step 4: Full gate, commit, push, PR body update, and independent re-review**

Targeted regression checks, `tests/core.test.ts`, script syntax checks, and `npm.cmd run typecheck` pass locally with 143 tests. Next: run the full gate, commit and push the remediation, update PR #2, rerun independent `code-reviewer` and `architect` lanes, and keep PR #2 unmerged until explicit user approval.

Status: full local gate completed with 143 tests passing, build/typecheck/smoke/manifest validation/benchmark passing, installed marketplace verification passing, and `git diff --check` passing. Remediation was committed as `4c50dd8`, pushed to PR #2, and the PR body was updated to the 143-test state. Independent re-review returned `WATCH` from the architect lane but `REQUEST CHANGES` from the code-reviewer lane because duplicate raw JSON object members were still collapsed before canonical MCP validation. Task 14 tracks that final raw descriptor remediation.

### Task 14: Raw MCP Duplicate-Key Remediation

**Files:**
- Modify: `scripts/plugin-runtime.mjs`
- Modify: `scripts/install-local-plugin.mjs`
- Modify: `scripts/verify-installed-plugin.mjs`
- Modify: `scripts/validate-plugin.mjs`
- Modify: `tests/core.test.ts`
- Modify: `README.md`
- Modify: `docs/agent/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-27-local-install-workflow.md`
- Modify: `docs/superpowers/specs/2026-08-27-local-install-workflow-design.md`

- [x] **Step 1: Independent re-review findings**

Independent re-review against PR #2 head `4c50dd8` returned `REQUEST CHANGES` from the code-reviewer lane and `WATCH` from the architect lane. Blocking scope: reject duplicate raw JSON object members before `.mcp.json` semantic validation, set `TMPDIR` in smoke cleanup subprocess tests, and refresh handoff state after the pushed head.

- [x] **Step 2: RED tests for duplicate raw descriptor members**

Added tests proving source validation, installer preflight, and installed verification reject duplicate top-level `mcpServers`, duplicate `token-context-optimizer` server keys, and duplicate launch fields before `JSON.parse` can collapse them. RED verification failed for the expected current-code reasons while `TMPDIR`-aware smoke cleanup tests passed.

- [x] **Step 3: Shared raw parser and smoke test portability**

Added `parseJsonObjectRejectingDuplicateKeys` in `scripts/plugin-runtime.mjs` and wired it into source validation, installer preflight, and installed verification for `.mcp.json`. Updated smoke cleanup subprocess tests to set `TEMP`, `TMP`, and `TMPDIR`.

- [ ] **Step 4: Full gate, commit, push, PR body update, and independent re-review**

Targeted duplicate raw-key checks, smoke cleanup checks, script syntax checks, and `npm.cmd run typecheck` pass locally with 146 tests collected. Next: run the full gate, commit and push the remediation, update PR #2, rerun independent `code-reviewer` and `architect` lanes, and keep PR #2 unmerged until explicit user approval.

Status: full local gate is complete with 146 tests passing, build/typecheck/smoke/manifest validation/benchmark passing, installed marketplace verification passing, and `git diff --check` passing. Commit, push, PR body update, and independent re-review remain next.
