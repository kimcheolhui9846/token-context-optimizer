# Layered Adaptation: Evidence Register And Evaluation Protocol

Status: proposed protocol, not experimental results. Sources accessed 2026-09-07.
Repository baseline: `17cac9aa0d66078acca3e9ce6ac9f83867aac95c` (PR #6, unmerged).
This document extends the [paper plan](2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md).

The [model selection record](2026-09-08-experiment-model-selection.md) adds a dated
primary-model recommendation, alternatives and execution gates as of 2026-09-08.
It is not a frozen manifest, confirmed account access or authorization to spend.

## Verified Source Register

These are primary documentation sources, not peer-reviewed evidence of effectiveness.
The claims below are paraphrases of pages opened during preparation.

| ID | Source | Supported claim | Paper use and boundary |
| --- | --- | --- | --- |
| S1 | [OpenAI supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning) | SFT trains on example inputs and desired outputs; evaluation should precede training. The page announces wind-down and no access for new fine-tuning users. | Background and feasibility. Account access was not checked; availability and model eligibility must be rechecked before execution. |
| S2 | [Build skills](https://learn.chatgpt.com/docs/build-skills) | Skills use a `SKILL.md` with optional scripts/resources and can be explicitly or implicitly activated. Full instructions load on selection. | Workflow treatment and activation telemetry; no guaranteed compliance or accuracy benefit. |
| S3 | [OpenAI plugins](https://developers.openai.com/plugins) | Skills and MCP servers can be combined into an installable plugin. | Packaging treatment; no automatic quality improvement from packaging. |
| S4 | [MCP specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28) | MCP provides interfaces for context, prompts, and tools. Implementors remain responsible for access controls; the protocol alone cannot enforce its security principles. | Protocol background; do not infer that this repository implements every current specification feature. |
| S5 | [MCP release announcement](https://blog.modelcontextprotocol.io/posts/2026-07-28/) | The release describes a stateless core and routing/authorization changes. | Version context only; not a migration or interoperability test of this project. |

The earlier Help Center links remain historical bibliography candidates; they were not
used as verified evidence here. The layered responsibility framework is our analytical
proposal, not an established taxonomy proved by these sources. Responsibilities overlap:
skills may execute scripts, and host, server, and operating system share access enforcement.

## What The Repository Already Establishes

- `benchmarks/run.ts` evaluates deterministic local retrieval, extractive summaries,
  and a code-editing fixture. It does not train or invoke a hosted LLM.
- `semanticSummaryPassesMeaningGate` requires every configured phrase and rejects
  fallback. Phrase retention can miss contradictions and reject valid paraphrases.
- Semantic token accounting multiplies raw and summary estimates by ten. It models
  repeated context; it is not a trace of ten LLM conversations or provider billing.
- Semantic latency is a maximum of per-fixture index/summary times in each sample,
  followed by p95 across samples. It is not suite duration or user-visible response time.
- The handoff records 182 passing tests and independent code/architecture review.
  This supports engineering verification, not a causal claim that TDD or subagents
  improved accuracy or performance compared with another development process.

## Questions And Treatments

Primary question: how does each intervention affect held-out task success when the
underlying model, task information, and execution budget are controlled?

Use a staged design. Do not rank four unlike technologies as interchangeable models.

| Contrast | Control | Treatment | Held constant / inference |
| --- | --- | --- | --- |
| Workflow instructions | Base model with neutral task instructions | Same model plus fixed workflow instructions | Same tools, context and budget; estimates the instruction contribution. |
| Skill delivery | Workflow text injected directly | Identical text delivered through an explicitly activated skill | Hash expanded instructions/assets; record host-injected differences and activation failures. |
| Context optimization | Full source supplied | Optimizer-selected context from the same source | Same question, model and task budget; estimates the end-to-end optimizer intervention, not an isolated selection or length effect. |
| MCP transport | Direct adapter to optimizer | MCP adapter to identical optimizer backend | Same arguments, result bytes, permissions and tool descriptions; separates transport overhead from retrieval quality. |
| Plugin packaging | Manually configured skill and MCP capability | Same versions installed as a plugin | Same host and resolved configuration; evaluate installation, discovery, capability equivalence and failures. |
| Fine-tuning | Eligible base-model snapshot | Fine-tuned derivative of that snapshot | Same runtime context, instructions, tools and budgets; no training/test overlap. |

For model-facing comparisons, first run forced activation to isolate delivery from
discovery, then report natural skill/tool selection as a separate pragmatic experiment.
If a host prevents equivalent inputs, label the comparison as a whole-system comparison
and do not attribute differences to the isolated layer. Tool failures remain outcomes.

If fine-tuning access is unavailable, either defer that contrast or run a separately
specified open-weight base/adapter pair after license, hardware and budget checks.
Never compare an unrelated open model against an OpenAI model and call the difference
a fine-tuning effect. No training job or paid inference is authorized by this document.

For context selection claims, add a deterministic fixed-chunk baseline with the same
token budget as the optimizer output and a gold-evidence reference condition. Record
truncation and tokenizer rules. The gold condition is a diagnostic reference, not a
deployable arm or guaranteed performance ceiling. The full-source contrast alone
cannot separate evidence selection from context length.

The pilot fine-tuning contrast describes only the evaluated checkpoint. General claims
about the training method require independently trained seeds and uncertainty modeled
across training runs and source families; repeated inference from one checkpoint cannot
estimate training variance. Record training seed, data order and checkpoint selection.

## Dataset And Scoring

Proposed pilot: 120 independent source/task families, 20 in each category: numeric
thresholds, negation, actor/action, causal relations, temporal order, and exact code/log
retrieval. Include Korean and English strata and report them separately. Translations,
paraphrases, generated variants and repeated documents share one family identifier.

Assign families to train/development/test in a 60/20/20 split before generating variants.
Keep category/language balance where feasible. This small pilot estimates variance;
it is not powered evidence for a small quality difference. Choose final sample size
from pilot uncertainty and a prespecified practically meaningful effect, then freeze
an additional untouched test set before confirmatory runs.

Each task needs source provenance/license, answer key, required facts, prohibited
contradictions, acceptable paraphrases, and a deterministic rubric where possible.
Code tasks use hidden executable checks plus excerpt/source fidelity checks. Semantic
tasks use fact-level coverage and contradiction labels, not substring matching alone.

Two independent human raters, blinded to treatment, score semantic outputs; preserve
individual labels, agreement and adjudication. An LLM judge may assist only after
calibration against human labels, with judge model/prompt fixed and disagreements
reported. Developer subagent review is not a substitute for blinded outcome scoring.

## Run And Analysis Contract

1. Freeze dataset hashes, rubric, model snapshots, host/SDK versions, prompts, tool
   schemas, skill/plugin hashes, limits and retry policy before test execution.
2. Pilot three attempts per task/arm in fresh sessions, randomizing arm order within
   each task. Log seeds where supported; repeats are clustered by source family,
   not counted as independent tasks. Keep concurrency and machine conditions fixed.
3. Record run ID, family/split/language, arm, attempt, activation, input/output hashes,
   actual provider usage (including available cache/reasoning fields), tool calls,
   wall-clock latency, errors, timeouts, retries, score and grader version. Retain
   reproducible redacted traces; do not place credentials or private data in artifacts.
4. For model-facing task contrasts, primary metric: task success proportion over every attempted task, including
   failures/timeouts. Report paired success differences and 95% cluster-bootstrap
   intervals by family; report strata and counts. Prespecify one primary contrast
   before confirmatory runs; label other contrasts exploratory or adjust multiplicity.
5. Secondary metrics: contradiction rate, exact fidelity, activation failures, local
   tool latency, end-to-end p50/p95, and total inference cost divided by successful
   tasks. Include failed/retried calls in cost; with zero successes report undefined.
   Report training cost separately and amortize only against an explicit workload.
6. Separate cold/warm caches and local/hosted latency. Report sample sizes and
   uncertainty for p95; the existing 20 local samples do not establish hosted tails.

Transport and packaging use separate analysis units. For MCP, pair identical calls
within sessions, report result-byte agreement, call failure rate and paired latency,
and cluster uncertainty by session. For plugins, pair fresh installations across fixed
host configurations; report installation success, discovery/loading success per session,
and resolved capability equivalence, with clustering by installation and host strata.
Do not reuse the task-family bootstrap for these operational endpoints. Where equivalent
behavior is expected, prespecify equivalence margins (or noninferiority margins for
failure rate) and power before confirmatory testing. A nonsignificant difference is
not evidence of equivalence. Pilot estimates alone do not establish equivalence.

## Execution Milestones

1. Review this protocol, select the primary contrast and freeze a pilot manifest.
2. Build the dataset validator and scoring harness using failing tests first; have
   an independent test-engineer check leakage, malformed records, failure accounting,
   and scoring counterexamples before implementation review.
3. Reproduce and archive local benchmark JSON with commit, runtime and machine metadata.
   Keep local evidence separate from future provider traces.
4. Establish model access and a bounded experiment budget, then run the pilot. Use
   pilot data for design decisions only; keep confirmatory data untouched.
5. Conduct independent methods review and only then draft empirical results. Until
   then, write background/design sections with unmeasured results clearly marked.

Still needed for publication: primary research papers on parameter-efficient tuning,
retrieval/tool use and agent evaluation; novelty comparison; dataset provenance; actual
model experiments. Official product documentation alone is not a literature review.
