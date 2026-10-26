# F-21 PR63 rework handoff

- Tier E; branch codex/f21-uri-scheme-impl, base6e308c9; no rebase.
- Status: measurement PASS, functional gates PASS; final review PASS WITH NOTES (evidence limitations below).
- Authority: user-approved R-1/R-2 (2026-10-25) and resume fixes (2026-10-26).
- PR62 read-only review APPROVE at2ddda25: README35-37 values/negative findings, protocol3-12 top-only change, research README12-42 links; no edits/comments.

## Implementation and preservation
- E3 scanner replaced with exact frozen-oracle regex, i only; separate original #0 iu union retained.
- URI#3, reasons/order, N-01 wrapper, historical oracle, original120 fixtures/corpus and overlay4 unchanged from0227aa7 (Git-normalized content checked).
- All prior9 evidence JSONs preserved byte-for-byte. No research/,paper/,codex_review/ edits.
- Added source/flags identity assertion and four isolated10MiB dense cases; E3 and combined#0 false checked.
- Resume fixes: NodeJS.ErrnoException cast and single-value it.each rows; record Task25 child dispatch/input/classifier/output corrected.
- Generated bundle rebuilt. No dependency/public API changes.

## Validation / failure history
- Fresh pre-rework baseline961passed/1skipped,21.54s.
- Earlier rework full run failed6 suites at tsc (866passed/102skipped); stopped without commit. Claude identified TS2339/TS2769 in new tests.
- Resume: typecheck first PASS; targeted88passed; full967passed/1skipped,35files,21.97s (+0.43s,within+30s).
- build,smoke:mcp,validate:plugin,benchmark after build,diff-check PASS.
- Child preflight: gate/all, record Task25 baseline/current, E3/current, URI/current, regex/current; all six1KiB/1sample calls exit0. Diagnostic only, not performance evidence.
- [Validation and previous failure logs](../../research/evidence/f21/validation-rework-2026-10-26T01-15-31.639Z.json).

## Measurements
- R-2 is a post-hoc gate change approved after the original strict FAIL; this is 회귀 제거.
- [Gate attempt1](../../research/evidence/f21/f21-rework-gate-2026-10-26T01-00-46.380Z.json): PASS,12/12 A/A within0.97-1.03,C/B-copy1.03,all outputs equal. No retry needed.
- Separate B/B-copy/C compilation,1warmup+9alternating rounds;180s child/1800s total; no concurrent tests/build.
- [Record](../../research/evidence/f21/f21-rework-record-2026-10-26T01-11-04.888Z.json): PASS120cells (48Task25,48E3,15URI,9regex-alone);5samples/target; no timeout,RangeError,mismatch;maxchild9.13s.
- Regex long space/tab/vertical-tab tails10/40/100MiB allfalse;100MiB stays outside suite.
- [Complete evidence index and limitations](../../research/evidence/f21/README.md).

## Reviews and limitations
- Supplied Claude implementation review: CHANGES REQUIRED,R-1/R-2 accepted; resume review confirms two TS errors and record dispatch defect (Argon first REQUEST CHANGES,second APPROVE per supplied brief).
- Native executor test fixes; primary source/diff/log/evidence review. Exact model routing unverified: DEGRADED; no separate paid reviewer call claimed.
- Gate completed raw samples are not retained by parent; only medians/ratios/equality are saved. Record raw samples are retained.
- URI late-valid recipe generates an eligible run, not repeated rejected headings despite its name; do not claim that coverage from this run.
- E3 oracle independence is lost; explicit examples/review20/overlay/identity remain; URI independent checks remain.
- Finite labels omit Korean/N-17 and other unapproved labels. No general performance-improvement claim.

## Delivery / next
- Existing Draft PR63; delivery on this commit; push and remote-head verification reported in PR; Ready/merge not authorized.
- Next: user Claude review (+Argon), then separate user merge approval. No next Task.
