# P10: K1 공식 검증 하네스 구현 (Task handoff)

- 요청서: `codex_review/review_2026-11-17_p10-impl-request.md`, 실행 보완 `review_2026-11-17_p10-impl-execution.md`(충돌 시 보완 우선), 초기 검토 `review_2026-11-17_p10-impl-claude-initial.md` (Codex PM·Claude, 추적 안 됨)
- 채택 계획: PR #123 `docs/plans/2026-11-17-n34-k1-validation-plan.md`(검토 head `47c290e`, 채택 기록 `6e6730b`). 사용자 채택 U1 = P-1, U2 = 정보용 F1 + §7.3 처분표, U3 = 운영 예산 10 h / 1 h / 4 h·R 10분, U4 = 이 branch
- 범위: 같은 branch `claude/n34-cr-line-policy`, 같은 Draft PR #119. 시작 HEAD `fd93c54`, PR base `main` `5d668f9`
- 구현: Claude Code(`claude-opus-5-5`). 계획·최종 판정: Codex PM(primary)
- Tier E(측정 하네스·사전 등록). **이 단계에서 공식 timing·memory·정보용 실행, 새 진단·파일럿은 하지 않았다**

## 현재 상태: primary r2 보완 제출, primary 재검토 대기
- 1차 동결 `7735d42`(primary r1, Major 5·Minor 1)와 r1 재동결 `c52826a`(primary r2 `codex_review/review_2026-11-17_p10-impl-primary-r2.md`, Major 3)는 CHANGES REQUIRED였다. **`7735d42`·`c52826a`는 실행 후보에서 제외됐다**
- r2 보완: RED `bcc13b7` → GREEN `2e1f7d4` → 재동결(이 handoff와 prereg §10을 함께 넣은 commit). 재동결 SHA는 PR #119 본문과 비추적 보고에 적는다
- K1 timing INVALID, memory NOT RUN, same-input F1 미해결은 그대로다. 하네스 검증 통과를 성능 해소로 쓰지 않는다
- O2 A/A 불안정의 기제는 미확인이다. P-1은 추정 대상·통계·임계·표본 정의를 바꾸지 않는다
- prereg: [n34-p10-prereg.md](n34-p10-prereg.md). 동결 commit = 이 branch에서 하네스·prereg를 마지막으로 바꾼 commit

## 승인 경계
- 승인됨: 하네스·prereg 구현, synthetic 검증(64 KiB self-check, 실패 주입), 프로젝트 7단계 gate, commit·push·Draft 기록, WBS 동기화
- 별도 승인: 공식 1회 실행(timing → memory → 정보용), 새 진단, 프로토콜·통계·임계 변경, 제품 변경·최적화, F1 위험 수용, Ready, merge
- 보존: 제품 코드 `4999c1f`(src·bin·package·lock), 기존 run3·K1·D1 하네스·prereg·raw, 공유 `HANDOFF.md`·`docs/agent/HANDOFF.md`, 논문

## 산출물
| 파일 | 목적 |
|---|---|
| `research/src/n34-p10-perf.mjs` | P-1 runner. run3 측정 논리 + K1 raw·child 기록. run3 대비 copy guard. orchestrator `runBlock` export, import 시 main 미실행 |
| `research/src/n34-p10-perf-contract.mjs` | 순수 helper: 예산, 단계별 raw 검증, 정보용·필수 판정, 처분, 소유 프로세스 종료·정리 증거, 블록 신원·raw commit 사슬, receipt |
| `research/test/n34-p10-perf.test.mjs` | node:test 44개(1차 34 + r1 6 + r2 4). fake 시계·프로세스·git로 실제 runner import 흐름, 임시 git 저장소, 실제 root + grandchild 종료 fixture |
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

## primary r1 지적 처분 (`7735d42` → `6e94fd9`)
| 지적 | 구현 | 재현 사례 결과(수정 후) |
|---|---|---|
| R1 선행 raw 재판정 | runner `priorRederive`가 run3 정의(행 매핑, 보정 멈춤 조건, attempt 번호·최대 3회·멈춘 뒤 없음, schedule, 표본 order·label·arm, 통계·A/A·gate·비율, `selectedAttempt`, 행 판정)로 timing을 다시 판정하고, memory는 (row, repeat, arm, inputId) 108개 순서와 행·블록 판정을 다시 낸다. contract `priorChildViolations`가 child 기록·`cleanupViolations`·`leftoverPids`·행/run의 child close를 대조한다. build·`integrityErrors`·본문 오류·예산 값도 확인. 형태 손상·예외도 거부 JSON + exit 1 | primary 5사례 + 추가 14사례 모두 `refused`(사유가 사례마다 다름), 정상 timing·memory는 그대로 수용 |
| R2 receipt | contract `successReceiptViolations`: 필드 정확히 11개, sha256 형식, 블록 C, 0 이상 정수 ms, `capOverrunMs` = max(0, elapsed − C) = 0, `errors` `[]`, `saveFailed`·`saveError` 없음. 원자료 `budget.capMs` 불일치·`finalEndMs` > receipt `elapsedMs`는 모순으로 거부 | primary 3사례 + 추가 3사례 `prior_chain` 거부, 계약 표 음성 31종·양성 경계(elapsed = C, 0) |
| R3 snapshot 무결성 | `buildChecked`가 `buildSnapshots`의 assertion(그 함수의 유일한 assertion = A/A 사본·lockfile·dist/core)을 타입으로 `IntegrityError('snapshot_integrity')`로 바꾸고 `integrityErrors`에 남긴다. run3 줄은 바꾸지 않음 | lock·A/A 사본·core 파일·`policy.js` 같음 4종 모두 error 1·D-4, 일반 설치 오류는 D-2·`integrityErrors` `[]` |
| R4 부모 중단 복구 | prereg §7 4–6단계: 하네스는 OS 생성 시각 기준선을 기록하지 않음을 적고, 저장 PID·부모 시각으로 어떤 프로세스도 종료하지 않으며 조회 결과를 기록하고 "중단·수동 확인 필요"로 멈춘다. 새 OS 조회·허용오차 없음 | 문서 테스트 1개 |
| R5 npm 로그 | close 콜백의 로그 쓰기를 try/catch로 감싸 Promise를 reject한다. Promise는 한 번만 정산되고, 예산 제한 timeout의 `BudgetExpired`가 먼저다 | 미처리 예외 없음, error 1, 원자료·정리·receipt 정상. 최종 저장도 실패하면 `saveFailed` receipt만 |
| M1 블록 끝 종료 예산 | `killUnclosed(timeoutFor)`가 child마다 남은 총예산을 다시 평가하고, 0이면 taskkill을 시작하지 않는다(`no_budget`) | fake 시계: 첫 종료가 다 쓰면 둘째 0회, 일부 쓰면 줄어든 timeout |

- copy guard: 제거 run3 줄 집합·해시 그대로(152줄, `6b49bb89…`). npm 수정 중 한 번 LCS 정렬이 바뀌어 run3 줄이 원문 그대로 남도록 고쳤다(고정값 변경 없음)
- 측정 정의·임계·예산 값·제품·의존성은 바꾸지 않았다

## primary r2 지적 처분 (`c52826a` → `2e1f7d4`)
| 지적 | 구현 | 재현 사례 결과(수정 후) |
|---|---|---|
| R2-01 falsy receipt | contract `verifyRawOnlyCommit`이 "receipt 줄을 읽었는가"와 값을 분리한다. 읽힌 값은 무엇이든 `successReceiptViolations`를 거치고(객체가 아니면 `receipt_type`), 객체일 때만 output·hash·status·예산을 더 대조한다 | primary 4사례 + 배열·문자열·숫자·`true` 모두 실제 다음 `runBlock`에서 `prior_chain`(`receipt_type`) 거부, 정상 객체 receipt는 수용 |
| R2-02 child 신원 | contract `createOwnership`이 등록한 spawn마다 `childId`(블록 안 1..n)를 주고 관측 사건 순서(`events`), exit code·signal, close 단조 시각을 기록한다. runner가 `childId`를 행·run의 child 요약에 넘긴다. 앞 블록 검사는 pid 대신 `childId`로: 기록마다 spawn → exit 0 → close·종료 없음, 앞 기록 close ≤ 다음 spawn(재사용 pid 겹침 없음), 앞 두 기록 = `npm ci` 두 개, 나머지 = 행/run이 가리키는 child와 순서대로 하나씩(`childId`·pid·시작 시각·node 인자·역할 script). `childId`는 종료 권한이 없다. fake 프로세스도 실제처럼 spawn → exit → close를 낸다 | 순차 PID 재사용 정상 블록 수용(memory pass, info `completed_informational`). primary 3사례 + 중복 id·다른 기록 참조·id 누락·시작 시각·역할·사건 순서·spawn 없음·exit 1·signal·close 시각 누락·추가 기록·npm 실패·순서 바뀜·수명 겹침·memory run 연결 교환·역할·signal 모두 거부(사유 `prior_children_records`·`prior_child_lifecycle`·`prior_child_overlap`·`prior_child_links`·`prior_child_close`) |
| R2-03 보정 사다리 | runner `calibrationLadderOk`: run3 worker 정의 그대로 K = 1부터 두 배씩 maxK 이하, 단계마다 B1·C1 5개 유한한 0 이상 값, 마지막 이전 단계는 멈춤 조건 미충족·마지막만 충족. 앞 블록 재판정에서 위반이면 `calibration_ladder`와 판정 불일치로 거부. worker·임계·K 하한은 그대로 | producer에서 만든 K 1·2·4·1024(상한 경계) 수용. K 0·2048·음수·소수·문자열·비2승·누락·중복·역순·수렴 뒤 계속·마지막 미수렴·빈 단계·표본 수·null·음수·문자열 표본·행 k 불일치 모두 거부 |

- 실제 self-check에서 PID 재사용이 한 번 관측됐다(pid 8108: childId 1 fault child, childId 17 timing 보정). 새 기준은 두 기록을 구분한다
- copy guard 고정값(제거 152줄 `6b49bb89…`)은 그대로, R3·R4·R5·M1 수정은 그대로다

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
- 위 표는 1차 제출(`7735d42`) 기록이다. primary r1 보완 기록은 아래에 있다

### primary r1 보완 검증 (증거: 메인 checkout `codex_review/remediation-impl-2026-11-13/p10-impl/rework-r1/`)
| 단계 | 명령 | 결과 |
|---|---|---|
| RED (`464fbc9`) | `node --test research/test/n34-p10-perf.test.mjs` | exit 1, 40개 중 34 통과·6 실패(R1·R2·R3·R5·M1·R4, R5는 미처리 EISDIR). 기존 34개는 통과 |
| GREEN (`6e94fd9`) | 같은 명령 | exit 0, 40/40 |
| check-only | P10·run3·K1 `--check-only` | 모두 exit 0. P10 copy guard 위반 0 |
| primary probe 재실행 | 원본 그대로 복사해 실행 | 8사례 모두 `refused`, lock 사례 error·D-4·`integrityErrors` 기록. npm probe 원본은 미처리 예외 없이 exit 0 |
| 사유 기록 | `rework-r1/reasons-probe.mjs`(합성) | 25사례 거부 사유, 양성 2사례 pass·`completed_informational` D-0, npm 2사례 |
| 실제 self-check (`6e94fd9`) | `--self-check --output=<메인 checkout>/…/rework-r1/selfcheck/selfcheck-p10r1-1.json` | exit 0, 162 s, fault 9종 기대대로, root·grandchild `taskkill /T` 성공·close·grandchild 종료, 소유 child 54개 close, 잔류·정리 위반·마무리 오류 0, 추적 파일 1,154개 불변, receipt sha256 = 파일 |
| Argon(scoped 1회) | 묶음 = primary r1 전문, 실행 보완 발췌, runner·contract·test·prereg diff 전문, `buildSnapshots` | `gemini-4-argon` APPROVE, 지적 0. 확인 불가: 로컬 실행·Git·WBS |
| npm 7단계 (`6e94fd9`) | `npm ci --ignore-scripts` → … → `benchmark` | 7개 모두 exit 0. test 52 files·4,455 pass·5 skip. 빌드 직후 `git status` 0줄. npm ci 경고 7건은 기존 P04 범위(의존성 변경 없음) |

- r1 재동결 `c52826a`는 문서(이 handoff·prereg §10)만 바꿨다. 하네스 코드는 `6e94fd9`와 같다

### primary r2 보완 검증 (증거: 메인 checkout `codex_review/remediation-impl-2026-11-13/p10-impl/rework-r2/`)
| 단계 | 명령 | 결과 |
|---|---|---|
| RED (`bcc13b7`) | `node --test research/test/n34-p10-perf.test.mjs` | exit 1, 44개 중 40 통과·4 실패(R2-01, R2-02 두 개, R2-03). PID 재사용 정상 블록이 `prior_children_records`로 거부되는 것까지 재현 |
| GREEN (`2e1f7d4`) | 같은 명령 | exit 0, 44/44 |
| check-only | P10·run3·K1 `--check-only` | 모두 exit 0. P10 copy guard 위반 0(제거 152·추가 536, 고정값 그대로) |
| primary r2 probe 재실행 | 원본 그대로 복사해 실행 | 10사례 모두 기대대로(음성 9 `refused`, PID 재사용 1 `pass`) |
| 사유 기록 | `rework-r2/reasons-probe.mjs`(합성, producer → raw/receipt → commit → 다음 `runBlock`) | 48사례 모두 기대대로, 사유 위 표 |
| 실제 self-check (`2e1f7d4`) | `--self-check --output=<메인 checkout>/…/rework-r2/selfcheck/selfcheck-p10r2-1.json` | exit 0, 164 s. 소유 child 54개 `childId` 1..54·사건 spawn → exit → close·앞 close ≤ 다음 spawn, 잔류·정리 위반 0, receipt sha256 = 파일. 실제 PID 재사용 1건 관측 |
| Argon(scoped 1회) | 묶음 = primary r2 전문·primary Argon, runner·contract·test diff, prereg·handoff diff, producer·caller·worker 보정 발췌, probe·self-check 요약 | `gemini-4-argon` APPROVE, 지적 0. 확인 불가: 로컬 실행·Git·WBS. 자기 검증 보조이며 독립 검토가 아니다 |
| npm 7단계 (`2e1f7d4`) | `npm ci --ignore-scripts` → … → `benchmark` | 7개 모두 exit 0. test 52 files·4,455 pass·5 skip. 빌드 전·빌드 직후·끝 `git status` 0줄. npm ci 취약점 알림 7건은 기존 P04 범위(의존성 변경 없음) |

- r2 재동결 commit은 문서(이 handoff·prereg §10)만 바꾼다. 하네스 코드는 `2e1f7d4`와 같다

## 남은 위험
- P-1은 O2 A/A 불안정에 대응하지 않는다. 공식 timing이 다시 INVALID일 수 있다(계획 §9)
- C는 hard wall이 아니다. 동기 저장·hash·OS 지연은 끊지 않고 초과를 비PASS로 기록한다
- 자식이 정상 종료한 직후 timeout 타이머가 먼저 돌면 종료가 거부되고(`exit_seen`) 그 child는 timeout·정리 미확인으로 남는다. 보수적 비PASS이며 30분 상한에서는 드물다
- 부모 중단 뒤에는 남은 child를 이 하네스 기록만으로 같은 프로세스라고 확인할 수 없다(OS 생성 시각 기준선 없음). 종료하지 않고 보고에서 멈추므로, 남은 프로세스 처리는 사용자·PM의 별도 확인이 필요하다
- 앞 블록 재판정은 저장된 원자료와 run3 정의의 일관성만 확인한다. 원자료 자체가 실제 측정과 같은지는 receipt hash·raw-only commit·운영자 기록에 기댄다
- `childId`·사건 순서·close 시각은 부모가 본 내부 증거다. 기록끼리의 모순(잘못된 연결, 실패 증거, 수명 겹침)은 거부하지만, 일관되게 꾸민 기록이 실제 실행과 같다는 외부 보장은 아니다. 순차 실행 규칙(앞 close ≤ 다음 spawn)은 runner가 child를 하나씩 기다리는 구조에 기댄다

## 다음
1. primary 재검토(r2 보완 diff·로그·PR·WBS 대조)
2. primary preflight(r2 재동결 SHA 지정, `7735d42`·`c52826a` 아님)
3. 사용자 1회 실행 승인 뒤 timing → raw commit → memory → raw commit → 정보용 → raw commit
