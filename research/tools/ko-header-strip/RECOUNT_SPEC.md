# 독립 검산 명세 — ko-header-strip (W5: 원본 머리글 띠 + 선택 행)

제3자가 이 문서, 프로토콜 `research/plans/2026-11-25-ko-header-strip-protocol.md`, `registered.json`, 손계산 예제 `example/example.json`, #153 원자료만으로 검산기를 쓸 수 있도록 적은 명세다. 연구 JS 코드(`research/src/ko-header-strip-*.mjs`)를 읽지 않아도 된다.

## 0. 산출물과 실행

- `research/tools/ko-header-strip/recount.py` — Python 3.12 표준 라이브러리 + Pillow 12.3.0(PNG 디코딩·재인코딩 변조에만).
  `python recount.py --build <build dir> --score <score dir> [--results <RESULTS.md>] --out <recount.json>`
  #153 객체는 `git cat-file`로 직접 읽고 `registered.json` 핀과 대조한다. 모두 통과하면 종료 0, 불일치 1, 입력 손상으로 시작 불가 2. `--mutate <mutation.json>`은 변조 시험(프로토콜 9절)이다.
- `research/tools/ko-header-strip/test_recount.py` — `unittest`, 손계산 예제 전체.
- 모듈 함수(시험이 부른다): `dec(s)`(십진 문자열 → `Fraction`), `project(pred)`, `plan(proj)`, `compose(plan, src_rows)`(→ 행 목록 `bytes`), `merge_intervals(iv)`, `exposure(ink, plan)`, `area(plan)`, `pp_text(fr)`, 예외 `ContractError(code)`, `IntegrityError(code)`.

## 1. 입력

- `<build dir>`: `coords.jsonl`(144행, ID 순서), `manifest.json`, `inputs.json`, `w5/p###.png`(144), 선택적으로 `w1/`, `w4/`(복원 시).
- `<score dir>`: `score.jsonl`(144행), `summary.json`.
- #153 객체: `registered.json`의 `source.files`, 이미지 tree, `scoringFiles`.
- JSONL은 LF, 마지막 줄 바꿈 하나, CR·빈 줄 없음(아니면 손상).

## 2. 투영과 계약 (프로토콜 4.3–4.4)

- `project(pred)`는 프로토콜 4.1절의 키만 가진 새 dict를 돌려준다. 창 `{left, top, width, height}`는 정수, 머리글 그룹 상자는 원래 십진 문자열. 계약 검사는 프로토콜 4.4절 순서(`contract_header_line`, `contract_line_ids`, `contract_group_count`, `contract_group_failure`, `contract_index`, `contract_box`, `contract_window`, `contract_w4_not_w2`)이고 첫 실패의 코드로 `ContractError`를 낸다. 창 검사(`contract_window`)는 매치 행 모두에 먼저 적용한다.
- 오류·미매치 행: `state`가 `"error"`/`"unmatched"`이면 `header = null`, 창은 `null` 허용.

## 3. 띠와 조립 (프로토콜 5.1–5.2)

- `plan(proj)` → `{reason, kind, B, H, t, b, p, pieces, display}`. `t`, `b`는 `dec_str`(정확한 십진 표기: 정수면 정수, 아니면 유한 소수, 뒤 0 없음), `p`는 정수, 사각형은 `[x0, y0, x1, y1]` 정수. W1 복귀·미적용은 `B = H = t = b = p = null`(단 `header_outside_body_width`·`header_below_body`는 B·H·t·b·p를 기록), `pieces = [{kind: "source", sourceRect: W1 사각형, displayRect: [0, 0, w, h]}]`.
- `kind`: `w4_not_applied`·`header_outside_body_width`·`header_below_body` → `"w1"`, `merged_contained` → `"body"`, `merged` → `"merged"`, `two_bands` → `"two_bands"`, 오류·미매치 → `null`(`pieces = []`, `display = null`).
- `compose`: 출력 행 = 조각 순서대로, 원본 조각은 원본 행 `y`(sourceRect y 범위)의 `x0..x1` 바이트, 구분선 조각은 `luma[r]` 바이트 × 폭.

## 4. 파일 검증

- `coords.jsonl` 행 = `plan(project(pred))`에 `{id, pngSha256, page, w1, w4}`를 더한 것(키 순서: `id, w5Reason, w5Kind, page, pngSha256, w1, w4, B, H, t, b, p, pieces, display`). 정규화 JSON 비교.
- `manifest.json`: `{version, source {commit, imageTree, predictionsSha256}, tools {node, sharp, libvips}, outputs: {w1: {p###: entry}, w4: {...}, w5: {...}}}`, `entry = {file, bytes, sha256, width, height, pixelSha256}`(오류·미매치 W5는 `null`). 파일이 있는 출력은 바이트 길이·SHA-256, Pillow 디코딩(모드 `L`, 치수) 픽셀 SHA-256을 다시 계산해 같아야 한다. W1·W4 엔트리는 원본 crop의 픽셀 해시와 같아야 한다(파일이 없으면 픽셀 해시만 검사).
- W5 PNG 픽셀 = `compose(plan, 원본 픽셀)`. 미적용·W1 복귀 쪽: W5 픽셀 해시·치수 = W1 엔트리.
- 구조 검사: 조각의 원본 y 구간이 서로 겹치지 않음, 원본 y 오름차순, 모든 원본 조각의 x 범위 같음, displayRect 높이 = sourceRect 높이, 구분선 높이 8·밝기 등록값, 출력 행 수 = 조각 높이 합.
- 분류: 파일 해시만 다르고 픽셀 해시가 같으면 `metadata_only`, 픽셀이 다르면 `pixel_mismatch`, 치수가 다르면 `dimension_mismatch`.

## 5. 채점 (프로토콜 6절)

- 노출: `exposure(ink, plan)` — `plan`의 원본 조각을 병합한 구간 목록과 x 범위로 프로토콜 6.1절 규칙. W1·W4는 창 하나로 같은 함수.
- `score.jsonl` 행(키 순서): `id, key, source, side, header, ans, cell, fixed22, w4Reason, w5Reason, w5Kind, strict {w1, w4, w5}, area {page, w1, w4, w5Source, w5Separator, w5Display}, sourceOutsideW1Rows, t15, t45, exposure {w1, w4, w5: {anchor, targetValue, targetHeader, compHeader, compValue}}, others {items: [{item, w1, w4, w5}], reexposed}, opportunity, event4, event5, reading {e1 {w1, w4, w5}, e2 {…}} | null, attribution, fourItems, placement`.
  - `attribution`: #153 score 행의 `attribution.outcome`(적용 쪽) 또는 `null`.
  - `fourItems`(적용 쪽만, 그 밖 `null`): W5 네 항목 full ∧ `xAligned` ∧ `attribution == "correct"`. `xAligned` = 모든 원본 조각에서 `displayRect.x0 == sourceRect.x0 − B.left`이고 폭이 같음.
  - `placement`(적용 쪽만): 네 항목마다 잉크 상자가 full로 들어간 조각을 거쳐 옮긴 출력 좌표 `[x0, y0, x1, y1]` 또는 `null`.
  - `t15`, `t45`: `keptSuccess`/`recovered`/`lost`/`bothFail`.
  - `reexposed`: `otherValueItems` 중 W1 full ∧ W4 none ∧ W5 ∈ {partial, full} 수.
- `summary.json`: `{version, buildCommit, coordsSha256, scoreStartedUtc, pageArea, groups, lists, transitions, compValue, exposureTable, pairs, verdict}`.
  - 그룹 키(순서): `total`, `fixed22`, `other122`, `w5Reason` 8개, `side` L/R, `header` normal/blank/dup, `ans` same/below, `cell` 12개(#153 순서), `source` 12개(#153 design 순서).
  - 그룹 블록: `n, shown, strict {w1, w4, w5}, L5 {count, denom, sources}, t45 {…4}, opportunity, J4, J5, J4kept {count, of}, reexposed {items, pages, sources}, reading {pages, e1 {w1, w4, w5}, e2 {…}, newE1W1, newE1W4, newE2W1, newE2W4, resolvedE1W4}, fourItems {count, of}, area {w5SourceVsW1, w5DisplayVsW1, w4VsW1, w5SourceVsW4: {num, den}, displayGtW1, sourceOutsideW1}`. 면적 분수 = 쪽별 정확한 분수(%p)의 산술평균, 기약, `num`/`den`은 10진 문자열, 쪽 0이면 `null`.
  - `lists`: `fixed22Applied`, `j4`, `j5`, `newE1W4`(#153 W4의 W1 대비 새 E1), `e1W5`, `reexposedPages`, `w1KeptPixelMismatch`, `fourItemsFail`(ID 순서).
  - `transitions`: 288 다른 레코드 값 항목의 `"<w1>/<w4>/<w5>"` → 개수. `compValue`: 매치 쪽 `{w1, w4, w5: {full, partial, none}}`. `exposureTable`: header × 창 × 항목 × {full, partial, none, source_missing}.
  - `pairs`: 72쌍(원본 · header · ans), L/R의 `w5Reason`·`strict.w5`·`reading.e1.w5`·`fourItems` 중 다른 필드가 있는 쌍 목록.
  - `verdict`: `C1 {L5, w1KeptMatch, of, pass}`, `C2 {fixedE1W5, fourItems, of, newE1W1, newE2W1, normalPages, pass}`, `C3 {J4, J4kept, reexposedItems, pass}`, `C4 {checks: {...}, pass}`, `status` (`pass`/`fail`/`not_evaluable`), `failed`(조건 이름 목록). 분모 0은 `not_evaluable`.

## 6. 공개 표 (RESULTS.md)

`<!-- khs:table NAME -->`와 `<!-- /khs:table -->` 사이 표를 칸 단위로 비교한다. 칸: 정수 10진, `null` → `—`, 분수 `a/b`, %p = `pp_text`(0 이상 `floor(x·100 + 1/2)/100`, 음수는 절댓값 결과에 `-`, 항상 소수 둘째 자리). 표 이름: `groups`, `reasons`, `reading`, `area`, `transitions`, `compValue`, `exposure`, `fixed22`, `verdict`. 열 정의는 구현이 RESULTS.md 표 머리글로 고정하며 검산기는 `summary.json`에서 같은 표를 독자적으로 만들어 비교한다.

## 7. 변조 (프로토콜 9절)

`registered.json`의 `tampers` 순서대로, 각 변조의 기대 검출 범주:

| 변조 | 대상(메모리 사본) | 기대 검출 |
|---|---|---|
| w5_segment_shift_x1 | 두 띠 쪽 W5의 B 조각 픽셀을 1px 오른쪽으로 | pixel_mismatch |
| w5_flip_horizontal | 두 띠 쪽 W5 좌우 반전 | pixel_mismatch |
| coords_y_off_by_one | coords B 조각 sourceRect y +1 | coords_mismatch |
| band_order_swap | W5 픽셀의 H·B 순서 교환(구분선 유지) | pixel_mismatch |
| overlap_rows_duplicated | 병합 쪽(없으면 두 띠 쪽)을 H행 + B행 단순 연결로 | dimension_mismatch 또는 pixel_mismatch |
| provenance_missing | coords 원본 조각 하나 삭제 | coords_mismatch |
| provenance_wrong | coords 원본 조각 sourceRect x +260 | coords_mismatch |
| separator_luma_changed | W5 구분선 128 행 한 픽셀 127 | pixel_mismatch |
| separator_height_changed | coords 구분선 높이 9 | coords_mismatch |
| w1_kept_pixel_changed | 미적용 쪽 W5 한 픽셀 +1 | pixel_mismatch |
| pixel_value_plus_one | 두 띠 쪽 W5 원본 조각 한 픽셀 +1 | pixel_mismatch |
| png_metadata_only | W5 PNG에 tEXt 청크 추가(픽셀 동일) | metadata_only(파일 해시만 다름, 픽셀 일치로 분류) |
| manifest_file_hash | manifest W5 sha256 한 글자 변경 | manifest_mismatch |
| gold_join_swapped | 두 쪽의 gold 결합 교환 후 재채점 | score_mismatch |
| denominator_swapped | summary total.opportunity ↔ total.J5 | summary_mismatch |
| fixed22_id_removed | 등록 22 집합에서 하나 제거 | fixed22_mismatch |
| verdict_changed | summary.verdict.status 변경 | summary_mismatch |

## 8. 손계산 예제

`example/example.json`. `plans`(투영 행 → 기대 `plan`), `contracts`(손상 행 → 기대 코드), `exposures`(plan + 잉크 → 기대), `areas`, `pp`, `pixels`(합성 40 × 30 원본 `v(x, y) = (7x + 13y) mod 256` → 기대 출력 행).
