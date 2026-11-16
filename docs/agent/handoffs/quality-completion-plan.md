# Q00 핸드오프 — 품질 완성 계획 검토와 WBS 재설정

- Task: Q00(Orca task_6c2f46b50723). 작업자 Claude Code, 실제 모델 `claude-opus-5-5`(세션 기록의 assistant 응답 model 값으로 확인)
- 브랜치: `claude/quality-completion-plan`, base origin/main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`
- Tier D(계획 Markdown). 제품 source·테스트·research 원자료·논문 본문 변경 0
- 역할: Codex primary가 PM 계획과 최종 판정을 맡는다. Claude는 계획 비판 검토, 추적 계획 문서, WBS 단일 writer를 맡는다
- 상태: **구현제출(primary 주 검토 전)**. 이 문서로 Q00 완료를 주장하지 않는다

## 사용자 목표와 확정 사항

- 기간보다 완성도를 우선한다. 논문은 **기존 8쪽 투고 형식 + 검증·부록·재현 패키지 강화**로 확정됐다
- 이번 Task는 계획 검토·정정, 핸드오프, WBS 재설정, Draft PR까지다. 제품 구현·새 실험·성능 측정은 하지 않는다

## 입력 자료(메인 checkout `codex_review/`, 비추적)

- `HANDOFF_2026-11-16_quality-completion.md`: 현재 상태 기준(Codex 소유)
- `review_2026-11-16_quality-completion-plan.md`: Codex 초안, 26개 말단 작업(Codex 소유)
- `review_2026-11-16_project-progress-analysis.md`: 전체 분석, WBS 107행·Findings 93행 재집계
- `review_2026-11-16_quality-plan-wbs-request.md`: 이 Task 요청서

## 기준 상태(2026-11-16 확인)

- #112–#120 모두 OPEN·Draft·미병합(`gh pr view` 재확인). #115·#117은 계획 PR
- #119 최신 head `15ff343`은 D1 preflight 수정 제출이다. 주 재검토 미수행, K1 timing INVALID·memory NOT RUN, 본 D1 NOT RUN
- 개별 PR의 과거 gate 통과는 그 브랜치 기준이다. 실제 통합 검증(#116+#118 결합 audit, S10+#120 T36-4)은 NOT RUN
- WBS 입력 sha256 `ffaeaae3c9e5a1dcf64e58967fd255cbc688bce57dedba1ba9489c76c9def0a6`(기준값과 일치, 백업 완료)

## 계획 비판 검토 결과

- 상세: `codex_review/review_2026-11-16_quality-plan-claude-review.md`
- Blocker 0, Major 4, Minor 9, Note 7. 권장안 B(근거와 종료 조건 강화)는 유지한다
- M1 P03의 결정·구현·공식 gate 혼재 → P03(결정)과 새 P10(선택 경로 실행·N34 종료 gate)으로 분리
- M2 비선택 조건부 작업의 종착 상태 부재 → 새 시트 단계 `비선택` 추가(사용자 결정·주장 제한 기록 필수, 완료로 세지 않음)
- M3 Draft PR 9개 처분 미배정 → PR별 소유 Task와 merge/흡수/close 기록을 완료 기준에 포함
- M4 감사·피드백 Task의 무제한 완료 기준 → 감사 대상 고정, 발견은 Findings 등록, 큰 수정은 새 ID
- Minor 중 6건 정정(P01 단계, gate–Task 연결, D03←D01, O02←O01, R01 원고 고정, D05 설치 head), 3건은 결정 항목 DQ1–DQ3

## 추적 계획

- `docs/plans/2026-11-16-quality-completion.md`: 정정된 계획, 27개 말단 작업(초안 26 ID 유지 + P10), 기존 ID 매핑과 변경 이유
- 필수 24, 조건부 3(R05·R07·R09). 이중 집계 없음: P03의 실행 부분만 P10으로 옮겼다

## WBS 재설정(메인 checkout, 비추적·커밋 안 함)

- 적용 완료: sha256 `ffaeaae3…def0a6`(적용 직전 재확인) → `d4e75768d999a82dd899dfc769a4d23b006cfbab1dfb6e0504d5b59e394f6e85`
- 새 시트 `완성도현황`(첫 화면)·`실행계획`(27행)을 앞에 추가. 기존 4시트 이름·순서·107행·381수식·서식·검증·메모 보존
- 원장 변경은 두 가지뿐: 보류 5행(5.1, 5.3–5.6)과 6.4b 비고 끝에 날짜 비고 추가, Findings N-39(미해결)·N-40(리뷰중) 추가
- 대시보드 수식은 그대로다. Findings 두 행이 늘어 리뷰중 7·미해결 2·합계 94로 값이 바뀐다
- 선행 미충족·gate 미완료 수는 스칼라 COUNTIFS로 계산한다. 배열식은 Artifact Tool 엔진에서 0으로 계산돼 버렸다
- 증거(비추적): 메인 checkout `codex_review/quality-plan-2026-11-16/`의 backup, candidate, tools, verify, render

## 결정 항목(임의 확정하지 않음)

- DQ1 통합 방식(main 순차 merge 또는 통합 브랜치)
- DQ2 지원 Node 범위
- DQ3 추가 검증 결과 게재 위치(8쪽 본문·부록·재현 패키지)
- DQ4 R03 독립 판정자 구성
- DQ5 교수 피드백 대기 상한과 O01 관계

## 승인 경계

- 이번 승인: 계획·핸드오프·WBS 정비, 관리 문서 상단 현재 상태 정정, 커밋·push·Draft PR
- 승인 없음: Ready·merge, N34 D1 실행, 추가 64 KiB, 공식 성능 run, 유료 모델 호출, 설치·외부 공개·송부
- 조건부 실험은 사전등록·총비용·중단 규칙·실행 승인 뒤에만 한다. 계획 등록은 실행 승인이 아니다

## 검증

- npm gate: NOT RUN(문서·WBS Task, 제품 source 변경 0)
- 문서: `git diff --check`, 직접 읽기
- WBS 검사 41개 PASS(후보와 적용본 모두): formulas 재계산 수식 883개 오류 0, 독립 Python 집계 대조, 원장 셀·서식·검증·메모 보존, 선행 ID·순환·상태·승인 검사, 임시 복사본 시나리오 5개
- 시나리오: 선행 하나만 완료해도 gate 미완료 유지, 수동 충족 판정과 남은 Task의 불일치 표시, 조건부 `비선택` 처리, 목록 밖 단계 표시, ID 표기 오류 표시
- 두 엔진 대조: Artifact Tool 재계산값과 formulas 값 177셀 일치, 오류 검색 0. 렌더 9개 직접 확인
- 시트 XML(셀 밖): 기존 3시트 동일, Findings는 dimension만 A1:F96으로 변경
- native Excel: NOT RUN
- Argon 1회 교차 확인 예정

## 다음 작업자

1. primary가 이 PR, 비판 검토, WBS 증거를 직접 검토하고 Q00을 판정한다
2. 다음 실행 후보는 P01(#119 `15ff343` 주 재검토)이다. P02 D1은 P01 통과와 실행권 전달 뒤에만 한다
3. DQ1–DQ5는 해당 Task 착수 전 사용자 결정으로 닫는다
