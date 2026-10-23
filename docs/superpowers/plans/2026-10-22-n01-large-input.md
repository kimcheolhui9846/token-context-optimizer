# N-01 Large-input RangeError Implementation Plan

> **For agentic workers:** 승인된 2단계 전달문을 받은 뒤에만 `superpowers:executing-plans` 또는 `superpowers:subagent-driven-development`로 실행한다. 이 PR은 probe와 계획만 제공한다.

**Goal:** 허용된 대형 입력에서 정책 분류기가 던지는 예외를 제거하면서, 원본 분류기가 반환하던 입력의 분류·reason 순서·warning·lossy 허용 여부를 보존한다.

**Architecture:** D-1 후보는 예외 경로의 정규식을 선형 스캐너로 치환하는 방식, 입력 상한, 예외 시 fail-closed 처리다. 권장안은 확인된 예외 경로의 스캐너 치환과 D-2의 관측 가능한 안전망 조합이다. 사용자 결정 전에는 어느 안도 제품에 적용하지 않는다.

**Tech Stack:** TypeScript, Node.js/V8, Vitest, 기존 TypeScript transpileModule 기반 격리 child probe. 새 의존성 없음.

## 상태와 제약

- 기준: main `1c0d80c`; 브랜치 `codex/n01-large-input-rangeerror`. 등급 E(측정 evidence). 계획 승인과 D-1·D-2 선택은 대기 중이다.
- 이번 커밋: 이 계획과 새 timestamp JSON 두 파일만. probe 실행 소스는 JSON의 `runner.source`에 포함한다. 별도 제품·테스트·bundle 변경 없음.
- `src/`, `research/`, `codex_review/`, `paper/`, frozen oracle와 기존 evidence를 수정하거나 재생성하지 않는다. F-21 동작 변경·새 의존성·Ready·merge 제외.
- Luna 런타임을 확인하지 못했고 Claude Opus 5.5 초안 생성은 240초 및 360초 제한에서 결과 없이 종료됐다. 이번 전달문의 대체 허용에 따라 **GPT-6 주 Codex 에이전트**가 probe와 계획을 작성했다. 해당 Claude 호출은 성공한 구현/검토로 산입하지 않는다.
- **Independent cross-check: DEGRADED.** 이 PR 보고 후 사용자 Claude 세션의 계획 검토를 받는다. 주 에이전트 직접 검토는 독립 검토가 아니다.

## 확인한 영향 경로

- `src/core/artifacts.ts:36`: `index_artifact`의 기본 maxBytes는 10 MiB(10,485,760 bytes)다. `summarizeArtifact`의 L280은 저장된 content를 분류한 후에야 lossy 차단 분기로 들어가므로 분류 예외가 차단 응답을 우회한다. 실제 파일 색인→요약 통합 재현은 이번에 실행하지 않았으며, 이 설명은 호출 경로 확인이다.
- `src/server/index.ts:63`: `classify_context` 입력은 `z.string()`이고 별도 길이 상한이 없다. 20 MiB는 기본 파일 색인 한도를 넘지만 직접 분류 경로의 probe로 유효하다.
- Task 25의 반환 동등성 주장은 원본이 반환한 입력에 한정된다. 예외가 있는 대형 입력의 새로운 결과는 동등성 주장이 아니라 이번 결정으로 승인받을 확장 동작이다.

## 측정 방법과 재현

- 기준 policy의 실제 파일 SHA-256, frozen oracle SHA-256, Git HEAD, Node/V8/OS/CPU, 실행 소스와 해시를 JSON에 기록한다. CRLF 원시 파일 해시와 Git blob은 다를 수 있다.
- 27개 EXACT_PATTERNS 항목(0-based #0–#26, 함수형 항목 포함), 9개 추가 helper, 실제 소스에서 추출한 visual 정규식, 전체 classifyContext: 총 38개 경로.
- 각 경로에 10개 recipe를 각각 UTF-8 **10 MiB와 20 MiB**로 적용한다. UTF-16 code units도 별도로 기록한다. 각 셀은 새 프로세스, `windowsHide:true`, 20초 wall deadline이다. frozen oracle의 대형 실행은 하지 않는다.
- 단회 관측, 워밍업 없음, 순차 실행이다. `operationElapsedNs`는 호출 구간, `wallMs`는 시작·컴파일·입력 생성 포함이다. 이번 값은 중앙값·점근적 선형성·보편적 안전성 증명이 아니다.
- `returned`, `threw`(예외 name/message), `timeout-censored`, infrastructure `error`를 구분한다. 타임아웃을 RangeError로 추정하지 않는다. 자식의 메타데이터를 부모가 검증하며 결과마다 새 JSON을 갱신한다.
- recipe: `a…ag`(hex), `1…1a`(digits), 반복 `Zz0_`(word), 반복 `segment/`+`?`(공백 없는 path), U+3000×9+LF와 ASCII 나머지, `id=`+점 연속, `A…Ag`, 긴 공백+`npm`, 긴 공백+`const`, `1.`+숫자 연속+`a`. 정확한 생성식은 JSON의 `recipes`/`runner.source`가 기준이다.
- 작은 4,096-byte hex 입력으로 38개 경로가 모두 반환하는 smoke 검사를 먼저 실행했다. smoke는 evidence 파일을 생성하지 않는다.

재현 시 evidence JSON의 `runner.source`를 저장소 안의 ignored `.artifacts/n01-replay.mjs`로 추출한다. 저장된 `runner.sha256`과 추출 파일 해시를 비교한 다음 저장소 루트에서 실행한다. 경로는 실제 이 PR의 JSON 파일로 지정한다.

```powershell
$evidence = Get-Content -Encoding UTF8 -Raw 'docs/research/evidence/n01/exception-probes-2026-10-22T02-15-13.794Z.json' | ConvertFrom-Json
New-Item -ItemType Directory -Force .artifacts | Out-Null
[IO.File]::WriteAllText((Join-Path (Get-Location) '.artifacts/n01-replay.mjs'), $evidence.runner.source, [Text.UTF8Encoding]::new($false))
if ((Get-FileHash .artifacts/n01-replay.mjs -Algorithm SHA256).Hash.ToLowerInvariant() -ne $evidence.runner.sha256) { throw 'Runner hash mismatch' }
node .artifacts/n01-replay.mjs --smoke
node .artifacts/n01-replay.mjs
```

실행은 별도 timestamp 파일을 만든다. 과거 JSON을 출력 대상으로 지정하지 않는다. 재현 전 `npm ci`로 잠금 파일의 기존 의존성을 설치한다. 제품 소스 SHA가 다른 실행은 이전과 같은 측정으로 취급하지 않는다.

## Probe 결과
측정 완료: 2026-10-22T02:19:53.008Z. **760/760셀: returned 740, threw 20, timeout 0, infrastructure error 0.** 아래 숫자는 각 크기의 10개 recipe 중 반환/예외/timeout 건수다.

| 경로 | 10 MiB R/T/timeout | 20 MiB R/T/timeout | 예외 recipe |
|---|---|---|---|
| exact:0 | 10/0/0 | 10/0/0 | 없음 |
| exact:1 | 10/0/0 | 10/0/0 | 없음 |
| exact:2 | 10/0/0 | 10/0/0 | 없음 |
| exact:3 | 10/0/0 | 10/0/0 | 없음 |
| exact:4 | 10/0/0 | 10/0/0 | 없음 |
| exact:5 | 10/0/0 | 10/0/0 | 없음 |
| exact:6 | 10/0/0 | 10/0/0 | 없음 |
| exact:7 | 10/0/0 | 10/0/0 | 없음 |
| exact:8 | 10/0/0 | 10/0/0 | 없음 |
| exact:9 | 10/0/0 | 10/0/0 | 없음 |
| exact:10 | 10/0/0 | 10/0/0 | 없음 |
| exact:11 | 10/0/0 | 10/0/0 | 없음 |
| exact:12 | 10/0/0 | 10/0/0 | 없음 |
| exact:13 | 10/0/0 | 10/0/0 | 없음 |
| exact:14 | 10/0/0 | 10/0/0 | 없음 |
| exact:15 | 10/0/0 | 10/0/0 | 없음 |
| exact:16 | 10/0/0 | 10/0/0 | 없음 |
| exact:17 | 10/0/0 | 10/0/0 | 없음 |
| exact:18 | 10/0/0 | 10/0/0 | 없음 |
| exact:19 | 9/1/0 | 9/1/0 | id-dots |
| exact:20 | 10/0/0 | 10/0/0 | 없음 |
| exact:21 | 10/0/0 | 10/0/0 | 없음 |
| exact:22 | 10/0/0 | 10/0/0 | 없음 |
| exact:23 | 6/4/0 | 6/4/0 | hex, digits, upper-hex, decimal |
| exact:24 | 10/0/0 | 10/0/0 | 없음 |
| exact:25 | 10/0/0 | 10/0/0 | 없음 |
| exact:26 | 10/0/0 | 10/0/0 | 없음 |
| containsShellCommand | 10/0/0 | 10/0/0 | 없음 |
| containsTechnicalTokenShape | 10/0/0 | 10/0/0 | 없음 |
| hasTechnicalTokenShape | 10/0/0 | 10/0/0 | 없음 |
| hasCommandArgumentShape | 10/0/0 | 10/0/0 | 없음 |
| isShellCommandLine | 10/0/0 | 10/0/0 | 없음 |
| looksLikeCommandOrAssignment | 10/0/0 | 10/0/0 | 없음 |
| stripShellPunctuation | 10/0/0 | 10/0/0 | 없음 |
| isPositiveSemanticText | 10/0/0 | 10/0/0 | 없음 |
| isPositiveSemanticLine | 10/0/0 | 10/0/0 | 없음 |
| visual | 10/0/0 | 10/0/0 | 없음 |
| classifyContext | 5/5/0 | 5/5/0 | hex, digits, id-dots, upper-hex, decimal |

모든 예외의 name은 `RangeError`, message는 `Maximum call stack size exceeded`다. #19는 `id-dots`, #23은 `hex`, `digits`, `upper-hex`, `decimal`에서 두 크기 모두 throw했다. 전체 분류기도 이 다섯 recipe에서 두 크기 모두 throw했다. #26 숫자 정규식은 이번 모든 recipe에서 반환했다. 특히 `digits`의 마지막 `a`도 hex 문자이므로 이 recipe의 예외를 #26의 문제로 해석하지 않는다. 다른 경로의 반환은 이 입력 집합에 대한 관측이며 보편적인 예외 부재를 증명하지 않는다.


## D-1 — 수정 방식 선택(사용자 결정 대기)

| 선택 | 이점 | 비용·한계 | 의견 |
|---|---|---|---|
| (가) 확인된 예외 정규식을 선형 스캐너 helper로 치환 | 입력 상한·분류 계약을 유지하면서 원인을 제거 | 정규식 언어 동등성과 선형 작업량 근거, 단독 predicate/whole-result 차등 검증 필요 | 권장. 실제로 예외가 확인된 항목부터 한정한다 |
| (나) 입력 길이 상한 | 실행 자원을 단순하게 제한 | `classify_context` 계약 변경, UTF-8/UTF-16 단위·거부 형식·파일 색인 한도와 정합성 결정 필요 | 비권장. 이번 요구와 별도의 공개 계약 결정이다 |
| (다) 예외를 잡아 fail-closed | 요약 허용을 막는 최소 안전장치 | 원인·실행 비용은 그대로이고 정상 결과를 얻을 수 없는 입력이 남음 | 단독 해결책보다 D-2 보완책으로 권장 |

반환 동등성은 `(mode, ordered reasons, warnings, lossyCompressionAllowed)` 전체를 뜻한다. 이미 얻은 reason이 있다는 이유로 다음 predicate를 건너뛰거나, 텍스트를 자르거나, 검사 순서를 바꾸지 않는다.

## D-2 — (가)에 안전망을 함께 둘지(사용자 결정 대기)

- 권장: **함께 둔다**. 다만 모든 오류를 숨기는 catch-all은 피한다. 현재 관측된 stack-exhaustion `RangeError`를 대상으로 한 좁은 안전망을 `classifyContext` 경계에 둔다. 다른 오류는 재던진다. 정확한 예외 판별식과 아래 경고 문자열도 승인 범위에 포함한다.
- 제안 계약: `mode: "exact"`, `reasons: ["classification_resource_limit"]`, `warnings: ["lossy_compression_not_allowed", "classification_resource_limit"]`. 이 분기는 정상 exact 분류와 구별 가능해야 하고 raw content나 내부 stack을 응답/로그에 넣지 않는다. 정상 반환 경로의 기존 결과는 변경하지 않는다.
- 구현 구조 제안: 기존 본체를 private `classifyContextUnchecked(content)`로 옮기고 공개 함수가 호출을 감싼다. `error instanceof RangeError && error.message === "Maximum call stack size exceeded"`만 포착하는 안을 출발점으로 검토한다. 엔진별 메시지 차이·추가 RangeError 종류는 테스트와 별도 범위 판단 없이 포괄하지 않는다.
- 함께 두지 않는 선택은 결과·경고 확장을 최소화하지만, 미측정 입력이나 미래 engine 변경에서 같은 예외가 다시 외부로 나갈 수 있다.
- 어느 안전망도 무한/장시간 동기 실행을 중단하지 못하며 fatal OOM·프로세스 종료를 복구하지 못한다. 이번 probe의 20초 timeout은 측정 도구의 격리 기능이지 제품 기능이 아니다.

## 2단계 구현 계획 — 승인 후에만 실행

### 1. RED와 범위 고정

**Files:** 새 `tests/policy-large-input.test.ts`, 새 `tests/helpers/policy-large-input-child.mjs`. 기존 `tests/helpers/policy-test-loader.ts`는 필요한 private helper 접근만 확장하며 oracle 파일은 수정하지 않는다.

- [ ] 이 JSON에서 실제 `threw`인 경로·recipe·크기 조합을 회귀 fixture로 선택한다. child는 현재 `src/core/policy.ts`를 메모리에서 컴파일하고 JSON 한 줄로 반환/예외를 보고하며 부모가 20초 후 종료한다. UI 창을 띄우지 않는다.
- [ ] 기존 코드에서 10 MiB의 실제 RangeError를 기록한다. 실행 환경이 달라 재현되지 않으면 RED 성공으로 쓰지 말고 환경 차이를 조사한다. RED는 검증 코드 오류나 setup timeout이 아니라 대상 호출 예외여야 한다.
- [ ] 재현된 전체 분류기 조합에 다음 계약 테스트를 둔다. 실제 테스트 fixture는 원시 대형 문자열을 저장하지 않고 recipe와 byte length로 생성한다.

```ts
const result = runIsolatedClassifier({ recipe: "hex", utf8Bytes: 10 * 1024 * 1024, timeoutMs: 20_000 });
expect(result.status).toBe("returned"); // 현재 RED: threw RangeError
expect(result.classification).toHaveProperty("mode");
expect(result.classification.reasons).toEqual(expect.any(Array));
expect(result.classification.warnings).toEqual(expect.any(Array));
```

`runIsolatedClassifier`는 새 테스트의 test-only wrapper로 작성하며 `spawnSync`/metadata 검증 방식은 이 evidence의 runner를 따른다. 실제 GREEN 판정에서는 소형 동등 recipe/언어 분석으로 확정한 정확한 classification 기대값을 추가한다. 단순히 "안 던짐"만으로 언어 동등성을 주장하지 않는다.

### 2. D-1 (가) GREEN와 차등 증명

**Files:** `src/core/policy.ts`의 #19·#23 exact predicate와 필요한 내부 helper만; 위 새 테스트. #26은 이번 probe에서 예외가 없으므로 선제 재작성 범위에 넣지 않는다. 이름과 이유 배열의 삽입 순서를 유지한다. `src/core/types.ts`와 MCP 입력 schema 변경은 필요하지 않다.

- [ ] 각 후보 정규식의 문자 집합, 시작/끝 `\b`, `u`/`iu`, 줄 경계·구분자를 먼저 명세한다. 무제한 recursion/backtracking 없이 인덱스를 전진시키는 스캐너로 치환하고, 문자를 재방문하는 횟수의 상한으로 O(n) 작업량을 설명한다.
- [ ] #23의 예: ASCII word run을 한 번씩 읽어 길이≥32이며 전부 `[A-Fa-f0-9]`인 run인지 판정한다. `/u`의 word boundary를 보존해 마지막 `g`가 붙은 near-miss를 hex 양성으로 바꾸지 않는다. 비ASCII·astral·고립 surrogate 앞뒤 경계도 비교한다. 실제 관측이 다른 항목을 지목하면 해당 정규식의 별도 동등성 증명을 추가한다.
- [ ] #19는 `sha256|sha|hash|id` 앞의 `/iu` word boundary, optional whitespace, `:`/`=`, optional whitespace, 값 `[A-Za-z0-9._-]{4,}`와 끝 word boundary를 상태로 스캔한다. greedy 값 전체 끝뿐 아니라 길이≥4인 중간 prefix의 word boundary도 허용해야 한다(`id=abcd....`는 양성, `id=....`는 음성). 기존 `isWordBoundaryIu`·문자 분류 helper의 `ſ`/`K` folding을 재사용 가능 여부까지 대조한다. prefix 후보마다 같은 긴 whitespace/value를 반복 스캔하지 않는 작업량 근거를 제시한다.
- [ ] `tests/helpers/policy-baseline.ts`와 기존 120개 characterization fixture·`policy-corpus.ts`를 그대로 oracle로 사용한다. true/false 각 사례, 길이31/32/33, 시작/끝/중간 match, late-positive, 구분자 누락, mixed reason 순서를 포함한다.
- [ ] `[A-Za-z0-9_]`, hex/nonhex, `ſ`·`K`, Hangul, astral letter, 고립 surrogate, CR/LF/CRLF/U+2028/U+2029, U+3000·NBSP 등 대표 경계 클래스의 짧은 exhaustive 조합과 seeded 생성 입력을 비교한다. 소형 oracle도 위험한 조합은 child deadline으로 격리한다.
- [ ] 단독 predicate boolean과 전체 classification 객체를 모두 비교한다. oracle가 반환한 셀에서만 정확히 일치해야 한다. oracle의 throw/timeout 셀은 별도 분류하며 성공한 동등성 표본 수에 넣지 않는다. F-21 기존 false-positive도 보존한다.
- [ ] 대형 양성 hex, hex+nonword 끝, hex+word 끝, digits/decimal, word/path 및 이번 예외 recipe를 10·20 MiB에서 다시 측정한다. 기존 evidence는 보존하고 새 timestamp 결과를 만든다.

### 3. D-2와 호출 경로 검증(함께 두기로 승인한 경우)

**Files:** `src/core/policy.ts`, 새 large-input tests, `tests/core.test.ts`의 artifact 요약 테스트, 필요 시 새 `tests/policy-large-input-mcp.test.ts`. `src/core/artifacts.ts`와 `src/server/index.ts`는 먼저 기존 호출 경로 그대로 검증하고, 변경이 필요하면 승인 범위를 재검토한다.

- [ ] test-only 메모리 컴파일에서 private unchecked 함수 경계에 알려진 RangeError를 주입해 공개 wrapper의 제안 exact/reasons/warnings 결과를 정확히 검사한다. 프로덕션에 테스트 전용 injection API를 추가하지 않는다.
- [ ] 일반 `Error`, `TypeError`, 다른 메시지의 `RangeError`는 재던지는지 확인한다. 정상 unknown/visual/semantic/exact 결과와 `lossyCompressionAllowed`는 기존과 같아야 한다.
- [ ] 10 MiB 파일을 임시 허용 루트에 생성해 실제 `index_artifact`→`summarize_artifact` 경로를 실행한다. 해당 입력의 정상 기대 분류 또는 안전망 exact에 따라 빈 summary·`lossy_summary_blocked` 및 경고를 검사하고 cleanup을 보장한다.
- [ ] MCP `classify_context`의 10·20 MiB 요청이 transport/JSON 제한에 막히는지 별도로 확인하고, 제품 분류 성공과 transport 성공을 구분한다. 입력 상한을 새로 도입해 테스트를 통과시키지 않는다.

### 4. 성능·통합 gate

- [ ] Task 25 `large-current-2026-10-04T03-04-30.270Z.json`의 12개 recipe, 1/5/10 MiB, 셀당5회·소형 워밍업을 같은 Node/OS/CPU 조건에서 전후 재현한다. 시간 측정은 테스트/build와 동시에 실행하지 않는다.
- [ ] **10 MiB 기존 recipe별 중앙값은 기존 0.79–3.04초 수준보다 나빠지지 않는 것을 목표/통과 기준으로 둔다.** 가장 느린 3.04초 하나만 기준으로 삼아 빠른 recipe의 회귀를 숨기지 않는다. 동일 환경의 paired baseline과 역사적 recipe별 중앙값을 함께 보고한다. 노이즈나 환경 차이로 초과하면 임의로 기준을 완화하지 않고 원인·재측정 결과와 함께 사용자 판단을 받는다.
- [ ] 새 예외 recipe도 5회 중앙값 및 raw samples로 측정하고 20초 deadline 내 완료해야 한다. 20 MiB는 확장 관측으로 따로 보고한다. 이번 단회 probe는 이 성능 gate를 충족했다는 증거가 아니다.
- [ ] `npm test -- tests/policy-large-input.test.ts`, 기존 `tests/policy-characterization.test.ts`와 `tests/policy-redos*.test.ts`, core/integration 테스트, 전체 `npm test`, `npm run build`, `npm run typecheck`, `npm run smoke:mcp`, `npm run validate:plugin`, `git diff --check`를 수행한다. bundle은 기존 build로만 갱신한다.
- [ ] 변경과 evidence를 별도 구현 전달문의 범위로 commit/push/Draft PR에 반영하고 Claude 독립 검토·주 에이전트 최종 검토를 받는다. blocker/major가 남으면 완료로 보고하지 않는다. Ready·merge는 사용자 승인 후에만 한다.

## 사용자 결정 요청과 정지 조건

1. **D-1:** (가) 스캐너 / (나) 입력 상한 / (다) fail-closed 단독 중 선택. Codex 권장: (가).
2. **D-2:** (가)에 좁고 관측 가능한 RangeError 안전망을 함께 둘지 선택. Codex 권장: 함께 둔다. 제안 reason/warning 문자열과 예외 판별 범위도 검토 대상이다.

이 PR의 결과 보고 → Claude 계획 검토 → 사용자 D-1·D-2 결정 → 새 2단계 구현 전달문 순서로 진행한다. 이 문서만으로 구현을 시작하지 않는다.
