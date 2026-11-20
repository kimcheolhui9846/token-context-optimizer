# R03 저장 응답·요약 오류 감사

- Tier E. 기준 main f04d4b69. DQ4 사용자 선택은 Claude와 다른 제공자 모델의 별도 최초 판정이다.
- 계획을 Opus 5.5로 교차 검토했다. 표집·결측·유효 응답 보존에 관한 major 3건을 보완하고 PASS를 받았다.
- 모집단 1,920응답·192요약에서 60응답·24요약을 선정한다. 코드북, 표집, 최초 응답 검증 규칙을 실제 판정 전에 동결한다.
- 대상 파일은 research/plans/2026-11-20-r03-codebook.md 및 research/results/r03-error-audit/ 아래에 있다.

- 동결 7296f649. Claude Sonnet 5.5/OpenAI GPT-6.2 Sol의 최초 판정 84건씩을 보존했다. 응답 주분류 60/60, 요약 주분류 24/24 일치. 불일치 조정 0건.
- 모집단 종료 사유와 텍스트 절단을 분리해 보고했다. GPT-4o 요약 96개의 미기록은 unknown 유지. 연구 원자료와 원고는 변경하지 않았다.
- 결과와 독립 재계산 명령은 [감사 보고서](../../../research/results/r03-error-audit/README.md)에 있다. Draft 검토와 검증 기록은 PR 및 중앙 WBS에 반영한다.
