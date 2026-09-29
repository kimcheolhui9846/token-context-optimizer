# 이미지 우선 파일럿 평가 프로토콜

상태: 실행 전 제안서. 이 문서는 이미지 모델 호출, 데이터 취득, 비용 지출 또는 안전 임계값 검증을
승인하지 않는다. 논문 초안은 [image-first-paper-draft.ko.md](./image-first-paper-draft.ko.md)와 함께
갱신한다. 기존 텍스트 전용 방법론은 역사적 맥락이며 이 이미지 프로토콜의 실행 증거가 아니다.

## 1. 목적과 사전 조건

목적은 질문에 맞춘 외부 이미지 선택기가 입력 크기를 줄이면서 질문의 증거를 잃지 않는지 탐색하는
것이다. pilot은 효과 크기나 안전 보증을 확정하는 시험이 아니다. 모든 수치는 아래 계획상의 호출 수이며
실행 결과가 아니다.

실행 전 다음을 동결한다.

- 사용자 승인 모델, 접근 권한, 예산, 데이터 업로드와 개인정보 조건
- 질문·답·증거의 grading 규칙과 blind 운영 절차
- 변환 preset, selection 규칙, OCR 엔진과 버전, 모델 snapshot, output cap, detail 설정
- public dataset을 쓸 경우 licence, 접근권, 파일 hash, 버전과 인용
- manifest 스키마, failure 분모와 결과 폴더의 쓰기·경로 안전성

현재는 실제 dataset을 취득하지 않았다. 첫 pilot은 숨은 답과 증거를 가진 소유·합성 이미지로 시작한다.
DocVQA, ChartQA, ScreenQA는 외적 타당도 후보이며 위 조건을 확인하기 전에는 호출에 넣지 않는다.

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
후보로 흐르지 않는다. calibration grading feedback은 guard를 조정하는 데 쓸 수 있지만 direct answer나
gold evidence를 optimizer 입력으로 넣지 않는다.

입력 조건은 네 가지다.

1. clean canonical 원본
2. JPEG-only: 사전 계획된 재인코딩만 적용
3. downscale-only: 긴 변을 줄이되 확대하지 않음
4. combined: downscale을 먼저 적용한 뒤 JPEG 재인코딩 적용

기존 JPEG 손상 등 preexisting corruption과 이번 변환이 도입한 degradation을 manifest와 분석에서 분리한다.
입력 stress recipe는 네 조건의 열거이고 operation order가 아니다. combined 조건의 실제 operation order는
downscale 후 JPEG이며, 긴 변이 이미 preset 이하이면 identity resize가 될 수 있다. 각 slot은 실제 effective
transform, 입력/출력 치수, 파일 크기, format, quality를 기록한다. blinded prelabel로 원래부터 답할 수 없는
입력을 표시하되, 결과를 본 뒤 분석에서 제외하지 않는다.

## 3. 변환과 arm

calibration 시작 전에 다음 후보 preset을 고정한다. PNG canonical, 긴 변 1536 이하의 downscale(no upscaling),
JPEG quality 75이다. 이 값은 계획된 calibration 후보값일 뿐 검증된 안전 threshold가 아니다. optimizer가
비교할 후보 preset과 입력 stress recipe를 manifest에서 구분한다. held-out에 들어간 뒤에는 preset을 바꾸지
않는다. small-text guard를 calibration에서 조정할 수 있지만 임의의 인증 threshold를 만들거나 held-out 질문의
답·증거를 보고 조정하지 않는다.

각 source variant는 아래 다섯 arm 모두에 같은 질문과 같은 모델 snapshot으로 전달한다.

이 문서에서 full original과 original fallback은 모두 **해당 slot에 배정된 source variant**를 뜻한다.
손상 조건의 fallback은 손상된 입력으로 되돌아가는 것이며, 별도로 보관한 canonical clean 이미지를 받는 것이 아니다.

| Arm | 입력 규칙 | 목적 |
|---|---|---|
| A | full original | 기준선 |
| B | naive resize/compression | 무 guard 변환 비용·손상 비교 |
| C | query-aware selection, artifact guard 없음 | 질문 조건 선택만 분리 |
| D | 동일 selection + artifact guard + 보수적 original fallback | 제안된 production 후보 |
| E | human evidence-region oracle | 숨은 evidence 영역을 쓰는 진단 기준 |

E는 oracle이 숨은 evidence region을 사용하지만 production arm의 selection, tuning, test leakage에 쓰지 않는다.
oracle crop도 해당 arm에 배정된 동일 source variant에서 만들고 annotation은 deployable arm에 숨긴다.
각 arm은 같은 detail 설정, output cap, question hash, source variant를 받는다. B와 C는 가능한 한 같은 output
transform 설정을 쓰며, selector가 만든 crop 수나 영역 차이 때문에 transform budget이 달라지면 selector만의
효과로 해석하지 않고 출력 size와 effective transform 차이를 함께 보고한다. arm간에 모델이나 질문을 바꾸어
결과를 유리하게 만들지 않는다. fresh session에서 arm 순서를 block/randomize하고 crop 수와 모델·detail·output
cap을 freeze한다.

primary 대비는 D−C 하나로 두어 동일 selector에서 guard와 conservative fallback의 추가 효과를 본다. C−B와
D−A는 secondary exploratory 대비다. primary metric은 planned production slot의 family-averaged QA success이고,
fallback 호출의 비용과 지연도 D의 결과에 포함한다. 보조 metric은 evidence readability, fallback, 바이트와 지연이다.
36 family는 720개의 독립 관측치가 아니며, 조건을 family 안에서 paired로 평균한 뒤 domain summary를 만든다.

## 4. selection과 guard 경계

selection은 question+pixels와 OCR 또는 영역 추정치만 읽을 수 있다. 답, gold evidence, grader 판단,
held-out 라벨은 읽지 못한다. 제안된 deterministic score는 질문의 문자열 후보, OCR 작은 글자 밀도,
선·표·UI 영역의 예상 손상, crop과 resize의 기하를 결합해 후보를 정렬한다. 정확한 점수와 tie break는
calibration manifest와 함께 freeze한다.

OCR engine과 version이 결정되지 않은 상태에서는 runnable protocol이 아니다. OCR이 실패하거나 geometry가
불명확하면 guard는 원본으로 fallback한다. guard는 후보의 형식, 치수, crop 경계와 small-text 위험을
기록하며, 변환의 보존을 보장한다고 표현하지 않는다.

fallback 사용량은 별도의 outcome이다. fallback이 선택된 호출도 D의 assigned denominator에 포함한다.
선택 계산과 OCR의 latency, 오류, retry, 원본 업로드와 변환 출력의 바이트를 각각 기록한다. PNG 바이트
감소를 billed token 또는 billed cost 감소로 대체하지 않는다.

## 5. 계획된 호출 수와 분모

탐색용 held-out은 36 family × 질문 1개 × 4 input conditions × 5 arms = 720 planned calls다.
production arms A–D는 36 × 1 × 4 × 4 = 576 planned calls이고, oracle E는 36 × 1 × 4 × 1 = 144다.
따라서 576+144=720이며 기존 텍스트 계획의 576-slot과 혼동하지 않는다. calibration 호출은 이 합계에
포함하지 않고 별도 번호와 manifest로 관리한다.

반복·다중 질문·다른 모델을 추가하려면 frozen plan에 사전 기록하고 각 조합을 별도 분모로 센다. 실행
중 임의 반복은 금지한다. runtime failure, timeout, invalid output은 assigned denominator에서 incorrect로
센다. usage field가 없으면 unknown으로 남기며 0으로 대체하지 않는다.
실행하지 않은 slot은 failure와 구분해 `not_started`로 남긴다. 보수적 denominator 표를 만들더라도
not_started가 남아 있으면 완료된 연구로 보고하지 않는다. retry는 원래 slot에 연결된 보조 attempt 기록으로
호출 수와 비용에만 추가하며, 주 평가의 720개 배정 slot(그중 production 576개)의 분모를 늘리지 않는다.
재시도 성공으로 원래 실패 slot의 incorrect 판정을 대체하지 않는다.

## 6. 관측값과 기록

호출 단위 manifest는 최소한 다음을 가진다.

- family ID, split, domain stratum, input condition, arm, source variant ID
- 원본·출력 파일 hash, 경로, 형식, 너비·높이, crop 좌표와 변환 preset
- 모델 snapshot, 질문 hash, detail/output cap, selector/guard version과 이유
- answer status, grader status, failure·timeout·retry, fallback 여부
- preprocessing/OCR/selection/model latency, usage와 cost 또는 unknown
- 생성 시각과 실행 config hash

원본은 보존하며 output 경로는 허용된 workspace 아래로만 해석한다. symlink, path traversal, 원본 덮어쓰기,
manifest hash 불일치는 모델 평가 전에 fail gate로 처리한다. clean ground truth는 grader 전용 저장소에
두고 결과 파일에 복사하지 않는다.

## 7. 분석 계획

주요 paired 단위는 source family다. 각 조건을 family 안에서 먼저 paired 평균하고 domain summary를 만든다.
각 조건·arm에서 family별 answer correctness, evidence readability,
fallback rate, output bytes, preprocess/OCR/selection latency, model latency를 별도 요약한다. preexisting
corruption과 introduced degradation을 분리한 matched 비교를 보고한다. D의 이득은 A와의 paired 변화와
선택 overhead를 함께 제시한다.

가족 단위 평균과 bootstrap은 탐색적 요약으로만 사용한다. 별도 power와 non-inferiority margin을 사전에
등록하지 않은 상태에서 p-value, 유의성, non-inferiority, 안전 인증 또는 우월성을 주장하지 않는다.
oracle은 hidden evidence를 사용한 진단이며 다른 arm에 대한 tuning 기준이 아니다. missing usage는 비용
절감 분모에서 제외하거나 0 처리하지 않고 unknown으로 분리한다.

## 8. blinding과 품질 gate

grader는 arm label과 selector 이유를 보지 않는다. source family와 질문의 pairing만 분석 스크립트에서
복원한다. 운영자는 held-out clean pixels, clean answer, gold evidence를 selector 로그에 노출하지 않는다.
E annotator가 보는 frozen geometry와 crop은 배정된 source variant의 진단용 증거이며 deployable arm의 입력이나
tuning signal이 아니다. calibration에서 규칙을 조정한 사람과 held-out 결과를 집계하는 사람을 가능하면 분리한다.

각 실행은 다음 순서를 따른다.

1. manifest와 path/hash/format을 preflight한다.
2. 변환 전후의 치수·형식과 guard 판단을 기록한다.
3. 같은 question/model/detail/output cap으로 arm을 호출한다.
4. failure와 timeout을 assigned denominator에 넣는다.
5. usage unknown을 유지하고 오류를 감추지 않는다.
6. blind grading 후에만 arm을 해제한다.
7. family-cluster 요약과 원본 보존 gate를 모두 통과시킨다.

## 9. 재현성과 중지 조건

중지 조건은 원본 손상, 경로 탈출, manifest 누락, 동일 source family의 split 누출, 선택기가 답 또는
gold evidence를 읽는 증거, OCR binding 미고정, 모델·예산 승인 부재다. 중지된 run은 결과로 성공 처리하지
않고 상태와 원인을 기록한다.

재현 bundle에는 frozen config, source/hash 목록, transform preset, selector·guard version, model snapshot,
question hash, grading rubric, 실행 로그와 manifest를 둔다. 공개 dataset은 라이선스와 접근 만료 조건도
기록한다. hosted run은 사용자 승인, 모델 access, spending/data policy, grading 준비와 reproducibility
bundle이 모두 확인된 뒤에만 시작한다.

## 10. Paper–plugin 병렬 개발 로드맵

paper와 implementation은 evidence specification이 안정된 범위에서 병렬 진행한다. 구현과 문서가 충돌하면
paper의 명시된 측정 경계를 우선하고 결과 문장을 측정 후에만 갱신한다. video는 image pilot과 사용자 승인
뒤로 미룬다.

| Paper milestone | 최소 plugin 예정 capability | 테스트·증거 | 우선순위/gate |
|---|---|---|---|
| M1 입력 정의 | image ingest, 허용 경로, 원본 hash | path traversal, overwrite, hash 회귀 테스트 | P0, 보안 gate |
| M2 변환 provenance | resize/crop/format manifest | dimensions, crop, preset, source/output hash 검사 | P0, 재현성 gate |
| M3 증거 보존 | guard와 original fallback | calibration fixture의 small-text/crop 경계 회귀 | P0, 안전성 탐색 gate |
| M4 선택 adapter | question+pixels/OCR 입력과 selector version | gold/answer가 selector에 흐르지 않음, tie break 고정 | P1, leakage gate |
| M5 pilot adapter | 다섯 arm, 네 조건, blind manifest | planned 720 schema와 denominator 감사 | P1, 평가 gate |
| M6 hosted evidence | 승인된 모델 호출과 usage/latency telemetry | failure/unknown usage, 비용·지연 산출 | P1, 사용자·예산 승인 |
| M7 외부 타당도 | 라이선스 확인 후 public dataset adapter | licence/access/hash, family split 감사 | P2, 데이터 gate |
| M8 video 후속 | 프레임/시간 provenance | image evidence 이후 별도 설계 | 보류, image 검증+사용자 승인 |

현재 M1–M8은 계획이며 이 저장소에는 이미지 capability와 hosted evidence가 구현·실행되지 않았다. 기존
텍스트 테스트는 M1–M8의 통과 증거가 아니다.
