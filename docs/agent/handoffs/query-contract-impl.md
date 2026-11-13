# query-contract-impl (N-35/N-36) — Task handoff

- 작업자: Claude Code (claude-opus-5-5, transcript assistant `model` 필드로 확인), Orca worker task_978cf26f2f92. PM·최종 판정: Codex(Astra)
- 브랜치 `claude/query-contract-impl`, base origin/main `5d668f9`, Draft PR #120
- 계획: PR #117 head `8b8dd84` `docs/superpowers/plans/2026-11-13-query-contract-n35-n36.md`
- 결정(사용자 확정 2026-11-13): D1 C2, D2 B, D3 `null` 거부, D4 `Infinity`/`MAX_SAFE+1` 거부, D5 README, D6 재현율 감소 수용

## 현재 상태

| 항목 | 상태 |
|---|---|
| RED `3a55eac` | targeted 51건 중 T35-1~6·T36-1~3 9 fail, C35-1~3·C36-1~3 포함 42 pass |
| GREEN `3b50def` | `src/core/artifacts.ts` 두 hunk(계획 §4.1 그대로), README 2문장, `bin/` 재생성. targeted 51/51 pass |
| full gate(head `3b50def`) | 7단계 모두 exit 0. test 50파일 4371 pass / 5 skip. 실행 전후 status clean |
| benchmark | base `5d668f9`와 시간 외 결과 같음. 다른 곳은 `environment.commitSha`·`dirty`뿐(base의 dirty는 빌드가 만든 `bin/` CRLF 차이) |
| C35-3 구별력 | 정규식을 A안으로 잠시 바꾸면 C35-2·C35-3 fail. 원복 후 byte 동일, 커밋 없음 |
| T36-4 | **NOTRUN**: S-10(#113) 미merge. S-10 merge 뒤 통합 회귀에서 작성·실행 |

## 바뀐 것

- `tokenize`: `/[\p{L}\p{N}_./:-][\p{L}\p{M}\p{N}_./:-]*/gu`. term은 결합 문자로 시작하지 않고, 뒤따르는 결합 문자는 유지한다
- 직접 API `contextLines`: 생략하면 2. 음이 아닌 safe integer(`-0`, 11 이상 포함)만 받는다. 그 밖의 값은 `"contextLines must be a non-negative safe integer"`를 던진다. 검증 위치는 `maxExcerpts` 검증 뒤, store 접근 전이다
- 테스트: `tests/query-artifact-boundaries.test.ts`(직접 API, generic counting `ArtifactStore`로 `get` 0회), `tests/query-artifact-mcp.test.ts`(T35-5, C36-2)

## 바뀌지 않은 것 (origin/main 대비 diff 0)

`src/server/index.ts`(MCP 스키마 0..10), `tests/fixtures/`, `src/core/policy.ts`, `src/core/types.ts`, `research/`, `benchmarks/`. ranking·동점·`includes`·엄격 예산·`moreMatches`·sourceMap 코드와 기존 테스트 기대값도 그대로다.

## 의도된 동작 변화 (D6)

- harakat/niqqud가 있는 질의는 무표기 원문 줄과 더는 맞지 않는다. 터키어 `İ` 질의도 원문 `Istanbul`과 맞지 않는다. 그런 질의는 기존 `no_query_match` 경로로 간다(T35-6이 고정)
- 직접 API의 `null`, 비정수, 음수, `NaN`, `±Infinity`, `MAX_SAFE+1`, 문자열, 불리언은 이제 오류다

## 증거 (메인 checkout, git 추적 안 함)

- `codex_review/query-contract-impl-2026-11-13/`: `red*.log`, `green*.log`, `variantA*.log`, `build.log`, `gate/`(단계별 로그, `exits.txt`, 실행 전후 status, base benchmark, `benchmark-compare.txt`)
- Argon: `codex_review/argon/2026-11-13_query-contract-impl-{plan,final}-{bundle,argon}.md`
- 보고: `codex_review/codex_paste_2026-11-13_query-contract-impl.md`

## 남은 일

- Astra 최종 판정. Ready·merge는 사용자 승인 뒤에만 한다
- S-10 merge 뒤 `git merge origin/main`(merge commit)으로 합치고, 그 뒤 `npm run build` → full gate → T36-4 작성·실행
- 범위 밖 관찰(별도 Task 후보): `toLocaleLowerCase` locale 의존, `policy.ts`의 `\p{L}` 정규식, 직접 API `maxTokens` 검증
