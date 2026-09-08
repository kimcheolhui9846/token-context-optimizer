# LLM Fine-Tuning, Plugins, MCP, And Skills Paper Plan

## Working Title

Layered Adaptation for LLM Systems: Fine-Tuning, Plugins, MCP Servers, and Skills in Verified Context Optimization Workflows

## Thesis

LLM application quality is not determined only by base-model or fine-tuned weights. A practical system can be modeled as layered adaptation: fine-tuning changes model behavior inside the model, skills change repeatable workflow policy, plugins package and distribute capabilities, and MCP servers expose governed external context and actions. The token-context-optimizer project provides a local case study for verifying this layered adaptation through exact retrieval gates, semantic degradation fixtures, latency percentiles, and TDD/subagent review policy.

## Research Questions

1. How should fine-tuning be distinguished from plugin, MCP, and skill-based adaptation in LLM systems?
2. Which layer should own durable behavior, external state access, safety policy, and workflow repeatability?
3. Can local verification gates detect context-loss and semantic degradation before a workflow is exposed as a plugin or MCP capability?
4. What benchmark evidence is needed before claiming token efficiency, reliability, or safety benefits?

## Source Baseline

Verified sources and a controlled comparison design are recorded in the
[evaluation protocol](2026-09-07-layered-adaptation-evaluation-protocol.md).
That register supersedes the unverified bibliography targets below. As of 2026-09-07,
the official SFT guide announces a wind-down and no new-user access; a real fine-tuning
experiment is conditional on confirmed access or a separately controlled alternative.

The [2026-09-08 model selection record](2026-09-08-experiment-model-selection.md)
now recommends a concrete baseline and records current official evidence, conditional
fine-tuning alternatives, illustrative costs and the remaining execution gates.

- OpenAI fine-tuning API reference: fine-tuning jobs tailor a model from uploaded training data; current model availability must be checked against current fine-tuning documentation and organization limits.
- OpenAI Plugins in ChatGPT and Codex: plugins package reusable instructions, connected tools, apps, app templates, and workflow capabilities; plugin installation does not bypass app authorization or workspace permissions.
- OpenAI Skills in ChatGPT: skills are reusable workflows made of instructions, examples, supporting resources, and code that can be automatically used when helpful.
- MCP specification and 2026-07-28 release notes: MCP standardizes how LLM applications connect to tools, resources, and prompts; the 2026-07-28 release shifts remote MCP toward a stateless protocol core and stronger authorization/routing semantics.
- Local project evidence: `benchmarks/run.ts`, `tests/core.test.ts`, `docs/benchmarks.md`, and the PR sequence for local install, code editing benchmark, latency percentiles, and semantic degradation fixtures.

## Proposed Model

| Layer | Primary Function | Changes Weights | Owns External Access | Verification Focus |
| --- | --- | --- | --- | --- |
| Fine-tuning | Model behavior adaptation from examples or preferences | Yes | No | eval sets, overfit checks, task accuracy, regression safety |
| Skill | Repeatable procedural guidance and reusable local assets | No | Usually no, unless scripts run locally | instruction compliance, task repeatability, review gates |
| MCP server | Tool/resource/prompt interface between host and external/local capabilities | No | Shared with host and operating system | schema contract, authorization, exactness, side effects, failure handling |
| Plugin | Packaging and distribution boundary for skills, apps, templates, and MCP-backed capability | No | Through included apps/MCP servers | install policy, permissions, manifest integrity, capability discovery |
| Token-context optimizer | Case-study control layer for bounded retrieval and summarization | No | Local filesystem only | exact gates, semantic gates, latency p95, cleanup, plugin validation |

## Paper Structure

1. Abstract
   - State the layered adaptation thesis.
   - Summarize the case-study benchmark: exact retrieval, semantic degradation fixtures, code editing task gate, and latency percentile gate.

2. Introduction
   - Define the operational problem: LLM workflows often mix model behavior, context access, tool execution, and procedural policy.
   - Argue that conflating fine-tuning with plugins/MCP/skills produces weak evaluation and unclear safety boundaries.

3. Background
   - Fine-tuning: supervised, preference, and reinforcement-style optimization as model-internal adaptation.
   - Skills: reusable workflow instructions and assets.
   - Plugins: packaging, discovery, enablement, and workspace governance for skills/apps/templates.
   - MCP: standardized tool/resource/prompt protocol for external context and actions.

4. Layered Adaptation Framework
   - Present a responsibility matrix for weights, prompts, tools, context, permissions, and verification.
   - Define decision rules:
     - Use fine-tuning when the desired behavior should generalize inside the model without runtime external data.
     - Use skills when the behavior is procedural and reviewable as instructions or scripts.
     - Use MCP when the model needs governed live context, local files, or actions.
     - Use plugins when the capability must be packaged, distributed, discovered, installed, and governed.

5. Case Study: Token Context Optimizer
   - Describe the MCP/plugin architecture.
   - Explain exact-content policy: source-backed excerpts are required for code, paths, identifiers, secrets, commands, and numeric/table content.
   - Explain semantic summary policy and the new semantic degradation fixtures.
   - Explain local install verification, manifest checks, marketplace entry handling, and plugin validation.

6. Evaluation Design
   - Benchmark scenarios:
     - 25K-style build log exact retrieval.
     - Repeated semantic document fixture suite.
     - Code editing fixture with exact retrieval and task gate.
   - Metrics:
     - Raw tokens, optimized tokens, reduction percent.
     - `passedExactGate`, `taskGateRequired`, `passedTaskGate`.
     - `latencyMs`, `medianLatencyMs`, `p95LatencyMs`.
     - Warnings and fallback reasons.
   - Claims discipline:
     - Estimated token reduction is not actual billing savings.
     - Local latency is not hosted/API latency.
     - Semantic fixture pass is not broad summarization quality.

7. Threats To Validity
   - Heuristic token estimation differs from provider billing.
   - Local benchmark latency excludes hosted network/model latency.
   - Semantic fixtures are intentionally small and must expand before broad quality claims.
   - Fine-tuning is discussed as a comparative layer; this repository does not run a real fine-tuning job.

8. Future Work
   - Build a larger semantic degradation corpus with numeric, negation, causal, temporal, actor/action, and multilingual fixtures.
   - Add API-backed telemetry only after privacy, billing, and consent constraints are explicit.
   - Compare prompt-only, skill-guided, MCP-backed, plugin-packaged, and fine-tuned variants on the same task suite.
   - Add human review rubrics for semantic adequacy and tool-use safety.

## Concrete Preparation Steps

1. Freeze the case-study branch by merging the semantic degradation PR only after review and CI pass.
2. Export benchmark JSON from `npm.cmd run benchmark` and save it under a dated evidence directory.
3. Create a citation table with source URL, access date, claim, and paper section.
4. Extract local code evidence:
   - `benchmarks/run.ts`: scenario definitions and gates.
   - `src/core/policy.ts`: exact versus semantic classification.
   - `src/core/artifacts.ts`: source-backed retrieval and extractive summary behavior.
   - `scripts/validate-plugin.mjs`: plugin/package validation boundary.
5. Draft figures:
   - Layered adaptation stack diagram.
   - Plugin/MCP/skill/fine-tuning responsibility matrix.
   - Benchmark gate flow from artifact indexing to pass/fail report.
6. Draft the first paper version in `docs/research/llm-layered-adaptation-paper-draft.md`.

## Initial Bibliography Targets

- OpenAI. Fine-tuning API reference. https://developers.openai.com/api/reference/resources/fine_tuning
- OpenAI Help Center. Plugins in ChatGPT and Codex. https://help.openai.com/en/articles/20001256
- OpenAI Help Center. Skills in ChatGPT. https://help.openai.com/en/articles/20001066
- Model Context Protocol. Specification. https://modelcontextprotocol.io/specification
- Model Context Protocol Blog. The 2026-07-28 Specification. https://blog.modelcontextprotocol.io/posts/2026-07-28/
