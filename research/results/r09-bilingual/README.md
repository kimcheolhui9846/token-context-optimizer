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

## 재현 (research 폴더에서)

준비 단계(네트워크 사용, 측정 아님):

```sh
npm ci --ignore-scripts
mkdir -p .cache && cp <R02 immutable 연구 사본>/.cache/eng.traineddata .cache/   # SHA-256 5dc5d8d6...d747 확인
pip install pillow==12.3.0 fonttools==4.63.0                                     # tools/d03/requirements.txt와 같은 핀
```

글꼴 `NotoSansKR-VF.ttf`(SHA-256 `018174e8...53d0`)는 설치된 시스템 글꼴을 쓴다. 저장소에는 넣지 않는다.

자료 생성(같은 바이트가 나와야 한다):

```sh
node src/r09-build.mjs --set heldout --out <dir>
python tools/r09/render.py --design <dir>/design.json --font <NotoSansKR-VF.ttf> --out <dir>
node src/r09-freeze.mjs --dir <dir> --check results/r09-bilingual/heldout/freeze-manifest.json
```

측정(오프라인 가드, 키 제거):

```sh
H=results/r09-bilingual/heldout
node src/r09-freeze.mjs --dir $H --check $H/freeze-manifest.json
for R in a b; do
  env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u BAZE_API_KEY NODE_OPTIONS="--require=$PWD/tools/d03/guard/node-netguard.cjs" \
    D03_NET_LOG=$PWD/$H/run-$R/network.jsonl D03_STEP=r09-run-$R node src/r09-run.mjs --questions $H/questions.json --images $H/images --out $H/run-$R
  node src/r09-score.mjs --design $H/design.json --render $H/render.json --gold $H/gold.json --raw $H/run-$R/raw.jsonl --out $H/score-$R
  node src/r09-replay.mjs --questions $H/questions.json --images $H/images --raw $H/run-$R/raw.jsonl --out $H/replay-$R
done
python tools/r09/recount.py --design $H/design.json --gold $H/gold.json --raw $H/run-b/raw.jsonl --score $H/score-a/score.json --out $H/recount/recount.json
```

실제 실행에서는 가드 기록을 저장소 밖에 먼저 쓰고, 측정이 끝난 뒤 `run-{a,b}/network.jsonl`로 복사했다. 내용은 실행마다 `guard` 이벤트 2개(주 스레드와 OCR 작업자 스레드)이고 `blocked` 이벤트는 0개다.

Windows에서는 Git Bash 같은 POSIX 셸(무창 실행)에서 위 명령을 썼다.
