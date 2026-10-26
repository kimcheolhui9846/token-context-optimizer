# 6.12a PNG tolerant profile 사전 설계 (2026-10-26)

- 작성: Claude Code, 2026-10-26. 기준 main `8660174`
- 성격: Codex 6.12a 계획 PR의 입력 자료다. 제품 코드·테스트는 고치지 않았다. 아래 "권장"은 Claude 제안이고, 계획 PR이 다르게 정하면 근거를 적는다
- 근거
  - 사전 조사 PR #65 `research/plans/2026-10-25-image-phase4-survey.md`. Q1 부가 chunk, Q2 RGBA, Q4 profile 공존을 이 메모가 이어받는다
  - 사용자 결정(2026-10-25)
    - D1: 기본은 strict다. tolerant는 `profile` 인자로 고른다
    - D3: RGBA는 알파가 전부 255일 때만 crop을 허용한다
    - D4: 6.12a(PNG) → 6.12b(overview) → 6.12c(JPEG) 순서다
- 순서: 6.9(경로 안전)가 `image-artifacts.ts`의 `readBoundedSource`를 먼저 고친다. 6.12a 구현은 6.9 구현이 merge된 뒤에 시작한다

## 1. 요약

- 디코더(`fast-png`)에는 **IHDR·IDAT·IEND만 남긴 바이트**를 넘긴다(권장 S-1). 부가 chunk는 CRC만 검사하고 내용은 읽지 않는다. 시제품에서 두 위험이 이 방식으로 모두 사라졌다(§2)
  - 위험 1: 작은 iCCP chunk가 아무 제한 없이 큰 메모리로 풀린다
  - 위험 2: 부가 chunk 내용이 깨진 파일을 디코더가 거부한다
- 다시 읽는 경로가 지금은 profile을 보지 않는다. `inspectImageArtifact`와 `readValidatedImageArtifact`가 PNG면 무조건 strict 검사를 다시 한다. 그래서 tolerant로 색인한 레코드를 inspect·crop할 때 **레코드의 `validationProfile`로 검사기를 골라야 한다**(§3.4). 계획에서 빠지기 쉬운 곳이다
- strict profile의 동작·테스트·증거는 바꾸지 않는다. 불투명 RGBA 허용(D3)도 tolerant 레코드에만 적용한다(§3.3)
- MCP 도구 스키마 기준 파일(`tests/fixtures/task39-base-tools.json`)은 고치지 않는다. 바뀐 부분은 테스트에서 기준과의 차이로 적는다. 이미 `query_artifact`의 `maxExcerpts`를 그렇게 적고 있다(§4)

## 2. 시제품 측정 (scratch, 제품 코드 아님)

- 환경: Windows 11, Node v24.18.0, fast-png 8.0.0
- 입력: 640×400 RGBA를 fast-png로 만든 뒤 IHDR 뒤에 chunk를 끼웠다. 모든 chunk의 CRC는 올바르다

| 확인 | 결과 |
|---|---|
| Windows 캡처와 같은 sRGB·gAMA·pHYs에 caBX와 구분자 없는 tEXt를 더한 파일을 원본 바이트 그대로 `decode` | **예외** `invalid latin1 text`. fast-png가 tEXt 내용을 직접 읽는다 |
| 같은 파일에서 IHDR·IDAT·IEND만 남겨 `decode` | 성공. 픽셀이 원본과 바이트 단위로 같다 |
| 길이 3인 pHYs를 원본 그대로 `decode` | **예외** `Length mismatch while decoding chunk pHYs` |
| iCCP 65,253 B(파일 422,864 B)를 원본 그대로 `decode` | 프로필이 **67,108,864 B로 풀렸다**(약 1,028배, 115 ms). 10 MiB 파일 상한 안에서 GiB 단위 할당이 가능하다는 뜻이다 |
| 같은 파일에서 IHDR·IDAT·IEND만 남겨 `decode` | 성공. iCCP를 읽지 않는다 |
| 알파 전부 255 검사, 16,777,216 px RGBA(픽셀 상한) | 9회 중앙값 8.2 ms(최소 8.1, 최대 17.3) |

- 해석: 원본을 그대로 넘기면 CRC가 맞는 부가 chunk의 **내용** 때문에 거부되거나 메모리를 크게 쓴다. 남긴 바이트를 넘기면 둘 다 없다. 원본 `sha256`은 지금처럼 원본 바이트 전체로 계산하므로 추적성은 그대로다
- 알파 검사 비용은 전체 디코드에 비해 작다. 다만 게이트는 §5처럼 따로 잰다

## 3. 설계 제안

### 3.1 chunk 규칙 (`png-rgb8-tolerant-v1`)

| 구분 | 규칙 | 거부 코드 |
|---|---|---|
| 신호·IHDR·IEND | strict와 같다. 첫 chunk는 IHDR이다. IEND는 비어 있고 파일 끝에 있다 | 지금과 같음 |
| IHDR 모드 | strict와 같다. 8-bit RGB/RGBA, 비인터레이스. 회색조·팔레트·16-bit·인터레이스는 6.12a 범위 밖이다 | `unsupported_png_profile` |
| IDAT | 연속이어야 한다. IDAT 사이에 다른 chunk가 있으면 거부한다(PNG 규격) | `malformed_png` |
| 치명 chunk(첫 글자 대문자) | IHDR·IDAT·IEND만 받는다. **PLTE도 거부한다**(권장). truecolor의 PLTE는 권장 팔레트일 뿐이고 이번 표본에서 쓰임을 확인하지 못했다. 쓰임이 확인되면 나중에 연다 | `unsupported_png_profile` |
| 거부할 부가 chunk | `tRNS`(알파 의미를 바꿈), `acTL`·`fcTL`·`fdAT`(APNG) | `unsupported_png_profile` |
| 그 밖의 부가 chunk | 경계와 CRC만 검사하고 건너뛴다. 내용은 읽지 않는다 | CRC가 틀리면 `malformed_png` |
| chunk 이름 | strict와 같이 네 글자 모두 ASCII 영문이다. 예약 비트(셋째 글자 소문자)는 모르는 부가 chunk로 다룬다 | – |

- **S-1(권장): 디코드 입력.** 신호 + IHDR + 연속 IDAT + IEND의 원래 바이트(각 chunk의 원래 CRC 포함)를 이어 붙여 `decode`에 넘긴다
  - chunk를 통째로 옮기므로 CRC를 다시 계산하지 않는다
  - strict 검사기의 `inflateSync` 상한 검사와 필터 바이트 검사는 지금처럼 IDAT에 대해 한다
  - 대안 S-2(iCCP만 거부)는 Windows 캡처에는 충분하다. 하지만 tEXt·pHYs 같은 내용 파싱 실패(§2)는 남는다
- **ignoredChunks:** 건너뛴 부가 chunk 종류를 처음 나온 순서대로, 중복 없이 레코드에 남긴다
  - 종류 수에 상한을 둔다(권장 32). 넘으면 `unsupported_png_profile`로 거부한다. 10 MiB 안에 이름이 다른 12바이트 chunk를 수십만 개 넣으면 레코드가 커지기 때문이다
  - 실제 표본의 종류 수는 최대 5개였다(#65 §2.1)
- 색 정보(iCCP·sRGB·gAMA·cHRM)는 적용하지 않는다. 픽셀은 저장된 값 그대로다. 이 사실은 `ignoredChunks`와 문서로 알린다

### 3.2 레코드·스키마

- PNG 레코드에 tolerant 변형을 더한다
  - `validationProfile: "png-rgb8-tolerant-v1"`
  - `ignoredChunks: string[]`(비어 있을 수 있다)
  - `alpha: "none" | "opaque" | "present"`
    - RGB면 `none`이다
    - RGBA면 디코드한 알파가 전부 255일 때 `opaque`, 아니면 `present`다
- 이 필드들은 tolerant 레코드에만 둔다. strict 레코드의 필드 목록은 바꾸지 않는다. `smoke-mcp.mjs:279,290`이 strict 필드 목록을 고정하고 있다
- `channels`는 파일의 실제 값(3 또는 4)을 그대로 둔다. 불투명 RGBA를 레코드에서 3으로 바꾸지 않는다. 레코드는 파일을 그대로 설명하고, 허용 여부는 `alpha`로 판단한다
- `index_image_artifact` 입력에 선택 인자 `profile: "strict" | "tolerant"`를 더한다. 기본값은 `strict`다(D1). 다른 값은 입력 검증 오류다
- **artifactId 충돌:** 지금 `artifactId`는 경로와 sha256만으로 정한다(`image-artifacts.ts:61-63`). 그래서 같은 파일을 strict로 색인한 뒤 tolerant로 다시 색인하면 같은 ID가 나와 store의 레코드를 덮어쓴다. strict RGBA 레코드가 tolerant로 바뀌면 crop 결과도 달라진다
  - 권장: tolerant일 때만 식별 문자열에 profile을 더한다(`path\0sha256\0png-rgb8-tolerant-v1`). strict 식별 문자열과 기존 ID·증거는 그대로다. 두 레코드가 따로 남는다
    - 식별 문자열은 지금 방식(`${path}\0${sha256}`, `image-artifacts.ts:62`)처럼 구분자로 이어 붙인다. 넣는 profile은 요청 인자(`tolerant`)가 아니라 레코드에 적힌 실제 profile 이름이다. 그래야 strict 식별 문자열과 겹치지 않는다
  - 대안: 덮어쓰기를 허용하고 문서에 적는다
- **배열 소유권:** `MemoryImageArtifactStore`의 `get`·`put`(`image-artifacts.ts:37-43`)은 `{ ...record }` 얕은 복사다. 지금 레코드는 원시 값만 있어서 문제가 없지만, `ignoredChunks: string[]`이 들어오면 호출자가 배열을 바꿀 때 store 안의 레코드도 바뀐다
  - put·get, index·inspect가 돌려주는 레코드에서 배열을 복사한다
  - 호출자가 받은 배열을 바꿔도 store 레코드와 다음 inspect 결과가 그대로인지 테스트한다
- **JPEG에 `profile: "tolerant"`가 오면**(6.12c 전)
  - 권장: strict JPEG 검사기로 검사하고, 레코드에 실제로 쓴 `jpeg-ycbcr8-baseline-444-v1`을 적는다. tolerant는 "그 형식에서 쓸 수 있는 가장 넓은 profile"이라는 뜻이다. 레코드가 실제 profile을 밝히므로 6.12c 뒤에 결과가 넓어져도 숨겨지지 않는다
  - 대안: 6.12c 전에는 `unsupported_profile`로 거부한다. 섞인 이미지를 다루는 호출자가 형식마다 인자를 바꿔야 한다
  - 계획 PR에서 하나를 정하고 문서에 적는다

### 3.3 crop의 알파

- tolerant 레코드이고 `alpha === "opaque"`면 부분 crop을 허용한다. 이때 4채널 stride로 RGB를 읽는다
- 다시 읽을 때 디코드한 알파를 다시 검사한다. 레코드와 다르면 `decode_failed`다. sha256이 같으면 결과도 같아야 하므로, 이 검사는 결정성을 지키는 안전장치다
- `present`는 지금처럼 `alpha_unsupported`다
- **strict RGBA 레코드는 지금처럼 `alpha_unsupported`다.** `tests/image-crop.test.ts:119`, `tests/image-crop-boundaries.test.ts:96`과 문서 `docs/image-artifacts.md:122`가 바뀌지 않는다
- 1536 초과 영역의 `resize_required`는 그대로 둔다

### 3.4 다시 읽는 경로

- `inspectImageArtifact`(`image-artifacts.ts:95-96`)와 `readValidatedImageArtifact`(`:173`)는 레코드의 `validationProfile`로 검사기를 고른다
- 다시 검사한 결과의 `ignoredChunks`·`alpha`도 레코드와 같아야 한다. 다르면 `decode_failed`다. 지금 `:176-178`이 치수·채널·profile을 비교하는 방식과 같다
- 이 부분이 빠지면 tolerant 레코드의 inspect가 `unsupported_png_profile`로 실패한다. 테스트에 tolerant 색인 → inspect → crop을 넣어 막는다

## 4. 영향 범위

| 종류 | 위치 | 처리 |
|---|---|---|
| 제품 | `src/core/image-artifacts.ts` `validatePng`, `indexImageArtifact`, `inspectImageArtifact`, `readValidatedImageArtifact` | tolerant 검사기 추가, profile에 따라 고르기 |
| 제품 | `src/core/image-crop.ts:29` | §3.3 |
| 제품 | `src/core/types.ts:30-40` | PNG tolerant 변형 추가 |
| 제품 | `src/server/index.ts:167-177`(출력 스키마, index·inspect가 같이 씀), `:180-189`(index 도구) | 입력 `profile` 인자, 출력 스키마에 tolerant 변형 추가. 설명 문구 |
| 테스트(유지) | `tests/fixtures/task39-base-tools.json`, `task36-base-tools.json` | **고치지 않는다.** `tests/image-crop-mcp.test.ts:71-`와 `tests/query-artifact-mcp.test.ts:45-`에서 바뀐 도구를 기준과의 차이로 적는다. `query_artifact` 선례와 같다 |
| 테스트(유지) | `tests/image-artifacts.test.ts:197,209` strict 거부 | 그대로 둔다. 인자 없이 strict로 돈다 |
| 테스트(추가) | `tests/image-artifacts.test.ts` | `ignoredChunks` 배열 격리: put·get·index·inspect가 돌려준 배열을 호출자가 바꿔도 store 레코드가 그대로다(§3.2) |
| 테스트(유지) | `tests/image-source-race.test.ts`, `tests/image-packaging.test.ts` | 그대로 통과하는지 확인한다. 읽기 경로와 패키징은 tolerant 추가로 바뀌지 않는다 |
| 테스트(수정 가능) | `tests/jpeg-fixtures.test.ts:40-46` 스키마 교차 거부 | tolerant 변형에도 교차 거부 사례를 더한다 |
| 스크립트 | `scripts/smoke-mcp.mjs:271-304` | 출력 스키마 변형이 2개에서 3개가 된다. strict 경로 검사는 그대로 두고 tolerant 사례를 더한다 |
| 문서 | `docs/image-artifacts.md:10-21,109,122,173,182`, README 이미지 절 | tolerant profile 절, 레코드 필드, 알파 규칙, 색 정보 미적용 |
| 증거(유지) | `docs/research/evidence/task-22/`, `task-33/` 등 | 고치지 않는다 |
| 논문 | 원고 L23·L63 "현재 제품" | 이 PR에서 고치지 않는다. 투고 전에 "실험 당시"로 바꿀지 따로 정한다(#65 §4) |

## 5. 테스트와 게이트

- 합성 PNG를 테스트 안에서 만든다. 실제 스크린샷 파일은 저장소에 넣지 않는다. 테스트 helper에 CRC를 계산하는 chunk 작성기가 이미 있다(`tests/image-crop-mcp.test.ts:15-`)
- 받아야 하는 경우
  1. Windows 캡처형: RGBA 전부 255, sRGB·gAMA·pHYs. tolerant 색인이 통과하고 `ignoredChunks = ["sRGB","gAMA","pHYs"]`, `alpha = "opaque"`다. crop도 통과한다. 같은 파일을 strict로 색인하면 `unsupported_png_profile`다
  2. 모르는 부가 chunk(`caBX`), tEXt·zTXt·iTXt·tIME·bKGD·cHRM·eXIf. 내용이 깨진 tEXt와 길이가 틀린 pHYs도 넣는다(§2). 모두 통과한다
  3. 큰 iCCP(§2와 같은 1,000배 압축): 통과한다. 디코더가 iCCP를 읽지 않는다는 것을 메모리 상한이나 시간으로 확인한다
  4. RGB 파일: `alpha = "none"`이다
  5. tolerant 색인 → inspect → crop이 이어서 통과한다(§3.4)
- 거부해야 하는 경우
  1. tRNS, acTL·fcTL·fdAT, PLTE, 모르는 치명 chunk: `unsupported_png_profile`
  2. 부가 chunk CRC 오류, IDAT 사이 부가 chunk, IEND 뒤 바이트: `malformed_png`
  3. 부가 chunk 종류가 33개: `unsupported_png_profile`
  4. 알파 254인 픽셀이 하나 있는 RGBA: 색인은 `alpha = "present"`로 통과하고, 부분 crop은 `alpha_unsupported`다
  5. strict RGBA 레코드의 부분 crop: 지금처럼 `alpha_unsupported`다
  6. 같은 경로·바이트인데 색인 뒤 파일을 바꾼 경우: 지금처럼 `source_changed`다
- 성능 게이트(F-21 교훈, N-21)
  - **strict 경로 비회귀:** 기존 strict PNG 색인과 crop 시간. 픽셀 상한 크기, 같은 프로세스에서 기준·기준 복사본·현재를 교대로 9회 잰다. A/A 0.97–1.03 밖이면 무효, 현재/기준 ≤ 1.03이면 통과다. **원시 표본도 증거에 남긴다**
  - tolerant 경로는 기록만 한다. 비교할 기준이 없다. 알파 검사와 chunk 복사 비용을 픽셀 상한에서 기록한다
  - 측정 소스의 해시가 작업 사본 기준인지 커밋 blob 기준인지 증거에 적는다(F-21 F21-F-1)

## 6. 범위 밖 (기록만)

- 회색조·팔레트·16-bit·인터레이스 PNG. 표본에서 회색조 4/201, 나머지는 0이었다
- 색 관리(iCCP·sRGB·gAMA 적용)
- 반투명 RGBA의 합성(D3에서 채택하지 않음)
- JPEG 범위 확장(6.12c), overview(6.12b)

## 7. 계획 PR에서 정할 것

- §3.2 JPEG에 tolerant가 왔을 때 처리(권장: strict로 검사하고 실제 profile을 레코드에 적는다)
- §3.1 `ignoredChunks` 종류 상한 값(권장 32)
- `alpha` 필드 이름과 값 이름
- 오류 코드를 새로 만들지 여부. 권장은 기존 코드 재사용이다
- §3.2 artifactId에 profile을 넣을지(권장: tolerant만 넣는다)

## 8. 교차 확인
- `gemini-4-argon`: APPROVE, [Nit] 1건(같은 파일을 strict·tolerant로 색인하면 artifactId가 같아 덮어씀). 반영했다(§3.2, §7)
- Codex 교차 검토(2026-10-26): Request changes, [Minor] 1건(`ignoredChunks` 배열 소유권) → §3.2에 배열 복사, §4에 격리 테스트와 `image-source-race`·`image-packaging` 유지 확인을 더했다. tolerant 식별 문자열에 구분자와 실제 profile 이름을 넣으라는 의견도 §3.2에 적었다. 또 §3.2 식별 문자열 예시에 실제 NUL 바이트가 들어가 있어(파일이 이진으로 보였다) 글자 `\0`으로 바꿨다. 시제품 재현(§2)은 Codex가 합성 PNG로 다시 했다. 파일 크기는 합성 픽셀이 달라 비교 대상이 아니고, 알파 검사는 중앙값 8.6 ms였다
