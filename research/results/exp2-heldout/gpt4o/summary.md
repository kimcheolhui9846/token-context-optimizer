# exp2-held-gpt4o summary (exp2-heldout)

Exploratory development run. 36 slots per cell; no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | B acc | C acc | D acc | E acc | Dp acc | A tokens | B tokens | C tokens | D tokens | E tokens | Dp tokens | A bytes | B bytes | C bytes | D bytes | E bytes | Dp bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean | 81% / 89% | 83% / 92% | 83% / 83% | 86% / 89% | 97% / 100% | 81% / 83% | 824 | 824 | 603 | 648 | 404 | 626 | 151,556 | 104,128 | 31,235 | 31,235 | 5,144 | 49,162 |
| jpeg-only | 78% / 89% | 81% / 92% | 83% / 83% | 86% / 89% | 100% / 100% | 83% / 86% | 824 | 824 | 593 | 639 | 404 | 639 | 123,998 | 104,954 | 30,546 | 30,546 | 5,574 | 44,817 |
| downscale-only | 83% / 92% | 75% / 83% | 64% / 64% | 69% / 75% | 86% / 92% | 78% / 83% | 824 | 824 | 532 | 624 | 343 | 624 | 85,626 | 55,391 | 17,574 | 17,574 | 2,020 | 32,453 |
| combined | 69% / 72% | 58% / 69% | 53% / 58% | 56% / 61% | 64% / 67% | 58% / 64% | 824 | 824 | 560 | 629 | 343 | 629 | 41,900 | 48,473 | 20,490 | 20,490 | 2,244 | 22,630 |

Content accuracy, small text vs normal: A 71% / 100%, B 68% / 100%, C 63% / 82%, D 69% / 88%, E 79% / 100%, Dp 72% / 86%

Content accuracy by domain: A: document 79%, chart 96%, ui 81%; B: document 81%, chart 96%, ui 75%; C: document 71%, chart 75%, ui 71%; D: document 79%, chart 83%, ui 73%; E: document 90%, chart 92%, ui 88%; Dp: document 75%, chart 83%, ui 79%

| condition | C matched | evidence covered (of matched) | D fallback / assigned | mean D-C (content) |
|---|---|---|---|---|
| clean | 26 | 19 | 2 / 36 | 0.056 |
| jpeg-only | 26 | 19 | 2 / 36 | 0.056 |
| downscale-only | 24 | 16 | 4 / 36 | 0.111 |
| combined | 22 | 14 | 3 / 36 | 0.028 |

Accounting: prompt tokens minus tile-rule image prediction ranged 54..66 (values: 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 66).

Calls 720, cost $1.1883.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| exp2-heldout-doc-invoice-dense-1/q1/downscale-only/B | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/downscale-only/C | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/downscale-only/D | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/combined/A | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/combined/B | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/combined/E | INV-11380-E | INV-11580-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/combined/C | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/combined/D | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-2/q2/combined/B | 1,091.85 | The amount for the line item "Bearing 6204" is **1,091.85**. | yes |
| exp2-heldout-doc-invoice-dense-4-v2/q1/clean/A | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/jpeg-only/A | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/A | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/B | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/C | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/D | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/A | INV-89472-B | INV-884728 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/B | INV-89472-B | INV-984729 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/E | INV-89472-B | INV-80472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/C | INV-89472-B | INV-984729 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/D | INV-89472-B | INV-984729 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/clean/C | $16,636.57 | The total amount on the invoice is not visible in the provided image. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/jpeg-only/C | $16,636.57 | The total amount on the invoice is not visible in the provided image. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/jpeg-only/D | $16,636.57 | The total amount on the invoice is not visible in the provided image. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/downscale-only/C | $16,636.57 | The total amount on the invoice is **4,345.40**. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/downscale-only/D | $16,636.57 | The total amount on the invoice is **4,345.40**. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/combined/C | $16,636.57 | The total amount on the invoice is **4,345.40**. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/combined/D | $16,636.57 | The total amount on the invoice is **4,345.40**. | no |
| exp2-heldout-doc-memo-dense-1/q1/clean/A | ZT-8730-B92 | Ref: ZT-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/clean/B | ZT-8730-B92 | Ref: ZT-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/jpeg-only/A | ZT-8730-B92 | Ref: ZT-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/jpeg-only/B | ZT-8730-B92 | Ref: ZT-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/A | ZT-8730-B92 | ZT-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/B | ZT-8730-B92 | Ref: ZT-4730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/E | ZT-8730-B92 | ZT-6730-882 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/C | ZT-8730-B92 | ZT-8730-982 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/D | ZT-8730-B92 | ZT-8730-982 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/A | ZT-8730-B92 | Ref. #ZT-4783-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/B | ZT-8730-B92 | Ref: JT-4783-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/E | ZT-8730-B92 | Ref. 72-8788-8824 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/C | ZT-8730-B92 | Ref: JT-4783-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/D | ZT-8730-B92 | Ref: JT-4783-892 | no |
| exp2-heldout-doc-memo-dense-2/q2/clean/A | D-401 | Room: D-401 | yes |
| exp2-heldout-doc-memo-dense-2/q2/clean/B | D-401 | Room: D-401 | yes |
| exp2-heldout-doc-memo-dense-2/q2/jpeg-only/A | D-401 | Room: D-401 | yes |
| exp2-heldout-doc-memo-dense-2/q2/jpeg-only/B | D-401 | Room: D-401 | yes |
| exp2-heldout-doc-memo-dense-2/q2/downscale-only/A | D-401 | Room: D-401 | yes |
| exp2-heldout-doc-memo-dense-2/q2/downscale-only/B | D-401 | Room: D-401 | yes |
| exp2-heldout-doc-memo-dense-2/q2/combined/B | D-401 | Room D-401 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/clean/A | QR-4704-C21 | Ref: QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/clean/B | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/clean/E | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/clean/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/clean/D | QR-4704-C21 | Ref: QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/jpeg-only/A | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/jpeg-only/B | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/jpeg-only/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/jpeg-only/D | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/A | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/B | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/E | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/D | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/A | QR-4704-C21 | Ref: GR-4704-021 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/B | QR-4704-C21 | Ref: QRA-774-621 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/E | QR-4704-C21 | Ref: QBA-1784-C21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/D | QR-4704-C21 | Ref: GR-A704-621 | no |
| exp2-heldout-doc-memo-dense-5-v2/q2/combined/C | G-140 | Room G-140 | yes |
| exp2-heldout-doc-memo-dense-5-v2/q2/combined/D | G-140 | Room G-140 | yes |
| exp2-heldout-chart-bar12-2/q2/clean/A | 9,073 | Inspection sample n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/clean/B | 9,073 | Inspection sample: n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/jpeg-only/A | 9,073 | Inspection sample = n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/jpeg-only/B | 9,073 | Inspection sample = n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/downscale-only/A | 9,073 | Inspection sample: n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/downscale-only/B | 9,073 | Inspection sample: n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/downscale-only/E | 9,073 | n = 9,073 | yes |
| exp2-heldout-chart-bar12-2/q2/downscale-only/C | 9,073 | UNREADABLE | no |
| exp2-heldout-chart-bar12-2/q2/downscale-only/D | 9,073 | Inspection sample: n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/combined/A | 9,073 | Inspection sample = n = 9,173, weekend audits excluded. | no |
| exp2-heldout-chart-bar12-2/q2/combined/B | 9,073 | Inspection sample = 9,973, weekend audits excluded. | no |
| exp2-heldout-chart-bar12-2/q2/combined/E | 9,073 | Inspection sample = 9,073. | yes |
| exp2-heldout-chart-bar12-2/q2/combined/C | 9,073 | 837 | no |
| exp2-heldout-chart-bar12-2/q2/combined/D | 9,073 | 837 | no |
| exp2-heldout-chart-bar12-3/q3/clean/C | Sep | April | no |
| exp2-heldout-chart-bar12-3/q3/clean/D | Sep | June | no |
| exp2-heldout-chart-bar12-3/q3/jpeg-only/C | Sep | UNREADABLE | no |
| exp2-heldout-chart-bar12-3/q3/downscale-only/C | Sep | UNREADABLE | no |
| exp2-heldout-chart-bar12-3/q3/combined/C | Sep | UNREADABLE | no |
| exp2-heldout-chart-bar12-5-v2/q2/jpeg-only/A | 3,375 | n = 3,375 | yes |
| exp2-heldout-chart-bar12-5-v2/q2/downscale-only/E | 3,375 | n = 5,375 | no |
| exp2-heldout-chart-bar12-5-v2/q2/combined/E | 3,375 | 2,575 | no |
| exp2-heldout-chart-bar12-6-v2/q3/clean/C | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/clean/D | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/jpeg-only/C | Mar | Jan | no |
| exp2-heldout-chart-bar12-6-v2/q3/jpeg-only/D | Mar | Jan | no |
| exp2-heldout-chart-bar12-6-v2/q3/downscale-only/C | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/downscale-only/D | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/combined/B | Mar | March | yes |
| exp2-heldout-chart-bar12-6-v2/q3/combined/C | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/combined/D | Mar | Feb | no |
| exp2-heldout-chart-line-small-1/q1/combined/E | 87.8 | 57.8 | no |
| exp2-heldout-chart-line-small-1/q1/combined/C | 87.8 | 67.8 | no |
| exp2-heldout-chart-line-small-1/q1/combined/D | 87.8 | 67.8 | no |
| exp2-heldout-chart-line-small-3/q3/combined/E | 20:10 | 06:10 | no |
| exp2-heldout-chart-line-small-6-v2/q3/combined/A | 21:57 | 02:57 | no |
| exp2-heldout-chart-line-small-6-v2/q3/combined/B | 21:57 | 02:57 | no |
| exp2-heldout-chart-line-small-6-v2/q3/combined/C | 21:57 | 02:57 | no |
| exp2-heldout-chart-line-small-6-v2/q3/combined/D | 21:57 | 02:57 | no |
| exp2-heldout-ui-settings-dense-2/q2/combined/A | 8373 | Firmware 7.3.5.0 (build-5837) | no |
| exp2-heldout-ui-settings-dense-2/q2/combined/B | 8373 | Firmware 7.3.52 (0145.8873) | no |
| exp2-heldout-ui-settings-dense-2/q2/combined/E | 8373 | Build-5321 | no |
| exp2-heldout-ui-settings-dense-2/q2/combined/C | 8373 | Firmware 7.3.52 (0145.8873) | no |
| exp2-heldout-ui-settings-dense-2/q2/combined/D | 8373 | Firmware 7.3.52 (0145.8873) | no |
| exp2-heldout-ui-settings-dense-3/q3/downscale-only/C | 94.9 GB | UNREADABLE | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/A | 94.9 GB | 34.5 GB | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/B | 94.9 GB | 34.5 GB | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/C | 94.9 GB | UNREADABLE | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/D | 94.9 GB | 34.5 GB | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/clean/B | 2098 | 2096 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/jpeg-only/B | 2098 | Build 2098 | yes |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/B | 2098 | 2008 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/E | 2098 | 2068 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/C | 2098 | 2008 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/D | 2098 | 2008 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/A | 2098 | Firmware 6.4.5A (Build 2098) | yes |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/B | 2098 | Firmware 4.4.5A (Build 2098) | yes |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/E | 2098 | 4.1.50 (build 20885) | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/C | 2098 | Firmware 4.4.5A (Build 2098) | yes |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/D | 2098 | Firmware 4.4.5A (Build 2098) | yes |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/A | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/C | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/D | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/A | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/B | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/C | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/D | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/B | 64 | 44 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/C | 64 | 44 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/D | 64 | 44 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/combined/E | 64 | 84 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/B | 06:55 | 06:45 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/C | 06:55 | 06:45 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/D | 06:55 | 06:45 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/A | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/B | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/C | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/D | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/A | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/B | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/C | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/D | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/A | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/B | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/C | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/D | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/A | 57 | 17 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/B | 57 | 17 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/E | 57 | 87 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/C | 57 | 17 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/D | 57 | 17 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/downscale-only/C | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/downscale-only/D | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-6-v2/q3/combined/A | 03:44 | 03:14 | no |
| exp2-heldout-ui-dashboard-dense-6-v2/q3/combined/B | 03:44 | 03:14 | no |
| exp2-heldout-ui-dashboard-dense-6-v2/q3/combined/E | 03:44 | 05:44 | no |
| exp2-heldout-ui-dashboard-dense-6-v2/q3/combined/C | 03:44 | 03:14 | no |
| exp2-heldout-ui-dashboard-dense-6-v2/q3/combined/D | 03:44 | 03:14 | no |
| exp2-heldout-doc-invoice-dense-1/q1/combined/Dp | INV-11380-E | INV-11306-E | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/clean/Dp | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/jpeg-only/Dp | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/Dp | INV-89472-B | INV-98472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/Dp | INV-89472-B | INV-884728 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/clean/Dp | $16,636.57 | The total amount on the invoice is not visible in the provided image. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/jpeg-only/Dp | $16,636.57 | The total amount on the invoice is not visible in the provided image. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/downscale-only/Dp | $16,636.57 | The total amount on the invoice is **4,345.40**. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/combined/Dp | $16,636.57 | The total amount on the invoice is **4,345.40**. | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/Dp | ZT-8730-B92 | ZT-8730-982 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/Dp | ZT-8730-B92 | Ref. #ZT-4783-892 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/clean/Dp | QR-4704-C21 | Ref: QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/jpeg-only/Dp | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/Dp | QR-4704-C21 | Ref. QR-4704-C21 | yes |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/Dp | QR-4704-C21 | Ref: GR-4704-021 | no |
| exp2-heldout-doc-memo-dense-5-v2/q2/combined/Dp | G-140 | Room G-140 | yes |
| exp2-heldout-chart-bar12-2/q2/downscale-only/Dp | 9,073 | Inspection sample: n = 9,073, weekend audits excluded. | yes |
| exp2-heldout-chart-bar12-2/q2/combined/Dp | 9,073 | 837 | no |
| exp2-heldout-chart-bar12-3/q3/clean/Dp | Sep | April | no |
| exp2-heldout-chart-bar12-6-v2/q3/clean/Dp | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/jpeg-only/Dp | Mar | Jan | no |
| exp2-heldout-chart-bar12-6-v2/q3/downscale-only/Dp | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/combined/Dp | Mar | Feb | no |
| exp2-heldout-chart-line-small-1/q1/combined/Dp | 87.8 | 67.8 | no |
| exp2-heldout-chart-line-small-6-v2/q3/combined/Dp | 21:57 | 02:57 | no |
| exp2-heldout-ui-settings-dense-2/q2/combined/Dp | 8373 | Firmware 7.3.5.0 (build-5837) | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/Dp | 94.9 GB | 34.5 GB | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/Dp | 2098 | Firmware 6.4.5A (Build 2098) | yes |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/Dp | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/Dp | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/Dp | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/Dp | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/Dp | 57 | 37 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/Dp | 57 | 17 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/downscale-only/Dp | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-6-v2/q3/combined/Dp | 03:44 | 03:14 | no |
