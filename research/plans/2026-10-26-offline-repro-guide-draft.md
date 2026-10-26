# 보충 자료 재현 절차 초안: 모델 호출 없이 집계 다시 만들기 (2026-10-26)

- 작성: Claude Code, 2026-10-26. 기준 main `7709837`
- 성격: 초안이다. 보충 자료 주소(W-7)가 정해지면 이 §2를 보충 자료의 `research/REPRODUCE.md`(또는 `research/README.md`의 한 절)로 옮긴다. 지금은 원고·결과 파일을 바꾸지 않는다
- 근거
  - PR #68 메모 `research/plans/2026-10-26-repro-check.md` §2(Claude 재현, 24/24 바이트 일치)
  - 같은 메모 §5의 제안("모델 호출 없이 집계를 다시 만드는 절차"를 README에 적기)
  - Codex 독립 재현(2026-10-26, 24/24 PASS)의 실제 순서. 재현 스크립트는 저장소 밖(`.artifacts/reviews-20261026/resume68.cjs`)에 있다
- 지금 `research/README.md`(L67-78)는 호출 단계까지 함께 적는다. 그래서 호출 없이 집계만 다시 하려면 원자료를 어디에 복사해야 하는지 알 수 없다. 이 초안이 그 빈칸을 채운다

## 1. 정할 것

| ID | 질문 | 권장 |
|---|---|---|
| G-1 | 이 절차를 어디에 둘까 | 보충 자료의 `research/REPRODUCE.md`로 따로 둔다. `research/README.md`의 재현 절에서 링크한다 |
| G-2 | OCR 언어 데이터를 보충 자료에 넣을까 | 넣는다. 실험 2 입력 재생성(`variants.mjs`)은 tesseract.js 언어 데이터가 필요하다. 없으면 네트워크로 내려받는다. 실험 때와 다른 파일을 받으면 OCR 결과가 달라질 수 있다. 파일은 5,199,098바이트다. 넣기 전에 사용 허가(라이선스)를 확인한다 |
| G-3 | 비교 스크립트를 함께 낼까 | 낸다. 아래 절차를 그대로 돌리는 `research/src/reproduce-offline.mjs`를 만든다. 심사자가 명령 하나로 확인할 수 있다. 만드는 일은 W-7 뒤에 따로 한다 |

## 2. 초안 (보충 자료에 옮길 본문)

> 아래는 보충 자료용 문안이다. 경로는 저장소의 `research/` 폴더 기준이다.

### 모델 호출 없이 결과 집계 다시 만들기

논문의 수치는 `results/` 아래 집계·분석 파일에서 나온다. 이 파일들은 같은 폴더의 원자료(호출 기록과 응답)와 `src/`의 스크립트만으로 다시 만들 수 있다. 이 절차는 모델 API를 호출하지 않으므로 API 키와 비용이 들지 않는다.

**준비**

- Node.js 22 이상(확인한 판: v24.18.0, Windows 11)
- `research/`에서 `npm ci`를 실행한다. `sharp` 0.35.4와 `tesseract.js` 5.1.1이 설치된다
- 1–3단계는 Node 내장 모듈만 쓴다. `npm ci` 없이도 돌아간다. 4단계는 `sharp`·`tesseract.js`가 필요하다
- 입력 재생성(4단계)만 OCR 언어 데이터가 필요하다. `research/.cache/eng.traineddata`에 둔다
  - 크기 5,199,098바이트, SHA-256 `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`
  - 이 파일이 없으면 tesseract.js가 네트워크에서 내려받는다. 받은 파일의 SHA-256이 위 값과 다르면 OCR 결과가 달라질 수 있다

**1. 실험 1 (RQ1 청구 토큰 회계)**

```
mkdir -p out/rq1-runs/rq1-sweep-001
cp results/rq1-sweep-001/rows.jsonl out/rq1-runs/rq1-sweep-001/
node src/rq1-summarize.mjs --run-id rq1-sweep-001
```

- 비교: `out/rq1-runs/rq1-sweep-001/`의 `summary.json`·`summary.md`를 `results/rq1-sweep-001/`의 같은 이름 파일과 비교한다

**2. 실험 2 held-out (RQ2 단일 질의)**

```
mkdir -p out/exp2-heldout
cp results/exp2-heldout/families-exp2-heldout.json out/exp2-heldout/families.json
cp results/exp2-heldout/slots-exp2-heldout.json out/exp2-heldout/slots.json
# 모델마다(gpt4o, haiku)
mkdir -p out/exp2-heldout/runs/exp2-held-gpt4o
cp results/exp2-heldout/gpt4o/config.json results/exp2-heldout/gpt4o/responses.jsonl out/exp2-heldout/runs/exp2-held-gpt4o/
node src/summarize.mjs --set exp2-heldout --run-id exp2-held-gpt4o
node src/exp2-analyze.mjs --set exp2-heldout --run-id exp2-held-gpt4o
```

- 비교: 모델마다 `summary.json`, `summary.md`, `graded.jsonl`, `exp2-analysis.json`, `exp2-analysis.md`(5개)를 `results/exp2-heldout/<model>/`과 비교한다
- bootstrap 신뢰구간도 같아야 한다. 분석 seed가 고정돼 있다(`exp2-analyze.mjs`의 `20261016`)

**3. 실험 3 held-out (RQ3 세션)**

```
mkdir -p out/sessions/heldout
cp results/s3-heldout/sessions-heldout.json out/sessions/heldout/sessions.json
# 모델마다(gpt4o, haiku)
mkdir -p out/session-runs/s3-heldout-gpt4o
cp results/s3-heldout/gpt4o/config.json results/s3-heldout/gpt4o/calls.jsonl results/s3-heldout/gpt4o/*.S?.json out/session-runs/s3-heldout-gpt4o/
node src/session-summarize.mjs --run-id s3-heldout-gpt4o
node src/session-analyze.mjs --run-id s3-heldout-gpt4o
```

- 비교: 모델마다 `summary.json`, `summary.md`, `analysis.json`, `analysis.md`(4개)를 `results/s3-heldout/<model>/`과 비교한다. 분석 seed는 `20261015`다
- 그림 데이터: `node src/figure-data.mjs`를 돌리면 `figures/data/heldout-sessions.json`을 **제자리에 다시 쓴다**. git 사본이면 커밋된 내용과 비교한 뒤 `git checkout -- figures/data/heldout-sessions.json`으로 되돌린다. 내용이 같아도 줄바꿈 때문에 `git status`에 바뀐 파일로 보일 수 있다. git이 아닌 사본이면 돌리기 전에 원본을 다른 곳에 복사해 두고 비교한다

**4. 입력 재생성 (선택)**

- 1–3단계의 `out/`을 다른 이름으로 옮긴 뒤 한다. 생성 스크립트가 같은 `out/` 자리에 쓰기 때문이다

```
node src/sessions.mjs --split heldout          # → out/sessions/heldout/sessions.json
node src/generate.mjs --set exp2-heldout       # → out/exp2-heldout/families.json
node src/variants.mjs --set exp2-heldout       # → out/exp2-heldout/slots.json (OCR 사용)
```

- 비교: 각각 `results/s3-heldout/sessions-heldout.json`, `results/exp2-heldout/families-exp2-heldout.json`, `results/exp2-heldout/slots-exp2-heldout.json`과 비교한다
- 매니페스트에는 생성한 이미지의 SHA-256이 들어 있다. 그래서 매니페스트가 같으면 이미지 바이트도 같다

**비교 방법과 줄바꿈**

- 바이트 단위로 비교한다(`cmp`, Windows는 `fc /b`)
- git으로 받은 사본이고 Windows에서 `core.autocrlf=true`면, 작업 사본의 텍스트 파일 줄바꿈이 CRLF일 수 있다. 이때는 작업 사본이 아니라 커밋된 내용과 비교한다: `git cat-file -p HEAD:research/<경로> | cmp - <생성한 파일>`
- 압축 파일로 받은 보충 자료는 줄바꿈이 LF 그대로다. 파일끼리 바로 비교하면 된다

**확인된 결과와 범위**

- 2026-10-26 두 번 독립으로 재현했다. 대상 24개 파일(집계·분석 21개, 입력 매니페스트 3개)이 모두 바이트 단위로 같았다
- 이 절차가 다루지 않는 것
  - 모델 호출 단계(`run.mjs`, `session-harness.mjs`, `rq1-sweep.mjs`): 비용이 들고 응답이 결정적이지 않다. 논문은 이 단계의 재현을 주장하지 않는다
  - 그림 PNG·PDF: matplotlib 판에 따라 바이트가 달라진다. 그림에 들어가는 데이터는 3단계에서 확인한다
  - calibration·dev 세트와 발췌 벤치
  - 다른 OS·Node 판에서의 재현은 확인하지 않았다

## 3. 옮길 때 확인할 것

- 명령은 2026-10-26 새 worktree(main `7709837`)에서 Git Bash로 §2 그대로 돌려 확인했다(§4). 보충 자료로 옮긴 뒤에도 깨끗한 사본에서 한 번 더 돌린다
- `cp`·`mkdir -p`는 Windows PowerShell에서 다르다. 보충 자료에는 Node 스크립트(G-3)를 주된 방법으로 두고, 셸 명령은 설명으로 남기기를 권한다
- 익명 심사본이면 경로·이름에 저자 정보가 없는지 본다

## 4. 이 초안으로 한 확인 (2026-10-26)

- 환경: Windows 11, Git Bash, Node v24.18.0, 새 worktree(main `7709837`)
- §2의 1–3단계 명령을 그대로 돌렸다. 이때 `node_modules`가 없었는데도 모두 돌았다
  - 집계·분석 21개가 모두 커밋 blob과 같았다(`git cat-file -p HEAD:research/<경로> | cmp -s -`)
- `out/`을 옮긴 뒤 4단계를 돌렸다. 의존성은 새로 설치하지 않고 main checkout의 `research/node_modules`를 연결해 썼다. OCR 언어 데이터는 위 SHA-256과 같은 파일을 복사했다
  - 매니페스트 3개가 모두 커밋 blob과 같았다
- 합계 24/24. PR #68(Claude)과 Codex 재현에 이은 세 번째 확인이다
- 확인 뒤 임시 산출물(`out/`, 연결한 `node_modules`)은 지웠다. `figures/data/heldout-sessions.json`은 `git checkout`으로 되돌렸다
