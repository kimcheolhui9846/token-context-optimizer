# Token Context Optimizer

Codex plugin and local STDIO MCP server for safer token-efficient context handling.

The MVP indexes local UTF-8 text artifacts, records SHA-256 and line source maps, returns bounded source-backed excerpts, and blocks lossy summaries for exact-sensitive content.

The current research direction is **image context optimization first**, with paper
writing taking priority over feature development. Image processing is planned; the
text MVP above is the implemented capability. Video extension follows image
implementation, evaluation, and explicit user approval.

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

`verify:installed` verifies the staged marketplace source directory that this repository writes and launches the MCP server from that directory. It does not prove that ChatGPT has copied the plugin into its cache or loaded the cached copy; use the desktop app install or refresh step above for that host boundary.

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

The installer copies only runtime plugin files: `.codex-plugin/plugin.json`, `.mcp.json`, `bin/token-context-optimizer.mjs`, and `skills/optimize-context/SKILL.md`. Unknown CLI options, duplicate options, and unexpected positional arguments fail before any default install path is used.

For safety, the installer copies runtime files from the checked-in repository root, not the caller's current directory. It preflights every runtime source before changing the target, including duplicate-key rejection and semantic contract checks for `plugin.json`, plus a canonical `.mcp.json` descriptor check. It accepts new, empty, or already-owned `token-context-optimizer` plugin directories, rejects non-empty unrelated targets, rejects unexpected files inside managed runtime directories (`.codex-plugin`, `bin`, `hooks`, and `skills`), rejects hard-linked or non-file runtime destinations, rejects symlinked destination components, and restores existing runtime files if a later copy fails. Marketplace updates reject duplicate raw JSON members and replace every existing `token-context-optimizer` entry with one canonical local entry.

Run local installs as a single-writer maintenance operation while ChatGPT desktop is not loading the plugin, then restart the app after install or refresh.

The installed verifier requires each runtime entry to be a regular, non-hard-linked file physically inside the plugin root, rejects unexpected files inside managed runtime directories, reads `.codex-plugin/plugin.json` with duplicate-key rejection, requires `skills` to point at the installed `./skills/` directory, rejects manifest `hooks`, and requires its MCP reference to point at the installed `.mcp.json`. The `.mcp.json` descriptor must be canonical before and after parsing: no duplicate JSON object members, exactly one top-level `mcpServers` map, exactly one `token-context-optimizer` server, and exact `command`, `args`, `cwd`, and `env_vars` values with no extra executable metadata. The verifier strips inherited Node and platform loader execution hooks, rejects configured MCP `env`, indexes a temporary workspace file only when that fixture is outside the plugin root, cleans up that fixture, and confirms plugin-root files are denied when `TCO_ALLOWED_ROOTS` points elsewhere. The smoke MCP harness also cleans up its temporary install and workspace roots on success and setup failure.

## Research Tooling

Dataset validation, offline scoring and pilot structure auditing are documented in
[dataset format](docs/research/dataset-format.md), [scoring](docs/research/scoring.md)
and [development seed](docs/research/development-seed.md). Registered public excerpt
checks are documented in [exact checks](docs/research/exact-checks.md). The seed contains 12
bilingual development families, not a completed pilot or model performance result.

[Offline run planning](docs/research/run-planning.md) validates configuration and
generates reproducible preview schedules, with no provider calls. The
[approved contract](docs/superpowers/specs/2026-09-09-research-run-preflight-design.md)
separates preflight checks from authorization: `dispatchAllowed` is always false.
A provider runner, spending enforcement and paired analysis remain separate work.

[Offline mock runs](docs/research/mock-running.md) now exercise virtual deadlines,
reservations, unknown costs and explicit not-started slots without provider calls.
After building, run `npm.cmd run mock:research -- <dataset> <configuration> <scenario>`.
The report is explicitly synthetic and is not an evaluation ledger or proof of
real billing safety. The [contract](docs/superpowers/specs/2026-09-09-research-mock-runner-design.md)
and [TDD implementation plan](docs/superpowers/plans/2026-09-09-research-mock-runner.md)
record the boundaries and verification process.

## Paper And Experiment Plan

Start with the [Korean image-first paper draft](docs/research/image-first-paper-draft.ko.md),
the [image evaluation protocol and development roadmap](docs/research/image-first-evaluation-protocol.md),
and the [primary-source register](docs/research/image-first-sources.md).

The draft proposes artifact-aware external image processing for document, chart,
and UI questions. It contains no measured image results. The protocol links each
planned plugin capability to the evidence needed by the paper; stable experiment
requirements can guide development while writing continues. If priorities conflict,
the paper's research question and evaluation requirements take precedence.

Image bytes, internal visual tokens, provider-reported usage, and monetary cost are
different measurements. Neither existing text tests nor future image fixture tests
alone establish hosted answer quality or billing savings. Model selection, access,
data rights, privacy, and budget must be settled before hosted experiments.

The earlier [layered-adaptation paper plan](docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md)
and [text experiment protocol](docs/research/2026-09-07-layered-adaptation-evaluation-protocol.md)
remain historical, separate research records. Their model recommendations, dataset
sizes, mock traces, and engineering results are not image-study evidence. Existing
text functionality and regression checks remain in place.

## Superpowers Use

Use this optimizer as a context-loading helper inside Superpowers workflows. It can reduce large logs and documents before brainstorming, planning, debugging, review, or verification, but it must not replace those workflow gates or summarize exact evidence lossily.
