# R09 한영 근거 영역 선택: 자료와 재현

사전등록: [`research/plans/2026-11-23-r09-bilingual-preregistration.md`](../../plans/2026-11-23-r09-bilingual-preregistration.md)

## 폴더

| 경로 | 내용 |
|---|---|
| `heldout/design.json` | 48장 설계: 질문, 칸, 대상 행, 금표준 항목 id |
| `heldout/questions.json` | 선택기 입력(id, file, question)만 담은 파일 |
| `heldout/token-manifest.json` | 48문항의 선택기 키와 원문 기준 예상 표지 |
| `heldout/images/` | 본시험 PNG 48장(자체 합성) |
| `heldout/render.json`, `gold.json`, `render-check.json` | 실제 잉크 상자, 금표준(채점 전용), 렌더 검사 |
| `heldout/review/` | 작성자 시각 비교용 한영 대표쌍(금표준 표시). 선택기 입력이 아님 |
| `heldout/freeze-manifest.json` | 입력·코드·고정 자산 해시(등록 커밋에서 고정) |
| `dev/` | 개발용 fixture(다른 문서형·레이아웃·지면) 4장과 배선 확인 결과 |
| `heldout/run-{a,b}/` | 원시 기록 `raw.jsonl`, 비결정 메타데이터 `run-meta.json`, 오프라인 가드 기록 `network.jsonl` |
| `heldout/score-{a,b}/` | 실행별 집계 `score.json`, `summary.md` |
| `heldout/replay-{a,b}/` | 물리 변환 재생 검증(수정 1) |
| `heldout/recount/recount.json` | Python 독립 검산. run-b 원시값을 score-a와 대조한 결과 |
| `RESULTS.md` | 결과 보고 |

## 재현

명령은 `research/` 폴더에서 Git Bash 같은 POSIX 셸로 실행한다(Windows에서는 무창 실행으로 확인했다). 검산은 실제 측정과 같은 순서로 진행한다.

### 0. 작업 사본과 줄바꿈

- 동결 해시는 파일의 원시 바이트 기준이다. 이 폴더의 `.gitattributes`(`* text=auto eol=lf`)가 텍스트 파일을 모든 플랫폼에서 LF로 꺼낸다. PNG는 바이너리 그대로 둔다
- 이 지정이 없으면 Windows 기본값 `core.autocrlf=true`에서 입력 JSON 6개가 CRLF로 꺼내져 동결 대조가 실패한다. 지정을 넣기 전 커밋(`a7066e4`–`0656130`)을 꺼낼 때는 `git -c core.autocrlf=false`로 꺼낸다
- 코드 11개는 Git blob(`git hash-object`)으로 대조하므로 줄바꿈 설정과 관계없다. `research/`는 Git 작업 사본 안에 있어야 한다
- 동결 대조 65개 = 입력 54개(JSON 6, PNG 48) + 코드 11개. OCR 자료와 글꼴은 `freeze-manifest.json`의 `assets`에 기록만 하고, 아래 1단계에서 따로 확인한다

### 1. 준비 (네트워크 사용, 측정 아님)

```sh
npm ci --ignore-scripts
pip install pillow==12.3.0 fonttools==4.63.0        # 2단계 자료 재생성에만 필요. tools/d03/requirements.txt와 같은 핀
```

OCR 영어 자료는 [R02 재현 절차](../../../docs/research/r02-offline-reproduction.md#재현-절차)와 같은 버전 고정 공개 패키지 `@tesseract.js-data/eng@1.0.0`의 `4.0.0_best_int`에서 준비한다. 실제 측정에서는 같은 SHA-256의 파일을 R02 연구 사본에서 복사해 썼다.

```sh
T=out/r09-ocr-pkg                                    # 새 빈 폴더
test ! -e "$T" && mkdir -p "$T" .cache
(cd "$T" && npm pack @tesseract.js-data/eng@1.0.0 && tar -xzf tesseract.js-data-eng-1.0.0.tgz)
echo "285a3f1fb419e8e67bdee93ce288b02bb9097f0a  $T/tesseract.js-data-eng-1.0.0.tgz" | sha1sum -c -     # npm 레지스트리 dist.shasum
gzip -dc "$T/package/4.0.0_best_int/eng.traineddata.gz" > .cache/eng.traineddata
echo "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747  .cache/eng.traineddata" | sha256sum -c -
wc -c < .cache/eng.traineddata                       # 5199098
```

`.cache/eng.traineddata`가 없으면 tesseract.js가 내려받으려 한다. 3단계의 오프라인 가드는 이를 막으므로 측정 전에 위 검사를 통과해야 한다.

글꼴 `NotoSansKR-VF.ttf`(버전 2.04)는 설치된 시스템 글꼴을 쓴다. 저장소에는 넣지 않는다. 2단계에서만 필요하다.

```sh
F=<NotoSansKR-VF.ttf 경로>                           # 예: /c/Windows/Fonts/NotoSansKR-VF.ttf
echo "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0  $F" | sha256sum -c -
```

### 2. 자료 재생성 검사 (선택)

새 폴더에 입력을 다시 만들고 동결 목록과 대조한다. 같은 바이트가 나와야 한다.

```sh
G=out/r09-regen
test ! -e "$G"
node src/r09-build.mjs --set heldout --out $G
python tools/r09/render.py --design $G/design.json --font "$F" --out $G
node src/r09-freeze.mjs --dir $G --check results/r09-bilingual/heldout/freeze-manifest.json   # {"checked":65,"diffs":[]}
```

### 3. 측정 재현 (오프라인 가드, 키 제거)

저장된 입력과 증거(`results/r09-bilingual/`)는 읽기만 한다. 모든 출력은 새 빈 폴더 `$O`에 쓴다. 가드는 기록 파일을 쓰지 못해도 알리지 않으므로, 가드 기록 폴더를 측정 전에 만든다. `test ! -e`가 실패하면(같은 이름의 폴더가 이미 있으면) 다른 새 이름을 쓴다.

```sh
H=results/r09-bilingual/heldout
O=out/r09-rerun                                      # 새 빈 폴더. results/ 아래에 쓰지 않는다
test ! -e "$O" && mkdir -p $O/guard $O/recount
find results/r09-bilingual -type f -exec sha256sum {} + | sort -k2 > $O/evidence-before.sha256
node src/r09-freeze.mjs --dir $H --check $H/freeze-manifest.json                              # {"checked":65,"diffs":[]}
for R in a b; do
  env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u BAZE_API_KEY NODE_OPTIONS="--require=$PWD/tools/d03/guard/node-netguard.cjs" \
    D03_NET_LOG=$PWD/$O/guard/run-$R.jsonl D03_STEP=r09-run-$R node src/r09-run.mjs --questions $H/questions.json --images $H/images --out $O/run-$R
  node src/r09-score.mjs --design $H/design.json --render $H/render.json --gold $H/gold.json --raw $O/run-$R/raw.jsonl --out $O/score-$R
  node src/r09-replay.mjs --questions $H/questions.json --images $H/images --raw $O/run-$R/raw.jsonl --out $O/replay-$R
done
python tools/r09/recount.py --design $H/design.json --gold $H/gold.json --raw $O/run-b/raw.jsonl --score $O/score-a/score.json --out $O/recount/recount.json
```

### 4. 검산

```sh
for f in run-a/raw.jsonl run-b/raw.jsonl score-a/score.json score-a/summary.md score-b/score.json score-b/summary.md \
         replay-a/replay.jsonl replay-a/replay-summary.json replay-b/replay.jsonl replay-b/replay-summary.json recount/recount.json; do
  cmp -s $O/$f $H/$f && echo "same $f" || echo "DIFF $f"
done                                                 # 11개 모두 same
find results/r09-bilingual -type f -exec sha256sum {} + | sort -k2 | cmp - $O/evidence-before.sha256 && echo "evidence unchanged"
for R in a b; do echo "run-$R guard=$(grep -c '"event":"guard"' $O/guard/run-$R.jsonl) blocked=$(grep -c '"event":"blocked"' $O/guard/run-$R.jsonl)"; done   # guard=2 blocked=0
```

`run-meta.json`은 시각·소요 시간 같은 비결정 메타데이터라서 대조하지 않는다. 가드 기록은 실행마다 `guard` 이벤트 2개(주 스레드와 OCR 작업자 스레드)이고 `blocked` 이벤트는 0개다. 실제 측정에서는 가드 기록을 저장소 밖에 먼저 쓰고, 측정이 끝난 뒤 `heldout/run-{a,b}/network.jsonl`로 복사했다.
