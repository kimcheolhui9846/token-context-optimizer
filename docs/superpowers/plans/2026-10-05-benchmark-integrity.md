# Benchmark Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. All steps belong to the single user-reviewable Task 26; root owns Git and handoff coordination.

**Goal:** Address F-04/F-05 by making the synthetic benchmarks and their claims agree, replacing answer-copying code editing with symptom-based code-context retrieval.

**Architecture:** Preserve the product summarizer and retriever. Characterize real summary loss separately from the repeated-prefix smoke. Replace the code fixture's supplied solution and patch execution with broken-source/test context, distractors, and an evaluator that checks the correct exact source span independently of the query.

**Tech Stack:** Existing TypeScript, Node.js and Vitest; no new dependencies.

## Approval and constraints

- Base: PR #25 merge `fcbc740dc35d84a39c403a67528bd4e00dfbb3ce`; branch `codex/task-26-benchmark-integrity`.
- User approved the recommended retrieval redesign on 2026-10-05: `진행하자` (proceed with the recommended code-context retrieval replacement, not the retain-patch-smoke alternative). No additional design selection remains pending. Question marks in the external review excerpt were a transport-encoding defect, not missing approval.
- Preserve public core/MCP behavior, UTF-8 source-span fidelity, build-log 25K minimum, token/reduction calculations, latency sampling/aggregation, temporary cleanup and CLI failure propagation.
- Exclude N-01, F-21, product summarizer/classifier changes, paid/LLM experiments, image-paper work, and unrelated feedback. Do not broaden into latency redesign or general retrieval evaluation.
- Windows commands use `tty:true`, `login:false`. Do not modify shared `docs/agent/HANDOFF.md`.
- Root maintains ignored local `HANDOFF.md`, task record, Git/PR and provider review evidence. Other agents must preserve concurrent edits.

## Exact file scope

| File | Responsibility |
| --- | --- |
| `benchmarks/run.ts` | Honest scenario labels, retrieval fixture/query/evaluator, removal of obsolete patch execution path |
| `tests/core.test.ts` | Benchmark tests and real-summarizer characterization only |
| `docs/benchmarks.md` | Measured scope, limitations, approved report semantics |
| `docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md` | Correct benchmark-dependent assertions in the historical paper plan |
| `docs/agent/handoffs/task-26.md` | Root-owned durable task evidence and review record |
| `docs/superpowers/plans/2026-10-05-benchmark-integrity.md` | This approved plan |

No `src/`, package, lockfile or shared handoff changes are planned. A tracked bundle change is included only if the normal build actually changes it and the reason is understood.

## Acceptance criteria

1. The repeated semantic fixture is explicitly a synthetic prefix phrase-retention smoke. Documentation explains why repeated sentences cannot establish general semantic preservation or representative compression savings.
2. Real `summarizeArtifact` calls demonstrate missing required content after line six and in a mixed-sentence document. `semanticSummaryPassesMeaningGate` rejects these outputs. Use ordinary prose without numeric/code/path content that would trigger policy fallback; assert `fallbackReason === null` so the observation establishes omission rather than policy blocking.
3. Existing omission behavior is GREEN characterization, never fabricated RED. These adverse examples do not silently become passing semantic preservation results and are not added to the default smoke in a way that forces routine CLI failure.
4. The retrieval document contains the broken target implementation and diagnostic/test context, plus plausible similar-function distractors. It contains no completed replacement implementation, solution instructions, or special answer marker. The query contains observed symptoms only, such as the failing test description and observed error; it does not concatenate evaluator expectations or copy a target header.
5. Evaluator expectations identify the correct target and required context independently of query construction. Exact-byte span validity alone is insufficient: an authentic span for the wrong similar function must fail. Missing required context, fallback, malformed offsets and corrupted text also fail.
6. Default real retrieval succeeds against the synthetic fixture and meets unchanged reduction/latency gates. Negative controls use actual distractor/source context rather than a constant `stale excerpt`. Their rejection does not depend on injecting a false evaluator result.
7. The replacement result is named `code context fixture source-backed retrieval`, with `taskGateRequired: false` and `passedTaskGate: null`. Preserve the report field schema and generic task-gate failure handling for other/custom scenarios. Document the changed scenario name and semantics; no editing-success claim remains for this result.
8. No benchmark claim establishes LLM coding ability, general retrieval quality, hosted/API latency, actual billing savings, or empirical semantic success from these local synthetic fixtures.
9. Distractors share the target's symptom vocabulary: similar failing-test descriptions, error class and diagnostics. No unique artificial marker or verbatim answer-locator is supplied in the query. Natural combinations of observed symptoms may distinguish the target; do not manufacture impossible equal-score ties or claim this bounded lexical fixture proves general retrieval ability.
10. Expected UTF-8 spans are derived from the actual constructed fixture, with the derived text asserted equal to the intended target/context. Do not hardcode drifting byte offsets or derive the expected target from the retrieved result.

## Implementation and verification steps

- [ ] Root records this scope in local HANDOFF and completes initial-plan provider cross-check before implementation. Actual Luna availability is established for first-pass implementation.
- [ ] Establish baseline with `npm.cmd test -- --run tests/core.test.ts`; record exact results.
- [ ] Add real-summarizer characterization for late required prose and mixed sentences using existing `indexArtifact`, `summarizeArtifact` and `semanticSummaryPassesMeaningGate`. Assert successful summarization with missing required phrase followed by gate rejection. Record any already-passing observations as characterization.
- [ ] Label these tests and inline comments as known-limitation characterization of the current six-line prefix. Assert the observed prefix boundary explicitly (there is no public configurable cutoff); if a future product improvement preserves the content, update the characterization instead of weakening the gate.
- [ ] Write new retrieval requirements before implementation. Assert absence of the completed solution from fixture input, symptom-only query construction, replacement result name/task fields, correct target success, and authentic wrong-target failure. A narrow exported pure fixture/query builder may be used if needed to inspect actual inputs; avoid source-text regex tests of implementation internals.
- [ ] Run `npm.cmd test -- --run tests/core.test.ts` and capture actual failures attributable to the newly required retrieval behavior. This is RED. Do not count unrelated failures or characterization as RED.
- [ ] Specifically demonstrate the old supplied-answer input violates the no-solution requirement. Observe wrong-target behavior against the old evaluator where feasible, but if it already rejects that context, record GREEN characterization; do not force or fabricate a RED for that negative control.
- [ ] Replace the supplied-solution block with broken source/test context and meaningful distractors. Keep setup outside measured execution as before; index/query/evaluator work remains in the measured scenario. Update `codeQueryPassesExactGate` to verify target/context as well as existing exact UTF-8 span checks.
- [ ] Remove the obsolete patch-copy/compiler/test-runner path and adapt its tests/call sites within the benchmark scope. Preserve generic `taskGateRequired` report handling and sampling regressions. Do not introduce another hardcoded repair algorithm.
- [ ] Add explicit regression assertions that a sampled retrieval result with `taskGateRequired: false` and `passedTaskGate: null` is not treated as a task failure, while a required false/null task gate still fails. Verify the default report passes with the null retrieval task gate and the actual benchmark CLI exits zero; exact-gate failures must still propagate.
- [ ] Run the targeted suite to GREEN. Refactor only local fixture/evaluator duplication, then rerun affected checks.
- [ ] Measure the finalized meaningful fixture against the unchanged reduction and latency thresholds. Record measured results. If a threshold is missed, stop and report the cause; do not enlarge filler, loosen thresholds, or otherwise retune the fixture solely to force PASS. A gate rebaseline requires a concrete proposal and user approval.
- [ ] Update benchmark documentation and only benchmark-related paper assertions. Describe the known prefix omission, the fixture-specific retrieval result, the absence of editing evaluation, and the approved report semantic change. Preserve historical provenance.
- [ ] Search tracked files for the old scenario name and semantic-degradation/code-editing/task-success claims (`git grep -n -i -E 'code editing|code-editing|semantic degradation|task success|retrieved edit'`). Classify relevant hits as current and updated, historical and preserved, or a newly discovered current claim needing a bounded documentation scope proposal. Do not rewrite historical plans or silently ignore current contradictions.
- [ ] Run the ordered full gate below. Inspect changes and record actual evidence in the root-owned Task 26 handoff. Never copy earlier counts or claim unperformed commands.

### Ordered project gate

Run each command separately from the Task 26 worktree; targeted checks precede full regression. **Build must precede typecheck.**

```powershell
npm.cmd test -- --run tests/core.test.ts
npm.cmd test
npm.cmd run build
npm.cmd run typecheck
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
npm.cmd run benchmark
git diff --check
```

Expected: all commands exit zero, benchmark reports the approved retrieval semantics, and the adverse characterization tests pass by observing truthful gate rejection. Record a blocked command as NOT RUN or FAIL with its reason rather than substituting an invented result.

## Review and delivery

- [ ] Request milestone external cross-check through the required provider hierarchy; record actual calls, findings and any DEGRADED gap. Native Astra review is separate from external provider review.
- [ ] Resolve authorized blocker/major issues and rerun affected checks. A new product change or experiment is outside this approval.
- [ ] Root inspects scoped diff, verifies author/committer, commits and pushes this Task branch, and creates one Draft PR against main. Do not merge.
- [ ] After Draft PR creation, rerun the ordered local gate and verify the remote PR includes the latest commit.
- [ ] Astra directly reviews final diff, acceptance evidence, documentation, test quality, Git/PR state and unresolved risks. Report the required Task Review Result and wait for approval before another Task.

## Risks and interpretation

- Fixture design can still favor a lexical retriever. Plausible distractors and independent target checks improve this smoke but do not make it a representative evaluation; retain that limitation explicitly.
- The report keeps its schema but changes one scenario's name and task-gate meaning. Document this approved compatibility impact rather than pretending results are comparable to prior editing outputs.
- Prefix omission is a known product limitation exposed by characterization, not a summarizer fix in this Task. Never weaken the meaning gate to turn omitted evidence into a pass.

## Initial review adjudication

- B1: Not a blocker. Actual user approval is present; the external prompt rendered Korean as question marks. The English approval description above makes the decision transport-safe.
- B2: Adopted in bounded form by acceptance criterion 9. Shared symptom vocabulary prevents a trivial unique marker; natural lexical discrimination remains valid for this explicitly synthetic retrieval smoke.
- M1: Adopted: measure unchanged gates and report a miss without tuning filler/thresholds to fit.
- M2: Adopted: explicit null-task-gate aggregation/predicate/report assertions and actual CLI execution. The schema already supports null for other scenarios; the change does not introduce a new field type.
- M3: Resolved by inspection. `applyCodeEditingExcerpt`, `runCodeEditingFixtureTests`, `extractNormalizeInputImplementation`, and `compileNormalizeInput` are implemented only in `benchmarks/run.ts`; executable references are confined to that file and `tests/core.test.ts`. Historical plan mentions remain provenance. No additional code-file scope is needed.
- M4: Adopted: tracked-file claim sweep and current/historical classification before completion.
- Minor: label known-limitations tests, explicitly observe the fixed prefix boundary, and derive expected spans. Reject the demand to force wrong-target RED if the old evaluator already rejects it; report its actual result and use the actual no-solution violation for RED.
