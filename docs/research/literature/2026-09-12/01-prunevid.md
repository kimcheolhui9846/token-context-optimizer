# PruneVid: Visual Token Pruning for Efficient Video Large Language Models

## 서지 정보와 검토 범위

- 저자: Xiaohu Huang, Hao Zhou, Kai Han.
- 버전/출판: Findings of the Association for Computational Linguistics: ACL 2025, July 2025, pp. 19959-19973, Anthology ID `2025.findings-acl.1024`, DOI `10.18653/v1/2025.findings-acl.1024`.
- 공개 서지/원문: [ACL Anthology metadata](https://aclanthology.org/2025.findings-acl.1024/) 및 [ACL PDF](https://aclanthology.org/2025.findings-acl.1024.pdf).
- 로컬 근거: `C:\Users\00\Desktop\논문\2025.findings-acl.1024.pdf`, manifest SHA-256 `418b3e248dec995e187cb25954cee613b5826e10847b680b943230a22cfb4ecf`, 15 pages. PDF가 이미지 중심이라 텍스트 추출은 footer 수준이었으며, 이 노트의 내용/수치는 `prunevid-01.png`-`prunevid-15.png`를 1-based PDF page로 직접 읽어 기록했다.
- 검토 범위: 1-10쪽 본문, 11쪽 references와 appendix 진입부, 12-15쪽 appendix 표/그림/정성 결과까지 모두 확인했다. References 자체를 문헌별로 재검증했다는 뜻은 아니다.
- 이 문서는 재현 실험 결과가 아니다. 로컬 PDF를 읽고 기록했으며 저자 코드/데이터셋/모델 체크포인트 실행은 하지 않았다 (`NOT reproduced`).

## 연구 질문과 기여

PruneVid는 장시간 비디오를 Video-LLM에 넣을 때 발생하는 시공간 토큰 중복을 줄이면서 질문과 관련된 시각 정보는 남길 수 있는가를 묻는다. 핵심 주장은 (i) 시간적으로 정적인 토큰을 합치고, (ii) 장면 안에서 공간적으로 유사한 토큰을 합치며, (iii) 중간 LLM 층의 질문-비주얼 attention으로 상위 토큰만 선택하는 학습 없는 프레임워크라는 것이다 (pp. 1-3).

저자들은 PLLaVA, ST-LLM, LLaVA-OneVision에 PruneVid를 붙여 여러 비디오 QA 벤치마크에서 토큰 80% 이상을 줄일 수 있다고 보고한다 (pp. 2, 6, 9). 기여는 새로운 모델 학습보다 기존 Video-LLM의 입력 표현과 KV cache를 줄이는 통합 방식에 있다. 따라서 이 논문은 텍스트 문서 요약 품질의 증거가 아니라, 질문 조건부 입력 선택과 정보 보존을 평가하는 멀티모달 인접 근거다.

## 방법 상세

1. 비디오의 각 프레임을 vision encoder로 토큰화한다. 시간 구간은 프레임 평균 feature에 DPC-KNN을 적용해 연속적인 장면으로 나눈다 (pp. 3-4).
2. 같은 시간 구간에서 동일 공간 위치의 토큰 간 cosine similarity 평균을 계산한다. 임계값 `tau`보다 높은 위치를 static으로 보고 구간 내 평균 토큰으로 시간 중복을 줄인다. dynamic 토큰은 평균하지 않고 보존한다 (p. 5, Eq. 2-4).
3. 각 장면의 static/dynamic 토큰에 DPC-KNN spatial clustering을 별도로 적용하고 클러스터 평균으로 치환한다 (pp. 4-5).
4. pre-filling의 중간 layer `M`에서 질문 토큰과 비주얼 토큰의 cross-attention을 얻고, 각 비주얼 토큰의 질문 방향 최대 attention을 점수로 사용한다. 상위 `alpha%`만 남긴 index set을 만들고, 선택된 visual KV와 question KV를 이후 decoding cache에 저장한다 (pp. 3, 5; Eq. 5-7).
5. 기본 실험 설정은 `tau=0.8`, temporal segment ratio `0.25`, spatial merging ratio `0.5`, attention selection ratio `alpha=0.4`, attention 계산 10th layer다. 입력 프레임 수는 PLLaVA/ST-LLM 16, LLaVA-OneVision 32, VideoChatGPT-Bench/ST-LLM 64다. A100 80GB에서 실행했고, FastV는 2nd layer와 retained ratio 0.3으로 비교했다 (p. 6).

## 주요 실험과 수치

표의 `retained ratio`는 원래 visual token 중 남긴 비율이고, FLOPs는 원본 모델 대비 배수다. Accuracy/mAP/HIT@1/R@1은 각각 벤치마크 점수이며 백분율 표기다. 아래의 `pp`는 원 논문 표 값의 산술 차이인 percentage points이고, `상대 %`는 원본 대비 비율이다.

### Table 1: 세 Video-LLM과 pruning 비교 (p. 6)

실험 설명에서 MVBench는 20개의 temporal challenge task와 각 200 test samples로 기술된다 (p. 6). 다른 표의 모든 dataset별 denominator와 반복/seed 정보가 동일하게 제공된다고 추정하지 않는다.

- PLLaVA: PruneVid retained 16.2%, FLOPs 0.23x, MVBench 47.6, VideoMME 45.0, EgoSchema 49.0/42.6 (sub/full), VideoChatGPT-Bench 평균 2.98. 원본 PLLaVA는 MVBench 46.6, VideoMME 44.4, EgoSchema 47.8/42.6, 평균 2.99였다.
- ST-LLM: retained 15.1%, FLOPs 0.26x, MVBench 54.3, VideoMME 41.4, EgoSchema 54.6/44.7, 평균 2.82. 원본은 54.9, 42.0, 56.2/45.6, 2.86이다.
- LLaVA-OneVision: retained 17.0%, FLOPs 0.20x, MVBench 57.5, VideoMME 58.6, EgoSchema 62.6/59.5, 평균 3.24. 원본은 58.0, 58.2, 62.0/60.0, 3.26이다.
- 논문의 "over 80% visual tokens"는 이 retained ratio들(15.1-17.0%)에서 유도한 표현이다. FLOPs `0.20-0.26x`는 74-80% FLOPs 감소이며, token retained와 FLOPs 감소를 같은 지표로 부르면 안 된다.

### Table 2-3와 모듈 진단 (p. 7)

- Table 2의 평균(MVBench/VideoMME)에서 baseline 100%/1.00x는 46.6/44.4, static merge만은 71.5%/0.69x 및 46.9/43.6, spatial merge만은 50.0%/0.48x 및 47.6/44.6, static+spatial은 36.1%/0.34x 및 47.2/44.7, attention selection만은 40.0%/0.59x 및 47.1/44.4, 세 모듈 모두는 14.1%/0.20x 및 47.6/45.0이다.
- 본문은 static merge만으로 28.5%의 redundant tokens를 줄였다고 설명하고, static+spatial에서 spatial-temporal redundancy가 63.9% 줄며, attention selection이 irrelevant visual tokens 60%를 제거한다고 해석한다. 이 퍼센트들은 모듈별 retained ratio에서 나온 비율이지 정확도 향상률이 아니다.
- Table 3(MVBench): PruneVid는 FLOPs 0.23x, TTFT speed-up 1.55x, TPS 191.5, GPU memory 17G, accuracy 47.6이다. baseline은 1.00x/1.00x/167.3/20G/46.6. 저자 표의 1.55x는 시간-첫-토큰 속도 배수이고 FLOPs 0.23x와 동일한 종류의 측정이 아니다.

### Table 4-6와 appendix (pp. 9, 13)

- Table 4의 full/fast 비교에서 PruneVid retained ratio는 ST-Merge 40.2%/44.0%, Final 16.1%/17.6%이고, MVBench 47.6/49.6, VideoMME 45.0/43.4, EgoSchema 42.6/43.4이다. Fast는 optical flow로 각 category의 dynamic 10%를 고른 subset이다 (p. 8-9). 빠르게 변하는 subset에서 ST-Merge retained ratio가 높아진다.
- Table 5는 retained ratio를 더 낮출 때의 민감도다. 예를 들어 PLLaVA는 24.3%에서 MVBench 47.4/VideoMME 45.0, 16.2%에서 47.6/45.0, 8.1%에서 46.9/44.6이다. ST-LLM 15.1%에서 54.3/41.4, LLaVA-OV 17.0%에서 57.5/58.6이다. 이 표는 "90% 이상 pruning도 comparable"이라는 저자 표현의 근거지만 모든 모델/과제에서 무손실이라는 뜻은 아니다 (p. 9).
- Appendix Table 6의 Qwen2.5-VL 결과는 원본 retained 100%, FLOPs 1.00x, MVBench 65.5, VideoMME 65.3, EgoSchema 64.0/61.0, VCG-Bench 3.33; PruneVid는 retained 18.1%, FLOPs 0.21x, 64.9, 64.8, 63.0/60.3, VCG-Bench 3.28이다 (p. 13). MVBench/VideoMME/EgoSchema는 표 점수이고 VCG-Bench는 별도 점수 척도이므로 모두 백분율로 부르지 않는다. 이는 추가 아키텍처에서의 저자 보고 결과이지 이 검토에서 재현한 결과가 아니다.
- Appendix hyperparameter plot은 `M=10` 부근에서 안정적이고 `alpha=0.4`가 `0.5`보다 나을 수 있으며, `tau=0.8`, temporal ratio 0.25, spatial ratio 0.5를 선택했다고 설명한다 (pp. 11-12). 그림에서 읽은 경향은 표 수치처럼 정밀한 증거로 사용하지 않는다.

## 저자 한계와 검토자의 평가

저자 명시 한계는 attention 한 개 layer만 사용해 layer별 redundancy 차이를 모델링하지 않는다는 점이며, multi-layer pruning은 future work다 (p. 9). 본문은 정적/동적 구분, DPC-KNN과 attention 계산의 추가 단계도 설명한다 (pp. 3-6).

검토자의 추가 비판은 다음과 같다. (a) MVBench의 20 tasks × 200 samples는 명시되지만, 표만으로 모든 벤치마크의 반복·분산/신뢰구간·실행 seed를 확인할 수 없어 작은 점수 차이의 안정성을 판단하기 어렵다. (b) attention 선택이 질문에 유용한 시각 정보의 대리변수라는 가정에 의존하며, attention이 높은 토큰과 정답 증거가 항상 일치한다는 인과 주장은 검증되지 않았다. (c) `0.20x` FLOPs, TTFT, TPS, GPU memory는 서로 다른 자원 축이고 end-to-end hosted latency나 비용을 뜻하지 않는다. (d) 정성 그림의 selected tokens가 유용해 보이는 것은 설명 사례이지 전체 정확도 추정량이 아니다. 이 네 항목은 논문 표/그림에서의 직접 관찰과 그 관찰에 대한 검토자의 inference를 구분해야 한다.

## 우리 연구로의 전이 가능성

### 직접 적용 가능한 아이디어

우리의 text-context optimizer에 직접 적용할 수 있는 원리는 "질문에 의해 관련도가 달라지는 입력을 먼저 구조적으로 줄이고, 핵심 증거는 보존한다"는 것이다. 구체적으로 source를 문단/표/코드 블록 단위로 segment하고, 질의와의 관련도를 이용해 전체 context budget을 배분하며, 낮은 관련도 segment에도 최소 보존량을 두는 설계를 검토할 수 있다. PruneVid의 static/dynamic 구분은 반복되는 boilerplate와 변화가 큰 요구사항/수치/오류 줄을 분리하는 analogical design cue가 된다.

그러나 우리 text system은 이미 exact retrieval gate와 semantic degradation fixture를 사용하므로 attention score나 문자열 유사도를 정답 증거로 간주할 수 없다. 이 논문에서 직접 가져올 수 있는 측정 항목은 retained-token ratio, 원본 대비 추론량, task success, query-conditioned failure rate, latency percentile이라는 평가 관점뿐이며, 수치 자체는 가져오지 않는다.

### 유추적 cross-domain 아이디어와 향후 multimodal 연구

LGTTP/PruneVid 방식의 시간 구간 보존은 향후 영상 연구에서 temporal locality, query marker, 최소 frame/token coverage를 함께 기록하는 설계로 번역할 수 있다. 다만 텍스트 문서에 시간 차원이 없으므로 "static segment"를 동일한 알고리즘으로 구현한다고 주장해서는 안 된다. 현재 문서 프로젝트에 영상 성능 향상이 있거나 멀티모달 실행을 했다고 쓰지 않는다.

## 제안할 후속 ablation/metrics/failure cases

- Ablation: full source, fixed-size chunk budget, relevance-only selection, relevance+minimum-retention, gold-evidence diagnostic을 같은 token budget으로 비교한다. optimizer selection 효과와 단순 context length 효과를 분리한다.
- Ablation: 최소 보존량을 0/5/10/20%로 바꾸고, exact field/code/table/number가 포함된 segment를 강제 보존하는 조건을 분리한다.
- Metrics: task success proportion, exact gate pass, semantic fact coverage, contradiction/negation/actor-action/temporal-order error, retained-token ratio, estimated-token reduction, p50/p95 latency, fallback/tool error rate를 함께 기록한다.
- Failure cases: 질문이 문서의 여러 먼 위치를 연결할 때, 부정문/숫자 임계값/표 행을 pruning할 때, boilerplate처럼 보이는 정의가 실제 정답 전제일 때, query가 모호하거나 관련도가 없는 경우, 한국어와 영어가 섞인 경우를 별도 bucket으로 만든다.
- 영상 확장 시: query에 explicit temporal marker가 없거나 여러 temporal constraint가 결합된 경우, 빠르게 변하는 장면과 장거리 causal relation, minimum frame retention 위반을 별도 failure case로 둔다.

## Claim-to-evidence와 안전한 문장

| 주장 | 근거 | 안전한 원고 문장 | 피해야 할 주장 |
|---|---|---|---|
| PruneVid는 학습 없이 시공간 중복을 줄이고 질문 관련 토큰을 선택한다 | PDF pp. 1-5, Fig. 1-2 | "Huang et al.은 static temporal merge, spatial clustering, LLM-guided attention selection을 결합한 training-free Video-LLM pruning method를 제안했다." | "attention이 항상 정답 증거를 찾는다" |
| 세 모델에서 높은 pruning 비율의 저자 보고 결과 | PDF p. 6 Table 1 | "저자 표에서 retained ratio는 15.1-17.0%였고, 모델/벤치마크별 점수는 원본과 가깝거나 일부 높았다." | "모든 비디오 과제에서 80%를 제거해 무손실" |
| 모듈 조합/효율 | PDF p. 7 Tables 2-3 | "저자 진단에서 세 모듈 조합은 14.1% retained, 0.20x FLOPs, MVBench 47.6/VideoMME 45.0을 보였다." | "0.20x FLOPs가 5배 실사용 속도/비용 절감을 보장" |
| 빠른 변화 subset과 추가 모델 | PDF pp. 9, 13 Tables 4-6 | "fast-changing subset과 Qwen2.5-VL에서의 결과도 보고되지만, 이 검토에서는 재현하지 않았다." | "일반적인 multimodal 또는 hosted API 성능으로 일반화" |
| 한계 | PDF p. 9 | "저자들은 단일 attention layer 사용을 주요 한계로 명시했다." | "layer-independent pruning" |

## 검증 기록

- `manifest.json`의 파일명, 바이트 수, SHA-256, page count를 확인했다.
- PruneVid `prunevid-01.png`부터 `prunevid-15.png`까지 모든 렌더 페이지를 `view_image`로 읽었다. 표/그림 페이지는 2, 4-5, 6-9, 11-15쪽을 특히 수치와 캡션까지 대조했다.
- ACL Anthology metadata에서 제목, 저자, 출판연도/페이지/DOI를 확인했다.
- 수치 검토는 로컬 PDF에 보이는 표 값과 캡션을 우선했다. 명시된 샘플 수는 기록했지만 실제 데이터셋·저자 코드·체크포인트를 실행하거나 통계적 유의성을 재검증하지 않았으므로 재현 완료로 표시하지 않는다.
