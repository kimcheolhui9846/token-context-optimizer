# JPEG tolerant profile 구현 계획 (WBS 6.12c)

> **작업자 안내:** 계획 승인·merge 및 별도 구현 지시 뒤 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`를 사용한다. 아래 구현 체크박스는 실제 실행 결과로만 갱신한다.

**목표:** strict 기본 계약을 보존하면서 명시적인 JPEG tolerant 색인과 profile별 재검증, inspect·overview·crop 연속 사용을 지원한다.

**아키텍처:** `jpeg-validation.ts`에 tolerant 전용 마커 구조 검사와 jpeg-js 디코드 경로를 추가한다. 기존 bounded reader 뒤에서 요청 profile로 검사기를 선택하고, 이후에는 저장된 실제 validationProfile로 재검증한다. strict 엔트로피 검사와 출력 JPEG 검증은 그대로 둔다.

**기술 스택:** 기존 TypeScript, Node.js crypto, jpeg-js 0.4.4, Zod, Vitest. 제품 의존성 추가 없음.

**범위와 승인:** Tier D 계획 PR. 시작 시 fetch한 `origin/main`은 `6e6b016baf917d727ba1a720428eecf07eb98dbf`(PR #82 merge)와 일치한다. 새 worktree의 `codex/jpeg-tolerant-plan`에서 이 계획 파일만 커밋한다. 입력은 [사전 설계 §3](../../../research/plans/2026-10-26-image-612bc-predesign.md), [6.12a 계획](2026-10-27-png-tolerant.md), [6.12b 계획](2026-10-28-image-overview.md)과 사용자 전달문이다. 구현·측정은 이번 PR에 포함하지 않는다.

## 1. 확정 결정과 전역 제약

- D1: 기본은 strict. 기존 `index_image_artifact` 인자 `profile: "tolerant"`로만 opt-in한다. 입력 스키마·기본값은 바꾸지 않는다.
- D2: EXIF 방향 1–8을 기록하되 회전하지 않는다. crop·overview 좌표와 치수는 저장된 픽셀 기준이다.
- D4: 6.12a 완료 → 6.12b 완료 → 6.12c 순서다. 6.10 전체 문서 묶음·6.4는 범위 밖이다.
- 10 MiB encoded bytes, 한 축 8192, 16,777,216 pixels 한도를 유지한다. ICC 색 관리, 회전, 회색조·CMYK·YCCK, 12-bit·lossless·산술 부호화는 구현하지 않는다.
- `research/`, `codex_review/`, `paper/`, 기존 증거, `tests/fixtures/*-base-tools.json`, 기존 `tests/fixtures/jpeg/`와 다른 사람의 worktree를 변경하지 않는다.
- strict PNG/JPEG의 기존 ID·필드·검사·오류·증거를 보존한다. PNG tolerant도 보존한다. 원본 파일이나 픽셀을 store에 쓰지 않는다.

| 항목 | 확정값 / 근거 |
|---|---|
| profile 이름 | `jpeg-ycbcr8-tolerant-v1` |
| D-C1 | (나) tolerant만 256 MiB. strict 추정식과 `maxMemoryUsageInMB: 128` 유지 |
| D-C2 | (가) strict로 통과하는 JPEG도 tolerant 요청이면 tolerant 레코드·다른 ID. strict 요청 ID 유지 |
| D-C3 | (가) SOF0·SOF1·SOF2. SOF1 합성 방법·hash와 디코드 테스트를 필수로 남김. 재현 불가이면 구현을 멈춰 (나) SOF0·SOF2 축소 근거를 보고하고 계획 변경 승인 후 진행 |
| APPn·COM 발생 개수 | 별도 상한 없음. 10 MiB 읽기 상한 내 최악 입력 시간을 기록. 종류는 최대 17개이며 별도 종류 상한도 없음 |
| 엔트로피 | A안: 우리 마커 구조 검사 + `jpeg-js`의 `tolerantDecoding: false`. strict `decodeEntropy` 확장 안 함 |
| 오류 | 새 코드 없음. `unsupported_jpeg_profile`, `malformed_jpeg`, `jpeg_resource_limit`, 기존 dimensions/reader/metadata 오류 사용 |

권장안과 다르게 정한 항목은 없다. D-C2는 의도한 호환성 변화다. **6.12a·6.12b의 JPEG tolerant 요청은 strict와 같은 ID·strict 레코드였지만, 6.12c부터 같은 파일의 tolerant 요청은 다른 ID·tolerant 레코드가 된다.** strict ID는 그대로다. 후속 README·사용 안내·구현 PR 본문에도 이 문장을 반영한다.

## 2. 현재 main symbol 지도

아래 위치는 `6e6b016` 기준이다. 구현 때 symbol을 다시 찾는다. 사전 설계의 `59c33c9` 줄 번호를 그대로 적용하지 않는다.

| 파일 / symbol | 현재 위치와 처리 |
|---|---|
| `src/core/jpeg-validation.ts` / `validateJpeg`, `validateJpegWithPixels`, `validateJpegInternal` | :22–24; strict 경로 보존, 별도 tolerant 함수 추가 |
| 같은 파일 / `parseDht`, `estimateMemory` | :127, :255; strict id 0–1/재정의 거부·추정식 보존 |
| `src/core/image-artifacts.ts` / `STRICT_PROFILES` | :14; 기존 strict 두 종류만 유지 |
| 같은 파일 / `indexImageArtifact` | :48; :57 JPEG 분기, :63 identityInput, :77 PNG 전용 레코드 필드 확장 |
| 같은 파일 / `inspectImageArtifact`, `readValidatedImageArtifact` | :84, :138; metadata 비교 호출 :99, :155의 PNG-only 조건 확장 |
| 같은 파일 / `validateForRecord`, `recordMetadataMatches` | :166, :179; JPEG profile 분기·tolerant 네 필드 비교 추가 |
| 같은 파일 / `cloneImageArtifactRecord`, `MemoryImageArtifactStore` | :311, :29; get/put과 반환 경계의 ignoredSegments 복사 추가 |
| `src/core/types.ts` / `ImageArtifactRecord` | :22; 현재 strict PNG/tolerant PNG/strict JPEG 3변형에 1변형 추가 |
| `src/core/image-crop.ts` / `cropImageArtifact` | :17, source 복사 :23–25; ignoredSegments 복사. 오류 순서·alpha·stride·출력 strict 검증 보존 |
| `src/core/image-overview.ts` / `overviewImageArtifact` | :56, source 복사 :67–70; #82가 추가한 확장 지점. ignoredSegments 복사, alpha/축소/출력 strict 검증 보존 |
| `src/server/index.ts` / `imageOutputSchema`, index/inspect 등록 | :168, :186/:199; 이전 :167에서 이동. 네 번째 변형과 index 설명만 변경 |
| 같은 파일 / `cropOutputSchema`, overview schema/등록 | :216, :252 이후; 공유 source union 전파. #82 overview output의 strict validation은 유지 |
| `scripts/smoke-mcp.mjs` / `assertImageOutputSchema` | :356; 현재 3변형 검사를 4변형으로. #82 이전 :289를 사용하지 않음 |
| `tests/image-crop-mcp.test.ts`, `tests/query-artifact-mcp.test.ts` / `withTolerantSchema` | :13, :10; 기존 PNG·query·overview delta 위에 JPEG 변형 delta 추가 |
| `tests/jpeg-fixtures.test.ts` / tools/list schema 검사 | :37–58; strict fixture 거부 유지, 출력 4변형 교차 검증 추가 |
| `tests/fixtures/jpeg/generate-fixtures.mjs` | :5 외부 scratch sharp 사용, :9–22 합성 RGB/4:4:4 생성; 파일 수정 없이 새 폴더 선례로 사용 |

image-artifacts/crop의 사전 설계 §3.4 지점은 그대로이며, #82로 server·smoke 위치가 이동하고 overview 복사 지점이 새로 생겼다. 기존 fixture 생성 스크립트는 4:4:4 전용이다. sharp 자체 기능과 이 스크립트의 현재 기능을 혼동하지 않는다.

## 3. 검사기 계약

### 3.1 인터페이스와 경계

`src/core/jpeg-validation.ts`에 다음 타입·함수를 추가한다. 기존 strict 함수의 signature/동작은 유지한다.

```ts
export type TolerantJpegMetadata = {
  width: number; height: number; channels: 3;
  format: "jpeg"; mimeType: "image/jpeg";
  validationProfile: "jpeg-ycbcr8-tolerant-v1";
  coding: "baseline" | "extended" | "progressive";
  sampling: "1x1,1x1,1x1" | "2x1,1x1,1x1" | "1x2,1x1,1x1" | "2x2,1x1,1x1";
  ignoredSegments: string[];
  exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
};
export function validateJpegTolerant(bytes: Buffer): TolerantJpegMetadata;
export function validateJpegTolerantWithPixels(bytes: Buffer):
  TolerantJpegMetadata & { pixels: Uint8Array };
```

두 wrapper는 같은 tolerant 내부 검사·디코드 경로를 사용한다. metadata-only도 실제로 끝까지 디코드하되 pixels를 반환하거나 store에 보관하지 않는다. bounded read·hash 검사는 기존 image-artifacts의 책임이며 검사기에서 파일을 읽지 않는다.

### 3.2 마커 상태와 표

1. SOI 후 길이 있는 세그먼트는 길이 ≥2와 파일 안의 끝을 검사한다. SOF 하나, SOS 하나 이상, 마지막 EOI 하나가 필요하다. 중복 SOI/SOF, 잘린 길이·payload, SOS 전 없는 참조, EOI 뒤 바이트는 `malformed_jpeg`다.
2. SOF0/1/2의 8-bit 3성분 YCbCr만 받는다. 성분 순서/ID는 Y=1,Cb=2,Cr=3으로 고정하고 중복을 거부한다. Y sampling은 1×1/2×1/1×2/2×2, Cb·Cr은 1×1. 그 밖의 부호화·정밀도·성분·sampling은 `unsupported_jpeg_profile`. 0치수/축·픽셀 상한은 기존 `image_dimensions_exceeded`다.
3. APP0는 없어도 된다. 있으면 기존 `isJfif`의 payload 조건으로 검사한다. APP14는 유효 Adobe payload의 transform=1만 받고 0/2 또는 해석할 수 없는 Adobe 선언은 `unsupported_jpeg_profile`. 모든 APPn·COM은 segment 경계를 먼저 검사한다. APP1 방향만 §3.3으로 읽고 ICC/COM 등을 픽셀에 적용하지 않는다.
4. `ignoredSegments`는 APP0–APP15·COM 이름을 첫 등장 순서로 한 번씩 기록한다. APP0/APP14 구조 검사 및 APP1 방향 추출을 했더라도 부가 payload를 출력 픽셀에 적용하지 않는다는 의미로 포함한다. 배열에는 payload 내용이나 경로를 넣지 않는다. 발생 개수 제한은 없고 Set+배열로 선형 순회한다.
5. DQT는 id 0–3, 값이 0이 아닌 8-bit 표만 받는다. 16-bit는 `unsupported_jpeg_profile`; 경계/표 내용 오류는 `malformed_jpeg`. SOF 전 재정의를 허용한다. SOF 참조 표는 그때 정의되어 있어야 하며, SOF 뒤 해당 id 재정의는 `malformed_jpeg`. 참조하지 않는 표 정의와 참조 표 변경을 구별한다.
6. DHT는 class DC/AC, id 0–3, 길이·count 합·정규 Huffman tree 유효성을 검사한다. scan 사이 재정의를 허용하고 SOS는 그 시점의 필요한 표만 참조한다. progressive DC/AC scan의 사용하지 않는 selector까지 표 존재를 요구하지 않는다. progressive AC EOBRUN(size=0, run 1–14)은 유효하므로 strict AC symbol 제약을 복사하지 않는다. strict `parseDht` id 0–1/중복 거부는 그대로다.
7. sequential SOS는 Ss=0,Se=63,Ah=Al=0. progressive는 0≤Ss≤Se≤63, DC는 Ss=Se=0, AC는 한 성분, Ah/Al 0–13 및 refinement Ah=Al+1을 검사한다. 성분 선택의 중복·미정의 참조를 거부한다. 실제 entropy/진행 상태 디코드는 jpeg-js에 맡긴다.
8. scan 내부는 FF00 stuffing, FF fill, RST, 다음 길이 있는 marker/EOI 경계를 순회한다. DRI payload 길이는 2바이트; RST는 유효한 nonzero DRI 아래 각 scan에서 D0부터 D7까지 순환해야 한다. scan 밖 RST·잘못된 순서·DRI 없는 RST는 `malformed_jpeg`. **jpeg-js는 잘못된 RST 번호도 받으므로 이 순서는 우리 코드가 검사한다.** entropy bit 단위 MCU 검사를 새로 만들지 않는다.
9. 첫 SOS에서 파싱을 끝내지 않는다. 다음 DHT/DQT/DRI/SOS를 처리하고 EOI까지 진행한다. 구조 검사·회계 상한 통과 뒤 원본 bytes를 실제 decoder에 전달한다.

```ts
const decoded = jpeg.decode(bytes, {
  tolerantDecoding: false, useTArray: true, formatAsRGBA: false,
  maxMemoryUsageInMB: 256, maxResolutionInMP: 16.777216,
});
// 실제 width/height와 data.length === width * height * 3을 확인한다.
```

구조 검사에서 unsupported/malformed/resource를 구분한다. 예상 할당 초과는 decode 전에 `jpeg_resource_limit`, decoder의 malformed entropy/예상하지 못한 marker·치수 불일치는 `malformed_jpeg`로 변환한다. 외부 decoder 메시지나 파일 경로를 공개 오류에 넣지 않는다. strict catch/오류 분류는 수정하지 않는다.

**손상 검출기가 아니다.** `tolerantDecoding: false`여도 다른 유효한 부호가 되는 scan 비트 변경은 다른 픽셀로 디코드될 수 있다. 임의의 비트 변경을 거부한다는 테스트·문구를 쓰지 않는다. 무결성은 색인 당시 전체 bytes의 `sha256`과 재읽기 때 `source_changed`가 담당한다. 색인 전에 바뀐 JPEG는 디코드 가능하면 통과할 수 있다.

### 3.3 EXIF

APP1의 `Exif\0\0` 뒤 TIFF에서 II/MM byte order와 magic42, IFD0 offset, count, 12바이트 entry를 해당 APP1 끝 안에서만 읽는다. offset 덧셈 전 남은 길이로 bounds를 검사하며 다른 APP1이나 scan을 참조하지 않는다. orientation tag0x0112, SHORT/type3, count1의 inline 값1–8만 반환한다. 없음·잘린 TIFF·IFD 범위 밖·다른 type/count·값0/9 등은 `null`로 통과한다. 여러 APP1은 파일 순서로 검사해 처음 유효한 orientation을 사용한다. 회전·ICC 적용은 없다. 방향6도 치수/픽셀을 바꾸지 않고 crop·overview를 그대로 수행한다.

### 3.4 정확한 decoder 회계

설치된 jpeg-js 0.4.4 `lib/decoder.js`의 `prepareComponents`(:578–619), 할당(:525,:603,:706,:776,:885,:1121)을 기준으로 한다. 새 설치 시 같은 버전 소스를 확인한다. 다음 계산은 근사 MP 식이 아니라 decoder 계산을 그대로 따른다.

```ts
const maxH = Math.max(...components.map(c => c.h));
const maxV = Math.max(...components.map(c => c.v));
const mcusPerLine = Math.ceil(width / 8 / maxH);
const mcusPerColumn = Math.ceil(height / 8 / maxV);
let estimatedBytes = width * height * 6; // getData RGB + 반환 RGB
for (const c of components) {
  const blocksPerLine = Math.ceil(Math.ceil(width / 8) * c.h / maxH);
  const blocksPerColumn = Math.ceil(Math.ceil(height / 8) * c.v / maxV);
  estimatedBytes += 256 * (mcusPerLine * c.h) * (mcusPerColumn * c.v);
  estimatedBytes += 64 * blocksPerLine * blocksPerColumn;
}
estimatedBytes += dqtDefinitionCount * 256;
estimatedBytes += dhtAllocationBytes; // 각 정의마다 16 + symbolCount를 누적
```

`components`는 SOF의 h/v, `dqtDefinitionCount`와 `dhtAllocationBytes`는 전체 구조 순회에서 누적한다. 재정의된 옛 표도 decoder 회계에서 차감되지 않으므로 최종 활성 표 개수만 세면 안 된다. 256×1024×1024보다 크면 거부, 같으면 허용한다. 16의 배수가 아닌 치수와 DHT 재정의 누적 경계를 테스트한다. strict `estimateMemory = 960*ceil(W/8)*ceil(H/8)+6WH+표회계` 및 128 MiB 옵션은 변경하지 않는다.

문서의 약 6.39 MP(strict 4:4:4), 약 12.8 MP(tolerant 4:4:4), tolerant 4:2:0의 픽셀 상한 16,777,216은 사전 설계의 규모 설명이다. 정확한 합격 여부는 치수 정렬·표 정의 수를 포함한 위 식으로 결정한다. 회계는 입력 복사, JS 객체/문자열·COM 내용·runtime까지 포함한 프로세스 RSS 상한이 아니다. §8에서 실제 시간/RSS를 별도로 기록한다.

## 4. 색인·레코드·배열 소유권

`ImageArtifactRecord` 공통 필드에 §3.1의 pixels 없는 JPEG tolerant 변형을 추가한다. `bitDepth: 8`, `channels: 3`, `coding`, `sampling`, `ignoredSegments`, `exifOrientation`은 필수다. strict JPEG에는 새 필드를 붙이지 않고 PNG의 alpha/ignoredChunks도 JPEG에 붙이지 않는다.

현재 `indexImageArtifact`는 SOI이면 profile과 무관하게 `validateJpeg`를 호출한다. 이를 다음 의미로 바꾼다.

```ts
const metadata = isJpeg
  ? (input.profile === "tolerant" ? validateJpegTolerant(bytes) : validateJpeg(bytes))
  : (input.profile === "tolerant" ? validatePngTolerant(bytes) : validatePng(bytes));
// isJpeg는 현재 SOI 판정, bytes는 기존 readBoundedSource의 source.bytes다.
const identityInput = `${source.path}\0${sha256}` +
  (STRICT_PROFILES.has(metadata.validationProfile) ? "" : `\0${metadata.validationProfile}`);
```

`STRICT_PROFILES`에 JPEG tolerant를 넣지 않는다. 기존 sha256(identityInput)의 16자리와 `image_` 접두사를 보존한다. 동일 파일의 strict/tolerant ID가 다르고 서로 덮어쓰지 않으며, 같은 profile 재색인 ID는 안정적이어야 한다.

- index 필드 구성과 `cloneImageArtifactRecord`에 ignoredSegments 복사를 추가한다. put 인수/get 반환/index 반환/inspect 반환을 격리한다.
- `validateForRecord`는 JPEG의 실제 validationProfile로 strict/tolerant 및 withPixels 함수를 선택한다. `recordMetadataMatches`와 inspect·재읽기 호출 조건을 PNG tolerant뿐 아니라 JPEG tolerant에도 적용한다.
- 공통 치수·format·mimeType·channels·bitDepth·profile과 coding/sampling/exifOrientation/ignoredSegments 내용·순서를 모두 비교한다. 누락·다른 값·배열 아닌 값은 `decode_failed`. 잘못된 metadata를 빈 배열로 정규화하지 않는다.
- `cropImageArtifact`와 `overviewImageArtifact`의 별도 source 복사에도 ignoredSegments 배열을 복사한다. 참조를 그대로 반환하는 custom store에서 source 반환값을 push/reverse해도 다음 inspect/overview/crop과 저장값이 변하지 않아야 한다. malformed 배열 값은 복사 경계에서 은폐하지 않는다.
- 읽기 순서 `readBoundedSource → hash/byteLength 비교 → record profile 검사 → metadata 비교` 및 6.9 reader 오류 매핑을 보존한다. 원본 변경은 `source_changed`, 파일 고정 상태의 재검사 metadata 불일치는 `decode_failed`다.
- crop 기존 순서 invalid_region → artifact_not_indexed → source 복사 → region_empty → 재검증 → region_out_of_bounds → full-frame original → resize_required → alpha를 유지한다. overview 입력 → lookup → 재검증 → alpha → encode → 출력 검증도 유지한다.
- JPEG tolerant는 RGB 3채널이다. PNG alpha 조건·stride·overview 면적 평균은 수정하지 않는다. crop/overview가 만든 JPEG 출력은 여전히 **strict `validateJpeg`**로 검사한다.

## 5. MCP·문서 계약과 영향 표

### 5.1 공개 delta

`imageOutputSchema`의 기존 세 변형을 유지하고 JPEG tolerant를 네 번째로 추가한다. §3.1의 coding/sampling은 enum, exifOrientation은 정수1–8 또는 null, ignoredSegments는 string array로 필수화한다. index/inspect 출력, crop original/rejected/cropped의 source, overview source에 전파한다. crop/overview 출력 validation과 입력·도구 순서·text/image 분리는 유지한다.

index 설명은 아래 문구로 교체한다. 입력은 기존 `{path,profile?}` 그대로다.

> Validate and index a bounded PNG or JPEG without retaining pixels. Validation defaults to strict; use profile tolerant to accept PNG ancillary chunks or supported subsampled, extended sequential, progressive, and metadata-bearing YCbCr JPEGs. EXIF orientation is reported but not applied; images may appear rotated when orientation is not 1. Validation is not corruption detection.

두 MCP 테스트의 `withTolerantSchema` 선례를 따라 frozen JSON에 기존 PNG/query/overview delta를 적용한 뒤 JPEG tolerant 변형과 index 설명 차이만 더한다. expected를 actual 전체에서 복사하거나 도구 비교를 생략하지 않는다. `tests/jpeg-fixtures.test.ts`와 smoke의 3→4 변형 검사, 필수 누락·교차 profile·잘못된 enum/null 허용 범위를 갱신한다.

### 5.2 문서 수정 계획

후속 구현에서 `docs/image-artifacts.md` JPEG 절·메모리 회계 절, README 이미지 절, `skills/optimize-context/SKILL.md` 입력 안내를 함께 맞춘다. strict 기본/선택 tolerant, D-C2 ID 변화, 저장 픽셀 좌표·EXIF 방향 미적용, ICC 미적용, 손상 검출 아님/sha256 재읽기, 정확 회계식과 실제 MP 규모를 적는다. 기존 정확값을 overview에서 읽지 말라는 경고와 고정 링크를 보존한다. #82 Nit 두 건(SKILL 줄바꿈·crop 제한 중복)은 SKILL 수정 시 국소 정리한다. 6.10 전체 문서는 수정하지 않는다.

### 5.3 사전 설계 §3.6 전 행 및 추가 지점

| 대상 | 분류 / 후속 구현 내용 |
|---|---|
| jpeg-validation.ts | **Add** tolerant 함수/구조 검사/회계; strict validate/parseDht/decodeEntropy/estimateMemory **Maintain** |
| image-artifacts.ts | **Modify** JPEG profile 분기, 레코드 구성, validateForRecord, recordMetadataMatches와 두 호출부, clone; STRICT_PROFILES/reader/PNG 검사 **Maintain** |
| types.ts | **Add** JPEG tolerant union member; 기존 세 변형 **Maintain** |
| server/index.ts | **Modify** 공유 source union과 index 설명; 나머지 도구 입력/출력 계약 **Maintain** |
| image-crop.ts | **Modify** source.ignoredSegments 복사; 픽셀·alpha·오류·strict 출력 검증 **Maintain** |
| image-overview.ts (#82 추가) | **Modify** source.ignoredSegments 복사; 축소/alpha/출력 strict 검증 **Maintain** |
| tests/jpeg-fixtures.test.ts / tests/fixtures/jpeg/ | 기존 strict 거부 기대값과 기존 fixture **Maintain**; schema 테스트만 **Modify** |
| tolerant 받기·거부 사례 | **Add** tests/jpeg-tolerant.test.ts; **Modify** image-artifacts/image-crop/image-overview 테스트에 ID·재검증·소유권 사례 추가 |
| frozen *-base-tools.json | **Maintain**; image-crop-mcp/query-artifact-mcp의 명시적 expected delta **Modify** |
| tests/fixtures/jpeg-tolerant/ | **Add** 합성 파일, generate-fixtures.mjs, provenance.json; 기존 JPEG 폴더 **Maintain** |
| scripts/smoke-mcp.mjs | **Modify** 4변형과 synthetic tolerant JPEG index→inspect→overview→crop; strict/PNG smoke **Maintain** |
| docs/image-artifacts.md / README.md | **Modify** JPEG opt-in·EXIF·ID·손상 검출 한계·정확 메모리 회계 |
| skills/optimize-context/SKILL.md | **Modify** 입력 안내와 #82 국소 Nit; 다른 workflow **Maintain** |
| docs/research/evidence/task-22/, task-33/ 및 모든 기존 증거 | **Maintain**; 새 증거만 docs/research/evidence/wbs-6.12c/에 **Add** |
| scripts/measure-jpeg-tolerant.mjs | **Add** 후속 strict A/A/B 게이트 및 tolerant 기록용; 이번 계획에서 생성/실행 안 함 |
| read-bounded-file/core/image-source-race/image-packaging 및 기존 crop 경계 테스트 | **Maintain** 기존 기대값; 후속 회귀 실행 |
| package.json/package-lock.json, research/, paper/ | **Maintain**; 빌드 번들 bin/token-context-optimizer.mjs만 후속 정상 build로 **Modify** |

## 6. 합성 fixture와 테스트 매트릭스

### 6.1 생성·provenance

새 `tests/fixtures/jpeg-tolerant/`에 합성 fixture·생성 스크립트·provenance.json을 둔다. 실제 사진/스크린샷·외부 개인정보는 넣지 않는다. 작은 malformed 변형은 테스트 안 byte 생성도 가능하지만 변형 방법·부모 hash·offset/old/new byte·최종 hash를 고정한다. 큰 성능 입력은 새 scratch에서 생성해 증거에 상대 경로·hash만 남긴다.

- 4:2:0 baseline/progressive는 기존 외부 scratch sharp 선례를 사용하되 실제 사용 encoder/libvips 버전·옵션·원본 RGB 수식/seed·생성 스크립트 hash·출력 치수/크기/hash를 provenance에 남긴다. package 의존성은 늘리지 않는다. 필요한 외부 도구가 없으면 설치를 임의로 진행하지 않고 승인 경계를 따른다.
- 4:2:2(수평/수직), restart, SOF1은 재현 가능한 작은 수제 JPEG로 만든다. 예: constant128, 32×16, DQT 값1, DC category0·AC EOB에 code0(length1)의 최소 DHT, MCU당 성분 블록 수에 맞춘 0 bits 및 마지막 1 padding/FF00 stuffing. DRI=1, 각 MCU 경계에서 DC predictor를 reset하고 D0부터 순서대로 RST를 넣는다. 단순히 arbitrary entropy에 RST를 끼워 넣지 않는다.
- SOF1은 위 유효 8-bit sequential fixture의 SOF0 C0→C1 변경으로 재현하고 원본/변형 hash·marker offset을 남긴다. 검사기와 실제 jpeg-js 디코드 성공·RGB 치수를 확인해야 D-C3 조건을 충족한다.
- APP1은 최소 II/MM TIFF orientation, APP2는 합성 ICC 표식, APP13/COM은 합성 payload를 길이와 함께 삽입한다. APP14 Adobe transform1 정상 fixture에서 offset의 값0/2 변형을 만든다. ICC 프로파일을 실제 적용하거나 실제 사진 metadata를 복사하지 않는다.
- RST D0→D5와 EOI trailing/truncation 및 decoder가 거부하는 특정 scan bit 변형을 고정한다. 거부를 먼저 실제 jpeg-js로 확인한 뒤 위치/hash를 저장한다. 임의 비트 변형 전체의 거부를 기대하지 않는다.
- fixture 생성은 후속 구현 단계다. 이번 계획 PR에서 hash·실행 성공을 만들어 기록하지 않는다. 테스트는 체크인된 fixture hash/provenance를 검증하며 외부 sharp 없이 실행 가능해야 한다.

### 6.2 사전 설계 §3.7 — 받음 8건·거부 6건

| ID | 입력/검사 | 기대값 |
|---|---|---|
| A1 | 4:2:0 및 4:2:2(Y2×1) baseline | tolerant 성공, coding baseline, 정확 sampling; 수직1×2도 추가 |
| A2 | progressive4:2:0, scan 사이 DHT 재정의 포함 | coding progressive, 실제 decode 성공 |
| A3 | DRI/RST baseline | 올바른 D0–D7 순환 허용; 8개 초과와 새 scan reset 확인 |
| A4 | APP0 없이 APP1 EXIF 방향6 | exifOrientation6, 픽셀/치수 회전 없음 |
| A5 | APP2 ICC·APP13·COM | 첫 등장 순서 ignoredSegments, 색 관리 없음 |
| A6 | IFD 위치 APP1 밖 등 깨진 EXIF | null로 성공; II/MM, 값0/9, type/count/short payload도 추가 |
| A7 | tolerant index→inspect→crop→overview | 네 경로 성공; 추가로 요청 순서 index→inspect→overview→crop도 실행 |
| A8 | APP1–APP15·COM 반복(유효 APP14 transform1) | 종류별 한 번, 첫 순서; APP0 포함 사례도 별도 확인 |
| R1 | 산술/lossless/12-bit/회색조/CMYK/Y4×1 등 | unsupported_jpeg_profile |
| R2 | APP14 transform0/2 | unsupported_jpeg_profile |
| R3 | 고정 scan truncate+EOI, 검증된 특정 비트 변형, EOI 뒤 bytes, RST 오순서 | malformed_jpeg; 고정 mutation hash/방법 기록 |
| R4 | 발생 개수 상한+1 | **적용 안 함**: 별도 상한을 두지 않음. 대신 §8 최대 개수 입력과 기존10MiB 초과 encoded_size_exceeded 확인 |
| R5 | 정확 회계256MiB 초과, 정렬/표 재정의 누적 경계 | jpeg_resource_limit; 경계 이하 성공과 decode 전 거부 확인 |
| R6 | A1–A5 등의 strict 미지원 파일을 strict로 요청 | 기존 strict 거부 유지. strict 지원4:4:4 파일은 이 행의 거부 대상이 아님 |

| 추가 계약 | 구체 검증 |
|---|---|
| SOF1 | synthetic fixture 실제 decode 성공, coding extended, provenance hash 일치 |
| D-C2 | 같은 strict 지원 JPEG를 생략/strict/tolerant로 색인: 생략=strict 기존 ID, tolerant 다른 ID/profile, store2개; 각 profile 재색인 안정 |
| 표 상태 | DHT id2/3, progressive 재정의/EOBRUN 허용; 미정의 참조·잘린 표 거부; SOF 전 DQT 재정의 허용/참조 DQT SOF 후 거부; strict 기대값 불변 |
| metadata | 파일/hash 고정, coding/sampling/exifOrientation/ignoredSegments 각각 값·순서·누락·타입 변조 → inspect/재읽기/overview/crop decode_failed |
| 배열 격리 | put/get/index/inspect 및 crop original/rejected/cropped/overview source 배열 push/reverse 후 store와 다음 호출 불변; 참조 반환 custom store 포함 |
| 재읽기 | 유효하게 재인코드한 다른 JPEG로 원본 교체해도 inspect/overview/crop source_changed; arbitrary corruption 거부와 구분 |
| 오류/출력 | 기존 reader/race/packaging 우선순위와 경로 비노출; crop/overview strict output metadata 및 store 크기·원본 bytes 불변 |
| MCP | 네 변형의 필수 필드·enum·1–8/null·format/mime/profile 상관관계; 모든 source 위치; textJSON=structuredContent, image base64는 content만 |
| strict/PNG 회귀 | 기존 strict 두 profile ID/필드 및 PNG tolerant alpha/ignoredChunks, strict JPEG fixture 거부, overview/crop alpha 정책 유지 |

## 7. 후속 구현 순서 (하나의 구현 Task 내부 단계)

이번 PR에서는 아래를 실행하지 않는다. 계획 merge 후 구현 handoff와 Tier E 절차를 적용한다. 각 RED는 컴파일되는 stub의 **잘못된 반환값/동작**에서 관찰하고 import·컴파일 실패나 단순 not-implemented throw를 RED로 세지 않는다.

### 단계 0 — 손대지 않은 기준

- [ ] 기준 `6e6b016`의 소스/lockfile/hash를 보존하고 기존 lockfile로 설치한다. `npm.cmd run build` → `npm.cmd run typecheck` 오류0을 기록한다.
- [ ] §9 대상 중 기존 11파일 회귀 baseline을 **stub 작성 전에** 실행·기록한다. 새 jpeg-tolerant.test.ts는 아직 없으므로 baseline 명령에서 제외한다. #82 Note N-1의 사후 재검증을 사전 baseline으로 대체하지 않는다.
- [ ] 새 fixture 생성/provenance와 실제 jpeg-js decode를 확인하고 §8 측정 조건·warmup3회·입력 hash를 결과 관찰 전에 고정한다.

### 단계 1 — tolerant 구조·decode·회계

**파일:** jpeg-validation.ts, 새 jpeg-tolerant.test.ts 및 jpeg-tolerant fixture 폴더. **입출력:** §3.1 Buffer→metadata/metadata+pixels.

- [ ] RED: 타입과 컴파일되는 stub을 추가한 뒤 baseline fixture에 잘못된 coding/sampling 값을 반환하게 하여 A1/SOF1 assertion 실패를 기록한다. typecheck 오류0 확인. A2–A6/R1–R5·표/회계 사례를 구체 기대값으로 추가한다.
- [ ] GREEN: §3 상태 검사·정확 회계·실제 decode를 구현한다. 테스트 전체를 mocked decode 성공으로 대체하지 않는다.
- [ ] REFACTOR: tolerant 전용 parsing/EXIF/accounting helper를 정리하고 strict 코드·기존 fixture 거부 기대값이 그대로인지 확인한다.

### 단계 2 — 레코드·재검증·소유권

**파일:** types.ts, image-artifacts.ts, image-crop.ts, image-overview.ts 및 해당 테스트. **입출력:** 기존 profile 인자→네 변형 레코드, 저장된 profile→재검사 pixels.

- [ ] RED: 기존 JPEG tolerant 요청이 strict ID/profile을 반환하는 행동 실패와 source 배열 공유·metadata 불일치 미검출을 각각 기록한다. A7/A8, D-C2, custom-store 격리·원본 변경 사례를 추가한다.
- [ ] GREEN: §4의 분기/레코드/비교/복사만 변경한다. alpha·reader·출력 strict 검증은 유지한다.
- [ ] REFACTOR: 필요한 소유권 중복만 국소 정리하고 strict/PNG 및 overview·crop 오류 순서를 재검증한다.

### 단계 3 — MCP·문서·전달

**파일:** server/index.ts, 두 MCP 테스트, jpeg-fixtures.test.ts schema 절, smoke-mcp.mjs, README/image-artifacts/SKILL, 새 측정 스크립트·새 증거.

- [ ] RED: 기존 세 변형 스키마가 JPEG tolerant 레코드를 거부하는 실제 assertion 실패를 기록한다. 네 변형/crop·overview source/명시적 fixture delta/연속 호출을 추가한다.
- [ ] GREEN: §5의 정확 delta와 synthetic tolerant smoke를 구현한다. 문서의 strict 한정과 D-C2 변화·EXIF·손상 검출 한계를 맞춘다.
- [ ] REFACTOR: 문서 중복만 국소 정리하고 §8 성능 게이트·§9 전체 gate·검토를 완료한다. blocker/major 해소 후 push/Draft PR, PR 후 최종 검증과 직접 리뷰를 기록한다. Ready/merge는 사용자 승인 대상이다.

## 8. 후속 성능 게이트

### strict — 세 연산 모두 필수 통과

- 대상: strict JPEG 색인, strict JPEG **부분** crop, strict PNG 색인. jpeg-validation/image-artifacts가 바뀌므로 unchanged-file proof로 대체/생략할 수 없다.
- 입력: synthetic strict JPEG4:4:4 2048×1536, strict RGB PNG4096×4096, 각각10MiB 이내. JPEG crop=(0,0,1024,768)로 고정한다. 실제 strict baseline 수용과 hash/치수/크기를 먼저 확인한다.
- 같은 프로세스에서 A=main `6e6b016`, A′=그 기준의 별도 복사본, B=현재를 별도 module instance/store로 로드한다. dependency/runtime/build 방식/입력/allowed roots를 동일하게 한다. 준비·색인(crop용)·모듈 로딩은 timed section 밖, crop의 재읽기·검증·encode는 안에 둔다.
- 고정 warmup3회 후 각 연산에서 A→A′→B 순서로 **9회 교대** 측정한다. 각 변형 raw9개, 단위·순서·median·비율을 남긴다. 기준 소스를 수정하거나 B만 다른 decoder 옵션으로 호출하지 않는다.
- `median(A′)/median(A)`가 **0.97–1.03 밖이면 측정 무효**. 유효할 때 `median(B)/median(A) ≤ 1.03`이어야 통과다. 세 연산 모두 충족해야 한다.
- 세 소스 hash와 기준 commit/B commit·dirty 상태, hash가 checkout CRLF인지 commit blob인지 명시한다. A/A′/B는 동일 hash 기준을 사용한다. input bytes hash/크기/치수·runtime·dependency 버전도 남긴다.
- 실패/무효이면 멈춰 보고한다. 임계값·기준·입력·표본을 사후 변경하거나 유리한 재실행만 골라 통과시키지 않는다.

### tolerant — 기록만, 합격 게이트 아님

- 256 MiB 근처4:4:4(약12.8MP)는 정확 §3.4 식으로 경계 이하/초과 치수를 먼저 확정해 남긴다. 4:2:0 픽셀 상한8192×2048, 12MP4:2:0 4032×3024, progressive4032×3024도 측정한다. 입력은 모두10MiB 이하 합성 파일이다.
- 같은 warmup3회·9개 원시 색인 시간과 성공/거부 코드, RSS 전/후 및 관측 peak를 기록한다. RSS는 격리된 hidden child를 부모에서 표본 수집하고 샘플 간격·단위·peak 관측 한계를 남긴다. decoder 회계256MiB를 RSS 보장이라고 쓰지 않는다.
- 최악 입력은 작은 유효 JPEG core에 payload0인 APP3/COM(length2, 각4bytes)을 가능한 한 많이 넣는다. `floor((10*1024*1024-coreBytes)/4)`개를 삽입하고 실제 총 크기·종류·개수·남은 bytes와 hash를 기록한다. APP0/APP14의 특별 규칙을 빈 payload로 위반하지 않는다. 10MiB 초과 입력을 최악 허용 입력으로 대신하지 않는다.
- 새 `docs/research/evidence/wbs-6.12c/` JSON만 생성한다. 경로 필드는 저장소 기준 상대 경로만 사용하고 사용자 절대 경로·개인 파일명은 넣지 않는다. 기존 task-22/task-33/6.12b 증거는 변경하지 않는다.

## 9. 검증 순서와 계획 전달

후속 구현 최종 gate는 6.12b와 같은 7단계이며 새 tolerant 테스트를 대상 목록에 추가한다. 초기 baseline build→typecheck와 구분한다.

```powershell
npm.cmd run typecheck
npm.cmd test -- tests/jpeg-tolerant.test.ts tests/image-overview.test.ts tests/image-artifacts.test.ts tests/image-crop.test.ts tests/image-crop-boundaries.test.ts tests/image-crop-mcp.test.ts tests/query-artifact-mcp.test.ts tests/jpeg-fixtures.test.ts tests/read-bounded-file.test.ts tests/core.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts
npm.cmd test
npm.cmd run build
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
git diff --check
```

문서 대조: `git grep -n -i 'jpeg\|tolerant\|orientation\|corrupt\|memory\|128\|256' -- README.md docs/image-artifacts.md skills/optimize-context/SKILL.md` 결과와 앞뒤 문장을 직접 읽어 strict/tolerant 한정·ID 변화·방향·회계 상한 설명을 확인한다. 문서에는 테스트하지 않은 파일 지원·비트 손상 검출·RSS 보장 주장을 넣지 않는다. full test의 skip은 이름·플랫폼 사유와 함께 보고한다.

**이번 계획 PR 검증:** 직접 요구사항/현재 소스 대조와 `git diff --check`만 한다. 제품 테스트/build·성능 측정·custom 검증 스크립트는 실행하지 않는다. Tier D에 따라 Harness reviewer를 호출하지 않는다. 입력 전달문의 Claude/Argon 확인과 이전 PR #82 검토를 이 새 계획의 독립 검토로 주장하지 않는다. 새 계획은 사용자 측 검토 대기다.

계획 파일만 `docs:` Conventional Commit + `Agent: codex` trailer로 커밋·push하고 Draft PR을 연다. PR 후 diff와 파일 범위·최신 head·Draft 상태를 다시 확인한다. merge·rebase·force push·제품 구현을 하지 않는다. root HANDOFF는 로컬 운영 기록으로 유지하고 계획 승인이 구현 완료를 뜻하지 않음을 명시한다.

## 10. 계획 검토 체크리스트

- [x] D1/D2/D4와 권장 결정 전부 반영; 이탈 없음, D-C2 호환성 변화 명시.
- [x] 현재 main symbol 재매핑 및 overview 복사·네 source 변형·smoke3→4 반영.
- [x] 사전 설계 §3.6 전 행과 추가 지점 Maintain/Modify/Add 분류.
- [x] A1–A8/R1–R6(조건부 R4 비적용 이유 포함), SOF1/provenance, metadata/배열/연속 경로 포함.
- [x] strict 128MiB 유지, tolerant 정확 회계256MiB, 표 재정의 누적·RST 자체 검사·손상 검출 한계 명시.
- [x] stub 이전 baseline, 값 기반 RED, 필수 strict 세 연산 성능 gate와 raw9개·중단 조건 명시.
- [ ] 사용자 측 계획 검토·승인·merge 후 별도 구현 지시를 받는다. 구현은 아직 수행하지 않았다.
