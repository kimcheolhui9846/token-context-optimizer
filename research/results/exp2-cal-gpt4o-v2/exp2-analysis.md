# exp2-cal-gpt4o-v2 — experiment 2 family-level analysis (pre-registration amendment 1)

Set exp2-calibration, 12 families, content-match QA success, family bootstrap 10,000 (seed 20261016). not_started: 0.

| hypothesis | comparison | difference [95% CI] | verdict |
|---|---|---|---|
| H1 (primary) | D−A (margin −5%p, tokens D 593 vs A 823) | -4.2%p [-22.9, 14.6] | not supported |
| H2 | D−C | +0.0%p [0.0, 0.0] | descriptive |
| H3 | C−B | +6.3%p [-4.2, 20.8] | descriptive |

D re-request rate: 0/48. Exploratory Dp (pre-amendment D rule, no verdict): Dp−A +6.3%p [0.0, 18.8]; Dp−C +10.4%p [0.0, 25.0].

| arm | accuracy (family mean over conditions) | mean input tokens | mean cost |
|---|---|---|---|
| A | 79.2% | 823 | $0.00210 |
| B | 68.8% | 823 | $0.00210 |
| C | 75.0% | 593 | $0.00152 |
| D | 75.0% | 593 | $0.00152 |
| E | 83.3% | 384 | $0.00099 |
| Dp | 85.4% | 593 | $0.00151 |

| condition | A | B | C | D | E | Dp | D−A | D−C | D re-requests / assigned | Dp no-window / unreadable |
|---|---|---|---|---|---|---|---|---|---|---|
| clean | 91.7% | 75.0% | 91.7% | 91.7% | 100.0% | 100.0% | +0.0%p [-25.0, 25.0] | +0.0%p [0.0, 0.0] | 0 / 12 | 3 / 0 |
| jpeg-only | 83.3% | 83.3% | 83.3% | 83.3% | 100.0% | 100.0% | +0.0%p [-33.3, 33.3] | +0.0%p [0.0, 0.0] | 0 / 12 | 3 / 0 |
| downscale-only | 83.3% | 66.7% | 75.0% | 75.0% | 75.0% | 83.3% | -8.3%p [-33.3, 16.7] | +0.0%p [0.0, 0.0] | 0 / 12 | 4 / 0 |
| combined | 58.3% | 50.0% | 50.0% | 50.0% | 58.3% | 58.3% | -8.3%p [-25.0, 0.0] | +0.0%p [0.0, 0.0] | 0 / 12 | 5 / 0 |

Layout base (12 families): A 79.2%, B 68.8%, C 75.0%, D 75.0%, E 83.3%, Dp 85.4%; D−A -4.2%p [-22.9, 14.6].
Domain document (4): A 62.5%, B 62.5%, C 75.0%, D 75.0%, E 75.0%, Dp 81.3%.
Domain chart (4): A 87.5%, B 75.0%, C 81.3%, D 81.3%, E 87.5%, Dp 87.5%.
Domain ui (4): A 87.5%, B 68.8%, C 68.8%, D 68.8%, E 87.5%, Dp 87.5%.
