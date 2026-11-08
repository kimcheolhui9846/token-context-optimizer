# N-32 performance result

- Overall: **PASS**. Recipe counts: {"PASS":28,"BORDERLINE":0,"FAIL":0,"INVALID":0}. Attempt 1; retry eligible: false.
- Baseline: `b4abdb88d72f16f35de01ecaed80cd5a7325b700`; source/tools commit: `d9f615003d23cd75f24cefc74b3530db3ac9a5fe`; preregistered manifest commit: `21d133afad99bf4329507dc57a7bc80ca2af24b5`.
- Separate [Python arithmetic reference](stat-reference.py) reproduced all 28 points, paired A-prime/A controls, 95% block-bootstrap intervals, six block medians and variant medians. This cross-check confirms arithmetic under the prescribed method, not method selection, schedule/oracle/hash validity or decision classification. Reference LF SHA-256: `cf11f526143d3b0e9cf83108fc191e36eb1439cce4064ece2c22094abf8cbf36`.
- Post-measurement verification matched all 15 artifact fingerprints and all 3 built variant hashes. Control ratios ranged 0.992296–1.009214; minimum representative median was 1025.903 ms (floor 1 ms); validation errors0.
- Manifest canonical digest: `29d23eebde601d56e7d9c8682cf57312dc9235a763b9d486b472db7df25de5ac`. Stored analysis reproduced exactly from raw samples.
- Fixed protocol: 28 recipes; 1008 warmup + 3024 measured cells. Six complete measurement blocks, seed-preserving 10000 bootstrap draws, type-7 95% CI, paired B/mean(A,A-prime). Full precision controls decisions.
- FAIL/BORDERLINE is not remeasured. Only attempt 1 INVALID with no individual FAIL permits one retry. No regex, recipe, tool or oracle tuning after timing.
- Maximum point: quoted-password-nbsp-60 1.016215; CI [1.005968, 1.021152]; status PASS.
- Maximum upper CI: starred-password-wide-8 1.022927.
- INVALID takes precedence; numeric estimates for invalid recipes are descriptive only. BORDERLINE is an approved boundary pass, not proof of an upper confidence bound at or below 3%.

- Attempt 1: 2026-11-07T14:02:50.275Z to 2026-11-07T15:33:27.189Z; complete=true; 1008 warmup + 3024 measured; status=PASS; raw SHA-256 `9410ae9b68456484e74beec6140a2ddc6aa82102121982ce5cc568ccfb49f673`.

| Recipe | Point | 95% CI | A-prime/A | Status | Local status |
|---|---:|---|---:|---|---|
| starred-password-nbsp-60 | 0.999414 | [0.994648, 1.002320] | 0.999704 | PASS | PASS |
| starred-password-nbsp-8 | 0.996641 | [0.988696, 1.004106] | 0.997115 | PASS | PASS |
| starred-korean-nbsp-8 | 0.992410 | [0.984927, 0.997657] | 1.006295 | PASS | PASS |
| starred-password-wide-8 | 0.993660 | [0.983008, 1.022927] | 0.992296 | PASS | PASS |
| password-stars | 0.999326 | [0.994097, 1.006014] | 1.001557 | PASS | PASS |
| starred-password-space | 1.002243 | [0.998868, 1.004030] | 1.002413 | PASS | PASS |
| starred-passwd-nbsp-60 | 0.999303 | [0.993652, 1.008620] | 1.001096 | PASS | PASS |
| starred-api-ko-nbsp-8 | 0.995808 | [0.992590, 0.996773] | 1.004808 | PASS | PASS |
| ko-repeated-space | 0.998782 | [0.996279, 1.004030] | 0.994256 | PASS | PASS |
| ko-label-space | 0.995836 | [0.993250, 0.999789] | 1.006648 | PASS | PASS |
| ko-label-tab | 0.994033 | [0.990597, 1.001219] | 1.009214 | PASS | PASS |
| ko-label-nbsp | 0.997510 | [0.994312, 0.998868] | 0.995366 | PASS | PASS |
| ko-label-wide | 0.999030 | [0.995096, 1.002806] | 0.998906 | PASS | PASS |
| ko-label-lf | 0.995903 | [0.994610, 1.000398] | 1.001127 | PASS | PASS |
| ko-label-mixed | 0.984851 | [0.976524, 1.002370] | 0.999682 | PASS | PASS |
| ko-prose-10mib | 0.994774 | [0.992551, 0.996522] | 1.002084 | PASS | PASS |
| en-prose-10mib | 1.007315 | [1.004109, 1.008138] | 1.002903 | PASS | PASS |
| code-10mib | 0.999116 | [0.995314, 1.009223] | 1.007370 | PASS | PASS |
| markdown-10mib | 1.004145 | [1.002368, 1.005772] | 1.003499 | PASS | PASS |
| ko-credential-10mib | 0.997131 | [0.994735, 1.003375] | 1.004965 | PASS | PASS |
| quoted-password-nbsp-60 | 1.016215 | [1.005968, 1.021152] | 0.996926 | PASS | PASS |
| quoted-password-nbsp-8 | 1.011520 | [0.998535, 1.017692] | 0.995860 | PASS | PASS |
| quoted-password-wide-8 | 0.995142 | [0.994557, 1.012710] | 0.999913 | PASS | PASS |
| quoted-password-space | 1.002562 | [1.000822, 1.005440] | 0.999664 | PASS | PASS |
| paren-password-space | 1.001820 | [0.996754, 1.003996] | 0.999777 | PASS | PASS |
| quoted-korean-nbsp-8 | 1.003467 | [1.001127, 1.010938] | 0.998738 | PASS | PASS |
| corner-korean-nbsp-8 | 0.996373 | [0.990734, 0.999400] | 1.002759 | PASS | PASS |
| quoted-api-ko-nbsp-8 | 1.014805 | [1.009527, 1.016011] | 1.006307 | PASS | PASS |

## Block medians

| Recipe | Blocks1–6 |
|---|---|
| starred-password-nbsp-60 | 0.989773, 0.998529, 0.999643, 1.014554, 0.998562, 0.996990 |
| starred-password-nbsp-8 | 0.994957, 1.006068, 1.003480, 0.997164, 1.003198, 0.979636 |
| starred-korean-nbsp-8 | 0.985118, 0.997662, 0.983558, 0.994938, 1.005500, 1.016021 |
| starred-password-wide-8 | 0.999328, 0.981423, 0.990066, 1.013950, 1.026471, 0.989108 |
| password-stars | 0.999769, 0.999614, 0.999089, 1.007055, 0.993694, 0.989303 |
| starred-password-space | 1.004221, 1.003384, 1.000429, 1.003932, 0.996407, 0.999856 |
| starred-passwd-nbsp-60 | 0.997312, 1.012322, 0.994823, 0.995139, 0.990357, 1.003922 |
| starred-api-ko-nbsp-8 | 0.997126, 0.995088, 0.993887, 0.992373, 0.998812, 0.996599 |
| ko-repeated-space | 0.993328, 0.996984, 1.005374, 0.997171, 0.997948, 1.000498 |
| ko-label-space | 0.997802, 0.992840, 0.997603, 0.995441, 0.996480, 1.001185 |
| ko-label-tab | 0.989950, 0.999134, 0.991665, 1.002507, 1.006317, 0.987221 |
| ko-label-nbsp | 0.998973, 0.995545, 0.992365, 0.994546, 0.993919, 0.999804 |
| ko-label-wide | 0.995431, 1.005829, 1.001637, 1.002443, 0.994141, 0.997114 |
| ko-label-lf | 0.994303, 0.993904, 0.994617, 1.000398, 1.004773, 0.996818 |
| ko-label-mixed | 1.009189, 0.990627, 0.991085, 0.973682, 0.979724, 0.971832 |
| ko-prose-10mib | 0.994234, 0.991574, 0.996866, 0.996877, 0.994218, 0.996332 |
| en-prose-10mib | 1.005001, 1.007916, 1.001117, 1.008124, 1.007350, 1.008378 |
| code-10mib | 0.998496, 0.993381, 1.008754, 0.995401, 1.001783, 1.010078 |
| markdown-10mib | 1.006689, 1.002061, 1.003984, 1.005410, 1.004492, 1.002306 |
| ko-credential-10mib | 0.995142, 0.996132, 1.011882, 0.994899, 1.000124, 0.993698 |
| quoted-password-nbsp-60 | 1.011824, 1.022316, 1.005788, 1.020391, 1.002111, 1.016240 |
| quoted-password-nbsp-8 | 1.007169, 1.019315, 1.010748, 1.011520, 0.997044, 1.017978 |
| quoted-password-wide-8 | 0.994210, 0.993749, 0.999370, 1.022328, 1.013933, 0.994422 |
| quoted-password-space | 0.999775, 1.000659, 1.006312, 1.003121, 1.004197, 1.004596 |
| paren-password-space | 1.005107, 0.998015, 1.004545, 0.994749, 1.002468, 1.003352 |
| quoted-korean-nbsp-8 | 1.001915, 1.004679, 1.015640, 0.996746, 1.002476, 1.003716 |
| corner-korean-nbsp-8 | 1.001775, 0.993751, 0.990731, 0.992692, 1.000732, 0.992625 |
| quoted-api-ko-nbsp-8 | 1.018249, 1.007050, 1.016788, 1.015044, 1.016588, 1.013768 |

## Validity and limits

- One machine/runtime; read-only environment observations are in preflight.json. Background load was not continuously controlled. No concurrent test/review campaign was launched by this task during timing.
- New performance inputs directly cover closing double quote, parenthesis and corner bracket only; other approved closers have functional matrix coverage.
- Reproduce analysis without new timing from repository root: `node scripts/analyze-n32-policy.mjs docs/research/evidence/n32/measurement-attempt-1.json`.

- PASS does not mean no slowdown. Recipes with a CI lower bound above 1 were en-prose-10mib +0.732%; markdown-10mib +0.415%; quoted-password-nbsp-60 +1.621%; quoted-password-space +0.256%; quoted-korean-nbsp-8 +0.347%; quoted-api-ko-nbsp-8 +1.481%. These observed changes remain within the preregistered 3% gate.
- `ko-label-mixed` block medians moved from 1.009189 to 0.971832; B measured back/front mean ratio was 0.980126. Drift is diagnostic only under the fixed protocol.
- Six-block bootstrap intervals reflect this single session and discrete block resampling; they do not characterize variation across machines or sessions.
- Reproduce the arithmetic check with `python docs/research/evidence/n32/stat-reference.py`.

Before the analyzer command, pin both the committed and working manifest, and the raw attempt bytes:

```powershell
node --input-type=module -e "import {execFileSync} from 'node:child_process'; import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; import {manifestHash} from './scripts/analyze-n32-policy.mjs'; const p='docs/research/evidence/n32/manifest.json'; const expected='29d23eebde601d56e7d9c8682cf57312dc9235a763b9d486b472db7df25de5ac'; const committed=JSON.parse(execFileSync('git',['show','21d133afad99bf4329507dc57a7bc80ca2af24b5:'+p],{encoding:'utf8'})); if(manifestHash(committed)!==expected || manifestHash(JSON.parse(readFileSync(p,'utf8')))!==expected)throw Error('manifest mismatch'); if(createHash('sha256').update(readFileSync('docs/research/evidence/n32/measurement-attempt-1.json')).digest('hex')!=='9410ae9b68456484e74beec6140a2ddc6aa82102121982ce5cc568ccfb49f673')throw Error('attempt mismatch'); console.log('Pinned evidence PASS');"
```
