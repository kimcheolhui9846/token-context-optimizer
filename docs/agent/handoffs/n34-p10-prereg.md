# N-34 P10 K1 공식 검증 사전 등록 (P-1, run `p10run1`)

- 상태: **미실행.** 공식 timing·memory·정보용 실행은 primary 검토 PASS와 사용자 1회 실행 승인 뒤에만 한다. 이 문서는 실행 전에 고정한다
- 채택 계획: PR #123 `docs/plans/2026-11-17-n34-k1-validation-plan.md` §5–§8(head `47c290e`). 사용자 채택 U1 = P-1, U2 = 정보용 F1 + §7.3 처분표(사전 위험 수용 없음), U3 = 운영 예산 10 h / 1 h / 4 h·R 10분(C 안)·운영 창 C + 30분·필수 A/A 최대 3시도, U4 = PR #119 branch
- 구현 요청: `codex_review/review_2026-11-17_p10-impl-request.md`, 실행 보완 `review_2026-11-17_p10-impl-execution.md`(충돌 시 보완 우선, 추적 안 됨). Task handoff: `p10-k1-validation-impl.md`
- 이 prereg는 자기 commit SHA를 적지 않는다. 동결 commit은 실행 때 `--prereg=<sha>`로 넘기고 runner가 ancestry·하네스 blob·HEAD 동일성으로 확인한다

## 1. 하네스
| 파일 | 역할 |
|---|---|
| `research/src/n34-p10-perf.mjs` | P-1 runner. run3 runner의 사본이고 바뀐 줄마다 P10 표시가 있다. check-only가 run3 대비 copy guard를 검사한다 |
| `research/src/n34-p10-perf-contract.mjs` | 순수 helper: 예산, 단계별 원자료 검사, 정보용·필수 판정, F1 처분, 소유 프로세스 종료 규칙, raw-only commit 사슬, receipt |
| `research/test/n34-p10-perf.test.mjs` | node:test. fake 시계·프로세스·git로 실제 runner 흐름, 임시 git 저장소, 실제 root + grandchild 종료 fixture |
| `research/src/n34-cr-policy-perf-inputs.mjs`, `-worker.mjs`, `-mem-worker.mjs` | run3 파일 그대로. worker는 자식 프로세스를 만들지 않는다(`child_process`·`spawn`·`exec` 사용 0건) |
| `research/src/n34-cr-policy-perf.mjs` | copy guard 기준(run3 runner, LF 정규화 sha256 `61866e8d…e1eee9`). 바꾸지 않는다 |

- runner `HARNESS_FILES` = 위 파일 + 이 prereg + run3·run2·run1 protocol 문서. `--prereg`은 이 파일들을 마지막으로 바꾼 commit이어야 한다
- copy guard: run3 줄과의 LF 정규화 LCS 줄 diff에서 표시 없는 추가 줄 0, 제거된 run3 줄 152개의 sha256 `6b49bb89…dced5e` 고정. 제거된 줄은 run3의 프로세스 helper·`childRecord`·self-check·main과 머리말이다. 통계·gate·schedule·보정·`timingRow`·`memoryRow`·`memoryRun` 본문은 그대로다(`timingRow`에는 예산 진입 줄 2개만 표시와 함께 추가)
- copy guard는 동등성의 증명이 아니다. 실제 diff와 계약 테스트를 함께 본다

## 2. 비교 대상과 행 (run3·계획 §5 그대로)
- BASE: `git archive 5d668f9` → 임시 폴더 → `npm ci --ignore-scripts` → `tsc`. CAND: 측정 HEAD(제품은 `4999c1f`)
- 실행 전 runner가 확인하고 다르면 거부한다
  - `git diff --numstat 5d668f9 HEAD -- src` = `21<TAB>3<TAB>src/core/policy.ts`
  - `git diff 4999c1f HEAD --name-only -- src package.json package-lock.json bin` = 0줄
  - dist/src/core에서 다른 파일은 `policy.js`뿐, lockfile 동일, A/A 사본 동일
- 필수 18행: O1 `F3, F4, F5, F6L, F7L, F1, F2, F6, F7` 뒤 O2 같은 순서. G-C 매핑 F1→F4, F2→F5, F6→F6L, F7→F7L(run3)
- 정보용 8행: G-C 행의 same-input(cand = ref = X), key `<op>/<id>:same-input`. 행마다 시도 1회
- 입력 run3 `makeInput` 10,485,760 bytes. schedule 2 circuit 교대, warmup 2 + measure 10, 144표본, 사본당 n = 30, nearest-rank median = 정렬[14], p95 = 정렬[28]
- A/A·time gate·memory gate·memory 행 우선순위는 run3 그대로다. 임계·통계·표본 정의를 바꾸지 않는다

## 3. 예산 (계획 §6.1, U3)
| 기호 | 값 | 기호 | 값 |
|---|---|---|---|
| C timing | 10 h | Tcmd | 600 s |
| C memory | 1 h | Tcal | 1,800 s |
| C 정보용 | 4 h | Tatt | 1,800 s |
| R | 10 min(C 안, 한 번만 뺌) | Tcool | 30 s |
| 운영 창 | 블록마다 C + 30 min | Tmem | 600 s |
| | | Tkill | 10 s |

- t0 = 블록 시작 단조 시각, D = t0 + C, Dwork = D − R. 작업 단계는 remainingWork, 마무리는 remainingTotal을 쓴다
- 진입 조건: 행 ≥ Tcal + Tatt(아니면 그 행과 뒤 행 `notRun(budget)`), 시도 ≥ Tatt(`notRun(budget_before_attempt)`), 재시도 ≥ Tcool + Tatt(`invalid(budget_before_retry)`), memory child ≥ Tmem(남은 child 미실행 → `missing_runs`), 명령은 remainingWork > 0
- timeout 원인: 남은 예산이 단계 상한보다 **엄격히 작을 때만** 예산 제한이다. 같으면 개별 상한 timeout이다
  - 예산 제한 timeout으로 snapshot 빌드가 끝나지 않으면 모든 행 `notRun(build_incomplete)`, 블록 invalid(5)
  - 개별 상한 timeout·그 밖의 빌드 실패는 error(1)
- C는 수용 상한이다(hard wall 아님). `workOverrunMs`, `finalizationMs`, `finalizationOverReserveMs`, `capOverrunMs`를 기록한다. `capOverrunMs` > 0만 `pass`·`completed_informational`을 error(1)로 바꾼다. 이미 판정된 실패는 그대로 둔다
- 최종 저장과 hash도 C 안에서 판단한다(보완 n-2). 파일 안 `budget`은 최종 저장 직전 cut-off이고, 저장·hash 뒤 시각은 receipt가 기준이다

## 4. 판정
- 필수 블록 우선순위(계획 §6.3): failed_correctness 3 > failed_gate 4 > invalid 5(invalid·`ref_failed`·notRun) > 본문 예외 error 1 > 마무리 실패·`capOverrunMs` > 0·잔류·정리 미확인 error 1 > pass 0. 부모 중단은 `incomplete`
- memory: 3반복이 모두 끝난 행만 확정 판정이다. 완결 행 CAND OOM은 failed_gate(4), 반복 부족 + OOM은 `missing_runs` invalid(5)이고 OOM raw는 남긴다. repeat 우선 순서(짝수 회 BASE→CAND, 홀수 회 CAND→BASE)
- 원자료: 계획 §6.4 단계 표. 필수 행은 pass만 invalid(`raw_incomplete`)가 되고, 정보용 행은 V만 I(raw)가 된다. C·X·I(aa)·I(run)은 그대로 두고 빠진 항목을 옆에 적는다
- 정보용 행: V·X·C·I(aa)·I(run)·I(raw)·N. 블록은 I(run)·I(raw)·N·`rawComplete` false·마무리 실패·`capOverrunMs` > 0이면 error(1), 아니면 `completed_informational`(0)
- snapshot 무결성(primary r1 R3): `buildSnapshots`의 assertion(A/A 사본 일치, lockfile 동일, dist/core 파일 집합, `policy.js`만 다름)이 실패하면 `IntegrityError`(`snapshot_integrity`)로 `integrityErrors`에 남는다. 일반 설치·빌드·자원 오류와 구별하며, 정보용에서는 D-4다
- F1 처분(계획 §7.3, 위에서 처음 맞는 것): D-3(J2 PASS 아님) > D-4(무결성: C 행·신원·snapshot·환경·추적 파일 변화) > D-2(블록 비수용 또는 F1 I(aa)) > D-1(F1 두 행 V·X, X ≥ 1) > D-0(F1 두 행 V). F1 행은 `O1/F1:same-input`, `O2/F1:same-input`
- D-0도 측정 범위의 관찰일 뿐이다. 성능 보장·위험 해소로 쓰지 않는다. 결과를 보고 재실행·선택·합산하지 않는다

## 5. 정확한 명령 (실행권 뒤, 같은 PC)
```
node research/src/n34-p10-perf.mjs --check-only
node research/src/n34-p10-perf.mjs --prereg=<동결 sha> --block=timing --output=research/results/n34-p10/perf-p10run1-timing.json
node research/src/n34-p10-perf.mjs --prereg=<동결 sha> --block=memory --output=research/results/n34-p10/perf-p10run1-memory.json
node research/src/n34-p10-perf.mjs --prereg=<동결 sha> --block=info   --output=research/results/n34-p10/perf-p10run1-info.json
```
- 전제: Windows, Node `v24.18.0`, 작업 트리 clean. timing 시작 HEAD = `--prereg` 동결 commit(정확히 같음)
- 결과 파일 이름은 위 3개만 받는다. 이미 있으면 덮어쓰지 않고, 같은 이름으로 재개하지 않는다
- 진입 거부는 결과 파일을 만들지 않는다. stdout 마지막 줄에 JSON 한 줄 `{status:'refused', phase, reasonCode, integrityFailure, expected, actual, exitCode:1}`(정보용은 `disposition` 추가)을 내고 exit 1이다. 운영자가 그 줄을 기록한다
  - 정보용: J2가 확립되지 않으면 D-3, J2는 확인됐는데 신원이 다르면 D-4. 무결성 거부를 N·D-2로 낮추지 않는다

## 6. raw commit과 receipt (계획 §6.5, 보완 n-2)
- 블록이 끝나면 runner가 stdout에 `P10-Receipt: <한 줄 JSON>`을 낸다. 필드: `receipt, run, block, output, sha256`(저장한 파일 바이트), `status, exitCode, elapsedMs, capMs, capOverrunMs, errors`
  - 최종 저장이 실패하면 `sha256: null, saveFailed: true`, exit 1이다. 성공 receipt는 나오지 않는다
  - 저장·hash 뒤 C를 넘으면 pass·`completed_informational`을 error(1)로 바꿔 한 번 더 저장하고, 그 파일의 hash로 receipt를 낸다
- 운영자는 receipt의 sha256이 파일과 같고 실제 exit이 receipt와 같은지 확인한 뒤, 그 파일 하나만 추가하는 commit을 만든다. commit 본문에 receipt 줄을 그대로 한 번 넣는다. 다른 파일은 넣지 않는다
- memory 시작 조건: `--prereg..HEAD`가 commit 1개, `--name-status --no-renames` = `A research/results/n34-p10/perf-p10run1-timing.json` 한 줄, receipt 1개(파일 blob sha256·block·run·output 일치, status pass, exit 0, `capOverrunMs` 0), 파일 status·exitCode가 receipt와 같음
- 정보용 시작 조건: 위 timing 조건 + `Hm..HEAD`가 memory 파일 하나만 추가하는 commit 1개와 같은 receipt 조건
- receipt 검사(primary r1 R2): 필드가 정확히 `receipt, run, block, output, sha256, status, exitCode, elapsedMs, capMs, capOverrunMs, errors`이고, `sha256`은 64자리 16진수, `capMs` = 그 블록의 C, `elapsedMs`·`capOverrunMs`는 0 이상의 정수, `capOverrunMs` = max(0, `elapsedMs` − C) = 0, `errors` = `[]`, `saveFailed`·`saveError` 없음. receipt 줄이 JSON으로 읽혔는지와 그 값을 따로 본다: 읽힌 값이 객체가 아니면(`null`·`false`·`0`·빈 문자열·배열·스칼라) 같은 검사에서 `receipt_type`으로 거부하고, 객체일 때만 hash·status·예산을 더 대조한다(primary r2 R2-01). 원자료의 `budget.capMs`가 receipt와 다르거나 원자료 `budget.finalEndMs`가 receipt `elapsedMs`보다 늦으면 모순으로 거부한다(원자료는 마지막 저장 전 시각이라 두 값이 같기를 요구하지 않는다)
- 앞 블록은 저장된 `pass`만 믿지 않는다. 18 key 순서·각 1회·pass·`rawComplete`, 단계별 원자료 검사 재실행(timing) 또는 memory 판정 재계산 일치·child 108개, `finalizationErrors` 0, 잔류 pid 0, 임시 폴더 정리, 추적 파일 불변, 환경 불변, `capOverrunMs` 0이어야 한다
- 원자료 재판정(primary r1 R1, 기존 run3 정의 그대로): timing은 행 매핑, 보정 child 완료·마지막 단계 k·멈춤 조건, 보정 사다리(primary r2 R2-03, run3 worker 정의 그대로: K = 1, 2, 4, …로 두 배씩 maxK 1024 이하, 단계마다 B1·C1 표본 5개씩 유한한 0 이상 ms, 마지막 이전 단계는 멈춤 조건 미충족·마지막 단계만 충족, 마지막 단계 k = 보정 k = 행 k), attempt 번호 1부터 연속·최대 3회·멈춘 뒤 attempt 없음, digest 4개 일치, 표본 144개의 order·label·arm이 schedule과 같음, 표본에서 다시 낸 통계·A/A·gate·비율이 저장값과 같음, `selectedAttempt`, 다시 낸 행 판정 = 저장 판정, `schedule` 요약 일치. memory는 (row, repeat, arm, inputId) 108개가 정확한 실행 순서와 같고, run에서 다시 낸 행·블록 판정·`refFailedRows`·`rawIncompleteRows`가 저장값과 같음
- child 정리 증거(primary r1 R1, r2 R2-02): `children` 기록은 pid가 아니라 블록 안 spawn별 `childId`(1..n, spawn 순서)로 대조한다. pid는 OS 값이라 앞 child가 끝난 뒤 다른 child에 다시 쓰일 수 있으므로 블록 전체에서 유일하기를 요구하지 않는다. 기록마다 안전한 양의 pid, 관측 사건이 정확히 spawn → exit → close, exit code 0·signal 없음·spawn 오류 없음·종료 시도 없음, 부모 단조 시각 spawn 직전 ≤ 직후 ≤ close이고, runner가 child를 하나씩 기다리므로 각 기록의 close가 다음 기록의 spawn보다 늦지 않다(재사용된 pid의 수명이 겹치지 않음). 앞의 두 기록은 build의 `npm ci --ignore-scripts` 두 개이고, 나머지는 행이 가리키는 child(timing: 행마다 보정 뒤 attempt, memory: run 순서)와 순서대로 하나씩 `childId`·pid·시작 시각·node 인자·역할 script(성능/메모리 worker)가 맞아야 한다. 가리키는 child 기록은 completed·exit code 0·signal 없음·close 관측·종료 시도 없음이다. 기록에서 다시 낸 `cleanupViolations`·`leftoverPids`가 비어 있고 저장값도 `[]`, `blockEndKills`·`spawnSaveErrors` 없음. 또한 `build.status` completed, `integrityErrors` `[]`, 본문 오류·예산 중단 없음, `budget.capMs`·`reserveMs`가 사전 등록 값
- 원자료 형태가 깨졌거나 검사 중 예외가 나도 거부 JSON 한 줄과 exit 1로 끝낸다(결과 파일 미생성)
- 신원 대조: run, schema, `preregistrationCommit`, `files`(하네스·prereg·`policy.ts`·package 파일 blob), BASE, CAND 제품(`HEAD:src` tree, package blob, numstat), `inputs`, `protocol`, `p10` 상수, `environment` 전체, snapshot(CAND ref 제외). 다르면 거부한다

## 7. 프로세스 소유·중단·정리 (보완 M-2, 계획 §6.2)
- runner가 spawn한 같은 ChildProcess 객체만 종료한다. 조건: pid가 안전한 양의 정수, `exitCode`·`signalCode` 모두 null, spawn 오류·exit·close 미관측. 검사 뒤 양보 없이 `taskkill /PID <pid> /T /F`를 동기 호출한다. timeout = min(Tkill, remainingTotal). 실패하면 같은 조건에서만 `child.kill()`을 쓴다
- 이 종료 규칙은 Windows·Node `v24.18.0`(exit 상태를 설정한 뒤 handle을 닫는 생명주기를 확인한 고정 런타임)에서만 켜진다. 아니면 아무것도 종료하지 않는다(fail closed)
- 이미지 이름이나 파일에서 읽은 PID로 종료하지 않는다. WMIC·private `_handle`을 쓰지 않는다. OS 생성 시각을 매 child마다 조회하지 않는다
- 기록: child마다 블록 안 spawn별 `childId`(1부터 등록 순서), pid, 부모가 본 spawn 직전·직후 wall·단조 시각(OS CreationDate가 아님), spawn·exit·close 관측과 관측 순서(`events`), exit code·signal, close 단조 시각, 종료 시도와 결과. 행·run의 child 요약에도 같은 `childId`를 남긴다. spawn 직후 결과 파일을 저장한다
- `childId`는 아직 실행 전인 이 P10 하네스의 내부 증거 필드다(primary r2 R2-02). 종료 권한을 주지 않는다: 종료는 위 조건의 살아 있는 같은 ChildProcess 객체로만 하고, 저장된 `childId`나 pid로는 하지 않는다. 새 OS 조회·시작 시각 추정은 없다
- 블록 끝: close가 없는 소유 child에 같은 규칙으로 종료를 시도하고 `leftoverPids`로 남긴다. close 미수신, 종료가 필요했는데 성공한 `taskkill /T`가 없음(`child.kill`만 성공한 경우 포함)은 `cleanupViolations`로 기록하고 비PASS다
- **부모 중단 뒤 복구(운영자, 읽기 전용 대조 먼저)**
  1. 결과 파일은 `incomplete`로 둔다. 재개하지 않고 같은 이름을 다시 쓰지 않는다
  2. 결과 파일의 `children`에서 `closeObserved: false`인 pid와 `spawnedAt`·`script`를 적는다
  3. PowerShell에서 읽기만 한다: `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, CreationDate`
  4. 이 하네스는 child의 OS 생성 시각 기준선을 기록하지 않는다. 결과 파일의 `spawnedAt`·`spawnReturnedAt`은 부모가 본 시각이고 OS `CreationDate`가 아니다. 그래서 저장된 PID, 부모 시각, 그 사이 구간, 실행 파일·명령행 일치만으로는 같은 프로세스임을 확인할 수 없다(PID 재사용, 같은 작업의 다른 실행을 배제하지 못함). 시간 허용오차를 정하지 않는다
  5. 따라서 부모 중단 뒤에는 저장된 PID로 어떤 프로세스도 종료하지 않는다. 3의 조회 결과(일치·불일치·없음)를 기록하고 "중단·수동 확인 필요"로 보고하는 데서 멈춘다. 남은 프로세스의 처리는 이 하네스 밖에서 사용자·PM이 따로 확인해 결정한다. 이 절차에 새 OS 조회나 자동 종료를 더하지 않는다
  6. 임시 폴더(`%TEMP%`의 `tco-n34-p10-` 접두사)는 5의 확인이 끝난 뒤, 접두사·위치를 확인하고 지운다
- 전원 차단·OS 중단에서는 저장과 정리를 보장하지 않는다

## 8. self-check (저장소 밖)
```
node research/src/n34-p10-perf.mjs --self-check --output=<저장소 밖 절대 경로>/selfcheck-<name>.json
```
- 이름은 `selfcheck-<name>.json`, 저장소 안·공식 폴더·공식 이름은 거부한다. 전역 예산 10분(R 1분), fault child ≤ 60 s
- 내용: run3 fault 8종 + 실제 root·grandchild 트리 timeout 종료와 grandchild 종료 확인(파일에서 읽은 pid는 생존 확인에만 씀), spawn 실패, 소유 거부 대조, 원자료 단계 대조, 64 KiB 합성 실행(필수 5행·정보용 F1 2행·memory 30 child). 합성 gate 판정은 기록만 하고 gate가 아니다

## 9. 실행 전 상태
- 공식 timing·memory·정보용: **미실행.** K1 timing INVALID, memory NOT RUN, same-input F1 미해결은 그대로다
- O2 A/A 불안정의 기제는 미확인이다. P-1은 이를 고치지 않는다(계획 §9)
- 하네스 검증(node:test·check-only·self-check) 통과는 성능·F1 해소의 근거가 아니다

## 10. 동결 기록 (blob pin, 이 prereg 자신은 제외)
- primary r2 보완 뒤 다시 동결했다. 이전 동결 `7735d42`(primary r1 CHANGES REQUIRED)와 `c52826a`(primary r2 CHANGES REQUIRED)는 실행 후보에서 제외됐다. runner·contract·test blob이 바뀌었고 나머지는 같다
- 동결 commit은 이 파일을 마지막으로 바꾼 commit이다. 실행 때 `--prereg=<그 sha>`로 넘기고, timing 시작 HEAD가 그 commit과 같아야 한다
- 아래 blob은 `git rev-parse HEAD:<path>`(커밋 blob, LF 기준) 값이다. runner는 실행마다 같은 값을 `files`에 다시 기록하고 블록 사이에 대조한다

| 파일 | blob |
|---|---|
| `research/src/n34-p10-perf.mjs` | `28e9d7f58c72da8b3cefea65bc0ce98274632fb2` |
| `research/src/n34-p10-perf-contract.mjs` | `7a0ea8da93c5cb07ada319b99e7bd6fc7bbdddc3` |
| `research/test/n34-p10-perf.test.mjs` | `b56053b09ffae4bcaf9cb33112f0ab5d279be88f` |
| `research/src/n34-cr-policy-perf-inputs.mjs` | `e03a6197ddeca9cb78fbf4fb002c87b238d03095` |
| `research/src/n34-cr-policy-perf-worker.mjs` | `c5ca276327c02134bb1a0ca111b22d43486b0bdb` |
| `research/src/n34-cr-policy-perf-mem-worker.mjs` | `f225aa8e62975657089110439374987b7f49e60b` |
| `research/src/n34-cr-policy-perf.mjs`(run3, copy guard 기준) | `d5ccf45356493ed4c1b6d2fa2b3f77e9d03cb42f` |
| `docs/agent/handoffs/n34-cr-line-policy-prereg-run3.md` | `2338e888f0d76c7955ff86c6c4afcabbd67debed` |
| `docs/agent/handoffs/n34-cr-line-policy-prereg-run2.md` | `f3a1ba433748a5174141473de86ae33cef91a812` |
| `docs/agent/handoffs/n34-cr-line-policy-prereg.md` | `55f3da93636bcd752677325e27ee70280a4fe979` |
| `src/core/policy.ts` | `1945abe5095971cc157d0d38d9a886228354b3e7` |
| `package.json` | `00130ae89264bd8241860857bf5c8d58efbc6d7d` |
| `package-lock.json` | `4c65f8860373f5b6331b3c870427a3f90897e7c6` |
| `HEAD:src` tree | `2fe72eaacbbf8afd75187e881d41cef044c21ce5` |

- 하네스나 이 prereg를 다시 고치면 새 동결 commit이 생긴다. 그때는 새 SHA를 primary preflight에 다시 올린다
