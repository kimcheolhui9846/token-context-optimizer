# 새 합성 문서 96쪽에서 한국어 OCR × 한글 검색 키 4조건 재검증 — 사전등록 프로토콜

- 작성 2026-11-24. Tier E. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. 독립 브랜치 `claude/ko-ocr-holdout`(main 위, 다른 PR 위에 쌓지 않음).
- 요청서: 메인 checkout `codex_review/codex_paste_2026-11-24_ko-ocr-holdout.md`(마지막 "Opus 계획 검토 후 사전등록에 반영할 결정" 절 우선). 사용자 승인 범위: 새 자체 합성 자료에서 #147 고정 규칙의 후속 평가, 로컬 CPU 오프라인 OCR, Draft PR까지. 연구 API 비용 0원, GPU·RunPod·유료 실험 없음.
- **등록 커밋:** 이 문서, 자료 작성자 지침 `research/tools/ko-ocr-holdout/AUTHOR_BRIEF.md`, 결과 폴더 속성 파일, 전용 핸드오프만 담은 첫 커밋이다. 그 시점에는 새 자료가 없고(PNG·질문·골드 0개), 새 자료에 OCR·선택기·K1 규칙을 한 번도 실행하지 않았다. 등록 전에 본 것은 §12에 적는다.
- #147(`c0c2f5dd4178df3e02595176525cf88b2eaf68c2`)과 #145·#146은 Git 객체로만 읽는다. 병합하거나 그 위에 쌓지 않는다. 제품 코드, 기존 연구 파일, 기존 PR, 논문, WBS 필수 완료 카운트, 패키지 manifest·lockfile은 변경 대상이 아니다.

## 1. 역할

| 주체 | 역할 |
|---|---|
| 사용자 | 실험 승인, Ready·merge 승인 |
| Codex Astra (PM) | 요청서, 포인트 사전 확정, 최종 판정, 저장소 밖 중앙 기록 |
| Claude Code Opus 5.5 (연구 작성자) | 이 문서, 자료 검사·동결, 연구 코드, 시험, 실측, 채점, 결과, 핸드오프, Draft PR |
| 독립 자료 작성자 | 연구 작성자와 다른 하위 에이전트. `AUTHOR_BRIEF.md`(문법·두 근거 상자 요구·개수·새 도안 지침)와 고정 렌더러만 받아 질문·텍스트·도안 생성기를 쓴다. 이전 실패 행, 실패 표지 단어, 이전 결과를 받지 않는다(§3.3) |
| 독립 Python 검산 작성자 | 연구 작성자·자료 작성자와 다른 하위 에이전트. 공개 명세 `RECOUNT_SPEC.md`, 고정 선택기 `research/src/selector.mjs`, 원자료만 받아 검산기를 쓴다. 새 JS 코드를 보지 않는다 |
| harness-opus-review (claude-opus-5-5) | 계획 검토(완료: PASS WITH NOTES, Blocker·Major 0), 구현 마일스톤 독립 검토 |
| Argon (gemini-4-argon, BAZE) | 사전 지정 대표 페이지와 공개 합계·분모만 담은 최소 발췌 대조 |

## 2. 질문과 해석 한계

#147은 기존 두 합성 계열(R09·FCP)에서 O(OCR 언어)와 K(검색 키) 두 요인을 짝지어 바꿨다. 이번 실험은 **처리 규칙을 하나도 바꾸지 않고** 새로 만든 독립 합성 자료 96쪽에 같은 네 조건을 적용한다.

- 결과는 이 새 합성 자료(문서 종류 3, 레이아웃 2, 앵커 2, 시드 4, en/ko 번역 짝)에 대한 동일 자료 4조건 **기술 통계**다. 48짝은 번역본이라 독립 표본 96개가 아니며, 시드·템플릿·짝 의존성이 있다. #147과 개념 설계(표지·값 두 근거, 렌더러, 글꼴)를 공유한다.
- 이전 실험의 분모(24/72/70)나 결과(18/24)는 이번 기댓값이나 통과 조건이 아니다. 두 실험의 수치를 합산하거나 신규 일반화 성능으로 확대하지 않는다. 실제 문서에 대한 결과로 해석하지 않는다.
- 창 안에 근거가 들어오는 것은 표지 인식·질문 답변 정확도가 아니다. 제품·답변 모델을 호출하지 않는다.

## 3. 새 자료

### 3.1 구성 (96쪽 = 48 en/ko 짝)

- 문서 종류(이 순서): `repair` 도서 수선 의뢰서, `greenhouse` 온실 작업 일지, `rental` 대여 물품 반납 기록.
- 레이아웃(이 순서): `slip` 작업 전표 — 레코드마다 왼쪽 식별 띠와 오른쪽 값 영역이 나란한 가로 띠, 레코드 4개를 위에서 아래로 쌓는다. `intake` 접수 양식 — 제목 아래 레코드 4개가 좌우 두 영역(각 2개)에 나뉜 블록이다.
- 앵커(이 순서): `code` 코드 표지(질문이 레코드 코드를 씀), `nl` 자연어 표지(질문이 레코드의 자연어 이름을 씀).
- 시드(이 순서, 시드 위치 0–3): 101, 211, 307, 401. 예비 시드(이 순서): 503, 601, 701, 809.
- 언어: `en`, `ko`. 짝은 같은 레코드 내용의 번역본이며 코드·수치·목표 슬롯·도안 좌표 규칙이 같다.
- 조합 = 문서 종류 × 레이아웃 × 앵커 12개, 일련번호 c = 0…11(문서 종류 순서 → 레이아웃 순서 → code, nl). 조합마다 시드 4개 × 2언어 = 8쪽. 각 언어×앵커 칸 24쪽. **주 집단(사전 지정): 한국어 자연어(ko/nl) 24쪽.**
- 페이지 ID `<doctype>-<layout>-<anchor>-s<seed>-<lang>`, 파일 `<ID>.png`, 짝 ID `<doctype>-<layout>-<anchor>-s<seed>`. 질문 목록 순서: 조합 순서 → 시드 위치 → en, ko.

### 3.2 페이지 문법과 정답

- 페이지 1280 × 960, 흰 바탕 L 모드. 글꼴 `NotoSansKR-VF.ttf`(SHA-256 `018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0`, 가중치 400, 본문 24, 제목 32). 렌더러는 고정 `research/tools/r09/render.py`(blob `b61cd9b37803d8eb4b6b126a75301570c14ab11d`)를 **수정 없이** 쓴다. 이 렌더러의 도안 형식(`images[].page/items/rules/goldItems/answer`, 항목 `id/role/text/cell/size`)을 따른다.
- 페이지마다 목표가 될 수 있는 레코드가 정확히 4개(슬롯 0–3, 읽는 순서). 레코드마다 코드 항목, 자연어 이름 항목, 질문 대상 값 항목, 그 밖의 필드 항목 1개 이상이 각각 별도 텍스트 항목이다. 코드는 문서 종류별 접두어 `RP-`, `GH-`, `RT-` + 숫자 4자리.
- 목표 슬롯: 시드 위치 i, 조합 일련번호 c에서 `slot = (i + c) mod 4`. 조합마다 0–3이 한 번씩 쓰인다. en/ko 같은 슬롯. 예비 시드로 바꿔도 원래 시드 위치의 슬롯을 유지한다.
- 질문: code 앵커는 목표 레코드 코드 문자열을, nl 앵커는 목표 레코드 자연어 이름 문자열을 그 페이지 텍스트 그대로 포함하고, 목표 값 필드를 묻는다. 정답은 목표 레코드의 값 항목 텍스트와 같다.
- **두 근거 상자(골드):** 등록된 앵커 항목(code면 코드 항목, nl이면 이름 항목)과 값 항목. 렌더러가 항목마다 0으로 초기화한 원본 크기 L 레이어에 그 항목만 fill 255로 그리고 `getbbox()`로 값이 0보다 큰 모든 픽셀(안티앨리어싱 포함)의 최소 반개방 상자 `[l, t, r, b)`를 취한다. 다른 항목·구분선은 별도다. 겹침·셀 밖 잉크·페이지 잘림·누락 글리프가 있으면 그 페이지는 렌더 무효다.
- 페이지 안에서 코드 유일, 자연어 이름 유일, 목표 필드 값 유일. 앵커 문자열은 다른 항목의 부분 문자열이 아니다. 수치 단위나 비슷한 표현이 있어도 정답이 하나로 정해진다.
- 상세 지침과 금지 사항은 `AUTHOR_BRIEF.md`에 있고 이 절과 함께 등록 커밋에서 고정된다.

### 3.3 자료 작성 독립성

- 자료 작성자는 `AUTHOR_BRIEF.md`, 고정 렌더러 `research/tools/r09/render.py`, 글꼴 경로만 받는다. 이전 실험의 ID·실패 행·실패 표지 단어·결과·질문을 전달하지 않는다. `research/results/`, `research/plans/`, `codex_review/`, PR 본문, `research/src/` 등 기존 연구 자료를 읽지 말라고 지시한다.
- 한계(공개): 작성자는 같은 작업 트리 파일 시스템에 접근할 수 있으므로 읽기 금지는 지시로만 강제된다. 작성자 보고서에 실제로 읽은 파일 목록을 받아 핸드오프에 기록한다. 작성자는 OCR을 실행하지 않는다.
- 작성자 산출물: `research/tools/ko-ocr-holdout/design.py`(표준 라이브러리만, 시드 결정적), 작성 기록 `research/tools/ko-ocr-holdout/AUTHOR_REPORT.md`. 원래 R09 도안의 좌표·텍스트를 복사하지 않는다.

### 3.4 동결 전 검사 (OCR 없이)

생성: `design.py`가 `design.json`(채점 측)과 `questions.json`(선택기 측: `id, file, question`만)을 쓰고, 고정 렌더러가 `images/`, `gold.json`, `render.json`, `render-check.json`을 쓴다. 출력 폴더 `research/results/ko-ocr-holdout/data/`.

검사(전부 통과해야 동결):

1. 렌더 유효: `render-check.json`의 `failedImages = 0`, 페이지마다 골드 2개 = (앵커 항목, 값 항목), 각 상자 양의 면적·페이지 안·셀 안.
2. 구성: 96쪽, ID·파일 유일, 조합·시드 위치·언어 격자가 §3.1과 정확히 같음, en/ko 짝의 슬롯·코드·값 항목 위치 규칙 일치, 슬롯이 §3.2 공식과 같음, 레코드 4개, 코드·이름·목표 값 유일, 질문이 앵커 문자열을 포함, 정답 = 값 항목 텍스트.
3. 중복: 96개 PNG 원바이트 SHA-256 서로 다름. NFC 정규화·연속 공백 1개·앞뒤 공백 제거한 전체 질문의 정확히 같은 중복 없음.
4. 기존 자료와의 겹침: R09 평가 48쪽(`0fb3053…:research/results/r09-bilingual/heldout`)·개발 4쪽(`…/dev`) = 52쪽, FCP 48쪽(`708d994…:research/results/fresh-crop-padding/frozen/selector-input`)과 PNG SHA-256 겹침 0, 정규화 질문 겹침 0. 문서 종류·레이아웃 이름이 R09·FCP 설계의 종류·레이아웃과 겹치지 않음(신규성).
5. 결정성: 생성·렌더 전체를 두 개의 새 폴더에 각각 실행해 모든 파일의 바이트가 같다.

- 1–3 중 어느 페이지 짝이 실패하면 OCR 없이 그 짝과 이유를 `data/checks.json`에 기록하고, 같은 조합·시드 위치에 예비 시드 503, 601, 701, 809를 이 순서로 시험해 처음 유효한 것을 쓴다(같은 조합에서 이미 쓰인 시드는 건너뜀). 내용·생성 규칙·설정은 같고 시드만 다르다. 슬롯은 원래 시드 위치 값을 유지한다. 모두 실패하면 그 사실을 보고하고 임의 선별 없이 측정을 보류한다. 4·5의 실패는 생성기 결함이므로 측정을 보류하고 보고한다.
- 도안 점검을 위한 렌더·눈 확인은 허용한다. 실험 OCR을 미리 돌리지 않는다. 등록한 시드와 행을 모두 쓰고, OCR 성적을 이유로 페이지를 고치거나 빼거나 바꾸지 않는다.
- **자료 동결 커밋:** `data/` 전체, 파일별 SHA-256 매니페스트 `data/manifest.json`, `data/checks.json`을 첫 OCR 호출 전에 커밋·push한다. 매니페스트는 두 번 생성해 같은지 확인한다. 글꼴·언어 파일은 커밋하지 않는다.

## 4. 고정 처리

### 4.1 고정 원본

| 대상 | 고정 객체 |
|---|---|
| #147 head | `c0c2f5dd4178df3e02595176525cf88b2eaf68c2` (`git fetch origin pull/147/head`) |
| 키 함수 `keyResults`, `scoreKey`, `hangulBigrams`, `checkLangFiles`, `compareRows` | `c0c2f5dd…:research/src/ko-ocr-factorial-lib.mjs` blob `d882b6640fcafabcc62e14ebfd571749d88f4bf6` |
| 페이지 OCR 전처리·좌표 복원 근거 | `c0c2f5dd…:research/src/ko-ocr-factorial-run.mjs` blob `3ddf60ab02c4195dc0441ea6d8959de52373cafc`의 `newWorker`, `ocrLines`, `withTimeout` |
| 고정 선택기 `selectWindow` | `0fb3053…:research/src/selector.mjs` blob `b3b4965b2d330907c0143fe178013aace1be8372` |
| 렌더러 | `0fb3053…:research/tools/r09/render.py` blob `b61cd9b37803d8eb4b6b126a75301570c14ab11d` |

- **어댑터:** `research/src/ko-ocr-holdout-fixed.mjs`가 #147 lib blob을 `git cat-file`로 읽어 blob ID를 다시 계산·대조한 뒤 Git 무시 캐시 `research/.cache/ko-ocr-holdout/fixed/`에 그 바이트 그대로 쓰고 동적 `import()`한다. 쓴 파일을 다시 읽어 blob ID를 대조한다. 실행기는 이 모듈의 `keyResults`를 호출하며, 새 코드에 K0/K1 규칙을 다시 구현하지 않는다. 같은 페이지의 OCR 출력 하나를 K0·K1이 공유한다.
- 페이지 OCR 함수 `newWorker`, `ocrLines`, `withTimeout`는 #147 run blob의 해당 함수 본문을 바이트 그대로 옮긴다. 시험이 blob에서 같은 함수 본문을 잘라 문자열 일치를 확인한다.
- 엔진 `tesseract.js` 5.1.1 / `tesseract.js-core` 5.1.1, OEM 1, 연구 lockfile 그대로. O0 = `"eng"`, O1 = `"eng+kor"`(순서 고정). 언어 파일·크기·SHA-256(#147 §4.1과 같음): `eng.traineddata` `5dc5d8d6…b400d747` 5,199,098바이트, `kor.traineddata` `ec174937…32109992` 2,208,378바이트. 캐시 `research/.cache/ko-ocr-factorial/`(#147과 같은 경로, Git 무시), `langPath`=`cachePath`=그 폴더, `gzip: false`, `cacheMethod: "readOnly"`.
- 새 자료의 ID·경로를 #147 자료로 가장하지 않는다. 실행기·결과는 `ko-ocr-holdout` 이름만 쓴다.

### 4.2 조건

- **O0K0:** `eng` OCR, `keyResults(...).k0`. **O0K1:** `eng` OCR, `.k1`. **O1K0:** `eng+kor` OCR, `.k0`. **O1K1:** `eng+kor` OCR, `.k1`.
- K1은 K0가 정상 미매치일 때만 #147에서 고정한 한글 두 음절 규칙으로 보조 선택한다(#147 프로토콜 §4.2, 고정 blob이 정의). 입력 검증·출력 검증·오류 표시는 고정 함수 그대로다.

### 4.3 시작 전 가드 (OCR 호출 전 중단)

오프라인 가드(`NODE_OPTIONS`에 `node-netguard.cjs`, `D03_NET_LOG`), 저장소, 선택기 blob, #147 lib blob(어댑터 경유), #147 run blob의 OCR 함수 본문 일치, 실행 코드 파일이 HEAD와 같음(측정 시), 엔진 버전, 두 언어 파일, 자료 동결 커밋의 `data/` 객체와 매니페스트 SHA-256. 하나라도 어긋나면 `stop.json`만 쓰고 종료 코드 2.

## 5. 실행

- run A(주 분석), run B(독립 반복). 각각 별도 프로세스, 별도 새 출력 폴더. 한 run 안의 순서: O0 96쪽 → O1 96쪽, 질문 목록 순서.
- (OCR 조건, run)마다 새 OCR 워커 1개를 만들어 96쪽에 쓰고 종료한다.
- 페이지 제한 180,000ms. 오류는 `timeout`(제한 초과), `worker_exception`(OCR 예외), `input_validation`·`invalid_output`(형식 오류, 고정 함수가 표시)으로 분류한다. 예외·시간 초과 페이지는 **재시도하지 않고** 그 페이지의 기술 오류로 남긴다. 그 뒤 워커를 종료하고 같은 조건의 새 워커로 다음 페이지부터 계속하며 사건을 기록한다. 워커 재생성도 실패하면 그 run을 미완료로 기록(`incomplete.json`)하고 멈춘다.
- 정상 계획: 96쪽 × 2 OCR 조건 × 2 run = 384 페이지 인식. 페이지 타이머 이론상 합은 19시간 12분(초기화 제외)이며 예상 소요 시간이 아니다.
- 출력(run 폴더, #147 §5.2와 같은 행 형식, `dataset` 값은 `holdout`): `predictions.jsonl` 192행, `ocr.jsonl` 192행, `freeze.json`(두 파일 원바이트 SHA-256), `guard-summary.json`, `run-meta.json`(결정적 아님). 모든 파일 UTF-8, LF. 행에 run 표지를 넣지 않는다.
- 예측 파일 해시를 `freeze.json`에 고정하고 **run A 예측을 커밋·push한 뒤** 채점기가 `design.json`·`gold.json`을 연다. 실행기는 `questions.json`과 PNG만 읽는다.

## 6. 채점

### 6.1 행 판정 (고정 `scoreKey`)

- 정답 상자: `gold.json`의 ID별 `parts` 두 개 `rect = [l, t, r, b]`(원본 픽셀 반개방, `size`와 일치). 정확히 2개가 아니면 채점 중단.
- **엄격 성공:** 상태 정상, 매치, `0 < width·height < W·H`, 두 상자 모두 창 `[left, left+width) × [top, top+height)` 안(여유 0px). 매치 행 근거 분류 `all`/`partial`/`none`. 행 상태 `technical_error` / `unmatched` / `matched_strict` / `matched_not_strict`. 미매치는 원본 fallback이며 회복 0이다.

### 6.2 기준 집단 (run A의 O0K0로 결정)

- 전체 96쪽: 기준 정상 미매치 M, 기준 정상 매치 C, 기준 기술 오류 E(M + C + E = 96을 검증), 기준 엄격 성공 S(⊆ C).
- 주 집단 ko/nl 24쪽: M_K, C_K, E_K(합 24 검증), S_K.
- run B 채점도 같은 A 기준 집단을 쓴다.

### 6.3 보고 지표 (주 분석 run A)

1. 조건별 전체: 엄격 성공 /96, 매치, 미매치, 기술 오류, 근거 all/partial/none.
2. 조건별 분해: 문서 종류(3 × 32쪽), 레이아웃(2 × 48), 문서 종류×레이아웃(6 × 16), 언어×앵커(4 × 24)마다 분모, 기술 오류, 매치, 미매치, 근거 all/partial/none, 엄격 성공.
3. 주 집단 ko/nl: M_K 중 단순 매치 회복 수, M_K 중 두 근거 전체를 포함한 부분 창(엄격 성공) 회복 수, 각각 /M_K. ko/nl 전체 엄격 성공 /24. 그 조건의 기술 오류 수.
4. 전체 전이(O0K0 기준 → 각 조건): 미매치→매치 /M, 미매치→엄격 성공 /M, 매치→미매치 /C, 엄격 성공→정상 실패(미매치 또는 비엄격 매치) /S, C 중 기준 비엄격 → 새 엄격 성공 /(C−S), 각 분모 안의 기술 오류 수(별도 열). 엄격 성공을 잃은 행과 새로 얻은 행의 ID 목록.
5. 대응 2×2 전이(엄격 성공 여부, 매치 여부): O0K0→O0K1, O1K0→O1K1, O0K0→O1K0, O0K1→O1K1, O0K0→O1K1. 주 비교는 O1K1 대 O0K0, 구성요소 비교는 O0K1, O1K0.
6. 보조: O0/O1 OCR 줄 텍스트가 다른 페이지 수, K1 분기 분포(`k0`/`hangul`/`none`/오류).

- 분모 0은 수치 대신 `null`(표에서 "해당 없음"). 기술 오류 행은 분모에 남기고 성공·실패와 별도 열에 둔다. 0분모·오류가 있는 대비는 해석 한계를 표시한다. 독립 표본 검정·신뢰구간은 하지 않는다.

### 6.4 run A/B 재현성

- `predictions.jsonl`, `ocr.jsonl`, `guard-summary.json`, `score.jsonl`, `summary.json`을 각각 원바이트 비교하고, 키 기준 양방향 행 비교(한쪽에만 있는 키, 중복 키, 한쪽에만 있는 필드, 값 차이, 순서)를 고정 `compareRows`로 한다.
- 다르면 불일치 행을 원래 분모에 남기고 A/B 값을 병기한다. 주 분석은 A로만 보고하며, 좋은 run을 고르거나 재현되지 않은 행의 효과를 주장하지 않는다.

## 7. 중단 규칙

- 고정 blob·자료 매니페스트·선택기·언어 파일·엔진·오프라인 가드 불일치: OCR 전 중단(`stop.json`).
- 예측 해시 불일치, 골드 상자 수 불일치, M+C+E ≠ 96 또는 M_K+C_K+E_K ≠ 24: 채점 중단.
- 실측 중 네트워크 차단 사건이 1건 이상이면 그대로 적고 그 run의 오프라인 주장을 하지 않는다.
- 규칙·임계값·OCR 언어 순서·자료를 사후에 바꾸지 않는다. 기술 오류, 0분모, 회복 없음, 손실은 그대로 보고한다.

## 8. 시험 (구현 전 RED)

JS(`research/test/ko-ocr-holdout.test.mjs`): 어댑터가 고정 blob 바이트를 쓰고 변조를 거부, 어댑터 `keyResults`가 고정 blob 동작과 같음(기존 기준 양성/음성 fixture: K0 매치는 K1이 그대로, K0 미매치에서 한글 보조 매치, Q 빈 집합 → 미매치), OCR 함수 본문 일치, 자료 매니페스트 누락·중복·변조 검출, 질문 정규화 중복 검출, 슬롯 공식, 기준 집단 M/C/E/S 계산과 합 검증, 오류 행 분리, 빈 분모 `null`, 근거 부분·전체·없음과 반개방 경계, 같은 짝의 두 언어 구분, 전이 분모, 예측 변조 검출, 가드 누락 시 중단, README 재현 명령의 경로 존재.

Python(`research/tools/ko-ocr-holdout/test_recount.py`): 검산 작성자가 명세만으로 쓴다.

## 9. 독립 검산

`research/tools/ko-ocr-holdout/recount.py`(표준 라이브러리만): 자료 매니페스트·freeze 해시 대조, PNG 크기와 골드 상자 기하(양의 면적, 페이지 안, 상자 네 변에 잉크가 있음 — PNG를 zlib로 직접 해독), `ocr.jsonl`에서 K0(고정 선택기 명세의 Python 재구현)·K1 재계산과 `predictions.jsonl` 대조, 행 판정·기준 집단·전이·분해 집계 전부를 다시 계산해 `score.jsonl`·`summary.json`과 대조. 종료 0이어야 한다.

## 10. 커밋 순서

1. 등록 커밋(이 문서·작성자 지침·핸드오프) → push → 즉시 Draft PR.
2. 자료 작성자 생성기 → 동결 전 검사 → 자료·해시 동결 커밋(OCR 전) → push.
3. RED 시험 커밋(모듈 없음으로 실패 기록) → 최소 구현 → 대상 시험 통과.
4. run A 실측 → 예측 고정 커밋·push → 채점. run B 실측·채점, A/B 비교.
5. 독립 검산, 결과 문서, Opus 마일스톤 검토, Argon, 제품 npm 7단계, 새 클론 재현. 지적은 같은 PR에 `fix(review): …`로 고친다.

## 11. 산출물·소유 경로·완료 조건

- 연구 작성자 소유(신규 파일만): `research/plans/2026-11-24-ko-ocr-holdout-protocol.md`, `research/src/ko-ocr-holdout-*.mjs`, `research/test/ko-ocr-holdout.test.mjs`, `research/tools/ko-ocr-holdout/`(작성자·검산자 파일 포함), `research/results/ko-ocr-holdout/`, `docs/agent/handoffs/ko-ocr-holdout.md`.
- 완료 조건: 대상 시험·검산기 시험 통과, 자료 동결, run A/B 실측과 채점, A/B 비교, 독립 검산 종료 0, 가드 차단 0(아니면 그대로 보고), 연구 회귀, 제품 npm 7단계, Opus 마일스톤 검토, Argon 최소 발췌, 깨끗한 새 클론 재현, 한국어 `RESULTS.md`, 핸드오프. WBS 필수 완료 카운트에 넣지 않는다.
- Argon 발췌: 각 새 문서 종류의 사전순 첫 ko/nl ID(3쪽)의 질문·골드·조건별 창과 공개 합계·분모만.

## 12. 등록 전에 이미 본 것 (공개)

- #147 프로토콜·고정 lib·실행기·채점기·비교기·README·핸드오프 본문, R09 평가 설계 첫 페이지 형식과 질문 4개, R09·FCP 문서 종류·레이아웃 이름(`schedule`·`invoice`·`status`, `table`·`cards`), 고정 렌더러 본문. #147 결과 요약은 핸드오프에서 보았다(이번 기댓값으로 쓰지 않는다).
- 설치 글꼴 SHA-256이 R09 등록값과 같음, Python 3.12.10·Pillow 12.3.0·FreeType 2.14.3·raqm 없음(R09 렌더 기록과 같은 환경).
- 새 자료는 아직 없다. 새 자료에 대한 OCR·선택기 실행 0회.
