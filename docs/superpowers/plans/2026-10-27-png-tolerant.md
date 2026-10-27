# PNG tolerant profile 구현 계획 (WBS 6.12a / N-19)

> **작업자 안내:** 구현 지시를 받은 뒤 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`를 사용한다. 아래 구현 체크박스는 실제 실행 결과로만 갱신한다.

**목표:** 기본 strict 계약을 보존하면서 명시적인 tolerant PNG 색인, profile에 따른 재검증, 불투명 RGBA 부분 crop을 지원한다.

**아키텍처:** 기존 bounded reader 뒤에 PNG tolerant 검사기를 추가한다. 부가 chunk는 경계·CRC만 검사하고 디코더에는 원래 신호·IHDR·연속 IDAT·IEND만 넘긴다. 레코드의 실제 validationProfile이 inspect/crop 검사기 선택을 결정한다.

**기술 스택:** 기존 TypeScript, Node.js zlib/crypto, fast-png 8.0.0, jpeg-js 0.4.4, Zod, Vitest. 새 의존성 없음.

**범위와 승인:** Tier D 계획 PR. 기준 `4b67d7252bd1aff6f6fe1594fd01a75667ecd3e7`(6.9 PR #78 merge). 입력은 이 커밋의 `research/plans/2026-10-26-png-tolerant-predesign.md`. 이번에는 이 계획 문서만 커밋·push하고 Draft PR을 연다. 계획 승인·merge 후 별도 전달 전에는 구현하지 않는다.

## 1. 전역 제약과 확정 결정

- D1: `index_image_artifact` 선택 인자 `profile: "strict" | "tolerant"`; 생략하면 strict. 다른 값은 MCP 입력 검증 오류다.
- D3: tolerant RGBA는 디코드한 알파가 모두 255일 때만 부분 crop 허용. strict RGBA 부분 crop은 기존 `alpha_unsupported` 유지.
- D4: 6.12a(PNG) → 6.12b(overview) → 6.12c(JPEG). 뒤 두 작업은 범위 밖이다.
- 10 MiB encoded bytes, 한 축 8192, 16,777,216 pixels, 8-bit RGB/RGBA, 비인터레이스 한도를 유지한다.
- strict 레코드의 필드·ID·검사·기존 증거를 보존한다. 원본 SHA256은 부가 chunk를 포함한 전체 원본 바이트로 계산한다.
- 색 정보(iCCP·sRGB·gAMA·cHRM)는 적용하지 않는다. 저장된 픽셀 값을 사용하며 ignoredChunks와 문서에 알린다.
- 회색조·팔레트·16-bit·인터레이스, 반투명 합성, 색 관리, JPEG 확장, overview는 제외한다.
- `research/`, `codex_review/`, `paper/`, 기존 증거, `tests/fixtures/*-base-tools.json`은 변경하지 않는다. 다른 사람의 worktree도 변경하지 않는다.

| 사전 설계 §7 및 전달문 결정 | 확정값 / 이유 |
|---|---|
| 디코드 입력 | S-1. 원래 신호+IHDR+연속 IDAT+IEND(원래 CRC 포함)만 이어 붙임. iCCP 팽창과 tEXt/pHYs 내용 파싱을 피함 |
| PLTE | `unsupported_png_profile`; 이번 범위에 사용 근거 없음 |
| ignoredChunks 종류 상한 | 32; 33종은 `unsupported_png_profile`. 개수 제한으로 바꾸지 않음 |
| tolerant PNG 필드 | `validationProfile: "png-rgb8-tolerant-v1"`, `ignoredChunks: string[]`, `alpha: "none" \| "opaque" \| "present"` |
| 오류 코드 | 새 코드 없음. 기존 코드 재사용 |
| artifactId | 요청 profile이 tolerant일 때만 식별 문자열에 `\0${metadata.validationProfile}` 추가. strict는 기존 문자열 그대로 |
| JPEG + tolerant 요청 | strict JPEG 검사기 사용, 실제 `jpeg-ycbcr8-baseline-444-v1` 기록. PNG 전용 alpha/ignoredChunks 없음 |

권장안에서 벗어난 결정은 없다. JPEG tolerant 요청의 ID에도 실제 JPEG profile을 접미사로 쓴다. 요청 문자열 `tolerant`를 ID에 넣지 않는다.

## 2. 현재 symbol과 사전 설계 줄 번호 재매핑

아래 위치는 기준 `4b67d72`의 소스다. 후속 구현자는 줄 번호보다 symbol을 우선한다.

| 사전 설계 참조 | 현재 위치 / 확인된 차이 |
|---|---|
| image-artifacts store get/put :37–43 | `src/core/image-artifacts.ts:29` MemoryImageArtifactStore; get :35, put :40. 얕은 복사 유지 중 |
| index ID :61–63 / 문자열 :62 | `indexImageArtifact` :47, identity :61. 원본 path+NUL+sha256 |
| inspect 검증 :95–96 | `inspectImageArtifact` :80, 검사 분기 :94–95. PNG는 현재 무조건 strict |
| 이전 readBoundedSource 구현 | `readBoundedSource` :113, `readerErrorCodes` :104. 6.9 공통 `readBoundedFile` 호출로 교체됨 |
| readValidated 검사 :173 / 비교 :176–178 | `readValidatedImageArtifact` :131, 검사 :141, 비교 :144–148. 읽기 helper 축소로 앞당겨짐 |
| validatePng | `src/core/image-artifacts.ts:158`. strict 구현을 기준으로 보존 |
| crop :29 | `src/core/image-crop.ts:29` alpha 거부, :32 RGB stride. 둘 다 tolerant RGBA 대응 필요 |
| types :30–40 | `src/core/types.ts:22` ImageArtifactRecord, :30부터 format/profile union |
| server :167–189 | `src/server/index.ts:167` imageOutputSchema, :180 index 도구. cropOutputSchema :209의 모든 source에도 공유 스키마 사용 |
| strict 거부 tests :197,209 | `tests/image-artifacts.test.ts:182` 시작, 기대값 :200,:212로 이동 |
| strict crop tests :119 / boundaries :96 | `tests/image-crop.test.ts:119` 유지, `tests/image-crop-boundaries.test.ts:97` 기대값 |

6.9 이후 의미상 변경은 reader 경계와 오류 변환이다. 검사기 확장을 위해 이를 되돌리거나 우회하지 않는다. 현재 inspect는 검증 결과 metadata 비교 없이 레코드를 반환하므로 tolerant 비교를 명시적으로 추가해야 한다.

## 3. 검사기·레코드·재검증 계약

### 3.1 PNG tolerant 검사

기존 `validatePng` strict 경로를 유지하고 같은 모듈 안에 `validatePngTolerant`를 추가한다. 중복 제거는 기존 strict 동작과 성능 게이트를 보존하는 범위로 제한한다.

1. signature, 최초 IHDR 길이 13, 치수/모드, ASCII 영문 네 글자 chunk 이름, chunk 경계와 CRC를 기존 방식으로 검사한다.
2. IHDR 중복, IDAT 없음, 잘린 chunk, 잘못된 CRC, 비어 있지 않은 IEND, IEND 뒤 바이트는 `malformed_png`다.
3. IDAT 상태를 before/data/after로 추적한다. 부가 chunk가 data 구간을 끝내면 뒤 IDAT는 `malformed_png`다. IDAT 전후의 허용 부가 chunk는 받을 수 있다.
4. IHDR/IDAT/IEND 외 치명 chunk(첫 글자 대문자), PLTE, tRNS, acTL/fcTL/fdAT는 `unsupported_png_profile`다. 예약 비트인 셋째 글자 소문자는 그 이유만으로 거부하지 않고 모르는 부가 chunk로 처리한다.
5. 나머지 부가 chunk는 내용 해석 없이 건너뛴다. 이름을 처음 등장한 순서대로 중복 없이 ignoredChunks에 기록하고 33번째 종류에서 거부한다.
6. 원래 signature와 각 IHDR/IDAT/IEND 전체 바이트 범위를 모아 디코드 입력을 구성한다. CRC를 다시 만들거나 부가 chunk를 decode에 전달하지 않는다.
7. IDAT에 기존 `inflateSync` maxOutputLength, 정확한 해제 길이/압축 소비량, 필터 바이트 검사를 적용한다. decode 결과 치수/채널/depth도 확인한다. 기존 malformed/dimensions/profile 코드 분류를 유지한다.
8. RGB는 alpha none. RGBA는 모든 픽셀의 네 번째 바이트가 255이면 opaque, 하나라도 다르면 present. channels는 원본 3/4 그대로다.

### 3.2 타입과 소유권

기존 ImageArtifactRecord의 공통 필드와 strict PNG/JPEG 변형을 유지하고 다음 PNG 변형을 더한다. 내부 검사 결과에는 pixels도 포함하되 store/공개 레코드에는 보관하지 않는다.

```ts
// 기존 공통 필드와 교차할 추가 변형
type TolerantPngFields = {
  format: "png";
  mimeType: "image/png";
  channels: 3 | 4;
  validationProfile: "png-rgb8-tolerant-v1";
  ignoredChunks: string[];
  alpha: "none" | "opaque" | "present";
};
// indexImageArtifact의 기존 입력에 추가
type ImageProfileInput = { profile?: "strict" | "tolerant" };
```

식별 문자열 규칙은 다음과 같다. metadata는 실제 선택된 검사기의 결과다.

```ts
const identityInput = `${source.path}\0${sha256}` +
  (input.profile === "tolerant" ? `\0${metadata.validationProfile}` : "");
// 기존 sha256(identityInput), image_ 접두사, 16자리 절삭을 유지한다.
```

같은 원본의 strict/tolerant 레코드는 서로 덮어쓰지 않으며 같은 profile 재색인은 같은 ID다. index 출력과 store에 넣는 값, MemoryImageArtifactStore put/get, inspect 반환값마다 tolerant ignoredChunks 배열을 복사한다. custom store가 참조를 그대로 반환해도 index/inspect 출력이 배열을 공유하지 않도록 호출 경계에서도 복사한다. strict에는 alpha/ignoredChunks 키를 만들지 않는다.

### 3.3 다시 읽기와 crop

- `inspectImageArtifact`와 `readValidatedImageArtifact`는 **레코드 validationProfile**로 검사기를 선택한다. PNG tolerant만 새 검사기로, strict PNG와 JPEG는 기존 검사기로 보낸다.
- read → 원본 sha256/byteLength 비교 → 해당 profile 재검증 순서를 유지한다. tolerant metadata의 치수·채널·format·mimeType·profile 및 alpha와 ignoredChunks(순서 포함)를 레코드와 비교한다. 불일치는 `decode_failed`다. crop의 기존 pixels 타입/길이 검사도 유지한다.
- metadata 조작 테스트는 파일/sha256은 그대로 둔 custom store 레코드로 만든다. alpha와 ignoredChunks 각각의 값·순서·누락 변조를 확인한다.
- crop의 기존 순서(재검증 → 영역 경계 → full-frame original → 1536 초과 resize_required → alpha 판정)를 보존한다.
- 부분 crop에서 4채널 허용 조건은 PNG tolerant + alpha opaque뿐이다. strict RGBA와 tolerant present는 `alpha_unsupported`. RGB/JPEG 부분 crop은 기존 계약 유지.
- 복사 시작 인덱스는 `((region.y + y) * source.width + region.x + x) * source.channels`다. 출력 RGBA의 alpha는 255, JPEG quality 75와 출력 재검증을 유지한다. 비균일 픽셀을 써서 4채널 stride 오류를 검출한다.

### 3.4 6.9 읽기 경계와 오류 매핑 보존

모든 source 읽기는 `readBoundedSource → readBoundedFile`로 수행한다. 새 검사기는 전달받은 bytes만 읽는다. 경로·링크 대상·realpath는 오류 메시지에 노출하지 않는다. 기존 6.9 테스트 기대값은 바꾸지 않는다.

| readBoundedFile 오류 | index | inspect | readValidated/crop |
|---|---|---|---|
| empty_roots / denied | path_denied | path_denied | path_denied |
| read_failure | read_failure | source_missing_or_unreadable | source_missing_or_unreadable |
| changed | source_changed | source_missing_or_unreadable | source_changed |
| non_regular | non_regular_file | source_missing_or_unreadable | source_missing_or_unreadable |
| too_large | encoded_size_exceeded | source_missing_or_unreadable | source_missing_or_unreadable |

읽기 성공 뒤 hash/byteLength 불일치는 inspect와 crop 모두 `source_changed`다. metadata 불일치와 source 변경을 혼동하지 않는다.

## 4. MCP 계약

공개 스키마 변경은 (1) index 입력의 선택 profile, (2) 이미지 출력의 tolerant 변형뿐이다. `z.enum(["strict", "tolerant"]).optional()`을 쓰고 core에서 생략 시 strict로 처리하여 기존 required 입력은 path만 유지한다. 설명 문구는 strict 기본값, tolerant opt-in과 실제 profile 반환을 반영한다.

imageOutputSchema에 세 번째 변형을 더하고 tolerant에만 ignoredChunks/alpha를 필수로 한다. 기존 strict 두 변형은 유지한다. index/inspect뿐 아니라 cropOutputSchema의 original/rejected/cropped 안 source에도 같은 추가 변형이 전파된다. crop 입력·결과 상태·이미지 전송 방식에는 변경이 없다.

기준 JSON fixture는 그대로 둔다. `tests/image-crop-mcp.test.ts`와 `tests/query-artifact-mcp.test.ts`의 tools/list 비교에서 기존 query_artifact maxExcerpts 차이를 유지하고 index 입력, 이미지 출력 및 crop 중첩 source 차이만 명시적으로 더한다. actual 전체로 expected를 만들거나 이미지 도구 전체 비교를 생략하지 않는다. 다른 필드·도구는 기존 fixture와 정확히 비교한다.

## 5. 사전 설계 §4 영향 표 전체 분류

아래는 **후속 구현** 변경 범위다. 이번 계획 PR에서는 이 표의 제품/테스트/스크립트/안내 문서를 변경하지 않는다.

| 사전 설계 행 | Maintain / Modify / Add 및 처리 |
|---|---|
| image-artifacts validatePng/index/inspect/readValidated | **Modify** profile 분기·ID·재검증·배열 복사; **Add** validatePngTolerant. strict 검사 계약 Maintain |
| image-crop :29 | **Modify** tolerant opaque 허용 및 source.channels stride |
| types :30–40 | **Add** PNG tolerant 변형; strict 변형 Maintain |
| server 출력/index 도구 | **Modify** 선택 profile, tolerant 출력, 설명. 공유 source 전파 포함 |
| task39/task36-base-tools.json 및 비교 테스트 | fixture **Maintain**; image-crop-mcp/query-artifact-mcp **Modify** 명시적 schema delta |
| image-artifacts strict 거부 | **Maintain** 기존 인자 없는 거부 기대값 |
| image-artifacts 배열 격리 | **Add** put/get/index/inspect 배열 변조 격리 테스트 |
| image-source-race / image-packaging | **Maintain** 기존 테스트 및 기대값; 회귀 실행 |
| jpeg-fixtures 스키마 교차 거부 | **Modify** 세 변형 간 format/mimeType/profile 교차 거부와 필수 필드 누락 사례 추가 |
| smoke-mcp :271–304 | **Modify** 스키마 변형 수 2→3 및 tolerant 전용 검사 추가. 기존 strict 필드/값 검사는 유지 |
| docs/image-artifacts + README 이미지 절 | **Modify** 선택 profile, 실제 profile/ID, 배열 필드, 알파·색 정보 규칙. strict RGBA 거부 문구는 strict로 한정하여 보존 |
| task-22/task-33 등 기존 증거 | **Maintain**; 수치/해시 수정 없음 |
| 논문 현재 제품 문구 L23/L63 | **Maintain**; paper 수정은 별도 판단 |

추가 테스트 위치는 `tests/image-artifacts.test.ts`, `tests/image-crop.test.ts`, `tests/image-crop-boundaries.test.ts`, `tests/image-crop-mcp.test.ts`다. 기존 경로 테스트를 재작성하지 않고 tolerant 사례를 추가한다.

## 6. 테스트 매트릭스

합성 PNG는 테스트 안에서 만든다. `tests/image-crop-mcp.test.ts:15` crc32, :24 chunk 패턴처럼 올바른 CRC를 붙인 chunk를 합성한다. 실제 스크린샷·새 기준 fixture는 넣지 않는다. 아래 A1–A5/R1–R6은 사전 설계 §5 전 항목이다.

| ID | 입력 / 검사 | 기대 결과 |
|---|---|---|
| A1 | opaque RGBA + sRGB/gAMA/pHYs | tolerant 색인 성공, ignoredChunks 순서 그대로, alpha opaque, 부분 crop 성공; 같은 파일 strict 색인은 unsupported_png_profile |
| A2 | caBX,tEXt,zTXt,iTXt,tIME,bKGD,cHRM,eXIf; 깨진 tEXt 및 길이 3 pHYs, CRC 정상 | 모두 허용; 내용 파싱 없음. 중복 이름은 처음 순서 한 번만 기록 |
| A3 | 약 1,000배 압축된 큰 iCCP payload, 파일은 10 MiB 이내 | 색인 성공. decode 인자 spy에서 iCCP 부재와 원래 core chunk 일치를 확인하고 별도 child의 RSS/시간도 기록하여 부가 payload 해제 비용이 없음을 확인 |
| A4 | RGB tolerant PNG | alpha none, channels 3, 부가 chunk 없으면 ignoredChunks [] |
| A5 | A1 tolerant 색인 → inspect → 부분 crop | 세 경로 성공, 재검증 metadata 일치, MCP source도 tolerant 레코드 유지 |
| R1 | tRNS / acTL / fcTL / fdAT / PLTE / 모르는 치명 chunk 각각 | unsupported_png_profile |
| R2 | 부가 CRC 오류 / IDAT 사이 부가 chunk 후 IDAT 재등장 / IEND 뒤 바이트 각각 | malformed_png |
| R3 | 서로 다른 허용 부가 chunk 33종 | unsupported_png_profile; 정확히 32종은 성공 |
| R4 | RGBA 알파 한 픽셀만 254 | 색인은 alpha present로 성공; 부분 crop은 alpha_unsupported |
| R5 | 기존 strict RGBA 레코드 부분 crop | 기존 alpha_unsupported 기대값 유지 |
| R6 | 색인한 경로의 파일 바이트를 이후 변경 | inspect/crop source_changed. 파일을 바꾸지 않고 profile만 달리 색인한 경우와 구별 |

A3 child 검사는 동일한 작은 픽셀 입력의 iCCP 유무를 비교하고 시간/RSS 원시 값을 기록한다. 이미 설치된 fast-png 실제 decode를 감싼 spy로 decoder 입력 제외를 결정적으로 검증한다. 임의의 시간 숫자를 보안 증명으로 대신하지 않는다. 성능 합격 기준은 §8 strict 게이트만 사용한다.

| 추가 계약 | 구체 검증 |
|---|---|
| ID 공존 | 동일 RGB/RGBA 원본 strict와 tolerant의 ID가 다름, store 둘 다 남음. 각 profile 재색인 ID 안정. strict ID는 기존 수식과 동일 |
| JPEG 요청 | 생략/strict 기존 ID 유지. tolerant는 실제 JPEG profile 접미사 ID, 실제 JPEG profile 반환, alpha/ignoredChunks 없음. strict 검사 거부 범위 유지 |
| 배열 격리 | put 인수, get 반환, index 반환, inspect 반환의 배열을 각각 push/순서 변경해도 저장값과 다음 inspect가 그대로. 참조 반환 custom store도 포함 |
| metadata 변조 | hash/파일 고정, alpha 또는 ignoredChunks 내용/순서/누락 변조 → inspect와 crop decode_failed |
| PNG 구조 | IHDR 중복/누락, IDAT 없음, 잘린 chunk, 잘못된 이름, IEND 길이, unsupported IHDR 모드, inflate 길이/필터 기존 제한 확인 |
| crop stride/순서 | 비균일 opaque RGBA에서 올바른 RGB 위치 확인. full-frame original 및 1536 초과 resize_required 기존 우선순위 유지 |
| 입력 스키마 | profile 생략/strict/tolerant 허용; 다른 문자열/null/숫자는 MCP 검증 오류 |
| 출력 스키마 | strict 두 레코드의 기존 필드 유지, tolerant 필수 배열/alpha 누락·잘못된 값 거부, JPEG/PNG profile 교차 거부, crop source 세 상태 검사 |
| 경로 회귀 | 6.9 index/inspect/crop 오류 매핑·경로 비노출·source race·packaging 기대값 변경 없이 통과 |

## 7. 후속 구현 순서 (TDD)

각 단계는 하나의 6.12a 구현 Task 내부 단계다. 이번 PR에서 실행하지 않는다. 계획 승인·merge 후 별도 구현 지시와 해당 Tier C/E 검토·비용 규칙을 적용한다.

### 단계 0: 기준 검증

- [ ] 손대지 않은 기준에서 의존성을 기존 lockfile로 준비하고 `npm.cmd run build` → `npm.cmd run typecheck`를 실행한다. 둘 다 오류 0 기록 후 테스트를 추가한다. 새 clone의 dist 부재를 제품 실패나 RED로 세지 않는다(PR #78 N-4).
- [ ] 대상 기존 테스트 baseline을 기록한다. 행동 RED마다 typecheck 오류 0을 먼저 확인한다. import/컴파일 실패는 RED가 아니다.

### 단계 1: tolerant PNG 검사·색인·저장

**파일:** image-artifacts.ts, types.ts, image-artifacts.test.ts. **입출력:** 기존 index 입력에 optional profile; 출력 ImageArtifactRecord에 tolerant 변형 추가.

- [ ] RED: 컴파일 가능한 타입/입력 seam을 먼저 준비한 뒤 A1–A4, R1–R3, R4 색인, ID 공존, 배열 격리를 추가한다. 새 profile이 strict로 처리되거나 metadata가 없는 행동 실패를 관찰한다.
- [ ] GREEN: §3.1 상태기계, S-1 decode, alpha 검사, §3.2 ID/복사 구현. 실제 PNG 바이트로 테스트하며 decode를 통째로 성공 stub 처리하지 않는다.
- [ ] REFACTOR: tolerant 전용 복사/metadata 조립을 정리하고 strict 필드/ID·거부 테스트를 다시 실행한다.

### 단계 2: profile 재검증과 crop

**파일:** image-artifacts.ts, image-crop.ts, image-artifacts.test.ts, image-crop.test.ts, image-crop-boundaries.test.ts. **입출력:** 레코드 validationProfile로 검사기를 선택하고 기존 pixels 반환/crop 상태 계약 유지.

- [ ] RED: A5, R4 부분 crop, R5/R6, metadata 변조, 비균일 RGBA stride와 기존 full-frame/resize 우선순위를 실행한다. tolerant inspect 거부와 opaque 부분 crop 거부 등 행동 실패를 기록한다.
- [ ] GREEN: 재검증 선택·metadata 비교와 opaque 조건/stride를 구현한다. reader/catch 매핑은 그대로 둔다.
- [ ] REFACTOR: 필요한 tolerant metadata 비교/배열 복사만 공유하고 경로 오류 테스트 전체 기대값을 보존한다.

### 단계 3: MCP·문서·패키징

**파일:** server/index.ts, image-crop-mcp.test.ts, query-artifact-mcp.test.ts, jpeg-fixtures.test.ts, smoke-mcp.mjs, docs/image-artifacts.md, README.md.

- [ ] RED: profile 입력 검증, 세 출력 변형, crop 중첩 source, fixture delta와 MCP 연속 색인/inspect/crop 테스트를 추가한다.
- [ ] GREEN: 입력 전달·스키마·설명·smoke tolerant 검사를 추가한다. fixture 파일 자체와 strict smoke 검사를 변경하지 않는다.
- [ ] REFACTOR: 문서에 색 정보 미적용, JPEG fallback, 실제 profile ID 및 strict/tolerant 알파 차이를 맞추고 기존 packaging/race를 재검증한다.
- [ ] §8 성능 측정과 §9 gate 후 구현 diff/검토 결과를 기록하고 해당 Task Draft PR 절차를 따른다. 실패/무효 측정을 통과로 기록하지 않는다.

## 8. 후속 성능 게이트

### strict 경로 비회귀 — 합격 게이트

- 대상은 strict PNG **색인과 crop을 각각** 측정한다. 입력은 픽셀 상한 16,777,216의 4096×4096 RGB PNG로 만들고 10 MiB 이내인지 확인한다. crop 영역은 (0,0,1536,1536)으로 고정하여 실제 부분 crop 비용을 잰다.
- 동일 프로세스 안에서 A=기준 main `4b67d72`, A'=기준 복사본, B=현재를 구분된 모듈 인스턴스·store로 로드한다. 기준 소스는 변경하지 않는다. 동일 입력/allowed roots/런타임/워밍업 조건을 사용한다.
- 각 연산을 동일한 사전 워밍업 후 A→A'→B 순서로 9회 교대 측정한다. 입력 생성과 모듈 로드는 timed section 밖에 둔다. crop용 색인도 밖에 두되 crop 자체의 bounded re-read/검증/encode는 모두 포함한다. index는 동일 조건의 store를 사용한다.
- 각 연산별 `median(A') / median(A)`가 0.97–1.03 밖이면 **측정 무효**. 유효한 측정에서 `median(B) / median(A) <= 1.03`일 때만 통과다. 두 연산 모두 통과해야 한다.
- 각 연산·각 변형의 원시 표본 9개씩, 실행 순서, 단위, 중앙값/비율, 입력 hash/크기/치수, runtime/환경, 세 소스 hash를 **새 구현 증거 파일**에 남긴다. 중앙값만 저장하지 않는다. 기존 증거는 수정하지 않는다.
- 소스 hash가 작업 사본(CRLF 포함)인지 커밋 blob인지 명시하고 서로 다른 기준을 섞지 않는다. 기준 커밋과 현재 커밋/dirty 상태도 기록한다.
- 게이트 실패 또는 A/A 무효이면 멈춰 보고한다. 임계값·기준·표본을 사후 변경하거나 유리한 재실행만 골라 통과시키지 않는다.

### tolerant 경로 — 기록만, 합격 게이트 아님

- 픽셀 상한의 opaque RGBA 입력에서 알파 검사와 core chunk 복사 비용을 분리해 기록하고 전체 tolerant 색인 시간도 남긴다.
- 최악 입력: 10 MiB 안에 길이 0의 올바른 CRC 부가 chunk(예: caBX)를 가능한 한 많이 넣는다. 유효 PNG core 크기를 제외한 공간을 12바이트 chunk로 채워 종류는 32 이하, 개수는 최대화한다. IDAT 연속성을 깨지 않도록 IDAT 전 또는 뒤에 둔다.
- 총 바이트·부가 chunk 종류/개수·순회/복사 비용과 원시 시간 표본을 기록한다. 상한을 넘긴 파일로 비용을 대체하지 않는다. tolerant에는 비교 기준이나 3% 합격 주장을 만들지 않는다.

## 9. 검증 순서와 전달

다음 7단계는 **후속 구현** gate다. 초기 build→typecheck baseline과 구분한다.

```powershell
npm.cmd run typecheck
npm.cmd test -- tests/image-artifacts.test.ts tests/image-crop.test.ts tests/image-crop-boundaries.test.ts tests/image-crop-mcp.test.ts tests/query-artifact-mcp.test.ts tests/jpeg-fixtures.test.ts tests/read-bounded-file.test.ts tests/core.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts
npm.cmd test
npm.cmd run build
npm.cmd run smoke:mcp
npm.cmd run validate:plugin
git diff --check
```

이번 계획 PR의 검증은 직접 요구사항/소스 검토와 `git diff --check`뿐이다. custom 검증 스크립트, 제품 테스트, build, 성능 측정은 실행하지 않는다. Tier D에 따라 Harness reviewer를 호출하지 않으며 기존 사전 설계 검토를 이번 계획의 독립 검토로 주장하지 않는다.

## 10. 계획 검토 체크리스트

- [x] 전달문의 확정안과 사전 설계 권장안을 그대로 반영했다. 이탈 없음.
- [x] 사전 설계 §4 전 행을 Maintain/Modify/Add로 분류했다.
- [x] 받음 5건·거부 6건, 배열 격리·재검증·ID·MCP·경로 회귀를 계획에 포함했다.
- [x] baseline build→typecheck, 행동 RED, 7단계 검증과 성능 원시 표본/중단 기준을 명시했다.
- [ ] 계획 승인·merge 후 별도 구현 지시를 받는다. 구현 완료를 주장하지 않는다.
