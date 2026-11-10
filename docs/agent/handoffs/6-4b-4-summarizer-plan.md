# 6.4b-4 — 요약기 6줄 이후 누락: 계획·영향 조사

상태: 계획·영향 조사 Draft PR. 제품 코드, 테스트, 번들, MCP 스키마, 역사적 연구 JSON은 변경하지 않았다. 성능 통과 판정이나 N-03 종료를 주장하지 않는다.

기준 커밋: `cf77b524445be3550c942a795d7c992e64d0e4b0` (`main`, #104 merge).

## 1. 목적과 범위

- N-03의 원인과 영향 범위를 조사하고, 구현 PR에서 사용자가 결정할 선택지와 검증 기준을 고정한다.
- 승인된 산출물은 조사 runner/worker, 최종 결과 JSON, 이 계획 문서다.
- `src/`, `tests/`, `benchmarks/`, `bin/`, package/config 및 기존 연구 결과 JSON은 변경하지 않는다.
- `docs/design.md`의 기존 성능 문단 배치/정의 nit은 별도 범위다.

## 2. 확인된 현재 동작

- `src/core/artifacts.ts:297`은 `artifact.sourceMap.slice(0, 6)`으로 후보를 고정한다.
- `fitCompleteSummaryLines`(`src/core/artifacts.ts:406`)는 앞에서부터 완전한 줄을 하나씩 렌더링·추정하고 예산 초과 시 멈춘다.
- `sourceMap`은 `{ path, startLine, endLine }` 한 연속 구간이다. 비연속 발췌는 현 계약으로 표현하지 않는다.
- 선택 줄이 없고 원문 줄이 있으면 `summary_span_exceeds_budget` fallback과 `complete_summary_span_required` 경고를 반환한다.
- 정책상 lossy 요약이 금지되면 기존 `lossy_summary_blocked` 및 분류 경고와 정책별 fallback을 유지한다.
- MCP `summarize_artifact`(`src/server/index.ts:146–158`)의 `maxTokens`는 양의 정수이며 최대 2000이다. core 직접 호출에는 이 MCP 상한이 없다.
- `tests/core.test.ts:1390–1445`의 두 characterization은 `maxTokens: 120`에서 앞 6줄만 반환되어 뒤 필수 구절이 빠지는 현재 동작을 기록한다.
- `benchmarks/run.ts:431–505`의 semantic smoke는 네 fixture를 반복해 optimized token, reduction, gate, warnings를 집계하지만 광범위한 의미 보존 증거는 아니다.

## 3. 선택지와 권장 결정 (사용자 결정 필요)

### D-1 — 선택 규칙

권장: 6줄 고정을 없애고, 예산이 허용하는 원문 앞쪽의 연속된 완전한 줄을 선택한다.

- `sourceMap` 계약, 결정성, 완전한 줄 보존을 유지한다.
- 예산을 넘는 뒷부분은 누락될 수 있음을 출력 문서에 명시한다.
- 앞·뒤 비연속 발췌와 점수/문단 단위 발췌는 다중 `sourceMap` 구간 또는 새 스키마가 필요하므로 별도 Task다.

### D-2 — 누락 알림

권장: 성공한 부분 요약에서만 `summary_truncated` 경고를 추가한다.

- 원문에 더 많은 줄이 있고, 하나 이상의 줄이 선택되며, 예산 때문에 뒤가 잘린 경우에만 추가한다.
- 정책 차단과 첫 줄도 예산에 들어가지 않는 `summary_span_exceeds_budget` fallback은 기존 경고가 이미 상태를 설명하므로 중복 경고를 추가하지 않는다.
- 경고 이름과 정확한 조건은 사용자 승인을 받은 뒤 출력 계약과 테스트/벤치마크 집계에 이관한다.

### D-3 — 의미 게이트와 characterization

의미 게이트 함수와 필수 구절은 변경하지 않는다.

- `late8lines`는 예산 120에서 BASE의 6줄 누락을 역사적 관찰로 보존하고, 구현 PR에서는 후보 A/B가 필수 구절을 보존하는 7줄·107 token·gate true 결과를 late120 acceptance로 검증한다.
- `mixed7`은 예산 120에서 6줄 누락을 유지한다. 예산 124에서는 A/B가 7줄·124 token·gate true가 되는 acceptance 후보로 기록한다.
- 네 semantic fixture의 필수 구절과 실제 estimator 값을 함께 검증한다. 120 예산을 모든 fixture의 성공 조건으로 가정하지 않는다.
- 기존 앞 6줄 기대값은 구현 PR에서 승인된 acceptance 또는 예산 omission characterization으로 교체한다. 이번 계획 PR에서는 테스트 파일을 수정하지 않는다.

### D-4 — 선택 루프 비용

최종 단일 진단에서 100k-line semantic blank의 core 호출은 예산 2000(= MCP 최대 예산)에서 432.0753 ms, 예산 50000에서 summary/result phase의 15초 timeout으로 censored 되었다. 100k-line valid short prose의 core 호출은 같은 예산 순서로 789.8803 ms와 10410.5962 ms였다. MCP 서버/전송 경로는 측정하지 않았으며, 단일 탐색 샘플은 formal performance gate가 아니다.

quadratic 신호에 따라 output-equivalent bounded selector를 권장한다.

- (a) 6줄 상한만 제거한 naïve complete-line selector와 (b) 누적 길이/이분 탐색 등 bounded selector를 비교한다.
- 두 구현은 `summary`, `sourceMap`, estimated tokens, fallback, warnings가 byte-for-byte 동등해야 한다.
- 다음 완전한 줄과 canonical LF 개행을 추가해도 `wordishTokens`, `ceil(nonCjkUTF16/4) + cjkChars`, 최종 `max(...)` 각 항이 감소하지 않으므로 estimator가 감소하지 않는다는 단조성 증명을 테스트와 설명으로 입증한다.

## 4. 추정기 단조성·경계 전제

- 비어 있지 않은 텍스트의 estimator는 `max(wordishTokens, ceil(nonCjkUTF16/4) + cjkChars, 1)` 형태다.
- 최종 runner는 128개 seeded edge case와 10개 fixed edge case에서 후보를 추가해도 추정치가 감소하지 않음을 확인했다. 빈 문자열, 공백, CR/CRLF, CJK, emoji, BMP 밖 서로게이트 쌍과 단독 서로게이트를 포함한다.
- valid semantic blank와 valid short prose는 실제 public classification 경로를 실행한다. pure blank/literal short 입력은 정책상 unknown으로 차단되어 semantic loop 부하의 대체 fixture가 아니다.
- 이 결과는 조사 runner의 설계 전제 검증이며 제품 수정 결과가 아니다.

## 5. 조사 행렬과 최종 결과

`research/results/6-4b-4-summarizer-survey.json`은 2026-11-09 13:24:02–13:27:17 UTC의 최종 complete run이다. Node `v24.18.0`, npm `11.16.0`, Windows `10.0.26200`, x64, 기준 커밋 `cf77b52`를 기록한다. BASE/A/B는 각각 현재 6줄 cap / cap 제거 / cap 제거 + 성공한 partial warning 후보다.

| 입력/예산 | BASE | A | B |
|---|---|---|---|
| `late8lines` / 120 | 1–6, 88, gate false | 1–7, 107, gate true | A + `summary_truncated` |
| `late8lines-full` / 123 | 1–6, 88, gate false | 1–8, 123, gate true | A |
| `mixed7` / 120 | 1–6, 93, gate false | BASE | BASE + `summary_truncated` |
| `mixed7-full` / 124 | 1–6, 93, gate false | 1–7, 124, gate true | A |
| 네 semantic single-line fixture | 각 1줄, 15–21 tokens, gate true | BASE | BASE |
| success/threshold `*-80` | 각 1–5, 103–104 tokens, gate true | BASE | A + 경고 |
| negation `-80` | 1–6, 87, gate true | 1–8, 116, gate true | A + 경고 |
| actor-action `-80` | 1–6, 101, gate true | 1–7, 117, gate true | A + 경고 |
| `semantic-20-blank` | 1–6, 22, gate true | 1–20, 26, gate true | A |
| `empty`, blank, short, mixed CRLF/CR | unknown fallback | BASE | BASE |
| `semantic-20-short` | unknown fallback, gate false | BASE | BASE |
| `too-long-budget10` | `summary_span_exceeds_budget` | BASE | BASE |
| `korean-natural` | 1–1, 26 tokens, gate null | BASE | BASE |
| `mixed-delimiters-semantic` | 1–6, 59 tokens, gate false | 1–7, 70 tokens, gate true | A |
| `short-prose-semantic` | 1–6, 33 tokens, gate null | 1–21, 116 tokens, gate null | A + 경고 |
| `policy-blocked` | `exact_content_requires_source` | BASE | BASE |

최종 행 수는 23개이며 B의 warning-added row는 7개다: `late8lines`, `mixed7`, 네 개의 semantic `-80` 반복 fixture, `short-prose-semantic`.

표의 각 셀은 `sourceMap startLine–endLine, estimatedTokens, gate` 순서다. 셀에 쓰지 않은 `fallbackReason`은 `null`, `warnings`는 `[]`이며, fallback이 있는 행은 표에 이름을 그대로 적었다. `summary_span_exceeds_budget`의 warning은 `complete_summary_span_required`, unknown/policy 행의 warning은 결과 JSON의 `lossy_summary_blocked`, `lossy_compression_not_allowed` 등 기존 이름을 유지한다. B의 추가 warning은 성공한 partial summary의 `summary_truncated` 하나다.

후보 테스트 집계는 BASE 4316 pass / 0 fail / 5 skip, A 4315 / 1 / 5, B 4314 / 2 / 5다. A의 실패는 `tests/core.test.ts:1413` late summary 기대값이며, B의 추가 실패는 `tests/core.test.ts:1353`의 직접 benchmark warning 배열이다. benchmark runner가 네 fixture의 warning을 `flatMap`하므로 직접 결과에는 `summary_truncated`가 4개 들어가고 CLI report에서는 distinct warning 하나로 보인다. dedup은 이번 범위가 아니다.

CLI benchmark의 non-time 차이는 A/B 대 BASE에서 `optimizedTokens` 3950→4400, `reductionPercent` 93.2→92.4이며 B에는 `summary_truncated`가 추가된다. BASE/A/B의 benchmark exit는 모두 0이며 각 report의 세 scenario도 PASS다.

## 6. 진단 한계와 향후 성능 사전등록

진단 10개 중 9개가 완료되고 1개(`semantic-blank`, core 50000)가 15초 child timeout으로 censored 되었다. timeout은 summary/result phase를 포함하므로 순수 summarize 시간의 하한/상한으로 해석하지 않는다. 단일 샘플을 p95나 성능 통과로 승격하지 않는다.

향후 구현 PR에서 다음 case-specific 초안을 승인받는다.

- 측정 대상은 모두 core public `summarizeArtifact` 직접 호출이다. 예산 2000은 MCP 최대값을 대표하지만 MCP handler/전송 시간을 포함하지 않는다.
- semantic blank 100k: `maxTokens=2000` p95 ≤ 250 ms, `maxTokens=50000` p95 ≤ 1000 ms.
- valid short prose 100k: 같은 예산 순서로 p95 ≤ 1000 ms / ≤ 2000 ms. 이 fixture는 classification scan 비용이 포함되므로 semantic blank와 동일한 250 ms 상한을 적용하지 않는다.
- 별도 classify-only control을 추가해 분류 비용과 선택 비용을 분리하되, 최종 acceptance는 full public call 기준으로 유지한다.
- 동일한 호스트와 고정 Node `v24.18.0`, lockfile, commit에서 serial 실행한다. 사전 index된 artifact를 사용하고 indexing 및 file I/O는 측정 구간에서 제외하되 별도 시간으로 보고한다.
- 비교군은 `base`(6줄 cap), `reference`(cap 제거 naïve), `optimized`(reference와 동등한 bounded selector)로 분리한다. `base → reference`의 추가 semantic work와 `reference → optimized` 알고리즘 비용을 합치지 않는다.
- 각 후보 5회 warm-up 후 ABBA 15 cycle, 후보당 30 samples, nearest-rank median/p95를 사용한다.
- 각 비교의 A/A를 별도 block으로 실행한다. median ratio `[0.9, 1.1]` 또는 절대 차이 ≤0.1 ms, p95 차이 ≤`max(0.2 ms, 기준 p95의 20%)`를 noise floor로 둔다.
- A/A invalid이면 모든 원자료를 보존하고 30초 cooldown 후 최대 두 번 전체 block을 재실행한다. 첫 valid block을 사용하며 가장 좋은 block을 선택하지 않는다. 세 번째 invalid이면 amendment 없이는 중단한다. valid failure는 재시도하지 않는다.
- timeout은 right-censored로 기록하고 percentile/ratio에 넣지 않는다. OOM은 resource failure다. large-case child timeout은 startup/indexing과 summary/result 각 phase당 15초다.
- 변경 없는 `<=6` 경로는 reference 대비 median과 p95가 각각 `max(0.1 ms, reference의 10%)` 이내인지 확인한다.

## 7. 영향 파일과 후속 이관 목록

- 제품: `src/core/artifacts.ts:297,406`, `src/server/index.ts:146–158`.
- 테스트: `tests/core.test.ts:1390–1445`의 omission characterization 및 인접 summary contract.
- benchmark: `benchmarks/run.ts:318–350,431–505`의 semantic fixture와 warning 집계.
- 문서: `docs/design.md:31`, `docs/benchmarks.md:12`, `docs/research/2026-09-07-llm-finetuning-plugin-mcp-skills-paper-plan.md:25,107,128`.
- 역사 기록: `docs/superpowers/plans/2026-10-05-benchmark-integrity.md`와 과거 handoff는 보존한다.
- 후속 상태: `docs/agent/handoffs/task-26.md:58`의 F-04는 승인 구현과 acceptance test가 완료될 때까지 OPEN이다.
- 조사 메모: `research/plans/2026-10-25-findings-recheck.md:50–58`의 N-03을 구현 PR에서 갱신한다.
- survey는 기준 커밋을 archive로 고정하며 역사적 JSON은 수정하지 않는다. 기존 `research/src`를 조사한 결과 새 survey 외의 직접 summary consumer는 확인되지 않았다. `excerpt-bench`의 local scoring helper와 `mcp-client`의 bundle source selector는 요약 실행기가 아니므로 영향 소비자로 세지 않았다.

## 8. 구현 PR 테스트 계획

1. RED: 연속 complete-line 선택, 단일 sourceMap, 승인 예산의 필수 구절, truncation 조건 assertion을 BASE에서 먼저 실패시킨다. 현재 omission characterization 통과는 baseline이지 RED가 아니다.
2. GREEN: D-1의 연속 줄/sourceMap/empty-whitespace/CRLF/CJK/surrogate/첫 줄 초과 fallback을 검증한다.
3. GREEN: D-2의 successful partial warning과 policy/zero-line fallback의 warning 분리를 검증한다.
4. GREEN: D-3의 late120 acceptance, mixed120 omission, mixed124 acceptance 및 네 semantic fixture를 실제 estimator와 함께 검증한다.
5. GREEN: naïve와 optimized 결과의 summary, sourceMap, estimate, fallback, warnings 전체 동등성을 차분 corpus로 검증한다.
6. REFACTOR: exact/policy/other benchmark path와 bundle 출력 불변성을 재검증한다.
7. 대형 단일 진단은 성능 gate 증거가 아니며 반복 사전등록 측정과 full corpus equivalence가 필수다.

## 9. 검토·검증 상태

- 기본 gate: build, core 1279 pass / 2 skip, full 4316 pass / 5 skip, typecheck, smoke:mcp, validate:plugin, benchmark 모두 PASS.
- 재현 명령(저장소 루트, Windows Node/npm): `node research/src/6-4b-4-summarizer-survey.mjs`。runner는 잠금 의존성을 임시 복사본에 설치하고 BASE/A/B를 격리 실행한다.
- 조사 실행 시점의 기존 tracked file 1057개 manifest와 bundle bytes는 후보 실행 전후 동일하다.
- 최초 survey prototype은 Windows `npm.cmd` child launch `EINVAL`로 invalid 처리했고 결과에 포함하지 않았다. 수정 runner는 prerequisite gate, async npm tree cleanup, malformed JSON handling, module/source hash 및 full result identity를 assertion한다.
- Claude Code `claude-opus-5-5` runner scoped review: PASS, blocker 0 / major 0 / minor 3 / note 4. Windows 실행 증거는 유효하다. 남은 minor는 POSIX descendant kill 제한, npm version 조기 실패 시 임시 디렉터리 정리, aggregate diagnostic status count 문서화이며 조사 결과를 무효화하지 않는다.
- Claude Code `claude-opus-5-5`, 최종 milestone: PASS, blocker 0 / major 0 / minor 4 / note 5. core/MCP 예산 표현, 표와 tracked manifest 표현 3건을 수정했다. 모델 기록 삭제 제안은 검토 제공자·실제 모델을 기록하라는 사용자 지침에 따라 미채택했다. 모델명은 자기 선언이 아닌 성공한 CLI 응답 metadata로 확인했다.
- Draft PR remote 검증 후 final local gate를 다시 실행한다. mixed120의 warning assertion은 구현 PR에서 명시적으로 추가한다. D-2는 trailing blank 줄만 생략해도 경고하는 조건이므로 사용자 결정에 포함한다.

## 10. 사용자 결정 요청

- D-1(a) 연속 complete-line prefix를 승인할지.
- D-2의 `summary_truncated` 명칭과 조건을 승인할지.
- D-3의 의미 gate 보존, late120/mixed124 acceptance 및 mixed120 omission 방식을 승인할지.
- D-4에서 naïve 비용이 기준을 넘을 경우 output-equivalent bounded selector로 진행할지.
- case-specific fixture와 p95 상한, A/A 무효화·재실행 규칙을 구현 PR 사전등록으로 채택할지.

승인 전에는 제품 코드·테스트·번들·역사 JSON을 수정하지 않는다.
