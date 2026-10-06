# Benchmark Plan

Run after build:

```powershell
npm.cmd run build
npm.cmd run benchmark
```

## Scenarios

- 25K-style build log: retrieve the error file, line, code, and diagnostic without corrupting exact data. The scenario must generate at least 25,000 estimated raw tokens before applying retrieval.
- Repeated semantic prefix phrase-retention smoke: repeat four short synthetic sentences to measure whether their required phrases remain in an extractive summary. Repetition tests prefix retention only. It cannot establish general semantic preservation or representative compression savings. Separate known-limitation characterizations call the real summarizer on late and mixed-sentence prose and record omission after its first six source lines. They characterize this prefix behavior only; they do not evaluate sentence-level semantic preservation and do not force the default CLI smoke to fail.
- Code context fixture source-backed retrieval: retrieve the broken target implementation with its failing test, observed assertion, and test command in a synthetic source document that also contains a similar-function distractor. The query contains observed symptoms, and the exact gate independently checks the expected target span and its UTF-8 source offsets. With `contextLines: 6`, the expected excerpt is a 13-line window. The target and distractor share the test symptom and assertion; the query distinguishes them through the observed `input` versus `amount` term. This is a bounded lexical retrieval smoke, not an editing task or a representative retrieval evaluation.

The previous `repeated semantic document extractive summary` result is now named `repeated semantic prefix phrase-retention smoke`. The previous `code editing fixture source-backed retrieval` result is now named `code context fixture source-backed retrieval`; its task-gate fields change from an editing outcome to `false` and `null`. Results under the old and new names measure different scenarios and are not directly comparable.

## Automated MVP Gates

- Each default scenario reduces estimated context tokens by at least 25%.
- Exact-sensitive retrieval preserves every required source span and diagnostic string for its fixture.
- The repeated semantic prefix smoke requires its fixture phrases to remain in the summary; its pass says nothing about broader summarization quality.
- Code context retrieval reports `taskGateRequired: false` and `passedTaskGate: null`. The report field schema remains unchanged. Generic task-gate failures still apply when another or custom scenario requires that gate.
- Each scenario runs one warm-up and 20 measured local samples. `latencyMs` mirrors the median, and `p95LatencyMs` must stay within the MVP local latency threshold. The semantic smoke reports the maximum single-fixture index-plus-summary latency for each sample, not total suite setup time.
- No product claim uses estimated savings as actual billing savings.

The benchmark command exits non-zero when a scenario fails its exact gate, fails a required task gate, drops below 25% reduction, exercises fewer than 25,000 estimated raw tokens for the build-log case, or exceeds the MVP p95 latency threshold. The code context scenario does not claim editing success.

These local synthetic fixtures establish no LLM coding ability, general retrieval quality, hosted/API latency, actual billing savings, or empirical semantic success. Median successful-task cost, semantic degradation rates, and relative hosted/API latency remain future evaluation targets that need representative fixtures and real evaluated runs.
