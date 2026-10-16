# Task 33 JPEG encoder probe 증거

이 디렉터리는 제품 기능이나 평가 dataset이 아닌 raw encoder probe의 증거다. 실제 결과는 [jpeg-encoder-results.json](jpeg-encoder-results.json)이며 성공·거부·실패·미측정을 구분한다.

## 재현 입력

좌표 원점은 (0,0), x가 가로, y가 세로이며 행 우선 RGB다. jpeg-js에는 RGBA 4-byte stride로 확장해 전달하고 alpha는 항상 255다.

| pattern | R | G | B |
| --- | --- | --- | --- |
| G | (17x + 3y) mod 256 | (5x + 11y) mod 256 | (13x + 7y) mod 256 |
| C | ((floor((x+3)/8) + floor((y+5)/8)) mod 2) × 255 | 255 − R | (x+y) mod 256 |

치수는 1×1, 7×7, 8×8, 9×9, 15×17, 17×15, 1024×769, 1536×1025, 2048×1536, 1536×2048, 2528×2528, 2528×17이다. q50은 12개 모두, q75는 긴 변 1536 이하인 앞 8개에 적용한다. 두 pattern으로 40셀, 셀당 3 fresh process × 같은 입력 3회로 120 encoder processes/360 encodes다. MCU 경계·회전·비정방·상한 관측용이며 clean corpus의 정확 치수를 선택한 것이 아니다.

RAW 입력은 저장하지 않고 위 식과 RGB/RGBA SHA-256으로 재생성한다. encoder에 comments/exif를 넘기지 않는다. JPEG 출력은 APP0 삽입이나 metadata 제거 없이 보존하고 ignored `.artifacts/task-33-probe/` 아래에 저장한다. 기존 결과 파일과 run 디렉터리를 덮어쓰지 않는다.

## 실행과 검증

저장소 루트에서 잠금 의존성을 설치하고 기존 validator를 먼저 빌드한다. 현재 검증 runtime은 결과 JSON에 기록한다. 새로운 Node 버전이나 sharp는 설치하지 않는다.

```text
npm.cmd ci
npm.cmd run build
npm.cmd run typecheck
npm.cmd test -- tests/jpeg-encoder-probe.test.ts
node node_modules/typescript/bin/tsc --allowJs --checkJs --target ES2022 --module NodeNext --moduleResolution NodeNext --noEmit --skipLibCheck --types node scripts/probe-jpeg-encoder.mjs scripts/probe-jpeg-worker.mjs
node scripts/probe-jpeg-encoder.mjs --output docs/research/evidence/task-33/jpeg-encoder-results.json
node scripts/probe-jpeg-encoder.mjs --validate-evidence docs/research/evidence/task-33/jpeg-encoder-results.json
```

재현 시 이미 존재하는 checked-in 결과를 덮어쓰지 말고 `--output .artifacts/task-33-probe-repeat.json`처럼 새 경로를 지정한다. 각 worker는 직렬 실행되며 120초 watchdog을 둔다. 이 제한은 host 보호용이지 성능 합격선이 아니다. 고유 output SHA마다 별도 validate/redecode process를 사용하므로 360회 encode 분모와 섞지 않는다.

## 관측의 의미

- 적합성: raw bytes를 기존 `validateJpeg`에 그대로 전달한다. `PASS`는 제한 JPEG validator의 수락이며 전체 ingest 수락이 아니다. encoded 10 MiB 이하는 별도 diagnostic이다.
- 결정성: 같은 process의 세 번과 fresh process 사이의 SHA를 구분한다. 입력 RGB/RGBA hash와 출력 길이도 비교한다. 서로 다른 quality의 hash 차이는 결정성 실패가 아니다.
- 시간: encode 호출만 monotonic clock으로 측정한다. 입력 생성·hash·저장·validator는 제외한다. cold/후속1/후속2를 별도 보존하고 강제 GC는 쓰지 않는다.
- 메모리: `resourceUsage().maxRSS`는 KiB 단위 process lifetime peak다. runtime/import/입력/출력/GC를 포함하며 encoder 전용 할당이나 decoder accounting 한도가 아니다. 전후 RSS는 bytes다. 측정 불가/0은 null 및 NOT_MEASURED 사유로 기록한다.
- 재decode: validator 반환 치수와 입력 치수를 비교하고 별도 strict jpeg-js decode의 RGB 치수/길이와 채널별 MAE/max absolute error를 기록한다. pixel 오차는 참고값이며 quality 효과·우월성을 주장하지 않는다.
- DQT: 출력마다 table ID, precision, 파일의 zigzag 순서 64개 값, precision/ID byte와 value bytes를 묶은 payload SHA-256을 기록한다. 다른 encoder와 quality 대응식을 추정하지 않는다.

## 한계

encoder와 validator 내부 decoder 및 별도 재decode가 모두 jpeg-js다. 독립 codec 또는 JPEG 표준 전체 검증이 아니다. quality 값은 encoder 의존(X9)이다. sharp 독립 decode/DQT 비교는 Claude의 research 작업이며 여기서는 설치·실행하지 않았다.

q50 JPEG→decode→q75 연쇄, 다른 Node/V8의 결정성, 실제 문서/차트 대표성, calibration/held-out, 토큰·정확도·비용 효과는 NOT PROBED다. RAW pattern 식과 결과 JSON은 독립 작업자가 같은 입력을 재현할 수 있게 제공한다. 이 결과가 제품 writer/provenance/resource 정책이나 encoder 선택을 승인하지 않는다.

## 실제 결과

Run ID: `2026-10-14T14-53-45-225Z-eb741875`. Node v24.18.0, V8 13.6.233.17-node.50, Windows 10.0.26200 x64, 12th Gen Intel(R) Core(TM) i9-12900F. jpeg-js 0.4.4, encoder source SHA-256 `00bde8df2517eca556669ab6fc27b414e9ba3fc52a0a71e1e37ec7c5f19c3d34`. 측정 당시 HEAD는 base b83c91d이고 구현 파일이 미커밋인 dirty worktree였다. 구현과 함께 이 원자료를 커밋하며 원래 환경 기록을 사후 SHA로 바꾸지 않는다.

| 항목 | 실제 관측 | 상태 |
| --- | --- | --- |
| a. raw 적합성 | encode 360/360 완료, 고유 출력 40/40 validator 수락. JFIF APP0, baseline SOF0, 8-bit YCbCr 3성분 1×1 sampling은 기존 validator 검사 통과. APP1–15/COM 0개. normalization 없음 | PASS(제한 프로필) |
| b. 결정성 | process 안 120/120 묶음, fresh process 사이 40/40 셀, 셀당 전체9회 40/40 bytes 동일. 입력 hash 불일치0 | PASS(이번 runtime) |
| c. 자원 | 360/360 encode 시간·maxRSS 관측. timeout/crash0. 아래 표는 encoder worker lifetime peak이며 encoder 전용 메모리 아님 | MEASURED, 성능 합격선 없음 |
| d. 재decode | validator 반환 치수40/40 일치, 별도 strict decode40/40 치수/RGB길이 일치 | PASS(공유 codec) |
| DQT·encoded 크기 | 40/40 출력에서 DQT 두 테이블(ID0/1, precision0=8-bit) 관측. 출력613–4,161,162 bytes, 모두10MiB 이하 | PARSED / diagnostic 충족 |

40개의 validate worker와 40개의 redecode worker는 120개의 encoder worker와 별도다. JSON의 `summary.overall=ALL_PASS`는 정의한 관측 검사에 한정되며 제품 안전성·효과·자원 예산 승인이 아니다. 재decode 채널별 MAE의 셀 범위는 R 0–16.489796, G 0–14.857143, B 0–18.818461이며 max absolute error는 각각160/108/187이다. 서로 다른 치수·pattern·quality를 묶은 참고 범위이며 quality 비교나 시각적 품질 판정에 사용하지 않는다.

### 2048 및2528 셀 자원 관측

시간 단위 ms, 각 시간 칸은 **최소 / 중앙 / 최대**이며 각3개의 fresh process에서 같은 repeat 위치만 모았다. cold=repeatIndex0, 후속1=1, 후속2=2다. peak는 해당 셀9회 기록의 최대 maxRSS(KiB)다. 개별 시간과 process별 peak, 전후 RSS(bytes)는 JSON `runs`에 모두 보존했다.

| 셀(q50) | cold ms | 후속1 ms | 후속2 ms | 최대 maxRSS KiB | JPEG bytes |
| --- | --- | --- | --- | --- | --- |
| q50-G-2048x1536 | 194.351 / 195.055 / 196.865 | 195.727 / 198.177 / 199.074 | 185.788 / 187.749 / 189.589 | 187968 | 1503906 |
| q50-C-2048x1536 | 144.836 / 146.009 / 146.948 | 138.883 / 140.547 / 141.030 | 135.303 / 135.624 / 137.581 | 189576 | 2048438 |
| q50-G-1536x2048 | 193.718 / 198.033 / 200.074 | 196.005 / 201.890 / 210.381 | 187.150 / 187.181 / 189.850 | 188756 | 1504045 |
| q50-C-1536x2048 | 146.193 / 146.402 / 146.550 | 139.420 / 139.609 / 143.457 | 136.382 / 138.211 / 140.545 | 191544 | 2048421 |
| q50-G-2528x2528 | 369.351 / 372.821 / 374.744 | 366.726 / 379.333 / 379.481 | 367.466 / 368.450 / 379.678 | 305736 | 3054766 |
| q50-C-2528x2528 | 286.632 / 286.786 / 287.294 | 262.381 / 264.946 / 271.014 | 254.884 / 257.801 / 258.971 | 424204 | 4161162 |
| q50-G-2528x17 | 20.678 / 20.814 / 21.622 | 14.929 / 15.410 / 19.145 | 5.696 / 6.067 / 6.723 | 128752 | 25471 |
| q50-C-2528x17 | 21.014 / 21.171 / 22.627 | 13.261 / 15.896 / 17.641 | 4.516 / 5.676 / 5.887 | 129440 | 34270 |

2528×2528의 최대424,204KiB는 runtime·RGB/RGBA 입력 준비·encoder 출력·GC를 포함한 host process peak다. 기존 validator의128MiB decoder accounting과 비교해 초과/수락을 판정하지 않는다. 같은 셀의 validator는 두 pattern 모두 PASS였다.

### 결과 JSON 읽기 계약

- `schemaVersion/runId/createdAt/environment`: runtime, encoder 버전/source hash/lock integrity, base HEAD/dirty, validator build hash.
- `patterns/limits/notProbed`: 좌표·색상 식, 40셀·120process·360encode 계약, watchdog/diagnostic, 미실행 경계.
- `cells`: cellId, width/height, quality, pattern, plannedRuns9, inputSha256(RGBA), inputRgbSha256(RGB), inputBytes(RGBA).
- `processes`: processIndex0–2, 종료 상태/코드/시간. `runs`: repeatIndex0–2, 입력 hash, 원본 출력 SHA/길이, encodeMs, RSS, 상태/사유. RGB hash는 고정 원천의 hash이고 매 호출 전 RGBA hash로 실제 encoder 입력도 비교한다.
- `outputs`: SHA로 deduplicate한 원본 JPEG, 해당 cellIds/runIndices, marker와 DQT, validator code·치수, redecode 치수/참고 오차. DQT precision은 JPEG wire 값0(8bit)/1(16bit)이며 values는 zigzag 순서다.
- `summary`: 원자료에서 다시 계산하는 분모·상태·결정성 집계. encoded360과 unique output40을 혼합하지 않는다.

`--validate-evidence`는 존재하는 로컬 artifact의 원본 SHA도 확인했다(artifactsChecked:true). 다른 checkout에 binary가 없으면 JSON 구조·입력 재생성·집계 검증만 하고 artifactsChecked:false를 출력한다. 바이너리 부재를 실제 재encode 검증으로 부르지 않는다.
