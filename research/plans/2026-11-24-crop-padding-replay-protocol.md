# 고정 자르기 여백에 따른 근거 포함과 면적: 실행 프로토콜

- 작성 2026-11-24. Tier E. 제품 기준 `origin/main` `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`(#143 병합)
- Orca Task `task_f7f071dfd4fd`. 연구 담당 Claude Code, PM Codex(Astra). #141 개선 후보 2
- 범위: 검토용 Draft PR까지. 실험 API 비용 0원. 외부 데이터 전송·신규 실험 API·의존성 추가·제품 변경·Ready·merge는 범위 밖이다. D04는 사용자 직접 송부 보류, O01·O02는 선행 대기 상태로 둔다
- 이 문서는 **실측 전에** 커밋한다. 버전·판정·실패·집계 규칙은 측정 전에 고정한다. 측정 전에 바꾸는 내용은 §15에 따로 적고, 측정 뒤의 변경은 사후 분석으로 표시한다
- 제품 코드, 원고, WBS, 기존 연구 파일(#141 포함)은 편집하지 않는다. 기존 파일은 import하거나 Git blob으로 읽기만 한다

## 1. 성격

이미 관측한 사례의 **탐색적 재생**이다.

- #141 영역 보기에서 부분 자르기 36건 중 한국어 카드 1건(`status-cards-code-s1-ko`)의 값 영역이 2px 잘렸다
- 전체 결과가 알려진 자료다. 확인적 검정, OCR·정답률·토큰·시간·비용 절감, 외부 일반화를 주장하지 않는다
- 제품 기본 여백을 정하지 않는다
- 해석은 "이 자료에서 관측한 2px 손실이 복구되는가, 그 대가로 페이지 면적을 얼마나 더 전달하는가"로 한정한다. 새 문서에서의 개선 근거가 아니다

## 2. 질문

같은 고정 호출자 좌표(R09 선택 기록)에 대칭 여백 p ∈ {0, 4, 8, 16} 원본 픽셀을 주고 현재 번들로 자를 때,

1. 실제로 전달된 영역이 모든 정답 근거 상자를 담는가
2. 그 대가로 페이지 면적 중 얼마를 전달하는가

## 3. 범위 밖

- 개요·OCR·선택기 재실행. 호출자 좌표가 이미 있다. #141에서 쓴 영역 보기 중 최종 요청/반환 기하만 비교한다
- 판독성, 모델 정답률, 토큰·바이트 절감, 시간
- 입력 표현(gray8, RGB)·프로필별 SHA 비교, 48행 반복 측정을 독립 표본으로 다루는 통계
- 크기 한도 초과 요청의 임의 축소·대체·재시도

## 4. 입력과 고정 blob

모든 텍스트 입력은 Git blob으로 읽는다(작업 사본 줄바꿈과 무관). 이미지 해시는 원바이트 SHA-256이다.

| 대상 | 경로(커밋) | Git blob |
|---|---|---|
| 번들 | `bin/token-context-optimizer.mjs` (`0fb3053`) | `85b804990bc192d32d75560df0567bdf5a876d0b` |
| 동결 검증 라이브러리 | `research/src/mcp-view-comparison-lib.mjs` (`0fb3053`) | `b52b38a1adcc1db1f36706291ab94e34f28a38a5` |
| 기존 비교 채점기 | `research/src/mcp-view-comparison-score.mjs` (`0fb3053`) | `b1aac9c78c499e3b0bfbae61fe707bafdc24b90b` |
| 정답 상자 | `research/results/r09-bilingual/heldout/gold.json` (`41fc769`) | `5d6c277d4c9cd55e4a101252fce8032294a21ae9` |
| #141 원시 기록 | `research/results/mcp-view-comparison/run-a/raw.jsonl` | `29729138f6344f8a869bfee1954c882fbfc6756b` |
| #141 채점 | `research/results/mcp-view-comparison/score-a/score.json` | `18502c11ef8c40579074919c0c1c77cb936f82ae` |
| #141 RGB 파생 manifest | `research/results/mcp-view-comparison/rgb-manifest.json` (`0fb3053`) | 실행 시 기록 |

- 실행 입력은 #141 준비기(`mcp-view-comparison-prepare.mjs --stage originals`)가 기준 커밋 `41fc769` blob에서 만든 폴더다. 회색조 원본 48장, 질문, 호출자 배정(매치 36, 미매치 12)이다
- 로컬에 이미 검증된 #141 입력 폴더를 읽기 전용으로 쓰거나, 같은 준비기로 새로 만든다. 어느 쪽이든 아래 §5 검사를 모두 다시 통과해야 한다. 로컬 절대경로는 저장소에 올리지 않는다
- 새 실행은 회색조 원본 PNG를 그대로 쓰고, 색인 프로필은 명시적 `tolerant`다(#143의 `png-gray8-tolerant-v1`)
- 측정에 쓴 실행 코드·채점기의 커밋은 결과 README에 기록한다

## 5. 실행 전 입력 검증

하나라도 실패하면 번들을 띄우기 전에 멈춘다. 입력 동결 실패는 실험 중단이다.

1. 동결 라이브러리 blob이 `b52b38a1…`이고, 그 `verifyFrozenInputs`로 배정(`base`, `caller`, `images` 투영)·질문 원바이트·원본 기대 SHA 표를 대조한다
2. 원본 SHA 표를 기준 커밋의 R09 `freeze-manifest.json` 항목별 값과 **개별** 대조한다(48개)
3. 입력 폴더의 원본 48장 원바이트 SHA가 표와 같다. 폴더에는 배정된 48개 파일만 있다
4. ID 48개, 중복 0, 결측 0. 한영 쌍 24개. 언어·앵커 분모(en·code, ko·code, en·nl, ko·nl 각 12)를 기록·확인한다
5. 질문 ID 순서가 배정 ID 순서와 같다
6. 좌표 타입·범위: 매치이면 `band`의 `left, top, width, height`가 정수, `left, top ≥ 0`, `width, height > 0`, `left+width ≤ W`, `top+height ≤ H`. 미매치이면 `band = null`
7. 원본 IHDR이 bit depth 8, color type 0, interlace 0이고 치수가 배정의 `page`와 같다
8. 번들 Git blob이 `85b80499…`다
9. 입력 경로 이름에 `gold`·`answer`·`score`·`render`·`design`이 있으면 멈춘다(#141 `assertInputPath`)

## 6. 여백 규칙

원본 픽셀 반개방 구간을 쓴다.

- 매치: `x0 = left, y0 = top, x1 = left + width, y1 = top + height`
- 여백 p를 네 방향에 더하고 페이지 `[0, W) × [0, H)`로 자른다
  - `x0' = max(0, x0 − p)`, `y0' = max(0, y0 − p)`, `x1' = min(W, x1 + p)`, `y1' = min(H, y1 + p)`
  - 요청 `{x: x0', y: y0', width: x1' − x0', height: y1' − y0'}`
  - 변마다 실제 확장량(`x0 − x0'` 등)과 페이지 경계 클리핑량(`p − 실제 확장량`)을 기록한다
  - p = 0이면 요청은 호출자 좌표와 같다
- 미매치: 여백과 무관하게 전체 원본 `{0, 0, W, H}`를 요청한다
- 매치인데 확장 뒤 요청이 전체 페이지가 되면 요청 의도는 `matched`, 반환 종류는 원본 참조로 따로 기록한다
- 부분 자르기 변 한도(1536)를 넘어도 요청을 줄이지 않는다. 이 자료의 페이지는 1280×960이므로 발생하지 않을 것으로 예상하지만, 발생하면 §8대로 기록한다

## 7. 호출 흐름

배정 단위는 (이미지 ID, p) 192개, p마다 48개다.

- p마다 독립 조건이다: 빈 임시 허용 루트를 새로 만들고 원본 48장을 복사한 뒤, 새 stdio 번들 프로세스를 띄운다(저장소는 프로세스 메모리라 함께 새로 시작한다). 끝나면 프로세스를 닫고 루트를 지운다. 출력 폴더도 실행마다 새로 만든다
- 자식 환경은 최소 환경 변수, `TCO_ALLOWED_ROOTS`, 오프라인 가드(`tools/d03/guard/node-netguard.cjs`)뿐이다. 가드가 없으면 시작하지 않는다
- 순서: `initialize` → `notifications/initialized` → `tools/list` → ID마다
  1. `index_image_artifact({path, profile: "tolerant"})`
  2. `crop_image_artifact({artifactId, region: 요청})`
- 실패 단계 뒤 요청은 보내지 않는다(`not_called`). 재시도·대체 없음. 실패 행도 보존한다
- 클라이언트는 원 응답의 `content` 배열에서 이미지 항목 수를 직접 센다(첫 이미지만 보는 방식이 아니다)

### 7.1 유효 응답

| 요청 | 유효 조건 | 반환 종류 |
|---|---|---|
| 전체 페이지 | `isError = false`, `status = original`, `fullFrame = true`, 이미지 항목 0, `region`이 요청과 같음, `source.sha256` 일치, 응답 `source.path`를 허용 루트 안에서 실제로 다시 열어 원본 SHA 일치(#141 `verifyOriginalRef`) | `original_verified` |
| 부분 | `isError = false`, `status = cropped`, `fullFrame = false`, 이미지 항목 정확히 1, MIME `image/jpeg`, base64 바이트 길이 = `output.byteLength`, 바이트 SHA-256 = `output.sha256`, `sharp` 독립 디코드 치수 = `output` 치수 = 요청 치수, `region` = 요청, `source.sha256` 일치 | `crop_jpeg` |

- 색인 응답은 `source.sha256`·치수가 원본과 같고 `validationProfile`을 기록한다
- 그 밖의 응답은 실패다. 실패 코드 예: `kind_invalid`, `image_count`, `crop_mime`, `crop_byte_length`, `crop_image_sha_mismatch`, `crop_decode_failed`, `crop_size_mismatch`, `crop_region_mismatch`, `source_sha_mismatch`, `source_dims_mismatch`, 원본 열기 코드(`ref_*`, `sha_mismatch`), 도구 오류 코드, `timeout`
- 한도 오류: 응답이 `status = rejected`이고 제품 코드가 `resize_required`이면 `failCode = limit_exceeded`, `productCode = resize_required`로 남긴다. 제품은 전체 페이지 검사를 한도 검사보다 먼저 한다

## 8. 원시 행 (`raw.jsonl`, 키 `p<p>|<id>`, p 오름차순·배정 ID 순서)

경로, 픽셀, 이미지 본문, `artifactId`는 넣지 않는다.

```text
key, p, id, pairId, lang, anchor, doctype, layout
intent: matched|unmatched, band: {left,top,width,height}|null, page: {width,height}
request: {x,y,width,height}, requestRect: [x0,y0,x1,y1], requestFull: bool,
pad: {left,top,right,bottom} | null      # 실제 확장량(매치만)
clip: {left,top,right,bottom} | null     # p − 실제 확장량(매치만)
steps: [{seq, tool, status: ok|error, code}]
index: {status: ok|error|not_called, code, validationProfile, width, height, sourceSha: match|mismatch|null}
crop: {status: ok|error|not_called, code, productStatus, productCode, fullFrame, region: [x0,y0,x1,y1]|null,
       imageItems, mime, byteLength: match|mismatch|null, imageSha: match|mismatch|null,
       decode: ok|failed|null, decodedWidth, decodedHeight, sourceSha}
originalRead: {status: ok|failed|not_called, code, sha}
returned: {kind: crop_jpeg|original_verified|original_unverified|none, region: [x0,y0,x1,y1]|null}
outcome: ok|failed, failStage, failCode
```

같은 폴더의 `conditions.jsonl`(p마다 한 줄: 초기화, 도구 목록, 요청/응답/알림 수, 종료 코드, stderr 해시)과 `input-check.json`(§5 결과, ID별 원본 SHA·치수)이 결정적 출력이다. 시각·환경은 `run-meta.json`에 둔다(비결정적).

## 9. 파일 접근 분리

| 단계 | 파일 | 읽는 것 | 읽지 않는 것 |
|---|---|---|---|
| 실행기 | `src/crop-padding-replay-run.mjs` | 입력 폴더(배정·질문·원본·원본 SHA), 기준 커밋의 freeze manifest와 동결 라이브러리 blob id, 번들 | gold, 채점 파일, #141 결과 |
| 동결 | `src/crop-padding-replay-freeze.mjs` | 실행 출력 | gold |
| 채점기 | `src/crop-padding-replay-score.mjs` | 동결 해시를 먼저 확인한 실행 출력, 그다음 gold blob, #141 raw·score blob, #141 RGB manifest | 실행 코드 |
| 독립 검산 | `tools/crop-padding-replay-recount.py` | 실행 출력, gold blob, R09 선택 기록 blob, #141 raw·score blob | 채점기 코드 |

- 여백 생성과 반환 수집은 정답 상자·값·채점 파일을 읽지 않는다
- 검산기는 채점기와 다른 작성 주체가 명세만 보고 쓴다(§13)

## 10. 판정

### 10.1 정답 상자

- gold blob의 원바이트 SHA가 기준 커밋 freeze manifest의 `gold.json` 값과 같아야 한다
- ID마다 `parts`의 모든 `rect`가 근거다. `parts` 누락·빈 목록, `rect`가 정수 4개가 아님, `x1 ≤ x0` 또는 `y1 ≤ y0`, 페이지 밖이면 **입력 오류로 채점을 멈춘다**

### 10.2 행 판정

반환 영역 `R = returned.region`(반개방). 근거 상자 `g`는 `g.x0 ≥ R.x0`, `g.y0 ≥ R.y0`, `g.x1 ≤ R.x1`, `g.y1 ≤ R.y1`이면 포함이다.

- `complete`: `outcome = ok`, 반환 종류 `crop_jpeg` 또는 `original_verified`, 모든 근거 포함
- `incomplete`: 위 조건에서 근거 하나 이상이 빠짐. 1px 누락도 incomplete다
- `not_evaluable`: 실패 행, `original_unverified`, 반환 영역 없음

행마다 빠진 항목 수·항목 이름, 그리고 근거 상자와 페이지 경계가 맞닿는지(요청 클리핑이 판정에 관여했는지 보이기 위해 §8 `clip`)를 남긴다.

### 10.3 면적

- 면적비 = (반환 폭 × 높이) / (원본 폭 × 높이). 정수 분자·분모를 보존하고 표시할 때만 반올림한다(비 4자리, 퍼센트포인트 2자리)
- 원본 참조는 1이다. 실패는 결측(null)이다
- 한도 초과 민감도(가정치): `limit_exceeded` 행만 요청 면적/페이지 면적을 대입한 별도 표를 둔다. 유효 쌍 수를 병기하고, 그 밖의 실패는 결측으로 둔다. 실제 관측과 가정치를 섞지 않는다

## 11. 집계 (p마다)

- 분모: 전체 48, 매치 36, 미매치 12. 실패 행도 분모에 남는다
- 판정: complete/incomplete/not_evaluable, 전체·의도별
- 반환 종류: crop_jpeg / original_verified / original_unverified / none. 매치 중 전체 페이지로 바뀐 행 수
- 실패 코드별 수, `limit_exceeded` 수
- 면적: 전체와 매치 행의 평균 면적비(유효 행 수, 결측 수). p0 대비 짝지은 평균 변화(퍼센트포인트) = 같은 ID에서 두 조건 모두 유효한 쌍의 `ratio_p − ratio_0` 평균. 유효 쌍 수와 결측 쌍 수를 쓴다
- p0 대비 판정 변화(같은 ID): 회복(incomplete→complete), 악화(complete→incomplete), 유지 complete, 유지 incomplete. 한쪽이라도 not_evaluable인 쌍 수는 따로 쓴다
- 미매치 효과 분리: 전체 complete 수 중 미매치 원본 열기가 기여한 수(미매치 complete)와 매치만의 complete/36을 나란히 쓴다. 면적도 매치만의 평균을 따로 쓴다
- 언어 × 앵커(각 12)와 24쌍 EN·KO 동시 complete/EN만/KO만/둘 다 아님은 기술 통계다

## 12. #141 재생 대조 (p = 0)

- 대조 대상은 #141 raw blob의 `rgb|tolerant|region|<id>` 48행과 score blob의 같은 키 판정이다
- 48개 ID 모두에서 다음이 같아야 **재생 통과**다
  - `crop.requested`(x, y, width, height) = 새 p0 요청
  - `returned.kind` = 새 반환 종류
  - `returned.region` = 새 반환 영역
  - 포함 판정: #141 `complete` ↔ 새 `complete`, #141 `partial` ↔ 새 `incomplete`
  - 원본 치수: #141 RGB 색인 응답 치수와 RGB manifest 치수 = 새 gray8 색인 치수 = 배정 `page`(좌표계 동일 전제)
- 미매치 12개의 요청·반환 구간은 전체 `[0, W) × [0, H)`여야 한다
- 원본 SHA는 표현 안에서만 대조한다(gray8은 freeze manifest, RGB는 #141 manifest). 표현 간 SHA는 비교하지 않는다
- 한 행이라도 다르면 p > 0 결과를 기존 실험과 **직접 비교 불가**로 표시한다. 새 실행 내부의 p 간 비교는 기술치로 따로 두고, 기존 사례 재현 결론은 유보한다. 불일치 원인 조사는 사후 진단으로 분리한다

## 13. 재현과 검증

- 실행 A·B를 독립으로 돌린다(새 출력 폴더, 새 서버·루트). 결정적 출력(`raw.jsonl`, `conditions.jsonl`, `input-check.json`)과 채점 출력이 바이트 단위로 같아야 한다
- 동결: 실행이 끝나면 결정적 출력 3개의 SHA-256을 `evidence.json`에 고정한다. 채점기는 이 해시가 맞을 때만 gold를 읽는다
- Python 독립 검산: 192개 키, 요청 좌표 재계산(R09 선택 기록 blob에서 다시 투영), 반환 좌표, 원본/JPEG 종류, 근거 포함, 면적·집계, #141 대조를 다시 계산해 score와 비교한다. 불일치 0이어야 한다. 표준 라이브러리만 쓴다
- 오프라인 가드: 가드 이벤트 수(실행기 1 + 조건 4 = 5)와 차단 0을 기록한다
- 테스트(`research/test/crop-padding-replay.test.mjs`): 손계산 사례를 먼저 RED로 커밋한다
  - p = 0 동일성, 상하좌우 경계 클리핑, 전체 페이지 전환, 미매치 전체 요청
  - 반개방 1px 경계(맞닿음 포함, 1px 넘침 incomplete)
  - 이미지 항목 2개·MIME·길이·SHA·치수 불일치, 한도 오류 분류, 원본 참조 검증 실패
  - 정답 상자 누락·빈 목록·역전 좌표 입력 오류
  - 작은 집계(면적 평균, 짝지은 변화, 회복/악화) 손계산
- 전체 게이트: CLAUDE.md 검증 명령 7종. 결과는 실제 로그로 기록한다
- 검토: 독립 Opus 5.5 마일스톤 검토, Argon 발췌 대조. 지적은 같은 Draft PR에서 `fix(review)`로 고친다. 비교 규칙이나 결과에 중요한 변경이면 독립 재검토를 받는다

## 14. 해석 한계

- 탐색적 재생이다. 24쌍 언어별 결과는 기술 통계다
- 기하적 포함만 잰다. 여백이 판독성·정답률을 높인다는 주장은 하지 않는다
- 면적비는 전달 픽셀 범위이며 토큰·바이트 비용이 아니다
- 이 자료의 근거 상자와 선택기 좌표에 한정된다

## 15. 변경 기록

- 측정 전 고정: 이 문서(첫 커밋)
- 측정 전 보완(하네스 커밋과 함께, 실측 전)
  - 입력 폴더: 실행기는 `assignment.json`, `questions.json`, `images/original/`만 있는 폴더와 별도 원본 SHA 표(`original-sha.json`)를 받는다. #141 준비기 `--stage originals`로 새로 만들고, 로컬 #141 입력 폴더의 원본 48장과 SHA를 전부 대조해 기록한다(그 폴더는 RGB 파생본을 함께 담고 있어 실행 입력으로 쓰지 않는다)
  - 동결 라이브러리·번들은 작업 사본 blob과 제품 커밋 경로의 blob을 모두 확인한다
  - #141 RGB manifest의 `originalSha256`이 새 입력의 원본 SHA와 같은지 확인한다(파생 출처 확인이며 표현 간 SHA 비교가 아니다)
- 측정 뒤 기록(사후, 독립 Opus 마일스톤 검토 반영. 코드·측정값·판정 규칙 변경 없음)
  - §10.2의 "근거 상자가 페이지 경계에 맞닿는지" 행별 필드는 채점 출력에 구현되지 않았다. 대신 gold blob `5d6c277`의 근거 상자 96개 중 페이지 경계에 맞닿는 상자가 0개임을 직접 셌다(검토자도 독립으로 0개 확인). 따라서 이번 판정에서 페이지 경계 클리핑이 근거를 잘라낸 경우는 없다. 요청 클리핑은 `raw.jsonl`의 `clip`에 있다
  - 원본 참조 열기에 실패한 행은 최종 반환 종류가 `original_unverified`가 아니라 `none`으로 남는다(코드 `crop-padding-replay-lib.mjs`). 판정은 어느 쪽이든 평가 불가이고, 이번 실행에서 0건이다. 다음 연구에서 정리한다
  - 로컬 #141 입력 폴더와의 바이트 대조(원본 48장·SHA 표·배정·질문 동일)는 실행 시 `cmp`로 확인했고 로그는 커밋하지 않았다(로컬 절대경로). 재현 가능한 근거는 `prepare-report.json`이 #141과 바이트 동일하다는 점이다
