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
5. [ ] Argon 마일스톤 1회(비민감 발췌 + 실제 문서). 실패하면 재시도 없이 사유 기록
6. [ ] WBS P03 행: 진행 → 구현제출(자료 제출, primary 검토 대기). **사용자 선택 전 완료 금지**
7. [ ] 완료 보고(`codex_review/remediation-impl-2026-11-13/p03-decision/`, `codex_paste_2026-11-16_p03-decision.md`) 후 Orca `worker_done`

## 검증 범위
- RED/GREEN·npm 7 gate: N/A(문서만). 검증용 코드나 벤치마크를 새로 만들지 않는다
- 인용 수치는 기존 raw의 저장 필드나 검토된 문서 값만 쓴다. 새 통계, 다른 run 간 비율 곱, 선택 표본 합산은 하지 않는다
- 이 worker의 자기 검토는 독립 검토가 아니다. primary 최종 검토와 구분한다

## 승인 경계
- 이번 Task로 하지 않는 것: 경로 선택 기록, P10 착수, 새 성능 run·프로토콜 변경, source 변경, 기존 PR branch·본문 수정, Ready, merge
- 공유 `HANDOFF.md`, `docs/agent/HANDOFF.md`, PM 소유 `codex_review/` 파일(요청서·PM 핸드오프·primary 검토)은 수정하지 않는다

## 현재 상태
- 결정 자료 제출: [2026-11-16-n34-k1-decision.md](../../plans/2026-11-16-n34-k1-decision.md), Draft PR #122
- Claude 추천은 A(K1 유지 + K1 HEAD 대 main 직접 공식 gate 1회 상한, 실패 시 B 기본 재결정). 반대 근거·B 전환 조건은 결정 문서 §5
- 핵심 지적: K1 증분 gate와 run3 PASS를 합쳐도 K1 대 main 판정이 아니다(비율 곱 금지). A·C는 그 코드 대 main 직접 run이 필요하다
- primary 최종 검토 대기, 사용자 경로 선택 대기(**미결정**). WBS P03은 구현제출이며 완료가 아니다
