+ export TMPDIR=<work>
+ TMPDIR=<work>
++ date +%Y%m%d%H%M%S
+ W=<work>/krg-repro-20261124234740
+ mkdir <work>/krg-repro-20261124234740
++ cd <work>/krg-repro-20261124234740
++ pwd -W
+ W=<work>/krg-repro-20261124234740
+ mkdir <work>/krg-repro-20261124234740/out
+ git clone https://github.com/kimcheolhui9846/token-context-optimizer.git <work>/krg-repro-20261124234740/repo
Cloning into '<work>/krg-repro-20261124234740/repo'...
Updating files:  90% (1279/1419)Updating files:  91% (1292/1419)Updating files:  92% (1306/1419)Updating files:  93% (1320/1419)Updating files:  94% (1334/1419)Updating files:  95% (1349/1419)Updating files:  96% (1363/1419)Updating files:  97% (1377/1419)Updating files:  98% (1391/1419)Updating files:  99% (1405/1419)Updating files: 100% (1419/1419)Updating files: 100% (1419/1419), done.
+ cd <work>/krg-repro-20261124234740/repo
+ git fetch origin pull/152/head:krg-pr152 pull/145/head:krg-pr145 pull/147/head:krg-pr147 pull/148/head:krg-pr148 pull/149/head:krg-pr149 pull/150/head:krg-pr150 pull/151/head:krg-pr151
From https://github.com/kimcheolhui9846/token-context-optimizer
 * [new ref]         refs/pull/152/head -> krg-pr152
 * [new ref]         refs/pull/145/head -> krg-pr145
 * [new ref]         refs/pull/147/head -> krg-pr147
 * [new ref]         refs/pull/148/head -> krg-pr148
 * [new ref]         refs/pull/149/head -> krg-pr149
 * [new ref]         refs/pull/150/head -> krg-pr150
 * [new ref]         refs/pull/151/head -> krg-pr151
+ git checkout krg-pr152
Switched to branch 'krg-pr152'
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1
commit
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t 708d9946ae091180a1b716baadfdd73fcfe5a19b
commit
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t c0c2f5dd4178df3e02595176525cf88b2eaf68c2
commit
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t 2ab9ed149896cc06cec387826ab99fa5bac77cda
commit
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t fd7ba06e496437c7fc799348a95f649e85d87d7b
commit
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t b108e2f0983bf096b4ddfc5d204a4d99cd6d8535
commit
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t d75f54555101125a35dc8aeac8c06e5b29929593
commit
+ for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 d75f54555101125a35dc8aeac8c06e5b29929593 3f27fb96c215faee53af8530f6e6489363007f2f
+ git cat-file -t 3f27fb96c215faee53af8530f6e6489363007f2f
commit
+ cd research
+ npm ci --ignore-scripts

added 26 packages, and audited 27 packages in 4s

2 packages are looking for funding
  run `npm fund` for details

1 high severity vulnerability

To address all issues, run:
  npm audit fix --force

Run `npm audit` for details.
+ node -p 'require('\''tesseract.js/package.json'\'').version + '\'' '\'' + require('\''tesseract.js-core/package.json'\'').version'
5.1.1 5.1.1
+ git status --porcelain
+ node src/ko-row-gate-replay.mjs --ocr results/ko-row-gate/ocr --out <work>/krg-repro-20261124234740/out/replay-a
done: 48 predictions W1 {"widened":46,"not_wider":2} W2 {"cut":46,"inherit":2} W3 {"multiple_candidates":12,"not_applicable":2,"no_candidate":14,"applied":20} sha256 319913c8ab4f5d49074e7928b2cfebae610d9a575de2a7f595f7cbc6c8df2ed0
+ node src/ko-row-gate-score.mjs --replay <work>/krg-repro-20261124234740/out/replay-a --out <work>/krg-repro-20261124234740/out/score-a
done: strict W1 48 W2 25 W3 38 /48; L2 23/48; L3 10/48; prevented 13/23; cut 46, applied 20; opportunity 46, events W2 23 W3 10; verdict {"loss3":"loss","loss2":"loss","prevention":"prevented_some","removal":"observed_repeated_sources"}
+ node src/ko-row-gate-replay.mjs --ocr results/ko-row-gate/ocr --out <work>/krg-repro-20261124234740/out/replay-b
done: 48 predictions W1 {"widened":46,"not_wider":2} W2 {"cut":46,"inherit":2} W3 {"multiple_candidates":12,"not_applicable":2,"no_candidate":14,"applied":20} sha256 319913c8ab4f5d49074e7928b2cfebae610d9a575de2a7f595f7cbc6c8df2ed0
+ node src/ko-row-gate-score.mjs --replay <work>/krg-repro-20261124234740/out/replay-b --out <work>/krg-repro-20261124234740/out/score-b
done: strict W1 48 W2 25 W3 38 /48; L2 23/48; L3 10/48; prevented 13/23; cut 46, applied 20; opportunity 46, events W2 23 W3 10; verdict {"loss3":"loss","loss2":"loss","prevention":"prevented_some","removal":"observed_repeated_sources"}
+ node src/ko-row-gate-compare.mjs --a <work>/krg-repro-20261124234740/out --out <work>/krg-repro-20261124234740/out/ab-compare.json
reproduced: true
+ for x in a b
+ for f in predictions.jsonl inputs.json freeze.json
+ cmp -s <work>/krg-repro-20261124234740/out/replay-a/predictions.jsonl results/ko-row-gate/replay-a/predictions.jsonl
+ echo 'same replay-a/predictions.jsonl'
same replay-a/predictions.jsonl
+ for f in predictions.jsonl inputs.json freeze.json
+ cmp -s <work>/krg-repro-20261124234740/out/replay-a/inputs.json results/ko-row-gate/replay-a/inputs.json
+ echo 'same replay-a/inputs.json'
same replay-a/inputs.json
+ for f in predictions.jsonl inputs.json freeze.json
+ cmp -s <work>/krg-repro-20261124234740/out/replay-a/freeze.json results/ko-row-gate/replay-a/freeze.json
+ echo 'same replay-a/freeze.json'
same replay-a/freeze.json
+ for f in score.jsonl summary.json
+ cmp -s <work>/krg-repro-20261124234740/out/score-a/score.jsonl results/ko-row-gate/score-a/score.jsonl
+ echo 'same score-a/score.jsonl'
same score-a/score.jsonl
+ for f in score.jsonl summary.json
+ cmp -s <work>/krg-repro-20261124234740/out/score-a/summary.json results/ko-row-gate/score-a/summary.json
+ echo 'same score-a/summary.json'
same score-a/summary.json
+ for x in a b
+ for f in predictions.jsonl inputs.json freeze.json
+ cmp -s <work>/krg-repro-20261124234740/out/replay-b/predictions.jsonl results/ko-row-gate/replay-a/predictions.jsonl
+ echo 'same replay-b/predictions.jsonl'
same replay-b/predictions.jsonl
+ for f in predictions.jsonl inputs.json freeze.json
+ cmp -s <work>/krg-repro-20261124234740/out/replay-b/inputs.json results/ko-row-gate/replay-a/inputs.json
+ echo 'same replay-b/inputs.json'
same replay-b/inputs.json
+ for f in predictions.jsonl inputs.json freeze.json
+ cmp -s <work>/krg-repro-20261124234740/out/replay-b/freeze.json results/ko-row-gate/replay-a/freeze.json
+ echo 'same replay-b/freeze.json'
same replay-b/freeze.json
+ for f in score.jsonl summary.json
+ cmp -s <work>/krg-repro-20261124234740/out/score-b/score.jsonl results/ko-row-gate/score-a/score.jsonl
+ echo 'same score-b/score.jsonl'
same score-b/score.jsonl
+ for f in score.jsonl summary.json
+ cmp -s <work>/krg-repro-20261124234740/out/score-b/summary.json results/ko-row-gate/score-a/summary.json
+ echo 'same score-b/summary.json'
same score-b/summary.json
+ cmp -s <work>/krg-repro-20261124234740/out/ab-compare.json results/ko-row-gate/ab-compare.json
+ echo 'same ab-compare.json'
same ab-compare.json
+ git status --porcelain
+ cp results/ko-row-gate/RESULTS.md <work>/krg-repro-20261124234740/out/RESULTS.md
+ node src/ko-row-gate-report.mjs --score <work>/krg-repro-20261124234740/out/score-a --results <work>/krg-repro-20261124234740/out/RESULTS.md --write
{"tables":8,"mismatches":0,"first":[]}
+ cmp -s <work>/krg-repro-20261124234740/out/RESULTS.md results/ko-row-gate/RESULTS.md
+ echo 'same RESULTS.md'
same RESULTS.md
+ node src/ko-row-gate-report.mjs --score <work>/krg-repro-20261124234740/out/score-a --results results/ko-row-gate/RESULTS.md
{"tables":8,"mismatches":0,"first":[]}
+ python -m unittest tools/ko-row-gate/test_recount.py
............
----------------------------------------------------------------------
Ran 12 tests in 0.018s

OK
+ mkdir <work>/krg-repro-20261124234740/out/recount
+ for x in a b
+ python tools/ko-row-gate/recount.py --data results/ko-row-gate/data --ocr results/ko-row-gate/ocr --replay <work>/krg-repro-20261124234740/out/replay-a --score <work>/krg-repro-20261124234740/out/score-a --results results/ko-row-gate/RESULTS.md --out <work>/krg-repro-20261124234740/out/recount/recount-a.json
{"ok": true, "failed": []}
+ for x in a b
+ python tools/ko-row-gate/recount.py --data results/ko-row-gate/data --ocr results/ko-row-gate/ocr --replay <work>/krg-repro-20261124234740/out/replay-b --score <work>/krg-repro-20261124234740/out/score-b --results results/ko-row-gate/RESULTS.md --out <work>/krg-repro-20261124234740/out/recount/recount-b.json
{"ok": true, "failed": []}
+ python tools/ko-row-gate/recount.py --data results/ko-row-gate/data --ocr results/ko-row-gate/ocr --replay <work>/krg-repro-20261124234740/out/replay-a --score <work>/krg-repro-20261124234740/out/score-a --results results/ko-row-gate/RESULTS.md --mutate <work>/krg-repro-20261124234740/out/recount/mutation.json
{"allRejected": true, "tampers": 14, "notApplicable": []}
+ for f in recount-a.json recount-b.json mutation.json
+ cmp -s <work>/krg-repro-20261124234740/out/recount/recount-a.json results/ko-row-gate/recount/recount-a.json
+ echo 'same recount-a.json'
same recount-a.json
+ for f in recount-a.json recount-b.json mutation.json
+ cmp -s <work>/krg-repro-20261124234740/out/recount/recount-b.json results/ko-row-gate/recount/recount-b.json
+ echo 'same recount-b.json'
same recount-b.json
+ for f in recount-a.json recount-b.json mutation.json
+ cmp -s <work>/krg-repro-20261124234740/out/recount/mutation.json results/ko-row-gate/recount/mutation.json
+ echo 'same mutation.json'
same mutation.json
+ git status --porcelain
+ F=/c/Windows/Fonts/NotoSansKR-VF.ttf
+ echo '018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0  /c/Windows/Fonts/NotoSansKR-VF.ttf'
+ sha256sum -c -
/c/Windows/Fonts/NotoSansKR-VF.ttf: OK
+ python -m venv <work>/krg-repro-20261124234740/venv
+ PY=<work>/krg-repro-20261124234740/venv/bin/python
+ '[' -x <work>/krg-repro-20261124234740/venv/bin/python ']'
+ PY=<work>/krg-repro-20261124234740/venv/Scripts/python.exe
+ <work>/krg-repro-20261124234740/venv/Scripts/python.exe -m pip install pillow==12.3.0 fonttools==4.63.0
Collecting pillow==12.3.0
  Using cached pillow-12.3.0-cp312-cp312-win_amd64.whl.metadata (9.3 kB)
Collecting fonttools==4.63.0
  Using cached fonttools-4.63.0-cp312-cp312-win_amd64.whl.metadata (121 kB)
Using cached pillow-12.3.0-cp312-cp312-win_amd64.whl (7.2 MB)
Using cached fonttools-4.63.0-cp312-cp312-win_amd64.whl (2.3 MB)
Installing collected packages: pillow, fonttools
Successfully installed fonttools-4.63.0 pillow-12.3.0

[notice] A new release of pip is available: 25.0.1 -> 26.3
[notice] To update, run: <work>\krg-repro-20261124234740\venv\Scripts\python.exe -m pip install --upgrade pip
+ mkdir <work>/krg-repro-20261124234740/out/gen
+ <work>/krg-repro-20261124234740/venv/Scripts/python.exe tools/ko-row-gate/design.py --out <work>/krg-repro-20261124234740/out/gen --font /c/Windows/Fonts/NotoSansKR-VF.ttf
{"sources": 12, "pages": 48, "problems": []}
+ <work>/krg-repro-20261124234740/venv/Scripts/python.exe tools/r09/render.py --design <work>/krg-repro-20261124234740/out/gen/design.json --font /c/Windows/Fonts/NotoSansKR-VF.ttf --out <work>/krg-repro-20261124234740/out/gen
{"images": 48, "failedImages": 0, "font": "Version 2.04;241114210130;non-release"}
+ node src/ko-row-gate-data.mjs assemble --from <work>/krg-repro-20261124234740/out/gen --data <work>/krg-repro-20261124234740/out/data
{"questions":48}
+ node src/ko-row-gate-data.mjs check --data <work>/krg-repro-20261124234740/out/data
{"ok":true,"problems":[],"measured":{"sameTopDiff":[-1,3],"otherTopDiff":[39,43],"recordGap":[24,28]},"referenceBand":{"same-same":{"pages":12,"valueInBand":12,"decoyInBand":12},"same-other":{"pages":12,"valueInBand":12,"decoyInBand":0},"below-same":{"pages":12,"valueInBand":0,"decoyInBand":12},"below-other":{"pages":12,"valueInBand":0,"decoyInBand":0}},"uniqueness":{"pngSha256":48,"normalizedQuestions":12,"pagesPerQuestion":[4]},"pairingOk":true,"earlier":{"counts":{"r09-heldout":48,"r09-dev":4,"fcp":48,"ko-ocr-holdout-148":96,"ko-row-window-150":48,"ko-row-height-151":48},"image":0,"question":0,"cohort149":{"pages":24,"imageOverlap":0,"questionOverlap":0}}}
+ node src/ko-row-gate-data.mjs manifest --data <work>/krg-repro-20261124234740/out/data
manifest.json sha256 53222cc618f3d8f6295da2414c129e85474505e4282b4f2930ceba4b10151e69
+ cd <work>/krg-repro-20261124234740/out/data
+ find . -type f
+ LC_ALL=C
+ sort
+ xargs sha256sum
+ cd results/ko-row-gate/data
+ find . -type f
+ LC_ALL=C
+ sort
+ xargs sha256sum
+ diff <work>/krg-repro-20261124234740/out/data-new.sha256 <work>/krg-repro-20261124234740/out/data-pub.sha256
+ echo 'data identical'
data identical
+ git status --porcelain
+ mkdir <work>/krg-repro-20261124234740/pkgs .cache/ko-ocr-factorial
+ cd <work>/krg-repro-20261124234740/pkgs
+ npm pack @tesseract.js-data/eng@1.0.0 @tesseract.js-data/kor@1.0.0
npm notice
npm notice 📦  @tesseract.js-data/eng@1.0.0
npm notice Tarball Contents
npm notice 3.0MB 4.0.0_best_int/eng.traineddata.gz
npm notice 10.9MB 4.0.0/eng.traineddata.gz
npm notice 381B README.md
npm notice 123B index.js
npm notice 530B package.json
npm notice Tarball Details
npm notice name: @tesseract.js-data/eng
npm notice version: 1.0.0
npm notice filename: tesseract.js-data-eng-1.0.0.tgz
npm notice package size: 13.8 MB
npm notice unpacked size: 13.9 MB
npm notice shasum: 285a3f1fb419e8e67bdee93ce288b02bb9097f0a
npm notice integrity: sha512-mbTumm6KQPUHy[...]W9GB19Jk+ZcTg==
npm notice total files: 5
npm notice
tesseract.js-data-eng-1.0.0.tgz
npm notice 📦  @tesseract.js-data/kor@1.0.0
npm notice 1.6MB 4.0.0_best_int/kor.traineddata.gz
npm notice 7.0MB 4.0.0/kor.traineddata.gz
npm notice 381B README.md
npm notice 123B index.js
npm notice 530B package.json
npm notice name: @tesseract.js-data/kor
npm notice filename: tesseract.js-data-kor-1.0.0.tgz
npm notice package size: 8.5 MB
npm notice unpacked size: 8.5 MB
npm notice shasum: af4c18b31384e8979ba583496c0445132392fb96
npm notice integrity: sha512-tepYhsYiRJ8E4[...]5zfJ/6R6FVU9w==
tesseract.js-data-kor-1.0.0.tgz
+ echo '285a3f1fb419e8e67bdee93ce288b02bb9097f0a  <work>/krg-repro-20261124234740/pkgs/tesseract.js-data-eng-1.0.0.tgz'
+ sha1sum -c -
<work>/krg-repro-20261124234740/pkgs/tesseract.js-data-eng-1.0.0.tgz: OK
+ echo 'af4c18b31384e8979ba583496c0445132392fb96  <work>/krg-repro-20261124234740/pkgs/tesseract.js-data-kor-1.0.0.tgz'
+ sha1sum -c -
<work>/krg-repro-20261124234740/pkgs/tesseract.js-data-kor-1.0.0.tgz: OK
+ for l in eng kor
+ mkdir <work>/krg-repro-20261124234740/pkgs/eng
+ cd <work>/krg-repro-20261124234740/pkgs/eng
+ tar -xzf ../tesseract.js-data-eng-1.0.0.tgz
+ gzip -dc <work>/krg-repro-20261124234740/pkgs/eng/package/4.0.0_best_int/eng.traineddata.gz
+ for l in eng kor
+ mkdir <work>/krg-repro-20261124234740/pkgs/kor
+ cd <work>/krg-repro-20261124234740/pkgs/kor
+ tar -xzf ../tesseract.js-data-kor-1.0.0.tgz
+ gzip -dc <work>/krg-repro-20261124234740/pkgs/kor/package/4.0.0_best_int/kor.traineddata.gz
+ sha256sum .cache/ko-ocr-factorial/eng.traineddata .cache/ko-ocr-factorial/kor.traineddata
5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747 *.cache/ko-ocr-factorial/eng.traineddata
ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992 *.cache/ko-ocr-factorial/kor.traineddata
++ pwd -W
+ GUARD=<work>/krg-repro-20261124234740/repo/research/tools/d03/guard/node-netguard.cjs
+ NODE_OPTIONS=--require=<work>/krg-repro-20261124234740/repo/research/tools/d03/guard/node-netguard.cjs
+ D03_NET_LOG=<work>/krg-repro-20261124234740/out/net.log
+ node src/ko-row-gate-run.mjs --out <work>/krg-repro-20261124234740/out/ocr-check
lecture-table-c0-same-same: ok k1=true/hangul
lecture-table-c0-same-other: ok k1=true/hangul
lecture-table-c0-below-same: ok k1=true/hangul
lecture-table-c0-below-other: ok k1=true/hangul
lecture-table-c1-same-same: ok k1=true/hangul
lecture-table-c1-same-other: ok k1=true/hangul
lecture-table-c1-below-same: ok k1=true/hangul
lecture-table-c1-below-other: ok k1=true/hangul
lecture-cards-c0-same-same: ok k1=true/hangul
lecture-cards-c0-same-other: ok k1=true/hangul
lecture-cards-c0-below-same: ok k1=true/hangul
lecture-cards-c0-below-other: ok k1=true/hangul
lecture-cards-c1-same-same: ok k1=true/hangul
lecture-cards-c1-same-other: ok k1=true/hangul
lecture-cards-c1-below-same: ok k1=true/hangul
lecture-cards-c1-below-other: ok k1=true/hangul
exhibit-table-c0-same-same: ok k1=true/hangul
exhibit-table-c0-same-other: ok k1=true/hangul
exhibit-table-c0-below-same: ok k1=true/hangul
exhibit-table-c0-below-other: ok k1=true/hangul
exhibit-table-c1-same-same: ok k1=true/hangul
exhibit-table-c1-same-other: ok k1=true/hangul
exhibit-table-c1-below-same: ok k1=true/hangul
exhibit-table-c1-below-other: ok k1=true/hangul
exhibit-cards-c0-same-same: ok k1=true/hangul
exhibit-cards-c0-same-other: ok k1=true/hangul
exhibit-cards-c0-below-same: ok k1=true/hangul
exhibit-cards-c0-below-other: ok k1=true/hangul
exhibit-cards-c1-same-same: ok k1=true/hangul
exhibit-cards-c1-same-other: ok k1=true/hangul
exhibit-cards-c1-below-same: ok k1=true/hangul
exhibit-cards-c1-below-other: ok k1=true/hangul
meeting-table-c0-same-same: ok k1=true/hangul
meeting-table-c0-same-other: ok k1=true/hangul
meeting-table-c0-below-same: ok k1=true/hangul
meeting-table-c0-below-other: ok k1=true/hangul
meeting-table-c1-same-same: ok k1=true/hangul
meeting-table-c1-same-other: ok k1=true/hangul
meeting-table-c1-below-same: ok k1=true/hangul
meeting-table-c1-below-other: ok k1=true/hangul
meeting-cards-c0-same-same: ok k1=true/hangul
meeting-cards-c0-same-other: ok k1=true/hangul
meeting-cards-c0-below-same: ok k1=true/hangul
meeting-cards-c0-below-other: ok k1=true/hangul
meeting-cards-c1-same-same: ok k1=true/hangul
meeting-cards-c1-same-other: ok k1=true/hangul
meeting-cards-c1-below-same: ok k1=true/hangul
meeting-cards-c1-below-other: ok k1=true/hangul
done: 48 rows, blocked=0
+ for f in ocr.jsonl k1.jsonl
+ cmp -s <work>/krg-repro-20261124234740/out/ocr-check/ocr.jsonl results/ko-row-gate/ocr/ocr.jsonl
+ echo 'same ocr.jsonl'
same ocr.jsonl
+ for f in ocr.jsonl k1.jsonl
+ cmp -s <work>/krg-repro-20261124234740/out/ocr-check/k1.jsonl results/ko-row-gate/ocr/k1.jsonl
+ echo 'same k1.jsonl'
same k1.jsonl
+ git status --porcelain
+ node --test test/ko-row-gate.test.mjs
✔ squash, question types and the strict value grammar (1.3997ms)
✔ exact decimals: JSON number source text is kept; decStr prints exact values (0.3961ms)
✔ W3 rule: every hand-computed case (exact decimals, shared-hit condition, breaks, reasons) (3.0151ms)
✔ W3 rule: the decision uses only question, OCR lines, K1 and the fixed W2 result (1.1501ms)
✔ pipeline: fixed #150 W1 and #151 W2 then W3 on hand-computed pages (272.9466ms)
✔ exposure: touching edges have zero intersection, one pixel row is partial, equal edges are inside (0.1555ms)
✔ candidate classification: centres in one half-open item cell and a positive ink intersection (0.397ms)
✔ prediction validation: W1/W2 by the fixed rule, W3 reason, source window and scan consistency (0.9591ms)
✔ scoring: hand-computed rows (applied target, applied decoy loss, prevented W2 loss, hold, n/a, error, unmatched, full-page recovery) (127.7555ms)
✔ summary: totals, layout verdicts and areas, lists, invariants (2.7442ms)
✔ public tables: rendered cells are checked one by one; a changed cell is found (5.2531ms)
✔ ID sets: duplicates, missing and extra ids and order are rejected (0.2912ms)
✔ row comparison catches tampers that keep every marginal total (1.7291ms)
✔ replay: fixed #151 buildPrediction joins OCR/K1/image; W3 fields follow; ids do not change the decision (1.1659ms)
✔ selector-side reader: only questions and PNGs; design, gold, render, score paths are refused (0.4402ms)
✔ fixed objects: #147 library, #150 W1 and #151 W2 written byte for byte from Git; a changed copy is refused (503.6314ms)
✔ OCR functions of the runner are the #147 runner functions byte for byte (132.4699ms)
✔ question normalization, duplicate check, and the earlier sets include #151 (0.3833ms)
✔ README reproduction commands name files that exist (0.959ms)
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1140.2368
+ python -m unittest tools/ko-row-gate/test_recount.py
............
----------------------------------------------------------------------
Ran 12 tests in 0.017s

OK
+ node --test test/ko-row-gate.test.mjs test/mcp-view-comparison.test.mjs test/n34-p10-perf.test.mjs test/r08-evidence-check.test.mjs test/r08-excerpt-parity.test.mjs test/r08-jpeg-parity.test.mjs test/r09-bilingual.test.mjs test/r09-replay.test.mjs test/run-guards.test.mjs
✔ squash, question types and the strict value grammar (1.4097ms)
✔ exact decimals: JSON number source text is kept; decStr prints exact values (0.6956ms)
✔ W3 rule: every hand-computed case (exact decimals, shared-hit condition, breaks, reasons) (5.4239ms)
✔ W3 rule: the decision uses only question, OCR lines, K1 and the fixed W2 result (1.768ms)
✔ pipeline: fixed #150 W1 and #151 W2 then W3 on hand-computed pages (310.6163ms)
✔ exposure: touching edges have zero intersection, one pixel row is partial, equal edges are inside (0.1842ms)
✔ candidate classification: centres in one half-open item cell and a positive ink intersection (0.352ms)
✔ prediction validation: W1/W2 by the fixed rule, W3 reason, source window and scan consistency (1.0419ms)
✔ scoring: hand-computed rows (applied target, applied decoy loss, prevented W2 loss, hold, n/a, error, unmatched, full-page recovery) (139.2985ms)
✔ summary: totals, layout verdicts and areas, lists, invariants (2.9973ms)
✔ public tables: rendered cells are checked one by one; a changed cell is found (5.7538ms)
✔ ID sets: duplicates, missing and extra ids and order are rejected (0.5758ms)
✔ row comparison catches tampers that keep every marginal total (1.698ms)
✔ replay: fixed #151 buildPrediction joins OCR/K1/image; W3 fields follow; ids do not change the decision (1.1196ms)
✔ selector-side reader: only questions and PNGs; design, gold, render, score paths are refused (0.4046ms)
✔ fixed objects: #147 library, #150 W1 and #151 W2 written byte for byte from Git; a changed copy is refused (523.2315ms)
✔ OCR functions of the runner are the #147 runner functions byte for byte (132.8909ms)
✔ question normalization, duplicate check, and the earlier sets include #151 (0.3813ms)
✔ README reproduction commands name files that exist (1.1834ms)
✔ PNG chunks and IHDR are read from bytes (3.7192ms)
✔ own PNG decoder matches sharp on gray and RGB, every filter type (6.7044ms)
✔ RGB derivative check: equal planes pass, one changed channel value fails (1.1984ms)
✔ overview size: never enlarged, long side 512, half-up rounding, at least 1 (0.2172ms)
✔ geometry: half-open containment, 1px inside/outside, touching edges, invalid sizes (0.2529ms)
✔ R09 projection keeps only id, matched and band (0.2204ms)
✔ projection validation stops on missing, duplicate, extra ids and illegal bands (0.5751ms)
✔ pairs and keys: 2 x 2 x 3 x n keys, each once; a missing or extra key stops the run (1.154ms)
✔ input path guard refuses gold, answer, score, render and design names (0.2692ms)
✔ original reference: actual open with hash check; missing, tampered, outside root, JPEG full frame all fail (12.2515ms)
✔ client counts match the server's own count of requests, responses and notifications (140.1548ms)
✔ original view: reference returned and opened; read counted once (135.1429ms)
✔ reference that does not verify is reported, not counted as evidence (130.7902ms)
✔ index rejection: later tools not called and marked not_called; row stays (131.028ms)
✔ region view: matched band is cropped and decoded; no match falls back to the original and reads it (151.4243ms)
✔ overview view: size checked against the rule and the decoded JPEG (270.214ms)
✔ aggregate keeps every row in the denominator and counts failures as failures (0.7411ms)
✔ runner refuses an input folder holding anything outside the allow-list (142.5033ms)
✔ runner source reads no gold, score, render or design module (0.5798ms)
✔ review Nit 1: a file whose name starts with two dots inside the root is not outside it (2.5607ms)
✔ review Minor 1: an initialize failure records no tool call and no step (0.3107ms)
✔ review Minor 1: client reports initOk false when initialize fails (118.2135ms)
✔ review Minor 2: scorer stops before scoring inputs when the evidence list is empty or partial (139.3346ms)
✔ review Minor 3: runner stops without the offline guard (122.1973ms)
✔ review Minor 4: denominator check fixes 48 ids and every key (1.084ms)
✔ PM Major 1: planned original that comes back as a full-size JPEG is a failure, not a crop (127.8879ms)
✔ PM Major 1: fallback original that comes back as a full-size JPEG is a failure (129.5665ms)
✔ PM Major 1: an original reference that also carries an image body is contradictory and fails before any read (127.9772ms)
✔ PM Major 1: a partial request answered with the original reference fails (123.1436ms)
✔ PM Major 1: a selector band covering the whole page still takes the verified original path (122.582ms)
✔ PM Major 2: the untouched prepared input matches the frozen hashes (3576.2994ms)
✔ PM Major 2: a valid but changed caller entry, question or original hash stops the run (1.3724ms)
✔ PM Major 2: the runner refuses a changed caller assignment before starting any server (136.6985ms)
✔ budget: request example, reserve subtracted once (0.8463ms)
✔ budget: preregistered constants (0.6228ms)
✔ budget: entry boundaries (exact passes, 1 ms short fails) and no new command at 0 (0.4008ms)
✔ budget: timeout cause (m-1): strict < is budget-limited, equality is the individual cap (0.2668ms)
✔ budget: overrun record separates work, finalization and cap (0.1927ms)
✔ raw stages: every stage is complete with its allowed absences (1.107ms)
✔ raw stages: removing a required field is recorded; only V becomes I(raw) (0.6911ms)
✔ raw stages: mandatory applyRawCheck turns only a would-be pass into invalid (0.2592ms)
✔ n-1: run3 info rule accepts child-completed invalid rows; P10 does not (1.4914ms)
✔ dispositions: plan 8.4 R1 matrix (4.1088ms)
✔ mandatory block priority (plan 6.3) and exit codes (0.4246ms)
✔ m-2 memory: a complete row keeps its CAND OOM failure; an incomplete row is missing_runs (1.1063ms)
✔ ownership: no kill for unowned, bad pid, spawn error, exit/signal codes, exit or close seen (0.5834ms)
✔ ownership: taskkill failure falls back to child.kill only while still owned and live (0.2014ms)
✔ ownership: fail closed when the runtime lifecycle premise is not confirmed (M-2) (0.0933ms)
✔ cleanup evidence: close and a successful tree kill are both required (0.0938ms)
fatal: path 'research/results/n34-p10/perf-p10run1-memory.json' does not exist in '3f328952ddbd6c12aca01890670353b9368b33cb'
fatal: path 'research/results/n34-p10/perf-p10run1-timing.json' does not exist in '3654db1190abd0276895609c2221deccfbf91863'
fatal: path 'research/results/n34-p10/perf-p10run1-memory.json' does not exist in 'd1d4341bb1bd270d7bd112ece8850f44de70e6ef'
fatal: path 'research/results/n34-p10/perf-p10run1-memory.json' does not exist in 'cedb852c6857640a21cbe49fc55e167f07e64a5a'
✔ ownership: real root + grandchild timeout fixture is killed and closed (3339.8011ms)
✔ copy guard: runner matches the pinned run3 delta; negative controls fail (19.0974ms)
✔ raw chain: exact Ht -> Hm and Hm -> Hi raw-only commits pass (1144.4056ms)
✔ raw chain: every deviation is refused (7997.5764ms)
✔ receipts: format and parse one line; duplicates and garbage are rejected (0.3139ms)
✔ refusal: one JSON line with exit 1 and no secrets or absolute paths (0.0949ms)
✔ self-check output: must be outside the repository and never an official name or folder (0.3325ms)
✔ runner: timing -> memory -> info through the real orchestration, chain and receipts (708.4798ms)
✔ runner: memory refuses without the exact timing raw commit; info refuses a hand-edited pass (223.1627ms)
✔ runner: timing start HEAD must equal --prereg (m-6) and existing output is refused (237.3153ms)
✔ runner: budget notRun rows make the timing block invalid 5 after the last started row (109.7015ms)
✔ runner: build stopped by the budget is build_incomplete/invalid 5; other build errors are error 1 (37.4501ms)
✔ runner: correctness failure keeps priority 3 and stops the timing block (39.4528ms)
✔ runner (n-2): a slow final save past C turns pass into error 1 and is saved again (212.7022ms)
✔ runner (n-2): a failed final save never prints a success receipt (177.7216ms)
✔ runner: partial raw is saved as incomplete while the block runs (parent abort evidence) (206.8279ms)
✔ runner (plan 6.2): each child pid and spawn times are saved before the child closes (237.271ms)
✔ primary r1 R1: a prior pass is re-derived from its raw data; contradictions and damage are refused (6852.7775ms)
✔ primary r1 R2: receipt schema, budget arithmetic and error fields (1348.0488ms)
✔ primary r1 R3: info snapshot assertion failures are integrity D-4; install errors stay D-2 (2781.5818ms)
✔ primary r1 R5: an npm log write failure settles the block (error 1, finalization, receipt) (51.5261ms)
✔ primary r1 M1: block-end kills re-evaluate the remaining total budget per child (0.5854ms)
✔ primary r1 R4: parent-abort recovery never kills from a stored pid and parent-observed times (0.3456ms)
✔ primary r2 R2-01: falsy and non-object receipts never skip the receipt checks (7431.2278ms)
✔ primary r2 R2-03: the calibration ladder must be the worker sequence with the earliest convergence (5937.5288ms)
✔ primary r2 R2-02: the producer records a per-spawn childId and the real lifecycle order (211.4507ms)
✔ primary r2 R2-02: sequential PID reuse is accepted; wrong child links and lifecycle contradictions are refused (6167.1915ms)
✔ runner: check-only and node --test never start a product measurement (1567.6698ms)
✔ identical evidence passes (2.2408ms)
✔ a checkout at another path (only the 8 capture hashes change, matching the actual files) passes (0.2502ms)
✔ a CRLF working copy of the committed files passes (0.2273ms)
✔ one changed goldLine in the first file (excerpt-keys.jsonl) fails even though later files are equal (0.3138ms)
✔ a changed figure inside the summary fails (0.3212ms)
✔ a capture hash that does not match the actual file fails (0.1366ms)
✔ a changed path-independent raw hash (bench rows) still fails (0.1379ms)
✔ a changed JPEG summary, a missing file or a missing capture hash fails (0.2553ms)
✔ clean input has no failures and every key compares equal (13.5692ms)
✔ a duplicate key fails (0.7764ms)
✔ a missing bench row fails (1.0914ms)
✔ an extra key fails (0.9808ms)
✔ a wrong bundle hash fails (1.4855ms)
✔ a log whose bytes do not match the manifest fails (0.7956ms)
✔ a capture that drifted from the excerpt-bench row fails (0.6758ms)
✔ a missing run for a role fails (0.4634ms)
✔ disagreeing repetitions hold the key instead of comparing it (0.8427ms)
✔ a range difference between versions is reported per key (1.0335ms)
✔ normalization drops path and artifactId, maps a legacy single excerpt to position 1, marks moreMatches absent (0.2287ms)
✔ held keys and stored-row differences are attention items, not silent success (0.8029ms)
✔ a field present only in the rerun row is listed, not hidden (0.5941ms)
✔ the same capture used for both repetitions fails (0.4201ms)
✔ one capture and its config given twice as repetition 1 fails (repetition IDs must be 1 and 2) (0.2872ms)
✔ a stored comparison against a role that does not exist fails instead of comparing nothing (0.6672ms)
✔ a stored comparison reports the rows actually joined and fails when fewer rows join than are stored (2.0632ms)
✔ planned repetitions must be at least two distinct IDs (0.9832ms)
✔ the CLI plan is fixed: a config whose reps differ from [1, 2] is rejected (0.3949ms)
✔ identical probe rows have no failures or differences (1.6943ms)
✔ duplicate, missing and extra probe rows fail (0.2682ms)
✔ a changed validator outcome is reported per field (0.2485ms)
✔ a row whose bytes were not reproduced is not counted as identical (0.1356ms)
✔ entry calls agree with the validator rows (0.3882ms)
✔ an entry call that disagrees with the validator is counted, and missing or duplicate calls fail (0.3599ms)
✔ every probe column is compared, including file, kind, arms and slot count (0.1948ms)
✔ unreproduced files, probe differences and entry disagreements are attention items (0.5017ms)
✔ entry outcomes name the APP0 control profile (0.1947ms)
✔ entry meta must name the expected bundle, slot ledger and fixture count (0.5773ms)
✔ outward rounding: floor top-left, ceil bottom-right (1.2504ms)
✔ half-open containment: exact boundary passes, 1px cut on any side fails (0.1505ms)
✔ small window holding every gold part is the only primary success (0.2054ms)
✔ boundary-exact window succeeds; a window 1px short on the right is a partial miss (0.1255ms)
✔ full-frame results never count as primary success but keep the evidence (0.091ms)
✔ errors and invalid outputs are technical failures, kept apart from no-match (0.1317ms)
✔ alignRecords refuses missing, extra or duplicated image records (0.4792ms)
✔ pair statistics: KO-EN over the fixed denominator, 2x2 table, missing as failure plus bounds (0.3263ms)
✔ pair statistics refuse a pair with a missing language outcome (0.1463ms)
✔ held-out design: 24 pairs, 48 images, fixed keys, no answer exposure (25.2714ms)
✔ design check catches a broken pair, an exposed answer and a Korean ASCII leak (18.6154ms)
✔ dev fixture is separate: different doc type, layout and page size (1.086ms)
✔ expected size fits inside 1536 without enlargement (1.2327ms)
✔ matched -> cropTransform JPEG of the window size; no match -> armTransform full frame; errors not replayed (28.4115ms)
✔ C2 estimate covers both calls and exceeds a single-call slot (0.8269ms)
✔ C2 answer call is bounded by the worst-case crop, not the smaller variant (PR #33 re-review) (0.1911ms)
✔ C2 estimate bounds the pilot-003 case the PR #33 review cited (actual $0.003145) (0.0975ms)
✔ fingerprint ignores key order and changes with any field (0.585ms)
✔ resume is refused when settings differ or the stored config predates the guard (3.3016ms)
ℹ tests 152
ℹ suites 0
ℹ pass 152
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47166.9685
exit 0
