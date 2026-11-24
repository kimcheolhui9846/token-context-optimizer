# 한국어 자연어 질문의 영역 선택 실패 진단 — 사전등록 프로토콜

- 작성 2026-11-24. Tier E. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. 브랜치 `claude/ko-anchor-diagnostic`.
- 사용자 승인 범위: #141 후속 후보 3. 기존 합성 기록의 탐색적 재분석, 로컬 실행, Draft PR까지. 새 라이브러리·언어 모델·OCR 자료·유료 호출 없음. 연구 API 비용 0원.
- **등록 커밋:** 이 문서와 전용 핸드오프만 담은 첫 커밋이다. 그 커밋과 Draft PR 이전에는 이 문서의 한글 두 음절 신호 집계(Q, O, T)를 어떤 행에도 계산하지 않았다. 계획 단계에서 확인한 것은 원본 blob 해시, 행 수, 상태·매치 개수, 치수 일치, KO/nl 대상 셀과 role, 그리고 저장된 OCR 단어에 한글 문자가 있는지 여부뿐이다(§9에 그대로 적는다).
- 제품 코드, 현재 8쪽 논문, WBS, 기존 실험 파일은 읽기 전용이다.

## 1. 역할

| 주체 | 역할 |
|---|---|
| 사용자 | 후속 후보 3 승인, merge·Ready 승인 |
| Codex Astra (PM) | 요청서와 세부 규칙 확정, blob·스키마 사전 대조, 최종 판정 |
| Claude Code Opus 5.5 (연구 작성자) | 이 문서, 분석 코드, 연구 시험, 축약 행·집계, 한국어 결과, 핸드오프, Draft PR |
| 독립 Python 검산 작성자 | 연구 작성자와 다른 하위 에이전트. 이 문서 §4–§7 명세만 받아 별도 검산기를 쓴다. JS 코드를 보지 않는다 |
| harness-opus-review (claude-opus-5-5) | 계획 검토(완료: 최초 CHANGES REQUIRED → 수정안 PASS WITH NOTES), 구현 마일스톤 독립 검토 |
| Argon (gemini-4-argon, BAZE) | 지정 발췌(자료별 사전순 첫 KO/nl ID 1개와 공개 집계) 교차 확인 |

## 2. 질문

#140(R09)과 #145(FCP)에서 한국어 자연어(KO/nl) 질문 12개씩이 모두 미매치였다. 그 실패에서 **대상 표지의 한글 신호가 어디에 남았는가**를 확인한다.

1. 연구 선택기 `selectWindow`의 질문 키에 한글 신호가 남는가
2. 저장된 영어 OCR 출력의 단어 텍스트에, 질문과 대상 표지가 공유하는 한글 두 음절 조합이 남는가. 남았다면 대상 셀 안인가, 밖인가

이 진단은 문자열 진단이다. 제품 매칭 규칙 후보의 성능, 한국어 OCR 정확도, 실제 선택 복구율, 토큰·비용을 측정하지 않는다.

## 3. 자료와 고정 원본

### 3.1 원본 blob

| 자료 | 파일 | 고정 커밋의 경로 | blob |
|---|---|---|---|
| R09 | 질문 | `0fb3053…:research/results/r09-bilingual/heldout/questions.json` | `605ff760cc1c12de0a0d21076ac0b8eecb79032a` |
| R09 | run A OCR 원시 | `0fb3053…:research/results/r09-bilingual/heldout/run-a/raw.jsonl` | `876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318` |
| R09 | 설계 | `0fb3053…:research/results/r09-bilingual/heldout/design.json` | `dc3307818cba423b3fc2eade8ed7f2116593f788` |
| FCP | 질문 | `708d994…:research/results/fresh-crop-padding/frozen/selector-input/questions.json` | `ae578b7267ff124ecf4a0a5157f7067925b177ca` |
| FCP | run A caller | `708d994…:research/results/fresh-crop-padding/run-a/caller.jsonl` | `d657d59d7124f68743a1e54a7eb7c62f521dbc21` |
| FCP | 설계 | `708d994…:research/results/fresh-crop-padding/frozen/oracle/design.json` | `3149501a51bebbc79d77b7021a61241d32950ba5` |

참조 코드 blob(대조만, 실행하지 않음): 선택기 `research/src/selector.mjs` `b3b4965b2d330907c0143fe178013aace1be8372`(두 커밋 모두 동일), R09 실행기 `research/src/r09-run.mjs` `b3266f3680248a430d30124b58023bc1bdb27c35`, FCP 수집기 `research/src/fcp-collect.mjs` `d1bb8ef3bffd6a4aeef2f9962d176e03668161df`, 렌더러 `research/tools/r09/render.py` `b61cd9b37803d8eb4b6b126a75301570c14ab11d`.

- FCP 커밋 `708d9946ae091180a1b716baadfdd73fcfe5a19b`는 Draft #145의 head다. 병합하거나 그 위에 쌓지 않고 Git 객체로만 읽는다.
- 클린 클론에서 얻는 법: `git fetch origin pull/145/head` → `git cat-file -t 708d9946ae091180a1b716baadfdd73fcfe5a19b`가 `commit` → `git rev-parse 708d9946…:<경로>`가 위 blob과 같음을 확인. 분석기는 `git cat-file blob <blob>`으로 바이트를 읽고, 같은 바이트가 고정 커밋의 경로에서 나오는지(`git rev-parse <commit>:<path>`)를 함께 확인한다.
- run A만 쓴다. R09 run B, FCP run B와 p0/p4 제품 반환 로그는 재생·진단에서 제외한다. FCP는 여백 적용 전 `caller.jsonl`이다. #141은 같은 R09의 후속 보기이므로 별도 모집단으로 더하지 않는다.
- 측정 중 네트워크 접근은 없다. 분석 실행은 `NODE_OPTIONS=--require=<research/tools/d03/guard/node-netguard.cjs>`가 없으면 거부한다.

### 3.2 모집단과 분모

- 자료마다 48장 = 24쌍(en/ko) = 언어 2 × 앵커 2(`code`, `nl`) × 12장. 두 자료 합계 96장.
- 키는 (자료, ID)다. 같은 ID가 두 자료에 있어도 다른 행이다.
- **기준 재생 분모:** 96장 전체. **주 진단 분모:** 자료별 KO/nl 12장, 합계 24장. 나머지 72장은 기준 재생의 대조 자료이며 한글 진단 분모에 넣지 않는다.
- run A/B, p0/p4를 추가 표본으로 세지 않는다.

## 4. 검증 단계(측정 전 중단 규칙)

### 4.1 원본 검증

다음 중 하나라도 어긋나면 원래 분모와 불일치 내역만 보고하고 주 진단과 해석을 멈춘다. 누락 행으로 계속하지 않는다.

1. 여섯 blob 바이트가 §3.1 blob ID와 같고, 고정 커밋의 경로가 그 blob을 가리킨다.
2. 자료별 질문 48개, OCR 행 48개, 설계 이미지 48개, 쌍 24개. ID는 자료 안에서 고유하고 세 파일의 ID 집합과 순서(질문 = OCR 행)가 같다.
3. 쌍마다 en/ko 한 장씩. 언어×앵커 칸마다 12장.
4. 질문 파일의 질문 문자열과 설계의 `question`이 ID별로 정확히 같다.
5. 각 OCR 행의 `width`·`height`가 설계 `page`와 정확히 같다.
6. 각 설계 이미지에서 `id == anchorItem`인 항목이 정확히 하나이고, 그 `cell`이 정수 네 개 `[left, top, right, bottom]`이며 `0 ≤ left < right ≤ W`, `0 ≤ top < bottom ≤ H`다.
7. 주 집단(KO/nl) 대상 항목의 `role`이 `label`이다.
8. OCR 행의 `status`가 `ok`면 `ocrLines` 배열이 있고 각 단어에 문자열 `text`와 유한수 네 개 `box`가 있다.

`items[].cell`은 원본 렌더 캔버스 픽셀의 반개방 사각형 `[left, top, right, bottom)`이다. 치수 불일치·비정상 셀·앵커 대응이 1개가 아님·주 집단 role 불일치를 발견하면 임의 좌표 변환 없이 중단한다.

### 4.2 기준 재생(96장)

- 수정 없는 `research/src/selector.mjs`(blob 확인)를 import해 실제 `selectWindow(ocrLines, question, width, height)`를 부른다. 입력은 질문, 저장된 OCR 줄 원본 그대로, 원본 치수뿐이다. OCR 초기화·재측정은 하지 않는다.
- 비교 필드: `keys`(순서 포함), `matched`, `score`, `lineText`, `confidence`, `axisRow`, `band`. 저장 기록에 없는 값(`null`)은 선택기 반환의 `undefined`와 같다고 본다(R09 실행기와 FCP 수집기가 `?? null`로 저장했기 때문). R09는 추가로 `matchedLine.text`가 재생 `lineText`와 같은지 본다.
- 상태 구분: 저장 `status != ok` → 기술 오류(재생하지 않음, 그대로 보존), `matched: false` → 미매치, 미매치 행의 `score 0`과 `null` 필드 → 비적용. 선택기 예외는 재생 기술 오류로 세고 불일치로 처리한다.
- 96장 중 하나라도 어긋나면 진단 통과를 주장하지 않고 차이를 보고한다.
- 알려진 기준 수치(R09·FCP 각각 KO/nl 미매치 12/12)는 재현 확인에만 쓴다.

## 5. 한글 두 음절 표현(고정)

문자열 하나에 대해 다음을 한다.

1. NFC 정규화
2. 연속된 현대 한글 음절 `[가-힣]+` 구간을 찾는다. 공백, 문장부호, 다른 문자, 문자열 경계(= OCR 단어 경계)를 넘지 않는다.
3. 각 구간 안에서 겹치는 인접 두 음절 조합을 모두 만든다. 같은 음절 반복(예: `하하`)도 조합이다.
4. 중복을 제거한 집합.

불용어·조사 목록, 유사도 임곗값, 사후 선택은 없다. 이 표현은 질문 Q, OCR 단어 각각의 O, 대상 표지 T, 설계 텍스트 셀 각각에 똑같이 적용한다. 한 음절뿐인 문자열의 집합은 빈 집합이다.

## 6. 블라인드 수집과 채점

### 6.1 수집(블라인드)

- 수집기 입력 허용 필드: 자료, ID, 질문, 치수(`width`, `height`), 상태, OCR 줄 텍스트, 단어 `text`와 `box`. 이 밖의 필드(기존 `keys`, `matched`, `band`, `score`, 정답, 설계·대상 레코드, 도안)가 들어오면 수집기가 예외를 낸다.
- 출력(행별): Q(정렬된 목록), 전체 OCR 단어 수, 한글 음절을 가진 단어 수, O가 빈 집합이 아닌 단어마다 (줄 번호, 단어 번호, O 정렬 목록, 원본 box, 중심), 입력 투영의 SHA-256.
- 단어 중심은 저장된 원본 픽셀 `box=[x, y, width, height]`에서 `(x + width/2, y + height/2)`다. 저장값은 이미 고정 선택기가 `s = min(4, 4096/max(W,H))`로 나눈 원본 좌표이므로 재확대·크롭 이동·반올림을 하지 않는다.
- 저장 텍스트 전체를 복제하지 않는다. 재계산 가능한 blob과 축약 행·개수·해시만 남긴다.
- 수집 결과와 기준 재생 결과의 SHA-256을 파일에 고정한 뒤 채점한다. 과거 매치·영역은 기준 재생 단계에서만 읽는다.

### 6.2 채점(주 집단 24장)

채점기만 설계의 대상 항목(`anchorItem`) 텍스트·셀·role과 다른 텍스트 셀을 읽는다.

- T = 대상 표지 텍스트의 집합, S = Q ∩ T(질문에 있는 대상 신호).
- 대상 셀 적중: O ∩ S ≠ ∅인 단어의 중심 `(cx, cy)`가 `left ≤ cx < right`, `top ≤ cy < bottom`.
- 행별 주 분류(상호 배타, 위에서부터 첫 해당):
  1. `technical_error`: 저장 OCR 행 `status != ok`, 또는 수집·채점 중 예외
  2. `not_applicable`: T = ∅(대상 표지가 두 음절 조합을 만들지 못함, 예: 한 음절 표지)
  3. `no_question_signal`: T ≠ ∅이고 S = ∅
  4. `absent`: S ≠ ∅이고 어떤 OCR 단어도 S의 항목을 갖지 않음
  5. `outside_only`: S의 항목을 가진 단어가 대상 셀 밖에만 있음
  6. `inside`: 대상 셀 안 단어가 S의 항목을 가짐. 부가 표시 `alsoOutside`
- 별도 열(주 분류에 넣지 않음): 범용 질문 표현 = (Q − T) ∩ (페이지 OCR 단어 O의 합집합)의 크기, 기준 재생 키 수와 매치 여부.
- 여러 단계에서 동시에 결함이 생길 수 있으므로 분류 비율을 합산하거나 인과 기여도로 해석하지 않는다.

### 6.3 원문 대조(특권 정보, 채점 시에만)

실제 페이지 OCR을 대신할 수 없는 참고치다. 한국어 OCR 정확도·실제 선택 복구로 표기하지 않는다.

- **양성 대조:** 같은 도안의 텍스트 항목마다 원문을 공백으로 나눈 단어를 만들고 box를 그 항목의 셀 `[left, top, right-left, bottom-top]`로 둔 "정상 렌더 원문 OCR"을 같은 수집·채점 경로에 넣는다. 질문의 대상 신호가 정상 원문에서 대상 셀 안에 검출되는지(`inside`) 본다.
- **겹침:** 대상 셀 외 텍스트 셀 중 S와 겹치는 셀 수, (Q − T)와 겹치는 셀 수.
- 한글 OCR 신호가 0건이어도, §7 손계산 양성 시험과 원문 양성 대조가 정상 동작한 뒤에만 해석한다.

## 7. 시험(측정 전 통과)

hand-built 시험: 빈 키, 비한글 OCR, 한 음절 표지(`not_applicable`), 분해형(NFD) 입력의 NFC 일치, 반개방 경계(오른쪽·아래 경계 = 밖, 왼쪽·위 경계 = 안), 대상 밖 단독·안팎 동시 적중, 같은 음절 반복, 단어 경계를 넘지 않음, 선택기 예외의 기술 오류 처리, 원문 대조의 `inside`, 수집기 허용되지 않은 필드 주입 거부, 원본 바이트 변조 검출, 축약 결과·집계 변조 검출. 손계산 양성 시험: 대상 셀 안에 한글 단어를 넣은 OCR 줄이 `inside`로 감지된다.

## 8. 보고

- 두 자료를 각각 표로 보고한 뒤 합계를 적는다. 모든 분모를 유지하고 결측·평가 불가를 분리한다. 진단 적용 건수와 전체 건수를 함께 적는다.
- 전체 96장 기준 재생과 주 집단 24장 한글 진단을 섞지 않는다.
- 결론은 영어 OCR 기록과 합성 템플릿의 관측에 한정한다.
- 후속 후보 좁히기(미리 고정): 대상 한글 신호가 OCR에 없으면(`absent`) 한국어 OCR과 질문 키 보존을 함께 평가해야 한다. 신호가 대상 셀에 있는데 기준 키만 비면(`inside` + 키 0개) 질문 처리 단독 효과를 별도 실험할 수 있다. 어느 경우든 미실행 방법의 복구율이나 제품 성능을 제시하지 않는다.

## 9. 계획 단계에서 이미 본 것(공개)

PM 사전 대조와 연구 작성자의 착수 확인에서 다음을 보았다. 이 값들은 한글 두 음절 집계가 아니다.

- 두 자료 모두 run A 상태 `ok` 48/48, 매치 36, 미매치 12. KO/nl 12장의 저장 `keys`는 모두 빈 배열이다.
- 두 자료 모두 저장 OCR 단어(R09 2,783개, FCP 2,765개)에 한글 문자(음절·자모)가 있는 단어는 0개였다. 영어 OCR(`eng.traineddata`) 기록이므로 예상된 관측이며, §6.3 양성 대조와 §7 손계산 시험을 통과한 뒤에만 해석한다.
- 두 자료 모두 OCR 치수와 설계 `page`가 48/48 일치, KO/nl 대상 셀은 12/12가 role `label`.

## 10. 산출물과 재현

- 코드: `research/src/ko-anchor-diagnostic-lib.mjs`, `research/src/ko-anchor-diagnostic.mjs`
- 시험: `research/test/ko-anchor-diagnostic.test.mjs`
- 독립 검산: `research/tools/ko-anchor-diagnostic/recount.py`(+ 변조 검출 시험)
- 결과: `research/results/ko-anchor-diagnostic/`(축약 행, 집계, 해시, 한국어 `RESULTS.md`, 재현 안내 `README.md`)
- 결정성: 존재하지 않는 새 출력 폴더 두 곳에 실행해 바이트가 같아야 한다.
- 검증: 대상 시험, 연구 전체 시험, 저장소 npm 7단계, 독립 Python 검산, harness-opus-review 마일스톤 검토, Argon 지정 발췌 대조. 코드·수치·규칙이 바뀌는 수정은 다시 검증한다.
