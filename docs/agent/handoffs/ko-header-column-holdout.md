# 인계: ko-header-column-holdout (OCR 열 머리글과 질문 필드의 연결로 W2 적용 여부를 정하는 W4, 새 한국어 12원본 × 12변형)

- 날짜: 2026-11-25
- Task: Orca task_4f9ac9363341, Tier E, #152 후속(사용자 승인)
- 작업자: Claude Code(Opus 5.5). 연구 작성자이자 구현자다. **독립 Python 검산기도 같은 작성자가 썼다.**
- 최종 판정: Codex Astra(PM, 최초 계획자)와 PM이 배정한 별도 Opus(원자료 재계산)
- 브랜치: `claude/ko-header-column-holdout`
  - 기준 main: `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`
  - Draft PR: #153
  - #147·#150·#151·#152는 Git 객체로만 읽는다.
- 문서 위치:
  - 프로토콜: `research/plans/2026-11-25-ko-header-column-protocol.md`
  - 검산 명세: `research/tools/ko-header-column/RECOUNT_SPEC.md`
  - 결과: `research/results/ko-header-column/RESULTS.md`
  - 재현: `research/results/ko-header-column/README.md`

## 상태

완료. 결과를 동결했고, 검산·변조·새 클론 재현·연구/제품 검증을 마쳤다. Ready·merge·제품 적용은 하지 않았다(사용자 결정).

## 결과 요약

**판정 코드: `geometry_ok_reading_worse`.** 기하는 충족했지만 읽기 근거 악화로 권고를 보류한다.

| 항목 | 값 |
|---|---|
| 입력 | 144쪽. OCR 오류 0, 미매치 0, A/B 바이트 동일 |
| 엄격 성공 W1 / W2 / W3 / W4 | 136 / 68 / 69 / 136 (분모 144) |
| L2 / L3 / L4 (분모 W1 성공 136) | 68 / 67 / **0** |
| L3 중 W4 예방 | 67/67 (12원본) |
| W3→W4 새 손실 / 회복 | 0/69 / 67/75 |
| W2 `cut` / `inherit` | 136 / 8 (분모 144) |
| W4 적용 / 판정 단계 보류 / 미적용(`not_applicable`) | 22 / 114 (= 48 + 44 + 22) / 8 |
| W4 = 기존 W1 창 | 122 (= 114 + 8) |
| W4 적용 | 22쪽. 전부 정상 머리글·같은 줄 답, 11원본 × L·R |
| gold 귀속(정상 적용) | 정답 22/22 (L 11, R 11), 오선택 0, 미확정 0 |
| J2 / J3 / J4 | 68 / 0 / 22 쪽 (J4 원본 L 11, R 11). J3 0: W3 적용 67쪽 모두 엄격 실패, W3 성공 69쪽은 모두 기존 W1 창 유지(68 + 1) |
| 공란·중복 적용 | 0 / 0 |
| 정상 머리글 새 E1(W1 대비, W4) | **22쪽 11원본 = 적용 22쪽 전부** (비교 쪽 48) |
| 좌우 불일치(W4 사유·W4 엄격·J4·귀속, 72쌍) | 0쌍. W3는 1쌍 갈림(p127 L / p031 R) |
| 면적 감소 평균(전체 매치 144) | `RESULTS.md` 7절 표 |

## 공개해야 할 오류·손실·한계

- **원본별 손실:** `sports-c0`의 정상·중복 8쪽은 W1–W4 모두 실패한다. W4 이전 고정 단계의 손실이며 W4로 개선되지 않는다.
  - 관찰된 기록:
    - OCR이 레코드 이름을 단어 "강 / 습 / 반"으로 나눠 냈다.
    - 고정 K1 점수는 머리글 줄("개장", "시각")과 레코드 줄("새벽", "수영")이 2로 동점이었다.
    - 동점 처리 규칙(줄 신뢰도가 높은 줄)에 따라 머리글 줄이 선택됐다(신뢰도 96.0–97.0 대 93.9–95.1). 그 결과 `not_wider`, `inherit`, W4 `not_applicable`이었다.
  - 분절이 원인이라는 반사실은 등록·검증하지 않았다.
  - 등록 3.4절 가정("K1이 목표 표지 줄을 고르고 W2가 실제로 자른다")이 성립하지 않은 쪽이라 이상적 경로 비교에서 뺐다.
  - 이 때문에 `sports-c0`의 적용·J4는 0이다.
- **한쪽만 나타난 동작(W4 기준):** 없음. 같은 원본·머리글·답 행의 L/R 72쌍에서 W4 사유, W4 엄격 성공, J4, 귀속이 모두 같았다.
  - 이 말은 그 네 항목에 한정한다.
  - 고정 W3는 `culture-c3` 공란·아래 줄 답 1쌍에서 갈렸다.
    - p127(L): OCR "176"+"쪽" → W3 `applied` → 엄격 실패
    - p031(R): OCR "176%" → `no_candidate` → 기존 W1 창 유지 → 엄격 성공
  - 두 쪽 모두 W4는 `header_none`, 엄격 성공이다.
- **W4가 W2를 고르지 않은 경우(122쪽):**
  - 판정 단계 보류 114쪽(W2 `cut` 136쪽 안):
    - 공란 48쪽: `header_none`(머리글 2그룹)
    - 중복 44쪽: `header_duplicate`
    - 정상·아래 줄 답 22쪽: `no_target_candidate`
  - 미적용 8쪽(W2 `inherit`): `sports-c0`, `not_applicable`
  - 기하 선행조건이 성립한 136쪽에서는 관찰된 W4 사유가 등록 예측표의 이상적 W4 열과 셀별로 같았다. 그 136쪽 안에서 OCR 표제 누락, 추가 그룹, 줄 분할에 따른 보류는 0이다.
  - 이것은 이 OCR 한 번에서 136쪽 중 정상·중복 88쪽의 머리글이 3그룹으로 읽혔다는 관찰이다. 정상·중복 전체나 다른 실행으로 일반화하지 않는다.
  - `sports-c0` 8쪽은 머리글 줄이 K1 줄이어서 W4가 `k1_line`으로 제외했고, 머리글 그룹화를 판정하지 않았다.
- **열 추론 오류:** 0. 적용 쪽 모두 목표 표제와 목표 값으로 귀속됐다.
- **트레이드오프:**
  - 판정 단계에서 보류한 114쪽은 기존 W1 창(전체 페이지가 아니라 표지 줄 주변을 오른쪽으로 넓힌 창)을 그대로 쓰므로, 그 창 안의 다른 레코드 값도 제외하지 않는다.
  - 미적용 8쪽도 기존 W1 창을 쓰지만, 그 창부터 엄격 실패다.
  - 적용 22쪽은 W2가 이미 성공하던 쪽이다.
  - 적용 쪽 모두에서 두 열 표제가 창 밖으로 나가고, 목표 값과 같은 레코드 경쟁 값만 남는다(새 E1). 등록 3.4절은 목표 슬롯 0 원본에서 이 현상을 예상했지만, 실제로는 적용된 11원본 전부에서 나타났다.
- **기하 보존과 사람의 텍스트 식별 가능성을 구별했다.** 공란·중복의 엄격 성공(48+44)은 기하적 보존일 뿐이다. 원본에 목표 표제가 없거나 같은 표제가 둘이라 글자만으로 필드를 식별할 수 없다(`textIdentifiable: false`). 읽기 사건 집계에 합치지 않았다.
- **OCR 단위 오독:** p031(`culture-c3` R-blank-below)에서 질문 레코드 `r2`("시민 합창단 정기 공연")의 경쟁 값 `r2-cval` "176쪽"이 "176%"로 읽혔다.
  - 대조: 설계 항목·잉크 [374, 347, 432, 368]과 OCR 줄 6 단어 4의 상자를 맞춰 봤다. 질문 필드 값 `r2-tval`은 아래 줄의 "106쪽"이다.
  - 그래서 W3 후보가 0이 됐고, W3가 기존 W1 창을 유지해 성공했다(L2 68 대 L3 67의 차이).
- **사례 서술:** `RESULTS.md` 9절의 사례 C1–C6은 `khc:cases` 블록 60항목으로 동결 OCR 단어·예측·채점·설계와 대조했다(검산 검사 7 통과).

## 문서 정정 (2026-11-25, PM 요청)

추가 실험이나 공개 숫자 변경 없이 문서 표현만 바로잡았다. 실제 score·predictions·등록 3.4절과 대조했다.

- 분모를 144 = 적용 22 + 판정 단계 보류 114 + 미적용 8로 명시했다. W4 = 기존 W1 창은 122다.
- "이상적 경로와 일치"를 W2 `cut` 136쪽으로 한정했다. `sports-c0` 8쪽은 등록 가정 미충족으로 표시했다.
- 머리글 3그룹 인식을 정상·중복 전체로 일반화한 문장을 고쳤다.
- "W1 전체"를 "기존 W1 창"으로 바꿨다.
- p031 "176쪽"이 질문 레코드의 경쟁 값임을 설계·잉크·OCR 상자로 대조했다.
- `sports-c0`의 원인을 관찰 기록(단어 분절, K1 점수 동점, 신뢰도 동점 처리)과 검증하지 않은 반사실로 구분했다.
- 사례 블록에 12항목을 추가했다(48 → 60). 검산·표 대조·변조를 다시 실행했다.

## 문서 정정 2 (2026-11-25, 독립 Opus minor·PM 확인)

서술만 고쳤다. 집계·예측·원자료·기계 표·사례 블록·구현은 그대로다.

- "한쪽 순서에서만 나타난 동작 없음"을 W4 사유·W4 엄격·J4·귀속의 72쌍으로 한정했다.
- W3가 좌우로 갈린 1쌍(p127 L "176"+"쪽" → `applied` → 실패, p031 R "176%" → `no_candidate` → 성공)을 예측·채점·OCR 원자료로 확인해 적었다.
- J3 = 0의 이유를 실제 분해로 정정했다: W3 적용 67쪽은 모두 엄격 실패, W3 성공 69쪽은 모두 기존 W1 창 유지(`multiple_candidates` 68 + `no_candidate` 1).

## 결과를 본 뒤 바꾼 것 (검산기·문서만, 규칙·판정·표 불변)

1. `recount.py`의 `groups.slot` 키를 정수에서 JSON 문자열로 바꿨다. 처음 검산에서 `4-summary-verdict`가 이 키 형식 하나로만 실패했다. 값 차이는 없었다.
2. 검산 검사 7(`7-described-cases`)과 19번째 변조(`caseTokenChanged`)를 추가했다.
   - 목적: 프로토콜 7절의 "결과 문서에 서술한 사례의 원시 토큰·좌표 대조"를 이행하는 것이다.
   - `RECOUNT_SPEC.md`에는 그 형식이 없었다. 등록 외 항목임을 결과 문서와 README에 적었다.
3. README의 Python 시험 명령을 `python -m unittest discover -s tools/ko-header-column -p test_recount.py`로 바꿨다. 새 클론 실행에서 경로 지정 방식(`unittest tools/.../test_recount.py`)이 `recount` 모듈을 찾지 못했다. 시험 내용은 같다.

- 이 밖에 판정 규칙, W4 상수, 시험 기대값, 자료는 바꾸지 않았다.
- 구현 시점(동결 전)에 W3·W4를 JS와 Python에 무작위 합성 입력 7,000건으로 함께 돌렸다. 출력은 모두 일치했다. 이 대조는 등록 시험이 아니고 결과 파일도 남기지 않았다.

## 시각 (커밋 시각 = 커밋 객체, push = 원격 추적 ref reflog, 채점 = `score-meta.json`)

| 단계 | 커밋 | KST | UTC | push (KST) |
|---|---|---|---|---|
| 사전등록 | `18500af` | 2026-11-25 09:16:29 | 00:16:29 | 09:16:32. Draft PR #153 생성 00:16:41Z |
| RED 기록 | `cb1b82a` | 09:17:03 | 00:17:03 | 09:17:05 |
| 구현(GREEN) | `9a223f6` | 09:32:12 | 00:32:12 | 09:32:15 |
| 자료 동결 | `cbb71f2` | 09:33:28 | 00:33:28 | 09:33:31 |
| 자료 핀 | `f75d739` | 09:33:38 | 00:33:38 | 09:33:40 |
| OCR 실행 | — | 09:33:53–09:35:45 | 00:33:53–00:35:45 | — |
| OCR·K1 동결 | `2f633cb` | 09:36:01 | 00:36:01 | 09:36:03 |
| 예측 144행 동결 | `6da4285` | 09:36:20 | 00:36:20 | 09:36:22 |
| **첫 채점(A) 시작** | HEAD `6da4285` | 09:36:26.291 | 00:36:26.291 | `predictionsCommittedAtHead: true` |
| 채점 B 시작 | HEAD `6da4285` | 09:36:38.452 | 00:36:38.452 | `replay-b` 미커밋이라 `false` |
| 결과·검산·문서 | `b47efed` | 09:43:19 | 00:43:19 | push 직후 새 클론 재현에 사용 |

- 예측 동결 push(09:36:22) 뒤에 첫 채점(09:36:26)이 시작됐다.
- OCR과 예측 프로세스는 gold를 읽지 않는다.
  - OCR은 허용 목록(`selector/questions.json`, `selector/images/p###.png`)만 읽는다.
  - 재생은 같은 허용 목록과 동결 OCR만 읽는다(`replay-a/inputs.json`, 검산 2b).

## 고정 입력 확인

- 엔진: tesseract.js 5.1.1, core 5.1.1, `eng+kor`(이 순서), OEM 1, 작업자 1개
- 오프라인 가드 켬, 차단 0
- 언어 파일 SHA-256:
  - eng `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`
  - kor `ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992`
- 글꼴 SHA-256: `018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0`(2.04)
- 고정 blob:
  - #147 lib `d882b664`
  - #150 W1 `6c23fc16`
  - #151 W2 `c2b0ad87`
  - #152 W3 `fcf06458a360c8977c596cff465a7ad1b7b1867c`(SHA-256 `a3fb4b70…`, 실제 #152 blob). W4는 이 W3의 `scan.units`를 쓰고, W2를 고르지 않으면 W1을 쓴다.
- 자료: `DATA_COMMIT` `cbb71f2`, `MANIFEST_SHA256` `f227f18b…0962`

## 검증

| 항목 | 명령 | 결과 |
|---|---|---|
| 시험(JS) | `node --test test/ko-header-column.test.mjs` | 14/14 |
| 시험(Python) | `python -m unittest discover -s tools/ko-header-column -p test_recount.py` | 8 OK |
| 연구 회귀 | `node --test test/*.test.mjs`(research) | 147/147 |
| 재생 A/B | `ab-compare.json` | reproduced: true(바이트 동일) |
| 검산 A·B | `recount.py ... --out recount-{a,b}.json` | ok, 검사 1–4·6·7 통과(사례 60) |
| 변조 | `recount.py ... --mutate mutation.json` | 19/19 거부(등록 18 + 사례 1), notApplicable 0 |
| 공개 표 | `ko-header-column-report.mjs` | 9개 표, 불일치 0 |
| 제품 7단계 | `npm ci --ignore-scripts` → build → test → typecheck → smoke:mcp → validate:plugin → benchmark | 모두 종료 0. 테스트 파일 60개, 테스트 4639 통과·5 건너뜀. `mcp smoke ok`, `plugin manifest ok`, benchmark `passed: true` |

- 빌드 전 상태: README 수정 1개만 있었다.
- 빌드 뒤 `bin/token-context-optimizer.mjs`가 줄 끝 문자만 바뀌었다(내용 diff 0). 이 파일만 `git restore`로 되돌렸다.

### 새 클론 README 재현 (2026-11-25, 커밋 `b47efed`)

README의 sh 블록 7개를 그대로 이어 실행했다. 외부 작업 폴더만 scratchpad로 바꿨다.

- 블록 1(준비): 공개 원격에서 clone, PR ref 8개 fetch, 고정 객체 9개 모두 `commit`, `npm ci`, 5.1.1 5.1.1 확인
- 블록 2(공식 A/B): 새 replay·score A/B 10개 파일과 `ab-compare.json`이 게시본과 모두 `same`
- 블록 3(표): `RESULTS.md` 사본 재생성이 `same`, 불일치 0
- 블록 4(검산·변조):
  - `recount-a.json`, `recount-b.json`, `mutation.json`이 게시본과 `same`이다.
  - Python 시험 명령은 이때 경로 지정 방식이라 import 오류가 났다. `discover -s` 형식으로 같은 클론에서 8 OK를 확인했고 README를 고쳤다(위 3).
- 블록 5(선택: 자료 재생성): 글꼴 해시 OK, venv에 pillow 12.3.0·fonttools 4.63.0 설치, 생성 `problems []`, 등록 설계 동일, 렌더 실패 0, `check` ok, manifest `f227f18b…0962`, 151개 파일 `data identical`
- 블록 6(선택: 새 CPU OCR):
  - npm 공개 패키지 `@tesseract.js-data/{eng,kor}@1.0.0`의 shasum과 언어 파일 SHA-256이 핀과 일치했다.
  - 가드를 켜고 실행해 144행, 차단 0이었다.
  - **`ocr.jsonl`·`k1.jsonl` 모두 게시본과 `same`**(같은 기계·플랫폼)이었다.
- 블록 7(시험): JS 14/14, 연구 전체 147/147
- 클론 작업 트리는 `git status --porcelain` 빈 출력이었다.

## 변경 범위

- `origin/main...HEAD`는 새 파일만 추가했다(수정·삭제·이름 바꿈 0).
  - `research/plans/2026-11-25-ko-header-column-protocol.md`
  - `research/src/ko-header-column-*.mjs`
  - `research/test/ko-header-column.test.mjs`
  - `research/tools/ko-header-column/`
  - `research/results/ko-header-column/`
  - 이 인계서
- 중앙 checkout, WBS, 원고, 제품 코드, 전역 설정은 바꾸지 않았다.
- 새 패키지, 유료 모델, GPU, 비공개 자료 전송은 쓰지 않았다.
- 로컬 상태:
  - `research/node_modules`(lockfile `npm ci`)
  - `research/.cache/ko-header-column/fixed/`
  - `research/.cache/ko-ocr-factorial/`: 언어 파일을 `ko-ocr-holdout` worktree 캐시에서 복사했고 해시를 확인했다.
  - 모두 Git이 무시한다.

## 외부 교차 확인

Argon 미실행. 과제가 사설 자료의 외부 전송을 금지한다(요청서). 독립 검토는 PM이 배정한 Opus가 맡는다.

## 남은 일 (PM·사용자)

- Astra 최종 판정과 배정 Opus의 원자료 재계산
- 권고 보류 판정에 따른 후속 여부는 사용자가 결정한다. 예를 들어 W2 대신 머리글 줄을 포함하는 창을 검토할 수 있다. 이 실험은 그 창을 재지 않았다.
- WBS는 과제 지시대로 갱신하지 않았다.
