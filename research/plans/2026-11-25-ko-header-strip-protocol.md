# #153 고정 자료에서 원본 머리글 띠와 선택 행을 같은 가로 좌표로 함께 제시하는 표시 방식(W5) — 사전등록 프로토콜

- 작성 2026-11-25. Tier E 연구 전용. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. 독립 브랜치 `claude/ko-header-strip-replay`(main 위, 다른 PR 위에 쌓지 않는다).
- 요청서: 메인 checkout `codex_review/codex_paste_2026-11-25_ko-header-strip-replay.md`(독립 계획 검토 반영 절 포함)와 Orca 과제 지시(task_add5ecc8be49). 사용자 고정 핀: `sssk/.artifacts/ko-header-strip-replay/source-pins.json`(읽기 전용, 이 문서 3절 표와 대조함).
- 기계 판독 등록값: `research/tools/ko-header-strip/registered.json`(소스 핀, 조립 허용 목록, 투영 키, 고정 22 ID, 그림 사례, 띠 상수, 사유 코드, 변조 목록). 이 문서와 그 파일이 어긋나면 검증 실패다.
- **이 실험은 새 독립 표본이 아니다.** #153의 실제 144쪽(12원본 × 12배치)과 봉인된 예측을 그대로 쓰는 **짝지은 재생**이다. 연구자는 #153의 결과(22쪽의 표시 손실)를 이미 안다. 새 OCR·모델 추론·GPU·결제·외부 전송은 없다. 사람·모델의 질의응답 정확도나 제품 성능을 재지 않는다.

## 1. 역할과 독립성

| 주체 | 역할 |
|---|---|
| 사용자 | 실험 승인(완료), Ready·merge·제품 적용 승인 |
| Codex Astra (PM) | 요청서, 최종 판정, 별도 Opus 검토, 원자료·실제 PNG 대조 |
| Claude Code Opus 5.5 (연구 작성자, Orca 작업자) | 이 문서, JS 구현, Python 검산기, 시험, 생성, 채점, 결과, 인계서, Draft PR |

- **검산 저자 한계(공개):** 과제 지시가 추가 작업자를 금하므로 JS 조립·채점과 Python 검산기를 **같은 작성자**가 같은 세션에서 쓴다. 검산기는 JS 모듈을 import·호출하지 않고 이 문서·`RECOUNT_SPEC.md`·원자료만으로 계산하며, PNG 디코딩도 다른 라이브러리(JS sharp/libvips, Python Pillow)로 한다. 그래도 같은 사람이 명세를 양쪽에서 똑같이 잘못 읽을 위험은 남는다. 손계산 예제, 변조 시험, PM의 별도 Opus 검토와 원자료 픽셀 대조가 이를 일부 막는다. 두 구현의 작성·수정 시점은 커밋 이력과 인계서에 남긴다.
- **결과를 아는 연구자(공개):** #153의 기하와 읽기 손실(W4 적용 22쪽 모두 목표 머리글이 사라지고 경쟁 값이 남음)은 등록 전에 안다. 입력 경계(4절)는 실행 프로세스의 데이터 경계이며 연구자의 지식을 지우지 않는다. 결론은 이 144쪽 재생의 **기하적 표시**에 한정한다.

## 2. 질문

#153 W4는 정상 머리글·같은 줄 답 22쪽에서 W1을 W2(선택 행 띠)로 줄였다. 22쪽 모두 올바른 열을 골랐지만(gold 귀속 정답 22/22) 목표 머리글이 창 밖으로 사라지고 같은 레코드의 경쟁 값은 남았다(새 E1 22건). 이번 질문은 **W4가 적용된 쪽에서 원본 머리글 띠를 본문 띠와 같은 가로 좌표로 함께 붙이면(W5)**

1. 그 22건의 표시 손실(목표 머리글 none)이 없어지고 두 머리글·두 값이 모두 온전히 보이는가,
2. W4가 얻은 다른 레코드 질문 필드 값 제외(J4 22)가 유지되는가,
3. 그 대가로 표시 면적이 얼마나 늘어나는가

를 **실제로 만든 PNG**에서 보는 것이다. 기하·픽셀 지표와 관찰 가능한 표시 성능만 보고하며, 사람이나 모델이 W5 그림을 보고 질문에 맞게 답하는지(질의응답 정확도)는 재지 않는다.

## 3. 고정 자료 (사용자 핀과 대조)

#153 PR head `4320271738c8be56556fb09bf56511368d49ba9e`(브랜치 `claude/ko-header-column-holdout`, 이 문서 작성 시 미병합). 이 저장소에는 Git 객체로만 읽는다(`git fetch origin pull/153/head:khc-pr153`). 작업 트리에 복사하거나 병합하지 않는다.

| 대상 | 경로(`4320271:`) | blob | SHA-256 |
|---|---|---|---|
| 자료 manifest | `research/results/ko-header-column/data/manifest.json` | `bf3b3fa5…` | `f227f18b…0a962` |
| 선택기 질문 | `…/data/selector/questions.json` | `e77bdc68…` | `aff1e93c…92ad` |
| 동결 OCR | `…/ocr/ocr.jsonl` | `fc546c9d…` | `97388545…dc3c4` |
| 동결 K1 | `…/ocr/k1.jsonl` | `b30921b8…` | `6f3b9a61…faa9` |
| **예측** | `…/replay-a/predictions.jsonl` | `dcd95d3c…` | `ff8bc4f1…4ebff` |
| 재생 입력 기록 | `…/replay-a/inputs.json` | `fc6736b7…` | `42d89fb0…f067` |
| 예측 freeze | `…/replay-a/freeze.json` | `3d908c84…` | `82687960…774f` |
| 채점 요약 | `…/score-a/summary.json` | `0826f54c…` | `cbaab3b4…9a9a` |
| 원본 PNG tree | `…/data/selector/images` | tree `0367d459…` | 각 파일 SHA-256은 manifest |

- 전체 값은 `registered.json`에 있다. 조립·검산 시작 때 다음을 모두 검사하고 하나라도 어긋나면 **검증 실패**(4.3절)다: 커밋 존재, 경로의 blob ID, blob 바이트 재해시(SHA-1 `blob <n>\0`), 원바이트 SHA-256, 이미지 tree ID, tree 안 144개 `p###.png`의 manifest SHA-256·크기, PNG 디코딩 치수 = 예측 행 `width`·`height`(1280 × 960)·`pngSha256`, freeze의 예측 해시, 예측 144행의 ID 중복·누락·순서(`p000`…`p143`), manifest의 `selector/images` 항목 수 144.
- 채점 측 파일(`data/scoring/design.json`, `gold.json`, `render.json`)은 같은 커밋에서 읽고 manifest SHA-256과 대조한다. #153 `score-a/score.jsonl`은 같은 커밋 경로의 blob을 읽어 W1·W4 참조값 재현에만 쓴다. **이 넷은 조립(4절)에서 열 수 없다.**
- 수치·규칙을 보고 코호트·예측을 다시 고르지 않는다. 144쪽 전부가 분모다.

### 3.1 등록 전에 이미 본 것 (공개)

- #153 프로토콜·`RECOUNT_SPEC.md`·README, 예측 행 스키마, `score-a/summary.json`의 목록(`applied`, `event4`, `readingNewE1W4`)과 사유 분포(header_none 48, header_duplicate 44, no_target_candidate 22, applied 22, not_applicable 8), 매치 144(모두 한글 분기).
- 다섯 그림 사례의 #153 키·사유·W1 엄격 여부(p003 culture-c0-L-normal-same applied S, p050 culture-c0-R-normal-same applied S, p031 culture-c3-R-blank-below header_none S, p067 library-c0-L-dup-same header_duplicate S, p070 sports-c0-L-normal-same not_applicable F).
- p003의 예측 행 전체와 #153 채점 행(노출·others·귀속)을 열어 스키마를 확인했다. 그 과정에서 **p003 하나에 대해 이 문서의 H 규칙을 머릿속으로 적용해 본 값(H = [107, 143), B = [147, 215), 사이 4행)**을 보았다. 이 규칙(여백 = ceil((b−t)/4), x 범위 = B, 구분선 8px)은 요청서가 이미 고정한 것이고 이 계산으로 바꾸거나 고른 상수는 없다. 다른 143쪽에는 W5를 계산하지 않았고, W5 PNG·면적·노출은 0회 계산했다.
- 환경: Node v24.18.0, sharp 0.35.4(연구 lockfile), Python 3.12, Pillow 12.3.0(`research/tools/d03/requirements.txt` 핀).

## 4. 입력 경계와 데이터 흐름

### 4.1 조립(build) — gold를 모르는 단계

- 허용 목록 리더(`registered.json`의 `buildAllowlist`)만 거친다: #153 `data/manifest.json`, `replay-a/predictions.jsonl`, `replay-a/freeze.json`, `data/selector/images/p###.png`. 그 밖의 경로(`scoring/`, `score-*`, `ocr/`, `questions.json`, 설계·gold)는 거부한다(시험). 읽은 경로·blob·SHA-256을 `inputs.json`에 남긴다.
- **투영 계층:** 예측 JSON 전체는 무결성 확인과 투영 함수만 읽는다. 투영은 행마다 새 객체 `{id, pngSha256, width, height, state, w4Reason, w1, w2, w4, header}`를 만들고, `header`는 적용 쪽에서만 `{groups: [{x0, y0, x1, y1}]×3, target, comp}`(원래 십진 표기 문자열)다. OCR 텍스트, 질문, 파싱 결과, 그룹 텍스트·단어, 다른 진단은 넘기지 않는다. 키 집합이 등록값과 다르면 실패. 투영 결과는 깊게 동결(`Object.freeze`)되어 원래 입력 객체와 참조를 공유하지 않는다(시험: 키 집합, 동결, 원본 변경 무영향, OCR 문자열만 바꾼 합성 입력에서 좌표·픽셀 동일).
- **띠 계산 함수**는 투영 행 하나만 받는다(시험: 인자 수 1). 쪽 ID는 결합 키일 뿐 분기에 쓰지 않는다(시험: ID 치환 불변). 고정 22 ID와 그림 사례 ID는 조립 코드에서 참조하지 않는다(시험: 조립 소스 파일에 `fixed22`·`cases`·그 ID 문자열이 없음). 그림 사례 선택은 그림 생성 스크립트(조립 밖)에서만 한다.

### 4.2 동결과 채점 순서

1. 등록 커밋(이 문서, `registered.json`, `RECOUNT_SPEC.md`, 손계산 예제, JS·Python RED 시험, 인계서) → push → 즉시 Draft PR, `gh pr view`로 `isDraft`·head SHA·시각 확인.
2. RED 기록 커밋 → 구현 → 시험 GREEN.
3. 조립 A(`build`) → 144행 좌표 `coords.jsonl`, 출력-원본 대응, `manifest.json`(W1/W4/W5 파일·픽셀 해시), W5 PNG 144장, `inputs.json` → **조립 동결 커밋 → push**. W1/W4 PNG는 복원 명령과 해시로 고정한다(그림 사례 5쪽은 별도로 게시).
4. 동결 push **뒤에만** 채점기가 gold·설계·렌더와 #153 score를 연다. 채점기는 조립 출력이 HEAD 커밋 blob과 같은지, 채점 시작 UTC 시각을 기록한다.
5. 조립 B(새 폴더) → A와 전 파일 바이트 비교. 채점 B, A/B 비교, JS 검증, Python 독립 검산 A·B, 변조 시험, 결과 문서, 그림, 새 클론 재현, 연구·제품 검증, 인계서.

- 시각 기록: 등록·RED·구현·동결 커밋 시각(Git), push 뒤 원격 추적 ref 갱신 시각(reflog), Draft PR 생성 시각(GitHub), 최초 채점 시작 시각(채점기)을 출처별로 UTC·KST로 인계서에 적는다.

### 4.3 사유표 (우선순위 = 위에서부터, 첫 해당이 배타적)

| 순위 | 조건 | 분류 | W5 출력 |
|---|---|---|---|
| 0 | 소스 핀·blob·SHA-256·tree·PNG 치수/해시·ID 집합·순서·필수 출력 누락 | **검증 실패** (`integrity_*`) | 실행 중단, `stop.json`만 쓰고 종료 2 |
| 1 | 예측 `state`가 오류 | `upstream_error` | 없음(null). 표시 성공 아님 |
| 2 | 예측 `state`가 미매치 | `upstream_unmatched` | 없음(null). 표시 성공 아님 |
| 3 | `w4Reason ≠ "applied"` | `w4_not_applied` (정상 W1 복귀) | W1 그대로 |
| 4 | 적용인데 동결 계약 손상(4.4절) | **검증 실패** (`contract_*`) | 실행 중단, 종료 2 |
| 5 | 적용, 어느 머리글 그룹이라도 `floor(gl) < B.left` 또는 `ceil(gr) > B.right` | `header_outside_body_width` (정상 W1 복귀) | W1 그대로 |
| 6 | 적용, H와 B가 겹치거나 닿음, H ⊆ B | `merged_contained` | B 그대로 한 조각 |
| 7 | 적용, H와 B가 겹치거나 닿음, 그 밖 | `merged` | 합집합 y 구간 한 조각 |
| 8 | 적용, H.bottom < B.top (사이 원본 행 ≥ 1) | `two_bands` | H, 구분선 8px, B |
| 9 | 적용, H.top > B.bottom (H가 B 아래로 떨어짐) | `header_below_body` (정상 W1 복귀) | W1 그대로 |

- 정상 W1 복귀는 3·5·9번뿐이다. 편의상 W1로 돌아가 검증 실패를 숨기지 않는다. 1·2번은 고정 입력에서 생기지 않는다(#153 144쪽 모두 매치). 생기면 분모에 남기고 모든 표시 방식에서 실패로 센다.
- 오류 전파: 0·4번 검증 실패는 그 실행 전체를 불완전으로 기록하고 손상 쪽을 빼서 계속하지 않는다.

### 4.4 동결 계약 (적용 행에서 검사, 어기면 `contract_*` 검증 실패)

- `contract_header_line`: `w4Diag.qualified`가 정확히 `[w4Diag.header.line]`(선택 줄 = 유일한 자격 줄).
- `contract_line_ids`: `w4Diag.lines`의 `line` 값이 중복 없음, 선택 줄 원소가 정확히 1개 있음.
- `contract_group_count`: 선택 줄 원소의 `why == "eligible"`, `groups` 길이 3.
- `contract_group_failure`: 선택 줄 원소의 `failure == null`.
- `contract_index`: `header.target`, `header.comp`가 각각 {1, 2}이고 서로 다름, `header.match[target−1] == true`, `header.match[comp−1] == false`.
- `contract_box`: 세 그룹 `box`가 각각 길이 4의 십진 문자열이고 유한, `x0 < x1`, `y0 < y1`, 페이지 안(`0 ≤ x0`, `x1 ≤ width`, `0 ≤ y0`, `y1 ≤ height`).
- `contract_window`: `w1`·`w2`·`w4`가 페이지 안의 양의 정수 창, `w2 ⊆ w1`.
- `contract_w4_not_w2`: `w4From == "w2"`이고 `w4 == w2`(값).
- 미적용 행: `w4 == w1`, `w4From == "w1"`(아니면 `contract_w4_not_w2`와 같은 계열의 `contract_window`).

## 5. W5 구현 계약

### 5.1 띠 (모든 수는 #153 동결 십진 표기의 정확한 유리수, 픽셀 좌표는 반열림 정수)

- 본문 B = 적용 쪽의 W4 창(= W2): `B = [B.left, B.top, B.right, B.bottom) = [w4.left, w4.top, w4.left + w4.width, w4.top + w4.height)`.
- 머리글 그룹: 선택 줄의 **세 그룹 전체**(`box = [x0, y0, x1, y1]`). `t = min(y0)`, `b = max(y1)`, 여백 `p = ceil((b − t)/4)`(원본 픽셀, 정수).
- `H.top = max(0, floor(t) − p)`, `H.bottom = min(height, ceil(b) + p)`, `H.left = B.left`, `H.right = B.right`(B의 가로 범위 그대로).
- x 포함(그룹마다): `floor(gl) ≥ B.left` 그리고 `ceil(gr) ≤ B.right`. 같으면 포함, 0.01px이라도 벗어나면 5번 사유. 원본 잉크가 OCR 상자보다 넓으면 출력에서 잉크 일부가 잘릴 수 있다. 이것은 실제 PNG와 gold 잉크로 판정한다(보정하지 않음).
- 관계(반열림 y 구간 `[H.top, H.bottom)`, `[B.top, B.bottom)`): `H.bottom ≥ B.top` 그리고 `H.top ≤ B.bottom`이면 겹침 또는 닿음 → 6·7번(합집합 `[min top, max bottom)` 한 번만). `H.bottom < B.top` → 8번. `H.top > B.bottom` → 9번.
- 다른 여백, 열별 자르기, 내용 재배치, 글자 다시 쓰기, 스케일 조정, 데이터 기반 보정은 없다.

### 5.2 조립 (출력 그림)

- 출력 폭 = `B.right − B.left`(W1 복귀는 W1 폭). 원본 x는 모든 조각에서 `display x = source x − left`(같은 열이 같은 출력 x).
- `two_bands`: 출력 행 순서 = H 행(원본 y 오름차순), 구분선 8행, B 행. 구분선 행 r(0–7)의 모든 픽셀 = `[224, 224, 224, 128, 128, 224, 224, 224][r]`(8비트 단일 채널). 구분선은 원본 출처가 없는 표시 요소다.
- `merged*`/W1 복귀: 한 조각, 원본 그대로.
- 기록(`coords.jsonl`, 행마다): `{id, w5Reason, w5Kind ("w1"|"body"|"merged"|"two_bands"|null), page {width, height}, pngSha256, w1, w4, B, H, t, b, p, pieces, display {width, height}}`. `pieces`는 출력 위에서 아래 순서로 `{kind: "source", sourceRect, displayRect}` 또는 `{kind: "separator", displayRect, luma}`. 각 조각의 sourceRect → displayRect 변환으로 원래 페이지 좌표를 되찾는다. 이 변환은 끊어진 두 띠 사이에 원본 행이 연속한다는 뜻이 아니며, 결과 그림 범례에 그렇게 적는다.

### 5.3 PNG

- W1·W4·W5 모두 리사이즈 없는 무손실 8비트 회색(PNG 색 유형 0, 1채널, 비인터레이스) PNG. 연구 lockfile의 sharp 0.35.4로 원본을 raw 1채널로 디코딩하고(채널 ≠ 1이면 실패), 메모리에서 행 단위로 복사·조립해 `sharp(raw, {raw: {width, height, channels: 1}}).png({compressionLevel: 9, adaptiveFiltering: false, palette: false})`로 쓴다.
- 해시는 셋을 구분한다: 파일 SHA-256(바이트), 디코딩 픽셀 SHA-256(행 우선 1채널 바이트), 치수. 메타데이터만 다른 PNG는 파일 해시가 다르고 픽셀 해시가 같다(변조 시험으로 구분).
- 게시: W5 144장 전부(`results/ko-header-strip/build-a/w5/`). W1·W4는 `build` 명령으로 복원하고 `manifest.json`의 해시로 대조한다. 그림 사례 5쪽은 원본·W1·W4·W5 원해상도 PNG를 `results/ko-header-strip/figures/`에 둔다. 축소 그림은 설명용이며 채점에는 원해상도 좌표를 쓴다.

### 5.4 두 경로 검증 (모든 실제 이미지)

- **경로 1 (JS, 조립과 다른 함수):** 쓴 PNG 파일을 다시 디코딩해 원본 raw에서 `pieces`만으로 다시 만든 기대 픽셀과 전체 비교, W1·W4 PNG도 원본 창 crop과 비교.
- **경로 2 (Python 검산기, Pillow 디코딩):** 예측 원문에서 투영·띠·관계를 독자 계산하고 원본 PNG에서 기대 그림을 재구성해 게시된 W5 PNG 픽셀, `coords.jsonl`, `manifest.json` 전체와 비교. 검사: 원본 좌표 복원(조각별 원본 픽셀 = 출력 픽셀), 행 순서(원본 y 오름차순), 구분선 위치·높이·밝기, 조각 간 원본 행 중복 없음, 모든 조각의 같은 x 범위, 글자 재작성 없음(디코딩 픽셀 동일), 미적용 122쪽의 W5 = W1(치수·픽셀 해시).
- 변조 시험(9절)과 손계산 시험(10절)을 둔다.

## 6. 측정 (채점, 동결 뒤)

### 6.1 노출과 엄격 성공

- **source union:** W5 원본 출처 y 구간(모든 조각이 같은 x 범위 `[L, R)`)을 겹치거나 닿으면 병합한 구간 목록. W1/W4는 창 하나.
- 잉크 상자(렌더러 `getbbox` 반열림, #153 `render.json`) e = `[x0, y0, x1, y1)`의 노출: `L ≤ x0`, `x1 ≤ R`이고 **하나의** 병합 구간 `[a, c)`에 `a ≤ y0`, `y1 ≤ c` → `full`; 아니면서 어느 구간과 양의 면적 교집합(가로 `min(x1,R) − max(x0,L) > 0`, 세로 `min(y1,c) − max(y0,a) > 0`) → `partial`; 그 밖(맞닿음 포함) → `none`. 구분선 행은 근거로 세지 않는다. 항목이 없으면(공란 머리글) `source_missing`. 묶은 면적을 하나의 바깥 직사각형으로 계산하지 않는다.
- **엄격 성공(W5):** 표시 성공(W5 ≠ null) ∧ `0 < 원본 고유 픽셀 수 < 페이지 면적` ∧ 목표 표지(`anchorItem`)와 정답 값(`valueItem`) 잉크가 각각 full. W1·W4는 같은 함수를 창 하나로 적용하며, 그 결과가 #153 `score.jsonl`의 `w1`·`w4` 엄격 성공·면적·노출(`exposure.w1/w4`)·`others.items`의 w1/w4 값과 **144쪽 모두 같아야 한다**(참조 재현, 어긋나면 검증 실패).

### 6.2 손실과 다른 레코드 값 제외

- `L5` = W1 엄격 성공에서 W5 실패로 바뀐 쪽 / W1 엄격 성공 수(분모 #153 W1 엄격 136). 전이 `t15`, `t45`(keptSuccess/recovered/lost/bothFail).
- **공통 기회 J**(#153 그대로, 종전 136쪽): 매치 ∧ W1 엄격 ∧ `w2Reason == "cut"` ∧ W1 안 `otherValueItems` 중 full ≥ 1. `Jk` = 기회 ∧ Wk 엄격 ∧ W1에서 full이던 그 값 중 하나 이상이 Wk에서 none. k = 4(참조 재현, 22), 5. **J4 유지** = J4 ∩ J5 / J4.
- **재노출:** 적용 쪽에서 `otherValueItems`의 항목 중 W1 full ∧ W4 none ∧ W5 ∈ {partial, full}인 항목 수, 쪽 수, 원본 수. 
- **전이표:** 144쪽 `otherValueItems` 전체 항목(288)의 (W1, W4, W5) 노출 조합 개수. 같은 레코드 경쟁 값(`compValueItem`)은 별도 표(W1/W4/W5 full/partial/none).

### 6.3 읽기 사건 (정상 머리글 48쪽, #153 정의 그대로)

- `E1_k` = 목표 표제 none ∧ 경쟁 값 full, `E2_k` = 목표 표제 ∈ {partial, none} ∧ 경쟁 값 ∈ {partial, full}. k = W1, W4, W5.
- W5의 새 사건: W1 기준(`E_W5 ∧ ¬E_W1`)과 W4 기준(`E_W5 ∧ ¬E_W4`) 각각, 쪽·원본 수. **고정 22쪽**에서 W4의 E1 22건 중 W5에서 해소(`¬E1_W5`)·잔존 수.
- 노출 표: 정상·공란·중복 × W1/W4/W5 × {목표 표제, 경쟁 표제, 경쟁 값, 목표 값}의 full/partial/none/source_missing. 고정 22쪽은 쪽마다 네 항목의 노출과 출력 위치(display 좌표)를 공개한다.
- **4항목 기하 지표:** 목표 표제·경쟁 표제·목표 값·경쟁 값이 W5에서 모두 full ∧ x 정렬 유효(모든 조각의 `display x = source x − B.left`, 5.4절 픽셀 검증 통과) ∧ #153 gold 귀속이 `correct`. 고정 22쪽의 수.
- 원래 없는 머리글(공란)이나 중복 머리글을 복원했거나 읽을 수 있다고 보지 않는다. 공란·중복은 노출표만 공개한다.

### 6.4 면적

- 쪽마다 세 양을 분리한다: 원본 고유 픽셀 수(source union 면적), 구분선 픽셀 수(8 × 폭 또는 0), 표시 이미지 픽셀 수(출력 폭 × 높이).
- `ΔW1_k`(감소 %p) = `100 × (W1 면적 − k 면적) / 페이지 면적`, `ΔW4_W5`(증가 %p) = `100 × (W5 원본 고유 − W4 면적) / 페이지 면적`. W5는 원본 고유 기준과 표시 기준을 각각 낸다. 쪽별 정확한 분수의 산술평균을 기약분수로 남기고 공개 표에서만 반올림(`floor(x·100 + 1/2)/100`, 음수는 절댓값에 `-`, 소수 둘째 자리). 묶음: 전체 144, 고정 22, 그 밖 122, 원본 12개 각각.
- 표시 면적이 W1보다 큰 쪽 수, W5 원본 출처 행이 W1 창 밖에 있는 쪽 수(H가 W1 위로 나감)를 센다.
- PNG 파일 크기·모델 입력 토큰·UX 효과는 면적과 다른 양이며 이번에 재지 않는다(파일 크기는 기록만).

### 6.5 분리 표

전체, 고정 22, 그 밖 122, W5 사유별, side, header, ans, 2×3×2 셀 12개, 원본 12개, **72 좌우쌍**(같은 원본·header·ans; W5 사유·엄격·E1·4항목이 다른 짝 목록). 분모 0은 `—`와 "분모 0"으로 둔다. 평가 불가·기술 오류를 따로 센다.

## 7. 사전등록 판정 (이 코호트에서 기하적 개선의 필요조건)

| 조건 | 정의 | 통과 |
|---|---|---|
| C1 | L5 = 0 ∧ W4 미적용 122쪽 모두 W5 = W1(치수·픽셀 해시 일치) | 둘 다 |
| C2 | 고정 22쪽: W5 E1 0(22/22 해소) ∧ 22쪽 모두 4항목 지표 참. 정상 48쪽: W1 대비 새 E1 0 ∧ 새 E2 0 | 모두 |
| C3 | J4 ⊆ J5(22/22 유지) ∧ 재노출 항목 0 | 둘 다 |
| C4 | 조립 A/B 바이트 일치, JS 경로 1 전체 일치, Python 검산 A·B 종료 0, #153 W1/W4 참조 재현 일치, 22 ID 집합 동등(등록 = 적용 = J4 = W4 새 E1) | 모두 |

- `verdict = pass`이면 결론은 "**이 144쪽 재생에서 W4의 기하적 표시 손실을 고쳤다**"까지다. 면적 비용은 따로 밝히고, 사용자 채택 결정을 대신하지 않는다. 개별 지표와 실패한 조건을 따로 보고한다. 분모 0은 통과로 세지 않는다(`not_evaluable`).
- 골드 잉크가 OCR 그룹 상자보다 넓으면 머리글이 partial이 될 수 있다(5.1절). 그 경우 C2가 실패하며 그대로 보고한다.

## 8. 시각 확인 (연구자 육안 점검)

- 등록 사례(조립 밖 그림 스크립트만 참조): 정상 좌우 짝 `p003`(L) / `p050`(R), 공란 W1 유지 `p031`, 중복 W1 유지 `p067`, 고정 K1 실패 `p070`. 새 데이터를 보고 바꾸지 않는다.
- 각 사례의 원본·W1·W4·W5 원해상도 PNG를 사람이 읽을 수 있는 크기로 열어, W5에서 목표·경쟁 머리글과 두 값의 글자, 구분선 위치를 읽고 기계 판정(노출)과 맞는지 기록한다. 이것은 연구자 육안 점검이며 사람 QA나 판독성 평가가 아니다.

## 9. 변조 시험 (Python `--mutate`, 메모리 사본)

`registered.json`의 `tampers` 17종: W5 한 조각 1px 가로 이동, 좌우 뒤집기, 좌표 y 한 줄 어긋남, 띠 순서 교환, 겹친 행 중복, 출처 누락, 잘못된 출처(다른 x), 구분선 밝기 변경, 구분선 높이 변경, W1 유지 쪽 픽셀 변경, 픽셀 값 +1(작은 값 차이), PNG 메타데이터만 변경(파일 해시만 다름 → "메타데이터만"으로 분류되고 픽셀 불일치로 세지 않아야 함), manifest 파일 해시, 잘못된 gold 결합(두 쪽 gold 교환), 분모 교환(J 기회와 J5), 22 ID 하나 제거, 판정 코드 변경. 각각 기대 검출 범주로 거부돼야 한다. 해당 사례가 실제 결과에 없으면 `notApplicable`과 이유를 적는다.

## 10. 시험 (등록 커밋, 구현 전 RED)

- 손계산 예제 `research/tools/ko-header-strip/example/example.json`(합성 40 × 30 페이지, 코호트 아님): 두 띠, 정확한 접촉(병합), 1px 간격(두 띠), 일부 겹침, 포함, 완전 분리 아래(W1 복귀), 양끝 잘림(위 0, 아래 높이), 소수 좌표 floor/ceil과 여백 경계(4로 나눠떨어짐·0.01 초과), x 경계 정확히 일치(허용)와 0.01 초과(복귀), 좁은 창에 걸친 머리글, W4 미적용, 상위 오류, 계약 손상 8종, OCR 문자열만 다른 입력의 불변, 노출(두 구간·사이 빈 영역·맞닿음·x 초과), 면적·반올림.
- JS `research/test/ko-header-strip.test.mjs`, Python `research/tools/ko-header-strip/test_recount.py`가 같은 예제를 각각 시험한다. 추가로 JS: 허용 목록 거부, 투영 키·동결, 인자 수, ID 치환 불변, 조립 소스에 등록 ID 없음, 픽셀 합성(두 띠·구분선), PNG 왕복(파일·픽셀 해시 구분).
- 구현 중 시험이나 예제를 바꾸면 커밋 메시지와 인계서에 이유를 적는다. 판정 규칙은 바꾸지 않는다.

## 11. 산출물·소유 경로·완료 조건

- 소유(신규 파일만): `research/plans/2026-11-25-ko-header-strip-protocol.md`, `research/src/ko-header-strip-*.mjs`, `research/test/ko-header-strip.test.mjs`, `research/tools/ko-header-strip/`, `research/results/ko-header-strip/`, `docs/agent/handoffs/ko-header-strip-replay.md`. 의존성 추가·lockfile 변경·제품 코드·기존 연구 파일·원고·WBS·전역 설정 변경 없음.
- 완료 조건: 시험 GREEN, 조립 동결 push 뒤 최초 채점, A/B 바이트 일치, 검산 A·B 종료 0, 변조 거부, 결과·그림, 새 원격 클론에서 README 전체 명령 재현, 연구 회귀·제품 7단계, 인계서, 깨끗한 작업 트리와 원격 head = PR head. Ready·merge·제품 적용은 하지 않는다.
