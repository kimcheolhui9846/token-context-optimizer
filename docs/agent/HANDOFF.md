# Codex Handoff

## Current Objective

Implement `token-context-optimizer`: a Codex-only safe MVP plugin with a local TypeScript STDIO MCP server, context-optimization skill, tests, benchmark harness, docs, GitHub repository, pushed feature branch, and PR.

## Workspace

- Path: `C:\Users\00\Desktop\codex_plugin_and_skill`
- Branch: `feature/token-context-optimizer-mvp`
- Base branch: `main`
- Source PDF recovery hint: use the only checked-in PDF in the repo root if the filename renders incorrectly.
- Source PDF: the only checked-in PDF in the repo root, named `멀티모달 토큰 최적화 플러그인 - Google Docs.pdf`.

## Completed Work

- Initialized a new Git repository with `main`.
- Committed the base repository hygiene and source PDF.
- Created feature branch `feature/token-context-optimizer-mvp`.
- Added Node/TypeScript project metadata and dependencies.
- Added Codex plugin manifest, `.mcp.json`, and `skills/optimize-context/SKILL.md`.
- Implemented core artifact indexing, token estimation, policy classification, and MCP server tools.
- Added Superpowers integration guidance to the skill, README, and design doc.
- Added tests, benchmark harness, plugin validator, MCP smoke test, and this handoff file.

## Review Feedback Status

First review blockers fixed:

- MCP configured entrypoint targets `./dist/src/server/index.js`.
- MCP smoke test exists.
- Query excerpts preserve complete source spans and CRLF delimiters.
- Source span over budget returns a fallback instead of partial exact text.
- Classification has `unknown`; lossy summaries are allowed only for positive `semantic`.
- Artifact indexing validates realpath allowed roots, regular file type, size limit, strict UTF-8, and hashes original bytes.
- Artifact IDs include canonical path plus content hash.
- Unicode query tokenization supports Korean.
- Benchmark exits non-zero when enforced gates fail.

Second review blockers fixed:

- No-query-term and no-query-match fallbacks.
- Bare code syntax classification as exact.
- Native path containment semantics.
- UTF-8 BOM preservation in source-map offsets.
- MVP benchmark/docs alignment.

Final focused review blockers fixed:

- Exact-classification regressions for Bearer secrets, PEM private keys, `curl`, and HTML markup.
- Tested MCP stdout parser rejects malformed complete lines and waits for incomplete lines.
- Smoke script uses the parser and always terminates/awaits the child process in `finally`.
- `package-lock.json` regenerated; package, lockfile, `.mcp.json`, and README agree on `dist/src/server/index.js`.
- Summary generation keeps complete lines only and reports actual retained source ranges.

Latest final re-review still requested changes:

- Exact-data classification remains too permissive for common exact content.
- Add regressions for command prefixes, shell-like commands, URIs/DSNs, general paths, request IDs, and HTML comments/declarations.
- Ensure those examples classify as `exact` and `summarizeArtifact` returns `exact_content_requires_source`.

Latest final re-review fixes completed:

- Added regressions for `sudo curl`, `echo`, `/etc/hosts`, `postgres://...`, `request-id ...`, and HTML comments.
- Added a curl command regression that does not rely on a Bearer secret.
- Expanded policy fail-closed patterns for command prefixes, shell commands, URIs/DSNs, general Unix/Windows paths, request IDs, and HTML comments/declarations.
- Latest full gate after these fixes:
  - `npm.cmd test` - 41 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `passed: true`.

Latest focused review still requested changes:

- Exact-data classification remains too narrow for `doas make`, `make`, `mailto:`, `/srv/app/config.toml`, `request_id`, `<!DOCTYPE html>`, and `sqlite:/srv/app.db`.
- Next fix should make semantic eligibility fail closed for broad exact-shaped syntax, not just add narrow examples.

Latest focused review fixes completed:

- Added regressions for the exact probes above, plus a seven-line fixture where exact content appears after the first six summary candidate lines.
- Replaced `src/core/policy.ts` with an ASCII-safe fail-closed policy covering broad command wrappers/options, shell commands, RFC-style schemes, POSIX/relative/home/UNC paths, file extensions, request-ID variants, and HTML declarations/comments.
- Latest full gate after this fix:
  - `npm.cmd test` - 56 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `passed: true`.
  - `git diff --cached --check` - exit 0.

Latest wrapper-command review fixes completed:

- Added regressions for `sudo -u deploy make release.`, `doas -u deploy make release.`, `sudo --preserve-env make deploy.`, and `env TARGET=production make deploy.`.
- Added a seven-line fixture where `sudo -u deploy make release.` appears after six prose lines and must block summarization.
- Added structured command-prefix detection that skips `sudo`/`doas` options and `env` assignments before detecting executable commands.
- Latest full gate after this fix:
  - `npm.cmd test` - 65 tests passed.
  - `npm.cmd run build` - exit 0.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `passed: true`.
  - `git diff --cached --check` - exit 0.

Fresh continuation verification completed on 2026-08-27:

- `npm.cmd test` - 65 tests passed.
- `npm.cmd run build` - exit 0.
- `npm.cmd run typecheck` - exit 0.
- `npm.cmd run smoke:mcp` - `mcp smoke ok`.
- `npm.cmd run validate:plugin` - `plugin manifest ok`.
- `npm.cmd run benchmark` - `passed: true`.
- `git diff --cached --check` - exit 0.

Final code review requested changes after fresh continuation:

- Fresh plugin installs could not launch because `.mcp.json` targeted ignored `dist/` output.
- Installed-layout indexing was pinned to the plugin directory by `TCO_ALLOWED_ROOTS: "."`.
- Semantic classification still allowed common exact-shaped content through.
- `interface.defaultPrompt` was missing from the plugin manifest and project validator.
- Semantic summary source ranges could report blank lines that were omitted from output.
- The 25K benchmark scenario only exercised about 3.7K estimated raw tokens.

Fixes completed for that review:

- Added `esbuild` bundling and generated checked-in `bin/token-context-optimizer.mjs`.
- Updated `package.json` and `.mcp.json` to launch the bundle and inherit `TCO_ALLOWED_ROOTS`.
- Changed server indexing to require explicit `TCO_ALLOWED_ROOTS` instead of defaulting to the plugin install directory.
- Expanded smoke testing to copy only install-runtime files into a temp plugin directory, run the bundle there, and index a fixture from a separate allowed workspace directory.
- Tightened semantic eligibility so only positive natural-language sentence lines can be summarized.
- Added exact regressions for `systemctl`, `terraform`, `scripts/deploy.sh`, `request_id:`, and SQL-shaped prose.
- Preserved blank lines inside semantic summary source ranges.
- Added `interface.defaultPrompt` and strengthened the Node plugin validator for interface and MCP config checks.
- Updated the 25K benchmark to generate and enforce at least 25,000 estimated raw tokens for the build-log scenario.
- Latest targeted checks after these fixes:
  - `npm.cmd test` - 77 tests passed.
  - `npm.cmd run build` - generated `bin/token-context-optimizer.mjs`.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `npm.cmd run typecheck` - exit 0.

Fresh full gate after bundle whitespace normalization on 2026-08-27:

- `npm.cmd test` - 77 tests passed.
- `npm.cmd run build` - exit 0 and regenerated `bin/token-context-optimizer.mjs`.
- `npm.cmd run typecheck` - exit 0.
- `npm.cmd run smoke:mcp` - `mcp smoke ok`.
- `npm.cmd run validate:plugin` - `plugin manifest ok`.
- `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
- `git diff --cached --check` - exit 0.

Final focused re-review requested one remaining change:

- Semantic eligibility still admitted exact-shaped technical content such as `chmod`/`helm` command phrases, `release-notes.txt`, `trace abcdefghijkl`, and `feature_flag`.

Fix completed for that review:

- Added regressions for classification and summary blocking for those five probes.
- Added a late-line fixture where `feature_flag` appears after six prose lines and must block summarization.
- Added structural exact detection for command-like phrases, general filename tokens, trace/correlation tokens, and snake_case config keys.
- Added the same structural token guard to positive semantic eligibility so unrecognized technical tokens cannot pass as semantic prose.
- Latest full gate after this fix:
  - `npm.cmd test` - 88 tests passed.
  - `npm.cmd run build` - exit 0 and regenerated `bin/token-context-optimizer.mjs`.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.

Second final re-review requested one remaining change:

- Command content still passed semantic eligibility when cue verbs were absent, for example `Use helm upgrade before the scheduled production release.` and `Use chmod u+x deploy before the scheduled release.`.

Fix completed for that review:

- Added classification and summary-blocking regressions for cue-less command shapes.
- Added a late-line fixture where `Use helm upgrade ...` appears after six prose lines and must block summarization.
- Added a shared structural command-token predicate for command plus flag/mode/assignment/path/operational-subcommand shapes.
- Reused that predicate in both exact classification and positive semantic eligibility.
- Latest targeted check after this fix:
  - `npm.cmd test` - 93 tests passed.

## Latest Verification

- 2026-08-27 latest post-review full gate:
  - `npm.cmd test` - 93 tests passed in the latest targeted policy check.
  - Full gate must be rerun before commit after regenerating the bundle.
- 2026-08-27 previous post-review full gate:
  - `npm.cmd test` - 88 tests passed.
  - `npm.cmd run build` - exit 0 and regenerated `bin/token-context-optimizer.mjs`.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
- 2026-08-27 previous full gate after bundle whitespace normalization:
  - `npm.cmd test` - 77 tests passed.
  - `npm.cmd run build` - exit 0 and generated `bin/token-context-optimizer.mjs`.
  - `npm.cmd run typecheck` - exit 0.
  - `npm.cmd run smoke:mcp` - `mcp smoke ok`.
  - `npm.cmd run validate:plugin` - `plugin manifest ok`.
  - `npm.cmd run benchmark` - `rawTokens: 25025`, `passed: true`.
  - `git diff --cached --check` - exit 0.

## Next Steps

1. Stage `src/core/policy.ts`, `tests/core.test.ts`, and this handoff update.
2. Run `npm.cmd run build` to regenerate `bin/token-context-optimizer.mjs`, then run the full gate again.
3. Request last focused code review.
4. If review passes, commit with per-command author:
   - `git -c user.name=Codex -c user.email=codex@example.com commit -m "feat: add token context optimizer mvp"`
5. Create GitHub repository, add remote, push branch, and open PR against `main`.

## Recovery Notes

- Git safe directory was added globally for this workspace because sandbox and host identities differed.
- Repository-local Git config writes failed in sandbox, so commits should use `git -c user.name=Codex -c user.email=codex@example.com commit ...`.
- `npm.cmd install` succeeded after using `@modelcontextprotocol/server@^2.0.0`.
- `node_modules/`, `dist/`, and generated caches are ignored.
- `bin/token-context-optimizer.mjs` is a generated but intentionally checked-in runtime bundle.
- Python is unavailable in this environment, so canonical plugin Python validation cannot be run here; the Node validator mirrors the checked interface/defaultPrompt and MCP checks used by this MVP.
- If the session resumes after reboot, first run:

```powershell
cd C:\Users\00\Desktop\codex_plugin_and_skill
git status --short --branch
npm.cmd test
```

## Stop Conditions

- Do not commit or push if any full-gate command fails.
- Do not claim completion without fresh verification output.
- Do not merge any PR without explicit user approval.
