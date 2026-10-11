# Task 29 — 이미지 변환 provenance 차이 분석

## 1. 작업 개요

- PR / 브랜치 / base: [Draft PR #29](https://github.com/kimcheolhui9846/token-context-optimizer/pull/29), `codex/task-29-image-provenance-plan`, main `73f201c638934905b1a038db3d2776e7c8872e27`.
- 목적: 현행 이미지 원본 식별·검증과 M2 변환 provenance 사이의 차이 및 최소 후속 후보를 문서화한다.
- 요구사항: 구현 사실/부재/제안을 구분하고, 캡처·좌표·no-op·hash·버전·쓰기 안전성·미래 TDD·구현 진입 gate를 근거와 연결한다.
- 범위: [계획](../../superpowers/plans/2026-10-10-image-provenance-gap.md), [분석](../../research/image-transform-provenance-gap.md), 이 핸드오프 3개 신규 문서.
- 제외: 코드·테스트·의존성·기존 연구 문서·공유 기록·WBS 변경, 변환/API 구현, 이미지 실험·데이터 취득·hosted 모델 호출, F-12·파일럿 모델 결정, merge. 하네스의 비민감 문서 작성/검토 호출은 연구 실험과 별개다.
- 분석 기준: main `73f201c638934905b1a038db3d2776e7c8872e27`. 원격 fetch 후 origin/main 일치 확인.
- 격리: 기존 `codex/task-29-image-provenance-plan` worktree를 유지한다. 기존 미커밋 계획을 보존해 새 하네스만 반영했다.
- 현재 상태: c9ec7dd 전달 후 사용자 제공 리뷰의 문서 수정 승인 수령. A-1–A-4/N-2 문서 수정과 한정 재검토 완료. N-1 trailer 검증 및 commit/push/최종 Git 확인 대기. 종전 검증·판정은 아래 이력으로 보존한다.

## 2. 작업 계획

- [x] 기존 상태·적용 지침·실제 모델·Git 격리 확인, local root HANDOFF 갱신
- [x] 초기 독립 계획 검토와 major 보강·재검토
- [x] targeted 및 전체 baseline, build 이후 저장소 gate
- [x] 분석 작성, 근거·링크·공개 범위 검사
- [x] 별도 마일스톤 독립 검토와 필요한 수정
- [x] 세 문서만 commit/push, main 대상 Draft PR
- [x] Draft PR 후 gate, 문서 범위와 Draft 상태 확인, Astra 직접 검토 (최종 기록 커밋의 head 동기화는 전달 시 추가 확인)

## 3. 변경 사항

- 계획: 기존 승인된 문서 Task의 수용 기준 유지, Claude Opus 5.5 우선 위임과 독립 검토, 명시적 source capture/no-op 표현·쓰기 경계·scope 검증 보강.
- 분석: 별도 Claude 호출의 초안을 바탕으로 원본 metadata와 변환 결과를 연결하는 계약 부재를 설명한다. 이번 승인된 보정은 crop을 여러 비교 후보 중 하나로 다루고 첫 연산 순서를 사용자 결정으로 남긴다.
- 핸드오프: 실제 검증·모델 호출·검토 조치와 승인 경계를 기록한다.
- 계획 대비: 과거 Luna 작성/외부 리뷰 금지 설정은 사용자의 새 전역 하네스 적용 요청으로 대체했다. 기존 전역 설정 파일 자체는 수정하지 않았다.

## 4. 주요 의사결정

- 현재 코드가 구현 사실의 근거다. 연구 프로토콜의 M2는 예정 요구사항이며 구현 완료로 해석하지 않는다.
- 후속 후보는 프로토콜 입력 조건·arm의 필요도와 구현 부담을 함께 비교한다. 제한 8-bit RGB PNG crop은 비교 후보 중 하나이며 첫 연산 순서는 사용자 결정이다. crop 상세 제안은 해당 후보 선택 시의 조건부 안이며 현행 ingest의 RGBA 지원을 축소하지 않는다.
- full-frame no-op은 source metadata를 참조하고 파일을 새로 만들지 않는 제안이다. 거부·재인코딩 대안과 비교하며 출력 표현/API는 후속 승인 대상이다.
- 현재 read 검증과 write 권한·원자성은 별개다. source buffer 캡처와 Windows writer 전략·manifest 수명 및 공유 경로 정책이 결정되기 전 구현을 시작하지 않는다.

## 5. 테스트 및 검증

순수 문서 작업이므로 RED는 해당 없음: 새 실패 테스트 대신 실제 심볼·상대 링크·제안 표기·세 파일 scope 및 공개정보 검사를 수용 기준으로 고정했다. 변환 기능의 GREEN을 주장하지 않는다.

| 단계/실행 명령 | 실제 결과 |
| --- | --- |
| baseline `npm.cmd test -- --run tests/image-artifacts.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts` | 20 passed / 1 skipped, 3 files, exit 0 |
| baseline `npm.cmd test` | 790 passed / 1 skipped, 25 files, exit 0 |
| 전달 전 `npm.cmd run build` | exit 0 |
| 전달 전 `npm.cmd run typecheck` | exit 0 |
| 전달 전 `npm.cmd run smoke:mcp` | exit 0, `mcp smoke ok` |
| 전달 전 `npm.cmd run validate:plugin` | exit 0, `plugin manifest ok` |
| 전달 전 `npm.cmd run benchmark` | exit 0, `passed: true` |
| 1차 문서 검사 (계획의 PowerShell checker) | PASS: whitespace/newline/fence/상대 링크 |
| 1차 staged 검사 `git diff --cached --check`, 정확히 3개 경로, 공개정보 검사 | PASS: exit 0, 예상 3개 경로 일치, 탐지 0 |
| 리뷰 수정 후 문서 검사 (같은 PowerShell checker) | PASS: whitespace/newline/fence/상대 링크 |
| 리뷰 수정 후 staged whitespace/정확히 3개 경로/보강된 공개정보 검사 | PASS: exit 0, 3개 경로 일치, 탐지 0. `\b`로 task 이름 오탐 방지 |
| commit-scope `git diff --name-only 73f201c...HEAD` | PASS: 정확히 승인된 3개 문서 |
| Draft 후 이미지 대상 테스트 (위와 같은 명령) | PASS: 20 passed / 1 skipped, exit 0 |
| Draft 후 `npm.cmd test` | PASS: 790 passed / 1 skipped, 25 files, exit 0 |
| Draft 후 `npm.cmd run build`, `npm.cmd run typecheck` | 각각 PASS: exit 0 |
| Draft 후 `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin` | 각각 PASS: exit 0, smoke/manifest ok |
| Draft 후 `npm.cmd run benchmark` | PASS: exit 0, `passed: true` |

- skip은 기존 Windows 비지원 FIFO 테스트다. junction 회귀는 Windows에서 실행됐다.
- gate는 Astra가 실행했다. 분석 작성자는 제공된 코드 발췌를 읽으며 테스트를 직접 실행하지 않는다.
- local smoke/기존 합성 text benchmark는 이미지 품질·절약·모델 정확도·hosted 비용의 증거가 아니다.
- 기존 의존성을 사용했으며 설치·업그레이드는 수행하지 않았다. gate 로그/검토 원문은 Task 전용 ignored scratch에 보존한다.

## 6. 오류 및 해결 기록

- Windows 실행 도구가 `helper_unknown_error: setup refresh had errors`로 시작하지 못했다. 읽기/조회는 검증한 `windowsHide:true` Node 경로로 수행했다.
- sandbox 내 Claude probe 두 번은 유효한 응답을 얻지 못했다. 설치·로그인만으로 사용 가능 판정을 내리지 않았다. 승인된 PTY escalation에서 정확한 모델 probe가 성공했다.
- Windows 실행은 `tty:true`, `login:false`를 유지했다. terminal/security/auth 설정 변경은 없었다.

- build 로그의 PowerShell `NativeCommandError` 표시는 esbuild stderr 진행 출력을 redirection하며 붙은 레코드다. build 프로세스 exit 0, 번들 생성 완료 및 후속 smoke 통과를 확인했다. 생성 번들은 줄바꿈 정규화 내용 동일성을 확인한 뒤 실행 전 bytes로 복원했다.

## 7. 다중 모델 교차 검토

### Claude Code / Opus 5.5

- CLI 2.1.296 실행·인증 확인 후 `claude-opus-5-5` 호출: `AVAILABLE`, `canonicalModel: claude-opus-5-5`, firstParty, `is_error: false`. 이것은 가용성 probe이며 리뷰가 아니다.
- 초기 계획: 별도 호출에서 SPEC PASS / QUALITY CHANGES REQUIRED, blocker 0, major M1–M6.
- M1: codec/validator/cap/copy 근거 부족 → Astra가 실제 소스·package를 읽고 정확한 프로필 값과 shallow copy 범위를 명시.
- M2: verified bytes로 연결하는 경로 부재 → 새 단일 capture, 재허가 및 기존 canonical path/hash 대조를 필수 제안으로 기록.
- M3: no-op과 output metadata 표현 → source 참조/새 파일 없음 구분, 거부·재인코딩 대안 추가. no-op 권고는 승인 전 제안으로 유지.
- M4: write 권한·Windows alias·manifest 경로 노출·color chunk·encoded 재현성 → 현행 chunk 거부 근거와 후속 결정 gate 추가.
- M5: gate의 외부 호출/쓰기 범위 → local smoke/text benchmark 확인, build 전 bytes 보존과 line-ending-only 변경 처리 제한.
- M6: untracked/staged scope 약점 → 신규 문서 자체 검사와 정확히 3개 staged/committed 경로 비교 추가.
- 별도 한정 재검토: M1–M6 모두 ADDRESSED, SPEC PASS / QUALITY PASS WITH NOTES, 새 blocker/major 0. 근거 목록·조건부 no-op·명령·역할 명확화 minor 반영.
- 분석 작성: 초기 검토와 별도 `claude-opus-5-5` 호출 성공. DONE_WITH_CONCERNS는 no-tool 작성자의 링크/줄 수/발췌 제한을 의미하며 controller가 실제 파일·근거를 확인한다.
- 마일스톤 리뷰: 별도 `claude-opus-5-5` 실행, SPEC PASS / QUALITY CHANGES REQUIRED. blocker 0, major 1(핸드오프 검증 상태의 시차), minor 8, note 5.
- Major M1은 실제 수행한 문서/staged 검사와 pending commit/post-Draft gate를 분리하여 바로잡았다. 수정 후 문서 검사와 재스테이징 검사를 재실행해 통과했다.
- minor m1–m8: JPEG/PNG 한도 구분, private validator 재사용 경로, 좌표 정밀도, no-op 재검증, writer publication/사후검사 실패, RGB pixel 검사, 경계 테스트, 권한·manifest gate 보강을 작성자에게 반환해 19개 국소 치환으로 반영했다. 기존 `MemoryImageArtifactStore` export와 미래 validator 추출을 혼동하지 않도록 작성자가 한 문단을 추가 명확화했다.
- note n1/n2: 공개정보 검사 패턴을 보강하고 PR에 no-tool 발췌 기반·동일 모델 별도 호출 한계를 기록한다. n3/n4의 write 기본권한·전체 hash 확인도 승인 전 제안으로 명확화한다.
- 이 리뷰도 도구 없이 실제 staged diff와 source 발췌, controller 실행 결과를 검토했다. 독립 실행이며 작성자 자체 검토가 아니다.

- 마일스톤 한정 재검토: 별도 `claude-opus-5-5`, SPEC PASS / QUALITY PASS WITH NOTES. 기존 M1/m1–m8/n1–n5 모두 ADDRESSED, blocker/major 0. R1 기록 시차는 위 검증 표에 반영했다.
- R2/R3는 Astra가 실제 소스로 확인해 해소했다: `src/core/image-artifacts.ts:48–52`의 선택적 store 인자, `tests/image-artifacts.test.ts:67–68,85–87`의 테스트 로컬 store 전달, `src/core/image-artifacts.ts:158,183–184`의 PNG validator 치수 상한 적용. 이 근거 확인은 작성자의 직접 열람을 뜻하지 않는다.
- 계획 전달 단계의 “독립 리뷰 결과·한계” 표현은 실제 수행 상태를 반영한 기록 수정이며 수용 기준 변경이 아니다. safe-integer 테스트의 세부 구분은 구현 Task에서 구체화할 note로 남긴다.

### 사용자 제공 Claude Code 리뷰(2026-10-11, PR #29, 대상 c9ec7dd)

- 이번에 사용자가 전달한 별도 리뷰다. 리뷰 파일은 읽기 전용으로 보존한다. 리뷰어는 실제 소스·프로토콜·테스트를 도구로 열어 대조했다고 보고했다. 위 하네스 직접 호출 M1–M6/m1–m8 검토와 다른 실행이며, 다른 모델의 검토 또는 다중 모델 합의로 표현하지 않는다.
- 계획 리뷰 `codex_review_feedback_2026-10-10_task29-plan.md`와 계획 재검토 `codex_review_feedback_2026-10-11_task29-plan-rereview.md`는 **작성 당시 미전달, 이번에 함께 수령**했다. 당시 제안을 이미 반영한 것으로 소급 기록하지 않는다. 현재 처리 대상은 `codex_review_feedback_2026-10-11_task29-pr29.md`의 A-1–A-4/N-1–N-2다.
- 사용자 리뷰 판정: 소규모 수정 요청, blocker 0 / major 1 / minor 3 / nit 2. Astra는 실제 문서·프로토콜 §2/3/6/10·설치된 encoder를 읽고 판단표를 보고했다. 사용자가 수정 범위를 승인했다. 현재 수정 진행 중이며 종전 PASS는 c9ec7dd 전달 당시 판정이다.
- 승인된 계획: A-1 연산×입력 조건×arm 대응표와 첫 연산 순서 결정 gate; A-2 encoder 열람 사실; A-3 pixel hash 후속 결정; A-4 프로토콜 필드 대응; N-1 새 커밋 trailer; N-2 식별 정보 정리. clean-only 및 canonical 동치 단정은 피하고 불명확한 칸은 `[검증 필요]`로 둔다.
- 이번 수정의 검증: 고정 문서 검사 PASS(공백·개행·fence·상대 링크), `git diff --check` exit 0, 현재 수정 경로와 base 대비 경로 모두 기존 세 문서. 순수 문서 수정으로 RED 해당 없음. 전체 npm gate는 NOT RUN — 사용자 승인에 따른 코드 무변경 문서 수정이며 이전 실행 결과와 구분한다. 수정 diff/PR 본문 한정 재검토 완료.

| 지적 | 승인된 판단과 처리 상태 |
| --- | --- |
| A-1 Major | 수정 수용. §3.1의 5개 후보×4개 입력 조건×arm 대응, variant 준비와 arm 내부 변환 구분, 첫 연산 순서는 §8 gate 1로 이동. clean-only 및 canonical 동일 preset 단정을 피하고 미정 칸을 `[검증 필요]`로 표시했다 |
| A-2 Minor | 수용. Astra가 설치된 fast-png 8.0.0의 encoder export·기본값을 열람 확인. 실행/프로필 적합성/결정성 증거와 구분하며 리뷰어 scratch 실측은 저장소 검증으로 인용하지 않았다 |
| A-3 Minor | 수정 수용. decoded pixel hash와 그 치수·채널·bitDepth·raw 표현을 후속 결정으로 추가. 프로토콜 필수 필드 또는 encoded hash 대체로 확정하지 않았다 |
| A-4 Minor | 수정 수용. §6 필드 대응, 원본·출력 format/channels/bitDepth, 원본 경로 참조 제안, 출력 경로·identity 및 재-ingest 의미의 미결정 경계를 기록했다 |
| N-1 Nit | 수용. c9ec7dd의 trailer 누락 확인. 이력 보존, 이번 새 커밋의 `Agent: codex` trailer 검증 예정 |
| N-2 Nit | 수용. §1 첫 항목에 PR·브랜치·base를 모았다 |

- 분석 문서 보정: 별도 `claude-opus-5-5` 호출 성공 및 모델 일치 확인. Astra가 적용 전 JPEG variant format, 경로 hash와 경로 참조 구분, encoder 실행 주체 및 M6 범위 문구를 작성자에게 돌려 명확화했다. 작성자는 제공된 발췌만 읽었고 실행하지 않았다.
- 이번 하네스 한정 재검토: 별도 `claude-opus-5-5` 실행 성공, SPEC PASS / QUALITY PASS WITH NOTES, blocker 0 / major 0. A-1–A-4/N-2 ADDRESSED, N-1은 새 커밋 대기. 경미한 D1–D7 및 note D8–D11을 한 묶음으로 보강했다. 별도 `claude-opus-5-5` 한정 재확인에서 D1–D11 모두 ADDRESSED, 새 blocker/major 0. 잔여 R1은 재검사·재검토 완료 시제로 기록을 동기화했다. R2–R4는 비차단 note로 남긴다: 프로토콜 행 번호는 명시된 base 기준이며, encoder 실행 실험을 하지 않았다는 사실과 JPEG 조건의 도출 근거는 본문에 명시돼 있다.
- 리뷰어가 확인하지 못한 원본 identity/format/bitDepth는 Astra가 `src/core/types.ts:22–40`, `src/core/image-artifacts.ts:61–75`에서 직접 확인했다. 사용자 제공 리뷰의 실제 모델은 전달된 리뷰 첫 항목에 `claude-opus-5-5`로 명시돼 있다. 하네스 리뷰어가 이 원문을 읽었다고 주장하지 않는다.
- 전달 계획: 같은 브랜치·PR에서 `fix(review): ...` 별도 커밋과 `Agent: codex` trailer, push 후 Draft 및 HEAD/upstream/PR head 일치 확인. 이력 재작성·Ready·merge·다음 Task는 수행하지 않는다.

### Codex 6 Terra

- NOT RUN. Claude Opus 5.5 실제 호출이 성공해 폴백 조건이 성립하지 않았다. 다른 Terra 버전으로 대체하지 않았다.

### 종합 판단

- 초기 검토의 근거 범위는 제공된 계획·Astra 확인 사실이었다. 리뷰어가 소스를 직접 읽었다고 주장하지 않는다.
- 작성과 검토는 같은 Claude 모델의 별도 실행이며 절차적으로 독립이다. 다중 외부 모델 합의가 아니다. 최종 Astra 검토는 별도로 수행한다.
- 첫 리뷰의 no-op 권고 자체 철회는 채택하지 않았다. 제안 단계에서 대안을 비교하고 출력 참조를 명확히 하는 것으로 수정했고 재검토자가 수용했다.
- Task 28 사용자 제공 리뷰를 Task 29 리뷰로 재사용하지 않았다.

## 8. 자체 리뷰

- 정확성: source metadata·기존 identity·프로필·검증의 한계와 미래 변환 계약을 분리한다.
- 안정성/보안: 기존 동작 변경 없이 read/write 경계와 source 변동·alias·부분 실패·정보 노출을 후속 gate로 명시한다.
- 성능: 현행 cap을 총 메모리/시간 보장으로 설명하지 않으며 새 성능 효과를 주장하지 않는다.
- 유지보수성: 상대 경로와 심볼로 근거를 연결하고 기존 연구 문서·API의 사실을 변경하지 않는다.
- 한계: 새 crop encoder·writer·manifest는 구현 및 검증되지 않았다.

## 9. 남은 작업

- [x] c9ec7dd 전달 당시 문서 Task의 작성/독립 검토/PR/최종 gate 완료
- [ ] 이번 리뷰 수정의 한정 재검토·trailer 포함 커밋·push·최종 Astra 검토 및 head 동기화
- [ ] 사용자 검토 및 승인 (merge 및 다음 Task 미수행)
- 후속 승인 사항: 첫 연산 순서·scope·공개 API/출력 계약, codec 출력 프로필, pixel/resource budget, 캡처·writer 전략, no-op 표현, manifest 직렬화/hash/저장 수명·공유 경로 정책.
- F-12·모델 선정·hosted 측정·품질/비용/지연 효과는 별도 작업이다.

## 10. 사용자 승인 필요 사항

- 현재 승인: Task 29 문서 분석·계획 재개와 새 전역 하네스 적용, 검증 후 push/Draft PR.
- 새 구현 선택은 아직 승인되지 않았다. 비교 후보와 대안·위험·진입 gate는 분석 문서에서 검토한다.
- Draft PR merge 및 다음 Task 구현은 최종 보고 후 명시적 승인을 기다린다.

## 11. 최종 요약

- c9ec7dd 전달 당시 결과: 초기 검토, runtime gate, 1차 문서/staged 검사 완료. 독립 마일스톤 및 한정 재검토 통과; 요구사항 8개 PASS, blocker/major 0. Draft PR #29 생성과 이후 전체 gate 완료. 최종 기록만 후속 커밋하며 runtime은 검증한 내용과 동일하다.
- 전달: [Draft PR #29](https://github.com/kimcheolhui9846/token-context-optimizer/pull/29), base main, branch `codex/task-29-image-provenance-plan`, 본문 커밋 `6ce105e613e9f2e4e977c234d0643236835fc69e`. 최종 기록은 후속 커밋으로 전달하며 merge는 수행하지 않는다.
- c9ec7dd 전달 당시 Astra 직접 검토: 요구사항 8개, 실제 분석 문구/소스/기존 테스트, 세 파일 diff, 검증 로그, 초기 및 마일스톤 검토 조치, Draft base/head/files 확인. 당시 판정 PASS WITH NOTES: 미래 변환은 미구현, 작성/리뷰는 동일 Claude 모델 별도 실행·발췌 기반, Windows FIFO 1개 skip.
- 다음 확인: 최신 PR head와 최종 보고를 확인하고 승인 전 구현/merge를 진행하지 않는다.
