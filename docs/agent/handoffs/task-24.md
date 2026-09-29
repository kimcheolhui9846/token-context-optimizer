PR pending | branch: codex/task-24-readme-doc-links | base: main @ e2274b87bf5130cd3531eab175bebb76604c4ecd

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
