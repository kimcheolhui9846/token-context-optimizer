# Local Install Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable local install and installed-layout verification workflow for the Codex plugin.

**Architecture:** Create small Node scripts under `scripts/` and keep reusable path/copy/MCP helpers in those scripts until duplication justifies extraction. The installer copies only runtime plugin files. The verifier starts the installed bundle from the plugin root and indexes a fixture from a separate allowed workspace.

**Tech Stack:** Node.js ESM scripts, existing TypeScript build output, Vitest for behavior coverage, GitHub PR flow.

## Global Constraints

- Do not copy `node_modules/`, `dist/`, `.git/`, source PDFs, generated artifacts, or tests into the plugin install directory.
- Default install path is `${CODEX_HOME}\plugins\local\token-context-optimizer` when `CODEX_HOME` is set, otherwise `%USERPROFILE%\.codex\plugins\local\token-context-optimizer`.
- `--target` overrides the install destination for tests and manual use.
- `TCO_PLUGIN_INSTALL_DIR` overrides the install destination when `--target` is omitted.
- Installed verification must run from the plugin root while `TCO_ALLOWED_ROOTS` points to a separate temporary workspace.
- Installer must preflight every runtime source as a regular file before creating or modifying the target.
- Installer must reject non-empty targets unless they already contain a readable `token-context-optimizer` manifest.
- Installer must reject symlinked install target components and every existing component of each runtime destination path before copying.
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

Status: implementation was committed and draft PR #2 was opened. Final independent review is still pending because the native review subagent returned a usage-limit error.

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
