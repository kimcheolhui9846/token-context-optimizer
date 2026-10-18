# exp2-held-haiku — experiment 2 family-level analysis (pre-registration amendment 1)

Set exp2-heldout, 36 families, content-match QA success, family bootstrap 10,000 (seed 20261016). not_started: 0.

| hypothesis | comparison | difference [95% CI] | verdict |
|---|---|---|---|
| H1 (primary) | D−A (margin −5%p, tokens D 765 vs A 1,361) | -4.2%p [-13.2, 3.5] | not supported |
| H2 | D−C | +9.0%p [2.8, 16.7] | descriptive |
| H3 | C−B | -13.9%p [-25.0, -3.5] | descriptive |

D re-request rate: 16/144. Exploratory Dp (pre-amendment D rule, no verdict): Dp−A -4.9%p [-13.2, 2.1]; Dp−C +8.3%p [0.7, 16.7].

| arm | accuracy (family mean over conditions) | mean input tokens | mean cost |
|---|---|---|---|
| A | 81.3% | 1,361 | $0.00140 |
| B | 81.9% | 1,361 | $0.00140 |
| C | 68.1% | 621 | $0.00067 |
| D | 77.1% | 765 | $0.00082 |
| E | 82.6% | 129 | $0.00016 |
| Dp | 76.4% | 765 | $0.00082 |

| condition | A | B | C | D | E | Dp | D−A | D−C | D re-requests / assigned | Dp no-window / unreadable |
|---|---|---|---|---|---|---|---|---|---|---|
| clean | 88.9% | 88.9% | 80.6% | 88.9% | 100.0% | 86.1% | +0.0%p [-11.1, 11.1] | +8.3%p [0.0, 19.4] | 3 / 36 | 10 / 3 |
| jpeg-only | 88.9% | 88.9% | 80.6% | 88.9% | 100.0% | 91.7% | +0.0%p [-11.1, 11.1] | +8.3%p [0.0, 19.4] | 3 / 36 | 10 / 3 |
| downscale-only | 75.0% | 77.8% | 58.3% | 69.4% | 66.7% | 66.7% | -5.6%p [-16.7, 5.6] | +11.1%p [2.8, 22.2] | 5 / 36 | 12 / 5 |
| combined | 72.2% | 72.2% | 52.8% | 61.1% | 63.9% | 61.1% | -11.1%p [-22.2, -2.8] | +8.3%p [0.0, 19.4] | 5 / 36 | 14 / 5 |

Layout base (18 families): A 81.9%, B 81.9%, C 75.0%, D 87.5%, E 84.7%, Dp 84.7%; D−A +5.6%p [0.0, 13.9].
Layout v2 (18 families): A 80.6%, B 81.9%, C 61.1%, D 66.7%, E 80.6%, Dp 68.1%; D−A -13.9%p [-29.2, -1.4].
Domain document (12): A 83.3%, B 81.3%, C 68.8%, D 81.3%, E 83.3%, Dp 83.3%.
Domain chart (12): A 95.8%, B 95.8%, C 72.9%, D 85.4%, E 83.3%, Dp 85.4%.
Domain ui (12): A 64.6%, B 68.8%, C 62.5%, D 64.6%, E 81.3%, Dp 60.4%.
