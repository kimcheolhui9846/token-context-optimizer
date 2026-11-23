# R09 후속 연구: 한영 문서 근거 영역 선택

- Tier E. 기준 main `7c9f4370`. 2026-11-23 사용자 승인: 합성 자료 24쌍, 로컬 실측, Draft PR까지, 실험 API 비용 0원.
- 이전 8쪽 심사본의 R09 비선택 결정과 별도인 연구다. 원고, 패키지, 제품, 기존 실험은 바꾸지 않았다. D04는 계속 보류다.
- 사전등록: [research/plans/2026-11-23-r09-bilingual-preregistration.md](../../../research/plans/2026-11-23-r09-bilingual-preregistration.md)
- 자료와 재현: [research/results/r09-bilingual/](../../../research/results/r09-bilingual/README.md)
- 코드
  - `research/src/r09-{design,lib,build,run,score,freeze}.mjs`
  - `research/tools/r09/{render,recount}.py`
  - 테스트 `research/test/r09-bilingual.test.mjs`
- RED/GREEN
  - 기준선: 기존 `run-guards` 5/5 통과
  - RED: 새 테스트가 `r09-lib.mjs` 부재로 실패
  - GREEN: 17/17 통과(기하 경계, 1px 절단, full-frame/no-match 분리, 기술 실패 보존, EN/KO 쌍·분모, 설계 불변식)
- 계획 검토는 Claude Opus 5.5(3차 PASS WITH NOTES)다. 계획·판정 PM은 Astra다.
- 측정 결과, 재현 검산, 독립 검토는 등록 커밋 이후 이 파일과 PR에 추가한다.
