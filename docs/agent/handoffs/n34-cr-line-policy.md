# N-34 CR 줄 경계 정책 구현 — Task handoff

## 상태와 승인
- Tier E. 작업자: Claude Code(`claude-opus-5-5`, 개발자). PM·최종 판정: Codex(Astra).
- 승인: 사용자 2026-11-13 async — 계획 PR #115@`4a5b390` D1(C2, D1-a 엄격화·D1-b 완화), D2, D3, D4 권장안 승인(`codex_review/review_2026-11-13_followup-implementation-approved.md`).
- 미승인: Ready, merge, 설치, 릴리스, 외부 송부, 승인 기준 사후 완화.
- Base: origin/main `5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3`(= 계획 base, 차이 없음). Branch `claude/n34-cr-line-policy`, Orca 독립 worktree.
- 계획 원문: PR #115 `docs/superpowers/plans/2026-11-13-n34-cr-line-policy.md`(main 미병합, 고정 커밋 `4a5b390`에서 읽음).

## 범위
- `src/core/policy.ts`: `POLICY_LINE_BREAK = /\r\n|\r|\n/u`(비공개) + 세 split 교체만(계획 §2).
- `tests/policy-n32.test.ts`: 소스 전문 비교를 "N-32 suffix + 승인된 N-34 delta"로 확장(계획 §6). 동결본·oracle·characterization 무변경.
- `tests/policy-n34-line-terminators.test.ts` 신규: R1–R5·M1, control G1·G3–G6, 수용 기준 2·3(계획 §7).
- `docs/design.md` Safety Invariants D4 한 문장. `bin/`은 build 생성.
- research: 이 Task runner·worker(`research/src/n34-cr-policy-perf*.mjs`)·결과(`research/results/n34-cr-policy/`)만. prereg·handoff는 `docs/agent/handoffs/n34-cr-line-policy*.md`(계획 §8·§9).
- 바꾸지 않음: `src/core/artifacts.ts`, `tests/helpers/policy-baseline*.ts`, `tests/fixtures/policy/characterization.json`, `package*.json`.

## 진행
- [x] 초기 계획 Argon
- [ ] RED 테스트 커밋 → Draft PR
- [ ] GREEN(C2·§6 delta·D4) → targeted
- [ ] 표준 7단계(coordinator 실행권 필요)
- [ ] prereg 커밋(§8 전체) → harness self-check
- [ ] 시간 gate → 메모리 gate(coordinator 실행권 필요)
- [ ] milestone Argon → 완료 보고 `codex_review/codex_paste_2026-11-13_n34-cr-line-policy.md`

## 기록
- 완료 보고·Argon 기록은 메인 checkout의 비추적 `codex_review/`에 둔다(저장소 커밋 대상 아님).
- 초기 계획 Argon: `codex_review/argon/2026-11-13_n34-cr-line-policy-initplan-{bundle,argon}.md`. Minor 1(prereg·handoff 경로 명시) 채택, Nit 1(codex_paste 위치) 위 줄로 명시.
