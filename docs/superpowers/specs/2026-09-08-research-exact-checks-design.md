# Registered Exact Excerpt Checks

Status: implemented and verified; independent code and test reviews approved.
Base: PR #9 merge `6c836de`, verified with 283 passing tests after integration.
PR: https://github.com/kimcheolhui9846/token-context-optimizer/pull/10 (merge approval pending).

## Scope And Alternatives

Recommended: a small versioned registry for the two existing development excerpt
tasks, `seed-cache-location-v1` and `seed-clamp-guard-v1`, paired in English/Korean.
Use data-only registry entries interpreted by one generic comparator, never candidate
code, callbacks or manifest-supplied commands.
This closes the pending development excerpt-check gap with a bounded attack surface.

Alternative: a general sandboxed code runner. It could support future code-generation
tasks, but introduces isolation, resource limits, filesystem/network permissions and
toolchain lifecycle requirements that these excerpt-copy tasks do not need. Defer it.

These checks are public development checks despite the historical `hiddenCheckId`
schema field name. They are not secret held-out tests, code-behavior evaluation,
human grading, or evidence of model performance.

## Contract

- A pure research module receives a dataset and a strict versioned response envelope
  containing exactly `schemaVersion: 1`, `datasetSha256`, `taskId` and `responseText`.
  No dynamic module paths,
  shell commands, tool calls or executable text are accepted as configuration.
- Validate and detach the dataset using existing helpers; verify its fingerprint
  against the envelope before looking up the task. The task must be an exact task
  supported by the registry, not just any task with a matching hidden-check name.
- Each registry entry pins its supported task definition and expected excerpt using
  checked-in trusted constants: `hiddenCheckId`, `checkVersion`, allowed task ID to
  record SHA-256 mapping, source SHA-256, zero-based source-line index and expected
  excerpt bytes. Editing an answer key, source, question or rubric
  must not redefine a passing result. Pin SHA-256 of JSON serialization of the full
  detached validated record in schema field order, including ID, split, language,
  source metadata and grading fields. This local task fingerprint convention is v1;
  record edits require an explicit registry update and review.
- After the pinned record digest matches, require the registered source SHA-256
  and source line to match. Split source lines on LF; the line excludes the LF
  terminator only (a preceding CR is retained). Compare that zero-based line's UTF-8
  bytes to the trusted excerpt, then compare response bytes to the same excerpt.
  Source-fidelity failure means invalid registry/task evidence, not a wrong response.
  Do not trim, normalize whitespace, strip Markdown fences, change line
  endings or accept additional explanatory text. The clamp guard requires two leading
  spaces and `<`; the log requires the exact filename, line, column and error code.
- Return exactly five fields: `datasetSha256`, `responseSha256`, `checkVersion`,
  `passed` and `codes`. Digests are lowercase SHA-256 strings and the checker version
  is a trusted registry string on valid results. Correct responses have `passed: true`
  and `codes: []`; wrong responses have `passed: false` and
  `codes: ["response_mismatch"]`. Invalid results have null digests, null checkVersion,
  null passed and one trusted code. No task IDs, additional fields, response text,
  expected excerpts, source text or private paths are returned.
- Invalid inputs, unknown tasks/checks, task-definition drift and fingerprint mismatch
  fail closed. A well-formed but incorrect response is a valid negative check result,
  distinguishable from input failure. Limit response text to 65,536 UTF-8 bytes and
  reject unpaired surrogates in decoded response text before UTF-8 encoding, size
  checking and hashing. Empty responses are valid negative checks. Existing parser
  limits still apply to each complete JSON document.

Invalid codes: `usage`, `invalid_input`, `dataset_fingerprint_mismatch`,
`unsupported_task`, `registry_drift`, `source_fidelity_failure`. Usage is CLI-only;
malformed shapes/JSON/Unicode/size/dataset validation map to `invalid_input`.
Unknown tasks, non-exact tasks and unknown checker IDs map to `unsupported_task`;
supported IDs with changed pinned records map to `registry_drift`.

## CLI And Integration

Add a read-only CLI taking a dataset file and response-envelope JSON file, using the
shared duplicate-key-rejecting parser. Build first; import the real compiled research
module and include the CLI in script typechecking. No files are modified.
Read both files as bytes and decode with fatal UTF-8 validation before parsing, so
invalid byte sequences cannot be silently replaced by string reads. Preserve a decoded
BOM for the existing parser to reject; do not introduce normalization before validation.

Exit 0 means a valid check report, including a failed excerpt comparison. Exit 1
means invalid input/usage with private-safe diagnostics. Document that automation
must inspect the pass field, not equate exit 0 with a correct answer.

Keep the existing scoring ledger unchanged. Check evidence does not automatically
fill fact coverage, contradiction judgments, grader identity or human adjudication.
No model, paid API, training job, new dataset families or arbitrary code execution.
Update `docs/research/development-seed.md` to replace its pending-registry/executor
statement once implementation is verified, retaining the public-development-only
boundary and the distinction from a general code-execution or hidden-test runner.

## Acceptance And Verification

Use TDD with separate core and real compiled-entrypoint RED/GREEN cycles. Cover:

1. Correct English/Korean task responses and deterministic response/dataset digests.
2. Wrong log location/code, changed operator, missing indentation, trailing newline,
   Markdown wrapping and extra prose producing valid negative results.
3. Unknown IDs, semantic tasks, copied checker IDs and altered source/answer/question/
   rubric failing closed, even with a recomputed full dataset fingerprint.
4. Malformed/duplicate JSON, fingerprint mismatch, invalid Unicode, excessive size,
   serialization hooks and successful/failed diagnostic privacy.
5. Actual compiled CLI imports, exit semantics and unchanged input files.

Independent test-engineer and code/security review must resolve blockers. Run the full
build/typecheck/test/MCP/plugin/research-demo/benchmark gate before PR. At the user's
request for periodic performance checks, retain a descriptive local checker timing
spot check with inputs, sample count and environment recorded, excluding file I/O
and model latency. It is not a new pass/fail budget or a performance-improvement claim.

## Approval Gate

The user approved proceeding after the registered-checker design confirmation.
The implementation PR still requires separate approval before merge.
