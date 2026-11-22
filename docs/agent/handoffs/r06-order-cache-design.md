# R06 조건 순서·prefix 캐시·시간 효과 설계

- Tier E. 기준 main 459a509c에서 시작했다. R06은 실험 설계 단계다.
- 제공자별 신규 합성 세션 40개를 10개 순서로 균형 배정하는 [후속 설계](../../../research/plans/2026-11-22-r06-order-cache-design.md)를 작성했다.
- 오프라인 검증 요약: 순서표는 위치×조건 25칸 모두 2회, 방향 있는 인접쌍 20종 모두 2회다. 2차 모형 설계행렬은 직전 조건 5수준이면 200행·53열·rank 52로 alias, S0 기준 4대비면 52열·rank 52로 식별된다. 정밀도 예시 반폭은 σ=.25에서 9.3%p, .35에서 13.1%p, .50에서 18.7%p다(실측 아님).
- 새 관측: 기존 고정 순서에서 조건 간 캐시 이월이 있었다. Haiku S1은 24/24, S3는 5/24가 앞 조건의 prefix를 읽었고, GPT-4o S1 2턴은 14/24가 자기 1턴 프롬프트보다 긴 캐시를 읽었다. 기록상 출처는 같은 세션의 S0다.
- R06에서 실험 호출은 0건, 지출은 US$0이다. R07 실행 여부는 사용자 결정 대기다. 초안은 harness-sonnet-worker(실행 모델: claude-sonnet-5-5)가 작성했다.
- 독립 점검(claude-opus-5-5) 1차 CHANGES REQUIRED: Major 1(Anthropic SDK maxRetries 4 명시를 기본값으로 오기술), Minor 4(GPT S2 시도당 최대 호출 17, Haiku 초과 읽기 정의, 원고 제안 문장의 반사실·출처 표현, 캐시 출력 무영향 문서의 적용 범위)와 Note 3건(첫 위치 코딩, 근거 줄 번호, costUsd 캐시 미반영)을 원자료로 확인하고 고쳤다. 기존 고정 순서 자료의 세션별 S3−S1 SD(GPT-4o .250, Haiku .423)를 참고값으로 추가했다. 재점검 PASS WITH NOTES, Argon APPROVE.
- 프로젝트 게이트: npm ci·build·typecheck·smoke:mcp·validate:plugin·benchmark 통과. npm test는 전체 실행 3회 모두 tests/image-source-race.test.ts의 경합 테스트 1건만 실패했다(4,561 통과·5 건너뜀). 같은 파일 단독 실행은 5/5 통과했다. 이 PR은 문서만 바꾸므로 제품·테스트 코드는 main과 같다.
