# 독립 Python 검산기 명세 — ko-ocr-factorial

검산 작성자에게 주는 명세다. 규칙의 근거는 프로토콜 `research/plans/2026-11-24-ko-ocr-factorial-protocol.md`이고, 이 문서는 파일 위치·필드·직렬화를 정한다. 검산 작성자는 `research/src/ko-ocr-factorial-*.mjs`(연구 작성자의 JS)를 읽지 않는다. 고정 선택기 `research/src/selector.mjs`(blob `b3b4965b…`)는 K0의 기준 명세이므로 읽어도 된다.

## 1. 실행

```sh
cd research
python tools/ko-ocr-factorial/recount.py --run results/ko-ocr-factorial/run-a --score results/ko-ocr-factorial/score-a --out <new json path>
python -m unittest tools/ko-ocr-factorial/test_recount.py
```

- 표준 라이브러리만 쓴다. Git 객체는 `git cat-file blob <id>`, `git rev-parse <commit>:<path>`, `git ls-tree <tree>`로 읽는다(작업 사본 파일 아님). 저장소 루트는 `git rev-parse --show-toplevel`.
- 모든 대조가 맞으면 종료 0, 하나라도 다르면 종료 1, 입력 자체를 읽을 수 없으면 종료 2. `--out` JSON에 항목별 결과(`ok`, 불일치 목록 최대 20개)를 쓴다.

## 2. 입력

| 파일 | 내용 |
|---|---|
| `results/ko-ocr-factorial/cohort.jsonl` | 96행 `{dataset, id, baselineMatched}`. CRLF→LF 정규화 뒤 SHA-256 `86ccac534bacaeb6b4ca463fe7f5de41a5b33f68cc534f2002c417e35e6b2eb3` |
| `<run>/freeze.json` | `{hashBasis, files: {"predictions.jsonl": sha256, "ocr.jsonl": sha256}}` (원바이트) |
| `<run>/predictions.jsonl` | 192행, 아래 §3 |
| `<run>/ocr.jsonl` | 192행 `{ocr, dataset, id, status, ocrLines}`; `ocrLines`는 `[{text, confidence, box:[x,y,w,h], words:[{text, box}]}]` 또는 null |
| `<score>/score.jsonl`, `history.jsonl`, `summary.json` | 검산 대상, 아래 §4–§6 |

Git 객체(프로토콜 §3.1 표의 blob/tree ID를 그대로 대조): R09 질문·PNG tree·`design.json`(분류)·`gold.json`·run A `raw.jsonl`(과거), FCP 질문·PNG tree·`index.json`(분류, `sha256` 포함)·`gold.json`·run A `caller.jsonl`(과거), #146 `replay.jsonl`(blob `3f0564c2…`, 파일 SHA-256 `9510835d…0204`).

- 분류: R09 `design.json`의 `images[]`, FCP `index.json`의 `images[]` — `id, lang, anchor, page{width,height}`(FCP는 `sha256`도).
- 정답: `gold.json`의 `gold[id].parts[]` 두 개, 각 `rect=[l,t,r,b]`(반개방), `size=[r-l, b-t]`.
- 과거: 각 행 `{id, status, keys, matched, score, lineText, confidence, axisRow, band, ocrLines, ...}`.

## 3. predictions.jsonl

순서: O0의 96행(R09 48 → FCP 48, 각 자료는 명단 순서와 같음) 다음 O1의 96행. 행:

```
{ocr, dataset, id, pngSha256, width, height, status, error, ocrSha256, ocrLineCount, k0:{...}, k1:{...}}
```

- `pngSha256` = 고정 tree의 해당 PNG 원바이트 SHA-256(파일 이름은 질문 파일의 `file`).
- `ocrSha256` = `ocr.jsonl` 같은 행 `ocrLines`를 JS `JSON.stringify`(공백 없음, 키 순서 유지, 숫자는 JS 표기)한 UTF-8의 SHA-256. Python에서는 원 줄 텍스트에서 `ocrLines` 부분 문자열을 다시 직렬화하지 말고, 같은 의미의 JS 직렬화를 재현하거나(정수형 실수 `1.0`→`1`, 지수 표기 주의) 대조 불가 시 그 사실을 보고한다.
- 키 결과 객체(필드 순서 고정): `status, error, branch, keys, hangulKeys, matched, score, lineIndex, lineText, confidence, axisRow, lineBox, anchor, hitWords, band`.
  - K0: 고정 `selectWindow` 결과. `branch:"k0"`, `hangulKeys:null`, `anchor:null`, `hitWords:null`. 미매치면 `score:0`, 나머지 선택 필드 null. 매치면 `lineIndex`는 각 줄 단독 `selectWindow([line])`의 점수(없으면 0)로 "점수 큼 → 원시 confidence 엄격히 큼 → 앞선 줄" 규칙으로 찾은 줄, `lineBox`는 그 줄 `box`, `lineText`·`confidence`(반올림)·`axisRow`·`band`는 `selectWindow` 반환값.
  - K1: 프로토콜 §4.2. `hangulKeys` = 질문의 두 음절 집합(정렬 목록, 항상 채움). 분기 `k0`(K0 결과 그대로 + hangulKeys), `none`(미매치, `keys`=K0 keys, `score:0`), `hangul`(`keys`=K0 keys, `score`=서로 다른 질문 조합 수, `lineIndex`, `lineText`, `confidence`=JS `Math.round`, `axisRow`, `lineBox`, `anchor=[x,y,w,h]`, `hitWords`=단어 번호 오름차순, `band`).
  - 오류: `status:"error"`, `error` 문자열. K0 오류면 K1도 `status:"error"`, `branch:"k0"`, `error:"k0: <K0 error>"`. 입력 검증 실패면 두 키 모두 `error:"input_validation"`, 행 `status:"error"`, 행 `error:"input_validation: <사유>"`.
- 정렬: JS 기본 정렬(UTF-16 코드 단위 순). 한글 음절만 들어가므로 코드 포인트 순과 같다.

## 4. score.jsonl

순서: 조건 `O0K0, O0K1, O1K0, O1K1` 각각 명단 96행 순서. 행(필드 순서 고정):

```
{cond, dataset, id, cell, cohort, baselineMatched, baselineStrict, baselineEvidence, branch, state, matched, fallback, strict, evidence, fullPage, error}
```

- `cell` = `"<lang>/<anchor>"`, `cohort` = `primary`(기준 미매치) / `control`(기준 매치).
- `baselineStrict`·`baselineEvidence`: 과거 run A 행의 `status, matched, band`를 아래 판정에 넣은 결과.
- 판정(키 결과 `kr`, 페이지 치수는 분류의 `page`, 정답 두 rect):
  - `kr.status != "ok"` 또는 예측 행 `status != "ok"` → `state:"technical_error", matched:null, fallback:null, strict:false, evidence:null, fullPage:null`
  - 미매치 → `state:"unmatched", matched:false, fallback:true, strict:false, evidence:null, fullPage:null`
  - 매치 → 포함 수 n(`l ≥ left && t ≥ top && r ≤ left+width && b ≤ top+height`), `evidence` = `all`(n=2)/`partial`/`none`, `fullPage` = `width·height ≥ W·H`, `strict` = `0 < width·height < W·H && evidence=="all"`, `state` = `matched_strict`/`matched_not_strict`, `matched:true, fallback:false`.
- `branch` = 키 결과 `branch`, `error` = 정상이면 null, 아니면 키 결과 `error`(없으면 예측 행 `error`).

## 5. history.jsonl (O0K0 대 과거 run A, 명단 순서 96행)

```
{dataset, id, selectionSame, diff, ocrIdentical, baselineStrict, nowStrict, strictSame}
```

- `diff`: 예측 행과 K0가 모두 정상이면 `keys, matched, score, lineText, confidence, axisRow, band` 중 값이 다른 필드 이름 목록(없는 값은 null로 보고 비교), 아니면 `["technical_error"]`. `selectionSame` = `diff`가 빈 목록.
- `ocrIdentical` = O0 `ocrLines`와 과거 `ocrLines`의 완전 일치(구조·값).
- `nowStrict` = O0K0 score 행의 `strict`. `strictSame` = `baselineStrict == nowStrict` 이고 O0K0 상태가 `technical_error`가 아님.

## 6. summary.json

`pct(c, n)` = n > 0이면 `Math.round(c·10000/n)/100`(JS 반올림: x.5는 +∞ 방향), n = 0이면 null.

- `inputs`: `predictionsSha256`, `ocrSha256`(freeze 값), `cohortSha256`(명단 96행을 `JSON.stringify` 줄 + LF로 다시 쓴 바이트의 SHA-256 = 등록값), `replayBlob`.
- `denominators`: `pages` 96, `primary`, `control`, `baselineStrictControl`(대조 집단 중 기준 엄격 성공 수).
- `baseline.{r09,fcp,total}`: `n, matched, strictAmongMatched, strictAmongUnmatched, strict`; `registeredExpectation` 상수 `{strictAmongMatched:70, r09:35, fcp:35}`.
- `history.{r09,fcp,total}`: `n, selectionSame, ocrIdentical, strictSame`(참인 행 수).
- `ocrLineTextDiff`: O0·O1 두 행 모두 `ocrLines`가 있는 페이지 수 `compared`, 그중 줄 `text` 목록이 다른 페이지 수 `differ`.
- `k1Branches.{O0,O1}.{r09,fcp,total}`: `{k0, hangul, none, error}` — 예측 행과 K1이 모두 정상이면 K1 `branch`, 아니면 `error`.
- `conditions.<cond>.{r09,fcp,total}` 블록(해당 조건·자료의 score 행 집합):
  - `n, technicalError, matched(matched==true), unmatched(state unmatched), strict, strictPct`
  - `primary`: `n, technicalError, matched, strict, matchedOnly(state matched_not_strict), evidencePartial, evidenceNone, unmatched, matchedPct, strictPct`
  - `control`: `n, technicalError, matchedToUnmatched(state unmatched), stillMatched(matched==true), baselineStrict, strictToFail(기준 엄격 성공 중 state unmatched 또는 matched_not_strict), strictToFailUnmatched, matchedKeptLostEvidence(기준 엄격 성공 중 matched_not_strict), strictTechnicalError(기준 엄격 성공 중 오류), baselineNotStrict, newStrict(기준 비엄격 중 strict), strict, matchedToUnmatchedPct, strictToFailPct(분모 baselineStrict)`
  - `byCell.<lang/anchor>`(키 사전순): `n, technicalError, matched(오류·미매치가 아닌 행), unmatched, strict`
- `pairs."<from>-><to>"`(쌍: `O0K0->O0K1`, `O1K0->O1K1`, `O0K0->O1K0`, `O0K1->O1K1`, `O0K0->O1K1`) `.{primary,control,total}.{strict,matched}`: `to` 조건의 행마다 같은 (자료, ID)의 `from` 행과 짝지어 `n`, 어느 한쪽이 오류면 `technicalError`, 아니면 x=from, y=to(엄격 성공 또는 `matched==true`)로 `both, fromOnly, toOnly, neither`.
- `interaction.<metric>`(지표: `matchRecovery`=primary.matched/primary.n, `strictRecovery`=primary.strict/primary.n, `matchedToUnmatched`=control.matchedToUnmatched/control.n(손실), `strictToFail`=control.strictToFail/control.baselineStrict(손실), `totalStrict`=strict/n; 모두 `total` 블록):
  - `direction` 문자열(성공 지표: `"count is a success; positive effect = improvement"`, 손실 지표: `"count is a loss; effects use the negated count, positive = improvement"`)
  - `raw.<cond>` = `{count, denom, pct}`(조건별 분모). 지표 수준 키 `denom` = 네 조건 `raw.<cond>.denom`이 모두 같으면 그 값, 아니면 null (검산 첫 실행 뒤 이 문장을 명확히 했다: 처음 문장은 지표 수준 `denom` 키의 존재를 분명히 적지 않았다)
  - v(c) = 성공 지표는 count, 손실 지표는 −count. `kAtO0` = v(O0K1)−v(O0K0), `kAtO1` = v(O1K1)−v(O1K0), `oAtK0` = v(O1K0)−v(O0K0), `oAtK1` = v(O1K1)−v(O0K1), `interaction` = (v(O1K1)−v(O1K0))−(v(O0K1)−v(O0K0)); 각 `{count, pp: pct(count, denom)}`(denom null이면 pp null)
  - `technicalErrors` = 네 조건의 그 지표 분모 안 오류 수 합(`primary.technicalError`, `control.technicalError`, `control.strictTechnicalError`, 전체 `technicalError` 중 해당), `qualified` = 그 합 > 0.
- JSON 직렬화: `JSON.stringify(obj, null, 1)` + LF. 검산기는 바이트가 아니라 파싱한 값으로 대조한다(정수·실수 값 동일, 키 집합 동일).

## 7. 검산기 시험(test_recount.py, 손으로 만든 입력)

두 음절 표현(NFC/NFD, 반복 음절, 중복, 라틴·문장부호·숫자 경계, 단어 경계), K1 동점(점수 → 신뢰도 → 줄 순서), 중복 두 음절이 한 번만 세짐, K0 매치 시 라틴 키 보존(K1 = K0), 앵커 합집합, 창 경계(반개방, 여유 0, 전체 페이지 창 제외), 근거 all/partial/none, 오매치·근거 누락, 두 자료 같은 ID 구분, 오류 행·빈 분모(pct null), 교호 대비 부호, 언어 파일 누락 기록(`guard-summary.json`의 `langFiles`가 eng·kor 두 개, 각 SHA·크기 = 프로토콜 §4.1), 예측·채점·요약 변조 검출(한 값 바꾸면 종료 1).
