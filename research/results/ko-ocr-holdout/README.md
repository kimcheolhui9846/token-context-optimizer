# ko-ocr-holdout: 새 합성 문서 96쪽에서 한국어 OCR × 한글 검색 키 4조건 — 자료와 재현

프로토콜: [`research/plans/2026-11-24-ko-ocr-holdout-protocol.md`](../../plans/2026-11-24-ko-ocr-holdout-protocol.md). 결과: [`RESULTS.md`](RESULTS.md)

## 폴더

| 경로 | 내용 | 결정적 |
|---|---|---|
| `data/` | 동결 자료: `design.json`(채점 측), `questions.json`(선택기 측), `images/` 96장, `gold.json`, `render.json`, `render-check.json`, `checks.json`(동결 전 검사), `manifest.json`(파일별 SHA-256) | 예 |
| `run-{a,b}/predictions.jsonl` | 192행 = O0·O1 × 96쪽, 행마다 K0·K1 키 결과(#147 고정 `keyResults`) | 예 |
| `run-{a,b}/ocr.jsonl` | 같은 순서의 원시 OCR 줄·단어 | 예 |
| `run-{a,b}/freeze.json` | 위 두 파일의 원바이트 SHA-256(채점 전 고정) | 예 |
| `run-{a,b}/guard-summary.json` | 가드 차단 수, 언어 파일, 엔진, 고정 blob, 자료 커밋 | 예 |
| `run-{a,b}/run-meta.json` | 시각, 페이지별 시간, PID, 워커 사건 | 아니오 |
| `score-{a,b}/score.jsonl` | 384행 = 4조건 × 96쪽 판정(기준 집단은 run A O0K0) | 예 |
| `score-{a,b}/summary.json` | 기준 집단, 분해, 주 집단 회복, 전이, 대응 2×2 | 예 |
| `comparison.json` | run A/B 바이트·행 비교 | 예 |
| `recount/` | 독립 Python 검산 결과 | 예 |
| `logs/` | RED 실행 기록 | — |

## 재현

POSIX 셸(Git Bash 또는 bash)에서 블록을 순서대로 같은 셸 세션에 붙여 넣는다. 클론·언어 패키지·측정 출력·가드 기록은 저장소 밖 새 작업 폴더 `$W`에 둔다. 언어 파일만 실행기가 요구하는 `research/.cache/ko-ocr-factorial/`(Git 무시)에 둔다. 고정 #147 라이브러리는 실행 때 `research/.cache/ko-ocr-holdout/fixed/`에 Git 객체에서 그대로 꺼낸다.

### 1. 새 클론과 고정 객체 (네트워크, 측정 아님)

```sh
W="$(mktemp -d)" && cd "$W" && W="$(pwd -W 2>/dev/null || pwd)"   # 저장소 밖 새 빈 작업 폴더
git clone https://github.com/kimcheolhui9846/token-context-optimizer.git "$W/repo"
cd "$W/repo"
git fetch origin pull/148/head:refs/remotes/origin/pr148 pull/147/head pull/145/head
git checkout --detach origin/pr148                                    # 또는 고정 커밋 SHA
git cat-file -t c0c2f5dd4178df3e02595176525cf88b2eaf68c2              # commit (#147 고정 라이브러리·실행기)
git cat-file -t 708d9946ae091180a1b716baadfdd73fcfe5a19b              # commit (#145 FCP, 겹침 검사용)
cd research && npm ci --ignore-scripts                                # 위치: $W/repo/research
```

### 2. 언어 파일 (네트워크, 측정 아님; 위치 `$W/repo/research`)

```sh
T="$W/ocr-pkg"; C=.cache/ko-ocr-factorial
mkdir "$T" && mkdir -p "$C"
(cd "$T" && npm pack @tesseract.js-data/eng@1.0.0 @tesseract.js-data/kor@1.0.0)
echo "285a3f1fb419e8e67bdee93ce288b02bb9097f0a  $T/tesseract.js-data-eng-1.0.0.tgz" | sha1sum -c -
echo "af4c18b31384e8979ba583496c0445132392fb96  $T/tesseract.js-data-kor-1.0.0.tgz" | sha1sum -c -
mkdir "$T/eng" "$T/kor"
(cd "$T/eng" && tar -xzf ../tesseract.js-data-eng-1.0.0.tgz) && (cd "$T/kor" && tar -xzf ../tesseract.js-data-kor-1.0.0.tgz)   # 상대 경로: Git Bash tar는 C: 경로를 원격 호스트로 읽는다
gzip -dc "$T/eng/package/4.0.0_best_int/eng.traineddata.gz" > "$C/eng.traineddata"
gzip -dc "$T/kor/package/4.0.0_best_int/kor.traineddata.gz" > "$C/kor.traineddata"
echo "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747  $C/eng.traineddata" | sha256sum -c -
echo "ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992  $C/kor.traineddata" | sha256sum -c -
```

### 3. 자료 재생성 검사 (선택, OCR 없음; 위치 `$W/repo/research`)

글꼴 `NotoSansKR-VF.ttf`(SHA-256 `018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0`)는 설치된 시스템 글꼴을 쓰며 저장소에 넣지 않는다. Python 3.12, Pillow 12.3.0(FreeType 2.14.3, raqm 없음)에서 같은 바이트가 나왔다.

```sh
F=/c/Windows/Fonts/NotoSansKR-VF.ttf                                   # 글꼴 경로
echo "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0  $F" | sha256sum -c -
D=results/ko-ocr-holdout/data
node src/ko-ocr-holdout-data.mjs verify $D                            # {"ok":true,...}
python tools/ko-ocr-holdout/design.py --out "$W/gen"
python tools/r09/render.py --design "$W/gen/design.json" --font "$F" --out "$W/gen"
for f in design.json questions.json gold.json render.json render-check.json; do cmp "$W/gen/$f" "$D/$f" && echo "same $f"; done
for f in $D/images/*.png; do cmp -s "$f" "$W/gen/images/$(basename "$f")" || echo "DIFF $f"; done      # 출력 없음
node src/ko-ocr-holdout-data.mjs check $D                             # {"passed":true,...}
```

### 4. 측정 재현 (오프라인 가드; 위치 `$W/repo/research`)

실행기는 OCR 전에 오프라인 가드, #147 고정 라이브러리 blob, 선택기 blob, #147 OCR 함수 본문 일치, 코드 상태, 엔진 버전, 언어 파일, 동결 자료(자료 커밋·매니페스트 SHA-256)를 확인한다. 하나라도 실패하면 `stop.json`만 남기고 종료 코드 2로 멈춘다.

```sh
G="$PWD/tools/d03/guard/node-netguard.cjs"; R=results/ko-ocr-holdout
OUT="$W/rerun"; mkdir "$OUT"                                          # 새 출력 폴더
for X in a b; do
  NODE_OPTIONS="--require=$G" D03_NET_LOG="$OUT/guard-$X.jsonl" D03_STEP=koh-a node src/ko-ocr-holdout-run.mjs --out "$OUT/run-$X"
  grep -c '"blocked"' "$OUT/guard-$X.jsonl"                           # 0
done
node src/ko-ocr-holdout-score.mjs --run "$OUT/run-a" --baseline-run "$OUT/run-a" --out "$OUT/score-a"
node src/ko-ocr-holdout-score.mjs --run "$OUT/run-b" --baseline-run "$OUT/run-a" --out "$OUT/score-b"
node src/ko-ocr-holdout-compare.mjs --a "$OUT/run-a" --b "$OUT/run-b" --score-a "$OUT/score-a" --score-b "$OUT/score-b" --out "$OUT/comparison.json"
python tools/ko-ocr-holdout/recount.py --data $R/data --run "$OUT/run-a" --baseline-run "$OUT/run-a" --score "$OUT/score-a" --out "$OUT/recount-a.json"   # 종료 0
for f in predictions.jsonl ocr.jsonl freeze.json guard-summary.json; do cmp "$OUT/run-a/$f" "$R/run-a/$f" && echo "same run-a/$f"; done
for f in score.jsonl summary.json; do cmp "$OUT/score-a/$f" "$R/score-a/$f" && echo "same score-a/$f"; done
node src/ko-ocr-holdout-compare.mjs --a "$OUT/run-a" --b $R/run-a --score-a "$OUT/score-a" --score-b $R/score-a --out "$OUT/vs-published-a.json"
```

- 같은 기계 환경이면 게시본과 바이트가 같아야 한다. 다른 CPU에서는 OCR 부동소수 차이가 날 수 있으며 비교기가 행 단위 차이를 보고한다.
- run B도 단계 표지 `koh-a`로 실행한다(가드 요약 바이트 비교용, 가드 기록 파일은 별도).

### 시험

- 위치 `research/`: `node --test test/ko-ocr-holdout.test.mjs`, `python -m unittest tools/ko-ocr-holdout/test_recount.py`
- `--non-measurement`(그때만 `--limit N`)는 배선 확인 전용이며 이 실험의 측정에는 쓰지 않았다.
