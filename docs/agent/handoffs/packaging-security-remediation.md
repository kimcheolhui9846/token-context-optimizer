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
- 프로젝트 자체 LICENSE·권리자: manifest와 package는 MIT를 적지만 루트 LICENSE가 없다. 권리자 이름을 임의로 쓰지 않는다.
  - 안 A(권장): 루트 `LICENSE`에 MIT 본문과 사용자가 확정한 권리자·연도를 쓴다. `.codex-plugin/plugin.json`의 `"license": "MIT"`와 맞는다.
  - 안 B: 공개 라이선스를 정하기 전까지 manifest `license`를 실제 상태(미지정)에 맞춘다.
  - 안 C: 다른 라이선스를 고르고 manifest와 함께 바꾼다.
  - 어느 안이든 권리자 표기는 사용자 결정이다. 이 PR은 아무것도 만들지 않았다.

## 진행 기록
- 2026-11-13: 격리 확인(worktree HEAD=origin/main 5d668f9, clean), 브랜치 이름을 `claude/packaging-security-remediation`으로 바꿈. 기준선 측정, 계획 고정.
- Argon 초기 계획(gemini-4-argon, 1회): REQUEST CHANGES, Major 2. (1) pnpm peer 접미사 파싱 누락 → 채택, 고지 계획 1 수정. (2) zod advisory 제목·본문 상충 → 채택, 수정 커밋 원문을 확인해 적용성 서술 수정. 묶음·결과: 메인 `codex_review/argon/2026-11-13_packaging-security-plan-{bundle,argon}.md`.
- RED: (1) helper 모듈 부재로 실패. (2) 기준 번들 대상 coverage 테스트 missing 26(패키지 7·vendored 6 × 생성본/설치본). 내용 기준으로는 MCP·zod·vendored 6개 원문이 없고, 이미지 4개는 원문은 있으나 정확 버전 머리말이 없다.
- GREEN `c833ddf`: helper·manifest·vendored 원문 6개, 번들 재생성. targeted 11/11. 번들 코드 본문(머리말 뒤)은 기준과 바이트 동일. Draft PR #116.
- `49b1664`: server/core 2.3.0, zod 4.6.6, vite 7.3.7, source-map-js 1.2.2. lock 변경은 이 5개뿐이고 추가·삭제 transitive 0. vite 7.3.8은 보안 무관 수정이라 쓰지 않았다(임시 직접 지정 후 제거해 lock만 남김).
- 사후 audit: `--omit=dev` 0(exit 0). 전체 3(critical 2: vitest·tinypool, moderate 1: @vitest/mocker), exit 1. 셋 다 vitest 5.1.0(major) 필요. 별도 Task 제안.
- 계약: 정규화 stdio 프로브 23항목이 main 번들·새 번들·임시 설치 사본(runtime 파일 4개, bin 바이트 동일)에서 모두 같다. SDK 2.3.0 ReadBuffer 상한도 `10 * 1024 * 1024`. README의 SDK 버전 표기만 2.3.0으로 바꿨다.
- 번들 크기(작업 사본 LF): 기준 1,036,467 → 고지 추가 1,043,219 → 의존성 갱신 1,092,440 bytes. 시간 성능 주장은 하지 않는다.
- Argon 중간(gemini-4-argon, 1회): APPROVE, 지적 0. bin·라이선스 원문·커밋 메시지는 발췌 밖이라 확인 불가로 명시됨.
- 전체 gate 1차(`6ee4372`, coordinator 실행권 받음): test exit 1, 2건 실패(`tests/jpeg-fixtures.test.ts`, `tests/image-crop-mcp.test.ts`). 나머지 6단계 exit 0.
  - 원인: zod 4.5.0~4.6.7의 `fromJSONSchema`가 `type:"object"`+`anyOf` 노드를 모든 variant가 거부하는 객체도 받는 validator로 바꾼다(4.4.3은 거부). 최소 재현으로 확인.
  - 영향 범위: 테스트가 tools/list 스키마를 읽는 오라클뿐이다. 서버는 `fromJSONSchema`를 쓰지 않고(번들 0회) 등록된 zod 스키마로 출력 검증한다. 광고 스키마는 main과 같다.
  - 수정 `5b5f794`: `tests/helpers/advertised-schema.ts`가 모든 variant가 object일 때만 바깥 `type`을 지우고 그 밖의 형태는 throw. 기존 단언 변경 0, helper 단위 테스트 3개.
- 전체 gate 2차(최종 코드 head `5b5f794`): 7단계 모두 exit 0. test 4367 pass / 5 skip(52 files). 실행 전후 `git status` clean(빌드 재현 시 bin 변화 없음). benchmark 비시간 값: 25,025→32(99.9%), 58,000→4,400(92.4%), 8,272→128(98.5%), exact gate 모두 true.
- Argon 오라클 수정(1회): APPROVE, 지적 0. 묶음·결과: `codex_review/argon/2026-11-13_packaging-security-oracle-{bundle,argon}.md`.

## 남은 경고와 후속 제안 (major, 미적용)
- vitest 3.2.7(GHSA-82fw, <4.1.11), @vitest/mocker 3.2.7(GHSA-82fw, GHSA-qxg6 <4.1.12), tinypool 1.1.1(GHSA-5gmw ≤2.1.0, GHSA-85c8 <2.1.2). 모두 dev 전용이고 번들에 없다.
- 노출 조건(공식 원문): mocker 두 건은 dev server WebSocket에 닿는 공격자. tinypool 두 건은 같은 프로세스의 prototype pollution primitive가 따로 있어야 하고, 85c8은 caller가 `run()` options를 넘길 때만. 이 저장소의 vitest 실행에서 그 조건이 성립하는지는 확인하지 않았다.
- 후보: vitest `^4.1.12`(3→4 major). 4.1.12는 @vitest/mocker 4.1.12를 쓰고 tinypool 의존이 없다. engines `^20 || ^22 || >=24`. audit이 제시한 5.1.0은 engines `^22.12.0`부터라 저장소 `>=22.0.0`보다 좁다.
- 회귀 영향: vitest 4 설정·API 변화로 테스트 수정이 필요할 수 있다. 4.1.12 적용 뒤 audit 0이 되는지는 실행하지 않아 미확인. 별도 Task로 제안한다.
