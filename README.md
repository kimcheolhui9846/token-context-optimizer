# Token Context Optimizer

Codex plugin and local STDIO MCP server for safer token-efficient context handling.

The MVP indexes local UTF-8 text artifacts, records SHA-256 and line source maps, returns bounded source-backed excerpts, and blocks lossy summaries for exact-sensitive content.

## Development

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
npm.cmd run benchmark
```

## Codex Components

- Plugin manifest: `.codex-plugin/plugin.json`
- MCP config: `.mcp.json`
- Skill: `skills/optimize-context/SKILL.md`

Build before packaging the plugin because `.mcp.json` points to the checked-in bundle at `bin/token-context-optimizer.mjs`.

Set `TCO_ALLOWED_ROOTS` to one or more workspace roots separated by `;` before using `index_artifact`. The server intentionally separates the plugin install directory from the files Codex is allowed to index.

## Local Install

Build, install, and verify the plugin locally:

```powershell
npm.cmd run build
npm.cmd run install:local
npm.cmd run verify:installed
```

The default install copies the plugin to `%CODEX_HOME%\plugins\token-context-optimizer` when `CODEX_HOME` is set, otherwise `%USERPROFILE%\.codex\plugins\token-context-optimizer`. It also creates or updates a personal marketplace so the ChatGPT desktop app can surface the plugin from a local source.

After the default install, restart the ChatGPT desktop app, open the Plugins Directory, select the personal marketplace source, and install or refresh `token-context-optimizer`. Start a new chat after reinstalling so Codex picks up the updated skills and bundled MCP server.

Use an explicit destination for testing or custom installs:

```powershell
npm.cmd run install:local -- --target C:\path\to\token-context-optimizer --marketplace C:\path\to\.agents\plugins\marketplace.json
npm.cmd run verify:installed -- --plugin-root C:\path\to\token-context-optimizer
```

Custom targets must declare their discovery intent. Use `--marketplace` to write a marketplace entry, or pass `--no-marketplace` for staging-only tests that must not write a marketplace file:

```powershell
npm.cmd run install:local -- --target C:\path\to\token-context-optimizer --no-marketplace
```

Destination resolution order:

1. `--target` for install or `--plugin-root` for verification.
2. `TCO_PLUGIN_INSTALL_DIR`.
3. `%CODEX_HOME%\plugins\token-context-optimizer`.
4. `%USERPROFILE%\.codex\plugins\token-context-optimizer`.

Marketplace resolution order:

1. `--no-marketplace` disables marketplace writes.
2. `--marketplace <path>`.
3. `TCO_PLUGIN_MARKETPLACE_PATH`.
4. `<parent-of-CODEX_HOME>\.agents\plugins\marketplace.json` for default installs when `CODEX_HOME` is set.
5. `%USERPROFILE%\.agents\plugins\marketplace.json` for default installs without `CODEX_HOME`, `--target`, or `TCO_PLUGIN_INSTALL_DIR`.

The installer copies only runtime plugin files: `.codex-plugin/plugin.json`, `.mcp.json`, `bin/token-context-optimizer.mjs`, and `skills/optimize-context/SKILL.md`.

For safety, the installer preflights every runtime source before changing the target. It accepts new, empty, or already-owned `token-context-optimizer` plugin directories, rejects non-empty unrelated targets, rejects non-file runtime destinations, rejects symlinked destination components, and restores existing runtime files if a later copy fails.

The installed verifier requires each runtime entry to be a regular file, reads `.codex-plugin/plugin.json`, resolves the declared `.mcp.json`, requires the configured server to launch the installed bundle from inside the plugin root, strips inherited Node execution hooks, rejects configured `NODE_OPTIONS`, `NODE_PATH`, and `npm_config_node_options`, indexes a temporary workspace file, and confirms plugin-root files are denied when `TCO_ALLOWED_ROOTS` points elsewhere.

## Superpowers Use

Use this optimizer as a context-loading helper inside Superpowers workflows. It can reduce large logs and documents before brainstorming, planning, debugging, review, or verification, but it must not replace those workflow gates or summarize exact evidence lossily.
