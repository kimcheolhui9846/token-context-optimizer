# WBS 6.4 (나) 테스트·스크립트 위생 사전 조사 (2026-10-26)

- 작성: Claude Code, 2026-10-26. 기준 main `7709837`
- 성격: 읽기 전용 조사다. 제품 코드·테스트는 고치지 않았다
- 목적: 6.4 (나)의 Codex 계획을 빨리 쓸 수 있도록 항목마다 현재 위치, 고치는 방법, 동작이 바뀌는지를 정리한다
- 대상(PR #66 §3 (나)): F-18, F-19, F-25, F-26, S-04(plan CLI), S-08, S-12, S-13
- Codex 순서(2026-10-25 사용자 결정): F-21 → 6.9 → 6.12a → 6.12b → 6.12c → **6.4 (나)** → 6.4b

## 1. 판정

- 8건 모두 아직 남아 있다. 위치는 PR #66 메모와 같고, 줄 번호만 일부 바뀌었다
- (나)는 "동작 변화 없음" 묶음이었다. 그런데 두 건은 그대로 고치면 동작이 바뀐다. 사용자 결정이 필요하다(§4)
  - **S-08:** 테스트가 검사하는 파서(`src/server/smoke-output-parser.ts`)와 스크립트가 실제로 쓰는 파서는 구현이 다르다. 하나로 합치면 어느 한쪽의 동작이 바뀐다
  - **S-12:** 세 CLI를 엄격한 UTF-8 디코딩으로 바꾸면, 깨진 UTF-8 입력을 지금은 받아들이는데 앞으로는 거부한다
- 나머지 6건은 동작을 바꾸지 않는다. 테스트 추가, 주석, export 범위, 테스트 전용 설정만 바뀐다
- **6.9와 겹치는 파일:** F-19와 S-08은 `scripts/smoke-mcp.mjs`·`scripts/verify-installed-plugin.mjs`를 고친다. S-08 테스트는 `tests/core.test.ts`에 있다. 6.9도 이 파일들을 고치거나 확인한다. 순서상 (나)는 6.9 뒤이므로 충돌은 없다. 계획은 6.9가 merge된 main에서 줄 번호를 다시 잡아야 한다
- 덧붙임: PR #66이 "해결, merge 뒤 닫기"로 판정한 S-03·S-05가 WBS에 아직 열려 있다. #66은 merge됐으므로 닫는다(Findings 상태만 바꾼다)

## 2. 항목별

### F-18 CLI 테스트가 프로젝트 전체를 tsc로 컴파일한다

- 위치: CLI 테스트 6개가 `beforeAll`에서 `tsc -p tsconfig.json --outDir <임시>/dist`를 부른다
  - `tests/research-dataset.test.ts:134`
  - `tests/research-pilot.test.ts:134`
  - `tests/research-scoring.test.ts:250`
  - `tests/research-exact-cli.test.ts:57-62`
  - `tests/research-mock-run-cli.test.ts:109-114`
  - `tests/research-run-plan-cli.test.ts:57-60`
- `tsconfig.json:14`의 include가 `src`·`tests`·`benchmarks`다. 그래서 테스트 파일 하나에 타입 오류가 있으면 CLI suite 6개가 함께 실패한다. 2026-10-26 F-21 재작업에서 실제로 일어났다
- CLI 스크립트가 쓰는 것은 `dist/src/research/*.js`뿐이다(`validate-dataset.mjs:2`, `audit-pilot.mjs:2`, `score-research.mjs:2`, `check-exact.mjs:2`, `mock-research.mjs:2`, `plan-research.mjs:2`)
- 권장 수정: `tsconfig.cli-test.json`을 새로 만든다
  - `tsconfig.json`을 extends하고 include를 `src/**/*.ts`로 줄인다
  - `rootDir: "."`를 그대로 두어 출력 경로 `dist/src/...`가 같게 한다
  - 6개 테스트가 이 설정을 쓴다
- 대안: vitest `globalSetup`에서 한 번만 컴파일해 공유한다. 속도는 더 낫지만 테스트 사이의 격리(각자 임시 dist)가 사라진다. 이번에는 권하지 않는다
- 동작: 바뀌지 않는다. 테스트가 컴파일하는 범위만 줄어든다. 테스트 파일의 타입 오류는 `npm run typecheck`가 계속 잡는다(F-18 절차: typecheck 먼저)
- 테스트: 새 설정이 `tests/`를 포함하지 않는지 확인하는 작은 검사. 6개 suite가 그대로 통과하는지

### F-19 smoke·verify가 realpath된 서버 경로를 정규화하지 않은 경로와 비교한다

- 위치
  - `scripts/smoke-mcp.mjs:29` `mkdtemp(join(tmpdir(), …))`(realpath 안 함) → `:39` `join(workspaceRoot, "artifact.txt")` → `:135` `payload.path !== workspaceFile`
  - `scripts/verify-installed-plugin.mjs:41`은 `physicalWorkspaceRoot`를 계산한다. 그러나 `:45` 파일 경로와 `:108` 비교는 여전히 `workspaceRoot`를 쓴다
- 영향: 임시 폴더 경로에 링크가 끼면(macOS `/var` → `/private/var`, Windows 8.3 짧은 이름) 서버가 돌려준 realpath와 문자열이 달라져 smoke가 실패한다. 이 PC에서는 드러나지 않는다
- 권장 수정: 비교 대상만 `realpath(workspaceFile)`로 바꾼다. 서버에 넘기는 경로는 그대로 둔다. 링크가 낀 경로가 서버에서 정규화되는 것도 계속 시험하기 위해서다
- 동작: 제품은 바뀌지 않는다. 스크립트의 비교만 바뀐다
- 6.9 주의: 6.9가 텍스트 결과의 `path`를 helper의 `canonicalPath`로 만든다면 이 비교가 더 중요해진다. 6.9 merge 뒤 줄 번호와 함께 다시 확인한다

### F-25 mock runner의 "슬롯 시작 전 run_timeout" 분기가 도달 불가다

- 위치: `src/research/mock-run.ts:37-40`
- 도달 불가인 까닭
  - 루프 시작 때 `elapsed = 0`이고 `runTimeoutMs`는 양수다(`mock-scenario.ts:11`)
  - 슬롯이 정상으로 끝나면 `durationMs < deadline ≤ remaining`이다(`:50-52`). 그래서 `elapsed`는 계속 `runTimeoutMs`보다 작다
  - 시간 초과가 나면 `:52-58`에서 바로 break한다
  - 따라서 `:37`의 조건은 참이 될 수 없다
- 권장 수정: 분기는 방어 코드로 남기고, 위 불변식을 주석으로 적는다. 지우면 나중에 루프가 바뀔 때 보호가 사라진다
- 대안: 분기를 지우고 불변식 테스트를 더한다. 출력 형식이 바뀌지 않으므로 이것도 동작 변화는 없다
- 동작: 바뀌지 않는다

### F-26 `budgetExceeded: true` 경로가 테스트되지 않았다

- 위치: `tests/research-mock-run.test.ts`의 단언 4곳(`:132`, `:333`, `:446`, `:530`)이 모두 `false`다
- 도달하는 경로: 예약이 남은 예산과 같고(`reservedCostMicrousd = spendCap - knownCost`, `:42` 통과), 정산 비용이 예약보다 크면 된다(`:71-74`). 이때 `knownCost`가 상한을 넘은 채 `reservation_exceeded`로 멈춘다
  - 예: 상한 100, 슬롯 1개, 예약 100, 정산 101
  - 기대: `stopReason: "reservation_exceeded"`, `budgetExceeded: true`, `knownSettledCostMicrousd: 101`, `remainingBudgetMicrousd: 0`(`Math.max(0, …)`)
- 확인 방법: 코드 읽기로 확인했다. 스키마(`mock-scenario.ts:19-21`)는 정산 비용이 예약보다 큰 것을 막지 않는다. 실행 확인은 계획의 RED 단계에서 한다
- 권장 수정: 위 시나리오 테스트 하나를 더한다
- 동작: 바뀌지 않는다

### S-04 plan CLI의 BOM 거부가 테스트·문서에 없다

- 위치: `scripts/plan-research.mjs:10`은 `TextDecoder(fatal, ignoreBOM: true)`로 BOM을 남긴다. 그래서 JSON 파서가 거부하고 `invalid_input`이 된다. 하지만
  - `tests/research-run-plan-cli.test.ts`에 BOM 사례가 없다
  - `docs/research/run-planning.md:14-15`는 "fatal UTF-8 decoding"만 적고 BOM을 말하지 않는다
- 이미 된 곳(같은 방식으로 맞춘다)
  - exact CLI: `tests/research-exact-cli.test.ts:215`, `docs/research/exact-checks.md:75`
  - mock CLI: `tests/research-mock-run-cli.test.ts:241`, `docs/research/mock-running.md:24`
- 권장 수정: dataset·configuration 각각에 BOM을 붙인 입력이 `invalid_input`인지 보는 테스트를 더한다. 문서에 "BOM은 정규화하지 않고 거부한다" 한 문장을 더한다
- 동작: 바뀌지 않는다

### S-08 smoke 출력 파서가 세 벌이고, 테스트는 실제로 쓰이지 않는 쪽을 검사한다

- 위치
  - `src/server/smoke-output-parser.ts:6` — `tests/core.test.ts:31`에서만 import된다(테스트 `:3470`, `:3494`)
  - `scripts/smoke-mcp.mjs:402`와 `scripts/verify-installed-plugin.mjs:460` — 두 스크립트가 같은 함수를 각자 정의한다. 두 사본은 줄 단위로 같다
- **두 구현은 동작이 다르다**

  | 측면 | 스크립트 사본(실제 사용) | `src/server/smoke-output-parser.ts`(테스트 대상) |
  |---|---|---|
  | 공백만 있는 줄 | `trim()` 뒤 건너뛴다 | 빈 문자열만 건너뛴다. 공백 줄은 JSON 오류다 |
  | 앞뒤 공백 | `trim()`한 뒤 파싱한다 | 그대로 파싱한다(JSON.parse가 앞뒤 공백을 허용하므로 결과는 같다) |
  | `consumedLines`의 기준 | 빈 줄을 포함한 줄 번호 | 빈 줄을 뺀 개수 |
  | 줄바꿈 없이 `\r`로 끝난 버퍼 | 마지막 줄을 미완성으로 본다 | 완성으로 본다 |

  - 두 함수를 그대로 옮겨 같은 입력에 돌렸다(scratch, 2026-10-26)
    - 공백만 있는 줄(`{"a":1}\n   \n{"b":2}\n`): 스크립트는 두 메시지·`consumedLines` 3, TS는 `Malformed MCP stdout line` 예외
    - 빈 줄(`{"a":1}\n\n{"b":2}\n`): 메시지는 같고 `consumedLines`가 3 대 2
    - 줄바꿈 없이 `\r`로 끝남(`{"a":1}\r`): 스크립트는 미완성 줄로 보아 메시지 0개, TS는 완성으로 보아 1개. `split(/\r?\n/u)`는 단독 `\r`에서 나누지 않는다
    - 마지막 줄 미완성: 둘이 같다
  - 스크립트 사본의 `completeLineCount`는 삼항식 두 갈래가 같은 값(`lines.length - 1`)이다. 결과는 맞지만 읽기 어렵다
- 권장 수정: 스크립트 사본의 동작을 기준으로 하나로 합친다. 실제 smoke·verify가 쓰는 쪽이기 때문이다
  - 공유 위치: `scripts/plugin-runtime.mjs`(두 스크립트가 이미 import한다)
  - `tests/core.test.ts`의 두 테스트는 공유 함수를 import하게 바꾼다. 기대값이 위 표의 차이 때문에 달라지면 그 차이를 테스트 이름에 적는다
  - `src/server/smoke-output-parser.ts`는 지운다. 제품 서버는 이 파일을 쓰지 않는다
  - 확인할 것: `plugin-runtime.mjs`가 설치본 `RUNTIME_FILES`(`:5-10`)에 들지 않는지. 설치 경로에 영향이 없어야 한다
- 동작: 스크립트는 바뀌지 않는다. 테스트가 검사하는 대상이 실제 구현으로 바뀐다. **결정 S-8**(§4)

### S-12 세 연구 CLI가 깨진 UTF-8을 조용히 바꿔 읽는다

- 위치: `readFile(path, "utf8")`을 쓴다. 깨진 바이트가 U+FFFD로 바뀐 채 처리된다
  - `scripts/score-research.mjs:8-9`
  - `scripts/validate-dataset.mjs:10`
  - `scripts/audit-pilot.mjs:8`
- 이미 엄격한 곳: `check-exact.mjs:19`, `plan-research.mjs:10`, `mock-research.mjs:8`(`TextDecoder` fatal, `ignoreBOM: true`)
- BOM: Node의 `readFile(…, "utf8")`도 BOM을 지우지 않는다. 그래서 바꿔도 BOM 동작은 같다
- 권장 수정: 세 CLI도 같은 디코더를 쓴다. 깨진 UTF-8은 각 CLI의 기존 입력 오류 코드로 거부한다(`validate-dataset`은 `read_error`와 `invalid_json` 가운데 하나를 정해야 한다)
- 동작: **바뀐다.** 지금은 받아들이던 깨진 UTF-8 입력을 거부한다. 저장소의 연구 데이터는 모두 정상 UTF-8이라 실제 결과는 같을 것으로 본다. 단, 확인은 계획 단계에서 한다. **결정 S-12**(§4)
- 테스트: 세 CLI에 깨진 UTF-8 사례를 하나씩 더한다

### S-13 `classifyOutcome`이 필요 없이 export된다

- 위치: `src/research/evaluation-core.ts:40`. 같은 파일 `:87`에서만 쓴다. `src`·`scripts`·`tests`·`benchmarks` 어디에서도 import하지 않는다
- `package.json`에 `main`·`exports`가 없어 공개 API가 아니다
- 권장 수정: `export`를 지운다
- 동작: 바뀌지 않는다

## 3. 묶음과 순서

- 한 PR로 묶을 수 있다(PR #66 판단과 같다). 크기는 M이다
- 커밋은 항목마다 나눈다. S-08·S-12는 결정에 따라 빠질 수 있으므로 따로 둔다
- 시작 조건: 6.9 merge 뒤. F-19·S-08이 6.9가 손대는 스크립트와 `tests/core.test.ts`를 고친다
- 검증: typecheck → 대상 테스트 → 전체 테스트 → build·smoke·validate·verify(설치본 검증은 F-19 대상이다)·diff-check
- 성능 게이트는 필요 없다. 실행 경로의 동작이 바뀌지 않는다. F-18로 테스트 시간이 줄 수 있지만 주장하지 않는다

## 4. 결정 필요

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| S-8 | 파서를 어느 동작으로 합치나 | (가) 스크립트 사본 동작으로 합치고 테스트를 그쪽에 맞춘다 / (나) TS 사본 동작으로 합쳐 스크립트 동작을 바꾼다 / (다) 합치지 않고 두 스크립트 사본만 공유하며, TS 사본은 지운다 | (가). 실제로 쓰는 동작을 테스트한다. (다)와 결과는 같지만, 테스트를 남기는 쪽이 낫다 |
| S-12 | 깨진 UTF-8을 거부하도록 바꾸나 | (가) 바꾼다(동작 변화를 (나)에 넣고 PR에 명시) / (나) 6.4b로 옮긴다 / (다) 바꾸지 않고 문서에 현재 동작을 적는다 | (가). 나머지 세 CLI와 같아지고, 저장소 데이터에는 영향이 없을 것이다. 계획에서 기존 데이터 전부가 통과하는지 먼저 확인한다 |

## 5. 범위 밖

- 6.4b (다) 항목(F-23, F-24, S-06, S-07, S-09, S-10, S-11, N-03): 출력이나 수치가 바뀔 수 있어 따로 한다
- 테스트 시간 측정: F-18의 효과를 수치로 주장하지 않는다

## 6. 교차 확인
- `gemini-4-argon`: APPROVE, [Nit] 1건(S-08 실측 예시의 \r·\n이 글자가 아니라 실제 제어 문자로 들어가 깨짐) → 글자로 고쳤다. 단독 \r은 줄을 나누지 않는다는 점도 적었다 → `codex_review/argon/2026-10-26_hygiene-survey-argon.md`
  - Argon이 확인 불가로 남긴 나머지 CLI 테스트 줄 번호, `package.json`의 `main`·`exports` 부재, BOM 테스트 위치는 Claude가 원문에서 확인했다
