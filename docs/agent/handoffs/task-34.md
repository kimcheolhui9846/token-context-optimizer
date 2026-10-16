# Task 34 — 응답 기반 fallback 문서 개정

## 상태와 승인
- Tier D: 문서만. 사용자 2026-10-16 권고안·세부 규칙 전부 승인.
- Base: origin/main 39cf53a3d67f75771bd4ab27bbeef063fc96109a (PR #33 merge).
- Branch: codex/task-34-response-fallback; 전용 worktree 사용, 기존 작업 보존.
- 현재: 본문 개정과 직접 검증 완료. 커밋·push·Draft PR 전달 진행 중.
- 루트 HANDOFF.md는 로컬 연결 기록이며 커밋하지 않는다.

## 승인된 계획과 반영 범위
- 프로토콜 §1–9/M3와 논문 초록·서론·§3.2·§4–7의 D 정의·호출 회계·한계를 맞춘다.
- Q1: primary D−A; D−C와 C−B는 secondary exploratory. 사전 margin 없는 비열등성 주장 금지.
- Q2: 호출 전 OCR guard 제거. selector의 OCR 입력·버전 고정·지연 기록은 유지.
- D 첫 호출 = C와 동일 selection/변환; 영역 없음 = C/D 모두 full-frame arm 변환.
- 모든 arm에 같은 frozen instruction: 답을 읽을 수 없으면 UNREADABLE이라고 답하라.
- 대소문자 무시 substring 판정. D에서 해당하면 배정 variant 그대로 fresh session에서 최대 한 번 재요청.
- 최종 답은 재요청 답, 두 호출의 토큰·비용·지연 합산. A 응답 재사용·재귀 재요청 금지.
- 기본 호출 720 및 배정 slot 분모 보존; 조건부 재요청과 오류 retry를 별도 집계.
- 재요청률 = 실제 재요청한 D slot / 배정 D slot (전체 144, 조건별 36).
- 오류·timeout·invalid output·not_started·unknown 회계 보존. 독립 응답의 일치는 보장하지 않음.
- Q3: 파일럿은 프로토콜 설계 근거로만; 논문 실험 결과나 수치를 추가하지 않음.
- Q4: 저해상도 selector bypass는 별도 검증 뒤 결정; 이번에는 추가하지 않음.
- Q5: 모델/입력별 판독 불가 표지 미발생, 조용한 오답, 공급자 원본 축소의 한계를 정성적으로 명시.
- 결정 메모 끝에 10-14 채택과 10-16 상세 승인 기록 한 줄 추가; 기존 17필드와 역사 분석 보존.
- stress 1024/q50, arm 1536/q75, clean 정책 및 기존 수치 보존.
- 제외: 코드·테스트·설정·패키지, research/, codex_review/, paper/, 실험 실행·새 수치 계산.

## 근거와 위험
- 요청서: codex_review/codex_task34_request_2026-10-14_guard-revision.md (읽기 전용).
- main의 research/results/pilot-002/README.md 및 pilot-003/README.md: 개발용 설계 근거.
- PR #37 head 850b636516996e4dc587e4b16006bd18378620b9의 exp2-cal-gpt4o/README.md 읽기.
- calibration D에는 no-window → 원본 규칙도 포함된다. 그 이득을 새 응답 기반 재요청 효과로 인용하지 않음.
- held-out 실행 담당자는 승인된 문서와 실행 계획을 맞춰야 하며 Task 34 merge 전에 실행하지 않음.

## 구현·검증·리뷰
- 첫 구현: native executor (GPT-5.6 Luna 지정); 잔여 보완 전 사용량 한도로 중단.
- 대체 구현: Claude Code claude-opus-5-5 실행 성공 확인 후 문서 두 개의 잔여 수정. 독립 리뷰가 아님.
- TDD: 문서 전용으로 RED/GREEN/REFACTOR 및 npm gate 해당 없음; 직접 읽기와 git diff --check 사용.
- 중간 직접 검토: 재요청 원본 경로·OCR 보존 오류 및 회계/표기 누락을 수정하고 직접 재확인.
- git diff --check: PASS. 문서 3개 직접 대조, 결정 메모의 기존 본문·17필드 불변 확인.
- 금지 경로 변경 없음. 새 실험 수치·실험 호출·코드 변경 없음; npm 테스트 및 custom 검증 스크립트 미실행.
- 초기 Harness 교차 검토: Tier D 규칙에 따라 호출하지 않음.
- Claude 독립 구현 리뷰: 사용자 제공 리뷰 대기. 구현자 수정 결과를 독립 리뷰로 간주하지 않음.
- 주 에이전트 직접 사전 검토: PASS WITH NOTES; blocker/major 0, Claude 독립 리뷰와 held-out 정합성 확인 대기.

## 전달 및 승인 gate
- 승인된 문서 3개와 이 핸드오프만 커밋; trailer는 Agent: codex만 사용.
- push → main 대상 Draft PR → 최종 로컬 검증 → 보고 순서. Ready·merge는 별도 사용자 지시 필요.
- Task 35 및 이후 Task는 시작하지 않고 사용자 검토·승인을 기다린다.
