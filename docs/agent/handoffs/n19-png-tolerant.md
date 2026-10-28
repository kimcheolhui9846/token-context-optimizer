# N-19 / WBS 6.12a — PNG tolerant 구현

- Tier E: 제품 코드 및 성능 측정 증거.
- 상태: 구현·독립 검토·성능·PR 전 7단계 검증 통과. Draft PR 및 PR 후 검증 대기.
- 기반: `bac0b29d69a60ba8c0aea7387985d4f088455a84`; 성능 기준 `4b67d72`.
- 브랜치: `codex/png-tolerant-impl`; 별도 worktree에서 기존 사용자 작업 보존.
- 요구사항: [승인 계획](../../superpowers/plans/2026-10-27-png-tolerant.md)의 §7–9.
- 범위: tolerant PNG 검사·색인·재검증·불투명 RGBA crop, MCP 계약, 문서, 측정 스크립트.
- 제외: overview/JPEG 확장, 새 의존성, research/paper/codex_review/기존 fixture 변경, merge.

## 계획과 현재 결과

- [x] 기준 build → typecheck: 성공.
- [x] 기준 대상 10파일: 341 passed / 5 skipped / 0 failed.
- [x] 1단계 검사·색인·저장 구현; strict validator와 bounded reader 유지.
- [x] 2단계 재검증·crop: 검토 수정 후 typecheck 성공, 대상 3파일 93 passed / 2 skipped / 0 failed.
- [x] 3단계 MCP·문서·패키징: 대상 3파일 39 passed / 0 skipped / 0 failed, typecheck/build/smoke 성공.
- [x] 성능 게이트와 PR 전 7단계 검증.
- [ ] 독립 milestone 검토, commit/push/Draft PR, 최종 로컬 검증 및 주 에이전트 리뷰.

## 검증 및 오류 기록

- 1·3단계 최초 제출은 유효한 행동 RED 누락으로 거절했다. 기준 동작 RED를 확인하고 GREEN을 복원했다. 3단계 RED는 원시 로그(7 failed / 31 passed)가 있으나 typecheck 선행은 작업자 보고이며 순서가 담긴 원시 기록은 없다.
- 1단계 복구 보고: typecheck 성공; RED 6 failed / 35 passed / 2 skipped; GREEN 47 passed / 2 skipped. 당시 저장 로그는 요약 기록이며 원시 로그로 주장하지 않는다.
- 2단계 원시 로그는 `.artifacts/n19/stage2-final5.log`; 배열 순서/오류 우선순위 테스트 보완. 최초 RED 6건 중 하나는 32종 fixture 오류여서 제품 행동 실패로 세지 않는다.
- Windows esbuild sandbox 접근 오류는 권한 승인 후 재실행으로 해결했다. 환경 실패는 RED에 포함하지 않는다.
- 측정 초안의 사전 색인 포함, gate 판정 누락, child iCCP 직접 inflate, 미정의 변수, GC 사전 확인 문제를 수정했다. 비계측 준비 후 첫 정식 측정에서 통과했으며 재실행하지 않았다.
- n19의 기존 준비 기록 8개는 모두 `prepareOnly: true`, strict 표본 0개다. ERROR 2, FAIL 1, PREPARE_ONLY 5를 보존하며 성능 판정 근거로 사용하지 않는다.

## 독립 검토

- Claude Code `claude-opus-5-5`, initial-plan, APPROVE, blocker 0 / major 0 / minor 3 / note 6.
- Claude Code `claude-opus-5-5`, 측정 스크립트 사전 검토, REQUEST CHANGES, blocker 0 / major 3 / minor 5; 해시 기준·결과 분리·비계측 기능 확인 해결.
- Claude Code `claude-opus-5-5`, milestone, REQUEST CHANGES, blocker 0 / major 1 / minor 8 / note 6; GC 사전 확인·회귀 테스트·strict 보존·문서/기록 수정.
- Claude Code `claude-opus-5-5`, scoped 재검토, APPROVE, blocker 0 / major 0 / minor 0 / nit 2; 출력 불일치 상태와 핸드오프 갱신 nit도 반영.
- 실제 CLI 응답의 모델 ID와 성공 실행을 확인했다. 비용·토큰 정보는 기록하지 않는다.
- 주 에이전트가 실제 diff/로그를 검토한다. 자체 검토는 독립 검토로 세지 않는다.

## 제약 및 남은 작업

- 성능 증거: `docs/research/evidence/n19/png-tolerant-2026-10-28T10-03-16.507Z.json`. index A′/A=1.012667, B/A=0.994317; crop A′/A=0.995959, B/A=0.995315. 각 9개 표본, baseline `4b67d72`, 현재 소스 hash 일치 확인.
- tolerant 중앙값(ms): RGBA 색인 200.5335, alpha 8.5545, core copy 0.0776; 최악 입력 색인 380.6203, walk/copy 52.4839. alpha/copy는 script-local 진단. iCCP child 최대 RSS 차이 −8192 bytes는 단회 진단이며 보안 증명이 아니다.
- PR 전 순서: typecheck PASS → 대상 10파일 380 passed/5 skipped/0 failed → 전체 1092 passed/5 skipped/0 failed(36파일) → build PASS → smoke:mcp PASS → validate:plugin PASS → diff-check PASS.
- skip 5건: image-artifacts FIFO(win32), core 깨진 in-root/outside 파일 링크 2건(EPERM), image-artifacts missing-target 파일 링크(EPERM), read-bounded-file outside symlink(EPERM). 기존 환경 skip이며 새 skip 없음.

- strict ID/기존 거부와 6.9 읽기 경계·오류 매핑·경로 비노출을 보존한다.
- 경계 테스트는 승인 범위의 image-crop.test.ts에 추가했고 기존 image-crop-boundaries.test.ts는 변경 없이 통과했다.
- 성능 A/A′ 무효 또는 strict B/A 실패 시 즉시 중단하고 보고한다. 기준·임계값·표본 변경 또는 선택적 재실행 금지.
- 새로 발견된 계획 외 변경은 적용하지 않는다. 현재 구현과 Draft PR까지 승인되어 있다.
- Draft PR 이후 Ready/merge 및 다음 Task는 사용자 승인 전 진행하지 않는다.
