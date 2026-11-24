# 고정 자르기 여백 재생: 자료와 재현

- 프로토콜: [`research/plans/2026-11-24-crop-padding-replay-protocol.md`](../../plans/2026-11-24-crop-padding-replay-protocol.md)
- 결과: [`RESULTS.md`](RESULTS.md)

## 폴더

| 경로 | 내용 |
|---|---|
| `prepare-report.json` | #141 준비기 검산(기준 blob, ID·짝·키 수, 언어·앵커 분모, IHDR, R09 코드 blob, 투영 matched 36). #141의 같은 파일과 바이트 동일 |
| `run-a/raw.jsonl` | 192행(키 `p<p>|<id>`). 요청·클리핑·응답 검사·반환 구간. 경로·픽셀·이미지 본문·`artifactId` 없음 |
| `run-a/conditions.jsonl` | p마다 호출 기록: 요청/응답/알림 수, 도구 목록, 종료 코드, stderr 해시 |
| `run-a/input-check.json` | 실행 전 검산: 동결 입력 대조, ID별 원본 SHA·freeze manifest 일치·치수·의도 |
| `run-{a,b}/evidence.json` | 위 세 파일의 SHA-256. A·B가 같다 |
| `run-{a,b}/run-meta.json` | 시각·소요 시간·Node·sharp·실행 코드 커밋·번들 작업 사본 해시(비결정적). 원래 실행의 `runnerTreeClean`은 잘못된 경로를 검사해 증거가 아니다(RESULTS §6) |
| `rerun-pmfix/` | PM 검토 수정 코드(`960b451`) 재실행: A·B `run-meta.json`(실행 전 코드 상태 `runCodeCheckedBeforeMeasurement`), 원래 파일과의 해시 대조 `comparison.json`(모두 동일) |
| `score-a/` | `score.json`(행별 판정·면적, p별 집계, #141 재생 대조), `summary.md` |
| `recount/recount.json` | Python 독립 검산 |
| `guard-summary.json` | 오프라인 가드 이벤트 수(실행마다 5, 차단 0) |

run-b의 결정적 출력과 채점 출력은 run-a와 바이트 단위로 같아 `evidence.json`과 `run-meta.json`만 남겼다. 원본 PNG, 가드 원본 로그, 임시 허용 루트는 저장소에 넣지 않는다.

## 고정 방식

- 텍스트 입력은 작업 사본이 아니라 Git blob으로 읽는다. 줄바꿈 설정(CRLF/LF)과 무관하게 같은 바이트다
  - 입력: 커밋 `41fc769`의 R09 `design.json`, `questions.json`, `freeze-manifest.json`, `run-a/raw.jsonl`(blob `876cdbb`), `images/*.png`
  - 정답 상자: `41fc769`의 `gold.json`(blob `5d6c277`), 채점기만 읽는다
  - #141 대조: raw blob `2972913`, score blob `18502c1`, RGB manifest blob `80cdee3`(커밋 `0fb3053`)
- 실행기는 번들과 동결 라이브러리를 `git hash-object`로 확인한다(번들 `85b8049`, 라이브러리 `b52b38a`). 번들 작업 사본의 원바이트 SHA는 줄바꿈에 따라 다를 수 있지만 blob은 같다
- 이미지 해시는 원바이트 SHA-256이다
- 이 폴더의 텍스트는 `.gitattributes`로 LF로 꺼낸다

## 재현

`research/` 폴더에서 Git Bash 같은 POSIX 셸로 실행한다. 출력 폴더는 매번 새 이름을 쓴다. 스크립트는 기존 출력 폴더가 있으면 멈춘다.

```sh
npm ci --ignore-scripts                     # 준비(네트워크 사용, 측정 아님)
O=out/cpr-rerun
mkdir -p out && mkdir "$O" && mkdir "$O/guard"
node src/mcp-view-comparison-prepare.mjs --stage originals --out $O/prep
cmp $O/prep/prepare-report.json results/crop-padding-replay/prepare-report.json && echo "prepare report same"

for R in a b; do
  env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u BAZE_API_KEY -u GITHUB_TOKEN -u GH_TOKEN \
    NODE_OPTIONS="--require=$PWD/tools/d03/guard/node-netguard.cjs" D03_NET_LOG=$PWD/$O/guard/run-$R.jsonl D03_STEP=cpr-run-$R \
    node src/crop-padding-replay-run.mjs --input $O/prep/input --original-sha $O/prep/original-sha.json --out $O/run-$R
  node src/crop-padding-replay-freeze.mjs --run $O/run-$R --out $O/evidence-$R.json
  node src/crop-padding-replay-score.mjs --run $O/run-$R --evidence $O/evidence-$R.json --out $O/score-$R
done
python tools/crop-padding-replay-recount.py --run $O/run-b --score $O/score-a/score.json --out $O/recount.json   # mismatches 0, 종료 0

H=results/crop-padding-replay
for R in a b; do
  for f in raw.jsonl conditions.jsonl input-check.json; do cmp -s $O/run-$R/$f $H/run-a/$f && echo "same run-$R/$f" || echo "DIFF run-$R/$f"; done
  for f in score.json summary.md; do cmp -s $O/score-$R/$f $H/score-a/$f && echo "same score-$R/$f" || echo "DIFF score-$R/$f"; done
  echo "run-$R guard=$(grep -c '"event":"guard"' $O/guard/run-$R.jsonl) blocked=$(grep -c '"event":"blocked"' $O/guard/run-$R.jsonl)"   # guard=5 blocked=0
done
cmp -s $O/recount.json $H/recount/recount.json && echo "same recount"
```

- 실행기는 다음 중 하나라도 실패하면 번들을 띄우기 전에 멈춘다
  - 불러오는 연구 모듈 5개 중 하나라도 추적되지 않았거나 HEAD blob과 다름(측정이 아닌 점검만 `--allow-dirty-code`)
  - 오프라인 가드 없음, 번들·동결 라이브러리 blob 불일치
  - 입력 폴더 허용 목록(`assignment.json`, `questions.json`, `images/original/`) 밖의 항목, 채점 입력처럼 보이는 이름
  - `verifyFrozenInputs`(배정·투영·질문·원본 SHA 표), 원본 SHA의 R09 freeze manifest 개별 대조, 원바이트 SHA, IHDR, ID 48·쌍 24·언어×앵커 12씩·매치 36/미매치 12, 좌표 범위
- 조건(p)마다 새 번들 프로세스와 빈 임시 허용 루트를 쓴다. 자식 프로세스에는 최소 환경 변수와 가드만 넘긴다

## 테스트

```sh
node --test test/crop-padding-replay.test.mjs
```
