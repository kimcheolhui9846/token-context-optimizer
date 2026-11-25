# ko-header-column 결과 — OCR 열 머리글과 질문 필드를 연결한 W4

- 프로토콜: `research/plans/2026-11-25-ko-header-column-protocol.md`(사전등록 `18500af`)
- 검산 명세: `research/tools/ko-header-column/RECOUNT_SPEC.md`
- 재현: 같은 폴더의 `README.md`

이 문서의 표는 `src/ko-header-column-report.mjs`가 `score-a/summary.json`에서 기계로 생성한 것이다. `tools/ko-header-column/recount.py`가 표 칸과 9절 사례 블록을 원자료와 다시 대조한다. 손으로 고친 표 칸은 없다.

## 0. 요약

- **최종 판정 코드: `geometry_ok_reading_worse`.** 기하 필요조건은 G1–G4 모두 통과했지만 읽기 근거가 악화됐다. 등록된 2×2 판정표의 "기하는 충족했지만 읽기 근거 악화로 권고 보류" 칸이다.
- 입력은 다음과 같다.
  - 144쪽 = 12원본 × 12변형
  - OCR 1회, 오류 0/144, 미매치 0/144
  - 재생 A/B 바이트 동일
- 기하 결과:
  - W4 엄격 성공은 136/144이고, W1(136)과 같다. W2는 68, W3는 69였다.
  - W1 성공에서 잃은 쪽: L4 = 0/136. 비교: L2 = 68/136, L3 = 67/136.
  - W4는 L3 67쪽을 모두 피했다(12원본).
  - W3→W4 새 손실은 0/69, 회복은 67/75다.
- **분모(144쪽):**
  - W2가 실제로 자른(`cut`) 쪽: 136
    - W4 적용(W2 선택): 22
    - W4 판정 단계 보류: 114 = 공란 `header_none` 48 + 중복 `header_duplicate` 44 + 정상·아래 줄 답 `no_target_candidate` 22
  - W2 `inherit` 쪽: 8. 모두 `sports-c0`이고 W4는 `not_applicable`(미적용)이다.
  - 그러므로 W4가 기존 W1 창과 같은 쪽은 122 = 114 + 8이다(`w4From: w1` 122, `w2` 22).
- W4 적용(W2 선택)은 22쪽이다.
  - 22쪽 모두 정상 머리글·같은 줄 답(`normal-same`)이고, 11원본 × 좌우 2쪽이다.
  - gold 귀속: 정답 22/22(L 11, R 11), 오선택 0, 미확정 0.
  - J4(다른 레코드 질문 필드 값 제외)는 22쪽 11원본이다. 좌우 각각 11원본이다.
  - 공란·중복 머리글 쪽의 적용은 0이다.
- 읽기 근거: 적용 22쪽 **전부**에서 W1 대비 새 E1이 생겼다(11원본).
  - 기존 W1 창에서 온전히 보이던 목표 열 표제가 W4 창에서 사라진다.
  - 같은 레코드의 경쟁 값은 온전히 남는다.
  - 즉 창 안에 값 두 개가 표제 없이 남는다. 3.4절 등록 예측표의 "설계상 예상되는 읽기 근거 악화"가 목표 슬롯 0 원본에 그치지 않고 적용된 모든 원본에서 나타났다.
- W4가 W2를 고른 곳은 W2가 이미 엄격 성공하던 쪽뿐이다. W4의 기하 이득은 다음 두 가지다.
  1. 판정 단계에서 보류한 114쪽에서 기존 W1 창을 유지해 W2·W3 손실을 막는다. 미적용 8쪽은 기존 W1 창부터 실패하므로 막을 손실이 없다.
  2. 적용 쪽에서 W2의 다른 레코드 값 제외를 지킨다.
- 이 결과는 합성 분포와 고정 OCR 한 번에 대한 기술 통계다. 제품 기본값을 바꾸지 않는다(2.절, 10절).

## 1. 자료와 처리 경과

| 단계 | 커밋 | 커밋 시각(KST) | 커밋 시각(UTC) | push(원격 추적 ref 갱신, KST) |
|---|---|---|---|---|
| 사전등록(프로토콜·설계·시험) | `18500af` | 2026-11-25 09:16:29 | 00:16:29 | 09:16:32 (Draft PR #153 생성 00:16:41 UTC) |
| RED 기록 | `cb1b82a` | 09:17:03 | 00:17:03 | 09:17:05 |
| 구현(시험 GREEN) | `9a223f6` | 09:32:12 | 00:32:12 | 09:32:15 |
| 자료 동결(144쪽) | `cbb71f2` | 09:33:28 | 00:33:28 | 09:33:31 |
| 자료 핀(`DATA_COMMIT`·`MANIFEST_SHA256`) | `f75d739` | 09:33:38 | 00:33:38 | 09:33:40 |
| OCR 1회 → OCR·K1 동결 | `2f633cb` | 09:36:01 | 00:36:01 | 09:36:03 |
| 재생 A 예측 144행 동결 | `6da4285` | 09:36:20 | 00:36:20 | 09:36:22 |
| **첫 채점(A) 시작** | — | 09:36:26.291 | 00:36:26.291 | `score-a/score-meta.json`, HEAD `6da4285`, `predictionsCommittedAtHead: true` |

- OCR 실행 구간은 00:33:53Z–00:35:45Z다(`logs/ocr-started-utc.txt`, `logs/ocr-ended-utc.txt`).
  - 실행기 기록: `ocr/run-meta.json`의 `startedAt` 00:34:00.313Z, 총 104,965ms
- 오프라인 가드(`tools/d03/guard/node-netguard.cjs`)는 켜져 있었고 차단 0건이다(`ocr/guard-summary.json`, `logs/net-ocr.log`).
- 엔진과 고정 입력:
  - tesseract.js 5.1.1, tesseract.js-core 5.1.1, 언어 `eng+kor`(이 순서), OEM 1, 작업자 1개
  - 언어 파일 SHA-256: eng `5dc5d8d6…d400b747`(5,199,098 B), kor `ec174937…81132109992`(2,208,378 B)
  - 글꼴: `NotoSansKR-VF.ttf` 2.04, SHA-256 `018174e8…f2b8353d0`
- 고정 blob:
  - #147 K1 lib `d882b664`
  - #150 W1 `6c23fc16`
  - #151 W2 `c2b0ad87`
  - #152 W3 `fcf06458`(SHA-256 `a3fb4b70…`). W4는 이 W3가 내는 `scan.units`를 쓰고, W2를 고르지 않으면 W1을 쓴다.
  - 모두 실행 전에 확인했다(`ocr/run-meta.json`).
- 자료 검사:
  - 생성·렌더를 두 새 폴더에서 반복해 149개 파일이 바이트 동일했다.
  - 등록 설계(`tools/ko-header-column/registered/`)와도 바이트 동일했다.
  - OCR 전 검사: 문제 0, 좌우 짝 검사 통과, PNG SHA-256 144개 유일, 정규화 질문 12개 × 12쪽
  - 이전 세트와 이미지·질문 겹침 0: r09, fcp, #148, #149 코호트, #150, #151, #152(`data/checks.json`)
- 재생 A/B: 같은 동결 OCR을 두 번 재생·채점했다. 예측·입력·동결·채점·요약 파일이 모두 바이트 동일하다(`ab-compare.json`, `reproduced: true`).
  - 이것은 결정성 확인이지 독립 OCR 반복이 아니다.
  - `score-b/score-meta.json`의 `predictionsCommittedAtHead`는 `false`다. `replay-b`가 그 시점에 아직 커밋되지 않았기 때문이며, 판정에는 쓰지 않는다.

## 2. 판정

<!-- khc:table verdict -->
| 조건 | 값 | 판정 |
|---|---|---|
| G1 전체 L4 = 0 | L4 0 | pass |
| G2 공란·중복 적용 0 | 공란 0 / 중복 0 | pass |
| G3 정상 L·R 각각 J4 원본 ≥ 2 | L 11 / R 11 | pass |
| G4 정상 적용 귀속 100% | 정답 22/22 (L 11, R 11), 오선택 0, 미확정 0 | pass |
| 기하 필요조건 | 미달 없음 | pass |
| 읽기 근거(정상, W1 대비 새 E1) | 새 E1 22 (원본 11) / 비교 쪽 48 | loss |
| 최종 | — | geometry_ok_reading_worse |
<!-- /khc:table -->

- G3의 원본 수는 J4 사건이 있는 서로 다른 원본 수다. 좌우 각각 11원본이다.
- 판정 코드는 `RECOUNT_SPEC.md` 7절 규칙이 기계적으로 만들었다. 연구 판정과 제품 채택은 별개다.

## 3. 단계와 W4 사유

<!-- khc:table stages -->
| 항목 | 쪽수 |
|---|---|
| 등록 쪽 | 144 |
| 기술 오류 | 0 |
| 정상 처리(미매치 포함) | 144 |
| 정상 미매치 | 0 |
| K0 매치 | 0 |
| 한글 매치 | 144 |
| W1 widened | 136 |
| W1 not_wider | 8 |
| W1 no_candidate | 0 |
| W1 k0_branch | 0 |
| W2 cut | 136 |
| W2 no_cut | 0 |
| W2 hit_outside_w1 | 0 |
| W2 inherit | 8 |
| W3 error | 0 |
| W3 unmatched | 0 |
| W3 not_applicable | 8 |
| W3 qtype_none | 0 |
| W3 qtype_multiple | 0 |
| W3 no_valid_hit_word | 0 |
| W3 no_candidate | 1 |
| W3 multiple_candidates | 68 |
| W3 candidate_outside_w2 | 0 |
| W3 applied | 67 |
| W4 error | 0 |
| W4 unmatched | 0 |
| W4 not_applicable | 8 |
| W4 qtype_none | 0 |
| W4 qtype_multiple | 0 |
| W4 no_valid_hit_word | 0 |
| W4 question_unparsed | 0 |
| W4 question_type_mismatch | 0 |
| W4 header_none | 48 |
| W4 header_multiple | 0 |
| W4 header_duplicate | 44 |
| W4 header_no_match | 0 |
| W4 no_target_candidate | 22 |
| W4 multiple_target_candidates | 0 |
| W4 target_outside_w2 | 0 |
| W4 applied | 22 |
<!-- /khc:table -->

- **오류·미매치:** OCR 오류 0, K1 미매치 0이다.
- **W1 `not_wider` 8쪽:** 모두 `sports-c0`의 정상·중복 머리글 쪽이다. 이 8쪽은 W1–W4 모두 실패한다(9절 사례 C5).
  - 등록 예측표(프로토콜 3.4절)는 "K1이 목표 표지 줄을 고르고 W1이 넓어져 W2가 실제로 자른다"고 가정했다. 이 8쪽은 그 가정을 충족하지 못했다. 따라서 이상적 경로와의 비교 대상이 아니다.
  - 관찰된 사실(동결 OCR·K1 기록):
    1. OCR은 레코드 줄 6의 이름 "새벽 수영 강습반"을 단어 "새벽 / 수영 / 강 / 습 / 반"으로 나눠 냈다(12쪽 모두 같다).
    2. 고정 K1(#147)은 줄마다 단어 안에서 만든 한글 바이그램 중 질문 키와 겹치는 개수를 점수로 쓴다. 이 8쪽에서는 머리글 줄 1("개장", "시각")과 레코드 줄 6("새벽", "수영")이 모두 점수 2로 동점이었다. "강 / 습 / 반"으로 나뉜 단어에서는 "강습"·"습반"이 나오지 않는다.
    3. 동점이면 고정 규칙은 OCR 줄 신뢰도가 높은 줄을 고른다. 머리글 줄 신뢰도는 96.0–97.0, 레코드 줄은 93.9–95.1이어서 K1이 머리글 줄을 골랐다(`lineIndex` 1). 그 결과 W1은 `not_wider`, W2는 `inherit`, W4는 `not_applicable`이었다.
    4. 같은 원본의 공란 4쪽은 머리글 줄에 "개장"이 없어 점수 1이었다. 그래서 K1이 레코드 줄(점수 2)을 골랐고 W1이 넓어졌다.
  - 분절이 없었다면 다른 줄이 선택됐을 것이라는 주장은 **등록한 반사실 검증이 아니다.** 그런 OCR 출력도 관찰하지 않았다. 고정 규칙으로 사후 계산하면 "강습반"이 한 단어일 때 레코드 줄 점수가 4가 되지만, 이 계산은 결과의 일부가 아니다.
  - 이 손실은 W4 이전 고정 단계(K1 동점 처리와 선택)에서 생겼다.
- **관찰한 W4 사유(기하 선행조건이 성립한 W2 `cut` 136쪽에 한정):** 셀별로 등록 예측표(프로토콜 3.4절)의 이상적 W4 열과 같았다. 정상·같은 줄 답 22쪽은 `applied`, 나머지는 아래와 같다.
  - 이 일치는 W4 사유가 같았다는 뜻이다. OCR이 모든 셀 텍스트를 정확히 읽었다는 뜻은 아니다(예: p031의 "176%", 8절).
  - `sports-c0` 8쪽은 위의 가정 미충족 때문에 이 비교에서 제외한다.
  - 정상 머리글·아래 줄 답 22쪽: `no_target_candidate`. 같은 줄 후보가 경쟁 열에만 배정됐다.
  - 공란 48쪽: `header_none`. 머리글 줄이 2그룹이라 `group_count` 탈락.
  - 중복 44쪽: `header_duplicate`.
  - 136쪽 안에서 OCR이 표제를 놓치거나, 추가 그룹이 생기거나, 머리글 줄이 쪼개져 보류된 쪽은 없다. 정상·중복 88쪽은 머리글 줄이 3그룹으로 자격을 얻었고, 공란 48쪽은 2그룹이었다.
  - `sports-c0` 8쪽에서는 K1이 고른 줄이 바로 머리글 줄이다. 그래서 W4 진단에서 그 줄이 `k1_line`으로 제외되어 자격 줄이 0이다. 이 8쪽의 머리글 3그룹 인식 여부는 W4가 판정하지 않았다.

<!-- khc:table reasons -->
| 그룹 | error | unmatched | not_applicable | qtype_none | qtype_multiple | no_valid_hit_word | question_unparsed | question_type_mismatch | header_none | header_multiple | header_duplicate | header_no_match | no_target_candidate | multiple_target_candidates | target_outside_w2 | applied |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 전체 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 48 | 0 | 44 | 0 | 22 | 0 | 0 | 22 |
| W2 cut | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 48 | 0 | 44 | 0 | 22 | 0 | 0 | 22 |
| W4 applied | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 22 |
| side L | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 24 | 0 | 22 | 0 | 11 | 0 | 0 | 11 |
| side R | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 24 | 0 | 22 | 0 | 11 | 0 | 0 | 11 |
| header normal | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 22 |
| header blank | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| header dup | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 44 | 0 | 0 | 0 | 0 | 0 |
| ans same | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 24 | 0 | 22 | 0 | 0 | 0 | 0 | 22 |
| ans below | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 24 | 0 | 22 | 0 | 22 | 0 | 0 | 0 |
| normal L | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 11 |
| normal R | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 11 |
| cell L-normal-same | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| cell L-normal-below | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 |
| cell L-blank-same | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell L-blank-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell L-dup-same | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| cell L-dup-below | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| cell R-normal-same | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| cell R-normal-below | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 |
| cell R-blank-same | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell R-blank-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell R-dup-same | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| cell R-dup-below | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| kind library | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 0 | 8 | 0 | 0 | 8 |
| kind sports | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 12 | 0 | 6 | 0 | 0 | 6 |
| kind culture | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 0 | 8 | 0 | 0 | 8 |
| qtype time | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 12 | 0 | 6 | 0 | 0 | 6 |
| qtype count | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 0 | 8 | 0 | 0 | 8 |
| qtype pages | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 0 | 8 | 0 | 0 | 8 |
| slot 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 0 | 8 | 0 | 0 | 8 |
| slot 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 16 | 0 | 8 | 0 | 0 | 8 |
| slot 2 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 16 | 0 | 12 | 0 | 6 | 0 | 0 | 6 |
<!-- /khc:table -->

## 4. 손실·회복·다른 레코드 값 제외

<!-- khc:table groups -->
| 그룹 | n | 오류 | 미매치 | 매치 | W1 엄격 | W2 엄격 | W3 엄격 | W4 엄격 | W2 cut | W4 적용 | L2/W1 성공 | L3/W1 성공 | L4/W1 성공 | L4 원본 | L3 중 W4 예방 | W3→W4 새 손실 | W3→W4 회복 | 공통 기회 | J2 | J3 | J4 | J4 원본 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 전체 | 144 | 0 | 0 | 144 | 136 | 68 | 69 | 136 | 136 | 22 | 68/136 | 67/136 | 0/136 | 0 | 67/67 | 0/69 | 67/75 | 136 | 68 | 0 | 22 | 11 |
| W2 cut | 136 | 0 | 0 | 136 | 136 | 68 | 69 | 136 | 136 | 22 | 68/136 | 67/136 | 0/136 | 0 | 67/67 | 0/69 | 67/67 | 136 | 68 | 0 | 22 | 11 |
| W4 applied | 22 | 0 | 0 | 22 | 22 | 22 | 22 | 22 | 22 | 22 | 0/22 | 0/22 | 0/22 | 0 | 0/0 | 0/22 | 0/0 | 22 | 22 | 0 | 22 | 11 |
| side L | 72 | 0 | 0 | 72 | 68 | 34 | 34 | 68 | 68 | 11 | 34/68 | 34/68 | 0/68 | 0 | 34/34 | 0/34 | 34/38 | 68 | 34 | 0 | 11 | 11 |
| side R | 72 | 0 | 0 | 72 | 68 | 34 | 35 | 68 | 68 | 11 | 34/68 | 33/68 | 0/68 | 0 | 33/33 | 0/35 | 33/37 | 68 | 34 | 0 | 11 | 11 |
| header normal | 48 | 0 | 0 | 48 | 44 | 22 | 22 | 44 | 44 | 22 | 22/44 | 22/44 | 0/44 | 0 | 22/22 | 0/22 | 22/26 | 44 | 22 | 0 | 22 | 11 |
| header blank | 48 | 0 | 0 | 48 | 48 | 24 | 25 | 48 | 48 | 0 | 24/48 | 23/48 | 0/48 | 0 | 23/23 | 0/25 | 23/23 | 48 | 24 | 0 | 0 | 0 |
| header dup | 48 | 0 | 0 | 48 | 44 | 22 | 22 | 44 | 44 | 0 | 22/44 | 22/44 | 0/44 | 0 | 22/22 | 0/22 | 22/26 | 44 | 22 | 0 | 0 | 0 |
| ans same | 72 | 0 | 0 | 72 | 68 | 68 | 68 | 68 | 68 | 22 | 0/68 | 0/68 | 0/68 | 0 | 0/0 | 0/68 | 0/4 | 68 | 68 | 0 | 22 | 11 |
| ans below | 72 | 0 | 0 | 72 | 68 | 0 | 1 | 68 | 68 | 0 | 68/68 | 67/68 | 0/68 | 0 | 67/67 | 0/1 | 67/71 | 68 | 0 | 0 | 0 | 0 |
| normal L | 24 | 0 | 0 | 24 | 22 | 11 | 11 | 22 | 22 | 11 | 11/22 | 11/22 | 0/22 | 0 | 11/11 | 0/11 | 11/13 | 22 | 11 | 0 | 11 | 11 |
| normal R | 24 | 0 | 0 | 24 | 22 | 11 | 11 | 22 | 22 | 11 | 11/22 | 11/22 | 0/22 | 0 | 11/11 | 0/11 | 11/13 | 22 | 11 | 0 | 11 | 11 |
| cell L-normal-same | 12 | 0 | 0 | 12 | 11 | 11 | 11 | 11 | 11 | 11 | 0/11 | 0/11 | 0/11 | 0 | 0/0 | 0/11 | 0/1 | 11 | 11 | 0 | 11 | 11 |
| cell L-normal-below | 12 | 0 | 0 | 12 | 11 | 0 | 0 | 11 | 11 | 0 | 11/11 | 11/11 | 0/11 | 0 | 11/11 | 0/0 | 11/12 | 11 | 0 | 0 | 0 | 0 |
| cell L-blank-same | 12 | 0 | 0 | 12 | 12 | 12 | 12 | 12 | 12 | 0 | 0/12 | 0/12 | 0/12 | 0 | 0/0 | 0/12 | 0/0 | 12 | 12 | 0 | 0 | 0 |
| cell L-blank-below | 12 | 0 | 0 | 12 | 12 | 0 | 0 | 12 | 12 | 0 | 12/12 | 12/12 | 0/12 | 0 | 12/12 | 0/0 | 12/12 | 12 | 0 | 0 | 0 | 0 |
| cell L-dup-same | 12 | 0 | 0 | 12 | 11 | 11 | 11 | 11 | 11 | 0 | 0/11 | 0/11 | 0/11 | 0 | 0/0 | 0/11 | 0/1 | 11 | 11 | 0 | 0 | 0 |
| cell L-dup-below | 12 | 0 | 0 | 12 | 11 | 0 | 0 | 11 | 11 | 0 | 11/11 | 11/11 | 0/11 | 0 | 11/11 | 0/0 | 11/12 | 11 | 0 | 0 | 0 | 0 |
| cell R-normal-same | 12 | 0 | 0 | 12 | 11 | 11 | 11 | 11 | 11 | 11 | 0/11 | 0/11 | 0/11 | 0 | 0/0 | 0/11 | 0/1 | 11 | 11 | 0 | 11 | 11 |
| cell R-normal-below | 12 | 0 | 0 | 12 | 11 | 0 | 0 | 11 | 11 | 0 | 11/11 | 11/11 | 0/11 | 0 | 11/11 | 0/0 | 11/12 | 11 | 0 | 0 | 0 | 0 |
| cell R-blank-same | 12 | 0 | 0 | 12 | 12 | 12 | 12 | 12 | 12 | 0 | 0/12 | 0/12 | 0/12 | 0 | 0/0 | 0/12 | 0/0 | 12 | 12 | 0 | 0 | 0 |
| cell R-blank-below | 12 | 0 | 0 | 12 | 12 | 0 | 1 | 12 | 12 | 0 | 12/12 | 11/12 | 0/12 | 0 | 11/11 | 0/1 | 11/11 | 12 | 0 | 0 | 0 | 0 |
| cell R-dup-same | 12 | 0 | 0 | 12 | 11 | 11 | 11 | 11 | 11 | 0 | 0/11 | 0/11 | 0/11 | 0 | 0/0 | 0/11 | 0/1 | 11 | 11 | 0 | 0 | 0 |
| cell R-dup-below | 12 | 0 | 0 | 12 | 11 | 0 | 0 | 11 | 11 | 0 | 11/11 | 11/11 | 0/11 | 0 | 11/11 | 0/0 | 11/12 | 11 | 0 | 0 | 0 | 0 |
| kind library | 48 | 0 | 0 | 48 | 48 | 24 | 24 | 48 | 48 | 8 | 24/48 | 24/48 | 0/48 | 0 | 24/24 | 0/24 | 24/24 | 48 | 24 | 0 | 8 | 4 |
| kind sports | 48 | 0 | 0 | 48 | 40 | 20 | 20 | 40 | 40 | 6 | 20/40 | 20/40 | 0/40 | 0 | 20/20 | 0/20 | 20/28 | 40 | 20 | 0 | 6 | 3 |
| kind culture | 48 | 0 | 0 | 48 | 48 | 24 | 25 | 48 | 48 | 8 | 24/48 | 23/48 | 0/48 | 0 | 23/23 | 0/25 | 23/23 | 48 | 24 | 0 | 8 | 4 |
| qtype time | 48 | 0 | 0 | 48 | 40 | 20 | 20 | 40 | 40 | 6 | 20/40 | 20/40 | 0/40 | 0 | 20/20 | 0/20 | 20/28 | 40 | 20 | 0 | 6 | 3 |
| qtype count | 48 | 0 | 0 | 48 | 48 | 24 | 24 | 48 | 48 | 8 | 24/48 | 24/48 | 0/48 | 0 | 24/24 | 0/24 | 24/24 | 48 | 24 | 0 | 8 | 4 |
| qtype pages | 48 | 0 | 0 | 48 | 48 | 24 | 25 | 48 | 48 | 8 | 24/48 | 23/48 | 0/48 | 0 | 23/23 | 0/25 | 23/23 | 48 | 24 | 0 | 8 | 4 |
| slot 0 | 48 | 0 | 0 | 48 | 48 | 24 | 24 | 48 | 48 | 8 | 24/48 | 24/48 | 0/48 | 0 | 24/24 | 0/24 | 24/24 | 48 | 24 | 0 | 8 | 4 |
| slot 1 | 48 | 0 | 0 | 48 | 48 | 24 | 24 | 48 | 48 | 8 | 24/48 | 24/48 | 0/48 | 0 | 24/24 | 0/24 | 24/24 | 48 | 24 | 0 | 8 | 4 |
| slot 2 | 48 | 0 | 0 | 48 | 40 | 20 | 21 | 40 | 40 | 6 | 20/40 | 19/40 | 0/40 | 0 | 19/19 | 0/21 | 19/27 | 40 | 20 | 0 | 6 | 3 |
<!-- /khc:table -->

- **L4 = 0.** W4가 W1에서 잃은 쪽이 없다.
  - W4는 W2를 고른 22쪽 외의 122쪽(판정 단계 보류 114 + 미적용 8)에서 기존 W1 창과 같다(`w4From: w1`, 불변식 `w4InW1W2` 144/144).
  - 22쪽은 W2가 이미 엄격 성공이었다.
- **W3 대비:** L3 67쪽(12원본)은 모두 정답이 아래 줄인 쪽(`below`)이다.
  - W3가 같은 줄의 유일한 경쟁 값으로 잘랐다.
  - W4는 이 67쪽 모두에서 기존 W1 창을 유지해 손실을 피했다(`prevented34` 67/67).
- **J 사건:**
  - J2는 68쪽(12원본)이다. W2는 다른 레코드 값을 제외하지만 68쪽에서 답을 잃는다.
  - J3는 0쪽이다. W3를 적용한(`applied`) 67쪽은 모두 엄격 실패였다. W3 엄격 성공 69쪽은 모두 W3가 기존 W1 창을 유지한 쪽(`multiple_candidates` 68 + `no_candidate` 1)이라 다른 레코드 값이 제외되지 않았다. W3가 잘라서 성공한 쪽은 없다.
  - J4는 22쪽(11원본)이고, 적용 22쪽과 같은 집합이다. 불변식 J4 ⊆ J2는 성립한다.
- **트레이드오프:** W4는 판정 단계에서 보류한 114쪽에서 기존 W1 창을 그대로 쓴다. 기존 W1 창은 전체 페이지가 아니라 표지 줄 주변을 오른쪽으로 넓힌 창이다.
  - 그래서 이 쪽들에서는 기존 W1 창 안의 다른 레코드 값도 그대로 남는다. 손실을 피한 대가로 제외도 하지 않는다.
  - 정상 머리글·아래 줄 답 22쪽, 공란 48쪽, 중복 44쪽이 모두 이 경우다.
  - 미적용(`not_applicable`) 8쪽도 기존 W1 창을 쓰지만, 그 창부터 엄격 실패라 손실·제외 비교의 공통 기회에 들지 않는다.

## 5. gold 귀속 (예측 동결 뒤)

<!-- khc:table attribution -->
| 그룹 | 적용 | 정답 | 오선택 | 미확정 | 표제 목표 | 표제 경쟁 | 표제 기타 | 표제 미확정 | 후보 목표 | 후보 경쟁 | 후보 타 레코드 값 | 후보 타 레코드 경쟁 | 후보 기타 | 후보 미확정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 전체 | 22 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| W2 cut | 22 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| W4 applied | 22 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| side L | 11 | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| side R | 11 | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| header normal | 22 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| header blank | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| header dup | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ans same | 22 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 |
| ans below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| normal L | 11 | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| normal R | 11 | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| cell L-normal-same | 11 | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| cell L-normal-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell L-blank-same | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell L-blank-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell L-dup-same | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell L-dup-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell R-normal-same | 11 | 11 | 0 | 0 | 11 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| cell R-normal-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell R-blank-same | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell R-blank-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell R-dup-same | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cell R-dup-below | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| kind library | 8 | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 |
| kind sports | 6 | 6 | 0 | 0 | 6 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 |
| kind culture | 8 | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 |
| qtype time | 6 | 6 | 0 | 0 | 6 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 |
| qtype count | 8 | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 |
| qtype pages | 8 | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 |
| slot 0 | 8 | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 |
| slot 1 | 8 | 8 | 0 | 0 | 8 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 |
| slot 2 | 6 | 6 | 0 | 0 | 6 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 |
<!-- /khc:table -->

- 적용 22쪽 모두 선택 머리글 그룹이 `h-target`, 선택 후보가 `valueItem`으로 확정됐다. 오선택과 미확정은 없다.
- 귀속 기준: 모든 구성 단어 중심이 한 셀 안에 있고, 외접 상자와 그 항목 잉크의 교집합이 양의 면적이어야 한다.
- 열 추론이 틀린 쪽(경쟁 열 후보 선택, 다른 레코드 값 선택)은 0이다.
- 공란·중복 적용 쪽이 없으므로 그 귀속은 해당 없음이다.

## 6. 잘린 창에 남은 정보와 읽기 사건

<!-- khc:table exposure -->
| 행 | 목표 표제 f/p/n/m | 경쟁 표제 f/p/n/m | 경쟁 값 f/p/n | 목표 값 f/p/n |
|---|---|---|---|---|
| header normal W1 | 48/0/0/0 | 48/0/0/0 | 44/0/4 | 44/0/4 |
| header normal W2 | 4/0/44/0 | 4/0/44/0 | 44/0/4 | 22/22/4 |
| header normal W3 | 26/0/22/0 | 26/0/22/0 | 44/0/4 | 22/22/4 |
| header normal W4 | 26/0/22/0 | 26/0/22/0 | 44/0/4 | 44/0/4 |
| header blank W1 | 0/0/0/48 | 48/0/0/0 | 48/0/0 | 48/0/0 |
| header blank W2 | 0/0/0/48 | 0/0/48/0 | 48/0/0 | 24/24/0 |
| header blank W3 | 0/0/0/48 | 25/0/23/0 | 48/0/0 | 25/23/0 |
| header blank W4 | 0/0/0/48 | 48/0/0/0 | 48/0/0 | 48/0/0 |
| header dup W1 | 48/0/0/0 | 48/0/0/0 | 44/0/4 | 44/0/4 |
| header dup W2 | 4/0/44/0 | 4/0/44/0 | 44/0/4 | 22/22/4 |
| header dup W3 | 26/0/22/0 | 26/0/22/0 | 44/0/4 | 22/22/4 |
| header dup W4 | 48/0/0/0 | 48/0/0/0 | 44/0/4 | 44/0/4 |
<!-- /khc:table -->

<!-- khc:table reading -->
| 그룹 | 비교 쪽 | E1 W1 | E1 W4 | E1 W4 새(원본) | E1 W4 기존 | E1 W4 해소 | E2 W1 | E2 W4 | E2 W4 새(원본) | E2 W4 기존 | E2 W4 해소 | 표제 소실 W2 | 표제 소실 W3 | 표제 소실 W4(원본) | E1 W2 새 | E1 W3 새 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| header normal | 48 | 0 | 22 | 22 (11) | 0 | 0 | 0 | 22 | 22 (11) | 0 | 0 | 44 | 22 | 22 (11) | 44 | 22 |
| normal L | 24 | 0 | 11 | 11 (11) | 0 | 0 | 0 | 11 | 11 (11) | 0 | 0 | 22 | 11 | 11 (11) | 22 | 11 |
| normal R | 24 | 0 | 11 | 11 (11) | 0 | 0 | 0 | 11 | 11 (11) | 0 | 0 | 22 | 11 | 11 (11) | 22 | 11 |
| cell L-normal-same | 12 | 0 | 11 | 11 (11) | 0 | 0 | 0 | 11 | 11 (11) | 0 | 0 | 11 | 0 | 11 (11) | 11 | 0 |
| cell L-normal-below | 12 | 0 | 0 | 0 (0) | 0 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 11 | 11 | 0 (0) | 11 | 11 |
| cell R-normal-same | 12 | 0 | 11 | 11 (11) | 0 | 0 | 0 | 11 | 11 (11) | 0 | 0 | 11 | 0 | 11 (11) | 11 | 0 |
| cell R-normal-below | 12 | 0 | 0 | 0 (0) | 0 | 0 | 0 | 0 | 0 (0) | 0 | 0 | 11 | 11 | 0 (0) | 11 | 11 |
<!-- /khc:table -->

- 정상 머리글 비교 쪽(매치되어 W1·W4가 모두 있는 쪽)은 48쪽이다. W1이 넓어지지 않은 `sports-c0` 4쪽도 포함한다.
  - W4의 새 E1은 22쪽 11원본이고, 적용 22쪽과 같다(`lists.readingNewE1W4`).
  - 표제 소실 표시(W1 full → W4 none, 경쟁 값 full)도 같은 22쪽이다.
- W2는 같은 기준으로 새 E1 44쪽을 만들었고 W3는 22쪽을 만들었다. W4는 W2보다 적지만, 기준(W1)보다는 나빠졌다.
- 적용 쪽 창 안의 상태:
  - 목표 값과 같은 레코드 경쟁 값은 둘 다 full이다.
  - 두 열 표제는 모두 none이다.
  - 글자만 보는 사람은 두 시각(또는 인원·분량) 중 어느 것이 질문 필드인지 창 안에서 알 수 없다.
- **공란·중복 머리글:** 같은 사건 집계에 합치지 않는다.
  - 공란 48쪽과 중복 44쪽의 W4 엄격 성공은 기하적 정답 보존일 뿐이다.
  - 원본 자체에 목표 표제가 없거나(공란) 같은 표제가 두 번 있어서(중복), 사람이 글자만으로 필드를 식별할 수 없다(`textIdentifiable: false`).
  - 채점에서 gold가 역할을 알려 준다는 사실은 사람이 그 역할을 볼 수 있다는 뜻이 아니다.

## 7. 면적

<!-- khc:table area -->
| 그룹 | 매치 | W2 평균 %p | W3 평균 %p | W4 평균 %p | W4 적용 쪽 | W4 적용 평균 %p |
|---|---|---|---|---|---|---|
| 전체 | 144 | 31.25 | 15.35 | 5.01 | 22 | 32.80 |
| W2 cut | 136 | 33.09 | 16.25 | 5.31 | 22 | 32.80 |
| W4 applied | 22 | 32.80 | 0.00 | 32.80 | 22 | 32.80 |
| side L | 72 | 31.25 | 15.63 | 5.01 | 11 | 32.80 |
| side R | 72 | 31.25 | 15.06 | 5.01 | 11 | 32.80 |
| header normal | 48 | 30.08 | 15.05 | 15.03 | 22 | 32.80 |
| header blank | 48 | 33.59 | 15.94 | 0.00 | 0 | — |
| header dup | 48 | 30.08 | 15.05 | 0.00 | 0 | — |
| ans same | 72 | 31.24 | 0.00 | 10.02 | 22 | 32.80 |
| ans below | 72 | 31.27 | 30.70 | 0.00 | 0 | — |
| normal L | 24 | 30.08 | 15.05 | 15.03 | 11 | 32.80 |
| normal R | 24 | 30.08 | 15.05 | 15.03 | 11 | 32.80 |
| cell L-normal-same | 12 | 30.07 | 0.00 | 30.07 | 11 | 32.80 |
| cell L-normal-below | 12 | 30.10 | 30.10 | 0.00 | 0 | — |
| cell L-blank-same | 12 | 33.58 | 0.00 | 0.00 | 0 | — |
| cell L-blank-below | 12 | 33.61 | 33.61 | 0.00 | 0 | — |
| cell L-dup-same | 12 | 30.07 | 0.00 | 0.00 | 0 | — |
| cell L-dup-below | 12 | 30.10 | 30.10 | 0.00 | 0 | — |
| cell R-normal-same | 12 | 30.07 | 0.00 | 30.07 | 11 | 32.80 |
| cell R-normal-below | 12 | 30.10 | 30.10 | 0.00 | 0 | — |
| cell R-blank-same | 12 | 33.58 | 0.00 | 0.00 | 0 | — |
| cell R-blank-below | 12 | 33.61 | 30.17 | 0.00 | 0 | — |
| cell R-dup-same | 12 | 30.07 | 0.00 | 0.00 | 0 | — |
| cell R-dup-below | 12 | 30.10 | 30.10 | 0.00 | 0 | — |
| kind library | 48 | 33.96 | 16.98 | 5.66 | 8 | 33.96 |
| kind sports | 48 | 26.63 | 13.33 | 3.85 | 6 | 30.80 |
| kind culture | 48 | 33.16 | 15.73 | 5.52 | 8 | 33.14 |
| qtype time | 48 | 24.04 | 12.02 | 3.42 | 6 | 27.37 |
| qtype count | 48 | 33.57 | 16.79 | 5.60 | 8 | 33.57 |
| qtype pages | 48 | 36.15 | 17.24 | 6.02 | 8 | 36.10 |
| slot 0 | 48 | 24.98 | 12.50 | 4.16 | 8 | 24.96 |
| slot 1 | 48 | 33.55 | 16.79 | 5.59 | 8 | 33.53 |
| slot 2 | 48 | 35.22 | 16.75 | 5.29 | 6 | 42.28 |
<!-- /khc:table -->

- 감소 %p = 100 × (W1 면적 − Wk 면적) / 페이지 면적의 산술 평균이다.
- 기계 파일은 분자·분모를 그대로 보존한다(`summary.json`의 `area`). 표만 소수 둘째 자리로 반올림한다.

## 8. 원본별 표, 집중, 좌우 차이

<!-- khc:table sources -->
| 원본 | 유형 | 목표 슬롯 | L-normal-same | L-normal-below | L-blank-same | L-blank-below | L-dup-same | L-dup-below | R-normal-same | R-normal-below | R-blank-same | R-blank-below | R-dup-same | R-dup-below |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| library-c0 | time | 0 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| library-c1 | time | 1 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| library-c2 | count | 1 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| library-c3 | pages | 2 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| sports-c0 | time | 2 | FFFF not_applicable - - | FFFF not_applicable - - | SSSS header_none - - | SFFS header_none - - | FFFF not_applicable - - | FFFF not_applicable - - | FFFF not_applicable - - | FFFF not_applicable - - | SSSS header_none - - | SFFS header_none - - | FFFF not_applicable - - | FFFF not_applicable - - |
| sports-c1 | count | 2 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| sports-c2 | count | 0 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| sports-c3 | pages | 0 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| culture-c0 | time | 0 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| culture-c1 | count | 1 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| culture-c2 | pages | 1 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
| culture-c3 | pages | 2 | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFFS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - | SSSS applied t1c1u0 C J E1 | SFFS no_target_candidate t0c1u0 - | SSSS header_none - - | SFSS header_none - - | SSSS header_duplicate - - | SFFS header_duplicate - - |
<!-- /khc:table -->

- 칸 형식: `{W1W2W3W4 엄격 S/F} {W4 사유} {t목표 c경쟁 u미배정 | -} {귀속 C/W/U | -}[ J][ E1]`
- **원본별 결과:**
  - 11원본은 정상 같은 줄 답 L·R에서 적용·정답·J4·새 E1이 함께 나왔다.
  - `sports-c0`은 정상·중복 8쪽이 W1 단계에서 실패해 적용·J4가 0이다(3절).
  - 원본별 L4는 모두 0이다.
- **상위 원본 집중**(`summary.json`의 `concentration`):
  - J4·적용 각 22쪽 중 최대 원본 비중은 2쪽(`library-c0`, 동률 첫 원본)이다.
  - 한 원본에 몰리지 않았다. L4는 0이다.
- **좌우 불일치(W4 기준):** 72쌍(12원본 × 머리글 3 × 답 행 2) 모두 L/R의 W4 사유, W4 엄격 성공, J4, 귀속이 같았다(`summary.json`의 `sideMismatch` 0쌍).
  - "한쪽 순서에서만 나타난 동작 없음"은 이 네 항목에 한정한 말이다. 고정 W3까지 포함하면 그렇지 않다.
  - W3에는 좌우로 갈린 짝이 1쌍 있다. `culture-c3` 공란·아래 줄 답의 p127(L)과 p031(R)이다.
    - p127(L): OCR이 표지 줄 6의 경쟁 값 `r2-cval`("176쪽")을 단어 "176"과 "쪽"으로 냈다. W3가 이를 후보 "176쪽" 하나로 묶어 적용(`applied`, W2)했고, 엄격 판정은 실패(t13 `lost`)다.
    - p031(R): 같은 값을 "176%"로 냈다. W3 후보가 0이라(`no_candidate`) 기존 W1 창을 유지했고, 엄격 판정은 성공이다.
    - 두 쪽 모두 W4는 `header_none`으로 기존 W1 창을 써서 엄격 판정이 성공이다. 그래서 위 W4 기준 72쌍의 불일치에는 들지 않는다.
- **`culture-c3` 공란·아래 줄 답 R(p031):** W3가 기존 W1 창을 유지한 1쪽이다(사례 C6).
  - 이 쪽의 질문 레코드는 "시민 합창단 정기 공연"(`r2`)이다.
    - 설계상 질문 필드 값 `r2-tval`은 "106쪽"이고 아래 줄(잉크 [634, 387, 692, 408])에 있다.
    - 같은 레코드의 경쟁 필드 "보고서 분량" 값 `r2-cval`은 "176쪽"이고 표지 줄(잉크 [374, 347, 432, 368])에 있다.
  - OCR은 표지 줄 6의 단어 4를 "176%"(상자 x 374.0625, y 347.1875, 폭 57.5, 높이 20.9375)로 읽었다. 이 상자는 `r2-cval` 잉크 위치와 겹친다.
  - "쪽" 단위가 사라져 W3 후보가 0이 됐다(`no_candidate`).
  - W2는 이 쪽에서 답을 잃었고 W3는 잃지 않았다(L2 68, L3 67).

## 9. 사례 (원시 기록과 대조)

아래 블록의 각 항목은 검산기 검사 7(`7-described-cases`)이 원자료와 대조한다. 대조 대상은 동결 OCR 단어, 기록 예측, 기록 채점 행과 재계산 채점 행, 설계다.

- 이 대조 검사와 블록 형식은 결과를 본 뒤 프로토콜 7절("결과 문서에 서술한 사례의 원시 토큰·좌표 대조")을 이행하려고 추가했다.
- `RECOUNT_SPEC.md`에는 없던 검증 전용 장치이며, 판정·규칙·표에는 영향이 없다.
- 이 블록의 변조 거부도 `mutation.json`에 19번째 항목(`caseTokenChanged`, 등록 외)으로 남겼다.

- **C1 적용(p038, `library-c0` L-normal-same)**
  - 질문: "고서 영인본 열람의 방문 시각은 몇 시인가요?"
  - 머리글 줄 1이 3그룹("이용신청항목", "방문시각", "반납시각")으로 자격을 얻었다. 그중 2번째 그룹만 질문 필드와 일치했다.
  - 표지 줄 2의 후보 "13:00"(x0 374.0625)이 목표 표제와 거리 0이라 목표 열에 배정됐다. "15:10"은 경쟁 열에 배정됐다.
  - W4는 W2(top 147, 높이 68)를 골랐다. 귀속은 정답이고 J4가 성립한다.
  - 같은 쪽에서 목표 표제 노출은 W1 full → W4 none이고 경쟁 값은 W4 full이어서 새 E1이 생겼다.
- **C2 답 아래 줄(p128, `library-c0` L-normal-below)**
  - 같은 줄 후보는 "15:10" 하나이고 경쟁 열에 배정됐다(목표 0, 경쟁 1).
  - W4 사유는 `no_target_candidate`이고 W1을 유지했다. W3는 `applied`로 잘라 답을 잃었고(t13 lost), W4는 유지했다(t14 keptSuccess).
- **C3 공란(p104, `library-c0` L-blank-same)**
  - 머리글 줄 1이 2그룹("이용신청항목", "반납시각")이라 `group_count`로 탈락했다. W4 사유는 `header_none`이다.
  - 목표 표제 노출은 `source_missing`이다.
- **C4 중복(p067, `library-c0` L-dup-same)**
  - 두 값 그룹이 모두 "방문시각"이라 일치가 [true, true]였다. W4 사유는 `header_duplicate`다.
- **C5 K1 머리글 줄 선택(p001, `sports-c0` R-normal-same)**
  - 관찰된 기록: OCR 6번 줄이 레코드 이름을 "새벽 / 수영 / 강 / 습 / 반"으로 냈다.
  - K1 점수는 머리글 줄 1과 레코드 줄 6이 모두 2로 동점이었다. 줄 신뢰도가 더 높은 머리글 줄(약 96.9 대 95.1)이 선택됐다.
  - K1은 머리글 줄 1의 단어 4–6("시각", "개장", "시각")을 적중으로 골랐다.
  - 단어 분절이 이 선택의 원인이라는 반사실은 검증하지 않았다(3절).
  - W1은 `not_wider`이고, W1 엄격 판정은 실패다.
- **C6 OCR 단위 오독(p031, `culture-c3` R-blank-below)**
  - 질문 레코드 `r2`의 경쟁 값 `r2-cval`은 "176쪽", 잉크 [374, 347, 432, 368]이다. 질문 필드 값 `r2-tval`은 아래 줄의 "106쪽"이다.
  - 표지 줄 6의 이 경쟁 값이 "176%"로 읽혔다. W3 후보 수는 0(`no_candidate`)이고, W3 엄격 판정은 성공이다.

<!-- khc:cases
[
 {"id": "p038", "kind": "design", "path": "question", "value": "고서 영인본 열람의 방문 시각은 몇 시인가요?"},
 {"id": "p038", "kind": "design", "path": "cellName", "value": "L-normal-same"},
 {"id": "p038", "kind": "pred", "path": "w4Diag.lines.1.groups.0.text", "value": "이용신청항목"},
 {"id": "p038", "kind": "pred", "path": "w4Diag.lines.1.groups.1.text", "value": "방문시각"},
 {"id": "p038", "kind": "pred", "path": "w4Diag.lines.1.groups.2.text", "value": "반납시각"},
 {"id": "p038", "kind": "pred", "path": "w4Diag.header.match", "value": [true, false]},
 {"id": "p038", "kind": "ocr_words", "line": 2, "words": [3, 4], "texts": ["13:00", "15:10"]},
 {"id": "p038", "kind": "pred", "path": "w4Diag.assign.0", "value": {"unit": 0, "line": 2, "first": 3, "last": 3, "x0": "374.0625", "dTarget": "0", "dComp": "260", "column": "target", "why": "nearest"}},
 {"id": "p038", "kind": "pred", "path": "w4Diag.assign.1.column", "value": "comp"},
 {"id": "p038", "kind": "pred", "path": "w4Reason", "value": "applied"},
 {"id": "p038", "kind": "pred", "path": "w4", "value": {"left": 0, "top": 147, "width": 1164, "height": 68}},
 {"id": "p038", "kind": "score", "path": "attribution.outcome", "value": "correct"},
 {"id": "p038", "kind": "score", "path": "event4", "value": true},
 {"id": "p038", "kind": "score", "path": "exposure.w1.targetHeader", "value": "full"},
 {"id": "p038", "kind": "score", "path": "exposure.w4.targetHeader", "value": "none"},
 {"id": "p038", "kind": "score", "path": "exposure.w4.compValue", "value": "full"},
 {"id": "p038", "kind": "score", "path": "reading.e1.w4", "value": true},
 {"id": "p128", "kind": "design", "path": "cellName", "value": "L-normal-below"},
 {"id": "p128", "kind": "ocr_words", "line": 2, "words": [5], "texts": ["15:10"]},
 {"id": "p128", "kind": "pred", "path": "w4Diag.counts", "value": {"target": 0, "comp": 1, "unassigned": 0}},
 {"id": "p128", "kind": "pred", "path": "w4Reason", "value": "no_target_candidate"},
 {"id": "p128", "kind": "pred", "path": "w3Reason", "value": "applied"},
 {"id": "p128", "kind": "score", "path": "t13", "value": "lost"},
 {"id": "p128", "kind": "score", "path": "t14", "value": "keptSuccess"},
 {"id": "p104", "kind": "design", "path": "cellName", "value": "L-blank-same"},
 {"id": "p104", "kind": "pred", "path": "w4Diag.lines.1.groups.1.text", "value": "반납시각"},
 {"id": "p104", "kind": "pred", "path": "w4Diag.lines.1.failure", "value": "group_count"},
 {"id": "p104", "kind": "pred", "path": "w4Reason", "value": "header_none"},
 {"id": "p104", "kind": "score", "path": "exposure.w4.targetHeader", "value": "source_missing"},
 {"id": "p067", "kind": "design", "path": "cellName", "value": "L-dup-same"},
 {"id": "p067", "kind": "pred", "path": "w4Diag.lines.1.groups.1.text", "value": "방문시각"},
 {"id": "p067", "kind": "pred", "path": "w4Diag.lines.1.groups.2.text", "value": "방문시각"},
 {"id": "p067", "kind": "pred", "path": "w4Diag.header.match", "value": [true, true]},
 {"id": "p067", "kind": "pred", "path": "w4Reason", "value": "header_duplicate"},
 {"id": "p001", "kind": "design", "path": "cellName", "value": "R-normal-same"},
 {"id": "p001", "kind": "design", "path": "label", "value": "새벽 수영 강습반"},
 {"id": "p001", "kind": "ocr_words", "line": 6, "words": [0, 1, 2, 3, 4], "texts": ["새벽", "수영", "강", "습", "반"]},
 {"id": "p001", "kind": "ocr_words", "line": 1, "words": [4, 5, 6], "texts": ["시각", "개장", "시각"]},
 {"id": "p001", "kind": "pred", "path": "lineIndex", "value": 1},
 {"id": "p001", "kind": "pred", "path": "w4Diag.lines.1.why", "value": "k1_line"},
 {"id": "p001", "kind": "pred", "path": "w4Diag.qualified", "value": []},
 {"id": "p048", "kind": "design", "path": "cellName", "value": "L-blank-same"},
 {"id": "p048", "kind": "pred", "path": "lineIndex", "value": 6},
 {"id": "p048", "kind": "pred", "path": "reason", "value": "widened"},
 {"id": "p001", "kind": "pred", "path": "hitWords", "value": [4, 5, 6]},
 {"id": "p001", "kind": "pred", "path": "reason", "value": "not_wider"},
 {"id": "p001", "kind": "pred", "path": "w4Reason", "value": "not_applicable"},
 {"id": "p001", "kind": "score", "path": "w1.strict", "value": false},
 {"id": "p031", "kind": "design", "path": "cellName", "value": "R-blank-below"},
 {"id": "p031", "kind": "design", "path": "label", "value": "시민 합창단 정기 공연"},
 {"id": "p031", "kind": "design", "path": "compValueItem", "value": "r2-cval"},
 {"id": "p031", "kind": "design", "path": "valueItem", "value": "r2-tval"},
 {"id": "p031", "kind": "design", "path": "items.18.id", "value": "r2-cval"},
 {"id": "p031", "kind": "design", "path": "items.18.text", "value": "176쪽"},
 {"id": "p031", "kind": "design", "path": "items.16.text", "value": "106쪽"},
 {"id": "p031", "kind": "pred", "path": "lineIndex", "value": 6},
 {"id": "p031", "kind": "ocr_words", "line": 6, "words": [4], "texts": ["176%"], "boxes": [[374.0625, 347.1875, 57.5, 20.9375]]},
 {"id": "p031", "kind": "pred", "path": "w3Reason", "value": "no_candidate"},
 {"id": "p031", "kind": "pred", "path": "scan.count", "value": 0},
 {"id": "p031", "kind": "score", "path": "w3.strict", "value": true}
]
-->

## 10. 해석과 한계

- **질문에 대한 답(이 자료, 이 OCR 한 번):**
  - 머리글과 질문 필드를 연결한 W4는 W1 대비 기하 손실 없이(L4 0) W3의 손실 67쪽을 모두 피했다.
  - 적용한 22쪽에서는 맞는 열을 골랐고(귀속 22/22), 다른 레코드 값을 제외했다(J4 22).
  - 그러나 적용한 모든 쪽에서 목표 표제가 창 밖으로 나가고 경쟁 값은 남는다. 글자만으로는 두 값 중 답을 가릴 근거가 사라진다.
  - 등록 판정표에 따라 권고를 보류한다.
- **적용 범위가 좁다.** W4가 W2를 고른 쪽은 정상 머리글·같은 줄 답뿐이다(22/144).
  - 이 쪽들은 W2만으로도 엄격 성공이었다. W4가 W2보다 나은 점은 W2가 잃던 68쪽에서 기존 W1 창을 유지한 것이다.
  - 그 대가로 그 68쪽에서는 다른 레코드 값을 제외하지 못했다.
  - 분모: 144 = 적용 22 + 판정 단계 보류 114 + 미적용 8. W4가 기존 W1 창과 같은 쪽은 122다.
- **이상적 경로와의 일치(136쪽 한정):** 기하 선행조건이 성립한 W2 `cut` 136쪽에서는 관찰된 W4 사유가 등록 예측표의 이상적 W4 열과 셀별로 같았다.
  - 이 OCR 한 번에서 그 136쪽 중 정상·중복 88쪽의 머리글 줄이 3그룹으로 읽혔다는 관찰이다. 정상·중복 머리글 전체(96쪽)나 다른 표·OCR 실행에서 항상 그렇다는 일반화가 아니다.
  - `sports-c0` 8쪽은 등록 가정(K1이 목표 표지 줄 선택)이 성립하지 않아 이 비교 밖이다.
  - 머리글 줄 분할, 표제 누락, 추가 그룹이 생기는 표에서는 다른 결과가 나올 수 있다. 여기서는 재지 않았다.
- **고정 단계의 손실:** `sports-c0` 8쪽의 K1 머리글 줄 선택은 W4 밖(고정 #147 K1)에서 생겼다. 관찰된 기록은 단어 분절과 동점 처리(줄 신뢰도)다. W4는 이 쪽들을 개선하지 못한다.
- **독립성:**
  - 독립 검산기(`recount.py`)는 JS 코드를 가져오지 않는다.
  - 다만 구현자와 **같은 저자**(Claude)가 썼다. K0/K1·W1·W2·W3 부분은 #152 검산기에서 옮겼다.
  - 같은 오해가 양쪽에 들어갔을 가능성을 배제하지 못한다.
  - 구현 뒤, 동결 전에 W3·W4를 무작위 합성 입력 7,000건으로 JS와 Python에 함께 돌렸고 출력이 모두 같았다. 이 대조는 등록 시험이 아니다.
- **표본:** 12원본 × 12변형의 짝지은 설계라 144개 독립 사례가 아니다.
  - 추론 검정·신뢰구간·일반화 주장을 하지 않는다.
  - 카드·자유형 문서, 실제 스캔, 다른 OCR 엔진으로 넓히지 않는다.
- **제품:** 이 실험은 제품 기본 동작을 바꾸지 않는다. 채택 여부는 사용자 결정이다.

## 11. 재현과 검산

- 공식 경로(동결 OCR 재생 A/B, 채점, 표, 검산, 변조)와 선택 경로(자료 재생성, 새 CPU OCR)는 `README.md`에 있다. 새 클론에서 실행해 게시 출력과 해시를 비교했다(인계서).
- 검산 결과:
  - `recount/recount-a.json`, `recount/recount-b.json`: 모든 검사 통과
  - `recount/mutation.json`: 변조 거부
