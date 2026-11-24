# 독립 검산 명세 — ko-row-gate (W3 조건부 세로 제한)

제3자가 이 문서, 고정 선택기 `research/src/selector.mjs`(함수 `tokens`, `keywords`, `score`, `selectWindow`), 손계산 예제 `example/example.json`, 아래 원자료만으로 검산기를 쓸 수 있도록 적은 공개 명세다. 연구 JS 코드(`research/src/ko-row-gate-*.mjs`)를 읽지 않아도 된다. 검산기는 JS 함수를 가져오지 않고 독자적으로 계산한다. 이 문서가 W3 규칙, 결과 스키마(예측·채점·집계·공개 표)의 정의다. K0·K1·W1·W2는 고정 객체의 정의를 그대로 옮긴다(2·3절).

## 0. 산출물과 실행

- `research/tools/ko-row-gate/recount.py` — Python 3.12 **표준 라이브러리만**.
  `python recount.py --data <data dir> --ocr <ocr dir> --replay <replay dir> --score <score dir> [--results <RESULTS.md>] --out <recount.json>`
  모든 검사를 통과하면 종료 0, 하나라도 어긋나면 종료 1, 입력이 손상돼 계산을 시작할 수 없으면 종료 2. `--mutate <mutation.json>`은 9절 변조 점검이다.
- `research/tools/ko-row-gate/test_recount.py` — `unittest`. 손계산 예제(11절) 전체와 경계를 시험한다.
- 모듈 함수(시험이 부른다): `squash(text)`, `question_types(q)`, `grammar_match(qtype, text)`, `w1_rule(lines, k1, W, H)`, `w2_rule(lines, k1, W, H)`, `w3_rule(question, lines_exact, k1, r)`, `exposure(ink, band)`, `classify_candidate(cand, page)`, `validate_prediction(pred)`, `score_page(pred, page)`, `summarize_scores(rows, page_area)`, `render_tables(summary)`, `check_tables(markdown, summary)`, `check_id_set(rows, ids)`, `diff_rows(a, b)`, `dec_str(x)`, 예외 `ValidationError`.

## 1. 입력

- `<data dir>` = `research/results/ko-row-gate/data/`: `manifest.json`(`files: {상대경로: {sha256, bytes}}`), `selector/questions.json`(`questions: [{id, file, question}]`), `selector/images/*.png`, `scoring/design.json`, `scoring/gold.json`, `scoring/render.json`, `scoring/render-check.json`, `checks.json`.
- `design.json["images"]` 행: `id, source, doctype, form, content, ans ("same"|"below"), dec ("same"|"other"), layout ("<ans>-<dec>"), file, page {width, height}, slot, slotPosition, qtype ("time"|"count"|"pages"), records [{slot, position, labelItem, valueItem, auxAItem, decoyItem, auxBItem, noteItem, block, lineA, lineB}], question, answer, label, field, decoyField, anchorItem, valueItem, decoyItem, goldItems, otherValueItems, items [{id, role, record?, text, cell, size}], rules, serial`. 역할: `title, header, label, value, aux, decoy, note`.
- `<ocr dir>`: `freeze.json`(`files: {"ocr.jsonl", "k1.jsonl"}` 원바이트 SHA-256), `ocr.jsonl`, `k1.jsonl`(각 48행, 질문 순서).
  - `ocr.jsonl` 행: `id, pngSha256, width, height, status ("ok"|"error"), error, ocrSha256, ocrLineCount, ocrLines`. `ocrLines` = `[{text, confidence, box: [x, y, w, h], words: [{text, box}]}]`(원본 픽셀).
  - `k1.jsonl` 행: `id, status, error, k1`. `k1` = 고정 #147 `keyResults(...).k1`: `status, error, branch ("k0"|"hangul"|"none"), keys, hangulKeys, matched, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor, hitWords, band {left, top, width, height}`.
- `<replay dir>`: `freeze.json`(`files: {"predictions.jsonl", "inputs.json"}`), `predictions.jsonl` 48행, `inputs.json`.
- `<score dir>`: `score.jsonl` 48행, `summary.json`.
- JSONL은 한 줄에 JSON 하나, LF, 마지막 줄 바꿈 하나. CR이나 빈 줄이 있으면 손상(종료 2).
- **두 번 읽기.** OCR 파일은 (a) 보통 JSON 수(K1·W1·W2 재계산용)와 (b) **원래 JSON 수 표기 문자열**(W3용, 4.0절)로 각각 읽는다. Python은 `json.loads(..., parse_float=<토큰 보존>, parse_int=<토큰 보존>)`, JS는 `JSON.parse(text, (k, v, ctx) => typeof v === "number" ? ctx.source : v)`다.

## 2. 검사 1 — 해시, ID, 자료, 짝

1. `manifest.json`의 모든 파일이 있고 SHA-256·크기가 같으며 목록 밖 파일이 없다(`manifest.json` 자신 제외).
2. 두 `freeze.json`의 해시 = 해당 파일 원바이트 SHA-256.
3. **ID 집합:** `design.json["images"]`, `questions.json`, `ocr.jsonl`, `k1.jsonl`, `predictions.jsonl`, `score.jsonl`의 ID 목록이 모두 48개, 중복 없음, 같은 순서. 어긋나면 `ValidationError`.
4. 골드: `gold.json["gold"][id]["parts"]` 정확히 2개(첫째 `item` = `anchorItem`, 둘째 = `valueItem`), `rect = [l, t, r, b]` 정수, `0 ≤ l < r ≤ 1280`, `0 ≤ t < b ≤ 960`, `size = [r−l, b−t]`, `render.json`의 같은 item `ink`와 같음, 서로 겹치지 않음, 각 design `cell` 안.
5. PNG 직접 해독(zlib, 8비트 그레이스케일, 비인터레이스, 필터 0–4). 크기 1280 × 960. `ocr.jsonl`의 `pngSha256`·`width`·`height`가 PNG와 같다. 골드 두 상자, 목표 방해 값(`decoyItem`), 다른 값 2개의 잉크 상자 네 가장자리 줄마다 상자 안에 값 < 255인 픽셀이 있다.
6. **짝 대응:** 원본(`source`)마다 정확히 4쪽(`ans × dec`), 같은 질문·정답·`qtype`·`anchorItem`·`valueItem`·`decoyItem`·`otherValueItems`, 같은 item id·역할·텍스트, 같은 잉크 x 범위(`ink[0]`, `ink[2]`)와 잉크 높이(`ink[3] − ink[1]`). 레코드마다 바뀌는 item은 `value`, `auxA`, `decoy`, `auxB` 넷뿐이고 나머지 item의 잉크 y는 4쪽에서 같다. 정규화 질문(NFC, 양 끝 공백 제거, 내부 공백 연속을 하나로) 12개가 각 4회이며 한 원본의 4쪽에만 나온다.
7. **유형 검산:** 12개 질문의 `question_types`(4.1절)가 각각 design `qtype` 하나뿐이다. 각 쪽의 정답·목표 방해 값·다른 레코드 지정 값이 `qtype` 문법(4.3절)을 만족하고 서로 다르다. 그 밖의 item 텍스트는 어떤 문법도 만족하지 않는다.

## 3. 검사 2 — K1 재계산, W0·W1·W2 (고정 정의)

- OCR 행 `status != "ok"`이면 K1을 재계산하지 않고 k1·예측 행이 오류이며 창이 `null`인지 본다.
- **K0/K1**은 #150 명세(`b108e2f:research/tools/ko-row-window/RECOUNT_SPEC.md` 3절)와 같다. 입력 검증 → K0 `selectWindow` 이식(질문에 ASCII 영숫자가 없어 정상 미매치) → 한글 보조(NFC 현대 한글 음절 연속 구간의 인접 두 음절 bigram, 줄 점수 = 질문 bigram과 공유하는 서로 다른 bigram 수, 양수 최댓값 줄, 동점은 원시 `confidence`가 엄격히 큰 줄, 그다음 앞 줄; `hitWords` = 선택 줄에서 질문 bigram을 하나라도 가진 단어 번호 오름차순; 앵커 = 히트 상자 합집합; 창은 고정 선택기와 같은 식). 대조 필드: `status, matched, branch, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor, hitWords, band`.
- **W0** = K1 `band`. **W1** = 고정 #150 W1 규칙(같은 행의 오른쪽 후보 `cl ≥ hr ∧ ov > 0 ∧ ov ≥ 0.5·min(높이)`, 공백 단어 제외, 후보 오른쪽 최댓값 올림·페이지 폭 제한, 새 오른쪽 = max(W0 오른쪽, 그 값); 사유 `error`/`unmatched`/`k0_branch`/`no_candidate`/`not_wider`/`widened`).
- **W2** = 고정 #151 W2 규칙(`d75f545:research/tools/ko-row-height/RECOUNT_SPEC.md` 4절). `widened`일 때만: 히트 = `k1.hitWords` 전부(너비·높이 > 0, 유한, 아니면 `ValidationError`), `a = min(y)`, `b = max(y+h)`, 패딩 = 높이 중앙값, 히트가 W1 세로 밖이면 `hit_outside_w1`(W2 = W1), 아니면 `top = max(W1.top, floor(a − pad))`, `bottom = min(W1.bottom, ceil(b + pad))`, 같으면 `no_cut`, 다르면 `cut`. `widened`가 아니면 `inherit`(매치면 W2 = W1, 미매치·오류면 `null`). 계산은 부동소수점(고정 구현 그대로)이다.

## 4. W3 규칙 (등록 규칙, 프로토콜 4.4)

입력: 질문 `q`, OCR `lines`(정확 표기), K1 기록 `k1`, 고정 W2 결과 `r`(`reason, w1, w2, w2Reason`). W3는 언제나 `null`, W1, W2 중 하나와 **값이 같다**. 새 창을 만들지 않는다.

### 4.0 정확한 십진 비교

- W3의 모든 좌표 비교는 OCR 상자의 **원래 JSON 수 표기**를 정확한 십진 유리수로 해석해서 한다(정수·소수·지수 표기 모두). 부동소수점 덧셈을 하지 않는다. 예: 표기 `0.1`과 `0.2`의 합은 정확히 `0.3`이다.
- 단어 상자 `[x, y, w, h]` → `x0 = x`, `y0 = y`, `x1 = x + w`, `y1 = y + h`, `width = w`, `height = h`(정확한 합). W2 창은 정수다(고정 구현 출력).
- **유효 단어**: `box`가 길이 4의 배열, 네 값이 모두 JSON 수(유한), `w > 0`, `h > 0`. 그 밖은 무효다(`null`, 문자열, 0 또는 음수 크기).
- 정확한 값의 출력 표기 `dec_str`: 지수 없이, 정수면 소수점 없이, 아니면 마지막 0을 지운 소수(`-0` → `0`). 예: `38.4375`, `120`, `0.3`.

### 4.1 정규화와 질문 유형

- `squash(s)` = NFKC 정규화 뒤 **Unicode White_Space 코드포인트**(U+0009–000D, U+0020, U+0085, U+00A0, U+1680, U+2000–200A, U+2028, U+2029, U+202F, U+205F, U+3000) 제거. U+FEFF와 U+200B는 White_Space가 아니므로 남는다.
- `question_types(q)`: `s = squash(q)`. `"시각"` 또는 `"몇시"`가 부분 문자열이면 `time`, `"몇명"`이면 `count`, `"몇쪽"`이면 `pages`. 같은 유형의 단서가 여러 번 있어도 한 건이다. 결과는 유형 이름의 정렬 목록이다. 고정 어구의 부분 문자열 검사이므로 `"몇시간"`도 `time`이다(인계서에 한계로 적는다).

### 4.2 판정 순서 (첫 해당 사유가 배타적인 `w3Reason`)

1. `r.reason == "error"` → `w3Reason "error"`, `w3 = null`, `w3From = null`. `r.reason == "unmatched"` → `"unmatched"`, `null`. (기술 오류·정상 미매치. 보류 사유가 아니다.)
2. `r.w2Reason != "cut"`(W2가 W1을 실제로 좁히지 않음) → `"not_applicable"`, `w3 = w1`, `w3From "w1"`.
3. 유형 목록 길이 0 → `"qtype_none"`, 2 이상 → `"qtype_multiple"`. 둘 다 `w3 = w1`.
4. **H**(유효 히트): `k1.lineIndex` 줄에서 `k1.hitWords`에 저장된 단어 중 유효 단어(4.0절)만, 저장 순서대로. 다른 줄의 단어, K1 후보, 골드는 넣지 않는다. 히트를 합치거나 하나만 고르지 않는다. H가 비면 `"no_valid_hit_word"`, `w3 = w1`(정상 보류).
5. 후보(4.3절)가 0개 → `"no_candidate"`, 2개 이상 → `"multiple_candidates"`, 1개이지만 상자 C가 W2 안에 완전히 들지 않음 → `"candidate_outside_w2"`. 모두 `w3 = w1`.
6. 후보가 정확히 1개이고 C ⊆ W2 → `"applied"`, `w3 = w2`, `w3From "w2"`.

- `w3CutPixels` = W1 면적 − W3 면적(`applied`이면 W2의 `cutPixels`, 그 밖 매치면 0, 오류·미매치면 `null`).
- 사후 단언(어기면 `ValidationError`): `w3 ∈ {w1, w2}`(값), `w2 ⊆ w3 ⊆ w1`, `applied`이면 `w3 = w2`, 그 밖 매치면 `w3 = w1`.

### 4.3 후보 단위의 열거 (전체 OCR, W2로 자르기 전)

- **진단 열거:** 후보 열거는 매치 쪽 중 `k1.hitWords`가 배열이고(한글 분기), 유형이 정확히 하나이고, H가 비지 않은 모든 쪽에서 한다(적용 대상이 아닌 쪽 포함). 그 밖은 `candidates = null`. 판정은 4.2절 순서만 따른다. 열거 결과는 4.2절 5·6단계에만 판정에 쓰인다.
- 줄 `i`(OCR 순서), 시작 단어 `j`, 길이 `n ∈ {1, 2, 3}`: 단어 `j … j+n−1`이 그 줄에 모두 있고(줄을 넘지 않음),
  1. 모두 유효 단어이고 `squash(text) != ""`다. 무효 단어나 빈 단어가 끼면 그 구간은 버린다(건너뛰어 잇지 않는다).
  2. `n ≥ 2`이면 이웃한 두 단어 `p`, `q`(원래 순서)마다 `0 ≤ x0(q) − x1(p)`이고 `2·(x0(q) − x1(p)) ≤ min(height(p), height(q))`. 역순·겹침(음수 간격)은 탈락이고 정렬하지 않는다.
  3. 연결 문자열 `t = squash(text_j) + … + squash(text_{j+n−1})`가 질문 유형 문법과 **전체 일치**한다.
     - `time`: `^(?:[0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$` (ASCII 숫자. 시 0–23, 분 00–59. `H:MM` 또는 `HH:MM`).
     - `count`: `^[1-9][0-9]{0,2}명$`, `pages`: `^[1-9][0-9]{0,2}쪽$`.
     - 접두·부분 일치, 단위 없는 숫자, 추정·교정은 없다. NFKC가 전각 숫자·콜론을 ASCII로 바꾼다.
  4. **같은 행의 오른쪽:** 어떤 `h ∈ H` 하나가 구간의 **모든** 단어 `u`에 대해 `x0(u) ≥ x1(h)`와 `2·max(0, min(y1(u), y1(h)) − max(y0(u), y0(h))) ≥ min(height(u), height(h))`를 동시에 만족한다. 닿음(`x0 = x1`)과 정확히 절반 겹침은 허용, 1px 겹침이나 절반 미만은 그 h로 불가. 서로 다른 h가 각자 다른 단어만 지지하면 탈락이다. **합집합 상자 대안은 쓰지 않는다.** 줄 번호가 히트 줄과 달라도 된다. 히트 단어 자신도 조건을 따른다.
- 후보 하나 = `(i, j, j+n−1)`. 이 키가 같은 단위는 한 번만 센다(여러 h가 지지해도 한 번). 같은 문자열이 다른 위치에 있거나 서로 겹친 두 유효 단위가 남으면 둘 다 센다.
- 후보 기록(열거 순서: `i`, `j`, `n` 오름차순): `{line: i, first: j, last: j+n−1, text: t, boxes: [[원래 표기 4개] …], union: [dec_str(min x0), dec_str(min y0), dec_str(max x1), dec_str(max y1)], support: [지지하는 h의 hitWords 단어 번호 오름차순]}`.
- **C ⊆ W2:** `w2.left ≤ C.x0`, `w2.top ≤ C.y0`, `C.x1 ≤ w2.left + w2.width`, `C.y1 ≤ w2.top + w2.height`. 예: W2 = [0, 0, 100, 30)에서 C = [90, 20, 100, 30]은 안, [90, 20, 101, 30]은 밖이다. C는 이 포함 판정에만 쓴다.

### 4.4 예측 행 필드 (이 순서)

`id, pngSha256, ocrSha256, width, height, state ("error"|"unmatched"|"matched"), error, branch, lineIndex, hitWords, reason, w0, w1, candidates, maxRight, clippedRight, addedPixels, w2Reason, hitTop, hitBottom, pad, w2, cutPixels, qtypes, validHits, scan, w3Reason, w3From, w3, w3CutPixels`.

- `candidates`부터 `cutPixels`까지는 고정 W1·W2 출력 그대로다(`candidates`는 W1 후보 `[줄, 단어]` 목록).
- `qtypes`: 매치 쪽은 `question_types(q)`, 오류·미매치는 `null`.
- `validHits`: H의 단어 번호 목록(4.2절 4단계를 계산할 수 있는 쪽, 즉 `k1.hitWords`가 배열인 매치 쪽), 그 밖 `null`.
- `scan`: 진단 열거 결과 `{count, units: [후보 기록 …]}` 또는 `null`(4.3절 조건 밖).

## 5. 검사 3 — 예측 검증과 행 판정 (score.jsonl)

### 5.1 `validate_prediction(pred)` (어기면 `ValidationError`)

- `matched`: `w0, w1, w2, w3` 모두 정수 4개·양의 폭/높이·페이지 안. W1은 W0의 `left, top, height`를 지키고 폭 ≥. W2는 W1과 `left`·`width`가 같고 세로로 안. `w2Reason ∈ {inherit, cut, no_cut, hit_outside_w1}`, `reason != "widened"` ⇔ `inherit`, `cut` ⇔ W2 ≠ W1, `cutPixels == (w1.height − w2.height)·w1.width`. `w3Reason ∈ {not_applicable, qtype_none, qtype_multiple, no_valid_hit_word, no_candidate, multiple_candidates, candidate_outside_w2, applied}`. `w2Reason != "cut"` ⇔ `not_applicable`. `applied` ⇔ `w3From "w2"` ∧ `w3 == w2`; 그 밖은 `w3From "w1"` ∧ `w3 == w1`. `w3CutPixels == (w1.height − w3.height)·w1.width`. `applied`이면 `scan.count == 1`이고 그 후보의 `union`이 W2 안. `candidate_outside_w2`이면 `scan.count == 1`이고 `union`이 W2 밖. `no_candidate`/`multiple_candidates`이면 `scan.count` 0/≥2.
- `unmatched`/`error`: `w0 = w1 = w2 = w3 = null`, `cutPixels = w3CutPixels = null`, `w2Reason "inherit"`, `w3Reason`이 state와 같다, `w3From = null`.

### 5.2 노출 `exposure(ink, band)`

잉크 `[l, t, r, b)`, 창 `[L, T, L+w, T+h)`. 완전히 안이면 `"full"`, 아니고 `ix > 0 ∧ iy > 0`이면 `"partial"`, 그 밖(맞닿음 포함)은 `"none"`. 창이 `null`이면 `null`.

### 5.3 유일 후보의 골드 분류 `classify_candidate(cand, page)` (채점 측만, 판정에 쓰지 않음)

- 후보의 각 단어 중심 `(x + w/2, y + h/2)`(정확한 값)을 design item의 **셀**(`cell`, 반열림 `[c0, c1, c2, c3)`, 표·카드 모두 한 텍스트 항목의 셀. 카드 외곽·레코드 영역은 셀이 아님)에 배정한다. 중심을 담는 셀이 정확히 하나일 때만 그 item에 배정된다.
- 모든 단어가 같은 item 하나에 배정되고, 후보 상자 C(4.3절)와 그 item 잉크의 교집합 면적이 양수(`min(r, C.x1) − max(l, C.x0) > 0` ∧ 세로도 같음)일 때만 그 item으로 확정한다. 그 밖(배정 안 됨, 두 item, 교집합 0)은 모호다.
- 분류: item = `valueItem` → `"target_value"`, `decoyItem` → `"intended_decoy"`, `otherValueItems` 중 하나 → `"other_record_value"`, 그 밖 확정 item 또는 모호 → `"other_or_ambiguous"`. 결과 `{class, item}`(모호면 `item = null`).

### 5.4 행

- 창 판정(W1/W2/W3 각각, 고정 #147 `scoreKey`): 예측 `error` → `{state "technical_error", strict false, evidence null, fullPage null, area null}`; `unmatched` → `state "unmatched"`, 나머지 같음; 매치 → 두 골드 포함 수 n(2/1/0 → `evidence "all"/"partial"/"none"`), `area`, `fullPage = area ≥ W·H`, `strict = 0 < area < W·H ∧ n = 2`, `state = strict ? "matched_strict" : "matched_not_strict"`.
- `stage`: `"error"`/`"unmatched"`/매치이고 `branch "hangul"` → `"hangul"`, 그 밖 매치 → `"k0"`.
- 전이 `t12`(W1 → W2), `t13`(W1 → W3): 앞 ∧ 뒤 엄격 → `"keptSuccess"`, 뒤만 → `"recovered"`, 앞만 → `"lost"`, 그 밖 → `"bothFail"`.
- **회복 예외:** `recovered`는 W1이 전체 페이지(`w1.fullPage`)이고 비교 창이 부분 창일 때만 가능하다. 그 밖의 `recovered`는 `ValidationError`.
- `fullPageToPartial2/3`: 매치일 때 `w1.fullPage ∧ ¬w2/w3.fullPage`, 그 밖 `null`.
- `lostParts2/3`: 해당 전이가 `lost`일 때 W2/W3 밖으로 나간 골드 이름 목록(`["label"]`, `["value"]`, `["label", "value"]`), 그 밖 `null`.
- `prevented` = `t12 == "lost" ∧ t13 != "lost"`(W2 손실을 W3가 W1로 되돌려 보존).
- `candidateCount` = `scan.count`(없으면 `null`). `uniqueCandidate` = `scan.count == 1`이면 `classify_candidate`, 아니면 `null`.
- `others`(매치일 때, 그 밖 `null`): 다른 값 item = `otherValueItems`(목표 외 두 레코드의 지정 값, 순서 유지). `items = [{item, w1, w2, w3}]`, `n`, `w1`·`w2`·`w3` = `{full, partial, none}` 개수, `fromW1Full2`·`fromW1Full3` = W1에서 `full`인 item들의 W2·W3 분류 개수.
- **공통 기회** `opportunity` = 매치 ∧ `w1.strict` ∧ `w2Reason == "cut"` ∧ `others.w1.full ≥ 1`. `event2` = `opportunity ∧ w2.strict ∧ fromW1Full2.none ≥ 1`, `event3` = `opportunity ∧ w3.strict ∧ fromW1Full3.none ≥ 1`.
- `score.jsonl` 행 필드(이 순서): `id, source, doctype, form, content, ans, dec, layout, qtype, slot, stage, reason, w2Reason, w3Reason, w3From, w1, w2, w3, t12, t13, fullPageToPartial2, fullPageToPartial3, lostParts2, lostParts3, prevented, cutPixels2, cutPixels3, candidateCount, uniqueCandidate, others, opportunity, event2, event3, error`. `cutPixels2` = 예측 `cutPixels`, `cutPixels3` = `w3CutPixels`.

## 6. 검사 4 — 집계 (summary.json)

- `stages = {pages, error, normal, unmatched, k0Matched, hangulMatched, w1Reason: {widened, notWider, noCandidate, k0Branch, unmatched, error}, w2Reason: {inherit, cut, noCut, hitOutside}, w3Reason: {error, unmatched, notApplicable, qtypeNone, qtypeMultiple, noValidHitWord, noCandidate, multipleCandidates, candidateOutsideW2, applied}}`.
- **그룹 블록**(행 목록 R, 페이지 면적 A, 매치 = `stage ∈ {k0, hangul}`):
  - `n, error, unmatched, matched`, `strict: {w1, w2, w3}`, `fullPage: {w1, w2, w3}`
  - `t12`, `t13`: 각 `{recovered, lost, keptSuccess, bothFail}`
  - `recoveredFullPage: {t12, t13}`(회복 중 W1 전체 페이지 수 = 회복 수)
  - `L2 = {count = t12 lost, denom = w1 엄격 수, pct, sources}`, `L3`도 t13으로 같게.
  - `prevented = {count, of = L2.count, sources}`
  - `opportunity = {count, sources}`, `event2 = {count, sources}`, `event3 = {count, sources}`, `keptEvents = {count = event3 ∧ event2 수, of = event2 수}`
  - `cut`(w2Reason cut 수), `applied`(w3Reason applied 수), `w3Reason`: 4.2절 사유 10개의 수(합 = n)
  - `uniqueClass`: `candidateCount == 1`인 행의 분류 수 `{target_value, intended_decoy, other_record_value, other_or_ambiguous}`, `uniqueClassApplied`: 그중 `applied` 행만
  - `others`(매치 행만): `itemsW1Full, pagesW1Full`, `fromW1Full2: {full, partial, none}`(Σ), `fromW1Full3`(Σ), `pagesW1FullToNone2`(fromW1Full2.none ≥ 1인 쪽), `pagesW1FullToNone3`, `pagesW1FullToPartial3`(fromW1Full3.partial ≥ 1), `newlyFullW3`(Σ W3 full ∧ W1 not full — 기하상 0)
  - `area`: 유효 쌍 = 매치 행. `validPairs`, `w2: {sum, meanPp, medianPp, maxPp}`(각 행 `cutPixels2`), `w3: {sum, meanPp, medianPp, maxPp}`(`cutPixels3`), `appliedPages`, `w3Applied: {sum, meanPp, medianPp, maxPp}`(applied 행만). `meanPp = r4(Σ·100/(쪽 수·A))`, `medianPp = r4(median·100/A)`, `maxPp = r4(max·100/A)`, 분모 0이면 `null`(`sum`은 0).
  - `sources`(서로 다른 원본 수)
  - `verdict = {loss3, loss2, prevention, removal}`: `loss3 = L3.count > 0 ? "loss" : "no_loss"`, `loss2`도 L2로. `prevention`: `L2.count == 0` → `"no_w2_loss"`; `prevented == 0` → `"prevented_none"`; `prevented == L2.count` → `"prevented_all"`; 그 밖 `"prevented_some"`. `removal`: `applied == 0` → `"no_opportunity_applied"`; 아니고 `opportunity == 0` → `"no_opportunity_denominator"`; 아니고 `event3 ≥ 1` → (`event3.sources ≥ 2` ? `"observed_repeated_sources"` : `"observed_single_source"`); 그 밖 `"not_observed"`.
- `groups` 키(이 순서): `total`; `cut`(w2Reason cut 행); `applied`(w3Reason applied 행); `layout` = `{"same-same", "same-other", "below-same", "below-other"}`; `ans` = `{same, below}`; `dec` = `{same, other}`; `form` = `{table, cards}`; `doctype` = `{lecture, exhibit, meeting}`; `qtype` = `{time, count, pages}`; `w3Reason` = 4.2절 10개(`error, unmatched, not_applicable, qtype_none, qtype_multiple, no_valid_hit_word, no_candidate, multiple_candidates, candidate_outside_w2, applied`); `source` = 12개 원본 ID(design 순서).
- `lists = {t12Lost, t13Lost, prevented, t12Recovered, t13Recovered, applied, held (매치 ∧ applied 아님 ∧ not_applicable 아님), opportunity, event2, event3, uniqueWrong (candidateCount == 1 ∧ 분류 ≠ target_value), errors, unmatched}`: 페이지 ID, 질문 순서.
- `sourceTable = [{source, doctype, form, content, slot, qtype, cells: {"same-same", "same-other", "below-same", "below-other"}}]`(design 원본 순서). 칸 = `{id, stage, w2Reason, w3Reason, w1Strict, w2Strict, w3Strict, t12, t13, candidateCount, uniqueClass, w1Full, w3Full, fromW1Full3None, cut3Pp}`. `w1Full = others.w1.full`, `w3Full = others.w3.full`(완전히 보이는 다른 레코드 지정 값 수), `fromW1Full3None = others.fromW1Full3.none`. 매치가 아니면 `w1Full`·`w3Full`·`fromW1Full3None`·`cut3Pp`가 `null`. `uniqueClass` = 분류 코드 또는 `null`. `cut3Pp = r4(cutPixels3·100/A)`. 원본 순서는 행 목록에서 원본이 처음 나온 순서(실제 자료에서는 design 순서)다. 한 원본에 어떤 배치 행이 없으면(손계산 예제처럼 부분 목록) 그 칸은 `null`이고 `sources` 표 칸은 `—`다.
- `invariants = {checked (매치 수), w3InW1W2 (W3 ∈ {W1, W2} 확인 수), nested (W2 ⊆ W3 ⊆ W1 확인 수), lost3SubsetLost2 (true/false), events3SubsetEvents2 (true/false), newlyFullW3, newEvidenceW3, recoveredNotFullPage}`. 마지막 셋은 0이어야 한다. `newEvidenceW3` = Σ max(0, W3 evidence 포함 수 − W1 evidence 포함 수).
- `summary.json` = `{version, dataCommit, manifestSha256, predictionsSha256, pageArea, invariants, stages, groups, lists, sourceTable}`.
- `pct(c, n) = round(c·10000/n)/100`, `r4(x) = round(x·10000)/10000`(JS `Math.round`: .5는 +∞ 방향), n = 0이면 `null`. 중앙값은 짝수 개면 가운데 두 값의 평균.

## 7. 검사 2b — 재생 입력 허용 목록

`inputs.json`의 `data` 경로가 정확히 `selector/questions.json` 다음 질문 순서의 48개 `selector/images/<file>`이고, 각 SHA-256이 `manifest.json`과 같다. `ocr` 입력은 `ocr/freeze.json`, `ocr/ocr.jsonl`, `ocr/k1.jsonl` 셋뿐이다. 그 밖의 경로(`scoring/`, gold, design, render, 결과 폴더)는 하나도 없다.

## 8. 검사 5 — 행 단위 변조 거부

- `diff_rows(a, b)`: 같은 ID 순서의 두 행 목록에서 필드 값(정규화 JSON)이 다른 `{id, fields}`. 다시 계산한 행과 기록된 행을 이 함수로 비교하므로 주변합을 보존하는 행 교환도 해당 행이 지목된다.

## 9. 변조 점검 (`--mutate`)

기록 사본(메모리)에 다음을 넣고 각각 검산이 실패하는지 본다(`mutation.json`). 해당 사례가 실제 결과에 없으면 `notApplicable`과 이유를 적는다.

1. 두 쪽 교환: 서로 다른 `t13`을 가진 두 행의 `t13` 교환(주변합 보존)
2. 두 쪽 교환: 예측 두 행의 `w3Reason` 교환
3. 후보 ID: 예측 한 행의 `scan.units[0].first` + 1
4. 후보 수: 예측 한 행의 `scan.count` ± 1
5. 기회 분모: 점수 한 행의 `opportunity` 반전
6. 노출: 다른 값 한 개의 `w3` 분류를 다른 값으로
7. 예측 W3 1px: 매치 행의 `w3.top` + 1
8. 예측 W2 1px: 매치 행의 `w2.top` + 1
9. ID 중복, 10. ID 누락
11. 골드 상자 1px(정답 값 아래 끝 + 1)
12. K1 `hitWords` 변조
13. 공개 표 칸 하나 변조(`groups` 표 전체 행 n)
14. 유일 후보 분류 변조(`uniqueCandidate.class`)

## 10. 검사 6 — 공개 결과표 (RESULTS.md)

`RESULTS.md` 안의 표는 `<!-- krg:table NAME -->` 줄과 `<!-- /krg:table -->` 줄 사이에 있다. 검산기는 자기 계산으로 같은 표 문자열을 만들어 **칸 단위로** 비교한다(머리글 포함). 표마다 머리글 줄, 구분 줄 `|---|---|…|`(열 수만큼), 본문 줄 순서다. 칸 문자열: 정수·실수는 JS `String(number)`, `null`은 `—`, 분수는 `a/b`, 참/거짓은 `S`/`F`. 그룹 행 이름(이 순서): `전체`, `W2 cut`, `W3 applied`, `layout same-same`, `layout same-other`, `layout below-same`, `layout below-other`, `ans same`, `ans below`, `dec same`, `dec other`, `form table`, `form cards`, `doctype lecture`, `doctype exhibit`, `doctype meeting`, `qtype time`, `qtype count`, `qtype pages`, 그다음 `W3 <사유>` 10개(4.2절 순서).

- `stages` — `| 항목 | 쪽수 |`. 행: 등록 쪽, 기술 오류, 정상 처리(미매치 포함), 정상 미매치, K0 매치, 한글 매치, W1 widened, W1 not_wider, W1 no_candidate, W1 k0_branch, W2 cut, W2 no_cut, W2 hit_outside_w1, W2 inherit, 그다음 `W3 <사유>` 10개.
- `groups` — `| 그룹 | n | 오류 | 미매치 | 매치 | W1 엄격 | W2 엄격 | W3 엄격 | W2 cut | W3 적용 | L2 손실/W1 성공 | L3 손실/W1 성공 | L3 원본 | 예방/L2 | 공통 기회 | 기회 원본 | W2 사건 | W3 사건 | W3 사건 원본 | W3 유지/W2 사건 | 회복 W2(전체쪽) | 회복 W3(전체쪽) |`. 칸: `n, error, unmatched, matched, strict.w1, strict.w2, strict.w3, cut, applied, "L2.count/L2.denom", "L3.count/L3.denom", L3.sources, "prevented.count/prevented.of", opportunity.count, opportunity.sources, event2.count, event3.count, event3.sources, "keptEvents.count/keptEvents.of", "t12.recovered (recoveredFullPage.t12)", "t13.recovered (recoveredFullPage.t13)"`.
- `reasons` — `| 그룹 | not_applicable | qtype_none | qtype_multiple | no_valid_hit_word | no_candidate | multiple_candidates | candidate_outside_w2 | applied | error | unmatched |`. 그룹 행은 `groups`와 같다. 칸은 `w3Reason`의 해당 수.
- `candidates` — `| 그룹 | 유일 후보 쪽 | 목표 값 | 의도 방해 | 타 레코드 값 | 기타/모호 | 적용 중 목표 값 | 적용 중 의도 방해 | 적용 중 타 레코드 값 | 적용 중 기타/모호 |`. 그룹 행은 `groups`와 같다. 첫 칸 = 네 분류의 합.
- `others` — `| 그룹 | W1 완전 값(쪽) | W1 완전→W2 완전/일부/전혀 | W1 완전→W3 완전/일부/전혀 | W2 전혀≥1 쪽 | W3 전혀≥1 쪽 | W3 일부≥1 쪽 | W3 새 완전 |`. 칸: `"itemsW1Full (pagesW1Full)"`, `"f/p/n"` 둘, `pagesW1FullToNone2`, `pagesW1FullToNone3`, `pagesW1FullToPartial3`, `newlyFullW3`.
- `area` — `| 그룹 | 유효 쌍 | W2 평균 %p | W2 중앙 %p | W2 최대 %p | W3 평균 %p | W3 중앙 %p | W3 최대 %p | W3 적용 쪽 | 적용 평균 %p | 적용 중앙 %p | 적용 최대 %p |`.
- `verdict` — `| 그룹 | W3 손실 판정 | W2 손실 판정 | 예방 판정 | 제거 판정 |`. 행: `전체`와 `layout` 4개.
- `sources` — `| 원본 | 양식 | 유형 | 목표 슬롯 | same-same | same-other | below-same | below-other |`. 행: 12개 원본(design 순서). 배치 칸 문자열 = 오류면 `error`, 미매치면 `unmatched`, 아니면 `"{W1 S/F}{W2 S/F}{W3 S/F} {w3Reason} c{candidateCount 또는 -} {uniqueClass 약어 또는 -} {w1Full}→{w3Full}"`에 `fromW1Full3None > 0`이면 `" none{n}"`을 붙인다. 약어: `target_value → T`, `intended_decoy → D`, `other_record_value → O`, `other_or_ambiguous → X`.

## 11. 손계산 예제

`example/example.json`이 W3·노출·분류·예측 검증·채점·집계의 손계산 예제다. 각 사례의 `why`가 계산 과정이다. 묶음:

- `squash` / `qtypes` / `grammar`: 공백 종류, NFKC 전각, `몇시간`의 부분 문자열, 유형 없음·복수, 시각 범위(`24:00`, `23:59`, `7:5`, `07:30`, `0:00`), 선행 0, 네 자리, 단위 누락.
- `w3`: 4.2–4.3절 모든 분기와 경계. 공통 표지 단어 반례(서로 다른 h가 각 단어를 지지 → 탈락, 합집합 상자였다면 통과), 같은 높이 두 h가 한 구간을 지지(한 번만 셈), 닿음 허용과 1px 겹침 거부, 정확히 절반 겹침 허용과 0.4999 거부, 부동소수점이면 틀리는 `0.1 + 0.2` 경계, 분할 숫자·단위와 간격 경계, 역순, 빈 단어·0 너비 단어의 구간 끊기, 무효 히트 제외와 하나만 남은 H, H 전부 무효(`no_valid_hit_word`), 같은 텍스트 두 위치, 겹친 후보, 후보 창 밖(1px), 완전 포함(변과 같음), 해당 없음, 오류·미매치.
- `exposure`, `classify`(셀 중심과 잉크 교집합, 셀 경계의 반열림, 두 단어가 다른 셀, 교집합 0), `predictionInvalid`, `scoring`(목표 적용·의도 방해 적용 손실·W2 손실 예방·다중 보류·해당 없음·오류·미매치·전체 페이지 회복)과 그 집계.
