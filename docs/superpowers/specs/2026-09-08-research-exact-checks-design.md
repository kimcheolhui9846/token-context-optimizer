# Registered Exact Excerpt Checks

Status: proposal awaiting user approval; no implementation has started.
Base: PR #9 merge `6c836de`, verified with 283 passing tests after integration.

## Scope And Alternatives

Recommended: a small versioned registry for the two existing development excerpt
tasks, `seed-cache-location-v1` and `seed-clamp-guard-v1`, paired in English/Korean.
Execute trusted comparison functions, never candidate code or manifest-supplied commands.
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
  checked-in trusted constants. Editing an answer key, source, question or rubric
  must not redefine a passing result. Pin SHA-256 of JSON serialization of the full
  detached validated record in schema field order, including ID, split, language,
  source metadata and grading fields. This local task fingerprint convention is v1;
  record edits require an explicit registry update and review.
- Check the response against the pinned excerpt and confirm exact source-line
  fidelity. Do not trim, normalize whitespace, strip Markdown fences, change line
  endings or accept additional explanatory text. The clamp guard requires two leading
  spaces and `<`; the log requires the exact filename, line, column and error code.
- Return versioned aggregate evidence: dataset fingerprint, response SHA-256 over
  UTF-8 text, checker identity/version, fidelity/pass booleans and trusted error codes.
  Do not echo response text, expected excerpts, source text or private paths.
- Invalid inputs, unknown tasks/checks, task-definition drift and fingerprint mismatch
  fail closed. A well-formed but incorrect response is a valid negative check result,
  distinguishable from input failure. Limit response text to 65,536 UTF-8 bytes and
  reject ill-formed Unicode before UTF-8 hashing. Empty responses are valid negative
  checks. Existing parser limits still apply to each complete JSON document.

## CLI And Integration

Add a read-only CLI taking a dataset file and response-envelope JSON file, using the
shared duplicate-key-rejecting parser. Build first; import the real compiled research
module and include the CLI in script typechecking. No files are modified.

Exit 0 means a valid check report, including a failed excerpt comparison. Exit 1
means invalid input/usage with private-safe diagnostics. Document that automation
must inspect the pass field, not equate exit 0 with a correct answer.

Keep the existing scoring ledger unchanged. Check evidence does not automatically
fill fact coverage, contradiction judgments, grader identity or human adjudication.
No model, paid API, training job, new dataset families or arbitrary code execution.

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

Independent test-engineer and code/security review must resolve blockers. Measure
local checker latency separately from file I/O and hypothetical model latency, then
run the full build/typecheck/test/MCP/plugin/research-demo/benchmark gate before PR.

## Approval Gate

The user has approved PR #9's merge and requested the next task. The specific design
above remains a proposal; implementation planning and code changes await design
approval. The next implementation PR will require separate approval before merge.
