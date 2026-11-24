# 8비트 회색조 PNG 입력 정책 결정안

> **상태:** 정책 제안(Tier D). 구현 지시가 아니다. 사용자가 결정하고 별도 구현 요청서가 나온 뒤에만 구현한다.

- 기준: `origin/main` `7f11973`(#141 merge). 아래 줄 번호는 모두 이 커밋 기준이다. 구현할 때는 줄 번호보다 심볼 이름을 따른다
- 근거: [#141](https://github.com/kimcheolhui9846/token-context-optimizer/pull/141), [`research/results/mcp-view-comparison/RESULTS.md`](../../../research/results/mcp-view-comparison/RESULTS.md), [PNG 제3판](https://www.w3.org/TR/png-3/)
- 이 문서는 **기존 관찰**(§1, §2)과 **미래 수용 기준**(§4 이후)을 나눠 적는다. 미래 기준은 아직 어떤 코드로도 확인되지 않았다

## 0. 사용자 결정 요청

> **명시적 `profile: "tolerant"` 요청에서만 정적·비인터레이스·불투명 8비트 회색조 PNG(color type 0)를 새 반환 프로필 `png-gray8-tolerant-v1`로 받는 구현 Task를 이 결정안대로 진행할지 결정해 주십시오.**

권장: **승인**(§3 안 C). 승인하지 않으면 현행 거부(안 A)가 유지된다.

## 1. 기존 관찰 (#141, 측정된 사실)

- R09 원본 48장(PNG, 8비트, color type 0)은 strict·tolerant 모두 `index_image_artifact`에서 `unsupported_png_profile`로 거부되었다. 6셀 × 48 = 288행이다(RESULTS §1)
- 픽셀이 같은 무메타데이터 RGB 파생본(IHDR·IDAT·IEND만, R=G=B)은 두 프로필 모두 48/48 수락되었다. strict는 `png-rgb8-static-v1`, tolerant는 `png-rgb8-tolerant-v1`, `ignoredChunks: []`이다
- 전체 영역 `crop_image_artifact`는 인코딩 없이 `status: "original"`과 원본 참조를 돌려주었다. 호출자가 그 경로를 실제로 열어 기대 SHA와 대조했고 96/96 일치했다
- 개요(512)와 부분 영역 결과, 포함률은 **RGB 파생본**에 대한 측정이다. 회색조 원본을 직접 받는 제품 경로는 존재하지 않으므로, 이 결정이 #141의 포함률·OCR·논문 결과를 개선하는지는 **미측정**이다

## 2. 현행 동작 (소스 직접 확인)

| 항목 | 위치 | 현행 동작 |
|---|---|---|
| 한도 | `src/core/image-artifacts.ts:12-14` | 10 MiB, 한 축 8192, 16,777,216 픽셀 |
| strict PNG IHDR | `image-artifacts.ts:259` | 비트깊이 8, color type 2·6, 압축·필터·인터레이스 0만 허용. 그 밖은 `unsupported_png_profile`. 치수 검사(`image_dimensions_exceeded`)가 프로필 검사보다 먼저다 |
| strict 부가 청크 | `validatePng`, `image-artifacts.ts:232` | IHDR·IDAT·IEND 밖의 청크는 모두 `unsupported_png_profile` |
| tolerant PNG IHDR | `image-artifacts.ts:316` | strict와 같은 조건. 그래서 회색조는 tolerant에서도 거부된다 |
| tolerant 부가 청크 | `image-artifacts.ts:327-330` | 부가(소문자 첫 글자) 청크는 종류별 첫 등장만 `ignoredChunks`에 기록, 32종 초과는 거부. 핵심 청크·PLTE·tRNS·acTL·fcTL·fdAT는 거부. IDAT 뒤 부가 청크가 오면 이후 IDAT는 `malformed_png` |
| 구조 검사 | `image-artifacts.ts:280, 286, 337, 339` | 청크 길이·타입 문자·CRC, IHDR 길이 13, IDAT 연속성, IEND 길이 0·파일 끝, 팽창 길이 정확 일치(`maxOutputLength`), 압축 스트림 전부 소비(`bytesWritten`), 행 필터 ≤ 4. 위반은 `malformed_png` |
| 디코드 | `validatePngTolerant` | 신호·IHDR·IDAT·IEND만 이어 fast-png 8.0.0으로 디코드. 부가 청크 내용은 해석하지 않는다 |
| 색 관리 | 같은 함수 | iCCP·sRGB·gAMA·cHRM은 적용하지 않고 저장된 샘플 값을 그대로 쓴다 |
| 식별자 | `image-artifacts.ts:15, 67` | `sha256(path \0 sha256)`. 실제 프로필이 strict 집합(`STRICT_PROFILES`)이 아니면 `\0<validationProfile>`을 덧붙인다. `artifactId = image_<앞 16자>` |
| 레코드 타입 | `src/core/types.ts:22-56` | PNG `channels: 3 \| 4`, JPEG `channels: 3`. 네 프로필 판별 유니온 |
| 저장소 | `MemoryImageArtifactStore`, `image-artifacts.ts:32` | 프로세스 메모리 Map, put/get에서 복제. **디스크 영속화 없음**. 서버를 다시 시작하면 레코드가 사라진다 |
| inspect 재검증 | `inspectImageArtifact` :91-114 | 경로 재인가 → 원본 바이트 SHA·길이 대조(불일치 `source_changed`) → 레코드의 실제 프로필로 다시 검사. 레코드 필드와 다시 계산한 메타데이터의 대조(`recordMetadataMatches` :204)는 **tolerant 프로필에서만** 한다(:106, `isTolerantProfile` :148). strict 레코드는 재검사 통과만 보며, 손상된 strict 레코드의 `width`·`channels` 같은 필드는 inspect에서 대조하지 않는다 |
| 픽셀 경로 재검증 | `readValidatedImageArtifact` :152-177 (crop·overview가 사용) | 같은 재인가·SHA 대조 뒤 픽셀까지 디코드하고, 모든 프로필에서 `width`·`height`·`channels`·`format`·`mimeType`·`validationProfile`과 `pixels.length = width × height × channels`(:168)를 대조한다. tolerant이면 메타데이터도 대조한다. 불일치는 `decode_failed` |
| 다른 프로필 필드 | `validateForRecord` :180 (inspect·픽셀 경로 공통) | 프로필에 속하지 않는 tolerant 필드가 레코드에 있으면 `decode_failed` |
| 전체 영역 | `src/core/image-crop.ts:27` | 재검증 뒤 인코딩 없이 `status: "original"`, `fullFrame: true`, 원본 레코드 반환 |
| 부분 영역 | `image-crop.ts:28-42` | 한 변 1536 초과는 `resize_required`. RGB(A)를 RGBA 작업 버퍼로 옮겨 jpeg-js 0.4.4 품질 75로 인코딩, strict JPEG 검사로 출력 검증 |
| 개요 | `src/core/image-overview.ts:19, 69-85` | `areaAverageRgba(pixels, W, H, channels: 3 \| 4, w, h)`가 채널 0–2를 읽는다. maxSide 64–1536, 기본 512. 품질 75 JPEG |
| MCP 출력 스키마 | `src/server/index.ts:168-193` | `imageOutputSchema`는 네 객체의 유니온. `validationProfile`은 literal, PNG `channels`는 3·4 literal. crop·overview의 `source`도 같은 스키마(:226-230, :262) |
| MCP 입력 | `src/server/index.ts:199` | `profile: "strict" \| "tolerant"`, 생략하면 strict |
| MCP 오류 | `tests/image-crop-mcp.test.ts:371-372` | 거부는 `isError: true`, 본문에 오류 코드 문자열 |

## 3. 대안 평가

| 안 | 내용 | 장점 | 단점 | 판정 |
|---|---|---|---|---|
| A. 현행 거부 유지 | 변경 없음 | 위험 0, 계약 불변 | 흑백 스캔·문서 캡처는 호출자가 직접 바꿔야 한다. #141 48/48 거부가 그대로 | 결정을 미룰 때의 기본값 |
| B. 호출자 측 RGB 변환 안내 | 문서에 변환 방법만 추가 | 제품 변경 없음 | 등록되는 원본이 **변환본**이다. 경로·SHA가 원래 파일을 가리키지 않아 출처 추적이 끊긴다. 비압축 샘플 데이터는 8비트 RGB가 회색조의 3배다(행마다 붙는 필터 바이트 제외). 인코딩된 PNG 파일 크기와 10 MiB 통과 여부는 내용·필터·압축·메타데이터에 따라 달라 일정한 배수로 말할 수 없다. 변환 도구에 따라 부가 청크·색 정보가 바뀐다 | 차선. 안 C를 거절할 때의 안내로만 |
| **C. tolerant에서만 gray8 수락 (권장)** | 새 프로필 `png-gray8-tolerant-v1` | 원래 파일의 경로·SHA가 그대로 원본이다. strict 기본과 기존 식별자·반환값이 바뀌지 않는다. 부분 보기·개요는 R=G=B 통제본과 같은 출력을 목표로 할 수 있다(§7) | 새 반환 형태가 생겨 출력 스키마를 고정한 소비자에 영향(§5.3). 구현·테스트 비용 | **권장** |
| D. strict에서도 수락 | 기본 계약 확장 | 호출이 단순 | 기본 strict 계약과 기존 "strict는 RGB만" 문서·테스트를 바꾼다 | 기각 |

## 4. 권장안의 수용 범위 (미래 기준)

다음을 **모두** 만족할 때만 `profile: "tolerant"`에서 받는다. 하나라도 어기면 현행 오류 코드를 그대로 쓴다.

| 조건 | 수락 값 | 어길 때 |
|---|---|---|
| IHDR color type | 0(회색조) | 2·6은 기존 RGB tolerant 경로. 3(팔레트)·4(회색조+알파)는 `unsupported_png_profile` |
| 비트깊이 | 8 | 1·2·4·16은 `unsupported_png_profile` |
| 압축·필터 방법 | 0·0 | `unsupported_png_profile`(현행과 같음) |
| 인터레이스 | 0 | Adam7(1)은 `unsupported_png_profile` |
| 투명도 | tRNS 없음 | tRNS(회색 키 투명)는 `unsupported_png_profile`(현행 tolerant와 같은 규칙) |
| 정적 이미지 | acTL·fcTL·fdAT 없음 | `unsupported_png_profile` |
| PLTE | 없음 | `unsupported_png_profile`. PNG 규격상 color type 0에는 PLTE가 나오면 안 된다. 구조 오류(`malformed_png`)로 바꾸지 않고 현행 tolerant 코드를 유지한다 |
| 부가 청크 | 현행 tolerant 규칙 그대로(종류 32 상한, CRC 검사, 내용 미해석) | 현행 코드 |

- strict 요청의 회색조는 계속 `unsupported_png_profile`이다
- `alpha`는 color type 0에 알파 채널이 없고 tRNS도 거부하므로 항상 `"none"`이다. 이 프로필에 `"opaque"`·`"present"`는 나오지 않는다

## 5. 반환 계약

### 5.1 레코드

```text
format: "png", mimeType: "image/png", bitDepth: 8,
channels: 1,
validationProfile: "png-gray8-tolerant-v1",
ignoredChunks: string[],      // 현행 tolerant와 같은 규칙과 순서
alpha: "none",
path: 원본의 정규 경로, sha256·byteLength: 원본 파일 바이트 전체 기준
```

- `channels: 1`은 **원본 샘플 수**다. 부분 보기·개요의 작업 버퍼가 RGB라는 사실과 섞지 않는다
- `sha256`은 부가 청크를 포함한 원본 파일 바이트 전체의 해시다. 재인코딩한 파일을 원본으로 등록하지 않는다

### 5.2 식별자

- 현행 규칙을 그대로 쓴다: `png-gray8-tolerant-v1`은 strict 집합에 없으므로 `sha256(path \0 sha256 \0 png-gray8-tolerant-v1)`
- 같은 파일을 tolerant로 다시 색인하면 같은 ID다
- 기존 RGB·RGBA·JPEG 입력은 회색조 프로필로 판정될 수 없으므로 **기존 ID가 하나도 바뀌지 않는다**. 같은 픽셀의 R=G=B 통제본은 파일 바이트가 달라 ID도 다르다

### 5.3 호환성

- strict 기본, 기존 RGB/RGBA PNG·JPEG의 호출 인자, 식별자, 반환 필드, 오류 코드는 바뀌지 않는다. 현재 성공하는 모든 입력은 같은 결과를 낸다
- 새 형태가 나오는 입력은 지금 `unsupported_png_profile`로 실패하는 tolerant 회색조뿐이다
- `imageOutputSchema`에 다섯 번째 유니온 객체를 **추가**한다: `channels: z.literal(1)`, `validationProfile: z.literal("png-gray8-tolerant-v1")`, `alpha: z.literal("none")`, `ignoredChunks: z.array(z.string())`. 기존 네 객체는 고치지 않는다(기존 PNG 객체의 `channels: 3 | 4`에 1을 넣지 않는다)
- 출력 스키마를 고정한 소비자에 대한 영향:
  - 예전 `tools/list` 스키마를 캐시해 검증하는 클라이언트, `validationProfile`을 빠짐없이 분기하는 코드, `channels ∈ {3, 4}`를 가정하는 코드는 새 레코드를 거부하거나 잘못 처리할 수 있다
  - 그 영향은 이전에 오류였던 입력에만 생긴다. 하지만 "tolerant 요청은 실패 아니면 기존 네 형태"라고 가정한 소비자에게는 계약 변경이다. 릴리스 문서에 추가 형태로 명시한다
  - crop·overview의 `source`도 같은 스키마를 쓰므로 함께 바뀐다
- `profile` 입력 열거형은 바꾸지 않는다. 새 요청 값(`"tolerant-gray"` 등)을 만들지 않는다

## 6. 재열기·재검증·원본 교체

- 재검증은 §2의 두 경로를 그대로 쓴다. 바꿀 곳과 필드를 아래로 한정한다
  - `isTolerantProfile`(:148): `png-gray8-tolerant-v1`을 tolerant로 포함한다. 그래서 inspect(:106)와 픽셀 경로(:169)가 회색조 레코드의 메타데이터를 대조한다
  - `validateForRecord`(:180): 회색조 프로필이면 회색조 검사기만 쓴다. 이 프로필에 대한 다른 프로필 필드는 JPEG 전용 필드(`coding`·`sampling`·`ignoredSegments`·`exifOrientation`)다
  - `recordMetadataMatches`(:204): 회색조 레코드에서 `width`·`height`·`channels: 1`·`bitDepth: 8`·`format`·`mimeType`·`validationProfile`·`ignoredChunks`(순서 포함)·`alpha: "none"`을 대조한다. 하나라도 다르면 `decode_failed`
- 결과: 회색조 레코드는 inspect와 픽셀 경로 **모두**에서 위 필드가 대조된다
- strict 레코드에는 새 요구를 만들지 않는다. strict inspect가 손상된 strict 레코드의 필드를 대조하지 않는 현행 동작은 그대로 두며, 이 결정의 판정 대상도 아니다
- RGB 프로필 레코드에 `channels: 1`을 넣은 변조는 현행 픽셀 경로(crop·overview)의 `channels`·`pixels.length` 대조에서 `decode_failed`다. inspect에서의 결과도 현행 그대로다(strict는 대조 없음, `png-rgb8-tolerant-v1`은 메타데이터 대조로 `decode_failed`)
- 원본을 다른 바이트로 바꾸면(R=G=B 통제본으로 바꾸는 경우 포함) `source_changed`. 같은 바이트면 그대로 통과한다
- 저장소는 메모리뿐이다. "오래된 레코드"는 (a) 같은 프로세스에서 이 변경 전 형태로 만든 RGB·JPEG 레코드, (b) 저장소에 직접 넣은 손상·변조 레코드를 뜻한다. (a)는 기존 검사 경로를 그대로 통과해야 한다. (b) 가운데 회색조 레코드의 변조는 위 대조로 `decode_failed`여야 하고, 기존 프로필 레코드의 변조는 현행과 같은 결과여야 한다. 프로세스를 다시 시작하면 다시 색인해야 한다는 현행 성질은 바뀌지 않는다

## 7. 보기 경로

| 경로 | 동작 |
|---|---|
| 전체 영역 crop | 현행 규약 그대로. 재검증 뒤 인코딩 없이 `status: "original"`, `fullFrame: true`, 원본 참조. MCP `content`에 이미지 항목이 **없다**. 판정 테스트는 반환된 `source.path`를 **실제로 열어** 그 바이트의 SHA가 `source.sha256`, 그리고 따로 알고 있는 원본 회색조 SHA와 같은지 확인한다 |
| 부분 crop | 회색 샘플 g를 중립 RGB (g, g, g)로 작업 버퍼에 옮겨 현행처럼 jpeg-js 0.4.4 품질 75로 인코딩하고 strict JPEG 검사로 출력 검증. 1536 초과는 `resize_required` |
| 개요 | 면적 평균을 회색 1채널에서 계산하고 결과를 (v, v, v)로 쓴다. 정수 반올림식은 현행과 같다 |

- **비교 기준:** 메타데이터 없는 R=G=B 통제본(IHDR·IDAT·IEND만, 각 채널이 원본 회색면과 같음)을 같은 좌표·크기·인코더·품질로 처리한 출력과 비교한다
  - 수용 기준: 부분 crop과 개요의 출력 JPEG 바이트 SHA-256과 크기가 통제본 출력과 **같다**. 작업 버퍼가 같고 jpeg-js가 결정적이라는 가정에 기댄다. 다르면 구현이 RGB 경로와 어긋난 것으로 보고 FAIL
  - `source` 필드(프로필, channels, sha256, artifactId)는 당연히 다르다
- **소비자가 실제로 받는 바이트로 판정한다.** `structuredContent.output.sha256`끼리 비교하는 것만으로는 본문 누락이나 잘못된 본문을 잡지 못한다. 부분 crop·개요의 MCP 응답마다 다음을 모두 확인한다
  1. `content`에 `type: "image"` 항목이 정확히 하나 있고 `mimeType`이 `image/jpeg`다
  2. 그 `data`(base64)를 바이트로 풀어 계산한 SHA-256과 길이가 `structuredContent.output.sha256`·`byteLength`와 같다
  3. 그 바이트를 독립 디코더로 디코드한 치수가 `output.width`·`height`와 같다
  4. 그 바이트가 R=G=B 통제본에 같은 호출을 해서 받은 **실제 `content` 바이트**와 같다(SHA·길이)
  - 참고 구현: #141 실행기 `research/src/mcp-view-comparison-paths.mjs`의 `decodeJpeg`(:10-21)와 본문 대조(:73-79, :123-125), 원본 참조를 실제로 여는 `verifyOriginalRef`(`research/src/mcp-view-comparison-lib.mjs:231`)
  - #141 실행기는 본문 SHA를 `output.sha256`과만 대조했다. `byteLength` 대조와 통제본 본문 대조는 이번에 더하는 기준이다
- **약속하지 않는 것:** JPEG 출력에서 원본 회색 샘플을 무손실로 되살릴 수 있다는 약속. 파생 JPEG를 원본으로 등록하는 일

## 8. 보존할 기준

- 구조 검사와 오류 의미는 §2 표의 현행 tolerant와 같다: 길이·타입 문자·CRC·IHDR 13바이트·IDAT 연속성·IEND 위치(`malformed_png`), 팽창 길이 정확 일치와 스트림 전부 소비(`malformed_png`), 행 필터 ≤ 4(`malformed_png`), 치수 검사(`image_dimensions_exceeded`)가 프로필 검사보다 먼저, 10 MiB(`encoded_size_exceeded`)
- 기대 팽창 길이는 `(width × 1 + 1) × height`다. RGB 식에 channels=1을 넣은 값과 같다
- 부가 청크: CRC는 검사하고 내용은 해석하지 않는다. 종류 32 상한, 첫 등장 순서 기록을 유지한다
- **색 관리:** gAMA·sRGB·iCCP·cHRM·sBIT는 무시하고 `ignoredChunks`에 남긴다. 저장된 샘플 값을 그대로 R=G=B로 쓴다
  - 표시 한계: 감마나 회색 ICC 프로필이 있는 원본은 색 관리 뷰어와 밝기가 다르게 보일 수 있다. 파생 JPEG는 색 정보 없이 나가므로 받는 쪽은 보통 sRGB로 해석한다. 문서에 적는다
- **제외:** tRNS, 회색조+알파(color type 4), 팔레트(3), 1·2·4·16비트, 인터레이스, APNG. 모두 `unsupported_png_profile`
- **메모리:**
  - 원본 디코드 버퍼는 픽셀당 1바이트, 최대 16 MiB(16,777,216 바이트). 현행 RGB 최대 48 MiB보다 작다. 팽창 버퍼는 `(W + 1) × H`
  - 원본 전체를 RGB로 확장한 사본을 만들지 않는다. 확장은 부분 crop·개요의 작업 버퍼에서만 한다
  - 작업 버퍼: 부분 crop RGBA는 최대 1536 × 1536 × 4(약 9 MiB), 개요 RGBA는 최대 1536 × 1536 × 4와 행 누적 배열. 현행과 같은 상한이다
  - 이 수치는 버퍼 크기 계산이다. 실측 메모리가 아니다

## 9. 구현 판정 목록 (미래 수용 기준)

### 양성

- P1. tolerant + 무메타데이터 gray8 → `png-gray8-tolerant-v1`, `channels: 1`, `alpha: "none"`, `ignoredChunks: []`, `bitDepth: 8`, 원본 경로·원본 바이트 SHA
- P2. tolerant + 부가 청크가 든 gray8 → 수락, `ignoredChunks` 첫 등장 순서. 보통 함께 쓰지 않는 색 청크는 입력을 나눈다([PNG 제3판 iCCP](https://www.w3.org/TR/png-3/#11iCCP))
  - P2a. gAMA·pHYs·tEXt
  - P2b. sRGB만
  - P2c. iCCP만(내용은 해석하지 않으므로 CRC가 맞는 청크면 된다)
- P3. 같은 파일 두 번 색인 → 같은 `artifactId`, 기대 식별 문자열과 일치
- P4. inspect → 같은 레코드. 저장소 put/get 뒤에도 `ignoredChunks` 배열이 복제됨
- P5. 전체 영역 crop → `status: "original"`, `content`에 이미지 항목 없음, 반환 경로를 실제로 열어 SHA가 `source.sha256`·원본 SHA와 일치
- P6. 부분 crop(여러 좌표, 가장자리 포함)과 개요(기본 512, 64, 1536, 원본보다 큰 maxSide) → §7 본문 기준 1–4를 모두 만족(MCP `content`의 실제 JPEG 바이트로 MIME·치수·SHA·`byteLength`를 확인하고, R=G=B 통제본의 실제 본문과 같음)
- P7. 경계 수락. 단색처럼 압축이 잘 되어 10 MiB에 걸리지 않는 입력으로 축 조건과 총 픽셀 조건을 따로 확인한다
  - 축: 1×1, 8192×1, 1×8192
  - 총 픽셀: 4096×4096, 8192×2048(둘 다 16,777,216픽셀, 두 축 ≤ 8192)

### 음성

- N1. strict + gray8 → `unsupported_png_profile`(현행 유지)
- N2. tolerant + gray 1·2·4·16비트, color type 3·4, tRNS, PLTE, 인터레이스, acTL·fcTL·fdAT → `unsupported_png_profile`
- N3. gray8의 CRC 오류, 잘린 청크, 잘못된 필터 바이트, 팽창 길이 부족·초과, 압축 꼬리 바이트, IDAT 사이 부가 청크 → `malformed_png`
- N4. 크기 경계 거부. 압축이 잘 되는 입력으로 조건을 하나씩만 어긴다
  - 축만 초과: 8193×1, 1×8193 → `image_dimensions_exceeded`
  - 총 픽셀만 초과(두 축 ≤ 8192): 4096×4097(16,781,312픽셀) → `image_dimensions_exceeded`
  - 파일 크기만 초과: 치수는 한도 안이고 파일이 10 MiB보다 1바이트 이상 큼 → `encoded_size_exceeded`
- N5. 부가 청크 33종 → `unsupported_png_profile`
- N6. 색인 뒤 원본을 R=G=B 통제본 또는 다른 회색조로 교체 → inspect·crop·overview 모두 `source_changed`
- N7. 회색조 레코드 변조(`channels` 3, `alpha` 다른 값, `ignoredChunks` 다름·순서 다름, JPEG 필드 추가) → inspect·crop·overview 모두 `decode_failed`. 기존 프로필 레코드 변조의 결과는 현행과 같음(§6, strict inspect에 새 요구 없음)
- N8. 부분 영역 한 변 1537 → `resize_required`

### 회귀

- R1. 기존 RGB/RGBA PNG·JPEG의 strict·tolerant `artifactId`, 레코드, 오류 코드가 기준 커밋과 같음(기존 테스트 전부 통과)
- R2. #141의 RGB 동일성 검사를 회귀에 재사용: 같은 gray 원본에서 만든 R=G=B 통제본은 여전히 `png-rgb8-*`로 수락되고 ID가 그대로
- R3. MCP: tolerant gray8 색인이 다섯 번째 스키마로 `structuredContent` 검증을 통과. strict gray8는 `isError: true`와 `unsupported_png_profile`. crop·overview의 `source`가 새 형태로 검증됨
- R4. `tools/list`의 기존 네 출력 스키마 객체가 바뀌지 않음(추가만)
- R5. 패키징된 서버(`bin/token-context-optimizer.mjs`)를 실제 MCP 클라이언트로 띄워 네 도구를 모두 확인한다(`npm run smoke:mcp`와 패키징 테스트 확장)

  | 도구 | 확인 항목 |
  |---|---|
  | `index_image_artifact` | P1·P2(tolerant), N1(strict는 `isError: true`와 `unsupported_png_profile`), 다섯 번째 출력 스키마 통과 |
  | `inspect_image_artifact` | P4, N6, N7 |
  | `crop_image_artifact` | 전체 영역 P5(이미지 본문 없음, 참조를 열어 SHA 대조), 부분 영역 P6(본문 기준 1–4), N8 |
  | `overview_image_artifact` | P6(본문 기준 1–4) |
- R6. 저장소 검증 7단계 전부 통과
- R7. **원래 문제의 재확인(#141의 R09 원본 48장).** 이 결정이 #141에서 거부된 입력을 실제로 해결하는지 구현 단계에서 판정한다. 이 설계의 실측값이 아니며, 아직 실행하지 않았다
  1. 48장 원본을 다시 구하고, 파일마다 SHA-256을 #141의 동결 원본 SHA 표와 대조한다. 표는 #141 입력 폴더 `expected-sha.json`의 `original`이고, 그 표 자체는 `FROZEN_INPUTS.originalSha`(`research/src/mcp-view-comparison-lib.mjs:18-23`, `8caae29b…`)로 대조한다(실행기의 같은 대조: `research/src/mcp-view-comparison-run.mjs:37, 57`)
  2. 각 원본이 §4 수용 범위를 모두 만족하는지 확인한다(color type 0, 비트깊이 8, 인터레이스 0, tRNS·PLTE·APNG 청크 없음, 부가 청크 종류 ≤ 32, 크기 한도)
  3. 패키징된 서버에서 ID별로 strict와 tolerant를 모두 호출한다. strict는 48/48 `unsupported_png_profile`이다. tolerant는 범위 안의 모든 원본이 `png-gray8-tolerant-v1`이고, `sha256`이 동결 SHA와 같고, `artifactId`가 §5.2 식과 같다
  - 자료를 구할 수 없거나 다시 만든 파일의 SHA가 동결 SHA와 다르면 PASS가 아니라 **검증 미완료**로 기록한다
  - §4 범위를 벗어나는 원본이 있으면 ID와 이유(예: tRNS 있음)를 기록해 정책 결정권자에게 돌려준다. 그 원본을 받으려고 구현 단계에서 범위를 넓히지 않는다
- R8. 제품 문서와 도구 설명 갱신을 인수 기준에 넣는다: `docs/image-artifacts.md`(회색조 제외 문장 :37, 오류·보기 절), `skills/optimize-context/SKILL.md:48-49`, `src/server/index.ts`의 `index_image_artifact`(:198)·`crop_image_artifact`(:247)·`overview_image_artifact`(:290) 설명. 새 프로필과 추가 스키마(§5.3), 색 관리 무시와 표시 한계(§8)를 적는다

## 10. 미측정과 남은 위험

- #141의 포함률, OCR, 논문 수치에 대한 개선 효과는 **미측정**이다. 이 결정은 입력 수락 범위만 바꾼다
- 실제 R09 원본 48장이 이 조건(부가 청크 종류, tRNS 없음 등)을 모두 만족하는지는 이 Task에서 확인하지 않았다. 구현 단계의 R7에서 판정한다
- 인덱스·crop·overview의 시간과 메모리는 측정하지 않았다. §8 수치는 버퍼 계산이다. 성능 게이트가 필요하면 구현 요청서에서 정한다
- 이번 범위는 정책 제안이다. 구현·설치·Ready·merge는 각각 별도 결정이다
