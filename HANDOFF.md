# HANDOFF

## Task 21 — JPEG 입력 확장 계약과 실행 가능성 (2026-09-21)

### 1. 목적 / 요구 / 범위
- 사용자가 Task20 검토 완료 및 다음 Task 진행을 승인함. 논문 우선, 이미지 이후 영상 확장 원칙 유지.
- 목표: 논문 JPEG-only/combined 조건의 선행 기능인 M1b 제한 JPEG ingest/inspect의 구체적 계약과 검증 경로를 확정한다.
- 우선 조사: strict decode/entropy 소비, 자원 제한, JFIF/EXIF/ICC 처리, 기존 PNG/API/네 runtime 파일 계약 호환성. 라이브 모델/데이터 업로드/영상/원본 쓰기/PR merge는 제외.
- base `856a417158ffa259b39153efbc140a8900e24993` / `origin/codex/task-20-png-ingest`; branch `codex/task-21-jpeg-ingest`; 별도 worktree. Task18 dirty와 Task19/20 branch/PR 보존.
- 설계 확정 전 runtime/의존성 변경 없음. 최종 구현 여부는 실제 codec 검증과 검토 가능한 설계 승인 경계에 따라 결정한다.

### 2. 계획 / 수용 기준
- [x] 적용 지침/기존 소스/논문/PR 상태 확인 및 Git 격리. root HANDOFF를 첫 산출물로 갱신.
- [x] Astra 실제 요구 분석: JPEG 입력 우선 권고; PNG 변환은 쓰기/보간/provenance 계약 추가, manifest만으로는 입력 갭 해결 불가.
- [x] codec 공식 소스와 최소 독립 재현으로 strict 한계 확인. 최대 자원/신규 배포 호환성은 후속 구현 gate로 구분.
- [x] 구체적 프로필/오류/형식별 record/MCP/회귀 기준 설계 및 초기 외부 교차검토 시도(DEGRADED).
- [x] 검토 결과·모델·실행 명령·미검증 항목 기록, milestone 검토 및 프로젝트 gate.
- [ ] Task별 commit/push/Draft PR/post-Draft gate/최종 Astra 리뷰; 다음 Task는 사용자 승인 후.

### 3–4. 결정 / 위험
- 기존 두 image MCP 도구와 PNG record를 유지하고 JPEG만 구분된 프로필로 확장하는 방안 우선.
- EXIF/ICC/Adobe metadata와 progressive/CMYK 등의 폭넓은 지원, native 배포 개편은 이번 최소 범위에 포함하지 않음.
- decoder가 pixels를 반환했다는 사실만으로 완전한 JPEG 검증을 주장하지 않음. `jpeg-js` v0.4.4 strict 옵션만으로 전체 소비 계약을 충족하지 못함을 실제 재현함. 독립 entropy 검증기 방식은 승인 전 제안이며 아직 구현/안전성 증명되지 않음.

### 5–7. 검증 / 오류 / 교차 검토
- Git fetch와 worktree 생성은 첫 sandbox 권한 오류 후 동일 명령 escalation 재실행 성공. 기존 파일을 stash/reset하지 않음.
- Astra 요구 분석 호출 성공. 외부 provider와 구현 모델은 이번 Task 실행 시 새로 확인한다. 이전 성공/실패를 새 호출 성공으로 표현하지 않음.
- 코드 구현 전 설계/조사 단계: RED는 아직 해당 없음; 재현 probe의 관찰과 코드 TDD를 구분한다.

### 8–11. 상태 / 다음 단계 / 승인
- 재개 후 실제 Astra 분석 응답 확인: Task21을 설계·실행 가능성 산출물로 권고. 독립 entropy 검증 없는 strict wrapper는 완료 기준을 충족하지 못함.
- [설계 제안](docs/superpowers/specs/2026-09-21-jpeg-ingest-design.md)과 [codec 실험 결과](docs/research/jpeg-codec-feasibility.md) 작성. production 코드/의존성 변경 없음. 문서 작업이므로 RED 비해당; 수용 검사는 근거 대조·링크·범위 일관성·기존 프로젝트 gate로 정의함.
- 초기 외부 재확인: Claude `claude-opus-5` 호출은 조직 subscription access 비활성 오류(models=[]), Gemini key 존재 false/free API 사용 미확립으로 미수행, Copilot launcher는 Cannot find GitHub Copilot CLI. **Cross-check status: DEGRADED**. native Astra 응답을 외부 제공자 검토로 계산하지 않음.
- `npm.cmd ci --ignore-scripts` 성공 후 초기 image baseline 18 PASS / Windows FIFO 1 skip. 재개 후 `node .artifacts/task21-codec-probe/probe.cjs` 성공: strict에서도 EOI 전/후 junk와 잘못된 SOF length 수락 재현; 8가지 입력 관찰과 작은 자원 제한 오류 기록. 구현 TDD나 최대 입력 안전성 증거는 아님.
- milestone Astra: 설계 산출물 PASS WITH NOTES, blocker/major 없음. minor(profile literal, Huffman 정책, stale 진행 상태) 반영. 정확한 probe script/fixture가 PR에 없는 재현성 한계 명시. 외부 검토 공백과 parser/자원 증명은 후속 gate.
- pre-PR gate 2026-09-21 10:19–10:20 KST: targeted 18 PASS/1 Windows FIFO skip; full 588 PASS/1 skip/14 files. build/typecheck/smoke:mcp/validate:plugin/benchmark 모두 PASS. text benchmark 3×20 결과이며 이미지 효과 아님. production diff 없음.
- 진행 중: 설계 검증 완료 후 Git/PR 전달 및 최종 검토. 사용자는 다음 Task 진행을 승인했으며 PR merge는 승인하지 않음.
- runtime 변경 전 남은 계약을 실제 근거로 정리한다. 조사로 요구되는 추가 설계/범위 선택은 구체적 산출물을 준비한 뒤 제시한다.
- 과거 Task20 기록은 아래 보존하고 현재 상태는 위 섹션을 기준으로 한다.

### Draft PR / post-Draft 검증
- commit `f8be67c643a5e09e9c489e6c2cadec075befdb82` push 성공. [Draft PR #20](https://github.com/kimcheolhui9846/token-context-optimizer/pull/20), OPEN/Draft, base `codex/task-20-png-ingest`; PR18/19/20 merge 미수행.
- 2026-09-21 10:22 KST PR 생성 후 `npm.cmd test -- --run tests/image-artifacts.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts`: 18 PASS/1 Windows FIFO skip. `npm.cmd test`: 588 PASS/1 skip/14 files.
- 같은 post-Draft 실행에서 `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark` 모두 PASS. text benchmark 3×20, p95 1.42/1.61/1.03ms. 이미지 모델/효과/최대 JPEG 자원 검증 NOT RUN(설계 범위 밖).
- milestone 외부 교차검토 재시도도 Claude 조직 접근 오류(models=[]), Gemini free API 접근 미확립, Copilot CLI unavailable로 DEGRADED. Astra 독립 설계 검토와 실제 회귀 검증으로 문서 산출물 위험을 확인했으나 외부 검토 공백은 남음.
- UTF-8 문서4개/로컬 링크15개 PASS; 첫 node inline 검사는 PowerShell quoting으로 SyntaxError여서 성공 처리하지 않고 PowerShell 검사를 다시 실행함. `git diff --check` PASS. build 후 bundle Git blob hash는 HEAD와 동일 `1b139e039463622d361aad3706ebcf0de0328fe6`; 내용 변경 없음.
- 자체 리뷰: strict false-accept 관찰과 제안 계약을 구분하며 기존 runtime·원본·의존성 보존. 취약한 입력 검사/자원 상한은 아직 구현되지 않았으므로 안전성 완료 주장을 하지 않음. 정확한 probe 재현물은 로컬 scratch에만 있다는 전달 한계를 명시함.
- 남은 사용자 결정: 설계 문서의 제한 4:4:4/JFIF 프로필과 독립 entropy 검증기 방식 승인. 이후 구현 계획/TDD로 진행하며 이번 문서 전달에서 JPEG runtime을 구현했다고 보고하지 않음.

---

## Task 20 archive
# HANDOFF

## Task 20 — PNG 입력과 원본 보존 (2026-09-20)

### 1. 목적 / 승인 / 범위
- 사용자: Task 19 검토 승인 및 다음 진행, 중단 후 재개 지시.
- 목적: 논문 이미지 파일럿의 canonical PNG 입력을 위한 M1a 최소 구현. 논문 우선, 기존 배포 구조 보존.
- 범위: 제한된 정적 PNG 검증/index/inspect, 원본 bytes/hash/path/dimensions/format 추적, 경로·크기·pixel 제한, MCP 계약 및 독립 설치 검증, 논문 구현 상태 갱신.
- 제외: JPEG/WEBP/APNG/영상, resize/crop/OCR/선택/guard, 모델 호출/과금/실험 성능 주장, native runtime 배포 개편, PR merge. M1 전체 완료로 표현하지 않음.
- base: 승인된 Task 19 `990aa9f8fa875aafeaaa6fbf38fdfcc5b1e094a9`, `origin/codex/task-19-image-paper-first`; 별도 worktree / `codex/task-20-png-ingest`. Draft PR #19가 이 base로 OPEN. Task 18 원본 dirty checkout 보존.

### 2. 계획 / 검증 기준
- [x] 기존 코드/실제 배포/승인된 논문 로드맵 읽기 전용 확인 및 Task Git 격리.
- [x] Astra 실행 복구 및 PNG-first M1a 범위 검토. native sharp는 현재 단일 bundle/four-file installer와 충돌하므로 이 Task에서 추가하지 않음.
- [x] bundle 가능한 PNG validation 경로, 자원 제한과 명시적 오류 계약 결정; 초기 cross-check.
- [x] 실패 회귀 RED → GREEN → 범위 내 정리/회귀 검사. 최초 missing-module RED 후 행동 RED 누락은 아래 공개 기록.
- [x] malformed/CRC/truncation/oversize/pixels/APNG/경로탈출/원본 무변경/메타데이터 사본/실제 설치 MCP 검증(Windows FIFO 제외).
- [x] 논문/README/핸드오프 상태를 실제 지원 범위와 일치시킴.
- [x] 독립 검토, commit/push/Draft PR, post-Draft 프로젝트 gate, 최종 Astra 리뷰.

### 3–4. 결정 / 위험
- 새 기능은 text artifact store/API와 분리. 기존 동작/설치 계약 보존.
- 원본 보존은 write-free indexing과 hash 추적이며 외부 파일을 영구 보관/불변으로 만드는 기능은 아님.
- 원본 PNG 파일 크기와 header/pixel 제한만으로 decode 안전성을 주장하지 않음. 압축 해제와 decoder 메모리/CPU 한계를 확인하고 제한을 문서화.
- 원문 자료나 credential을 외부 검토에 보내지 않고 비민감 설계 발췌만 사용.

### 5–7. 모델 / 오류 / 검토 기록
- 이전 시도에서 Astra와 dependency-expert가 quota로 중단됨. 재개 후 Astra 실제 분석 응답 확인. 구현 모델은 실행 시 Luna 우선, 실제 불가 시에만 GPT-5.5.
- 초기 Astra 계획 검토 PASS WITH NOTES: partial M1a 제한 프로필, 전체 PNG 구조/CRC/압축 입력 소비 검증, 독립 fixture 및 설치 bundle 검사, 최대 메모리 한계 명시를 수용 기준으로 확인.
- 초기 Claude: 정확한 `claude-opus-5` 호출 요청이 조직 구독 접근 비활성 오류로 실패, 실제 모델 목록 비어 있음. Gemini: 두 API 키 환경 변수 존재 여부만 확인했으며 부재; 무료 API 접근/quota 미확립으로 미수행. Copilot: launcher가 `Cannot find GitHub Copilot CLI`로 실패. **Cross-check status: DEGRADED**; native Astra 검토를 외부 검토 성공으로 계산하지 않음.
- `npm.cmd ci --ignore-scripts` 성공. baseline `npm.cmd test -- --run tests/core.test.ts`: 182 PASS. 기존 audit moderate 2건은 vitest/@vitest/mocker 개발 의존성, 제시된 fix가 major upgrade여서 이번 이미지 기능 범위에서 임의 업그레이드하지 않음.
- Luna (`gpt-5.6-luna`) 실제 완료 응답 확인. 최초 RED는 missing-module collection 실패이며 계획된 compiling-stub 행동 RED는 수행되지 않음. 이 절차 차이를 숨기거나 행동 실패로 표현하지 않는다. 첫 구현 이미지 7 / 전체 577 PASS는 worker 보고; 주 에이전트가 core+image 189 PASS를 03:54 직접 확인.
- 첫 마일스톤 Astra 검토 CHANGES REQUIRED(상세 검토 진행): 경로/파일 재확인, 제한·실패 케이스와 설치 MCP schema/structuredContent 검사 누락 보완 필요. 같은 Task 안에서 새 회귀 테스트의 실제 실패를 먼저 확인하고 수정할 예정.
- 03:54 외부 제공자 재확인: 정확한 Claude 모델 요청은 동일 조직 접근 오류와 models=[]; Gemini API 키 부재/무료 사용 미확립, Copilot CLI unavailable. 마일스톤 외부 검토 미수행, DEGRADED 유지.
- 문서 8개 strict UTF-8/fence와 local link 29개 검사 PASS; 수정된 skill의 `quick_validate.py` PASS. 최종 구현에 맞춰 오류 계약을 추가한 뒤 다시 확인한다.
- Astra 최종 첫 마일스톤 verdict: SPEC/QUALITY CHANGES REQUIRED. major 5개: regular-file 확인 전 open의 FIFO blocking, 읽기 후 pathname identity 재확인 누락, 보안 경계 테스트 부족, 원본 무변경/identity/copy 테스트 증명 부족, 설치 MCP schema/structured/error 검사 부족. minor: `..name` 정상 자식 거절, fixture cleanup 누락, 손상 구조/미지원 프로필 구분, chunk type ASCII masking, 오류 문서 누락, 조밀한 코드 가독성.
- 위 항목을 Luna fix round 1에 통합 전달. 승인된 제한 PNG 계약 안의 국소 수정/검증이며 새로운 변환 기능이나 공개 영상 동작을 추가하지 않음. 최초 missing-module RED 절차 차이도 유지 기록.
- `npm.cmd audit --omit=dev --json`: runtime vulnerabilities 0. 전체 baseline moderate 2개는 위에 기록한 기존 개발 도구 항목.
- fix round 1 중 Luna가 실제 usage limit으로 중단(표시된 재개 시각 08:39). 진행 중 변경은 보존하고 사용자 지정 대체 모델 `gpt-5.5` worker에 동일 파일 소유권/남은 결함/계획과 검증 기록을 전달했다. 대체 모델의 성공 여부는 응답과 산출물로 확인한다. Task/브랜치/PR 범위를 새로 시작하지 않음.
- Astra 추가 패키징 검토에서 신규 fast-png/fflate/iobuffer의 LICENSE 전문이 배포 bundle에 누락된 major 확인. 네 runtime 파일 구조를 바꾸지 않고 build에서 설치된 LICENSE 원문을 읽어 bundle 주석에 포함하는 최소 수정과 회귀 검사를 같은 round에 추가했다. 기존 의존성 전체 감사/임의 라이선스 해석은 범위 밖. `scripts/build-bundle.mjs` 및 필요한 신규 packaging test를 worker 소유 범위에 추가.
- GPT-5.5 실제 수정 완료 응답 확인(09:00 전). 이미지16 PASS/Windows FIFO1 skip, core 포함198 PASS, build/typecheck/smoke PASS를 보고. 주 에이전트가 09:00 이미지3 suites 16 PASS/1 skip 및 `npm.cmd run smoke:mcp` PASS 직접 재확인. 현재 Astra scoped 재검토 중이며 아직 Task 완료가 아님.
- RED 근거: 신규 dependency license 누락 검사의 실제 실패 후 bundle 고지 포함으로 GREEN. worker는 same-size 변경 regression의 초기 test-hook 접근과 최종 mock 접근을 구분해 보고했으며 public `beforeOpen` 옵션은 최종 API에서 제거. 최초 RED 절차 차이는 위 기록대로 유지한다.
- 설치 smoke에서 Windows `node:constants`의 named `O_NOFOLLOW` export 부재로 server boot 실패를 발견; `node:fs`의 constants 객체 사용으로 수정하고 build/typecheck/설치 smoke 재통과. source-only Vitest 통과를 설치 runtime 검증으로 대체하지 않음.
- Round1 Astra re-review CHANGES REQUIRED: reader/플랫폼 flags/LICENSE와 cleanup 등은 해결. 기존 수용 기준의 잔여 검사(실재 sibling/traversal, CRC를 통과하는 손상 압축/overflow, 정확한 오류 및 failed-store, 원본 사전 hash/반복ID/copy-on-put·return, post-read replacement), 잘못된 IHDR 분류, MCP isError·양쪽 schema 검사 보완을 round2로 전달. 오류 문서는 현재 inspect의 의도된 remapping을 정확히 기록하도록 주 에이전트가 수정.
- Round2 완료: 새 회귀에서 custom store.put이 반환 record를 변조하는 문제와 IHDR 오류 분류 2건의 실제 RED를 확인한 후 복사 전달/구조 오류 분류를 수정. 실제 sibling/traversal, CRC-correct 손상/overflow, pre/post 원본 비교, copy/반복 ID, post-read rename, strict MCP error와 required schema 검사를 보완. worker targeted200 PASS/Windows FIFO1 skip, build/typecheck/smoke PASS.
- Astra round2 독립 직접 검토: **SPEC PASS / QUALITY PASS WITH NOTES**, 기존 must-fix 5개 모두 해결, 미해결 blocker/major 없음. 남은 note: 초기 behavioral RED 절차 차이, Windows에서 FIFO 미실행, 외부 검토 DEGRADED, 일부 parser의 조밀한 서식. 이는 scoped review이며 최종 Git/PR 리뷰 전.
- 2026-09-20 23:45 사용자 재개 지시. 이전 주 에이전트 전체 검사 session은 `Unknown process id`로 결과를 회수할 수 없어 성공으로 기록하지 않고 targeted부터 새로 실행한다. 변경/브랜치 보존 확인; 새 Task/중복 PR 생성 없이 진행.

### 8–11. 현재 상태 / 후속 승인
- Task 20 완료, 최종 **PASS WITH NOTES**, 사용자 검토 대기. [구현 계획](docs/superpowers/plans/2026-09-20-png-ingest.md)에 따라 Luna와 승인된 GPT-5.5 대체 구현, 주 에이전트 문서/Git, 독립 Astra 검토로 진행했다. Task 19 이력은 아래 보존.
- 다음 Task와 merge는 별도 사용자 승인 필요.

### Pre-PR 최신 검증 (2026-09-20 23:45–23:46 KST)
- `npm.cmd test -- --run tests/image-artifacts.test.ts tests/image-source-race.test.ts tests/image-packaging.test.ts tests/core.test.ts`: **200 PASS / 1 skipped**.
- `npm.cmd test`: **588 PASS / 1 skipped / 14 files**. skipped는 POSIX FIFO: Windows에서 NOT RUN. 실제 Windows directory/junction/path replacement 검사는 실행됨.
- `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`: 모두 PASS.
- 기존 text benchmark 3 scenarios × 20 samples PASS; p95 1.52/1.47/0.97ms. 이미지 성능·모델·실제 비용 실험은 NOT RUN(범위 밖).
- 재개 후 외부 milestone 검토 요청: Claude 정확한 `claude-opus-5`는 동일 조직 접근 오류(models=[]), Gemini 무료 API 접근 미확립, Copilot CLI unavailable. **Cross-check status: DEGRADED** 유지.
- 자체 리뷰: text API·four-file 배포 계약 보존; source 무변경과 범위/오류/설치 근거 확보. 한계는 synchronous decoder/여러 최대 약64MiB 버퍼/metadata entry cap 없음/OS race-proof sandbox 아님. 초기 RED 절차 차이와 일부 조밀한 parser 서식은 공개된 note; 미해결 blocker/major 없음.
- 변경 파일: 이미지 core/types/server, 독립 image/race/package 테스트 3개, dependency/lockfile, bundle build 및 MCP smoke와 재생성 bundle, README/skill/design/이미지 계약/논문·protocol/계획/양쪽 handoff. 기존 파일 삭제/기존 연구 코드 수정 없음.

### Draft PR 및 post-Draft 검증 (2026-09-20 23:48–23:49 KST)
- 구현 커밋 `b9b1f10e40bf29d6af02863bb9185400db9ef578` / `feat: add validated PNG image artifacts`, upstream push 성공.
- [Draft PR #19](https://github.com/kimcheolhui9846/token-context-optimizer/pull/19): OPEN / Draft, base `codex/task-19-image-paper-first`, head `codex/task-20-png-ingest`, 해당 SHA 일치 확인. PR #18 및 #19 merge 미수행.
- PR 생성 후 targeted200 PASS/1 Windows FIFO skip, 전체588 PASS/1 skip/14 files. build/typecheck/installed MCP smoke/plugin validation/benchmark 모두 다시 PASS.
- text benchmark 3×20, p95 1.52/1.48/1.06ms; 이미지 모델 결과 아님. 문서9개/로컬링크31개 PASS. 재빌드 bundle의 커밋 대비 내용 diff 없음.
- `gh pr checks 19`: no checks reported. Hosted CI 성공을 주장하지 않으며 로컬 gate가 관찰된 증거다. 별도 lint/format script 없음; typecheck·diff 검사 실행.
- pre-commit 우회 없음. hooksPath 및 활성 non-sample hook 없음. 원래 Task18은 `26e22e4` / HANDOFF dirty 및 paired-success 소스·테스트 untracked 그대로 보존 확인.
- broad pre-transport Astra review PASS WITH NOTES; 이 post-Draft 기록을 push한 다음 최신 PR/SHA/작업 트리/최종 요구사항을 별도 확인한다.

### 최종 Astra Review / 승인 게이트
- **PASS WITH NOTES**. Astra는 `9a612fabf37a0efc699a970daee05152f23b098e` 실제 diff/HEAD/upstream/clean tree, PR #19 OPEN Draft/base/latest SHA, 요구사항·호환성·테스트·문서·수정된 지적을 직접 확인했다. post-Draft gate 결과는 주 에이전트의 관찰과 HANDOFF 근거로 검토했으며 별도 재실행했다고 주장하지 않음.
- 미해결 blocker/major 없음. retained notes: 초기 행동 RED 누락(후속 regression RED와 구분), Windows FIFO NOT RUN, 외부 cross-check DEGRADED, synchronous decode와 여러 약64MiB 버퍼/metadata count 제한 없음, filesystem sandbox 한계, 일부 조밀한 parser 서식.
- `git ls-remote` 첫 조회는 sandbox network connect 실패; 허용된 escalation 재실행 성공. 원격 main `4e9b7c5`, Task19 `990aa9f`, Task20 `9a612fa` 확인. 이후 변경은 이 최종 판정·계획 완료 상태만 기록하며 push 후 최신 SHA/PR/clean state를 다시 확인한다.
- 전달 결과: 제한 PNG input/inspect(M1a), 원본 보존·경로/오류/패키징 검증, 연구 초안과 구현 상태 일치. JPEG/WEBP/그 외 PNG, 변환/OCR/guard/hosted/video, 이미지 모델 실험은 미구현·미실행이며 다음 승인 Task 범위.
- **다음 Task로 진행하지 않고 사용자 검토 및 승인을 기다린다.** PR #18/#19 merge 미수행. 다음 작업자는 이 섹션과 Draft PR #19, 원래 dirty Task18 보존 상태를 먼저 확인한다.

---

## Task 19 archive

## Task 19 — 논문 우선 이미지 연구 초안과 실험 설계 (2026-09-19)

### 1. 작업 개요
- 사용자 요구: 논문 작성과 플러그인 개발 병행, 충돌하면 논문 우선. 앞선 이미지 우선·승인 후 영상 확장 방향 유지.
- 이번 전달 범위: 한국어 논문 초안, 검증된 1차 문헌 표, 이미지 실험 프로토콜과 최소 플러그인 개발 연결표, 문서 탐색/핸드오프 정리.
- 제외: 실행 코드/의존성 변경, 영상 구현, 실제 모델 실험·과금·데이터셋 업로드, 실험 결과/우월성 주장, PR merge.
- 기준: `origin/main` / `4e9b7c562b7f08fc24e79e615f68b467cbf8eeda`, 원격 fetch 후 확인. 전용 브랜치 `codex/task-19-image-paper-first`, 이 분리 worktree 사용.
- 기존 Task 18 브랜치의 HANDOFF.md 및 paired-success 미완료 소스/테스트는 보존. 미완료 Task 18을 이번 작업에 포함하지 않는다.
- 이 루트 HANDOFF가 첫 작업 문서. 이전 이력: [기존 핸드오프](docs/agent/HANDOFF.md).

### 2. 계획 / 수용 기준
- [x] 적용 지침/실제 저장소/기존 연구 상태 확인 및 Git 격리.
- [x] 별도 native `gpt-6-astra` 초기 계획 검토 PASS WITH NOTES. 현재 런타임은 UTF-8 텍스트 처리이며 이미지 backend 없음.
- [x] 1차 문헌의 제목/연도/URL/지원 주장/전이 한계 확인. 3편은 공식 초록 검색 색인만 확인한 한계 명시.
- [x] Luna 초안 작성 후 usage limit으로 중단; 지정된 대체 GPT-5.5가 3문서 보완 및 실제 완료 응답. 구현 상태·제안 방법·미측정 결과 분리.
- [x] 이미지 원본 family 분할, arm 통제, 변환 설정, fallback, 채점/실패 분모, paired 분석, 실제 usage와 bytes 구별, pilot/확증 실험 gate 정의.
- [x] 각 개발 항목을 논문 증거 요구와 연결. 영상은 후속 범위.
- [x] 문서 링크/주장/범위 검증 및 프로젝트 gate, Draft PR, post-PR 재검증, Astra 최종 리뷰.

### 3–4. 변경 및 결정
- 논문에 필요한 연구 질문과 실험 설계를 우선 고정하고 기능 개발은 후속 사용자 승인 Task에서 수행한다.
- 기존 텍스트 연구 자료는 삭제하지 않고 별도 과거 연구로 연결. 텍스트 테스트/benchmark/mock 결과를 이미지 효과로 전용하지 않는다.
- 제출처/마감일 질문은 대기 중이며 미지정이면 한국어 연구용 Markdown 초안을 기본으로 한다.
- RED: 순수 문서 작성이므로 코드 failing test는 해당 없음. 위 수용 기준과 근거/링크 검증을 편집 전 정의했다.

### 5–6. 검증 및 오류 기록
- 격리 worktree 생성 첫 시도는 ref lock 권한 오류; 동일 명령의 승인된 escalation으로 성공.
- 초기 targeted baseline `npm.cmd test -- --run tests/research-dataset.test.ts`: 30 PASS / 9 skipped / suite FAIL. 격리 worktree에 local node_modules/typescript/bin/tsc가 없어 CLI suite 준비 실패. 원본 코드 오류로 단정하지 않는다. lockfile 기반 의존성 설치 후 재실행 예정.
- `npm.cmd ci --ignore-scripts`로 lockfile 의존성 설치 후 동일 targeted baseline 39/39 PASS. 코드/lockfile 변경 없음. 초기 실패 원인 확인 및 환경 복구 완료. 문서/프로젝트 최종 결과는 후속 기록한다.

### 7. 교차 검토
- Astra: 실제 native `gpt-6-astra` 호출 및 응답 확인. 초기 범위 검토 PASS WITH NOTES; 외부 제공자 리뷰가 아님.
- Claude Opus 5: 초기 비민감 계획 검토를 정확한 `claude-opus-5`로 요청했으나 조직이 Claude Code 구독 접근을 비활성화했다는 오류로 실패. 실제 모델 사용 목록은 비어 있음; 다른 버전/API 키/유료 접근으로 대체하지 않음. 첫 CLI 시도는 variadic MCP 옵션이 prompt를 소비하여 모델 호출 전 실패했고 인자 경계를 수정하여 위 접근 오류를 확인.
- Gemini: launcher 있음, GEMINI_API_KEY/GOOGLE_API_KEY 환경값 존재 여부만 확인하여 둘 다 없음. 무료 API 모델/quota 미확립으로 검토 미수행; 유료 fallback 없음.
- Copilot: launcher 실행 결과 `Cannot find GitHub Copilot CLI`; 검토 미수행.
- 민감 정보/전체 저장소/전역 설정을 외부 검토에 보내지 않는다.

### 8. 자체 리뷰 / 위험
- 위험: 개발 완성도를 논문 결과로 오인, 이미지 미지원 기능의 구현 주장, 데이터 누수, 변환 비용 누락, 영상 범위 혼입.
- 보완: 독립 문헌 검증과 Astra 실제 산출물 리뷰, 원본/source-family/usage 추적을 실험 설계에 포함.

### 9–11. 현재 상태 / 승인 / 다음 작업
- 현재 상태: Task 19 완료, 최종 Astra PASS WITH NOTES, 사용자 승인 대기. 실제 이미지 결과 표는 작성하지 않는다.
- 다음 실제 플러그인 구현 Task와 모든 merge는 사용자 승인 전 착수하지 않는다.
- 최종 Git/PR/검증/미해결 검토 공백은 완료 시 갱신한다.

- 초기 Cross-check status: DEGRADED. 별도 Astra 검토로 보완하며 외부 제공자 성공으로 계산하지 않음.

### 중간 검증 및 문헌 기록
- 2026-09-19 pre-PR: `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS; `npm.cmd test` 570 PASS / 11 files; `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark` 모두 PASS.
- 기존 text benchmark 3 scenarios x 20 samples 통과. 이미지/hosted 실험은 NOT RUN, 이번 Task 범위 밖이며 아직 구현되지 않음.
- native Luna (`gpt-5.6-luna`, worker) 문서 작성 중. 별도 Astra 방법론 검토: 36개 family를 paired 분석 단위로 유지, guard contrast D-C, oracle 누수 차단, assigned-source 동일성, 실패/미실행 구분 권고를 전달.
- 문헌 6편: ChartQA/ScreenQA ACL 공식 초록과 MetaCompress arXiv:2603.21701v1 초록은 직접 접근. DocVQA/TextVQA/QuietPrune은 공식 CVF 초록의 검색 색인만 확인; CVF 직접 열람403으로 전체 본문 열람을 주장하지 않음. 연구자가 최초 요약에서 접근 방식을 충분히 구분하지 않아 재질의하고 문헌 표에 정정하도록 전달.
- 기존 본문 보존, 현재 README와 옛 paper/protocol 상단에 연구 방향 변경 및 과거 텍스트 연구 구분 표시.

### 재개 기록 (2026-09-19 22:13 KST)
- 사용자 재개 지시에 따라 같은 Task 19 / 브랜치 / worktree에서 계속한다. 새 Task나 중복 PR을 만들지 않는다.
- Luna 첫 작성이 usage limit으로 중단됐으나 3개 초안 파일은 보존돼 있다. 지정된 대체 모델 `gpt-5.5` worker에 이 3개 문서만 소유권을 부여하고 국소 일관성 수정/검증을 요청했다. 실제 완료 여부는 응답과 diff로 확인한다.
- 재개 targeted 검사 `npm.cmd test -- --run tests/research-dataset.test.ts` 39 PASS.
- 마일스톤 외부 검토: 정확한 `claude-opus-5` 비민감 요약 검토를 다시 시도했으나 조직 구독 접근 비활성 오류, models=[]로 실제 모델 호출 미수행. Gemini 키 환경 부재 및 무료 API 미확립, Copilot launcher CLI unavailable을 재확인. Cross-check status: DEGRADED 유지.
- 빌드가 만든 bundle의 Git 정규화 diff가 없음(exit 0)을 확인하고 해당 파일만 원래 worktree 표현으로 복구했다. 문서만 전달하며 원본 Task 18 변경은 그대로 보존한다.

### 마일스톤 내용 검토와 수정
- GPT-5.5 worker 실제 완료 응답과 3개 문서 원문을 직접 확인. 범위 내 변환 순서·oracle 접근·D-C 대비·문헌 접근 방식 수정 완료.
- Astra 첫 마일스톤 판정 CHANGES REQUIRED: major 1건(clean pixels 전면 금지가 clean 조건과 충돌), minor 1건(retry를 별도 slot으로 표현해 primary 분모 모호), minor 1건(핸드오프 상태 갱신 필요).
- 동일 승인 범위에서 주 에이전트가 국소 수정: clean 조건에는 배정된 clean 입력 허용; 손상 조건의 비배정 clean counterpart는 숨김; full original/fallback은 배정된 variant로 정의. retry는 보조 attempt이며 비용/호출 수에만 추가하고 primary 720/production576 분모 및 원래 실패 판정 유지.
- 8문서 strict UTF-8/코드 fence/local link 검증 및 staged diff 검사 PASS. 원격 문헌 전체 본문 또는 실험 재현을 검증했다고 주장하지 않음.
- Astra 수정 재검토: 내용 판정 PASS WITH NOTES, 미해결 blocker/major 없음. 외부 검토 DEGRADED, 초록 수준 출처 확인, 모든 이미지 기능/결과 미구현·미측정이라는 제한 유지. Draft PR/post-PR 및 최종 transport gate는 아직 진행 예정.

### Draft PR 및 post-PR 검증 (2026-09-19 22:20–22:21 KST)
- 내용 커밋 `1589c3bdc0de1a8d7b4579d23b835e2c62b4eefe` / `docs: draft image-first paper and evaluation protocol` push 성공.
- [Draft PR #18](https://github.com/kimcheolhui9846/token-context-optimizer/pull/18), base `main`, head `codex/task-19-image-paper-first`, OPEN / Draft 확인. PR 번호와 Task 번호는 별개다. Merge 미수행.
- PR 생성 후 targeted `npm.cmd test -- --run tests/research-dataset.test.ts`: 39/39 PASS (22:20).
- PR 생성 후 `npm.cmd test`: 570/570 PASS / 11 files (22:20).
- PR 생성 후 `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`: 모두 PASS.
- 기존 benchmark 3 scenarios x 20 samples, p95 exact 1.92ms / semantic 2.27ms / code 1.23ms. 기존 text fixture 회귀 증거이며 image/hosted 결과 아님.
- 문서 8개 UTF-8/fence/local link 34개 및 staged `git diff --cached --check` PASS. runtime/tests/dependencies 변경 없음. pre-commit 우회 옵션 사용하지 않았으며 설정된 hooksPath/활성 hook 파일 없음.
- 이미지/실제 API 실험, 신규 이미지 TDD: NOT RUN — 기능 구현 전 연구 문서 Task 범위 밖. 별도 lint/format script는 package.json에 없음.
- 남은 작업: 이 검증 기록을 같은 PR에 push, 최종 Astra가 실제 diff/PR/latest commit/검증/위험 확인, 사용자 승인 대기.

### 최종 Astra Review Result / 승인 대기
- 최종 판정: **PASS WITH NOTES**. Astra가 `965177c`의 실제 8문서 diff, HANDOFF, PR 설명/OPEN Draft 상태/latest SHA, clean worktree, 원래 Task 18 보존 상태와 관찰된 post-Draft 검증 근거를 확인했다. 미해결 blocker/major 없음.
- 원격 `main`은 `4e9b7c5`, Task 브랜치는 `965177c`임을 `git ls-remote`로도 확인. 최종 판정 기록만 추가한 후 동일 PR의 최신 SHA까지 재확인한다.
- `gh pr checks 18`: no checks reported. Hosted CI 통과를 주장하지 않으며 위 로컬 검증이 실제 증거다.
- 제한: Cross-check status DEGRADED; 문헌은 초록 수준(3편 검색 색인); 제출처/마감일 미지정; 이미지 구현·dataset·실험 결과 없음. 이 결과는 논문 연구 초안/평가 설계 전달 완료이며 논문 실험 또는 플러그인 기능 완성을 뜻하지 않는다.
- 이번 Task 파일: 새 논문/프로토콜/출처 3문서와 루트 HANDOFF, README·기존 handoff·역사적 paper/protocol 안내 4문서. 삭제 파일, runtime/test/dependency 변경 없음.
- 다음 후보: 사용자 검토 후 연구 질문·평가 조건을 확정하고 이를 검증할 이미지 ingest/원본 보존부터 별도 Task로 설계·구현. 논문과 개발의 충돌 시 논문 우선; 영상은 이미지 검증과 별도 승인 후.
- 승인 게이트: **다음 Task로 진행하지 않고 사용자 검토 및 승인을 기다린다.** Merge 미수행.
