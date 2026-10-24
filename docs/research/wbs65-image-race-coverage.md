# WBS 6.5 F-15 test-to-claim audit

The four claims in [image-artifacts.md](../image-artifacts.md#mcp-use) map to the
following existing tests. Line references are at base `80bbcfd`; the test file is
unchanged in this task.

| Claimed case | Test location | Injection and assertion |
|---|---|---|
| Same-size in-place overwrite | `tests/image-source-race.test.ts:62` | After canonical-path stat, overwrite with different bytes of equal length and advance timestamps; assert `source_changed` (line 85). |
| Rename replacement after bytes are read | `tests/image-source-race.test.ts:88` | After the first positive read, rename the original and create a same-size replacement with restored mtime; assert inode differs, `source_changed`, and empty store (lines 107–128). |
| Directory-junction retargeting | `tests/image-source-race.test.ts:131` | After canonical-path stat, rename the directory and replace it with a junction outside the allowed root; assert `source_changed` (lines 150–162). Windows only. |
| Mtime-restored byte replacement | `tests/image-source-race.test.ts:165` | After first positive read, overwrite in place and restore mtime; assert equal size/dev/inode/mtime but changed ctime, then `source_changed` (lines 183–203). |

`npm.cmd test -- tests/image-source-race.test.ts tests/jpeg-validation.test.ts`
passed on Windows: 8 tests in 2 files, including all four race tests with no skip.
No unmatched claim was found, so no additional test or runtime change was needed.

These deterministic schedules cover persistent replacements. The rename test
does not assert that the already-open handle read replacement bytes, and none of
the tests performs an intermediate-directory swap-and-restore (ABA). The runtime
compares path/handle metadata and canonical paths across separate operations;
these checks are not an atomic filesystem transaction.

## Recommendation for the user

Close F-15 as a **documented limitation under the existing trusted-writers
contract**, provided that contract remains acceptable. The documentation already
excludes hostile ancestor mutation and does not claim general race containment.
If untrusted concurrent writers must be supported, open a separate runtime design
task for OS-specific path/handle containment and ABA schedules. Adding another
persistent-replacement test would not establish that stronger guarantee.

This is a recommendation only: the user retains the closure decision. Runtime ABA
defense, changes to `src/`, and changes to the existing contract are out of scope.
