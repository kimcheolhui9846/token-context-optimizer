# P05 query and store integration

Tier C. The candidate brings the approved store and query changes onto `main@b070cb8`. The tracked P05 additions are a regression test and this handoff.

## Candidate history

| Input | Pinned head | Local merge |
| --- | --- | --- |
| [#113](https://github.com/kimcheolhui9846/token-context-optimizer/pull/113), estimated store bound | `cc9509075139e26468d0a500f997d04ed53b624a` | `34df87f` |
| [#117](https://github.com/kimcheolhui9846/token-context-optimizer/pull/117), query contract plan | `8b8dd84bda116f252d0bf179ca883cf638f070a6` | `32ef0d0` |
| [#120](https://github.com/kimcheolhui9846/token-context-optimizer/pull/120), query implementation | `b11619429e687258e39f48a2705c98f03599cc68` | `85ea1c6` |

The three merges applied cleanly in the order above. The dependency lock and project license match the base. The S-10 limit applies to estimated store bytes. It does not measure heap or RSS.

## Contract and evidence

- T36-4 uses the public index and query paths. An invalid direct `contextLines` leaves the first record eligible for eviction. A valid query refreshes that record, so the same insertion evicts the second record.
- The integrated baseline passed 75 targeted cases. The new regression brings the targeted total to 76. In a temporary copy, an extra read refreshed the first record and the eviction assertion failed. The original test then passed. Logs are `t36-4-extra-read-red.txt` and `t36-4-clean-green.txt` under the local `.artifacts/p05-evidence/` directory.
- Direct queries accept non-negative safe integers. The existing MCP schema accepts 0 through 10. The targeted tests also cover combining marks, eviction and reindexing.
- The first-pass candidate passed 4,514 tests with five skipped, type checks, MCP smoke, plugin validation, benchmark and isolated installation. The benchmark was run on the merged product tree before the P05 test commit.
- The rebuilt executable matched the committed Git bytes (SHA-256 `6265b9b4bb650c947a9ec6cd6f83b9215d0e75fd63a5e4b8a0093e6891c76fa8`). Installation and installed-plugin verification passed.
- Runtime audit reported zero findings. Full audit reported five high development packages linked to the existing picomatch advisory. [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
- The P05 changes pass `git diff --check 85ea1c6 HEAD`. The full comparison from `b070cb8` retains #113's existing whitespace warnings in three research evidence files. Their original blobs are preserved.

## Review and approval

Claude Code Opus 5.5 independently checked the merge inputs, LRU test and positive control, direct and MCP contracts, and build evidence. It found zero blockers and zero major findings. The recorded #113 SHA, evidence for the negative control and handoff status were corrected after review.

The quality plan (§5.1) requires the user's Ready and merge decision. P05 remains open until the source PR dispositions and the integrated main tree have been verified. Preserve the original experiment files when comparing trees.
