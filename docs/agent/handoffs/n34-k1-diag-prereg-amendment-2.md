# N-34 K1 D1 사전 등록 보완 2 (P01: GC·probe·drain 교차 무결성, 순위 표기)

- 근거
  - primary 판정 `codex_review/review_2026-11-16_p01-preflight-primary.md`: CHANGES REQUIRED(P01-R1 Major, P01-M1 Minor)
  - 수정 요청 `review_2026-11-16_p01-preflight-fix-request.md`
  - 사용자 D1 승인은 유효하다. 이번은 승인된 무결성 구현의 누락 수정이다
- 원 사전 등록 `n34-k1-diag-prereg.md`(`8f29f19`)와 보완 1(`00404de`)은 바꾸지 않고 동결한다
  - 이 보완은 **관측 무결성 검사와 요약 설명만** 더한다
  - 측정 설계, 조건, 순서, GC 횟수, 75분 예산은 그대로다. 앞 문서와 다르면 이 보완이 우선한다
- 본 D1의 `--prereg`는 이 문서를 추가한 커밋이어야 한다. harness 파일 목록에 이 문서가 들어간다
- 상태: 미실행. primary 재검토와 실행권 전달 뒤에 1회만 실행한다

## 1. 교차 무결성 (P01-R1)
- 아래는 기존 worker(`n34-k1-diag-worker.mjs`, 변경 없음)의 불변식이다. 새 임계값이나 측정 조건은 만들지 않는다
- 하나라도 어긋나면 GC 관측은 `incomplete`다
  - 겹침과 귀속 값은 null이다
  - 유효한 wall과 원본 JSONL은 보존한다
  - 측정 status(completed/invalid)는 바꾸지 않는다
- drain
  - `totalEvents`는 음이 아닌 안전 정수이고, 실제 GC 레코드 수와 같아야 한다
    - worker는 기록한 GC 수를 적는다
    - GC seq 연속 검사(보완 1)와 함께 쓰면 끝부분 누락, 전체 누락, 중간 누락, 여분 레코드를 잡는다
    - 위반 사유: `drain:totalEvents_value`, `drain:totalEvents_mismatch`
  - `complete === true`이면 `steps ≥ drainQuietSteps(2)`여야 한다. worker는 연속 2회 조용해야 완료로 적는다
    - 위반 사유: `drain:steps_below_quiet`
    - drain 시간에는 새 상한을 두지 않는다(OS 지연을 무효로 만들지 않음)
- probe 구간
  - worker의 동작
    - observer를 동기식으로 붙인 직후 capture를 시작한다
    - capture가 끝나면 즉시 동기식으로 probe 레코드를 쓴다
    - capture한 사건은 모두 GC 레코드로도 쓴다
  - 따라서 **probe 레코드 앞의 GC 레코드가 capture 구간 전체**다
    - 저장 64 KiB raw a·b에서 확인했다: probe 앞 레코드는 start와 gc 1개, `observedEvents` 1, `forcedEvents`가 일치
  - `observedEvents`는 정수이고 그 구간의 GC 레코드 수와 같아야 한다(`probe:observedEvents`)
  - `forcedEvents` 각 항목
    - startTime·duration은 유한수(duration ≥ 0), flags는 정수이고 FORCED bit가 있다(`probe:forcedEvents`)
    - 그 구간에서 FORCED bit가 있는 GC 레코드와 순서·startTime·duration·flags가 정확히 같아야 한다. 근사 매칭이나 시간 허용폭은 없다
    - 누락·중복·스트림 불일치는 `probe:stream_mismatch`다
  - `clockOk === true`이면 forcedEvents 중 하나가 [before, after]에서 시작해야 한다(`probe:clock_contradiction`)
- probe가 없거나 `supported === false`이면 기존처럼 `unsupported`다

## 2. 부분 요약 표기 (P01-M1)
- `rankNote`는 실제 n의 0-based nearest-rank 위치 `sorted[ceil(0.5n) − 1]/sorted[ceil(0.95n) − 1]`를 적는다
  - n 30 → [14]/[28]
  - n 60 → [29]/[56](종전 표기와 같음)
  - n 58 → [28]/[55]
  - n 29 → [14]/[27]
- child가 completed가 아니면 요약의 `scope`는 `partial_diagnostic_only`, completed이면 `completed`다
  - 부분 요약은 invalid·timeout child의 진단 자료일 뿐이다
  - 원 문서 §6대로 a/b 비교(`comparisons`)에는 쓰지 않는다
  - 부분 통계 계산과 분모 정책은 보완 1 그대로다

## 3. 기존 64 KiB 확인과 재분석
- `diagcheck-64k-1`은 구 코드 `8f29f19`의 결과다. 다시 실행하지 않았다
- 수정 코드로 읽기 전용 재분석: `codex_review/remediation-impl-2026-11-13/p01-preflight-fix/p01-reanalyze.json`
  - 정상 288표본은 completed·supported이고, 요약이 저장값과 같다
  - primary 모순 12건(6종 × a·b)은 모두 incomplete/null이다. wall n 60은 유지된다
  - n 58 부분 요약
    - invalid, `partial_diagnostic_only`, `sorted[28]/sorted[55]`
    - 값은 독립 nearest-rank 계산과 같다

## 4. 실행
```
node research/src/n34-k1-diag.mjs --check-only
node research/src/n34-k1-diag.mjs --prereg=<이 보완 커밋> --output=research/results/n34-k1/diag-<name>.json
```
