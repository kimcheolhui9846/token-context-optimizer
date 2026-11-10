# Benchmark Plan

Run the source or compiled benchmark within the project tree containing `package.json`; Git metadata is optional. Run after build:

```powershell
npm.cmd run build
npm.cmd run benchmark
```

## Scenarios

- 25K-style build log: retrieve the error file, line, code, and diagnostic without corrupting exact data. The scenario must generate at least 25,000 estimated raw tokens before applying retrieval.
- Repeated semantic prefix phrase-retention smoke: repeat four short synthetic sentences to measure whether their required phrases remain in an extractive summary. Repetition tests prefix retention only. It cannot establish general semantic preservation or representative compression savings. Separate real-summary tests use late and mixed-sentence prose to distinguish budget-fitting acceptance cases from the remaining omission characterization. The token budget selects a contiguous complete-line prefix and may omit later lines. A successful selection of at least one line reports `summary_truncated` only when omitted later lines contain a non-whitespace character; omitted blank or whitespace-only tail lines do not trigger the warning. The late-prose case at `maxTokens: 120` and mixed-prose case at `maxTokens: 124` are acceptance cases; mixed prose at `maxTokens: 120` remains an omission characterization. These cases retain the semantic-meaning gate caveat, characterize budget-limited prefix behavior only, do not evaluate sentence-level semantic preservation, and do not force the default CLI smoke to fail.
- Code context fixture source-backed retrieval: retrieve the broken target implementation with its failing test, observed assertion, and test command in a synthetic source document where a similar-function distractor appears first. The query contains observed symptoms, and the exact gate independently checks the expected target span and its UTF-8 source offsets. With `contextLines: 6`, the expected excerpt is a 13-line window. The query distinguishes target `input` from distractor `amount`; removing that term exposes the earlier distractor. This is a bounded lexical retrieval smoke, not an editing task or a representative retrieval evaluation.

The previous `repeated semantic document extractive summary` result is now named `repeated semantic prefix phrase-retention smoke`. The previous `code editing fixture source-backed retrieval` result is now named `code context fixture source-backed retrieval`; its task-gate fields change from an editing outcome to `false` and `null`. Results under the old and new names measure different scenarios and are not directly comparable.

The repeated semantic smoke itself now selects by token budget instead of a six-line cap: `optimizedTokens` is 4400 and `reductionPercent` is 92.4. Its direct result retains four `summary_truncated` entries from the existing `flatMap`; the CLI reports the distinct warning once.

## Automated MVP Gates

- Each default scenario reduces estimated context tokens by at least 25%.
- Exact-sensitive retrieval preserves every required source span and diagnostic string for its fixture.
- The repeated semantic prefix smoke requires its fixture phrases to remain in the summary; its pass says nothing about broader summarization quality.
- Code context retrieval reports `taskGateRequired: false` and `passedTaskGate: null`. The code-context result fields remain unchanged. Generic task-gate failures still apply when another or custom scenario requires that gate.
- Each scenario runs one warm-up and 20 measured local samples. `latencyMs` mirrors the nearest-rank median of measured samples, and `p95LatencyMs` uses nearest-rank `ceil(p × n)` with rank clamped to `1..n`; for an even sample count, the median is the lower middle value. The semantic smoke reports `suiteLatencyMs` as the rounded sum of its four rounded fixture index-plus-summary durations for each sample, then aggregates that field with the same measured-sample median. Warm-up samples are excluded.
- The semantic smoke reports the maximum single-fixture index-plus-summary latency for each sample, not total suite setup time. `suiteLatencyMs` is an additional aggregate and does not replace `latencyMs` or participate in any gate.
- The local latency gate remains the loose 1000 ms upper bound on `p95LatencyMs`; measured durations are rounded to 0.01 ms and the 20-sample nearest-rank p95 uses rank 19.
- The report captures `environment` once per run: Node version, platform, architecture, `git rev-parse HEAD` as `commitSha`, and whether `git status --porcelain` is non-empty as `dirty`. Git commands use shell-free `execFileSync` at the repository root with a timeout; each Git field independently becomes `null` when its command fails. Porcelain includes untracked files, so these can also make `dirty` true.
- No product claim uses estimated savings as actual billing savings.

The benchmark command exits non-zero when a scenario fails its exact gate, fails a required task gate, drops below 25% reduction, exercises fewer than 25,000 estimated raw tokens for the build-log case, or exceeds the MVP p95 latency threshold. The code context scenario does not claim editing success.

These local synthetic fixtures establish no LLM coding ability, general retrieval quality, hosted/API latency, actual billing savings, or empirical semantic success. Median successful-task cost, semantic degradation rates, and relative hosted/API latency remain future evaluation targets that need representative fixtures and real evaluated runs.

The threshold fixture uses the spelled-out phrase `one thousand`; digit-written numeric thresholds are protected by the exact `numeric_or_table` policy and are outside this lossy-summary smoke. Fixture preparation and file writes are setup work outside measured per-sample latency; they are not included in `suiteLatencyMs` or any latency gate.
