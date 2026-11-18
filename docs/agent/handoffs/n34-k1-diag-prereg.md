# N-34 K1 D1 진단 사전 등록 (탐색적 진단, 성능 gate 아님)

- 근거
  - 승인안 `codex_review/review_2026-11-16_n34-k1-d1-approval.md`: 2026-11-16 사용자 승인. 이 문서와 다르면 승인안이 우선한다
  - 준비 요청 `review_2026-11-16_n34-k1-d1-prep-request.md`
  - 배경 초안: `n34-k1-analysis/analysis.md` §6. 표현이 다르면 승인안을 따른다
- 상태: **준비 완료 전, 미실행**. 본 D1은 primary preflight와 실행권 전달 뒤 1회만 한다. 이 문서는 실행 전에 고정한다
- 공식 K1 프로토콜(`n34-k1-prereg.md`, `n34-k1-perf.mjs`)과 분리한다. 그 파일과 raw는 바꾸지 않는다
- D1 결과는 K1 성능 PASS, F1 위험 해소, 원인 확정, 유의성 판정에 쓰지 않는다

## 1. 파일
- runner: `research/src/n34-k1-diag.mjs`
  - `--check-only`: synthetic 검사
  - `--check-run`: 64 KiB 확인
  - 인자 없음: 본 D1
- worker: `research/src/n34-k1-diag-worker.mjs`
- 입력·연산: `research/src/n34-cr-policy-perf-inputs.mjs`(기존 파일, 변경 없음)의 `makeInput`, `runO2`, `o2View`
- `--prereg`는 위 세 파일과 이 문서를 마지막으로 바꾼 커밋이어야 한다. 작업 트리가 clean이 아니면 실행을 거부한다

## 2. 고정 조건
- 코드
  - BASE `7e732e0e07a1977dbf0c754319fd3a726924621e`
  - CAND `4999c1f14b229d8c856200d49fdacd2d4611dc81`(현재 HEAD가 아닌 고정 SHA)
- snapshot은 공식 K1 하네스와 같은 방법으로 만든다: git archive → `npm ci --ignore-scripts` → tsc
  - A/A 사본(B2, C2)은 dist를 바이트 복사한 것이다
  - 검사: lockfile 동일, src 차이 = `2 0 src/core/policy.ts`, dist/src/core에서 다른 파일은 policy.js뿐
- Node v24.18.0, Windows. 다르면 시작 전에 중단한다(자동 설치·대체 없음)
- 입력·연산
  - O2/F3, `makeInput('F3', size)`. 본 D1은 10,485,760 bytes, 확인 실행은 65,536 bytes
  - K = 1
  - 사본 4개 B1·B2(BASE), C1·C2(CAND)
- schedule: 공식과 같은 circuit `ABCDBDCADACB`·`ADACDBDCBABC`를 교대한다(A=B1, B=B2, C=C2, D=C1)
  - warmup 2 circuit(24표본) + 측정 10 circuit(120표본) = **child당 144표본**, 사본별 측정 30개
- child: fresh hidden process(`windowsHide: true`), 모두 `--expose-gc`, 그 밖의 flag 없음
  - 본 D1: 6개, 순서 **a1 b1 b2 a2 a3 b3**
  - 확인 실행: a1 b1 2개
- 조건
  - a: 표본별 명시적 GC 0회
  - b: **144표본 각각 직전** `gc()` 1회
    - 첫 warmup을 포함한다
    - heap·CPU 사전값을 읽기 전에 부른다
    - 마지막 표본 뒤에는 부르지 않는다
  - 두 조건 공통: child마다 지원 probe `gc()` 1회. b의 144회와 따로 센다
  - observer·probe·drain·계측 위치는 a·b가 같다
  - 강제 GC는 heap 상태와 표본 간격을 함께 바꾼다. b − a를 GC 이월만의 효과로 해석하지 않는다

## 3. 원자료 (child별 JSONL, 기록 즉시 동기 쓰기)
- 위치: `research/results/n34-k1/<run>/child-<위치>-<조건>.jsonl`
- 요약: `research/results/n34-k1/<run>.json`
  - `<run>`은 본 D1이 `diag-<name>`, 확인 실행이 `diagcheck-<name>`이다
  - 둘 다 이미 있으면 덮어쓰거나 다른 이름으로 다시 시도하지 않고 거부한다
- record 종류
  - `start`: pid, Node, execArgv, 조건, gc 함수 유무
  - `probe`: 호출 전후 `performance.now()`, 관측된 FORCED 사건, `supported`, `clockOk`, 대기 시간
    - 대기는 최대 1 s
    - `clockOk`: FORCED 사건의 startTime이 호출 전후 now() 사이에 들어야 한다
  - `digest`: schedule 전, 사본마다 공식 `runO2`를 따로 1회 호출해 얻은 공개 view의 sha256
  - `forced`(b만): 표본 번호와 강제 GC 창의 시작·끝
  - `sample`: 표본 번호, label, arm, t0·t1·t2, wall·index·summarize ms, CPU user·system µs, 표본 전후 heap(used·total)
  - `gc`: 관측된 모든 사건. seq, source(callback/takeRecords), startTime, duration, `detail.kind`, `detail.flags`, 도착 시각
  - `drain`: 완료 여부, 단계 수, 시간
  - `end`, `error`
- 시간 구간
  - t0 = `indexArtifact` 직전, t1 = 그 직후, t2 = `summarizeArtifact` 직후
  - 호출 순서는 `runO2`와 같다. 결과 객체는 표본 함수 안에서만 참조되고 끝나면 버려진다
  - byteLength 확인은 t2 뒤(구간 밖)에 한다
- drain: 마지막 표본 뒤 100 ms 간격으로 양보하며 `takeRecords()`와 callback 항목을 모은다
  - 연속 2회 새 사건이 없으면 완료, 최대 2 s
  - 완료는 모든 사건을 관측했다는 수학적 보증이 아니다

## 4. 파싱과 child 상태
- JSONL 손상은 정상화하지 않고 목록으로 남긴다: 잘린 마지막 줄, 중간 parse 오류, 빈 줄, 끝 개행 없음
- `completed` 조건(모두 만족)
  - exit 0, 스트림 손상 없음, start/end 있음
  - 표본 144개가 schedule 순서·arm·label과 일치하고 필드가 모두 있음
  - digest 4개 동일
  - a는 forced 0개
  - b는 forced 144개이고, 각 forced가 같은 번호 표본의 t0 이전에 끝남
- 하나라도 어긋나면 `invalid`, 시간 초과는 `timeout`이다. 받은 부분 원자료는 그대로 보존한다
- GC 관측 상태
  - `supported`: probe 관측, clockOk, drain 완료
  - `incomplete`: probe는 관측했으나 clockOk나 drain이 아님
  - `unsupported`: probe 미관측
  - supported가 아니면 GC 겹침 값은 null이다(0으로 바꾸지 않음). wall 자료는 유지한다

## 5. GC 귀속 (관측 연관성이며 GC 비용·인과적 손실이 아님)
- 사건 구간 E = [startTime, startTime + duration], 표본 구간 S = [t0, t2]
- 겹침 = max(0, min(끝) − max(시작)). kind별로 S로 자른 구간의 **합집합 길이**를 쓴다(중복 합산 없음)
  - kind별(major, minor, incremental, weakcb, other)과 전체로 계산한다
  - major는 단계 구간 [t0, t1], [t1, t2]로도 계산한다
- 표본 안에서 시작한 사건 수도 kind별로 센다
- **강제 GC 창과 표본 창 양쪽에 겹치는 사건**이 있으면 그 표본의 귀속은 `ambiguous`다. 값은 null로 두고 사건 번호를 남긴다
- 강제 창에만 걸친 사건은 원자료에 남고 표본 귀속에는 들어가지 않는다
- 표본 밖 사건 수와 강제 창 사건 수를 따로 센다

## 6. 서술 (판정 기준 없음)
- 반복 단위는 child이고 조건당 3개다. 표본을 독립 반복으로 본 유의성 검정이나 원인 확정은 하지 않는다. 사후 표본 제외는 없다
- child × 역할(B = B1+B2, C = C1+C2)
  - 사본별 wall·index·summarize: nearest-rank median(정렬[14]), p95(정렬[28]), p95 − median
  - 역할별 60개: median(정렬[29]), p95(정렬[56]), p95 − median
  - 사본 median 비(B2/B1, C2/C1). 서술용이다
  - CPU/wall = (deltaUserUs + deltaSystemUs) / (1000 × wallMs)
    - 프로세스 전체 CPU다. 코어·주파수·JIT·GC 원인을 식별하지 않는다
  - GC: 귀속 상태별 표본 수
    - 모든 측정 표본이 observed일 때만 산출: major 겹침 > 0 표본 비율, major 겹침 median·p95·합
  - Spearman(wall, major 겹침): 동률은 평균순위, 분산 0·결측·n < 3이면 null과 이유
  - 보조: 가장 큰 간격 분할(간격, 양쪽 개수)
    - 간격 < 100 ms이거나 한쪽 < 10이면 `no-separated-modes`
    - 군집 서술에만 쓰고 연속 통계를 무효로 만들지 않는다
- a/b 비교
  - 짝은 실행 위치 (1,2), (4,3), (5,6)이고 각 b − a를 계산한다
  - 짝별 방향: 낮음/높음/동률/판단 불가
  - 세 짝을 합친 방향: 모두 같으면 그 방향, 다르면 섞임, 하나라도 판단 불가면 판단 불가
  - 대상: C·B의 wall median, wall p95 − median, 사본 median 비, major 겹침 비율, CPU/wall median
  - child가 completed가 아니면 그 짝은 판단 불가다

## 7. 시간·중단·정리
- 상한: **runner 시작부터 snapshot 빌드 포함 75분**, child당 12분
- 다음 child를 시작할 때 남은 시간이 12분 미만이면 시작하지 않고 `notRun`으로 기록한다
- child 실패 뒤에도 다른 예정 child는 계속하고, 재시도는 없다
- 시간 초과 child는 그 child의 PID 트리만 종료한다(다른 프로세스는 건드리지 않음)
- 정리
  - 임시 폴더는 실제 경로가 OS 임시 폴더 바로 아래이고 `tco-n34-k1-diag-`로 시작할 때만 지운다
  - 전후 추적 파일 해시를 비교해 변경 0을 확인한다
- 종료 코드: 0 = 모든 child completed, 2 = 일부 child가 completed 아님 또는 notRun, 1 = 하네스 오류
- 본 D1 예상 45–60분은 계측·강제 GC 비용을 모르는 추정치다
- 하네스 작성, 검토, 64 KiB 확인 시간은 75분과 별도다. 진단 중에는 다른 무거운 작업을 하지 않는다

## 8. 검증과 실행 순서
1. synthetic RED(`5ab6246`) → GREEN, `--check-only` 통과
   - 경계, 합집합·중복, 강제 창 교차, 단위, Spearman 예외, 누락·손상·부분 출력, 시간 상한, child 종료, 덮어쓰기 거부
2. 기존 npm 7단계 통과
3. 64 KiB 확인 1회(a1, b1)
   - 필드·probe·시계·drain·스트림 보존을 확인한다. 실패해도 다시 실행하지 않고 그대로 기록한다
   - 성능 추론이나 본 D1이 아니다
4. primary preflight → 실행권 전달 → 본 D1 1회
```
node research/src/n34-k1-diag.mjs --check-only
node research/src/n34-k1-diag.mjs --check-run --prereg=<sha> --output=research/results/n34-k1/diagcheck-<name>.json
node research/src/n34-k1-diag.mjs --prereg=<sha> --output=research/results/n34-k1/diag-<name>.json
```
