# Task 28 — 논문·평가 프로토콜의 토큰 비용 근거 보강

## 1. 작업 개요
- Task 28 / WBS 4.2: 기존 이미지 논문·평가 프로토콜에 Task 27의 출처 근거를 반영한다.
- 사용자 승인: 2026-10-09 PR #27 Nit 수정, Ready·merge 및 다음 Task 진행.
- PR #27은 9aaf8235bd7954ed7d9ff8d8855e5275c08efcea로 병합되었고 검증된 3612277과 파일 트리가 같다.
- 현재: codex/task-28-paper-evidence, 기준 main 9aaf823. 내용 커밋 37bdc0e를 push했고 Draft PR #28을 생성했다.
- 제외: F-12 논문 방향 확정, 새 계산·출처·데이터셋·런타임·의존성, API/count-tokens/업로드·실측, 사용자 WBS 및 공유 docs/agent/HANDOFF.md.

## 2. 계획과 수용 기준
- [x] Git 격리와 기존 상태 확인, 첫 산출물로 이 핸드오프 생성.
- [x] Astra 상세 계획·초기 검토 GO, 외부 제공자 검토 미수행/DEGRADED 기록.
- [x] Luna: 논문 §3.3/5/6, 프로토콜 §6/7의 근거·관측 경계 보강 및 Minor 수정.
- [x] 원문 표 수치·로컬 링크·범위 검사, pre-PR 전체 npm gate.
- [x] commit/push/Draft PR #28 생성 및 post-PR 전체 gate.
- [x] Astra 최종 검토 PASS WITH NOTES 및 검증·전달 기록 정리.
- 기존 12/36 family, 720/576/144 planned calls, A–E arms와 D−C primary 유지.
- 1536px/q75는 미검증 후보, 대조 모델은 파일럿 선정 아님. F-06은 출처 근거만 부분 해결, WBS 5.1/5.6 실측은 미완료.

## 3. 변경·의사결정
- Astra의 상세 계획에 따라 Luna가 두 연구 문서 수정과 Minor 보완을 완료했다. 기존 구조를 유지한 근거 보강으로 범위를 고정했다.
- F-12 방향은 사용자에게 선택 질문을 보냈으며 답변 전 임의 확정하지 않는다.

## 4. 테스트와 오류
- RED: 문서 변경으로 해당 없음. 사전 수용 검사: 요약 수치 추적, 기존 평가 설계 보존, 추정/실측 구별, Markdown/로컬 링크.
- 병합 트리는 Task27 fresh gate(790 passed / 1 skip, 나머지 검사 PASS)와 동일하나 Task28 gate는 별도 실행한다.
- Windows exec는 tty:true/login:false. sandbox helper setup 오류 시 승인된 escalation으로 실행한다.

## 5. 교차 검토와 자체 리뷰
- Astra native 실제 실행으로 다음 Task 범위 분석 완료. 상세 계획 GO 및 구현 diff 검토 완료; Draft PR 후 최종 증거 검토를 완료했고 PASS WITH NOTES를 받았다.
- Claude10-09 claude-opus-5-5 Approve는 Task27에 대한 사용자 제공 리뷰이며 Task28 리뷰로 재사용하지 않는다.
- 공급자 API 호출 금지 유지. 직접 외부 모델 호출은 수행하지 않았다. 이후 수신한 사용자 제공 Task 28 Claude 리뷰는 §9/14에 별도로 기록하며 Codex가 모델·quota를 검증했다고 주장하지 않는다.
- 공식 산술 수치를 실험 성과나 전체 데이터셋 효과로 잘못 옮기는 위험을 최우선 검토한다.

## 6. 남은 작업과 승인 지점
- [ ] 투고 전: 공급자 문서 재확인, 확인일 갱신, 논문의 재확인 미수행 문장 삭제. Gemini 가격 2027-01-01 변경과 Sol 프로모션 2026-11-21 종료 유의(사용자 제공 리뷰의 일정이며 이번에 재확인하지 않음).
- 사용자 후속 승인: R-1·R-2를 이번 PR에 반영·검증한 뒤 Ready·merge하고 다음 Task를 진행한다.
- 사용자 WBS 파일은 아직 위치가 확인되지 않았으며 수정하지 않는다.

## 7. 재개 기록 — 2026-10-10
- 서버 재시작 후 Git 상태 CLEAN, base 9aaf823 및 PR #27 MERGED를 직접 재확인했다. 중단된 baseline의 결과 파일은 없어 재실행한다.
- 이전 Astra 세션은 서버 재시작으로 사라졌다. 동일 요구 모델 gpt-6-astra를 native 도구에서 새로 선택해 계획 작업을 재개했다. 응답·검토가 완료되기 전 성공 판정으로 기록하지 않는다.
- Task 28의 모델/API 호출 금지 및 외부 모델·quota 미확인으로 추가 외부 교차 검토는 DEGRADED다. Task 27의 Claude 승인은 Task 28 승인으로 재사용하지 않는다.

- Baseline 첫 실행은 이 worktree에 node_modules가 없어 fast-png 로드 실패로 종료됐다(부모 checkout 의존성으로 충분하지 않음). npm.cmd ci로 lockfile 그대로 61개를 설치한 뒤 npm.cmd test 재실행 PASS: 25 files, 790 passed / 1 기존 Windows FIFO skip, 18.36초. 의존성 파일 수정은 없다. 로그는 부모 .artifacts/task28-baseline.log 및 task28-baseline-retry.log.
- npm ci가 기존 잠금 의존성 취약점 4건(Moderate 1/High 1/Critical 2)을 보고했다. 상세 보안 감사·업그레이드는 문서 Task 범위 밖이며 자동 fix를 실행하지 않았다.

## 8. 초기 계획 검토와 작업 배정
- 실제 native gpt-6-astra 호출은 계획 작성과 근거 문서 대조를 마치고 GO를 반환했다. 계획의 고정 네 문서 검사와 diff 검사도 직접 실행해 통과했다.
- 구현은 native gpt-6-luna를 명시 선택해 위임했다. 기본 sandbox helper 오류 후 승인된 escalation 경로로 원문·계획 읽기를 완료하고 수정 범위 두 파일을 배정받았다.
- [상세 계획](../../superpowers/plans/2026-10-10-paper-evidence.md)의 수용 기준을 적용한다. 논문 3.3/5/6 및 프로토콜 6/7만 수정하며 실패 분모와 평가 설계를 유지한다.

## 9. 구현과 마일스톤 검토
- 실제 gpt-6-luna가 두 연구 문서를 수정했다. 첫 combined patch는 context 불일치로 원자적으로 실패해 파일이 바뀌지 않았고, 실제 문맥 확인 후 다시 적용했다.
- Root 범위 검사에서 허용된 절 밖 내용과 기존 평가 설계는 보존됐으나 프로토콜의 직접 근거 링크가 누락되어 실패했다. 링크를 보완한 뒤 같은 검사를 다시 실행해 통과했다.
- Native gpt-6-astra가 실제 diff와 출처를 검토했다: Blocker/Major 0. Minor는 프로토콜 출처 링크, Sol 생략 기본값=auto, 대조 모델/기존 후보 역할, JPEG 작은 글자 손상 가능성의 명시였다. 모두 승인된 근거 보강 범위로 수용했다.
- 초기·구현 마일스톤의 추가 직접 호출 상태는 DEGRADED였다. 이후 사용자 제공 Task 28 전용 Claude 리뷰를 수신했다. 아래는 직접 호출 이력과 제공받은 실제 리뷰를 분리한 기록이다.

| 제공자 | 초기 계획 / 마일스톤 실제 수행 | 확인 범위와 미수행 이유 |
| --- | --- | --- |
| Claude Code | 초기 직접 호출 미수행 / 사용자 제공 Task 28 리뷰 수신 | 사용자 제공 Claude 리뷰(2026-10-10, claude-opus-5-5): Approve, Minor 3/Nit 2, Blocker/Major 0. Codex가 직접 호출하지 않았으며 실행·인증·quota를 검증했다고 주장하지 않음. Task 27 리뷰 재사용 아님. |
| Gemini | 미수행 / 미수행 | gemini.ps1 존재만 확인. 무료 모델 접근·free quota 미확인; 유료 전환이나 모델 호출 없음. |
| GitHub Copilot | 미수행 / 미수행 | copilot.ps1 wrapper 존재만 확인. 실제 callable 모델 접근과 quota 미확인; GitHub 인증을 Copilot 증거로 쓰지 않음. |
| Native Astra | GO / 실제 문서 diff 검토 완료 | gpt-6-astra를 명시 선택한 native 호출의 성공 응답. 외부 제공자 교차 검토를 대신했다고 주장하지 않음. |

## 10. Pre-PR 검증 — 2026-10-10
- RED: 문서 정정이므로 해당 없음. 변경 전 baseline 재실행과 사전 수용 기준을 사용했다.
- GREEN: 고정 4문서 공백·최종 개행·fence·상대 링크 검사 PASS. 별도 Node assertion은 허용 절 밖 텍스트가 HEAD와 동일함, 신규 외부 URL 없음, 일곱 수치 anchor가 병합된 근거와 일치함을 확인했다. 기존 평가 설계 보존 PASS.
- REFACTOR: 중복 구조 변경 없이 설정·출처·대조 모델·JPEG 조건의 표현만 보완했다. 수치와 표 의미를 직접 대조하고 diff 검사를 반복했다.
- npm.cmd test: PASS, 25 files / 790 passed / 1 기존 Windows FIFO skip, 19.02초(17:47:16 시작).
- npm.cmd run build, typecheck, smoke:mcp, validate:plugin, benchmark: 모두 exit 0. smoke/manifest 성공, benchmark passed=true.
- 빌드 번들은 빌드 전 bytes를 따로 보관하고 CRLF 정규화 내용이 같음을 확인한 뒤 원래 bytes로 복원했다. runtime·테스트·의존성·번들·기존 근거 노트·공유 HANDOFF·사용자 WBS 변경 없음.
- git diff --check PASS; git status --short는 허용한 연구 문서 2개와 신규 계획·Task 핸드오프만 표시했다.
- 실제 로그: 부모 checkout의 ignored .artifacts/task28-delivery-20261010/pre-pr/. 전체 gate는 이미지 실측 결과가 아니며 API/count-tokens/업로드는 수행하지 않았다.

## 11. 자체 리뷰와 남은 검증
- 정확성: 조건부 산술/실측/명목 예산을 구별하고 unknown과 거부 비교 불가를 유지했다. F-06 출처 근거는 부분 보완됐으나 WBS 5.1/5.6 실측은 남는다.
- 안정성·보안·성능: 코드·데이터·요청 경로 변경이 없는 문서 작업이며 기존 회귀 gate만 검증했다. 비밀은 읽거나 외부 검토에 전달하지 않았다.
- 유지보수성: 기존 출처 노트로 연결하고 논문·프로토콜의 평가 설계를 보존했다. 신규 외부 출처나 모델 선택은 없다.
- 남은 작업: 사용자 검토 및 승인 대기. Draft PR 생성, post-PR gate와 native Astra 최종 증거 검토를 완료했다. F-12 방향·실측·추가 직접 교차 검토 공백은 미해결이며 다음 Task는 승인 대기한다.

- Precommit native Astra: PASS WITH NOTES, Blocker/Major 0. 실제 수정 diff에서 Minor 4건 해소, 실제 6개 pre-PR 로그와 4개 문서 범위를 직접 확인했다. 빌드 stderr의 PowerShell NativeCommandError 표시는 esbuild 출력 포장이며 실제 exit 0과 Done을 확인했다.

## 12. Draft 전달 및 post-PR gate — 2026-10-10
- 내용 커밋: 37bdc0e98f7744d4e56088fba92eec4178865514. 승인된 네 문서만 stage/commit했고 hooks를 우회하지 않았다.
- push 직전 upstream은 origin/main이었다. git push -u origin codex/task-28-paper-evidence로 push한 뒤 origin/codex/task-28-paper-evidence로 확인했다.
- [PR #28](https://github.com/kimcheolhui9846/token-context-optimizer/pull/28): main 대상 OPEN/Draft, head가 내용 커밋과 일치했다. 저자와 committer는 기존 사용자 신원이며 Agent: codex trailer를 남겼다.
- Post-PR npm.cmd test: 25 files / 790 passed / 1 기존 Windows FIFO skip, 19.07초(17:52:10 시작). build/typecheck/smoke:mcp/validate:plugin/benchmark 모두 exit 0, benchmark passed=true.
- 고정 네 문서 검사 및 git diff --check PASS. 별도 Node assertion은 병합 기준 9aaf823에 대해 승인 절 밖 내용·기존 평가 설계 보존, 신규 외부 URL 없음, 일곱 수치 anchor 일치를 다시 확인했다.
- 번들은 정규화 내용 일치 후 빌드 전 bytes로 복원했고 git status --short는 CLEAN이었다. 실제 로그: 부모 ignored .artifacts/task28-delivery-20261010/post-pr/.
- Ready·merge 및 다음 Task는 수행하지 않았다. Native Astra는 실제 최종 증거를 검토하고 PASS WITH NOTES를 반환했다.

- 최종 Astra 첫 시도는 일부 읽기 검토 후 usage limit으로 중단돼 최종 판정을 받지 못했다. 사용자 재개 요청 뒤 같은 native gpt-6-astra 에이전트를 다시 실행했다. 중단된 검토를 성공으로 기록하거나 다른 모델로 대체하지 않았다.

## 13. 최종 Astra 판정과 전달
- 사용자 재개 후 실제 native gpt-6-astra 검토가 완료됐다: PASS WITH NOTES, Blocker/Major 0. 실제 연구 문서 diff, 네 파일 범위, 현재 handoff, 6개 post-PR 로그, PR 본문과 head/upstream 일치를 직접 확인했다. Minor 4건은 모두 해결됐다.
- 최종 기록 커밋은 이 핸드오프와 계획의 상태만 갱신한다. 연구 문서·코드·번들은 전체 post-PR gate를 실행한 37bdc0e와 같다. 기록 변경은 고정 문서 검사와 diff 검사로 확인하며 전체 테스트를 기록 커밋에서 다시 실행했다고 주장하지 않는다.
- 알려진 한계: 추가 직접 외부 호출 미수행(사용자 제공 Task 28 Claude 리뷰는 수신), F-12 방향 미결정, WBS 5.1/5.6 실측 및 품질·청구·지연 미측정, npm ci의 기존 잠금 의존성 취약점 4건 보고. 어느 항목도 해소된 것으로 표시하지 않았다.
- 다음 작업자는 PR #28의 최신 head와 이 기록을 확인한다. Task 28 Ready·merge 및 Task 29는 수행하지 않고 사용자 검토·승인을 기다린다.

## 14. 사용자 제공 Claude 리뷰와 승인된 후속 수정
- 입력: Desktop/codex_review_feedback_2026-10-10_task28-pr28.md. 사용자 제공 Task 28 전용 Claude Code 리뷰, 문서 표기 모델 claude-opus-5-5, 날짜 2026-10-10. 판정 Approve, Blocker 0/Major 0/Minor 3/Nit 2.
- 먼저 실제 문서와 기존 URL을 읽기 전용으로 대조하고 native Astra의 지적별 판단을 표로 보고했다. 사용자가 M-1~M-3, N-1~N-2 전체 반영안을 승인했다.
- 최신 허용 범위는 연구 문서 두 개와 이 Task 핸드오프 세 파일 및 PR 본문이다. 기존 계획의 절 제한보다 이번 사용자 승인이 우선하며 계획 자체·root/shared HANDOFF·WBS·코드·의존성은 수정하지 않는다.
- M-1 수용: 기존 노트 URL 11개만 논문 참고문헌 번호로 추가하고 본문 인용과 산술 상세 보조 링크를 연결한다. 확인일 2026-10-07은 기존 출처 기록이며 이번에 외부 문서를 재열람했다는 뜻이 아니다.
- M-2 수용: 정확한 비교 ID 세 개와 대조 ID 두 개를 정의하고 어느 쪽도 파일럿 선정이 아님을 명시한다.
- M-3 수정 수용: provider resize/rejection 설정 동결, calibration의 한도 초과 variant 수, A/D-fallback 실패 중 provider rejection 건수·분모·비율 보고를 추가한다. A/D만 거부될 수 있다는 전제는 채택하지 않고 품질 실패 분모·retry·primary 대비는 유지한다.
- N-1 수용: 논문 산술 수치를 세 열 표로 정리하고 프로토콜은 이를 참조한다. 양수/비거부 예제 한정, Gemini 명목/unknown, 거부 비교 불가를 보존한다.
- N-2 수용: 위 Claude 행과 PR 본문에 사용자 제공 리뷰를 기록한다. Codex의 직접 외부 호출 금지는 유지하며 이전 미수행 이력을 성공으로 바꾸지 않는다.
- RED: 문서 수정이므로 해당 없음. 사전 acceptance는 세 파일 범위, 기존 URL 집합 내 이동, 정확한 모델 ID, 숫자·평가 설계·분모 보존, 번호 인용/표/상대 링크 일치다. 구현은 실제 gpt-6-luna, 재검토는 gpt-6-astra로 진행한다.
- 반영 후 고정 네 문서 검사(계획은 읽기만), git diff --check, 수치 anchor 및 기존 설계 검사를 반복한다. 같은 브랜치의 fix(review) 커밋으로 전달하며 push 후 Draft 상태와 Astra 재검토를 확인하고 멈춘다.

## 15. Claude 리뷰 수정 검증
- M-1/M-2/N-1: 지정된 기존 URL 11개를 참고문헌 7–17로 옮겼고 원래 확인일을 승계했다. 모델 ID 5개, 7행 수치 표와 조건, 프로토콜의 논문 표 링크를 확인했다. 새 공급자 출처·계산·API 호출은 없다.
- M-3 초안에서 제출 요청 수를 비율 분모로 쓴 불일치를 root가 발견해 수정했다. 최종 문구는 각 A/full-original 및 D/original-fallback 그룹에서 n=provider rejection 실패 건수, N=전체 실패 건수이며 N=0은 undefined다. 기존 품질 분모와 retry 규칙은 유지한다.
- Native Astra가 실제 수정 diff를 재검토했다: Blocker/Major 0. calibration 시작 전 고정, held-out 유지, 배정된 원본 variant 집계, 공급자 한도와 guard 효과의 해석 구분을 확인했다. N-2는 사용자 제공 Claude 리뷰로 표시하고 직접 호출 이력과 구분했다.
- 고정 4문서 검사 PASS: 공백·최종 개행·fence·상대 링크. 계획은 읽기만 하고 수정하지 않았다. git diff --check PASS.
- 별도 Node anchor/범위 검사 PASS: 승인된 세 파일만 변경, 허용 절 밖 내용 및 기존 설계·분모 보존, 옮긴 URL 11개가 기존 노트 집합에 포함, 정확한 ID 5개·수치 anchor·17개 참고문헌 번호·논문 절 링크 일치. 일곱 수치와 65,535/30,000 한도를 기존 노트와 대조했다.
- 이번 수정본 전체 gate: npm.cmd test PASS, 25 files / 790 passed / 1 기존 Windows FIFO skip, 21.04초(22:26:42 시작). npm.cmd run build/typecheck/smoke:mcp/validate:plugin/benchmark 모두 exit 0, benchmark passed=true.
- 번들은 정규화 내용이 빌드 전과 같음을 확인한 뒤 원래 bytes로 복원했다. git status --short는 연구 문서 2개와 이 핸드오프만 표시했다. 로그: 부모 ignored .artifacts/task28-delivery-20261010/review-fix/.
- GREEN: 위 검증 통과. REFACTOR: 승인된 표 전환과 중복 수치 참조 정리만 수행했다. 기존 계획·공유 HANDOFF·WBS·코드·의존성은 변경하지 않았다. push 뒤 Draft 상태와 Astra 재검토를 확인한다.

- 수정본 precommit Astra 판정: PASS WITH NOTES. 실제 6개 review-fix 로그와 승인된 세 문서 diff를 직접 확인했으며 Blocker/Major 0이다.

## 16. 리뷰 수정 push 후 최종 Astra 검토
- 수정 커밋 d9daf856ad7deac3849b37ccdc9277fd04b88dcb를 push했고 HEAD, upstream, PR #28 head 일치와 OPEN/Draft, worktree CLEAN을 확인했다.
- 실제 native gpt-6-astra의 post-push 판정은 PASS WITH NOTES, Blocker/Major 0이다. 승인된 세 문서 diff, 다섯 지적 반영, 실제 review-fix 게이트 로그(790 passed / 1 skipped 및 나머지 검사 통과), 계획·코드·테스트·번들·의존성 무변경을 직접 검토했다.
- Astra가 지적한 PR 본문 표현을 정리했다: 프로토콜 범위를 §3/6/7로 갱신하고 36bf6c4의 상태 설명을 이전 전달 당시 기록으로 한정했다. 신규 출처가 없고 기존 URL 11개를 이전했음을 명확히 했다.
- push 뒤 고정 4문서 검사, git diff --check, 수치·URL·ID·참고문헌·범위·분모 anchor 검사를 다시 실행해 통과했다. 이 최종 기록 변경은 문서 검사로 검증하며 전체 게이트를 기록 커밋에서 재실행했다고 주장하지 않는다.
- 사용자 제공 Claude 리뷰와 native Astra 검토를 구분했다. API/count-tokens/업로드, Ready·merge·다음 Task는 수행하지 않았다. 기존 미측정 항목과 추가 직접 교차 검토 공백은 그대로 남는다.
## 17. 사용자 제공 Claude 재검토와 후속 승인
- 사용자 제공 Claude 재검토(2026-10-10): Approve, Nit 3. 문서 표기 리뷰어 Claude Code(claude-opus-5-5), 대상 86f29a0. 이전 M-1~M-3/N-1/N-2 해결, 새 Blocker/Major/Minor 없음. Codex 직접 호출 이력과 구분한다.
- 지적별 처리 표 보고 후 사용자가 전자(이번 PR 수정·검증 뒤 Ready·merge·다음 Task)를 승인했다.
- R-1: 기존 n/N 및 N=0 undefined를 유지하고 각 집단의 n / 배정 slot 수를 추가 보고한다. 모든 arm의 rejection 보고, 품질 분모·retry 규칙은 유지한다.
- R-2: §3 마지막 freeze 요약에 provider resize/rejection 설정을 포함한다.
- R-3: 논문과 참고문헌은 수정하지 않고 §6의 투고 전 체크리스트에만 기록했다.
- RED는 순수 문서 보완으로 해당 없음. 수용 기준은 두 국소 문장, 논문·수치·URL·ID·기존 평가 설계 보존과 고정 4문서 검사다. API/count-tokens/업로드·공유 HANDOFF·WBS·코드·의존성 변경은 없다.
- 검증: 고정 4문서 검사, git diff --check, 수치·URL·ID anchor 및 기존 설계 보존 검사 PASS. npm.cmd test 25 files / 790 passed / 기존 skip 1, 18.44초. build/typecheck/smoke:mcp/validate:plugin/benchmark 모두 exit 0, benchmark passed=true. 로그는 부모 .artifacts/task28-delivery-20261010/rereview/. 번들은 정규화 일치 확인 후 원래 bytes로 복원했다.
- 실제 native gpt-6-astra precommit 검토: PASS WITH NOTES, Blocker/Major 0. 두 파일 diff와 6개 실제 게이트 로그를 직접 검토했다.
