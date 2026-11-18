# N-34 자원 gate run3 사전등록 (측정 전 고정)

- 근거: 사용자 2026-11-14 A안 + run3 승인(`codex_review/review_2026-11-14_n34-a-run3-approved.md`, 상세 `review_2026-11-14_n34-remediation-proposal.md`).
- 이전 사전등록은 그대로 보존한다.
  - run1: `docs/agent/handoffs/n34-cr-line-policy-prereg.md`(커밋 `982046c`).
  - run2: `docs/agent/handoffs/n34-cr-line-policy-prereg-run2.md`(커밋 `de2f499`).
- 이 문서는 run2 protocol을 대체하는 run3 protocol이다. 아래 "바뀌는 것" 외에는 run2 문서(그리고 run2 문서가 상속한 run1 문서)의 조항을 한 글자도 바꾸지 않고 그대로 따른다.
- 하네스: `research/src/n34-cr-policy-perf.mjs`(부모, schema `n34-cr-policy-perf/v2`).
  - 입력 `-perf-inputs.mjs`, 시간 child `-perf-worker.mjs`, 메모리 child `-perf-mem-worker.mjs`는 run1·run2와 같은 파일이며 바꾸지 않는다.
  - 부모에서는 PROTOCOL 참조, run1·run2·run3 protocol 보존 목록(`HARNESS_FILES`), 주석만 바꾼다. 결과를 보기 전에 커밋한다.
- 보존하는 원자료(작업 사본 sha256). run3 표본과 합치거나 이전 행으로 대체하지 않는다.
  - run1 INVALID `research/results/n34-cr-policy/perf-run1-timing.json`: `45e2dc3b505fda3cc955fbc414cc445a143f4fc55756c32c191fb0542c5ccbfa`.
  - run2 유효 FAIL `research/results/n34-cr-policy/perf-run2-timing.json`: `bc61781c1e5d0336352a1f336207199b9e9673657a84b28c03b4c144e9724121`. O1/F1 C1/B1 = 1.1392739, 5 PASS + 1 FAIL + 12 NOTRUN, 메모리·정보용 NOTRUN.

## 바뀌는 것
1. 제품(CAND) `src/core/policy.ts`: A안, 배열 없는 줄 순회.
   - 비공개 `somePolicyLine(content, predicate)`를 추가한다. `charCodeAt`·`slice` 스캐너이며 CRLF는 경계 하나, 단독 CR·LF는 각각 경계다.
   - `containsShellCommand`·`containsTechnicalTokenShape`의 `content.split(POLICY_LINE_BREAK).some(...)` 두 호출만 이 함수로 바꾼다.
   - `POLICY_LINE_BREAK = /\r\n|\r|\n/u`, `isPositiveSemanticText`, EXACT_PATTERNS, predicate, 호출 순서, RangeError 처리, public API, `artifacts.ts`는 그대로다.
   - 의미 동치 근거: `split(POLICY_LINE_BREAK).some` oracle 대조(전수 9,841 + seed 200,000, 반환값·호출 접두열·예외 전파). 형식 증명은 아니다.
2. 실행 이름은 `run3`다. 결과 파일은 `perf-run3-timing.json`, `perf-run3-memory.json`, `perf-run3-info.json`이며 self-check는 `selfcheck-run3.json`이다.

## 바뀌지 않는 것(run2 문서 그대로)
- BASE `5d668f9`, 입력 9종·10,485,760 B, 연산 O1·O2, G-R/G-C 비교, 18행과 행 순서. snapshot 빌드와 `policy.js`만 다르다는 단언.
- 시간 gate 순서: run2의 두 순환 교대(`A B C D B D C A D A C B` / `A D A C D B D C B A B C`)와 `--check-only` 불변조건·음성/양성 control.
- K 보정(K=1부터 2배, B1·C1 각 5묶음 최솟값 ≥ 50 ms, maxK 1024), 시간 밖 correctness digest.
- n=30 nearest-rank median=`sorted[14]`, p95=`sorted[28]`. A/A 기준, 시도 최대 3회, 30 s cooldown. 세 번째 무효면 필수 INVALID로 중단.
- 판정 CAND=C1/REF=B1과 시간 임계(median ≤ max(×1.10, +0.5 ms), p95 ≤ max(×1.20, +1 ms)). 첫 비PASS 행에서 블록 중단. child timeout 1,800 s.
- 메모리 gate: 3회 × 18행 × arm 2 = 108 child, `--expose-gc`만(기본 heap), 짝·홀 반복 순서, timeout 600 s, R·P 정의와 임계, 행 분류 우선순위, 블록 상태.
- 정보용 블록은 같은 run 이름의 두 필수 블록이 모두 pass한 뒤에만 실행한다. 부모 exit code, 실행 거부 조건, 기록 항목, 금지 사항도 그대로다.
- **최종 승인 = run3 시간 블록 pass 그리고 run3 메모리 블록 pass.**

## 한계(측정 전 기록)
- run2 문서의 순서 한계(mod 4 위상, lag-2 불균형, 15/15 경계)는 그대로 남는다.
- run2 FAIL의 원인(정규식 경로, 입력 의존 비용, 측정 환경 상태)은 확정되지 않았다. 이 변경은 run3 통과를 보장하지 않는다.
- 줄 배열을 만들지 않아도 `slice`로 줄 문자열은 여전히 만든다. 비용이 run2와 같거나 커질 수 있다.

## 실행·보존
- 측정 전(1단계): 표준 npm 7단계, `--check-only`, `--self-check --output=research/results/n34-cr-policy/selfcheck-run3.json`(gate 아님). 1단계에서 10 MiB 실측은 하지 않는다.
- 측정(2단계, primary 실행권 전달 뒤):
  - `node research/src/n34-cr-policy-perf.mjs --prereg=<이 문서와 하네스를 마지막으로 바꾼 커밋> --block=timing --output=research/results/n34-cr-policy/perf-run3-timing.json`.
  - 시간 블록이 pass하면 `--block=memory … perf-run3-memory.json`.
  - 두 블록이 모두 pass하면 `--block=info … perf-run3-info.json`.
  - prereg 커밋 뒤 측정 HEAD까지 `src`·하네스·protocol 차이 0, 작업 트리 clean이어야 한다(하네스가 강제).
- run3도 무효나 실패면 종료한다. run4·다른 안 자동 적용, 유효 FAIL 재시도, 필수→정보용 강등, heap 증액, 임계 완화는 하지 않는다.
