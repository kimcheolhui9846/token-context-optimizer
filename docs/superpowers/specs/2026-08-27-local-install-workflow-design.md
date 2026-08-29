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

The installer creates the destination when needed. It accepts empty destinations and existing destinations that already contain a readable `token-context-optimizer` manifest. It overwrites the plugin runtime files it owns, leaves unrelated files outside managed runtime directories untouched, and rejects unexpected files inside `.codex-plugin`, `bin`, `hooks`, or `skills`. It rejects non-empty destinations that do not identify as this plugin.

## Marketplace

Default installs create or update a personal marketplace with a local entry for `token-context-optimizer`. When `CODEX_HOME` is set, the marketplace lives at `<parent-of-CODEX_HOME>\.agents\plugins\marketplace.json` so the plugin target remains inside the marketplace root. Otherwise it lives at `%USERPROFILE%\.agents\plugins\marketplace.json`. The entry points at the installed plugin directory using a `./`-prefixed `source.path` relative to the marketplace root. `--marketplace <path>` and `TCO_PLUGIN_MARKETPLACE_PATH` override the marketplace file for default installs, and `--no-marketplace` keeps tests and staging installs from mutating user-global plugin discovery state. Custom `--target` or `TCO_PLUGIN_INSTALL_DIR` installs must use exactly one CLI marketplace mode: `--marketplace` or `--no-marketplace`; inherited marketplace environment variables are not consent for custom installs. Marketplace rewrites leave unrelated entries intact and collapse duplicate `token-context-optimizer` entries into one canonical local entry.

## Verification

The verifier resolves the installed plugin root from `--plugin-root <path>`, `TCO_PLUGIN_INSTALL_DIR`, or the same default destination rules as the installer, then canonicalizes the root before trusting installed metadata. It then:

- Confirms the required runtime files exist as regular, non-hard-linked files physically inside the plugin root.
- Rejects unexpected files inside managed runtime directories.
- Reads `.codex-plugin/plugin.json`, requires `skills` to point at the installed `./skills/` directory, rejects `hooks`, and requires the MCP reference to point at the installed `.mcp.json` through physical containment checks.
- Requires `.mcp.json` to be canonical: exactly one top-level `mcpServers` map, exactly one `token-context-optimizer` server, exact `command: "node"`, exact `args: ["./bin/token-context-optimizer.mjs"]`, exact `cwd: "."`, exact `env_vars: ["TCO_ALLOWED_ROOTS"]`, and no unknown executable metadata.
- Starts the canonical `token-context-optimizer` MCP server from the installed plugin root.
- Rejects configured MCP `env` and does not inherit `NODE_OPTIONS`, `NODE_PATH`, `npm_config_node_options`, or platform loader execution hooks.
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

The installer validates every runtime source from the checked-in repository root as a regular physical file before creating or modifying the destination, and it validates the source `.mcp.json` through the same canonical descriptor assertion used by source validation and installed verification. It rejects non-file and hard-linked runtime destinations plus symlinked destination path components so writes cannot be redirected outside the target. For owned installs, managed runtime directories are closed over the expected runtime inventory so stale or foreign plugin code cannot survive a refresh. It refuses to copy from missing runtime sources, and restores existing runtime files if copy or marketplace update fails. Local install is a single-writer, quiescent-reader maintenance operation; stop or restart ChatGPT desktop around install/refresh so plugin readers do not observe an in-place update. The verifier and smoke MCP harness do not require access to user project files because they create and remove their own temporary fixtures.

## Documentation

README and `docs/agent/HANDOFF.md` must include the reboot recovery sequence:

```powershell
cd C:\Users\00\Desktop\codex_plugin_and_skill
npm.cmd run build
npm.cmd run install:local
npm.cmd run verify:installed
```
