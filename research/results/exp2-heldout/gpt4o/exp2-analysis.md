# exp2-held-gpt4o — experiment 2 family-level analysis (pre-registration amendment 1)

Set exp2-heldout, 36 families, content-match QA success, family bootstrap 10,000 (seed 20261016). not_started: 0.

| hypothesis | comparison | difference [95% CI] | verdict |
|---|---|---|---|
| H1 (primary) | D−A (margin −5%p, tokens D 635 vs A 824) | -6.9%p [-15.3, 0.7] | not supported |
| H2 | D−C | +6.3%p [1.4, 12.5] | descriptive |
| H3 | C−B | -11.8%p [-22.9, -2.1] | descriptive |

D re-request rate: 11/144. Exploratory Dp (pre-amendment D rule, no verdict): Dp−A -6.3%p [-15.3, 0.7]; Dp−C +6.9%p [0.7, 13.9].

| arm | accuracy (family mean over conditions) | mean input tokens | mean cost |
|---|---|---|---|
| A | 85.4% | 824 | $0.00210 |
| B | 84.0% | 824 | $0.00210 |
| C | 72.2% | 572 | $0.00146 |
| D | 78.5% | 635 | $0.00162 |
| E | 89.6% | 374 | $0.00097 |
| Dp | 79.2% | 629 | $0.00161 |

| condition | A | B | C | D | E | Dp | D−A | D−C | D re-requests / assigned | Dp no-window / unreadable |
|---|---|---|---|---|---|---|---|---|---|---|
| clean | 88.9% | 91.7% | 83.3% | 88.9% | 100.0% | 83.3% | +0.0%p [-11.1, 11.1] | +5.6%p [0.0, 13.9] | 2 / 36 | 10 / 1 |
| jpeg-only | 88.9% | 91.7% | 83.3% | 88.9% | 100.0% | 86.1% | +0.0%p [-11.1, 11.1] | +5.6%p [0.0, 13.9] | 2 / 36 | 10 / 2 |
| downscale-only | 91.7% | 83.3% | 63.9% | 75.0% | 91.7% | 83.3% | -16.7%p [-30.6, -5.6] | +11.1%p [2.8, 22.2] | 4 / 36 | 12 / 4 |
| combined | 72.2% | 69.4% | 58.3% | 61.1% | 66.7% | 63.9% | -11.1%p [-22.2, -2.8] | +2.8%p [0.0, 8.3] | 3 / 36 | 14 / 3 |

Layout base (18 families): A 86.1%, B 83.3%, C 75.0%, D 81.9%, E 90.3%, Dp 86.1%; D−A -4.2%p [-11.1, 4.2].
Layout v2 (18 families): A 84.7%, B 84.7%, C 69.4%, D 75.0%, E 88.9%, Dp 72.2%; D−A -9.7%p [-25.0, 4.2].
Domain document (12): A 79.2%, B 81.3%, C 70.8%, D 79.2%, E 89.6%, Dp 75.0%.
Domain chart (12): A 95.8%, B 95.8%, C 75.0%, D 83.3%, E 91.7%, Dp 83.3%.
Domain ui (12): A 81.3%, B 75.0%, C 70.8%, D 72.9%, E 87.5%, Dp 79.2%.
