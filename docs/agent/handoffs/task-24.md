PR #24 | branch: codex/task-24-readme-doc-links | base: main @ e2274b87bf5130cd3531eab175bebb76604c4ecd

# Task 24 — README literature links and documentation policy

## Scope and provenance

This documentation-only task applies the user-approved Claude review finding:
restore the six-line literature paragraph from the original README at
4568a9f, and add one concise rule to the shared handoff README. No runtime,
test, research, global, or index files are in scope.

## Acceptance and verification

- README matches the original six-line paragraph and retains its two original
  docs/research link targets and bounded non-exhaustive/all-unrun caveats.
- docs/agent/handoffs/README.md contains exactly the requested Korean policy
  line: “공용 README에서 Task 진행 기록은 빼되, 기능·문서 안내 설명은 PR에 유지한다.”
- This record documents the change; docs-only RED is not applicable.
- Controller verification: original six-line paragraph matches Git blob4568a9f exactly; two referenced files are tracked and exist; policy line present; no runtime/test/script/dependency diff; git diff --check PASS. Runtime tests NOT RUN for this prose-only correction. Commit/push/Draft PR are authorized; merge is not.

The Task 24 change is intentionally limited to the two existing documentation
files and this record. Other branches and documentation history remain under
their existing task records.


## Delivery checkpoint
- Draft PR: https://github.com/kimcheolhui9846/token-context-optimizer/pull/24; content commit53b5209 pushed. Post-Draft acceptance recheck passed: original paragraph exact match, two tracked link targets, single rule line, no runtime diff and diff check. Worktree clean before this evidence update.
- Author/committer verified as kim cheol hui <144594976+kimcheolhui9846@users.noreply.github.com>. No fresh Claude review claimed; user-supplied initial finding is the review input. Local verdict PASS WITH NOTES (review pending); no merge performed.
- Image stack plan delivered separately in ignored local .artifacts/plans/2026-09-29-image-stack-phase2.md; image branches untouched. Requested ten review IDs cannot be classified without missing original feedback; asked user for text/location. No unresolved finding is labeled fixed. Current main merge previews are not a waiver of required history migration.
