# 이미지 입력 토큰 비용 모델 비교

**확인일: 2026-10-07.** 공식 이미지 이해 API 문서에서 확인한 이미지 입력 회계와 표준 단가를 비교한다. 추론, count-tokens, 업로드, usage 응답, 청구서, 품질 또는 지연시간은 측정하지 않았다. 후보 모델과 설정은 비교용이며 최종 파일럿 선택은 사용자가 결정한다.

## 요약

- 1536px 클라이언트 축소의 토큰 효과는 모델 계열·tier·설정에 따라 다르며, 아래 값은 공식 산술 추정이지 실측이 아니다.
- Haiku 4.5 standard 예제의 절감률은 0–1.79%다(16:9와 patch cap 사례는 0%, 2:1 경계는 1.79%). GPT-4o low(고정 85토큰)는 Δ=0이다. Gemini 3.8은 명목 예산 차이 Δ=0이며 실제 크기별 소비 토큰은 알 수 없다. GPT-4o high 예제의 최대 절감률은 22.22%다.
- Sonnet 5.5 high-res tier의 양수 예제는 36.64–64.36%다. GPT-5.6 Sol auto=original의 거부되지 않은 축소 예제는 43.76–85.94%이며 high는 7.83%, low는 0%다.
- GPT-5.6 Sol 기본 설정은 문서화된 65,535px/side 상한까지 원본 치수를 유지하고, 처리 patch가 30,000을 넘으면 거부하며 budget 축소하지 않는다. 예제에서 client 축소는 토큰을 바꾸고 거부를 피하지만, 거부 사례에는 절감률이 없다.
- 절감률은 이 노트의 예제 치수에만 해당하며 WBS 5.1 데이터셋 가중 추정이 아니다. 대조 모델은 파일럿 선택이 아니며, 품질·실제 청구·지연시간은 측정하지 않았다.

## 정의, 범위와 제외 항목

- P(provider, model, setting, image)는 공급자 처리, T는 공식 토큰 회계다. B=T(P(original)), C=T(P(client(original))), Δ=B−C, 절감률=100×Δ/B (B>0)로 둔다. 양쪽 모두 같은 모델, 설정, 공급자 규칙을 적용한다.
- 후보 클라이언트 정책은 긴 변 최대 1536px, 종횡비 유지 후 최근접 정수 픽셀로 반올림, 확대 없음이다. 예시에는 정확한 반올림 동률 입력이 없다. JPEG q75는 별도 후보 인코딩이다. 이 문서에서 정책을 실행하거나 바이트·시각 품질을 검증하지 않는다.
- 단가는 표준 유료 비캐시 USD/백만 입력 토큰이다. 이미지 토큰만 환산하며 텍스트, 출력, 도구, 캐시, 배치/우선 추론, 세금·할인·환율은 제외한다. 컨텍스트 한도는 가격 산정과 별개다.
- 공식 크기 무관 토큰 수가 공개된 경우에만 고정값으로 쓴다. 근사 예산은 정확한 청구 토큰이 아니다. 아래 숫자는 공식 규칙을 산술 적용한 추정이다.
- 범위는 WBS 4.1 Task 27의 F-06 공식 출처 근거 보강이다. 전체 데이터셋 추정은 WBS 5.1, 논문 초안·평가 프로토콜 수정은 WBS 4.2, F-12 논문 방향 결정은 제외한다. 이 문서는 구현, 성능 결론, 실험 결과를 제시하지 않는다.

## 비교 후보

| 공급자 / 후보 ID | API 표면 및 설정 | 공식 표준 가격 / 컨텍스트 | 선정 근거와 제한 |
|---|---|---|---|
| OpenAI gpt-4o-2024-11-20 | Responses/Chat Completions: low, high, auto; 생략은 auto. GPT-4o에서 original 미지원. | 입력 $2.50/MTok, 출력 $10/MTok; 컨텍스트 128,000. | 날짜가 붙은 이미지 snapshot으로 GPT-4o tile 회계를 대표하고 날짜 고정 모델을 선택했다. 가격은 GPT-4o 계열 표기이며 snapshot 전용 단가는 아니다. |
| Anthropic claude-haiku-4-5-20251001 | Messages API, 해상도 필드 미노출. transformations.oversized_image 기본 동작 또는 error 선택 가능. | 입력 $1/MTok, 출력 $5/MTok; 컨텍스트 200,000. | 날짜 고정 모델과 28px standard tier의 capped 회계를 대표하며 resize/error 동작을 비교한다. 은퇴는 2026-10-15보다 빠르지 않다는 최소 전망만 확인됨. |
| Google gemini-3.8-flash | Interactions API 이미지 resolution: unspecified(기본), low, medium, high, ultra_high(항목별 설정만). | 2026-12-31까지 입력 $0.75/MTok, 출력 $3.75/MTok; 2027-01-01부터 각각 $1.50, $7.50. 컨텍스트 1,048,576. | 해상도별 근사 예산을 설명하는 현재 안정 ID다. 날짜가 붙은 snapshot은 제시하지 않아 날짜 고정 재현성 제한이 있고, 실제 크기별 계산 경계는 공개 근거가 없어 다른 두 회계식과 혼합하지 않는다. |

## OpenAI: GPT-4o 타일 회계

GPT-4o low는 이미지 크기와 무관하게 85 입력 토큰이다. high와 auto는 종횡비를 유지하며 2048×2048 안에 맞춘다. 짧은 변이 768px보다 크면 짧은 변을 768px로 줄이고 나머지 변은 내림한다. 작은 이미지는 확대하지 않는다. 512px 타일 수 N=ceil(width/512)×ceil(height/512), 입력 추정은 85+170N이다. GPT-4o sizing 표는 high와 auto에 타일 규칙을 적용하며 생략 기본값은 auto라고 명시한다.

| 요청 설정 | 회계 적용 |
|---|---|
| low | 고정 85, 모든 유효 이미지 크기에 동일 |
| high | 85+170N |
| auto | high와 같은 GPT-4o 타일 규칙 |
| 생략 | 기본 auto, 따라서 auto와 같은 규칙 |

| 모델 / 설정 | 원본 regime 및 크기 | provider 제한 / 비교 기준 | client 변환 결과 | provider 처리 원본 | B 계산 | provider 처리 변환 | C 계산 | Δ / 절감률 |
|---|---|---|---|---|---:|---|---:|---:|
| GPT-4o low | 크기 무관, 예 1024×1024 | 크기별 토큰 상한 없음 | 1024×1024 (no-op) | 처리 치수 미기재 | 고정 85 | 처리 치수 미기재 | 고정 85 | 0 / 0% |
| GPT-4o high/auto/생략 | L≤1536, 예 1024×1024 | 클라이언트 no-op; provider의 짧은 변 768 규칙 | 1024×1024 | 768×768 | 85+170×4=765 | 768×768 | 85+170×4=765 | 0 / 0% |
| GPT-4o high/auto/생략 | L≤1536, 경계 예 1536×768 | 클라이언트 no-op; 768px 짧은 변 경계 | 1536×768 | 1536×768 | 85+170×6=1105 | 1536×768 | 85+170×6=1105 | 0 / 0% |
| GPT-4o high/auto/생략 | 1536<L≤2048, 예 2048×512 | provider 긴 변 cap 2048px 이내 | 1536×384 | 2048×512 | 85+170×4=765 | 1536×384 | 85+170×3=595 | 170 / 22.22% |
| GPT-4o high/auto/생략 | L>2048, 예 4096×1024 | provider 긴 변 cap 2048px 초과 | 1536×384 | 2048×512 | 85+170×4=765 | 1536×384 | 85+170×3=595 | 170 / 22.22% |
| GPT-4o high/auto/생략 | 1536<L≤2048, 예 2048×1024 | provider 처리 후 짧은 변 규칙 적용 | 1536×768 | 1536×768 | 85+170×6=1105 | 1536×768 | 85+170×6=1105 | 0 / 0% |

예를 들어 2048×512 원본과 1536×384 변환은 각각 4×1 및 3×1 타일이다. 1,000장 추정 입력 비용은 $1.9125에서 $1.4875로 계산된다. 2048×1024 사례는 같은 provider 처리 이미지로 귀결되어 비용 차이가 0이다. OpenAI의 512MB 요청 payload, 최대 1,500장 및 이미지별 patch 제한 안내는 이 타일 기반 GPT-4o 공식을 대신하지 않는다. 별도 patch 모델 설정에 나온 30,000 patch 제한을 GPT-4o tile 기준으로 사용하지 않았다.

출처: [GPT-4o 모델](https://developers.openai.com/api/docs/models/gpt-4o) — ID, 가격, 컨텍스트, 스냅샷. [이미지와 비전](https://developers.openai.com/api/docs/guides/images-vision) — GPT-4o detail, 기본값, 타일 규칙, 요청 입력 제한.

## Anthropic: Haiku 4.5 표준 패치 회계

공식 토큰식은 ceil(width/28)×ceil(height/28)이다. Haiku 4.5 표준 tier의 긴 변 한도는 1568px, visual-token 한도는 1568이다. 둘 중 하나를 넘으면 종횡비를 유지해 축소한다. 공식 참조 구현은 가장 큰 적합 크기를 이진 탐색하고 Python round로 짧은 변을 계산한다. 아래·오른쪽 패딩은 이미 ceil 기반 토큰식에 포함되는 28px 경계 정렬이며 별도 토큰 가산으로 계산하지 않는다.

| 이미지 설정 | 동작 | 초과 이미지 결과 |
|---|---|---|
| transformations 생략 | 기본 축소(downsize) | provider가 표준 한도에 맞게 리사이즈 |
| transformations.oversized_image=downsize | 명시적 축소 | 기본과 같은 처리 경로 |
| transformations.oversized_image=error | 초과 이미지 거부 | provider 한도 초과 시 요청 오류; B/C/Δ 계산 대상이 아님 |

| 모델 / 설정 | 원본 regime 및 크기 | provider 제한 / 비교 기준 | client 변환 결과 | provider 처리 원본 | B 계산 | provider 처리 변환 | C 계산 | Δ / 절감률 |
|---|---|---|---|---|---:|---|---:|---:|
| Haiku 4.5 / 생략 또는 downsize | L≤1536, 예 1120×560 | 표준 1568px/1568-token 안 | 1120×560 | 1120×560 | 40×20=800 | 1120×560 | 40×20=800 | 0 / 0% |
| Haiku 4.5 / 생략 또는 downsize | L≤1536, 경계 예 1536×768 | 표준 patch 예산 바로 아래 | 1536×768 | 1536×768 | 55×28=1540 | 1536×768 | 55×28=1540 | 0 / 0% |
| Haiku 4.5 / 생략 또는 downsize | 1536<L≤1568, 예 1568×784 | provider 긴 변 경계; patch 수 1568 | 1536×768 | 1568×784 | 56×28=1568 | 1536×768 | 55×28=1540 | 28 / 1.79% |
| Haiku 4.5 / 생략 또는 downsize | L>1568, 예 3136×1568 | provider 긴 변 한도 초과 | 1536×768 | 1568×784 | 56×28=1568 | 1536×768 | 55×28=1540 | 28 / 1.79% |
| Haiku 4.5 / 생략 또는 downsize | L≤1536, 예 1400×1400 | 이미 provider patch cap 초과 | 1400×1400 (no-op) | 1092×1092 | 39×39=1521 | 1092×1092 | 39×39=1521 | 0 / 0% |
| Haiku 4.5 / 생략 또는 downsize | L>1568, 예 3072×3072 | 원본과 client 결과 모두 provider patch cap 초과 | 1536×1536 | 1092×1092 | 39×39=1521 | 1092×1092 | 39×39=1521 | 0 / 0% |
| Haiku 4.5 / 생략 또는 downsize | L>1536, 예 1920×1080 | 표준 1568px/1568-token limit 적용 | 1536×864 | 1456×819 | 52×30=1560 | 1456×819 | 52×30=1560 | 0 / 0% |
| Haiku 4.5 / 생략 또는 downsize | L>1536, 예 3840×2160 | 표준 1568px/1568-token limit 적용 | 1536×864 | 1456×819 | 52×30=1560 | 1456×819 | 52×30=1560 | 0 / 0% |
| Haiku 4.5 / error | L≤1536, 예 1120×560 | 원본·변환 모두 한도 이내 | 1120×560 (no-op) | 1120×560 | 40×20=800 | 1120×560 | 40×20=800 | 0 / 0% |
| Haiku 4.5 / error | provider 경계, 1568×784 | 원본 경계 입력과 변환 모두 통과 | 1536×768 | 1568×784 | 56×28=1568 | 1536×768 | 55×28=1540 | 28 / 1.79% |
| Haiku 4.5 / error | L>1568, 예 3136×1568 | 원본 초과는 거부, 변환은 한도 이내 | 1536×768 | 원본 요청 거부 | 미정의 | 1536×768 | 55×28=1540 | B 미정의로 Δ 계산 불가 |
| Haiku 4.5 / error | L≤1536, 예 1400×1400 | 원본과 변환 모두 patch cap 초과 | 1400×1400 (no-op) | 요청 거부 | 미정의 | 요청 거부 | 미정의 | 계산 불가 |

1,000장 기준 1568-token 사례는 $1.568, 1540-token 사례는 $1.540이다. 기본 downsize 사례에서 1536px 변환은 이미 patch cap이 적용된 1400px 정사각 이미지의 토큰 수를 낮추지 않는다.

Haiku 4.5 Messages API 이미지의 최대 크기는 10MB base64 및 8000×8000px이고, 200k context 모델에 해당하는 요청 한도는 최대 100장이다. 20장을 넘는 이미지 요청에는 별도 더 엄격한 치수 한도가 적용된다. 일반 Vision 페이지의 최대 600장 설명은 Haiku 4.5에 적용하지 않았다. 요청 payload 한도는 표준 endpoint 32MB이며 플랫폼별로 낮을 수 있고, 이미지 수보다 먼저 도달할 수 있다. JPEG, PNG, GIF, WebP를 지원하고 애니메이션은 첫 프레임만 처리한다.

출처: [Vision](https://platform.claude.com/docs/en/build-with-claude/vision) — Haiku 모델의 표준 tier, 제한, 형식, 패치 공식. [좌표와 경계 상자](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates) — 이진 탐색 참조 구현과 error 옵션. [모델 개요](https://platform.claude.com/docs/en/models/overview) — ID, 가격, 컨텍스트, 은퇴 전망.

## Google: Gemini 3.8 Flash 근사 예산과 증거 공백

Media resolution 문서는 Gemini 3 이미지 수를 unspecified 기본 약 1120, low 280, medium 560, high 1120, ultra_high 2240으로 제시한다. 문서 표현은 approximate token counts이며 실제 수가 미디어 유형과 모델 버전에 의존한다고 밝힌다. 이는 요청 예산이고 정확한 소비 토큰 또는 보장된 청구량이 아니다. 이 선택 모델에 적용되는 치수 기반 cap/resize 공식은 확인하지 못했다.

| 요청 설정 | 지원 및 생략 동작 | 공식 이미지 예산 | 산술 가격 / 이미지당, 현 단가 | 산술 가격 / 이미지당, 2027-01-01부터 |
|---|---|---:|---:|---:|
| resolution 생략 | 기본값 unspecified | 약 1120 | 약 $0.00084 | 약 $0.00168 |
| unspecified | 명시 가능 | 약 1120 | 약 $0.00084 | 약 $0.00168 |
| low | 지원 | 약 280 | 약 $0.00021 | 약 $0.00042 |
| medium | 지원 | 약 560 | 약 $0.00042 | 약 $0.00084 |
| high | 지원, 대부분 사용 사례 추천 | 약 1120 | 약 $0.00084 | 약 $0.00168 |
| ultra_high | 콘텐츠 항목별 설정만 | 약 2240 | 약 $0.00168 | 약 $0.00336 |

| 설정 | 원본 크기 regime | 공식 근사 예산 | B_budget | C_budget | Δ_budget | 실제 B/C/Δ |
|---|---|---:|---:|---:|---:|---|
| resolution 생략 (기본 unspecified) | 크기 무관(근사 예산) | 약 1120 | 1120 | 1120 | 0 | 모두 미확인 |
| unspecified (명시) | 크기 무관(근사 예산) | 약 1120 | 1120 | 1120 | 0 | 모두 미확인 |
| low | 크기 무관(근사 예산) | 약 280 | 280 | 280 | 0 | 모두 미확인 |
| medium | 크기 무관(근사 예산) | 약 560 | 560 | 560 | 0 | 모두 미확인 |
| high | 크기 무관(근사 예산) | 약 1120 | 1120 | 1120 | 0 | 모두 미확인 |
| ultra_high (콘텐츠 항목 설정) | 크기 무관(근사 예산) | 약 2240 | 2240 | 2240 | 0 | 모두 미확인 |

가격표의 budget×표준 단가는 요청 예산을 적용한 이미지당 산술 참고값이다. 표의 B_budget/C_budget/Δ_budget은 설정별 근사 예산 비교일 뿐이며, 실제 B/C/Δ 및 실제 비용은 모두 미확인이다. Google 이미지 이해 페이지는 작은 이미지의 258-token 규칙과 큰 이미지의 768×768 crop 설명을 싣고, Media resolution 페이지는 Gemini 3의 해상도 예산을 설명한다. 선택된 gemini-3.8-flash에 두 설명을 연결하는 적용 계약을 확인하지 못했다. 따라서 두 규칙을 하나의 계산식으로 합치지 않으며 정확한 B,C,비용과 크기별 경계는 증거 공백이다.

Inline image data를 포함한 요청 총 크기 상한은 텍스트와 지시문을 포함해 20MB이며 큰 파일은 Files API 경로를 문서가 권한다 ([이미지 이해 입력 제한과 형식](https://ai.google.dev/gemini-api/docs/image-understanding)). 지원 형식은 PNG, JPEG, WEBP, HEIC, HEIF이고 요청당 최대 파일 수는 3,600으로 기재되어 있다. 이는 이미지 비용 공식이 아니다.

출처: [Gemini 3.8 Flash 모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) — 안정 ID, 컨텍스트, 최신 업데이트 날짜. [Media resolution](https://ai.google.dev/gemini-api/docs/media-resolution) — Gemini 3 설정과 근사 예산. [가격](https://ai.google.dev/gemini-api/docs/pricing) — 표준 입력·출력 단가와 날짜 경계. [이미지 이해](https://ai.google.dev/gemini-api/docs/image-understanding) — 입력 제한, 형식, 별도 crop/token 설명.

## 추가 회계 계열 대조 모델 (파일럿 선택 아님)

다음 두 모델은 기존 OpenAI GPT-4o, Anthropic Haiku 4.5 및 Google Gemini 3.8 Flash 파일럿 후보를 대체하지 않는다. 각자 다른 공개 회계 계열을 보여주는 대조 사례다: OpenAI 32px patch 처리와 Anthropic high-resolution tier를 현재 후보와 나란히 둔다. 이 비교는 모델 품질 순위나 공급자 전체의 비용 결론이 아니다.

| 역할 | 모델 ID / 스냅샷 근거 | API 및 모든 이미지 설정 | 표준 유료 단가 / 컨텍스트 | 계열 선택과 재현성 |
|---|---|---|---|---|
| 회계 계열 대조 전용 | OpenAI gpt-5.6-sol. 모델 페이지의 현재 ID이며 날짜 suffix snapshot은 제시되지 않아 날짜 고정 재현성 제한을 남긴다. | Responses/Chat Completions detail: low, high, original, auto; 생략은 auto. OpenAI 표는 auto를 original과 같은 sizing으로 명시한다. | 입력 $4/MTok, 출력 $20/MTok, 1,050,000 context. 본문 전체 입력이 272K 이하인 가격 구간으로 이미지 비용을 계산하며 초과하면 해당 요청의 입력은 2배, 출력은 1.5배 단가다. 입력 가격은 최소 2026-11-21까지의 프로모션으로 표기됨. | 타일 방식 GPT-4o와 구별되는 32×32 patch 방식과 detail별 budget을 비교한다. |
| 회계 계열 대조 전용 | Anthropic claude-sonnet-5-5. 날짜 없는 4.6 이후 canonical ID는 고정 snapshot이라고 공식 버전 문서가 설명한다. | Messages API; detail/resolution 입력 옵션 없음. 모델 tier에 따른 자동 resizing. | 입력 $2/MTok, 출력 $10/MTok, 1M context. | Haiku 4.5 standard tier와 대비되는 high-resolution tier의 크기·visual-token 한도를 비교한다. |

### Anthropic Sonnet 5.5: high-resolution patch tier

Sonnet 5.5 모델 페이지는 현재 Messages API ID, 1M context, 가격과 active 상태를 밝힌다 ([Sonnet 5.5 모델 개요](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)). 공식 버전 문서는 날짜 없는 4.6 이후 ID가 고정 snapshot이라고 설명한다 ([모델 ID와 버전](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)). Vision 안내서는 Claude 4.7 및 이후 모델에 긴 변 2576px, 최대 4784 visual tokens를 적용한다고 규정한다 ([Vision](https://platform.claude.com/docs/en/build-with-claude/vision)). 이 선택 모델은 그 high-resolution accounting family의 tier 대조다. 28×28 patch 회계식은 ceil(width/28)×ceil(height/28)이다. 적용 가능 여부는 각 축을 다음 28px 배수로 올린 padded edge가 2576px 이하이고 토큰 수가 4784 이하인지로 판단한다. 공식 helper는 종횡비를 보존해 가장 큰 적합 크기를 이진 탐색하며, 정수 보조 축에 Python round(half-even)를 사용한다. 작은 이미지는 확대하지 않는다. helper 반환값은 패딩 전 content dimensions이며 아래 padded dimensions는 토큰식과 edge 검사에 쓰인다 ([좌표와 경계 상자 helper](https://platform.claude.com/docs/en/build-with-claude/vision-coordinates)).

| 설정 | 동작 | 초과 원본 처리 |
|---|---|---|
| transformations 생략 | 기본 downsize; 모델 tier에 맞춰 자동 축소 | 2576 padded-edge 또는 4784-token 한도에 맞게 처리 |
| oversized_image=downsize | 기본과 같은 resize 동작 | downsize |
| oversized_image=error | resizing이 필요한 원본이면 요청 거부 | 거부된 원본 B는 계산 불가; 한도 안의 변환 이미지는 C 계산 가능 |

| 역할 / 모델 / 설정 | 원본 regime 및 치수 | client 결과 | provider 처리 원본: content → padded | B 토큰 계산 | provider 처리 변환: content → padded | C 토큰 계산 | Δ / 절감률 | 추정 입력비용 / 1,000장 |
|---|---|---|---|---:|---|---:|---:|---:|
| 대조 / Sonnet 5.5 / 기본 downsize | L≤1536, 1120×560 | 1120×560 (no-op) | 1120×560 → 1120×560 | 40×20=800 | 1120×560 → 1120×560 | 40×20=800 | 0 / 0% | $1.600 → $1.600 |
| 대조 / Sonnet 5.5 / 기본 downsize | 1536<L≤2576, 1920×1080 | 1536×864 | 1920×1080 → 1932×1092 | 69×39=2691 | 1536×864 → 1540×868 | 55×31=1705 | 986 / 36.64% | $5.382 → $3.410 |
| 대조 / Sonnet 5.5 / 기본 downsize | 1536<L≤2576 (상한 경계), 2576×1449 | 1536×864 | 2576×1449 → 2576×1456 | 92×52=4784 | 1536×864 → 1540×868 | 55×31=1705 | 3079 / 64.36% | $9.568 → $3.410 |
| 대조 / Sonnet 5.5 / 기본 downsize | L>2576, 3840×2160 | 1536×864 | 2576×1449 → 2576×1456 | 92×52=4784 | 1536×864 → 1540×868 | 55×31=1705 | 3079 / 64.36% | $9.568 → $3.410 |
| 대조 / Sonnet 5.5 / 기본 downsize | L>2576 (4:3), 4096×3072 | 1536×1152 | 2212×1659 → 2212×1680 | 79×60=4740 | 1536×1152 → 1540×1176 | 55×42=2310 | 2430 / 51.27% | $9.480 → $4.620 |
| 대조 / Sonnet 5.5 / error | L≤1536, 1120×560 | 1120×560 (no-op) | 1120×560 → 1120×560 | 40×20=800 | 1120×560 → 1120×560 | 40×20=800 | 0 / 0% | $1.600 → $1.600 |
| 대조 / Sonnet 5.5 / error | 1536<L≤2576, 1920×1080 | 1536×864 | 1920×1080 → 1932×1092 | 69×39=2691 | 1536×864 → 1540×868 | 55×31=1705 | 986 / 36.64% | $5.382 → $3.410 |
| 대조 / Sonnet 5.5 / error | L>2576, 3840×2160 | 1536×864 | 원본 요청 거부 | 미정의 | 1536×864 → 1540×868 | 55×31=1705 | B 미정의, 절감률 없음 | C $3.410; 비교 불가 |

Haiku 4.5의 standard tier와 비교할 때 같은 1920×1080 원본은 standard provider 처리 후 1456×819 → padded 1456×840 → 52×30=1560 tokens다. 1536×864 client 결과도 standard provider에서 1456×819로 축소되어 B=C=1560, Δ=0이다. 같은 3840×2160 입력 역시 standard provider 결과 1456×819, B=C=1560이다. 따라서 두 tier 모두에 하나의 resize 결론을 적용하지 않는다. High-resolution tier 예제는 더 많은 visual tokens를 쓰지만 client 변환 뒤 계산상 token 차이가 난다. 이는 입력 규칙 산술 비교이며 모델 성능, 인식 품질 또는 실청구의 동등성은 보장하지 않는다.

### OpenAI GPT-5.6 Sol: 32px patch 회계

GPT-5.6 Sol 모델 페이지는 현재 ID, 단가, 1,050,000 context와 가격 조건을 제공한다 ([GPT-5.6 Sol 모델 개요](https://developers.openai.com/api/docs/models/gpt-5.6-sol)). 공식 이미지 안내는 32×32 patch count에 multiplier 1.2를 적용해 ceil(patch_count×1.2)를 이미지 입력 추정치로 계산한다고 설명한다 ([이미지와 비전](https://developers.openai.com/api/docs/guides/images-vision)). 먼저 설정별 dimension limit 안에 종횡비를 유지해 맞춘다. high는 2048×2048 dimension limit을 적용한다. 축소 후 patch count가 2500을 초과할 때만 w,h(이미 2048 limit 안의 치수)에 대해 s=sqrt(32²×2500/(w×h)), a=s×min(floor(w×s/32)/(w×s/32), floor(h×s/32)/(h×s/32))를 계산하고 최종 치수를 (floor(w×a), floor(h×a))로 만든다. 예를 들어 4096×4096은 먼저 2048×2048이 되어 4096 patches이고 공식식에서 s=0.78125, a=0.78125가 되어 1600×1600/2500 patches까지 줄어든다. low는 최대 512×512다. original은 원본 치수를 유지하되 어느 축이든 65,535px를 넘으면 그 한도에 맞춘다. 이후 patch count가 30,000을 넘으면 거부하며 이 rejection limit에 맞춰 재축소하지 않는다. auto는 original과 같은 sizing이고 detail 생략은 auto다. 고정 토큰 예외는 확인되지 않았다.

| detail 요청 | 공식 동작 |
|---|---|
| low | 최대 512×512 범위로 맞춤; 32px patches ×1.2, 올림 |
| high | 2048×2048 dimension limit와 2500-patch resize budget 적용; patch 수 ×1.2, 올림 |
| original | 65,535px 축 상한 외 원본 유지; 처리 뒤 30,000 patches 초과 시 거부 |
| auto | original과 동일한 sizing |
| 생략 | 기본 auto, 따라서 original sizing |

| 역할 / 모델 / 설정 | 원본 regime 및 치수 | client 결과 | provider 처리 원본 치수 / patches | B 토큰 계산 | provider 처리 변환 치수 / patches | C 토큰 계산 | Δ / 절감률 | 추정 입력비용 / 1,000장 |
|---|---|---|---|---:|---|---:|---:|---:|
| 대조 / GPT-5.6 Sol / low | client L≤1536; provider 원본 256×256은 512px cap 이하 | 256×256 (no-op) | 256×256 / 64 | ceil(64×1.2)=77 | 256×256 / 64 | ceil(64×1.2)=77 | 0 / 0% | $0.308 → $0.308 |
| 대조 / GPT-5.6 Sol / low | client L≤1536; provider 1024×1024가 512px cap 초과 | 1024×1024 (no-op) | 512×512 / 256 | ceil(256×1.2)=308 | 512×512 / 256 | ceil(256×1.2)=308 | 0 / 0% | $1.232 → $1.232 |
| 대조 / GPT-5.6 Sol / low | client L>1536; 원본 1600×1600은 provider 512px cap 초과 | 1536×1536 | 512×512 / 256 | ceil(256×1.2)=308 | 512×512 / 256 | ceil(256×1.2)=308 | 0 / 0% | $1.232 → $1.232 |
| 대조 / GPT-5.6 Sol / low | client L>1536; 원본 4096×4096은 provider 512px cap 초과 | 1536×1536 | 512×512 / 256 | ceil(256×1.2)=308 | 512×512 / 256 | ceil(256×1.2)=308 | 0 / 0% | $1.232 → $1.232 |
| 대조 / GPT-5.6 Sol / high | client L≤1536; 원본은 2048 dimension 및 2500 patch cap 이하 | 1024×1024 (no-op) | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 0 / 0% | $4.916 → $4.916 |
| 대조 / GPT-5.6 Sol / high | client 1536<L≤2048; 1600×1600은 2500 patch budget 경계 | 1536×1536 | 1600×1600 / 2500 | ceil(2500×1.2)=3000 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 235 / 7.83% | $12.000 → $11.060 |
| 대조 / GPT-5.6 Sol / high | client L>2048; 4096×4096은 2048 dimension cap 및 2500 patch budget 초과 | 1536×1536 | 1600×1600 / 2500 after both limits | ceil(2500×1.2)=3000 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 235 / 7.83% | $12.000 → $11.060 |
| 대조 / GPT-5.6 Sol / original | provider 원본 1024×1024, 1,024 patches (<30,000; edge≤65,535) | 1024×1024 (no-op) | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 0 / 0% | $4.916 → $4.916 |
| 대조 / GPT-5.6 Sol / original | provider 원본 2048×2048, 4,096 patches (<30,000; edge≤65,535) | 1536×1536 | 2048×2048 / 4096 | ceil(4096×1.2)=4916 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 2151 / 43.76% | $19.664 → $11.060 |
| 대조 / GPT-5.6 Sol / original | provider 원본 4096×4096, 16,384 patches (<30,000; edge≤65,535) | 1536×1536 | 4096×4096 / 16384 | ceil(16384×1.2)=19661 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 16896 / 85.94% | $78.644 → $11.060 |
| 대조 / GPT-5.6 Sol / original | 원본 L>1536; provider 원본 8192×8192, edge 8192≤65,535; 65,536 patches>30,000 rejection | 1536×1536 | 원본 rejection / 65,536 patches | 미정의 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | B 미정의, 절감률 없음 | C $11.060; 비교 불가 |
| 대조 / GPT-5.6 Sol / auto | 원본과 같은 sizing; 1024×1024, 1,024 patches | 1024×1024 (no-op) | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 0 / 0% | $4.916 → $4.916 |
| 대조 / GPT-5.6 Sol / auto | 원본과 같은 sizing; 2048×2048, 4,096 patches | 1536×1536 | 2048×2048 / 4096 | ceil(4096×1.2)=4916 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 2151 / 43.76% | $19.664 → $11.060 |
| 대조 / GPT-5.6 Sol / auto | 원본과 같은 sizing; 4096×4096, 16,384 patches | 1536×1536 | 4096×4096 / 16384 | ceil(16384×1.2)=19661 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 16896 / 85.94% | $78.644 → $11.060 |
| 대조 / GPT-5.6 Sol / auto | 원본과 같은 sizing; L>1536, edge 8192≤65,535, 65,536 patches>30,000으로 거부 | 1536×1536 | rejection / 65,536 patches | 미정의 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | B 미정의; 비교 불가 | C $11.060 |
| 대조 / GPT-5.6 Sol / 생략 | 기본 auto; 1024×1024, 1,024 patches | 1024×1024 (no-op) | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 1024×1024 / 1024 | ceil(1024×1.2)=1229 | 0 / 0% | $4.916 → $4.916 |
| 대조 / GPT-5.6 Sol / 생략 | 기본 auto; 2048×2048, 4,096 patches | 1536×1536 | 2048×2048 / 4096 | ceil(4096×1.2)=4916 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 2151 / 43.76% | $19.664 → $11.060 |
| 대조 / GPT-5.6 Sol / 생략 | 기본 auto; 4096×4096, 16,384 patches | 1536×1536 | 4096×4096 / 16384 | ceil(16384×1.2)=19661 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | 16896 / 85.94% | $78.644 → $11.060 |
| 대조 / GPT-5.6 Sol / 생략 | 기본 auto; L>1536, edge 8192≤65,535, 65,536 patches>30,000으로 거부 | 1536×1536 | rejection / 65,536 patches | 미정의 | 1536×1536 / 2304 | ceil(2304×1.2)=2765 | B 미정의; 비교 불가 | C $11.060 |

low의 provider 경계는 최대 512×512다. client의 no-upscale 경계는 1536px이므로 1536<L≤512인 중간 구간은 공집합이다. high는 2048×2048 dimension cap 뒤의 w,h에 대해 s=sqrt(32²×2500/(w×h)), a=s×min(floor(w×s/32)/(w×s/32), floor(h×s/32)/(h×s/32))로 scale factor를 보정하고 최종 치수를 (floor(w×a), floor(h×a))로 만든다. 따라서 4096×4096은 먼저 2048×2048/4096 patches가 되고 공식식으로 1600×1600/2500 patches가 된다. original, auto, 생략은 65,535px/side edge cap과 별도의 30,000-patch 초과 rejection을 따르며, 거부 경계에 맞춰 재축소하지 않는다. 모든 가격은 model page의 uncached standard input rate를 각 이미지 추정 토큰에 적용한 1,000개 개별 요청 산술 합계다. 각 요청은 전체 input 272K 이하라고 가정한다. 272K를 넘는 단일 요청은 그 요청 입력 2배 및 출력 1.5배 단가가 적용된다.


## JPEG q75와 비용 해석

| 후보 | JPEG 품질 토큰 분류 | 공식 회계 근거 | 인코딩 바이트 |
|---|---|---|---|
| OpenAI GPT-4o | 토큰 영향 없음(공식에 quality 없음) | GPT-4o tile 회계는 설정과 처리 치수로 계산하며 quality 변수가 없음. | 변화 미측정 |
| OpenAI GPT-5.6 Sol | 토큰 영향 없음(공식에 quality 없음) | 32×32 patch 회계와 multiplier는 처리 치수로 계산하며 JPEG quality 변수가 없음. | 변화 미측정 |
| Anthropic Haiku 4.5 | 토큰 영향 없음(공식에 quality 없음) | 28×28 토큰식은 이미지 치수로 계산하며 quality 변수가 없음. | 변화 미측정 |
| Anthropic Sonnet 5.5 | 토큰 영향 없음(공식에 quality 없음) | high-resolution 28×28 patch 회계는 이미지 치수로 계산하며 quality 변수가 없음. | 변화 미측정 |
| Google Gemini 3.8 Flash | 미문서화 | 근사 예산 문서는 JPEG quality가 실제 소비 토큰에 미치는 영향을 규정하지 않음. | 변화 미측정 |

Anthropic Vision 공식 안내는 lossy JPEG/WebP가 전송 바이트와 지연을 줄일 수 있지만 압축 artifact가 모델에 영향을 줄 수 있고, 강한 JPEG 압축은 작은 글자를 읽기 어렵게 할 수 있다고 설명한다 ([이미지 압축 안내](https://platform.claude.com/docs/en/build-with-claude/vision)). 이는 이 문서의 인코딩별 측정 결과가 아니다.

바이트 결과를 토큰 결과와 분리한다. 본문은 압축률, 실제 usage 값, 청구, 화질 동등성 또는 지연 개선을 주장하지 않는다. GPT-4o low의 크기 무관 고정 85토큰과 Haiku 4.5 standard의 이미 적용된 patch cap 사례는 1536px 리사이즈가 비용을 낮추지 않는 계산 반례다. 대조 Sonnet 5.5 high-resolution 사진 사례와 GPT-5.6 Sol patch 사례는 별도 accounting family의 차이를 보여줄 뿐 품질이나 실제 청구 절감을 보증하지 않는다. Gemini의 근사 예산은 실제 크기별 절감 판단을 허용하지 않는다.

## 후속 실측 체크리스트

사용자 승인 시 다음 단계의 별도 실험에서 같은 이미지를 원본/1536 변환 및 원본/q75 조건으로 모델·설정별 비교한다. 요청 설정, 치수, 바이트, 사용량 응답, 거부 여부, 청구 단위, 지연시간, 태스크별 품질 기준을 기록한다. 공식 추정, count-tokens, API usage와 실제 청구를 별개 결과로 보고한다. 이번 문서 작업에서는 API 호출을 하지 않았다.
