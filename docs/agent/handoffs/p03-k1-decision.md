# P03: N34 K1 처리 경로 결정 자료 (Task handoff)

- 요청: PM 요청서 `codex_review/review_2026-11-16_p03-decision-request.md`, PM 핸드오프 `HANDOFF_2026-11-16_p03-decision.md`(메인 checkout, git 비추적)
- 승인: P02 최종 보고 뒤 사용자 '승인' = **P03 착수 승인**. 그 뒤 사용자가 P03에서 **A**를 선택했다(아래 "P03 마감"). P10 실행, 새 측정, Ready, merge 승인은 포함하지 않는다
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
- 보완 `9108451`(`fix(review)`), scoped Argon APPROVE, WBS 정합화, 보고 `codex_paste_2026-11-16_p03-decision-fix.md`
- primary 재검토(`review_2026-11-16_p03-r2-primary.md`): 자료 판정 PASS WITH NOTES @`9108451`, R1–R3 해소. 문구 주석 N1·N2

## P03 마감: 사용자 A 선택
- 선택 원문: **A — K1 유지, 공식 검증·F1 위험 판정 계획 준비 (권장)**
- 승인 범위: 경로 확정과 후속 계획(P10) 준비까지. 계획 준비는 이미 승인됐다
- 미승인: 구체적 계획 내용의 채택, 새 측정, 구현, Ready, merge, 새 프로토콜 실행, F1 임계 변경, 미확인 위험 수용
- 결정 문서 §0.1·§2.4·§7·§8에 기록했다
- N1: §5 "B와 같다"는 위험 수용이 필요한 구조가 같다는 뜻으로 한정했다(위험의 크기·불확실성이 같다는 뜻이 아님)
- N2: §4 C2의 catch 설명을 실제 코드에 맞췄다. 특정 message의 RangeError만 `classification_resource_limit`이고 나머지 예외는 다시 던져진다
- WBS P10 `계획`·`Task 승인 필요`는 구체적 실행 계획의 채택·실행 범위를 뜻한다. 이 작업자는 P10 요청서·branch·구현·측정을 만들지 않았다(업무 분리, primary가 계획 준비 진행)

## 검증 범위
- RED/GREEN·npm 7 gate: N/A(문서만). 검증용 코드나 벤치마크를 새로 만들지 않는다
- 인용 수치는 기존 raw의 저장 필드나 검토된 문서 값만 쓴다. 새 통계, 다른 run 간 비율 곱, 선택 표본 합산은 하지 않는다
- 이 worker의 자기 검토는 독립 검토가 아니다. primary 최종 검토와 구분한다

## 승인 경계
- 이번 Task로 하지 않는 것: P10 계획 작성·요청서·branch(업무 분리. 계획 준비 자체는 사용자 A 선택으로 승인됨), 새 성능 run·프로토콜 변경, source 변경, 기존 PR branch·본문 수정, Ready, merge
- 공유 `HANDOFF.md`, `docs/agent/HANDOFF.md`, PM 소유 `codex_review/` 파일(요청서·PM 핸드오프·primary 검토)은 수정하지 않는다

## 현재 상태
- 결정 자료와 선택 기록: [2026-11-16-n34-k1-decision.md](../../plans/2026-11-16-n34-k1-decision.md), Draft PR #122
- **P03 결과: 사용자 A 선택**(K1 유지, 공식 검증·F1 위험 판정 계획 준비). primary 자료 판정 PASS WITH NOTES @`9108451`
- 이 선택 기록·N1/N2 정리판의 primary 최종 검토는 대기다
- 핵심 지적은 유지한다
  - K1 증분 gate와 run3 PASS를 합쳐도 K1 대 main 판정이 아니다
  - 공식 PASS만으로 F1 same-input 위험 해소를 표시하지 않는다
- K1 timing INVALID·memory NOT RUN·F1 위험 미해결
- P10 계획 준비는 승인됐다. 구체적 계획의 채택과 실행은 별도 승인이다
