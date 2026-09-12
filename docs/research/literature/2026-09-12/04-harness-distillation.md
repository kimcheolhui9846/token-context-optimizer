# Agent Harness Distillation: Inference-Time Harness Extraction and Exploitation in Autonomous Multi-Agent Systems

## 서지와 판본

- 저자: Yu Cui, Wuli Yang, Yirui Shi, Junhao Xia, Hui Jiang, Lei Gao, Chenfu Bao (Baidu; Tsinghua University).
- 원문: [arXiv:2607.28147v4](https://arxiv.org/abs/2607.28147v4), v4 (2026-09-12 검토). 사용자가 지정한 v4를 유지했다. 검토 대상은 `.artifacts/paper-review/2607.28147v4.txt`의 17쪽 추출본과 `논문/2607.28147v4.pdf`이다.
- 상태: arXiv preprint. 본문은 학술적 보안 연구와 red-team 평가를 설명하지만, 이 저장소에서 공격을 재현하거나 운용하지 않았다.
- 시각 확인: PDF pp.9–11의 Tables 1–4와 Figure 5를 Poppler 렌더링으로 확인했다. 정의·알고리즘·실험·논의·윤리·부록 표를 포함한 17쪽을 읽었다.

## 무엇을 distill하는가

AHD는 모델 가중치나 일반 지식을 distill하는 방법이 아니다. AMAS가 inference 중 임시로 만드는 agent roles/topology, context assembly, tool interaction, memory management, coordination strategy를 black-box 응답으로 추정하고, 그 구조를 다른 실행 harness로 옮기는 IP extraction/security 연구다 (pp.1–5, Fig.1 p.3). “distillation”이라는 이름 때문에 fine-tuning·knowledge distillation으로 읽으면 안 된다.

질문은 (RQ1) inference-time harness leakage의 정의·정량화, (RQ2) black-box interaction에서 추출한 정보의 실용 가치, (RQ3) 추출 방어다 (pp.1–2). 저자는 (i) clean/injected response에서 구조 claim을 추출해 per-task majority와 cross-task frequency filter로 `H0`를 구성하는 Pre-Distillation, (ii) 관측 가능한 harness와 비교해 coding agent가 edit를 제안하고 disjoint validation 성능이 개선/유지될 때만 채택하는 Loop Harness Alignment를 제시한다 (pp.5–7, Algorithm 1 p.7).

## 위협 모델과 평가 지표

대상 AMAS의 underlying LLM `theta`와 static harness `H`가 task별 `h_x = I_H(x)`를 만들고, 최종 응답만 외부에 보인다고 형식화한다(pp.3–4). 공격자는 일반 사용자처럼 query를 넣고 backbone model을 선택할 수 있지만, harness·internal log·execution state는 볼 수 없다는 strict black-box 가정이다(p.3). injected query가 원래 harness를 바꿀 수 있는 오차 `epsilon_A`와, 관측 응답에서 복원한 harness의 extraction error `epsilon_E`를 분리하며, black-box 관찰로는 behavioral indistinguishability class까지만 식별 가능하다고 명시한다(pp.4–5).

네 가지 핵심 지표는 Clean Visibility (CV: clean response의 비의도 공개), Injected Fidelity (IF: HEA 응답에서 ground-truth harness와 일치), Clean Transfer (CT: clean harness와 추출 harness의 일치), Probe Perturbation (PP: clean/injected harness의 구조 일치)다(p.7). 각 결과의 Correspondence는 일치 비율이고 OM/CON은 각각 omission/contradiction이다(pp.9–11). 이는 공격 가능성/누출을 연구하기 위한 지표이지 일반 agent quality metric이 아니다.

## 실험 설정과 통제

대상 AMAS는 Claude Code, Oh-My-Pi (OMP), Hermes이고 backbone은 GPT-5.6과 DeepSeek-V4다(p.8). AHD coding agent는 QwenCode + Claude Opus 4.6이며, core dataset은 GAIA와 AgentBench, generalization benchmark는 AIME2025, GSM-Level6, MMLU-Pro CS subset이다(p.8). Distilled harness의 수신 모델은 Qwen3.6-Flash, Qwen3-Next-80B-A3B-Instruct, DeepSeek-V3이며 frontier 비교에는 Claude Haiku 4.5, GLM-5.2, Kimi-K2.6이 포함된다(p.8).

정확한 총 query 수·task family 수·각 평균의 분모는 본문 추출만으로 충분히 명시되지 않으며, 표의 `±` 값과 10회 post-alignment iteration budget은 확인된다(pp.9–12). 논문은 target/harness에 privileged evaluator access로 ground-truth를 얻고, 공격자에게는 black-box만 제공하는 비대칭 평가다(p.7). 따라서 “방어자가 로그를 읽어 metric을 계산했다”와 “공격자가 로그를 볼 수 있다”를 혼동하지 않는다.

## 정량 결과: 표·페이지·단위

Table 1 (p.9)은 frontier LLM별 6 agent×backbone 조합의 IF(%)를 `mean ±` 형태로 보고한다. 전체 평균은 Non-Attack `11.99 ± 5.04`, HEA `69.13 ± 24.67`, HEA with Defense `60.87 ± 27.37`이다. 즉 HEA가 no-attack 대비 +57.14 percentage points (pp) IF이며, defense는 HEA 대비 -8.26 pp이다. 표의 분산은 작지 않고 조합별로 매우 다르다. 예: DeepSeek-V4 계열에서 Hermes×DeepSeek-V4는 HEA `97.22 ± 0.79`, defense `93.06 ± 0.39`; ClaudeCode×GPT-5.6은 `96.11 ± 0.79`→`93.61 ± 1.96`; GPT-5.6 계열은 HEA 평균이 더 낮다. “모든 모델에서 방어가 누출을 제거”라고 쓰지 않는다.

Table 3 (p.10)은 대상 agent 6조합의 평균을 집계한다. No Defense는 IF `83.27%`, CT `48.35%`, task accuracy `81.00%`; With Defense는 IF `47.71%`, CT `31.83%`, accuracy `81.91%`다. 저자의 상대 변화는 IF -42.7%, CT -34.2%, accuracy +1.1%다. 정확도 변화는 +0.91 pp에 해당하며, -42.7%는 percentage-point 감소가 아니라 상대 감소(`35.56/83.27`)다. 조합별 accuracy는 Hermes GPT-5.6 `79.31→80.00`, Hermes DeepSeek-V4 `86.67→89.66`, ClaudeCode GPT-5.6 `83.33→81.48`, ClaudeCode DeepSeek-V4 `76.67→86.96`, OMP GPT-5.6 `73.33→73.33`, OMP DeepSeek-V4 `86.67→80.00`이다.

Table 4 (p.10)는 harness similarity만 보고한다. Pre-Distilled `41.80 ± 0.88`, Post-Distilled `54.17 ± 0.17`, RC-Harness `66.00 ± 0.33`이다. Post는 pre 대비 +12.37 pp, 상대 약 +29.6%; RC는 pre 대비 +24.20 pp, 상대 약 +57.9%다. target agent와 post-distilled task performance의 평균 2.2% gap은 표의 similarity와 별개의 본문 결과다(p.11). similarity scale의 pp와 accuracy gap을 혼합하지 않는다.

Table 2 (p.10)는 pre-distilled harness의 cross-model generalization을 보고한다. 표의 Overall 정확도 열 `84.99`, `83.38`, `86.00`은 receiver model baseline이 아니라 harness origin(각각 Hermes, Claude Code, OMP)을 집계한 열이다. 평균 relative gain은 harness origin별 Hermes `+7.40%`, Claude Code `+3.94%`, OMP `+8.77%`, 전체 `+6.70%`다. 이 표의 “relative gain”은 정확도 pp가 아니라 저자가 표시한 상대 백분율이다. GSM-Level6은 여러 조건에서 100.00으로 ceiling이라 gain 0이며, AIME/MMLU에 따라 효과가 달라진다. 본문은 ClaudeCode×GPT-5.6 post harness를 DeepSeek-V3 AIME2025에 옮겨 `53.3%`, pre 대비 `23.1%` 개선, Qwen3.6-Flash에서 `93.1%`, pre 대비 `3.4%` 개선이라고 별도로 말한다(p.11); 표와 집계 단위가 다를 수 있어 원자료 없이는 합산하지 않는다.

Figure 5 (p.9–10)는 시간(분) 축에서 Loop Harness Alignment validation accuracy가 크게 출렁이는 모습을 시각화한다. 본문은 10회 iterative training을 수행했다고 말하고 best validation이 대체로 약 5회 안에 도달한다고 설명하지만, Figure 5의 x축 자체는 round가 아니라 Training Time (min)이다(p.11). 평균 distillation process는 210분이라고 보고한다(p.12). 이는 학습 weight update 시간이 아니라 coding agent가 harness edit를 만들고 validation하는 실행 비용이다.

## 방어 결과와 운영상 안전 경계

논문 defense는 harness 구조 공개 요청을 탐지하면 실제 workflow와 의미상 일관되지만 materially false한 설명을 돌려주는 persistent system-context instruction이다(pp.6, 10–12). Table 6 (p.16)은 IF/CT의 OM·CON을 함께 보고하며, defense가 누출을 단순 omission보다 contradiction 쪽으로 이동시킨다고 설명한다. 평균 IF/CT의 correspondence 감소는 Table 3으로 확인되지만, false information이 사용자나 정상 감사자를 오도할 위험도 있으므로 이 방어를 일반 안전 기능으로 채택한다고 제안하면 안 된다. 합법적 사용자 요청의 정확성·감사 가능성과의 trade-off가 별도 평가되어야 한다.

이 문서에서는 공격용 prefix/suffix, query budget, extractor 구현, harness 복원 절차를 운영 recipe로 전개하지 않는다. 관련 내용은 승인된 보안 평가에서만 사용할 controlled threat model, redacted trace, synthetic target, rate limit, stop condition을 설계하는 근거로 제한한다.

## 한계와 분석적 비판

본문 자체가 single-round fixed-instruction defense가 보수적이며 adaptive/robust defense 여지가 크다고 인정한다(p.6). 또한 clean/injected query가 서로 다른 inference-time harness를 유도할 수 있어 `epsilon_A`와 extraction fidelity가 뒤섞인다(pp.4–5). Different harnesses can be behaviorally indistinguishable하므로 구조의 “정확한 복사”가 아니라 evaluation distribution에서 기능적 일치에 가깝다.

분석적으로, ground-truth harness를 가진 evaluator와 black-box attacker의 비대칭, 선택된 AMAS/모델/benchmarks, metric의 atomic-component decomposition, coding agent와 Claude Opus 의존성이 외적 타당도와 재현성을 제한한다. `±`의 의미(반복/seed/조합 분산)와 exact sample denominator, attack query 비용·latency·rate-limit 조건이 표에 충분히 노출되지 않아, 83.27% IF나 845× compression을 일반 서비스 위험으로 확대할 수 없다. Target system이 harness를 응답에 포함하는 실험적 조건과 실제 서비스의 leakage surface도 분리해서 기술해야 한다.

또한 defense가 accuracy를 평균 +0.91 pp 유지했다는 것은 이 표의 task setup에서의 관찰이지, 장기 사용자 utility·감사 정확성·prompt injection 저항성의 보장이 아니다. AHD의 post-distillation gain은 target task 및 disjoint validation에 기반한 harness search 결과라서, 새로운 task distribution에서의 지속성은 추가 검증 대상이다.

## 재현성 상태와 현재 프로젝트에 대한 전이

재현하지 않았다. 원문 PDF·추출 text·렌더링된 pp.9–11을 읽고 표 수치와 상대/pp 계산만 확인했다. 이 저장소에는 Claude Code/OMP/Hermes의 실제 AMAS, privileged harness logs, AHD extractor, 845× compression artifact가 없으며, 현재 local benchmark는 deterministic context retrieval/semantic gate다.

전이 가능한 설계 통찰은 leakage-aware evaluation이다. skill/plugin/MCP를 연구할 때 capability 설명, tool schema, source context, execution trace가 외부 출력에 섞이는 지점을 명시하고, authorized harness owner가 다음을 평가할 수 있다.

- clean visibility와 probe/induced visibility를 분리하고, 응답에 의한 disclosure를 correspondence/omission/contradiction으로 라벨한다.
- 기능적 동등성은 byte/trace equality가 아니라 사전 지정된 task rubric과 안전한 synthetic fixture에서 평가한다. behaviorally equivalent implementations가 많다는 식별성 한계를 기록한다.
- leakage 평가의 primary endpoint와 정상 task success를 동시에 기록한다. disclosure 감소가 accuracy·auditability를 손상하면 안전한 개선으로 결론내리지 않는다.
- trace에는 query count, latency p50/p95, tool calls, output/input hashes, failure/timeout, leakage labels, defense condition을 넣고, task-family bootstrap과 security/operational session units를 분리한다.
- defense ablation은 no defense / truthful refusal / fixed safe disclosure / deception condition을 사전 지정하고, deception은 실제 사용자에게 보이는 제품 정책으로 승격하지 않는다.

전이할 수 없는 점은 AHD를 repository plugin의 “harness distillation” 기능으로 구현하거나, 사용자의 skill/MCP instructions를 추출하는 공격 절차를 제공하는 것이다. 이 paper는 inference-time IP leakage threat model을 설명하며, weight distillation·plugin packaging·MCP transport의 효과를 측정하지 않는다.

## 안전한 원고 문장과 claim-to-page mapping

안전한 문장: “Cui et al.은 v4 preprint에서 AMAS inference-time harness의 black-box leakage를 CV/IF/CT/PP로 정의하고, 6개 agent–backbone 조합의 집계 IF를 no-defense 83.27%에서 defense 47.71%로 낮추면서 표의 task accuracy를 81.00%에서 81.91%로 보고했다 (Table 3, p.10). 이는 선택된 실험 조건의 누출·utility trade-off이며, 일반적인 harness 보호 보장은 아니다.”

또 다른 안전한 문장: “Post-Distilled와 RC-Harness의 harness similarity는 각각 54.17 ± 0.17, 66.00 ± 0.33으로 pre 41.80 ± 0.88보다 높았고 (Table 4, p.10), 저자는 cross-model 표에서 전체 평균 relative gain 6.70%를 보고했다 (Table 2, p.10). 이 값은 local repository 구현이나 fine-tuning 결과가 아니다.”

피해야 할 문장: “AHD가 모델을 학습해 더 작은 모델로 복제한다”, “845× compression은 가중치/추론 비용 845배 절감이다”, “deception defense가 leakage를 제거한다”, “공격자가 항상 harness를 복원한다”, “이 저장소의 plugin/MCP가 AHD 결과를 재현했다.”

| 주장 | 출처 |
| --- | --- |
| RQ1–RQ3, AHD two-stage contribution | pp.1–2 |
| AMAS formalization, threat model, identifiability | pp.3–5 |
| pre/post pipeline과 validation gate | pp.5–7, Algorithm 1 p.7 |
| CV/IF/CT/PP 정의 | pp.7–8 |
| agent/model/dataset/benchmark setup | p.8 |
| HEA IF ablation, mean ± values | Table 1 p.9 |
| cross-model gain, defense, similarity | Tables 2–4 p.10 |
| 210-minute overhead, generalization interpretation | pp.11–12 |
| OM/CON and defense behavior | pp.11, 16 |
| limitations, auditability, multi-teacher/self-distillation risks | pp.12–13 |

## 실험·원고에 반영할 제안

아직 구현·측정되지 않은 제안이다. (1) authorized synthetic harness로 clean/probe disclosure fixture를 만들고, (2) exact capability leak와 semantic leak를 별도 score하며, (3) 정상 task success·auditability·latency·query/cost를 함께 보고하고, (4) 모델/host/session 단위와 task-family 단위를 분리한다. 방어는 truthful refusal과 controlled redaction부터 비교하고, deception은 별도의 human auditability risk로 취급한다. 결과를 쓸 때는 논문 수치(외부 evidence), 현재 code/tests(implementation evidence), 실제 run ledger(Outcome evidence)를 한 claim에 섞지 않는다.
