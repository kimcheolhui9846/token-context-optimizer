# P10: K1 공식 검증 하네스 구현 (Task handoff)

- 요청서: `codex_review/review_2026-11-17_p10-impl-request.md`, 실행 보완 `review_2026-11-17_p10-impl-execution.md`(충돌 시 보완 우선), 초기 검토 `review_2026-11-17_p10-impl-claude-initial.md` (Codex PM·Claude, 추적 안 됨)
- 채택 계획: PR #123 `docs/plans/2026-11-17-n34-k1-validation-plan.md`(검토 head `47c290e`, 채택 기록 `6e6730b`). 사용자 채택 U1 = P-1, U2 = 정보용 F1 + §7.3 처분표, U3 = 운영 예산 10 h / 1 h / 4 h·R 10분, U4 = 이 branch
- 범위: 같은 branch `claude/n34-cr-line-policy`, 같은 Draft PR #119. 시작 HEAD `fd93c54`, PR base `main` `5d668f9`
- 구현: Claude Code(`claude-opus-5-5`). 계획·최종 판정: Codex PM(primary)
- Tier E(측정 하네스·사전 등록). **이 단계에서 공식 timing·memory·정보용 실행, 새 진단·파일럿은 하지 않았다**

## 현재 상태: 구현 제출, primary 검토 대기
- K1 timing INVALID, memory NOT RUN, same-input F1 미해결은 그대로다. 하네스 검증 통과를 성능 해소로 쓰지 않는다
- O2 A/A 불안정의 기제는 미확인이다. P-1은 추정 대상·통계·임계·표본 정의를 바꾸지 않는다
- prereg: [n34-p10-prereg.md](n34-p10-prereg.md). 동결 commit = 이 handoff와 prereg §10을 함께 넣은 commit(이 branch에서 하네스를 마지막으로 바꾼 commit). SHA는 PR #119 본문과 비추적 보고에 적는다

## 승인 경계
- 승인됨: 하네스·prereg 구현, synthetic 검증(64 KiB self-check, 실패 주입), 프로젝트 7단계 gate, commit·push·Draft 기록, WBS 동기화
- 별도 승인: 공식 1회 실행(timing → memory → 정보용), 새 진단, 프로토콜·통계·임계 변경, 제품 변경·최적화, F1 위험 수용, Ready, merge
- 보존: 제품 코드 `4999c1f`(src·bin·package·lock), 기존 run3·K1·D1 하네스·prereg·raw, 공유 `HANDOFF.md`·`docs/agent/HANDOFF.md`, 논문

## 산출물
| 파일 | 목적 |
|---|---|
| `research/src/n34-p10-perf.mjs` | P-1 runner. run3 측정 논리 + K1 raw·child 기록. run3 대비 copy guard. orchestrator `runBlock` export, import 시 main 미실행 |
| `research/src/n34-p10-perf-contract.mjs` | 순수 helper: 예산, 단계별 raw 검증, 정보용·필수 판정, 처분, 소유 프로세스 종료·정리 증거, 블록 신원·raw commit 사슬, receipt |
| `research/test/n34-p10-perf.test.mjs` | node:test 34개. fake 시계·프로세스·git로 실제 runner import 흐름, 임시 git 저장소, 실제 root + grandchild 종료 fixture |
| `docs/agent/handoffs/n34-p10-prereg.md` | 채택 값, 정확한 명령, 판정, 예산, receipt·commit 규칙, 소유·부모 중단 복구 절차, 동결 blob pin |

- 입력·성능 worker·memory worker는 run3 파일을 그대로 쓴다. worker·inputs에 자식 프로세스 생성 코드 0건(grep)
- 증거 로그는 메인 checkout `codex_review/remediation-impl-2026-11-13/p10-impl/`(추적 안 됨)에 있다

## 초기 지적 처분 (실행 보완 기준)
| 지적 | 구현 |
|---|---|
| M-1 기준 코드·복사 검증 | run3 사본 + K1 raw 함수 확장. copy guard: LF LCS, 표시 없는 추가 줄 0, 제거 run3 줄 152개 sha256 `6b49bb89…dced5e` 고정, run3 sha256 `61866e8d…e1eee9` 고정. 음성 대조 3종(표시 없는 줄, run3 줄 제거, run3 변경) |
| M-2 소유 프로세스 | 같은 ChildProcess 객체만, 안전 pid·`exitCode`/`signalCode` null·error/exit/close 미관측, 동기 `taskkill /T /F`, timeout = min(Tkill, remainingTotal). Windows·Node v24.18.0 밖에서는 종료 안 함(fail closed). pid·spawn 직전/직후 wall·단조 시각·종료 시도 기록, spawn 즉시 저장. 블록 끝 미종료 child 종료 시도·`leftoverPids`·`cleanupViolations`(close 없음, 성공한 tree kill 없음) → 비PASS. 부모 중단 복구는 prereg §7 읽기 전용 절차 |
| m-1 timeout 원인 | 남은 예산 < 단계 상한(엄격)만 예산 제한. 빌드 예산 제한 → `build_incomplete`·invalid 5, 개별 상한 → error 1. npm도 같은 원인 전달 |
| m-2 memory | 완결 행 CAND OOM → failed_gate 4, 반복 부족 + OOM → `missing_runs` invalid 5, OOM raw 보존 |
| m-3 거부 | 결과 파일 생성 전 거부, stdout JSON 한 줄 + exit 1. 정보용은 J2 미확립 D-3, 신원 불일치 D-4 |
| m-4 검증 범위 | 하네스 근거는 node:test·check-only·self-check. npm 7단계는 제품 회귀 확인 |
| m-5 실제 runner | entry guard, `runBlock` export, `setRuntime`로 now·spawn·exec·sleep·stdout·root·저장만 주입. CLI·환경변수 우회 없음 |
| m-6 사슬 시작 | timing 시작 HEAD ≠ `--prereg`이면 거부 |
| m-7 앞 블록 | 18 key·pass·rawComplete + timing 원자료 검사 재실행 / memory 판정 재계산, 마무리 오류·잔류·정리·환경·`capOverrunMs` 0. 손으로 고친 pass는 거부(테스트) |
| n-1 | run3 정보용 규칙이 받아들이던 "child 완료 + 보정 미수렴", "child 완료 + invalid_samples"를 P10은 error로 판정 |
| n-2 | 최종 저장·hash 뒤 C 판단, 초과 시 error 1로 다시 저장, `P10-Receipt` 한 줄, 저장 실패는 성공 receipt 없음. 다음 블록이 receipt·blob sha256·status·exit·cap 검증 |
| n-3 | self-check 출력은 저장소 밖 절대 경로 `selfcheck-*.json`만, 공식 이름·폴더 거부 |
| n-4 | 임시 git fixture는 `git -c`로만 신원 지정 |

## 검증 기록
| 단계 | 명령 | 결과 |
|---|---|---|
| baseline | `node research/src/n34-cr-policy-perf.mjs --check-only`, `node research/src/n34-k1-perf.mjs --check-only` | 둘 다 exit 0, PASS |
| RED (`03504eb`) | `node --test research/test/n34-p10-perf.test.mjs` | exit 1, `ERR_MODULE_NOT_FOUND`(contract 모듈 부재 = 기능 부재) |
| GREEN (`e671711`) | 같은 명령 | 34/34 pass, exit 0. 이 commit 전 fixture 1곳 수정(raw-only commit fixture 파일에 `exitCode: 0` 추가) |
| 변이 대조 | 저장 뒤 C 검사 제거, 앞 블록 검사 재실행 제거, D-0/D-1 교체, `exit_seen` 무시, 예산 제한 `<`→`<=` | 5건 모두 해당 테스트 실패, 무변이 기준 통과 |
| check-only | `node research/src/n34-p10-perf.mjs --check-only` | exit 0, PASS, `timedCalls` 0, copy guard 위반 0(제거 152·추가 439) |
| 실제 self-check (`e671711`) | `--self-check --output=<메인 checkout>/codex_review/remediation-impl-2026-11-13/p10-impl/selfcheck/selfcheck-p10impl-1.json` | exit 0, 160 s(C 600 s). fault 9종 기대대로, root·grandchild timeout은 `taskkill` 성공·close 관측·grandchild 종료 확인, 소유 child 54개 모두 close, `leftoverPids`·`cleanupViolations`·`finalizationErrors` 0, 추적 파일 1,154개 불변. receipt sha256 `fbbfcfb3…f48749` = 파일 해시 |
| 기존 하네스 불변 | `git diff fd93c54 -- research/src/n34-cr-policy-perf*.mjs research/src/n34-k1-*.mjs research/results src package.json package-lock.json bin HANDOFF.md docs/agent/HANDOFF.md` | 0줄. run3·K1 check-only 다시 exit 0 |
| Argon(milestone 1회) | `argon_review.py` 묶음 = 실행 보완 §1–§4, 계획 §6.1–§6.5·§7.2–§7.3·R1, contract·runner 전문 | `gemini-4-argon` APPROVE, 지적 0. 확인 불가: inputs·worker·prereg·테스트 본문(묶음 밖) |
| npm 7단계 (`e671711`) | `npm ci --ignore-scripts` → `build` → `test` → `typecheck` → `smoke:mcp` → `validate:plugin` → `benchmark` | 모두 exit 0. test 52 files·4,455 pass·5 skip. 빌드 전후 `git status` 0줄 |

- 64 KiB self-check의 행 판정은 기록일 뿐 gate가 아니다(정보용 `O2/F1:same-input`이 I(aa)였다. 해석하지 않는다)
- 동결 commit은 문서(이 handoff·prereg §10)만 바꾼다. 하네스 코드는 `e671711`과 같다. 동결 HEAD에서 node:test·check-only를 다시 돌린 결과는 PR #119 본문에 적는다

## 남은 위험
- P-1은 O2 A/A 불안정에 대응하지 않는다. 공식 timing이 다시 INVALID일 수 있다(계획 §9)
- C는 hard wall이 아니다. 동기 저장·hash·OS 지연은 끊지 않고 초과를 비PASS로 기록한다
- 자식이 정상 종료한 직후 timeout 타이머가 먼저 돌면 종료가 거부되고(`exit_seen`) 그 child는 timeout·정리 미확인으로 남는다. 보수적 비PASS이며 30분 상한에서는 드물다
- 부모 중단 뒤 복구는 운영자 수동 절차다. 자동 종료·재개는 없다

## 다음
1. primary 구현 검토(실제 diff·로그·PR·WBS 대조)
2. primary preflight(동결 SHA 지정)
3. 사용자 1회 실행 승인 뒤 timing → raw commit → memory → raw commit → 정보용 → raw commit
