# 제품 MCP 원본·개요·영역 보기 비교: 실행 프로토콜

- 작성 2026-11-23. Tier E. 기준 `origin/main` `41fc769dd5879aa10acb59153d98865b6a026200`
- Orca Task `task_0580dbf92206`. 연구 담당 Claude Code, PM Codex(Astra)
- 범위: 검토용 Draft PR까지. 실험 API 비용 0원. D04는 사용자 직접 송부 보류 상태로 둔다
- 이 문서는 **실행 전에** 커밋한다. 표 스키마와 호출 흐름(§5, §6)은 측정 전에 고정한다. 측정 뒤 바꾸는 내용은 §11의 변경 기록에 남긴다

## 1. 성격

알려진 자료를 재현하는 **기술적 비교**다. 새 확인적 검정이 아니다.

- 지난 탐색에서 이미 관측한 사실
  - 회색조 원본은 거부되고 RGB 파생본은 수락된다
  - 한국어 자연어 질문은 선택기가 불일치해 전체 화면을 반환한다
  - 한국어 코드 질문 한 건은 2px 잘렸다
- RGB 인코딩 통제와 고정 호출자는 **사후 설계**다. 결과를 본 뒤 호출자 조건을 고치지 않는다
- 금표준(`gold.json`)은 R09 PR #140 merge로 이미 공개되었다. 이 연구는 공개된 자료를 재사용한다. OCR은 다시 돌리지 않고, 저장된 R09 선택 결과를 재생한다
- 보고는 기술 빈도와 원시 분모만 한다. 검정·신뢰구간·효과 크기는 계산하지 않는다

## 2. 질문

같은 이미지와 질문에 대해 실제 배포 번들(`bin/token-context-optimizer.mjs`)을 stdio MCP로 실행했을 때 다음을 관측한다.

- 무엇을 수락하는가
- 어떤 픽셀 범위를 반환하는가
- 어떤 원본 참조를 반환하는가

## 3. 범위 밖

- 새 실데이터, 다운로드 자료, 사용자 자료
- 호스팅 실험, 유료 모델 호출
- 새 종속성, 제품 기능 변경
- 8쪽 심사본, 기존 WBS 필수 분모
- 축소 뒤 판독성, 모델 정답률, 청구 토큰. **모든 조건에서 미측정**이다

## 4. 입력

모든 입력은 기준 커밋 `41fc769`의 Git blob에서 읽는다(`git cat-file blob`). 작업 사본의 줄바꿈(LF/CRLF)과 무관하게 같은 바이트를 얻기 위해서다.

| 입력 | 경로(기준 커밋) | 쓰는 단계 |
|---|---|---|
| 설계 manifest | `research/results/r09-bilingual/heldout/design.json` | 준비기(ID·짝·언어·앵커·문서형·지면만 투영) |
| 질문 | `.../heldout/questions.json` | 준비기, 실행기(격리 입력의 사본) |
| 원본 PNG 48장 | `.../heldout/images/*.png` | 준비기, 파생기, 실행기 |
| 동결 목록 | `.../heldout/freeze-manifest.json` | 준비기(원본 SHA, R09 실행 코드 blob 대조) |
| R09 선택 기록 | `.../heldout/run-a/raw.jsonl`, blob `876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318` | 준비기(`id`, `matched`, `band`만 투영) |
| 금표준 | `.../heldout/gold.json` | **채점자만** |
| 번들 | `bin/token-context-optimizer.mjs`, blob `5709a184c3e99b5e6ddc642b2f5dc736924d3578` | 실행기 |

### 4.1 R09 선택 기록의 출처

- R09 선택기(`research/src/r09-run.mjs`, blob `b3266f3…`)는 `questions.json`(id, file, question)과 원본 픽셀만 읽었다(그 파일 머리 주석과 R09 사전등록). 금표준·설계·답은 읽지 않았다
- 준비기는 기준 커밋의 `r09-run.mjs`와 `selector.mjs` blob이 R09 `freeze-manifest.json`의 `code` 항목과 같은지 대조하고 결과를 기록한다
- `run-a/raw.jsonl`의 blob id가 `876cdbb…`가 아니면 실행 전에 오류로 끝난다

### 4.2 원본 형식

- 원본 48장은 PNG IHDR `bit depth = 8`, `color type = 0`(회색조)만 허용한다
- 다른 형식이면 "조사 입력이 달라졌다"는 오류로 끝난다. 임의로 변환하지 않는다
- 원본 SHA-256(원바이트)이 R09 `freeze-manifest.json`의 `inputs` 값과 다르면 실행 전에 끝난다

### 4.3 RGB 파생본

- 도구: `research/tools/mcp-view-comparison-derive.py`. Pillow 12.3.0(`tools/d03/requirements.txt`와 같은 핀)
- 규칙
  - 회색조 L 값 `g`를 `(g, g, g)`로 복제한다. 다른 변환(감마, 색공간, 알파)은 없다
  - `Image.save(format="PNG")`, 인자는 `compress_level=6`, `optimize=False`만 둔다. `pnginfo`, `dpi`, `icc_profile`, `exif`를 넘기지 않는다
  - 저장 뒤 청크가 `IHDR`, `IDAT`…, `IEND`뿐이고 IHDR이 `bit depth 8`, `color type 2`, interlace 0인지 확인한다
- 검증
  - 파생기가 Pillow로 각 채널과 원본 밝기면이 전 픽셀 같은지 확인한다
  - 실행기가 별도 PNG 디코더(`node:zlib` + 필터 복원, 직접 구현)로 다시 확인한다
- 기록: `research/results/mcp-view-comparison/rgb-manifest.json`에 ID마다 원본 SHA, 파생 SHA, 치수, 바이트 수를 남긴다. 파생 PNG 자체는 저장소에 넣지 않는다
- 해시 기준
  - 이미지는 원바이트 SHA-256이다
  - 텍스트는 기준 커밋의 Git blob이다. 저장소 전역 `.gitattributes`는 바꾸지 않는다
- 한계: PNG 압축 바이트는 Pillow·zlib 빌드에 따라 달라질 수 있다. 다른 환경에서 파생 SHA가 다르면 픽셀 동일성은 위 두 검증으로 확인하되, 그 차이를 기록한다

원본과 파생본은 **별도로 집계**한다. 회색조 원본 SHA와 RGB 파생 SHA를 나란히 적는다.

## 5. 관측 단위와 배정

- 관측 단위: 이미지 × 표현(`original`·`rgb`) × 프로필(`strict`·`tolerant`) × 보기(`original`·`overview`·`region`)
- 키: `<rep>|<profile>|<view>|<id>`. 48 × 2 × 2 × 3 = **576**개
- 각 셀(표현 × 프로필 × 보기 = 12개)은 같은 48개 질문을 받는다
- 배정은 결정적이다. 무작위 추출은 없다
- 실행 전 검산(실패하면 실행하지 않고 끝난다)
  - 576개 키가 모두 있고 각각 한 번씩만 있다
  - 셀마다 48개 ID이고 24개 쌍(EN·KO)이 모두 있다
  - 앵커(code·nl)와 문서형별 원시 분모를 기록한다
- 어떤 행도 제외하지 않는다. 색인 거부, 도구 오류, 디코드 실패, 검증 실패는 모두 분모에 남는다

## 6. 호출 흐름

### 6.1 셀마다

1. 빈 임시 허용 루트를 새로 만든다. 그 표현의 48장을 `<id>.png`로 복사한다
2. 새 stdio 번들 프로세스를 띄운다
   - 환경 변수: `PATH`, `SystemRoot` 등 실행에 필요한 최소값, `TCO_ALLOWED_ROOTS=<그 루트>`, 오프라인 가드
   - API 키를 넘기지 않는다
3. `initialize` → `notifications/initialized` → `tools/list`
4. 48개 ID를 질문 순서대로 처리한다(아래 6.2)
5. 프로세스를 닫고 종료 코드·신호를 기록한다. 허용 루트를 지운다

### 6.2 보기별 경로

선행 단계가 실패하면 그 행은 실패로 보존하고 후속 요청은 보내지 않는다. 보내지 않은 단계는 `not_called`(해당 없음)다. 재시도는 없다.

| 보기 | 요청 순서 | 반환 |
|---|---|---|
| `original` | `index_image_artifact(path, profile)` → `crop_image_artifact(전체 좌표 0,0,W,H)` → 응답 `source.path`를 실제로 열어 바이트·해시 검증 | 원본 참조(검증됨) |
| `overview` | `index` → `overview_image_artifact(maxSide=512)` → 반환 JPEG 디코드 | 개요 JPEG |
| `region` | `index` → `overview(maxSide=512)` → R09 기록이 `matched`이면 `crop(band)`, 아니면 `crop(전체 좌표)` → 응답이 원본 참조이면 실제로 열어 검증 | 부분 JPEG 또는 원본 참조 |

- `region`의 호출자 입력은 R09 투영본의 `matched`, `band`뿐이다. 금표준은 선택·재조회 판단에 쓰지 않는다
- `band`는 원본 픽셀 공간 그대로 `{x: left, y: top, width, height}`로 넘긴다
- 개요 크기 기대값: `max(W, H) ≤ 512`이면 원치수. 그 밖에는 각 변 `max(1, floor(side × 512 / max(W, H) + 0.5))`

### 6.3 원본 읽기 모듈

입력은 MCP 응답의 `source.path`, 응답 종류(`status`, `fullFrame`, 형식), 별도 기대 SHA, 허용 루트뿐이다. manifest의 파일 경로는 넘기지 않는다.

- 확인 순서
  1. 응답 종류가 `status = original`, `fullFrame = true`, 형식 PNG인지 확인한다
  2. 참조 경로가 있는지 확인한다
  3. `realpath`가 허용 루트 안의 일반 파일인지 확인한다
  4. 바이트를 새로 읽는다. 같은 ID의 이전 읽기를 캐시하지 않는다
  5. SHA-256을 그 **표현**의 기대 SHA와 대조한다(원본은 회색조 SHA, 파생본은 RGB SHA)
- 실패 코드
  - `ref_missing`: 참조 경로 없음
  - `ref_outside_root`: 허용 루트 밖
  - `ref_unreadable`: 열 수 없음
  - `sha_mismatch`: 해시 불일치
  - `kind_invalid`: `fullFrame`인데 JPEG이거나, 종류가 다름

### 6.4 출처와 디코드 검증

- 색인·개요·영역 응답의 `source.sha256`을 기대 SHA와 대조한다
- 개요·부분 JPEG
  - base64 이미지 바이트의 SHA-256이 응답 `output.sha256`과 같은지 확인한다
  - `sharp`로 실제 디코드한다
  - 디코드 치수가 응답 치수와 같은지, 개요는 6.2의 기대 치수, 부분은 요청 영역 치수와 같은지 확인한다

## 7. 표 스키마 (`raw.jsonl`, 키마다 한 줄)

공개 기록에는 경로, 픽셀, 자격 정보, `artifactId`(경로에서 파생되어 실행마다 다름)를 넣지 않는다. ID, 해시 일치 여부, 이벤트 코드, 호출 순서만 넣는다.

```text
key, rep, profile, view, id, pairId, lang, anchor, doctype, layout
caller: { matched, band } | null              # region 보기만
steps: [{ seq, tool, status: ok|error, code }] # 실제로 보낸 tools/call만, 보낸 순서
index:    { status: ok|error|not_called, code, validationProfile, ignoredChunks, width, height, sourceSha: match|mismatch|null }
overview: { status, code, width, height, expectedWidth, expectedHeight, decode: ok|failed|null,
            decodedWidth, decodedHeight, imageSha: match|mismatch|null, sourceSha }
crop:     { status, code, purpose: planned_original|selector_region|fallback_original|null,
            requested: {x,y,width,height}|null, kind: cropped|original|rejected|null, fullFrame,
            region: [x0,y0,x1,y1]|null, decode, decodedWidth, decodedHeight, imageSha, sourceSha }
originalRead: { status: ok|failed|not_called, purpose, code, sha: match|mismatch|null }
returned: { kind: original_verified|original_unverified|overview_jpeg|crop_jpeg|none, region: [x0,y0,x1,y1]|null }
counts: { toolCalls, toolErrors, fileReads, plannedOriginalRequests, fallbackOriginalRequests, originalRefsRead }
outcome: ok|failed, failStage, failCode
```

셀 기록(`cells.jsonl`, 셀마다 한 줄): `cell`, `initialize`, `toolsList`(이름 목록), `mcpRequests`, `mcpResponses`, `notifications`, `toolCalls`, `exit`(코드·신호), `stderrSha256`.

- `mcpRequests`는 실패한 요청도 포함한다
- 초기화·도구 목록·업무 `tools/call`·호출자의 파일 읽기를 따로 센다
- 예정된 원본 요청, 미매치 때문에 새로 보낸 원본 요청, 응답 참조를 실제로 읽은 횟수를 나눈다
- 실제로 하지 않은 재조회는 0으로 기록한다

## 8. 지표와 판정

### 8.1 행 판정

- 입력 수락: `index.status`와 오류 코드
- 출처 해시 검증: 단계별 `sourceSha`, 원본 읽기 `sha`
- JPEG 디코드: 실제 디코드 여부와 치수
- 실제 반환 종류: `returned.kind`
- 기하 판정은 원본 픽셀 정수 반개방 좌표 `[x, x+w) × [y, y+h)` 한 공간에서만 한다
  - `complete`: 금표준 부분 상자가 모두 반환 영역 안에 있다
  - `partial`: 하나 이상 빠졌다. 1px 잘림도 `partial`이다. 검출되지 않은 잘림은 누락으로 기록한다
  - `not_evaluable`: 선행 실패로 반환이 없거나, 원본 참조를 실제로 열어 검증하지 못했다
- 반환 영역
  - 원본 보기와 개요는 전체 시야 `[0, 0, W, H]`다
  - 영역은 응답이 실제로 돌려준 `region`이다
  - 원본 참조가 증거를 포함한다고 판정하려면 실제 열기와 해시 검증이 필요하다

기하적 포함만 잰다. 개요가 전체 시야를 담아도 축소 뒤 글자를 읽을 수 있다는 뜻은 아니다. 판독성과 모델 정답률은 미측정이다. 근거 포함과 바이트 크기를 정답률이나 청구 토큰으로 표현하지 않는다. 호출 횟수는 기계 규칙의 결과이며 사람·모델의 행동이 아니다.

### 8.2 집계

- 셀마다 분모 48
  - 수락 수, 오류 코드별 수, 반환 종류별 수
  - 기하 `complete`/`partial`/`not_evaluable`
  - 호출·파일 읽기 수 합계
- 거부된 행은 전체 분모에서 실패이고, 근거와 판독은 평가 불가다
- 언어(EN·KO) × 앵커(code·nl) 원시 분모(각 12)를 보존한다
- 셀 안에서 24개 쌍의 EN·KO 짝 표(둘 다 complete, EN만, KO만, 둘 다 아님)를 낸다

## 9. 파일 접근 분리

| 단계 | 파일 | 읽는 것 | 읽지 않는 것 |
|---|---|---|---|
| 준비기 | `src/mcp-view-comparison-prepare.mjs` | 기준 커밋 blob: design(투영), questions, images, freeze-manifest, run-a raw(투영) | gold |
| 파생기 | `tools/mcp-view-comparison-derive.py` | 격리 입력의 원본 PNG | 그 밖 전부 |
| 실행기 | `src/mcp-view-comparison-run.mjs` | 격리 입력 폴더(`assignment.json`, `questions.json`, `expected-sha.json`, `images/`)와 번들 | 저장소의 다른 파일 |
| 동결 | `src/mcp-view-comparison-freeze.mjs` | 실행 출력 | gold |
| 채점자 | `src/mcp-view-comparison-score.mjs` | 동결 목록과 대조한 실행 출력, 그다음 기준 커밋 gold | — |
| 독립 검산 | `tools/mcp-view-comparison-recount.py` | 실행 출력과 gold | 채점자 코드 |

- 실행기는 격리 입력 폴더에 허용 목록 밖의 파일이 있으면 시작하지 않는다
- 이름에 `gold`·`answer`·`score`·`render`·`design`이 든 경로를 열려고 하면 실패한다. 테스트로 확인한다
- 채점자는 동결 목록의 해시를 먼저 검증한 뒤에만 gold를 읽는다

## 10. 재현과 검증

- 실행 A·B를 독립 실행한다. 결정적 필드와 집계(오류 코드 포함)가 바이트 단위로 같아야 한다
- 실행 C는 `core.autocrlf=false`로 꺼낸 LF 작업 사본(`git worktree add --detach`)에서 돌린다. 실행 A와 같아야 한다
- Python 독립 검산의 불일치가 0이어야 한다
- 오프라인 가드
  - `tools/d03/guard/node-netguard.cjs`를 실행기와 번들 자식 프로세스 모두에 건다
  - 기대값: 가드 이벤트 13개(실행기 1 + 셀 12), 차단 0
- 테스트(`research/test/mcp-view-comparison.test.mjs`)
  - 양성·음성·경계 사례
    - 누락·중복·여분 ID와 불법 좌표로 준비 중단
    - 거부 행의 분모 유지
    - 변환 픽셀 불일치 검출
    - 참조만 반환한 경우와 실제 열기의 구분, 참조 변조·루트 밖·해시 불일치·`fullFrame` JPEG
    - 1px 안·밖과 경계 맞닿음, 폭·높이 오류
    - 스텁 서버로 실제 호출 횟수 대조
    - gold 접근 실패
  - RED(구현 전 실패)와 GREEN을 기록한다
- 전체 프로젝트 게이트(CLAUDE.md 검증 명령 7종)를 실행한다

## 11. 변경 기록

- 측정 전 고정(하네스 커밋)
  - `results/mcp-view-comparison/rgb-manifest.json`: 파생본 48개의 기대 SHA. 같은 환경에서 두 번 파생한 결과가 바이트 단위로 같았다
  - `results/mcp-view-comparison/prepare-report.json`: 준비기 검산
    - 48 ID, 24쌍, 576키
    - 원본 IHDR `1280x960 bd8 ct0 il0` 48장, 원본 SHA 동결 일치 48
    - R09 선택 코드 blob 일치. 투영 matched 36, unmatched 12
  - `results/mcp-view-comparison/.gitattributes`: 이 폴더의 텍스트를 LF로 꺼낸다. 저장소 전역 설정은 바꾸지 않는다
  - 파생기는 Pillow의 zlib 빌드(`features.version("zlib")`)를 기록한다
- 측정 뒤 수정(독립 Opus 마일스톤 검토 반영, `fix(review)` 커밋)
  - 성격: 검사를 더 엄격하게만 바꿨다. 호출자 조건, 호출 흐름, 판정 규칙, 표 스키마는 바꾸지 않았다
  - 수정 항목
    - 실행기는 오프라인 가드가 없으면 번들을 띄우기 전에 멈춘다(측정 아닌 점검용 `--allow-no-guard`만 예외)
    - initialize 실패 셀의 행은 보내지 않은 도구 호출을 세지 않는다. 모든 단계는 `not_called`, `failStage: initialize`, 호출 수 0이다. 이번 측정에서는 일어나지 않았다
    - 채점자는 동결 목록이 정확히 세 파일(`raw.jsonl`, `cells.jsonl`, `input-check.json`)일 때만 gold를 읽는다
    - 채점자와 Python 검산기는 ID 집합을 원시 행이 아닌 동결된 `input-check.json`에서 가져온다. 48개 ID와 576개 키를 고정하고, 검산기는 score의 행 키 집합도 대조한다
    - 원본 읽기의 루트 밖 판정을 `..` 경로 성분 기준으로 바꿨다(이름이 `..`로 시작하는 루트 안 파일을 밖으로 잘못 판정하지 않음)
  - 수정 코드로 실행 A·B와 검산을 새 폴더에서 처음부터 다시 했다. 결정적 출력 11개(`raw.jsonl`, `cells.jsonl`, `input-check.json`, `score.json`, `summary.md` 각 A·B, `recount.json`)와 `evidence.json`이 커밋된 결과와 바이트 단위로 같았다. 측정값은 바뀌지 않았다
