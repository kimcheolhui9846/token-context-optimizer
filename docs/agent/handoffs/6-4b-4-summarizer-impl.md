# 6.4b-4 summarizer implementation

- Tier E; base `c8580e91c0c1e077453290c7080e0dc671e519d7`; branch `codex/6-4b-4-summarizer-impl`.
- Scope: approved D1–D4, trailing-whitespace warning exception, tests/bundle/current docs, preregistered performance evidence, verified prototype cleanup. Historical docs/results remain unchanged.
- Status: implementation/project gate PASS; milestone review addressed; preregistration commit pending; no formal performance run yet.

## Acceptance / design
- Longest contiguous complete-line prefix, single sourceMap; exponential probes and binary search use existing renderer/estimator without formula duplication.
- Successful nonempty selection warns `summary_truncated` only if some omitted line matches `/\S/u`; policy and first-line-too-large fallbacks unchanged.
- late120/107 and mixed124/124 preserve required meaning; mixed120/93 remains omission with warning; late123 includes all lines without warning.
- Differential oracle: uncapped original loop plus approved warning condition; compare summary/sourceMap/estimate/fallback/warnings and enforce nonvacuous outcome coverage. Monotonicity guards binary-search assumption.
- Preserve meaning gate/phrases/policy/estimator/schema/flatMap/dependencies; rebuild committed bundle.
- Performance protocol: [preregistration](6-4b-4-summarizer-perf-prereg.md); commit before measurements. G1/G2 compare optimized total call statistics to BASE; G3 small paths use BASE by user decision, unlike #105.

## Verification / review
- Baseline build/core/full/typecheck/smoke:mcp/validate:plugin/benchmark all PASS; core1279/0/2skip, full4316/0/5skip.
- Initial acceptance-test draft used numeric prose and guessed budgets; invalid failures were excluded. Corrected selector/warning RED preceded first-pass source implementation; expanded acceptance/oracle tests were then rerun against exact BASE source:1285pass/9fail/2skip, all9 intended behavior differences. Implementation bytes were restored afterward.
- Claude Code `claude-opus-5-5`, initial plan: approve with changes, blocker0/major2/minor6/note5.
- Adopted outcome-count minima, semantic-valid corpus and real-index checks, nonfinite comparison semantics, exact benchmark expectations and provenance safeguards.
- Suggested batched timing was not adopted: retain the user's per-call protocol and preregistration-before-measurement rule; A/A invalidation and stop-on-valid-failure remain mandatory. Sampling-noise risk is reported without changing the estimand.
- First-pass code/harness required integration corrections: direct benchmark warnings4, late meaning assertions, full corpus, real ABBA/A/A retries and G1 limits. Primary integrated these; independent review remains separate.
- Claude Code `claude-opus-5-5`, performance preflight: changes requested, blocker0/major1/minor5/note6; G3 output/fixture identity plus provenance/count/verdict corrections applied.
- Claude Code `claude-opus-5-5`, performance scoped: approve with minor fixes, blocker0/major0/minor5/note6. Added untimed fixture calibration, canonical prereg commit, distinct mandatory verdicts and independent finalization cleanup steps.
- GREEN targeted1294pass/2skip before calibration addition; full after addition4332pass/0fail/5skip. Build/typecheck/smoke:mcp/validate:plugin/benchmark PASS.
- Differential:238 fixtures,50346 comparisons; allfit21378,truncated22403,blank-tail717,spanfallback2947,blocked2901; >6lines33578,>32lines5008;119indexed/119synthetic. Monotonicity128seeded+10fixed PASS.
- Benchmark: optimizedTokens3950→4400,reduction93.2→92.4,CLI distinctsummary_truncated1; directexpectation4. Other non-time fields unchanged. Bundle rebuilt; legacy cap string absent.
- Claude Code `claude-opus-5-5`, milestone: approve with changes, blocker0/major0/minor6/note6; duplicate probe removed, benchmark/docs and A/A wording clarified, arm identity frozen before preregistration.
- Performance and post-Draft gate: pending.
- Specification clarifications: late88 selection fields remain identical but D2 intentionally adds a warning; whitespace-tail controls pass BASE and are not RED. Zero-budget core selection can contain one blank line with empty summary and warning.

## Original checkout cleanup
- Reconstructed expected fixture bytes from the committed #105 worker; verified regular/untracked status, SHA-256 and creation date2026-11-09 KST immediately before deletion.
- Deleted21 files: `late8lines.txt`, `late8lines-full.txt`, `mixed7.txt`, `mixed7-full.txt`, `empty.txt`, `twelve-blank.txt`, `twenty-short.txt`, `too-long-budget10.txt`, `korean-natural.txt`, `mixed-crlf-cr.txt`, `policy-blocked.txt`, `semantic-20-blank.txt`, `semantic-20-short.txt`, `semantic-semantic-success-phrase.txt`, `semantic-semantic-success-phrase-80.txt`, `semantic-spelled-out-threshold-phrase-preservation.txt`, `semantic-spelled-out-threshold-phrase-preservation-80.txt`, `semantic-negation-preservation.txt`, `semantic-negation-preservation-80.txt`, `semantic-actor-action-preservation.txt`, `semantic-actor-action-preservation-80.txt`.
- Retained `diagnostic-semantic-blank.txt`:181 bytes differ from committed100k-line fixture. Retained `matrix-worker-output.json`: no exact reproducible output match established.
- `$null`, `.tmp-map.txt`, `.claude/`, `pixel-office/`, `skill_kit_kch/` and all unlisted paths untouched. Audit/deletion logs remain in original ignored `.artifacts/summarizer-impl-cleanup-*`.

## Delivery / remaining work
- Implementation, review, preregistration commit, performance gates, push/Draft PR and final local verification remain in progress.
- No Ready or merge. User approves next Task after final report; historical N-03 status update belongs to Claude after merge.
