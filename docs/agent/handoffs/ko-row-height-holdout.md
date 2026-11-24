# 인계: ko-row-height-holdout (오른쪽으로 넓힌 창 W1의 세로 범위를 선택 줄 근처로 제한하는 W2, 새 한국어 12원본 × 4배치)

- 날짜: 2026-11-24 · Task: Orca task_cb0c6ae4c956 · Tier E · #150 후속(사용자 승인)
- 작업자: Claude Code(Opus 5.5, 연구 작성자) · 마일스톤·최종 판정과 별도 클론 검증: Codex Astra(PM), 독립 Opus 검토(PM 배정)
- 브랜치 `claude/ko-row-height-holdout`, 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. #147 `c0c2f5dd…`, #148 `2ab9ed14…`, #149 `fd7ba06e…`, #150 `b108e2f0…`는 Git 객체로만 읽는다.
- 프로토콜: `research/plans/2026-11-24-ko-row-height-protocol.md`. 검산 명세: `research/tools/ko-row-height/RECOUNT_SPEC.md`.

## 상태

- 등록 커밋(프로토콜, 생성기, 검산 명세·결과 스키마, 손계산 경계 예제, JS·Python 시험 RED). 구현·자료·OCR·채점은 아직 없다.
- 등록 전 확인: 설치 글꼴 SHA-256 = 등록값, 생성기 설계 검사 문제 0·두 번 실행 바이트 동일(저장소 밖 임시 폴더, PNG 미생성), 연구 의존성 `npm ci --ignore-scripts`, 언어 파일 두 개 SHA-256 일치(#148 작업 트리 캐시에서 복사).

## 커밋 순서

| 커밋 | 내용 |
|---|---|
| (이 커밋) | 사전등록 |
