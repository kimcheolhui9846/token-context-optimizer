# 남은 dev 경고 3건 조사와 vitest 4.1.12 승인안 (구현 전)

- 상위 기록: [packaging-security-remediation.md](packaging-security-remediation.md). PR #116. 2026-11-13 Claude Code(claude-opus-5-5), coordinator 요청 task_de906cd2867d.
- 이 문서는 조사와 제안만 담는다. 이 PR은 vitest를 바꾸지 않았다. 새 의존성 설치·major 적용은 승인 뒤 별도 Task에서 한다.
- 판정 근거는 공식 advisory(GitHub Advisory DB, `gh api advisories/<id>`), npm registry metadata, 설치된 vitest 3.2.7 소스, vitest 4.1.12 npm tarball, scratch 사본의 lock-only 해석이다. vitest 4는 실행하지 않았다.

## 1. 남은 경고 (사후 `npm audit`, 전체 3 / `--omit=dev` 0)
| 패키지(설치) | advisory | 취약 범위 → 수정 | 공식 노출 조건 요약 |
|---|---|---|---|
| vitest 3.2.7, @vitest/mocker 3.2.7 | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) moderate, CVSS 3.1 5.9 | `>=2.1.0 <4.1.11` → vitest·mocker 4.1.11 | `mockerPlugin`/`interceptorPlugin`가 Vite HMR WebSocket에 등록한 `vitest:interceptor:register`에 닿는 클라이언트가 redirect mock으로 로컬 파일을 읽는다. dev server는 기본 localhost bind. 원문은 "3.x는 수정 계획 없음"이라고 적는다 |
| @vitest/mocker 3.2.7 | [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) moderate, CVSS 3.1 4.7 | `>=2.1.0-beta.7 <4.1.12` → 4.1.12(5.x는 5.0.3) | 같은 핸들러의 manual 분기에서 코드 주입. 결과 코드는 개발자 브라우저에서 실행된다 |
| tinypool 1.1.1(vitest 3 경유) | [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) critical, CVSS 4.0 9.5 | `<=2.1.0` → 2.1.1 | 같은 프로세스에서 `Object.prototype.execArgv`/`env` 등을 오염시키는 primitive가 따로 있어야 한다 |
| 〃 | [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) critical | `<2.1.2` → 2.1.2 | `Object.prototype.filename` 오염 + caller가 `pool.run(task, options)`에 자기 options 객체를 넘길 때 |

## 2. 이 저장소에서의 실행 경로 (설치된 vitest 3.2.7 소스 대조)
- 실행 방식: `npm test` = `vitest run`. `vitest.config.ts`는 `test.exclude`만 설정한다(browser·api·ui·pool 설정 없음). `@vitest/browser`·`@vitest/ui`는 설치되어 있지 않다. 저장소에 CI 설정(`.github` 등)은 없다.
- mocker 두 건
  - vitest node 쪽은 `@vitest/mocker/node`에서 `hoistMocksPlugin`, `automockPlugin`만 import한다(`node_modules/vitest/dist/chunks/cli-api.DVe0nWUx.js:43`). 취약 핸들러가 있는 `interceptorPlugin`(`node_modules/@vitest/mocker/dist/node.js:1041,1083`)은 이 경로에서 쓰지 않는다.
  - `--api`/`--ui`가 없으면 api 설정은 `{ middlewareMode: true }`로 해석된다(`coverage.DfSpMS-b.js:3517-3533`, 기본 `api: false`는 `defaults.B7q_naMc.js:97`). 그러면 Vite server는 `ws: false`이다(`cli-api…js:10090-10096`, project server는 `:6789-6795`). `listen()`은 `api.port`가 있을 때만 호출된다(`:10213`).
  - 따라서 기본 `vitest run`에서는 WebSocket 등록 경로가 열리지 않는다고 판단한다. 소스를 읽어 내린 판단이고, 포트 스캔 같은 실행 검증은 하지 않았다. `--ui`/`--api`나 browser mode를 쓰면 이 판단은 성립하지 않는다.
- tinypool 두 건
  - 기본 pool은 `forks`(`defaults…js:83`). vitest는 `execArgv`, `env`, `filename`을 options의 own property로 넘긴다(`coverage…js:2608-2632`). 5gmw가 예로 든 `execArgv`·`env` 경로는 own property가 이긴다. `argv`·`resourceLimits` 같은 다른 키는 확인하지 않았다.
  - vitest는 `pool.run(data, { name, channel })`처럼 자기 options 객체를 넘긴다(`coverage…js:2652`). 85c8의 구조적 전제는 충족되며, 메인 프로세스의 `Object.prototype.filename` 오염이 따로 필요하다.
  - 테스트 코드는 fork된 자식 프로세스에서 돈다. 메인 프로세스는 vitest·vite·`vitest.config.ts`를 로드한다. 메인에서 오염 primitive가 생기는지는 증명하지 않았다.
- 결론: 현재 실행 방식에서 원격·무인증 경로는 확인되지 않는다. tinypool 두 건은 공급망에서 다른 오염 primitive가 생길 때의 증폭 경로라 "도달 불가"로 단정하지 않는다.

## 3. 후보 vitest 4.1.12 근거
- npm: 4.1.12, published 2026-10-15T14:51:24Z, integrity `sha512-5eWdz2yb…NiWA==`, registry signature 1개, SLSA provenance v1 attestation 있음. engines `^20.0.0 || ^22.0.0 || >=24.0.0`. peer vite `^6 || ^7 || ^8`, @types/node `^20 || ^22 || >=24`. 의존 `@vitest/mocker` 4.1.12. tinypool 의존 없음.
- [릴리스 v4.1.12](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12): "mocker: Harden manual and redirect mocks [backport to v4]". qxg6 원문도 "backported to 4.1.12"라고 적는다. 82fw는 4.1.11에서 수정되었다.
- [migration 문서(태그 v4.1.12)](https://github.com/vitest-dev/vitest/blob/v4.1.12/docs/guide/migration.md) "Pool Rework": "In Vitest v4 we've completely removed Tinypool".
- scratch lock-only 해석(`npm install --package-lock-only --ignore-scripts`, 저장소는 건드리지 않음)
  - 범위만 `^4.1.12`로 바꾸면 npm이 vite를 **8.3.8**(rolldown)로 올리고 `@emnapi/core 2.0.0-beta.2` 같은 beta를 포함해 약 40개 패키지를 추가한다. 쓰지 않는다.
  - vite 7.3.7을 유지한 최소안: vitest와 `@vitest/*` 7개가 4.1.12, chai 6.3.0, es-module-lexer 2.3.2, std-env 4.3.0, tinyexec 1.3.1, tinyrainbow 3.2.0, sourcemap-codec 1.6.0. 추가 3개(@standard-schema/spec, convert-source-map, obug), 제거 12개(tinypool, vite-node, tinyspy, cac, check-error, debug, deep-eql, js-tokens, loupe, ms, pathval, strip-literal). **audit 전체 0 / `--omit=dev` 0**. runtime 의존성 변화 0.
- Node 호환
  - 저장소 `engines.node >=22.0.0`은 배포 서버(runtime) 기준이다. 현재도 dev 도구인 vite 7.3.7의 engines가 `^20.19.0 || >=22.12.0`이므로, **Node 22.0~22.11은 이미 dev/test 도구의 선언 지원 범위 밖**이다. vitest 4.1.12(+vite 7.3.7)로 바뀌어도 이 하한은 같다.
  - 새 제약: vitest 4.1.12 engines가 23.x를 뺀다(3.2.7은 `>=22.0.0`). 23은 EOL 홀수 버전이다.
  - 4.1.12 dist 정적 검사에서는 22.0 미지원 API를 무조건 호출하는 곳을 찾지 못했다(`module.registerHooks`는 존재 여부를 확인한 뒤 호출). 22.0~22.11 실제 실행은 하지 않았다.

## 4. migration 항목과 이 저장소 대조
| 항목 | 이 저장소 | 예상 영향 |
|---|---|---|
| 기본 exclude 축소(v3에는 `**/dist/**` 등이 있었고 v4는 `node_modules`, `.git`만) | `tsc -p tsconfig.json`이 `tests/`를 `dist/tests/`로 컴파일한다. build 뒤 `dist/tests/*.test.js` 52개 | **설정 수정 필요.** 그대로 두면 컴파일 사본까지 수집될 것으로 예상한다. `vitest.config.ts`에 `"**/dist/**"`를 다시 넣거나 `test.dir: "tests"` |
| `vi.restoreAllMocks`가 `vi.spyOn` spy만 복원 | 5개 파일 afterEach에서 사용. `vi.mock` factory 안의 `vi.fn(actual.decode)`에 `mockReturnValueOnce`를 쓰는 곳 1곳(`image-crop.test.ts:88`) | 정상 경로는 once 값을 소비하므로 영향이 없을 것으로 예상한다. 실패 시 누수 가능성이 있어 회귀 실행으로 확인한다 |
| `spyOn`/`fn` constructor 지원, `getMockName`, `invocationCallOrder`, `settledResults` | 사용 0(grep) | 없음 예상 |
| test/describe 세 번째 인자 options 객체 제거 | 해당 패턴 0(grep) | 없음 예상 |
| `poolOptions`·`workspace`·`deps.*`·coverage 옵션 | 미사용 | 없음 |
| `vitest/globals` 타입(tsconfig `types`) | 4.1.12 tarball에 `globals.d.ts`·`./globals` export 있음 | 없음 예상, typecheck로 확인 |
| vite-node → Module Runner | `vi.mock`(2), `vi.doMock`(13), `vi.importActual`(11), `vi.resetModules`(17) | 모듈 mock 해석 차이 가능성. 회귀 실행으로 확인 |

## 5. 승인안
- **안 A(권장): vitest `^4.1.12`, vite 7.3.7 유지.**
  - 예상 변경 파일: `package.json`(devDependencies vitest), `package-lock.json`, `vitest.config.ts`(dist 제외), 필요 시 회귀가 드러난 테스트의 최소 수정.
  - lock은 위 최소안과 같게 만든다. vite가 8로 올라가면 되돌린다.
  - RED·GREEN 순서
    1. 현재 3.2.7에서 전체 test 수와 파일 수를 기록한다(4367 pass/5 skip, 52 files).
    2. `npm audit` dev 3건을 RED로 기록한다.
    3. 4.1.12로 올린 뒤 dist 제외 없이 실행해 수집 파일 수 증가(이중 수집)를 RED로 기록한다.
    4. 설정을 고쳐 52 files·같은 test 수로 GREEN.
    5. audit 0을 확인하고 전체 7단계 gate.
  - 실패하는 테스트는 원인별로 기록하고 단언을 약화하지 않는다.
- 안 B: vitest 5.1.0. audit 도구가 제시한 버전이다. engines `^22.12.0 || ^24 || >=26`이라 4.1.12보다 변화가 크다. A가 막힐 때만 쓴다.
- 안 C: 현행 유지와 위험 수용. 근거는 2절의 노출 조건이다. 단, 원문상 3.x 수정 계획이 없으므로 기한을 정한 임시 조치로만 쓴다.
- 기각: `overrides`로 vitest 3에 tinypool 2.1.2나 @vitest/mocker 4.1.12를 강제하는 방법. vitest 3.2.7은 `tinypool ^1.1.1`과 mocker 3.2.7 고정을 선언하고 있어 지원 범위 밖이다(실행 검증은 안 함).
- 잔여 위험(A 적용 뒤)
  - 모듈 mock·pool 재작성으로 테스트 동작이 바뀔 수 있다.
  - vite 7 계열 dev server advisory가 새로 나오면 다시 대응해야 한다.
  - Node 22.0~22.11·23.x 개발 환경은 계속 선언 범위 밖이다.
  - 버전을 올려도 보편적 안전을 보증하지 않는다.

## 6. `fromJSONSchema` 테스트 helper의 의미 보존 근거
- 대상: tools/list가 실제로 광고하는 스키마에서 `type:"object"`+`anyOf` 노드 3개 전부(index·inspect 4 variants, crop 3 variants. 모두 최상위이고 바깥 키는 `type`, `$schema`, `anyOf`뿐).
- 판정기 4개
  - ajv 8.18.0 Draft 2020-12(독립 구현, scratch에만 설치)
  - zod 4.4.3 원본 변환
  - zod 4.6.6 원본 변환
  - 저장소 helper(zod 4.6.6 + 중복 `type` 제거)
- 결과(48 사례)
  - ajv = 기대값 48/48, helper = ajv 48/48, zod 4.4.3 원본 = ajv 48/48.
  - zod 4.6.6 원본은 11건에서 ajv와 다르다. 11건 모두 거부해야 할 추가 필드 혼입을 통과시킨 경우다(다른 variant 필드 혼입, 알 수 없는 키, crop의 다른 status 필드).
  - 정상 레코드, 필수 누락, 타입·const 오류, 비객체(string·array·null)는 네 판정기가 모두 같다.
- 지원하지 않는 형태 6개는 helper가 모두 거부(throw)했다.
  - variant가 object가 아님
  - variant에 `type`이 없음
  - 형제 `properties`·`required`·`additionalProperties`
  - properties 안에 중첩된 비object variant
- 스크립트·원자료는 메인 `codex_review/packaging-security-2026-11-13/oracle/`에 있다. 이 truth table은 저장소 테스트로 추가하지 않았다(구현 변경 없음 지시).
