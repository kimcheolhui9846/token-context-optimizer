# 6.4b-3 CJK estimator implementation — S-09

- Tier E: approved product correction and preregistered performance evidence.
- Base: `c9e816eeeeb8015f723c1b3e4ff825e42993b105` (#103 merge).
- Branch: `codex/6-4b-3-cjk-estimator-impl`; Draft only, no Ready/merge.
- Decisions: D1a/D2a/D3a approved in the user implementation brief.

## Scope and plan
- Change only the estimator character class to `/[\u3040-\u30FF\u3131-\uD7A3]/u`.
- Preserve UTF-16 remainder, word count/max/ceil, empty/minimum rules, confidence, warnings and `heuristic-v1`.
- Add independent expectations, document exact ranges/limitations and pre-change base, rebuild the installed bundle.
- Review runner before one preregistered measurement; preserve raw data; replay pinned impact data; verify; push Draft PR.
- Historical research results, merged plan, datasets, benchmark fixtures/thresholds, dependencies and unrelated work remain unchanged.

## Implementation and TDD
- Source regex and generated `bin/token-context-optimizer.mjs` each have one matching change.
- New tests cover kana, Hangul tail, budget flip, gap/outer boundaries, Yi, old boundary, emoji and metadata.
- RED: filtered `token estimation` tests produced 9 expected failures and 9 passes against base; raw JSON/log saved locally.
- GREEN: the same tests passed18/18 after the one-line regex fix; later additions are `counts below kana lower boundary using UTF-16 remainder`, `counts below legacy lower boundary using UTF-16 remainder`, and `preserves the heuristic-v1 metadata for kana estimates` (18→21 focused cases, 248→251 targeted).
- Existing expected-value migration: **0**. Original assertions are unchanged.
- `docs/design.md` describes the broad legacy interval, punctuation/unassigned inclusion, UTF-16 astral limit and same-profile commit provenance.
- No production refactor or dependency change.

## Validation
- Baseline: targeted231 PASS/2 SKIP; full3250 PASS/5 SKIP.
- First implementation gate: targeted248 PASS/2 SKIP; full3267 PASS/5 SKIP; typecheck/build/MCP/plugin/benchmark/diff PASS.
- Benchmark exact non-time values equal baseline; exclude generated time, environment, latency fields and timing-dependent overall passed. Exact/task gates and thresholds retained; both overall gates passed.
- Pinned impact replay: **4,234,494 bytes**, SHA-256 `dd66fbb1ec668559b744f7d7c70f4de52e59bce78d952b51b011473c7f3f2a49`, exact Git blob equality.
- New Windows checkout uses CRLF for the historical JSON; comparison uses committed bytes, without modifying that file.
- Latest premeasurement gate after three additive preservation tests: targeted251 PASS/2 SKIP; full3270 PASS/5 SKIP; typecheck/build/MCP/plugin/benchmark/diff PASS. Final post-Draft gate pending.

## Performance protocol and status
- Script: `research/src/cjk-estimator-perf.mjs`; fixed new output `research/results/cjk-estimator-perf.json`.
- Exact UTF-8 1024/10485760-byte inputs: ASCII, kana, Hangul, astral and mixed; whole units plus ASCII padding, hashes recorded.
- Six AB/BA blocks; each 5 warmups then20 samples, batch1000/1, followed within each block by independent A/A under the same procedure.
- Pooled120 median ratio≤1.05/p95 ratio≤1.10; order-strata60 median≤1.05; A/A aggregate median/p95 deviation≤3%/5%; nearest-rank p95, no rounding for decisions.
- Same TypeScript5.9.3 transpiler/settings, normalized source and emitted-regex-only proof, four independent VM modules; this measures the estimator module rather than bundle startup.
- Synthetic self-test plus untimed functional/source preflight; no timing pilot. Raw checksums use independent fixed-unit counts and batch multipliers.
- Node24.18.0, Windows10.0.26200 x64, i9-12900F/24 logical CPUs; plan/overlay/AC/battery saver read through Windows APIs at block boundaries and endpoints, all unchanged. Balanced plan, zero overlay GUID, AC=1/saver=0.
- Exclusive result creation, block checkpoints, no retry/selection. A/A/undefined verdict stops; hard crash/OOM or terminal RUNNING is FAIL. Prior definite FAIL stays visible if a later cell is INCONCLUSIVE.
- **Measurement: INCONCLUSIVE**, one run; ASCII1KiB completed 6 blocks/120 samples per arm, then stopped. Other9 cells NOT RUN. No retry, tuning or runner/source change after measurement.
- NOT RUN: ASCII10MiB; kana1KiB/10MiB; Hangul1KiB/10MiB; astral1KiB/10MiB; mixed1KiB/10MiB. Raw `A`/`B` fields are nanoseconds per batch (1000 calls for measured1KiB); warmups are separately flagged.
- A/B median ratio0.9980897073, p95 ratio0.9505394600; AB/BA median ratios0.9966849486/1.0000834646. These passing ratios are not acceptance because A/A failed.
- A/A median deviation0.4041691071% (≤3%); **p95 deviation5.2501099181% (>5%)**. Primary separately recomputed raw sample statistics/checksums and confirmed every stored ratio, count and verdict.
- Frozen runner SHA-256 `573372a57ab3a86a6a5e5008bd77469b3366bec7e328efec58447f0af7722bb4`; same bytes before/after. Source normalized hash `29c311756d9403ef4e195a40d78e8bd9d7bd282c36a5b2dc8197af382ea0602b`.
- Measured source Git blob `ca864cee4c52d194e6c638915a0e0bcb84d5b328`; final commit binding is checked after commit. A/A p95 values18877700/17886600ns produce the5.2501099181% deviation.
- Raw checkpoint writes are not atomic; a hard crash can corrupt the last checkpoint. Run-loop branches received static review, not an automated synthetic end-to-end simulation. Neither limit affected this completed cell.

## Review and corrections
- Claude `claude-opus-5-5`, initial: APPROVE WITH CHANGES, 0 blocker/1 major/7 minor/6 notes.
- Claude `claude-opus-5-5`, premeasurement: APPROVE WITH CHANGES, 0 blocker/1 major/9 minor/8 notes; normalized/emitted parity, provenance, checksum/count/status checks corrected before timing.
- Claude `claude-opus-5-5`, premeasurement recheck: 0 blocker/3 major/7 minor/9 notes; distinct module origins, actual power mode and latest stage counts addressed before measurement.
- Claude `claude-opus-5-5`, scoped: PASS, 0 blocker/0 major/1 minor/4 notes; final non-gating initial power-state metadata fixed and selftest/preflight PASS before freeze.
- Claude `claude-opus-5-5`, milestone: technical PASS / Task BLOCKED, 1 acceptance blocker/0 major/5 minor/8 notes; documentation/reporting minors addressed, commit binding checked at final gate. No implementation defect was identified; acceptance blocker remains.
- Luna first pass used D79E and failed to save RED log. Primary rejected the draft, restored only this Task's source change, saved RED JSON, applied D7A3 and revalidated. No incorrect change was committed or measured.
- Local audit first compared CRLF checkout JSON with LF replay; assertion rendering exhausted its buffer. Direct committed-blob comparison passed; no measurement was involved.
- `npm ci` reported 7 existing dependency vulnerabilities; upgrades are outside this Task.

## Delivery and approval boundary
- Commits/push/PR: pending; no merge or Ready transition.
- If performance is INCONCLUSIVE/FAIL, preserve evidence and report the blocking result; do not tune or remeasure.
- Remaining: evidence-only result review, final gate, Draft PR, direct Astra review and user decision. Performance acceptance is blocked; no further measurements or implementation without a new decision.
