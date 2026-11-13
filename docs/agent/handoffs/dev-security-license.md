# dev-security-license — dev 의존성 보안(vitest 4.1.12)과 root MIT LICENSE

- 2026-11-13 Claude Code(claude-opus-5-5), coordinator task_42cef56c2fa4. 요청서 메인 `codex_review/review_2026-11-13_dev-security-license-request.md`, 승인 `review_2026-11-13_followup-implementation-approved.md`.
- 근거: PR #116 `docs/agent/handoffs/packaging-security-dev-advisories.md` §5 안 A(1112702 기준).
- 브랜치 `claude/dev-security-license`, base origin/main 5d668f9. 원자료는 메인 `codex_review/dev-security-license-2026-11-13/`.

## 1. base 기준선 (5d668f9, Node 24.18.0, npm 11.16.0)
- 수집(`vitest list`, 3.2.7): test 파일 50, test 4358. 실행 결과(pass/skip)는 gate 실행 뒤 적는다. #116의 52 files/4367은 다른 base라 쓰지 않는다.
- `npm audit` 전체 7(critical 2, high 4, moderate 1) / `--omit=dev` 2.
  - runtime 2(이번 범위 밖, #116에서 처리): `@modelcontextprotocol/server` 2.0.0, `zod` 4.4.3.
  - dev 5: vitest 3.2.7, @vitest/mocker 3.2.7, tinypool 1.1.1, vite 7.3.6, source-map-js 1.2.1.
- root `LICENSE` 없음. `.codex-plugin/plugin.json`의 `"license": "MIT"`는 그대로 둔다. `package.json`에는 license 필드가 없다(추가하지 않는다).

## 2. 계획 (안 A)
1. RED-1: base audit dev 5건 기록(위).
2. `package.json` devDependencies `vitest` `^3.2.0` → `^4.1.12`. lock은 vite 7.3.7, source-map-js 1.2.2로 고정하고 vite 8·beta가 들어오지 않게 한다. runtime 의존성은 바꾸지 않는다. 새 direct 의존성을 추가하지 않는다.
3. RED-2: `vitest.config.ts`를 그대로 둔 채 build 산출물 `dist/tests/*.test.js`가 있을 때 수집 파일 수가 늘어나는지 `vitest list`로 확인한다(파일을 고치지 않는 수집 전용).
4. GREEN: `vitest.config.ts` exclude에 `"**/dist/**"`만 더한다. 기존 항목은 유지한다.
5. 회귀: mock/spy/importActual/resetModules/pool(forks) 차이를 전체 test로 확인한다. 실패는 원인별로 기록하고 단언 약화·skip·삭제를 하지 않는다.
6. root `LICENSE`: 표준 MIT 원문(SPDX `MIT`)에 `Copyright (c) 2026 kim cheol hui`. 다른 권리 문구는 넣지 않는다.
7. README 개발 요건: runtime `engines.node >=22.0.0`과 dev/test 도구 하한(vite 7.3.7 `^20.19.0 || >=22.12.0`, vitest 4.1.12는 23.x 제외)을 나눠 적는다. 실제 실행은 Node 24.18.0만.
8. 전체 gate는 coordinator 실행권을 받은 뒤 실행한다. `bin/`이 build로 달라지면 원인(본문 runtime 동일 여부)을 검증한다.
9. 마무리: 이 handoff 갱신, milestone Argon, 메인 `codex_review/codex_paste_2026-11-13_dev-security-license.md` 완료 보고, WBS 6.18/6.19 "진행중" 변경안 제출(직접 저장 안 함).
- 초기 계획 Argon(`codex_review/argon/2026-11-13_dev-security-license-initplan-*.md`): 산출물 누락 지적 1건 채택(이 8·9항). 나머지 4건은 발췌에 없어 "cannot verify"로 나온 값으로, package.json·lock·plugin.json·`node -v` 출력과 직접 대조해 맞음을 확인했다.

## 3. 범위 밖과 후속
- runtime 경고 2건은 이 Task에서 숨기거나 고치지 않는다. 전체 audit 0은 #116 통합 뒤 따로 확인한다.
- 설치 파일 목록·빌드 결과물에 LICENSE를 넣는 일은 배포 통합 Task에서 확인한다.
- 라이선스의 법적 적합성 판정은 하지 않는다.
