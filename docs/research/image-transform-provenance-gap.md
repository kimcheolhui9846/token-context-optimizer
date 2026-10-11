# 이미지 변환 provenance 격차 분석 (Task 29)

> **상태: 분석 및 제안.** 이 문서의 crop·no-op·provenance·writer 내용은 모두 후속 사용자 승인 전 제안이며, 구현된 기능이나 기존 동작이 아니다. Task 29 완료는 M2 구현이나 안전성 검증 완료를 뜻하지 않는다.

## 0. 범위와 근거

- 분석 기준 commit은 `73f201c638934905b1a038db3d2776e7c8872e27`이다. 이후 변경은 반영하지 않았다.
- 사실 근거의 우선순위는 현재 코드, 기존 문서, 이 문서의 제안 순이다. 코드와 문서가 다르면 코드를 따른다.
- 이 문서는 코드·테스트·의존성·공개 API를 바꾸지 않는다. 연구·실험 목적의 외부 조사, 모델/API 호출, 실험, 데이터 취득은 포함하지 않는다. 문서 작성·검토에 쓴 모델 보조는 이와 별개이며 handoff에 기록한다. F-12와 pilot 모델 선택도 결정하지 않는다.
- 작성자는 controller가 제공한 소스 발췌만 읽었고 명령을 실행하지 않았다. 발췌 밖의 내용(테스트 본문, `validateJpeg` 뒤쪽 helper, 서버의 allowed root 구성 코드 등)은 확인하지 않았다.
- 검토 보정(사용자 승인): controller가 설치된 `fast-png` 8.0.0의 `lib/index.js`와 `lib/png_encoder.js`를 직접 열람했다. 작성자는 controller가 전달한 그 발췌만 보았다. 이 보정에서 작성자와 controller는 encoder 소스를 읽기만 했고 encoder 실험을 실행하지 않았다. 확인된 범위는 §3.2에 적는다.

### 0.1 실행 근거와 열람 근거

| 종류 | 내용 | 해석 한계 |
| --- | --- | --- |
| 실행 (controller) | 이미지 대상 테스트 3개 파일: 20 pass, 1 skip (Windows에서 건너뛰는 FIFO 테스트) | 기존 원본 ingest/inspect·race·packaging 회귀가 base에서 통과했다는 뜻이다. 변환 동작의 검증이 아니다 |
| 실행 (controller) | 전체 25개 파일: 790 pass, 1 skip (같은 FIFO 테스트) | 기존 baseline이 통과 상태라는 뜻이다. 새 기능의 근거가 아니다 |
| 열람 (작성자) | 아래 소스 발췌와 세 테스트 파일의 테스트 제목 | 코드 구조와 테스트 의도를 읽은 것이다. 작성자가 재현한 결과가 아니다 |
| 열람 (controller) | 설치된 `fast-png` 8.0.0의 `lib/index.js`(9–17행)와 `lib/png_encoder.js`(7–9, 18, 20–23, 29–40, 99–101, 146행) | encoder export의 존재와 코드상 기본값을 읽은 것이다. 이 열람은 실행을 포함하지 않으므로 출력 프로필 적합성, 결정성, 출력 크기의 근거가 아니다 |

## 1. 현재 상태 표

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 원본 record | 구현됨 | [`src/core/types.ts`](../../src/core/types.ts)의 `ImageArtifactRecord`: `artifactId`, `path`, `sha256`, `byteLength`, `width`, `height`, `bitDepth`, `format`, `mimeType`, `channels`, `validationProfile` |
| 변환 이력·출력 관계 | 없음 | 같은 타입에 변환, 출력, 부모/자식 관계를 나타내는 필드가 없다 |
| 원본 index | 구현됨 | [`src/core/image-artifacts.ts`](../../src/core/image-artifacts.ts)의 `indexImageArtifact`: bounded read, 검증, SHA-256, record 저장 |
| 재검사 | 구현됨 | `inspectImageArtifact`: 재허가·재읽기 후 hash와 `byteLength` 비교, 형식별 재검증, record 사본 반환 |
| 메모리 store | 구현됨 | `ImageArtifactStore`, `MemoryImageArtifactStore`, `defaultImageArtifactStore`: scalar 메타데이터의 shallow copy를 주고받는다 |
| pixels·bytes 보관, 영구 저장 | 없음 | store는 record만 가진다. [`docs/image-artifacts.md`](../image-artifacts.md)에 따르면 record는 backup이 아니며 서버 재시작 시 사라진다 |
| bounded read와 상한 | 구현됨 (module-private) | `readBoundedSource`는 `MAX_BYTES`(10 MiB)로 읽는 크기를 제한한다. `MAX_AXIS`(8192)와 `MAX_PIXELS`(16,777,216)는 reader가 아니라 형식 검증 단계에서 적용되는 치수 상한이다. `readBoundedSource`는 export되지 않으므로 공개 API가 아니다 |
| PNG 검증 | 구현됨 (module-private) | `validatePng`: 8-bit, colour type 2 또는 6, non-interlaced만 허용한다. `IHDR`/`IDAT`/`IEND` 외 chunk를 거부하고 CRC·inflate 길이·filter를 검사한 뒤 `fast-png`의 `decode` 결과와 대조한다 |
| JPEG 검증 | 구현됨 | [`src/core/jpeg-validation.ts`](../../src/core/jpeg-validation.ts)의 `validateJpeg`: 검증과 decode 대조만 한다. 변환/encode API가 아니다 |
| 이미지 MCP 도구 | 구현됨 (2개) | [`src/server/index.ts`](../../src/server/index.ts)의 `index_image_artifact`, `inspect_image_artifact` |
| crop/resize/re-encode, 출력 쓰기, provenance manifest | 없음 | [`docs/image-artifacts.md`](../image-artifacts.md)의 Research boundary, [평가 프로토콜](image-first-evaluation-protocol.md) §10의 M2 행(계획) |
| 제한 RGB PNG crop과 그 provenance | 조건부 후보 제안 | 이 문서 §3–§8. 승인 전이며 첫 연산으로 선택된 것이 아니다 |

- 현행 PNG ingest는 RGB(`channels` 3)와 RGBA(`channels` 4)를 모두 받는다. `validationProfile`은 둘 다 `png-rgb8-static-v1`이므로 구분은 `channels`로만 가능하다.
- 기존 테스트는 원본 파일을 다룬다(제목 기준 열람).
  - [`tests/image-artifacts.test.ts`](../../tests/image-artifacts.test.ts): RGB/RGBA index와 원본 hash 보존, store 방어적 복사, allowlist·symlink·directory·FIFO 거부, chunk·프로필·치수·크기 거부, 재검사와 revoked/removed source.
  - [`tests/image-source-race.test.ts`](../../tests/image-source-race.test.ts): `vi.doMock`으로 `node:fs/promises`를 대체해 원본 교체 시나리오 4개를 결정적으로 재현한다.
  - [`tests/image-packaging.test.ts`](../../tests/image-packaging.test.ts): bundle의 license notice.
- 이 중 변환, 출력 쓰기, provenance를 검증하는 테스트는 없다.

## 2. 재사용 가능한 경계와 부족한 경계

### 2.1 재사용 후보

- **원본 identity.** `artifactId`는 canonical path와 원본 SHA-256을 NUL로 이어 hash한 값의 앞 16 hex에 `image_`를 붙인 것이다. 변환 provenance가 원본을 가리키는 기준으로 쓸 수 있다.
- **재허가·재검사 절차.** `inspectImageArtifact`의 unknown/denied/missing/changed 구분과 sanitized 오류 코드(`ImageValidationError`) 관례.
- **제한 프로필과 상한.** PNG 검증 규칙과 치수·픽셀·encoded-size 상한은 변환 입력 조건과 출력 재검증 기준이 될 수 있다.
- **store의 방어적 복사.** 메타데이터 record에 한해 그대로 쓸 수 있다.

### 2.2 부족한 부분

- **bytes가 없다.** `inspectImageArtifact`는 record 사본만 반환한다. `readBoundedSource`는 private이고 store는 pixels를 보관하지 않는다. 따라서 변환에는 새 캡처 단계가 필요하다.
- **캡처 단계 제안.** 원본을 재허가한 뒤 한 번만 캡처하고, 그 buffer 하나를 다음 순서로 끝까지 쓴다.
  1. 캡처한 bytes를 현행 규칙으로 검증한다.
  2. 캡처한 canonical path와 SHA-256(및 `byteLength`)을 원본 record와 대조한다.
  3. 같은 buffer를 decode한다.
  4. 같은 decode 결과에 transform을 적용한다.
  5. provenance의 원본 hash는 같은 buffer에서 계산한 값으로 기록한다.
- **TOCTOU.** inspect 후 임의로 다시 읽으면 검증한 bytes와 변환한 bytes가 달라질 수 있다. 재읽기를 추가한다고 TOCTOU가 사라지지 않는다. 캡처는 한 번이어야 한다.
- **identity의 의미.** 현행 identity는 경로와 원본 hash에 기반한다. 같은 bytes라도 다른 경로는 다른 원본이다. 이를 내용만의 identity나 immutable archive로 바꾸지 않는다.
- **자원 한도.** PNG 경로의 현행 상한은 입력 encoded size, 치수, 그리고 치수에서 계산한 inflate 출력 길이(`maxOutputLength`)이다. 그 밖의 명시적 총 메모리 예산은 없다. JPEG 경로에는 추정 메모리 상한 `MAX_MEMORY`(128 MiB, 초과 시 `jpeg_resource_limit`)와 decoder 옵션 `maxMemoryUsageInMB: 128`이 있다. 이들은 계산상의 buffer 한도이며 프로세스 전체 메모리나 시간에 대한 보장이 아니다. 변환 결과·출력 buffer의 메모리 예산과 출력 encoded-size 상한은 어느 경로에도 없다.
- **읽기 경계의 한계.** [`docs/image-artifacts.md`](../image-artifacts.md)는 현행 검사를 application-level 접근 제어로 규정한다. 적대적 동시 변경에 대한 race-proof sandbox가 아니며, Windows에서는 `O_NOFOLLOW`가 완전한 방어가 아니라고 명시한다. 이 한계는 변환에도 그대로 이어진다.

## 3. 최소 후보와 대안

첫 연산의 우선순위는 이 문서에서 정하지 않는다. §8 gate 1의 사용자 결정 항목이다. 아래의 제한 RGB PNG 정수 직사각형 crop → PNG는 그 결정에 쓸 조건부 후보의 상세안이다.

### 3.1 후보 연산과 프로토콜 입력 조건·arm의 대응

[평가 프로토콜](image-first-evaluation-protocol.md) §2의 네 입력 조건과 §3의 arm 규칙에 후보 연산을 대응시킨 표다. 앞의 네 열은 입력 조건 생성에서의 필요와, 그 조건의 source variant에 해당 연산을 직접 적용할 수 있는지를 적는다. 마지막 열은 arm 내부 변환에서의 필요다. 프로토콜 문장으로 정해지지 않는 칸은 `[검증 필요]`로 둔다.

| 후보 연산 | clean canonical 원본 | JPEG-only | downscale-only | combined | arm 내부 필요 |
| --- | --- | --- | --- | --- | --- |
| RGB PNG crop → PNG | 조건 정의에 crop이 없다. clean canonical 원본의 format은 [검증 필요]이다. 이 crop을 직접 쓸 수 있는 것은 배정된 variant가 제한 RGB PNG일 때뿐이다 | 조건 정의에 crop이 없다. 이 조건은 JPEG 재인코딩을 적용하므로 결과 source variant는 JPEG로 encode되어 있다. RGB PNG 전용 crop은 이 JPEG bytes를 직접 받을 수 없다. 이 variant에서 crop을 한다면 JPEG decode가 먼저 필요하다. 재인코딩 quality는 [검증 필요] | 조건 정의에 crop이 없다. 프로토콜이 이 조건의 출력 format·channels를 고정하지 않으므로 적용 가능 여부 [검증 필요] | 조건 정의에 crop이 없다. 마지막 단계가 JPEG 재인코딩이므로 결과 source variant는 JPEG로 encode되어 있다. RGB PNG 전용 crop은 이 JPEG bytes를 직접 받을 수 없다. 이 variant에서 crop을 한다면 JPEG decode가 먼저 필요하다. quality와 downscale 목표 치수는 [검증 필요] | E는 배정된 source variant에서 oracle crop을 만든다(명시). C·D는 selector가 crop을 만들 수 있다고 언급되지만 slot마다 crop을 요구한다는 문장은 없다. A는 full original, D의 fallback은 original이다. B의 crop 필요 여부 [검증 필요] |
| JPEG source decode → crop | 조건 정의에 없다. clean canonical 원본의 format은 [검증 필요]이므로 JPEG일 수 있는지도 [검증 필요] | 조건 정의는 사전 계획된 재인코딩이다. 그 재인코딩이 JPEG라는 것은 조건 이름(JPEG-only)과 combined 정의에서 도출한 것이다. 결과 variant의 format은 JPEG이다. 이 variant에서 crop이 선택되면 JPEG decode가 필요하다. 정해지지 않은 것은 format이 아니라 quality와 정확한 JPEG 프로필이다. 그 출력이 현행 제한 JPEG ingest 프로필을 통과하는지는 [검증 필요] | [검증 필요] (출력 format·channels 미고정) | 조건 정의는 downscale 뒤 JPEG 재인코딩이다. 결과 variant의 format은 JPEG이다. 이 variant에서 crop이 선택되면 JPEG decode가 필요하다. quality, 정확한 JPEG 프로필, 현행 제한 JPEG ingest 프로필 통과 여부는 [검증 필요] | E의 oracle crop이나 C·D의 selection crop이 JPEG-only 또는 combined variant에서 이루어지는 경우에는 JPEG decode가 필요하다. crop 출력의 format [검증 필요]. A와 D의 fallback은 original이다 |
| 긴 변 1536 이하 downscale (확대 없음) | 조건 정의에 없다 | 조건 정의에 없다 | 긴 변을 줄이는 downscale이 필요하다(확대 없음). stress recipe의 목표 치수가 후보 preset 1536과 같은지 [검증 필요]. 출력 format·channels [검증 필요] | downscale을 먼저 적용한다. 긴 변이 이미 preset 이하이면 identity resize가 될 수 있다. stress recipe의 목표 치수 [검증 필요] | 1536은 calibration 후보 preset이다. B는 naive resize/compression이고 B와 C는 가능한 한 같은 output transform 설정을 쓴다. 이 preset을 실제로 쓰는 arm과 D·E에서의 필요 [검증 필요]. A는 full original이다 |
| JPEG quality 75 encode | 조건 정의에 없다 | 사전 계획된 JPEG 재인코딩이 필요하다. 그 quality가 후보 preset 75와 같은지 [검증 필요] | 조건 정의에 없다. 출력 format이 고정되지 않아 JPEG encode 필요 여부 [검증 필요] | downscale 뒤 JPEG 재인코딩이 필요하다. 그 quality [검증 필요] | 75는 calibration 후보 preset이다. B의 compression에 해당할 수 있고 B와 C는 가능한 한 같은 설정을 쓴다. 이 preset을 실제로 쓰는 arm [검증 필요]. A는 full original이다 |
| PNG canonical 재인코딩 | clean canonical 원본을 만드는 데 재인코딩이 필요한지 [검증 필요] | 조건 정의에 없다 | 출력 format이 고정되지 않아 PNG 재인코딩 필요 여부 [검증 필요] | 조건 정의에 없다 (마지막 연산은 JPEG 재인코딩이다) | PNG canonical은 calibration 후보 preset으로 열거된다. 어느 arm의 출력에 쓰이는지 [검증 필요]. A는 full original이다 |

- 프로토콜은 optimizer가 비교할 후보 preset(PNG canonical, 긴 변 1536 이하 downscale, JPEG quality 75)과 입력 stress recipe를 manifest에서 구분한다. 이 표는 stress 조건의 resize가 1536을 쓴다거나 JPEG-only가 quality 75를 쓴다고 정하지 않는다.
- JPEG-only와 combined의 source variant가 JPEG로 encode되어 있다는 것은 미확인 format이 아니다. combined는 프로토콜의 조건 정의에서 나온다. JPEG-only의 조건 정의는 사전 계획된 재인코딩만 말하므로, 그 재인코딩이 JPEG라는 것은 조건 이름(JPEG-only)과 combined 정의에서 도출한 것이다. 미확인인 것은 stress quality, 정확한 JPEG 프로필, 현행 제한 JPEG ingest 프로필 통과 여부다.
- 프로토콜은 downscale-only 조건의 출력 format과 channels를 고정하지 않고, clean canonical 원본의 format도 [검증 필요]이다. 따라서 RGB PNG 전용 crop이 clean 조건에만 해당한다고 좁히지 않으며, 어느 한 연산만으로 한 입력 조건이나 한 arm이 충족된다고 주장하지도 않는다.
- 모든 arm은 해당 slot에 배정된 같은 source variant를 받는다. RGB 전용 crop을 직접 쓸 수 있는지는 그 variant의 format과 channels에 달려 있다. JPEG variant에서는 직접 쓸 수 없다.
- 각 행은 필요한 구성 요소일 뿐이다. 한 행이 구현되어도 arm 전체나 pilot(M5) 능력이 되지 않는다.
- 관계: §4.2 선택지 C(항상 재인코딩)와 PNG canonical 재인코딩은 PNG 재인코딩이라는 연산을 공유한다. 둘이 같은 preset·encoder 옵션을 쓰는지는 정해지지 않았다. 필요한 결정은 두 경로를 하나의 preset·옵션으로 묶을지 여부다(§8 gate 1, gate 2).

### 3.2 후보 비교

아래 표는 후보별 장점과 부담을 나란히 적은 것이며 순서는 우선순위가 아니다.

| 후보 | 장점 | 부담·위험 | 상태 |
| --- | --- | --- | --- |
| RGB PNG crop → PNG | resize 필터·반올림과 JPEG 손실이 없다. 기대 pixel을 독립적으로 계산할 수 있고 기존 PNG 검증 규칙으로 출력을 재검사할 여지가 있다 | encoder 프로필 적합성과 writer 안전성이 미확인이다 | 조건부 후보(상세안은 §4–§7). 첫 연산 여부는 §8 gate 1 |
| RGBA 포함 crop | 현행 ingest 범위와 일치한다 | alpha 처리, fixture, 후속 연산과의 상호작용 검증이 늘어난다 | 후보. 우선순위는 §8 gate 1 |
| resize 포함 | 프로토콜 M2 범위에 더 가깝다 | 필터 선택, 반올림 규칙, 구현 간 pixel 차이, 시각적 영향 검증이 필요하다 | 후보. 우선순위는 §8 gate 1 |
| JPEG 입력/출력 포함 | 형식 범위가 넓어진다 | 손실 재압축, encoder 설정, 제한 JPEG 프로필 충족 여부가 문제다. `validateJpeg`는 encode를 제공하지 않는다 | 후보. 우선순위는 §8 gate 1 |
| 한 번에 모두 구현 | 호출자 입장에서 한 번에 완결된다 | 범위와 검증 부담이 커지고 실패 원인 분리가 어렵다 | 후보. 우선순위는 §8 gate 1 |

- 현행 ingest는 RGB와 RGBA를 받지만 제안 crop은 RGB(`channels` 3)만 받는다. RGBA 입력은 명시적 오류로 거부하는 안이다.
- 출력 재검사에 쓸 수 있는 현행 경로는 `indexImageArtifact`뿐이다. `validatePng`는 module-private이고 export되지 않는다. 이 경로를 쓰면 (1) 출력이 허가된 read 경로 안에 있어야 하고, (2) 디스크에서 새로 읽으며, (3) store에 record가 삽입된다. 이 세 결과를 어떻게 다룰지는 설계 항목이다. 검증 로직의 내부 추출은 미래 선택지이며 현재 존재하는 export가 아니다.
- [`package.json`](../../package.json)은 `fast-png` 8.0.0과 `jpeg-js` 0.4.4를 고정한다. 현재 코드는 `fast-png`에서 `decode`만 import한다.
- 기존 decoder가 입력을 받아들인다는 사실은 다음을 증명하지 않는다.
  - encoder 출력이 제한 프로필(8-bit, colour type 2, non-interlaced, ancillary chunk 없음)을 만족하는지
  - 같은 입력에서 encoded bytes가 결정적인지
  - 시각적 안전성(작은 글자, crop 경계의 증거 보존)
  - 성능과 비용
- 위 네 항목은 이 분석에서 확인하지 않았다.
- encoder의 존재와 코드상 기본값은 controller가 설치된 `fast-png` 8.0.0을 열람해 확인했다(실행 아님).
  - `lib/index.js` 9–17행: `encodePng`를 `encode`로 export한다.
  - `lib/png_encoder.js` 7–9, 18행: zlib 기본값은 `level: 3`이고 `options.zlib`와 병합된다. 아래 세 항목도 같은 파일이다.
  - 20–23행: 기본은 non-interlaced이며 Adam7은 옵션이다. 99–101행: non-interlaced 경로는 scanline마다 filter 0을 쓴다.
  - 146행: `channels` 기본값은 4, `depth` 기본값은 8이다.
  - 29–40행: 입력에 palette나 text가 있으면 그에 해당하는 chunk가 추가될 수 있다. 따라서 모든 호출의 출력이 `IHDR`/`IDAT`/`IEND`만 가진다고 일반화하지 않는다.
- 위 열람 사실은 존재와 기본값에 한정된다. 제한 프로필 적합성과 encoded bytes 결정성은 여전히 §8 gate 2의 확인 대상이다. 이 코드 설정이 출력이 원본보다 작다는 것을 보장하지도 않으며, 이 문서는 출력 크기를 측정하지 않았다.
- 사용자가 전달한 PR 리뷰어의 scratch 실행 보고는 별개의 근거다. 이 문서는 그것을 저장소 검증 근거로 인용하지 않는다.
- 이 후보는 [평가 프로토콜](image-first-evaluation-protocol.md) §10 M2 행의 resize/crop/format 가운데 crop만 다룬다. 구현되더라도 M2 전체가 충족되지 않는다.

## 4. 제안 좌표 규칙과 full-frame 처리

### 4.1 좌표 (제안)

- 아래 규칙은 crop이 연산으로 선택될 때에만 적용되는 조건부 제안이다. 첫 연산은 §8 gate 1에서 정한다.
- 원점은 좌상단이고 단위는 pixel이다. x는 오른쪽, y는 아래로 증가한다.
- 입력은 정수 `x`, `y`, `width`, `height`이다.
- 영역은 half-open이다. 가로는 `x` 이상 `x + width` 미만, 세로는 `y` 이상 `y + height` 미만이다.
- `width`와 `height`는 양수이고 `x`와 `y`는 0 이상이다.
- 영역은 원본 경계 안에 있어야 한다. `x + width`는 원본 너비 이하, `y + height`는 원본 높이 이하이다.
- 네 값은 모두 safe integer여야 한다(승인 전 제안 세부). 경계 검사는 `width <= sourceWidth - x`, `height <= sourceHeight - y` 형태로 해서 `x + width` 덧셈이 정밀도를 잃지 않게 한다.
- 소수, 음수, 0 크기, 범위 초과, 정수가 아닌 값은 반올림하거나 clamp하지 않고 거부한다. 따라서 이 crop 후보에는 반올림 규칙이 없다.

### 4.2 전체 영역 crop (세 가지 선택지)

| 선택지 | 내용 | 장점 | 단점 |
| --- | --- | --- | --- |
| A. 명시적 no-op (권장 제안) | 원본 bytes와 hash를 그대로 유지하고 새 파일을 만들지 않는다. 출력 메타데이터는 원본을 참조한다 | 새 이미지 출력 쓰기가 없어 이미지 writer 위험을 피한다. 단, provenance 기록의 저장은 여전히 쓰기를 수반할 수 있다. 동일 pixel에 다른 hash가 생기지 않는다 | 출력이 원본을 참조한다는 사실과 새 파일이 없다는 사실을 따로 표현해야 한다. 호출자가 두 경우를 구분해 처리해야 한다 |
| B. 거부 | 전체 영역 요청을 오류로 처리한다 | 계약이 가장 단순하다. 출력은 항상 새 파일이다 | 호출자가 분기를 직접 구현해야 한다. 정당한 요청이 오류가 된다 |
| C. 항상 재인코딩 | 다른 crop과 같은 경로로 새 PNG를 쓴다 | 처리 경로가 하나다 | pixel이 같아도 bytes와 hash가 달라진다. encoder 결정성에 의존하고 불필요한 쓰기와 크기 변화가 생긴다 |

- A는 기존 초안의 승인 전 권장 제안으로만 유지하며 기존 동작이 아니다. no-op은 결정되지 않았고, 세 선택지 가운데 어느 것도 결정되지 않았다(§8 gate 1). 첫 연산도 결정되지 않았다.
- 선택지 C는 PNG canonical 재인코딩과 PNG 재인코딩 연산을 공유한다. 같은 preset·옵션을 쓰는지는 정해지지 않았다(§3.1의 관계 항목).
- A의 no-op도 재허가, 단일 캡처, 검증, 원본 record 대조를 그대로 수행한다. 그렇지 않으면 provenance가 확인하지 않은 hash를 단언하게 된다.
- no-op 요청에서 출력 경로 인자를 받을지, 무시할지, 거부할지는 정하지 않는다. 명시적인 미래 API 결정으로 남긴다.
- A에서는 출력 측 메타데이터가 source bytes/hash를 참조한다는 점과 새 파일을 만들지 않았다는 점을 서로 다른 정보로 기록한다. 하나에서 다른 하나를 추론하게 하지 않는다.
- 이 구분을 담을 manifest/API 필드명과 직렬화 계약은 확정하지 않는다.

## 5. 제안 provenance 항목

아래는 기록할 정보의 목록이다. 필드명과 구조는 확정하지 않는다.

| 묶음 | 항목 |
| --- | --- |
| 버전 | provenance 형식 버전 |
| 원본 | 원본 identity, 원본 canonical path 참조(직렬화 형태와 공유 시 절대경로 노출 정책은 후속 결정), SHA-256, `byteLength`, 너비·높이, format, channels, `bitDepth`, validation profile |
| 요청 | 호출자가 요청한 crop 값 그대로 |
| 유효 연산 | 실제 적용된 연산: crop 또는 no-op. 요청과 구분해 기록한다 |
| 출력 | SHA-256, 너비·높이, format, channels, `bitDepth`, `byteLength`. no-op이면 원본 참조와 새 파일 없음 표시. 출력 경로는 후속 정책 항목이다(§5.1) |
| 구현 | 변환 구현 버전, codec 패키지와 버전, 재현에 필요한 encoder 설정 |

- 원본 identity로 `artifactId`만 기록하지 않는다. `artifactId`는 경로에 의존하는 64-bit(16 hex) 절단값이므로 전체 SHA-256을 함께 기록한다.
- crop이 첫 연산으로 선택되는 경우 crop 단일 연산만 기록한다. 연산 조합의 순서와 좌표계 변환(예: crop 후 resize)은 별도 설계다.
- 후속 결정 항목: manifest 자체의 hash와 직렬화 형식, 저장 위치와 수명(현행 record는 재시작 시 사라진다), 쓰기 commit 방식, 공개 도구 이름과 입력·출력 schema.
- decoded pixel hash도 후속 결정 항목이다. encoded bytes의 hash와 별도로 둘지, 둔다면 치수·channels·`bitDepth`·raw buffer 표현과 직렬화를 어떻게 고정할지 정해지지 않았다. 프로토콜이 요구하는 필드가 아니고, encoded identity를 대신하지 않으며, 형식에 무관한 pixel 의미를 보장하지도 않는다.
- [평가 프로토콜](image-first-evaluation-protocol.md) §6의 호출 단위 manifest는 family ID, arm, 모델 snapshot, grader status, usage 등을 포함하는 pilot 전체 기록이다. 이 문서의 provenance는 그중 원본·출력 hash, 경로 참조, 형식, 치수, crop 좌표, preset 개념에 해당하는 일부(§5.1)만 다루며 pilot manifest를 대체하거나 구현하지 않는다.

### 5.1 프로토콜 §6 항목과의 대응

프로토콜 §6의 둘째 항목(원본·출력 파일 hash, 경로, 형식, 너비·높이, crop 좌표와 변환 preset)을 이 문서의 제안과 대응시킨다. 모두 승인 전 제안이며 필드명과 schema는 확정하지 않는다.

| §6 항목 | 이 문서 제안에 포함된 것 | 후속 결정 |
| --- | --- | --- |
| 원본 파일 hash | 캡처한 buffer에서 계산한 SHA-256 | 필드명·schema |
| 출력 파일 hash | 출력 encoded bytes의 SHA-256 | no-op일 때의 표현, 필드명·schema |
| 경로 | 원본 canonical path 참조를 명시적 제안 항목으로 둔다. 출력 경로는 원본 경로와 구분되는 별도 항목이며 이 제안에 값으로 포함하지 않았다 | 원본 경로의 raw 직렬화 형태, 공유 manifest의 절대경로 노출 정책, 출력 경로 정책, no-op의 출력 경로 인자 |
| 형식 | 원본 format과 출력 format을 모두 제안에 포함한다. 원본 format은 현행 record에 이미 있는 값이다. validation profile은 format과 별개 항목이다 | 출력 encoder 제한(옵션, 제한 프로필 적합성. §8 gate 2), 필드명·schema |
| 너비·높이 | 원본과 출력 모두 | 필드명·schema |
| crop 좌표 | 요청 값과 유효 연산(crop이 선택된 경우) | 연산 조합에서의 좌표계 |
| 변환 preset | preset이라는 개념만. 유효 연산과 구현 설정 기록이 이에 대응한다 | 실제 preset 선택, schema, 연산 순서 |

- `artifactId`를 기록하는 것은 원본 경로를 기록하는 것이 아니다. `artifactId`는 canonical path와 SHA-256을 함께 hash한 절단값이어서 거기서 경로를 복원할 수 없다. 그래서 원본 canonical path 참조를 별도 항목으로 제안한다.
- §6 호출 단위 manifest 최소 목록의 나머지 항목은 pilot manifest(M5) 범위이며 이 제안에 포함되지 않는다. family ID, split, domain stratum, input condition, arm, source variant ID, 모델 snapshot, 질문 hash, detail/output cap, selector/guard version과 이유, answer status, grader status, failure·timeout·retry, fallback 여부, preprocessing/OCR/selection/model latency, usage와 cost 또는 unknown, 생성 시각과 실행 config hash가 그에 해당한다. 프로토콜 132–137행 가운데 133행의 원본·변환 후 byte 수는 이 문서가 이미 제안한 원본·출력 `byteLength`에 대응한다. 132–137행의 그 밖의 항목은 이 제안의 범위 밖이다.
- 이 가운데 hosted 호출의 usage와 latency 관측은 M6와 관련된다. 다만 preprocessing·OCR·selection latency를 포함한 모든 latency가 M6에서 나오는 것은 아니며, 나머지 항목의 측정 주체는 이 문서에서 정하지 않는다.
- channels와 `bitDepth`, 출력 artifact identity, decoded pixel hash는 §6에 문자 그대로 있는 필드가 아니다. 이 문서의 별도 추가 제안이거나 후속 결정 항목이다.
- 출력 identity를 어떻게 정할지, 출력을 재-ingest할 때 store에 생기는 record를 어떤 의미로 다룰지는 정해지지 않았다.
- 이 대응은 M2의 일부에 관한 것이다. M2 전체나 pilot manifest의 충족을 뜻하지 않는다.

## 6. 쓰기 안전성 제안과 한계

현재 저장소에는 이미지 출력을 쓰는 코드가 없다. 아래는 모두 제안이며 검증되지 않았다.

- **원본 불변.** 변환은 원본을 쓰기용으로 열지 않는다. 변환 후 원본 hash가 그대로인지 확인한다.
- **alias 금지.** 출력 경로가 원본과 같은 파일을 가리키면 안 된다. 같은 경로, hardlink, symlink, junction을 모두 포함한다. 경로 문자열 비교만으로는 판별할 수 없다.
- **권한 경로와 부모 교체.** 출력 부모 directory의 canonical 경로가 허용 root 안인지 확인한다. 확인과 생성 사이에 부모가 교체될 수 있다는 점을 다룬다.
- **exclusive create.** 기존 파일을 덮어쓰지 않고 충돌은 오류로 처리한다.
- **부분 실패.** 임시 파일과 manifest 쓰기 중 한쪽만 성공하는 경우를 정의한다. 출력만 있고 provenance가 없거나 그 반대인 상태를 남기지 않는다.
- **정리와 재검사.** 실패 시 임시 산출물을 정리한다. 성공 시 쓴 파일을 다시 읽어 hash와 제한 프로필을 확인한다.
- **자원 한도.** decode·crop·encode의 메모리 예산과 출력 encoded-size 상한을 둔다. 산술상 `MAX_PIXELS`의 8-bit RGB raw pixel만 약 48 MiB(16,777,216 × 3 bytes)이다. inflate buffer, decode 사본, 출력 buffer가 여기에 더해진다. 실제 peak는 측정하지 않았다. crop 출력은 pixel 수가 줄어도 encoded size가 원본보다 작다는 보장이 없다. §3.2에서 열람한 encoder 기본값(zlib level 3, filter 0)도 이를 보장하지 않으며 이 문서는 실제 출력 크기를 측정하지 않았다.
- **chunk 처리.** 현행 PNG 검증은 ancillary/color chunk가 있는 입력을 거부한다. 변환이 이런 입력을 받아 chunk를 몰래 제거하거나 정규화하는 경로를 만들지 않는다.
- **encoded bytes 재현성.** 출력 bytes는 codec, zlib 설정, filter 선택에 좌우될 수 있다. 같은 입력에서 같은 hash가 나오는지는 별도 검증 대상이다. pixel 동등성과 byte 동등성은 구분한다. decoded pixel hash를 따로 둘지는 §5의 후속 결정 항목이다.

후속 결정으로 남기는 항목:

- read 권한과 write 권한의 분리 (현행은 read allowlist만 있다). core 함수는 `allowedRoots`를 생략하면 `[process.cwd()]`를 기본값으로 쓴다. 미래 write API가 이 암묵적 기본값을 write root로 물려받지 않게 하는 안이다
- Windows file-ID 기반 동일성 확인
- Windows 경로 별칭: 대소문자, 8.3 short name, ADS, 장치 이름, 확장 길이 경로
- 공유되는 manifest에 절대경로를 노출할지에 대한 정책
- 덮어쓰지 않는 안전한 publication/rename 방식 (미해결 writer 계약 gate). 임시 파일 후 rename은 보통 기존 대상을 교체하므로 exclusive create와 충돌한다
- 변환 후 원본 hash 확인이 실패했을 때의 정리 계약 (미해결 writer 계약 gate). 이 확인은 두 번째 읽기여서 변경을 감지할 뿐 막지 못하며, 이미 쓴 출력의 처리가 정의되지 않았다

한계:

- 현행 read allowlist와 원본 race 검사는 읽기 경로에 대한 것이다. 이것으로 write race가 해결됐다고 주장하지 않는다.
- Windows에서 검증 가능한 writer 전략이 정해지기 전에는 구현을 시작하지 않는다.

## 7. 미래 TDD 계획 (제안)

아래 테스트는 아직 존재하지 않는다. 기존 테스트는 이 동작을 검증하지 않는다. 사례는 crop 조건부 후보를 기준으로 쓴 것이며 crop이 첫 연산으로 선택됐다는 뜻이 아니다.

**fixture.** pixel 값을 손으로 계산할 수 있는 작은 독립 RGB PNG. 기대 출력 pixel은 구현과 무관하게 정한다.

| 범주 | 사례 |
| --- | --- |
| 정상 crop | 내부 영역의 정확한 좌표, 네 가장자리에 닿는 영역, 1-pixel 영역 |
| full-frame | 선택지 A가 승인된 경우에만: no-op, 새 이미지 파일 없음, 원본 hash 유지, no-op에서도 재허가·캡처·검증·record 대조 수행 |
| 잘못된 요청 | 소수, 음수, 0 크기, 범위 초과, RGBA 입력, 정수가 아닌 값, safe integer 범위를 넘는 값(`x + width` 정밀도 손실 사례) |
| 원본 상태 | 캡처 전후 source 변경, revoked root, 원본 record와의 hash 불일치, 변환 성공 후와 실패 후 각각 원본 bytes/hash 불변 |
| 출력 | 출력 경로 충돌, 원본과의 alias(같은 경로, hardlink, symlink/junction), 확인과 생성 사이의 부모 directory 교체, 부분 쓰기 실패 후 정리, manifest 없는 출력과 출력 없는 manifest |
| 자원 | 메모리 예산 초과, 출력 encoded-size 초과 |

- **RED.** 새 기능이 없어서, 또는 명시적 오류가 없어서 실패하는 테스트를 먼저 쓴다.
- **GREEN.** crop이 첫 연산으로 선택된 경우, crop 한 연산의 최소 구현. 출력을 기존 ingest 경로로 다시 넣어 제한 프로필, 치수, hash를 확인한다. `png-rgb8-static-v1`은 RGB와 RGBA에 공통이므로 `channels`가 3인지 따로 단언한다.
  - 현행 재-ingest는 `indexImageArtifact`이며, 허가된 read 경로, 디스크 재읽기, store 삽입을 수반한다. `MemoryImageArtifactStore`는 현재 export된 class이고 `indexImageArtifact`는 `store?: ImageArtifactStore`를 받으므로, 기존 테스트처럼 테스트 로컬 `MemoryImageArtifactStore`를 넘겨 store 삽입을 격리하는 것은 지금도 가능하다. 반면 검증 로직을 추출해 transform에서 재사용할지는 미래 구현 선택지이며, 여기서 정하지 않는다.
  - ingest는 pixel을 반환하지 않는다. 정확한 pixel 비교에는 테스트 쪽 decoder로 출력을 읽어 독립적으로 정한 기대값(oracle)과 대조하는 단계가 필요하다. 이 decoder가 검증 대상 codec과 독립적인지는 따로 확인해야 한다. 이는 현재 테스트에 없다.
- **REFACTOR.** 중복을 정리하고 기존 ingest/inspect 회귀(§0.1의 baseline)를 다시 실행한다.
- **race 주입.** 기존 [`tests/image-source-race.test.ts`](../../tests/image-source-race.test.ts)가 쓰는 `vi.doMock` 방식처럼, 파일 시스템 호출 사이에 결정적으로 끼어드는 주입 지점을 쓰기 경로에도 두는 안이다. 타이밍에 의존하는 테스트는 피한다.
- 이 테스트들이 통과해도 시각적 안전성, 모델 정확도, 비용의 근거가 되지 않는다.

## 8. 미래 구현 진입 gate

구현은 아래가 모두 정해진 뒤에 시작한다.

1. 사용자 결정: 첫 연산의 우선순위와 scope(§3.1·§3.2의 후보 가운데 무엇을 먼저 할지. RGB PNG crop 단일 연산은 조건부 후보의 하나다), 출력 계약(§4.2의 선택지, 그리고 선택지 C와 PNG canonical 재인코딩이 같은 preset·옵션을 쓸지), 공개 API.
2. codec 확인: 고정된 encoder의 출력이 제한 프로필을 만족하는지, encoded bytes가 결정적인지. §3.2의 열람 사실은 이 확인을 대신하지 않는다.
3. pixel/resource budget: 메모리 예산과 출력 encoded-size 상한의 수치.
4. source capture와 race-safe writer 전략. Windows에서 검증 가능한 방법, read/write 권한 분리, 덮어쓰지 않는 publication 방식, 원본 재확인 실패 시 정리 계약을 포함한다.
5. manifest 저장 위치, 직렬화, 서버 재시작 후 수명, 원본 canonical path의 직렬화 형태와 공유 manifest의 절대경로 노출 정책, 출력 경로 정책, 출력 identity와 재-ingest store 의미.

- 이 분석은 F-12와 pilot 모델 선정에 의존하지 않는다. 다만 실험 결과, 품질, 비용에 대해서는 아무것도 주장하지 않는다.

## 9. 미확인 사항

- 작성자는 발췌만 읽었다. 발췌 밖 코드(테스트 본문, JPEG helper, 서버의 root 구성 코드)는 보지 않았다.
- §0.1의 테스트 수치는 controller가 실행해 전달한 값이다. 작성자가 재현하지 않았다.
- `fast-png` 8.0.0 encoder의 존재와 코드상 기본값은 controller가 열람해 확인했다(§3.2). 작성자는 전달된 발췌만 보았다. 이번 보정에서 작성자와 controller는 encoder 소스를 읽기만 했고 encoder 실험을 실행하지 않았다. 사용자가 전달한 PR 리뷰어의 scratch 실행 보고는 이와 별개의 근거이며, 이 문서는 그것을 저장소 검증 근거로 인용하지 않는다. 이 문장은 §0.1의 controller baseline 테스트 실행과 무관하며 그 기록과 모순되지 않는다. 출력 프로필 적합성, 결정성, 출력 크기는 이 문서에서 확인하지 않았다.
- §6의 메모리 수치는 상수에서 계산한 산술값이며 측정값이 아니다.
- 제안한 출력 writer에 대한 Windows 경로 별칭 처리와 file-ID 기반 동일성 확인은 설계도 검증도 되지 않았다. 기존 원본 읽기 경로의 race 검사(같은 파일 snapshot 비교, junction 교체 시나리오)는 이와 별개로 이미 있다.
- JPEG 메모리 상한, PNG `maxOutputLength`, `allowedRoots` 기본값, 기존 race 테스트의 세부는 controller가 확인해 전달한 사실이다. 작성자가 발췌에서 직접 재확인하지 않았다.
