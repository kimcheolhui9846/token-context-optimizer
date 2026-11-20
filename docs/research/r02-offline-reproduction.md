# 고정 원자료에서 재현한 실험 1–3과 분모 검증

기준 커밋 `7040907612f8b24058e5b4b48d0842c8425a0c3f`에서 2026-10-26 [재현 기록](../../research/plans/2026-10-26-repro-check.md) §3이 지정한 파일 **24개를 새로 생성했다. 모두 기준 Git blob과 바이트 단위로 일치했다.** 실험 응답은 당시의 기록을 사용했다. 새 모델 호출은 0건이다.

## 단위와 제외 기준

실험 2는 모델별로 36개 원천 family × 4조건 × 5개 실제 arm의 720개 슬롯이 있다. 원응답 키를 배정 매니페스트와 대조한 결과 두 모델 모두 성공 720, 최종 실패·미시작·중복 0이었다. 탐색용 D′ 144개는 A·C 응답에서 유도한다. 정확도 차이의 재표집 단위는 family다.

| 모델 | D 질의 | 재요청 | D 호출 | D 총 입력 토큰 | 질의당 | 호출당 | 전체 arm 호출 |
|---|---:|---:|---:|---:|---:|---:|---:|
| GPT-4o | 144 | 11 | 155 | 91,438 | 634.99 | 589.92 | 731 |
| Haiku | 144 | 16 | 160 | 110,139 | 764.85 | 688.37 | 736 |

D의 원응답에서 최초·재요청 입력의 합을 확인했다. [실험 2 결과표](../../research/results/exp2-heldout/README.md) §2의 635와 765는 질의당 평균의 반올림값이다. 두 열의 단위를 고쳤고 여섯 행의 토큰 수치 열을 두 모델의 `exp2-analysis.json`과 대조했다.

실험 3은 모델별 24세션 × 5조건 = 120개 세션·조건 결과, 960개 채점 턴, 미시작 0이다. 신뢰구간은 세션을 짝지어 재표집한다. 종료된 결과의 `session`, `condition`, `attemptId`와 일치하는 호출을 집계했다.

| 모델 | 기록된 호출 | 집계 포함 | 중단 시도에서 제외 | 제외 비용(USD) |
|---|---:|---:|---:|---:|
| GPT-4o | 1,460 | 1,453 | 7 | 0.022505 |
| Haiku | 1,589 | 1,589 | 0 | 0 |

실험 1의 단위는 이미지 측정 행 66개다. 청구 입력과 예측식의 정확 일치는 GPT-4o high와 low 각각 66/66이다. Haiku는 66행 모두 예측식보다 3토큰 많았고, 기록된 count_tokens와 청구량은 66행 모두 같았다. 실패 0건은 [당시 실행 기록](../../research/results/rq1-sweep-001/README.md)에 따른다.

## F-10 처분

**텍스트 파일럿의 미해결 항목으로 보류한다.** [텍스트 평가 프로토콜](2026-09-07-layered-adaptation-evaluation-protocol.md)의 분석은 범주 6개에 각각 family 4개, 전체 24개 군집을 놓고 각 범주 안에서 복원추출하는 10,000회 percentile bootstrap을 제안했다. v1 채점기는 이 분석을 구현하지 않았다. 작은 층에서 구간의 실제 포괄률이 충분한지는 검증되지 않았다. 이미지 실험 2·3은 표집 대상과 추정량이 달라 F-10을 해소할 대체 근거가 없다. 텍스트 트랙을 재개할 때 구간 추정법·seed·분위수 규칙을 결과 확인 전에 고정하고, 해당 표본 설계의 포괄률 근거나 독립 방법론 검토를 남긴 뒤 종결 여부를 판단한다.

## 재현 절차

Windows, Node v24.18.0, sharp 0.35.4, tesseract.js 5.1.1. 연구 패키지의 lockfile을 사용했다. 원래 OCR 캐시가 이전 경로에 없어 공개 패키지 `@tesseract.js-data/eng@1.0.0/4.0.0_best_int`에서 영어 자료를 별도로 준비했다. 압축을 푼 `eng.traineddata`의 SHA-256은 당시 기록과 같은 `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`이다. 생성 단계에서는 연구 키 환경변수를 제거하고 Node의 fetch·TCP 연결·UDP 송신을 차단하는 preload를 적용했다. 주 프로세스와 OCR worker에 적용된 로그에서 차단 대상 요청은 0건이었다.

빈 임시 작업폴더의 `research/`에 고정 Git blob을 원시 바이트로 복원했다. 아래 경로와 명령은 이 폴더 기준이다. 결과 폴더의 기존 요약 파일을 생성 위치로 복사하지 않는다.

| 입력 | 기준 커밋의 Git tree 또는 blob |
|---|---|
| `research/src` | `18f3f6983a6a64f4219607b588feef673a5fd3a9` |
| `research/results/rq1-sweep-001` | `b1572f513da251ca3d6889dc2d57fd29972b678a` |
| `research/results/exp2-heldout` | `7b9402c61c38501f6d9be4f2ce698c45db1b52e2` |
| `research/results/s3-heldout` | `55e1959009db36c3d55a9b2f57ef1f8577aef86f` |
| `research/package-lock.json` | `6b103b97c99527975958a7cb0fd023e0dc134cf0` |

| 실행 | 입력 배치와 생성 명령 |
|---|---|
| RQ1 | `results/rq1-sweep-001/rows.jsonl`을 `out/rq1-runs/rq1-sweep-001/`에 놓고 `node src/rq1-summarize.mjs --run-id rq1-sweep-001` |
| E2 | `results/exp2-heldout/`의 family·slot 매니페스트를 `out/exp2-heldout/{families,slots}.json`에, 모델별 `config.json`, `responses.jsonl`을 `out/exp2-heldout/runs/<id>/`에 둔다. `node src/summarize.mjs --set exp2-heldout --run-id <id>` 다음 `node src/exp2-analyze.mjs --set exp2-heldout --run-id <id>`. ID는 `exp2-held-gpt4o`, `exp2-held-haiku`. 분석 seed 20261016 |
| E3 | `sessions-heldout.json`을 `out/sessions/heldout/sessions.json`에 놓고, 모델별 `config.json`, `calls.jsonl`, 세션 결과 `*.S?.json`을 `out/session-runs/<id>/`에 둔다. `node src/session-summarize.mjs --run-id <id>` 다음 `node src/session-analyze.mjs --run-id <id>`. ID는 `s3-heldout-gpt4o`, `s3-heldout-haiku`. 분석 seed 20261015 |
| 그림 데이터 | `results/s3-heldout/{gpt4o,haiku}/`의 설정·호출·세션 결과에서 `node src/figure-data.mjs` |
| 입력 생성 | 집계에서 사용한 매니페스트 사본을 생성 경로에서 옮긴다. `node src/sessions.mjs --split heldout`과 `node src/generate.mjs --set exp2-heldout`을 실행한다. 이어서 `.cache/eng.traineddata`를 확인하고 `node src/variants.mjs --set exp2-heldout`을 실행한다. |

## 생성 파일별 대조

경로는 `research/` 기준이다. 아래 SHA-256은 생성물과 커밋 blob 양쪽에서 동일했다.

| 실행 | 생성물 | SHA-256 |
|---|---|---|
| RQ1 | `results/rq1-sweep-001/summary.json` | `dac42942f862b885371b31a6e8379c3cc40fbe4edf520777d693ca93874a4385` |
| RQ1 | `results/rq1-sweep-001/summary.md` | `cf6f0c0de9f9f614781da995aee2bb5d6de915420a980783eb7140663a2840e3` |
| E2 | `results/exp2-heldout/gpt4o/graded.jsonl` | `ca5734e8f6095f78d6e216ff9ac616a4cbcb1fd2e166ec58232f882ca36af27e` |
| E2 | `results/exp2-heldout/gpt4o/summary.json` | `2d43d35b0d2bd98c8218b6e883dc829366e2e98e1df90b52d2a7cb9f6b7899f7` |
| E2 | `results/exp2-heldout/gpt4o/summary.md` | `e305e955da7f3a2e7abbb51a1f10d610f4107155de738cf7f48e3062e0ac87e5` |
| E2 | `results/exp2-heldout/gpt4o/exp2-analysis.json` | `8172135968620d1c2f6aec7998eb7e11d2cd2e06cf840bdbcc631dd443dee814` |
| E2 | `results/exp2-heldout/gpt4o/exp2-analysis.md` | `e856adaf2a00e58f3c1047f4ea53286ad8fe5d11d4271c7bf2bb563efdd3aeb3` |
| E3 | `results/s3-heldout/gpt4o/summary.json` | `367dfe0e0ba731bb4fe52fd743ff44737ae268394d6197ce5004292abe31508d` |
| E3 | `results/s3-heldout/gpt4o/summary.md` | `36475802a1e7cf9ed57a918b6c633161ac90f423fd133c52b665f1c5517a12f7` |
| E3 | `results/s3-heldout/gpt4o/analysis.json` | `88f4eb78b465f9c07e82bdd3af372bdbee586c0b15679d2b30de10260fd87c79` |
| E3 | `results/s3-heldout/gpt4o/analysis.md` | `d8fb0106b11b03eb4d0da81e02a814a9402133cc7ce345dd124a2cfdd69148b2` |
| E2 | `results/exp2-heldout/haiku/graded.jsonl` | `db3be9cae1726a6b886c443651cd3fc7275a04e333ed9417db5e54c0a5daf3fb` |
| E2 | `results/exp2-heldout/haiku/summary.json` | `6d6977a6540b54de030e2f54d5cddce5772935a59cade6f22ada8a3fd456b5dd` |
| E2 | `results/exp2-heldout/haiku/summary.md` | `79429a98b901e06001d943a55ee96d957b579b00a2f2c281d0065f8e49ee656f` |
| E2 | `results/exp2-heldout/haiku/exp2-analysis.json` | `e467ced59e9fb43deda5c2eba88065528ff2bd5cdafecbbbc0cb2b2fcaa121d3` |
| E2 | `results/exp2-heldout/haiku/exp2-analysis.md` | `719e7b191e1b52d50b821038358dbcbfc2e9b4a6df50ec1aa1c7b09b5cb84422` |
| E3 | `results/s3-heldout/haiku/summary.json` | `3a20dad04224ee6ff998d3506f3eab76de5885eb5e5cddede89dbad4dfb39404` |
| E3 | `results/s3-heldout/haiku/summary.md` | `1d57835ddfce7f6a0be02b5d6055968ec7af4a26a64ee1ca7b05435be2b00835` |
| E3 | `results/s3-heldout/haiku/analysis.json` | `f245103a4e7dc5dd9abf6b58a2210d0285e44e97f638ae46b630826350c3563a` |
| E3 | `results/s3-heldout/haiku/analysis.md` | `75289376629279867b2b80df44284bf9885062071a3c57b116894f4f9d626ac6` |
| 그림 데이터 | `figures/data/heldout-sessions.json` | `67cfb856584170d242aecee10c2e1cd86a18bf051e05f0c73b129eda8c61518f` |
| 입력 생성 | `results/s3-heldout/sessions-heldout.json` | `b88f64e3df671fff20a8562f7fbe1ba929b94f56d842e452b72d0cfb979d5da2` |
| 입력 생성 | `results/exp2-heldout/families-exp2-heldout.json` | `71e2648f738d7094a39f261304817757f644a6e98ec1f6a089d907d3f006c313` |
| 입력 생성 | `results/exp2-heldout/slots-exp2-heldout.json` | `36ae3dec8dedef982029de97e52d8219cca7ac83a96c86f63e0f282260efba12` |
