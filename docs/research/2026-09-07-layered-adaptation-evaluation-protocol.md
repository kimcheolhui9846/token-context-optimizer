# Layered Adaptation: Evidence Register And Evaluation Protocol

Status: proposed protocol, not experimental results. Sources accessed 2026-09-07.
Original source-register baseline: `17cac9aa0d66078acca3e9ce6ac9f83867aac95c`
(PR #6 was unmerged when that register was written). Execution-detail revision:
2026-09-08, repository baseline `edf1901` (merged PR #11). Neither is a frozen run.
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
- The original source register recorded 182 tests; the merged PR #11 gate passed
  360 tests with prior independent methods/evidence and documentation verification.
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
4. For model-facing task contrasts, primary metric: task success proportion over every
   planned evaluation slot, including failures/timeouts. Missing slots remain explicit;
   incomplete runs cannot support the primary comparison described below.
   Report paired success differences and 95% cluster-bootstrap
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

## Concrete First Experiment

These are proposed operational details, not an approved preregistration. They refine
the first comparison in [development seed](development-seed.md#proposed-next-experiment)
and the [model recommendation](2026-09-08-experiment-model-selection.md).
Primary pilot contrast: `optimized - full_source` task-success difference. This tests
the end-to-end context intervention, not selection quality isolated from length.
Other comparisons are exploratory; no claim of superiority/equivalence is prespecified.

### Arms And Isolation

| Arm ID | Model-visible source context | Required control |
| --- | --- | --- |
| `full_source` | Entire original source, without silent truncation. | Full request must fit the frozen input/output limits before enrollment. |
| `optimized` | Existing optimizer output using source and question only. | Freeze optimizer version/options/query construction; preserve fallback status and selected-source hashes. No rubric, answer key or gold evidence access. |
| `fixed_chunk` | Deterministic prefix of the original source under the optimized context's token budget. | Freeze the tokenizer/version, prefix-boundary algorithm and serialization. Record actual counts and unused budget; unequal lengths do not prove a pure selection effect. |
| `gold_reference` | Source-backed evidence spans selected by curators before model execution. | Supply only source excerpts, not answer/rubric prose. This arm is a diagnostic reference, not a deployable system or guaranteed ceiling. |

Use the same question, neutral answer instructions, snapshot, endpoint, supported
decoding settings, output limit and time policy across all four arms. No live model
tool calls, skill host or plugin packaging in this first contrast: preprocessing is
outside the model. Only context bytes differ; do not expose arm IDs in model inputs
or grader packets. Optimizer errors/fallbacks remain
observations; do not drop difficult tasks or regenerate until a favorable answer.

Use a model-compatible tokenizer, not the repository's heuristic token estimate, for
budget matching. The matching algorithm must produce valid text without splitting a
code point; archive the exact input bytes. If exact token equality is unavailable,
report budget matching and the length gap, not an exactly length-controlled result.
Curators must review source length/evidence position coverage before splitting; token
strata, enrollment limits and gold-span sufficiency checks remain freeze prerequisites.
Do not claim long-context generality from the current short synthetic sources.

### Dataset And Evaluation Counts

Refine the 120-family proposal to exactly one English and one Korean task per family,
with a shared split and reviewed translation equivalence. This is stricter than the
current structural auditor's minimum language coverage, not an implemented guarantee.
Each of six categories contributes 12 train / 4 development / 4 pilot-test families.

| Dataset role | Families | Records | Four-arm slots at three attempts |
| --- | ---: | ---: | ---: |
| Training reservation | 72 | 144 | 0 in this context evaluation; reserve for conditional fine-tuning |
| Development pilot | 24 | 48 | 576 per model |
| Locked pilot-test | 24 | 48 | 576 per model |
| Current public seed, development-only | 12 | 24 | 288 if separately authorized; not an extra held-out split |

The complete proposal has 240 records, but only 96 development/pilot-test records
enter this four-arm evaluation: 1,152 planned slots per model across those two splits.
Do not add seed counts again if curated seed families are retained in development.
Family IDs do not establish independence: review shared sources, semantic overlap,
provenance/license, translations and leakage. If any seed family is unsuitable, replace
it in development; never move an exposed seed to training or held-out test.

Use development outcomes to refine the design, then freeze it before accessing the
pilot-test. That test estimates held-out pilot performance, not a powered confirmatory
effect. A later confirmatory dataset must remain untouched and be sized separately.
Do not repeatedly inspect the pilot-test to select models, prompts or checkpoints.

### Run Contract And Failure Accounting

- Precompute every `(taskId, arm, attempt)` slot and a reproducibly randomized schedule.
  Randomize family order and arm order within each task/repetition; freeze the schedule
  and RNG implementation/seed. Each call has a fresh session with no conversation reuse.
- Proposed initial concurrency is one and automatic retries are zero, yielding one
  generation request per dispatched slot. Retries in the SDK/transport must also be
  disabled and tested. A later retry-policy change requires a new frozen run version.
- Freeze numeric input/output limits, request deadline, run deadline, total spend cap,
  tokenizer, price version and supported decoding parameters before any call. These
  values are currently **unresolved**, not unlimited defaults. No silent model fallback.
  If a field or explicit access/spend/upload approval is missing, do not dispatch.
- Reserve a conservative per-request charge before dispatch and reconcile actual usage.
  Stop on uncertain billing, exhausted budget, credential exposure, model/config drift
  or a leakage/integrity failure. A timeout does not prove the provider stopped billing.
  Archive the stop reason and all planned slots; do not restart under the same run ID.
- Errors/timeouts are unsuccessful executed slots; incomplete calls may have unknown
  cost. Missing undispatched slots remain `missing`, not invented provider errors.
  Completed but ungraded responses remain ungraded, not automatic successes/failures.
  Report incomplete coverage; withhold the primary comparison until the planned run
  is complete and all completed outputs are adjudicated. Never hide an aborted run.
- Record raw redacted responses, request IDs, model/config/input/output hashes,
  provider usage and cache/reasoning fields, wall-clock times, preprocessing time,
  operational failures and adjudications. Endpoint/schema support needs development
  qualification; the selection record does not prove host or account compatibility.
  Report generation-only and preprocessing-plus-generation latency separately, and
  prespecify cold/warm preparation. No estimated-token-to-billing conversion.

The [v1 scorer](scoring.md#ledger-v1) accepts supplied per-slot summaries, not arbitrary
provider traces or two raters' raw labels. Keep those in separate versioned artifacts
and project only adjudicated results into its strict schema. Its `complete` flag alone
does not certify full telemetry, label truth, independence or research readiness.

### Grading And Analysis

Before calls, freeze source-backed fact/contradiction rubrics and private exact checks.
Two human raters independently score semantic answers in randomized, arm-blinded order;
retain each label and disagreement, then adjudicate before populating the scorer.
Report raw agreement and a prespecified chance-adjusted measure with undefined cases
explicit. Grader identity and scheduling are unresolved. No LLM judge as sole ground truth.
The public checker covers only development excerpts; unseen exact tasks require new
pinned checks. Candidate-code execution, if introduced, needs a separate safe harness.

For each family/arm, average binary success over its two languages and three attempts.
Average within-family `optimized - full_source` differences with equal family weight.
For a complete split, the proposed 95% percentile interval uses 10,000 paired bootstrap
resamples, sampling families with replacement within each category while retaining all
their languages, repetitions and arms. Freeze the resampling implementation/seed and
quantile convention before outputs; this analysis is not implemented in the v1 scorer.
Report sample counts, language/category strata and pilot uncertainty, not just a p-value.
The 24 pilot-test families are the clusters, not the 576 execution slots.

Keep contradiction rate, exact-check fidelity, actual total cost/cost per success,
activation/operational failures and latency as secondary endpoints. Unknown total cost
precludes a savings claim; zero successes makes cost per success undefined. Report
observed p95 with its sample count, not as a service guarantee. Any later noninferiority
or equivalence claim needs a justified margin and power analysis frozen before the
separate confirmatory study; absence of significance is not evidence of no degradation.

### Deferred Layer Experiments

| Follow-up | Design retained | Gate before execution |
| --- | --- | --- |
| Instructions / skill delivery | Neutral vs workflow instructions, then identical workflow text direct vs forced skill activation; natural discovery is separate. | Fixed model/host and expanded input equivalence; preregister session counts, activation telemetry and task budget. |
| MCP transport | Direct vs MCP adapter to the same backend; pair identical calls within sessions. | Byte/config/permission equivalence and isolated latency instrumentation; freeze call/session counts and cold/warm conditions. |
| Plugin packaging | Manual configuration vs plugin installation with the same resolved capabilities. | Fresh installation environments, fixed host strata and version hashes; freeze installation/session counts and recovery policy. |
| Fine-tuning | Same base snapshot vs its derivative; train only on train families and select settings on development. | Confirm SFT eligibility or separately approve same-revision open-weight base/adapter feasibility, training budget and data; freeze checkpoints/seeds and evaluation configuration. |

These are separate studies, not additional arms silently added to the 576-slot count.
Their sample counts, equivalence margins where relevant, and training configurations
are unresolved. MCP/plugin operational outcomes do not use task-family bootstrap units.

## Readiness And Acceptance

| Gate / accountable role | Evidence required to mark ready | Current state |
| --- | --- | --- |
| Data / human curator and methods reviewer | Valid schema plus 120/72/24/24 families, exact bilingual pairing, provenance/overlap review, private test/rubric freeze. | Not ready: seed is 24 records / 12 development families, train/test zero; `meetsPilotStructure: false`. |
| Model and spending / project owner | Exact accessible model, approved data and numeric spend limit, dated approval artifact without credentials. | Recommendation only; no experimental access or spend approval verified. |
| Runtime / implementer and independent test/code reviewers | Approved runner design, frozen required fields above, TDD failure tests and full project gate. | Validators/scorer/excerpt checker and [offline preflight/scheduling](run-planning.md) exist; live runner, spend guard and trace integration do not. |
| Outcomes / two blinded human raters | Assigned raters, calibrated rubric, retained individual labels, adjudication and exact-check provenance. | No real outcome ledger or assigned raters. |
| Analysis / analyst and independent methods reviewer | Tested family-paired estimator/intervals, failure coverage checks, frozen analysis version and reproducible tables. | V1 supplies descriptive per-arm metrics only. |
| Writing / author and evidence reviewer | Claim-to-source/result register, related-work comparison, reproducible artifact inventory and explicit limitations. | Outline exists; manuscript draft, novelty analysis and empirical results remain absent. |

The roles above are responsibilities, not assigned people or simulated human reviewers.
Implementer/test-engineer/code-reviewer subagents can verify research software, not
replace human outcome raters. Future runtime changes require observed RED/GREEN tests
for missing approval, model substitution, retries/timeouts, billing uncertainty, leakage
and trace redaction before integration tests and independent review. Documentation
review itself is not a TDD cycle. Collection requires the data/model/runtime gates,
assigned raters with a frozen rubric, and a frozen, offline-tested analysis design.
Completed labels, result tables and empirical writing are post-collection exit gates,
not circular prerequisites for generating responses. Paid calls still require approval.

## Execution Milestones

1. Review these proposed details and resolve the readiness checklist. Freeze a pilot
   manifest only after data review and explicit access/budget/data-upload approval.
2. Retain the existing dataset/scoring/excerpt-check gates; implement the separately
   approved runner and analysis with failing tests first and independent test/code
   review. Do not describe planned telemetry/statistics as already implemented.
3. Reproduce and archive local benchmark JSON with commit, runtime and machine metadata.
   Keep local evidence separate from future provider traces.
4. Establish model access and a bounded experiment budget, then run the pilot. Use
   pilot data for design decisions only; keep confirmatory data untouched.
5. Conduct independent methods review and only then draft empirical results. Until
   then, write background/design sections with unmeasured results clearly marked.

Still needed for publication: primary research papers on parameter-efficient tuning,
retrieval/tool use and agent evaluation; novelty comparison; dataset provenance; actual
model experiments. Official product documentation alone is not a literature review.
