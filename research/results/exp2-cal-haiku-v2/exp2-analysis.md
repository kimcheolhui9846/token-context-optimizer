# exp2-cal-haiku-v2 — experiment 2 family-level analysis (pre-registration amendment 1)

Set exp2-calibration, 12 families, content-match QA success, family bootstrap 10,000 (seed 20261016). not_started: 0.

| hypothesis | comparison | difference [95% CI] | verdict |
|---|---|---|---|
| H1 (primary) | D−A (margin −5%p, tokens D 674 vs A 1,360) | -4.2%p [-18.8, 10.4] | not supported |
| H2 | D−C | +6.3%p [0.0, 16.7] | descriptive |
| H3 | C−B | -8.3%p [-25.0, 8.3] | descriptive |

D re-request rate: 3/48. Exploratory Dp (pre-amendment D rule, no verdict): Dp−A -2.1%p [-14.6, 10.4]; Dp−C +8.3%p [-2.1, 20.8].

| arm | accuracy (family mean over conditions) | mean input tokens | mean cost |
|---|---|---|---|
| A | 77.1% | 1,360 | $0.00140 |
| B | 75.0% | 1,360 | $0.00140 |
| C | 66.7% | 606 | $0.00065 |
| D | 72.9% | 674 | $0.00072 |
| E | 77.1% | 134 | $0.00017 |
| Dp | 75.0% | 674 | $0.00072 |

| condition | A | B | C | D | E | Dp | D−A | D−C | D re-requests / assigned | Dp no-window / unreadable |
|---|---|---|---|---|---|---|---|---|---|---|
| clean | 75.0% | 83.3% | 91.7% | 91.7% | 100.0% | 83.3% | +16.7%p [0.0, 41.7] | +0.0%p [0.0, 0.0] | 0 / 12 | 3 / 0 |
| jpeg-only | 75.0% | 66.7% | 75.0% | 75.0% | 100.0% | 83.3% | +0.0%p [-25.0, 25.0] | +0.0%p [0.0, 0.0] | 0 / 12 | 3 / 0 |
| downscale-only | 83.3% | 75.0% | 50.0% | 66.7% | 50.0% | 75.0% | -16.7%p [-41.7, 0.0] | +16.7%p [0.0, 41.7] | 2 / 12 | 4 / 2 |
| combined | 75.0% | 75.0% | 50.0% | 58.3% | 58.3% | 58.3% | -16.7%p [-41.7, 0.0] | +8.3%p [0.0, 25.0] | 1 / 12 | 5 / 1 |

Layout base (12 families): A 77.1%, B 75.0%, C 66.7%, D 72.9%, E 77.1%, Dp 75.0%; D−A -4.2%p [-18.8, 10.4].
Domain document (4): A 68.8%, B 56.3%, C 56.3%, D 68.8%, E 75.0%, Dp 81.3%.
Domain chart (4): A 100.0%, B 100.0%, C 75.0%, D 81.3%, E 81.3%, Dp 81.3%.
Domain ui (4): A 62.5%, B 68.8%, C 68.8%, D 68.8%, E 75.0%, Dp 62.5%.
