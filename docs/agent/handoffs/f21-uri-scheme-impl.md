# F-21 URI scheme — phase 2 handoff

- Tier E: production policy and local performance evidence; no hosted calls.
- Base: main 6e308c9; branch codex/f21-uri-scheme-impl; isolated worktree.
- Authority: phase-2 brief2026-10-25; [plan](../../superpowers/plans/2026-10-24-f21-uri-scheme.md) sections3A–5, P-1/P-2.
- Status: CHANGES REQUIRED — functionality passes; all12 strict10MiB median comparisons regress.
- Scope: policy#0/#3, tests/oracle/overlay, measurement scripts/new evidence, bundle, plan corrections.
- Preserved: historical oracle/corpus120 fixtures/evidence, N-01 wrapper, all other predicates. No research/, paper/, codex_review/, package edits.

## Results
- URI requires non-JS-whitespace suffix; E-3 includes hyphens and added passcode/pass phrase/recovery codes/backup code(s). Secret reason/tuple order retained.
- Measured overlay4: f21-note-colon→semantic; seeded-20→unknown; benchmark-exact-code-edit/seeded-08 remain exact with secret removed. No newly exact among120.
- Review20: b-only8semantic/12unknown; combined20exact-secret. Separate4 equals-label examples become newly exact.
- [Audit](../../research/evidence/f21/audit-2026-10-25T12-29-04.086Z.json) embeds reproduction source and complete old/new results.
- Primary pre-edit Note assertion RED observed. Draft19-failure run also contained wrong expectations, which were corrected; setup errors not counted as RED.
- Baseline implementer record874passed/1skipped/21.12s; final pre-PR316targeted,961full passed/1skipped/21.12s; suite delta0.00s.
- Build/typecheck/MCP smoke/plugin validation/benchmark after build/diff-check PASS.
- [Pre-PR logs](../../research/evidence/f21/validation-2026-10-25T12-44-38.672Z.json).

## Performance
- [Authoritative JSON](../../research/evidence/f21/2026-10-25T12-22-04.768Z.json):72Task25+36E-3+15URI cells complete;5samples/target/cell,1/5/10MiB.
- No RangeError/timeout/boolean mismatch; maximum child17.00s<20s. E-3 addition and combined#0 both checked.
- Strict10MiB non-regression FAIL:12/12 medians increase0.63–22.18%; full table in JSON/PR. No threshold relaxation.
- Initial pre-edit timing was missed; immutable base6e308c9 reconstructed and measured before current within final uncontended run.
- Earlier08:12/08:16/08:19 worker attempts retained; overlapped workloads or budget exhaustion; not acceptance evidence, concurrency metadata unverified.
- Overall scheduling budget raised300→900s to finish; child20s and statistical criteria unchanged.

## Review / unresolved
- Claude supplied review, initial plan, APPROVE; P-1/P-2 adopted. Exact version not independently verified here.
- Native executor first pass; measurement agent usage-limit failure; primary Codex completed corrections under brief fallback. Routing DEGRADED.
- Primary inspected actual diff, oracle separation, frozen scope, audit and timing samples/hashes. Primary verdict CHANGES REQUIRED: unresolved measured performance regression.
- Independent Claude implementation review pending user's session after Draft delivery; no separate review claimed.
- Limitations: finite labels omit Wifi/Password hint/Security answer/Pin code/Passwort and Korean N-17.
- Errors corrected: expected ordered reasons, oracle separator, overlay content/provenance, artifact assertion fields, test id binding, measurement late URI/validation/size/timing handling.

## Delivery / next
- Commit/push/Draft PR and post-Draft gate pending at this recording.
- Main/merged planning worktree untouched. Root ignored HANDOFF.md links this current record.
- No Ready/merge or next Task. Review performance result before approving further work.
