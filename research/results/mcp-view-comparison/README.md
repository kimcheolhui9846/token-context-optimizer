# 제품 MCP 원본·개요·영역 보기 비교: 자료와 재현

- 프로토콜: [`research/plans/2026-11-23-mcp-view-comparison-protocol.md`](../../plans/2026-11-23-mcp-view-comparison-protocol.md)
- 결과: [`RESULTS.md`](RESULTS.md)

## 폴더

| 경로 | 내용 | 측정 전 고정 |
|---|---|---|
| `rgb-manifest.json` | RGB 파생본 48개: 원본 SHA, 파생 SHA, 치수, 청크, 인코더 | 예 |
| `prepare-report.json` | 준비기 검산: 기준 blob, ID·짝·키 수, 언어·앵커·문서형 분모, IHDR, R09 코드 blob, 투영 matched 수 | 예 |
| `run-a/raw.jsonl` | 576행 원시 기록(키마다 한 줄). 경로·픽셀·`artifactId` 없음 | |
| `run-a/cells.jsonl` | 12셀 호출 기록: 요청/응답/알림 수, 도구 목록, 종료 코드, stderr 해시 | |
| `run-a/input-check.json` | 실행 전 입력 검산(48장의 원본·RGB SHA, IHDR, 청크, 픽셀 동일성) | |
| `run-{a,b,c}/evidence.json` | 위 세 파일의 SHA-256. 세 실행이 같다 | |
| `run-{a,b,c}/run-meta.json` | 시각·소요 시간·Node·sharp·번들 작업 사본 해시(비결정적) | |
| `score-a/` | 채점 `score.json`(행별 기하 판정과 셀 집계), `summary.md` | |
| `recount/recount.json` | Python 독립 검산(run-b 원시값과 score-a 대조) | |
| `guard-summary.json` | 오프라인 가드 이벤트 수(실행마다 13, 차단 0) | |
| `pm-fix-comparison.json` | PM 검토 수정 뒤 재실행과 이전 커밋본의 파일별 해시 대조, 바뀐 필드와 이유 | |

run-b와 run-c의 결정적 출력은 run-a와 바이트 단위로 같아 `evidence.json`만 남겼다. 원본·파생 PNG, 가드 원본 로그, 임시 허용 루트는 저장소에 넣지 않는다.

## 재현

명령은 `research/` 폴더에서 Git Bash 같은 POSIX 셸로 실행한다. 저장소는 Git 작업 사본이어야 한다(입력을 기준 커밋 `41fc769`의 blob에서 읽는다). 출력 폴더는 매번 새 이름을 쓴다. 스크립트는 기존 출력 폴더가 있으면 멈춘다.

### 1. 준비 (네트워크 사용, 측정 아님)

```sh
npm ci --ignore-scripts
pip install pillow==12.3.0            # tools/d03/requirements.txt와 같은 핀
```

### 2. 입력 준비

```sh
O=out/mvc-rerun                                         # 새 폴더
mkdir -p out && mkdir "$O" && mkdir "$O/guard"          # 이미 있으면 실패한다. 멈추고 새 이름을 쓴다
node src/mcp-view-comparison-prepare.mjs --stage originals --out $O/prep
python tools/mcp-view-comparison-derive.py --in $O/prep/input/images/original --out $O/prep/input/images/rgb --manifest $O/prep/rgb-manifest-local.json
cmp $O/prep/rgb-manifest-local.json results/mcp-view-comparison/rgb-manifest.json && echo "rgb manifest same"
node src/mcp-view-comparison-prepare.mjs --stage finalize --out $O/prep --rgb-manifest results/mcp-view-comparison/rgb-manifest.json
cmp $O/prep/prepare-report.json results/mcp-view-comparison/prepare-report.json && echo "prepare report same"
```

- 파생 manifest가 다르면 Pillow·zlib 빌드 차이일 수 있다
  - 이때 `finalize`는 SHA 불일치로 멈춘다
  - 픽셀 동일성은 파생기와 실행기가 따로 검사한다. 다른 환경에서 비교하려면 그 환경의 manifest로 `finalize`하고, 그 차이를 기록한다

### 3. 측정 (오프라인 가드, 키 제거)

```sh
for R in a b; do
  env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u BAZE_API_KEY -u GITHUB_TOKEN -u GH_TOKEN \
    NODE_OPTIONS="--require=$PWD/tools/d03/guard/node-netguard.cjs" D03_NET_LOG=$PWD/$O/guard/run-$R.jsonl D03_STEP=mvc-run-$R \
    node src/mcp-view-comparison-run.mjs --input $O/prep/input --out $O/run-$R
  node src/mcp-view-comparison-freeze.mjs --run $O/run-$R --out $O/evidence-$R.json
  node src/mcp-view-comparison-score.mjs --run $O/run-$R --evidence $O/evidence-$R.json --out $O/score-$R
done
python tools/mcp-view-comparison-recount.py --raw $O/run-b/raw.jsonl --score $O/score-a/score.json --out $O/recount.json   # mismatches=0
```

- 실행기는 셀마다 새 번들 프로세스와 빈 임시 허용 루트를 쓴다. 자식 프로세스에는 최소 환경 변수와 가드만 넘긴다
- 실행기는 `NODE_OPTIONS`에 오프라인 가드가 없으면 시작하지 않는다
- 실행기는 서버를 띄우기 전에 다음 해시를 기준 커밋에서 고정한 값(`FROZEN_INPUTS`)과 대조한다. 하나라도 다르면 `frozen input mismatch`로 멈춘다
  - 호출자 배정, manifest 투영, 질문, 원본 기대 SHA
- 실행기는 입력 폴더에 허용 목록 밖의 파일이 있거나, 이름이 채점 입력처럼 보이거나, 입력 SHA·형식·픽셀 검사가 하나라도 실패하면 번들을 띄우기 전에 멈춘다

### 4. 검산

```sh
H=results/mcp-view-comparison
for R in a b; do
  for f in raw.jsonl cells.jsonl input-check.json; do cmp -s $O/run-$R/$f $H/run-a/$f && echo "same run-$R/$f" || echo "DIFF run-$R/$f"; done
  for f in score.json summary.md; do cmp -s $O/score-$R/$f $H/score-a/$f && echo "same score-$R/$f" || echo "DIFF score-$R/$f"; done
  echo "run-$R guard=$(grep -c '"event":"guard"' $O/guard/run-$R.jsonl) blocked=$(grep -c '"event":"blocked"' $O/guard/run-$R.jsonl)"   # guard=13 blocked=0
done
cmp -s $O/recount.json $H/recount/recount.json && echo "same recount"
```

### 5. LF 작업 사본 (선택)

```sh
git -c core.autocrlf=false worktree add --detach <새 경로> HEAD
```

새 사본의 `research/`에서 1–4단계를 반복한다. 실제 검증에서는 그 결과(run-c)가 run-a와 바이트 단위로 같았다. 번들 작업 사본의 원바이트 SHA는 줄바꿈에 따라 다르지만(`run-*/run-meta.json`), Git blob(`5709a184…`)은 같다. 실행기는 그 blob을 실행 전에 확인한다.

## 테스트

```sh
node --test test/mcp-view-comparison.test.mjs    # 33개
```
