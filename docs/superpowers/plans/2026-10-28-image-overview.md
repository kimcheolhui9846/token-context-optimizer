# Image overview 구현 계획 (WBS 6.12b)

> **작업자 안내:** 계획 승인·merge 및 별도 구현 지시 뒤 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`를 사용한다. 아래 구현 체크박스는 실제 실행 결과로만 갱신한다.

**목표:** 색인된 이미지 전체를 확대 없이 정수 면적 평균으로 줄여, q75 JPEG를 반환하는 `overview_image_artifact`를 추가한다.

**아키텍처:** 새 `src/core/image-overview.ts`가 기존 store와 `readValidatedImageArtifact`를 사용한다. 재검증된 RGB 또는 tolerant opaque RGBA에서 출력 크기 RGBA 버퍼를 만들고 기존 jpeg-js/strict JPEG 검사기로 인코드·검증한다. MCP는 base64를 image content로 보내고 metadata만 structuredContent에 둔다.

**기술 스택:** 기존 TypeScript, Node.js crypto, jpeg-js 0.4.4, Zod, Vitest. 새 의존성 없음.

**범위와 승인:** Tier D 계획 PR. 기준 `69ebb0ee42a26ad071bb3c937b0845712748767d`. 사용자가 로컬 main 대신 이 origin/main에서 새 worktree를 만드는 것을 승인했다. 입력은 `research/plans/2026-10-26-image-612bc-predesign.md` §2와 `docs/superpowers/plans/2026-10-27-png-tolerant.md`, 현재 6.12a 구현이다. 이 PR은 이 계획 파일만 변경한다. 제품 구현, 연구/논문/기존 증거/기준 fixture 변경, 6.12c·6.10 문서 묶음·6.4 구현, merge는 하지 않는다.

## 1. 확정 결정과 보존 조건

- D3: 4채널 입력은 `validationProfile === "png-rgb8-tolerant-v1"`이고 `alpha === "opaque"`일 때만 허용한다. strict RGBA와 tolerant `present`는 `alpha_unsupported`다. overview에는 full-frame 예외가 없다.
- D4: 완료된 6.12a → 6.12b → 6.12c 순서다. JPEG tolerant를 선행 구현하지 않는다.
- 도구 이름 `overview_image_artifact`, resample 이름 `area-average-v1`. 사전 설계 권장안 이탈 없음.
- 입력은 `{ artifactId, maxSide? }` strict object. maxSide는 정수 64–1536, 생략 시 512. crop에 scale 또는 overview 옵션을 더하지 않는다.
- 긴 변이 maxSide 이하이면 원본 치수로 1:1 인코드한다. 확대, 격자선, 원본 참조만 반환하는 분기, resize_required 결과는 없다.
- strict/tolerant 색인 ID·레코드·profile, crop 상태·입력·출력 및 오류 우선순위, 6.9 읽기 경계와 오류 매핑을 보존한다. 원본·store에 쓰지 않고 결과 JPEG를 자동 색인하지 않는다.
- 연구 하네스는 sharp lanczos3를 사용한다. area-average-v1과 픽셀/바이트 일치를 요구하지 않는다. 기존 논문 수치는 이 제품 overview 도구 평가가 아니다. 새 모델 호출이나 청구량/정확도 주장은 없다.

## 2. 현재 main symbol 지도

모든 위치는 `69ebb0e`에서 직접 찾았다. 구현 때도 symbol을 우선한다.

| 파일 / symbol | 현재 위치 / 역할 |
|---|---|
| `src/core/image-artifacts.ts` / `ImageValidationError`, `ImageArtifactStore`, `defaultImageArtifactStore` | :16, :25, :46; 새 코어에서 기존 오류·저장소 사용 |
| 같은 파일 / `readValidatedImageArtifact` | :138; 경로 재승인, bounded read, hash/길이와 decoded metadata 검사 |
| 같은 파일 / `validateForRecord`, `recordMetadataMatches` | :166, :179; profile별 검사와 tolerant alpha/ignoredChunks 비교, 변경하지 않음 |
| 같은 파일 / `cloneImageArtifactRecord` | :311; 내부 helper이므로 새 공개 export를 만들지 않고 overview에서 필요한 source 배열 복사 |
| `src/core/image-crop.ts` / `cropImageArtifact` | :17; source 복사 :23–25, 재읽기 :27, full-frame/resize :29–30, alpha :31–33, stride :36, encode :41, 출력 검증 :44 |
| `src/core/jpeg-validation.ts` / `validateJpeg` | :22; 출력 strict 검사 재사용, decoder 상한/정책 변경 없음 |
| `src/core/types.ts` / `ImageArtifactRecord` | :22; 기존 strict PNG/tolerant PNG/strict JPEG 세 변형 유지 |
| `src/server/index.ts` / `imageOutputSchema`, `cropOutputSchema` | :167, :215; source union 재사용, crop schema 자체 유지 |
| 같은 파일 / crop 등록 설명 | :237; 사전 설계가 갱신한 :237과 동일. 최초 :231은 사용하지 않음 |
| `scripts/smoke-mcp.mjs` / `toolNames`, `assertImageOutputSchema`, `pngChunk` | :112, :289, :336; 세 변형 검사는 이미 존재(:291). 2→3 변경을 다시 계획하지 않음 |
| `tests/image-crop-mcp.test.ts` / `withTolerantSchema`, tools 목록 비교 | :13, :82; 기존 차이에 새 도구와 crop 설명 차이만 추가 |
| `tests/query-artifact-mcp.test.ts` / `withTolerantSchema`, listTools | :10, :32; query maxExcerpts 차이와 tolerant 차이 보존 |
| `docs/image-artifacts.md` / MCP crop use, Error contract | :141, :186; alpha_unsupported 행 :209 |
| README 이미지 소개 / skill PNG and JPEG Input Workflow | `README.md:12`, `skills/optimize-context/SKILL.md:32`; skill compaction 지침 :89도 일치시킴 |

사전 설계 §2의 명시적 현재 위치 `server/index.ts:237`, `image-crop.ts:30–33`, README :13–17은 기준 main에서도 유효하다. 단 crop의 full-frame은 :29이고 source 복사와 재검증은 각각 :23–25/:27이므로 함께 명시했다. 새로 발견한 도구 비교 지점은 위 두 MCP 테스트와 §5에 정리했다.

## 3. 코어 계약과 알고리즘

### 3.1 인터페이스와 오류 순서

새 모듈에서 다음 타입과 함수를 정의한다. `ImageArtifactRecord`, `ImageArtifactStore`, `validateJpeg`는 위 기존 파일에서 import한다. base64 image는 코어 반환 전용이며 MCP metadata에 넣지 않는다.

```ts
export type OverviewOutput = {
  image: string;
  width: number; height: number;
  format: "jpeg"; mimeType: "image/jpeg";
  byteLength: number; sha256: string; quality: 75;
  encoder: { name: "jpeg-js"; version: "0.4.4" };
  resample: "area-average-v1";
  validation: ReturnType<typeof validateJpeg>;
};
export type OverviewResult = { source: ImageArtifactRecord; output: OverviewOutput };
export async function overviewImageArtifact(input: {
  artifactId: string; maxSide?: number;
  allowedRoots?: string[]; store?: ImageArtifactStore;
}): Promise<OverviewResult>;
```

위 선언은 계획상의 인터페이스다. 오류 우선순위는 다음대로 구현한다.

1. 입력 검증: artifactId가 문자열이 아니거나 길이 0이면, 또는 **제공된** maxSide가 정수 64–1536이 아니면 `ImageValidationError("invalid_overview_input")`. 생략/undefined만 512이며 null, NaN, Infinity, 문자열, 소수를 기본값으로 바꾸지 않는다. crop의 invalid_region을 재사용하면 영역 없는 입력을 잘못 설명하므로 새 코드를 선택한다.
2. `(input.store ?? defaultImageArtifactStore).get(artifactId)`가 없으면 `artifact_not_indexed`.
3. source를 복사한다. `ignoredChunks`가 배열이면 `[...indexed.ignoredChunks]`를 넣는다. 누락/잘못된 형식은 임의로 정상화하지 않아 기존 재검증이 `decode_failed`로 거부하게 한다. custom store가 내부 참조를 반환해도 반환 source 배열이 저장값을 변경하지 못하게 한다.
4. `readValidatedImageArtifact(source, input.allowedRoots ?? [process.cwd()])`. 경로 재승인·hash/byteLength·profile별 재검사·metadata 불일치를 기존 함수에 맡긴다. source 실패를 alpha 오류나 encode 오류로 덮지 않는다.
5. channels가 4이면 §1의 tolerant opaque 조건을 검사하고 나머지는 `alpha_unsupported`. channels 3은 기존 RGB/strict JPEG 그대로 허용한다.
6. 치수 계산 → 정수 면적 평균 → jpeg-js quality 75 인코드. encoder throw는 `encode_failed`, 원래 dependency 예외 문구는 노출하지 않는다.
7. `validateJpeg(encoded)` 실패 또는 width/height가 예상과 다르면 `output_validation_failed`. 검증된 JPEG만 hash·byteLength·base64로 반환한다.

readBoundedFile → readValidated/overview 매핑은 기존 그대로다: empty_roots/denied → path_denied; changed → source_changed; read_failure/non_regular/too_large → source_missing_or_unreadable. 성공한 읽기의 hash/길이 불일치는 source_changed. decoded shape/profile/alpha/ignoredChunks 내용·순서 불일치는 decode_failed다. decoder가 던지는 기존 image validation 오류는 그대로 전파한다. index/inspect의 다른 매핑은 변경하지 않는다. 사용자 경로·realpath·source bytes를 새 오류에 넣지 않는다.

### 3.2 치수와 정수 면적 평균

W/H는 검증된 source 치수다. `L = max(W,H)`일 때 L > maxSide이면 `w = max(1, round(W*maxSide/L))`, `h = max(1, round(H*maxSide/L))`; 아니면 w=W, h=H다. 8192×1, maxSide=512는 512×1이 된다.

순수 helper `areaAverageRgba(pixels: Uint8Array, W: number, H: number, channels: 3 | 4, w: number, h: number): Buffer`를 새 모듈 내부에서 사용하고 단위 테스트용으로 export한다. 이 helper는 이미 검증된 치수/픽셀 및 w≤W,h≤H만 받으며, 공개 MCP maxSide 하한과 분리한다. 그래야 2×2→1×1 산술을 직접 검증할 수 있다. 임의 리사이즈 공개 도구를 추가하는 것이 아니다.

출력 x=j에 대한 원본 x=i의 정수 가중치는 다음과 같다. y도 같은 식이다.

```ts
const wx = Math.max(0, Math.min((i + 1) * w, (j + 1) * W)
  - Math.max(i * w, j * W));
const wy = Math.max(0, Math.min((s + 1) * h, (r + 1) * H)
  - Math.max(s * h, r * H));
const channel = Math.floor((2 * sum + W * H) / (2 * W * H));
```

- 출력 행 r마다 `Float64Array(w*3)` 누적 행을 0으로 한다. 원본 행 s는 `floor(r*H/h)`부터 `ceil((r+1)*H/h)-1`까지만 방문한다.
- 각 s에서 `Uint32Array(w*3)` 가로 합을 0으로 한다. 출력 열 j가 겹치는 원본 i=`floor(j*W/w)` … `ceil((j+1)*W/w)-1`만 순회한다. 원본 채널 시작은 `(s*W+i)*source.channels`. RGB 세 값에 wx를 곱해 가로 합에 더한 뒤 wy를 곱해 출력 누적 행에 더한다. RGBA의 alpha는 읽어 섞지 않는다.
- 출력 RGBA 버퍼의 RGB는 위 반올림식, alpha는 255다. 1:1도 같은 경로로 처리한다. 공유 경계의 원본 행이 재방문될 수 있으나 축소만 하므로 방문 수는 상수 배수이며 전체 면적을 출력 화소마다 반복 스캔하지 않는다.
- 가로 합은 최대 255*W ≤ 2,088,960으로 Uint32 안전 범위다. 한 출력 화소의 총 가중치는 W*H. 채널 합 최대 4,278,190,080, 반올림 분자 최대 8,573,157,376으로 2^53 미만이므로 Float64의 정수 정확성이 유지된다. bitwise 연산으로 누적 합을 32비트에 잘라 넣지 않는다.
- 추가 축소 메모리는 출력 RGBA `4*w*h`와 두 작업 행 `12*w + 24*w` 바이트다. 최대 1536² 출력 버퍼는 9 MiB이며 원본 크기 RGB/RGBA 복사본이나 원본×출력 가중치 행렬을 만들지 않는다. 기존 재검증의 decoded 원본과 JPEG encoder/validator 임시 메모리는 별도이며 프로세스 RSS 상한을 보장한다는 뜻이 아니다.

정확한 산술 테스트는 **JPEG 인코드 전** helper 출력으로 한다. JPEG는 손실 압축이므로 decoded 색상이 입력 RGB와 항상 정확히 같다는 assertion을 만들지 않는다. 최종 JPEG는 실제 strict 검사, 치수, hash 결정성을 검증한다.

## 4. MCP와 사용자 문서 계약

`src/server/index.ts`에서 crop 등록 뒤 overview를 등록하여 기존 도구 순서를 보존한다.

```ts
inputSchema: z.strictObject({
  artifactId: z.string().min(1),
  maxSide: z.number().int().min(64).max(1536).optional(),
})
```

스키마에서는 default를 추가하지 않고 코어에서 생략 시 512로 처리해 required는 artifactId만 남긴다. source에는 기존 `imageOutputSchema` 세 변형을 그대로 사용한다. output schema는 crop 성공 output의 width, height, format, mimeType, byteLength, sha256, quality, encoder, validation에 `resample: z.literal("area-average-v1")`을 더한다. core `image`는 output schema에 없다. crop schema·다른 도구 schema는 변경하지 않는다.

```ts
const result = await overviewImageArtifact({ artifactId, maxSide,
  store: defaultImageArtifactStore, allowedRoots: getAllowedRoots() });
const { image, ...output } = result.output;
const structured = { source: result.source, output };
return { isError: false,
  content: [{ type: "text", text: JSON.stringify(structured) },
    { type: "image", data: image, mimeType: "image/jpeg" }],
  structuredContent: structured };
```

오류는 기존 MCP tool-error 변환을 사용하며 성공 metadata/image를 함께 반환하지 않는다. 새 도구 설명은 다음으로 고정한다.

> Return a whole-image overview of an indexed RGB PNG, tolerant fully opaque RGBA PNG, or supported JPEG as a quality-75 JPEG. maxSide defaults to 512 (64-1536); images are never enlarged. Use the source and output dimensions to map a caller-chosen region back to original-image pixels for crop_image_artifact. The overview does not select evidence or guarantee readability of exact values.

crop 설명은 다음으로 바꾼다(기존 full-frame 예외 보존).

> Crop a validated RGB PNG, tolerant fully opaque RGBA PNG, or supported JPEG image using a caller-chosen region and encode it as a quality-75 JPEG. Use overview_image_artifact to obtain an overview before choosing a region in original-image pixels. Full-frame regions return the original reference without encoding, including RGBA sources.

문서 변경은 후속 6.12b 구현에서 함께 수행한다.

- `docs/image-artifacts.md`에 MCP overview use 절: 입력 예제 `{"artifactId":"<indexed image ID>","maxSide":512}`, 성공 metadata/image, 1:1 재인코드, 알파 조건, 결정적 정수 축소·q75, 오류 우선순위와 크기/메모리 제한.
- 좌표는 `x_src = floor(x * sourceWidth / width)`, `y_src = floor(y * sourceHeight / height)`. 좌표는 overview 기준이며 crop 입력은 원본 기준임을 명시한다. 직사각형 끝점은 source 치수로 제한하고, 작은 글자/정확한 숫자는 원본 crop으로 확인한다. 소수 배율 필드는 반환하지 않는다.
- **D-7은 6.12b 문서 변경에서 처리한다.** alpha_unsupported 행을 `A partial crop or an overview was requested from an RGBA source, unless it is a tolerant PNG record whose alpha is fully opaque`로 고친다. crop full-frame은 기존 절에서 예외임을 계속 설명한다. 6.10 D-7 제안과 동일한 허용 조건이며 overview 오류 범위만 확장한다. 6.10 전체 D-1–D-6은 건드리지 않는다. 후속 6.10 검토자는 이 행을 이전 문구로 되돌리지 않는다.
- 오류 표에 invalid_overview_input(코어 artifactId/maxSide 인자가 잘못됨; MCP는 스키마에서 차단)을 추가한다. artifact_not_indexed, decode_failed, source_changed, source_missing_or_unreadable의 crop 한정 표현에는 overview도 포함한다. 기존 오류 매핑 자체는 바꾸지 않는다.
- README 이미지 절과 `skills/optimize-context/SKILL.md`의 PNG and JPEG Input Workflow 및 compaction의 crop 안내를 함께 맞춘다. 기존 skill의 RGBA 전체 거부 문구는 tolerant opaque 예외로 좁힌다. sharp lanczos3와 다른 커널, 기존 논문 미평가, overview가 증거 선택/정확값 가독성을 보장하지 않음을 적는다. 연구 수치와 증거 링크 내용은 변경하지 않는다.

## 5. 사전 설계 §2.5 영향 표 전체 분류

아래는 **후속 구현** 범위다. 이번 PR에서 제품/테스트/사용자 안내 파일을 편집하지 않는다.

| 사전 설계 행 / 추가 조사 | 분류 및 구체 처리 |
|---|---|
| 제품 `src/core/image-overview.ts` | **Add** 코어, 순수 면적 평균 helper, 인코드와 출력 검증 |
| 제품 `src/server/index.ts` 도구 등록·schema | **Modify** overview 도구 하나 추가; 기존 source union 재사용 |
| 제품 `src/server/index.ts:237` crop 설명 | **Modify** §4 고정 문안, 동작·schema 유지 |
| `tests/fixtures/task39-base-tools.json`, `task36-base-tools.json` | **Maintain** 과거 기준 파일 원본 유지 |
| 테스트 `tests/image-overview.test.ts` | **Add** §6의 산술/코어/보안/배열/오류 테스트 |
| 스크립트 `scripts/smoke-mcp.mjs` | **Modify** required 도구 목록에 overview 추가, 합성 이미지 한 번 호출·JPEG content 검증. 기존 세 record 변형 검사는 유지 |
| 문서 `docs/image-artifacts.md`, README 이미지 절, `skills/optimize-context/SKILL.md` | **Modify** §4 overview, 좌표, 연구 경계, D-7 및 관련 오류/알파 표현 |
| 추가 `tests/image-crop-mcp.test.ts` | **Modify** 목록과 crop 설명 delta, overview 실제 입력/출력 schema, tolerant 연속 사례 |
| 추가 `tests/query-artifact-mcp.test.ts` | **Modify** 전체 도구 목록과 crop 설명 delta; 기존 query/tolerant delta 그대로 |
| 추가 `src/core/image-artifacts.ts`, `image-crop.ts`, `jpeg-validation.ts`, `types.ts`, `read-bounded-file.ts` | **Maintain** 기존 export 사용, 공용 타입 추출/reader 수정 없음 |
| 추가 `tests/jpeg-fixtures.test.ts:38–39` | **Maintain** index/inspect 두 도구만 필터한 length 2 assertion은 전체 도구 수가 아님. overview schema는 image-crop-mcp에서 검사 |
| 추가 `scripts/verify-installed-plugin.mjs:90–95` | **Maintain** index_artifact 존재 검사만 하므로 도구 추가와 충돌 없음 |
| 추가 기존 image-artifacts, crop, crop-boundaries, source-race, packaging, core 테스트 | **Maintain** 기존 기대값 변경 없이 회귀 실행 |
| 기존 연구·논문·증거·JPEG fixture·package/lockfile | **Maintain** 수정 없음, 의존성 추가 없음 |

도구 목록 테스트는 두 MCP 파일에서 기존 순서 + 마지막 overview 한 개로 명시한다. 기존 withTolerantSchema와 query maxExcerpts delta를 유지하고 crop description만 §4 literal로 덮는다. overview는 새 input/output schema를 독립적인 기대값으로 검사한다. actual을 복제해 expected로 쓰거나 기존 도구 비교를 건너뛰거나 frozen fixture를 재생성하지 않는다.

smoke Nit 두 건은 후속 구현에서 동일 파일을 다루면서 반영한다: :292 메시지를 `three correlated strict PNG, tolerant PNG, and JPEG variants`로 명확히 하고 :336 pngChunk 본문을 주변의 2칸 들여쓰기로 맞춘다. 이번 계획 PR에서 스크립트를 변경하지 않는다.

## 6. 테스트 매트릭스

합성 PNG/JPEG는 테스트 안에서 생성한다. 실제 스크린샷, 새 baseline fixture, 연구 데이터는 넣지 않는다. PNG 생성은 기존 crc32/chunk/deflate 패턴을 따른다.

| ID | 입력 / 검사 | 기대 결과 |
|---|---|---|
| A1 | 7×5 RGB 단색 137 → helper 3×2 | RGBA RGB가 모두 137, alpha 255. JPEG 이전 정수 정확성 |
| A2 | 2×2 RGB 체크 [0,255;255,0] → helper 1×1 | 세 RGB 모두 128, alpha 255; 공개 maxSide=1 호출은 하지 않음 |
| A3 | 8192×1 RGB, maxSide=512; 세로 반대도 검사 | 512×1 / 1×512, 짧은 변 1 이상 |
| A4 | 400×300 RGB, 생략 maxSide; 64×64/maxSide64; 1536²/maxSide1536 | 원본 치수 JPEG image가 반환됨. original 참조 분기/확대 없음 |
| A5 | 같은 index ID와 maxSide로 두 번 | output.sha256/base64 동일, byteLength/hash 실제 JPEG와 일치 |
| A6 | 비균일 tolerant opaque RGBA | 성공, source profile/alpha/ignoredChunks 보존. 같은 RGB 성분의 3채널 helper 결과와 동일하여 stride 검출 |
| R1 | strict RGBA(모두255 포함), tolerant alpha present(한 픽셀254) | alpha_unsupported; 작은 원본/1:1도 거부 |
| R2 | 색인 이후 파일 바이트 변경 | source_changed; alpha 거부보다 먼저 발생 |
| R3 | maxSide 63/1537/1.5 | 코어 invalid_overview_input; MCP 스키마 오류 |

직접 산술 예시(helper 입력의 RGB는 각 화소에서 같은 세 채널 값이다):

```ts
const rgb = Uint8Array.from([0, 0, 0, 255, 255, 255,
  255, 255, 255, 0, 0, 0]);
expect([...areaAverageRgba(rgb, 2, 2, 3, 1, 1)])
  .toEqual([128, 128, 128, 255]);
```

| 추가 계약 | 구체 검증 |
|---|---|
| 정수 overlap | 3×1 값 [0,90,240] → 2×1은 [30,190]; 비정수 비율/경계 가중치를 손계산과 대조. 1:1 비균일 RGB는 입력 성분 그대로 |
| 코어 입력 | artifactId 빈 문자열/비문자열, maxSide null/문자열/NaN/Infinity 거부; 64/1536 및 생략 허용. 잘못된 입력+없는 ID는 입력 오류 우선 |
| MCP 입력 | unknown field, null, 소수, 범위 밖 거부; artifactId만 required, maxSide에 default 없음 |
| 조회/경로 | 없는 ID → artifact_not_indexed; allowedRoots=[] 또는 승인 밖 → path_denied; 삭제 → source_missing_or_unreadable; 오류에 경로/원본 bytes 없음 |
| metadata | 파일/hash 고정 후 custom store의 width/channels/profile 또는 tolerant alpha/ignoredChunks 내용·순서/누락 변조 → decode_failed; alpha 검사 전 발생 |
| 배열 소유권 | get이 내부 record를 그대로 반환하는 custom store로 overview source.ignoredChunks push/순서 변경 후 저장 배열과 다음 inspect/overview/crop이 불변 |
| encoder 실패 | 정상 source와 실제 재검증 뒤 jpeg.encode만 일회 throw spy → encode_failed, image 없음. spy 복원 |
| 출력 검증 실패 | JPEG validator 일회 throw 또는 치수 불일치 → output_validation_failed. PNG source를 사용해 source decoder와 출력 validator mock을 분리. 실인코더 성공 경로도 반드시 검사 |
| JPEG 입력 | 기존 지원 strict JPEG를 색인하여 overview 성공, source profile 유지, 출력 strict q75 재검증 |
| MCP 출력 | text JSON과 structuredContent 일치, image/jpeg content 1개, output에 base64 image 없음; 세 source 변형, quality/encoder/resample/validation 필수값·누락/교차값 거부 |
| 연속 흐름 | ancillary 포함 opaque RGBA tolerant 색인 → overview → 같은 source ID inspect → 원본 좌표 부분 crop. 모든 source metadata 동일; overview가 store를 늘리거나 원본을 바꾸지 않음 |
| 오류 우선순위 | 잘못된 입력 > 없는 ID > 읽기/재검증 > alpha > encode > 출력 검증. 재읽기/알파 실패 시 encode 미호출 spy로 확인 |
| 기존 계약 | 6.9 경로/race와 6.12a strict/tolerant, 기존 crop full-frame/resize/alpha 순서, JPEG fixtures와 packaging 기대값 유지 |

## 7. 후속 구현 순서 (TDD)

아래 단계는 하나의 6.12b 구현 Task 내부 단계다. 계획 승인·merge와 별도 지시 전에는 실행하지 않는다. 구현 시 해당 Tier C/E 검토와 증거 규칙을 적용한다.

### 단계 0: 기준 확인

- [ ] `69ebb0e`와 승인된 계획을 확인하고 lockfile로 의존성을 준비한다. 손대지 않은 기준에서 `npm.cmd run build` → `npm.cmd run typecheck`, 둘 다 오류 0 로그를 남긴다.
- [ ] 기존 관련 테스트 baseline을 기록한다. RED를 위해 새 export/type의 컴파일 가능한 stub을 준비하되 아직 동작은 구현하지 않는다. 각 행동 RED에서 typecheck 오류 0을 확인한다. import·compile 실패는 RED로 세지 않는다.

### 단계 1: 정수 축소와 코어

**파일:** 새 image-overview.ts, image-overview.test.ts. **입출력:** §3의 overviewImageArtifact/OverviewResult와 areaAverageRgba.

- [ ] RED: A1/A2/overlap/1:1/stride, A3–A6, R1–R3와 입력·조회·재검증·소유권 실패를 추가한다. 컴파일 가능한 stub의 잘못된 값/동작 때문에 실패하는 원시 로그를 남긴다.
- [ ] GREEN: §3 순서, 행 단위 합산, source 복사, 실제 encoder와 validator를 최소 구현한다. input bytes→기존 재검증은 성공 stub으로 대체하지 않는다.
- [ ] RED/GREEN: encoder throw, 출력 검사 throw/치수 불일치, 오류 우선순위 spy를 추가하고 안정된 오류 코드와 무이미지 반환을 검증한다.
- [ ] REFACTOR: 새 모듈 내부에서만 필요한 중복을 정리한다. 기존 세 공용 코어 파일을 변경하지 않고 관련 기존 테스트를 재실행한다.

### 단계 2: MCP·문서·smoke

**파일:** server/index.ts, image-crop-mcp.test.ts, query-artifact-mcp.test.ts, smoke-mcp.mjs, docs/image-artifacts.md, README.md, skills/optimize-context/SKILL.md.

- [ ] RED: 새 도구 목록/strict 입력/출력 schema/§6 연속 흐름과 crop 설명 기대값을 추가한다. 기존 fixture 그대로 행동 실패를 기록한다.
- [ ] GREEN: §4 schema와 handler, crop 문구 및 explicit delta를 구현한다. image를 structuredContent에서 제거한다.
- [ ] GREEN: smoke required 목록과 합성 이미지 overview 1회 호출을 추가한다. 실제 base64 bytes/metadata의 치수·hash·strict JPEG profile을 검증한다. 기존 strict/tolerant 검사는 유지하고 §5 Nit 두 건만 정리한다.
- [ ] REFACTOR: 세 사용자 문서의 알파/좌표/연구 경계·D-7/오류 표를 맞춘다. source/레코드 계약 및 다른 도구 schema가 달라지지 않았는지 diff 확인한다.
- [ ] §8 증거와 §9 gate를 완료하고 구현 Task의 Draft PR/검토 절차를 따른다. 이번 계획 PR에서 어떤 단계도 완료로 표시하지 않는다.

## 8. 후속 성능 게이트와 기록

### 기존 strict PNG 비회귀 — 조건부 필수 게이트

기본 구현안은 `image-artifacts.ts`, `image-crop.ts`, `jpeg-validation.ts`를 **변경하지 않는다**. 세 파일이 기준 `69ebb0e`와 동일하다는 diff 증거가 있으면 사용자 전달문 §4에 따라 기존 도구 시간 측정을 그 증거로 대신한다. 이는 사전 설계 §2.6의 비회귀 취지를 변경 없는 코드에 대한 확인으로 구체화한 것이다. 최종 구현에서 세 파일 중 하나라도 변경되면 아래 측정을 반드시 실행한다. 회귀 테스트는 생략하지 않는다.

- 대상: 6.12a와 같은 픽셀 상한 4096×4096 RGB PNG(10 MiB 이하)의 strict 색인 및 부분 crop `(0,0,1536,1536)`을 각각 측정한다.
- 같은 프로세스에 A=main `69ebb0e`, A'=그 기준 복사본, B=현재를 분리된 모듈 인스턴스/store로 로드한다. 입력·allowed roots·runtime·워밍업 조건은 같게 한다. 입력 생성/모듈 로드/crop 준비 색인은 timed section 밖이다. crop의 재읽기·검증·인코드는 안에 포함한다.
- 고정 워밍업 후 A→A'→B 교대 9회. 각 연산별 median(A')/median(A)가 0.97–1.03 밖이면 측정 무효. 유효 측정에서 median(B)/median(A) ≤ 1.03일 때만 통과하며 두 연산 모두 필요하다.
- 각 연산·변형별 원시 9개 표본, 실행 순서, 단위, 중앙값/비율, 입력 hash/치수/크기, runtime/환경, 기준·현재 commit/dirty 상태, 세 소스 hash를 새 구현 증거 파일에 남긴다. 소스 hash가 작업 사본(CRLF 포함)인지 commit blob 기준인지 명시하고 혼용하지 않는다.
- 게이트 실패/무효이면 멈춰 보고한다. 기준·임계값·표본을 사후 변경하거나 유리한 재실행만 고르지 않는다.

### overview — 기록만, 합격 게이트 아님

- 8192×2048 RGB, 4096×4096 opaque RGBA(픽셀 상한), 8192×1 및 1×8192, 1536×1536/maxSide1536의 1:1 재인코드를 사용한다. PNG는 각 10 MiB 이내의 합성 입력이며 RGBA는 tolerant로 색인한다.
- 고정 워밍업 뒤 각 9회 원시 표본을 남긴다. 재읽기·재검증, 축소, 인코드 시간을 분리하고 출력 strict 재검증과 전체 호출 시간도 별도로 기록하여 숨은 비용이 없게 한다. 출력 byteLength와 base64 길이도 남긴다.
- 프로파일링은 구현용 임시 계측/증거 수집에서 수행하며 공개 MCP 응답에 timing 필드를 추가하지 않는다. strict 경로 3% 기준을 overview에 적용하지 않으며 사전 시제품 시간을 제품 합격 기준으로 삼지 않는다.
- 새 증거는 `docs/research/evidence/wbs-6.12b/` 아래에 두고 기존 증거를 수정하지 않는다. JSON의 입력 path는 저장소 기준 상대 경로다. 사용자 폴더 절대 경로/인증 정보는 넣지 않는다.

## 9. 검증 순서와 전달

다음 7단계는 **후속 구현** gate이며, 단계 0의 baseline build→typecheck와 구분한다.

```powershell
npm.cmd run typecheck
npm.cmd test -- tests/image-overview.test.ts tests/image-artifacts.test.ts tests/image-crop.test.ts tests/image-crop-boundaries.test.ts tests/image-crop-mcp.test.ts tests/query-artifact-mcp.test.ts tests/jpeg-fixtures.test.ts tests/read-bounded-file.test.ts tests/core.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts
npm.cmd test
npm.cmd run build
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
git diff --check
```

이번 계획 PR은 직접 요구사항/현재 소스 대조와 `git diff --check`만 검증한다. 제품 tests/build/성능 측정 및 custom 검증 스크립트는 실행하지 않는다. Tier D에 따라 Harness reviewer를 호출하지 않는다. 전달문에 기록된 Gemini 교차 확인과 이전 Claude 사전 설계 검토를 이 새 계획의 독립 검토 완료로 주장하지 않는다. 주 에이전트가 계획 전체와 실제 diff를 직접 검토한다.

계획 파일만 `docs:` Conventional Commit으로 저장하고 `Agent: codex` trailer를 붙인다. codex/overview-plan을 push하고 main 대상 Draft PR을 연다. PR을 연 뒤 동일 문서 검사와 원격 head·Draft 상태를 다시 확인한다. 계획 승인·merge 뒤에도 별도 구현 지시를 기다린다.

## 10. 계획 검토 체크리스트

- [x] D3/D4와 사전 설계 §2.2 권장값을 유지했다. 이탈 없음.
- [x] 현재 main symbol·읽기 경계·배열 소유권·stride·오류 순서를 명시했다.
- [x] §2.5 모든 행과 추가 도구 목록 비교 지점을 분류했고 frozen fixture는 유지한다.
- [x] 받음 6건·거부 3건, 주입 실패·배열 격리·연속 호출 및 JPEG 손실과 별개인 산술 테스트를 포함했다.
- [x] D-7을 overview 문서 변경에서 처리하며 crop 설명/skill과 동일 조건을 사용한다.
- [x] baseline·행동 RED 원시 로그, 7단계 gate, 성능 측정 생략 근거/필수 조건과 중단 기준을 명시했다.
- [ ] 사용자 계획 승인·merge 및 별도 구현 지시를 받는다. 구현 완료를 주장하지 않는다.
