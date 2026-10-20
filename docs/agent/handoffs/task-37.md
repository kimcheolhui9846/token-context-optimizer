# Task 37 — 실험 3 프로토콜 부록

- 등급: D(문서). Claude 초안 검토 1회, 요청에 따라 Astra 검토 생략.
- 기준: main `ff199785dd175aebd6b98086febac1a2d834f882`.
- 브랜치: `codex/task-37-experiment3-protocol`.
- 범위: 신규 프로토콜 부록과 이 핸드오프만 작성. 원고·연구 코드·결과는 수정하지 않는다.
- 계획: 사전 등록/동결 설계/원고 VI장 대조 → 역사적 번들과 CLI 확인 → 초안 → Claude 검토 체크포인트 → 반영 후 Draft PR.
- 검증: 문장별 직접 대조, 명령 인자와 링크 확인, `git diff --check`. 문서 작업으로 RED/npm gate 해당 없음. 실험 호출 없음.
- 제약: 결과 수치·캐시 할인율 수치·이탈 상세 제외. Ready/merge/Task 38 진행하지 않는다.
- 현재 상태: Claude 검토 12개 반영 완료. 구현 커밋 `0a18fd6` push 및 [Draft PR #48](https://github.com/kimcheolhui9846/token-context-optimizer/pull/48)(base main) 생성 확인. Claude의 PR diff 반영 확인 대기.

## 근거 및 대조
- 번들 이력: `git log --oneline 2331e88..ff19978 -- bin/ src/`에서 `470b239`(crop), `68fe59d`(query 동점 다중 구간)만 확인했다.
- `470b239`의 artifacts.ts 변경은 없고 서버 변경은 crop 등록 추가다. 이 범위에서 Task 39 이외 query_artifact 동작 변경은 발견하지 않았다.
- `2331e88`, `7d2425e`, `7914a44`의 bin blob은 모두 `c4a290aec44cd484ef75e6f7107294303f6998d3`로 동일하다.
- 당시 query는 최고점 줄 하나 주변 한 구간이며 동점은 먼저 나온 줄을 선택한다. 현재 main 기본 다중 구간과 구별한다.
- CLI 확인: sessions의 `--split`, harness의 `--split`/`--run-id`/`--provider anthropic`, summarize/analyze의 `--run-id`가 구현되어 있다. 실제 실행은 하지 않았다.
- 원고 VI장 직접 모순은 발견하지 않았다. 제안: Task 38에서 부록 연결과 역사적 번들 버전, H1–H4 판정 기준, 세션 제외 금지의 명시를 보강한다. 원고는 수정하지 않았다.
- 분석 구현 참고: bootstrap은 기준 seed에서 H1/H2/H3에 각각 +0/+1/+2 스트림을 사용한다. CI는 양쪽 결과가 있는 짝만 사용하고, 결과 파일 없는 조합은 not_started로 별도 기록한다. 부록에 구현 설명과 미완료 실행을 완료 연구로 보고하지 않는 원칙을 함께 적는다.
- Task 38 원고 제안: 6.2에 영역 미발견 시 썸네일 없는 전체 arm 분기를 보충하고, 자동 원본 대상은 그 턴에 제시되었거나 마지막으로 조회한 이미지로 정정한다. 6.3은 “기준 seed 20261015”로 쓰고 가설별 스트림은 부록을 참조한다.

## 이전 교차 검토 재보고
- PR #42 `7fd4432`: Approve. 재검토 대상 네 항목 해소, 수치 대조 84개 불일치 없음. 파일 수정/커밋/댓글 없음.
- PR #46 `c401c82`: Approve. 구/신 번들 재현과 제출 결과 대조 통과, 세션 원본 유지 확인. 파일 수정/커밋/댓글 없음.

## 사전 등록 문장 대조
- §1 RQ3와 H1–H4 표: 문장과 “판정 기준(사전 고정)” 표 제목 유지. margin 및 판정 결과는 변경/추가하지 않는다.
- §2 데이터: 분할·seed·새 변형·질문/정답 규칙 유지·사전 모델 노출 금지·manifest hash·레이아웃별 보고를 보존한다. 미래형 구현/해시 기입 절차는 확정된 재현 정보로 정리한다.
- §3 설계: 동결 설계 표와 하네스에서 조건·출력 상한·도구 규칙을 풀어 쓴다. 초기 계획의 임계값 compact 문구 대신 확정된 턴 3·6 일정을 따른다.
- §4 공급자: 두 모델과 썸네일 차이를 보존한다. Haiku 공식 SDK 경로의 개발 점검 후 compact 일정·도구 왕복 상한 불변을 명시한다(M-6). 사전 등록의 썸네일 토큰 산술 예시는 부록 범위상 생략한다.
- §5 분석: 지표·짝 비교·bootstrap·탐색 표시·실패/미실행·캐시 비용 원칙을 보존한다. 공급자별 호출 상한과 누적 usage 설명은 구현 근거를 보충한다.
- §6 금지: 사후 설계/채점/margin 변경 금지·세션 제외 금지·제품 compact 성능 주장 금지 유지. Task 40 스킬과의 구별 및 대본 세션 한계 추가.
- §7 예산: 실행 승인 문서의 예산 추정은 이 프로토콜 부록에서 생략한다. 실행 승인이나 비용 지출을 요청하지 않는다.
- 재현 정보 추가: 요청에 따라 확정/하네스/분석 커밋, 역사적 번들 고정, 네 CLI와 연구 디렉터리 실행 위치를 보충한다. 실행 중 이탈은 결과 보고서에 기록한다는 원칙만 둔다.

## 검토 및 다음 단계
- 검증 결과: `git diff --cached --check`, `git diff --check`, PR 생성 후 `git diff ff19978..HEAD --check` PASS. GitHub PR 파일도 허용된 신규 두 개만 확인했다. npm gate/실험 호출은 문서 전용 범위로 미실행.
- Claude Code(사용자 제공 검토 파일, 정확한 모델 ID 미기재): 초안 검토 수행, Request changes, Blocker 0 / Major 7 / Nit 5 → 12개 반영 완료, PR diff 확인 대기. Astra: 요청에 따라 생략.
- 검토 근거: `codex_review/codex_review_feedback_2026-10-20_task37-protocol.md` 전체 및 후속 전달문. 별도 리뷰 호출은 하지 않는다.
- 반영 목록: M-1 사전 등록 커밋, M-2 실행 커밋, M-3 checkout/blob, M-4 이미지 분기, M-5 늦은 회상 턴, M-6 Haiku 동결, M-7 seed/짝/미실행; N-1 파일럿, N-2 manifest 기준 경로, N-3 출력 상한, N-4 원본 대상, N-5 표 제목.
- `Agent: codex` 커밋과 Draft PR 제출 완료. Claude의 PR diff 반영 확인을 기다리며 Ready/merge/Task 38은 진행하지 않는다.
