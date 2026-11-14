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
- [x] 읽기 전용 원인 조사(새 측정·하네스 수정 없음, 아래 기록, 2026-11-13 인과 문구 정정)
- [x] milestone Argon(`codex_review/argon/2026-11-13_n34-cr-line-policy-milestone-{bundle,argon}.md`, APPROVE 지적 0; 이때 본 단순 역순안은 뒤에 철회) → 완료 보고 `codex_review/codex_paste_2026-11-13_n34-cr-line-policy.md`
- [x] primary 최종 검토(2026-11-13): **CHANGES REQUIRED**(`codex_review/review_2026-11-13_pr119-n34-impl-review.md`). 필수 시간 gate INVALID·메모리 NOTRUN이라 완료 판정 불가. primary가 직접 검토했고 별도 Astra agent는 없다
- [x] run2 A안 사용자 승인(2026-11-13, `codex_review/review_2026-11-13_n34-run2-approved.md`). 승인은 검증 PASS가 아니다
- run2 1단계(측정 전 준비, 실행권 = 준비 gate·check-only·self-check만, 10 MiB 실측 없음):
  - [x] RED `b5703f0`: 순서 불변조건·음성/양성 control을 check-only에 추가(순서는 원 순환 그대로). check-only exit 1: 음성 control 2개는 기대대로, 양성(승인 순환) 단언에서 실패
  - [x] GREEN = **run2 prereg `de2f499`**: 원 순환과 `ADACDBDCBABC` 교대, schema v2, `n34-cr-line-policy-prereg-run2.md`(기존 prereg 보존). 하네스·protocol을 마지막으로 바꾼 커밋 = `de2f499`
  - [x] check-only PASS(시간 측정 호출 0; 사본별 warmup 3/3·측정 15/15, 전이 12종×10, self 0, 내부 C2>B1 9). 음성 control: 원 순환만 = 홀짝 위반 8건, 단순 역순 = transitions·self
  - [x] 표준 7단계 @`de2f499`: 모두 exit 0, test 51파일 4440 통과·5 skip, build 뒤 작업 트리 깨끗(bin 차이 없음)
  - [x] self-check `selfcheck-run2.json` @`de2f499`(gate 아님): 결함 분류 9/9, 합성 5행 144표본 왕복, 메모리 child 30/30, 추적 1118파일 무변경, 임시 폴더 삭제
  - [x] 불변: `45ee43e`→`de2f499`에서 src·bin·package*·입력/시간/메모리 worker·run1 prereg·results 변경 0. run1 raw sha256 `45e2dc3b…` 그대로
  - [x] Argon 구현 검토(`codex_review/argon/2026-11-13_n34-run2-prep-impl-{bundle,argon}.md`): APPROVE, 지적 0. 발췌 밖(생략된 하네스 줄, run1 raw 내용, 승인 문서 원문)은 확인 불가로 남음
  - [x] 2단계 실행권: primary preflight PASS WITH NOTES(`codex_review/review_2026-11-14_n34-run2-preflight.md`)
- [x] run2 시간 블록(`perf-run2-timing.json`, prereg `de2f499`, 측정 HEAD `57f945b`, 2026-11-14 16:37–17:47): **failed_gate(exit 4), 유효 FAIL**. 5 PASS(O1/F3·F4·F5·F6L·F7L) + O1/F1 FAIL + 12 NOTRUN
  - O1/F1(G-C, CAND F1 vs REF F4), K=1, 시도 1: A/A 둘 다 유효(B2/B1 1.004, C2/C1 1.002), digest 4사본 동일. C1 중앙값 4,241.95 ms > 한계 4,095.72 ms(B1 3,723.38 ×1.10), 비 1.139. p95는 한계 안(4,328 ≤ 4,601)
  - 사전등록대로 즉시 중단: 재시도·임계 완화·강등 없음, 메모리·정보용 **NOTRUN**, run3 없음. 추적 1119파일 변경 0, tempCleanup true
  - 관찰(원인 미확정): 절대 시간이 run1의 약 2.2배(O1/F1 B1 1,641→3,723 ms). 같은 보정 child(K=1)의 B1 5묶음이 1,739→2,150→3,683→3,803→3,770 ms로 느려졌고, 이어진 C1 5묶음은 3,805–3,968 ms였다. run1 O1/F1은 비 1.041로 PASS였다. 환경 시작·끝 동일 단언은 통과
  - Argon(`codex_review/argon/2026-11-14_n34-run2-timing-{bundle,argon}.md`): APPROVE. 유효 FAIL 판정·블록 중단 일치. Nit(보정 순서 문구) 채택. Minor(발췌 밖 run1 수치·NOTRUN·행 수 확인 불가)는 구현자가 원자료로 직접 대조함
- [x] run2 원인 분석(읽기 전용, `codex_review/codex_paste_2026-11-14_n34-run2-failure-analysis.md`).
  - primary 지적 9개를 2026-11-14에 정정했다. 원인은 미확정이다.
- [x] primary run2 최종 검토(2026-11-14, `codex_review/review_2026-11-14_pr119-n34-run2-final.md`): **CHANGES REQUIRED**.
  - primary 재계산: 6시도, 측정 720 / 전체 864표본에서 median·p95·A/A·판정 불일치 0.
  - run2: 5 PASS + 1 유효 FAIL(O1/F1) + 12 NOTRUN. 메모리·정보용은 **NOTRUN**.
  - run1 INVALID와 run2 유효 FAIL은 원자료·판정 그대로 보존한다.
- [ ] 사용자 보완안 결정 대기(`codex_review/review_2026-11-14_n34-remediation-proposal.md`).
  - A: 배열 없는 순회(primary 권장). B: 정규식만(Claude 원안). C: 보류.
  - 어느 안도 승인되지 않았으므로 구현하지 않는다.
  - 새 prereg + `run3`은 사용자 명시 승인 뒤에만 진행한다. 실패 시 다음 안·run4 자동 없음.
  - Ready·merge 없음.
- 측정 기준과 문서 head 구분: run2 측정 HEAD `57f945b`, prereg `de2f499`, raw 커밋 `78e52af`. 그 뒤 커밋은 문서만 바꿨다(제품·하네스·raw 변경 0).

## 기록
- 완료 보고·Argon 기록은 메인 checkout의 비추적 `codex_review/`에 둔다(저장소 커밋 대상 아님).
- 초기 계획 Argon: `codex_review/argon/2026-11-13_n34-cr-line-policy-initplan-{bundle,argon}.md`. Minor 1(prereg·handoff 경로 명시) 채택, Nit 1(codex_paste 위치) 위 줄로 명시.
- `env git` R2 행: 처음 쓴 문장은 현행 CR에서도 통과해 RED가 아니었다. 분석 probe4 원문 문장으로 바꾼 뒤 RED. 사례 문장은 모두 분석 probe 원자에서 옮겼다.
- D4: design.md가 영어 문서라 승인 문장을 영어로 옮겼다(세 predicate 한정, 예외 문장 그대로).
- 시간 gate run1(`perf-run1-timing.json`, prereg `982046c`, HEAD `4a015d6`): 14행 PASS(O2/F4는 시도 2에서 A/A 유효), 15번째 O2/F1에서 중단. 남은 3행(O2/F2·F6·F7) 미측정.
- O2/F1 세 시도: digest 4사본 동일, B1/B2 A/A 유효. C1/C2 중앙값 비 1.063·1.078·1.062(Δ 127–156 ms, 허용 [0.95,1.05] 또는 0.1 ms) 무효. 같은 시도의 C1/B1 판정값은 비 1.014·1.012·1.026으로 한계 안이지만 A/A 무효라 판정 무효이며 PASS로 쓰지 않는다.
- 원인 조사(run1 원시 표본만 사용, 2026-11-13 정정: 인과는 확정하지 않는다). "위상" = 시도 안 표본 순서의 홀짝(1·3·5…번째 = order 0·2·4…, 아래 "1위상"). 원 순환에서는 이것이 순환 내 위치·직전 사본과도 겹친다(교락).
- 확정(스케줄 사실): §8.4 순환 `A B C D B D C A D A C B`(길이 12)에서 C=C2는 3·7·11번째에만 온다. 측정 30표본이 모두 1위상이고, B1·B2·C1은 1위상 10 / 2위상 20이다. 하네스 `research/src/n34-cr-policy-perf.mjs:37`은 계획 176행 원문 그대로이므로 구현 이탈은 아니다.
- 데이터로 확인되는 것: O2/F1 세 시도와 O2/F4 시도 1(무효)은 144표본이 100% 교대했다(O2/F4 시도 2는 72%로 유효). 두 위상을 모두 가진 B1·B2·C1은 각각 1위상 중앙값이 2위상보다 약 140–160 ms 높았다(O2/F1 B1 2109–2126 vs 1951–1966). C2는 2위상 표본이 0개라 사본 고유 효과를 분리할 수 없다. C2의 1위상 중앙값 2139–2161은 다른 사본 1위상(2109–2159)과 같은 범위다.
- 강한 가설(미확정): 고정 위상 노출 불균형과 위상 연관 교대가 겹쳐 C1/C2 A/A 무효를 설명한다. 사본 효과와의 교락, 그리고 교대의 원인(GC 주기, OS 상태 등)은 새 probe 금지로 확인할 수 없다. 코드(`dist-aa` 바이트 복사·별도 URL 모듈, 호출 뒤 결과 폐기, `await call` K=1 측정)에는 C2만 다르게 다루는 경로가 없다.
- C1/B1: 위상 노출 수가 같다(각 10/20)는 사실만 말할 수 있다. 판정값의 무편향은 보장하지 않는다(사본·직전 사본 상호작용 미분리). 사전등록상 A/A 무효면 판정이 무효이므로 run1은 INVALID로 남는다.
- 수정안 비교(읽기 전용 열거, 채택은 primary 구체안·교차 검토·사용자 결정): 단순 역순 교대(`B C A D A C D B D C B A`)는 홀짝 15/15를 맞추지만 측정 구간 전이가 A>A·B>B 각 5회, A>B·B>A 각 5회가 되어 전이 균형이 깨진다. 그래서 이전 기록의 이 최소 수정안은 철회한다.
- primary 대안(원 순환과 `A D A C D B D C B A B C`(역순을 2칸 회전)를 번갈아, warmup 24 + 측정 120): 측정 구간에서 사본당 30, 홀짝 각 15/15, 서로 다른 유향 전이 12종 각 10회(첫 측정 표본의 직전 warmup 표본 포함), self 0이다. 한계: 주기 2만 균형한다. mod 4 노출은 C가 [0,0,15,15], 나머지는 [10,10,5,5]이고, lag-2 쌍도 5–15로 불균형이다. 15/15에서는 nearest-rank median(`sorted[14]`)이 두 군집 경계에 놓여, 교대가 깨지면 중앙값이 군집 사이를 뛸 수 있다. 가설상 교대가 남아 있으면 A/A가 여전히 무효가 될 수 있다.
