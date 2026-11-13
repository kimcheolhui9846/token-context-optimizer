# dev-security-license — dev 의존성 보안(vitest 4.1.12)과 root MIT LICENSE

- 2026-11-13 Claude Code(claude-opus-5-5), coordinator task_42cef56c2fa4. 요청서 메인 `codex_review/review_2026-11-13_dev-security-license-request.md`, 승인 `review_2026-11-13_followup-implementation-approved.md`.
- 근거: PR #116 `docs/agent/handoffs/packaging-security-dev-advisories.md` §5 안 A(1112702 기준). Draft PR #118.
- 브랜치 `claude/dev-security-license`, base origin/main 5d668f9. 원자료는 메인 `codex_review/dev-security-license-2026-11-13/`.
- 상태: 구현·전체 gate 완료, Astra 최종 검토 대기. Ready·merge 안 함.

## 1. base 기준선 (5d668f9, Node 24.18.0, npm 11.16.0, vitest 3.2.7)
- 실행(build 뒤 `vitest run`): 50 files, 4354 pass / 5 skip (4359). `vitest list`는 4358을 보고한다(두 버전 모두 같은 차이, 수집 방식 차이로 판단하고 원인은 확인하지 않음). #116의 52 files/4367은 다른 base라 쓰지 않는다.
- `npm audit` 전체 7(critical 2, high 4, moderate 1) / `--omit=dev` 2.
  - runtime 2(이번 범위 밖, #116에서 처리): `@modelcontextprotocol/server` 2.0.0, `zod` 4.4.3.
  - dev 5: vitest 3.2.7, @vitest/mocker 3.2.7, tinypool 1.1.1, vite 7.3.6, source-map-js 1.2.1.
- root `LICENSE` 없음. `.codex-plugin/plugin.json` `"license": "MIT"`는 그대로 두고, `package.json`에는 license 필드를 추가하지 않는다.

## 2. 변경 (커밋)
- e390204 기준선·계획 기록.
- 453dba9 `package.json` devDependencies `vitest` `^3.2.0` → `^4.1.12`, lock 갱신.
  - 범위만 바꾸면 npm이 vite 8.3.8을 고른다. 그래서 scratch에서 `vitest@^4.1.12 vite@7.3.7 source-map-js@1.2.2`로 lock을 만든 뒤 vite·source-map-js direct 항목을 지우고 lock-only로 다시 해석했다. 새 direct 의존성은 없다.
  - lock 변화: 추가 3(@standard-schema/spec, convert-source-map, obug), 제거 12(tinypool, vite-node 등), 변경 16, 모두 dev. runtime 변화 0. #116 최소안(minimal-vite7)과 runtime 3개 외에는 같다. lock diff 전체를 읽었다.
- 7f1c847 root `LICENSE`(SPDX `text/MIT.txt` 원문, `Copyright (c) 2026 kim cheol hui` 한 줄만 치환)와 README 개발 요건·License 절.
- 546280a `vitest.config.ts` exclude에 `"**/dist/**"` 추가. 기존 항목은 유지했다.

## 3. RED → GREEN
- RED-1 audit dev 5건(1절).
- RED-2(453dba9 + build, config 수정 전): `vitest list --filesOnly` 100 files, 그중 `dist/tests` 50. `--json` 수집은 dist 사본의 import 실패로 exit 1. 범위를 제한하려고 실행(`run`)은 하지 않았다.
- GREEN: `vitest list` 50 files / 4358, 파일 집합이 base와 같다.
  - test 이름 14개의 표기가 다르다(`%p`가 그대로 남고, `%j` 자리에 `undefined`가 들어감). 실행 수와 결과에는 영향이 없다. 이 Task에서 test는 고치지 않았다(Note).
- audit 뒤: 전체 2 / `--omit=dev` 2(runtime 2건만). **이번 Task dev 경고 0.**
- 통합 확인(lock만): #116 minimal-vite7 lock의 audit 전체 0. 실제 병합 상태가 아니며, #116 통합 뒤 다시 확인해야 한다.

## 4. 전체 gate (head 546280a, Node 24.18.0)
- ci 0, build 0, test 0, typecheck 0, smoke 0, validate 0, benchmark 0. 로그는 `gate2-546280a/`.
- test 50 files, 4354 pass / 5 skip (4359). base 실행(`base-run-5d668f9/`, build 뒤)과 파일별 상태 수, skip 5건 목록이 모두 같다. mock(`vi.mock`/`doMock`/`importActual`/`resetModules`/`restoreAllMocks`)과 기본 pool(forks) 회귀는 없다.
- base 복사본에서 build 없이 실행했을 때 smoke 관련 4건이 실패했다(`test-nobuild.log`). gate 순서(build 먼저)로 다시 실행해 통과했다. 이번 변경과는 관계없다.
- `bin/`은 build 뒤 CRLF만 달라지고 내용(`--ignore-cr-at-eol`)은 같아서 그 파일만 되돌렸다. status는 gate 전후 모두 clean이다.

## 5. Node 버전
- runtime `engines.node >=22.0.0`은 바꾸지 않았다.
- dev 하한: vite 7.3.7 `^20.19.0 || >=22.12.0`, vitest 4.1.12 `^20.0.0 || ^22.0.0 || >=24.0.0`(23.x 제외). npm registry metadata로 확인했다.
- 실행 검증은 Node 24.18.0뿐이다. 22.x·20.x는 실행하지 않았다.

## 6. 범위 밖과 후속
- runtime 경고 2건은 #116 몫이다. 전체 audit 0은 #116 통합 뒤 확인한다.
- vite 7.3.8(2026-11-09 공개)이 있다. 승인된 버전이 7.3.7이라 채택하지 않았다. 7.3.7은 현재 audit 0이다.
- 설치 파일 목록이나 bundle에 LICENSE를 넣는 일은 배포 통합에서 확인한다. 라이선스의 법적 적합성 판정은 하지 않는다.
- vitest 4 test 이름 표기(`%p`/`%j`) 정리는 별도 판단이 필요하다.
- Argon: 초기 계획 `argon/2026-11-13_dev-security-license-initplan-*.md`(산출물 누락 1건 채택). milestone `-milestone-*.md` APPROVE(지적 0, 커밋 해시·Node 버전·list 4358·이름 14건·7.3.8 공개일은 발췌에 없어 cannot verify로 남김. 원자료와 직접 대조함).
