# ko-row-window: 새 한국어 48쪽에서 같은 행 단어로 창 넓히기(W1) 대 W0 — 자료와 재현

프로토콜: [`research/plans/2026-11-24-ko-row-window-protocol.md`](../../plans/2026-11-24-ko-row-window-protocol.md). 결과: [`RESULTS.md`](RESULTS.md). 검산 명세: [`research/tools/ko-row-window/RECOUNT_SPEC.md`](../../tools/ko-row-window/RECOUNT_SPEC.md).

## 폴더

| 경로 | 내용 | 결정적 |
|---|---|---|
| `data/` | 동결 자료: `design.json`(채점 측), `questions.json`(선택기 측), `images/` 48장, `gold.json`, `render.json`, `render-check.json`, `checks.json`(OCR 전 검사), `manifest.json`(파일별 SHA-256) | 예 |
| `ocr/` | O1(`eng+kor`) OCR 1회: `ocr.jsonl` 48행(원시 줄·단어 xywh), `k1.jsonl` 48행(고정 K1 기록), `freeze.json`, `guard-summary.json` | 예 |
| `ocr/run-meta.json` | 시각, 페이지별 시간, PID, 워커 사건 | 아니오 |
| `replay-{a,b}/` | 같은 동결 OCR의 재생: `predictions.jsonl` 48행(W0·W1·사유·후보), `freeze.json` | 예 |
| `score-{a,b}/` | `score.jsonl` 48행(W0·W1 판정, 전이, 면적, 새 잉크), `summary.json`(단계·그룹·면적·목록) | 예 |
| `score-{a,b}/score-meta.json` | 채점 때의 HEAD, 예측 파일이 HEAD에 커밋된 상태였는지 | 아니오 |
| `ab-compare.json` | 재생 A/B 바이트·행 비교(같은 OCR의 결정성 확인) | 예 |
| `recount/` | 독립 Python 검산(`recount-a.json`, `recount-b.json`), 변조 점검(`mutation.json`) | 예 |
| `logs/` | RED 기록, 실행 기록 | — |

## 재현

POSIX 셸(Git Bash 또는 bash)에서 블록을 순서대로 같은 셸 세션에 붙여 넣는다. 클론·언어 패키지·출력은 저장소 밖 새 작업 폴더 `$W`에 둔다. 언어 파일만 실행기가 요구하는 `research/.cache/ko-ocr-factorial/`(Git 무시)에 둔다. 고정 #147 라이브러리는 실행 때 `research/.cache/ko-row-window/fixed/`에 Git 객체에서 바이트 그대로 꺼낸다.

### 1. 새 클론과 고정 객체 (네트워크, 측정 아님)

```sh
W="$(mktemp -d)" && cd "$W" && W="$(pwd -W 2>/dev/null || pwd)"   # 저장소 밖 새 빈 작업 폴더
git clone https://github.com/kimcheolhui9846/token-context-optimizer.git "$W/repo"
cd "$W/repo"
git fetch origin pull/150/head:refs/remotes/origin/pr150 pull/147/head pull/148/head pull/149/head pull/145/head
git checkout --detach origin/pr150                                    # 또는 결과 커밋 SHA
for c in c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda fd7ba06e496437c7fc799348a95f649e85d87d7b 708d9946ae091180a1b716baadfdd73fcfe5a19b; do git cat-file -t $c; done   # 모두 commit
cd research && npm ci --ignore-scripts                                # 위치: $W/repo/research
```

### 2. 언어 파일 (네트워크, 측정 아님; 위치 `$W/repo/research`)

```sh
T="$W/ocr-pkg"; C=.cache/ko-ocr-factorial
mkdir "$T" && mkdir -p "$C"
(cd "$T" && npm pack @tesseract.js-data/eng@1.0.0 @tesseract.js-data/kor@1.0.0)
mkdir "$T/eng" "$T/kor"
(cd "$T/eng" && tar -xzf ../tesseract.js-data-eng-1.0.0.tgz) && (cd "$T/kor" && tar -xzf ../tesseract.js-data-kor-1.0.0.tgz)   # 상대 경로: Git Bash tar는 C: 경로를 원격 호스트로 읽는다
gzip -dc "$T/eng/package/4.0.0_best_int/eng.traineddata.gz" > "$C/eng.traineddata"
gzip -dc "$T/kor/package/4.0.0_best_int/kor.traineddata.gz" > "$C/kor.traineddata"
echo "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747  $C/eng.traineddata" | sha256sum -c -
echo "ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992  $C/kor.traineddata" | sha256sum -c -
```

### 3. 자료 재생성 검사 (OCR 없음; 위치 `$W/repo/research`)

글꼴 `NotoSansKR-VF.ttf`(SHA-256 `018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0`)는 설치된 시스템 글꼴을 쓰며 저장소에 넣지 않는다. 경로는 환경에 맞게 `F`에 넣는다(Windows 예: `/c/Windows/Fonts/NotoSansKR-VF.ttf`). Python 3.12, Pillow 12.3.0(FreeType 2.14.3, raqm 없음), fontTools.

```sh
F=/c/Windows/Fonts/NotoSansKR-VF.ttf
echo "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0  $F" | sha256sum -c -
G="$W/regen" && mkdir "$G"
python tools/ko-row-window/design.py --out "$G" --font "$F"                   # {"pages": 48, "problems": []}
python tools/r09/render.py --design "$G/design.json" --font "$F" --out "$G"    # failedImages 0
node src/ko-row-window-data.mjs check --data "$G"                            # ok: true
for f in design.json questions.json gold.json render.json render-check.json checks.json; do cmp "$G/$f" results/ko-row-window/data/$f && echo "same $f"; done
for p in results/ko-row-window/data/images/*.png; do cmp "$p" "$G/images/$(basename "$p")" || echo "DIFF $p"; done
```

### 4. 측정 재현 (오프라인 가드; 위치 `$W/repo/research`)

OCR 실행은 `eng+kor` 워커 하나로 48쪽을 한 번씩 인식한다. 재생 A·B는 같은 OCR 폴더를 읽는다.

```sh
O="$W/out" && mkdir "$O"
export NODE_OPTIONS="--require=$(pwd)/tools/d03/guard/node-netguard.cjs" D03_NET_LOG="$O/net.jsonl"
D03_STEP=krw-ocr node src/ko-row-window-run.mjs --out "$O/ocr"
D03_STEP=krw-a node src/ko-row-window-replay.mjs --ocr "$O/ocr" --out "$O/replay-a"
D03_STEP=krw-a node src/ko-row-window-score.mjs --replay "$O/replay-a" --out "$O/score-a"
D03_STEP=krw-b node src/ko-row-window-replay.mjs --ocr "$O/ocr" --out "$O/replay-b"
D03_STEP=krw-b node src/ko-row-window-score.mjs --replay "$O/replay-b" --out "$O/score-b"
node src/ko-row-window-compare.mjs --a "$O" --out "$O/ab-compare.json"         # reproduced: true
unset NODE_OPTIONS D03_NET_LOG
grep -c '"blocked"' "$O/net.jsonl" || true                                     # 0
```

게시된 OCR로 재생·채점만 다시 하려면 `--ocr results/ko-row-window/ocr`를 쓴다. 같은 엔진·언어 파일·입력에서 새 OCR이 게시본과 바이트까지 같다고 가정하지 않는다(다르면 그 차이를 적는다).

### 5. 독립 검산·시험 (위치 `$W/repo/research`)

```sh
R=results/ko-row-window
python tools/ko-row-window/recount.py --data $R/data --ocr $R/ocr --replay $R/replay-a --score $R/score-a --out "$W/recount-a.json"   # 종료 0
python tools/ko-row-window/recount.py --data $R/data --ocr $R/ocr --replay $R/replay-b --score $R/score-b --out "$W/recount-b.json"   # 종료 0
python tools/ko-row-window/recount.py --data $R/data --ocr $R/ocr --replay $R/replay-a --score $R/score-a --mutate "$W/mutation.json" # allRejected true
python -m unittest tools/ko-row-window/test_recount.py
node --test test/ko-row-window.test.mjs
```

## 사용 파일

`src/ko-row-window-run.mjs`(OCR 1회·K1), `src/ko-row-window-replay.mjs`(W0·W1 예측), `src/ko-row-window-score.mjs`(채점), `src/ko-row-window-compare.mjs`(A/B), `src/ko-row-window-data.mjs`(자료 검사·매니페스트), `src/ko-row-window-lib.mjs`(규칙), `src/ko-row-window-fixed.mjs`(고정 #147 객체), `tools/ko-row-window/design.py`(생성기), `tools/ko-row-window/recount.py`(독립 검산).
