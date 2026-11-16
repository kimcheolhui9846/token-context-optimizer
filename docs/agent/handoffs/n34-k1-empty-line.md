# N-34 K1: 빈 줄 빠른 반환 (Task handoff)

- 요청서: `codex_review/review_2026-11-15_n34-k1-implementation-request.md`, 2단계 `review_2026-11-15_n34-k1-phase2-request.md`, 원인 분석 `review_2026-11-15_n34-k1-invalid-analysis-request.md`·보완 `review_2026-11-15_n34-k1-analysis-revision-request.md`, D1 승인안 `review_2026-11-16_n34-k1-d1-approval.md`·준비 `review_2026-11-16_n34-k1-d1-prep-request.md` (Codex PM, 추적 안 됨)
- 범위: N-34 F1 정보용 위험에 대한 보완. 같은 branch `claude/n34-cr-line-policy`, 같은 Draft PR #119
- 구현: Claude Code (`claude-opus-5-5`). 계획·최종 판정: Codex PM
- 시작 HEAD `7e732e0`(pre-K1), PR base `main` `5d668f9`. prereg `8754d90`(`n34-k1-prereg.md`, 고정)

## 현재 상태: 2단계 timing **INVALID**(exit 5), memory **NOTRUN**, primary **CHANGES REQUIRED**
- primary 판정 `review_2026-11-15_n34-k1-phase2-final.md`: 1,728표본 독립 재계산 불일치 0. 필수 timing과 memory가 미충족이다
- 문서 정정 M1·M2와 읽기 전용 원인 분석을 마쳤다. 새 측정은 하지 않았다
- 분석 보완은 primary PASS WITH NOTES(`review_2026-11-16_n34-k1-analysis-revision-final.md`)를 받았다
- **D1은 2026-11-16 사용자 승인**을 받았다(승인안이 analysis §6보다 우선)
  - 준비(`8f29f19`, 64 KiB 확인 `d170881`) 뒤 primary preflight가 CHANGES REQUIRED였다(`review_2026-11-16_n34-k1-d1-preflight.md`)
    - R1: 75분 예산이 빌드·보조 명령에 미적용
    - R2: 손상 레코드가 completed/supported로 통과
    - M1: CPU 틱 원인 단정
  - 수정 완료: RED `aa328ef` → GREEN `07f88fa` → **보완 prereg `00404de`**. 본 실행의 `--prereg`는 `00404de`다
  - **본 10 MiB D1은 미실행이다. primary 재검토와 실행권 전달을 기다린다**
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
- 결과: 블록 `invalid`, exit 5. O1 9행 pass, O2/F3는 3회 모두 CAND A/A 무효, O2 나머지 8행 notRun
  - O2/F3: median 조건만 실패(C2/C1 1.1220, 0.8884, 0.8692). p95는 3회 모두 통과(정정 M1). BASE A/A는 유효
  - `rawIncompleteRows` 0, 추적 파일 무변경. 독립 재계산(`n34-k1/phase2-recompute.json`) 불일치 0
- F1 관찰(gate 아님): O1/F1 C1/B1 median 비 0.466374, p95 비 0.462862. 무효 블록 안의 1회 관찰이다. O2/F1은 실행 안 됨
- memory: timing이 pass가 아니므로 prereg §7에 따라 **NOTRUN**

## 읽기 전용 원인 분석 (`codex_review/remediation-impl-2026-11-13/n34-k1-analysis/analysis.md`)
- 사실
  - O2/F3 CAND는 3회 모두 두 무리였다(BASE는 덜 뚜렷)
  - 관찰된 A/A 무효는 rank-15 median이 두 사본에서 다른 무리에 놓인 것과 일치한다(C1/C2 lo 20/14, 14/22, 12/18)
  - 두 무리는 주로 O2 행에 나타난다
- 가설(미확정): 공유 heap GC 유력, I/O·스케줄·JIT. K1 고유 원인 근거는 부족하나 상호작용은 배제할 수 없다

## D1 진단 (승인안 기준, 준비 중)
- 파일: `research/src/n34-k1-diag.mjs`(runner·synthetic check), `research/src/n34-k1-diag-worker.mjs`
  - prereg `n34-k1-diag-prereg.md`(동결) + `n34-k1-diag-prereg-amendment-1.md`(무결성 검증·전역 예산)
- 고정: BASE `7e732e0e07a1977dbf0c754319fd3a726924621e`, CAND `4999c1f14b229d8c856200d49fdacd2d4611dc81`, Node v24.18.0, 기존 lockfile 빌드
- O2/F3, K = 1, 사본 B1/B2/C1/C2, 공식과 같은 교대 circuit
  - child당 warmup 24 + 측정 120 = 144표본
- child 순서 a1 b1 b2 a2 a3 b3. 모두 `--expose-gc`
  - a: 표본별 GC 0회
  - b: 144표본 각각 직전 GC 1회(heap·CPU 사전값 읽기 전)
  - 공통 probe GC 1회/child는 따로 센다
- 기록: GC 사건 원자료, probe·시계·drain 상태, wall, index/summarize, CPU µs, heap, digest
  - 표본마다 JSONL로 바로 써서 부분 raw도 보존한다
- 서술
  - CPU/wall = (user + system µs) / (1000 × wall ms)
  - GC 겹침은 합집합이다. 강제 창과 표본 창 양쪽에 걸친 사건은 ambiguous로 표시한다
  - 비교 짝은 위치 (1,2), (4,3), (5,6)의 b − a다
  - Spearman은 동률 평균순위를 쓰고, 분산 0이면 null과 이유를 남긴다
  - 유의성·인과 판정은 없다
- 상한: runner 시작부터 빌드 포함 75분, child 12분. 남은 시간이 12분 미만이면 notRun. 재시도 없음
  - 모든 subprocess는 min(자기 상한, 남은 예산)을 받는다. 만료 뒤에는 새 단계를 시작하지 않는다
- 무결성: 표본·forced·digest·control이 손상되면 invalid다. GC·probe·drain 메타데이터가 손상되면 incomplete/null이고 wall은 유지한다
- 해석 한계
  - observer의 동기식 JSONL 쓰기가 wall에 포함될 수 있다
  - 64 KiB 확인에서 CPU 증분은 이산 값으로만 관찰됐다(0인 표본이 a 73개, b 69개). 해상도의 원인은 입증하지 않았다
- 기존 64 KiB 확인은 구 코드 `8f29f19`의 결과다. 수정 코드로는 저장 raw를 읽기 전용으로 재분석만 했다(결과 일치)
- D1 결과는 K1 PASS나 F1 위험 해소로 쓰지 않는다

## 이후 (사용자·PM 결정 필요)
- 새 공식 run, 프로토콜 변경, Ready, merge는 모두 승인 대상이다
- run3 PASS를 K1 HEAD의 PASS로 쓰지 않는다. N-34 handoff에는 링크만 남긴다
