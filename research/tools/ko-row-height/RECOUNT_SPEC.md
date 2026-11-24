# 독립 검산 명세 — ko-row-height

제3자가 이 문서, 고정 선택기 `research/src/selector.mjs`(함수 `tokens`, `keywords`, `score`, `selectWindow`), 손계산 예제 `example/example.json`, 아래 원자료만으로 검산기를 쓸 수 있도록 적은 공개 명세다. 연구 JS 코드(`research/src/ko-row-height-*.mjs`)와 다른 연구 폴더를 읽지 않아도 된다. 공동 JS 함수를 가져오지 않고 독자적으로 계산한다. 이 문서가 결과 스키마(예측·채점·집계·공개 표)의 정의다.

## 0. 산출물과 실행

- `research/tools/ko-row-height/recount.py` — Python 3.12 **표준 라이브러리만**.
  `python recount.py --data <data dir> --ocr <ocr dir> --replay <replay dir> --score <score dir> [--results <RESULTS.md>] --out <recount.json>`
  모든 검사를 통과하면 종료 0, 하나라도 어긋나면 종료 1, 입력이 손상돼 계산을 시작할 수 없으면 종료 2. `--mutate <mutation.json>`은 7절 변조 점검.
- `research/tools/ko-row-height/test_recount.py` — `unittest`. 손계산 예제(9절) 전체와 경계를 시험한다.
- 모듈 함수(시험이 부른다): `w1_rule(lines, k1, W, H)`, `w2_rule(lines, k1, W, H)`, `exposure(ink, band)`, `validate_prediction(pred)`, `score_page(pred, page)`, `summarize_scores(rows, page_area)`, `render_tables(summary, rows)`, `check_tables(markdown, summary, rows)`, `check_id_set(rows, ids)`, `diff_rows(a, b)`, 예외 `ValidationError`.

## 1. 입력

- `<data dir>` = `research/results/ko-row-height/data/`: `manifest.json`(`files: {상대경로: {sha256, bytes}}`), `selector/questions.json`(`questions: [{id, file, question}]`), `selector/images/*.png`, `scoring/design.json`, `scoring/gold.json`, `scoring/render.json`, `scoring/render-check.json`, `checks.json`.
- `design.json["images"]` 행: `id, source, doctype, form, content, vert, space, file, page {width, height}, slot, records [{slot, labelItem, valueItem, noteItem, block}], neighbors, question, answer, label, field, anchorItem, valueItem, goldItems, otherValueItems, items [{id, role, record?, text, cell, size}], rules, serial`. `design.json["sources"]`는 12개 원본의 텍스트.
- `<ocr dir>`: `freeze.json`(`files: {"ocr.jsonl", "k1.jsonl"}` 원바이트 SHA-256), `ocr.jsonl`, `k1.jsonl`(각 48행, 질문 순서).
  - `ocr.jsonl` 행: `id, pngSha256, width, height, status ("ok"|"error"), error, ocrSha256, ocrLineCount, ocrLines`. `ocrLines` = `{text, confidence, box: [x, y, w, h], words: [{text, box}]}`(원본 픽셀, 실수).
  - `k1.jsonl` 행: `id, status, error, k1`. `k1` = 고정 #147 `keyResults(...).k1`: `status, error, branch ("k0"|"hangul"|"none"), keys, hangulKeys, matched, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor, hitWords, band {left, top, width, height}`.
- `<replay dir>`: `freeze.json`(`files: {"predictions.jsonl"}`), `predictions.jsonl` 48행, `inputs.json`.
- `<score dir>`: `score.jsonl` 48행, `summary.json`.
- JSONL은 한 줄에 JSON 하나, LF, 마지막 줄 바꿈 하나. CR이나 빈 줄이 있으면 손상(종료 2).

## 2. 검사 1 — 해시, ID, 자료, 짝

1. `manifest.json`의 모든 파일이 있고 SHA-256·크기가 같으며, 목록 밖 파일이 없다(`manifest.json` 자신 제외).
2. 두 `freeze.json`의 해시 = 해당 파일 원바이트 SHA-256.
3. **ID 집합:** `design.json["images"]`, `questions.json`, `ocr.jsonl`, `k1.jsonl`, `predictions.jsonl`, `score.jsonl`의 ID 목록이 모두 48개, 중복 없음, **같은 순서**. 어긋나면 `ValidationError`.
4. 골드: `gold.json["gold"][id]["parts"]` 정확히 2개(첫째 `item` = `anchorItem`, 둘째 = `valueItem`), `rect = [l, t, r, b]` 정수, `0 ≤ l < r ≤ 1280`, `0 ≤ t < b ≤ 960`, `size = [r−l, b−t]`, `render.json`의 같은 item `ink`와 같음, 서로 겹치지 않음, 각 design `cell` 안.
5. PNG를 직접 해독한다(zlib, 8비트 그레이스케일, 비인터레이스, 필터 0–4). 크기 1280 × 960. `ocr.jsonl`의 `pngSha256`·`width`·`height`가 PNG와 같다. 골드 상자와 각 다른 값 잉크의 네 가장자리 줄마다 상자 안에 값 < 255인 픽셀이 있다.
6. **짝 대응:** 원본(`source`)마다 정확히 4쪽(`vert × space`)이고, 같은 질문·정답·`anchorItem`·`valueItem`·`otherValueItems`, 같은 item id·역할·텍스트, 같은 잉크 x 범위(`ink[0]`, `ink[2]`)와 잉크 높이(`ink[3] − ink[1]`)를 가진다. 정규화 질문(NFC, 양 끝 공백 제거, 내부 공백 연속을 하나로) 12개가 각 4회이며 한 원본의 4쪽에만 나온다.

## 3. 검사 2 — K1 재계산과 W0·W1·W2 (ocr → k1 → predictions)

- OCR 행 `status != "ok"`이면 K1을 재계산하지 않고 k1·예측 행이 오류이며 창이 `null`인지 본다.
- **K0/K1**은 #150 명세(`b108e2f:research/tools/ko-row-window/RECOUNT_SPEC.md` 3절)와 같다: 입력 검증 → K0 `selectWindow` 이식(질문에 ASCII 영숫자가 없어 정상 미매치) → 한글 보조(NFC 현대 한글 음절 연속 구간의 인접 두 음절 bigram, 줄 점수 = 질문 bigram과 공유하는 서로 다른 bigram 수, 양수 최댓값 줄, 동점은 원시 `confidence`가 엄격히 큰 줄, 그다음 앞 줄; `hitWords` = 선택 줄에서 질문 bigram을 하나라도 가진 단어 번호 오름차순; 앵커 = 히트 상자 합집합; 창은 고정 선택기와 같은 식). 대조 필드: `status, matched, branch, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor, hitWords, band`.
- **W0** = K1 `band`. **W1** = 고정 #150 W1 규칙(#150 명세 4절: 같은 행의 오른쪽 후보 `cl ≥ hr ∧ ov > 0 ∧ ov ≥ 0.5·min(높이)`, 공백 단어 제외, 후보 오른쪽 최댓값 올림·페이지 폭 제한, 새 오른쪽 = max(W0 오른쪽, 그 값); 사유 `error`/`unmatched`/`k0_branch`/`no_candidate`/`not_wider`/`widened`). **W2** = 4절.
- 예측 행 필드(이 순서): `id, pngSha256, ocrSha256, width, height, state ("error"|"unmatched"|"matched"), error, branch, lineIndex, hitWords, reason, w0, w1, candidates, maxRight, clippedRight, addedPixels, w2Reason, hitTop, hitBottom, pad, w2, cutPixels`. 전부 대조한다. `reason`은 W1 사유다.

## 4. W2 규칙 (등록 규칙, 프로토콜 4.4)

입력: OCR `lines`, K1 기록 `k1`, 페이지 폭 `W`, 높이 `H`. 먼저 W1 규칙을 실행한다(W1 검증 실패는 그대로 `ValidationError`).

1. W1 사유가 `widened`가 아니면 `w2Reason "inherit"`, `hitTop = hitBottom = pad = null`. 매치(`k0_branch`/`no_candidate`/`not_wider`)이면 `w2 = w1`(값 복사), `cutPixels = 0`. `unmatched`/`error`이면 `w2 = null`, `cutPixels = null`.
2. `widened`: 히트 = `k1.hitWords`의 모든 단어(선택 줄 `lines[k1.lineIndex].words[j]`). 검증(하나라도 어기면 `ValidationError`): 히트가 1개 이상, 정수·중복 없음·범위 안(W1에서 이미 검사), 각 상자 유한수 4개, **너비 > 0, 높이 > 0**.
3. 상자 `[x, y, w, h]` → `[x, y, x+w, y+h)`(실수 그대로). `hitTop = a = min(y)`, `hitBottom = b = max(y+h)`, `pad = h = median(높이들)`(정렬 후 홀수 개면 가운데, 짝수 개면 가운데 두 값의 산술평균).
4. 히트 하나라도 `y < w1.top` 또는 `y+h > w1.top + w1.height`이면 `w2Reason "hit_outside_w1"`, `w2 = w1`, `cutPixels = 0`. 변과 같으면 안쪽이다.
5. 아니면 `top = max(w1.top, floor(a − h))`, `bottom = min(w1.top + w1.height, ceil(b + h))`(실수로 빼고 더한 뒤 마지막에만 내림·올림). `w2 = {left: w1.left, top, width: w1.width, height: bottom − top}`. `top == w1.top`이고 `bottom == w1.top + w1.height`이면 `"no_cut"`, 아니면 `"cut"`. `cutPixels = (w1.height − w2.height) × w1.width`.
6. 사후 단언(어기면 `ValidationError`): `top < bottom`, `w2 ⊆ w1`, 같은 `left`·`width`, 모든 히트가 `[top, bottom)` 안에 세로로 완전히 있음.

## 5. 검사 3 — 예측 입력 검증과 행 판정 (score.jsonl)

### 5.1 채점 입력 검증 `validate_prediction(pred)` (어기면 `ValidationError`)

- `state "matched"`: `w0, w1, w2` 모두 정수 4개·양의 폭/높이·페이지 안. `w1`이 `w0`을 포함하고 `left, top, height`가 같음(W1 불변식). `w2.left == w1.left`, `w2.width == w1.width`, `w2.top ≥ w1.top`, `w2.top + w2.height ≤ w1.top + w1.height`, `w2.height > 0`. `w2Reason`: `reason != "widened"` ⇔ `"inherit"`; `"inherit"`·`"no_cut"`·`"hit_outside_w1"`이면 `w2 == w1`; `"cut"`이면 `w2 != w1`. `cutPixels == (w1.height − w2.height) × w1.width`. `cut`/`no_cut`이면 `hitTop ≥ w2.top`, `hitBottom ≤ w2.top + w2.height`.
- `state "unmatched"`/`"error"`: `w0 = w1 = w2 = null`, `cutPixels = null`, `w2Reason "inherit"`.

### 5.2 노출 분류 `exposure(ink, band)`

잉크 `[l, t, r, b)`, 창 `[L, T, L+w, T+h)`. `ix = min(r, L+w) − max(l, L)`, `iy = min(b, T+h) − max(t, T)`. 완전히 안(`l ≥ L ∧ t ≥ T ∧ r ≤ L+w ∧ b ≤ T+h`)이면 `"full"`, 아니고 `ix > 0 ∧ iy > 0`이면 `"partial"`, 그 밖(맞닿음 포함, 교집합 면적 0)은 `"none"`. 창이 `null`이면 `null`.

### 5.3 행

- 창 판정(W0/W1/W2 각각, #147 `scoreKey`): 예측 `state "error"` → `{state "technical_error", strict false, evidence null, fullPage null, area null}`; `"unmatched"` → `state "unmatched"`, 나머지 같음; 매치 → 두 골드 상자 포함 수 n(2/1/0 → `evidence "all"/"partial"/"none"`), `area = width·height`, `fullPage = area ≥ W·H`, `strict = 0 < area < W·H ∧ n = 2`, `state = strict ? "matched_strict" : "matched_not_strict"`.
- `stage`: `"error"`/`"unmatched"`/매치이고 `branch "hangul"` → `"hangul"`, 그 밖 매치 → `"k0"`.
- 전이 `t01`(W0 → W1), `t12`(W1 → W2): 앞 ∧ 뒤 엄격 → `"keptSuccess"`, 뒤만 → `"recovered"`, 앞만 → `"lost"`, 그 밖 → `"bothFail"`.
- `fullPageToPartial`: 매치일 때 `w1.fullPage ∧ ¬w2.fullPage`, 그 밖 `null`.
- `lostParts`: `t12 "lost"`일 때 W2 밖으로 나간 골드 순서대로의 이름 목록(`["label"]`, `["value"]`, `["label", "value"]`), 그 밖 `null`.
- `cutPixels`: 예측 값(매치일 때 정수, 그 밖 `null`).
- `others`(매치일 때, 그 밖 `null`): 다른 값 item = design `otherValueItems`(목표 외 레코드의 `value`, 순서 유지). `items = [{item, w0, w1, w2}]`(각 창의 노출 분류), `n = len(items)`, `w1 = {full, partial, none}`·`w2 = {full, partial, none}` 개수, `fromW1Full = {full, partial, none}` = W1에서 `full`인 item들의 W2 분류 개수.
- `jOpportunity` = `w1.strict ∧ w2Reason == "cut" ∧ others.w1.full ≥ 1`(매치 아니면 `false`). `jEvent` = `jOpportunity ∧ w2.strict ∧ others.fromW1Full.none ≥ 1`.
- `error` = 예측 `state "error"`.
- `score.jsonl` 행 필드(이 순서): `id, source, doctype, form, content, vert, space, slot, stage, reason, w2Reason, w0, w1, w2, t01, t12, fullPageToPartial, lostParts, cutPixels, others, jOpportunity, jEvent, error`.

## 6. 검사 4 — 집계 (summary.json)

- `stages = {pages, error, normal (= pages − error), unmatched, k0Matched, hangulMatched, w1Reason: {widened, notWider, noCandidate, k0Branch, unmatched, error}, w2Reason: {inherit, cut, noCut, hitOutside}}`.
- **그룹 블록**(행 목록 R, 페이지 면적 A). 매치 = `stage ∈ {k0, hangul}`.
  - `n, error, unmatched, matched`
  - `strict: {w0, w1, w2}`, `fullPage: {w0, w1, w2}`(값이 `true`인 수)
  - `t01`, `t12`: 각 `{recovered, lost, keptSuccess, bothFail}`
  - `L: {count = t12 lost 수, denom = w1 엄격 수, pct, sources}`; `J: {count = jEvent 수, opportunity = jOpportunity 수, pct = pct(count, opportunity), sources, opportunitySources}`. `sources`류는 해당 페이지들의 서로 다른 `source` 수.
  - `fullPageToPartial: {count, recovered (그중 t12 recovered)}`
  - `lostParts: {label, value, both}`(t12 lost 페이지의 `lostParts`가 표지만/값만/둘 다)
  - `widened`(W1 사유 widened 수), `cut`, `noCut`, `hitOutside`(W2 사유 수)
  - `others`: 매치 행만. `pagesW1Full`(W1 완전 ≥ 1인 쪽), `itemsW1Full`(Σ), `pagesW2Full`, `itemsW2Full`, `itemsW1Partial`, `itemsW2Partial`, `fromW1Full: {full, partial, none}`(Σ), `pagesReduced`(W2 완전 수 < W1 완전 수), `pagesReducedBothStrict`(그중 W1·W2 엄격), `pagesFullToPartialOnly`(fromW1Full.partial ≥ 1 ∧ none = 0), `pagesFullToNone`(none ≥ 1), `pagesFullToPartialAndNone`(partial ≥ 1 ∧ none ≥ 1), `newlyFullW2`(Σ 각 item W2 full ∧ W1 not full — 기하상 0), `newEvidenceW2`(Σ max(0, W2 evidence 포함 수 − W1 evidence 포함 수), all = 2·partial = 1·none = 0 — 기하상 0)
  - `area`: 유효 쌍 = 매치 행. `validPairs`, `cutPixelsSum`, `meanPp = r4(Σ·100/(validPairs·A))`, `medianPp = r4(median·100/A)`, `maxPp = r4(max·100/A)`, `cutPages`(W2 사유 cut 수), `cutPixelsSumCut`, `cutMeanPp`, `cutMedianPp`, `cutMaxPp`(cut 페이지만). 분모 0이면 `null`.
  - `sources`(서로 다른 원본 수)
  - `verdict: {loss, removal}`: `loss = L.count > 0 ? "loss" : "no_loss"`. `removal`: `widened = 0` → `"no_opportunity_widened"`; 아니고 `cut = 0` → `"no_opportunity_cut"`; 아니고 `J.opportunity = 0` → `"no_opportunity_denominator"`; 아니고 `J.count ≥ 1` → `J.sources ≥ 2 ? "observed_repeated_sources" : "observed_single_source"`; 그 밖 `"not_observed"`.
- `groups`: `total`; `w1Widened`(W1 widened 행); `cut`(W2 cut 행); `layout` = `{"same-narrow", "same-wide", "below-narrow", "below-wide"}`; `vert` = `{same, below}`; `space` = `{narrow, wide}`; `form` = `{table, cards}`; `doctype` = `{venue, proof, workshop}`; `w2Reason` = `{inherit, cut, no_cut, hit_outside_w1}`; `w1Reason` = `{widened, not_wider, no_candidate, k0_branch, unmatched, error}`; `source` = 12개 원본 ID(design 순서). 키 순서도 이와 같다.
- `lists = {t12Lost, t12Recovered, jEvent, jOpportunity, fullPageToPartial, cut, widened, t01Recovered, t01Lost, errors, unmatched}`: 페이지 ID, 질문 순서.
- `sourceTable = [{source, doctype, form, content, slot, cells: {"same-narrow", "same-wide", "below-narrow", "below-wide"}}]`(design 원본 순서). 칸 = `{id, stage, w1Reason, w2Reason, w1Strict, w2Strict, t12, w1Full, w2Full, fromW1FullPartial, fromW1FullNone, cutPp}`. 매치가 아니면 `w1Full`·`w2Full`·`fromW1Full*`·`cutPp`가 `null`. `cutPp = r4(cutPixels·100/A)`.
- `invariants = {checked (매치 수), w2InsideW1, sameLeftWidth, hitsInsideW2 (cut/no_cut 쪽에서 확인한 수), newlyFullW2, newEvidenceW2}`.
- `summary.json` = `{version, dataCommit, manifestSha256, predictionsSha256, pageArea, invariants, stages, groups, lists, sourceTable}`.
- `pct(c, n) = round(c·10000/n)/100`, `r4(x) = round(x·10000)/10000`(JS `Math.round`: .5는 +∞ 방향), n = 0이면 `null`. 중앙값은 짝수 개면 가운데 두 값의 평균.

## 7. 검사 5 — 행 단위 변조 거부

- `diff_rows(a, b)`: 같은 ID 순서의 두 행 목록에서 필드 값(정규화 JSON)이 다른 `{id, fields}`. 다시 계산한 행과 기록된 행을 이 함수로 비교하므로 주변합을 보존하는 행 교환도 해당 행이 지목된다.
- `--mutate`: 기록 사본에 (a) 두 페이지 `t12` 교환(주변합 보존), (b) 두 페이지 `cutPixels` 교환, (c) 다른 값 노출 한 개를 `partial`에서 `none`으로 바꾸고 다른 페이지의 `none`을 `partial`로(합 보존), (d) 예측 `w2.top` 1px 이동, (e) ID 중복, (f) ID 누락, (g) 골드 상자 1px 이동(정답 변조), (h) K1 `hitWords` 변조(선택 기록), (i) 공개 표 칸 하나 변조를 넣고 각각 검산이 실패하는지 본다(`mutation.json`). 해당 사례가 실제 결과에 없으면 `notApplicable`과 이유를 적는다.

## 8. 검사 6 — 공개 결과표 (RESULTS.md)

`RESULTS.md` 안의 표는 `<!-- krh:table NAME -->` 줄과 `<!-- /krh:table -->` 줄 사이에 있다. 검산기는 자기 계산으로 같은 표 문자열을 만들어 **칸 단위로** 비교한다(머리글 포함). 칸 문자열: 정수·실수는 JS `String(number)`, `null`은 `—`, 분수는 `a/b`, 참/거짓은 `S`/`F`. 표 정의:

- `stages` — 머리글 `| 항목 | 쪽수 |`. 행(이 순서): 등록 쪽=`pages`, 기술 오류=`error`, 정상 처리(미매치 포함)=`normal`, 정상 미매치=`unmatched`, K0 매치=`k0Matched`, 한글 매치=`hangulMatched`, W1 widened, W1 not_wider, W1 no_candidate, W1 k0_branch, W2 cut, W2 no_cut, W2 hit_outside_w1, W2 inherit.
- `groups` — 머리글 `| 그룹 | n | 오류 | 미매치 | 매치 | W0 엄격 | W1 엄격 | W2 엄격 | W1 widened | 세로 제한 | L 손실/W1 성공 | L 원본 | J/기회 | J 원본 | 기회 원본 | 전체→부분(회복) |`. 그룹 행(이 순서, 이름): `전체`, `W1 widened`, `세로 제한(cut)`, `layout same-narrow`, `layout same-wide`, `layout below-narrow`, `layout below-wide`, `vert same`, `vert below`, `space narrow`, `space wide`, `form table`, `form cards`, `doctype venue`, `doctype proof`, `doctype workshop`, `W2 inherit`, `W2 cut`, `W2 no_cut`, `W2 hit_outside_w1`, `W1 widened 사유`, `W1 not_wider`, `W1 no_candidate`, `W1 k0_branch`, `W1 unmatched`, `W1 error`. 칸: `n, error, unmatched, matched, strict.w0, strict.w1, strict.w2, widened, cut, "L.count/L.denom", L.sources, "J.count/J.opportunity", J.sources, J.opportunitySources, "fullPageToPartial.count (fullPageToPartial.recovered)"`.
- `others` — 머리글 `| 그룹 | W1 완전 값(쪽) | W2 완전 값(쪽) | W1 완전→W2 완전/일부/전혀 | 감소 쪽 | 감소∧둘 다 엄격 | 완전→일부만 | 완전→전혀≥1 | 둘 다 | W2 새 완전 |`. 그룹 행은 `groups`와 같다. 칸: `"itemsW1Full (pagesW1Full)"`, `"itemsW2Full (pagesW2Full)"`, `"full/partial/none"`, `pagesReduced`, `pagesReducedBothStrict`, `pagesFullToPartialOnly`, `pagesFullToNone`, `pagesFullToPartialAndNone`, `newlyFullW2`.
- `area` — 머리글 `| 그룹 | 유효 쌍 | 절감 픽셀 합 | 평균 %p | 중앙 %p | 최대 %p | 자른 쪽 | 자른 쪽 픽셀 합 | 자른 쪽 평균 %p | 자른 쪽 중앙 %p | 자른 쪽 최대 %p |`. 그룹 행은 `groups`와 같다.
- `verdict` — 머리글 `| 그룹 | 손실 판정 | 제거 판정 |`. 행: `전체`와 `layout` 4개. 칸은 `verdict.loss`, `verdict.removal` 코드 그대로.
- `sources` — 머리글 `| 원본 | 양식 | 목표 슬롯 | same-narrow | same-wide | below-narrow | below-wide |`. 행: 12개 원본(design 순서). 칸: 원본 ID, `form`, `slot`, 각 배치 칸 문자열 = 오류면 `error`, 미매치면 `unmatched`, 아니면 `"{W1 S/F}→{W2 S/F} {w2Reason 또는 inherit:<w1Reason>} {w1Full}→{w2Full}"`에 `fromW1FullNone > 0`이면 `" none{n}"`, `fromW1FullPartial > 0`이면 `" part{n}"`을 이 순서로 붙인다.

## 9. 손계산 예제

`example/example.json`: `w2` 13사례(W1 계산 포함; 1개 히트 양쪽 자름, 짝수 히트 중앙값 평균, 홀수 히트·위쪽 W1 클립, 아래 변과 같음·아래 W1 클립, 히트가 W1 위로 벗어남, 패딩이 양 변에 닿아 무변경, 소수 내림·올림, 상속 not_wider/no_candidate/k0_branch/unmatched/error, 넓히지 않은 페이지의 0 높이 히트), `w2Invalid` 6사례(0 높이·0 너비 히트가 있는 widened, 중복 히트, 범위 밖 인덱스, 유한하지 않은 상자, 줄 텍스트 불일치), `exposure` 6사례(맞닿음 3방향, 1px 일부, 완전, null 창), `predictionInvalid` 9사례(0 높이, W1 위로 벗어남, 왼쪽 이동, 폭 변경, cut인데 같은 창, 잘라낸 픽셀 불일치, 미매치에 창, widened인데 inherit, 히트가 W2 밖), `scoring` 6쪽(별도 줄 값 손실과 다른 레코드 제거 동시 포함)과 그 집계·0분모 그룹·목록. 각 사례의 `why`가 계산 과정이다.
