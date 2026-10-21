# Task 38 — 실험 2·3 결과 부록과 논문 반영

- 등급: 요청서 특별 규칙 D + Astra. Claude 계획 1회, Draft PR 뒤 Claude PR 검토 1회, 주 에이전트 최종 검토.
- 기준: main `eaf754296aff790dd73289313c2057cf8ea6357c`(PR #49 merge).
- 브랜치: `codex/task-38-heldout-results`; worktree `.artifacts/worktrees/task-38-heldout-results`.
- 현재 상태: [Draft PR #51](https://github.com/kimcheolhui9846/token-context-optimizer/pull/51) eb14f68 재검토 확인 뒤 승인된 N-3·그림 번호 정리 반영. push 뒤 PR #52 읽기 전용 검토 → Claude #51 확인 → 사용자 merge 순서. Draft 유지.
- 사용자 승인: P1–P5 모두 2026-10-20 권장안 승인(전달문 25행 및 사용자 재확인). 추가 계획 승인 불필요.
- P1 파일명 `2026-10-16-experiment2-results.md`; P2 compact 보완 주장과 13.9%→81.9%; P3 결과 표 2개/원고 그림 1–4 = 파일 fig1·fig5·fig2·fig3; P4 스킬 본문 미언급; P5 제품 crop과 연구 OCR 평가 구분.
- 범위: 두 결과 부록, 원고, 실험 3 프로토콜 결과 링크 한 줄, 이 핸드오프의 5개 Markdown 파일만.
- 금지: research/, codex_review/, 나머지 docs/research/, 제품 코드·테스트·설정·패키지 수정, 그림 수정, 수치 재계산, 실험 호출, 루트 HANDOFF 커밋.

## 승인 계획 및 구현
- [x] PR #49 merge main 기준으로 fast-forward, P1–P5와 Claude M2/m4 반영.
- [x] 실험 2: 현행 개정 1 H1(D−A), 기술 H2/H3, arm·조건·레이아웃·재요청·D′ 탐색·이탈 없음·한계.
- [x] 실험 3: H1–H4, S0–S4 정확도·회상·토큰·정가/캐시, 레이아웃 CI, 탐색 오류·이탈 1·재현·한계.
- [x] 원고: compact 보완 주장, C2·C3 원문 유지, C4 부정적 결과, 연구·제품 경계, V 요약, VI 결과, VII 세 한계와 발췌 문단.
- [x] VI 이관 7개: 프로토콜 링크/역사적 번들/가설 기준/세션 제외 금지/영역 미발견 분기/재요청 이미지 대상/기준 seed.
- [x] T1 정확도·차이·CI 소수 한 자리, T2 정수 31%와 원값, T3 파일 fig1·fig2·fig3·fig5 사용 유지(원고 순서 fig1·fig5·fig2·fig3), 결과 표 2개(표 2·3), 비교표 1. 파일 fig4는 표 3 비용 패널, fig6은 조건별 부록 표.
- [x] 참고문헌: main IEEE 정리본 §1 [1]–[24] 보존; 가격 두 항목은 §2 그대로 [25]·[26]에 추가.
- [x] 실험 3 프로토콜은 결과 링크 한 줄만 추가; 부록에서 역링크.
- [x] 구현 `f14d190`(Agent: codex) → push → Draft PR #51(base main) → 제출 후 로컬 문서 확인.
- [x] 사용자 Claude PR·재검토 지적 반영 및 주 에이전트 내용 검토. Ready·merge·다음 Task는 별도 승인.

## 해석 경계
- H1 미지지는 비열등성 미입증이며 −5%p 이상 열등하다는 입증이 아니다. 실험 2 H2/H3와 D′는 가설 승격 금지.
- 실험 3 Haiku H4는 형식상 성립하나 절감 없음. GPT-4o 비용 28.5%→9.1%, Haiku 비용 역전 유지.
- 발췌 bench 20/24→24/24는 근거 포함이며 모델 정확도가 아니다. 실제 질의 미기록: 세션 일치만, 인과 확정 금지. 기존 held-out 불변, 정확도 개선 주장에는 새 사전 등록 필요.
- 가격 배율은 Claude의 2026-10-18 공식 문서 확인 기록(C-1/C-2), 비전 축소는 2026-10-15 기록(C-3). 이번 작업의 신규 웹 검증으로 표현하지 않는다.
- 연구 sharp 출력 프로필은 목표이며 제품 jpeg-js probe로 적합성을 대신 입증하지 않는다. 제품 crop 도구는 실험 평가 대상이 아니다.

## V장 삭제·축약 목록
기준 `eaf7542:docs/research/image-first-paper-draft.ko.md`의 아래 문단을 V 요약과 기존 프로토콜/신규 결과 부록으로 연결했다. 실험 규칙을 바꾼 것이 아니다.
- L180 “파일럿은 12개…”: 파일럿·후보 데이터·strata 장문 → 사전 등록 held-out 설명.
- L187 “clean 조건은…” 및 입력 recipe 표: 미정 치수·크기 gate → 조건 요약과 프로토콜.
- L200 “downscale-only와 combined…”: stress 순서·파생 경로 미정 → 프로토콜/확정값 참조.
- L206 “quality 50과…”: stress 승인·guard 공동 freeze 절차 → 동결 설계/개정 1 참조.
- L215 “치수 범위에 대한…”: JPEG accounting 산술 한계 → 프로토콜 참조.
- L219 “고정된 모델과…”: arm·oracle·full-frame 분기 상세 → arm 요약 및 부록.
- L235 “D의 첫 호출…”과 L237 “D에서 첫 응답…”: 독립 호출·응답 선택·비용 상세 → D 정의·합산 요약.
- L239 “resize 단계의…”: identity와 재인코딩 도출 → 프로토콜 참조.
- L247 “탐색용 36 family…”: 계획 slot·오류·not_started·gate 장문 → 실행 결과 부록.
- L255 “분석은…” 및 L260 “primary metric은…”: 미정 margin·분모 설명 → 현행 H1/기술 H2·H3와 재요청 결과.
- L269 “D−C의 해석에는…”: 변환·독립 호출 해석 경계 → 프로토콜 참조.

## I–IV장 삭제·축약 목록(D-1 가)
기준 `eaf7542:docs/research/image-first-paper-draft.ko.md`. I 링크·비주장, II 비교표, IV 회계 요약은 복원하고 아래 상세는 축약한다. 기존 문서로의 참조이며 해당 문서를 이번에 수정하지 않는다.
- I L19 “에이전트 세션에는…”·L21 “이미지 입력은…”: 선행 구조·벤치마크 장문 → I 요약과 II 비교표.
- I L27 “본 제안의 목표는…”: 재요청 절차 → III.2/V; 소프트웨어 기록과 시각적 손상 구분은 I에 압축 복원, 상세 예시·정보 손실 경계는 III.2/결과 부록과 기준 커밋.
- I L35 “범위는 텍스트와…”: M1a 프로필·미제공 기능 목록 → 입력 계약; 제품 crop/OCR 경계는 I/III.1. 구식 “이미지 변환기 미제공”은 복원하지 않음.
- II L60 “DocVQA는…”·L68 “QuietPrune은…”·L76 “LLMLingua는…”: 개별 벤치마크·내부 토큰·압축 설명 → II 요약/비교표, 상세는 기준 커밋.
- II L80 “DTOC는…”·L82 “Screenshots or Tools?는…”·L96 “파일 바이트나…”: 세션 기법 상세·회계 구분 → II 비교표, III.3/IV; 2.1–2.5 절 구조는 미복원.
- III L102 “세션에는…”·L104 “텍스트 발췌…”·L106 “이미지 확장…”·L108 “compact 요약에는…”: 필드·인터페이스 장문 → III.1, 동결 도구 조건은 VI/실험 3 프로토콜.
- III L112 “한 요청은…”·L118 “파일럿에서…”: 입력 경계·preset/PNG/identity 상세 → III.2와 평가 프로토콜; 선택기·버전·동결 커밋은 확정값 유지.
- III L130 “response guard는…”·L132 “full original과…”·L135 “response guard는…”·L137 “승인된…”: guard·원본·동결 절차 → III.2/V와 평가 프로토콜.
- III L141 “선택기와 response guard의…”: manifest 항목·경로·원본 보존 → 평가 프로토콜 manifest 절; 본문 III.3은 요약만 유지.
- III L148 “파일 바이트 감소는…”: 계측 상세 → III.3/평가 프로토콜; 비용 절감 비전제는 C4/VI/VIII의 부정적 결과로 명시.
- IV L155 “공식 문서의…”·L161 “모델 ID / 설정” 표·L171 “gemini-3.8-flash의…”·L176 “실험 1은…”: 예제 표·거부 상한 상세 → IV 요약과 계산 예제 링크; 실행 계획형 문장은 실측 결과로 갱신.

## 검증 및 분량
- 직접 대조: 수치 대조표와 양 공급자 원 analysis/summary/README, 캐시 확인 기록, bench-001/002, 그림 README.
- `git diff --check`: 통과. 프로토콜 diff +1/−0; 변경 범위 5개 Markdown. 상대 링크·그림 경로 확인.
- 참고문헌 §1 텍스트 일치(줄바꿈만 정규화), C2·C3 원문 일치 확인.
- 2026-10-21 수정 검증: 결과 표 원문 불변, 상대 링크 54개 존재, 참고문헌 26개([1]–[24] 불변·[25]–[26] §2 일치), C2/C3 일치. II 표 포함 810/1270자 등 모든 장 상한 충족; PR 본문에 실제 길이 갱신.
- PR 생성 후 `git diff eaf7542..HEAD --check` 통과; 변경 5개 Markdown, 프로토콜 +1/−0, PR head와 push 일치. 실제 HWP 조판은 미수행.
- RED/GREEN: 문서 전용이므로 테스트 TDD 해당 없음. 산출 전 수치·범위·원문 보존을 수락 기준으로 정하고 직접 대조했다.
- npm gate·새 검증 스크립트·실험 재실행: Tier D 요청에 따라 수행하지 않음.
- 8면 예산의 장별 상한을 적용한다. 수정 초록·추가 참고문헌의 실제 면수는 HWP 조판 뒤 확인한다.
- 산문 상한(공백 포함): I 2550/II 1270/III 3190/IV 1220/V 1200/VI 3160/VII 890/VIII 380. VI 표 3 전단 약 .25면 반영해 기본3440에서280 차감.
- 장별 실제 길이와 집계 기준은 PR 본문에 병기(IV 산문 664자/raw 975자, II raw 956자). R5의 8.2면 적합성은 HWP 조판 뒤 확인하며 이번 작업에서 입증하지 않음.

## 검토
- Claude Code(사용자 제공), 계획, 조건부 승인: Major 2 / Minor 4; M1 분량 척도·M2 VII 제한·m1 참고문헌·m2 수치 표현·m3 표 예산·m4 번호 보존 반영.
- Claude Code(사용자 제공), PR afb5104 검토, Request changes: Major 2 / Minor 3 / Nit 2; 7건 반영, abdaade 재검토에서 해소 확인.
- Claude Code(사용자 제공), abdaade 재검토, Approve: Minor 1 / Nit 2; 표 번호·IV 문단 순서·I 문단 합치기는 승인 범위에서 반영 후 직접 검증.
- 구현: Luna 초안 뒤 사용량 한도; Claude Code `claude-opus-5-5` 대체 호출 성공. 샌드박스 연결 거부 후 승인 경로 재시도, 독립 재검토로 산입하지 않음.
- 주 에이전트, Draft 전 직접 검토, 초안 오류 수정: H4 정의/출처 행/제품 경계/발췌 한계/메타데이터 설명 수정; 원 자료 변경 없음.
- 주 에이전트 직접 내용 검토: PASS WITH NOTES; 표·26개 참고문헌·C2/C3 불변, 해석·범위 보존. HWP 미실측이며 최종 원격 상태는 push 후 별도 확인. 별도 Astra 호출 없음.
- 재검토 수정 위임의 모델 자기보고가 지정 Luna와 불일치해 Luna 수행으로 확정하지 않음. `claude-opus-5-5` 대체 확인 성공·빈 줄 수정 반영; 독립 검토로 산입하지 않음.
- 2026-10-21 N-3·그림 정리 직접 검증: 첫 인용 [14]–[26] 순서, 원고 그림 첫 등장 1–4; 표·참고문헌·그림 경로·IV 후속 문장 불변, 부록 무수정. PR #49 검토 Approve 유지.
