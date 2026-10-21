# Task 38 — 실험 2·3 결과 부록과 논문 반영

- 등급: 요청서 특별 규칙 D + Astra. Claude 계획 1회, Draft PR 뒤 Claude PR 검토 1회, 주 에이전트 최종 검토.
- 기준: main `eaf754296aff790dd73289313c2057cf8ea6357c`(PR #49 merge).
- 브랜치: `codex/task-38-heldout-results`; worktree `.artifacts/worktrees/task-38-heldout-results`.
- 현재 상태: [Draft PR #51](https://github.com/kimcheolhui9846/token-context-optimizer/pull/51) 제출·push·제출 후 문서 검증 완료. Claude PR 검토와 그 뒤 최종 검토는 대기.
- 사용자 승인: P1–P5 모두 2026-10-20 권장안 승인(전달문 25행 및 사용자 재확인). 추가 계획 승인 불필요.
- P1 파일명 `2026-10-16-experiment2-results.md`; P2 compact 보완 주장과 13.9%→81.9%; P3 결과 표 2개/그림 1·2·3·5; P4 스킬 본문 미언급; P5 제품 crop과 연구 OCR 평가 구분.
- 범위: 두 결과 부록, 원고, 실험 3 프로토콜 결과 링크 한 줄, 이 핸드오프의 5개 Markdown 파일만.
- 금지: research/, codex_review/, 나머지 docs/research/, 제품 코드·테스트·설정·패키지 수정, 그림 수정, 수치 재계산, 실험 호출, 루트 HANDOFF 커밋.

## 승인 계획 및 구현
- [x] PR #49 merge main 기준으로 fast-forward, P1–P5와 Claude M2/m4 반영.
- [x] 실험 2: 현행 개정 1 H1(D−A), 기술 H2/H3, arm·조건·레이아웃·재요청·D′ 탐색·이탈 없음·한계.
- [x] 실험 3: H1–H4, S0–S4 정확도·회상·토큰·정가/캐시, 레이아웃 CI, 탐색 오류·이탈 1·재현·한계.
- [x] 원고: compact 보완 주장, C2·C3 원문 유지, C4 부정적 결과, 연구·제품 경계, V 요약, VI 결과, VII 세 한계와 발췌 문단.
- [x] VI 이관 7개: 프로토콜 링크/역사적 번들/가설 기준/세션 제외 금지/영역 미발견 분기/재요청 이미지 대상/기준 seed.
- [x] T1 정확도·차이·CI 소수 한 자리, T2 정수 31%와 원값, T3 그림 4개/결과 표 2개. 그림 4는 표 2 비용 패널, 그림 6은 조건별 부록 표.
- [x] 참고문헌: main IEEE 정리본 §1 [1]–[24] 그대로 복사; [1] DS 학회판·[11] 장소 포함. 가격 URL은 인라인.
- [x] 실험 3 프로토콜은 결과 링크 한 줄만 추가; 부록에서 역링크.
- [x] 구현 `f14d190`(Agent: codex) → push → Draft PR #51(base main) → 제출 후 로컬 문서 확인.
- [ ] 사용자 Claude PR 검토 반영 → 주 에이전트 최종 검토. Ready·merge·다음 Task는 별도 승인.

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

## 검증 및 분량
- 직접 대조: 수치 대조표와 양 공급자 원 analysis/summary/README, 캐시 확인 기록, bench-001/002, 그림 README.
- `git diff --check`: 통과. 프로토콜 diff +1/−0; 변경 범위 5개 Markdown. 상대 링크·그림 경로 확인.
- 참고문헌 §1 텍스트 일치(줄바꿈만 정규화), C2·C3 원문 일치 확인.
- 2026-10-21 재개: 수치·출처 재대조, 상대 링크 52개 존재, 참고문헌 24개·C2/C3 일치, 장별 글자 수 PR 본문과 일치. staged 검사에서 발견한 E2 부록 EOF 빈 줄을 제거한 뒤 재검증 통과.
- PR 생성 후 `git diff eaf7542..HEAD --check` 통과; 변경 5개 Markdown, 프로토콜 +1/−0, PR head와 push 일치. 실제 HWP 조판은 미수행.
- RED/GREEN: 문서 전용이므로 테스트 TDD 해당 없음. 산출 전 수치·범위·원문 보존을 수락 기준으로 정하고 직접 대조했다.
- npm gate·새 검증 스크립트·실험 재실행: Tier D 요청에 따라 수행하지 않음.
- 8면 예산: 머리 .5/I 1/II .5/III 1.25/IV .75/V .75/VI 1.75/VII .35/VIII .15/참고문헌 1.
- 산문 상한(공백 포함): I 2550/II 1270/III 3190/IV 1220/V 1200/VI 3160/VII 890/VIII 380. VI 표 2 전단 약 .25면 반영해 기본3440에서280 차감.
- 장별 실제 길이와 집계 기준은 PR 본문에 병기. 실제 8면 적합성은 HWP 조판 뒤 확인하며 이번 작업에서 입증하지 않음.

## 검토
- Claude Code(사용자 제공), 계획, 조건부 승인: Major 2 / Minor 4; M1 분량 척도·M2 VII 제한·m1 참고문헌·m2 수치 표현·m3 표 예산·m4 번호 보존 반영.
- Claude Code, PR 검토, 미수행: Draft PR 전달 뒤 사용자 검토 파일 대기.
- 주 에이전트, Draft 전 직접 검토, 초안 오류 수정: H4 정의/출처 행/제품 경계/발췌 한계/메타데이터 설명 수정; 원 자료 변경 없음.
- Astra 최종 검토: Claude PR 검토 이후 수행 예정. 별도 Astra 에이전트 호출 없음.
- PR #49 읽기 전용 교차 검토: Approve, blocker/major 0; 분량 설명 Nit는 merge본에서 해소. 입력은 최신 main §1과 분량 예산.
