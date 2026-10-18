# exp2-cal-gpt4o — experiment 2 family-level analysis (DRAFT)

Set exp2-calibration, 12 families, content-match QA success, family bootstrap 10,000 (seed 20261016). not_started: 0.

| arm | accuracy (family mean over conditions) | mean input tokens | mean cost |
|---|---|---|---|
| A | 79.2% | 823 | $0.00210 |
| B | 68.8% | 823 | $0.00210 |
| C | 75.0% | 593 | $0.00152 |
| D | 85.4% | 593 | $0.00151 |
| E | 83.3% | 384 | $0.00099 |

Paired (family): D−C +10.4%p [0.0, 25.0]; C−B +6.3%p [-4.2, 20.8]; D−A +6.3%p [0.0, 18.8].

| condition | A | B | C | D | E | D−C | D−A | D fallback (no window / unreadable / assigned) |
|---|---|---|---|---|---|---|---|---|
| clean | 91.7% | 75.0% | 91.7% | 100.0% | 100.0% | +8.3%p [0.0, 25.0] | +8.3%p [0.0, 25.0] | 3 / 0 / 12 |
| jpeg-only | 83.3% | 83.3% | 83.3% | 100.0% | 100.0% | +16.7%p [0.0, 41.7] | +16.7%p [0.0, 41.7] | 3 / 0 / 12 |
| downscale-only | 83.3% | 66.7% | 75.0% | 83.3% | 75.0% | +8.3%p [0.0, 25.0] | +0.0%p [-25.0, 25.0] | 4 / 0 / 12 |
| combined | 58.3% | 50.0% | 50.0% | 58.3% | 58.3% | +8.3%p [0.0, 25.0] | +0.0%p [0.0, 0.0] | 5 / 0 / 12 |

Layout base (12 families): A 79.2%, B 68.8%, C 75.0%, D 85.4%, E 83.3%; D−C +10.4%p [0.0, 25.0].
Domain document (4): A 62.5%, B 62.5%, C 75.0%, D 81.3%, E 75.0%.
Domain chart (4): A 87.5%, B 75.0%, C 81.3%, D 87.5%, E 87.5%.
Domain ui (4): A 87.5%, B 68.8%, C 68.8%, D 87.5%, E 87.5%.
