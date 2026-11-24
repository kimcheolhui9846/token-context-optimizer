# ko-row-height — W2 세로 제한 재현 안내

프로토콜: `research/plans/2026-11-24-ko-row-height-protocol.md`. 검산 명세: `research/tools/ko-row-height/RECOUNT_SPEC.md`. 결과와 해석: 같은 폴더의 `RESULTS.md`.

## 0. 원칙: 무엇을 읽고 어디에 쓰는가

- **새 출력은 모두 저장소 밖 작업 폴더 `$W/out` 아래에 쓴다.** 실행기·재생·채점·배치 명령은 `--out`/`--data` 대상이 이미 있으면 거부한다(`--out must not exist yet`). 그래서 게시된 `results/ko-row-height/` 아래 폴더를 출력 대상으로 주지 않는다. 이 안내의 어떤 명령도 파일을 지우거나 게시된 파일을 덮어쓰지 않는다.
- 저장소 안에 쓰는 것은 Git이 무시하는 캐시뿐이다.
  - `research/.cache/ko-row-height/fixed/`: 고정 #147 K1 lib와 #150 W1 lib를 Git blob에서 꺼낸 사본. 재생·채점이 자동으로 만든다.
  - `research/.cache/ko-ocr-factorial/`: 언어 파일. 6절의 선택 OCR에서만 쓴다.
  - 각 절 끝에서 `git status --porcelain`이 빈 출력인지 확인한다.
- **게시된(공개) 입력:**

| 입력 | 위치 | 읽는 명령 |
|---|---|---|
| 동결 자료 | Git 커밋 `13a26d8`의 `research/results/ko-row-height/data/` | `replay`, `score`, `run`. `ko-row-height-data.mjs`의 `DATA_COMMIT`·`MANIFEST_SHA256`로 고정한다. 작업 트리 파일이 아니라 Git 객체를 읽고 `manifest.json`으로 대조한다 |
| 동결 OCR·K1 | 작업 트리 `results/ko-row-height/ocr/` | `replay`. `freeze.json`의 SHA-256으로 대조한다 |
| 자료 폴더 사본 | 작업 트리 `results/ko-row-height/data/` | `recount.py --data`. 폴더 파일을 읽고 `manifest.json`과 대조한다 |

- **새로 생성한 입력**(5절의 자료 재생성, 6절의 새 OCR)은 게시본과 바이트를 대조하는 데만 쓴다. 재생·채점은 5·6절의 출력을 읽지 않는다.
- **두 경로를 구분한다.**
  - 1–4절(필수)은 공개된 동결 OCR을 재생하는 경로다. OCR을 다시 돌리지 않는다.
  - 6절(선택)은 같은 쪽을 새로 OCR해 보는 별도 검증 경로다.
- 셸은 bash다(Linux·macOS·Windows Git Bash). 명령은 위에서부터 같은 셸에서 차례로 실행한다.

## 1. 준비 (네트워크 사용, 측정 아님)

```sh
# 빈 외부 작업 폴더를 한 번 만든다. 이미 있으면 mkdir가 실패하므로 멈추고 다른 이름을 쓴다.
W="${TMPDIR:-/tmp}/krh-repro-$(date +%Y%m%d%H%M%S)"
mkdir "$W"
W="$(cd "$W" && (pwd -W 2>/dev/null || pwd))"     # Git Bash에서는 C:/... 형식(Node·Python이 그대로 읽는다)
mkdir "$W/out"

# 공개 저장소와 PR ref. 고정 객체는 #145(fcp), #147(K1 lib), #148(이전 한국어 자료), #149(코호트), #150(W1 lib)에 있다.
git clone https://github.com/kimcheolhui9846/token-context-optimizer.git "$W/repo"
cd "$W/repo"
git fetch origin pull/151/head:krh-pr151 pull/145/head:krh-pr145 pull/147/head:krh-pr147 \
  pull/148/head:krh-pr148 pull/149/head:krh-pr149 pull/150/head:krh-pr150
git checkout krh-pr151                             # merge 뒤라면 main을 써도 된다
for o in 0fb30531aabaa9f55b8c9fdc34ee9d03042936c1 708d9946ae091180a1b716baadfdd73fcfe5a19b \
         c0c2f5dd4178df3e02595176525cf88b2eaf68c2 2ab9ed149896cc06cec387826ab99fa5bac77cda \
         fd7ba06e496437c7fc799348a95f649e85d87d7b b108e2f0983bf096b4ddfc5d204a4d99cd6d8535 \
         13a26d887c2f00e5d022a7d950eceac38135c31b; do git cat-file -t $o; done   # 7줄 모두 commit

# 연구 의존성(연구 lockfile 그대로)
cd research
npm ci --ignore-scripts
node -p "require('tesseract.js/package.json').version + ' ' + require('tesseract.js-core/package.json').version"   # 5.1.1 5.1.1
git status --porcelain                             # 빈 출력
```

## 2. 재생 A/B, 채점, A/B 비교 (공개 동결 OCR 사용, OCR 재실행 없음)

```sh
node src/ko-row-height-replay.mjs --ocr results/ko-row-height/ocr --out "$W/out/replay-a"
node src/ko-row-height-score.mjs --replay "$W/out/replay-a" --out "$W/out/score-a"
node src/ko-row-height-replay.mjs --ocr results/ko-row-height/ocr --out "$W/out/replay-b"
node src/ko-row-height-score.mjs --replay "$W/out/replay-b" --out "$W/out/score-b"
node src/ko-row-height-compare.mjs --a "$W/out" --out "$W/out/ab-compare.json"          # reproduced: true

# 새 출력과 게시본의 바이트 대조(재생·채점 A/B 각 파일). 모두 same이어야 한다.
for x in a b; do
  for f in predictions.jsonl inputs.json freeze.json; do
    cmp -s "$W/out/replay-$x/$f" results/ko-row-height/replay-a/$f && echo "same replay-$x/$f" || echo "DIFF replay-$x/$f"; done
  for f in score.jsonl summary.json; do
    cmp -s "$W/out/score-$x/$f" results/ko-row-height/score-a/$f && echo "same score-$x/$f" || echo "DIFF score-$x/$f"; done
done
cmp -s "$W/out/ab-compare.json" results/ko-row-height/ab-compare.json && echo "same ab-compare.json"
```

- 기대 출력: 예측 `sha256 3495db46…`, 채점 `strict W0 20 W1 48 W2 42 /48; L 6/48; J 21/27`.
- `score-meta.json`의 `predictionsCommittedAtHead`는 외부 경로라 `false`다. 실행 기록일 뿐 판정에 쓰지 않는다. 게시본에서는 예측 동결 커밋 직후 채점해 `true`였다.
- 게시된 `replay-b`·`score-b`도 A와 바이트가 같으므로 A 하나와 대조한다.

## 3. 공개 표 (기계 생성과 칸 단위 대조)

```sh
cp results/ko-row-height/RESULTS.md "$W/out/RESULTS.md"
node src/ko-row-height-report.mjs --score "$W/out/score-a" --results "$W/out/RESULTS.md" --write   # 사본의 표 블록만 다시 채운다
cmp -s "$W/out/RESULTS.md" results/ko-row-height/RESULTS.md && echo "same RESULTS.md"
node src/ko-row-height-report.mjs --score "$W/out/score-a" --results results/ko-row-height/RESULTS.md  # 게시본은 읽기만: mismatches 0
```

## 4. 독립 검산(Python 표준 라이브러리)과 변조 10종

```sh
mkdir "$W/out/recount"
for x in a b; do
  python tools/ko-row-height/recount.py --data results/ko-row-height/data --ocr results/ko-row-height/ocr \
    --replay "$W/out/replay-$x" --score "$W/out/score-$x" --results results/ko-row-height/RESULTS.md \
    --out "$W/out/recount/recount-$x.json"                                              # {"ok": true, "failed": []}
done
python tools/ko-row-height/recount.py --data results/ko-row-height/data --ocr results/ko-row-height/ocr \
  --replay "$W/out/replay-a" --score "$W/out/score-a" --results results/ko-row-height/RESULTS.md \
  --mutate "$W/out/recount/mutation.json"                                               # {"allRejected": true, "tampers": 10}
cmp -s "$W/out/recount/mutation.json" results/ko-row-height/recount/mutation.json && echo "same mutation.json"
git status --porcelain                             # 빈 출력
```

- 변조는 기록 파일의 메모리 사본에 넣는다. 디스크의 파일은 바꾸지 않는다.
- 변조 10종: t12 교환, 절감 픽셀 교환, 일부↔전혀 교환, 노출 분류 변경, 예측 W2 1px, ID 중복, ID 누락, 정답 상자 1px, K1 적중 변조, 공개 표 칸.

## 5. 자료 재생성 검사 (선택, 글꼴 필요)

글꼴 `NotoSansKR-VF.ttf`(버전 2.04)는 시스템 설치본을 쓰고 저장소에 넣지 않는다. 해시가 다르면 이 절을 건너뛴다. 1–4절에는 필요 없다.

```sh
F=/c/Windows/Fonts/NotoSansKR-VF.ttf                # 자기 환경의 경로로 바꾼다
echo "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0  $F" | sha256sum -c -
python -m venv "$W/venv"
PY="$W/venv/bin/python"; [ -x "$PY" ] || PY="$W/venv/Scripts/python.exe"
"$PY" -m pip install pillow==12.3.0 fonttools==4.63.0          # tools/d03/requirements.txt와 같은 핀
mkdir "$W/out/gen"
"$PY" tools/ko-row-height/design.py --out "$W/out/gen" --font "$F"                                # problems []
"$PY" tools/r09/render.py --design "$W/out/gen/design.json" --font "$F" --out "$W/out/gen"         # failedImages 0
node src/ko-row-height-data.mjs assemble --from "$W/out/gen" --data "$W/out/data"
node src/ko-row-height-data.mjs check --data "$W/out/data"                                      # ok true, 이전 세트와 겹침 0
node src/ko-row-height-data.mjs manifest --data "$W/out/data"                                   # sha256 6e3e4bd2…0b07
(cd "$W/out/data" && find . -type f | LC_ALL=C sort | xargs sha256sum) > "$W/out/data-new.sha256"
(cd results/ko-row-height/data && find . -type f | LC_ALL=C sort | xargs sha256sum) > "$W/out/data-pub.sha256"
diff "$W/out/data-new.sha256" "$W/out/data-pub.sha256" && echo "data identical"                 # 55개 파일
```

`check`는 이전 자료 세트(r09, fcp, #148, #149 코호트, #150)를 1절에서 받은 Git 객체에서 읽어 이미지·질문 겹침을 센다.

## 6. 별도 OCR 검증 (선택, CPU, 공식 결과 아님)

공개 결과는 동결 OCR(`results/ko-row-height/ocr/`)을 재생한 것이다. 이 절은 같은 48쪽을 새로 OCR해 게시본과 비교만 한다. 엔진·언어 파일·플랫폼이 다르면 바이트가 달라질 수 있다. 그 경우는 환경 차이로 기록하고 공식 재현 성공으로 세지 않는다(프로토콜 4.1).

```sh
# 언어 파일: 버전 고정 공개 패키지 @tesseract.js-data/{eng,kor}@1.0.0의 4.0.0_best_int
mkdir "$W/pkgs" .cache/ko-ocr-factorial            # 이미 있으면 실패한다. 멈추고 확인한다
(cd "$W/pkgs" && npm pack @tesseract.js-data/eng@1.0.0 @tesseract.js-data/kor@1.0.0)
echo "285a3f1fb419e8e67bdee93ce288b02bb9097f0a  $W/pkgs/tesseract.js-data-eng-1.0.0.tgz" | sha1sum -c -   # npm dist.shasum
echo "af4c18b31384e8979ba583496c0445132392fb96  $W/pkgs/tesseract.js-data-kor-1.0.0.tgz" | sha1sum -c -
# tar에는 상대 경로만 준다(Git Bash의 GNU tar는 C:/... 를 원격 호스트로 읽는다).
for l in eng kor; do mkdir "$W/pkgs/$l" && (cd "$W/pkgs/$l" && tar -xzf ../tesseract.js-data-$l-1.0.0.tgz) \
  && gzip -dc "$W/pkgs/$l/package/4.0.0_best_int/$l.traineddata.gz" > .cache/ko-ocr-factorial/$l.traineddata; done
sha256sum .cache/ko-ocr-factorial/eng.traineddata .cache/ko-ocr-factorial/kor.traineddata
# eng 5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747 (5199098 bytes)
# kor ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992 (2208378 bytes)

# 오프라인 가드를 켜고 한 번 실행한다(네트워크 시도는 차단·기록된다).
GUARD="$(pwd -W 2>/dev/null || pwd)/tools/d03/guard/node-netguard.cjs"
NODE_OPTIONS="--require=$GUARD" D03_NET_LOG="$W/out/net.log" node src/ko-row-height-run.mjs --out "$W/out/ocr-check"   # done: 48 rows, blocked=0
for f in ocr.jsonl k1.jsonl; do cmp -s "$W/out/ocr-check/$f" results/ko-row-height/ocr/$f && echo "same $f" || echo "DIFF $f (환경 차이로 기록)"; done
git status --porcelain                             # 빈 출력(.cache는 Git 무시)
```

- 실행기는 시작 전에 다음을 확인한다: 고정 lib와 선택기, OCR 함수 본문, 실행 코드가 HEAD와 같은지, 엔진 버전, 언어 파일 해시, 동결 자료 커밋. 하나라도 어긋나면 `stop.json`만 쓰고 종료 2로 끝난다.
- 새 OCR로 재생까지 해 보려면 `--ocr "$W/out/ocr-check"`로 2절 명령을 다른 새 출력 폴더에 실행한다. 이것도 비교용이다.

## 7. 시험

```sh
node --test test/ko-row-height.test.mjs                     # 16/16
python -m unittest tools/ko-row-height/test_recount.py      # 9 tests OK
node --test test/*.test.mjs                                 # 연구 전체
```
