# pilot-001 summary

Exploratory development run. 12 slots per cell (6 families x 2 questions); no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | B acc | E acc | A tokens | B tokens | E tokens | A bytes | B bytes | E bytes |
|---|---|---|---|---|---|---|---|---|---|
| clean | 92% / 100% | 100% / 100% | 100% / 100% | 823 | 823 | 398 | 117,459 | 86,827 | 5,327 |
| jpeg-only | 100% / 100% | 92% / 100% | 100% / 100% | 823 | 823 | 398 | 105,470 | 87,791 | 5,775 |
| downscale-only | 100% / 100% | 92% / 92% | 92% / 92% | 823 | 823 | 327 | 72,032 | 48,158 | 2,197 |
| combined | 83% / 92% | 83% / 92% | 83% / 83% | 823 | 823 | 327 | 37,436 | 42,658 | 2,370 |

Content accuracy, small text vs normal: A 96% / 100%, B 92% / 100%, E 88% / 100%

Content accuracy by domain: A: document 100%, chart 100%, ui 94%; B: document 100%, chart 100%, ui 88%; E: document 88%, chart 100%, ui 94%

Accounting: prompt tokens minus tile-rule image prediction ranged 54..62 (values: 54, 56, 57, 58, 59, 60, 61, 62).

Calls 144, cost $0.2459.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| dev-doc-memo/q1/downscale-only/E | QX-2969-R42 | OX-2969-R42 | no |
| dev-doc-memo/q1/combined/A | QX-2969-R42 | Ref. code: QX-2969-R42 | yes |
| dev-doc-memo/q1/combined/B | QX-2969-R42 | Ref. code: QX-2969-R42 | yes |
| dev-doc-memo/q1/combined/E | QX-2969-R42 | QX-2963-R42 | no |
| dev-chart-bar/q2/clean/A | 4,226 | Survey sample n = 4,226. | yes |
| dev-chart-bar/q2/jpeg-only/B | 4,226 | Survey sample n = 4,226. | yes |
| dev-ui-settings/q2/combined/A | 2665 | Build 2865 | no |
| dev-ui-settings/q2/combined/B | 2665 | Build 2065 | no |
| dev-ui-settings/q2/combined/E | 2665 | 2803 | no |
| dev-ui-dashboard/q1/downscale-only/B | 48 | 40 | no |
