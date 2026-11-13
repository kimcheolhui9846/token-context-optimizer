# N-38 — 설치 검증 최소안 A 구현

- Tier C. base origin/main `5d668f9`. branch `claude/n38-installed-verifier-impl`. 작성 Claude Code(claude-opus-5-5), PM·최종 판정 Codex(Astra).
- 요청: 메인 `codex_review/review_2026-11-13_n38-impl-request.md`. 근거: `review_2026-11-12_remediation-analysis-final.md`, `codex_paste_2026-11-12_n38-analysis.md`.
- 소유: `scripts/verify-installed-plugin.mjs`, `scripts/plugin-runtime.mjs`(상수 1개), `scripts/smoke-mcp.mjs`(상수 import만, includes 의미 유지), `tests/verify-installed.test.ts`, `README.md` 관련 문단, 이 문서.
- 바꾸지 않음: `src/`, `bin/` 내용, 의존성, manifest, 기존 보안 테스트. B(정확히 9개, nextCursor 거부, `--reference-root`, smoke 정확 일치)는 넣지 않는다.
- 이전 B scratch를 복사하지 않았다. B 34회 결과는 A의 증거가 아니다.

## 구현 전 계획 (Argon initial-plan 대상)
1. `plugin-runtime.mjs`에 `REQUIRED_MCP_TOOL_NAMES`(9개, 동결) 추가. smoke는 같은 목록을 includes로 확인한다(동작 동일).
2. verifier `tools/list` 검사: `result.tools`가 배열, 각 항목이 객체이고 `name`이 비어 있지 않은 문자열, 이름 중복 없음, 필수 9개 포함. 여분 도구 허용. `nextCursor`는 읽지 않는다(단일 응답만 검사, pagination 미지원을 문서화).
3. 기존 텍스트 색인(id 3)과 plugin-root 텍스트 거부(id 4)는 그대로 둔다.
4. workspace에 verifier가 직접 만든 2×2 RGB PNG(`node:zlib` deflate + CRC32, 외부 의존성 없음)를 둔다. `index_image_artifact`(profile strict) 응답이 isError 아님, text JSON과 structuredContent 일치, path=realpath(fixture), sha256·byteLength=전송 전 계산값, format png, mimeType image/png, 2×2, channels 3, bitDepth 8, `png-rgb8-static-v1`, artifactId 형식 `image_` + 16 hex인지 본다.
5. `overview_image_artifact`(maxSide 64): isError 아님, content 2개(text, image/jpeg), base64 엄격 왕복, SOI/EOI, output byteLength·sha256이 반환 바이트와 같음, output 2×2·jpeg·validation 2×2, output에 image 키 없음, text에 base64 미포함, source가 index 결과와 같음(provenance), structuredContent=text.
6. 거부 2건: 별도 mkdtemp(허용 루트·plugin root 밖) PNG와 plugin root `plugin.json`을 `index_image_artifact`로 호출. smoke의 기존 계약과 같게 isError true, structuredContent 없음, content 정확히 `[{type:"text", text:"path_denied"}]`, 응답 전체 직렬화에 해당 경로·루트(실경로 포함)가 없어야 한다. 실패 메시지에는 응답 본문을 넣지 않는다.
7. `spawn`에 `windowsHide:true`. 임시 루트 삭제 전 `dirname==tmpdir()`이고 이름이 소유 접두어인지 확인한다. 아니면 지우지 않고 실패한다. 오류에 붙는 child stderr는 끝 2000자로 제한한다.
8. 성공 JSON은 기존 6필드를 유지하고 필드를 추가한다: `requiredTools`, `imageIndexProfile`, `imageOverview`, `deniedOutsideRootImage`, `deniedPluginRootImage`, `scope`(기능 smoke이며 설치 진위·host 활성화·정확한 release identity를 증명하지 않음).

## RED·수용 행렬 (`tests/verify-installed.test.ts`)
- 실제 번들: 현재 번들 통과(control), 990aa9f 번들(5도구) 거부(RED).
- fake 서버(install 사본의 bin만 교체): 5도구, 중복, 비문자열·빈 이름, tools 비배열, 정상+여분 도구(통과 control), 이미지 JSON-RPC 오류, 이미지 isError, hash·치수·profile·path 위조, overview isError·image 누락·hash 불일치·JPEG 아님, 루트 밖 허용, plugin root 허용, 거부 응답 경로 유출, 다른 오류 코드, 이미지 호출 무응답(timeout).
- 정리: 실패·timeout 뒤 임시 루트 0개, timeout 시 child 종료 확인.
- 정적: 필수 목록 = `src/server/index.ts`의 `registerTool` 이름.
- 한계: 정상 응답을 모두 위조하는 fake 서버(정상+여분 control)는 통과한다. 같은 버전 다른 바이트도 구별하지 않는다.

## 진행 기록
- Argon initial-plan: APPROVE, 지적 0(`codex_review/argon/2026-11-13_n38-impl-plan-{bundle,argon}.md`). 확인 불가로 남긴 overview `validation` 구조와 `registerTool` 목록은 `src/server/index.ts`에서 직접 확인했다.
- RED(base verifier, 새 테스트 27건): 0/27 통과. 23건은 base verifier가 exit 0으로 **통과시킨** 동작 RED(990aa9f 실제 번들 포함). 비배열 tools는 base도 TypeError로 거부해 메시지만 RED. 현재 번들·정상+여분 도구 2건은 base에서도 통과하는 동작 control이며 새 출력 필드만 없다. 상수 1건은 미존재.
- GREEN: 27/27(검증 1건당 약 0.24–0.51초, timeout 사례 5.35초). 기존 `tests/core.test.ts` 설치·verifier 관련 32건 통과(`-t "verif|installed|USERPROFILE default root"`).
- 원자료: 메인 `codex_review/n38-impl-2026-11-13/{red,green}-vitest.json`, `core-verifier-targeted.json`.
- 이번 A 단독 행렬이 A의 증거다. 이전 B scratch 34회 결과는 쓰지 않았다.
