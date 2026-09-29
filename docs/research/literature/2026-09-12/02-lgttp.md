# Language-Guided Temporal Token Pruning for Efficient VideoLLM Processing

## 서지 정보와 버전

- 저자: Yogesh Kumar, Indian Institute of Technology Jodhpur.
- 버전: arXiv `2508.17686v1`, submitted 25 Aug 2025, 8-page v1. 공개 메타데이터는 [arXiv abstract/version page](https://arxiv.org/abs/2508.17686v1), 공개 원문 링크는 [arXiv PDF](https://arxiv.org/pdf/2508.17686v1)다.
- 로컬 근거: `C:\Users\00\Desktop\논문\2508.17686v1.pdf` 및 완전 추출 텍스트 `.artifacts/paper-review/2508.17686v1.txt`; manifest SHA-256 `c540fa37af2262d7b8ee712e1ab9f840916a6167e1eae57570631608ff50841e`, 8 pages.
- 검토 상태: 추출 텍스트의 1-8쪽을 모두 읽고, 표/식/appendix 설명을 포함해 기록했다. 로컬 코드/데이터셋/체크포인트 실행은 하지 않았다 (`NOT reproduced`).

## 연구 질문과 기여

LGTTP는 자연어 질문에 포함된 temporal cue를 사용하면 긴 비디오에서 시간적으로 관련된 frame/token에 더 높은 밀도를 배정하면서 계산량을 줄일 수 있는지를 묻는다. 논문은 uniform pruning과 hard keyframe selection이 시간적 연속성을 손상할 수 있다는 문제를 제기하고, query cue extraction, model-specific temporal adaptation, soft token pruning의 조합을 제안한다 (pp. 1-3).

저자 보고 기여는 TimeChat과 LLaVA-Video에 통합 가능한 model-agnostic framework, temporal marker classifier와 adapter, 그리고 QVHighlights/Charades-STA/VideoMME/EgoSchema에서의 효율-성능 비교다 (pp. 1-5). 이 논문은 텍스트 context optimizer의 직접 성능 근거가 아니라, 질의 조건부 보존율과 연속성 보존을 설계할 때 참고할 cross-domain evidence다.

## 방법 상세

1. 질문 `Q`에서 before/after/during/while 같은 marker와 reference event를 pattern matching 및 fine-tuned classifier로 추출하고, Precedence/Subsequence/Co-occurrence 관계로 분류한다 (p. 2).
2. 각 frame embedding에 temporal information을 넣는다. TimeChat처럼 timestamp binding이 있는 모델은 기존 binding을 사용하고, LLaVA-Video는 normalized frame position의 learned linear temporal embedding을 더하며, temporal awareness가 없는 VLM에는 `nn.Embedding(128,768)` + 2-layer MLP + LayerNorm/GELU + learnable scale(초기값 0.1)의 adapter를 둔다 (pp. 2, 8).
3. query embedding과 adapted frame embeddings의 cosine 기반 `L_base`를 구하고 temporal weight를 곱해 `L_temp`를 만든다. precedence는 앞 frame에 1.5에서 0.5로 선형 감소, subsequence는 반대로 증가, co-occurrence는 중앙에 높은 Gaussian-like weight를 사용한다. marker가 없으면 `w_i=1.0`으로 uniform을 유지하고, 여러 관계는 element-wise multiplication 후 normalization한다 (p. 3).
4. `R = alpha*N*softmax(L_temp)`로 frame별 pruning rate를 만들고, 각 frame은 `T_i=max(T_min, ...)`으로 최소 토큰을 남긴다. hard keyframe selection 대신 soft selection으로 덜 관련된 frame에도 context를 보존한다. 본문은 보통 `T_min`이 원래 토큰의 10%라고 설명한다 (p. 3).

식 (6)-(7)의 기호를 문자 그대로 읽으면 `L_temp`가 높은 frame은 `r_i`가 커지고 `T_i`는 `(1-r_i)`에 의해 작아져 더 많이 pruning되는 방향이다. 본문 서술의 "relevance가 높을수록 보존"과 이 기호의 방향을 재현 코드 없이 확정할 수 없으므로 구현 버그라고 단정하지 않는다. 또한 `N=1`일 때 식 (3)-(4)의 `N-1` 분모 처리와 `r_i`의 명시적 범위/정규화 규칙이 본문에 충분히 적혀 있지 않아 재현성 확인 항목으로 남긴다 (p. 3).
5. temporal adapter는 Xavier uniform/`N(0,0.02)` 초기화, AdamW, learning rate `1e-4`, weight decay `0.01`, 20 epochs, `lambda=2.0`으로 학습하며 vision encoder와 LLM weights는 frozen이다. adapter는 vision encoder와 LLM projection 사이에 삽입된다 (p. 4).

## 실험 구성과 주요 수치

### Table 1: TimeChat의 temporal task (p. 4)

데이터셋은 QVHighlights(하이라이트 detection: mAP, HIT@1), Charades-STA(temporal grounding: R@1 at IoU 0.5/0.7)다. FLOPs는 원본 TimeChat 대비 상대값이다.

| Method | FLOPs | QVHighlights mAP/HIT@1 | Charades-STA R@1 IoU=.5/.7 |
|---|---:|---:|---:|
| TimeChat original | 100 | 21.7 / 37.9 | 46.7 / 23.7 |
| Random Sampling | 35 | 14.2 / 25.6 | 34.5 / 15.8 |
| ToMe | 38 | 15.5 / 27.3 | 36.2 / 16.9 |
| PruMerge | 35 | 16.3 / 28.9 | 37.8 / 17.6 |
| KeyVideoLLM | 40 | 13.1 / 27.0 | 32.1 / 14.5 |
| KVTP | 35 | 19.6 / 34.2 | 42.3 / 21.2 |
| LGTTP | 35 | 21.2 / 43.7 | 46.5 / 23.1 |

표에서 LGTTP의 46.5/46.7 = 99.6%이므로 저자의 "99.6% of R@1"은 상대 보존율이다. 43.7-37.9 = 5.8 percentage points이며, 이를 5.8%라고 쓸 때 상대 퍼센트인지 pp인지 명시해야 한다. 원본 대비 mAP 21.2/21.7 = 97.7%다.

### Table 2: LLaVA-Video 일반 비디오 task (p. 5)

VideoMME와 EgoSchema의 accuracy를 7B/72B로 각각 보고한다.

| Method | FLOPs | VideoMME 7B/72B | EgoSchema 7B/72B |
|---|---:|---:|---:|
| LLaVA-Video original | 100 | 62.6 / 69.5 | 54.2 / 65.8 |
| Random Sampling | 35 | 58.3 / 62.4 | 50.7 / 60.5 |
| ToMe | 38 | 58.9 / 62.9 | 51.5 / 61.2 |
| PruMerge | 35 | 59.8 / 64.5 | 52.5 / 63.1 |
| KeyVideoLLM | 40 | 51.3 / 60.5 | 46.8 / 55.2 |
| KVTP | 35 | 61.8 / 66.3 | 52.4 / 63.6 |
| LGTTP | 35 | 62.0 / 67.1 | 53.1 / 64.0 |

LGTTP는 원본과 비교해 7B VideoMME가 -0.6 pp, 72B가 -2.4 pp, EgoSchema가 -1.1/-1.8 pp다. 따라서 본문 요약의 "within 0.6-1.1%"와 72B 표 값 사이에는 불일치가 있다. 원문 표 값을 우선하고, 72B 결과를 숨기지 않는다.

### 질의 유형, soft selection, 통합

- explicit before/after marker에서 LGTTP가 KVTP보다 QVHighlights HIT@1 `+7.2%`, during/while에서 `+5.8%`, marker 없는 query에서도 `+2.3%`라고 본문이 보고한다 (p. 5). 이 subgroup denominator와 baseline 값은 표에 제시되지 않으므로 pp인지 상대 퍼센트인지 확정하지 않는다.
- hard selection(pruning rate 0 또는 1)은 QVHighlights HIT@1 `-9.3%`, Charades-STA R@1 `-7.6%`, VideoMME accuracy `-3.5%`라고 보고된다 (p. 5). 역시 기준값/분모가 명시되지 않아 원문 표기 `%`를 그대로 인용할 때는 "저자 보고 감소량"이라고 한다.
- PruMerge와 결합하면 QVHighlights HIT@1 `+14.8%`, Charades-STA R@1 `+8.7%`, ToMe와 결합하면 `+16.4%`와 `+10.3%`라고 한다 (p. 5). 이는 LGTTP 단독의 Table 1 차이와 다른 비교 기준이다.
- 논문 abstract의 "QVHighlights +9.5% HIT@1"은 Table 1에서 LGTTP 43.7 대 KVTP 34.2의 절대값 차이인 `+9.5 percentage points`와 일치한다. 원본 TimeChat 37.9와 비교하면 `+5.8 pp`다. Appendix p. 8도 TimeChat 통합에서 KVTP 대비 `+9.5%`라고 설명하지만, 저자 표기의 `%`가 상대 퍼센트인지 pp인지와 comparator를 문맥 없이 혼용하지 않는다. 안전한 문장은 "Table 1의 LGTTP HIT@1은 KVTP보다 9.5 pp, 원본 TimeChat보다 5.8 pp 높았다"이다.

## 효율 측정과 부록

저자는 계산량 65% 감소를 주장한다. Table 1/2의 FLOPs 35는 원본 100 대비 65% 감소라는 뜻이다. Appendix p. 8의 A6000, 128 frames end-to-end latency에서는 LGTTP 1.52s 대 baseline 2.34s, 1.54x speedup, 35% latency 감소, throughput 0.66 대 0.43 videos/s(54% 증가)를 보고한다. 이 값은 fixed hardware/frame count의 저자 측정이며 hosted inference latency나 API 비용이 아니다.

Appendix p. 8은 TimeChat에서 KVTP 대비 QVHighlights HIT@1 +9.5%, LLaVA-Video에서 VideoMME +0.8%라고 추가 보고한다. p. 8의 temporal adapter 구현 세부는 maximum 128 frames, embedding dimension 768, scale 0.1을 명시한다. References와 related work는 pp. 6-8에서 확인했으나, 인용 문헌의 원 주장까지 검증한 것은 아니다.

## 저자 한계와 검토자의 평가

저자가 명시한 한계는 (1) temporal cue가 없는 query에서 이득이 줄어듦, (2) 복잡한 여러 temporal constraint reasoning에 취약함, (3) preprocessing overhead 0.3-0.5%, (4) Video-LLM별 architecture-specific integration이 필요하다는 점이다 (p. 6). 또한 hard selection의 손실과 temporal-aware model에 대한 통합 차이를 실험에서 다룬다 (pp. 5-6).

검토자의 추가 평가는 다음과 같다. classifier가 weak supervision/자동 labeling에 의존하고 marker가 없는 query를 negative로 넣으므로 cue extraction 오류가 pruning 오류로 전파될 수 있다 (p. 3 inference). Table 1/2는 점 추정치만 보여주며 반복 실행, 분산, 통계 검정, task family별 denominator를 보이지 않는다. 따라서 97-99% 보존과 65% 계산 감소는 특정 v1 실험 설정의 보고치이지 일반 VideoLLM 법칙이 아니다. 또한 FLOPs는 실제 wall-clock의 충분조건이 아니며, 논문 스스로 fixed overhead 때문에 latency 감소가 35%로 낮다고 설명한다 (p. 8).

## 우리 text-context optimizer와의 관계

### 직접 적용할 수 있는 원리

LGTTP의 직접적인 설계 교훈은 query가 요구하는 관계에 따라 context density를 바꾸되, 덜 관련된 구간에도 최소 보존량을 두는 것이다. 텍스트에서는 before/after/during을 그대로 frame weight로 옮길 수 없지만, temporal/causal/actor-action/negation 단서를 질의 parser가 감지하면 관련 문단과 연결 증거를 함께 보존하는 budget policy를 실험할 수 있다.

우리 저장소의 exact retrieval gate는 코드, 경로, 식별자, 숫자/표를 source-backed로 요구하고 semantic gate는 configured phrase와 fallback을 검사한다. 따라서 LGTTP의 cosine/attention score를 exact evidence로 직접 대체하면 안 된다. 전이 가능한 것은 query-conditioned allocation, minimum-retention, soft-vs-hard ablation, task-level failure accounting이라는 실험 설계이고, 비디오 수치나 temporal adapter를 텍스트 결과로 일반화할 수 없다.

### 향후 multimodal 연구

멀티모달 연구에서는 query marker가 명시적인지, 영상의 여러 먼 구간을 연결하는지, minimum frame/token retention이 지켜지는지, temporal constraint가 몇 개인지를 strata로 기록할 수 있다. 하지만 본 repository는 이 문서 작성에서 영상 입력이나 VideoLLM을 실행하지 않았으며, LGTTP 결과를 우리 optimizer의 개선 결과로 보고하지 않는다.

## 후속 ablation, metric, failure case 제안

- Ablation: full context, uniform/fixed chunk pruning, LGTTP식 query-conditioned soft allocation, hard selection, minimum-retention 유무를 같은 input budget으로 비교한다.
- Ablation: explicit temporal/causal marker, implicit marker, marker 없음, 복수 관계, negation과 숫자 threshold를 분리한다. parser 오류와 selection 오류를 별도로 기록한다.
- Metrics: planned-slot task success, paired success difference, exact gate, semantic fact coverage, contradiction/temporal-order errors, retained context ratio, token estimate, p50/p95 latency, timeout/tool failure, fallback rate.
- Failure cases: `before/after` 관계 반전, 같은 entity의 여러 사건 혼동, 중간 문단이 원인/예외를 담는 경우, 질문에 단서가 없는데 uniform assumption이 틀리는 경우, 한국어/영어 temporal expression, 표의 순서와 본문 서술이 충돌하는 경우.
- 멀티모달 추가: sparse critical frame, fast-changing subset, long-range dependency, action boundary, implicit temporal cue를 별도 평가한다.

## Claim-to-page/table citation과 안전한 문장

| 주장 | 로컬 PDF 근거 | 안전한 원고 문장 | 금지/주의 문장 |
|---|---|---|---|
| query temporal cue로 soft pruning | pp. 1-3, Eq. 1-7 | "Kumar는 query temporal marker로 frame별 보존량을 조절하고 각 frame에 최소 토큰을 남기는 LGTTP를 제안했다." | "모든 시간 관계를 정확히 해석한다" |
| temporal task 결과 | p. 4, Table 1 | "TimeChat 통합에서 LGTTP는 35% FLOPs와 46.5 R@1(IoU=.5)을 보고했다." | "65% 감소가 항상 같은 latency 감소" |
| general QA 결과 | p. 5, Table 2 | "LLaVA-Video 7B에서 VideoMME 62.0 대 원본 62.6, EgoSchema 53.1 대 54.2였다." | "모든 모델에서 0.6-1.1% 이내" |
| hard selection 손실 | p. 5 | "저자는 hard selection 조건에서 task 점수 감소를 보고했다." | 분모 없는 `%`를 pp로 재표기 |
| latency/throughput | p. 8, Appendix D | "A6000과 128 frames 설정에서 1.52s 대 2.34s를 측정했다." | hosted/API 비용 또는 모든 장비의 속도 보장 |
| 한계 | p. 6 | "저자는 temporal cue 부재, 복수 temporal constraint, overhead, architecture-specific integration을 한계로 든다." | text-only context에 이미 적용/검증됐다고 주장 |

## 검증 기록

- `manifest.json`에서 로컬 PDF의 파일명, 바이트 수, SHA-256, 8-page count를 확인했다.
- `.artifacts/paper-review/2508.17686v1.txt`의 `===== PDF PAGE 1 =====`부터 `===== PDF PAGE 8 =====`까지 전 페이지를 읽었다.
- 원문 PDF를 bundled `pdftoppm`으로 렌더링해 `video-lgttp-3.png`, `video-lgttp-4.png`, `video-lgttp-5.png`, `video-lgttp-8.png`를 생성하고 `view_image`로 시각 확인했다.
- arXiv 공식 페이지에서 title, author, v1 submission date, abstract, version identifier를 대조했다.
- 표의 산술 차이(43.7-37.9=5.8 pp, 43.7-34.2=9.5 pp, 46.5/46.7≈99.6%)를 계산해 abstract와 Table 1의 표현 차이를 기록했다.
- 저자 코드/데이터셋 실행/독립 grading/추가 seed 실험은 하지 않았다. 따라서 모든 결과는 paper-reported이며 `NOT reproduced`다.
