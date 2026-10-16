# pilot-003-haiku summary (dev3)

Exploratory development run. 36 slots per cell; no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | C1 acc | C2 acc | E acc | C1R acc | C2R acc | A tokens | C1 tokens | C2 tokens | E tokens | C1R tokens | C2R tokens | A bytes | C1 bytes | C2 bytes | E bytes | C1R bytes | C2R bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean | 69% / 94% | 81% / 86% | — / — | 94% / 100% | 83% / 89% | — / — | 1,625 | 662 | — | 173 | 707 | — | 153,259 | 27,799 | 153,259 | 5,295 | 29,350 | 153,259 |
| jpeg-only | 69% / 92% | 81% / 89% | — / — | 94% / 100% | 83% / 92% | — / — | 1,625 | 692 | — | 173 | 738 | — | 124,953 | 29,324 | 124,953 | 5,807 | 31,412 | 124,953 |
| downscale-only | 56% / 69% | 44% / 47% | — / — | 67% / 67% | 56% / 64% | — / — | 1,097 | 442 | — | 93 | 625 | — | 85,074 | 16,041 | 85,074 | 2,041 | 34,478 | 85,074 |
| combined | 53% / 64% | 42% / 42% | — / — | 64% / 64% | 50% / 58% | — / — | 1,097 | 490 | — | 93 | 704 | — | 41,573 | 18,550 | 41,573 | 2,271 | 28,045 | 41,573 |

Content accuracy, small text vs normal: A 60% / 100%, C1 49% / 83%, C2 — / —, E 67% / 99%, C1R 57% / 94%, C2R — / —

Content accuracy by domain: A: document 81%, chart 88%, ui 71%; C1: document 75%, chart 63%, ui 60%; C2: document —, chart —, ui —; E: document 83%, chart 83%, ui 81%; C1R: document 83%, chart 75%, ui 69%; C2R: document —, chart —, ui —

| condition | C1 matched | C1 covered | C2 boxed | C2 covered | retries C1R | retries C2R |
|---|---|---|---|---|---|---|
| clean | 27/36 | 21 | 0/36 | 0 | 1 | 0 |
| jpeg-only | 26/36 | 20 | 0/36 | 0 | 1 | 0 |
| downscale-only | 26/36 | 18 | 0/36 | 0 | 6 | 0 |
| combined | 24/36 | 16 | 0/36 | 0 | 7 | 0 |

Accounting: prompt tokens minus tile-rule image prediction ranged 55..67 (values: 55, 57, 58, 59, 60, 61, 62, 63, 65, 66, 67).

Calls 432, cost $0.3164.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| dev3-doc-invoice-dense-1/q1/downscale-only/A | INV-76587-C | INV-16597-C | no |
| dev3-doc-invoice-dense-1/q1/downscale-only/E | INV-76587-C | INV-7654C | no |
| dev3-doc-invoice-dense-1/q1/downscale-only/C1 | INV-76587-C | INV-16597-C | no |
| dev3-doc-invoice-dense-1/q1/combined/A | INV-76587-C | INV-76597-C | no |
| dev3-doc-invoice-dense-1/q1/combined/E | INV-76587-C | INV-7024847-C | no |
| dev3-doc-invoice-dense-1/q1/combined/C1 | INV-76587-C | INV-16597-C | no |
| dev3-doc-invoice-dense-2/q1/downscale-only/A | INV-73897-E | INV-73997-E | no |
| dev3-doc-invoice-dense-2/q1/downscale-only/E | INV-73897-E | INV-7328FE | no |
| dev3-doc-invoice-dense-2/q1/downscale-only/C1 | INV-73897-E | INV-73997-E | no |
| dev3-doc-invoice-dense-2/q1/combined/A | INV-73897-E | INV-15391-E | no |
| dev3-doc-invoice-dense-2/q1/combined/E | INV-73897-E | 390-7330T-E | no |
| dev3-doc-invoice-dense-2/q1/combined/C1 | INV-73897-E | INV-15391-E | no |
| dev3-doc-memo-dense-1/q1/clean/A | ZT-9005-M19 | Ref. ZT-9005-M19 | yes |
| dev3-doc-memo-dense-1/q1/jpeg-only/A | ZT-9005-M19 | Ref. ZT-9005-M19 | yes |
| dev3-doc-memo-dense-1/q1/downscale-only/A | ZT-9005-M19 | ZT-6905-M19 | no |
| dev3-doc-memo-dense-1/q1/downscale-only/E | ZT-9005-M19 | ZY-9003-M19 | no |
| dev3-doc-memo-dense-1/q1/downscale-only/C1 | ZT-9005-M19 | 27-6005-M10 | no |
| dev3-doc-memo-dense-1/q2/downscale-only/C1 | C-231 | UNREADABLE

The image quality and text are too blurry and overlapping to clearly identify which specific room is assigned in the notice. | no |
| dev3-doc-memo-dense-1/q1/combined/A | ZT-9005-M19 | ZT-9905-M19 | no |
| dev3-doc-memo-dense-1/q1/combined/E | ZT-9005-M19 | ZY-9035-M19 | no |
| dev3-doc-memo-dense-1/q1/combined/C1 | ZT-9005-M19 | ZT-9905-M19 | no |
| dev3-doc-memo-dense-1/q2/combined/C1 | C-231 | UNREADABLE

The text in the image is heavily repeated and overlapping, making it impossible to clearly identify which specific room is assigned in the notice. | no |
| dev3-doc-memo-dense-2/q1/jpeg-only/A | ZT-3066-P84 | ZT-3066-PN4 | no |
| dev3-doc-memo-dense-2/q1/downscale-only/A | ZT-3066-P84 | ZT-2066-PM | no |
| dev3-doc-memo-dense-2/q1/downscale-only/E | ZT-3066-P84 | ZT-1008-PM | no |
| dev3-doc-memo-dense-2/q1/downscale-only/C1 | ZT-3066-P84 | ZT-3066-PN | no |
| dev3-doc-memo-dense-2/q2/downscale-only/C1 | D-488 | UNREADABLE

The image shows repeated text about budget, approval, and supply review processes, but does not clearly specify which room is assigned in the notice. The text is blurry and | no |
| dev3-doc-memo-dense-2/q1/combined/A | ZT-3066-P84 | Ref: ZT-2066-PM (quote this reference in all correspondence) | no |
| dev3-doc-memo-dense-2/q1/combined/E | ZT-3066-P84 | ZT-2008-PM | no |
| dev3-doc-memo-dense-2/q1/combined/C1 | ZT-3066-P84 | 27-3066-PN4 | no |
| dev3-doc-memo-dense-2/q2/combined/C1 | D-488 | UNREADABLE

The image shows repeated text about budget, supply review, and approval processes, but does not clearly specify which room is assigned in the notice. The text is blurry and | no |
| dev3-chart-bar12-1/q2/clean/A | 4,134 | n = 4,134; weekend audits excluded | yes |
| dev3-chart-bar12-1/q3/clean/A | Jul | July | yes |
| dev3-chart-bar12-1/q3/clean/C1 | Jul | June | no |
| dev3-chart-bar12-1/q2/jpeg-only/A | 4,134 | n = 4,134; weekend audits excluded | yes |
| dev3-chart-bar12-1/q3/jpeg-only/A | Jul | July | yes |
| dev3-chart-bar12-1/q3/jpeg-only/C1 | Jul | June | no |
| dev3-chart-bar12-1/q2/downscale-only/A | 4,134 | n = 4,134, weekend audits excluded | yes |
| dev3-chart-bar12-1/q2/downscale-only/E | 4,134 | 4,174 | no |
| dev3-chart-bar12-1/q2/downscale-only/C1 | 4,134 | UNREADABLE

The image shows a bar chart titled "Monthly Inspection Count" with two visible bars (960 and 892), but there is no visible inspection sample size notation shown under | no |
| dev3-chart-bar12-1/q3/downscale-only/A | Jul | July | yes |
| dev3-chart-bar12-1/q3/downscale-only/C1 | Jul | June | no |
| dev3-chart-bar12-1/q2/combined/A | 4,134 | n = 4,134, weekend audits excluded. | yes |
| dev3-chart-bar12-1/q2/combined/E | 4,134 | 4,124 | no |
| dev3-chart-bar12-1/q2/combined/C1 | 4,134 | UNREADABLE

The image shows a bar chart titled "Monthly Inspection Count" with two visible bars (960 and 892), but there is no inspection sample size notation visible under the | no |
| dev3-chart-bar12-1/q3/combined/A | Jul | July | yes |
| dev3-chart-bar12-1/q3/combined/C1 | Jul | The month with the tallest bar is the one showing 960 inspections. Based on the chart, this appears to be in the middle section of the displayed months.

However, I cannot | no |
| dev3-chart-bar12-2/q3/clean/C1 | Aug | UNREADABLE

The image shows a bar chart titled "Monthly Inspection Count" with one visible bar labeled "929", but the month label for this bar is not clearly readable in the provided | no |
| dev3-chart-bar12-2/q3/jpeg-only/C1 | Aug | UNREADABLE

The image shows a bar chart titled "Monthly Inspection Count" with one visible bar labeled "929", but the month label for this bar is not clearly readable in the image | no |
| dev3-chart-bar12-2/q2/downscale-only/C1 | 3,347 | 929 | no |
| dev3-chart-bar12-2/q3/downscale-only/A | Aug | August | yes |
| dev3-chart-bar12-2/q3/downscale-only/C1 | Aug | UNREADABLE

The image shows a bar chart titled "Monthly Inspection Count" with one visible bar labeled "929", but the month label for this bar is not clearly visible in the provided | no |
| dev3-chart-bar12-2/q1/combined/E | 391 | 381 | no |
| dev3-chart-bar12-2/q2/combined/C1 | 3,347 | 929 | no |
| dev3-chart-bar12-2/q3/combined/C1 | Aug | UNREADABLE

The image shows a bar chart titled "Monthly Inspection Count" with one visible bar labeled "929", but the month label for this bar is not clearly readable in the provided | no |
| dev3-chart-line-small-1/q1/clean/A | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q1/clean/E | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q1/jpeg-only/A | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q1/jpeg-only/E | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q1/jpeg-only/C1 | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q1/downscale-only/A | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q1/downscale-only/C1 | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q3/downscale-only/A | 10:18 | 10:15 | no |
| dev3-chart-line-small-1/q3/downscale-only/C1 | 10:18 | 10:15 | no |
| dev3-chart-line-small-1/q1/combined/A | 83.2 | Peak 63.2 | no |
| dev3-chart-line-small-1/q1/combined/E | 83.2 | Peak 63.2 | no |
| dev3-chart-line-small-1/q1/combined/C1 | 83.2 | Peak 63.2 | no |
| dev3-chart-line-small-1/q3/combined/A | 10:18 | 10:19 | no |
| dev3-chart-line-small-1/q3/combined/E | 10:18 | 10:19 | no |
| dev3-chart-line-small-1/q3/combined/C1 | 10:18 | 10:19 | no |
| dev3-chart-line-small-2/q1/clean/A | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/clean/E | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/clean/C1 | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/jpeg-only/A | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/jpeg-only/E | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/jpeg-only/C1 | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/downscale-only/A | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/downscale-only/E | 83.0 | 8.0 | no |
| dev3-chart-line-small-2/q3/downscale-only/A | 16:26 | 19:26 | no |
| dev3-chart-line-small-2/q3/downscale-only/E | 16:26 | 16:20 | no |
| dev3-chart-line-small-2/q3/downscale-only/C1 | 16:26 | 10:26 | no |
| dev3-chart-line-small-2/q1/combined/A | 83.0 | Peak 63.0 | no |
| dev3-chart-line-small-2/q1/combined/C1 | 83.0 | Peak 63.0 | no |
| dev3-chart-line-small-2/q3/combined/A | 16:26 | 10:36 | no |
| dev3-chart-line-small-2/q3/combined/E | 16:26 | 15:35 | no |
| dev3-chart-line-small-2/q3/combined/C1 | 16:26 | 10:36 | no |
| dev3-ui-settings-dense-1/q2/clean/A | 9718 | 7.8.12 (build 9718) | yes |
| dev3-ui-settings-dense-1/q2/clean/C1 | 9718 | 7.8.12 (build 9718) | yes |
| dev3-ui-settings-dense-1/q3/clean/A | 12.2 GB | 12.2 GB of 128 GB | yes |
| dev3-ui-settings-dense-1/q2/jpeg-only/A | 9718 | 7.8.12 (build 9718) | yes |
| dev3-ui-settings-dense-1/q2/jpeg-only/C1 | 9718 | 7.8.12 (build 9718) | yes |
| dev3-ui-settings-dense-1/q3/jpeg-only/A | 12.2 GB | 12.2 GB of 128 GB | yes |
| dev3-ui-settings-dense-1/q2/downscale-only/A | 9718 | 9716 | no |
| dev3-ui-settings-dense-1/q2/downscale-only/E | 9718 | 9716 | no |
| dev3-ui-settings-dense-1/q2/downscale-only/C1 | 9718 | 2716 | no |
| dev3-ui-settings-dense-1/q3/downscale-only/C1 | 12.2 GB | UNREADABLE

The image shows a sidebar menu with options for "Battery," "Storage," and "About," but it does not display the actual storage usage amount or unit. | no |
| dev3-ui-settings-dense-1/q2/combined/A | 9718 | 2718 | no |
| dev3-ui-settings-dense-1/q2/combined/E | 9718 | 9710 | no |
| dev3-ui-settings-dense-1/q2/combined/C1 | 9718 | 2718 | no |
| dev3-ui-settings-dense-1/q3/combined/A | 12.2 GB | 12.2 GB of 128 GB | yes |
| dev3-ui-settings-dense-1/q3/combined/C1 | 12.2 GB | UNREADABLE

The image shows a sidebar menu with options for "Battery," "Storage," and "About," but it does not display the actual storage usage amount or unit. | no |
| dev3-ui-settings-dense-2/q2/clean/A | 5779 | 7.7.49 (build 5779) | yes |
| dev3-ui-settings-dense-2/q2/clean/C1 | 5779 | 7.7.49 (build 5776) | no |
| dev3-ui-settings-dense-2/q3/clean/A | 91.4 GB | 91.4 GB of 128 GB | yes |
| dev3-ui-settings-dense-2/q3/jpeg-only/A | 91.4 GB | 91.4 GB of 128 GB | yes |
| dev3-ui-settings-dense-2/q2/downscale-only/E | 5779 | 5770 | no |
| dev3-ui-settings-dense-2/q3/downscale-only/C1 | 91.4 GB | UNREADABLE

The image shows a sidebar menu with options for "Battery," "Storage," and "About," but it does not display the actual storage usage amount or unit. | no |
| dev3-ui-settings-dense-2/q3/combined/A | 91.4 GB | 91.4 GB of 128 GB | yes |
| dev3-ui-settings-dense-2/q3/combined/C1 | 91.4 GB | UNREADABLE

The image shows a sidebar menu with options for "Battery," "Storage," and "About," but it does not display the actual storage usage amount or unit. | no |
| dev3-ui-dashboard-dense-1/q1/clean/A | 79 | 9 | no |
| dev3-ui-dashboard-dense-1/q1/clean/C1 | 79 | 9 | no |
| dev3-ui-dashboard-dense-1/q1/jpeg-only/A | 79 | 9 | no |
| dev3-ui-dashboard-dense-1/q1/jpeg-only/C1 | 79 | 9 | no |
| dev3-ui-dashboard-dense-1/q1/downscale-only/A | 79 | 4 | no |
| dev3-ui-dashboard-dense-1/q1/downscale-only/E | 79 | 1 | no |
| dev3-ui-dashboard-dense-1/q1/downscale-only/C1 | 79 | 4 | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/A | 20:01 | UNREADABLE

The image shows "Last sync 26/1" in the top right corner, but the specific time in HH:MM format is not clearly visible or readable in the | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/C1 | 20:01 | 20:41 | no |
| dev3-ui-dashboard-dense-1/q1/combined/A | 79 | 4 | no |
| dev3-ui-dashboard-dense-1/q1/combined/E | 79 | 1 | no |
| dev3-ui-dashboard-dense-1/q1/combined/C1 | 79 | 4 | no |
| dev3-ui-dashboard-dense-1/q3/combined/A | 20:01 | UNREADABLE

The image shows "Last sync 25/11" in the top right corner, but the specific time (HH:MM format) is not clearly visible or readable in | no |
| dev3-ui-dashboard-dense-1/q3/combined/C1 | 20:01 | UNREADABLE

The image shows "Last sync 25/01" in the top right corner, but the specific time (HH:MM format) is not clearly visible or readable in | no |
| dev3-ui-dashboard-dense-2/q1/clean/A | 95 | 94 | no |
| dev3-ui-dashboard-dense-2/q1/clean/C1 | 95 | 24 | no |
| dev3-ui-dashboard-dense-2/q1/jpeg-only/A | 95 | 94 | no |
| dev3-ui-dashboard-dense-2/q1/jpeg-only/C1 | 95 | 24 | no |
| dev3-ui-dashboard-dense-2/q1/downscale-only/A | 95 | 4 | no |
| dev3-ui-dashboard-dense-2/q1/downscale-only/E | 95 | 1 | no |
| dev3-ui-dashboard-dense-2/q1/downscale-only/C1 | 95 | 4 | no |
| dev3-ui-dashboard-dense-2/q3/downscale-only/A | 06:50 | 06:04 | no |
| dev3-ui-dashboard-dense-2/q3/downscale-only/E | 06:50 | 06:00 | no |
| dev3-ui-dashboard-dense-2/q3/downscale-only/C1 | 06:50 | 06:00 | no |
| dev3-ui-dashboard-dense-2/q1/combined/A | 95 | 4 | no |
| dev3-ui-dashboard-dense-2/q1/combined/E | 95 | 1 | no |
| dev3-ui-dashboard-dense-2/q1/combined/C1 | 95 | 4 | no |
| dev3-ui-dashboard-dense-2/q3/combined/A | 06:50 | 06:41 | no |
| dev3-ui-dashboard-dense-2/q3/combined/E | 06:50 | 06:30 | no |
| dev3-ui-dashboard-dense-2/q3/combined/C1 | 06:50 | 06:40 | no |
| dev3-doc-invoice-dense-1/q1/downscale-only/C1R | INV-76587-C | INV-16597-C | no |
| dev3-doc-invoice-dense-1/q1/combined/C1R | INV-76587-C | INV-16597-C | no |
| dev3-doc-invoice-dense-2/q1/downscale-only/C1R | INV-73897-E | INV-73997-E | no |
| dev3-doc-invoice-dense-2/q1/combined/C1R | INV-73897-E | INV-15391-E | no |
| dev3-doc-memo-dense-1/q1/downscale-only/C1R | ZT-9005-M19 | 27-6005-M10 | no |
| dev3-doc-memo-dense-1/q1/combined/C1R | ZT-9005-M19 | ZT-9905-M19 | no |
| dev3-doc-memo-dense-2/q1/downscale-only/C1R | ZT-3066-P84 | ZT-3066-PN | no |
| dev3-doc-memo-dense-2/q1/combined/C1R | ZT-3066-P84 | 27-3066-PN4 | no |
| dev3-chart-bar12-1/q3/clean/C1R | Jul | June | no |
| dev3-chart-bar12-1/q3/jpeg-only/C1R | Jul | June | no |
| dev3-chart-bar12-1/q2/downscale-only/C1R | 4,134 | n = 4,134, weekend audits excluded | yes |
| dev3-chart-bar12-1/q3/downscale-only/C1R | Jul | June | no |
| dev3-chart-bar12-1/q2/combined/C1R | 4,134 | n = 4,134, weekend audits excluded. | yes |
| dev3-chart-bar12-1/q3/combined/C1R | Jul | The month with the tallest bar is the one showing 960 inspections. Based on the chart, this appears to be in the middle section of the displayed months.

However, I cannot | no |
| dev3-chart-bar12-2/q2/downscale-only/C1R | 3,347 | 929 | no |
| dev3-chart-bar12-2/q3/downscale-only/C1R | Aug | August | yes |
| dev3-chart-bar12-2/q2/combined/C1R | 3,347 | 929 | no |
| dev3-chart-line-small-1/q1/jpeg-only/C1R | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q1/downscale-only/C1R | 83.2 | Peak 83.2 | yes |
| dev3-chart-line-small-1/q3/downscale-only/C1R | 10:18 | 10:15 | no |
| dev3-chart-line-small-1/q1/combined/C1R | 83.2 | Peak 63.2 | no |
| dev3-chart-line-small-1/q3/combined/C1R | 10:18 | 10:19 | no |
| dev3-chart-line-small-2/q1/clean/C1R | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q1/jpeg-only/C1R | 83.0 | Peak 83.0 | yes |
| dev3-chart-line-small-2/q3/downscale-only/C1R | 16:26 | 10:26 | no |
| dev3-chart-line-small-2/q1/combined/C1R | 83.0 | Peak 63.0 | no |
| dev3-chart-line-small-2/q3/combined/C1R | 16:26 | 10:36 | no |
| dev3-ui-settings-dense-1/q2/clean/C1R | 9718 | 7.8.12 (build 9718) | yes |
| dev3-ui-settings-dense-1/q2/jpeg-only/C1R | 9718 | 7.8.12 (build 9718) | yes |
| dev3-ui-settings-dense-1/q2/downscale-only/C1R | 9718 | 2716 | no |
| dev3-ui-settings-dense-1/q2/combined/C1R | 9718 | 2718 | no |
| dev3-ui-settings-dense-1/q3/combined/C1R | 12.2 GB | 12.2 GB of 128 GB | yes |
| dev3-ui-settings-dense-2/q2/clean/C1R | 5779 | 7.7.49 (build 5776) | no |
| dev3-ui-settings-dense-2/q3/combined/C1R | 91.4 GB | 91.4 GB of 128 GB | yes |
| dev3-ui-dashboard-dense-1/q1/clean/C1R | 79 | 9 | no |
| dev3-ui-dashboard-dense-1/q1/jpeg-only/C1R | 79 | 9 | no |
| dev3-ui-dashboard-dense-1/q1/downscale-only/C1R | 79 | 4 | no |
| dev3-ui-dashboard-dense-1/q3/downscale-only/C1R | 20:01 | 20:41 | no |
| dev3-ui-dashboard-dense-1/q1/combined/C1R | 79 | 4 | no |
| dev3-ui-dashboard-dense-1/q3/combined/C1R | 20:01 | UNREADABLE

The image shows "Last sync 25/11" in the top right corner, but the specific time (HH:MM format) is not clearly visible or readable in | no |
| dev3-ui-dashboard-dense-2/q1/clean/C1R | 95 | 24 | no |
| dev3-ui-dashboard-dense-2/q1/jpeg-only/C1R | 95 | 24 | no |
| dev3-ui-dashboard-dense-2/q1/downscale-only/C1R | 95 | 4 | no |
| dev3-ui-dashboard-dense-2/q3/downscale-only/C1R | 06:50 | 06:00 | no |
| dev3-ui-dashboard-dense-2/q1/combined/C1R | 95 | 4 | no |
| dev3-ui-dashboard-dense-2/q3/combined/C1R | 06:50 | 06:40 | no |
