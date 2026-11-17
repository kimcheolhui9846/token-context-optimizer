# P10: K1 공식 검증 하네스 구현 (Task handoff)

- 요청서: `codex_review/review_2026-11-17_p10-impl-request.md`, 실행 보완 `review_2026-11-17_p10-impl-execution.md`(충돌 시 보완 우선), 초기 검토 `review_2026-11-17_p10-impl-claude-initial.md` (Codex PM·Claude, 추적 안 됨)
- 채택 계획: PR #123 `docs/plans/2026-11-17-n34-k1-validation-plan.md`(head `47c290e`). 사용자 채택 U1 = P-1, U2 = 정보용 F1 + §7.3 처분표, U3 = 운영 예산 10 h / 1 h / 4 h·R 10분, U4 = 이 branch
- 범위: 같은 branch `claude/n34-cr-line-policy`, 같은 Draft PR #119. 시작 HEAD `fd93c54`, PR base `main` `5d668f9`
- 구현: Claude Code(`claude-opus-5-5`). 계획·최종 판정: Codex PM(primary)
- Tier E(측정 하네스·사전 등록). **이 단계에서 공식 timing·memory·정보용 실행, 새 진단·파일럿은 하지 않는다**

## 현재 상태: 구현 진행 중 (primary 검토 전)
- K1 timing INVALID, memory NOT RUN, same-input F1 미해결은 그대로다. 하네스 검증 통과를 성능 해소로 쓰지 않는다
- O2 A/A 불안정의 기제는 미확인이다. P-1은 추정 대상·통계·임계·표본 정의를 바꾸지 않는다

## 승인 경계
- 승인됨: 하네스·prereg 구현, synthetic 검증(64 KiB self-check, 실패 주입), 프로젝트 7단계 gate, commit·push·Draft 기록, WBS 동기화
- 별도 승인: 공식 1회 실행(timing → memory → 정보용), 새 진단, 프로토콜·통계·임계 변경, 제품 변경·최적화, F1 위험 수용, Ready, merge
- 보존: 제품 코드 `4999c1f`(src·bin·package·lock), 기존 run3·K1·D1 하네스·prereg·raw, 공유 `HANDOFF.md`·`docs/agent/HANDOFF.md`, 논문

## 산출물 (구현 예정 이름)
| 파일 | 목적 |
|---|---|
| `research/src/n34-p10-perf.mjs` | P-1 runner. run3 측정 논리 + K1 raw·child 기록. run3 대비 copy guard |
| `research/src/n34-p10-perf-contract.mjs` | 순수 helper: 예산, 단계별 raw 검증, 정보용·필수 판정, 처분, 블록 신원·raw commit 사슬, receipt |
| `research/test/n34-p10-perf.test.mjs` | node:test. fake clock·fixture·임시 git 저장소, 실제 runner import 흐름 |
| `docs/agent/handoffs/n34-p10-prereg.md` | 채택 값, 정확한 명령, 판정, 예산, 중단·cleanup, 신원, 실행 전 상태 |

- 입력·성능 worker·memory worker는 run3 파일을 그대로 쓴다
- self-check 결과는 저장소 밖(메인 checkout `codex_review/remediation-impl-2026-11-13/p10-impl/selfcheck/`, 추적 안 됨)에 쓴다

## 단계
1. baseline: 기존 run3·K1 `--check-only`(측정 없음)
2. RED: 새 테스트가 기능 부재로 실패함을 기록
3. GREEN: helper·runner 구현, targeted 테스트, `--check-only`
4. 실제 runner 흐름(fake)·실패 주입·작은 self-check(전역 검증 예산 10분, fault child ≤ 60 s)
5. prereg 작성·동결 commit(마지막 하네스 commit = `--prereg`, timing 시작 HEAD와 같아야 함)
6. milestone Argon 1회, npm 7단계 gate, push, Draft #119 본문 갱신, WBS
7. primary 검토 대기. 공식 실행은 별도 실행권 뒤에만

## 검증 기록
- 아직 없음. 각 단계의 명령·exit·로그는 이 문서와 `codex_review/remediation-impl-2026-11-13/p10-impl/`에 남긴다
