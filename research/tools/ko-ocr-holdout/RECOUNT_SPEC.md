# 독립 검산 명세 — ko-ocr-holdout

검산 작성자가 받는 공개 명세다. 이 문서, 고정 선택기 `research/src/selector.mjs`(함수 `keywords`, `tokens`, `score`, `selectWindow`), 그리고 아래 원자료 파일만 읽는다. `research/src/ko-ocr-holdout-*.mjs`, `research/test/`, 다른 연구 폴더, Git 이력은 읽지 않는다.

## 산출물과 실행

- `research/tools/ko-ocr-holdout/recount.py` — Python 3.12 **표준 라이브러리만**.
  `python recount.py --data <data dir> --run <run dir> --baseline-run <run A dir> --score <score dir> --out <recount.json>`
  모든 검사를 통과하면 종료 0, 하나라도 어긋나면 종료 1. `--out`에 검사별 결과와 다시 계산한 집계를 JSON으로 쓴다(UTF-8, LF).
- `research/tools/ko-ocr-holdout/test_recount.py` — `unittest`. 아래 각 규칙의 경계(반개방 포함, 0분모, 오류 행, 동점, NFC, 변조)를 작은 가짜 입력으로 시험한다.

## 입력

- `<data dir>` = `research/results/ko-ocr-holdout/data/`: `manifest.json`(`files: {상대경로: {sha256, bytes}}`, `count`), `questions.json`, `design.json`, `gold.json`, `images/*.png`.
- `<run dir>`: `freeze.json`(`files: {"predictions.jsonl": sha256, "ocr.jsonl": sha256}`), `predictions.jsonl`, `ocr.jsonl`. 모든 JSONL은 한 줄에 JSON 하나, LF.
- `<score dir>`: `score.jsonl`, `summary.json`.
- `<baseline run dir>`: run A 폴더(run A 자체를 검산할 때는 `--run`과 같다).

## 검사 1 — 해시와 자료

1. `manifest.json`의 모든 파일이 있고 SHA-256·크기가 같으며, 목록 밖 파일이 없다(`manifest.json` 자신 제외). `count` = 항목 수.
2. 두 run 폴더의 `freeze.json` 해시 = 두 파일 원바이트 SHA-256.
3. `design.json["images"]` 96개, ID 유일. 순서가 `questions.json`과 같다.
4. 골드: `gold.json["gold"][id]["parts"]` 정확히 2개, 각 `rect = [l, t, r, b]` 정수, `l < r`, `t < b`, `size = [r−l, b−t]`, `0 ≤ l`, `r ≤ 1280`, `0 ≤ t`, `b ≤ 960`, 그리고 첫째 `item` = 그 페이지 `anchorItem`, 둘째 = `valueItem`.
5. PNG: 직접 해독한다(zlib, 8비트 그레이스케일, 비인터레이스, 필터 0–4). 크기 1280 × 960. 각 골드 상자의 네 가장자리 줄(윗줄 `t`, 아랫줄 `b−1`, 왼쪽 열 `l`, 오른쪽 열 `r−1`)마다 상자 안에서 값이 255보다 작은 픽셀이 하나 이상 있다.
6. `predictions.jsonl`의 각 행 `pngSha256` = 그 페이지 PNG 원바이트 SHA-256.

## 검사 2 — 키 결과 재계산 (ocr.jsonl → predictions.jsonl)

행 순서: `predictions.jsonl`, `ocr.jsonl` 모두 192행 = `ocr` 값 `O0` 96행(질문 순서) 다음 `O1` 96행. 행 키 `(ocr, id)`. `ocr.jsonl` 행: `ocr, dataset, id, status, ocrLines`. `predictions.jsonl` 행: `ocr, dataset, id, pngSha256, width, height, status, error, ocrSha256, ocrLineCount, k0, k1`.

- `status != "ok"`인 OCR 행은 재계산하지 않고, 예측 행의 `status`가 `"error"`이고 `k0.status`, `k1.status`가 모두 `"error"`인지만 본다.
- `ocrSha256` = JS `JSON.stringify(ocrLines)`의 UTF-8 SHA-256. Python에서는 `json.dumps(x, ensure_ascii=False, separators=(",", ":"))`가 같지만, **수**는 JS 표기를 따라야 한다: 정수값 실수는 `12`(not `12.0`), 그 밖은 가장 짧은 왕복 표기(`repr(float)`와 같되 지수 표기 규칙 차이 주의: JS는 `1e21` 이상·`1e-7` 미만에서 지수). 이 해시가 다르면 숫자 표기 문제인지 따로 보고한다.
- 입력 검증: 각 줄 `text` 문자열, `confidence` 유한수, `box` 유한수 4개, `words` 배열, 각 단어 `text` 문자열·`box` 유한수 4개. 실패하면 예측 `status: "error"`, 두 키 모두 오류여야 한다.
- **K0** = `selectWindow(lines, question, 1280, 960)`(선택기 원문을 Python으로 옮긴다; 토큰화 `toLowerCase` → `[^a-z0-9\- ]`를 공백으로 → 공백 분리, 키워드 길이 ≥ 3·불용어 제외·`off`/`yes` 제외, 줄 점수, 동점은 신뢰도 엄격히 큼, 앵커·창 계산, `Math.round`는 JS 의미(.5는 +∞ 방향)). 결과 필드 `matched, keys, score, lineText, confidence, axisRow, band{left, top, width, height}`.
  - 매치이면 `lineIndex` = 각 줄 하나만 넣은 `selectWindow([line], …)`의 점수로 다시 고른 줄 번호(점수 큼 → 원시 신뢰도 엄격히 큼 → 앞 줄). `lineBox` = 그 줄 `box`.
  - 미매치이면 `lineIndex, lineText, confidence, axisRow, lineBox, band`는 `null`, `score` 0.
- **K1** = K0가 정상 매치이면 K0 결과 그대로(`branch: "k0"`). K0가 정상 미매치이면 한글 보조 규칙:
  - `bigrams(s)`: NFC → 현대 한글 음절 `[가-힣]+`의 최대 연속 구간 → 구간 안 인접 두 음절(겹침) → 집합. 질문 집합 Q.
  - Q가 비면 미매치(`branch: "none"`). 줄 점수 = |Q ∩ (그 줄 각 단어 `text`의 bigrams 합집합)| (`line.text`는 쓰지 않는다). 양수 최댓값 줄, 동점은 원시 `confidence` 엄격히 큼, 그다음 앞 줄. 양수 줄이 없으면 미매치(`none`).
  - 적중 단어 `hitWords` = 선택 줄에서 bigrams ∩ Q ≠ ∅인 단어 번호(오름차순). 앵커 = 그 단어 상자 합집합 `[x, y, w, h]`.
  - 창은 K0와 같은 식(선택 줄, 이 앵커). `confidence = round(line.confidence)`(JS 반올림), `score` = 그 줄 점수, `lineIndex`, `lineText`, `lineBox`, `axisRow`, `band`, `anchor`, `hitWords`, `branch: "hangul"`.
- 대조 필드: K0 `status, matched, score, lineIndex, lineText, confidence, axisRow, band`; K1 그 필드 + `branch, anchor, hitWords`. 창이 정수가 아니거나 페이지 밖·양이 아닌 크기이면 그 키는 오류(`invalid_output`)여야 한다.

## 검사 3 — 행 판정 (score.jsonl)

- 조건 O0K0 = `O0` 행의 `k0`, O0K1 = `O0`의 `k1`, O1K0 = `O1`의 `k0`, O1K1 = `O1`의 `k1`. 예측 행 `status != "ok"`이면 그 행의 두 키 모두 기술 오류.
- 상태: 키 `status != "ok"` → `technical_error`; 미매치 → `unmatched`; 매치 → 창 `[left, left+width) × [top, top+height)`에 골드 두 상자가 모두 들어가면(`l ≥ left`, `t ≥ top`, `r ≤ left+width`, `b ≤ top+height`, 여유 0) 그리고 `0 < width·height < 1280·960`이면 `matched_strict`, 아니면 `matched_not_strict`.
- `evidence`: 매치 행에서 들어간 상자 수 2 → `all`, 1 → `partial`, 0 → `none`; 그 밖 `null`. `strict` = 상태가 `matched_strict`. `matched`: 오류 `null`, 미매치 `false`, 매치 `true`. `fullPage`: 매치 행에서 `width·height ≥ 1280·960`.
- `score.jsonl` 384행 = 조건 순서(O0K0, O0K1, O1K0, O1K1) × 질문 순서. 행 필드 중 `cond, id, state, matched, strict, evidence, fullPage, doctype, layout, cell`(`<lang>/<anchor>`), `primary`(ko/nl이면 true), `baselineGroup`, `baselineStrict`을 대조한다.

## 검사 4 — 기준 집단과 집계 (summary.json)

- 기준 집단은 `--baseline-run`의 O0K0 행 판정으로 정한다: 상태 `technical_error` → E, `unmatched` → M, 그 밖 → C. S = C 중 엄격 성공. M + C + E = 96, 주 집단(ko/nl 24쪽)도 합 24.
- `summary.json["baseline"]` = `{M, C, E, S, primary: {M, C, E, S}}`.
- `summary.json["conditions"][cond]`: `total`, `byDoctype`(repair, greenhouse, rental), `byLayout`(slip, intake), `byDoctypeLayout`(`<doctype>/<layout>` 6개), `byCell`(en/code, en/nl, ko/code, ko/nl). 각 블록 `{n, technicalError, matched, unmatched, strict, strictPct, evidenceAll, evidencePartial, evidenceNone, fullPage}`.
- `summary.json["primary"][cond]`(ko/nl 24쪽): `n, M, C, E` (기준 집단), `recoveredMatch`(M 중 지금 매치), `recoveredStrict`(M 중 지금 엄격), `recoveredErrors`(M 중 지금 오류), `strict, matched, unmatched, technicalError`, `recoveredMatchPct`(/M), `recoveredStrictPct`(/M), `strictPct`(/n).
- `summary.json["transitions"][cond]`(96쪽): `M, unmatchedToMatched, unmatchedToStrict, unmatchedErrors, C, matchedToUnmatched, matchedErrors, S, strictToFail`(S 중 지금 `unmatched` 또는 `matched_not_strict`), `strictErrors`, `notStrictC`(C − S), `newStrict`(C − S 중 지금 엄격), `E, baselineErrorNowStrict, lostStrictIds, newStrictIds, recoveredStrictIds`(M 중 지금 엄격; ID 목록은 사전순), 그리고 `unmatchedToMatchedPct`(/M), `unmatchedToStrictPct`(/M), `matchedToUnmatchedPct`(/C), `strictToFailPct`(/S), `newStrictPct`(/(C−S)).
- `summary.json["pairs"]["<from>-><to>"]["primary"|"total"]["strict"|"matched"]` = `{n, both, fromOnly, toOnly, neither, technicalError}`, 쌍은 O0K0→O0K1, O1K0→O1K1, O0K0→O1K0, O0K1→O1K1, O0K0→O1K1. 어느 쪽이든 오류면 `technicalError`로만 센다.
- `summary.json["k1Branches"][ocr]` = `{k0, hangul, none, error}`(예측 행 오류 또는 `k1.status` 오류 → error). `summary.json["ocrLineTextDiff"]` = 두 OCR 조건 모두 정상인 페이지 수 `compared`, 그중 줄 텍스트 목록이 다른 수 `differ`.
- **퍼센트:** `pct(c, n) = round(c·10000 / n) / 100`(JS `Math.round`, n = 0이면 `null`).

## 보고

`--out` JSON에 검사 1–4 각각 `ok`, 불일치 목록(최대 50개, 행 키와 두 값), 다시 계산한 `baseline`, 조건별 `total.strict`, `primary`, `transitions` 요약을 둔다. 확인할 수 없는 항목은 추측하지 말고 `unverifiable`과 이유를 적는다.
