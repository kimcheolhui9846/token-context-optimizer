# P06 텍스트·원문 추적·경계 입력 감사 — 1차 테스트 워커

## 1. 범위와 상태

- 기준: `747c2c0` (`claude/p06-text-contract-audit`), P06 요청서 `HANDOFF.md`의 T1–T6.
- 목적: 공개 직접 API와 빌드된 STDIO MCP 경로에서 원문 바이트·sourceMap·예산·정책 반환 계약을 독립 대조한다.
- 소유: `tests/`의 실제 미검증 계약 보강과 이 핸드오프 문서만 담당한다.
- 제외: `src/`, `research/`, 데이터·외부 호출·보안 탐침·공격 입력·중앙 `HANDOFF.md`·WBS·커밋/푸시/PR.
- 제약: 무해한 합성 문장과 기존 방어 fixture만 사용하고, 원문은 독립 바이트/리터럴 기대값으로 대조한다.
- 현재 상태: 1차 테스트·매트릭스 완료. P06 targeted gate는 PASS이며, 전체 2-worker gate는 기존 `image-source-race` 병렬 실패로 보류 상태다.

## 2. 계획과 수용 기준

- [x] T1 같은 경로 재색인·내용 변경·동일 내용 다른 경로·상대/절대 표기에서 ID와 원본 바이트 SHA-256을 독립 계산한다.
- [x] T2 CRLF/단독 CR/다국어 sourceMap과 summary의 LF 표현, 공백 tail 경고 경계를 원본 Buffer와 대조한다.
- [x] T3 NFKC로 길이가 변하는 질의가 원문 문자열과 바이트 범위를 반환하는지 대조한다.
- [x] T4 부분 성공·동점 누락·`warnings: []`·`fallbackReason: null` 및 직접 API/빌드 STDIO 경계를 확인한다.
- [x] T5 무해한 일반 문장 음성 대조군과 기존 안전 양성 fixture의 분류/요약 정책을 확인한다.
- [x] T6 빈 값·공백·짧은 Unicode·생략/null/0 예산을 손계산 리터럴과 대조하고 heuristic 추정치와 실제 공급자 사용량을 구분한다.
- [ ] 대상 테스트 → `npm.cmd run build` → `npm.cmd test` → `npm.cmd run typecheck` → `npm.cmd run smoke:mcp` → `npm.cmd run validate:plugin` → `npm.cmd run benchmark`.

## 3. 변경 사항

- 생성: `tests/p06-text-contract-audit.test.ts` (P06 전용, 16개 테스트, 직접 API와 빌드 bundle STDIO).
- 갱신: 이 파일의 행별 증거 매트릭스·실행 결과·발견 처분.
- 생산 코드 변경: 없음. 빌드가 재생성한 `bin/token-context-optimizer.mjs`는 HEAD와 동일한 blob으로 확인한 뒤 작업트리 변경을 제거했다.
- 최초 계획과 달라진 점: T2를 CRLF/단독 CR 각각의 LF summary, whitespace-only tail, meaningful tail 경고까지 확장했다.

## 4. 독립 기대값과 문서 경계

- ID 기대값은 `realpath + NUL + 원본 Buffer SHA-256`을 별도 계산하고, SHA-256은 원본 bytes에 적용한다.
- sourceMap/발췌 기대값은 원본 Buffer의 `[startByte,endByte)`와 리터럴 줄/구분자 배열에서 계산한다.
- summary는 공개 문서의 표현용 LF 결합과 sourceMap의 원본 범위를 따로 판정한다.
- 직접 API의 관찰은 MCP zod 계약으로 확장하지 않는다. MCP `contextLines`/`maxTokens` 상한은 schema와 실제 bundle 호출을 함께 기록한다.
- token estimate는 `heuristic-v1`, low confidence, `heuristic_estimate_not_billing_usage` 경고로만 해석하며 공급자 실측을 주장하지 않는다.

## 5. 발견과 처분

- 중앙 Findings 번호는 주 작업자가 배정한다. 이 워커 문서에서는 `F-A` 같은 임시 참조만 사용한다.
- 공개 계약과 관찰을 분리하고, 문서 공백은 결함으로 과장하지 않고 Minor 이하/보류로 기록한다.
- 현재 실제 발견: P06 신규 Blocker/Major/Minor 없음. 기존 전체 suite의 병렬성 관찰과 두 문서 gap은 아래 행별 처분에 기록했다.

## 6. 검증 기록

- 기저 P06 대상: 6 suites, 1457 passed, 2 skipped; 원자료 `.artifacts/p06-evidence/baseline-targeted.log`.
- `npm.cmd test -- --run tests/p06-text-contract-audit.test.ts --maxWorkers=2`: PASS, 16/16.
- `npm.cmd test -- --dir tests tests/core.test.ts tests/source-map.test.ts tests/query-artifact-boundaries.test.ts tests/query-artifact-mcp.test.ts tests/policy-n34-line-terminators.test.ts tests/summarizer-selection.test.ts tests/p06-text-contract-audit.test.ts --maxWorkers=2`: PASS, 7 files, 1473 passed, 2 skipped.
- `npm.cmd run build`: PASS. `npm.cmd run typecheck`: PASS. `npm.cmd run smoke:mcp`: PASS (`mcp smoke ok`). `npm.cmd run validate:plugin`: PASS (`plugin manifest ok`). `npm.cmd run benchmark`: PASS (`passed: true`, Node v24.18.0, commit `747c2c06ccaa1ad4379375bf33a9c4a22fd524f9`).
- `npm.cmd test -- --maxWorkers=2`: FAIL twice, 56/57 files, 4529 passed, 5 skipped, 1 existing failure: `tests/image-source-race.test.ts > image source race checks > rejects same-file byte replacement even when the original mtime is restored` observed `read_failure`, expected `source_changed`. Isolated `npm.cmd test -- --run tests/image-source-race.test.ts --maxWorkers=2`: PASS, 4/4; P06 targeted gate remains PASS, full concurrent gate is not clean.
- `npm.cmd ci --ignore-scripts`: NOT RUN — task scope excludes external calls and dependencies were already installed; no dependency changes.
- 모델/교차 검토: 계획 검토는 Claude Code `claude-opus-5-5`, PASS, blocker 0 / major 0. 구현 마일스톤 검토는 이 워커 범위 밖에서 coordinator가 조정한다.

## 7. 최종 독립 검토 입력

- 검토자는 이 파일의 행별 테스트 이름, 원본-byte/literal oracle, 직접·STDIO 명령과 실제 결과를 확인해야 한다.
- 구현 파생값만으로 합격시키지 않고, CRLF/단독 CR summary의 LF 표현 및 whitespace-only tail의 `summary_truncated` 경계를 독립 재실행한다.
- 미검증 OS별 대소문자·별칭·하드링크·공급자 토큰 실측은 환경상 미검증으로 남긴다.

## 8. 행별 증거 매트릭스

| ID | 위험 → fixture → 정확한 테스트 | 계약/관찰 경계 | 독립 oracle·실제 결과 | 판정/발견 |
| --- | --- | --- | --- | --- |
| T1 | 경로 표기·파일 버전 혼동 → 무해한 `same harmless notes`/`before`/`after` 파일 → `T1-1 returns the independently computed identity for absolute and relative reindexing`; `T1-2 gives a new identity when bytes change and keeps same-content paths distinct` | 공개 README의 canonical path+unchanged bytes 관찰 | 원본 Buffer SHA-256과 `realpath + NUL + sha256` 16-hex 접두 ID를 별도 계산. 2/2 PASS | 신규 결함 없음. 16 hex는 충돌 불가 보장이 아님(문서 Note 보류). |
| T2 | CRLF/단독 CR가 sourceMap과 summary 표현을 혼동시키고 공백 tail 경고를 오판 → 일반 다국어·무해한 문장 → `T2-1 preserves CRLF source bytes while summaries render selected lines with LF`; `T2-1 preserves lone CR source bytes while summaries render selected lines with LF`; `T2-2 excludes whitespace-only CRLF tail lines without summary_truncated`; `T2-2 excludes whitespace-only lone CR tail lines without summary_truncated`; `T2-3 marks a meaningful CRLF tail as summary_truncated after omitted whitespace`; `T2-3 marks a meaningful lone CR tail as summary_truncated after omitted whitespace`; `T2-4 reports a complete Unicode query span against literal original Buffer offsets` | README/docs의 complete line·summary LF 표현은 계약, byte span은 관찰을 원본과 검증 | 원본 Buffer `[startByte,endByte)`와 리터럴 delimiter 배열. 7/7 PASS; CRLF/CR summary는 LF, 공백만 생략 시 `warnings: []`, 의미 tail 생략 시 `summary_truncated` | 신규 결함 없음. U+2028/U+2029/NEL은 기존 `policy-n34-line-terminators.test.ts` 근거에 연결; T2 신규 테스트는 LF/CR만 다룸. |
| T3 | NFKC로 질의 길이가 달라져 원문 범위가 어긋날 위험 → fullwidth/결합 악센트 일반 문장 → `T3-1 returns original text and bytes when NFKC changes query length` | README의 NFKC·combining-mark 검색은 계약, locale별 case folding은 보장하지 않음 | 리터럴 원문 문자열과 파일 Buffer 전체 범위 대조. 1/1 PASS | 신규 결함 없음. 다른 언어/locale folding은 미검증 coverage gap. |
| T4 | 예산에 일부만 들어간 결과가 경고/대체 응답으로 오인될 위험 → 두 `needle` 줄과 filler → `T4-1 keeps warnings empty and fallbackReason null on direct partial success`; `T4-2 observes the same partial-success contract through built STDIO MCP` | README의 `moreMatches`, partial `warnings: []`/`fallbackReason: null`, MCP 상한은 계약. direct maxTokens 범위는 관찰 | 독립 3-token 계산, 누락 line `[3]`, 직접 결과와 built STDIO JSON/structuredContent 동일성. 2/2 PASS | 신규 결함 없음. direct `maxTokens` 허용/오류 범위는 README에 명시되지 않아 `D-A` 보류. |
| T5 | 무해한 일반 문장이 exact/unknown으로 과보호되어 요약이 막힐 위험 → credential/path 없는 1문장 + 기존 방어 fixture 참조 → `T5-1 treats a harmless ordinary note as semantic and keeps its summary source-backed`; `T5-2 exposes the same harmless semantic policy through built STDIO MCP` | `classify_context` mode와 semantic-only summary가 계약, 기존 exact 양성은 `tests/core.test.ts`·`tests/policy-n34-line-terminators.test.ts` | 리터럴 `mode: semantic`, `reasons: [natural_language]`, 원문 summary/sourceMap 및 STDIO JSON 대조. 2/2 PASS | 신규 오분류 없음. 실제 자격정보·공격 입력은 사용하지 않음. |
| T6 | heuristic 예산과 실제 공급자 토큰 사용량을 혼동하거나 direct/MCP null·0 경계를 혼동할 위험 → 빈 문자열·공백·`가🙂`·일반 문장 → `T6-1 matches literal heuristic-v1 expectations for empty, whitespace and short Unicode inputs`; `T6-2 keeps estimate omission/null semantics and rejects zero at built STDIO MCP schema` | docs의 low-confidence heuristic와 MCP positive maxTokens가 계약, 공급자 실측은 범위 밖 | 리터럴 기대 `0`, `1`, `2`, direct `maxTokens:0/null`, MCP omission/zero 오류. 2/2 PASS | 신규 결함 없음. 공급자 실측·OS 별칭/대소문자/하드링크는 미검증. |

### 발견 및 처분

- `F-A` (중앙 번호 미배정, 기존): 2-worker 전체 suite에서 `image-source-race.test.ts` 한 테스트가 두 번 `read_failure`로 실패했으나 단독 재실행 4/4 PASS. P06 diff와 무관한 기존 병렬/환경성 관찰로 수용하지 않고 중앙 owner가 후속 분류한다.
- `D-A` (중앙 번호 미배정, 문서 gap): direct `queryArtifact`의 `maxTokens`는 MCP의 1–2000 schema와 달리 명시된 공개 범위가 없다. 이번 Task는 동작을 바꾸지 않고 관찰/보류한다.
- `D-B` (중앙 번호 미배정, Note): 16-hex `artifactId`는 결정적 식별자이지 충돌 불가 보장이 아니다. 테스트는 이 한계를 숨기지 않고 exact formula만 검증한다.
- P06 실제 신규 Blocker/Major/Minor: 없음. T1의 OS별 대소문자/별칭/하드링크와 T3의 locale folding, T6 공급자 실측은 환경·범위상 미검증으로 남긴다.

## 9. 남은 작업

- [x] 전용 테스트 작성 및 의미 있는 RED 여부 기록 — production 변경이 없는 coverage 감사라 product RED는 해당 없음; 첫 실행의 두 실패는 문장 fixture 예산 계산 오류로 수정했고 이후 16/16 PASS
- [x] targeted/2-worker 및 표준 project gate 실행
- [x] 위 표에 exact test names와 PASS/FAIL/NOT RUN, 발견 처분, coverage gaps 기록
- [x] coordinator에 변경 파일·diff·정확한 모델·gate 결과를 worker_done으로 전달할 준비 완료
