# N-27/N-30 performance result

- Overall: **BORDERLINE (boundary pass under the approved plan)**; no retry. {"PASS":14,"BORDERLINE":6,"FAIL":0,"INVALID":0}.
- Baseline: `0bc79590f926a38d53b11b470b23926ff9f1377e`; source/tools commit: `7004539ad87670316b00c759981cc89d945d0b4d`; preregistration manifest commit: `2c284316c741dc51a8955381b709f9d3a86ceeb7`.
- Attempt 1: `2026-11-06T14:37:08.274Z` to `2026-11-06T16:10:18.630Z`; 720 warmup + 2,160 measured calls, 20 recipes of 10 MiB each.
- Manifest canonical digest: `2213476ecb211360291a3e146ca5b706d569c26b76f5762df6907779752fadc1`; raw attempt SHA-256 (LF file bytes): `4fd727186953145991589511998252ed4e0ff741340434147d6acc1db2f62d62`.
- Provenance: `--prepare` PASS; pre-commit `--check` correctly rejected the uncommitted manifest; post-commit `--check` PASS (20 recipes, three variants, untimed). Stored analysis reproduced exactly from raw samples.
- Ratio: median of paired round B / mean(A, A-prime); 95% CI from 10,000 whole-six-block bootstrap draws, type-7 percentiles. A-prime/A is the median paired control ratio. Decision uses full precision, not the rounded table.
- All controls within [0.97, 1.03]; all representative variant medians exceed 1 ms. No validation errors, FAIL or INVALID. BORDERLINE means point <= 1.03 with upper CI > 1.03; it does not establish a <=3% upper confidence bound.
- Noise/drift limits sensitivity around the 3% threshold: measured back/front means range 1.287–1.350 on `ko-repeated-space` and 0.656–0.689 on `ko-label-lf`. The former's unpaired A/A-prime medians differ by about 6.3% although its paired control median is 1.005706. Drift is diagnostic-only under the fixed protocol; paired and unpaired statistics answer different questions.
- Several inputs show measured slowdowns around 1–2%, within the threshold: the CI lower bound exceeds 1 for `starred-password-nbsp-8`, `password-stars`, `starred-api-ko-nbsp-8`, `ko-label-tab`, `ko-prose-10mib` and `markdown-10mib`. The last two point estimates are +2.153% and +2.014%.
- Product source provenance: `src/core/policy.ts` has the same Git blob `974bb4fb271b2b68da03d2396945d7a9e6f56914` at GREEN `510bf3e`, tools `7004539`, manifest `2c28431` and measured-results `01cd0c8`; LF SHA-256 `308043afc87102079a8b8a082199afaf26301d88f8253ffb349e0d7b1ba71744e` matches the manifest.

| Recipe | Point | 95% CI | A-prime/A | Status |
|---|---:|---|---:|---|
| starred-password-nbsp-60 | 0.999030 | [0.969211, 1.019027] | 0.977493 | PASS |
| starred-password-nbsp-8 | 1.018320 | [1.009563, 1.039445] | 1.001253 | BORDERLINE |
| starred-korean-nbsp-8 | 1.008150 | [0.966594, 1.021244] | 1.003781 | PASS |
| starred-password-wide-8 | 1.008511 | [0.984095, 1.029348] | 1.000673 | PASS |
| password-stars | 1.011680 | [1.001902, 1.041732] | 0.986705 | BORDERLINE |
| starred-password-space | 1.012619 | [0.984820, 1.034009] | 1.005034 | BORDERLINE |
| starred-passwd-nbsp-60 | 0.996878 | [0.986817, 1.010392] | 0.982989 | PASS |
| starred-api-ko-nbsp-8 | 1.013734 | [1.002022, 1.020455] | 0.992116 | PASS |
| ko-repeated-space | 1.003908 | [0.973823, 1.030210] | 1.005706 | BORDERLINE |
| ko-label-space | 1.003573 | [0.963565, 1.022118] | 1.000301 | PASS |
| ko-label-tab | 1.008985 | [1.001623, 1.034457] | 1.017195 | BORDERLINE |
| ko-label-nbsp | 1.001488 | [0.975942, 1.028424] | 1.005705 | PASS |
| ko-label-wide | 0.997026 | [0.992580, 1.006929] | 0.994984 | PASS |
| ko-label-lf | 0.988543 | [0.973122, 0.996386] | 0.995766 | PASS |
| ko-label-mixed | 0.994568 | [0.973233, 1.030005] | 0.987871 | BORDERLINE |
| ko-prose-10mib | 1.021530 | [1.001274, 1.024218] | 0.992391 | PASS |
| en-prose-10mib | 0.982774 | [0.957307, 0.997471] | 1.001882 | PASS |
| code-10mib | 1.004875 | [0.989513, 1.013831] | 0.997370 | PASS |
| markdown-10mib | 1.020145 | [1.009460, 1.026052] | 0.998460 | PASS |
| ko-credential-10mib | 0.987850 | [0.942994, 1.018106] | 1.009283 | PASS |

## BORDERLINE block medians

| Recipe | Blocks 1 through 6 (paired ratios) |
|---|---|
| starred-password-nbsp-8 | 1.039445, 1.011201, 1.049153, 1.009043, 1.016348, 1.017079 |
| password-stars | 1.004391, 1.057780, 1.001902, 0.994447, 1.037845, 0.997491 |
| starred-password-space | 0.975022, 1.026160, 0.996423, 1.035592, 1.006306, 1.038646 |
| ko-repeated-space | 0.979474, 0.972549, 1.000021, 1.007411, 1.045134, 1.007818 |
| ko-label-tab | 1.018453, 0.994974, 1.039485, 1.007449, 1.007559, 1.001772 |
| ko-label-mixed | 1.036256, 0.973843, 0.997646, 1.035052, 0.962399, 0.949065 |

## Representative variant medians

| Recipe | A ms | A-prime ms | B ms |
|---|---:|---:|---:|
| ko-prose-10mib | 2377.800 | 2354.017 | 2408.073 |
| en-prose-10mib | 4694.278 | 4703.534 | 4537.492 |
| code-10mib | 3399.399 | 3380.393 | 3402.973 |
| markdown-10mib | 3502.738 | 3452.149 | 3473.264 |
| ko-credential-10mib | 1559.818 | 1583.231 | 1523.246 |

## Limits and reproduction

- One machine/runtime and one preregistered campaign. Per-round persistence is outside the timer but may influence later GC/cache effects. Balanced ordering does not prove noise removal. Drift diagnostics and full-precision statistics remain in the raw artifact.
- Reproduce analysis from the repository root: `node scripts/analyze-n27-policy.mjs docs/research/evidence/n27/measurement-attempt-1.json`. This analyzes saved samples; it does not rerun timing.
- A separate local Python reference (without importing the JavaScript analyzer) reproduced all 20 point estimates, A-prime/A ratios, 95% block-bootstrap intervals, six block medians and variant medians within 1e-13. This is a second calculation by the primary agent, not an independent provider review.
- Manifest, runner, analyzer, evidence tests, policy, recipes and thresholds were not changed after timing began. No attempt 2 was created.
- Recipe readability: NBSP is U+00A0 (`\u00a0`), wide space U+3000 (`\u3000`); counts are encoded in recipe IDs (8 or 60). The `ko-label-*` recipes repeat the named whitespace to the exact byte limit, and mixed whitespace is ` \t\u00a0\u3000\n`. The immutable manifest contains exact units and hashes.
- Coverage limit: the 15 worst recipes are non-matches for A/A-prime/B. The representative credential input matches all variants; a B-only new matching path was not performance-measured. No recipe was added after seeing results. The 1 ms floor is satisfied by a wide margin and supplies little discrimination for these 10 MiB inputs. Six-block bootstrap endpoints are discrete and coarse.
