# R08 연구 버전과 최신 제품의 결정적 비교

- 실행: 2026-11-22, Claude Code(`claude-opus-5-5`). 새 모델 호출 0건, 지출 US$0. 제품 코드·기존 실험 결과·논문 본문은 바꾸지 않았다.
- 기준: main `c201b69cd606838f371049df1b3d8f85481be825`. 요청서는 `codex_review/codex_paste_2026-11-22_r08-research-product-parity.md`(저장소 밖)다.
- 질문: 실험 2·3에서 관측한 제품 관련 사실 중 무엇을 현재 제품에서 그대로 확인할 수 있는가. 모델 정확도·비용·속도 효과는 다루지 않는다. 저장된 과거 측정은 출처로만 인용한다.
- 근거: [research/results/r08-parity/](../../research/results/r08-parity/)의 요약 JSON 2개와 키별 행 파일 1개. 원시 응답·번들·이미지는 로컬 scratch에만 두었고, 그 SHA-256은 요약 JSON의 `rawSha256`에 있다.

## 요약

| 관측(연구 시점) | 최신 제품에서의 결과 | 판정 |
|---|---|---|
| 실험 3 실행 번들의 `query_artifact`가 고정 규칙 질의 231개에 돌려준 첫 발췌 | **231/231** 첫 발췌의 구간·바이트·본문 해시가 같다(질의를 보내지 않은 비해당 66키를 포함하면 297/297) | **일치** |
| 동점이 없는 질의의 응답 전체(220개 + 해당 없음 66개) | 286키 응답이 정규화 해시까지 같다 | **일치** |
| entity 질의의 최고점 동점 11건: 실험 3 번들은 첫 동점 줄 발췌 1개만 반환 | 같은 첫 발췌 + 두 번째 동점 발췌 1개(발췌 2개) | **차이**(의도된 Task 39 변경) |
| excerpt-bench-002 저장 행 297개 | 최신 번들 재실행과 `layout`을 뺀 저장 필드가 모두 같다(297/297 조인) | **일치** |
| 실험 2 연구 경로가 보낸 JPEG 고유 458개(슬롯 648) | 기본 strict 458/458 거부 `unsupported_jpeg_profile`, tolerant opt-in 458/458 통과 | **차이**(기본 경로에서는 그대로 받지 않음) |
| 같은 458개에 JFIF APP0만 삽입한 대조 | 기본 strict 458/458 통과 | 거부 원인이 APP0 부재로 한정됨 |
| RQ1 JPEG 7개 설정(원본 미보존) | 재생성 설정 기준 strict 7/7 거부, tolerant 7/7 통과(4:2:0), APP0 삽입도 거부 | 설정 대조만. **보낸 바이트는 미측정** |

## 1. 비교 대상 번들

네 역할 모두 `git cat-file blob <blob>`으로 원시 바이트를 꺼내 실행했다. 개행 변환이 없는 Git blob 그대로이며(CR 0개), `git hash-object --no-filters`가 같은 blob ID를 돌려준다.

| 역할 | 원 커밋(전체) | 당시 문서의 식별자 | Git blob | 실행 파일 SHA-256 | 바이트 |
|---|---|---|---|---|---:|
| exp3: 실험 3 실행 | `7914a44abd03b3f403fb57589893720fc3cd419a` | 프로토콜 §8: 실행 트리 `7914a44`, blob `c4a290aec44cd484ef75e6f7107294303f6998d3`(2331e88–5212807 동일) | `c4a290aec44cd484ef75e6f7107294303f6998d3` | `30b76db869c8e53a11cbd87200091e07fe986de89f4c5954b7796894b5376ae4` | 960,630 |
| pre002: Task 39 수정 전 | `c2237ca23ae3f96d63ac2794ce34ecfd557a1415` | excerpt-bench-002 README: `1267f3de…b22b4` | `ee96bff47706e52930ec90ab1f066465cd8c71fe` | `1267f3de364b4b2ac73f3acea8e683897af075196c925412eea9fac22bbb22b4` | 968,103 |
| post002: Task 39 수정 뒤 | `68fe59dea179563f209da9d48282d42ba3ceeeea` | 같은 README: `98c707da…175fd`(head `ab000c2`와 bin 동일) | `0e8398995ccdeceafacd97913f1831e0cdc7b9f6` | `98c707dab49072f8b210fe9ba3fe2cf9dde863844803666d68dbc632a25175fd` | 972,746 |
| latest: R08 기준 main | `c201b69cd606838f371049df1b3d8f85481be825` | 병합된 main의 추적 blob | `5709a184c3e99b5e6ddc642b2f5dc736924d3578` | `6265b9b4bb650c947a9ec6cd6f83b9215d0e75fd63a5e4b8a0093e6891c76fa8` | 1,096,222 |

- 네 SHA-256은 PM 선확인 접두(30b76db8…, 1267f3de…, 98c707da…, 6265b9b4…)와 같다. exp3은 프로토콜 §8의 blob ID로, pre002·post002는 README의 SHA-256으로 당시 기록과 연결된다. 2331e88·5212807·7914a44의 blob이 같고, ab000c2와 68fe59d의 blob이 같음을 다시 확인했다.
- 네 번들은 서로 다른 바이트다. 같은 바이너리를 공유하는 역할은 없다.
- **재빌드 번들과 배포 추적 번들:** 이 worktree에서 `npm ci --ignore-scripts && npm run build`로 만든 `bin/token-context-optimizer.mjs`는 원시 바이트 SHA-256이 `6265b9b4…`로 추적 blob과 같다. 작업 사본은 autocrlf 때문에 CRLF로 체크아웃되어 SHA-256이 `9fa0bf7a…`이며, 비교에는 쓰지 않았다. 빌드로 생긴 작업 사본 변경은 내용이 같아 그 파일만 되돌렸다.
- **단일 파일 실행:** 번들은 Node 내장 모듈만 import한다(`node:` 접두 모듈과 접두 없는 `module`). 정적 검사에서 보이는 `ajv/dist/runtime/*` 문자열은 번들된 검증기 코드 안의 문자열이다. 상위 폴더 어디에도 `node_modules`가 없고 `NODE_PATH`도 없는 scratch 경로에서 네 번들 모두 `initialize`, `tools/list`, `index_artifact`, `query_artifact`가 동작했다. `index_image_artifact`는 exp3·latest에서만 실행했다. pre002·post002의 이미지 진입점은 이번 비교 대상이 아니다. 따라서 같은 커밋의 전체 트리나 잠금 의존성에 결속할 필요가 없었다. 번들은 디스크에 상태를 쓰지 않는다(`homedir`·`tmpdir`·`writeFile` 없음, 환경 변수는 `TCO_ALLOWED_ROOTS`만 읽음).
- **도구 목록:** exp3은 7개(crop·overview 없음), pre002·post002는 8개(overview 없음), latest는 9개다.
- **생략 인자 기본값:** `contextLines`는 네 버전 모두 2이고 이번 비교는 1을 넘겼다. `maxExcerpts`는 exp3·pre002에 없고, post002·latest는 생략 시 5다. `maxTokens`는 필수 인자이며 400을 넘겼다.
- **런타임:** 네 역할을 모두 같은 환경에서 실행했다. Node v24.18.0, win32-x64, 로캘 ko-KR이다. 연구 시점에 실제 쓴 Node 버전은 실험 3·excerpt-bench-001/002 기록에 없어 **미상**이다. 따라서 아래 결과는 "같은 런타임에서 비교한 결정적 동작"이며 역사적 실행 환경의 재현이 아니다.

## 2. 텍스트: `query_artifact`(실험 3 로그 문항)

### 입력 동일성

- 세션은 gitignore된 원자료라 `node src/sessions.mjs --split dev|calibration|heldout`으로 다시 만들었다. 실험 3 생성기(`sessions.mjs`, `families.mjs`, `families-dev2.mjs`, `families-v2.mjs`, `common.mjs`)와 `research/package-lock.json`(blob `6b103b97…`)은 7914a44 이후 바뀌지 않았다. sharp 0.35.4, libvips 8.18.6이다.
- held-out 매니페스트는 커밋된 `results/s3-heldout/sessions-heldout.json`과 blob ID(`e774dc86…`)까지 같다. SHA-256 `b88f64e3…`은 R02의 값과 같다.
- calibration(`results/s3-cal-001/sessions-calibration.json`) 6세션과 dev(`results/s3-dev-002/sessions-dev.json`) 3세션은 커밋본에 없는 `layout` 필드만 다르다. 그 외 필드는 모두 같고, 로그·이미지 SHA-256도 같다.
- 로그 33개의 실제 바이트 SHA-256이 매니페스트 값과 33/33 같다. 플러그인 `index_artifact`가 보고한 SHA-256도 모든 질의에서 같다.

### 실행 규약(실행 전 고정)

- 하네스: 기존 `research/src/excerpt-bench.mjs`(blob `6b0d5c9b…`, excerpt-bench-002 커밋 c401c82와 동일). 같은 질의 규칙(full·keywords·entity)과 도구 인자(maxTokens 400, contextLines 1, maxExcerpts 생략)·채점 규칙을 쓴다.
- 원시 응답: `research/src/r08-excerpt-capture.mjs`가 같은 규칙으로 응답 전체를 저장한다. 비교기는 모든 키에서 수집 질의 문자열과 발췌 구간이 같은 실행의 excerpt-bench 행과 일치하는지 검사한다. 하나라도 다르면 실패한다.
- 반복: 번들마다 2회, 매번 새 프로세스로 실행했다. 저장소가 메모리에만 있으므로 새 프로세스가 곧 새 쿼리 저장 상태다. excerpt-bench와 수집 스크립트도 각각 별도 프로세스다(총 16 프로세스, 모두 종료 코드 0, 도구 오류 0).
- 조인 키: `split/session/turn/variant`. 근거 줄이 하나인 로그 문항 99개 × 규칙 3 = **297키**다. entity 규칙은 숫자 단어가 없는 66키에서 해당 없음이라 **채점 분모는 231**이다(full 99, keywords 99, entity 33). 근거 로그 줄이 없는 턴(gist 문항과 이미지 전용 문항)은 처음부터 제외했다.
- 비교 필드: 발췌별로 순서, startLine, endLine, startByte, endByte, completeSpan, 본문 SHA-256을 본다. 응답별로 발췌 수, moreMatches(없으면 `absent`), fallbackReason, warnings, confidence, estimatedTokens, sha256, 최상위 필드 목록을 본다. **제외:** `artifactId`, `sourceMap.path`. `sourceMap.path`는 이 checkout의 절대 경로다. `artifactId`는 절대 경로와 내용 해시를 합쳐 만든 값의 앞부분이다. 둘 다 비교 대상 동작이 아니다. 내용 해시는 `sha256` 필드로 따로 비교한다. legacy 단일 발췌는 위치 1에 대응시켰다.
- 점수: 응답에 점수 필드가 없다. 동점 진단은 excerpt-bench의 점수 복제본(`bestScore`, `tieCount`)으로 하며, 복제본의 첫 최고점 줄은 네 번들 모두 반환 구간 안에 있었다(불일치 0).
- 타이브레이크: 네 버전 모두 동점 중 파일 순서상 첫 줄을 첫 발췌로 낸다. post002·latest는 동점 줄을 파일 순서대로 추가 발췌한다.

### 결과

비교기 `node src/r08-excerpt-parity.mjs`의 종료 코드는 0이다. 구조 실패 0(중복·누락·초과 키 0, 번들 해시 불일치 0, 로그 해시 불일치 0, 수집–벤치 불일치 0), 검토 필요 항목 0(보류 키 0, 벤치 반복 차이 0, 저장 행 불일치 0)이다. 두 반복의 키별 정규화 해시는 네 역할 모두 297/297 같았다(보류 키 0). 이 일치는 위 환경과 이 두 번의 실행에 한정한다.

| 비교 | 실제 질의 키 | 응답 전체 동일 | 첫 발췌 동일 | 비해당 키 포함(297) 전체 / 첫 발췌 |
|---|---:|---:|---:|---:|
| exp3 → pre002 | 231 | 231 | 231 | 297 / 297 |
| pre002 → post002 | 231 | 220 | 231 | 286 / 297 |
| post002 → latest | 231 | 231 | 231 | 297 / 297 |
| exp3 → latest | 231 | 220 | 231 | 286 / 297 |
| pre002 → latest | 231 | 220 | 231 | 286 / 297 |

비해당 66키는 entity 규칙에 숫자 단어가 없어 질의를 보내지 않은 키이며, 모든 역할에서 `applicable: false`로 같다.

- 다른 11키는 모두 `document-review` 세션 turn 2의 entity 질의다(held-out 8, calibration 2, dev 1). 바뀐 필드는 발췌 수, 발췌 목록, estimatedTokens 세 가지다. 첫 발췌는 같고 두 번째 동점 발췌가 추가된다. 예: `heldout/heldout-document-review-1/2/entity`는 [33–35]에서 [33–35], [135–137]로 바뀐다. moreMatches는 네 버전 모두 0건이다. exp3·pre002는 이 필드를 지원하지 않고, post002·latest는 생략된 동점이 없어 내지 않았다.

| 분할 / 규칙 | exp3 hit | latest hit | latest hitAny | 동점 | 첫 발췌가 근거 줄을 놓친 동점 |
|---|---|---|---|---:|---:|
| held-out / full | 72/72 | 72/72 | 72/72 | 0 | 0 |
| held-out / keywords | 72/72 | 72/72 | 72/72 | 0 | 0 |
| held-out / entity | 20/24 | 20/24 | **24/24** | 8 | 4 |
| calibration / entity | 5/6 | 5/6 | 6/6 | 2 | 1 |
| dev / entity | 2/3 | 2/3 | 3/3 | 1 | 1 |

- calibration·dev의 full·keywords는 네 역할 모두 18/18, 9/9다. 근거 줄이 최고점이 아닌 질의는 0건이다.
- **20/24와 24/24는 다른 지표다.** `hit`은 첫 발췌만, `hitAny`는 반환된 발췌 중 어느 것이든 근거 줄(비교차 문항은 정답 문자열도)을 덮는지 본다. exp3·pre002는 발췌가 1개라 두 값이 같다(20/24). 최신 제품의 첫 발췌 기준은 여전히 20/24다.
- **저장 기준 재현:** 저장된 `excerpt-bench-001/rows.jsonl` 297행은 exp3·pre002 재실행과, `excerpt-bench-002/rows.jsonl` 297행은 post002·latest 재실행과 비교했다. 비교 기준은 `layout`을 뺀 저장 필드 전부이며, 그 필드가 모두 같았다. 실제 조인한 행은 네 대조 모두 297/297이고, 다른 행·누락·중복은 0이다. 재실행에만 있는 필드는 001과 비교할 때 `excerptRanges`·`moreMatches`·`anyCovered`·`anyAnswer`가 적용 행 231개에 있다. 이 필드들은 001 이후 excerpt-bench에 추가된 것이다. 002와 비교할 때는 재실행에만 있는 필드가 없어 양방향으로 같다. `layout`을 뺀 이유는 001 당시 calibration·dev 매니페스트에 그 필드가 없었기 때문이다. 따라서 001·002 README의 수치는 최신 제품에서도 같은 행 단위로 다시 나온다.
- exp3과 pre002가 실제 질의 231키(비해당 포함 297키) 모두 같은 것은 두 커밋 사이 `src/core/artifacts.ts`가 같다는 사실과 맞는다. 번들 차이는 다른 도구(crop 등)에서 온다.

## 3. 이미지: 실험 2 JPEG 경로

### 경로 대응

- 연구 경로는 제품을 거치지 않았다. `research/src/transforms.mjs`가 sharp로 만든 JPEG를 모델 API에 직접 보냈다. D의 원본 재요청은 같은 family·질문·조건의 A 슬롯 파일을 그대로 다시 보낸다(`run.mjs` requeryArm). 저장된 응답에서 재요청은 GPT-4o 11건 중 JPEG 5건, Haiku 16건 중 JPEG 8건이다. 이 13건의 A 슬롯 해시는 모두 아래 458개 해시 일치 집합 안에 있다.
- 최신 제품의 대응 진입점은 `index_image_artifact`다. 인자 `profile`을 생략하면 strict, `"tolerant"`이면 tolerant다. tolerant JPEG는 `daff9b3`(2026-11-01)에서 추가됐다. exp3 번들의 입력 스키마는 `{ path }`뿐이라 `profile`은 무시되고 strict로 처리된다.

### 입력 동일성과 분모

- 슬롯 원장 `results/exp2-heldout/slots-exp2-heldout.json`(SHA-256 `a4d643d8…`)에 JPEG 슬롯 648개, 기록된 고유 SHA-256 458개가 있다.
- 동결된 연구 코드(현재 트리의 `families-exp2-heldout.mjs`, `transforms.mjs`)와 lockfile의 sharp 0.35.4 / libvips 8.18.6, Node v24.18.0, win32-x64로 다시 만든 바이트가 **458/458** 기록 해시와 같았다. 이 458개가 648슬롯을 모두 덮는다. 재현되지 않은 파일은 0개라 플랫폼·렌더러 때문에 제외한 입력은 없다. 다만 이 일치는 이 환경 하나에서만 확인했다.
- 아래 strict·tolerant·APP0 대조의 분모는 모두 해시 일치 파일 458개다. RQ1 7개는 어떤 분모에도 넣지 않았다.

### 결과

| 대조 | 분모 | 2026-11-02 기록(p612) | 최신 validator 재검사 | 최신 제품 진입점 |
|---|---:|---|---|---|
| 기본(strict) | 458 | 거부 458 `unsupported_jpeg_profile` | 거부 458(같음) | 거부 458 `unsupported_jpeg_profile` |
| tolerant opt-in | 458 | 통과 458, baseline 1x1·1x1·1x1, 무시 세그먼트 없음 | 통과 458(같음) | 통과 458, `jpeg-ycbcr8-tolerant-v1` |
| APP0 삽입 대조, strict | 458 | 통과 458 | 통과 458(같음) | 통과 458, `jpeg-ycbcr8-baseline-444-v1` |
| exp3 번들 진입점(참고) | 458 | — | — | 기본 거부 458, `profile` 무시로 tolerant도 거부 458, APP0 대조 통과 458 |

- 기존 458개 판정과 현재 직접 검사는 SHA-256을 키로 나머지 10개 열(파일, 종류, arm, 슬롯 수, 재현 여부, 크기, APP0 위치, strict, APP0 대조, tolerant)이 458/458 같다. 그 사이 제품 `jpeg-validation.ts`의 LF 정규화 SHA-256은 `78e5b1a9…`에서 `6f3cd2f0…`로 바뀌었지만 이 입력의 판정은 같다.
- 제품 진입점 결과는 같은 바이트에 대한 내부 validator 결과와 458/458 일치한다(기본·tolerant·APP0 대조 각각).
- **거부 원인:** sharp 출력에는 SOI 바로 뒤 APP0가 없다. 4:4:4 baseline이라 APP0만 넣으면 strict를 통과한다. 연구 경로 JPEG를 최신 제품에 그대로 넣으려면 tolerant opt-in이 필요하다. 기본 경로에서는 거부된다.
- **기존 정상 fixture:** `tests/fixtures/jpeg`의 3개는 최신 진입점에서 기본·tolerant 모두 통과한다(exp3 번들도 기본 통과). `tests/fixtures/jpeg-tolerant` 60개는 의도된 음성 사례를 포함한다. 최신 진입점 결과는 같은 파일의 `validateJpeg`·`validateJpegTolerant` 결과와 63/63 일치한다. 이것은 진입점 라우팅 확인이며 validator의 정확성 검증이 아니다. validator 자체는 제품 테스트 범위다.
- **RQ1 7개(설정 대조만):** 원본이 보존되지 않아 `rq1-sweep.mjs`의 makeImage 설정(q75, 4:3, 256–3072)으로 다시 만든 바이트다. 보낸 바이트와의 동일성은 확인할 수 없다. strict 7/7 거부, tolerant 7/7 통과(baseline 2x2·1x1·1x1 = 4:2:0)다. APP0를 넣어도 7/7 거부되는데, 4:2:0은 strict 프로필 밖이기 때문이다. 행 7개는 기록과 같다.

## 4. D01·재현 패키지용 판단표

| 실험 관측 | 연구 시점 | 최신 진입점·기본값 | 입력 동일성 | 비교한 출력 | 결과 | 분모·근거 |
|---|---|---|---|---|---|---|
| E3 고정 규칙 질의의 첫 발췌 | exp3 `30b76db8…`, maxTokens 400, contextLines 1 | `query_artifact`, contextLines 기본 2·maxExcerpts 기본 5(이번에는 1 지정·생략) | 로그 33/33 해시 일치, held-out 매니페스트 blob 동일 | 첫 발췌 구간·바이트·본문 해시 | 일치 231/231 | 실제 질의 231(비해당 포함 297키), `excerpt-keys.jsonl` |
| E3 응답 전체(동점 없음) | 같음 | 같음 | 같음 | 응답 정규화 해시 | 일치 220/220 | 동점 없는 실제 질의 220(비해당 포함 286키) |
| E3 entity 동점 응답 | 발췌 1개 | 발췌 최대 5개, 동점 추가 | 같음 | 발췌 수·구간 | 차이: 11키 모두 발췌 2개 | 11키, `excerpt-summary.json` pairs |
| excerpt-bench-001 hit | exp3 `30b76db8…`(추론: 001을 추가한 f6aace6의 bin blob이 `c4a290ae…`이고, 당시 하네스는 checkout의 `bin/`을 실행했다. 001 README에는 번들 기록이 없다) | 위와 같음 | 같음 | `layout`을 뺀 저장 필드 | 일치(exp3·pre002 재실행) | 조인 297/297행 |
| excerpt-bench-002 hit/hitAny | post002 `98c707da…` | 위와 같음 | 같음 | `layout`을 뺀 저장 필드 | 일치(latest 재실행 포함) | 조인 297/297행; held-out entity hit 20/24, hitAny 24/24 |
| E2 연구 JPEG 직접 전송 | 제품 미경유, sharp 0.35.4 | `index_image_artifact`, 기본 strict | 458/458 해시 일치, 648슬롯 | 수락·거부, 코드, 프로필 | 차이: 기본 거부 458 | 458, `jpeg-summary.json` |
| E2 JPEG의 tolerant opt-in | 해당 경로 없음(exp3은 `profile` 무시) | `profile: "tolerant"` | 같음 | 수락·프로필 | 최신 통과 458 | 458 |
| E2 D 원본 재요청 | A 슬롯 그대로 재전송 | 별도 재요청 경로 없음. 같은 바이트가 위 두 행에 포함 | JPEG 재요청 13건 → A 해시 13/13 일치 | — | 위 두 행과 같음 | GPT-4o 5, Haiku 8 |
| RQ1 JPEG 7개 | 원본 미보존 | 기본 strict / tolerant | **미측정**(설정 재현만) | 설정 기준 판정 | 설정 대조만: strict 거부 7, tolerant 통과 7 | 7, 분모 제외 |
| E2·E3 모델 정확도·비용·속도 | 저장된 결과 | — | — | — | **미측정**(범위 밖, 외삽 금지) | — |

## 5. 재실행 절차

새 checkout(또는 `git worktree add --detach <dir> <커밋>`)의 저장소 루트에서 Git Bash로 순서대로 실행한다. `S`는 **존재하지 않는** 새 scratch 경로다.

출력 위치와 덮어쓰기 규칙은 다음과 같다.
- 세션 생성기 `sessions.mjs`는 `research/out/sessions`(gitignore)에 쓴다. 덮어쓰기를 막지 않으므로 새 checkout에서 그 폴더가 없는지 먼저 확인한다.
- 기존 `excerpt-bench.mjs`는 `--out` 폴더에 덮어쓴다. 그래서 실행마다 `$S/runs/` 아래의 새 폴더를 준다.
- R08 스크립트(`r08-*.mjs`)는 기존 출력 파일이나 비어 있지 않은 폴더가 있으면 실패하고 덮어쓰지 않는다.
- 기존 결과 폴더(`research/results/`)에는 아무것도 쓰지 않는다.

```sh
S=/path/to/new-scratch          # 존재하지 않는 새 경로
test ! -e "$S" && test ! -e research/out/sessions || { echo "출력 경로가 이미 있다"; exit 1; }
mkdir -p "$S/bundles" "$S/runs" "$S/jpeg"

# 0. 기존 잠금 파일로 설치(루트: 제품 dist는 p612 probe와 fixture 대조가 읽는다)
npm ci --ignore-scripts && npm run build
git checkout -- bin/token-context-optimizer.mjs    # 빌드가 CRLF 작업 사본만 바꾼다. 원시 SHA-256은 추적 blob과 같다(§1)
(cd research && npm ci --ignore-scripts)           # research/package-lock.json, sharp 0.35.4

# 1. 번들 4종: 원시 blob 추출(개행 변환 없음)
for pair in exp3:7914a44 pre002:c2237ca post002:68fe59d latest:c201b69; do
  git cat-file blob "${pair#*:}:bin/token-context-optimizer.mjs" > "$S/bundles/${pair%%:*}.mjs"
done
sha256sum "$S"/bundles/*.mjs                         # §1 표와 대조

cd research
# 2. 세션 재생성 → research/out/sessions
for s in dev calibration heldout; do node src/sessions.mjs --split $s; done

# 3. 번들마다 2회, 새 프로세스
for rep in 1 2; do for role in exp3 pre002 post002 latest; do
  node src/excerpt-bench.mjs --bundle "$S/bundles/$role.mjs" --sessions out/sessions --out "$S/runs/bench-$role-$rep"
  node src/r08-excerpt-capture.mjs --bundle "$S/bundles/$role.mjs" --role $role --rep $rep --sessions out/sessions --out "$S/runs/capture-$role-$rep.jsonl"
done; done

# 4. 설정과 커밋 기준 파일(git show로 LF 원본) → $S/parity-config.json, $S/committed/
node src/r08-parity-config.mjs --scratch "$S"
node src/r08-excerpt-parity.mjs --config "$S/parity-config.json" --out "$S/parity-report.json"

# 5. JPEG: 기존 p612 probe(루트 기준 실행), 제품 진입점, 비교
(cd .. && node research/src/p612-encoder-profile-probe.mjs . --out "$S/jpeg/p612-latest.json")
node src/r08-jpeg-entry.mjs --bundle latest="$S/bundles/latest.mjs" --bundle exp3="$S/bundles/exp3.mjs" --files "$S/jpeg/files" --out "$S/jpeg/entry.jsonl"
node src/r08-jpeg-parity.mjs --stored "$S/committed/p612.json" --current "$S/jpeg/p612-latest.json" --entry "$S/jpeg/entry.jsonl" --role latest \
  --expect-bundle latest=6265b9b4bb650c947a9ec6cd6f83b9215d0e75fd63a5e4b8a0093e6891c76fa8 \
  --expect-bundle exp3=30b76db869c8e53a11cbd87200091e07fe986de89f4c5954b7796894b5376ae4 --dist .. --out "$S/jpeg/jpeg-report.json"

# 6. 커밋된 근거를 다시 만들어 필드 대조. 필수 대조가 하나라도 실패하면 이 명령이 0이 아닌 값으로 끝난다
node src/r08-evidence.mjs --scratch "$S" --out "$S/evidence" &&
  node src/r08-evidence-check.mjs --scratch "$S" --fresh "$S/evidence" --rev HEAD
```

- 6단계 대조 도우미 `r08-evidence-check.mjs`
  - 커밋본은 `git show <rev>:`로 읽는다. 파일을 JSON으로 파싱해 비교하므로 작업 사본의 CRLF와 무관하다. `--committed <dir>`로 폴더를 줄 수도 있다.
  - `excerpt-keys.jsonl`, `excerpt-summary.json`, `jpeg-summary.json`은 필드 전체가 같아야 한다.
  - 예외는 원시 캡처 해시 8개(`rawSha256["capture-<역할>-<반복>.jsonl"]`)다. 캡처에는 checkout의 절대 경로가 들어 있어 다른 경로에서는 정상 결과도 해시가 다르다. 그래서 이 8개는 커밋값 대신 이번 실행의 `$S/runs/` 실제 파일 해시와 대조한다. 벤치 행 8개와 JPEG 원시 파일 2개의 해시에는 경로가 없어, 다른 필드와 같이 커밋값과 대조한다.
  - 차이가 있으면 파일별 첫 차이 경로를 출력하고 종료 1로 끝난다. 모두 통과하면 0이다.
  - 이 대조는 §2·§3의 실행 환경(Node v24.18.0, win32-x64, ko-KR, sharp 0.35.4)을 전제로 한다. 환경이 다르면 실행 메타 필드에서 실패한다.

- `r08-parity-config.mjs`가 쓰는 설정의 내용은 다음과 같다.
  - `sessions`: `out/sessions`
  - 커밋된 매니페스트 3개: held-out `results/s3-heldout`, calibration `results/s3-cal-001`, dev `results/s3-dev-002`
  - 역할별 번들 SHA-256(§1), `reps: [1, 2]`, 실행 8개의 파일 경로
  - 저장 행 대조 4쌍: 001은 exp3·pre002와, 002는 post002·latest와 짝짓는다.
- 두 비교기의 종료 코드는 다음과 같다.
  - 1: 구조 실패.
    - 중복·누락·초과 키
    - 번들·로그·슬롯 원장 해시 불일치
    - 수집–벤치 불일치
    - 역할별 반복 ID가 계획(1, 2로 고정)과 다름, 설정의 `reps`가 [1, 2]가 아님, 캡처 meta의 역할·반복이 실행과 다름
    - 저장 행 대조 역할에 재실행이 없거나 저장 행이 모두 조인되지 않음(`joinedRows`가 분모)
    - 진입점 수집의 번들·fixture 목록 불일치(`--dist` 필수)
  - 2: 구조는 정상이지만 검토가 필요한 항목이 있음.
    - 보류 키, 저장 행 값 불일치
    - JPEG 미재현, probe 열 차이, 진입점–validator 불일치
  - 0: 둘 다 없음.
  - 버전 간 차이는 결과이므로 종료 코드에 반영하지 않는다.
- **새 checkout 재실행(2026-11-22):** 위 코드 블록을 문서에서 그대로 추출해, 커밋 `5942b25cd4174c3bd6307e01029050e894629e91`의 새 detached worktree와 존재하지 않던 scratch에서 실행했다. 명령은 바꾸지 않았고, 0이 아닌 종료를 기록하는 ERR 트랩만 앞에 붙였다.
  - ERR 트랩에 잡힌 0이 아닌 종료는 없었다. 이 기록은 상위 명령의 종료 코드만 뜻한다. 당시 6단계는 `cmp … && echo` 루프였는데, 이 루프는 앞 파일의 `cmp` 실패를 전파하지 않는다. 그래서 위 기록을 각 `cmp`가 성공했다는 뜻으로 읽으면 안 된다. 6단계의 실제 비교 결과는 아래 항목과 같다. 지금의 6단계는 이 문제를 고친 대조 도우미다(아래 "6단계 정정").
  - 번들 SHA-256 4개는 §1과 같다.
  - 텍스트 비교기와 JPEG 비교기 모두 `failures`·`attention`이 0건이다.
  - 6단계 바이트 대조에서 `excerpt-keys.jsonl`은 직전 커밋본과 같았다. 두 요약 JSON은 다음 차이만 있었다.
    - schema 판올림(v2→v3), 새 필드 `joinedRows` 297 ×4, 진입점 파일 이름(`entry2.jsonl`→`entry.jsonl`, 해시 동일)
    - 원시 캡처 8개의 해시. 캡처에는 checkout의 절대 경로가 들어 있어서다. 벤치 행 8개의 원시 해시는 같았다.
  - 현재 `research/results/r08-parity/`는 이 재실행의 6단계 출력이다.
- **6단계 정정(2026-11-22, PM 지적):** 옛 `cmp` 루프에는 두 문제가 있었다. 실패를 전파하지 않았고, 다른 경로의 새 checkout에서는 정상 결과도 원시 캡처 해시 때문에 바이트가 달라졌다. 그래서 대조 도우미로 바꿨다. 검산은 모두 임시 복사본에서만 했고, 커밋된 근거와 수치는 바꾸지 않았다.
  - 위 재실행 scratch와 커밋본(`--rev HEAD`)의 대조: 통과, 종료 0.
  - 다른 경로 모의: scratch 사본의 캡처 8개에서 checkout 경로 문자열만 바꾸고 근거를 다시 만들었다. 요약 파일에서는 캡처 해시 8줄만 달라졌고, 대조는 통과했다(종료 0).
  - 첫 파일 변조: `excerpt-keys.jsonl` 첫 행의 `goldLine` 하나를 107→108로 바꿨다. 대조가 실패했다(`$[0].goldLine`, 종료 1).
  - 중간 요약 변조: `excerpt-summary.json`의 `pairs["exp3→pre002"].identical`을 297→296으로 바꿨다. 대조가 실패했다(종료 1).
  - 문서에서 꺼낸 6단계 명령을 Git Bash로 scratch 사본 세 개에 실행했다.
    - 정상 사본: 종료 0.
    - 캡처 사본에서 첫 키의 `goldLine`을 바꾼 사본: 첫 근거 파일과 그 해시가 달라져 종료 1.
    - 비교 보고서 사본에서 `exp3→latest` 동일 키 수를 286→285로 바꾼 사본: 요약 대조가 실패해 종료 1.
- 최초 실행 경위
  - 진입점 수집의 첫 실행에는 거부 코드를 도구 이름(`index_image_artifact`)으로 잘못 뽑는 추출 버그가 있었다. 코드를 고친 뒤 새 출력 경로로 다시 실행했다.
  - 두 실행의 수락·거부·프로필 판정 1,042건은 같았다.
  - 비교기는 교차 검토 지적을 반영해 여러 차례 고쳤다. 현재 커밋된 근거는 새 checkout 재실행에서 다시 만든 것이다.
- 비교기 오프라인 테스트: `node --test test/r08-excerpt-parity.test.mjs test/r08-jpeg-parity.test.mjs test/r08-evidence-check.test.mjs`(research/에서, 37개: 비교기 29, 6단계 대조 8).

## 6. 한계

- **런타임:** 연구 시점의 Node 버전은 미상이다. 결과는 Node v24.18.0 / win32-x64 / ko-KR 하나에서 네 번들을 같은 조건으로 비교한 것이다. 두 번 일치는 이 환경과 이 두 번의 실행에 한정한다.
- **입력 재현:** 세션과 JPEG 바이트 재현은 같은 생성기·lockfile·플랫폼에서만 확인했다. 다른 OS나 libvips 빌드에서의 바이트 동일성은 확인하지 않았다.
- **질의:** 질의는 모델이 아니라 고정 규칙으로 만들었다. 실험 3에서 모델이 실제로 보낸 질의와 그 응답은 다시 실행하지 않았다. 따라서 이 비교는 "같은 질의에 같은 발췌가 나오는가"까지만 말한다. 최신 제품에서 모델 정답률이 어떻게 될지는 말하지 않는다.
- **진입점 범위:** JPEG 진입점 비교는 `index_image_artifact` 수락·거부와 프로필까지다. crop·overview 출력, 이미지 토큰, 모델 판독은 비교하지 않았다.
- 제품 수정이 필요한 발견은 없다. 연구 경로 JPEG가 기본 strict에서 거부된다는 사실은 이미 문서화된 설계(strict 기본, tolerant opt-in)와 맞으며, 결함이 아니다. 논문·재현 패키지는 "실험 2 입력을 제품에 넣으려면 tolerant opt-in이 필요하다"고 적으면 된다.
