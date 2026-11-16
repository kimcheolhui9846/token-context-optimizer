# P03: N34 K1 처리 경로 결정 자료 (Task handoff)

- 요청: PM 요청서 `codex_review/review_2026-11-16_p03-decision-request.md`, PM 핸드오프 `HANDOFF_2026-11-16_p03-decision.md`(메인 checkout, git 비추적)
- 승인: P02 최종 보고 뒤 사용자 '승인' = **P03 착수 승인**. K1 경로 A/B/C 선택, P10 실행, 새 측정, Ready, merge 승인은 포함하지 않는다
- 역할: Claude Code(`claude-opus-5-5`) 비판 검토·결정 문서·WBS 단일 writer. Codex primary PM이 최종 검토. 사용자가 경로를 선택한다
- Tier D: 추적 산출물은 Markdown 2개(이 파일, `docs/plans/2026-11-16-n34-k1-decision.md`). 제품 source·tests·연구 코드·raw·prereg·package·논문 변경 없음

## 격리와 기준
- worktree `p03-k1-decision`(Orca 독립 top-level), branch `claude/p03-k1-decision`, base `origin/main` `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`
  - Orca가 만든 branch `kimcheolhui9846/p03-k1-decision`(같은 커밋)은 건드리지 않고 그대로 둔다
- 읽기 전용 근거
  - PR #119 `claude/n34-cr-line-policy` head `fd93c543114fc80a111533cb64ef99e13a282932`(Draft OPEN, 원격 확인)
  - PR #121 `claude/quality-completion-plan` head `32e2ba6830ebf4cbb6800b22f52948171793349c`(Draft OPEN, P03/P10 정의)
  - PR #115 `claude/n34-cr-policy-plan` head `4a5b390d7b2df878e0d824b2012173ff82fc607b`(Draft OPEN, N34 계획)
- 이전 PR 내용을 이 branch로 cherry-pick·merge하지 않는다. 근거는 commit permalink로만 건다

## 계획
1. [x] 요청서·PM 핸드오프·P02 최종/주 검토·품질 계획·K1/D1/run3 근거·실제 source 읽기
2. [x] 이 Task handoff를 첫 추적 산출물로 commit → push → 별도 Draft PR(base `main`)
3. [x] 결정 문서: 관측 사실·추론·미확인·사용자 선택을 나눈 근거표, A/B/C 같은 축 비교, 추천 하나와 반대 근거, P10 진입·중단·승인 경계, 사용자 결정문
4. [x] 검증: `git diff --check`, 직접 읽기, 링크·commit·단위·출처·현재 상태 대조, 제어 문자 0
5. [x] Argon 1회(gemini-4-argon): APPROVE, 지적 0. 작성자 측 교차 확인이며 primary 독립 검토가 아니다
6. [x] WBS P03 행 `구현제출`, M8 `사용자 결정 필요` 유지(sha `16cc67a0…`, 수식 1,681, 계산 오류 0, PNG 3장)
7. [x] 1차 보고 `codex_paste_2026-11-16_p03-decision.md`, 근거 `remediation-impl-2026-11-13/p03-decision/`, Orca `worker_done` 접수

## primary 1차 검토 보완 (`codex_review/review_2026-11-16_p03-primary.md`, CHANGES REQUIRED)
- 검토 head `f4ab075`. 지적: R1 Major, R2 Minor, R3 Minor. 세 건 모두 수용했다
- R1: 공식 필수 G-C F1(CR 대 LF)과 same-input 정보용 F1을 구분했다
  - A를 조건부 검증 추천으로 낮췄다. main 대비 timing·memory·F1 크기는 미확인이다
  - P10 실행 전 F1 해석·종료/중단·위험 수용 절차 확정을 A·C 진입 조건으로, 그 처분 기록을 완료 조건으로 넣었다
  - 승인된 임계·정보용 지위는 바꾸지 않았다
- R2: 위 1차 제출 항목 5–7을 실제 완료 상태로 맞췄다. PR #122 본문과 WBS도 함께 맞춘다
- R3: C2 예외 사례를 확인된 반례가 아니라 조건부 증명 의무로 고쳤다
- 보완은 같은 branch의 `fix(review)` commit, scoped Argon 1회, WBS 정합화, 보고 `codex_paste_2026-11-16_p03-decision-fix.md`로 한다

## 검증 범위
- RED/GREEN·npm 7 gate: N/A(문서만). 검증용 코드나 벤치마크를 새로 만들지 않는다
- 인용 수치는 기존 raw의 저장 필드나 검토된 문서 값만 쓴다. 새 통계, 다른 run 간 비율 곱, 선택 표본 합산은 하지 않는다
- 이 worker의 자기 검토는 독립 검토가 아니다. primary 최종 검토와 구분한다

## 승인 경계
- 이번 Task로 하지 않는 것: 경로 선택 기록, P10 착수, 새 성능 run·프로토콜 변경, source 변경, 기존 PR branch·본문 수정, Ready, merge
- 공유 `HANDOFF.md`, `docs/agent/HANDOFF.md`, PM 소유 `codex_review/` 파일(요청서·PM 핸드오프·primary 검토)은 수정하지 않는다

## 현재 상태
- 결정 자료: [2026-11-16-n34-k1-decision.md](../../plans/2026-11-16-n34-k1-decision.md), Draft PR #122
- Claude 추천은 A, **조건부 검증 추천**이다
  - K1 유지 + K1 HEAD 대 main 직접 공식 gate 1회 상한 + 실행 전 F1 처분 절차
  - 실패하거나 F1이 처분되지 않으면 B를 기본으로 재결정한다
  - 반대 근거와 B 전환 조건은 결정 문서 §5
- 핵심 지적: K1 증분 gate와 run3 PASS를 합쳐도 K1 대 main 판정이 아니다(비율 곱 금지). 공식 PASS만으로 F1 same-input 위험 해소를 표시하지 않는다
- primary 1차 CHANGES REQUIRED 보완 제출, **primary 재검토 대기**
- 사용자 경로 선택 대기(**미결정**, P03 미완료, P10 미착수). WBS P03은 구현제출이며 완료가 아니다
