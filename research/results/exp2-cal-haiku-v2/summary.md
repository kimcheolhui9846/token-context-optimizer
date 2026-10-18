# exp2-cal-haiku-v2 summary (exp2-calibration)

Exploratory development run. 12 slots per cell; no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | B acc | C acc | D acc | E acc | Dp acc | A tokens | B tokens | C tokens | D tokens | E tokens | Dp tokens | A bytes | B bytes | C bytes | D bytes | E bytes | Dp bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean | 67% / 75% | 67% / 83% | 75% / 92% | 75% / 92% | 92% / 100% | 75% / 83% | 1,624 | 1,624 | 672 | 672 | 174 | 672 | 154,394 | 104,615 | 28,558 | 28,558 | 6,238 | 34,256 |
| jpeg-only | 67% / 75% | 58% / 67% | 67% / 75% | 67% / 75% | 92% / 100% | 75% / 83% | 1,624 | 1,624 | 673 | 673 | 174 | 673 | 125,335 | 105,106 | 28,728 | 28,728 | 6,371 | 33,163 |
| downscale-only | 58% / 83% | 50% / 75% | 33% / 50% | 42% / 67% | 50% / 50% | 50% / 75% | 1,096 | 1,096 | 498 | 681 | 93 | 681 | 85,874 | 55,370 | 18,458 | 18,458 | 2,337 | 48,265 |
| combined | 58% / 75% | 58% / 75% | 33% / 50% | 42% / 58% | 58% / 58% | 42% / 58% | 1,096 | 1,096 | 581 | 672 | 93 | 672 | 41,885 | 48,595 | 27,346 | 27,346 | 2,571 | 32,696 |

Content accuracy, small text vs normal: A 54% / 100%, B 50% / 100%, C 50% / 83%, D 54% / 92%, E 54% / 100%, Dp 58% / 92%

Content accuracy by domain: A: document 69%, chart 100%, ui 63%; B: document 56%, chart 100%, ui 69%; C: document 56%, chart 75%, ui 69%; D: document 69%, chart 81%, ui 69%; E: document 75%, chart 81%, ui 75%; Dp: document 81%, chart 81%, ui 63%

| condition | C matched | evidence covered (of matched) | D fallback / assigned | mean D-C (content) |
|---|---|---|---|---|
| clean | 9 | 7 | 0 / 12 | 0.000 |
| jpeg-only | 9 | 7 | 0 / 12 | 0.000 |
| downscale-only | 8 | 6 | 2 / 12 | 0.167 |
| combined | 7 | 5 | 1 / 12 | 0.083 |

Accounting: prompt tokens minus tile-rule image prediction ranged 55..66 (values: 55, 57, 58, 59, 60, 61, 62, 66).

Calls 240, cost $0.2084.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| exp2-calibration-doc-invoice-dense-1/q1/jpeg-only/B | INV-71595-H | INV-71596-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/jpeg-only/C | INV-71595-H | INV-71596-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/jpeg-only/D | INV-71595-H | INV-71596-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/B | INV-71595-H | INV-1595-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/E | INV-71595-H | INV-TT5856-M | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/C | INV-71595-H | INV-1595-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/D | INV-71595-H | INCT1595-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/A | INV-71595-H | INV-71596-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/B | INV-71595-H | INV-F1596-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/E | INV-71595-H | INV-7T595-M | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/C | INV-71595-H | INV-F1596-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/D | INV-71595-H | INV-F1596-H | no |
| exp2-calibration-doc-memo-dense-1/q1/clean/A | ZT-3114-P79 | ZT-3114-P78 | no |
| exp2-calibration-doc-memo-dense-1/q1/clean/B | ZT-3114-P79 | ZT-3114-P78 | no |
| exp2-calibration-doc-memo-dense-1/q1/jpeg-only/A | ZT-3114-P79 | ZT-3114-P78 | no |
| exp2-calibration-doc-memo-dense-1/q1/jpeg-only/B | ZT-3114-P79 | ZT-3114-P78 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/A | ZT-3114-P79 | JT-2014-PP9 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/B | ZT-3114-P79 | C-183 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/E | ZT-3114-P79 | Z7-3114-079 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/C | ZT-3114-P79 | ZT-3114-873 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/D | ZT-3114-P79 | ZT-3114-873 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/A | ZT-3114-P79 | C-183 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/B | ZT-3114-P79 | C-183 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/E | ZT-3114-P79 | Z7-3116-679 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/C | ZT-3114-P79 | C-183 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/D | ZT-3114-P79 | C-183 | no |
| exp2-calibration-doc-memo-dense-2/q2/downscale-only/C | B-220 | UNREADABLE

The image shows a block of text that appears to be a list of various meeting topics and administrative items, but there is no clear indication of a specific room assignment mentioned in the | no |
| exp2-calibration-doc-memo-dense-2/q2/combined/C | B-220 | UNREADABLE

The image shows repeated text about meetings, schedules, and approvals, but does not clearly specify which room is assigned in the notice. The text is repetitive and frag | no |
| exp2-calibration-chart-bar12-1/q1/downscale-only/C | 289 | 280 | no |
| exp2-calibration-chart-bar12-1/q1/downscale-only/D | 289 | 280 | no |
| exp2-calibration-chart-bar12-1/q1/combined/C | 289 | 280 | no |
| exp2-calibration-chart-bar12-1/q1/combined/D | 289 | 280 | no |
| exp2-calibration-chart-bar12-2/q2/downscale-only/A | 2,664 | 2,664, weekend audits excluded | yes |
| exp2-calibration-chart-bar12-2/q2/downscale-only/B | 2,664 | 2,664, weekend audits excluded | yes |
| exp2-calibration-chart-bar12-2/q2/downscale-only/E | 2,664 | 2,684 | no |
| exp2-calibration-chart-bar12-2/q2/downscale-only/C | 2,664 | UNREADABLE

The image shows a bar chart titled "Monthly Inspection Count" with visible values of 842 and 975, but there is no inspection sample size notation visible under the | no |
| exp2-calibration-chart-bar12-2/q2/downscale-only/D | 2,664 | 2,664, weekend audits excluded | yes |
| exp2-calibration-chart-bar12-2/q2/combined/C | 2,664 | 975 | no |
| exp2-calibration-chart-bar12-2/q2/combined/D | 2,664 | 975 | no |
| exp2-calibration-chart-line-small-1/q1/clean/A | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/clean/B | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/clean/E | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/clean/C | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/clean/D | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/jpeg-only/A | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/jpeg-only/B | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/jpeg-only/E | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/jpeg-only/C | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/jpeg-only/D | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/downscale-only/A | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/downscale-only/B | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/downscale-only/E | 89.0 | Peak 90.0 | no |
| exp2-calibration-chart-line-small-1/q1/downscale-only/C | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/downscale-only/D | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/combined/A | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/combined/B | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/combined/E | 89.0 | Peak 90.0 | no |
| exp2-calibration-chart-line-small-1/q1/combined/C | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/combined/D | 89.0 | Peak 89.0 | yes |
| exp2-calibration-ui-settings-dense-2/q2/clean/A | 1787 | 7.4.12 (build 1797) | no |
| exp2-calibration-ui-settings-dense-2/q2/clean/B | 1787 | 1787F | yes |
| exp2-calibration-ui-settings-dense-2/q2/clean/C | 1787 | 1787F | yes |
| exp2-calibration-ui-settings-dense-2/q2/clean/D | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/A | 1787 | 7.4.12 (build 17FF) | no |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/B | 1787 | 7.4.12 (build 17FF) | no |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/C | 1787 | 7.4.12 (build 17FF) | no |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/D | 1787 | 7.4.12 (build 17FF) | no |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/A | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/B | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/E | 1787 | 1707 | no |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/C | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/D | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/combined/A | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/combined/B | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/combined/E | 1787 | 1707 | no |
| exp2-calibration-ui-settings-dense-2/q2/combined/C | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/combined/D | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-dashboard-dense-1/q1/clean/A | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/clean/B | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/clean/C | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/clean/D | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/jpeg-only/A | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/jpeg-only/B | 55 | 2 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/jpeg-only/C | 55 | 2 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/jpeg-only/D | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/downscale-only/A | 55 | 4 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/downscale-only/B | 55 | 2 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/downscale-only/E | 55 | 1 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/downscale-only/C | 55 | 2 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/downscale-only/D | 55 | 4 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/A | 55 | 4 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/B | 55 | 4 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/E | 55 | 1 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/C | 55 | 4 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/D | 55 | 4 | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/Dp | INV-71595-H | INV-71596-H | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/Dp | ZT-3114-P79 | ZT-3114-873 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/Dp | ZT-3114-P79 | C-183 | no |
| exp2-calibration-chart-bar12-1/q1/downscale-only/Dp | 289 | 280 | no |
| exp2-calibration-chart-bar12-1/q1/combined/Dp | 289 | 280 | no |
| exp2-calibration-chart-bar12-2/q2/downscale-only/Dp | 2,664 | 2,664, weekend audits excluded | yes |
| exp2-calibration-chart-bar12-2/q2/combined/Dp | 2,664 | 975 | no |
| exp2-calibration-chart-line-small-1/q1/clean/Dp | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/jpeg-only/Dp | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/downscale-only/Dp | 89.0 | Peak 89.0 | yes |
| exp2-calibration-chart-line-small-1/q1/combined/Dp | 89.0 | Peak 89.0 | yes |
| exp2-calibration-ui-settings-dense-2/q2/clean/Dp | 1787 | 7.4.12 (build 1797) | no |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/Dp | 1787 | 7.4.12 (build 17FF) | no |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/Dp | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/combined/Dp | 1787 | 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-dashboard-dense-1/q1/clean/Dp | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/jpeg-only/Dp | 55 | 24 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/downscale-only/Dp | 55 | 4 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/Dp | 55 | 4 | no |
