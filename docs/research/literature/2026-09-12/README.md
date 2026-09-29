# 문헌 통합: 컨텍스트 절약, harness 적응, 보안

검토일: 2026-09-12. 이 디렉터리는 사용자가 제공한 PDF 네 편을 읽고 작성한 관련 문헌 패키지다. 원문 PDF는 게시하지 않으며, 파일명·해시·쪽수와 공개 원문 링크는 [`sources.json`](sources.json)에 기록한다. 개별 논문 검토는 [01 PruneVid](01-prunevid.md), [02 LGTTP](02-lgttp.md), [03 Better Harnesses](03-better-harnesses.md), [04 Agent Harness Distillation](04-harness-distillation.md)에 있다.

## 네 편의 문헌과 우선순위

| 우선순위 | 문헌 | 이 프로젝트와의 관계 | 읽을 때의 경계 |
|---|---|---|---|
| 1 | Yang et al., *Better Harnesses, Smaller Models* | 실행 시점 harness의 context/tools/hooks/loop/sub-agent 변경을 평가한다. 반복 작업의 harness 설계와 비용·품질 동시 측정에 가장 직접적인 인접 근거다. | 고정된 SLM·task·가격·실험 조건의 preprint 결과다. 저장소의 optimizer나 90% 절약을 검증하지 않는다. |
| 2 | Huang et al., *PruneVid* | 질의 조건부 입력 선택과 정보 보존을 효율 지표와 함께 다룬다. | 비디오 토큰/KV cache 연구이므로 텍스트 요약이나 agent context reset의 직접 증거가 아니다. |
| 3 | Kumar, *LGTTP* | temporal cue를 사용해 관련 frame/token을 보존하는 선택 설계를 보여준다. | arXiv v1의 멀티모달 결과이며 텍스트 사실·부정·행위자 보존으로 일반화할 수 없다. |
| 4 | Cui et al., *Agent Harness Distillation* | black-box harness 관측, 구조 추출, 방어와 leakage 측정을 다룬다. | 가중치 distillation이 아니며 보안 위협 모델이다. 공격 절차나 일반 agent 품질 효과의 근거로 사용하지 않는다. |

## 공통으로 남는 증거

네 논문은 서로 다른 층을 본다. PruneVid와 LGTTP는 입력 표현의 중복·질의 조건부 보존을, Better Harnesses는 실행 정책과 도구·문맥 구성의 적응을, AHD는 그러한 실행 구조가 관측될 때의 누출과 방어를 본다. 따라서 “더 짧은 context가 항상 더 좋은 답을 낸다”는 공통 결론은 없다. 문헌이 제공하는 안전한 설계 신호는 (a) 선택된 내용의 위치와 관계를 보존할 것, (b) 효율과 품질을 함께 측정할 것, (c) 실행 정책과 모델 가중치의 효과를 분리할 것, (d) 관측·보안 지표를 정상 task 성공과 별도로 기록할 것이라는 정도다.

개별 수치는 반드시 해당 노트의 PDF 쪽/표를 함께 읽어야 한다. 예를 들어 PruneVid의 retained ratio 15.1–17.0%와 FLOPs 0.20–0.26x는 서로 다른 자원 지표이고, LGTTP 표의 99.6%는 원점수 대비 상대값이지 99.6 percentage points가 아니다. Better Harnesses의 비용·정확도와 AHD의 IF/CT/similarity 수치는 각 논문의 모델·task·방어 조건에 한정된다. 모두 저자 보고값이며 이 저장소에서 재현하지 않았다.

## 현재 프로토콜에 적용하는 방법

현재 제안된 네 context arm은 그대로 둔다: `full_source`, `optimized`, `fixed_chunk`, `gold_reference`. 이 문헌 패키지는 arm을 추가하거나 576-slot 수를 바꾸지 않는다. `gold_reference`는 진단용 source span 조건이며 배포 arm이나 성능의 보장된 상한선으로 해석하지 않는다. 비교 시에는 같은 질문·모델 snapshot·출력 제한·도구·예산을 유지하고, optimizer 오류·fallback·timeout과 누락 slot을 결과로 남긴다.

| 문헌의 설계 신호 | 현재 평가에서의 적용 | 측정/해석 경계 |
|---|---|---|
| 질의 조건부 선택 | `optimized`의 선택 source hash와 질의 기록, `fixed_chunk`의 동일 예산 비교 | context 길이와 선택 규칙의 효과를 완전히 분리하지 못하면 end-to-end 효과로 보고한다. |
| 중복 제거와 최소 보존 | 숫자, 부정, 행위자-행동, 인과·시간 관계를 포함한 rubric과 semantic degradation fixture | token 감소율만으로 의미 보존을 추정하지 않는다. |
| harness 적응의 품질-비용 trade-off | raw trace와 summary trace를 별도 보관하고 preprocessing, inference, review/rework latency와 실제 사용량을 분리한다. | 로컬 heuristic token 수는 provider billing이나 hosted latency가 아니다. |
| leakage 방어와 관측 | 정상 task success와 extraction/security probe를 별도 study와 별도 지표로 둔다. | AHD의 공격 결과를 현재 optimizer의 보안 결과로 옮기지 않는다. |

효율과 품질의 결합 지표는 `task success`, exact/semantic fidelity, contradiction·omission·regression, p50/p95 latency, actual tokens/cost를 함께 보고하는 제안이다. “90% 효율”이나 “hallucination 감소”는 현재 문헌과 로컬 테스트만으로 주장하지 않는다.

## 주장과 원고 위치

| 주장 후보 | 원고 위치 | 현재 상태와 gap |
|---|---|---|
| adaptation은 모델 가중치, 절차, 외부 접근, packaging을 구분해야 한다 | Background / Framework | 설계상의 구분이며 네 논문이 이 분류 전체를 증명한 것은 아니다. |
| context 선택은 관계·부정·정확한 수치를 보존하는 rubric이 필요하다 | Evaluation / Threats to validity | 현재 fixture와 proposed rubric으로 부분 구현; 실제 모델 결과 없음. |
| harness 변화는 품질·비용·시간·재작업을 함께 평가해야 한다 | Related Work / Evaluation | Better Harnesses에서 영감을 얻은 proposal; 재현·인과 추정 미완료. |
| harness 관측/누출은 정상 task quality와 다른 endpoint다 | Safety / Threats to validity | AHD의 보안 인접 근거; 이 저장소의 leakage 실험 결과가 아님. |

새로운 보편적 우월성이나 novelty를 주장하지 않는다. 연구 gap은 “같은 모델·도구·총 예산에서 지속 context와 fresh handoff/delegation을 분리해, 전체 sequence 성공과 unsupported/false/fabricated claim을 동시에 측정한 검증”이 아직 이 패키지에서 수행되지 않았다는 점이다. 보충 출처는 가설의 특정 설계 쟁점을 확인하기 위한 것이며, 제공 PDF 네 편과 같은 깊이의 전체 독립 문헌 검토는 아니다. 상세한 조건부 가설과 제안 실험은 [05-agent-context-hypothesis.md](05-agent-context-hypothesis.md)에 적었다.

## 검토 상태

- 네 PDF: 모두 manifest의 SHA-256·page count와 대조해 읽었고, 저자 코드/체크포인트/실험은 재현하지 않았다.
- 문헌 수치: 해당 노트의 PDF page/table을 사용하며 상대 %·percentage points·token/FLOPs/cost/latency를 구분한다.
- 출처: [`sources.json`](sources.json)은 manifest와 맞춘 제공 PDF 네 개의 정확한 inventory다. 보충 문헌은 `references.bib`의 note에 `Discovered supplementary source`로 표시하며, 네 PDF와 같은 깊이의 독립 PDF 검토로 취급하지 않는다.
- 이 문서는 계획과 문헌 synthesis다. 실제 model run, paid execution, preregistration, power calculation 결과를 뜻하지 않는다.
