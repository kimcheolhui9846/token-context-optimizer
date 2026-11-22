# D01 원고 주장 정합성 대응표

대상은 [논문 초안](image-first-paper-draft.ko.md)이다. 출발점은 Draft #112의 고정 head `e1e53518626768d0b18380f7f59968a86f830e47`(원고 blob `87031e8d`)이고, R02·R03·R04·R06·R08이 병합된 main `927a5639`에 흡수했다. 주장 전체 지도는 [R01 지도](r01-claim-evidence-map.md)이며, 이 문서는 D01에서 바꾸거나 새로 대조한 주장만 적는다. 원고 행 번호는 D01 수정 뒤에도 #112와 같다(줄 추가·삭제 없음). 본문은 출처 괄호를 빼고 약 1,600자(국문 약 1,350자) 늘었다. 인쇄 쪽수에 주는 영향은 D02 조판에서 확인한다. 8면을 넘으면 180행 판정자 모델명 괄호부터 줄인다. 따라서 R01 지도의 행 번호는 그대로 쓸 수 있다.

**원칙** · 사전 등록 가설·판정, 표 2·3의 수치, 그림 데이터, RQ 문장은 바꾸지 않았다. R05·R07은 실행하지 않았으므로 그 결과를 쓰지 않는다. R09(데이터·언어·모델 외적 타당도)는 사용자 결정 대기이며, 원고에서는 "두 공급자와 실험 조건에 한정"으로만 다룬다. 해시와 커밋은 원고 본문에 넣지 않고 이 표에 둔다.

## 바꾼 주장

| 원고 행 | 최종 주장(요지) | 근거(경로·키) | 단위·분모 | 판정·한계 |
|---|---|---|---|---|
| 7, 13 | 초록: GPT-4o 늦은 회상 S1 13.9%, S3 81.9%, S0 93.1%를 관측값으로 기술한다("높아졌다"는 표현을 뺐다). 조건 순서가 고정되고 출력 상한이 공급자·조건별로 달라 출력 예산·검색 도구·순서 효과를 분리할 수 없다. | `research/results/s3-heldout/gpt4o/analysis.md:11-14,24`, R04 §9, R06 §11 | 세션 24, 턴 6–8 | 수치는 바뀌지 않았다. Haiku는 H3 미지지로 적었다. 인과 주장은 없다. |
| 23, 25 | 현재 제품에는 crop과 전체 개요(overview)가 있다. 영구 원본 보관과 OCR 결합기는 없다. 실험은 제품 이미지 도구를 평가하지 않았다. | `docs/image-artifacts.md` MCP crop use·MCP overview use, R08 §1(latest 도구 9개) | — | 기준은 R08 비교 기준 main `c201b69c`의 제품 문서다. 문서의 마지막 변경 커밋은 `830bf39`다. |
| 35 | C4: 캐시 반영 비용 절감의 감소는 고정 순서로 실행한 세션의 관측이다. | R06 §11 | 세션 24 | 표현만 한정했다. |
| 63 | `overview_image_artifact`는 area-average 리샘플링을 쓰고, 연구 썸네일은 sharp lanczos3를 쓴다. 두 출력의 픽셀·측정은 호환되지 않는다. 두 도구 모두 평가 대상이 아니다. | `docs/image-artifacts.md` MCP overview use | — | 제품 문서의 진술을 옮겼다. 새로 측정하지 않았다. |
| 69 | 실험 2 JPEG는 648슬롯, 고유 458개다. 현재 제품 strict에서는 458/458 거부(APP0 부재), tolerant-v1에서는 458/458 통과다. RQ1 JPEG 7개는 원본이 없어 분모에서 뺐다. | `research/results/r08-parity/jpeg-summary.json` `meta.jpegSlots`=648, `meta.uniqueJpeg`=458, `entry.outcomes` 458, `rq1SettingsOnly` 7, R08 §3 | 고유 바이트 458 | 결정적 수락·거부 결과이며 모델 판독은 비교하지 않았다. RQ1 7개는 설정을 재현한 것이고 보낸 바이트는 측정하지 않았다. |
| 130 | 현재 번들의 재실행은 동일 재현이 아니다. 고정 규칙 질의 비교는 VII장으로 보낸다. | R08 §2 | — | 문장은 유지하고 참조만 더했다. |
| 148 | 표 3 캡션: 모든 세션이 S0→S4 고정 순서이고, Haiku S2·S3 응답 상한은 512다. | `research/src/session-harness.mjs:19,238-239`, `research/src/session-anthropic.mjs:17-20`, 두 `config.json` | 세션 24 | 표 수치는 바뀌지 않았다. |
| 164 | Haiku 결과 문장도 초록처럼 "S3이 S1보다 높다는 가설(H3)이 지지되지 않았다"로 쓴다("개선"이라는 말을 뺐다). | `research/results/s3-heldout/haiku/analysis.md:24`, `research/results/s3-heldout/README.md:25` | 세션 24 | 표현만 바꿨다. 판정은 그대로다. |
| 166 | 논의: 이 관측에는 Haiku 출력 상한 차이와, 기록상 추론되는 캐시 이월이 섞여 있다. | R04 §9, R06 §2.1·§11 | — | 이월은 추론으로만 적었다. |
| 180 | R03: 요약 192개 중 층화 표본 24개 가운데 평가 가능한 22개가 모두 직전 답변의 목표 사실 하나를 보존했다. 판정 일치 24/24, 평가 불가 2다. 사람 판정과 대조하지 않았고, 판정자 중 하나가 수집 모델과 같은 공급자 계열이다. 늦은 회상 정답 값의 보존과 전체 손실률은 대조하지 않았다. | `research/results/r03-error-audit/README.md:3,18-23,59`, `audit.csv`(summary 24행: retained 22, unassessable 2, 두 판정 일치 24) | 요약 24/192(12.5%) | 대표 표본이 아니다. 응답 60개 감사 수치는 본문에 넣지 않았다. |
| 180 | R04: 도구 경로 출력 상한이 공급자·조건별로 달라, 출력 예산과 검색 도구의 인과 효과를 분리할 수 없다. | R04 §2·§9, `research/results/paper-review-fixes/verify.json` | — | R05는 실행하지 않았다. |
| 182 | R06: 같은 시도에서 만들 수 없는 캐시 읽기가 있었다. Haiku S1 24/24 시도, S3 5/24 시도, GPT-4o S1 2턴 호출 14/24다. 출처 귀속은 추론이다. 순서·캐시·시간 효과를 분리할 수 없어 인과로 해석하지 않는다. | R06 §2.1·§3·§11, 두 `calls.jsonl` | 시도(조건×세션) 24, 2턴 turn 호출 24 | 아래 재집계에서 일치를 확인했다. 방향과 크기는 측정하지 않았다. R07은 실행하지 않았다. |
| 184 | R08: 고정 규칙 질의 231개를 같은 런타임에서 실험 당시 번들과 비교하면 첫 발췌가 231/231 같았다(Node v24.18.0 하나에서 비교, 연구 시점 런타임은 미상). 차이는 entity 동점 11건에 추가된 두 번째 발췌다. held-out entity 근거 포함은 첫 발췌 기준 20/24로 같고, 어느 발췌든 기준으로는 24/24다. 모델이 실제로 보낸 질의는 재실행하지 않았다. | `research/results/r08-parity/excerpt-summary.json` `pairs`(297키 중 비해당 66, firstExcerptIdentical 297, identical 286), `roleSummaries.latest.totals["heldout/entity"]` = hit 20, hitAny 24 | 실제 질의 231 | 발췌 출력의 값이다. 모델 정확도가 아니다. |
| 188 | 결론: S3의 늦은 회상이 S1보다 높았다는 관측은 출력 예산·도구·순서 효과와 분리되지 않는다. 현재 제품과의 비교는 결정적 출력까지이고, 모델 정확도·비용·속도는 측정하지 않았다. | R04 §9, R06 §11, R08 §4 마지막 행·§6 | — | 연구 시점 성적을 현재 제품 성능으로 일반화하지 않는다. |

## 대조만 하고 바꾸지 않은 주장

| 원고 행 | 확인 | 근거 |
|---|---|---|
| 102 | Haiku "단일 이미지 요청에서 +3"은 R02의 66행 전부 +3, count_tokens = 청구량과 맞는다. | `docs/research/r02-offline-reproduction.md` |
| 112–124 | 표 2 단위(질의당 평균 총 입력 토큰)와 그림 2 캡션의 635·765는 R02의 단위 정정과 맞는다. | R02, `research/results/paper-review-fixes/verify.json` |
| 136, 138 | 출력 한도(60/512/400)와 고정 순서는 #112 검증기가 다시 확인했다. | `research/results/paper-review-fixes/verify.py` |
| 148–162 | 표 3의 판정·비용 수치는 바꾸지 않았다. | R01 지도 |
| 27 | RQ3 문장은 사전 등록 질문이라 그대로 두었다. 해석 범위는 위의 한정 문장으로 정한다. | R04 머리말 |

## D01 검증

| 검사 | 결과 |
|---|---|
| #112 흡수 | 11개 경로의 인덱스 blob이 #112 head blob과 11/11 같다. 커밋 `58d13f3`. |
| #112 검증기 `verify.py` | 흡수 직후 18/18 PASS이고, 저장된 `verify.json`과 전체가 같다. D01 원고 수정 뒤에도 18/18 PASS다(원고 링크·표·제어 문자 포함). |
| 그림 5 재생성 | 격리된 worktree에서 기존 `exp2_figures.py`로 두 분할(heldout, calibration-v2)을 다시 만들었다. PNG는 바이트가 같다(heldout `339c4c20…`, calibration `654008054…`, SHA-256 앞 자리). PDF는 사전에 비결정 필드로 정한 `/CreationDate`를 빼면 바이트가 같다. 환경은 Python 3.12.10, matplotlib 3.11.1, numpy 2.5.1, win32다. 생성기는 바꾸지 않았다. |
| R06 사례 재집계 | 두 `calls.jsonl`의 유효 시도만 집계했다(Haiku 1,589건, GPT-4o 1,453건). Haiku 초과 읽기 S1 24/24(409,666토큰), S3 5/24(168,859토큰), S0·S2·S4 0이다. 2턴 turn 호출이 자기 1턴 프롬프트보다 큰 캐시를 읽은 건수는 GPT-4o S1 14/24, Haiku S1 16/24, S0·S4 0이다. R06 §2.1과 일치한다. |
| R08 요약 대조 | 위 표의 키 값이 R08 §2–§4와 일치한다. |
| R03 | `verify.py --json` 종료 0. `audit.csv` 직접 집계: 응답 60(판정 일치 60), 요약 24(일치 24). |
| R08 재실행 | [R08 §5](r08-research-product-parity.md) 0–6단계를 격리 worktree에서 실행했다. 모두 종료 0이고 `r08-evidence-check.mjs`가 통과했다. 번들 SHA-256 4개가 §1과 같다. Node v24.18.0, win32다. |
| R02 재현 | [R02](r02-offline-reproduction.md)의 생성물 24개 중 23개가 SHA-256 일치했다. `slots-exp2-heldout.json`은 OCR 자료가 없어 `variants.mjs`를 실행하지 않았다(다운로드 금지). 입력은 현재 트리를 썼고, `research/src`와 `results/exp2-heldout`의 tree는 R02 기준 커밋과 다르다. 그래도 생성물은 같았다. |
| 프로젝트 게이트 | npm ci·build·test·typecheck·smoke:mcp·validate:plugin·benchmark 모두 종료 0이다. 테스트는 58개 파일, 4,562개 통과, 5개 건너뜀이다. |
