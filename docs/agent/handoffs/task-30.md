# Task 30 핸드오프

## 1. 작업 개요

- PR: 미생성(작성 진행). 브랜치: `codex/task-30-protocol-decision-memo`. Base: `origin/main` / `67478ffc1fbcd2fce7f8cf31a265f5b2bad12e3c`(PR #29 merge).
- 목적: D1–D4의 선택지와 영향을 정리할 결정 메모. 값 선택은 사용자 권한이다.
- 현재 상태: 2026-10-12 재개 후 완료된 Claude 초안을 복구·대조하여 결정 메모를 생성했다. 독립 마일스톤 major 3건과 후속 minor 보정을 완료했다. 한정 재검토는 SPEC PASS / QUALITY PASS WITH NOTES(blocker·major 0), 최종 문서 검사 후 commit·push·Draft PR 전달 단계다. PR은 아직 없다.
- 범위: 새 계획, 새 결정 메모, 이 핸드오프의 최종 3개 문서만. 공유 HANDOFF/WBS/Task 29/프로토콜/논문/코드/테스트/의존성 선언 변경 금지(승인된 npm ci 설치만 수행).
- 적용 지침: 사용자 Task 30 지시와 전역 하네스. 상위 Desktop AGENTS의 Kaggle 전용 학습/실험 절차는 이 저장소에 적용하지 않으며, 한국어·승인·Conventional Commits·trailer 규칙은 유지한다. 구체적 Task 지시대로 공유 HANDOFF는 수정하지 않는다.

## 2. 작업 계획

- [x] origin/main 병합 SHA 확인 및 새 worktree 격리.
- [x] 계획과 수용 기준 작성, Claude Code 초기 계획 교차 검토 및 한정 재검토.
- [x] 계획 보고 후 사용자 조건부 승인 수령 및 지적 반영.
- [x] 승인된 npm.cmd ci 설치, 전체 baseline 생략(NOT RUN), 별도 Claude 작성 실행으로 메모 초안 작성.
- [x] 문서 검사·scope 검사·독립 마일스톤 검토 및 Astra 사전 전달 검토.
- [ ] Agent trailer 포함 commit/push/main 대상 Draft PR 및 head 일치 확인 후 중지.

## 3. 변경 사항

- 생성: [계획](../../superpowers/plans/2026-10-11-image-protocol-decision-memo.md), 이 핸드오프, [결정 메모](../../research/image-protocol-decision-memo.md).
- 기존 추적 문서 변경 없음. Task 29 병합 이후 해당 브랜치와 핸드오프를 수정하지 않는다.

## 4. 주요 의사결정

- 사실·조건부 도출·권고(승인 전)·사용자 결정 필요를 분리한다. 선택 조합의 수는 실험 횟수가 아닌 문서상 필요 연산 집계다.
- baseline 예외: 기존 JPEG 테스트가 encoder를 호출함을 알렸고 사용자는 **기존 테스트 내부 encoder 호출만 허용하고 전체 baseline 1회 실행**을 선택했다. 새 encoder probe/실험은 금지다.
- 최신 사용자 결정이 위 이전 예외를 대체한다: npm.cmd ci 승인, baseline 전체 생략. Draft 이후도 문서와 Git/PR 검증만 반복한다.

## 5. 테스트 및 검증

- RED: 해당 없음 — 문서 Task이며 승인 전 수용 기준과 문서/scope 검사를 정의한다.
- Git 기준점/격리: PASS, base 67478ff의 새 worktree. 기존 루트의 untracked .omx/는 보존했다.
- `npm.cmd ci`: exit 0, 61 packages 설치. package.json/package-lock.json SHA-256 전후 동일, tracked diff 없음. fast-png 8.0.0/jpeg-js 0.4.4가 worktree에 설치됨.
- 설치 출력 주의사항: 자동 audit 요약 4건(1 moderate/1 high/2 critical), esbuild 0.28.2 postinstall allow-scripts 미승인 경고. 세부 취약점 조사/수정 및 스크립트 추가 승인 실행은 하지 않았다. 설치 성공은 테스트 성공/전체 install script 실행 완료를 의미하지 않는다.
- 전체 npm gate: NOT RUN — 사용자 명시 결정으로 baseline 생략. 과거 Task 결과를 이번 실행으로 인용하지 않는다.
- 문서 형식/상대 링크 검사 통과. 초기 scope 검사에서 리뷰 scratch가 untracked로 잡혀 실패했으며 완료된 scratch를 기존 ignore 대상 .artifacts/task-30-plan-review로 이동했다. 이동 후 계획 단계 검사에서 두 신규 문서 범위를 확인했다. 아래는 재개 후 메모 생성 단계 결과다.
- 재개 후 고정 문서 검사 `node .artifacts/task-30-plan-review/verify-docs.cjs final`: PASS(3개 신규 문서). 첫 실행에서 내부 X9/X10 표기가 파일 링크로 해석되어 FAIL, 해당 표기만 일반 텍스트로 고친 뒤 PASS. `git diff --check`, `git diff --cached --check`: PASS. 명시 집합 76개 개수 일치, 결정란 16개 공란, U 21개/X 10개 중복 없음. 이 숫자는 1차 마일스톤 대상 초안의 검사 결과이며 수정 뒤 다시 검증한다.
- package/lock 설치 전 hash 일치, 프로토콜·논문·Task 29 분석/핸드오프 hash 일치, 이동된 사용자 리뷰 원문 hash 일치. BOM 없는 UTF-8 검사를 통과했다. 리뷰 diff 캡처의 BOM은 PowerShell Out-File의 캡처 파일에만 붙었으며 공개 문서 내용이 아니다.

## 6. 오류 및 해결 기록

- Windows exec helper setup 오류로 첫 읽기 실패. 승인된 PTY escalation으로 재실행 성공. 모든 Windows exec는 tty:true/login:false를 사용한다.
- 인증 확인 원문에 계정 식별 정보가 포함됐다. 공개 산출물·외부 리뷰 prompt에는 복사하지 않고 비식별 실행 계정 역할과 인증 성공 여부만 기록한다.

## 7. 교차 검토

### 하네스 직접 호출 — Claude Code 계획 리뷰

- 실행 계정: 사용자 로컬 Claude Code의 인증된 claude.ai 계정(개인 식별자 비기재). CLI 2.1.296 실행/인증 확인. 별도 리뷰 실제 modelUsage가 claude-opus-5-5이고 정상 성공 응답임을 확인했다. 설치·인증만으로 가용성을 주장하지 않는다.
- 요구 모델: claude-opus-5-5. 별도 no-tool 읽기 전용 실행에 최소 비민감 계획·근거 발췌만 제공한다. 실제 modelUsage와 성공 여부를 확인한다.
- 초기 결과: SPEC/QUALITY 조건부 통과, blocker 0 / major 6 / minor 7 / note 3. 아래 판단을 계획에 반영하고 한정 재검토한다. 작성 실행과 리뷰 실행은 구분한다.
- M1 수용: 2–4 선택지를 충족하지 못하면 미충족/사용자 결정 필요로 남기고 완료하지 않음.
- M2 수정 수용: baseline 재실행은 재승인 전 금지. 의존성 설치는 필요 시 별도 조사·보고로 한정(계획 검토 당시 미설치; 이후 P-2 사용자 승인으로 npm ci 수행).
- M3/M4 수용: downscale-only 목표와 조건간 동일값을 D2 하위 필드로, 원문의 preset/후보 문맥 차이를 AC1에 명시.
- M5 수정 수용: 후보 집합과 slot 선택을 분리. 리뷰의 B 고정 변환 단정은 원문이 고정성을 명시하지 않으므로 채택하지 않고 고정 여부를 선택 제안으로 남김.
- M6 수용: 조합 ID/전체 곱·동치 기준/필수·조건부·미정 집계, 발췌 패키지 경계를 고정.
- m1–m7 수용: 기존 테스트 예외 표현, FF00 관찰 한계, 일곱 영향 축, D4 중복, 권고 없음 표기, 일반/정확 preset 행 분리, 파일별 링크 기준 보강.
- n1: commit/push/Draft는 사용자 Task 30 지시 4에 이미 포함, 계획 승인 후 범위로 유지. n2/n3: 의존성 경로와 사용자 지시 우선·차이 보고 반영.
- 리뷰어는 제공된 발췌만 확인했다. Astra는 추가 원문을 직접 열람했고 재검토 패키지에 관련 누락 발췌를 보완했다.

- 한정 재검토: 별도 claude-opus-5-5 정상 호출, SPEC 통과 / QUALITY 통과(비차단 minor 2), 새 blocker/major 0. M1–M6/m1–m7/n1–n3 해결 확인. e1 baseline 실패 시 중지·단일 명령 재실행 재승인, e2 분류 병합 전 경우를 계획에 반영했다. 두 문구는 Astra가 직접 대조했고 추가 모델 재검토는 하지 않았다.
- Astra 계획 판정: PASS WITH NOTES. 미확정 D 값/구현 순서 유지, baseline NOT RUN(당시 승인 후 예정; 최신 결정으로 생략), no-tool 발췌 기반 리뷰 한계. 사용자 제공 계획 리뷰/승인 전 메모 작성하지 않음.

### 사용자 제공 리뷰

- Task 30 사용자 제공 계획 리뷰: 2026-10-11 수령, claude-opus-5-5, 조건부 승인(Blocker 0 / Major 1 / Minor 4 / Nit 2). Task 29 리뷰를 Task 30 리뷰로 재사용하지 않는다.

- 읽기 전용 원문: 주 저장소 루트의 `codex_review/codex_review_feedback_2026-10-11_task30-plan.md`(Desktop에서 이동됨). 원문을 수정·이동·커밋하지 않는다. 하네스 no-tool 계획 리뷰와 다른 실행이며 같은 모델이다. 사용자는 추가 계획 재검토 없이 반영 후 작성하도록 허용했다.

| 지적 | 판단·조치 |
| --- | --- |
| P-1 Major | 수용. 조건×arm identity/부분 identity와 D−C/C−B/D−A 해석을 AC4/AC5에 추가. resize identity와 전체 변환 identity를 구분하고 q75 재인코딩을 identity로 보지 않음 |
| P-2 Minor | 사용자 결정: npm.cmd ci 승인 및 baseline 생략을 함께 적용. 이전 baseline 1회 계획 대체, 테스트 성공 주장 없음 |
| P-3 Minor | 수용. 마지막 결정 표 앞에 잔여 결정과 첫 연산 판단 최소 결정 집합을 추가 |
| P-4 Minor | 수정 수용. 한 화면 요약 및 민감도 필터. 연산 존재에는 무관해도 identity/exact preset 구분에 영향 있는 필드는 overlay로 보존 |
| P-5 Minor | 수용. 현행 ingest 범위의 원본 format 유지(혼합) 선택지와 D1↔D3 PNG canonical 의존 추가. 실제 dataset 형식 혼합으로 단정하지 않음 |
| N-1 Nit | 수용. 검사 스크립트를 계획 본문에 포함하여 PR에서 재현 가능 |
| N-2 Nit | 수용. D3 대안 부족 시 미충족 보고·사용자 지시 대기 명시 |

### 하네스 직접 호출 — 작성 및 마일스톤 검토(2026-10-12 재개)

- 복구 작성 응답의 우려: 손계산 조합·집계, 미확정 D3 배정, 능력 요구와 실제 호출 차이, 추가 하위 필드/가정, 일반/정확 연산 분리, JPEG 재압축/no-op, 형식 동치, encoder 증거 경계, reference 링크. Astra가 전체 초안을 읽고 원문과 대조했다.
- 작성자 1차 보정 요청의 8개 논점: identity/대비 단정, preflight와 failure 구분, 예비 결정 집합의 누락, 검증되지 않은 동치 개수, 능력 요구·실제 호출 및 출력 encode 분리, A/fallback 보존과 원천 이력, 회계 외삽 방지, D3를 사실 아닌 제안으로 표시. 별도 claude-opus-5-5 정상 응답의 74개 치환을 각 1회 일치 확인 후 반영했다.
- 독립 마일스톤: 작성자와 별도 claude-opus-5-5 정상 호출. SPEC CONDITIONAL PASS(major M1), QUALITY CONDITIONAL PASS(major M2/M3), blocker 0, minor m1–m13. 당시 수정 필요 판정이며 아래 보정 후 한정 재검토한다.
- M1 수용: 현재 상태·검사 phase·계획 체크와 baseline 표기를 동기화.
- M2 수용: rule-level decode 능력 요구와 no-op 실제 호출을 일관되게 구분하고 E의 decode 중복 계산을 없애도록 작성자에게 반환.
- M3 수용: crop 출력 format U10은 D3 일부 배정에서 풀리므로 부분 해소로 정정하고 12/7/2 집계를 재검증하도록 반환.
- m1–m3/m5–m13 수용: JPEG 자원 상한, guard-accept 입력 동일성, 행 개수, 증거 범위 표현, stress cap 가정, 인용 주체, 표 분리, D4 하위 영향/quality overlay, 잔여 ID, 결정 제약, 기록 시제, 사실/도출 표기를 보강.
- m4 수정 수용: S-set의 조합 후보는 원문 사실이 아니라 사용자 선택을 위한 구체 제안이다. 포함이 미승인 제안임과 표가 가정한 집합을 명시하며 미정 사실로 몰래 확정하지 않음.
- note 처리: 실제 distinct 분류 수와 명목 조합 수를 구분, 원문/입력 계약 적용의 가정 및 최소 집합의 한계 보강. 리뷰어는 도구 없이 diff/발췌만 봤으며 실제 검사·로그/Git/modelUsage는 Astra가 확인한다.

- 재개 수정 결과: 정확 claude-opus-5-5 정상 응답의 실제 83개 치환(응답 요약의 81건 표기는 오기)을 각각 1회 일치 확인 후 반영했다. M2는 수정 수용: 작성자가 지적한 O3/O4 배타 귀속과 X1의 모순을 Astra가 확인해 B의 개별 O4 셀은 미정(X1)으로 정정했다. B × JO/CB의 decode 능력 필요 자체와 귀속 미정을 분리한다. X4는 실제 호출만 바꾸며, E는 O3에만 센다. M3 집계는 12/7/2로 정정했다. D4 quality/profile 분리로 결정란은 17개다.
- 수정 후 검사에서 내부 §8 참조의 잘못된 파일 링크 표기 및 결정 표 뒤 주석을 발견했다. 참조를 일반 텍스트로, 주석을 표 앞으로 옮겼다. 검사기의 ID 파싱도 정정하고 계획 본문 코드와 동기화했다. 최종 재검사 결과: verify-docs final PASS(정확한 세 신규 문서), verify-memo PASS(명시 집합 101개, 결정란 17개 공란). 보호 대상/설치 전 package/리뷰 원문 hash 모두 일치. 후속 minor 보정 뒤 같은 검사를 재실행한다.

- 한정 마일스톤 재검토: 별도 claude-opus-5-5 정상 호출, SPEC PASS / QUALITY PASS WITH NOTES, blocker 0 / major 0 / minor 6. M1–M3와 m1–m13 해결 확인. 같은 모델의 별도 실행이며 다중 모델 합의가 아니다. 리뷰어는 제공 문서와 일부 원문만 확인했고 명령은 실행하지 않았다.
- R1–R6 처리: 현재 시제/101개 집합·17개 결정란 기록, 출처 목록에 프로토콜 §8/§9와 논문 §5 보완, O9/O10의 X3 보완, fixture 표현을 독립 fixture로 정정, DO/CB의 변환 후 accounting 상한 조건 통일, PC-out에서도 S-set 제안 pool의 PNG canonical 구성원 유지 명시. 선택적인 동일 O4 행 병합은 미반영(조합 열쇠를 유지). Astra가 원문과 정정 diff를 직접 확인했으며 이 minor 보정만의 추가 Claude 호출은 하지 않았다.

### 작성·최종 검토 계정과 모델

- 계획/핸드오프 작성 및 최종 검토: 현재 사용자 Codex 세션, 실제 runtime model gpt-6-astra 확인. 개인 계정 식별자는 공개 문서에 쓰지 않는다.
- 재개 세션(2026-10-12): 실제 runtime model `gpt-6-astra` 확인. 사용자 Codex 세션으로 계정 식별자는 기록하지 않는다. Astra 단계 대체·보류는 필요하지 않다.
- 메모 작성: 중단 전 별도 Claude Code / claude-opus-5-5 완료 응답을 재개 시 발견했다. subtype success, is_error false, modelUsage 정확 일치. 결과는 DONE_WITH_CONCERNS였다. 원문과 전체 초안을 대조해 8개 논점의 보정을 요청했으며 재개 후 같은 정확 모델 정상 호출의 74개 치환을 검증·반영했다. reference-style 링크는 controller가 동일 대상 inline 링크로 기계 변환했다. 실제 파일·집계·독립 리뷰 확인을 완료했으며 최종 Git/PR 검증은 전달 단계에서 수행한다. Claude 호출 불가 시에만 정확 Codex 6 Terra 가용성 확인 후 대체하며 둘 다 불가하면 구현 BLOCKED.
- Codex 6 Terra: NOT RUN, 폴백 사유 없음.

## 8. 자체 리뷰

- 정확성: 원문에 없는 수치/프로필/arm 배정을 채우지 않는다. 모든 미정 칸이 D1–D4만으로 해소되는 것은 아니다.
- 안정성/보안/성능: 런타임 변경 없음. 외부 조사·실험·hosted 평가·count-tokens 없음. 로컬 baseline은 연구 증거가 아니다.
- 유지보수성: base 고정 인용과 명시적 파일 allowlist를 사용한다.

## 9. 남은 작업

- [x] 계획 리뷰 결과 반영.
- [x] 사용자 계획 조건부 승인 및 지적 반영.
- 승인 후 메모·검증·Draft PR 전달. D1–D4 값 선택과 프로토콜 개정은 별도 승인/Task다.
- F-12, 파일럿 모델, 첫 연산 순서는 확정하지 않는다.

## 10. 사용자 승인 필요 사항

- 현재 승인: 지적 반영 후 메모 작성·검증·commit/push/Draft PR, npm.cmd ci 설치, baseline 생략.
- 아직 미승인: D1–D4 값 선택 및 프로토콜 개정, Ready/merge/다음 Task.
- Ready/merge/다음 Task는 별도 사용자 지시가 필요하다.

## 11. 현재 요약

- Task 29는 PR #29 merge 완료 상태를 새 Task의 base로만 참조한다. 그 이력을 수정하지 않는다.
- 계획 조건부 승인 및 지적 반영 완료. 승인된 설치 완료, baseline NOT RUN. 중단 후 2026-10-12 재개하여 보존된 초안을 전체 재검증했다. 독립 리뷰 major를 해결하고 minor를 보정했다. Draft PR 전달과 최종 Git 검증 뒤 멈춘다.
