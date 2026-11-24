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
| `logs/` | RED 실행 기록(최초 구현, PM 검토 수정) | — |

## 재현

POSIX 셸(Git Bash 또는 bash)에서 블록을 순서대로 같은 셸 세션에 붙여 넣는다. 각 블록 끝의 주석이 그 블록이 끝난 위치(작업 폴더)를 적는다. 클론, 언어 패키지, 측정 출력, 가드 기록은 모두 저장소 밖의 새 작업 폴더 `$W`에 둔다. 언어 파일만 실행기가 요구하는 위치 `research/.cache/ko-ocr-factorial/`(Git 무시)에 둔다. `.gitattributes`(`* text=auto eol=lf`)가 결과 파일을 LF로 꺼내 원바이트 비교가 맞는다.

### 1. 새 클론과 고정 객체 (네트워크, 측정 아님)

```sh
W="$(mktemp -d)" && cd "$W" && W="$(pwd -W 2>/dev/null || pwd)"   # 저장소 밖 새 빈 작업 폴더. Git Bash에서는 Windows 형식 경로로 바꾼다
git clone https://github.com/kimcheolhui9846/token-context-optimizer.git "$W/repo"
cd "$W/repo"                                                          # 시작점: 새 클론의 루트
git fetch origin pull/147/head:refs/remotes/origin/pr147 pull/145/head pull/146/head
git checkout --detach origin/pr147                                    # 또는 고정 커밋 SHA
git cat-file -t 708d9946ae091180a1b716baadfdd73fcfe5a19b              # commit
git cat-file -t cdff545c3eb31bee3099ec4a62cb7b637975b4c7              # commit
cd research && npm ci --ignore-scripts                                # 위치: $W/repo/research
```

### 2. 언어 파일 준비 (네트워크, 측정 아님; 위치 `$W/repo/research`)

```sh
T="$W/ocr-pkg"; C=.cache/ko-ocr-factorial
mkdir "$T" && mkdir -p "$C"                                           # $T가 이미 있으면 실패한다. 그때는 새 작업 폴더로 다시 시작한다
(cd "$T" && npm pack @tesseract.js-data/eng@1.0.0 @tesseract.js-data/kor@1.0.0)
echo "285a3f1fb419e8e67bdee93ce288b02bb9097f0a  $T/tesseract.js-data-eng-1.0.0.tgz" | sha1sum -c -
echo "af4c18b31384e8979ba583496c0445132392fb96  $T/tesseract.js-data-kor-1.0.0.tgz" | sha1sum -c -
mkdir "$T/eng" "$T/kor"
(cd "$T/eng" && tar -xzf ../tesseract.js-data-eng-1.0.0.tgz) && (cd "$T/kor" && tar -xzf ../tesseract.js-data-kor-1.0.0.tgz)   # 상대 경로: Git Bash의 GNU tar는 C: 경로를 원격 호스트로 읽는다
gzip -dc "$T/eng/package/4.0.0_best_int/eng.traineddata.gz" > "$C/eng.traineddata"
gzip -dc "$T/kor/package/4.0.0_best_int/kor.traineddata.gz" > "$C/kor.traineddata"
echo "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747  $C/eng.traineddata" | sha256sum -c -
echo "ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992  $C/kor.traineddata" | sha256sum -c -
wc -c "$C/eng.traineddata" "$C/kor.traineddata"                       # 5199098, 2208378
```

실행기는 OCR 전에 오프라인 가드, 저장소, 선택기 blob, 코드 상태, 엔진 버전, 두 언어 파일, 고정 입력 객체(#145·#146 커밋 포함)를 차례로 확인한다. 하나라도 실패하면 OCR을 시작하지 않고 `--out` 폴더에 실패 단계와 이유를 담은 `stop.json`만 남기며 종료 코드 2로 멈춘다.

### 3. 한 run 재현 (오프라인 가드; 위치 `$W/repo/research`)

```sh
G="$PWD/tools/d03/guard/node-netguard.cjs"
OUT="$W/rerun"; mkdir "$OUT"                                          # 새 출력 폴더. 이미 있으면 실패한다
NODE_OPTIONS="--require=$G" D03_NET_LOG="$OUT/guard-a.jsonl" D03_STEP=kof-a node src/ko-ocr-factorial-run.mjs --out "$OUT/run-a"
grep -c '"blocked"' "$OUT/guard-a.jsonl"                              # 0
node src/ko-ocr-factorial-score.mjs --run "$OUT/run-a" --out "$OUT/score-a"
python tools/ko-ocr-factorial/recount.py --run "$OUT/run-a" --score "$OUT/score-a" --out "$OUT/recount-a.json"   # 종료 0
for f in predictions.jsonl ocr.jsonl freeze.json guard-summary.json; do cmp "$OUT/run-a/$f" "results/ko-ocr-factorial/run-a/$f" && echo "same run-a/$f"; done
for f in score.jsonl history.jsonl summary.json; do cmp "$OUT/score-a/$f" "results/ko-ocr-factorial/score-a/$f" && echo "same score-a/$f"; done
```

- 게시된 run A와 같은 기계 환경이면 위 7개 파일이 모두 `same`이어야 한다. 다른 기계·CPU에서는 OCR 부동소수 차이로 다를 수 있으며, 그때는 4단계의 비교기로 행 단위 차이를 본다.
- `guard-summary.json`은 단계 표지 `kof-a`가 같을 때만 바이트가 같다.

### 4. A/B 전체 측정 (선택; 3단계 다음, 같은 셸)

```sh
NODE_OPTIONS="--require=$G" D03_NET_LOG="$OUT/guard-b.jsonl" D03_STEP=kof-a node src/ko-ocr-factorial-run.mjs --out "$OUT/run-b"
grep -c '"blocked"' "$OUT/guard-b.jsonl"                              # 0
node src/ko-ocr-factorial-score.mjs --run "$OUT/run-b" --out "$OUT/score-b"
python tools/ko-ocr-factorial/recount.py --run "$OUT/run-b" --score "$OUT/score-b" --out "$OUT/recount-b.json"   # 종료 0
node src/ko-ocr-factorial-compare.mjs --a "$OUT/run-a" --b "$OUT/run-b" --score-a "$OUT/score-a" --score-b "$OUT/score-b" --out "$OUT/comparison.json"   # 재현이면 종료 0
node src/ko-ocr-factorial-compare.mjs --a "$OUT/run-a" --b results/ko-ocr-factorial/run-a --score-a "$OUT/score-a" --score-b results/ko-ocr-factorial/score-a --out "$OUT/vs-published-a.json"   # 게시본과 행 단위 대조
```

- 비교기는 결정적 파일 6개의 바이트와, 키 기준 양방향 행 비교(한쪽에만 있는 키, 중복 키, 한쪽에만 있는 필드, 값 차이, 순서)를 함께 보고한다. 하나라도 다르면 `reproduced: false`, 종료 1이다. 분모는 A의 원래 행 수를 유지한다.

### 시험과 배선 확인

- 시험(위치 `research/`): `node --test test/ko-ocr-factorial.test.mjs test/ko-ocr-factorial-review.test.mjs`, `python -m unittest tools/ko-ocr-factorial/test_recount.py`
- `--non-measurement`(그리고 그때만 허용되는 `--limit N`)는 배선 확인 전용이다. 측정에는 쓰지 않는다
