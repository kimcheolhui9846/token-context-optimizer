# 이미지 프로토콜 사용자 결정 반영 Implementation Plan — Task 31

> **For agentic workers:** REQUIRED SUB-SKILL: 승인 후 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`를 사용한다. 사용자 하네스의 정확 Claude Opus 5.5 우선 구현/독립 검토 규칙이 스킬 기본 모델보다 우선한다. 아래 단계는 하나의 사용자 검토 단위 Task 31 안의 구현 순서다.

**Goal:** 사용자 D1–D4 결정을 메모와 평가 프로토콜에 일치시키되, 잠정 calibration 값과 미검증 구현 조건을 보존한다.

**Architecture:** 기존 메모의 선택지·합성 표는 유지하고 선택 조합의 결정 기록과 결과를 덧붙인다. 프로토콜은 승인된 입력 recipe와 arm 변환을 명시하며 기존 평가 분모·blinding·실패 규칙을 바꾸지 않는다. 논문 정합화는 새 핸드오프의 후속 목록으로 남긴다.

**Tech Stack:** Markdown, Git, 의존성 없는 Node 내장 모듈 기반 문서 검사. 런타임 코드나 패키지 변경 없음.

## 0. 현재 단계와 제약

- **승인된 구현 단계(2026-10-12).** 사용자가 계획 전체와 §7의 다섯 선택을 승인했다. 이 문서는 승인 전 PLAN ONLY 상태로 작성·검토됐고(당시 규칙: 이 계획과 [Task 31 핸드오프](../../agent/handoffs/task-31.md)만 생성, 초기 독립 검토와 사용자 계획 검토 후 중지), 그 검토 이력은 핸드오프 §7에 보존한다. 승인 후 구현은 아래 네 문서에 한정한다. commit·push·Draft PR은 controller가 검증 뒤 수행한다.
- Base: `65347d4aad46f92c166d8720bb705303a337da78` (`origin/main`, Task 30 병합). 브랜치: `codex/task-31-protocol-decisions`. 아래 모든 기존 문서 행 번호는 이 base의 1-based 번호다.
- 작업 공간: `.artifacts/worktrees/task-31-protocol-decisions`. 최초 Git status clean 확인. 임의 stash/reset/rebase/force-push 금지.
- 이 계획의 정확한 경로는 `docs/superpowers/plans/2026-10-12-image-protocol-decisions.md`다. 문서 allowlist와 아래 `.artifacts/task-31-plan-review`는 모두 Task 31 worktree 루트 기준이며 주 저장소 루트의 같은 이름 디렉터리와 구분한다.
- 구현 후 허용 파일은 정확히 네 개: 이 계획, 새 핸드오프, `docs/research/image-protocol-decision-memo.md`, `docs/research/image-first-evaluation-protocol.md`.
- 공유/루트 HANDOFF, WBS, Task 29/30 계획·핸드오프, 논문, 코드·테스트·의존성·설정·데이터는 변경하지 않는다. ignored 검증/리뷰 증거는 controller가 관리하고 커밋하지 않는다.
- 실험, encoder/probe, 이미지 생성, hosted 평가/count-tokens, 외부 조사, npm/dependency 설치 금지. 이 Task에서 calibration이나 corpus를 만들지 않는다.
- Windows 명령은 `tty:true/login:false`. background가 필요해도 Hidden. 비밀/개인 정보 없이 최소 발췌만 리뷰에 전달한다.
- Task 30 사용자 제공 리뷰와 Task 31 하네스 초기/마일스톤 리뷰를 구분한다. 미수행 검사를 PASS로 기록하지 않는다.

## 1. 파일별 책임과 변경 위치

| 파일 | base 위치 / 역할 | 계획된 변경 |
| --- | --- | --- |
| 새 `docs/agent/handoffs/task-31.md` | 첫 산출물 | 결정·진행·검사·리뷰·승인 상태, 논문 후속의 정확한 base 행 기록 |
| 이 계획 | 신규 | 수용 기준, 구현 단계, 선택 조합 도출, 미결 선택과 검증 절차 |
| 프로토콜 | 도입 L4–5 ‘논문과 함께 갱신’ | Task 31은 프로토콜 결정만 먼저 반영하고 논문은 별도 승인 후 정합화한다는 임시 상태 주석을 바로 뒤에 추가. 동시 갱신 완료를 주장하지 않음 |
| 메모 | 허용 hunk 세 곳만: L3 상태문, L596–612의 17 사용자 결정 셀, L612 뒤 append | L3에서 전체 역사적 본문과 최신 선택을 구분. 17 셀에는 선택값, append에는 결정일·추가 사용자 결정·도출·잔여 상태. 나머지는 byte-identical 보존 |
| 프로토콜 | §2 L26–51 | clean 원천/형식/치수 정책, 4개 recipe, calibration 잠정값·freeze, ‘preset’ 모호성 제거 |
| 프로토콜 | §3 L55–89, §4 L93–96 | B/C/D/E 배정, 고정 출력 transform과 영역 선택 구분, PNG canonical 이름 처리(사용자 선택 후), primary 대비 의미. L89 paired-family 단위는 보존 |
| 프로토콜 | §7 L145–175 | fallback rate를 primary와 함께 해석, DO/CB identity와 조건 간 치수 구분. rejection 분모·failure 규칙은 그대로 보존 |

메모의 §2 ‘원문 미명시’는 Task 30 base `67478ff`에 대한 분석이다. 새 프로토콜에 이미 명시된 내용을 현재 부재로 오독하지 않도록 상단에서 고정 base 분석임을 알리고 §11 뒤 최신 결정으로 연결한다. 기존 모든 인용을 새 행 번호로 일괄 재작성하지 않는다.

L3 교체 문구의 의미를 고정한다: ‘§0–§11의 선택지·분석·미정/미승인 표현은 Task 30 당시 고정-base 분석이며, §11 사용자 결정 칸과 표 뒤 2026-10-12 기록이 최신 사용자 선택이다.’ 특히 L17/G3/L589의 A-cap 미승인, L584의 X1/X2 잔여는 역사적 설명으로 남기고 append에서 현재 해소 상태로 연결한다. §0/G3/§10/§11 앞 안내를 따로 고치지 않는다.

L3의 기존 경계도 보존한다: F-12·파일럿 모델·첫 구현 연산 순서를 정하지 않으며, 개수는 명시 집합에서 손으로 도출한 문서상 산술이지 실측이 아니다. 상단의 시점 설명을 바꾸면서 이 한계를 삭제하지 않는다.

**프로토콜 hunk 경계(base 행 기준):** 기존 텍스트 교체는 L42–45(recipe), L48–49(stress 준비와 arm identity 구별), L55–59(활성 transform/미검증/후보명), L69–72(B/C/D/E), L80–82(동일 출력 변환), L93–96(영역 후보 표현)에 한정한다. 새 문단은 L5 뒤(논문 상태), L41 뒤(clean 정책), L51 뒤(잠정값·검증 기준/사용자 승인·held-out 전 freeze), L89 뒤(선택 조합의 단계별 변환), L149 뒤(N-09/N-10와 fallback 병기)에만 삽입한다. 그 밖의 base 원문은 byte-identical로 보존한다. 특히 L1–5 자체, L13–19, L26–41, L47, L50–51, L61–68, L74–79, L83–89, L98–119, L145–149, L151–175 및 §8·§9는 수정하지 않는다. L48–49 교체는 L50의 기존 ‘transform…’ 문장 연결을 유지한다. 검사는 허용 교체를 base로 복원하고 지정 삽입을 제거한 뒤 전체 원문과 비교한다.

**교체 hunk 안에서 유지할 문장(P1, 2026-10-12 사용자 리뷰 반영).** 교체 구간 안이라도 아래 base 문장은 가능한 한 원문 그대로 유지한다. 구현 검사는 줄바꿈을 정규화한 뒤 이 문장들이 구현된 프로토콜에 있는지 확인해야 한다.

- L57–59: 「held-out에 들어간 뒤에는 preset을 바꾸지 않는다. small-text guard를 calibration에서 조정할 수 있지만 임의의 인증 threshold를 만들거나 held-out 질문의 답·증거를 보고 조정하지 않는다.」
- L80–82: 「selector가 만든 crop 수나 영역 차이 때문에 transform budget이 달라지면 selector만의 효과로 해석하지 않고 출력 size와 effective transform 차이를 함께 보고한다.」 L82는 「arm간에 모델이나 질문을 바꾸어」로 끝나 수정하지 않는 L83에 이어져야 한다.
- L93–96: 「selection은 question+pixels와 OCR 또는 영역 추정치만 읽을 수 있다. 답, gold evidence, grader 판단, held-out 라벨은 읽지 못한다.」와 「정확한 점수와 tie break는 calibration manifest와 함께 freeze한다.」

## 2. 승인된 사용자 결정 원장 — 2026-10-12

이 표는 구현할 값의 정확한 원장이다. 계획 단계에서는 기존 메모를 변경하지 않았고, 2026-10-12 계획 승인 뒤 구현에서 반영한다. 구현 시 아래 문자열을 메모 §11의 `사용자 결정` 칸에 사용한다. 기존 선택지와 승인 전 권고는 결정의 출처를 대체하지 않는다.

| 필드 | 사용자 결정 칸에 넣을 값 |
| --- | --- |
| D1 | D1-a — 제한 RGB PNG, channels 3 |
| D2.1 | 50 — 사용자 선택 잠정값, calibration 후 freeze |
| D2.2 | P-in — jpeg-ycbcr8-baseline-444-v1 |
| D2.3 | A-cap 긴 변 상한 1024 — 사용자 선택 잠정값, calibration 후 freeze |
| D2.4 | A-cap 긴 변 상한 1024 — 사용자 선택 잠정값, calibration 후 freeze |
| D2.5 | 50 — 사용자 선택 잠정값, calibration 후 freeze |
| D2.6 | P-in — jpeg-ycbcr8-baseline-444-v1 |
| D2.7 | D2-b — 조건 공통·후보값과 다름 |
| D3.1 | B-rc — 1536 no-upscale 후 q75 JPEG |
| D3.2 | S-same — 영역만 선택, B와 동일한 출력 변환 |
| D3.3 | E-same — oracle crop 후 B와 동일한 출력 변환 |
| D3.4a | PC-out — PNG 출력 정규화 역할 |
| D3.4b | K-n — 합성 원천 clean 파일 그대로 사용 |
| D4.1 | D4-a — 제한 PNG |
| D4.2 | 입력 channels 보존 — RGB 3 유지 |
| D4.3 | 해당 없음 — downscale-only 출력이 PNG |
| D4.4 | 해당 없음 — downscale-only 출력이 PNG |

- A-cap은 두 stress 조건에 **같은 긴 변 상한 표현**으로 승인됐다. 다른 표현을 섞는 R1 경우는 이 결정으로 포괄하지 않는다. 배율/고정치수 또는 혼합 표현으로 바꾸려면 Td/Tc 비교와 identity 도출을 다시 검토한다.
- q50/1024는 저장소 근거로 최적값을 찾은 결과가 아니다. 사용자가 선택한 잠정값이다. 12 calibration family에서 확인하고 변경 시 이전 값·새 값·이유를 기록한다. held-out 시작 전에 최종 stress recipe를 한 번 freeze하며 held-out 결과를 이용한 튜닝은 금지다.
- calibration에서 무엇을 확인하면 검증된 것으로 볼지 기준은 아직 정하지 않았다. 기준은 사용자가 실행 전에 결정해야 하며 어떤 stress 값 변경도 사용자 승인 후에만 가능하다. 변경 시 D2-b 일관성, T<1536, clean/stress 치수 부등식, accounting 상한, 최종 stress 값에서의 guard 조정을 다시 확인한다. 이 문서 수정이나 calibration 허용을 자동 조정 권한으로 읽지 않는다.
- arm의 1536/q75는 이번 선택에서 유지한다. stress 잠정값 조정 절차를 arm preset 변경 허가로 확대하지 않는다. calibration 실행이나 성능 결과를 이번 Task에서 기록하지 않는다.
- **고정 순서(P2, 2026-10-12 사용자 결정).** stress recipe를 먼저 고정하고 그 recipe에서 guard를 조정한다. guard 조정 뒤 stress 값이 바뀌면 최종 값에서 guard를 다시 확인한 뒤 held-out 전에 stress recipe와 guard를 함께 freeze한다. stress 변경 시 재확인 목록은 D2-b 일관성, T<1536, 치수 부등식, accounting 상한, guard 조정이다. 프로토콜에는 base L51 뒤 삽입 문단으로 반영한다. 실제 calibration은 실행하지 않는다.

## 3. clean 치수 정책과 산술 경계

- 직접 생성한 손실 이력 없는 RGB PNG 원천 파일을 clean으로 쓴다. K-n이므로 별도 PNG canonical 재인코딩으로 clean을 만들지 않는다. 생성 provenance와 실제 파일 검증은 향후 생성 Task에서 수행한다.
- 긴 변 `L=max(width,height)`는 `1536 < L <= 2528`, 사용자 확정 기준값은 2048이다. 정확한 width×height 목록, 종횡비, family별 배정은 **미선택**이며 2026-10-12 사용자 선택(§7)에 따라 이후 생성 Task에서 사용자 승인 뒤 확정한다.
- ‘기준값 2048’은 사용자 표현 그대로 보존한다. 모든 family의 필수 긴 변인지, 기본값인지, 일부 배정 기준인지 운영 의미를 새로 정하지 않는다. 정확 치수 목록을 정할 생성 Task에서 구체화하며 2048 자체의 재승인을 요구하지 않는다.
- clean 자체의 `png-rgb8-static-v1` 제한(ancillary chunk 금지 등)과 encoded 10MiB 수용은 실제 파일이 없어 [검증 필요] — X7/X10이다. RGB PNG와 치수 범위만으로 ingest 통과를 보증하지 않으며 아래 JPEG accounting 여유는 clean PNG 수락과 무관하다.
- 하한은 full-frame clean/JO에 B의 1536 resize가 실제 치수 축소를 만들고, 1024 DO가 clean과 같은 치수가 되는 것을 막는다. C/D/E가 crop한 뒤에는 긴 변이 이미 1536 이하일 수 있으므로 clean/JO에서도 resize identity가 가능하다. 모든 arm의 resize가 비identity라고 쓰지 않는다.
- `L>1536>1024`에서 DO/CB는 준비 단계에서 실제 치수 축소된다. DO와 clean, CB와 JO의 치수 구분을 보장하는 정책이지 시각적 효과/QA 난이도/손실 크기/통계 검정력을 보장하지 않는다. stress 값을 향후 바꾸면 이 부등식도 재검증한다.
- [입력 계약](../../image-artifacts.md) L65–70 및 [JPEG runtime](../../research/jpeg-runtime-validation.md) L18–28의 accounting 식은 `960*ceil(w/8)*ceil(h/8) + 6*w*h + Ctable`, 상한 `134217728`이다. 과거 runtime L68의 2528² accepted fixture는 `Ctable=580`인 한 사례이며 보편 상수가 아니다.
- controller의 현재 validator 읽기: `src/core/jpeg-validation.ts` L108–120의 DQT ID 0–3/중복 금지와 L122–142의 DHT kind 0/1·ID 0/1/중복 금지/최대 symbol 256, 실제 `tables.q.size`와 `values.length`를 쓰는 `estimateMemory` L250–253에서 보수적으로 `Ctable <= 4*256 + 4*(16+256) = 2112`를 얻는다. 코드 변경 없이 근거를 직접 대조한다. 실제 AC/DC 제약은 더 엄격할 수 있으며 2112는 보수적 상한이다.
- 양의 정수 치수 및 현재 수용 구조를 전제로 각 항이 단조 증가하므로 `w,h<=2528`일 때 차원 항은 `134206464` 이하, 보수적 총 accounting은 `134208576` 이하(여유 9152)다. 이는 JPEG accounting 항목만의 산술 한계이며 encoded 10MiB, profile/entropy 적합성, 실제 RSS, encoder 결정성 또는 임의 출력 수락 보증이 아니다. 실제 출력은 [검증 필요], X9다.
- controller 순수 산술 예: 2048²는 차원 항 `88080384`, 보수적 표 포함 `88082496`. 이것은 계산 예시이며 2048×2048 corpus 선택이 아니다. encoder/probe를 실행하지 않는다.

## 4. 선택 조합에서만 읽을 결과

조합은 `F1, K-n, <b=rc,s=same,e=same,p=out>`, overlay `T=NN,Q=NN`이고 두 T는 1024 <1536이다. §6 전체 480조합이나 distinct 묶음을 재계산하지 않는다. Task 30 AC4 전수 열거 미수행은 계속 유지한다.

### 4.1 조건 준비 — 메모 §6.4 L340–374에서 추적

- CL: 원천 RGB PNG 그대로. JO: 같은 clean 치수에서 q50 P-in JPEG. DO: cap1024 no-upscale 후 RGB PNG. CB: cap1024 후 q50 P-in JPEG.
- CB를 clean에서 직접 파생하고 DO artifact를 중간 입력으로 재사용하지 않는 P1은 기존 메모 L310의 집계 가정이다. 이번 사용자 선택으로 새 승인됐다고 쓰지 않는다. 실제 파생 경로·구현 증거는 X7에 남긴다.
- F1의 variant format은 CL/DO RGB PNG, JO/CB JPEG다. K-n 원천 RGB PNG이므로 조건 준비 JPEG decode O4는 불필요, 일반 resize O5는 DO/CB, 일반 JPEG encode O7은 JO/CB, 일반 PNG encode O9는 DO에 필요하다.
- 준비 단계 정확 1536 O6와 정확 q75 O8은 각각 1024와 q50이므로 해당하지 않는다. O10의 DO 준비는 X5(PNG canonical 관계) 미정으로 남는다. PC-out이 arm에서 비활성이라는 사실로 DO 준비 O10까지 지우지 않는다.
- crop O1/O2/O3는 조건 준비 연산으로 추가하지 않는다. 조건 준비를 arm 내부에 중복 집계하지 않는다.

### 4.2 arm 변환 — §6.5 L380–445에서 추적

- A와 D fallback은 배정 variant를 그대로 전달한다. 원천 clean으로 되돌리지 않는다.
- B는 crop 없이 1536 no-upscale→q75 P-in JPEG. C와 D 변환 경로는 selector 영역 처리 후 동일한 1536→q75. E는 oracle crop 후 동일한 변환이다. S-same에서 selector는 출력 quality/preset을 고르지 않는다.
- q75 재인코딩은 JO/CB q50에 다시 적용되어도 identity가 아니다. byte 동일성·손실 크기·codec 호출 생략을 미리 주장하지 않는다. full-frame crop의 no-op 여부는 X4, selector의 실제 영역은 X3이다.
- O1은 RGB PNG인 CL/DO에서 C/D 영역 선택에 조건부, E crop 규칙에 필요. JO/CB의 crop decode는 O3에 귀속. B의 JPEG decode는 crop 없으므로 O4이며 JO/CB에서 필요하다. O3/O4를 같은 경로에 이중 집계하지 않는다.
- B는 X1의 crop 없음 결정으로 현재 조합에서 O1·O2·O3가 불필요다. 이는 선택 조합 결과이며 일반 표를 수정하지 않는다.
- C/D의 O4는 crop 없이 JPEG 변환하는 경로에 조건부이며 crop 경로는 O3에 귀속한다. E의 decode는 crop 경로 O3로 세므로 O4는 불필요다. no-op의 실제 호출 정책과 이 분류를 구분한다.
- arm 단위 합성 규약상 B의 O4는 PNG/JPEG 조건을 병합하여 조건부다. X1 미정은 선택 조합에서 해소됐다고 적되 일반 선택지 표의 B 미정 셀을 전역 수정하지 않는다.
- 기존 `<rc,same,same>` O5/O6 및 O7/O8 행(L403–404, L415–416): B/C/E 필수 능력, D는 변환/fallback 병합으로 조건부, A 불필요. resize 능력 요구와 실제 치수 변화는 별개다.
- `<rc,same,same,out>` O9/O10 arm 행(L424, L431)은 모두 불필요다. 모든 변환 arm 출력이 JPEG이므로 PNG canonical arm 출력 역할은 비활성이다. DO 준비의 PNG 출력과는 다르다.

### 4.3 effective transform / N-09·N-10

- DO/CB variant는 긴 변 <=1024이므로 B의 1536 resize 단계는 identity, 남는 실제 출력 변환은 q75 재인코딩이다. C/D는 선택한 영역 crop(선택 시, full-frame/no-op 예외 미정)과 q75 재인코딩, E도 oracle 영역에 따른 crop과 q75다. crop 후 resize 역시 identity다.
- CL/JO는 B의 1536 단계가 비identity다. C/D/E는 crop 결과 치수에 따라 resize identity 여부가 달라진다. 전체 pixel/byte identity로 확대하지 않는다.
- N-10: guard가 수락 후보를 바꾸지 않는 읽기에서 D−C 설계상 입력 선택 차이는 D fallback slot에서만 가능하다. fallback은 전체 조건에 대한 필요조건이지 충분조건이 아니다. 선택 조합의 C 출력은 q75 JPEG이므로 CL/DO의 PNG variant와 bytes가 같을 수 없다. JO/CB는 양쪽이 JPEG이므로 byte 일치 가능성을 배제하지 못하지만 미측정이다. 같은 format이나 q값이 일치를 보장하지 않는다. 수락 경로의 동일 artifact 사용 또는 변환 결정성은 미검증(X9)이며 새 구현 정책으로 선택하지 않는다.
- primary 결과와 fallback rate를 함께 보고하고, 해당 slot 빈도는 실행 전 미상이라고 명시한다. 현 §4 L102는 D assigned denominator, §7 L147은 fallback rate만 말한다. §7 L167–172의 n/N·n/S는 provider rejection 비율이므로 fallback 분모로 재사용하지 않는다. 구체 비율 정의는 §7의 2026-10-12 사용자 선택(최소 정의)으로 확정했고 프로토콜 base L149 뒤에 반영한다.

## 5. 잔여 결정 상태 — 선택 조합에 한정

| 항목 | 상태 / 남는 부분 |
| --- | --- |
| X1 B crop | 2026-10-12 추가 사용자 결정으로 해소: B는 crop 없음. D3에서 자동 도출한 것이 아니며 다른 조합의 미정 표는 유지 |
| X2 출력 format/quality | 2026-10-12 추가 사용자 결정으로 현재 선택의 최종 arm 출력은 q75 P-in JPEG(A/fallback 제외). 중간 crop 저장 방식·encoder 적합성까지 결정하지 않음 |
| X3 후보/selector | 출력 preset 선택은 S-same으로 한정. 영역 선택, 점수, tie break, 실제 빈도는 잔여 |
| X4 no-op | 잔여: full-frame crop/identity resize의 호출·bytes 유지 정책. q75 재인코딩을 임의 생략하지 않음 |
| X5 PNG canonical 관계 | arm 출력에서 O10 비활성. DO PNG 준비와 canonical 옵션의 동일성은 잔여 |
| X6 alpha | RGB 한정 현 선택에서 적용 없음. 일반 RGBA 지원을 구현/삭제하지 않음 |
| X7 원천/파생 provenance | 원천 생성 정책과 K-n·recipe는 선택됨. 실제 source 파일/도구/hash/생성 이력 증거는 향후 확인이므로 부분 해소 |
| X8 resize 규칙 | 필터·반올림·구체 구현 미정 유지 |
| X9 encoder | 적합성·결정성·자원·writer·manifest gate 잔여. accounting 산술이 이를 해소하지 않음 |
| X10 치수 | 허용 범위와 기준값 2048은 선택됨. 실제 width×height 목록/분포와 검증은 아직 없으므로 부분 해소 |

첫 구현 연산, F-12, 파일럿 모델은 여기서 정하지 않는다. 메모의 ‘X1/X2가 남는다’ 일반 결론은 Task 30 일반 틀로 표시하고 선택 조합의 해소 결과와 연결한다. X1–X10 ID는 삭제하지 않는다.

## 6. 승인 후 구현 순서와 수용 기준

### 단계 1 — 상태·결정 원장 반영

**Files:** 메모 L3, L596–612의 마지막 셀만, L612 뒤 append; 이 계획, 핸드오프.

- [x] 사용자 계획 승인 및 §7 선택을 기록한다. 구현자는 정확 Claude Opus 5.5 먼저, 불가 시만 정확 Codex 6 Terra. 실제 호출 불가 시 구현 BLOCKED.
- [x] 변경 전 네 파일 상태와 보호 대상 hash를 확보한다. 공유 문서/사용자 리뷰 원문을 변경하지 않는다.
- [x] 메모 상단에서 Task 30 고정-base 비교 틀과 Task 31 선택 결과를 분리하고, §11 17개 값을 §2 원장과 정확히 일치시킨다.
- [x] 표 아래 결정일 2026-10-12, 승인 주체 사용자, q50/1024 잠정값, 동일 A-cap 승인 및 혼합 표현 한계를 추가한다. ‘마지막 내용은 공란 표’ 요구가 이번 명시 지시로 대체됐음을 기록한다.
- [x] append에서 X1/X2를 2026-10-12의 추가 사용자 결정으로 별도 기록하고, PC-out arm 비활성 등은 사용자 선택과 구분된 도출로 적는다. D4.3/D4.4 N/A는 조건부 필드에 대한 사용자 결정과 짧은 사유이며 새로운 quality/profile 값이 아니다.
- [x] 선택 조합과 §4/§5 결과만 추가한다. 일반 합성 표와 과거 480/16 설명을 최신 확정 실험 수처럼 바꾸지 않는다.

**Acceptance A:** 17행의 결정값 일치(15 선택+2 N/A), 날짜·사용자·잠정값/기준값 출처 구분, X1/X2의 날짜 있는 추가 사용자 결정, no new D/X ID. 허용 세 hunk 밖 메모 bytes 불변이며 역사적 미승인/미정 표현의 적용 시점을 L3와 append에서 구분.

### 단계 2 — 프로토콜 입력과 변환 명확화

**Files:** 프로토콜 §2/§3/§4의 §1 hunk 경계만. §1 L13–19 freeze 목록은 변경하지 않는다.

- [x] §2에 clean 원천 정책과 치수 범위/확정 기준값 2048, 정확 치수 미선택 상태를 넣는다. §7 선택에 따라 실제 치수 목록은 후속 생성 Task에서 확정할 수 있음을 명시한다.
- [x] L42–45를 네 recipe로 구체화한다. L48–49는 stress cap1024와 arm cap1536을 구분하고 DO/CB resize identity가 어느 단계인지 명시한다.
- [x] L49의 원래 combined 준비 resize는 현재 L>1536>1024에서 identity가 아님을 명시한다. identity는 준비가 아니라 DO/CB를 받는 arm1536 단계다. stress 값 변경 시 이 구분의 부등식을 다시 확인한다.
- [x] 12 calibration에서 잠정 stress 확인→변경 이력 기록→held-out 전 최종 1회 freeze 절차를 추가한다. arm1536/q75 고정과 held-out 무튜닝을 보존한다.
- [x] §1의 실행 전 freeze 목록은 그대로 두고 per-calibration-run이라는 새 해석을 추가하지 않는다. §2에는 사용자가 요청한 stress 잠정값·12-family 확인·변경 승인/이유 기록·held-out 전 최종 freeze만 기술한다. calibration 실행 절차와 freeze 운영 세부는 실행 전에 별도로 정할 사항이며 이번 문서가 열린 튜닝 권한을 주지 않는다.
- [x] L55–59의 optimizer가 출력 preset들을 비교한다는 표현을 S-same에 맞게 바꾼다. PNG canonical 이름 처리만 사용자 승인 선택을 따른다. 활성 후보값1536/q75와 stress1024/q50은 manifest에서 계속 분리한다.
- [x] L68–72 arm 표와 L80–82에 B crop 없음, C/D 영역 선택만, E crop 뒤 동일 변환, A/Dfallback 예외를 적용한다. §4 L93–96의 ‘후보 정렬’은 영역 후보로 명확화하고 점수/tie break를 새로 정하지 않는다.
- [x] 변환 arm의 목표 출력은 X2의 q75 P-in JPEG로 명시하되 실제 encoder 출력의 프로필 적합성은 X9 미검증이다. L68 A의 원문은 보존하고 그 예외를 추가 문단에서 설명한다.

**Acceptance B:** 메모 원장과 프로토콜 일치. 후보1536/q75 불변. CL/JO/DO/CB format/quality/cap/순서 명확. ‘검증된 안전 threshold가 아니다’(L56)를 보존하고 q50/1024도 안전 인증값이 아님을 명시. calibration 검증 기준/변경 승인과 freeze 단계 구별. guard/selector의 gold evidence 접근 금지 유지. PNG 명칭 선택은 승인 이력과 일치.

### 단계 3 — 해석·후속 문서와 보존 검토

**Files:** 프로토콜 §3/§7, 메모 선택 결과, 핸드오프.

- [x] §4.3의 DO/CB identity·crop/no-op 구별과 N-09 치수 구분을 반영한다. 청구/효과/안전성 주장 금지.
- [x] primary와 fallback rate 동시 해석을 추가하되 새 분모를 몰래 만들지 않는다. §7 승인 선택에 따라 미정임을 남기거나 명시 승인된 계산 규칙만 반영한다.
- [x] 핸드오프 §9의 논문 base행 후속 목록을 최신 구현과 대조한다. 논문 자체는 수정하지 않는다.
- [x] 프로토콜 도입 L4–5의 함께 갱신한다는 유지보수 방침 뒤에 ‘Task 31 결정은 이 문서에 먼저 반영하며 논문은 아직 이 결정을 반영하지 않았다. 후속 범위는 Task 31 핸드오프 참조’라는 상태 주석을 넣는다. 기존 논문 링크를 유지하며 불일치를 숨기지 않는다.
- [x] §5 L108–119의 720/576/144, retry/failure/not_started/unknown, §8·§9 blinding·중지 조건과 source variant 정의 L63–64를 원문 대조한다.

**Acceptance C:** 12/36 family, strata, 4조건/5arm/질문1, 720/576/144 및 안전·회계 경계 불변. L86–88의 primary family-averaged QA success 정의와 L89의 paired-family 단위 보존. fallback rate는 함께 보고할 뿐 primary를 조정하거나 slot 제외/공변량 처리하지 않음. 기존 rejection n/N·n/S와 혼동하지 않음. X3/4/5/8/9 및 X7/10 실제 검증 공백 표시.

### 단계 4 — 검증·독립 리뷰·전달

- [x] 의존성 없는 문서 검사를 먼저 실행한다. 문서-only RED는 비적용 사유와 사전 수용 검사로 대체한다. checker의 실제 경로/명령/출력은 핸드오프에 기록한다.
- [x] 정확 Claude Opus 5.5의 별도 마일스톤 리뷰를 요청한다. 작성자 자기 검토를 독립 리뷰로 쓰지 않는다. blocker/major를 해결하고 수정 범위에 맞춰 재검증한다.
- [ ] 승인된 네 파일만 stage, Conventional Commit과 `Agent: codex` trailer, Task 브랜치 push, main 대상 Draft PR. Ready/merge 금지.
- [ ] Draft PR 후 같은 문서 검증과 승인된 gate를 실행하고 HEAD/upstream/PR head·OPEN/Draft·clean 상태를 직접 확인한다.
- [ ] Astra가 실제 diff/검사/리뷰/PR를 확인하여 PASS / PASS WITH NOTES / CHANGES REQUIRED / BLOCKED를 보고한다. 다음 Task 승인 전 중지한다.

## 7. 계획 검토 때 사용자가 정할 사항

| 항목 | 권고안(미승인) | 대안 / 영향 |
| --- | --- | --- |
| PNG canonical 이름 | 프로토콜에 이름을 남기되 ‘이번 S-same/PC-out 선택에서는 arm 출력에 쓰지 않는 비활성 항목’으로 표시. Task 30 용어 추적이 쉬움 | 활성 후보 목록에서 이름 삭제, 메모에만 이력 보존. 더 짧지만 이전 후보명과의 연결을 별도 설명해야 함 |
| 정확한 clean 치수 | 범위·확정 기준값 2048을 지금 명시하고 실제 width×height/family 배정은 합성 데이터 생성 Task에서 승인 후 확정 | 지금 2048 기준의 종횡비 목록을 사용자가 선택. 예를 들어 정사각/문서 세로/차트 가로 구성 논의 가능하나 어떤 목록도 본 계획에서 선택하지 않음 |
| npm verification gate | docs-only이므로 생략하고 아래 문서·scope·불변량 검사만 수행 | 기존 npm gate를 별도 승인 후 수행. 설치 또는 encoder 호출이 필요하면 현 금지와 충돌하므로 허용 범위를 먼저 정해야 함. Task 30의 생략 승인을 자동 적용하지 않음 |
| fallback rate 운영 정의 | 이번 문서에는 primary와 병기 요구 및 세부 분모 미정만 표시하고, 실행 전 frozen reporting spec에서 명시 승인 | 이번 Task에서 D assigned slots 중 fallback 선택 기록이 있는 수의 비율 등 구체 정의를 승인. not_started/누락 선택 기록/실패 처리까지 결정해야 하며, 현재 계획은 어느 분모도 새로 확정하지 않음 |
| calibration 검증 기준·변경 권한 | 기준은 미정임을 문서에 명시하고 실행 전 사용자 결정, 값 변경은 항상 사전 사용자 승인 | 사용자가 이번 계획 검토에서 구체 기준도 직접 지정할 수 있으나 이 계획은 기준을 발명하지 않음. 변경 시 D2-b/T<1536/치수 부등식/accounting 재검토 필수 |

**2026-10-12 사용자 선택 결과.** 위 표는 승인 전 제안 이력으로 보존하고, 실제 선택은 아래와 같다.

| 항목 | 사용자 선택 |
| --- | --- |
| PNG canonical 이름 | 권고안 채택. 이름을 유지하고 S-same/PC-out 선택에서 arm 출력에 쓰지 않는 비활성 항목으로 표시 |
| 정확한 clean 치수 | 권고안 채택. 범위 1536 < L <= 2528과 기준값 2048은 고정, 정확 치수와 family 배정은 이후 생성 Task에서 사용자 승인 뒤 확정 |
| npm verification gate | 생략 승인. NOT RUN으로 기록 |
| fallback rate 운영 정의 | 대안 채택, 최소 정의를 지금 확정. 분자는 D slot 중 guard가 fallback을 선택한 수, 분모는 D 배정 slot 전체 144와 조건별 36. guard 결정이 없는 slot(not_started 등)은 분자에서만 제외하고 수를 따로 보고하며 분모에 남김. 전체와 조건별로 primary D−C와 함께 보고하고 rejection의 n/N, n/S와 구분. slot 제외나 primary 조정 없음, 기존 failure/retry/not_started 규칙 불변 |
| calibration 검증 기준·변경 권한 | 권고안 채택. 기준은 미정이며 실행 전 사용자 결정, 어떤 값 변경도 사전 사용자 승인 |

**아래 세 문단은 승인 전 절차 이력이다. 현재는 위 결과 표의 다섯 선택이 확정되어 구현·검증됐으며 미응답 선택은 없다.**

앞의 17필드는 이미 주어진 사용자 결정이다. 이 표의 미결 선택만 계획 검토에 남기며, 확인 시간 경과를 승인으로 간주하지 않는다.

계획을 승인해도 답하지 않은 선택에 권고안을 자동 적용하지 않는다. 미응답은 해당 선택에 의존하는 수정/검사만 보류한다(예: PNG 이름은 L55 변경, npm 선택은 해당 gate 실행). 독립적으로 승인된 단계는 진행할 수 있다. 기준값 2048과 이미 명시 승인된 향후 commit/push/Draft PR 절차에는 재승인을 요구하지 않으며, 현재 계획 먼저 중지 조건은 그대로 유지한다.

계획 검토에는 프로토콜 L5 뒤 임시 논문 불일치 주석과 메모 L3의 역사/현재 구분 및 기존 한계 보존 문구를 포함한다. 이는 문서 정합화 제안이며 아직 적용하지 않았다. §1 freeze의 새로운 per-run 해석은 이번 수정안에서 제외했다. 향후 commit/push/Draft PR은 기존 사용자 명시 지시에 포함되며 계획 승인을 기다리는 절차상 순서일 뿐 새로운 transport 승인 요청이 아니다.

## 8. 문서 검증 설계 — 의존성·encoder 실행 없음

controller는 ignored `.artifacts/task-31-plan-review`에 읽기 전용 검사와 결과를 둔다. 계획 단계 명령 `node .artifacts/task-31-plan-review/verify-plan.cjs`는 준비되어 있으며 두 신규 문서와 기존 메모 17공란 보존을 검사한다. 구현 후에는 아래 기준의 별도 검사로 17개 확정값을 대조해야 한다. 아직 없는 구현 검사 파일을 이미 실행했다고 쓰지 않는다. 계획 검증은 두 신규 파일만, 구현 검증은 네 파일을 allowlist로 사용한다.

1. `git status --short`, `git diff --name-only 65347d4aad46f92c166d8720bb705303a337da78`와 untracked 목록을 합쳐 allowlist 일치 확인. 계획 단계 기존 두 문서 hash는 base와 동일해야 한다.
2. allowlist 파일 내용을 직접 읽어 trailing whitespace와 conflict marker 검사, UTF-8 replacement character/BOM·닫힌 code fence·Markdown 표 열 수·상대 파일 링크 존재 검사. controller는 verify-plan에 conflict marker와 표 열 수 검사를 보완했다. `git diff --check`/`--cached --check`도 실행하되 계획의 두 untracked 파일에는 적용되지 않으므로 그 exit 0을 신규 파일 품질 증거로 쓰지 않는다. 링크 anchor 의미는 직접 확인한다.
3. Node `fs/path/crypto`만으로 네 파일을 읽어 §11에 한정한 ID 파서로 17행/중복 없음/§2의 정확 값 매핑을 비교한다. 2 N/A를 공란으로 오인하지 않는다. 결정일·표 뒤 기록을 확인한다. Task 30의 ‘17 공란/표가 끝’ 검사기는 역사적 gate이므로 새 완료 gate에 쓰지 않는다.
4. 메모의 L3 교체/17 사용자 결정 셀/표 뒤 append를 각각 제거·복원해 base와 비교하고 나머지 bytes가 같은지 검사한다. §6 일반 표도 그대로여야 한다. 선택 요약이 F1/K-n/rc/same/same/out/T=NN/Q=NN과 맞는지 직접 검토한다. 숫자 91·480만 맞는다고 의미 검증 PASS로 주장하지 않는다.
5. 프로토콜은 §1의 정확한 교체 구간/삽입점 외 base bytes 불변을 복원 비교하고 §5/§8/§9 및 rejection 정의·source variant 경계를 직접 확인한다. 논문·Task29/30·공유문서·package/lock·사용자 리뷰 원문 hash를 보존한다. 이름/개인정보/비밀은 공개 로그에 출력하지 않는다. §1의 교체 hunk 안 유지 문장 목록이 구현 뒤 프로토콜에 있는지도 검사한다.
6. 다음 Node 산술만 별도로 실행 가능하다. validator ID/중복 규칙을 직접 읽어 2112의 전제를 확인한다. 이 계산은 codec 실행이나 측정이 아니다.

```javascript
const limit = 134217728;
const tableBound = 4 * 256 + 4 * (16 + 256);
const w = 2528, h = 2528;
const dimensionTerm = 960 * Math.ceil(w / 8) * Math.ceil(h / 8) + 6 * w * h;
if (tableBound !== 2112 || dimensionTerm !== 134206464 ||
    dimensionTerm + tableBound !== 134208576 ||
    limit - dimensionTerm - tableBound !== 9152) throw new Error('accounting arithmetic mismatch');
console.log({ result: 'PASS', dimensionTerm, tableBound,
  accountingUpperBound: dimensionTerm + tableBound,
  scope: 'arithmetic only; no encoder/profile/encoded-size/RSS guarantee' });
```

7. npm gate는 2026-10-12 사용자 결정으로 생략하며 NOT RUN으로 기록한다. 문서 검사 통과를 npm gate 통과로 바꾸지 않는다.
8. 최종 리뷰에서 AC별 근거, 미검증 항목, 정확 모델 실행 증거, 최신 Draft head를 확인한다. 이번 계획 단계에는 commit/push/PR을 하지 않는다.

## 9. 계획 완료의 중지 조건

- [x] 두 계획 산출물만 변경된 상태로 초기 독립 검토 결과와 실제 문서 검사 기록을 확보한다.
- [x] 사용자에게 §7 선택과 계획 승인 요청을 전달한다.
- [x] **명시적 계획 승인 전 메모·프로토콜 변경, commit/push/PR, 다음 Task를 수행하지 않는다.** 2026-10-12 사용자 계획 승인으로 메모·프로토콜 구현에 대한 이 중지 조건은 해제됐다. 다음 Task는 여전히 별도 승인 전 수행하지 않는다.

원문과 실제 산출물로 확인할 수 없는 효과·codec 적합성·정확 치수는 검증 또는 사용자 선택 대상으로 남긴다. 이를 임의 채워 계획을 완성한 것처럼 보고하지 않는다.
