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
- [x] RED 테스트 커밋 `b760f14` → Draft PR #119. 구현 전 vitest: `[RED-CR]` 20 실패, `[control]` 66 통과(라벨 불일치 0)
- [x] GREEN `1add2aa`(§2 diff 그대로·§6 delta·D4 영어 문장) → targeted 4파일: 963 통과, M1 1건은 bin 재빌드 대기. 기준 3 파이프 표 불일치 159/88(계획 수치와 같음)
- [x] 표준 7단계 @`9dc6383`(coordinator 실행권): 7단계 모두 exit 0, test 51파일 4440 통과·5 skip(기존 환경 skip)
- [x] prereg `982046c`(§8 전체) → self-check `4a015d6`: 결함 분류 9/9 일치, 합성 5행 왕복, 추적 파일 무변경·임시 폴더 삭제
- [x] 시간 gate run1 → **최종 INVALID(exit 5)**: O2/F1 C1/C2 A/A 3시도 모두 무효. 사전등록대로 중단, 메모리·정보용 미실행, 재실행 없음
- [x] 자원 gate 상태: 시간 **INVALID**(14 PASS + 1 INVALID + 3 NOTRUN), 메모리·정보용 **NOTRUN**. run1을 PASS로 바꾸지 않음
- [x] 읽기 전용 원인 조사(새 측정·하네스 수정 없음, 아래 기록)
- [ ] run2 여부: 구체안 검토 뒤 coordinator·사용자 결정
- [ ] milestone Argon → 완료 보고 `codex_review/codex_paste_2026-11-13_n34-cr-line-policy.md`

## 기록
- 완료 보고·Argon 기록은 메인 checkout의 비추적 `codex_review/`에 둔다(저장소 커밋 대상 아님).
- 초기 계획 Argon: `codex_review/argon/2026-11-13_n34-cr-line-policy-initplan-{bundle,argon}.md`. Minor 1(prereg·handoff 경로 명시) 채택, Nit 1(codex_paste 위치) 위 줄로 명시.
- `env git` R2 행: 처음 쓴 문장은 현행 CR에서도 통과해 RED가 아니었다. 분석 probe4 원문 문장으로 바꾼 뒤 RED. 사례 문장은 모두 분석 probe 원자에서 옮겼다.
- D4: design.md가 영어 문서라 승인 문장을 영어로 옮겼다(세 predicate 한정, 예외 문장 그대로).
- 시간 gate run1(`perf-run1-timing.json`, prereg `982046c`, HEAD `4a015d6`): 14행 PASS(O2/F4는 시도 2에서 A/A 유효), 15번째 O2/F1에서 중단. 남은 3행(O2/F2·F6·F7) 미측정.
- O2/F1 세 시도: digest 4사본 동일, B1/B2 A/A 유효. C1/C2 중앙값 비 1.063·1.078·1.062(Δ 127–156 ms, 허용 [0.95,1.05] 또는 0.1 ms) 무효. 같은 시도의 C1/B1 판정값은 비 1.014·1.012·1.026으로 한계 안이지만 A/A 무효라 판정 무효이며 PASS로 쓰지 않는다.
- 원인 조사(run1 원시 표본만 사용): 느린 것은 사본이 아니라 **순환 위치의 홀짝**이다. O2/F1 세 시도는 144표본 전체가 위·아래로 100% 교대했고, 측정 구간 중앙값은 순서 0,2,4…(홀수 번째) 약 2,140 ms, 짝수 번째 약 1,975 ms(+163–174 ms)였다. O2/F4 시도 1도 100% 교대(+156 ms)였고 무효, 시도 2는 교대가 72%로 무너져 유효했다.
- 확정 결함(계획 수준): §8.4 순환 `A B C D B D C A D A C B`(길이 12, 짝수)에서 C=C2가 3·7·11번째(모두 홀수)에만 온다. 순환을 반복해도 위상이 고정되어 C2는 측정 30표본이 모두 같은 위상이고, B1·B2·C1은 10/20이다. 그래서 주기 2 잡음이 있으면 C1/C2 A/A만 체계적으로 벌어진다(B1/B2는 균형). 하네스 `research/src/n34-cr-policy-perf.mjs:37`은 계획 원문(계획 176행)을 그대로 구현했다. 구현 이탈은 아니다.
- 판정 영향: C1과 B1은 위상 노출이 같아(각 10/20) 행별 C1/B1 판정 자체는 이 결함으로 기울지 않는다. 다만 사전등록상 A/A 무효면 판정이 무효이므로 run1은 INVALID로 남는다.
- 미확정 가설: 주기 2 교대가 사본·입력 파일과 무관하게 프로세스 전역에서 일어난다(O2/F4는 네 사본이 같은 파일). V8 GC 주기(10 MiB O2 호출마다 큰 할당)나 OS 파일·메모리 상태가 원인일 수 있으나, 새 probe가 금지라 확인할 수 없다. 사본 복제(`dist-aa` 바이트 복사, 별도 URL 모듈), 결과 수명(호출 뒤 폐기), 측정 구간(`await call` 1회, K=1)에는 C2만 다르게 다루는 코드가 없다.
- 최소 수정안(새 사전등록·사용자 결정 필요): 홀수 번째 순환을 역순(`B C A D A C D B D C B A`)으로 돌려 측정 10순환에서 각 사본을 홀짝 15/15로 맞추고, `--check-only`에 사본별 홀짝 균형 단언을 추가한다. 임계·입력·행 순서는 바꾸지 않는다.
