# Task 40 — compact skill integration

## Status / scope
- Tier D; task-specific requirements: one Claude plan review and root npm gate.
- Status: PASS WITH NOTES; approved wording delivered in Draft PR47; post-PR npm gate PASS.
- Base: main 49c6cc685c022b9e508d406561878ea732824d62.
- Branch/worktree: codex/task-40-compact-skill-rules / .artifacts/worktrees/task-40-compact-skill-rules.
- Scope: skills/optimize-context/SKILL.md and this handoff only. No code/schema/tests/config/dependency/research/paper changes.
- Existing K1/K2 approval retained; user approved corrected D1-D3 plan on2026-10-19, then requested rechecking Claude findings.
- No Ready, merge or Task37. Prior PR42/PR46 reviews were read-only and reported separately.

## Approved plan / delivered text
- [x] D1: add seven Compaction Integration rules immediately before Superpowers Integration.
- [x] D2: correct the old blanket no-crop paragraph; indexing/inspection remain metadata-only, crop is separate.
- [x] D3: retain ID/title/path/hash/region references with session-local recovery guidance and pinned evidence links.
- Final wording is in skills/optimize-context/SKILL.md:55; image correction at:46. Line wrapping only differs from approved handoff draft.
- Rules: index large sources; carry source references; recheck exact values; conditional authorized batch pruning; verify crop evidence; contextual multi-match queries; read small inputs directly.
- Frontmatter, Safety Policy, Superpowers Integration and Stop Conditions text unchanged.
- Small exact inputs explicitly use direct reading as an exception to the index/query workflow while retaining the no-lossy-summary rule.
- Missing fields, warning/fallback responses and insufficient evidence lead to direct source reading; no repeated-query detour.
- Crop accepts artifactId and region{x,y,width,height}; no overview option/generation. Partial RGB/supported JPEG limit1536; full-frame returns reference, not pixels.
- Query guidance reflects highest-score ties/default5/maxExcerpts1-20/moreMatches and a shared budget.
- No savings percentages, accuracy/recall guarantees, or claims about a particular host's compaction internals.
- Exploratory batching/overview limits are explicit. Path/hash recovery is engineering guidance, not measured efficacy.
- README/docs contain no skill section inventory to update; existing design sections remain untouched.

## Claude findings: checked against applied file
- Claude Code claude-opus-5-5 / single plan review / APPROVE WITH CHANGES / blocker0 major1 minor5 note4; exact-model execution succeeded.
- Major1 resolved: rule7:109 explicitly resolves small exact/direct-reading precedence; no-lossy-summary rule retained.
- Minor1 resolved: rule5:92-94 embeds partial crop/profile/1536/full-frame limits, usable without external docs.
- Minor2 resolved: ambiguous later-narrower-query sentence removed; rule6 prioritizes original lookup.
- Minor3 resolved: rule6:103-105 handles fallbackReason and warnings explicitly.
- Minor4 verified: text MemoryArtifactStore/default singleton in src/core/artifacts.ts:15-27; server uses it. Session-local statement retained.
- Minor5 resolved: rule4:86 says savings may not fully translate, rather than implying zero billed savings.
- Note1 deferred by approved plan: frontmatter-trigger expansion is optional and not included in this focused change.
- Note2 verified: pinned49c6cc6 files/headings exist, referenced research sources merged, repository public; installer ships no research/docs.
- Note3 addressed: added recovery metadata is not represented as experimentally tested.
- Note4 addressed: current handoff status updated in place.
- Primary rechecked all findings after user request. No unresolved blocker/major; no second Claude call under one-review Tier D workflow.

## Verification
- RED: N/A for approved Tier D prose change; baseline lacked compact section and incorrectly implied no crop capability. No new tests/custom document verifier.
- npm ci: PASS using existing lockfile; no dependency/package changes.
- Targeted: npm test -- tests/core.test.ts tests/image-packaging.test.ts --reporter=dot:188/188 PASS.
- Root gate: npm run build; npm run typecheck; npm test -- --reporter=dot; npm run validate:plugin; npm run smoke:mcp:PASS,864 passed/1 existing skipped,32files.
- git diff --check:PASS. Rebuilt bundle Git-normalized blob matches HEAD:0e8398995ccdeceafacd97913f1831e0cdc7b9f6; no bundle change delivered.
- SKILL consumers: tests/core.test.ts:1554 installs current runtime files;:3060 rejects invalid installed skill type. tests/image-packaging.test.ts:68 copies real skill; scripts/plugin-runtime.mjs:5 lists it.
- These checks exercise runtime packaging/file access, not semantic compliance or model behavior; validate:plugin checks manifest paths, not prose.
- Direct reading confirmed seven rules, actual schemas, evidence limits, link targets and unchanged safety/verification sections.

## Remaining / final review
- [x] Commit/push, Draft PR(main), post-PR npm gate and primary final review.
- Implementation commit:f10d710fa182e05527fd6658e906bbfa8dbf51d0; Agent: codex trailer; delivery-note commit changes only this handoff.
- PR:https://github.com/kimcheolhui9846/token-context-optimizer/pull/47; OPEN/Draft, base main; no merge performed.
- Post-PR root build/typecheck/test/validate:plugin/smoke:mcp/diff-check PASS;864 passed,1 existing skipped,32files. No product changes after this gate.
- Primary direct final review:PASS WITH NOTES; applied text/approved plan, Claude dispositions, schemas, protected scope, tests, commit/push and Draft PR checked. Only two Markdown files delivered.
- Known limitation: documentation and software checks do not establish improved model accuracy, recall or billed cost.
- Keep worktree for review; no Ready/merge/Task37 before explicit user instruction.
