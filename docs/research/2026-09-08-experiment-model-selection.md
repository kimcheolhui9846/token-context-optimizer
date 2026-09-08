# Experiment Model Selection

Status: recommended design, not an executed experiment or frozen run manifest.
Decision/evidence date: 2026-09-08. Repository baseline: `2ed7a1f` (merged PR #10).
Read with the [evaluation protocol](2026-09-07-layered-adaptation-evaluation-protocol.md).

## Audit And Decision

The prior paper plan and protocol specified model-control requirements but no concrete
experimental model ID or snapshot. Models used by development subagents are not an
experimental assignment and their reviews are not model outcome measurements.

Recommend `gpt-4.1-mini-2025-04-14` as the primary hosted baseline for controlled
instruction and context comparisons. Prefer a dated snapshot, a modest published
inference price and a potential same-base fine-tuning pair over an unmeasured claim
that a newer model is better. This is our methodological judgment, not a vendor
recommendation or evidence of Korean/English task accuracy. Access remains unverified.

Use `gpt-5.6-luna` only as an optional exploratory replication after the primary
development qualification. It offers a contemporary tool-capable comparison, but
the opened model page did not establish a dated snapshot. Do not silently substitute
it into the primary experiment or pool outcomes across models.

## Official Evidence

All linked pages were opened on 2026-09-08. Prices are listed standard text rates in
USD per million tokens, not quotes, training prices or measured experiment costs.
Product documentation establishes advertised capabilities, not account eligibility
or empirical effectiveness. Recheck it before an authorized run.

| Candidate/source | Verified facts | Decision consequence |
| --- | --- | --- |
| [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) | Dated ID `gpt-4.1-mini-2025-04-14`; function calling, structured outputs and fine-tuning listed as supported; no reasoning step. Input $0.40, cached input $0.10, output $1.60. | Primary recommendation for snapshot control and low-cost repeated trials; not a claim that it is the latest or most capable model. |
| [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) | Function calling, structured outputs, Skills and MCP supported; fine-tuning not supported. Only `gpt-5.6-luna` observed in the snapshot section. Input $0.20, cached input $0.02, output $1.20. Reasoning effort includes `none` and defaults to `medium`. | Optional replication; prespecify `none` for the initial simple-context qualification and hold it fixed within contrasts. Alias drift limits reproducibility. |
| [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) | Input $2.00, cached input $0.20, output $12.00; fine-tuning not supported. | Defer from the initial comparison: higher listed inference cost without an established need for this project's tasks. |
| [SFT guide](https://developers.openai.com/api/docs/guides/supervised-fine-tuning) | Platform wind-down; no new-user access. Existing users may create jobs during the remaining window. `gpt-4.1-mini-2025-04-14` is a listed eligible base. | Hosted fine-tuning is conditional, not currently ready to run. Model-page support alone is insufficient. |
| [Deprecations](https://developers.openai.com/api/docs/deprecations) | `gpt-4.1-nano-2025-04-14` and its fine-tuned versions have an October 23, 2026 shutdown listing. | Do not choose nano just for lower cost. Mini's model card is not a lifetime availability guarantee; check the actual execution window. |
| [gpt-oss-20b](https://developers.openai.com/api/docs/models/gpt-oss-20b) | Open-weight, fine-tunable, Apache-2.0 model; 21B total and 3.6B active parameters. | Conditional self-hosted alternative, not a verified hosted API option or a hardware-feasibility result. |

This is a bounded shortlist for the existing design, not a comprehensive provider
survey or model leaderboard. Account access, actual latency, bilingual accuracy,
host model selection, GPU capacity and training cost have not been measured.

## Fine-Tuning And Layer Controls

- Preferred conditional pair: the exact GPT-4.1 mini snapshot above versus its own
  fine-tuned derivative. Record the returned derivative ID and base provenance;
  freeze shared endpoint, runtime instructions, context, tool schemas and budgets.
- If the account lacks existing SFT access, defer that contrast. An alternative
  requires a separate feasibility/design decision: `gpt-oss-20b` fixed weight
  revision versus an adapter trained from that same revision. Freeze tokenizer,
  chat template, serving stack, quantization, training data/order/seeds and adapter
  settings; keep inference settings identical in the base/adapter comparison.
  No weights have been downloaded and no GPU or license review has been completed.
- Do not compare OpenAI base outputs against an unrelated open-weight derivative
  and call the difference a fine-tuning effect. GPT-5.6 Luna/Terra are not the SFT
  bases for this proposal. A single trained checkpoint supports checkpoint-specific
  findings only; training-method claims require independent training runs as in
  the protocol, not merely repeated inference.
- API tool support does not prove that an installed Codex/ChatGPT host can select
  this snapshot or deliver identical inputs. Skill/plugin comparisons require
  verified host model selection and expanded instruction/configuration hashes.
  If equivalent inputs cannot be achieved, defer the isolated-layer claim or
  preregister a whole-system comparison. MCP transport and plugin installation
  endpoints retain the protocol's separate session/installation analysis units.

## Illustrative Inference Arithmetic

For planning only: 24 development records x four context conditions x three attempts
= 288 calls per model. Conditions are full source, optimizer, token-matched fixed
chunk and gold-evidence reference. Assume 8,000 uncached input tokens and 1,000
billable output tokens per call solely to illustrate sensitivity to listed prices.
That is 2.304 million input and 0.288 million output tokens:

| Model | Input + output arithmetic | Illustrative USD |
| --- | --- | --- |
| GPT-4.1 mini | 2.304 x 0.40 + 0.288 x 1.60 | 1.3824 |
| GPT-5.6 Luna | 2.304 x 0.20 + 0.288 x 1.20 | 0.8064 |
| GPT-5.6 Terra | 2.304 x 2.00 + 0.288 x 12.00 | 8.0640 |

This is not a budget ceiling or a forecast: actual context lengths differ by arm,
and the current short seed has not been tokenized against these models. It excludes
retries, tool/service charges, cache writes, training/hosting, taxes and human grading;
use provider-reported usage including reasoning/cache fields for actual accounting.
No paid requests, data upload or training job is authorized by this record.

## Next Work And Stop Conditions

1. Curate the protocol's 120 independent families with 72/24/24 family splits and
   private held-out checks. The existing 24 records are only 12 paired-language
   development families, not a training corpus or untouched test set. Preserve
   family-level leakage controls and provenance; do not relabel the public seed.
2. Confirm account/model access and whether SFT access already exists without
   recording credentials. Obtain explicit approval for a bounded inference/training
   budget and any data upload before making model calls. If access or budget is
   unavailable, stop paid execution and keep fine-tuning deferred.
3. Specify an offline run-manifest/adapter design before implementation: exact model
   ID, endpoint, supported decoding settings, reasoning effort where applicable,
   input/output/tool-call/time limits, retry and spend policy, dataset/rubric hashes,
   host/tool/plugin/skill versions and redacted usage/error traces. A price estimate
   is not a spend guard. Never silently fall back to another model. If a provider
   cannot supply a fixed revision, record that limitation and keep it exploratory.
4. Implement the approved runner with TDD and bounded independent test/code review.
   First verify offline failures for missing approval/config, model substitution,
   malformed usage, retries/timeouts, budget exhaustion and credential redaction.
   Then run targeted tests and the repository gate; prose-only preparation does not
   constitute a new RED/GREEN cycle or a live API integration test.
5. After authorization, qualify the selected model on development tasks in both
   languages, recording capability failures and actual usage/latency. Prespecify
   criteria before observing outputs; do not select settings on held-out outcomes.
   Freeze a versioned manifest before pilot/test execution. Maintain fresh sessions,
   paired randomized arms and family-clustered analysis from the protocol.
6. Arrange two independent blinded human semantic raters. Public exact checks and
   developer subagent review do not replace outcome adjudication. Keep empirical
   paper results unfilled until real traces, scores and methods review exist.

Completion of this document resolves the missing model recommendation only. Account
eligibility, the dataset, frozen execution manifest and approved experiment remain
open gates; it does not make the paper or fine-tuning experiment execution-ready.
