# P04 Installed Project License

- Tier C implementation on `kimcheolhui9846/p04-installed-project-license`, based on `8ab526bdabd13886e33a2701fb29a0a9beac8419`.
- Scope: embed the complete root MIT `LICENSE` in the shipped bundle; prove the real isolated installer preserves it and the exact four-file runtime layout; correct README wording and retain third-party notice behavior.
- Worker exclusions: `LICENSE`, `research/`, dependencies/package files, installer contract, base PRs, and central handoff. Coordinator-owned remote publication, Draft PR, Ready, and merge remain outside this worker scope.

## Changes

- `scripts/build-bundle.mjs` reads root `LICENSE` for every generated bundle.
- `scripts/third-party-notices.mjs` emits a distinct `Project license (LICENSE)` section, LF-normalizes line endings, and retains comment-terminator rejection.
- `bin/token-context-optimizer.mjs` regenerated with shebang first, full project license/holder, and existing third-party notices.
- `tests/image-packaging.test.ts` invokes `scripts/install-local-plugin.mjs` in an isolated target, compares the complete root license in generated and installed bundles with LF-only normalization, checks shebang/notices, and recursively asserts exactly four installed files.
- `tests/third-party-notices.test.ts` covers project-license comment-terminator protection.
- `README.md` states the complete project MIT license is embedded and root `LICENSE` is the source of truth.
- Milestone review fixes: `scripts/third-party-notices.d.mts` now declares the optional project-license field; the generated comment identifies the project MIT license before the unchanged third-party heading; cleanup preserves project-license bytes while retaining prior third-party/code cleanup; the real-install test has a 120-second timeout and reuses `runtimeFiles` for the exact recursive file assertion.
- Final simplification: third-party horizontal-whitespace cleanup now occurs once while rendering its body; `build-bundle.mjs` concatenates the untouched rendered comment and sanitized JS directly, with no heading-based reparsing. README now uses the exact final project-license heading.

## TDD and review evidence

- RED: `.artifacts/p04-installed-project-license/red-concise.log`; focused test failed 1/1 because the unchanged bundle lacked `Project license (LICENSE)`.
- GREEN: `.artifacts/p04-installed-project-license/build-green.log` and `targeted-green.log`; build passed and 2 files/13 tests passed.
- Initial-plan cross-check: Claude Opus 5.5, proceed with conditions for exact LF-normalized unique license block, holder/paragraph preservation, exact four-file enumeration, shebang/notice compatibility, comment safety, reproducibility, README attribution, and clean scope. All conditions were implemented and checked.
- Milestone re-review: Claude Opus 5.5 requested one major, three minor, and two note-level fixes; all were applied in the scoped rework and targeted checks passed.

## Verification

- `npm.cmd ci --ignore-scripts`: completed; unchanged base reported five high dev-tool vulnerabilities.
- `npm.cmd test`: 54 files, 4470 passed, 5 skipped; `.artifacts/p04-installed-project-license/full-test.log`.
- Review-fix default `npm.cmd test` reproduced two existing 5-second timeouts in `tests/policy-redos-group3.test.ts` (4468 passed, 5 skipped); isolated default run passed 4/4, and full `npm.cmd test -- --testTimeout 30000` passed 4470/4475 with 5 skips. Evidence: `.artifacts/p04-installed-project-license/review-fix-full-test.log`, `review-fix-full-test-rerun.log`, `review-fix-policy-redos-default.log`, and `review-fix-full-test-timeout30s.log`.
- `npm.cmd run typecheck`: pass; `.artifacts/p04-installed-project-license/typecheck.log`.
- `npm.cmd run build`: pass; `.artifacts/p04-installed-project-license/build-final.log`.
- `npm.cmd run smoke:mcp`: `mcp smoke ok`; `.artifacts/p04-installed-project-license/smoke-mcp.log`.
- `npm.cmd run validate:plugin`: `plugin manifest ok`; `.artifacts/p04-installed-project-license/validate-plugin.log`.
- `npm.cmd run benchmark`: pass with `passed: true`; `.artifacts/p04-installed-project-license/benchmark.log`.
- `npm.cmd audit --omit=dev`: 0 vulnerabilities; `.artifacts/p04-installed-project-license/audit-runtime.log`.
- `npm.cmd audit`: exit 1 with five high `picomatch` dev-tool vulnerabilities; no dependency changes authorized; `.artifacts/p04-installed-project-license/audit-full.log`.
- Two consecutive builds produced identical SHA-256 `39188EA64276D6BE7B33C1BC6859AA22AB5504C296CFF589F55B009533A44549`; isolated install copied identical bundle bytes; `.artifacts/p04-installed-project-license/build-reproducibility.txt`, `reproducibility.txt`, and `repro-install.log`.
- Review-fix reproducibility: two builds and the real isolated install matched SHA-256 `782663CC7601DDFDF28C005E1C1DD554A81E2E03F7195EF9CB854E8824322FEB`; the prior third-party notice section was byte-equal. Evidence: `.artifacts/p04-installed-project-license/review-fix-reproducibility.txt` and `notice-preservation.txt`.
- Final simplification verification: build, targeted 13/13, and typecheck passed; exact UTF-8 byte comparison of the third-party section returned `True` for 1,092,921-byte slices. Evidence: `.artifacts/p04-installed-project-license/simplify-build.log`, `simplify-targeted.log`, `simplify-typecheck.log`, and `notice-preservation-simplify.txt`.
- `git diff --check`: pass; `.artifacts/p04-installed-project-license/diff-check.log` (expected Git LF/CRLF warning only).

## Status and handoff

- Worker commit: `dd3656c716e73f668e954cf75e1b03aa7a261635` (`fix(packaging): include project license in installed bundle`); no push or remote action performed.
- Pre-milestone-review handoff bookkeeping HEAD: `2755ad721e022bc6493c396257b74b4cd6bcd96b`; no push or remote action performed.
- Milestone rework commit: `45ef134b3df2eea029241ac0bd7fd20ec25c7498` (`fix(packaging): preserve project license fidelity`); no push or remote action performed.
- Tracked diff is limited to README, generated bundle, two build/notice scripts, two tests, and this handoff.
- Worker selected model: `gpt-5.6-luna`, launched by Orca for this dispatch. Independent plan and milestone provider: Claude Opus 5.5.
- Coordinator owns remote publication, Draft PR, post-PR verification, final Astra review, and approval gate.
- Post-commit `.artifacts/p04-installed-project-license/post-commit-verification.txt` confirms the committed LF Git blob, regenerated source, and isolated installed bundle all match; worktree is clean.
