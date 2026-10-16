# 이미지 우선 파일럿 평가 프로토콜

상태: 실행 전 제안서. 이 문서는 이미지 모델 호출, 데이터 취득, 비용 지출 또는 안전 임계값 검증을
승인하지 않는다. 논문 초안은 [image-first-paper-draft.ko.md](./image-first-paper-draft.ko.md)와 함께
갱신한다. 기존 텍스트 전용 방법론은 역사적 맥락이며 이 이미지 프로토콜의 실행 증거가 아니다.

Task 32 문서 정합화(2026-10-13): 2026-10-12 사용자 결정을 논문에 반영했다. 이 문서 정합화는 변환 구현·calibration·pilot이
실행되었음을 뜻하지 않는다. 결정 원장은 [결정 메모](./image-protocol-decision-memo.md) §11과 그 뒤 사용자 결정 기록이다.
작업 기록과 후속 사항은 [Task 32 핸드오프](../agent/handoffs/task-32.md)를 참조한다.

## 1. 목적과 사전 조건

목적은 질문에 맞춘 외부 이미지 선택기가 입력 크기를 줄이면서 질문의 증거를 잃지 않는지 탐색하는
것이다. pilot은 효과 크기나 안전 보증을 확정하는 시험이 아니다. 모든 수치는 아래 계획상의 호출 수이며
실행 결과가 아니다.

실행 전 다음을 동결한다.

- 사용자 승인 모델, 접근 권한, 예산, 데이터 업로드와 개인정보 조건
- 질문·답·증거의 grading 규칙과 blind 운영 절차
- 변환 preset, selection 규칙, OCR 엔진과 버전, 모델 snapshot, output cap, detail 설정과 모든 arm의 동일한 frozen instruction(“답을 읽을 수 없으면 UNREADABLE이라고 답하라”)
- public dataset을 쓸 경우 licence, 접근권, 파일 hash, 버전과 인용
- manifest 스키마, failure 분모와 결과 폴더의 쓰기·경로 안전성

현재는 실제 dataset을 취득하지 않았다. 첫 pilot은 숨은 답과 증거를 가진 소유·합성 이미지로 시작한다.
DocVQA, ChartQA, ScreenQA는 외적 타당도 후보이며 위 조건을 확인하기 전에는 호출에 넣지 않는다.

기존 [pilot-002](../../research/results/pilot-002/README.md)와 [pilot-003](../../research/results/pilot-003/README.md)은
selector와 출력 변환의 설계 근거를 제공하지만 response guard의 안전성이나 모델 판독을 검증한 결과로 읽지 않는다.
개발 pilot의 A 응답 재사용 동작과 달리, 본 평가의 D는 실제 첫 응답 뒤 배정 variant를 재요청한다. 따라서 이번
프로토콜은 사전 OCR guard를 추가하지 않고, 동일 instruction 아래 실제 첫 응답의 `UNREADABLE` 신호와 제한된
1회 재요청을 관측 대상으로 둔다. 이 단락은 설계 rationale이며 pilot 수치나 성능 결과를 보고하지 않는다.

## 2. source family와 split

calibration은 12개 source family, exploratory held-out은 36개 source family다. 각 집합은 문서·차트·UI
세 strata를 같은 수로 나눈다. 모든 family에는 같은 원본에서 나온 질문, 변환 variant, crop, 같은
템플릿의 near duplicate를 묶어 둔다. family 구성원을 서로 다른 split에 보내지 않는다.

각 domain에는 OCR-small-text stress stratum을 둔다. 문서에서는 각주와 작은 표 셀, 차트에서는 축·범례와
작은 데이터 레이블, UI에서는 작은 상태 문구와 버튼 텍스트를 포함한다. 합성 artifact에는 canonical clean
ground truth와 숨은 evidence geometry를 보관한다. held-out 정답과 정답 라벨은 grader 전용 저장소에 둔다.
clean 조건에서는 배정된 clean pixels를 모든 arm이 입력으로 사용할 수 있다. 손상 조건에서는 배정되지 않은
canonical clean 이미지에 arm과 selector가 접근할 수 없으며, 이를 복원용 입력이나 튜닝 자료로 공개하지 않는다.
E annotator는 배정된 source
variant에서 만든 frozen evidence geometry와 crop만 받으며, annotation은 deployable arm이나 optimizer
후보로 흐르지 않는다. calibration grading feedback은 승인된 response guard 규칙을 확인하는 데 쓸 수 있지만 변경은 새 사용자 결정이 필요하며 direct answer나
gold evidence를 optimizer 입력으로 넣지 않는다.

2026-10-12 사용자 결정에 따른 clean 정책: clean은 직접 생성한 손실 이력 없는 RGB PNG(channels 3) 원천 파일을
재인코딩 없이 그대로 쓴다. 별도 PNG canonical 재인코딩으로 clean을 만들지 않는다. clean의 긴 변
L = max(width, height)는 1536 < L <= 2528이고 사용자 확정 기준값은 2048이다. 정확한 width×height 목록, 종횡비,
family별 배정은 아직 선택하지 않았으며 이후 합성 데이터 생성 Task에서 사용자 승인 뒤 확정한다. 기준값 2048의 운영
의미도 그 Task에서 구체화한다. 원천의 생성 provenance, 실제 파일의 `png-rgb8-static-v1` 제한 적합성과 encoded
크기는 실제 파일이 없어 검증되지 않았다. 상한 2528에서 현행 JPEG decoder accounting 식의 보수적 상한은 종횡비와
무관하게 134,208,576 bytes 이하로 한도 134,217,728보다 9,152 작다(표 상한 2112 등 도출 전제는 결정 메모의 accounting 산술 기록 참조). 이는 accounting 항목만의 산술이며 실제 encoder
출력의 프로필 적합성, encoded 크기, 자원 사용, 수락을 보증하지 않는다. 아래 quality 50과 긴 변 상한 1024는 사용자 선택
잠정값이다.

입력 조건은 네 가지다.

1. clean canonical 원본: 위 정책의 RGB PNG(channels 3) 원천 파일 그대로
2. JPEG-only: 사전 계획된 재인코딩만 적용. clean 치수 그대로 JPEG quality 50, 목표 프로필 P-in (`jpeg-ycbcr8-baseline-444-v1`)
3. downscale-only: 긴 변을 줄이되 확대하지 않음. 긴 변 상한 1024, 출력은 RGB PNG(channels 3 유지)
4. combined: downscale을 먼저 적용한 뒤 JPEG 재인코딩 적용. 긴 변 상한 1024 뒤 JPEG quality 50, 목표 프로필 P-in (`jpeg-ycbcr8-baseline-444-v1`)

기존 JPEG 손상 등 preexisting corruption과 이번 변환이 도입한 degradation을 manifest와 분석에서 분리한다.
입력 stress recipe는 네 조건의 열거이고 operation order가 아니다. combined 조건의 실제 operation order는
downscale 후 JPEG이다. stress 준비의 긴 변 상한 1024와 arm 출력 변환의 긴 변 상한 1536은 서로 다른 값이며 구분해 기록한다.
위 clean 범위(1536 < L)에서는 downscale-only와 combined의 준비 단계 resize가 치수를 실제로 줄이므로 identity가 아니다.
identity resize가 될 수 있는 곳은 준비 단계가 아니라 arm의 1536 단계이며, 긴 변이 이미 1536 이하인 입력(긴 변 1024
이하인 downscale-only·combined variant, 또는 crop 결과)에서 그렇다. 이는 resize 단계에 한정되며 출력 bytes나 pixel의
동일성을 뜻하지 않는다. stress 값을 바꾸면 이 부등식과 구분을 다시 확인한다. 각 slot은 실제 effective
transform, 입력/출력 치수, 파일 크기, format, quality를 기록한다. blinded prelabel로 원래부터 답할 수 없는
입력을 표시하되, 결과를 본 뒤 분석에서 제외하지 않는다.

quality 50과 긴 변 상한 1024는 저장소 근거로 최적화한 값이 아니라 2026-10-12 사용자 선택 잠정값이며 검증된 안전
threshold가 아니다. downscale-only와 combined는 같은 긴 변 상한 표현과 같은 값을, JPEG-only와 combined는 같은 quality를
쓴다(조건 공통이며 후보값 1536/q75와 다름). 12 calibration family에서 이 잠정값을 확인하고, 값을 바꾸면 이전 값·새 값·
이유를 기록한다. 무엇을 확인하면 검증된 것으로 볼지 기준은 아직 정하지 않았으며 사용자가 실행 전에 결정한다. 어떤
stress 값 변경도 사전 사용자 승인 뒤에만 한다. 이 문서는 자동 조정 권한을 주지 않는다. arm의 1536/q75는 이번 선택에서
유지하며 이 절차는 arm preset 변경 허가가 아니다. combined를 downscale-only 산출물에서 연쇄 파생하지 않고 clean에서
직접 만든다는 것은 결정 메모의 집계 가정이며 이번 사용자 결정으로 새로 승인된 것이 아니다. 실제 파생 경로는 확인되지
않았다.

고정 순서(2026-10-12 기본 결정; 2026-10-16 Task 34 개정): stress recipe와 승인된 case-insensitive `UNREADABLE` response guard 규칙을 먼저 고정하고 calibration에서 확인한다. 이 규칙의 변경은 새 사용자 결정이 필요하다. stress 값이 바뀌면 최종 stress 값에서 고정 규칙을 다시 확인한 다음 stress recipe와 response guard를 held-out 시작 전에 함께
freeze한다. stress 값이 바뀔 때마다 조건 공통·후보값과 다름(D2-b) 일관성, 긴 변 상한 T < 1536, clean/stress 치수
부등식, JPEG accounting 상한, response guard 확인 결과를 다시 확인한다. held-out 결과를 이용한 튜닝은 금지한다. 이 문서는
calibration을 실행하지 않았고 그 결과를 기록하지 않는다.

## 3. 변환과 arm

calibration 시작 전에 다음 후보 preset을 고정한다. PNG canonical, 긴 변 1536 이하의 downscale(no upscaling),
JPEG quality 75이다. 이 값은 계획된 calibration 후보값일 뿐 검증된 안전 threshold가 아니다. 입력 stress의 quality 50과
긴 변 상한 1024도 사용자 선택 잠정값이며 안전 인증값이 아니다. 2026-10-12 사용자 결정(S-same, PC-out)에서 활성 출력
변환은 긴 변 1536 이하 downscale 뒤 JPEG quality 75(목표 프로필 P-in (`jpeg-ycbcr8-baseline-444-v1`)) 하나이며, selector는
영역만 고르고 출력 preset을 비교하거나 선택하지 않는다. PNG canonical은 이름을 유지하되 이번 선택에서는 변환 arm이
PNG를 출력하지 않으므로 arm 출력에 쓰지 않는 비활성 항목이다(downscale-only 준비의 PNG 출력과는 별개다). 목표 프로필은
목표일 뿐이며 실제 encoder 출력의 프로필 적합성은 검증되지 않았다. 활성 후보값 1536/q75와 잠정 stress 1024/q50을 포함해
후보 preset과 입력 stress recipe를 manifest에서 구분한다. held-out에 들어간 뒤에는 preset을 바꾸지
않는다. 승인된 response guard 규칙은 calibration에서 확인할 수 있지만 변경하거나 임의의 인증 threshold를 만들거나 held-out 질문의
답·증거를 보고 조정하지 않는다.

각 source variant는 아래 다섯 arm 모두에 같은 질문, 같은 모델 snapshot, 같은 frozen instruction으로 전달한다.
응답에 `UNREADABLE`이 포함되는지는 대소문자를 구분하지 않는 substring 검사로 판정한다. 이 문자열은
시각적 판독 불능을 위한 운영 신호일 뿐이며, 그 밖의 응답이 실제로 읽을 수 있는지는 모델과 입력에
따라 달라지는 질적 한계로 남긴다.

이 문서에서 full original과 original fallback은 모두 **해당 slot에 배정된 source variant**를 뜻한다.
손상 조건의 fallback은 손상된 입력으로 되돌아가는 것이며, 별도로 보관한 canonical clean 이미지를 받는 것이 아니다.

| Arm | 입력 규칙 | 목적 |
|---|---|---|
| A | full original | 기준선 |
| B | naive resize/compression: crop 없이 긴 변 1536 이하 downscale(no upscaling) 뒤 JPEG quality 75 | 무 guard 변환 비용·손상 비교 |
| C | query-aware selection(영역만 선택), artifact guard 없음. 선택 영역 처리 뒤 B와 동일한 출력 변환 | 질문 조건 선택만 분리 |
| D | 동일 selection + response guard + 보수적 original fallback. 첫 호출의 변환 경로는 C와 동일하고, no-window면 C/D의 full-frame 변환을 쓴다. 이 full-frame 첫 호출은 fallback이 아니다. `UNREADABLE` 응답이면 fallback으로 같은 배정 source variant를 as-is로 fresh session에서 한 번만 재요청 | 제안된 production 후보 |
| E | human evidence-region oracle. oracle crop 뒤 B와 동일한 출력 변환 | 숨은 evidence 영역을 쓰는 진단 기준 |

E는 oracle이 숨은 evidence region을 사용하지만 production arm의 selection, tuning, test leakage에 쓰지 않는다.
oracle crop도 해당 arm에 배정된 동일 source variant에서 만들고 annotation은 deployable arm에 숨긴다.
각 arm은 같은 detail 설정, output cap, question hash, source variant와 해당 모델의 provider resize/rejection
설정을 받는다. 모델별 설정에는 OpenAI detail 및 Anthropic `transformations.oversized_image` 동작(downsize/error)을
포함하고, [기존 회계 근거](./image-token-cost-models.md)에 맞춰 calibration 시작 전에 고정하고 held-out에서도
유지한다. calibration에서는 고정 설정별로 provider 한도를 넘는 배정된 원본 source variant 수를 기록한다.
2026-10-12 사용자 결정에서 B, C와 D의 변환 경로, E는 같은 출력 변환 설정(긴 변 1536 이하 downscale 뒤 JPEG quality 75)
하나를 쓴다. B는 crop하지 않고, C와 D는 selector가 영역만 정하며, E는 oracle crop 뒤에 이 변환을 적용한다. A와 D의
fallback(response requery)은 배정된 source variant를 as-is로 전달하므로 이 변환을 받지 않는다.
B와 C는 같은 output
transform 설정을 쓰며, selector가 만든 crop 수나 영역 차이 때문에 transform budget이 달라지면 selector만의
효과로 해석하지 않고 출력 size와 effective transform 차이를 함께 보고한다. arm간에 모델이나 질문을 바꾸어
결과를 유리하게 만들지 않는다. fresh session에서 arm 순서를 block/randomize하고 crop 수와 모델·detail·output
cap과 provider image resize/rejection 설정을 freeze한다.

primary 대비는 D−A 하나로 두어 full original과 response guard 및 응답 기반 fallback(1회 재요청)을 포함한 D를 비교한다. D−C와
C−B는 secondary exploratory 대비다. D−C는 같은 selection과 변환 경로에서 requery가 추가되는 설계 차이만
탐색한다. 독립 호출의 응답이 같다고 보장하지 않으므로 D−C를 응답 동일성의 증거로 해석하지 않는다.
primary metric은 planned production slot의 family-averaged QA success이고, 재요청(fallback) 호출의 비용과
지연도 D의 결과에 포함한다. 보조 metric은 evidence readability, 재요청률, 바이트와 지연이다.
판독 불가 표지의 발생은 모델과 입력에 따라 달라질 수 있으며, 모델이 오답에도 표지를 내지 않으면 응답 기반 재요청은 작동하지 않는다. `UNREADABLE`이 없는 응답도 표지 없는 오답일 수 있다.
원본 재요청도 공급자 축소로 작은 글자 판독을 보장하지 않는다. provider의 원본 자동 축소도 별도 입력 경로로 기록하며 response guard의 안전성으로 귀속하지 않는다.
36 family는 720개의 독립 관측치가 아니며, 조건을 family 안에서 paired로 평균한 뒤 domain summary를 만든다.

2026-10-12 선택 조합의 단계별 변환: A의 full original은 배정된 source variant를 그대로 전달한다. B는 crop 없이 긴 변
1536 이하 downscale(no upscaling) 뒤 JPEG quality 75로 재인코딩한다. C와 D의 변환 경로는 selector가 정한 영역을 처리한
뒤 같은 변환을 적용하고, E는 oracle crop 뒤 같은 변환을 적용한다. 변환 arm의 목표 출력은 JPEG quality 75, 목표 프로필
P-in (`jpeg-ycbcr8-baseline-444-v1`)이며, 이는 목표이지 실제 encoder 출력의 적합성 주장이 아니다(미검증). downscale-only와
combined variant는 긴 변이 1024 이하이므로 arm의 1536 단계가 identity이고, 남는 출력 변환은 선택된 경우의 crop과 q75
재인코딩이다. clean과 JPEG-only variant에서는 B의 1536 단계가 치수를 줄이며, C·D·E에서는 crop 결과 치수에 따라
달라진다. D의 첫 호출은 selector가 정한 변환 입력을 사용하고, no-window면 C/D의 full-frame 변환을 사용한다. `UNREADABLE`이면 같은 배정 variant를 변환 없이 재요청하며 A의 응답은 재사용하지 않는다. q75 재인코딩은 quality 50 JPEG variant에 적용해도 identity가 아니며 임의로 생략하지 않는다. byte 동일성과
손실 크기는 측정되지 않았다. full-frame crop과 identity resize의 no-op 처리, resize 필터와 반올림, selector의 영역
규칙, 중간 crop 저장 방식은 아직 정하지 않았다. 이 문단은 primary metric과 paired 단위를 바꾸지 않는다.

## 4. selection과 response guard 경계

selection은 question+pixels와 OCR 또는 영역 추정치만 읽을 수 있다. 답, gold evidence, grader 판단,
held-out 라벨은 읽지 못한다. 제안된 deterministic score는 질문의 문자열 후보, OCR 작은 글자 밀도,
선·표·UI 영역의 예상 손상, crop과 resize의 기하를 결합해 영역 후보를 정렬한다. 여기의 후보는 영역(crop) 후보이며
출력 preset 후보가 아니다. selector는 출력 format, quality, preset을 고르지 않는다. 정확한 점수와 tie break는
calibration manifest와 함께 freeze한다.

선택기는 OCR을 입력 신호로 사용할 수 있지만 사전 OCR guard는 수행하지 않는다. D의 첫 호출은 C와 같은 selection과
변환 경로를 쓰며, selector가 window를 내지 않으면 C/D의 full-frame 변환을 쓴다. 이 full-frame 첫 호출은 fallback이 아니다.
첫 응답 뒤 response guard가 대소문자를 구분하지 않고 `UNREADABLE` substring을 검사한다. D에서 이 표지가 있으면 C/D 첫
호출의 변환 경로가 아니라 같은 배정 source variant를 변환 없이 그대로 fresh session에서 최대 한 번 재요청하며, 재요청에는
A의 응답을 재사용하지 않고 재귀하지 않는다. 최종 D answer는 두 번째 호출의 응답으로 정하고 첫 번째와 두 번째 호출 각각의 tokens·cost·latency를 기록하며, D 결과에는 두 호출 값을 합산한다.
`UNREADABLE`이 없으면 첫 응답을 최종 응답으로 쓴다. response guard는 후보의 형식, 치수, crop 경계와 응답 상태를
기록하며, 어떤 모델에서도 판독 가능함을 보장한다고 표현하지 않는다.

응답 기반 fallback은 곧 재요청을 뜻한다. 재요청률(requery rate)은 이 operation이 일어난 비율을 나타내는 별도의
outcome이며, 재요청 여부와 관계없이 각 D slot은 배정 분모에 한 번만 포함된다.
선택 계산과 OCR의 latency, 오류 retry, response requery, 원본 업로드와 변환 출력의 바이트를 각각 기록한다. 파일 바이트
감소를 billed token 또는 billed cost 감소로 대체하지 않는다.

## 5. 계획된 호출 수와 분모

탐색용 held-out은 36 family × 질문 1개 × 4 input conditions × 5 arms = 계획된 기본 호출 720개(assigned planned slots)다.
production arms A–D는 36 × 1 × 4 × 4 = 576 planned slots이고, oracle E는 36 × 1 × 4 × 1 = 144다.
따라서 576+144=720이며 기존 텍스트 계획의 576-slot과 혼동하지 않는다. calibration 호출은 이 합계에
포함하지 않고 별도 번호와 manifest로 관리한다.
조건부 response 재요청은 계획된 slot을 늘리지 않는 추가 attempt이며, error retry와 별도 유형으로 센다.

반복·다중 질문·다른 모델을 추가하려면 frozen plan에 사전 기록하고 각 조합을 별도 분모로 센다. 실행
중 임의 반복은 금지한다. runtime failure, timeout, invalid output은 assigned denominator에서 incorrect로
센다. usage field가 없으면 unknown으로 남기며 0으로 대체하지 않는다.
실행하지 않은 slot은 failure와 구분해 `not_started`로 남긴다. 보수적 denominator 표를 만들더라도
not_started가 남아 있으면 완료된 연구로 보고하지 않는다. retry는 원래 slot에 연결된 보조 attempt 기록으로
호출 수와 비용에만 추가하며, 주 평가의 720개 배정 slot(그중 production 576개)의 분모를 늘리지 않는다.
재시도 성공으로 원래 실패 slot의 incorrect 판정을 대체하지 않는다.
`UNREADABLE`에 따른 D의 조건부 requery가 runtime failure, timeout 또는 invalid output이면 기존 규칙대로
해당 assigned slot의 최종 결과를 incorrect로 기록하고, usage·cost·tokens가 없으면 unknown으로 남긴다.

## 6. 관측값과 기록

호출 단위 manifest는 최소한 다음을 가진다.

- family ID, split, domain stratum, input condition, arm, source variant ID
- 원본·출력 파일 hash, 경로, 형식, 너비·높이, crop 좌표와 변환 preset
- 모델 snapshot, 질문 hash, frozen instruction hash, OCR engine/version, detail/output cap, selector/response-guard version과 이유
- answer status, grader status, failure·timeout·error retry, response requery(fallback) 여부
- preprocessing/OCR/selection/model latency, requery 비용·tokens·latency, usage와 cost 또는 unknown
- 생성 시각과 실행 config hash

비용을 관측하는 경우 요청한 모델·이미지 설정과 알 수 있는 provider 처리 치수를 기록하고, 처리 정보가
공개되지 않으면 unknown으로 둔다. 원본과 변환 이미지의 바이트 수는 토큰·비용과 별도로 기록한다.
공식 규칙에서 계산한 토큰 추정치와 Gemini의 명목 budget은 실제 count-tokens 결과, API usage 응답 및
실제 청구와 구분한다. count-tokens는 실행했다면 그 결과와 설정을 기록하고, 실행하지 않았다면 추정치로
대체하지 않는다. rejection 상태도 별도 기록하며, 거부된 요청의 정의되지 않은 토큰·비용을 수치로 채우지
않는다. 이는 향후 관측 계획이며 현재 manifest 구현이나 API 호출을 뜻하지 않는다.

원본은 보존하며 output 경로는 허용된 workspace 아래로만 해석한다. symlink, path traversal, 원본 덮어쓰기,
manifest hash 불일치는 모델 평가 전에 fail gate로 처리한다. clean ground truth는 grader 전용 저장소에
두고 결과 파일에 복사하지 않는다.

## 7. 분석 계획

주요 paired 단위는 source family다. 각 조건을 family 안에서 먼저 paired 평균하고 domain summary를 만든다.
각 조건·arm에서 family별 answer correctness, evidence readability,
재요청률(requery rate), output bytes, preprocess/OCR/selection latency, model latency를 별도 요약한다. preexisting
corruption과 introduced degradation을 분리한 matched 비교를 보고한다. D의 이득은 A와의 paired 변화와
선택 overhead를 함께 제시한다.

재요청률(requery rate) 최소 정의(2026-10-12 기본 결정; 2026-10-16 Task 34 개정): 응답 기반 fallback은 곧 재요청을 뜻한다. 재요청률은 이 operation이 일어난 비율을 나타내는 지표이며, 분자는 D에 배정된 slot 중 response guard가 실제로 재요청한 slot 수,
분모는 held-out의 D에 배정된 slot 수로 전체 144, 입력 조건별 36이다. response guard 결정이 기록되지 않은 slot(`not_started` 등)은
분자에서만 제외하고 그 수를 따로 보고하며 분모에는 그대로 둔다. 재요청률(requery rate)은 전체와 입력 조건별로 primary D−A와
함께 보고한다. 이 지표는 아래 provider rejection 비율 n/N, n/S와 다르며 그 분모를 재사용하지 않는다. 이 정의로 slot을
제외하거나 primary를 조정·공변량 처리하지 않으며, 기존 failure, retry, `not_started` 규칙은 그대로다.

해석 경계: response guard가 수락한 후보를 바꾸지 않는다는 읽기에서 D−C의 설계상 입력 선택 차이는 response requery
자체에만 있다. 독립 호출의 응답이 같다고 보장하지 않는다. 선택 조합에서 C의 출력은 JPEG이므로 clean·downscale-only의 PNG variant와
bytes가 같을 수 없다. JPEG-only·combined에서는 byte 일치 가능성을 배제하지 못하며 측정되지 않았다. 수락 slot에서
동일 artifact를 쓰는지와 변환의 결정성은 검증되지 않았다. fallback slot의 빈도는 실행 전에 알 수 없다. clean의 긴 변이
1536보다 크고 stress 상한이 1024이므로 downscale-only와 clean, combined와 JPEG-only는 치수가 구분된다. 이는 치수
구분일 뿐 시각적 효과, QA 난이도, 손실 크기, 통계 검정력을 보장하지 않으며, stress 값을 바꾸면 다시 확인한다.

가족 단위 평균과 bootstrap은 탐색적 요약으로만 사용한다. 별도 power와 non-inferiority margin을 사전에
등록하지 않은 상태에서 p-value, 유의성, non-inferiority, 안전 인증 또는 우월성을 주장하지 않는다.
oracle은 hidden evidence를 사용한 진단이며 다른 arm에 대한 tuning 기준이 아니다. missing usage는 비용
절감 분모에서 제외하거나 0 처리하지 않고 unknown으로 분리한다.

토큰·비용 해석은 모델, 요청 설정, provider 회계 계열 및 입력 조건을 함께 구분해 기술한다. 산술 예제와
출처는 [논문 §3.3 표 및 참고문헌](./image-first-paper-draft.ko.md#33-비용과-관측), 상세 계산은
[모델별 회계 근거](./image-token-cost-models.md)를 따른다. 예제 값은 실제 측정이나 데이터셋 가중
절감률이 아니다. Gemini의 명목 budget 차이 0은 실제 토큰 차이를 뜻하지 않으며 크기별 실제 사용량은
unknown으로 남긴다. JPEG q75의 실제 토큰·비용 영향도 현재 공개 근거로 확정하지 않는다.

요청이 거부되면 해당 비용 회계의 원본 기준값은 정의되지 않을 수 있으므로 이를 0 절감 또는 수치 차이로
비교하지 않는다. 이 비용 비교 불가능성은 quality 평가의 assigned denominator 규칙을 바꾸지 않는다.
실패·timeout은 기존 규칙대로 배정된 품질 평가 분모에 포함하고, retry 성공으로 원래 slot의 incorrect
판정을 대체하지 않는다. 이 해석은 primary D−A 대비와 기존 paired 분석을 변경하지 않는다.

provider rejection은 arm과 요청 설정별 실패를 분류해 rejection 실패 수 n, 해당 집단의 전체 실패 요청 수 N,
비율 n/N으로 따로 보고한다. 각 집단에 대해 해당 arm의 배정 quality slot 수 S를 기준으로 한 rejection 비율
n/S도 n/N과 함께 보고한다. A의 full-original 실패와 D에서 실제로 선택된 original-fallback 실패를 구분해
표시한다. rejection은 입력 치수와 설정에 따라 다른 arm에서도 발생할 수 있으므로 나머지 arm에서도 관측된
rejection 실패를 같은 방식으로 보고한다. 집단의 N이 0이면 failure-conditioned 비율 n/N은 0으로 대체하지
않고 undefined로 보고한다.
rejection slot은 기존대로 배정된 품질 분모에 포함한다. 이 rejection breakdown을 D−C와 D−A 대비와 함께
해석해 provider limit 실패를 guard 품질의 효과로만 귀속하지 않는다. 이 집계는 12/36 family,
720/576/144 planned slots 및 error retry 규칙을 바꾸지 않는다. 계획된 720 slots와 error retry 및 response requery의 추가 attempts는 별도로 센다.

## 8. blinding과 품질 gate

grader는 arm label과 selector 이유를 보지 않는다. source family와 질문의 pairing만 분석 스크립트에서
복원한다. 운영자는 held-out clean pixels, clean answer, gold evidence를 selector 로그에 노출하지 않는다.
E annotator가 보는 frozen geometry와 crop은 배정된 source variant의 진단용 증거이며 deployable arm의 입력이나
tuning signal이 아니다. calibration에서 규칙을 조정한 사람과 held-out 결과를 집계하는 사람을 가능하면 분리한다.

각 실행은 다음 순서를 따른다.

1. manifest와 path/hash/format을 preflight한다.
2. 같은 question/model/detail/output cap으로 arm을 호출한다.
3. 변환 전후의 치수·형식과 첫 응답 뒤 response guard 판단 및 필요 시 재요청을 기록한다.
4. failure와 timeout을 assigned denominator에 넣는다.
5. usage unknown을 유지하고 오류를 감추지 않는다.
6. blind grading 후에만 arm을 해제한다.
7. family-cluster 요약과 원본 보존 gate를 모두 통과시킨다.

## 9. 재현성과 중지 조건

중지 조건은 원본 손상, 경로 탈출, manifest 누락, 동일 source family의 split 누출, 선택기가 답 또는
gold evidence를 읽는 증거, OCR binding 또는 frozen instruction/response-guard binding 미고정, 모델·예산 승인 부재다. 중지된 run은 결과로 성공 처리하지
않고 상태와 원인을 기록한다.

재현 bundle에는 frozen config, source/hash 목록, transform preset, selector·response-guard version, model snapshot,
question hash, grading rubric, 실행 로그와 manifest를 둔다. 공개 dataset은 라이선스와 접근 만료 조건도
기록한다. hosted run은 사용자 승인, 모델 access, spending/data policy, grading 준비와 reproducibility
bundle이 모두 확인된 뒤에만 시작한다.

## 10. Paper–plugin 병렬 개발 로드맵

paper와 implementation은 evidence specification이 안정된 범위에서 병렬 진행한다. 구현과 문서가 충돌하면
paper의 명시된 측정 경계를 우선하고 결과 문장을 측정 후에만 갱신한다. video는 image pilot과 사용자 승인
뒤로 미룬다.

| Paper milestone | 최소 plugin capability / 상태 | 테스트·증거 | 우선순위/gate |
|---|---|---|---|
| M1 입력 정의 | 제한 PNG 및 제한 baseline 4:4:4 JPEG ingest/inspect, 허용 경로, 원본 hash 구현; M1 변환과 그 외 프로필은 예정 | path traversal, 원본 무변경, hash, 제한·오류 회귀 테스트 | P0, 보안 gate |
| M2 변환 provenance | resize/crop/format manifest | dimensions, crop, preset, source/output hash 검사 | P0, 재현성 gate |
| M3 증거 보존 | response guard와 assigned-variant 1회 fresh-session requery(fallback) | calibration fixture의 small-text/crop 경계 및 `UNREADABLE` 응답 회귀 | P0, 안전성 탐색 gate |
| M4 선택 adapter | question+pixels/OCR 입력과 selector version | gold/answer가 selector에 흐르지 않음, tie break 고정 | P1, leakage gate |
| M5 pilot adapter | 다섯 arm, 네 조건, blind manifest | planned 720 schema와 denominator 감사 | P1, 평가 gate |
| M6 hosted evidence | 승인된 모델 호출과 usage/latency telemetry | failure/unknown usage, 비용·지연 산출 | P1, 사용자·예산 승인 |
| M7 외부 타당도 | 라이선스 확인 후 public dataset adapter | licence/access/hash, family split 감사 | P2, 데이터 gate |
| M8 video 후속 | 프레임/시간 provenance | image evidence 이후 별도 설계 | 보류, image 검증+사용자 승인 |

현재 [제한 PNG 및 JPEG 입력 계약](../image-artifacts.md)이 구현되어 있다. 메타데이터 청크가 없는 8비트
RGB/RGBA 정적 PNG와 제한된 baseline 4:4:4 JPEG의 검증·원본 hash·치수 추적이며, 변환·모델 호출·pilot
측정은 계획이다. hosted evidence는 없으며 입력 검증 테스트를 시각적 증거 보존이나 모델 성능의 검증으로
해석하지 않는다.
Current implementation status (Task 22): restricted PNG and baseline 4:4:4 JFIF
JPEG ingest and inspection are implemented with source hashing, bounded
validation, and regression coverage. Independent JPEG fixtures cover 1x1,
odd-size, and multi-MCU inputs with recorded SHA-256 provenance. These are
engineering preconditions for future evaluation, not pilot observations.
Transformations, model calls, and pilot measurements remain planned; the tests
and fixture provenance do not establish image quality, model performance, or
hosted cost or latency.
