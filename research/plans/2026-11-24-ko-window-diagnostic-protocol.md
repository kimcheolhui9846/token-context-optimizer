# ko-window-diagnostic: 한국어 자연어 24쪽의 선택 줄·트리거 단어·근거 창 위치 진단 (사전등록)

- 날짜 2026-11-24 · Tier E · 사용자가 승인한 #148 후속 연구. 계획 Codex(Astra), 구현 Claude.
- 성격: **회고적 진단**이다. #148의 집계 결과(`RESULTS.md`: O1K1 ko/nl 24쪽 중 두 근거 포함 4쪽, 앵커만 15, 값만 3, 없음 2, 엄격 회복 4쪽 모두 `intake`)를 알고 난 뒤 설계했다. 자료 형식을 확인하다가 `repair-slip-nl-s101-ko` 한 쪽의 저장 기록(선택 줄 index 1 = 머리글 줄, hitWords [3, 4], band)을 이미 보았다. 그 밖의 페이지별 선택 줄·트리거·창 위치 판정은 이 등록 커밋 전에 계산하지 않았다.
- 범위 밖: 새 OCR, 모델 추론, GPU, 외부 실험 API, 창의 사후 이동·확장 점수화, 제품 코드·논문·WBS 변경. 실험 비용 0원.

## 1. 원본 (고정 Git 객체)

- `research/results/ko-window-diagnostic/source-pins.json`에 #148 공개 커밋 `2ab9ed149896cc06cec387826ab99fa5bac77cda`(refs/pull/148/head)의 15개 파일 경로, Git blob id, SHA-256, 바이트 수와 #147 고정 K1 라이브러리 blob(`d882b66…`, 커밋 `c0c2f5dd…`)을 적는다.
- 모든 입력은 `git cat-file blob <commit>:<path>`로 읽고 blob id·SHA-256·바이트 수를 다시 계산해 대조한다. 작업 폴더의 파일, Draft 브랜치 이름, 다른 연구자의 작업 폴더에 의존하지 않는다. 필요한 객체는 `git fetch origin pull/148/head pull/147/head`로 받는다. #148을 이 브랜치에 병합하지 않는다.
- 실행 A(`run-a`, `score-a`)가 주 분석이다. 실행 B(`run-b`, `score-b`)는 같은 규칙으로 따로 처리해 재현만 확인한다. B는 표본 수에 더하지 않는다.

## 2. 코호트와 기존 성공 여부

- 코호트 = `design.json`에서 `lang = ko`, `anchor = nl`인 24쪽(O1 OCR, K1 키 = 조건 O1K1). 문서 종류 3 × 양식 2 각 4쪽.
- `research/results/ko-window-diagnostic/cohort.json`: `score-a/score.jsonl`의 O1K1·ko/nl 행에서 옮긴 id, 문서 종류, 양식, 기존 `strict`, `evidence`, `branch`, `state`. `strict = false` 20쪽이 일차 대상(`primary`), `strict = true` 4쪽이 대조(`control`).
- 기존 분류 검산 값(등록): 앵커만 포함 15, 값만 포함 3, 둘 다 빠짐 2, 둘 다 포함 4. `evidence` 기준 partial 18, none 2, all 4.
- 분모 검사: 설계 96쪽 id 유일, `predictions.jsonl`·`ocr.jsonl` 각 192행 = O0·O1 × 96 키 `(ocr, id)` 유일, `score.jsonl` 384행 = 4조건 × 96 키 `(cond, id)` 유일, 코호트 24 = 6조합 × 4, primary 20 + control 4.

## 3. 결합과 자료 검증

모든 위반은 **검증 실패**(종료 코드 ≠ 0, 결과 파일을 쓰지 않음)다. 해당 페이지를 빼고 분모를 줄여 결론을 내지 않는다.

1. 페이지마다 예측 행(O1, id), OCR 행(O1, id), 설계 image, render image, gold, 점수 행(O1K1, id)을 id로 결합한다. 하나라도 없거나 둘 이상이면 실패.
2. 예측 `status = ok`, `k1.status = ok`, `k1.branch = hangul`, `k1.matched = true`, 예측 width·height = 설계 page.
3. `k1.lineIndex`는 0 기반 정수이고 OCR 줄 범위 안이다. `k1.lineText`와 `k1.lineBox`가 그 줄의 text, box와 같다.
4. `k1.hitWords`는 비어 있지 않고 엄격히 증가하는 0 기반 정수이며 그 줄 단어 범위 안이다.
5. 고정 #147 K1 정의(`k1Select`, 저장된 K0 결과를 입력)로 같은 OCR 줄·질문에서 K1 결과 전체를 다시 계산해 저장값과 필드 단위로 같아야 한다. 다르면 id와 두 값을 보고하고 실패.
6. OCR 줄·단어 box는 길이 4의 유한한 수 `[x, y, w, h]`이고 `w ≥ 0`, `h ≥ 0`이다. 원본 픽셀 반열림 사각형 `[x, y, x+w, y+h)`로 바꾼다. 소수 좌표를 반올림하지 않는다.
7. 설계 `anchorItem`, `valueItem`이 items에 각각 정확히 하나 있다. 설계 item id는 페이지 안에서 유일하고 각 cell은 `l < r`, `t < b`인 정수 `[l, t, r, b)`다.
8. gold parts는 정확히 2개이고 item이 `{anchorItem, valueItem}`과 같다. 각 rect는 정수 `[l, t, r, b)`, `l < r`, `t < b`이며 `render.json`의 같은 item `ink`와 같다.
9. 저장 band는 원본 페이지 픽셀의 `left, top, width, height`다. 배율 1, 오프셋 0, 다시 반올림하지 않는다. 네 값이 유한하고 `width > 0`, `height > 0`, `left ≥ 0`, `top ≥ 0`, `left + width ≤ W`, `top + height ≤ H`이다. 양 끝은 `(L, T, R, B) = (left, top, left + width, top + height)`.
10. 이 규칙으로 계산한 포함 여부가 기존 점수 행의 `evidence`(both → all, 하나 → partial, 없음 → none)와 `strict`(both 이고 band 면적 < 페이지 면적)와 같아야 한다. `cohort.json`의 role·strict·evidence도 점수 행과 같아야 한다.
11. 등록 검산 값(2절)과 다르면 차이를 보고하고 실패.

## 4. 단어 위치 판정

- **빈 단어:** 아래 공백 문자를 모두 지운 NFC text 길이가 0인 단어. 판정에서 빼고 수만 센다. 공백 문자: U+0009–U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF.
- **중심:** `(x + w/2, y + h/2)`. 반열림 cell `[l, r) × [t, b)` 안이면 그 item의 cell에 있다. 중심이 정확히 한 cell에 있으면 그 item에 **배정**, 0개면 **미배정**, 2개 이상이면 **중복**(배정 없음).
- **양의 면적 교집합:** 두 반열림 사각형에서 `min(r) > max(l)`이고 `min(b) > max(t)`. 변이나 꼭짓점만 닿으면(0 면적) 교집합이 아니다.
- **확실한 표지 위치 단서(strict anchor cue):** 배정 item = `anchorItem`이고, 단어 상자와 앵커 ink rect가 양의 면적으로 겹친다.
- **표지 경계 증거:** 확실한 단서가 아닌 단어 중 단어 상자가 앵커 cell 또는 앵커 ink와 양의 면적으로 겹치는 것. 중복·미배정과 함께 따로 센다.

## 5. 선택 줄과 실제 트리거

- 선택 줄 = 실행 A의 `k1.lineIndex` 줄. 상호배타 분류(순서대로 적용):
  - (a) `anchorCue`: 확실한 표지 위치 단서 단어가 1개 이상.
  - (b) `otherItemOnly`: 앵커 cell과 양의 면적으로 겹치는 비어 있지 않은 단어가 없고, 앵커가 아닌 item에 배정된 단어가 1개 이상.
  - (c) `undetermined`: 그 밖.
- `lineMixed`: 줄의 배정된 서로 다른 item이 2개 이상. 줄의 배정 item id·role 목록도 남긴다.
- (a)는 위치 단서일 뿐 의미 인식 성공을 보장하지 않는다.
- 실제 트리거 = `k1.hitWords` 단어. 두 비트 `hitAnchorCue`(확실한 표지 단서 단어가 하나 이상), `hitOtherItem`(앵커가 아닌 item에 배정된 단어가 하나 이상)과 미배정·중복·표지 경계·빈 단어 수, 배정 item role을 남긴다. 트리거 출처 = 두 비트의 조합 `anchorOnly` / `otherOnly` / `both` / `neither`.
- 보조 지표(독립, 판정에 쓰지 않음): `hitTextInAnchorText` = 비어 있지 않은 트리거 단어 중 공백 제거 NFC text가 공백 제거 NFC 앵커 item text의 부분 문자열인 것이 있는가.
- 다른 줄 단서: 확실한 표지 단서 단어가 있는 모든 OCR 줄 index와 각 줄의 K1 점수(고정 정의: 줄 단어들의 한글 음절 bigram 중 질문 bigram과 겹치는 서로 다른 수)를 남긴다. 선택 줄에 단서가 없는 페이지에서 다른 줄에 단서가 있는 페이지 수를 따로 센다.

## 6. 근거 창 대조

- 앵커·값 각각 `contained = (L ≤ l) ∧ (T ≤ t) ∧ (r ≤ R) ∧ (b ≤ B)`. 네 부족 픽셀은 `left = max(0, L − l)`, `top = max(0, T − t)`, `right = max(0, r − R)`, `bottom = max(0, b − B)`. `contained`는 네 부족량이 모두 0인 것과 동치다.
- `anchorContained`, `valueContained`는 포함하면 true. 포함 상태 = `both` / `anchorOnly` / `valueOnly` / `neither`.
- 방향별 최소 확장량 = 두 대상 부족량의 방향별 최대값. 기록만 하며 창을 사후에 옮기거나 키워 점수화하지 않는다.

## 7. 결과 스키마

- `run-{a,b}/pages.jsonl`: 코호트 순서 24행. 필드 `id, doctype, layout, role, strict, evidence, containment, anchorContained, valueContained, anchorDeficit{left,top,right,bottom}, valueDeficit{…}, requiredExpansion{…}, band{left,top,width,height}, bandXyxy, anchorInk, valueInk, anchorItem, valueItem, lineIndex, lineText, lineClass, lineMixed, lineItems[{item, role}], lineWordCount, lineBlankWords, lineAnchorBoundaryWords, lineUnassignedWords, lineAmbiguousWords, hitWords, hitAnchorCue, hitOtherItem, triggerSource, hitItems[{word, item, role}], hitUnassigned, hitAmbiguous, hitAnchorBoundary, hitBlank, hitTextInAnchorText, k1Score, cueLines[{lineIndex, k1Score}], otherLineCue, words[]`. `words`는 선택 줄의 단어마다 `index, text, xyxy, blank, cellItems, assigned, anchorCellOverlap, anchorInkOverlap, strictAnchorCue, anchorBoundary`.
- `run-{a,b}/summary.json`: 입력 해시, 분모, 포함 상태 × 선택 줄 분류 교차표(primary 20 / control 4 / 전체 24), 포함 상태 × 트리거 출처, 선택 줄 분류 × 혼합 여부, 다른 줄 단서, 양식·문서 종류·6조합별 분모와 분자, 방향별 부족 페이지 수.
- `ab-compare.json`: A/B 페이지 키와 값 전부의 양방향 비교, summary 비교.
- `recount-{a,b}.json`: 독립 Python 검산 결과.
- 출력은 결정적이다(시각·경로 없음, LF, 키 순서 고정). 실행 기록은 `logs/`에 따로 둔다.

## 8. 검증

- 테스트(등록과 함께 커밋, 구현 전 RED 확인): 정답 표지와 값이 다른 줄, 표지가 있는 혼합 줄에서 다른 단어만 히트, 걸친 상자, 반열림 중심 경계(오른쪽·아래 변은 밖), 0 면적 접촉, 중심 중복, 미배정, 정확히 맞는 창·한 픽셀 부족(네 방향), band xywh ↔ xyxy 왕복, 다른 줄 단서, 빈 단어, 누락·중복 키, 잘못된 lineIndex·hitWords, 저장 K1과 재계산 불일치, 비유한 box.
- 독립 Python 검산(`research/tools/ko-window-diagnostic/recount.py`)은 JS 모듈이나 결과 집계 함수를 가져오지 않는다. Git 객체에서 원본을 직접 읽어 K1 bigram, 단어 배정, 줄 분류, 포함·부족량, 교차표를 다시 계산하고 JS 결과의 페이지 키·값 전부와 summary를 양방향 비교한다. 좌표 비교는 JS(배정밀도)와 달리 유리수(`fractions.Fraction`)로 한다. 주변합이 같아도 페이지별 분류를 바꾸면 거부함을 테스트로 보인다.
- A와 B를 따로 생성해 비교한다. 유효 자료의 불일치는 덮지 않고 영향을 적는다.
- 제품 검증은 저장소 지침의 검증 명령을 이 브랜치에서 그대로 실행한다. 알려진 main 실패가 재현되면 같은 조건의 main 결과와 따로 비교해 적는다. 제품 코드를 바꿔 보정하지 않는다.

## 9. 해석 규칙

- 기술 통계만 쓴다. 6조합 각 4쪽의 분모와 분자를 함께 적고 추론통계를 적용하지 않는다. 24쪽은 시드·템플릿·번역 짝 의존성이 있다.
- 위치 단서와 원인 판단을 구분한다. 줄 선택과 창 크기 문제는 한 페이지에서 겹칠 수 있다. `undetermined`와 중복·경계 단어 사례는 그대로 남긴다.
- 후속 후보는 관찰 빈도와 분모가 붙은 가설로만 적는다. 인과 표현은 최종 검토에서 확인한다.

## 10. 등록 뒤 변경

- 규칙을 바꾸면 이 문서에 날짜·이유·영향을 적은 별도 커밋으로 남기고, 바뀐 규칙의 결과는 등록 규칙 결과와 나란히 보고한다.
