# 이미지 도구 실사용성 사전 조사 (WBS 6.12, N-19)

- 작성: Claude Code, 2026-10-25. 기준 main `6e308c9`
- 성격: Codex 계획 PR의 입력 자료다. 설계를 확정하지 않으며, 제품 코드·테스트는 고치지 않았다
- 계기: 외부 감사 지시서(2026-10-25) Phase 4
  - 4.1 blind crop
  - 4.2 non-strict 입력
- Claude 검토(`codex_review/claude_directive-review_2026-10-25.md`)에서 정한 처리: "후보 등록, 계획 PR부터"

## 1. 요약

- **실제 스크린샷은 지금 하나도 받지 못한다.** 이 PC의 Windows 스크린샷 PNG는 78/78이 거부된다
  - 부가 chunk만 풀어도 해결되지 않는다. 78장 모두 RGBA여서 부분 crop이 `alpha_unsupported`로 다시 막힌다
  - 78장 모두 알파가 전부 255다. "완전 불투명 RGBA는 RGB로 본다"는 규칙 하나로 crop까지 열린다
- **디코더는 이미 더 넓게 읽는다.** 새 의존성 없이 범위를 넓힐 수 있다
  - `fast-png` 8.0.0: PLTE·tRNS·iCCP·tEXt·pHYs를 읽고 그 밖의 chunk는 건너뛴다
  - `jpeg-js` 0.4.4: progressive, 크로마 서브샘플링, APP1 EXIF(보관만 하고 회전하지 않음)를 처리한다
  - 지금의 제한은 우리 사전 검증기(strict profile)가 건 것이다
- **overview 도구는 연구 하네스에 근거가 있다.** 실험 3의 S2·S3은 crop과 함께 긴 변 512, detail low 썸네일을 줬다
  - 다만 썸네일만의 효과는 따로 재지 않았다
- 권장 순서
  1. 6.12a: PNG 허용 범위(부가 chunk + 불투명 RGBA)
  2. 6.12b: overview 도구
  3. 6.12c: JPEG 허용 범위
  - 각각 계획 PR → 구현 PR로 진행한다

## 2. 근거

### 2.1 이 PC의 이미지 구조 조사 (픽셀·파일명 미기록)

- 방법: 아래 폴더의 PNG·JPEG에서 다음 구조 정보만 셌다. 10 MiB 초과는 제외했다
  - PNG: chunk 종류와 IHDR
  - JPEG: SOF, 성분별 샘플링, APP 마커
- 판정은 현재 strict profile과 같은 조건으로 했다
  - PNG: IHDR·IDAT·IEND만 있음, 8-bit, RGB/RGBA, 비인터레이스
  - JPEG: SOF0, 3성분 1x1, APP0만 있음, restart 없음
- 저장소 폴더는 제외했다

| 폴더 | PNG | strict 통과 | 부가 chunk (장 수) | JPEG | strict 통과 |
|---|---:|---:|---|---:|---:|
| Pictures/Screenshots (Windows 캡처) | 78 | **0** | sRGB 78, gAMA 78, pHYs 78 | 0 | – |
| Desktop | 49 | 0 | pHYs 33, caBX 12, tEXt 8, sRGB 1, gAMA 1 | 6 | 3 |
| Downloads | 2 | 0 | caBX 1, sRGB 1, gAMA 1, pHYs 1 | 1 | 0 |
| Documents | 72 | 12 | sRGB 60 | 1 | 0 |
| **합계** | **201** | **12 (6.0%)** | | **8** | **3** |

- PNG 색 형식은 RGBA 160, RGB 37, 회색조 4다. 인터레이스와 16-bit는 0이다
- **Windows 스크린샷 78장은 모두 RGBA이고 알파가 전부 255였다**(fast-png로 디코드해 개수만 셈)
- JPEG 8장 중 4:2:0(2x2,1x1,1x1)이 5장, APP2(ICC)나 APP1·APP13이 있는 것이 4장, restart 마커가 2장이다
- 한계
  - 한 사람의 PC 표본이다. 모집단 비율로 일반화하지 않는다
  - Documents의 통과 12장은 출처를 모른다
  - 스크립트: scratch `imgscan.cjs`, `alphascan.mjs`. 결과 수치만 이 문서에 남긴다

### 2.2 현재 제품의 제한 위치
- PNG
  - `src/core/image-artifacts.ts:213-229`: IHDR·IDAT·IEND 외의 chunk는 `unsupported_png_profile`이다
  - `:217`: 8-bit, RGB/RGBA, 비인터레이스만 받는다
- JPEG
  - `src/core/jpeg-validation.ts:38`: APP0 JFIF가 필수다
  - `:55`: 성분 샘플링 `0x11`만 받는다
  - 자체 엔트로피 검사(`decodeEntropy`)도 1x1 MCU를 전제로 한다
- crop
  - `src/core/image-crop.ts:29`: 부분 crop에서 `channels === 4`면 `alpha_unsupported`다. 알파가 모두 255여도 막는다(`docs/image-artifacts.md:129-130`)
  - `:28`: 1536 초과 영역은 `resize_required`이고, 제품에는 resize가 없다
- overview: 없다. `crop_image_artifact` 설명이 "caller may use an overview it already has; this tool does not generate one"이다(`src/server/index.ts:231`)

### 2.3 의존성이 이미 하는 일 (node_modules에서 확인)
- `fast-png` 8.0.0 `lib/png_decoder.js:107-137`
  - IHDR·PLTE·IDAT·IEND·tRNS·iCCP·tEXt·pHYs를 처리하고, 그 밖의 chunk는 `default: this.skip(length)`로 건너뛴다
  - Adam7 인터레이스 helper가 있다
  - APNG chunk(acTL·fcTL·fdAT)는 별도 경로가 처리한다
- `jpeg-js` 0.4.4 `lib/decoder.js`
  - progressive(SOF2, `:730`), 성분별 h/v 샘플링(`maxH`/`maxV`, `:581-616`, `:744`), Adobe 변환(`:691`)을 처리한다
  - APP1 EXIF는 `exifBuffer`에 보관만 하고 방향(Orientation)은 적용하지 않는다(`:677` "TODO APP1 - Exif")
  - `maxResolutionInMP`·`maxMemoryUsageInMB` 옵션이 있다

## 3. 설계 질문과 선택지

### Q1. PNG 부가 chunk
| 안 | 내용 | 장점 | 위험 |
|---|---|---|---|
| **A (권장)** | 부가 chunk(종류 이름의 첫 글자가 소문자)를 건너뛴다. 단 `tRNS`(알파를 바꿈)와 APNG의 `acTL`·`fcTL`·`fdAT`(애니메이션)는 거부한다. 건너뛴 chunk 종류를 레코드의 `ignoredChunks`에 남긴다 | PNG 규격(부가 chunk는 무시 가능)과 맞는다. 처음 보는 chunk(caBX 같은 C2PA)에도 깨지지 않는다 | `iCCP`·`gAMA`·`cHRM`을 무시하면 색 해석이 원본 의도와 다를 수 있다. 이 사실을 문서와 레코드에 적는다 |
| B | 이름을 정한 허용 목록(sRGB, gAMA, cHRM, pHYs, tEXt/zTXt/iTXt, tIME, bKGD 등)만 건너뛴다 | 예측 가능하다 | 새 chunk가 나올 때마다 거부한다. 이미 caBX 13장이 있다 |
| C | 그대로 둔다 | – | 스크린샷 0% |

- 치명 chunk(첫 글자 대문자)는 지금처럼 IHDR·IDAT·IEND만 받는다
  - truecolor의 PLTE(권장 팔레트)를 받을지는 계획 PR에서 정한다
  - `fast-png`는 PLTE를 `decodePLTE`로 읽어 `_palette`에 둔다(`png_decoder.js:114-116,247`). truecolor 픽셀에 쓰이지 않는지 테스트로 확인한 뒤에 허용한다
- **디코더가 다시 읽는 부가 chunk의 위험**
  - 검증기가 부가 chunk를 통과시켜도 `fast-png`의 `decode`(`src/core/image-artifacts.ts:248`)는 iCCP·tEXt·pHYs를 직접 파싱한다
  - 특히 iCCP는 `unzlibSync(compressedProfile)`로 **크기 제한 없이 압축 해제**한다(`png_decoder.js:323-333`). 작은 파일로 큰 메모리를 쓰게 할 수 있다
  - 대응(계획 PR에서 택1)
    - 건너뛸 chunk를 디코더에 넘기기 전에 바이트에서 빼고 IDAT 경로만 넘긴다
    - 또는 iCCP를 거부한다
  - 앞의 방식이면 원본 `sha256`은 원본 전체 그대로이고, 디코드 입력만 줄어든다
- 레코드 `sha256`은 지금처럼 원본 바이트 전체의 해시다. chunk를 건너뛰어도 원본 추적성은 그대로다

### Q2. RGBA
| 안 | 내용 | 비고 |
|---|---|---|
| **A (권장)** | 디코드 뒤 알파가 모두 255면 RGB로 보고 crop을 허용한다. 하나라도 255가 아니면 지금처럼 `alpha_unsupported` | 손실이 없고 결정적이다. 스크린샷 78/78이 해당한다. 전체 알파 검사는 O(픽셀) 비용 |
| B | 흰 배경에 합성한다 | 반투명 이미지도 열린다. 픽셀이 바뀌므로 출처 기록에 합성 규칙을 남겨야 한다 |
| C | 그대로 둔다 | 스크린샷 crop 불가 |

### Q3. JPEG
- 대상: 4:2:0·4:2:2, APP1(EXIF)·APP2(ICC)·APP13, restart 마커, progressive
- 선택지
  - (A, 권장) 새 profile에서는 구조 검사(마커 경계, 표 참조, EOI)만 우리 코드가 하고, 엔트로피 디코드는 `jpeg-js`에 맡긴다
    - 메모리 추정식(`docs/image-artifacts.md:66-71`)은 서브샘플링을 반영해 다시 세운다
    - `maxMemoryUsageInMB`도 함께 건다
  - (B) 자체 엔트로피 검사를 서브샘플링까지 넓힌다. 결정성은 크지만 구현량이 많다
- EXIF 방향
  - 회전하지 않는다. 좌표는 저장된 픽셀 기준으로 둔다
  - 방향 값을 레코드에 `exifOrientation`으로 알린다. 휴대폰 사진에서 호출자가 오해하지 않게 하기 위해서다
  - 방향이 1이 아니면 거부하는 안도 있다. 사용자 결정 D2

### Q4. strict와 새 profile의 공존 (지시서 4.2의 "strict_deterministic 유지")
- 기존 profile ID(`png-rgb8-static-v1`, `jpeg-ycbcr8-baseline-444-v1`)와 그 거부 테스트는 그대로 둔다
- 새 profile ID를 따로 만든다(예: `png-rgb8-tolerant-v1`, `jpeg-ycbcr8-tolerant-v1`)
- 선택 방식
  - (A, 권장) `index_image_artifact`에 선택 인자 `profile: "strict" | "tolerant"`를 둔다. 기본값은 사용자 결정 D1
    - 기본이 strict면 기존 테스트·증거(task-22, task-33 등)가 바뀌지 않는다
    - 기본이 tolerant면 실사용성은 크지만 기존 거부 테스트를 strict 인자로 옮겨야 한다
  - (B) 서버 환경 변수로 정한다. 세션 단위라 호출마다 다르게 할 수 없다
- 어느 쪽이든 레코드의 `validationProfile`이 실제로 쓴 profile을 밝힌다

### Q5. overview (blind crop, 지시서 4.1)
- 새 도구 `overview_image_artifact`(이름은 계획 PR에서 정함)
  - 색인된 이미지를 긴 변 N(기본 512, 연구 하네스와 같음) 이하로 줄인다
  - q75 JPEG를 MCP image content로 돌려준다
  - structured content
    - 원본 치수
    - overview 치수
    - 배율(`scaleX`, `scaleY`)
    - 출처 해시
- 좌표 대응: 호출자는 overview 좌표에 배율을 곱해 원본 좌표로 crop을 요청한다
  - 선택 기능으로 원본 좌표 기준 격자선(예: 256 px 간격)을 overview에 그린다
  - 숫자 글자는 그리지 않는다. 글꼴 의존성이 생기기 때문이다
- 축소 알고리즘: 순수 JS 면적 평균(box)이다. 결정적이고 의존성이 없다
  - 메모리: 이미 crop에서 하는 전체 디코드에 overview 버퍼(512×512×4 = 1 MiB)가 더해진다
- 토큰
  - 긴 변 512이면 GPT-4o detail low 85 토큰이다(공개 회계식, `docs/research/image-token-cost-models.md`)
  - Haiku는 넓이에 비례한다(512×384 기준 약 262)
  - 실제 청구는 따로 확인해야 한다
- OCR 기반 영역 후보(지시서 4.1의 두 번째 안)는 지금 권하지 않는다
  - `tesseract.js`와 언어 데이터가 필요하다. 의존성이 크고 오프라인 설치 문제가 있다
  - 실험 2에서 선택기 단독(C)은 B보다 정확도가 낮았다(H3 −11.8%p, −13.9%p)

## 4. 지켜야 할 조건
- strict profile의 동작·테스트·과거 증거(`docs/research/evidence/task-22/`, `task-33/` 등)를 바꾸지 않는다
- 논문은 실험 시점의 제품 범위를 서술한다
  - L23·L63의 "현재 제품"은 투고 시점 문장이다
  - 제품이 바뀌면 README·`docs/image-artifacts.md`는 고친다
  - 논문은 "실험 당시" 표현으로 바꿀지 투고 전에 따로 정한다
- 크기·픽셀 상한(10 MiB, 8192, 16,777,216)과 MCP 메시지 상한(N-14)은 그대로 둔다
- 성능: 알파 전체 검사와 overview 축소는 O(픽셀)이다
  - 계획 PR의 게이트에는 허용폭, 교대 측정, A/A 대조를 처음부터 넣는다(F-21 교훈, N-21)

## 5. 교차 확인
- `gemini-4-argon` 1회: APPROVE, 지적 3건. Claude가 원문을 확인하고 모두 반영했다
  - [Minor] PLTE 서술 오류
  - [Minor] fast-png의 iCCP 압축 해제 위험
  - [Nit] crop 줄 번호

## 6. 사용자 결정 (계획 PR 전에 필요)
- **D1** 기본 profile: strict 유지(권장, 기존 증거 보존)와 tolerant 기본 중 하나
- **D2** EXIF 방향 ≠ 1: 알리고 허용(권장)과 거부 중 하나
- **D3** RGBA: 불투명일 때만 허용(권장)과 흰 배경 합성 중 하나
- **D4** 순서: 6.12a → 6.12b → 6.12c(권장). 스크린샷이 가장 흔한 입력이기 때문이다
