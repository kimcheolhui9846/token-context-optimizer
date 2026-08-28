# Local Install Workflow Design

## Goal

Add a repeatable local install, marketplace registration, and verification workflow for the `token-context-optimizer` Codex plugin so the user can recover after a reboot or token-limit interruption without reconstructing setup steps from memory.

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
3. `${CODEX_HOME}\plugins\token-context-optimizer` when `CODEX_HOME` is set.
4. `%USERPROFILE%\.codex\plugins\token-context-optimizer` on Windows.

The installer creates the destination when needed. It accepts empty destinations and existing destinations that already contain a readable `token-context-optimizer` manifest. It overwrites the plugin runtime files it owns but leaves unrelated files in an owned destination untouched. It rejects non-empty destinations that do not identify as this plugin.

## Marketplace

Default installs create or update a personal marketplace with a local entry for `token-context-optimizer`. When `CODEX_HOME` is set, the marketplace lives at `<parent-of-CODEX_HOME>\.agents\plugins\marketplace.json` so the plugin target remains inside the marketplace root. Otherwise it lives at `%USERPROFILE%\.agents\plugins\marketplace.json`. The entry points at the installed plugin directory using a `./`-prefixed `source.path` relative to the marketplace root. `--marketplace <path>` and `TCO_PLUGIN_MARKETPLACE_PATH` override the marketplace file for default installs, and `--no-marketplace` keeps tests and staging installs from mutating user-global plugin discovery state. Custom `--target` or `TCO_PLUGIN_INSTALL_DIR` installs must use exactly one CLI marketplace mode: `--marketplace` or `--no-marketplace`; inherited marketplace environment variables are not consent for custom installs.

## Verification

The verifier resolves the installed plugin root from `--plugin-root <path>`, `TCO_PLUGIN_INSTALL_DIR`, or the same default destination rules as the installer, then canonicalizes the root before trusting installed metadata. It then:

- Confirms the required runtime files exist as regular files physically inside the plugin root.
- Reads `.codex-plugin/plugin.json` and resolves the declared `.mcp.json` through physical containment checks.
- Requires `.mcp.json` to use the same standard `mcpServers` shape that plugin validation accepts.
- Starts the configured `token-context-optimizer` MCP server from the installed plugin root.
- Rejects configured MCP `env`, allows only `TCO_ALLOWED_ROOTS` in `env_vars`, and does not inherit `NODE_OPTIONS`, `NODE_PATH`, `npm_config_node_options`, or platform loader execution hooks.
- Creates a temporary workspace fixture outside the plugin root.
- Sets `TCO_ALLOWED_ROOTS` to that temporary workspace.
- Calls MCP `initialize`, `tools/list`, and `index_artifact`.
- Fails if the server cannot index the workspace fixture from the installed layout.
- Fails if the server can index plugin-root files while `TCO_ALLOWED_ROOTS` points elsewhere.
- Cleans up the temporary workspace before exiting.

## Commands

- `npm.cmd run install:local`
- `npm.cmd run verify:installed`

Both commands are Node scripts and remain cross-platform inside the project-supported Node runtime.

## Safety

The installer validates every runtime source from the checked-in repository root as a regular physical file before creating or modifying the destination. It rejects non-file and hard-linked runtime destinations plus symlinked destination path components so writes cannot be redirected outside the target. It refuses to copy from missing runtime sources, and restores existing runtime files if copy or marketplace update fails. Local install is a single-writer, quiescent-reader maintenance operation; stop or restart ChatGPT desktop around install/refresh so plugin readers do not observe an in-place update. The verifier does not require access to user project files because it creates its own temporary fixture.

## Documentation

README and `docs/agent/HANDOFF.md` must include the reboot recovery sequence:

```powershell
cd C:\Users\00\Desktop\codex_plugin_and_skill
npm.cmd run build
npm.cmd run install:local
npm.cmd run verify:installed
```
