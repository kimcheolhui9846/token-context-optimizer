# P10 계획 단계 — K1 공식 검증·F1 위험 판정 계획 (2026-11-17)

- 상태: **primary 1차 CHANGES REQUIRED(@`f0eed6d`) 지적을 반영한 보완본 제출, primary 재검토 대기.** P10 전체 완료가 아니다. 필수 완료 4/24는 그대로다
- 작업자: Claude Code(`claude-opus-5-5`), 기술 계획·Task handoff·WBS 단일 writer. 최종 판정은 Codex primary(PM)
- Tier D: 추적 산출물은 Markdown 2개다. 제품 source·tests·research 코드·raw·prereg·논문은 바꾸지 않는다
- PM 소유(git 비추적, 읽기 전용): 요청서 `codex_review/review_2026-11-17_p10-plan-request.md`, 1차 검토 `review_2026-11-17_p10-primary.md`

## 목적
- 사용자 A 선택(K1 유지, 2026-11-16)에 따라 K1 대 main 공식 검증과 F1 same-input 위험 처분 절차를 사용자가 채택할 수 있는 구체 계획으로 만든다
- 상세 제안: [docs/plans/2026-11-17-n34-k1-validation-plan.md](../../plans/2026-11-17-n34-k1-validation-plan.md)
  - 권장 초안 P-1: run3 측정 논리 그대로(BASE main, CAND K1) + 운영 보강(블록 시간 예산 집행, 정보용 원자료 완비, 블록 간 신원 대조, 잔류 프로세스 확인)
  - P-2 고정 묶음 표본은 질문을 바꾸는 별도 정책 선택지. P-3·K 하한 8·B 철회는 별도 설계·승인 경로
  - 판정 J1 A/A·J2 공식·J3 정보용 행과 블록·J4 F1 처분(D-0–D-4 우선순위)
  - S-2 권장: 정보용 유지 + 처분표. S-3 제안: P-1 블록 상한 10 h / 1 h / 4 h, 마무리 예비 10분

## 기준
- remote main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`(변경 없음). worktree `p10-k1-validation-plan`, branch `claude/p10-k1-validation-plan`
- git 신원: kim cheol hui / noreply 주소
- 근거 핀: PR #121 `32e2ba6`, PR #122 `cfd4e30`, PR #119 `fd93c54`
- 제품 코드 후보: K1 `4999c1f`, pre-K1 `7e732e0`
  - `git diff 4999c1f fd93c54 -- src bin package.json package-lock.json` 0줄. 그 사이 22 commit은 문서·측정 도구·raw다
  - main 대비 K1 제품 차이: `src/core/policy.ts` +21/−3, `bin/token-context-optimizer.mjs` +17/−3

## 1차 검토 지적과 처분
| 지적 | 처분 | 계획 문서 위치 |
|---|---|---|
| R1 F1 처분·중단 우선순위 | 수용. J2·정보용 행·정보용 블록·최종 처분을 따로 기록, C(digest 불일치)·무결성 실패 D-4 추가, 예산이 판정된 행을 덮지 않음 | §2, §5.4, §6.3, §7.2–§7.3 |
| R2 전체 시간 상한 집행 | 수용. D1 방식의 마감 시각, 모든 단계 timeout = min(상한, 남은 예산 − 예비), child 시작 조건, 소유 PID만 종료, 상한 포함·제외 구분 | §6.1–§6.2 |
| R3 정보용 원자료·블록 신원 | 수용. 전체 timing 행 형식, child 실패와 원자료 손실 구분, run·prereg·하네스·제품 tree·snapshot·입력·protocol·환경 대조, 결과 파일만 바뀐 commit 허용 | §6.4–§6.5 |
| M1 시각 개수·K | 수용. 시각 K+1개, 보정 K와 실효 K 구분, 안쪽 계측 비용 명시 | §4 |
| M2 제출 상태·DQ1 | 수용. 이 handoff 현재 상태, WBS 완성도현황 B35에 결정값 기록 | 이 문서, WBS |
| M3 즉시 채택안 구분 | 수용. P-3·K 하한 8·B는 별도 설계·승인 경로로 표시 | §3, §10 |
| N1 P-2 권고 | **채택.** 승인된 gate의 질문은 호출 1회 시간이고 P-2의 이점은 A/A 안정성뿐이었다. 권장을 P-1로 바꾸고 P-2는 별도 정책 선택지로 둔다. P-1이 A/A 불안정에 대응하지 않는다는 반대 근거는 그대로 적었다 | §0, §3, §9 |

## 승인 경계
- 승인됨: 이 계획의 조사·작성·검증·commit/push/같은 Draft PR 보완(사용자 A + P10 요청서 + 1차 검토 보완 범위)
- DQ1(2026-11-17): main 순차 통합 결정. 결합 후보 검증과 PR별 merge 승인은 그대로다. merge 승인이 아니다
- 미승인: 프로토콜 채택, 구현·사전검증 실행, 새 측정·진단·파일럿·시뮬레이션, F1 지위·기준 변경, 위험 수용, Ready, merge. D1의 1회 승인은 P02에서 소진됐다
- 다른 PR branch와 메인 checkout은 읽기 전용이다

## 유지할 사실
- K1 공식 timing INVALID(O2/F3 CAND A/A 3회 무효), memory NOT RUN. pre-K1 run3 PASS를 K1에 승계하지 않는다
- run3 정보용 same-input F1 비 O1 1.642342 / O2 1.390836은 pre-K1 대 main의 기존 잔여 위험이다. K1 결과가 아니다
- D1은 1회 탐색 진단이다. 원인 확정·유의성·공식 PASS·memory 대체 근거가 아니다
- 다른 run 비율 곱, 선택 표본 합산, GC 시간 제외, 사후 기준 완화, 성공할 때까지 재실행은 하지 않는다

## 검증 (Tier D)
- RED/npm gate: N/A(문서 Task). 새 측정·테스트·도구 실행 없음
- `git diff --check origin/main...HEAD`, 직접 읽기로 출처·단위·링크·상태·승인 범위·PR 본문 일치 확인
- Argon: 최초 제출본 1회 APPROVE(지적 0, 발췌 한정). 보완본 Major 보완 범위 1회: REQUEST CHANGES(Minor 1: 기존 finalize·catch의 error 전환 범위와 build_incomplete 매핑, Nit 2: 정보용 행 gate 필드·completed_informational). 원자료로 직접 확인 뒤 모두 반영(계획 §5.4·§6.1·§6.3·§6.4·§7.2). 재호출 없음
- 작성자 자기 검증, Argon 교차 확인, primary 검토는 서로 다른 검토다. 작성자는 최종 PASS를 주장하지 않는다

## 현재 상태
- PR [#123](https://github.com/kimcheolhui9846/token-context-optimizer/pull/123): OPEN·Draft·미병합. 최신 head는 PR과 보고에서 확인
- WBS(비추적): P10 계획 유지, 실행계획 9행·완성도현황 A4·B35를 보완 제출 상태로 동기화. 근거 `codex_review/remediation-impl-2026-11-13/p10-plan/wbs-r1/`
- 보고: `codex_review/codex_paste_2026-11-17_p10-plan-r1.md`
- 다음: primary 재검토 → 사용자 결정 U1–U4 → 별도 구현 요청·승인 → 측정 1회 실행 승인
