# N-34 K1: 빈 줄 빠른 반환 (Task handoff)

- 요청서: `codex_review/review_2026-11-15_n34-k1-implementation-request.md`, 2단계 `review_2026-11-15_n34-k1-phase2-request.md`, 원인 분석 `review_2026-11-15_n34-k1-invalid-analysis-request.md` (Codex PM, 추적 안 됨)
- 범위: N-34 F1 정보용 위험에 대한 보완. 같은 branch `claude/n34-cr-line-policy`, 같은 Draft PR #119
- 구현: Claude Code (`claude-opus-5-5`). 계획·최종 판정: Codex PM
- 시작 HEAD `7e732e0`(pre-K1), PR base `main` `5d668f9`. prereg `8754d90`(`n34-k1-prereg.md`, 고정)

## 현재 상태: 2단계 timing **INVALID**(exit 5), memory **NOTRUN**, primary **CHANGES REQUIRED**
- primary 판정 `review_2026-11-15_n34-k1-phase2-final.md`: 1,728표본 독립 재계산 불일치 0. 필수 timing과 memory가 미충족이다
- 문서 정정 M1·M2와 읽기 전용 원인 분석을 마쳤다. 새 측정은 하지 않았다
- 다음 진단(D1)은 사용자·PM 승인 뒤에만 한다
- K1 PASS와 main 대비 F1 위험 해소는 미해결이다. 통계적 유의성과 재현성은 주장하지 않는다

## 1단계 (완료)
- 테스트 먼저 `ad1d3e6`(scope guard RED 3개, 기능 RED 없음) → 구현 `b4f60ed`(src +2줄, bin +2줄)
- prereg·하네스 `85e8200` → Argon Minor 반영 `02fd545` → PM preflight CHANGES REQUIRED
- R1/R2 보완 `89e9789`(RED) → `8754d90`(수정 + 새 prereg)
  - pass였을 행만 raw 누락으로 invalid가 된다. 유효 FAIL과 ref_failed는 유지된다
  - F1 구간: ≤0.95 / >0.95·≤1.05 / >1.05
- 각 단계 전체 npm 7단계 exit 0, Argon APPROVE

## 제품 변경 (정확히 두 곳)
- `src/core/policy.ts`의 `hasTechnicalTokenShape(line)`, `isShellCommandLine(line)` 맨 앞에
  `if (line.length === 0) return false;`
- 그 밖의 소스와 공개 API는 그대로다. 공백만 있는 줄은 대상이 아니다. K2와 classify 우회는 하지 않는다
- 빈 문자열의 기존 반환값은 둘 다 false다. 차이는 빈 줄 뒤 `TRACE_PREFIX_SCAN.lastIndex`(비공개)뿐이며 반복 시퀀스 테스트로 확인한다
- 테스트: `tests/policy-n34-k1.test.ts`(pre-K1 oracle 대조), `tests/policy-n32.test.ts` exact source에 K1 delta

## 2단계 timing 실측 (`research/results/n34-k1/perf-k1run1-timing.json`, 커밋 `944f25c`)
- 명령: `node research/src/n34-k1-perf.mjs --prereg=8754d90… --block=timing --output=…/perf-k1run1-timing.json`
- 측정 HEAD `4999c1f`, BASE `7e732e0`, Node v24.18.0, 전원 계획 GUID `381b4222-f694-41f0-9685-ff5bb260df2e`
  - raw의 계획 이름은 문자가 깨져 확인할 수 없다(정정 M2)
  - 2026-11-15 17:11:04–19:16:27 KST
  - 파일 sha256 `8f2a8d55…`(작업 사본 LF)
- 결과: 블록 `invalid`, exit 5
  - O1 9행은 모두 pass(attempt 1회)
  - O2/F3는 3회 모두 CAND A/A 무효라 `invalid`
  - O2 나머지 8행은 `notRun`
  - `rawIncompleteRows` 0, 추적 파일 1,132개 무변경, 임시 폴더 삭제
- O2/F3 무효의 내용(BASE A/A는 3회 모두 유효)
  - 3회 모두 median 조건만 실패했다
    - C2/C1 median 비 1.1220, 0.8884, 0.8692로 0.95–1.05 밖이다
    - 차이 +250.44, −262.11, −308.10 ms로 0.1 ms를 넘는다
  - p95 조건은 3회 모두 통과했다(`p95Ok=true`, 정정 M1)
    - 차이 −0.84, −2.74, −74.96 ms
    - 허용 절댓값 490.06, 494.21, 505.09 ms
  - CAND 표본은 약 1.9–2.2 s와 2.3–2.5 s 두 무리로 갈렸다. 무리별 표본 수가 attempt마다 달라 median이 옮겨 갔다
  - 원인은 확인하지 않았다(profiling 금지)
- 독립 재계산: `codex_review/remediation-impl-2026-11-13/n34-k1/phase2-recompute.{mjs,json}`
  - 확인 항목: 행 순서와 notRun, 보정 K, schedule 144개, nearest-rank median/p95, A/A, gate, 비율, digest/view, 행·블록 상태, exit
  - 불일치 0
- O1 행 C1/B1 median 비(같은 입력, K = 1, gate 모두 통과)
  - F3 0.6198, F4 0.4742, F5 1.0209, F6L 1.0126, F7L 0.9950
  - F1 0.4664, F2 1.0334, F6 1.0092, F7 1.0048
- F1 관찰(§6, gate 아님)
  - **O1/F1**: median 비 0.466374(C1 2184.09 / B1 4683.13 ms), p95 비 0.462862. 구간은 "≤0.95 개선 관찰"
    - 블록이 INVALID라 이 값은 무효 블록 안의 1회 관찰이다
  - **O2/F1**: 실행 안 됨, 비율 없음
  - run3의 main 대비 비율과 곱하지 않는다
- memory: timing이 pass가 아니므로 prereg §7에 따라 **NOTRUN**

## 읽기 전용 원인 분석 (`codex_review/remediation-impl-2026-11-13/n34-k1-analysis/`)
- 사실
  - O2/F3의 CAND는 3회 모두 두 무리가 뚜렷하다(간격 116–168 ms). BASE는 덜 뚜렷하다. 가장 큰 간격으로 나눈 hi−lo 차이는 B·C 모두 약 345–389 ms다(B는 약한 근거)
  - 사본별 lo 개수(C1/C2, 가장 큰 간격 경계)는 20/14, 14/22, 12/18이다. 30개 중 15번째 값인 median이 두 사본에서 서로 다른 무리에 놓여 A/A가 무효가 됐다
  - hi가 놓이는 자리에 사본·circuit·직전 arm·직전 무리·시간순 구조가 뚜렷하지 않다(연속 구간 z ≈ 0)
  - 두 무리는 주로 O2 행에 나타난다(run3 O2 여러 행 포함). O1에서는 K1 O1/F6 B 하나뿐이다
- 가설(미확정): 공유 heap GC(sourceMap 줄 객체 524만 개)가 유력하다. 그 밖에 I/O·OS 대기, CPU 스케줄, 사본별 JIT가 있다. K1 자체 원인은 근거가 없다
- 권장 D1(실행 안 함)
  - O2/F3 한정 진단이다. 공식 gate와 분리한다
  - 진단 전용 worker로 표본마다 GC 사건, cpuUsage, index/summarize 구간, heap을 기록한다
  - 두 조건(그대로, 표본 사이 gc 강제)을 각 child 3개로 교대한다
  - 상한 60분, 재시도·gate 없음
  - 대안: 같은 프로토콜 재실행, K1 보류

## 이후 (사용자·PM 결정 필요)
- D1, 새 공식 run, 프로토콜 변경, Ready, merge는 모두 승인 대상이다
- run3 PASS를 K1 HEAD의 PASS로 쓰지 않는다. N-34 handoff에는 링크만 남긴다
