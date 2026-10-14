# pilot-003 summary (dev3)

Exploratory development run. 36 slots per cell; no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | C1 acc | C2 acc | E acc | C1R acc | C2R acc | A tokens | C1 tokens | C2 tokens | E tokens | C1R tokens | C2R tokens | A bytes | C1 bytes | C2 bytes | E bytes | C1R bytes | C2R bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean | 72% / 89% | 86% / 86% | 56% / 69% | 100% / 100% | 89% / 89% | 75% / 92% | 825 | 593 | 793 | 418 | 616 | 976 | 153,259 | 27,799 | 153,259 | 5,295 | 29,350 | 187,823 |
| jpeg-only | 64% / 86% | 86% / 86% | 56% / 72% | 97% / 97% | 86% / 89% | 72% / 89% | 825 | 598 | 802 | 418 | 621 | 939 | 124,953 | 29,324 | 124,953 | 5,807 | 31,412 | 140,238 |
| downscale-only | 75% / 86% | 61% / 61% | 50% / 58% | 89% / 89% | 72% / 75% | 69% / 81% | 825 | 527 | 731 | 352 | 642 | 914 | 85,074 | 16,041 | 85,074 | 2,041 | 21,202 | 104,923 |
| combined | 58% / 67% | 56% / 56% | 31% / 39% | 61% / 69% | 64% / 67% | 47% / 56% | 825 | 551 | 722 | 352 | 666 | 859 | 41,573 | 18,550 | 41,573 | 2,271 | 22,300 | 46,914 |

Content accuracy, small text vs normal: A 64% / 100%, C1 56% / 89%, C2 50% / 69%, E 78% / 100%, C1R 63% / 97%, C2R 61% / 97%

Content accuracy by domain: A: document 85%, chart 94%, ui 67%; C1: document 88%, chart 73%, ui 56%; C2: document 54%, chart 65%, ui 60%; E: document 83%, chart 92%, ui 92%; C1R: document 88%, chart 88%, ui 65%; C2R: document 83%, chart 83%, ui 71%

| condition | C1 matched | C1 covered | C2 boxed | C2 covered | retries C1R | retries C2R |
|---|---|---|---|---|---|---|
| clean | 27/36 | 21 | 17/36 | 9 | 1 | 8 |
| jpeg-only | 26/36 | 20 | 19/36 | 11 | 1 | 6 |
| downscale-only | 26/36 | 18 | 21/36 | 12 | 5 | 8 |
| combined | 24/36 | 16 | 22/36 | 13 | 5 | 6 |

Accounting: prompt tokens minus tile-rule image prediction ranged 54..66 (values: 54, 56, 57, 58, 59, 60, 61, 62, 63, 66).

Calls 576, cost $0.9944.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| dev3-doc-invoice-dense-1/q2/clean/C2 | 529.28 | UNREADABLE | no |
| dev3-doc-invoice-dense-1/q3/clean/C2 | $13,862.52 | UNREADABLE | no |
| dev3-doc-invoice-dense-1/q2/jpeg-only/C2 | 529.28 | UNREADABLE | no |
| dev3-doc-invoice-dense-1/q1/downscale-only/A | INV-76587-C | INV76587-C | no |
| dev3-doc-invoice-dense-1/q1/downscale-only/C1 | INV-76587-C | INV/76587-C | no |
| dev3-doc-invoice-dense-1/q2/downscale-only/C2 | 529.28 | UNREADABLE | no |
| dev3-doc-invoice-dense-1/q3/downscale-only/C2 | $13,862.52 | UNREADABLE | no |
| dev3-doc-invoice-dense-1/q1/combined/E | INV-76587-C | INV-75387-C | no |
| dev3-doc-invoice-dense-1/q1/combined/C2 | INV-76587-C | INV-75587-C | no |
| dev3-doc-invoice-dense-1/q2/combined/C2 | 529.28 | UNREADABLE | no |
| dev3-doc-invoice-dense-1/q3/combined/C2 | $13,862.52 | UNREADABLE | no |
| dev3-doc-invoice-dense-2/q2/clean/C2 | 2,914.48 | UNREADABLE | no |
| dev3-doc-invoice-dense-2/q2/jpeg-only/C2 | 2,914.48 | UNREADABLE | no |
| dev3-doc-invoice-dense-2/q1/downscale-only/E | INV-73897-E | INV-73697-E | no |
| dev3-doc-invoice-dense-2/q2/downscale-only/C2 | 2,914.48 | UNREADABLE | no |
| dev3-doc-invoice-dense-2/q3/downscale-only/C2 | $15,258.08 | UNREADABLE | no |
| dev3-doc-invoice-dense-2/q1/combined/A | INV-73897-E | INV-123987-E | no |
| dev3-doc-invoice-dense-2/q1/combined/E | INV-73897-E | INV.735072-E | no |
| dev3-doc-invoice-dense-2/q1/combined/C1 | INV-73897-E | INV-12897-E | no |
| dev3-doc-invoice-dense-2/q1/combined/C2 | INV-73897-E | INV-73697-E | no |
| dev3-doc-invoice-dense-2/q2/combined/C2 | 2,914.48 | UNREADABLE | no |
| dev3-doc-memo-dense-1/q1/clean/A | ZT-9005-M19 | Ref: ZT-2005-MF9 | no |
| dev3-doc-memo-dense-1/q1/clean/C2 | ZT-9005-M19 | Ref: ZT-6905-MT9 | no |
| dev3-doc-memo-dense-1/q2/clean/A | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q2/clean/C2 | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q1/jpeg-only/A | ZT-9005-M19 | Ref: ZT-2005-M19 | no |
| dev3-doc-memo-dense-1/q1/jpeg-only/C2 | ZT-9005-M19 | Ref: ZT-6905-M19 | no |
| dev3-doc-memo-dense-1/q2/jpeg-only/A | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q2/jpeg-only/C2 | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q1/downscale-only/A | ZT-9005-M19 | ZT-6905-M19 | no |
| dev3-doc-memo-dense-1/q1/downscale-only/E | ZT-9005-M19 | ZT-6905-M19 | no |
| dev3-doc-memo-dense-1/q1/downscale-only/C1 | ZT-9005-M19 | ZT-5905-M19 | no |
| dev3-doc-memo-dense-1/q1/downscale-only/C2 | ZT-9005-M19 | Ref: ZT-905-M19 | no |
| dev3-doc-memo-dense-1/q2/downscale-only/A | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q2/downscale-only/C2 | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q1/combined/A | ZT-9005-M19 | Ref: ZT-2026-MTB | no |
| dev3-doc-memo-dense-1/q1/combined/E | ZT-9005-M19 | ZT-9504-M10 | no |
| dev3-doc-memo-dense-1/q1/combined/C1 | ZT-9005-M19 | Ref: JT-2025-MTR | no |
| dev3-doc-memo-dense-1/q1/combined/C2 | ZT-9005-M19 | Ref. ZT-0905-M10 | no |
| dev3-doc-memo-dense-1/q2/combined/A | C-231 | Room C-231 is assigned in the notice. | yes |
| dev3-doc-memo-dense-1/q2/combined/C2 | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-2/q1/clean/A | ZT-3066-P84 | Ref: ZT-3066-P84 | yes |
| dev3-doc-memo-dense-2/q1/clean/C2 | ZT-3066-P84 | Ref: ZT-3066-P84 | yes |
| dev3-doc-memo-dense-2/q2/clean/A | D-488 | Room: D-488 | yes |
| dev3-doc-memo-dense-2/q2/clean/C2 | D-488 | UNREADABLE | no |
| dev3-doc-memo-dense-2/q1/jpeg-only/A | ZT-3066-P84 | Ref: ZT-3066-P84 | yes |
| dev3-doc-memo-dense-2/q1/jpeg-only/E | ZT-3066-P84 | ZT-3066-PB4 | no |
| dev3-doc-memo-dense-2/q1/jpeg-only/C2 | ZT-3066-P84 | Ref: ZT-3066-P84 | yes |
| dev3-doc-memo-dense-2/q2/jpeg-only/A | D-488 | Room: D-488 | yes |
| dev3-doc-memo-dense-2/q2/jpeg-only/C2 | D-488 | Room: D-488 | yes |
| dev3-doc-memo-dense-2/q1/downscale-only/E | ZT-3066-P84 | ZT-3006-PM | no |
| dev3-doc-memo-dense-2/q1/downscale-only/C1 | ZT-3066-P84 | ZT-3066-PM | no |
| dev3-doc-memo-dense-2/q1/downscale-only/C2 | ZT-3066-P84 | Ref: ZT-3068-P84 | no |
| dev3-doc-memo-dense-2/q2/downscale-only/A | D-488 | Room: D-488 | yes |
| dev3-doc-memo-dense-2/q2/downscale-only/C2 | D-488 | UNREADABLE | no |
| dev3-doc-memo-dense-2/q1/combined/A | ZT-3066-P84 | Ref. XT-2056-PM6 | no |
| dev3-doc-memo-dense-2/q1/combined/E | ZT-3066-P84 | Ref: ZT-2009-894 | no |
| dev3-doc-memo-dense-2/q1/combined/C1 | ZT-3066-P84 | XT-2068-PM | no |
| dev3-doc-memo-dense-2/q1/combined/C2 | ZT-3066-P84 | XT-0986-PM | no |
| dev3-doc-memo-dense-2/q2/combined/A | D-488 | Room D-488 | yes |
| dev3-doc-memo-dense-2/q2/combined/E | D-488 | Room D-488 | yes |
| dev3-doc-memo-dense-2/q2/combined/C2 | D-488 | Room D-488. | yes |
| dev3-chart-bar12-1/q2/clean/A | 4,134 | Inspection sample n = 4,134; weekend audits excluded. | yes |
| dev3-chart-bar12-1/q2/clean/C2 | 4,134 | Inspection sample: n = 4,134; weekend audits excluded. | yes |
| dev3-chart-bar12-1/q3/clean/A | Jul | July | yes |
| dev3-chart-bar12-1/q3/clean/C1 | Jul | March | no |
| dev3-chart-bar12-1/q3/clean/C2 | Jul | July | yes |
| dev3-chart-bar12-1/q1/jpeg-only/C2 | 739 | UNREADABLE | no |
| dev3-chart-bar12-1/q2/jpeg-only/A | 4,134 | Inspection sample: n = 4,134; weekend audits excluded. | yes |
| dev3-chart-bar12-1/q3/jpeg-only/A | Jul | July | yes |
| dev3-chart-bar12-1/q3/jpeg-only/C1 | Jul | March | no |
| dev3-chart-bar12-1/q3/jpeg-only/C2 | Jul | July | yes |
| dev3-chart-bar12-1/q2/downscale-only/A | 4,134 | Inspection sample: n = 4,134; weekend audits excluded. | yes |
| dev3-chart-bar12-1/q2/downscale-only/C1 | 4,134 | UNREADABLE | no |
| dev3-chart-bar12-1/q2/downscale-only/C2 | 4,134 | Inspection sample = 4,154; weekend audits excluded. | no |
| dev3-chart-bar12-1/q3/downscale-only/C1 | Jul | UNREADABLE | no |
| dev3-chart-bar12-1/q3/downscale-only/C2 | Jul | July | yes |
| dev3-chart-bar12-1/q2/combined/A | 4,134 | Inspection sample = 4,154; weekend audits excluded. | no |
| dev3-chart-bar12-1/q2/combined/E | 4,134 | Inspection sample = 4,134. | yes |
| dev3-chart-bar12-1/q2/combined/C1 | 4,134 | UNREADABLE | no |
| dev3-chart-bar12-1/q2/combined/C2 | 4,134 | Inspection sample = 4,154 weekend audits excluded. | no |
| dev3-chart-bar12-1/q3/combined/C1 | Jul | UNREADABLE | no |
| dev3-chart-bar12-2/q2/clean/A | 3,347 | Inspection sample: n = 3,347; weekend audits excluded. | yes |
| dev3-chart-bar12-2/q3/clean/C1 | Aug | UNREADABLE | no |
| dev3-chart-bar12-2/q3/clean/C2 | Aug | August | yes |
| dev3-chart-bar12-2/q1/jpeg-only/C2 | 391 | 172 | no |
| dev3-chart-bar12-2/q2/jpeg-only/A | 3,347 | Inspection sample: n = 3,347; weekend audits excluded. | yes |
| dev3-chart-bar12-2/q2/jpeg-only/C2 | 3,347 | Inspection sample n = 3,347. | yes |
| dev3-chart-bar12-2/q3/jpeg-only/A | Aug | August | yes |
| dev3-chart-bar12-2/q3/jpeg-only/C1 | Aug | UNREADABLE | no |
| dev3-chart-bar12-2/q3/jpeg-only/C2 | Aug | August | yes |
| dev3-chart-bar12-2/q2/downscale-only/A | 3,347 | Inspection sample size: n = 3,347; weekend audits excluded. | yes |
| dev3-chart-bar12-2/q2/downscale-only/E | 3,347 | 5,347 | no |
| dev3-chart-bar12-2/q2/downscale-only/C1 | 3,347 | 929 | no |
| dev3-chart-bar12-2/q2/downscale-only/C2 | 3,347 | Inspection sample n = 5,947; weekend audits excluded. | no |
| dev3-chart-bar12-2/q3/downscale-only/C1 | Aug | UNREADABLE | no |
| dev3-chart-bar12-2/q3/downscale-only/C2 | Aug | August | yes |
| dev3-chart-bar12-2/q1/combined/C2 | 391 | 172 | no |
| dev3-chart-bar12-2/q2/combined/A | 3,347 | Inspection sample: n = 3,517, weekend audits excluded. | no |
| dev3-chart-bar12-2/q2/combined/E | 3,347 | Inspection sample = 5,357. | no |
| dev3-chart-bar12-2/q2/combined/C1 | 3,347 | 929 | no |
| dev3-chart-bar12-2/q2/combined/C2 | 3,347 | Inspection sample = n = 3,247, weekend audits excluded. | no |
| dev3-chart-bar12-2/q3/combined/A | Aug | August | yes |
| dev3-chart-bar12-2/q3/combined/C1 | Aug | UNREADABLE | no |
| dev3-chart-bar12-2/q3/combined/C2 | Aug | August | yes |
| dev3-chart-line-small-1/q1/clean/C2 | 83.2 | UNREADABLE | no |
| dev3-chart-line-small-1/q1/jpeg-only/C2 | 83.2 | UNREADABLE | no |
| dev3-chart-line-small-1/q1/downscale-only/C2 | 83.2 | UNREADABLE | no |
| dev3-chart-line-small-1/q1/combined/C2 | 83.2 | UNREADABLE | no |
| dev3-chart-line-small-1/q3/combined/E | 10:18 | 10:10 | no |
| dev3-chart-line-small-1/q3/combined/C2 | 10:18 | 10:10 | no |
| dev3-chart-line-small-2/q1/clean/C2 | 83.0 | UNREADABLE | no |
| dev3-chart-line-small-2/q1/jpeg-only/C2 | 83.0 | UNREADABLE | no |
| dev3-chart-line-small-2/q1/downscale-only/C2 | 83.0 | UNREADABLE | no |
| dev3-chart-line-small-2/q1/combined/C2 | 83.0 | UNREADABLE | no |
| dev3-chart-line-small-2/q3/combined/A | 16:26 | 10:25 | no |
| dev3-chart-line-small-2/q3/combined/E | 16:26 | 15:35 | no |
| dev3-chart-line-small-2/q3/combined/C1 | 16:26 | 10:25 | no |
| dev3-chart-line-small-2/q3/combined/C2 | 16:26 | 15:35 | no |
| dev3-ui-settings-dense-1/q1/clean/C2 | On | UNREADABLE | no |
| dev3-ui-settings-dense-1/q2/clean/A | 9718 | Firmware 7.8.12 (build 9176) | no |
| dev3-ui-settings-dense-1/q2/clean/C1 | 9718 | Firmware 7.8.12 (build 9178) | no |
| dev3-ui-settings-dense-1/q2/clean/C2 | 9718 | Build 9178 | no |
| dev3-ui-settings-dense-1/q1/jpeg-only/C2 | On | UNREADABLE | no |
| dev3-ui-settings-dense-1/q2/jpeg-only/A | 9718 | Firmware 7.8.12 (build 9178) | no |
| dev3-ui-settings-dense-1/q2/jpeg-only/C1 | 9718 | Build 9176 | no |
| dev3-ui-settings-dense-1/q2/jpeg-only/C2 | 9718 | Firmware 7.8.12 (build 9178) | no |
| dev3-ui-settings-dense-1/q2/downscale-only/A | 9718 | Firmware 7.8.12 (build 9176) | no |
| dev3-ui-settings-dense-1/q2/downscale-only/C1 | 9718 | Build 9174 | no |
| dev3-ui-settings-dense-1/q2/downscale-only/C2 | 9718 | Firmware 7.8.2 (build 9174) | no |
| dev3-ui-settings-dense-1/q3/downscale-only/C1 | 12.2 GB | UNREADABLE | no |
| dev3-ui-settings-dense-1/q3/downscale-only/C2 | 12.2 GB | 12.22 GB | no |
| dev3-ui-settings-dense-1/q2/combined/A | 9718 | Firmware 7.4.12 (build 9178) | no |
| dev3-ui-settings-dense-1/q2/combined/E | 9718 | Firmware 7.8.42 (build 9718) | yes |
| dev3-ui-settings-dense-1/q2/combined/C1 | 9718 | Build 9878 | no |
| dev3-ui-settings-dense-1/q2/combined/C2 | 9718 | Firmware 7.4.12 (build 8178) | no |
| dev3-ui-settings-dense-1/q3/combined/E | 12.2 GB | 17.2 GB | no |
| dev3-ui-settings-dense-1/q3/combined/C1 | 12.2 GB | UNREADABLE | no |
| dev3-ui-settings-dense-1/q3/combined/C2 | 12.2 GB | 12.72 GB | no |
| dev3-ui-settings-dense-2/q1/clean/C2 | On | UNREADABLE | no |
| dev3-ui-settings-dense-2/q2/jpeg-only/A | 5779 | Firmware 7.7.49 (build 5779) | yes |
| dev3-ui-settings-dense-2/q1/downscale-only/C2 | On | UNREADABLE | no |
| dev3-ui-settings-dense-2/q2/downscale-only/C1 | 5779 | 579 | no |
| dev3-ui-settings-dense-2/q3/downscale-only/C1 | 91.4 GB | UNREADABLE | no |
| dev3-ui-settings-dense-2/q1/combined/C2 | On | UNREADABLE | no |
| dev3-ui-settings-dense-2/q2/combined/A | 5779 | Build 5379 | no |
| dev3-ui-settings-dense-2/q2/combined/E | 5779 | 2779 | no |
| dev3-ui-settings-dense-2/q2/combined/C1 | 5779 | Build 9379 | no |
| dev3-ui-settings-dense-2/q2/combined/C2 | 5779 | Build 5379 | no |
| dev3-ui-settings-dense-2/q3/combined/C1 | 91.4 GB | UNREADABLE | no |
| dev3-ui-settings-dense-2/q3/combined/C2 | 91.4 GB | 61.4 GB | no |
| dev3-ui-dashboard-dense-1/q1/clean/A | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q1/clean/C1 | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q3/clean/A | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/clean/C1 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/clean/C2 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q1/jpeg-only/A | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q1/jpeg-only/C1 | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q3/jpeg-only/A | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/jpeg-only/C1 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/jpeg-only/C2 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q1/downscale-only/A | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q1/downscale-only/C1 | 79 | 70 | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/A | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/C1 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/C2 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q1/combined/A | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q1/combined/E | 79 | 72 | no |
| dev3-ui-dashboard-dense-1/q1/combined/C1 | 79 | 20 | no |
| dev3-ui-dashboard-dense-1/q1/combined/C2 | 79 | 28 | no |
| dev3-ui-dashboard-dense-1/q3/combined/A | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/combined/C1 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/combined/C2 | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-2/q1/jpeg-only/A | 95 | 35 | no |
| dev3-ui-dashboard-dense-2/q1/downscale-only/C1 | 95 | 35 | no |
| dev3-ui-dashboard-dense-2/q1/combined/A | 95 | 99 | no |
| dev3-ui-dashboard-dense-2/q1/combined/E | 95 | 96 | no |
| dev3-ui-dashboard-dense-2/q1/combined/C1 | 95 | 99 | no |
| dev3-ui-dashboard-dense-2/q3/combined/A | 06:50 | 06:53 | no |
| dev3-ui-dashboard-dense-2/q3/combined/C1 | 06:50 | 06:53 | no |
| dev3-ui-dashboard-dense-2/q3/combined/C2 | 06:50 | 06:31 | no |
| dev3-doc-invoice-dense-1/q1/downscale-only/C1R | INV-76587-C | INV/76587-C | no |
| dev3-doc-invoice-dense-2/q1/combined/C1R | INV-73897-E | INV-12897-E | no |
| dev3-doc-memo-dense-1/q1/downscale-only/C1R | ZT-9005-M19 | ZT-5905-M19 | no |
| dev3-doc-memo-dense-1/q1/combined/C1R | ZT-9005-M19 | Ref: JT-2025-MTR | no |
| dev3-doc-memo-dense-2/q1/downscale-only/C1R | ZT-3066-P84 | ZT-3066-PM | no |
| dev3-doc-memo-dense-2/q1/combined/C1R | ZT-3066-P84 | XT-2068-PM | no |
| dev3-chart-bar12-1/q3/clean/C1R | Jul | March | no |
| dev3-chart-bar12-1/q3/jpeg-only/C1R | Jul | March | no |
| dev3-chart-bar12-1/q2/downscale-only/C1R | 4,134 | Inspection sample: n = 4,134; weekend audits excluded. | yes |
| dev3-chart-bar12-1/q2/combined/C1R | 4,134 | Inspection sample = 4,154; weekend audits excluded. | no |
| dev3-chart-bar12-2/q3/jpeg-only/C1R | Aug | August | yes |
| dev3-chart-bar12-2/q2/downscale-only/C1R | 3,347 | 929 | no |
| dev3-chart-bar12-2/q2/combined/C1R | 3,347 | 929 | no |
| dev3-chart-bar12-2/q3/combined/C1R | Aug | August | yes |
| dev3-chart-line-small-2/q3/combined/C1R | 16:26 | 10:25 | no |
| dev3-ui-settings-dense-1/q2/clean/C1R | 9718 | Firmware 7.8.12 (build 9178) | no |
| dev3-ui-settings-dense-1/q2/jpeg-only/C1R | 9718 | Build 9176 | no |
| dev3-ui-settings-dense-1/q2/downscale-only/C1R | 9718 | Build 9174 | no |
| dev3-ui-settings-dense-1/q2/combined/C1R | 9718 | Build 9878 | no |
| dev3-ui-settings-dense-2/q2/downscale-only/C1R | 5779 | 579 | no |
| dev3-ui-settings-dense-2/q2/combined/C1R | 5779 | Build 9379 | no |
| dev3-ui-dashboard-dense-1/q1/clean/C1R | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q3/clean/C1R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q1/jpeg-only/C1R | 79 | 10 | no |
| dev3-ui-dashboard-dense-1/q3/jpeg-only/C1R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q1/downscale-only/C1R | 79 | 70 | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/C1R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q1/combined/C1R | 79 | 20 | no |
| dev3-ui-dashboard-dense-1/q3/combined/C1R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-2/q1/downscale-only/C1R | 95 | 35 | no |
| dev3-ui-dashboard-dense-2/q1/combined/C1R | 95 | 99 | no |
| dev3-ui-dashboard-dense-2/q3/combined/C1R | 06:50 | 06:53 | no |
| dev3-doc-invoice-dense-1/q1/combined/C2R | INV-76587-C | INV-75587-C | no |
| dev3-doc-invoice-dense-2/q1/combined/C2R | INV-73897-E | INV-73697-E | no |
| dev3-doc-memo-dense-1/q1/clean/C2R | ZT-9005-M19 | Ref: ZT-6905-MT9 | no |
| dev3-doc-memo-dense-1/q2/clean/C2R | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q1/jpeg-only/C2R | ZT-9005-M19 | Ref: ZT-6905-M19 | no |
| dev3-doc-memo-dense-1/q2/jpeg-only/C2R | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q1/downscale-only/C2R | ZT-9005-M19 | Ref: ZT-905-M19 | no |
| dev3-doc-memo-dense-1/q2/downscale-only/C2R | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-1/q1/combined/C2R | ZT-9005-M19 | Ref. ZT-0905-M10 | no |
| dev3-doc-memo-dense-1/q2/combined/C2R | C-231 | Room: C-231 | yes |
| dev3-doc-memo-dense-2/q1/clean/C2R | ZT-3066-P84 | Ref: ZT-3066-P84 | yes |
| dev3-doc-memo-dense-2/q2/clean/C2R | D-488 | Room: D-488 | yes |
| dev3-doc-memo-dense-2/q1/jpeg-only/C2R | ZT-3066-P84 | Ref: ZT-3066-P84 | yes |
| dev3-doc-memo-dense-2/q2/jpeg-only/C2R | D-488 | Room: D-488 | yes |
| dev3-doc-memo-dense-2/q1/downscale-only/C2R | ZT-3066-P84 | Ref: ZT-3068-P84 | no |
| dev3-doc-memo-dense-2/q2/downscale-only/C2R | D-488 | Room: D-488 | yes |
| dev3-doc-memo-dense-2/q1/combined/C2R | ZT-3066-P84 | XT-0986-PM | no |
| dev3-doc-memo-dense-2/q2/combined/C2R | D-488 | Room D-488. | yes |
| dev3-chart-bar12-1/q2/clean/C2R | 4,134 | Inspection sample: n = 4,134; weekend audits excluded. | yes |
| dev3-chart-bar12-1/q3/clean/C2R | Jul | July | yes |
| dev3-chart-bar12-1/q3/jpeg-only/C2R | Jul | July | yes |
| dev3-chart-bar12-1/q2/downscale-only/C2R | 4,134 | Inspection sample = 4,154; weekend audits excluded. | no |
| dev3-chart-bar12-1/q3/downscale-only/C2R | Jul | July | yes |
| dev3-chart-bar12-1/q2/combined/C2R | 4,134 | Inspection sample = 4,154 weekend audits excluded. | no |
| dev3-chart-bar12-2/q3/clean/C2R | Aug | August | yes |
| dev3-chart-bar12-2/q1/jpeg-only/C2R | 391 | 172 | no |
| dev3-chart-bar12-2/q2/jpeg-only/C2R | 3,347 | Inspection sample n = 3,347. | yes |
| dev3-chart-bar12-2/q3/jpeg-only/C2R | Aug | August | yes |
| dev3-chart-bar12-2/q2/downscale-only/C2R | 3,347 | Inspection sample n = 5,947; weekend audits excluded. | no |
| dev3-chart-bar12-2/q3/downscale-only/C2R | Aug | August | yes |
| dev3-chart-bar12-2/q1/combined/C2R | 391 | 172 | no |
| dev3-chart-bar12-2/q2/combined/C2R | 3,347 | Inspection sample = n = 3,247, weekend audits excluded. | no |
| dev3-chart-bar12-2/q3/combined/C2R | Aug | August | yes |
| dev3-chart-line-small-1/q3/combined/C2R | 10:18 | 10:10 | no |
| dev3-chart-line-small-2/q3/combined/C2R | 16:26 | 15:35 | no |
| dev3-ui-settings-dense-1/q2/clean/C2R | 9718 | Build 9178 | no |
| dev3-ui-settings-dense-1/q2/jpeg-only/C2R | 9718 | Firmware 7.8.12 (build 9178) | no |
| dev3-ui-settings-dense-1/q2/downscale-only/C2R | 9718 | Firmware 7.8.2 (build 9174) | no |
| dev3-ui-settings-dense-1/q3/downscale-only/C2R | 12.2 GB | 12.22 GB | no |
| dev3-ui-settings-dense-1/q2/combined/C2R | 9718 | Firmware 7.4.12 (build 8178) | no |
| dev3-ui-settings-dense-1/q3/combined/C2R | 12.2 GB | 12.72 GB | no |
| dev3-ui-settings-dense-2/q2/combined/C2R | 5779 | Build 5379 | no |
| dev3-ui-settings-dense-2/q3/combined/C2R | 91.4 GB | 61.4 GB | no |
| dev3-ui-dashboard-dense-1/q3/clean/C2R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/jpeg-only/C2R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/C2R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-1/q1/combined/C2R | 79 | 28 | no |
| dev3-ui-dashboard-dense-1/q3/combined/C2R | 20:01 | 20:11 | no |
| dev3-ui-dashboard-dense-2/q3/combined/C2R | 06:50 | 06:31 | no |
