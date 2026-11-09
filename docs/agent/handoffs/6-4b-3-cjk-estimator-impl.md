# 6.4b-3 CJK estimator implementation — F0 and v3

- Tier E; branch codex/6-4b-3-cjk-estimator-impl; [Draft PR #104](https://github.com/kimcheolhui9846/token-context-optimizer/pull/104); no Ready/merge.
- Baseline c9e816eeeeb8015f723c1b3e4ff825e42993b105 (#103); F0 starts at 782ad48b1a7966ad3cf6bc86f98a895aa63cddf6.
- Current acceptance: **accepted by user decision G1 (formal gate INCONCLUSIVE)**, 2026-11-09. The kana 10 MiB A/A failure and prior BLOCKED verdict remain historical evidence; no v4/retry/tuning or next Task.

## Original range implementation and v1
- D1a/D2a/D3a: union U+3040–30FF and U+3131–D7A3; UTF-16 remainder, wordish/max/ceil, empty/minimum, confidence/warnings and heuristic-v1 preserved.
- Original RED9 failures/9 passes, then GREEN18; three preservation cases brought focused total 21. Existing expectation migration 0; source/bundle one regex change at d1993dd, final record 396a7cf.
- Baseline full 3250 PASS/5 SKIP; final range implementation full 3270 PASS/5 SKIP, targeted 251 PASS/2 SKIP and all project gates PASS.
- Impact replay matches historical committed blob:4234494 bytes, SHA256 dd66fbb1ec668559b744f7d7c70f4de52e59bce78d952b51b011473c7f3f2a49; checkout newline conversion is not a historical-data change.
- v1: ten ASCII/kana/Hangul/astral/mixed ×1 KiB/10 MiB cells; six alternating AB/BA blocks,5 warmups,20 samples/block, batch 1000/1, pooled 120/strata 60; independent A/A.
- Bounds: median≤1.05,p95≤1.10,both strata median≤1.05,A/A median/p95 deviations≤3%/5%; nearest-rank p95, unrounded decisions.
- v1 INCONCLUSIVE after ASCII1KiB: A/B median 0.9980897073,p95 0.9505394600,AB/BA0.9966849486/1.0000834646; A/A0.4041691071%/5.2501099181%. Other 9 NOT RUN; no retry.
- Frozen v1 runner SHA256 573372a57ab3a86a6a5e5008bd77469b3366bec7e328efec58447f0af7722bb4; original measured source blob ca864cee4c52d194e6c638915a0e0bcb84d5b328.
- Claude claude-opus-5-5, initial: APPROVE WITH CHANGES,0 blocker/1 major/7 minor/6 notes; premeasurement:0/1/9/8; recheck:0/3/7/9; corrected before timing.
- Claude claude-opus-5-5, scoped:PASS,0 blocker/0 major/1 minor/4 notes; milestone:technical PASS/Task BLOCKED,1 acceptance blocker/0 major/5 minor/8 notes; reporting corrections applied.

## v2 history and decision F0
- User E1 changed samples only to60/block, pooled 360/strata 180; all other measurement conditions/bounds unchanged. Runner committed/pushed4525f32 before run; frozen SHA256 032bfd72abbdd2bec641f12fafb0807aa2aea1dacb384f4061d7495364e8b461.
- v2 ASCII1KiB and10MiB PASS; kana1KiB INCONCLUSIVE: median 1.5583843868,p95 1.5073094135,AB/BA1.5577696175/1.5574246153,A/A0.5735440279%/8.7979995401%. Other 7 NOT RUN.
- v2 raw SHA256 1d8fa6593ce17d59e4b4469de1c0ae600a61f387f081b7fc8cc27e9f04eab568; result blob b07f6f00b1255ea947888dcd20e7dac5258781f7; raw versus Git line endings disclosed.
- v2 PR diff transport was corrupted; later repaired with exact file/API comparison. Local reviewed runner was committed before timing and unchanged. User-supplied followup Claude review downgraded publication Major to Minor and explicitly authorized F0; historical gap is retained.
- Claude claude-opus-5-5, v2 premeasurement:APPROVE,0 blocker/0 major/3 minor/5 notes; milestone:APPROVE WITH MINOR CHANGES,0/0/4/7; publication scoped:0/1/4/6.
- User-supplied Claude diagnosis attributes kana cost to newly matched characters allocating filter-array entries; it is diagnostic evidence, not a gate result. F0 approves equivalent charCode counting and v3 with only the1KiB batch increased.

## F0 implementation and tests
- Only cjkChars and two comments changed: count UTF-16 units in the same two intervals. Both end below U+D800, so paired/unpaired surrogate units never count; code-point counts are identical. Other estimator code unchanged; bundle has only corresponding block change.
- Tests commit ae67aa4 before implementation/bundle 4e836ea: frozen full regex reference copied from 782ad48; literal backslashes verified;1024 xorshift32 cases,seed 0x6c4b3f21,length 0–500,coverage and2lone-surrogate cases.
- Initial suite 1048 PASS before/after source change. Review-followup2170fe1 adds18 repeat-four boundary cases and1typical-kana case plus interior kana/coverage assertions. Expanded 1067 PASS on frozen782ad48 alias and current implementation; runtime setup asserts old .filter present and charCode absent.
- RED not applicable to approved equivalent refactor. Original expected-value migration 0. Brief says20 existing focused cases; actual baseline has21. Added review-test commit after implementation is a disclosed sequencing adjustment, verified against both versions.
- Early Luna drafts had incorrect reference/batch/provenance checks and one misplaced kana expectation; parent rejected/corrected before runner freeze. Wrong-workspace staging test and CRLF comparison failures were not counted as implementation evidence.

## v3 preregistration and provenance
- New runner research/src/cjk-estimator-perf-v3.mjs; A/AA1/AA2 remain c9e816e, B is committed F0. Same10 inputs/hashes/order,six AB/BA blocks,5 warmups,60 samples,pooled 360/strata 180,bounds and stop rules;1 KiB batch 10000,10 MiB batch 1.
- Self-test and untimed preflight PASS; separately loaded V2-equivalence/V3-equivalence functions agree with v2 expected values for all 10 inputs. No timing pilot; timed functions receive no target-specific feedback from these checks.
- PR published via gh pr edit --body-file and fetched via gh pr view --json body: exact UTF-8 diff 12128 bytes, no normalization, both SHA256 c1a31e2ba4f4cee1414971709f09a11b506f1fc7818be6473c58d859ede57f12; verified 2026-11-09T07:28:44.948Z, before start.
- Frozen runner commit 04989de8464538ad8b12cd675fc8301707a19015; SHA256 8ac0040ee0656efe6dc542863eae3014c433837271c781dd0fbe82175693afc1; actual v3 runner blob 255203ed5ec49f9884d582e8893ac7baaf6b8db1. Inherited header and runnerGitBlob still refer to v1; runtime runnerSha256/runnerSha256Normalized identify v3.
- B source blob 9a76447a21eb8b8a1c2069c466ef84fe78335aab; normalized SHA256 db14f6ccc3413aab44208ae201b2fdfbd5bd313f4a8032c45fe7110f0354cef4; TypeScript5.9.3/CommonJS/ES2022. Source equality plus identical transpilation binds emitted artifacts, not an independent algorithm proof.
- Wrapper command: node research/src/cjk-estimator-perf-v3.mjs; SHA256 fd49b6664399d07c76c1ea956b914374c4dc6ab3f798d9b7d64e2515d7027742; clean frozen HEAD,Node24.18.0,preflight checked before exclusive marker; timeout 7200000ms. Local receipt/log retained.
- Start 2026-11-09T07:29:32.358Z; end 2026-11-09T07:42:25.524Z; exit 1; one run, no concurrent heavy work. Node/V8/OS/CPU and power state recorded in raw JSON; recorded power boundaries unchanged.

## v3 result
| Cell | Median ratio | p95 ratio | AB / BA median | A/A median / p95 deviation | Verdict |
|---|---:|---:|---|---|---|
| ascii 1  KiB | 0.1233432242 | 0.1531180132 | 0.1249831434 / 0.1214496928 | 0.2515109365% / 0.7066495100% | PASS |
| ascii 10 MiB | 0.1021607586 | 0.1224057441 | 0.1021824807 / 0.1016255664 | 0.7072116773% / 0.1269491701% | PASS |
| kana 1  KiB | 0.2622188492 | 0.2707543680 | 0.2639288752 / 0.2604781558 | 1.1435352034% / 0.5407889763% | PASS |
| kana 10 MiB | 0.0516092021 | 0.0658964890 | 0.0503163392 / 0.0545039889 | 7.2703726986% / 13.3505070121% | INCONCLUSIVE |
- Overall **INCONCLUSIVE**: kana10MiB A/A median 7.2703726986% and p95 13.3505070121% breach 3%/5%; passing A/B ratios are not acceptance. Hangul/astral/mixed at both sizes:6 NOT RUN. No v4 or retry.
- Each completed cell:360 nonwarmup A/B and360 A/A per arm,180/order. Raw ns/batch; table rounding is presentation only. Parent independently recomputed counts,warmups,checksums,full pooled/stratum statistics,control deviations and verdicts.
- Raw result SHA256 3855df782c256f4b4dcc159589774f1698936d2092c82ae6f66f6a3b8a4d0e52; Git-normalized SHA256 020725d79c333985b54f7f5695339837a123eb207968472fc912fd5bec98b454; result blob d084fafdae314454ed8e1f743b7710a673449d30. LF interior plus CRLF final newline; original file preserved.

## Final verification, review and limits
- Post-run first full gate:4315 PASS/1 FAIL/5 SKIP, existing TMP-junction smoke test at 5022ms. Isolated2/2 PASS (smoke887ms); same-settings full recheck 4316 PASS/5 SKIP,targeted 1297 PASS/2 SKIP, typecheck/build/smoke:mcp/validate:plugin/benchmark/diff PASS. No timeout/config change; transient-timeout explanation remains an inference.
- Benchmark non-time values unchanged; impact JSON regenerated byte-identical. v1/v2 source/result raw hashes unchanged; no source/runner change after measurement.
- Claude claude-opus-5-5, F0 initial:APPROVE,0 blocker/0 major/6 minor/6 notes; premeasurement:APPROVE,0/0/5/7; scoped:APPROVE,0/0/2/8. Corrections and wrapper safeguard applied before freeze; heap caveat retained.
- Claude claude-opus-5-5, F0 milestone: APPROVE WITH MINOR CHANGES (delivery), 0 blocker / 0 major / 5 minor / 9 notes; performance acceptance BLOCKED (1 acceptance blocker). Reporting fixes applied; frozen runner limitations retained.
- Historical primary Astra F0 verdict at fa9f12f: product diff, tests, raw statistics and source/runner bindings verified; performance acceptance BLOCKED before G1. Post-push verification confirmed fa9f12f, a clean tree and Draft PR #104.
- Gates execute in the native 5f4c worktree; their output logs intentionally live in the main workspace. The wrapper sets cwd explicitly. Per-gate contemporaneous HEAD/status binding was not recorded; retrospective checks confirm source/tests/bundle/runner equal frozen HEAD after build. Results and documentation are post-run changes.
- The frozen runner is not portable to arbitrary clean clones: a checkout with different v2 result line endings fails its raw-hash preflight. No replay was attempted. Inherited runnerGitBlob identifies v1 and must not be used as v3 identity; use the recorded v3 SHA and blob.
- Limits: untimed regex allocations affect shared heap/GC despite separate VM feedback; no forced GC. Batch changes prevent direct raw-latency comparison with v2. Raw v2 hash is checkout-specific; v2Reference.rawSha256 differs in naming from v1Reference.sha256.
- Original checkpoint writes are non-atomic and synthetic full-loop tests absent; hard crash/incomplete checkpoint is FAIL.7 pre-existing dependency vulnerabilities remain out of scope.
- Draft only. No Ready/merge/next Task; any further measurement, tuning or scope decision requires user authorization.

## G1 acceptance decision (2026-11-09)

- Tier E; approved documentation-only follow-up from fa9f12f. User-supplied Claude review: code APPROVE, 1 acceptance blocker / 0 major / 0 minor / 3 notes.
- Four measured B/A cells had medians from 0.052 to 0.262. The rounded post-hoc illustration for kana 10 MiB uses 1.1335 = 1 + its A/A p95 deviation (13.35%); applying this larger deviation to both median and p95 is the limited sense of conservative here, not a worst-case or statistical bound: `0.052 × 1.1335 ≈ 0.059` for median and `0.066 × 1.1335 ≈ 0.075` for p95, both well below the 1.05 / 1.10 B/A limits. This is an explanatory heuristic, not a statistical bound or replacement gate.
- The A/A instability is consistent with the Claude diagnosis that the reference path spreads the 10 MiB string into a large array and incurs variable GC work; the AA1 median was slower than AA2 in each of the six kana 10 MiB blocks. A systematic order/heap-state effect is also consistent with this observation; the GC explanation is a post-hoc interpretation, not a measured causal proof.
- The B path removes the spread/filter array work from CJK counting and compares UTF-16 units directly. The remaining estimator work, including `wordishTokens`, can still allocate; B is not claimed to be allocation-free.
- These are post-hoc interpretations. Hangul, astral and mixed at 1 KiB and 10 MiB (six cells) were not measured. Claude scratchpad charCode/reference ratios of 0.07–0.20 at 10 MiB are not repository evidence.
- v1 history: ASCII 1 KiB A/A violation; formal INCONCLUSIVE, acceptance BLOCKED.
- v2 history: kana 1 KiB structural median ratio 1.56 and A/A violation; formal INCONCLUSIVE, acceptance BLOCKED.
- F0 history: replaced CJK spread/filter counting with the equivalent charCode loop; all other estimator calculations preserved.
- v3 history: four cells measured; kana 10 MiB A/A violation left formal INCONCLUSIVE and acceptance BLOCKED until user decision G1.
- Claude claude-opus-5-5, G1 milestone: APPROVE WITH MINOR CHANGES, 0 blocker / 0 major / 3 minor / 6 notes; all three reporting fixes applied.
- G1 verification: one full test run, 4316 PASS / 5 SKIP / 0 FAIL; only the two approved docs changed, diff check PASS, control characters 0. Primary Astra: PASS WITH NOTES for G1 documentation; formal gate INCONCLUSIVE. No new measurement; Draft only, no Ready/merge.
