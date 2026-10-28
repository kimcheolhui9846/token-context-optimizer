# 6.12b overview·6.12c JPEG tolerant 사전 설계 (2026-10-26)

- 작성: Claude Code, 2026-10-26. 기준 main `7709837`
- 고침: 2026-10-28 Codex 교차 검토(Request changes, [Major] 1·[Minor] 1)를 반영했다. 6.9(#78)·6.12a(#80)가 merge된 main `59c33c9`에 맞춰 위치와 6.12a 연결을 다시 적었다(§6)
- 성격: Codex 6.12b·6.12c 계획 PR의 입력 자료다. 제품 코드·테스트는 고치지 않았다. 아래 "권장"은 Claude 제안이고, 계획 PR이 다르게 정하면 근거를 적는다
- 근거
  - 사전 조사 PR #65 `research/plans/2026-10-25-image-phase4-survey.md`. Q3 JPEG, Q5 overview를 이 메모가 이어받는다
  - 6.12a 사전 설계 PR #70 `research/plans/2026-10-26-png-tolerant-predesign.md`. profile 인자, 레코드 변형, 다시 읽는 경로, artifactId, 배열 소유권 규칙을 그대로 쓴다
  - 사용자 결정(2026-10-25)
    - D1: 기본 profile은 strict다
    - D2: EXIF 방향이 1이 아니어도 회전하지 않는다. 레코드에 알리고 허용한다
    - D3: RGBA는 알파가 전부 255일 때만 crop을 허용한다
    - D4: 6.12a → 6.12b → 6.12c 순서다
- 순서: 6.9 구현 merge → 6.12a → 6.12b → 6.12c. 6.12b·6.12c는 6.12a가 만든 profile·레코드 구조 위에 선다. 줄 번호는 그때 main에서 다시 확인한다

## 1. 요약

- **6.12b overview**
  - 새 도구 `overview_image_artifact`가 색인된 이미지 전체를 긴 변 512 이하로 줄여 q75 JPEG로 돌려준다
  - 축소는 **정수 면적 평균**이다. 새 의존성이 없고, 같은 입력이면 같은 바이트가 나온다
  - 시제품(§2.1)에서 픽셀 상한(16,777,216 px) 입력의 축소는 중앙값 약 90 ms다. 같은 이미지의 PNG 디코드(약 380–500 ms)보다 작다
- **6.12c JPEG tolerant**
  - 마커 구조 검사는 우리 코드가 하고, 엔트로피 디코드는 `jpeg-js`(`tolerantDecoding: false`)에 맡긴다(#65 Q3 A안)
  - 시제품(§3.1)에서 4:2:0, progressive, restart 마커, EXIF·ICC가 있는 파일을 모두 디코드했다. 잘린 파일과 고른 비트 변경 파일 하나는 거부했다
  - 단, `tolerantDecoding: false`는 손상 검출기가 아니다. scan 바이트를 하나씩 바꾸면 대부분이 다른 픽셀로 디코드된다(§3.1). JPEG에는 PNG의 CRC·Adler-32 같은 검사값이 없다
  - **결정이 하나 더 필요하다(D-C1).** 지금 128 MiB 디코더 회계 상한에서는 JPEG가 4:4:4 약 6.39 MP, 4:2:0 약 9.94 MP까지만 열린다. 흔한 12 MP 휴대폰 사진(4032×3024, 4:2:0)은 거부된다
- **기존 문서에 없는 사실 하나(N-25 제안).** 지금 strict JPEG도 128 MiB 회계 때문에 약 6.39 MP를 넘으면 `jpeg_resource_limit`다. 문서는 16,777,216 px 상한과 128 MiB 회계 상한을 따로 적을 뿐, 둘이 겹쳐 실제 상한이 낮아진다는 사실을 적지 않는다. 6.10 문서 묶음에 넣기를 권한다(§3.1)

## 2. 6.12b overview

### 2.1 시제품 측정 (scratch, 제품 코드 아님)

- 환경: Windows 11, Node v24.18.0, jpeg-js 0.4.4, fast-png 8.0.0. 비교용 sharp 0.35.4(연구 하네스와 같은 판)
- 입력: 합성 RGB/RGBA(가로 그라데이션, 8×16 체크, 의사 난수 채널). 7회 측정
- 축소: 아래 §2.3의 정수 면적 평균. 긴 변 512

| 원본 | 출력 | 축소 중앙값(최소–최대) | 두 번 결과 같음 | q75 JPEG 크기 | JPEG 인코드 | 같은 원본 PNG 디코드 |
|---|---|---|---|---|---|---|
| 8192×2048 RGB | 512×128 | 90.2 ms (88.7–102.0) | 예 | 3,592 B | 16.6 ms | 382.6 ms |
| 4096×4096 RGBA | 512×512 | 94.0 ms (92.8–97.7) | 예 | 198,874 B | 31.9 ms | 500.3 ms |
| 2560×1440 RGBA | 512×288 | 21.8 ms (20.2–45.6) | 예 | 119,380 B | 17.6 ms | 111.4 ms |
| 1920×1080 RGB | 512×288 | 13.8 ms (13.5–15.7) | 예 | 102,148 B | 18.6 ms | 51.9 ms |
| 400×300 RGB | 400×300 (확대 안 함) | 1.7 ms | 예 | 71,434 B | 16.7 ms | 5.9 ms |

- 출력 치수는 다섯 경우 모두 sharp `fit: "inside", withoutEnlargement: true`와 같았다
- 픽셀 값은 sharp(lanczos3)와 다르다. 합성 입력의 의사 난수 채널 때문에 평균 절대 차이가 0–12.15다. 이 수치는 화질 비교가 아니라 커널이 다르다는 확인이다
- JPEG 크기는 의사 난수 채널 때문에 실제 스크린샷보다 크게 나왔을 수 있다. 512×512 q75 출력은 최대 약 200 KB이고, base64로 약 266 KB다. MCP 메시지 상한(10 MiB, N-14)보다 훨씬 작다

### 2.2 도구 모양

| 항목 | 권장 | 대안·이유 |
|---|---|---|
| 도구 | 새 도구 `overview_image_artifact` | crop에 `scale` 인자를 더하는 안은 crop의 "원본 픽셀 그대로" 계약(`resize_required`)을 흐린다 |
| 입력 | `{ artifactId, maxSide? }` strict object | `maxSide`: 정수 64–1536, 기본 512. 1536은 crop 영역 상한과 같다 |
| 출력 content | text(JSON) + image(`image/jpeg`) | crop과 같은 모양 |
| structuredContent | `source`(레코드), `output`: `width`, `height`, `format`·`mimeType`(jpeg), `byteLength`, `sha256`, `quality: 75`, `encoder`, `resample: "area-average-v1"`, `validation` | crop `output`과 같은 필드에 `resample`만 더한다 |
| 작은 이미지 | 긴 변이 `maxSide` 이하면 1:1로 인코드해 돌려준다. 확대하지 않는다 | crop의 전체 영역처럼 "원본 참조"만 돌려주면 호출자가 이미지를 볼 수 없다. overview의 목적이 보는 것이다 |
| 좌표 대응 | 문서에 `x_src = floor(x * sourceWidth / width)`를 적는다. 배율을 소수로 따로 주지 않는다 | 소수 배율은 반올림 방식이 호출자마다 달라진다. 두 치수만 주면 정수로 계산할 수 있다 |
| 격자선 | 넣지 않는다 | #65 Q5는 선택 기능으로 적었다. 픽셀을 바꾸고 연구 하네스에도 없었다. 필요하면 나중에 인자로 연다 |
| 알파 | crop과 같다. 6.12a tolerant 레코드의 `alpha === "opaque"`만 허용하고, 그 밖의 4채널은 `alpha_unsupported`다 | D3와 같은 규칙이다. 반투명 픽셀을 RGB만 보고 줄이면 보이는 그림과 달라진다 |

- 출력 치수: 긴 변이 `maxSide`보다 크면 `w = max(1, round(W * maxSide / max(W,H)))`, `h`도 같다. 시제품에서 sharp와 같은 치수였다
- 토큰(공개 회계식, 실제 청구는 따로 확인)
  - GPT-4o detail low: 크기와 무관하게 85
  - Haiku 4.5: 약 `w*h/750`. 512×288이면 약 197, 512×512이면 약 350
- 이름: 도구 이름과 `resample` 값 이름은 계획 PR에서 정한다

### 2.3 축소 알고리즘 (`area-average-v1`)

- 원본 화소 i는 `[i*w, (i+1)*w)`, 출력 화소 j는 `[j*W, (j+1)*W)`를 덮는다고 보고, 겹치는 길이를 정수 가중치로 쓴다. 세로도 같다
- 한 출력 화소의 가중치 합은 `W*H`다. 채널 합의 최댓값은 `255*W*H ≤ 255*16,777,216 ≈ 4.3e9`로 2^53보다 훨씬 작다. 그래서 `Float64Array`에 더해도 정확히 정수다
- 반올림: `floor((2*sum + W*H) / (2*W*H))`(0.5는 올림). 모든 연산이 정수라 플랫폼과 무관하게 같은 값이다
- 메모리: 원본 행을 하나씩 읽어 가로 합(출력 너비 × 3, `Uint32Array`)을 만들고, 출력 행 누적(`Float64Array`)에 더한다. 추가 메모리는 출력 크기에 비례한다(512×512×4 출력 버퍼 1 MiB 포함 약 1.03 MiB)
- RGBA는 알파를 버리고 RGB만 줄인다. §2.2 알파 규칙을 통과한 경우만 여기에 온다
- sharp와 바이트가 같을 필요는 없다. 논문은 연구 하네스(sharp lanczos3 + q75 4:4:4)를 평가했고 제품 도구는 평가하지 않았다(README L13-17). 이 차이를 문서에 적는다

### 2.4 경로와 오류

- 다시 읽는 경로는 crop과 같다. `readValidatedImageArtifact`로 경로 재승인, 해시 비교, 다시 검사를 한다. 6.12a §3.4의 profile별 검사기 선택을 그대로 쓴다
- 오류 코드는 crop과 같은 것을 쓴다: `artifact_not_indexed`, `path_denied`, `source_changed`, `source_missing_or_unreadable`, `decode_failed`, `alpha_unsupported`, `encode_failed`, `output_validation_failed`. `maxSide` 범위 밖은 입력 검증 오류다
- 출력 검증: crop처럼 우리 JPEG를 strict 검사기(`validateJpeg`)로 다시 읽어 치수를 비교한다
- 순서: 다시 읽고 검사한 뒤 알파를 본다. crop의 full-frame 원본 참조 반환과 `resize_required` 우선순위(`image-crop.ts:30-33`)는 overview에 옮기지 않는다. overview에는 영역이 없고, 작은 이미지도 인코드해 돌려준다(§2.2)

### 2.5 영향 범위

| 종류 | 위치 | 처리 |
|---|---|---|
| 제품 | `src/core/image-overview.ts`(새 파일) | §2.3 축소, 인코드, 출력 검증 |
| 제품 | `src/server/index.ts` | 도구 등록, 입력·출력 스키마 |
| 제품 | `src/server/index.ts:237`(main `59c33c9`) crop 설명 "Crop a validated RGB PNG or JPEG ... this tool does not generate one" | overview 도구를 가리키도록 바꾼다. 6.12a 뒤 tolerant 불투명 RGBA PNG도 부분 crop되므로 "RGB PNG" 문구도 함께 고친다(#80 검토 Nit). 공개 스키마 기준 fixture와의 차이로 적는다 |
| 테스트(유지) | `tests/fixtures/task39-base-tools.json`, `task36-base-tools.json` | 고치지 않는다. 새 도구는 기준과의 차이로 적는다(#70 §4와 같은 방식) |
| 테스트(추가) | `tests/image-overview.test.ts`(새 파일) | §2.6 |
| 스크립트 | `scripts/smoke-mcp.mjs` | 도구 목록과 overview 한 번 호출 |
| 문서 | `docs/image-artifacts.md` 새 절, README 이미지 절, `skills/optimize-context/SKILL.md`의 PNG and JPEG Input Workflow | 좌표 대응식, 연구 하네스와 커널이 다르다는 점 |

### 2.6 테스트와 게이트

- 받아야 하는 경우
  1. 단색 이미지 → 출력도 같은 단색이다(정수 반올림 확인)
  2. 2×2 체크 → 1×1 평균이 손으로 계산한 값과 같다
  3. 8192×1 같은 극단 비율 → 짧은 변이 1 이상이다
  4. 긴 변 ≤ `maxSide` → 치수가 원본과 같다(확대 안 함)
  5. 같은 입력 두 번 → 출력 `sha256`이 같다
  6. tolerant 불투명 RGBA → 통과한다
- 거부해야 하는 경우
  1. strict RGBA, `alpha === "present"` → `alpha_unsupported`
  2. 색인 뒤 파일 변경 → `source_changed`
  3. `maxSide` 63, 1537, 소수 → 입력 검증 오류
- 성능 게이트(F-21 교훈, N-21)
  - 기존 도구는 바뀌지 않으므로 비회귀 게이트는 기존 index·crop의 시간만 본다. 같은 프로세스에서 기준·기준 복사본·현재를 교대로 9회 잰다. A/A 0.97–1.03 밖이면 무효, 현재/기준 ≤ 1.03이면 통과다
  - overview는 기준이 없으므로 기록만 한다. 픽셀 상한 크기에서 축소와 인코드 시간을 원시 표본과 함께 남긴다

## 3. 6.12c JPEG tolerant

### 3.1 시제품 측정 (scratch, 제품 코드 아님)

- 환경은 §2.1과 같다. sharp로 1920×1080 합성 JPEG를 만들었다. jpeg-js 옵션은 지금 제품과 같다(`tolerantDecoding: false`, `maxMemoryUsageInMB: 128`, `maxResolutionInMP: 16.777216`)

| 입력 | 구조 | jpeg-js 결과 |
|---|---|---|
| 4:4:4 baseline | SOF0, 1x1×3, APP0 없음 | 성공 |
| 4:2:0 baseline | SOF0, 2x2·1x1·1x1 | 성공 |
| 4:2:0 progressive | SOF2, scan 10개 | 성공 |
| mozjpeg 기본 | SOF2, scan 7개 | 성공 |
| EXIF 방향 6 + ICC | APP1·APP2, 4:2:0 | 성공. `exifBuffer`는 있지만 방향은 적용하지 않는다(#65 §2.3) |
| 4:2:0 baseline, scan 60%에서 자르고 EOI | – | 거부 `unexpected marker: ffd9` |
| 4:2:0 baseline, scan 안 40바이트 비트 변경(변형 1개) | – | 거부 `invalid huffman sequence` |
| progressive, 50%에서 자르고 EOI | – | 거부 `unexpected marker: ffd9` |

- **비트 변경 거부는 일반 규칙이 아니다**(2026-10-28 Codex 교차 검토 [Major], Claude 재현)
  - 위 표의 비트 변경 행은 고른 변형 하나의 결과다. Codex가 같은 40바이트 변경을 다시 해 보니 오류 문자열이 변형 위치마다 달랐다
  - Codex: 합성 32×32 JPEG의 scan 바이트 441개를 하나씩 XOR 1 → 398개 디코드, 그중 397개는 픽셀이 달랐다
  - Claude: jpeg-js 인코더로 만든 32×32 q75(의사 난수) scan 바이트 1,287개를 하나씩 XOR 1 → 1,285개 디코드, 1,284개 픽셀 다름, 거부 2개
  - 결론: jpeg-js가 거부하는 것은 Huffman 부호로 풀 수 없는 경우와 예상하지 못한 마커뿐이다. 무결성은 색인 때의 `sha256`과 다시 읽을 때의 `source_changed`가 맡는다. 색인 전에 이미 손상된 JPEG는 디코드되면 통과한다. 문서에 적는다

- **progressive 파일은 scan 사이에서 Huffman 표를 다시 정의한다.** sharp progressive와 mozjpeg 출력 모두 AC 표 0·1이 여러 번 다시 정의됐다. 지금 `parseDht`는 같은 id가 다시 오면 거부하고(`jpeg-validation.ts:136`), 첫 SOS 뒤에는 마커를 더 읽지 않는다(`:77-78`). tolerant 구조 검사는 이 둘을 바꿔야 한다
- **restart 마커**: 합성 파일은 만들지 못했다(sharp에 옵션이 없고, Pillow는 설치되어 있지 않다). 대신 이 PC의 실제 JPEG(아래)에 restart가 있는 2장이 있었고 jpeg-js가 모두 디코드했다
  - Codex(2026-10-28)가 합성 restart JPEG를 만들었다. jpeg-js는 올바른 `D0`뿐 아니라 잘못된 `D5`도 받았다. RST 순서는 jpeg-js가 검사하지 않으므로 §3.2의 구조 검사가 맡아야 한다
  - Codex가 SOF1 파일의 디코드 성공도 확인했다(D-C3)
- **이 PC의 JPEG**(#65 §2.1과 같은 폴더, strict 미통과 5장. 구조와 결과만 셌고 픽셀·파일명은 남기지 않았다)
  - 5장 모두 SOF0, 4:2:0(2x2·1x1·1x1)이다
  - APP 구성: APP0만 1장, APP0+APP2 2장, APP0+APP1+APP13+APP2 2장. 마지막 2장은 DRI와 restart 마커(135개, 28개)가 있고 EXIF 방향은 1이다
  - jpeg-js: 4장 성공(0.4–3.6 MP), 1장은 `maxResolutionInMP` 초과(약 34 MP, 픽셀 상한 밖이라 어차피 거부 대상)
- **디코더 메모리 회계와 실제 상한**

| 입력 | MP | 회계 추정 | 128 MiB | 256 MiB |
|---|---:|---:|---|---|
| 3088×2069 4:4:4 | 6.39 | 128.1 MiB | 거부 | 성공 256–262 ms |
| 3100×2100 4:4:4 | 6.51 | 130.7 MiB | 거부 | 성공 262–269 ms |
| 4000×2480 4:2:0 | 9.92 | 127.7 MiB | 성공 273–282 ms | 성공 268–280 ms |
| 3648×2736 4:2:0 | 9.98 | 128.5 MiB | 거부 | 성공 260–270 ms |
| 4032×3024 4:2:0 (12 MP 휴대폰) | 12.19 | 157.0 MiB | 거부 | 성공 334–335 ms |
| 8192×2048 4:4:4 (픽셀 상한) | 16.78 | 약 336 MiB | 거부 | (재지 않음) |
| 8192×2048 4:2:0 | 16.78 | 약 216 MiB | 거부 | (재지 않음) |

  - 시간은 두 번 돌린 값의 범위다(1회씩, 참고용). 성공·거부 판정은 두 번 모두 같았다
  - 회계 추정은 jpeg-js 할당 지점(`decoder.js:525,603,885`, `decode`의 출력)을 따라 계산했다. 4:4:4는 지금 문서식 `960*B + 6*W*H`와 같다. 4:2:0은 성분별 블록 수로 계산하며 대략 `13.5 * W*H`다. 시제품의 4:2:0 식은 근사다. 제품 추정식과 문서에 적을 식은 jpeg-js의 `mcusPerLine`·`mcusPerColumn`(`decoder.js:590-603`)과 `blocksPerLine`·`blocksPerColumn` 계산을 그대로 따라야 한다. 너비가 16의 배수가 아니면 근사와 몇 KB 차이가 날 수 있다
  - 4:4:4에서 `960*B ≈ 15*W*H`이므로 `21*W*H ≤ 128 MiB`, 즉 **약 6.39 MP가 지금 strict JPEG의 실제 상한**이다. 16,777,216 px 상한은 JPEG에서는 닿지 않는다. 동작은 맞지만 문서에 없다 → N-25로 등록하고 6.10 문서 묶음(PR #76)에 넣기를 권한다

### 3.2 profile 규칙 (`jpeg-ycbcr8-tolerant-v1`)

| 구분 | 규칙 | 거부 코드 |
|---|---|---|
| SOF | SOF0(baseline)·SOF1(확장 순차, 8-bit만)·SOF2(progressive)만 받는다. 산술 부호화(SOF9 이후), lossless, 12-bit는 거부한다 | `unsupported_jpeg_profile` |
| 성분 | 3성분 YCbCr. Y는 1x1·2x1·1x2·2x2, Cb·Cr은 1x1. 회색조·CMYK·YCCK와 그 밖의 샘플링은 거부한다 | `unsupported_jpeg_profile` |
| APP0 | 없어도 된다(카메라 EXIF 파일은 APP0 없이 APP1로 시작한다). 있으면 strict와 같은 JFIF 검사를 한다 | `unsupported_jpeg_profile` |
| APP14 Adobe | 변환 값이 1(YCbCr)일 때만 받는다. 0(RGB 부호화)·2(YCCK)는 거부한다 | `unsupported_jpeg_profile` |
| 그 밖의 APPn·COM | 길이 경계만 검사하고 건너뛴다. 종류를 첫 등장 순서로 `ignoredSegments`에 남긴다. 종류는 APP0–APP15 16개와 COM을 합쳐 많아야 17개라서 6.12a의 종류 상한 32는 닿지 않는다. 종류 상한을 두지 않는다. 발생 개수 상한은 계획 PR이 정한다(두지 않으면 10 MiB 읽기 상한이 개수를 묶는다) | 발생 개수 상한을 두면 넘을 때 `unsupported_jpeg_profile` |
| APP1 EXIF | 방향(0x0112)만 읽는다. 아래 §3.3 | – |
| DQT | 8-bit 표만 받는다(지금과 같음). 16-bit는 거부한다. 이미 정의된 id의 재정의는 SOF 전까지만 받는다. SOF 뒤에 SOF가 참조하는 id를 다시 정의하면 거부한다. jpeg-js가 어느 시점의 표로 역양자화하는지에 기대지 않기 위해서다 | 16-bit `unsupported_jpeg_profile`, 재정의 `malformed_jpeg` |
| DHT | id 0–3(지금 strict는 0–1만 받는다, `jpeg-validation.ts:134`). **scan 사이 재정의를 허용한다**(지금 strict는 거부한다, `:136`). 각 SOS는 그 시점에 정의된 표만 참조해야 한다 | `malformed_jpeg` |
| DRI·RST | 받는다. RST는 scan 데이터 안에서 `D0`–`D7` 순서로 나와야 한다 | `malformed_jpeg` |
| scan | 여러 개. 각 SOS의 성분·표 참조가 그 시점의 표와 맞아야 한다. progressive의 Ss·Se·Ah·Al 범위를 검사한다 | `malformed_jpeg` |
| 끝 | 마지막 scan 뒤 EOI 하나로 파일이 끝난다. EOI 뒤 바이트는 거부한다 | `malformed_jpeg` |

- **엔트로피 검사**: tolerant는 우리 `decodeEntropy`를 쓰지 않는다. `jpeg-js`(`tolerantDecoding: false`)가 실제로 디코드하며 Huffman 오류와 예상하지 못한 마커를 거부한다(§3.1). 우리 코드는 scan 데이터에서 마커 경계(`FF00` 스터핑, RST 순서)만 확인한다
  - 이 검사는 "끝까지 디코드된다"만 보장한다. 바뀐 비트가 다른 유효한 부호가 되면 통과한다(§3.1). 손상 검출이라고 문서에 쓰지 않는다
  - 대안 B(우리 엔트로피 검사를 서브샘플링·restart·progressive까지 넓힘)는 결정성은 높지만 progressive의 successive approximation까지 구현해야 한다. 권하지 않는다
- strict profile의 검사기·테스트·증거(`task-22/`, `task-33/`)는 바꾸지 않는다

### 3.3 EXIF 방향 (D2)

- APP1이 `Exif\0\0`로 시작하면 TIFF 머리(II·MM), IFD0 위치, 항목 수를 APP1 길이 안에서만 읽는다. 0x0112(SHORT, 개수 1)의 값을 `exifOrientation`(1–8)으로 둔다
- EXIF가 없거나, 읽다가 경계를 벗어나거나, 값이 1–8 밖이면 `exifOrientation: null`이다. 파일은 거부하지 않는다. EXIF는 부가 정보이고 픽셀 해석에 쓰지 않기 때문이다(PNG 부가 chunk와 같은 태도)
- 회전하지 않는다. crop·overview 좌표는 저장된 픽셀 기준이다. 문서와 도구 설명에 "방향이 1이 아니면 사진이 돌아가 보일 수 있다"를 적는다

### 3.4 레코드·다시 읽는 경로

- JPEG tolerant 레코드: `validationProfile: "jpeg-ycbcr8-tolerant-v1"`, `coding: "baseline" | "extended" | "progressive"`, `sampling`(예: `"2x2,1x1,1x1"`), `ignoredSegments: string[]`, `exifOrientation: 1–8 | null`
- 6.12a의 규칙을 그대로 쓴다
  - artifactId 식별 문자열에 실제 profile 이름을 더한다(#70 §3.2)
  - 배열 필드는 store의 put·get과 index·inspect 결과에서 복사한다
  - inspect·crop·overview는 레코드의 `validationProfile`로 검사기를 고르고, 다시 검사한 `coding`·`sampling`·`ignoredSegments`·`exifOrientation`이 레코드와 다르면 `decode_failed`다
- 6.12a §3.2의 "JPEG에 `profile: "tolerant"`가 오면 strict로 검사하고 실제 profile을 적는다"는 6.12c에서 끝난다. 이때부터 tolerant JPEG 요청은 tolerant 검사기를 쓴다. strict로 통과하는 파일도 tolerant로 색인하면 레코드는 tolerant profile이다
  - 대안: strict로 통과하면 strict profile을 적는다. 레코드가 "가장 좁은 통과 profile"을 알려 주지만, 같은 요청의 결과 profile이 파일마다 달라진다. 계획 PR에서 하나를 정한다
- **artifactId 호환성(D-C2 (가)일 때).** main `59c33c9`에서는 접미사가 레코드의 실제 profile이 `STRICT_PROFILES`(`image-artifacts.ts:14`) 밖일 때만 붙는다(`:63`). 그래서 지금 JPEG의 `profile: "tolerant"` 요청은 strict와 같은 ID와 strict profile을 받는다(Codex 실행 확인). 6.12c 뒤에는 같은 파일의 tolerant 요청이 tolerant profile과 **다른 ID**를 받는다. strict 요청의 ID는 그대로다. 6.12c 계획·문서·PR 본문에 이 변화를 적는다
- **6.12a 코드에서 넓힐 자리**(main `59c33c9`, `src/core/image-artifacts.ts`)
  - `STRICT_PROFILES`(`:14`)에는 지금 strict 두 종류만 둔다. JPEG tolerant를 넣지 않는다
  - index 레코드 구성(`:77`). 지금은 `png-rgb8-tolerant-v1`일 때만 `ignoredChunks`·`alpha`를 넣는다
  - `validateForRecord`(`:166`)의 profile 분기
  - `recordMetadataMatches`(`:179`)와 그 호출부(`:99` inspect, `:155` 다시 읽기). 지금은 PNG tolerant만 비교한다
  - `cloneImageArtifactRecord`(`:311`). 지금은 `ignoredChunks`만 복사한다
  - `src/core/image-crop.ts:23-25`의 crop `source` 복사. 이것도 `ignoredChunks`만 다루므로 `ignoredSegments`를 더한다

### 3.5 정할 것

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| D-C1 | tolerant JPEG의 디코더 회계 상한 | (가) 128 MiB 유지. 4:2:0 약 9.94 MP, 4:4:4 약 6.39 MP까지 / (나) tolerant만 256 MiB. 4:2:0은 픽셀 상한까지, 4:4:4는 약 12.8 MP까지 / (다) strict도 함께 올림 | **(나)**. 12 MP 휴대폰 사진이 가장 흔한 JPEG 입력인데 (가)는 이를 모두 거부한다. 상한은 회계값이고 실제 프로세스 메모리 보장이 아니라는 점은 지금 문서와 같다. (다)는 strict 동작을 바꾸므로 D1·#65 §4와 맞지 않는다 |
| D-C2 | strict로도 통과하는 파일을 tolerant로 색인할 때 레코드 profile | (가) tolerant / (나) strict | (가). 요청한 profile과 결과 profile이 같아 호출자가 예측하기 쉽다. 조건: 6.12a 때와 달리 tolerant JPEG 요청의 ID가 바뀐다는 점을 적는다(§3.4) |
| D-C3 | 받는 SOF | (가) SOF0·SOF1·SOF2 / (나) SOF0·SOF2만 | (가). SOF1 8-bit는 SOF0과 디코드가 같고 jpeg-js가 처리한다(`decoder.js:724-726`, Codex 2026-10-28 디코드 확인). 조건: SOF1 재현 픽스처(만든 방법·해시)를 테스트에 남긴다. 남기지 못하면 (나)로 줄인다 |

- D-C1 (나)는 strict를 바꾸지 않는다. strict의 추정식과 128 MiB 디코더 옵션은 그대로 두고 tolerant 경로에만 256 MiB를 쓴다(Codex 2026-10-28 동의)

- D-C1이 (나)면 6.12c 계획의 성능 게이트에 256 MiB 경계 입력(4:4:4 약 12.8 MP, 4:2:0 픽셀 상한)의 시간과 RSS를 기록 항목으로 넣는다

### 3.6 영향 범위

| 종류 | 위치 | 처리 |
|---|---|---|
| 제품 | `src/core/jpeg-validation.ts` | tolerant 검사기를 새 함수로 더한다. strict 경로는 그대로 |
| 제품 | `src/core/image-artifacts.ts`, `src/core/types.ts`, `src/server/index.ts` | 6.12a에서 만든 profile 선택에 JPEG tolerant 변형을 더한다 |
| 제품 | `src/core/image-crop.ts` | 픽셀 경로는 바뀌지 않을 것으로 본다. JPEG tolerant는 3채널이고 `source.channels` stride를 이미 쓴다. 출력 검증은 우리 인코더 출력이라 strict 그대로다. 다만 `source` 배열 복사(`:23-25`)에 `ignoredSegments`를 더해야 하고, 그 소유권 테스트를 6.12a crop 테스트처럼 둔다 |
| 테스트(유지) | `tests/jpeg-fixtures.test.ts`의 strict 거부, `tests/fixtures/jpeg/` | 그대로 둔다 |
| 테스트(추가) | tolerant 받기·거부 사례(§3.7) | 픽스처는 테스트 안에서 만들거나, 만든 방법과 해시를 `provenance.json`처럼 남긴다 |
| 스크립트 | `scripts/smoke-mcp.mjs` | 출력 스키마 변형 추가 |
| 문서 | `docs/image-artifacts.md` JPEG 절, 메모리 회계 절(4:2:0 식), README 이미지 절 | EXIF 방향 미적용, 실제 상한(MP) |
| 증거(유지) | `docs/research/evidence/task-22/`, `task-33/` | 고치지 않는다 |

### 3.7 테스트와 게이트

- 받아야 하는 경우
  1. 4:2:0·4:2:2(Y 2x1) baseline
  2. progressive 4:2:0(scan 사이 DHT 재정의 포함)
  3. DRI와 RST가 있는 baseline
  4. APP0 없이 APP1 EXIF로 시작하는 파일. 방향 6이면 `exifOrientation: 6`이고 픽셀은 회전하지 않는다
  5. APP2 ICC·APP13·COM이 있는 파일 → `ignoredSegments`에 남는다
  6. 깨진 EXIF(IFD 위치가 APP1 밖) → `exifOrientation: null`로 통과
  7. tolerant 색인 → inspect → crop → overview가 이어서 통과
  8. APP1–APP15·COM이 여러 번 반복되는 파일 → `ignoredSegments`가 종류별 한 번씩, 첫 등장 순서다
- 거부해야 하는 경우
  1. 산술 부호화, 12-bit, 회색조, CMYK, Y 4x1 같은 그 밖의 샘플링 → `unsupported_jpeg_profile`
  2. APP14 변환 0 → `unsupported_jpeg_profile`
  3. 고정 malformed 픽스처 → `malformed_jpeg`: scan 중간에서 자르고 EOI, jpeg-js가 거부하는 것을 확인한 특정 비트 변경(바꾼 위치·해시를 고정), EOI 뒤 바이트, RST 순서 오류. "임의의 비트 변경을 거부한다"는 테스트·문서 문장은 두지 않는다(§3.1)
  4. 발생 개수 상한을 둔다면 그 상한 + 1 → `unsupported_jpeg_profile`
  5. 회계 상한을 넘는 크기 → `jpeg_resource_limit`
  6. 같은 파일을 strict로 색인하면 지금처럼 거부된다
- 성능 게이트: strict JPEG 색인·crop 비회귀(§2.6과 같은 교대 측정). tolerant는 기록만 한다

## 4. 범위 밖 (기록만)

- 색 관리(ICC 적용), EXIF 방향 적용(회전)
- overview 위 격자선·좌표 글자, OCR 기반 영역 후보(#65 Q5)
- 회색조 JPEG·PNG

## 5. WBS·Findings

- 6.12 비고: 이 메모(6.12b·6.12c 사전 설계)와 결정 D-C1–D-C3
- N-25(새): strict JPEG의 실제 상한이 128 MiB 회계 때문에 약 6.39 MP다. 문서에 없다. 6.10(PR #76)에 D-5로 더한다

## 6. 교차 확인

- `gemini-4-argon`: APPROVE, [Minor] 3·[Nit] 1 → `codex_review/argon/2026-10-26_image-612bc-predesign-argon.md`. 모두 원문을 확인하고 반영했다
  - [Minor] DQT 재정의 규칙이 없다 → §3.2 DQT 행에 "SOF 전까지만 재정의"를 적었다
  - [Minor] strict `parseDht`가 id 2–3도 거부한다는 점이 빠졌다 → §3.2 DHT 행에 적었다
  - [Minor] 메모리 표의 시간이 번들을 만들며 다시 돌린 값과 다르다 → 두 번의 범위로 적었다. 판정은 같았다
  - [Nit] 4:2:0 근사식과 jpeg-js 계산의 차이 → 제품·문서 식은 jpeg-js 계산을 그대로 따르라고 적었다
  - Argon이 발췌본 밖이라 확인하지 못한 참조(PR #65·#70·#76, README L13-17, `src/server/index.ts:231`, `jpeg-validation.ts:77-78·134·136`)는 Claude가 원문에서 확인했다
- Codex 교차 검토(2026-10-28, main `59c33c9` 기준): **Request changes** → 반영
  - 그대로 확인됨: §2.3 정수 면적 평균(최대 반올림 분자 8,573,157,376 < 2^53, 단색 7×5→3×2와 2×2 체크 재현), §3.1 주요 관측과 128/256 MiB 경계 2행, D-C1–D-C3 권장
  - [Major] 비트 변경 일반을 거부 조건으로 적었다 → §1·§3.1·§3.2·§3.7을 고쳤다. Claude가 jpeg-js 0.4.4로 따로 재현했다(1,287개 중 1,285개 디코드)
  - [Minor] "APPn 종류 33개" 테스트는 만들 수 없다(종류 최대 17) → §3.2·§3.7에서 종류와 발생 개수를 나눴다
  - 보완: artifactId 호환성과 6.12a 코드의 넓힐 자리(§3.4), crop 복사·소유권(§3.6), overview 오류 순서(§2.4), D-C2·D-C3 조건(§3.5), RST 순서는 구조 검사가 맡는다(§3.1)
  - 위치: crop 설명 `src/server/index.ts:231`→`:237`(§2.5). `jpeg-validation.ts:77-78·134·136`, decoder 인용, README L13-17은 main `59c33c9`에서도 그대로다
- Argon(2026-10-28 반영분): APPROVE, #77 지적 없음 → `codex_review/argon/2026-10-28_pr76-77-crossreview-fix-argon.md`
