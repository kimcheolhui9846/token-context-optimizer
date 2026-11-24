# ko-row-height — W2 세로 제한 재현 안내

프로토콜: `research/plans/2026-11-24-ko-row-height-protocol.md`. 검산 명세: `research/tools/ko-row-height/RECOUNT_SPEC.md`.
결과 해석은 같은 폴더의 `RESULTS.md`(채점 뒤 작성)에 있다. 아래 명령은 모두 `research/`에서 실행한다. `<G>`, `<data>` 같은 자리는 새 빈 폴더다.

## 1. 자료 (동결 전 1회)

```
python tools/ko-row-height/design.py --out <G> --font <NotoSansKR-VF.ttf>
python tools/r09/render.py --design <G>/design.json --font <NotoSansKR-VF.ttf> --out <G>
node src/ko-row-height-data.mjs assemble --from <G> --data results/ko-row-height/data
node src/ko-row-height-data.mjs check --data results/ko-row-height/data
node src/ko-row-height-data.mjs manifest --data results/ko-row-height/data
```

글꼴은 저장소에 넣지 않는다(SHA-256은 프로토콜 3.2). 생성기와 렌더러는 결정적이라 같은 글꼴이면 같은 바이트가 나온다.

## 2. OCR 1회와 K1 동결

```
NODE_OPTIONS=--require=<research/tools/d03/guard/node-netguard.cjs> D03_NET_LOG=<log> \
  node src/ko-row-height-run.mjs --out results/ko-row-height/ocr
```

선택기 측 허용 목록(`selector/questions.json`, `selector/images/*.png`)만 읽는다. 48쪽 각 1회, 작업자 1개, 순서는 질문 순서다.

## 3. 재생 A/B, 채점, 비교

```
node src/ko-row-height-replay.mjs --ocr results/ko-row-height/ocr --out results/ko-row-height/replay-a
node src/ko-row-height-score.mjs --replay results/ko-row-height/replay-a --out results/ko-row-height/score-a
node src/ko-row-height-replay.mjs --ocr results/ko-row-height/ocr --out results/ko-row-height/replay-b
node src/ko-row-height-score.mjs --replay results/ko-row-height/replay-b --out results/ko-row-height/score-b
node src/ko-row-height-compare.mjs --a results/ko-row-height --out results/ko-row-height/ab-compare.json
```

A/B는 같은 동결 OCR을 다시 읽는 결정성 확인이며 독립 OCR 반복이 아니다. 예측 파일은 채점 전에 커밋한다.

## 4. 공개 표와 독립 검산

```
node src/ko-row-height-report.mjs --score results/ko-row-height/score-a --results results/ko-row-height/RESULTS.md
python tools/ko-row-height/recount.py --data results/ko-row-height/data --ocr results/ko-row-height/ocr \
  --replay results/ko-row-height/replay-a --score results/ko-row-height/score-a \
  --results results/ko-row-height/RESULTS.md --out results/ko-row-height/recount/recount-a.json
python tools/ko-row-height/recount.py ... --mutate results/ko-row-height/recount/mutation.json
```

`report.mjs`에 `--write`를 붙이면 `RESULTS.md`의 `<!-- krh:table NAME -->` 블록을 `summary.json`에서 다시 채운다. 붙이지 않으면 칸마다 비교만 한다.

## 5. 시험

```
node --test test/ko-row-height.test.mjs
python -m unittest tools/ko-row-height/test_recount.py
```

고정 객체(#147 K1 라이브러리, #150 W1 blob `6c23fc16…`)는 Git에서 `research/.cache/ko-row-height/fixed/`로 바이트 그대로 꺼내 쓴다. 새 클론에서 옛 커밋 객체가 없으면 `git fetch origin <커밋>`으로 받는다.
