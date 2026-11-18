# P04 Installed Project License

- Tier C implementation on `kimcheolhui9846/p04-installed-project-license`, based on `8ab526bdabd13886e33a2701fb29a0a9beac8419`.
- Scope: embed the complete root MIT `LICENSE` in the shipped bundle; prove the real isolated installer preserves it and the exact four-file runtime layout; correct README wording and retain third-party notice behavior.
- Excluded: `LICENSE`, `research/`, dependencies/package files, installer contract, base PRs, central handoff, push, Draft PR, Ready, merge, and remote publication.

## Changes

- `scripts/build-bundle.mjs` reads root `LICENSE` for every generated bundle.
- `scripts/third-party-notices.mjs` emits a distinct `Project license (LICENSE)` section, LF-normalizes line endings, and retains comment-terminator rejection.
- `bin/token-context-optimizer.mjs` regenerated with shebang first, full project license/holder, and existing third-party notices.
- `tests/image-packaging.test.ts` invokes `scripts/install-local-plugin.mjs` in an isolated target, compares the complete root license in generated and installed bundles with LF-only normalization, checks shebang/notices, and recursively asserts exactly four installed files.
- `tests/third-party-notices.test.ts` covers project-license comment-terminator protection.
- `README.md` states the complete project MIT license is embedded and root `LICENSE` is the source of truth.

## TDD and review evidence

- RED: `.artifacts/p04-installed-project-license/red-concise.log`; focused test failed 1/1 because the unchanged bundle lacked `Project license (LICENSE)`.
- GREEN: `.artifacts/p04-installed-project-license/build-green.log` and `targeted-green.log`; build passed and 2 files/13 tests passed.
- Initial-plan cross-check: Claude Opus 5.5, proceed with conditions for exact LF-normalized unique license block, holder/paragraph preservation, exact four-file enumeration, shebang/notice compatibility, comment safety, reproducibility, README attribution, and clean scope. All conditions were implemented and checked.

## Verification

- `npm.cmd ci --ignore-scripts`: completed; unchanged base reported five high dev-tool vulnerabilities.
- `npm.cmd test`: 54 files, 4470 passed, 5 skipped; `.artifacts/p04-installed-project-license/full-test.log`.
- `npm.cmd run typecheck`: pass; `.artifacts/p04-installed-project-license/typecheck.log`.
- `npm.cmd run build`: pass; `.artifacts/p04-installed-project-license/build-final.log`.
- `npm.cmd run smoke:mcp`: `mcp smoke ok`; `.artifacts/p04-installed-project-license/smoke-mcp.log`.
- `npm.cmd run validate:plugin`: `plugin manifest ok`; `.artifacts/p04-installed-project-license/validate-plugin.log`.
- `npm.cmd run benchmark`: pass with `passed: true`; `.artifacts/p04-installed-project-license/benchmark.log`.
- `npm.cmd audit --omit=dev`: 0 vulnerabilities; `.artifacts/p04-installed-project-license/audit-runtime.log`.
- `npm.cmd audit`: exit 1 with five high `picomatch` dev-tool vulnerabilities; no dependency changes authorized; `.artifacts/p04-installed-project-license/audit-full.log`.
- Two consecutive builds produced identical SHA-256 `39188EA64276D6BE7B33C1BC6859AA22AB5504C296CFF589F55B009533A44549`; isolated install copied identical bundle bytes; `.artifacts/p04-installed-project-license/build-reproducibility.txt`, `reproducibility.txt`, and `repro-install.log`.
- `git diff --check`: pass; `.artifacts/p04-installed-project-license/diff-check.log` (expected Git LF/CRLF warning only).

## Status and handoff

- Worker commit: `dd3656c716e73f668e954cf75e1b03aa7a261635` (`fix(packaging): include project license in installed bundle`); no push or remote action performed.
- Final branch HEAD after handoff bookkeeping: `2755ad721e022bc6493c396257b74b4cd6bcd96b`; no push or remote action performed.
- Tracked diff is limited to README, generated bundle, two build/notice scripts, two tests, and this handoff.
- Worker selected model: exact runtime model ID is not exposed in this worker surface; no model identity is inferred. Independent plan provider was Claude Opus 5.5.
- Coordinator owns remote publication, Draft PR, post-PR verification, final Astra review, and approval gate.
- Post-commit `.artifacts/p04-installed-project-license/post-commit-verification.txt` confirms the committed LF Git blob, regenerated source, and isolated installed bundle all match; worktree is clean.
