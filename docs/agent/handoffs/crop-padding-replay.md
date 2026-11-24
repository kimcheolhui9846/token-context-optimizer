# 고정 자르기 여백에 따른 근거 포함과 면적 비교

- Tier E. 제품 기준 `origin/main` `0fb3053`(#143 병합, 번들 blob `85b8049`). 2026-11-24 #141 개선 후보 2
- Orca Task `task_f7f071dfd4fd`. 연구 담당 Claude Code(Opus 5.5), PM Codex(Astra)
- 범위: 검토용 Draft PR까지. 실험 API 비용 0원. 기존 공개 합성 24쌍·48장 재사용, 로컬 측정
  - 범위 밖: 외부 데이터 전송, 신규 실험 API, 의존성 추가, 제품 변경, 제품 기본 여백 결정, Ready, merge
  - D04는 사용자 직접 송부 보류, O01·O02는 선행 대기
- 프로토콜: [research/plans/2026-11-24-crop-padding-replay-protocol.md](../../../research/plans/2026-11-24-crop-padding-replay-protocol.md)

## 계획

1. 프로토콜·핸드오프 커밋, Draft PR(실측 전)
2. 테스트 RED(손계산 사례) → 실행·동결·채점 코드 GREEN
3. 실행 A·B(오프라인 가드), 동결, 채점, Python 독립 검산, #141 p0 재생 대조
4. 결과표·재현 안내, 전체 게이트 7종
5. 독립 Opus 마일스톤 검토, Argon 대조, `fix(review)` 반영
6. 주 세션에 최신 SHA·근거 보고

## 역할과 소유 경로

| 역할 | 주체 | 파일 |
|---|---|---|
| 연구 작성·실행·채점 | Claude Code 메인(Opus 5.5) | `research/plans/*crop-padding-replay*`, `research/src/crop-padding-replay-*`, `research/test/crop-padding-replay*`, `research/results/crop-padding-replay/**`, 이 파일 |
| 독립 검산기 작성 | 별도 하위 에이전트(채점기 코드 비공개, 명세만 받음) | `research/tools/crop-padding-replay-recount.py` |
| 계획 검토 | Claude Code `harness-opus-review`(`claude-opus-5-5`) | PM 요청서 단계에서 완료 |
| 마일스톤 검토 | 독립 Opus 5.5 | 기록만 |
| 최종 판정 | PM Astra | |

다음은 읽기만 한다: 제품, #141 연구 파일, R09 자료, 원고, WBS.

## 검토 구분

| 검토 | 주체 | 상태 |
|---|---|---|
| 계획 검토 | Claude Opus 5.5(`harness-opus-review`) | 1차 CHANGES REQUIRED(Major 3, Minor 2), 재심 PASS WITH NOTES. 참고 의견 2건은 프로토콜 §12에 반영 |
| 마일스톤 검토 | Claude Opus 5.5, 독립 | PASS WITH NOTES(Minor 2 문서 반영, Nit 1·Note 3 기록) |
| 프로젝트 교차 확인 | Argon(gemini-4-argon) | APPROVE, 결함 0 |
| 최종 판정 | PM Astra | 대기 |

## 진행

- [x] 프로토콜·핸드오프 커밋 `c636f69`, 실측 전. Draft PR [#144](https://github.com/kimcheolhui9846/token-context-optimizer/pull/144)
- [x] 테스트 RED `6414031`(`ERR_MODULE_NOT_FOUND`: 하네스 모듈 부재) → 하네스 GREEN 28/28 `613e20c`(실측 전 커밋). 프로토콜 §15에 측정 전 보완 3건
- [x] 입력: #141 준비기로 새로 만든 입력이 로컬 #141 입력 폴더와 원본 48장·SHA 표·배정·질문 모두 바이트 동일, `prepare-report.json`도 #141과 동일
- [x] 실행 A·B(코드 `613e20c`, 깨끗한 트리), 동결, 채점. 결정적 출력·채점 출력 A·B 바이트 동일. 가드 5/실행, 차단 0
- [x] #141 p0 재생 대조 48/48 통과
- [x] Python 독립 검산 불일치 0(192행, 검사 7,356건). run-b×score-a와 run-a×score-b 결과 바이트 동일. 점수 사본을 일부러 바꾸면 해당 행·집계·재생 판정을 잡고 종료 1
  - 작성: 하위 에이전트 `harness-sonnet-worker`, 실모델 `claude-sonnet-5-5`(자기 보고). 명세만 받고 채점기 코드는 열지 않았다
  - 메인 검수 수정 2건(더 엄격하게): gold SHA 비교를 `endswith`에서 동등 비교로, 평가 불가 행의 `missing`을 프로토콜대로 null로 대조
- [x] 게이트 7종(대상 작업 트리 `613e20c` + 미커밋 결과 파일, 제품 코드 무변경) 모두 종료 0. test 60파일, 4,639 통과, 5 건너뜀. 빌드가 줄바꿈만 바꾼 `bin/`(blob `85b8049` 동일)은 그 파일만 되돌렸다. 연구 테스트 전체 161/161. 로그 `codex_review/gates/2026-11-24_crop-padding-replay/`(비추적)
- [x] Argon APPROVE(결함 0, 발췌 밖 47개 ID 원시값은 확인 불가로 명시). `codex_review/argon/2026-11-24_crop-padding-replay-{bundle,argon}.md`
- [x] Opus 마일스톤 검토(`harness-opus-review`, `claude-opus-5-5`, 독립): **PASS WITH NOTES**, Blocker·Major 0
  - 검토자가 raw·gold에서 수치를 독립 재계산했고, README 재현 절차를 새 폴더에서 처음부터 돌려 준비 리포트·A·B 결정적 출력·채점·recount가 모두 커밋본과 바이트 동일, 가드 5/차단 0이었다. 테스트 28/28
  - Minor 1(검산기 독립성 서술 과장): RESULTS.md §5에 메인의 엄격화 수정 2건과 검산 범위를 적었다
  - Minor 2(§10.2 경계 맞닿음 필드 미구현): 근거 상자 96개 중 경계 맞닿음 0개를 직접 세어 프로토콜 §15에 사후 기록. 코드·score 바이트는 바꾸지 않았다
  - Nit 3(원본 참조 실패 시 `none`), Note 4–6: §15·RESULTS에 한계로 적거나 그대로 둔다(발생 0건, 판정 동일)
  - 문서만 바뀌어 측정값·비교 규칙 변경이 없으므로 재검토는 받지 않았다
- [x] PM 1차 판정 CHANGES REQUIRED(Orca Task `task_c7ae667a8f1e`, head `1dd0a2d`). 실측값·기하 결론은 PM 독립 재현 통과
  - Major 1: 실행기의 `runnerTreeClean`이 `cwd=research/src`에서 `status -- src`를 검사해 실제 코드 변경을 놓친다
  - Minor 1: RESULTS가 채점기가 `validationProfile`을 확인한다고 썼으나 어느 쪽도 판정 조건으로 쓰지 않았다
- [x] RED `d1a4cb8`: 실제 임시 Git 저장소에서 옛 검사가 추적 파일 변경을 놓침을 재현. 새 export 부재로 실패
- [x] 수정 `960b451`: 측정 전에 불러오는 모듈 5개의 HEAD·작업 blob·상태를 기록하고 다르면 측정 거부. 색인 프로필 검사. 테스트 36/36, 연구 전체 169/169. 수정 전 바뀐 작업 사본에서 실행기가 실제로 거부함을 확인
- [x] 수정 코드 재실행 A·B(`rerun-pmfix/`, `clean: true`): 준비 리포트·결정적 출력·증거·채점·검산 모두 원래와 바이트 동일, 가드 5/차단 0. 원래 기록·사전등록·실측 날짜는 보존. 원래 `runnerTreeClean`의 한계는 RESULTS §6·README·프로토콜 §15에 적었다
- [x] 게이트 7종(`4c9fcc2`, 빌드 전 `git status --short` 비어 있음) 모두 종료 0. test 60파일, 4,639 통과, 5 건너뜀. 빌드가 줄바꿈만 바꾼 `bin/`(blob `85b8049` 동일)은 그 파일만 되돌렸다. 로그 `codex_review/gates/2026-11-24_crop-padding-replay-pmfix/`(비추적)
- [x] Argon APPROVE. Minor 1(RESULTS 테스트 수 28 낡음) 반영. `codex_review/argon/2026-11-24_crop-padding-replay-pmfix-{bundle,argon}.md`
- [x] 독립 Opus 5.5 표적 재검토(`harness-opus-review`): **PASS WITH NOTES**, Blocker·Major 0. 검토자가 README 재현을 HEAD `4c9fcc2` 코드로 처음부터 돌려 모든 결정적·채점·증거·검산 파일이 원래와 바이트 동일, clean:true, 가드 5/차단 0. RED `d1a4cb8`가 export 부재로 실제 실패함과 미추적 실행 코드 복사본이 거부됨을 직접 재현
  - Minor 1(테스트 수·줄 위치): RESULTS §5로 옮기고 37개로 정정
  - Minor 2(모듈 목록 테스트가 리터럴 비교): 실행기 상대 import 그래프를 따라가 목록과 대조하고 동적 import·require 부재를 확인하는 테스트 추가. 37/37, 연구 전체 170/170
  - Nit 3(증거 바이트 동일 주장이 비교 파일에 없음): `rerun-pmfix/comparison.json`에 evidence 2개 추가(14개 모두 동일)
  - Note(줄바꿈만 다시 쓴 파일은 dirty로 거부, 가드·node_modules는 범위 밖, 불러온 직후 검사): RESULTS §6에 적었다
  - 테스트·문서·비교 기록만 바뀌어 실행 코드·측정값·규칙은 그대로다. 재검토는 다시 받지 않았다
- [ ] PM 재판정

## 결과 요약

[RESULTS.md](../../../research/results/crop-padding-replay/RESULTS.md)

- 192행 모두 유효 응답. 실패·한도 초과 0, 매치→전체 페이지 전환 0
- p0: complete 47/48(매치 35/36). 놓친 1건은 #141과 같은 `status-cards-code-s1-ko`의 값 상자 2px
- p4·p8·p16: 48/48(매치 36/36). 회복 1, 악화 0
- 매치 평균 면적비 0.2441 → 0.2526(+0.85pp) → 0.2612(+1.71pp) → 0.2784(+3.43pp). 매치 36개 중 35개가 왼쪽 경계에서 잘려 증가 폭이 작다
- 탐색적 재생이며 제품 기본 여백 결정 근거가 아니다
