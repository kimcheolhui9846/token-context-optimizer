# N-34 K1 D1 사전 등록 보완 1 (preflight 수정: 무결성 검증·전역 시간 예산)

- 근거
  - primary 판정 `codex_review/review_2026-11-16_n34-k1-d1-preflight.md`: CHANGES REQUIRED(R1·R2 Major, M1 Minor)
  - 수정 요청 `review_2026-11-16_n34-k1-d1-preflight-fix-request.md`
  - 사용자 D1 승인(2026-11-16)은 유효하다. 이번은 승인된 설계를 지키기 위한 국소 오류 수정이다
- 원 사전 등록 `n34-k1-diag-prereg.md`(`8f29f19`)는 바꾸지 않고 동결한다
  - 이 보완은 그 문서에 **오류 방어와 시간 예산 집행만** 더한다
  - 설계(입력, 순환, 144표본, a/b GC 횟수, 비교 짝, 서술 통계)는 바꾸지 않는다. 둘이 다르면 이 보완이 우선한다
- 본 D1의 `--prereg`는 이 문서를 추가한 커밋이어야 한다
  - harness 파일 목록에 이 문서가 들어간다
  - 기존 `8f29f19` 기준 실행은 거부된다
- 상태: 미실행. primary 재검토와 실행권 전달 뒤에 1회만 실행한다

## 1. 전역 75분 예산 (R1)
- runner `main` 시작 시 단조 시계(`performance.now()`)로 마감 시각 1개를 만든다. 이후 모든 단계가 이 마감 시각을 따른다
- 각 subprocess의 timeout은 min(그 단계의 상한, 남은 예산)이다
  - 대상: git, tar, `npm ci`, tsc, powercfg
  - 단계 상한은 10분이다. child는 12분이다
- 남은 예산이 0이면 새 단계를 시작하지 않는다(`BudgetExpired`)
- 남은 예산 때문에 줄어든 timeout에서 멈춘 단계도 `BudgetExpired`로 기록한다
- 빌드가 예산 안에 끝나지 않은 경우
  - 모든 child를 `notRun(build_incomplete)`로 기록한다
  - status는 partial, 종료 코드는 2다
- child 시작 조건(원 문서 §7과 같음)
  - 남은 예산이 12분 이상일 때만 시작한다. timeout은 min(12분, 남은 예산)이다
  - 아니면 `notRun(budget)`이다
- child가 예외로 실패해도 다음 child는 계속 진행한다(`childErrors`). 재시도는 없다
- 종료 powercfg
  - 남은 예산 안에서만 실행한다
  - 만료 뒤에는 `skipped_budget_expired`, 실행 중 만료되면 `stopped_budget_expired`로 기록한다. 따로 10분을 주지 않는다
- 마감 뒤 허용하는 일은 유한한 정리뿐이다. 새 측정·빌드는 하지 않는다
  - 이미 소유한 child PID 트리 종료(`taskkill`, 최대 10 s)
  - 부분 raw와 요약 저장
  - 추적 파일 해시 비교
  - 검증된 temp 삭제
  - 기록: `budget.elapsedAtFinalizationMs`, `expiredAtFinalization`, `finalizationMs`, `overrunMs`
- 한계: 동기 단계(git·tar·tsc·powercfg)는 timeout이 되면 직접 띄운 프로세스만 종료된다. 이 도구들은 단일 프로세스로 실행된다. npm과 child는 PID 트리 전체를 종료한다

## 2. 레코드 무결성 (R2)
- 측정 무결성(하나라도 어긋나면 `invalid`, timeout이면 `timeout`)
  - 레코드: 객체이고 type이 start·probe·digest·forced·sample·gc·drain·end·error 중 하나여야 한다
    - 위반: `record:invalid`, `record:unknown_type:*`
    - error 레코드가 있으면 `record:error`
  - start: 1개이고 첫 레코드이며 조건이 같아야 한다
  - end: 1개이고 마지막 레코드이며 completed여야 한다
  - sample(원 문서 §4에 더함)
    - t0·t1·t2: 유한수
    - wall·index·summarize: 유한수 ≥ 0
    - CPU user·system: 정수 µs ≥ 0
    - heap 전후: used·total 유한수 ≥ 0
    - 순서: t0 ≤ t1 ≤ t2, 앞 표본 t2 ≤ 이번 t0
    - wall = t2 − t0, index = t1 − t0, summarize = t2 − t1(허용 오차 1e-6 ms)
  - forced(b)
    - i가 순번과 같고, start·end가 유한수이며 start ≤ end
    - 앞 표본 t2 ≤ start이고 end ≤ 같은 번호 표본 t0
  - digest: B1·B2·C1·C2 각 1개, 64자리 소문자 hex, 모두 같은 값
- GC 관측 무결성(어긋나면 `incomplete`. 겹침 값은 null이고 0으로 바꾸지 않는다. wall은 유지한다)
  - gc 사건
    - seq = GC 레코드 순번
    - startTime·duration: 유한수 ≥ 0
    - kind: MAJOR·MINOR·INCREMENTAL·WEAKCB 상수 중 하나
    - flags: 정수 ≥ 0
    - arrivedAt: 유한수
    - 알 수 없는 kind를 `other` 0으로 넣지 않는다
  - probe
    - 1개, supported true, clockOk는 boolean이고 true
    - before ≤ after(유한수)
    - forcedEvents: 비어 있지 않고 유효한 값
  - drain: 1개, complete는 boolean이고 true, steps는 정수 ≥ 0, drainMs는 유한수 ≥ 0
  - probe가 없거나 supported false면 원 문서처럼 `unsupported`다
- 요약
  - 무결성을 통과한 표본만 통계에 넣는다. 제외한 표본 번호는 `excludedSamples`에 남긴다
  - 관측이 supported가 아니면 GC 사건 수 요약(표본 밖, 강제 창)은 null이다
  - 요약 중 예외가 나도 child 항목과 원본 JSONL은 남긴다(`summary.error`)

## 3. 기존 64 KiB 확인과 재분석
- `diagcheck-64k-1`(`d170881`)은 **구 코드 `8f29f19`의 실행 결과**다. 수정 코드로 다시 실행하지 않았다
- 수정 코드로 저장 JSONL을 읽기 전용으로 재분석했다(`codex_review/.../n34-k1-diag-preflight-fix/reanalyze-64k.json`)
  - 두 child 모두 completed·supported다
  - 개수, 귀속, 사본·역할 통계가 저장 요약과 같다
  - primary 음성 사례 2건은 각각 invalid, incomplete/null이 된다

## 4. 해석 한계 (보완)
- GC observer 콜백이 JSONL을 동기식으로 쓰므로, 그 시간이 표본 wall에 들어갈 수 있다. 관측 오버헤드와 상관의 한계로 적는다. 계측은 재설계하지 않는다
- 64 KiB 확인에서는 CPU 증분이 몇 개의 이산 값(0, 15000, 16000, 31000 µs 등)으로만 관찰됐다
  - CPU 0인 표본이 a 73개, b 69개였다
  - 측정 해상도의 원인과 보편적 해상도는 입증하지 않았다. CPU/wall은 이 한계를 밝혀 서술한다

## 5. 실행
```
node research/src/n34-k1-diag.mjs --check-only
node research/src/n34-k1-diag.mjs --prereg=<이 보완 커밋> --output=research/results/n34-k1/diag-<name>.json
```
