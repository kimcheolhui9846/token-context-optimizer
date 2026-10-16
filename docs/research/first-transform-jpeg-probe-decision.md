# 첫 변환 연산 결정 메모와 JPEG encoder probe

이 메모는 첫 제품 연산의 선택 근거와 2026-10-15 사용자 결정을 기록한다. 첫 연산은 crop + q75 encode이며 X4·X8·resize 범위는 §5에 정리한다. 제품 변환 API를 추가하지 않으며 기존 17개 결정값은 바꾸지 않는다.

## 1. 고정 설계와 근거 읽기

행 번호는 base `b83c91dc9cd063a9876b98eedcbda9726cf1544a` 기준이다. 표의 필요 연산은 설계상 능력 요구이며 구현 호출 횟수나 측정된 효과가 아니다. ingest의 검증 decode와 변환용 pixel decode도 구별한다.

- [프로토콜](image-first-evaluation-protocol.md) L44–59: clean은 손실 이력 없는 RGB PNG 원천 그대로, 긴 변 `1536 < L <= 2528`, 기준 2048이다. 정확 치수·family 배정은 미정이다.
- 같은 프로토콜 L71–84, L88–97: stress 1024/q50은 잠정값이며 arm 1536/q75와 다르다. 사용자 승인으로만 값을 바꾸고 stress 먼저 고정 → guard 조정 → held-out 전 공동 freeze를 유지한다.
- [기존 결정 메모](image-protocol-decision-memo.md) L626–637: 선택은 F1, K-n, ⟨rc, same, same, out⟩, T/Q 모두 NN이다. B는 crop하지 않으며 모든 변환 arm의 최종 출력은 q75 P-in JPEG다. A와 D fallback은 예외다.
- P-in은 `jpeg-ycbcr8-baseline-444-v1`이다. PNG canonical 이름은 arm 출력에서 비활성이지만 downscale-only 준비의 PNG encode 필요와는 별개다.

## 2. 조건 준비에 필요한 연산

| 조건 | pixel decode | crop | resize 1024 | resize 1536 | JPEG q50 | JPEG q75 | PNG encode | base 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clean | 변환 decode 없음: 원천 파일 그대로 | 없음 | 없음 | 없음 | 없음 | 없음 | 없음 | 프로토콜 L44–59; 결정 메모 L629 |
| JPEG-only | PNG→raw 필요; 이미 raw 보유 시 재decode 여부는 구현 선택 | 없음 | 없음 | 없음 | 필요 | 없음 | 없음 | 프로토콜 L57, L71–84; 결정 메모 L629 |
| downscale-only | PNG→raw 필요 | 없음 | 필요 | 없음 | 없음 | 없음 | 필요, RGB | 프로토콜 L58, L63–64; 결정 메모 L629 |
| combined | PNG→raw 필요 | 없음 | 필요 | 없음 | 필요 | 없음 | 없음 | 프로토콜 L59, L62–64; 결정 메모 L629 |

combined를 clean에서 직접 파생한다는 것은 기존 집계 가정이다. 실제 파생 경로를 이번에 새로 확정하지 않는다. 준비 단계의 resize는 clean 하한 때문에 실제 치수를 줄인다. 이 표는 준비 구현이나 합성 평가 corpus를 생성했다는 뜻이 아니다.

## 3. arm 경로 × 배정 조건

표의 약어: `P` = PNG pixel decode, `J` = JPEG pixel decode, `S` = selector 영역 처리(crop 선택 시 crop), `E` = oracle crop, `R` = 긴 변 1536으로 실제 축소, `R?` = crop 결과가 1536 초과일 때 축소, `I` = 1536 resize 단계 identity, `Q` = q75 JPEG encode. `S/E`의 full-frame 실행 정책은 X4 미정이다. 표에서 생략한 **resize 1024·q50 encode·PNG encode는 모든 arm 경로에 불필요**하다. 이 셋은 §2의 준비 연산이다.

| arm 경로 | clean (PNG) | JPEG-only (JPEG) | downscale-only (PNG) | combined (JPEG) | base 근거 |
| --- | --- | --- | --- | --- | --- |
| A | 배정 bytes 그대로; 변환 decode/crop/resize/encode 없음 | 배정 bytes 그대로 | 배정 bytes 그대로 | 배정 bytes 그대로 | 프로토콜 L101–110, L131–140; 결정 메모 L630 |
| B | P → R → Q; crop 없음 | J → R → Q; crop 없음 | P → I → Q; crop 없음 | J → I → Q; crop 없음 | 프로토콜 L105, L118–140; 결정 메모 L630–631 |
| C | P → S → R? → Q | J → S → R? → Q | P → S → I → Q | J → S → I → Q | 프로토콜 L106, L118–140; 결정 메모 L630–631 |
| D-transform | P → S → R? → Q | J → S → R? → Q | P → S → I → Q | J → S → I → Q | 프로토콜 L107, L118–140; 결정 메모 L630–632 |
| D-fallback | 배정 bytes 그대로; 최종 전달 변환 없음 | 배정 bytes 그대로 | 배정 bytes 그대로 | 배정 bytes 그대로 | 프로토콜 L101–107; 결정 메모 L630, L632 |
| E | P → E → R? → Q | J → E → R? → Q | P → E → I → Q | J → E → I → Q | 프로토콜 L108–110, L131–140; 결정 메모 L630–631 |

D 두 행은 base의 호출 전 artifact guard 정의다. **Task 34에서 응답 기반 fallback으로 개정 예정**이며 이 메모에서는 개정하지 않는다. 재요청은 배정 원본을 보내므로 새 변환 연산을 추가하지 않는다. 모델 응답을 MCP 도구가 어떻게 볼지는 후속 설계 사항이다.

D-fallback 행은 최종 전달 경로다. 거부 전에 candidate를 계산했을 수 있으므로 D 전체의 계산량이 0이라는 뜻이 아니다. A와 fallback에 hidden clean 접근은 없다. E annotation은 production selection에 공개하지 않는다.

DO/CB의 I는 resize 단계만의 identity다. q75 재인코딩을 생략하지 않으며 출력 bytes 동일 여부는 이 표로 판단할 수 없다. clean/JO에서 B는 실제 축소하고 C/D/E는 crop 결과 치수에 따른다. `crop → 1536 → q75`라는 처리 순서와 아래 구현 우선순위는 다르다. D−C 입력 선택 차이는 fallback slot에서만 가능하다는 필요조건이며 충분조건이 아니다. 수락 slot의 동일 artifact 사용도 미검증이다(프로토콜 L209–214).

## 4. 첫 연산 후보: 커버리지와 효과를 함께 비교

| 후보 | 경로 커버리지·선행 조건 | 청구 토큰·정확도 영향과 한계 |
| --- | --- | --- |
| JPEG encode 적합성 → resize → crop | q50은 JO/CB 준비, q75는 B/C/D-transform/E 출력에 공통이다. codec 적합성 위험을 먼저 확인한다. encoder만으로 네 조건의 arm 전체를 완성하지 못한다 | 같은 치수의 JPEG 재인코딩에는 GPT-4o 타일 회계상 quality 변수가 없다. 형식 요구 충족과 토큰 절감은 다르다. 정확도 개선 근거 없음 |
| crop 우선 | C/D-transform/E의 영역 처리에 필요하나 JPEG decode/encode가 별도로 필요하다. RGB PNG crop만으로 최종 JPEG arm을 만들 수 없다 | 제공된 개발 파일럿의 clean에서 oracle crop: content 정확도 100% 대 89%(+11%p), 평균 prompt tokens 418 대 825(약 −49%). OCR 창 selector + 응답 fallback: 같은 89%에서 616 대 825(약 −25%). 후자는 조합 효과이며 crop 단독 인과 효과가 아니다 |
| resize 우선 | DO/CB 준비와 arm cap에 필요하지만 X8과 구현 방식 선택이 선행한다 | 제공된 파일럿의 1536/1024 resize에서 GPT-4o 토큰 감소는 0%. Haiku 1024 resize 절감은 28px patch 회계에 따른 예측이며 미측정 |
| 모두 함께 구현 | 완결 경로에 빨리 접근할 수 있으나 검증 범위와 원인 분리 부담이 커진다 | 효과를 측정하지 않았으며 큰 구현 범위가 효과 근거를 대신하지 않는다 |

기존 decoder와 encoder를 조합하면 JO 준비에 접근할 수 있다. X4가 identity resize를 pixel pass-through로 처리하도록 정해질 경우 B×DO/CB도 도달 가능한 셀이다. 이는 설계상 도출이며 제품 API의 pixel 재사용 계약과 writer/provenance 구현이 승인되었다는 뜻이 아니다. **JPEG encode → resize → crop은 커버리지에 따른 비교 후보였으며, 사용자는 §5에서 crop + q75 encode를 첫 경로로 선택했다.** resize는 첫 구현 범위에서 제외한다.

파일럿 근거는 사용자 제공 요약 및 Claude research PR #33의 고정 커밋 `d32f5ef22f78425f3fbd5d993ba6c881ff6c5157`에 있는 [pilot-001](https://github.com/kimcheolhui9846/token-context-optimizer/blob/d32f5ef22f78425f3fbd5d993ba6c881ff6c5157/research/results/pilot-001/README.md), [pilot-002](https://github.com/kimcheolhui9846/token-context-optimizer/blob/d32f5ef22f78425f3fbd5d993ba6c881ff6c5157/research/results/pilot-002/README.md), [pilot-003](https://github.com/kimcheolhui9846/token-context-optimizer/blob/d32f5ef22f78425f3fbd5d993ba6c881ff6c5157/research/results/pilot-003/README.md)다. PR #33은 미merge여서 승인된 R-1(a) 예외로 상대 링크 대신 고정 커밋을 인용한다. merge 후 이 파일을 갱신할 때 `../../research/results/` 상대 링크로 바꾼다.

이는 `gpt-4o-2024-11-20` 하나, 긴 변 2048 이하의 4:3·3:4 합성 이미지에서 얻은 개발용 탐색 관찰이다. calibration/held-out 본 평가가 아니며 다른 종횡비·모델·encoder로 일반화하지 않는다. pilot-003의 fallback 결과는 사전에 정한 규칙에 따라 같은 slot의 A 응답을 재사용한 파생 결과다. prompt tokens 감소율을 이미지 단독 토큰 측정과 혼합하지 않는다. Codex는 파일럿을 실행하거나 재현하지 않았다. PR #33의 예산·resume 보호 문제는 핸드오프에 별도로 보고하며 과거 답변 기록이 틀렸다고 단정하지 않는다. [비용 모델](image-token-cost-models.md) base L31, L54는 타일/patch 회계 근거이며 이번에 외부 조사를 하지 않았다.

## 5. 사용자 결정 (2026-10-15)

아래 결정은 후속 첫 제품 연산의 범위다. 이번 Task는 결정 기록과 probe 검증만 수행한다.

| 항목 | 선택지와 영향 | 사용자 결정 |
| --- | --- | --- |
| 첫 연산 순서 | §4 세 우선 후보 또는 동시 구현. 커버리지와 실제 효과 근거를 함께 고려 | crop + q75 encode |
| X4 full-frame crop | 원본 참조 no-op: 쓰기 감소·provenance 표현 필요 / 거부: 단순 계약·호출자 분기 / 재인코딩: 통일 경로·추가 쓰기와 bytes 변화 | 원본 참조를 돌려줌; 쓰기 없음 |
| X4 identity resize 및 candidate no-op | resize 단계 pixel pass-through 또는 명시적 재처리, 무변환 후보 허용/표현 여부. S-same을 자동 변경하지 않음 | resize를 구현하지 않으므로 identity resize는 해당 없음; full-frame은 위 정책 적용 |
| X8 resize 필터 | nearest: 단순·aliasing 위험 / bilinear: 비교적 단순·작은 글자 blur 가능 / area·bicubic 계열: 경계·계산량·품질 검증 부담 | 이번에는 구현하지 않음; 긴 변 1536 초과 crop 거부 |
| X8 반올림 | floor / nearest / ceil. 긴 변 cap·최소 1pixel·종횡비 오차·tie 규칙을 함께 확정해야 함 | resize 구현과 함께 보류 |
| resize 구현 방식 | 직접 구현: 규칙 통제·검증 부담 / 새 의존성: 라이선스·패키징·버전·자원 검토와 별도 승인 / 그 밖: 공개 계약·배포 경계 검토 | 이번에는 구현하지 않음; 긴 변 1536 초과 crop 거부 |

full-frame 원본 참조 반환은 위에서 선택한 no-op 정책이다. 실제 변환 crop 경로에서는 q50 JPEG 입력에도 **q75 재인코딩을 생략하지 않는다**. 이 첫 제품 연산의 정책이 §3의 기존 평가 arm 계약을 자동으로 개정하지는 않는다. 후보의 필터별 품질 효과는 측정하지 않았으며 이번 Task에서는 새 의존성이나 resize 구현을 추가하지 않는다.

## 6. Task 29 crop 후보의 현재 지위

[Task 29 분석](image-transform-provenance-gap.md) base L71–149의 RGB PNG 정수 직사각형 crop → PNG는 당시의 조건부 후보로, §5에서 선택한 crop + q75 encode 경로와 구별한다. 현재 CL/DO가 RGB PNG라는 점은 입력 적용 범위를 구체화하지만 JO/CB JPEG bytes를 직접 처리할 수 있게 만들지는 않는다. 모든 변환 arm이 q75 JPEG를 내므로 crop → PNG 후보 단독으로 완성되는 arm 출력은 없다.

geometry/pixel 검증이 단순한 내부 구성 요소 또는 prototype 후보로는 유효하다. 첫 연산 선택은 §5에 기록했으며 PNG 중간 저장 채택을 뜻하지 않는다. Task 29 L242–252의 source capture, writer, provenance, encoder 적합성/결정성, 자원 예산 진입 조건은 그대로 남는다. 이 probe는 그중 제한된 raw JPEG 증거만 보충한다.

## 7. 실제 probe 결과

2026-10-14 실행(Node v24.18.0, Windows x64, jpeg-js 0.4.4)의 [증거 README](evidence/task-33/README.md)와 [결과 JSON](evidence/task-33/jpeg-encoder-results.json)을 보존했다. 2026-10-15 재개 때 결과 JSON·입력 재생성·원본 artifact SHA·집계를 검증했다.

| 확인 항목 | 결과 | 해석 범위 |
| --- | --- | --- |
| a. 목표 프로필 | raw encode360/360 완료, 고유 출력40/40 validateJpeg PASS, 금지 metadata0, normalization 없음 | 제한 JPEG 프로필 수락; 전체 ingest/독립 표준 인증 아님 |
| b. 결정성 | process 안120/120, fresh process 사이40/40 및 각 셀9회 전체에서 동일 SHA. 입력 불일치0 | 동일 입력·quality·runtime에 한정 |
| c. 시간·메모리 | 360회 측정, timeout/crash0. 2528×2528 q50의 전체 encode 시간 범위254.884–379.678ms, 최대 process peak424,204KiB | raw encoder 측 관측이며 decoder accounting/안전 예산과 별개; phase별 원자료는 README/JSON |
| d. 치수·재decode | validator 치수40/40 일치, 별도 strict jpeg-js decode40/40 PASS | 공유 codec 한계, pixel 오차는 참고만 |

DQT는40개 출력 모두 ID0/1·8bit의64값과 payload hash를 기록했다. encoded 크기는613–4,161,162bytes로10MiB 이하였지만 ingest 전체를 실행하지 않았다. 적합성 선행 위험의 일부가 이번 입력에서 해소되었으므로 JPEG encode를 첫 후보로 비교할 근거는 보강됐다. 첫 연산 선택은 §5에 기록했으며 제품 구현은 별도 Task다. q50→decode→q75 연쇄 결과를 관측했다고 확장하지 않는다.

## 8. 해석 한계와 후속 경계

quality 값은 encoder 의존(X9)이다. jpeg-js 0.4.4와 sharp 0.35.4(`mozjpeg:false`)의 q50·q75 DQT는 IJG 표준 스케일링과 같다(Claude 관측, PR #34 리뷰). DCT·색 변환·허프만 부호화 차이로 bytes와 복원 pixel은 다를 수 있으며 측정하지 않았다. validator와 재디코더도 jpeg-js를 공유하므로 독립 codec 검증이나 JPEG 표준 전체의 적합성 증명이 아니다. sharp 독립 decode 비교는 Claude의 `research/` 작업이며 Codex는 설치·실행하지 않는다.

raw→q50 및 raw→q75만 검사한다. q50 JPEG→decode→q75 연쇄, 다른 Node/V8의 결정성, 실제 corpus·문서/차트 대표성, 토큰·정확도·비용 효과는 NOT PROBED다. 2048/2528 probe 치수는 X10 corpus 치수 선택이 아니다. host peak RSS는 encoder 전용 할당이나 decoder accounting 상한이 아니다. 자원 임계값을 새로 정하거나 관측 수치를 안전성 보증으로 쓰지 않는다.

probe가 성공해도 X9 전체, source/writer/provenance/resource 정책, X3 selector·X4·X8, PNG 준비 X5, 실제 파일 X7/X10이 자동 해소되지 않는다. 프로토콜·논문 문구 변경은 후속 목록으로만 남긴다. N-11 문체 정리는 계속 보류한다.
