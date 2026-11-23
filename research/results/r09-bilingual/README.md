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

`run-a/`, `run-b/`, `score/`, `recount.json`은 등록 커밋 이후 측정에서 추가한다.

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
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY NODE_OPTIONS="--require=$PWD/tools/d03/guard/node-netguard.cjs" \
  D03_NET_LOG=<log.jsonl> D03_STEP=r09-run-a node src/r09-run.mjs --questions $H/questions.json --images $H/images --out $H/run-a
node src/r09-score.mjs --design $H/design.json --render $H/render.json --gold $H/gold.json --raw $H/run-a/raw.jsonl --out $H/score
python tools/r09/recount.py --design $H/design.json --gold $H/gold.json --raw $H/run-a/raw.jsonl --score $H/score/score.json --out $H/recount.json
```

Windows에서는 Git Bash 같은 POSIX 셸(무창 실행)에서 위 명령을 썼다.
