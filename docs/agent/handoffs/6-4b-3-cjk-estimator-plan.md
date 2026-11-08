# 6.4b-3 CJK 추정기 계획·영향 조사 (Draft)

> 범위: 계획·영향 조사만. 이번 작업에서는 제품 코드/제품 테스트/config를 수정하지 않는다.
> Tier E; 제품 구현 승인은 별도다. 조사 수치와 독립 검토를 근거로 D-1–D-3을 제안한다.

## 목적과 고정 범위

- 기준 커밋 `f6a9c825376d2daf72c63a3822cc839247cc73f3`; 조사 산출물은 `research/src/cjk-estimator-impact.mjs`, `research/src/cjk-estimator-variants.mjs`, 결과 JSON 2개, `docs/agent/handoffs/6-4b-3-cjk-estimator-plan.md`뿐이다.
- 임시 variant는 `base→baseline`, `a→d1a-only`, `oldrangeCP→d2b-only`, `aCP→combined-a-cp`로 대응한다. 각 variant는 기준 커밋을 공유 로컬 clone의 detached checkout으로 materialize하고 base blob identity를 전후에 검증·기록한다(작업 트리 복사 금지).
- D1c는 Unicode 16의 명시적 탐색 union일 뿐이며 완전한 CJK 언어/문자 집합 주장이 아니다. 기준: [Unicode 16 Blocks.txt](https://www.unicode.org/Public/16.0.0/ucd/Blocks.txt).

## 결정 항목

- **D1a:** `U+3040–U+30FF ∪ U+3131–U+D7A3`; 기존 `U+3131–U+D79D`를 여섯 음절만 확장하며 `U+3040–D7A3` 연속 범위로 합치지 않는다(Bopomofo 추가 금지).
- **D1b:** D1a `∪ U+1100–U+11FF ∪ U+FF66–U+FF9F ∪ U+FF01–U+FF60 ∪ U+FFE0–U+FFE6`.
- **D1c:** `U+1100–U+11FF, U+2E80–U+2EFF, U+2F00–U+2FDF, U+2FF0–U+303F, U+3040–U+30FF, U+3100–U+31FF, U+3200–U+33FF, U+3400–U+4DBF, U+4E00–U+9FFF, U+A960–U+A97F, U+AC00–U+D7A3, U+D7B0–U+D7FF, U+F900–U+FAFF, U+FE10–U+FE1F, U+FE30–U+FE4F, U+FF01–U+FF60, U+FF66–U+FF9F, U+FFE0–U+FFE6, U+1AFF0–U+1AFFF, U+1B000–U+1B16F, U+20000–U+2A6DF, U+2A700–U+2B73F, U+2B740–U+2B81F, U+2B820–U+2CEAF, U+2CEB0–U+2EBEF, U+2EBF0–U+2EE5F, U+2F800–U+2FA1F, U+30000–U+3134F, U+31350–U+323AF` (Yi 등 무관 블록 제외). c는 U+3000 공백도 1자=1토큰으로 세며, 반각 구두점 FF61–FF65/반각 한글 FFA0–FFDC 등은 이 탐색 union에서 제외한다. Unicode 16 고정 범위이며 완전한 CJK 집합이 아니다.
- **D2a:** `nonCjk = max(text.length - cjkChars, 0)`(UTF-16 단위); **D2b:** `nonCjk = max([...text].length - cjkChars, 0)`(code point 단위). 나머지 `wordish/max/ceil/최소1/빈값0` 규칙은 동일하며 D2는 D1a/b/c 각각에 적용한다. D1c에는 astral 확장 문자가 있으므로 D2b 의존성을 별도 기록한다.
- **D3a:** `profileVersion`을 `heuristic-v1`로 유지하고 release/commit provenance를 문서화. **D3b:** `heuristic-v2`로 변경. 조사에서 변화가 D1a의 가나·끝 여섯 음절뿐이면 D3a, code-point 보정 또는 기타 입력 변화가 공개 출력에 영향을 주면 D3b를 권고한다. 현재 profile 변경은 하지 않는다. D3a를 선택하면 공개 `estimate_context` 추정치가 같은 `heuristic-v1` 안에서 달라진다는 점을 명시한다.

## 조사 설계와 보존 규칙

- 문자 행렬은 요청된 9개 범주, 경계쌍, emoji/고립 surrogate, U+3000/FEFF, VS16/IVS/ZWJ, Han B/I/compat 경계, Latin Ext-D/Yi를 포함하고 D1a/b/c×D2a/b 전후 계산값을 기록한다. 48개 행렬의 old 값은 기준 본체와 대조하고, 아래 6개 문자열×8 추정기만 독립 literal 기대값으로 assert한다: `aaaa→1`, 네 가나(기존 1/새 4), 끝 네 음절(기존 1/새 4), emoji 둘(기존 1/code-point 1), emoji 넷(기존 2/code-point 1), Ext-B 한 글자(UTF-16 2/code-point 1).
- raw corpus는 Git 추적 UTF-8 텍스트 전체(파일·길이가 0보다 큰 줄 unit(공백만 있는 줄 포함); binary는 제외했다고 manifest에 명시)다. semantic corpus는 TS/JS의 cooked string/template 조각과 JSON string values만 포함하며 JSON key는 제외한다. AST 파싱만 사용하고 template expression/동적 실행/런타임 문자열은 주장하지 않는다. invalid tagged-template escape와 parse 실패는 진단으로 기록한다.
- 각 결과에는 manifest 경로/Git blob OID/내용 SHA-256, unit UTF-8 SHA-256, variant별 변경 unit/file 수, 양·음 delta, 단위 종류별 최대 signed/absolute delta, 위치와 old/new 값(저장소 원문을 결과에 echo하지 않음)을 기록한다. 966개 텍스트/79개 제외 파일, 2,155,266 unit; 파일·줄·semantic은 서로 겹치는 관측 단위이므로 합계를 독립 입력 수로 해석하지 않는다; low-confidence/warning은 보존하며 billing/cost 변화는 주장하지 않는다.
- variant별 full test와 benchmark는 base blob identity를 먼저 검증한다. `b/c` variant 테스트는 `NOT RUN (탐색 정의; 사용자 승인 전)`로 명시한다. F21 live estimator prelude 예외와 N17/N27 pinned-source 경계를 분리 기록하고, heuristic-v1 literal은 src 1곳/benchmark 3곳/core.test 8곳이며 task36/task39 JSON은 profileVersion 스키마만 포함한다.
- Windows에서 저장소 루트 cwd와 고정 TypeScript 5.9.3 내부 AST 필드를 사용하는 조사 도구다. unit SHA-256은 UTF-8 인코딩 기준이며 lone surrogate는 U+FFFD로 치환되어 해시만으로 구별되지 않는다(경로/kind/offset 식별자 별도).
- benchmark는 base를 2회, 각 후보를 1회 실행하고 generated timestamp·environment provenance·latency 같은 비결정/시간 필드는 제외한 나머지 exact report를 비교한다. raw report와 sanitized evidence, source/patch hash를 함께 보존한다.
- budget boundary 제품 테스트는 runtime trace가 아닌 정확한 estimate 전후 flip을 budgets `80/120/240`에서 독립 확인한다. flip 수(80/120/240): a 및 oldrangeCP 0/0/0, b 2/8/0, c 3/9/1(CP 여부 동일); 전체 runtime budget coverage로 과장하지 않는다.

## 향후 구현 PR(이번 Draft에서는 실행하지 않음)

1. 사용자 승인 후 먼저 `tests/core.test.ts`에 독립 기대값을 추가한다: 가나 `かなかな`=4, `String.fromCodePoint(0xD7A3).repeat(4)`=4, `estimateContext({text:"かなかな",maxTokens:3}).fitsBudget`=false. 기준 함수에서는 1/1/true이므로 RED를 확인한다. D2a 유지 시 emoji 4자=2, U+3100 4자=1, Yi 4자=4를 고정한다.
2. 선택이 D1a/D2a/D3a이면 `src/core/token-estimator.ts`의 정규식만 `/[\u3040-\u30FF\u3131-\uD7A3]/u`로 바꾼다. literal matrix와 기존 core/query/MCP 테스트, 전체 gate를 GREEN 확인한다. 기존 기대값 이관 예상 0건; 예상 밖 변경은 멈추고 보고한다. low-confidence/warning/profile과 UTF-16 잔여 길이 계산을 유지한다.
3. `docs/design.md`의 추정기 설명에 정확한 범위, UTF-16 잔여 길이 한계, v1 수정 기록과 commit provenance를 적는다. corpus JSON 재생성 byte 동일성(variant 실행의 임시 경로/환경 provenance는 별도)과 npm test/typecheck/build/smoke:mcp/validate:plugin/diff를 확인한다. 현재 관측 환경 Node `v24.18.0`, TypeScript `5.9.3`.

## 성능 사전등록(구현 PR에서만 측정)

- 입력은 반복 단위 `a`, `かなカナ`, `가힣`, `𠀀🙂`, `aかな漢가𠀀🙂 `에 대응하는 ASCII, kana, Hangul, astral, mixed의 정확한 UTF-8 **1 KiB와 10 MiB**다. 10 MiB는 ASCII padding으로 byte 수를 정확히 맞추고 surrogate를 절대 분할하지 않는다(1 KiB도 동일).
- variant A/B를 독립 **6 blocks**, 각 block **5 warmups 후 20 samples**, AB와 BA 교대 순서로 측정한다(같은 batch; 10 MiB batch 1, 1 KiB batch 1000). A/A control도 같은 절차로 측정한다.
- 아래 수치는 사용자 승인을 위한 사전등록 제안이다. median/p95는 각 입력의 A/B 각 120 samples에서 산출하며 AB/BA strata는 각 60 samples다. Node `v24.18.0`, OS/CPU/전원 모드를 기록하고 측정 중 동일하게 유지한다.
- 승인 임계값은 입력별 median ratio `≤1.05`, p95 ratio `≤1.10`, AB·BA 각 strata median `≤1.05`; A/A median deviation `≤3%`, p95 `≤5%`다. p95 ratio는 nearest-rank p95의 비율이다.
- A/A bound 위반 또는 threshold 판정 불능은 **INCONCLUSIVE**로 acceptance를 막고 재시도/선택적 cherry-pick하지 않는다. crash/OOM/실패는 FAIL이며 어느 한 입력의 FAIL도 전체 acceptance를 막는다. 이번 Draft의 성능 측정은 `NOT RUN`이다.

## 결과 자리와 승인 경계

- 아래 표는 기준 대비 변경 unit 수다. 파일=전체 파일 텍스트, 줄=길이가 양수인 줄, 문자열=TS/JS cooked+JSON value. 최대치는 모든 종류의 절대 delta이며 독립 입력 합계가 아니다.

| 후보 | 영향 파일(어느 단위든) | 파일 unit | 줄 unit | 문자열 unit | 최대 변화 | 전체 테스트 실패 |
|---|---:|---:|---:|---:|---:|---|
| a / UTF-16 | 2 | 1 | 1 | 0 | 1 | 0 |
| a / code point | 11 | 9 | 28 | 9 | 10 | 0 |
| b / UTF-16 | 32 | 32 | 527 | 417 | 126 | NOT RUN |
| b / code point | 41 | 40 | 554 | 426 | 126 | NOT RUN |
| c / UTF-16(진단 전용) | 44 | 40 | 2805 | 2704 | 1097 | NOT RUN |
| c / code point | 49 | 44 | 2828 | 2713 | 1087 | NOT RUN |
| 기존 범위 / code point | 9 | 8 | 27 | 9 | 10 | 0 |

- 권고: **D1a / D2a / D3a**. D2b는 기존 범위에서도 44 unit이 바뀌므로 별도 후속 항목; D1b/c는 범위·추정치 감소 가능성을 추가 검토한다. v1만으로 알고리즘 재현을 보장하지 않으므로 commit을 함께 기록한다.
- a의 실제 위치: `research/src/n17-korean-credential-impact.mjs` 전체 7062→7063, `research/src/n17-korean-credential-probe.mjs:100` 줄 20→21. 과거 실험 결과를 재작성한 수치가 아니라 소스 텍스트 자체에 추정기를 적용한 결과다.
- 기준/a/oldrangeCP/aCP 모두 3250 PASS/5 SKIP/0 FAIL, 이관 목록은 빈 배열이다. 각 임시 복사본의 추적 blob 1045개는 patch 전 mismatch 0이며 patch 후 estimator 외 차이는 없다. 기준 A/A 및 후보별 benchmark 비시간 값 일치; timing-dependent passed는 별도로 기록했다.
- D1–D3 최종 선택은 사용자 승인 사항이다. 이 Draft는 scripts+results+handoff 계획만 제안하며 제품 구현·문서 설계 변경은 향후 승인된 구현 PR의 범위다.

## 증거·검토 상태
- 결과: [corpus JSON](../../../research/results/cjk-estimator-impact.json), [variant JSON](../../../research/results/cjk-estimator-variants.json). 실행: `node research/src/cjk-estimator-impact.mjs --self-test`; `node research/src/cjk-estimator-impact.mjs`; `node research/src/cjk-estimator-variants.mjs`(임시 clone/전체 tests/benchmark 포함).
- 원시 분모: 파일 966, 줄 877348, JSON 값 1245384, TS/JS 문자열 31568. NUL binary 79개 제외, 파싱 오류 0; manifest에 전체 출처를 보존한다. 부모 에이전트는 실제 빌드 함수로 a/oldrangeCP/aCP의 모든 파일·줄·semantic 변경 수를 독립 확인했다.
- 최초 실행 오류: cat-file batch 입력의 join 구분자를 수정하고 각 응답 blob SHA-1을 검증했다. 위치 계산과 반복 집계를 보강했으며 corpus 수치는 동일하다. variant 증거 경로만 실제 생성 경로로 보정했으며 tests 재실행 결과로 위장하지 않았다.
- Claude Opus 5.5 초기 검토: REQUIRED FIXES; 후보/파싱/성능 정의를 구체화했고 마지막 materialization 지적은 1045개 blob 검증으로 대응했다. 마일스톤 Claude Opus 5.5: REQUIRED FIXES, 0 blocker/2 major/7 minor/4 notes; UTF-16 위치와 templateFlags 진단을 수정했다. 변경 위치 5590개를 원문으로 독립 검산해 mismatch 0, 별도 위치/invalid-template 불변식 2개 PASS; Claude Opus 5.5 scoped 재검토: 0 blocker/0 major/2 minor/3 notes, Major 모두 해소; 남은 lockfile hash/comparedFields 메타데이터 2건은 실제 copy hash와 도구 정의로 수정·확인했다.
- 전달문 전제와 차이: F21은 live estimator prelude를 읽는다(`scripts/analyze-f21-uri-impact.mjs:247–253`); N17/N27/N30은 pinned git source다. 현재 F21 fixture는 ASCII. 결합 후보를 추가 대조했고 조사/variant 스크립트와 JSON을 각각 분리했다.
- 성능 게이트 측정/Ready/merge/제품 구현은 미수행. Draft PR과 최종 로컬 검증 뒤 사용자 결정을 기다린다.
- 초기 variant 실행에는 빌드 직후·테스트 전 blob 확인이 없었다. 부모 에이전트가 보존된 복사본을 **테스트 종료 후** 1045개씩 감사해 baseline 차이 0, 후보는 estimator+생성 bundle만 차이, lockfile 모두 기준과 동일함을 확인했다. 재실행 도구에는 pre-test 검증을 추가했으며 과거 실행에 있었다고 주장하지 않는다.
- `retrospective` 감사 필드는 부모 에이전트의 사후 감사 기록이며 원래 실행 도구가 출력한 필드가 아니다. corpus 재생성은 4,234,494 bytes 전체 동일(SHA-256 `dd66fbb1ec668559b744f7d7c70f4de52e59bce78d952b51b011473c7f3f2a49`).
