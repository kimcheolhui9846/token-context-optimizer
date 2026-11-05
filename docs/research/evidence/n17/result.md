# N-17 performance attempt 1

- Baseline: `46939f3913e2c16bbe9bbc402974208e86eb99d6`; measured product/tooling: `26cde59e0daa33dc59dfe793f8917b83623c5cc3`.
- Manifest preregistration commit: `0dce98f9b8a2ffdbc09ee4ee9fcfe5daca9df5a6`.
- Completed: 2026-11-05T07:34:37.564Z to 2026-11-05T07:50:39.580Z; 432 warmup cells and 1296 measured cells.
- Aggregate: **INVALID** (approved priority); **terminal performance FAIL** in four locally valid recipes; retryEligible=false. No second attempt, optimization, push or Draft PR after the explicit stop condition.
- All four FAIL recipes have A′/A within [0.97, 1.03]. English, numeric, code and Korean-positive recipes are INVALID because A′/A is outside that band; their timing ratios do not establish a performance improvement.
- Full source/build/input/output fingerprints and raw cell results: [manifest](manifest.json), [attempt 1](measurement-attempt-1.json). Stored analysis was independently recomputed using the committed analyzer and matched exactly.
- Point is median round B/mean(A,A′); CI is the preregistered six-block bootstrap, descriptive only. FAIL is point >1.03 even if the CI overlaps the threshold.

| Recipe | Point | 95% bootstrap CI | A′/A | Status |
|---|---:|---|---:|---|
| ko-repeated-space | 1.010662 | [1.008632, 1.012513] | 0.998926 | PASS |
| ko-label-space | 1.044847 | [1.039390, 1.047946] | 0.993010 | FAIL |
| ko-label-tab | 1.046243 | [1.040972, 1.048979] | 0.992194 | FAIL |
| ko-label-nbsp | 1.055465 | [1.050349, 1.057134] | 1.001686 | FAIL |
| ko-label-wide | 1.023414 | [1.021081, 1.025970] | 1.003498 | PASS |
| ko-label-lf | 1.005691 | [1.003120, 1.008415] | 1.000762 | PASS |
| ko-label-mixed | 1.031375 | [1.017225, 1.038252] | 0.998649 | FAIL |
| english-credential | 0.850537 | [0.806490, 0.956514] | 0.963287 | INVALID |
| natural-language | 0.879280 | [0.841991, 0.897368] | 1.022575 | PASS |
| numeric | 0.795733 | [0.792529, 0.807364] | 0.910714 | INVALID |
| code | 0.780609 | [0.722130, 0.846591] | 0.905399 | INVALID |
| ko-positive-literal | 0.579046 | [0.512001, 0.610644] | 0.786675 | INVALID |

Do not rerun or relax thresholds to obtain a favorable result. A follow-up implementation/protocol decision requires user approval.
