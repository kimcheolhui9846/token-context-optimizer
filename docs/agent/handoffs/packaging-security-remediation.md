# N-37 + DEP — 제3자 고지 coverage와 확인된 의존성 경고 최소 수정

- Tier C. base origin/main `5d668f9`. branch `claude/packaging-security-remediation`. 작성 Claude Code(claude-opus-5-5), PM·최종 판정 Codex(Astra).
- 요청: 메인 `codex_review/review_2026-11-13_packaging-security-request.md`. 근거: `review_2026-11-11_plugin-critical-final.md`(B1/N-37, 의존성 절), `codex_paste_2026-11-11_plugin-critical-image-package.md`(F-B1, §4).
- 소유: `package.json`, `package-lock.json`, `scripts/build-bundle.mjs`, 새 helper `scripts/third-party-notices.mjs`, `docs/licenses/` 아래 고지 원문, 관련 tests, `bin/token-context-optimizer.mjs`, README 관련 문단, 이 문서.
- 바꾸지 않음: `src/`, 연구·논문, 정책 분류, `artifacts.ts`, 이미지 알고리즘, 도구 이름·입출력 계약, Node `>=22`, 프로젝트 자체 LICENSE·권리자.

## 기준선 (2026-11-13, node v24.18.0, npm 11.16.0, Windows)
- `npm audit`: 7 packages(critical 2, high 4, moderate 1), exit 1. `--omit=dev`: 2(high 2), exit 1. 과거 기록이 아니라 이 worktree에서 다시 실행한 결과다.
- runtime: `@modelcontextprotocol/server` 2.0.0(GHSA-jm63, -46jr, -rvq5: <2.3.0 / -f897: <2.1.0), `zod` 4.4.3(GHSA-mrhx: <4.6.6).
- dev: `vite` 7.3.6(5건, ≤7.3.6 → 7.3.7), `source-map-js` 1.2.1(<1.2.2), `vitest` 3.2.7·`@vitest/mocker`·`tinypool`(수정은 vitest 5.1.0 = semver-major).
- 실제 번들 metafile의 node_modules 패키지 7개: MCP server/core 2.0.0, zod 4.4.3, fast-png 8.0.0, fflate 0.8.3, iobuffer 6.0.1, jpeg-js 0.4.4. 현재 고지는 이미지 4개뿐이다.
- 추가 발견: 번들된 `@modelcontextprotocol/server/dist` 파일 안에 SDK가 미리 묶은(vendored) 코드가 있다. `src-*.mjs`에 content-type 1.0.5, 번들된 `ajvProvider-*.mjs`에 ajv 8.18.0, ajv-formats 3.0.1, fast-deep-equal 3.1.3, fast-uri 3.1.0, json-schema-traverse 1.0.0. node_modules에는 이 패키지들이 없어서 metafile 패키지 목록만으로는 드러나지 않는다. `cfWorkerProvider`(@cfworker/json-schema)는 번들 입력이 아니다.
- 기준 번들 1,036,467 bytes(작업 사본 CRLF), blob 1,009,111 bytes.

## 의존성 계획 (호환 범위 안 최소 수정)
| 패키지 | 현재 → 목표 | 근거 |
|---|---|---|
| @modelcontextprotocol/server(+core, server가 정확 버전 고정) | 2.0.0 → 2.3.0, 범위 `^2.3.0` | 네 advisory 모두 2.3.0에서 patched. 2.3.0 릴리스 노트: `serveStdio(buildServer)`는 변경 없이 동작 |
| zod | 4.4.3 → 4.6.6, 범위 `^4.6.6` | GHSA-mrhx first patched 4.6.6. 4.6.7은 버전 커밋만 |
| vite(dev, transitive) | 7.3.6 → 7.3.7 목표 | 다섯 advisory 모두 ≤7.3.6 |
| source-map-js(dev, transitive) | 1.2.1 → 1.2.2 | 유일한 patched |
| vitest/@vitest/mocker/tinypool | 유지 | major 필요. 별도 Task 제안으로 보고 |
- `npm audit fix`/`--force` 쓰지 않는다. 설치는 `--ignore-scripts`. lock diff에서 의도 밖 버전 변경을 검토한다.
- 적용성: MCP 네 건은 공식 원문상 HTTP·bearer 전제이고 이 서버는 `serveStdio`만 쓴다. 그래도 범위 밖 버전으로 올린다. GHSA-46jr·-rvq5의 opt-in 옵션(`maxToolInputElements`, `expectedResource`)은 켜지 않는다(stdio 비해당, 켜면 계약 변경). zod advisory는 제목("constrained collections")과 본문("without a length constraint")이 어긋난다. 수정 커밋 a0ebf97(#6652)은 `.max()`/`.length()`/`.size()`가 있는 배열·Set·Map을 원소 파싱 전에 거부하게 바꾼다. 제약 없는 배열의 issue 누적은 이 수정의 대상이 아니므로 그 경로가 안전해졌다고 쓰지 않는다.

## 고지 계획
1. `build-bundle.mjs`에 `metafile: true`. helper가 metafile 입력에서 node_modules 패키지와 각 입력 파일 안의 vendored `#region ../../node_modules/.pnpm/<디렉터리>/node_modules/<패키지>/` 표지를 모은다. pnpm 디렉터리 이름의 peer 접미사(`ajv-formats@3.0.1_ajv@8.18.0`)와 scope 표기(`@scope+pkg@ver`)를 처리하고, 이름은 뒤쪽 `node_modules/<패키지>` 경로에서 읽는다. 해석하지 못한 `.pnpm` 표지가 있으면 빌드 실패.
2. node_modules 패키지: 설치본의 LICENSE(및 NOTICE 계열 파일)를 그대로 넣는다. 파일이 없으면 빌드 실패.
3. vendored: `docs/licenses/vendored-components.json`(이름·버전·npm integrity·원문 파일·sha256)과 정확 버전 npm tarball에서 꺼낸 LICENSE 원문. 표지가 manifest에 없거나 버전이 다르면 빌드 실패.
4. jpeg-js의 기존 decoder/encoder 부가 고지는 유지한다. 고지 텍스트 줄끝은 LF로 맞춘다.
5. 배포: 고지는 설치되는 `bin/token-context-optimizer.mjs` 머리말에 들어간다(설치 runtime 파일 4개 그대로). README에 위치를 적는다.

## RED·수용 행렬
- `tests/third-party-notices.test.ts`: (a) 현재 번들 입력을 esbuild metafile로 다시 계산해 node_modules 패키지와 vendored 구성요소를 모두 얻고, 커밋된 번들과 설치 사본 각각에 이름·정확 버전·LICENSE 원문이 있는지 본다. 기준 번들에서 MCP·zod·vendored 6개가 빠져 RED.
- (b) helper 단위: 합성 metafile에 manifest 없는 vendored 표지·버전 불일치·LICENSE 없는 패키지가 있으면 throw. node builtin과 `src/` 입력은 패키지로 세지 않는다.
- (c) manifest의 원문 파일 sha256(LF 기준) 일치.
- 기존 `tests/image-packaging.test.ts`는 형식 변경에 맞춰 최소 수정, 이미지 고지 검사는 유지.
- 계약 대조: 기준·변경 번들에 같은 stdio 프로브(초기화, tools/list, text 4도구, image 4도구, 경로 거부, 입력 오류, 미지원 도구·메서드, 2 MiB inline, 10 MiB 초과 메시지)를 돌려 정규화 diff를 본다.
- 전체 gate는 coordinator 실행권을 받은 뒤 최종 head에서 실행한다.

## 미결정(사용자)
- 프로젝트 자체 LICENSE·권리자: manifest와 package는 MIT를 적지만 루트 LICENSE가 없다. 권리자 이름을 임의로 쓰지 않는다. 구체안은 완료 보고에 적는다.

## 진행 기록
- 2026-11-13: 격리 확인(worktree HEAD=origin/main 5d668f9, clean), 브랜치 이름을 `claude/packaging-security-remediation`으로 바꿈. 기준선 측정, 계획 고정.
- Argon 초기 계획(gemini-4-argon, 1회): REQUEST CHANGES, Major 2. (1) pnpm peer 접미사 파싱 누락 → 채택, 고지 계획 1 수정. (2) zod advisory 제목·본문 상충 → 채택, 수정 커밋 원문을 확인해 적용성 서술 수정. 묶음·결과: 메인 `codex_review/argon/2026-11-13_packaging-security-plan-{bundle,argon}.md`.
