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
- 등록 커밋 `a7066e4`. 측정 전 수정 1(물리 변환 재생 검증, PM 요청) `002a4f4`. Draft PR [#140](https://github.com/kimcheolhui9846/token-context-optimizer/pull/140)
- 측정(`002a4f4`에서 동결 대조 차이 0 뒤 실행)
  - 결과: [RESULTS.md](../../../research/results/r09-bilingual/RESULTS.md)
  - 주 비교(code 12쌍): EN 12/12, KO 11/12, KO−EN −1/12
  - 대조(nl 12쌍): EN 12/12, KO 0/12. 모두 불일치로 전체 프레임 반환했고, 이는 설계상 예상된 동작이다.
  - 전체 24쌍: KO−EN −13/24. 기술 결측 0
  - 유일한 KO code 실패: 한글 오독 조각이 축 행 규칙을 발동시켜, 답 값이 창 경계에서 2px 잘렸다.
- 재현
  - run-a와 run-b의 원시값, 집계, 재생 출력이 바이트 일치했다.
  - 오프라인 차단 0
  - Python 독립 검산 불일치 0
  - 재생 검증 48/48 유효(crop 36, 전체 12)
- 게이트
  - npm 7종 종료 0(4,562 통과, 5 건너뜀)
  - 연구 테스트 100/100
  - 빌드가 줄끝만 바꾼 `bin/` 파일은 되돌렸다.
- Argon APPROVE
- WBS는 수정하지 않았다. 지시대로 기존 24건의 분모와 상태를 유지했다. 이 연구를 WBS에 반영할지와 그 방식은 PM이 정한다.

## PM 검토 반영 (2026-11-23, `codex_review/review_2026-11-23_pr140-r09-bilingual-pm.md`)

- Major(Windows 새 작업 사본): `core.autocrlf=true`의 `git checkout-index`에서 입력 JSON 6개가 CRLF로 꺼내져 동결 대조가 실패함을 재현했다(`diffs` 6, 종료 1). `research/results/r09-bilingual/.gitattributes`(`* text=auto eol=lf`)를 더했다. 같은 설정의 새 checkout에서 65/65(입력 54 + 코드 11) 일치. 기존 blob·동결 SHA·측정값·코드·사전등록·결과는 바꾸지 않았다.
- Minor(공개 재현 안내): README가 공개 패키지 `@tesseract.js-data/eng@1.0.0`에서 OCR 자료를 준비하고 전체 SHA-256을 `sha256sum -c`로 검사한다. 출력은 새 폴더에 쓰고, 가드 기록 폴더를 먼저 만들며, 증거 폴더의 해시 전후 대조와 11개 산출물 `cmp`로 검산한다.
