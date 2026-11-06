# N-27/N-30 영어 전각 콜론·별표 강조 라벨 — 구현 전 계획

- Tier E 계획 Task. 기준 `312a159`, 브랜치 `codex/n27-n30-credential-plan`.
- 이번 Task의 산출물은 이 문서, `research/src/n27-n30-credential-impact.mjs`, `research/results/n27-n30/2026-11-06-impact.json` 세 파일뿐이다. 제품 코드·테스트·설정·성능 측정은 지금 변경하지 않는다.
- 목적: 문장 안 영어 라벨 뒤 전각 콜론과 라벨 바깥 별표 강조가 `semantic`으로 남는 N-27/N-30을 조사하고, 승인된 후보 B를 후속 구현 Task로 넘긴다.
- 구현은 PR #95 merge 이후 최신 `main`과 사용자 계획 승인을 기다린다. 계획 승인 범위에는 아래 분류 출력 assertion 6개와 F21 원문 assertion 1개의 이관을 명시적으로 포함한다.

## 확정 결정 — 후보 B (L-1–L-6)

| ID | 결정 |
|---|---|
| L-1 | 영어 #0 및 F-21 E-3의 구분자에 전각 콜론 `：`을 추가한다. `[:=]` → `[:=：]`. |
| L-2 | 라벨 뒤 닫힘 별표 `\*{0,3}`을 허용한다. 영어 두 규칙은 `\b` 뒤, 한국어 두 규칙은 라벨 뒤에 둔다. |
| L-3 | 밑줄 강조는 넣지 않는다. 문장 안 밑줄 라벨은 남는 한계다. |
| L-4 | 따옴표·괄호 라벨은 범위 밖이며 N-32로 추적한다. |
| L-5 | 새 tuple을 만들지 않고 기존 #0의 네 정규식을 제자리 수정한다. 기존 양성 ⊆ 새 양성을 literal oracle로 확인한다. |
| L-6 | 취소선·코드 span·대괄호·복수형 `passwords`는 추가하지 않는다. |

현재 `src/core/policy.ts`에서 읽은 literal과 후보 B를 raw pipe가 표를 깨지 않도록 fenced block으로 고정한다. flags와 왼쪽 경계는 그대로 둔다.

```text
English #0 — /iu, English boundary preserved
old: /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\s*[:=]/iu
new: /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\*{0,3}\s*[:=：]/iu
F-21 E-3 — /i, English boundary preserved
old: /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\s*[:=]/i
new: /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\*{0,3}\s*[:=：]/i
Korean — /i, no added left boundary
old: /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\s*[:=：]/i
new: /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\*{0,3}\s*[:=：]/i
Korean API — /i, ASCII alphanumeric lookbehind preserved
old: /(?<![A-Za-z0-9])api[ \t]?키\s*[:=：]/i
new: /(?<![A-Za-z0-9])api[ \t]?키\*{0,3}\s*[:=：]/i
```

## 영향 조사와 fail-closed controls

- 두 기준 `27b4356`와 `312a159`의 tracked Markdown을 `git ls-tree`로 열거하고 `git show <commit>:<path>`로 blob을 읽는다. 작업 트리·CRLF·이번 계획 문서가 집계에 섞이지 않도록 LF, 줄/빈 줄 문단 단위와 출처를 고정한다.
- [조사 스크립트](../../../research/src/n27-n30-credential-impact.mjs), [결과 JSON](../../../research/results/n27-n30/2026-11-06-impact.json): 저장소 루트에서 `npm.cmd ci --ignore-scripts` → `npm.cmd run build` → `node research/src/n27-n30-credential-impact.mjs --out research/results/n27-n30/2026-11-06-impact.json`으로 재현한다. 줄/문단은 종류를 구분한 exact LF 문자열로 중복 제거한다(내용은 trim하지 않음).
- `27b4356`: 208 Markdown / 23,720 고유 단위 / 새 hit 9 / mode 변화 0 / reasons 변화 9로 사전 설계와 일치. `312a159`: 209 / 23,846 / 새 hit 13 / mode 변화 2 / reasons 변화 13(이 중 mode 불변 11). 차이는 추가된 사전 설계 Markdown 1개, 고유 단위 +126, 새 hit +4뿐이며 classifier source는 동일하다.
- 계획·핸드오프에만 출처가 있는 입력을 제외하는 별도 민감도 집계는 현재 11,058 단위에서 변화 0이다. 본 집계의 과보호 사례는 역사적 문서 예시를 포함하므로 실제 사용자 입력에서 변화가 없다는 뜻은 아니다.
- fixture 206,242 출현 / 203,233 고유 입력: frozen120+corpus120+F21 overlay4+core/F21 literal119+기존 generator177,208+benchmark10+N17 classifier 호출352+F21 classifier 호출85+split matrix28,224. 고유 입력 4개의 mode/reasons 및 predicate가 바뀌며 나머지는 같다. 44개 테스트 파일의 호출 위치 inventory와 통합·대용량 stress 제외를 JSON에 명시했다. callback replay는 입력·기대값 수집이며 Vitest 실행을 대신하지 않는다.
- baseline 빌드에서 확인한 dist hash를 고정하고 두 기준 및 현재 작업 트리의 build 입력이 같음을 검사한다. JSON에 policy/dist/lockfile SHA-256, Node/TypeScript와 build-input diff를 남긴다. 실행 시의 일치 검사이며 과거 clean-build 이력을 자동 입증한다는 주장은 하지 않는다.
- 네 old literal이 각각 정확히 한 번일 때만 overlay한다. identity overlay byte equality, 잘못된 literal의 실패, 규칙별 baseline hit ⊆ candidate hit를 검사한다. tuple #0 외 변경, ordered `reasons`/`secret` 위치, 다른 tuple, `RangeError`·resource fallback 변화는 실패다.
- 전체 tracked `tests/**/*.test.ts`별 classifier/internals/`.test` 호출 위치와 포함·제외 사유를 기록한다. N17/F21 동기 callback은 모든 현재 classifier 호출을 수집하며 full-output assertion·다른 matcher·internals 호출 수를 test별로 남긴다. N17 split 28,224 입력은 네 predicate flip 0을 별도로 assert한다. 출력이 같아도 predicate가 바뀌는 입력은 출처별 `predicateChanged`에 기록한다. 비동기 integration 실행 전체를 재현한 조사는 아니다.
- 기대값 이관 제안은 `tests/policy-n17.test.ts`의 3개 table row, 6개 assertion(4개 고유 입력)으로 한정한다: approved-negative `[6]`의 `**비밀번호**: hunter2`, `[12]`의 `password：hunter2`, 13-boundary `[9]`의 동일 Korean bold 입력. 각 단독 `unknown`/문장 `semantic` → `exact`, reasons `["secret"]`, warnings `["lossy_compression_not_allowed"]`. 앞의 두 row는 positive 표로 옮기고 boundary row의 설명도 새 계약과 맞춘다. 사전 설계 §7.2의 기존 기대값 불변 문장에 대한 이 예외를 계획 승인에 포함하며 나머지 기대값은 보존한다. 이번 Task에서는 테스트를 바꾸지 않았다.
- 위 6개는 **분류 출력** 이관 수다. 구조 검사에서는 `tests/policy-f21-rework.test.ts:33`의 production E3 `.source === historical oracle.source` 1개도 변경된다. 과거 oracle은 보존하고 production을 승인된 B의 frozen E3 literal과 비교하도록 해당 assertion과 test 이름을 갱신한다. JSON `structuralAudit`에 관련 8개 파일의 source/flags/hash 참조 및 판정을 기록했다. N17 tuple 구조·flags·split predicate는 유지하며, N17 evidence의 hash/recipe는 과거 자료이므로 수정하지 않는다.
- 후속 성능 도구는 기존 N17 runner/analyzer를 **N27 전용 복사본**으로 만들어 과거 캠페인과 evidence tests를 보존한다. 구현 시 새 baseline으로 조사를 재실행하며 이 계획 자체의 예시 증가를 따로 집계한다. 예상은 plan/handoff 출처의 hit 증가와 민감도 집계 불변이며, 다른 출처 변화가 나오면 원인을 설명하고 이관 범위를 다시 검토한다.

## 독립 oracle 및 구현 전 테스트 계약

- 후보 regex로 기대값을 계산하지 않는 literal oracle을 쓴다. 13 labels × 18 forms × (줄 단독/문장 안) 두 placement를 직접 고정하고 mode·reasons·tuple #0을 기대값으로 쓴다.
- 사전 설계 §2의 음성 9개를 유지하고, `**password**：`, `**password** ：`, `*비밀번호*：`, `****password****:`, `**password*:`, `password*:`, NBSP/U+3000 공백, `/i`·`/iu` case 변형을 추가한다. 닫힘 별표 4개는 새 양성이 아니며, opening/closing 별표가 맞지 않는 1–3개 형태는 L-2가 허용하는 보수적 보호다(Markdown 구문 분석 아님).
- 밑줄 한계의 실제 문장 안 입력 네 개는 다음 baseline mode를 고정한다: `__password__:` → semantic, `_password_:` → semantic, `_비밀번호_:` → semantic, `__비밀번호__:` → unknown. 이는 13 labels로 치환한 추상 placeholder가 아니다. label에 따라 `numeric_or_table` 등 다른 reasons가 붙을 수 있으므로 literal별로 reasons도 기록한다.
- 한국어 positive가 현재 baseline에서 이미 `exact`인 행은 예전 N-17 semantic oracle을 재사용하지 않는다. baseline/candidate full classify output을 각각 비교한다.

## 성능 게이트 사전등록 — 18 recipes, 이번 Task에서는 미측정

입력은 모두 정확히 10 MiB다. generator는 `Buffer.alloc(10 * 1024 * 1024, 0x20)`로 ASCII space를 채운 뒤 UTF-8 `prefix`를 복사하고, 전체 `unit`만 들어가는 최대 구간을 반복한 다음 남은 byte를 ASCII space로 둔다. 입력 생성에는 난수가 없고 schedule/bootstrap seed만 고정한다. 표의 mode/reason은 literal oracle이며 `warnings`는 semantic에서 `[]`, exact/unknown에서 `["lossy_compression_not_allowed"]`다. 시간 측정 없는 로컬 보조 검사에서 18개 출력이 일치했지만 원자료는 이번 세 파일에 포함되지 않은 관찰이다. 구현 시 manifest에 hash와 oracle을 고정하고 재검증해야 한다.

| 그룹 | recipe / generator unit | A / A′ / B 기대값 |
|---|---|---|
| 새 worst 6 | `starred-password-nbsp-60`: prefix 없음, unit `**password**` + NBSP×60 | `unknown / insufficient_semantic_signal / #0 false` (세 variant 동일) |
| 새 worst 6 | `starred-password-nbsp-8`: prefix 없음, unit `**password**` + NBSP×8 | 동일 |
| 새 worst 6 | `starred-korean-nbsp-8`: prefix 없음, unit `**비밀번호**` + NBSP×8 | 동일 |
| 새 worst 6 | `starred-password-wide-8`: prefix 없음, unit `**password**` + U+3000×8 | 동일 |
| 새 worst 6 | `password-stars`: prefix 없음, unit `password************ ` (trailing ASCII space 포함) | 동일 |
| 새 worst 6 | `starred-password-space`: prefix 없음, unit `**password** ` (trailing ASCII space 보존) | 동일 |
| N-17 worst 7 | `ko-repeated-space`: unit `비밀 번호 ` | `unknown / insufficient_semantic_signal / #0 false` (세 variant 동일) |
| N-17 worst 7 | `ko-label-space`, `ko-label-tab`, `ko-label-nbsp`, `ko-label-wide`, `ko-label-lf`, `ko-label-mixed`: prefix `비밀번호`, units 각각 space, TAB, NBSP, U+3000, LF, ` \t\u00a0\u3000\n` | 동일 |
| attempt-2 reps 5 | `ko-prose-10mib`: unit `회의실에서 다음 일정과 검토 결과를 함께 정리합니다.\n` | `semantic / natural_language / #0 false` (A/A′/B 동일) |
| attempt-2 reps 5 | `en-prose-10mib`: unit `We should review the proposed schedule before the next meeting and share the summary with everyone.\n` | `semantic / natural_language / #0 false` (A/A′/B 동일) |
| attempt-2 reps 5 | `code-10mib`: unit `const value = true;\n` | `exact / code_syntax / #0 false` (A/A′/B 동일) |
| attempt-2 reps 5 | `markdown-10mib`: unit `# Project notes\n\nWe should review the proposed schedule before the next meeting.\n\n` | `unknown / insufficient_semantic_signal / #0 false` (A/A′/B 동일) |
| attempt-2 reps 5 | `ko-credential-10mib`: unit `회의실 비밀번호: hunter2 이니까 접속할 때 참고해 주세요. ` | A/A′/B `exact / secret / #0 true` (N-17 is already in baseline `312a159`) |

위 표의 N-17 worst 묶음은 7 recipes(첫 행 1 + label whitespace 6)이며 전체는 6 + 7 + 5 = 18이다. 모든 recipe의 generator, seed 없음, size, input hash, A/A′/B mode·reasons·tuple #0을 구현 전 primary verification에서 다시 assert한다. 불확실한 값은 추측하지 않는다.

- schedule shuffle seed `0x4e173001`, bootstrap seed `0x4e173002`; warmup 12 rounds, measured 36 rounds, 6 blocks, 세 variant의 6 permutations, round당 각 variant 1회씩 총 3 calls를 쓴다. A/A′/B 모두 같은 방식으로 독립 빌드한 파일 module을 로드한다(조사 스크립트의 data URL을 timing에 사용하지 않음). 판정값은 per-round `B / mean(A,A′)`의 median(36)이다.
- 지정된 18 recipe는 E-3 전용 `passwd` 및 Korean API lookbehind의 별표 near-miss를 별도로 재지 않는 한계가 있다. 두 경로는 기능 행렬로 확인하며 18개 결과를 모든 label의 성능 보장으로 일반화하지 않는다. 추가 recipe는 이 계획 범위 변경으로 별도 논의한다.
- `median(A′/A)`는 `[0.97, 1.03]` 밖이면 INVALID다. 10,000회 six-whole-block bootstrap, type-7 quantile `.025/.975`를 기록한다. point > 1.03은 FAIL, point 이하이면서 CI upper > 1.03은 BORDERLINE, drift는 진단 전용이다.
- PASS는 point와 CI upper 모두 ≤1.03일 때다. INVALID는 전체 판정에서 우선하지만 개별 FAIL을 보존하며 FAIL이 하나라도 있으면 retry하지 않는다. 동일 사전등록 아래 INVALID-only 캠페인만 최대 1회 재시도하고 FAIL/BORDERLINE 통과를 찾는 재측정은 금지한다. warmup cells `18×12×3=648`, measured cells `18×36×3=1,944`. 새 campaign의 attempt 1/2와 최신 baseline을 사용한다. 준비 manifest·runner/analyzer·입력/output hash를 **측정 전에 커밋**하며 대표 입력의 ms 이상 구간 여부도 측정 결과에서 확인한다. 현재 Task에는 timing 측정이 없다.
- BORDERLINE은 PASS가 아니며 구현 완료 판정을 보류하고 사용자에게 결과를 보고한다. 대표 입력은 각 variant의 36회 median이 1 ms 이상이어야 하며 미달하면 캠페인을 INVALID로 처리한다. recipe를 빼거나 반복 수를 사후 조정해 통과시키지 않고 설계 변경 승인을 받는다.

## 검토·후속 범위

- Claude `claude-opus-5-5`, 최종 재검토: `APPROVE`, blocker 0 / major 0 / minor 2 → 두 minor 반영(자식 검사 미조사 명시, E3 변수 연결 assert). 정적 packet의 JSON 표시용 집계·축약은 커밋 JSON과 구분하며, 원본 결과는 별도 프로세스 재실행과 script LF hash로 검증했다.
- 검증: N17 대상 340개 및 전체 44파일 1,761개 PASS/5 skip, typecheck/build/validate:plugin/check:exact demo PASS. 잘못된 dist hash는 결과를 쓰기 전에 exit 1로 거절했다. 제품·테스트 수정과 성능 측정은 없으며 구현 착수 승인을 기다리는 계획이다.
- 후속 구현 예정 파일은 `src/core/policy.ts` 네 regex, tests/oracle, evidence, `docs/design.md`, bundle이다. 현재 Task는 위 3개 산출물만 허용하며 no Ready/no merge/no product implementation이다.
- 후속 구현은 PR #95 merge 후 최신 main에서 시작하며, 사용자 계획 승인에 분류 출력 6개 + E3 원문 비교 1개의 이관을 명시적으로 포함한다. Ready·merge는 별도 승인 대상이다.
