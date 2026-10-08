# Image Input Token and Cost Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans after the approval checkpoint. Astra owns planning and final review; Luna owns the research document and source-register link; root owns task-specific evidence, verification and Git.

**Goal:** Resolve the source-evidence gap behind F-06 and support RQ1 (client-transform input tokens relative to provider automatic processing), without claiming measurements or implementing image transforms.

**Architecture:** A dated Korean research note compares selected official image-understanding API contracts across OpenAI, Anthropic and Google. Model-specific rules and arithmetic are separate from empirical usage and billing. The source register links the note without rewriting historical literature records.

**Tech Stack:** Markdown, official provider documentation, local arithmetic and link checks, existing npm verification scripts.

## Scope and constraints

- WBS 4.1 is Task 27; Task 26 was used for benchmark integrity and is merged at `aa0040f`.
- F-12 paper direction remains a separate user decision. This neutral source investigation proceeds independently; no paper-direction change or broad draft revision.
- Compare image inputs to understanding models, not image-generation output pricing. Use a bounded sample of named model/settings combinations rather than implying an exhaustive catalog.
- Capture access date, exact source URL, model identifier, mode/tier, dimensions, units, resizing/caps/rounding, applicable limits and unknowns.
- No actual API calls (including count-tokens), inference, upload, dataset change, model-quality conclusion, runtime edit or dependency change. Preserve WBS and all shared HANDOFF files, including root `HANDOFF.md` and `docs/agent/HANDOFF.md`.
- State that `1536px/q75` is a candidate encoding policy, not proof of token/billing/quality/latency savings. Separate encoded bytes, pixel dimensions, estimated tokens, API usage, invoices and timing.
- Do not present missing source details as zero cost or invent algorithms. Clearly mark source contradictions and scope limits. Avoid long quotations; compact paraphrases only.

## Files and ownership

- Luna: create `docs/research/image-token-cost-models.md`; add a narrow link/dated provider-source section to `docs/research/image-first-sources.md`.
- Astra/root: this plan; root owns `docs/agent/handoffs/task-27.md` and ignored verification/review artifacts after approval. Shared HANDOFF files remain untouched under the user's Task-specific restriction.
- Optional, document implementer: only one dependency-free `docs/research/evidence/task-27/recompute-examples.mjs`, reproducing the note's bounded arithmetic examples. No dataset traversal or reusable estimator; whole-dataset estimation belongs to WBS 5.1.
- Existing paper draft/protocol remain unchanged. Their later revision belongs to WBS 4.2.

## Acceptance

1. Every provider rule/price is tied to a directly opened official source and named applicable model/settings, with a 2026-10-06 access date (or actual later date).
2. Compare representative patch/tile/area/resolution accounting where officially documented. Include input/request constraints and explain context limits separately.
3. Prices use standard uncached paid input/output USD per million tokens, with tier/context assumptions and exclusions. Image input estimates exclude prompt text/output/tools/cache effects.
4. At least one reproducible arithmetic example per provider where a formula is officially documented; report an evidence gap if unavailable rather than claim acceptance passed. Apply the detailed comparison contracts below, including all settings, both client/provider size boundaries and the documented fixed-token exception. Include at least one sourced counterexample to universal savings from a 1536px resize or q75 re-encoding. Independent recalculation of the in-document input/formula/intermediate/result tables must match every documented number.
5. Distinguish official formula estimates from unperformed count-token/usage/billing measurements. No hosted call is performed or claimed.
6. F-06 evidence gap is addressed only to this research scope; no implementation or empirical savings result is declared. F-12 remains open unless the user answers.
7. Existing runtime/test/dependency/bundle/shared-handoff/WBS content is unchanged. All local links and scoped Markdown formatting checks pass.

## Execution

- **Latest authorization (2026-10-09):** the user approved PR #27 Nit corrections, Ready conversion, merge and proceeding to the next Task. The 2026-10-08 Draft-only stop below is historical. Correct the Haiku summary to the existing 0–1.79% examples and record the completed Astra review plus the supplied Claude `claude-opus-5-5` re-review. Run scoped checks and a fresh full gate, obtain Astra review, then integrate. Provider API/count-tokens/upload restrictions remain.

- [x] **Historical delivery authorization (2026-10-08):** user-supplied Claude document re-review recommends approval, with no Blocker/Major. Add the approved five-bullet summary using existing table figures only, move compression guidance into the JPEG section, normalize two Sonnet regime labels and refresh the task-specific handoff. The user authorizes staging/commit/push of exactly four documents, a Draft PR against main, post-PR verification and native Astra final review. This supersedes the earlier pre-Git stop and FactChat integration proposal. No Ready conversion, merge, next Task, model API/count-tokens call or image upload.
- [x] Open official model, image-accounting and pricing sources; resolve the three candidate IDs and full settings table below before writing the note. Record actual access dates. Research can proceed before F-12 decision, but does not decide it.
- [x] Complete initial-plan Claude/Gemini/Copilot eligibility checkpoint with actual results; record unavailable reviews accurately. Astra adjudicates material findings.
- [x] Confirm Luna can execute; give concrete evidence and GO after the checkpoint.
- [x] Write Korean note: scope/date, metric definitions, provider table, worked examples, preset implications, limitations/measurement checklist, official sources.
- [x] Independently verify arithmetic, source scope and links; revise only within this documentation scope.
- [x] Complete milestone provider checkpoint and direct Astra candidate review. User-supplied Claude re-review and native Astra approved the Approach A correction; the summary/delivery revision receives its own checks.
- [x] Run targeted documentation checks, then `npm.cmd test`, `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`, `git diff --check`, and `git status --short`, in that order. Confirm only the four scoped Markdown files changed; if the optional arithmetic script is necessary, explicitly count it as the sole fifth scoped file. Record any other change and investigate without deleting user work.
- [x] **Historical pre-Git stop satisfied:** uncommitted documents were reported; the user supplied Claude's 2026-10-08 re-review and explicit integration authorization.
- [x] **Approved integration:** preserve the Task branch, inspect the scoped diff and commit only four approved documents. Immediately before push run `git rev-parse --abbrev-ref '@{u}'` (PowerShell quotes preserve the literal argument); initial upstream is `origin/main`. Push exactly with `git push -u origin codex/task-27-image-token-cost`. Repeat the upstream check and verify `origin/codex/task-27-image-token-cost`, then create Draft PR against `main`. Include 10-06 plan, 10-07 document and 10-08 re-review dispositions, actual gates and unmeasured outcomes.
- [x] **Approved final review:** after Draft creation, rerun targeted checks and the same full gate including status inspection; verify latest PR/head/authorship/worktree. Native Astra directly reviews final evidence; record its verdict in the task handoff and deliver the existing Draft PR. Stop without Ready conversion, merge or next Task.

## Test strategy and delivery gate

Previous 2026-10-07 checkpoint: the research note, source-register addition and task handoff were written. Scoped arithmetic/document checks and the full ordered project gate passed (790 tests passed, one existing Windows FIFO skip). Native Astra's precommit verdict was PASS WITH NOTES. The subsequent user-provided Claude document review identified a representativeness Major; the user has now approved Approach A below. Prior verification/review results remain historical evidence, not acceptance of the forthcoming expanded comparison. No staging, commit, push or PR was performed. Detailed commands, retry history, source gaps and review outcomes are recorded in `docs/agent/handoffs/task-27.md`.

RED is not applicable to source research/documentation. Verifiable acceptance checks above are defined before document implementation. Arithmetic checks validate units and formulas; existing code tests provide regression evidence only, not image-study results. Record failures and unavailable checks without rewriting them as passes. Preserve branches/worktrees and do not merge Task 27 or begin the following Task without explicit approval.

## Historical review disposition and pre-Git stop

Input: user-provided `C:\Users\00\Desktop\codex_review_feedback_2026-10-06_task27-plan.md`, attributed to Claude Code, dated 2026-10-06. Exact reviewer model was not verified. Its remembered provider rules are verification leads, not sources; no new external review is claimed at this checkpoint.

| Finding | Decision | Reason and resolution |
| --- | --- | --- |
| Major 1: savings baseline | Accept | Apply the same provider processing contract to original and transformed images before subtraction. Cover all three original-size regimes and distinguish JPEG-quality effects. Raw-pixel comparison can overstate savings. |
| Major 2: sample criteria | Accept | Select one documented image-pilot candidate per provider, dated snapshot preferred; enumerate all supported resolution values as separate rows. Text-experiment selections cannot substitute for image-pilot selection. Final models remain the user's decision. |
| Minor: arithmetic/WBS boundary | Accept | In-document tables are primary reproduction evidence. If needed, only one dependency-free example `.mjs` is allowed; dataset-wide estimation stays in WBS 5.1. |
| Minor: upstream | Accept | Existing `origin/main` tracking requires an explicit branch push and pre/post upstream verification, fixed above. |
| Suggestion: count-tokens | Accept as deferred checklist only | Record “사용자 승인 시 다음 단계”; no API call or upload here. Verify availability, cost and approval before any later use. |
| Nit: Markdown/link commands | Accept | Use the fixed content and local-link checks below, with manual anchor/table inspection and directly opened official sources. |

No finding is rebutted. Acceptance of the method does not confirm remembered formulas. The initial plan-only stop was satisfied by the user's subsequent approval and supplied 2026-10-07 re-review. At that historical checkpoint, permission covered writing and verification, followed by a stop for user-arranged Claude review before Git mutations. Publication intent motivates the comparison structure only; paper draft, evaluation protocol, F-12 and WBS 4.2 remain excluded.

### 2026-10-07 re-review disposition

Input: `C:\Users\00\Desktop\codex_review_feedback_2026-10-07_task27-plan-rereview.md`, attributed to Claude Code. Exact reviewer model remains unverified. The supplied review reports no blocker/major findings and says another plan re-review is unnecessary. Its reported checks are reviewer evidence, not checks performed by this agent.

| Finding | Decision | Reason and resolution |
| --- | --- | --- |
| Minor 1: two size boundaries | Accept | Explicitly separate the 1536px no-upscale threshold and provider cap; record actual dimensions and both boundary relations. Use disjoint regimes when the provider cap is below the client threshold. |
| Minor 2: fixed tokens | Accept | A documented size-independent setting receives one `크기 무관` row with B = C and Δ = 0, rather than an invented cap or unknown estimate. |
| Nit: overlapping JPEG labels | Accept; supersedes prior labels | Token-effect labels become only `토큰 영향 없음(공식에 quality 없음)` and `미문서화`; bytes remain in their separate unmeasured column. |
| Nit: post-gate scope verification | Accept | Append `git status --short` after every full gate and account for exactly the four scoped documents, plus the optional fifth script only if needed. |
| Suggestion: inaccessible official source | Accept | Record an evidence gap when an official source cannot be opened; never substitute a blog or mirror as supporting evidence. |

## Required comparison contracts

### Candidate selection before note writing

Retain exactly one image-pilot candidate each for OpenAI, Anthropic and Google, plus the two accounting-family contrasts authorized in Approach A below. Preserve the existing GPT-4o, Haiku 4.5 and Gemini 3.8 Flash candidates and their relevant examples. Candidate selection rationale must explain accounting family, resolution tier and reproducibility, not merely a dated identifier. Prefer fixed snapshots; a date suffix is useful evidence, not a universal requirement. Verify the official Anthropic statement that 4.6-and-later undated IDs are fixed snapshots before applying it to the added model. For an ID whose immutability is not documented, retain the explicit reproducibility limitation. Contrast rows are not additional selected pilot models; final pilot selection remains the user's decision.

Enumerate every documented resolution/detail value supported by the selected candidate, one per row. Include `low/high/auto` only where actually supported and every supported Google media-resolution value. Distinguish omitted/default behavior from explicit values. For no exposed control, include a sourced “no exposed resolution setting” row. Do not assume `auto` equals `high`: equivalence requires an explicit official contract for the selected model; retain unknowns or documented bounds for opaque routing. Record candidate and setting rationale. Final pilot model/settings choice remains the user's decision.

| Provider | Candidate exact ID / snapshot status | API surface | Resolution setting (one value per row) | Default/omission behavior | Pilot selection rationale | Official source / actual access date | User decision status |
| --- | --- | --- | --- | --- | --- | --- | --- |

### Baseline and arithmetic

Let `P(provider, model, setting, image)` be documented provider resizing/processing and `T` its image-token accounting. Define baseline `B = T(P(original))`, transformed estimate `C = T(P(client_transform(original)))`, and savings `Δ = B − C`. Percentage is `100 × Δ / B` only when `B` is known and positive. Preserve zero/negative savings. Both paths use the same model, settings and processing rules; never compare raw original pixels to processed transformed tokens.

For each size-dependent candidate/setting, use two explicit boundaries: client long-edge target 1536px and the documented provider cap. When a long-edge provider cap is at least 1536px, use disjoint regimes (1) original long edge ≤ 1536px, (2) 1536px < original long edge ≤ provider cap, and (3) original long edge > provider cap. Regime 1 is a resize no-op: under the same documented dimension-based token contract B = C and Δ = 0; quality-only uncertainty is reported separately, never converted into an empirical claim. If the provider cap is below 1536px, keep regime 1 and annotate which inputs already exceed the provider cap; mark regime 2 empty; use long edge > 1536px for the remaining resized/above-provider-cap regime to avoid overlap. Show examples on each applicable side of the provider boundary within regime 1 when feasible.

For area, tile or patch budgets, retain the client no-op versus resize distinction and express the provider boundary in its actual documented units: no-op inputs (annotated as within/above provider budget), resized inputs within budget, and resized inputs above budget. State actual width/height, aspect ratio, client long-edge relation, provider-unit calculation and boundary relation for every example. Include exact boundary values where valid; do not use an undefined “near” category. Show no-upscale assumptions, transform dimensions, every provider resize step, accounting unit, multiplier and rounding.

If official documentation makes token accounting independent of image size for the selected setting, put `크기 무관` in the regime column and complete one row with the documented fixed value B = C and Δ = 0, subject to the documented valid-input constraints. This is a calculable counterexample, distinct from missing documentation. Only when the necessary cap/formula is undocumented should rows be not calculable with an explicit evidence gap; do not invent a boundary or formula.

| Provider / model / setting | Original-size regime and dimensions | Applicable cap / source | Client transform / resulting dimensions | Provider-processed original dimensions or units | B formula / result | Provider-processed transform dimensions or units | C formula / result | Δ / percent | Evidence status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Recalculate every example independently from these tables. If executable reproduction is necessary, use only the optional bounded `.mjs`, run `node docs/research/evidence/task-27/recompute-examples.mjs`, and report actual results. Do not run that command if no script was created. Whole-dataset calculation and distribution weighting are WBS 5.1, outside this Task.

### JPEG quality and measurement boundaries

For each provider/candidate, classify only the token effect of JPEG quality as exactly `토큰 영향 없음(공식에 quality 없음)` or `미문서화`, with a source and qualification. Hold dimensions and settings constant. The former means the applicable documented token formula excludes quality; the latter means official evidence is insufficient to determine token effects. Describe encoded-byte implications only in the separate unmeasured column. Do not claim actual byte reduction, faster upload or equivalent automatic routing without measurements. Separate resizing from quality-only re-encoding.

| Provider / model / setting | JPEG-quality classification | Official token-accounting basis / uncertainty | Encoded-byte implication (unmeasured) |
| --- | --- | --- | --- |

The note supports the source-evidence portion of RQ1 only. Its measurement checklist separates formula estimates from unperformed count-token, API usage, accuracy, billing and latency measurements. Label any later API-based verification “사용자 승인 시 다음 단계”; no presumed free API eligibility or cost.

## Approved Approach A: accounting-family contrast amendment

Input: user-provided `C:\Users\00\Desktop\codex_review_feedback_2026-10-07_task27-doc.md`, attributed to Claude Code. Its exact model remains unverified. Its reported source checks and arithmetic are review evidence to independently verify, not newly performed checks by this agent. The user has approved Approach A: preserve the three pilot candidates and add bounded current-family contrasts within Task 27.

| Finding | Decision | Reason and amendment |
| --- | --- | --- |
| Major: accounting-family representativeness | Accept, user-selected Approach A | Haiku standard-tier and GPT-4o tile examples cannot represent all current Anthropic/OpenAI contracts. Add one current Anthropic high-resolution model and one current OpenAI patch model, with explicit contrast-only status. Qualify every conclusion by model, setting, tier/family and example dimensions. |
| Minor: Gemini repeated/overlapping regimes | Accept with nominal-budget qualification | Replace the 18 repeated rows with six setting/default rows labeled `크기 무관(근사 예산)`. This describes the published nominal budget table only, not actual token invariance. Keep actual B/C/Δ and provider size boundary unknown. |
| Suggestion: JPEG compression evidence | Accept | Directly open the official Anthropic Vision compression guidance and paraphrase supported request-byte/latency implications and excessive-compression text-reading risks. This supplies source guidance, not a measured q75 result. |

Astra adjudication of the Gemini format: six rows are acceptable. The earlier Major concerned omission of settings from the B/C comparison, not a requirement to repeat identical unknowns for arbitrary sizes. One explicit row per setting/default preserves that coverage while avoiding a false second/third provider-size regime. In each row use `B_budget = C_budget = published nominal value`, `Δ_budget = 0`, and separate actual-token fields marked `미확인`. The label's `크기 무관` applies only to the nominal table value. Keep the approximate/model-version-dependent caveat and the unresolved connection to the 258-token/crop guidance. Do not invoke the exact fixed-token exception or conclude real savings are zero. Record this agreement and its limits in the task-specific handoff; there is no unresolved disagreement requiring the 18-row format to be retained.

### Bounded additions and acceptance

- Preserve the original three candidates, their settings and existing OpenAI/Anthropic examples. Add comparison rows for one current Anthropic high-resolution model (investigate `claude-sonnet-5-5`) and one current OpenAI patch-accounting model chosen from directly opened official model/accounting documentation. Verify actual IDs and source applicability before using them; do not treat review-memory examples as confirmed rules.
- Add a clear role column or equivalent label: `pilot candidate` versus `accounting-family contrast`. Use the existing standard uncached input/output USD-per-million, context, API surface, source/access-date and snapshot-status format for both new models. Explain why tile versus patch and standard versus high-resolution tiers require separate conclusions. The added rows do not finalize pilot choices.
- For the Anthropic high-resolution contrast, verify the documented 2576px padded-edge and 4784 visual-token limits, alongside the client 1536px boundary. Apply the official `resized_size` contract exactly: padded-edge checks, ceil patch counting, aspect preservation, no enlargement and Python half-even rounding. Show intermediate resized and padded dimensions or clearly distinguish unpadded content dimensions from padded accounting units.
- Cover client no-op, client resize within provider limits and provider-limit-exceeding examples; include both 16:9 and 4:3 aspect ratios. Include 1920×1080 and 3840×2160 for paired comparison with the standard tier, plus explicit 4:3 inputs. Add the same 16:9 examples to Haiku and independently verify whether Δ=0 rather than assume it from the review. For compound edge/token caps, identify the limiting condition in every example. Retain all supported resizing/error-setting behavior or document equivalent rows explicitly.
- For the OpenAI contrast, enumerate every actually supported detail setting and omitted/default behavior. Record official patch size, budget, multiplier, resize/rounding rules and any setting-specific caps; do not copy GPT-4o tile constants or rules from another patch family. Apply the same client/provider comparison contract with below/within/above-boundary examples or the exact fixed-token exception when documented. If a required rule is unavailable, retain an evidence gap rather than fabricate a result.
- Add family/tier-qualified synthesis showing both savings and no-savings cases; never infer a supplier-wide conclusion or a dataset-wide savings rate from these examples. Account for the two snapshots' availability limitations and the additional models' documented snapshot semantics.
- Apply the six-row Gemini nominal-budget contract above. Retain setting-specific price calculations and the exact-accounting evidence gap. Update the source register only for the narrow added official-source references.
- Add JPEG compression source guidance to the byte/quality discussion while preserving the two token-effect labels and explicit absence of byte, latency, accuracy or billing measurement.

### Historical execution and pre-Git stop for this amendment

- [x] Read the supplied document review and amend this plan before editing the research note.
- [x] Directly verify official sources for both contrast models, snapshot semantics, accounting rules, current prices/context and JPEG guidance; record exact URLs/access dates and evidence gaps.
- [x] Luna updates only the research note and narrow source-register section; root maintains the task-specific handoff. No shared HANDOFF/runtime/dependency/protocol/paper/WBS changes.
- [x] Independently recalculate every new or changed example, including both Anthropic tiers and OpenAI patch resize/rounding/multiplier calculations; cross-check the table values and costs. Preserve bounded tables/optional single `.mjs` rules, not a dataset estimator.
- [x] Run fixed scoped Markdown/link checks and source verification, then repeat the full ordered gate: test → build → typecheck → smoke:mcp → validate:plugin → benchmark → diff --check → status --short. Confirm the same four-document scope (plus the explicitly justified optional script only if needed). Record actual results, not the previous gate's PASS.
- [x] Obtain scoped native Astra review of the corrections and report the uncommitted changed parts for the user's Claude re-review. Stop before staging, commit, push or Draft PR; these remain unauthorized. No API/count-token/image upload or empirical experiment. The later FactChat PR phase and native Astra post-PR final review remain deferred.

## Fixed documentation checks

Run from the Task 27 worktree with Windows `tty:true`, `login:false`. The command below reads file content even when untracked. Check the amended plan first; for the approved document-delivery verification use the four-file `$paths` assignment below.

```powershell
$paths = @('docs/superpowers/plans/2026-10-06-image-token-cost-models.md')
$problems = @()
foreach ($path in $paths) {
  $body = [IO.File]::ReadAllText((Join-Path $PWD $path))
  if ($body -match '(?m)[ \t]+\r?$') { $problems += "Trailing whitespace: $path" }
  if (-not $body.EndsWith("`n")) { $problems += "Missing final newline: $path" }
  if ([regex]::Matches($body, '(?m)^```').Count % 2) { $problems += "Unpaired code fence: $path" }
  $prose = [regex]::Replace($body, '(?ms)^```[^\r\n]*\r?\n.*?^```[^\r\n]*(?:\r?\n|$)', '')
  foreach ($match in [regex]::Matches($prose, '\[[^\]\r\n]*\]\(([^)\r\n]+)\)')) {
    $target = $match.Groups[1].Value.Trim().Trim('<', '>')
    if ($target -match '^(https?://|mailto:|#)') { continue }
    $relative = [uri]::UnescapeDataString(($target -split '#', 2)[0])
    if (-not (Test-Path -LiteralPath (Join-Path (Split-Path $path) $relative))) {
      $problems += "Broken local link: $path -> $target"
    }
  }
}
if ($problems.Count) { $problems | Write-Output; throw 'Scoped documentation checks failed' }
Write-Output 'PASS: scoped whitespace, newline, fence and relative-link checks'
```

Document-delivery file assignment:

```powershell
$paths = @('docs/superpowers/plans/2026-10-06-image-token-cost-models.md', 'docs/research/image-token-cost-models.md', 'docs/research/image-first-sources.md', 'docs/agent/handoffs/task-27.md')
```

Also run `git diff --check`; it does not cover an untracked plan, so the direct content check is mandatory. These checks cover whitespace, final newline, paired fences and inline relative file links; they are not a full Markdown parser. Manually inspect tables, readability, fragment anchors and reference-style links. Directly open every cited external official URL with the browsing tool and record its resolved URL, actual access date and supporting section. Reachability alone does not prove support for a claim. Do not install checking dependencies or add checker files.

If an official source cannot be directly opened (including bot blocking), record its URL, attempted access and resulting evidence gap. Do not replace it with a secondary blog or mirror or claim that its contents were verified. Another directly opened official source may support a claim only if it actually contains the required model-specific evidence.

The 2026-10-08 delivery approval described below is historical; the latest 2026-10-09 authorization in Execution above governs integration. Earlier pre-Git stop statements in dated review history describe completed checkpoints, not the current permission boundary. Repeat scoped checks and the full ordered gate before and after Draft PR creation; preserve the four-document scope and stop after native Astra final review and delivery. That historical approval did not authorize Ready conversion, merge or the next Task; those actions are now covered by the 2026-10-09 authorization above.
