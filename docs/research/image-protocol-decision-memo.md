# 이미지 프로토콜 결정 메모 (Task 30)

> **상태: 결정 보조 자료.** 이 메모는 D1–D4의 값을 확정하지 않는다. 선택지, 영향, 의존, 조건부 연산 집계만 정리한다. 프로토콜 개정은 사용자가 값을 고른 뒤 별도 Task에서 한다. F-12, 파일럿 모델, 첫 구현 연산 순서는 여기서 정하지 않는다. 이 메모의 모든 개수는 명시한 집합에서 손으로 도출한 문서상 산술이며 실측이 아니다.

## 0. 한 화면 요약

| 항목 | 내용 |
| --- | --- |
| 결정 항목 | D1 clean format/channels(1필드, 선택지 4), D2 stress recipe(7필드), D3 후보 preset의 arm 배정(5필드), D4 downscale-only 출력(4필드: format, channels, JPEG quality, JPEG 프로필). 합계 17필드이며 모두 §11 결정 표에 있다 |
| 구조 축(연산 필요 집합을 바꾸는 축) | 형식 사례 11개(F1–F9. D1 4 × D4 4의 명목 16에서 variant format이 같은 5개를 병합, §6.2). clean 생성 K 2개(K-y × D1-c는 모순으로 제외). arm recipe 구성 3×2×2×2 = 24. 모든 조합은 §6.4와 §6.5의 합성 표로 다루며 조합마다 따로 풀지 않았다 |
| 조합 개수의 성격 | 명목 구조 곱은 (11×2 − 2) × 24 = 480이다. 이는 축의 곱일 뿐 의미상 서로 다른 출력이나 분류의 수가 아니다. 실제로 구별되는 분류의 수는 전수 열거하지 않았다 [검증 필요]. 이 메모는 distinct 분류 수를 제시하지 않으며, 그 수를 요구하는 기준은 명목 인수분해로만 부분 충족한다 |
| overlay 축(정확 preset·identity 해석만 바꿈) | 목표 치수 패턴 4 × quality 패턴 4 = **16**. JPEG 프로필(계약 안/밖. D2.2, D2.6, D4.4)과 DO의 JPEG quality(D4.3, Qd)는 별도 overlay. 목표 치수 패턴은 stress 목표를 긴 변 상한으로 읽는 제안 가정(A-cap, §3.0 G3) 위에 있다 |
| Task 29 §3.1 미정 칸 | 21개(U01–U21). D1–D4로 해소 12, 부분 해소 7, D1–D4로 해소 불가 2 (§5) |
| D1–D4 밖 잔여 결정 | 10개(X1–X10, §10) |
| 조합과 무관하게 성립하는 도출 | 조건 준비에서 일반 resize는 downscale-only·combined 2개 조건에, 일반 JPEG encode는 JPEG-only·combined 2개 조건에 항상 필수다. RGB PNG crop 단계(O1. PNG 출력 encode는 O9와 O10으로 따로 센다)는 조건 준비에서 항상 불필요하고, arm 단위 집계에서 필수가 되는 조합은 없다 (§6.6). JO와 CB의 variant는 항상 JPEG이므로 B × JO, B × CB 셀에서는 전 조합·전 b에서 JPEG decode 능력이 필수다(귀속 행은 X1에 따라 O3 또는 O4이므로 개별 행은 미정이다). E × JO, E × CB 셀에서는 O3이 필수다. E의 O3은 arm 단위 병합에서 F6 외 「조건부」로 표시된다. B의 O3/O4 귀속 미정과 decode 능력의 필요는 구별한다 (§6.5, §6.6) |
| 승인 전 권고 | D1(조건부), D2 프로필, D4 format에만 있다. 수치(quality, 목표 치수)와 D3 전 필드는 "권고 없음(근거 부족)"이다 (§9) |

## 1. 범위·근거·표기

- 인용 행 번호는 base `67478ffc1fbcd2fce7f8cf31a265f5b2bad12e3c`의 1-based 행이다. 작성자는 controller가 전달한 발췌만 읽었고 명령·실험·encoder·외부 조사·hosted 호출·count-tokens를 실행하지 않았다.
- 표기
  - **[사실]**: 원문에 명시된 내용.
  - **[도출]**: 원문과 선택지 정의에서 조건부로 도출한 내용.
  - **[검증 필요]**: 현재 근거로 확정할 수 없는 내용.
  - **[사용자 결정 필요]**: 값이 비어 있는 결정.
  - **승인 전 권고**: 사용자 승인 전의 제안. 결정이 아니다.
- 조건 약어: CL = clean, JO = JPEG-only, DO = downscale-only, CB = combined.
- **§3–§7의 성격.** §2는 원문의 명시와 부재를 다룬다. §3–§7의 선택지, 선택지 이름, 영향 셀, 조합 ID, 분류, 집계, 대비 해석은 따로 표기하지 않아도 모두 [도출]이거나 이 메모가 제안한 틀이며 원문 사실이 아니다. 그 안의 원문 사실은 [사실] 표기나 행 번호 인용으로 구별한다. 셀마다 표기를 되풀이하지 않는다.

| 약칭 | 문서와 인용 절 |
| --- | --- |
| [프로토콜](./image-first-evaluation-protocol.md) | §2 「source family와 split」 L24–51, §3 「변환과 arm」 L53–89, §4 「selection과 guard 경계」 L91–104, §5 「계획된 호출 수와 분모」 L106–119, §6 「관측값과 기록」 L121–141, §7 「분석 계획」 L143–175, §8 「blinding과 품질 gate」 L177–192, §9 「재현성과 중지 조건」 L194–203, §10 「Paper–plugin 병렬 개발 로드맵」 L205–233 |
| [논문](./image-first-paper-draft.ko.md) | 초록 L3–14, §3.1 「입력과 후보」 L54–67, §3.2 「증거 guard와 fallback」 L69–83, §3.3 「비용과 관측」 L85–111, §4 「계획된 평가」 L113–140, §5 「결과는 아직 측정되지 않음」 L142–148, §6 「논의와 한계」 L150–171 |
| [Task 29 분석](./image-transform-provenance-gap.md) | §1 「현재 상태 표」 L22–44, §3.1 「후보 연산과 프로토콜 입력 조건·arm의 대응」 L73–90, §3.2 「후보 비교」 L92–121, §4.2 「전체 영역 crop (세 가지 선택지)」 L136–149, §8 「미래 구현 진입 gate」 L242–252 |
| [Task 29 핸드오프](../agent/handoffs/task-29.md) | §9 「남은 작업」 중 「Task 29 범위 밖 — 다음 Task 후보」 L157–166 |
| [입력 계약](../image-artifacts.md) | 「Supported input」 L7–70, 「MCP use」 필드 표 L99–108, 「Research boundary」 L163–172 |
| [JPEG feasibility](./jpeg-codec-feasibility.md) | 「관찰 근거」 L5–28, 「해석과 제한」 L30–38 |
| [JPEG runtime](./jpeg-runtime-validation.md) | 「Source checks」 L6–28, 「Resource measurement」 L55–74, 「Precommit review and verification (2026-09-27)」 L84–88 |
| [토큰·비용](./image-token-cost-models.md) | 「요약」 L5–11, 「정의, 범위와 제외 항목」 L13–19, 「JPEG q75와 비용 해석」 L181–193, 「후속 실측 체크리스트」 L195–197 |

## 2. 항목별 사실과 부재

### 2.1 D1 — clean canonical 원본의 format과 channels

| 구분 | 내용 |
| --- | --- |
| [사실] 명시 | [프로토콜](./image-first-evaluation-protocol.md) §2 L42는 조건 이름을 "clean canonical 원본"으로만 적는다. L31–32는 합성 artifact에 canonical clean ground truth를 보관한다고 한다. [논문](./image-first-paper-draft.ko.md) §3.1 L57–58은 clean 조건에서 배정된 clean pixels를 쓴다고 한다 |
| [사실] 미명시 | 프로토콜 §2와 논문 §3.1·§4 어디에도 clean의 format, channels, bit depth 문장이 없다. [Task 29 분석](./image-transform-provenance-gap.md) §3.1 L79, L87도 [검증 필요]로 둔다 |
| [사실] 현행 수용 범위 | [입력 계약](../image-artifacts.md) 「Supported input」 L9–14는 8-bit RGB 또는 RGBA PNG를, L42–47은 제한 baseline 4:4:4 JFIF JPEG를 받는다. 필드 표 L107은 PNG channels 3 또는 4, JPEG 3이다 |
| 오독 방지 | 프로필 이름 `png-rgb8-static-v1`은 RGB와 RGBA에 공통이다([Task 29 분석](./image-transform-provenance-gap.md) §1 L39). 이름의 rgb8은 RGBA 배제를 뜻하지 않는다. 구분은 `channels`로만 한다 |
| 경계 | [프로토콜](./image-first-evaluation-protocol.md) §3 L55의 "PNG canonical"은 후보 preset 이름이다. clean이 PNG라는 선언이 아니다. 입력 계약 L3–5의 "owned or synthetic canonical fixtures"는 계약의 용도 설명이며 clean format 지정이 아니다 |

### 2.2 D2 — JPEG-only·combined의 quality/JPEG 프로필, downscale 목표 치수

| 구분 | 내용 |
| --- | --- |
| [사실] 명시 | [프로토콜](./image-first-evaluation-protocol.md) §2 L43: JPEG-only는 "사전 계획된 재인코딩만 적용". L44: downscale-only는 "긴 변을 줄이되 확대하지 않음". L45, L48–49: combined는 downscale 후 JPEG. [논문](./image-first-paper-draft.ko.md) §4 L128은 네 조건 이름만 든다 |
| [사실] 미명시 | 어느 조건에도 quality 수치, JPEG 프로필, 목표 치수가 없다. 조건 사이에 같은 값을 쓰는지도 없다([Task 29 분석](./image-transform-provenance-gap.md) §3.1 L81–82, L85–86) |
| 병기할 문구 1 | 프로토콜 §2 L48–49는 stress 문맥에서 "긴 변이 이미 preset 이하이면 identity resize가 될 수 있다"고 쓴다. 여기의 "preset"이 §3의 후보 1536을 가리키는지는 문장만으로 정해지지 않는다 |
| 병기할 문구 2 | 프로토콜 §3 L55–57은 1536/q75를 "calibration 후보값"이라 하고, 후보 preset과 입력 stress recipe를 manifest에서 구분한다고 한다 |
| 병기할 문구 3 | 논문 §3.1 L63–65는 **후보** 문맥에서 "조합된 변환은 downscale을 먼저 적용한 뒤 JPEG", "원본이 이미 preset 이하이면 identity resize"라고 쓴다 |
| 해석 한계 | 세 문구는 stress 값이 후보값과 같다는 선언이 아니다. 긴장이 없다고 단정할 근거도 없다. D2에서 사용자가 정해야 한다 |
| [도출] | JO와 CB의 variant가 JPEG로 encode되어 있다는 점은 미정이 아니다([Task 29 분석](./image-transform-provenance-gap.md) §3.1 L86). 미정은 quality, 정확한 프로필, 현행 ingest 프로필 통과 여부다 |

D2의 하위 필드는 일곱 개다. 사용자 D2 문구와 Task 29 분석 L81(downscale-only 목표 치수)을 연결한 범위 명확화이며 새 값을 넣지 않았다. [Task 29 핸드오프](../agent/handoffs/task-29.md) L162는 "JPEG-only·combined ... downscale 목표 치수"로 적어 downscale-only 목표를 따로 들지 않는다. 이 메모는 현재 지시에 따라 D2.3으로 포함했다.

| 필드 | 내용 |
| --- | --- |
| D2.1 | JO quality |
| D2.2 | JO JPEG 프로필 |
| D2.3 | DO 목표 치수 |
| D2.4 | CB 목표 치수 |
| D2.5 | CB quality |
| D2.6 | CB JPEG 프로필 |
| D2.7 | 조건 사이 동일값 여부와 후보값과의 관계 |

### 2.3 D3 — 후보 preset(PNG canonical, 1536, q75)을 실제로 쓰는 arm

| 구분 | 내용 |
| --- | --- |
| [사실] 명시 | [프로토콜](./image-first-evaluation-protocol.md) §3 L55–57은 세 후보 preset을 열거하고 "optimizer가 비교할 후보"라고 한다. L66–72의 arm 표는 A full original, B naive resize/compression, C query-aware selection, D 동일 selection + guard + fallback, E oracle이다. L63–64는 full original과 fallback이 배정된 source variant라고 한다. L80–82는 B와 C가 "가능한 한 같은 output transform 설정"을 쓴다고 한다. L74–75는 oracle crop을 배정된 동일 variant에서 만든다고 한다 |
| [사실] 1536+q75 조합 | 조합 **순서**(downscale 후 JPEG)는 논문 §3.1 L63–65(후보 문맥)와 프로토콜 §2 L45, L48–49(조건 문맥)에 명시된다 |
| [사실] 미명시 | B가 resize와 compression을 둘 다 쓰는지 하나만 쓰는지 없다. 1536+q75 조합이 후보 집합의 독립 항목인지 없다. C/D가 slot마다 후보 중 무엇을 고르는지 없다. E가 crop 뒤에 preset 변환을 거치는지 없다. PNG canonical을 어느 arm 출력에 쓰는지, clean 생성에 쓰는지 없다([Task 29 분석](./image-transform-provenance-gap.md) §3.1 L81–83) |
| 구별 | "후보 집합에 포함됨"과 "실제 slot에서 선택됨"은 다르다. 후자는 selector 규칙과 실행에 달려 있고 이 메모가 정하지 않는다(X3) |

### 2.4 D4 — downscale-only 조건의 출력 format

| 구분 | 내용 |
| --- | --- |
| [사실] 명시 | [프로토콜](./image-first-evaluation-protocol.md) §2 L44는 긴 변 축소와 확대 금지만 적는다. L49–50은 각 slot이 effective transform, 치수, 파일 크기, format, quality를 기록한다고 한다 |
| [사실] 미명시 | 출력 format, channels, alpha 처리, JPEG로 쓸 경우의 quality가 없다([Task 29 분석](./image-transform-provenance-gap.md) §3.1 L79–83, L87) |

## 3. 선택지와 영향

### 3.0 공통 규칙 (각 표의 셀이 참조)

- **G1 ingest.**
  - [사실] 현행 계약이 받는 것은 `png-rgb8-static-v1`과 `jpeg-ycbcr8-baseline-444-v1` 두 프로필뿐이다. 상한은 encoded 10 MiB, 축 8,192, 16,777,216 pixel이고 JPEG에는 128 MiB decoder accounting 상한이 더 있다([입력 계약](../image-artifacts.md) L9–28, L42–50).
  - [도출] 긴 변 1536 출력은 축 상한 안이다. 최대 1536×1536 = 2,359,296 pixel로 pixel 상한 안이다(산술). encoded 크기는 측정된 적이 없다 [검증 필요].
  - [제안 전제] 이 메모는 arm 변환이 받는 clean과 stress variant가 현행 plugin ingest를 통과해야 한다고 전제한다. 이는 구현 범위의 전제이며 프로토콜이 명시한 요구가 아니다. 프로토콜은 모든 variant를 현행 plugin으로 사전 검증한다고 말하지 않는다.
  - [도출] JPEG accounting 상한은 치수로 정해지며 JPEG variant 전부에 적용된다. 식은 `960*B + 6*width*height + 256*Q + sum(16 + DHT symbol count)`, B = ceil(width/8) × ceil(height/8)이고 상한은 134,217,728 bytes다([입력 계약](../image-artifacts.md) L65–70, [JPEG runtime](./jpeg-runtime-validation.md) L18–28, L71). 1536×1536이면 table 항을 뺀 값이 960×36,864 + 6×2,359,296 = 49,545,216으로 상한보다 작다(산술. table 항은 encoder 출력에 달려 [검증 필요]).
  - [도출] JO는 clean 치수를 유지한다. PNG 상한을 통과한 clean도 JPEG로 만들면 이 상한을 넘을 수 있다. 예를 들어 4096×4096(16,777,216 pixel, PNG 상한 안)은 table 항을 빼도 960×262,144 + 6×16,777,216 = 352,321,536으로 상한을 넘는다(산술). 영향 대상은 JO, JPEG로 출력하는 DO·CB, D1-c의 clean이다. DO·CB도 변환 후 치수가 accounting 상한을 충족해야 하며, 축소했더라도 통과가 자동 보장되지는 않는다. 실제 clean 치수는 미상이므로(X10) 해당 여부는 [검증 필요]이다.
  - 입력으로 **수용 가능한 format**이라는 사실과, 이 저장소가 만들 **encoder 출력이 프로필을 통과한다**는 사실은 별개다. 후자는 [검증 필요]이며 [Task 29 분석](./image-transform-provenance-gap.md) §8 L247의 gate 2다.
  - 이 메모가 JPEG encoder 적합성 근거로 검토한 문서는 다음 둘이다. 저장소에는 그 밖에 checked-in 독립 JPEG fixture 기록([입력 계약](../image-artifacts.md) L58–63, [프로토콜](./image-first-evaluation-protocol.md) L226–230)이 있다. 그것은 독립 encoder로 만든 입력 fixture의 provenance이며, 이 저장소가 변환에 쓸 encoder(미정, X9)의 출력 적합성 근거가 아니다.
    - [JPEG feasibility](./jpeg-codec-feasibility.md) 「관찰 근거」 L9, L13, L17–19: System.Drawing으로 만든 8×8 fixture 하나를 jpeg-js 0.4.4 **decoder**가 수락했다. 제한 프로필 validator 통과 기록이 아니다. L38은 표준 전체 적합성 시험이 아니라고 밝힌다.
    - [JPEG runtime](./jpeg-runtime-validation.md) 「Resource measurement」 L57–69: sharp로 만든 2528×2528 flat RGB-128 4:4:4 fixture가 production validator에서 accepted, 2529×2529는 `jpeg_resource_limit`였다. L63–64는 이것이 accounting 경계 확인용이라고 밝힌다.
    - 두 기록 모두 jpeg-js encoder 출력, q75, 임의 콘텐츠, 1536 치수의 통과를 보증하지 않는다. 입력 계약 L52–56의 말미 `FF 00` 관찰도 프로필 전체 적합성 근거로 쓰지 않는다.
- **G2 구현 연산.** 필요 연산은 §6의 두 표를 따른다. 여기 셀에는 그 선택지에서 달라지는 점만 적는다.
- **G3 stress/preset 구분.** 프로토콜 §3 L56–57에 따라 manifest에서 구분한다. 값이 같아도 구분 기록은 유지한다.
  - **[제안 가정 A-cap]** 이 메모는 stress의 목표 치수를 「긴 변 상한 T」(긴 변이 T보다 크면 T로 줄이고 확대하지 않음)로 적는다고 가정한다. 프로토콜 L44는 긴 변을 줄이되 확대하지 않는다고만 적고 목표의 표현 방식을 정하지 않는다. 배율이나 고정 치수 같은 다른 표현을 고르면 Td·Tc와 1536의 비교, §7의 identity 도출을 다시 해야 한다.
  - T 값은 미정인 결정 대상이다. 실제 dataset 치수에 대한 가정이 아니다.
  - A-cap 가정에서 stress 목표가 1536 이하이면(같은 값 포함) DO와 CB에서 §7의 resize 단계 identity가 생긴다.
- **G4 토큰·비용.**
  - [사실] OpenAI와 Anthropic의 공개 회계식은 처리 치수와 설정으로 계산하며 quality 변수가 없다. Gemini는 미문서화다([토큰·비용](./image-token-cost-models.md) L181–193).
  - 1536 축소의 수치는 예제 치수의 산술 추정이다(L7–11, L15–19). stress 목표별이나 crop 치수별로 검증된 효과는 없으며, 예제를 다른 치수로 외삽하지 않는다.
  - 바이트는 토큰·비용과 별개로 기록한다([프로토콜](./image-first-evaluation-protocol.md) §4 L103–104, §6 L133).
  - 실제 usage, 청구, 지연은 미측정이다([토큰·비용](./image-token-cost-models.md) L193, L195–197). 어떤 선택지도 실측 절감을 뜻하지 않는다.
- **G5 논문 서술.** 선택된 값은 [논문](./image-first-paper-draft.ko.md) §3.1(L62–65), §4(L121–128)에 서술을 추가하거나 고쳐야 한다. 개정은 별도 Task다. 결과 문장은 측정 뒤에만 쓴다([논문](./image-first-paper-draft.ko.md) §5 L144–148).
- **G6 분모.** 네 조건, 다섯 arm, 36 family, 질문 1개가 유지되면 계획된 720/576/144는 바뀌지 않는다([프로토콜](./image-first-evaluation-protocol.md) §5 L108–111). failure, timeout, retry, `not_started`, unknown usage 규칙(L113–119)도 그대로다.
- **G7 primary D−C.** C와 D가 같은 selection과 같은 후보·설정을 쓰는 한 D−C는 guard와 fallback의 추가 효과를 보는 대비로 남는다([프로토콜](./image-first-evaluation-protocol.md) §3 L86–88). 입력이 같아질 가능성은 §7에서 따로 본다. 효과 크기와 검정력은 미측정이다(§7 L151–152).

### 3.1 D1 선택지

| 선택지 | (1) ingest | (2) 구현 연산 | (3) stress/preset | (4) 토큰·비용 | (5) 논문 서술 | (6) 분모 | (7) D−C |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **D1-a** 제한 RGB PNG (channels 3) | G1. 현행 PNG 프로필 수용 범위 | CL에서 RGB PNG crop을 직접 쓸 수 있다([Task 29 분석](./image-transform-provenance-gap.md) L79, L104). stress 준비는 PNG decode에서 시작한다 | G3. K-y(§3.3)를 고르면 PNG canonical이 후보 preset이자 clean 생성 수단이 되어 구분 기록이 더 필요하다 | G4. 인용한 회계식에 format 변수 없음. 바이트는 미측정 | G5. clean format 문장 추가. 후보명 "PNG canonical"과 용어 구분 필요 | G6 불변 | G7 불변 |
| **D1-b** 제한 RGBA PNG (channels 4) | G1. 수용 범위. 프로필 이름이 RGB와 같아 `channels`로만 구분([Task 29 분석](./image-transform-provenance-gap.md) L39) | RGB 전용 crop은 RGBA를 거부하는 안이다(L104). RGBA 포함 crop(L99)이 대신 필요하다. JPEG로 가는 모든 경로에 alpha 처리(X6)가 필요하다 | G3 | G4. alpha가 토큰에 주는 영향은 근거 없음 [검증 필요] | G5. alpha 처리 서술 추가 | G6 불변 | G7 불변. alpha 처리 방식이 C와 D에서 같아야 한다 |
| **D1-c** 제한 JPEG | G1. JPEG 프로필 수용 범위와 128 MiB accounting 상한 적용. clean 원천이 프로필을 만족하는지 [검증 필요] | JO, DO, CB의 준비와 pixel을 바꾸는 arm 변환이 JPEG decode에서 시작한다. K-n의 CL, A의 full original, D의 fallback은 원본을 그대로 쓰므로 decode가 없다. CL에 RGB PNG crop을 직접 쓸 수 없다. K-y와 모순(§6.2) | G3. clean 자체에 기존 JPEG 손상이 있다. 프로토콜 §2 L47의 preexisting/introduced 분리 기록 대상이 된다. JO는 재압축이 된다 | G4. quality는 회계식 변수가 아님 | G5. "clean" 의미(기존 encoding 손상 포함)를 서술해야 한다 | G6 불변 | G7 불변. preexisting 손상은 C와 D에 공통이다 |
| **D1-d** family별 원본 format 유지(혼합) | G1. family마다 다름. 현행 수용 범위(RGB PNG, RGBA PNG, 제한 JPEG) 안으로 한정한 선택 제안이다. 실제 corpus가 혼합이라는 사실 주장이 아니다 | §6에서 family format에 따른 조건부 셀이 생긴다. 위 세 선택지의 연산이 모두 필요할 수 있다 | G3. family별로 D1-c의 주의가 일부 적용된다 | G4. format별 바이트 차이는 미측정 | G5. format을 family 속성으로 보고하는 서술이 필요하다 | G6 불변. format별 층을 새 분모로 추가하려면 프로토콜 §5 L113의 사전 기록이 필요하다 | G7 불변(family 안 paired). family 간 format 이질성의 영향은 [검증 필요] |

### 3.2 D2 선택지

상위 선택(D2.7)은 세 가지다. 수치가 저장소 근거에 없는 칸은 [사용자 결정 필요]로 비워 둔다. D2.7은 D2.1, D2.3–D2.5의 값에 대한 제약(배정 정책)이다. D2-a는 네 값을 모두 후보값으로 묶는다. D2-b는 조건 공통(D2.3 = D2.4, D2.1 = D2.5)이면서 하나 이상이 후보값과 다르게 묶는다. D2-c는 조건별 독립 배정 정책이며, 그 결과 값이 D2-a나 D2-b의 패턴과 같아질 수 있다. 목표 치수의 비교는 A-cap 가정(G3) 위에 있다.

| 선택지 | (1) ingest | (2) 구현 연산 | (3) stress/preset | (4) 토큰·비용 | (5) 논문 서술 | (6) 분모 | (7) D−C |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **D2-a** 전 조건이 후보값과 동일 (DO와 CB 목표 = 1536, JO와 CB quality = 75) | G1. 프로필 적합성과 encoded 크기 [검증 필요] | 일반 연산 집합은 다른 선택지와 같다. 정확 preset 행(O6, O8)이 조건 준비에서 필수가 된다(§6.4). stress 준비와 arm이 같은 preset 구현을 공유할 여지가 있다. 같은 encoder 옵션인지는 미정 | G3. 값이 같아도 manifest 구분은 유지한다. §2.2의 L49 문구와 양립한다. DO와 CB에서 arm의 1536 resize 단계가 identity가 된다(§7). 목표가 1536보다 작은 선택지에서도 같으므로 이 선택지만의 성질이 아니다 | G4. 저장소의 산술 예제는 client 정책 1536을 예제 치수에 적용한 것이다. stress 목표별로 검증된 효과는 없으며 예제를 외삽하지 않는다. arm의 1536 resize가 DO와 CB에서 치수를 바꾸지 않으므로 그 셀에서는 치수 기반 산술 차이가 생기지 않는다. 실제 usage는 unknown | G5. 논문 L63–65와 양립. stress 값 문장 추가 | G6 불변 | G7. DO와 CB에서 §7의 입력 동일 가능성이 생긴다. 다른 선택지와의 넓이 순서는 주장하지 않는다 |
| **D2-b** 조건 공통, 후보값과 다름 (목표나 quality 중 하나 이상이 후보와 다름. 수치 [사용자 결정 필요]) | G1. 값 의존 [검증 필요] | 일반 연산 집합 동일. 다른 축은 정확 preset 행이 준비에서 불필요해진다. 임의 목표·quality 지원이 필요하다 | G3. 구분이 값에서도 드러난다. L49의 "preset"이 stress 목표를 가리키는지 후보 1536을 가리키는지 지시 대상만 밝히면 된다. 문구 수정이 필수는 아니다 | G4. 저장소의 산술 예제는 client 정책 1536 기준이다. 다른 목표에 대해 검증된 효과는 없으며 예제를 외삽하지 않는다 [검증 필요] | G5. stress 값의 신규 서술 | G6 불변 | G7. A-cap 가정에서 목표가 1536보다 작으면 arm의 resize 단계는 여전히 identity다. 크면 치수에 달린다(§7) |
| **D2-c** 조건별 독립 recipe (JO, DO, CB가 각자 값. 수치 [사용자 결정 필요]) | G1. 조건별 [검증 필요] | 일반 연산 집합 동일. 준비 recipe를 조건마다 따로 설정한다 | G3. 구분 명확. 관리할 값이 최대 4개(Td, Tc, Qj, Qc)다 | G4. D2-b와 같다 | G5. CB가 JO와 DO의 합성으로 읽히지 않을 수 있다. 조건 간 matched 비교([프로토콜](./image-first-evaluation-protocol.md) §7 L147–148)의 서술 부담이 는다 | G6. 조건 수 4를 유지하면 불변. 한 조건에 수준을 여럿 두면 현 프로토콜 밖이다(§5 L113) | G7. overlay 패턴에 따른다(§7) |

JPEG 프로필(D2.2, D2.6)은 조건마다 다음 둘 중에서 고른다.

| 선택지 | 정확 계약 | 적합성 검증 상태 | 7축 영향 |
| --- | --- | --- | --- |
| **P-in** 현행 제한 ingest 프로필에 맞춤 | [입력 계약](../image-artifacts.md) L42–47: JFIF 1.01 또는 1.02, baseline SOF0, 8-bit YCbCr, 1x1 성분 3개(4:4:4), interleaved sequential Huffman scan 1개, APP0 JFIF 외 metadata 없음. progressive, arithmetic, grayscale, CMYK/YCCK, restart, multiscan, subsampled는 거부 | 생성 encoder의 출력이 이 프로필을 통과하는지 미검증(G1). clean 치수를 유지하는 JPEG variant가 accounting 상한을 통과하는지도 미검증(G1, X10). [검증 필요] | (1) 통과하면 ingest 가능. (2) §6 그대로. (3) G3. (4) G4. (5) 프로필 서술 추가. (6) G6. (7) G7 |
| **P-out** 현행 프로필 밖 (구체 사양 [사용자 결정 필요]) | 현행 계약에 없음. 입력 계약 L20–21은 더 넓은 지원을 이후 계약에 둔다 | 해당 없음(계약 확장이 먼저) | (1) 현행 ingest 불가. (2) JPEG variant를 받는 모든 arm 연산이 계약 확장에 막힌다 [검증 필요]. (3) G3. (4) subsampling 등의 토큰 영향 근거 없음 [검증 필요]. (5) 입력 계약과 다른 프로필 서술 필요. (6) 설계상 불변. ingest 불가 slot을 일괄 incorrect로 세지 않는다. 실행되지 않은 slot은 `not_started`이고, 실제로 시도된 뒤 runtime failure가 난 slot은 incorrect다. ingest 불가가 어느 쪽으로 이어지는지는 프로토콜에 명시되어 있지 않다 [검증 필요] — §8. (7) 실패가 arm 사이에 비대칭이면 해석이 오염된다 [검증 필요] |

### 3.3 D3 선택지

아래 선택지는 프로토콜 문구에서 가능한 읽기를 나란히 놓은 제안이다. 원문이 확정한 사실도, 현행 프로토콜 규칙도 아니다. B-rc, S-same, PC-out, K-y 같은 선택지 이름과 "출력 정규화", "원천 그대로" 같은 표현은 이 메모의 잠정 명칭이다. 모든 선택지는 arm 경계(A full original, C/D 동일 selection, D original fallback, E oracle 격리)를 유지한다. 선택지의 변환은 A와 D의 fallback에 적용되지 않는다.

| 필드 / 선택지 | (1) ingest | (2) 구현 연산 | (3) stress/preset | (4) 토큰·비용 | (5) 논문 서술 | (6) 분모 | (7) D−C |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D3.1 **B-rc**: 1536 downscale 후 q75 JPEG | G1. 출력 JPEG의 프로필 적합성 [검증 필요] | resize, JPEG encode 필요. JPEG variant에는 decode 필요. RGBA에는 alpha 처리(X6) | D2 값이 후보와 같으면 CB variant에 같은 recipe를 다시 적용한다. resize 단계는 identity다. q75 재인코딩은 quality가 같아도 identity 연산이 아니다. 출력이 실제로 달라지는지는 측정되지 않았다 | G4. 치수 기반 산술만 가능 | G5. "naive resize/compression"을 둘 다로 서술 | G6 불변 | B는 D−C에 직접 들어가지 않는다. S-same이면 C/D의 출력 변환이 된다 |
| D3.1 **B-r**: 1536 downscale만 | G1. 출력 format이 X2에 달려 미정 | resize 필요. JPEG variant에는 decode 능력 필요(규칙 수준). 출력 encode 종류는 미정(X2). identity일 때 호출을 생략할지는 X4 | A-cap 가정에서 stress 목표가 1536 이하인 조건에서는 B가 A와 같은 입력이 될 수 있다(§7. 출력 format X2와 no-op 정책 X4에 달림) | G4. 1536 정책의 산술 예제와 같은 종류의 연산이다. 조건별·치수별로 검증된 효과는 없다 | G5. compression을 B에서 빼는 서술 | G6 불변 | S-same이면 resize 단계가 identity인 slot에서 §7의 입력 동일 가능성이 생긴다(X4). 크기 순서는 주장하지 않는다 |
| D3.1 **B-c**: q75 JPEG만 | G1. 출력 JPEG [검증 필요] | JPEG encode 필요. JPEG variant에는 decode 필요. resize 불필요 | quality가 75인 JO/CB variant에도 재압축이 한 번 더 걸린다. quality가 같다는 것은 identity의 근거가 아니다. 출력이 실제로 달라지는지와 손실 크기는 측정되지 않았다 | G4. 치수가 그대로이므로 quality 변수가 없는 인용 회계식(OpenAI, Anthropic)에서는 산술 차이가 0이다. Gemini는 미문서화이고 실제 usage는 미측정이다 | G5. resize를 B에서 빼는 서술 | G6 불변 | S-same이면 C와 D 변환 경로의 출력이 항상 JPEG encode를 거친다(D의 fallback 제외) |
| D3.2 **S-same**: C/D의 출력 변환은 B와 같은 단일 설정. selector는 영역(crop)만 결정 | D3.1을 따름 | C/D의 연산은 B와 같고 crop이 slot에 따라 더해진다 | 후보 preset을 "optimizer가 비교"한다는 L57 표현과 긴장이 있다 [검증 필요] | G4 | G5. selector의 역할을 영역 선택으로 한정하는 서술 | G6 불변 | G7 유지. C−B에서 출력 변환 설정의 차이는 없어진다. 다만 selector가 만드는 다른 차이(crop 수와 영역, crop으로 달라지는 effective transform과 출력 size, 선택·OCR overhead)가 남으면 crop만의 효과로 분리되지 않는다. 그 차이는 L80–82에 따라 함께 보고한다 |
| D3.2 **S-set**: C/D가 이 메모가 제안하는 후보 pool(1536, q75, 1536→q75, PNG canonical 포함 여부는 D3.4a)에서 slot마다 선택. pool 구성은 제안이며 승인되지 않았다. 1536→q75가 독립 후보인지는 프로토콜에 없다(§2.3, X3). 이 메모의 표는 제안 pool 전체를 가정한다 | 선택된 후보를 따름 | 후보 연산이 모두 조건부로 필요하다. crop만 선택된 slot의 출력 format은 X2 | G3. 후보 구성과 실제 선택(X3)을 따로 기록 | G4. slot마다 다름 | G5. 후보 집합과 선택 기록 서술 | G6 불변 | G7 유지(C와 D가 같은 집합·같은 selection일 때). C−B는 출력 변환 차이와 섞이므로 L80–82에 따라 함께 보고한다 |
| D3.3 **E-crop**: oracle crop만 | crop 출력 format이 X2에 달림 | crop 필요. JPEG variant에는 decode→crop | preset을 쓰지 않는다 | G4. crop 결과에 대해 검증된 토큰·비용 효과는 없다. 기존 예제를 외삽하지 않는다 [검증 필요] | G5. E는 진단이라는 서술 유지(L74, L153) | G6 불변(E 144) | D−C와 무관. E는 tuning에 쓰지 않는다 |
| D3.3 **E-same**: oracle crop 뒤 B와 같은 출력 변환 | D3.1을 따름 | crop과 B의 연산 | B와 같은 주의 | G4 | G5. E에 preset이 걸린다는 서술 추가 | G6 불변 | D−C와 무관. E와 C의 출력 변환 설정이 같아진다. 영역 차이만 남는다고 보장하지는 않는다 |
| D3.4a **PC-cand**: PNG canonical은 후보 집합의 구성원으로만 쓰임 | G1. PNG encoder 출력 적합성 [검증 필요]([Task 29 분석](./image-transform-provenance-gap.md) L107–119) | S-set에서만 C/D에 조건부로 필요. S-same에서는 arm에 쓰이지 않는다(프로토콜 L55의 후보 열거와 긴장 [검증 필요]) | G3 | G4. 무손실 재인코딩이라 치수 불변. 바이트 미측정 | G5 | G6 불변 | G7 유지 |
| D3.4a **PC-out**: arm 변환이 새 PNG를 출력할 때마다 적용하는 출력 정규화(잠정 제안). S-set을 고르면 PNG canonical은 제안 pool의 구성원으로도 유지된다. A의 full original과 D의 fallback은 배정된 variant를 그대로 전달하므로 제외 | 위와 같음 | 새 PNG 출력을 만드는 arm 변환 경로에 필요(A와 D의 fallback 제외). PNG 출력이 생기는지는 X2 | G3 | G4 위와 같음 | G5. 출력 정규화 서술 추가 | G6 불변 | G7 유지 |
| D3.4b **K-y**: clean을 PNG canonical 재인코딩으로 생성 | G1. 재인코딩 출력이 프로필을 통과해야 한다 [검증 필요] | CL 준비에 PNG encode 필요. 재인코딩 입력인 원천의 decode도 필요하다. 원천이 제한 PNG가 아니면 그 decoder는 이 메모의 표 밖이다(X7). D1-c와 모순, D1-d에서는 PNG family에만 | 후보 preset과 clean 생성이 같은 이름을 쓴다. 구분 기록 필요. [Task 29 분석](./image-transform-provenance-gap.md) L90의 preset·옵션 통일 문제(X5)와 연결 | G4. 바이트만 변함(미측정) | G5. clean 생성 절차 서술 | G6 불변 | G7 불변 |
| D3.4b **K-n**: 원천 파일을 재인코딩 없이 clean으로 사용 | 원천이 D1의 format과 프로필을 이미 만족해야 한다 [검증 필요] | CL 준비 연산 없음 | G3 | G4 | G5. 원천을 그대로 쓴다는 서술 | G6 불변 | G7 불변 |

### 3.4 D4 선택지

아래 선택지도 제안이며 현행 프로토콜 규칙이 아니다. "입력 format 유지" 같은 명칭은 잠정이다. D4는 D1에 따라 선택지가 겹친다. 유효 선택지 수는 D1-a 2개, D1-b 3개, D1-c 2개, D1-d 4개다(§6.2).

| 선택지 | (1) ingest | (2) 구현 연산 | (3) stress/preset | (4) 토큰·비용 | (5) 논문 서술 | (6) 분모 | (7) D−C |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **D4-a** 제한 PNG 출력 | G1. PNG encoder 출력 적합성 [검증 필요] | resize와 PNG encode. clean이 JPEG면 JPEG decode가 선행한다. channels는 D4.2로 결정 | 이 PNG 출력이 PNG canonical preset과 같은 옵션인지 미정(X5) | G4. 무손실 출력. 바이트 미측정 | G5. DO의 format 서술 | G6 불변 | G7 불변 |
| **D4-b** 입력(clean) format 유지 | clean format을 따름 | clean이 PNG면 D4-a(channels 보존)와 같다. clean이 JPEG면 D4-c와 같다 | 위 각 경우를 따름 | G4 | G5 | G6 불변 | G7 불변 |
| **D4-c** 제한 JPEG 출력 | G1. JPEG encoder 출력 적합성 [검증 필요] | resize와 JPEG encode. quality(D4.3)와 프로필(D4.4)이 새로 필요하다. RGBA면 alpha 처리(X6) | **조건 의미 변경 위험**: 순수 downscale에 재압축 손상이 더해진다. D4.3과 D4.4가 CB와 같고 Td = Tc이면 DO와 CB의 recipe가 같아진다 | G4. quality는 회계식 변수가 아님 | G5. DO가 JPEG 손상을 포함한다는 서술 필요 | G6. 조건 수는 4로 유지되나 두 조건이 같은 recipe가 될 수 있다 [도출] | G7 불변. 조건 간 비교의 해석이 약해진다 |

D4의 하위 필드는 다음과 같다.

- **D4.2 channels** (D4-a에서만 의미): 입력 channels 보존, 또는 RGB로 통일. RGB 통일의 alpha 처리 방식은 미정(X6)이다.
- **D4.3 JPEG quality** (DO 출력이 JPEG일 때만): CB와 동일, 또는 독립 값(수치 [사용자 결정 필요]).
- **D4.4 JPEG 프로필** (DO 출력이 JPEG일 때만): P-in 또는 P-out.

하위 선택지의 7축 영향은 다음과 같다.

| 하위 선택지 | (1) ingest | (2) 구현 연산 | (3) stress/preset | (4) 토큰·비용 | (5) 논문 서술 | (6) 분모 | (7) D−C |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D4.2 **보존** | G1. RGB와 RGBA PNG 모두 현행 PNG 프로필 수용 범위 | DO variant가 RGBA인 경우(F3a, F7a의 RGBA family) arm의 crop은 O2이고, JPEG로 가는 arm 경로에 alpha 처리(X6)가 필요하다 | G3 | G4. alpha의 토큰 영향은 근거 없음 [검증 필요] | G5. DO의 channels 서술 | G6 불변 | G7 불변. alpha 처리는 C와 D에 같게 적용 |
| D4.2 **RGB 통일** | G1. RGB PNG | RGBA clean(D1-b, D1-d의 RGBA family)에서는 DO 준비에 alpha 처리(X6)가 필요하다. DO variant에는 O1이 적용될 수 있다. D1-a와 D1-c에서는 보존과 출력이 같다(F1, F5) | RGBA clean에서는 DO 준비에 downscale 외의 alpha 처리가 더해져 CL과 DO의 차이가 치수만이 아니게 된다 [도출] | G4. 위와 같음 | G5. DO의 alpha 처리 서술 | G6 불변 | G7 불변 |
| D4.3 **CB와 동일** (Qd = Qc) | G1. encoder 출력 적합성 [검증 필요] | DO 준비의 O8은 Qc를 따른다(§6.4) | D4.4도 CB와 같고 Td = Tc이면 DO와 CB의 recipe가 같아진다 | G4. quality는 인용 회계식의 변수가 아님 | G5. DO의 quality 서술 | G6. 조건 수 4 유지. 두 조건이 같은 recipe가 될 수 있다 [도출] | G7 불변. 조건 간 비교의 해석이 약해질 수 있다 |
| D4.3 **독립 값** (수치 [사용자 결정 필요]) | G1. 값 의존 [검증 필요] | Qd가 75이면 DO 준비에 O8이 필요하고 아니면 불필요하다(§6.4) | DO와 CB의 quality가 다르면 recipe가 구분된다. 관리할 값이 하나 는다 | G4. 위와 같음 | G5. 별도 quality 서술 | G6 불변 | G7 불변 |
| D4.4 **P-in / P-out** | §3.2 프로필 표의 (1)과 같다. 대상은 DO variant | §3.2 프로필 표의 (2)와 같다 | G3 | §3.2 프로필 표의 (4)와 같다 | §3.2 프로필 표의 (5)와 같다 | §3.2 프로필 표의 (6)과 같다 | §3.2 프로필 표의 (7)과 같다 |

## 4. 의존과 결정 순서

| 의존 | 근거와 내용 |
| --- | --- |
| D1 → D4 | D4-b는 D1의 format을 그대로 받는다. D1에 따라 D4 선택지가 겹친다(§6.2). D1-c에서 DO를 JPEG로 두면 재압축이 더해진다 |
| D1 ↔ D3.4b | K-y는 clean이 PNG일 때만 성립한다. D1-c와 모순이고 D1-d에서는 PNG family에만 적용된다([Task 29 분석](./image-transform-provenance-gap.md) L83) |
| D2 ↔ D3 | stress 목표와 arm의 1536 preset의 관계가 §7의 identity를 정한다. D3.1과 D3.2가 resize를 쓰는 arm을 정한다. 값이 같아도 manifest 구분은 유지한다([프로토콜](./image-first-evaluation-protocol.md) L56–57) |
| D2 ↔ D4 | D4.3(quality)과 D4.4(프로필)를 CB와 같게 두고 Td = Tc이면 DO와 CB의 recipe가 같아진다 |
| D1 / X10 → P-in | [검증 필요] clean 치수는 D1의 원천과 X10에 달려 있다. JO는 clean 치수를 유지한다. JPEG로 출력하는 DO·CB는 변환 후 치수가 accounting 상한을 충족해야 하며, 축소했더라도 통과가 자동 보장되지는 않는다. PNG 상한을 통과한 clean이라도 그 JPEG variant는 128 MiB accounting 상한(G1)에 걸려 P-in ingest에 실패할 수 있다. clean 치수 분포가 없어 해당 여부를 판단할 수 없다 |
| D3.1 ↔ D3.2 ↔ D3.3 | S-same과 E-same은 B의 구성을 물려받는다. S-set에서는 C/D가 D3.1과 독립이다 |
| D3.4a ↔ D4 ↔ X5 | DO의 PNG 출력, crop의 PNG 출력, PNG canonical이 같은 preset·옵션을 쓰는지는 [Task 29 분석](./image-transform-provenance-gap.md) L90, L246의 미결 사항이다 |
| D2 프로필 → G1 | P-out은 현행 ingest 밖이다. JO와 CB의 variant를 arm이 받으려면 계약 확장이 먼저다 |

**사용자 결정 순서 제안(구현 연산 순서가 아니다).**

1. D1.
2. D3.4b와 D4(D4.1 → D4.2 → D4.3 → D4.4).
3. D2 프로필(D2.2, D2.6).
4. D2.7.
5. D2 수치(D2.1, D2.3–D2.5).
6. D3.1 → D3.2 → D3.3 → D3.4a.

뒤 단계는 앞 단계의 선택지 수를 줄인다. 이 순서를 따라도 첫 구현 연산은 정해지지 않는다(§10).

## 5. Task 29 §3.1 미정 칸 추적

식별자는 [Task 29 분석](./image-transform-provenance-gap.md) §3.1 L77–83 표의 `[검증 필요]` 칸 20개와 L90의 관계 항목 1개에 붙였다. Task 29 표 원본은 고치지 않는다.

| ID | 위치(행 × 열, 행 번호) | 미정 내용 | 해결 주체 | 상태 |
| --- | --- | --- | --- | --- |
| U01 | RGB PNG crop × clean, L79 | clean format | D1 | 해소 가능 |
| U02 | RGB PNG crop × JO, L79 | 재인코딩 quality | D2.1 | 해소 가능 |
| U03 | RGB PNG crop × DO, L79 | 출력 format·channels, 적용 가능 여부 | D4.1, D4.2 (+D1) | 해소 가능 |
| U04 | RGB PNG crop × CB, L79 | quality, 목표 치수 | D2.4, D2.5 | 해소 가능 |
| U05 | RGB PNG crop × arm, L79 | B의 crop 필요 여부 | X1 | D1–D4로 해소 불가 |
| U06 | JPEG decode→crop × clean, L80 | clean이 JPEG일 수 있는지 | D1 | 해소 가능 |
| U07 | JPEG decode→crop × JO, L80 | quality, 프로필, ingest 통과 | D2.1, D2.2, X9 | 부분 해소 |
| U08 | JPEG decode→crop × DO, L80 | 출력 format·channels | D4.1, D4.2 | 해소 가능 |
| U09 | JPEG decode→crop × CB, L80 | quality, 프로필, ingest 통과 | D2.5, D2.6, X9 | 부분 해소 |
| U10 | JPEG decode→crop × arm, L80 | crop 출력 format | D3.1–D3.3, X2 | 부분 해소 |
| U11 | 1536 × DO, L81 | 목표가 1536과 같은지, 출력 format·channels | D2.3, D4 | 해소 가능 |
| U12 | 1536 × CB, L81 | stress 목표 치수 | D2.4 | 해소 가능 |
| U13 | 1536 × arm, L81 | preset을 쓰는 arm, D·E에서의 필요 | D3.1–D3.3, X3 | 부분 해소 |
| U14 | q75 × JO, L82 | quality가 75와 같은지 | D2.1 | 해소 가능 |
| U15 | q75 × DO, L82 | JPEG encode 필요 여부 | D4.1, D4.3 | 해소 가능 |
| U16 | q75 × CB, L82 | quality | D2.5 | 해소 가능 |
| U17 | q75 × arm, L82 | preset을 쓰는 arm | D3.1–D3.3, X3 | 부분 해소 |
| U18 | PNG canonical × clean, L83 | clean 생성에 재인코딩이 필요한지 | D3.4b (+D1) | 해소 가능 |
| U19 | PNG canonical × DO, L83 | PNG 재인코딩 필요 여부 | D4.1, X5 | 부분 해소 |
| U20 | PNG canonical × arm, L83 | 어느 arm 출력에 쓰이는지 | D3.4a, X2, X3 | 부분 해소 |
| U21 | 관계 항목, L90 | §4.2 선택지 C와 PNG canonical이 같은 preset·옵션인지 | X5 | D1–D4로 해소 불가 |

집계: 해소 가능 12(U01–U04, U06, U08, U11, U12, U14–U16, U18), 부분 해소 7(U07, U09, U10, U13, U17, U19, U20), 해소 불가 2(U05, U21). U10은 b ∈ {rc, c}일 때 s = same이면 C/D에서, e = same이면 E에서 최종 출력이 JPEG로 정해진다. 그 밖의 crop-only·resize-only 출력은 X2로 남는다(§6.5). "해소 가능"은 사용자가 값을 고르면 칸이 채워진다는 뜻이다. 현재 채워졌다는 뜻이 아니다.

## 6. 조합과 연산 집계

### 6.1 필드 민감도와 축

| 필드 | 연산 필요 집합을 바꾸는가 | 처리 |
| --- | --- | --- |
| D1, D4.1, D4.2 | 바꾼다(variant format과 channels) | 구조 축 F |
| D3.4b | 바꾼다(clean 준비) | 구조 축 K |
| D3.1, D3.2, D3.3, D3.4a | 바꾼다(arm 변환) | 구조 축 recipe |
| D2.3, D2.4 (목표 치수) | 일반 resize 존재는 바꾸지 않는다. 1536과의 일치 여부가 정확 preset 행과 identity를 바꾼다 | overlay T |
| D2.1, D2.5 (quality) | 일반 JPEG encode 존재는 바꾸지 않는다. 75와의 일치 여부가 정확 preset 행을 바꾼다 | overlay Q |
| D2.7 | 위 overlay 패턴의 허용 범위만 정한다 | overlay로 흡수 |
| D2.2, D2.6, D4.4 (프로필) | 연산 집합은 바꾸지 않는다. ingest 가능성을 바꾼다 | 프로필 overlay (§3.2) |
| D4.3 (DO quality, Qd) | 일반 JPEG encode 존재는 바꾸지 않는다(그것은 D4.1이 정한다). 75와의 일치 여부가 DO 준비의 정확 q75 칸만 바꾼다 | overlay Qd (§6.2, §6.4의 O8) |

### 6.2 조합 ID와 가정

**형식 프로필 F** (D1 × D4.1 × D4.2에서 도출. JO와 CB는 항상 JPEG).

| F | D1 | D4 (channels) | CL variant | DO variant | 비고 |
| --- | --- | --- | --- | --- | --- |
| F1 | D1-a | D4-a(보존), D4-a(RGB 통일), D4-b | RGB PNG | RGB PNG | 세 선택지가 중복 |
| F2 | D1-a | D4-c | RGB PNG | JPEG | |
| F3a | D1-b | D4-a(보존), D4-b | RGBA PNG | RGBA PNG | 두 선택지가 중복 |
| F3b | D1-b | D4-a(RGB 통일) | RGBA PNG | RGB PNG | alpha 처리 X6 |
| F4 | D1-b | D4-c | RGBA PNG | JPEG | alpha 처리 X6 |
| F5 | D1-c | D4-a(보존), D4-a(RGB 통일) | JPEG | RGB PNG | 두 선택지가 중복(JPEG는 3채널) |
| F6 | D1-c | D4-b, D4-c | JPEG | JPEG | 두 선택지가 중복. DO에 재압축 추가 |
| F7a | D1-d | D4-a(보존) | 혼합 | PNG(family별 RGB 또는 RGBA) | |
| F7b | D1-d | D4-a(RGB 통일) | 혼합 | RGB PNG | alpha 처리 X6 |
| F8 | D1-d | D4-b | 혼합 | 혼합 | |
| F9 | D1-d | D4-c | 혼합 | JPEG | |

- 명목 조합은 D1 4 × D4 4(D4-a 보존, D4-a RGB 통일, D4-b, D4-c) = 16이고 중복 5개를 합쳐 11개다.
- "혼합"의 실제 구성은 [검증 필요]이다.

**clean 생성 K**: K-y 또는 K-n(§3.3).

- K-y × D1-c(F5, F6)는 **모순으로 제외**한다. PNG canonical 재인코딩의 출력은 JPEG clean이 될 수 없다.
- 남는 (F, K)는 11×2 − 2 = 20이다. 이는 명목 구조 수다. D1-d의 K-y는 PNG family에만 적용되는 부분 적용이다.

**arm recipe** ⟨b, s, e, p⟩.

- b ∈ {rc, r, c} (D3.1), s ∈ {same, set} (D3.2), e ∈ {crop, same} (D3.3), p ∈ {cand, out} (D3.4a). 3×2×2×2 = 24.
- 표에서 같은 행에 놓이는 예(전수 확인 아님): ⟨rc, same, same, cand⟩ ≡ ⟨rc, same, same, out⟩, ⟨c, same, same, cand⟩ ≡ ⟨c, same, same, out⟩. 이 두 쌍에서는 변환으로 PNG를 출력하는 arm이 없어 §6.5에서 같은 행에 놓인다.
- 그 밖의 recipe 사이에서 분류가 실제로 몇 가지로 갈리는지는 전수 열거하지 않았다 [검증 필요]. 24는 명목 구성 수이며 의미상 서로 다른 출력의 수가 아니다. 모든 구성은 §6.5의 합성 표에서 b, s, e, p 값으로 찾아 읽는다.
- F7a와 F7b는 이 메모의 두 표에서 같은 행에 놓인다. 그러나 DO의 channels가 달라 출력이 같지 않으므로 별도 사례로 둔다.

**overlay**.

- T = (Td, Tc), Q = (Qj, Qc). 각 성분은 E(후보값과 같음) 또는 N(다름, 값 [사용자 결정 필요])이다. 패턴은 각각 EE, EN, NE, NN의 4개다.
- D2-a는 T = EE, Q = EE의 1개 패턴이다.
- D2-b는 (T, Q) ∈ {(EE, NN), (NN, EE), (NN, NN)}의 3개 패턴이다.
- D2-c는 독립 배정 정책이므로 16개 패턴 모두 가능하다. 그중 EN이나 NE를 포함하는 12개는 D2-c에서만 생긴다. 나머지 4개는 D2-a나 D2-b의 패턴과 결과가 겹칠 수 있으나 배정 정책은 다르다.
- Qd는 DO의 JPEG quality(D4.3)다. DO variant가 JPEG인 경우(F2, F4, F6, F9, 그리고 F8의 JPEG family)에만 뜻이 있다. 값은 E(75), N(75가 아님), 미선택 중 하나다. D4.3을 「CB와 동일」로 고르면 Qd = Qc다. Qd는 위 16개 패턴에 넣지 않은 별도 overlay다.
- T의 E/N 비교는 A-cap 가정(§3.0 G3) 위에 있다.
- N끼리 값이 같은지는 D2-b와 D2-c를 가르지만 아래 표의 분류는 바꾸지 않는다.

**집계 전제** (모두 [검증 필요], X7).

- P0: K-n에서는 원천 파일이 이미 D1의 format과 프로필을 만족한다.
- P2: K-y에서 재인코딩의 입력인 원천의 format과 생성 이력은 미상이다. §6.4의 CL 열은 원천이 제한 PNG로 알려진 경우에만 decode 행을 불필요로 센다. 그 밖의 경우는 미정이다.
- P1: 각 stress variant는 canonical clean에서 직접 만든다. DO 산출물에서 CB를 파생하는 연쇄는 가정하지 않는다. D4-c에서 연쇄 파생을 하면 CB에 JPEG encode가 두 번 걸린다.

### 6.3 분류 정의

- **필수**: 해당 집계 단위의 모든 허용 경로에서 필요.
- **불필요**: 모든 경로에서 불필요.
- **조건부**: 알려진 경로(slot의 selection, fallback, family format)에 따라 달라짐.
- **미정**: 미결 사항 때문에 분류할 수 없음(사유 ID를 붙인다).
- **병합 규칙**: 미정이 하나라도 있으면 미정. 미정이 없고 모두 필수면 필수. 모두 불필요면 불필요. 그 밖은 조건부.
- **D arm**: 변환 경로와 original fallback을 먼저 나눈 뒤 합친다. fallback은 항상 불필요이므로 변환에서만 쓰이는 연산은 조건부가 된다.
- **분류 수준**: 분류는 "규칙이 그 연산 능력을 요구하는가"(규칙 수준의 능력 요구)이다. 모든 slot에서 codec이 실제로 호출된다는 뜻이 아니다. identity resize, full-frame crop, identity resize 뒤의 encode는 no-op 정책(X4)에 따라 호출이 생략될 수 있다. 호출된 resize가 실제로 치수를 바꾸는지는 §7에서 따로 본다. 규칙 수준 필수는 실제 호출 횟수나 실제 pixel 변화를 뜻하지 않는다.
- **JPEG decode의 배타 귀속(이 메모의 집계 규약)**: 한 slot 경로의 JPEG decode 능력 요구는 O3과 O4 중 한 행에만 센다. crop을 포함하는 경로의 decode는 뒤에 다른 변환이 이어져도 O3에 센다. crop이 없는 resize·재인코딩 경로의 decode는 O4에 센다. 따라서 crop 여부(selection, X1)는 귀속 행을 바꾸고, no-op 정책(X4)은 실제 호출만 바꾼다. 이 규약은 중복 계산을 피하려는 문서상 약속이며 구현 구조를 정하지 않는다.
- **집계 분리**: 조건 준비의 연산은 arm 안에서 다시 세지 않는다. A의 full original과 D의 fallback은 배정된 variant를 그대로 전달한다.
- **개수의 의미**: distinct 조건 수와 distinct arm 수다. 호출 횟수, 성공률, 720의 독립 관측 수가 아니다. 필수, 조건부, 미정 개수는 서로 합치지 않는다.

**연산 행.** O1, O3, O6, O8, O10은 Task 29 §3.1의 다섯 행에 대응한다. 다만 Task 29의 첫 행은 "RGB PNG crop → PNG"이고, 이 메모는 그것을 crop 단계(O1)와 PNG 출력 encode(O9, O10)로 나누어 센다. O1에는 입력이 제한 RGB PNG인 crop 단계만 들어간다. O1이 충족되어도 Task 29 후보의 완전한 PNG 출력 능력이 충족된 것이 아니다. 그 출력은 O9나 O10과 X2, X5에 달려 있다. 나머지는 일반/정확 구분과 선행 연산을 드러내려고 이 메모가 더한 문서 구조다.

| ID | 연산 |
| --- | --- |
| O1 | 제한 RGB PNG 입력의 정수 직사각형 crop 단계. 출력 encode는 포함하지 않는다(출력 format은 X2, PNG 출력이면 O9와 O10) |
| O2 | RGBA 포함 PNG crop ([Task 29 분석](./image-transform-provenance-gap.md) L99의 후보) |
| O3 | JPEG source decode → crop |
| O4 | JPEG decode (crop이 없는 경로에서 resize·재인코딩의 선행. O3과의 배타 귀속은 위 규약) |
| O5 | 일반 downscale (확대 없음, 목표 무관) |
| O6 | 정확 preset: 긴 변 1536 이하 downscale |
| O7 | 일반 JPEG encode (quality 무관) |
| O8 | 정확 preset: JPEG quality 75 encode |
| O9 | 일반 PNG encode (출력 쓰기) |
| O10 | 정확 preset: PNG canonical 재인코딩 |

### 6.4 조건 준비 집계

| 조합 / 연산 | clean 준비 | JPEG-only 준비 | downscale-only 준비 | combined 준비 | 필요한 조건 집합/개수 |
| --- | --- | --- | --- | --- | --- |
| 전 조합 / O1, O2, O3 | 불필요 | 불필요 | 불필요 | 불필요 | 필수 ∅(0), 조건부 ∅(0), 미정 ∅(0) |
| F1–F4 / O4 | K-n 불필요. K-y는 원천이 제한 PNG로 알려진 경우 불필요, 그 외 미정(X7) | 불필요 | 불필요 | 불필요 | K-n이거나 원천이 제한 PNG로 알려진 경우 모두 0. 그 외 K-y는 미정 {CL}(1) |
| F5, F6 / O4 | 불필요 | 필수 | 필수 | 필수 | 필수 {JO, DO, CB}(3) |
| F7a, F7b, F8, F9 / O4 | K-n 불필요. K-y의 PNG family는 원천이 제한 PNG로 알려진 경우 불필요, 그 외 미정(X7) | 조건부 | 조건부 | 조건부 | 조건부 {JO, DO, CB}(3). JPEG family에서만. 원천 format이 미상인 K-y에서는 미정 {CL}(1)이 더해진다 |
| 전 조합 / O5 | 불필요 | 불필요 | 필수 | 필수 | 필수 {DO, CB}(2) |
| T = EE / O6 | 불필요 | 불필요 | 필수 | 필수 | 필수 {DO, CB}(2) |
| T = EN / O6 | 불필요 | 불필요 | 필수 | 불필요 | 필수 {DO}(1) |
| T = NE / O6 | 불필요 | 불필요 | 불필요 | 필수 | 필수 {CB}(1) |
| T = NN / O6 | 불필요 | 불필요 | 불필요 | 불필요 | 모두 0 |
| F1, F3a, F3b, F5, F7a, F7b / O7 | 불필요 | 필수 | 불필요 | 필수 | 필수 {JO, CB}(2) |
| F2, F4, F6, F9 / O7 | 불필요 | 필수 | 필수 | 필수 | 필수 {JO, DO, CB}(3) |
| F8 / O7 | 불필요 | 필수 | 조건부 | 필수 | 필수 {JO, CB}(2), 조건부 {DO}(1) |
| 전 조합 / O8 | 불필요 | Qj = E 필수, Qj = N 불필요 | F2, F4, F6, F9: Qd = E 필수, Qd = N 불필요, D4.3 미선택 미정. F8: Qd = E 조건부(JPEG family에서만), Qd = N 불필요, 미선택 미정. 그 외 F는 불필요 | Qc = E 필수, Qc = N 불필요 | 필수: Q = EE {JO, CB}(2), EN {JO}(1), NE {CB}(1), NN ∅(0). 여기에 DO가 더해진다. F2, F4, F6, F9: Qd = E이면 필수에 {DO}(+1), Qd = N이면 0, 미선택이면 미정 {DO}(1). F8: Qd = E이면 조건부 {DO}(1), Qd = N이면 0, 미선택이면 미정 {DO}(1). 그 외 F는 DO 0 |
| K-y, F1, F3a, F3b / O9 | 필수 | 불필요 | 필수 | 불필요 | 필수 {CL, DO}(2) |
| K-y, F2, F4 / O9 | 필수 | 불필요 | 불필요 | 불필요 | 필수 {CL}(1) |
| K-y, F7a, F7b / O9 | 조건부 | 불필요 | 필수 | 불필요 | 필수 {DO}(1), 조건부 {CL}(1) |
| K-y, F8 / O9 | 조건부 | 불필요 | 조건부 | 불필요 | 조건부 {CL, DO}(2) |
| K-y, F9 / O9 | 조건부 | 불필요 | 불필요 | 불필요 | 조건부 {CL}(1) |
| K-n, F1, F3a, F3b, F5, F7a, F7b / O9 | 불필요 | 불필요 | 필수 | 불필요 | 필수 {DO}(1) |
| K-n, F8 / O9 | 불필요 | 불필요 | 조건부 | 불필요 | 조건부 {DO}(1) |
| K-n, F2, F4, F6, F9 / O9 | 불필요 | 불필요 | 불필요 | 불필요 | 모두 0 |
| K-y, F1, F3a, F3b / O10 | 필수 | 불필요 | 미정(X5) | 불필요 | 필수 {CL}(1), 미정 {DO}(1) |
| K-y, F2, F4 / O10 | 필수 | 불필요 | 불필요 | 불필요 | 필수 {CL}(1) |
| K-y, F7a, F7b, F8 / O10 | 조건부 | 불필요 | 미정(X5) | 불필요 | 조건부 {CL}(1), 미정 {DO}(1) |
| K-y, F9 / O10 | 조건부 | 불필요 | 불필요 | 불필요 | 조건부 {CL}(1) |
| K-n, F1, F3a, F3b, F5, F7a, F7b, F8 / O10 | 불필요 | 불필요 | 미정(X5) | 불필요 | 미정 {DO}(1) |
| K-n, F2, F4, F6, F9 / O10 | 불필요 | 불필요 | 불필요 | 불필요 | 모두 0 |

- O5의 "필수"는 규칙 수준이다. clean의 긴 변이 이미 목표 이하인 family에서는 resize가 identity가 될 수 있다([프로토콜](./image-first-evaluation-protocol.md) L49). 그런 family가 얼마나 되는지는 clean 치수 분포가 없어 [검증 필요] — X10이다. 같은 family에서 DO의 PNG encode(O9)와 JPEG encode(O7)도 능력 요구일 뿐이다. resize가 identity일 때 clean bytes를 그대로 둘지 다시 encode할지는 정해지지 않았다(X4, X7).
- K-y의 CL 준비는 원천 decode를 수반한다. 원천이 제한 PNG이면 현행 PNG decode로 충분하고 표에 따로 행이 없다. 원천 format이 미상이면 필요한 decoder를 정할 수 없다(P2, X7).
- RGBA가 JPEG나 RGB로 가는 셀(F3b, F4, F7b, F8, F9의 해당 family)에는 표에 없는 alpha 처리(X6)가 더 필요하다.

### 6.5 arm 변환 집계

**condition×arm 셀 규칙.** 아래 네 연산(O1–O4)만 variant format에 따라 달라진다. 나머지 연산은 format과 무관하다. 각 조건의 variant format은 §6.2의 F 표에서 읽는다.

| 연산 @ arm | variant가 RGB PNG | variant가 RGBA PNG | variant가 JPEG |
| --- | --- | --- | --- |
| O1 @ E | 필수 | 불필요 | 불필요 |
| O1 @ C, D 변환 | 조건부(selection) | 불필요 | 불필요 |
| O1 @ B | 미정(X1) | 불필요 | 불필요 |
| O2 @ E / C, D 변환 / B | 불필요 | 필수 / 조건부 / 미정(X1) | 불필요 |
| O3 @ E / C, D 변환 / B | 불필요 | 불필요 | 필수 / 조건부 / 미정(X1) |
| O4 @ B (b = rc, r, c 모두) | 불필요 | 불필요 | 미정(X1). crop 없음이면 O4 필수, crop 경로이면 O3에 귀속 |
| O4 @ C, D 변환 / E | 불필요 | 불필요 | 조건부(selection. crop 없이 변환하는 slot에서 필수, crop slot의 decode는 O3) / 불필요(E의 decode는 e와 무관하게 O3) |

**arm 단위 집계** (네 조건의 셀을 §6.3 규칙으로 병합). A는 모든 조합과 연산에서 불필요다. D 열은 "변환 / fallback → 합"으로 적는다.

| 조합 / 연산 | A | B | C | D 변환/fallback | E | 필요한 arm 집합/개수 | 잔여 미정 칸 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F3a, F4, F6 / O1 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 불필요 | 모두 0 | 없음(RGB PNG variant가 없음) |
| F1, F2, F3b, F5, F7a, F7b, F8, F9 / O1 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 조건부 | 필수 ∅(0), 조건부 {C, D, E}(3), 미정 {B}(1) | X1, X3. F7a–F9는 family 구성 [검증 필요] |
| F1, F2, F5, F6 / O2 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 불필요 | 모두 0 | 없음(RGBA variant가 없음) |
| F3a, F3b, F4, F7a, F7b, F8, F9 / O2 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 조건부 | 필수 ∅(0), 조건부 {C, D, E}(3), 미정 {B}(1) | X1, X3, X6 |
| F6 / O3 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 필수 | 필수 {E}(1), 조건부 {C, D}(2), 미정 {B}(1) | X1, X3 |
| F6 외 전부 / O3 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 조건부 | 필수 ∅(0), 조건부 {C, D, E}(3), 미정 {B}(1) | X1, X3 |
| b ∈ {rc, c}, s = same, F6 / O4 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 ∅(0), 조건부 {C, D}(2), 미정 {B}(1) | X1(귀속), X3(selection). X4는 실제 호출만 바꿈 |
| b ∈ {rc, c}, s = same, F6 외 / O4 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 ∅(0), 조건부 {C, D}(2), 미정 {B}(1) | X1(귀속), X3(selection). X4는 실제 호출만 바꿈 |
| b ∈ {rc, c}, s = set, F6 / O4 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 ∅(0), 조건부 {C, D}(2), 미정 {B}(1) | X1(귀속), X3(selection). X4는 실제 호출만 바꿈 |
| b ∈ {rc, c}, s = set, F6 외 / O4 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 ∅(0), 조건부 {C, D}(2), 미정 {B}(1) | X1(귀속), X3(selection). X4는 실제 호출만 바꿈 |
| b = r, 전 s, F6 / O4 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 ∅(0), 조건부 {C, D}(2), 미정 {B}(1) | X1(귀속), X3(selection). X4는 실제 호출만 바꿈 |
| b = r, 전 s, F6 외 / O4 | 불필요 | 미정 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 ∅(0), 조건부 {C, D}(2), 미정 {B}(1) | X1(귀속), X3(selection). X4는 실제 호출만 바꿈 |
| b ∈ {rc, r}, s = same, e = crop / O5 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 불필요 | 필수 {B, C}(2), 조건부 {D}(1) | 없음 |
| b ∈ {rc, r}, s = same, e = crop / O6 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 불필요 | 필수 {B, C}(2), 조건부 {D}(1) | 없음 |
| b ∈ {rc, r}, s = same, e = same / O5 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 필수 | 필수 {B, C, E}(3), 조건부 {D}(1) | 없음 |
| b ∈ {rc, r}, s = same, e = same / O6 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 필수 | 필수 {B, C, E}(3), 조건부 {D}(1) | 없음 |
| b ∈ {rc, r}, s = set, e = crop / O5 | 불필요 | 필수 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 {B}(1), 조건부 {C, D}(2) | X3 |
| b ∈ {rc, r}, s = set, e = crop / O6 | 불필요 | 필수 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 필수 {B}(1), 조건부 {C, D}(2) | X3 |
| b ∈ {rc, r}, s = set, e = same / O5 | 불필요 | 필수 | 조건부 | 조건부/불필요 → 조건부 | 필수 | 필수 {B, E}(2), 조건부 {C, D}(2) | X3 |
| b ∈ {rc, r}, s = set, e = same / O6 | 불필요 | 필수 | 조건부 | 조건부/불필요 → 조건부 | 필수 | 필수 {B, E}(2), 조건부 {C, D}(2) | X3 |
| b = c, s = same, 전 e / O5 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 불필요 | 모두 0 | 없음 |
| b = c, s = same, 전 e / O6 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 불필요 | 모두 0 | 없음 |
| b = c, s = set, 전 e / O5 | 불필요 | 불필요 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 조건부 {C, D}(2) | X3 |
| b = c, s = set, 전 e / O6 | 불필요 | 불필요 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 조건부 {C, D}(2) | X3 |
| b ∈ {rc, c}, s = same, e = crop / O7 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 미정 | 필수 {B, C}(2), 조건부 {D}(1), 미정 {E}(1) | X2 |
| b ∈ {rc, c}, s = same, e = crop / O8 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 미정 | 필수 {B, C}(2), 조건부 {D}(1), 미정 {E}(1) | X2 |
| b ∈ {rc, c}, s = same, e = same / O7 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 필수 | 필수 {B, C, E}(3), 조건부 {D}(1) | 없음 |
| b ∈ {rc, c}, s = same, e = same / O8 | 불필요 | 필수 | 필수 | 필수/불필요 → 조건부 | 필수 | 필수 {B, C, E}(3), 조건부 {D}(1) | 없음 |
| b ∈ {rc, c}, s = set, e = crop / O7 | 불필요 | 필수 | 미정 | 미정/불필요 → 미정 | 미정 | 필수 {B}(1), 미정 {C, D, E}(3) | X2, X3 |
| b ∈ {rc, c}, s = set, e = crop / O8 | 불필요 | 필수 | 미정 | 미정/불필요 → 미정 | 미정 | 필수 {B}(1), 미정 {C, D, E}(3) | X2, X3 |
| b ∈ {rc, c}, s = set, e = same / O7 | 불필요 | 필수 | 미정 | 미정/불필요 → 미정 | 필수 | 필수 {B, E}(2), 미정 {C, D}(2) | X2, X3 |
| b ∈ {rc, c}, s = set, e = same / O8 | 불필요 | 필수 | 미정 | 미정/불필요 → 미정 | 필수 | 필수 {B, E}(2), 미정 {C, D}(2) | X2, X3 |
| b = r, 전 s·e / O7 | 불필요 | 미정 | 미정 | 미정/불필요 → 미정 | 미정 | 미정 {B, C, D, E}(4) | X2. s = set에서는 X3도 |
| b = r, 전 s·e / O8 | 불필요 | 미정 | 미정 | 미정/불필요 → 미정 | 미정 | 미정 {B, C, D, E}(4) | X2(format과 quality). s = set에서는 X3도 |
| b ∈ {rc, c}, s = same, e = crop / O9 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 미정 | 미정 {E}(1) | X2 |
| b ∈ {rc, c}, s = same, e = same / O9 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 불필요 | 모두 0 | 없음 |
| b ∈ {rc, c}, s = set, e = crop / O9 | 불필요 | 불필요 | 미정 | 미정/불필요 → 미정 | 미정 | 미정 {C, D, E}(3) | X2, X3 |
| b ∈ {rc, c}, s = set, e = same / O9 | 불필요 | 불필요 | 미정 | 미정/불필요 → 미정 | 불필요 | 미정 {C, D}(2) | X2, X3 |
| b = r, 전 s·e / O9 | 불필요 | 미정 | 미정 | 미정/불필요 → 미정 | 미정 | 미정 {B, C, D, E}(4) | X2. s = set에서는 X3도 |
| p = cand, s = same, 전 b·e / O10 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 불필요 | 모두 0 | L55의 후보 열거와 긴장 [검증 필요] |
| p = cand, s = set, 전 b·e / O10 | 불필요 | 불필요 | 조건부 | 조건부/불필요 → 조건부 | 불필요 | 조건부 {C, D}(2) | X3, X5 |
| p = out, b ∈ {rc, c}, s = same, e = crop / O10 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 미정 | 미정 {E}(1) | X2, X5 |
| p = out, b ∈ {rc, c}, s = same, e = same / O10 | 불필요 | 불필요 | 불필요 | 불필요/불필요 → 불필요 | 불필요 | 모두 0 | 없음 |
| p = out, b ∈ {rc, c}, s = set, e = crop / O10 | 불필요 | 불필요 | 미정 | 미정/불필요 → 미정 | 미정 | 미정 {C, D, E}(3) | X2, X3, X5 |
| p = out, b ∈ {rc, c}, s = set, e = same / O10 | 불필요 | 불필요 | 미정 | 미정/불필요 → 미정 | 불필요 | 미정 {C, D}(2) | X2, X3, X5 |
| p = out, b = r, 전 s·e / O10 | 불필요 | 미정 | 미정 | 미정/불필요 → 미정 | 미정 | 미정 {B, C, D, E}(4) | X2, X5. s = set에서는 X3도 |

각주(알려진 경로별 분류와 표기 규약).

- **O5와 O6, O7과 O8의 행 분리.** 일반 행과 정확 행을 따로 적었다. 지금 칸의 분류가 같은 것은 아래 이유 때문이며 두 행이 같은 능력이라는 뜻이 아니다. O7의 미정은 출력 format이 정해지면 해소되고, O8의 미정은 format과 quality가 둘 다 정해져야 해소된다. 이 메모의 D3 선택지 정의에서 arm의 resize는 1536 preset이고, 후보 preset으로 호출되는 JPEG encode는 q75다. 그 경로에서만 일반 행과 정확 행의 분류가 같다. 미정(X2) 칸에서는 두 행을 따로 읽는다. crop-only나 resize-only 출력이 JPEG로 정해지면 일반 JPEG encode(O7)는 필요해지지만, 그 quality가 75인지는 따로 정해지므로 O8은 미정으로 남거나 불필요가 될 수 있다. 미정(X2) 칸의 O7과 O8이 같은 분류로 해소된다고 가정하지 않는다.
- **O4, 전 b.** 규칙 수준 분류다. JPEG variant에 resize나 재인코딩 규칙이 걸리면 decode 능력이 필요하다. b = r에서 resize가 identity인 slot은 X4에 따라 호출이 생략될 수 있지만 능력 요구는 바뀌지 않는다(O5, O6과 같은 기준). JO와 CB의 B에는 JPEG decode 능력이 필수지만 O3/O4 중 귀속은 X1에 달려 있다. 따라서 O4만의 B 셀은 미정이며, 이를 decode 능력 자체가 미정이라는 뜻으로 읽지 않는다.
- **O4 @ B와 X1.** B의 crop 여부를 정하지 않았으므로 §6.3의 미정 우선 병합 규칙에 따라 O4 @ B를 미정(X1)으로 둔다. crop 없음으로 정해지면 JPEG 셀에서 O4가 필수, crop 경로로 정해지면 같은 decode가 O3에 귀속된다. F6에서는 모든 조건이 JPEG이며, 다른 F에서는 CL/DO의 format에 따라 달라진다. X1을 확정하기 전에는 O3과 O4의 개수를 더해 독립 decode 요구로 세지 않는다.
- **O4 @ C, D.** crop 없이 변환하는 JPEG slot에서는 필수다(s = same의 B 변환, s = set의 1536, q75, 1536→q75, PNG canonical 선택). crop이 선택된 slot의 decode는 O3에 센다(§6.3의 배타 귀속). 그래서 조건부다. 1536만 선택되고 identity인 slot은 호출 여부만 X4에 달린다. 제안 pool에 무변환 후보가 있는지와 실제 선택은 X3이다.
- **O3, O4 @ E.** 표의 분류는 규칙 수준의 능력 요구다. E의 crop 규칙은 JPEG variant에서 decode→crop 능력(O3)을 요구한다. oracle 영역이 full-frame이고 no-op으로 처리하는 정책(X4)이면 그 slot에서는 변환용 decode가 호출되지 않을 수 있다. e = same에서 crop 뒤에 B 변환이 이어져도 그 decode는 crop 경로의 것이므로 O3에만 세고 O4에는 세지 않는다(§6.3의 배타 귀속). 그래서 O4의 E 열은 전부 불필요다. full-frame no-op은 실제 호출만 바꾸고 귀속 행을 바꾸지 않는다. [Task 29 분석](./image-transform-provenance-gap.md) L146의 no-op 안이 수행하는 캡처와 검증은 이 집계와 별개다. O1 @ E의 "필수"도 같은 뜻의 능력 요구다.
- **O7, O8, O9, s = set.** 후보가 선택된 slot에서는 해당 encode가 필수다. crop만 선택된 slot의 출력 format과 quality가 X2다.
- **b ∈ {rc, c}의 JPEG variant.** B가 이미 JPEG인 variant에 q75 encode를 적용한다고 읽었다. "이미 JPEG면 생략"하는 정책은 현재 근거에 없다. 그런 정책을 새로 정하면 해당 셀이 달라진다.
- **s = same, b ∈ {rc, c}.** C/D의 최종 출력 format이 JPEG로 정해져 X2가 C/D에서 사라진다. crop은 중간 결과로 보았다.

### 6.6 crop-first / resize-first 판단용 커버리지 요약

첫 연산을 고르지 않는다. 아래는 위 두 표에서 읽은 것이며 codec 적합성이나 안전성은 개수로 입증되지 않는다. arm 단위 병합은 셀 수준에서 확실한 필요를 「조건부」로 가릴 수 있으므로 셀 수준 필수를 함께 적는다.

| 연산 | 조건 준비 커버리지 | arm 커버리지 | 선행 연산 |
| --- | --- | --- | --- |
| RGB PNG crop (O1) | 전 조합에서 0개 조건 | arm 단위 필수는 어느 조합에도 없다. 셀 수준 필수는 E × (RGB PNG인 CL 또는 DO)뿐이다. F3a, F4, F6에서는 전부 불필요 | PNG decode(현행 코드에 있음), 출력 encoder(적합성 미검증, [Task 29 분석](./image-transform-provenance-gap.md) L107–119) |
| JPEG decode→crop (O3) | 0개 조건 | E × JO, E × CB 셀은 전 조합에서 필수다. arm 단위 필수는 F6의 {E}뿐이고 그 외는 조건부다 | 제한 JPEG 프로필 통과(P-in과 encoder 적합성 [검증 필요]), 출력 format(X2) |
| JPEG decode, crop 없는 경로 (O4) | F5, F6에서 {JO, DO, CB} 필수. F7a–F9에서 조건부. F1–F4에서 0(K-y의 원천 미상은 미정) | B는 전 조합에서 귀속 미정(X1). C와 D는 조건부, E는 0(E의 decode는 O3). 별개로 B × JO/CB의 decode 능력은 필수이며 O3/O4 중 어디에 셀지는 미정 | 제한 JPEG 프로필과 accounting 상한 통과(P-in, G1 [검증 필요]), B의 crop 여부(X1) |
| 일반 resize (O5) | 전 조합에서 {DO, CB} 2개 조건 필수 | b ∈ {rc, r}이면 B 필수, s와 e에 따라 C와 E 추가. b = c, s = same이면 arm에서 0 | 필터와 반올림 규칙(X8), 입력 decode, 출력 encode |
| 일반 JPEG encode (O7) | 전 조합에서 {JO, CB} 필수, F2, F4, F6, F9에서는 DO도 필수 | b ∈ {rc, c}이면 B 필수. b = r이면 arm 전체 미정 | encoder 선택과 프로필 적합성(X9), RGBA면 alpha 처리(X6) |
| PNG encode / PNG canonical (O9, O10) | K와 F에 따라 0–2개 조건 | §6.5 표를 따른다. 미정 칸의 사유는 X2, X3, X5다 | encoder 옵션 통일(X5) |

## 7. effective transform과 대비 해석

**resize 단계의 identity** (1536 no-upscale을 적용하는 arm 셀). stress 목표를 긴 변 상한으로 읽는 A-cap 가정(§3.0 G3) 위의 도출이다.

| 조건 | overlay | resize 단계 | 사유 |
| --- | --- | --- | --- |
| CL | 무관 | 미정 [검증 필요] | clean 치수 분포의 근거가 없다(X10) |
| JO | 무관 | 미정 [검증 필요] | 조건 준비에 resize가 없어 치수가 clean과 같다 |
| DO | Td = E | identity | A-cap 가정에서 variant의 긴 변이 1536 이하이므로 1536 no-upscale은 치수를 바꾸지 않는다 |
| DO | Td = N | 미정 | 값이 미정이다. A-cap 가정에서 목표가 1536보다 작으면 identity, 크면 slot 치수에 달린다 [도출] |
| CB | Tc = E | identity | DO와 같은 사유 |
| CB | Tc = N | 미정 | 위와 같다 |

- resize identity는 **resize 단계**에 한정된다. 다른 단계나 출력 bytes·pixel의 동일성을 뜻하지 않는다.
- quality가 같다는 것은 identity의 근거가 아니다. quality 75로 만든 JPEG를 decode해 q75로 다시 encode하는 것은 identity 연산이 아니며, 이 저장소에는 그 출력이 입력과 같다는 근거가 없다. 재압축 손실의 크기는 주장하지 않는다.
- **표기 대응.** 이 절의 「identity」와 「미정」은 계획 문서의 같은 이름 분류에 대응한다. 「단계 기준 identity」는 해당 단계에 한정한 identity다. 「identity 보장 없음」은 계획의 「비identity」 칸에 대응시킨다. 다만 이 메모는 그것을 출력이 반드시 달라진다는 뜻으로 쓰지 않는다. 근거 없이 「항상 비identity」라고 적지 않으려는 표기다.
- 아래 표는 두 가지를 구분한다. "identity 보장 없음"은 연산 수준에서 출력이 입력과 같다는 보장이 없다는 뜻이다. 특정 출력의 bytes나 pixel이 입력과 일치할 가능성을 배제하지 않으며, 실제로 달라졌다는 증명도 아니다. 실제 변화는 측정되지 않았다 [검증 필요]. 치수나 format이 달라지는 경우(진부분 영역 crop, PNG → JPEG)에만 출력이 입력과 다르다고 적는다.

**condition×arm의 effective transform.**

| arm 구성 | CL, JO | DO, CB (T의 해당 성분 = E) | DO, CB (해당 성분 = N) | 사유 |
| --- | --- | --- | --- | --- |
| A | identity | identity | identity | 배정된 variant를 그대로 전달한다. provider 쪽 처리는 별개다 |
| B, b = rc | identity 보장 없음 | resize 단계만 identity. encode 단계는 identity 보장 없음 | identity 보장 없음 | JPEG encode가 규칙상 항상 호출된다. PNG variant에서는 format이 바뀌어 bytes가 variant와 같을 수 없다. JPEG variant에서는 재인코딩 출력이 variant와 일치할 가능성을 배제하지 못하며 실제 변화는 미측정이다 |
| B, b = r | 미정(X2, X4, X10) | 단계 기준 identity. 출력 format은 X2, bytes 동일성은 X4 | 미정(X2, X4) | resize만 있다. resize-only 출력의 format이 X2다. identity일 때 원본 bytes를 넘길지가 X4다 |
| B, b = c | identity 보장 없음 | identity 보장 없음 | identity 보장 없음 | PNG → JPEG는 format이 바뀌는 손실 encode라 bytes가 variant와 같을 수 없다. JPEG → JPEG는 재압축이며 quality가 같아도 identity 연산이 아니다. 출력이 실제로 달라지는지는 미측정이다 |
| C, D 변환, s = same | crop 없는 slot은 B와 같다. 진부분 영역 crop이 있는 slot은 치수가 달라져 출력이 variant와 다르다 | 같은 규칙 | 같은 규칙 | full-frame crop은 identity일 수 있고 그 처리는 X4다 |
| C, D 변환, s = set | 선택된 후보에 따른다 | 1536 선택 slot은 b = r 행, q75 선택 slot은 b = c 행, 1536→q75 선택 slot은 b = rc 행과 같다 | 같은 규칙 | PNG canonical 선택: PNG variant에서는 부분 identity(pixel 유지는 [검증 필요], bytes는 달라질 수 있음, [Task 29 분석](./image-transform-provenance-gap.md) L142). JPEG variant에서는 format이 바뀌어 encoded bytes가 variant와 같을 수 없다. decode된 pixel의 관계는 [검증 필요] |
| D fallback | identity | identity | identity | 배정된 variant로 되돌아간다([프로토콜](./image-first-evaluation-protocol.md) L63–64) |
| E, e = crop | 영역에 따른다 | 영역에 따른다 | 영역에 따른다 | 진부분 영역 crop이면 치수가 달라져 출력이 variant와 다르다. full-frame이면 identity일 수 있고 그 처리는 X4다. full-frame oracle 영역의 빈도는 근거가 없다 [검증 필요] |
| E, e = same | crop 단계는 위 행, 이후는 해당 B 행 | 같은 규칙 | 같은 규칙 | crop 뒤 B의 변환. b = r이고 full-frame이며 resize 단계가 identity인 slot은 X4에 따라 identity일 수 있다. 그 밖은 해당 B 행의 사유를 따른다 |

**어느 대비에 영향을 주는가.** 아래는 입력이 같아질 가능성이다. 효과 크기와 통계 검정력은 측정되지 않았다.

| 대비 | 입력이 같아질 수 있는 경우 | 해당 조합(넓이와 빈도의 순서는 주장하지 않음) |
| --- | --- | --- |
| primary D−C | arm 정의상 D는 C와 같은 selection과 변환을 쓴다. 그래서 guard가 후보를 받아들인 slot에서는 C와 D의 입력이 같다(guard가 수락한 후보를 고치지 않는다는 읽기. guard가 거부 후 원본 복귀 외의 동작을 하는지는 [검증 필요]). 입력 대비는 D가 fallback하고 C의 출력이 배정된 variant와 다른 slot에만 있다. 그런 slot의 수는 guard 규칙과 실행에 달려 있어 미상이다. 그 밖에 C의 출력이 배정된 variant와 같아지면 D가 guard를 통과하든 fallback하든 C와 D의 입력이 같다. 그 slot에는 변환 입력의 대비가 없다. 모델 응답이 확률적일 수 있으므로 점수 차이가 생길 수 없다는 뜻은 아니다. 그 slot에서 관측된 차이를 guard와 fallback의 효과로 읽을 수 없다는 뜻이다 | guard가 후보를 수락한 모든 slot(빈도 미상). identity 경로로는 resize 단계가 identity인 DO와 CB의 slot에서 s = same, b = r, crop 없음, X2가 variant format 유지이고 X4가 bytes 유지인 경우. 여기에는 T의 성분이 E인 경우뿐 아니라 stress 목표가 1536보다 작은 경우도 들어간다. s = set에서 1536만 선택된 같은 slot. CL과 JO에서도 긴 변이 1536 이하인 family는 같다(X10) |
| secondary C−B | s = same에서 crop 없는 slot은 C와 B가 설계상 같은 변환을 받는다. 출력 bytes까지 같은지는 encoder 결정성에 달려 있다 [검증 필요] — X9. s = set에서는 출력 변환 차이가 섞인다(L80–82) | s = same의 crop 없는 slot. crop 선택 빈도는 X3 |
| secondary D−A | D가 fallback한 slot, 그리고 C/D 변환이 identity인 slot에서 D와 A의 입력이 같다 | D가 fallback한 모든 slot. 그리고 primary 행에 적은 identity slot |

- s = same이고 b ∈ {rc, c}이면 C의 출력에 규칙상 항상 JPEG encode가 걸리므로 identity가 보장되는 경로가 없다. PNG variant에서는 출력 format이 JPEG로 바뀌어 bytes가 variant와 같을 수 없다. JPEG variant에서는 재인코딩 출력이 variant와 일치할 가능성을 배제하지 못한다. 일치 여부는 측정되지 않았다 [검증 필요].
- 위 표는 변환 입력의 대비가 있는지만 본다. 입력이 같은 slot에서 점수 차이가 생길 수 없다고 주장하지 않는다.
- clean의 긴 변이 목표 이하인 family에서는 조건 자체가 겹칠 수 있다. DO가 CL과, CB가 JO와 같은 pixel이 될 수 있다. 빈도는 X10으로 [검증 필요]이다.

## 8. 평가 불변량

- **분모.** 이 메모의 모든 선택지는 네 조건, 다섯 arm, 36 family, 질문 1개를 유지한다. 그 전제에서 720 = 576 + 144는 바뀌지 않는다([프로토콜](./image-first-evaluation-protocol.md) §5 L108–111, [논문](./image-first-paper-draft.ko.md) §4 L130–132). 36 family는 720개의 독립 관측이 아니다(프로토콜 §3 L89).
- **프로토콜 밖 대안.** 한 조건에 quality나 목표 수준을 여럿 두는 것, 조건이나 arm을 더하는 것, 반복은 현 프로토콜 밖이다. frozen plan의 사전 기록과 별도 분모가 필요하다([프로토콜](./image-first-evaluation-protocol.md) §5 L113–114). 이 메모는 그런 대안을 자동으로 추가하지 않는다.
- **C/D 대칭.** C와 D의 후보 집합, 출력 변환, alpha 처리, no-op 정책이 다르면 D−C를 guard와 fallback만의 효과로 읽을 수 없다. 이 메모의 D3 선택지는 모두 대칭을 유지한다. X2, X4, X6을 정할 때도 C와 D에 같은 규칙을 적용해야 한다.
- **실패와 회계.** fallback 호출은 D의 assigned denominator에 포함한다([프로토콜](./image-first-evaluation-protocol.md) §4 L102). runtime failure, timeout, invalid output은 incorrect로 센다. 실행하지 않은 slot은 failure와 구분해 `not_started`로 남긴다. retry는 분모를 늘리지 않는다(§5 L114–119). usage가 없으면 unknown이다. rejection은 n/N, n/S로 따로 보고한다(§7 L162–175). 어떤 선택지도 이 규칙을 바꾸지 않는다.
- **P-out과 ingest 불가.** 세 경우를 구분하며, ingest 불가 slot을 일괄 incorrect로 분류하지 않는다.
  - 실행 전 preflight([프로토콜](./image-first-evaluation-protocol.md) §8 L186)에서 variant의 format이나 프로필 부적합이 드러나 run이 시작되지 않거나 중지되면, 호출되지 않은 slot은 failure가 아니라 `not_started`다(§5 L116–117). 이는 실행하지 않은 slot에 대한 프로토콜 문구를 적용한 것이다. ingest 불가가 곧 미실행이라는 규칙도, 모든 variant를 현행 plugin으로 사전 검증한다는 규칙도 프로토콜에 없다(G1의 제안 전제). 중지된 run은 성공으로 처리하지 않고 상태와 원인을 기록한다(§9 L197–198). `not_started`가 남아 있으면 완료된 연구로 보고하지 않는다.
  - slot이 실제로 시도된 뒤 runtime failure, timeout, invalid output이 나면 그 slot은 assigned denominator에서 incorrect다(§5 L114).
  - format이나 프로필 부적합을 preflight의 중지 사유로 볼지, 어느 단계에서 판정할지는 프로토콜에 명시되어 있지 않다 [검증 필요]. §9 L196–197의 중지 조건 목록에는 프로필 부적합이 따로 없다.
  - 실패가 arm 사이에 어떻게 나뉘는지도 [검증 필요]이다.

## 9. 승인 전 권고

아래는 모두 승인 전 제안이다. 근거가 부족한 세부값은 권고하지 않는다.

| 항목 | 승인 전 권고 | 판단 근거 | 반대 선택의 비용 |
| --- | --- | --- | --- |
| D1 | D1-a(제한 RGB PNG). 조건: 원천이 손실 이력 없는 native clean일 때 | 그 조건에서는 clean에 기존 손실 손상이 섞이지 않아 프로토콜 L47의 분리 기록이 단순하다. PNG라는 format만으로는 과거 손실 encoding 이력이 없다는 것이 증명되지 않는다. 원천 이력이 미상이면 X7로 남는다. alpha 처리(X6)가 없다. Task 29의 crop 후보가 RGB 전용이다([Task 29 분석](./image-transform-provenance-gap.md) L104) | D1-b는 alpha 검증이 는다(L99). D1-c는 clean의 의미가 바뀌고 K-y가 불가능하다. D1-d는 family format에 따른 조건부 셀이 생긴다 |
| D2.2, D2.6 | P-in | 현행 계약이 받는 유일한 JPEG 프로필이다([입력 계약](../image-artifacts.md) L42–47) | P-out은 계약 확장이 먼저다. P-in도 encoder 적합성은 미검증이다(G1) |
| D4.1 | DO 출력에 새 손실 encode를 넣지 않는 선택지(D4-a. D1-a에서는 D4.2와 무관하게, D1-b에서는 D4.2가 channels 보존일 때만 D4-b와 같다) | JPEG 출력은 DO에 재압축 손상을 더해 조건 의미를 바꾸고 CB와의 구분을 약하게 한다 | D4-a는 PNG encoder 적합성(X9)과 X5에 걸린다. clean이 JPEG면 DO만 format이 달라진다 |
| D2.1, D2.3–D2.5, D2.7 | 권고 없음(근거 부족) | quality와 목표 수치를 뒷받침하는 저장소 근거가 없다. A-cap 가정에서 목표를 1536 이하로 두면(후보값과 같은 경우 포함) DO와 CB에서 §7의 resize 단계 identity가 생긴다. 후보값과 다르게 두면 L49의 "preset"이 가리키는 대상을 밝혀야 한다. 저장소의 산술 예제는 어느 목표에도 검증된 효과를 주지 않는다. 어느 쪽이 나은지 가를 측정이 없다 | 해당 없음 |
| D3.1–D3.4b | 권고 없음(근거 부족) | 선택지가 프로토콜 문구의 읽기 차이이고, 어느 읽기가 의도인지 가를 원문이 없다 | 해당 없음 |
| D4.2, D4.3, D4.4 | 권고 없음(근거 부족) | alpha 처리와 DO의 JPEG quality에 관한 근거가 없다. D4.4는 DO 출력이 JPEG일 때만 쓰이는 조건부 필드다. D2 프로필에 적용한 판단 근거(현행 계약이 받는 유일한 JPEG 프로필)는 여기에도 해당하지만 이 메모는 별도 권고로 올리지 않았다 | 해당 없음 |
| 결정 순서 | §4의 순서 | 앞 결정이 뒤 결정의 선택지 수를 줄인다 | 순서를 바꿔도 결과는 같으나 중복 검토가 는다 |

## 10. D1–D4 밖 잔여 결정과 목적별 예비 결정 집합

| ID | 잔여 결정 [검증 필요] | 첫 연산 순서에 주는 영향 |
| --- | --- | --- |
| X1 | B가 crop을 하는지 | B의 crop 행(O1–O3)이 전부 미정이다. crop의 arm 커버리지가 정해지지 않는다. B의 JPEG decode가 O3과 O4 중 어디에 귀속되는지도 여기에 달린다(§6.3) |
| X2 | crop 출력과 resize-only 출력의 format, JPEG면 그 quality | crop이나 resize를 먼저 하더라도 출력 encoder가 무엇인지 정해지지 않는다. O7–O10 미정의 주 원인이다 |
| X3 | 후보 pool의 구성과 실제 slot 선택(1536→q75가 독립 후보인지, 무변환 후보가 있는지, 제안 pool의 일부만 쓰는지, selector 규칙, tie break). 이 메모의 표는 제안 pool 전체를 가정한다 | C/D의 조건부 셀이 실제로 얼마나 쓰이는지 알 수 없다. calibration에서 정해진다([프로토콜](./image-first-evaluation-protocol.md) L94–96) |
| X4 | no-op 정책(full-frame crop, identity resize 때 bytes를 유지할지. [Task 29 분석](./image-transform-provenance-gap.md) §4.2 L136–149) | 실제 호출 여부와 §7의 bytes 동일성에 걸린다. §6.5의 규칙 수준 분류는 바꾸지 않는다 |
| X5 | PNG canonical, DO의 PNG 출력, §4.2 선택지 C가 같은 preset·encoder 옵션인지(Task 29 분석 L90, L246) | PNG encoder를 하나로 검증할지 여럿으로 할지를 가른다 |
| X6 | alpha 처리 방식(RGBA → JPEG, RGBA → RGB) | D1-b, D1-d에서 JPEG 관련 연산의 선행 조건이다 |
| X7 | clean 원천의 생성 경로(P0), K-y 재인코딩 입력인 원천의 format과 이력(P2), stress variant의 파생 경로(P1) | 조건 준비 표의 전제다 |
| X8 | resize 필터와 반올림 규칙([Task 29 분석](./image-transform-provenance-gap.md) L100. [토큰·비용](./image-token-cost-models.md) L16의 반올림은 산술용 후보 정책이다) | resize를 먼저 할 때의 검증 범위를 정한다 |
| X9 | encoder 선택, 프로필 적합성과 결정성 검증, 자원 예산, writer 전략, manifest([Task 29 분석](./image-transform-provenance-gap.md) §8 L247–250의 gate 2–5) | 어떤 연산이든 구현 진입 전 조건이다 |
| X10 | clean 치수 분포(사실 미상) | resize의 실제 적용 빈도, §7의 조건 겹침, clean 치수를 유지하는 JPEG variant의 accounting 상한 통과 여부(G1)를 정한다 |

**첫 연산 순서 판단을 위한 목적별 예비 결정 집합 (승인 전 권고, 근거 범위에 한정).**

아래는 이 메모의 표에서 연산 후보의 커버리지 분류를 바꾸는 결정을 목적별로 묶은 예비 목록이다. 수학적 최소 집합임을 증명하지 않았고, 충분한 집합임도 입증하지 않았다. 괄호 안은 그 결정이 바꾸는 행이다.

- D1, D4.1, D4.2 (O1, O2의 적용 가능 여부. F3a, F4, F6에서는 RGB PNG crop이 어디에도 쓰이지 않는다)
- D3.1, D3.2 (O5–O8의 arm 커버리지)
- D3.3 (E가 crop 외 연산을 요구하는지)
- X1, X2 (B의 crop, 그리고 모든 crop·resize의 출력 encoder)
- D3.4b K (CL 준비의 O9와 O10. K-y이면 일반 PNG encode와 PNG canonical이 CL 준비에서 필요해진다, §6.4)
- D3.4a PC (arm의 O10 커버리지, §6.5)
- X5 (DO의 PNG 출력, crop의 PNG 출력, PNG canonical을 한 encoder 설정으로 볼지. O10의 DO 준비 칸)

다음은 조건이 맞을 때 더 필요한 결정이다.

- X4 (identity resize와 full-frame crop의 no-op 정책. 실제 호출 여부와 bytes 동일성. 규칙 수준 분류는 바꾸지 않는다)
- X7 (clean 원천의 생성 경로와 이력. K-y의 원천 decode, K-n의 P0, D1-a의 native clean 조건)
- X9 (encoder 선택과 적합성. 어떤 순서에도 선행한다)
- D2의 JPEG 프로필 (JPEG 관련 연산을 먼저 볼 때의 ingest 가능성)
- X6 (RGBA가 포함되는 D1-b, D1-d에서의 alpha 처리)
- D2의 수치 (조건 준비에서 정확 preset 행 O6, O8의 커버리지만 바꾼다)

D3.4a와 D3.4b는 PNG encode와 PNG canonical의 커버리지를 바꾸므로 목록에 넣었다. PNG 계열 연산을 후보에서 뺄 때에만 미룰 수 있다. D2의 수치는 일반 resize와 일반 JPEG encode의 존재를 바꾸지 않는다.

이 예비 목록에 넣지 않은 결정과 그 이유는 다음과 같다. 표에서 읽은 판단이며 증명이 아니다.

- X3: 규칙 수준 분류에서는 C/D의 조건부 칸으로 이미 드러나 있고, 실제 선택 빈도는 calibration에서 정해진다. 다만 제안 pool의 구성이 바뀌면 s = set 행을 다시 읽어야 한다.
- X8: resize의 검증 범위를 바꾸지만 이 메모의 커버리지 분류는 바꾸지 않는다.
- X10: 실제 호출 빈도, 조건 겹침, accounting 상한 통과 여부를 바꾸지만 규칙 수준 분류는 바꾸지 않는다. 선택이 아니라 사실 조사 대상이다.
- D4.3, D4.4: DO 출력이 JPEG일 때만 쓰인다. D4.3은 DO 준비의 O8 한 칸만, D4.4는 ingest 가능성만 바꾼다.
- D2.7: 값의 배정 정책이며 overlay 패턴의 허용 범위만 정한다. 분류는 D2 수치로 읽는다.

뺐다고 해서 순서 판단과 무관하다는 뜻은 아니다. X10과 D4.4는 JPEG 관련 연산의 실현 가능성에 직접 걸린다.

한계는 다음과 같다.

- 이 목록은 "이 메모의 10개 연산 행과 분류 기준"에 한정된 예비 목록이다. 최소라는 것도, 순서 판단에 충분하다는 것도 입증되지 않았다. X9(codec 적합성, 자원, writer)는 커버리지와 무관하게 어떤 순서에도 선행한다.
- D1–D4를 모두 골라도 첫 연산 순서는 자동으로 정해지지 않는다. X1과 X2가 남고, 순서 자체는 [Task 29 분석](./image-transform-provenance-gap.md) §8 gate 1의 사용자 결정이다.

## 11. 결정 표

- D2.7의 선택은 D2.1, D2.3–D2.5의 값과 모순되지 않아야 한다. D2-a나 D2-b를 고르면 그 제약에 맞지 않는 개별 값은 무효다. D2-c는 독립 배정 정책이므로 값이 서로 같거나 후보값과 같아도 된다.
- D2.3과 D2.4의 「긴 변 1536」과 「다른 값」은 stress 목표를 긴 변 상한으로 적는다는 제안 가정(A-cap, §3.0 G3) 위의 표기다.
- D3.2의 S-set은 이 메모가 제안한 후보 pool 전체를 가정한다. pool의 일부만 쓰는 선택은 이 표에 필드가 없고 X3으로 남는다.
- D4.2는 D4-a일 때만, D4.3과 D4.4는 DO 출력이 JPEG일 때만(D4-c, 또는 clean이 JPEG인 D4-b) 채운다.

| 항목 | 선택지 | 승인 전 권고 | 사용자 결정 |
| --- | --- | --- | --- |
| D1 clean format/channels | D1-a 제한 RGB PNG / D1-b 제한 RGBA PNG / D1-c 제한 JPEG / D1-d family별 원본 format 유지 | 승인 전 권고: D1-a(원천이 native clean일 때. 이력 미상은 X7) | |
| D2.1 JPEG-only quality | 75(후보값과 동일) / 다른 값(수치 사용자 결정 필요) | 권고 없음(근거 부족) | |
| D2.2 JPEG-only JPEG 프로필 | P-in 현행 제한 ingest 프로필 / P-out 프로필 밖(사양 사용자 결정 필요) | 승인 전 권고: P-in | |
| D2.3 downscale-only 목표 치수 | 긴 변 1536(후보값과 동일) / 다른 값(수치 사용자 결정 필요) | 권고 없음(근거 부족) | |
| D2.4 combined 목표 치수 | 긴 변 1536(후보값과 동일) / 다른 값(수치 사용자 결정 필요) | 권고 없음(근거 부족) | |
| D2.5 combined quality | 75(후보값과 동일) / 다른 값(수치 사용자 결정 필요) | 권고 없음(근거 부족) | |
| D2.6 combined JPEG 프로필 | P-in / P-out | 승인 전 권고: P-in | |
| D2.7 조건 사이 동일값 여부(D2.1, D2.3–D2.5에 대한 제약) | D2-a 전 조건 후보값과 동일(D2.1 = D2.5 = 75, D2.3 = D2.4 = 1536) / D2-b 조건 공통·후보와 다름(D2.1 = D2.5, D2.3 = D2.4, 하나 이상이 후보값과 다름) / D2-c 조건별 독립 배정(값이 같아져도 됨) | 권고 없음(근거 부족) | |
| D3.1 B 변환 구성 | B-rc 1536 후 q75 / B-r 1536만 / B-c q75만 | 권고 없음(근거 부족) | |
| D3.2 C/D 후보 집합 | S-same B와 같은 단일 출력 변환 / S-set 후보 집합에서 slot별 선택 | 권고 없음(근거 부족) | |
| D3.3 E 출력 처리 | E-crop oracle crop만 / E-same crop 뒤 B와 같은 변환 | 권고 없음(근거 부족) | |
| D3.4a PNG canonical의 arm 내 쓰임 | PC-cand 후보 집합 구성원으로만 / PC-out 변환이 만든 PNG 출력의 정규화(A와 D의 fallback 제외) | 권고 없음(근거 부족) | |
| D3.4b PNG canonical의 clean 생성 사용 | K-y 사용(D1-c와 모순) / K-n 원천 그대로 | 권고 없음(근거 부족) | |
| D4.1 downscale-only 출력 format | D4-a 제한 PNG / D4-b 입력 format 유지 / D4-c 제한 JPEG | 승인 전 권고: D4-a (D1-a에서는 D4.2와 무관하게, D1-b에서는 channels 보존일 때만 D4-b와 같음) | |
| D4.2 downscale-only channels (D4-a일 때) | 입력 channels 보존 / RGB로 통일(alpha 처리 미정) | 권고 없음(근거 부족) | |
| D4.3 downscale-only JPEG quality (출력이 JPEG일 때) | combined와 동일(D2.5를 따름) / 독립 값(75 또는 다른 값, 수치 사용자 결정 필요) | 권고 없음(근거 부족) | |
| D4.4 downscale-only JPEG 프로필 (출력이 JPEG일 때) | P-in / P-out(사양 사용자 결정 필요) | 권고 없음(근거 부족) | |
