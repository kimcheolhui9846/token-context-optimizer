# 실험 3 결과 부록: held-out 다중 턴 세션

이 부록은 사전 등록한 24개 held-out 세션의 결과를 기록한다. 분석 단위는 세션이며, 조건 간 같은 세션을 짝지었다. 실패·타임아웃은 오답으로 세고 세션을 제외하지 않았다. 결과를 보고 설계, 채점 규칙, 비열등 margin을 바꾸지 않았다. 실행·분석의 기준 커밋과 재현 절차는 [실험 3 프로토콜](./2026-10-15-experiment3-protocol.md)에 있다.

## 1. 실행과 조건

held-out 세트는 템플릿 3종마다 기존 레이아웃 4세션과 전용 새 레이아웃 4세션으로 구성된 24세션이다. manifest SHA-256은 `b88f64e3df671fff20a8562f7fbe1ba929b94f56d842e452b72d0cfb979d5da2`이다. 실행일은 2026-10-15이며, 사전 등록·하네스·분석 커밋은 각각 `ec6d534`, `2331e88`, `7d2425e`이다. [출처: `research/results/s3-heldout/README.md:3-11`, ID E3-1–E3-3]

조건은 S0 전체 유지, S1 compact 모사, S2 플러그인, S3 플러그인+compact, S4 단순 축소 유지(긴 변 1536 이하, JPEG quality 75)다. 이 부록의 compact는 공개 규칙을 재현한 실험용 모사이며 제품 내부 compact 동작이나 Task 40 규칙의 성능을 주장하지 않는다. [출처: `docs/research/2026-10-15-experiment3-protocol.md:30-35`, `research/results/s3-heldout/README.md:9-10`, ID E3-1]

주 분석 공급자는 `gpt-4o-2024-11-20`, 보조 공급자는 `claude-haiku-4-5-20251001`이다. GPT-4o는 기본 detail high다. Haiku의 도구 경로에는 긴 변 512 이하 썸네일을 사용하며, 영역을 찾지 못한 전체 이미지에는 별도의 arm 변환을 적용했다. [출처: `docs/research/2026-10-15-experiment3-protocol.md:36,48`, `research/results/s3-heldout/README.md:9-19`, ID E3-4]

## 2. 사전 등록 가설과 판정

신뢰구간은 세션 단위 bootstrap 10,000회, 기준 seed `20261015`, percentile 95%다. H1의 비열등 기준은 정확도 차이의 95% 신뢰구간 하한이 −5%p보다 크고 S2 입력 토큰이 S0보다 적은 경우다. 이 결과에서 하한이 −5%p보다 낮다는 것만으로 −5%p 이상 열등하다고 입증되는 것은 아니며 **비열등성이 입증되지 않은 것**으로 기록한다. H2와 H3은 각각 늦은 회상 차이의 상한 < 0, 하한 > 0을 요구한다. H4는 캐시 기준 절감률이 정가 기준 절감률보다 작은지 기술 통계로만 본다. [출처: `docs/research/2026-10-15-experiment3-protocol.md:17-22,54-56`, ID E3-5–E3-8]

| 가설 | 비교·판정 기준 | GPT-4o 차이 [95% CI] | 판정 | Haiku 차이 [95% CI] | 판정 |
|---|---|---:|---|---:|---|
| H1 | S2−S0 정확도; 하한 > −5%p이고 입력 토큰 S2 < S0 | −4.7%p [−8.9, −0.5]; 23,295 < 33,892 | 지지 안 됨 | −13.0%p [−17.2, −8.3]; 56,696 > 46,143 | 지지 안 됨 |
| H2 | S1−S0 늦은 회상; 상한 < 0 | −79.2%p [−88.9, −69.4] | 지지 | −20.8%p [−29.2, −12.5] | 지지 |
| H3 | S3−S1 늦은 회상; 하한 > 0 | +68.1%p [+58.3, +77.8] | 지지 | +1.4%p [−15.3, +18.1] | 지지 안 됨 |
| H4 | S2 절감률; 캐시 < 정가(기술 통계) | 정가 28.5%, 캐시 9.1% | 성립 | 정가 −33.0%, 캐시 −266.4% | 성립* |

* Haiku의 H4는 형식상 성립하지만 절감 자체가 없다. S2는 S0보다 정가·캐시 기준 비용이 모두 높다. [출처: `research/results/s3-heldout/gpt4o/analysis.md:9-14`, `research/results/s3-heldout/haiku/analysis.md:9-14`, `research/results/s3-heldout/README.md:23-37`, ID E3-5–E3-8]

GPT-4o에서 S1 compact 모사는 늦은 회상을 13.9%로 낮췄고 S3는 81.9%로 회복했다. Haiku에서는 S1 72.2%, S3 73.6%로 H3을 지지하지 않았다. 이는 각 공급자·대본·조건에 한정된 결과이며, compact가 모든 공급자에서 정확도를 보존한다는 근거가 아니다. [출처: `research/results/s3-heldout/gpt4o/analysis.md:24`, `research/results/s3-heldout/haiku/analysis.md:24`, ID E3-6–E3-7, E3-10–E3-14]

H1의 `지지 안 됨`은 사전 등록한 비열등성 기준을 충족하지 못했다는 뜻이다. 신뢰구간 하한이 −5%p보다 낮다는 사실만으로 −5%p 이상 열등하다고 입증한 것으로 해석하지 않는다. [출처: `research/results/s3-heldout/gpt4o/analysis.md:11`, `research/results/s3-heldout/haiku/analysis.md:11`, ID E3-5]

## 3. 조건별 정확도·회상·입력·비용

아래 값은 정확도와 늦은 회상은 분석 파일의 소수 한 자리, 토큰·비용은 결과 요약의 원 자릿수를 옮겼다. 비용은 세션 평균이며 정가와 캐시 기준을 구분한다.

| 조건 | GPT-4o 정확도 | GPT-4o 늦은 회상 | GPT-4o 입력 토큰/세션 | GPT-4o 정가 | GPT-4o 캐시 | Haiku 정확도 | Haiku 늦은 회상 | Haiku 입력 토큰/세션 | Haiku 정가 | Haiku 캐시 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S0 | 89.6% | 93.1% | 33,892 | $0.0850 | $0.0518 | 90.1% | 93.1% | 46,143 | $0.0464 | $0.0148 |
| S1 | 40.1% | 13.9% | 16,021 | $0.0430 | $0.0294 | 79.2% | 72.2% | 22,743 | $0.0268 | $0.0114 |
| S2 | 84.9% | 84.7% | 23,295 | $0.0608 | $0.0470 | 77.1% | 70.8% | 56,696 | $0.0617 | $0.0544 |
| S3 | 83.9% | 81.9% | 22,257 | $0.0615 | $0.0499 | 74.5% | 73.6% | 56,575 | $0.0653 | $0.0553 |
| S4 | 89.1% | 91.7% | 33,884 | $0.0850 | $0.0526 | 88.5% | 90.3% | 46,143 | $0.0464 | $0.0148 |

표의 정확도와 늦은 회상은 각각 GPT-4o 분석 `:20, :24`와 Haiku 분석 `:20, :24`에서 옮겼고, 입력 토큰·비용은 두 공급자의 요약 `:7-11`에서 옮겼다. [출처: `research/results/s3-heldout/gpt4o/analysis.md:20,24`, `research/results/s3-heldout/haiku/analysis.md:20,24`, `research/results/s3-heldout/gpt4o/summary.md:7-11`, `research/results/s3-heldout/haiku/summary.md:7-11`, ID E3-10–E3-14]

GPT-4o S2의 입력 토큰은 S0보다 31% 적었다(23,295 대 33,892). 이 정수 비율은 원자료가 제공한 값이며 표의 평균을 다시 계산한 값이 아니다. 실행 총계는 GPT-4o 1,460회/$8.07, Haiku 1,589회/$5.92(정가, 중단분 포함)다. [출처: `research/results/s3-heldout/README.md:16-19,31,42-48`, `research/results/s3-heldout/gpt4o/summary.md:7-11`, `research/results/s3-heldout/haiku/summary.md:7-11`, ID E3-4, E3-9–E3-14]

캐시 기준은 공급자 공식 가격표 확인 기록을 따른다. GPT-4o는 입력 $2.50, 캐시 입력 $1.25, 출력 $10.00/1M 토큰으로 읽기 0.5배를 적용했으며, Claude가 2026-10-18에 OpenAI 가격표를 확인한 기록을 따른다([OpenAI API pricing](https://developers.openai.com/api/docs/pricing)). `gpt-4o-2024-11-20` 스냅샷의 개별 가격 행은 표에 없다는 한계가 있어 같은 `gpt-4o` 가격을 사용했다. Haiku 4.5는 입력 $1, 5분 캐시 쓰기 1.25배, 읽기 0.1배, 출력 $5/MTok이며, Claude가 2026-10-18에 Anthropic 가격 문서를 확인한 기록을 따른다([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)). [출처: `research/results/s3-heldout/README.md:50-54`, `research/plans/2026-10-18-task38-number-sheet.md` §4, ID C-1–C-2]

Haiku에서 S2 입력 토큰이 S0보다 많은 이유는 도구 왕복마다 누적 기록을 다시 보내고 호출 수가 많았기 때문이다. S0 호출은 8.0회, S2는 18.5회였고 캐시 토큰은 각각 36,928과 10,171이었다. 이는 관측된 비용 구조의 설명이며 다른 공급자에 일반화하지 않는다. [출처: `research/results/s3-heldout/README.md:79-83`, ID E3-22–E3-23]

## 4. 레이아웃별 탐색 결과

레이아웃별 비교는 가설 판정에 사용하지 않았다. 기존 레이아웃과 새 레이아웃은 각각 12세션이다.

| 공급자 | 레이아웃 | 정확도 S0 / S1 / S2 / S3 / S4 | H2 S1−S0 늦은 회상 [95% CI] | H3 S3−S1 늦은 회상 [95% CI] | H1 S2−S0 [95% CI] |
|---|---|---|---:|---:|---:|
| GPT-4o | 기존 | 86.5% / 37.5% / 81.3% / 79.2% / 86.5% | −77.8%p [−91.7, −63.9] | +66.7%p [+50.0, +80.6] | −5.2%p [−11.5, +0.0] |
| GPT-4o | 새 | 92.7% / 42.7% / 88.5% / 88.5% / 91.7% | −80.6%p [−91.7, −69.4] | +69.4%p [+58.3, +80.6] | −4.2%p [−9.4, +1.0] |
| Haiku | 기존 | 88.5% / 75.0% / 76.0% / 76.0% / 86.5% | −25.0%p [−38.9, −11.1] | +8.3%p [−16.7, +30.6] | −12.5%p [−18.8, −7.3] |
| Haiku | 새 | 91.7% / 83.3% / 78.1% / 72.9% / 90.6% | −16.7%p [−25.0, −8.3] | −5.6%p [−27.8, +16.7] | −13.5%p [−19.8, −6.3] |

표의 값은 탐색용 레이아웃 분석에서 그대로 옮겼다. 새 레이아웃에서 성능이 떨어지지 않았다는 식의 일반화나 H1–H3 재판정은 하지 않는다. [출처: `research/results/s3-heldout/gpt4o/analysis.md:16-22`, `research/results/s3-heldout/haiku/analysis.md:16-22`, ID E3-17–E3-19]

## 5. 관찰된 오류와 탐색적 재현

GPT-4o에서 S0는 맞고 S2만 틀린 문항은 12개였다. 늦은 작은 글자 6건(그중 `UNREADABLE` 4건), 교차 문항 4건, 로그 즉시 문항 2건으로 구성된다. [출처: `research/results/s3-heldout/README.md:59-62`, ID E3-20]

고정 질의 재현 벤치에서는 두 공급자의 S2·S3 로그 즉시 오답 10건이 같은 4세션 안에 있었고, 질문 문장으로 질의했을 때는 **근거 줄 포함 여부 기준으로** 72/72에서 근거가 포함됐다. 이는 모델 정답률 72/72를 뜻하지 않는다. 이 관찰은 세션 일치를 보여줄 뿐이며 동점 발췌가 오답의 원인이라고 확정하지 않는다. [출처: `research/results/s3-heldout/README.md:72-77`, ID E3-21]

Haiku S2에서는 요지 문항 오답 17건과 늦은 회상 오답 21건이 관찰됐다. 요지 문항의 정답 범위가 20–31인데 답이 1–2였던 사례처럼, 해당 문항은 두 모델과 모든 조건에서 대부분 실패했다. 도구 왕복 상한 뒤의 재검색 문구도 관찰됐지만, 이 부록은 이를 새 가설의 검정 결과로 사용하지 않는다. [출처: `research/results/s3-heldout/README.md:78-90`, `research/results/s3-heldout/haiku/summary.md:7-11`, ID E3-22, E3-26]

Haiku S4와 S0의 입력 토큰은 모두 46,143이었다. 2026-10-15에 확인한 공식 비전 규칙에 따른 standard tier 축소가 두 입력을 같은 1,564 이미지 토큰으로 만들었고, 첫 턴 전체 입력도 각각 1,660토큰이었다. GPT-4o 역시 S4 33,884와 S0 33,892로 거의 같았다. [출처: `research/results/s3-heldout/README.md:84-89`, ID E3-24–E3-25, C-3]

## 6. 사전 등록 이탈

이탈은 1건이다. `heldout-document-review-4`의 GPT-4o S2 실행이 모델의 도구 인자 문자열 `"null"` 때문에 중단되어, `7914a44`에서 하네스를 수정했다. 중단된 7개 호출(총 $0.0225)은 분석에서 제외하고 해당 세션을 재실행했다. 객체가 아닌 인자를 `{}`로 처리했으며, 앞서 끝난 57개 결과는 이 경로를 지나지 않았다. 중단분은 시도 ID로 제외했다. 그 밖의 이탈은 없었다. [출처: `research/results/s3-heldout/README.md:92-102`, ID E3-27]

## 7. 재현과 한계

재현에는 held-out 실행 코드 `7914a44`의 작업 트리를 사용하고, 아래 명령은 그 작업 트리의 `research/`에서 실행한다. 이 역사적 번들은 Task 39의 다중 반환 query 변경 이전이며, 당시 텍스트 도구는 최고점 줄 하나 주변의 한 구간을 반환했다. 현재 제품 번들로 실행하면 같은 실험이 아니므로, 이 부록의 결과를 현재 제품의 동일한 동작이나 제품 compact 성능으로 해석하지 않는다. [출처: `docs/research/2026-10-15-experiment3-protocol.md:68-77`, ID E3-1, E3-5–E3-8]

재현 명령은 다음과 같다.

```text
node src/sessions.mjs --split heldout
node src/session-harness.mjs --split heldout --run-id <id> [--provider anthropic]
node src/session-summarize.mjs --run-id <id>
node src/session-analyze.mjs --run-id <id>
```

이 연구는 8턴 고정 대본과 세 템플릿을 사용하므로 실제 자율 에이전트 세션으로 일반화하지 않는다. H1의 비열등성은 두 공급자 모두 입증되지 않았고, Haiku H4는 비용 절감을 보여주지 않았다. 개선 효과를 정확도로 평가하려면 새 사전 등록이 필요하다. [출처: `docs/research/2026-10-15-experiment3-protocol.md:26,64`, `research/results/s3-heldout/README.md:25-37`, ID E3-5–E3-8]


이미지 조회 도구는 연구 코드의 시안이며 텍스트 도구만 실제 플러그인 MCP를 호출했다. content-match 채점은 정답 값이 설명이나 미완성 답에 있어도 정답으로 센다. 하네스는 재시도 뒤 API 오류가 남으면 실패 결과 저장 대신 중단한다. 보고된 실행은 전 조합이 완료되어 영향이 없지만, 실패가 남는 실행에는 사전 등록의 실패·미실행 정책을 별도로 적용해야 한다. [출처: `research/results/s3-heldout/README.md:104-111`]
