# Better Harnesses, Smaller Models: Building 90% Cheaper Agents via Automated Harness Adaptation

## 서지와 판본

- 저자: Chenyang Yang, Xinran Zhao, Tongshuang Wu, Christian Kästner (Carnegie Mellon University).
- 원문: [arXiv:2607.08938v1](https://arxiv.org/abs/2607.08938v1), v1 (2026-09-12 검토). 검토 대상은 `.artifacts/paper-review/2607.08938v1.txt`의 12쪽 추출본과 `논문/2607.08938v1.pdf`이다.
- 상태: arXiv preprint. 동료심사·재현을 완료한 결과로 취급하지 않는다.
- 시각 확인: PDF p.8의 Table II, p.9의 Figures 5–6을 Poppler로 렌더링하여 확인했다. 본문·방법·한계·참고문헌을 포함한 12쪽을 읽었다.

## 질문과 기여

핵심 질문은 frontier LLM용 범용 harness에 SLM을 그대로 끼우는 대신, 실패 궤적을 보고 context, tools, hooks, context management, sub-agents 같은 inference-time harness를 자동 수정하면 비용을 낮추면서 성능을 회복할 수 있는가이다 (pp.1–2, 6). 논문은 (i) tool-use, instruction-following, knowledge, long-context, planning/reasoning 실패를 capability별로 정리하고 (ii) 그 실패를 context/tool/agent-loop adaptation으로 연결하는 분석 틀을 제시하며 (iii) frontier meta-agent가 후보 harness를 만들고 검증하는 optimizer를 구현한다 (pp.2–5).

이 기여는 모델 가중치 학습이나 지식 증류가 아니다. 모델은 고정하고, 반복 업무에 맞춰 실행 시점의 지시·도구·제어 로직을 바꾸는 harness adaptation이다. 따라서 이 결과를 fine-tuning 효과, plugin 설치 효과, MCP transport 효과로 옮겨 말할 수 없다.

## 방법과 통제

검색 공간은 `software-agent-sdk` API에 맞춘 system prompts/skills/dynamic context, primitive·custom tools/scripts, tool-use hooks, 외부 파일·context condenser, sub-agents이다 (p.5). GEPA 스타일 Pareto pool에서 harness를 골라 training batch를 실행하고, frontier meta-agent가 full trajectory, 현재 Python harness, search memory, API 문서를 보고 진단·수정한다. sanity check로 깨진 코드를 고치고, training batch에서 개선된 후보만 validation에 올린다 (pp.5–6).

평가는 7개 업무 task × 3개 SLM(총 21 task–SLM pair)이며, 각 task는 20/20/60 train/validation/test split이다 (pp.6–7). Table I의 task별 보고 instance 수는 attendance 100, budget 100, stock 100, anomaly 100, playwright 100, website 50, refactoring 100이며, 이들이 통계적으로 독립이라는 뜻은 아니다 (Table I, p.7). Generic harness의 SLM, 같은 SLM의 optimized harness, generic harness의 `gemini-3.1-pro-preview`를 비교하고 각 configuration을 3회 실행해 평균을 냈다. 정확도는 ground truth/executable checks/AST checks, 비용은 추적 token usage와 공식 API price, latency는 end-to-end 평균이다 (pp.6–7). Optimizer는 task–model pair당 $20 budget으로 3회 검색하고, 본 실험 최적화 예산은 총 $1,260이라고 보고한다 (Table I 각주 3, p.7).

통제의 범위는 명확하다. held-out test를 사용하고 frontier model을 baseline으로 둔 것은 장점이지만, 동일한 모델 snapshot·가격·호스트·요청 조건을 고정한 paired causal contrast는 아니다. task와 model마다 harness를 다시 찾으므로 하나의 universal harness 비교도 아니다.

## 정량 결과: 표·페이지·단위

Table II는 각 셀에 `accuracy (top)`, `average cost per instance in USD (middle)`, `average end-to-end latency (bottom)`를 순서대로 둔다 (p.8). 아래 수치는 표를 그대로 옮긴 것이며, 정확도 차이는 percentage points (pp)로 계산했다.

| 설정 | 평균 정확도 | 평균 비용/instance | 평균 latency | 해석 |
| --- | ---: | ---: | ---: | --- |
| Gemini generic | 89.7% | $1.735 | 181s | frontier baseline |
| Gemma generic | 31.4% | $0.043 | 328s | baseline SLM |
| Gemma optimized | 80.2% | $0.071 | 135s | +48.8 pp; Gemma generic 대비 1.651배 비용(+65.1%), latency 58.8% 감소 |
| Qwen generic | 26.9% | $0.085 | 107s | baseline SLM |
| Qwen optimized | 74.8% | $0.064 | 76s | +47.9 pp; 비용 24.7% 감소, latency 29.0% 감소 |
| Ministral generic | 9.5% | $0.110 | 194s | baseline SLM |
| Ministral optimized | 25.0% | $0.099 | 172s | +15.5 pp; 비용 10.0% 감소 |

논문의 “best SLM이 LLM 성능의 89%를 4% 비용으로 회복”은 표의 Gemma optimized 80.2%와 Gemini generic 89.7%를 비교한 상대 유지율 `80.2/89.7 = 89.4%`(약 89%)로 읽는 것이 정확하다 (p.8). 동시에 89.7% 자체는 Table II의 frontier LLM 절대 평균 정확도다. 비용은 `$0.071/$1.735 = 4.1%`이며, 이 상대 비교의 절감률은 약 95.9%다. 제목의 90%는 더 넓은 요약 표현이며 이 표의 정확한 계산값은 아니다. latency의 본문 25% 감소는 frontier Gemini 181s에서 Gemma optimized 135s로의 비교(25.4%)이고, Gemma generic 328s에서 optimized 135s로 비교하면 58.8% 감소다. 서로 다른 comparator를 섞지 않는다. “significantly”라는 문구는 p.8에 있으나 해당 페이지에 confidence interval, 검정통계량, pair별 p값은 제시되지 않는다. 따라서 독립적인 유의성·동등성 증거로 재사용하지 않는다.

논문은 16/21 pair에서 유의한 개선, 7 pair에서 SLM–LLM gap closure를 보고한다(p.8). 그러나 각 pair의 검정 절차·분산·3회 반복의 독립성은 표에 충분히 드러나지 않는다. 최적화 one-time cost `$20`가 평균 13 runs 후 회수된다는 주장도 p.8의 저자 계산이다. task–model별 3회 검색과 21 pair 전체 `$1,260`을 어떤 배포 workload에 어떻게 배분한 손익분기인지 분리해서 보고해야 하며, 이를 곧바로 13회 총비용 회수로 해석하면 안 된다.

RQ2에서 task diversity와 optimized performance 사이 Spearman `rho = -0.96`을 보고하고, diversity-controlled attendance/budget 변형에서 optimized 성능이 89.1%에서 68.0%로 하락했다고 한다 (p.8, Figure 5 p.9). 이는 task 단위 관찰 상관과 통제 변형 결과이지, 모든 업무에 대한 일반 법칙이나 인과 추정은 아니다. RQ3은 강한 SLM이 더 큰 개선을 얻는 경향을 Figure 6으로 보인다(p.9); 표의 Gemma/Qwen/Ministral 평균 개선은 각각 +48.8, +47.9, +15.5 pp다.

RQ4 수작업 분류에서 instruction-following과 knowledge failure가 각각 81%, tool-use 62%, long-context 33%로 제시되고, adaptation은 context 추가 86%, tool 생성 43%, tool 관리 29%로 제시된다(p.9). 분모가 21 optimized harness인지, 다중 label 허용인지 본문 요약만으로 완전히 확인되지 않으므로 분류 비율은 “저자 보고”로 인용한다. 대표 사례는 anomaly detection에서 40+ MCP tool을 7개로 줄이고, custom query tool과 table-naming context를 추가한 것이다(p.9). 또한 저자들은 테스트한 SLM에서 sub-agent 생성 adaptation의 성공을 관찰하지 못했다고 보고하며, SLM의 agent 관리 능력 또는 meta-agent의 한계일 수 있다고 가설화한다(p.9). 이는 사용자 workflow의 fresh-subagent 대 persistent-inline 선택에 직접적인 인과 증거는 아니지만, sub-agent orchestration을 자동화하면 성능·추적 부담이 생길 수 있다는 failure signal이다.

## 한계와 분석적 비판

저자 스스로 internal validity의 stochastic agent/optimization, external validity의 7 task·3 SLM·1 optimizer, clean environment와 명확한 metric, closed-source frontier API 변화로 exact replication이 어렵다고 적는다(p.8). Website-management는 WebArena/CMS subset 중 frontier가 풀 수 있는 instance를 남겼다는 Table I 설명(p.7)이 있어 selection bias와 ceiling conditioning 가능성이 있다. 7 task의 instance가 모두 100인 것도 아니며, task family와 모델을 cluster로 다룬 불확실성 분석이 보이지 않는다.

분석적으로는 optimized harness가 prompt, tool surface, hooks, 추가 inference/context를 동시에 바꾼다. 성능 개선을 “context selection”이나 “tool 축소” 하나의 효과로 분해할 수 없다. LLM meta-agent가 trajectory를 보고 harness를 만들고 같은 분포의 validation으로 선택하므로 optimizer overfitting, evaluation feedback leakage, search-budget confounding도 남는다. 3회 평균은 stochasticity를 완전히 추정하기에 작고, 표에 pair별 CI가 없어 “유의”의 재검증이 어렵다. 비용은 token usage × 당시 API 가격의 추정치이며, 호스팅 고정비·실패/재시도·optimization amortization·GPU 전력 비용을 포함하는 총소유비용이 아니다.

## 재현성 상태

재현하지 않았다. 원문은 코드 링크를 제공하지만, 이 저장소는 해당 코드·API·모델을 실행하지 않았다. 추출 텍스트와 PDF 표·그림을 읽고 계산한 `80.2/89.7` 및 비용 비율만 검산했다. 따라서 본 문서에는 이 프로젝트의 실험 결과를 추가하지 않는다.

## 현재 프로젝트와의 관련성 및 전이 한계

관련성은 “실패를 진단해 반복 가능한 실행 정책으로 옮긴다”는 설계 관점이다. 현재 repository의 optimizer는 로컬 deterministic retrieval/extractive summary와 exact/semantic gates를 검증하며 hosted LLM agent harness를 자동 최적화하지 않는다. 이 paper는 향후 skill/MCP/plugin 실험에서 다음을 제안하는 근거로만 사용할 수 있다.

- 실패 taxonomy를 `tool-use`, `instruction-following`, `knowledge`, `long-context`, `planning`으로 trace에 태그하고, harness edit(맥락·도구·loop)과 task outcome을 연결한다.
- raw structured trace와 요약 trace를 나눠, 진단용 요약이 필요한 증거를 삭제했는지 측정한다(p.9).
- cost/latency에는 task generation, optimizer search, preprocessing, inference를 분리하고 p50/p95, retry/timeout, 실패 슬롯을 기록한다. 이는 현재 protocol의 “provider billing이 아닌 local heuristic”, “task-family cluster”, “operational unit 분리” 원칙과 맞는다.
- fixed budget에서 analysis quality, candidate evaluation, iteration 수를 분리하는 ablation; generic vs optimized, fixed-chunk/gold evidence와의 paired 비교; 새 모델·task·workflow drift에 대한 transfer 검증을 사전 지정한다.

전이할 수 없는 점은 90% cheaper/89% performance 같은 수치를 현재 plugin/MCP/skill 구조에 적용하는 것이다. 이 논문은 가중치 변경 없이도 behavior가 개선될 수 있다는 사례이지, packaging이나 MCP transport의 품질·안전 효과를 측정하지 않는다. 현재 short synthetic/local fixture 결과를 business-agent generality로 확장하지 않는다.

## 안전한 원고 문장과 claim-to-page mapping

안전한 문장: “Yang et al.은 7개 반복 업무와 3개 SLM에서 task별 자동 harness adaptation을 평가했고, Table II에서 Gemma optimized harness의 평균 정확도는 80.2%, Gemini baseline은 89.7%, 평균 비용은 각각 $0.071과 $1.735/instance로 보고했다. 이는 약 89.4% 상대 정확도 유지와 4.1% 상대 비용이지만, 저자 실험의 특정 모델·task·가격 조건에 한정된다 (Table II, p.8).”

피해야 할 문장: “harness가 SLM을 89.7% 정확도로 만든다”, “모든 agent가 90% 싸진다”, “13회 실행이면 최적화 비용이 항상 회수된다”, “MCP/plugin이 이 효과를 재현한다.”

| 주장 | 출처 |
| --- | --- |
| 실패 taxonomy와 context/tool/loop adaptation | pp.2–4, Fig.2 p.3 |
| optimizer search space, trajectory·memory·sanity check | pp.5–6, Fig.3 p.5 |
| task 수/instance 수/split/model | pp.6–7, Table I p.7 |
| 정확도·비용·latency 원자료 | Table II p.8 |
| 16/21, 7 pair, 89%/4%, $20, 13 runs | p.8 (저자 보고; CI 미제시) |
| diversity rho=-0.96, 89.1%→68.0% | p.8, Fig.5 p.9 |
| failure/adaptation 비율과 raw JSON lesson | p.9 |
| 재현성·내적/외적 타당도 한계 | p.8 |

## 실험 설계에 넣을 제안

이 문서에서 제안하는 것은 아직 구현·측정되지 않았다. (1) optimizer budget을 search와 evaluation으로 나눈 factorial ablation, (2) task family별 paired success와 95% cluster-bootstrap interval, (3) raw-vs-summary trajectory 진단, (4) harness 복잡도(도구 수, prompt/context bytes, hook 수), tool-call 수, 실패 유형, wall-clock p50/p95, 실제 provider usage와 비용/성공을 함께 기록하는 trace schema가 우선이다. 모든 결과는 source-backed evidence, repository implementation evidence, 실제 run evidence를 별도 claim으로 유지한다.
