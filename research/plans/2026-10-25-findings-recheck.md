# 남은 무관 Findings의 main 잔존 재확인 (WBS 6.11)

- 작성: Claude Code, 2026-10-25. 기준 main `6e308c9`
- 성격: 읽기 전용 조사. 코드·테스트·문서는 고치지 않았다
- 대상
  - WBS 6.11 목록: F-18, F-19, F-23–F-26, F-36, S-02, S-04–S-13, N-03
  - 함께 확인한 것: 같은 6.4 묶음의 F-20·F-22·S-03
- 원래 지적: `codex_review/codex_review_feedback_2026-09-27.md` §F-18–F-36, §S-02–S-13(git 제외 폴더). N-03은 PR #26 characterization
- 판정 기준
  - **남음**: 지적한 코드·문서가 그대로다
  - **부분**: 일부만 고쳐졌다
  - **해결**: 지적이 더는 성립하지 않는다

## 1. 요약

| 판정 | 건수 | ID |
|---|---:|---|
| 해결 | 2 | S-03, S-05 |
| 부분 | 4 | F-20, F-24, F-36, S-04 |
| 남음 | 16 | F-18, F-19, F-22, F-23, F-25, F-26, S-02, S-06–S-13, N-03 |

- 논문 영향은 없다. 모두 텍스트 MVP·연구 CLI·벤치마크·스크립트 쪽이고, 논문 수치를 만든 실험 하네스(`research/`)와는 다른 경로다
- 권장: 해결 2건은 닫는다. 남은 20건(부분 4, 남음 16)은 §3처럼 세 묶음으로 나눠 6.4를 다시 정한다

## 2. 항목별 근거

| ID | 지적 요약 | main 확인 | 판정 |
|---|---|---|---|
| F-18 | CLI 테스트 `beforeAll`이 프로젝트 전체를 tsc로 컴파일 | `tests/research-{dataset,pilot,scoring,exact-cli}.test.ts`가 그대로 `tsc -p tsconfig.json`을 부른다(예: `research-dataset.test.ts:134`). `tsconfig.json:14` include에 `tests/**/*.ts`가 있다. `tsconfig.scripts.json`은 scripts 타입 검사용이고 이 테스트들은 쓰지 않는다 | 남음 |
| F-19 | smoke/verify가 realpath된 서버 경로를 비정규 경로와 문자열 비교 | `scripts/smoke-mcp.mjs:29` `mkdtemp(join(tmpdir(), …))`(realpath 안 함) → `:39` `join(workspaceRoot, …)` → `:135` `payload.path !== workspaceFile`. `verify-installed-plugin.mjs:41`은 `physicalWorkspaceRoot`를 계산하지만 `:45`·`:108`은 여전히 `workspaceRoot`를 쓴다 | 남음 |
| F-20 | 허용 루트 하나라도 없으면 전체 색인 실패 | 텍스트: `src/core/artifacts.ts:485-487` `Promise.all(realpath)` 그대로. 이미지: `src/core/image-artifacts.ts:113-115`는 실패한 루트를 `null`로 걸러 해결됐다. 원래 지적의 두 번째 부분(환경 변수가 없을 때 명시적 오류가 없음)은 텍스트에 그대로다. `src/server/index.ts:259-262`가 빈 목록을 만들고 `artifacts.ts:490` "outside allowed roots"로 끝난다. 이미지는 `image-artifacts.ts:108`에서 `path_denied`다 | 부분 |
| F-22 | `isPathInside`가 `..notes.txt`를 루트 밖으로 오판 | `src/core/artifacts.ts:504-507` `!relation.startsWith("..")` 그대로 | 남음 |
| F-23 | "numeric threshold preservation" 픽스처에 숫자가 없음 | `benchmarks/run.ts:244-246` 이름과 "one thousand milliseconds" 그대로 | 남음 |
| F-24 | latency 통계 정의 문서 누락, 1000 ms 게이트가 느슨 | `docs/benchmarks.md:24`가 median과 p95를 언급하지만 nearest-rank·lower median 정의는 없다. `benchmarks/run.ts:68` `MAXIMUM_SCENARIO_LATENCY_MS = 1000` 그대로 | 부분 |
| F-25 | mock runner의 "슬롯 전 run_timeout" 분기가 도달 불가 | `src/research/mock-run.ts:37-40` 분기 그대로. 코드·스펙에 "불변식상 도달 불가" 표시가 없다(스펙 `:65`의 "unreachable outcomes"는 다른 내용) | 남음 |
| F-26 | `budgetExceeded: true` 경로 미테스트 | `tests/research-mock-run.test.ts`의 단언 4곳(`:132`, `:333`, `:446`, `:530`)이 모두 `false`다 | 남음 |
| F-36 | HANDOFF의 외부 교차검토 기록 반복 | `docs/agent/HANDOFF.md`는 1,148줄이고 DEGRADED 0회다. Task별 기록은 `docs/agent/handoffs/`(30개)로 나뉘었다. 과거 기록 task-19·20·21에는 DEGRADED가 11·10·9회 남아 있다. 최근 Task는 라우팅을 한 문단으로 적는다 | 부분(현행 관행은 개선, 과거 기록은 보존 대상이라 고치지 않음) |
| S-02 | 허용 루트 검사 전 realpath로 루트 밖 경로의 존재 여부가 노출됨 | 이미지: `image-artifacts.ts:111-112`가 루트 검사 전에 realpath한다. 없는 경로는 `read_failure`, 루트 밖의 있는 경로는 `path_denied`(`:116`)라 구분된다. 텍스트: `artifacts.ts:484`가 먼저 realpath한다. 없는 경로는 ENOENT, 있는 경로는 `File is outside allowed roots: <절대 경로>`(`:490`)라 구분되고 경로도 응답에 나온다 | 남음 |
| S-03 | jpeg-js 실효 상한(약 6.4 MP) 문서화 | `src/core/jpeg-validation.ts:91-92`가 `maxMemoryUsageInMB: 128`, `maxResolutionInMP: 16.777216`을 명시한다. 상한과 메모리 추정식은 `docs/image-artifacts.md:49-51,66-71`에 있다. 기본값에 기대던 실효 상한 문제는 명시적 상한으로 바뀌었다 | 해결 |
| S-04 | BOM 붙은 JSON 거부의 테스트·문서 | exact CLI(`tests/research-exact-cli.test.ts:215`, `docs/research/exact-checks.md:75`)와 mock CLI(`tests/research-mock-run-cli.test.ts:241`, `docs/research/mock-running.md:24`)는 됐다. 원래 위치인 plan CLI는 `scripts/plan-research.mjs:10`이 `ignoreBOM: true`로 BOM을 남겨 거부하지만, `tests/research-run-plan-cli.test.ts`에 BOM 테스트가 없고 문서에도 없다 | 부분 |
| S-05 | 연구 CLI 1 MiB 입력 상한 문서화 | `docs/research/dataset-format.md:67`, `docs/research/exact-checks.md:78`에 1,048,576을 적었다. 단위를 "characters"로 썼지만 코드(`scripts/plugin-runtime.mjs:236-238`)는 UTF-16 코드 유닛 길이다. 차이는 nit | 해결 |
| S-06 | semantic latency가 4개 픽스처의 max | `benchmarks/run.ts:385` `Math.max(...)` 그대로, suite 합계 보고 없음. `docs/benchmarks.md:24`가 "maximum single-fixture"라고 밝힌다 | 남음(문서화로 오해는 없음) |
| S-07 | 리포트에 commit SHA·Node·OS 없음 | `benchmarks/run.ts`에 `process.version`·`platform`·commit 기록이 없다 | 남음 |
| S-08 | smoke 파서 중복 | `src/server/smoke-output-parser.ts`는 `tests/core.test.ts:31`에서만 import된다. `scripts/smoke-mcp.mjs:402`와 `verify-installed-plugin.mjs:460`이 각자 `parseCompleteJsonMessages`를 따로 정의한다 | 남음 |
| S-09 | CJK 범위에 가나 없고 한글 끝부분 빠짐 | `src/core/token-estimator.ts:10` `/[\u3131-\uD79D]/u` 그대로. 히라가나·가타카나(U+3040–30FF)와 한글 음절 끝(U+D79E–D7A3)이 빠진다 | 남음 |
| S-10 | `MemoryArtifactStore` 무제한 증가, `trimToTokenBudget` 미사용 | `src/core/artifacts.ts:14-24` 상한 없는 `Map`. `trimToTokenBudget`(`:396`)은 정의만 있고 호출이 없다 | 남음 |
| S-11 | `totalCostUsd`가 원장 순서에 의존 | `src/research/evaluation-core.ts:85` 부동소수 누적 `cost += run.costUsd` 그대로, 문서 언급 없음 | 남음 |
| S-12 | 비치명적 UTF-8 디코딩 | `scripts/score-research.mjs:8-9`, `validate-dataset.mjs:10`, `audit-pilot.mjs:8`이 `readFile(…, "utf8")`이다. `check-exact.mjs:19`와 `plan-research.mjs:10`만 `TextDecoder(fatal)`이다 | 남음 |
| S-13 | `classifyOutcome` export 범위 | `src/research/evaluation-core.ts:40` export 그대로. 같은 파일 밖에서 쓰는 곳이 없다 | 남음 |
| N-03 | 요약기가 앞 6줄 이후 내용을 놓침 | `src/core/artifacts.ts:295` `artifact.sourceMap.slice(0, 6)` 그대로 | 남음 |

## 3. 권장 묶음 (6.4 재정의안, 사용자 결정)

| 묶음 | 항목 | 성격 | 크기 |
|---|---|---|---|
| (가) 허용 루트·경로 안전 | F-20(텍스트), F-22, S-02 | 텍스트 도구는 실패 루트 무시와 빈 허용 목록 오류를 이미지 도구 방식에 맞춘다. S-02의 존재 여부 노출은 **텍스트와 이미지 둘 다** 남아 있으므로, 두 도구 모두 루트 밖이면 경로 존재와 무관하게 `path_denied`로 통일하고 응답에 경로를 싣지 않는다. 이미 6.9가 F-20·F-22를 다룬다. S-02를 6.9에 더하기를 권한다 | M |
| (나) 테스트·스크립트 위생 | F-18, F-19, F-25, F-26, S-04(plan CLI), S-08, S-12, S-13 | 동작은 같고 테스트·스크립트만 정리한다. 한 PR로 묶을 수 있다 | M |
| (다) 벤치마크·추정기·요약기 | F-23, F-24, S-06, S-07, S-09, S-10, S-11, N-03 | 출력이나 수치가 바뀔 수 있다(S-09 토큰 추정, N-03 요약 내용, S-10 저장소 정책). characterization 테스트를 먼저 바꿔야 해서 각각 작은 계획이 필요하다 | L |

- 우선순위 제안: (가) > (나) > (다)
  - (가)는 안전 경계다
  - (나)는 위험이 낮다
  - (다)는 텍스트 트랙이 보류 중이므로 그대로 보류할 수 있다
- 해결로 닫는 것: S-03, S-05(S-05의 "characters" 단위 nit는 6.10 문서 nit 묶음에 넣을 수 있다)
- F-36(부분)도 닫기를 권한다. 현행 기록 방식은 권장 수정대로 바뀌었고, 남은 반복은 과거 Task 기록이다. 기록을 보존하기 위해 고치지 않는다

## 4. 교차 확인
- `gemini-4-argon` 1회: APPROVE, 지적 2건. Claude가 확인하고 모두 반영했다
  - [Minor] 묶음 (가)의 "이미지 방식에 맞춘다"는 표현이 S-02(이미지에도 남음)와 어긋났다. 두 도구 모두 통일하는 것으로 고쳤다
  - [Nit] S-09 정규식을 소스 그대로의 이스케이프 표기로 고쳤다
- "확인 불가" 항목 중 F-20의 환경 변수 부분은 Claude가 추가로 확인해 판정 근거에 넣었다. 나머지는 Claude가 원문으로 확인했다
