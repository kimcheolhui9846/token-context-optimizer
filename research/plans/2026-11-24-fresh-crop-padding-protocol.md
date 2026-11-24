# 새 합성 문서에서 자르기 여백 0 대 4 원본 픽셀: 사전등록 프로토콜

- 작성 2026-11-24. Tier E. Orca Task `task_38ea388f9a97`. 연구 담당 Claude Code(Opus 5.5), PM Codex(Astra)
- 기준: `origin/main` `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. 제품 번들 `bin/token-context-optimizer.mjs` blob `85b804990bc192d32d75560df0567bdf5a876d0b`. 연구 선택기 `research/src/selector.mjs` blob `b3b4965b2d330907c0143fe178013aace1be8372`
- 범위: 별도 브랜치 `claude/fresh-crop-padding`와 Draft PR까지. 로컬 실행, 실험 API 비용 0원
  - 범위 밖: 외부 OCR·모델, 신규 의존성, 호스팅 호출, 연구 외부 송신, 제품·원고·WBS·기존 연구 파일 변경, 제품 기본값 결정, Ready, merge
- #144(`kimcheolhui9846/crop-padding-replay`)는 비교 방법을 확인한 읽기 전용 참고 자료다. 병합하거나 그 위에 쌓지 않는다. 필요한 코드는 새 파일로 옮겨 적고 출처를 표시한다
- 이 문서는 **렌더·OCR·측정 전에** 커밋한다. 측정 전 변경은 §13에 사유와 함께 적는다. 측정 뒤 변경과 재실행은 사후로 따로 표시한다

## 1. 성격과 질문

같은 이미지·같은 호출자 좌표에 대칭 여백 p ∈ {0, 4} 원본 픽셀을 주고 현재 제품 번들로 자를 때,

1. 원래 매치한 문서 중 실제 전달 영역이 페이지보다 엄격히 작으면서 필요한 두 근거(질문 앵커, 답 값의 잉크 상자)를 모두 담는 수가 얼마인가
2. 그 대가로 페이지 면적을 얼마나 더 전달하는가

- 유일한 주 비교는 p = 0 대 p = 4다. 다른 여백은 시험하지 않는다
- 4px는 #141/#144 기존 문서에서 관측한 2px 값 상자 누락 한 건에서 골랐다. 이 설계는 그 관측을 알고 만들었다. 새 문서의 레이아웃·표·카드 좌표·대상 위치·여백 분포는 그 누락 좌표에 맞춰 고르지 않았다. 새 좌표는 §3.3의 고정 수치, 대상 위치는 §3.4의 시드 규칙에서 나온다
- 같은 글꼴·렌더러·문서 계열의 **새 합성 사례**다. 외부 문서로 일반화하지 않는다. 기하적 포함과 전달 면적만 잰다. 정확도·토큰·비용 개선이나 제품 기본값 채택을 결론으로 쓰지 않는다
- 효과 없음, 반대 결과, 전혀 복구되지 않음도 그대로 보고한다. 결과에 따라 설계·48장을 바꾸지 않는다

## 2. 고정 자산

| 대상 | 값 |
|---|---|
| 글꼴 | `NotoSansKR-VF.ttf`(설치된 시스템 글꼴, 저장소에 넣지 않음) SHA-256 `018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0`, 굵기 400, 본문 24px, 제목 32px |
| 영어 OCR | `eng.traineddata` SHA-256 `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`. 로컬 R09 작업 트리의 연구 캐시에서 해시 확인 뒤 `research/.cache/`로 복사 |
| 연구 의존성 | `research/package-lock.json` 그대로(`sharp` 0.35.4, `tesseract.js` 5.1.1). 렌더러 Pillow 12.3.0, fontTools 4.63.0(R09와 같음) |
| 렌더러 | `research/tools/r09/render.py`(수정 없이 사용) |
| 선택기 | `research/src/selector.mjs`의 `createOcr`, `selectWindow`(blob `b3b4965…`) |
| 가드 | `research/tools/d03/guard/node-netguard.cjs`(`NODE_OPTIONS=--require=…`) |

## 3. 새 자료: 24쌍·48장

### 3.1 셀과 ID

- 문서형 3(`schedule` 일정표, `invoice` 거래명세서, `status` 상태표) × 레이아웃 2(`table`, `cards`) × 앵커 2(`code` 공유 업무코드, `nl` 현지어 표지) × 변형 2(`v1`, `v2`) = 24쌍
- 한 쌍은 EN/KO 두 장이다. 의미, 숫자 값, 코드, 대상 위치, 칸 좌표가 같고 표지·제목·열 이름·질문 언어만 다르다
- 쌍 ID `<doc>-<layout>-<anchor>-v<n>`, 이미지 ID `<쌍 ID>-<en|ko>`. 셀별 사전등록 ID는 아래 24쌍이다(이미지 48장 = 각 쌍의 `-en`, `-ko`)

```text
schedule-table-code-v1  schedule-table-code-v2  schedule-table-nl-v1  schedule-table-nl-v2
schedule-cards-code-v1  schedule-cards-code-v2  schedule-cards-nl-v1  schedule-cards-nl-v2
invoice-table-code-v1   invoice-table-code-v2   invoice-table-nl-v1   invoice-table-nl-v2
invoice-cards-code-v1   invoice-cards-code-v2   invoice-cards-nl-v1   invoice-cards-nl-v2
status-table-code-v1    status-table-code-v2    status-table-nl-v1    status-table-nl-v2
status-cards-code-v1    status-cards-code-v2    status-cards-nl-v1    status-cards-nl-v2
```

- 언어 × 앵커 층은 각 12장, 문서형은 각 16장, 레이아웃은 각 24장이다
- 개발용 합성 자료는 만들지 않는다. 입력 품질 검사는 본 자료의 렌더 검사(§5)로만 한다

### 3.2 공유하는 것과 새로 정한 것

| 항목 | R09와 같음(문서형 정체성) | 새로 정함 |
|---|---|---|
| 페이지 | 1280×960, 흰 바탕 8비트 회색조 PNG | |
| 글꼴·크기·렌더러 | 위 §2 | |
| 제목·열 이름 | 일정표 `Weekly Program Schedule`/`주간 프로그램 일정표`, 거래명세서 `Transaction Statement`/`거래명세서`, 상태표 `System Status Board`/`시스템 상태표`와 각 4열 이름 | |
| 값 생성기 | 일정 `HH:MM`(08:00–17:20, 10분 단위), 금액 `<10–899>,<000–900, 100단위>`, 상태 2–98 정수 | |
| 질문 문형 | R09 `DOCTYPES.*.question` 그대로 | |
| 코드 접두사 | | 일정 `SV`, 거래 `TQ`, 상태 `MR`(R09는 `SX`, `KT`, `PX`, 개발 `LN`). 형식 `<접두사>-<1000–9999>` |
| 표지 어휘(문서형마다 12쌍) | | 아래 §3.5 |
| 기타 칸 어휘 | | 아래 §3.5 |
| 표·카드 좌표, 대상 위치 | | §3.3, §3.4 |
| 시드 | | `fcp-design-1|main|<doc>|<layout>|<anchor>|v<n>` |

### 3.3 레이아웃 수치(반개방 원본 픽셀)와 R09 대비 변경

| 표 | 값 | R09 | 변경 |
|---|---|---|---|
| 열 경계 x | 90, 270, 660, 960, 1190 | 70, 250, 650, 950, 1210 | +20, +20, +10, +10, −20 |
| 머리행 y | 190 | 170 | +20 |
| 행 높이 | 66 | 72 | −6 |
| 제목 칸 | [90, 60, 1190, 130] | [70, 40, 1210, 110] | |

- 머리행 1개 + 데이터 8행. 행 i(0–7)의 칸 y는 `190 + 66(i+1)`부터 66px. 행 사이 가로줄 1px(회색 190)는 R09와 같은 규칙

| 카드 | 값 | R09 | 변경 |
|---|---|---|---|
| 열 x0 | 60, 680 | 40, 660 | +20 |
| 폭 | 540 | 580 | −40 |
| 첫 y0 | 165 | 150 | +15 |
| 높이 | 160 | 170 | −10 |
| 간격 | 30 | 24 | +6 |
| 필드 이름 폭 | 160 | 150 | +10 |
| 줄 중심(카드 위에서) | 30, 80, 130 | 35, 85, 135 | −5 |
| 줄 칸 높이 | 중심 ±24 | ±25 | −1 |
| 제목 칸 | [60, 50, 1220, 120] | [40, 40, 1240, 110] | |

- 카드 i(0–7)는 2열 4행: `x = x0[i mod 2]`, `y = 165 + floor(i/2)·190`. 줄 0: 코드 | 표지, 줄 1: 값 필드 이름 | 값, 줄 2: 기타 필드 이름 | 기타. 왼쪽 칸 `[x+20, x+180)`, 오른쪽 칸 `[x+180, x+520)`. 카드 위·아래 1px 줄
- 글자는 칸 왼쪽 + 12px, 세로 가운데(R09 렌더러 규칙)

### 3.4 대상 위치와 변형

- 대상 위치(행 또는 카드 번호 0–7)는 레이아웃 × 앵커 × 변형마다 `rng("fcp-design-1|target|<layout>|<anchor>|v<n>")`의 첫 값 `floor(r·8)`이다. 문서형 셋에 같은 위치를 쓴다. R09 `rng`(FNV-1a 시드 + mulberry32)를 그대로 쓴다
- 계산값: 표 code v1 → 0, v2 → 0, 표 nl v1 → 4, v2 → 3, 카드 code v1 → 3, v2 → 2, 카드 nl v1 → 5, v2 → 6. 계산값을 손으로 바꾸지 않는다
- 변형 v1·v2는 시드만 다르다. 시드 스트림에서 차례로 표지 8개(어휘 12개 셔플 앞 8개), 코드 8개(중복 없이), 행마다 값과 기타 칸을 뽑는다. 값은 같은 페이지 안에서 중복이 없고, 코드 숫자와 값 숫자가 서로 포함되지 않을 때까지 다시 뽑는다(R09와 같은 규칙)
- 질문: `code` 앵커는 대상 행의 코드, `nl` 앵커는 대상 행의 해당 언어 표지로 R09 문형을 채운다. 정답은 대상 행의 값이다. 근거는 대상 행의 앵커 칸(`code` 또는 `label`)과 값 칸 두 개다

### 3.5 새 어휘

```text
schedule 표지: Fire inspection/화재 점검, Supplier audit/공급사 감사, Intern orientation/인턴 오리엔테이션, Board rehearsal/이사회 리허설,
  Inventory count/재고 실사, Wellness seminar/건강 세미나, Software demo/소프트웨어 시연, Mentor lunch/멘토 오찬,
  Grant workshop/보조금 워크숍, Press briefing/언론 브리핑, Data cleanup/데이터 정리, Volunteer meeting/봉사 모임
schedule 장소: Harbor Hall/하버홀, Lotus Room/로터스룸, Willow Studio/윌로 스튜디오, Summit Lounge/서밋 라운지, Garnet Room/가닛룸, Ivy Hall/아이비홀
invoice 품목: Printer paper/복사 용지, Ladder rack/사다리 거치대, Packing tape/포장 테이프, Floor mat/바닥 매트,
  Coffee beans/커피 원두, Hand soap/물비누, Storage bin/보관함, Wire spool/전선 릴,
  Monitor arm/모니터 암, Trash bags/쓰레기봉투, Battery pack/배터리 팩, Hinge set/경첩 세트
invoice 공급처: Saebyeol Trading/새별상사, Haneul Supply/하늘물산, Busan Parts/부산부품, Jinju Office/진주문구, Sejong Tools/세종공구, Gaon Metal/가온금속
status 구성요소: Order router/주문 라우터, Ticket desk/티켓 데스크, Badge reader/사원증 리더, Photo resizer/사진 변환기,
  Chat relay/채팅 중계, Config store/설정 저장소, Metrics agent/지표 수집기, License server/라이선스 서버,
  Door controller/출입문 제어기, Firewall rules/방화벽 규칙, Payroll engine/급여 엔진, Map renderer/지도 렌더러
status 상태: Stable/안정, Slow/느림, Partial/부분 장애, Offline/오프라인
```

### 3.6 구조적 미매치 사전 명시

- 선택기는 영어 OCR과 ASCII 키만 쓴다. 한국어 `nl` 질문(12장)은 ASCII 키가 없어 구조적으로 미매치될 가능성이 높다. 한국어 `code` 질문은 공유 코드로 매치할 수 있다
- 매치/미매치 수는 관측치다. 36/12로 맞추지 않고, 기술 실패를 다른 사례로 바꾸지 않는다

## 4. 생성과 설계 검사(렌더 전)

- 생성기 `research/src/fcp-design.mjs`, 작성기 `research/src/fcp-build.mjs`. R09 설계 검사 `checkDesign`(쌍 일치, 답 ASCII, 질문의 답 노출 금지, 코드 1회 등장, 키 규칙, 원문 기준 표지 매치가 앵커 항목 하나)을 그대로 적용한다. 하나라도 실패하면 렌더하지 않는다
- 중복 점검(`fcp-build.mjs`, 결과 `dedup-check.json`). 비교 대상은 R09 dev 4장·본시험 48장(기준 커밋 Git blob의 `design.json`, `images/*.png`)과 새 48장 내부다
  1. 페이지 SHA-256: 새 48장끼리, 그리고 R09 52장과 모두 달라야 한다(렌더 뒤 검사)
  2. 코드: 새 코드 192개(24쌍 × 8행) 중 R09 코드와 같은 것 0
  3. 표지·기타 어휘: 새 어휘와 R09 어휘(EN, KO 각각)의 교집합 0
  4. 대상 레코드: 새 대상 (코드, 값), (표지, 값) 조합이 R09의 어느 행과도 같지 않다
  5. 레이아웃: 새 페이지의 칸 좌표 목록이 R09 어느 페이지와도 같지 않다
  6. 내용: 페이지 글자 목록(항목 id·글자)이 새 48장 안에서 모두 다르고 R09와도 다르다
  7. 계획된 공유 구조는 실패가 아니라 따로 표기한다: 쌍 안의 코드·값·칸 좌표, 같은 문서형의 제목·열 이름, 같은 레이아웃의 좌표, 같은 레이아웃·앵커·변형의 대상 위치(문서형 셋 공통)
- 1–6 중 하나라도 어기면 렌더나 동결을 멈추고 사유·변경을 §13에 남긴다

## 5. 렌더, 두 번 생성, 입력 동결

- 렌더: `python tools/r09/render.py --design <design.json> --font <NotoSansKR-VF.ttf> --out <dir>`. 렌더 검사(글리프 누락, 잉크가 칸 밖·페이지 밖, 잉크 겹침, 잉크와 줄 겹침, 칸 겹침)가 실패하면 멈춘다. 렌더 결함은 재현하고 사유·변경을 §13에 적은 뒤 처음부터 다시 생성·동결한다
- 결정적 생성을 **서로 다른 빈 폴더에서 두 번** 한다(작성기 + 렌더). 48개 원본 PNG, `questions.json`, `design.json`, `gold.json`, `render.json`(모든 잉크 상자), `render-check.json`, `token-manifest.json`, `dedup-check.json`의 원바이트 SHA-256이 두 번 모두 같아야 동결한다
- 동결 위치 `research/results/fresh-crop-padding/frozen/`
  - `selector-input/`: `questions.json`(id, file, question), `index.json`(id, file, 쌍·언어·문서형·레이아웃·앵커·변형, 페이지 치수, 원본 SHA), `images/*.png` 48장. 답·코드·칸·잉크 상자가 없다
  - `oracle/`: `design.json`, `gold.json`, `render.json`, `render-check.json`, `token-manifest.json`, `dedup-check.json`. 채점과 검산만 읽는다
  - `freeze-manifest.json`: 위 모든 파일의 원바이트 SHA-256, 생성·측정 코드의 Git blob, 자산 해시, 두 번 생성의 일치 기록
- 동결 커밋 전에 하는 일은 입력 품질 검사(글리프·잉크 겹침·어휘/라벨 중복·쌍 구성·그림 크기)뿐이다. 실제 문서 OCR, 선택기, 크롭, 제품 호출, 여백별 채점은 동결 커밋 뒤에 시작한다
- 하네스 단위 시험은 문서와 무관한 손계산 좌표와 모의 응답만 쓴다

## 6. 측정 실행 A·B

- 실행 A가 사전 지정한 주 결과다. B는 독립 재현이다. 둘 다 동결 커밋의 같은 원본에서, 각자 새 출력 폴더·새 OCR 작업자·새 선택기 실행·새 제품 프로세스로 시작한다
- 측정 전 검사(하나라도 실패하면 시작하지 않는다)
  - 실행 코드 모듈의 HEAD blob = 작업 사본 blob, 상태 깨끗함(#144 PM 수정 규칙)
  - 선택기 blob `b3b4965…`, 번들 blob `85b8049…`(작업 사본과 기준 커밋 경로 둘 다)
  - `freeze-manifest.json` 대조: 선택 입력 50개 파일 해시 일치, 폴더에는 등록된 파일만 있음, 입력 경로에 `gold`·`answer`·`score`·`render`·`design`이 없음
  - PNG IHDR 8비트 회색조(color type 0), 비인터레이스, 1280×960
  - OCR 자료 SHA `5dc5d8d6…`, 오프라인 가드 적재

### 6.1 수집기(호출자 배정)

- `research/src/fcp-collect.mjs`. `selector-input/`의 `questions.json`과 PNG만 읽는다. 정답·oracle·채점 파일을 읽지 않는다
- OCR 작업자 1개, 질문 순서대로 이미지마다 정확히 한 번 `createOcr().lines` → `selectWindow`. 이미지당 제한 180,000ms. 재시도 없음. 예외·시간 초과·잘못된 출력(`band`가 정수·양수·페이지 안이 아님)은 기술 오류로 기록한다
- 결과 `caller.jsonl`(행마다 id, status, error, 치수, keys, matched, score, lineText, confidence, axisRow, band, OCR 줄 전부)과 `caller-meta.json`(시간·환경, 비결정). `caller.jsonl`의 SHA-256을 `caller-evidence.json`에 고정한 뒤에만 제품 실행을 시작한다
- 두 여백 조건은 그 실행의 같은 `caller.jsonl`을 쓴다

### 6.2 여백 규칙

- 매치: `x0 = left, y0 = top, x1 = left + width, y1 = top + height`. `x0' = max(0, x0 − p)`, `y0' = max(0, y0 − p)`, `x1' = min(W, x1 + p)`, `y1' = min(H, y1 + p)`. 요청 `{x: x0', y: y0', width: x1' − x0', height: y1' − y0'}`. 변마다 실제 확장량과 클리핑량(p − 실제 확장량)을 기록한다. p = 0이면 호출자 좌표 그대로다
- 미매치: 전체 원본 `{0, 0, W, H}`
- 선택기 기술 오류: 제품을 부르지 않는다(`failStage = caller`, `failCode = caller_error`)
- 확장 뒤 요청이 전체 페이지면 의도는 `matched`, 요청은 전체(`requestFull = true`)로 기록하고 제품의 원본 참조 응답을 받는다(매치→전체 전환)
- 부분 자르기 변 한도(1536)를 넘어도 줄이지 않는다. 이 페이지는 1280×960이라 발생하지 않을 것으로 예상한다. 발생하면 `limit_exceeded`로 남긴다

### 6.3 제품 호출

- `research/src/fcp-run.mjs`. p마다 빈 임시 허용 루트를 새로 만들고 원본 48장을 복사한 뒤 새 stdio 번들 프로세스를 띄운다. 자식 환경은 최소 환경 변수, `TCO_ALLOWED_ROOTS`, 가드뿐이다. 끝나면 닫고 루트를 지운다
- 순서 `initialize` → `notifications/initialized` → `tools/list` → ID마다 `index_image_artifact({path, profile: "tolerant"})` → `crop_image_artifact({artifactId, region: 요청})`. 실패 뒤 단계는 보내지 않는다. 재시도·대체 없음
- 유효 응답(#144 §7.1과 같다)
  - 색인: `source.sha256` = 원본 SHA, 치수 = 1280×960, `validationProfile = png-gray8-tolerant-v1`. 아니면 실패
  - 전체 요청: `isError = false`, `status = original`, `fullFrame = true`, 이미지 항목 0, `region` = 요청, `source.sha256` 일치, 응답 `source.path`를 허용 루트 안에서 다시 열어 원본 SHA 일치 → `original_verified`
  - 부분 요청: `isError = false`, `status = cropped`, `fullFrame = false`, 이미지 항목 정확히 1, MIME `image/jpeg`, base64 바이트 길이 = `output.byteLength`, 바이트 SHA-256 = `output.sha256`, `sharp` 독립 디코드 치수 = `output` 치수 = 요청 치수, `region` = 요청, `source.sha256` 일치 → `crop_jpeg`
  - 그 밖은 실패. 부분 요청에 원본 응답이 오면 제품 계약 위반이므로 `kind_invalid` 실패로 보존한다(원본 폴백으로 세지 않는다). 한도 오류는 `limit_exceeded`
- 원본 참조 재열기에 실패하면 반환 종류 `none`, 실패 코드는 재열기 코드다(#144와 같음)
- 응답에서 JPEG SHA-256·바이트 수·디코드 치수를 행에 남긴다. 경로·이미지 본문·`artifactId`는 남기지 않는다

### 6.4 결정적 출력과 동결

- 실행 폴더 `research/results/fresh-crop-padding/run-{a,b}/`
  - 결정적: `caller.jsonl`, `raw.jsonl`(키 `p<p>|<id>`, p 오름차순·질문 순서, 96행), `conditions.jsonl`, `input-check.json`, `guard-summary.json`
  - 비결정: `caller-meta.json`, `run-meta.json`(시각·경로 제외 환경·실행 시간), 원 가드 기록은 커밋하지 않고 요약만 둔다
- 실행 뒤 결정적 파일 SHA-256을 `evidence.json`에 고정한다. 채점기는 이 해시와 `freeze-manifest.json`의 oracle 해시가 맞을 때만 정답을 읽는다

### 6.5 가드

- 수집기(OCR 작업자 포함), 실행기, p마다 제품 프로세스에 `node-netguard.cjs`를 적재한다. 가드 적재 이벤트를 단계 표지(`fcp-<run>-collect`, `fcp-<run>-run`, `fcp-<run>-run:p0`, `:p4`)별로 세고, 차단 이벤트 수를 기록한다. 차단이 1건이라도 있거나 어느 단계의 적재가 0이면 그 실행은 계측 결함이다
- 네트워크 차단 시도 여부를 그대로 보고한다. OCR 작업자 스레드에 가드가 적재되는지는 관측값으로 기록한다

## 7. 파일 접근 분리

| 단계 | 파일 | 읽는 것 | 읽지 않는 것 |
|---|---|---|---|
| 생성 | `fcp-design.mjs`, `fcp-build.mjs`, `tools/r09/render.py` | 설계 상수, R09 기준 blob(중복 점검) | 측정 출력 |
| 수집 | `fcp-collect.mjs` | `selector-input/`의 질문·PNG, freeze manifest의 해당 해시 | `oracle/`, 측정 출력 |
| 실행 | `fcp-run.mjs` | `selector-input/`, 같은 실행의 `caller.jsonl`(해시 확인), 번들 | `oracle/` |
| 동결 | `fcp-freeze-run.mjs` | 실행 출력 | `oracle/` |
| 채점 | `fcp-score.mjs` | 해시 확인한 실행 출력, 그다음 `oracle/gold.json`(동결 해시 확인) | 실행 코드 |
| 비교 | `fcp-compare.mjs` | 두 실행의 결정적 출력과 채점 | |
| 독립 검산 | `tools/fcp-recount.py` | 실행 출력, `oracle/gold.json`, `selector-input/index.json`, 채점 출력 | 채점기 코드 |

## 8. 판정

- 근거 상자: `gold.json`의 ID마다 `parts` 두 개(앵커, 값)의 `rect`(반개방 원본 픽셀 잉크 상자). 누락·빈 목록·정수 4개 아님·역전·페이지 밖이면 입력 오류로 채점을 멈춘다
- 반환 영역 `R`(반개방, 클리핑 뒤). 근거 `g`는 `R.x0 ≤ g.x0`, `R.y0 ≤ g.y0`, `R.x1 ≥ g.x1`, `R.y1 ≥ g.y1`이면 포함이다. 경계 일치는 포함, 1px 넘침은 누락이다
- 행 상태
  - `1` 작은 창 완전 포함: 성공 행, 반환 `crop_jpeg`, `R` 면적 < 페이지 면적, 두 근거 모두 포함
  - `0`: 유효 `crop_jpeg`인데 근거 하나 이상 누락, 또는 검증된 전체 반환(`original_verified`: 미매치 원본, 매치→전체 전환)
  - `NE` 평가불가: 선택기 기술 오류, 제품 호출·응답 실패, 원본 참조 검증 실패, 반환 영역 없음
- 별도 지표 "전체 근거 보존": 반환 `crop_jpeg` 또는 `original_verified`이고 두 근거가 모두 포함. 작은 창 성공과 섞지 않는다

## 9. 분모와 집계 (실행마다, p마다)

- 매치 분모 M: 그 실행의 측정 전 단일 배정에서 `status = ok`이고 `matched = true`인 수. p = 0·4가 같은 M을 쓴다. 선택기 기술 오류는 매치 확인 불가라 M에 넣지 않고 전체 분모와 실패 표에 남긴다. 매치 뒤 제품 오류는 M에 남고 그 행은 `NE`다
- 주 지표: p마다 매치 중 상태 1의 수 / M, 그리고 같은 ID의 0→4 변화
  - 개선(0→1), 악화(1→0), 유지 1(1→1), 유지 0(0→0), 한쪽이라도 `NE`(따로)
- 전체 48: 상태 1의 수 / 48(미매치 원본과 기술 오류는 성공 0). 상태별(1/0/NE) 수를 함께 쓴다
- 전체 근거 보존: 전체 48과 매치 M에서 각각 보존 수 / 분모, `NE` 수
- 면적비 = 반환 폭×높이 / 1280×960. 유효 반환(`crop_jpeg`, `original_verified`)만 계산하고 정수 분자·분모를 보존한다. 전체·매치 평균과 유효 수·결측 수. 0→4 변화(%p)는 같은 ID에서 두 조건 모두 유효한 쌍만, 쌍 수·결측 쌍 수와 함께 쓴다. 표시는 비 4자리, %p 2자리
- 반환 종류 수(`crop_jpeg`, `original_verified`, `none`), 매치→전체 전환 수, 미매치 원본 수, 실패 단계·코드별 수, `limit_exceeded` 수
- 층별: 언어 × 앵커(각 12), 문서형(각 16), 레이아웃(각 24)마다 매치 수, 상태 1/0/NE, 전체 근거 보존
- 한영 24쌍: p마다 작은 창 성공 기준 둘 다/EN만/KO만/둘 다 아님, 한쪽이라도 NE인 쌍 수
- 분모가 0이면 건수 0과 "비율 미정(N/A)"으로 쓴다. 분모 크기와 무관하게 기술 통계만 보고한다. 검정·신뢰구간을 쓰지 않는다
- 대응 문서(EN/KO)와 템플릿 반복은 독립 표본이 아니다

## 10. 재현과 비교

- A와 B를 각자 채점한다. 비교 `fcp-compare.mjs` 결과 `comparison.json`
  1. OCR 결정적 필드(줄 글자·신뢰도·상자·단어), 매치 여부, 호출자 좌표
  2. 두 여백의 제품 반환 종류·영역·JPEG SHA-256·바이트 수·디코드 치수, 실패 코드(96개 키)
  3. 행별 채점과 모든 집계
  4. 시각·경로·실행 시간은 비교에서 빼고 따로 기록한다
- 달라지면 A를 B로 바꾸거나 고르지 않는다. 차이, 분모, 독립 재현 실패를 보고하고 성공적 재현을 주장하지 않는다. 계측·자료 무결성 결함이 영향을 준 경우는 판정을 유보하고 진단을 따로 둔다
- Python 독립 검산 `research/tools/fcp-recount.py`: 채점기와 다른 작성 주체가 이 프로토콜만 보고 표준 라이브러리로 쓴다. 입력 인덱스와 호출자 기록에서 요청 좌표를 다시 계산하고, 반환 좌표와 정답에서 포함·상태·면적·변화·분모·층별·쌍 집계를 다시 계산해 채점 출력과 대조한다. 96개 키 모두, 불일치 0이어야 한다
- 실패를 성공으로 처리하거나 계측 실패를 반복 실행으로 가리지 않는다

## 11. 시험

`research/test/fcp.test.mjs`. 하네스 구현 전에 손계산 사례로 RED를 먼저 커밋한다.

- 여백: p = 0 동일성, 네 변 클리핑, 매치→전체 전환, 미매치 전체 요청, 선택기 기술 오류는 제품 미호출
- 판정: 반개방 1px 경계(일치 포함, 1px 넘침 누락), 작은 창 조건(면적 = 페이지면 작은 창 아님)
- 응답 검증: 이미지 항목 2개, MIME·길이·SHA·치수 불일치, 한도 오류, 원본 참조 실패, 부분 요청에 원본 응답
- 집계: 전부 미매치, 전부 기술 오류(매치 분모 0 → N/A), 면적 결측, 한쪽 NE 쌍, 개선·악화·유지 손계산
- 설계: 24쌍·48 ID, 쌍 일치, 대상 위치 계산값, R09 설계 검사 통과, 어휘 교집합 0
- 전체 게이트: CLAUDE.md 검증 명령 7종과 연구 테스트 전체

## 12. 검토와 보고

- 독립 Opus 5.5 마일스톤 검토(`harness-opus-review`, 실모델 기록). 수치·규칙이 바뀌면 다시 받는다
- Argon 발췌: 언어 × 앵커 4층에서 사전등록 ID 사전순 첫 이미지 1개씩, 두 조건(4개 ID·8행)과 전체 집계. 대상 ID는 `invoice-cards-code-v1-en`, `invoice-cards-code-v1-ko`, `invoice-cards-nl-v1-en`, `invoice-cards-nl-v1-ko`. 공개 합성 예의 최소 숫자·규칙·원자료 발췌만 보낸다. 오류·불일치가 생기면 따로 표시한 추가 발췌와 함께 전체 로컬 검산을 보고한다
- 결과 `research/results/fresh-crop-padding/RESULTS.md`: 사전등록·입력 동결·실측 커밋, 출처 blob, 자산 해시, 분모·결측, 한계. 효과 없음·반대 결과도 그대로 쓴다
- 핸드오프 `docs/agent/handoffs/fresh-crop-padding.md`

## 13. 변경 기록

- 사전등록: 이 문서(첫 커밋 `a9f2320`, 렌더·OCR·측정 전)
- 시험 RED `3d4e706` → 하네스 `86f67aa`. 판정·집계 규칙은 바꾸지 않았다
  - 하네스 구현 중 시험 고정값 하나를 고쳤다. 1px 경계 시험의 두 근거 상자가 같은 y0여서 위쪽 1px 절단이 둘 다 빠뜨렸다(손계산 실수). 값 상자 y0를 30→32로 바꿔 각 변 절단이 근거 하나만 빠뜨리게 했다. 판정 규칙은 그대로다
  - 문서와 무관한 더미 페이지 48장(연구 자료 아님, 커밋하지 않음)으로 수집기→실행기→동결→채점→A·B 비교를 `--non-measurement`로 끝까지 돌려 배선을 확인했다. 두 실행 동일, 단계마다 가드 적재, 차단 0. OCR 작업 스레드에도 가드가 적재됨(수집 단계 적재 2회, 프로세스 1개)을 관측했다
- 입력 동결 전 보완(렌더 뒤, 동결 커밋 전, OCR·측정 없음)
  - `fcp-freeze-inputs.mjs`의 페이지 SHA 중복 점검이 `git ls-tree`를 `research/`에서 불러 R09 페이지 0장과 비교하고 통과했다(`ls-tree`는 `--full-tree` 없이는 현재 폴더 기준으로 거른다). `--full-tree`를 붙이고 비교 대상이 정확히 52장(R09 dev 4 + 본시험 48)이 아니면 멈추게 했다. 다시 동결해 52장과 비교, 중복 0. 잘못된 동결본은 커밋하지 않았다
  - 새 코드 192개 중 `TQ-3239` 하나가 두 페이지(`invoice-cards-nl-v1` 행 4, `invoice-cards-nl-v2` 행 1)에 나온다. 둘 다 대상 행이 아니고 페이지 내용·SHA는 다르다. §4 규칙 위반이 아니므로 시드·사례를 바꾸지 않고 기록만 한다
  - 표 `code` 앵커의 대상 위치가 v1·v2 모두 0(첫 데이터 행)이다. §3.4 시드 계산값 그대로다
  - 렌더 검사 48장 실패 0. 두 번 생성의 55개 파일(JSON 7 + PNG 48) 원바이트 동일. 작성자가 표·카드 페이지 두 장을 눈으로 확인했다(글리프·배치만)
