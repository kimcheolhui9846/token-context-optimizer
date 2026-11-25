# 독립 검산 명세 — ko-header-column (OCR 열 머리글-필드 연결 W4)

제3자가 이 문서, 고정 선택기 `research/src/selector.mjs`, #152 검산 명세(`6865828:research/tools/ko-row-gate/RECOUNT_SPEC.md`, K0·K1·W1·W2·W3의 정의), 손계산 예제 `example/example.json`, 아래 원자료만으로 검산기를 쓸 수 있도록 적은 공개 명세다. 연구 JS 코드(`research/src/ko-header-column-*.mjs`)를 읽지 않아도 된다. 검산기는 JS 함수를 가져오지 않고 독자적으로 계산한다. 이 문서가 W4 규칙, 결과 스키마(예측·채점·집계·공개 표), 판정의 정의다.

## 0. 산출물과 실행

- `research/tools/ko-header-column/recount.py` — Python 3.12 **표준 라이브러리만**.
  `python recount.py --data <data dir> --ocr <ocr dir> --replay <replay dir> --score <score dir> [--results <RESULTS.md>] --out <recount.json>`
  모든 검사를 통과하면 종료 0, 하나라도 어긋나면 종료 1, 입력이 손상돼 계산을 시작할 수 없으면 종료 2. `--mutate <mutation.json>`은 9절 변조 점검이다.
- `research/tools/ko-header-column/test_recount.py` — `unittest`. 손계산 예제(11절) 전체를 시험한다.
- 모듈 함수(시험이 부른다): `squash`, `fold`, `question_types`, `parse_question(q)`, `w3_rule(question, lines_exact, k1, r)`, `w4_rule(question, lines_exact, k1, r, w3)`, `exposure(ink, band)`, `attribute(boxes, page)`, `header_class(item, page)`, `candidate_class(item, page)`, `score_page(pred, page)`, `summarize_scores(rows, page_area)`, `render_tables(summary)`, `check_tables(markdown, summary)`, `pp_text(fraction)`, `check_id_set(rows, ids)`, `diff_rows(a, b)`, `dec_str(x)`, 예외 `ValidationError`.

## 1. 입력

- `<data dir>`: `manifest.json`, `selector/questions.json`(`questions: [{id, file, question}]`, ID 순서), `selector/images/p###.png`, `scoring/design.json`, `scoring/gold.json`, `scoring/render.json`, `scoring/render-check.json`, `checks.json`.
- `design.json["images"]` 행(생성 순서 = serial): `key, source, kind, content, side ("L"|"R"), header ("normal"|"blank"|"dup"), ans ("same"|"below"), cellName ("<side>-<header>-<ans>"), page {width, height}, slot, slotPosition, qtype, records [{slot, position, labelItem, targetValueItem, targetAuxItem, compValueItem, compAuxItem, noteItem, block, lineA, lineB}], question, answer, label, field, compField, targetColumn, compColumn, headerCells, headerTexts {target, comp}, targetHeaderItem ("h-target"|null), compHeaderItem ("h-comp"), anchorItem, valueItem, compValueItem, goldItems, otherValueItems, items [{id, role, record?, text, cell, size}], rules, serial, id, file`. 역할: `title, header, label, target_value, aux, comp_value, note`.
- **ID 순서:** 예측·OCR·채점 행은 `selector/questions.json` 순서(= 불투명 ID `p000`…`p143` 오름차순)다. `design.json["images"]`는 serial 순서이므로 ID로 결합한다.
- `<ocr dir>`: `freeze.json`, `ocr.jsonl`, `k1.jsonl`(각 144행, ID 순서). 행 형식은 #152와 같다.
- `<replay dir>`: `freeze.json`, `predictions.jsonl` 144행, `inputs.json`. `<score dir>`: `score.jsonl` 144행, `summary.json`.
- JSONL은 LF, 마지막 줄 바꿈 하나. CR이나 빈 줄이 있으면 손상(종료 2).
- **두 번 읽기.** OCR 파일은 보통 JSON 수(K1·W1·W2용)와 **원래 JSON 수 표기 문자열**(W3·W4용)로 각각 읽는다.

## 2. 검사 1 — 해시, ID, 자료, 짝

1. `manifest.json`의 모든 파일이 있고 SHA-256·크기가 같으며 목록 밖 파일이 없다. 두 `freeze.json`의 해시 = 원바이트 SHA-256.
2. **ID 집합:** `questions.json`, `ocr.jsonl`, `k1.jsonl`, `predictions.jsonl`, `score.jsonl`이 같은 144개 ID, 중복 없음, 같은 순서. `design.json` ID 집합이 같고 불투명 ID 대응이 `registered/design.json`과 같다.
3. 골드: `parts` 정확히 2개(`anchorItem`, `valueItem`), 정수 반열림 `rect`, `render.json` 잉크와 같음, 각 셀 안.
4. PNG 직접 해독(zlib, 8비트 그레이스케일, 비인터레이스). 1280 × 960. `ocr.jsonl`의 `pngSha256`·크기가 PNG와 같다. 골드 두 상자와 `otherValueItems`·`compValueItem`·두 값 열 머리글 잉크 상자의 네 가장자리 줄마다 값 < 255인 픽셀이 있다. blank 쪽의 `headerCells.target` 셀 안에는 값 < 255인 픽셀이 없다(텍스트가 없음).
5. **짝 대응:** 원본마다 정확히 12쪽(side × header × ans). 같은 질문·정답·`qtype`·`slot`·`anchorItem`·`valueItem`·`compValueItem`·`otherValueItems`, 같은 레코드 항목 id·역할·텍스트·잉크 높이. 기록명 열·비고 항목의 잉크 x는 12쪽에서 같다. 값 열 항목의 잉크 x는 같은 side끼리 같고 L↔R에서 정확히 ±260px 다르다. `tval`·`taux`의 잉크 y만 ans에 따라 줄 A/B가 바뀐다. 머리글: normal = {h-label, h-target(질문 필드), h-comp(경쟁 필드)}, blank = {h-label, h-comp(경쟁 필드)}, dup = {h-label, h-target, h-comp}이고 두 텍스트가 질문 필드. 정규화 질문 12개가 각 12회.
6. **유형·파서 검산:** 12개 질문의 `question_types`가 각각 설계 유형 하나, `parse_question`이 (목표 표지, 질문 필드, 유형)을 돌려준다. 값 6개가 유형 문법을 만족하고 서로 다르며, 그 밖의 항목은 어떤 문법도 만족하지 않고 머리글 외 항목에 `시각`·`인원`·`분량`이 없다.

## 3. 검사 2 — K1 재계산, W0·W1·W2·W3 (고정 정의)

- **K0/K1, W0, W1, W2**는 #152 명세 3절과 같다(고정 #147·#150·#151 정의).
- **W3**는 #152 명세 4절과 같다(고정 #152 `w3Rule`). `qtypes`, `validHits`, `scan = {count, units: [{line, first, last, text, boxes, union, support}]}`, `w3Reason`, `w3From`, `w3`, `w3CutPixels`.
- 예측 행의 #152 필드(`id, pngSha256, ocrSha256, width, height, state, error, branch, lineIndex, hitWords, reason, w0, w1, candidates, maxRight, clippedRight, addedPixels, w2Reason, hitTop, hitBottom, pad, w2, cutPixels, qtypes, validHits, scan, w3Reason, w3From, w3, w3CutPixels`)는 고정 #152 `buildPrediction`의 출력 그대로다. 검산기는 이를 원시 OCR에서 다시 계산해 같아야 한다.

## 4. W4 규칙 (등록 규칙, 프로토콜 4.2)

입력: 질문 `q`, OCR `lines`(정확 표기), K1 기록 `k1`, 고정 W2 결과 `r = {reason, w1, w2, w2Reason}`, 고정 W3 결과 `w3 = {qtypes, validHits, scan, …}`. W4는 언제나 `null`, W1, W2 중 하나와 값이 같다.

### 4.0 정확한 수와 단어

- 수 비교는 #152 명세 4.0절과 같이 OCR 상자의 원래 JSON 수 표기를 정확한 유리수로 해석한다. 단어 상자 `[x, y, w, h]` → `x0 = x`, `y0 = y`, `x1 = x + w`, `y1 = y + h`(정확한 합), 높이 `h`. 출력 표기 `dec_str`도 같다.
- **유효 단어:** `box`가 길이 4의 배열, 네 값이 모두 JSON 수, `w > 0`, `h > 0`이고 `text`가 문자열이며 `squash(text) != ""`.

### 4.1 질문 파싱

- `fold(s)` = NFKC 뒤 Unicode White_Space 코드포인트(#152 명세 4.1절 목록)의 연속을 U+0020 하나로 바꾸고 양끝 U+0020을 지운다.
- `parse_question(q)`: `f = fold(q)`. `f`에 부분 문자열 `"의 "`가 정확히 1번이고, `f` 전체가 `^(?P<record>.+)의 (?P<field>[가-힣]+(?: [가-힣]+)* ?(?P<suffix>시각|인원|분량))(?P<josa>은|는) 몇 (?P<unit>시|명|쪽)인가요\?$`에 맞고(`[가-힣]` = U+AC00–U+D7A3), 끝말·단위 유형이 같을 때(시각–시 → `time`, 인원–명 → `count`, 분량–쪽 → `pages`) `{record, field, qtype}`, 아니면 `null`. `field`는 정규식이 잡은 문자열 그대로(공백 포함).

### 4.2 판정 순서 (첫 해당 사유가 배타적인 `w4Reason`)

1. `r.reason == "error"` → `"error"`, `r.reason == "unmatched"` → `"unmatched"`. `w4 = null`, `w4From = null`, `w4CutPixels = null`.
2. `r.w2Reason != "cut"` → `"not_applicable"`.
3. `w3.qtypes` 길이 0 → `"qtype_none"`, 2 이상 → `"qtype_multiple"`.
4. `w3.validHits`가 빈 배열 → `"no_valid_hit_word"`. (`null`은 한글 분기가 아닌 쪽이며 그 쪽은 2단계에서 이미 끝난다. 그 밖에 `null`이면 `ValidationError`.)
5. `parse_question(q) == null` → `"question_unparsed"`. 파싱 유형 ≠ `w3.qtypes[0]` → `"question_type_mismatch"`.
6. 머리글 탐지(4.3절): 자격 줄 0개 → `"header_none"`, 2개 이상 → `"header_multiple"`. 1개: 뒤 두 그룹 텍스트를 `squash(field)`와 비교해 둘 다 같음 → `"header_duplicate"`, 둘 다 다름 → `"header_no_match"`.
7. 열 배정(4.4절): 목표 배정 0개 → `"no_target_candidate"`, 2개 이상 → `"multiple_target_candidates"`, 1개이고 그 단위의 `union`이 W2 밖 → `"target_outside_w2"`.
8. 목표 배정 1개이고 `union ⊆ W2` → `"applied"`, `w4 = w2`, `w4From = "w2"`.
- 2–7단계 → `w4 = w1`, `w4From = "w1"`. `w4CutPixels = (w1.height − w4.height)·w1.width`.
- 사후 단언(어기면 `ValidationError`): `w4 ∈ {w1, w2}`(값), `w2 ⊆ w4 ⊆ w1`, `applied ⇔ w4 = w2`(사유 기준).
- **포함 `union ⊆ W2`:** #152 명세 4.3절의 C ⊆ W2와 같다(`w2.left ≤ x0`, `w2.top ≤ y0`, `x1 ≤ w2.left + w2.width`, `y1 ≤ w2.top + w2.height`, 등호 포함).

### 4.3 머리글 줄 탐지

- **기준 y** `A` = `k1.lineIndex` 줄에서 `w3.validHits`의 각 단어 상자 `y0`의 최솟값(정확한 값).
- 줄 `i`(OCR 순서)마다 다음을 차례로 보고 첫 실패를 `why`로 남긴다: `i == k1.lineIndex` → `"k1_line"`; 단어 0개 → `"no_words"`; 무효 단어(4.0절)가 하나라도 있음 → `"invalid_word"`; 어떤 단어의 `y1 > A` → `"below_anchor"`; 그 밖 `"eligible"`. 줄을 합치지 않는다.
- **그룹화(eligible 줄):** 단어를 (`x0`, `x1`, 원래 인덱스) 오름차순으로 정렬한다. 정렬된 이웃 `p`, `n`(직전 단어와 다음 단어)마다 `gap = x0(n) − x1(p)`. `gap > 2·max(h(p), h(n))`일 때만 새 그룹을 시작한다(정확히 2배는 같은 그룹, 음수 간격은 분할하지 않음, 그룹 누적 폭은 쓰지 않음). 그룹 = `{words: [원래 인덱스 …(정렬 순서)], text: squash 텍스트를 정렬 순서로 이은 것, box: [min x0, min y0, max x1, max y1](dec_str)}`.
- **자격:** 그룹이 정확히 3개(아니면 `"group_count"`), 첫 그룹 텍스트가 `^[가-힣]+$`(아니면 `"first_not_hangul"`), 둘째·셋째 그룹 텍스트가 각각 `^[가-힣]+<끝말>$`(끝말 = 파싱 유형의 `시각`/`인원`/`분량`; 아니면 `"value_group_suffix"`), 세 그룹 상자 모든 쌍에서 `min(x1a, x1b) − max(x0a, x0b) ≤ 0`(아니면 `"x_overlap"`). 검사 순서는 이대로이고 첫 실패를 `failure`로 남긴다.
- 자격 줄 목록 `qualified` = 자격 있는 줄 번호 오름차순. 정확히 1개일 때 `match = [g1.text == squash(field), g2.text == squash(field)]`. 정확히 하나 참이면 그 그룹 번호가 `target`(1 또는 2), 다른 것이 `comp`.

### 4.4 열 배정

- 머리글이 선택된 쪽(4.3절에서 target이 정해짐)에서, `w3.scan.units`의 각 단위 `k`(순서 그대로, 0부터)에 대해 `x0 = union[0]`, `dT = |x0 − T.x0|`, `dC = |x0 − C.x0|`, `hT = T.y1 − T.y0`, `hC = C.y1 − C.y0`(T·C = 목표·경쟁 그룹 상자).
  - `dT < dC`: `dT ≤ hT`이면 `column = "target"`, `why = "nearest"`; 아니면 `column = null`, `why = "too_far"`.
  - `dC < dT`: `dC ≤ hC`이면 `"comp"`, `"nearest"`; 아니면 `null`, `"too_far"`.
  - `dT == dC`: `null`, `"tie"`.
- `counts = {target, comp, unassigned}`. 목표 배정이 정확히 1개면 `chosen` = 그 단위 번호.
- `w3.scan`이 `null`인데 머리글이 선택되면 `ValidationError`(고정 W3는 2–4단계를 통과한 쪽에서 항상 `scan`을 낸다).

### 4.5 예측 행의 W4 필드 (#152 필드 뒤, 이 순서)

`w4Reason, w4From, w4, w4CutPixels, w4Diag`.

- `w4Diag`(오류·미매치면 `null`) = `{question, anchorY, lines, qualified, header, assign, counts, chosen}`. 진단은 판정 순서와 무관하게 입력이 허락하는 데까지 채운다.
  - `question` = `parse_question(q)` 또는 `null`.
  - `anchorY` = `dec_str(A)`(`validHits`가 비지 않은 배열일 때), 아니면 `null`.
  - `lines` = (`anchorY`와 `question`이 모두 있을 때) 줄마다 `{line, why, groups, failure}`(`why ≠ "eligible"`이면 `groups = null`, `failure = null`; eligible이면 그룹 목록과 자격 실패 이유 또는 `null`), 아니면 `null`. 그룹의 단어는 `words`(원래 인덱스)와 `boxes`(원래 표기 4개)를 함께 담는다.
  - `qualified` = 자격 줄 번호 목록 또는 `null`(`lines`가 `null`).
  - `header` = 자격 줄이 정확히 1개일 때 `{line, match, target, comp}`(`target`·`comp`는 정확히 하나 일치일 때만 그룹 번호, 아니면 `null`), 아니면 `null`.
  - `assign` = 4.4절 단위 목록 `[{unit, line, first, last, x0, dTarget, dComp, column, why}]`(수는 `dec_str`), `header.target`이 있고 `scan`이 있을 때, 아니면 `null`. `counts`, `chosen`도 같은 조건(`chosen`은 목표 배정 1개일 때만).

## 5. 검사 3 — 예측 검증과 행 판정 (score.jsonl)

### 5.1 `validate_prediction(pred)`

- #152 명세 5.1절 조건 전부(W1·W2·W3 부분) + W4: 매치 쪽 `w4`가 페이지 안의 양의 정수 창, `w4Reason`이 4.2절 2–8단계 사유 중 하나, `w2Reason != "cut"` ⇔ `not_applicable`, `applied` ⇔ `w4From "w2"` ∧ `w4 == w2`, 그 밖 `w4From "w1"` ∧ `w4 == w1`, `w4CutPixels == (w1.height − w4.height)·w1.width`, `applied`이면 `w4Diag.counts.target == 1`·`chosen`의 `union ⊆ w2`, `target_outside_w2`이면 `counts.target == 1`·`union ⊄ w2`, `no_target_candidate`/`multiple_target_candidates`이면 `counts.target` 0/≥2, `header_*` 사유와 `qualified`·`header.match`의 일치. 오류·미매치: `w4 = w4From = w4CutPixels = w4Diag = null`, `w4Reason` = state.

### 5.2 노출 `exposure(ink, band)`

#152와 같다: 원래 잉크 상자(렌더러 `getbbox` 반열림)가 창에 완전 포함 → `"full"`, 아니고 양의 면적 교집합 → `"partial"`, 그 밖(맞닿음 포함) → `"none"`, 창 `null` → `null`. 항목이 없으면(공란 머리글) `"source_missing"`.

### 5.3 gold 귀속 (채점 측만, 예측 동결 뒤)

- `attribute(boxes, page)`: 단어 상자마다 중심(정확한 `x + w/2`, `y + h/2`)을 담는 렌더 텍스트 항목 셀(반열림 `[c0, c1, c2, c3)`, 왼쪽·위 포함, 오른쪽·아래 제외)이 정확히 하나면 그 항목. 모든 단어가 같은 항목 하나이고, 단어들의 외접 상자와 그 항목 잉크의 교집합 면적이 양수일 때만 그 항목 id, 아니면 `null`.
- `header_class(item, page)`: `item == targetHeaderItem`(not null) → `"target_header"`, `== compHeaderItem` → `"comp_header"`, 다른 항목 → `"other_item"`, `null` → `"undetermined"`.
- `candidate_class(item, page)`: `valueItem` → `"target_value"`, `compValueItem` → `"comp_value"`, `otherValueItems` → `"other_record_value"`, 다른 레코드의 `compValueItem` → `"other_record_comp"`, 다른 항목 → `"other_item"`, `null` → `"undetermined"`.
- 적용 쪽(`w4Reason == "applied"`)마다: 머리글 = 선택 줄의 `target` 그룹 단어 상자들, 후보 = `chosen` 단위의 `boxes`. `attribution = {header: {item, class}, candidate: {item, class}, outcome}`. `outcome`: 머리글 `target_header` ∧ 후보 `target_value` → `"correct"`; 어느 쪽이든 확정 분류가 목표가 아님(`undetermined` 외의 다른 분류) → `"wrong"`; 그 밖 → `"undetermined"`. 적용 쪽이 아니면 `attribution = null`.

### 5.4 행

- 창 판정 W1/W2/W3/W4 각각 #152 명세 5.4절(고정 #147 `scoreKey`): `{state, strict, evidence, fullPage, area}`.
- `stage`: `"error"`/`"unmatched"`/`"hangul"`/`"k0"`.
- 전이 `t12, t13, t14`(W1 → Wk), `t34`(W3 → W4): `keptSuccess`/`recovered`/`lost`/`bothFail`. `t12`·`t13`·`t14`의 `recovered`는 W1이 전체 페이지이고 비교 창이 부분 창일 때만 허용(그 밖 `ValidationError`). `t34`에는 이 예외가 없다.
- `lostParts2/3/4`: #152와 같다. `prevented34 = (t13 == "lost" ∧ t14 != "lost")`.
- `others`: #152와 같은 구조에 `w4`, `fromW1Full4` 추가.
- **공통 기회** `opportunity` = 매치 ∧ `w1.strict` ∧ `w2Reason == "cut"` ∧ `others.w1.full ≥ 1`. `eventK` = `opportunity ∧ wK.strict ∧ fromW1FullK.none ≥ 1`(K = 2, 3, 4).
- `exposure`(매치 쪽, 그 밖 `null`) = 창 `w1`–`w4` 각각 `{targetHeader, compHeader, compValue, targetValue}`.
- `reading`(매치 ∧ `header == "normal"`, 그 밖 `null`) = `{e1: {w1, w2, w3, w4}, e2: {…}, headerLost: {w2, w3, w4}}`. `e1_k = (targetHeader_k == "none" ∧ compValue_k == "full")`, `e2_k = (targetHeader_k ∈ {partial, none} ∧ compValue_k ∈ {partial, full})`, `headerLost_k = (targetHeader_w1 == "full" ∧ targetHeader_k == "none" ∧ compValue_k == "full")`.
- `textIdentifiable = (header == "normal")`.
- `score.jsonl` 행 필드(이 순서): `id, key, source, kind, content, side, header, ans, cell, qtype, slot, stage, reason, w2Reason, w3Reason, w4Reason, w4From, w1, w2, w3, w4, t12, t13, t14, t34, lostParts2, lostParts3, lostParts4, prevented34, cutPixels2, cutPixels3, cutPixels4, candidateCount, counts, attribution, others, opportunity, event2, event3, event4, exposure, reading, textIdentifiable, error`. `cell = cellName`, `candidateCount = scan.count`(없으면 `null`), `counts = w4Diag.counts`(없으면 `null`).

## 6. 검사 4 — 집계 (summary.json)

### 6.1 그룹 블록 (행 목록 R, 페이지 면적 A, 매치 = `stage ∈ {k0, hangul}`)

- `n, error, unmatched, matched`, `strict: {w1, w2, w3, w4}`, `fullPage: {w1, w2, w3, w4}`, `t12, t13, t14, t34`: 각 `{recovered, lost, keptSuccess, bothFail}`.
- `L2, L3, L4 = {count, denom = strict.w1, sources}`. `prevented34 = {count, of = L3.count, sources}`, `newLoss34 = {count = t34 lost, of = strict.w3, sources}`, `recovered34 = {count = t34 recovered, of = n − strict.w3, sources}`.
- `cut`(w2Reason cut 수), `applied`(w4Reason applied 수), `w4Reason`: 4.2절 사유 16개의 수(합 = n).
- `opportunity, event2, event3, event4 = {count, sources}`.
- `attribution` = 적용 행의 `{applied, correct, wrong, undetermined, header: {target_header, comp_header, other_item, undetermined}, candidate: {target_value, comp_value, other_record_value, other_record_comp, other_item, undetermined}}`.
- `exposure` = 매치 행의 창별(`w1`–`w4`) 항목별(`targetHeader, compHeader, compValue, targetValue`) `{full, partial, none, source_missing}` 개수.
- `reading` = `reading`이 있는 행(정상 머리글 매치)의 `{pages, e1: {w1, w2, w3, w4}(사건 수), e2: {…}, change: {e1: {w2, w3, w4}, e2: {…}}, headerLost: {w2, w3, w4: {count, sources}}}`. `change.eX.wK = {new, newSources, existing, existingSources, resolved, resolvedSources}`: `new = eX_k ∧ ¬eX_w1`, `existing = eX_k ∧ eX_w1`, `resolved = ¬eX_k ∧ eX_w1`.
- `area` = 매치 행 `{pages, w2, w3, w4, appliedPages, w4Applied}`. 각 `{num, den}`: 평균 감소 %p = `100·Σ cutPixelsK / (A · 쪽 수)`를 기약분수로(`num`, `den`은 10진 정수 문자열). 쪽 수 0이면 `null`. `w4Applied`는 W4 적용 행의 `cutPixels4`.
- `sources` = 서로 다른 원본 수.

### 6.2 그룹 키 (이 순서)

`total`; `cut`; `applied`(W4); `side` = {L, R}; `header` = {normal, blank, dup}; `ans` = {same, below}; `normalSide` = {L, R}(header normal ∧ side); `cell` = 12셀(`L-normal-same, L-normal-below, L-blank-same, L-blank-below, L-dup-same, L-dup-below, R-…` 같은 순서); `kind` = {library, sports, culture}; `qtype` = {time, count, pages}; `slot` = {0, 1, 2}; `w4Reason` = 16개; `source` = 12개(design 순서).

### 6.3 목록과 표

- `lists = {t13Lost, t14Lost, prevented34, newLoss34, recovered34, applied, appliedNormal, appliedBlankDup, attributionWrong, attributionUndetermined, opportunity, event4, readingNewE1W4, headerLostW4, errors, unmatched}`(ID, ID 순서).
- `sideMismatch` = 원본·header·ans마다 L/R 두 행을 짝지어 `w4Reason`, `w4.strict`, `event4`, `attribution.outcome` 중 다른 필드가 있으면 `{source, header, ans, L, R, fields}`(원본 design 순서, header, ans 순).
- `concentration` = `{event4, applied, L4}` 각각 `{total, topSource, topCount}`(원본별 사건 수 최대, 동률은 design 순서 앞 원본, total 0이면 `topSource = null`, `topCount = 0`).
- `sourceTable` = 12원본(design 순서) × 12셀. 칸 = `{id, stage, w4Reason, s: "SSSS"(W1–W4 엄격 S/F), t14, counts, outcome, event4, newE1W4}` 또는 오류·미매치 표시.
- `invariants = {checked, w4InW1W2, nested, lost4SubsetLost2, events4SubsetEvents2, appliedIsW2, recoveredNotFullPage}`(앞 셋은 매치 수와 같아야, 불리언은 참, 마지막은 0).

### 6.4 summary.json

`{version, dataCommit, manifestSha256, predictionsSha256, pageArea, invariants, stages, groups, lists, sideMismatch, concentration, sourceTable, verdict}`. `stages` = `{pages, error, normal, unmatched, k0Matched, hangulMatched, w1Reason, w2Reason, w3Reason, w4Reason}`.

## 7. 판정 (summary.verdict, 프로토콜 5.9)

- `G1 = {L4: groups.total.L4.count, pass: L4 == 0}`.
- `G2 = {blank: groups.header.blank.applied, dup: groups.header.dup.applied, pass: 둘 다 0}`.
- `G3 = {L: groups.normalSide.L.event4.sources, R: groups.normalSide.R.event4.sources, pass: 둘 다 ≥ 2}`.
- `G4 = {denom: groups.header.normal.attribution.applied, denomL, denomR(normalSide별), correct, wrong, undetermined, status}`: `denom == 0` → `"not_applicable"`(통과 아님); `correct == denom ∧ wrong == 0 ∧ undetermined == 0` → `"pass"`; 그 밖 `"fail"`.
- `geometry = G1.pass ∧ G2.pass ∧ G3.pass ∧ G4.status == "pass" ? "pass" : "fail"`. `failed` = 미달 조건 이름 목록.
- `reading = {comparable: groups.header.normal.reading.pages, newE1: change.e1.w4.new, newE1Sources, status}`: `comparable == 0` → `"not_evaluable"`, `newE1 ≥ 1` → `"loss"`, 그 밖 `"no_loss"`.
- `final`: (pass, no_loss) → `"followup_possible"`; (pass, loss) → `"geometry_ok_reading_worse"`; (fail, no_loss) → `"geometry_fail"`; (fail, loss) → `"both_unfavorable"`; (pass, not_evaluable) → `"geometry_pass_reading_not_evaluable"`; (fail, not_evaluable) → `"geometry_fail_reading_not_evaluable"`.

## 8. 검사 5 — 재생 입력 허용 목록과 행 단위 변조

- `inputs.json`의 `data` 경로가 정확히 `selector/questions.json` 다음 ID 순서의 144개 `selector/images/<file>`이고 각 SHA-256이 manifest와 같다. `ocr` 입력은 `ocr/freeze.json`, `ocr/ocr.jsonl`, `ocr/k1.jsonl` 셋뿐이다. 그 밖의 경로는 없다.
- `diff_rows(a, b)`: 같은 ID 순서의 두 행 목록에서 필드 값(정규화 JSON)이 다른 `{id, fields}`. 다시 계산한 예측·채점 행과 기록 행을 이것으로 비교한다.

## 9. 변조 점검 (`--mutate`)

기록 사본(메모리)에 다음을 넣고 각각 검산이 실패하는지 본다(`mutation.json`). 해당 사례가 실제 결과에 없으면 `notApplicable`과 이유를 적는다.

1. 두 쪽의 `t14` 교환(주변합 보존) 2. 예측 두 행의 `w4Reason` 교환 3. `w4Diag.assign[0].column` 변경 4. `w4Diag.counts.target` ± 1 5. `w4Diag.header.target` 1↔2 6. 머리글 그룹 단어 인덱스 변경 7. 예측 W4 1px(`w4.top + 1`) 8. 점수 행 `opportunity` 반전 9. 노출 하나 변경(`exposure.w4.targetHeader`) 10. 읽기 사건 반전(`reading.e1.w4`) 11. 귀속 분류 변경(`attribution.header.class`) 12. ID 중복 13. ID 누락 14. 골드 상자 1px 15. K1 `hitWords` 변조 16. 공개 표 칸 하나 변조 17. 면적 분자 변경(`area.w4.num`) 18. 판정 코드 변경(`verdict.final`)

## 10. 검사 6 — 공개 결과표 (RESULTS.md)

`<!-- khc:table NAME -->` 줄과 `<!-- /khc:table -->` 줄 사이의 표를 칸 단위로 비교한다(머리글 포함). 칸 문자열: 정수 10진, `null` → `—`, 분수 `a/b`, 참/거짓 `S`/`F`, %p = `pp_text`(기약분수 값을 소수 둘째 자리로: 0 이상이면 `floor(x·100 + 1/2)/100`, 음수면 그 절댓값의 결과에 `-`, 항상 소수 둘째 자리까지, 예 `13.33`, `40.00`).

그룹 행 이름(이 순서): `전체`, `W2 cut`, `W4 applied`, `side L`, `side R`, `header normal`, `header blank`, `header dup`, `ans same`, `ans below`, `normal L`, `normal R`, 12셀 이름(`cell L-normal-same` …), `kind library`, `kind sports`, `kind culture`, `qtype time`, `qtype count`, `qtype pages`, `slot 0`, `slot 1`, `slot 2`.

- `stages` — `| 항목 | 쪽수 |`: 등록 쪽, 기술 오류, 정상 처리(미매치 포함), 정상 미매치, K0 매치, 한글 매치, W1 widened, W1 not_wider, W1 no_candidate, W1 k0_branch, W2 cut, W2 no_cut, W2 hit_outside_w1, W2 inherit, `W3 <사유>` 10개(#152 순서), `W4 <사유>` 16개(4.2절 순서).
- `groups` — `| 그룹 | n | 오류 | 미매치 | 매치 | W1 엄격 | W2 엄격 | W3 엄격 | W4 엄격 | W2 cut | W4 적용 | L2/W1 성공 | L3/W1 성공 | L4/W1 성공 | L4 원본 | L3 중 W4 예방 | W3→W4 새 손실 | W3→W4 회복 | 공통 기회 | J2 | J3 | J4 | J4 원본 |`. 칸: `n, error, unmatched, matched, strict.w1–w4, cut, applied, "L2.count/L2.denom", "L3…", "L4…", L4.sources, "prevented34.count/prevented34.of", "newLoss34.count/newLoss34.of", "recovered34.count/recovered34.of", opportunity.count, event2.count, event3.count, event4.count, event4.sources`.
- `reasons` — `| 그룹 | <W4 사유 16개> |`(4.2절 순서, `error`·`unmatched` 포함).
- `attribution` — `| 그룹 | 적용 | 정답 | 오선택 | 미확정 | 표제 목표 | 표제 경쟁 | 표제 기타 | 표제 미확정 | 후보 목표 | 후보 경쟁 | 후보 타 레코드 값 | 후보 타 레코드 경쟁 | 후보 기타 | 후보 미확정 |`.
- `exposure` — 행 = `header normal`, `header blank`, `header dup` × 창 W1–W4(행 이름 `<header> W<k>`), 열 = `| 행 | 목표 표제 f/p/n/m | 경쟁 표제 f/p/n/m | 경쟁 값 f/p/n | 목표 값 f/p/n |`(f/p/n/m = full/partial/none/source_missing).
- `reading` — 행 = `header normal`, `normal L`, `normal R`, 12셀 중 normal 4개. 열 = `| 그룹 | 비교 쪽 | E1 W1 | E1 W4 | E1 W4 새(원본) | E1 W4 기존 | E1 W4 해소 | E2 W1 | E2 W4 | E2 W4 새(원본) | E2 W4 기존 | E2 W4 해소 | 표제 소실 W2 | 표제 소실 W3 | 표제 소실 W4(원본) | E1 W2 새 | E1 W3 새 |`. "새(원본)" = `"new (newSources)"`.
- `area` — `| 그룹 | 매치 | W2 평균 %p | W3 평균 %p | W4 평균 %p | W4 적용 쪽 | W4 적용 평균 %p |`.
- `sources` — `| 원본 | 유형 | 목표 슬롯 | <12셀> |`. 칸 = 오류 `error`, 미매치 `unmatched`, 아니면 `"{SSSS} {w4Reason} t{target}c{comp}u{unassigned}|- {outcome 약어|-}"`에 `event4`면 `" J"`, `newE1W4`면 `" E1"`. 약어: correct `C`, wrong `W`, undetermined `U`.
- `verdict` — `| 조건 | 값 | 판정 |`: G1(L4), G2(공란 적용/중복 적용), G3(J4 원본 L/R), G4(정답/분모, L/R 분모, 오선택, 미확정), 기하, 읽기(새 E1/비교 쪽), 최종.

## 11. 손계산 예제

`example/example.json`. 묶음과 `why`(계산 과정):

- `parser`: 12개 등록 질문, 은/는, 전각 물음표, 여러 공백·탭, 붙여 쓴 필드, `의 ` 0회/2회, 단위·끝말 불일치, 물음표 없음, 구분어 없는 필드, 빈 기록명.
- `w3scan`: 고정 #152 `w3Rule`이 합성 입력에서 `scan.units`(줄·첫/끝 단어·원래 표기·합집합·지지)를 손계산과 같이 낸다.
- `w4`: 4.2–4.4절 모든 분기와 경계(정상 적용, 답 아래 줄, 공란, 중복, 불일치, 두 자격 줄, 그룹 간격 정확히 2배와 초과, 음수 간격, 직전 단어 기준이 만드는 그룹 겹침, 거리 정확히 1배와 초과, 동률, 부동소수점이면 틀리는 소수 경계, OCR 단어 순서 역전, 목표 후보 둘, W2 밖 1px와 변과 같음, 무효·빈 단어 줄, 기준 y 아래 줄, K1 줄 제외, 해당 없음, 유형 없음·복수, 파싱 실패, 오류·미매치, 오른쪽 목표 열).
- `exposure`, `attribute`(셀 중심·반열림 경계·두 셀·잉크 교집합 0·공란 머리글), `scoring`(4쪽 집계: 적용 정답, W3 손실 예방, 공란 보류, 오류)와 그 판정, `pp`(표시 반올림).
