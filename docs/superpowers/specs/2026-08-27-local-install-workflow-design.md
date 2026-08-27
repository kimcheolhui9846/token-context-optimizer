# Local Install Workflow Design

## Goal

Add a repeatable local install and verification workflow for the `token-context-optimizer` Codex plugin so the user can recover after a reboot or token-limit interruption without reconstructing setup steps from memory.

## Scope

The workflow installs only runtime plugin files that are needed after `npm.cmd run build`:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `bin/token-context-optimizer.mjs`
- `skills/optimize-context/SKILL.md`

The workflow does not copy `src/`, `tests/`, `node_modules/`, `dist/`, local artifacts, logs, Git metadata, or the source PDF.

## Destination

The installer resolves the destination in this order:

1. `--target <path>` CLI argument.
2. `TCO_PLUGIN_INSTALL_DIR` environment variable.
3. `${CODEX_HOME}\plugins\local\token-context-optimizer` when `CODEX_HOME` is set.
4. `%USERPROFILE%\.codex\plugins\local\token-context-optimizer` on Windows.

The installer creates the destination when needed. It accepts empty destinations and existing destinations that already contain a readable `token-context-optimizer` manifest. It overwrites the plugin runtime files it owns but leaves unrelated files in an owned destination untouched. It rejects non-empty destinations that do not identify as this plugin.

## Verification

The verifier resolves the installed plugin root from `--plugin-root <path>`, `TCO_PLUGIN_INSTALL_DIR`, or the same default destination rules as the installer. It then:

- Confirms the required runtime files exist.
- Starts `bin/token-context-optimizer.mjs` from the installed plugin root.
- Creates a temporary workspace fixture outside the plugin root.
- Sets `TCO_ALLOWED_ROOTS` to that temporary workspace.
- Calls MCP `initialize`, `tools/list`, and `index_artifact`.
- Fails if the server cannot index the workspace fixture from the installed layout.

## Commands

- `npm.cmd run install:local`
- `npm.cmd run verify:installed`

Both commands are Node scripts and remain cross-platform inside the project-supported Node runtime.

## Safety

The installer validates every runtime source as a regular file before creating or modifying the destination. It rejects symlinked destination path components so writes cannot be redirected outside the lexical target. It refuses to copy from missing runtime sources and must not leave a partial update when preflight fails. The verifier does not require access to user project files because it creates its own temporary fixture.

## Documentation

README and `docs/agent/HANDOFF.md` must include the reboot recovery sequence:

```powershell
cd C:\Users\00\Desktop\codex_plugin_and_skill
npm.cmd run build
npm.cmd run install:local
npm.cmd run verify:installed
```
