# Task 31 핸드오프

## 1. 작업 개요

- 목적: 확정된 사용자 D1–D4 결정과 평가 프로토콜을 정합화하고 Draft PR로 전달한다.
- 상태: **Task 31 구현·문서 검증·독립 리뷰·push·Draft PR 전달 완료. 최종 Astra PASS WITH NOTES, blocker/major 0. Draft 유지 및 사용자 검토 대기.**
- 브랜치: `codex/task-31-protocol-decisions`. Base: `origin/main` / `65347d4aad46f92c166d8720bb705303a337da78`. PR: [#31](https://github.com/kimcheolhui9846/token-context-optimizer/pull/31), OPEN / Draft.
- 선행 이력: Task 30 보정 `14867ada3740e4f7195f9ca7c472f9577e143d34`, main 병합 `65347d4`. Task 30 핸드오프와 계획은 수정하지 않는다.
- 현재 산출물: 신규 계획·이 핸드오프, 개정된 결정 메모·프로토콜. 공유/루트 HANDOFF와 WBS는 수정하지 않았다.
- 승인 후 변경 범위: 위 두 신규 문서와 [결정 메모](../../research/image-protocol-decision-memo.md), [프로토콜](../../research/image-first-evaluation-protocol.md)만. 논문, Task 29/30, 코드·테스트·패키지·데이터·설정은 제외한다.
- 적용 지침: 사용자 Task 31 지시와 하네스 우선. Windows 실행은 `tty:true/login:false`; 권한 helper 실패 시 승인된 숨김 PTY 경로를 이용하며 새 터미널을 열지 않는다. writing-plans 스킬 적용. Kaggle 전용 실험 지침은 해당 없음.

## 2. 작업 계획

- [x] base/clean worktree 확인, 계획 전용 범위 설정.
- [x] 사용자 결정, 보존할 평가 규칙, 남은 승인 선택을 정리.
- [x] 계획과 관련 원문에 대한 별도 Claude Opus 5.5 초기 교차 검토(controller 담당). SPEC/QUALITY CHANGES REQUIRED, blocker 0 / major 5를 계획 보정에 반영.
- [x] 보정 계획의 한정 독립 재검토: SPEC/QUALITY PASS WITH NOTES, blocker/major 0.
- [x] 계획 문서 검사 후 사용자 검토를 위해 중지.
- [x] 2026-10-12 사용자 계획 승인과 다섯 선택 확인(사용자 제공 리뷰 P1/P2/N1 포함).
- [x] 사용자 계획 승인 후에만 메모·프로토콜 수정, 독립 마일스톤 검토, 문서 검증.
- [x] 승인된 Task 브랜치 commit/push/Draft PR, 이후 재검증 및 최종 Astra 판정.

## 3. 변경 사항

- 현재 변경: 신규 계획·핸드오프와 기존 결정 메모·프로토콜, 정확히 네 파일.
- 2026-10-12 승인 후 구현(1차 작성): 메모 L3 상태문, §11 사용자 결정 17칸, 표 뒤 결정 기록. 프로토콜은 계획 §1 hunk 경계(교체 L42–45, L48–49, L55–59, L69–72, L80–82, L93–96, 삽입 L5/41/51/89/149 뒤)만. 계획은 승인 상태, P1 유지 문장 목록, P2 고정 순서, §7 선택 결과. base 대비 허용 hunk·보존 검사와 P-1 문장 검사는 controller 실행에서 PASS했다.
- 사용자 결정일: 2026-10-12. 17필드의 정확한 값은 계획 §2에 보관한다. q50/1024는 근거로 최적화한 값이 아니라 사용자 선택의 calibration 잠정값이다.
- 코드 RED 해당 없음: 문서 전용 작업이다. 구현 전후 문서/범위/불변량 비교를 수용 검사로 정의하며 테스트 성공을 꾸미지 않는다.

## 4. 주요 의사결정

- A-cap은 DO/CB 모두 같은 긴 변 상한 표현으로 승인됐다. 혼합 표현은 다루지 않으며 다른 표현으로 바꾸면 재도출한다.
- 합성 clean은 직접 만든 손실 이력 없는 RGB PNG 원천 파일을 그대로 사용(K-n). 긴 변은 `1536 < L <= 2528`, 사용자 확정 기준값 2048. 정확한 width×height 목록과 family별 배정은 아직 선택하지 않았다.
- 2528 상한의 근거는 과거 flat fixture의 JPEG accounting 경계 관찰이다. controller가 현 validator table 상한 2112와 차원 항의 단조성으로 총 accounting 상한 134208576, 한계까지 여유 9152를 순수 Node 산술로 확인했다. 과거 table 항 580을 보편 상수로 쓰지 않는다. 임의 encoder·내용·q50 출력의 수락, encoded 크기, 실제 RSS, 효과를 보장하지 않으며 encoder는 실행하지 않았다.
- 후보 1536/q75와 입력 stress 1024/q50을 분리한다. 12 calibration family에서 잠정값을 확인하고 변경 시 값/이유를 기록한 뒤 held-out 전에 최종값을 한 번 freeze한다. held-out을 보고 조정하지 않는다. 이 Task에서 calibration을 실행하지 않는다.
- Task 30의 ‘17 공란/결정 표가 마지막’ 규칙은 해당 Task의 이력이다. Task 31 구현 승인 후 17개 결정값과 표 아래 날짜·선택 결과 기록으로 명시적으로 대체한다. 과거 계획/검사기를 고치지 않는다.
- 2026-10-12 사용자 선택: PNG canonical은 이름을 유지하고 S-same/PC-out에서 arm 출력 비활성 항목으로 표시한다. 정확한 clean 치수와 family 배정은 이후 생성 Task에서 사용자 승인 뒤 확정한다(범위 1536 < L <= 2528, 기준값 2048 고정).
- fallback rate 최소 정의를 지금 확정했다. 분자는 D slot 중 guard가 fallback을 선택한 수, 분모는 D 배정 전체 144와 조건별 36이다. guard 결정이 없는 slot은 분자에서만 제외하고 수를 따로 보고하며 분모에 남긴다. primary D−C와 함께 보고하고 rejection의 n/N, n/S와 구분한다. slot 제외나 primary 조정은 없다.
- 고정 순서(P2, 사용자 결정): stress recipe를 먼저 고정하고 그 recipe에서 guard를 조정한다. 이후 stress가 바뀌면 최종 값에서 guard를 다시 확인하고 held-out 전에 함께 freeze한다. calibration 검증 기준은 미정이며 실행 전 사용자 결정, 값 변경은 사전 사용자 승인이다.

## 5. 테스트 및 검증

- 실제 수행: 계획 작성 전 `git status --short` 빈 출력, `git rev-parse HEAD` = base. 메모 §6.4/§6.5/§7, 프로토콜 §2–§9, 논문 대상 문장을 읽었다.
- `node .artifacts/task-31-plan-review/verify-plan.cjs`: Astra 작성 실행에서 PASS(두 신규 문서, 기존 결정란 17개 공란, errors 0). 이는 계획 전용 검사이며 향후 채워진 결정값의 gate가 아니다. 보호 hash 검사는 controller의 실제 수행 결과를 별도로 기록한다.
- 계획 단계 이력(controller 확인): 보호 파일 10개 SHA-256 일치, 기존 메모/프로토콜/논문/Task30 등 변경 없음. 계획 checker의 trailing whitespace 직접 검사에 conflict marker·UTF-8 replacement character·표 열 수 검사를 보완했다. `git diff --check` exit 0은 두 신규 untracked 문서를 검사하지 않는 tracked-only 빈 결과이며 신규 파일 품질 증거가 아니다.
- npm baseline/gate: **NOT RUN — 2026-10-12 사용자 결정으로 생략.** 계획 단계에서도 실행하지 않았다. Task 30 예외의 자동 승계가 아니라 이번 Task의 명시 결정이다.
- 구현 단계 문서 검사: `node .artifacts/task-31-plan-review/verify-implementation.cjs implementation` PASS(260항목, 17결정값, errors 0). Astra도 `astra-pre-pr` 단계로 재실행해 PASS. 구현자는 명령을 실행하지 않았으며 검사는 controller와 Astra의 실행이다.
- 의존성 설치, 실험, encoder/probe, 이미지 생성, hosted/count-tokens, 외부 조사: NOT RUN, 이번 범위에서 금지.

## 6. 오류 및 해결 기록

- 새 구현 오류 없음. 읽기 도구는 승인된 PTY 실행으로 수행했다. `rg --files`의 instruction 파일 검색 exit 1은 일치 파일 없음이며 문서 검사 실패가 아니다.
- 계획 보정 후 checker가 내부 X7/X10 괄호를 Markdown 파일 링크로 해석하여 FAIL했다. 파일 링크가 아닌 내부 식별자 텍스트로 보정하고 같은 `verify-plan.cjs`를 다시 실행해 PASS(errors 0, 기존 결정란 17공란 보존)를 확인했다.
- 2528 accounting 해석, fallback rate 분모, 선택 조합의 crop/no-op 의미는 과장 위험으로 계획에 별도 경계를 두었다.

## 7. 다중 모델 교차 검토

- Astra 계획 작성: 부모가 지정한 별도 native 실행. 실제 라우팅 증거는 controller가 관리하며 역할명만으로 모델 가용성을 증명하지 않는다.
- Claude Opus 5.5 초기 계획 검토: controller가 별도 실행 성공과 실제 modelUsage/canonicalModel `claude-opus-5-5`, provider `firstParty`를 확인했다. SPEC CHANGES REQUIRED(major 2), QUALITY CHANGES REQUIRED(major 3), blocker 0 / minor 12 / note 4. 비민감 계획·원문 발췌 기반이며 리뷰어는 도구·검사를 실행하지 않았다.
- 실제 사용량(controller 확인): input 2 / output 15933 / cacheRead 0 / cacheCreation 53149 / thinking 12411 / web 0, 비용 USD 0.74386. 별도 성공 응답이지 설치·로그인만의 가용성 주장이 아니다.
- Astra 실행은 중간 usage-limit 중단 후 사용자 재개 지시에 따라 한 번 재시도하여 계획 작성과 보정 응답을 완료했다. 이는 계획 작성자의 검토이며 독립 자기 리뷰로 세지 않는다. 실제 모델 라우팅은 controller 증거를 따른다.
- Codex 6 Terra: 미수행. Claude 불가일 때만 정확 모델·역할 가용성 확인 후 폴백한다.
- 사용자 제공 Task 30 PR 재검토는 선행 리뷰이며 Task 31 초기 검토를 대신하지 않는다. 해당 원문 수정·이동·커밋 금지.
- 아래는 초기 검토에 대한 판단이며, 이후 한정 재검토와 최종 명확화 기록을 이어서 구분한다.

| 지적 | 판단 / 반영 |
| --- | --- |
| M1 major | 수용. 메모는 base L3 banner, L596–612 사용자 셀 17개, L612 뒤 append만 수정하도록 제한. 나머지 역사적 미승인/미정 문장을 byte-identical 유지하고 banner/append로 적용 시점을 구분. checker에도 전체 hunk 경계 대조 요구 |
| M2 major | 수용. calibration 검증 기준은 미정, 실행 전 사용자 결정. 어떤 값 변경도 사전 사용자 승인, D2-b·T<1536·치수 부등식·accounting 재검토. 계획 §7에 기준 결정 항목 추가; 기준을 발명하지 않음 |
| M3 major | 부분 기시행 확인 후 보완. 기존 checker는 이미 untracked 문서 trailing whitespace 검사. controller가 conflict marker·표 열 수를 추가했고 git diff exit 0의 무효 범위를 명시 |
| M4 major | 명확화로 수용. 이전 가능성 문장을 모든 조건의 동일성 주장으로 보지는 않지만, 선택 조합에서는 C JPEG와 CL/DO PNG bytes가 다름을 명시. JO/CB JPEG에서만 일치 가능성 미배제·미측정. 기존 필요조건/충분조건과 X9 수학적 해석 유지 |
| M5 major | 수용. clean PNG의 제한 프로필·ancillary 금지·encoded 10MiB도 X7/X10 검증 필요. JPEG accounting 여유와 분리 |
| m1–m4 minor | 수용. §3 끝 L89와 paired 단위 보존, 준비 resize와 arm resize identity 구별, §1 freeze 목록은 유지하며 §2에서 calibration 실행별 고정(R3에서 철회)/최종 freeze 구분, X1/X2는 날짜 있는 추가 사용자 결정으로 기록 |
| m5 minor | 부분 수용. D3.4a 셀의 arm 비활성 도출은 append로 이동. D4.3/4.4의 N/A와 PNG 사유는 조건부 필드 비적용의 사용자 결정이므로 유지; 새 codec 값으로 쓰지 않음 |
| m6 minor | 수정 수용. 사용자 확정 기준값 2048 자체를 재승인 대상으로 만들지 않음. 운영 의미와 실제 width×height 배정은 아직 정하지 않았다고 명시하고 생성 Task에서 구체화 |
| m7 minor | 수용. CB가 clean에서 직접 파생된다는 P1은 기존 메모 L310의 집계 가정이며 새 사용자 승인으로 단정하지 않음. 실제 경로 증거 X7 잔여 |
| m8–m10 minor | 수용. estimateMemory L250–253 인용, 안전 threshold 미검증 문구의 q50/1024 적용, primary metric 불변 및 fallback rate는 병기일 뿐 제외/조정/공변량이 아님 |
| m11–m12 minor | 수용. 정확 plan 경로 및 scratch의 worktree 기준 명시. 논문 후속 목록은 비전수 목록으로 표시 |
| n1 note | 수용. 2112는 보수적 표 상한이며 단조성은 해석적 도출, 스크립트는 2528² 산술만 확인. 실측/codec 검증 아님 |
| n2 note | 수용. C/D O4 조건부와 E O4 불필요(O3 귀속) 명시 |
| n3 note | 수용. protocol L4–5 뒤 임시 논문 불일치 주석은 계획 승인 범위에 명시 포함하며 아직 적용하지 않음 |
| n4 note | 확인. PNG 이름·정확 치수·npm gate·선택적 fallback 수식은 미승인 제안 상태. 2048 자체는 이미 승인됨 |

- 리뷰 발췌 한계: F1 정의는 메모 §6.2 원문에서, R1/Task30 이력 분리는 이 핸드오프에서 직접 확인 가능하다. controller는 재검토에 필요한 누락 발췌만 보완한다. 전수 분류·논문 전체 영향 조사·실제 codec 검증은 주장하지 않는다.

### 한정 계획 재검토와 최종 문구 정리

- 별도 Claude Code 성공 응답의 실제 모델 `claude-opus-5-5`/provider `firstParty`를 controller가 확인했다. SPEC PASS WITH NOTES / QUALITY PASS WITH NOTES, blocker 0 / major 0. 초기 M1–M5 해결 확인. 리뷰는 계획에 한정되며 사용자의 남은 선택을 승인하지 않는다.
- 실제 사용량(controller 확인): input 2 / output 9951 / cacheRead 0 / cacheCreation 64552 / thinking 7609 / web 0, 비용 USD 0.715444. 리뷰어는 검사 명령을 실행하지 않았고 checker PASS는 controller/Astra 실행 근거다.

| 잔여 지적 | 판정 / 마지막 보정 |
| --- | --- |
| R1 minor | 수용. 미응답 선택은 종속 수정/검사만 보류, 권고 자동 적용 금지. 이미 승인된 2048 및 향후 commit/push/Draft는 재승인 불필요. 현 계획 검토 전 중지 유지 |
| R2 minor | 수용. 원문 대조 후 프로토콜 교체 구간과 삽입점(L5/41/51/89/149 뒤), 보존 구간을 명시. 특히 L145–149와 L151–175 원문은 보존하고 N-09/N-10는 L149 뒤 삽입 |
| R3 minor | 수정 수용. 앞 보정의 §1 per-calibration-run 해석을 철회해 기존 freeze 목록은 그대로 두고 요청된 stress 잠정값/held-out 전 freeze만 기술. L3/논문 상태 주석은 계획 검토 범위 명시. 기존 transport 지시를 다시 승인받지는 않음 |
| R4 minor | 수용. L3 교체에도 F-12·모델·첫 연산 미선택과 손계산/비실측 한계 유지 |
| R5 note | 수용. B crop 없음으로 선택 조합 O1/O2/O3 불필요 명시, 일반 표는 보존 |
| R6 note | 수용. 프로토콜 변환 arm 목표 q75 P-in 및 실제 encoder 적합성 X9 미검증을 구현 단계에 명시 |
| R7 note | controller가 CRLF/LF를 나눠 marker를 검사하고 git diff 검사 예외를 JSON errors에 기록하도록 보강. 마지막 Astra 직접 verify-plan 실행 PASS(errors 0, 기존 17공란) |

- 위 국소 문구 정리 뒤 추가 Claude 호출은 하지 않는다. Astra가 실제 두 문서와 검사를 확인하고 계획 체크포인트만 판정한다. 구현 완료나 최종 Task 전달 판정이 아니다.
- 최종 계획 체크포인트: Astra PASS WITH NOTES. 직접 `verify-plan.cjs` PASS, Git status는 두 신규 계획 파일만 untracked, HEAD는 base `65347d4` 그대로다. controller는 base 메모 L269의 F1과 L3 한계 문장도 직접 대조해 리뷰 발췌 공백을 보완했다. 마지막 기록 편집 후 controller가 보호 hash·checker·status를 다시 확인한다.

### 사용자 제공 리뷰

- 출처: 사용자 리뷰 파일 `codex_review_feedback_2026-10-12_task31-plan.md`. 읽기 전용이며 수정·이동·커밋하지 않는다. 위 하네스 호출 리뷰와 구분되는 사용자 제공 리뷰다.
- 판정: Approve. minor 2, nit 1, major와 blocker 없음. 사용자 리뷰는 checker나 npm을 실행하지 않았다.
- 같은 날 사용자가 계획 전체와 다섯 선택을 승인했다.

| 항목 | 사용자 결정 / 지적 | 반영 위치 |
| --- | --- | --- |
| 선택 1 PNG canonical 이름 | 이름 유지, S-same/PC-out에서 arm 출력에 쓰지 않는 비활성 항목 | 프로토콜 §3, 메모 결정 기록, 계획 §7 |
| 선택 2 정확 clean 치수 | 범위 1536 < L <= 2528과 기준값 2048 고정. 정확 치수와 family 배정은 이후 생성 Task에서 사용자 승인 뒤 확정 | 프로토콜 §2, 메모 결정 기록, 계획 §3/§7 |
| 선택 3 npm gate | 생략 승인, NOT RUN | 이 핸드오프 §5, 계획 §8 |
| 선택 4 fallback rate | 최소 정의를 지금 확정. 분자는 D slot 중 guard가 fallback 선택, 분모는 D 배정 전체 144와 조건별 36. guard 결정 없는 slot은 분자에서만 제외하고 수를 따로 보고, 분모 유지. primary D−C와 병기, rejection 비율과 구분, slot 제외와 primary 조정 없음 | 프로토콜 base L149 뒤, 메모 결정 기록, 계획 §7 |
| 선택 5 calibration 기준 | 기준 미정 유지. 실행 전 사용자 결정, 어떤 값 변경도 사전 사용자 승인 | 프로토콜 base L51 뒤, 계획 §2/§7 |
| P1 minor | 교체 hunk 안의 base L57–59, L80–82, L93–96 문장을 유지 | 계획 §1 유지 문장 목록과 §8 검사 요구, 프로토콜 해당 hunk |
| P2 minor | 사용자 결정으로 확정. stress recipe 먼저 고정, 그 recipe에서 guard 조정, 이후 stress 변경 시 최종 값에서 guard 재확인 후 held-out 전 공동 freeze | 계획 §2, 프로토콜 base L51 뒤 |
| N1 nit | §2의 계획 검사 후 중지 체크박스 체크, §7 m1–m4 행의 실행별 고정 문구에 R3 철회 표시 | 이 핸드오프 §2, §7 |

- 구현 단계 하네스 실행: 문서 1차 구현자의 실제 모델과 사용량은 controller가 응답 뒤 기록한다. 독립 마일스톤 리뷰는 대기 중이며 결과를 미리 적지 않는다.


### 하네스 구현 실행 및 controller 검증 — 2026-10-13

- 첫 구현 호출은 세션 중단으로 결과/modelUsage 파일이 남지 않아 성공 여부와 사용량을 확인할 수 없다. 사용자 재개 뒤 한 번 재시도했고 성공 응답을 확인했다.
- 별도 구현자: Claude Code, 실제 canonicalModel `claude-opus-5-5`, provider `firstParty`. 도구 없는 정확 일치 JSON 편집안을 controller가 기계적으로 적용했다. 구현자 자기 검토는 독립 리뷰로 세지 않는다.
- 실제 modelUsage: {"claude-opus-5-5":{"inputTokens":2,"outputTokens":48151,"cacheReadInputTokens":0,"cacheCreationInputTokens":80920,"webSearchRequests":0,"costUSD":1.610388,"contextWindow":1000000,"maxOutputTokens":128000,"thinkingTokens":27532,"canonicalModel":"claude-opus-5-5","provider":"firstParty","costBasis":"list"}}. 비용 USD 1.610388. 사용자 제공 계획 리뷰와 별개 호출이다.
- baseline: `node .artifacts/task-31-plan-review/verify-plan.cjs` PASS(기존 17공란·신규 두 문서). 문서 작업으로 코드 RED는 해당 없음; 사전 수용 검사를 사용했다.
- 구현 후 첫 검사 FAIL: 새 LF와 기존 CRLF 혼합, Git diff의 빈 줄 정렬 및 P-in 별칭 누락을 발견했다. 파일별 원래 줄바꿈을 복원하고 P-in 이름을 명시했다. 검사기는 Git 저장 형식 LF로 비교하고 동일 빈 줄에 대한 diff 정렬만 허용한다. 원문 내용을 지우거나 허용 hunk를 넓히지 않았다. 사전 Astra 검사에서 결정 행 제목의 첫 토큰을 ID로 읽도록 검사기 버그도 수정했다.
- 재검증: `node .artifacts/task-31-plan-review/verify-implementation.cjs implementation` PASS, 260 검사, 17개 결정값, errors 0. 네 파일 범위·P-1 일곱 핵심 문장·허용 구간·원문/리뷰 보호 hash·accounting 산술·Markdown 형식 확인. 프로토콜 전체 의미는 독립 마일스톤 리뷰와 Astra가 추가 확인한다.
- npm gate: NOT RUN — 사용자 명시 생략 승인. encoder/probe·이미지 생성·실험·hosted 평가·count-tokens·외부 조사 모두 NOT RUN — 범위 제외.
- 이 절 작성 당시 독립 마일스톤 리뷰와 transport는 대기였으며, 아래 마일스톤 결과가 리뷰 상태를 대체한다.


### 독립 마일스톤 리뷰와 보완 — 2026-10-13

- 별도 fresh Claude Code 실행, canonicalModel `claude-opus-5-5`, provider `firstParty`: SPEC/QUALITY PASS WITH NOTES, blocker 0 / major 0 / minor 4 / note 6. 도구 없는 실제 diff·문서 리뷰이며 검사 재실행을 주장하지 않는다.
- 실제 modelUsage: {"claude-opus-5-5":{"inputTokens":2,"outputTokens":14174,"cacheReadInputTokens":0,"cacheCreationInputTokens":81300,"webSearchRequests":0,"costUSD":0.933888,"contextWindow":1000000,"maxOutputTokens":128000,"thinkingTokens":10031,"canonicalModel":"claude-opus-5-5","provider":"firstParty","costBasis":"list"}}. 비용 USD 0.933888. 사용자 제공 리뷰 및 구현자의 자기 검토와 구분한다.
- Astra 사전 PR 리뷰: 사용량 제한 실패 후 사용자 재개에 따른 한 번의 재시도 성공. 실제 diff·승인 결정 대조 및 `verify-implementation.cjs astra-pre-pr` PASS(260항목, 17값). 최종 Git/PR 리뷰는 Draft 이후 수행한다.

| 지적 | 처리 / 근거 |
| --- | --- |
| m-1 | 현재 상태·검사 완료·네 파일 변경을 갱신하고 계획 단계의 보호 hash 확인은 이력으로 표시 |
| m-2 | 계획 §7 뒤 세 문단에 승인 전 이력 표기, 구현 단계 1–3 및 완료된 문서 검사·독립 리뷰 체크 |
| m-3 | 메모 append와 계획 §2의 재확인 목록에 최종 stress 값의 guard 조정 추가 |
| m-4 | 승인된 clean 정책 삽입 문단에서 accounting 도출의 표 상한 2112와 메모 출처 연결 |
| n-1 / n-2 | L80–82 교체 구간에서 원문을 보존한 채 앞에 확정 문장을 붙임. diff는 L79 뒤 삽입처럼 보이지만 허용 L80 교체의 일부. 뒤의 약한 원문은 P-1 보존 요청에 따라 유지 |
| n-3 | 단계별 변환 문단에도 P-in 별칭 명시. 사용자 지적 ID는 원문의 P-1이므로 그 표기는 유지 |
| n-4 | 메모 append에 O2 전부 불필요, O3 및 O1 C/D/E arm 단위 조건부 보충. 일반 표는 그대로 |
| n-5 | 144/36은 held-out D 배정 분모임을 명시. calibration의 별도 보고 정의는 선택하거나 추가하지 않음 |
| n-6 | 보호 hash·링크·hunk·산술은 controller 검사, 원문/행 해석은 Astra 직접 확인. reviewer가 수행하지 않은 검증으로 확대하지 않음 |

- 이는 승인된 범위의 국소 문서 보완이다. 추가 encoder·실험·npm·값 선택은 없으며 재검증 뒤 같은 Task 브랜치로 전달한다.

## 8. 자체 리뷰

- 정확성: 사용자 선택/조건부 도출/미검증을 분리했다. 17필드의 선택이 실제 encoder 적합성이나 runnable protocol 완성을 뜻하지 않는다.
- 안정성/보안/성능: 문서만 계획하며 source/held-out 경계, failure/retry/unknown 규칙을 보존한다. 외부 모델에는 비민감 최소 발췌만 전달한다.
- 유지보수성: base 고정 행 번호와 선택 조합만 추적한다. 480조합 재계산이나 Task 30 AC4 전수 열거 완료 주장을 하지 않는다.

## 9. 남은 작업과 논문 정합화 후속

이번 Task에서 논문 파일을 수정하지 않는다. 아래는 **비전수 후속 목록**이다. 행 번호는 base `65347d4`의 [논문](../../research/image-first-paper-draft.ko.md) 기준이며 향후 별도 승인 Task의 수정 후보다. 해당 Task에서 논문 전체 정합성을 다시 검토해야 한다.

| base 행 / 현재 문장 | 별도 Task에서 필요한 정합화 |
| --- | --- |
| L56 ‘선택 가능한 변환 프리셋’, L65–66 ‘후보를 정렬할 수 있다’ | S-same의 영역 선택과 고정 1536→q75 출력 변환을 구분. 여러 출력 preset을 selector가 비교한다는 읽기 제거 |
| L62–65 ‘PNG canonical, 긴 변 1536 … JPEG quality 75’, identity 기록 | PNG canonical 이름 처리의 사용자 결정 반영, 활성 출력 변환 1536/q75와 stress 1024/q50 분리, DO/CB resize 단계 identity를 기록 |
| L115–119 ‘소유·합성 아티팩트’, 외적 타당도 후보 | 직접 생성한 무손실 이력 RGB PNG, 원천 그대로 사용, 긴 변 범위와 최종 치수 목록의 당시 확정 상태 추가. dataset을 확보했다고 쓰지 않음 |
| L121–127 B/C/D/E와 ‘가능한 한 같은 출력 변환’ | B crop 없음, C/D 영역 선택 뒤 B와 동일 출력, E oracle crop 뒤 동일 출력, A/fallback 예외 명시 |
| L128 네 조건 이름 | clean/JO/DO/CB format·quality·cap 및 12-family calibration 잠정값/held-out 전 freeze 절차 추가. stress recipe 먼저 고정, guard 조정, stress 변경 시 최종 값에서 guard 재확인 뒤 공동 freeze하는 순서 포함 |
| L137–140 primary D−C와 fallback 사용률 | fallback만 설계상 입력 선택 차이를 만들 수 있는 필요조건, bytes 결정성 미검증, primary와 fallback rate 동시 해석. 2026-10-12 최소 정의(분자: D slot 중 guard가 fallback 선택, 분모: D 배정 전체 144와 조건별 36, guard 결정 없는 slot은 분자에서만 제외하고 수를 따로 보고) 명시, rejection 비율과 구분 |

- 위 후속에서는 L130–135의 720/576/144, 실패·not_started·retry와 L71–72 배정 variant fallback 경계를 유지해야 한다.
- 2026-10-12 해소: PNG canonical 이름(유지·비활성), 정확 치수 목록의 결정 시점(이후 생성 Task), npm gate(생략), fallback rate 최소 정의. 현재 잔여: calibration 검증 기준(실행 전 사용자 결정), 정확한 width×height 목록과 family 배정, 기준값 2048의 운영 의미. 문서 검사·독립 마일스톤 리뷰와 Draft 전달은 완료됐다.
- X3 selector 점수·영역/tie break, X4 no-op, X5 DO PNG와 canonical 관계, X8 resize 규칙, X9 encoder 적합성 및 실제 corpus 검증은 여전히 남는다.

## 10. 사용자 승인 필요 사항

- 계획과 다섯 선택은 2026-10-12 승인됐고 P-1/P-2/N-1과 함께 모두 반영했다. 이번 Task의 미응답 선택은 없다.
- calibration 검증 기준, 실제 치수·family 배정과 encoder 적합성은 후속 실행 전에 정하거나 검증할 사항이다. 이 Task는 이를 새로 선택하거나 실행하지 않았다.
- Ready 전환, merge, 다음 Task는 별도 지시 전 수행하지 않는다. 현재 Draft PR의 사용자 검토를 기다린다.

## 11. 최종 요약

- 네 문서 구현과 사용자 선택 5건·P-1/P-2/N-1 반영 완료. 논문·Task 29/30·공유 HANDOFF·코드·테스트·package는 변경하지 않았다.
- 구현 커밋: `93c00910f52af372117cb760e45f0c4778dabcb8` — `docs(research): record approved image protocol decisions`, `Agent: codex`. 이 기록 갱신은 별도 문서 기록 커밋으로 같은 PR에 추가한다.
- [PR #31](https://github.com/kimcheolhui9846/token-context-optimizer/pull/31): OPEN / Draft, base main. 생성 직후 HEAD = upstream = PR head = 구현 커밋을 확인했고 worktree clean이었다. 기록 커밋 후에는 최신 PR head와 로컬/upstream 일치를 다시 확인한다.
- Draft 생성 후 `node .artifacts/task-31-plan-review/verify-implementation.cjs post-pr` PASS. Astra가 `astra-final`로 직접 재실행해 260항목·17결정값·errors 0을 확인했다. `git diff --check`와 staged 검사도 PASS. 현재 기록은 실제 확인된 결과이며 이후 기록 커밋의 검사는 별도 최종 전달 증거에 남긴다.
- 최종 Astra 판정(구현 커밋 기준): **PASS WITH NOTES**, blocker/major 0. 승인 범위·실제 diff·사용자 요구·리뷰 보완·Git/PR·trailer·검사를 직접 대조했다. 최종 기록 보완은 구현 내용 변경이 아니다.
- npm gate **NOT RUN — 사용자 명시 생략 승인**. encoder/probe·이미지 생성·calibration·실험·hosted 평가·count-tokens·외부 조사도 NOT RUN. q50/1024 효과·비용·fallback 빈도는 미측정이며 X9는 남는다.
- 남은 일은 사용자 Draft 검토와 별도 후속 결정이다. Ready 전환·merge·다음 Task를 수행하지 않았다.
