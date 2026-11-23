# Q00 핸드오프 — 품질 완성 계획 검토와 WBS 재설정

- Task: Q00(Orca task_6c2f46b50723 → 수정 task_baeef30738ce → 마감 task_3f24067ee1aa). 작업자 Claude Code, 실제 모델 `claude-opus-5-5`(세션 기록 assistant 응답 모델 값 전부)
- 브랜치: `claude/quality-completion-plan`, base origin/main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`
- Tier D(계획 Markdown). 제품 source·테스트·research 원자료·논문 본문 변경 0
- 역할: Codex primary가 PM 계획과 최종 판정을 맡는다. Claude는 계획 비판 검토, 추적 계획 문서, WBS 단일 writer를 맡는다
- 상태: **완료, primary 판정 PASS WITH NOTES**. 1차 ed58aab CHANGES REQUIRED(Major 1·Minor 4·Note 1) → 2차 8c15131 내용 검토에서 R1–R5·C1 해소(`codex_review/review_2026-11-16_quality-plan-r2-primary.md`) → 마감 정합화. 완료는 계획·WBS 정비만 뜻하며 프로젝트 진행률·다음 Task·Ready·merge 승인이 아니다

## 사용자 목표와 확정 사항

- 기간보다 완성도를 우선한다. 논문은 **기존 8쪽 투고 형식 + 상세 검증·재현 패키지 강화**로 확정됐다(DQ3 결정됨)
- 지원 런타임은 기존 README·package 계약을 보존한다(runtime `engines.node >=22.0.0`, dev 도구 요건 별도, DQ2 결정됨)
- 이번 Task는 계획 검토·정정, 핸드오프, WBS 재설정, Draft PR까지다. 제품 구현·새 실험·성능 측정은 하지 않는다

## 입력 자료(메인 checkout `codex_review/`, 비추적)

- `HANDOFF_2026-11-16_quality-completion.md`, `review_2026-11-16_quality-completion-plan.md`: PM 소유, 수정 안 함
- `review_2026-11-16_quality-plan-primary.md`, `review_2026-11-16_quality-plan-fix-request.md`: 1차 주 검토와 수정 요청
- `review_2026-11-16_project-progress-analysis.md`: 전체 분석, WBS 107행·Findings 93행 재집계

## 기준 상태(2026-11-16 확인)

- #112–#120 모두 OPEN·Draft·미병합. #119 최신 `15ff343`은 D1 preflight 수정 제출, 주 재검토 전, K1 timing INVALID·memory NOT RUN·본 D1 NOT RUN
- 실제 통합 검증(#116+#118 결합 audit, S10+#120 T36-4)은 NOT RUN

## 계획 검토와 1차 정정

- 비판 검토 `codex_review/review_2026-11-16_quality-plan-claude-review.md`: Blocker 0, Major 4, Minor 9, Note 7
- M1 P03 결정/실행 분리(새 P10), M2 `비선택` 단계, M3 Draft PR 처분 배정, M4 감사·피드백 범위 고정
- 27개 말단 작업(초안 26 ID + P10), 필수 24·조건부 3

## 2차 정정(primary R1–R5·C1)

- R1(Major): 계획 §2.1 후속 요구 변경 관리. 피드백·감사 발견은 수용·기각·보류로 처분, 수용된 필수 후속은 새 ID와 O01 선행·관련 gate·집계 범위·검증을 함께 갱신, 영향 산출물 재검증. 사용자 명시적 유예·범위 변경만 예외(조건부·비선택으로 이동). P06·P07·D04·O01·G-F 기준 반영
- R2: 비판 검토 n5의 근사식을 graded.jsonl 합계·분모로 정정(GPT-4o 91,438/144=634.99, 호출 155회당 589.92; Haiku 110,139/144=764.85, 160회당 688.37). 결론·수치·README 불변, WBS N-39 비고에 append-only 정정
- R3: DQ2·DQ3 결정됨, DQ5 결정 불필요(응답 전 대기, 시간 경과로 완료 처리 안 함). 남은 사용자 결정은 DQ1·DQ4
- R3 D1: 2026-11-16 사용자 1회 조건부 승인은 유지한다. Q00에는 실행권이 없고 P01 통과 뒤 PM이 실행권을 전달한다
- R4: R03 기준에 정보 가림·판정자별 최초 판정·불일치 조정·제공자/모델·한계. 모델 계열만으로 독립성 주장 안 함
- R5: `완성도현황` 머리글을 "미완료 조건부(완료·비선택 제외)"로. 계산식 유지
- C1: 계획 §5.1 merge 전 결합 검증 후보(고정 head, Orca CLI로 관리하는 격리 작업공간의 후보, 후보 SHA 검증, 반영 뒤 tree 비교). 지금 통합·merge 안 함

## 마감 정합화(primary 2차 재검토 PASS WITH NOTES)

- `완성도현황` 안내 2–6행을 A:H 안에서 줄바꿈(값 불변). 4행의 D1 승인 경계가 화면 안에 보인다
- `집계 범위 밖 작업 행`은 `A65:A1000`만 검사하고 1000행 아래는 보지 않는다고 B셀·`실행계획` 3행·계획 §2.1·§8에 적었다. 수식 범위는 그대로
- WBS 상태: Q00만 `완료`·`PASS WITH NOTES(primary 2차 재검토)`, head 열은 "문서 검토 head 8c15131"(제품 코드 없음, 마감 관리 commit과 구분). N-40 `해결`(관리 문서 상단 안내·PM 핸드오프 #119 현재 상태 직접 대조, 비고 append). N-39 `미해결`·R02, 다른 Task 단계·승인 불변
- 결과: 필수 완료 1/24, 구현제출 1(P01), 계획 22, 조건대기 3. Findings 해결 86·리뷰중 6·미해결 2·해당 없음 1. Q00 완료로 P04·P05·P07·R01의 선행이 충족돼 `선행 충족, 미완료`가 2 → 5

## WBS(메인 checkout, 비추적·커밋 안 함)

- sha256: 원본 `ffaeaae3…def0a6` → 1차 `d4e75768…6e85` → 2차 `23175756…a3e7` → 마감 `a24fcf380e7de3d03d05775b68319ed24683da6456bf853aa24924dc55917916`(매번 적용 직전 재확인)
- 최초 원장의 107행·기존 93 Findings 상태와 381수식은 보존했다. 마감본의 1차 적용본 대비 원장 차이는 신규 Findings F95(N-39 비고), C96·F96(N-40 상태·비고)이며 2차 대비는 C96·F96뿐이다
- `실행계획` 32–64행 예약(집계 범위 안), 선행 10·조건부 6·gate 관련 12개까지 셈. `완성도현황`에 `O01 완료 모순`, `집계 범위 밖 작업 행` 검사 추가
- 증거: `codex_review/quality-plan-2026-11-16/`의 `round1/`(1차), `r2/`(엔진 불일치 중간 후보), `r2final/`(2차), `close/`(병합 안내가 렌더에서 사라진 중간 후보), `close_final/`(마감). 삭제한 증거 없음

## 승인 경계

- 이번 승인: 계획·핸드오프·WBS 정비, 커밋·push·같은 Draft PR
- Q00에 없는 실행권: N34 D1 실행(기존 1회 조건부 승인은 유지), 추가 64 KiB, 공식 성능 run, 유료 모델 호출
- 별도 승인: Ready·merge, 설치·외부 공개·송부. 조건부 실험은 사전등록·총비용·중단 규칙·실행 승인 뒤

## 검증

- npm gate: NOT RUN(문서·WBS Task, 제품 source 변경 0). 문서는 `git diff --check`와 직접 읽기
- WBS 2차: 검사 50개 PASS(후보와 적용본), formulas 수식 1,681개 오류 0, 원장 보존(원본·1차 대비), 셀 밖 XML 동일
- 시나리오 10개: 기존 5개 + R5 진행 중 조건부 유지, R1 연결된 후속이 O01 차단, 미연결 후속의 O01 완료 모순 1, 사용자 유예 시 0, 범위 밖 행 표시
- 마감 검사 54개 PASS(후보와 적용본): 2차 적용본 대비 원장 차이는 N-40 상태·비고(C96·F96)뿐, Q00 외 단계·승인 불변, 상태 집계·대시보드 리뷰중 7→6. Q00 `구현제출` 고정 기대는 primary 완료 기록 권한에 따라 `완료`로 바꿨다
- 두 엔진: Artifact Tool과 formulas 255셀 일치(기본·후속 시나리오 2개, 2차와 마감 각각), 오류 0, 렌더 7개씩 확인
- 중간 결함: 예약 빈 행에서 `선행 충족, 미완료`가 엔진마다 달랐다(빈 문자열과 0, `"<>"` 조건 처리 차이). 구분 정확 일치 조건으로 고쳐 두 엔진 일치
- native Excel NOT RUN. Argon: 1차 1회 APPROVE(Nit 1 반영). 2차·마감에서는 지시대로 추가 호출 안 함

## 다음 작업자

1. primary가 최종 파일·WBS hash·PR head를 확인하고 사용자에게 최종 보고한다. 다음 Task 착수는 사용자 승인 뒤다
2. 다음 실행 후보는 P01(#119 `15ff343` 주 재검토)이다. P02 D1은 P01 통과와 PM 실행권 전달 뒤에만 한다
3. DQ1·DQ4는 해당 Task 착수 전 사용자 결정으로 닫는다
