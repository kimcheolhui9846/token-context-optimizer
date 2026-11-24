# 한국어 OCR × 한글 검색 키 보존 — 합성 문서 96쪽 대응 4조건 실험 사전등록 프로토콜

- 작성 2026-11-24. Tier E. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. 브랜치 `claude/ko-ocr-factorial`.
- 요청서: 메인 checkout `codex_review/codex_paste_2026-11-24_ko-ocr-factorial.md`(맨 끝 "최종 검토 반영" 절 우선). 사용자 승인 범위: PR #146 후속 네 조건 비교, 로컬 오프라인 OCR 실측, Draft PR까지. 연구 API 비용 0원.
- **등록 커밋:** 이 문서, 채점 전용 명단 `research/results/ko-ocr-factorial/cohort.jsonl`, 전용 핸드오프만 담은 첫 커밋이다. 그 전에는 한국어 언어 파일로 OCR을 한 번도 실행하지 않았고, K1 규칙을 어떤 페이지에도 계산하지 않았으며, 정답(gold) 파일을 열지 않았다. 등록 전에 본 것은 §11에 그대로 적는다.
- 제품 코드, 기존 연구 파일, 기존 PR, 논문, WBS 수치는 이 실험의 변경 대상이 아니다. 패키지 manifest·lockfile을 바꾸지 않는다.

## 1. 역할

| 주체 | 역할 |
|---|---|
| 사용자 | 실험 승인, merge·Ready 승인 |
| Codex Astra (PM) | 요청서, 언어 파일·명단 사전 대조, 최종 판정 |
| Claude Code Opus 5.5 (연구 작성자) | 이 문서, 연구 코드, 연구 시험, 실측, 채점, 한국어 결과, 핸드오프, Draft PR |
| 독립 Python 검산 작성자 | 연구 작성자와 다른 하위 에이전트. 이 문서와 고정 선택기 `research/src/selector.mjs`만 받아 별도 검산기를 쓴다. 새 JS 코드를 보지 않는다 |
| harness-opus-review (claude-opus-5-5) | 계획 검토(완료: CHANGES REQUIRED → 수정안 PASS WITH NOTES), 구현 마일스톤 독립 검토 |
| Argon (gemini-4-argon, BAZE) | 최소 공개 발췌(공개 집계와 지정 행) 교차 확인 |

## 2. 질문과 해석 한계

#146 진단에서 한국어 자연어(KO/nl) 질문 24개는 영어 OCR 단어에 한글이 0개라 모두 미매치였다. 이 실험은 같은 96쪽에서 두 요인을 짝지어 바꾼다.

- **O(OCR 언어):** O0 = 기존 `eng`, O1 = `eng+kor`
- **K(검색 키):** K0 = 기존 ASCII 선택기, K1 = K0 미매치 때만 쓰는 한글 두 음절 보조 규칙 하나

결과는 이 합성 문서(두 생성 계열 R09·FCP, en/ko 짝), 이 OCR 언어 순서, 이 보조 규칙에 대한 **탐색적** 결과다. 후보(한국어 OCR, 두 음절 조합)는 같은 자료의 사후 진단(#146)에서 제안되었다. 창 안에 근거가 들어오는 것은 표지 인식·질문 답변 정확도가 아니며, 제품·답변 모델을 호출하지 않는다.

## 3. 입력과 고정 원본

### 3.1 Git 객체

| 자료 | 파일 | 고정 커밋:경로 | blob/tree |
|---|---|---|---|
| R09 | 질문 | `0fb3053…:research/results/r09-bilingual/heldout/questions.json` | `605ff760cc1c12de0a0d21076ac0b8eecb79032a` |
| R09 | PNG 48장 | `0fb3053…:research/results/r09-bilingual/heldout/images` | tree `66bf13c62c6ae10e380558b7add188747928352b` |
| R09 | 설계(언어·앵커 분류, 채점 전용) | `0fb3053…:research/results/r09-bilingual/heldout/design.json` | `dc3307818cba423b3fc2eade8ed7f2116593f788` |
| R09 | 정답 상자(채점 전용) | `0fb3053…:research/results/r09-bilingual/heldout/gold.json` | `5d6c277d4c9cd55e4a101252fce8032294a21ae9` |
| R09 | 과거 run A 원시(대조 전용) | `0fb3053…:research/results/r09-bilingual/heldout/run-a/raw.jsonl` | `876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318` |
| FCP | 질문 | `708d994…:research/results/fresh-crop-padding/frozen/selector-input/questions.json` | `ae578b7267ff124ecf4a0a5157f7067925b177ca` |
| FCP | PNG 48장 | `708d994…:research/results/fresh-crop-padding/frozen/selector-input/images` | tree `84eb5dddb4bb37f0ff1bf62e82e523f77e7dbbca` |
| FCP | 색인(언어·앵커 분류, 원본 SHA, 채점 전용) | `708d994…:research/results/fresh-crop-padding/frozen/selector-input/index.json` | `75109569a3c310127f4dbe4d8551c259aa537cba` |
| FCP | 정답 상자(채점 전용) | `708d994…:research/results/fresh-crop-padding/frozen/oracle/gold.json` | `eb43d6009cc77b0d86bfb9275ff891477db3d25f` |
| FCP | 과거 run A caller(대조 전용) | `708d994…:research/results/fresh-crop-padding/run-a/caller.jsonl` | `d657d59d7124f68743a1e54a7eb7c62f521dbc21` |
| 기준 | #146 기준 재생 | `cdff545…:research/results/ko-anchor-diagnostic/replay.jsonl` | `3f0564c2a1988d70de7ed308c2cab80a2dc7e686`, 파일 SHA-256 `9510835d4120cf181e3b879bf965446f6b01f8248102e55623f8a02c3b110204` |
| 코드 | 고정 선택기 | `0fb3053…:research/src/selector.mjs` | `b3b4965b2d330907c0143fe178013aace1be8372` |

- #145 head `708d9946ae091180a1b716baadfdd73fcfe5a19b`와 #146 head `cdff545c3eb31bee3099ec4a62cb7b637975b4c7`는 `git fetch origin pull/145/head pull/146/head`로 받아 Git 객체로만 읽는다. 병합하거나 그 위에 쌓지 않는다.
- 모든 바이트는 `git cat-file blob`으로 읽고 blob ID를 다시 계산해 대조한다. PNG는 트리 항목 이름 `<file>`로 찾고, FCP는 색인의 `sha256`과도 대조한다. 작업 사본 파일은 입력으로 쓰지 않는다.
- R09는 질문 목록의 48쪽만 쓴다(그림 예시 `review/`, dev, run B, replay 출력은 제외). FCP는 frozen 48쪽(run B, p0/p4 출력은 제외).

### 3.2 분모와 명단

- 자료마다 48쪽 = 언어(en/ko) × 앵커(code/nl) 4칸 × 12쪽. 두 자료 합계 96쪽. 고유키는 (자료, ID)다.
- **채점 전용 명단** `cohort.jsonl`: #146 `replay.jsonl`의 96행을 그 순서대로 `{dataset, id, baselineMatched}`로 옮겼다(파일 SHA-256 `86ccac534bacaeb6b4ca463fe7f5de41a5b33f68cc534f2002c417e35e6b2eb3`, LF). 전원 `status: ok`, `ok: true`, 자료별 매치 36·미매치 12. 미매치 ID는 두 자료 모두 KO/nl 12개와 같다(채점기가 설계·색인으로 다시 확인한다).
- **주 집단:** 기준 미매치 24쪽(자료별 12). **대조 집단:** 기준 매치 72쪽(자료별 36).
- **기준 엄격 성공:** 과거 run A의 반환 창(§6.1 판정)으로 정한다. PM 사전 확인값은 72개 중 70개(35+35), 미매치 24개는 0개, 전체 70/96이다. 이는 채점기가 검증할 기준값이며 신규 조건의 수치가 아니다. 다르면 명단을 그대로 두고 다른 행을 명시하며, 일치하는 행만으로 96쪽 효과를 추정하지 않는다.
- 세 분모를 혼동하지 않는다: 회복 **/24**, 기준 매치 손실 **/72**, 기준 엄격 성공 손실 **/70**(채점기가 검증한 실제 값; 다르면 그 값), 전체 **/96**.

## 4. 조건

### 4.1 OCR (O0, O1)

- 엔진: `tesseract.js` 5.1.1(`tesseract.js-core` 5.1.1), OEM 1, 연구 lockfile 그대로. 전처리는 고정 선택기 `createOcr`와 동일하다: `s = min(4, 4096 / max(W, H))`, `sharp(bytes).resize({ width: round(W·s) }).png()`, `recognize(img, {}, { blocks: true })`, 블록→문단→줄, 줄 `{text: trim, confidence, box, words:[{text, box}]}`, 상자 `[x0/s, y0/s, (x1−x0)/s, (y1−y0)/s]`. 반올림·클리핑 없음.
- 언어: O0 `"eng"`, O1 `"eng+kor"`(순서 고정: eng, kor). 그 밖의 매개변수·최적화 없음.
- 언어 파일: `@tesseract.js-data/eng@1.0.0`, `@tesseract.js-data/kor@1.0.0`의 `4.0.0_best_int/*.traineddata.gz`를 압축 해제한 원바이트.
  - `eng.traineddata` SHA-256 `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`, 5,199,098바이트
  - `kor.traineddata` SHA-256 `ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992`, 2,208,378바이트
- 작업별 캐시 `research/.cache/ko-ocr-factorial/`(Git 무시). 워커 옵션 `langPath`와 `cachePath`를 이 폴더로, `gzip: false`, `cacheMethod: "readOnly"`.
- **시작 전 가드(OCR 호출 전 중단):** 두 파일의 경로·크기·SHA-256, `tesseract.js`·`tesseract.js-core` 패키지 버전 5.1.1, 고정 선택기 blob, 실행 코드 파일이 HEAD와 같음(측정 시), `NODE_OPTIONS`에 `node-netguard.cjs`와 `D03_NET_LOG` 지정. 하나라도 어긋나면 `stop.json`만 쓰고 종료한다.

### 4.2 검색 키 (K0, K1)

**K0:** 고정 `selectWindow(ocrLines, question, W, H)`를 수정 없이 호출한다.

**K1:** 먼저 K0를 그대로 호출한다.

1. K0가 예외 → K0·K1 모두 기술 오류(K1으로 구제하지 않는다).
2. K0 매치 → K1은 K0 결과 그대로(분기 `k0`).
3. K0 미매치 → 한글 보조 규칙:
   - `bigrams(s)`: NFC 정규화 → 현대 한글 음절 `[가-힣]+`의 최대 연속 구간 → 각 구간에서 겹치는 인접 두 음절 → 중복 제거 집합. 라틴·숫자·공백·문장부호·문자열 경계가 구간 경계다. 같은 음절 반복(`하하`)도 조합이다.
   - Q = `bigrams(question)`. Q가 비면 미매치(분기 `none`).
   - 줄 점수 = |Q ∩ ⋃ bigrams(word.text)| (그 줄의 OCR 단어마다 따로 계산; 단어 경계를 넘지 않고 `line.text`는 쓰지 않는다).
   - 점수 양수 최댓값 줄. 동점은 원시 `confidence`가 엄격히 큰 줄, 그래도 같으면 원래 줄 순서가 앞선 줄.
   - 양수 줄이 없으면 미매치(분기 `none`).
   - 앵커 = 선택 줄에서 `bigrams(word.text) ∩ Q ≠ ∅`인 단어 상자의 합집합 `[x, y, w, h]`.
   - 이후는 고정 `selectWindow`와 같은 계산: `lh = max(8, line.box[3])`, `meanLen = Σ word.text.length / max(1, words.length)`(JS UTF-16 길이), `axisRow = words.length ≥ 8 && meanLen ≤ 4 && anchor.w < 0.25·line.box[2]`, 축 행이면 가로 `cx ± max(1.5·anchor.w, 3·lh)`, 세로 `anchor.y − 0.75·H` … `anchor.y + anchor.h + 6·lh`; 아니면 가로 `min(anchor.x, line.x) − 4·lh` … `line.x + line.w + 8·lh`, 세로 `line.y − 3·lh` … `line.y + line.h + 6·lh`; 최소 256 × 128로 양쪽 대칭 확장; `left = max(0, floor(x0))`, `top = max(0, floor(y0))`, `right = min(W, ceil(x1))`, `bottom = min(H, ceil(y1))`.
   - 반환: 분기 `hangul`, `score`, `lineText`, `confidence = Math.round(line.confidence)`, `axisRow`, `band {left, top, width, height}`, 앵커, 적중 단어 번호.
- 불용어·임계값·다른 백오프·질문별 예외를 추가하지 않는다. 선택기는 ID와 언어/앵커 분류로 분기하지 않는다(ID는 결합용으로만 보존).
- **입력 검증(페이지 단위, 선택기 호출 전):** 각 줄의 `text` 문자열, `confidence` 유한수, `box` 유한수 4개, `words` 배열, 각 단어 `text` 문자열과 `box` 유한수 4개. 누락·NaN·무한대는 그 페이지의 기술 오류(`input_validation`)이며 두 키 조건 모두 오류다.
- **출력 검증:** 매치 창이 정수이고 `width > 0`, `height > 0`, 페이지 안이어야 한다. 아니면 그 키 조건의 기술 오류(`invalid_output`). K1이 분기 `k0`이면 K0 상태를 그대로 따른다.

## 5. 실행

### 5.1 순서와 워커

- run A, run B는 각각 별도 프로세스, 별도 새 출력 폴더. 한 run 안의 순서: O0·R09 → O0·FCP → O1·R09 → O1·FCP. 자료 안에서는 등록된 질문 순서.
- (조건, run, 자료)마다 새 OCR 워커 1개를 만들어 48쪽에 재사용한 뒤 종료한다. 페이지 OCR을 실제로 실행하고 그 결과를 같은 OCR 조건의 K0·K1에 똑같이 준다.
- 페이지 제한 시간 180,000ms. OCR 예외·시간 초과는 그 페이지의 기술 오류이며 **재시도하지 않는다.** 그 뒤 워커를 종료하고 같은 조건으로 새로 만들어 다음 페이지부터 계속하며, 사건을 메타데이터에 기록한다.
- 기계적 불일치·오류는 원래 분모에 남긴다. 재시도·제외로 분모를 바꾸지 않는다. 정상 계획은 2 OCR 조건 × 2 run × 96쪽 = 384 페이지 OCR이다.

### 5.2 출력(run 폴더)

| 파일 | 내용 | 결정적 |
|---|---|---|
| `predictions.jsonl` | 192행(O0 96, O1 96), §5.1 순서. 행: `ocr, dataset, id, pngSha256, width, height, status, error, ocrSha256, ocrLineCount, k0{…}, k1{…}` | 예 |
| `ocr.jsonl` | 같은 순서 192행: `ocr, dataset, id, status, ocrLines` | 예 |
| `freeze.json` | 위 두 파일의 원바이트 SHA-256 | 예 |
| `guard-summary.json` | 이 run 단계의 가드 차단 수, 언어 파일·엔진 식별 | 예 |
| `run-meta.json` | 시작 시각, 페이지별 시간, PID, 워커 재생성 사건, Node·플랫폼 | 아니오 |

- 키 결과 `k0`/`k1`: `status, error, branch, keys, hangulKeys(K1), matched, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor(K1), hitWords(K1), band`. `ocrSha256` = `JSON.stringify(ocrLines)` UTF-8의 SHA-256. 행에는 run 표지를 넣지 않는다(A/B 바이트 비교).
- K0의 `lineIndex`는 각 줄 단독 `selectWindow([line])` 점수와 같은 동점 규칙(점수 큼 → 신뢰도 엄격히 큼 → 앞선 줄)으로 다시 찾은 줄이며 `lineText`가 반환값과 같아야 한다(아니면 그 키 조건 `invalid_output`).
- 모든 파일은 UTF-8, LF, 마지막 줄 바꿈. 예측 파일 해시를 `freeze.json`에 고정한 뒤에만 채점기가 정답·설계·과거 기록을 연다. 첫 실행과 감사를 섞지 않는다.

## 6. 채점(예측 고정 뒤)

### 6.1 판정

- 채점기는 `freeze.json`과 두 파일의 해시가 맞지 않으면 중단한다. 명단 96행이 #146 replay와 같고, 주 집단이 설계/색인의 KO/nl 24쪽과 같은지 확인한다.
- 정답 상자: `gold[id].parts`의 두 항목 `rect = [l, t, r, b]`(원본 픽셀 반개방, `size = [r−l, b−t]`와 일치). ID당 정확히 2개가 아니면 채점 중단.
- 창 `band`는 원본 픽셀 반개방 `[left, left+width) × [top, top+height)`. 상자 포함: `l ≥ left && t ≥ top && r ≤ left+width && b ≤ top+height`(여유 0px).
- **엄격 성공:** 상태 정상, 매치, `0 < width·height < W·H`, 두 상자 모두 포함. 근거 분류: 매치 행의 `all`(2/2), `partial`(1/2), `none`(0/2). 전체 페이지 창은 엄격 성공이 아니며 별도 표시. 미매치는 원본 fallback으로 표시하되 회복 점수 0이고, 제품·답변을 호출한 것으로 적지 않는다.
- 행 상태: `technical_error` / `unmatched` / `matched_strict` / `matched_not_strict`. 오류를 성공으로 세지 않는다.

### 6.2 지표 (조건 O0K0, O0K1, O1K0, O1K1; 주 분석은 run A)

자료별·전체 및 언어×앵커별로 분모, 기술 오류 수, 매치, 미매치(fallback), 엄격 성공을 보고한다. 그리고:

1. **단순 매치 회복** = 주 집단 중 매치 수 /24. 그중 엄격 회복, 매치만 된 건(근거 partial/none) 분리.
2. **엄격 근거 회복** = 주 집단 엄격 성공 /24.
3. **기준 매치 → 미매치** = 대조 집단 미매치 수 /72. 매치 유지·근거 상실(기준 엄격 성공이었고 매치지만 엄격 실패) 별도.
4. **기준 엄격 성공 → 실패** = 기준 엄격 성공 행 중 정상 상태로 엄격 실패(미매치 포함) /기준 엄격 성공 수(70 예상). 대조 72 중 기준 비엄격 행의 새 엄격 성공 별도.
5. **전체 엄격 성공** /96.

- 기술 오류 행은 분모에 남기고 손실·실패 정상 전이와 **별도 열**에 둔다.
- 원시 손실 표에서는 양수가 실제 손실 수다.
- **교호 대비(사전등록, 다섯 지표 각각):** 지표값 m(조건)을 수로 두고 `(m(O1K1) − m(O1K0)) − (m(O0K1) − m(O0K0))`. 손실 두 지표(3, 4)는 m에 음수를 취한 뒤 같은 식을 적용하므로 양수가 개선 방향이다. 원시 분수와 퍼센트포인트(수/분모·100)를 병기한다. 단순 효과(O0에서 K, O1에서 K, K0에서 O, K1에서 O)도 같은 형식으로 준다. 네 조건 중 그 지표 분모에 기술 오류 행이 있으면 그 수를 함께 적고 `qualified`로 표시하며 수치 하나로 단정하지 않는다.
- 같은 페이지 조건 간 대응 전이(2×2: 엄격 성공 여부, 매치 여부) — O0K0→O0K1, O1K0→O1K1, O0K0→O1K0, O0K1→O1K1, O0K0→O1K1. 집단을 합치거나 독립 표본을 가정한 검정은 하지 않는다.
- 보조 공개: O0와 O1에서 OCR 줄 텍스트 목록이 다른 페이지 수, K1 분기 분포(`k0`/`hangul`/`none`).

### 6.3 과거 대조(O0K0, run A와 run B 각각)

과거 run A(R09 `raw.jsonl`, FCP `caller.jsonl`)와 행별로 `keys, matched, score, lineText, confidence, axisRow, band`를 비교하고, 반환 창의 엄격 성공 여부(근거 포함)를 비교한다. 원시 OCR 줄/단어(`text, confidence, box, words[text, box]`) 완전 일치 여부는 **별도 열**로 표시한다. 96행 중 하나라도 선택 결과가 다르면 원인(OCR 차이 등)을 공개하고, 그 행에 걸린 비교의 해석을 보류한다.

### 6.4 run A/B 재현성

- 두 run의 `predictions.jsonl`, `ocr.jsonl`, 채점 `score.jsonl`, `summary.json`을 각각 바이트 비교한다.
- 다르면 행 단위로 불일치를 원래 분모에서 분류하고 A/B 값을 함께 보인다. 주 분석은 A로만 보고하며, 좋은 run을 고르거나 그 행의 재현된 성공을 주장하지 않는다. 재현 일치 수/분모와 효과 해석의 한계를 병기한다.

## 7. 중단 규칙

- 고정 원본 blob·트리·PNG SHA, 선택기 blob, 언어 파일, 엔진 버전, 오프라인 가드 중 하나라도 어긋나면 OCR 전에 중단(`stop.json`).
- 명단·주 집단 확인 실패, 예측 해시 불일치, ID당 정답 상자 수 불일치는 채점 중단.
- 기준 엄격 성공 수가 70이 아니면 중단하지 않고 다른 행을 명시한다.
- 실측 중 네트워크 차단 사건이 1건 이상이면 결과에 그대로 적고, 그 run의 오프라인 주장을 하지 않는다.

## 8. 시험(측정 전, RED 먼저)

JS 대상 시험(`research/test/ko-ocr-factorial.test.mjs`): 두 음절 표현(NFC/NFD, 반복 음절, 중복 제거, 라틴·문장부호 경계, 단어 경계를 넘지 않음), K1이 K0 매치를 그대로 반환(라틴 키 보존), K0 예외 전파, Q 빈 집합·양수 줄 없음 → 미매치, 동점(점수 → 신뢰도 → 줄 순서), 앵커 합집합, 창 계산이 같은 앵커에서 고정 `selectWindow`와 같음, 입력 검증(NaN·무한대·누락), 출력 검증, 반개방 포함 경계(여유 0, 전체 페이지 창 제외), 근거 all/partial/none, 두 자료 같은 ID 구분, 오류 행 분리·빈 분모, 교호 대비 부호, 언어 파일 누락·SHA 불일치 중단, 예측 파일 변조 검출.

Python 검산기 시험(`research/tools/ko-ocr-factorial/test_recount.py`): 같은 목록을 명세만으로 독립 구현해 시험한다.

## 9. 독립 검산

`research/tools/ko-ocr-factorial/recount.py`(표준 라이브러리만)가 run 폴더와 Git 객체에서 다시 계산한다.

1. `freeze.json` 해시, 명단·원본 blob 대조
2. `ocr.jsonl`의 OCR 줄에서 K0(고정 선택기 명세를 Python으로 재구현)과 K1을 다시 계산해 `predictions.jsonl`의 선택 줄·앵커·창과 대조
3. 정답 상자로 행 판정을 다시 계산해 `score.jsonl`과 대조
4. 모든 분모·집계·교호 대비를 다시 계산해 `summary.json`과 대조

## 10. 산출물·소유 경로·완료 조건

- 연구 작성자 소유(신규 파일만): `research/plans/2026-11-24-ko-ocr-factorial-protocol.md`, `research/src/ko-ocr-factorial-*.mjs`, `research/test/ko-ocr-factorial.test.mjs`, `research/tools/ko-ocr-factorial/`, `research/results/ko-ocr-factorial/`, `docs/agent/handoffs/ko-ocr-factorial.md`.
- 저장소에 언어 모델·PNG를 추가하지 않는다. 재현 안내(`README.md`)는 PR head 또는 고정 커밋 checkout에서 두 소스 fetch, 언어 파일 준비·검증, 독립 실측, 채점, 검산까지 실행되게 쓴다.
- 완료 조건: 대상 시험·Python 검산기 시험 통과, run A/B 실측과 채점, A/B 비교, 독립 검산 종료 0, 가드 차단 0(또는 그대로 보고), 연구 회귀, 저장소 npm 7단계, Opus 5.5 마일스톤 검토, Argon 최소 발췌 대조, 한국어 `RESULTS.md`, 핸드오프 갱신. 이 실험은 기존 필수 WBS 완료로 집계하지 않는다.

## 11. 등록 전에 이미 본 것(공개)

- 명단 원본(#146 replay) blob·파일 SHA 일치, 96행 전원 ok, 자료별 매치 36·미매치 12, 미매치는 ID 이름상 모두 KO/nl.
- 두 자료 PNG 96개의 원바이트 SHA-256이 모두 서로 다르다.
- 공개 npm 패키지를 내려받아 압축 해제한 두 언어 파일의 SHA-256과 크기가 §4.1 값과 같다(`kor` 패키지 sha512 `tepYhsYiRJ8E44R27MHxVteEDDLfYQxuvM6u4JlEHcCYqwpefvI5TGzoMgB67kunOvtyEJYtT5zfJ/6R6FVU9w==`, `eng` 패키지 shasum `285a3f1fb419e8e67bdee93ce288b02bb9097f0a`).
- 위 §3.1 blob·tree ID(경로 대조만, 정답 내용은 열지 않음). PM이 요청서에 적은 기준 엄격 성공 70(35+35)은 PM 확인값이며 연구 작성자는 아직 계산하지 않았다.
