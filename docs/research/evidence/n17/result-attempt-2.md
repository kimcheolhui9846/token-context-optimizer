# N-17 performance rework — attempt 2

- Outcome: **BORDERLINE**. Aggregate BORDERLINE; retryEligible=false.
- Manifest: [campaign attempts 2–3](manifest-attempt-2.json), digest `acecb58d8de2484cde6dec502290740a68acc92a8ef21d31de64d3fdb7038e08`.
- Raw evidence: [attempt 2](measurement-attempt-2.json); complete=true; warmup cells=432; measured cells=1296.
- Product/tooling commit: `04ec71427b025522d8f5861458559b35714dba97`; preregistration commit: `ad840c83ea81b10587bf3d1031cf08140d320a27`.
- Attempt-1 evidence, manifest and [FAIL report](result.md) remain byte-for-byte unchanged. Original valid FAILs: space/tab/NBSP/mixed.
- Reason: attempt-1 FAIL 뒤 구현 변경 + 대표 입력 측정 설계 결함 수리. 게이트 기준 불변.
- Korean-only and api branches now use separate module regex constants; semantics checked against the frozen original regex.
- Seven worst input bytes, threshold 1.03, A′/A [0.97,1.03], warmup12, measured36/six blocks, seeds and 10,000 block-bootstrap resamples are unchanged.
- Five representative literals were replaced by deterministic 10 MiB prose/code/Markdown/credential recipes. Both implementation and these inputs changed; their new results do not isolate the effect of the regex split.
- Original literal A medians were 11,150–42,550 ns; four were outside the A′/A band. This supports the measurement-design repair, not a proven diagnosis of timer resolution.
- Natural GC, one full classifier call per cell; drift is diagnostic. Confidence intervals are descriptive. INVALID recipes do not support performance-improvement claims.
- Performance gate permits push and Draft PR after verification; Ready and merge remain excluded.

| Recipe | Point B/mean(A,A′) | 95% block-bootstrap CI | A′/A | Status |
|---|---:|---|---:|---|
| ko-repeated-space | 1.007531676082031 | 1.006555189886173 – 1.008247774668793 | 0.9982937310146043 | PASS |
| ko-label-space | 1.0256230022320778 | 1.0244414523984178 – 1.0272768763243258 | 0.9894893325702909 | PASS |
| ko-label-tab | 1.022960760501134 | 1.0204073859629457 – 1.0248608107849246 | 0.9902385201986759 | PASS |
| ko-label-nbsp | 1.0219154334368694 | 1.0196839900925172 – 1.031116076901116 | 1.0049559065782372 | BORDERLINE |
| ko-label-wide | 1.0057861463960345 | 1.003078499393023 – 1.012566927136229 | 0.9919477369603823 | PASS |
| ko-label-lf | 1.002417045620276 | 0.9986766222338844 – 1.0050082465684613 | 1.001892955105209 | PASS |
| ko-label-mixed | 1.0009549841790948 | 0.9928384519434098 – 1.012399123554177 | 0.9846504059903302 | PASS |
| ko-prose-10mib | 0.9996765053295075 | 0.9984967369652489 – 1.0013894207169411 | 0.9981328128077738 | PASS |
| en-prose-10mib | 0.9987187172043914 | 0.9966626742374156 – 1.0006806384020597 | 0.9924913502893418 | PASS |
| code-10mib | 1.000253918872858 | 0.9924420899459893 – 1.0053616993640353 | 0.9992701251421187 | PASS |
| markdown-10mib | 1.0049226675917253 | 1.0023510518589616 – 1.0056281922851447 | 0.9965537297386374 | PASS |
| ko-credential-10mib | 0.531020018050573 | 0.527390086211719 – 0.543278835587829 | 1.0045362642260725 | PASS |

Stored analysis was recomputed with the committed analyzer and matched exactly. Original evidence SHA-256 values were rechecked.
