# Registered Exact Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track each verified step below.

**Goal:** Execute public development excerpt checks without evaluating candidate code.
**Architecture:** A pinned data-only registry and pure comparator validate a detached
dataset and strict response envelope. A read-only CLI handles strict byte decoding.
**Tech Stack:** Existing TypeScript/Node/Zod/Vitest; no new dependencies.

## Global Constraints

- Use the approved exact-check design and existing feature branch/checkout.
- Exactly five output fields; invalid results have null evidence and one trusted code.
- Maximum response: 65,536 UTF-8 bytes; reject unpaired surrogates first.
- No candidate execution, model calls, new dataset families or scoring-ledger changes.
- Main owns core/registry/core tests/docs/config; CLI worker owns CLI and CLI tests.

## Task 1: Pure Registered Comparator

Files: create `src/research/exact-checks.ts`, `src/research/exact-registry.ts`,
`tests/research-exact-checks.test.ts`.
Interface: `checkExactResponse(dataset: unknown, envelope: unknown): ExactCheckResult`.
`ExactCheckResult` has nullable string datasetSha256/responseSha256/checkVersion,
nullable boolean passed, and string[] codes; invalid reports have all four values null.

- [x] Add behavior tests for four supported records, wrong excerpt variants, pinned
  record drift, unsupported tasks/checks, strict shape, hash mismatch, Unicode/size,
  serialization hooks and private-safe output. Example:
  ```ts
  expect(checkExactResponse(seed, { schemaVersion: 1, datasetSha256: seedHash,
    taskId: "clamp-guard-en", responseText: "  if (value <= 0) return 0;" }))
    .toMatchObject({ passed: false, codes: ["response_mismatch"] });
  ```
- [x] Run `npm.cmd test -- --run tests/research-exact-checks.test.ts` against an
  empty-result stub; record behavioral RED failures before implementation.
- [x] Pin full schema-snapshot record hashes for the four reviewed seed records;
  registry holds only immutable data, versioned source hashes/line index/excerpts.
  Core uses `parseResearchDataset`, `fingerprintDataset`, strict Zod envelope parsing,
  `createHash("sha256")` and byte comparison. Never compute trusted pins from runtime input.
- [x] Run the same tests to GREEN; test source-fidelity fail-closed behavior with a
  test-local corrupted registry fixture, without a production injection parameter.
- [ ] Commit the verified core/tests; independent reviewer checks the trust boundary.

## Task 2: Real CLI Boundary

Files: create `scripts/check-exact.mjs`, `tests/research-exact-cli.test.ts`;
main updates `package.json` and `tsconfig.scripts.json` after worker completion.
Consumes `checkExactResponse` from `../dist/src/research/exact-checks.js`.
Produces `check:exact` command with dataset and envelope file arguments.

- [x] Worker writes real compiled-entrypoint tests using the existing pilot CLI test
  layout: isolated `.artifacts` directory, unchanged CLI/parser copies, real project
  TypeScript compilation. Example invocation: `node scripts/check-exact.mjs seed.json response.json`.
- [x] Observe CLI-stub RED for correct/incorrect/invalid results, byte decoding of
  both files, duplicate JSON keys, BOM, invalid Unicode, file immutability and privacy.
- [x] Implement `new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })` on file
  bytes followed by the existing JSON parser. Usage/read/parse failures produce the
  five-field invalid report; `process.exitCode = result.passed === null ? 1 : 0`.
- [x] Run worker tests to GREEN, then add npm script and checkJs inclusion. Main
  reruns combined core/CLI tests and build/typecheck before integrating.

## Task 3: Evidence And PR Handoff

- [x] Add `docs/research/exact-checks.md` with envelope example, all five output fields,
  codes, byte/character limits, exact semantics, public-check boundary and no automatic
  ledger judgments; update pending statements in `development-seed.md`.
- [ ] Request independent test and code/security reviews of final files, address any
  blockers through RED/GREEN fixes and scoped re-review.
- [x] Run targeted tests, build, typecheck, full tests, MCP smoke, plugin validation,
  dataset/pilot/scoring/exact demos, benchmark and `git diff --check`.
- [x] Record a descriptive local timing spot check (warm-up, sample count, environment,
  input size and exclusions), not a performance claim or new gate.
- [ ] Update HANDOFF with actual evidence; commit/push/update PR #10 and mark ready
  only after checks and reviews pass. Do not merge without new explicit approval.
