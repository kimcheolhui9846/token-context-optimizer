# Task 28 — 논문·평가 프로토콜의 토큰 비용 근거 보강

## 1. 작업 개요
- Task 28 / WBS 4.2: 기존 이미지 논문·평가 프로토콜에 Task 27의 출처 근거를 반영한다.
- 사용자 승인: 2026-10-09 PR #27 Nit 수정, Ready·merge 및 다음 Task 진행.
- PR #27은 9aaf8235bd7954ed7d9ff8d8855e5275c08efcea로 병합되었고 검증된 3612277과 파일 트리가 같다.
- 현재: codex/task-28-paper-evidence, 새 worktree; 기준 origin/main 9aaf823.
- 제외: F-12 논문 방향 확정, 새 계산·출처·데이터셋·런타임·의존성, API/count-tokens/업로드·실측, 사용자 WBS 및 공유 docs/agent/HANDOFF.md.

## 2. 계획과 수용 기준
- [x] Git 격리와 기존 상태 확인, 첫 산출물로 이 핸드오프 생성.
- [x] Astra 상세 계획·초기 검토 GO, 외부 제공자 검토 미수행/DEGRADED 기록.
- [x] Luna: 논문 §3.3/5/6, 프로토콜 §6/7의 근거·관측 경계 보강 및 Minor 수정.
- [x] 원문 표 수치·로컬 링크·범위 검사, pre-PR 전체 npm gate.
- [ ] commit/push/Draft PR, post-PR gate, Astra 최종 검토.
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
- Astra native 실제 실행으로 다음 Task 범위 분석 완료. 상세 계획 GO 및 구현 diff 검토 완료; 최종 증거 검토는 Draft PR 뒤 수행한다.
- Claude10-09 claude-opus-5-5 Approve는 Task27에 대한 사용자 제공 리뷰이며 Task28 리뷰로 재사용하지 않는다.
- 공급자 API 호출 금지 유지. 외부 모델 검토는 수행하지 않으며 근거 부족한 모델·quota를 성공으로 기록하지 않는다.
- 공식 산술 수치를 실험 성과나 전체 데이터셋 효과로 잘못 옮기는 위험을 최우선 검토한다.

## 6. 남은 작업과 승인 지점
- 위 계획 완료 후 Task28 Draft PR 및 최종 Astra 결과 보고에서 정지한다. Task28 Ready·merge나 Task29는 새 승인 전 수행하지 않는다.
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
- 외부 마일스톤 검토 상태: DEGRADED. 아래는 설치 확인과 실제 검토를 분리한 기록이다.

| 제공자 | 초기 계획 / 마일스톤 실제 수행 | 확인 범위와 미수행 이유 |
| --- | --- | --- |
| Claude Code | 미수행 / 미수행 | claude.exe 존재만 확인. Opus 5 실제 선택·실행·인증·quota 미확인, 외부 모델/API 호출 금지 유지. Task 27 사용자 리뷰는 재사용하지 않음. |
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
- 남은 단계: Draft PR 생성, post-PR 전체 gate 및 native Astra 최종 증거 검토. F-12 방향·실측·외부 교차 검토 공백은 미해결이며 다음 Task는 승인 대기한다.

- Precommit native Astra: PASS WITH NOTES, Blocker/Major 0. 실제 수정 diff에서 Minor 4건 해소, 실제 6개 pre-PR 로그와 4개 문서 범위를 직접 확인했다. 빌드 stderr의 PowerShell NativeCommandError 표시는 esbuild 출력 포장이며 실제 exit 0과 Done을 확인했다.
