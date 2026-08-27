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
```

## Codex Components

- Plugin manifest: `.codex-plugin/plugin.json`
- MCP config: `.mcp.json`
- Skill: `skills/optimize-context/SKILL.md`

Build before packaging the plugin because `.mcp.json` points to the checked-in bundle at `bin/token-context-optimizer.mjs`.

Set `TCO_ALLOWED_ROOTS` to one or more workspace roots separated by `;` before using `index_artifact`. The server intentionally separates the plugin install directory from the files Codex is allowed to index.

## Superpowers Use

Use this optimizer as a context-loading helper inside Superpowers workflows. It can reduce large logs and documents before brainstorming, planning, debugging, review, or verification, but it must not replace those workflow gates or summarize exact evidence lossily.
