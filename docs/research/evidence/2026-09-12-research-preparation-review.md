# Research Preparation Delivery Evidence (2026-09-12)

## Objective, Scope And Acceptance

Task 16 resumes the pending paired-success specification and includes the user's
new request to review four local PDFs and assess a fresh-subagent versus persistent
inline-context hypothesis. This is one documentation delivery on
`docs/research-paired-success-design`, based on `c1c9b3e` / PR #15
(`docs/research-post-merge-review`). The user explicitly requested commit/push.
No merge, analyzer implementation, experiment execution or protocol-arm change is
included. The original two dirty documentation files were preserved in place on
their existing Task branch. No stash, reset or force operation was used.

Acceptance: four version-bound paper reviews, source hashes and bibliography,
page/table-grounded quantities, explicit evidence/inference/proposal distinctions,
cross-domain limits, a falsifiable hypothesis assessment, valid documentation links,
fresh project verification, a pushed Draft PR and final Astra review. Runtime,
dependency manifests and the current experiment protocol must remain unchanged.
RED is not applicable to prose; source, arithmetic, link and scope checks are its
acceptance checks. Existing passing tests are compatibility evidence, not a new
TDD cycle or a measured scientific result.

## Sources And Reading

The [dossier](../literature/2026-09-12/README.md) reviews 52 PDF pages:
PruneVid 15, LGTTP 8, Better Harnesses 12, Agent Harness Distillation v4 17.
The [inventory](../literature/2026-09-12/sources.json) pins original filenames,
versions and SHA-256 values. Original PDFs were read in place; full PDFs, extracted
texts and page renders are not part of the Git delivery. The image-only PruneVid
required page rendering; the other three used full extracted text plus relevant
visual table checks. References cited inside those papers were not individually
audited. Supplementary hypothesis sources received focused checks, not an
exhaustive new literature review.

## Roles And External Provider Check

Planning/source review: native GPT-6 Astra. First-pass paper notes and integration:
native `worker` calls explicitly selecting `gpt-5.6-luna`, with disjoint file
ownership. Successful responses establish execution for those calls, not perpetual
quota availability or statistically independent model errors.

**Cross-check status: DEGRADED. No external review occurred.**

| Priority | Evidence observed | Outcome |
| --- | --- | --- |
| Claude Code / Opus 5 | CLI 2.1.267 executed; authentication present; explicit `claude-opus-5` probe. | Weekly quota exhausted; reported reset September 14, 08:00 Asia/Seoul. |
| Gemini free tier | CLI 0.57.0 executed; examined availability did not establish authenticated free API access/quota. | No inference call or paid fallback. |
| GitHub Copilot | No standalone executable, CLI cache or installed extension found. GitHub login worked but proves no Copilot entitlement. | No callable Copilot review surface established. |

The Claude availability probe requested only `PROVIDER_PROBE_OK`, without tools,
using `--safe-mode --model claude-opus-5 --effort low --no-session-persistence
--output-format json -p`. The initial sandbox attempt stalled and was interrupted;
one escalated retry returned exit 1 and a weekly-limit error. This was an access
probe, not a literature or code review. No credentials are recorded here.

Supplementary separate native Astra review checked the paired-success written
contract against actual scoring/dataset code and the protocol. It found no
blocker/major issue and requested an editorial expansion of the delivery wording.
This is not a substitute labeled as one of the external providers.

## Review Findings And Corrections

Source review identified material draft errors requiring correction before delivery:

- PruneVid: source path, ST-LLM frame count and EgoSchema score, distinction between
  spatial-only and combined ablations, score units and known MVBench sample counts.
- LGTTP: comparator/percentage-point ambiguity, 72B score loss versus prose,
  and equation interpretation limits rather than an unverified implementation bug.
- Better Harnesses: Gemma cost ratio, frontier versus within-Gemma latency
  comparators, absolute versus relative accuracy and failure-taxonomy label order.
- AHD: extractor versus target model counts, harness-origin versus receiver-model
  columns and similarity versus task-accuracy endpoints.
- Hypothesis: crossing-zero confidence intervals are inconclusive, not rejection;
  define assertion denominators, undefined cases and unfinished/missing runs;
  distinguish unsupported from false claims and correct supplementary bibliography.

These are document-review findings, not measured agent hallucination rates. There
is no randomized comparison here, and this Task's review anecdotes cannot test the
user's scientific hypothesis. Separate native Astra rereview found the major issues
resolved and returned Draft-PR readiness `PASS WITH NOTES`. Its remaining minor
wording corrections (MVBench counts, 95.9% versus headline 90% cost reduction, and
claim-label consistency) were then applied and checked. There are no known open
blocker/major findings at this checkpoint.

The local documentation acceptance check passed for nine Markdown files, 34 local
file links, four unchanged original PDFs / 52 pages and seven bibliography entries.
This check verifies source identity and references, not empirical paper replication.

## Pre-PR Verification

Observed on 2026-09-12:

| Command | Result |
| --- | --- |
| `npm.cmd test -- --run tests/research-scoring.test.ts tests/research-pilot.test.ts` | PASS: 62 tests, 12:28 KST. |
| `npm.cmd test` | PASS: 570 tests in 11 files, 12:29 KST. |
| `npm.cmd run build` | Initial sandbox failure: esbuild ancestor-directory access denied. Identical authorized escalated command PASS; no source fix. |
| `npm.cmd run typecheck` | PASS. |
| `npm.cmd run smoke:mcp` | PASS: `mcp smoke ok`. |
| `npm.cmd run validate:plugin` | PASS: `plugin manifest ok`. |
| `npm.cmd run benchmark` | PASS: three existing scenarios, 20 samples each; local engineering evidence only. |

No empirical architecture comparison, compact stress test, paper reproduction,
human outcome grading, model training or paid research run was performed. Final
verification after the Draft PR opens is a separate required checkpoint.

## Post-Draft Verification And Delivery

[Draft PR #16](https://github.com/kimcheolhui9846/token-context-optimizer/pull/16)
opened after content commit `daa7933ad9f0703bbc816d50ee228554d1e53644`
was pushed with upstream tracking. Base remains `docs/research-post-merge-review`.
On 2026-09-12 at 22:10-22:11 KST, after the PR opened:

- Targeted scorer/pilot command above: PASS, 62 tests.
- `npm.cmd test`: PASS, 570 tests in 11 files.
- `npm.cmd run build`: PASS with authorized escalation for the known sandbox limit.
- `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, and
  `npm.cmd run validate:plugin`: PASS.
- `npm.cmd run benchmark`: PASS, three scenarios with 20 samples each;
  p95 exact 1.58 ms, semantic 1.51 ms, code 1.14 ms. These are local fixture timings.
- `node .artifacts/paper-review/validate-docs.mjs`: PASS, nine Markdown files,
  34 local links, four unchanged PDFs / 52 pages, seven bibliography entries.
  This validation helper is local and ignored, not a shipped project command.
- `git diff --check`: PASS.

Subsequent changes record this evidence and handoff only; runtime and reviewed
research content are unchanged. Final current-head Git/PR checks and Astra verdict
are reported in the delivery response. External cross-check remains DEGRADED.
No merge was performed; the next Task requires user approval.
