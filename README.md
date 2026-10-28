# Token Context Optimizer

Codex plugin and local STDIO MCP server for origin-preserving context handling, with a
research suite that measures provider-billed tokens, accuracy and prompt-cache cost for
text and image evidence across context compaction.

The MVP indexes local UTF-8 text artifacts, records SHA-256 and line source maps, returns bounded source-backed excerpts, and blocks lossy summaries for exact-sensitive content.

The current research direction is **image context optimization first**, with paper
writing taking priority over feature development. Alongside the text MVP,
[restricted PNG/JPEG ingest, inspection, and crop](docs/image-artifacts.md) provides
image validation and caller-selected `crop_image_artifact` regions, returned as
JPEG q75 with provenance and no file writes. Full-frame requests return the
original reference. The plugin does not implement resize, OCR or query-aware region
selection; the separate research harness under `research/` implements them for the
experiments below, and the paper evaluates that harness path rather than the product
crop tool. Video extension follows image implementation, evaluation, and explicit
user approval.

The JPEG profile is intentionally narrow: baseline 8-bit YCbCr JFIF with 4:4:4
sampling. Independent checked-in fixtures and their encoder provenance are under
`tests/fixtures/jpeg/`; fixture validation does not claim image quality or hosted
model performance.

PNG indexing is strict by default. Call `index_image_artifact` with
`profile:"tolerant"` for bounded ancillary-chunk tolerance; the result records
the actual `png-rgb8-tolerant-v1` profile, ignored chunk names, and alpha state.
Color information in `iCCP`, `sRGB`, `gAMA`, and `cHRM` is not applied;
physical-resolution metadata such as `pHYs` is also ignored. Strict RGBA remains partial-crop incompatible;
tolerant PNG RGB partial crops remain allowed; RGBA partial crops are allowed
only when every alpha byte is 255 (`opaque`). RGB records report `none`; RGBA
records with any alpha byte below 255 report `present`.

## Research Status

Three experiments have been run with GPT-4o and Claude Haiku 4.5; experiments 2
and 3 were preregistered and analyzed with paired bootstrap 95% confidence intervals.
The [Korean paper draft](docs/research/image-first-paper-draft.ko.md) reports all
three. The findings are limited to these providers and conditions, and negative
results are reported as measured.

| Experiment | Design | Main result |
|---|---|---|
| 1. Billed image tokens (RQ1) | 66 transformed images: 49 grid points, 10 boundary cases, 7 JPEG q75 resends | GPT-4o detail high matched the public accounting rule in 66/66 cases; Haiku 4.5 billed 3 tokens more than predicted for single-image requests; all 7 PNG/JPEG q75 resend pairs billed the same |
| 2. Single query (RQ2) | 36 held-out families × 4 input conditions | Region selection plus original requery (D) reduced input tokens relative to the assigned original (A) by 23.0% (GPT-4o) and 43.8% (Haiku 4.5); non-inferiority at the −5 pp margin was not established for either provider |
| 3. Agent sessions (RQ3) | 24 held-out 8-turn sessions; late recall = turns 6–8 | Compaction alone (S1) lowered late recall relative to keeping all context (S0) by 79.2 pp (GPT-4o; 93.1% → 13.9%) and 20.8 pp (Haiku 4.5). Source-preserving retrieval plus compaction (S3) raised GPT-4o late recall to 81.9%, +68.1 pp [+58.3, +77.8] over S1; Haiku 4.5 was not supported, +1.4 pp [−15.3, +18.1]. Non-inferiority of retrieval alone (S2) against S0 was not established for either provider. S2 per-session cost saving relative to S0 fell from 28.5% at list price to 9.1% with prompt caching for GPT-4o; for Haiku 4.5 it went from −33.0% to −266.4%, a cost increase |

| Document | Contents |
|---|---|
| [Paper draft (Korean)](docs/research/image-first-paper-draft.ko.md) | Evidence-linked master draft for all three experiments |
| [Experiment 1 results](research/results/rq1-sweep-001/README.md) | Billed-token sweep and accounting comparison |
| [Experiment 2 results](docs/research/2026-10-16-experiment2-results.md) | Single-query held-out appendix |
| [Experiment 3 protocol](docs/research/2026-10-15-experiment3-protocol.md) and [results](docs/research/2026-10-15-experiment3-results.md) | Session design and held-out appendix |
| [Research documents index](docs/research/README.md) | Reading order for papers, protocols, decision memos and raw evidence |

## Tool Behavior

`query_artifact` returns up to five source excerpts around positive matches tied for the highest score by default. Candidates are retained in file order; lower-scoring lines are not added. Set `maxExcerpts` to an integer from 1 through 20 to change the cap. `maxExcerpts: 1` preserves the legacy first span and can still report omitted ties in `moreMatches`.

The first accepted excerpt uses the earliest fitting highest-score anchor. When the earliest anchor fits, its legacy context-first span is preserved and overlapping later context may expand it; an oversized earliest anchor is skipped in default multi-excerpt mode, while explicit `maxExcerpts: 1` preserves the legacy refusal. Later excerpts are whole-line windows fitted into the shared `maxTokens` budget, with shared text counted once. `moreMatches` appears only when tied anchors remain uncovered and reports their exact count plus the first 20 line numbers; it is absent for unique best matches and complete coverage. A no-fit multi-tie response keeps the legacy `complete_span_required` or `source_span_exceeds_budget` fallback and adds omission metadata, while partial success keeps `warnings: []` and `fallbackReason: null`. The metadata is outside `estimatedTokens`, which sums estimated token counts for returned excerpt texts; each source map retains complete UTF-8 line boundaries.

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

Set `TCO_ALLOWED_ROOTS` to one or more workspace roots separated by `;` before using `index_artifact` or the image tools. The server blocks indexing when `TCO_ALLOWED_ROOTS` is unset or empty; text indexing reports the configuration message, while image tools retain their `path_denied` response. Direct API calls that omit `allowedRoots` retain the current-working-directory default. The server intentionally separates the plugin install directory from the files Codex is allowed to index.

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
A provider runner and spending enforcement remain separate work. The implemented
[paired-success point estimate and coverage](docs/research/paired-success.md) is
diagnostic only; inferential paired analysis remains separate work.

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

The draft evaluates artifact-aware external image processing for document, chart,
and UI questions and reports the measured results summarized in
[Research Status](#research-status). The image evaluation protocol is the historical
pre-execution design; the executed protocols and results are linked above. If
priorities conflict, the paper's research question and evaluation requirements take
precedence.

The earlier text-research proposal studied **layered adaptation**: weight changes through fine-tuning,
workflow instructions through skills, tool access through MCP, and distribution through
plugins. These are different interventions, not four interchangeable models to rank.
The [paper plan](docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md)
covers background, the framework, this implementation, evaluation and limitations.
Background/design can be drafted now; results require real traces and blinded grading.
The [supplied-paper review and research application notes](docs/research/literature/2026-09-12/README.md)
cover four versioned PDFs, their limitations, and a separate
[agent-context hypothesis assessment](docs/research/literature/2026-09-12/05-agent-context-hypothesis.md).
This bounded reading set is not an exhaustive related-work search or novelty proof;
the broader novelty assessment remains incomplete. The experiments proposed in that
text plan, including the fresh-agent versus persistent-context comparison, were not
run; the research direction moved to the image study above.

Image bytes, internal visual tokens, provider-reported usage, and monetary cost are
different measurements. Text and image fixture tests do not establish hosted answer
quality or billing savings; the hosted measurements above cover only the providers,
models and conditions reported in the paper.

The earlier [layered-adaptation paper plan](docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md)
and [text experiment protocol](docs/research/2026-09-07-layered-adaptation-evaluation-protocol.md)
remain historical, separate research records. Their model recommendations, dataset
sizes, mock traces, and engineering results are not image-study evidence. Existing
text functionality and regression checks remain in place.

## Superpowers Use

Use this optimizer as a context-loading helper inside Superpowers workflows. It can reduce large logs and documents before brainstorming, planning, debugging, review, or verification, but it must not replace those workflow gates or summarize exact evidence lossily.
