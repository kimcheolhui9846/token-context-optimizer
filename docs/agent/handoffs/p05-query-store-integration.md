# P05 query/store integration handoff

- Tier C; Codex worker owner: GPT-5 (runtime model alias not exposed).
- Base: `b070cb87b2d492ca68ba6611788e21611ec03293`.
- Approved heads: #113 `cc9509075139e26468d0a500f997d04ed53b624a6`, #117
  `8b8dd84bda116f252d0bf179ca883cf638f070a6`, #120
  `b11619429e687258e39f48a2705c98f03599cc68`.
- Local normal merge commits, in order: `34df87f`, `32ef0d0`, `85ea1c6`.
- Local scoped delivery commit: `8110e4b` (`test(p05): add query/store LRU integration regression`).
- Scope: S-10 store bound plus N-35/N-36 query contract integration; no additional
  research edits (approved #113 blobs preserved), hosted experiments, remote PR merge, push, Draft PR, Ready, live plugin
  install, schema/lock/API/experiment-result changes, or central WBS edits.

## Changes

- Added T36-4 functional regression in `tests/artifact-store-bound.test.ts` using
  `MemoryArtifactStore`, `indexArtifact`, and `queryArtifact` only.
- Invalid direct `contextLines` does not refresh the oldest artifact; a subsequent
  put evicts that artifact. Valid `contextLines: 0` lookup refreshes it; the same
  subsequent put evicts the other artifact.
- Source remains validation-before-`requireArtifact`; generated `bin/` is rebuilt,
  never hand-edited. P04 lock, LICENSE, notices, existing history, and research
  blobs are preserved.

## TDD and evidence

- Baseline after merges: targeted 75 tests passed (3 files).
- RED/guard proof: temporary throwaway source mutation moving `requireArtifact`
  before `contextLines` validation made T36-4 fail (expected first artifact was
  retained); mutation was reverted and is not part of the worktree.
- GREEN: T36-4 passed after reverting the mutation; focused S-10/N-35/N-36 suite
  passed 76/76 across 3 files. Full test gate passed 4514/4519 (5 existing skips).
- Gate: `npm ci --ignore-scripts`, build, typecheck, smoke:mcp, validate:plugin,
  benchmark, and diff check all passed. Isolated `install:local --no-marketplace`
  plus `verify:installed` passed in `.artifacts/p05-evidence/install-root`.
- Bundle parity after fresh build: normalized Git blob and worktree SHA-256 both
  `6265b9b4...1c76fa8` (1,096,222 bytes); P04 lock/LICENSE/notice checks passed.
- Audit: runtime `npm audit --omit=dev` 0 vulnerabilities; full combined-lock audit
  reports 5 high dev-tool vulnerabilities (exit 1), unchanged and not auto-fixed.

## Review and disposition

- Initial independent review supplied by coordinator: 0 blockers; no new review
  call is claimed by this worker.
- Claude Opus milestone review and primary Astra final review: pending coordinator.
- P05 real disposition: pending; this candidate is local verification only and has
  not been pushed, opened as Draft, or merged into remote/main.

## Remaining

- Commit the scoped test/handoff, then coordinator obtains independent Claude
  milestone review and primary Astra final review; push/Draft PR remain coordinator
  responsibilities and P05 real disposition remains pending. Worktree is clean
  after `8110e4b`.
