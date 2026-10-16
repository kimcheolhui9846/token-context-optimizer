# Task 33: First transform decision and JPEG probe implementation plan

> 사용자 구현 승인(2026-10-14)에 따라 **superpowers:executing-plans**로 실행한다. Task 33은 Draft PR에서 멈추며 마일스톤 리뷰는 사용자 제공 Claude 리뷰로 받는다.

**Goal:** 승인된 이미지 설계의 실제 연산 필요를 비교하는 새 메모와 jpeg-js 0.4.4 raw encoder의 q50/q75 적합성·결정성·자원 관측 증거를 만든다.

**Architecture:** 제품 코드를 바꾸지 않는 독립 연구용 harness가 코드를 통해 RGB pattern을 만들고 raw JPEG bytes를 보존한다. encoder, 기존 validator, 재디코드 측정을 별도 process로 분리한다. 메모는 구현 순서 권고와 미정 선택을 설명하며 첫 연산을 확정하지 않는다.

**Tech Stack:** 기존 Node/TypeScript/Vitest/jpeg-js 0.4.4, Node child-process IPC/resourceUsage. 새 dependency 없음.

## 1. 범위와 승인 경계

- base `b83c91dc9cd063a9876b98eedcbda9726cf1544a`, branch `codex/task-33-transform-probe`. pull --ff-only는 controller가 수행했고 Astra가 HEAD와 최초 clean status를 확인했다.
- Task 33은 **Tier C**다. 계획 검토 1회와 마일스톤 검토 1회, 구현 후 npm gate가 필요하다. 사용자 제공 Claude 리뷰는 독립 리뷰로 인정하며 별도 중복 호출을 요구하지 않는다. blocker/major 수정 때 외에는 scoped 재검토하지 않는다. 핸드오프는 약 80행 이하로 현재 상태를 갱신하고 리뷰 토큰·비용을 기록하지 않는다.
- 구현 범위는 §2의 여덟 파일이다. [Task33 핸드오프](../../agent/handoffs/task-33.md)에 실제 상태를 갱신한다. 계획 재검토는 다시 받지 않는다.
- 승인 후에도 src/public API, resize 구현, 새 dependency, 공개 tool/manifest 계약은 수정하지 않는다. 논문/프로토콜/기존 결정 메모/17 결정값/Task29/공유 HANDOFF/WBS는 보호한다.
- 외부 이미지/실제 dataset/모델/hosted/count-tokens/calibration/효과실험 없음. 합성 raw pixel buffer는 이 probe에만 쓰며 clean corpus 치수 목록을 확정하지 않는다.
- q75는 항상 실제 재인코딩한다. q50→q75 bypass를 선택지로 만들지 않는다. raw encoder 실패를 APP0 삽입·metadata 삭제 등으로 숨기지 않는다.
- sharp 독립 decode 및 sharp q50/q75 DQT·bytes 비교는 **Claude 담당(`research/`), 이 Task 범위 밖**이다. Codex는 sharp를 설치·실행하거나 `research/`를 수정하지 않는다. 재현용 pattern 식과 출력별 DQT 증거를 제공한다.
- Windows 모든 exec는 tty:true/login:false. 자식 프로세스는 숨김으로 실행한다. 실험용 자식은 직렬 실행하며 동시 encoder 부하를 만들지 않는다.

## 2. 승인 후 파일 제안

| 파일 | 책임 |
| --- | --- |
| `docs/research/first-transform-jpeg-probe-decision.md` | 연산 matrix, 결과와 한계, 첫 연산 권고/미정 선택 |
| `scripts/probe-jpeg-encoder.mjs` | 부모 CLI, 셀/반복 스케줄, 자식 결과 취합 |
| `scripts/probe-jpeg-worker.mjs` | 합성 buffer 및 encode/validate/redecode phase 실행 |
| `docs/research/evidence/task-33/jpeg-encoder-results.json` | 실제 실행 환경·설정·개별 run 결과/실패·집계 |
| `docs/research/evidence/task-33/README.md` | 재현 명령·데이터 생성 규칙·측정 범위·한계 |
| `tests/jpeg-encoder-probe.test.ts` | harness 오류/결정성 집계/phase 분리의 targeted tests |
| 이 계획 / Task33 핸드오프 | 승인·실제 명령·review·Git/PR 상태 |

- binary JPEG와 임시 process 결과는 ignored `.artifacts/task-33-probe/`에만 두고 결과 JSON에 SHA-256/크기/생성식으로 연결한다. 결과는 관측 실패도 기록한다. 검토용 파일은 경로·환경 정보에서 사용자 개인정보를 제거한다.
- `package.json`, lockfile, tsconfig는 변경하지 않는다. scripts tsconfig가 explicit allowlist이므로 새 MJS는 별도 tsc 명령으로 검사한다. 새 test는 기존 tests include에 들어간다.
- 증거 경로의 task-33은 Task 번호다. 핸드오프와 향후 PR 본문에는 `Task 33(PR #실제번호)`를 함께 적는다. 현재 PR은 미생성이며, Claude의 `research/` PR #33과 혼동하지 않는다.

## 3. 고정 base 근거

| 근거 | 읽을/검증할 의미 |
| --- | --- |
| `package.json` L11–14, L30 | build/test/typecheck와 jpeg-js 0.4.4 고정 |
| `src/core/jpeg-validation.ts` L20–79 | 제한 구조/치수/MCU entropy·accounting 검사 |
| 같은 파일 L81–93 | jpeg-js decode 재확인과 반환 치수/길이 검사; 독립 codec 아님 |
| 같은 파일 L12, L97–103 | 치수/128MiB accounting 및 JFIF/table 제한 |
| `docs/research/image-protocol-decision-memo.md` L626–637 | X1/X2, 선택 F1/K-n/rc/same/same/out, 준비/arm 도출 및 한계 |
| `docs/research/image-transform-provenance-gap.md` L71–149 | 첫 연산 미정, RGB PNG crop 조건부 후보, 세 full-frame 선택 |
| `docs/research/jpeg-runtime-validation.md` L16–28, L62–73 | decoder accounting과 host RSS 별개 |
| `tsconfig.scripts.json` L12–22 | 기존 scripts만 포함; 새 harness 별도 검사 필요 |
| `docs/research/image-first-evaluation-protocol.md` L44–59, L71–84 | clean 및 네 준비 recipe, 잠정값/공동 freeze |
| 같은 프로토콜 L88–97, L101–110, L118–140 | 활성 단일 변환, 배정 variant, 다섯 arm 및 단계별 identity |
| 같은 프로토콜 L209–214 | D−C 입력 선택·byte 동일성 도출 한계 |
| `docs/research/image-token-cost-models.md` L31, L54 | GPT-4o 타일 회계에 quality 변수 없음; Haiku 28px patch 회계에 따른 예측 근거 |

기존 `scripts/measure-jpeg-node22-production.mjs`의 sharp 산출물에 JFIF를 삽입하는 경로는 raw encoder 적합성 근거로 재사용하지 않는다. source 열람은 허용하나 이 계획 작성에서 encoder를 실행하지 않는다. 설치된 encoder source의 위치/버전/hash는 실행 단계 시작 때 읽기만으로 재확인하고 결과에 남긴다.

## 4. 새 메모의 연산 matrix

표의 ‘필요’는 pixel 연산 경로의 능력 요구다. 기존 ingest의 검증 decode와 혼동하지 않는다. 실제 코드 호출/횟수/효과를 관측했다고 쓰지 않는다. source capture/raw reuse 구현은 아직 선택하지 않았다.
최종 메모의 준비 recipe 및 matrix 각 행에는 위 프로토콜/결정 메모의 정확 base행 출처를 붙인다. 문서 전체 링크 하나로 행별 도출 근거를 대신하지 않는다.

### 4.1 조건 준비

| 준비 조건 | pixel decode | crop | resize 1024 | resize 1536 | JPEG q50 | JPEG q75 | PNG encode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| clean | 원천 파일 그대로; 변환 decode 없음 | 없음 | 없음 | 없음 | 없음 | 없음 | 없음 |
| JPEG-only | PNG→raw 필요(이미 raw 보유 시 재decode 여부는 구현 선택) | 없음 | 없음 | 없음 | 필요 | 없음 | 없음 |
| downscale-only | PNG→raw 필요 | 없음 | 필요 | 없음 | 없음 | 없음 | 필요 |
| combined | PNG→raw 필요 | 없음 | 필요 | 없음 | 필요 | 없음 | 없음 |

combined의 clean 직접 파생은 기존 집계 가정이며 새 사용자 승인이 아니다. PNG canonical 이름이 arm에서 비활성인 것과 downscale-only 준비 PNG encoder 능력은 별개다.

### 4.2 arm × 배정 variant

아래 각 row를 메모에서는 clean/JPEG-only/downscale-only/combined 네 열로 펼친다. PNG variant는 clean/downscale-only, JPEG variant는 JPEG-only/combined다.

| arm 경로 | decode | crop | resize1024 | resize1536 | q50 | q75 | PNG encode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 변환 decode 없음 | 없음 | 없음 | 없음 | 없음 | 없음 | 없음 |
| B | 배정 PNG/JPEG→raw | 없음 | 없음 | clean/JO 실제 축소; DO/CB identity 단계 | 없음 | 항상 | 없음 |
| C | 배정 PNG/JPEG→raw | 선택 영역에 조건부 | 없음 | crop 결과가 1536 초과 시 축소; DO/CB identity | 없음 | 항상 | 없음 |
| D-transform | C와 같은 경로 | 선택 영역에 조건부 | 없음 | C와 같음 | 없음 | 항상 | 없음 |
| D-fallback | 변환 decode 없음 | 없음 | 없음 | 없음 | 없음 | 없음 | 없음 |
| E | 배정 PNG/JPEG→raw | oracle crop 필요, full-frame 실행정책 미정 | 없음 | crop 결과에 따름; DO/CB identity | 없음 | 항상 | 없음 |

- 모든 A/D-fallback은 배정 variant bytes 그대로이며 hidden clean 접근은 없다. D 전체와 D-transform을 혼동하지 않는다.
- D-fallback row는 최종 전달 경로만 뜻한다. guard가 거부 전에 candidate를 계산했을 수 있으므로 D의 총 계산량에 decode/crop/encode가 없다는 뜻이 아니다.
- D 두 행은 base의 현행 정의다. **Task 34에서 응답 기반 fallback으로 개정 예정**이며 개정 뒤 D는 C 경로 + 조건부 원본 재요청이다. 재요청은 배정 원본을 그대로 보내므로 새 변환 연산이 없다. 위 호출 전 guard 설명을 미래 정의에 적용하지 않는다. 모델 응답을 MCP 도구가 어떻게 볼지는 플러그인 설계의 후속 고려 사항이며 이 Task에서 설계하지 않는다.
- 단계 순서는 crop/영역 처리 →1536 no-upscale→q75이며 구현 우선순위와 다르다. crop/full-frame/identity 최적화 정책은 아직 선택하지 않는다.
- 후보 순서(미선택): **JPEG encode 적합성 확인 → resize → crop**은 넓은 커버리지와 codec 선행 위험 때문에 검토할 후보 순서다. 사용자 표현에서 읽은 가설이지 확정 결정이 아니다. JPEG encode는 JO/CB 준비와 B/C/D-transform/E에 공통이나 encoder 하나로 네 조건 전체의 arm을 완성하지 못한다. 다만 기존 PNG/JPEG decoder와 합치면 JO 준비, X4가 identity resize를 pixel pass-through로 처리할 경우 B×DO/CB 셀은 도달 가능하다. 이는 도출이며 실제 product 경로 구현/관측은 아니다. fast-png decode는 존재하지만 공개 pixel API 재사용 계약까지 확정한 것은 아니다.
- 비교 대안: RGB PNG crop부터 하면 정수 geometry/pixel 검증이 단순하지만 JPEG variant를 직접 받지 못하며 현재 arm 최종 출력 JPEG까지 완성하지 못한다. resize부터 하면 준비 DO/CB와 arm cap에 직접 필요하나 X8/구현 선택이 선행한다. 모든 연산 동시 구현은 원인 분리가 어렵다.
- probe 실패면 JPEG encode 우선 권고를 자동 실행하지 않는다. 실패 원인/후속 선택을 메모에 남기고 사용자 판단을 받는다.

### 4.3 커버리지와 청구 토큰·정확도 영향을 함께 비교

새 메모의 후보 비교에는 아래 두 축을 나란히 둔다. 커버리지는 설계상의 필요이며 효과를 뜻하지 않는다. 순서 결정 칸은 비워 두고 사용자 대기로 표시한다.

| 후보 | 경로 커버리지·선행 조건 | 청구 토큰·정확도 영향과 근거 한계 |
| --- | --- | --- |
| JPEG encode 우선 | JO/CB 준비 및 B/C/D-transform/E의 출력 형식에 공통; codec 적합성 선행 위험 확인 | GPT-4o 회계식에 quality 변수가 없어 같은 치수의 JPEG 재인코딩 자체로는 타일 토큰이 줄지 않는다. q75는 형식 요구이며 정확도 개선 근거는 없다 |
| resize 우선 | DO/CB 준비 및 arm cap에 필요; X8·구현 방식 선결 | 제공된 파일럿에서 1536/1024 resize의 GPT-4o 청구 토큰 감소는 0%였다. Haiku의 1024 resize 절감은 저장소 28px patch 회계에 따른 **예측이며 미측정**이다 |
| crop 우선 | C/D-transform/E 영역 처리; JPEG 출력까지는 encode가 별도로 필요 | 제공된 파일럿에서 토큰을 줄인 연산은 crop뿐이었다. oracle crop은 정확도 +11%p(100% 대 89%), 토큰 −49%; OCR 창 selector와 응답 기반 fallback 조합은 같은 정확도에서 토큰 −25%로 보고됐다. 조합 효과를 crop 단독 효과로 분리해 주장하지 않는다 |

- 근거는 사용자 제공 `codex_review/codex_message_2026-10-14_current-status.md`와 `codex_review/codex_review_feedback_2026-10-14_task33-plan.md`의 PR #33 파일럿 요약이다. 해당 `research/results/pilot-001/README.md`, `pilot-002/README.md`, `pilot-003/README.md`는 Claude 작업의 읽기 전용 후속 근거다. 이번 Task에서 파일럿을 실행하거나 재현하지 않았다.
- **개발용 탐색 관찰**이며 `gpt-4o-2024-11-20` 하나, 긴 변 2048 이하 4:3·3:4 합성 이미지에 한정된다. calibration·held-out 본 평가 결과가 아니며 다른 종횡비·모델·encoder로 일반화하지 않는다. 효과 측면에서는 crop 우선도 비교하되 JPEG encode→resize→crop을 확정하지 않는다.
- 파일럿의 sharp(libvips/mozjpeg 빌드, `mozjpeg:false`)와 jpeg-js 출력은 같다고 가정하지 않는다. 메모 한계에 **quality 값은 encoder 의존(X9)**임을 명시한다.

## 5. 미정 설계 선택 비교

- X4 full-frame crop: 원본 참조 no-op / 거부 / 재인코딩의 Task29 세 안을 보존한다. candidate no-op의 허용/표현도 미정이다. 어떤 안도 q75 재인코딩 생략 권한이 아니다.
- X4에는 identity resize의 bytes 유지/재처리 정책도 포함한다. candidate no-op은 selector에 무변환 후보를 허용할지와 provenance 표현을 뜻하며 현재 S-same을 자동 변경하지 않는다. resize 단계 identity와 pipeline 전체 무변환을 구별하고 모든 q75 경로의 재인코딩은 유지한다.
- X8 필터: nearest는 단순하지만 aliasing, bilinear는 비교적 단순하지만 작은 글자 blur, area/bicubic 계열은 축소 품질/계산량/경계 규칙의 선택이 필요하다. 효과를 검증했다고 쓰지 않는다.
- 반올림: floor/nearest/ceil은 목표 cap·최소1pixel·aspect ratio 오차와 함께 비교한다. 정확 식과 tie 처리는 선택하지 않는다.
- 구현 방식: 직접 구현은 dependency 없이 규칙을 통제하지만 검증 부담이 크다. 새 dependency는 codec/성능 선택 폭이 넓지만 라이선스/배포/버전/자원 검토와 별도 승인 필요. 다른 기존 도구 경로도 공개 계약/패키징 변경 여부를 따져야 한다. 이번에는 어떤 resize 방식도 구현하지 않는다.

## 6. raw probe 셀과 반복 — 사용자 승인 제안

- RGB pattern 두 개를 각 치수에 적용한다. alpha가 없는 RGB 의미를 jpeg-js 입력 RGBA로 확장할 때 alpha는 항상255이며 이 준비 할당은 encoder 측정 시작 전에 끝낸다.
- pattern G: R=(17x+3y) mod256, G=(5x+11y) mod256, B=(13x+7y) mod256. pattern C: R=((floor((x+3)/8)+floor((y+5)/8)) mod2)×255, G=255−R, B=(x+y) mod256. lossless source 식이며 문서/차트 대표성을 주장하지 않는다.
- 치수 12개: 1×1, 7×7, 8×8, 9×9, 15×17, 17×15, 1024×769, 1536×1025, 2048×1536, 1536×2048, 2528×2528, 2528×17. MCU 경계/비정방/회전/상한을 포함하며 corpus 선택이 아니다.
- 사용자 결정(m-3): q50은 12치수 모두, q75는 긴 변 1536 이하인 앞 8치수에만 적용한다. **(12+8)치수·quality 조합×2pattern =40 cells**. 셀당 **3 fresh encoder processes × 동일 buffer 3회 encode** =9관측, 총 **120 encoder processes/360 encodes**. 직렬 실행하며 세 호출을 cold/후속1/후속2로 구분하고 JIT/GC 영향을 합치지 않는다.
- 2048×1536, 1536×2048, 2528×2528, 2528×17은 q50만 유지한다(JPEG-only 준비 관련 치수). 해당 q75 8셀은 실행 대상에서 제외하며 결과에서 실패나 누락으로 세지 않는다. 모든 치수는 probe-only이며 X10 corpus/family 배정이 아니다.
- 한 encoder process에서는 매 호출 뒤 output SHA/byteLength를 기록하고 현재 output 외 이전 buffer 참조는 해제한다. 강제 GC는 쓰지 않는다. process의 peak에는 잔존/GC 영향을 포함한다고 표시한다.
- 동 process 3회와 fresh process 3개 간 SHA256을 별도로 비교한다. 차이가 나면 동일성 실패를 보고하고 quality간 hash 차이를 결정성 검사로 오용하지 않는다.
- SHA가 같은 고유 출력은 한 파일로 deduplicate 가능하되 run별 관측은 보존한다. 서로 다른 출력은 모두 별도로 validator/redecode한다. 반복별 byteLength와 SHA 불일치를 숨기지 않는다.
- RGB/RGBA 입력은 식으로 재생성하고 저장하지 않는다. 이 probe는 합성 raw→q50 또는 raw→q75만 검사하며 q50 JPEG→decode→q75 연쇄와 다른 Node/V8 버전 간 결정성은 NOT PROBED로 명시한다. 추가 셀을 자동 실행하지 않는다.

## 7. 적합성·재디코드·자원 측정

- raw bytes를 수정 없이 `validateJpeg`에 전달한다. JFIF APP0, baseline SOF0, precision8, components3/YCbCr, sampling1×1, 금지 metadata 없음, DQT/DHT/SOS/EOI/entropy/치수/accounting 제한을 기존 validator 결과와 marker 관측으로 보고한다.
- 입력 RGB 의미를 RGBA 4-byte stride(alpha255)로 전달하고 comments/exif 옵션은 아예 넘기지 않는다. 부모의 task22 설치본 source 열람은 encoder L424 APP0, L468 sampling, L641–643 APP0/optional metadata, L665 stride 근거다. 실행 대상은 승인 후 현재 worktree에 lockfile대로 설치된 버전이며 source만으로 raw 적합성을 주장하지 않는다.
- `validateJpeg` PASS는 전체 ingest PASS가 아니다. encoded byteLength와 10 MiB 이하 여부는 별도 diagnostic으로 보고하며 validator 자체가 그 encoded 한도를 검사한다고 쓰지 않는다. input RGB/RGBA hash도 각 run에서 비교한다.
- reject 시 error code/단계/marker 관측과 원래 SHA를 보존한다. 예상 APP0 차이가 있어도 normalization은 문서상의 후속 대안뿐이다. raw-pass와 normalized-pass를 혼합하지 않는다.
- 출력별 DQT는 원래 JPEG에서 읽은 각 테이블의 ID, precision, 64개 값(파일의 zigzag 순서), payload SHA-256을 JSON에 기록한다. hash 대상은 해당 테이블의 precision/ID 바이트와 값 바이트이며 segment 재배치와 구별한다. 읽기 실패도 상태·이유로 남긴다. 이는 raw 관측이며 quality 변환식의 추정이나 sharp와의 비교 결과가 아니다.
- validator 반환 width/height는 원래 buffer 치수와 같아야 한다. 별도 jpeg-js strict decode 결과의 dimensions/RGB length를 확인하고 각 RGB 채널 MAE/max absolute error를 참고값으로 기록한다. pixel hash는 decoded 표현을 명시하며 입력과 같아야 한다고 검사하지 않는다.
- validator가 내부 jpeg-js decoder를 쓰므로 encoder+validator+재디코드 모두 공유 codec이다. 독립 codec 검증이나 JPEG 전체 표준 적합성 증명이 아니다. **sharp 비교는 Claude 담당(`research/`), 이 Task 범위 밖**이며 Codex 실행 상태는 NOT RUN이다.
- worker mode는 encode / validate / redecode로 분리한다. encoder worker는 고정 버전의 `jpeg-js/lib/encoder.js`만 불러온다(패키지 root는 decoder도 로드하므로 피한다). validation은 compiled 기존 validator를 import하며 src를 수정하지 않는다. build 산출물이 없으면 사전 npm build로 만든 뒤 실행한다. 재디코드는 validator와 같은 strict 옵션(`tolerantDecoding:false`, `useTArray:true`, `formatAsRGBA:false`, 메모리128MiB/해상도16.777216MP)을 사용한다.
- encode timing은 buffer 생성·파일 저장·hash·validator를 제외하고 encode 호출 직전/직후 monotonic clock으로 잰다. 출력 길이/hash/serialization은 timing 후다. validation/redecode timing도 별도다.
- 메모리는 Node worker의 process.resourceUsage().maxRSS(KiB)와 phase 전후 process.memoryUsage().rss(bytes)를 기록한다. maxRSS는 process lifetime high-water이며 startup/import/input/output/GC를 포함한다. 두 peak의 차이를 encoder-only 할당으로 해석하지 않는다. 사용 불가/0은 NOT_MEASURED+이유이고 자원 측정 완료로 주장하지 않는다. PowerShell 측정 파일/계층은 계획에서 제거한다. 미래 fallback 계측은 별도 사용자 승인 사항이다.
- 2048 및2528 셀의 개별시간·최소/중앙/최대·process peak를 원자료와 함께 보고한다. validator의 PASS/jpeg_resource_limit 상태, encoded bytes, host maxRSS을 서로 다른 필드/단위로 둔다. 성능 PASS 임계값은 만들지 않는다.
- host 보호를 위한 process watchdog은 120초/worker 제안이다. timeout은 측정 실패/불완전 결과이며 성능 승인 기준이 아니다. OOM/비정상 종료는 exit/status와 완료된 관측만 남긴다. timeout 후 재시도는 자동 반복하지 않고 원인을 보고한다.
- 부모 Node가 worker 하나를 hidden child로 직접 시작하고 IPC로 `ready → start → result → ack → exit`를 교환한다. 120초는 시작·준비·측정·ack 대기를 모두 포함한다. timeout이면 자신이 시작한 worker만 종료하고 종료 확인 전 다음 worker를 시작하지 않는다. worker는 추가 자식을 만들지 않는다. 중간 완료 run은 즉시 부모에 전달해 비정상 종료 때도 보존한다.
- 상태는 encode `ENCODED/ENCODE_ERROR/TIMEOUT/CRASH/NOT_RUN`, validate `PASS/REJECT/ERROR/TIMEOUT/NOT_RUN`, redecode `PASS/DECODE_ERROR/DIMENSION_MISMATCH/ERROR/TIMEOUT/NOT_RUN`, memory `MEASURED/NOT_MEASURED`와 reason/code로 나눈다. 각 셀의 계획 9회와 실제 완료·통과 수를 별도 표시하고 미실행도 누락하지 않는다.
- 고유 output SHA마다 fresh validate 1개와 redecode 1개를 실행한다. 모든 셀에서 bytes가 결정적이고 셀 간 중복이 없으면 각40개이며 실제 수는 고유 SHA 수로 보고한다. encoder 360회와 이 분모를 혼합하지 않는다. private accounting 식을 재구현하지 않고 validator 상태와 고정 한도만 기록한다.

## 8. RED/GREEN와 실행 절차 (승인 후)

- [x] 신규 메모 matrix/미정 선택과 probe CLI 계약을 먼저 고정한다. JSON schemaVersion/runId, environment(Node/OS/arch/package versions/sourcehash/lockfile integrity/git HEAD/dirty 상태/validator build hash), patterns(식·좌표 원점0·행우선 RGB/RGBA·alpha255), cells(dimensions/pattern/quality), runs(process/repeat/input/outputSHA/bytes/time/memory/status), outputs(SHA/DQT/validator/redecode), limits 필드를 정의한다. 이는 Claude가 같은 입력을 재현하는 계약이다. 기존 결과 JSON은 덮어쓰지 않고 다른 run 경로를 요구한다.
- [x] 승인 후 필요하면 worktree에서 `npm.cmd ci`로 lockfile 그대로 설치한다. package/lock 변경 없이 실제 버전을 확인한다. 계획 단계에는 설치하지 않는다.
- [x] RED 전에 기존 `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build` baseline을 기록한다. 현재 worktree dependency 부재는 승인 후 npm ci로 해결하며 baseline 실패는 새 probe 실패와 구분한다. 부모가 관측한 현재 Node는 v24.18.0이고 probe는 실제 실행 버전을 기록한다. 과거 Node22 측정 때문에 Node22를 강제하거나 runtime을 다운로드하지 않는다.
- [x] targeted test RED: 미구현 harness에서 실패함을 확인한다. 테스트는 작은 1×1/9×9 fixture, injected divergent SHA, worker error/timeout/null memory, validator rejection 보존, 원본 raw SHA 보존, dimension mismatch 탐지를 검사한다. 상한 encode는 일반 test suite에서 실행하지 않는다.
- [x] TS 테스트는 MJS를 정적 import하지 않고 자식 Node의 ESM import/JSON I/O로 실제 harness를 검사한다. 중복 테스트 구현이나 새 선언/config 파일을 추가하지 않는다. DQT 추출·hash 범위와 40셀/360run 분모도 검사한다. 기본 suite는 실제 결과 JSON 존재를 요구하지 않고 schema용 작은 입력으로 검사한다.
- [x] GREEN: 최소 harness 작성 후 targeted test를 통과한다. validator rejection은 probe 관측이지 항상 test failure가 아니며 실패를 숨기거나 rawbytes를 고친 경우 test가 실패한다.
- [x] 새 MJS 정적 검사: `node node_modules/typescript/bin/tsc --allowJs --checkJs --target ES2022 --module NodeNext --moduleResolution NodeNext --noEmit --skipLibCheck --types node scripts/probe-jpeg-encoder.mjs scripts/probe-jpeg-worker.mjs`.
- [x] `npm.cmd run typecheck`, `npm.cmd test -- tests/jpeg-encoder-probe.test.ts`, `npm.cmd run build` 후 probe 실행 준비를 확인한다. npm gate는 Task32 waiver를 승계하지 않는다.
- [x] `node scripts/probe-jpeg-encoder.mjs --output docs/research/evidence/task-33/jpeg-encoder-results.json`을 승인된 행렬로 실행한다. CLI는 다른 dimensions/qualities를 임의로 추가하지 않는다.
- [x] 결과 JSON completeness와 계산 집계를 같은 CLI의 --validate-evidence 모드로 검증한다. 결과가 없거나 일부 실패면 그대로 기록하며 실패 셀을 분모에서 지우지 않는다.
- [x] 메모에 관측/도출/권고/미정 선택을 분리해 작성한다. JPEG encode→resize→crop 후보 순서 비교는 관측이 지지하는 범위까지만 쓰고 결정 칸은 사용자 대기로 남긴다.
- [x] 전체 `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `git diff --check`, 링크/UTF8/보호hash/scope 검사. 동일 gate 반복은 새 수정/실패 또는 Draft 이후 최종검증 때만 한다.
- [ ] Tier C의 초기 계획 리뷰는 사용자 제공 Claude 리뷰로 충족한다. 구현 후 마일스톤은 사용자 제공 Claude 리뷰로 받는다. 추가 하네스 호출은 하지 않으며 최종 Astra 검토는 보류 상태다. 리뷰는 제공자·단계·판정·건수 한 줄로 기록하고 토큰·비용은 적지 않는다. 이번 계획 재개에서 Astra는 앞선 사용량 제한으로 보류하며 다른 모델 검토를 Astra로 대체하지 않는다.
- [x] 승인 범위 commit/push/Draft PR 후 최종 gate와 HEAD/upstream/PR 일치를 확인했다(Task 33 / PR #34). Ready/merge 및 다음 Task는 새 사용자 지시 전 수행하지 않는다.

## 9. 수용 기준과 계획 정지점

- AC1: 새 메모의 조건4×arm경로6 matrix가 decode/crop/1024/1536/q50/q75/PNG를 빠짐없이 구별한다. 커버리지와 청구 토큰·정확도 영향을 함께 비교하고 파일럿 관찰·회계 예측·미측정을 구분한다. RGB PNG crop은 조건부 후보이고 첫 연산 결정 칸은 사용자 대기다. D의 Task 34 개정 예정은 주석으로만 남긴다.
- AC2: raw q50/q75의 SHA/marker/validator 결과와 reject 이유가 수정 없는 원bytes에 연결된다. 적합성 결과가 실패여도 사실대로 보고한다.
- AC3: 40 cells의 3fresh×3same 반복(120 encoder processes, 360 encodes)이 완료/실패 상태를 포함해 설명되며 process 안/밖 결정성을 구별한다. 긴 변1536 초과 q75는 제외하고 q50은 유지한다.
- AC4: resource/timing은 phase와 입력할당 경계, Windows lifetime peak 한계를 명시한다. portable bound/안전성/효과/품질 우월성을 주장하지 않는다.
- AC5: dimensions/redecode/pixel error와 출력별 DQT를 기록하고 공유 codec 및 quality의 encoder 의존(X9) 한계를 적는다. sharp decode/DQT 비교는 Claude 담당(`research/`)으로 범위 밖이며 같은 입력 재현에 필요한 pattern 식·JSON 형식을 제공한다.
- AC6: RED/GREEN 및 typecheck/test/build가 실제 증거와 함께 기록되고 보호 파일/공개 API/dependency 불변이다.
- probe 통과 후에도 Task29 writer/provenance/resource budget 및 X4/X8/X9의 남은 설계가 자동 해소되지는 않는다. 새 제품 연산 구현은 별도 사용자 판단이다.
- 사용자 제공 계획 리뷰의 M-1/m-1/m-2/n-1/n-2 및 확정 선택 m-3/s-1을 반영했다. 전체 구현 계획은 2026-10-14 사용자 승인되었다. 남은 사용자 결정은 첫 연산 순서, X4, X8 및 resize 구현 방식이며 값을 고르지 않는다. 승인된 구현·probe·npm ci·npm gate·commit/push/Draft PR까지 실행하며 Ready·merge는 하지 않는다. Task 34는 Task 33 완료·승인 뒤 별도 지시에 따라 진행한다.
