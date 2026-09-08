# Pilot Coverage And Development Seed

Extend the existing dataset validator with a family-level structural audit, using TDD.
The target follows the reviewed protocol: 120 families, 20 per category, split 72/24/24
across train/development/test. For each of six categories, require 12/4/4 families by
split and at least one English and one Korean family membership in each category/split.
A bilingual family contributes once to family totals and once to each language membership.
Language membership totals may overlap; they are not independent sample counts.

`auditPilotDataset(input)` first obtains a validated schema snapshot. A family assigned
multiple categories is rejected with `family_category_conflict`; split conflicts are
already rejected by dataset validation. Return counts, dataset fingerprint, quota-gap
diagnostics and `meetsPilotStructure`, never a research-readiness or independence claim.
Diagnostics identify trusted aggregate paths, actual/expected counts and codes only.

Keep `validateDataset` unchanged: a small valid dataset is still valid. The read-only
`audit:pilot` CLI takes one file, reuses duplicate-key JSON parsing, exits 0 for a valid
audit report even when structural goals are unmet, and exits 1 for invalid input/usage.

Author a development-only seed: 12 synthetic families, two per category, paired English
and Korean records (24 records). Keep translations in the same family and split. This
is rubric/harness development material, not 120 independent tasks, a held-out test set,
human-validated ground truth, or empirical model results. Exact-task hidden check IDs
are references only; executing them remains scoring-harness follow-up work.

The first proposed primary model comparison is full-source versus optimizer-selected
context, holding model/task budgets fixed. Matched-token and gold-evidence controls
remain required before isolating selection effects. No model/API calls are part of this task.

Deliver `src/research/pilot.ts`, `scripts/audit-pilot.mjs`, dedicated tests, a checked-in
seed JSON and a dataset card. Independent review checks code plus bilingual answer/rubric
consistency; development review is not a substitute for blinded human grading.
