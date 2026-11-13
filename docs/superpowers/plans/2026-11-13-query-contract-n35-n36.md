# N-35/N-36 query contract 통합 구현 계획 — 2026-11-13

- 작성: Claude Code (claude-opus-5-5), 개발자. PM·최종 판정: Codex (Astra)
- 대상: `src/core/artifacts.ts`의 query 경로 하나. N-35(결합 문자 토큰화)와 N-36(직접 API `contextLines` 검증)을 한 소유자가 한 구현 PR로 처리한다
- 이 문서는 계획 PR(Tier D)이다. 제품 코드·테스트·의존성·실험 데이터·수치는 바꾸지 않는다
- 기준: origin/main `5d668f9`(PR #111 merge). 행 번호는 이 기준의 `src/core/artifacts.ts`다
- 흐름: 계획 PR → 사용자 결정(§6) → 구현 PR

## 1. 근거 대조

과거 보고(11-11 plugin critical text F2/F3, 11-11 final A2/A3, 11-12 remediation final)를 그대로 쓰지 않고 현행 소스와 다시 맞췄다.
재현은 scratch에서 현행 `src/core/artifacts.ts`를 번들해 공개 `indexArtifact`/`queryArtifact`만 불러 확인했다.
이 재현은 기존 사례의 확인이며 새 측정이 아니다. 추적 파일은 바꾸지 않았다. 구현 PR의 RED 테스트가 같은 사실을 저장소 안에서 다시 고정한다.

### 1.1 현행 query 경로 (읽은 소스)

| 위치 | 내용 |
|---|---|
| `artifacts.ts:85-95` | `maxExcerpts` 검증: `undefined`가 아니면 number·정수·1–20을 요구하고, 아니면 `"maxExcerpts must be an integer from 1 to 20"`. store 접근 **전**에 실행된다 |
| `artifacts.ts:96-97` | `requireArtifact(store, …)` → `store.get` |
| `artifacts.ts:98` | `const contextLines = input.contextLines ?? 2;` 검증 없음 |
| `artifacts.ts:107-113, 132, 138-146, 225-226` | `anchor ± contextLines`로 span 계산, `Math.max/Math.min`으로 자름 |
| `artifacts.ts:197-198` | `artifact.sourceMap[span.startIndex].startByte` / `[span.endIndex].endByte` |
| `artifacts.ts:415-440` | `tokenize(query)`의 term마다 정규화된 줄에 `includes`가 맞으면 1점. 최고점 동점 줄을 파일 순서로 모은다 |
| `artifacts.ts:555-563` | `tokenize`: NFKC + `toLocaleLowerCase` 뒤 `/[\p{L}\p{N}_./:-]+/gu`. 줄 쪽은 같은 정규화만 하고 토큰화하지 않는다 |
| `src/server/index.ts:121-136` | MCP zod: `contextLines: z.number().int().min(0).max(10).optional()`, `maxExcerpts: … .min(1).max(20)`, `maxTokens: … .positive().max(2000)` |

토큰화는 **질의 쪽에만** 적용된다. 따라서 N-35 변경은 term 목록을 바꾸고, 그 결과로 점수·anchor 집합만 바뀐다. 줄 분할, sourceMap, 예산 맞춤, `moreMatches` 계산 코드는 바뀌지 않는다.

### 1.2 N-35 재현 (현행 소스)

질의 `हिन्दी`(U+0939 U+093F U+0928 U+094D U+0926 U+0940)는 현행 정규식에서 `ह`, `न`, `द` 세 term으로 쪼개진다. 결합 문자 U+093F/U+094D/U+0940이 문자 집합에 없기 때문이다.
distractor `नदी हवा नदी`는 세 자음을 모두 포함하므로 목표 줄과 같은 3점이 된다.

| 배치 | 옵션 | 결과 |
|---|---|---|
| distractor 6줄 연속 + 목표 7행 | 기본(`contextLines` 2) | span이 합쳐져 `[1,7]` 1개. 목표 포함(합병 덕분) |
| 같음 | `contextLines: 0` | excerpt `[1..5]`, `moreMatches {count:2, lines:[6,7]}`. **목표 누락** |
| distractor 6개를 비일치 5줄씩 띄움 + 목표 37행 | 기본 | excerpt 5개(1–27행), `moreMatches {count:2, lines:[31,37]}`. **목표 누락** |

세 경우 모두 `fallbackReason: null`, `warnings: []`다. 11-11 final A2의 "기본 5개 excerpt에서 목표가 moreMatches로 밀림"은 span이 합쳐지지 않는 배치에서 성립한다. 인접 배치에서는 기본값이 목표를 우연히 포함하므로, 테스트는 띄운 배치를 쓴다(§4.1).

### 1.3 N-36 재현 (현행 소스, 7줄 파일, anchor 4행, `maxTokens` 400)

| `contextLines` | 현행 결과 | 판정 |
|---|---|---|
| `undefined` | `[2,6]` (기본 2) | 정상 |
| `null` | `[2,6]` (`?? 2`로 기본값) | 타입 계약(`number \| undefined`) 밖. `maxExcerpts`의 `null`은 이미 거부된다 |
| `0`, `-0` | `[4,4]` | 정상 |
| `11`, `1e9`, `Number.MAX_SAFE_INTEGER + 1`, `Infinity` | `[1,7]` 전체 | 오류 없음. MCP는 11 이상을 거부한다 |
| `1.5`, `0.5` | `TypeError: Cannot read properties of undefined (reading 'startByte')` | 비정수 인덱스로 `sourceMap[2.5]` 접근 |
| `0.5`, `1.5` (anchor 1행) | `TypeError: … (reading 'endByte')` | 시작이 0으로 잘려도 끝 인덱스가 비정수다. 11-11 F3의 "시작이 0으로 잘리면 정상"은 3줄 이상 파일에서는 성립하지 않는다 |
| `-1`, `NaN`, `-Infinity` | excerpt 0개, `source_span_exceeds_budget` + `complete_span_required` | 예산 문제가 아닌데 예산 사유를 붙인다 |
| `"1"` (문자열) | `[3,7]` | `anchor + "1"`이 문자열 연결이 되어 끝이 파일 끝까지 간다(비대칭) |
| `true` | `[3,5]` | 1로 강제 변환 |

검증 순서: 빈 store에서 `maxExcerpts: 0` → `"maxExcerpts must be an integer from 1 to 20"`(store 전), `contextLines: -1` → `"Artifact not indexed: artifact_missing"`(검증 없음).

### 1.4 호출자와 문서 계약 (전수 검색)

`package.json`은 `"private": true`이고 `main`/`exports`가 없다. 따라서 공개 npm 진입점은 없다. 그러나 이것만으로 저장소 밖 소비자가 없다고 단정하지 않는다. 저장소를 받아 `src/` 또는 `dist/`를 직접 import하는 외부 사용은 확인할 수 없었다(사용 미확인이며, 없음을 확인한 것은 아니다). 저장소 안에서는 연구 스크립트가 `dist/src/core/artifacts.js`를 직접 import한다.

| 호출자 | 경로 | `contextLines` |
|---|---|---|
| MCP `query_artifact` | `src/server/index.ts:129-136` | zod가 0–10 정수만 통과. 생략 시 `undefined` |
| benchmark | `benchmarks/run.ts:390-394`, `:652-656` | 1, 6 |
| 연구(MCP 경유) | `research/src/excerpt-bench.mjs:45`, `session-harness.mjs:162`, `session-anthropic.mjs:91` | 1 |
| 연구(직접) | `research/src/6-4b-5-store-scenarios.mjs:81` | 생략(누락 artifact 오류 문구를 정확히 비교) |
| 테스트(직접) | `tests/core.test.ts` 383–555, 1538–1556 | 0, 1, 6 |
| 테스트(직접) | `tests/query-artifact-boundaries.test.ts` | 0, 1, 2, 3, 10 |
| 테스트(MCP) | `tests/query-artifact-mcp.test.ts` | 0, 1, 스키마 `{type:"integer",minimum:0,maximum:10}` |
| smoke | `scripts/smoke-mcp.mjs:127` | 도구 존재만 확인 |
| 문서 | README:81, `docs/design.md:30`, `skills/optimize-context/SKILL.md`, `docs/benchmarks.md:14`(`contextLines: 6`) | 직접 API `contextLines` 범위를 적은 문서 없음 |

저장소 안에서 직접 API로 10을 넘긴 호출은 없다. 그렇다고 10 초과 사용 가능성이 없다고 보지 않는다. 직접 API 계약은 지금까지 상한을 선언하지 않았고 11 이상은 정상 동작한다(§1.3). 결합 문자가 든 질의를 쓰는 테스트·benchmark·연구 스크립트도 없다(`tests benchmarks research/src scripts`에서 U+0300–036F, U+0590–06FF, U+0900–0DFF, U+0E00–0E7F, U+FE0F, U+0130 검색 0건).

### 1.5 S-10(#113)과의 관계

Draft PR #113(`claude/s10-store-bound-impl`, head `cc95090`)은 `artifacts.ts`에서 store 클래스(현행 11–25행)와 `trimToTokenBudget` 삭제(현행 458–464행)만 바꾼다. 이 계획의 hunk(85–98, 555–559)와 겹치지 않는다.
다만 S-10 뒤 `MemoryArtifactStore.get`은 적중 시 LRU 순서를 바꾼다. 따라서 잘못된 인자로 거부되는 호출은 store에 닿기 **전에** 던져야 store 상태가 바뀌지 않는다. 이것이 N-36 검증 위치의 근거다.

## 2. N-35 — 결합 문자 보존 토큰화

### 2.1 유지할 계약

- 정규화: `normalize("NFKC").toLocaleLowerCase()` 그대로. 질의와 줄에 같은 함수를 쓴다
- 비교: 줄 전체에 대한 `includes` 부분 문자열 비교 그대로. 점수 = 맞은 term 수(중복 term 그대로)
- 동점 처리: 최고점 동점 줄을 파일 순서로. `maxExcerpts`/`moreMatches`(최대 20행)/엄격 예산/sourceMap 계산 코드 무변경
- `policy.ts`(자체 `\p{L}` 정규식 226–227, 722–724행)는 범위 밖이다. 요약 안전 판정은 바뀌지 않는다

### 2.2 대안 비교

| 안 | 정규식 | 요점 |
|---|---|---|
| 현행 | `/[\p{L}\p{N}_./:-]+/gu` | 결합 문자에서 term이 끊긴다 |
| A: 문자 집합에 M 추가 | `/[\p{L}\p{M}\p{N}_./:-]+/gu` | 11-11 F2 수정안. 단독 결합 문자도 term이 된다 |
| **B: 첫 글자는 비결합, 이후 M 허용 (권장)** | `/[\p{L}\p{N}_./:-][\p{L}\p{M}\p{N}_./:-]*/gu` | `(?:[\p{L}\p{N}_./:-]\p{M}*)+`와 같은 집합. term은 결합 문자로 시작하지 않는다 |

scratch 확인(NFKC+소문자 뒤 term, Node v24.18.0, 프로세스 locale ko-KR):

| 입력 | 현행 | A | B |
|---|---|---|---|
| 힌디 `हिन्दी` | `ह`,`न`,`द` | 1 term 전체 | 1 term 전체 |
| 아랍 harakat `كَتَبَ` | `ك`,`ت`,`ب` | 1 term(harakat 포함) | A와 같음 |
| 아랍 무표기 `كتب` | 1 term | 같음 | 같음 |
| 히브리 niqqud `שָׁלוֹם` | `ש`,`לו`,`ם` | 1 term(NFKC 정준 순서로 재배열) | A와 같음 |
| 태국 Mn `กิน` | `ก`,`น` | 1 term | 1 term |
| 분해 라틴 `cafe\u0301 nai\u0308ve` | NFKC가 합성 → `café`,`naïve` | 같음 | 같음 |
| 합성형 없는 라틴 `q\u0307x` | `q`,`x` | `q\u0307x` | `q\u0307x` |
| 터키 `İstanbul` (U+0130) | 소문자화가 `i\u0307stanbul` → `i`,`stanbul` | `i\u0307stanbul` 1 term | A와 같음 |
| 단독 결합 문자 `\u0301` | term 0 (`no_query_terms`) | `\u0301` 1 term | term 0 (현행 유지) |
| 공백 뒤 결합 문자 `a \u0301b` | `a`,`b` | `a`,`\u0301b` | `a`,`b` (현행 유지) |
| 이모지 `❤\uFE0F error` | `error` | **`\uFE0F`**, `error` | `error` (현행 유지) |
| keycap `1\uFE0F\u20E3` | `1` | `1\uFE0F\u20E3` | A와 같음 |
| 한글 음절·자모(NFKC 합성)·한자 `漢字` | 변화 없음 | 같음 | 같음 |
| 가나 `か\u3099`(NFKC 합성 `が`) | `が` | 같음 | 같음 |
| 가나 `\u31F7\u309A`(합성형 없음) | `\u31F7` | 2코드포인트 1 term | A와 같음 |
| ASCII 경로·코드 `src/core/artifacts.ts:555 queryArtifact_v2 -x` | 3 term | 같음 | 같음 |

A의 위험: 이모지 표시 선택자 U+FE0F(Mn)가 단독 term이 된다. 이모지를 포함한 질의(예: `❤\uFE0F error`)는 U+FE0F를 가진 **모든** 줄에 1점을 더한다. 단독 결합 문자 질의도 `no_query_terms` 대신 광범위 일치가 된다. B는 이 두 경우에서 현행과 같고, 결합 문자를 앞 글자에 붙여야 하는 경우(인도계·아랍·히브리·태국·합성형 없는 라틴)는 A와 같다.

B가 A와 다른 입력은 "결합 문자가 term 문자가 아닌 것 뒤에 오는" 경우뿐이다(문장 시작, 공백·기호·이모지 뒤). 이때 그 결합 문자는 버려진다. 현행도 버리므로 회귀가 아니다.

### 2.3 허용되는 검색 결과 변화 (구현 PR이 의도적으로 바꾸는 것)

1. 결합 문자를 포함한 질의어가 한 term으로 유지된다. 단편 term으로 무관한 줄이 동점·우선이 되던 일이 사라진다(N-35 본래 목적)
2. **재현율 감소(의도된 정밀도 우선):** 질의와 원문의 결합 문자 표기가 다르면 더는 맞지 않는다
   - 아랍·히브리: harakat/niqqud가 있는 질의는 무표기 원문 줄과 맞지 않는다(현행은 자음 단편으로 맞았다). 반대 방향(무표기 질의 → 표기 원문)은 현행도 맞지 않으므로 변화 없음
   - 터키 `İ`: 질의 `İstanbul`이 원문 `Istanbul`/`istanbul`과 맞지 않게 된다(현행은 `i`,`stanbul`로 맞았다)
   - 결과: 이런 질의는 다른 줄로 가거나 `no_query_match`(`query_terms_not_found`)가 된다. 오류나 거짓 성공이 아니라 기존 fallback 경로다
3. 결합 문자 접기(diacritic folding, Mn 제거)는 범위 밖이다. 정규화 계약을 바꾸고 ranking을 바꾸기 때문이다. 필요하면 별도 Task로 제안한다(§6 D2)

### 2.4 바뀌지 않아야 할 control

- 결합 문자가 없는 질의: 여기서 "결합 문자 없음"은 원문이 아니라 **NFKC + `toLocaleLowerCase` 뒤**의 문자열 기준이다. 이 기준을 만족하는 ASCII 경로·식별자·숫자·`_./:-`, 한글 음절, 한자, 합성형이 있는 라틴(NFC/NFD 모두 NFKC 합성)은 term 목록이 같다. 따라서 결과가 바이트 단위로 같다
  - 반례: 원문 `İ`(U+0130)는 결합 문자가 아니지만 소문자화가 `i` + U+0307(Mn)을 만든다. 따라서 `İ`가 든 질의는 control이 아니라 §2.3-2의 변화 대상이다
- 단독 결합 문자·공백 뒤 결합 문자·이모지 선택자: term 목록 같음(B 기준)
- 기존 테스트 전부(결합 문자 질의 0건, §1.4)와 benchmark 출력

## 3. N-36 — 직접 API `contextLines` 검증

### 3.1 대안 비교

| 안 | 허용 | 기존 유효 호출 보존 | 명확한 오류 | 비고 |
|---|---|---|---|---|
| 현행 | 무엇이든 | — | 없음(TypeError, 잘못된 fallback) | §1.3 |
| C1: 0–10 정수 강제(MCP와 같음) | 0..10 | 저장소 안 호출은 모두 보존. 직접 API의 11 이상(현재 정상 동작)은 깨진다 | `"contextLines must be an integer from 0 to 10"` | 11-11 F3 수정안. 11-11 final이 호출자 확인 전 미채택 |
| **C2: 음이 아닌 safe integer (권장)** | `Number.isSafeInteger(v) && v >= 0` | 11, 1e9 같은 기존 정상 호출 보존. 버리는 것은 이미 오류·오답이던 값과 `Infinity`, `MAX_SAFE+1`, `null`, 비number뿐 | `"contextLines must be a non-negative safe integer"` | 상한은 MCP 계층만 가진다 |
| C3: C2 + 내부 clamp(예: 10) | C2와 같음 | 값은 받지만 결과가 바뀐다(11 → 10) | 조용한 변경 | 미채택: 오류 없이 출력이 달라진다 |
| C4: 비정상 값을 기본 2로 대체 | 무엇이든 | 형식상 보존 | 없음 | 미채택: 잘못된 입력을 숨긴다 |

C2를 권장하는 이유:
- 요청서의 "유효한 기존 호출을 최대한 보존하는 최소 검증"에 맞다. 현재 정상 결과를 내는 정수 호출은 모두 같은 결과를 낸다
- 거부되는 값은 모두 현재 TypeError, 사실과 다른 `source_span_exceeds_budget`, 문자열 연결 비대칭, 불리언 강제 변환을 내는 값이다. 예외는 `Infinity`/`MAX_SAFE+1`(현재 전체 파일 반환)과 `null`(현재 기본값)이다. 이 셋은 §6 D3·D4에서 따로 결정한다
- 큰 `contextLines`는 `fitCompleteLineSpan`이 넓은 span에서 한 줄씩 줄여 가며 매번 다시 렌더링하므로 비용이 커질 수 있다. 소스 구조상 추론일 뿐 측정하지 않았다. C2 권장은 이 비용 주장에 기대지 않는다. 상한이 필요하다는 판단이 서면 C1으로 바꾸기 전에 별도 사전 기준(최악 입력, ABBA, A/A, nearest-rank median/p95)을 먼저 정한다

### 3.2 검증 위치와 오류 우선순위

`queryArtifact` 맨 앞, 기존 `maxExcerpts` 검증 **바로 뒤**, `input.store ?? defaultArtifactStore`와 `requireArtifact` **앞**에 둔다.

1. `maxExcerpts` 오류(기존 문구, 기존 우선순위 유지)
2. `contextLines` 오류(새 문구)
3. `Artifact not indexed: <id>`(기존)
4. 질의 처리(`no_query_terms` 등 기존 fallback)

`maxExcerpts`를 먼저 두는 이유: 이미 `maxExcerpts`가 잘못된 호출의 오류 문구가 바뀌지 않는다. 둘 다 store 전이므로 S-10 LRU 순서와 store 내용은 거부된 호출로 바뀌지 않는다. `maxTokens`는 검증하지 않는다(요청서 제외 항목).

## 4. 구현 diff 계획 (구현 PR)

### 4.1 `src/core/artifacts.ts`

```diff
@@ queryArtifact (현행 85-98행)
   const maxExcerpts = requestedMaxExcerpts ?? 5;
+  const requestedContextLines = input.contextLines;
+  if (
+    requestedContextLines !== undefined &&
+    (typeof requestedContextLines !== "number" ||
+      !Number.isSafeInteger(requestedContextLines) ||
+      requestedContextLines < 0)
+  ) {
+    throw new Error("contextLines must be a non-negative safe integer");
+  }
   const store = input.store ?? defaultArtifactStore;
   const artifact = requireArtifact(store, input.artifactId);
-  const contextLines = input.contextLines ?? 2;
+  const contextLines = requestedContextLines ?? 2;
@@ tokenize (현행 555-559행)
 function tokenize(text: string): string[] {
-  return [...normalizeSearchText(text).matchAll(/[\p{L}\p{N}_./:-]+/gu)].map(
+  // A term starts with a letter, number or _./:- and keeps following combining marks
+  // (\p{M}), so Indic/Arabic/Hebrew/Thai words stay whole. A mark never starts a term:
+  // a stand-alone mark, or a variation selector after an emoji (a non-term character),
+  // does not become its own term. Marks after a term character are kept, e.g. the
+  // selector and keycap mark after a digit stay in that digit's term.
+  return [...normalizeSearchText(text).matchAll(/[\p{L}\p{N}_./:-][\p{L}\p{M}\p{N}_./:-]*/gu)].map(
     (match) => match[0],
   );
 }
```

- D3에서 `null`을 기본값으로 남기기로 하면 조건의 `requestedContextLines !== undefined`를 `requestedContextLines != null`로, 기본값을 `requestedContextLines ?? 2`로 둔다(`?? 2`는 이미 `null`을 처리한다)
- D1에서 C1을 고르면 조건을 `!Number.isInteger(v) || v < 0 || v > 10`, 문구를 `"contextLines must be an integer from 0 to 10"`로 바꾼다
- 정규식은 Write 도구 + 저장 뒤 grep으로 `\p{` 표기가 남았는지, 제어 문자가 0인지 확인한다(CLAUDE.md 백슬래시 함정)

### 4.2 영향 파일

| 파일 | 변경 |
|---|---|
| `src/core/artifacts.ts` | §4.1 두 hunk |
| `tests/query-artifact-boundaries.test.ts` | N-35·N-36 직접 API 테스트 추가(기존 `query()` 헬퍼 재사용) |
| `tests/query-artifact-mcp.test.ts` | N-35 MCP 테스트 1개, 스키마 불변 단언은 기존 것 유지 |
| `bin/token-context-optimizer.mjs` | `npm run build`로 재생성(직접 수정 안 함) |
| `README.md` | (D5 승인 시) 81행 문단 뒤 2문장: 결합 문자 term 규칙, 직접 API `contextLines` 계약 |
| 바꾸지 않음 | `src/server/index.ts`(MCP 스키마), `src/core/policy.ts`, `src/core/types.ts`, benchmark, research, 다른 인자 |

### 4.3 RED → GREEN 테스트 (공개 `queryArtifact`와 MCP만 사용)

private 정규식이나 `tokenize`를 직접 부르는 테스트는 쓰지 않는다. 모든 단언은 `excerpts[].sourceMap.startLine/endLine`, `moreMatches`, `fallbackReason`, `warnings`, 던진 오류 문구다.

| ID | 경로 | 입력 | 현행(RED) | 기대(GREEN) |
|---|---|---|---|---|
| T35-1 | direct | distractor `नदी हवा नदी` 6개를 비일치 5줄씩 띄우고 마지막에 목표 `हिन्दी भाषा`, 질의 `हिन्दी`, 기본 옵션 | 목표 37행이 `moreMatches.lines`에 있음 | excerpt 1개 `[35,37]`(목표 ± 2), `moreMatches` 없음, `fallbackReason: null` |
| T35-2 | direct | T35-1 파일, `contextLines: 0`, `maxExcerpts: 1` | 1행 반환, `moreMatches.count` 6 | `[37,37]`, `moreMatches` 없음 |
| T35-3 | direct | 목표 2개(서로 띄움) + distractor 6개, `maxExcerpts: 1` | — | 첫 목표 1개, `moreMatches {count:1, lines:[둘째 목표 행]}`. distractor 행은 `moreMatches`에 없음 |
| T35-4 | direct | 태국 `กิน`(목표)과 `ก`·`น`만 가진 distractor, 합성형 없는 라틴 `q\u0307x` 목표와 `q … x` distractor | distractor 동점/우선 | 목표만 반환 |
| T35-5 | MCP | T35-1과 같은 파일·질의를 `query_artifact`로 | 목표가 `moreMatches` | excerpt가 목표 span, `structuredContent`와 `content[0].text`가 같음 |
| C35-1 | direct | ASCII 경로·식별자 질의 `src/core/artifacts.ts:555`, `queryArtifact_v2`, 한글 `검색어`, 한자, `café`(NFC)와 `cafe\u0301`(NFD) | 통과 | 같은 결과(현행과 같은 excerpt·moreMatches. 기대값은 RED 단계 현행 출력으로 먼저 고정) |
| C35-2 | direct | 질의 `\u0301`만 | `no_query_terms` | `no_query_terms` 유지 |
| C35-3 | direct | 질의 `❤\uFE0F error`, 원문에 `error` 1줄과 `\uFE0F`만 가진 줄 여러 개 | `error` 줄만 | 같음(A안이면 실패하는 control) |
| C35-4 | direct | 아랍 harakat 질의 vs 무표기 원문 | 자음 단편으로 일치 | `no_query_match`(§2.3-2의 의도된 변화를 고정) |
| T36-1 | direct | `contextLines` ∈ {`1.5`, `0.5`, `-1`, `NaN`, `Infinity`, `-Infinity`, `Number.MAX_SAFE_INTEGER + 1`, `"1"`, `true`, `null`} | TypeError, 잘못된 fallback, 비대칭 span, 기본값 | 모두 `"contextLines must be a non-negative safe integer"`로 throw(정확 문구) |
| T36-2 | direct | 빈 store + 없는 artifactId + `contextLines: -1` | `Artifact not indexed` | contextLines 오류(store 전 검증) |
| T36-3 | direct | `maxExcerpts: 0` + `contextLines: -1` | maxExcerpts 오류 | maxExcerpts 오류 유지(우선순위) |
| T36-4 | direct | S-10 merge 뒤: 두 artifact를 넣은 bounded store에서 잘못된 `contextLines`로 하나를 질의한 뒤 축출 순서 확인 | (S-10 전에는 생략) | 거부된 호출이 LRU 순서를 바꾸지 않음 |
| C36-1 | direct | `contextLines` 생략, `0`, `-0`, `10`, `11`, `1000`, `Number.MAX_SAFE_INTEGER` | 통과 | 현행과 같은 span. `11` 이상은 7줄 파일에서 `[1,7]` |
| C36-2 | MCP | 기존 `inputSchema.properties.contextLines` = `{type:"integer",minimum:0,maximum:10}` 단언, base fixture `toStrictEqual` | 통과 | 불변. MCP `contextLines: 11`/`1.5`/`-1`은 계속 MCP 경계에서 거부(기존 maxExcerpts 경계 테스트와 같은 단언 형식) |

RED 확인 규칙: T35-*, C35-4, T36-1~3을 먼저 추가해 현행 코드에서 실패함을 확인하고 로그를 PR 본문에 남긴다. control(C*)은 RED 단계에서 통과해야 한다. C35-3은 B안이 A안과 구별되는지 보는 control이므로, 구현 PR에서 A안 정규식으로 잠깐 바꿔 실패하는지 scratch로 확인한다(커밋하지 않음).

### 4.4 수용 기준

1. §4.3의 T*가 RED에서 실패하고 GREEN에서 통과한다. C*는 두 단계 모두 통과한다
2. `src/server/index.ts`·MCP 스키마·base tool fixture(`tests/fixtures/task36-base-tools.json`, `task39-base-tools.json`) diff 0
3. `src/core/policy.ts` diff 0, 기존 테스트 기대값 수정 0
4. `npm run benchmark`의 query 결과(excerpt 범위, sourceMap, 통과/실패 판정)가 기준 실행과 같다. 결합 문자 질의가 없으므로 같아야 하며, 다르면 중단하고 원인을 보고한다. 시간 수치는 비교 대상이 아니다(성능 주장을 하지 않는다)
5. 반환 구조(`excerpts`, `moreMatches`, 공통 필드) 타입 diff 0
6. 정규식 소스에 제어 문자 0, `\p{M}` 표기 보존

### 4.5 명령

- targeted: `npx vitest run tests/query-artifact-boundaries.test.ts tests/query-artifact-mcp.test.ts`
- full gate(worktree): `npm ci --ignore-scripts` → `npm run build` → `npm test` → `npm run typecheck` → `npm run smoke:mcp` → `npm run validate:plugin` → `npm run benchmark`
- 빌드 전 `git status --short` 기록, 빌드 뒤 의도하지 않은 `bin/` 차이는 CLAUDE.md 규칙대로 처리
- full gate는 coordinator에게 실행권을 받은 뒤 돌린다

## 5. S-10과의 통합 순서

1. 이 계획 PR 판정과 사용자 결정(§6) 뒤 구현 Task를 새 worktree `claude/query-contract-impl`로 연다
2. S-10(#113)이 먼저 merge되어 있으면 그 origin/main에서 시작한다
3. S-10이 아직 열려 있으면 origin/main에서 시작하되, S-10 merge 승인 뒤 `git merge origin/main`(merge commit)으로 합친다. rebase·force push는 하지 않는다
   - 예상 충돌: `bin/token-context-optimizer.mjs`(양쪽 재생성). src hunk는 겹치지 않는다(§1.5)
   - 충돌 해결: `bin/`은 손으로 고치지 않고 merge 뒤 `npm run build`로 다시 만든다. 그 뒤 full gate와 T36-4를 실행한다
4. 구현 PR merge도 사용자 승인 뒤 `gh pr merge <n> --merge --match-head-commit <sha>`로만 한다

## 6. 사용자 결정표

| ID | 결정 | 선택지 | 권장 | 근거 |
|---|---|---|---|---|
| D1 | 직접 API `contextLines` 범위 | C1 0–10 / **C2 음이 아닌 safe integer** / C3 clamp | C2 | 저장소 안 호출은 둘 다 보존. C2는 현재 정상인 11 이상 직접 호출도 보존한다. 상한은 MCP가 이미 강제한다 |
| D2 | 결합 문자 처리 | A 문자 집합에 M / **B 비결합 시작 + M 허용** / 접기(folding) | B | A는 U+FE0F·단독 결합 문자를 term으로 만든다. 접기는 정규화·ranking 변경이라 범위 밖 |
| D3 | `contextLines: null` | **거부** / 기본값 2 유지 | 거부 | 타입 계약 밖이고 `maxExcerpts`는 이미 `null`을 거부한다. 저장소 안 `null` 전달 0건 |
| D4 | `Infinity`, `MAX_SAFE+1` | **거부** / 허용(전체 파일) | 거부 | 정수 계약 밖. 전체 파일이 필요하면 `Number.MAX_SAFE_INTEGER` 같은 유한 정수로 같은 결과를 얻는다 |
| D5 | README 계약 문장 추가 | **추가** / 생략 | 추가 | 직접 API 계약과 결합 문자 규칙을 사용자가 알 수 있다. 81행 문단 뒤 2문장 |
| D6 | §2.3-2 재현율 감소(아랍·히브리 표기 불일치, 터키 `İ`) 수용 | **수용하고 테스트로 고정** / 접기 별도 Task 요청 | 수용 | 정밀도 우선이며 결과는 기존 `no_query_match` 경로다. 접기는 필요하면 후속으로 따로 제안한다 |

결정이 권장안과 다르면 §4.1 diff와 §4.3 기대값을 그 선택지로 바꾼 뒤 구현한다.

## 7. 범위 밖 관찰 (이번 계획에서 바꾸지 않음)

- `normalizeSearchText`는 `toLocaleLowerCase()`를 쓴다. 프로세스 기본 locale이 터키어(tr/az)면 `I`/`İ` 소문자화가 달라져 같은 질의의 결과가 호스트마다 다를 수 있다. 이번 scratch는 ko-KR에서 확인했다. 바꾸려면 정규화 계약 변경이므로 별도 Task로 제안한다
- `policy.ts`의 `\p{L}` 정규식도 결합 문자를 단어 문자로 보지 않는다. 요약 안전 판정에 영향이 있는지는 N-35 범위 밖이며 따로 확인이 필요하다
- 직접 API `maxTokens` 검증 부재(11-11 F3 끝부분)는 요청서가 제외했다
