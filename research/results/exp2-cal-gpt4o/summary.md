# exp2-cal-gpt4o summary (exp2-calibration)

Exploratory development run. 12 slots per cell; no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | B acc | C acc | E acc | D acc | A tokens | B tokens | C tokens | E tokens | D tokens | A bytes | B bytes | C bytes | E bytes | D bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean | 83% / 92% | 67% / 75% | 92% / 92% | 100% / 100% | 100% / 100% | 823 | 823 | 597 | 412 | 597 | 154,394 | 104,615 | 28,558 | 6,238 | 34,256 |
| jpeg-only | 67% / 83% | 67% / 83% | 83% / 83% | 100% / 100% | 92% / 100% | 823 | 823 | 597 | 412 | 597 | 125,335 | 105,106 | 28,728 | 6,371 | 33,163 |
| downscale-only | 67% / 83% | 58% / 67% | 75% / 75% | 75% / 75% | 83% / 83% | 823 | 823 | 568 | 356 | 568 | 85,874 | 55,370 | 18,458 | 2,337 | 25,352 |
| combined | 50% / 58% | 42% / 50% | 50% / 50% | 58% / 58% | 58% / 58% | 823 | 823 | 611 | 356 | 611 | 41,885 | 48,595 | 27,346 | 2,571 | 24,227 |

Content accuracy, small text vs normal: A 58% / 100%, B 38% / 100%, C 50% / 100%, E 67% / 100%, D 71% / 100%

Content accuracy by domain: A: document 63%, chart 88%, ui 88%; B: document 63%, chart 75%, ui 69%; C: document 75%, chart 81%, ui 69%; E: document 75%, chart 88%, ui 88%; D: document 81%, chart 88%, ui 88%

| condition | C matched | evidence covered (of matched) | D fallback / assigned | mean D-C (content) |
|---|---|---|---|---|
| clean | 9 | 7 | 3 / 12 | 0.083 |
| jpeg-only | 9 | 7 | 3 / 12 | 0.167 |
| downscale-only | 8 | 6 | 4 / 12 | 0.083 |
| combined | 7 | 5 | 5 / 12 | 0.083 |

Accounting: prompt tokens minus tile-rule image prediction ranged 54..63 (values: 54, 56, 57, 58, 59, 60, 61, 63).

Calls 192, cost $0.3220.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| exp2-calibration-doc-invoice-dense-1/q1/jpeg-only/C | INV-71595-H | INV-715958-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/A | INV-71595-H | INV717595-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/B | INV-71595-H | INV171659-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/E | INV-71595-H | INV-71596-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/C | INV-71595-H | INV171659-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/A | INV-71595-H | INV171564-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/B | INV-71595-H | INV-715964-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/E | INV-71595-H | INV-715926-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/C | INV-71595-H | INV-715964-H | no |
| exp2-calibration-doc-memo-dense-1/q1/clean/A | ZT-3114-P79 | Ref: ZT-37114-PF9 | no |
| exp2-calibration-doc-memo-dense-1/q1/clean/B | ZT-3114-P79 | Ref: ZT-314-PF79 | no |
| exp2-calibration-doc-memo-dense-1/q1/jpeg-only/A | ZT-3114-P79 | Ref: ZT-314-PF79 | no |
| exp2-calibration-doc-memo-dense-1/q1/jpeg-only/B | ZT-3114-P79 | Ref: ZT-314-FP79 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/A | ZT-3114-P79 | Ref: ZT-3114-PF9 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/B | ZT-3114-P79 | ZT-3114-PF9 | no |
| exp2-calibration-doc-memo-dense-1/q1/downscale-only/E | ZT-3114-P79 | ZT-5114-P79 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/A | ZT-3114-P79 | Ref. #ZT-314/6978 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/B | ZT-3114-P79 | Ref: 2T3/1b/4678 (quote this reference in all correspondence) | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/E | ZT-3114-P79 | Ref. 72-5114-P79 | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/C | ZT-3114-P79 | Ref: 2T31h647R (quote this reference in all correspondence) | no |
| exp2-calibration-doc-memo-dense-2/q2/clean/B | B-220 | Room: B-220 | yes |
| exp2-calibration-doc-memo-dense-2/q2/jpeg-only/A | B-220 | Room: B-220 | yes |
| exp2-calibration-doc-memo-dense-2/q2/jpeg-only/B | B-220 | Room: B-220 | yes |
| exp2-calibration-doc-memo-dense-2/q2/downscale-only/A | B-220 | Room: B-220 | yes |
| exp2-calibration-doc-memo-dense-2/q2/downscale-only/B | B-220 | Room: B-220 | yes |
| exp2-calibration-doc-memo-dense-2/q2/combined/A | B-220 | Room: B-220 | yes |
| exp2-calibration-doc-memo-dense-2/q2/combined/B | B-220 | Room: B-220 | yes |
| exp2-calibration-chart-bar12-2/q2/clean/A | 2,664 | Inspection sample: n = 2,664; weekend audits excluded. | yes |
| exp2-calibration-chart-bar12-2/q2/clean/B | 2,664 | Inspection sample: n = 2,661; weekend audits excluded. | no |
| exp2-calibration-chart-bar12-2/q2/jpeg-only/A | 2,664 | Inspection sample = 2,654; weekend audits excluded. | no |
| exp2-calibration-chart-bar12-2/q2/jpeg-only/B | 2,664 | Inspection sample = n = 2,664. | yes |
| exp2-calibration-chart-bar12-2/q2/downscale-only/A | 2,664 | Inspection sample n = 2,664; weekend audits excluded. | yes |
| exp2-calibration-chart-bar12-2/q2/downscale-only/B | 2,664 | Inspection sample = 2,654; weekend audits excluded. | no |
| exp2-calibration-chart-bar12-2/q2/downscale-only/C | 2,664 | 842 | no |
| exp2-calibration-chart-bar12-2/q2/combined/A | 2,664 | Inspection sample = 2,681, weekend audits excluded. | no |
| exp2-calibration-chart-bar12-2/q2/combined/B | 2,664 | Inspection sample = 2,668; weekend audits excluded. | no |
| exp2-calibration-chart-bar12-2/q2/combined/E | 2,664 | 2,684 | no |
| exp2-calibration-chart-bar12-2/q2/combined/C | 2,664 | 842 | no |
| exp2-calibration-chart-line-small-1/q1/downscale-only/E | 89.0 | 80.0 | no |
| exp2-calibration-chart-line-small-1/q1/combined/B | 89.0 | 90.0 | no |
| exp2-calibration-chart-line-small-1/q1/combined/C | 89.0 | 90.0 | no |
| exp2-calibration-ui-settings-dense-2/q2/clean/B | 1787 | 1187 | no |
| exp2-calibration-ui-settings-dense-2/q2/clean/C | 1787 | 1187 | no |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/A | 1787 | Firmware 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/B | 1787 | 1187 | no |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/C | 1787 | 1187 | no |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/B | 1787 | 11878 | no |
| exp2-calibration-ui-settings-dense-2/q2/downscale-only/C | 1787 | Firmware 7.4.2 (build 1187) | no |
| exp2-calibration-ui-settings-dense-2/q2/combined/A | 1787 | Build 11879 | no |
| exp2-calibration-ui-settings-dense-2/q2/combined/B | 1787 | Build 11879 | no |
| exp2-calibration-ui-settings-dense-2/q2/combined/E | 1787 | 1987 | no |
| exp2-calibration-ui-settings-dense-2/q2/combined/C | 1787 | Firmware 7.4.12 (Build 1197) | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/A | 55 | 50 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/B | 55 | 50 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/E | 55 | 50 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/C | 55 | 50 | no |
| exp2-calibration-doc-invoice-dense-1/q1/downscale-only/D | INV-71595-H | INV717595-H | no |
| exp2-calibration-doc-invoice-dense-1/q1/combined/D | INV-71595-H | INV171564-H | no |
| exp2-calibration-doc-memo-dense-1/q1/combined/D | ZT-3114-P79 | Ref. #ZT-314/6978 | no |
| exp2-calibration-chart-bar12-2/q2/downscale-only/D | 2,664 | 842 | no |
| exp2-calibration-chart-bar12-2/q2/combined/D | 2,664 | 842 | no |
| exp2-calibration-ui-settings-dense-2/q2/jpeg-only/D | 1787 | Firmware 7.4.12 (build 1787) | yes |
| exp2-calibration-ui-settings-dense-2/q2/combined/D | 1787 | Build 11879 | no |
| exp2-calibration-ui-dashboard-dense-1/q1/combined/D | 55 | 50 | no |
