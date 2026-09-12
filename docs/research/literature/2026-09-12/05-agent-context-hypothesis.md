# Agent context 운영에 관한 조건부 가설 메모

## 결론부터: 조건부·검증 가능하며 아직 입증되지 않음

가설 H는 다음과 같다. **동일한 모델 snapshot, 도구, 총 자원, 검토 정책, 직렬 실행 일정과 versioned handoff를 맞추면, task마다 fresh worker를 만들고 handoff를 전달하는 방식이 persistent worker의 고정 compaction보다 긴 의존 sequence에서 명세 보존 성공률을 높일 수 있다.** 여기서 hallucination은 별도의 endpoint로 측정한다. fresh worker가 자동으로 독립적이거나, 더 빠르거나, 더 싸거나, hallucination이 적다고 주장하지 않는다. 아래는 H를 구성하는 전제와 불확실성, 검증 설계다.

## 일곱 전제

### 1. 유한 inference context와 RAM은 같은 것이 아니다

- **사실:** context window는 한 호출/세션에서 모델에 제시되는 토큰 예산이고 RAM은 실행 환경의 저장 자원이다.
- **추론:** context window는 한 inference 입력에 적용되므로 오래된 정보가 다음 입력에 모두 들어가지 않을 수 있어 요약·handoff가 필요해진다. 이것은 전체 session history나 RAM의 유한성을 뜻하지 않는다.
- **미지:** 실제 host가 어떤 기록을 보존·재주입·암호화하는지, 그리고 worker가 별도 history를 얼마나 상속하는지는 제품·런타임별로 다르다. fresh process가 곧 빈 RAM이나 빈 history라는 뜻은 아니다.

### 2. fresh worker도 큰 history를 상속할 수 있고 coordinator는 커진다

- **사실:** sub-agent/delegation 설계는 부모가 task와 handoff를 전달하고 결과를 다시 수집할 수 있다. Better Harnesses는 context management와 sub-agents를 harness search space로 다룬다(03 노트 pp.5–6).
- **추론:** worker를 새로 만들면 local working context는 줄 수 있지만, coordinator의 누적 history·handoff·review 기록은 증가할 수 있다.
- **미지:** 전달되는 raw trace, summary, 파일 참조의 실제 크기와 중복률은 구현 및 task에 따라 달라진다. handoff를 쓰고, 읽고, deduplicate/cache하는 비용은 fresh와 persistent 양쪽에 존재하므로 양팔의 같은 비용 회계에 포함해야 한다.

### 3. 같은 weights라도 reset은 독립 오류를 보장하지 않는다

- **사실:** 동일 model snapshot은 같은 입력과 decoding 조건에서 같은 경향을 공유한다. AHD도 black-box 관찰에서 행동적으로 구별 불가능한 harness가 있을 수 있다고 설명한다(04 노트 pp.3–5).
- **추론:** fresh worker의 오류는 persistent worker와 상관될 수 있고, 공유 handoff가 오류를 복제할 수 있다.
- **미지:** seed, tool state, retrieval order, reviewer feedback이 오류 상관에 미치는 크기는 실험 전에는 알 수 없다. 따라서 “fresh = independent”를 분석 가정으로 두지 않는다.

### 4. 총 compute와 elapsed time은 다르다

- **사실:** 여러 worker를 병렬로 실행하면 wall-clock은 줄 수 있지만 spawn, handoff, summary, review, rework와 각 worker의 token/compute는 누적된다. [*Towards a Science of Scaling Agent Systems*](https://arxiv.org/html/2512.08296v3)도 matched total tokens에서 domain별 gain/loss가 달라지고, 순차 planning과 decomposition의 효과가 다르다고 보고한다(Sec. 4).
- **추론:** fresh delegation은 elapsed latency와 total cost를 서로 다른 방향으로 움직일 수 있다.
- **미지:** provider queue, concurrency limit, cache, retry, reviewer schedule을 포함한 실제 비용·지연은 실행 환경에서만 관찰된다.

### 5. 반복된 손실 요약은 task 정보를 잃을 수 있지만 단조 손실은 아니다

- **사실:** raw trace를 summary로 바꾸면 원문 토큰과 표현 관계가 사라질 수 있다. 반대로 새 source retrieval, 고정 summary 규칙, 반복의 fixed point `C(C(s)) = C(s)`는 추가 손실을 멈출 수도 있다.
- **추론:** 요약 횟수가 늘면 숫자·부정·행위자-행동·시간 순서가 손실될 위험이 생기므로 raw-vs-summary와 relation coverage를 따로 검사해야 한다.
- **미지:** 손실이 매 회 단조 증가하는지, summary token 수가 retained information을 측정하는지, task별 threshold가 있는지는 검증되지 않았다. compressed token count를 retained-information의 대리변수로 사용하지 않는다.

### 6. 현재 OpenAI compaction 문서는 API primitive만 뒷받침한다

- **사실:** OpenAI compaction guide는 compaction item과 context 관리 API를 설명한다([공식 문서](https://developers.openai.com/api/docs/guides/compaction)).
- **추론:** opaque compaction item과 남아 있는 items를 고려하는 일반적 기록 모델은 설계 시 유용하다.
- **미지:** 그 문서만으로 이 ChatGPT/Codex 앱의 실제 내부 retention, 자동 compaction 경계, 암호화 payload 정책을 알 수 없다. 앱의 내부 정책이라고 단정하지 않는다.

### 7. 긴 context의 위치 편향은 compaction의 인과 증거가 아니다

- **사실:** *Lost in the Middle*은 긴 입력에서 정보 위치에 따른 retrieval 성능 변화를 보고한다([TACL 2024](https://aclanthology.org/2024.tacl-1.9/)).
- **추론:** handoff를 고정 형식·위치에 두고 early IDs, 예외, superseded decision을 probe하면 위치와 명세 보존을 평가할 수 있다.
- **미지:** 이 결과는 현재 모델의 compaction이나 fresh delegation이 원인이라는 증명이 아니다. 위치 probe에서 생긴 차이를 compaction 효과로 귀속하지 않는다.

## 조작적 검증 설계

핵심 비교는 **fresh-subagent − persistent-inline**의 paired task-success 차이다. 세 arm은 (1) persistent-inline + 고정 compaction, (2) fresh-inline + 같은 handoff 규칙, (3) fresh-subagent + 같은 handoff 규칙이다. fresh-inline 비교는 reset 효과와 delegation 효과를 분리하기 위한 exploratory contrast로 지정한다. manager는 scripted/budgeted로 고정하고, 모든 arm에 동일한 별도 fresh architecture-blinded reviewer와 동일한 correction round를 적용한다. handoff를 생성·작성·읽기·deduplicate/cache하는 시간과 token 비용을 세 arm에 똑같이 계산한다. 각 task family/repo를 subtask로 쪼개어 독립 표본을 부풀리지 않고, family 단위로 반복·군집화한다.

고정할 것은 base checkpoint, hidden requirements, task history, model snapshot, context/tool/retrieval surface, output limit, total token·time·cost budget, review policy다. handoff에는 version과 source/evidence hash를 넣고, ground-truth requirements는 evaluator가 필요한 범위에서만 비공개로 유지한다. persistent arm의 compaction threshold를 바꾸거나 fresh arm의 summary만 바꾸는 것은 본 비교와 별도의 mechanism probe다. 현재 repository의 576-slot 네 context arm protocol은 이 architecture 실험으로 대체되지 않는다.

### 결과와 실패 회계

일차 endpoint는 계획된 전체 sequence의 task success다. factual claim을 adjudicate할 수 있는 분모 `N`은 모든 adjudicable factual claims이며, unsupported claim과 contradicted/false claim은 별도 label이다. 검증된 contradicted/false claims를 `N`으로 나눈 false-claim rate를 보고하고, `N=0`이면 비율은 0이 아니라 `null/undefined`다. 단순히 citation이 없거나 확인할 지식이 부족한 claim은 자동으로 false로 세지 않고 `unknown/unverifiable`로 분리한다. secondary endpoint는 false claim 수와 `N`, sequence에 false claim이 하나라도 있는지, required-claim coverage, omission·contradiction·regression, early-ID/exception/superseded-decision 보존, spawn·summary·read·review·rework를 포함한 wall-clock, actual billed tokens/cache/reasoning fields, total cost/success다. budget으로 sequence가 끝나지 않으면 unsuccessful로 기록하고, 행정적 사유로 시작하지 않은 slot은 undispatched/missing으로 남긴다. 평가된 slot 수와 계획된 slot 수의 coverage를 함께 보고하며 incomplete coverage에서는 complete-case superiority claim을 하지 않는다.

family/언어/순서를 무작위화하고, held-out set에 접근하기 전에 prompt·handoff·reviewer·threshold를 freeze한다. pilot은 분산과 sample-size 결정을 위한 것이며 fabricated power 결과를 만들지 않는다. primary contrast 하나를 사전 지정하고 나머지는 exploratory 또는 multiplicity를 조정한다. confidence interval은 적절한 repo/family cluster 단위의 paired interval로 보고한다.

raw-vs-summary와 handoff/no-handoff, threshold/fixed-boundary compaction은 factorial 또는 mechanism probe로 분리한다. 관찰된 compaction 횟수는 어려운 task에서 내생적으로 늘 수 있으므로 그 횟수만으로 compaction의 인과 효과를 추정하지 않는다.

## 오류 유형과 falsification

| 유형 | 판정 |
|---|---|
| Unsupported claim | 근거가 제시되지 않았거나 evaluator가 검증할 수 없는 claim; 자동으로 false로 세지 않음 |
| Contradicted / false claim | source, hidden requirement, 또는 adjudicated evidence와 모순되는 검증된 false claim |
| Fabricated execution claim | 실행하지 않은 테스트·실험·수치를 실행/성공했다고 보고한 claim |
| Omission | 요구된 claim/evidence가 빠졌지만 남은 내용이 거짓이라고 단정할 수 없는 경우 |
| Spec drift | versioned requirement·handoff와 다른 동작 또는 해석 |
| Regression | 이전에 통과한 고정 fixture/요구사항을 새 실행에서 깨뜨린 경우 |
| Reversion | superseded decision을 되살리거나 최신 handoff 이전 상태로 돌아간 경우 |

Unsupported/no-citation alone은 hallucination으로 분류하지 않고 `unknown/unverifiable`로 남긴다. fabricated execution은 contradicted factual claim과 분리해 집계한다.

H는 사전 정한 meaningful effect `δ`를 기준으로 해석한다. CI가 0을 가로지른다는 이유만으로 H를 기각하거나 지지하지 않는다. fresh-subagent − persistent-inline 차이의 CI 상한이 `δ`보다 낮을 때에만 “적어도 δ만큼의 개선”을 배제할 수 있고, CI 전체가 0보다 충분히 낮아 사전 기준을 넘으면 persistent arm이 우세하다는 반대 효과를 지지한다. CI가 `δ`를 포함하거나 넓고 불확실하면 inconclusive로 보고 추가 자료가 필요하다. 비용·지연만 좋아지고 명세 보존 성공이 좋아지지 않아도 H의 quality 주장은 지지되지 않는다. false-claim rate 차이가 없으면 hallucination 분리 endpoint에 대한 별도 개선 주장을 하지 않는다. 결과가 한 task family·model·host에만 있으면 해당 범위의 관찰로만 보고하며, “항상”, “90% 효율”, “fresh worker는 lower hallucination” 같은 보편 문장으로 확장하지 않는다.

이 메모는 계획 제안이며 preregistered study나 실행 결과가 아니다. 제공된 네 논문은 설계 동기를 주지만 이 가설을 직접 검증하지 않는다. 특히 AHD는 보안/leakage 연구라서 harness extraction 공격 recipe나 정상 task 개선의 증거로 사용하지 않는다. 오류는 위 표의 label로 분리하고, 단순한 지식 부족이나 검증 불가능성은 hallucination으로 분류하지 않는다.
