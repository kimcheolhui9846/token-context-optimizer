# P10: K1 공식 검증 하네스 구현 (Task handoff)

- 요청서: `codex_review/review_2026-11-17_p10-impl-request.md`, 실행 보완 `review_2026-11-17_p10-impl-execution.md`(충돌 시 보완 우선), 초기 검토 `review_2026-11-17_p10-impl-claude-initial.md` (Codex PM·Claude, 추적 안 됨)
- 채택 계획: PR #123 `docs/plans/2026-11-17-n34-k1-validation-plan.md`(검토 head `47c290e`, 채택 기록 `6e6730b`). 사용자 채택: U1 = P-1, U2 = 정보용 F1 + §7.3 처분표, U3 = 운영 예산 10 h / 1 h / 4 h·R 10분, U4 = 이 branch
- 범위: branch `claude/n34-cr-line-policy`, Draft PR #119, 시작 HEAD `fd93c54`, PR base `main` `5d668f9`
- 역할: 구현 Claude Code(`claude-opus-5-5`), 계획·최종 판정 Codex PM(primary)
- prereg: [n34-p10-prereg.md](n34-p10-prereg.md). 명령·판정·예산·receipt·소유·복구 절차·blob pin의 기준은 prereg다

## 현재 상태: 하네스 코드 primary PASS WITH NOTES, 문서 마감 재동결, primary 마지막 확인 대기
- primary r3(`codex_review/review_2026-11-17_p10-impl-primary-r3.md`, @`89cfce8`)
  - 판정: 하네스 코드 **PASS WITH NOTES**, Blocker 0·Major 0·Minor 3(문서)
  - 공식 성능 결과나 P10 완료 판정이 아니다
- 하네스 코드는 GREEN `2e1f7d4`와 같다
  - 문서 마감 재동결 commit은 이 handoff와 prereg §10 설명만 바꾼다
  - 그 SHA가 `--prereg` 후보다. PR #119 본문과 비추적 보고에 적는다
- 실행 후보에서 제외된 commit
  - `7735d42`, `c52826a`: CHANGES REQUIRED
  - `89cfce8`: 실행 HEAD는 마지막 동결 commit이어야 하므로 제외
- 공식 timing·memory·정보용은 **미실행**이다. K1 timing INVALID / memory NOT RUN, same-input F1 위험, O2 A/A 불안정은 그대로다
- 하네스 검증 통과는 성능·F1 해소의 근거가 아니다

## 승인 경계
- 승인됨: 하네스·prereg 구현, primary r1·r2 보완, r3 문서 마감, synthetic 검증, 프로젝트 7단계 gate, commit·push·Draft 기록, WBS 동기화
- 별도 승인: 공식 1회 실행(timing → memory → 정보용), 새 진단, 프로토콜·통계·임계·예산·제품·의존성 변경, F1 위험 수용, Ready, merge
- 보존(diff 0): 제품 `4999c1f`(src·bin·package·lock), run3·K1·D1 하네스·prereg·raw, 공유 `HANDOFF.md`·`docs/agent/HANDOFF.md`, 논문

## 산출물
| 파일 | 목적 |
|---|---|
| `research/src/n34-p10-perf.mjs` | P-1 runner: run3 측정 논리 + K1 raw·child 기록, run3 대비 copy guard(제거 152줄 `6b49bb89…` 고정, 표시 없는 추가 0), `runBlock` export |
| `research/src/n34-p10-perf-contract.mjs` | 순수 helper: 예산, raw 검증, 판정·처분, 소유 프로세스 종료·정리 증거, raw-only commit 사슬·receipt, 앞 블록 검증 |
| `research/test/n34-p10-perf.test.mjs` | node:test 44개: fake 시계·프로세스·git로 실제 runner 흐름, 임시 git 저장소, 실제 root + grandchild 종료 fixture |
| `docs/agent/handoffs/n34-p10-prereg.md` | 채택 값, 명령, 판정, 예산, receipt·commit 규칙, 소유·부모 중단 복구, 동결 blob pin 14개 |

- 입력·성능 worker·memory worker는 run3 파일을 그대로 쓴다

## 핵심 보장 (지적별 처분은 아래 이력의 보고에 있다)
- 다음 블록은 앞 블록이 저장한 `pass`만 믿지 않는다. 다음을 모두 확인한다
  - 앞 블록 raw만 추가하는 commit 1개
  - 성공 receipt: 읽힌 값이 무엇이든 검사하고, 객체가 아니면 거부
  - run3 정의로 원자료 재판정. 보정 사다리는 K = 1, 2, 4, … ≤ 1024이고 마지막 단계만 수렴해야 한다
  - child 증거: spawn별 `childId`, spawn → exit 0 → close, 앞 close ≤ 다음 spawn, 행·run과 1:1 연결
  - 신원
- 순차 PID 재사용은 받아들인다
- `childId`나 저장 PID로는 종료하지 않는다. 종료는 살아 있는 같은 ChildProcess 객체로만 한다
- snapshot assertion 실패는 무결성 D-4다
- 부모가 중단되면 저장 PID로 종료하지 않고 수동 확인에서 멈춘다
- npm 로그 쓰기 실패는 정상 오류로 끝난다
- 블록 끝 종료 예산은 child마다 다시 계산한다

## 최종 코드 검증 (@`2e1f7d4`, 증거: 메인 checkout `codex_review/remediation-impl-2026-11-13/p10-impl/rework-r2/`)
| 항목 | 결과 |
|---|---|
| node:test | RED `bcc13b7`: 40 통과·4 실패. GREEN 44/44, `89cfce8` 44/44, primary r3 44/44 |
| check-only | P10·run3·K1 모두 exit 0, copy guard 위반 0 |
| primary r2 probe 원본 | 10사례 기대대로(음성 9 거부, 순차 PID 재사용 1 수용) |
| 합성 사유 기록 | 48사례 기대대로. PID 재사용 블록은 timing → memory에서 수용. 이와 별도로, 재사용이 없는 정상 memory 원자료는 memory → info에서 수용 |
| 실제 self-check | exit 0, 164 s. child 54개: `childId` 1..54, 순차 실행, 잔류 0. 실제 PID 재사용 1건(pid 8108) 관측 |
| npm 7단계 | 모두 exit 0. 52 files, 4,455 pass, 5 skip. 취약점 알림 7건은 기존 P04 범위 |
| Argon | 작성자 scoped APPROVE·지적 0(자기 검증 보조), primary Argon APPROVE |

## 이력 (상세는 보고·commit)
| 단계 | commit | 보고·검토 (`codex_review/`, 추적 안 됨) |
|---|---|---|
| 1차 구현 | RED `03504eb` → GREEN `e671711` → 동결 `7735d42` | `codex_paste_2026-11-17_p10-impl.md` |
| primary r1 (Major 5·Minor 1) | RED `464fbc9` → GREEN `6e94fd9` → 동결 `c52826a` | `review_2026-11-17_p10-impl-primary-r1.md`, `codex_paste_2026-11-17_p10-impl-r1.md` |
| primary r2 (Major 3) | RED `bcc13b7` → GREEN `2e1f7d4` → 동결 `89cfce8` | `review_2026-11-17_p10-impl-primary-r2.md`, `codex_paste_2026-11-17_p10-impl-r2.md` |
| primary r3 (PASS WITH NOTES, 문서 Minor 3) | 문서 마감 재동결(이 handoff·prereg §10) | `review_2026-11-17_p10-impl-primary-r3.md`, `codex_paste_2026-11-17_p10-impl-r3.md` |

## 남은 위험
- P-1은 O2 A/A 불안정에 대응하지 않는다. 공식 timing이 다시 INVALID일 수 있다
- C는 수용 상한이며 hard wall이 아니다. 동기 저장·hash·OS 지연은 끊지 않고, 초과는 비PASS로 기록한다
- 부모 중단 뒤 남은 child는 하네스 기록만으로 같은 프로세스인지 확인할 수 없다. 종료하지 않고 사용자·PM의 수동 확인에 맡긴다
- 원자료 재판정·child 증거·hash/commit 사슬은 기록끼리의 모순만 잡는다. 일관되게 꾸민 기록이 실제 실행과 같다는 보장은 아니다
- "앞 close ≤ 다음 spawn" 규칙은 runner가 child를 하나씩 기다리는 구조에 기댄다

## 다음
1. primary 마지막 문서·동결 확인(문서 마감 재동결 SHA)
2. 사용자 공식 1회 실행 승인 뒤 timing → raw commit → memory → raw commit → 정보용 → raw commit
