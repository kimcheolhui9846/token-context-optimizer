# 고정 자르기 여백에 따른 근거 포함과 면적 비교

- Tier E. 제품 기준 `origin/main` `0fb3053`(#143 병합, 번들 blob `85b8049`). 2026-11-24 #141 개선 후보 2
- Orca Task `task_f7f071dfd4fd`. 연구 담당 Claude Code(Opus 5.5), PM Codex(Astra)
- 범위: 검토용 Draft PR까지. 실험 API 비용 0원. 기존 공개 합성 24쌍·48장 재사용, 로컬 측정
  - 범위 밖: 외부 데이터 전송, 신규 실험 API, 의존성 추가, 제품 변경, 제품 기본 여백 결정, Ready, merge
  - D04는 사용자 직접 송부 보류, O01·O02는 선행 대기
- 프로토콜: [research/plans/2026-11-24-crop-padding-replay-protocol.md](../../../research/plans/2026-11-24-crop-padding-replay-protocol.md)

## 계획

1. 프로토콜·핸드오프 커밋, Draft PR(실측 전)
2. 테스트 RED(손계산 사례) → 실행·동결·채점 코드 GREEN
3. 실행 A·B(오프라인 가드), 동결, 채점, Python 독립 검산, #141 p0 재생 대조
4. 결과표·재현 안내, 전체 게이트 7종
5. 독립 Opus 마일스톤 검토, Argon 대조, `fix(review)` 반영
6. 주 세션에 최신 SHA·근거 보고

## 역할과 소유 경로

| 역할 | 주체 | 파일 |
|---|---|---|
| 연구 작성·실행·채점 | Claude Code 메인(Opus 5.5) | `research/plans/*crop-padding-replay*`, `research/src/crop-padding-replay-*`, `research/test/crop-padding-replay*`, `research/results/crop-padding-replay/**`, 이 파일 |
| 독립 검산기 작성 | 별도 하위 에이전트(채점기 코드 비공개, 명세만 받음) | `research/tools/crop-padding-replay-recount.py` |
| 계획 검토 | Claude Code `harness-opus-review`(`claude-opus-5-5`) | PM 요청서 단계에서 완료 |
| 마일스톤 검토 | 독립 Opus 5.5 | 기록만 |
| 최종 판정 | PM Astra | |

다음은 읽기만 한다: 제품, #141 연구 파일, R09 자료, 원고, WBS.

## 검토 구분

| 검토 | 주체 | 상태 |
|---|---|---|
| 계획 검토 | Claude Opus 5.5(`harness-opus-review`) | 1차 CHANGES REQUIRED(Major 3, Minor 2), 재심 PASS WITH NOTES. 참고 의견 2건은 프로토콜 §12에 반영 |
| 마일스톤 검토 | Claude Opus 5.5, 독립 | 대기 |
| 프로젝트 교차 확인 | Argon(gemini-4-argon) | 대기 |
| 최종 판정 | PM Astra | 대기 |

## 진행

- [ ] 프로토콜·핸드오프 커밋, Draft PR
- [ ] 테스트 RED → GREEN
- [ ] 실행 A·B, 동결, 채점, 검산, #141 재생 대조
- [ ] 결과표·재현 안내, 게이트
- [ ] Opus 마일스톤 검토, Argon
