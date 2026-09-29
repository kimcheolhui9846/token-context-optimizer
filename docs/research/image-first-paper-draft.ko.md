# 이미지 우선 외부 입력 최적화: 질의 인식 선택과 보수적 원본 보존을 위한 제안

## 초록

멀티모달 모델에 이미지를 전달할 때 입력을 줄이면 전송량과 처리 비용을 낮출 가능성이 있다.
그러나 문서의 작은 글자, 차트의 축과 범례, 사용자 인터페이스의 상태 표시는 시각적 손상에 민감하며,
질문에 맞춘 축소가 답을 결정하는 증거를 지울 수 있다. 이 논문은 이미지 자체의 품질을 단순히 낮추는
압축기를 제안하지 않는다. 질문과 픽셀에서 얻을 수 있는 제한된 신호로 후보 변환을 고르고, 증거 보존
위험이 높으면 동일한 원본으로 되돌리는 외부 이미지 최적화 방법을 제안한다. 변환 산출물에는 크기,
형식, 변환과 선택의 원인, 원본 해시와 공간 정보를 함께 기록한다. 이 문서는 방법과 파일럿 평가
프로토콜의 제안서이며 이미지 입력을 실제 모델에 실행한 결과를 보고하지 않는다. 현재 구현된 저장소의
텍스트 아티팩트 기능 및 제한된 PNG 입력 검증(M1a)과 그 소프트웨어 테스트는 이미지 안전성, 시각적 가독성, 모델 정확도, 지연 또는
비용 절감을 입증하지 않는다.

## 1. 서론: 문제와 경계

이미지 입력은 문서 질의응답, 차트 해석, 앱 화면 이해에서 답의 근거를 직접 담는다. DocVQA는 문서
이미지에서 질문에 답하는 구조를 정식 벤치마크로 다루고 [1], ChartQA는 차트의 시각적·논리적 추론을
평가한다 [3]. ScreenQA는 모바일 앱 화면과 답을 연결하는 문제를 보여 준다 [4]. 공통점은 픽셀의
일부가 질문 의미를 결정한다는 사실이다. 따라서 파일 바이트가 줄었다는 사실만으로 입력 최적화가
안전하다고 결론 낼 수 없다.

본 제안의 목표는 원본 이미지 전체를 모든 요청에 전달해야 한다는 가정을 시험하는 것이다. 질문과
이미지의 제한된 신호를 이용해 변환 후보를 선택하고, 선택기가 작은 글자나 얇은 선의 손상을 우려하면
보수적으로 원본을 보낸다. 이 보수적 fallback은 설계상의 안전장치이며 아직 안전하다고 검증된 규칙은
아니다. 또한 소프트웨어 아티팩트와 시각적 손상 아티팩트를 구분한다. 소프트웨어 아티팩트는 이미지의
경로, 해시, 변환 이력, 모델과 질문의 식별자처럼 재현과 감사에 필요한 기록이다. 시각적 손상
아티팩트는 축소, 재인코딩, 잘림으로 인해 픽셀 증거가 변하는 결과물이다. 전자를 보존해도 후자의
정보 손실이 사라지지는 않는다.

범위는 정적 이미지 최적화와 그 평가 설계다. 동영상은 이미지 검증과 사용자 승인 이후의 후속 연구로
남긴다. 현재 저장소는 UTF-8 텍스트 인덱싱, 해시, 라인 맵, 손실 요약 차단과 제한된 PNG 원본의
입력 검증·해시·치수 추적(M1a)을 제공한다. M1a는 메타데이터 청크가 없는 8비트 RGB/RGBA 정적 PNG만
받으며 원본에 쓰지 않는다. 영구 원본 보관이나 이미지 변환기, OCR 결합기, 호스팅 실행기 또는 사용량
계측기는 제공하지 않는다. 구체적인 프로필과 한계는 [입력 계약](../image-artifacts.md)에 기록한다.

## 2. 관련 연구와 제안의 위치

DocVQA는 문서 이미지의 질문과 답 구조를 제공하므로 문서 증거 보존을 평가할 후보 근거다 [1].
TextVQA는 장면 속 글자를 읽는 질문을 다루며 [2], 작은 문자열을 포함한 시각적 읽기 부담을 보여 주지만
문서·데스크톱 UI의 OCR 품질 인증서나 외부 래스터 전처리 규칙은 아니다. ChartQA는 시각 정보와 논리
추론을 함께 요구하므로 축·범례·값 표기의 보존을 점검할 후보다 [3]. ScreenQA는 화면 질의와 UI
영역을 다루지만 모바일 화면 중심이어서 일반 데스크톱에 대한 직접적인 일반화 근거가 아니다 [4].

QuietPrune은 질문에 따라 비전 언어 모델 내부 토큰을 일찍 제거하는 연구다 [5]. Rethinking Token
Reduction은 미래 질문을 알 수 없는 상황에서 토큰 축소를 다시 살핀다 [6]. 두 연구는 질의 조건부
선택과 원본 보존을 생각하게 하는 관련 근거지만, 외부 래스터 변환, MCP 전송, 과금 또는 이 제안의
fallback을 검증하지 않는다. 따라서 본 제안은 이들 연구보다 우월하다는 주장을 하지 않으며, 내부 토큰
압축과 외부 이미지 변환을 같은 개입으로 순위화하지 않는다.

## 3. 제안 방법

### 3.1 입력과 후보

한 요청은 질문, 원본 픽셀, 선택 가능한 변환 프리셋, 그리고 보안·경로 정책을 입력으로 받는다. 선택기는
질문과 배정된 픽셀에서만 계산되는 신호와 OCR 또는 영역 추정치를 사용할 수 있다. clean 조건에서는 배정된
clean pixels를 사용하지만, 손상 조건에서는 배정되지 않은 canonical clean 이미지에 접근하지 못한다. held-out
정답, gold evidence, 사람의 정답 라벨은 선택기에 제공하지 않는다. 모든 변환은 원본 패밀리 안에서만 생성하며 질문별
crop, 같은 템플릿의 near-duplicate, 서로 다른 입력 조건을 교차 split하지 않는다.

파일럿에서 먼저 고정할 후보 preset은 PNG canonical, 긴 변 1536 이하로 줄이고 확대하지 않기, JPEG quality 75
재인코딩이다. 이 값은 계획된 calibration 후보값이며 안전 임계값으로 검증된 값이 아니다. 조합된 변환은
downscale을 먼저 적용한 뒤 JPEG로 재인코딩하고, 원본이 이미 preset 이하이면 identity resize일 수 있으므로
실제 effective transform을 별도 후보 기록에 남긴다. 선택기는 질문의 핵심 문자열, OCR의 작은 글자 밀도,
선·표·UI 영역의 예상 손상 신호를 이용해 후보를 정렬할 수 있다. OCR 엔진과 버전이 고정되지 않으면 선택기
결과는 실행할 수 없으므로, OCR 바인딩은 실행 전 gate다.

### 3.2 증거 guard와 fallback

full original과 original fallback의 원본은 해당 slot에 배정된 source variant다. 손상 조건의 원본 복귀는
손상된 입력으로 되돌아갈 뿐이며, 숨겨진 canonical clean 이미지를 복구해 전달하지 않는다.

후보가 원본보다 작더라도 증거 손상 위험이 높으면 원본을 선택한다. guard는 작은 글자와 증거 영역의
기하, crop 경계, 변환 전후의 해상도·형식을 기록하고, 보존 조건을 만족하지 않는 후보를 거부한다.
guard에서 쓰는 규칙은 calibration에서만 조정하고 held-out 질문에 맞춰 다시 조정하지 않는다. 작은
글자에 대한 임의의 인증 임계값은 두지 않는다. fallback 사용률은 결과의 일부이며, fallback이 많다는
사실은 최적화가 잘 되었다는 뜻이 아니다.

선택기와 guard의 출력은 원본 또는 하나의 변환 이미지와 함께 provenance manifest로 저장한다. manifest에는
원본·출력 SHA-256, 너비·높이, 형식, crop 좌표, 선택 이유, 변환 프리셋, 모델 snapshot, 질문 hash,
사용량, 지연, 상태, fallback 여부를 포함한다. 출력 경로는 허용된 workspace 아래로만 해석하고 원본을
덮어쓰지 않는다.

### 3.3 비용과 관측

PNG 바이트 감소는 청구 비용 감소와 같지 않다. 파일 크기, 업로드 시간, 전처리/OCR/선택 지연, 모델의
실제 사용량, 오류와 timeout을 별도 계측한다. 사용량이 보고되지 않으면 0으로 기록하지 않고 unknown으로
남긴다. 선택기 계산의 추가 비용도 원본 전달 arm과 함께 비교한다. 이 논문은 비용 절감을 전제하지 않으며,
호스팅 실행과 계측이 구현된 뒤에만 그 질문을 평가한다.

## 4. 계획된 평가

파일럿은 12개 calibration source family와 탐색용 held-out 36개 family로 시작한다. 두 집합 모두 문서,
차트, UI strata를 같은 수로 배정한다. 실제 데이터셋은 아직 확보하지 않았고, 첫 단계는 답과 증거를
숨긴 소유·합성 아티팩트다. DocVQA, ChartQA, ScreenQA는 외적 타당도를 위한 후보일 뿐이며 라이선스,
접근권, 파일 hash를 확인하기 전에는 사용하지 않는다. 각 domain에는 OCR small-text stress stratum을
포함한다.

고정된 모델과 질문마다 다음 다섯 arm을 같은 source variant에 적용한다. (A) full original, (B) naive
resize/compression, (C) query-aware selection without artifact guard, (D) 동일 selection과 artifact
guard 및 보수적 original fallback, (E) 사람의 evidence-region oracle 진단. E는 숨은 증거 영역을 사용하고
다른 arm의 튜닝이나 운영에는 사용하지 않는다. E annotation은 배정된 source variant에서 만든 frozen geometry와
crop만 쓰며 deployable arm에 전달하지 않는다. 모든 arm은 같은 질문, 모델, detail 설정, output cap을 받는다.
B와 C는 가능한 한 같은 출력 변환 설정을 쓰고, selector 때문에 crop 수나 transform budget이 달라지면 결과에서
그 차이를 분리해 기록한다. preexisting corruption과 이번 변환이 도입한 degradation을 분리해 기록한다.
clean, JPEG-only, downscale-only, combined의 네 입력 조건에서 source family를 함께 유지한다.

탐색용 36 family × 질문 1개 × 조건 4개 × arm 5개는 frozen model에서 계획된 720 calls다. 이 중
production arms A–D는 576 calls, oracle arm E는 144 calls다. 이는 실행된 수가 아니라 계획 수이며 calibration
호출은 별도로 센다. 반복을 추가하면 사전에 횟수를 고정하고 분모에 포함한다. runtime failure와 timeout은
할당된 분모에서 incorrect로 센다. 실행하지 않은 slot은 failure와 구분해 `not_started`로 남기며, 완료된 연구의
증거로 쓰지 않는다. retry 호출과 비용은 별도로 센다. 원본 보존, 경로 안전성, manifest 완전성은 모델 점수와
별도의 gate다.

분석은 family-cluster paired summary를 우선하고, primary 대비는 D−C 하나로 둔다. C−B와 D−A는 secondary
exploratory 대비이며, 유의성 또는 non-inferiority 주장은 별도의 검정력과 margin을 사전 등록하기 전에는 하지
않는다. oracle은 guard가 보존할 수 있는 이상적 영역 신호의 진단으로만 보고한다. 모든 결과는 원본 대비 답
정확도, 증거의 가독성, fallback 사용률과 그 비용, 변환·선택 지연, 알려지지 않은 사용량을 분리한다.

## 5. 결과는 아직 측정되지 않음

이미지 입력에 대한 모델 호출, OCR telemetry, 시각적 grader, hosted latency, usage 또는 비용 결과는
아직 실행되지 않았다. 따라서 본 문서에는 정확도, 절감률, 안전 임계값, 통계적 유의성, 우월성 수치를
제시하지 않는다. 현재의 텍스트 및 PNG 엔지니어링 테스트는 입력·저장소·오류 처리 계약을 검증할 뿐
이미지 최적화 방법의 효과를 검증하지 않는다.

## 6. 논의와 한계

질의 인식 선택은 질문을 사용하므로 질문이 바뀌면 선택도 바뀐다. OCR 오류, crop 경계, 화면 배율,
모델의 detail 처리와 숨은 토큰화는 guard를 통과해도 시각적 의미를 손상할 수 있다. 보수적 fallback은
손실을 줄일 수 있다는 가설일 뿐 안전을 보장하지 않는다. 하나의 작은 파일럿은 일반화나 비용 체계를
증명하지 않는다. public benchmark의 license와 접근 조건, 모델 정책과 개인정보 승인은 별도 gate다.

소유·합성 아티팩트는 재현성과 숨은 정답 통제를 돕지만 실제 문서 다양성을 대표하지 않을 수 있다.
외부 데이터는 각 family를 함께 split하고 hash와 버전을 고정해야 한다. UI 결과를 문서 결과와 섞으면
오류 원인을 잃으므로 domain별로 보고한다. 동영상은 프레임 간 일관성과 시간적 증거가 추가되므로,
이미지 guard와 pilot이 검증되고 사용자가 승인한 뒤의 미래 작업으로만 남긴다.

## 7. 결론

본 논문은 외부 정적 이미지 최적화를 질문 인식 선택, artifact guard, 원본 fallback, provenance 계측의
묶음으로 제안한다. 연구의 핵심 성공 조건은 바이트 감소가 아니라 같은 질문의 증거를 보존하면서
재현 가능한 관측을 남기는지다. 최적화 방법과 모델 평가는 아직 설계 단계다. 제한된 PNG 입력 검증과
원본 추적(M1a)만 구현되어 있으며 이미지 모델 측정 결과는 없다. 다음 단계는 입력 프로필 확장,
resize/crop provenance, guard와 fallback, 평가 adapter를
순서대로 만들고 이 프로토콜의 gate를 통과시키는 것이다. paper와 구현은 증거 사양이 안정된 범위에서
병렬로 진행하되, 충돌 시 paper의 명시적 측정 경계를 우선한다.

## 참고문헌

1. Mathew et al., “DocVQA: A Dataset for VQA on Document Images,” WACV 2021.
   [논문](https://openaccess.thecvf.com/content/WACV2021/html/Mathew_DocVQA_A_Dataset_for_VQA_on_Document_Images_WACV_2021_paper.html)
2. Singh et al., “Towards VQA Models That Can Read,” CVPR 2019.
   [논문](https://openaccess.thecvf.com/content_CVPR_2019/html/Singh_Towards_VQA_Models_That_Can_Read_CVPR_2019_paper.html)
3. Masry et al., “ChartQA: A Benchmark for Question Answering about Charts with Visual and Logical Reasoning,” Findings of ACL 2022.
   [논문](https://aclanthology.org/2022.findings-acl.177/)
4. Hsiao et al., “ScreenQA: Large-Scale Question-Answer Pairs Over Mobile App Screenshots,” NAACL 2025.
   [논문](https://aclanthology.org/2025.naacl-long.477/)
5. Gao et al., “QuietPrune: Query-Guided Early Token Pruning for Vision-Language Models,” CVPR 2026.
   [논문](https://openaccess.thecvf.com/content/CVPR2026/html/Gao_QuietPrune_Query-Guided_Early_Token_Pruning_for_Vision-Language_Models_CVPR_2026_paper.html)
6. Wang et al., “Rethinking Token Reduction for Large Vision-Language Models,” CVPR 2026; MetaCompress arXiv:2603.21701v1.
   [CVF 목록](https://openaccess.thecvf.com/content/CVPR2026/html/Wang_Rethinking_Token_Reduction_for_Large_Vision-Language_Models_CVPR_2026_paper.html),
   [arXiv 초록](https://arxiv.org/abs/2603.21701v1), [접근 기록](./image-first-sources.md)
