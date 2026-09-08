# Development Seed And Pilot Coverage

Status: synthetic development data, not a completed pilot or experimental evidence.
The [seed](datasets/development-seed.json) contains 24 records from 12 source/task
families. Every family has English and Korean records; every record is development-only.
There are two families in each category: numeric, negation, actor_action, causal,
temporal and exact. Translations are correlated variants, not independent samples.

## Provenance And Limits

Codex authored these short synthetic scenarios on 2026-09-08 and marked their source
text CC0-1.0. They do not contain collected private or third-party source documents.
Source digests cover the exact UTF-8 text, including whitespace and line endings.
The two exact families share the same code/log source across languages; their questions
and rubric prose are localized. All semantic paraphrase lists are initially empty;
the rubric permits faithful paraphrases rather than requiring substring matching.

This seed exercises the tooling and helps refine rubrics. Agent content review is not
human-validated ground truth, blinded outcome scoring, or evidence of independence
between scenarios. The short sources are not a representative long-context benchmark.
Do not move these exposed examples into a held-out test split. Authors must inspect
provenance, semantic family overlap, source-supported answers, leakage and translation
quality before collecting a separate frozen pilot.

The references `seed-cache-location-v1` and `seed-clamp-guard-v1` resolve to the
[public development excerpt checker](exact-checks.md), including pinned source-line
fidelity checks. These are not secret held-out tests or candidate-code execution.
Do not treat a reference string as a passing check, or an exact comparison alone as
a complete judgment: independent grading fields and evidence remain required.

## Structural Audit

```powershell
npm.cmd run build
npm.cmd run validate:dataset -- docs/research/datasets/development-seed.json
npm.cmd run audit:pilot -- docs/research/datasets/development-seed.json
```

Use `node scripts/audit-pilot.mjs <dataset>` for JSON-only stdout. Build first.
Exit 0 means valid input and a computed report, even when `meetsPilotStructure` is
false. Exit 1 returns `valid: false` with `usage` or `invalid_input`, without echoing
paths or input values. The CLI never modifies the dataset. It uses the shared parser's
duplicate-key rejection and character/depth limits; files are read into memory before
parsing, so these are not pre-read byte limits.

`auditPilotDataset` validates a detached dataset snapshot, requires each family to have
one category and one split, and counts family language memberships. English and Korean
counts can overlap. The report includes the [scoring fingerprint](scoring.md), counts,
quota gaps and empty language strata. It does not execute rubrics or assess meaning,
independence, quality, representative sampling, hidden checks or research readiness.

The [protocol](2026-09-07-layered-adaptation-evaluation-protocol.md) proposes 120
families with 20 per category and 60/20/20 family splits. This audit operationalizes
balanced category/split targets and a minimum of one family membership per language
in every category/split cell; it does not require exact 50/50 language balance.

| Family count | Target | Seed |
| --- | ---: | ---: |
| Total | 120 | 12 |
| Train | 72 | 0 |
| Development | 24 | 12 |
| Test | 24 | 0 |
| Each category | 20 | 2 |
| Each category: train/development/test | 12/4/4 | 0/2/0 |

If the seed is retained as development data after curation, 108 additional families
are numerically needed: 72 train, 12 development and 24 test. This arithmetic does
not establish that existing or future families are independent. Allocate new families
before generating translations or paraphrases, review overlap, and freeze hashes and
rubrics before evaluation. A structurally complete synthetic test fixture is only a
test of the auditor, not the research dataset.

## Proposed Next Experiment

The proposed initial model-facing contrast is full source versus optimizer-selected
context, holding model, question and task budget fixed. This estimates the end-to-end
intervention; matched-token fixed-chunk and gold-evidence reference conditions remain
necessary to investigate selection separately from context length. Freeze the primary
contrast and controls before confirmatory work. Skill delivery, MCP transport, plugin
packaging and fine-tuning remain distinct contrasts under the protocol.

No hosted model, fine-tuning job, paid inference, or outcome-scoring run was performed
for this seed. Next steps are human curation, a frozen pilot manifest, separately
designed held-out checks, approved model access/budget and blinded outcome rating.
