# 독립 검산 명세 — ko-row-window

제3자가 이 문서, 고정 선택기 `research/src/selector.mjs`(함수 `tokens`, `keywords`, `score`, `selectWindow`), 손계산 예제 `example/example.json`, 아래 원자료만으로 검산기를 쓸 수 있도록 적은 공개 명세다. 연구 JS 코드(`research/src/ko-row-window-*.mjs`), 시험 파일, 다른 연구 폴더는 읽지 않아도 된다. 공동 JS 함수를 가져오지 않고 독자적으로 계산한다.

## 0. 산출물과 실행

- `research/tools/ko-row-window/recount.py` — Python 3.12 **표준 라이브러리만**.
  `python recount.py --data <data dir> --ocr <ocr dir> --replay <replay dir> --score <score dir> --out <recount.json>`
  모든 검사를 통과하면 종료 0, 하나라도 어긋나면 종료 1. 입력이 손상돼 계산을 시작할 수 없으면 종료 2.
- `research/tools/ko-row-window/test_recount.py` — `unittest`. 손계산 예제(5절) 전체와 경계를 시험한다.
- 모듈 함수(시험이 부른다): `w1_rule(lines, k1, width, height)`, `same_row_right(h, c)`, `is_blank(text)`, `score_page(pred, page)`, `summarize_scores(rows, page_area)`, `check_id_set(rows, ids)`, `diff_rows(a, b)`, 예외 `ValidationError`. 반환 형식은 예제의 `expect`와 같다.

## 1. 입력

- `<data dir>` = `research/results/ko-row-window/data/`: `manifest.json`(`files: {상대경로: {sha256, bytes}}`), `questions.json`(`questions: [{id, file, question}]`), `design.json`, `gold.json`, `render.json`, `images/*.png`.
- `<ocr dir>`: `freeze.json`(`files: {"ocr.jsonl": sha256, "k1.jsonl": sha256}`), `ocr.jsonl`, `k1.jsonl`. 모두 48행, 질문 순서.
  - `ocr.jsonl` 행: `id, pngSha256, width, height, status ("ok"|"error"), error, ocrSha256, ocrLineCount, ocrLines`. `ocrLines` = 줄 배열 `{text, confidence, box: [x, y, w, h], words: [{text, box}]}`(원본 이미지 픽셀, 실수).
  - `k1.jsonl` 행: `id, status, error, k1`. `k1` = 고정 #147 `keyResults(...).k1` 그대로: `status, error, branch ("k0"|"hangul"|"none"), keys, hangulKeys, matched, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor, hitWords, band {left, top, width, height}`.
- `<replay dir>`: `freeze.json`(`files: {"predictions.jsonl": sha256}`), `predictions.jsonl` 48행.
- `<score dir>`: `score.jsonl` 48행, `summary.json`.
- JSONL은 한 줄에 JSON 하나, LF, 마지막 줄 바꿈 하나. CR이 있거나 빈 줄이 있으면 손상(종료 2).

## 2. 검사 1 — 해시, ID, 자료

1. `manifest.json`의 모든 파일이 있고 SHA-256·크기가 같으며, 목록 밖 파일이 없다(`manifest.json` 자신 제외).
2. 두 `freeze.json`의 해시 = 해당 파일 원바이트 SHA-256.
3. **ID 집합:** `design.json["images"]`, `questions.json`, `ocr.jsonl`, `k1.jsonl`, `predictions.jsonl`, `score.jsonl`의 ID 목록이 모두 48개, 중복 없음, **같은 순서**다. 하나라도 중복·누락·추가·순서 차이가 있으면 `ValidationError`(검증 실패, 종료 1).
4. 골드: `gold.json["gold"][id]["parts"]` 정확히 2개(첫째 `item` = `anchorItem`, 둘째 = `valueItem`), `rect = [l, t, r, b]` 정수, `0 ≤ l < r ≤ 1280`, `0 ≤ t < b ≤ 960`, `size = [r−l, b−t]`, 그리고 `render.json`의 같은 item `ink`와 같다. 두 상자는 서로 겹치지 않는다(양의 면적 교집합 없음). 각 상자는 design의 그 item `cell` 안에 있다.
5. PNG를 직접 해독한다(zlib, 8비트 그레이스케일, 비인터레이스, 필터 0–4). 크기 1280 × 960. `ocr.jsonl`의 `pngSha256`·`width`·`height`가 PNG와 같다. 각 골드 상자 네 가장자리 줄(윗줄 `t`, 아랫줄 `b−1`, 왼쪽 열 `l`, 오른쪽 열 `r−1`)마다 상자 안에서 값 < 255인 픽셀이 하나 이상 있다.

## 3. 검사 2 — K1 재계산과 W0·W1 (ocr → k1 → predictions)

- OCR 행 `status != "ok"`이면 재계산하지 않고, k1 행·예측 행이 오류이며 예측 `w0`, `w1`이 `null`인지 본다.
- **입력 검증**: 각 줄 `text` 문자열, `confidence` 유한수, `box` 유한수 4개, `words` 배열, 각 단어 `text` 문자열·`box` 유한수 4개. 실패하면 k1 `status: "error"`, `error: "input_validation"`.
- **K0** = `selectWindow(lines, question, W, H)`(선택기 원문을 옮긴다: `toLowerCase` → `[^a-z0-9\- ]`을 공백으로 → 공백 분리, 키워드 길이 ≥ 3·불용어 제외·`off`/`yes` 제외, 줄 점수, 동점은 신뢰도 엄격히 큼, 앵커·창, `Math.round`는 JS 의미(.5는 +∞ 방향), 단어 길이는 UTF-16 길이). 이번 48쪽 질문에는 ASCII 영숫자가 없어 K0는 항상 정상 미매치여야 한다(등록 조건). 매치가 나오면 그대로 재계산해 대조한다.
- **K1** = K0가 정상 매치이면 K0 결과(`branch: "k0"`). K0가 정상 미매치이면 한글 보조:
  - `bigrams(s)`: NFC → 현대 한글 음절 `[가-힣]+`의 최대 연속 구간 → 구간 안 인접 두 음절 → 집합. 질문 집합 Q. Q가 비면 미매치(`branch: "none"`).
  - 줄 점수 = |Q ∩ (그 줄 각 단어 `text`의 bigrams 합집합)|. 양수 최댓값 줄, 동점은 원시 `confidence` 엄격히 큼, 그다음 앞 줄. 양수 줄이 없으면 미매치(`none`).
  - `hitWords` = 선택 줄에서 bigrams ∩ Q ≠ ∅인 단어 번호(오름차순). 앵커 = 그 단어 상자의 합집합 `[x0, y0, x1−x0, y1−y0]`(x0 = 최소 x, x1 = 최대 x+w).
  - 창(K0와 같은 식): `lh = max(8, line.box[3])`; 단어 평균 길이 `meanLen`(UTF-16), `axisRow = (단어 수 ≥ 8) ∧ (meanLen ≤ 4) ∧ (anchor.w < 0.25·line.box[2])`. axisRow이면 `half = max(1.5·anchor.w, 3·lh)`, `cx = anchor.x + anchor.w/2`, `x ∈ [cx−half, cx+half]`, `y ∈ [anchor.y − 0.75·H, anchor.y + anchor.h + 6·lh]`. 아니면 `x ∈ [min(anchor.x, line.x) − 4·lh, line.x + line.w + 8·lh]`, `y ∈ [line.y − 3·lh, line.y + line.h + 6·lh]`. 폭이 256보다 작으면 양쪽으로 반씩 늘리고 높이는 128까지 같은 방식. `left = max(0, floor(x0))`, `top = max(0, floor(y0))`, `right = min(W, ceil(x1))`, `bottom = min(H, ceil(y1))`. 창이 정수가 아니거나 페이지 밖·양이 아닌 크기이면 `status: "error"`, `invalid_output: band`.
  - 대조 필드: `status, matched, branch, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor, hitWords, band`.
- **W0** = K1 `band`(정상 매치일 때). **W1** = 4절 규칙. 예측 행 필드(`predictions.jsonl`): `id, pngSha256, ocrSha256, width, height, state ("error"|"unmatched"|"matched"), error, branch, lineIndex, hitWords, reason, w0, w1, candidates, maxRight, clippedRight, addedPixels`. 전부 대조한다.

## 4. W1 규칙 (등록 규칙, 프로토콜 4.4)

입력: 그 페이지 OCR `lines`, K1 기록 `k1`, 페이지 폭 `W`, 높이 `H`.

1. `k1.status != "ok"` → `reason "error"`, `w0 = w1 = null`, `candidates = maxRight = clippedRight = addedPixels = null`.
2. 정상 미매치 → `reason "unmatched"`, 위와 같이 모두 `null`.
3. 정상 매치이고 `branch != "hangul"` → `reason "k0_branch"`, `w1 = w0 = band`, `candidates/maxRight/clippedRight = null`, `addedPixels = 0`.
4. 한글 분기: 먼저 검증한다. 하나라도 어기면 `ValidationError`(페이지 오류가 아니라 과제 검증 실패).
   - `band`가 정수 4개, 양의 폭·높이, `0 ≤ left`, `0 ≤ top`, `left+width ≤ W`, `top+height ≤ H`.
   - `lineIndex`가 `0 ≤ i < len(lines)`인 정수, `lines[i].text == k1.lineText`.
   - `hitWords`가 비지 않은 정수 배열, 중복 없음, 각 `0 ≤ j < len(lines[i].words)`.
   - 모든 상자가 유한수 4개이고 `w ≥ 0`, `h ≥ 0`.
5. 상자 `[x, y, w, h]` → 반열림 사각형 `[x, y, x+w, y+h)`(실수 그대로, 반올림 없음).
6. **공백 단어 제외:** 단어 `text`를 NFC로 바꾸고 다음 공백 문자를 모두 지운 뒤 길이가 0이면 후보에서 뺀다: U+0009–U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF. 신뢰도 필터는 없다.
7. **같은 행의 오른쪽 후보:** 적중 단어 사각형 `h = [hl, ht, hr, hb)`, 후보 단어 사각형 `c = [cl, ct, cr, cb)`(전체 OCR의 모든 줄·모든 단어, 선택 줄 포함)에 대해
   `cl ≥ hr` 그리고 `ov = min(hb, cb) − max(ht, ct) > 0` 그리고 `ov ≥ 0.5 × min(hb − ht, cb − ct)`.
   비교는 실수로 한다. 적중 단어마다 계산해 합집합을 쓴다. 후보 목록 `candidates` = `[줄 번호, 단어 번호]` 쌍, 줄 번호 → 단어 번호 오름차순, 중복 없음.
8. 후보가 없으면 `reason "no_candidate"`, `candidates = []`, `maxRight = clippedRight = null`, `w1 = w0`, `addedPixels = 0`.
9. 후보가 있으면 `maxRight` = 후보 `cr`의 최댓값(실수), `clippedRight = min(W, ceil(maxRight))`. 새 오른쪽 끝 = `max(w0.left + w0.width, clippedRight)`. `w1 = {left: w0.left, top: w0.top, width: 새 오른쪽 끝 − w0.left, height: w0.height}`. 새 오른쪽 끝이 W0 오른쪽 끝보다 크면 `reason "widened"`, 아니면 `"not_wider"`. `addedPixels = (w1.width − w0.width) × w0.height`.
10. 왼쪽·위·아래·높이는 바꾸지 않는다. 여백·최대 거리·동일 줄 제한·무관 항목 제거·사후 예외는 없다.

## 5. 검사 3 — 행 판정 (score.jsonl)

- 정답 상자 = 그 페이지 골드 두 `rect`. 창 `[left, left+width) × [top, top+height)`.
- 창별(W0, W1) 상태: 예측 `state "error"` → `technical_error`; `"unmatched"` → `unmatched`; 매치 → 두 상자가 모두 창 안(`l ≥ left`, `t ≥ top`, `r ≤ left+width`, `b ≤ top+height`, 여유 0)이고 `0 < width·height < W·H`이면 `matched_strict`, 아니면 `matched_not_strict`.
- 창 기록 `{state, strict, evidence, fullPage, area}`: `strict` = `matched_strict`; `evidence` = 매치일 때 들어간 상자 수 2/1/0 → `all/partial/none`, 그 밖 `null`; `fullPage` = 매치일 때 `width·height ≥ W·H`, 그 밖 `null`; `area` = 매치일 때 `width·height`, 그 밖 `null`.
- `stage`: 예측 `state "error"` → `error`; `"unmatched"` → `unmatched`; 매치이고 `branch "hangul"` → `hangul`; 매치이고 그 밖 → `k0`.
- `transition`: W0 엄격 ∧ W1 엄격 → `keptSuccess`; W0 아님 ∧ W1 엄격 → `recovered`; W0 엄격 ∧ W1 아님 → `lost`; 그 밖 → `bothFail`. `error` = 예측 `state "error"`.
- `newInk`(매치일 때만, 아니면 `null`): `render.json`의 그 페이지 모든 item `ink`에 대해 W1 안에 완전히 들어가고 W0 안에는 완전히 들어가지 않는 item 수를 역할로 센다: `targetLabel`(= `anchorItem`), `targetValue`(= `valueItem`), `otherValues`(역할 `value`인 다른 item), `otherLabels`(역할 `label`인 다른 item), `notes`(역할 `note`), `headers`(역할 `header`), `others`(그 밖 역할: `title`, `other`).
- `score.jsonl` 행 필드: `id, doctype, form, vert, gap, case, stage, reason, w0, w1, transition, error, addedPixels, newInk`. 전부 대조한다.

## 6. 검사 4 — 집계 (summary.json)

- `stages` = `{pages, error, unmatched, k0Matched, hangulMatched, hangul: {hitsVerified, withCandidates, widened, notWider, noCandidate}}`. `hitsVerified` = 4절 검증을 통과한 한글 매치 페이지 수, `withCandidates` = 그중 `reason ∈ {widened, not_wider}`.
- `groups.total`과 `groups.vert.{inline, stacked}`, `groups.form.{table, cards}`, `groups.gap.{near, far}`, `groups.doctype.{exhibit, costume, lostfound}` 각각 블록:
  - `n, error, unmatched, matched`(stage가 `k0` 또는 `hangul`), `w0: {strict, fullPage}`, `w1: {strict, fullPage}`.
  - `transition: {recovered, lost, keptSuccess, bothFail, bothFailError, bothFailUnmatched}`.
  - `recoveredOfW0Fail: {count, denom, pct}` — denom = W0 엄격 아님 페이지 수(오류·미매치 포함), count = 그중 `recovered`. `lostOfW0Success: {count, denom, pct}` — denom = W0 엄격 수, count = `lost`.
  - `net` = recovered − lost, `widened` = `reason "widened"` 페이지 수.
  - `area`: 유효 쌍 = 매치 페이지. `validPairs, addedPixelsSum`(유효 쌍 `addedPixels` 합), `meanPp = r4(Σadded·100 / (validPairs·A))`, `medianPp = r4(median(added)·100 / A)`(짝수면 가운데 두 값의 평균), `maxPp = r4(max(added)·100 / A)`, `widenedPages`, `widenedMeanPp/widenedMedianPp/widenedMaxPp`(넓힌 페이지만, 같은 식), `perNewSuccess = r4(addedPixelsSum / recovered)`, `perNet = r4(addedPixelsSum / net)`, `perNetReason`. 분모가 0이면 `null`; `net ≤ 0`이면 `perNet = null`, `perNetReason = "net <= 0"`, 아니면 `perNetReason = null`. A = 페이지 면적(1280·960).
  - `newInk`: 위 7개 역할 수의 합 + `pagesWithOtherValue`(`otherValues > 0`인 페이지 수).
- `lists` = `{recovered, lost, lostFullPage, widened}`: 해당 페이지 ID, 질문 순서. `lostFullPage` = `lost` 중 W1 `fullPage`.
- `pct(c, n) = round(c·10000/n)/100`, `r4(x) = round(x·10000)/10000`(둘 다 JS `Math.round`: .5는 +∞ 방향), n = 0이면 `null`.

## 7. 검사 5 — 행 단위 변조 거부

- `diff_rows(a, b)`: 같은 ID 순서의 두 행 목록에서 필드 값(정규화 JSON)이 다른 행의 `{id, fields}` 목록. 검산기는 다시 계산한 행과 기록된 행을 이 함수로 비교하므로 주변합을 보존하는 행 교환도 해당 행이 지목된다.
- 실제 결과에는 `--mutate` 점검을 따로 돌린다: 기록 파일 사본에 (a) 회복 행과 실패 행의 `transition` 교환, (b) 두 행의 `addedPixels` 교환, (c) `newInk.otherValues` 이동, (d) ID 중복, (e) ID 누락을 넣고 각각 검산이 실패하는지 본다(`mutation.json`). 해당 사례가 실제 결과에 없으면(예: 회복 0) 그 변조는 `notApplicable`과 이유를 적는다.

## 8. 보고

`--out` JSON에 검사 1–5 각각 `ok`, 불일치 목록(최대 50개, ID·필드·두 값), 다시 계산한 `stages`, `groups.total`을 둔다. 확인할 수 없는 항목은 추측하지 말고 `unverifiable`과 이유를 적는다.

## 9. 손계산 예제

`example/example.json`: `w1` 9사례(경계 50%와 바로 아래, 왼쪽 접촉, 왼쪽 겹침, 행 접촉 0, 공백 단어, 별도 OCR 줄의 같은 행, 다중 히트, 무관한 먼 오른쪽 단어와 페이지 폭 clip, 올림, 넓히지 않음, 후보 없음, K0 분기, 미매치, 오류), `w1Invalid` 5사례(검증 실패), `scoring` 6쪽(회복, 유지, 전체 페이지로 확대한 기존 성공 손실, 미매치, 오류, K0 분기 실패)과 그 집계·0분모 그룹. 각 사례의 `why`가 계산 과정이다.
