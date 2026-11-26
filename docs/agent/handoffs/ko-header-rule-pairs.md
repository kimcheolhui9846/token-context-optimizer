# 한국어 표의 구분선 이동 짝비교

- Tier E. [사전등록](../../../research/plans/2026-11-26-ko-header-rule-pairs.md) · [18장 결과와 재현 방법](../../../research/results/ko-header-rule-pairs/README.md) · [Draft #162](https://github.com/kimcheolhui9846/token-context-optimizer/pull/162).
- #160 원본 3개에 기존·이동 구분선과 3개 별관 조건을 조합했다. 소스, 질문, 로컬 OCR, W5·전체 폭·두 창을 추적했다. 제품 코드와 논문 변경은 없다.
- 실제 기회는 잉크 겹침 없는 별관 배치 6장 중 같은 원본의 2장이다. 별관 89의 노출이 각각 143→0픽셀로 줄고 다섯 단서가 남았다. 적용 여부가 바뀐 쌍은 0/9였다.
- 보호 판정의 같은 이미지 기준을 명시하고, 실행 전 등록 파일 추적 및 OCR 엔진 검증, 4단계 오프라인 가드를 보완했다. Claude Code `claude-opus-5-5` 계획·고정 전 구현 점검 PASS. 과학 코드·기준은 `d3ab52e`에서 원격 고정했다.
- GPT-6.2 Sol은 판정·시험, Claude Code `claude-sonnet-5-5`는 이미지 합성·시험을 작성했다. 두 모듈 부재로 RED 확인 후 시험 11+17개가 통과했다.
- 독립 마일스톤은 `claude-opus-5-5` PASS, blocker/major 0. 독립 검산과 28개 시험을 직접 실행해 결과를 확인했다. 2회, 82개 공개 파일 총 1,005,712바이트 동일. 실험 API 지출 0원, GPU 사용 없음. 별도 Argon 호출은 추가 비용 0원을 확인할 수 없어 생략했다.
- 저장소 검증은 연구 JS 173개, 기존 연구 Python 32+15+15개 통과. 제품 빌드·타입·MCP·패키지·벤치마크 통과. Windows 파일 교체 시험에서 예상 `source_changed` 대신 `read_failure`가 나와 첫 전체 및 단독 시험이 실패했다. 전체 재실행은 4,639개 통과·5개 건너뜀. 연구 결과와 분리해 제품 후속 과제로 남긴다.
- 최종 판정은 PASS WITH NOTES. 새 양식·사람의 정답률·제품 기본값으로 일반화하지 않는다. WBS의 실행계획 K24에는 후속 연구 메모를 추가한다. Ready·병합은 사용자 결정 사항이다.
