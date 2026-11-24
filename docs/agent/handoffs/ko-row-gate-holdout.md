# 인계: ko-row-gate-holdout (질문 유형과 OCR 같은 행 답 후보의 유일성으로 W2 적용 여부를 정하는 W3, 새 한국어 12원본 × 4배치)

- 날짜: 2026-11-24 · Task: Orca task_d30e1dc8fb85 · Tier E · #151 후속(사용자 승인)
- 작업자: Claude Code(Opus 5.5, 연구 작성자) · 마일스톤·최종 판정: Codex Astra(PM, 최초 계획자), 독립 Opus 검토(PM 배정)
- 브랜치 `claude/ko-row-gate-holdout`. 기준 main `0fb30531aabaa9f55b8c9fdc34ee9d03042936c1`. #147 `c0c2f5dd…`, #148 `2ab9ed14…`, #149 `fd7ba06e…`, #150 `b108e2f0…`, #151 `d75f5455…`는 Git 객체로만 읽는다.
- 프로토콜: `research/plans/2026-11-24-ko-row-gate-protocol.md`. 검산 명세: `research/tools/ko-row-gate/RECOUNT_SPEC.md`. 손계산 예제: `research/tools/ko-row-gate/example/example.json`.

## 상태

사전등록(등록 커밋) 단계. 생성기·질문·값·4배치·W3 규칙·결과 스키마·손계산 예제·RED 시험·독립 검산 명세를 고정했다. 구현·자료·OCR·채점은 아직 없다. 이 문서는 단계마다 갱신한다.

## 등록 단계에서 확인한 것

- 고정 핀 5종(#147 lib·run, K0 선택기, #150 W1, #151 W2)과 렌더러의 blob·SHA-256이 사용자 핀 파일과 같다.
- 생성기 `design.py --font`(PNG 없이 글꼴 측정): 문제 0, 두 번 실행 바이트 동일.
- 손계산 파이프라인 예제 2건의 W1·W2 값이 고정 #150·#151 blob 실행 결과와 같다(저장소 밖 임시 폴더).

## 알려진 한계 (등록 시점)

- 검산 작성자 = 구현자(하위 에이전트 금지). 명세 오독이 양쪽에 같이 들어갈 위험이 남는다.
- 질문 유형 단서는 부분 문자열이라 일반 질문의 "몇 시간"도 time이 된다(이 자료 12개 질문에는 해당 없음).
- 이상적 인식이면 below-same 12쪽에서 W3가 의도된 방해 값을 유일 후보로 보고 W2를 적용해 답을 잃는다(설계상 반례, 프로토콜 3.4절).
- 고정 W1이 모든 OCR 단어 상자를 검사하므로, 실제 파이프라인에서 비정상 상자(null 등)는 W3 전에 검증 실패가 된다. W3의 무효 단어 분기(`no_valid_hit_word` 포함)는 손계산 예제로만 시험한다. 고정 W2가 `widened` 쪽의 0 크기 히트를 검증 실패로 처리하므로 `no_valid_hit_word`는 실제 자료에서 나올 수 없다.
