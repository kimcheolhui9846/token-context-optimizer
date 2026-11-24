# 인계: ko-row-gate-holdout (질문 유형과 OCR 같은 행 답 후보의 유일성으로 W2 적용 여부를 정하는 W3, 새 한국어 12원본 × 4배치)

- 날짜: 2026-11-24 · Task: Orca task_d30e1dc8fb85 · Tier E · #151 후속(사용자 승인)
- 작업자: Claude Code(Opus 5.5, 연구 작성자). 마일스톤·최종 판정: Codex Astra(PM, 최초 계획자), 독립 Opus 검토(PM 배정)
- 브랜치 `claude/ko-row-gate-holdout`, Draft PR #152. 기준 main은 `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`이다.
- #147 `c0c2f5dd…`, #148 `2ab9ed14…`, #149 `fd7ba06e…`, #150 `b108e2f0…`, #151 `d75f5455…`는 Git 객체로만 읽었다.
- 문서 위치:
  - 프로토콜: `research/plans/2026-11-24-ko-row-gate-protocol.md`
  - 결과: `research/results/ko-row-gate/RESULTS.md`
  - 재현: `research/results/ko-row-gate/README.md`
  - 검산 명세: `research/tools/ko-row-gate/RECOUNT_SPEC.md`

## 상태

측정·채점·검산·재현을 마쳤다. Draft 상태이며, Ready·merge·제품 적용은 하지 않았다. PM 최종 판정과 독립 Opus 검토를 기다린다.

## 시점 (커밋 시각, KST)

| 단계 | 커밋 |
|---|---|
| 사전등록 | `9c53218` 23:25:40 |
| RED | `d319d98` 23:26:09 |
| 구현 | `b061672` 23:40:13 |
| 자료 동결 | `3f27fb9` 23:41:18, 핀 `78f5943` |
| OCR | 23:42:07–23:42:59에 1회 실행, 동결 `64d786e` 23:43:10 |
| 예측 동결·push | `22af341` 23:43:20 |
| 채점 시작 | 23:43:27 |
| 검산기 수정 | `9760e26` |
| 결과 | `7fd2f93` |

채점 측(gold·design·render)은 예측을 push한 뒤에 처음 열었다. `score-meta.json`의 `predictionsCommittedAtHead`는 `true`다.

## 결과 (48쪽, `RESULTS.md`)

- 정상 48, 기술 오류 0, 미매치 0. 모두 한글 분기다.
- W1 `widened` 46·`not_wider` 2. W2 `cut` 46·`inherit` 2.
- W3 사유: `applied` 20, `no_candidate` 14, `multiple_candidates` 12, `not_applicable` 2.
- 엄격 성공: W1 48, W2 25, W3 38.
- 손실: L2 23/48, L3 10/48. 예방 13/23(`prevented_some`).
- 다른 값 제거: W2 사건 23, W3 사건 10(원본 10, `observed_repeated_sources`).
- 배치별 결과:
  - `same-same`: 후보가 2개라 12쪽 모두 보류했다. 손실은 0이지만 다른 값 제거도 0이다.
  - `same-other`: 10쪽에 적용했다. 유일 후보가 목표 값이었고, 답을 지키면서 다른 값을 가렸다.
  - `below-same`: 10쪽에 적용했다. 유일 후보가 의도된 방해 값이어서 답을 잃었다(등록된 설계상 반례 그대로). L3 10쪽이 모두 여기서 나왔다.
  - `below-other`: 후보가 0이라 보류했다. W2 손실 12쪽을 모두 막았다.
- 예외 원본 두 개:
  - `lecture-table-c0`: W1이 `not_wider`여서 W3는 해당 없음이다.
  - `meeting-table-c0`: OCR이 `22명`을 `22%`로 읽어 후보가 0이 됐다. 예방 1건은 OCR 오인식 덕분이다.
- 면적: 전체 평균 절감은 W2 27.56%p, W3 11.68%p다. W3 적용 쪽만 보면 평균 28.04%p다.

## 검증

- 재생·채점 A/B: 바이트가 같다(`ab-compare.json`, `reproduced: true`).
- Python 독립 검산 A·B: 통과했다. 공개 표 8개의 칸 불일치는 0이다.
- 변조 14종: 모두 거부됐다(해당 없음 0).
- JS 대 Python W3 차등 퍼징: 저장소 밖 무작위 2000건에서 10개 사유가 모두 나왔고, 결과가 다른 경우는 0건이었다.
- 시험: JS `node --test test/ko-row-gate.test.mjs` 19/19, Python `test_recount.py` 12/12, 연구 전체 152/152.
- 새 클론 재현: 공개 원격의 PR #152 ref(`7fd2f93`)에서 README 1–7절 명령 블록을 그대로 실행했다(`logs/readme-repro-fresh-clone.txt`).
  - 재생·채점·표·검산·변조 산출물이 게시본과 바이트가 같다.
  - 자료 재생성 55개 파일이 같다.
  - 선택 절의 새 OCR(언어 파일을 npm 패키지에서 받아 해시 확인)도 `ocr.jsonl`·`k1.jsonl` 바이트가 같다.
  - 절마다 `git status --porcelain`은 빈 출력이었다.
- 제품 검증 7단계(`logs/product-verify.txt`): `npm ci --ignore-scripts`, build, test(4639 통과·5 건너뜀), typecheck, smoke:mcp, validate:plugin, benchmark(`passed: true`) 모두 종료 0이었다.
  - 빌드 전 작업 트리는 깨끗했다.
  - 빌드가 `bin/token-context-optimizer.mjs`를 줄 끝 차이로만 바꿨다. 그 파일 하나만 되돌렸다.

## 해시 (원바이트 SHA-256)

| 대상 | 해시 |
|---|---|
| `data/manifest.json` | `53222cc618f3d8f6295da2414c129e85474505e4282b4f2930ceba4b10151e69` |
| `ocr/ocr.jsonl` | `d3f9735f7606c0137b9d563df910f71bdb27e2108d86c9ff62119d5b69b36b0e` |
| `ocr/k1.jsonl` | `205ed4ddb0f49c8abc11d3d7307b03712f8fa8a9074c83757826aa7e3013aa7f` |
| `replay-a/predictions.jsonl` | `319913c8ab4f5d49074e7928b2cfebae610d9a575de2a7f595f7cbc6c8df2ed0` |
| `score-a/score.jsonl` | `dc38cb796449d5928a17056ef920bf0b5499ff7d2618d03d3311db4820091a03` |
| `score-a/summary.json` | `a9b754fc94271d81f9d9a3f316280098b2bd2a4ed7bceebf955685f08b12a355` |

- 고정 blob은 사용자 핀과 같다: #147 lib `d882b664`, run `3ddf60ab`, 선택기 `b3b4965b`, #150 W1 `6c23fc16`, #151 W2 `c2b0ad87`, 렌더러 `b61cd9b3`.
- 글꼴은 `018174e8…`, 언어 파일은 eng `5dc5d8d6…`, kor `ec174937…`다.

## 변경 범위

`0fb3053..HEAD`: 신규 파일만 있고, 수정·삭제한 파일은 없다. 위치는 다음과 같다.
- `research/plans`
- `research/src/ko-row-gate-*.mjs` (8개)
- `research/test/ko-row-gate.test.mjs`
- `research/tools/ko-row-gate/`
- `research/results/ko-row-gate/`
- 이 인계서

WBS·제품·원고·전역 설정은 바꾸지 않았다. 연구 API 비용은 0원이다. GPU·유료 추론·외부 자료 전송은 없었다(Argon 교차 확인도 하지 않음).

## 남은 문제와 한계

- **검산 작성자 = 구현자.** 과제 조건상 하위 에이전트를 쓰지 않았다. 명세 오독이 양쪽에 같이 들어갈 위험이 남는다. 퍼징으로 일부만 완화했다.
- **측정 뒤 검산기 결함 1건을 수정했다(`9760e26`).** 검사 1c가 프로토콜 3.3절의 "지정 값·방해 값 6개"를 목표 방해 값만으로 좁혀 읽었다. 판정 규칙·자료·예측·채점은 바뀌지 않았다. `RECOUNT_SPEC.md` 2.7절에 날짜와 함께 적었다.
- **W3 손실이 0이 아니다.** 같은 행에 답 형태의 방해 값이 있으면(`below-same`) W3는 그 손실을 막지 못한다. 결과는 배치 비율에 크게 좌우되는 합성 자료 결과다.
- 질문 유형 단서는 부분 문자열이다(`몇시간`도 time). 이 자료에는 해당하는 질문이 없었다.
- `no_valid_hit_word`, `candidate_outside_w2`, `qtype_*`는 실제 자료에서 0건이고 손계산 예제로만 시험했다. `no_valid_hit_word`는 고정 W2가 0 크기 히트를 검증 실패로 처리하므로 실제 파이프라인에서 나올 수 없다.
- #151 자료에는 W3를 실행하지 않았다.
- 보존한 임시 폴더: 저장소 밖 작업 폴더 `%TEMP%/ko-row-gate-holdout-work/`. 생성 두 벌, OCR 로그, 가드 로그, 새 클론 재현 폴더 `krg-repro-20261124234740/`가 들어 있다. 아무것도 지우지 않았다.
