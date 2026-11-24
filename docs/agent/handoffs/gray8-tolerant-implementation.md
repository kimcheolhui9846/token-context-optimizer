# 8비트 회색조 PNG tolerant 구현 핸드오프

- Task: `gray8-tolerant-implementation` (Orca task `task_6458c211ec1e`)
- 브랜치: `claude/gray8-tolerant-implementation`, 기준 main `e46f75ecc47e7be54af83c244cc4f888d4b3345e`
- 근거: 승인된 결정안 `docs/superpowers/plans/2026-11-24-gray8-tolerant-policy.md` §4–9 (#142), 2026-11-24 사용자 승인 구현 요청서
- 역할: Codex Astra = PM·최종 판정, Claude Code(Opus 5.5) = 개발 책임자(코어·MCP·커밋·push), 문서 초안은 Sonnet 하위 작업자 가능, 마일스톤 검토는 별도 Opus 5.5 세션
- 범위: Tier C 제품 코드·테스트·문서, Draft PR까지. 설치·배포·버전 변경·논문·WBS·연구 결과 수정은 범위 밖

## 0. 착수 전 확인

- 독립 Opus 계획 검토: 요청서에 기록된 대로 `harness-opus-review`(반환 모델 `claude-opus-5-5`) 1차 CHANGES REQUIRED → 수정 계획 PASS(blocker 0·major 0·minor 0·note 2). 별도 파일은 `codex_review/`에서 찾지 못했고 요청서 본문을 근거로 삼는다. 두 note(32종 수락/33종 거부, 색 관리 밝기 차이 문서화)는 인수 기준에 넣는다
- R7 기대표 `sssk/.artifacts/gray8-tolerant-implementation/r7-expectations.json` SHA-256 `ac96696a…f313` 일치 확인(작업 시작 시 `sha256sum`)
- R7 입력 `mcp-view-comparison/research/out/mvc-pmfix/prep/input/images/original` 48장 존재 확인

## 1. 구현 계획 (파일 소유)

| 영역 | 파일 | 변경 |
|---|---|---|
| 코어·타입 | `src/core/types.ts` | 다섯 번째 레코드 변형 `png-gray8-tolerant-v1`, `channels: 1`, `alpha: "none"`, `ignoredChunks` |
| | `src/core/image-artifacts.ts` | tolerant IHDR에서 color type 0 허용(치수 검사 뒤, 비트깊이 8만), 레코드 생성, `isTolerantProfile`, `validateForRecord`(프로필로 먼저 분기), `recordMetadataMatches`(밀집 배열 기준 대조) |
| | `src/core/image-crop.ts` | 부분 crop에서 g → (g,g,g,255) 작업 버퍼 |
| | `src/core/image-overview.ts` | 1채널 면적 평균, 현행 반올림식, 출력 (v,v,v,255) |
| MCP | `src/server/index.ts` | `imageOutputSchema` 다섯 번째 객체 추가(기존 네 객체 불변), 세 도구 설명 |
| 문서 | `docs/image-artifacts.md`, `skills/optimize-context/SKILL.md`, `README.md`의 지원 목록 | 새 프로필, 추가 스키마, 색 관리 무시와 밝기 차이 |
| 번들 | `bin/token-context-optimizer.mjs` | `npm run build` 산출물 1회 |

## 2. 판정 매핑 (P/N/R → 증거)

코어 = `tests/image-gray8-tolerant.test.ts`, MCP = `tests/image-gray8-mcp.test.ts`(패키징 번들 `bin/token-context-optimizer.mjs`를 실제 stdio MCP 클라이언트로 실행), 헬퍼 = `tests/helpers/gray8-png.ts`(필터를 직접 인코딩해 기대 픽셀을 테스트가 안다).

| 항목 | 증거 |
|---|---|
| P1 | 코어 "P1": 레코드 전체 `toStrictEqual`, 키 순서, ID = `sha256(정규경로 \0 sha \0 png-gray8-tolerant-v1)` 앞 16자. MCP: 같은 레코드가 `structuredContent`·텍스트 JSON 양쪽에서 일치 |
| P2a·b·c | 코어 "P2a/P2b/P2c": gAMA·pHYs·tEXt, sRGB만, iCCP만(가짜 프로필 내용). 첫 등장 순서·반복·대소문자·IDAT 뒤 부가 청크 케이스 추가. 디코드 픽셀 = 입력 픽셀 |
| P3 | 코어 "P3": 두 번 색인 → 같은 레코드, 저장소 1건 |
| P4 | 코어 "P4": index 반환값·get 결과를 바꿔도 저장소 배열 불변, put 뒤 원본 배열 변경도 불반영, inspect 일치. MCP inspect 일치 |
| 행 필터 | 코어 "row filters": 필터 0·1·2·3·4, 혼합 행, 너비 1, 높이 1(이전 행 없음) Up/Average/Paeth. 기대 픽셀은 헬퍼가 정의한 독립 값 |
| P5 | 코어 "P5", MCP: `status:"original"`, 이미지 항목 0개, 반환 경로를 실제로 열어 SHA = `source.sha256` = 원본 SHA |
| P6 | 코어: 부분 crop 7영역(모서리 1×1, 행·열 전체, 우하단 가장자리), 개요 maxSide 기본·64·512·1536·원본보다 큼(700×301, 1601×97, 37×23). 통제본 JPEG와 `Buffer.equals`, 길이·SHA, jpeg-js 디코더 치수, strict JPEG 검사. MCP: 본문 기준 1–4(이미지 항목 정확히 1개·MIME, 실제 base64 바이트 SHA·길이 = output, 독립 디코드 치수, 통제본의 **실제 content 바이트**와 동일), 41×29와 1700×300 |
| P7 | 코어 "P7": 1×1, 8192×1, 1×8192, 4096×4096, 8192×2048 수락 |
| N1 | 코어·MCP: strict 생략·명시 모두 `unsupported_png_profile`(MCP는 `isError`, 텍스트만) |
| N2 | 코어: 비트깊이 1·2·4·16, color type 3(PLTE 포함)·4, Adam7, 압축·필터 방법 1, tRNS, PLTE, acTL·fcTL·fdAT, 미지 critical `ABCD` → `unsupported_png_profile`. 미지 ancillary `aBCD`는 수락 |
| N3 | 코어: IHDR·ancillary·IDAT CRC, 잘린 청크, 필터 바이트 5, 팽창 부족·초과, 압축 꼬리 바이트, IDAT 사이 부가 청크 → `malformed_png`. 끊기지 않은 IDAT 3분할은 수락 |
| N4 | 코어: 8193×1, 1×8193, 4096×4097 → `image_dimensions_exceeded`, 10 MiB 초과 → `encoded_size_exceeded` |
| 분기 순서 | 코어 "branch order": 크기 > IHDR CRC > 치수 > 프로필 > 스트림(16비트 회색조·tRNS와 결합) |
| N5 | 코어: 서로 다른 32종(+반복) 수락, 33종 `unsupported_png_profile` |
| N6 | 코어: 통제본·다른 회색조로 교체 → inspect·crop·overview 모두 `source_changed`. MCP도 세 도구 `source_changed`, 되돌리면 통과 |
| N7 | 코어 주입 저장소(`RawStore`, 복제 없음): channels 3·4, alpha opaque·present·undefined·누락, ignoredChunks 누락·순서·값·개수·빈 배열·**희소 배열**·문자열, width·height·bitDepth, format jpeg, mimeType, 프로필 rgb-tolerant·rgb-static, JPEG 필드 4종 → 세 경로 모두 `decode_failed`(25케이스). 변조 없는 레코드는 통과. 기존 프로필 변조(RGB 레코드 channels 1): strict inspect 통과·crop/overview `decode_failed`, rgb-tolerant 세 경로 `decode_failed`(현행과 같음) |
| N8 | 코어·MCP: 1537 → `resize_required`(MCP `isError`+구조화 결과), 1536 → cropped |
| R1 | 전체 `npm test` 통과(아래). 기존 테스트 변경은 §3 참조 |
| R2 | 코어 "R2": R=G=B 통제본 strict `png-rgb8-static-v1`(ID에 프로필 없음), tolerant `png-rgb8-tolerant-v1`, 기존 식별 규칙 그대로 |
| R3·R4 | MCP "advertises": index·inspect·overview source·crop 세 변형 source 모두 anyOf 다섯 개, 다섯 번째 = 기대 JSON Schema. 기존 `image-crop-mcp`·`query-artifact-mcp`·`jpeg-fixtures` 테스트가 기준 fixture 대비 앞 네 객체 불변을 확인 |
| R5 | MCP 테스트 3건 + `scripts/smoke-mcp.mjs`(설치 배치에 복사한 번들, 회색조 strict 거부·tolerant index·inspect·전체 crop 원본 SHA·부분 crop·overview, 다섯 번째 스키마 형태) |
| R6 | 저장소 게이트 7단계 통과(§3) |
| R7 | §4 |
| R8 | `docs/image-artifacts.md`, `skills/optimize-context/SKILL.md`, `README.md`, `docs/design.md`, 세 도구 설명. 문서 초안은 Sonnet 하위 작업자(`harness-sonnet-worker`, 모델 sonnet)가 쓰고 개발 책임자가 diff를 직접 읽고 두 곳을 고침 |

메모리: 부분 crop 작업 버퍼는 `region.width × region.height × 4`(≤ 1536²×4), 개요는 출력 RGBA와 `w × 1` 누적 배열 두 개. 회색조 원본은 1바이트/픽셀로만 디코드되고 전체 RGB 사본을 만들지 않는다(코드 확인, 실측 아님).

## 3. 검증 기록

모두 이 worktree, Windows, Node v24.18.0.

- RED: 구현 전 코어 74건 중 54건 실패(전부 `unsupported_png_profile` 또는 회색조 경로 부재), MCP 3건 실패(기준 번들이 tolerant 회색조를 `unsupported_png_profile`로 거부, 스키마 네 개). 기준 번들에서 정상 회색조의 tolerant 거부를 직접 관찰
- GREEN 뒤 저장소 게이트(구현 커밋 `27a8849`, 리뷰 수정 뒤 다시 한 번 모두 같은 결과): `npm ci --ignore-scripts`(0 vulnerabilities) → `npm run build` → `npm test` 60 파일, 4639 통과·5 건너뜀 → `npm run typecheck` 통과 → `npm run smoke:mcp` "mcp smoke ok" → `npm run validate:plugin` "plugin manifest ok" → `npm run benchmark` `passed: true`
- 첫 전체 실행에서 `tests/jpeg-fixtures.test.ts`의 스키마 목록 고정 1건 실패 → 다섯 번째 변형을 명시적 변경으로 추가하고 회색조 레코드 수락·변조 거부 단언을 더해 재실행 통과
- 기존 테스트 변경(모두 의도한 계약 변경): `image-artifacts.test.ts`의 tolerant "지원 안 되는 IHDR" 예를 8비트 회색조에서 16비트 회색조로, `image-crop-mcp`·`query-artifact-mcp`의 도구 설명 문자열과 `withTolerantSchema`에 다섯 번째 변형 추가, overview source anyOf 4 → 5, `jpeg-fixtures` 프로필 목록, `smoke-mcp.mjs`의 4 → 5
- 번들: `npm run build` 산출물. 리뷰 수정 뒤 최종 번들 작업 사본 SHA-256 `0623ed89…4c8e`(구현 커밋 시점 `0e2c49bf…fbda9`). R7은 두 번들 모두에서 48/48
- Argon: `codex_review/argon/2026-11-24_gray8-tolerant-implementation-{bundle,argon}.md`. 묶음은 정책 §4–8 발췌 + `src` diff만. 결과 APPROVE, 결함 없음. 발췌 밖이라 확인하지 못한 항목(tRNS 등 기존 분기, 테스트)은 위 테스트로 덮인다
- 독립 Opus 마일스톤 검토: §5

## 4. R7 (#141 원본 48장)

- 입력: `mcp-view-comparison/research/out/mvc-pmfix/prep/input` 읽기 전용. 실행기와 ID별 산출물은 worktree `.artifacts/gray8-tolerant-implementation/`(`r7-run.mjs`, `r7/<id>.json`, `r7/summary.json`, git 무시). 이미지·절대경로·연구 원자료는 커밋하지 않음
- 동결 표: `expected-sha.json`의 `original`을 `JSON.stringify`해 SHA-256 = `8caae29b…4514` = 기준 커밋 `FROZEN_INPUTS.originalSha` = PM 기대표 `frozenOriginalTableSha256`. PM 기대표 파일 SHA-256 `ac96696a…f313` 확인
- 파일별: 48/48 SHA가 동결 표·PM 기대표와 일치. 제품 코드 없이 독립 검사(IHDR, 청크·CRC(`zlib.crc32`), 금지 청크, 부가 청크 종류, IDAT 연속성, 팽창 길이 `(W+1)×H`, 필터 ≤ 4, 크기 한도) 48/48 정책 적합. 범위 밖 원본 없음. 부가 청크는 48장 모두 없음(`ignoredChunks: []`)
- 패키징 번들(최종 `0623ed89…4c8e`, 첫 실행 `0e2c49bf…fbda9`): strict 48/48 `isError`+`unsupported_png_profile`(구조화 결과 없음), tolerant 48/48 `png-gray8-tolerant-v1`, `sha256` = 동결 SHA, `artifactId` = §5.2 식, `channels: 1`, `alpha: "none"`, 치수 = IHDR, `ignoredChunks` = 독립 검사 결과. ID·결과가 PM 기대표와 일치
- 추가 증거(R7 범위 밖): 48/48 전체 crop이 이미지 없이 원본 참조를 돌려주고 다시 연 SHA 일치, 개요(512) 본문 SHA·길이 = output, #141 RGB 통제본의 실제 본문과 바이트 동일
- 판정: **PASS** 48/48. 이 결과는 입력 수락 범위만 확인한다. #141 포함률·OCR·논문 수치의 개선 여부는 측정하지 않았다

## 5. 독립 마일스톤 검토

- 역할: 사용자 에이전트 `harness-opus-review`, 작성 세션과 분리된 별도 세션. 반환 모델 `claude-opus-5-5`. 구현 커밋 `27a8849`까지의 diff, 실제 코드, 정책 §4–9를 읽음
- 실행한 검증: 대상 vitest 6 파일(249 통과·2 건너뜀), `npm run typecheck`, `npm run smoke:mcp`, `jpeg-fixtures`·`query-artifact-mcp`(26 통과). 작업트리는 바꾸지 않음. npm ci·build·전체 test·validate·benchmark·R7은 실행하지 않음
- 판정: **PASS WITH NOTES**(Blocker 0, Major 0, Minor 1, Nit 1, Note 4)
  - Minor: crop·overview 도구 설명에 색 관리 미적용 문구가 없음(R8) → 두 설명에 "PNG color metadata is not applied" 추가, 고정 테스트 2곳 갱신 (`fix(review)` 커밋)
  - Nit: `docs/design.md` crop 줄 "including RGBA sources" → "including RGBA and grayscale sources"로 수정
  - Note(조치 없음): (1) 회색조 파일을 가리키는 `png-rgb8-tolerant-v1` 변조 레코드는 기준에서 `unsupported_png_profile`, 지금은 `decode_failed`. SHA가 회색조 파일과 맞아야 해 변조로만 만들 수 있고 N7 범위다. (2) 회색조 레코드의 format·path·SHA를 모두 실제 JPEG로 바꾸면 `unsupported_image_format`. N7 목록 밖이다. (3) RGB 개요 루프에 분기 1개, 성능은 측정하지 않음. (4) 검토 시점의 핸드오프 미완성 → 이 문서로 채움
- 수정 뒤 저장소 게이트 7단계와 R7을 다시 실행해 모두 통과. 수정은 Minor·Nit 범위의 문구라 재심은 생략하고 PM 최종 판정에 맡긴다

## 6. 남은 위험·범위 밖

- 색 관리 무시: gAMA·iCCP가 있는 원본은 색 관리 뷰어와 밝기가 다를 수 있다(문서화)
- 성능: 새 성능 임계값은 범위 밖. 기존 `npm run benchmark`만 실행했고 이미지 경로는 그 벤치마크에 없다. `areaAverageRgba`의 RGB 경로에 분기 하나가 늘었다(같은 산술, 기존 overview 테스트 통과). 시간·메모리 실측 없음
- MCP 경로로는 저장소 내부 변조(N7)를 만들 수 없어 코어 주입 테스트로만 검증
- WBS·논문·연구 결과는 요청서에 따라 수정하지 않음. 설치·배포·버전 변경 없음. PR은 Draft

## 7. PM 1차 판정 반영 (2026-11-24, 검토 head `aa3253d`)

- PM 판정: 제품 검증 통과, 공개 문서 Minor 2건
- Minor 1(공개 ID 형식): `docs/image-artifacts.md`의 ID 문장을 `artifactId` = `image_` + 식별 SHA-256의 첫 16개 소문자 16진 문자, 식별 해시 입력 = 정규 경로·NUL·원본 바이트 SHA-256 64자 16진 문자열·NUL·`png-gray8-tolerant-v1`로 고침(`src/core/image-artifacts.ts`의 `identityInput`·`artifactId` 식과 대조)
- Minor 2(개요 작업 행): Float64Array + Uint32Array = 밴드당 (8 + 4) × 출력너비 → RGB/RGBA 36 × 출력너비, 회색조 12 × 출력너비로 나누고, 출력 RGBA 버퍼·디코드 임시 메모리와 구분해 적음(`src/core/image-overview.ts`의 `bands` 대조)
- 제품 코드·번들 변경 없음. PR 본문에 완료한 검증·R7·독립 검토·미측정 항목을 기록
