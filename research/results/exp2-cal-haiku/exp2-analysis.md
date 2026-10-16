# exp2-cal-haiku — experiment 2 family-level analysis (DRAFT)

Set exp2-calibration, 12 families, content-match QA success, family bootstrap 10,000 (seed 20261016). not_started: 0.

| arm | accuracy (family mean over conditions) | mean input tokens | mean cost |
|---|---|---|---|
| A | 77.1% | 1,360 | $0.00140 |
| B | 75.0% | 1,360 | $0.00140 |
| C | 66.7% | 606 | $0.00065 |
| D | 75.0% | 674 | $0.00072 |
| E | 77.1% | 134 | $0.00017 |

Paired (family): D−C +8.3%p [-2.1, 20.8]; C−B -8.3%p [-25.0, 8.3]; D−A -2.1%p [-14.6, 10.4].

| condition | A | B | C | D | E | D−C | D−A | D fallback (no window / unreadable / assigned) |
|---|---|---|---|---|---|---|---|---|
| clean | 75.0% | 83.3% | 91.7% | 83.3% | 100.0% | -8.3%p [-25.0, 0.0] | +8.3%p [0.0, 25.0] | 3 / 0 / 12 |
| jpeg-only | 75.0% | 66.7% | 75.0% | 83.3% | 100.0% | +8.3%p [0.0, 25.0] | +8.3%p [0.0, 25.0] | 3 / 0 / 12 |
| downscale-only | 83.3% | 75.0% | 50.0% | 75.0% | 50.0% | +25.0%p [0.0, 50.0] | -8.3%p [-25.0, 0.0] | 4 / 2 / 12 |
| combined | 75.0% | 75.0% | 50.0% | 58.3% | 58.3% | +8.3%p [0.0, 25.0] | -16.7%p [-41.7, 0.0] | 5 / 1 / 12 |

Layout base (12 families): A 77.1%, B 75.0%, C 66.7%, D 75.0%, E 77.1%; D−C +8.3%p [-2.1, 20.8].
Domain document (4): A 68.8%, B 56.3%, C 56.3%, D 81.3%, E 75.0%.
Domain chart (4): A 100.0%, B 100.0%, C 75.0%, D 81.3%, E 81.3%.
Domain ui (4): A 62.5%, B 68.8%, C 68.8%, D 62.5%, E 75.0%.
