# 6.4b-4 summarizer implementation

- Tier E; base `c8580e91c0c1e077453290c7080e0dc671e519d7`; branch `codex/6-4b-4-summarizer-impl`.
- Scope: approved D1–D4, trailing-whitespace warning exception, tests/bundle/current docs, preregistered performance evidence, verified prototype cleanup. Historical docs/results remain unchanged.
- Status: CHANGES REQUIRED for complete evidence; mandatory performance gates PASS but required third-invalid-A/A stop reached. Draft PR #106 created and post-Draft verification PASS.

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
- Final selector review fix: redundant probe evaluation removed; fresh targeted1295pass/2skip and build PASS. Post-Draft build/core/full/typecheck/smoke:mcp/validate:plugin/benchmark PASS; full4332pass/0fail/5skip.
- Specification clarifications: late88 selection fields remain identical but D2 intentionally adds a warning; whitespace-tail controls pass BASE and are not RED. Zero-budget core selection can contain one blank line with empty summary and warning.

## Performance result / stop condition
- Preregistration and measurement HEAD: `7273824eeb9c8463f12f034c27b26a717be4e0a7`; implementation: `231084b7e2f79074f664ff502bd4a03c362f2038`.
- Overall `invalid_aa`: mandatory G1/G2/G3 all PASS, but informational blank/reference2000 exhausted three A/A attempts. No further timing or tuning performed. Raw result: [JSON](../../../research/results/6-4b-4-summarizer-perf.json).
- G1 blank also needed attempt2 because of BASE p95 A/A noise. Every failed reference comparison had invalid BASE p95 A/A (reference A/A itself passed); absolute p95 differences/limits: 4.3075/3.4171, 5.2834/4.2886, 4.9254/3.3382 ms. All attempts retained; no valid comparison selected.
- NOT RUN after mandatory stop: prose/reference2000, classify-only controls, reference50000 diagnostics. No timeout or classifier timing claim is made.
- Node24.18.0 / Windows NT 10.0.26200 (edition not recorded) / i9-12900F,24logicalCPUs; power scheme GUID381b4222-f694-41f0-9685-ff5bb260df2e unchanged. Registry identity readable; localized powercfg label has encoding replacement characters. 1066 tracked files unchanged; guarded temp cleanup confirmed.

| Gate/input/budget | Base median/p95 ms | Optimized median/p95 ms | Verdict |
|---|---:|---:|---|
| G1/blank/2000 | 16.1197/19.3600 | 18.5830/19.2995 | PASS (attempt 2) |
| G1/prose/2000 | 742.3391/750.6878 | 741.9276/756.2761 | PASS (attempt 1) |
| G2/blank/50000 | 16.0733/19.4646 | 21.1403/21.9454 | PASS (attempt 1) |
| G2/prose/50000 | 744.8499/752.0245 | 775.6394/792.9290 | PASS (attempt 1) |
| G3/late/88 | 0.1975/0.2392 | 0.1971/0.2619 | PASS (attempt 1) |
| G3/single/120 | 0.0421/0.0562 | 0.0425/0.0519 | PASS (attempt 1) |

- Result review: Claude Code `claude-opus-5-5`, result stage, blocker0/major2/minor5/note5. M1 remains an explicit evidence gap under the stop rule; no new timing. M2 was conditional: Git proves implementation, measured HEAD and current source/bundle blobs identical (`e4a24bf...` / `b6a5b76...`); duplicate probe was fixed BEFORE implementation commit and measurement. Scoped review: Claude Code `claude-opus-5-5`, CHANGES REQUIRED, blocker0/major1(open M1)/minor2/note3; M2 withdrawn/resolved.
- Interpretation: G2 median is report-only; G3 uses signed overhead, and these results also pass absolute differences. Blank optimized/reference2000 equality was checked during raw A/A calls after D2 warning normalization; prose reference equality was NOT RUN. Raw events retain the projections although the overall correctness summary is absent after stop.
- Protocol limitation: informational reference was ordered before classify-only and stress diagnostics; its stop therefore prevented required supplementary evidence. Any follow-up requires a separately approved preregistration and new output file, preserving this result.
- Local audit recomputed all A/A statistics and six gates from 1660 raw calls; environment and 1066 tracked files unchanged. OS label is Windows NT release10.0.26200; edition was not measured.

## Original checkout cleanup
- Reconstructed expected fixture bytes from the committed #105 worker; verified regular/untracked status, SHA-256 and creation date2026-11-09 KST immediately before deletion.
- Deleted21 files: `late8lines.txt`, `late8lines-full.txt`, `mixed7.txt`, `mixed7-full.txt`, `empty.txt`, `twelve-blank.txt`, `twenty-short.txt`, `too-long-budget10.txt`, `korean-natural.txt`, `mixed-crlf-cr.txt`, `policy-blocked.txt`, `semantic-20-blank.txt`, `semantic-20-short.txt`, `semantic-semantic-success-phrase.txt`, `semantic-semantic-success-phrase-80.txt`, `semantic-spelled-out-threshold-phrase-preservation.txt`, `semantic-spelled-out-threshold-phrase-preservation-80.txt`, `semantic-negation-preservation.txt`, `semantic-negation-preservation-80.txt`, `semantic-actor-action-preservation.txt`, `semantic-actor-action-preservation-80.txt`.
- Retained `diagnostic-semantic-blank.txt`:181 bytes differ from committed100k-line fixture. Retained `matrix-worker-output.json`: no exact reproducible output match established.
- `$null`, `.tmp-map.txt`, `.claude/`, `pixel-office/`, `skill_kit_kch/` and all unlisted paths untouched. Audit/deletion logs remain in original ignored `.artifacts/summarizer-impl-cleanup-*`.

## Delivery / remaining work
- [Draft PR #106](https://github.com/kimcheolhui9846/token-context-optimizer/pull/106); implementation231084b, prereg7273824, evidence3e91581; push verified. No merge.
- Final primary Astra review: CHANGES REQUIRED solely for open M1 (unrun supplementary performance evidence after the mandatory stop). Functional implementation, scope, regressions, measured-source identity and six mandatory gates verified. No Ready/merge; user amendment decision required.
- Post-Draft `git diff 7273824 -- src bin` empty; benchmark expected fields and cap0 confirmed. Raw audit: original ignored `.artifacts/summarizer-impl-audit.cjs`.
- Implementation and mandatory gates complete; overall performance evidence incomplete by explicit stop rule. Preserve results in Draft PR; independent result/scoped reviews complete and post-Draft verification PASS.
- Approval needed only for any separate protocol amendment/follow-up measurement to fill unrun controls; no new timing authorized after this stop.
- No Ready or merge. User approves next Task after final report; historical N-03 status update belongs to Claude after merge.
