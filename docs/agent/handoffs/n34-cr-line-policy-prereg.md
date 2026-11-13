# N-34 자원 gate 사전등록 (측정 전 고정)

- 근거: 계획 PR #115 @`4a5b390` §8 전체(사용자 2026-11-13 D3 승인). 이 문서는 그 절차를 구현 하네스에 고정한 것이며 임계·입력·순서를 바꾸지 않는다. 결과를 보기 전에 커밋한다.
- 하네스(이 커밋에서 고정): `research/src/n34-cr-policy-perf.mjs`(부모), `-perf-inputs.mjs`(입력·연산 공유), `-perf-worker.mjs`(시간 child), `-perf-mem-worker.mjs`(메모리 child). schema `n34-cr-policy-perf/v1`.
- arm: BASE = `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`(착수 시 origin/main = 계획 base), CAND = 측정 HEAD. 각각 `git archive` → 임시 폴더 → `npm ci --ignore-scripts` → `tsc -p tsconfig.json`. `dist/src/core/*.js`는 `policy.js`만 달라야 하고 lockfile 해시가 같아야 한다(아니면 실행 오류). A/A 사본(B2·C2)은 같은 `dist`의 바이트 복사.

## 입력·연산 (§8.2–8.3)
- F1 `\r`×10,485,760 · F2 `x\r`×5,242,880 · F3 `\r\n`×5,242,880 · F4 `\n`×10,485,760 · F5 `x\n`×5,242,880 · F6 `x\r\nx\rx\n`×1,497,965+`x`×5 · F6L `x\r\nx\nx\n`×1,497,965+`x`×5 · F7 (P1`\r`P2`\r`P3`\r`, 184 B)×56,987+공백 152 B · F7L 같은 구성 `\n`. 모두 정확히 10,485,760 B, child 안에서 생성. `--check-only`가 크기·파이프 없음·LF 치환 관계를 단언한다.
- O1 = 공개 `classifyContext(content)`. O2 = child가 임시 파일을 쓴 뒤(시간 밖) fresh `MemoryArtifactStore`로 `indexArtifact` → `summarizeArtifact({maxTokens: 400})`.
- G-R(같은 입력): F3·F4·F5·F6L·F7L, CAND(X) vs BASE(X). G-C(새 CR 작업): F1↔F4, F2↔F5, F6↔F6L, F7↔F7L, CAND(X) vs BASE(LF치환(X)). B1·B2는 REF 입력, C1·C2는 CAND 입력. G-C의 CAND(X) vs BASE(X)는 gate가 아니다(정보용 블록에서만).
- 순서(18행): O1(F3, F4, F5, F6L, F7L, F1, F2, F6, F7) → O2(같은 순서).

## 시간 gate(필수, §8.4)
- (행, 시도)마다 fresh hidden child 1개. 보정 child 1개 + 시도 child 최대 3개. 12-순환 `A B C D B D C A D A C B`(A=B1, B=B2, C=C2, D=C1), warmup 2순환(24) → 측정 10순환(120, 사본당 30).
- K 보정: K=1부터 2배, B1 5묶음·C1 5묶음 최솟값이 모두 ≥ 50 ms인 최소 K, maxK 1024(넘으면 INVALID). 보정 표본은 판정에 쓰지 않는다.
- 시간 밖 correctness: 네 사본의 공개 출력 digest가 모두 같아야 한다(G-R: BASE=CAND, G-C: CAND(X)=BASE(LF(X))). O1 비교 = classification 전체(mode·reasons·warnings). O2 비교 = `summary`·`sourceMap.startLine/endLine`·`fallbackReason`·`warnings`·`confidence`·`estimatedTokens`. artifact id·sha256·path 제외. summarize 응답에는 classification 객체가 없으므로 계획의 "classification"은 `fallbackReason`·`warnings`·`confidence`로 비교한다. 불일치 = `failed_correctness`.
- 통계: n=30 nearest-rank, median=`sorted[14]`, p95=`sorted[28]`. n≠30·비유한 = INVALID.
- A/A(B1/B2, C1/C2 각각, 참조=첫 사본): 중앙값 비 ∈ [0.95, 1.05] 또는 |Δmedian| ≤ 0.1 ms, 그리고 |Δp95| ≤ max(0.2 ms, 참조 p95×0.20). 무효면 30 s 뒤 새 child로 시도 전체 재실행, 최대 3시도. 세 번째 무효 = 필수 INVALID, 측정 중단.
- 판정: CAND=C1, REF=B1 고정. CAND median ≤ max(REF median×1.10, REF median+0.5 ms), CAND p95 ≤ max(REF p95×1.20, REF p95+1 ms). B2·C2는 A/A에만 쓴다. 두 A/A가 유효할 때만 판정 유효.
- 첫 비PASS 행에서 블록 중단: 유효 FAIL(`failed_gate`)은 재시도·완화·강등 없음. timeout·spawn 실패·JSON 1줄 아님·비정상 종료·OOM·표본 누락 = INVALID. child timeout 1,800 s.

## 메모리·자원 gate(필수, 시간 gate 뒤 독립 블록, §8.5)
- 반복 3회 × 18행 × arm 2(B1=REF 입력, C1=CAND 입력) = 108 child. 한 번에 한 child, `--expose-gc`만(heap 플래그 없음=기본 heap). 짝수 반복 BASE→CAND, 홀수 CAND→BASE. timeout 600 s.
- child: 모듈 import → 입력 생성(O2는 파일 쓰기) → GC 3회 → before=`heapUsed+external` → 연산 1회 → 결과(O2는 record·store·summary)를 전역에 둔 채 GC 3회 → after. R=after−before. P=`resourceUsage().maxRSS`×1024(프로세스 high-water, split 순간의 정확한 heap peak가 아님). 출력 digest 기록.
- 3회 nearest-rank median. PASS = R_CAND ≤ R_REF + max(1 MiB, R_REF×0.02) 그리고 P_CAND ≤ P_REF×1.10 + 32 MiB. P가 0·비유한 = `unmeasurable`(PASS 아님).
- 행 분류(우선순위대로): 실행 수 부족·spawn/parse 실패 = INVALID → REF 실패(OOM·timeout·RangeError) = `ref_failed`(판정 불가, 새 사용자 결정 필요), REF 기타 실패 = INVALID → CAND OOM(비정상 종료 + `FATAL ERROR … heap` 류 stderr)·timeout·`RangeError` = `failed_gate`(재시도 없음) → CAND 기타 실패 = INVALID → 6회 출력 digest 불일치 = `failed_correctness` → 임계 판정. 사전등록된 3회 반복은 실패 뒤에도 그대로 실행한다(재시도가 아니며 추가 실행은 없다).
- 블록 상태: 18행이 모두 정확히 1개씩 PASS일 때만 `pass`. 아니면 failed_correctness > failed_gate > invalid.
- **최종 승인 = 시간 블록 pass 그리고 메모리 블록 pass.**

## 정보용 블록(gate 아님)
- 두 필수 블록이 같은 run 이름으로 모두 pass한 뒤에만 실행된다(하네스가 강제). G-C 4입력 × O1·O2에서 네 사본이 모두 X를 쓰는 시도 1회: CAND(X)/BASE(X) 중앙값 비와 A/A를 기록만 한다.

## 실행·보존
- 자체 점검(측정 전): `node research/src/n34-cr-policy-perf.mjs --check-only`(순수 단언), `--self-check --output=research/results/n34-cr-policy/selfcheck-<name>.json`(결함 주입: 비정상 종료·출력 없음·2줄·잘못된 JSON·오류 상태·모의/실제 OOM·timeout·spawn 실패의 분류와 exit code, 그리고 64 KiB 합성 입력 5행으로 snapshot·worker·집계 경로 왕복. 그 판정값은 gate가 아니다).
- 측정: `node research/src/n34-cr-policy-perf.mjs --prereg=<이 커밋> --block=timing --output=research/results/n34-cr-policy/perf-run1-timing.json`, 이어 `--block=memory … perf-run1-memory.json`, 두 블록 pass 뒤 `--block=info … perf-run1-info.json`.
- 부모 exit code: 0 pass(자체 점검·정보용 완료 포함), 3 failed_correctness, 4 failed_gate, 5 invalid, 1 그 밖의 오류. 결과 JSON에도 `exitCode`를 쓴다.
- 실행 거부 조건: Windows·Node `v24.18.0` 아님, dirty 작업 트리, 출력 파일 존재(덮어쓰기 거부), `--prereg`가 하네스·이 문서를 마지막으로 바꾼 커밋이 아님, prereg↔HEAD 사이 하네스·`src` 변경.
- 기록: 원시 표본(순서·사본·라벨·ms), K와 보정 단계, child 상태·exit code·signal·stderr 끝, 환경(Node·V8·OS·CPU·메모리·전원 계획, 시작·끝 동일 단언), 입력 sha256, 하네스·`policy.ts`·lockfile의 blob sha1(커밋 기준)과 작업 사본 sha256(CRLF 기준), snapshot `dist/src/core` 해시, 사전등록 커밋·측정 HEAD. 실행 전후 추적 파일 해시 동일과 임시 폴더 삭제를 단언한다.
- 금지: 유효 FAIL 뒤 임계 완화·필수→정보용 강등, `--max-old-space-size` 등 heap 증액(자체 점검의 OOM 분류 확인 child만 예외, 측정 child에는 쓰지 않음), 유효 FAIL 재시도, 결과 뒤 입력·순서 변경, 이전 결과 삭제·덮어쓰기. 제품을 다시 고치면 새 사전등록 커밋과 새 결과 파일을 쓴다.
