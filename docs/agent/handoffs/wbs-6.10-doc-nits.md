# WBS 6.10 — documentation nits

- Tier D: approved documentation-only corrections, 2026-11-02.
- Base `8a149b0`; branch `codex/doc-nits-6-10`; implementation: native Luna executor.
- Plan: apply the approved §2 wording after source checks; preserve later 6.12 explanations; validate, review, push a Draft PR, await approval.
- Scope: README, design, image contract and handoff only. No implementation, tests, evidence, research, paper or dependency changes.

## Coverage and wording

| Item | Disposition | Before → after |
| --- | --- | --- |
| D-1 | Fixed | `PNG artifact contract` → `image artifact contract` |
| D-2 | Fixed | planned experiments → paper reports separate-harness experiments; protocol records earlier pilot design. Later product boundary retained. |
| D-3 | Fixed | planned image optimization/evaluation roadmap → completed separate-harness experiments and research index; broader formats remain later work. |
| D-4 | Fixed | no inline limit guidance → SDK 2.0.0 10 MiB whole-message limit, escaping, discarded oversized requests, client-dependent failure, separate file limit and splitting. |
| D-5 | Completed partial fix | strict paragraph lacked practical ceiling → about 6.39 MP, 3088×2064 admitted / 3088×2069 rejected; exact-formula caveat retained. |
| D-6 | Fixed | path/hash identity → non-strict profile name also contributes. |
| D-7 | Already resolved | opaque tolerant PNG exception already covers partial crop and overview; unchanged. |

## Validation

- RED: not applicable to prose-only changes; direct source consistency and existing checks are acceptance criteria.
- `npm.cmd run validate:plugin`: PASS (`plugin manifest ok`).
- `git diff --check`: PASS.
- `npm.cmd test`: PASS, 38 files; 1307 passed / 5 skipped.
- Three research link targets exist; protocol introduction confirms earlier pilot status.
- Source checks: image ID profile suffix, SDK lock version 2.0.0 and buffer size, text maxBytes/too_large, strict JPEG accounting formula.
- Refactor: corrected D-2 link wrapping, retained its later boundary sentences, placed D-4 after the query explanation and D-5 in the strict section.

## Environment and errors

- Sandbox initially blocked fetch/test directory access; elevated execution resolved access.
- Fresh worktree lacked fast-png: first executable test attempt had 29 failed / 800 passed / 104 skipped.
- Reused an existing dependency tree from jpeg-tolerant-impl with identical lockfile hash; no installation or package change.
- Next run had 3 failed / 1304 passed / 5 skipped because dist/src/core/jpeg-validation.js was absent.
- `node node_modules/typescript/bin/tsc -p tsconfig.json`: PASS; generated ignored dist only. Subsequent full suite passed as above.
- Initial Claude CLI call: ECONNREFUSED, no model confirmed; elevated retry succeeded with `claude-opus-5-5` in response metadata.

## Review and notes

- User-provided Claude scope review: D-1–D-7 dispositions accepted.
- Claude Opus 5.5 / milestone / CHANGES REQUIRED / blocker 0, major 0, minor 2, note 4.
- D-6 minor adopted: profile participates in the identity hash; it is not a literal ID suffix. Directly rechecked against src/core/image-artifacts.ts.
- D-2 minor declined: preserve the explicitly requested later boundary sentence and its product/research transformation comparison; the proposed extra "It does not evaluate" sentence was already omitted. All link/heading/error-code confirmation notes checked locally.
- No blocker/major fix required; no additional reviewer call under the repository review tiers.
- Primary final review: pending PR/final verification.
- Report-only existing discrepancies: docs/design.md Goal, index_image_artifact description and Safety Invariants still describe strict 4:4:4 JPEG without tolerant support; tool list omits crop_image_artifact and overview_image_artifact. Outside approved lines; unchanged.
- No new product behavior, public API, security, performance or compatibility changes.
- Commit/push/Draft PR: pending. Ready/merge not authorized; next Task awaits user approval.
