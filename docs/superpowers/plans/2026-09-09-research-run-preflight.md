# Offline Research Run Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved offline configuration validator, preflight report and deterministic schedule through a pure API and read-only CLI.

**Architecture:** Reuse dataset parsing/fingerprinting and pilot auditing unchanged. A strict configuration snapshot feeds deterministic hash-ranked scheduling and bounded preflight output; the CLI only decodes files and serializes the result.

**Tech Stack:** Existing TypeScript, Zod v4, Node crypto, Vitest; no new packages.

## Global Constraints

- Binding spec: `docs/superpowers/specs/2026-09-09-research-run-preflight-design.md`, approved by the user on 2026-09-09 after PR #13 review.
- No provider calls, credential reads, network requests, uploads, grading, tokenizer or model SDK.
- `dispatchAllowed` is always literal `false`.
- Four arms in exact order: `full_source`, `optimized`, `fixed_chunk`, `gold_reference`; three attempts; selected split only `development` or `test`.
- Strict schemas and explicit nulls, no defaults; code-unit sorting, detached snapshots, no serialization hooks or submitted values in errors.
- Slot allocation cap 100,000, checked before schedule construction; concurrency 1 and automatic retries 0 when non-null.
- Preserve existing dataset/scorer/pilot/exact-check/core behavior and dependency lockfile.
- Manual edits use apply_patch. Only the owner edits a file; main owns documentation and integration metadata. Agents must not revert other work.
- Current feature branch continues PR #13; no new worktree is created and no merge is authorized by implementation approval.

## Task 1: Pure Run Preparation

**Files:** Create `src/research/run-plan.ts`, optionally internal `src/research/run-plan-schema.ts`; create `tests/research-run-plan.test.ts` and, only if useful, `tests/helpers/research-run-plan.ts`.

**Interfaces:** Consume `parseResearchDataset(input: unknown)`, `fingerprintDataset(input: unknown)`, `auditPilotDataset(input: unknown)`. Produce `prepareResearchRun(dataset: unknown, configuration: unknown)` returning exactly `{ manifest, slots, preflight }` as specified. No other public runtime API is required.

- [x] Write tests before implementation. Introduce only a callable throwing stub to observe behavioral assertion failures, not an unresolved import. Minimal first fixture:

```typescript
const data = JSON.parse(readFileSync("docs/research/datasets/development-seed.json", "utf8"));
const config = {
  schemaVersion: 1, runId: "synthetic-preview", datasetSha256: fingerprintDataset(data),
  split: "development", arms: ["full_source", "optimized", "fixed_chunk", "gold_reference"],
  attemptsPerTask: 3, scheduleAlgorithm: "sha256-rank-v1", seed: "0".repeat(64),
  execution: null, evidence: null,
};
const report = prepareResearchRun(data, config);
expect(report.slots).toHaveLength(288);
expect(report.preflight).toEqual({
  configurationComplete: false, pilotStructureSatisfied: false,
  evidenceReferencesPresent: false, preflightPassed: false, dispatchAllowed: false,
  issues: [
    { code: "missing_evidence_reference", path: "evidence" },
    { code: "pilot_structure", path: "dataset.pilotStructure" },
    { code: "unresolved_execution", path: "execution" },
  ],
});
```

- [x] Run `npm.cmd test -- --run tests/research-run-plan.test.ts`; record observed RED counts and assertion reasons.
- [x] Implement strict configuration parsing. Use `z.strictObject`, nullable required fields, positive safe integers and deadline refinement. Copy field order from the spec. Convert all schema errors to `invalid_configuration`. Reuse dataset APIs only after configuration validation.

```typescript
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const unpadded = z.string().refine(value => value.trim().length > 0 && value === value.trim());
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
```

- [x] Extend RED tests in bounded batches for exact Cartesian coverage/ordinals, known-answer ranking/digests, null field issues, wrong types/missing keys/unknown nested fields, ordered validation errors, fingerprints, dataset/category/split integrity and size boundary. Use independent literal SHA-256 vectors generated before production implementation, not expectations from production helpers.
- [x] Implement one group at a time. Validate dataset/fingerprint/category/split/count in the specified order. Group families once, precompute ranks once per item, and sort decorated keys without hashing inside comparators. Construct slots in the exact field order:

```typescript
slots.push({ ordinal: slots.length + 1, familyId: task.familyId,
  taskId: task.id, language: task.language, category: task.category, arm, attempt });
```

- [x] Test full synthetic 120-family bilingual data with 72/24/24 families: each evaluation split has 576 slots and no training slots. Deliberately remove/duplicate a language while retaining auditor coverage to prove the stricter pairing guard.
- [x] Implement preflight using the auditor plus independent bilingual counts. Exact flag formulas, issue codes/paths/order, output schema and hash object order are the binding spec, not free choices. Test that complete synthetic inputs still cannot authorize dispatch.
- [x] Add canaries for private dataset fields, execution metadata and evidence IDs. Test caller insertion order and nonenumerable `toJSON` hooks at nested boundaries. Test changed dataset/config/seed bindings and payload snapshots without modifying callers.
- [x] Run targeted research tests and `npm.cmd run typecheck`; self-review. Main handles whole-project verification. Commit only the owned task files after green tests and write a report containing commands/counts/RED evidence, commits and concerns.
- [x] Independent task reviewer checks spec compliance and quality; resolve blocking findings before task 2.

## Task 2: Read-only CLI And Integration

**Files:** Create `scripts/plan-research.mjs`, `tests/research-run-plan-cli.test.ts`. Main modifies `package.json`, `tsconfig.scripts.json`, README, research usage docs, synthetic draft configuration and HANDOFF.

**Interfaces:** Import `prepareResearchRun` from `../dist/src/research/run-plan.js` and reuse `parseJsonObjectRejectingDuplicateKeys` from `./plugin-runtime.mjs`. Consume only two positional file paths; emit the exact spec envelopes, never raw exceptions.

- [ ] First create real-process tests modeled on `research-exact-cli.test.ts`: compile to a unique temporary output directory, copy CLI/parser there, create fixtures with fs test helpers, and clean only that test's temporary directory. Start against an inert CLI that prints `{}` to observe RED exit/envelope assertions.
- [ ] Cover valid seed preview, deterministic stdout, unchanged input bytes, valid-but-blocked exit 0, wrong argument count/blank paths, unreadable files, malformed JSON, duplicate keys at nested levels in both inputs, malformed UTF-8 in otherwise valid documents, malformed configuration, fingerprint mismatch and private canaries. Decode-failure fixtures must not fail merely because the valid replacement text violates another rule.
- [ ] Run `npm.cmd test -- --run tests/research-run-plan-cli.test.ts` and record observed RED reasons.
- [ ] Implement the minimal CLI control flow:

```javascript
async function main(args) {
  if (args.length !== 2 || args.some(arg => !arg.trim())) return { valid: false, code: "usage" };
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const dataset = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[0])));
    const config = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[1])));
    return { valid: true, report: prepareResearchRun(dataset, config) };
  } catch {
    return { valid: false, code: "invalid_input" };
  }
}
const result = await main(process.argv.slice(2));
console.log(JSON.stringify(result));
process.exitCode = result.valid ? 0 : 1;
```

- [ ] Run targeted CLI tests and self-review. Commit only the two owned files when green. Independent task reviewer checks actual CLI behavior and both spec/quality verdicts.
- [ ] Main adds `"plan:research": "node scripts/plan-research.mjs"` and the script to `tsconfig.scripts.json`; add a synthetic null-execution/null-evidence seed configuration with the actual dataset digest. Document build + CLI command, draft semantics, field/error contract links and no-live-dispatch boundary. Update approved spec status and HANDOFF without implying the deferred runner exists.
- [ ] Main runs targeted core/CLI tests, then `npm.cmd test`, `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, dataset audit and CLI example. Check working-tree diff and local documentation links.
- [ ] After other tests finish, record scheduler timings (one warm-up, 20 iterations, 24-record seed, 288 slots), commit/Node/OS/CPU/sample metadata and median/p95; run existing `npm.cmd run benchmark`. No new performance threshold or hosted-performance claim.
- [ ] Independent whole-branch code-reviewer and architect lanes review the combined implementation and docs, including deferred concerns. Fix blocking findings with tests and scoped re-review, record evidence, commit/push and update PR #13 against main. Do not merge.

## Progress

- Baseline: 360 tests passed on 2026-09-09 at `749e065` before implementation.
- Written design approved by the user; implementation is now authorized, not model access/spending or PR merge.
