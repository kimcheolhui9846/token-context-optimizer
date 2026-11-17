# P10 계획 단계 — K1 공식 검증·F1 위험 판정 계획 (2026-11-17)

- 상태: **계획 초안 작성 중.** P10 전체 완료가 아니다. 필수 완료 4/24는 그대로다
- 작업자: Claude Code(`claude-opus-5-5`), 기술 계획·Task handoff·WBS 단일 writer. 최종 판정은 Codex primary(PM)
- Tier D: 추적 산출물은 Markdown 2개다. 제품 source·tests·research 코드·raw·prereg·논문은 바꾸지 않는다
- 요청서: 메인 checkout `codex_review/review_2026-11-17_p10-plan-request.md`(PM 소유, git 비추적)

## 목적
- 사용자 A 선택(K1 유지, 2026-11-16)에 따라 K1 대 main 공식 검증과 F1 same-input 위험 처분 절차를 사용자가 채택할 수 있는 구체 계획으로 만든다
- 상세 제안: [docs/plans/2026-11-17-n34-k1-validation-plan.md](../../plans/2026-11-17-n34-k1-validation-plan.md)
  - 대안 P-1(run3 그대로)·P-2(K 하한 4 묶음 표본, 권장 초안)·P-3(child 단위 반복). P-2는 추정 대상 변경이라 별도 정책 승인 대상
  - S-2 권장: same-input F1 정보용 유지 + 실행 전 승인된 처분표. S-3 제안: 블록 상한 24 h·2 h·10 h

## 기준 (시작 시 직접 확인)
- remote main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`. 요청서의 PM 확인값과 같다
- worktree `p10-k1-validation-plan`, branch `claude/p10-k1-validation-plan`, base origin/main. 시작 시 CLEAN
- git 신원: kim cheol hui / noreply 주소. 요청서 지정값과 같다
- 근거 핀
  - PR #121 품질계획 `32e2ba6830ebf4cbb6800b22f52948171793349c`
  - PR #122 P03 결정 `cfd4e30971e5c784ccca22b77b7e09bee0dc75bc`
  - PR #119 증거 `fd93c543114fc80a111533cb64ef99e13a282932`
- 제품 코드 후보: K1 `4999c1f14b229d8c856200d49fdacd2d4611dc81`, pre-K1 `7e732e0e07a1977dbf0c754319fd3a726924621e`
  - `git diff 4999c1f fd93c54 -- src bin package.json package-lock.json`은 0줄이다(직접 확인). 그 사이 22개 commit은 문서·측정 도구·raw다
  - main 대비 K1 제품 차이: `src/core/policy.ts` +21/−3, `bin/token-context-optimizer.mjs` +17/−3(numstat)

## 계획 (이 Task의 범위)
1. 근거 읽기: P03 결정 문서, 품질계획 P10·§5.1·§7, run1–run3·K1 prereg, D1 결과, runner·worker·raw 요약
2. 이 handoff 작성 → commit/push → 별도 Draft PR(base main)
3. 상세 계획 문서: 대안 3개 비교, 권장 초안과 반대 근거, A/A·공식 성능·F1 처분의 분리, 결과표, 자원 상한, 후속 구현·통합 순서, 사용자 결정표
4. 직접 검증(`git diff --check`, 출처·링크·승인 범위) → Argon 1회 → 같은 PR에 commit/push
5. WBS P10 row9 계획 단계·P03 최종 판정·A4 안내 동기화, 보존·수식·PNG 검증
6. 근거 `codex_review/remediation-impl-2026-11-13/p10-plan/`, 보고 `codex_review/codex_paste_2026-11-17_p10-plan.md`

## 승인 경계
- 승인됨: 이 계획의 조사·작성·검증·commit/push/Draft PR(사용자 A + P10 요청서)
- 사용자 DQ1(2026-11-17): main 순차 통합. 결합 후보 검증과 PR별 merge 승인은 그대로다. merge 승인이 아니다
- 미승인: 프로토콜 채택, 구현·사전검증 실행, 새 측정·진단·파일럿·시뮬레이션, F1 지위·기준 변경, 위험 수용, Ready, merge
- D1의 1회 승인은 P02에서 소진됐다
- 다른 PR(#119·#121·#122 등) branch와 메인 checkout은 읽기 전용이다. cherry-pick·merge·정리를 하지 않는다

## 유지할 사실
- K1 공식 timing INVALID(O2/F3 CAND A/A 3회 무효), memory NOT RUN. pre-K1 run3 PASS를 K1에 승계하지 않는다
- run3 정보용 same-input F1 비 O1 1.642342 / O2 1.390836은 pre-K1 대 main의 기존 잔여 위험이다. K1 결과가 아니다
- D1은 1회 탐색 진단이다. 원인 확정·유의성·공식 PASS·memory 대체 근거가 아니다
- 다른 run 비율 곱, 선택 표본 합산, GC 시간 제외, 사후 기준 완화, 성공할 때까지 재실행은 하지 않는다

## 검증 (Tier D)
- RED/npm gate: N/A(문서 Task). 새 측정·테스트·도구 실행 없음
- `git diff --check origin/main...HEAD`, 직접 읽기로 출처·단위·링크·상태·승인 범위·PR 본문 일치 확인
- Argon 마일스톤 1회. 실패하면 재시도하지 않고 사유를 기록한다
- 작성자 자기 검증, Argon 교차 확인, primary 최종 검토는 서로 다른 검토다. 작성자는 최종 PASS를 주장하지 않는다

## 진행 상태
- [x] 시작 상태·신원·base 확인, branch 생성
- [x] 근거 읽기
- [x] handoff commit/push(`bbcc05a`), Draft PR [#123](https://github.com/kimcheolhui9846/token-context-optimizer/pull/123)
- [x] 상세 계획 문서(`b171246`)
- [x] 직접 검증: `git diff --check origin/main...HEAD` PASS, 링크 18개 실제 객체 확인, 제어 문자·백슬래시 0
- [x] Argon `gemini-4-argon` 1회: APPROVE, 지적 0. "발췌로 확인 불가" 항목(22 commit, D1 소수값, rows L11 등)은 작성자가 원자료로 직접 확인
- [x] WBS(비추적): 시작 `6a51d131…` → 최종 `fbf29a8d…`. 허용 15셀(실행계획 L8·T8·U8·K9·L9·N9·Q9·S9·T9·U9·V9, 완성도현황 A4·D35, WBS O104, Findings F90)과 행 9 높이 75→160만 변경
  - F9 계획·M9 Task 승인 필요·F8 완료·G104 진행중·C90 리뷰중 유지. 27 ID·필수 24·조건부 3·완료 4, 수식 1,681개 텍스트 동일
  - `formulas` 재계산 8,855값 오류 0, 계산 차이 17(편집 15 + 결정 대기 C15 2→1 + D35:D39 범위). PNG 4장 확인. native Excel 미실행
- [ ] 보고(codex_paste), worker_done. primary 최종 검토와 사용자 결정 U1–U4는 이후 단계
