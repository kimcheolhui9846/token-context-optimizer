# Image Protocol Decision Memo Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development after explicit user plan approval. Astra owns plan/handoff and source verification; a separate Claude Code Opus 5.5 execution owns the memo draft. Review uses a separate execution. No memo drafting before approval.

**Goal:** Task 29 §3.1이 드러낸 D1–D4를 사용자가 선택할 수 있도록 선택지·영향·의존·조건부 연산 집계로 정리한다. 값은 확정하지 않는다.

**Architecture:** 기존 저장소 근거만 쓰는 새 한국어 결정 메모다. 사실, 원문으로부터의 조건부 도출, 권고(승인 전), 사용자 결정 필요를 구분한다. 프로토콜 개정은 사용자 값 선택 뒤 별도 Task다.

**Tech Stack:** Markdown, 읽기 전용 저장소 조사, 문서 검사. npm baseline gate는 최신 사용자 결정으로 NOT RUN.

## 1. 범위와 Git 기준점

- Base: `67478ffc1fbcd2fce7f8cf31a265f5b2bad12e3c`(origin/main, PR #29 merge).
- Branch: `codex/task-30-protocol-decision-memo`.
- Worktree: `.artifacts/worktrees/task-30-protocol-decision-memo`(기존 ignore 규칙 확인).
- 최종 추가 파일은 정확히 아래 3개다. 계획 단계에는 계획/핸드오프 2개만 존재한다.
  - `docs/superpowers/plans/2026-10-11-image-protocol-decision-memo.md`: 범위, 순서, 수용 기준, 고정 검사.
  - `docs/research/image-protocol-decision-memo.md`: 승인 후 작성할 결정 메모.
  - `docs/agent/handoffs/task-30.md`: 상태, 계정/모델 역할, 검증, 리뷰, PR 식별 정보.
- 기존 프로토콜, 논문, Task 29 분석/핸드오프, 공유 HANDOFF, WBS, 코드, 테스트, 의존성은 변경하지 않는다.
- 변환 구현, 새 encoder 실행/실험, hosted 평가 모델 호출, count-tokens, 외부 조사 금지. 하네스 Claude 문서 작성/리뷰 호출은 사용자가 요구한 별도 절차다.
- F-12, 파일럿 모델, 첫 구현 연산 순서를 확정하지 않는다. rebase/force push/이력 재작성/브랜치 삭제 금지.
- 새 수치·URL·인용 근거를 만들지 않는다. 표의 문서상 개수는 명시된 집합에서 재현 가능한 산술로만 도출하며 실측으로 표현하지 않는다.
- 최신 사용자 결정: worktree에서 npm.cmd ci 설치(네트워크/install script 포함)는 승인, 전체 npm baseline은 생략하여 NOT RUN. 이전 baseline 1회 계획을 대체한다. 별도 fixture 생성/probe, encoder 적합성 실험은 하지 않는다.

## 2. 원문 조사와 인용 기준

인용 행은 위 base의 1-based 행 번호로 고정하고 절 제목과 상대 링크를 함께 쓴다. 아래는 계획을 위한 열람 근거이며 부재 판단은 작성 시 관련 절 전체를 다시 대조한다. 바깥 URL을 열지 않는다.

| 근거 | 열람 범위와 확인할 경계 |
| --- | --- |
| [프로토콜](../../research/image-first-evaluation-protocol.md) | §2 L24–51: 네 조건, clean 격리, combined 순서. §3 L53–89: 후보값/arm/primary. §5 L106–119: 720/576/144, failure/retry. §6 L121–141: manifest/비용 unknown. §7 L143–175: 회계 해석. §10 L205–220: M1–M6 경계 |
| [논문](../../research/image-first-paper-draft.ko.md) | §3.1 L54–67, §3.2 L69–83, §3.3 L85–111, §4 L113–140: 후보·원본/fallback·평가·분모/대비. §6 L150–171의 회계/품질 한계 |
| [Task 29 분석](../../research/image-transform-provenance-gap.md) | §3.1 L73–90: 원래 미정 칸과 연산 분리, §3.2/§4.2: 후보와 항상 재인코딩 옵션의 비동치 |
| [Task 29 핸드오프](../../agent/handoffs/task-29.md) | §9 L157–166: D1–D4 후속 범위. 수정하지 않음 |
| [입력 계약](../../image-artifacts.md) | Supported input L9–56, 필드 L105–108: PNG RGB/RGBA 8-bit와 제한 JPEG, 자원/metadata 제한 |
| [JPEG feasibility](../../research/jpeg-codec-feasibility.md) | L7–15, L17–38: 독립 encoder fixture와 decoder 관찰/한계. jpeg-js encoder 통과 근거로 바꿔 쓰지 않음 |
| [JPEG runtime](../../research/jpeg-runtime-validation.md) | §Source checks L6–28, §Resource measurement L55–74, §Precommit review L84–88: 기존 validator/resource 관찰의 한계 |
| [토큰·비용](../../research/image-token-cost-models.md) | 정의 L13–19, 모델별 회계, JPEG q75 L181–193, 후속 실측 L195–197. 기존 산술/unknown과 실제 usage/청구 분리 |

**현재 확인:** 프로토콜 §2는 clean format/channels 및 stress quality/정확 JPEG profile/목표 치수를 고정하지 않는다. §3의 PNG canonical/1536/q75는 후보 preset이며 특정 arm 배정이나 stress 동일값 선언이 아니다. downscale-only 출력 format도 미정이다. 두 JPEG 증거 문서는 jpeg-js encoder의 임의 출력이 제한 ingest 프로필을 통과한다는 일반 보증이 아니다. 그 통과 여부에 관해 이 두 문서의 기록을 넘는 추론·새 실험을 하지 않는다. 입력 계약 L52–56의 jpeg-js 말미 FF00 관찰은 프로필 전체 적합성 보증이 아니며 encoder 통과 근거로 추가 사용하지 않는다. D2의 정확 프로필 열은 입력 계약의 JFIF/8-bit/4:4:4/metadata/scan/restart 제한을 함께 참조한다.

## 3. 메모 구조와 수용 기준

### AC1 — 항목별 사실과 부재

D1 clean format/channels, D2 JPEG-only/combined stress quality/JPEG profile/downscale 목표, D3 PNG canonical/1536/q75의 실제 arm 배정, D4 downscale-only 출력 format을 각각 다룬다. 프로토콜과 논문의 명시/미명시를 파일·절·행으로 대조한다. PNG profile 이름의 rgb8이 RGBA 배제를 뜻한다고 오독하지 않는다.

프로토콜 §2 L49의 stress 문맥 속 “preset”과 §3 L55–57의 후보/stress 구분, 논문 §3.1 L63–65의 후보 문맥 속 combined/identity 서술을 병기한다. 동일 수치의 선언으로 해석하지도, 문맥상 긴장이 없다고 단정하지도 않는다. 1536+q75 조합 후보에 관해 명시된 것과 배정 미정인 것을 D3에서 구별한다.

D2 하위 필드는 JPEG-only quality/profile, downscale-only 목표 치수, combined 목표 치수/quality/profile, 조건 사이 동일값 여부다. 사용자 D2 문구와 Task 29 L81을 연결한 범위 명확화이며 새 값을 추가하지 않는다. 출처 문구가 충돌하면 현재 사용자 지시를 우선하고 차이를 보고한다.

### AC2 — 선택지 2–4개와 모든 영향 축

각 D에 2–4개 비교 가능한 선택지를 제시한다. D2의 quality/profile/치수와 D3의 preset×arm은 묶음 선택이 숨은 값을 확정하지 않도록 하위 필드를 드러낸다. 다음은 비교 후보의 설계 방향일 뿐 선택 결과가 아니다.

- D1: 현행 계약 범위의 제한 RGB PNG, 제한 RGBA PNG, 제한 JPEG, family별 원본 format 유지(혼합)를 검토한다. 혼합은 현행 ingest 허용 범위로 한정한 선택 제안이며 실제 corpus가 혼합이라는 사실 주장이 아니다. JPEG를 clean으로 둘 때 preexisting encoding 손상을 clean 의미와 구별한다. 입력 수용 가능과 생성 encoder 출력 검증은 별개다.
- D2: 후보값과 동일하게 둘지, 독립된 stress 값으로 둘지, 조건별 독립 recipe로 둘지 비교하되 저장소 근거 없는 quality/치수를 발명하지 않는다. 그런 수치는 사용자 결정 필요로 비워 둔다. profile 선택도 정확 계약과 적합성 미검증을 별개 열로 드러낸다.
- D3: 프로토콜과 양립하는 arm 배정 대안을 2–4개 구성한다. A full original, C/D 동일 selection, D original fallback, E oracle 격리를 지킨다. B/C가 가능한 한 같은 output transform 설정을 쓴다는 조건과 E 출력 처리 미정 경계를 표시한다. 근거 있는 선택지가 2개 미만이면 임의로 채우지 않고 해당 D를 사용자 결정 필요로 보고한다. 이 경우 수용 기준 미충족으로 남기고 완료 처리하지 않으며 사용자에게 보고하고 지시를 기다린다.
- D4: 제한 PNG 출력, 입력 format 유지, 제한 JPEG 출력 등을 D1에 따른 조건부 대안으로 검토한다. JPEG 출력이 순수 downscale-only에 추가 재압축 손상을 도입한다면 조건 의미 변경 위험을 명시한다. 보존할 channels와 alpha 처리도 미확정으로 남긴다.

D3 하위 필드는 B 변환 구성(고정 여부도 선택 제안이며 원문 확정 사실 아님), C/D가 비교할 후보 집합과 동일 selection 유지, E 출력 처리, PNG canonical 쓰임이다. 후보 집합에 포함됨과 실제 slot에서 선택됨을 구별한다. D4는 D1별로 중복 대안과 유효 선택지 수를 표시한다.

각 선택지에 ingest 가능성(프로필·자원 제한 조건 포함), crop/decode/downscale/JPEG encode/PNG 재인코딩 필요, stress/preset 분리, 기존 근거에 한정한 토큰·비용 영향, 논문 서술/분모/primary D−C 영향을 빠짐없이 적는다. 영향 축은 (1) ingest, (2) 구현 연산, (3) stress/preset 구분, (4) 토큰·비용, (5) 논문 서술, (6) 분모, (7) primary D−C의 일곱 개로 검사한다. 빈 영향 셀을 허용하지 않으며 모르면 [검증 필요] 또는 사용자 결정 필요와 사유를 적는다.

### AC3 — 의존과 권고

D1→D4, D1↔D3(PNG canonical을 clean 생성에 쓰는지), D2↔D3의 값 구분 등 의존을 근거와 함께 정리하고 결정 순서를 제안한다. 구현 연산 순서와 사용자 결정 순서를 혼동하지 않는다. 권고는 별도 **권고(승인 전)** 절에서 판단 근거와 반대 선택의 비용을 함께 적고, 근거가 부족한 세부값은 권고하지 않는다.

### AC4 — 선택 조합과 미정 칸 추적

Task 29 §3.1의 미정 칸마다 식별자를 붙이고 D1–D4 중 무엇으로 해결되는지 연결한다. D1–D4만으로 해결되지 않는 B crop 여부, crop 출력 format, 실제 slot 선택, no-op 정책/PNG canonical 동일 preset 여부 등은 잔여 [검증 필요]로 남긴다. Task 29 표 원본은 고치지 않는다.

메모 맨 앞에 한 화면 요약(결정 항목, 구별되는 조합 수 또는 기호식, 잔여 미정 수)을 둔다. 먼저 D 하위 필드의 민감도를 점검해 연산 필요 집합을 바꾸지 않는 필드를 조합 축에서 제외하고 사유를 적는다. 다만 exact preset 구분이나 identity/대비 해석을 바꾸는 필드는 별도 overlay 축으로 유지한다(quality 수치는 일반 encode 존재와 무관하지만 q75 일치 여부는 exact preset 행에 영향). 결과적으로 서로 다른 필요 연산 집합을 만드는 선택 조합을 비교한다. 전체 조합이 같은 결과로 묶이면 동치 묶음 기준과 포함 선택지를 적고, 미포함 조합/불명확 조합은 명시한다. 편의상 고른 조합만 전체인 것처럼 주장하지 않는다. 각 조합의 D1–D4 가정과 미정값을 먼저 표시한다.

집계 전집합은 네 입력 조건과 A–E 다섯 arm이다. 행 키는 (조합 ID, 연산)이고 조합 ID별 D1–D4 가정 표를 먼저 둔다. 선택지의 전체 곱을 고려하되 모순 조합은 이유를 기록해 제외한다. 두 표의 모든 셀 분류가 동일한 조합만 동치 묶음으로 합치며 구성 선택지 ID를 열거한다. 값 미정으로 달라지는 셀은 미정으로 남긴다.

필수는 해당 집계 단위의 모든 허용 경로에서 필요한 연산, 불필요는 모든 경로에서 불필요한 연산, 조건부는 알려진 경로에 따라 필요 여부가 달라지는 연산, 미정은 근거로 분류할 수 없는 연산이다. D는 변환 경로와 original fallback을 먼저 분리한 뒤 합치므로 변환에서만 쓰이면 조건부다. 병합 규칙: 미정이 하나라도 있으면 미정, 미정이 없고 모두 필수면 필수, 모두 불필요면 불필요, 그 밖의 모든 혼합은 조건부다. 알려진 경로별 분류는 각주에 남긴다. arm 집계도 condition×arm 셀에서 같은 규칙으로 합치며 필수/조건부/미정 집합을 따로 재계산한다.

표 형식은 다음 둘로 분리한다.

| 조합/연산 | clean 준비 | JPEG-only 준비 | downscale-only 준비 | combined 준비 | 필요한 조건 집합/개수 |
| --- | --- | --- | --- | --- | --- |
| 작성 시 근거 기반 조합 | 필수/조건부/불필요/미정 | 동일 분류 | 동일 분류 | 동일 분류 | 분류별 집합과 개수 |

| 조합/연산 | A | B | C | D 변환/fallback | E | 필요한 arm 집합/개수 | 잔여 미정 칸 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 작성 시 근거 기반 조합 | 필수/조건부/불필요/미정 | 동일 분류 | 동일 분류 | 경로 분리 | 동일 분류 | 분류별 집합과 개수 | 미해소 원인 |

- 최소 5행은 RGB PNG crop, JPEG decode→crop, 1536 downscale, q75 JPEG encode, PNG canonical 재인코딩. 일반 resize/JPEG encode 필요 행과 정확 1536/q75 preset 필요 행을 별도로 둔다. 추가 행의 개수는 문서 구조일 뿐 새 실험 수치가 아니다.
- 조건 준비의 연산을 모든 arm 내부에서 다시 수행하는 것으로 중복 계산하지 않는다. arm 집계에는 조건별 적용 근거도 남겨 condition×arm 교차를 추적할 수 있게 한다.
- 필수/조건부/미정 개수를 합쳐 필수 개수로 쓰지 않는다. 같은 arm에서 여러 조건에 필요해도 distinct arm count는 한 번만 센다. 실제 호출 횟수·성공률·720 독립 관측 수로 바꾸지 않는다.
- crop-first/resize-first 판단 자료가 되도록 커버리지와 필요한 선행 연산을 요약하되 첫 연산을 선택하지 않는다. codec 적합성/안전성은 개수로 입증되지 않는다.

조합별 조건×arm의 effective transform을 identity/부분 identity/비identity/미정으로 표시하고 사유를 적는다. 특히 stress 목표=1536이고 arm의 1536 no-upscale 적용이면 downscale-only/combined의 resize 단계는 identity다. clean 치수 분포는 근거 없으므로 [검증 필요]. resize identity를 전체 출력 byte/pixel identity로 확대하지 않는다. q75 JPEG에 q75 재인코딩을 다시 해도 identity로 취급하지 않으며 재압축 손실 크기는 주장하지 않는다.

### AC5 — 평가 불변량과 해석

네 조건/다섯 arm/family·질문 수가 그대로인 선택은 계획된 720/576/144 분모를 바꾸지 않음을 조건부로 설명한다. 새 조건/arm/반복이 필요한 대안은 현 프로토콜 밖임을 표시하며 자동 추가하지 않는다. C/D 후보/설정을 비대칭으로 바꾸어 primary D−C를 guard/fallback만의 효과로 해석할 수 없게 되는 위험을 점검한다. fallback/실패/retry와 unknown 회계 규칙을 유지한다. identity/부분 identity 칸이 D−C, C−B, D−A 중 어느 대비에 영향을 주는지 명시하고, 입력이 같아질 가능성과 효과 크기/통계 검정력의 미측정을 구분한다.

### AC6 — 메모 마지막 결정 표

결정 표 바로 앞에 D1–D4 밖 잔여 결정 목록(B crop, crop 출력 format, E 출력 처리, no-op/PNG canonical 관계 등)과 첫 연산 순서에 대한 영향, “첫 연산 순서를 가르는 최소 결정 집합”을 둔다. 최소성은 근거 범위에 한정하고 판단 불충분 시 그렇게 명시한다. D1–D4만 고르면 순서가 자동 결정된다고 쓰지 않는다.

마지막 내용은 항목, 선택지, 권고(승인 전), 사용자 결정의 단일 표다. D1–D4 및 필요한 하위 필드가 모두 나타나야 하며 D2/D3의 하위 필드별 행도 둔다. 권고가 없으면 권고 칸에 “권고 없음(근거 부족)”을 쓰고 사용자 결정란만 빈 셀로 둔다. 결정 표 뒤에 결론이나 사실상의 값 확정을 덧붙이지 않는다.

### AC7 — 전달/기록

최종 diff는 위 3개 새 문서만 포함한다. 핸드오프 첫 항목은 PR·브랜치·base를 갖춘다. 작성/검토 계정은 비식별 실행 역할과 확인 범위로, 모델은 실제 runtime ID로 기록한다. 하네스 직접 호출과 사용자 제공 리뷰를 별도 절에 기록한다. 문서/검증/리뷰 완료 후 Conventional Commits 및 Agent: codex trailer로 commit, main 대상 Draft PR, HEAD/upstream/PR head 일치와 OPEN/Draft를 확인한다. Ready/merge/다음 Task 없이 중지한다.

## 4. 승인 단계별 실행 순서

- [x] **1. 읽기/격리:** 실제 base, dirty root 보존, Task 30 branch/worktree, 모델 및 지침 확인. Task 전용 핸드오프를 첫 산출물로 생성.
- [x] **2. 계획 검토:** Astra 계획 자체 점검 후 별도 Claude Code claude-opus-5-5 no-tool 계획 리뷰. 정확 모델/성공 응답 확인. blocker/major 처리 및 한정 재검토. 결과/한계를 기록.
- [x] **3. 사용자 승인 gate:** 계획 보고 뒤 사용자 제공 조건부 승인 수령. P-1 반영 및 P-2 결정 완료 후 메모 작성 허용, 추가 계획 재검토 불필요라는 지시를 적용한다. 값 선택 승인은 아니다.
- [x] **4. 승인된 설치/검증 예외:** npm.cmd ci를 worktree에서 실행하고 package/lock tracked 무변경 확인. 전체 npm baseline은 사용자 결정으로 NOT RUN. 문서·scope 검사는 실행한다.
- [x] **5. 메모 작성:** 별도 Claude Opus 5.5 실행에 이 계획과 §2 표에 지정한 전 범위의 행 번호 포함 비민감 원문을 제공. 표에서 범위를 지정하지 않은 Task 29 §3.2/§4.2, 회계의 모델별 절은 절 전체를 제공한다. 패키지에 없는 행은 인용하지 않고 [발췌 요청]으로 controller에게 반환한다. 소유권은 새 메모만, 기존/다른 작업자 파일 수정 금지. Astra가 실제 원문·행·표 집계·금지사항 대조. 사용자가 값을 고른 것으로 쓰지 않음.
- [x] **6. 검토/검증:** 문서 검사, 정확 scope, AC1–AC7 직접 점검. 작성자와 별도 Claude 마일스톤 검토, blocker/major 수정 후 문서 재검사. 확인 불가 모델을 다른 모델로 몰래 대체하지 않음.
- [ ] **7. 전달:** 세 파일만 stage/commit/push/main Draft PR. PR에 요구사항, RED 예외, baseline/문서 결과, 리뷰 범위/모델/한계, 승인 gate 기재. 이후 문서 검사와 Git/PR 동기화 재확인, Astra 결과 보고 후 중지. 전체 npm gate 반복하지 않음.

## 5. 고정 문서 검사와 정확 scope

검사 대상은 명시적 allowlist다. 계획 단계 2개, 최종 3개. 신규 untracked 문서도 직접 읽어 검사한다.

- UTF-8 decode 오류/BOM, trailing whitespace, 누락된 최종 newline, 혼합 LF/CRLF, 미닫힌 backtick fence가 없어야 한다.
- 상대 Markdown 파일 링크는 각 문서의 디렉터리를 기준으로 실제 존재를 확인한다. 계획 단계에 아직 없는 메모는 inline code 경로로만 표현한다. fragment/표/인용 절과 행은 Astra가 직접 확인한다.
- 모든 로컬 명령은 Windows tty:true/login:false, Node child process는 windowsHide:true. 외부 리뷰는 tools/MCP 비활성, 최소 발췌만, scratch는 ignored 경로에 둔다.

`git diff --check`, stage 후 `git diff --cached --check`를 실행한다. scope 검사는 tracked diff뿐 아니라 `git ls-files --others --exclude-standard`, staged paths, base 대비 committed paths를 모두 합쳐 단계별 allowlist와 정확 비교한다. 이름만 같고 기존 파일을 수정한 경우를 막기 위해 base에서 세 경로가 없었으며 최종 status가 A인지 확인한다.

최종 커밋 검사는 다음 명령의 결과가 위 3개 경로와 정확히 같아야 한다.

```powershell
git diff --name-only 67478ffc1fbcd2fce7f8cf31a265f5b2bad12e3c...HEAD
git diff --name-status 67478ffc1fbcd2fce7f8cf31a265f5b2bad12e3c...HEAD
git status --short
git log -1 --format=%B
```

수용 검사: D1–D4 모두 2–4 선택지(미달은 미충족으로 보고), 위 일곱 영향 축, 원문 행 대조, 조합의 필수/조건부/미정 집합에서 개수 재계산, 분모/primary 보존, 마지막 결정란 빈 셀을 직접 확인한다. 문서 예시 fence는 backtick으로 통일한다. 실제 검사 스크립트는 ignored `.artifacts/task-30-plan-review/verify-docs.cjs`이며 계획 단계는 `node .artifacts/task-30-plan-review/verify-docs.cjs plan`, 최종 단계는 같은 명령의 `final` 인자로 실행한다.

## 6. 설치와 baseline 결정

사용자 제공 리뷰 P-2에서 worktree 의존성 부재를 확인했고, 사용자가 “npm.cmd ci 승인하고 베이스라인은 생략”을 명시했다. 두 지시를 함께 적용한다.

- worktree에서 `npm.cmd ci` 실행: 네트워크 및 기존 install script 포함 승인. 설치 전후 package.json/package-lock.json hash와 tracked diff를 확인한다. 버전 변경/lock 갱신 금지.
- `npm.cmd test`, `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run smoke:mcp`, `npm.cmd run validate:plugin`, `npm.cmd run benchmark`: 모두 **NOT RUN — 사용자 승인 baseline 생략**. 이전 Task의 790 passed/1 skipped를 이번 실행 결과로 쓰지 않는다.
- 새 encoder 실험, 이미지 fixture/probe/measure, hosted 평가/count-tokens는 금지한다. npm ci 성공은 테스트 또는 codec 적합성 증거가 아니다.
- 설치 실패 시 원인과 영향만 조사·보고하며 코드/의존성 선언을 고치지 않는다. 문서 검증과 independent review는 별도 수행한다.

## 7. 모델/리뷰와 승인 대기

- 계획/최종 reviewer: 현재 Codex 세션의 gpt-6-astra, runtime 확인. 작성 계정의 개인 식별 정보는 공개하지 않는다.
- 하네스 초기 리뷰: 로컬 Claude Code 인증 계정의 정확 claude-opus-5-5 별도 실행. CLI 설치/로그인만으로 성공 처리하지 않고 modelUsage 및 정상 응답을 확인한다. 성공 시 Terra 호출하지 않는다.
- Claude 불가 시 실제 이유를 기록하고 정확 Codex 6 Terra를 확인한다. 둘 다 불가하면 구현은 BLOCKED, 리뷰만 불가하면 DEGRADED로 보고하며 사용자 승인 gate는 유지한다.
- 사용자 제공 Task 30 계획 리뷰(2026-10-11, claude-opus-5-5)를 수령했다. 하네스 리뷰와 별도 실행이며 같은 모델이다. P-1–P-5/N-1–N-2를 반영하며 상세 판단은 핸드오프에 기록한다.
- 현재 사용자 조건부 승인에 따라 지적 반영 후 메모 작성 및 Draft PR 전달까지 진행한다. 이 계획의 승인과 D1–D4 값 선택은 다른 결정이다.

### 계획 리뷰 결과

하네스가 별도 호출한 Claude Code `claude-opus-5-5` 초기 리뷰의 M1–M6을 수용/수정 수용했다. 한정 재검토는 SPEC 통과, QUALITY 통과(비차단 minor 2), 새 blocker/major 0이다. 당시 e1 baseline 실패 시 중지 및 단일 명령 재실행 승인, e2 모든 분류 병합 규칙을 반영했다. e1은 이후 사용자 baseline 생략 결정으로 적용 대상이 없어져 §6에서 대체됐으며 e2는 유지된다. 이 두 문구는 Astra가 직접 확인하며 추가 Claude 재검토는 수행하지 않았다. 리뷰어는 제공된 발췌만 검토했으며 직접 저장소 열람·Git 검증을 한 것은 아니다. 실제 호출의 modelUsage와 정상 종료는 controller가 확인했다. 이후 사용자 제공 계획 리뷰를 수령하고 P-1–P-5/N-1–N-2 및 baseline 생략 결정을 반영했다. 사용자는 추가 계획 재검토 없이 메모 작성 진행을 허용했다.

## 8. PR만으로 재현하는 문서 검사

아래 내용을 worktree의 ignored `.artifacts/task-30-plan-review/verify-docs.cjs`로 저장한다. 외부 패키지 없이 Node 내장 모듈과 Git만 사용한다. `node .artifacts/task-30-plan-review/verify-docs.cjs final`로 세 신규 문서 검사 및 base 대비 scope를 확인한다. 기존 안내대로 인용/표의 의미 검증은 별도 직접 검토한다.

```javascript
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const phase=process.argv[2]||'plan';
const files=['docs/agent/handoffs/task-30.md','docs/superpowers/plans/2026-10-11-image-protocol-decision-memo.md'];
if(phase==='final')files.push('docs/research/image-protocol-decision-memo.md');
files.sort();const errors=[];
for(const p of files){const b=fs.readFileSync(p);let s;try{s=new TextDecoder('utf-8',{fatal:true}).decode(b)}catch{errors.push(p+': invalid UTF8');continue}
if(b[0]===239&&b[1]===187&&b[2]===191)errors.push(p+': BOM');
if(!s.endsWith('\n'))errors.push(p+': final newline');
if(s.includes('\r\n')&&/(?<!\r)\n/.test(s))errors.push(p+': mixed newlines');
if(/[^\S\r\n]+$/m.test(s))errors.push(p+': trailing whitespace');
let fence=false;for(const line of s.split(/\r?\n/)){if(/^\x60{3}/.test(line))fence=!fence;}if(fence)errors.push(p+': fence');
for(const m of s.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)){const target=m[1].split('#')[0];if(!target||/^[a-z]+:|^\//i.test(target))continue;if(!fs.existsSync(path.resolve(path.dirname(p),target)))errors.push(p+': missing '+target)}
}
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const base='67478ffc1fbcd2fce7f8cf31a265f5b2bad12e3c';
const changed=[...new Set([git('diff','--name-only',base),git('ls-files','--others','--exclude-standard')].join('\n').split(/\r?\n/).filter(Boolean))].sort();
if(JSON.stringify(changed)!==JSON.stringify(files))errors.push('scope mismatch '+JSON.stringify(changed));
for(const p of files)if(git('ls-tree','--name-only',base,'--',p))errors.push('not new: '+p);
git('diff','--check');git('diff','--cached','--check');
console.log(JSON.stringify({phase,files,errors,result:errors.length?'FAIL':'PASS'},null,2));if(errors.length)process.exitCode=1;
```

## 9. 메모 표 산술 보조 검사

아래를 ignored `.artifacts/task-30-plan-review/verify-memo.cjs`로 저장하고 `node .artifacts/task-30-plan-review/verify-memo.cjs`를 실행한다. 명시된 집합 개수·결정란 공란·표 열 수·중복 ID만 확인하며 분류의 의미나 원문 적합성을 검증하지 않는다. 그 의미 검증은 Astra와 독립 리뷰가 맡는다.

```javascript
const fs=require('node:fs');
const s=fs.readFileSync('docs/research/image-protocol-decision-memo.md','utf8');const errors=[];
const sets=[...s.matchAll(/\{([^{}\n]*)\}\((\d+)\)/g)];
for(const m of sets)if(m[1].split(',').map(x=>x.trim()).filter(Boolean).length!==+m[2])errors.push('set count '+m[0]);
const tail=s.slice(s.indexOf('## 11. 결정 표'));const rows=tail.split('\n').filter(x=>x.startsWith('|')&&!x.startsWith('| 항목')&&!/^\|[-\s|]+$/.test(x));
for(const row of rows)if(row.split('|').slice(1,-1).at(-1).trim())errors.push('nonblank decision '+row);
if(!s.trimEnd().endsWith(rows.at(-1)))errors.push('content after decision table');
let cols=0;for(const line of s.split('\n')){if(line.startsWith('|')){const n=line.split('|').length;if(cols&&cols!==n)errors.push('table columns '+line.slice(0,100));cols=n}else cols=0}
for(const pre of ['U','X']){const ids=s.split('\n').filter(l=>l.startsWith('| '+pre)).map(l=>l.split('|')[1].trim()).filter(id=>/^([UX])[0-9]+$/.test(id));if(ids.length!==new Set(ids).size)errors.push('duplicate '+pre)}
if(s.includes(String.fromCharCode(0xfffd)))errors.push('replacement character');
console.log(JSON.stringify({result:errors.length?'FAIL':'PASS',explicitSets:sets.length,decisionRows:rows.length,errors},null,2));if(errors.length)process.exitCode=1;
```
