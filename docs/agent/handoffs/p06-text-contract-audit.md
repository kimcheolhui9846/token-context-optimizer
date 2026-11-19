# P06 텍스트·원문 추적·경계 입력 감사 — 수정 반영 핸드오프

## 1. 범위와 상태
- 기준: `747c2c0`, 서명된 `HANDOFF.md`의 T1–T6 및 독립 검토 절.
- 목적: 직접 API와 빌드된 STDIO MCP에서 원문 바이트·sourceMap·예산·정책 경계를 독립 대조한다.
- 소유: `tests/p06-text-contract-audit.test.ts`와 이 문서만 수정한다. `src/`, 데이터, 중앙 문서, 커밋/푸시/PR은 제외한다.
- 제약: 무해한 합성 문장, 기존 방어 fixture, 정적 보안 검토만 사용하며 우회·탐침·이미지 재현은 하지 않는다.
- P06 전용 20개 통과. 독립 재검토에서 주요 지적 4건의 해소를 확인했다. 전체 검사 결과와 N-41은 #127 및 중앙 검토 보고에서 함께 추적한다.

## 2. 계획과 수용 기준
- [x] T1 경로 표기·내용 변경·동일 내용 다른 경로와 원본 SHA-256/ID를 대조한다.
- [x] T2 CRLF/CR, 다국어 sourceMap, LF summary, whitespace tail 경계를 원본 Buffer로 대조한다.
- [x] T3 NFKC compatibility-only `foo`, combining-accent `café`, no-match/empty controls와 exact byte span을 분리한다.
- [x] T4 부분 성공, omission metadata, direct/built-STDIO 결과 경계를 확인한다.
- [x] T5 무해한 일반 문장과 기존 안전 양성 fixture의 정책/요약 경계를 연결한다.
- [x] T6 빈 값·공백·짧은 Unicode·direct null/MCP omission-null-zero 예산을 리터럴 oracle로 확인한다.
- Draft 검증 `b46e39b`에서 대상 1,477개 통과·2개 건너뜀, 전체 단일 워커 4,534개 통과·5개 건너뜀. 빌드·타입·MCP·플러그인·벤치마크 통과. 원시 로그와 명령별 종료 코드는 `.artifacts/p06-evidence/final-b46e39b-1/`에 있다.

## 3. 변경 사항과 독립 oracle
- 테스트는 같은 볼륨인 worktree `.artifacts` 아래에 상대 fixture를 만들고 `!isAbsolute(relativePath)` 및 `!relativePath.startsWith("..")`를 단언한다. cleanup은 생성된 `p06-rel-*`가 정확한 parent 하위일 때만 수행한다.
- Windows case-only 경로를 `skipIf`로 실행해 실제 OS 관찰을 남긴다. hardlink/다른 OS/공급자 token은 미검증이다.
- T3는 여러 줄 source에서 `foo`와 `café`를 각각 찾고 `Buffer.subarray(startByte,endByte)` 및 독립 `Buffer.byteLength`로 원본 범위를 단언한다. absent/empty query도 `maxTokens: 20`에서 분리한다.
- ID oracle은 원본 Buffer SHA-256과 `realpath + NUL + sha256` 후 16-hex 접두를 별도 계산한다. 후자는 구현 파생 oracle이며 공개 문서는 canonical path와 unchanged bytes의 관계만 문서화한다.
- T4-2는 built STDIO `estimatedTokens: 3`와 JSON text/structuredContent 동일성을 단언한다. T6-2는 MCP null과 zero 거부 및 omission 수용을 모두 확인한다.

## 4. 행별 위험·fixture·증거
| ID | 위험 → 정확한 테스트 | 관찰/문서 경계 및 결과 |
| --- | --- | --- |
| T1 | 경로/파일 버전 혼동 → harmless notes/before/after → `T1-1 returns the independently computed identity for absolute and relative reindexing`, `T1-2 gives a new identity when bytes change and keeps same-content paths distinct`, Windows `T1-3 observes Windows case-only path normalization` | 3/3 PASS. 기존 `source-map.test.ts` `L1 empty`, `L8 BOM and multibyte`, `keeps the existing invalid UTF-8 rejection`, `keeps the existing too_large rejection one byte over the limit`; `core.test.ts` `rejects malformed UTF-8 without changing source hash semantics`, `preserves UTF-8 BOM bytes in source maps and hashes original bytes`와 연결. allowed roots 기존 `uses the exact setup message for explicitly empty allowed roots`, `rejects files outside the allowed root`, 링크 fixture `accepts a file through a linked allowed root`는 baseline에 연결하며 OS 권한 skip 가능성을 기록한다. |
| T2 | CRLF/CR와 whitespace tail → ordinary multiline text → `T2-1`/`T2-2`/`T2-3` parameter cases, `T2-4 reports a complete Unicode query span against literal original Buffer offsets` | 7/7 PASS. summary LF는 관찰이며 문서에 명시되지 않아 N-43; sourceMap 1-based line, UTF-8 byte, end-exclusive도 관찰이며 N-44. `source-map.test.ts` N-33 `L1`–`L10`, `query-artifact-boundaries.test.ts` `keeps original delimiter bytes between adjacent excerpts`, `preserves Unicode, BOM, CRLF/CR delimiters and source immutability`, policy `"[control] G3 U+2028/U+2029/NEL are not policy or sourceMap line breaks"`는 lineCount만 연결한다. T2-2에서 첫 줄은 7, 다음 줄의 공백까지 합치면 8로 예산 7을 초과한다. 선택 경계와 `/\S/u` warning 경계를 구분한다. |
| T3 | NFKC 길이/byte offset 혼동 → fullwidth and combining-accent lines → `T3-1 matches an NFKC compatibility-only term and returns its original byte span`, `T3-2 matches a combining-accent term and returns its original byte span`, `T3-3 distinguishes absent and empty queries at a nonzero budget` | 3/3 PASS. 기존 `query-artifact-boundaries.test.ts` `preserves strict legacy shapes for unique best, no terms, no match, and empty source`, `core.test.ts` `returns a fallback when query terms do not match any line`, `returns a fallback when query tokenization finds no searchable terms`와 연결. locale별 folding은 미검증 coverage gap이다. |
| T4 | 예산 내 부분 성공/누락 metadata → two needle lines and filler → `T4-1 keeps warnings empty and fallbackReason null on direct partial success`, `T4-2 observes the same partial-success contract through built STDIO MCP` | T4-1·T4-2에서 direct/built 모두 3 tokens, omitted line `[3]`, warnings `[]`, fallback `null`. 기존 `query-artifact-boundaries.test.ts` `uses five excerpts by default and caps omitted metadata at twenty lines`, `T36-1 rejects non-integer, negative, non-finite, unsafe, non-number and null contextLines exactly`, `C36-1 keeps omitted, zero, negative zero and large safe-integer contextLines results`, `query-artifact-mcp.test.ts` `defaults to five tied excerpts and reports the omitted sixth anchor`, `C36-2 keeps rejecting contextLines %p at the MCP boundary`에 연결한다. `T4-3 compares both tool budget limits with the direct API on ordinary text`는 query·summarize 양쪽에 1·2000 및 범위 밖 입력을 대조한다. |
| T5 | harmless ordinary note의 과보호 → one-sentence note → `T5-1 treats a harmless ordinary note as semantic and keeps its summary source-backed`, `T5-2 exposes the same harmless semantic policy through built STDIO MCP` | 2/2 PASS. 기존 `core.test.ts` `fails open to source content when summarizing exact-sensitive artifacts`, `uses mode-specific fallback reasons for blocked lossy summaries`, `allows summaries for a long ordinary Note heading sentence`를 참고하며 실제 자격정보/공격 입력은 사용하지 않았다. |
| T6 | heuristic과 provider usage 혼동 → empty/whitespace/`가🙂`/ordinary → `T6-1 matches literal heuristic-v1 expectations for empty, whitespace and short Unicode inputs`, `T6-2 keeps estimate omission/null semantics and rejects zero at built STDIO MCP schema` | 2/2 PASS. 빈/공백/Unicode는 리터럴 `0/1/2`, direct null/0, MCP omission/null/0 증거이며 `heuristic_estimate_not_billing_usage`만 관찰한다. 기존 `summarizer-selection.test.ts` `preserves policy and first-complete-line fallback contracts`, `core.test.ts` `returns fallback when a semantic summary cannot include one complete line`와 연결한다. |

## 5. Direct ↔ built STDIO 경계 (문서화 vs 관찰)
| 필드 | direct literal evidence | built STDIO literal evidence | 경계 판정 |
| --- | --- | --- | --- |
| `contextLines` | 기본 2, 음이 아닌 안전한 정수. 기존 T36-1·C36-1 | 기본 2, 0–10. C36-2와 T4-2 | README 「Tool Behavior」에 두 범위가 명시돼 있다. |
| query·summarize `maxTokens` | T4-3에서 2001에 짧은 원문 반환 | T4-3에서 양쪽 도구가 1·2000을 수용하고 0·2001을 거부 | MCP 입력 스키마와 직접 실행 관찰을 구분한다. 직접 API의 수치 범위 문서화는 N-42. |
| estimate `maxTokens` | T6-1 omission/null/0: null 수용, 0은 fits false | T6-2 omission 수용, null/0 schema 거부 | output shape와 schema는 관찰; 공급자 사용량 아님 |
| 응답과 스키마 | 직접 query/summarize는 결과 객체를 반환 | T4-2/T5-2에서 JSON·structuredContent 대조 | query의 outputSchema 생략은 `query-artifact-mcp.test.ts`에서 단언한다. summarize는 `src/server/index.ts` 도구 등록을 정적으로 확인했다. |
| 기본 허용 디렉터리 | T1-1에서 allowedRoots를 생략하고 cwd 아래 무해한 파일을 색인해 같은 ID 확인 | README의 빈 TCO_ALLOWED_ROOTS 설정 안내 및 기존 `uses the exact setup message for explicitly empty allowed roots` | 직접 호출의 cwd 기본값과 MCP 설정 요구는 README에 명시돼 있다. |

## 6. Findings 처분
- **N-41 (확인필요, P07/P08)** 첫 제출의 2-worker 전체 검사 두 번과 변경 전 main 트리의 동일 전체 검사에서 이미지 테스트 한 건의 오류 분류 차이를 관측했다. 변경 전 결과는 4,513개 통과·1개 실패·5개 건너뜀이었다. 원인은 미확정이다.
- **N-42 (minor, P09 defer):** direct `maxTokens` 공개 허용 범위가 MCP 1–2000 schema와 달리 문서화되지 않았다. 동작 변경은 거부하고 문서만 후속 제안한다.
- **N-43 (minor, P09 defer):** summary LF join은 테스트와 현재 출력에서 관찰되지만 README/docs의 명시 계약이 아니다.
- **N-44 (minor, P09 defer):** sourceMap line 1-based, UTF-8 byte offset, end-exclusive endpoint는 literal/original-byte 관찰이며 공개 문서가 없다.
- **N-45 (note, separate):** deterministic 16-hex truncated ID의 충돌 caveat를 숨기지 않는다. 더 긴/별도 unique ID로 바꾸는 behavior change는 별도 작업으로 거부했다.

## 7. 검증·교차 검토·남은 작업
- 최종 보완본 전용 테스트 **20/20**. T4-3을 포함한 테스트 이름·결과는 `.artifacts/p06-evidence/primary-p06-20-verbose.log`에 있다.
- T4-3 추가 전 보완본은 **19/19** 통과했다. 이전 단계의 원시 로그는 `.artifacts/p06-evidence/fixes-targeted.log`다.
- Primary가 `npm ci --ignore-scripts --no-audit --no-fund`를 실행했고 52 packages installed를 확인했다. 표준 gate/raw 전체 로그와 draft는 primary가 실행한다.
- 계획 교차검토: Claude Code `claude-opus-5-5`, PASS; 초기 `0/5/5`, 수정 후 `0/0/2/2` (blocker/major/minor/note)로 기록한다. 실제 worker model identity는 이 터미널에서 제공되지 않았다.
- 후속 처분과 현재 상태는 중앙 WBS의 실행계획 P06 및 Findings N-41~N-45에서 추적한다.
