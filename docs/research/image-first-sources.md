# 이미지 우선 논문 출처 등록부

검증일: 2026-09-19. 아래 등록부는 이미지 우선 초안과 프로토콜에서 실제로 사용한 1차 출처의 범위를
기록한다. 완전한 novelty search가 아니다. 초안의 관련 연구 문장은 각 출처의 초록·메타데이터로 확인할
수 있는 범위에 한정했으며, 검색 색인이나 초록만 확인한 항목을 본문 전체를 읽은 것처럼 해석하지 않는다.

| ID | 서지정보·연도 | URL | 확인한 위치/접근 방법 | 지원하는 요지와 한계 | 확인일 |
|---|---|---|---|---|---|
| [1] | Mathew et al., “DocVQA: A Dataset for VQA on Document Images,” WACV 2021 | [CVF 공식 페이지](https://openaccess.thecvf.com/content/WACV2021/html/Mathew_DocVQA_A_Dataset_for_VQA_on_Document_Images_WACV_2021_paper.html) | CVF 공식 초록의 검색 색인 확인. 페이지 직접 접근은 403; PDF/본문 미검토 | 문서 이미지 질문응답 benchmark라는 문제 구조를 뒷받침한다. 이미지 보존 규칙, 안전 threshold, 외부 전처리 효과는 제공하지 않는다. | 2026-09-19 |
| [2] | Singh et al., “Towards VQA Models That Can Read,” CVPR 2019 | [CVF 공식 페이지](https://openaccess.thecvf.com/content_CVPR_2019/html/Singh_Towards_VQA_Models_That_Can_Read_CVPR_2019_paper.html) | CVF 공식 초록의 검색 색인 확인. 페이지 직접 접근은 403; PDF/본문 미검토 | TextVQA와 장면 속 텍스트 읽기 문제를 뒷받침한다. 문서·UI OCR 품질 인증서나 이미지 변환 지침은 아니다. | 2026-09-19 |
| [3] | Masry et al., “ChartQA: A Benchmark for Question Answering about Charts with Visual and Logical Reasoning,” Findings of ACL 2022 | [ACL Anthology](https://aclanthology.org/2022.findings-acl.177/) | ACL 공식 초록과 메타데이터 직접 확인 | 차트의 시각·논리 추론 benchmark라는 요지를 뒷받침한다. 차트 읽기 정확도가 사람의 가독성 보존을 인증하지 않는다. | 2026-09-19 |
| [4] | Hsiao et al., “ScreenQA: Large-Scale Question-Answer Pairs Over Mobile App Screenshots,” NAACL 2025 | [ACL Anthology](https://aclanthology.org/2025.naacl-long.477/) | ACL 공식 초록과 메타데이터 직접 확인 | 모바일 화면 질문과 UI 영역 연결을 뒷받침한다. 모바일 중심 데이터이므로 데스크톱 일반화의 직접 근거가 아니다. | 2026-09-19 |
| [5] | Gao et al., “QuietPrune: Query-Guided Early Token Pruning for Vision-Language Models,” CVPR 2026 | [CVF 공식 페이지](https://openaccess.thecvf.com/content/CVPR2026/html/Gao_QuietPrune_Query-Guided_Early_Token_Pruning_for_Vision-Language_Models_CVPR_2026_paper.html) | CVF 공식 초록의 검색 색인 확인. 페이지 직접 접근은 403; PDF/본문 미검토 | 질문 조건부 **모델 내부** ViT 토큰 pruning이라는 제한된 관련 요지를 뒷받침한다. 외부 래스터 전처리, MCP 전송, billing 또는 이 프로토콜의 guard/fallback을 입증하지 않는다. | 2026-09-19 |
| [6] | Wang et al., “Rethinking Token Reduction for Large Vision-Language Models,” CVPR 2026; MetaCompress arXiv:2603.21701v1 | [CVF 공식 목록](https://openaccess.thecvf.com/content/CVPR2026/html/Wang_Rethinking_Token_Reduction_for_Large_Vision-Language_Models_CVPR_2026_paper.html), [관련 arXiv 초록](https://arxiv.org/abs/2603.21701v1) | CVF 직접 페이지는 403. 관련 MetaCompress arXiv 2603.21701v1의 초록을 직접 확인해, 첫 질문에 편향된 축소가 후속 질문의 증거를 잃을 위험과 prompt-agnostic **모델 내부** 압축이라는 제한된 요지만 사용 | 미래 질문을 모르는 내부 token reduction의 위험을 생각하게 한다. 외부 이미지 변환 안전성이나 본 제안의 성능을 증명하지 않는다. CVF 본문은 미검토다. | 2026-09-19 |

## 사용 규칙

- [1]–[6]은 초안의 관련 연구를 위치시키는 출처다. 출처의 문제 정의를 이 방법의 측정 결과나 신규성
  우월성으로 확장하지 않는다.
- CVF 링크가 403이거나 검색 색인만 노출된 항목은 초록 수준 주장만 허용한다. 직접 읽지 않은 본문,
  표, 수치, 데이터 분할, 성능을 인용하지 않는다.
- ChartQA와 ScreenQA의 ACL 페이지, MetaCompress의 arXiv 페이지는 접근된 초록·메타데이터 범위에서만
  요약한다. 라이선스, 파일 hash, 데이터 취득은 별도 실행 gate다.
- 본 문서와 논문 초안은 “결과가 측정되지 않음”을 유지한다. 현재 저장소의 텍스트 테스트는 위 출처의
  모델 성능이나 이미지 경로의 안전성을 검증하지 않는다.
