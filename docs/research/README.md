# 연구 문서 안내

이 폴더와 `research/`의 문서를 읽는 순서를 안내한다. 파일은 재현성을 위해 지우지 않고 모두 보존한다.
수치의 기준은 논문 초안과 `research/results/`의 원자료이며, 이 안내는 수치를 옮겨 적지 않는다.

## 1. 핵심 논문과 결과

먼저 읽는다.

| 문서 | 내용 |
|---|---|
| [논문 초안](./image-first-paper-draft.ko.md) | 실험 1–3 결과와 한계. 문장마다 원자료 위치를 단 증거 연결본이다. 투고본(hwp)은 조판 때 출처 메모를 뺀다 |
| [실험 1 결과](../../research/results/rq1-sweep-001/README.md) | 변환별 공급자 청구 이미지 토큰과 공개 회계식 대조 |
| [실험 2 결과](./2026-10-16-experiment2-results.md) | 단일 질의 held-out: 영역 선택과 원본 재요청 |
| [실험 3 결과](./2026-10-15-experiment3-results.md) | 다중 턴 세션 held-out: 전체 유지, compact, 원본 보존 발췌, 조합 |
| [출처 등록부](./image-first-sources.md) | 논문이 인용하는 1차 자료 |

## 2. 프로토콜과 결정 메모

결과가 어떤 사전 설계와 결정을 거쳐 나왔는지 볼 때 읽는다.

| 문서 | 내용 |
|---|---|
| [실험 3 프로토콜](./2026-10-15-experiment3-protocol.md) | 세션 대본, 조건, 분석 계획 |
| [이미지 평가 프로토콜](./image-first-evaluation-protocol.md) | 실행 전 초기 설계 기록(역사적 문서) |
| [이미지 프로토콜 결정 메모](./image-protocol-decision-memo.md) | Task 30 결정 원장 |
| [첫 변환 연산 결정](./first-transform-jpeg-probe-decision.md) | 변환 연산과 JPEG encoder probe |
| [이미지 토큰 비용 모델](./image-token-cost-models.md) | 공급자별 회계식 비교 |
| [변환 provenance 격차](./image-transform-provenance-gap.md) | Task 29 분석 |
| [JPEG codec 조사](./jpeg-codec-feasibility.md), [JPEG 검증](./jpeg-runtime-validation.md) | 제품 JPEG 입력 프로필 근거 |
| [JPEG 주장 추적](./wbs65-jpeg-traceability.md), [이미지 race 범위 감사](./wbs65-image-race-coverage.md) | WBS 6.5 테스트–주장 대조 |
| `research/plans/` | 사전 등록 확정본, runbook, 논문 수치 대조표, 투고 형식 메모 |

텍스트 연구 시기(2026-09)의 문서는 이미지 연구의 증거가 아니며 역사적 기록이다.
[layered adaptation 논문 계획](./2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md),
[평가 프로토콜](./2026-09-07-layered-adaptation-evaluation-protocol.md),
[모델 선정](./2026-09-08-experiment-model-selection.md),
[문헌 노트](./literature/2026-09-12/README.md).
오프라인 연구 도구 문서([dataset format](./dataset-format.md), [scoring](./scoring.md),
[development seed](./development-seed.md), [exact checks](./exact-checks.md),
[run planning](./run-planning.md), [mock runs](./mock-running.md),
[paired success](./paired-success.md))도 이 시기의 것이다.

## 3. 원자료와 증거

수치를 재검산하거나 재현할 때 본다.

| 위치 | 내용 |
|---|---|
| `research/results/` | 실험별 원자료(`*.jsonl`: 응답·채점·호출 기록), 분석, 요약. held-out 결과는 `exp2-heldout/`, `s3-heldout/`, 실험 1은 `rq1-sweep-001/` |
| `research/src/`, `research/figures/` | 연구 하네스와 그림 생성 스크립트 |
| `docs/research/evidence/` | 제품 코드 작업의 측정 증거(Task 18·22·25·33, N-01, F-21). timestamp JSON은 수정하지 않는다 |
| `docs/research/datasets/` | 오프라인 도구용 예시 데이터 |
| `docs/agent/handoffs/` | Task별 작업 기록. 결정과 검증 이력을 추적할 때만 본다 |
| `docs/archive/` | 초기 플러그인 제안서 PDF |
