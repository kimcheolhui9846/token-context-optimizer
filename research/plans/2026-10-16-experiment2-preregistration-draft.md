# 실험 2 held-out 사전 등록 초안

- 작성: Claude Code, 2026-10-16. 상태: **초안(사용자 승인 전)**
- 확정하려면 다음이 필요하다.
  1. 사용자 승인
  2. Codex Task 34(guard → 응답 기반 fallback 문서 개정) merge
  3. 분석 스크립트(`src/exp2-analyze.mjs`)를 동결하고, 그 커밋 해시와 held-out 생성물 해시를 이 문서에 적는다.
- 근거
  - 평가 프로토콜 §2–§7
  - 실험 2 계획(사용자 결정 D1–D6)
  - calibration 결과 `../results/exp2-cal-gpt4o/README.md`

## 1. 질문과 가설

RQ2: 단일 질의에서 질문에 맞춘 영역 선택과 보수적 원본 fallback(D)은 정확도와 청구 입력 토큰을 어떻게 바꾸는가?

| 가설 | 비교(family 짝, 네 조건 평균) | 판정 기준(사전 고정) | 근거 |
|---|---|---|---|
| H1(primary) | D−C | 95% CI 하한 > 0 | 프로토콜 §3 primary 대비 |
| H2 | D−A | 95% CI 하한 > −5%p(비열등), **그리고** D의 평균 입력 토큰 < A | 실험 3 H1과 같은 margin. 논문 질문("정확도를 지키며 줄이는가") |
| H3 | C−B | 기술 통계만(판정 없음) | 프로토콜 §3 secondary. 선택만의 효과 |

- 프로토콜 §7은 "power와 non-inferiority margin을 사전 등록하지 않은 상태에서" 비열등을 주장하지 않는다고 했다. 이 문서가 margin을 등록하므로 H2는 프로토콜과 충돌하지 않는다. 사용자 승인이 필요하다.
- calibration(n=12) 참고값
  - GPT-4o: D−C +10.4 [0.0, 25.0], D−A +6.3 [0.0, 18.8]
  - Haiku: D−C +8.3 [−2.1, 20.8], D−A −2.1 [−14.6, 10.4]
  - held-out(n=36)은 구간이 약 √3배 좁다.

## 2. 데이터

- held-out 36 family = 6 템플릿 × 6. 템플릿마다 기존 레이아웃 3과 v2 레이아웃 3이다.
- seed 9000–9505. family당 질문 1개, 입력 조건 4개(clean, JPEG-only q50, downscale-only 1024, combined)
- 생성물 해시(확정 때 재확인): `slots.json` `9fe6350b4d89a33d…`, `families.json` `71e2648f738d7094…`
- v2 레이아웃은 실험 3 held-out에서 모델에 노출됐다. selector는 그 뒤 바꾸지 않았다. 결과는 레이아웃별로도 보고한다(D3).

## 3. 조건과 고정 설계

- arm A–E는 프로토콜 §3을 따른다. 출력 변환은 긴 변 1536 이하, JPEG q75다.
- C: 질의 인식 창 selector(파일럿 동결판). 창이 없으면 B와 같은 전체 축소
- D: no-window면 원본, C가 UNREADABLE이면 원본 재요청, 그 밖에는 C
  - 원본 재요청은 같은 slot의 A 응답을 재사용하고, 비용은 실제 쓰인 호출의 합으로 계상한다(D4).
- 모델: `gpt-4o-2024-11-20`(detail high, 주), `claude-haiku-4-5-20251001`(보조). temperature 0, max_tokens 40. 시스템 프롬프트는 calibration과 같다.
- 하네스 커밋: `<확정 시 기입>`

## 4. 지표와 분석

- 주 지표: content-match QA 성공(정답 문자열이 답 안에 있음). 채점은 `summarize.mjs`의 `normalize`와 `contentCorrect`다.
- 분석 단위는 source family(36)다. family마다 arm 점수를 네 조건 평균으로 만든 뒤 짝 차이를 계산한다.
- bootstrap: family 단위 10,000회, seed 20261016, percentile 95%
- 보조 지표(기술 통계)
  - 조건별 정확도와 짝 차이
  - 평균 입력 토큰·비용
  - D fallback rate(no-window, unreadable, 분모 D 배정 slot 144·조건별 36)
  - 창 일치·근거 덮음
  - 레이아웃별·영역별·small-text별 결과
- 실패·timeout은 오답으로 센다. 실행하지 않은 slot은 `not_started`로 따로 보고한다.
- 사전 등록한 관찰 항목: GPT-4o의 UNREADABLE 응답 수. calibration에서는 0이었다.

## 5. 하지 않는 것

- held-out 결과를 보고 selector·guard·채점·margin을 바꾸기
- slot이나 family 제외
- 결과가 나쁜 조건을 빼고 보고하기

## 6. 예산

- GPT-4o 상한 $1.37, Haiku 상한 $0.70(dry-run)
- 실행별 예산 가드 $20

## 7. 사용자 결정 (D7)

- 위 H1–H3 형식(판정 기준 사전 등록)으로 할지, 프로토콜 원문대로 탐색적 추정(CI만 보고, 판정 없음)으로 할지
- 권장: **H1–H3 형식**. 실험 3과 같은 틀이라 논문에서 RQ2·RQ3을 같은 방식으로 보고할 수 있다.
