# pilot-002 summary (dev2)

Exploratory development run. 36 slots per cell; no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | B acc | C acc | D acc | E acc | A tokens | B tokens | C tokens | D tokens | E tokens | A bytes | B bytes | C bytes | D bytes | E bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean | 78% / 89% | 75% / 89% | 81% / 86% | 81% / 86% | 100% / 100% | 824 | 824 | 697 | 697 | 418 | 153,608 | 104,049 | 45,224 | 51,323 | 5,317 |
| jpeg-only | 78% / 89% | 75% / 89% | 81% / 86% | 81% / 86% | 100% / 100% | 824 | 824 | 702 | 702 | 418 | 124,673 | 104,560 | 45,738 | 50,457 | 5,656 |
| downscale-only | 83% / 92% | 67% / 81% | 67% / 67% | 69% / 69% | 92% / 92% | 824 | 824 | 569 | 588 | 357 | 85,118 | 55,033 | 20,720 | 33,234 | 2,043 |
| combined | 61% / 69% | 61% / 69% | 53% / 61% | 56% / 64% | 69% / 69% | 824 | 824 | 607 | 607 | 357 | 41,653 | 48,334 | 25,728 | 23,402 | 2,263 |

Content accuracy, small text vs normal: A 69% / 100%, B 65% / 99%, C 67% / 83%, D 69% / 83%, E 81% / 100%

Content accuracy by domain: A: document 75%, chart 92%, ui 88%; B: document 75%, chart 90%, ui 81%; C: document 83%, chart 65%, ui 77%; D: document 83%, chart 65%, ui 81%; E: document 90%, chart 88%, ui 94%

| condition | C matched | evidence covered (of matched) | D fallback / assigned | mean D-C (content) |
|---|---|---|---|---|
| clean | 27 | 24 | 9 / 36 | 0.000 |
| jpeg-only | 26 | 23 | 10 / 36 | 0.000 |
| downscale-only | 27 | 20 | 11 / 36 | 0.028 |
| combined | 23 | 16 | 13 / 36 | 0.028 |

Accounting: prompt tokens minus tile-rule image prediction ranged 54..66 (values: 54, 56, 57, 58, 59, 60, 61, 62, 63, 66).

Calls 720, cost $1.2253.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| dev2-doc-invoice-dense-1/q1/combined/B | INV-98761-A | INV-983716-A | no |
| dev2-doc-invoice-dense-1/q1/combined/E | INV-98761-A | 196-987651-4 | no |
| dev2-doc-invoice-dense-1/q1/combined/C | INV-98761-A | INV-983716-A | no |
| dev2-doc-invoice-dense-2/q1/clean/A | INV-20868-C | INV-20896-C | no |
| dev2-doc-invoice-dense-2/q1/clean/B | INV-20868-C | INV-20846-C | no |
| dev2-doc-invoice-dense-2/q1/clean/C | INV-20868-C | INV-20846-C | no |
| dev2-doc-invoice-dense-2/q1/clean/D | INV-20868-C | INV-20896-C | no |
| dev2-doc-invoice-dense-2/q1/jpeg-only/A | INV-20868-C | INV-20685-C | no |
| dev2-doc-invoice-dense-2/q1/jpeg-only/B | INV-20868-C | INV-20686-C | no |
| dev2-doc-invoice-dense-2/q1/jpeg-only/C | INV-20868-C | INV-20686-C | no |
| dev2-doc-invoice-dense-2/q1/jpeg-only/D | INV-20868-C | INV-20685-C | no |
| dev2-doc-invoice-dense-2/q1/downscale-only/A | INV-20868-C | INV-20985-C | no |
| dev2-doc-invoice-dense-2/q1/downscale-only/B | INV-20868-C | INV-20985-C | no |
| dev2-doc-invoice-dense-2/q1/downscale-only/E | INV-20868-C | INV-20888-C | no |
| dev2-doc-invoice-dense-2/q1/downscale-only/C | INV-20868-C | INV-20985-C | no |
| dev2-doc-invoice-dense-2/q1/downscale-only/D | INV-20868-C | INV-20985-C | no |
| dev2-doc-invoice-dense-2/q1/combined/A | INV-20868-C | INV-20684-C | no |
| dev2-doc-invoice-dense-2/q1/combined/D | INV-20868-C | INV-20684-C | no |
| dev2-doc-memo-dense-1/q1/clean/A | ZT-4445-F86 | Ref: ZT-4445-FB6 | no |
| dev2-doc-memo-dense-1/q1/clean/B | ZT-4445-F86 | Ref: ZT-445-FB | no |
| dev2-doc-memo-dense-1/q2/clean/A | D-229 | Room D-229 | yes |
| dev2-doc-memo-dense-1/q2/clean/B | D-229 | Room D-229 | yes |
| dev2-doc-memo-dense-1/q1/jpeg-only/A | ZT-4445-F86 | Ref: ZT-445-FR8 | no |
| dev2-doc-memo-dense-1/q1/jpeg-only/B | ZT-4445-F86 | ZT-1445-FR8 | no |
| dev2-doc-memo-dense-1/q2/jpeg-only/A | D-229 | Room D-229 | yes |
| dev2-doc-memo-dense-1/q2/jpeg-only/B | D-229 | Room D-229 | yes |
| dev2-doc-memo-dense-1/q1/downscale-only/A | ZT-4445-F86 | Ref: ZT-4445-FR6 | no |
| dev2-doc-memo-dense-1/q1/downscale-only/B | ZT-4445-F86 | Ref: ZT-445-F36 | no |
| dev2-doc-memo-dense-1/q1/downscale-only/C | ZT-4445-F86 | ZT-4445-F36 | no |
| dev2-doc-memo-dense-1/q1/downscale-only/D | ZT-4445-F86 | Ref: ZT-4445-FR6 | no |
| dev2-doc-memo-dense-1/q2/downscale-only/A | D-229 | Room D-229 | yes |
| dev2-doc-memo-dense-1/q2/downscale-only/B | D-229 | Room D-229 is assigned in the notice. | yes |
| dev2-doc-memo-dense-1/q1/combined/A | ZT-4445-F86 | Ref. JT-445-FRB | no |
| dev2-doc-memo-dense-1/q1/combined/B | ZT-4445-F86 | Ref: JT-445-FVB | no |
| dev2-doc-memo-dense-1/q1/combined/E | ZT-4445-F86 | ZT-4456-F16 | no |
| dev2-doc-memo-dense-1/q1/combined/C | ZT-4445-F86 | Ref: JT-445-FVB | no |
| dev2-doc-memo-dense-1/q1/combined/D | ZT-4445-F86 | Ref: JT-445-FVB | no |
| dev2-doc-memo-dense-1/q2/combined/A | D-229 | Room D-229 | yes |
| dev2-doc-memo-dense-1/q2/combined/B | D-229 | Room D-229 | yes |
| dev2-doc-memo-dense-1/q2/combined/C | D-229 | Room D-229 is assigned in the notice. | yes |
| dev2-doc-memo-dense-1/q2/combined/D | D-229 | Room D-229 is assigned in the notice. | yes |
| dev2-doc-memo-dense-2/q1/clean/A | ZT-6140-M46 | Ref: ZT-61460-M46 | no |
| dev2-doc-memo-dense-2/q1/clean/B | ZT-6140-M46 | Ref: ZT-416-M46 | no |
| dev2-doc-memo-dense-2/q2/clean/A | C-422 | Room: C-422 | yes |
| dev2-doc-memo-dense-2/q2/clean/B | C-422 | Room: C-422 | yes |
| dev2-doc-memo-dense-2/q1/jpeg-only/A | ZT-6140-M46 | Ref: ZT-616-M46 | no |
| dev2-doc-memo-dense-2/q1/jpeg-only/B | ZT-6140-M46 | ZT-6146-M46 | no |
| dev2-doc-memo-dense-2/q1/downscale-only/A | ZT-6140-M46 | Ref: ZT-61460-M46 | no |
| dev2-doc-memo-dense-2/q1/downscale-only/B | ZT-6140-M46 | ZT-6146-M486 | no |
| dev2-doc-memo-dense-2/q1/downscale-only/E | ZT-6140-M46 | ZT 6104-MM | no |
| dev2-doc-memo-dense-2/q1/downscale-only/C | ZT-6140-M46 | Ref: ZT-4160-M46 | no |
| dev2-doc-memo-dense-2/q1/downscale-only/D | ZT-6140-M46 | Ref: ZT-4160-M46 | no |
| dev2-doc-memo-dense-2/q2/downscale-only/B | C-422 | Room C-422. | yes |
| dev2-doc-memo-dense-2/q1/combined/A | ZT-6140-M46 | Ref: ZT-6140-MBE | no |
| dev2-doc-memo-dense-2/q1/combined/B | ZT-6140-M46 | Ref: ZT-410-MAE | no |
| dev2-doc-memo-dense-2/q1/combined/E | ZT-6140-M46 | Ref. ZF-4164-M46 | no |
| dev2-doc-memo-dense-2/q1/combined/C | ZT-6140-M46 | Ref: ZT-410-MAE | no |
| dev2-doc-memo-dense-2/q1/combined/D | ZT-6140-M46 | Ref. ZT-6140-MBE | no |
| dev2-doc-memo-dense-2/q2/combined/B | C-422 | Room: C-422 | yes |
| dev2-doc-memo-dense-2/q2/combined/C | C-422 | Room C-422 | yes |
| dev2-doc-memo-dense-2/q2/combined/D | C-422 | Room C-422 | yes |
| dev2-chart-bar12-1/q2/clean/A | 9,744 | Inspection sample: n = 9,744; weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/clean/B | 9,744 | Inspection sample: n = 9,744; weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/clean/C | 9,744 | Inspection sample n = 9,744; weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/clean/D | 9,744 | Inspection sample n = 9,744; weekend audits excluded. | yes |
| dev2-chart-bar12-1/q3/clean/C | Mar | UNREADABLE | no |
| dev2-chart-bar12-1/q3/clean/D | Mar | UNREADABLE | no |
| dev2-chart-bar12-1/q2/jpeg-only/A | 9,744 | Inspection sample: n = 9,744, weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/jpeg-only/B | 9,744 | Inspection sample = n = 9,744, weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/jpeg-only/C | 9,744 | Inspection sample n = 9,744; weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/jpeg-only/D | 9,744 | Inspection sample n = 9,744; weekend audits excluded. | yes |
| dev2-chart-bar12-1/q3/jpeg-only/B | Mar | March | yes |
| dev2-chart-bar12-1/q3/jpeg-only/C | Mar | UNREADABLE | no |
| dev2-chart-bar12-1/q3/jpeg-only/D | Mar | UNREADABLE | no |
| dev2-chart-bar12-1/q2/downscale-only/A | 9,744 | Inspection sample: n = 9,744; weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/downscale-only/B | 9,744 | Inspection sample: n = 9,744, weekend audits excluded. | yes |
| dev2-chart-bar12-1/q2/downscale-only/C | 9,744 | UNREADABLE | no |
| dev2-chart-bar12-1/q2/downscale-only/D | 9,744 | UNREADABLE | no |
| dev2-chart-bar12-1/q3/downscale-only/B | Mar | March | yes |
| dev2-chart-bar12-1/q3/downscale-only/C | Mar | UNREADABLE | no |
| dev2-chart-bar12-1/q3/downscale-only/D | Mar | UNREADABLE | no |
| dev2-chart-bar12-1/q2/combined/A | 9,744 | Inspection sample: n = 7,741, weekend audits excluded. | no |
| dev2-chart-bar12-1/q2/combined/B | 9,744 | Inspection sample: n = 7,941, weekend audits excluded. | no |
| dev2-chart-bar12-1/q2/combined/E | 9,744 | Inspection sample = 9,784. | no |
| dev2-chart-bar12-1/q2/combined/C | 9,744 | 851 and 939. | no |
| dev2-chart-bar12-1/q2/combined/D | 9,744 | 851 and 939. | no |
| dev2-chart-bar12-1/q3/combined/C | Mar | UNREADABLE | no |
| dev2-chart-bar12-1/q3/combined/D | Mar | UNREADABLE | no |
| dev2-chart-bar12-2/q1/clean/C | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q1/clean/D | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q2/clean/A | 3,482 | Inspection sample: n = 3,482; weekend audits excluded. | yes |
| dev2-chart-bar12-2/q2/clean/B | 3,482 | Inspection sample: n = 3,482; weekend audits excluded. | yes |
| dev2-chart-bar12-2/q2/clean/C | 3,482 | Inspection sample n = 3,482. | yes |
| dev2-chart-bar12-2/q2/clean/D | 3,482 | Inspection sample n = 3,482 | yes |
| dev2-chart-bar12-2/q3/clean/B | Jun | June | yes |
| dev2-chart-bar12-2/q3/clean/C | Jun | March | no |
| dev2-chart-bar12-2/q3/clean/D | Jun | March | no |
| dev2-chart-bar12-2/q1/jpeg-only/C | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q1/jpeg-only/D | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q2/jpeg-only/A | 3,482 | Inspection sample: n = 3,482; weekend audits excluded. | yes |
| dev2-chart-bar12-2/q2/jpeg-only/B | 3,482 | Inspection sample: n = 3,482. | yes |
| dev2-chart-bar12-2/q2/jpeg-only/C | 3,482 | Inspection sample n = 3,482. | yes |
| dev2-chart-bar12-2/q2/jpeg-only/D | 3,482 | Inspection sample n = 3,482. | yes |
| dev2-chart-bar12-2/q3/jpeg-only/A | Jun | June | yes |
| dev2-chart-bar12-2/q3/jpeg-only/B | Jun | June | yes |
| dev2-chart-bar12-2/q3/jpeg-only/C | Jun | March | no |
| dev2-chart-bar12-2/q3/jpeg-only/D | Jun | March | no |
| dev2-chart-bar12-2/q1/downscale-only/C | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q1/downscale-only/D | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q2/downscale-only/A | 3,482 | Inspection sample n = 3,482; weekend audits excluded. | yes |
| dev2-chart-bar12-2/q2/downscale-only/B | 3,482 | Inspection sample = n = 5,482, weekend audits excluded. | no |
| dev2-chart-bar12-2/q2/downscale-only/E | 3,482 | 3,421 | no |
| dev2-chart-bar12-2/q2/downscale-only/C | 3,482 | UNREADABLE | no |
| dev2-chart-bar12-2/q2/downscale-only/D | 3,482 | The inspection sample size noted under the chart is **10%**. | no |
| dev2-chart-bar12-2/q3/downscale-only/B | Jun | June | yes |
| dev2-chart-bar12-2/q3/downscale-only/C | Jun | March | no |
| dev2-chart-bar12-2/q3/downscale-only/D | Jun | March | no |
| dev2-chart-bar12-2/q1/combined/C | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q1/combined/D | 928 | UNREADABLE | no |
| dev2-chart-bar12-2/q2/combined/A | 3,482 | Inspection sample = n = 3,422, weekend audits excluded. | no |
| dev2-chart-bar12-2/q2/combined/B | 3,482 | Inspection sample = n = 5,422, weekend audits excluded. | no |
| dev2-chart-bar12-2/q2/combined/E | 3,482 | Inspection sample = 5,432 warrant audits evaluated. | no |
| dev2-chart-bar12-2/q2/combined/C | 3,482 | UNREADABLE | no |
| dev2-chart-bar12-2/q2/combined/D | 3,482 | UNREADABLE | no |
| dev2-chart-bar12-2/q3/combined/A | Jun | June | yes |
| dev2-chart-bar12-2/q3/combined/B | Jun | March | no |
| dev2-chart-bar12-2/q3/combined/C | Jun | UNREADABLE | no |
| dev2-chart-bar12-2/q3/combined/D | Jun | UNREADABLE | no |
| dev2-chart-line-small-1/q1/combined/E | 86.1 | 85.1 | no |
| dev2-chart-line-small-1/q3/combined/A | 06:57 | 08:57 | no |
| dev2-chart-line-small-1/q3/combined/B | 06:57 | 08:57 | no |
| dev2-chart-line-small-1/q3/combined/E | 06:57 | 08:57 | no |
| dev2-chart-line-small-1/q3/combined/C | 06:57 | 08:57 | no |
| dev2-chart-line-small-1/q3/combined/D | 06:57 | 08:57 | no |
| dev2-chart-line-small-2/q1/combined/A | 86.8 | 36.8 | no |
| dev2-chart-line-small-2/q1/combined/E | 86.8 | 88.8 | no |
| dev2-ui-settings-dense-1/q2/downscale-only/B | 3123 | Build 312. | no |
| dev2-ui-settings-dense-1/q3/downscale-only/C | 57.8 GB | UNREADABLE | no |
| dev2-ui-settings-dense-1/q3/downscale-only/D | 57.8 GB | UNREADABLE | no |
| dev2-ui-settings-dense-1/q2/combined/A | 3123 | Firmware 7.8.53 (build 3121) | no |
| dev2-ui-settings-dense-1/q2/combined/B | 3123 | Firmware 7.8.52 (build 3015) | no |
| dev2-ui-settings-dense-1/q2/combined/E | 3123 | Build 1713 | no |
| dev2-ui-settings-dense-1/q2/combined/C | 3123 | Firmware 7.8.52 (build 3015) | no |
| dev2-ui-settings-dense-1/q2/combined/D | 3123 | Build 31121 | no |
| dev2-ui-settings-dense-1/q3/combined/A | 57.8 GB | 57.3 GB | no |
| dev2-ui-settings-dense-1/q3/combined/E | 57.8 GB | 57.5 GB | no |
| dev2-ui-settings-dense-1/q3/combined/C | 57.8 GB | UNREADABLE | no |
| dev2-ui-settings-dense-1/q3/combined/D | 57.8 GB | UNREADABLE | no |
| dev2-ui-settings-dense-2/q3/downscale-only/C | 52.6 GB | UNREADABLE | no |
| dev2-ui-settings-dense-2/q3/downscale-only/D | 52.6 GB | UNREADABLE | no |
| dev2-ui-settings-dense-2/q2/combined/A | 4021 | Firmware 7.9.0 (build 4021) | yes |
| dev2-ui-settings-dense-2/q2/combined/B | 4021 | Firmware 7.9.3 (build 4021) | yes |
| dev2-ui-settings-dense-2/q2/combined/E | 4021 | 4003 | no |
| dev2-ui-settings-dense-2/q2/combined/C | 4021 | Firmware 7.9.0 (build 4021) | yes |
| dev2-ui-settings-dense-2/q2/combined/D | 4021 | Firmware 7.9.0 (build 4021) | yes |
| dev2-ui-settings-dense-2/q3/combined/A | 52.6 GB | 52.4 GB | no |
| dev2-ui-settings-dense-2/q3/combined/B | 52.6 GB | 57.6 GB | no |
| dev2-ui-settings-dense-2/q3/combined/C | 52.6 GB | UNREADABLE | no |
| dev2-ui-settings-dense-2/q3/combined/D | 52.6 GB | UNREADABLE | no |
| dev2-ui-dashboard-dense-1/q1/clean/A | 73 | 13 | no |
| dev2-ui-dashboard-dense-1/q1/clean/B | 73 | 75 | no |
| dev2-ui-dashboard-dense-1/q1/clean/C | 73 | 75 | no |
| dev2-ui-dashboard-dense-1/q1/clean/D | 73 | 13 | no |
| dev2-ui-dashboard-dense-1/q1/jpeg-only/A | 73 | 15 | no |
| dev2-ui-dashboard-dense-1/q1/jpeg-only/B | 73 | 75 | no |
| dev2-ui-dashboard-dense-1/q1/jpeg-only/C | 73 | 75 | no |
| dev2-ui-dashboard-dense-1/q1/jpeg-only/D | 73 | 7 | no |
| dev2-ui-dashboard-dense-1/q1/downscale-only/B | 73 | 71 | no |
| dev2-ui-dashboard-dense-1/q1/downscale-only/C | 73 | 71 | no |
| dev2-ui-dashboard-dense-1/q3/downscale-only/B | 06:49 | 08:49 | no |
| dev2-ui-dashboard-dense-1/q3/downscale-only/C | 06:49 | 08:49 | no |
| dev2-ui-dashboard-dense-1/q3/downscale-only/D | 06:49 | 08:49 | no |
| dev2-ui-dashboard-dense-1/q1/combined/A | 73 | 75 | no |
| dev2-ui-dashboard-dense-1/q1/combined/B | 73 | 75 | no |
| dev2-ui-dashboard-dense-1/q1/combined/C | 73 | 75 | no |
| dev2-ui-dashboard-dense-1/q1/combined/D | 73 | 75 | no |
| dev2-ui-dashboard-dense-2/q3/combined/B | 03:12 | 13:12 | no |
| dev2-ui-dashboard-dense-2/q3/combined/C | 03:12 | 13:12 | no |
