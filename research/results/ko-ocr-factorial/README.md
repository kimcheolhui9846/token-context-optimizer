# ko-ocr-factorial: 한국어 OCR × 한글 검색 키 4조건 — 자료와 재현

프로토콜: [`research/plans/2026-11-24-ko-ocr-factorial-protocol.md`](../../plans/2026-11-24-ko-ocr-factorial-protocol.md). 결과: [`RESULTS.md`](RESULTS.md)

## 폴더

| 경로 | 내용 | 결정적 |
|---|---|---|
| `cohort.jsonl` | 채점 전용 명단 96행(등록 커밋에서 고정) | 예 |
| `run-{a,b}/predictions.jsonl` | 192행 = O0·O1 × 96쪽, 행마다 K0·K1 키 결과 | 예 |
| `run-{a,b}/ocr.jsonl` | 같은 순서의 원시 OCR 줄·단어 | 예 |
| `run-{a,b}/freeze.json` | 위 두 파일의 원바이트 SHA-256(채점 전 고정) | 예 |
| `run-{a,b}/guard-summary.json` | 가드 차단 수, 언어 파일 크기·SHA, 엔진 버전, OCR 옵션 | 예 |
| `run-{a,b}/run-meta.json` | 시각, 페이지별 시간, PID, 워커 사건 | 아니오 |
| `score-{a,b}/score.jsonl` | 384행 = 4조건 × 96쪽 판정 | 예 |
| `score-{a,b}/history.jsonl` | O0K0 대 과거 run A(선택·OCR·근거) | 예 |
| `score-{a,b}/summary.json` | 분모·집계·대응 전이·교호 대비 | 예 |
| `comparison.json` | run A/B 바이트·행 비교 | 예 |
| `recount/` | 독립 Python 검산 결과 | 예 |
| `logs/` | RED 실행 기록 | — |

## 재현

명령은 `research/` 폴더에서 POSIX 셸(Git Bash)로 실행한다. 출력은 존재하지 않는 새 폴더에 쓴다. `.gitattributes`(`* text=auto eol=lf`)가 결과 파일을 LF로 꺼내 원바이트 해시가 맞는다.

### 1. checkout과 고정 객체 (네트워크, 측정 아님)

```sh
git fetch origin pull/147/head && git checkout --detach FETCH_HEAD      # 또는 이 PR의 고정 커밋
git fetch origin pull/145/head pull/146/head
git cat-file -t 708d9946ae091180a1b716baadfdd73fcfe5a19b                 # commit
git cat-file -t cdff545c3eb31bee3099ec4a62cb7b637975b4c7                 # commit
cd research && npm ci --ignore-scripts
```

### 2. 언어 파일 준비 (네트워크, 측정 아님)

```sh
T=out/kof-ocr-pkg-new; C=.cache/ko-ocr-factorial              # T는 새 빈 폴더
mkdir -p out "$C" && mkdir "$T"                              # 이미 있으면 실패한다. 그때는 새 이름을 쓴다
(cd "$T" && npm pack @tesseract.js-data/eng@1.0.0 @tesseract.js-data/kor@1.0.0)
echo "285a3f1fb419e8e67bdee93ce288b02bb9097f0a  $T/tesseract.js-data-eng-1.0.0.tgz" | sha1sum -c -
echo "af4c18b31384e8979ba583496c0445132392fb96  $T/tesseract.js-data-kor-1.0.0.tgz" | sha1sum -c -
mkdir "$T/eng" "$T/kor"
tar -xzf "$T/tesseract.js-data-eng-1.0.0.tgz" -C "$T/eng" && tar -xzf "$T/tesseract.js-data-kor-1.0.0.tgz" -C "$T/kor"
gzip -dc "$T/eng/package/4.0.0_best_int/eng.traineddata.gz" > "$C/eng.traineddata"
gzip -dc "$T/kor/package/4.0.0_best_int/kor.traineddata.gz" > "$C/kor.traineddata"
echo "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747  $C/eng.traineddata" | sha256sum -c -
echo "ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992  $C/kor.traineddata" | sha256sum -c -
wc -c "$C/eng.traineddata" "$C/kor.traineddata"              # 5199098, 2208378
```

실행기는 OCR 전에 두 파일의 크기·SHA, 엔진 버전, 선택기 blob, 코드 상태, 오프라인 가드를 다시 확인하고 하나라도 어긋나면 `stop.json`만 쓰고 종료 코드 2로 멈춘다.

### 3. 실측 (오프라인 가드)

```sh
G="$PWD/tools/d03/guard/node-netguard.cjs"; LOG=<저장소 밖 새 파일>
NODE_OPTIONS="--require=$G" D03_NET_LOG="$LOG" D03_STEP=kof-a node src/ko-ocr-factorial-run.mjs --out out/kof-rerun-a
node src/ko-ocr-factorial-score.mjs --run out/kof-rerun-a --out out/kof-rerun-score-a
python tools/ko-ocr-factorial/recount.py --run out/kof-rerun-a --score out/kof-rerun-score-a --out out/kof-rerun-recount-a.json
```

- 같은 기계에서 `predictions.jsonl`, `ocr.jsonl`, `freeze.json`, `guard-summary.json`(같은 단계 표지일 때)과 채점 세 파일이 `run-a/`, `score-a/`와 바이트 동일해야 한다
- 두 run 비교: `node src/ko-ocr-factorial-compare.mjs --a <run-a> --b <run-b> --score-a <score-a> --score-b <score-b> --out <새 json>`
- `--non-measurement`(그리고 그때만 허용되는 `--limit N`)는 배선 확인 전용이다. 측정에는 쓰지 않는다
- 시험: `node --test test/ko-ocr-factorial.test.mjs`, `python -m unittest tools/ko-ocr-factorial/test_recount.py`
