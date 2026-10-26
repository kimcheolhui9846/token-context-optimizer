# 허용 루트·경로 안전 구현 계획

> **작업자 안내:** 이 계획을 실행할 때는 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용한다. 각 단계의 체크박스를 실제 결과로 갱신한다.

**목표:** 텍스트와 이미지가 동일한 허용 루트 판정을 사용하고, 경로 존재 여부를 통한 정보 노출을 줄이며, 파일을 열린 핸들에서 제한적으로 읽고 읽기 전후 스냅샷을 검증한다.

**아키텍처:** `src/core/read-bounded-file.ts`를 새 공통 경계로 두어 루트 해석, canonical path 판정, bounded handle read, 메타데이터 비교를 소유한다. `artifacts.ts`와 `image-artifacts.ts`는 이 helper의 내부 오류를 각각 기존 텍스트 문구와 이미지 오류 코드로 변환한다. 공개 MCP 스키마와 새 외부 dependency는 추가하지 않는다.

**기술 스택:** Node.js `fs/promises`·`fs.constants`, TypeScript, 기존 Vitest/npm 스크립트, Windows junction 및 POSIX symlink 테스트.

**범위와 승인:** F-20·F-22·S-02·N-23. 기준 main은 `8660174`, 조사 입력은 PR #67의 `12f7a76`이다. 가-1·T-1은 사용자 확정안이며 가-2·가-3·T-2는 채택하지 않는다. 이번 변경은 계획 문서의 커밋·push·Draft PR까지만 승인됐다. 제품 구현은 이 계획이 승인되고 merge된 뒤 별도 전달을 받아 시작한다.

## 전역 제약

- 본 계획의 구현 순서는 WBS 6.9를 먼저 merge한 뒤 6.12a PNG tolerant 구현으로 진행한다. 두 작업이 `image-artifacts.ts`를 공유한다.
- 기본 루트는 기존과 같이 호출자가 `allowedRoots`를 생략했을 때만 `process.cwd()`이며, 명시적 빈 배열은 거부한다.
- 실패한 허용 루트는 목록에서 제외한다. 유효 루트가 하나도 없으면 대상 I/O 전에 거부한다.
- 경로 문자열 선행 검사를 하지 않는다. 먼저 유효 루트를 realpath하고, 대상 realpath 성공/실패에 따라 canonical 판정을 한다.
- 텍스트의 UTF-8 동작은 유지한다. `fatal: true`, `ignoreBOM: true`를 사용하고 BOM은 보존한다. BOM을 “무시”한다고 문서화하지 않는다.
- oversize 외부 문구는 정확히 `File exceeds maxBytes limit: <size>`를 유지한다.
- timing/performance gate는 추가하지 않는다. ancestor depth 시간 차이와 모든 same-size metadata-불변 in-place write 탐지는 범위 밖이다.
- 사용자 입력 경로, realpath 결과, 링크 대상 경로를 오류 문구에 넣지 않는다(T-1).

## 현재 코드 위치와 계획 위치

조사 문서의 줄 번호는 PR67 조사 blob `12f7a76`의 stale line reference다. 구현자는 현재 main에서 아래 symbol을 찾아 적용한다.

| 책임 | 현재 symbol/파일 | 계획 변경 |
|---|---|---|
| 텍스트 경로·읽기 | `validateReadableFile`, `indexArtifact` in `src/core/artifacts.ts` | 공통 helper 호출, 내부 오류를 고정 문구로 변환, bounded UTF-8 decode/hash/map 유지 |
| 이미지 경로·읽기 | `readBoundedSource`, `indexImageArtifact`, `inspectImageArtifact`, `readValidatedImageArtifact` in `src/core/image-artifacts.ts` | 공통 helper 호출, index/inspect/crop 매핑 유지 |
| 공통 구현 | 없음 | `src/core/read-bounded-file.ts` 생성 |
| 텍스트 계약 문구 | `scripts/verify-installed-plugin.mjs`, `tests/core.test.ts` | “outside allowed roots” 구절 유지, 경로 제거 |
| 이미지 문서 | `docs/image-artifacts.md` | `read_failure`를 authorized root 안에서 읽지 못한 경우로 좁힘 |
| 설계/README | `docs/design.md`, `README.md` | 빈 TCO_ALLOWED_ROOTS의 설정 안내 추가 |

## 확정 helper 인터페이스

새 모듈은 구현 세부를 외부 API로 export하지 않고, 두 core 모듈이 사용할 내부 타입/함수만 export한다.

```ts
export type ReadBoundedFileInput = {
  path: string;
  allowedRoots: string[];
  maxBytes: number;
};

export type FileSnapshot = {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  isRegularFile: boolean;
};

export type BoundedFileResult = {
  bytes: Buffer;
  canonicalPath: string;
  snapshot: FileSnapshot;
};

export type ReadBoundedFileErrorCode =
  | "empty_roots" | "denied" | "read_failure" | "changed"
  | "non_regular" | "too_large";

export declare class ReadBoundedFileError extends Error {
  readonly code: ReadBoundedFileErrorCode;
  readonly size?: number;
  constructor(code: ReadBoundedFileErrorCode, size?: number);
}

export declare function readBoundedFile(input: ReadBoundedFileInput): Promise<BoundedFileResult>;
```

위 선언은 내부 계약이며 구현 본문은 후속 작업에서 작성한다. `canonicalPath`는 성공한 target realpath이며, `bytes`는 열린 파일 핸들에서 읽은 원본 바이트다. `snapshot`은 검증을 통과한 handle-after 값이다. helper는 디코딩하지 않는다. 텍스트 호출자는 기존 `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`, 원본 바이트 SHA256·artifactId·줄바꿈·소스맵을 보존한다. 이미지 호출자는 기존 PNG/JPEG 검증기로 바이트를 넘긴다.

## 경로 판정 결정과 pseudocode

먼저 `originalPath = resolve(input.path)`를 계산하고, 입력 `allowedRoots`가 비어 있으면 대상 I/O 전에 `empty_roots`를 반환한다. 각 root는 `resolve()` 후 `realpath()`하며 실패한 root는 버린다. canonical root가 하나도 없으면 `denied`다.

`isInside(root, candidate)`는 `relative(root, candidate)`가 `""`이거나 non-absolute이고 `".."`도 `"..${sep}"`로 시작하지 않을 때만 true로 한다. `sep`는 `node:path`의 플랫폼 구분자다. 따라서 `..notes.txt`는 허용된다.

```text
originalPath = resolve(input.path)
if input.allowedRoots.length === 0: return error(empty_roots)
roots = await Promise.all(resolve+realpath(root) with tryRealpath result)
roots = roots.filter(result.ok).map(result.path)
if roots.length === 0: return error(denied)

target = tryRealpath(originalPath)
if target.ok:
  if any isInside(root, target.path): continue to bounded-read steps below
  return error(denied)

cursor = originalPath
while true:
  ancestor = tryRealpath(cursor)
  if ancestor.ok:
    if any isInside(root, ancestor.path): return error(read_failure)
    return error(denied)
  listed = tryLstat(cursor)
  if listed.ok: return error(denied)
  if listed.error.code !== "ENOENT": return error(denied)
  parent = dirname(cursor)
  if parent === cursor: return error(denied)
  cursor = parent

tryRealpath(path) returns { ok: true, path } or { ok: false, error };
tryLstat(path) returns { ok: true, stat } or { ok: false, error };
The catches are inside these result helpers; domain decisions happen outside catches.
```

The loop starts at the target itself and distinguishes `lstat` success from `ENOENT`. EACCES, EPERM, ELOOP, and ENOTDIR are denied, never converted to a revealing read failure. No lexical precheck is allowed.

## Bounded read, snapshot, and error mapping

1. `stat(canonicalPath)` before open; reject non-regular files, and reject `size > maxBytes` as `too_large` with the observed size.
2. POSIX에서는 `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`로 연다. Windows에서는 기존 플랫폼의 지원 플래그를 사용하고 `O_NONBLOCK`을 적용하지 않는다. 핸들을 얻은 직후부터 `try/finally`로 감싸 항상 닫는다.
3. `fstat(handle)` before read; require regular type and `openedSize <= maxBytes`. Allocate exactly `openedSize + 1` and read in a bounded loop.
4. If a read would exceed `openedSize`, classify growth during reading as `changed`, never `too_large`. A size already over the limit at the open-time checks is `too_large`.
5. `fstat(handle)` after read and compare all five fields `dev`, `ino`, `size`, `mtimeMs`, `ctimeMs`, plus regular type, for path stat, handle-before, and handle-after snapshots.
6. 읽은 뒤 `stat(canonicalPath)`의 다섯 필드도 path-before/handle-before/handle-after와 모두 비교한다. `realpath(originalPath)`와 canonical path의 재해석 결과는 처음 canonical path와 같아야 한다. 필드 불일치, 읽은 양이 openedSize를 넘음, 재해석 실패/불일치는 `changed`다. 읽기 전 파일과 연 핸들의 스냅샷도 읽기 전에 비교하여 이미 바뀌었으면 읽지 않는다(열린 크기 초과 판정은 먼저 수행).
7. 검증 후에만 `bytes.subarray(0, total)`을 반환한다. 초기 stat/open/read/handle-stat의 일반 I/O 오류는 경로 없는 `read_failure`, 읽기 후 경로 재검사 실패는 `changed`로 변환한다. finally의 close 오류는 경로를 노출하거나 앞선 오류를 덮어쓰지 않도록 기존 이미지 처리처럼 억제한다.

Text mapping:

- `empty_roots` → `No allowed roots are configured; set TCO_ALLOWED_ROOTS`.
- `denied` → `File is outside allowed roots`.
- `read_failure` → `File cannot be read`.
- `changed` → `File changed while reading`.
- `non_regular` → `Path is not a regular file`.
- `too_large` → exact `File exceeds maxBytes limit: <size>`.

Image mapping (각 helper 오류별 index/inspect/crop):

| Helper error | indexImageArtifact | inspectImageArtifact | readValidatedImageArtifact/crop |
|---|---|---|---|
| `empty_roots` | `path_denied` | `path_denied` | `path_denied` |
| `denied` | `path_denied` | `path_denied` | `path_denied` |
| `read_failure` | `read_failure` | `source_missing_or_unreadable` | `source_missing_or_unreadable` |
| `changed` | `source_changed` | `source_missing_or_unreadable` | `source_changed` |
| `non_regular` | `non_regular_file` | `source_missing_or_unreadable` | `source_missing_or_unreadable` |
| `too_large` | `encoded_size_exceeded` | `source_missing_or_unreadable` | `source_missing_or_unreadable` |

After a successful read, a source hash mismatch remains `source_changed` for both inspect and crop. No new image error code is introduced.

The actual crop path already preserves `source_changed`; do not regress it while changing `readValidatedImageArtifact`. Inspect preserves only `path_denied` from reader errors and maps the remainder to `source_missing_or_unreadable`.

## Survey §5 impact classification

The following classification covers every row from `git show 12f7a76:research/plans/2026-10-26-path-safety-survey.md` §5.

| Survey row | Classification and implementation action |
|---|---|
| `tests/core.test.ts:422-446` root-outside/prefix siblings | **Maintain** existing assertions; add existing-file/missing-file parity and no-path-message assertions nearby. |
| `tests/image-artifacts.test.ts:133-160` empty list, sibling, `..`, missing, link | **Maintain** existing assertions exactly; add separate cases for the new mapping/privacy coverage without conditional expectation changes. |
| `tests/image-artifacts.test.ts:274`, crop-boundaries `:56,66,109` empty list | **Maintain** `path_denied` contract and add no regression assertion for crop source changes. |
| `scripts/smoke-mcp.mjs:201` `path_denied` | **Maintain** schema/error sanitization check; no script behavior change. |
| `scripts/verify-installed-plugin.mjs:123` phrase check | **Maintain** “outside allowed roots” substring after path removal. |
| `docs/image-artifacts.md:168` read failure meaning | **Modify** wording to authorized-root read failure. |
| `docs/design.md:70`, `README.md:44` empty list | **Modify** with `TCO_ALLOWED_ROOTS` setup guidance. |
| `tests/image-source-race.test.ts` | **Maintain** existing race coverage and extend only with helper error mapping assertions. |
| `tests/image-crop.test.ts`, `tests/image-packaging.test.ts` | **Maintain** existing behavior and packaging assertions. |
| `tests/query-artifact-mcp.test.ts`, `tests/image-crop-mcp.test.ts` | **Modify** to assert sanitized errors contain no source or link paths. |

No survey evidence file, research plan, fixture schema, or MCP public schema is changed by implementation except the explicitly listed documentation rows.

## Test matrix

Use table-driven tests for text and image. Every numbered case below must exist once per domain, with the image case asserting the mapped `ImageValidationError.code` and the text case asserting the fixed message without a path.

| # | Text and image case | Expected |
|---:|---|---|
| 1 | Root-outside existing file and root-outside missing file | Same denied result; no existence oracle. |
| 2 | In-root junction/symlink to existing outside target and missing outside target; missing target folder; broken file symlink | Same denied result. Windows junction tests run when supported; POSIX symlink tests cover file and directory links. |
| 3 | Error text/serialized image error for outside and link cases | No caller path, resolved path, or link-target path. |
| 4 | In-root `..notes.txt` | Accepted and read/indexed. |
| 5 | One invalid/missing allowed root plus one valid root | Valid-root file succeeds; failed root is omitted. |
| 6 | Empty allowed-root list | Text gives exact TCO setup message; image gives `path_denied`; no target I/O. |
| 7 | In-root missing file | Text fixed `File cannot be read`; image `read_failure`/existing inspect-crop mapping. |

Add explicit helper tests for empty roots, all-invalid roots, root itself as target, `relative === ""`, `..${sep}` versus `..notes.txt`, EACCES/EPERM/ELOOP/ENOTDIR non-ENOENT lstat errors, and root junction canonicalization. Permission cases use deterministic mocked `realpath`/`lstat`/`stat` errors; do not alter ACLs. Symlink/junction tests skip only when the platform lacks capability and record the concrete reason.

양쪽 통합 테스트에 링크 순환, 루트 안을 향하는 끊어진 링크(거부), 링크 자체인 허용 루트의 정상 파일(통과)을 명시적으로 넣는다. POSIX 파일 symlink와 Windows junction 생성 probe에서 EPERM/EACCES/ENOTSUP 등 권한·지원 부재가 확인된 경우에만 해당 플랫폼 사례를 skip하고, 테스트 이름 또는 주석·실행 출력에 코드와 이유를 남긴다. 그 외 fixture 생성 오류와 판정 실패는 skip하지 않고 실패로 처리한다.

Add N-23 deterministic tests for: pre-open/handle size already over limit → `too_large`; an initially valid `openedSize <= maxBytes` file that grows during the read loop → `changed`; opened-size plus one bounded buffer; short reads until EOF; handle stat mismatch for each `dev/ino/size/mtimeMs/ctimeMs`; non-regular file; canonical path mismatch; original-path realpath mismatch; close in `finally`; and no read after a failed precondition. Tests use injected filesystem operations or a fake handle, not sleeps or timing races.

구체 사례: 3바이트 텍스트에 `maxBytes: 3`이면 성공, 4바이트 pre-stat 또는 handle-before 크기이면 `File exceeds maxBytes limit: 4`, handle-before는 3바이트인데 읽기 중 4바이트를 반환하면 `File changed while reading`이다. 이미지의 작은 크기 사례는 helper/오류 어댑터 단위에서 시험하여 `too_large`→`encoded_size_exceeded`, `changed`→`source_changed` 매핑을 확인한다. 3바이트를 유효 이미지로 취급하지 않는다. 이미지 공개 경로 성공 사례는 유효한 PNG/JPEG로 만들고 기존 10 MiB 상한을 유지한다.

## Implementation tasks (TDD)

Before behavioral RED, run `npm.cmd run typecheck` on the untouched baseline and record a clean result. Then add public-API regression cases first; if an internal seam is needed for deterministic helper tests, introduce a compilable typed seam before asserting its behavior. An import/compile failure is not the intended RED signal. 테스트를 추가/수정한 각 단계에서도 typecheck 오류 0을 확인한 뒤 해당 테스트를 실행한다.

### Task 1: shared path classifier and bounded reader

**Files:** create `src/core/read-bounded-file.ts`; test in `tests/read-bounded-file.test.ts`.

- [ ] RED: add deterministic unit tests for the path matrix, root filtering, `isInside`, non-ENOENT errors, and N-23 snapshot/read/close behavior; run the targeted test and observe failure.
- [ ] GREEN: implement the exact types, pseudocode, error codes, handle flags, bounded loop, and snapshot comparisons above.
- [ ] REFACTOR: keep filesystem injection limited to tests, remove duplicated path normalization, and rerun the helper suite.

### Task 2: text integration and privacy-preserving messages

**Files:** modify `src/core/artifacts.ts`; tests `tests/core.test.ts`; docs `docs/design.md`, `README.md`.

- [ ] RED: extend cases 1–7 and empty-root configuration expectations before adapting `indexArtifact`.
- [ ] GREEN: call the shared helper, preserve fatal UTF-8/BOM/source-map/hash behavior, and map errors exactly.
- [ ] REFACTOR: remove obsolete path-check/read duplication and verify no error includes a path.

### Task 3: image integration and crop/inspect mappings

**Files:** modify `src/core/image-artifacts.ts`; tests `tests/image-artifacts.test.ts`, `tests/image-crop-boundaries.test.ts`; docs `docs/image-artifacts.md`.

- [ ] RED: add image cases 1–7, links/cycles/permissions/root links, and N-23 reader integration tests.
- [ ] GREEN: route index, inspect, and crop through the helper; retain index mappings, inspect behavior, and crop `source_changed`.
- [ ] REFACTOR: centralize mapping and preserve strict PNG/JPEG validation and existing store behavior.

### Task 4: MCP and installed-plugin regression checks

**Files:** modify `tests/query-artifact-mcp.test.ts` and `tests/image-crop-mcp.test.ts` for sanitized path/error assertions; maintain `tests/image-source-race.test.ts`, `tests/image-crop.test.ts`, and `tests/image-packaging.test.ts`; do not change public fixture schemas; inspect `scripts/smoke-mcp.mjs` and `scripts/verify-installed-plugin.mjs`.

- [ ] RED: run existing sanitization/phrase tests and the new MCP path-redaction cases against the new fixed messages.
- [ ] GREEN: 기존 스크립트 계약을 유지한다. 실패하면 승인된 구현의 회귀를 먼저 수정하며, 계약/공개 동작 변경이 필요하면 구체안을 보고하고 승인을 받는다.
- [ ] REFACTOR: remove temporary test artifacts and keep paths redacted in serialized errors.

## Verification order

Run targeted checks first, then the project gate in this exact order:

```powershell
npm.cmd run typecheck
npm.cmd test -- tests/read-bounded-file.test.ts tests/core.test.ts tests/image-artifacts.test.ts tests/image-crop-boundaries.test.ts tests/image-source-race.test.ts tests/image-crop.test.ts tests/image-packaging.test.ts tests/query-artifact-mcp.test.ts tests/image-crop-mcp.test.ts
npm.cmd test
npm.cmd run build
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
git diff --check
```

The plan itself has no performance gate and no custom verification script. Ancestor traversal runs only on realpath failure, so this task makes no universal performance assertion. Full prevention of parent-directory races is out of scope; metadata checks cannot detect every same-size write that preserves all compared metadata. Implementation must record failures and environment skips, especially unsupported junction/symlink privileges. A plan-only review runs direct source/requirements inspection and `git diff --check`; it does not claim an independent model review.

## Scope, risks, and ordering

- Preserve strict image validation, existing artifact IDs, source hashes, crop dimensions, and public MCP schemas.
- Do not add a dependency, change `research/`, edit evidence numbers, or solve timing side channels.
- Metadata checks reduce common read/replace races but cannot detect every same-size write that preserves all compared metadata; document this limitation in the implementation handoff if applicable.
- A conservative denial of broken in-root links is intentional to prevent existence disclosure.
- Merge/land 6.9 before beginning 6.12a. Do not implement 6.12a against a pre-6.9 `image-artifacts.ts`.

## Plan self-review

- [x] All survey §5 rows are classified as maintain or modify.
- [x] Helper interface, error codes, path decision pseudocode, and exact mappings are specified.
- [x] Text/image cases 1–7, links/cycles, permissions, root links, non-ENOENT errors, and N-23 deterministic tests are specified.
- [x] RED/GREEN/REFACTOR and ordered typecheck/tests/full/build/smoke/validate/diff commands are concrete.
- [x] 이번 계획 문서만 커밋·push하고 Draft PR을 연다. 문서 diff-check와 직접 검토로 확인하며 제품 테스트 실행이나 제품 구현 완료를 주장하지 않는다.
- [ ] 계획 승인 및 merge 후 별도 구현 지시를 받는다. 6.9 구현이 merge된 뒤 6.12a를 시작한다.
