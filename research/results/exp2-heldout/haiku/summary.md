# exp2-held-haiku summary (exp2-heldout)

Exploratory development run. 36 slots per cell; no significance claims.

Accuracy cells are strict exact match / content match.

| condition | A acc | B acc | C acc | D acc | E acc | Dp acc | A tokens | B tokens | C tokens | D tokens | E tokens | Dp tokens | A bytes | B bytes | C bytes | D bytes | E bytes | Dp bytes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean | 75% / 89% | 78% / 89% | 75% / 81% | 81% / 89% | 94% / 100% | 78% / 86% | 1,625 | 1,625 | 742 | 878 | 167 | 878 | 151,556 | 104,128 | 31,235 | 31,235 | 5,144 | 54,474 |
| jpeg-only | 78% / 89% | 75% / 89% | 72% / 81% | 78% / 89% | 97% / 100% | 83% / 92% | 1,625 | 1,625 | 731 | 867 | 167 | 867 | 123,998 | 104,954 | 30,546 | 30,546 | 5,574 | 47,966 |
| downscale-only | 64% / 75% | 67% / 78% | 50% / 58% | 58% / 69% | 67% / 67% | 56% / 67% | 1,097 | 1,097 | 476 | 629 | 91 | 629 | 85,626 | 55,391 | 17,574 | 17,574 | 2,020 | 39,464 |
| combined | 64% / 72% | 64% / 72% | 50% / 53% | 56% / 61% | 64% / 64% | 56% / 61% | 1,097 | 1,097 | 534 | 686 | 91 | 686 | 41,900 | 48,473 | 20,490 | 20,490 | 2,244 | 26,260 |

Content accuracy, small text vs normal: A 63% / 100%, B 64% / 100%, C 60% / 76%, D 67% / 88%, E 65% / 100%, Dp 65% / 88%

Content accuracy by domain: A: document 83%, chart 96%, ui 65%; B: document 81%, chart 96%, ui 69%; C: document 69%, chart 73%, ui 63%; D: document 81%, chart 85%, ui 65%; E: document 83%, chart 83%, ui 81%; Dp: document 83%, chart 85%, ui 60%

| condition | C matched | evidence covered (of matched) | D fallback / assigned | mean D-C (content) |
|---|---|---|---|---|
| clean | 26 | 19 | 3 / 36 | 0.083 |
| jpeg-only | 26 | 19 | 3 / 36 | 0.083 |
| downscale-only | 24 | 16 | 5 / 36 | 0.111 |
| combined | 22 | 14 | 5 / 36 | 0.083 |

Accounting: prompt tokens minus tile-rule image prediction ranged 55..67 (values: 55, 56, 57, 58, 59, 60, 61, 62, 63, 65, 66, 67).

Calls 720, cost $0.6406.

## Strict mismatches

| slot | gold | answer | content match |
|---|---|---|---|
| exp2-heldout-doc-invoice-dense-1/q1/downscale-only/E | INV-11380-E | INV-117330-E | no |
| exp2-heldout-doc-invoice-dense-1/q1/combined/E | INV-11380-E | INV-17380-E | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/jpeg-only/B | INV-89472-B | INV-88472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/jpeg-only/C | INV-89472-B | INV-88472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/jpeg-only/D | INV-89472-B | INV-88472-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/A | INV-89472-B | INV-004723-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/B | INV-89472-B | INV-004723-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/E | INV-89472-B | NV-89472-0 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/C | INV-89472-B | INV-004723-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/D | INV-89472-B | INV-004723-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/A | INV-89472-B | INV-0847216 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/B | INV-89472-B | INV-0847216 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/E | INV-89472-B | INV-894527-0 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/C | INV-89472-B | INV-0847216 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/D | INV-89472-B | INV-0847216 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/clean/C | $16,636.57 | UNREADABLE

The image shows only a partial table with three line items visible, but the total amount for the entire invoice is not shown in the visible portion of the image. | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/jpeg-only/C | $16,636.57 | UNREADABLE

The image shows only partial data from what appears to be an invoice or price list. While individual line totals are visible (1,558.73, 1,041 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/downscale-only/C | $16,636.57 | 4,346.40 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/downscale-only/D | $16,636.57 | 4,346.40 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/combined/C | $16,636.57 | To find the total amount on the invoice, I need to add up all the line totals:

1,558.73 + 1,041.42 + 1,745 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/combined/D | $16,636.57 | To find the total amount on the invoice, I need to add up all the line totals:

1,558.73 + 1,041.42 + 1,745 | no |
| exp2-heldout-doc-memo-dense-1/q1/clean/A | ZT-8730-B92 | ZT-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/clean/B | ZT-8730-B92 | ZT-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/jpeg-only/A | ZT-8730-B92 | Z7-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/jpeg-only/B | ZT-8730-B92 | Z7-8730-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/A | ZT-8730-B92 | ZT-673-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/B | ZT-8730-B92 | ZT-673-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/E | ZT-8730-B92 | Z7-4370-892 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/C | ZT-8730-B92 | ZT-8732-692 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/D | ZT-8730-B92 | ZT-8732-692 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/A | ZT-8730-B92 | D-402 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/B | ZT-8730-B92 | Ref: ZT-873-892 (quote this reference in all correspondence) | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/E | ZT-8730-B92 | 27-473-893 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/C | ZT-8730-B92 | Ref: ZT-873-892 (quote this reference in all correspondence) | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/D | ZT-8730-B92 | Ref: ZT-873-892 (quote this reference in all correspondence) | no |
| exp2-heldout-doc-memo-dense-2/q2/downscale-only/C | D-401 | UNREADABLE

The image quality is too poor and the text is too blurry to clearly identify which specific room is assigned in the notice. | no |
| exp2-heldout-doc-memo-dense-2/q2/combined/C | D-401 | UNREADABLE

The image quality is too poor and the text is too blurry to clearly identify which specific room is assigned in the notice. | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/clean/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/jpeg-only/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/A | QR-4704-C21 | Ref: DR-4704-C21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/B | QR-4704-C21 | Ref: DR-4704-C21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/E | QR-4704-C21 | Ref: DR-0174-C21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/D | QR-4704-C21 | Ref: DR-4704-C21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/A | QR-4704-C21 | Ref: DR-4704-G21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/B | QR-4704-C21 | Ref: DR-4704-G21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/E | QR-4704-C21 | Ref: GR-4704 C21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/C | QR-4704-C21 | UNREADABLE | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/D | QR-4704-C21 | Ref: DR-4704-G21 | no |
| exp2-heldout-chart-bar12-2/q2/downscale-only/B | 9,073 | 5,073 | no |
| exp2-heldout-chart-bar12-2/q2/downscale-only/E | 9,073 | 5,073 | no |
| exp2-heldout-chart-bar12-2/q2/downscale-only/C | 9,073 | UNREADABLE

The text under the chart is too blurry and small to read clearly in this image. | no |
| exp2-heldout-chart-bar12-2/q2/combined/C | 9,073 | UNREADABLE

The text under the chart is too blurry and small to read clearly in this image. | no |
| exp2-heldout-chart-bar12-3/q3/clean/A | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/clean/B | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/clean/C | Sep | UNREADABLE

The image shows only the title "Monthly Inspection Count" but the actual chart/bars are not visible in the provided image. | no |
| exp2-heldout-chart-bar12-3/q3/clean/D | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/jpeg-only/A | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/jpeg-only/B | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/jpeg-only/C | Sep | UNREADABLE

The image shows only the title "Monthly Inspection Count" but the actual chart/bars are not visible in the provided image. | no |
| exp2-heldout-chart-bar12-3/q3/jpeg-only/D | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/downscale-only/A | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/downscale-only/B | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/downscale-only/C | Sep | UNREADABLE

The image shows a title "Monthly Inspection Count" but the actual chart/bars are not visible in the provided image, making it impossible to determine which month has the tall | no |
| exp2-heldout-chart-bar12-3/q3/downscale-only/D | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/combined/A | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/combined/B | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/combined/C | Sep | UNREADABLE

The image shows a title "Monthly Inspection Count" but the actual chart/bars are not visible in the provided image, making it impossible to determine which month has the tall | no |
| exp2-heldout-chart-bar12-3/q3/combined/D | Sep | September | yes |
| exp2-heldout-chart-bar12-5-v2/q2/downscale-only/A | 3,375 | 5.37% | no |
| exp2-heldout-chart-bar12-5-v2/q2/downscale-only/E | 3,375 | 5,373 | no |
| exp2-heldout-chart-bar12-5-v2/q2/downscale-only/C | 3,375 | 0.37% weekend audits excluded | no |
| exp2-heldout-chart-bar12-5-v2/q2/downscale-only/D | 3,375 | 0.37% weekend audits excluded | no |
| exp2-heldout-chart-bar12-5-v2/q2/combined/A | 3,375 | 5,375 | no |
| exp2-heldout-chart-bar12-5-v2/q2/combined/B | 3,375 | 5,375 | no |
| exp2-heldout-chart-bar12-5-v2/q2/combined/E | 3,375 | 3,373 | no |
| exp2-heldout-chart-bar12-5-v2/q2/combined/C | 3,375 | 2,375 | no |
| exp2-heldout-chart-bar12-5-v2/q2/combined/D | 3,375 | 9,375 | no |
| exp2-heldout-chart-bar12-6-v2/q3/clean/C | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/clean/D | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/jpeg-only/C | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/jpeg-only/D | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/downscale-only/C | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/downscale-only/D | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/combined/C | Mar | Jan | no |
| exp2-heldout-chart-bar12-6-v2/q3/combined/D | Mar | Jan | no |
| exp2-heldout-chart-line-small-1/q1/clean/A | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/clean/B | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/clean/E | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/clean/C | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/clean/D | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/jpeg-only/A | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/jpeg-only/B | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/jpeg-only/C | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/jpeg-only/D | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/downscale-only/A | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/downscale-only/B | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/downscale-only/C | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/downscale-only/D | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/combined/A | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/combined/B | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/combined/E | 87.8 | 87.0 | no |
| exp2-heldout-chart-line-small-1/q1/combined/C | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/combined/D | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/clean/A | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/clean/B | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/clean/E | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/clean/C | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/clean/D | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/jpeg-only/A | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/jpeg-only/B | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/jpeg-only/E | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/jpeg-only/C | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/jpeg-only/D | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/downscale-only/A | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/downscale-only/B | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/downscale-only/E | 78.4 | Peak 76.1 | no |
| exp2-heldout-chart-line-small-4-v2/q1/downscale-only/C | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/downscale-only/D | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/combined/A | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/combined/B | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/combined/E | 78.4 | Peak 76.1 | no |
| exp2-heldout-chart-line-small-4-v2/q1/combined/C | 78.4 | Peak 74.4 | no |
| exp2-heldout-chart-line-small-4-v2/q1/combined/D | 78.4 | Peak 74.4 | no |
| exp2-heldout-chart-line-small-6-v2/q3/downscale-only/E | 21:57 | 23:57 | no |
| exp2-heldout-chart-line-small-6-v2/q3/combined/E | 21:57 | 23:57 | no |
| exp2-heldout-ui-settings-dense-2/q2/clean/A | 8373 | 6373 | no |
| exp2-heldout-ui-settings-dense-2/q2/jpeg-only/B | 8373 | 7.3.53 (build 8373) | yes |
| exp2-heldout-ui-settings-dense-2/q2/jpeg-only/C | 8373 | 7.3.53 (build 8373) | yes |
| exp2-heldout-ui-settings-dense-2/q2/jpeg-only/D | 8373 | 7.3.53 (build 8373) | yes |
| exp2-heldout-ui-settings-dense-2/q2/downscale-only/A | 8373 | 5173 | no |
| exp2-heldout-ui-settings-dense-2/q2/downscale-only/E | 8373 | 6373 | no |
| exp2-heldout-ui-settings-dense-2/q2/combined/E | 8373 | 4373 | no |
| exp2-heldout-ui-settings-dense-3/q3/clean/A | 94.9 GB | 94.9 GB of 128 GB | yes |
| exp2-heldout-ui-settings-dense-3/q3/clean/B | 94.9 GB | 94.9 GB of 128 GB | yes |
| exp2-heldout-ui-settings-dense-3/q3/jpeg-only/A | 94.9 GB | 94.9 GB of 128 GB | yes |
| exp2-heldout-ui-settings-dense-3/q3/jpeg-only/B | 94.9 GB | 94.9 GB of 128 GB | yes |
| exp2-heldout-ui-settings-dense-3/q3/downscale-only/C | 94.9 GB | UNREADABLE

The image shows a sidebar menu with options for "Battery," "Storage," and "About," but it does not display the actual storage usage amount or unit. | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/A | 94.9 GB | 34.9 GB of 128 GB | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/B | 94.9 GB | 34.9 GB of 128 GB | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/E | 94.9 GB | 34.9 GB | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/C | 94.9 GB | UNREADABLE

The image shows a sidebar menu with options for "Battery," "Storage," and "About," but it does not display the actual storage usage amount or unit. | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/D | 94.9 GB | 34.9 GB of 128 GB | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/jpeg-only/A | 2098 | 2096 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/A | 2098 | 2086 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/B | 2098 | 2086 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/E | 2098 | 5.4.68 (build 2008) | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/C | 2098 | 2086 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/D | 2098 | 2086 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/A | 2098 | 2080 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/B | 2098 | 2080 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/E | 2098 | 2026 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/C | 2098 | 2080 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/D | 2098 | 2080 | no |
| exp2-heldout-ui-settings-dense-6-v2/q3/clean/A | 48.9 GB | 48.9 GB of 256 GB | yes |
| exp2-heldout-ui-settings-dense-6-v2/q3/downscale-only/A | 48.9 GB | 48.9 GB of 256 GB | yes |
| exp2-heldout-ui-settings-dense-6-v2/q3/downscale-only/B | 48.9 GB | 48.9 GB of 256 GB | yes |
| exp2-heldout-ui-settings-dense-6-v2/q3/downscale-only/C | 48.9 GB | 48.9 GB of 256 GB | yes |
| exp2-heldout-ui-settings-dense-6-v2/q3/downscale-only/D | 48.9 GB | 48.9 GB of 256 GB | yes |
| exp2-heldout-ui-settings-dense-6-v2/q3/combined/A | 48.9 GB | 48.8 GB of 256 GB | no |
| exp2-heldout-ui-settings-dense-6-v2/q3/combined/B | 48.9 GB | 48.8 GB of 256 GB | no |
| exp2-heldout-ui-settings-dense-6-v2/q3/combined/C | 48.9 GB | 48.8 GB of 256 GB | no |
| exp2-heldout-ui-settings-dense-6-v2/q3/combined/D | 48.9 GB | 48.8 GB of 256 GB | no |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/A | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/B | 64 | 24 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/C | 64 | 24 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/D | 64 | 24 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/A | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/B | 64 | 24 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/C | 64 | 24 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/D | 64 | 24 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/A | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/B | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/E | 64 | 1 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/C | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/D | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/combined/A | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/combined/B | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/combined/E | 64 | 1 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/combined/C | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/combined/D | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/clean/B | 06:55 | 00:55 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/downscale-only/A | 06:55 | 06:41 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/downscale-only/B | 06:55 | 06:41 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/downscale-only/C | 06:55 | 06:41 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/downscale-only/D | 06:55 | 06:41 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/A | 06:55 | 06:04 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/B | 06:55 | 06:04 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/C | 06:55 | 06:04 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/D | 06:55 | 06:04 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/A | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/B | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/C | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/D | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/A | 57 | 1 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/B | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/C | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/D | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/A | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/B | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/E | 57 | 1 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/C | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/D | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/A | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/B | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/E | 57 | 1 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/C | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/D | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/clean/C | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/clean/D | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/downscale-only/C | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/downscale-only/D | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/combined/C | 58 | 56 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/combined/D | 58 | 56 | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/downscale-only/Dp | INV-89472-B | INV-004723-B | no |
| exp2-heldout-doc-invoice-dense-4-v2/q1/combined/Dp | INV-89472-B | INV-0847216 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/downscale-only/Dp | $16,636.57 | 4,346.40 | no |
| exp2-heldout-doc-invoice-dense-6-v2/q3/combined/Dp | $16,636.57 | To find the total amount on the invoice, I need to add up all the line totals:

1,558.73 + 1,041.42 + 1,745 | no |
| exp2-heldout-doc-memo-dense-1/q1/downscale-only/Dp | ZT-8730-B92 | ZT-8732-692 | no |
| exp2-heldout-doc-memo-dense-1/q1/combined/Dp | ZT-8730-B92 | D-402 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/downscale-only/Dp | QR-4704-C21 | Ref: DR-4704-C21 | no |
| exp2-heldout-doc-memo-dense-4-v2/q1/combined/Dp | QR-4704-C21 | Ref: DR-4704-G21 | no |
| exp2-heldout-chart-bar12-3/q3/clean/Dp | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/jpeg-only/Dp | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/downscale-only/Dp | Sep | September | yes |
| exp2-heldout-chart-bar12-3/q3/combined/Dp | Sep | September | yes |
| exp2-heldout-chart-bar12-5-v2/q2/downscale-only/Dp | 3,375 | 0.37% weekend audits excluded | no |
| exp2-heldout-chart-bar12-5-v2/q2/combined/Dp | 3,375 | 2,375 | no |
| exp2-heldout-chart-bar12-6-v2/q3/clean/Dp | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/jpeg-only/Dp | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/downscale-only/Dp | Mar | Feb | no |
| exp2-heldout-chart-bar12-6-v2/q3/combined/Dp | Mar | Jan | no |
| exp2-heldout-chart-line-small-1/q1/clean/Dp | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/jpeg-only/Dp | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/downscale-only/Dp | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-1/q1/combined/Dp | 87.8 | Peak 87.8 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/clean/Dp | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/jpeg-only/Dp | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/downscale-only/Dp | 78.4 | Peak 78.4 | yes |
| exp2-heldout-chart-line-small-4-v2/q1/combined/Dp | 78.4 | Peak 74.4 | no |
| exp2-heldout-ui-settings-dense-2/q2/clean/Dp | 8373 | 6373 | no |
| exp2-heldout-ui-settings-dense-2/q2/downscale-only/Dp | 8373 | 5173 | no |
| exp2-heldout-ui-settings-dense-3/q3/combined/Dp | 94.9 GB | 34.9 GB of 128 GB | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/downscale-only/Dp | 2098 | 2086 | no |
| exp2-heldout-ui-settings-dense-5-v2/q2/combined/Dp | 2098 | 2080 | no |
| exp2-heldout-ui-settings-dense-6-v2/q3/downscale-only/Dp | 48.9 GB | 48.9 GB of 256 GB | yes |
| exp2-heldout-ui-settings-dense-6-v2/q3/combined/Dp | 48.9 GB | 48.8 GB of 256 GB | no |
| exp2-heldout-ui-dashboard-dense-1/q1/clean/Dp | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/jpeg-only/Dp | 64 | 94 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/downscale-only/Dp | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-1/q1/combined/Dp | 64 | 4 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/downscale-only/Dp | 06:55 | 06:41 | no |
| exp2-heldout-ui-dashboard-dense-3/q3/combined/Dp | 06:55 | 06:04 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/clean/Dp | 57 | 4 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/jpeg-only/Dp | 57 | 1 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/downscale-only/Dp | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-4-v2/q1/combined/Dp | 57 | 471 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/clean/Dp | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/downscale-only/Dp | 58 | 38 | no |
| exp2-heldout-ui-dashboard-dense-5-v2/q2/combined/Dp | 58 | 56 | no |
