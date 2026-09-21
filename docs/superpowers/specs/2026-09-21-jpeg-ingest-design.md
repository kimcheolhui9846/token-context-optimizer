# 제한 JPEG 입력 설계 — 승인 전 제안

Task 21의 산출물은 설계와 codec 실행 가능성 조사다. JPEG runtime 지원은 아직 구현되지 않았다. Task 20의 PNG 지원과 논문 우선·이미지 이후 영상 순서를 유지한다.

## 결정과 대안

권고: **제한 프로필의 독립 entropy 검증기 + 수정하지 않은 jpeg-js 0.4.4 디코더**. 구조/entropy 검증을 먼저 통과한 bytes만 디코딩한다. 기존 네 파일 배포 구조를 유지할 수 있으나, 새 검증기의 정확성과 자원 경계를 별도로 증명해야 한다. 아래 계약은 구현 목표이며 안전성이 입증된 구현을 뜻하지 않는다.

| 대안 | 장점 | 비용·선택 이유 |
|---|---|---|
| 독립 검증기 + 원본 codec (권고) | codec fork 없이 전체 입력 소비를 검증하는 경계 분리 | Huffman/entropy 검증기를 유지해야 하며 적대적 테스트 필요 |
| 소비 위치를 반환하도록 codec 수정 | 중복 entropy 해석을 줄일 수 있음 | parser 복구 경로까지 감사해야 하고 fork·업데이트 책임 발생 |
| JPEG 지원 보류 | 새로운 parser 위험을 추가하지 않음 | 논문 JPEG 조건의 입력 지원이 지연됨 |

strict 옵션만 사용하는 방법은 [재현 결과](../../research/jpeg-codec-feasibility.md)에 따라 제외한다. native codec 전환은 설치 구조 변경이므로 이번 제안에 포함하지 않는다.

## 제안하는 v1 입력 계약

- SOI부터 EOI까지 하나의 baseline SOF0, 8-bit, 3개 YCbCr component(ID 1,2,3), 한 개의 interleaved sequential Huffman SOS만 허용한다.
- 첫 버전은 4:4:4, 모든 component H=V=1로 제한한다. SOS 순서는 1,2,3, Ss=0/Se=63/Ah=Al=0이다. grayscale/CMYK/YCCK/progressive/arithmetic/lossless/multiscan/DRI/RST는 지원하지 않는다.
- APP0 JFIF 하나만 SOI 직후 필수로 허용: identifier `JFIF\0`, version 1.01 또는 1.02, 길이 16, thumbnail 0×0, density unit 0/1/2와 양의 X/Y density. EXIF/ICC/Adobe/COM 및 그 외 APP는 거절한다. orientation 보정이나 ICC 색변환은 수행하지 않는다.
- DQT는 8-bit, ID 0..3, 64개 비영 계수; DHT는 baseline DC/AC, ID 0 또는 1로 제한한다. 동일 table 정의 중복·재정의는 거절한다. SOF/SOS가 참조하는 table은 사용 전에 정의되어야 한다. DQT/DHT의 복수 table segment는 정확한 payload 소비를 검증한다. Huffman all-ones code를 금지하며, oversubscribed tree와 중복 symbol은 거절한다. 비어 있지 않은 incomplete tree는 허용하되 미정의 code를 읽으면 거절한다.
- SOF 하나, SOS 하나, table 정의는 SOS 전까지; APP0 이후 DQT/DHT/SOF의 상호 순서는 참조의 선행 정의 규칙 안에서 허용한다. 알 수 없는 marker, segment 길이/범위 오류, SOI/EOI 중복, scan 뒤 추가 segment, EOI 뒤 bytes는 거절한다.
- canonical Huffman tree의 oversubscription/금지 code와 baseline symbol 범위, DC category≤11, AC size≤10, EOB/ZRL/run의 64 coefficient 경계를 검증한다. 기대 MCU 수 `ceil(width/8)×ceil(height/8)`, MCU당 3 blocks를 정확히 소비한다. FF byte stuffing, bitstream 부족, 마지막 0..7 padding bits의 all-ones 조건을 검사하며 추가 entropy byte는 허용하지 않는다. 구현 시 T.81 Annex B/C/F와 대조하는 검증 기록을 남긴다.

4:4:4는 일반 JPEG 전체를 지원한다는 뜻이 아니다. 기존 probe fixture의 sampling은 이 제안의 positive acceptance 증거가 아니다. 논문 변형 생성기는 후속 작업에서 이 프로필과 subsampling을 명시적으로 맞추고 encoder/version/quality를 provenance에 기록해야 한다. quality 75는 여전히 calibration 후보이며 효과가 검증된 값이 아니다.

## 자원과 데이터 흐름

기존 allowlist/realpath/regular-file/동일 파일 재확인 및 bounded reader를 사용한다. 상한은 encoded 10 MiB, 축당 8192, 16,777,216 pixels를 유지한다. 이 상한 이내라도 JPEG 전용 자원 예산을 초과하면 거절할 수 있다.

새 검증기는 pixel/계수 전체 배열 없이 제한된 table과 MCU 카운터로 순차 검사한다. 실제 decode 전 rounded block grid의 Int32 계수 배열, component line, RGB 출력 및 codec 중간 버퍼를 계산하고 예산 검사를 한다. `maxMemoryUsageInMB:128`, `maxResolutionInMP:16.777216`, `tolerantDecoding:false`, `useTArray:true`, `formatAsRGBA:false`를 제안한다. 128 MiB는 codec allocation accounting cap이며 process RSS/최대 총 메모리 보장이 아니다. 입력 복사, JS 객체, 검증기와 런타임 오버헤드는 별도다. synchronous CPU blocking과 실제 최대 입력의 시간/메모리 계측은 구현 검증 항목이며 아직 측정하지 않았다.

구조 → 프로필 → entropy → bounded decode → dimensions/RGB 길이 재확인 → metadata store 순서다. 실패 시 store에 기록하지 않는다. 원본 쓰기·백업·재인코딩·업로드는 하지 않는다.

## API와 오류

기존 `index_image_artifact`/`inspect_image_artifact` 도구와 PNG record 계약은 보존한다. JPEG record는 `format:jpeg`, `mimeType:image/jpeg`, `bitDepth:8`, `channels:3`(decoded RGB), profile `jpeg-ycbcr8-baseline-444-v1`로 구분한다. source path/hash/byte length 기반 identity 및 copy-on-put/get/return을 유지한다. schema/test/docs에 같은 profile을 반영한다.

제안 오류: 구조/entropy/decoder 실패 `malformed_jpeg`, 지원하지 않는 정상 계열 `unsupported_jpeg_profile`, JPEG 자원 예산 초과 `jpeg_resource_limit`. 기존 encoded/dimension/path 오류는 유지한다. inspect는 기존처럼 reread하고 path_denied를 보존하며 다른 read 실패는 source_missing_or_unreadable, 성공한 reread의 hash/길이 차이는 source_changed로 매핑한다. 새 오류로 기존 PNG 오류를 바꾸지 않는다.

## 구현 수용 기준과 승인 범위

1. 독립 encoder의 4:4:4 positive fixtures(1×1, 홀수 크기, 다중 MCU)와 provenance/hash를 확보한다. fixture 생성 codec과 검증 대상 codec을 구분한다.
2. probe에서 발견한 잘못된 입력 4종, truncation, 잘못된 table/순서/참조/coefficients/padding, metadata와 unsupported sampling, 상한 직전/초과를 실제 행동 RED→GREEN으로 검증한다.
3. 메모리 예산 초과를 큰 allocation 전에 거절하고, decode 단계의 예외·실패 store 무변경·원본 hash 불변을 확인한다. 실제 RSS를 accounting cap과 혼동하지 않는다.
4. PNG 및 text 회귀, MCP structuredContent/JSON schema/error, 독립 설치 네 파일 bundle과 Node≥22 지원을 검증한다. runtime dependency는 승인 후에만 추가한다.
5. package LICENSE와 decoder의 Apache-2.0 header를 모두 검토하고 필요한 라이선스 전문/저작권 고지를 배포에 보존한다. package LICENSE 하나만으로 충분하다고 가정하지 않는다.
6. 사용자 승인 후 Luna(실제 불가 시 GPT-5.5)가 구현 계획의 TDD를 수행하고, Astra가 diff/검증/PR을 직접 리뷰한다. full entropy 검증을 증명하지 못하면 JPEG 지원을 완료 처리하지 않는다.

예상 파일: image artifact validator/record/MCP schema, 전용 JPEG validator 모듈, image tests/fixtures, dependency lock/build license 처리, input contract와 논문 상태 문서. 공유 reader의 필요한 재사용 외 무관한 리팩터링은 제외한다.

승인 요청 범위는 위 제한 프로필과 독립 검증기 방식의 구현 계획 및 구현이다. JPEG encoding/resize/OCR/선택 guard/모델 평가/영상/새 native 배포는 포함하지 않는다. JPEG ingest만으로 M1 전체나 논문 실험이 완료되지는 않는다.
