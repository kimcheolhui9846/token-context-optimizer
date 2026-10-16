# 실험 2(RQ2, 단일 질의) 본 실험 계획

- 작성: Claude Code, 2026-10-16. 상태: **초안, 사용자 결정 대기**
- 근거
  - 평가 프로토콜 `docs/research/image-first-evaluation-protocol.md`(main), 결정 메모 17개 값
  - 사용자 결정: guard는 응답 기반 fallback(2026-10-14). 문서 반영은 Codex Task 34
- 지금까지 RQ2 근거는 개발용 파일럿(pilot-002, pilot-003, pilot-003-haiku)뿐이다. RQ1은 회계 실측, RQ3은 사전 등록 held-out을 마쳤다.

## 1. 프로토콜과 하네스 대응

| 프로토콜 요구 | 현재 하네스 | 이번 조치 |
|---|---|---|
| calibration 12, held-out 36 family, 문서·차트·UI 같은 수(§2) | 개발 세트만 있음(dev1–3) | `families-exp2.mjs`: calibration 12(영역당 4), held-out 36(영역당 12) |
| family당 질문 1개(§5) | 템플릿당 질문 3개 | 템플릿 인스턴스마다 q1→q2→q3 순환으로 1개만 생성 |
| 영역마다 small-text stress stratum(§2) | 질문에 `smallText` 표시 | 순환 결과 small-text 문항 수: calibration 영역당 2 / held-out 문서 4, 차트 6, UI 8 |
| clean: RGB PNG, 1536 < L ≤ 2528, 기준 2048(§2) | 템플릿이 2048×1536 / 1536×2048 생성, 검사 통과 | 그대로 사용(결정 D2) |
| 입력 조건 4개: clean, JPEG-only q50, downscale-only 1024, combined(§2) | `transforms.mjs`의 `CONDITIONS` | 그대로 |
| arm A–E(§3), 출력 변환 1536/q75 | A·B·E 있음. C1(창 selector) 있음 | exp2 세트에서 창 selector를 **C**로 부른다(no-match면 B와 같은 전체 축소) |
| D = 같은 selection + guard + 원본 fallback(§3–§4). OCR 실패면 원본(§4) | pilot-003 C1R은 UNREADABLE만 재요청, no-match는 B | **D를 새로 정의**: no-window면 원본(A, C 호출 없음), C가 UNREADABLE이면 원본 재요청(A), 나머지는 C. 비용은 실제 쓰인 호출의 합 |
| primary D−C, secondary C−B·D−A, family 단위 paired(§3, §7) | `summarize.mjs`의 조건별 D−C | 사전 등록 분석 스크립트는 calibration 뒤 작성 |
| 모델별 provider 설정 고정(§3) | GPT-4o detail high, Haiku 기본(축소) | 그대로(결정 D1) |
| held-out 720 planned calls = 36 × 1 × 4 × 5(§5) | — | 실제 호출은 A·B·C·E 576개. D는 A·C에서 파생하므로 추가 호출이 없다. 분모 720은 그대로 보고 |
| OCR 엔진·버전 고정(§4) | tesseract.js(`package-lock.json` 고정) | manifest에 버전 기록 |
| fallback rate 정의(§7) | — | 분자: D가 fallback한 slot. 분모: D 배정 slot(held-out 144, 조건별 36) |

## 2. 생성 결과 (2026-10-16, 모델 호출 없음)

- 생성은 어떤 모델에도 보내지 않았다.

| 세트 | family | slot(A·B·C·E) | seed | 비고 |
|---|---|---|---|---|
| calibration | 12 | 192 | 8000–8501 | C 창 일치 33/48, 일치 중 근거 덮음 25 |
| held-out | 36 | 576 | 9000–9505 | 템플릿마다 base 3 + v2 3. C 창 일치 98/144(base 50/72, v2 48/72), 일치 중 근거 덮음 68 |

## 3. 비용 (dry-run 상한)

| 세트 | GPT-4o | Haiku 4.5 |
|---|---|---|
| calibration 192 slot | $0.46 | $0.23 |
| held-out 576 slot | $1.37 | $0.70 |

합계 상한 $2.76이다. 실행별 예산 가드는 $20이다.

- 생성물 해시(재생성 확인용, 사전 등록 때 확정): held-out `slots.json` `9fe6350b4d89a33d…`, `families.json` `71e2648f738d7094…`, calibration `slots.json` `1d906d357e3ad2eb…`
- 관찰(생성 단계, 모델 호출 없음): 창 selector가 근거 상자를 덮지 못하는 일치 사례가 held-out에서 30/98이다. C는 이 slot에서 조용히 틀리거나 UNREADABLE로 답할 수 있다. D의 응답 기반 fallback은 UNREADABLE인 경우만 구한다. selector는 파일럿 때 동결한 그대로이며 바꾸지 않는다(D6).

## 4. 사용자 결정 항목

| # | 항목 | 선택지 | 권장 |
|---|---|---|---|
| D1 | 모델 | GPT-4o 주, Haiku 4.5 보조 / GPT-4o만 | **두 모델**. 실험 3과 같은 구성이고, RQ1에서 공급자 차이가 컸다 |
| D2 | clean 치수 | 템플릿 기본 2048×1536·1536×2048 / 다른 치수 추가 | **템플릿 기본**. 프로토콜 기준값 2048이고 파일럿과 비교할 수 있다 |
| D3 | held-out 레이아웃 | 템플릿당 base 3 + v2 3 / 새 v3 레이아웃 제작 | **base+v2**. 단 v2 레이아웃은 실험 3 held-out에서 모델에 노출됐다. selector는 그 뒤 조정하지 않았다. 이 점을 보고한다. v3는 반나절이 더 든다 |
| D4 | D의 fallback 호출 | A 응답 재사용(파생) / 실제로 다시 호출 | **파생**. fallback 입력이 A와 같은 이미지·질문·모델이다. 비용은 A 호출로 계상한다. pilot-003과 같은 방식이고 비결정성이 섞이지 않는다 |
| D5 | stress 값(q50/1024) 검증 기준 | 프로토콜이 "실행 전 사용자 결정"으로 남겼다 | **형식 검증만**: 치수 부등식, 목표 프로필, accounting 상한. calibration 정확도로 값을 바꾸지 않는다. A의 조건별 정확도는 기술 통계로만 보고한다 |
| D6 | calibration에서 조정할 것 | 창 selector와 응답 fallback 규칙에는 조정할 수치가 없다 | **조정 없음**. calibration은 실행·비용·채점 점검과 사전 등록 설계에만 쓴다 |
| D7 | 가설 형식 | 프로토콜대로 탐색적 추정(CI만) / 실험 3처럼 판정 기준 사전 등록 | calibration 뒤 사전 등록 초안에서 제안한다 |

## 5. 순서

1. 이 계획 승인(D1–D6)과 calibration 비용 승인(약 $0.7)
2. calibration 실행 → 채점·비용·fallback 점검 → 사전 등록 초안(D7 포함)
3. 사용자 사전 등록 승인. 아래 둘이 끝난 뒤 held-out을 실행한다.
   - Task 34(guard 문서 개정) merge
   - PR #35 검토에서 하네스 관련 지적 정리
4. held-out 결과는 사전 등록 분석으로 판정한다. 결과 반영은 별도 Codex 문서 Task로 한다.

## 6. 사용자 결정 (2026-10-16)

- D1–D6을 §4 권장안대로 승인했다.
  - D1 두 모델
  - D2 템플릿 기본 치수
  - D3 base+v2(v2 노출 사실 보고)
  - D4 D의 fallback은 A 응답 재사용
  - D5 stress 값은 형식 검증만
  - D6 calibration에서 조정 없음
- calibration 실행 비용(상한 $0.69)을 승인했다. D7(가설 형식)은 calibration 뒤 사전 등록 초안에서 제안한다.
