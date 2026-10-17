# 에이전트 작업 흐름을 위한 원본 보존형 멀티모달 컨텍스트 최적화: 공급자 청구 토큰과 정확도의 실측

**Source-preserving multimodal context optimization for agent workflows: measuring provider-billed tokens and accuracy**

## 국문요약

에이전트 세션에서는 텍스트와 이미지가 대화에 누적되며 다음 요청에 반복 전송된다. 손실 요약인 compact는 문맥을 줄이지만 앞선 증거의 세부를 잃을 수 있다. 원본을 컨텍스트 밖에 보존하고 출처를 붙여 필요한 부분을 발췌하는 방법으로 compact를 보완한다. 텍스트는 원문 줄과 위치를 제공하며, 이미지는 호출자가 지정한 원래 해상도의 영역 crop, 저해상도 전체 썸네일, 배정 원본 재요청으로 다룬다. 단일 질의에서는 응답의 판독 불가 표지를 기준으로 같은 원본을 최대 한 번 재요청한다. 평가 설계는 클라이언트 변환별 공급자 청구 토큰, 단일 질의의 정확도와 재요청 비용, 다중 턴 세션의 누적 토큰과 늦은 회상을 구분한다. 비용은 정가와 프롬프트 캐시 반영 기준을 함께 비교한다. 적용 범위는 텍스트와 정적 이미지이며 영상은 후속 연구로 남긴다.

**주제어:** 멀티모달 컨텍스트, 원본 보존, 에이전트 세션, 청구 토큰, 정확도

## English Abstract

Agent sessions accumulate text and images and retransmit them in subsequent requests. Lossy context compaction can reduce context size while discarding earlier evidence. We complement compaction by retaining sources outside the context and returning selected evidence with provenance. Text excerpts preserve original lines and their locations. Images are handled through caller-specified crops at their original resolution, low-resolution full-image thumbnails, and requests for the assigned source. In the single-query design, an unreadability marker triggers at most one source requery. The evaluation separates provider-billed tokens under client-side transformations, single-query accuracy and requery cost, and cumulative tokens and late recall in multi-turn sessions. Costs are compared using both standard prices and prompt-cache accounting. The scope covers text and static images; video remains future work.

**Keywords:** multimodal context, source preservation, agent sessions, billed tokens, accuracy

## I. 서론: 문제와 경계

에이전트 세션에는 텍스트와 이미지가 누적되며 다음 요청에 다시 전송된다. compact는 손실 요약으로 누적 문맥을 줄이지만 앞선 증거를 잃을 수 있다. 원본을 외부에 두고 필요한 부분을 출처와 함께 발췌하는 구조는 compact를 보완한다. 원본을 보존하고 필요할 때 다시 조회하는 컨텍스트 관리는 텍스트 에이전트의 DTOC [1]와 ACM [2]에서 제안되었다. 본 연구는 이를 이미지 입력과 공급자 청구 토큰으로 확장하고, compact와의 관계를 사전 등록 실험으로 측정한다.

이미지 입력은 문서 질의응답, 차트 해석, 앱 화면 이해에서 답의 근거를 직접 담는다. DocVQA는 문서
이미지에서 질문에 답하는 구조를 정식 벤치마크로 다루고 [3], ChartQA는 차트의 시각적·논리적 추론을
평가한다 [4]. ScreenQA는 모바일 앱 화면과 답을 연결하는 문제를 보여 준다 [5]. 공통점은 픽셀의
일부가 질문 의미를 결정한다는 사실이다. 따라서 파일 바이트가 줄었다는 사실만으로 입력 최적화가
안전하다고 결론 낼 수 없다. 질문에 맞춘 축소가 답을 결정하는 증거를 지울 수 있다.

본 제안의 목표는 세션 틀 안에서 원본 보존과 응답 기반 재요청의 비용·정확도를 함께 측정하는 것이다. 질문과
이미지의 제한된 신호를 이용해 선택기가 후보 영역을 선택하고 고정된 출력 변환을 적용한다. 단일 질의에서
응답 기반 재요청은 첫 응답에 `UNREADABLE` 표지가 있으면 같은 배정 variant를 별도 fresh session에서 최대 한 번 다시 요청한다. 이 재요청이 보수적
fallback이며, 설계상의 안전장치일 뿐 아직 안전하다고 검증된 규칙은 아니다. 또한 소프트웨어 아티팩트와 시각적 손상 아티팩트를 구분한다. 소프트웨어 아티팩트는 이미지의
경로, 해시, 변환 이력, 모델과 질문의 식별자처럼 재현과 감사에 필요한 기록이다. 시각적 손상
아티팩트는 축소, 재인코딩, 잘림으로 인해 픽셀 증거가 변하는 결과물이다. 전자를 보존해도 후자의
정보 손실이 사라지지는 않는다.

범위는 텍스트와 정적 이미지의 원본 보존형 컨텍스트 관리와 평가 설계다. 동영상은 후속 연구로 남긴다. 현재 저장소는 UTF-8 텍스트 인덱싱, 해시, 라인 맵, 손실 요약 차단과 제한된 이미지 원본의
입력 검증·해시·치수 추적(M1a)을 제공한다. M1a는 메타데이터 청크가 없는 8비트 RGB/RGBA 정적 PNG와
baseline 4:4:4 JFIF JPEG 프로필을 받으며 원본에 쓰지 않는다. 영구 원본 보관이나 이미지 변환기, OCR 결합기, 호스팅 실행기 또는 사용량
계측기는 제공하지 않는다. 구체적인 프로필과 한계는 [입력 계약](../image-artifacts.md)에 기록한다.

**RQ1.** 클라이언트 변환(resize, JPEG 재인코딩, crop)은 공급자별 청구 이미지 토큰을 어떻게 바꾸는가?

**RQ2.** 단일 질의에서 질의 인식 발췌와 판독 불가 기반 원본 재요청은 정확도를 유지하며 토큰을 줄이는가?

**RQ3.** 다중 턴 세션에서 원본 보존 발췌는 전체 유지 및 compact 단독과 비교해 누적 청구 토큰, 과제 정확도와 늦은 회상을 어떻게 바꾸는가?

**C1 — 측정.** GPT-4o와 Claude Haiku 4.5의 이미지 청구 토큰을 클라이언트 변환별로 측정하고 공개 회계식과 대조한다.

**C2 — 시스템.** 텍스트 에이전트에서 제안된 원본 보존·재조회 구조 [1], [2]를 이미지 입력으로 확장하는 MCP 플러그인 설계다. 이미지는 원래 해상도 영역 crop, 저해상도 전체 썸네일, 원본 재요청으로 다룬다. 영역은 호출자가 정하며, 실험에서는 OCR 기반 질의 인식 선택기를 호출자로 사용한다. 텍스트는 LLM 없이 원문 줄과 출처를 붙여 발췌한다. 이미지 확장 설계와 현재 제품의 구현 범위는 III장에서 구분한다.

**C3 — 세션 평가.** 다중 턴 세션에서 전체 유지, compact 모사, 원본 보존 발췌, 그 조합을 사전 등록 held-out으로 비교한다. 비용은 두 공급자의 청구 토큰으로 정가와 캐시 반영을 나눠 잰다.

**C4 — 경계와 부정적 결과.** 공급자 내부 축소, 이미 손상된 입력, 조용한 오답, 캐시 반영에 따른 절감 축소 또는 비용 역전을 평가 범위에 포함한다. 원본 재요청의 안전성이나 모든 공급자에서의 비용 절감을 전제하지 않는다.

새 crop·pruning 알고리즘의 우월성이나 최초 평가를 주장하지 않는다. 모사 compact의 비교를 Claude Code·Codex 제품 compact의 성능 평가로 일반화하지 않는다.

## II. 관련 연구와 제안의 위치

### 2.1 문서·화면 질의 벤치마크

DocVQA는 문서 이미지의 질문과 답 구조를 제공하므로 문서 증거 보존을 평가할 후보 근거다 [3].
TextVQA는 장면 속 글자를 읽는 질문을 다루며 [6], 작은 문자열을 포함한 시각적 읽기 부담을 보여 주지만
문서·데스크톱 UI의 OCR 품질 인증서나 외부 래스터 전처리 규칙은 아니다. ChartQA는 시각 정보와 논리
추론을 함께 요구하므로 축·범례·값 표기의 보존을 점검할 후보다 [4]. ScreenQA는 화면 질의와 UI
영역을 다루지만 모바일 화면 중심이어서 일반 데스크톱에 대한 직접적인 일반화 근거가 아니다 [5].

### 2.2 모델 내부 시각 토큰 축소

QuietPrune은 질문에 따라 비전 언어 모델 내부 토큰을 일찍 제거하는 연구다 [7]. Rethinking Token
Reduction은 미래 질문을 알 수 없는 상황에서 토큰 축소를 다시 살핀다 [8]. 두 연구는 질의 조건부
선택과 원본 보존을 생각하게 하는 관련 근거지만, 외부 래스터 변환, MCP 전송, 과금 또는 이 제안의
fallback을 검증하지 않는다. 따라서 본 제안은 이들 연구보다 우월하다는 주장을 하지 않으며, 내부 토큰
압축과 외부 이미지 변환을 같은 개입으로 순위화하지 않는다.

### 2.3 텍스트 프롬프트·검색 압축

LLMLingua는 작은 언어 모델을 이용해 프롬프트 토큰을 압축하고 [9], RECOMP는 검색 문맥의 추출형·생성형 압축을 다룬다 [10]. 두 방법은 대상 모델 API 앞에서 문맥을 줄일 수 있다. 원문 줄을 그대로 반환하는 발췌는 줄 내부의 표현을 보존하지만 관련 줄을 선택하지 못할 위험은 남는다.

### 2.4 에이전트 컨텍스트 관리

DTOC는 도구 출력 원본을 외부에 보존하고 컨텍스트의 참조를 통해 되살리는 구조를 제안한다 [1]. ACM은 이전 문맥의 요약, 원본의 외부 저장, 필요할 때의 조회를 결합한다 [2]. 따라서 원본 보존·재조회 자체를 새로운 원리로 주장하지 않는다. The Complexity Trap은 관측 마스킹과 언어 모델 요약을 비교하며 [11], 전체 유지와 compact 모사(VI장의 S0·S1)의 비교 배경이 된다. 원본 보존 발췌와 발췌·compact 조합(VI장의 S2·S3)은 외부 원본을 재조회하는 구조에 대응한다.

| 연구 | 매체 | 모델 내부 / API 앞단 | 단일 질의 / 세션 | 비교 범위 |
|---|---|---|---|---|
| 시각 토큰 축소 [7], [8] | 이미지·텍스트 | 모델 내부 | 시각 질의 입력 | 외부 래스터 변환과 동일 개입으로 순위화하지 않음 |
| LLMLingua·RECOMP [9], [10] | 텍스트 | 대상 모델 API 앞단 | 프롬프트·검색 문맥 | 토큰 압축 또는 문장 선택 |
| DTOC·ACM [1], [2] | 텍스트 | 외부 저장·관리 도구; ACM은 학습 절차도 포함 | 에이전트 세션 | 원본 보존·재조회, VI장 S2·S3의 구조적 선행 연구 |
| 관측 마스킹·요약 [11] | 텍스트 | 컨텍스트 관리 | 에이전트 세션 | 전체 유지와 손실 관리 비교 |
| 본 연구: 원본 보존형 발췌 | 텍스트·이미지 | 공급자 API 앞단 | 단일 질의와 세션 | 호출자 지정 crop·썸네일·재요청 및 청구 비용 |

### 2.5 클라이언트 전처리와 청구 토큰

파일 바이트나 모델 내부 연산량의 감소와 공급자 청구 토큰 감소는 다른 측정 대상이다. 이미지 입력의 공개 회계식과 실제 사용량을 대조하고, 캐시 할인과 원본 재요청 비용을 함께 계산한다.

## III. 제안 방법

### 3.1 원본 보존 인터페이스

세션에는 원문 전체 대신 아티팩트 카드(ID·종류·제목·크기)를 전달하고, 필요한 증거를 ID로 조회한다. 카드는 실험용 세션 하네스의 표현이다. 제품의 텍스트 `index_artifact`는 `artifactId`, `path`, `sha256`, `byteLength`, `lineCount`, `label` 메타데이터를 반환한다.

텍스트 발췌 `query_artifact`는 제품에 구현되어 있으며 LLM 없이 원문 줄, 줄 번호와 해시를 반환한다. 실험의 `query_text_artifact`는 이 MCP 도구를 호출한다. 원문과 위치를 연결하므로 발췌의 출처를 다시 확인할 수 있다.

이미지 확장 설계의 `query_image_artifact`는 호출자가 지정한 원래 해상도의 영역 crop과 저해상도 전체 썸네일을 반환하고, 원본 해시와 crop 좌표로 출처를 연결한다. `get_original_image`는 ID에 해당하는 원본을 요청하는 인터페이스다. 이 두 이미지 도구는 현재 제품 MCP에 구현되어 있지 않으며, 실험에서는 연구용 하네스가 모사한다. 실험의 OCR 선택기는 연구용 호출자이고 제품의 질문 인식 선택 기능이 아니다. 썸네일과 판독 불가 시 자동 원본 재요청의 동결 조건은 VI장에서 기술한다.

compact 요약에는 아티팩트 ID를 남겨 이후 발췌·원본 조회를 가능하게 한다. 이는 실험 하네스의 요약 지시 규칙이며 제품 compact의 내부 동작이나 플러그인의 자동 compact 연동을 구현했다는 뜻이 아니다. 이 구조는 compact를 보완하며 작업 흐름의 도구 사용 규칙과 연결된다. 제품의 이미지 입력 검증·원본 추적(M1a)은 이미지 발췌 도구와 구분하며, 원본을 외부에 두는 설계가 영구 원본 보관 기능의 구현을 뜻하지도 않는다. 아래 선택·guard·계측은 연구 평가 경로를 정의한다.

### 3.2 이미지 선택과 응답 기반 재요청

한 요청은 질문, 원본 픽셀, 현재 선택된 고정 출력 변환 설정, 그리고 보안·경로 정책을 입력으로 받는다. 선택기는
질문과 배정된 픽셀에서만 계산되는 신호와 OCR 또는 영역 추정치를 사용할 수 있다. clean 조건에서는 배정된
clean pixels를 사용하지만, 손상 조건에서는 배정되지 않은 canonical clean 이미지에 접근하지 못한다. held-out
정답, gold evidence, 사람의 정답 라벨은 선택기에 제공하지 않는다. 모든 변환은 원본 패밀리 안에서만 생성하며 질문별
crop, 같은 템플릿의 near-duplicate, 서로 다른 입력 조건을 교차 split하지 않는다.

파일럿에서 먼저 고정할 후보 preset 이름은 PNG canonical, 긴 변 1536 이하로 줄이고 확대하지 않기, JPEG quality 75
재인코딩이다. 이 값은 계획된 calibration 후보값이며 안전 임계값으로 검증된 값이 아니다. 현재 선택에서 활성 출력
변환은 하나뿐이다. 긴 변 1536 이하 downscale(확대 없음)을 먼저 적용한 뒤 JPEG quality 75로 재인코딩하며, 목표 출력
프로필은 `jpeg-ycbcr8-baseline-444-v1`이다. 이 프로필은 목표일 뿐이며 실제 encoder 출력의 프로필 적합성은 검증되지
않았다. 선택기는 영역만 고르며 출력 format, quality, preset을 비교하거나 선택하지 않는다. PNG canonical은 변환이 PNG를
출력할 때의 출력 정규화 역할로 이름을 유지하지만, 변환 arm이 PNG를 출력하지 않는 현재 선택에서는 arm 출력에 쓰지 않는
비활성 항목이다. 이는 V장의 downscale-only 입력 조건을 준비할 때 만드는 PNG와 별개이며, 그 준비 PNG가 같은 encoder
설정을 쓴다고 주장하지 않는다. resize의 실제 적용은 입력 조건과 crop 결과 치수에 달린다(V장 참조). resize 단계가
identity일 수 있으므로 실제 effective transform을 별도 기록에 남긴다. 선택기는 질문의 핵심 문자열, OCR의 작은 글자 밀도,
선·표·UI 영역의 예상 손상 신호를 이용해 영역 후보를 정렬할 수 있다. 구체적인 영역 규칙, 점수, tie break는 아직 정하지
않았다. 사전 OCR guard는 사용하지 않는다. OCR 엔진·버전, 정확한 선택 규칙과 response guard의 frozen binding은 실행 전 gate다.

response guard는 변환된 입력에 대한 첫 응답에 대소문자를 구분하지 않는 `UNREADABLE` substring이 있는지 검사한다. 사전 OCR guard는 수행하지 않는다. 표지가 있으면 같은 배정 source variant를 변환 없이 최대 한 번 재요청한다. 단일 질의에서의 독립 호출과 응답 선택·비용 합산 규칙은 V장에 둔다.

full original과 original fallback의 원본은 해당 slot에 배정된 source variant다. 손상 조건의 원본 복귀는
손상된 입력으로 되돌아갈 뿐이며, 숨겨진 canonical clean 이미지를 복구해 전달하지 않는다.

response guard는 응답 상태와 실제 배정 variant, crop 경계, 변환 전후의 해상도·형식을 기록한다. 후보 변환의
시각적 보존을 보장한다고 표현하지 않는다.
승인된 case-insensitive `UNREADABLE` response guard 규칙은 calibration에서 확인만 하고 변경하지 않으며, 변경에는 새 사용자 결정이 필요하다. held-out 질문에 맞춰 다시 조정하지 않는다. 작은
글자에 대한 임의의 인증 임계값은 두지 않는다. 재요청률은 결과의 일부이며, fallback이 많다는
사실은 최적화가 잘 되었다는 뜻이 아니다. 입력 stress recipe와 승인된 response guard의 calibration 확인 및 공동 freeze 순서는 V장에 따른다.

선택기와 response guard의 출력은 원본 또는 하나의 변환 이미지와 함께 provenance manifest로 저장한다. manifest에는
원본·출력 SHA-256, 너비·높이, 형식, crop 좌표, 선택 이유, 변환 프리셋, OCR engine/version, 모델 snapshot, 질문 hash,
사용량, tokens·비용·지연, 상태, `UNREADABLE` 판정과 재요청(fallback) 여부를 포함한다. OCR·선택 latency도 기록한다. 출력 경로는 허용된 workspace 아래로만 해석하고 원본을
덮어쓰지 않는다.

### 3.3 비용과 관측

파일 바이트 감소는 청구 비용 감소와 같지 않다. 파일 크기, 업로드 시간, 전처리/OCR/선택 지연, 모델의
실제 사용량, 오류와 timeout을 별도 계측한다. 사용량이 보고되지 않으면 0으로 기록하지 않고 unknown으로
남긴다. 선택기 계산의 추가 비용도 원본 전달 arm과 함께 비교한다. 이 논문은 비용 절감을 전제하지 않으며,
호스팅 호출과 사용량 계측을 통해 그 질문을 평가한다.

## IV. 공급자 회계와 실험 1

공식 문서의 규칙에 예제 치수를 적용한 수치는 산술 추정이지 데이터셋의 실측 절감률이 아니다 [12]–[22]
([계산 예제와 상세 근거](./image-token-cost-models.md)). 회계 비교 대상은
`gpt-4o-2024-11-20`, `claude-haiku-4-5-20251001`, `gemini-3.8-flash`이고, `claude-sonnet-5-5`와
`gpt-5.6-sol`은 별도 회계 계열의 대조다. 이 다섯 대상은 산술 비교를 위한 것이며 어느 것도 파일럿 모델
선정을 뜻하지 않는다.

| 모델 ID / 설정 | 예제 결과 | 결과의 성격 |
|---|---|---|
| `claude-haiku-4-5-20251001` / standard [15]–[17] | 0–1.79% | 예제 치수의 패치 회계 산술; 0 사례 포함 |
| `gpt-4o-2024-11-20` / low [12]–[13] | 85 입력 토큰 고정, Δ=0 | 공식 크기 무관 회계 |
| `gpt-4o-2024-11-20` / high [12] | 최대 22.22% | 예제 치수 중 최대 산술 절감률 |
| `claude-sonnet-5-5` / high-resolution [15], [16], [18] | 양수 예제 36.64–64.36% | 고해상도 계열 대조의 양수 예제 |
| `gpt-5.6-sol` / original·auto·설정 생략 [12], [14] | 거부되지 않은 축소 예제 43.76–85.94% | 생략은 auto; 거부 사례 제외 |
| `gpt-5.6-sol` / high [12], [14] | 양수 예제 7.83% | 예제 치수의 산술 비교 |
| `gpt-5.6-sol` / low [12], [14] | 0% | 예제 치수의 산술 비교 |

`gemini-3.8-flash`의 명목 budget 비교는 Δ=0이지만 실제 크기별 사용량과 실제 차이는 unknown이다 [19]–[22].
GPT-5.6 Sol original/auto/설정 생략은 65,535px/side 상한까지 치수를 유지하고 처리 patch가 30,000을
넘으면 거부한다 [12], [14]. 거부는 자동 축소가 아니며 그 원본 기준은 정의되지 않아 절감률 비교에 포함하지 않는다.
모든 예제 값은 설정과 치수에 한정되며 모델 계열 전반, 파일럿 결과 또는 청구액을 나타내지 않는다.

실험 1은 GPT-4o와 Claude Haiku 4.5에서 원본 및 클라이언트 변환 입력의 공급자 사용량을 수집해 공개 회계식과 대조한다. 입력 치수·형식·변환 이력·모델 설정을 함께 기록하며, 앞의 예제 산술과 실제 호출의 청구 토큰을 구분한다.

## V. 실험 2: 단일 질의

파일럿은 12개 calibration source family와 탐색용 held-out 36개 family로 시작한다. 두 집합 모두 문서,
차트, UI strata를 같은 수로 배정한다. 평가 입력은 답과 증거를
숨긴, 직접 생성한 합성(소유) 아티팩트이며 그 원천은 손실 이력이 없는 RGB PNG(channels 3)로 한정한다.
DocVQA, ChartQA, ScreenQA는 외적 타당도를 위한 후보일 뿐이며 라이선스,
접근권, 파일 hash를 확인하기 전에는 사용하지 않는다. 각 domain에는 OCR small-text stress stratum을
포함한다.

clean 조건은 이 원천 파일을 재인코딩 없이 그대로 쓰며, 별도의 PNG canonical 재인코딩으로 clean을 만들지 않는다.
clean의 긴 변 L = max(width, height)는 1536 < L <= 2528 범위이고 사용자가 확정한 기준값은 2048이다. 정확한
width×height 목록, 종횡비, family별 배정과 기준값 2048의 운영 의미는 아직 정하지 않았으며 이후 합성 데이터 생성
단계에서 사용자 승인 뒤 확정한다. 원천의 생성 provenance, 제한된 PNG 입력 프로필 적합성,
encoded 크기의 10 MiB 한도 충족을 검증 항목으로 둔다. 네 입력 조건의 준비 recipe는 다음과 같다.

| 입력 조건 | 준비 recipe |
|---|---|
| clean | 원천 RGB PNG 그대로, 재인코딩 없음 |
| JPEG-only | clean 치수 그대로 JPEG quality 50, III장 3.2절에서 정의한 목표 프로필 |
| downscale-only | 긴 변 상한 1024로 downscale(확대 없음)한 뒤 RGB PNG, channels 3 보존; JPEG quality와 프로필은 해당 없음 |
| combined | 긴 변 상한 1024로 downscale(확대 없음)한 뒤 JPEG quality 50, III장 3.2절에서 정의한 목표 프로필 |

downscale-only와 combined는 같은 긴 변 상한 표현과 같은 값을, JPEG-only와 combined는 같은 quality를 쓴다. 이 입력
stress 값(긴 변 상한 1024, quality 50)은 조건 공통이며 arm 출력 변환의 후보값(긴 변 1536, quality 75)과 다른 값이므로
구분해 기록한다. 네 조건은 열거이지 operation order가 아니며, combined의 실제 순서는 downscale 뒤 JPEG다. combined를
downscale-only 산출물에서 연쇄 파생하지 않고 clean에서 직접 만든다는 것은 기존 집계 가정일 뿐 새로 승인된 결정이
아니며, 실제 파생 경로는 확인되지 않았다.

quality 50과 긴 변 상한 1024는 근거로 최적화한 값이 아니라 사용자 선택 잠정값이며 검증된 안전 threshold가 아니다.
12개 calibration family에서 이 잠정값을 확인하되, 무엇을 확인하면 검증된 것으로 볼지 기준은 아직 정하지 않았고
사용자가 실행 전에 결정한다. 어떤 stress 값 변경도 사전 사용자 승인 뒤에만 하며 이전 값, 새 값, 이유를 기록한다.
arm의 1536/quality 75는 유지하며 이 절차는 arm preset 변경 허가가 아니다. 순서는 다음과 같다. stress recipe를 먼저
고정하고 그 recipe에서 승인된 response guard 규칙을 확인한다. 규칙 변경은 새 사용자 결정이 필요하다. 이후 stress 값이 바뀌면 최종 값에서 고정 규칙을 다시 확인하고, held-out 시작
전에 stress recipe와 response guard를 함께 freeze한다. held-out 결과를 이용한 튜닝은 금지한다. stress 값이 바뀔 때마다 조건
공통이며 후보값과 다르다는 일관성, 긴 변 상한이 1536보다 작다는 조건, clean/stress 치수 부등식, JPEG decoder
accounting 상한, 최종 값에서의 response guard 확인을 다시 한다.

치수 범위에 대한 JPEG decoder accounting 검토는 산술적 한계 검토이며, 실제 encoder 출력·encoded 크기·프로필
적합성·메모리 사용 또는 안전성을 검증한 결과가 아니다([프로토콜](./image-first-evaluation-protocol.md) §2 및
[결정 메모](./image-protocol-decision-memo.md)의 accounting 산술 기록 참조).

고정된 모델과 질문마다 다음 다섯 arm을 같은 source variant에 적용한다. (A) full original, (B) naive
resize/compression, (C) query-aware selection without response guard, (D) 동일 selection과 response
guard 및 보수적 original fallback, (E) 사람의 evidence-region oracle 진단. 현재 선택에서 B, C와 D의 변환 경로,
E는 III장 3.2절의 같은 출력 변환 설정 하나를 쓴다. B는 crop하지 않고 그 변환만 적용한다. C와 D는 선택기가 영역만 정하고
선택 영역을 처리한 뒤 같은 변환을 적용하며, D의 변환 경로는 C와 같다. selector가 window를 내지 않으면 첫 호출에는 C/D의 full-frame 변환을 쓰며, 이 첫 호출은 fallback이 아니다. E는 oracle crop 뒤에 같은 변환을 적용한다.
A의 full original은 배정된 source variant를 그대로 전달한다. D의 response requery는 같은 배정 variant를 as-is로 전달한다. B가 crop하지 않는다는 것과
변환 arm의 최종 출력이 quality 75의 목표 프로필 JPEG라는 것은 다른 선택에서 자동으로 도출한 것이 아니라 각각 별도의
사용자 결정이다. E는 숨은 증거 영역을 사용하고
다른 arm의 튜닝이나 운영에는 사용하지 않는다. E annotation은 배정된 source variant에서 만든 frozen geometry와
crop만 쓰며 deployable arm에 전달하지 않는다. 모든 arm은 같은 질문, 모델, frozen instruction(“답을 읽을 수 없으면 UNREADABLE이라고 답하라”), detail 설정, output cap을 받는다. `UNREADABLE` 판정은 대소문자를 구분하지 않는 substring 검사다.
같은 출력 변환 설정은 같은 출력 치수나 같은 bytes를 뜻하지 않는다. selector 때문에 crop 수나 영역, transform
budget이 달라지면 selector만의 효과로 해석하지 않고 출력 size와 effective transform 차이를 함께 보고한다. C와 D는
같은 selection에서 응답 기반 재요청(보수적 fallback)의 유무만 다르게 둔다. preexisting corruption과 이번 변환이 도입한
degradation을 분리해 기록한다.
입력 조건의 recipe는 위 표를 따르며, 네 입력 조건에서 source family를 함께 유지한다.

D의 첫 호출은 C와 별도의 fresh session 호출이며 C의 응답을 재사용하지 않는다.

D에서 첫 응답에 `UNREADABLE`이 있으면 같은 배정 source variant를 변환 없이 그대로 fresh session에서 최대 한 번 재요청하며, A의 응답을 재사용하거나 재귀하지 않는다. 최종 D answer는 두 번째 호출의 응답으로 정하고 첫 번째와 두 번째 호출 각각의 tokens·cost·latency를 기록하며, D 결과에는 두 호출 값을 합산한다. `UNREADABLE`이 없으면 첫 응답을 최종 응답으로 쓴다.

resize 단계의 실제 적용은 입력 조건에 따라 다르다. downscale-only와 combined의 준비 단계 resize는 위 clean 범위에서
치수를 실제로 줄인다. 그 결과 두 조건의 variant는 긴 변이 1024 이하이므로 이후 arm의 1536 resize 단계는 identity다.
이때 B에는 crop이 없어 quality 75 재인코딩이 남고, C와 D의 변환 경로, E에는 선택된 crop 또는 영역 처리와 quality 75 재인코딩이
남는다. clean과 JPEG-only variant에서는 B의 1536 resize가 치수를 줄이므로 identity가 아니며, C와 D의 변환 경로, E에서는 crop 결과
치수에 따라 달라진다. quality 75 재인코딩은 quality 50 JPEG variant에도 그대로 적용하며 no-op으로 생략하지
않는다. resize identity는 resize 단계에 한정된 도출이며 pixels나 bytes의 동일성을 뜻하지 않는다. full-frame crop과
identity resize의 no-op 처리, 중간 crop 저장 방식, resize 필터와 반올림을 기록하고 실제 출력 bytes와 손실 크기를 평가한다.

탐색용 36 family × 질문 1개 × 조건 4개 × arm 5개는 frozen model에서 계획된 720 slots다. 이 중
production arms A–D는 576 planned slots, oracle arm E는 144 planned slots다. 이는 실행된 수가 아니라 계획 수이며 calibration
호출은 별도로 센다. 반복을 추가하면 사전에 횟수를 고정하고 분모에 포함한다. error retry와 response requery는
추가 attempts로 별도 센다. runtime failure와 timeout은
할당된 분모에서 incorrect로 센다. 실행하지 않은 slot은 failure와 구분해 `not_started`로 남기며, 완료된 연구의
증거로 쓰지 않는다. error retry와 response requery 호출 및 비용은 별도로 센다. 조건부 requery가 실패·timeout·invalid output이면 기존 규칙대로 assigned slot을 incorrect로 기록하고 usage·cost·tokens가 없으면 unknown으로 남긴다. 원본 보존, 경로 안전성, manifest 완전성은 모델 점수와
별도의 gate다.

분석은 family-cluster paired summary를 우선하고, primary 대비는 D−A 하나로 둔다. D−C와 C−B는 secondary
exploratory 대비이며, 유의성 또는 non-inferiority 주장은 별도의 검정력과 margin을 사전 등록하기 전에는 하지
않는다. oracle은 숨은 증거 영역을 사용한 진단으로만 보고한다. 모든 결과는 원본 대비 답
정확도, 증거의 가독성, 재요청률(requery rate)과 그 비용, 변환·선택 지연, 알려지지 않은 사용량을 분리한다.

primary metric은 planned production slot의 family-averaged QA success다. 응답 기반 fallback은 곧 재요청을 뜻한다.
재요청률(requery rate)은 이 operation이 일어난 비율을 나타내는 지표이며, 전체와 입력 조건별로 primary D−A와 함께 보고한다. 분자는 held-out에서 D에 배정된 slot 중 response guard가 실제로 재요청한 slot
수이고, 분모는 D에 배정된 slot 수로 전체 144, 입력 조건별 36이다. response guard 결정이 기록되지 않은 slot(`not_started` 등)은
분자에서만 제외하고 그 수를 따로 보고하며 분모에는 그대로 둔다. 재요청 호출의 비용과 지연은 D의 결과에 포함한다.
재요청률로 slot을 제외하거나 primary를 조정하지 않는다. 이 지표는
[프로토콜](./image-first-evaluation-protocol.md) §7의 provider rejection 비율(n/N, n/S)과 다른 지표이며 그 분모를
재사용하지 않는다. 기존 failure, retry, `not_started` 규칙은 그대로이고, calibration에 대한 재요청률 분모는 따로
정의하지 않는다.

D−C의 해석에는 경계가 있다. C와 D의 설계상 입력 경로 차이는 response requery 자체뿐이다. 독립 호출의 응답이
같다고 보장하지 않으며, 수락 slot에서 같은 artifact를 쓰는지와 변환의
결정성을 확인한다. fallback slot에서도 C의 출력은 JPEG이므로 clean·downscale-only의 PNG variant와 bytes가 같을
수 없고, JPEG-only·combined에서는 byte 일치 가능성을 별도로 확인한다. fallback slot의 빈도는 관측 지표다.
downscale-only와 clean, combined와 JPEG-only·clean의 치수 구분은 준비 단계의 상한 downscale이 실제로
실현될 때의 도출이다. 이는 치수 구분일 뿐이며, 네 조건의 pixel 배열이 모두 서로 다르다거나 quality 50의 손상 또는
효과가 입증됐다는 뜻이 아니다.

## VI. 실험 3: 에이전트 세션

### 6.1 템플릿과 턴

UI 디버깅(설정·대시보드 화면과 오류 로그), 문서 검토(청구서·공지 이미지와 처리 기록), 리포트 점검(차트와 작성 메모)의 세 템플릿을 각각 8턴의 고정 대본으로 구성한다. 턴 1–3에서 이미지·텍스트·이미지를 제시하고 즉시 세부를 질문한다. 턴 4는 교차 확인, 턴 5는 요지, 턴 6–8은 앞선 이미지의 작은 글자와 정확한 로그 줄을 포함하는 늦은 회상을 평가한다. 요지 문항도 포함해 손실 요약이 유리할 수 있는 과제를 배제하지 않는다.

### 6.2 비교 조건

| 조건 | 컨텍스트 처리 |
|---|---|
| S0 전체 유지 | 원본 이미지·텍스트 전문과 대화를 계속 전달 |
| S1 compact 모사 | S0의 이전 대화를 같은 모델의 고정 지시문으로 요약하고 대체; 요약 뒤 이미지 미유지 |
| S2 원본 보존 발췌 | 원본은 외부에 두고 카드만 전달; 도구 3종으로 발췌·썸네일·원본 조회; 판독 불가 응답이면 원본 자동 재요청; 턴 3·6 뒤 도구 결과 이미지 일괄 비우기 |
| S3 발췌 + compact | S2와 요약을 결합하고 요약에 아티팩트 ID를 남겨 재조회 |
| S4 단순 축소 유지(보조) | S0의 이미지를 긴 변 1536 이하·JPEG quality 75로 변환하여 전달 |

S1·S3의 compact는 턴 3과 턴 6 뒤의 고정 일정이다. 입력 토큰 임계값 4,000을 넘은 턴 수는 보조 지표로 기록한다. 각 공급자 안에서 조건 간 같은 질문과 기본 응답 지시를 사용하고, 도구 조건에는 도구 사용 지시를 추가한다. 도구 결과와 요약 호출도 컨텍스트 및 비용 계산에 포함한다.

S2·S3는 `query_text_artifact`(제품 MCP의 `query_artifact` 호출), `query_image_artifact`(연구용 C1 창 선택기와 전체 썸네일), `get_original_image`의 세 도구를 사용한다. 응답에 대소문자 구분 없이 `UNREADABLE`이 포함되고 조회할 이미지가 있으면 하네스가 마지막으로 조회한 이미지 원본을 같은 세션에 자동으로 제공하고 최대 한 번 다시 답하게 한다. 이는 모델의 자발적 원본 도구 호출과 별도로 적용한다. 두 조건 모두 턴 3·6 뒤 누적된 도구 결과 이미지 페이로드를 일괄 비우고 텍스트 흔적을 남긴다. 따라서 compact가 없는 S2에도 같은 이미지 비우기 일정이 적용된다.

턴당 도구 왕복은 최대 3회이며 temperature는 0이다. GPT-4o의 일반 응답 출력 상한은 60토큰, compact 호출은 400토큰이다. Haiku의 S2·S3 도구 경로는 출력 상한 512토큰, S0·S1·S4의 일반 응답은 60토큰, compact 호출은 400토큰이다. compact 지시문의 요약 길이는 250단어 미만이다. 출력 상한의 공급자·호출별 차이를 비용 해석에서 구분한다.

### 6.3 분할과 지표

개발 3세션, calibration 6세션, held-out 24세션으로 나누며 템플릿별 각각 1·2·8세션을 배정한다. held-out은 템플릿마다 기존 레이아웃 4세션과 전용 새 레이아웃 변형 4세션, 전체로는 기존 12세션과 새 변형 12세션이다. session family 단위로 seed를 분리하며 실험 2의 calibration·held-out family와도 겹치지 않게 한다. 기존 레이아웃과 새 변형을 나누어 보고하고, 같은 세션을 조건 간 짝지어 비교한다.

주 분석 모델은 GPT-4o(`gpt-4o-2024-11-20`), 보조 분석은 Haiku 4.5(`claude-haiku-4-5-20251001`)다. GPT-4o의 이미지 기본 detail은 high이고, 전체 썸네일은 긴 변 512 이하 이미지에 detail low를 적용한다. Haiku에는 detail 설정이 없으므로 긴 변 512 이하로 줄인 썸네일 이미지 자체를 전달한다. 이 차이를 모델 간 비교의 조건으로 명시한다.

주 지표는 문항 내용 정확도의 세션 평균이다. 누적 입력 토큰에는 도구 왕복과 compact 요약 호출을 빠뜨리지 않는다. 턴 6–8의 늦은 회상 정확도를 핵심 보조 지표로 두고, 출력 토큰, 정가·캐시 반영 비용, 도구 호출 수, 원본 요청률, compact 횟수, 지연, 실패와 조용한 오답을 함께 보고한다. 조건 차이는 같은 세션의 짝지은 차이로 분석하며, 세션 단위 bootstrap(10,000회, seed 20261015)으로 percentile 95% 신뢰구간을 계산한다. 실패와 타임아웃은 오답으로 세고, 미실행 세션은 `not_started`로 따로 보고한다.

## VII. 논의와 한계

텍스트 및 PNG·JPEG 엔지니어링 테스트와 픽스처 출처 기록은 입력·저장·오류 처리 계약의 근거다. 이미지의 시각적 가독성, 모델 정확도, 실측 토큰·비용·지연이나 최적화의 안전성을 입증하는 실험 근거와는 구분한다.

질의 인식 선택은 질문을 사용하므로 질문이 바뀌면 선택도 바뀐다. 판독 불가 표지의 발생은 모델과 입력에 따라 달라질 수 있으며, 모델이 오답에도 표지를 내지 않으면 응답 기반 재요청은 작동하지 않는다. 원본 재요청도 공급자 축소로 작은 글자 판독을 보장하지 않는다. provider의 원본 자동 축소와 crop 경계, 화면 배율,
모델의 detail 처리와 숨은 토큰화는 guard를 통과해도 시각적 의미를 손상할 수 있다. 보수적 fallback은
손실을 줄일 수 있다는 가설일 뿐 안전을 보장하지 않는다. 하나의 작은 파일럿은 일반화나 비용 체계를
증명하지 않는다. public benchmark의 license와 접근 조건, 모델 정책과 개인정보 승인은 별도 gate다.

공급자별 이미지 회계는 같은 1536px 입력 후보에도 서로 다른 결과를 낸다 [12]–[22]. GPT-4o low의 고정 토큰이나
Haiku standard의 provider patch cap처럼 예제상 변화가 없는 경우가 있고, GPT-4o high와 별도 회계 계열의
고해상도 예제에서는 설정·치수에 따라 계산 차이가 있다. 반대로 원본 요청이 거부되면 비용 비교의 기준값은
정의되지 않으며, 요청 예산만 제시된 Gemini 3.8 Flash의 실제 크기별 사용량도 알 수 없다. JPEG q75는 OpenAI와
Anthropic의 공개 회계식에 품질 변수가 없고 Gemini의 영향도 문서화되지 않았다. 기존 출처는 강한 JPEG
압축이 작은 글자를 읽기 어렵게 만들 수 있고 압축 아티팩트가 모델에 영향을 줄 수 있다고 경고하지만 [15],
이는 q75의 효과를 측정한 결과가 아니다 ([모델별 회계 근거](./image-token-cost-models.md)). 작은 글자
가독성, 실제 토큰 사용량, 청구 및 지연시간은 별도 관측 전까지 미확인이다. Sonnet 5.5와 GPT-5.6 Sol은
별도 회계 계열의 대조 예제이며 파일럿 후보를 추가하거나 확정하지 않는다. 이 회계 예제는 1536px/q75의
안전성·비용 기준으로 쓰지 않는다.

이번 pilot의 직접 생성한 합성(소유) 아티팩트는 재현성과 숨은 정답 통제를 돕지만 실제 문서 다양성을 대표하지 않을 수 있다.
외부 데이터는 각 family를 함께 split하고 hash와 버전을 고정해야 한다. UI 결과를 문서 결과와 섞으면
오류 원인을 잃으므로 domain별로 보고한다. 동영상은 프레임 간 일관성과 시간적 증거가 추가되므로,
이미지 response guard와 pilot이 검증되고 사용자가 승인한 뒤의 미래 작업으로만 남긴다.

프롬프트 캐시는 반복 입력의 비용을 바꾸므로 정가만으로 발췌의 이점을 판단하지 않는다. 캐시되지 않은 입력, 캐시 읽기와 쓰기 토큰을 구분하고, 정가 기준과 실제 캐시 반영 기준 비용을 함께 보고한다. 공급자별 할인율·쓰기 할증·TTL과 적용 조건은 [검증 필요]다. 캐시 재사용 감소로 절감 폭이 줄거나 비용이 역전될 가능성도 평가한다.

compact는 공개 규칙을 이용한 모사이며 제품 compact의 내부 동작과 같지 않다. 합성 아티팩트와 고정 대본은 실제 에이전트가 스스로 행동을 계획하는 상호작용을 대표하지 않을 수 있다. 공급자·모델 버전과 도구 사용 행동에 따라 관측 결과의 적용 범위도 달라질 수 있다.

## VIII. 결론과 후속 연구

원본 보존형 컨텍스트 관리를 텍스트와 정적 이미지로 확장하고 compact를 보완하는 평가 틀을 제시한다. 핵심은 바이트 감소만이 아니라 증거의 보존, 재조회 비용, 세션 전체의 청구 토큰과 정확도를 함께 측정하는 것이다. 공급자 회계 대조, 단일 질의, 다중 턴의 늦은 회상을 구분하며 캐시와 조용한 오답을 한계에 포함한다. 영상의 질의 인식 keyframe 발췌는 시간적 증거와 프레임 간 일관성을 추가로 검증할 후속 연구다.

## 참고문헌

[1] A. Chaturvedi, S. Bhattacharya, R. Gopalkrishnan, and P. van der Putten, “DTOC: Dynamic Tool Output Compression for Adaptive Context Management in AI Agents,” arXiv:2609.26121, 2026.

[2] X. Li, R. Ming, M. Chu, S. Shao, R. Jin, and C. Xiong, “ACM: Agentic Context Management for Long Horizon Tasks,” arXiv:2607.23809, 2026.

[3] Mathew et al., “DocVQA: A Dataset for VQA on Document Images,” WACV 2021.
   [Online](https://openaccess.thecvf.com/content/WACV2021/html/Mathew_DocVQA_A_Dataset_for_VQA_on_Document_Images_WACV_2021_paper.html)

[4] Masry et al., “ChartQA: A Benchmark for Question Answering about Charts with Visual and Logical Reasoning,” Findings of ACL 2022.
   [Online](https://aclanthology.org/2022.findings-acl.177/)

[5] Hsiao et al., “ScreenQA: Large-Scale Question-Answer Pairs Over Mobile App Screenshots,” NAACL 2025.
   [Online](https://aclanthology.org/2025.naacl-long.477/)

[6] Singh et al., “Towards VQA Models That Can Read,” CVPR 2019.
   [Online](https://openaccess.thecvf.com/content_CVPR_2019/html/Singh_Towards_VQA_Models_That_Can_Read_CVPR_2019_paper.html)

[7] Gao et al., “QuietPrune: Query-Guided Early Token Pruning for Vision-Language Models,” CVPR 2026.
   [Online](https://openaccess.thecvf.com/content/CVPR2026/html/Gao_QuietPrune_Query-Guided_Early_Token_Pruning_for_Vision-Language_Models_CVPR_2026_paper.html)

[8] Wang et al., “Rethinking Token Reduction for Large Vision-Language Models,” CVPR 2026; MetaCompress arXiv:2603.21701v1.
   [CVF](https://openaccess.thecvf.com/content/CVPR2026/html/Wang_Rethinking_Token_Reduction_for_Large_Vision-Language_Models_CVPR_2026_paper.html),
   [arXiv](https://arxiv.org/abs/2603.21701v1), [Source record](./image-first-sources.md)

[9] H. Jiang, Q. Wu, C.-Y. Lin, Y. Yang, and L. Qiu, “LLMLingua: Compressing Prompts for Accelerated Inference of Large Language Models,” arXiv:2310.05736, 2023.

[10] F. Xu, W. Shi, and E. Choi, “RECOMP: Improving Retrieval-Augmented LMs with Compression and Selective Augmentation,” arXiv:2310.04408, 2023.

[11] T. Lindenbauer, I. Slinko, L. Felder, E. Bogomolov, and Y. Zharov, “The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management,” in NeurIPS 2025 Workshop: Deep Learning for Code in the Agentic Era, 2025, arXiv:2508.21433.

[12] OpenAI. [Images and vision](https://developers.openai.com/api/docs/guides/images-vision). Accessed: Oct. 7, 2026.

[13] OpenAI. [GPT-4o model](https://developers.openai.com/api/docs/models/gpt-4o). Accessed: Oct. 7, 2026.

[14] OpenAI. [GPT-5.6 Sol model](https://developers.openai.com/api/docs/models/gpt-5.6-sol). Accessed: Oct. 7, 2026.

[15] Anthropic. [Vision](https://platform.claude.com/docs/en/build-with-claude/vision). Accessed: Oct. 7, 2026.

[16] Anthropic. [Vision coordinates and bounding boxes](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates). Accessed: Oct. 7, 2026.

[17] Anthropic. [Models overview](https://platform.claude.com/docs/en/models/overview). Accessed: Oct. 7, 2026.

[18] Anthropic. [Sonnet 5.5 model overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview). Accessed: Oct. 7, 2026.

[19] Google. [Media resolution](https://ai.google.dev/gemini-api/docs/media-resolution). Accessed: Oct. 7, 2026.

[20] Google. [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding). Accessed: Oct. 7, 2026.

[21] Google. [Pricing](https://ai.google.dev/gemini-api/docs/pricing). Accessed: Oct. 7, 2026.

[22] Google. [Gemini 3.8 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). Accessed: Oct. 7, 2026.
