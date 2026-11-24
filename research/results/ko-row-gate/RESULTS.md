# ko-row-gate 결과 — 질문 유형과 같은 행 답 후보의 유일성으로 W2 적용을 정하는 W3 (새 한국어 12원본 × 4배치)

프로토콜: `research/plans/2026-11-24-ko-row-gate-protocol.md`. 재현: 같은 폴더의 `README.md`. 검산 명세: `research/tools/ko-row-gate/RECOUNT_SPEC.md`.
표는 `src/ko-row-gate-report.mjs`가 `score-a/summary.json`에서 기계로 채운다. Python 검산기는 표를 칸 단위로 다시 계산해 대조한다. 표 밖 문장은 사람이 쓴 해석이다.

## 1. 요약

- 48쪽 모두 정상 처리되었다(기술 오류 0, 미매치 0, 한글 분기 48). 고정 W1은 48쪽 모두 엄격 성공이다.
- **W2(#151 규칙)**: 46쪽에서 세로를 잘랐다. 엄격 성공은 25/48이고, 23쪽(L2 23/48)을 잃었다. 잃은 쪽은 모두 답이 표지 아래 줄에 있는 `below-*` 배치다.
- **W3**: 20쪽에서만 W2를 적용하고 나머지는 W1을 유지했다. 엄격 성공은 38/48이다. W2 손실 23쪽 중 13쪽을 막았고(예방 13/23, `prevented_some`), 10쪽은 W3도 잃었다(L3 10/48).
- W3가 잃은 10쪽은 모두 **`below-same`**이다. 같은 행에 있는 유일 후보가 의도된 방해 값(분류 `intended_decoy` 10)이었고, W3는 그 후보 때문에 W2를 적용해 아래 줄의 답을 잘랐다. 프로토콜 3.4절에 등록한 설계상 반례가 그대로 나타났다. W3는 이 손실을 막지 못한다.
- `same-other` 10쪽에서 W3는 목표 값을 유일 후보로 보고(분류 `target_value` 10) W2를 적용했다. 답을 지키면서 W1에서 완전히 보이던 다른 레코드 값을 모두 가렸다(W3 사건 10, 원본 10개). `same-same` 12쪽은 후보가 둘(값과 방해 값)이라 W1을 유지했다. 그래서 W2가 이 12쪽에서 가린 다른 값은 W3에서 다시 보인다(W2 사건 23 중 W3 유지 10).
- 판정(5절 표): 전체 `loss3 = loss`, `prevention = prevented_some`, `removal = observed_repeated_sources`. W3는 W2보다 손실이 적다(23 → 10). 그러나 손실이 0이 아니고, 손실은 한 배치에 몰려 있다.
- 검산: 재생·채점 A/B는 바이트가 같다(`ab-compare.json`, `reproduced: true`). Python 독립 검산 A·B와 공개 표 칸 대조가 모두 통과했다. 변조 14종은 모두 거부되었다. 검산기 작성자는 구현자와 같다(6절).

## 2. 시점과 고정값

| 단계 | 커밋(KST) | 내용 |
|---|---|---|
| 사전등록 | `9c53218` 2026-11-24 23:25:40 | 프로토콜, 생성기, W3 규칙, 결과 스키마, 손계산 예제, 검산 명세 |
| RED 기록 | `d319d98` 23:26:09 | 구현 전 시험 실패 기록 |
| 구현 | `b061672` 23:40:13 | JS W3·채점, Python 검산 |
| 자료 동결 | `3f27fb9` 23:41:18 (핀 `78f5943` 23:41:30) | 48쪽, manifest SHA-256 `53222cc6…1e69` |
| OCR 1회 | 23:42:07–23:42:59 실행, 동결 `64d786e` 23:43:10 | 48/48 정상, 가드 차단 0, 입력은 질문 1개와 PNG 48개뿐 |
| 예측 동결 | `22af341` 23:43:20 push | `predictions.jsonl` SHA-256 `319913c8…2ed0` |
| 채점 | 23:43:27 시작 | `score-meta.json`: 예측 = HEAD blob(`predictionsCommittedAtHead: true`) |

- 채점 측 파일(`scoring/` design·gold·render·render-check)의 사용 범위:
  - **OCR 전 자료 단계에서는 사용했다.** 생성기(`design.py`)와 고정 렌더러가 이 파일을 만들었다. `src/ko-row-gate-data.mjs`의 `runChecks`(자료 정합성 검사, `check` 명령)가 design·gold·render·render-check를 읽어 배정·문법·잉크 배치·짝·기준 띠·이전 세트 겹침을 확인했다. 그 결과 `checks.json`은 동결 자료(`3f27fb9`)에 들어 있다. 이 검사는 OCR·K1·예측을 쓰지 않는다.
  - **OCR·K1·W1/W2/W3 예측 단계에서는 접근하지 않았다.** 근거는 두 입력 기록이다. OCR 실행기(`ocr/guard-summary.json`의 `approvedInputs` 49개)와 재생(`replay-a/inputs.json`의 `data` 49개)이 연 자료는 모두 `selector/questions.json`과 `selector/images/*.png`다. 재생이 연 OCR 파일은 `ocr/` 폴더의 3개다. 두 단계는 선택기 측 허용 목록 리더를 거치며, 다른 경로를 열면 예외가 난다(시험 15).
  - **동결 예측을 gold와 결합한 최초 채점**은 예측 커밋 `22af341`을 push한(23:43:20) 뒤에 시작했다(23:43:27). `src/ko-row-gate-score.mjs`는 예측 48행을 검증한 다음에야 `readScoringInputs`로 채점 측을 연다. `score-a/score-meta.json`에는 `head 22af341`, `predictionsCommittedAtHead: true`가 기록돼 있다.
- 출력 해시(원바이트 SHA-256): `score-a/score.jsonl` `dc38cb79…1a03`, `score-a/summary.json` `a9b754fc…a355`. B는 A와 바이트가 같다.

## 3. 단계별 쪽수

<!-- krg:table stages -->
| 항목 | 쪽수 |
|---|---|
| 등록 쪽 | 48 |
| 기술 오류 | 0 |
| 정상 처리(미매치 포함) | 48 |
| 정상 미매치 | 0 |
| K0 매치 | 0 |
| 한글 매치 | 48 |
| W1 widened | 46 |
| W1 not_wider | 2 |
| W1 no_candidate | 0 |
| W1 k0_branch | 0 |
| W2 cut | 46 |
| W2 no_cut | 0 |
| W2 hit_outside_w1 | 0 |
| W2 inherit | 2 |
| W3 error | 0 |
| W3 unmatched | 0 |
| W3 not_applicable | 2 |
| W3 qtype_none | 0 |
| W3 qtype_multiple | 0 |
| W3 no_valid_hit_word | 0 |
| W3 no_candidate | 14 |
| W3 multiple_candidates | 12 |
| W3 candidate_outside_w2 | 0 |
| W3 applied | 20 |
<!-- /krg:table -->

## 4. 그룹별 결과

### 4.1 엄격 성공, 손실, 예방, 다른 값 사건

<!-- krg:table groups -->
| 그룹 | n | 오류 | 미매치 | 매치 | W1 엄격 | W2 엄격 | W3 엄격 | W2 cut | W3 적용 | L2 손실/W1 성공 | L3 손실/W1 성공 | L3 원본 | 예방/L2 | 공통 기회 | 기회 원본 | W2 사건 | W3 사건 | W3 사건 원본 | W3 유지/W2 사건 | 회복 W2(전체쪽) | 회복 W3(전체쪽) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 전체 | 48 | 0 | 0 | 48 | 48 | 25 | 38 | 46 | 20 | 23/48 | 10/48 | 10 | 13/23 | 46 | 12 | 23 | 10 | 10 | 10/23 | 0 (0) | 0 (0) |
| W2 cut | 46 | 0 | 0 | 46 | 46 | 23 | 36 | 46 | 20 | 23/46 | 10/46 | 10 | 13/23 | 46 | 12 | 23 | 10 | 10 | 10/23 | 0 (0) | 0 (0) |
| W3 applied | 20 | 0 | 0 | 20 | 20 | 10 | 10 | 20 | 20 | 10/20 | 10/20 | 10 | 0/10 | 20 | 10 | 10 | 10 | 10 | 10/10 | 0 (0) | 0 (0) |
| layout same-same | 12 | 0 | 0 | 12 | 12 | 12 | 12 | 12 | 0 | 0/12 | 0/12 | 0 | 0/0 | 12 | 12 | 12 | 0 | 0 | 0/12 | 0 (0) | 0 (0) |
| layout same-other | 12 | 0 | 0 | 12 | 12 | 12 | 12 | 11 | 10 | 0/12 | 0/12 | 0 | 0/0 | 11 | 11 | 11 | 10 | 10 | 10/11 | 0 (0) | 0 (0) |
| layout below-same | 12 | 0 | 0 | 12 | 12 | 1 | 2 | 11 | 10 | 11/12 | 10/12 | 10 | 1/11 | 11 | 11 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| layout below-other | 12 | 0 | 0 | 12 | 12 | 0 | 12 | 12 | 0 | 12/12 | 0/12 | 0 | 12/12 | 12 | 12 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| ans same | 24 | 0 | 0 | 24 | 24 | 24 | 24 | 23 | 10 | 0/24 | 0/24 | 0 | 0/0 | 23 | 12 | 23 | 10 | 10 | 10/23 | 0 (0) | 0 (0) |
| ans below | 24 | 0 | 0 | 24 | 24 | 1 | 14 | 23 | 10 | 23/24 | 10/24 | 10 | 13/23 | 23 | 12 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| dec same | 24 | 0 | 0 | 24 | 24 | 13 | 14 | 23 | 10 | 11/24 | 10/24 | 10 | 1/11 | 23 | 12 | 12 | 0 | 0 | 0/12 | 0 (0) | 0 (0) |
| dec other | 24 | 0 | 0 | 24 | 24 | 12 | 24 | 23 | 10 | 12/24 | 0/24 | 0 | 12/12 | 23 | 12 | 11 | 10 | 10 | 10/11 | 0 (0) | 0 (0) |
| form table | 24 | 0 | 0 | 24 | 24 | 13 | 20 | 22 | 8 | 11/24 | 4/24 | 4 | 7/11 | 22 | 6 | 11 | 4 | 4 | 4/11 | 0 (0) | 0 (0) |
| form cards | 24 | 0 | 0 | 24 | 24 | 12 | 18 | 24 | 12 | 12/24 | 6/24 | 6 | 6/12 | 24 | 6 | 12 | 6 | 6 | 6/12 | 0 (0) | 0 (0) |
| doctype lecture | 16 | 0 | 0 | 16 | 16 | 9 | 13 | 14 | 6 | 7/16 | 3/16 | 3 | 4/7 | 14 | 4 | 7 | 3 | 3 | 3/7 | 0 (0) | 0 (0) |
| doctype exhibit | 16 | 0 | 0 | 16 | 16 | 8 | 12 | 16 | 8 | 8/16 | 4/16 | 4 | 4/8 | 16 | 4 | 8 | 4 | 4 | 4/8 | 0 (0) | 0 (0) |
| doctype meeting | 16 | 0 | 0 | 16 | 16 | 8 | 13 | 16 | 6 | 8/16 | 3/16 | 3 | 5/8 | 16 | 4 | 8 | 3 | 3 | 3/8 | 0 (0) | 0 (0) |
| qtype time | 16 | 0 | 0 | 16 | 16 | 9 | 13 | 14 | 6 | 7/16 | 3/16 | 3 | 4/7 | 14 | 4 | 7 | 3 | 3 | 3/7 | 0 (0) | 0 (0) |
| qtype count | 16 | 0 | 0 | 16 | 16 | 8 | 13 | 16 | 6 | 8/16 | 3/16 | 3 | 5/8 | 16 | 4 | 8 | 3 | 3 | 3/8 | 0 (0) | 0 (0) |
| qtype pages | 16 | 0 | 0 | 16 | 16 | 8 | 12 | 16 | 8 | 8/16 | 4/16 | 4 | 4/8 | 16 | 4 | 8 | 4 | 4 | 4/8 | 0 (0) | 0 (0) |
| W3 error | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| W3 unmatched | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| W3 not_applicable | 2 | 0 | 0 | 2 | 2 | 2 | 2 | 0 | 0 | 0/2 | 0/2 | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| W3 qtype_none | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| W3 qtype_multiple | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| W3 no_valid_hit_word | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| W3 no_candidate | 14 | 0 | 0 | 14 | 14 | 1 | 14 | 14 | 0 | 13/14 | 0/14 | 0 | 13/13 | 14 | 12 | 1 | 0 | 0 | 0/1 | 0 (0) | 0 (0) |
| W3 multiple_candidates | 12 | 0 | 0 | 12 | 12 | 12 | 12 | 12 | 0 | 0/12 | 0/12 | 0 | 0/0 | 12 | 12 | 12 | 0 | 0 | 0/12 | 0 (0) | 0 (0) |
| W3 candidate_outside_w2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 (0) | 0 (0) |
| W3 applied | 20 | 0 | 0 | 20 | 20 | 10 | 10 | 20 | 20 | 10/20 | 10/20 | 10 | 0/10 | 20 | 10 | 10 | 10 | 10 | 10/10 | 0 (0) | 0 (0) |
<!-- /krg:table -->

### 4.2 W3 사유

<!-- krg:table reasons -->
| 그룹 | not_applicable | qtype_none | qtype_multiple | no_valid_hit_word | no_candidate | multiple_candidates | candidate_outside_w2 | applied | error | unmatched |
|---|---|---|---|---|---|---|---|---|---|---|
| 전체 | 2 | 0 | 0 | 0 | 14 | 12 | 0 | 20 | 0 | 0 |
| W2 cut | 0 | 0 | 0 | 0 | 14 | 12 | 0 | 20 | 0 | 0 |
| W3 applied | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 0 |
| layout same-same | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 |
| layout same-other | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 10 | 0 | 0 |
| layout below-same | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 10 | 0 | 0 |
| layout below-other | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 |
| ans same | 1 | 0 | 0 | 0 | 1 | 12 | 0 | 10 | 0 | 0 |
| ans below | 1 | 0 | 0 | 0 | 13 | 0 | 0 | 10 | 0 | 0 |
| dec same | 1 | 0 | 0 | 0 | 1 | 12 | 0 | 10 | 0 | 0 |
| dec other | 1 | 0 | 0 | 0 | 13 | 0 | 0 | 10 | 0 | 0 |
| form table | 2 | 0 | 0 | 0 | 8 | 6 | 0 | 8 | 0 | 0 |
| form cards | 0 | 0 | 0 | 0 | 6 | 6 | 0 | 12 | 0 | 0 |
| doctype lecture | 2 | 0 | 0 | 0 | 4 | 4 | 0 | 6 | 0 | 0 |
| doctype exhibit | 0 | 0 | 0 | 0 | 4 | 4 | 0 | 8 | 0 | 0 |
| doctype meeting | 0 | 0 | 0 | 0 | 6 | 4 | 0 | 6 | 0 | 0 |
| qtype time | 2 | 0 | 0 | 0 | 4 | 4 | 0 | 6 | 0 | 0 |
| qtype count | 0 | 0 | 0 | 0 | 6 | 4 | 0 | 6 | 0 | 0 |
| qtype pages | 0 | 0 | 0 | 0 | 4 | 4 | 0 | 8 | 0 | 0 |
| W3 error | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 unmatched | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 not_applicable | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 qtype_none | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 qtype_multiple | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 no_valid_hit_word | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 no_candidate | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 |
| W3 multiple_candidates | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 |
| W3 candidate_outside_w2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 applied | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 0 |
<!-- /krg:table -->

### 4.3 유일 후보의 골드 분류 (채점 측 진단, 판정에 쓰지 않음)

<!-- krg:table candidates -->
| 그룹 | 유일 후보 쪽 | 목표 값 | 의도 방해 | 타 레코드 값 | 기타/모호 | 적용 중 목표 값 | 적용 중 의도 방해 | 적용 중 타 레코드 값 | 적용 중 기타/모호 |
|---|---|---|---|---|---|---|---|---|---|
| 전체 | 20 | 10 | 10 | 0 | 0 | 10 | 10 | 0 | 0 |
| W2 cut | 20 | 10 | 10 | 0 | 0 | 10 | 10 | 0 | 0 |
| W3 applied | 20 | 10 | 10 | 0 | 0 | 10 | 10 | 0 | 0 |
| layout same-same | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| layout same-other | 10 | 10 | 0 | 0 | 0 | 10 | 0 | 0 | 0 |
| layout below-same | 10 | 0 | 10 | 0 | 0 | 0 | 10 | 0 | 0 |
| layout below-other | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ans same | 10 | 10 | 0 | 0 | 0 | 10 | 0 | 0 | 0 |
| ans below | 10 | 0 | 10 | 0 | 0 | 0 | 10 | 0 | 0 |
| dec same | 10 | 0 | 10 | 0 | 0 | 0 | 10 | 0 | 0 |
| dec other | 10 | 10 | 0 | 0 | 0 | 10 | 0 | 0 | 0 |
| form table | 8 | 4 | 4 | 0 | 0 | 4 | 4 | 0 | 0 |
| form cards | 12 | 6 | 6 | 0 | 0 | 6 | 6 | 0 | 0 |
| doctype lecture | 6 | 3 | 3 | 0 | 0 | 3 | 3 | 0 | 0 |
| doctype exhibit | 8 | 4 | 4 | 0 | 0 | 4 | 4 | 0 | 0 |
| doctype meeting | 6 | 3 | 3 | 0 | 0 | 3 | 3 | 0 | 0 |
| qtype time | 6 | 3 | 3 | 0 | 0 | 3 | 3 | 0 | 0 |
| qtype count | 6 | 3 | 3 | 0 | 0 | 3 | 3 | 0 | 0 |
| qtype pages | 8 | 4 | 4 | 0 | 0 | 4 | 4 | 0 | 0 |
| W3 error | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 unmatched | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 not_applicable | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 qtype_none | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 qtype_multiple | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 no_valid_hit_word | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 no_candidate | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 multiple_candidates | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 candidate_outside_w2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| W3 applied | 20 | 10 | 10 | 0 | 0 | 10 | 10 | 0 | 0 |
<!-- /krg:table -->

### 4.4 다른 레코드 지정 값의 노출

<!-- krg:table others -->
| 그룹 | W1 완전 값(쪽) | W1 완전→W2 완전/일부/전혀 | W1 완전→W3 완전/일부/전혀 | W2 전혀≥1 쪽 | W3 전혀≥1 쪽 | W3 일부≥1 쪽 | W3 새 완전 |
|---|---|---|---|---|---|---|---|
| 전체 | 78 (46) | 0/0/78 | 44/0/34 | 46 | 20 | 0 | 0 |
| W2 cut | 78 (46) | 0/0/78 | 44/0/34 | 46 | 20 | 0 | 0 |
| W3 applied | 34 (20) | 0/0/34 | 0/0/34 | 20 | 20 | 0 | 0 |
| layout same-same | 20 (12) | 0/0/20 | 20/0/0 | 12 | 0 | 0 | 0 |
| layout same-other | 19 (11) | 0/0/19 | 2/0/17 | 11 | 10 | 0 | 0 |
| layout below-same | 19 (11) | 0/0/19 | 2/0/17 | 11 | 10 | 0 | 0 |
| layout below-other | 20 (12) | 0/0/20 | 20/0/0 | 12 | 0 | 0 | 0 |
| ans same | 39 (23) | 0/0/39 | 22/0/17 | 23 | 10 | 0 | 0 |
| ans below | 39 (23) | 0/0/39 | 22/0/17 | 23 | 10 | 0 | 0 |
| dec same | 39 (23) | 0/0/39 | 22/0/17 | 23 | 10 | 0 | 0 |
| dec other | 39 (23) | 0/0/39 | 22/0/17 | 23 | 10 | 0 | 0 |
| form table | 38 (22) | 0/0/38 | 24/0/14 | 22 | 8 | 0 | 0 |
| form cards | 40 (24) | 0/0/40 | 20/0/20 | 24 | 12 | 0 | 0 |
| doctype lecture | 26 (14) | 0/0/26 | 14/0/12 | 14 | 6 | 0 | 0 |
| doctype exhibit | 28 (16) | 0/0/28 | 14/0/14 | 16 | 8 | 0 | 0 |
| doctype meeting | 24 (16) | 0/0/24 | 16/0/8 | 16 | 6 | 0 | 0 |
| qtype time | 26 (14) | 0/0/26 | 14/0/12 | 14 | 6 | 0 | 0 |
| qtype count | 28 (16) | 0/0/28 | 18/0/10 | 16 | 6 | 0 | 0 |
| qtype pages | 24 (16) | 0/0/24 | 12/0/12 | 16 | 8 | 0 | 0 |
| W3 error | 0 (0) | 0/0/0 | 0/0/0 | 0 | 0 | 0 | 0 |
| W3 unmatched | 0 (0) | 0/0/0 | 0/0/0 | 0 | 0 | 0 | 0 |
| W3 not_applicable | 0 (0) | 0/0/0 | 0/0/0 | 0 | 0 | 0 | 0 |
| W3 qtype_none | 0 (0) | 0/0/0 | 0/0/0 | 0 | 0 | 0 | 0 |
| W3 qtype_multiple | 0 (0) | 0/0/0 | 0/0/0 | 0 | 0 | 0 | 0 |
| W3 no_valid_hit_word | 0 (0) | 0/0/0 | 0/0/0 | 0 | 0 | 0 | 0 |
| W3 no_candidate | 24 (14) | 0/0/24 | 24/0/0 | 14 | 0 | 0 | 0 |
| W3 multiple_candidates | 20 (12) | 0/0/20 | 20/0/0 | 12 | 0 | 0 | 0 |
| W3 candidate_outside_w2 | 0 (0) | 0/0/0 | 0/0/0 | 0 | 0 | 0 | 0 |
| W3 applied | 34 (20) | 0/0/34 | 0/0/34 | 20 | 20 | 0 | 0 |
<!-- /krg:table -->

### 4.5 줄어든 면적 (페이지 면적 대비 %p)

<!-- krg:table area -->
| 그룹 | 유효 쌍 | W2 평균 %p | W2 중앙 %p | W2 최대 %p | W3 평균 %p | W3 중앙 %p | W3 최대 %p | W3 적용 쪽 | 적용 평균 %p | 적용 중앙 %p | 적용 최대 %p |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 전체 | 48 | 27.5553 | 28.1784 | 38.9945 | 11.6822 | 0 | 38.888 | 20 | 28.0372 | 28.1784 | 38.888 |
| W2 cut | 46 | 28.7534 | 30.1849 | 38.9945 | 12.1901 | 0 | 38.888 | 20 | 28.0372 | 28.1784 | 38.888 |
| W3 applied | 20 | 28.0372 | 28.1784 | 38.888 | 28.0372 | 28.1784 | 38.888 | 20 | 28.0372 | 28.1784 | 38.888 |
| layout same-same | 12 | 28.4748 | 28.1784 | 38.9945 | 0 | 0 | 0 | 0 | — | — | — |
| layout same-other | 12 | 26.614 | 28.1784 | 38.9945 | 23.3645 | 26.0846 | 38.888 | 10 | 28.0374 | 28.1784 | 38.888 |
| layout below-same | 12 | 26.6137 | 28.2656 | 38.9945 | 23.3641 | 26.0846 | 38.888 | 10 | 28.037 | 28.2656 | 38.888 |
| layout below-other | 12 | 28.5187 | 28.2656 | 38.9945 | 0 | 0 | 0 | 0 | — | — | — |
| ans same | 24 | 27.5444 | 28.1784 | 38.9945 | 11.6822 | 0 | 38.888 | 10 | 28.0374 | 28.1784 | 38.888 |
| ans below | 24 | 27.5662 | 28.2656 | 38.9945 | 11.6821 | 0 | 38.888 | 10 | 28.037 | 28.2656 | 38.888 |
| dec same | 24 | 27.5442 | 28.1784 | 38.9945 | 11.6821 | 0 | 38.888 | 10 | 28.037 | 28.2656 | 38.888 |
| dec other | 24 | 27.5664 | 28.1784 | 38.9945 | 11.6822 | 0 | 38.888 | 10 | 28.0374 | 28.1784 | 38.888 |
| form table | 24 | 28.7562 | 30.3594 | 38.9945 | 10.1835 | 0 | 38.888 | 8 | 30.5505 | 30.3594 | 38.888 |
| form cards | 24 | 26.3544 | 26.0846 | 34.696 | 13.1808 | 9.2474 | 34.696 | 12 | 26.3616 | 26.0846 | 34.696 |
| doctype lecture | 16 | 25.4194 | 28.2656 | 33.849 | 11.2975 | 0 | 33.849 | 6 | 30.1267 | 30.3594 | 33.849 |
| doctype exhibit | 16 | 30.7042 | 32.4385 | 38.888 | 15.3521 | 9.525 | 38.888 | 8 | 30.7042 | 32.4385 | 38.888 |
| doctype meeting | 16 | 26.5422 | 24.3398 | 38.9945 | 8.3968 | 0 | 25.9974 | 6 | 22.3915 | 22.6823 | 25.9974 |
| qtype time | 16 | 27.7083 | 30.2575 | 38.888 | 12.4365 | 0 | 38.888 | 6 | 33.1641 | 34.6068 | 38.888 |
| qtype count | 16 | 28.6439 | 28.2656 | 38.9945 | 9.4477 | 0 | 30.3594 | 6 | 25.1938 | 26.1719 | 30.3594 |
| qtype pages | 16 | 26.3136 | 26.4336 | 33.849 | 13.1623 | 9.2474 | 33.849 | 8 | 26.3245 | 26.4336 | 33.849 |
| W3 error | 0 | — | — | — | — | — | — | 0 | — | — | — |
| W3 unmatched | 0 | — | — | — | — | — | — | 0 | — | — | — |
| W3 not_applicable | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | — |
| W3 qtype_none | 0 | — | — | — | — | — | — | 0 | — | — | — |
| W3 qtype_multiple | 0 | — | — | — | — | — | — | 0 | — | — | — |
| W3 no_valid_hit_word | 0 | — | — | — | — | — | — | 0 | — | — | — |
| W3 no_candidate | 14 | 30.0153 | 30.3594 | 38.9945 | 0 | 0 | 0 | 0 | — | — | — |
| W3 multiple_candidates | 12 | 28.4748 | 28.1784 | 38.9945 | 0 | 0 | 0 | 0 | — | — | — |
| W3 candidate_outside_w2 | 0 | — | — | — | — | — | — | 0 | — | — | — |
| W3 applied | 20 | 28.0372 | 28.1784 | 38.888 | 28.0372 | 28.1784 | 38.888 | 20 | 28.0372 | 28.1784 | 38.888 |
<!-- /krg:table -->

## 5. 판정

<!-- krg:table verdict -->
| 그룹 | W3 손실 판정 | W2 손실 판정 | 예방 판정 | 제거 판정 |
|---|---|---|---|---|
| 전체 | loss | loss | prevented_some | observed_repeated_sources |
| layout same-same | no_loss | no_loss | no_w2_loss | no_opportunity_applied |
| layout same-other | no_loss | no_loss | no_w2_loss | observed_repeated_sources |
| layout below-same | loss | loss | prevented_some | not_observed |
| layout below-other | no_loss | loss | prevented_all | no_opportunity_applied |
<!-- /krg:table -->

## 6. 원본 × 배치

칸 형식: `{W1}{W2}{W3} 엄격 S/F`, W3 사유, `c`+후보 수, 유일 후보 분류(T 목표 값, D 의도 방해, O 다른 레코드 값, X 기타/모호), W1→W3 완전 노출 다른 값 수, `none`+W1 완전에서 W3 전혀로 바뀐 수.

<!-- krg:table sources -->
| 원본 | 양식 | 유형 | 목표 슬롯 | same-same | same-other | below-same | below-other |
|---|---|---|---|---|---|---|---|
| lecture-table-c0 | table | time | 0 | SSS multiple_candidates c2 - 1→1 | SSS not_applicable c0 - 0→0 | SSS not_applicable c0 - 0→0 | SFS no_candidate c0 - 1→1 |
| lecture-table-c1 | table | count | 1 | SSS multiple_candidates c2 - 2→2 | SSS applied c1 T 2→0 none2 | SFF applied c1 D 2→0 none2 | SFS no_candidate c0 - 2→2 |
| lecture-cards-c0 | cards | count | 1 | SSS multiple_candidates c2 - 2→2 | SSS applied c1 T 2→0 none2 | SFF applied c1 D 2→0 none2 | SFS no_candidate c0 - 2→2 |
| lecture-cards-c1 | cards | pages | 2 | SSS multiple_candidates c2 - 2→2 | SSS applied c1 T 2→0 none2 | SFF applied c1 D 2→0 none2 | SFS no_candidate c0 - 2→2 |
| exhibit-table-c0 | table | pages | 1 | SSS multiple_candidates c2 - 2→2 | SSS applied c1 T 2→0 none2 | SFF applied c1 D 2→0 none2 | SFS no_candidate c0 - 2→2 |
| exhibit-table-c1 | table | time | 2 | SSS multiple_candidates c2 - 2→2 | SSS applied c1 T 2→0 none2 | SFF applied c1 D 2→0 none2 | SFS no_candidate c0 - 2→2 |
| exhibit-cards-c0 | cards | time | 2 | SSS multiple_candidates c2 - 2→2 | SSS applied c1 T 2→0 none2 | SFF applied c1 D 2→0 none2 | SFS no_candidate c0 - 2→2 |
| exhibit-cards-c1 | cards | count | 0 | SSS multiple_candidates c2 - 1→1 | SSS applied c1 T 1→0 none1 | SFF applied c1 D 1→0 none1 | SFS no_candidate c0 - 1→1 |
| meeting-table-c0 | table | count | 2 | SSS multiple_candidates c2 - 2→2 | SSS no_candidate c0 - 2→2 | SFS no_candidate c0 - 2→2 | SFS no_candidate c0 - 2→2 |
| meeting-table-c1 | table | pages | 0 | SSS multiple_candidates c2 - 1→1 | SSS applied c1 T 1→0 none1 | SFF applied c1 D 1→0 none1 | SFS no_candidate c0 - 1→1 |
| meeting-cards-c0 | cards | pages | 0 | SSS multiple_candidates c2 - 1→1 | SSS applied c1 T 1→0 none1 | SFF applied c1 D 1→0 none1 | SFS no_candidate c0 - 1→1 |
| meeting-cards-c1 | cards | time | 1 | SSS multiple_candidates c2 - 2→2 | SSS applied c1 T 2→0 none2 | SFF applied c1 D 2→0 none2 | SFS no_candidate c0 - 2→2 |
<!-- /krg:table -->

## 7. 해석과 예외 쪽

- **배치가 결과를 정한다.** 원본 12개 중 10개가 배치마다 같은 모양을 보였다. `same-same`은 보류, `same-other`는 적용해 답 유지, `below-same`은 적용해 답 손실, `below-other`는 후보 0이라 보류해 W2 손실을 예방했다. 질문 유형·양식·문서 종류별 차이는 이 배치 효과를 다시 나눈 것이다(4절 표).
- **예외 원본 2개**
  - `lecture-table-c0`의 `same-other`·`below-same`: 고정 W1이 넓어지지 않아(`not_wider`) W2를 자르지 않았다. W3는 `not_applicable`이다. 이 두 쪽에서는 W2·W3 모두 W1과 같다.
  - `meeting-table-c0`의 두 쪽은 흐름이 서로 다르다. 원시 `ocr.jsonl`의 K1 표지 줄(줄 6, 히트 단어 0–2, y ≈ 346–368)과 렌더 잉크 좌표로 대조했다.
    - **`same-other`**
      1. 관찰한 토큰: 표지 줄에서 목표 값 `22명`(잉크 [452, 345, 498, 368]) 자리의 OCR 토큰은 `22%`([453.1, 345.9, 43.4, 22.2])다. 방해 값 `37명`은 아래 줄(잉크 y 385–408)에 `37`, `명`으로 읽혔고, 표지와 같은 행이 아니다.
      2. 후보 없음: `22%`는 count 문법에 맞지 않는다. 같은 행에 문법에 맞는 단위가 없다(`no_candidate`, `scan.count = 0`).
      3. W1 유지: W3 = W1이다.
      4. 결과: 답은 W1·W2·W3 모두에서 보인다(t12·t13 `keptSuccess`). W2는 다른 값 2개를 가렸고(W2 사건), W3는 W1을 유지했으므로 W3 사건이 아니다. 다른 원본의 `same-other` 11쪽 중 `lecture-table-c0`(W3 해당 없음)를 뺀 10쪽에서는 목표 값이 문법에 맞는 유일 후보로 읽혀 W2가 적용됐다.
    - **`below-same`**
      1. 관찰한 토큰: 표지 줄에서 방해 값 `37명`(잉크 [692, 345, 738, 368]) 자리의 OCR 토큰은 `37H`([692.8, 345.9, 44.4, 22.2])다. 목표 값 `22명`은 아래 줄(잉크 [452, 385, 498, 408])에 `22`, `명`으로 읽혔고, 표지와 같은 행이 아니다.
      2. 후보 없음: `37H`는 count 문법에 맞지 않는다. 아래 줄의 `22명`은 같은 행 조건을 만족하지 않는다(`no_candidate`, `scan.count = 0`).
      3. W1 유지: W3 = W1이다.
      4. 보존: W2([324, 390) 세로 띠)는 아래 줄의 답을 잘라 잃었다(t12 `lost`, 잃은 골드 `value`). W3는 W1을 유지해 답을 보존했다(t13 `keptSuccess`, `prevented`). 이것이 예방 13건 중 1건이다.
      - 다른 원본의 `below-same` 11쪽 중 `lecture-table-c0`는 W2가 자르지 않아 W3 해당 없음이다. 나머지 10쪽에서는 OCR이 방해 값을 문법에 맞게 읽었고, 그 쪽들은 유일 후보(`intended_decoy`) 때문에 W2를 적용해 답을 잃었다. 이 1건의 예방은 방해 값 토큰이 문법에 맞지 않게 읽혀 후보가 없어진 데서 나왔다. W3가 방해 값을 가려낸 결과가 아니다.
- **W2 손실 예방 13건의 내역**
  - `below-other` 12건: 표지 줄에 값·방해 값이 없는 배치라 후보가 0이었고, W3가 W1을 유지했다(등록 기하 예측과 같음).
  - `meeting-table-c0-below-same` 1건: 위 흐름이다.
  - `below-same`에서 OCR이 방해 값을 문법에 맞게 읽은 10쪽은 모두 잃었다.
- **면적**: W3 적용 20쪽의 평균 절감은 28.04%p로, W2 적용과 같은 크기다. 전체 48쪽 평균은 11.68%p다(W2는 27.56%p). W3는 W2의 절감을 보류한 쪽에서 포기한다.
- **나빠진 지표**: W2보다 나은 W3 손실(10 vs 23)도 W1(손실 0)보다는 나쁘다. W3는 답을 잃는 쪽(10)과 다른 값을 가리는 쪽(10)을 같은 기준(같은 행 유일 후보)으로 고르므로 둘을 구분하지 못한다. 그 원인은 `below-same` 설계처럼 같은 행에 답 형태의 방해 값이 있는 것이다.

## 8. 한계

- 합성 자료 48쪽(12원본)의 결과다. 배치 4종은 설계로 고정했고 실제 문서의 빈도를 나타내지 않는다. 결과는 배치 비율에 크게 좌우된다.
- 원본 12개 가운데 2개는 위 예외 때문에 전형적인 모양을 보이지 않았다. 배치당 실질 표본은 10–12쪽이다.
- OCR은 CPU 1회(O1, eng+kor, tesseract.js 5.1.1)다. 재생 A/B는 같은 동결 OCR을 다시 읽은 결정성 확인이며, OCR 반복 측정이 아니다.
- 질문 유형 단서는 고정 부분 문자열이다(`몇시간`도 `time`). 이 자료의 12개 질문에는 해당하지 않았다(유형 없음·복수 0).
- `no_valid_hit_word`, `candidate_outside_w2`, `qtype_*`는 실제 자료에서 0이다. 손계산 예제로만 시험했다. `no_valid_hit_word`는 고정 W2가 0 크기 히트를 검증 실패로 처리하므로 실제 파이프라인에서 나올 수 없다.
- 검산기(`recount.py`)와 명세는 구현자가 썼다. 하위 에이전트를 쓰지 않는 과제 조건 때문이다. 공유 코드는 없지만 명세 오독이 양쪽에 같이 들어갈 수 있다.
  - 완화: 저장소 밖에서 무작위 입력 2000건으로 JS·Python W3를 비교했고 다른 결과 0건이었다.
  - 측정 뒤 검산기 결함 1건을 고쳤다. 검사 1c가 프로토콜 3.3절의 "지정 값·방해 값 6개"를 목표 방해 값만으로 좁혀 읽어 실패했다. 판정 규칙·자료·예측·채점 파일은 바뀌지 않았다. 수정 사실을 `RECOUNT_SPEC.md` 2.7절에 날짜와 함께 적었다.
- #151 자료에는 W3를 실행하지 않았다.
