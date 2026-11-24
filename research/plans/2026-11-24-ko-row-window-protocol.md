# 새 한국어 문서 48쪽에서 같은 행의 OCR 단어로 창을 오른쪽으로 넓히는 규칙(W1) 대 기존 창(W0) — 사전등록 프로토콜

- 작성 2026-11-24. Tier E. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. 독립 브랜치 `claude/ko-row-window-holdout`(main 위, 다른 PR 위에 쌓지 않음).
- 요청서: 메인 checkout `codex_review/codex_paste_2026-11-24_ko-row-window-holdout.md`(독립 Opus 계획 검토 통과본, 마지막 "독립 계획 검토 반영 사항" 절 포함)와 Orca 과제 지시(task_4960fef0ed60). 사용자 승인 범위: W1 규칙 하나를 W0와 비교해 Draft PR로 전달하는 것까지. 로컬 CPU, 연구 API 비용 0원, 유료 모델·호스팅·GPU 없음, Argon(BAZE)에 자료를 보내지 않는다.
- **등록 커밋(이 문서가 들어가는 첫 커밋):** 이 문서, 자료 생성기 `research/tools/ko-row-window/design.py`(좌표·텍스트 목록·시드를 결정), 검산 명세 `RECOUNT_SPEC.md`, 손계산 예제 `example/example.json`, JS 시험 `research/test/ko-row-window.test.mjs`, Python 시험 `research/tools/ko-row-window/test_recount.py`, 결과 폴더 속성 파일, 과제 인계서. 이때 구현 모듈·PNG·골드·OCR·채점은 없다(시험은 모듈이 없어 실패하는 RED 상태). 이 커밋을 push한 직후 Draft PR을 열고 GitHub의 `isDraft`·head SHA를 확인한 뒤에만 구현을 시작한다.
- #147(`c0c2f5dd…`), #148(`2ab9ed14…`), #149(`fd7ba06e…`)는 Git 객체로만 읽는다. 병합하거나 그 위에 쌓지 않는다. 제품 코드, 기존 연구 파일, 기존 PR, 논문, WBS, 패키지 manifest·lockfile, 환경 설정·설치 상태는 바꾸지 않는다.

## 1. 역할

| 주체 | 역할 |
|---|---|
| 사용자 | 실험 승인(완료), Ready·merge 승인 |
| Codex Astra (PM) | 요청서, 계획·마일스톤 교차검토, 최종 판정 |
| Claude Code Opus 5.5 (연구 작성자, Orca 작업자) | 이 문서, 생성기, 연구 코드, 시험, 실측, 채점, 독립 검산기, 결과, 인계서, Draft PR |
| 독립 Opus 검토 | 계획 검토(요청서 단계 통과), 마일스톤 검토는 PM이 배정 |

- **독립성 한계(공개):** Orca 작업 지시가 하위 에이전트 사용을 금하므로 생성기와 Python 검산기도 연구 작성자가 직접 쓴다. 대신 (a) 생성기와 결정 명세를 OCR 전에 등록하고, (b) 검산기는 `RECOUNT_SPEC.md`와 원자료만으로 계산하며 연구 JS 모듈을 import·호출하지 않고 K1·W1·판정·집계를 다시 구현한다. 같은 사람이 두 구현을 썼으므로 명세 해석 오류가 양쪽에 같이 들어갈 위험은 남는다. 손계산 예제가 이를 일부 막는다.

## 2. 질문과 해석 한계

#149는 #148 한국어 자연어 24쪽 중 두 근거를 담지 못한 20쪽에서 15쪽이 "선택 줄에 목표 표지 단서가 있으나 값이 창 오른쪽 밖"이었다고 관찰했다. 이번 실험은 그 관찰로 정한 규칙 W1 하나를 **새로 만든 48쪽**에서, 같은 OCR·같은 K1 선택 기록으로 기존 창 W0와 한 번 비교한다.

- 결과는 이 합성 자료(문서 종류 3 × 양식 2 × 세로 배치 2 × 열 간격 2 × 사례 2)에 대한 **기술 통계**다. 관찰 단위는 페이지이며 같은 양식의 반복이라 독립 표본이 아니다. 추론 통계·신뢰구간은 내지 않는다.
- W1과 오른쪽 무관 항목·거리 축은 #149를 보고 설계했다(회고적 설계). 별도 줄(stacked) 조건은 수평 확대의 한계를 보기 위한 대조이며, W0가 이미 아래로 6줄 높이를 덮으므로 같은 행의 다른 단어를 통한 간접 회복은 가능하다.
- #148·#149 수치(24쪽, 20/4)는 기댓값이나 통과 조건이 아니며 합산하지 않는다. 매개변수 탐색, 과거 24쪽 재채점, 머리글 줄 선택 수정, 제품 통합은 하지 않는다.
- 창 안에 두 근거가 들어오는 것은 답변 정확도·토큰 수·비용이 아니다. 면적은 픽셀 면적일 뿐이다. 제품·답변 모델을 호출하지 않는다. 새 규칙 채택이나 제품 성능 향상 주장은 별도 결정이다.

## 3. 새 자료

### 3.1 구성 (48쪽, 등록 생성기가 결정)

- 문서 종류(이 순서): `exhibit` 전시 작품 설치표, `costume` 무대 의상 배정표, `lostfound` 분실물 보관 대장. 각 16쪽.
- 양식 `form`(이 순서): `table` 단일 표(머리글 줄 + 레코드 4행), `cards` 두 레코드 카드(테두리 상자 2개를 위아래로, 카드마다 캡션 줄·레코드 줄·꼬리 줄).
- 세로 배치 `vert`: `inline` 정렬(표지와 값이 같은 행, 셀 세로 범위 동일), `stacked` 별도 줄(값이 표지 바로 아래 줄; 값 셀 위 = 표지 셀 아래).
- 열 간격 `gap`: `near`(값 셀 왼쪽 = 표지 셀 오른쪽, 셀 간격 0px: 표지 셀 x [40, 330), 값 셀 [330, 570)), `far`(값 셀 [720, 960), 셀 간격 390px).
- 사례 `case`: 0, 1(사전 고정). 완전 교차 3 × 2 × 2 × 2 × 2 = 48.
- 페이지 ID `<doctype>-<form>-<vert>-<gap>-c<case>`, 파일 `<ID>.png`. 순서: 문서 종류 → 양식 → 세로 배치 → 간격 → 사례. 일련번호 `serial` 0–47.
- 목표 레코드 슬롯: 같은 (문서 종류, 양식) 블록 안 번호 `j = vert·4 + gap·2 + case`(각 축 순서 번호), 문서 종류 번호 `d`에서 `slot = (j + d) mod R`, R = 4(table) 또는 2(cards).

### 3.2 페이지 문법과 좌표

- 페이지 1280 × 960, 흰 바탕 L 모드. 글꼴 `NotoSansKR-VF.ttf`(시스템 설치본, SHA-256 `018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0`, 가중치 400, 본문 24, 제목 32). 렌더러 `research/tools/r09/render.py`(main blob `b61cd9b37803d8eb4b6b126a75301570c14ab11d`)를 **수정 없이** 쓴다. 글꼴은 저장소에 넣지 않는다.
- 공통 열: 표지 `[40, 330)`, 값 `near [330, 570)` / `far [720, 960)`, 오른쪽 무관 항목(비고) `[1000, 1240)`. 본문 셀 높이 40. 제목 셀 `[40, 28, 1000, 84)`.
- `table`: 위 구분선 y 96, 머리글 셀 y [104, 144)(표지 열 "작품명/의상명/물품명", 값 열 = 값 항목명, 비고 열 "비고"), 구분선 y 150. 레코드 행 높이 inline 56 / stacked 96, 행 r의 표지·비고 셀 y = 152 + r·행높이 + 8, 값 셀 y = inline이면 같은 줄, stacked이면 +40. 행마다 아래 구분선.
- `cards`: 카드 k의 위 y = 104 + k·(카드높이 + 32), 카드높이 inline 156 / stacked 196, 네 변 테두리(2px). 캡션 줄 y+10("카드 k+1"과 값 열 위 항목명), 레코드 줄 y+58(표지·비고; 값은 inline이면 같은 줄, stacked이면 +40), 꼬리 줄("기록 번호 NNNN") inline y+106 / stacked y+146.
- 레코드마다 표지(`label` 역할), 값(`value`), 오른쪽 비고(`note`) 세 항목. 모든 페이지에 목표 외 레코드(표 3개, 카드 1개)와 다른 숫자/문자열(다른 값, 비고의 숫자, 카드 꼬리 번호), 표지 줄 오른쪽의 무관 항목(비고)이 있다.

### 3.3 텍스트와 질문

- 문서 종류별 표지 목록 20개(생성기 상수, 직접 지어낸 3어절 한글 이름), 값 항목명·질문 문형:
  - exhibit "설치 높이", 값 `NNN cm`(110–260), 질문 `{표지}의 설치 높이는 얼마인가요?`
  - costume "수선 마감일", 값 `M월 D일`, 질문 `{표지}의 수선 마감일은 언제인가요?`
  - lostfound "보관 위치", 값 `X열 N번`(X ∈ A–F, N 1–40), 질문 `{표지}의 보관 위치는 어디인가요?`
- 목표 표지: 문서 종류 안 순번 t(0–15, 페이지 순서)의 표지 목록 t번째. 다른 레코드 표지·값·비고·꼬리 번호는 `random.Random("ko-row-window|<ID>")`로 뽑는다(값·비고는 페이지 안 유일).
- 정답 = 목표 레코드 값 텍스트. 골드 두 상자 = 목표 표지 item과 목표 값 item의 실제 잉크(고정 렌더러 `getbbox`, 반열림 `[l, t, r, b)`).
- 등록 설계 조건(생성기 `check`가 검사): 48쪽·ID 유일·격자 완전(각 칸 사례 0·1), 정규화 질문 유일, 질문에 목표 표지 정확히 1회, 질문에 ASCII 영숫자 없음(K0가 정상 미매치가 되어 W1 대상인 한글 분기로 감), 목표 표지의 한글 bigram ≥ 3개이며 페이지의 다른 어떤 item과도 bigram을 공유하지 않음, 레코드 수, 표지·값·비고 페이지 안 유일, inline/stacked·near/far 좌표 조건, 비고가 값 오른쪽·표지 행에 있음, 셀 겹침 없음, 셀이 구분선과 겹치지 않음, (`--font` 지정 시) 글꼴 측정 텍스트 상자가 셀 안.
- 한계(공개): 표지 목록은 순서대로 배정되므로 표지 길이와 조건이 겹칠 수 있다. 값 항목명은 표 머리글·카드 캡션에도 나오므로 K1이 머리글 줄을 고를 수 있다(#149 관찰). 이 선택 순위는 고정 규칙이며 바꾸지 않는다.

### 3.4 생성·렌더 뒤 OCR 전 검사

생성: `python research/tools/ko-row-window/design.py --out <data> --font <글꼴>` → `design.json`, `questions.json`. 렌더: `python research/tools/r09/render.py --design <data>/design.json --font <글꼴> --out <data>` → `images/`, `gold.json`, `render.json`, `render-check.json`. 검사 `node src/ko-row-window-data.mjs check --data <data>` → `checks.json`. 전부 통과해야 동결한다.

1. 렌더 유효: `failedImages = 0`; 페이지마다 골드 2개 = (목표 표지, 목표 값), 양의 면적, 페이지·지정 셀 안, 서로 겹치지 않음, 다른 item 잉크와 겹치지 않음(렌더러 검사).
2. 배정: 48쪽 격자, 생성기 `check` 문제 0, 슬롯 공식, `questions.json`이 design과 같은 순서·질문.
3. 유일성: 48개 PNG 원바이트 SHA-256 서로 다름, 정규화 질문(NFC, 양 끝 공백 제거, 내부 연속 공백을 하나로) 서로 다름.
4. 세로 배치·열 간격 실측: inline 페이지는 목표 표지·값 잉크의 세로 범위가 양의 길이로 겹침, stacked는 값 잉크 위 ≥ 표지 잉크 아래. 값 잉크 왼쪽 − 표지 잉크 오른쪽(잉크 간격)을 페이지별로 기록하고 far의 최솟값 > near의 최댓값인지 확인한다.
5. 기존 자료와의 겹침(숫자 보고): R09 평가 48쪽·개발 쪽(`0fb3053…:research/results/r09-bilingual/{heldout,dev}`), FCP 48쪽(`708d9946…:research/results/fresh-crop-padding/frozen/selector-input`), #148 96쪽(`2ab9ed14…:research/results/ko-ocr-holdout/data`), 그중 #149 코호트 24 ID(`fd7ba06e…:research/results/ko-window-diagnostic/cohort.json`)를 따로 표시. PNG SHA-256 겹침 0, 정규화 질문 겹침 0이어야 한다. 동일 이미지·동일 질문은 독립 48쪽으로 인정하지 않는다.
6. 결정성: 생성·렌더 전체를 두 새 폴더에서 각각 실행해 모든 파일 바이트가 같다.

- 실패하면 OCR 없이 원인·수정·해시를 `checks.json`과 인계서에 남기고, 수정한 생성기를 다시 등록(커밋)한 뒤 다시 동결한다. OCR 성공률로 입력을 바꾸지 않는다. 예비 실행은 48쪽과 별개인 손계산 예제에서만 한다. 실험 OCR을 미리 돌리지 않는다.
- **자료 동결 커밋:** `data/` 전체와 파일별 SHA-256 `data/manifest.json`, 질문·정답 해시(`questions.json`·`gold.json`의 SHA-256)를 첫 OCR 호출 전에 커밋·push한다.

## 4. 고정 처리

### 4.1 고정 원본

| 대상 | 고정 객체 |
|---|---|
| K1 정의 `keyResults`, `scoreKey`, `checkLangFiles`, `compareRows`, `sha256`, `jsonl` | `c0c2f5dd…:research/src/ko-ocr-factorial-lib.mjs` blob `d882b6640fcafabcc62e14ebfd571749d88f4bf6` |
| OCR 함수 `newWorker`, `ocrLines`, `withTimeout` | `c0c2f5dd…:research/src/ko-ocr-factorial-run.mjs` blob `3ddf60ab02c4195dc0441ea6d8959de52373cafc`(함수 본문 바이트 일치, #148 O1 실행기와 같은 함수) |
| 고정 K0 선택기 `selectWindow` | main `research/src/selector.mjs` blob `b3b4965b2d330907c0143fe178013aace1be8372` |
| O1 출처 | #148 `2ab9ed149896cc06cec387826ab99fa5bac77cda`(언어 순서 `eng+kor`, OEM 1, 페이지 180,000ms) |
| 진단 출처 | #149 `fd7ba06e496437c7fc799348a95f649e85d87d7b` |

- **어댑터** `research/src/ko-row-window-fixed.mjs`: #147 lib blob을 `git cat-file`로 읽어 blob ID를 다시 계산·대조한 뒤 Git 무시 캐시 `research/.cache/ko-row-window/fixed/`에 바이트 그대로 쓰고 동적 `import()`한다. K0/K1 규칙을 새로 구현하지 않는다.
- 엔진 `tesseract.js` 5.1.1 / `tesseract.js-core` 5.1.1(연구 lockfile 그대로), O1 = `"eng+kor"`. 언어 파일 `eng.traineddata` SHA-256 `5dc5d8d6…b400d747`(5,199,098바이트), `kor.traineddata` `ec174937…32109992`(2,208,378바이트), 위치 `research/.cache/ko-ocr-factorial/`(Git 무시; 검증된 #148 작업 트리 캐시에서 복사하며 재배포하지 않는다), `langPath = cachePath =` 그 폴더, `gzip: false`, `cacheMethod: "readOnly"`.

### 4.2 OCR (페이지당 1회)

- 실행기 `node src/ko-row-window-run.mjs --out <ocr dir>`: 시작 전 가드(오프라인 가드 `NODE_OPTIONS=--require=<tools/d03/guard/node-netguard.cjs>`·`D03_NET_LOG`, 고정 lib·선택기 blob, OCR 함수 본문 일치, 실행 코드가 HEAD와 같음, 엔진 버전, 두 언어 파일, 자료 동결 커밋의 `data/`와 매니페스트 SHA-256). 하나라도 어긋나면 `stop.json`만 쓰고 종료 2.
- O1 워커 1개로 48쪽을 질문 순서로 한 번씩 인식한다. 각 페이지에서 고정 `keyResults(selectWindow, lines, question, W, H)`를 한 번 실행해 K1 기록을 얻는다. 실행기는 `questions.json`과 PNG만 읽는다.
- 페이지 제한 180,000ms. 시간 초과·OCR 예외는 **재시도하지 않고** 그 페이지의 기술 오류로 남기며(K1도 오류), 워커를 새로 만들어 다음 페이지부터 계속한다. 워커 재생성도 실패하면 `incomplete.json`을 쓰고 멈춘다(불완전 실행 명시).
- 출력: `ocr.jsonl`(48행: `id, pngSha256, width, height, status, error, ocrSha256, ocrLineCount, ocrLines`), `k1.jsonl`(48행: `id, status, error, k1`), `freeze.json`(두 파일 원바이트 SHA-256), `guard-summary.json`, `run-meta.json`(시각·시간, 결정적 아님). UTF-8, LF.
- OCR 동결 커밋: 이 폴더를 커밋·push한다. 이후 OCR을 다시 실행하지 않는다(W0·W1과 두 재생 런 모두 이 OCR 하나를 쓴다).

### 4.3 W0

- W0 = 동결된 K1 기록의 `band`(정상 매치일 때). 정상 미매치·오류는 그대로 보존한다. W0·W1은 같은 OCR·같은 K1 기록(선택 줄, 히트 단어 인덱스)을 읽는다. 진단 대상 ID, 정답, 역할, 셀, 템플릿, 문서 종류를 예측기에 넣지 않는다.

### 4.4 W1 (등록 규칙)

`RECOUNT_SPEC.md` 4절이 정의다. 요약:

- K1이 정상 매치이고 `branch "hangul"`일 때만 실행한다. K0 분기 매치·미매치·오류는 W1 = W0(상태 보존).
- 히트 단어 h(선택 줄 `hitWords`)와 전체 OCR의 공백 아닌 단어 c를 원본 픽셀 반열림 사각형으로 바꾸고, `c.left ≥ h.right` ∧ 세로 교집합 높이 > 0 ∧ 교집합 ≥ 두 높이 중 작은 쪽의 절반이면 같은 행의 오른쪽 후보로 포함한다. 히트마다 계산해 합집합을 쓴다. 신뢰도 필터 없음.
- 실수로 비교한 뒤 후보 오른쪽 최댓값을 한 번 올림하고 페이지 폭으로 제한한다. 새 오른쪽 끝 = max(W0 오른쪽 끝, 그 값). 왼쪽·위·아래는 그대로. 동일 줄 제한·무관 항목 제거·여백·최대 거리·사후 예외 없음.
- 인덱스 불일치·기록 손상은 페이지 오류가 아니라 **과제 검증 실패**다(4.6).
- 페이지별로 분기, 사유(`widened`/`not_wider`/`no_candidate`/`k0_branch`/`unmatched`/`error`), 후보 목록, 최댓값·clip 값, 두 창, 추가 픽셀을 남긴다.

### 4.5 재생과 예측 동결

- 재생기 `node src/ko-row-window-replay.mjs --ocr <ocr dir> --out <replay dir>`: OCR `freeze.json` 해시 확인 → 각 페이지 원시 OCR로 고정 `keyResults`를 다시 실행해 저장 K1과 정규화 JSON이 같은지 확인 → W1 계산 → `predictions.jsonl` **48행**과 `freeze.json`. 재생기는 `questions.json`, PNG(크기·해시), OCR 폴더만 읽는다.
- 재생 A의 `predictions.jsonl`을 커밋·push(예측 동결: 시점·커밋·SHA-256을 결과에 적는다)한 **뒤에만** 채점기가 `design.json`·`gold.json`·`render.json`을 연다.
- 재생 B: 별도 프로세스에서 같은 동결 OCR로 다시 재생·채점해 결정적 파일을 바이트·행 단위로 비교한다. OCR을 두 번 수행한 독립 실험이 아니다.

### 4.6 오류와 검증 실패

- 통상 OCR/선택기 기술 오류·타임아웃은 48쪽 분모에 남기고 두 조건 모두 실패(성공 불가)로 센다. 2×2의 실패 칸에 오류가 있으면 오류 수를 병기한다.
- 원본 해시·인덱스·키 손상·누락, 사전등록 위반, 결정적 재생 불일치는 **과제 검증 실패**다. 그 실행을 불완전으로 기록하고, 손상 페이지를 뺀 표로 결론을 내지 않는다. 같은 조건으로 복구·재실행하면 이전 시도와의 차이를 남긴다.

## 5. 채점과 보고 지표

`RECOUNT_SPEC.md` 5–6절이 정의다.

- **엄격 성공**(#147 `scoreKey` 그대로): 정상, 매치, `0 < 면적 < 페이지 면적`, 표지·값 두 잉크 전체 포함(여유 0). 창이 전체 페이지면 두 잉크를 담아도 실패. 미매치 fallback·기술 오류는 성공이 될 수 없고 48쪽 분모에 남는다.
- **단계**: 48쪽 = 오류 + 정상 미매치 + 정상 K0 매치 + 정상 한글 매치. 한글 매치 안: 검증된 히트 수 → 후보 있는 수 → 실제 확대 수. 깊이가 다른 분모를 합산하지 않는다.
- **전이 2×2**(W0 엄격 × W1 엄격): 회복(실패→성공), 손실(성공→실패), 유지, 둘 다 실패(오류·미매치 별도 표기). 48쪽 전체와 세로 배치·양식·간격·문서 종류별. 오류·미매치·full-page 수 별도. 조건부 분모와 원빈도: 회복/W0 실패 수, 손실/W0 성공 수. 0분모는 "해당 없음". 순증 = 회복 − 손실.
- **면적**: 유효 매치 쌍 전체와 넓힌 페이지 각각에서 페이지 면적 대비 증가 %p의 평균·중앙값·최대, 추가 픽셀 합·표본 수, 신규 성공당 추가 픽셀(합/회복, 0이면 해당 없음), 순증당 추가 픽셀(합/순증, 순증 ≤ 0이면 해당 없음과 이유).
- **새로 포함한 잉크**(골드 측 사후 검산): W1에만 완전히 들어간 다른 레코드 값·다른 표지·비고·머리글 등 item 수.
- **불변식**: 모든 페이지에서 W1 ⊇ W0, 왼쪽·위·아래 불변, 양쪽의 OCR·K1 매치·선택 줄 동일. 손실이 있으면 새 창이 전체 페이지인지 원본으로 확인한다.
- 결과는 양성·음성 모두 그대로 보고한다(회복 0, 손실, 면적 악화 포함).

## 6. 시험 (등록 커밋, 구현 전 RED)

- JS `research/test/ko-row-window.test.mjs`: 손계산 예제 전 사례(경계 50%와 바로 아래, 왼쪽 접촉, 행 접촉 0, 공백 단어, 별도 OCR 줄의 같은 행, 다중 히트, 무관한 먼 오른쪽 단어, 후보 없음, 넓히지 않음, K0 분기, clip·올림, 오류·미매치), 검증 실패 5종, W1 ⊇ W0 불변식, 채점 6쪽(회복·유지·전체 페이지로 확대 시 기존 성공 손실·미매치·오류·K0 분기)과 집계·0분모, ID 중복/누락/추가/순서, 주변합 보존 변조 탐지, 재생 K1 불일치·ID 결합·이미지 해시 거부, 고정 lib 바이트 일치와 변조 거부, OCR 함수 본문 일치, 질문 정규화·기존 자료 겹침 검사, README 재현 경로.
- Python `research/tools/ko-row-window/test_recount.py`: 같은 예제와 경계를 독립 구현으로.
- 구현 중 시험을 바꾸면(예: 예제 오기 수정) 커밋 메시지와 인계서에 이유를 적는다. 판정 규칙은 바꾸지 않는다.

## 7. 독립 검산

`research/tools/ko-row-window/recount.py`(표준 라이브러리만): `RECOUNT_SPEC.md` 검사 1–5. 원시 OCR에서 K0·K1을 Python으로 다시 계산해 저장 K1과 대조, W1 후보·창 재계산, 정답·골드 기하, 행 판정, 전이표, 면적, 다른 레코드 포함, 집계를 행 단위로 대조한다. 재생 A·B 각각 종료 0이어야 한다. 실제 결과 사본에 변조 5종을 넣어 거부되는지 `recount/mutation.json`에 남긴다.

## 8. 커밋 순서

1. 등록 커밋 → push → 즉시 Draft PR → `gh pr view`로 `isDraft: true`·head SHA 확인.
2. RED 기록 커밋(`logs/red-before-impl.txt`).
3. 구현(어댑터·lib·데이터 검사·실행기·재생기·채점기·비교기·검산기) → 시험 GREEN.
4. 자료 생성·렌더·OCR 전 검사 → 자료·질문·정답 해시 동결 커밋 → push.
5. OCR 1회 → OCR·K1 동결 커밋 → push.
6. 재생 A → 예측 48행 동결 커밋 → push(정답을 열기 전).
7. 채점 A, 재생 B·채점 B, A/B 비교, 독립 검산 A·B, 변조 점검, 결과 문서, 연구·제품 검증, 인계서.

## 9. 산출물·소유 경로·완료 조건

- 소유(신규 파일만): `research/plans/2026-11-24-ko-row-window-protocol.md`, `research/src/ko-row-window-*.mjs`, `research/test/ko-row-window.test.mjs`, `research/tools/ko-row-window/`, `research/results/ko-row-window/`, `docs/agent/handoffs/ko-row-window-holdout.md`. 의존성 설치(lockfile `npm ci`)와 Git 무시 캐시(`research/.cache/`)는 허용된 로컬 상태다.
- 결과 폴더: `data/`(동결 자료, `manifest.json`, `checks.json`), `ocr/`(OCR·K1 동결), `replay-a/`, `replay-b/`(예측 48행), `score-a/`, `score-b/`(`score.jsonl` 48행, `summary.json`), `ab-compare.json`, `recount/`(`recount-a.json`, `recount-b.json`, `mutation.json`), `logs/`, `README.md`(재현), `RESULTS.md`(한국어 결과).
- 완료 조건: 시험 GREEN, 자료 동결, OCR 1회·동결, 예측 동결 후 채점, A/B 재생 바이트 동일, 검산 A·B 종료 0, 변조 거부, 가드 차단 0(아니면 그대로 보고), 연구 회귀, 제품 npm 7단계, 결과·인계서. WBS는 갱신하지 않는다(과제 지시).

## 10. 등록 전에 이미 본 것 (공개)

- 요청서, #147 lib·실행기 OCR 함수·고정 선택기·렌더러 본문, #148 프로토콜·실행기·lib·어댑터·작성자 지침·재현 README·인계서, #149 RESULTS·lib·검산기 일부·원본 pin·코호트 형식·인계서. #148·#149 결과 요약(이번 기댓값으로 쓰지 않는다).
- 생성기 개발 중 설계 검사(`design.py --font`: 글꼴로 텍스트 상자 크기만 측정, PNG 미생성)를 저장소 밖 임시 폴더에서 실행했고 문제 0, 두 번 실행 바이트 동일을 확인했다. 새 48쪽 PNG 렌더·OCR·K1·채점은 0회다.
- 설치 글꼴 SHA-256이 등록값과 같음, Python 3.12.10·Pillow 12.3.0·fontTools 4.63.0, Node v24.18.0.
